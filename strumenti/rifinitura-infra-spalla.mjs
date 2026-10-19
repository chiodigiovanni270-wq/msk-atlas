/* Rifinitura del tendine del sottospinato (`infra`) della spalla (modelli/spalla-3d.html): toglie le pieghe e le punte sul margine superiore del tendine,
   vicino all'inserzione sul trochite, dove la lamina a due strati lasciata da `muscoli-spalla.mjs` si ripiegava su se stessa (lembi, spigoli a 180°).

   Uso (dalla cartella del progetto):
     node strumenti/rifinitura-infra-spalla.mjs                  → riscrive `infra` nel file del modello
     PROVA=1 node strumenti/rifinitura-infra-spalla.mjs          → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/rifinitura-infra-spalla.mjs   → lavora su una copia
   Va lanciato dopo `muscoli-spalla.mjs` e prima di `borsa-spalla.mjs` (la borsa poggia sul sottospinato). Riparte dalle posizioni di `infra` della
   revisione `BASE` (stessa topologia), quindi si può rilanciare con lo stesso risultato; se si rilancia `muscoli-spalla.mjs` e cambia `infra`,
   aggiornare `BASE` alla revisione che contiene il nuovo risultato (prima di questo script).

   Metodo: nelle sfere `ZONE` (centro, raggio pieno, raggio esterno, in cm) i vertici sono levigati con `PASSATE` giri di Taubin ristretti alla zona
   (peso 1 nel raggio pieno, che scende a 0 al raggio esterno con curva smoothstep): il resto della mesh non si muove. Le zone `forte` (punte più piccole del passo della
   mesh) sono poi mediate con i vicini senza compensazione per `PASSATE_FORTI` giri. Le normali di vertice scritte nel file
   (`nm`) sono ricalcolate solo sui vertici spostati e su quelli vicini. Controlli stampati: spigoli con angolo diedro oltre `SOGLIA`° (a 180° sono i
   bordi naturali della lamina a due strati) e triangoli con qualità minore di `QMIN` dentro le sfere, prima e dopo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { vicini } = await import('./lib-bp3d.mjs');
const { REAL, posDaRevisione, setMesh, saveFile, repack, log, sstep } = G;

const BASE = '56ca2ad';
const ZONE = [{ c: [-1.1, 1.8, -1.7], r0: 0.8, r1: 1.3 },      // lembo ripiegato sul margine superiore
              { c: [-2.6, 1.3, -0.3], r0: 0.5, r1: 0.9 },       // punte vicino all'inserzione
              { c: [-2.6, 1.42, -0.38], r0: 0.12, r1: 0.3, forte: true },    // ultime punte sull'angolo dell'inserzione
              { c: [-1.15, 1.85, -1.6], r0: 0.12, r1: 0.3, forte: true }];   // ultima fessura sul margine superiore
const PASSATE = 120, PASSATE_FORTI = 25, SOGLIA = 100, QMIN = 0.05;

const base = REAL('infra'), nv = base.nv, idx = base.idx;
const pos0 = Float64Array.from(posDaRevisione(BASE, 'infra', 'modelli/spalla-3d.html')), cur = pos0.slice();
const nb = vicini(nv, idx);
const peso = new Float64Array(nv), forte = new Float64Array(nv);
for (let i = 0; i < nv; i++) for (const z of ZONE) { const d = Math.hypot(cur[3 * i] - z.c[0], cur[3 * i + 1] - z.c[1], cur[3 * i + 2] - z.c[2]); { const w = 1 - sstep(z.r0, z.r1, d); if (z.forte) forte[i] = Math.max(forte[i], w); else peso[i] = Math.max(peso[i], w); } }
const attivi = []; for (let i = 0; i < nv; i++) if (peso[i] > 0 || forte[i] > 0) { attivi.push(i); if (!peso[i]) peso[i] = 1e-9; }
log('vertici nelle zone', attivi.length);

function controlli(p, etichetta) {
  const ntr = idx.length / 3, nf = [], ef = new Map(); let qb = 0, pieghe = 0;
  for (let t = 0; t < ntr; t++) { const [a, b, c] = [0, 1, 2].map(k => idx[3 * t + k]); const u = [0, 1, 2].map(q => p[3 * b + q] - p[3 * a + q]), w = [0, 1, 2].map(q => p[3 * c + q] - p[3 * a + q]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1; nf.push(n.map(v => v / l));
    const e = [Math.hypot(...u), Math.hypot(...w), Math.hypot(...[0, 1, 2].map(q => p[3 * c + q] - p[3 * b + q]))], Q = 4 * Math.sqrt(3) * (l / 2) / (e[0] ** 2 + e[1] ** 2 + e[2] ** 2);
    if (peso[a] > 0 && peso[b] > 0 && peso[c] > 0 && Q < QMIN) qb++;
    for (let k = 0; k < 3; k++) { const x = idx[3 * t + k], y = idx[3 * t + (k + 1) % 3], key = Math.min(x, y) * nv + Math.max(x, y); (ef.get(key) || ef.set(key, []).get(key)).push(t); } }
  for (const [key, L] of ef) if (L.length === 2) { const a = Math.floor(key / nv), b = key % nv; if (peso[a] > 0 && peso[b] > 0) { const d = nf[L[0]][0] * nf[L[1]][0] + nf[L[0]][1] * nf[L[1]][1] + nf[L[0]][2] * nf[L[1]][2]; if (Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI > SOGLIA) pieghe++; } }
  log(etichetta + ': spigoli con diedro >' + SOGLIA + '°', pieghe, '; triangoli con qualità <' + QMIN, qb);
}
controlli(cur, 'prima');

for (let it = 0; it < PASSATE; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
  for (const i of attivi) { const L = nb[i]; if (!L.length) continue; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += peso[i] * lam * (s / L.length - cur[3 * i + k]); } }
  cur.set(q); }
// zone «forti»: media dei vicini senza compensazione (restringe le punte più piccole del passo della mesh), poi una levigatura di Taubin leggera
for (let it = 0; it < PASSATE_FORTI; it++) { const q = cur.slice();
  for (const i of attivi) if (forte[i] > 0) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += forte[i] * 0.5 * (s / L.length - cur[3 * i + k]); } }
  cur.set(q); }
controlli(cur, 'dopo');
let mx = 0; for (const i of attivi) mx = Math.max(mx, Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k]))); log('spostamento massimo', (mx * 10).toFixed(2), 'mm');

// normali di vertice: quelle già nel file, ricalcolate (media dei triangoli, pesata dall'area) sui vertici spostati e sui loro vicini
const m = G.man.meshes.findLast(x => x.n === 'infra');
const nrm = Int8Array.from(new Int8Array(G.buf0.buffer, G.buf0.byteOffset + m.nm, nv * 3));
const toccati = new Set(attivi); for (const i of attivi) for (const j of nb[i]) toccati.add(j);
const acc = new Map([...toccati].map(i => [i, [0, 0, 0]]));
for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(i => acc.has(i))) continue;
  const u = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), w = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const i of T) if (acc.has(i)) for (let k = 0; k < 3; k++) acc.get(i)[k] += n[k]; }
for (const [i, n] of acc) { const l = Math.hypot(...n) || 1, o = [0, 1, 2].map(k => nrm[3 * i + k]), ph = o[0] * n[0] + o[1] * n[1] + o[2] * n[2] < 0 ? -1 : 1;   // segno come quello già scritto
  for (let k = 0; k < 3; k++) nrm[3 * i + k] = Math.round(127 * ph * n[k] / l); }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { const a = G.attrs('infra'); setMesh('infra', { pos: Float32Array.from(cur), idx, tag: a.tag, fdir: a.fdir, nrm }); saveFile(repack()); }
