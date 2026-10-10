/* Cuscinetti adiposi del gomito (modelli/gomito-3d.html): `fat_ant` (fossette coronoidea e radiale) e `fat_post` (fossetta olecranica).

   Uso (dalla cartella del progetto):
     node strumenti/cuscinetti-gomito.mjs                  → riscrive le due mesh nel file del modello
     node strumenti/cuscinetti-gomito.mjs --prova=f.json   → non tocca il modello: scrive le mesh (con ossa e capsula) in un JSON
     MODELLO=/tmp/copia.html node strumenti/cuscinetti-gomito.mjs   → lavora su una copia

   I cuscinetti sono intracapsulari ma extrasinoviali: riempiono lo spazio tra l'osso della fossetta (omero) e la faccia profonda della capsula,
   senza dentro né osso né capsula. Nel modello originale erano due ovali che fluttuavano a 1–4 mm dall'osso e attraversavano la capsula.
   Qui ogni cuscinetto è la regione compresa, lungo ogni colonna (asse z: anteriore dal davanti, posteriore da dietro), tra la superficie
   dell'osso e la faccia profonda della capsula (spessore `g`), limitata a un territorio liscio (ellissi attorno alle fossette, `ANT`, `POST`)
   e alla zona realmente coperta dalla capsula (`copertura`); lo spessore scende con continuità a zero ai margini (bordo sottile a cuneo, niente
   scalino), segue le creste (più sottile sulla cresta capitulo-trocleare, più spesso nelle due fossette) e ha una leggera lobulatura del
   tessuto adiposo (`LOB`). Superficie ottenuta da un campo implicito (surface nets) con distanza esatta da ossa, cartilagini e capsula.
   Riparte sempre da ossa, cartilagini e capsula incorporate (che non modifica): va lanciato dopo `ossa-gomito.mjs` e `cartilagini-gomito.mjs`. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { setMesh, sample, clamp, sstep, log, repack, saveFile, esatta, REAL, griglia, sdf, sfoca, unione, nets, vi } = G;

const OSSA = ['omero', 'ulna', 'radio', 'cart_omero', 'cart_ulna', 'cart_radio'];
const PASSO = 0.03;          // cm, passo della griglia
const GAP = 0.012;           // distanza minima da osso e capsula (cm)
const LOB = { ampiezza: 0.12, scala: 0.36 };   // lobulatura: riduzione massima relativa dello spessore e lunghezza d'onda (cm)
// territori: ellissi in (x, y) con centro c, semiassi r; il peso scende da 1 a 0 tra `bordo[0]` e `bordo[1]` (raggio normalizzato) e moltiplica lo spessore
// massimo `tmax`; `sigma` (cm) = levigatura gaussiana della distanza dall'osso: la superficie del grasso è l'isolivello `livello` del campo levigato, che nelle
// fossette (concavità) sta sopra l'osso e sulle creste lo attraversa: il grasso colma la fossetta con una cupola liscia e si assottiglia sulle creste;
// `piano` = z del piano che separa i due cuscinetti (setto osseo tra le fossette)
const CUSCINETTI = {
  fat_ant: { dir: +1, lo: [-2.5, 1.0, -0.4], hi: [2.1, 3.3, 2.2], bordo: [0.4, 1.0], tmax: 0.9, sigma: 0.8, livello: 0.36, piano: -0.25,
    ellissi: [{ c: [0.35, 2.1], r: [0.9, 0.85] }, { c: [-1.2, 2.1], r: [0.85, 0.75] }] },        // fossa coronoidea (mediale) e fossa radiale (laterale)
  fat_post: { dir: -1, lo: [-2.3, 1.0, -2.5], hi: [2.1, 3.5, 0.3], bordo: [0.4, 1.0], tmax: 1.0, sigma: 0.45, livello: 0.04, piano: -0.25,
    ellissi: [{ c: [0.15, 2.35], r: [1.65, 1.0] }] },                                            // fossa olecranica con le espansioni mediale e laterale
};

// campo con segno (negativo dentro) di un solido: distanza esatta entro `banda`
function campoSolido(n, banda) { const { F } = sdf(G.solid(n)); return esatta(sfoca(F, 1), [n], banda); }
function campoMin(nomi, banda) { let F = null; for (const n of nomi) { const E = campoSolido(n, banda); if (!F) F = E; else for (let i = 0; i < F.length; i++) if (E[i] < F[i]) F[i] = E[i]; } return F; }
// rumore di valore liscio, deterministico, in (x, y)
const hash = (i, j, s) => { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function rumore(x, y, s) { const fx = Math.floor(x), fy = Math.floor(y), u = sstep(0, 1, x - fx), v = sstep(0, 1, y - fy), l = (a, b, t) => a + (b - a) * t;
  return l(l(hash(fx, fy, s), hash(fx + 1, fy, s), u), l(hash(fx, fy + 1, s), hash(fx + 1, fy + 1, s), u), v); }
// levigatura gaussiana (3 box) di un campo della griglia corrente, calcolata su una griglia 4× più rada e reinterpolata
function levigato(F, sigma) {
  const { NX, NY, NZ, O, H } = G, f = 4, h = H * f, nx = Math.ceil(NX / f), ny = Math.ceil(NY / f), nz = Math.ceil(NZ / f);
  let A = new Float32Array(nx * ny * nz), B = new Float32Array(A.length);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) A[i + nx * (j + ny * k)] = clamp(sample(F, O[0] + (i + 0.5) * h, O[1] + (j + 0.5) * h, O[2] + (k + 0.5) * h), -0.6, 1.2);
  const r = Math.max(1, Math.round(Math.sqrt(sigma * sigma * 12 / 3 / (h * h) + 1) / 2)); // 3 passate di box largo 2r+1: sigma² = 3 (2r+1)²−1)/12 h²
  const pass = (src, dst, st, n) => { for (let id = 0; id < src.length; id++) { const c = ((id / st) | 0) % n; let s = 0, q = 0; for (let d = -r; d <= r; d++) { const cc = c + d; if (cc >= 0 && cc < n) { s += src[id + d * st]; q++; } } dst[id] = s / q; } };
  for (let p = 0; p < 3; p++) for (const [st, n] of [[1, nx], [nx, ny], [nx * ny, nz]]) { pass(A, B, st, n); [A, B] = [B, A]; }
  const out = new Float32Array(G.N);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const fx = clamp((O[0] + (i + 0.5) * H - O[0]) / h - 0.5, 0, nx - 1.001), fy = clamp(((j + 0.5) * H) / h - 0.5, 0, ny - 1.001), fz = clamp(((k + 0.5) * H) / h - 0.5, 0, nz - 1.001);
    const a = Math.floor(fx), b = Math.floor(fy), c = Math.floor(fz), u = fx - a, v = fy - b, w = fz - c, I = (x, y, z) => A[(a + x) + nx * ((b + y) + ny * (c + z))], l = (p, q, t) => p + (q - p) * t;
    out[G.vi(i, j, k)] = l(l(l(I(0, 0, 0), I(1, 0, 0), u), l(I(0, 1, 0), I(1, 1, 0), u), v), l(l(I(0, 0, 1), I(1, 0, 1), u), l(I(0, 1, 1), I(1, 1, 1), u), v), w);
  }
  return out;
}
// componenti connesse (6 vicini) dei voxel con V < 0: si tengono quelle di volume ≥ `quota` del maggiore; gli altri frammenti (oltre la capsula) si scartano
function tieniPrincipali(V, quota = 0.25) {
  const { NX, NXY } = G, N = G.N, lab = new Int32Array(N), vol = [0]; let n = 0;
  for (let s = 0; s < N; s++) { if (V[s] >= 0 || lab[s]) continue; n++; vol.push(0); const st = [s]; lab[s] = n;
    while (st.length) { const id = st.pop(); vol[n]++; const i = id % NX, j = ((id / NX) | 0) % G.NY, k = (id / NXY) | 0;
      for (const [ok, d] of [[i > 0, -1], [i < NX - 1, 1], [j > 0, -NX], [j < G.NY - 1, NX], [k > 0, -NXY], [k < G.NZ - 1, NXY]]) if (ok && V[id + d] < 0 && !lab[id + d]) { lab[id + d] = n; st.push(id + d); } } }
  const mx = Math.max(...vol), tieni = vol.map(v => v >= quota * mx);
  for (let i = 0; i < N; i++) if (V[i] < 0 && !tieni[lab[i]]) V[i] = 0.01;
  return vol.slice(1).filter(v => v >= quota * mx).length;
}

// faccia profonda della capsula come superficie z(x, y): dal lato opposto al cuscinetto, primo ingresso nel guscio (faccia esterna) e relativa uscita (faccia profonda).
// Fuori dalla zona coperta la quota si estende con continuità per `estendi` cm (capsula "virtuale" liscia) e si leviga; oltre non c'è limite.
function facciaProfonda(FC, dir, estendi, sfuma) {
  const { NX, NY, NZ, O, H } = G, zc = k => O[2] + (k + 0.5) * H, Z = new Float32Array(NX * NY).fill(NaN);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    let dentro = false;
    for (let t = 0; t < NZ; t++) { const k = dir > 0 ? NZ - 1 - t : t, f = FC[vi(i, j, k)];
      if (!dentro && f < 0) dentro = true;
      else if (dentro && f >= 0) { const kp = k - dir, f1 = FC[vi(i, j, kp)]; Z[i + NX * j] = zc(kp) + (zc(k) - zc(kp)) * (f1 / (f1 - f)); break; } }
  }
  const passi = Math.round(estendi / H), liscia = (A, r) => { const T = new Float32Array(A.length), B = new Float32Array(A.length);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let s = 0, c = 0; for (let d = -r; d <= r; d++) { const q = i + d; if (q >= 0 && q < NX && !Number.isNaN(A[q + NX * j])) { s += A[q + NX * j]; c++; } } T[i + NX * j] = c ? s / c : NaN; }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let s = 0, c = 0; for (let d = -r; d <= r; d++) { const q = j + d; if (q >= 0 && q < NY && !Number.isNaN(T[i + NX * q])) { s += T[i + NX * q]; c++; } } B[i + NX * j] = c ? s / c : NaN; }
    return B; };
  let A = Z;
  for (let it = 0; it < passi; it++) { const B = A.slice(); for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { if (!Number.isNaN(A[i + NX * j])) continue; let s = 0, c = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && ii < NX && jj >= 0 && jj < NY && !Number.isNaN(A[ii + NX * jj])) { s += A[ii + NX * jj]; c++; } }
    if (c) B[i + NX * j] = s / c; } A = B; if (it % 4 == 3) A = liscia(A, 2); }
  // distanza (cm) di ogni cella coperta dal bordo della zona coperta dalla capsula (trasformata di distanza a due passate, metrica chamfer 3-4), poi levigata:
  // il cuscinetto si assottiglia verso l'inserzione prossimale della capsula, senza protrudere oltre il bordo
  const INF = 1e9, D = new Float32Array(NX * NY); for (let q = 0; q < NX * NY; q++) D[q] = Number.isNaN(Z[q]) ? 0 : INF;
  const w1 = 1, w2 = Math.SQRT2;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const q = i + NX * j; if (!D[q]) continue; let m = D[q];
    if (i > 0) m = Math.min(m, D[q - 1] + w1); if (j > 0) m = Math.min(m, D[q - NX] + w1); if (i > 0 && j > 0) m = Math.min(m, D[q - NX - 1] + w2); if (i < NX - 1 && j > 0) m = Math.min(m, D[q - NX + 1] + w2); D[q] = m; }
  for (let j = NY - 1; j >= 0; j--) for (let i = NX - 1; i >= 0; i--) { const q = i + NX * j; if (!D[q]) continue; let m = D[q];
    if (i < NX - 1) m = Math.min(m, D[q + 1] + w1); if (j < NY - 1) m = Math.min(m, D[q + NX] + w1); if (i < NX - 1 && j < NY - 1) m = Math.min(m, D[q + NX + 1] + w2); if (i > 0 && j < NY - 1) m = Math.min(m, D[q + NX - 1] + w2); D[q] = m; }
  for (let q = 0; q < NX * NY; q++) D[q] = Math.min(D[q] * H, 5);
  const r2 = Math.max(1, Math.round(0.1 / H)), Dl = liscia(liscia(D, r2), r2);
  return { z: liscia(liscia(A, Math.round(sfuma / H)), Math.round(sfuma / H)), dist: Dl };
}

function costruisci(id, P) {
  const { dir } = P;
  griglia(P.lo, P.hi, PASSO, 0.05);
  const { NX, NY, NZ, O, H } = G, N = G.N, zc = k => O[2] + (k + 0.5) * H;
  const FB = campoMin(OSSA, 0.4), FC = campoSolido('caps', 0.4), Fsm = levigato(FB, P.sigma);
  const { z: zcap, dist: dcap } = facciaProfonda(FC, dir, P.estendi ?? 0.4, 0.06);
  const V = new Float32Array(N);
  for (let k = 0; k < NZ; k++) { const z = zc(k); for (let j = 0; j < NY; j++) { const y = O[1] + (j + 0.5) * H; for (let i = 0; i < NX; i++) {
    const id3 = vi(i, j, k), x = O[0] + (i + 0.5) * H, zq = zcap[i + NX * j];
    let w = 0; for (const e of P.ellissi) { const r = Math.hypot((x - e.c[0]) / e.r[0], (y - e.c[1]) / e.r[1]); w = Math.max(w, 1 - sstep(P.bordo[0], P.bordo[1], r)); }
    const lob = 1 - LOB.ampiezza * rumore(x / LOB.scala, y / LOB.scala, id.length), T = P.tmax * w * lob * sstep(0, P.rampa ?? 0.35, dcap[i + NX * j]), lato = dir > 0 ? P.piano - z : z - P.piano;
    const cap = Number.isNaN(zq) ? -1 : dir > 0 ? z - (zq - 0.045) : (zq + 0.045) - z;
    V[id3] = Math.max(GAP - FB[id3], Fsm[id3] - P.livello, FB[id3] - T, lato, cap); } } }
  const nc = tieniPrincipali(V); log(id, 'componenti tenute:', nc);
  const mesh = nets(sfoca(V, P.levigaV ?? 3), () => [0, 0, 1]);
  return { pos: mesh.pos, idx: mesh.idx, tag: null, fdir: null, FB, FC };
}

const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1], uscita = {};
const SOLO = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const [id, P] of Object.entries(CUSCINETTI)) {
  if (SOLO.length && !SOLO.includes(id)) continue;
  const m = costruisci(id, P);
  let V = 0; for (let t = 0; t < m.idx.length; t += 3) { const a = 3 * m.idx[t], b = 3 * m.idx[t + 1], c = 3 * m.idx[t + 2], p = m.pos;
    V += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; }
  const nv = m.pos.length / 3; let dB = 0, dC = 0, mB = 9, mC = 9; for (let i = 0; i < nv; i++) { const x = m.pos[3 * i], y = m.pos[3 * i + 1], z = m.pos[3 * i + 2], b = sample(m.FB, x, y, z), c = sample(m.FC, x, y, z); mB = Math.min(mB, b); mC = Math.min(mC, c); if (b < -0.002) { dB++; if (b < -0.05 && process.env.DEBUG) console.log('  dentro osso', x.toFixed(2), y.toFixed(2), z.toFixed(2), b.toFixed(3)); }
    if (b < -0.002) {};  if (c < -0.002) { dC++; if (c < -0.1 && process.env.DEBUG) console.log('  dentro capsula', x.toFixed(2), y.toFixed(2), z.toFixed(2), c.toFixed(3)); } }
  log(id, nv, 'vertici, volume', V.toFixed(2), 'cm³; dentro osso', dB, '(min', mB.toFixed(3) + '); dentro capsula', dC, '(min', mC.toFixed(3) + ')');
  const mesh = { pos: m.pos, idx: m.idx, tag: null, fdir: null };
  setMesh(id, mesh); if (prova) uscita[id] = { pos: Array.from(mesh.pos, v => +v.toFixed(4)), idx: Array.from(mesh.idx) };
}
if (prova) { for (const o of [...OSSA, 'caps']) { const m = REAL(o); uscita[o] = { pos: Array.from(m.pos, v => +v.toFixed(4)), idx: Array.from(m.idx) }; } writeFileSync(prova, JSON.stringify(uscita)); log('scritto', prova); }
else saveFile(repack());
