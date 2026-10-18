/* Labbro glenoideo (`labbro`) e capsula articolare (`caps`) della spalla (modelli/spalla-3d.html).

   Uso (dalla cartella del progetto):
     node strumenti/labbro-capsula-spalla.mjs                  → riscrive le due mesh nel file del modello
     node strumenti/labbro-capsula-spalla.mjs --prova=f.json   → non tocca il modello: scrive le mesh in un JSON
     MODELLO=/tmp/copia.html node strumenti/labbro-capsula-spalla.mjs   → lavora su una copia
   Va lanciato dopo `cartilagini-spalla.mjs` (parte da ossa e cartilagini incorporate, che non modifica); non dipende da una revisione git e si può
   rilanciare: riscrive sempre le stesse due mesh. La capsula usa il labbro presente nel file.

   Labbro (fibrocartilagine triangolare in sezione, Gray's Anatomy; Cooper et al. JBJS 1992):
     il bordo della cartilagine glenoidea (spigoli di una sola faccia della faccia esterna) è ordinato in un anello; lungo l'anello si estrude una sezione
     triangolare: lato interno sul margine della cartilagine, base sull'osso a `LAB.base` cm verso l'esterno, apice `LAB.alt` cm sopra il piano glenoideo
     (verso la testa). La normale locale è quella della scapola, levigata lungo l'anello. Spessore e altezza aumentano un po' in alto (inserzione del capo lungo del bicipite).
   Capsula (Gray's; Terry & Chopp 2000): costruzione in 3D come nel gomito (`capsula-gomito.mjs`):
     1. contenuto K = cartilagini + labbro + osso omerale entro `D.omero` dal margine della cartilagine della testa (collo anatomico; più in basso fino a `D.asc`
        per il recesso ascellare) + osso della scapola entro `D.scapola` dal labbro;
     2. superficie tesa = chiusura morfologica 3D di K (raggio `CHIUSURA`), levigata;
     3. guscio di spessore `TH` appena fuori dalla superficie tesa, tagliato sulle ossa; surface nets, componenti principali, orientamento verso l'esterno. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, saveFile, repack, log, sstep, esatta, griglia, sdf, sfoca, unione, nets, edt, solid } = G;
const B = await import('./lib-bp3d.mjs');

const LAB = { base: 0.42, alt: 0.3, lat: 0.1, sink: 0.03, lev: 24 };     // cm
const D = { omero: 0.45, asc: 1.1, scapola: 0.4 };
const CHIUSURA = 0.8, TH = 0.09, FUORI = 0.06, GBONE = 0.012, PASSO = 0.03, TRI_CAPS = 36000;

const om = REAL('omero'), sc = REAL('scapola'), cg = REAL('cart_glen'), co = REAL('cart_omero');
const P3 = (m, i) => [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(...a), nor = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ---------- LABBRO ---------- */
// anello: spigoli di bordo della faccia esterna (vertici < nv = metà dei vertici)
const nvC = cg.pos.length / 6, ed = new Map();
for (let t = 0; t < cg.idx.length; t += 3) { const a = cg.idx[t], b = cg.idx[t + 1], c = cg.idx[t + 2]; if (a >= nvC || b >= nvC || c >= nvC) continue;
  for (const [u, v] of [[a, b], [b, c], [c, a]]) { const k = u < v ? u * nvC + v : v * nvC + u; ed.set(k, (ed.get(k) || 0) + 1); } }
