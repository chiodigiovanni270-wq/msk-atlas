/* Genera le icone della web app (schermata Home) e favicon.ico da assets/favicon.svg.

   Uso (dalla cartella del progetto; non serve il server locale):
     node strumenti/icone.mjs
     → salva in assets/icone/: apple-touch-icon.png 180×180, icon-48.png, icon-192.png, icon-512.png, icon-512-maskable.png
     → salva favicon.ico (16, 32 e 48 px, PNG incorporati) nella radice del sito, per i browser che lo cercano lì
       (Google richiede un favicon di lato multiplo di 48 px: sono icon-48.png e l'immagine da 48 px dell'.ico)

   Come funziona: disegna in Chrome headless il favicon o il suo simbolo (femore e tibia) e lo esporta in PNG.
   Il simbolo sta in un cerchio di raggio R attorno al centro (32,32) del favicon.
   - apple-touch-icon (iOS): quadrato pieno, perché iOS lo ritaglia con la sua forma (squircle). Il bordo azzurro
     BORDO arriva fino al margine e il fondo SFONDO è una superellisse (esponente N_IOS) rientrata di SPESSORE:
     così la cornice segue il contorno di iOS con spessore costante, anche negli angoli. Simbolo come nel favicon;
   - icon-48 (Google, risultati di ricerca), icon-192 e icon-512 ("any": installazione da Chrome su computer e Android):
     il favicon intero, con la sua tessera arrotondata e gli angoli trasparenti;
   - icona "maskable": fondo pieno senza bordo (Android la ritaglia in forme diverse), simbolo con raggio pari
     al 40% del lato, cioè dentro la zona sicura (cerchio dell'80% centrale);
   - favicon.ico: il favicon intero (tessera compresa), a 16, 32 e 48 px.

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

const N_IOS = 5;          // superellisse che approssima la forma delle icone iOS
const SPESSORE = 0.034;  // spessore della cornice iOS, frazione del lato

const ICONE = [
  { file: 'apple-touch-icon.png', lato: 180, tipo: 'ios' },
  { file: 'icon-48.png', lato: 48, tipo: 'tessera' },
  { file: 'icon-192.png', lato: 192, tipo: 'tessera' },
  { file: 'icon-512.png', lato: 512, tipo: 'tessera' },
  { file: 'icon-512-maskable.png', lato: 512, tipo: 'maskable' },
];
const ICO = [16, 32, 48];

/* simbolo: gli elementi del favicon tranne la tessera (<rect>) e i commenti */
const favicon = readFileSync(join(ROOT, 'assets', 'favicon.svg'), 'utf8');
const simbolo = (favicon.match(/<(path|circle)\b[^>]*\/>/g) || []).join('');
if (!simbolo) { console.error('Nessun <path> o <circle> trovato in assets/favicon.svg'); process.exit(1); }

/* superellisse |x/a|^n + |y/a|^n = 1 di centro (c,c), come percorso SVG */
const superellisse = (c, a, n) => {
  const p = [];
  for (let i = 0; i < 360; i++) {
    const t = i / 360 * 2 * Math.PI, co = Math.cos(t), si = Math.sin(t);
    p.push(`${(c + a * Math.sign(co) * Math.abs(co) ** (2 / n)).toFixed(3)} ${(c + a * Math.sign(si) * Math.abs(si) ** (2 / n)).toFixed(3)}`);
  }
  return `M${p.join(' L')}Z`;
};

/* SVG quadrato con fondo pieno: viewBox centrato su (32,32) e largo quanto basta perché R valga k del lato */
const svg = (k, cornice) => {
  const v = R / k, o = 32 - v / 2;
  const fondo = cornice
    ? `<rect x="${o}" y="${o}" width="${v}" height="${v}" fill="${BORDO}"/><path d="${superellisse(32, v / 2 * (1 - 2 * SPESSORE), N_IOS)}" fill="${SFONDO}"/>`
    : `<rect x="${o}" y="${o}" width="${v}" height="${v}" fill="${SFONDO}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o} ${o} ${v} ${v}">${fondo}${simbolo}</svg>`;
};

/* simbolo come nel favicon: raggio R pari al 42% del lato */
const disegno = tipo =>
  tipo === 'ios' ? { testo: svg(0.42, true), alpha: false }
  : tipo === 'tessera' ? { testo: favicon, alpha: true }
  : { testo: svg(0.40, false), alpha: false };

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
  for (const { file, lato, tipo } of ICONE) {
    const { testo, alpha } = disegno(tipo);
    salva(join(OUT, file), await png(chrome, testo, lato, alpha), `${lato}×${lato}`);
  }
  const piccole = [];
  for (const lato of ICO) piccole.push({ lato, buf: await png(chrome, favicon, lato, true) });
  salva(join(ROOT, 'favicon.ico'), ico(piccole), ICO.join(', ') + ' px');
} finally {
  await chrome.chiudi();
}
