/* Puleggia A1 del dito (modelli/polso-dito-3d.html, sezione dito): sostituisce la mesh originale, che con le ali laterali affondava nell'osso
   e nella placca volare della MCF (e la tagliava).

   Uso (dalla cartella del progetto):
     node strumenti/puleggia-a1-dito.mjs              → riscrive `A1` nel file del modello
     MODELLO=/tmp/copia.html node strumenti/puleggia-a1-dito.mjs   → lavora su una copia

   Anatomia (Doyle 1975; Doyle e Blythe 1975; Hirt et al. 2007): la A1 è un'arcata fibrosa sopra i tendini flessori (nella guaina), larga ~1 cm
   (y 2,09 … 2,99), che si fissa ai margini laterali della placca volare e al legamento intermetacarpale trasverso profondo, e non entra nell'osso.
   Costruzione: sezione a omega attorno ai tendini (parete verticale a ridosso di FDS, FDP e guaina, arco sopra) con la base che poggia
   sulla placca volare (sovrapposta di pochi centesimi: stesso colore, nessuna fessura). Coordinate come in lib-superficie-dito.mjs:
   τ = distanza lungo la sezione dalla linea mediana volare (+ ulnare). La quota dell'arco segue il bordo volare dei tendini e della
   guaina a ogni y. Parametri in testa. Riparte sempre dalle ossa e dai tendini incorporati, quindi si può rilanciare. */
import { Modello, add, sub, mul, cross, unit, dot, clamp, sstep, lamina, log } from './lib-dito.mjs';
import { Superficie } from './lib-superficie-dito.mjs';

const M = new Modello();
const SF = new Superficie(['d_mc3', 'd_p1', 'd_p2', 'd_p3', 'd_cart'].map(n => M.get(n)));

/* ============ Parametri ============ */
const A1 = { y0: 2.99, y1: 2.09,       // estensione lungo il dito (prossimale → distale)
  base: 0.56, hBase: 0.03,             // |τ| di appoggio sulla placca e quota (poco dentro la placca)
  gapT: 0.035, spessore: 0.06,        // distanza dall'arco ai tendini e spessore della fibra
  muro: 0.035 };                       // distanza della parete dai tendini

/* quota (sopra la superficie delle ossa) e semilarghezza dei tendini e della guaina, per sezione y */
const tau = (y, s) => (s > 0 ? SF.semiPerim(SF._sl(y)[0]) - s : -SF.semiPerim(SF._sl(y)[0]) - s);
function profiloTendini() {
  const bin = 0.1, ys = [], rows = new Map();
  for (const n of ['d_fds', 'd_fdp', 'guaina']) { const g = M.get(n);
    for (let i = 0; i < g.pos.length; i += 3) { const y = g.pos[i + 1]; if (y < A1.y1 - 0.3 || y > A1.y0 + 0.3) continue;
      const q = SF.da([g.pos[i], y, g.pos[i + 2]]), t = tau(y, q.s); if (Math.abs(t) > 0.6) continue;
      const k = Math.round(y / bin); let r = rows.get(k); if (!r) rows.set(k, r = { h: -9, w: 0 }); r.h = Math.max(r.h, q.h); r.w = Math.max(r.w, Math.abs(t)); } }
  const k0 = Math.min(...rows.keys()), k1 = Math.max(...rows.keys()), H = [], W = [];
  for (let k = k0; k <= k1; k++) { const r = rows.get(k) || rows.get(k - 1) || rows.get(k + 1); H.push(r.h); W.push(r.w); ys.push(k * bin); }
  const lisc = A => A.map((_, i) => { let sa = 0, t = 0; for (let m = -3; m <= 3; m++) { const w = Math.exp(-m * m / 4); sa += w * A[clamp(i + m, 0, A.length - 1)]; t += w; } return sa / t; });
  const Hs = lisc(lisc(H)), Ws = lisc(lisc(W)), at = (A, y) => { const f = clamp((y - ys[0]) / bin, 0, ys.length - 1.001), i = Math.floor(f); return A[i] * (1 - (f - i)) + A[i + 1] * (f - i); };
  return { h: y => at(Hs, y), w: y => at(Ws, y) };
}
const TEN = profiloTendini();

