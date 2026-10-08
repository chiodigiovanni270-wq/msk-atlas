/* Genera la sequenza di fotogrammi della prima schermata della homepage: il modello ruota di 360°
   attorno all'asse verticale e la pagina mostra il fotogramma corrispondente allo scorrimento.

   Uso (dalla cartella del progetto, con il server locale attivo sulla porta 8000):
     python3 -m http.server 8000                       (in un altro terminale)
     node strumenti/sequenza-home.mjs <nome> [--passo=4] [--dist=1.4] [--alza=0] [--w=2200] [--ws=1700] [--vista=2240] [--ritaglio=0.25,0.04,0.75,0.98] [--prova]

   Esempio:
     node strumenti/sequenza-home.mjs polso-dito-3d
     → salva assets/sequenza/polso-dito-3d/l/000.webp … (per computer)
       e    assets/sequenza/polso-dito-3d/s/000.webp … (per smartphone)
       WebP con sfondo trasparente, ritagliati sul modello: il fondo e la luce attorno li disegna la pagina.
     Alla fine stampa i valori da scrivere in index.html (data-frames, data-crop).

   Opzioni:
     --passo  px di trascinamento per fotogramma: un giro = 698 px, quindi 4 → 175 fotogrammi (~2° l'uno)
     --dist   distanza della camera rispetto a quella iniziale (1.4 = modello intero con un po' di margine;
              l'ingrandimento iniziale lo fa la pagina)
     --alza   elevazione della camera rispetto a quella iniziale, in radianti (negativo = più dal basso)
     --w      larghezza che avrebbe l'intero fotogramma grande; --ws dei piccoli (altezza = 5/8).
              Il file salvato è solo il ritaglio, quindi più stretto (es. 2200 → 1100 px)
     --vista  larghezza della finestra di rendering (altezza = 5/8), densità 1: deve essere ≥ --w. Non usare
              densità > 1: il modello cambierebbe inquadratura. Con vista 2240 il canvas è 2240×1400
     --ritaglio  x0,y0,x1,y1 in frazioni del fotogramma intero: area che contiene il modello in ogni
              angolazione (si verifica con --prova e guardando i fotogrammi a metà giro). Va in data-crop
     --prova  salva solo il primo fotogramma (per regolare --dist e --alza)

   Come funziona: apre il modello in Chrome headless e nasconde l'interfaccia; poi usa i comandi del
   modello come farebbe una persona (rotella per la distanza, trascinamento orizzontale per la rotazione:
   0,009 rad per px e 0,0012 per unità di rotella, i valori del codice comune dei modelli) e a ogni
   fotogramma cattura il canvas (trasparente). Il file del modello non viene modificato.

   Requisiti: Node 22 o successivo, Chrome (vedi lib-chrome.mjs). */
import { writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avviaChrome, apriModello, espressioneCatturaTrasparente, verificaModello } from './lib-chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--'));
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Uso: node strumenti/sequenza-home.mjs <nome> [--passo=4] [--dist=1.4] [--alza=0] [--w=2200] [--ws=1700] [--vista=2240] [--ritaglio=0.25,0.04,0.75,0.98] [--prova]');
  process.exit(1);
}
const passo = Math.max(1, Math.round(Number(opt('passo') || 4)));
const dist = Number(opt('dist') || 1.4), alza = Number(opt('alza') || 0);
const W = Math.round(Number(opt('w') || 2200)), WS = Math.round(Number(opt('ws') || 1700));
const scala = Number(opt('scala') || 1), vista = Math.round(Number(opt('vista') || 2240));
const ritaglio = (opt('ritaglio') || '0.25,0.04,0.75,0.98').split(',').map(Number);
const prova = args.includes('--prova');
const GIRO = Math.round(2 * Math.PI / 0.009);          // px di trascinamento per un giro completo
const N = prova ? 1 : Math.round(GIRO / passo);

const dir = join(ROOT, 'assets', 'sequenza', name);
const cartelle = [join(dir, 'l'), join(dir, 's')];
for (const c of cartelle) {
  if (!prova) rmSync(c, { recursive: true, force: true });   // niente fotogrammi avanzati da una sequenza più lunga
  mkdirSync(c, { recursive: true });
}

const url = await verificaModello(name);
const chrome = await avviaChrome();
try {
  await apriModello(chrome, url, vista, Math.round(vista * 5 / 8), scala);
  // interfaccia nascosta: gli eventi arrivano direttamente al canvas
  await chrome.evaluate(`(() => { const s = document.createElement('style');
    s.textContent = 'body > :not(canvas){display:none !important}'; document.head.appendChild(s); })()`);
  const mouse = (type, x, y, extra = {}) => chrome.cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
  const X0 = 1400, Y0 = 500;
  if (dist !== 1) await mouse('mouseWheel', 800, Y0, { button: 'none', deltaX: 0, deltaY: Math.log(dist) / 0.0012 });
  await mouse('mousePressed', X0, Y0, { buttons: 1, clickCount: 1 });
  const dyAlza = Math.round(alza / 0.009);            // trascinare in basso alza la camera
  if (dyAlza) await mouse('mouseMoved', X0, Y0 + dyAlza, { buttons: 1 });
  const t = Date.now();
  for (let i = 0; i < N; i++) {
    if (i) await mouse('mouseMoved', X0 - i * passo, Y0 + dyAlza, { buttons: 1 });
    const res = await chrome.evaluate(espressioneCatturaTrasparente([W, WS], 'image/webp', 0.72, ritaglio));
    if (res.error) throw new Error(res.error);
    res.data.forEach((d, k) => writeFileSync(join(cartelle[k], `${String(i).padStart(3, '0')}.webp`), Buffer.from(d.split(',')[1], 'base64')));
    if (i % 10 === 9) process.stdout.write(`\r${i + 1}/${N} fotogrammi (${Math.round((Date.now() - t) / 1000)} s)`);
  }
  await mouse('mouseReleased', X0 - N * passo, Y0 + dyAlza, { buttons: 0, clickCount: 1 });
  for (const c of cartelle) {
    const kb = readdirSync(c).reduce((s, f) => s + statSync(join(c, f)).size, 0) / 1024;
    console.log(`\nSalvati ${N} fotogrammi in ${relative(process.cwd(), c)}/ (${Math.round(kb)} KB in tutto)`);
  }
  if (!prova) console.log(`In index.html: data-frames="${N}" e data-crop="${ritaglio.join(',')}" data-src="assets/sequenza/${name}/"`);
} finally {
  await chrome.chiudi();
}
