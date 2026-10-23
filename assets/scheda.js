/* Scheda struttura (#card) su smartphone: foglio dal basso compatto, espandibile. Da 900 px: scheda sempre intera.
   Caricata da nav.js; non tocca la logica dei modelli, solo stile e due pulsanti/maniglia della scheda.
   - Compatta (predefinita): nome, categoria e pulsanti Isola/Nascondi; il resto del modello resta visibile e interattivo sopra.
   - Espansa: scheda completa (origine, inserzione, funzione, nota) con scorrimento, fino al 56% dell'altezza.
   - Si espande/comprime toccando la maniglia o la freccia; trascinando la maniglia in su si espande, in giù si chiude.
     Un tocco sulla scheda compatta la espande. Niente bordo colorato: il colore della categoria resta sulla struttura. Mentre è aperta, la pillola "Strutture" è nascosta.
   Stessa condizione "compatto" dei modelli: (max-width:600px), (orientation:landscape) and (max-height:500px). */
(function(){
  var MQ = '(max-width:600px),(orientation:landscape) and (max-height:500px)';
  var css =
    '#card .sc-grip,#card .sc-toggle{display:none}' +
    '@media ' + MQ + '{' +
      '#card{left:0;right:0;bottom:0;width:auto;max-width:none;margin:0;border-radius:18px 18px 0 0;' +
        'padding:0 max(12px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 10px) max(12px,env(safe-area-inset-left,0px));' +
        'max-height:56vh;max-height:56dvh;border:1px solid var(--glass-bd,rgba(255,255,255,.13));border-bottom:0}' +
      '#card .sc-grip{display:block;position:relative;flex:none;height:22px;margin:0 -12px;touch-action:none;cursor:grab}' +
      '#card .sc-grip::after{content:"";position:absolute;left:50%;top:8px;width:34px;height:4px;margin-left:-17px;border-radius:2px;background:var(--line)}' +
      '#card h2{margin-right:84px}' +
      '#card .x{top:2px;right:max(2px,env(safe-area-inset-right,0px));width:44px;height:44px;padding:0;font-size:22px}' +
      '#card .sc-toggle{display:flex;align-items:center;justify-content:center;position:absolute;top:2px;right:44px;width:44px;height:44px;' +
        'border:0;background:transparent;color:var(--muted);padding:0}' +
      '#card .sc-toggle svg{transition:transform .2s}' +
      '#card.sc-open .sc-toggle svg{transform:rotate(180deg)}' +
      /* compatta: nome, categoria e pulsanti (testo della scheda nascosto, niente righe troncate); un tocco la apre completa */
      '#card:not(.sc-open){cursor:pointer}' +
      '#card:not(.sc-open) h2{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#card:not(.sc-open) .cat{margin-bottom:10px}' +
      '#card:not(.sc-open) .info{display:none}' +
      '#card.sc-open .info{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain}' +
      'body.sc-card #sheet{display:none}' +
      /* apertura: la scheda sale dal basso */
      '#card:not([hidden]){animation:sc-in .28s cubic-bezier(.2,.8,.3,1)}' +
      '@keyframes sc-in{from{transform:translateY(100%)}}' +
    '}' +
    /* computer: scheda intera, senza scorrimento interno della nota; scorre tutta la scheda solo se supera lo spazio sotto la barra */
    '@media (min-width:900px){#card{display:flex;flex-direction:column;max-height:calc(100vh - env(safe-area-inset-top,0px) - 136px);max-height:calc(100dvh - env(safe-area-inset-top,0px) - 136px)}' +
      '#card h2,#card .cat,#card .btns{flex:none}#card .info{flex:0 1 auto;min-height:0;max-height:none;overflow:auto}}' +
    '@media (prefers-reduced-motion:reduce){#card .sc-toggle svg{transition:none}#card:not([hidden]){animation:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var RIDOTTO = matchMedia('(prefers-reduced-motion:reduce)');
  var USCITA = 300;   /* ms dell'uscita verso il basso */

  /* trascinamento verso il basso di un pannello dalla sua maniglia: il pannello segue il dito; al rilascio,
     oltre 70 px o con uno swipe rapido (> 0,5 px/ms) scivola fuori e poi chiude(); altrimenti torna su.
     Trascinamento verso l'alto oltre 24 px: su() (se c'è). handle._mosso = c'è stato un trascinamento (per ignorare il click). */
  function trascina(handle, panel, chiudi, su, attivo, cattura){
    var d = null;
    function giu(e){
      if (attivo && !attivo()) return;
      d = { id: e.pointerId, y0: e.clientY, y: e.clientY, t: e.timeStamp, v: 0, dy: 0 };
      handle._mosso = false;
      if (cattura) e.stopPropagation();
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function muovi(e){
      if (!d || e.pointerId !== d.id) return;
      if (cattura) e.stopPropagation();
      var dt = Math.max(1, e.timeStamp - d.t);
      d.v = (e.clientY - d.y) / dt; d.y = e.clientY; d.t = e.timeStamp;
      d.dy = e.clientY - d.y0;
      if (Math.abs(d.dy) > 6) handle._mosso = true;
      if (d.dy < -24 && su){ su(); d = null; return; }
      panel.style.transition = 'none';
      panel.style.transform = d.dy > 0 ? 'translateY(' + d.dy + 'px)' : '';
    }
    function su_(e){
      if (!d || e.pointerId !== d.id) return;
      if (cattura) e.stopPropagation();
      var esci = d.dy > 70 || (d.dy > 20 && d.v > 0.5);
      d = null;
      if (esci){
        if (RIDOTTO.matches){ panel.style.transition = panel.style.transform = ''; chiudi(); return; }
        panel.style.transition = 'transform ' + USCITA + 'ms cubic-bezier(.4,0,.9,.6)';
        panel.style.transform = 'translateY(calc(100% + 40px))';
        setTimeout(function(){ chiudi(); panel.style.transition = panel.style.transform = ''; }, USCITA);
      } else {
        panel.style.transition = 'transform .2s ease';
        panel.style.transform = '';
        setTimeout(function(){ panel.style.transition = ''; }, 200);
      }
    }
    function annulla(){ if (!d) return; d = null; panel.style.transition = panel.style.transform = ''; }
    /* cattura = eventi intercettati sulla finestra prima dei gestori del modello */
    var bersaglio = cattura ? window : handle;
    function filtro(f){ return cattura ? function(e){ if (handle.contains(e.target) || (d && e.pointerId === d.id)) f(e); } : f; }
    bersaglio.addEventListener('pointerdown', filtro(giu), !!cattura);
    bersaglio.addEventListener('pointermove', filtro(muovi), !!cattura);
    bersaglio.addEventListener('pointerup', filtro(su_), !!cattura);
    bersaglio.addEventListener('pointercancel', filtro(annulla), !!cattura);
  }

  /* pannello "Strutture" dei modelli (#sheet, intestazione #bSheet): stesso trascinamento con uscita animata.
     Sostituisce lo swipe del modello (che chiudeva di colpo): gli eventi sull'intestazione aperta vengono
     intercettati prima; alla fine si preme #bSheet, che chiude il pannello con la logica del modello. */
  function pannello(mq){
    var sheet = document.getElementById('sheet'), bS = document.getElementById('bSheet');
    if (!sheet || !bS) return;
    var interno = false;
    function aperto(){ return mq.matches && !sheet.classList.contains('collapsed'); }
    trascina(bS, sheet, function(){
      /* il pannello è già fuori: la classe collapsed lo lascia lì, poi la linguetta torna pillola */
      interno = true; bS.click(); interno = false;
    }, null, aperto, true);
    /* il click che segue un trascinamento non deve riaprire/richiudere */
    window.addEventListener('click', function(e){
      if (!interno && bS.contains(e.target) && bS._mosso){ bS._mosso = false; e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  function init(){
    var card = document.getElementById('card');
    var info = document.getElementById('cInfo');
    var name = document.getElementById('cName');
    var close = card && card.querySelector('.x');
    if (!card || !info || !name || !close) return;
    var mq = matchMedia(MQ);
    pannello(mq);

    var grip = document.createElement('div');
    grip.className = 'sc-grip';
    var tog = document.createElement('button');
    tog.type = 'button';
    tog.className = 'sc-toggle';
    tog.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
    card.prepend(grip);
    close.after(tog);

    function setOpen(o){
      card.classList.toggle('sc-open', o);
      tog.setAttribute('aria-expanded', String(o));
      tog.setAttribute('aria-label', o ? 'Riduci la scheda' : 'Espandi la scheda');
      info.scrollTop = 0;
    }
    setOpen(false);
    tog.addEventListener('click', function(){ setOpen(!card.classList.contains('sc-open')); });

    /* maniglia: tocco = alterna; in su = espande; in giù la scheda segue il dito e, oltre la soglia
       (o con uno swipe rapido), scivola fuori dallo schermo e si chiude; altrimenti torna al suo posto */
    trascina(grip, card, function(){ close.click(); }, function(){ setOpen(true); });
    grip.addEventListener('click', function(){ if (!grip._mosso) setOpen(!card.classList.contains('sc-open')); });

    /* nuova struttura: scheda di nuovo compatta */
    new MutationObserver(function(){ setOpen(false); }).observe(info, { childList: true });
    /* tocco sulla scheda compatta (fuori da × e freccia): la apre */
    card.addEventListener('click', function(e){
      if (mq.matches && !card.classList.contains('sc-open') && !e.target.closest('button') && !grip.contains(e.target)) setOpen(true);
    });
    function stato(){ document.body.classList.toggle('sc-card', !card.hidden && mq.matches); }
    new MutationObserver(stato).observe(card, { attributes: true, attributeFilter: ['hidden'] });
    mq.addEventListener('change', stato);
    stato();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
