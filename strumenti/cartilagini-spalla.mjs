/* Cartilagini articolari della spalla (modelli/spalla-3d.html): `cart_omero` (testa omerale) e `cart_glen` (cavità glenoidea).

   Uso (dalla cartella del progetto):
     node strumenti/cartilagini-spalla.mjs                  → scrive le due mesh nel file del modello
     node strumenti/cartilagini-spalla.mjs --prova=f.json   → non tocca il modello: scrive le mesh in un JSON
     MODELLO=/tmp/copia.html node strumenti/cartilagini-spalla.mjs   → lavora su una copia
   Va lanciato dopo `bozza-spalla.mjs` (e dopo gli strumenti sulle ossa, se ce ne sono); se cambiano le ossa, rilanciarlo.
   Non dipende da una revisione git: riparte dalle ossa del file e riscrive sempre le stesse due mesh, quindi si può rilanciare.

   Metodo (come per il gomito: la cartilagine si costruisce sulla superficie dell'osso):
   - Sfera della testa omerale: adattata ai vertici dell'omero entro ±1,5 mm dalla sfera (scarto minimo con pesatura iterata).
   - Territorio = campo s (cm) sui vertici dell'osso, levigato per diffusione; il margine è l'isolinea s = 0, quindi regolare.
       testa: s = (ALFA − angolo dall'asse polare) · R; l'asse polare è la direzione che raccoglie più superficie sferica; solo vertici
              a distanza dal centro entro [R − 5 mm, R + 1,5 mm]. Il margine inferiore è il collo anatomico.
       glenoide: vertici della scapola a meno di `D_GLEN` dal centro della testa e con la normale rivolta verso di esso (cos > `COS_GLEN`);
              componente connessa più grande che contiene il punto più vicino al centro.
   - Base levigata: prima di costruire campo e guscio le ossa suddivise passano `PRE_LEVIGA_*` iterazioni di Taubin, così il margine non segue il rumore della mesh
     ossea; le normali di spessore sono levigate (`LEVIGA_N`) e al margine lo spessore sale in fretta (`T_BORDO`, rampa di 3 mm) per un bordo netto.
   - Guscio chiuso: faccia esterna a distanza t(s) lungo la normale, faccia interna 0,3 mm sotto l'osso, bordo raccordato.
       testa: spessore da `T_BORDO` al margine a `T_TESTA` al centro (più spessa al centro);
       glenoide: spessore `T_GLEN_C` al centro e `T_GLEN_B` verso il bordo (più sottile al centro, come in letteratura).
     Gli spessori (≤ 1,4 mm) sono limitati dalla distanza tra le ossa nei dati BodyParts3D (vedi DISTRAZIONE in bozza-spalla.mjs).
   Al termine stampa la distanza minima tra le due facce esterne (deve restare > 0) e le compenetrazioni con le ossa (attese 0). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, saveFile, repack, log, sstep, clamp } = G;
const B = await import('./lib-bp3d.mjs');

const ALFA = 1.42;                 // semiapertura del territorio sulla testa (rad, ≈ 81°)
const D_GLEN = 3.3;               // distanza massima dal centro della testa per la glenoide (cm)
const COS_GLEN = 0.3;
const T_TESTA = 0.14, T_BORDO = 0.10;
const T_GLEN_C = 0.07, T_GLEN_B = 0.12;
const SOTTO = 0.05;                // faccia interna sotto l'osso (cm): le ossa nella pagina sono increspate di ~±0,13 mm
const PASSATE = 24;                // diffusione del campo s (passate sui vertici suddivisi, ~0,7 mm)
const PRE_LEVIGA_OMERO = 40, PRE_LEVIGA_SCAPOLA = 20;   // passate di Taubin sulle ossa suddivise prima di costruire la base
const LEVIGA_N = 12;                // passate di diffusione delle normali di spessore
const LEVIGA = 10;                 // passate di Taubin sulla superficie di base (toglie le irregolarità dell'osso prima dello spessore)

const om = REAL('omero'), sc = REAL('scapola');

/* ---- sfera della testa ---- */
function fitSfera(pts, w) {
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], Bv = [0, 0, 0, 0];
  pts.forEach(([x, y, z], i) => { const r = [2 * x, 2 * y, 2 * z, 1], s = x * x + y * y + z * z, k = w ? w[i] : 1; for (let a = 0; a < 4; a++) { Bv[a] += k * r[a] * s; for (let b = 0; b < 4; b++) A[a][b] += k * r[a] * r[b]; } });
  const M = A.map((r, i) => [...r, Bv[i]]);
  for (let i = 0; i < 4; i++) { let p = i; for (let k = i + 1; k < 4; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]]; for (let k = 0; k < 4; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < 5; j++) M[k][j] -= f * M[i][j]; } }
  const s = M.map((r, i) => r[4] / r[i]); return { c: [s[0], s[1], s[2]], r: Math.sqrt(s[3] + s[0] ** 2 + s[1] ** 2 + s[2] ** 2) };
}
const P3 = (m, i) => [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]];
const nvO = om.pos.length / 3, ptsO = [];
for (let i = 0; i < nvO; i++) { const p = P3(om, i); ptsO.push(p); }
// vertici della parte alta dell'omero (la testa): y rispetto al centro approssimato (0,0,0)+distrazione
const c0 = [0, 0, 0]; let sf = { c: [-0.18, -0.03, 0.13], r: 2.36 };
for (let it = 0; it < 12; it++) {
  const sel = [], w = [];
  for (const p of ptsO) { const d = Math.hypot(p[0] - sf.c[0], p[1] - sf.c[1], p[2] - sf.c[2]); if (p[1] > sf.c[1] - 0.3 && Math.abs(d - sf.r) < 0.15) { sel.push(p); w.push(1); } }
  sf = fitSfera(sel, w);
}
log('sfera della testa: centro', sf.c.map(x => x.toFixed(2)).join(','), 'raggio', sf.r.toFixed(2), 'cm');
const dist = (p, c) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);

