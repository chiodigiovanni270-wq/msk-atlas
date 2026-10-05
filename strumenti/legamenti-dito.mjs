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
    placca: { yd: -2.17, cd: 0.03, ypc: -1.62, ypl: -1.55, checkrein: 0.14, zcut: -0.62, rientro: 0.04, ponte: 0.16, hw0: 0.52, hw1: 0.57, tdist: 0.070, tprox: 0.020, margine: 0.020 },
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
    placca: { yd: 2.10, cd: 0.03, ypc: 2.78, ypl: 2.72, zcut: -0.36, rientro: 0.04, ponte: 0.22, hw0: 0.54, hw1: 0.58, tdist: 0.080, tprox: 0.022, margine: 0.025 },
  },
  ifd: {
    pref: 'dip', ossa: ['d_p2', 'd_p3'], fog: ['A5', 'C3'], sol: ['d_fdp'],
    box: [[-0.9, -5.7, -1.4], [1.0, -3.7, 0.6]], win: [-0.7, 0.8, -5.45, -3.95],
    gap: 0.004, xc: 0.09,
    proprio: { guida: [[-4.40, -0.80], [-4.52, -0.72], [-4.66, -0.60], [-4.82, -0.48], [-4.95, -0.40]],
      w: [[0, 0.14], [0.4, 0.15], [1, 0.22]], t: [[0, 0.038], [0.5, 0.045], [1, 0.038]] },
    accessorio: { guida: [[-4.50, -0.50], [-4.62, -0.42], [-4.76, -0.35], [-4.88, -0.30]],
      w: [[0, 0.13], [0.5, 0.16], [1, 0.20]], t: [[0, 0.025], [0.5, 0.032], [1, 0.036]] },
    placca: { yd: -4.92, cd: 0.02, ypc: -4.38, ypl: -4.34, zcut: -0.42, rientro: 0.03, ponte: 0.14, hw0: 0.33, hw1: 0.36, tdist: 0.050, tprox: 0.016, margine: 0.016 },
  },
};

function costruisci(IFP) {
const LEV0 = 0;
/* ============ Campo e utilità ============ */
// superficie d'appoggio = ossa ∪ cartilagine articolare: placche e collaterali stanno sopra la cartilagine, mai dentro
const ossa = IFP.ossa.map(n => M.get(n)), ind = new Indice(ossa, 0.1), icart = new Indice([M.get('d_cart')], 0.1);
const H = 0.03, lo = IFP.box[0], hi = IFP.box[1], nn = [0, 1, 2].map(k => Math.ceil((hi[k] - lo[k]) / H) + 1);
const dentroB = dentroPerParita(ossa, lo, nn, H), dentroC = dentroPerParita([M.get('d_cart')], lo, nn, H);
const F = new Campo((p, i, j, k) => { const id = i + nn[0] * (j + nn[1] * k), rb = ind.vicino(p, 0.3), rc = icart.vicino(p, 0.3), db = rb ? rb.d : 0.3, dc = rc ? rc.d : 0.3, ib = dentroB[id], ic = dentroC[id];
  return ib && ic ? -Math.max(db, dc) : ib ? -db : ic ? -dc : Math.min(db, dc); }, lo, hi, H, 3, 0.3);
const LEV = IFP.gap;
const FOG = IFP.fog.map(n => new Indice([M.get(n)], 0.1)); // pulegge: lamine aperte
const SOL = IFP.sol.map(n => new Indice([M.get(n)], 0.1)); // ostacoli chiusi: i tendini flessori (le strutture procedurali si controllano con verifica-dito)
// il campo sfocato ritira le superfici convesse (la testa metacarpale, i condili): si riporta ogni punto a distanza esatta `gap`
// dall'unione osso ∪ cartilagine. Con soloFuori il punto viene solo spinto fuori (non si infila nelle rime: la placca le scavalca)
const vicinoU = q => { const out = []; for (const S of [ind, icart]) { const r = S.vicino(q, 0.4); if (r) out.push({ r, dentro: S.dentro(q) }); } return out; };
const affina = (p, soloFuori = false) => { let q = p;
  for (let k = 0; k < 8; k++) { const c = vicinoU(q); if (!c.length) break; const inn = c.filter(x => x.dentro);
    let mossa;
    if (inn.length) { const x = inn.reduce((a, b) => (a.r.d > b.r.d ? a : b)); mossa = x.r.d > 1e-5 ? mul(unit(sub(x.r.q, q)), x.r.d + LEV) : mul(x.r.n, LEV); } // dentro: esce dal lato della superficie più vicina
    else { const x = c.reduce((a, b) => (a.r.d < b.r.d ? a : b)), dd = LEV - x.r.d; if (soloFuori && dd <= 0) break; mossa = mul(x.r.d > 1e-5 ? unit(sub(q, x.r.q)) : x.r.n, dd); }
    q = add(q, mossa); if (len(mossa) < 5e-4) break; }
  return q; };
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
  return lamina(B, N, T, D, 0.006);
}

