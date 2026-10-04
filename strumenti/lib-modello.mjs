/* Funzioni comuni agli strumenti che modificano le mesh incorporate in modelli/ginocchio-3d.html
   (o in un altro modello indicato con MODELLO=<file>, es. il polso):
   lettura/scrittura di bpdat/bpman, voxelizzazione, trasformata di distanza, campionamento.
   bpdat può essere compresso con gzip (polso): viene letto e riscritto nello stesso formato. */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync, constants as Z } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILE = process.env.MODELLO ? resolve(process.env.MODELLO) : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'ginocchio-3d.html'); // MODELLO=<file> per lavorare su una copia
export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const T0 = Date.now();
export const log = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(1) + 's', ...a);

/* ============ Lettura delle mesh incorporate ============ */
export const M = { html: readFileSync(FILE, 'utf8') };
let html = M.html;
const reMan = /(<script id="bpman" type="application\/json">)(.*?)(<\/script>)/s;
const reDat = /(<script id="bpdat" type="text\/plain">)(.*?)(<\/script>)/s;
export const reManRe = reMan, reDatRe = reDat;
const isGz = b => b[0] === 0x1f && b[1] === 0x8b;
const leggiDat = s => { const b = Buffer.from(s.trim(), 'base64'); return isGz(b) ? gunzipSync(b) : b; };
export const GZIP = isGz(Buffer.from(html.match(reDat)[2].trim().slice(0, 8), 'base64'));
export let man = JSON.parse(html.match(reMan)[2]);
export let buf0 = leggiDat(html.match(reDat)[2]);
let ab = buf0.buffer.slice(buf0.byteOffset, buf0.byteOffset + buf0.length);
// mesh di partenza lette da una revisione git del modello (il resto della pagina resta quello attuale):
// così uno strumento riparte sempre dalle stesse mesh e si può rilanciare
export function meshDaRevisione(rev) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const h = execFileSync('git', ['show', `${rev}:${relative(root, FILE).split('\\').join('/')}`], { cwd: root, maxBuffer: 1 << 30 }).toString('utf8');
  man = JSON.parse(h.match(reMan)[2]); buf0 = leggiDat(h.match(reDat)[2]);
  ab = buf0.buffer.slice(buf0.byteOffset, buf0.byteOffset + buf0.length); override.clear(); topo.clear();
  return h;
}
// posizioni di una mesh lette da una revisione git del modello, senza toccare le altre (stesso numero di vertici);
// `file` = percorso nel repository (utile se MODELLO punta a una copia fuori dal repository)
export function posDaRevisione(rev, name, file) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const h = execFileSync('git', ['show', `${rev}:${file || relative(root, FILE).split('\\').join('/')}`], { cwd: root, maxBuffer: 1 << 30 }).toString('utf8');
  const mn = JSON.parse(h.match(reMan)[2]), b = leggiDat(h.match(reDat)[2]), m = mn.meshes.findLast(x => x.n === name);
  const q = new Uint16Array(b.buffer.slice(b.byteOffset + m.p, b.byteOffset + m.p + m.nv * 6)), pos = new Float32Array(m.nv * 3);
  for (let i = 0; i < m.nv * 3; i++) { const k = i % 3; pos[i] = mn.min[k] + q[i] / 65535 * (mn.max[k] - mn.min[k]); }
  return pos;
}
// mesh completa (posizioni e indici) letta da una revisione git del modello: per ripartire da una forma che lo strumento sostituisce
export function realDaRevisione(rev, name, file) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const h = execFileSync('git', ['show', `${rev}:${file || relative(root, FILE).split('\\').join('/')}`], { cwd: root, maxBuffer: 1 << 30 }).toString('utf8');
  const mn = JSON.parse(h.match(reMan)[2]), b = leggiDat(h.match(reDat)[2]), m = mn.meshes.findLast(x => x.n === name);
  const q = new Uint16Array(b.buffer.slice(b.byteOffset + m.p, b.byteOffset + m.p + m.nv * 6)), pos = new Float32Array(m.nv * 3);
  for (let i = 0; i < m.nv * 3; i++) { const k = i % 3; pos[i] = mn.min[k] + q[i] / 65535 * (mn.max[k] - mn.min[k]); }
  const ib = b.buffer.slice(b.byteOffset + m.i, b.byteOffset + m.i + m.ni * (m.i16 ? 2 : 4));
  return { pos, idx: m.i16 ? new Uint16Array(ib) : new Uint32Array(ib) };
}
// posizioni correnti (modificabili con setPos prima della voxelizzazione)
const override = new Map();
export function setPos(name, pos) { override.set(name, pos); const t = topo.get(name); if (t) t.pos = pos; }
// mesh con topologia nuova (posizioni, indici, tag, direzioni delle fibre)
const topo = new Map();
export function setMesh(name, mesh) { topo.set(name, mesh); override.set(name, mesh.pos); }
// scarta le modifiche in memoria a una mesh: al salvataggio resta quella incorporata nel file
export function ripristina(name) { topo.delete(name); override.delete(name); }
// attributi per vertice originali: tag (colore muscolo/tendine) e direzione delle fibre
export function attrs(name) {
  const t = topo.get(name); if (t) return { tag: t.tag, fdir: t.fdir };
  const m = man.meshes.findLast(x => x.n === name);
  return { tag: m.t !== undefined ? new Uint8Array(ab, m.t, m.nv).slice() : null, fdir: m.d !== undefined ? new Int8Array(ab, m.d, m.nv * 3).slice() : null };
}
export function REAL(name) {
  const t = topo.get(name); if (t) return { pos: t.pos, idx: t.idx, nv: t.pos.length / 3 };
  const m = man.meshes.findLast(x => x.n === name), mn = man.min, mx = man.max;
  let pos = override.get(name);
  if (!pos) { const q = new Uint16Array(ab, m.p, m.nv * 3); pos = new Float32Array(m.nv * 3);
    for (let i = 0; i < m.nv * 3; i++) { const k = i % 3; pos[i] = mn[k] + q[i] / 65535 * (mx[k] - mn[k]); } }
  const idx = m.i16 ? new Uint16Array(ab, m.i, m.ni) : new Uint32Array(ab, m.i, m.ni);
  return { pos, idx, nv: m.nv };
}

