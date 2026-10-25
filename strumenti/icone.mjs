/* Genera le icone della web app (schermata Home) da assets/favicon.svg.

   Uso (dalla cartella del progetto; non serve il server locale):
     node strumenti/icone.mjs
     → salva in assets/icone/: apple-touch-icon.png 180×180, icon-192.png, icon-512.png, icon-512-maskable.png

   Come funziona: prende dal favicon solo il simbolo (femore e tibia), senza la tessera
   arrotondata, perché iOS e Android ritagliano già l'icona con la loro forma. Lo disegna in
   Chrome headless su sfondo pieno #161c23 (nessuna trasparenza) e lo esporta in PNG.
   Il simbolo sta in un cerchio di raggio R attorno al centro (32,32) del favicon:
   - icone "any": raggio pari al 36% del lato;
   - icona "maskable": raggio pari al 40% del lato, cioè dentro la zona sicura (cerchio dell'80% centrale).

   Requisiti: Node 22 o successivo, Chrome (vedi lib-chrome.mjs). */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avviaChrome } from './lib-chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'icone');
const SFONDO = '#161c23';
const R = 27;   // raggio del cerchio che contiene il simbolo, in unità del viewBox 64×64 del favicon

const ICONE = [
  { file: 'apple-touch-icon.png', lato: 180, k: 0.36 },
  { file: 'icon-192.png', lato: 192, k: 0.36 },
  { file: 'icon-512.png', lato: 512, k: 0.36 },
  { file: 'icon-512-maskable.png', lato: 512, k: 0.40 },
];

/* simbolo: gli elementi del favicon tranne la tessera (<rect>) e i commenti */
const favicon = readFileSync(join(ROOT, 'assets', 'favicon.svg'), 'utf8');
const simbolo = (favicon.match(/<(path|circle)\b[^>]*\/>/g) || []).join('');
if (!simbolo) { console.error('Nessun <path> o <circle> trovato in assets/favicon.svg'); process.exit(1); }

/* SVG quadrato: viewBox centrato su (32,32) e largo quanto basta perché R valga k del lato */
const svg = k => {
  const v = R / k, o = 32 - v / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o} ${o} ${v} ${v}">` +
    `<rect x="${o}" y="${o}" width="${v}" height="${v}" fill="${SFONDO}"/>${simbolo}</svg>`;
};

mkdirSync(OUT, { recursive: true });
const chrome = await avviaChrome();
try {
  for (const { file, lato, k } of ICONE) {
    const src = 'data:image/svg+xml;base64,' + Buffer.from(svg(k)).toString('base64');
    const res = await chrome.evaluate(`new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = ${lato};
        const g = c.getContext('2d', { alpha: false });
        g.fillStyle = '${SFONDO}'; g.fillRect(0, 0, ${lato}, ${lato});
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, ${lato}, ${lato});
        res({ data: c.toDataURL('image/png') });
      };
      img.onerror = () => res({ error: 'SVG non caricato' });
      img.src = ${JSON.stringify(src)};
    })`);
    if (res.error) throw new Error(res.error);
    const buf = Buffer.from(res.data.split(',')[1], 'base64');
    const out = join(OUT, file);
    writeFileSync(out, buf);
    console.log(`Salvata ${relative(process.cwd(), out)} (${lato}×${lato}, ${Math.round(buf.length / 1024)} KB)`);
  }
} finally {
  await chrome.chiudi();
}
