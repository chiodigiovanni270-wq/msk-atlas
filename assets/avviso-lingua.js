/* Avviso lingua per i visitatori non italiani: «This page is also available in English», con link alla pagina /en/
   corrispondente (conserva ?struttura= e #dito) e pulsante ✕. Nessun reindirizzamento.
   Caricato dalla homepage e da nav.js (modelli); i file dei modelli non cambiano.
   Compare solo se: la pagina è italiana, la build ha aggiunto <link rel="alternate" hreflang="en"> (quindi non sulle bozze
   né in locale senza build), nessuna lingua di navigator.languages è italiano, l'avviso non è già stato chiuso.
   La chiusura si ricorda in localStorage (solo sul dispositivo, nessun cookie).
   Posizione: modelli su smartphone sopra il pulsante «Strutture», nascosto quando sono aperti il pannello o la scheda;
   modelli su tablet sopra il pannello Strutture; modelli da 900 px in alto al centro, sulla fila dei pulsanti;
   homepage sotto la barra in alto, scorre con la pagina (se l'avviso compare, l'invito «App MSK Atlas» non compare in quella visita). */
(function(){
  var KEY = 'msk-avviso-lingua';
  var doc = document.documentElement;
  if (doc.lang !== 'it') return;
  var en = document.querySelector('link[rel="alternate"][hreflang="en"]');
  if (!en) return;
  var lingue = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
  if ([].some.call(lingue, function(l){ return /^it\b/i.test(l); })) return;
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}

  var modello = !!document.getElementById('c');
  var SANS = 'var(--sans,"Figtree",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif)';
  var css =
    '.al{position:fixed;z-index:18;left:50%;transform:translateX(-50%);box-sizing:border-box;display:flex;align-items:center;gap:10px;' +
      'width:max-content;max-width:calc(100% - 28px);min-height:44px;padding:4px 4px 4px 16px;border-radius:22px;' +
      'background:var(--glass,rgba(30,38,47,.82));border:1px solid var(--glass-bd,rgba(255,255,255,.13));' +
      'box-shadow:var(--glass-hl,inset 0 1px 0 rgba(255,255,255,.12)),var(--shadow,0 6px 24px rgba(0,0,0,.45));' +
      '-webkit-backdrop-filter:blur(20px) saturate(170%);backdrop-filter:blur(20px) saturate(170%);' +
      'color:var(--ink-2,#c8d3dc);font:400 14px/1.35 ' + SANS + ';letter-spacing:0;text-align:left}' +
    '.al svg{flex:none;color:var(--accent,#72b4d0)}' +
    '.al p{margin:0}' +
    '.al a{color:var(--accent,#72b4d0);font-weight:600;text-decoration:underline;text-underline-offset:3px}' +
    '.al button{flex:none;width:36px;height:36px;margin:0;padding:0;border:0;border-radius:999px;background:transparent;' +
      'color:var(--muted,#93a1ae);display:flex;align-items:center;justify-content:center;cursor:pointer}' +
    '.al button:hover{color:var(--ink,#e5eaef);background:rgba(255,255,255,.06)}' +
    '.al a:focus-visible,.al button:focus-visible{outline:2px solid var(--accent,#72b4d0);outline-offset:2px}' +
    (modello
      /* tablet (601–899 px): sopra il pannello Strutture, dove compare la scheda */
      ? '.al{bottom:calc(var(--sheetH,120px) + 10px)}' +
        'body:has(#card:not([hidden])) .al{display:none}' +
        /* smartphone: sopra il pulsante «Strutture» (alto 44 px, a 12 px dal fondo) */
        '@media (max-width:600px),(orientation:landscape) and (max-height:500px){' +
          '.al{bottom:calc(env(safe-area-inset-bottom,0px) + 12px + 44px + 10px)}' +
          'body:has(#sheet:not(.collapsed)) .al{display:none}' +
        '}' +
        /* computer: in alto al centro, sulla fila del pulsante indietro e della «i» */
        '@media (min-width:900px){.al{top:calc(env(safe-area-inset-top,0px) + 10px);bottom:auto}' +
          'body:has(#card:not([hidden])) .al{display:flex}}'
      /* homepage: sotto la barra in alto, sopra l'immagine decorativa; scorre via con la pagina */
      : '.al{position:absolute;top:calc(env(safe-area-inset-top,0px) + 76px)}@media (min-width:641px){.al{top:92px}}');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.className = 'al';
  box.lang = 'en';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Language');
  box.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>' +
    '<p>This page is also available in <a hreflang="en" lang="en">English</a></p>' +
    '<button type="button" aria-label="Dismiss"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></button>';
  var link = box.querySelector('a');
  var percorso = new URL(en.href).pathname;
  function aggiorna(){ link.href = percorso + location.search + location.hash; }
  aggiorna();
  addEventListener('hashchange', aggiorna);
  link.addEventListener('click', aggiorna);
  box.querySelector('button').addEventListener('click', function(){
    box.remove();
    doc.classList.remove('avviso-lingua');
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  });

  doc.classList.add('avviso-lingua');
  function monta(){ document.body.appendChild(box); }
  if (document.body) monta(); else document.addEventListener('DOMContentLoaded', monta);
})();