/* ---- asse polare: la direzione con più superficie della testa vicina alla sfera ---- */
let polo = [0, 1, 0], best = -1;
{
  const cand = [];
  for (let i = 0; i < nvO; i++) { const p = ptsO[i], d = dist(p, sf.c); if (Math.abs(d - sf.r) < 0.1 && p[1] > sf.c[1]) cand.push([(p[0] - sf.c[0]) / d, (p[1] - sf.c[1]) / d, (p[2] - sf.c[2]) / d]); }
  for (const a of cand.filter((_, i) => i % 3 === 0)) { let sc2 = 0; for (const q of cand) { const c = a[0] * q[0] + a[1] * q[1] + a[2] * q[2]; if (c > 0.5) sc2 += c; } if (sc2 > best) { best = sc2; polo = a; } }
}
log('asse polare', polo.map(x => x.toFixed(2)).join(','));

/* ---- campi (calcolati sulle ossa suddivise una volta: margine più regolare) ---- */
const SUB = m => { const r = B.suddividi(m.pos, m.idx); return { pos: r.pos, idx: r.idx }; };
const omS = SUB(om), scS = SUB(sc);
// superficie di base levigata (Taubin): il margine della cartilagine non segue più il rumore della mesh ossea (±0,13 mm)
omS.pos = Float64Array.from(B.taubin(Float32Array.from(omS.pos), omS.idx, PRE_LEVIGA_OMERO));
scS.pos = Float64Array.from(B.taubin(Float32Array.from(scS.pos), scS.idx, PRE_LEVIGA_SCAPOLA));
const nbO = B.vicini(omS.pos.length / 3, omS.idx), nbS = B.vicini(scS.pos.length / 3, scS.idx);
const normO = B.normali(omS.pos, omS.idx), normS = B.normali(scS.pos, scS.idx);
function campoTesta() {
  const n = omS.pos.length / 3, s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = P3(omS, i), d = dist(p, sf.c), cosA = clamp(((p[0] - sf.c[0]) * polo[0] + (p[1] - sf.c[1]) * polo[1] + (p[2] - sf.c[2]) * polo[2]) / d, -1, 1);
    s[i] = Math.min((ALFA - Math.acos(cosA)) * sf.r, (d - (sf.r - 0.45)) * 2, (sf.r + 0.12 - d) * 2);
  }
  return B.diffondi(s, nbO, PASSATE);
}
function campoGlen() {
  const n = scS.pos.length / 3, s = new Float64Array(n); let imin = 0, dmin = 1e9;
  for (let i = 0; i < n; i++) {
    const p = P3(scS, i), d = dist(p, sf.c); if (d < dmin) { dmin = d; imin = i; }
    const cosA = ((sf.c[0] - p[0]) * normS[3 * i] + (sf.c[1] - p[1]) * normS[3 * i + 1] + (sf.c[2] - p[2]) * normS[3 * i + 2]) / d;
    s[i] = Math.min(D_GLEN - d, (cosA - COS_GLEN) * 1.2);
  }
  // componente connessa che contiene il vertice più vicino
  const keep = new Uint8Array(n), st = [imin]; if (s[imin] >= 0) keep[imin] = 1;
  while (st.length) { const v = st.pop(); for (const w of nbS[v]) if (!keep[w] && s[w] >= 0) { keep[w] = 1; st.push(w); } }
  for (let i = 0; i < n; i++) if (!keep[i]) s[i] = -0.3;
  return B.diffondi(s, nbS, PASSATE);
}

