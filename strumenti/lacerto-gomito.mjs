/* Lacerto fibroso (aponeurosi bicipitale) del gomito (modelli/gomito-3d.html).

   Uso (dalla cartella del progetto):
     node strumenti/lacerto-gomito.mjs              → riscrive la mesh `lacerto` (e solleva le vene superficiali che la incrociano) nel file del modello
     MODELLO=/tmp/copia.html node strumenti/lacerto-gomito.mjs   → lavora su una copia
     node strumenti/lacerto-gomito.mjs verifica     → non scrive: compenetrazioni della mesh del file con strutture profonde, vene, nervi cutanei e cute

   Metodo e parametri: GUIDA_MODELLI.md. Non legge il lacerto che c'è nel file (lo sostituisce): va lanciato per ultimo nella catena del gomito, dopo
   flessori-pronatori-gomito.mjs, vene-gomito.mjs e rifinitura-flessori-gomito.mjs (che rimettono il lacerto vecchio). Si può rilanciare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { clamp, sstep, log, REAL, setMesh } = G;

const VERIFICA = process.argv.slice(2).includes('verifica');

/* ============ Tabelle ============ */
// Aponeurosi a ventaglio: nasce dal margine mediale del tendine distale del bicipite (lato A, ~2 cm), passa obliqua in basso e medialmente sopra
// arteria brachiale e nervo mediano (margine prossimale libero B) e si perde nella fascia dei flessori-pronatori (margine distale D, che sfuma);
// il margine laterale-distale C scende dal tendine verso il lato mediale (Standring, Gray's Anatomy 42ª ed.). Punti guida in coordinate frontali
// della superficie [x (mediale +), y (prossimale +)] cm: sono convertiti in (angolo attorno all'asse del braccio, y) sull'inviluppo teso.
// Quattro lati di una superficie di Coons: A (origine, dall'alto in basso), B (da A in alto verso il margine mediale), C (da A in basso verso il
// margine distale), D (da B a C). B(1)=D(0), C(1)=D(1).
const FORMA = {
  A: [[-0.05, 2.4], [-0.25, 1.7], [-0.45, 1.0]],
  B: [[-0.05, 2.4], [1.2, 2.2], [2.1, 1.85], [2.8, 1.45], [3.25, 0.95]],
  C: [[-0.45, 1.0], [0.0, -0.5], [0.62, -1.7], [1.3, -2.8], [2.2, -3.5]],
  D: [[3.25, 0.95], [3.3, 0.3], [3.05, -0.6], [2.75, -1.5], [2.5, -2.3], [2.35, -2.95], [2.2, -3.5]],
  mesh: { ns: 48, nu: 64 },                         // maglie lungo le fibre (dall'origine al margine D) e attraverso
  Tm: 0.035, T0: 0.08, origine: 0.2, labbro: 0.02,  // cm: spessore nel corpo, all'origine, frazione dello spessore sulla linea d'origine (si fonde col tendine), cordone del margine libero
  bordo: { B: 0.06, C: 0.25, D: 0.5 },              // cm: larghezza dell'arrotondamento dello spessore sui margini (lo spessore va a zero sul bordo)
  dissolvenza: { da: 0.15, potenza: 1.3 },          // tag 0-255 = opacità persa: nulla fino a s = da (vicino al tendine), poi cresce con continuità fino al margine più lontano dal tendine
  gioco: 0.03, incasso: 0.06,                        // cm: gioco dalle strutture profonde, e quanto la linea d'origine entra nel tendine (si fonde: niente bordo visibile)
};
const INVILUPPO = {
  R0: 3.2,            // cm: raggio nominale per passare da gradi a lunghezza nella carta (cm per radiante)
  chiusura: 1.3,      // cm: raggio della palla della chiusura morfologica (membrana tesa tra tendine, vasi e flessori)
  chiusuraAder: 0.35, // cm: chiusura aderente (la membrana cede un poco tra i rilievi)
  cedimento: 0.2,     // frazione del passaggio dalla chiusura tesa a quella aderente
  raccordo: 0.15,     // cm: dilatazione (palla) della superficie profonda: margine libero dalle strutture, senza pieghe
  liscia: 0.2,        // cm: sigma della levigatura della carta
  carta: { th0: -70, th1: 130, dth: 1, y0: -7, y1: 5, dy: 0.1 },   // gradi e cm
};
const SOFFITTO_VENE = false;                         // true: la faccia superiore resta sotto vene e nervi superficiali (la lamina si abbassa); false: sono le vene a essere sollevate
const ATTACCO = { passate: 10, tratto: 0.3, sopra: -0.02 };   // passate di estensione del livello locale del tendine oltre il suo margine (≈ 0,6 cm); tratto (frazione di s) in cui la lamina passa dal tendine all'inviluppo; quota sul tendine (cm)
const MARGINE = { vene: 0.03, cute: 0.05 };          // cm: la faccia superiore resta sotto vene/nervi superficiali e cute di questa distanza
// vene e nervi che passano sopra il lacerto: se lo incrociano senza spazio, sono sollevati con un raccordo
const SUPERFICIALI = ['v_basilica', 'v_mediana_cub', 'v_mediana_basilica', 'v_mediana_cefalica', 'v_mediana_avambraccio', 'v_cefalica', 'n_cut_med_avambraccio', 'n_cut_med_braccio', 'n_cut_lat'];
const ATTRAVERSA = ['v_perforante'];                  // la vena perforante attraversa la fascia accanto al lacerto: nessun controllo
const SOLLEVA = { sigma: 0.5, pendenza: 0.12, fermo: 1.2 };   // sigma (cm) della levigatura lungo il tubo; pendenza massima del sollevamento (cm per cm di tracciato); tratto (cm) alle estremità che resta fermo
const MESH = ['omero', 'ulna', 'radio', 'cart_omero', 'cart_ulna', 'cart_radio', 'caps', 'fat_ant', 'bic', 'brach', 'pt', 'fcr', 'pl', 'fds', 'fdp', 'fcu', 'fpl', 'br', 'ecrl', 'ecrb', 'sup', 'tri_med'];
const PASSO = 0.05;                                   // cm, griglia dei voxel
const AREA = { lo: [-3.8, -7, -0.8], hi: [4.8, 5, 5.8] };
const PAGINA = { fade: 0.93, luce: 1.12, opacita: 0.88 };   // pagina: opacità persa dal tag massimo (LACERTO_FADE), moltiplicatore del colore (LACERTO_LUCE), opacità di base del lacerto