/* ============ Voxel ============ */
export let O = [-6.5, -10, -6], H = 0.1, NX = 130, NY = 195, NZ = 128, NXY = NX * NY, N = NXY * NZ;
// griglia diversa (per strumenti che lavorano su un'altra regione): va impostata prima di ogni voxelizzazione
export function setGriglia(o, h, nx, ny, nz) { O = o; H = h; NX = nx; NY = ny; NZ = nz; NXY = NX * NY; N = NXY * NZ; }
export const vi = (i, j, k) => i + NX * j + NXY * k;
export const or = (A, B) => { for (let i = 0; i < N; i++) A[i] |= B[i]; return A; };
// solido: riempimento per parità lungo z (mesh chiuse) + superficie campionata
export function solid(name, soloSuperficie = false) {
  const { pos, idx } = REAL(name), M = new Uint8Array(N);
  if (!soloSuperficie) {
    const cols = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
      const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
      const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - O[0]) / H - 0.5)), i1 = Math.min(NX - 1, Math.floor((Math.max(ax, bx, cx) - O[0]) / H - 0.5));
      const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - O[1]) / H - 0.5)), j1 = Math.min(NY - 1, Math.floor((Math.max(ay, by, cy) - O[1]) / H - 0.5));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const x = O[0] + (i + 0.5) * H + 1e-5, y = O[1] + (j + 0.5) * H + 1.3e-5;
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const key = i + NX * j; let L = cols.get(key); if (!L) cols.set(key, L = []);
        L.push(l1 * pos[a + 2] + l2 * pos[b + 2] + l3 * pos[c + 2]);
      }
    }
    for (const [key, L] of cols) {
      L.sort((a, b) => a - b);
      for (let q = 0; q + 1 < L.length; q += 2) {
        const k0 = Math.max(0, Math.ceil((L[q] - O[2]) / H - 0.5)), k1 = Math.min(NZ - 1, Math.floor((L[q + 1] - O[2]) / H - 0.5));
        for (let k = k0; k <= k1; k++) M[key + NXY * k] = 1;
      }
    }
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const L = Math.max(Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]), Math.hypot(pos[a] - pos[c], pos[a + 1] - pos[c + 1], pos[a + 2] - pos[c + 2]), Math.hypot(pos[b] - pos[c], pos[b + 1] - pos[c + 1], pos[b + 2] - pos[c + 2]));
    const m = Math.max(1, Math.ceil(L / (H * 0.5)));
    for (let u = 0; u <= m; u++) for (let v = 0; v <= m - u; v++) {
      const w = m - u - v;
      const i = Math.floor(((pos[a] * u + pos[b] * v + pos[c] * w) / m - O[0]) / H), j = Math.floor(((pos[a + 1] * u + pos[b + 1] * v + pos[c + 1] * w) / m - O[1]) / H), k = Math.floor(((pos[a + 2] * u + pos[b + 2] * v + pos[c + 2] * w) / m - O[2]) / H);
      if (i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ) M[vi(i, j, k)] = 1;
    }
  }
  return M;
}
// trasformata di distanza euclidea (Felzenszwalb): distanza dal set (inv: dal complemento)
export function dt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) { const r = v[k]; s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break; }
    if (k === 0 && s <= z[0]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
}
export function edt(M, inv = false) {
  const D = new Float32Array(N); for (let i = 0; i < N; i++) D[i] = (inv ? !M[i] : M[i]) ? 0 : 1e10;
  const mx = Math.max(NX, NY, NZ), f = new Float64Array(mx), d = new Float64Array(mx), v = new Int32Array(mx), z = new Float64Array(mx + 1);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { const b = NX * j + NXY * k; for (let i = 0; i < NX; i++) f[i] = D[b + i]; dt1(f, NX, d, v, z); for (let i = 0; i < NX; i++) D[b + i] = d[i]; }
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const b = i + NXY * k; for (let j = 0; j < NY; j++) f[j] = D[b + NX * j]; dt1(f, NY, d, v, z); for (let j = 0; j < NY; j++) D[b + NX * j] = d[j]; }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const b = i + NX * j; for (let k = 0; k < NZ; k++) f[k] = D[b + NXY * k]; dt1(f, NZ, d, v, z); for (let k = 0; k < NZ; k++) D[b + NXY * k] = d[k]; }
  for (let i = 0; i < N; i++) D[i] = Math.sqrt(D[i]) * H; return D;
}
export function sample(F, x, y, z) { // trilineare sui centri dei voxel
  let fx = (x - O[0]) / H - 0.5, fy = (y - O[1]) / H - 0.5, fz = (z - O[2]) / H - 0.5;
  fx = clamp(fx, 0, NX - 1.001); fy = clamp(fy, 0, NY - 1.001); fz = clamp(fz, 0, NZ - 1.001);
  const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k, b = vi(i, j, k), l = (a, c, t) => a + (c - a) * t;
  return l(l(l(F[b], F[b + 1], u), l(F[b + NX], F[b + NX + 1], u), v), l(l(F[b + NXY], F[b + NXY + 1], u), l(F[b + NXY + NX], F[b + NXY + NX + 1], u), v), w);
}

