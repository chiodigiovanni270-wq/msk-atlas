/* Superficie "tesa" del dito (modelli/polso-dito-3d.html, sezione dito) per le strutture che stanno sopra le ossa: apparato estensore.

   Le ossa (III metacarpo, falangi) e le cartilagini articolari sono riassunte, per sezioni trasversali lungo y (passo `dy`), da un contorno
   a stella attorno all'asse del dito: raggio r(y, φ). Il contorno è poi "chiuso" lungo y (dilatazione ed erosione: scavalca rime articolari e
   colli delle ossa come un tessuto teso) e levigato, ma resta sempre all'esterno dell'osso.
   Coordinate della superficie: (y, s) con y = asse del dito (distale verso −y) e s = ascissa curvilinea lungo il contorno della sezione,
   zero sulla linea mediana dorsale, positiva verso il lato ulnare (+x), negativa verso il radiale (−x); ±metà perimetro = linea mediana volare.
   Sistema di riferimento del modello: x = radio-ulnare (radiale verso −x), z = dorso (−) / volare (+).
   Funzioni: Q(y,s) punto sulla superficie, Nr(y,s) normale esterna, da(punto) → (y,s,h) per riportare un punto qualsiasi sulla superficie. */
import { sub, add, mul, cross, unit, len, clamp } from './lib-dito.mjs';

const NF = 120; // campioni angolari (3°)
const gauss = (A, n, sg, circ = false) => { // media gaussiana 1D
  const r = Math.ceil(sg * 3), w = []; for (let m = -r; m <= r; m++) w.push(Math.exp(-m * m / (2 * sg * sg)));
  return A.map((_, i) => { let sa = 0, t = 0; for (let m = -r; m <= r; m++) { let k = i + m; if (circ) k = ((k % n) + n) % n; else k = clamp(k, 0, n - 1); sa += w[m + r] * A[k]; t += w[m + r]; } return sa / t; });
};

