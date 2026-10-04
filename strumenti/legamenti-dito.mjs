/* Legamenti e placche volari del dito (modelli/polso-dito-3d.html, sezione dito): vp_pip/vp_mcp/vp_dip e cl_*_rad/uln delle tre articolazioni (IFP, MCF, IFD).

   Uso (dalla cartella del progetto):
     node strumenti/legamenti-dito.mjs              → riscrive le mesh di IFP, MCF e IFD nel file del modello
     node strumenti/legamenti-dito.mjs mcf          → solo una articolazione (ifp, mcf, ifd); in coda `placca` o `collaterali` per una sola parte
     MODELLO=/tmp/copia.html node strumenti/legamenti-dito.mjs   → lavora su una copia

   Le strutture sono costruite sulle ossa e sulle cartilagini reali (campo di distanza sfocato: la superficie "tesa" scavalca
   solchi e rime) e restano fuori da tendini, guaina e pulegge. Riparte sempre dalle ossa incorporate, quindi si può rilanciare.
   Sistema di riferimento: y = asse del dito (distale verso −y), x = radio-ulnare (radiale verso −x), z = dorso (−) / volare (+).
   Parametri e punti guida nelle tabelle in testa. */
import { Modello, Indice, Campo, dentroPerParita, add, sub, mul, dot, cross, len, unit, lerp, clamp, sstep, catmull, interp, lamina, libera, unisci, log } from './lib-dito.mjs';

const M = new Modello();

/* ============ Parametri per articolazione ============ */
const ART = {
  ifp: {
    pref: 'pip', ossa: ['d_p1', 'd_p2'], fog: ['A3', 'C1', 'C2'], sol: ['d_fds', 'd_fdp'],
    box: [[-1.0, -2.85, -1.6], [1.2, -0.85, 0.7]], win: [-0.75, 0.95, -2.55, -1.05],
    gap: 0.004, xc: 0.08,
    // collaterali: punti guida (y, z) sulla faccia laterale; larghezza e spessore lungo il decorso
    proprio: { guida: [[-1.50, -0.96], [-1.64, -0.90], [-1.86, -0.80], [-2.06, -0.70], [-2.20, -0.64]],
      w: [[0, 0.17], [0.4, 0.19], [1, 0.30]], t: [[0, 0.045], [0.5, 0.055], [1, 0.045]] },
    accessorio: { guida: [[-1.62, -0.60], [-1.78, -0.54], [-1.95, -0.47], [-2.10, -0.40]],
      w: [[0, 0.17], [0.5, 0.22], [1, 0.27]], t: [[0, 0.030], [0.5, 0.040], [1, 0.045]] },
    placca: { yd: -2.17, ypc: -1.58, yph: -1.20, zcut: -0.60, ponte: 0.16, vuoto: 0.01, hw0: 0.54, hw1: 0.60, tdist: 0.060, tprox: 0.020, margine: 0.020 },
  },
  mcf: {
    pref: 'mcp', ossa: ['d_mc3', 'd_p1'], fog: ['A1', 'A2', 'sagittali'], sol: ['d_fds', 'd_fdp', 'd_lumb', 'd_iod'],
    box: [[-1.1, 1.55, -1.7], [1.3, 3.6, 0.9]], win: [-0.85, 1.0, 1.7, 3.5],
    gap: 0.004, xc: 0.10,
    // origine nella fossetta dorso-laterale della testa metacarpale, inserzione volare sulla base di P1; l'accessorio va alla placca
    proprio: { guida: [[2.92, -0.80], [2.74, -0.76], [2.52, -0.66], [2.30, -0.56], [2.10, -0.48]],
      w: [[0, 0.20], [0.4, 0.22], [1, 0.32]], t: [[0, 0.050], [0.5, 0.060], [1, 0.050]] },
    accessorio: { guida: [[2.80, -0.45], [2.62, -0.36], [2.44, -0.28], [2.26, -0.22]],
      w: [[0, 0.20], [0.5, 0.26], [1, 0.30]], t: [[0, 0.030], [0.5, 0.040], [1, 0.045]] },
    placca: { yd: 2.10, ypc: 2.62, yph: 2.95, zcut: -0.36, ponte: 0.26, vuoto: 0.01, hw0: 0.55, hw1: 0.60, tdist: 0.070, tprox: 0.022, margine: 0.025 },
    dtml: { y: 2.72, semi: 0.12, fuori: 0.24, t: 0.040 },
  },
  ifd: {
    pref: 'dip', ossa: ['d_p2', 'd_p3'], fog: ['A5', 'C3'], sol: ['d_fdp'],
    box: [[-0.9, -5.7, -1.4], [1.0, -3.7, 0.6]], win: [-0.7, 0.8, -5.45, -3.95],
    gap: 0.004, xc: 0.09,
    proprio: { guida: [[-4.40, -0.80], [-4.52, -0.72], [-4.66, -0.60], [-4.82, -0.48], [-4.95, -0.40]],
      w: [[0, 0.14], [0.4, 0.15], [1, 0.22]], t: [[0, 0.038], [0.5, 0.045], [1, 0.038]] },
    accessorio: { guida: [[-4.50, -0.50], [-4.62, -0.42], [-4.76, -0.35], [-4.88, -0.30]],
      w: [[0, 0.13], [0.5, 0.16], [1, 0.20]], t: [[0, 0.025], [0.5, 0.032], [1, 0.036]] },
    placca: { yd: -4.93, ypc: -4.35, yph: -4.08, zcut: -0.42, ponte: 0.14, vuoto: 0.01, hw0: 0.34, hw1: 0.38, tdist: 0.045, tprox: 0.016, margine: 0.016 },
  },
};