const v3 = { add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len: a => Math.hypot(a[0], a[1], a[2]) };
// distanza esatta dai triangoli delle mesh (con segno dalla normale della faccia più vicina) nei voxel entro `banda`
// dalla superficie; altrove resta il valore della trasformata di distanza (F). Le mesh ossee sono chiuse e orientate verso l'esterno.
export function esatta(F, nomi, banda = 0.07) {
  const { add, sub, mul, dot, cross, len } = v3;
  const best = new Float32Array(N).fill(1e9), sg = new Int8Array(N);
  const cp = (p, a, b, c) => { // punto del triangolo più vicino a p (Ericson, Real-Time Collision Detection 5.1.5)
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
    const pc = sub(p, c), d5 = dot(ab, pc), d6 = dot(ac, pc); if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
    const dn = 1 / (va + vb + vc); return add(a, add(mul(ab, vb * dn), mul(ac, vc * dn)));
  };
  const lo = [O[0], O[1], O[2]], hi = [O[0] + NX * H, O[1] + NY * H, O[2] + NZ * H];
  for (const n of nomi) {
    const { pos, idx } = REAL(n);
    for (let t = 0; t < idx.length; t += 3) {
      const a = [pos[3 * idx[t]], pos[3 * idx[t] + 1], pos[3 * idx[t] + 2]], b = [pos[3 * idx[t + 1]], pos[3 * idx[t + 1] + 1], pos[3 * idx[t + 1] + 2]], c = [pos[3 * idx[t + 2]], pos[3 * idx[t + 2] + 1], pos[3 * idx[t + 2] + 2]];
      const mn = [0, 1, 2].map(k => Math.min(a[k], b[k], c[k]) - banda), mx = [0, 1, 2].map(k => Math.max(a[k], b[k], c[k]) + banda);
      if (mx[0] < lo[0] || mx[1] < lo[1] || mx[2] < lo[2] || mn[0] > hi[0] || mn[1] > hi[1] || mn[2] > hi[2]) continue;
      const nf = cross(sub(b, a), sub(c, a)), r = [NX, NY, NZ];
      const i0 = [0, 1, 2].map(k => Math.max(0, Math.ceil((mn[k] - O[k]) / H - 0.5))), i1 = [0, 1, 2].map(k => Math.min(r[k] - 1, Math.floor((mx[k] - O[k]) / H - 0.5)));
      for (let kk = i0[2]; kk <= i1[2]; kk++) for (let jj = i0[1]; jj <= i1[1]; jj++) for (let ii = i0[0]; ii <= i1[0]; ii++) {
        const p = [O[0] + (ii + 0.5) * H, O[1] + (jj + 0.5) * H, O[2] + (kk + 0.5) * H], q = cp(p, a, b, c), d = sub(p, q), dd = len(d), id = ii + NX * jj + NXY * kk;
        if (dd < best[id] - 1e-7) { best[id] = dd; sg[id] = dot(d, nf) >= 0 ? 1 : -1; }
      }
    }
  }
  for (let i = 0; i < N; i++) if (best[i] <= banda) F[i] = sg[i] * best[i];
  return F;
}