const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
const reff = id => NVP.r[id] * (id.startsWith('v_') ? 1.1 : id.startsWith('n_') ? 1.08 : 1.05);
const rad = Math.PI / 180;

/* ============ Campi ============ */
G.griglia(AREA.lo, AREA.hi, PASSO, 0);
const { N, NX, NY, NZ, NXY, H } = G;
const capsula = (M, id, extra = 0) => {            // tubo di raggio reff(id) + extra (cm) nella maschera M
  const P = NVP.pts[id], r = reff(id) + extra; if (!P) return;
  for (let s = 0; s + 1 < P.length; s++) {
    const a = P[s], b = P[s + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = Math.max(1, Math.ceil(L / (H * 0.5)));
    for (let u = 0; u <= m; u++) {
      const c = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * u / m), R = Math.ceil(r / H) + 1;
      const i0 = Math.floor((c[0] - G.O[0]) / H), j0 = Math.floor((c[1] - G.O[1]) / H), k0 = Math.floor((c[2] - G.O[2]) / H);
      for (let k = k0 - R; k <= k0 + R; k++) for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
        if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) continue;
        const p = G.voxel(G.vi(i, j, k)); if (Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) <= r) M[G.vi(i, j, k)] = 1;
      }
    }
  }
};
const TUBI_PROFONDI = Object.keys(NVP.pts).filter(id => !SUPERFICIALI.includes(id) && !ATTRAVERSA.includes(id));
const profondo = new Uint8Array(N), senzaBic = new Uint8Array(N);   // senzaBic: l'origine del lacerto può entrare nel tendine
for (const n of MESH) { const m = G.solid(n); for (let q = 0; q < N; q++) { profondo[q] |= m[q]; if (n !== 'bic') senzaBic[q] |= m[q]; } }
for (const id of TUBI_PROFONDI) { capsula(profondo, id); capsula(senzaBic, id); }
const Fp = G.sdf(profondo).F; G.sfoca(Fp, 1);        // distanza con segno dalle strutture profonde (negativa dentro)
const Fc = G.sdf(G.solid('cute')).F; G.sfoca(Fc, 1); // dalla cute (negativa dentro)
log('campi');

// asse del braccio per quota y: baricentro (x, z) della sezione occupata, levigato lungo y
const levigaY = (a, sig) => { const n = a.length, o = new Float32Array(n), w = Math.ceil(3 * sig / H);
  for (let i = 0; i < n; i++) { let s = 0, ws = 0; for (let d = -w; d <= w; d++) { const k = i + d; if (k < 0 || k >= n || isNaN(a[k])) continue; const g = Math.exp(-0.5 * (d * H / sig) ** 2); s += g * a[k]; ws += g; } o[i] = ws ? s / ws : NaN; } return o; };
