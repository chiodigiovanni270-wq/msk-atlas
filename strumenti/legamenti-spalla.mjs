/* Legamenti della spalla (modelli/spalla-3d.html): coracoclavicolari (conoide e trapezoide), coracoacromiale, acromioclavicolare, sternoclavicolare
   anteriore, coraco-omerale e gleno-omerali (superiore, medio, inferiore con le due bande).

   Uso (dalla cartella del progetto):
     node strumenti/legamenti-spalla.mjs                  → riscrive le mesh nel file del modello
     node strumenti/legamenti-spalla.mjs --prova=f.json   → non tocca il modello: scrive i punti repere trovati in un JSON
     MODELLO=/tmp/copia.html node strumenti/legamenti-spalla.mjs   → lavora su una copia
   Va lanciato dopo `labbro-capsula-spalla.mjs` (usa ossa, labbro e capsula incorporati, che non modifica); non dipende da una revisione git e si può
   rilanciare: riscrive sempre le stesse mesh.

   Metodo: ogni legamento è un nastro a sezione lenticolare lungo una curva (Catmull-Rom) tra due inserzioni, con larghezza e spessore variabili (più larghi
   alle inserzioni, che entrano di 0,3 mm nell'osso). I reperi (sistema del modello: x laterale→mediale, y basso→alto, z dietro→avanti) sono trovati sulle
   ossa reali con criteri geometrici (funzioni `trova`, vedi tabella REP) e stampati: se cambiano le ossa si controllano a vista.
   Gleno-omerali e coraco-omerale seguono la capsula: i campioni della curva vicini alla capsula sono portati sulla sua faccia esterna (spessore 1 mm sopra), poi
   levigati; le inserzioni sono sul labbro (orologio glenoideo: SGHL ~1, MGHL ~3, IGHL anteriore ~4–5, posteriore ~7–8) e sul margine della cartilagine
   della testa (collo anatomico). Fonti: Gray's Anatomy; Turkel et al. JBJS 1981 (gleno-omerali); Rios et al. 2007 (coracoclavicolari). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, saveFile, repack, log, clamp, sstep } = G;
const B = await import('./lib-bp3d.mjs');

const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nor = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

const OSSA = ['scapola', 'clavicola', 'omero', 'manubrio'];
const W = {}; // vertici e normali per osso
for (const n of [...OSSA, 'caps', 'labbro', 'cart_omero']) { const m = REAL(n); const V = []; for (let i = 0; i < m.pos.length; i += 3) V.push([m.pos[i], m.pos[i + 1], m.pos[i + 2]]); W[n] = { V, N: Array.from({ length: V.length }, () => null), m }; const nn = B.normali(m.pos, m.idx); W[n].N = V.map((_, i) => [nn[3 * i], nn[3 * i + 1], nn[3 * i + 2]]); }
const trova = (osso, filtro, punteggio) => { let best = null, bs = -1e9; W[osso].V.forEach((p, i) => { if (filtro && !filtro(p)) return; const s = punteggio(p); if (s > bs) { bs = s; best = i; } }); if (best === null) throw new Error('repere non trovato su ' + osso); return { p: W[osso].V[best], n: W[osso].N[best], osso }; };
const vicino = (osso, q) => { let b = 0, bd = 1e9; W[osso].V.forEach((p, i) => { const d = len(sub(p, q)); if (d < bd) { bd = d; b = i; } }); return { p: W[osso].V[b], n: W[osso].N[b], osso, d: bd }; };

/* ---- reperi ---- */
const cl = W.clavicola.V, Lc = cl.reduce((b, p) => p[0] < b[0] ? p : b), Mc = cl.reduce((b, p) => p[0] > b[0] ? p : b), ax = nor(sub(Mc, Lc));
const s = p => dot(sub(p, Lc), ax);
const sc = W.scapola.V, Ct = sc.reduce((b, p) => p[2] > b[2] ? p : b);        // apice del processo coracoideo
const cor = p => len(sub(p, Ct)) < 3.4 && p[2] > 0.4;                           // regione del coracoide
const R = {
  tz_cl: trova('clavicola', p => s(p) > 2.3 && s(p) < 2.9, p => -p[1]),                               // linea trapezoide (faccia inferiore)
  co_cl: trova('clavicola', p => s(p) > 3.6 && s(p) < 4.4, p => -p[1] - 0.5 * p[2]),                  // tubercolo conoide (inferiore-posteriore)
  tz_cor: trova('scapola', p => cor(p) && p[2] > 1.9 && p[2] < 2.5, p => p[1]),                       // faccia superiore del coracoide
  co_cor: trova('scapola', p => cor(p) && p[2] > 0.6 && p[2] < 1.4, p => p[1]),                       // ginocchio del coracoide
  cal_cor: trova('scapola', p => cor(p) && p[2] > 1.7 && p[2] < 2.5, p => -p[0] + 0.5 * p[1]),        // margine laterale del coracoide
  cal_ac: trova('scapola', p => p[1] > 2.6, p => p[2] - 0.4 * p[0] + 0.3 * p[1]),                     // apice anteriore dell'acromion
  ac_cl: trova('clavicola', p => s(p) < 0.9, p => p[1]),                                              // estremo laterale della clavicola (faccia superiore)
  sc_cl: trova('clavicola', p => s(p) > s(Mc) - 0.6, p => p[2]),                                      // estremo mediale (faccia anteriore)
  ch_cor: trova('scapola', p => cor(p) && p[2] > 0.5 && p[2] < 1.6, p => -p[0] + 0.3 * p[1]),         // base laterale del coracoide
  ch_om: trova('omero', p => p[2] > 1.2 && p[1] > -2.2, p => p[1] + 0.5 * p[2]),                      // tubercolo minore (parte alta)
};
R.ac_ac = vicino('scapola', R.ac_cl.p); R.sc_ma = vicino('manubrio', R.sc_cl.p);
for (const [k, v] of Object.entries(R)) log('repere', k, v.p.map(x => x.toFixed(2)).join(','), v.d !== undefined ? 'd=' + v.d.toFixed(2) : '');

