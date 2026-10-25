/* Genera le icone della web app (schermata Home) e favicon.ico da assets/favicon.svg.

   Uso (dalla cartella del progetto; non serve il server locale):
     node strumenti/icone.mjs
     → salva in assets/icone/: apple-touch-icon.png 180×180, icon-192.png, icon-512.png, icon-512-maskable.png
     → salva favicon.ico (16 e 32 px, PNG incorporati) nella radice del sito, per i browser che lo cercano lì

   Come funziona: prende dal favicon il simbolo (femore e tibia) e lo disegna in Chrome headless
   su sfondo pieno SFONDO (nessuna trasparenza, perché iOS e Android ritagliano già l'icona con la loro forma),
   poi lo esporta in PNG. Il simbolo sta in un cerchio di raggio R attorno al centro (32,32) del favicon.
   - icone "any" (iOS e installazione Android/desktop): come nella tessera del favicon, bordo azzurro BORDO
     arrotondato, rientrato dal margine e concentrico all'arrotondamento di iOS; simbolo con raggio pari al 42% del lato (proporzioni del favicon);
   - icona "maskable": senza bordo (Android la ritaglia in forme diverse), simbolo con raggio pari al 40% del lato,
     cioè dentro la zona sicura (cerchio dell'80% centrale);
   - favicon.ico: il favicon intero (tessera compresa).

   Requisiti: Node 22 o successivo, Chrome (vedi lib-chrome.mjs). */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avviaChrome } from './lib-chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'icone');
const SFONDO = '#0a131a';   // come la tessera del favicon
const BORDO = '#79c3e3';    // come il bordo del favicon
const R = 27;   // raggio del cerchio che contiene il simbolo, in unità del viewBox 64×64 del favicon

const ICONE = [
  { file: 'apple-touch-icon.png', lato: 180, k: 0.42, bordo: true },
  { file: 'icon-192.png', lato: 192, k: 0.42, bordo: true },
  { file: 'icon-512.png', lato: 512, k: 0.42, bordo: true },
  { file: 'icon-512-maskable.png', lato: 512, k: 0.40, bordo: false },
];
const ICO = [16, 32];

/* simbolo: gli elementi del favicon tranne la tessera (<rect>) e i commenti */
const favicon = readFileSync(join(ROOT, 'assets', 'favicon.svg'), 'utf8');
const simbolo = (favicon.match(/<(path|circle)\b[^>]*\/>/g) || []).join('');
if (!simbolo) { console.error('Nessun <path> o <circle> trovato in assets/favicon.svg'); process.exit(1); }

/* SVG quadrato: viewBox centrato su (32,32) e largo quanto basta perché R valga k del lato.
   Bordo: rientro 4,5% del lato, spessore 2,4%, raggio 17,5% (iOS arrotonda al 22,4% circa). */
const svg = (k, bordo) => {
  const v = R / k, o = 32 - v / 2;
  const i = v * 0.045, w = v * 0.024;
  const cornice = bordo
    ? `<rect x="${o + i}" y="${o + i}" width="${v - 2 * i}" height="${v - 2 * i}" rx="${v * 0.175}" fill="none" stroke="${BORDO}" stroke-width="${w}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o} ${o} ${v} ${v}">` +
    `<rect x="${o}" y="${o}" width="${v}" height="${v}" fill="${SFONDO}"/>${cornice}${simbolo}</svg>`;
};

/* disegna un SVG in PNG lato×lato; con trasparenza solo se alpha */
const png = async (chrome, testo, lato, alpha) => {
  const src = 'data:image/svg+xml;base64,' + Buffer.from(testo).toString('base64');
  const res = await chrome.evaluate(`new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = ${lato};
      const g = c.getContext('2d', { alpha: ${alpha} });
      if (!${alpha}) { g.fillStyle = '${SFONDO}'; g.fillRect(0, 0, ${lato}, ${lato}); }
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, ${lato}, ${lato});
      res({ data: c.toDataURL('image/png') });
    };
    img.onerror = () => res({ error: 'SVG non caricato' });
    img.src = ${JSON.stringify(src)};
  })`);
  if (res.error) throw new Error(res.error);
  return Buffer.from(res.data.split(',')[1], 'base64');
};

/* file .ico con immagini PNG incorporate (formato accettato da tutti i browser attuali) */
const ico = immagini => {
  const testa = Buffer.alloc(6 + 16 * immagini.length);
  testa.writeUInt16LE(0, 0); testa.writeUInt16LE(1, 2); testa.writeUInt16LE(immagini.length, 4);
  let pos = testa.length;
  immagini.forEach(({ lato, buf }, n) => {
    const e = 6 + 16 * n;
    testa.writeUInt8(lato % 256, e); testa.writeUInt8(lato % 256, e + 1);
    testa.writeUInt16LE(1, e + 4); testa.writeUInt16LE(32, e + 6);
    testa.writeUInt32LE(buf.length, e + 8); testa.writeUInt32LE(pos, e + 12);
    pos += buf.length;
  });
  return Buffer.concat([testa, ...immagini.map(x => x.buf)]);
};

const salva = (out, buf, cosa) => {
  writeFileSync(out, buf);
  console.log(`Salvata ${relative(process.cwd(), out)} (${cosa}, ${Math.round(buf.length / 1024)} KB)`);
};

mkdirSync(OUT, { recursive: true });
const chrome = await avviaChrome();
try {
  for (const { file, lato, k, bordo } of ICONE)
    salva(join(OUT, file), await png(chrome, svg(k, bordo), lato, false), `${lato}×${lato}`);
  const piccole = [];
  for (const lato of ICO) piccole.push({ lato, buf: await png(chrome, favicon, lato, true) });
  salva(join(ROOT, 'favicon.ico'), ico(piccole), ICO.join(' e ') + ' px');
} finally {
  await chrome.chiudi();
}
