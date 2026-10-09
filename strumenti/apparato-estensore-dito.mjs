/* Apparato estensore del dito (modelli/polso-dito-3d.html, sezione dito): tendine dell'EDC con bendella centrale, bendelle sagittali,
   cappuccio degli estensori (espansione degli intrinseci), bendellette laterali (con le bendellette dell'EDC), legamento triangolare,
   tendine terminale, legamenti retinacolari trasversi (`trl`) e obliqui (`orl`); inoltre porta il lombricale sul lato radiale e rastrema lombricale e interossei dorsali in tendini (`iod_t`) che si inseriscono sull'osso e nel cappuccio.

   Uso (dalla cartella del progetto):
     node strumenti/apparato-estensore-dito.mjs              → riscrive le mesh nel file del modello
     MODELLO=/tmp/copia.html node strumenti/apparato-estensore-dito.mjs   → lavora su una copia

   Metodo: le strutture stanno su una superficie "tesa" attorno alle ossa reali (strumenti/lib-superficie-dito.mjs): ascissa curvilinea s
   lungo la sezione (0 = linea mediana dorsale, + ulnare, − radiale) e y lungo il dito. Ogni struttura è una lamina (spessore, margini
   arrotondati) con la direzione delle fibre per vertice (lib-dito.mjs: lamina). Il lombricale riparte dalla mesh originale
   (revisione ORIGINALE), quindi lo strumento si può rilanciare. Parametri e tabelle in testa a ogni struttura.
   Riferimenti: Doyle JR, Botte MJ, Surgical Anatomy of the Hand and Upper Extremity (2003); Kaplan EB, Functional and Surgical Anatomy
   of the Hand (1965); Landsmeer JMF, Anat Rec 104:31 (1949); Tubiana R, Thomine JM, Mackin E, Examination of the Hand and Wrist (1996);
   Schreuders TAR et al., J Hand Surg Am 2015 (retinacolari e bendellette laterali). */
import { Modello, Indice, sub, add, mul, unit, clamp, sstep, interp, lamina, unisci, log } from './lib-dito.mjs';
import { Superficie } from './lib-superficie-dito.mjs';

const ORIGINALE = process.env.ORIGINALE || 'f058cc0'; // revisione con il lombricale originale (BodyParts3D)
const M = new Modello();
let MO = M; try { MO = new Modello(undefined, ORIGINALE); } catch { /* senza git: si usa il file attuale */ }
const SF = new Superficie(['d_mc3', 'd_p1', 'd_p2', 'd_p3', 'd_cart'].map(n => M.get(n)));

/* ============ Utilità ============ */
const lente = x => Math.sqrt(Math.max(0, Math.sin(Math.PI * clamp(x, 0, 1)))); // sezione a lente, margine verticale arrotondato
const orlo = (x, k = 0.5) => Math.pow(Math.max(0, Math.sin(Math.PI * clamp(x, 0, 1))), k);
/* tabella indicizzata da y (decrescente): [[y, valore], …] con y in ordine decrescente → valore liscio */
const ty = (tab, y) => interp(tab.map(([a, b]) => [-a, b]), -y);

/* griglia NU × NV sulla superficie. f(u, v) → { y, s, h, t, d:[dy, ds] }: h = quota della faccia profonda sopra la superficie, t = spessore, d = fibre nel piano (y, s) */
function patch(NU, NV, f) {
  const B = [], N = [], T = [], D = [];
  for (let i = 0; i < NU; i++) { const rb = [], rn = [], rt = [], rd = [];
    for (let j = 0; j < NV; j++) {
      const c = f(i / (NU - 1), j / (NV - 1)), nr = SF.Nr(c.y, c.s), q = SF.Q(c.y, c.s), e = 0.03, l = Math.hypot(c.d[0], c.d[1]) || 1;
      const a = SF.Q(c.y + c.d[0] / l * e, c.s + c.d[1] / l * e), b = SF.Q(c.y - c.d[0] / l * e, c.s - c.d[1] / l * e);
      rb.push(add(q, mul(nr, c.h))); rn.push(nr); rt.push(c.t); rd.push(unit(sub(a, b))); }
    B.push(rb); N.push(rn); T.push(rt); D.push(rd); }
  return lamina(B, N, T, D, 0.008);
}
/* nastro lungo un percorso (y, s) campionato in NU punti: w larghezza, h quota, t spessore massimo (funzioni di u);
   nastro con estremità: fine = [taglio netto all'inizio, taglio netto alla fine]; altrimenti l'estremità si assottiglia */
