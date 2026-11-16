import { firebaseBackend, demoBackend } from './backend.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const pd=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
const addDays=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return iso(d)};
const diff=(a,b)=>Math.round((pd(b)-pd(a))/864e5);
const fmt=(s,o)=>pd(s).toLocaleDateString(undefined,o||{weekday:'short',month:'short',day:'numeric'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ls={get(k,d){try{return localStorage.getItem(k)??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const PR={critical:0,high:1,normal:2}, PRN={critical:'Critical',high:'High',normal:'Normal'};
const ST={todo:'To do',doing:'Doing',waiting:'Waiting',done:'Done'}, AR={work:'Work',personal:'Personal'};
const CHECK='<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><path d="M5 10.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DOWS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

let today=iso(new Date());
let tasks=new Map(), be=null, mode='loading', pending=false, flash='', clearArm=0;
let view=ls.get('mp.view','today'), area=ls.get('mp.area','all'), openId=null, openProj=null;
let draft={when:'today',custom:'',area:ls.get('mp.newArea','work'),pri:'normal'};
const CATS=['Client','Internal','Admin','Planning','Finance','Health','Home','Travel','Learning'];
let projects=new Map(), pform=null, pcat='all', pdelArm=0, PIDX=new Map();
const same=(a,b)=>(a||'').trim().toLowerCase()===(b||'').trim().toLowerCase();
function projList(){const m=new Map();projects.forEach(p=>{const k=(p.title||'').trim().toLowerCase();if(k)m.set(k,{...p,key:k})});
  tasks.forEach(t=>{const k=(t.project||'').trim().toLowerCase();if(k&&!m.has(k))m.set(k,{id:null,key:k,title:t.project.trim(),area:t.area||'work',company:'',category:''})});
  return [...m.values()].sort((a,b)=>a.title.localeCompare(b.title))}
const projByTitle=t=>projList().find(p=>p.key===(t||'').trim().toLowerCase());
function persistP(id){const p=projects.get(id);if(!be)return;p?be.putProject(p,fail):be.delProject(id,fail)}
function ensureProject(title,ar){if(!title||[...projects.values()].some(p=>same(p.title,title)))return;
  const p={id:newId(),title,area:ar,company:'',category:'',created:Date.now()};projects.set(p.id,p);persistP(p.id)}

const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const all=()=>[...tasks.values()].filter(t=>area==='all'||t.area===area);
const key=t=>t.due||'9999-99-99';
const sortT=(a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:(PR[a.priority]-PR[b.priority])||((a.created||0)-(b.created||0));

function setSync(text,cls){const s=$('#sync');s.className='sync '+(cls||'');s.lastElementChild.textContent=text}
function toast(msg,undo){const t=$('#toast');t.firstElementChild.textContent=msg;const b=t.lastElementChild;b.hidden=!undo;b.onclick=()=>{t.hidden=true;undo&&undo()};t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,5000)}
function fail(e){toast('Couldn’t save: '+((e&&(e.code||e.message))||'try again'))}

function persist(id){const t=tasks.get(id);if(!be)return;t?be.putTask(t,fail):be.delTask(id,fail)}
function dueFromDraft(){return {today:today,tomorrow:addDays(today,1),week:addDays(today,7),none:'',custom:draft.custom}[draft.when]??''}

function parseQ(s){const o={};
  s=s.replace(/(^|\s)#([\w\-]+)/g,(m,a,p)=>{o.project=p.replace(/[-_]+/g,' ');return a});
  s=s.replace(/(^|\s)@(work|personal)(?=\s|$)/gi,(m,a,p)=>{o.area=p.toLowerCase();return a});
  s=s.replace(/(^|\s)!{1,3}(?=\s|$)/g,(m,a)=>{o.priority='critical';return a});
  s=s.replace(/(^|\s)(today|tomorrow|tmrw)(?=\s|$)/i,(m,a,w)=>{o.due=w.toLowerCase()==='today'?today:addDays(today,1);return a});
  s=s.replace(/(^|\s)(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?=\s|$)/i,(m,a,w)=>{const n=(DOWS.indexOf(w.toLowerCase())-pd(today).getDay()+7)%7||7;o.due=addDays(today,n);return a});
  o.title=s.replace(/\s+/g,' ').trim();return o}

function dueLabel(t){if(!t.due)return '';const d=diff(today,t.due);
  if(t.status!=='done'&&d<0)return `<span class="od">Overdue ${-d}d &middot; ${fmt(t.due,{month:'short',day:'numeric'})}</span>`;
  if(d===0)return '<span class="td">Today</span>';if(d===1)return '<span>Tomorrow</span>';return `<span>${fmt(t.due)}</span>`}
function row(t){const done=t.status==='done';const m=[dueLabel(t)];
  if(!done&&t.priority!=='normal')m.push(`<span class="pill ${t.priority==='critical'?'c':'h'}">${PRN[t.priority]}</span>`);
  if(!done&&(t.status==='doing'||t.status==='waiting'))m.push(`<span class="pill s">${ST[t.status]}</span>`);
  if(t.project){const pj=PIDX.get(t.project.trim().toLowerCase());m.push(`<span>${pj&&pj.company?esc(pj.company)+' &middot; ':''}${esc(t.project)}</span>`)}
  m.push(`<span class="tag ${t.area}"><i class="dot"></i>${AR[t.area]||''}</span>`);
  return `<div class="task ${t.priority} ${done?'done':''} ${t.id===flash?'new':''}" data-id="${t.id}">
<button class="ck" data-act="toggle" aria-label="${done?'Mark not done':'Mark done'}: ${esc(t.title)}"><i>${done?CHECK:''}</i></button>
<div class="body" data-act="open" tabindex="0"><div class="t">${esc(t.title)}</div><div class="meta">${m.filter(Boolean).join('')}</div>${t.notes&&openId!==t.id?`<div class="note">${esc(t.notes)}</div>`:''}</div>
${openId===t.id?editor(t):''}</div>`}
const opts=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}"${k===v?' selected':''}>${l}</option>`).join('');
function editor(t){return `<div class="edit">
<label class="full">Task<input data-f="title" value="${esc(t.title)}"></label>
<label>Due date<input type="date" data-f="due" value="${t.due||''}"></label>
<label>Priority<select data-f="priority">${opts(PRN,t.priority)}</select></label>
<label>Status<select data-f="status">${opts(ST,t.status)}</select></label>
<label>Area<select data-f="area">${opts(AR,t.area)}</select></label>
<label class="full">Project<input data-f="project" list="projlist" value="${esc(t.project)}"></label>
<label class="full">Notes<textarea data-f="notes" rows="2">${esc(t.notes)}</textarea></label>
<div class="acts full"><button class="ghost" data-act="del">Delete</button><button class="btn" data-act="close">Done editing</button></div></div>`}
const sec=(title,list,cls)=>list.length?`<h2 class="${cls||''}"><span>${title}</span><span>${list.length}</span></h2>${list.sort(sortT).map(row).join('')}`:'';
const empty=(a,b)=>`<div class="empty"><b>${a}</b>${b}</div>`;

function todayParts(open){const od=open.filter(t=>t.due&&t.due<today),td=open.filter(t=>t.due===today),
  cr=open.filter(t=>t.priority==='critical'&&(!t.due||t.due>today)),dg=open.filter(t=>t.status==='doing'&&!od.includes(t)&&!td.includes(t)&&!cr.includes(t));return {od,td,cr,dg}}

function projCard(p){const l=[...tasks.values()].filter(t=>same(t.project,p.title)),o=l.filter(t=>t.status!=='done'),od=o.filter(t=>t.due&&t.due<today).length,next=o.map(t=>t.due).filter(Boolean).sort()[0];
  const pct=l.length?Math.round((l.length-o.length)/l.length*100):0,open=openProj===p.key;
  const sub=[p.category?`<span class="pill k">${esc(p.category)}</span>`:'',od?`<span class="od">${od} overdue</span>`:'',next?'Next: '+fmt(next):'',l.length&&!o.length?'All done':'',!l.length?'No tasks yet':''].filter(Boolean).join(' &middot; ');
  return `<button class="proj" data-act="proj" data-p="${esc(p.key)}" aria-expanded="${open}"><b>${esc(p.title)}</b><span class="n">${o.length}</span><span class="sub">${sub}</span><span class="sub" style="text-align:right">open</span><span class="meter"><i style="width:${pct}%"></i></span></button>`+
  (open?`<div class="inproj">${o.sort(sortT).map(row).join('')||'<p class="hint">No open tasks.</p>'}<div class="acts"><button class="link" data-act="addto" data-p="${esc(p.key)}">+ Add a task</button><button class="link" data-act="pedit" data-p="${esc(p.key)}">Edit project</button></div></div>`:'')}
function pformHtml(){const p=pform.key?projByTitle(pform.key):null,ar=p?p.area:(area==='personal'?'personal':'work');
  return `<div class="pform" id="pform"><h3>${p?'Edit project':'New project'}</h3>
<label class="full">Project title<input id="pf-title" value="${esc(p?p.title:'')}" placeholder="e.g. Website redesign"></label>
<div class="full seg" role="group" aria-label="Work or personal"><button type="button" data-pfa="work" aria-pressed="${ar==='work'}">Work</button><button type="button" data-pfa="personal" aria-pressed="${ar==='personal'}">Personal</button></div>
<label id="pf-co-wrap"${ar==='personal'?' hidden':''}>Company<input id="pf-co" list="companylist" value="${esc(p?p.company:'')}" placeholder="e.g. Acme Corp"></label>
<label>Category<input id="pf-cat" list="catlist" value="${esc(p?p.category:'')}" placeholder="Pick one or type your own"></label>
<div class="acts full"><span>${p?'<button class="ghost" data-act="pdel">Delete project</button>':''}</span><span style="display:flex;gap:8px"><button class="chip" data-act="pcancel">Cancel</button><button class="btn" data-act="psave">Save project</button></span></div></div>`}

function render(){
  if(document.activeElement&&document.activeElement.closest('.edit,.pform')){pending=true;return}
  pending=false;const PLall=projList();PIDX=new Map(PLall.map(p=>[p.key,p]));
  $('#dow').textContent=fmt(today,{weekday:'long'});$('#date').textContent=fmt(today,{month:'long',day:'numeric'});
  const A=all(),open=A.filter(t=>t.status!=='done'),P=todayParts(open);
  const wk=open.filter(t=>t.due>today&&t.due<=addDays(today,7)).length;
  $('#tally').innerHTML=`<button class="od" data-go="today"><b>${P.od.length}</b><span>Overdue</span></button><button data-go="today"><b>${P.td.length}</b><span>Due today</span></button><button data-go="upcoming"><b>${wk}</b><span>Next 7 days</span></button>`;
  const nToday=P.od.length+P.td.length+P.cr.length+P.dg.length,nUp=open.filter(t=>!t.due||t.due>today).length,nDone=A.length-open.length;
  const projs=PLall.filter(p=>area==='all'||p.area===area);
  $('#tabs').innerHTML=[['today','Today',nToday],['upcoming','Upcoming',nUp],['projects','Projects',projs.length],['done','Done',nDone]].map(([k,l,n])=>`<button class="tab" role="tab" data-v="${k}" aria-selected="${view===k}">${l}<small>${n}</small></button>`).join('');
  $$('#seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.a===area));
  $$('[data-when]').forEach(b=>b.setAttribute('aria-pressed',draft.when===b.dataset.when));
  $('#cdate').setAttribute('aria-pressed',draft.when==='custom');
  $$('[data-area]').forEach(b=>b.setAttribute('aria-pressed',draft.area===b.dataset.area));
  $$('[data-pri]').forEach(b=>b.setAttribute('aria-pressed',draft.pri===b.dataset.pri));
  $('#projlist').innerHTML=PLall.map(p=>`<option value="${esc(p.title)}" label="${esc([p.company,p.category].filter(Boolean).join(' · ')||AR[p.area]||'')}">`).join('');
  $('#companylist').innerHTML=[...new Set(PLall.map(p=>p.company).filter(Boolean))].sort().map(c=>`<option value="${esc(c)}">`).join('');
  $('#catlist').innerHTML=[...new Set([...PLall.map(p=>p.category).filter(Boolean),...CATS])].map(c=>`<option value="${esc(c)}">`).join('');
  let h='';
  if(mode==='loading')h=empty('Loading your tasks…','');
  else if(view==='today'){h=sec('Overdue',P.od,'od')+sec('Due today',P.td)+sec('Critical, coming up',P.cr)+sec('In progress',P.dg)
    ||empty('Nothing on your plate today','Add a task above, or look at Upcoming.')}
  else if(view==='upcoming'){const fut=open.filter(t=>t.due>today).sort(sortT),lim=addDays(today,14),g=new Map();
    fut.filter(t=>t.due<=lim).forEach(t=>{g.has(t.due)||g.set(t.due,[]);g.get(t.due).push(t)});
    g.forEach((l,d)=>{h+=sec((diff(today,d)===1?'Tomorrow · ':'')+fmt(d,{weekday:'long',month:'short',day:'numeric'}),l)});
    h+=sec('Later',fut.filter(t=>t.due>lim))+sec('No date yet',open.filter(t=>!t.due));
    h=h||empty('Nothing coming up','Tasks with a future date, or no date, show here.')}
  else if(view==='projects'){
    const shownAll=projs,cats=[...new Set(shownAll.map(p=>p.category).filter(Boolean))].sort();
    if(pcat!=='all'&&!cats.includes(pcat))pcat='all';
    h=`<div class="pbar"><button class="btn" data-act="pnew">+ New project</button>${cats.length?['all',...cats].map(c=>`<button class="chip" data-act="pcat" data-c="${esc(c)}" aria-pressed="${pcat===c}">${c==='all'?'All categories':esc(c)}</button>`).join(''):''}</div>`;
    if(pform)h+=pformHtml();
    const shown=shownAll.filter(p=>pcat==='all'||p.category===pcat),groups=new Map();
    shown.forEach(p=>{const g=p.area==='personal'?'Personal':(p.company||'Work, no company yet');groups.has(g)||groups.set(g,[]);groups.get(g).push(p)});
    [...groups.keys()].sort((x,y)=>(x==='Personal')-(y==='Personal')||x.localeCompare(y)).forEach(g=>{h+=`<h2><span>${esc(g)}</span><span>${groups.get(g).length}</span></h2>`+groups.get(g).map(projCard).join('')});
    const loose=A.filter(t=>!t.project&&t.status!=='done');
    if(loose.length&&pcat==='all')h+=sec('Not in a project',loose);
    if(!shown.length&&!loose.length&&!pform)h+=empty('No projects yet','Tap New project, or type #name when you add a task.')}
  else{const d=A.filter(t=>t.status==='done').sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
    h=d.length?`<div class="bar"><span class="hint">${d.length} finished</span><button class="link" data-act="clear">${clearArm?'Tap again to delete them':'Clear finished tasks'}</button></div>`+d.map(row).join(''):empty('Nothing finished yet','Tick a task to move it here.')}
  $('#list').innerHTML=h;flash='';
}

/* add bar */
$('#add').addEventListener('submit',e=>{e.preventDefault();const p=parseQ($('#q').value);if(!p.title)return;
  const pr=(p.project||$('#proj').value||'').trim(),pj=pr&&projByTitle(pr);
  const t={id:newId(),title:p.title,due:p.due??dueFromDraft(),priority:p.priority||draft.pri,status:'todo',project:pj?pj.title:pr,area:p.area||(pj?pj.area:draft.area),notes:'',created:Date.now(),doneAt:0};
  tasks.set(t.id,t);persist(t.id);ensureProject(t.project,t.area);flash=t.id;$('#q').value='';draft.pri='normal';
  const P=todayParts([t]);const inToday=P.od.length+P.td.length+P.cr.length>0;
  if(view==='done'||(view==='today'&&!inToday)||(view==='upcoming'&&inToday&&t.due===today)||(area!=='all'&&area!==t.area))toast('Added'+(t.due?' for '+fmt(t.due):'')+(inToday?' · shows in Today':' · shows in Upcoming'));
  render()});
document.addEventListener('click',e=>{const b=e.target.closest('[data-when],[data-area],[data-pri],[data-a],[data-v],[data-go]');if(!b)return;
  if(b.dataset.when){draft.when=b.dataset.when;$('#cdate').value=''}
  if(b.dataset.area){draft.area=b.dataset.area;ls.set('mp.newArea',draft.area)}
  if(b.dataset.pri)draft.pri=b.dataset.pri;
  if(b.dataset.a){area=b.dataset.a;ls.set('mp.area',area)}
  if(b.dataset.v||b.dataset.go){view=b.dataset.v||b.dataset.go;openId=null;ls.set('mp.view',view)}
  render()});
$('#proj').addEventListener('change',e=>{const p=projByTitle(e.target.value);if(p){draft.area=p.area;render()}});
$('#cdate').addEventListener('change',e=>{if(e.target.value){draft.when='custom';draft.custom=e.target.value}else draft.when='none';render()});

function saveProject(){const title=$('#pf-title').value.trim();if(!title){$('#pf-title').focus();return}
  const ar=$('[data-pfa][aria-pressed="true"]').dataset.pfa,company=ar==='work'?$('#pf-co').value.trim():'',category=$('#pf-cat').value.trim();
  const old=pform.key?projByTitle(pform.key):null;
  const clash=projList().find(p=>p.key===title.toLowerCase()&&(!old||p.key!==old.key));if(clash){toast('You already have a project called '+clash.title);return}
  let rec=old&&old.id?projects.get(old.id):null;if(!rec){rec={id:newId(),created:Date.now()};projects.set(rec.id,rec)}
  Object.assign(rec,{title,area:ar,company,category});persistP(rec.id);
  if(old)tasks.forEach(t=>{if(same(t.project,old.title)&&(t.project!==title||t.area!==ar)){t.project=title;t.area=ar;persist(t.id)}});
  if(!old||openProj===old.key)openProj=title.toLowerCase();
  pform=null;document.activeElement.blur();render();toast(old?'Project updated':'Project added · tap it to add tasks')}

/* list actions */
const L=$('#list');
L.addEventListener('click',e=>{const pa=e.target.closest('[data-pfa]');if(pa){$$('[data-pfa]').forEach(x=>x.setAttribute('aria-pressed',x===pa));$('#pf-co-wrap').hidden=pa.dataset.pfa==='personal';return}
  const b=e.target.closest('[data-act]');if(!b)return;const el=b.closest('[data-id]'),id=el&&el.dataset.id,t=id&&tasks.get(id);
  const a=b.dataset.act;
  if(a==='toggle'&&t){const prev={status:t.status,doneAt:t.doneAt};const done=t.status!=='done';t.status=done?'done':'todo';t.doneAt=done?Date.now():0;persist(id);render();
    if(done)toast('Done: '+t.title,()=>{Object.assign(t,prev);persist(id);render()})}
  else if(a==='open'&&t){if(e.target.closest('.edit'))return;openId=openId===id?null:id;render()}
  else if(a==='close'){openId=null;render()}
  else if(a==='del'&&t){const copy={...t};tasks.delete(id);openId=null;persist(id);render();toast('Deleted: '+copy.title,()=>{tasks.set(id,copy);persist(id);render()})}
  else if(a==='proj'){openProj=openProj===b.dataset.p?null:b.dataset.p;render()}
  else if(a==='addto'){const p=projByTitle(b.dataset.p);if(p){$('#proj').value=p.title;draft.area=p.area}render();$('#q').focus();$('#q').scrollIntoView({block:'center'})}
  else if(a==='pnew'||a==='pedit'){pform=a==='pedit'?{key:b.dataset.p}:{};clearTimeout(pdelArm);pdelArm=0;render();const f=$('#pform');f.scrollIntoView&&f.scrollIntoView({block:'nearest'});$('#pf-title').focus()}
  else if(a==='pcancel'){pform=null;render()}
  else if(a==='pcat'){pcat=b.dataset.c;render()}
  else if(a==='psave')saveProject();
  else if(a==='pdel'){if(!pdelArm){b.textContent='Tap again to delete';pdelArm=setTimeout(()=>{pdelArm=0;b.textContent='Delete project'},4000);return}
    clearTimeout(pdelArm);pdelArm=0;const old=projByTitle(pform.key);if(!old)return;
    if(old.id){projects.delete(old.id);persistP(old.id)}
    tasks.forEach(t=>{if(same(t.project,old.title)){t.project='';persist(t.id)}});
    pform=null;openProj=null;document.activeElement.blur();render();toast('Project deleted · its tasks are now under Not in a project')}
  else if(a==='clear'){if(!clearArm){clearArm=setTimeout(()=>{clearArm=0;render()},4000);render();return}
    clearTimeout(clearArm);clearArm=0;all().filter(x=>x.status==='done').forEach(x=>{tasks.delete(x.id);persist(x.id)});render();toast('Finished tasks cleared')}});
L.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.body')){e.preventDefault();e.target.click()}});
L.addEventListener('change',e=>{const f=e.target.dataset.f;if(!f)return;const id=e.target.closest('[data-id]').dataset.id,t=tasks.get(id);if(!t)return;
  let v=e.target.value;if(f==='title'){v=v.trim();if(!v){e.target.value=t.title;return}}if(f==='project')v=v.trim();
  if(t[f]===v)return;t[f]=v;if(f==='status')t.doneAt=v==='done'?Date.now():0;persist(id);if(f==='project')ensureProject(v,t.area)});
L.addEventListener('focusout',()=>setTimeout(()=>{if(pending&&!(document.activeElement&&document.activeElement.closest('.edit')))render()},0));

/* keep "today" fresh */
const tick=()=>{const n=iso(new Date());if(n!==today){today=n;render()}};
setInterval(tick,60000);document.addEventListener('visibilitychange',tick);


/* ---------- sync status ---------- */
let lastStatus={};
function showStatus(s){if(s)lastStatus=s;s=lastStatus;
  if(s.demo)return setSync('Demo — saved in this browser only','warn');
  if(!navigator.onLine)return setSync(s.pending?'Offline — changes saved, will sync':'Offline — showing saved copy','warn');
  if(s.pending)return setSync('Saving…','ok');
  if(s.fromCache)return setSync('Connecting…','');
  setSync('Synced','ok')}
addEventListener('online',()=>showStatus());addEventListener('offline',()=>showStatus());

/* ---------- account menu: backup, sign out ---------- */
const menu=$('#menu');
$('#acct').addEventListener('click',()=>{menu.hidden=!menu.hidden});
document.addEventListener('click',e=>{if(!menu.hidden&&!e.target.closest('#menu,#acct'))menu.hidden=true});
$('#m-export').addEventListener('click',()=>{const data={app:'my-planner',version:1,exported:new Date().toISOString(),tasks:[...tasks.values()],projects:[...projects.values()]};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='my-planner-backup-'+today+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);menu.hidden=true});
$('#m-import').addEventListener('click',()=>{$('#importfile').click()});
$('#importfile').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';menu.hidden=true;if(!f)return;
  try{const d=JSON.parse(await f.text());const ts=Array.isArray(d.tasks)?d.tasks:[],ps=Array.isArray(d.projects)?d.projects:[];
    let n=0;ts.forEach(t=>{if(t&&t.id&&t.title){const c={id:String(t.id),title:String(t.title),due:t.due||'',priority:PR[t.priority]!=null?t.priority:'normal',status:ST[t.status]?t.status:'todo',project:t.project||'',area:t.area==='personal'?'personal':'work',notes:t.notes||'',created:t.created||Date.now(),doneAt:t.doneAt||0};tasks.set(c.id,c);persist(c.id);n++}});
    ps.forEach(p=>{if(p&&p.id&&p.title){const c={id:String(p.id),title:String(p.title),area:p.area==='personal'?'personal':'work',company:p.company||'',category:p.category||'',created:p.created||Date.now()};projects.set(c.id,c);persistP(c.id)}});
    render();toast('Imported '+n+' tasks')}catch(err){toast('That file isn’t a planner backup')}});
$('#m-out').addEventListener('click',async()=>{menu.hidden=true;await be.signOut();if(be.kind==='demo'){location.href=location.pathname}});

/* ---------- sign in ---------- */
const authBox=$('#auth');
function showAuth(on){authBox.hidden=!on;$('#app').hidden=on}
let authMode='in';
function setAuthMode(m){authMode=m;$('#a-title').textContent=m==='in'?'Sign in to your planner':'Create your account';
  $('#a-go').textContent=m==='in'?'Sign in':'Create account';$('#a-switch').textContent=m==='in'?'New here? Create an account':'Already have an account? Sign in';
  $('#a-pass').autocomplete=m==='in'?'current-password':'new-password';$('#a-msg').textContent=''}
$('#a-switch').addEventListener('click',()=>setAuthMode(authMode==='in'?'up':'in'));
const authErr=e=>({'auth/invalid-credential':'Wrong email or password.','auth/wrong-password':'Wrong email or password.','auth/user-not-found':'No account with that email yet — create one.',
  'auth/email-already-in-use':'That email already has an account — sign in instead.','auth/weak-password':'Use at least 6 characters for the password.',
  'auth/invalid-email':'That email doesn’t look right.','auth/network-request-failed':'No internet connection. Signing in the first time needs internet.',
  'auth/too-many-requests':'Too many tries. Wait a minute and try again.','auth/operation-not-allowed':'Email sign-in isn’t switched on in Firebase yet (see setup step 3).'}[e&&e.code]||('Something went wrong: '+((e&&e.code)||e)));
$('#a-form').addEventListener('submit',async e=>{e.preventDefault();const em=$('#a-email').value.trim(),pw=$('#a-pass').value;const btn=$('#a-go');btn.disabled=true;$('#a-msg').textContent='';
  try{authMode==='in'?await be.signIn(em,pw):await be.signUp(em,pw)}catch(err){$('#a-msg').textContent=authErr(err)}btn.disabled=false});
$('#a-reset').addEventListener('click',async()=>{const em=$('#a-email').value.trim();if(!em){$('#a-msg').textContent='Type your email above first.';return}
  try{await be.reset(em);$('#a-msg').textContent='Check your inbox for a password reset link.'}catch(err){$('#a-msg').textContent=authErr(err)}});

/* ---------- start ---------- */
function start(){
  const cfg=window.PLANNER_FIREBASE_CONFIG||{};const demo=new URLSearchParams(location.search).has('demo');
  const ready=cfg.apiKey&&!/PASTE/i.test(cfg.apiKey);
  if(!ready&&!demo){$('#setup').hidden=false;$('#app').hidden=true;return}
  try{be=ready&&!demo?firebaseBackend(cfg):demoBackend()}catch(e){$('#setup').hidden=false;$('#setup-msg').textContent='Firebase settings in config.js could not be read: '+(e.code||e.message);$('#app').hidden=true;return}
  setAuthMode('in');
  be.onUser(u=>{
    if(!u){showAuth(true);tasks=new Map();projects=new Map();mode='loading';return}
    showAuth(false);$('#who').textContent=u.email||'';mode='loading';render();setSync('Connecting…');
    be.subscribe(ts=>{tasks=new Map(ts.map(t=>[t.id,t]));mode='ready';render()},ps=>{projects=new Map(ps.map(p=>[p.id,p]));if(mode!=='loading')render()},showStatus,
      e=>{setSync('Sync problem — '+(e.code||'reload'),'warn');if(e.code==='permission-denied')toast('Firebase refused access — check the security rules (setup step 4).');mode='ready';render()});
  });
}
render();start();
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