const AXx = new Float32Array(NY), AXz = new Float32Array(NY);
for (let j = 0; j < NY; j++) { let sx = 0, sz = 0, c = 0; for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (profondo[i + NX * j + NXY * k]) { sx += G.O[0] + (i + 0.5) * H; sz += G.O[2] + (k + 0.5) * H; c++; } AXx[j] = c ? sx / c : NaN; AXz[j] = c ? sz / c : NaN; }
const ax = levigaY(AXx, 0.8), az = levigaY(AXz, 0.8);
const asse = y => { const j = clamp((y - G.O[1]) / H - 0.5, 0, NY - 1.001), j0 = Math.floor(j), t = j - j0; return [ax[j0] * (1 - t) + ax[j0 + 1] * t, az[j0] * (1 - t) + az[j0 + 1] * t]; };

/* ============ Carta (angolo × quota) dell'inviluppo ============ */
const C = INVILUPPO.carta, nT = Math.round((C.th1 - C.th0) / C.dth), nY = Math.round((C.y1 - C.y0) / C.dy);
const da = INVILUPPO.R0 * C.dth * rad;               // cm per pixel in angolo
// raggio (dall'asse) della faccia più esterna dell'insieme profondo, per ogni (angolo, quota): primo ingresso da fuori lungo il raggio
const cartaRaggi = F => { const R = new Float32Array(nT * nY);
  for (let jy = 0; jy < nY; jy++) { const y = C.y0 + (jy + 0.5) * C.dy, [cx, cz] = asse(y);
    for (let it = 0; it < nT; it++) { const th = (C.th0 + (it + 0.5) * C.dth) * rad, sx = Math.sin(th), cc = Math.cos(th);
      let prev = G.sample(F, cx + 7 * sx, y, cz + 7 * cc), rr = 0;
      for (let r = 6.98; r > 0; r -= 0.01) { const f = G.sample(F, cx + r * sx, y, cz + r * cc); if (prev > 0 && f <= 0) { rr = r + 0.01 * f / (f - prev); break; } prev = f; }
      R[jy * nT + it] = rr; } }
  return R; };
const Rraw = cartaRaggi(Fp); for (let i = 0; i < Rraw.length; i++) if (Rraw[i] === 0) Rraw[i] = 2.5;
const Rsb = (() => { const F = G.sdf(senzaBic).F; G.sfoca(F, 1); const R = cartaRaggi(F); for (let i = 0; i < R.length; i++) if (R[i] === 0) R[i] = 2.5; return R; })();   // come Rraw, senza il bicipite
const Rcute = cartaRaggi(Fc);                         // cute (fuori = 0 dove la carta non la incontra)
// vene e nervi superficiali: primo ingresso lungo il raggio
const Mv = new Uint8Array(N); for (const id of SUPERFICIALI) capsula(Mv, id, MARGINE.vene);
const Rvene = new Float32Array(nT * nY).fill(99);
for (let jy = 0; jy < nY; jy++) { const y = C.y0 + (jy + 0.5) * C.dy, [cx, cz] = asse(y);
  for (let it = 0; it < nT; it++) { const th = (C.th0 + (it + 0.5) * C.dth) * rad, sx = Math.sin(th), cc = Math.cos(th);
    for (let r = 1.0; r < 6; r += 0.02) { const i = Math.floor((cx + r * sx - G.O[0]) / H), j = Math.floor((y - G.O[1]) / H), k = Math.floor((cz + r * cc - G.O[2]) / H);
      if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) continue; if (Mv[G.vi(i, j, k)]) { Rvene[jy * nT + it] = r; break; } } } }
// filtri sulla carta
const palla = (A, raggio, tipo) => { const ni = Math.ceil(raggio / da), nj = Math.ceil(raggio / C.dy), L = [];
  for (let dj = -nj; dj <= nj; dj++) for (let di = -ni; di <= ni; di++) { const d2 = (di * da) ** 2 + (dj * C.dy) ** 2; if (d2 <= raggio * raggio) L.push([di, dj, Math.sqrt(raggio * raggio - d2)]); }
  const O2 = new Float32Array(A.length);
  for (let jy = 0; jy < nY; jy++) for (let it = 0; it < nT; it++) { let v = tipo === 'max' ? -1e9 : 1e9;
    for (const [di, dj, h] of L) { const i = it + di, j = jy + dj; if (i < 0 || j < 0 || i >= nT || j >= nY) continue; const a = tipo === 'max' ? A[j * nT + i] + h : A[j * nT + i] - h; if (tipo === 'max' ? a > v : a < v) v = a; }
    O2[jy * nT + it] = v; }
  return O2; };