/* ---- orologio glenoideo e margine della testa ---- */
const lab = W.labbro.V, cenL = lab.reduce((a, p) => add(a, p), [0, 0, 0]).map(x => x / lab.length);
// punti del labbro: vertici di base (indice 4 mod 5 = lato esterno a terra) → usa i vertici apice (indice 2 mod 5)
const apex = lab.filter((_, i) => i % 5 === 2), nG = (() => { let a = [0, 0, 0]; W.labbro.V.forEach((p, i) => { if (i % 5 === 2) a = add(a, sub(p, [0, 0, 0])); }); return null; })();
const glN = nor(sub(W.cart_omero.V.reduce((a, p) => add(a, p), [0, 0, 0]).map(x => x / W.cart_omero.V.length), cenL));      // dal centro glenoideo verso la testa
const up = nor(add([0, 1, 0], glN, -glN[1])), ant = nor(cross(up, glN)).map((x, i) => x), antS = dot(ant, [0, 0, 1]) < 0 ? mul(ant, -1) : ant;
const oraL = deg => { const t = deg * Math.PI / 180, d = add(mul(up, Math.cos(t)), antS, Math.sin(t)); return apex.reduce((b, p) => dot(sub(p, cenL), d) / len(sub(p, cenL)) > dot(sub(b, cenL), d) / len(sub(b, cenL)) ? p : b); };
const mT = (() => { const V = W.cart_omero.V, cT2 = V.reduce((a, p) => add(a, p), [0, 0, 0]).map(x => x / V.length); return { V, c: cT2 }; })();
// margine inferiore/anteriore/posteriore della testa: vertici del bordo della cartilagine (più lontani dal polo)
const polo = nor(sub(W.cart_omero.V.reduce((b, p) => p[1] > b[1] ? p : b), mT.c));
const bordo = mT.V.filter(p => dot(nor(sub(p, mT.c)), polo) < Math.cos(1.38) + 0.03);
const oraT = (az, el) => { const ant2 = antS, d = nor(add(add(mul(up, Math.cos(az)), ant2, Math.sin(az)), [0, el, 0])); return bordo.reduce((b, p) => dot(nor(sub(p, mT.c)), d) > dot(nor(sub(b, mT.c)), d) ? p : b); };
const GH = {
  sghl: [oraL(30), oraT(0.9, 0.1), 0.55], mghl: [oraL(90), oraT(1.5, 0), 0.7],
  ighl_a: [oraL(135), oraT(2.1, -0.2), 0.85], ighl_p: [oraL(-135), oraT(-2.1, -0.2), 0.75],
};

