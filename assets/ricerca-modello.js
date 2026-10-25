/* Ricerca della tavola attiva: catalogo dall’elenco già presente, nessuna rete.
   Usa i comandi Scheda/Isola esistenti, senza cambiare i file autonomi dei modelli. */
(()=>{
  'use strict';
  function init(){
    const load=document.getElementById('load');
    if(!load||!load.hidden||document.getElementById('model-search'))return;
    const entries=Array.from(document.querySelectorAll('#list .grp')).flatMap(group=>{
      const category=group.querySelector('h3').textContent.trim();
      return Array.from(group.querySelectorAll('.item')).map(row=>({
        name:row.querySelector('label').textContent.trim(),category,button:row.querySelector('.go')
      }));
    });
    if(!entries.length)return;
    const model={entries,select(r){
      // Restore any previous isolation before selecting the next structure.
      const region=document.querySelector('#regs button[aria-pressed="true"]');
      if(region)document.getElementById('bAll').click(); // Exit any clipping plane.
      const isolate=document.getElementById('cIso');
      if(isolate.getAttribute('aria-pressed')==='true')isolate.click();
      r.button.click();
      if(document.getElementById('card').hidden)return false;
      isolate.click();return true;
    }};
    const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const synonyms=[['sovraspinato','sovraspinoso','supraspinatus'],['sottospinato','infraspinato','infraspinoso','infraspinatus'],['perone','fibula'],['rotula','patella'],['scafoide','scaphoid'],['ischiatico','sciatico']];
    const rows=model.entries.map(r=>{
      let key=norm(r.name+' '+r.category);
      for(const group of synonyms)if(group.some(w=>key.includes(w)))key+=' '+group.join(' ');
      return {...r,key};
    });
    const form=document.createElement('form');form.id='model-search';form.className='ms-search';form.setAttribute('role','search');form.setAttribute('aria-label','Cerca in questo modello');
    form.innerHTML=`<div class="ms-field">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
      <input id="ms-input" type="text" role="combobox" aria-label="Cerca una struttura in questo modello" aria-autocomplete="list" aria-expanded="false" aria-controls="ms-results" placeholder="Cerca una struttura…" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
      <button class="ms-close" type="button" aria-label="Chiudi ricerca" hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </div><div class="ms-popover" hidden><p class="ms-status" role="status" aria-live="polite"></p><ul id="ms-results" role="listbox" aria-label="Strutture trovate"></ul></div>`;
    document.body.appendChild(form);
    const input=form.querySelector('input'),panel=form.querySelector('.ms-popover'),status=form.querySelector('.ms-status'),list=form.querySelector('ul'),closeButton=form.querySelector('.ms-close');
    const compact=matchMedia('(max-width:600px),(orientation:landscape) and (max-height:500px)');
    const desktop=matchMedia('(min-width:900px) and (min-height:501px)');
    const sheet=document.getElementById('sheet');
    let matches=[],active=-1;
    function fit(){
      const v=window.visualViewport,top=v?v.offsetTop:0,height=v?v.height:innerHeight;
      if(desktop.matches&&sheet){
        const bounds=sheet.getBoundingClientRect();
        if(bounds.width>0&&bounds.height>0){
          const compass=document.querySelector('.an-orient');
          const minTop=compass?compass.getBoundingClientRect().bottom+12:144;
          form.style.setProperty('--ms-panel-right',Math.max(14,innerWidth-bounds.right)+'px');
          form.style.setProperty('--ms-panel-width',Math.min(400,bounds.width)+'px');
          form.style.setProperty('--ms-panel-top',Math.max(minTop,bounds.top-56)+'px');
        }
      }
      form.style.setProperty('--ms-offset',top+'px');
      form.style.setProperty('--ms-results-height',Math.max(60,Math.min(360,top+height-input.getBoundingClientRect().bottom-78))+'px');
    }
    function close(refocus=false){
      panel.hidden=true;closeButton.hidden=true;form.classList.remove('ms-open');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;
      if(refocus)input.focus({preventScroll:true});
    }
    function open(){
      panel.hidden=false;closeButton.hidden=false;form.classList.add('ms-open');input.setAttribute('aria-expanded','true');fit();
    }
    function setActive(i){
      active=i;Array.from(list.children).forEach((el,n)=>el.setAttribute('aria-selected',String(n===i)));
      if(i<0){input.removeAttribute('aria-activedescendant');return;}
      const el=list.children[i];input.setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest'});
    }
    function choose(i){
      const r=matches[i];if(!r)return;
      if(!model.select(r)){status.textContent='Struttura non disponibile nel modello.';return;}
      input.value='';close();input.blur();
      // Keyboard users continue from the selected card; touch keyboard closes.
      const card=document.getElementById('card');if(card){card.tabIndex=-1;card.focus({preventScroll:true});}
    }
    function update(){
      const q=norm(input.value);active=-1;input.removeAttribute('aria-activedescendant');list.replaceChildren();matches=[];open();
      if(q.length<2){status.textContent='Scrivi almeno 2 caratteri · '+rows.length+' strutture';return;}
      const terms=q.split(' '),score=r=>norm(r.name)===q?0:norm(r.name).startsWith(q)?1:2;
      const found=rows.filter(r=>terms.every(t=>r.key.includes(t))).sort((a,b)=>score(a)-score(b)||a.name.localeCompare(b.name,'it'));
      matches=found.slice(0,30);
      status.textContent=found.length?`${found.length} ${found.length===1?'risultato':'risultati'}${found.length>30?' · primi 30, affina la ricerca':''}`:'Nessun risultato. Prova un nome più breve.';
      matches.forEach((r,i)=>{
        const li=document.createElement('li');li.id='ms-option-'+i;li.setAttribute('role','option');li.setAttribute('aria-selected','false');
        const name=document.createElement('strong'),category=document.createElement('small');name.textContent=r.name;category.textContent=r.category;li.append(name,category);
        li.addEventListener('click',()=>choose(i));list.appendChild(li);
      });
    }
    input.addEventListener('focus',()=>{
      if(compact.matches){
        const card=document.getElementById('card'),sheet=document.getElementById('sheet');
        if(card&&!card.hidden)card.querySelector('.x').click();
        if(sheet&&!sheet.classList.contains('collapsed'))document.getElementById('bSheet').click();
      }
      update();
    });
    input.addEventListener('input',update);
    input.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();input.blur();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();if(panel.hidden)update();
        if(matches.length)setActive(active<0?(e.key==='ArrowDown'?0:matches.length-1):(active+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length);
      }
    });
    form.addEventListener('submit',e=>{e.preventDefault();if(!panel.hidden&&!e.isComposing)choose(active<0?0:active);});
    closeButton.addEventListener('click',()=>{input.value='';close();input.blur();});
    // Keep pointer selection alive until click, including with the touch keyboard.
    list.addEventListener('mousedown',e=>e.preventDefault());
    form.addEventListener('focusout',()=>setTimeout(()=>{if(!form.contains(document.activeElement))close();},150));
    document.addEventListener('pointerdown',e=>{if(!form.contains(e.target)){close();input.blur();}});
    window.addEventListener('resize',fit);
    desktop.addEventListener('change',fit);
    if(sheet&&window.ResizeObserver)new ResizeObserver(fit).observe(sheet);
    if(window.visualViewport){visualViewport.addEventListener('resize',fit);visualViewport.addEventListener('scroll',fit);}
    fit();
  }
  function ready(){
    const load=document.getElementById('load');if(!load)return;
    if(load.hidden){init();return;}
    const observer=new MutationObserver(()=>{if(load.hidden){observer.disconnect();init();}});
    observer.observe(load,{attributes:true,attributeFilter:['hidden']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