/* leviga il bordo (spigoli usati una sola volta) lungo se stesso: toglie la dentellatura dell'isolinea */
function levigaBordo(pos, idx, passate) {
  const nv = pos.length / 3, cnt = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3], key = a < b ? a * nv + b : b * nv + a; cnt.set(key, (cnt.get(key) || 0) + 1); }
  const nb = new Map(); for (const [key, n] of cnt) if (n === 1) { const a = Math.floor(key / nv), b = key % nv; (nb.get(a) || nb.set(a, []).get(a)).push(b); (nb.get(b) || nb.set(b, []).get(b)).push(a); }
  let P = Float64Array.from(pos);
  for (let it = 0; it < passate; it++) { const Q = P.slice(); for (const [v, L] of nb) { if (L.length !== 2) continue; for (let k = 0; k < 3; k++) Q[3 * v + k] = 0.5 * P[3 * v + k] + 0.25 * (P[3 * L[0] + k] + P[3 * L[1] + k]); } P = Q; }
  return P;
}

/* ---- guscio chiuso sulla superficie dell'osso nel territorio s ≥ 0 ---- */
function guscio(m, s, spessore, triangoli) {
  const r0 = B.ritagliaCampo(m.pos, m.idx, s), nv0 = r0.pos.length / 3;
  // riduzione della superficie di base: il bordo (vertici nuovi, s = 0) resta com'è
  const fissi = Uint8Array.from(r0.orig, o => o < 0 ? 1 : 0);
  const d = B.riduci(r0.pos, r0.idx, triangoli, fissi);
  const c = B.compatta(d.pos, d.idx, [Float64Array.from(r0.s)]);
  const bordo = levigaBordo(c.pos, c.idx, 12);
  const base = { pos: Float64Array.from(B.taubin(Float32Array.from(bordo), c.idx, LEVIGA)), idx: c.idx }, sv = c.extra[0], nv = base.pos.length / 3, nrm0 = B.normali(base.pos, base.idx);
  // normali levigate (la dentellatura del margine veniva dalle normali irregolari dei vertici di bordo spostati di T_BORDO)
  const nbB = B.vicini(nv, base.idx), nrm = new Float64Array(nv * 3);
  for (let k = 0; k < 3; k++) { const f = B.diffondi(Float64Array.from({ length: nv }, (_, i) => nrm0[3 * i + k]), nbB, LEVIGA_N); for (let i = 0; i < nv; i++) nrm[3 * i + k] = f[i]; }
  for (let i = 0; i < nv; i++) { const l = Math.hypot(nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]) || 1; for (let k = 0; k < 3; k++) nrm[3 * i + k] /= l; }
  const pos = new Float64Array(nv * 6), idx = [];
  for (let i = 0; i < nv; i++) { const t = spessore(sv[i]); for (let k = 0; k < 3; k++) { pos[3 * i + k] = base.pos[3 * i + k] + nrm[3 * i + k] * t; pos[3 * (nv + i) + k] = base.pos[3 * i + k] - nrm[3 * i + k] * SOTTO; } }
  for (let t = 0; t < base.idx.length; t += 3) { const a = base.idx[t], b = base.idx[t + 1], e = base.idx[t + 2]; idx.push(a, b, e, nv + a, nv + e, nv + b); }
  // bordo: spigoli usati una sola volta
  const ec = new Map(); for (let t = 0; t < base.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = base.idx[t + k], b = base.idx[t + (k + 1) % 3]; ec.set(a * nv + b, true); }
  for (const key of ec.keys()) { const a = Math.floor(key / nv), b = key % nv; if (ec.has(b * nv + a)) continue; idx.push(a, nv + a, b, b, nv + a, nv + b); }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: null };
}
const sT = campoTesta(), sG = campoGlen();
const tTesta = s => T_BORDO + (T_TESTA - T_BORDO) * sstep(0, 0.3, s);
const tGlen = s => T_GLEN_B + (T_GLEN_C - T_GLEN_B) * sstep(0.1, 0.7, s);
const cT = guscio(omS, sT, tTesta, 4500), cG = guscio(scS, sG, tGlen, 2500);
log('cart_omero', cT.idx.length / 3, 'triangoli; cart_glen', cG.idx.length / 3, 'triangoli');

/* ---- controlli ---- */
const minDist = (a, b) => { let m = 1e9; const pa = a.pos, pb = b.pos; for (let i = 0; i < pa.length; i += 3) for (let j = 0; j < pb.length; j += 3 * 4) { const d = Math.hypot(pa[i] - pb[j], pa[i + 1] - pb[j + 1], pa[i + 2] - pb[j + 2]); if (d < m) m = d; } return m; };
log('distanza minima tra le due cartilagini ≈', (minDist(cT, cG) * 10).toFixed(2), 'mm');

if (process.argv.some(a => a.startsWith('--prova='))) {
  writeFileSync(process.argv.find(a => a.startsWith('--prova=')).slice(8), JSON.stringify({ cart_omero: [...cT.pos].length, cart_glen: [...cG.pos].length }));
} else {
  setMesh('cart_omero', cT); setMesh('cart_glen', cG);
  saveFile(repack());
}