function nastro({ NU = 80, NV = 15, path, w, h, t, fine = [false, false], orloK = 0.5 }) {
  const P = Array.from({ length: NU }, (_, i) => path(i / (NU - 1)));
  const tg = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(NU - 1, i + 1)], l = Math.hypot(b.y - a.y, b.s - a.s) || 1; return [(b.y - a.y) / l, (b.s - a.s) / l]; });
  return patch(NU, NV, (u, v) => { const i = Math.round(u * (NU - 1)), p = P[i], d = tg[i], x = (v - 0.5) * 2, W = w(u, p);
    const e0 = fine[0] ? 1 : Math.pow(sstep(0, 0.10, u), 0.7), e1 = fine[1] ? 1 : Math.pow(sstep(0, 0.10, 1 - u), 0.7);
    return { y: p.y + d[1] * x * W / 2, s: p.s - d[0] * x * W / 2, h: h(u, p), t: t(u, p) * orlo(v, orloK) * e0 * e1, d }; });
}
const per = tab => (u, p) => ty(tab, p.y);     // tabella indicizzata da y

/* ============ 1. Tendine dell'EDC e bendella centrale (d_edc) ============ */
const EDC = { y0: 6.4, y1: -2.56,
  w: [[6.4, 0.46], [4.0, 0.50], [3.2, 0.58], [2.6, 0.60], [2.0, 0.52], [1.4, 0.42], [0.5, 0.33], [-1.0, 0.31], [-1.8, 0.35], [-2.2, 0.46], [-2.4, 0.53], [-2.5, 0.47], [-2.56, 0.30]],
  t: [[6.4, 0.20], [4.0, 0.18], [3.0, 0.14], [2.2, 0.12], [1.0, 0.10], [-1.0, 0.09], [-2.0, 0.085], [-2.35, 0.055], [-2.56, 0.0]],
  h: [[6.4, 0.03], [3.5, 0.03], [2.8, 0.05], [1.6, 0.04], [0.0, 0.03], [-1.8, 0.04], [-2.3, 0.02], [-2.56, 0.0]] };
function edc() {
  return nastro({ NU: 150, NV: 17, fine: [true, true], orloK: 0.45,
    path: u => ({ y: EDC.y0 + (EDC.y1 - EDC.y0) * u, s: 0 }), w: per(EDC.w), h: per(EDC.h), t: per(EDC.t) });
}

/* ============ 2. Bendelle sagittali (sagittali): manicotto attorno all'MCF, dal tendine alla placca volare ============ */
const SAG = { yc: 2.85, smax: 1.62 }; // si fermano al margine laterale della placca volare (|s| ≈ 1,75), senza salire sulla puleggia A1
function sagittali() {
  return patch(26, 69, (u, v) => { const s = (v * 2 - 1) * SAG.smax, a = Math.abs(s), hl = 0.40 - 0.14 * sstep(1.0, 1.6, a), y = SAG.yc + hl * (1 - 2 * u), fin = sstep(1.3, SAG.smax, a);
    // le fibre convergono verso la placca: bordi che si restringono, spessore e quota che calano nell'ultimo tratto
    return { y, s, h: 0.012 + 0.07 * sstep(0.35, 0.85, a) * (1 - 0.85 * fin), t: 0.036 * (1 - 0.6 * fin) * orlo(u, 0.45) * orlo(v, 0.3), d: [0, 1] }; });
}

/* ============ 3. Cappuccio degli estensori (cappuccio): espansione degli intrinseci distale alle sagittali ============ */
const CAP = { yp: 2.62, smax: 0.98, // il cappuccio finisce dorsalmente al tendine dell'interosseo, che gli corre accanto senza entrarvi
  yd: [[0, 1.00], [0.25, 1.12], [0.7, 1.55], [1.0, 1.82], [1.28, 2.05]] };
