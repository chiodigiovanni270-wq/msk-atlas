/* Genera le immagini Open Graph / Twitter card (1200×630, JPEG) delle pagine del sito.

   Uso (dalla cartella del progetto, con il server locale attivo sulla porta 8000):
     node strumenti/server.mjs                         (in un altro terminale)
     node strumenti/og.mjs [pagina …]
   Senza argomenti genera tutte le pagine; altrimenti solo quelle indicate (home, spalla-3d, gomito-3d, polso-dito-3d, anca-3d, ginocchio-3d).

   Esempio:
     node strumenti/og.mjs ginocchio-3d
     → salva assets/og/ginocchio-3d.jpg
     node strumenti/og.mjs --lingua=en ginocchio-3d
     → salva assets/og/en/ginocchio-3d.jpg, con i testi inglesi di PAGINE_EN (la build la usa per la pagina /en/ se esiste)

   Come funziona: parte dall'anteprima già presente in assets/anteprime/ (non la rigenera), la compone su
   uno sfondo con la stessa palette scura della homepage e aggiunge marchio, distretto e sottotitolo con i font del sito
   (Figtree e Spectral da Google Fonts, come le pagine; senza rete ripiega sui font di sistema).
   Le immagini sono JPEG perché WhatsApp e Facebook gestiscono male il WebP. Se cambiano i testi o l'anteprima di un
   modello si rilancia lo script; il risultato dipende solo dall'anteprima e dalle tabelle PAGINE qui sotto.

   Requisiti: Node 22 o successivo (WebSocket integrato), Chrome (vedi lib-chrome.mjs). */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avviaChrome, SERVER, SFONDO } from './lib-chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200, H = 630;

/* titolo grande, riga sotto e anteprima da usare; `home` ha il marchio come titolo */
const PAGINE = {
  home: { titolo: 'MSK <span>Atlas</span>', riga: 'Atlante anatomico 3D', nota: 'Anatomia muscolo-scheletrica da esplorare in tre dimensioni.', img: 'polso-dito-3d' },
  'spalla-3d': { titolo: 'Spalla', img: 'spalla-3d' },
  'gomito-3d': { titolo: 'Gomito', img: 'gomito-3d' },
  'polso-dito-3d': { titolo: 'Polso e dito', img: 'polso-dito-3d' },
  'anca-3d': { titolo: 'Anca', img: 'anca-3d' },
  'ginocchio-3d': { titolo: 'Ginocchio', img: 'ginocchio-3d' },
  'caviglia-3d': { titolo: 'Caviglia', img: 'caviglia-3d' },
};

/* versione inglese: stessi campi, testi tradotti */
const PAGINE_EN = {
  home: { riga: '3D anatomy atlas', nota: 'Musculoskeletal anatomy to explore in three dimensions.' },
  'spalla-3d': { titolo: 'Shoulder' }, 'gomito-3d': { titolo: 'Elbow' }, 'polso-dito-3d': { titolo: 'Wrist and finger' },
  'anca-3d': { titolo: 'Hip' }, 'ginocchio-3d': { titolo: 'Knee' }, 'caviglia-3d': { titolo: 'Ankle' },
};
const en = process.argv.includes('--lingua=en');
const T = en ? { lang: 'en', modello: 'Interactive 3D model', atlante: '3D anatomy atlas', dir: join('og', 'en') } : { lang: 'it', modello: 'Modello 3D interattivo', atlante: 'Atlante anatomico 3D', dir: 'og' };
if (en) for (const n of Object.keys(PAGINE)) PAGINE[n] = { ...PAGINE[n], ...PAGINE_EN[n] };

const richieste = process.argv.slice(2).filter(a => !a.startsWith('--'));
const nomi = richieste.length ? richieste : Object.keys(PAGINE);
for (const n of nomi) if (!PAGINE[n]) { console.error(`Pagina sconosciuta: ${n}. Valide: ${Object.keys(PAGINE).join(', ')}`); process.exit(1); }
try { await fetch(SERVER); } catch { console.error(`Server locale non raggiungibile su ${SERVER}.\nAvvialo dalla cartella del progetto: node strumenti/server.mjs`); process.exit(1); }

const grad = `radial-gradient(circle at 72% 45%, ${SFONDO.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`;
const pagina = p => `<!doctype html><html lang="${T.lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;600&family=Spectral:wght@500&display=swap">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#070a0d}
body{position:relative;background:${grad};color:#eef3f6;font:400 24px/1.3 "Figtree",system-ui,sans-serif}
img{position:absolute;right:-40px;top:0;height:${H}px;width:auto;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 22%);mask-image:linear-gradient(90deg,transparent 0,#000 22%)}
.testo{position:absolute;left:72px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center;gap:18px}
.marchio{display:flex;align-items:center;gap:14px;font-weight:600;font-size:22px;letter-spacing:.22em;text-transform:uppercase}
.marchio b{color:#72b4d0;font-weight:600}
.marchio img{position:static;height:44px;width:44px;-webkit-mask-image:none;mask-image:none}
h1{font:300 ${p.riga ? 112 : 96}px/1 "Figtree",system-ui,sans-serif;letter-spacing:-.045em}
h1 span{color:#72b4d0}
.riga{font-size:40px;letter-spacing:-.02em;color:#72b4d0}
.nota{font-size:26px;line-height:1.35;color:#c8d3dc;max-width:470px}
.foot{position:absolute;left:72px;bottom:40px;font-size:20px;color:#93a1ae;letter-spacing:.02em}
</style></head><body>
<img src="${SERVER}/assets/anteprime/${p.img}.webp" alt="">
<div class="testo">
  ${p.riga ? '' : `<div class="marchio"><img src="${SERVER}/assets/favicon.svg" alt="">MSK <b>Atlas</b></div>`}
  <h1>${p.titolo}</h1>
  <p class="riga">${p.riga || T.modello}</p>
  ${p.nota ? `<p class="nota">${p.nota}</p>` : ''}
</div>
<div class="foot">${p.riga ? 'mskatlas.com' : T.atlante + ' · mskatlas.com'}</div>
</body></html>`;

mkdirSync(join(ROOT, 'assets', T.dir), { recursive: true });
const chrome = await avviaChrome();
try {
  await chrome.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  for (const n of nomi) {
    await chrome.cdp('Page.navigate', { url: `${SERVER}/404.html` });   // pagina HTML della stessa origine: le immagini si caricano senza restrizioni
    await new Promise(r => setTimeout(r, 300));
    await chrome.evaluate(`document.open(); document.write(${JSON.stringify(pagina(PAGINE[n]))}); document.close();`);
    await chrome.evaluate(`(async () => {
      await new Promise(r => { if (document.readyState === 'complete') r(); else addEventListener('load', r, { once: true }); });
      await Promise.race([ Promise.all([document.fonts.load('300 100px Figtree'), document.fonts.load('600 20px Figtree'), document.fonts.load('400 20px Figtree')]), new Promise(r => setTimeout(r, 8000)) ]);
      await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
      return true;
    })()`);
    const { result } = await chrome.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
    const buf = Buffer.from(result.data, 'base64');
    const out = join(ROOT, 'assets', T.dir, `${n}.jpg`);
    writeFileSync(out, buf);
    console.log(`Salvata ${relative(process.cwd(), out)} (${W}×${H}, ${Math.round(buf.length / 1024)} KB)`);
  }
} finally {
  await chrome.chiudi();
}