const nxt = new Map(), adj = new Map();
for (const [k, n] of ed) if (n === 1) { const u = Math.floor(k / nvC), v = k % nvC; (adj.get(u) || adj.set(u, []).get(u)).push(v); (adj.get(v) || adj.set(v, []).get(v)).push(u); }
const start = adj.keys().next().value, anello = [start]; let prev = -1, cur = start;
for (;;) { const nb = adj.get(cur).filter(x => x !== prev); const n = nb.find(x => x !== start) ?? start; if (n === start || anello.length > adj.size) break; anello.push(n); prev = cur; cur = n; }
log('anello del labbro:', anello.length, 'vertici su', adj.size);
if (anello.length !== adj.size) throw new Error('il bordo della cartilagine glenoidea non è un anello unico');
const R = anello.map(i => P3(cg, i));
// riduzione e levigatura dell'anello (periodica)
const K0 = R.length; let Rr = R.slice();
for (let it = 0; it < LAB.lev; it++) Rr = Rr.map((p, i) => { const a = Rr[(i + K0 - 1) % K0], b = Rr[(i + 1) % K0]; return [(a[0] + b[0] + 2 * p[0]) / 4, (a[1] + b[1] + 2 * p[1]) / 4, (a[2] + b[2] + 2 * p[2]) / 4]; });
const cen = Rr.reduce((s, p) => add(s, p), [0, 0, 0]).map(x => x / K0);
// normale glenoidea locale: normale della scapola al vertice più vicino, levigata lungo l'anello
const nS = B.normali(sc.pos, sc.idx);
let Nn = Rr.map(p => { let bi = 0, bd = 1e9; for (let i = 0; i < sc.pos.length / 3; i++) { const d = len(sub(P3(sc, i), p)); if (d < bd) { bd = d; bi = i; } } return [nS[3 * bi], nS[3 * bi + 1], nS[3 * bi + 2]]; });
const sf0 = P3({ pos: co.pos }, 0); // solo per orientare: la normale deve guardare la testa
const cT = (() => { let s = [0, 0, 0], n = 0; for (let i = 0; i < co.pos.length; i += 3) { s = add(s, [co.pos[i], co.pos[i + 1], co.pos[i + 2]]); n++; } return s.map(x => x / n); })();
Nn = Nn.map(n => dot(n, sub(cT, cen)) < 0 ? n.map(x => -x) : n);
for (let it = 0; it < 30; it++) Nn = Nn.map((n, i) => nor(add(add(Nn[(i + K0 - 1) % K0], Nn[(i + 1) % K0]), n, 2)));
const ytop = Math.max(...Rr.map(p => p[1])), ybot = Math.min(...Rr.map(p => p[1]));
const lp = [], SEZ = 5; // vertici: SEZ per punto
const verts = [];
for (let i = 0; i < K0; i++) {
  const P = Rr[i], n = Nn[i]; let r = sub(P, cen); r = nor(add(r, n, -dot(r, n)));       // verso l'esterno nel piano
  const top = sstep(ybot, ytop, P[1]), f = 1 + 0.35 * top;                           // più alto/spesso in alto
  const A = add(P, n, -LAB.sink), Bb = add(add(P, r, LAB.base), n, -LAB.sink - 0.01), C = add(add(P, r, LAB.lat), n, LAB.alt * f);
  const M1 = add(add(A, C, 1), r, 0).map((x, k) => x / 2), M2 = [(Bb[0] + C[0]) / 2, (Bb[1] + C[1]) / 2, (Bb[2] + C[2]) / 2];
  verts.push(A, add(M1, r, -0.0), C, add(M2, r, 0.03), Bb);
}
const lpos = new Float32Array(verts.length * 3), lidx = [];
verts.forEach((v, i) => lpos.set(v, 3 * i));
for (let i = 0; i < K0; i++) { const j = (i + 1) % K0; for (let s = 0; s < SEZ; s++) { const s2 = (s + 1) % SEZ, a = i * SEZ + s, b = i * SEZ + s2, c = j * SEZ + s, d = j * SEZ + s2; lidx.push(a, c, b, b, c, d); } }
// verso: volume positivo
const volume = (pos, idx) => { let v = 0; for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2]; v += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6; } return v; };
if (volume(lpos, lidx) < 0) for (let t = 0; t < lidx.length; t += 3) { const b = lidx[t + 1]; lidx[t + 1] = lidx[t + 2]; lidx[t + 2] = b; }
const labbro = { pos: lpos, idx: Uint32Array.from(lidx), tag: null, fdir: null };
log('labbro', verts.length, 'vertici, volume', volume(lpos, labbro.idx).toFixed(3), 'cm³');
setMesh('labbro', labbro);

