/* Funzioni comuni agli strumenti del dito (modelli/polso-dito-3d.html, sezione dito: blocco bpman2/bpdat2).

   - Modello: lettura delle mesh, sostituzione (anche con topologia nuova) e salvataggio del file.
   - Vettori, distanza esatta punto-triangolo, indice spaziale dei triangoli (Indice) con distanza con segno.
   - Campo "teso" (Campo): distanza con segno dalle ossa, sfocata su griglia, così una superficie proiettata sul suo livello
     scavalca solchi e rime come un tessuto teso (come per i legamenti del polso).
   - Costruzione di nastri e lamine chiusi (spessore, margini arrotondati) con direzione delle fibre per vertice. */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync, gzipSync, constants as Z } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = resolve(process.env.MODELLO || resolve(ROOT, 'modelli', 'polso-dito-3d.html'));
const reMan = /(<script id="bpman2" type="application\/json">)(.*?)(<\/script>)/s, reDat = /(<script id="bpdat2" type="text\/plain">)(.*?)(<\/script>)/s;
export const log = (...a) => console.log(...a);

/* ============ Vettori ============ */
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]), unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ============ Modello ============ */
export class Modello {
  constructor(file = FILE, rev = null) {
    const h = rev ? execFileSync('git', ['show', `${rev}:modelli/polso-dito-3d.html`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8') : readFileSync(file, 'utf8');
    this.file = file; this.man = JSON.parse(h.match(reMan)[2]);
    let b = Buffer.from(h.match(reDat)[2].trim(), 'base64'); this.gz = b[0] === 0x1f && b[1] === 0x8b; this.buf = this.gz ? gunzipSync(b) : b;
    this.nuove = new Map();
  }
  nomi() { return this.man.meshes.map(m => m.n); }
  get(n) {
    if (this.nuove.has(n)) return this.nuove.get(n);
    const { man, buf } = this, m = man.meshes.find(x => x.n === n); if (!m) throw new Error('mesh assente: ' + n);
    const q = new Uint16Array(buf.buffer.slice(buf.byteOffset + m.p, buf.byteOffset + m.p + m.nv * 6)), pos = new Float32Array(m.nv * 3);
    for (let i = 0; i < pos.length; i++) { const k = i % 3; pos[i] = man.min[k] + q[i] / 65535 * (man.max[k] - man.min[k]); }
    const ib = buf.buffer.slice(buf.byteOffset + m.i, buf.byteOffset + m.i + m.ni * (m.i16 ? 2 : 4));
    return { pos, idx: m.i16 ? new Uint16Array(ib) : new Uint32Array(ib),
      dir: m.d !== undefined ? new Int8Array(buf.buffer.slice(buf.byteOffset + m.d, buf.byteOffset + m.d + m.nv * 3)) : null,
      tag: m.t !== undefined ? new Uint8Array(buf.buffer.slice(buf.byteOffset + m.t, buf.byteOffset + m.t + m.nv)) : null };
  }
  /* sostituisce una mesh (posizioni, indici, direzioni fibre) */
  set(n, g) { this.nuove.set(n, g); }
  salva() {
    const { man, buf } = this, parts = []; let L = 0;
    const push = b => { const pad = (4 - L % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); L += pad; } const o = L; parts.push(b); L += b.length; return o; };
    const quant = pos => { const q = new Uint16Array(pos.length); for (let i = 0; i < pos.length; i++) { const k = i % 3; q[i] = Math.round(clamp((pos[i] - man.min[k]) / (man.max[k] - man.min[k]), 0, 1) * 65535); } return Buffer.from(q.buffer); };
    const nm = man.meshes.map(m => {
      const e = { ...m }, g = this.nuove.get(m.n);
      if (g) { const nv = g.pos.length / 3, i16 = nv < 65536; e.nv = nv; e.ni = g.idx.length; e.i16 = i16 ? 1 : 0; e.p = push(quant(g.pos)); delete e.t; delete e.d;
        if (g.tag) e.t = push(Buffer.from(Uint8Array.from(g.tag).buffer)); if (g.dir) e.d = push(Buffer.from(Int8Array.from(g.dir).buffer));
        e.i = push(Buffer.from((i16 ? Uint16Array.from(g.idx) : Uint32Array.from(g.idx)).buffer)); }
      else { e.p = push(buf.subarray(m.p, m.p + m.nv * 6)); if (m.t !== undefined) e.t = push(buf.subarray(m.t, m.t + m.nv)); if (m.d !== undefined) e.d = push(buf.subarray(m.d, m.d + m.nv * 3)); e.i = push(buf.subarray(m.i, m.i + m.ni * (m.i16 ? 2 : 4))); }
      return e; });
    let out = Buffer.concat(parts); if (this.gz) out = gzipSync(out, { level: Z.Z_BEST_COMPRESSION });
    const html = readFileSync(this.file, 'utf8').replace(reMan, (_, a, b, c) => a + JSON.stringify({ ...man, meshes: nm }) + c).replace(reDat, (_, a, b, c) => a + out.toString('base64') + c);
    writeFileSync(this.file, html); log('scritto', this.file);
  }
}

/* ============ Triangoli ============ */
export function ptri(p, a, b, c) { // punto più vicino su un triangolo (Ericson)
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + d5 - d6)));
  const den = 1 / (va + vb + vc); return add(a, add(mul(ab, vb * den), mul(ac, vc * den))); }

