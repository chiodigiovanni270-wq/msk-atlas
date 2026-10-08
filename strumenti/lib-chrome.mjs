/* Funzioni comuni a anteprima.mjs e video-home.mjs: avvio di Chrome headless,
   protocollo DevTools (CDP), attesa della costruzione del modello e sfondo dei fotogrammi.

   Chrome: il primo che esiste tra la variabile d'ambiente CHROME, Google Chrome su macOS
   e i percorsi Linux più comuni. Argomenti extra per Chrome (es. un proxy) in CHROME_ARGS,
   separati da spazi. Requisiti: Node 22 o successivo (WebSocket integrato). */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SERVER = 'http://localhost:8000';
const PORT = 9223;
const CHROMES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* sfondo dei fotogrammi: stessa palette scura della homepage (centro appena più chiaro, bordi = fondo pagina) */
export const SFONDO = [[0, '#1c242c'], [0.6, '#0f141a'], [1, '#070a0d']];

/* controlla che il server locale risponda e che il modello esista */
export async function verificaModello(name) {
  const url = `${SERVER}/modelli/${name}.html`;
  let status;
  try { status = (await fetch(url)).status; }
  catch {
    console.error(`Server locale non raggiungibile su ${SERVER}.\nAvvialo dalla cartella del progetto: python3 -m http.server 8000`);
    process.exit(1);
  }
  if (status !== 200) {
    console.error(`${url} risponde HTTP ${status}: controlla che esista modelli/${name}.html`);
    process.exit(1);
  }
  return url;
}

/* avvia Chrome headless con un profilo temporaneo; restituisce { cdp, evaluate, chiudi } */
export async function avviaChrome() {
  const exe = CHROMES.find(p => existsSync(p));
  if (!exe) { console.error('Chrome non trovato: indica il percorso con la variabile CHROME.'); process.exit(1); }
  const extra = (process.env.CHROME_ARGS || '').split(' ').filter(Boolean);
  const prof = mkdtempSync(join(tmpdir(), 'chrome-atlante-'));
  const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
    '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,1000', ...extra, 'about:blank'],
    { stdio: 'ignore' });

  let pages;
  for (let i = 0; i < 50 && !pages; i++) {
    try { pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(t => t.type === 'page'); }
    catch { await sleep(200); }
  }
  if (!pages || !pages.length) { chrome.kill(); throw new Error('Chrome headless non risponde'); }

  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const cdp = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expr => {
    const r = (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const chiudi = async () => {
    ws.close(); chrome.kill(); await sleep(300);
    rmSync(prof, { recursive: true, force: true });
  };
  return { cdp, evaluate, chiudi };
}

/* apre il modello e attende la fine della costruzione (max 90 s); senza #load aspetta 8 s */
export async function apriModello({ cdp, evaluate }, url, width, height, scale = 1) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await cdp('Page.navigate', { url });
  let built = false;
  for (let i = 0; i < 180; i++) {
    await sleep(500);
    let st;
    try { st = await evaluate(`(() => { const l = document.getElementById('load'); return l ? (l.hidden ? 'ok' : 'wait') : 'none'; })()`); }
    catch { continue; }   // pagina ancora in navigazione
    if (st === 'ok') { built = true; break; }
    if (st === 'none' && i >= 16) break;
  }
  if (!built) console.warn('Attenzione: #load non trovato o ancora visibile, catturo comunque.');
  await sleep(1500);
}

/* espressione JS che, al prossimo fotogramma, compone il canvas del modello su SFONDO
   e restituisce { data } (data URL) o { error }. W×H = uscita; z = ingrandimento; dy = spostamento verticale */
export function espressioneCattura(W, H, z, dy, tipo = 'image/jpeg', qualita = 0.82) {
  return `new Promise(res => requestAnimationFrame(() => {
    const c = document.getElementById('c') || document.querySelector('canvas');
    if (!c) return res({ error: 'nessun canvas nella pagina' });
    const W = ${W}, H = ${H}, z = ${z}, dy = ${dy};
    const o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d');
    const gr = g.createRadialGradient(W/2, H*0.42, 0, W/2, H*0.42, W*0.6);
    ${JSON.stringify(SFONDO)}.forEach(([p, col]) => gr.addColorStop(p, col));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.imageSmoothingQuality = 'high';
    const sw = c.width / z, sh = sw * H / W, sx = (c.width - sw) / 2, sy = (c.height - sh) / 2 + dy * c.height;
    g.drawImage(c, sx, sy, sw, sh, 0, 0, W, H);
    res({ data: o.toDataURL('${tipo}', ${qualita}) });
  }))`;
}

/* come espressioneCattura, ma senza sfondo (trasparente) e in più misure: restituisce { data: [dataURL, …] }
   nell'ordine di `larghezze` (larghezza che avrebbe l'intero fotogramma, altezza = 5/8; il canvas è scalato per intero).
   `ritaglio` = [x0, y0, x1, y1] in frazioni del fotogramma intero: si salva solo quella parte, con la stessa scala,
   così il file contiene solo il modello (niente trasparenza inutile) a risoluzione maggiore. */
export function espressioneCatturaTrasparente(larghezze, tipo = 'image/webp', qualita = 0.8, ritaglio = [0, 0, 1, 1]) {
  return `new Promise(res => requestAnimationFrame(() => {
    const c = document.getElementById('c') || document.querySelector('canvas');
    if (!c) return res({ error: 'nessun canvas nella pagina' });
    const [x0, y0, x1, y1] = ${JSON.stringify(ritaglio)};
    res({ data: ${JSON.stringify(larghezze)}.map(Wf => {
      const W = Math.round(Wf * (x1 - x0)), H = Math.round(Wf * 5 / 8 * (y1 - y0));
      const o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(c, x0 * c.width, y0 * c.height, (x1 - x0) * c.width, (y1 - y0) * c.height, 0, 0, W, H);
      return o.toDataURL('${tipo}', ${qualita});
    }) });
  }))`;
}