function costruisci(IFP) {
const LEV0 = 0;
/* ============ Campo e utilità ============ */
const ossa = IFP.ossa.map(n => M.get(n)), ind = new Indice(ossa, 0.1);
const H = 0.03, lo = IFP.box[0], hi = IFP.box[1], nn = [0, 1, 2].map(k => Math.ceil((hi[k] - lo[k]) / H) + 1), dentro = dentroPerParita(ossa, lo, nn, H);
const F = new Campo((p, i, j, k) => { const d = ind.vicino(p, 0.3), v = d ? d.d : 0.3; return dentro[i + nn[0] * (j + nn[1] * k)] ? -v : v; }, lo, hi, H, 3, 0.3);
const LEV = IFP.gap;
const FOG = IFP.fog.map(n => new Indice([M.get(n)], 0.1)); // pulegge: lamine aperte
const SOL = IFP.sol.map(n => new Indice([M.get(n)], 0.1)); // ostacoli chiusi: i tendini flessori (le strutture procedurali si controllano con verifica-dito)
// il campo sfocato ritira le superfici convesse (la testa metacarpale, i condili): si riporta ogni punto a distanza esatta `gap` dall'osso
const affina = p => { let q = p; for (let k = 0; k < 6; k++) { const r = ind.vicino(q, 0.4); if (!r) break; const sg = ind.sd(q, 0.4) < 0 ? -1 : 1, d = sg * r.d, nrm = unit(sub(q, r.q)); const dir = sg < 0 ? mul(nrm, -1) : nrm; q = add(q, mul(r.d > 1e-5 ? dir : r.n, LEV - d)); if (Math.abs(LEV - d) < 5e-4) break; } return q; };
const aSupLaterale = (y, z, sgn) => { const p = F.marcia([sgn < 0 ? lo[0] : hi[0], y, z], [-sgn, 0, 0], LEV, 2.6); return p ? p[0] : null; };
const fine = u => u < 0.5 ? Math.pow(Math.max(0, 1 - Math.pow(1 - 2 * u, 4)), 0.33) : Math.pow(Math.max(0, 1 - Math.pow(2 * u - 1, 10)), 0.2); // origine arrotondata, inserzione ampia // estremi arrotondati
const sigma = s => Math.sqrt(Math.max(0, Math.sin(Math.PI * clamp(s, 0, 1)))); // profilo a lente, bordo verticale e arrotondato

/* nastro appoggiato alla superficie laterale: guida (y,z) → curva → nastro con spessore */
function nastro({ guida, w, t }, sgn, NU = 41, NV = 15, fib = 0.06) {
  const C = catmull(guida.map(([y, z]) => [aSupLaterale(y, z, sgn), y, z]), NU).map(p => F.proietta(p, LEV));
  const B = [], N = [], T = [], D = [];
  for (let i = 0; i < NU; i++) {
    const u = i / (NU - 1), c = C[i], tg = unit(sub(C[Math.min(NU - 1, i + 1)], C[Math.max(0, i - 1)])), n = F.grad(c), ac = unit(cross(tg, n)), wi = interp(w, u), ti = interp(t, u);
    const rb = [], rn = [], rt = [], rd = [];
    for (let j = 0; j < NV; j++) {
      const s = j / (NV - 1), v = (s - 0.5) * 2, half = v * wi * fine(u) / 2; let p0 = add(c, mul(ac, half)), p = F.proietta(p0, LEV);
      for (let k = 0; k < 3; k++) { const dd = sub(p, c), l = len(dd) || 1; p0 = add(c, mul(dd, Math.abs(half) / l)); p = F.proietta(p0, LEV); } // la larghezza resta quella voluta anche sulle curve dell'osso
      p = affina(p); const nn = F.grad(p);
      const fas = 1 + 0.10 * Math.sin(v * 7 + u * 3) * sigma(s) ** 2; // lieve rilievo dei fascicoli
      rb.push(p); rn.push(nn); rt.push(ti * fas * sigma(s) * Math.pow(Math.sin(Math.PI * clamp(0.04 + 0.92 * u, 0, 1)), 0.55)); rd.push(tg);
    }
    B.push(rb); N.push(rn); T.push(rt); D.push(rd);
  }
  libera(B, N, T, SOL, FOG);
  return lamina(B, N, T, D);
}

/* placca volare: lamina su un campo di altezza della faccia volare delle ossa (visto dal volare), reso continuo sopra la rima
   (filtro di massimo + sfocatura lungo l'asse del dito). Il contorno laterale segue l'impronta dell'osso (h ≥ zcut). */
function placca(NU = 41, NV = 45) {
  const P = IFP.placca, [X0, X1, Y0, Y1] = IFP.win, hs = 0.02, nx = Math.round((X1 - X0) / hs) + 1, ny = Math.round((Y1 - Y0) / hs) + 1;
  let h = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = F.marcia([X0 + i * hs, Y0 + j * hs, 0.9], [0, 0, -1], LEV, 2.2); h[i + nx * j] = q ? q[2] : -2; }
  // continuità lungo y: massimo in finestra poi media gaussiana; poi lieve sfocatura lungo x
  const R = Math.round(P.ponte / hs), mx = new Float32Array(h.length);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { let m = -9; for (let k = Math.max(0, j - R); k <= Math.min(ny - 1, j + R); k++) m = Math.max(m, h[i + nx * k]); mx[i + nx * j] = m; }
  const g = (a, n, sg) => { const w = [], r = Math.ceil(3 * sg); let t = 0; for (let k = -r; k <= r; k++) { const v = Math.exp(-k * k / (2 * sg * sg)); w.push(v); t += v; } return (get, set) => { for (let c = 0; c < n; c++) { const out = []; for (let k = 0; k < a; k++) { let sacc = 0; for (let m = -r; m <= r; m++) sacc += w[m + r] * get(c, clamp(k + m, 0, a - 1)); out.push(sacc / t); } for (let k = 0; k < a; k++) set(c, k, out[k]); } }; };
  const h2 = mx.slice(); g(ny, nx, P.ponte / hs / 2)((i, j) => h2[i + nx * j], (i, j, v) => { h2[i + nx * j] = v; });
  for (let j = 0; j < ny; j++) { const r0 = h2.slice(nx * j, nx * (j + 1)); for (let i = 0; i < nx; i++) { let m = -9; for (let k = Math.max(0, i - 8); k <= Math.min(nx - 1, i + 8); k++) m = Math.max(m, r0[k]); h2[i + nx * j] = 0.5 * m + 0.5 * r0[i]; } }
  for (let j = 0; j < ny; j++) { const row = h2.slice(nx * j, nx * (j + 1)), o = row.slice(); for (let i = 0; i < nx; i++) { let sacc = 0, t = 0; for (let m = -3; m <= 3; m++) { const w = Math.exp(-m * m / 4.5); sacc += w * row[clamp(i + m, 0, nx - 1)]; t += w; } o[i] = sacc / t; } for (let i = 0; i < nx; i++) h2[i + nx * j] = o[i]; }
  // soffitto: sotto i tendini la placca non sale oltre il loro margine inferiore (resta sempre sopra l'osso)
  let tagl = 0; const CAP = new Float32Array(h2.length).fill(9);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = i + nx * j, x = X0 + i * hs, y = Y0 + j * hs; if (h[k] < -1.9) continue;
    let z = h[k] + 0.004, tetto = 9;
    while (z < h[k] + 0.7) { let dmin = 9, dentro = false; for (const S of SOL) { const r = S.vicino([x, y, z], 0.2); if (r) { dmin = Math.min(dmin, r.d); if (S.dentro([x, y, z])) dentro = true; } }
      if (dentro || dmin < P.vuoto) { tetto = z; break; } z += dmin > 0.05 ? 0.04 : 0.008; }
    CAP[k] = tetto - P.vuoto; }
  if (P.soffitto) { let C = CAP; for (let it = 0; it < 4; it++) { const o = C.slice(); for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = i + nx * j; o[k] = Math.min(C[k] + 0.3, 0.2 * (C[k] + C[k - 1] + C[k + 1] + C[k - nx] + C[k + nx]) + 0.0); } C = o; }
    for (let k = 0; k < h2.length; k++) if (C[k] < h2[k]) { h2[k] = Math.max(h[k], C[k]); tagl++; } }
  log('placca: celle limitate dal soffitto dei tendini', tagl);
  for (let k = 0; k < h2.length; k++) h2[k] = Math.max(h2[k], h[k]); // mai sotto l'osso
  const H2 = (x, y) => { const fx = clamp((x - X0) / hs, 0, nx - 1.001), fy = clamp((y - Y0) / hs, 0, ny - 1.001), i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
    return (h2[i + nx * j] * (1 - a) + h2[i + 1 + nx * j] * a) * (1 - b) + (h2[i + nx * (j + 1)] * (1 - a) + h2[i + 1 + nx * (j + 1)] * a) * b; };
  const nor = (x, y) => unit([-(H2(x + 0.02, y) - H2(x - 0.02, y)) / 0.04, -(H2(x, y + 0.02) - H2(x, y - 0.02)) / 0.04, 1]);
  const Hr = (x, y) => { const fx = clamp((x - X0) / hs, 0, nx - 1.001), fy = clamp((y - Y0) / hs, 0, ny - 1.001), i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
    return (h[i + nx * j] * (1 - a) + h[i + 1 + nx * j] * a) * (1 - b) + (h[i + nx * (j + 1)] * (1 - a) + h[i + 1 + nx * (j + 1)] * a) * b; };
  // impronta volare dell'osso (h grezza ≥ zcut) per ogni y, poi lisciata lungo y: niente bordi frastagliati né lembi oltre l'osso
  const XL = [], XR = [];
  for (let j = 0; j < ny; j++) { const y = Y0 + j * hs; let xl = X0, xr = X1; while (xl < IFP.xc && Hr(xl, y) < P.zcut) xl += 0.01; while (xr > IFP.xc && Hr(xr, y) < P.zcut) xr -= 0.01; XL.push(xl); XR.push(xr); }
  const lisc = A => { let o = A; for (let it = 0; it < 3; it++) o = o.map((_, j) => { let sa = 0, t = 0; for (let m = -5; m <= 5; m++) { const w = Math.exp(-m * m / 18); sa += w * o[clamp(j + m, 0, ny - 1)]; t += w; } return sa / t; }); return o; };
  const XLs = lisc(XL), XRs = lisc(XR);
  const lim = y => { const f = clamp((y - Y0) / hs, 0, ny - 1.001), j = Math.floor(f), t = f - j; return [XLs[j] * (1 - t) + XLs[j + 1] * t, XRs[j] * (1 - t) + XRs[j + 1] * t]; };
  const ypv = v => P.ypc + (P.yph - P.ypc) * Math.pow(Math.abs(v), 3.2), ydv = v => P.yd + 0.07 * v * v;
  const B = [], N = [], T = [], D = [];
  for (let i = 0; i < NU; i++) {
    const u = i / (NU - 1), rb = [], rn = [], rt = [], rd = [];
    for (let j = 0; j < NV; j++) {
      const v = (j / (NV - 1) - 0.5) * 2; let y = ypv(v) + u * (ydv(v) - ypv(v)), x = IFP.xc;
      { const [xl, xr] = lim(y), hw = P.hw0 + (P.hw1 - P.hw0) * u; x = clamp(IFP.xc + v * hw, xl + 0.015, xr - 0.015); } // contorno nominale, mai oltre l'impronta dell'osso
      const z = H2(x, y) + LEV, n = nor(x, y), dist = u, marg = Math.exp(-Math.pow((Math.abs(v) - 0.84) / 0.13, 2));
      const tb = P.tprox + (P.tdist - P.tprox) * Math.pow(dist, 1.7) + P.margine * marg * (0.5 + 0.5 * (1 - dist));
      const fuori = 0.2 + 0.8 * Math.pow(sstep(0.0, 0.12, u) * (0.45 + 0.55 * sstep(0.0, 0.10, 1 - u)) * sstep(0.0, 0.14, 1 - Math.abs(v)), 0.8); // bordi: mai spessore nullo; distale: inserzione
      rb.push(affina([x, y, z])); rn.push(n); rt.push(tb * fuori); rd.push(unit([Math.sign(v) * 0.15 * Math.abs(v) ** 2, -1, 0]));
    }
    B.push(rb); N.push(rn); T.push(rt); D.push(rd);
  }
  { const T0 = T.map(r => r.slice()), nl = libera(B, N, T, SOL, FOG, 0.004); for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) T[i][j] = Math.max(T[i][j], 0.35 * T0[i][j]); log('placca: vertici assottigliati dai tendini', nl); } // spessore minimo: sotto i tendini la placca è sottile ma continua
  const pl = lamina(B, N, T, D, 0.02);
  if (!IFP.dtml) return pl;
  // legamento intermetacarpale trasverso profondo: due brevi lembi che continuano il margine laterale della placca verso i metacarpi vicini
  const Dm = IFP.dtml, lembi = [];
  for (const sg of [-1, 1]) { const jc = sg < 0 ? 0 : NV - 1; let best = B[0][jc]; for (let i = 0; i < NU; i++) if (Math.abs(B[i][jc][1] - Dm.y) < Math.abs(best[1] - Dm.y)) best = B[i][jc];
    const xe = best[0], ze = best[2], ye = best[1], NU2 = 9, NV2 = 9, b = [], n = [], t = [], d = [];
    for (let i = 0; i < NU2; i++) { const rb = [], rn = [], rt = [], rd = []; for (let j = 0; j < NV2; j++) { const q = i / (NU2 - 1), r = (j / (NV2 - 1) - 0.5) * 2, x = xe - sg * 0.02 + sg * Dm.fuori * q, y = ye + r * Dm.semi * (1 + 0.8 * q), z = ze - 0.03 * q;
        rb.push([x, y, z]); rn.push([0, 0, 1]); rt.push(Dm.t * (1 - 0.7 * q) * Math.sqrt(Math.max(0, 1 - r * r)) + 0.004); rd.push([sg, 0, 0]); } b.push(rb); n.push(rn); t.push(rt); d.push(rd); }
    lembi.push(lamina(b, n, t, d, 0.01)); }
  return unisci(pl, ...lembi);
}


  return { placca, nastro };
}

/* ============ Costruzione ============ */
const quali = process.argv.slice(2), tutte = Object.keys(ART), scelte = quali.filter(x => tutte.includes(x)), parti = quali.filter(x => !tutte.includes(x));
const fatti = [];
for (const k of scelte.length ? scelte : tutte) {
  const A = ART[k], { placca, nastro } = costruisci(A), n = 'vp_' + A.pref, cr = 'cl_' + A.pref + '_rad', cu = 'cl_' + A.pref + '_uln';
  log(k.toUpperCase());
  if (!parti.length || parti.includes('placca')) { M.set(n, placca()); fatti.push(n); }
  if (!parti.length || parti.includes('collaterali')) { M.set(cr, unisci(nastro(A.proprio, -1), nastro(A.accessorio, -1))); M.set(cu, unisci(nastro(A.proprio, 1), nastro(A.accessorio, 1))); fatti.push(cr, cu); }
}
log('mesh:', fatti.map(n => n + ' ' + M.get(n).pos.length / 3 + ' v').join(', '));
M.salva();
