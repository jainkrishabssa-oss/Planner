// Storage + sync layer. Firebase (Auth + Firestore with offline cache), or a local demo store.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc,
  setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

export function firebaseBackend(config) {
  const app = initializeApp(config);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  let db;
  try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { db = initializeFirestore(app, {}); }
  let uid = null, unsubs = [];
  const body = o => { const { id, ...rest } = o; return rest; };
  const fail = onErr => e => onErr && onErr(e);
  return {
    kind: 'firebase',
    onUser(cb) { return onAuthStateChanged(auth, u => { uid = u ? u.uid : null; cb(u ? { uid: u.uid, email: u.email } : null); }); },
    signIn: (e, p) => signInWithEmailAndPassword(auth, e, p),
    signUp: (e, p) => createUserWithEmailAndPassword(auth, e, p),
    reset: e => sendPasswordResetEmail(auth, e),
    signOut: () => { unsubs.forEach(u => u()); unsubs = []; return signOut(auth); },
    subscribe(onTasks, onProjects, onStatus, onErr) {
      unsubs.forEach(u => u()); unsubs = [];
      const st = { tasks: null, projects: null };
      const report = () => { const a = st.tasks, b = st.projects; if (!a || !b) return;
        onStatus({ fromCache: a.fromCache || b.fromCache, pending: a.pending || b.pending }); };
      const watch = (name, cb) => onSnapshot(collection(db, 'users', uid, name), { includeMetadataChanges: true }, snap => {
        st[name] = { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites };
        cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))); report();
      }, fail(onErr));
      unsubs.push(watch('tasks', onTasks), watch('projects', onProjects));
    },
    // Writes resolve only when the server confirms; offline they wait, so don't await them.
    putTask: (t, onErr) => { setDoc(doc(db, 'users', uid, 'tasks', t.id), body(t)).catch(fail(onErr)); },
    delTask: (id, onErr) => { deleteDoc(doc(db, 'users', uid, 'tasks', id)).catch(fail(onErr)); },
    putProject: (p, onErr) => { setDoc(doc(db, 'users', uid, 'projects', p.id), body(p)).catch(fail(onErr)); },
    delProject: (id, onErr) => { deleteDoc(doc(db, 'users', uid, 'projects', id)).catch(fail(onErr)); },
  };
}

// Demo mode: everything stays in this browser. Used to try the app before Firebase is set up.
export function demoBackend() {
  const K = { tasks: 'mp.demo.tasks', projects: 'mp.demo.projects' };
  const load = k => { try { return JSON.parse(localStorage.getItem(K[k]) || '[]'); } catch (e) { return []; } };
  const data = { tasks: new Map(load('tasks').map(x => [x.id, x])), projects: new Map(load('projects').map(x => [x.id, x])) };
  let cbs = {};
  const save = k => { try { localStorage.setItem(K[k], JSON.stringify([...data[k].values()])); } catch (e) {} ;
    (k === 'tasks' ? cbs.t : cbs.p)?.([...data[k].values()].map(x => ({ ...x }))); };
  return {
    kind: 'demo',
    onUser(cb) { setTimeout(() => cb({ uid: 'demo', email: 'Demo mode' }), 0); return () => {}; },
    signOut: async () => {},
    subscribe(onTasks, onProjects, onStatus) { cbs = { t: onTasks, p: onProjects }; save('tasks'); save('projects'); onStatus({ demo: true }); },
    putTask: t => { data.tasks.set(t.id, { ...t }); save('tasks'); },
    delTask: id => { data.tasks.delete(id); save('tasks'); },
    putProject: p => { data.projects.set(p.id, { ...p }); save('projects'); },
    delProject: id => { data.projects.delete(id); save('projects'); },
  };
}
