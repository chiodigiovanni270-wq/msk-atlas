/* Cute del ginocchio: sottocute sufficiente sopra muscoli, tendini e vasi sottocutanei (mesh "cute" di
   modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto, dopo stratifica-ginocchio.mjs e capsula-ginocchio.mjs, prima di borse-ginocchio.mjs
   e percorsi-ginocchio.mjs):
     node strumenti/cute-ginocchio.mjs [--prova]
   Con --prova stampa solo le verifiche, senza modificare il file. La cute di partenza è sempre quella originale
   (BodyParts3D) letta dalla revisione git ORIGINALE, quindi lo script si può rilanciare.

   Perché: stratifica-ginocchio.mjs porta la zampa d'oca superficiale al LCM e il bicipite dietro il LCL; la cute
   originale, che copriva i muscoli con ~1 mm di margine, veniva attraversata (fino a 6 mm) da sartorio, gracile,
   semitendinoso e bicipite, e con essi dalla grande safena e dal nervo safeno, che vi decorrono sopra nel sottocute.
   Nel vivo tra cute e fascia c'è sempre il sottocute (al ginocchio mediale diversi millimetri): qui la cute viene
   sollevata solo dove serve, con un rilievo dolce, e le strutture profonde non si toccano.

   Regole:
   - ogni struttura profonda (ossa, muscoli, tendini, legamenti, capsula, borse profonde) resta almeno COPERTURA sotto
     la superficie cutanea; le borse sottocutanee (prepatellare, infrapatellare superficiale) sono escluse, perché
     borse-ginocchio.mjs le limita già alla cute;
   - lungo i vasi e i nervi sottocutanei (che percorsi-ginocchio.mjs appoggia sulla fascia, sotto la cute) lo spessore
     sopra la fascia basta a contenerli: diametro del tubo + SOPRA_TUBO;
   - lo spostamento è lungo la normale della cute, solo verso l'esterno, raccordato con un inviluppo gaussiano ampio
     (SIGMA) e levigato; nullo alle sezioni di taglio della coscia e della gamba.

   Metodo: campo di distanza con segno dall'unione delle strutture profonde (voxel 1 mm). Su ogni triangolo della cute si
   campionano più punti; dove lo spessore è insufficiente, i tre vertici ricevono l'aumento mancante. Gli aumenti
   diventano un inviluppo gaussiano sulla superficie, levigato, e si ripete finché nessun punto è scoperto. */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { M, REAL, setPos, repack, saveFile, setGriglia, solid, edt, sample, or, sstep, log, man, reManRe, datiDi } from './lib-modello.mjs';
import * as G from './lib-modello.mjs';

const PROVA = process.argv.includes('--prova');
const ORIGINALE = 'b4df739'; // cute originale BodyParts3D
const COPERTURA = 0.2, SOPRA_TUBO = 0.12, SIGMA = 1.2, ITER = 12;
const ESCLUSE = new Set(['cute', 'bprep', 'binfsup']);
// vasi e nervi sottocutanei (come in percorsi-ginocchio.mjs: tratti in modo 'sup')
const SOTTOCUTANEI = { vgs: () => true, nsaf: y => y < 2, ninfra: () => true, nsurmed: y => y < -3, vps: y => y < -3, nsurlat: y => y < 1.5 };