const sfoca = (A, sig) => { const wi = Math.ceil(3 * sig / da), wj = Math.ceil(3 * sig / C.dy), T = new Float32Array(A.length), O2 = new Float32Array(A.length);
  for (let jy = 0; jy < nY; jy++) for (let it = 0; it < nT; it++) { let s = 0, w = 0; for (let d = -wi; d <= wi; d++) { const i = it + d; if (i < 0 || i >= nT) continue; const g = Math.exp(-0.5 * (d * da / sig) ** 2); s += g * A[jy * nT + i]; w += g; } T[jy * nT + it] = s / w; }
  for (let jy = 0; jy < nY; jy++) for (let it = 0; it < nT; it++) { let s = 0, w = 0; for (let d = -wj; d <= wj; d++) { const j = jy + d; if (j < 0 || j >= nY) continue; const g = Math.exp(-0.5 * (d * C.dy / sig) ** 2); s += g * T[j * nT + it]; w += g; } O2[jy * nT + it] = s / w; }
  return O2; };
// inviluppo teso (membrana tra i rilievi: palla che rotola, chiusura morfologica) con un po' di cedimento verso quello aderente
const chiudi = (A, r) => palla(palla(A, r, 'max'), r, 'min');
const Rteso = sfoca(chiudi(Rraw, INVILUPPO.chiusura), INVILUPPO.liscia), Rader = sfoca(chiudi(Rraw, INVILUPPO.chiusuraAder), INVILUPPO.liscia);
let Renv = new Float32Array(Rraw.length); for (let i = 0; i < Renv.length; i++) Renv[i] = Rteso[i] - INVILUPPO.cedimento * (Rteso[i] - Rader[i]);
{ const Rd = palla(Rraw, INVILUPPO.raccordo, 'max'); for (let i = 0; i < Renv.length; i++) Renv[i] = Math.max(Renv[i], Rd[i] + 0.01); Renv = sfoca(Renv, 0.08); }
// soffitto: sotto vene, nervi superficiali e cute (lo spessore massimo + gioco stanno sotto); mai sotto le strutture profonde
{ const Tmax = FORMA.T0 + FORMA.labbro, lim = new Float32Array(Renv.length); let n = 0;
  for (let i = 0; i < Renv.length; i++) { const cute = Rcute[i] > 0 ? Rcute[i] - MARGINE.cute : 99;
    lim[i] = (SOFFITTO_VENE ? Math.min(Rvene[i] - MARGINE.vene, cute) : cute) - Tmax - FORMA.gioco; if (Renv[i] > lim[i]) { Renv[i] = Math.max(lim[i], Rraw[i] + 0.004); n++; } }
  const R2 = sfoca(Renv, 0.1); for (let i = 0; i < Renv.length; i++) Renv[i] = Math.min(R2[i], Math.max(lim[i], Rraw[i] + 0.004));
  log(`inviluppo: ${n} pixel della carta limitati da vene superficiali e cute`); }
for (let i = 0; i < Renv.length; i++) Renv[i] = Math.max(Renv[i], Rraw[i] + 0.004);
const bil = (A, th, y) => { const fx = clamp((th - C.th0) / C.dth - 0.5, 0, nT - 1.001), fy = clamp((y - C.y0) / C.dy - 0.5, 0, nY - 1.001), i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
  const g = (a, b) => A[b * nT + a]; return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - ty) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * ty; };
// tendine del bicipite: all'origine la lamina segue la sua faccia (non l'inviluppo teso, che sta sopra la fossa e lascerebbe uno spazio tra tendine e lacerto);
// il livello locale del tendine è prolungato oltre il suo margine con il valore del bordo, poi la lamina sale all'inviluppo (peso 1 → 0 tra s = 0 e `ATTACCO.tratto`)
const Rbic = cartaRaggi((() => { const F = G.sdf(G.solid('bic')).F; G.sfoca(F, 1); return F; })());
const estendi = (A, passate) => { let R = A.slice();   // il livello locale del tendine si prolunga oltre il suo margine con il valore del bordo (nessun plateau sopra la fossa)
  for (let g = 0; g < passate; g++) { const N2 = R.slice();
    for (let jy = 0; jy < nY; jy++) for (let it = 0; it < nT; it++) if (R[jy * nT + it] === 0) { let m = 0, k = 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = it + a, j = jy + b; if (i >= 0 && j >= 0 && i < nT && j < nY && R[j * nT + i] > 0) { m += R[j * nT + i]; k++; } } if (k) N2[jy * nT + it] = m / k; }
    R = N2; }
  return R; };