/* ============ Superfici implicite (strumenti del polso) ============ */
const { add, sub, mul, dot, cross } = v3, nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// imposta una griglia che contiene il riquadro [lo, hi] (+ margine) e restituisce i suoi parametri
export function griglia(lo, hi, h = 0.02, pad = 0.45) {
  const o = lo.map(v => v - pad), n = hi.map((v, k) => Math.ceil((v + pad - o[k]) / h));
  setGriglia(o, h, n[0], n[1], n[2]); return { o, h, nx: n[0], ny: n[1], nz: n[2] };
}
// distanza con segno da un solido voxelizzato (negativa dentro)
export function sdf(M) {
  const Do = edt(M), Di = edt(M, true), F = new Float32Array(N), h2 = H / 2;
  for (let i = 0; i < N; i++) F[i] = M[i] ? -(Di[i] - h2) : Do[i] - h2;
  return { F, Do };
}
// chiusura morfologica di raggio r: la superficie scavalca rime articolari e piccole concavità
export function chiuso(Do, r) {
  const A = new Uint8Array(N); for (let i = 0; i < N; i++) A[i] = Do[i] <= r ? 1 : 0;
  const E = edt(A, true), F = new Float32Array(N);
  for (let i = 0; i < N; i++) F[i] = A[i] ? r - E[i] : Do[i];
  return F;
}
export const unione = nomi => nomi.reduce((M, n) => or(M, solid(n)), new Uint8Array(N));
// gradiente (non normalizzato) di un campo: array campionato sulla griglia corrente oppure { s: funzione(p) }
export const grad = (F, p, e = H * 0.75) => { const f = F.s || ((x, y, z) => sample(F, x, y, z)), g = F.s ? (x, y, z) => f([x, y, z]) : f;
  return [g(p[0] + e, p[1], p[2]) - g(p[0] - e, p[1], p[2]), g(p[0], p[1] + e, p[2]) - g(p[0], p[1] - e, p[2]), g(p[0], p[1], p[2] + e) - g(p[0], p[1], p[2] - e)]; };