/* ---- nastri ---- */
const catmull = (P, n) => { const out = []; const Q = [P[0], ...P, P[P.length - 1]]; const segs = P.length - 1; for (let i = 0; i < n; i++) { const u = i / (n - 1) * segs, k = Math.min(segs - 1, Math.floor(u)), t = u - k, [p0, p1, p2, p3] = [Q[k], Q[k + 1], Q[k + 2], Q[k + 3]];
  out.push([0, 1, 2].map(a => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t * t + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t * t * t))); } return out; };
const sulCap = path => path.map(p => { const q = vicino('caps', p); if (q.d > 0.6) return p; const w = 1 - sstep(0.25, 0.6, q.d); return add(p, sub(add(q.p, q.n, 0.04), p), w); });
const leviga = (path, it) => { let P = path; for (let k = 0; k < it; k++) P = P.map((p, i) => i === 0 || i === P.length - 1 ? p : mul(add(add(P[i - 1], P[i + 1]), p, 2), 0.25)); return P; };
function nastro(path, larg, spess, hint, estremi = [0.5, 0.5]) {
  const n = path.length, SEZ = 10, pos = [], idx = [], fd = [];
  for (let i = 0; i < n; i++) {
    const tg = nor(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)])), h = hint(path[i], i / (n - 1)), wd = nor(cross(tg, h)), th = nor(cross(wd, tg)), u = i / (n - 1);
    const a = larg(u), b = spess(u) * (0.55 + 0.45 * Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.5);
    for (let k = 0; k < SEZ; k++) { const t = 2 * Math.PI * k / SEZ; pos.push(add(add(path[i], wd, Math.cos(t) * a / 2), th, Math.sin(t) * b / 2)); fd.push(tg); }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < SEZ; k++) { const k2 = (k + 1) % SEZ, a = i * SEZ + k, b = i * SEZ + k2, c = (i + 1) * SEZ + k, d = (i + 1) * SEZ + k2; idx.push(a, b, c, b, d, c); }
  const c0 = pos.length; pos.push(path[0], path[n - 1]); fd.push(fd[0], fd[fd.length - 1]);
  for (let k = 0; k < SEZ; k++) { const k2 = (k + 1) % SEZ; idx.push(c0, k2, k, c0 + 1, (n - 1) * SEZ + k, (n - 1) * SEZ + k2); }
  const P = new Float32Array(pos.length * 3), F = new Float32Array(pos.length * 3); pos.forEach((p, i) => { P.set(p, 3 * i); F.set(fd[i], 3 * i); });
  let v = 0; for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2]; v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; }
  if (v < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  return { pos: P, idx: Uint32Array.from(idx), tag: null, fdir: F };
}
const dentro = (r, k = 0.03) => add(r.p, r.n, -k);                 // inserzione: 0,3 mm dentro l'osso
const NP = 40;
const lin = (a, b, c) => u => a + (b - a) * (c === undefined ? u : Math.abs(2 * u - 1) ** 2 * (a - c) * 0 + u);
const larghez = (w0, w1) => u => w1 + (w0 - w1) * (1 - Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.6) + 0 * u;   // più larghi alle inserzioni
const MESH = {};
function retto(id, A, Bp, w, t, hint, curva = 0) {
  const a = dentro(A), b = dentro(Bp), mid = add(mul(add(a, b), 0.5), nor(hint), curva);
  let path = catmull([a, mid, b], NP); path = leviga(path, 4);
  MESH[id] = nastro(path, u => (w[0] + (w[1] - w[0]) * u) * (1 - 0.18 * Math.sin(Math.PI * u)), () => t, () => nor(hint));   // larghezza: w[0] all'inserzione di partenza, w[1] a quella d'arrivo
}
// coracoclavicolari: dal coracoide alla clavicola, quasi verticali
const vert = [0, 0, 1];
retto('cc_conoide', R.co_cor, R.co_cl, [0.55, 1.1], 0.5, [0, 0, 1]);
retto('cc_trapezoide', R.tz_cor, R.tz_cl, [1.2, 1.6], 0.4, [1, 0, 0]);
retto('cal', R.cal_cor, R.cal_ac, [1.9, 0.6], 0.2, [0, 1, 0], -0.05);
retto('ac_leg', R.ac_cl, R.ac_ac, [1.2, 1.2], 0.3, [0, 0, 1], 0.12);
retto('sc_leg', R.sc_cl, R.sc_ma, [1.3, 1.1], 0.35, [0, 0, 1], 0.05);
// gleno-omerali e coraco-omerale: ispessimenti della capsula. Percorso più breve sulla superficie della capsula (Dijkstra) tra i vertici più vicini alle
// inserzioni; la placca è l'insieme dei vertici della capsula entro metà larghezza dal percorso, sollevati verso l'esterno di `spess` × peso (peso 0 al margine).
const cap = W.caps, nCap = cap.V.length, adjC = Array.from({ length: nCap }, () => []);
for (let t = 0; t < cap.m.idx.length; t += 3) for (let k = 0; k < 3; k++) { const u = cap.m.idx[t + k], v = cap.m.idx[t + (k + 1) % 3], d = len(sub(cap.V[u], cap.V[v])); adjC[u].push([v, d]); adjC[v].push([u, d]); }
function percorso(i0, i1) {
  const D = new Float64Array(nCap).fill(1e9), P = new Int32Array(nCap).fill(-1), H = [[0, i0]]; D[i0] = 0;
  const push = it => { H.push(it); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  H.length = 0; push([0, i0]);
  while (H.length) { const [d, u] = pop(); if (d > D[u]) continue; if (u === i1) break; for (const [v, w] of adjC[u]) if (d + w < D[v]) { D[v] = d + w; P[v] = u; push([D[v], v]); } }
  const out = []; for (let v = i1; v >= 0; v = P[v]) out.push(v); return out.reverse();
}
// normali della capsula levigate (la mesh ridotta è rumorosa vicino alle ossa): le placche seguono il piano tangente medio
{ let N2 = cap.N; for (let it = 0; it < 12; it++) N2 = N2.map((n, i) => { let a = mul(n, 2); for (const [j] of adjC[i]) a = add(a, N2[j]); return nor(a); }); cap.N = N2; }
const idxCap = q => { let b = 0, bd = 1e9; cap.V.forEach((p, i) => { const d = len(sub(p, q)); if (d < bd) { bd = d; b = i; } }); return b; };
function placca(id, A, Bp, w0, w1, spess) {
  const i0 = idxCap(A.p ? A.p : A), i1 = idxCap(Bp.p ? Bp.p : Bp), cam = percorso(i0, i1);
  if (cam.length < 4) throw new Error(id + ': percorso troppo corto');
  // percorso levigato e ricampionato; la placca è una griglia (u lungo, v trasversale) proiettata sul piano tangente locale della capsula (bordi lisci)
  let pts = leviga(cam.map(i => cap.V[i]), 16); pts[0] = cap.V[cam[0]]; pts[pts.length - 1] = cap.V[cam[cam.length - 1]];
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + len(sub(pts[i], pts[i - 1]))); const tot = L[L.length - 1];
  const NU = 56, NV = 11, cen = [];
  for (let k = 0; k < NU; k++) { const x = tot * k / (NU - 1); let i = 1; while (i < L.length - 1 && L[i] < x) i++; const t = (x - L[i - 1]) / ((L[i] - L[i - 1]) || 1); cen.push(add(pts[i - 1], sub(pts[i], pts[i - 1]), clamp(t, 0, 1))); }
  const pos = [], fd = [], idx = [], nq = p => { const q = vicino('caps', p); return q; };
  const grid = (h0, h1) => { const g = []; for (let k = 0; k < NU; k++) { const u = k / (NU - 1), tg = nor(sub(cen[Math.min(NU - 1, k + 1)], cen[Math.max(0, k - 1)])), q0 = nq(cen[k]), wd = nor(cross(tg, q0.n)), w = (w1 + (w0 - w1) * (1 - Math.sin(Math.PI * u) ** 0.6)) / 2, row = [];
      for (let j = 0; j < NV; j++) { const v = 2 * j / (NV - 1) - 1, p = add(cen[k], wd, v * w), q = nq(p), prof = 1 - v * v, hh = h0 + (h1 - h0) * prof; row.push([add(add(p, q.n, -dot(sub(p, q.q ?? q.p), q.n)), q.n, hh), tg]); } g.push(row); } return g; };
  const levG = g => { let X = g.map(r => r.map(([p]) => p)); for (let it = 0; it < 10; it++) X = X.map((r, k) => r.map((p, j) => { let a = mul(p, 2), w = 2; for (const [dk, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const q = X[k + dk]?.[j + dj]; if (q) { a = add(a, q); w++; } } return mul(a, 1 / w); })); return g.map((r, k) => r.map(([, tg], j) => [X[k][j], tg])); };
  const gO = levG(grid(0.045, 0.045 + spess)), gI = levG(grid(0.02, 0.02)), n0 = NU * NV;
  for (const g of [gO, gI]) for (const row of g) for (const [p, tg] of row) { pos.push(...p); fd.push(...tg); }
  for (let k = 0; k < NU - 1; k++) for (let j = 0; j < NV - 1; j++) { const a = k * NV + j, b = a + 1, c = a + NV, d = c + 1; idx.push(a, b, c, b, d, c, n0 + a, n0 + c, n0 + b, n0 + b, n0 + c, n0 + d); }
  // orientamento: la faccia esterna deve guardare lontano dalla capsula
  { let v = 0; for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2]; v += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6; }
    // volume di una placca non chiusa: si decide dal verso della normale del primo triangolo esterno rispetto alla capsula
    const a = idx[0], b = idx[1], c = idx[2], P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], nn = cross(sub(P(b), P(a)), sub(P(c), P(a))), q = nq(P(a));
    if (dot(nn, q.n) < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; } }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: Float32Array.from(fd) };
}
for (const [id, [a, b, w]] of Object.entries(GH)) MESH[id] = placca(id, a, b, w, w * 0.85, 0.07);
// coraco-omerale: nastro dal coracoide alla capsula (tratto libero) + placca sulla capsula fino ai tubercoli
{ const q = cap.V[idxCap(R.ch_cor.p)], d0 = dentro(R.ch_cor), mid = mul(add(d0, q), 0.5);
  const path = leviga(catmull([d0, mid, add(q, cap.N[idxCap(R.ch_cor.p)], 0.06)], 20), 3);
  const nas = nastro(path, larghez(1.1, 0.9), () => 0.14, () => nor(sub(q, mT.c)));
  const pl = placca('coraco_om', R.ch_cor, R.ch_om, 1.2, 1.0, 0.07), n0 = nas.pos.length / 3;
  MESH.coraco_om = { pos: Float32Array.from([...nas.pos, ...pl.pos]), idx: Uint32Array.from([...nas.idx, ...Array.from(pl.idx, i => i + n0)]), tag: null, fdir: Float32Array.from([...nas.fdir, ...pl.fdir]) }; }

for (const [id, m] of Object.entries(MESH)) { log(id, m.pos.length / 3, 'vertici'); setMesh(id, m); }
const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) writeFileSync(prova, JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.p]))));
else saveFile(repack());