function cappuccio() {
  return patch(30, 73, (u, v) => { const s = (v * 2 - 1) * CAP.smax, a = Math.abs(s), yd = interp(CAP.yd, a), y = CAP.yp + (yd - CAP.yp) * u;
    const dirS = -Math.sign(s) * 0.78 * sstep(0.05, 0.4, a); // fibre oblique: dal margine laterale verso la linea mediana e distalmente
    return { y, s, h: 0.012 + 0.07 * sstep(0.35, 0.85, a) * sstep(1.75, 2.15, y), t: 0.03 * orlo(u, 0.45) * orlo(v, 0.3), d: [-0.62, dirS] }; });
}

/* ============ 4. Bendellette laterali (bl): intrinseci + bendellette dell'EDC ============ */
const BAND = { s: [[1.95, 0.95], [1.6, 0.80], [1.1, 0.68], [0.5, 0.60], [-0.5, 0.55], [-1.2, 0.50], [-1.9, 0.46], [-2.4, 0.40], [-2.9, 0.29], [-3.35, 0.17], [-3.7, 0.09], [-3.98, 0.07]],
  w: [[1.95, 0.14], [1.2, 0.15], [0.0, 0.17], [-1.9, 0.15], [-2.5, 0.14], [-3.0, 0.13], [-3.7, 0.12], [-3.98, 0.10]],
  t: [[1.95, 0.05], [1.0, 0.05], [-1.9, 0.05], [-3.0, 0.045], [-3.7, 0.05], [-3.98, 0.05]],
  h: [[1.95, 0.12], [1.6, 0.085], [1.2, 0.05], [-1.8, 0.035], [-3.98, 0.03]],
  slip: { y0: 1.55, y1: -0.25, s: [[1.55, 0.14], [1.1, 0.25], [0.6, 0.41], [0.2, 0.52], [-0.25, 0.555]], w: [[1.55, 0.10], [1.0, 0.13], [-0.25, 0.15]] } };
function bendellette(sg) {
  const banda = nastro({ NU: 120, NV: 13, fine: [true, false], path: u => { const y = BAND.s[0][0] + (BAND.s[BAND.s.length - 1][0] - BAND.s[0][0]) * u; return { y, s: sg * ty(BAND.s, y) }; },
    w: per(BAND.w), h: per(BAND.h), t: per(BAND.t) });
  const sl = BAND.slip, slip = nastro({ NU: 50, NV: 11, fine: [false, false], path: u => { const y = sl.y0 + (sl.y1 - sl.y0) * u; return { y, s: sg * ty(sl.s, y) }; },
    w: per(sl.w), h: (u, p) => 0.036 + 0.01 * (1 - u), t: (u, p) => 0.05 * sstep(0, 0.3, u) });
  return unisci(banda, slip);
}
const bl = () => unisci(bendellette(-1), bendellette(1), tendineLombricale());

/* ============ 5. Legamento triangolare ============ */
function triangolare() {
  const y1 = -3.72;
  return patch(26, 49, (u, v) => { const x = v * 2 - 1, y0 = -2.68 + 0.17 * x * x, y = y0 + (y1 - y0) * u, hw = ty(BAND.s, y) - 0.02, s = x * hw;
    return { y, s, h: 0.012, t: 0.03 * orlo(u, 0.4) * orlo(v, 0.35), d: [-0.45 * u, Math.tanh(s / 0.08) * 0.85] }; });
}

/* ============ 6. Tendine terminale ============ */
const TERM = { y0: -3.5, y1: -5.22, // inserzione sul tubercolo dorsale della base di P3 (≈ −4,8 … −5,2), distale alla rima della IFD (≈ −4,65)
  w: [[-3.5, 0.10], [-3.78, 0.20], [-4.05, 0.26], [-4.3, 0.24], [-4.8, 0.25], [-5.0, 0.36], [-5.14, 0.42], [-5.22, 0.30]],
  t: [[-3.5, 0.05], [-4.2, 0.055], [-4.7, 0.045], [-4.95, 0.04], [-5.1, 0.025], [-5.22, 0.0]],
  h: [[-3.5, 0.02], [-4.6, 0.02], [-4.85, 0.008], [-5.22, 0.0]] };
