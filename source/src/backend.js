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
    subscribe(on, onStatus, onErr) {
      unsubs.forEach(u => u()); unsubs = [];
      const st = { tasks: null, projects: null, routines: null };
      const report = () => { const v = Object.values(st); if (v.some(x => !x)) return;
        onStatus({ fromCache: v.some(x => x.fromCache), pending: v.some(x => x.pending) }); };
      const watch = (name, cb) => onSnapshot(collection(db, 'users', uid, name), { includeMetadataChanges: true }, snap => {
        st[name] = { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites };
        cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))); report();
      }, fail(onErr));
      unsubs.push(watch('tasks', on.tasks), watch('projects', on.projects), watch('routines', on.routines));
    },
    // Writes resolve only when the server confirms; offline they wait, so don't await them.
    putTask: (t, onErr) => { setDoc(doc(db, 'users', uid, 'tasks', t.id), body(t)).catch(fail(onErr)); },
    delTask: (id, onErr) => { deleteDoc(doc(db, 'users', uid, 'tasks', id)).catch(fail(onErr)); },
    putProject: (p, onErr) => { setDoc(doc(db, 'users', uid, 'projects', p.id), body(p)).catch(fail(onErr)); },
    delProject: (id, onErr) => { deleteDoc(doc(db, 'users', uid, 'projects', id)).catch(fail(onErr)); },
    putRoutine: (r, onErr) => { setDoc(doc(db, 'users', uid, 'routines', r.id), body(r)).catch(fail(onErr)); },
    delRoutine: (id, onErr) => { deleteDoc(doc(db, 'users', uid, 'routines', id)).catch(fail(onErr)); },
  };
}

// Demo mode: everything stays in this browser. Used to try the app before Firebase is set up.
export function demoBackend() {
  const K = { tasks: 'mp.demo.tasks', projects: 'mp.demo.projects', routines: 'mp.demo.routines' };
  const load = k => { try { return JSON.parse(localStorage.getItem(K[k]) || '[]'); } catch (e) { return []; } };
  const data = {}; Object.keys(K).forEach(k => { data[k] = new Map(load(k).map(x => [x.id, x])); });
  let cbs = {};
  const save = k => { try { localStorage.setItem(K[k], JSON.stringify([...data[k].values()])); } catch (e) {} ;
    cbs[k]?.([...data[k].values()].map(x => JSON.parse(JSON.stringify(x)))); };
  return {
    kind: 'demo',
    onUser(cb) { setTimeout(() => cb({ uid: 'demo', email: 'Demo mode' }), 0); return () => {}; },
    signOut: async () => {},
    subscribe(on, onStatus) { cbs = on; Object.keys(K).forEach(save); onStatus({ demo: true }); },
    putTask: t => { data.tasks.set(t.id, { ...t }); save('tasks'); },
    delTask: id => { data.tasks.delete(id); save('tasks'); },
    putProject: p => { data.projects.set(p.id, { ...p }); save('projects'); },
    delProject: id => { data.projects.delete(id); save('projects'); },
    putRoutine: r => { data.routines.set(r.id, JSON.parse(JSON.stringify(r))); save('routines'); },
    delRoutine: id => { data.routines.delete(id); save('routines'); },
  };
}