/* placca volare: lamina su un campo di altezza della faccia volare (osso ∪ cartilagine, visto dal volare). La rima articolare
   è scavalcata con una chiusura morfologica (riempie solo le concavità strette, non solleva la testa): la placca resta adagiata
   sui condili. Contorno: rettangolare con angoli arrotondati; solo all'IFP le espansioni prossimali laterali (legamenti
   "checkrein"); larghezza mai oltre l'impronta volare dell'osso. Spessore: fibrocartilagine distale (inserzione alla base della
   falange) → porzione prossimale membranosa sottile; margini laterali ispessiti; bordi arrotondati. */
function placca(NU = 45, NV = 41) {
  const P = IFP.placca, [X0, X1, Y0, Y1] = IFP.win, hs = 0.02, nx = Math.round((X1 - X0) / hs) + 1, ny = Math.round((Y1 - Y0) / hs) + 1;
  const h = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = F.marcia([X0 + i * hs, Y0 + j * hs, 0.9], [0, 0, -1], LEV, 2.2); h[i + nx * j] = q ? q[2] : -2; }
  // chiusura morfologica lungo y (dilatazione poi erosione): riempie la rima senza alzare le superfici convesse
  const R = Math.round(P.ponte / hs), dil = new Float32Array(h.length), clo = new Float32Array(h.length);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { let m = -9; for (let k = Math.max(0, j - R); k <= Math.min(ny - 1, j + R); k++) m = Math.max(m, h[i + nx * k]); dil[i + nx * j] = m; }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { let m = 9; for (let k = Math.max(0, j - R); k <= Math.min(ny - 1, j + R); k++) m = Math.min(m, dil[i + nx * k]); clo[i + nx * j] = Math.max(m, h[i + nx * j]); }
  // lisciatura leggera (gaussiana separabile), mai sotto la superficie
  const h2 = clo.slice(), blur = (st, n, cnt, r, sg) => { for (let c = 0; c < cnt; c++) { const o = []; for (let k = 0; k < n; k++) { let sa = 0, t = 0; for (let m = -r; m <= r; m++) { const kk = clamp(k + m, 0, n - 1), w = Math.exp(-m * m / (2 * sg * sg)); sa += w * h2[st(c, kk)]; t += w; } o.push(sa / t); } for (let k = 0; k < n; k++) h2[st(c, k)] = o[k]; } };
  for (let it = 0; it < 2; it++) { blur((c, k) => c + nx * k, ny, nx, 4, 2); blur((c, k) => k + nx * c, nx, ny, 3, 1.5); for (let k = 0; k < h2.length; k++) h2[k] = Math.max(h2[k], h[k]); }
  const bil = (A, x, y) => { const fx = clamp((x - X0) / hs, 0, nx - 1.001), fy = clamp((y - Y0) / hs, 0, ny - 1.001), i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
    return (A[i + nx * j] * (1 - a) + A[i + 1 + nx * j] * a) * (1 - b) + (A[i + nx * (j + 1)] * (1 - a) + A[i + 1 + nx * (j + 1)] * a) * b; };
  const H2 = (x, y) => bil(h2, x, y), Hr = (x, y) => bil(h, x, y);
  const nor = (x, y) => unit([-(H2(x + 0.02, y) - H2(x - 0.02, y)) / 0.04, -(H2(x, y + 0.02) - H2(x, y - 0.02)) / 0.04, 1]);
  // impronta volare (h ≥ zcut) per ogni y, lisciata: semilarghezze a sinistra e a destra dell'asse
  const WL = [], WR = [];
  for (let j = 0; j < ny; j++) { const y = Y0 + j * hs; let xl = IFP.xc, xr = IFP.xc; while (xl > X0 && Hr(xl - 0.01, y) >= P.zcut) xl -= 0.01; while (xr < X1 && Hr(xr + 0.01, y) >= P.zcut) xr += 0.01; WL.push(IFP.xc - xl); WR.push(xr - IFP.xc); }
  const lisc = A => { let o = A.slice(); for (let it = 0; it < 4; it++) o = o.map((_, j) => { let sa = 0, t = 0; for (let m = -6; m <= 6; m++) { const w = Math.exp(-m * m / 18); sa += w * o[clamp(j + m, 0, ny - 1)]; t += w; } return sa / t; }); return o; };
  const WLs = lisc(WL), WRs = lisc(WR), semi = (y, sg) => { const f = clamp((y - Y0) / hs, 0, ny - 1.001), j = Math.floor(f), t = f - j, A = sg < 0 ? WLs : WRs; return A[j] * (1 - t) + A[j + 1] * t; };
  // contorno: distale rettilineo appena convesso, prossimale concavo; checkrein solo dove previsti (cr > 0)
  const cr = P.checkrein || 0, ydv = v => P.yd + P.cd * v * v, ypv = v => P.ypc + (P.ypl - P.ypc) * v * v + cr * Math.pow(sstep(0.55, 0.95, Math.abs(v)), 1.5);
  const B = [], N = [], T = [], D = [];
  for (let i = 0; i < NU; i++) {
    const u = i / (NU - 1), rb = [], rn = [], rt = [], rd = [];
    for (let j = 0; j < NV; j++) {
      const v = (j / (NV - 1) - 0.5) * 2, y = ypv(v) + u * (ydv(v) - ypv(v)), sg = v < 0 ? -1 : 1;
      // nelle checkrein la lamina si restringe verso la loro inserzione prossimale (nastri, non ali)
      const wnom = P.hw0 + (P.hw1 - P.hw0) * u, wmax = Math.max(0.05, semi(y, sg) - P.rientro), w = Math.min(wnom, wmax), x = IFP.xc + v * w;
      const z = H2(x, y) + LEV, n = nor(x, y);
      // spessore: distale fibrocartilagineo, prossimale membranoso; margini laterali ispessiti (inserzione dei collaterali accessori)
      const marg = Math.exp(-Math.pow((Math.abs(v) - 0.82) / 0.14, 2)), tb = P.tprox + (P.tdist - P.tprox) * sstep(0.25, 0.9, u) + P.margine * marg;
      // bordi arrotondati: profilo ellittico verso i margini laterali e prossimale; distale si assottiglia sull'inserzione
      const lat = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(v), 6))), pro = 0.25 + 0.75 * Math.sqrt(sstep(0, 0.10, u)), dis = 0.35 + 0.65 * Math.sqrt(sstep(0, 0.08, 1 - u));
      rb.push(affina([x, y, z], true)); rn.push(n); rt.push(tb * lat * pro * dis + 0.003); rd.push(unit([0.25 * v * sstep(0.5, 1, Math.abs(v)) * (1 - u), -1, 0]));
    }
    B.push(rb); N.push(rn); T.push(rt); D.push(rd);
  }
  // levigatura "a pellicola": media dei vicini (tira verso l'interno) poi di nuovo fuori da osso e cartilagine; elimina i bitorzoli
  for (let it = 0; it < 6; it++) { const B2 = B.map(r => r.map(q => q.slice()));
    for (let i = 1; i < NU - 1; i++) for (let j = 1; j < NV - 1; j++) B2[i][j] = affina([0, 1, 2].map(k => 0.4 * B[i][j][k] + 0.15 * (B[i - 1][j][k] + B[i + 1][j][k] + B[i][j - 1][k] + B[i][j + 1][k])), true);
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) B[i][j] = B2[i][j]; }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = B[Math.max(0, i - 1)][j], b = B[Math.min(NU - 1, i + 1)][j], c = B[i][Math.max(0, j - 1)], d = B[i][Math.min(NV - 1, j + 1)]; let n = unit(cross(sub(d, c), sub(b, a))); if (n[2] < 0) n = mul(n, -1); N[i][j] = n; }
  { const T0 = T.map(r => r.slice()), nl = libera(B, N, T, SOL, FOG, 0.004); for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) T[i][j] = Math.max(T[i][j], 0.35 * T0[i][j]); log('placca: vertici assottigliati da tendini e pulegge', nl);
    // spessore levigato (niente bitorzoli dove i tendini lo hanno ridotto a chiazze)
    for (let it = 0; it < 10; it++) { const T2 = T.map(r => r.slice()); for (let i = 1; i < NU - 1; i++) for (let j = 1; j < NV - 1; j++) T2[i][j] = 0.5 * T[i][j] + 0.125 * (T[i - 1][j] + T[i + 1][j] + T[i][j - 1] + T[i][j + 1]); for (let i = 0; i < NU; i++) T[i] = T2[i]; } }
  return lamina(B, N, T, D, 0.006);
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