const Rbx = estendi(Rbic, ATTACCO.passate);
const rEnv = (th, y) => bil(Renv, th, y);
const raggio = (th, y, s) => { let r = rEnv(th, y); const b = 1 - sstep(0, ATTACCO.tratto, s), rb = bil(Rbx, th, y);
  if (b > 0 && rb > 0.5) r = (1 - b) * r + b * Math.min(r, rb + ATTACCO.sopra);
  return Math.max(r, (1 - b) * bil(Rraw, th, y) + b * bil(Rsb, th, y) + 0.004); };
const pos3 = (th, y, off, s = 1) => { const [cx, cz] = asse(y), r = raggio(th, y, s) + off, t = th * rad; return [cx + r * Math.sin(t), y, cz + r * Math.cos(t)]; };

/* ============ Forma: superficie di Coons ============ */
// coordinate frontali (x, y) → angolo sull'inviluppo (monotona da th0 fino al punto più mediale)
const TH_MAX = 100;   // gradi: il lacerto non gira oltre il margine mediale dell'avambraccio (se x non è raggiungibile a quella quota, il punto sta sul limite)
const thetaDi = (x, y) => { let prev = pos3(C.th0 + 5, y, 0)[0]; for (let th = C.th0 + 5.5; th < 125; th += 0.5) { const xx = pos3(th, y, 0)[0]; if (xx >= x && prev < x) return Math.min(th - 0.5 + 0.5 * (x - prev) / (xx - prev), TH_MAX); prev = xx; } return TH_MAX; };
const lato = pts => { const q = pts.map(([x, y]) => [thetaDi(x, y), y]), p = q.map(([t, y]) => [t * INVILUPPO.R0 * rad, y]), L = [0];   // spline di Catmull-Rom per lunghezza di corda (cm nel piano srotolato)
  for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const tot = L.at(-1);
  return t => { const x = clamp(t, 0, 1) * tot; let i = 0; while (i + 2 < L.length && x > L[i + 1]) i++; const u = (x - L[i]) / (L[i + 1] - L[i]), g = k => q[clamp(k, 0, q.length - 1)], p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), u2 = u * u, u3 = u2 * u;
    return [0, 1].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3)); }; };
const sA = lato(FORMA.A), sB = lato(FORMA.B), sC = lato(FORMA.C), sD = lato(FORMA.D);
const T0p = sA(0), T1p = sA(1), E0 = sB(1), E1 = sC(1);
const coons = (s, u) => { const b = sB(s), c = sC(s), a = sA(u), d = sD(u);
  return [0, 1].map(k => (1 - u) * b[k] + u * c[k] + (1 - s) * a[k] + s * d[k] - ((1 - s) * (1 - u) * T0p[k] + s * (1 - u) * E0[k] + (1 - s) * u * T1p[k] + s * u * E1[k])); };
const { ns: Ns, nu: Nu } = FORMA.mesh;
const grid = [];
// distanza (cm, piano srotolato) dai margini B, C, D
const bordo = []; for (let k = 0; k <= 200; k++) for (const [f, w] of [[sB, 'B'], [sC, 'C'], [sD, 'D']]) { const p = f(k / 200); bordo.push([p[0] * INVILUPPO.R0 * rad, p[1], w]); }
for (let is = 0; is <= Ns; is++) { const row = [];
  for (let iu = 0; iu <= Nu; iu++) { const s = is / Ns, u = iu / Nu, [th, y] = coons(s, u), x = th * INVILUPPO.R0 * rad, d = { B: 1e9, C: 1e9, D: 1e9 };
    for (const [bx, by, w] of bordo) { const dd = Math.hypot(x - bx, y - by); if (dd < d[w]) d[w] = dd; }
    row.push({ th, y, s, u, dB: d.B, dC: d.C, dD: d.D }); }
  grid.push(row); }
const spessore = g => { const T = (FORMA.Tm + (FORMA.T0 - FORMA.Tm) * Math.pow(1 - g.s, 2.5)) * (FORMA.origine + (1 - FORMA.origine) * sstep(0, 0.2, g.s)) + FORMA.labbro * Math.exp(-((g.dB / 0.2) ** 2));
  const e = Math.min(clamp(g.dB / FORMA.bordo.B, 0, 1), clamp(g.dC / FORMA.bordo.C, 0, 1), clamp(g.dD / FORMA.bordo.D, 0, 1)); return Math.max(0, T * Math.sqrt(1 - (1 - e) * (1 - e))); };