// cute originale
const H0 = execFileSync('git', ['show', `${ORIGINALE}:modelli/ginocchio-3d.html`], { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'), maxBuffer: 1 << 30 }).toString('utf8');
const man0 = JSON.parse(H0.match(reManRe)[2]), b0 = datiDi(H0, ORIGINALE, 'modelli/ginocchio-3d.html'), ab0 = b0.buffer.slice(b0.byteOffset, b0.byteOffset + b0.length);
const mc = man0.meshes.findLast(x => x.n === 'cute'), nv = mc.nv;
const P0 = new Float32Array(nv * 3); { const q = new Uint16Array(ab0, mc.p, nv * 3); for (let i = 0; i < nv * 3; i++) { const k = i % 3; P0[i] = man0.min[k] + q[i] / 65535 * (man0.max[k] - man0.min[k]); } }
const IDX = REAL('cute').idx; if (REAL('cute').nv !== nv) throw new Error('topologia della cute diversa da quella originale');
setPos('cute', P0);

// griglia che contiene tutto l'arto con margine per il rilievo
setGriglia([-11, -21, -10.5], 0.1, 195, 420, 205);
const U = new Uint8Array(G.N);
const nomi = [...new Set(man.meshes.map(m => m.n))].filter(n => !ESCLUSE.has(n));
for (const n of nomi) or(U, solid(n));
const Do = edt(U), Di = edt(U, true), DU = new Float32Array(G.N); for (let i = 0; i < G.N; i++) DU[i] = Do[i] - Di[i];
log('strutture profonde:', nomi.length);

// tratti sottocutanei dei tubi (decorso attuale nella pagina)
const TUBI = [];
for (const [id, dove] of Object.entries(SOTTOCUTANEI)) {
  const i = M.html.indexOf(`{id:'${id}',`), fine = M.html.indexOf('\n {id:', i + 5);
  for (let j = M.html.indexOf('tube([[', i); j >= 0 && j < fine; j = M.html.indexOf('tube([[', j + 1)) {
    const k = M.html.indexOf(']]', j), pts = JSON.parse(M.html.slice(j + 5, k + 2)), r = parseFloat(M.html.slice(k + 3));
    for (let a = 0; a + 1 < pts.length; a++) { const p = pts[a], q = pts[a + 1], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / 0.1));
      for (let s = 0; s < n; s++) { const t = s / n, x = [0, 1, 2].map(c => p[c] + (q[c] - p[c]) * t); if (dove(x[1])) TUBI.push({ x, r }); } }
  }
}
// spessore richiesto sopra la fascia in un punto della cute: COPERTURA, o il tubo sottocutaneo vicino
const Q = 0.5, cella = new Map(), ck = (x, y, z) => `${Math.floor(x / Q)},${Math.floor(y / Q)},${Math.floor(z / Q)}`;
for (const t of TUBI) { const k = ck(...t.x); (cella.get(k) || cella.set(k, []).get(k)).push(t); }
function richiesto(x, y, z) {
  let v = COPERTURA; const i0 = Math.floor(x / Q), j0 = Math.floor(y / Q), k0 = Math.floor(z / Q);
  for (let i = i0 - 3; i <= i0 + 3; i++) for (let j = j0 - 3; j <= j0 + 3; j++) for (let k = k0 - 3; k <= k0 + 3; k++) for (const t of cella.get(`${i},${j},${k}`) || []) {
    const d = Math.hypot(x - t.x[0], y - t.x[1], z - t.x[2]); v = Math.max(v, COPERTURA + (2 * t.r + SOPRA_TUBO - COPERTURA) * (1 - sstep(0.8, 1.5, d))); }
  return v;
}

// normali dei vertici (verso l'esterno), levigate
const Nn = new Float32Array(nv * 3);
for (let t = 0; t < IDX.length; t += 3) { const a = IDX[t], b = IDX[t + 1], c = IDX[t + 2];
  const u = [0, 1, 2].map(k => P0[3 * b + k] - P0[3 * a + k]), w = [0, 1, 2].map(k => P0[3 * c + k] - P0[3 * a + k]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const v of [a, b, c]) for (let k = 0; k < 3; k++) Nn[3 * v + k] += n[k]; }
let vol = 0; for (let t = 0; t < IDX.length; t += 3) { const [a, b, c] = [IDX[t], IDX[t + 1], IDX[t + 2]].map(v => [P0[3 * v], P0[3 * v + 1], P0[3 * v + 2]]);
  vol += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }
const verso = vol > 0 ? 1 : -1;
// vicini sulla superficie entro 3 SIGMA (distanza euclidea: l'arto è molto più largo di SIGMA)
const R3 = 3 * SIGMA, griglia = new Map(), gk = (x, y, z) => `${Math.floor(x / R3)},${Math.floor(y / R3)},${Math.floor(z / R3)}`;
for (let v = 0; v < nv; v++) { const k = gk(P0[3 * v], P0[3 * v + 1], P0[3 * v + 2]); (griglia.get(k) || griglia.set(k, []).get(k)).push(v); }
const VIC = Array.from({ length: nv }, (_, v) => { const x = P0[3 * v], y = P0[3 * v + 1], z = P0[3 * v + 2], out = [], i0 = Math.floor(x / R3), j0 = Math.floor(y / R3), k0 = Math.floor(z / R3);
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) for (const u of griglia.get(`${i},${j},${k}`) || []) {
    const d2 = (P0[3 * u] - x) ** 2 + (P0[3 * u + 1] - y) ** 2 + (P0[3 * u + 2] - z) ** 2; if (d2 < R3 * R3) out.push(u, d2); }
  return out; });
{ const N2 = new Float32Array(nv * 3); // normali mediate su ~5 mm
  for (let v = 0; v < nv; v++) { const L = VIC[v]; for (let q = 0; q < L.length; q += 2) { const w = Math.exp(-L[q + 1] / (2 * 0.5 * 0.5)); for (let k = 0; k < 3; k++) N2[3 * v + k] += w * Nn[3 * L[q] + k]; } }
  for (let v = 0; v < nv; v++) { const l = Math.hypot(N2[3 * v], N2[3 * v + 1], N2[3 * v + 2]) || 1; for (let k = 0; k < 3; k++) Nn[3 * v + k] = verso * N2[3 * v + k] / l; } }