/* Indice spaziale: triangoli di una o più mesh in celle di lato `cella` */
export class Indice {
  constructor(meshes, cella = 0.12) {
    this.c = cella; this.T = []; this.celle = new Map();
    for (const g of meshes) for (let t = 0; t < g.idx.length; t += 3) {
      const A = [0, 1, 2].map(k => [g.pos[3 * g.idx[t + k]], g.pos[3 * g.idx[t + k] + 1], g.pos[3 * g.idx[t + k] + 2]]);
      const n = unit(cross(sub(A[1], A[0]), sub(A[2], A[0]))), id = this.T.length; this.T.push({ A, n });
      const lo = [0, 1, 2].map(k => Math.floor(Math.min(A[0][k], A[1][k], A[2][k]) / cella)), hi = [0, 1, 2].map(k => Math.floor(Math.max(A[0][k], A[1][k], A[2][k]) / cella));
      for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const key = i + ',' + j + ',' + k; let l = this.celle.get(key); if (!l) this.celle.set(key, l = []); l.push(id); }
    }
  }
  /* punto più vicino entro R: { d, q, n } oppure null */
  vicino(p, R = 0.4) {
    const c = this.c, r = Math.ceil(R / c), ci = Math.floor(p[0] / c), cj = Math.floor(p[1] / c), ck = Math.floor(p[2] / c); let best = null; const visti = new Set();
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
      const l = this.celle.get(i + ',' + j + ',' + k); if (!l) continue;
      for (const id of l) { if (visti.has(id)) continue; visti.add(id); const T = this.T[id], q = ptri(p, T.A[0], T.A[1], T.A[2]), d = len(sub(p, q)); if (d <= R && (!best || d < best.d)) best = { d, q, n: T.n }; } }
    return best;
  }
  /* dentro una mesh chiusa? parità di raggi lungo +x */
  dentro(p) {
    const c = this.c, ci = Math.floor(p[0] / c), cj = Math.floor(p[1] / c), ck = Math.floor(p[2] / c), visti = new Set(); let n = 0;
    for (let i = ci; i <= ci + 40; i++) { const l = this.celle.get(i + ',' + cj + ',' + ck); if (!l) continue;
      for (const id of l) { if (visti.has(id)) continue; visti.add(id); const [a, b, cc] = this.T[id].A, e1 = sub(b, a), e2 = sub(cc, a), h = [0, -e2[2], e2[1]], det = dot(e1, h); if (Math.abs(det) < 1e-12) continue;
        const f = 1 / det, s = sub(p, a), u = f * dot(s, h); if (u < 0 || u > 1) continue; const q = cross(s, e1), v = f * q[0]; if (v < 0 || u + v > 1) continue; if (f * dot(e2, q) > 1e-9) n++; } }
    return n % 2 === 1;
  }
  /* distanza con segno (negativa dentro, segno dalla normale del triangolo più vicino; normali verso l'esterno) */
  sd(p, R = 0.5) { const v = this.vicino(p, R); if (!v) return R; const s = dot(sub(p, v.q), v.n); return s < 0 && v.d > 1e-6 ? -v.d : v.d; }
}

