/* Scheda struttura (#card) su smartphone: foglio dal basso compatto, espandibile.
   Caricata da nav.js; non tocca la logica dei modelli, solo stile e due pulsanti/maniglia della scheda.
   - Compatta (predefinita): nome, categoria, inserzione e funzione (o prime due righe della nota), pulsanti Isola/Nascondi.
     Il resto del modello resta visibile e interattivo sopra.
   - Espansa: scheda completa (origine, inserzione, funzione, nota) con scorrimento, fino al 55% dell'altezza.
   - Si espande/comprime toccando la maniglia o la freccia, o trascinando la maniglia in su/giù; trascinando in giù
     una scheda già compatta la si chiude. Mentre è aperta, la pillola "Strutture" è nascosta.
   Stessa condizione "compatto" dei modelli: (max-width:600px), (orientation:landscape) and (max-height:500px). */
(function(){
  var MQ = '(max-width:600px),(orientation:landscape) and (max-height:500px)';
  var css =
    '#card .sc-grip,#card .sc-toggle{display:none}' +
    '@media ' + MQ + '{' +
      '#card{left:0;right:0;bottom:0;width:auto;max-width:none;margin:0;border-radius:18px 18px 0 0;' +
        'padding:0 max(12px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 10px) max(12px,env(safe-area-inset-left,0px));' +
        'max-height:56vh;max-height:56dvh;border-left-width:1px;border-top:3px solid var(--c,#999)}' +
      '#card .sc-grip{display:block;position:relative;flex:none;height:22px;margin:0 -12px;touch-action:none;cursor:grab}' +
      '#card .sc-grip::after{content:"";position:absolute;left:50%;top:8px;width:34px;height:4px;margin-left:-17px;border-radius:2px;background:var(--line)}' +
      '#card h2{margin-right:84px}' +
      '#card .x{top:2px;right:max(2px,env(safe-area-inset-right,0px));width:44px;height:44px;padding:0;font-size:22px}' +
      '#card .sc-toggle{display:flex;align-items:center;justify-content:center;position:absolute;top:2px;right:44px;width:44px;height:44px;' +
        'border:0;background:transparent;color:var(--muted);padding:0}' +
      '#card .sc-toggle svg{transition:transform .2s}' +
      '#card.sc-open .sc-toggle svg{transform:rotate(180deg)}' +
      /* compatta: solo inserzione e funzione (una riga ciascuna); senza campi, la nota su due righe */
      '#card:not(.sc-open) .info{flex:none;max-height:none;overflow:hidden;margin-bottom:8px}' +
      '#card:not(.sc-open) .info p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}' +
      '#card:not(.sc-open) .info:has(.oif) p{display:none}' +
      '#card:not(.sc-open) .oif .sc-hide{display:none}' +
      '#card:not(.sc-open) .oif{grid-template-columns:auto minmax(0,1fr);gap:3px 10px}' +
      '#card:not(.sc-open) .oif dd{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#card.sc-open .info{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain}' +
      'body.sc-card #sheet{display:none}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){#card .sc-toggle svg{transition:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  function init(){
    var card = document.getElementById('card');
    var info = document.getElementById('cInfo');
    var name = document.getElementById('cName');
    var close = card && card.querySelector('.x');
    if (!card || !info || !name || !close) return;
    var mq = matchMedia(MQ);

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

    /* maniglia: tocco = alterna; trascinamento in su = espande, in giù = comprime o chiude */
    var drag = null;
    grip.addEventListener('pointerdown', function(e){
      drag = { id: e.pointerId, y: e.clientY, done: false };
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', function(e){
      if (!drag || e.pointerId !== drag.id || drag.done) return;
      var dy = e.clientY - drag.y;
      if (Math.abs(dy) < 24) return;
      drag.done = true;
      if (dy < 0) setOpen(true);
      else if (card.classList.contains('sc-open')) setOpen(false);
      else close.click();
    });
    function end(e){
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.done && Math.abs(e.clientY - drag.y) < 8) setOpen(!card.classList.contains('sc-open'));
      drag = null;
    }
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', function(){ drag = null; });

    /* nuova struttura: scheda di nuovo compatta; nasconde la riga "Origine" nella vista compatta */
    function aggiorna(){
      setOpen(false);
      info.querySelectorAll('dt').forEach(function(dt){
        if (dt.textContent === 'Origine'){ dt.classList.add('sc-hide'); if (dt.nextElementSibling) dt.nextElementSibling.classList.add('sc-hide'); }
      });
    }
    new MutationObserver(aggiorna).observe(info, { childList: true });
    function stato(){ document.body.classList.toggle('sc-card', !card.hidden && mq.matches); }
    new MutationObserver(stato).observe(card, { attributes: true, attributeFilter: ['hidden'] });
    mq.addEventListener('change', stato);
    stato();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