// niente spostamento alle sezioni di taglio (|y| ≈ 20); lì le strutture non sono state spostate e la cute originale basta
const vinc = Float32Array.from({ length: nv }, (_, v) => 1 - sstep(18.5, 19.8, Math.abs(P0[3 * v + 1])));

const O = new Float32Array(nv), pos = () => { const P = new Float32Array(P0); for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) P[3 * v + k] += Nn[3 * v + k] * O[v]; return P; };
const BARI = []; for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4 - a; b++) BARI.push([a / 4, b / 4, (4 - a - b) / 4]);
function mancanze(P) { // aumento necessario per vertice e deficit massimo
  const D = new Float32Array(nv); let max = 0, n = 0;
  for (let t = 0; t < IDX.length; t += 3) { const a = IDX[t], b = IDX[t + 1], c = IDX[t + 2];
    for (const [u, v, w] of BARI) { const x = u * P[3 * a] + v * P[3 * b] + w * P[3 * c], y = u * P[3 * a + 1] + v * P[3 * b + 1] + w * P[3 * c + 1], z = u * P[3 * a + 2] + v * P[3 * b + 2] + w * P[3 * c + 2];
      const m = (richiesto(x, y, z) - sample(DU, x, y, z)) * (1 - sstep(18, 19.5, Math.abs(y))); if (m <= 0.002) continue; n++; max = Math.max(max, m);
      D[a] = Math.max(D[a], m); D[b] = Math.max(D[b], m); D[c] = Math.max(D[c], m); } }
  return { D, max, n };
}
for (let it = 0; it < ITER; it++) {
  const { D, max, n } = mancanze(pos()); log(`passata ${it}: punti scoperti ${n}, deficit massimo ${(max * 10).toFixed(2)} mm`); if (!n) break;
  // inviluppo gaussiano (ogni vertice raggiunge l'aumento richiesto, i vicini lo seguono) e levigatura
  const E = new Float32Array(nv); for (let v = 0; v < nv; v++) { if (!D[v]) continue; const L = VIC[v]; for (let q = 0; q < L.length; q += 2) { const u = L[q]; E[u] = Math.max(E[u], D[v] * Math.exp(-L[q + 1] / (2 * SIGMA * SIGMA))); } }
  const s2 = (SIGMA / 3) ** 2;
  for (let v = 0; v < nv; v++) { const L = VIC[v]; let s = 0, w = 0; for (let q = 0; q < L.length; q += 2) { const g = Math.exp(-L[q + 1] / (2 * s2)); s += g * E[L[q]]; w += g; } O[v] += 1.1 * vinc[v] * s / w; }
}

// verifiche: rilievo massimo, e vertici delle strutture profonde e dei tubi sottocutanei rispetto alla nuova cute
const P = pos(); setPos('cute', P);
let om = 0, vm = -1; for (let v = 0; v < nv; v++) if (O[v] > om) { om = O[v]; vm = v; }
log(`rilievo massimo ${(om * 10).toFixed(1)} mm a [${[0, 1, 2].map(k => P0[3 * vm + k].toFixed(1))}]`);
const zone = {}; for (let v = 0; v < nv; v++) if (O[v] > 0.1) { const k = `y${Math.round(P0[3 * v + 1] / 2) * 2} ${P0[3 * v] > 0 ? 'mediale' : 'laterale'} ${P0[3 * v + 2] > 0 ? 'ant' : 'post'}`; zone[k] = Math.max(zone[k] || 0, O[v]); }
console.log('  rilievo > 1 mm:', Object.entries(zone).sort().map(([k, v]) => `${k}:${(v * 10).toFixed(0)}`).join('  '));
for (const k of [0, 1, 2]) { let lo = Infinity, hi = -Infinity; for (let v = 0; v < nv; v++) { lo = Math.min(lo, P[3 * v + k]); hi = Math.max(hi, P[3 * v + k]); }
  if (lo < man.min[k] || hi > man.max[k]) throw new Error('la cute esce dal volume di quantizzazione'); }
const K = edt(solid('cute'), true), fuori = [];
for (const n of nomi) { const { pos: p } = REAL(n); let c = 0, m = Infinity; for (let i = 0; i < p.length; i += 3) { if (Math.abs(p[i + 1]) > 19.9) continue; const d = sample(K, p[i], p[i + 1], p[i + 2]); m = Math.min(m, d); if (d < COPERTURA - 0.06) c++; }
  if (c) fuori.push(`${n} ${c} (min ${(m * 10).toFixed(1)} mm)`); }
console.log('  strutture profonde a meno di', ((COPERTURA - 0.06) * 10).toFixed(1), 'mm dalla cute:', fuori.join(', ') || 'nessuna');
if (PROVA) process.exit(0);
saveFile(repack());
