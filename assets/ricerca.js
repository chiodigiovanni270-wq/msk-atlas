/* Ricerca locale: scarica soltanto l'indice dei nomi, mai le mesh. */
(()=>{
 'use strict';
 const form=document.querySelector('.anatomy-search'),input=document.getElementById('structure-search');
 if(!form||!input)return;
 const panel=form.querySelector('.search-popover'),list=document.getElementById('structure-results'),status=form.querySelector('.search-status');
 let data,pending,matches=[],active=-1,version=0;
 const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const synonyms=[['sovraspinato','sovraspinoso','supraspinatus'],['sottospinato','infraspinato','infraspinoso','infraspinatus'],['perone','fibula'],['rotula','patella'],['scafoide','scaphoid']];
 function searchText(r){let text=norm([r.name,r.model,r.category].join(' '));for(const group of synonyms)if(group.some(w=>text.includes(w)))text+=' '+group.join(' ');return text;}
 function close(){panel.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
 function open(){panel.hidden=false;input.setAttribute('aria-expanded','true');}
 function choose(i){const r=matches[i];if(!r)return;const url=new URL(r.path,location.href);url.searchParams.set('struttura',r.id);url.hash=r.section==='dito'?'dito':'';location.assign(url.href);}
 function setActive(i){active=i;[...list.children].forEach((el,n)=>el.setAttribute('aria-selected',String(n===i)));if(i<0){input.removeAttribute('aria-activedescendant');return;}const el=list.children[i];input.setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest'});}
 async function load(){
  if(data)return data;
  if(!pending)pending=fetch('assets/strutture.json').then(r=>{if(!r.ok)throw Error('Indice non disponibile');return r.json();}).then(rows=>data=rows.map(r=>({...r,key:searchText(r)}))).catch(err=>{pending=null;throw err;});
  return pending;
 }
 async function update(){
  const token=++version,q=norm(input.value);matches=[];active=-1;list.replaceChildren();input.removeAttribute('aria-activedescendant');
  if(q.length<2){close();return;}
  open();status.textContent='Ricerca delle strutture…';
  try{
   const rows=await load();if(token!==version)return;
   const terms=q.split(' ');
   const found=rows.filter(r=>terms.every(t=>r.key.includes(t))).sort((a,b)=>{
    const score=r=>norm(r.name)===q?0:norm(r.name).startsWith(q)?1:2;
    return score(a)-score(b)||a.name.localeCompare(b.name,'it')||a.model.localeCompare(b.model,'it');
   });
   matches=found.slice(0,30);
   status.textContent=found.length?`${found.length} risultati${found.length>30?' · primi 30, affina la ricerca':''}`:'Nessuna struttura trovata. Prova un nome più breve o un altro termine.';
   matches.forEach((r,i)=>{const li=document.createElement('li');li.id=`structure-option-${i}`;li.setAttribute('role','option');li.setAttribute('aria-selected','false');const name=document.createElement('strong'),detail=document.createElement('small');name.textContent=r.name;detail.textContent=`${r.model} · ${r.category}`;li.append(name,detail);li.addEventListener('click',()=>choose(i));list.append(li);});
  }catch{if(token===version)status.textContent='Ricerca non disponibile. Riprova digitando oppure scegli una tavola qui sotto.';}
 }
 input.addEventListener('input',update);
 input.addEventListener('focus',()=>{if(input.value.trim().length>=2)update();});
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){version++;close();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(panel.hidden){update();return;}if(matches.length)setActive((active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length);}
 });
 form.addEventListener('submit',e=>{e.preventDefault();if(!panel.hidden)choose(active<0?0:active);});
 document.addEventListener('pointerdown',e=>{if(!form.contains(e.target)){version++;close();}});
 form.addEventListener('focusout',()=>setTimeout(()=>{if(!form.contains(document.activeElement)){version++;close();}},0));
 document.querySelectorAll('.search-shortcut').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();input.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});input.focus({preventScroll:true});}));
})();