const gioco = g => FORMA.gioco - FORMA.incasso * (1 - sstep(0, 0.2, g.s));
const dissolve = g => Math.pow(clamp((g.s - FORMA.dissolvenza.da) / (1 - FORMA.dissolvenza.da), 0, 1), FORMA.dissolvenza.potenza);   // progressiva con la distanza dal tendine lungo le fibre
const pb = grid.map(row => row.map(g => pos3(g.th, g.y, gioco(g), g.s)));   // faccia profonda
const nrm = grid.map((row, i) => row.map((g, j) => { const a = pb[Math.min(Ns, i + 1)][j], b = pb[Math.max(0, i - 1)][j], c = pb[i][Math.min(Nu, j + 1)], d = pb[i][Math.max(0, j - 1)];
  const t1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], t2 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]]; let n = [t1[1] * t2[2] - t1[2] * t2[1], t1[2] * t2[0] - t1[0] * t2[2], t1[0] * t2[1] - t1[1] * t2[0]]; const l = Math.hypot(...n) || 1; n = n.map(v => v / l);
  const [cx, cz] = asse(g.y); if (n[0] * (pb[i][j][0] - cx) + n[2] * (pb[i][j][2] - cz) < 0) n = n.map(v => -v); return n; }));
const pt = grid.map((row, i) => row.map((g, j) => { const t = spessore(g), n = nrm[i][j]; return [pb[i][j][0] + n[0] * t, pb[i][j][1] + n[1] * t, pb[i][j][2] + n[2] * t]; }));   // faccia superficiale
// vertici: i punti sui margini liberi (spessore nullo) sono condivisi tra le due facce
const pos = [], fdir = [], tag = [], bi = new Map(), ti = new Map(), idx = [];
const sulBordo = (is, iu) => is === Ns || iu === 0 || iu === Nu;
const vid = (faccia, is, iu) => { const key = `${is},${iu}`, cond = sulBordo(is, iu), mp = (faccia === 'b' && !cond) ? bi : ti; if (mp.has(key)) return mp.get(key);
  const p = (faccia === 'b' ? pb : pt)[is][iu], id = pos.length / 3; pos.push(p[0], p[1], p[2]);
  const q = pb[Math.min(Ns, is + 1)][iu], q0 = pb[Math.max(0, is - 1)][iu], f = [q[0] - q0[0], q[1] - q0[1], q[2] - q0[2]], l = Math.hypot(...f) || 1; fdir.push(...f.map(v => Math.round(v / l * 127)));   // fibre: lungo le linee del ventaglio
  tag.push(Math.round(255 * clamp(dissolve(grid[is][iu]), 0, 1)));
  mp.set(key, id); if (cond) ti.set(key, id); return id; };
for (let is = 0; is < Ns; is++) for (let iu = 0; iu < Nu; iu++) for (const faccia of ['t', 'b']) {
  const a = vid(faccia, is, iu), b = vid(faccia, is, iu + 1), c = vid(faccia, is + 1, iu + 1), d = vid(faccia, is + 1, iu);
  for (const t of faccia === 't' ? [[a, b, c], [a, c, d]] : [[a, c, b], [a, d, c]]) if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) idx.push(...t); }
// chiusura del lato d'origine (s = 0), dove lo spessore non è nullo: fascia tra faccia superficiale e profonda, con la normale verso l'origine
for (let iu = 0; iu < Nu; iu++) {
  const a = vid('t', 0, iu), b = vid('t', 0, iu + 1), c = vid('b', 0, iu), d = vid('b', 0, iu + 1);
  for (const t of [[a, c, d], [a, d, b]]) {
    if (t[0] === t[1] || t[1] === t[2] || t[0] === t[2]) continue;
    const [p0, p1, p2] = t.map(k => [pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]]), u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]],
      n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], verso = pb[0][iu].map((x, k) => x - pb[1][iu][k]);   // dal corpo verso l'origine
    idx.push(...(n[0] * verso[0] + n[1] * verso[1] + n[2] * verso[2] > 0 ? t : [t[0], t[2], t[1]]));
  }
}
const P = Float32Array.from(pos), I = Uint32Array.from(idx);
{ let vol = 0; for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; }
  if (vol < 0) for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; } }   // triangoli verso l'esterno
log(`lacerto: ${P.length / 3} vertici, ${I.length / 3} triangoli`);

/* ============ Controlli ============ */
const distanzaTubo = (id, p) => { const Q = NVP.pts[id]; let best = 1e9; for (let k = 0; k + 1 < Q.length; k++) { const a = Q[k], b = Q[k + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9, t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2, 0, 1);
  best = Math.min(best, Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2])); } return best - reff(id); };