/* ---------- CAPSULA ---------- */
const all = [cg, co, labbro].map(m => m.pos);   // la griglia copre solo l'articolazione
const lo = [0, 1, 2].map(k => Math.min(...all.map(p => { let m = 1e9; for (let i = k; i < p.length; i += 3) m = Math.min(m, p[i]); return m; })) - 1.7);
const hi = [0, 1, 2].map(k => Math.max(...all.map(p => { let m = -1e9; for (let i = k; i < p.length; i += 3) m = Math.max(m, p[i]); return m; })) + 1.7);
griglia(lo, hi, PASSO, 0);
const { NX, NY, NZ, NXY } = G, N = G.N;
log('griglia', NX, NY, NZ, (N / 1e6).toFixed(1), 'M voxel');
const OSSA = ['omero', 'scapola'];
const SH = solid('omero'), SS = solid('scapola');
const dCH = edt(unione(['cart_omero'])), dLab = edt(unione(['labbro', 'cart_glen']));
const sfera = (() => { // centro e raggio dalla cartilagine della testa (media dei vertici esterni)
  return cT; })();
const lev = (F, sigma) => sfoca(F, Math.max(1, Math.round(1.5 * (sigma / G.H) ** 2)));
const eH = new Float32Array(N), eS = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const [x, y, z] = G.voxel(i); const low = sstep(0, 1.6, cT[1] - y + 0.3);   // più in basso → recesso ascellare
  eH[i] = dCH[i] - (D.omero + (D.asc - D.omero) * low);
  eS[i] = dLab[i] - D.scapola;
}
lev(eH, 0.3); lev(eS, 0.3);
const K = unione(['cart_omero', 'cart_glen', 'labbro']), ESC = new Uint8Array(N);
for (let i = 0; i < N; i++) { const inH = SH[i] && eH[i] <= 0, inS = SS[i] && eS[i] <= 0; if (inH || inS) K[i] = 1; else if (SH[i] || SS[i]) ESC[i] = 1; }
const Do = edt(K), A = new Uint8Array(N); for (let i = 0; i < N; i++) A[i] = Do[i] <= CHIUSURA ? 1 : 0;
const Ein = edt(A, true), CL = new Uint8Array(N); for (let i = 0; i < N; i++) CL[i] = (A[i] && Ein[i] > CHIUSURA) || K[i] ? 1 : 0;
const { F: Fcl } = sdf(CL); sfoca(Fcl, 6);
log('chiusura fatta');
const dEsc = sfoca(edt(ESC), 3), FB = esatta(sfoca(sdf(unione(OSSA)).F, 1), OSSA, 0.1);
const V = new Float32Array(N).fill(1); let nShell = 0;
for (let i = 0; i < N; i++) { const d = Fcl[i]; if (d < FUORI - 0.05 || d > FUORI + TH + 0.1) continue;
  const thk = Math.max(0.065, TH * sstep(0, 0.35, dEsc[i]));
  V[i] = Math.max(d - (FUORI + thk), FUORI - d, GBONE - FB[i]); if (V[i] < 0) nShell++; }