function terminale() {
  return nastro({ NU: 70, NV: 15, fine: [false, true], path: u => ({ y: TERM.y0 + (TERM.y1 - TERM.y0) * u, s: 0 }), w: per(TERM.w), h: per(TERM.h), t: per(TERM.t) });
}

/* ============ 7. Legamenti retinacolari trasversi (trl) e obliqui (orl) ============ */
function trl() {
  const lato = sg => patch(7, 29, (u, v) => { const a = 0.50 + (1.26 - 0.50) * v;
    return { y: -1.93 + (u - 0.5) * 0.09 + 0.05 * v, s: sg * a, h: 0.075 + 0.045 * lente(v), t: 0.026 * orlo(u, 0.5) * sstep(0, 0.1, v) * sstep(0, 0.1, 1 - v) + 0.0005, d: [0, sg] }; });
  return unisci(lato(-1), lato(1));
}
const ORL = { s: [[-0.85, 1.18], [-1.2, 1.02], [-1.6, 0.92], [-2.12, 0.88], [-2.63, 0.56], [-3.13, 0.35], [-3.63, 0.18], [-3.80, 0.11]],
  h: [[-0.85, 0.02], [-1.2, 0.04], [-1.6, 0.06], [-2.0, 0.062], [-2.5, 0.06], [-2.9, 0.045], [-3.8, 0.03]] };
function orl() {
  const lato = sg => nastro({ NU: 70, NV: 9, fine: [false, false], path: u => { const y = ORL.s[0][0] + (ORL.s[ORL.s.length - 1][0] - ORL.s[0][0]) * u; return { y, s: sg * ty(ORL.s, y) }; },
    w: () => 0.075, h: per(ORL.h), t: () => 0.022 });
  return unisci(lato(-1), lato(1));
}

