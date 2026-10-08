/* Inserzione della zampa d'oca sulla tibia (modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto):
     node strumenti/zampa-oca-inserzione.mjs [--prova]

   Anatomia (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020): sartorio, gracile e semitendinoso scendono sul
   legamento collaterale mediale (con la borsa anserina interposta) e si inseriscono con una lamina comune appiattita
   sulla faccia anteromediale della tibia, sotto il condilo mediale e medialmente alla tuberosità: il tratto
   d'inserzione è applicato all'osso, senza spazio.
   Nel modello i tendini restavano 5–8 mm sopra la tibia fin quasi alla fine e poi affondavano nell'osso di colpo.

   Metodo: ogni tendine si sposta per fasce orizzontali (0,5 mm) rigide, lungo la direzione verso l'osso (gradiente
   della distanza dal piano profondo, media della fascia), di quanto serve perché il vertice più vicino arrivi a GAP dal
   piano profondo (tibia, LCM, borsa anserina e i tendini già sistemati); il profilo lungo y è lisciato e cresce da 0 a
   y[0] fino al pieno a y[1], così la discesa verso l'osso è graduale. Poi, nel tratto d'inserzione (PIATTO), ogni
   vertice si avvicina al piano profondo in proporzione alla sua distanza (fattore fino a PIATTO_K): la faccia profonda
   si posa sull'osso e il tendine si appiattisce in una lamina. Dove la fascia è già dentro l'osso (punta
   d'inserzione) non si sposta. Ordine dal profondo al superficiale: semitendinoso, gracile, sartorio. Riparte dalle
   mesh della revisione PARTENZA, quindi si può rilanciare.

   Requisiti: Node 18 o successivo, nessuna dipendenza. */
import { REAL, setPos, posDaRevisione, setGriglia, N, or, solid, edt, sample, sstep, log, repack, saveFile } from './lib-modello.mjs';

const PARTENZA = '1255f31', PROVA = process.argv.includes('--prova');
const GAP = 0.04, BAND = 0.05, LISCIA = 0.5, PIATTO = [-5.3, -6.6], PIATTO_K = 0.35;   // cm; LISCIA: sigma della lisciatura del profilo lungo y
const REGOLE = [
  { nome: 'semit', rif: ['tibia', 'lcm', 'bans'], y: [-4.8, -6.0] },
  { nome: 'grac', rif: ['tibia', 'lcm', 'bans', 'semit'], y: [-4.8, -6.0] },
  { nome: 'sart', rif: ['tibia', 'lcm', 'bans', 'semit', 'grac'], y: [-4.5, -5.8], piatto: [-4.8, -6.2], k: 0.2 },
];
for (const R of REGOLE) setPos(R.nome, posDaRevisione(PARTENZA, R.nome, 'modelli/ginocchio-3d.html'));
setGriglia([0, -10, -1.5], 0.03, 170, 230, 170);   // faccia mediale della tibia prossimale

