/* Lettura e scrittura dei dati binari delle mesh dei modelli (blocchi bpdat/bpdat2, indice in bpman/bpman2).

   Due formati, letti entrambi (le revisioni git precedenti all'estrazione hanno i dati incorporati):
   - esterno (attuale): <script id="bpdat" type="text/plain" data-src="../assets/dati/<nome>/bpdat.<hash>.br" data-len="…"></script>
     il file è il binario compresso con brotli (qualità 11); <hash> = primi 8 caratteri dello SHA-256 del binario non compresso,
     data-len = sua lunghezza in byte. Sul sito il file è servito con Content-Encoding: br (vercel.json; in locale strumenti/server.mjs),
     quindi la pagina riceve con fetch il binario già decompresso.
   - incorporato (precedente): base64 dentro il tag, eventualmente compresso con gzip.

   leggiDati(html, id, { file, rev }) → Buffer (binario non compresso)
     file: percorso della pagina (assoluto o relativo alla radice del progetto), da cui si risolve data-src;
     rev:  revisione git da cui leggere il file dei dati (la pagina html va letta dalla stessa revisione).
   scriviDati(html, id, buf, file) → html con il blocco aggiornato; scrive il nuovo file .br e cancella il precedente
     se nessun'altra pagina in modelli/ lo usa. Per un modello in modelli/ i dati vanno in assets/dati/<nome>/
     (<nome> = nome del file senza -3d.html); per una copia fuori da modelli/ (MODELLO=<file>) in <file senza .html>-dati/.
   leggiIndice(html, id) → oggetto JSON del blocco bpman/bpman2/bptps. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync, brotliCompressSync, brotliDecompressSync, constants as Z } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELLI = resolve(ROOT, 'modelli');
export const reBlocco = id => new RegExp(`(<script id="${id}" type="text/plain")([^>]*)>(.*?)(</script>)`, 's');
const attr = (s, n) => (s.match(new RegExp(`\\s${n}="([^"]*)"`)) || [])[1];
const assoluto = file => isAbsolute(file) ? file : resolve(ROOT, file);
const dentro = (dir, f) => { const r = relative(dir, f); return r && !r.startsWith('..') && !isAbsolute(r); };
const git = (rev, p) => execFileSync('git', ['show', `${rev}:${p}`], { cwd: ROOT, maxBuffer: 1 << 30 });

export const hashDati = buf => createHash('sha256').update(buf).digest('hex').slice(0, 8);
export const comprimi = buf => brotliCompressSync(buf, { params: { [Z.BROTLI_PARAM_QUALITY]: 11, [Z.BROTLI_PARAM_LGWIN]: 24, [Z.BROTLI_PARAM_SIZE_HINT]: buf.length } });

export function leggiIndice(html, id = 'bpman') {
  const m = html.match(new RegExp(`<script id="${id}" type="application/json">(.*?)</script>`, 's'));
  if (!m) throw new Error(`blocco ${id} non trovato`);
  return JSON.parse(m[1]);
}

export function leggiDati(html, id = 'bpdat', { file = resolve(MODELLI, 'x.html'), rev = null } = {}) {
  const m = html.match(reBlocco(id)); if (!m) throw new Error(`blocco ${id} non trovato`);
  const src = attr(m[2], 'data-src');
  if (!src) { const b = Buffer.from(m[3].trim(), 'base64'); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; }
  const f = assoluto(file);
  // una copia fuori dal progetto che conserva data-src="../assets/…" legge i dati del progetto
  const basi = [dirname(f), MODELLI];
  let br;
  if (rev) br = git(rev, relative(ROOT, resolve(dentro(ROOT, f) ? dirname(f) : MODELLI, src)).split('\\').join('/'));
  else { const p = basi.map(d => resolve(d, src)).find(existsSync); if (!p) throw new Error(`file dei dati non trovato: ${src} (da ${f})`); br = readFileSync(p); }
  const buf = brotliDecompressSync(br), len = +attr(m[2], 'data-len');
  if (buf.length !== len) throw new Error(`${src}: ${buf.length} byte, attesi ${len}`);
  if (!basename(src).includes(`.${hashDati(buf)}.`)) throw new Error(`${src}: hash del contenuto diverso dal nome`);
  return buf;
}

export function scriviDati(html, id, buf, file) {
  const f = assoluto(file), m = html.match(reBlocco(id)); if (!m) throw new Error(`blocco ${id} non trovato`);
  const nome = `${id}.${hashDati(buf)}.br`;
  let dir, src;
  if (dirname(f) === MODELLI) { const d = basename(f).replace(/-3d\.html$|\.html$/, ''); dir = resolve(ROOT, 'assets', 'dati', d); src = `../assets/dati/${d}/${nome}`; }
  else { const d = basename(f).replace(/\.html$/, '') + '-dati'; dir = resolve(dirname(f), d); src = `${d}/${nome}`; }
  mkdirSync(dir, { recursive: true });
  const dest = resolve(dir, nome);
  if (!existsSync(dest)) writeFileSync(dest, comprimi(buf));
  const vecchio = attr(m[2], 'data-src');
  const out = html.replace(reBlocco(id), (_, a, b, c, d) => `${a} data-src="${src}" data-len="${buf.length}">${d}`);
  if (vecchio && vecchio !== src) rimuoviSeInutile(resolve(dirname(f), vecchio), f, out);
  return out;
}

// cancella un file dei dati non più usato dalla pagina appena scritta né da altre pagine in modelli/
function rimuoviSeInutile(p, file, nuovoHtml) {
  if (!existsSync(p)) return;
  const usa = (h, f) => [...h.matchAll(/data-src="([^"]+)"/g)].some(x => resolve(dirname(f), x[1]) === p);
  if (usa(nuovoHtml, file)) return;
  for (const n of readdirSync(MODELLI).filter(n => n.endsWith('.html'))) { const g = resolve(MODELLI, n); if (g !== file && usa(readFileSync(g, 'utf8'), g)) return; }
  unlinkSync(p);
}