function controlla(pos, etichetta) {
  const righe = []; let dentro = 0, minF = 1e9, fuori = 0, vicino = 0, maxC = -1e9;
  for (let i = 0; i < pos.length; i += 3) { const f = G.sample(Fp, pos[i], pos[i + 1], pos[i + 2]); if (f < minF) minF = f; if (f < 0) dentro++; const c = G.sample(Fc, pos[i], pos[i + 1], pos[i + 2]); if (c > maxC) maxC = c; if (c > 0) fuori++; if (c > -0.1) vicino++; }
  righe.push(`  strutture profonde: ${dentro} vertici dentro su ${pos.length / 3}, distanza minima ${(minF * 10).toFixed(2)} mm`);
  righe.push(`  cute: ${fuori} vertici fuori (al più ${(Math.max(0, maxC) * 10).toFixed(2)} mm), ${vicino} a meno di 1 mm`);
  for (const id of SUPERFICIALI) { if (!NVP.pts[id]) continue; let best = 1e9; for (let i = 0; i < pos.length; i += 3) { const d = distanzaTubo(id, [pos[i], pos[i + 1], pos[i + 2]]); if (d < best) best = d; } if (best < 0.3) righe.push(`  ${id}: distanza minima dal lacerto ${(best * 10).toFixed(2)} mm`); }
  console.log(`${etichetta}\n${righe.join('\n')}`);
}
if (VERIFICA) { const m = REAL('lacerto'); controlla(m.pos, 'verifica del lacerto nel file'); process.exit(0); }

/* ============ Vene e nervi superficiali: sollevati dove incrociano il lacerto ============ */
// le vene (e i nervi cutanei) corrono sopra il lacerto: dove il loro bordo inferiore scende sotto la faccia superficiale (più il margine) il tracciato
// è spostato verso l'esterno (lontano dall'asse del braccio) di quanto serve, con un profilo a tenda (pendenza limitata) levigato lungo il tubo;
// le estremità (confluenze) restano ferme
function sollevaTubi() {
  // raggio della faccia superficiale per (angolo, quota): la superficie di Coons campionata fitta, in una carta con pixel di 1° × 1 mm
  const Rtop = new Float32Array(nT * nY);
  const FIT = 4;
  for (let is = 0; is <= Ns * FIT; is++) for (let iu = 0; iu <= Nu * FIT; iu++) {
    const s = is / (Ns * FIT), u = iu / (Nu * FIT), [th, y] = coons(s, u), g = { s, dB: 0, dC: 0, dD: 0 };
    // spessore interpolato dalla griglia più vicina
    const gi = grid[Math.round(s * Ns)][Math.round(u * Nu)], t = spessore(gi), p = pos3(th, y, gioco(gi), gi.s), [cx, cz] = asse(y), r = Math.hypot(p[0] - cx, p[2] - cz) + t;
    const it = Math.floor((th - C.th0) / C.dth), jy = Math.floor((y - C.y0) / C.dy);
    if (it >= 0 && it < nT && jy >= 0 && jy < nY && r > Rtop[jy * nT + it]) Rtop[jy * nT + it] = r;
  }
  for (let giro = 0; giro < 2; giro++) { const R2 = Rtop.slice();   // chiude i vuoti tra campioni vicini
    for (let jy = 1; jy < nY - 1; jy++) for (let it = 1; it < nT - 1; it++) if (R2[jy * nT + it] === 0) { let m = 0, k = 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = R2[(jy + b) * nT + it + a]; if (v > 0) { m += v; k++; } } if (k >= 3) Rtop[jy * nT + it] = m / k; } }
  const risultato = [];
  for (const id of SUPERFICIALI) { const Q = NVP.pts[id]; if (!Q) continue; const r = reff(id), n = Q.length;
    const arco = [0]; for (let k = 1; k < n; k++) arco.push(arco[k - 1] + Math.hypot(Q[k][0] - Q[k - 1][0], Q[k][1] - Q[k - 1][1], Q[k][2] - Q[k - 1][2]));
    const serve = new Float32Array(n);
    for (let k = 0; k < n; k++) { const [cx, cz] = asse(Q[k][1]), dx = Q[k][0] - cx, dz = Q[k][2] - cz, rp = Math.hypot(dx, dz), th = Math.atan2(dx, dz) / rad;
      const it = Math.floor((th - C.th0) / C.dth), jy = Math.floor((Q[k][1] - C.y0) / C.dy); if (it < 0 || it >= nT || jy < 0 || jy >= nY) continue;
      let top = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i2 = it + a, j2 = jy + b; if (i2 >= 0 && i2 < nT && j2 >= 0 && j2 < nY) top = Math.max(top, Rtop[j2 * nT + i2]); }
      if (top > 0) serve[k] = Math.max(0, top + MARGINE.vene - (rp - r)); }
    if (!serve.some(v => v > 1e-4)) continue;
    // profilo a tenda: pendenza limitata (SOLLEVA.pendenza cm per cm di tracciato), poi levigatura
    const tenda = new Float32Array(n); for (let k = 0; k < n; k++) { let m = 0; for (let j = 0; j < n; j++) { const v = serve[j] - SOLLEVA.pendenza * Math.abs(arco[j] - arco[k]); if (v > m) m = v; } tenda[k] = m * 1.1; }
    const lisc = new Float32Array(n); for (let k = 0; k < n; k++) { let sm = 0, w = 0; for (let j = 0; j < n; j++) { const d = arco[j] - arco[k]; if (Math.abs(d) > 3 * SOLLEVA.sigma) continue; const g = Math.exp(-0.5 * (d / SOLLEVA.sigma) ** 2); sm += g * tenda[j]; w += g; } lisc[k] = sm / w; }
    let massimo = 0;
    for (let k = 0; k < n; k++) { const fermo = sstep(0, SOLLEVA.fermo, Math.min(arco[k], arco.at(-1) - arco[k])), spost = lisc[k] * fermo; if (spost < 1e-5) continue;
      const [cx, cz] = asse(Q[k][1]), dx = Q[k][0] - cx, dz = Q[k][2] - cz, l = Math.hypot(dx, dz) || 1;   // verso l'esterno, lontano dall'asse
      Q[k] = [Q[k][0] + dx / l * spost, Q[k][1], Q[k][2] + dz / l * spost]; massimo = Math.max(massimo, spost); }
    if (massimo > 0) { NVP.pts[id] = Q.map(p => p.map(x => Math.round(x * 1000) / 1000)); risultato.push(`${id} sollevata di al più ${(massimo * 10).toFixed(1)} mm`); }
  }
  return risultato;
}
const sollevate = sollevaTubi();
for (const r of sollevate) log(r);
G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
controlla(P, 'controlli sul nuovo lacerto');