export class Superficie {
  /* meshes: array di { pos, idx }; opzioni: y0, y1, dy, chiudi (finestra della chiusura in y), sgY */
  constructor(meshes, { y0 = -5.7, y1 = 6.45, dy = 0.05, chiudi = 0.3, sgY = 0.08, sgC = 0.25 } = {}) {
    this.y0 = y0; this.dy = dy; const n = this.n = Math.round((y1 - y0) / dy) + 1;
    // 1) campionamento fitto delle superfici
    const pts = [];
    for (const g of meshes) for (let t = 0; t < g.idx.length; t += 3) {
      const A = [0, 1, 2].map(k => [g.pos[3 * g.idx[t + k]], g.pos[3 * g.idx[t + k] + 1], g.pos[3 * g.idx[t + k] + 2]]);
      const em = Math.max(len(sub(A[1], A[0])), len(sub(A[2], A[0])), len(sub(A[2], A[1]))), m = Math.max(1, Math.ceil(em / 0.025));
      for (let a = 0; a <= m; a++) for (let b = 0; a + b <= m; b++) { const u = a / m, v = b / m, w = 1 - u - v; pts.push([A[0][0] * w + A[1][0] * u + A[2][0] * v, A[0][1] * w + A[1][1] * u + A[2][1] * v, A[0][2] * w + A[1][2] * u + A[2][2] * v]); }
    }
    const sl = Array.from({ length: n }, () => []);
    for (const p of pts) { const i = Math.round((p[1] - y0) / dy); if (i >= 0 && i < n) sl[i].push(p); }
    // 2) centro di ogni sezione (centro del riquadro), levigato lungo y
    let cx = [], cz = [];
    for (let i = 0; i < n; i++) { if (!sl[i].length) { cx.push(NaN); cz.push(NaN); continue; } let a = [9, -9], b = [9, -9]; for (const p of sl[i]) { a = [Math.min(a[0], p[0]), Math.max(a[1], p[0])]; b = [Math.min(b[0], p[2]), Math.max(b[1], p[2])]; } cx.push((a[0] + a[1]) / 2); cz.push((b[0] + b[1]) / 2); }
    const riempi = A => { for (let i = 0; i < A.length; i++) if (Number.isNaN(A[i])) { let a = i, b = i; while (a >= 0 && Number.isNaN(A[a])) a--; while (b < A.length && Number.isNaN(A[b])) b++; A[i] = a < 0 ? A[b] : b >= A.length ? A[a] : A[a] + (A[b] - A[a]) * (i - a) / (b - a); } return A; };
    this.cx = gauss(riempi(cx), n, sgC / dy); this.cz = gauss(riempi(cz), n, sgC / dy);
    // 3) raggio per angolo (φ_k = −π + k·2π/NF; k = NF/2 è il dorso, φ = 0)
    const R = Array.from({ length: n }, () => new Float64Array(NF).fill(NaN));
    for (let i = 0; i < n; i++) for (const p of sl[i]) {
      const dx = p[0] - this.cx[i], dz = p[2] - this.cz[i], rho = Math.hypot(dx, dz); if (rho < 1e-6) continue;
      const ph = Math.atan2(dx, -dz), kf = (ph + Math.PI) / (2 * Math.PI) * NF;
      for (const k of [Math.floor(kf), Math.ceil(kf)]) { const kk = ((k % NF) + NF) % NF; if (Number.isNaN(R[i][kk]) || rho > R[i][kk]) R[i][kk] = rho; } }
    for (let i = 0; i < n; i++) { const A = R[i]; if (A.every(Number.isNaN)) continue; // buchi angolari: interpolazione circolare
      for (let k = 0; k < NF; k++) if (Number.isNaN(A[k])) { let a = 1, b = 1; while (Number.isNaN(A[((k - a) % NF + NF) % NF])) a++; while (Number.isNaN(A[(k + b) % NF])) b++; const va = A[((k - a) % NF + NF) % NF], vb = A[(k + b) % NF]; A[k] = va + (vb - va) * a / (a + b); } }
    // slice vuote: da vicine
    for (let k = 0; k < NF; k++) { const col = riempi(Array.from({ length: n }, (_, i) => R[i][k])); for (let i = 0; i < n; i++) R[i][k] = col[i]; }
    const raw = R.map(r => Float64Array.from(r));
    // 4) chiusura lungo y (scavalca rime e colli), poi levigatura senza mai scendere sotto l'osso
    const nw = Math.round(chiudi / dy);
    for (let k = 0; k < NF; k++) {
      const col = Array.from({ length: n }, (_, i) => raw[i][k]);
      const dil = col.map((_, i) => { let m = -9; for (let j = Math.max(0, i - nw); j <= Math.min(n - 1, i + nw); j++) m = Math.max(m, col[j]); return m; });
      const clo = dil.map((_, i) => { let m = 9; for (let j = Math.max(0, i - nw); j <= Math.min(n - 1, i + nw); j++) m = Math.min(m, dil[j]); return Math.max(m, col[i]); });
      for (let i = 0; i < n; i++) R[i][k] = clo[i]; }
    const clo = R.map(r => Float64Array.from(r));
    for (let it = 0; it < 3; it++) {
      for (let k = 0; k < NF; k++) { const col = gauss(Array.from({ length: n }, (_, i) => R[i][k]), n, sgY / dy * 1.5); for (let i = 0; i < n; i++) R[i][k] = col[i]; }
      for (let i = 0; i < n; i++) { const A = gauss(Array.from(R[i]), NF, 1.5, true); for (let k = 0; k < NF; k++) R[i][k] = Math.max(A[k], clo[i][k] * 0.995); } }
    for (let i = 0; i < n; i++) for (let k = 0; k < NF; k++) R[i][k] = Math.max(R[i][k], raw[i][k]);
    this.R = R;
    // 5) ascissa curvilinea per sezione (zero al dorso)
    this.S = R.map((r, i) => { const s = new Float64Array(NF), xy = k => { const ph = -Math.PI + k * 2 * Math.PI / NF; return [this.cx[i] + r[k] * Math.sin(ph), this.cz[i] - r[k] * Math.cos(ph)]; };
      const h = NF / 2; s[h] = 0; for (let k = h + 1; k < NF; k++) { const a = xy(k - 1), b = xy(k); s[k] = s[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
      for (let k = h - 1; k >= 0; k--) { const a = xy(k + 1), b = xy(k); s[k] = s[k + 1] - Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; });
  }
  semiPerim(i) { return Math.min(-this.S[i][0], this.S[i][NF - 1]); }
  _sl(y) { const f = clamp((y - this.y0) / this.dy, 0, this.n - 1.001), i = Math.floor(f); return [i, f - i]; }
  _phi(i, s) { const S = this.S[i]; let lo = 0, hi = NF - 1; if (s <= S[0]) return -Math.PI + (s - S[0]) / 0.5 * 0; if (s >= S[hi]) return -Math.PI + hi * 2 * Math.PI / NF; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; } const t = (s - S[lo]) / (S[hi] - S[lo] || 1); return -Math.PI + (lo + t) * 2 * Math.PI / NF; }
  _r(i, ph) { const f = (ph + Math.PI) / (2 * Math.PI) * NF, k = Math.floor(f), t = f - k, A = this.R[i]; return A[((k % NF) + NF) % NF] * (1 - t) + A[(((k + 1) % NF) + NF) % NF] * t; }
  /* punto sulla superficie */
  Q(y, s) {
    const [i, t] = this._sl(y), out = [0, 0, 0];
    for (const [ii, w] of [[i, 1 - t], [i + 1, t]]) { const ph = this._phi(ii, s), r = this._r(ii, ph); out[0] += w * (this.cx[ii] + r * Math.sin(ph)); out[1] += w * (this.y0 + ii * this.dy); out[2] += w * (this.cz[ii] - r * Math.cos(ph)); }
    out[1] = y; return out;
  }
  Nr(y, s, e = 0.04) {
    const Ty = sub(this.Q(y + e, s), this.Q(y - e, s)), Ts = sub(this.Q(y, s + e), this.Q(y, s - e)); let n = unit(cross(Ty, Ts));
    const [i] = this._sl(y), q = this.Q(y, s), rad = unit([q[0] - this.cx[i], 0, q[2] - this.cz[i]]); if (n[0] * rad[0] + n[2] * rad[2] < 0) n = mul(n, -1); return n;
  }
  /* punto sulla superficie sollevato di h lungo la normale */
  P(y, s, h) { return add(this.Q(y, s), mul(this.Nr(y, s), h)); }
  /* riporta un punto qualsiasi: { y, s, h } con h = distanza radiale dalla superficie (negativa dentro l'osso) */
  da(p) {
    const [i, t] = this._sl(p[1]); let s = 0, h = 0;
    for (const [ii, w] of [[i, 1 - t], [i + 1, t]]) { const dx = p[0] - this.cx[ii], dz = p[2] - this.cz[ii], ph = Math.atan2(dx, -dz), f = (ph + Math.PI) / (2 * Math.PI) * NF, k = clamp(Math.floor(f), 0, NF - 2), u = f - k;
      s += w * (this.S[ii][k] * (1 - u) + this.S[ii][k + 1] * u); h += w * (Math.hypot(dx, dz) - this._r(ii, ph)); }
    return { y: p[1], s, h };
  }
}