// sfocatura (box 3×3×3, più passate): toglie la gradinatura dei campi di distanza
export function sfoca(F, passate = 2) {
  let A = F, Bf = new Float32Array(F.length);
  for (let p = 0; p < passate; p++) for (const [st, n] of [[1, NX], [NX, NY], [NXY, NZ]]) {
    for (let i = 0; i < A.length; i++) { const c = ((i / st) | 0) % n; Bf[i] = (A[c > 0 ? i - st : i] + A[i] + A[c < n - 1 ? i + st : i]) / 3; }
    [A, Bf] = [Bf, A];
  }
  return A === F ? F : (F.set(A), F);
}
// porta p sulla superficie di livello lev del campo f(p) (funzione) con passi di Newton lungo il gradiente
export function proietta(f, p, lev, it = 8) {
  for (let i = 0; i < it; i++) {
    const e = H * 0.75, v = f(p) - lev;
    const g = [f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]), f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]), f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e])].map(x => x / (2 * e));
    const g2 = dot(g, g) || 1; p = sub(p, mul(g, clamp(v / g2, -0.15, 0.15)));
    if (Math.abs(v) < 1e-4) break;
  }
  return p;
}

/* ============ Smussatura di Taubin (non restringe la forma) ============ */
export function taubin(pos, I, iter) {
  const nv = pos.length / 3, nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const NB = nb.map(s => [...s]);
  for (let it = 0; it < iter; it++) {
    const lam = it % 2 ? -0.53 : 0.5, q = pos.slice();
    for (let i = 0; i < nv; i++) { const L = NB[i]; if (!L.length) continue; let x = 0, y = 0, z = 0; for (const j of L) { x += pos[3 * j]; y += pos[3 * j + 1]; z += pos[3 * j + 2]; }
      q[3 * i] += lam * (x / L.length - pos[3 * i]); q[3 * i + 1] += lam * (y / L.length - pos[3 * i + 1]); q[3 * i + 2] += lam * (z / L.length - pos[3 * i + 2]); }
    pos = q;
  }
  return pos;
}

/* ============ Surface nets su un campo campionato ai centri dei voxel ============ */
export function nets(V, fd) {
    const cx = NX - 1, cy = NY - 1, cz = NZ - 1, C = new Int32Array(cx * cy * cz).fill(-1), P = [];
  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const b = i + NX * j + NXY * k; let m = 0;
    for (let c = 0; c < 8; c++) { v[c] = V[b + CO[c][0] + CO[c][1] * NX + CO[c][2] * NXY]; if (v[c] < 0) m |= 1 << c; }
    if (m === 0 || m === 255) continue;
    let ax = 0, ay = 0, az = 0, n = 0;
    for (const [a, bb] of ED) if ((v[a] < 0) !== (v[bb] < 0)) { const t = v[a] / (v[a] - v[bb]); ax += CO[a][0] + (CO[bb][0] - CO[a][0]) * t; ay += CO[a][1] + (CO[bb][1] - CO[a][1]) * t; az += CO[a][2] + (CO[bb][2] - CO[a][2]) * t; n++; }
    C[i + cx * j + cx * cy * k] = P.length / 3;
    P.push(O[0] + (i + 0.5 + ax / n) * H, O[1] + (j + 0.5 + ay / n) * H, O[2] + (k + 0.5 + az / n) * H);
  }
  const id = (i, j, k) => C[i + cx * j + cx * cy * k], I = [];
  const quad = (a, b, c, d) => { if (a >= 0 && b >= 0 && c >= 0 && d >= 0) I.push(a, b, c, a, c, d); };
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    if (id(i, j, k) < 0) continue; const b = i + NX * j + NXY * k, s0 = V[b] < 0;
    if (j > 0 && k > 0 && s0 !== (V[b + 1] < 0)) quad(id(i, j, k), id(i, j - 1, k), id(i, j - 1, k - 1), id(i, j, k - 1));
    if (i > 0 && k > 0 && s0 !== (V[b + NX] < 0)) quad(id(i, j, k), id(i, j, k - 1), id(i - 1, j, k - 1), id(i - 1, j, k));
    if (i > 0 && j > 0 && s0 !== (V[b + NXY] < 0)) quad(id(i, j, k), id(i - 1, j, k), id(i - 1, j - 1, k), id(i, j - 1, k));
  }
  // triangoli orientati con la normale verso l'esterno (gradiente del campo)
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]].map(q => [P[3 * q], P[3 * q + 1], P[3 * q + 2]]);
    const m = mul(add(add(a, b), c), 1 / 3), gr = grad(V, m);
    if (dot(cross(sub(b, a), sub(c, a)), gr) < 0) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  }
  let pos = new Float32Array(P);
  pos = taubin(pos, I, 12); const nv = pos.length / 3;
  const fdir = new Int8Array(nv * 3);
  for (let i = 0; i < nv; i++) { const d = nrm(fd([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]])); for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(d[k] * 127); }
  return { pos, idx: Uint32Array.from(I), tag: null, fdir };
}