/* ============ Campo teso ============ */
export class Campo {
  /* sd: funzione distanza con segno; [lo, hi] riquadro; h passo; sfoca: passate di media 3×3×3 */
  constructor(sd, lo, hi, h = 0.03, sfoca = 3, cap = 0.5) {
    this.lo = lo; this.h = h; this.n = [0, 1, 2].map(k => Math.ceil((hi[k] - lo[k]) / h) + 1); const [nx, ny, nz] = this.n;
    let F = new Float32Array(nx * ny * nz);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[i + nx * (j + ny * k)] = clamp(sd([lo[0] + i * h, lo[1] + j * h, lo[2] + k * h], i, j, k), -cap, cap);
    for (let it = 0; it < sfoca; it++) { // media separabile 1-2-1 per asse
      for (let ax = 0; ax < 3; ax++) { const G = F.slice(), st = [1, nx, nx * ny][ax], nn = this.n[ax];
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const id = i + nx * (j + ny * k), c = [i, j, k][ax]; const a = c > 0 ? F[id - st] : F[id], b = c < nn - 1 ? F[id + st] : F[id]; G[id] = 0.25 * a + 0.5 * F[id] + 0.25 * b; }
        F = G; } }
    this.F = F;
  }
  v(p) { // trilineare
    const [nx, ny, nz] = this.n, h = this.h, x = clamp((p[0] - this.lo[0]) / h, 0, nx - 1.001), y = clamp((p[1] - this.lo[1]) / h, 0, ny - 1.001), z = clamp((p[2] - this.lo[2]) / h, 0, nz - 1.001);
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k, F = this.F, id = i + nx * (j + ny * k);
    const c = (a, b, c2) => F[id + a + nx * b + nx * ny * c2];
    return ((c(0, 0, 0) * (1 - fx) + c(1, 0, 0) * fx) * (1 - fy) + (c(0, 1, 0) * (1 - fx) + c(1, 1, 0) * fx) * fy) * (1 - fz) + ((c(0, 0, 1) * (1 - fx) + c(1, 0, 1) * fx) * (1 - fy) + (c(0, 1, 1) * (1 - fx) + c(1, 1, 1) * fx) * fy) * fz;
  }
  grad(p) { const e = this.h * 0.75, v = this.v.bind(this); return unit([v([p[0] + e, p[1], p[2]]) - v([p[0] - e, p[1], p[2]]), v([p[0], p[1] + e, p[2]]) - v([p[0], p[1] - e, p[2]]), v([p[0], p[1], p[2] + e]) - v([p[0], p[1], p[2] - e])]); }
  /* porta p sul livello `lev` muovendosi lungo il gradiente (o lungo `dir` se indicata) */
  proietta(p, lev, dir = null, it = 14) {
    let q = p.slice();
    for (let s = 0; s < it; s++) { const f = this.v(q) - lev; if (Math.abs(f) < 1e-4) break; const g = this.grad(q), d = dir ? (dot(g, dir) > 0.15 ? dir : g) : g; const den = dir ? dot(g, d) : 1;
      q = sub(q, mul(d, clamp(f / (Math.abs(den) > 0.1 ? den : 1), -0.12, 0.12))); }
    return q;
  }
}

/* Interno/esterno per parità di raggi lungo +x su griglia (lo, passo h, n celle per asse): Uint8Array con 1 = dentro una mesh chiusa */
export function dentroPerParita(meshes, lo, n, h) {
  const [nx, ny, nz] = n, xs = new Map();
  for (const g of meshes) for (let t = 0; t < g.idx.length; t += 3) {
    const A = [0, 1, 2].map(k => [g.pos[3 * g.idx[t + k]], g.pos[3 * g.idx[t + k] + 1], g.pos[3 * g.idx[t + k] + 2]]);
    const j0 = Math.max(0, Math.ceil((Math.min(A[0][1], A[1][1], A[2][1]) - lo[1]) / h)), j1 = Math.min(ny - 1, Math.floor((Math.max(A[0][1], A[1][1], A[2][1]) - lo[1]) / h));
    const k0 = Math.max(0, Math.ceil((Math.min(A[0][2], A[1][2], A[2][2]) - lo[2]) / h)), k1 = Math.min(nz - 1, Math.floor((Math.max(A[0][2], A[1][2], A[2][2]) - lo[2]) / h));
    const d = (A[1][1] - A[0][1]) * (A[2][2] - A[0][2]) - (A[2][1] - A[0][1]) * (A[1][2] - A[0][2]); if (Math.abs(d) < 1e-12) continue;
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const y = lo[1] + j * h + 1e-7, z = lo[2] + k * h + 1.3e-7, b1 = ((y - A[0][1]) * (A[2][2] - A[0][2]) - (A[2][1] - A[0][1]) * (z - A[0][2])) / d, b2 = ((A[1][1] - A[0][1]) * (z - A[0][2]) - (y - A[0][1]) * (A[1][2] - A[0][2])) / d;
      if (b1 < 0 || b2 < 0 || b1 + b2 > 1) continue; const x = A[0][0] + b1 * (A[1][0] - A[0][0]) + b2 * (A[2][0] - A[0][0]), key = j + ny * k; let l = xs.get(key); if (!l) xs.set(key, l = []); l.push(x); } }
  const I = new Uint8Array(nx * ny * nz);
  for (const [key, l] of xs) { l.sort((a, b) => a - b); const j = key % ny, k = (key - j) / ny; for (let m = 0; m + 1 < l.length; m += 2) for (let i = Math.max(0, Math.ceil((l[m] - lo[0]) / h)); i <= Math.min(nx - 1, Math.floor((l[m + 1] - lo[0]) / h)); i++) I[i + nx * (j + ny * k)] = 1; }
  return I;
}
/* da p, avanza lungo dir (a passi di 0.01, fino a maxd) fino a F <= lev e raffina per bisezione; null se non incontra la superficie */
Campo.prototype.marcia = function (p, dir, lev, maxd = 3) {
  let a = p, fa = this.v(a); if (fa <= lev) return a;
  for (let s = 0.01; s <= maxd; s += 0.01) { const b = add(p, mul(dir, s)); if (this.v(b) <= lev) { let lo = add(p, mul(dir, s - 0.01)), hi = b; for (let k = 0; k < 14; k++) { const m = lerp(lo, hi, 0.5); if (this.v(m) <= lev) hi = m; else lo = m; } return lerp(lo, hi, 0.5); } }
  return null;
};