log('guscio:', nShell, 'voxel');
function componenti(Vf, quota = 0.05) {
  const lab = new Int32Array(N), vol = [0]; let n = 0;
  for (let s = 0; s < N; s++) { if (Vf[s] >= 0 || lab[s]) continue; n++; vol.push(0); const st = [s]; lab[s] = n;
    while (st.length) { const id = st.pop(); vol[n]++; const i = id % NX, j = ((id / NX) | 0) % NY, k = (id / NXY) | 0;
      for (const [ok, d] of [[i > 0, -1], [i < NX - 1, 1], [j > 0, -NX], [j < NY - 1, NX], [k > 0, -NXY], [k < NZ - 1, NXY]]) if (ok && Vf[id + d] < 0 && !lab[id + d]) { lab[id + d] = n; st.push(id + d); } } }
  const mx = Math.max(...vol), tieni = vol.map(v => v >= quota * mx);
  for (let i = 0; i < N; i++) if (Vf[i] < 0 && !tieni[lab[i]]) Vf[i] = 0.01;
  return vol.slice(1).filter(v => v >= quota * mx).length;
}
log('componenti tenute:', componenti(V));
const mesh = nets(sfoca(V, 1), () => [0, 0, 1]);
function orienta(m) {
  const T = m.idx.length / 3, e = new Map();
  for (let t = 0; t < T; t++) for (let q = 0; q < 3; q++) { const a = m.idx[3 * t + q], b = m.idx[3 * t + (q + 1) % 3], k = a < b ? a * 4294967296 + b : b * 4294967296 + a; const x = e.get(k); if (x) x.push(t); else e.set(k, [t]); }
  const flip = new Uint8Array(T), seen = new Uint8Array(T), dir = (t, a, b) => { for (let q = 0; q < 3; q++) { const u = m.idx[3 * t + q], v = m.idx[3 * t + (q + 1) % 3]; if (u === a && v === b) return 1; if (u === b && v === a) return -1; } return 0; };
  const comp = new Int32Array(T).fill(-1); let nc = 0;
  for (let s = 0; s < T; s++) { if (seen[s]) continue; seen[s] = 1; comp[s] = nc; const st = [s];
    while (st.length) { const t = st.pop();
      for (let q = 0; q < 3; q++) { const a = m.idx[3 * t + q], b = m.idx[3 * t + (q + 1) % 3], x = e.get(a < b ? a * 4294967296 + b : b * 4294967296 + a); if (x.length !== 2) continue;
        const u = x[0] === t ? x[1] : x[0]; if (seen[u]) continue; seen[u] = 1; comp[u] = nc;
        const dt = dir(t, a, b) * (flip[t] ? -1 : 1), du = dir(u, a, b); flip[u] = du === dt ? 1 : 0; st.push(u); } }
    nc++; }
  const vol = new Float64Array(nc), p = m.pos;
  for (let t = 0; t < T; t++) { let [a, b, c] = [0, 1, 2].map(q => 3 * m.idx[3 * t + q]); if (flip[t]) [b, c] = [c, b];
    vol[comp[t]] += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; }
  const idx = m.idx.slice();
  for (let t = 0; t < T; t++) if (flip[t] !== (vol[comp[t]] < 0 ? 1 : 0)) { const b = idx[3 * t + 1]; idx[3 * t + 1] = idx[3 * t + 2]; idx[3 * t + 2] = b; }
  return { pos: m.pos, idx };
}
const orient = orienta(mesh);
// riduzione (QEM): il guscio ha ~400k triangoli alla risoluzione della griglia, ne bastano TRI_CAPS
const rid = B.riduci(Float64Array.from(orient.pos), orient.idx, TRI_CAPS, new Uint8Array(orient.pos.length / 3));
const cc = B.compatta(rid.pos, rid.idx);
const caps = { pos: Float32Array.from(cc.pos), idx: Uint32Array.from(cc.idx), tag: null, fdir: null };
log('capsula', caps.pos.length / 3, 'vertici, volume', volume(caps.pos, caps.idx).toFixed(2), 'cm³');
setMesh('caps', caps);

/* ---------- controlli ---------- */
{ const { F } = sdf(unione([...OSSA, 'cart_omero', 'cart_glen'])), h = [0, 0, 0, 0, 0];
  for (let v = 0; v < caps.pos.length; v += 3) { const d = G.sample(F, caps.pos[v], caps.pos[v + 1], caps.pos[v + 2]); h[d < 0.15 ? 0 : d < 0.25 ? 1 : d < 0.35 ? 2 : d < 0.5 ? 3 : 4]++; }
  log('distanza capsula-osso (vertici) <1.5, 1.5-2.5, 2.5-3.5, 3.5-5, >5 mm:', h.join(' ')); }
const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) { const U = {}; for (const [n, m] of [['labbro', labbro], ['caps', caps]]) U[n] = { pos: Array.from(m.pos, v => +v.toFixed(4)), idx: Array.from(m.idx) }; writeFileSync(prova, JSON.stringify(U)); log('scritto', prova); }
else saveFile(repack());
