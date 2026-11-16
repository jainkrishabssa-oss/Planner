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
let draft={when:'today',custom:'',area:ls.get('mp.newArea','work'),pri:'normal',project:'',kind:'task'};
const CATS=['Client','Internal','Admin','Planning','Finance','Health','Home','Travel','Learning'];
let calMode=ls.get('mp.cal','week'), mCur=null, yCur=null, selDay=null;
let routines=new Map(), wOff=0, rOpen=null, rdelArm=0;
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
const tkey=t=>t.time||'99:99';
const sortT=(a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:tkey(a)<tkey(b)?-1:tkey(a)>tkey(b)?1:(PR[a.priority]-PR[b.priority])||((a.created||0)-(b.created||0));
const fmtTime=t=>{if(!t)return '';const[h,m]=t.split(':').map(Number);return new Date(2000,0,1,h,m).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})};
const PIN='<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.3" fill="currentColor"/></svg>';
const isLink=l=>/^https?:\/\/[^\s]+$/i.test((l||'').trim());
const mapUrl=l=>isLink(l)?l.trim():'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(l);

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
  s=s.replace(/(^|\s)(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?=\s|$)/i,(m,a,h,mi,ap)=>{h=+h%12+(ap.toLowerCase()==='pm'?12:0);if(h<24)o.time=pad(h)+':'+(mi||'00');return a});
  if(!o.time)s=s.replace(/(^|\s)(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/,(m,a,h,mi)=>{o.time=pad(+h)+':'+mi;return a});
  o.title=s.replace(/\s+/g,' ').trim();return o}

function dueLabel(t){if(!t.due)return '';const d=diff(today,t.due);
  if(t.status!=='done'&&d<0)return `<span class="od">Overdue ${-d}d &middot; ${fmt(t.due,{month:'short',day:'numeric'})}</span>`;
  if(d===0)return '<span class="td">Today</span>';if(d===1)return '<span>Tomorrow</span>';return `<span>${fmt(t.due)}</span>`}