// campo con segno di un gruppo di mesh nella griglia corrente: trasformata di distanza + distanza esatta vicino alla superficie
export const campo = nomi => { const M = unione(nomi), { F, Do } = sdf(M); return { F: esatta(sfoca(F, 1), nomi, 0.1), Do }; };
export const voxel = id => [O[0] + (id % NX + 0.5) * H, O[1] + (((id / NX) | 0) % NY + 0.5) * H, O[2] + (((id / (NX * NY)) | 0) + 0.5) * H];
export const valuta = g => { const V = new Float32Array(N); for (let id = 0; id < N; id++) V[id] = g(voxel(id)); return V; };

/* ============ Scrittura ============ */
// sovrascrive sul posto le posizioni (stesso numero di vertici) di una mesh esistente
export function writePos(buf, name, pos) {
  const m = man.meshes.findLast(x => x.n === name), q = new Uint16Array(m.nv * 3);
  for (let i = 0; i < m.nv * 3; i++) { const k = i % 3; q[i] = Math.round(clamp((pos[i] - man.min[k]) / (man.max[k] - man.min[k]), 0, 1) * 65535); }
  Buffer.from(q.buffer).copy(buf, m.p);
}
// ricompone il buffer: mesh con topologia nuova (setMesh) o posizioni nuove (setPos); il resto copiato com'è
const quant = pos => { const q = new Uint16Array(pos.length); for (let i = 0; i < pos.length; i++) { const k = i % 3; q[i] = Math.round(clamp((pos[i] - man.min[k]) / (man.max[k] - man.min[k]), 0, 1) * 65535); } return Buffer.from(q.buffer); };
export function repack() {
  const parts = []; let len = 0; const seen = new Map();
  const push = b => { const pad = (4 - len % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); len += pad; } const off = len; parts.push(b); len += b.length; return off; };
  const old = (off, n) => { const k = off + ':' + n; if (!seen.has(k)) seen.set(k, push(buf0.subarray(off, off + n))); return seen.get(k); };
  const live = new Map(); man.meshes.forEach((m, i) => live.set(m.n, i));
  man.meshes = man.meshes.map((m, i) => {
    const e = { ...m }, isLive = live.get(m.n) === i, T = isLive && topo.get(m.n), P = isLive && override.get(m.n);
    if (T) {
      const nv = T.pos.length / 3, i16 = nv < 65536; e.nv = nv; e.ni = T.idx.length; e.i16 = i16 ? 1 : 0;
      e.p = push(quant(T.pos)); delete e.t; delete e.d;
      if (T.tag) e.t = push(Buffer.from(Uint8Array.from(T.tag).buffer)); if (T.fdir) e.d = push(Buffer.from(Int8Array.from(T.fdir).buffer));
      e.i = push(Buffer.from((i16 ? Uint16Array.from(T.idx) : Uint32Array.from(T.idx)).buffer));
    } else {
      e.p = P ? push(quant(P)) : old(m.p, m.nv * 6);
      if (m.t !== undefined) e.t = old(m.t, m.nv); if (m.d !== undefined) e.d = old(m.d, m.nv * 3);
      e.i = old(m.i, m.ni * (m.i16 ? 2 : 4));
    }
    return e;
  });
  return Buffer.concat(parts);
}
export function saveFile(buf) {
  if (GZIP) buf = gzipSync(buf, { level: Z.Z_BEST_COMPRESSION });
  const html = M.html.replace(reMan, (_, a, b, c) => a + JSON.stringify(man) + c).replace(reDat, (_, a, b, c) => a + buf.toString('base64') + c);
  writeFileSync(FILE, html); log('scritto', FILE);
}