for (const R of REGOLE) {
  const S = new Uint8Array(N); for (const n of R.rif) or(S, solid(n));
  const Do = edt(S), Di = edt(S, true), sd = q => sample(Do, ...q) - sample(Di, ...q);
  const gr = q => { const e = 0.05, g = [0, 1, 2].map(c => { const a = q.slice(), b = q.slice(); a[c] += e; b[c] -= e; return sd(a) - sd(b); }), l = Math.hypot(...g) || 1; return g.map(v => v / l); };
  const pos = Float32Array.from(REAL(R.nome).pos), nv = pos.length / 3;
  let ymin = Infinity; for (let i = 0; i < nv; i++) ymin = Math.min(ymin, pos[3 * i + 1]);
  const y0 = R.y[0] + 0.5, nb = Math.ceil((y0 - ymin) / BAND) + 1, dmin = new Float32Array(nb).fill(Infinity), dir = Array.from({ length: nb }, () => [0, 0, 0]);
  for (let i = 0; i < nv; i++) { const q = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; if (q[1] > y0) continue; const b = Math.floor((y0 - q[1]) / BAND), d = sd(q);
    if (d < dmin[b]) dmin[b] = d; if (d < 0.6) { const g = gr(q); for (let c = 0; c < 3; c++) dir[b][c] -= g[c] / (0.05 + d); } }
  // corsa per fascia (0 se la fascia tocca già o è dentro l'osso), poi profilo lisciato e pesato lungo y
  let corsa = Array.from(dmin, d => isFinite(d) ? Math.max(0, d - GAP) : 0);
  const s = LISCIA / BAND, rr = Math.ceil(3 * s), lis = corsa.map((_, k) => { let v = 0, w = 0; for (let j = -rr; j <= rr; j++) { const q = k + j; if (q < 0 || q >= nb) continue; const ww = Math.exp(-j * j / (2 * s * s)); v += corsa[q] * ww; w += ww; } return v / w; });
  corsa = lis.map((v, k) => Math.min(v, corsa[k] + 0.0) * sstep(R.y[0], R.y[1], y0 - k * BAND)); // mai oltre la corsa libera della fascia
  // direzione lisciata lungo y
  const dl = dir.map((_, k) => { const m = [0, 0, 0]; for (let j = -rr; j <= rr; j++) { const q = k + j; if (q < 0 || q >= nb) continue; for (let c = 0; c < 3; c++) m[c] += dir[q][c]; } const l = Math.hypot(...m) || 1; return m.map(v => v / l); });
  let mx = 0;
  for (let i = 0; i < nv; i++) { const y = pos[3 * i + 1]; if (y > y0) continue; const f = (y0 - y) / BAND, b = Math.min(nb - 2, Math.floor(f)), t = f - b, c = corsa[b] * (1 - t) + corsa[b + 1] * t;
    for (let k = 0; k < 3; k++) pos[3 * i + k] += dl[b][k] * c; mx = Math.max(mx, c); }
  // appiattimento sul piano profondo nel tratto d'inserzione: la distanza d di ogni vertice dal piano profondo diventa
  // GAP + (d - GAP)·k(y), con k da 1 (sopra PIATTO[0]) a PIATTO_K (sotto PIATTO[1]); la mappa è monotona in d, quindi
  // la faccia profonda si posa sull'osso e lo spessore si riduce senza pieghe (lamina d'inserzione)
  const Dp = new Float32Array(3 * nv);
  for (let i = 0; i < nv; i++) { const q = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], PT = R.piatto || PIATTO, k = 1 - (1 - (R.k ?? PIATTO_K)) * sstep(PT[0], PT[1], q[1]);
    if (k >= 1) continue; const d = sd(q); if (d <= GAP || d > 1.5) continue; const g = gr(q), m = (d - GAP) * (1 - k);
    for (let c = 0; c < 3; c++) Dp[3 * i + c] = -g[c] * m; }
  // spostamento raccordato sulla mesh (le punte già nell'osso non restano indietro rispetto ai vicini: niente pieghe)
  { const { idx } = REAL(R.nome), nb = Array.from({ length: nv }, () => new Set());
    for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[idx[t + a]].add(idx[t + b]);
    for (let it = 0; it < 25; it++) { const O = Dp.slice(); for (let i = 0; i < nv; i++) { if (!nb[i].size || pos[3 * i + 1] > (R.piatto || PIATTO)[0] + 0.3) continue; const m = [0, 0, 0];
      for (const j of nb[i]) for (let c = 0; c < 3; c++) m[c] += O[3 * j + c] / nb[i].size; for (let c = 0; c < 3; c++) Dp[3 * i + c] = 0.5 * O[3 * i + c] + 0.5 * m[c]; } } }
  for (let i = 0; i < 3 * nv; i++) pos[i] += Dp[i];
  setPos(R.nome, pos);
  // verifica: distanza minima dal piano profondo per quota
  let rep = ''; for (let y = -4.5; y > ymin; y -= 0.5) { let m = Infinity; for (let i = 0; i < nv; i++) if (Math.abs(pos[3 * i + 1] - y) < 0.25) m = Math.min(m, sd([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]])); if (isFinite(m)) rep += ` ${y}:${(m * 10).toFixed(1)}`; }
  log(`${R.nome}: spostamento massimo ${(mx * 10).toFixed(1)} mm; distanza dal piano profondo (mm) per quota:${rep}`);
}
if (!PROVA) saveFile(repack());