/* ============ 8. Lombricale: il ventre finisce sul lato radiale dell'MCF, il tendine (nella bendelletta radiale) raggiunge la bendelletta laterale ============ */
const LUMB = { ya: 2.85, yb: 2.35, tendine: { s: [[2.95, -1.12], [2.4, -1.12], [2.0, -0.99], [1.6, -0.86], [1.2, -0.73], [0.95, -0.67]], w: [[2.95, 0.10], [2.4, 0.12], [1.0, 0.13]], h: [[2.95, 0.14], [2.4, 0.12], [1.8, 0.12], [1.3, 0.09], [0.95, 0.05]], t: [[2.95, 0.05], [1.0, 0.05]] } };
/* ventre muscolare (mesh originale) che si rastrema in punta: ya = inizio della rastremazione, yb = punta; i segni di s separano radiale e ulnare */
function rastrema(nome, ya, yb, lato = 0) { // lato: −1 radiale, +1 ulnare, 0 = dal segno di s (iod, due ventri); il lombricale ha anche il tratto distale originale sulla linea mediana dorsale (|s| ≈ 0), da portare sul lato radiale
  const g = MO.get(nome), nv = g.pos.length / 3, q = [];
  for (let i = 0; i < nv; i++) q.push(SF.da([g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]]));
  const sez = new Map(); q.forEach(p => { const k = Math.round(p.y / 0.1) + ((lato || p.s) > 0 ? 1e4 : 0); let r = sez.get(k); if (!r) sez.set(k, r = { s: 0, h: 0, n: 0 }); r.s += p.s; r.h += p.h; r.n++; });
  const cen = (y, sg) => { const k = Math.round(y / 0.1); for (let d = 0; d < 8; d++) for (const kk of [k - d, k + d]) { const r = sez.get(kk + (sg > 0 ? 1e4 : 0)); if (r && r.n > 3) return { s: r.s / r.n, h: r.h / r.n }; } return { s: 0, h: 0 }; };
  const pos = Float32Array.from(g.pos);
  for (let i = 0; i < nv; i++) { const p = q[i]; if (p.y >= ya) continue;
    const sg = lato || (p.s > 0 ? 1 : -1), k = sstep(yb, ya, p.y), yc = Math.max(p.y, yb), c = cen(yc, sg), pt = SF.P(yc, c.s + (p.s - c.s) * k, c.h + (p.h - c.h) * k);
    pos[3 * i] = pt[0]; pos[3 * i + 1] = pt[1]; pos[3 * i + 2] = pt[2]; }
  // levigatura della zona rastremata (la punta originale è frastagliata): media dei vicini sui vertici con y < ya
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < g.idx.length; t += 3) for (let a = 0; a < 3; a++) { nb[g.idx[t + a]].add(g.idx[t + (a + 1) % 3]); nb[g.idx[t + a]].add(g.idx[t + (a + 2) % 3]); }
  const zona = []; for (let i = 0; i < nv; i++) if (g.pos[3 * i + 1] < ya + 0.15 && g.pos[3 * i + 1] > yb - 0.5 && (lato || Math.abs(q[i].s) > 0.2)) zona.push(i);
  for (let it = 0; it < 8; it++) { const nuove = zona.map(i => { const v = [...nb[i]]; if (!v.length) return null; const m = [0, 0, 0]; for (const j of v) for (let k = 0; k < 3; k++) m[k] += pos[3 * j + k] / v.length; return m; });
    zona.forEach((i, n) => { const m = nuove[n]; if (m) for (let k = 0; k < 3; k++) pos[3 * i + k] = 0.5 * pos[3 * i + k] + 0.5 * m[k]; }); }
  return { pos, idx: g.idx, dir: g.dir, tag: g.tag };
}
const LUMBM = rastrema('d_lumb', LUMB.ya, LUMB.yb, -1), lombricale = () => LUMBM;
/* asse (s, h) del ventre rastremato per y (passo 0,1): il tendine nasce da qui, così sui due lati resta collegato al muscolo */
function asse(g, sg, y0, y1) {
  const A = []; for (let y = y0; y >= y1 - 1e-6; y -= 0.1) { let n = 0, ss = 0, hh = 0;
    for (let i = 0; i < g.pos.length; i += 3) { if (Math.abs(g.pos[i + 1] - y) > 0.06) continue; const q = SF.da([g.pos[i], g.pos[i + 1], g.pos[i + 2]]); if (q.s * sg < 0.3) continue; n++; ss += q.s; hh += q.h; }
    A.push(n ? [y, ss / n, hh / n] : null); }
  const ok = A.filter(Boolean); if (!ok.length) return null; return A.map((a, i) => a || ok.reduce((b, c) => Math.abs(c[0] - (y0 - 0.1 * i)) < Math.abs(b[0] - (y0 - 0.1 * i)) ? c : b));
}
/* fonde l'asse del ventre A (per y ≥ yf) con il percorso fisso (per y ≤ yp): y → { s, h } */
function fondi(A, yf, yp, tabS, tabH, sg) { return y => { const k = clamp((A[0][0] - y) / 0.1, 0, A.length - 1.001), i = Math.floor(k), f = k - i,
  as = A[i][1] + (A[i + 1][1] - A[i][1]) * f, ah = A[i][2] + (A[i + 1][2] - A[i][2]) * f, w = sstep(yf, yp, y);
  return { s: as * (1 - w) + sg * ty(tabS, y) * w, h: ah * (1 - w) + ty(tabH, y) * w }; }; }

/* ============ 9. Interossei dorsali: ventre che si rastrema nel tendine, con fascio osseo (tubercolo laterale della base di P1) e fascio per il cappuccio ============ */
const IOD = { ya: 3.3, yb: 2.75,
  tronco: { s: [[3.1, 1.14], [2.9, 1.14], [2.6, 1.12], [2.35, 1.12], [2.15, 1.04], [1.95, 0.95]], w: [[3.1, 0.10], [2.6, 0.15], [2.2, 0.16], [1.95, 0.14]], h: [[3.1, 0.22], [2.9, 0.20], [2.6, 0.14], [2.3, 0.12], [1.95, 0.12]], t: [[3.1, 0.05], [2.6, 0.065], [2.2, 0.06], [1.95, 0.05]] },
  osseo: { s: [[2.3, 1.16], [2.15, 1.25], [2.05, 1.32]], w: [[2.3, 0.14], [2.15, 0.24], [2.05, 0.32], [2.0, 0.28]], t: [[2.3, 0.045], [2.1, 0.035], [2.0, 0.0]] },
  cappuccio: { s: [[2.3, 1.14], [2.15, 1.04], [2.0, 0.96], [1.93, 0.92]], w: [[2.3, 0.12], [2.0, 0.14]], h: [[2.3, 0.05], [1.93, 0.05]], t: [[2.3, 0.045], [1.93, 0.04]] } };