/* ============ Curve ============ */
export function catmull(P, n) { // curva Catmull-Rom centripeta semplificata, n campioni uniformi in parametro
  const m = P.length - 1, out = [];
  for (let s = 0; s < n; s++) { const u = s / (n - 1) * m, i = Math.min(m - 1, Math.floor(u)), t = u - i; const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(m, i + 2)];
    out.push([0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t))); }
  return out;
}
export const interp = (tab, u) => { // tabella [[u, valore], …] interpolata liscia
  if (u <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (u <= tab[i][0]) { const t = (u - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]); return tab[i - 1][1] + (tab[i][1] - tab[i - 1][1]) * (t * t * (3 - 2 * t)); } return tab[tab.length - 1][1]; };

/* ============ Lamine ============ */
/* Riduce lo spessore T[i][j] dove la faccia esterna B+N·t entra in un ostacolo chiuso (solidi: Indice con dentro()) o scende sotto
   `margine` da esso; poi leviga (mai oltre il valore ammesso). Restituisce quanti vertici sono stati assottigliati. */
export function libera(B, N, T, solidi, fogli = [], margine = 0.006, passi = 8) {
  let n = 0; const ni = B.length, nj = B[0].length, ok = new Float32Array(ni * nj);
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    let t = T[i][j], amm = t;
    for (let k = 0; k <= passi; k++) { const tt = t * (1 - k / passi), q = add(B[i][j], mul(N[i][j], tt)); let bad = false;
      for (const S of solidi) { const r = S.vicino(q, 0.1); if (r && (r.d < margine || S.dentro(q))) { bad = true; break; } }
      if (!bad) for (const S of fogli) { const r = S.vicino(q, 0.1); if (r && r.d < margine) { bad = true; break; } } // lamine aperte (pulegge): solo distanza
      if (!bad) { amm = tt; break; } if (k === passi) amm = 0; }
    ok[i * nj + j] = amm; if (amm < t - 1e-6) n++; }
  // leviga il valore ammesso (media 4 vicini) e poi lo riporta sotto il limite: niente fossette, mai compenetrazione
  const lim = ok.slice(); for (let it = 0; it < 6; it++) { const o = ok.slice(); for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) { const a = i > 0 ? ok[(i - 1) * nj + j] : ok[i * nj + j], b = i < ni - 1 ? ok[(i + 1) * nj + j] : ok[i * nj + j], c = j > 0 ? ok[i * nj + j - 1] : ok[i * nj + j], d = j < nj - 1 ? ok[i * nj + j + 1] : ok[i * nj + j]; o[i * nj + j] = 0.5 * ok[i * nj + j] + 0.125 * (a + b + c + d); } ok.set(o); }
  for (let k = 0; k < ok.length; k++) ok[k] = Math.min(ok[k], lim[k]);
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) T[i][j] = Math.min(T[i][j], ok[i * nj + j]);
  return n;
}
/* Costruisce una mesh chiusa da una griglia di punti di base B[i][j] (i lungo la lunghezza, j attraverso), normali N[i][j]
   (verso l'esterno dell'osso), spessore T[i][j] (0 sul contorno) e direzione fibre D[i][j]. Faccia esterna a +T, faccia interna a
   -sotto (poggia sull'osso); il contorno si chiude da solo perché T→0 sul bordo. Restituisce { pos, idx, dir }. */
