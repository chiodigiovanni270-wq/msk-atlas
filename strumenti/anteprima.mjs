/* Genera l'anteprima di un modello per la card della homepage.

   Uso (dalla cartella del progetto, con il server locale attivo sulla porta 8000):
     python3 -m http.server 8000                       (in un altro terminale)
     node strumenti/anteprima.mjs <nome> [--zoom=1] [--dy=0] [--w=1600] [--out=percorso.jpg] [--sezione=dito]
           [--vista=lat] [--dx=0] [--ruota=0] [--inclina=0]

   Esempio:
     node strumenti/anteprima.mjs ginocchio-3d
     → apre http://localhost:8000/modelli/ginocchio-3d.html e salva assets/anteprime/ginocchio-3d.jpg

   Opzioni:
     --zoom  ingrandimento del ritaglio (1 = canvas intero, 1.2 = 20% più vicino)
     --dy    spostamento verticale del ritaglio, in frazione dell'altezza (es. -0.05 = più in alto)
     --w     larghezza dell'immagine in px (altezza = 5/8); default 1600, nitida anche su schermi retina
     --out   percorso di uscita alternativo (utile per fare prove senza sovrascrivere)
     --dx    spostamento orizzontale del ritaglio, in frazione della larghezza (es. -0.1 = più a sinistra)
     --vista    vista di partenza: data-view di un pulsante del modello (ant, post, lat, med)
     --ruota    rotazione orizzontale della vista iniziale in gradi, come trascinando col dito (es. 40)
     --inclina  rotazione verticale in gradi (es. 10)
     --sezione  sezione del modello da aprire (ancora nell'URL), es. --sezione=dito per polso-dito-3d#dito;
             il file di default diventa assets/anteprime/<sezione>-3d.jpg

   Come funziona: avvia Chrome headless con un profilo temporaneo (non tocca il tuo),
   apre il modello a 1600×1000 con densità 2, aspetta che #load sia nascosto (modello costruito),
   cattura solo il canvas 3D nella vista iniziale e lo compone su sfondo con la palette scura
   della homepage, JPEG qualità 0.82.

   Requisiti: Node 22 o successivo (WebSocket integrato), Chrome (vedi lib-chrome.mjs). */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avviaChrome, apriModello, espressioneCattura, verificaModello, ruotaVista } from './lib-chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--'));
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Uso: node strumenti/anteprima.mjs <nome> [--zoom=1] [--dy=0] [--w=1600] [--out=percorso.jpg]');
  process.exit(1);
}
const zoom = Number(opt('zoom') || 1), dy = Number(opt('dy') || 0), dx = Number(opt('dx') || 0);
const vista = opt('vista');
if (vista && !/^[a-z]+$/.test(vista)) { console.error('--vista: es. ant, post, lat, med'); process.exit(1); }
const ruota = Number(opt('ruota') || 0), inclina = Number(opt('inclina') || 0);
const W = Math.round(Number(opt('w') || 1600)), H = Math.round(W * 5 / 8);
const sezione = opt('sezione');
if (sezione && !/^[a-z0-9-]+$/.test(sezione)) { console.error('--sezione: solo lettere minuscole, cifre e trattini'); process.exit(1); }
const out = resolve(opt('out') || join(ROOT, 'assets', 'anteprime', `${sezione ? sezione + '-3d' : name}.jpg`));
const url = (await verificaModello(name)) + (sezione ? `#${sezione}` : '');

const chrome = await avviaChrome();
try {
  await apriModello(chrome, url, 1600, 1000, 2);
  if (vista) {
    const ok = await chrome.evaluate(`(() => { const b = document.querySelector('.views button[data-view="${vista}"]'); if (b) b.click(); return !!b; })()`);
    if (!ok) console.warn(`Attenzione: vista "${vista}" non trovata, uso la vista iniziale.`);
    await new Promise(r => setTimeout(r, 1500));
  }
  await ruotaVista(chrome, 1600, 1000, ruota, inclina);
  const res = await chrome.evaluate(espressioneCattura(W, H, zoom, dy, 'image/jpeg', 0.82, dx));
  if (res.error) throw new Error(res.error);
  const buf = Buffer.from(res.data.split(',')[1], 'base64');
  writeFileSync(out, buf);
  console.log(`Salvata ${relative(process.cwd(), out)} (${W}×${H}, ${Math.round(buf.length / 1024)} KB)`);
} finally {
  await chrome.chiudi();
}