const IODM = rastrema('d_iod', IOD.ya, IOD.yb), iod = () => IODM;
function tendineIod(sg) {
  const y2u = (a, b, fs) => u => { const y = a + (b - a) * u; return { y, ...fs(y) }; };
  const tr = IOD.tronco, os = IOD.osseo, fd = fondi(asse(IODM, sg, 3.3, 2.7), 2.8, 2.45, tr.s, tr.h, sg);
  // tronco: nasce sull'asse del ventre (s, h misurati sulla mesh rastremata di quel lato) e converge sul percorso fisso verso il tubercolo
  const tronco = nastro({ NU: 70, NV: 11, fine: [false, true], path: y2u(3.3, 1.85, fd), w: per(tr.w), h: (u, p) => p.h, t: per(tr.t) });
  // fascio osseo: si allarga e poggia sull'osso (quota che cala a zero), spessore che si annulla sull'inserzione
  const osseo = nastro({ NU: 30, NV: 13, fine: [false, false], path: y2u(2.3, 2.0, y => ({ s: sg * ty(os.s, y) })), w: per(os.w), h: (u, p) => 0.06 * (1 - sstep(0, 1, u)), t: per(os.t) });
  return unisci(tronco, osseo);
}
const iod_t = () => unisci(tendineIod(-1), tendineIod(1));


function tendineLombricale() { // nasce esattamente dalla punta del ventre rastremato (asse misurato sulla mesh) e converge sul percorso verso la bendelletta
  const L = LUMB.tendine, tip = asse(LUMBM, -1, 2.45, 2.45)[0], y0 = 2.45;
  return nastro({ NU: 60, NV: 11, fine: [false, false], path: u => { const y = y0 + (L.s[L.s.length - 1][0] - y0) * u, w = sstep(y0, 2.1, y);
    return { y, s: tip[1] * (1 - w) + ty(L.s, y) * w, h: tip[2] * (1 - w) + ty(L.h, y) * w }; }, w: per(L.w), h: (u, p) => p.h, t: per(L.t) });
}

/* ============ Scrittura ============ */
const NUOVE = { d_edc: edc, sagittali, cappuccio, bl, triangolare, terminale, trl, orl, d_lumb: lombricale, d_iod: iod, iod_t };
for (const [n, f] of Object.entries(NUOVE)) {
  const g = f(); if (!M.man.meshes.find(m => m.n === n)) M.man.meshes.push({ n, nv: 0, ni: 0, p: 0, i: 0, i16: 1 });
  M.set(n, g); log(n.padEnd(12), g.pos.length / 3, 'vertici', g.idx.length / 3, 'triangoli'); }

/* verifica: distanza dalle ossa/cartilagini e compenetrazioni con i legamenti chiusi */
const SOL = { ossa: new Indice(['d_mc3', 'd_p1', 'd_p2', 'd_p3', 'd_cart'].map(n => M.get(n)), 0.1), leg: new Indice(['cl_mcp_rad', 'cl_mcp_uln', 'cl_pip_rad', 'cl_pip_uln', 'cl_dip_rad', 'cl_dip_uln', 'vp_mcp', 'vp_pip', 'vp_dip'].map(n => M.get(n)), 0.1) };
for (const n of Object.keys(NUOVE)) { const g = M.get(n); let vo = 0, vl = 0, dmin = 9; const nv = g.pos.length / 3;
  for (let i = 0; i < nv; i++) { const p = [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]], r = SOL.ossa.vicino(p, 0.1); if (r) dmin = Math.min(dmin, r.d); if (SOL.ossa.dentro(p)) vo++; if (SOL.leg.dentro(p)) vl++; }
  log('verifica', n.padEnd(12), 'dentro le ossa', vo, '· dentro legamenti/placche', vl, '· distanza minima dall\'osso', dmin === 9 ? '>0.1' : dmin.toFixed(3)); }
M.salva();
