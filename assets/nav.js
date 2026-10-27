/* Navigazione comune dei modelli: pulsante fluttuante per tornare alla home (in alto a sinistra)
   e pulsante "i" (in alto a destra) con avvertenza e crediti. Niente barra a tutta larghezza.
   Da includere subito dopo <body>:  <script src="../assets/nav.js"></script>
   Non tocca la logica del modello: aggiunge solo elementi sopra il canvas e
   allarga i margini laterali della barra .top del modello per fare posto ai due pulsanti;
   da 900 px porta il selettore di sezione sulla fila dei due pulsanti (alti 44 px) e il titolo sotto.
   Sostituisce il menu "Vista" con un indicatore di orientamento (Ant/Post/Lat/Med) che segue la camera.
   Pannello "i": su smartphone foglio dal basso con sfondo attenuato, da 640 px riquadro sotto la "i". */
(function(){
  /* tema scuro sempre, indipendentemente dal sistema: i modelli definiscono
     :root[data-theme="dark"]. Primo passo, prima che il resto della pagina venga disegnato. */
  document.documentElement.setAttribute('data-theme', 'dark');
  document.documentElement.style.colorScheme = 'dark';

  /* Vercel Web Analytics (senza cookie): stesso snippet di index.html e 404.html, caricato una sola volta.
     In locale lo script risponde 404: è normale, funziona solo sul sito online. */
  window.va = window.va || function(){ (window.vaq = window.vaq || []).push(arguments); };
  if (!document.querySelector('script[src="/_vercel/insights/script.js"]')) {
    var va = document.createElement('script');
    va.defer = true;
    va.src = '/_vercel/insights/script.js';
    document.head.appendChild(va);
  }

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
    /* il menu "Vista" dei modelli è sostituito dall'indicatore di orientamento (.an-orient, sotto) */
    '.top .views{display:none!important}' +
    /* indicatore di orientamento: bussola anatomica sotto la "i", ruota con la camera (vedi sotto) */
    '.an-orient{position:fixed;z-index:18;top:calc(' + TOP + ' + ' + BTN + ' + 8px);right:' + SIDE_R + ';width:96px;height:72px;' +
      'pointer-events:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}' +
    '.an-orient svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}' +
    '.an-orient ellipse{fill:rgba(13,17,22,.5);stroke:var(--glass-bd,rgba(255,255,255,.13));stroke-width:1}' +
    '.an-orient button{text-shadow:0 1px 3px rgba(0,0,0,.7);position:absolute;left:0;top:0;pointer-events:auto;margin:0;padding:0;border:0;border-radius:999px;' +
      'width:34px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink,#e5eaef);' +
      'font:600 11px/1 ' + SANS + ';letter-spacing:.02em;will-change:transform,opacity;' + 'background:transparent}' +
    '.an-orient button[hidden]{display:none}' +
    '.an-orient button.an-front{background:var(--accent,#72b4d0);color:var(--bg-lo,#0d1116)}' +
    '.an-orient button.an-flipb{z-index:0;width:26px;height:26px;font-size:14px;color:var(--muted,#93a1ae);' + GLASS + '}' +
    '.an-orient button:focus-visible{outline:2px solid var(--accent,#72b4d0);outline-offset:1px}' +
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
      '.top .sect{position:fixed;top:' + TOP + ';box-sizing:border-box;height:' + BTN + ';margin:0;padding:4px;align-items:stretch}' +
      '.top .sect{left:calc(' + SIDE + ' + ' + HOMEW + ' + 8px)}' +
      '.top .sect button{padding:0 14px;font-size:14px;font-weight:500}' +
      '.an-orient{width:112px;height:80px}' +
    '}' +
    /* sfondo di riserva sotto il gradiente del modello: Safari iOS lo usa per la fascia sotto la barra del browser.
       #11161c = colore del gradiente al centro del bordo inferiore, così la fascia non stacca */
    'body{background-color:#11161c}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var CHEVRON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

  /* elenco delle strutture del modello (da <meta name="strutture-bp3d|modellate|escluse">, se presenti) */
  function strutture(){
    /* sezione del modello nell'ancora (es. #dito): usa <meta name="strutture-…-dito"> se c'è, altrimenti quello generale */
    var sez = location.hash.replace('#', '');
    function meta(n){
      var m = (sez && document.querySelector('meta[name="strutture-' + n + '-' + sez + '"]')) || document.querySelector('meta[name="strutture-' + n + '"]');
      return m ? m.content : '';
    }
    function esc(t){ return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    var righe = [['Da BodyParts3D', meta('bp3d')], ['Ricostruite', meta('modellate')], ['Non incluse', meta('escluse')]]
      .filter(function(r){ return r[1]; });
    if (!righe.length) return '';
    return '<section class="an-sec"><span class="an-label">Strutture del modello</span>' +
      righe.map(function(r){ return '<p><strong>' + r[0] + '.</strong> ' + esc(r[1]) + '</p>'; }).join('') + '</section>';
  }

  /* riga «Lingua»: solo se la build ha aggiunto i <link rel="alternate" hreflang> (pagina pubblicata in entrambe le lingue) */
  function lingua(){
    var it = document.querySelector('link[rel="alternate"][hreflang="it"]'), en = document.querySelector('link[rel="alternate"][hreflang="en"]');
    if (!it || !en) return '';
    var inglese = document.documentElement.lang === 'en', altra = inglese ? it : en;
    var link = '<a href="' + new URL(altra.href).pathname + '" hreflang="' + (inglese ? 'it' : 'en') + '" lang="' + (inglese ? 'it' : 'en') + '" data-lingua>' +
      (inglese ? 'Italiano' : 'English') + '</a>';
    var corrente = '<strong aria-current="page">' + (inglese ? 'English' : 'Italiano') + '</strong>';
    return '<section class="an-sec"><span class="an-label">Lingua</span><p>' + (inglese ? link + ' · ' + corrente : corrente + ' · ' + link) + '</p></section>';
  }

  var home = document.createElement('a');
  home.className = 'an-home';
  home.href = HOME;
  home.setAttribute('aria-label', 'Torna all’indice di MSK Atlas');
  home.innerHTML = '<span class="an-ico">' + CHEVRON + '</span>' +
    '<img src="../assets/favicon.svg?v=4" width="24" height="24" alt=""><span class="an-name">MSK <b>Atlas</b></span>';

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
    lingua() +
    '<section class="an-sec an-warn"><span class="an-label">Avvertenza</span>' +
      '<p><strong>Materiale didattico.</strong> Non destinato a uso clinico o diagnostico.</p></section>' +
    '<section class="an-sec"><span class="an-label">Fonte e licenza</span>' +
      '<p>I modelli sono derivati da <strong>BodyParts3D</strong>, © The Database Center for Life Science (DBCLS), ' +
      'licensed under <a href="https://creativecommons.org/licenses/by/4.0/deed.it" target="_blank" rel="noopener">CC Attribution 4.0 International</a> (CC BY 4.0); ' +
      'per i dati delle versioni precedenti del database vale la <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/" target="_blank" rel="noopener">CC BY-SA 2.1 JP</a>. ' +
      'Le geometrie originali sono state modificate e integrate con strutture modellate appositamente. ' +
      'Per prudenza i modelli modificati sono distribuiti con la licenza più restrittiva, CC BY-SA 2.1 JP.</p></section>' +
    strutture() +
    '<section class="an-sec"><span class="an-label">Citazione</span>' +
      '<p class="an-cite">Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res 2009.</p></section>' +
    '<section class="an-sec"><span class="an-label">Autore</span>' +
      '<p>Ideato e realizzato da <strong>Dott. Giovanni Chiodi</strong>, medico radiologo.</p></section>';

  var anchor = document.currentScript;
  /* Modulo comune per segnalazioni: nessuna modifica ai dati anatomici. */
  if (anchor && anchor.src) {
    var reportJS = document.createElement('script');
    reportJS.src = new URL('segnala.js', anchor.src).href;
    document.head.appendChild(reportJS);
  }
  /* scheda struttura su smartphone (foglio compatto): file a parte, stesso percorso di nav.js */
  if (anchor && anchor.src) { var sk = document.createElement('script'); sk.src = anchor.src.replace(/nav\.js([?#].*)?$/, 'scheda.js'); document.head.appendChild(sk); }
  /* Ricerca comune: UI esterna, catalogo e selezione forniti dalla tavola corrente. */
  if (anchor && anchor.src) {
    var searchCSS=document.createElement('link'); searchCSS.rel='stylesheet';
    searchCSS.href=new URL('ricerca-modello.css',anchor.src).href; document.head.appendChild(searchCSS);
    var searchJS=document.createElement('script');
    searchJS.src=new URL('ricerca-modello.js',anchor.src).href; document.head.appendChild(searchJS);
  }
  if (anchor && anchor.parentNode === document.body) anchor.after(home, btn, scrim, panel);
  else document.body.prepend(home, btn, scrim, panel);

  /* cambio lingua: conserva ?struttura= e la sezione (#dito) */
  panel.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[data-lingua]');
    if (a) a.href = a.pathname + location.search + location.hash;
  });

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

  /* indicatore di orientamento: ellisse vista dall'alto con le quattro direzioni anatomiche.
     Il codice dei modelli è in una funzione chiusa (cam e VIEWS non sono raggiungibili) e non si tocca:
     la camera si legge da render() del renderer del modello (si avvolge THREE.WebGLRenderer non appena THREE è caricato).
     Azimut θ della camera: la direzione di guardata è (−sinθ, ·, −cosθ). Gli angoli da cui si guarda ogni lato
     sono quelli dei modelli: ant 0, post π, lat −π/2 e med π/2; quando il gruppo del modello è capovolto (⇅ in gomito e polso,
     rotation.z ≠ 0) lat e med si scambiano. Un lato a angolo α compare a x = sin(α − θ), profondità cos(α − θ):
     davanti = in basso ed evidenziato, dietro = in alto e attenuato. Un tocco sull'etichetta preme il pulsante di vista
     del modello (che resta nel DOM, nascosto). */
  var DIR = [['ant', 'Ant', 'anteriore'], ['post', 'Post', 'posteriore'], ['lat', 'Lat', 'laterale'], ['med', 'Med', 'mediale']];
  var seen = null;   /* ultima camera e scena viste dal renderer del modello */
  var orient = document.createElement('div');
  orient.className = 'an-orient';
  orient.setAttribute('role', 'group');
  orient.setAttribute('aria-label', 'Orientamento: tocca un lato per guardarlo di fronte');
  orient.innerHTML = '<svg viewBox="0 0 96 72" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="48" cy="36" rx="33" ry="22"/></svg>';
  var labs = DIR.map(function(d){
    var b = document.createElement('button');
    b.type = 'button';
    b.dataset.d = d[0];
    b.setAttribute('aria-label', 'Vista ' + d[2]);
    b.title = d[2].charAt(0).toUpperCase() + d[2].slice(1);
    b.textContent = d[1];
    b.addEventListener('click', function(){
      var src = document.querySelector('.views button[data-view="' + d[0] + '"]');
      if (src) src.click();
    });
    orient.appendChild(b);
    return b;
  });
  var flipb = document.createElement('button');
  flipb.type = 'button';
  flipb.className = 'an-flipb';
  flipb.textContent = '⇅';
  flipb.hidden = true;
  flipb.addEventListener('click', function(){ var f = document.getElementById('bFlip'); if (f) f.click(); });
  orient.appendChild(flipb);
  document.body.appendChild(orient);

  var last = '';
  function hook(){
    var T = window.THREE;
    if (!T || !T.WebGLRenderer || T.WebGLRenderer.__anHook) return;
    var Orig = T.WebGLRenderer;   /* in r128 render è un metodo dell'istanza, non del prototipo: si avvolge il costruttore */
    var Wrapped = function(){
      var r = new (Function.prototype.bind.apply(Orig, [null].concat([].slice.call(arguments))))();
      var o = r.render;
      r.render = function(scene, camera){ seen = { scene: scene, camera: camera }; return o.apply(r, arguments); };
      return r;
    };
    Wrapped.prototype = Orig.prototype;
    Wrapped.__anHook = true;
    T.WebGLRenderer = Wrapped;
  }
  /* il costruttore va avvolto prima che il modello crei il renderer (subito dopo three.js): si ascolta l'evento load del tag di three */
  function watch(n){ if (n.tagName === 'SCRIPT' && /three/.test(n.src || '')) { n.addEventListener('load', hook); hook(); } }
  hook();
  new MutationObserver(function(ms){ ms.forEach(function(m){ [].forEach.call(m.addedNodes, watch); }); }).observe(document, { childList: true, subtree: true });
  function frame(){
    hook();
    if (seen && seen.camera) {
      var m = seen.camera.matrixWorld.elements;   /* terza colonna = asse z della camera: la camera guarda verso −z */
      var th = Math.atan2(m[8], m[10]);
      var grp = seen.scene.children.filter(function(o){ return o.type === 'Group'; })[0];
      var up = grp && Math.abs(grp.rotation.z) > 0.01;
      var A = { ant: 0, post: Math.PI, lat: up ? Math.PI / 2 : -Math.PI / 2, med: up ? -Math.PI / 2 : Math.PI / 2 };
      var W = orient.offsetWidth, H = orient.offsetHeight;
      var key = [th.toFixed(3), up, W].join();
      if (W && key !== last) {
        last = key;
        var rx = W * 0.344, ry = H * 0.31, best = null, bz = -2;
        labs.forEach(function(b){
          var d = A[b.dataset.d] - th, z = Math.cos(d), x = Math.sin(d);
          var sc = 0.82 + 0.18 * (z + 1) / 2;
          b.style.transform = 'translate(' + (W / 2 + x * rx - 17).toFixed(1) + 'px,' + (H / 2 + z * ry - 13).toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
          b.style.opacity = (0.5 + 0.5 * (z + 1) / 2).toFixed(2);
          b.style.zIndex = Math.round((z + 1) * 10);
          b.classList.remove('an-front');
          if (z > bz) { bz = z; best = b; }
        });
        if (best && bz > 0.8) best.classList.add('an-front');
        flipb.hidden = !document.getElementById('bFlip');
        flipb.style.transform = 'translate(' + (W / 2 - 13) + 'px,' + (H / 2 - 13) + 'px)';
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

