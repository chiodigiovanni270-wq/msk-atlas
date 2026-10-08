/* Navigazione comune dei modelli: pulsante fluttuante per tornare alla home (in alto a sinistra)
   e pulsante "i" (in alto a destra) con avvertenza e crediti. Niente barra a tutta larghezza.
   Da includere subito dopo <body>:  <script src="../assets/nav.js"></script>
   Non tocca la logica del modello: aggiunge solo elementi sopra il canvas e
   allarga i margini laterali della barra .top del modello per fare posto ai due pulsanti;
   da 900 px porta viste e selettore di sezione sulla fila dei due pulsanti (alti 44 px) e il titolo sotto.
   Pannello "i": su smartphone foglio dal basso con sfondo attenuato, da 640 px riquadro sotto la "i". */
(function(){
  /* tema scuro sempre, indipendentemente dal sistema: i modelli definiscono
     :root[data-theme="dark"]. Primo passo, prima che il resto della pagina venga disegnato. */
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.colorScheme = 'dark';

  var HOME = '../index.html';
  /* pulsanti fluttuanti (stile del pulsante "Strutture"): alti 44 px, a 10 px + safe-area dal bordo superiore */
  var TOP = 'calc(env(safe-area-inset-top,0px) + 10px)';
  var BTN = '44px';
  var HOMEW = '176px';   /* indietro con logo e nome (da 640 px): larghezza fissa, indipendente dal font caricato */
  var SIDE = 'max(14px,env(safe-area-inset-left,0px))';
  var SIDE_R = 'max(14px,env(safe-area-inset-right,0px))';
  var SANS = 'var(--sans,"Figtree",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif)';
  var SERIF = 'var(--serif,"Spectral",Georgia,serif)';
  var WARN = '#ecc85a';   /* giallo dei nervi nei modelli: solo per l'avvertenza */
  /* vetro: stesse variabili del blocco "Vetro" dei modelli, con valori di riserva */
  var GLASS = 'background:var(--glass,rgba(30,38,47,.55));border:1px solid var(--glass-bd,rgba(255,255,255,.13));' +
    'box-shadow:var(--glass-hl,inset 0 1px 0 rgba(255,255,255,.12)),var(--shadow,0 6px 24px rgba(0,0,0,.45));' +
    '-webkit-backdrop-filter:var(--glass-blur,blur(20px) saturate(170%));backdrop-filter:var(--glass-blur,blur(20px) saturate(170%));';

  var css =
    /* indietro (in alto a sinistra) e "i" (in alto a destra): pillole di vetro, senza barra a tutta larghezza */
    '.an-home,.an-info{position:fixed;z-index:20;top:' + TOP + ';box-sizing:border-box;height:' + BTN + ';' +
      'display:flex;align-items:center;justify-content:center;border-radius:999px;padding:0;' + GLASS +
      'color:var(--ink,#e5eaef);transition:background-color .15s,border-color .15s,color .15s}' +
    '.an-home{left:' + SIDE + ';min-width:' + BTN + ';gap:8px;text-decoration:none;white-space:nowrap;' +
      'font:600 15px/1 ' + SANS + ';letter-spacing:-.01em}' +
    '.an-ico{display:flex;color:var(--muted,#93a1ae);transition:color .15s,transform .15s}' +
    '.an-home img,.an-home .an-name{display:none}' +
    '.an-home b{font-weight:600;color:var(--accent,#72b4d0)}' +
    '.an-home:hover,.an-info:hover{background:var(--glass-card,rgba(30,38,47,.74));border-color:rgba(114,180,208,.5)}' +
    '.an-home:hover .an-ico{color:var(--accent,#72b4d0);transform:translateX(-2px)}' +
    '.an-info{right:' + SIDE_R + ';width:' + BTN + ';cursor:pointer;color:var(--accent,#72b4d0);font:600 17px/1 ' + SANS + '}' +
    '.an-info[aria-expanded="true"]{background:var(--accent,#72b4d0);border-color:var(--accent,#72b4d0);color:var(--bg-lo,#0d1116)}' +
    '.an-home:focus-visible,.an-info:focus-visible,.an-panel a:focus-visible,.an-close:focus-visible{outline:2px solid var(--accent,#72b4d0);outline-offset:2px}' +
    '.an-panel:focus{outline:none}' +
    '.an-scrim{position:fixed;z-index:19;inset:0;background:rgba(13,17,22,.66)}' +
    '.an-scrim[hidden],.an-panel[hidden]{display:none}' +
    /* smartphone: foglio dal basso */
    '.an-panel{position:fixed;z-index:21;left:0;right:0;bottom:0;box-sizing:border-box;' +
      'max-height:calc(100% - env(safe-area-inset-top,0px) - 16px);overflow-y:auto;overscroll-behavior:contain;' +
      'padding:10px max(20px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 24px) max(20px,env(safe-area-inset-left,0px));' +
      'display:flex;flex-direction:column;gap:16px;background:var(--panel,#1e262f);border-top:1px solid var(--line,#324050);' +
      'border-radius:22px 22px 0 0;box-shadow:0 -16px 50px rgba(0,0,0,.55);color:var(--ink,#e5eaef);font:400 13.5px/1.55 ' + SANS + '}' +
    '.an-grip{align-self:center;flex:none;width:40px;height:4px;border-radius:2px;background:var(--line,#324050)}' +
    '.an-head{display:flex;align-items:center;justify-content:space-between;margin-top:-6px}' +
    '.an-head h2{margin:0;font:600 20px/1.2 ' + SANS + ';letter-spacing:-.015em}' +
    '.an-close{flex:none;width:44px;height:44px;margin-right:-10px;border:0;border-radius:10px;background:transparent;color:var(--muted,#93a1ae);' +
      'display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}' +
    '.an-close:hover{color:var(--ink,#e5eaef);background:rgba(255,255,255,.05)}' +
    '.an-brand{margin:-8px 0 0;color:var(--muted,#93a1ae)}' +
    '.an-brand strong{color:var(--ink,#e5eaef);font-weight:600}' +
    '.an-sec{display:flex;flex-direction:column;gap:6px}' +
    '.an-sec+.an-sec{padding-top:14px;border-top:1px solid var(--line,#324050)}' +
    '.an-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;color:var(--muted,#93a1ae)}' +
    '.an-warn{padding:12px 14px;border:1px solid rgba(236,200,90,.3);border-radius:14px;background:rgba(236,200,90,.07)}' +
    '.an-warn .an-label{color:' + WARN + '}' +
    '.an-warn+.an-sec{padding-top:2px;border-top:0}' +
    '.an-panel p{margin:0}' +
    '.an-warn p{font-size:15.5px;line-height:1.4}' +
    '.an-panel strong{font-weight:600}' +
    '.an-cite{font:italic 500 14px/1.45 ' + SERIF + ';color:var(--muted,#93a1ae)}' +
    '.an-panel a{color:var(--accent,#72b4d0)}' +
    /* interfaccia del modello (fino a 899 px): titolo e viste si affiancano ai due pulsanti */
    '.top{padding-top:calc(' + TOP + ' + 4px);padding-left:calc(' + SIDE + ' + ' + BTN + ' + 8px);padding-right:calc(' + SIDE_R + ' + ' + BTN + ' + 6px)}' +
    /* smartphone stretti: il menu "Vista" ha sempre la stessa posizione, 30 px sotto la "i" (con il margine di 6 px),
       indipendentemente dall'altezza del titolo (nel polso c'è anche il selettore Polso/Dito, nel ginocchio no) */
    '@media (max-width:430px){' +
      '.top .views{top:calc(' + TOP + ' + ' + BTN + ' + 24px)}' +
    '}' +
    /* da 640 px: indietro con logo e nome; pannello "i" come riquadro sotto la "i", senza sfondo attenuato */
    '@media (min-width:641px){' +
      '.an-home{width:' + HOMEW + ';justify-content:flex-start;padding:0 0 0 10px}' +
      '.an-home img,.an-home .an-name{display:block}' +
      '.top{padding-left:calc(' + SIDE + ' + ' + HOMEW + ' + 12px)}' +
      '.an-scrim{display:none}' +
      '.an-panel{left:auto;bottom:auto;top:calc(' + TOP + ' + ' + BTN + ' + 8px);right:' + SIDE_R + ';width:380px;' +
        'max-height:calc(100% - env(safe-area-inset-top,0px) - 86px);padding:16px 20px 20px;gap:14px;border:1px solid var(--line,#324050);border-radius:18px;' +
        'box-shadow:0 24px 60px -12px rgba(0,0,0,.7)}' +
      '.an-grip{display:none}.an-head{margin-top:0}' +
    '}' +
    /* da 900 px (computer): una sola fila di comandi alti 44 px allineati in alto — indietro, selettore di sezione
       (.sect, se c'è) accanto, viste accanto alla "i" — e titolo sotto, allineato al pulsante indietro */
    '@media (min-width:900px){' +
      '.top{padding:calc(' + TOP + ' + ' + BTN + ' + 14px) ' + SIDE_R + ' 0 ' + SIDE + '}' +
      '.top .views,.top .sect{position:fixed;top:' + TOP + ';box-sizing:border-box;height:' + BTN + ';margin:0;padding:4px;align-items:stretch}' +
      '.top .views{right:calc(' + SIDE_R + ' + ' + BTN + ' + 8px)}' +
      '.top .sect{left:calc(' + SIDE + ' + ' + HOMEW + ' + 8px)}' +
      '.top .views button,.top .sect button{padding:0 14px;font-size:14px;font-weight:500}' +
      '.top .views .flip{padding:0 14px 0 12px;font-size:16px}' +
    '}' +
    /* sfondo di riserva sotto il gradiente del modello: Safari iOS lo usa per la fascia sotto la barra del browser.
       #11161c = colore del gradiente al centro del bordo inferiore, così la fascia non stacca */
    'body{background-color:#11161c}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var CHEVRON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

  var home = document.createElement('a');
  home.className = 'an-home';
  home.href = HOME;
  home.setAttribute('aria-label', 'Torna all’indice di MSK Atlas');
  home.innerHTML = '<span class="an-ico">' + CHEVRON + '</span>' +
    '<img src="../assets/favicon.svg" width="24" height="24" alt=""><span class="an-name">MSK <b>Atlas</b></span>';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'an-info';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'an-panel');
  btn.setAttribute('aria-label', 'Informazioni e crediti');
  btn.innerHTML = '<span aria-hidden="true">i</span>';

  var scrim = document.createElement('div');
  scrim.className = 'an-scrim';
  scrim.hidden = true;

  var panel = document.createElement('div');
  panel.id = 'an-panel';
  panel.className = 'an-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'an-title');
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.innerHTML =
    '<div class="an-grip" aria-hidden="true"></div>' +
    '<div class="an-head"><h2 id="an-title">Informazioni</h2>' +
      '<button type="button" class="an-close" aria-label="Chiudi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg></button></div>' +
    '<p class="an-brand"><strong>MSK Atlas</strong> — Atlante anatomico 3D</p>' +
    '<section class="an-sec an-warn"><span class="an-label">Avvertenza</span>' +
      '<p><strong>Materiale didattico.</strong> Non destinato a uso clinico o diagnostico.</p></section>' +
    '<section class="an-sec"><span class="an-label">Fonte e licenza</span>' +
      '<p>I modelli sono derivati da <strong>BodyParts3D</strong>, © The Database Center for Life Science (DBCLS), ' +
      'licenza <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/" target="_blank" rel="noopener">CC BY-SA 2.1 JP</a>. ' +
      'Le geometrie originali sono state modificate e integrate con strutture modellate appositamente. ' +
      'I modelli modificati sono distribuiti con la stessa licenza CC BY-SA 2.1 JP.</p></section>' +
    '<section class="an-sec"><span class="an-label">Citazione</span>' +
      '<p class="an-cite">Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res 2009.</p></section>' +
    '<section class="an-sec"><span class="an-label">Autore</span>' +
      '<p>Ideato e realizzato da <strong>Dott. Giovanni Chiodi</strong>, medico radiologo.</p></section>';

  var anchor = document.currentScript;
  if (anchor && anchor.parentNode === document.body) anchor.after(home, btn, scrim, panel);
  else document.body.prepend(home, btn, scrim, panel);

  function setOpen(open, refocus){
    panel.hidden = !open;
    scrim.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) panel.focus({ preventScroll: true });
    else if (refocus) btn.focus();
  }
  btn.addEventListener('click', function(){ setOpen(panel.hidden); });
  panel.querySelector('.an-close').addEventListener('click', function(){ setOpen(false, true); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !panel.hidden) setOpen(false, true);
  });
  /* tocco fuori dal pannello (anche sullo sfondo attenuato): chiude */
  document.addEventListener('pointerdown', function(e){
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
})();
