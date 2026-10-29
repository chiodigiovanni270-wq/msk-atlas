const $=id=>document.getElementById(id);
const panel=document.createElement('section');panel.id='ax-panel';panel.hidden=true;panel.setAttribute('aria-label','Sezioni assiali della spalla');
panel.innerHTML=`<header class="ax-heading"><div><span class="ax-kicker">SPALLA DESTRA</span><h2>Sezione assiale</h2></div><button id="ax-close" aria-label="Chiudi sezioni">×</button></header>
<div class="ax-stage"><canvas id="slice" tabindex="0" aria-label="Sezione assiale, frecce su e giù per scorrere"></canvas><span class="ax-dir ax-ant">A</span><span class="ax-dir ax-post">P</span><span class="ax-dir ax-right">R</span><span class="ax-dir ax-left">L</span><p id="status" role="status">Preparazione delle sezioni…</p><div class="ax-zoom"><button id="zoomOut" aria-label="Riduci zoom">−</button><button id="zoomIn" aria-label="Aumenta zoom">+</button><button id="reset">Adatta</button></div></div>
<div id="hover" aria-live="polite">Seleziona una struttura nella sezione o nel modello.</div>
<div class="ax-controls"><div><label for="level">Livello <output id="value">—</output></label><label for="step">Passo <select id="step"><option value="1">1 mm</option><option value="2">2 mm</option><option value="5">5 mm</option></select></label></div><div><button id="up" disabled aria-label="Livello superiore">↑</button><input id="level" type="range" disabled aria-label="Livello assiale"><button id="down" disabled aria-label="Livello inferiore">↓</button></div></div>
<details class="ax-help"><summary>Orientamento e colori</summary><p>Vista dai piedi: A anteriore, P posteriore, R destra, L sinistra. Colori anatomici; selezione e visibilità condivise con il modello 3D.</p><p>Livello rispetto alla testa omerale. Ossa piene, spazi non modellati vuoti; contorni aperti tratteggiati. Sezioni del modello, non immagini TAC.</p></details>`;
document.body.append(panel);
const divider=document.createElement('div');divider.id='ax-divider';divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-label','Dimensione delle viste');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-valuemin','32');divider.setAttribute('aria-valuemax','65');divider.setAttribute('aria-valuenow','40');divider.hidden=true;document.body.append(divider);
const toggle=$('ax-toggle'),expand=document.createElement('button');expand.id='ax-expand';expand.textContent='Espandi 3D';expand.hidden=true;document.body.append(expand);
const canvas=$('slice'),ctx=canvas.getContext('2d');let d,opened=false,started=false,lastState='';
const dock=document.createElement('aside');dock.id='ax-anatomy';dock.hidden=true;dock.setAttribute('aria-label','Esplora anatomia');
dock.innerHTML=`<div class="ax-anatomy-tools"><label class="ax-find"><span aria-hidden="true">⌕</span><input id="ax-find" type="search" placeholder="Cerca una struttura…" aria-label="Cerca una struttura anatomica" autocomplete="off"></label><button id="ax-list-toggle" aria-expanded="false" aria-controls="ax-results">Strutture</button></div><div id="ax-results" hidden></div><div id="ax-card-slot"></div><p id="ax-empty">Seleziona nel modello o nella sezione per esplorare l’anatomia.</p>`;
document.body.append(dock);
let cardHome=null;
function catalog(){if(!d)return;
 const q=$('ax-find').value.trim().toLocaleLowerCase('it'),results=$('ax-results'),scroll=results.scrollTop;
 const focused=results.contains(document.activeElement)?document.activeElement.dataset.key:null;
 results.replaceChildren();
 const all=d.S.filter(s=>s.group), bulk=document.createElement('div');bulk.className='ax-bulk';
 const apply=(items,value)=>{items.forEach(s=>d.setVis(s,value));d.sync();draw();catalog();};
 for(const [label,value] of [['Mostra tutto',true],['Nascondi tutto',false]]){const button=document.createElement('button');button.textContent=label;button.dataset.key='all-'+value;button.onclick=()=>apply(all,value);bulk.append(button);}results.append(bulk);
 const groups=document.createElement('div');groups.className='ax-groups';groups.setAttribute('aria-label','Visibilità delle categorie anatomiche');
 for(const cat of d.categories||[]){const items=all.filter(s=>s.cat===cat.id);if(!items.length)continue;
  const label=document.createElement('label'),check=document.createElement('input'),name=document.createElement('span');check.type='checkbox';check.dataset.key='cat-'+cat.id;
  const visible=items.filter(s=>s.visible).length;check.checked=visible===items.length;check.indeterminate=visible>0&&visible<items.length;check.setAttribute('aria-label','Mostra categoria '+cat.name);check.onchange=()=>apply(items,check.checked);name.textContent=cat.name;const count=document.createElement('small');count.textContent=visible+'/'+items.length;label.append(check,name,count);groups.append(label);
 }results.append(groups);
 const heading=document.createElement('p');heading.className='ax-list-heading';heading.textContent=q?'Risultati della ricerca · categorie applicate per intero':'Singole strutture';results.append(heading);
 const items=all.filter(s=>s.name.toLocaleLowerCase('it').includes(q));
 if(!items.length){const p=document.createElement('p');p.textContent='Nessuna struttura trovata.';results.append(p);}
 const categories=d.categories||[];
 for(const cat of categories){const members=items.filter(s=>s.cat===cat.id);if(!members.length)continue;
  const group=document.createElement('section');group.className='ax-list-section';const title=document.createElement('h3');title.id='ax-group-'+cat.id;title.textContent=cat.name+' · '+members.length;group.setAttribute('aria-labelledby',title.id);group.append(title);results.append(group);
 for(const s of members){const row=document.createElement('div');row.className='ax-result';const check=document.createElement('input');check.type='checkbox';check.checked=s.visible;check.dataset.key='vis-'+s.id;check.setAttribute('aria-label','Mostra '+s.name);check.onchange=()=>apply([s],check.checked);const button=document.createElement('button');button.textContent=s.name;button.dataset.key='select-'+s.id;button.onclick=()=>{if(!s.visible){d.setVis(s,true);d.sync();}d.select(s.id);setCatalog(false);syncDock();draw();};row.append(check,button);group.append(row);}
 }
 results.scrollTop=scroll;
 if(focused)Array.from(results.querySelectorAll('[data-key]')).find(e=>e.dataset.key===focused)?.focus({preventScroll:true});
}
let previousSelection=null;
function setCatalog(value){
 if(value){d?.select(null);previousSelection=null;document.body.classList.remove('ax-has-selection');}
 $('ax-results').hidden=!value;$('ax-card-slot').hidden=value;
 $('ax-list-toggle').setAttribute('aria-expanded',String(value));
 document.body.classList.toggle('ax-browsing',value);
 $('ax-empty').hidden=value||!!d?.selected();
 if(value)catalog();layout();
}
function syncDock(){if(!opened||!d)return;const id=d.selected(),selected=!!id;if(id!==previousSelection){previousSelection=id;if(id){setCatalog(false);$('card').querySelector('.info').scrollTop=0;}}document.body.classList.toggle('ax-has-selection',selected);$('ax-empty').hidden=selected||!$('ax-results').hidden;layout();}
$('ax-find').oninput=()=>setCatalog(true);
$('ax-list-toggle').onclick=()=>setCatalog($('ax-results').hidden);
$('ax-find').onkeydown=e=>{if(e.key==='Escape'){setCatalog(false);}if(e.key==='Enter')$('ax-results').querySelector('.ax-result button')?.click();};
function layout(){d?.resize();draw();}
function open(value){d=window.__dbg;opened=value;dock.hidden=!value;const card=$('card');if(value&&!cardHome){cardHome={parent:card.parentNode,next:card.nextSibling};$('ax-card-slot').append(card);}else if(!value&&cardHome){cardHome.parent.insertBefore(card,cardHome.next);cardHome=null;}document.body.classList.toggle('ax-has-selection',value&&!!d?.selected());panel.hidden=divider.hidden=expand.hidden=!value;document.body.classList.toggle('ax-open',value);toggle.setAttribute('aria-expanded',String(value));toggle.classList.toggle('active',value);if(plane)plane.visible=outline.visible=value;layout();
 if(value&&!started){started=true;init().catch(e=>fail(e.message));}if(!value)toggle.focus();}