function row(t){const done=t.status==='done';const m=[dueLabel(t)];
  if(t.kind==='visit')m.unshift('<span class="pill v">Meeting</span>');
  if(t.time)m.push(`<span class="tm">${fmtTime(t.time)}</span>`);
  if(t.location)m.push(`<a class="loc" href="${mapUrl(t.location)}" target="_blank" rel="noopener" title="${isLink(t.location)?'Open meeting link':'Open in Google Maps'}">${PIN}${esc(isLink(t.location)?'Join link':t.location)}</a>`);
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
<label>Type<select data-f="kind">${opts({task:'Task',visit:'Meeting'},t.kind||'task')}</select></label>
<label>Due date<input type="date" data-f="due" value="${t.due||''}"></label>
<label>Time<input type="time" data-f="time" value="${t.time||''}"></label>
<label${t.kind==='visit'?'':' class="full"'}>Location<input data-f="location" value="${esc(t.location||'')}" placeholder="${t.kind==='visit'?'Meeting place, address or video link':'Optional'}"></label>
<label>Priority<select data-f="priority">${opts(PRN,t.priority)}</select></label>
<label>Status<select data-f="status">${opts(ST,t.status)}</select></label>
<label>Area<select data-f="area">${opts(AR,t.area)}</select></label>
<label class="full">Project<select data-f="project">${projOptions(t.project,false)}</select></label>
<label class="full">Notes<textarea data-f="notes" rows="2">${esc(t.notes)}</textarea></label>
<div class="acts full"><button class="ghost" data-act="del">Delete</button><button class="btn" data-act="close">Done editing</button></div></div>`}
function projOptions(cur,withNew){const groups=new Map();projList().forEach(p=>{const g=p.area==='personal'?'Personal':(p.company||'Work');groups.has(g)||groups.set(g,[]);groups.get(g).push(p)});
  const order=[...groups.keys()].sort((x,y)=>(x==='Personal')-(y==='Personal')||x.localeCompare(y));
  return `<option value="">No project</option>`+order.map(g=>`<optgroup label="${esc(g)}">${groups.get(g).map(p=>`<option value="${esc(p.title)}"${same(p.title,cur)?' selected':''}>${esc(p.title)}</option>`).join('')}</optgroup>`).join('')+(withNew?'<option value="__new">+ New project…</option>':'')}
const sec=(title,list,band,extra)=>list.length?`<section class="card ${band||'b-gray'}"><h2><span>${title}</span><span>${list.length}</span></h2>${list.sort(sortT).map(row).join('')}${extra||''}</section>`:'';
const DAYB=['b-orange','b-blue','b-purple','b-green','b-red','b-pink','b-teal'];
const dayBand=d=>DAYB[(pd(d).getDay()+6)%7];
const addMonths=(m,n)=>{const d=new Date(+m.slice(0,4),+m.slice(5,7)-1+n,1);return iso(d).slice(0,7)};
const monLast=m=>iso(new Date(+m.slice(0,4),+m.slice(5,7),0));
const MODES=[['week','Week'],['month','Month'],['year','Year']];
function calBar(label,showNow){return `<div class="calbar"><div class="calnav"><button class="chip" data-act="cprev" aria-label="Previous">‹</button><b>${label}</b><button class="chip" data-act="cnext" aria-label="Next">›</button>${showNow?'<button class="link" data-act="cnow">Today</button>':''}</div><div class="seg" role="group" aria-label="Calendar view">${MODES.map(([k,l])=>`<button type="button" data-act="cmode" data-m="${k}" aria-pressed="${calMode===k}">${l}</button>`).join('')}</div></div>`}
function monthView(byDay){const m=mCur,first=m+'-01',last=monLast(m),start=monday(first),end=addDays(monday(last),6);
  if(!selDay||selDay.slice(0,7)!==m)selDay=today.slice(0,7)===m?today:first;
  let g='<div class="mgrid">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span class="mh">${d}</span>`).join('');
  for(let d=start;d<=end;d=addDays(d,1)){const l=(byDay.get(d)||[]).slice().sort((a,b)=>(a.status==='done')-(b.status==='done')||sortT(a,b)),open=l.filter(t=>t.status!=='done');
    const cls=['mday',d.slice(0,7)!==m?'out':'',d===today?'now':'',d===selDay?'sel':'',d<today&&open.length?'late':''].join(' ');
    g+=`<button class="${cls}" data-act="msel" data-d="${d}" aria-label="${fmt(d,{weekday:'long',month:'long',day:'numeric'})}, ${open.length} open"><span class="dn">${pd(d).getDate()}</span>`+
      l.slice(0,3).map(t=>`<span class="mt ${t.priority}${t.kind==='visit'?' vis':''}${t.status==='done'?' dn2':''}">${t.time?`<b>${fmtTime(t.time).replace(':00','')}</b> `:''}${esc(t.title)}</span>`).join('')+(l.length>3?`<span class="more">+${l.length-3} more</span>`:'')+
      (l.length?`<span class="mdots">${l.slice(0,4).map(t=>`<i class="${t.priority}${t.status==='done'?' dn2':''}"></i>`).join('')}</span>`:'')+'</button>'}
  g+='</div>';
  const sl=(byDay.get(selDay)||[]).slice().sort((a,b)=>(a.status==='done')-(b.status==='done')||sortT(a,b));
  g+=`<section class="card ${dayBand(selDay)} msel"><h2><span>${fmt(selDay,{weekday:'long',month:'long',day:'numeric'})}${selDay===today?' · Today':''}</span><span>${sl.filter(t=>t.status!=='done').length||''}</span></h2>${sl.map(row).join('')||'<p class="hint pad">Nothing planned</p>'}<button class="link addd" data-act="wadd" data-d="${selDay}">+ Add on this day</button></section>`;
  return calBar(new Date(+m.slice(0,4),+m.slice(5,7)-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'}),m!==today.slice(0,7))+g}
function yearView(byDay){const y=yCur;let h='<div class="ygrid">';
  for(let i=1;i<=12;i++){const m=y+'-'+pad(i),first=m+'-01',last=monLast(m),start=monday(first);let n=0,cells='';
    for(let k=0;k<(pd(first).getDay()+6)%7;k++)cells+='<span></span>';
    for(let d=first;d<=last;d=addDays(d,1)){const l=byDay.get(d)||[],o=l.filter(t=>t.status!=='done').length;n+=o;
      cells+=`<button class="yd${o?' h'+Math.min(o,3):l.length?' hd':''}${d===today?' now':''}${d<today&&o?' late':''}" data-act="yday" data-d="${d}" title="${fmt(d)}${l.length?' · '+l.length+' task'+(l.length>1?'s':''):''}" aria-label="${fmt(d,{month:'long',day:'numeric'})}, ${o} open">${pd(d).getDate()}</button>`}
    h+=`<section class="card ym${m===today.slice(0,7)?' cur':''}"><button class="ymh" data-act="ymonth" data-m="${m}"><span>${new Date(y,i-1,1).toLocaleDateString(undefined,{month:'long'})}</span><span>${n?n+' open':''}</span></button><div class="ycal">${['M','T','W','T','F','S','S'].map(x=>`<span class="yw">${x}</span>`).join('')}${cells}</div></section>`}
  return calBar(String(y),y!==+today.slice(0,4))+h+'</div><p class="hint">Darker days have more open tasks. Tap a day or month to open it.</p>'}
/* routines */
const FREQ={daily:['Daily','b-green'],weekly:['Weekly','b-blue'],monthly:['Monthly','b-orange'],quarterly:['Quarterly','b-purple'],yearly:['Yearly','b-pink']};
const monday=s=>addDays(s,-((pd(s).getDay()+6)%7));
const pkey=(f,s)=>f==='daily'?s:f==='weekly'?monday(s):f==='monthly'?s.slice(0,7):f==='quarterly'?s.slice(0,4)+'-Q'+(Math.floor((+s.slice(5,7)-1)/3)+1):s.slice(0,4);
function cols(f){const y=+today.slice(0,4),cur=pkey(f,today),out=[];
  if(f==='daily'){const m=monday(today);for(let i=0;i<7;i++){const k=addDays(m,i);out.push({k,l:'MTWTFSS'[i],t:fmt(k),fut:k>today})}}
  else if(f==='weekly'){const mo=+today.slice(5,7),last=iso(new Date(y,mo,0));let m=monday(today.slice(0,7)+'-01'),n=1;while(m<=last){out.push({k:m,l:'W'+n,t:'Week of '+fmt(m),fut:m>cur});m=addDays(m,7);n++}}
  else if(f==='monthly'){for(let i=0;i<12;i++){const k=y+'-'+pad(i+1);out.push({k,l:'JFMAMJJASOND'[i],t:new Date(y,i,1).toLocaleDateString(undefined,{month:'long'}),fut:k>cur})}}
  else if(f==='quarterly'){for(let i=1;i<=4;i++){const k=y+'-Q'+i;out.push({k,l:'Q'+i,t:'Quarter '+i,fut:k>cur})}}
  else out.push({k:String(y),l:String(y),t:String(y),fut:false});
  out.forEach(c=>c.cur=c.k===cur);return out}
const rSorted=()=>[...routines.values()].filter(r=>area==='all'||(r.area||'work')===area).sort((a,b)=>Object.keys(FREQ).indexOf(a.freq)-Object.keys(FREQ).indexOf(b.freq)||a.title.localeCompare(b.title));
const rDone=(r,k)=>!!(r.marks&&r.marks[k]);
function persistR(id){const r=routines.get(id);if(!be)return;r?be.putRoutine(r,fail):be.delRoutine(id,fail)}
function toggleMark(id,k){const r=routines.get(id);if(!r)return;const m={...(r.marks||{})};if(m[k])delete m[k];else m[k]=true;
  const keep=String(+today.slice(0,4)-1);Object.keys(m).forEach(x=>{if(x.slice(0,4)<keep)delete m[x]});r.marks=m;persistR(id);render()}
const rProgress=r=>{const c=cols(r.freq),n=c.filter(x=>rDone(r,x.k)).length;return r.freq==='yearly'?(n?'done this year':'this year'):`${n}/${c.length} ${{daily:'this week',weekly:'this month',monthly:'this year',quarterly:'this year'}[r.freq]}`};
function rTodayRow(r){const k=pkey(r.freq,today),d=rDone(r,k);
  return `<div class="task ${d?'done':''}"><button class="ck" data-act="rtoday" data-r="${r.id}" aria-label="${d?'Untick':'Tick'}: ${esc(r.title)}"><i>${d?CHECK:''}</i></button>
<div class="body" data-act="gor" tabindex="0"><div class="t">${esc(r.title)}</div><div class="meta"><span>${FREQ[r.freq][0]}</span><span>${rProgress(r)}</span></div></div></div>`}
function routineCard(f,list){const c=cols(f),n=c.length,cw=f==='monthly'?30:34;
  const head=`<div class="rrow rhead" style="--n:${n};--cw:${cw}px"><span></span>${c.map(x=>`<span class="cell${x.cur?' cur':''}" title="${esc(x.t)}">${x.l}</span>`).join('')}</div>`;
  const rows=list.map(r=>`<div class="rrow" style="--n:${n};--cw:${cw}px"><button class="rname" data-act="ropen" data-r="${r.id}">${esc(r.title)}</button>${c.map(x=>`<span class="cell${x.cur?' cur':''}"><button class="box" data-act="rbox" data-r="${r.id}" data-k="${x.k}" aria-pressed="${rDone(r,x.k)}" aria-label="${esc(r.title)}, ${esc(x.t)}"${x.fut?' disabled':''}>${rDone(r,x.k)?CHECK:''}</button></span>`).join('')}</div>`+
    (rOpen===r.id?`<div class="edit redit"><label class="full">Routine<input data-rf="title" data-r="${r.id}" value="${esc(r.title)}"></label><label>How often<select data-rf="freq" data-r="${r.id}">${opts(Object.fromEntries(Object.entries(FREQ).map(([k,v])=>[k,v[0]])),r.freq)}</select></label><label>Area<select data-rf="area" data-r="${r.id}">${opts(AR,r.area||'work')}</select></label><div class="acts full"><button class="ghost" data-act="rdel" data-r="${r.id}">Delete routine</button><button class="btn" data-act="rclose">Done editing</button></div></div>`:'')).join('');
  return `<section class="card ${FREQ[f][1]}"><h2><span>${FREQ[f][0]}</span><span>${list.length}</span></h2><div class="rgrid">${head}${rows}</div></section>`}
const empty=(a,b)=>`<div class="empty"><b>${a}</b>${b}</div>`;
const RSUG=['Review daily goals','Plan tomorrow\'s tasks','Check emails','Exercise 30 mins','Weekly review','Pay bills'];

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
  const ae=document.activeElement;if(ae&&ae.matches('input,textarea,select')&&ae.closest('.edit,.pform,.radd')){pending=true;return}
  pending=false;const PLall=projList();PIDX=new Map(PLall.map(p=>[p.key,p]));
  $('#dow').textContent=fmt(today,{weekday:'long'});$('#date').textContent=fmt(today,{month:'long',day:'numeric'});
  const A=all(),open=A.filter(t=>t.status!=='done'),P=todayParts(open);
  const wk=open.filter(t=>t.due>today&&t.due<=addDays(today,7)).length;
  $('#tally').innerHTML=`<button class="od" data-go="today"><b>${P.od.length}</b><span>Overdue</span></button><button data-go="today"><b>${P.td.length}</b><span>Due today</span></button><button data-go="upcoming"><b>${wk}</b><span>Next 7 days</span></button>`;
  const RS=rSorted(),rLeft=RS.filter(r=>!rDone(r,pkey(r.freq,today))).length,ws=addDays(monday(today),7*wOff),we=addDays(ws,6);
  const nWeek=open.filter(t=>t.due>=monday(today)&&t.due<=addDays(monday(today),6)).length;
  const nToday=P.od.length+P.td.length+P.cr.length+P.dg.length+rLeft,nUp=open.filter(t=>!t.due||t.due>today).length,nDone=A.length-open.length;
  const projs=PLall.filter(p=>area==='all'||p.area===area);
  $('#tabs').innerHTML=[['today','Today',nToday],['week','Calendar',nWeek],['upcoming','Upcoming',nUp],['projects','Projects',projs.length],['routines','Routines',RS.length],['done','Done',nDone]].map(([k,l,n])=>`<button class="tab" role="tab" data-v="${k}" aria-selected="${view===k}">${l}<small>${n}</small></button>`).join('');
  $$('#seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.a===area));
  $$('[data-when]').forEach(b=>b.setAttribute('aria-pressed',draft.when===b.dataset.when));
  $('#cdate').setAttribute('aria-pressed',draft.when==='custom');
  $$('[data-area]').forEach(b=>b.setAttribute('aria-pressed',draft.area===b.dataset.area));
  $$('[data-pri]').forEach(b=>b.setAttribute('aria-pressed',draft.pri===b.dataset.pri));
  $$('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',draft.kind===b.dataset.kind));$('#vrow').hidden=draft.kind!=='visit';$('#q').placeholder=draft.kind==='visit'?'What is the meeting? e.g. Client review':'Add a task…';
  const psel=$('#proj');if(document.activeElement!==psel){if(draft.project&&!PLall.some(p=>same(p.title,draft.project)))draft.project='';psel.innerHTML=projOptions(draft.project,true);psel.value=PLall.find(p=>same(p.title,draft.project))?.title||'';}
  psel.setAttribute('aria-pressed',!!draft.project);
  $('#projlist').innerHTML=PLall.map(p=>`<option value="${esc(p.title)}" label="${esc([p.company,p.category].filter(Boolean).join(' · ')||AR[p.area]||'')}">`).join('');
  $('#companylist').innerHTML=[...new Set(PLall.map(p=>p.company).filter(Boolean))].sort().map(c=>`<option value="${esc(c)}">`).join('');
  $('#catlist').innerHTML=[...new Set([...PLall.map(p=>p.category).filter(Boolean),...CATS])].map(c=>`<option value="${esc(c)}">`).join('');
  let h='';
  if(mode==='loading')h=empty('Loading your tasks…','');
  else if(view==='today'){const dn=A.filter(t=>t.status==='done'&&t.doneAt&&iso(new Date(t.doneAt))===today);
    const vt=P.td.filter(t=>t.kind==='visit'),tt=P.td.filter(t=>t.kind!=='visit');
    h=sec('Overdue',P.od,'b-red')+sec('Meetings today',vt,'b-purple')+sec('Due today',tt,'b-orange')+sec('Critical, coming up',P.cr,'b-yellow')+sec('In progress',P.dg,'b-blue')
      +(RS.length?`<section class="card b-green"><h2><span>Routines</span><span>${RS.length-rLeft}/${RS.length} done</span></h2>${RS.map(rTodayRow).join('')}</section>`:'')
      +sec('Done today',dn,'b-gray');
    if(!P.od.length&&!P.td.length&&!P.cr.length&&!P.dg.length)h=empty('Nothing due today','Add a task above, or look at Week and Upcoming.')+h}
  else if(view==='week'&&calMode!=='week'){const byDay=new Map();A.forEach(t=>{if(t.due){byDay.has(t.due)||byDay.set(t.due,[]);byDay.get(t.due).push(t)}});
    if(!mCur)mCur=today.slice(0,7);if(!yCur)yCur=+today.slice(0,4);
    h=calMode==='month'?monthView(byDay):yearView(byDay)}
  else if(view==='week'){
    h=calBar(`${fmt(ws,{month:'short',day:'numeric'})} – ${fmt(we,{month:'short',day:'numeric'})}`,!!wOff)+`<div class="wk">`;
    for(let i=0;i<7;i++){const d=addDays(ws,i),l=A.filter(t=>t.due===d).sort((a,b)=>(a.status==='done')-(b.status==='done')||sortT(a,b));
      h+=`<section class="card ${DAYB[i]}${d===today?' now':''}"><h2><span>${fmt(d,{weekday:'long'})} ${pd(d).getDate()}${d===today?' · Today':''}</span><span>${l.filter(t=>t.status!=='done').length||''}</span></h2>${l.map(row).join('')||'<p class="hint pad">Nothing planned</p>'}<button class="link addd" data-act="wadd" data-d="${d}">+ Add</button></section>`}
    h+='</div>'}
  else if(view==='upcoming'){const fut=open.filter(t=>t.due>today).sort(sortT),lim=addDays(today,14),g=new Map();
    fut.filter(t=>t.due<=lim).forEach(t=>{g.has(t.due)||g.set(t.due,[]);g.get(t.due).push(t)});
    g.forEach((l,d)=>{h+=sec((diff(today,d)===1?'Tomorrow · ':'')+fmt(d,{weekday:'long',month:'short',day:'numeric'}),l,dayBand(d))});
    h+=sec('Later',fut.filter(t=>t.due>lim),'b-gray')+sec('No date yet',open.filter(t=>!t.due),'b-gray');
    h=h||empty('Nothing coming up','Tasks with a future date, or no date, show here.')}
  else if(view==='projects'){
    const shownAll=projs,cats=[...new Set(shownAll.map(p=>p.category).filter(Boolean))].sort();
    if(pcat!=='all'&&!cats.includes(pcat))pcat='all';
    h=`<div class="pbar"><button class="btn" data-act="pnew">+ New project</button>${cats.length?['all',...cats].map(c=>`<button class="chip" data-act="pcat" data-c="${esc(c)}" aria-pressed="${pcat===c}">${c==='all'?'All categories':esc(c)}</button>`).join(''):''}</div>`;
    if(pform)h+=pformHtml();
    const shown=shownAll.filter(p=>pcat==='all'||p.category===pcat),groups=new Map();
    shown.forEach(p=>{const g=p.area==='personal'?'Personal':(p.company||'Work, no company yet');groups.has(g)||groups.set(g,[]);groups.get(g).push(p)});
    const GB=['b-purple','b-blue','b-orange','b-pink','b-yellow','b-red'];[...groups.keys()].sort((x,y)=>(x==='Personal')-(y==='Personal')||x.localeCompare(y)).forEach((g,i)=>{h+=`<section class="card ${g==='Personal'?'b-teal':GB[i%GB.length]}"><h2><span>${esc(g)}</span><span>${groups.get(g).length}</span></h2>`+groups.get(g).map(projCard).join('')+'</section>'});
    const loose=A.filter(t=>!t.project&&t.status!=='done');
    if(loose.length&&pcat==='all')h+=sec('Not in a project',loose,'b-gray');
    if(!shown.length&&!loose.length&&!pform)h+=empty('No projects yet','Tap New project, or type #name when you add a task.')}
  else if(view==='routines'){
    h=`<form class="radd" id="radd"><input id="r-title" placeholder="Add a routine, e.g. Review daily goals" aria-label="New routine" list="rsug"><select id="r-freq" aria-label="How often">${opts(Object.fromEntries(Object.entries(FREQ).map(([k,v])=>[k,v[0]])),ls.get('mp.rfreq','daily'))}</select><button class="btn" type="submit">Add</button></form><datalist id="rsug">${RSUG.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`;
    Object.keys(FREQ).forEach(f=>{const l=RS.filter(r=>r.freq===f);if(l.length)h+=routineCard(f,l)});
    if(!RS.length)h+=empty('No routines yet','Things you repeat, like checking emails daily or paying bills monthly. Tick them off each day, week, month, quarter or year.')}
  else{const d=A.filter(t=>t.status==='done').sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
    h=d.length?`<div class="bar"><span class="hint">${d.length} finished</span><button class="link" data-act="clear">${clearArm?'Tap again to delete them':'Clear finished tasks'}</button></div><section class="card b-green"><h2><span>Finished</span><span>${d.length}</span></h2>${d.map(row).join('')}</section>`:empty('Nothing finished yet','Tick a task to move it here.')}
  const LE=$('#list');LE.className='v-'+view;LE.innerHTML=h;flash='';
  $$('.rgrid').forEach(g=>{const c=g.querySelector('.rhead .cur');if(c&&c.offsetLeft+c.offsetWidth>g.clientWidth)g.scrollLeft=c.offsetLeft+c.offsetWidth-g.clientWidth+40});
}

/* add bar */
$('#add').addEventListener('submit',e=>{e.preventDefault();const p=parseQ($('#q').value);
  if(!p.title){const q=$('#q'),f=$('#add');q.placeholder='Type your task here first…';q.classList.add('nudge');f.classList.remove('shake');void f.offsetWidth;f.classList.add('shake');q.focus();
    setTimeout(()=>{q.placeholder='Add a task…';q.classList.remove('nudge')},2500);return}
  const pr=(p.project||draft.project||'').trim(),pj=pr&&projByTitle(pr);
  const vis=draft.kind==='visit',tm=p.time||(vis?$('#vtime').value:'')||'',loc=vis?$('#vloc').value.trim():'';
  const t={id:newId(),title:p.title,kind:vis?'visit':'task',time:tm,location:loc,due:p.due??dueFromDraft(),priority:p.priority||draft.pri,status:'todo',project:pj?pj.title:pr,area:p.area||(pj?pj.area:draft.area),notes:'',created:Date.now(),doneAt:0};
  if(vis){$('#vtime').value='';$('#vloc').value=''}
  tasks.set(t.id,t);persist(t.id);ensureProject(t.project,t.area);flash=t.id;$('#q').value='';draft.pri='normal';
  const P=todayParts([t]);const inToday=P.od.length+P.td.length+P.cr.length>0;
  if(view==='done'||(view==='today'&&!inToday)||(view==='upcoming'&&inToday&&t.due===today)||(area!=='all'&&area!==t.area))toast('Added'+(t.due?' for '+fmt(t.due):'')+(inToday?' · shows in Today':' · shows in Upcoming'));
  render()});
document.addEventListener('click',e=>{const b=e.target.closest('[data-when],[data-area],[data-pri],[data-a],[data-v],[data-go],[data-kind]');if(!b)return;
  if(b.dataset.kind){draft.kind=b.dataset.kind;render();if(draft.kind==='visit')$('#q').focus();return}
  if(b.dataset.when){draft.when=b.dataset.when;$('#cdate').value=''}
  if(b.dataset.area){draft.area=b.dataset.area;ls.set('mp.newArea',draft.area)}
  if(b.dataset.pri)draft.pri=b.dataset.pri;
  if(b.dataset.a){area=b.dataset.a;ls.set('mp.area',area)}
  if(b.dataset.v||b.dataset.go){view=b.dataset.v||b.dataset.go;openId=null;ls.set('mp.view',view)}
  render()});
$('#proj').addEventListener('change',e=>{const v=e.target.value;e.target.blur();
  if(v==='__new'){pform={fromAdd:true,back:view};view='projects';openId=null;render();const f=$('#pform');f&&f.scrollIntoView&&f.scrollIntoView({block:'center'});$('#pf-title')&&$('#pf-title').focus();return}
  draft.project=v;const p=projByTitle(v);if(p)draft.area=p.area;render()});
$('#cdate').addEventListener('change',e=>{if(e.target.value){draft.when='custom';draft.custom=e.target.value}else draft.when='none';render()});

function saveProject(){const title=$('#pf-title').value.trim();if(!title){$('#pf-title').focus();return}
  const ar=$('[data-pfa][aria-pressed="true"]').dataset.pfa,company=ar==='work'?$('#pf-co').value.trim():'',category=$('#pf-cat').value.trim();
  const old=pform.key?projByTitle(pform.key):null;
  const clash=projList().find(p=>p.key===title.toLowerCase()&&(!old||p.key!==old.key));if(clash){toast('You already have a project called '+clash.title);return}
  let rec=old&&old.id?projects.get(old.id):null;if(!rec){rec={id:newId(),created:Date.now()};projects.set(rec.id,rec)}
  Object.assign(rec,{title,area:ar,company,category});persistP(rec.id);
  if(old)tasks.forEach(t=>{if(same(t.project,old.title)&&(t.project!==title||t.area!==ar)){t.project=title;t.area=ar;persist(t.id)}});
  if(!old||openProj===old.key)openProj=title.toLowerCase();
  const fromAdd=pform.fromAdd,back=pform.back;pform=null;document.activeElement.blur();
  if(fromAdd){draft.project=title;draft.area=ar;view=back||'today';render();$('#q').focus();scrollTo({top:0,behavior:'smooth'});toast('Project added · now type your task');return}
  render();toast(old?'Project updated':'Project added · tap it to add tasks')}

/* list actions */
const L=$('#list');
L.addEventListener('click',e=>{if(e.target.closest('a.loc'))return;const pa=e.target.closest('[data-pfa]');if(pa){$$('[data-pfa]').forEach(x=>x.setAttribute('aria-pressed',x===pa));$('#pf-co-wrap').hidden=pa.dataset.pfa==='personal';return}
  const b=e.target.closest('[data-act]');if(!b)return;const el=b.closest('[data-id]'),id=el&&el.dataset.id,t=id&&tasks.get(id);
  const a=b.dataset.act;
  if(a==='toggle'&&t){const prev={status:t.status,doneAt:t.doneAt};const done=t.status!=='done';t.status=done?'done':'todo';t.doneAt=done?Date.now():0;persist(id);render();
    if(done)toast('Done: '+t.title,()=>{Object.assign(t,prev);persist(id);render()})}
  else if(a==='open'&&t){if(e.target.closest('.edit'))return;openId=openId===id?null:id;render()}
  else if(a==='close'){openId=null;render()}
  else if(a==='del'&&t){const copy={...t};tasks.delete(id);openId=null;persist(id);render();toast('Deleted: '+copy.title,()=>{tasks.set(id,copy);persist(id);render()})}
  else if(a==='proj'){openProj=openProj===b.dataset.p?null:b.dataset.p;render()}
  else if(a==='addto'){const p=projByTitle(b.dataset.p);if(p){draft.project=p.title;draft.area=p.area}render();$('#q').focus();$('#q').scrollIntoView({block:'center'})}
  else if(a==='rbox'){toggleMark(b.dataset.r,b.dataset.k)}
  else if(a==='rtoday'){const r=routines.get(b.dataset.r);if(r)toggleMark(r.id,pkey(r.freq,today))}
  else if(a==='gor'){view='routines';ls.set('mp.view',view);render();scrollTo({top:0})}
  else if(a==='ropen'){rOpen=rOpen===b.dataset.r?null:b.dataset.r;clearTimeout(rdelArm);rdelArm=0;render()}
  else if(a==='rclose'){rOpen=null;document.activeElement.blur();render()}
  else if(a==='rdel'){if(!rdelArm){b.textContent='Tap again to delete';rdelArm=setTimeout(()=>{rdelArm=0;b.textContent='Delete routine'},4000);return}
    clearTimeout(rdelArm);rdelArm=0;const r=routines.get(b.dataset.r);if(!r)return;routines.delete(r.id);persistR(r.id);rOpen=null;document.activeElement.blur();render();
    toast('Routine deleted',()=>{routines.set(r.id,r);persistR(r.id);render()})}
  else if(a==='cprev'||a==='cnext'||a==='cnow'){const n=a==='cnext'?1:-1;openId=null;
    if(calMode==='week')wOff=a==='cnow'?0:wOff+n;
    else if(calMode==='month'){mCur=a==='cnow'?today.slice(0,7):addMonths(mCur,n);selDay=null}
    else yCur=a==='cnow'?+today.slice(0,4):yCur+n;render()}
  else if(a==='cmode'){calMode=b.dataset.m;ls.set('mp.cal',calMode);openId=null;render()}
  else if(a==='msel'){selDay=b.dataset.d;if(selDay.slice(0,7)!==mCur){mCur=selDay.slice(0,7)}openId=null;render();const c=$('.msel');c&&c.scrollIntoView&&innerWidth<1024&&c.scrollIntoView({block:'nearest',behavior:'smooth'})}
  else if(a==='ymonth'||a==='yday'){calMode='month';ls.set('mp.cal','month');mCur=(b.dataset.m||b.dataset.d.slice(0,7));selDay=b.dataset.d||null;openId=null;render();scrollTo({top:0})}
  else if(a==='wadd'){draft.when='custom';draft.custom=b.dataset.d;$('#cdate').value=b.dataset.d;render();$('#q').focus();scrollTo({top:0,behavior:'smooth'})}
  else if(a==='pnew'||a==='pedit'){pform=a==='pedit'?{key:b.dataset.p}:{};clearTimeout(pdelArm);pdelArm=0;render();const f=$('#pform');f.scrollIntoView&&f.scrollIntoView({block:'nearest'});$('#pf-title').focus()}
  else if(a==='pcancel'){const back=pform&&pform.fromAdd?pform.back:null;pform=null;if(back)view=back;render()}
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
  if(f==='location')v=v.trim();
  if((t[f]||'')===v)return;t[f]=v;if(f==='status')t.doneAt=v==='done'?Date.now():0;persist(id);if(f==='project')ensureProject(v,t.area);if(f==='kind'){e.target.blur();render()}});
L.addEventListener('change',e=>{const f=e.target.dataset.rf;if(!f)return;const r=routines.get(e.target.dataset.r);if(!r)return;let v=e.target.value.trim();
  if(f==='title'&&!v){e.target.value=r.title;return}if(r[f]===v)return;r[f]=v;persistR(r.id);if(f!=='title'){document.activeElement.blur();render()}});
L.addEventListener('submit',e=>{if(e.target.id!=='radd')return;e.preventDefault();const t=$('#r-title').value.trim(),f=$('#r-freq').value;if(!t)return;
  const r={id:newId(),title:t,freq:f,area:area==='personal'?'personal':(draft.area||'work'),marks:{},created:Date.now()};routines.set(r.id,r);persistR(r.id);ls.set('mp.rfreq',f);
  $('#r-title').value='';document.activeElement.blur();render();setTimeout(()=>{const i=$('#r-title');i&&i.focus()},0)});
L.addEventListener('focusout',()=>setTimeout(()=>{const ae=document.activeElement;if(pending&&!(ae&&ae.matches('input,textarea,select')&&ae.closest('.edit,.pform,.radd')))render()},0));

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
function placeMenu(){const r=$('#acct').getBoundingClientRect(),w=menu.offsetWidth||240;
  menu.style.top=Math.round(r.bottom+8)+'px';menu.style.left=Math.round(Math.min(Math.max(8,r.right-w),innerWidth-w-8))+'px'}
$('#acct').addEventListener('click',()=>{menu.hidden=!menu.hidden;if(!menu.hidden)placeMenu()});
addEventListener('resize',()=>{if(!menu.hidden)placeMenu()});addEventListener('scroll',()=>{if(!menu.hidden)menu.hidden=true},{passive:true});
document.addEventListener('click',e=>{if(!menu.hidden&&!e.target.closest('#menu,#acct'))menu.hidden=true});
$('#m-export').addEventListener('click',()=>{const data={app:'my-planner',version:1,exported:new Date().toISOString(),tasks:[...tasks.values()],projects:[...projects.values()],routines:[...routines.values()]};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='my-planner-backup-'+today+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);menu.hidden=true});
$('#m-import').addEventListener('click',()=>{$('#importfile').click()});
$('#importfile').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';menu.hidden=true;if(!f)return;
  try{const d=JSON.parse(await f.text());const ts=Array.isArray(d.tasks)?d.tasks:[],ps=Array.isArray(d.projects)?d.projects:[];
    let n=0;ts.forEach(t=>{if(t&&t.id&&t.title){const c={id:String(t.id),title:String(t.title),due:t.due||'',priority:PR[t.priority]!=null?t.priority:'normal',status:ST[t.status]?t.status:'todo',project:t.project||'',area:t.area==='personal'?'personal':'work',notes:t.notes||'',kind:(t.kind==='visit'||t.kind==='meeting')?'visit':'task',time:/^\d\d:\d\d$/.test(t.time||'')?t.time:'',location:t.location||'',created:t.created||Date.now(),doneAt:t.doneAt||0};tasks.set(c.id,c);persist(c.id);n++}});
    ps.forEach(p=>{if(p&&p.id&&p.title){const c={id:String(p.id),title:String(p.title),area:p.area==='personal'?'personal':'work',company:p.company||'',category:p.category||'',created:p.created||Date.now()};projects.set(c.id,c);persistP(c.id)}});
    (Array.isArray(d.routines)?d.routines:[]).forEach(r=>{if(r&&r.id&&r.title&&FREQ[r.freq]){const c={id:String(r.id),title:String(r.title),freq:r.freq,area:r.area==='personal'?'personal':'work',marks:r.marks&&typeof r.marks==='object'?r.marks:{},created:r.created||Date.now()};routines.set(c.id,c);persistR(c.id)}});
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
    if(!u){showAuth(true);tasks=new Map();projects=new Map();routines=new Map();mode='loading';return}
    showAuth(false);$('#who').textContent=u.email||'';mode='loading';render();setSync('Connecting…');
    be.subscribe({tasks:ts=>{tasks=new Map(ts.map(t=>[t.id,t]));mode='ready';render()},projects:ps=>{projects=new Map(ps.map(p=>[p.id,p]));if(mode!=='loading')render()},
      routines:rs=>{routines=new Map(rs.map(r=>[r.id,r]));if(mode!=='loading')render()}},showStatus,
      e=>{setSync('Sync problem — '+(e.code||'reload'),'warn');if(e.code==='permission-denied')toast('Firebase refused access — check the security rules (setup step 4).');mode='ready';render()});
  });
}
render();start();
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
  const hadSW=!!navigator.serviceWorker.controller;let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadSW&&!reloaded){reloaded=true;location.reload()}});
  navigator.serviceWorker.register('./sw.js').then(r=>{r.update&&r.update();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')r.update().catch(()=>{})})}).catch(()=>{});
}