/* ============ Scrittura ============ */
setMesh('lacerto', { pos: P, idx: I, tag: Uint8Array.from(tag), fdir: Int8Array.from(fdir) });
// la pagina applica il tag come opacità dei vertici del lacerto (dissolvenza verso la fascia) e dà al lacerto un po' più di luce e di opacità di base:
// modifica una tantum di finishGeo() e makeMat() (le costanti LACERTO_FADE e LACERTO_LUCE si possono cambiare a mano)
if (!G.M.html.includes('LACERTO_FADE')) {
  const vecchio = "  const tag=g.userData.tag;\n  if(s.cat==='ossa'&&tag){", nuovo = `  const tag=g.userData.tag;
  if(s.id==='lacerto'&&tag){ /* dissolvenza verso la fascia antibrachiale: il tag (0-255) abbassa l'opacità dei vertici */
    const c4=new Float32Array(n*4);for(let i=0;i<n;i++){c4[4*i]=c4[4*i+1]=c4[4*i+2]=LACERTO_LUCE;c4[4*i+3]=1-LACERTO_FADE*sstep(0,1,tag[i]/255);}
    col=new THREE.BufferAttribute(c4,4);g.setAttribute('color',col);
  }
  if(s.cat==='ossa'&&tag){`;
  if (!G.M.html.includes(vecchio)) throw new Error('finishGeo non trovata nella pagina');
  G.M.html = G.M.html.replace(vecchio, () => nuovo).replace('const THMAP=', () => `const LACERTO_FADE=${PAGINA.fade},LACERTO_LUCE=${PAGINA.luce};\nconst THMAP=`);
}
G.M.html = G.M.html.replace(/const LACERTO_FADE=[0-9.]+,LACERTO_LUCE=[0-9.]+;/, () => `const LACERTO_FADE=${PAGINA.fade},LACERTO_LUCE=${PAGINA.luce};`);
G.M.html = G.M.html.replace("m.opacity=s.id==='lacerto'?0.82:0.94;", () => `m.opacity=s.id==='lacerto'?${PAGINA.opacita}:0.94;`);
// il lacerto è una lamina sottile e in parte quasi trasparente: non deve ombreggiare i muscoli sotto (né con l'ombra portata né con l'occlusione ambientale
// precalcolata, che li scuriva fino al nero dove la lamina è trasparente) e non riceve l'occlusione ambientale (resterebbe grigio scuro)
{ const ao = "if(SKIP.has(s.cat))return;", ao2 = "if(SKIP.has(s.cat)||s.id==='lacerto')return;";
  if (!G.M.html.includes(ao2)) G.M.html = G.M.html.split("items.forEach(({s,g})=>{" + ao).join("items.forEach(({s,g})=>{" + ao2);
  if (!G.M.html.includes("m.castShadow=!tr&&s.id!=='lacerto';")) G.M.html = G.M.html.replace("m.castShadow=!tr;", () => "m.castShadow=!tr&&s.id!=='lacerto';"); }
G.saveFile(G.repack());