export function lamina(B, N, T, D, sotto = 0.012) {
  const ni = B.length, nj = B[0].length, pos = [], dir = [], idx = [], vid = (f, i, j) => (f * ni + i) * nj + j;
  for (const f of [0, 1]) for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const o = f === 0 ? T[i][j] : -sotto * Math.min(1, T[i][j] / 0.02 + 0.25); // esterna: +spessore; interna: appena sotto
    pos.push(...add(B[i][j], mul(N[i][j], o))); const d = D[i][j]; dir.push(Math.round(d[0] * 127), Math.round(d[1] * 127), Math.round(d[2] * 127)); }
  for (let i = 0; i < ni - 1; i++) for (let j = 0; j < nj - 1; j++) {
    const a = vid(0, i, j), b = vid(0, i + 1, j), c = vid(0, i + 1, j + 1), d = vid(0, i, j + 1); idx.push(a, b, c, a, c, d); // esterna
    const e = vid(1, i, j), f = vid(1, i + 1, j), g = vid(1, i + 1, j + 1), h = vid(1, i, j + 1); idx.push(e, g, f, e, h, g); } // interna (rovesciata)
  // contorno: i quattro lati collegano esterna e interna
  const lato = (p0, p1) => { idx.push(p0[0], p1[0], p1[1], p0[0], p1[1], p0[1]); };
  for (let j = 0; j < nj - 1; j++) { lato([vid(0, 0, j + 1), vid(1, 0, j + 1)], [vid(0, 0, j), vid(1, 0, j)]); lato([vid(0, ni - 1, j), vid(1, ni - 1, j)], [vid(0, ni - 1, j + 1), vid(1, ni - 1, j + 1)]); }
  for (let i = 0; i < ni - 1; i++) { lato([vid(0, i, 0), vid(1, i, 0)], [vid(0, i + 1, 0), vid(1, i + 1, 0)]); lato([vid(0, i + 1, nj - 1), vid(1, i + 1, nj - 1)], [vid(0, i, nj - 1), vid(1, i, nj - 1)]); }
  const g = { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), dir: Int8Array.from(dir), tag: null };
  // la faccia esterna (per ogni quad i primi 2 triangoli; i successivi 2 sono della faccia interna) deve avere la normale concorde con N
  let sc = 0, nT = 2 * (ni - 1) * (nj - 1); for (let t = 0; t < nT; t++) { if (t % 4 >= 2) continue; const a = [0, 1, 2].map(k => [g.pos[3 * g.idx[3 * t + k]], g.pos[3 * g.idx[3 * t + k] + 1], g.pos[3 * g.idx[3 * t + k] + 2]]), fn = cross(sub(a[1], a[0]), sub(a[2], a[0])), i = Math.floor(g.idx[3 * t] / nj) % ni, j = g.idx[3 * t] % nj; sc += dot(fn, N[i][j]); }
  if (sc < 0) for (let t = 0; t < g.idx.length; t += 3) { const k = g.idx[t + 1]; g.idx[t + 1] = g.idx[t + 2]; g.idx[t + 2] = k; }
  return g;
}
/* volume con segno positivo = triangoli antiorari visti da fuori; altrimenti rovescia l'avvolgimento */
export function orienta(g) {
  let v = 0; for (let t = 0; t < g.idx.length; t += 3) { const a = [0, 1, 2].map(k => [g.pos[3 * g.idx[t + k]], g.pos[3 * g.idx[t + k] + 1], g.pos[3 * g.idx[t + k] + 2]]); v += dot(a[0], cross(a[1], a[2])) / 6; }
  if (v < 0) for (let t = 0; t < g.idx.length; t += 3) { const k = g.idx[t + 1]; g.idx[t + 1] = g.idx[t + 2]; g.idx[t + 2] = k; }
  return g;
}
export function unisci(...gs) { // concatena mesh
  const pos = [], idx = [], dir = []; let off = 0;
  for (const g of gs) { pos.push(...g.pos); dir.push(...(g.dir || new Int8Array(g.pos.length))); for (const k of g.idx) idx.push(k + off); off += g.pos.length / 3; }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), dir: Int8Array.from(dir), tag: null };
}