toggle.onclick=()=>open(!opened);$('ax-close').onclick=()=>open(false);
expand.onclick=()=>{const on=document.body.classList.toggle('ax-expanded');expand.textContent=on?'Riduci 3D':'Espandi 3D';expand.setAttribute('aria-pressed',String(on));layout();};
function split(percent){const n=Math.max(32,Math.min(65,percent));document.body.style.setProperty('--ax-split',n+'%');divider.setAttribute('aria-valuenow',String(Math.round(n)));layout();}
divider.onpointerdown=e=>{divider.setPointerCapture(e.pointerId);};divider.onpointermove=e=>{if(divider.hasPointerCapture(e.pointerId))split(e.clientX/innerWidth*100);};divider.onpointerup=e=>divider.releasePointerCapture(e.pointerId);
divider.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();split(+divider.getAttribute('aria-valuenow')+(e.key==='ArrowLeft'?-2:2));}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened&&!['INPUT','SELECT'].includes(document.activeElement.tagName)){if(!$('ax-results').hidden){setCatalog(false);$('ax-list-toggle').focus();}else open(false);}});
// Observe state without altering the model's selection or visibility handlers.
setInterval(()=>{if(!opened||!d)return;const state=d.selected()+'|'+d.S.map(s=>+s.visible).join('');if(state!==lastState){lastState=state;syncDock();if(!$('ax-results').hidden)catalog();draw();}},160);
window.addEventListener('resize',layout);
const colors={caps:'#b9cfe0',bor:'#9fb8ec',ossa:'#dbca9c',cart:'#9cc0d0',leg:'#e5ded1',ten:'#e5ded1',ret:'#e5ded1',cuf:'#b55b51',cin:'#b55b51',tor:'#b55b51',brac:'#b55b51',art:'#c93b38',ven:'#5473b8',ner:'#e4c65b',adi:'#d8b44a'};
let worker,plane,outline,bounds,sections=[],paths=[],zoom=1,seq=0,busy=false,pending=null,ready=false,scale=1,ox=0,oz=0;
function fail(message){$('status').textContent=message;$('status').hidden=false;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function init(){
  let w=window;
  for(let i=0;i<240;i++){d=window.__dbg;if(d&&document.getElementById('load')?.hidden)break;await wait(500);}
  if(!d||!document.getElementById('load')?.hidden)throw Error('Modello non disponibile. Ricarica la pagina per riprovare.');
  const T=w.THREE, data=[];bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity,minY:Infinity,maxY:-Infinity};
  d.S.forEach(s=>{
    if(!colors[s.cat]||!s.group)return;
    s.group.children.forEach(m=>{
      if(!m.geometry?.attributes.position)return;
      const g=m.geometry,p=g.attributes.position, pos=Float32Array.from(p.array),idx=g.index?Uint32Array.from(g.index.array):Uint32Array.from({length:p.count},(_,i)=>i);
      for(let i=0;i<pos.length;i+=3){bounds.minX=Math.min(bounds.minX,pos[i]);bounds.maxX=Math.max(bounds.maxX,pos[i]);bounds.minY=Math.min(bounds.minY,pos[i+1]);bounds.maxY=Math.max(bounds.maxY,pos[i+1]);bounds.minZ=Math.min(bounds.minZ,pos[i+2]);bounds.maxZ=Math.max(bounds.maxZ,pos[i+2]);}
      data.push({id:s.id,name:s.name,cat:s.cat,pos,idx,tw:g.attributes.tw?Float32Array.from(g.attributes.tw.array):null});
    });
  });
  const root=d.S.find(s=>s.group)?.group.parent;
  const width=bounds.maxX-bounds.minX,depth=bounds.maxZ-bounds.minZ;
  plane=new T.Mesh(new T.PlaneGeometry(width,depth),new T.MeshBasicMaterial({color:0x6fc7e5,side:T.DoubleSide,transparent:true,opacity:.22,depthWrite:false}));
  plane.rotation.x=-Math.PI/2;plane.position.set((bounds.minX+bounds.maxX)/2,0,(bounds.minZ+bounds.maxZ)/2);root.add(plane);
  outline=new T.LineSegments(new T.EdgesGeometry(plane.geometry),new T.LineBasicMaterial({color:0x9ee4ff}));outline.rotation.copy(plane.rotation);outline.position.copy(plane.position);root.add(outline);plane.visible=outline.visible=opened;
  $('level').min=Math.ceil(bounds.minY*10)+1;$('level').max=Math.floor(bounds.maxY*10)-1;$('level').step=1;$('level').value=0;
  worker=new Worker('../assets/sezioni-assiali-worker.js',{type:'module'});
  worker.onerror=()=>fail('Impossibile calcolare la sezione. Ricarica la pagina per riprovare.');
  worker.onmessage=({data})=>{
    if(data.type==='ready'){ready=true;['level','up','down'].forEach(id=>$(id).disabled=false);requestSlice();return;}
    busy=false;
    if(data.seq===seq){sections=data.sections;draw();$('status').hidden=sections.length>0;$('status').textContent='Nessuna struttura a questo livello.';}
    if(pending!==null){const y=pending;pending=null;send(y);}
  };
  worker.postMessage({type:'init',meshes:data},data.flatMap(m=>[m.pos.buffer,m.idx.buffer,...(m.tw?[m.tw.buffer]:[])]));
}
function send(y){busy=true;worker.postMessage({type:'slice',seq,y});}
function requestSlice(){if(!ready)return;const mm=+$('level').value,y=mm/10;seq++;$('value').textContent=`${mm>0?'+':''}${mm} mm`;plane.position.y=y;outline.position.y=y;
  if(busy)pending=y;else send(y);
}
function shift(dir){if(!ready)return;const r=$('level');r.value=Math.max(+r.min,Math.min(+r.max,+r.value+dir*+$('step').value));requestSlice();}
function draw(){
  if(!bounds||!opened)return;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
  scale=Math.min((rect.width-80)/(bounds.maxX-bounds.minX),(rect.height-60)/(bounds.maxZ-bounds.minZ))*zoom;
  ox=rect.width/2-(bounds.minX+bounds.maxX)/2*scale;oz=rect.height/2+(bounds.minZ+bounds.maxZ)/2*scale;
  paths=[];
  const order=s=>({ossa:4,art:6,ven:6,ner:7,cart:5,leg:3,ten:3,ret:3}[s.cat]||1);
  for(const s of [...sections].filter(s=>d.S.find(m=>m.id===s.id)?.visible).sort((a,b)=>order(a)-order(b))){
    const path=new Path2D();let tendon=0,n=0;
    for(const points of s.loops){points.forEach((p,i)=>{const x=ox+p[0]*scale,z=oz-p[1]*scale;i?path.lineTo(x,z):path.moveTo(x,z);tendon+=p[2];n++;});path.closePath();}
    let color=colors[s.cat]||'#b55b51';
    if(['cuf','cin','tor','brac'].includes(s.cat)&&n){const f=Math.max(0,Math.min(1,tendon/n));color=`rgb(${Math.round(181+48*f)},${Math.round(91+131*f)},${Math.round(81+128*f)})`;}
    ctx.fillStyle=color;ctx.fill(path,'evenodd');ctx.strokeStyle=d.selected()===s.id?'#fff2a3':'#090e1455';ctx.lineWidth=d.selected()===s.id?2.5:.7;ctx.stroke(path);paths.push({path,name:s.name,id:s.id});
    ctx.setLineDash([3,3]);ctx.strokeStyle=color;
    for(const points of s.open){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(ox+p[0]*scale,oz-p[1]*scale):ctx.moveTo(ox+p[0]*scale,oz-p[1]*scale));ctx.stroke();}ctx.setLineDash([]);
  }
  // Scala fisica in mm, coerente con le coordinate del modello in cm.
  const length=2*scale;ctx.strokeStyle='#afc7d8';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(24,rect.height-24);ctx.lineTo(24+length,rect.height-24);ctx.stroke();ctx.fillStyle='#afc7d8';ctx.font='11px system-ui';ctx.fillText('20 mm',24,rect.height-31);
}
$('level').oninput=requestSlice;$('up').onclick=()=>shift(1);$('down').onclick=()=>shift(-1);
canvas.addEventListener('wheel',e=>{e.preventDefault();shift(e.deltaY>0?-1:1);},{passive:false});
canvas.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();shift(e.key==='ArrowUp'?1:-1);}});
canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;ctx.save();ctx.setTransform(1,0,0,1,0,0);const hit=[...paths].reverse().find(p=>ctx.isPointInPath(p.path,x,y,'evenodd'));ctx.restore();$('hover').textContent=hit?.name||'Nessuna struttura in questo punto.';d.select(hit?.id||null);draw();});
$('zoomIn').onclick=()=>{zoom=Math.min(4,zoom*1.25);draw();};$('zoomOut').onclick=()=>{zoom=Math.max(.5,zoom/1.25);draw();};$('reset').onclick=()=>{zoom=1;draw();};
new ResizeObserver(draw).observe(canvas);

window.addEventListener('pagehide',e=>{if(!e.persisted)worker?.terminate();});

if(new URLSearchParams(location.search).get('sezioni')==='assiali')open(true);
new ResizeObserver(()=>{if(opened)layout();}).observe(dock);