/* sezione a omega, metà ulnare (τ ≥ 0): punti (τ, h) dalla base sulla placca all'apice dell'arco */
function meta(y) {
  const top = TEN.h(y) + A1.gapT, w = Math.max(0.30, TEN.w(y) + A1.muro);
  return [[A1.base, A1.hBase], [w + 0.14, 0.07], [w + 0.04, 0.17], [w, 0.30], [w - 0.01, top - 0.17], [w - 0.06, top - 0.06], [w * 0.55, top - 0.012], [0.0, top]];
}
const N_J = 61;
function profilo(y) { // punti (τ, h) da −base a +base passando dall'apice: poligonale campionata a passo uniforme e levigata
  const m = meta(y), full = [...m.map(([t, h]) => [-t, h]), ...m.slice(0, -1).reverse()];
  const L = [0]; for (let i = 1; i < full.length; i++) L.push(L[i - 1] + Math.hypot(full[i][0] - full[i - 1][0], full[i][1] - full[i - 1][1]));
  let P = Array.from({ length: N_J }, (_, k) => { const d = L[L.length - 1] * k / (N_J - 1); let i = 1; while (i < L.length - 1 && L[i] < d) i++; const t = (d - L[i - 1]) / (L[i] - L[i - 1] || 1); return [full[i - 1][0] + (full[i][0] - full[i - 1][0]) * t, full[i - 1][1] + (full[i][1] - full[i - 1][1]) * t]; });
  for (let it = 0; it < 6; it++) P = P.map((p, k) => k === 0 || k === N_J - 1 ? p : [0.5 * p[0] + 0.25 * (P[k - 1][0] + P[k + 1][0]), 0.5 * p[1] + 0.25 * (P[k - 1][1] + P[k + 1][1])]);
  return P;
}

/* superficie A1 */
function costruisci() {
  const NU = 26, B = [], N = [], T = [], D = [];
  for (let i = 0; i < NU; i++) {
    const u = i / (NU - 1), y = A1.y0 + (A1.y1 - A1.y0) * u, P = profilo(y), sp = SF.semiPerim(SF._sl(y)[0]), c = [SF.cx[SF._sl(y)[0]], 0, SF.cz[SF._sl(y)[0]]];
    // punto 3D del profilo: superficie in τ + quota lungo la normale; sulla linea mediana volare (|τ| < 0,12, dove la superficie ha il salto ±semiperimetro)
    // si interpola tra i due lati, che lì sono piatti
    const pt1 = (t, h) => { const s = t > 0 ? sp - t : -sp - t; return { q: SF.Q(y, s), n: SF.Nr(y, s) }; }, EPS = 0.12;
    const pt = ([t, h]) => { let r; if (Math.abs(t) >= EPS) r = pt1(t, h); else { const a = pt1(-EPS, h), b = pt1(EPS, h), k = (t + EPS) / (2 * EPS); r = { q: add(mul(a.q, 1 - k), mul(b.q, k)), n: unit(add(mul(a.n, 1 - k), mul(b.n, k))) }; } return add(r.q, mul(r.n, h)); };
    const row = P.map(pt), rb = [], rn = [], rt = [], rd = [];
    for (let j = 0; j < N_J; j++) {
      const a = row[Math.max(0, j - 1)], b = row[Math.min(N_J - 1, j + 1)], tj = unit(sub(b, a));
      const ty = unit(sub(ptY(y + 0.04, P[j]), ptY(y - 0.04, P[j])));
      let n = unit(cross(tj, ty)); const rad = sub(row[j], [c[0], row[j][1], c[2]]); if (dot(n, rad) < 0) n = mul(n, -1);
      rb.push(row[j]); rn.push(n); rd.push(tj);
      // spessore: costante sull'arco, che si assottiglia verso la base (si fonde con la placca) e ai bordi prossimale e distale
      const v = j / (N_J - 1); rt.push(A1.spessore * Math.pow(Math.sin(Math.PI * clamp(v, 0, 1)), 0.22) * Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.45) * (0.35 + 0.65 * sstep(0.02, 0.18, Math.min(v, 1 - v))) + 0.002);
    }
    B.push(row); N.push(rn); T.push(rt); D.push(rd);
  }
  return lamina(B, N, T, D, 0.012);
}
function ptY(y, [t, h]) { const sp = SF.semiPerim(SF._sl(y)[0]), f = tt => SF.Q(y, tt > 0 ? sp - tt : -sp - tt), E = 0.12; if (Math.abs(t) >= E) return add(f(t), mul(SF.Nr(y, t > 0 ? sp - t : -sp - t), h)); const k = (t + E) / (2 * E); return add(add(mul(f(-E), 1 - k), mul(f(E), k)), [0, 0, 0]); }

const g = costruisci(); M.set('A1', g); log('A1', g.pos.length / 3, 'vertici', g.idx.length / 3, 'triangoli');
M.salva();
