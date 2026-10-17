/* Arterie del gomito e dell'avambraccio prossimale (modelli/gomito-3d.html): brachiale, radiale, ulnare, interossea comune, anteriore e
   posteriore, collaterali ulnari superiore e inferiore, collaterale radiale, ricorrenti radiale e ulnari (anteriore e posteriore).

   Uso (dalla cartella del progetto):
     node strumenti/arterie-gomito.mjs              → riscrive i tubi `a_*` (NVP: punti, raggio massimo `r` e profilo `rp`) nel file del modello
     MODELLO=/tmp/copia.html node strumenti/arterie-gomito.mjs   → lavora su una copia
     node strumenti/arterie-gomito.mjs verifica     → non scrive: distanze delle arterie attuali dal resto del modello

   Metodo e parametri: GUIDA_MODELLI.md. Da lanciare dopo `vene-gomito.mjs` e `nervi-gomito.mjs` (nervi e vene si leggono dal file e sono ostacoli:
   le arterie restano nel canale tra le comitanti). Riparte sempre dalle guide in tabella `PERCORSI`, quindi si può rilanciare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { clamp, sstep, log } = G;

const argv = process.argv.slice(2);
const VERIFICA = argv.includes('verifica');
const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);

/* ============ Tabelle ============ */
// Percorsi (cm; x mediale +, y prossimale +, z anteriore +), in ordine di flusso. Un percorso può contenere più tubi (tronco brachiale → ulnare,
// interossea comune → anteriore) o un'arcata (ricorrente + collaterale che si incontrano: anastomosi, un'unica curva senza angoli).
//   padre: percorso da cui nasce (il primo punto viene proiettato sull'asse del padre); fine: idem per l'ultimo punto (arcate)
//   tang0: [a, b] direzione di partenza = a · tangente del padre + b · direzione verso il resto del tracciato; 'perp' = perpendicolare al padre (ricorrenti)
//   fissoIni/fissoFin: l'estremo sta sul piano di taglio (y fisso)
//   turno: svolta massima (gradi) tra segmenti di 1 mm
const PERCORSI = {
  T1: { fissoIni: true, fissoFin: true, turno: 3.2, g: [[2.91, 11.93, 1.12], [2.87, 11.07, 0.94], [2.82, 10.18, 0.85], [2.74, 9.3, 0.84], [2.61, 8.42, 0.91], [2.45, 7.59, 1.15], [2.3, 6.81, 1.54], [2.17, 5.99, 1.86], [1.96, 5.15, 2.08], [1.65, 4.34, 2.26], [1.34, 3.53, 2.43], [1.05, 2.71, 2.6], [0.74, 1.91, 2.75], [0.55, 1.07, 2.75], [0.5, 0.26, 2.6], [0.45, -0.7, 2.3], [0.3, -1.7, 1.9], [0.06, -2.62, 1.51], [-0.02, -3.47, 1.45], [0.12, -4.32, 1.38], [0.29, -5.16, 1.38], [0.39, -6.02, 1.35], [0.37, -6.88, 1.35], [0.32, -7.73, 1.47], [0.29, -8.56, 1.7], [0.38, -9.38, 1.95], [0.59, -10.2, 2.12], [0.69, -11.04, 2.01], [0.51, -11.83, 1.72]] },
  RAD: { padre: 'T1', fissoFin: true, turno: 3.6, tang0: [1, 1], g: [[0.06, -2.62, 1.51], [-0.76, -2.86, 1.5], [-1.56, -3.07, 1.79], [-2.15, -3.48, 2.31], [-2.49, -4.08, 2.86], [-2.6, -4.86, 3.26], [-2.65, -5.72, 3.51], [-2.75, -6.58, 3.7], [-2.85, -7.45, 3.86], [-2.94, -8.32, 4.02], [-3.02, -9.19, 4.16], [-3.08, -10.07, 4.3], [-3.14, -10.95, 4.41], [-3.18, -11.83, 4.51]] },
  T2: { padre: 'T1', fissoFin: true, turno: 5, tang0: [1, 1], g: [[-0.03, -3.4, 1.47], [-0.07, -3.94, 1.46], [-0.25, -4.45, 1.51], [-1.12, -4.78, 1.63], [-1.75, -5.45, 1.43], [-2.04, -6.33, 1.31], [-2.2, -7.26, 1.31], [-2.29, -8.19, 1.47], [-2.34, -9.12, 1.66], [-2.35, -10.05, 1.86], [-2.32, -10.98, 2.02], [-2.33, -11.89, 2.25]] },
  PIA: { padre: 'T2', fissoFin: true, turno: 5, tang0: [1, 1], g: [[-0.25, -4.45, 1.51], [-1.05, -4.65, 1.13], [-1.58, -4.98, 0.46], [-2.15, -5.51, -0.01], [-2.53, -6.33, 0.04], [-2.52, -7.24, 0.17], [-2.37, -8.14, 0.1], [-2.28, -9.06, 0.16], [-2.3, -9.96, 0.32], [-2.35, -10.86, 0.53], [-2.39, -11.76, 0.74]] },
  // arcata radiale: ricorrente radiale (dalla radiale verso l'alto) + collaterale radiale (dal piano di taglio, dalla profonda del braccio), unite nell'anastomosi M
  ARC_R: { padre: 'RAD', fissoFin: true, turno: 7, tang0: 'perp', g: [[-1.24, -3.13, 2.06], [-1.9, -2.5, 2.0], [-1.77, -1.7, 2.15], [-1.45, -0.9, 2.3], [-1.35, -0.1, 2.3], [-1.55, 0.7, 2.1], [-1.85, 1.3, 1.75], [-1.97, 1.79, 0.75], [-1.74, 2.51, 0.34], [-1.63, 3.34, 0.14], [-1.41, 4.14, -0.02], [-1.32, 4.98, 0.16], [-1.1, 5.72, -0.09], [-0.51, 6.16, -0.51], [-0.38, 7.01, -0.63], [-0.35, 7.84, -0.88], [-0.24, 8.69, -0.97], [-0.01, 9.52, -0.98], [0.36, 10.29, -1.09], [0.75, 11.07, -1.12], [0.98, 11.89, -1.24]], iM: 6.5 },
  // arcata ulnare anteriore: ricorrente ulnare anteriore (dall'ulnare) + collaterale ulnare inferiore (dalla brachiale)
  ARC_UA: { padre: 'T1', fine: 'T1', turno: 7, tang0: 'perp', g: [[-0.03, -3.4, 1.47], [0.23, -2.6, 1.65], [0.9, -2.03, 1.8], [1.28, -1.24, 1.79], [2.06, -0.88, 1.55], [2.77, -0.51, 1.16], [3.12, 0.29, 1.02], [3.07, 0.66, 0.04], [3.01, 1.37, 0.47], [2.85, 2.14, 0.72], [2.53, 2.78, 1.1], [2.27, 3.54, 1.33], [2.07, 4.28, 1.65], [1.88, 4.91, 2.13]], iM: 6.5 },
  // arcata ulnare posteriore: ricorrente ulnare posteriore (dall'ulnare) + collaterale ulnare superiore (dalla brachiale), dietro l'epicondilo mediale
  ARC_UP: { padre: 'T1', fine: 'T1', turno: 7, tang0: 'perp', g: [[0, -3.66, 1.43], [0.51, -3.08, 0.83], [0.93, -2.37, 0.3], [1.44, -1.62, -0.06], [1.99, -0.84, -0.3], [2.47, -0.04, -0.62], [2.67, 1.71, -0.51], [2.77, 2.64, -0.58], [2.91, 3.56, -0.56], [3.05, 4.47, -0.44], [3.11, 5.39, -0.32], [3.14, 6.31, -0.19], [3.17, 7.23, -0.02], [3.14, 8.08, 0.35], [2.65, 8.64, 0.88]], iM: 5.5 },
};
// Tubi (strutture della pagina). `p`: percorso; `da`/`a`: indice del primo/ultimo punto o 'M' (anastomosi) o 'nodo:<percorso figlio>' (biforcazione sul tronco);
// `d`: diametri in mm [inizio, fine] (interpolazione lineare lungo il tubo); `ov`: cm di sovrapposizione con il tubo che precede (continuazione del tronco).
// Diametri (mm): brachiale ~4–4,5 al gomito; radiale e ulnare prossimali ~2,7 e ~3,2 (l'ulnare è il ramo maggiore; area dei due rami ≈ area della brachiale; nell'avambraccio
// distale l'eco dà ~2,0–2,3 per entrambe); interossea comune ~1,9; anteriore 1,1–1,4 (0,9–1,5 mm all'origine nello studio sul lembo interosseo anteriore, 44 arti, PubMed 7717663),
// posteriore 1,0–1,3; ricorrente radiale ~1,8 (2,5 ± 0,6 mm all'origine, diametro esterno, in 40 arti di cadavere, 2023); collaterali e ricorrenti ulnari 1,0–1,7 (stima: nessun dato
// morfometrico affidabile trovato).
const TUBI = {
  a_brachiale: { p: 'T1', da: 0, a: 'nodo:RAD', d: [4.5, 4.2] },
  a_ulnare: { p: 'T1', da: 'nodo:RAD', a: 'fine', ov: 1.0, d: [4.2, 2.5], spalla: [3.2, 1.5] },
  a_radiale: { p: 'RAD', da: 0, a: 'fine', d: [2.7, 2.2], tromba: 'T1' },
  a_interossea_comune: { p: 'T2', da: 0, a: 'nodo:PIA', d: [1.9, 1.9], tromba: 'T1' },
  a_interossea_ant: { p: 'T2', da: 'nodo:PIA', a: 'fine', ov: 0.5, d: [1.9, 1.15], spalla: [1.4, 0.8] },
  a_interossea_post: { p: 'PIA', da: 0, a: 'fine', d: [1.3, 1.0], tromba: 'T2' },
  a_ricorrente_radiale: { p: 'ARC_R', da: 0, a: 'M', ovFin: 0.4, d: [1.8, 1.3], tromba: 'RAD' },
  a_collat_radiale: { p: 'ARC_R', da: 'fine', a: 'M', rev: true, d: [1.9, 1.3] },
  a_ricorrente_ulnare_ant: { p: 'ARC_UA', da: 0, a: 'M', ovFin: 0.4, d: [1.3, 1.0], tromba: 'T1' },
  a_collat_ulnare_inf: { p: 'ARC_UA', da: 'fine', a: 'M', rev: true, d: [1.4, 1.0], tromba: 'T1' },
  a_ricorrente_ulnare_post: { p: 'ARC_UP', da: 0, a: 'M', ovFin: 0.4, d: [1.5, 1.1], tromba: 'T1' },
  a_collat_ulnare_sup: { p: 'ARC_UP', da: 'fine', a: 'M', rev: true, d: [1.7, 1.1], tromba: 'T1' },
};
const PASSO = 0.1;                 // cm, campionamento dei tracciati
const K_PROF = 0.8, GIOCO = 0.03, GIOCO_VASO = 0.03;   // frazione del raggio libera dalle strutture; cm
const TAIL = 1.6;                  // cm: raccordo tangente all'origine dei rami
const ITER = Number(process.env.ITER || 250);
const ESENTI = 1.2;                // cm: due arterie imparentate si possono sfiorare entro questa distanza dal punto di diramazione

/* ============ Geometria ============ */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return mul(a, 1 / l); };
function catmull(W, passo) {
  const out = []; const n = W.length, P = i => W[clamp(i, 0, n - 1)];
  for (let s = 0; s < n - 1; s++) {
    const p0 = s === 0 ? sub(mul(W[0], 2), W[1]) : P(s - 1), p1 = W[s], p2 = W[s + 1], p3 = s + 2 >= n ? sub(mul(W[n - 1], 2), W[n - 2]) : P(s + 2), m = 24;
    for (let u = 0; u < m; u++) { const t = u / m, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))); }
  }
  out.push(W[n - 1]); return risampiona(out, passo);
}
function risampiona(P, passo) {
  const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1])));
  const L = c[c.length - 1], n = Math.max(3, Math.round(L / passo)), out = []; let k = 0;
  for (let i = 0; i <= n; i++) { const s = L * i / n; while (k < c.length - 2 && c[k + 1] < s) k++; const u = (s - c[k]) / ((c[k + 1] - c[k]) || 1); out.push(add(P[k], mul(sub(P[k + 1], P[k]), u))); }
  return out;
}
const arco = P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1]))); return c; };
function proiezione(P, q) {   // punto più vicino di una polilinea: { p, s (cm d'arco), d, i, tang }
  let bd = 1e18, bi = 0, bu = 0;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], L2 = ux * ux + uy * uy + uz * uz || 1e-12;
    let u = ((q[0] - a[0]) * ux + (q[1] - a[1]) * uy + (q[2] - a[2]) * uz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const dx = q[0] - a[0] - ux * u, dy = q[1] - a[1] - uy * u, dz = q[2] - a[2] - uz * u, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bd) { bd = d2; bi = i; bu = u; }
  }
  const a = P[bi], b = P[bi + 1], ab = sub(b, a), ar = arco(P);
  return { p: add(a, mul(ab, bu)), d: Math.sqrt(bd), i: bi, s: ar[bi] + bu * (ar[bi + 1] - ar[bi]), tang: nrm(ab) };
}

/* ============ Campi (ostacoli) ============ */
const SHEET = ['lacerto', 'cet', 'osborne', 'mio', 'setto_med', 'setto_lat', 'quadrato', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'lucl', 'anulare', 'caps', 'bor_olecr', 'bor_bicrad', 'cart_omero', 'cart_ulna', 'cart_radio'];
G.griglia([-6.4, -12.2, -5.0], [4.6, 12.2, 6.1], 0.08, 0);
const tutte = G.man.meshes.map(m => m.n).filter((n, i, a) => a.indexOf(n) === i);
const SOLIDI = tutte.filter(n => n !== 'cute' && !SHEET.includes(n));
const BANDA = 0.22;
log('campi: strutture profonde');
const Fs = (() => { const M = G.unione(SOLIDI), { F } = G.sdf(M); G.esatta(F, SOLIDI, BANDA); for (let q = 0; q < G.N; q++) if (Math.abs(F[q]) <= BANDA) F[q] = (M[q] ? -1 : 1) * Math.abs(F[q]); return F; })();
const Fh = (() => { const F = new Float32Array(G.N).fill(5); G.esatta(F, SHEET, BANDA); for (let q = 0; q < G.N; q++) F[q] = Math.abs(F[q]); return F; })();
const MARGINE_LAMINE = 0.1;   // le lamine sottili (setti, membrana interossea) si possono sfiorare di poco: l'arteria non deve seguirne il bordo
const profondo = p => Math.min(G.sample(Fs, p[0], p[1], p[2]), G.sample(Fh, p[0], p[1], p[2]) + MARGINE_LAMINE);
const gradP = p => G.grad({ s: profondo }, p, 0.05);

// nervi e vene (ostacoli): le comitanti di radiale e ulnare delimitano il canale delle arterie
const ALTRI = {};
for (const [id, P] of Object.entries(NVP.pts)) if (!id.startsWith('a_')) {
  const pts = risampiona(P, 0.1), r = NVP.r[id] * 1.05;
  ALTRI[id] = { pts, r, lo: [0, 1, 2].map(k => Math.min(...pts.map(p => p[k])) - r - 0.6), hi: [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])) + r + 0.6) };
}

/* ============ Raggi ============ */
const rt = (id, s, L) => { const t = TUBI[id]; return (t.d[0] + (t.d[1] - t.d[0]) * clamp(s / L, 0, 1)) / 20; };   // raggio in cm da diametro in mm
const RAGGIO_STIMA = { T1: 0.2, RAD: 0.13, T2: 0.09, PIA: 0.06, ARC_R: 0.08, ARC_UA: 0.06, ARC_UP: 0.07 };

/* ============ Tracciati ============ */
const V = {};
for (const [id, d] of Object.entries(PERCORSI)) V[id] = { id, d, P: catmull(d.g, PASSO), G0: null };
for (const v of Object.values(V)) v.G0 = v.P.map(p => p.slice());
const figli = id => Object.values(V).filter(v => v.d.padre === id || v.d.fine === id);
function giunzioni() {   // [{ v (figlio), estremo: 0|1, padre }]
  const out = [];
  for (const v of Object.values(V)) { if (v.d.padre) out.push({ v, e: 0, padre: V[v.d.padre] }); if (v.d.fine) out.push({ v, e: 1, padre: V[v.d.fine] }); }
  return out;
}
function raccordi() {   // i primi/ultimi punti dei rami partono dall'asse del padre con una curva di Hermite tangente (o perpendicolare, per le ricorrenti)
  for (const g of giunzioni()) {
    const X = g.v, P = g.padre, n = X.P.length, k = Math.min(n - 3, Math.round(TAIL / PASSO)), ini = g.e === 0, e0 = ini ? 0 : n - 1;
    const proj = proiezione(P.P, X.P[e0]), iK = ini ? k : n - 1 - k, pk = X.P[iK];
    let t0 = proj.tang;   // verso del flusso del padre
    const dirk = nrm(sub(pk, proj.p)), lat = nrm(sub(dirk, mul(t0, dot(dirk, t0))));
    let T;
    const tg = X.d.tang0 || [1, 1];
    if (tg === 'perp') T = nrm(add(mul(lat, 1), mul(t0, 0.35)));
    else T = nrm(add(mul(t0, tg[0]), mul(dirk, tg[1])));
    const d = len(sub(pk, proj.p)), tk = nrm(sub(X.P[Math.min(n - 1, iK + 1)], X.P[Math.max(0, iK - 1)]));
    // verso di percorrenza: ini → dall'asse del padre al tracciato; fine → dal tracciato verso l'asse del padre (tangente invertita)
    const A = ini ? proj.p : pk, B = ini ? pk : proj.p, mA = ini ? mul(T, d) : mul(tk, d), mB = ini ? mul(tk, d) : mul(mul(T, -1), d);
    for (let j = 0; j <= k; j++) { const u = j / k, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
      const H = [0, 1, 2].map(c => h00 * A[c] + h10 * mA[c] + h01 * B[c] + h11 * mB[c]), i = ini ? j : n - 1 - k + j;
      if (ini ? j === k : j === 0) continue;
      X.P[i] = H.slice(); }
    X.P[e0] = proj.p.slice();
  }
}
const inGiunzione = (a, b, pa, pb) => giunzioni().some(g => ((g.v.id === a && g.padre.id === b) || (g.v.id === b && g.padre.id === a)) && (() => { const X = g.v, P = g.padre, e0 = g.e === 0 ? X.P[0] : X.P[X.P.length - 1], nodo = proiezione(P.P, e0).p; return len(sub(pa, nodo)) < ESENTI && len(sub(pb, nodo)) < ESENTI; })());
const fratelli = (a, b) => { const A = V[a].d, B = V[b].d; return (A.padre && A.padre === B.padre) || (A.fine && A.fine === B.fine) || (A.padre && A.padre === B.fine) || (A.fine && A.fine === B.padre); };
function ottimizza(iter, liscio = 2) {   // liscio: passate di levigatura per iterazione (le ultime iterazioni ne usano di più: tracciati senza ondulazioni)
  const ids = Object.keys(V);
  for (let it = 0; it < iter; it++) {
    const passe = it >= iter - 80 ? liscio * 4 : liscio;
    for (const id of ids) {
      const v = V[id], P = v.P, n = P.length, r = RAGGIO_STIMA[id], cd = K_PROF * r + GIOCO;
      const D = P.map(() => [0, 0, 0]);
      for (let i = 0; i < n; i++) {
        const p = P[i]; let f = [0, 0, 0];
        const dp = profondo(p); if (dp < cd) { const g = gradP(p), l = len(g) || 1; f = add(f, mul(g, 0.3 * (cd - dp) / l)); }
        for (const o of Object.values(ALTRI)) {
          if (p[0] < o.lo[0] || p[0] > o.hi[0] || p[1] < o.lo[1] || p[1] > o.hi[1] || p[2] < o.lo[2] || p[2] > o.hi[2]) continue;
          const q = proiezione(o.pts, p), need = r + o.r + GIOCO_VASO;
          if (q.d < need) { const dir = q.d > 1e-4 ? mul(sub(p, q.p), 1 / q.d) : [0, 0, 1]; f = add(f, mul(dir, 0.4 * (need - q.d))); }
        }
        for (const id2 of ids) {
          if (id2 === id) continue; const w = V[id2], q = proiezione(w.P, p), need = r + RAGGIO_STIMA[id2] + GIOCO_VASO;
          if (q.d < need && !inGiunzione(id, id2, p, q.p) && !(fratelli(id, id2) && q.d < ESENTI * 0.5)) { const dir = q.d > 1e-4 ? mul(sub(p, q.p), 1 / q.d) : [0, 0, 1]; f = add(f, mul(dir, 0.3 * (need - q.d))); }
        }
        f = add(f, mul(sub(v.G0[i], p), 0.02));
        if ((i === 0 && v.d.fissoIni) || (i === n - 1 && v.d.fissoFin)) f[1] = 0;
        D[i] = f;
      }
      let Q = P.map((p, i) => add(p, D[i]));
      for (let pass = 0; pass < passe; pass++) Q = Q.map((p, i) => { if (i === 0 || i === n - 1) return p; const m = mul(add(Q[i - 1], Q[i + 1]), 0.5); return add(p, mul(sub(m, p), 0.5)); });
      for (let pass = 0; pass < 3; pass++) { const R = Q.map(p => p.slice());
        for (let i = 1; i < n - 1; i++) { const a = nrm(sub(Q[i], Q[i - 1])), b = nrm(sub(Q[i + 1], Q[i])), th = Math.acos(clamp(dot(a, b), -1, 1)) * 180 / Math.PI;
          if (th > v.d.turno) { const w = Math.min(1, (th - v.d.turno) / v.d.turno); R[i] = add(Q[i], mul(sub(mul(add(Q[i - 1], Q[i + 1]), 0.5), Q[i]), w)); } }
        Q = R; }
      for (let i = 0; i < n; i++) { const fissoY = (i === 0 && v.d.fissoIni) || (i === n - 1 && v.d.fissoFin); P[i] = Q[i]; if (fissoY) P[i][1] = v.G0[i][1]; }
    }
    raccordi();
    if (it % 50 === 0) log('iterazione', it);
  }
}
if (!VERIFICA) { log('ottimizzazione'); raccordi(); ottimizza(ITER); for (const v of Object.values(V)) v.P = risampiona(v.P, PASSO); raccordi(); }

/* ============ Tubi: punti e raggi ============ */
// indice del punto di anastomosi M (punto più vicino alla guida iM) e nodi di diramazione (sul padre, proiezione dell'estremo del figlio)
const T = {};   // id → { P, r: [..] (cm, per punto), t: ... }
const nodoIdx = (p, figlio) => { const e = figlio.d.padre === p.id ? figlio.P[0] : figlio.P[figlio.P.length - 1]; return proiezione(p.P, e).i + 1; };
for (const [id, s] of Object.entries(TUBI)) {
  const v = V[s.p]; let n = v.P.length;
  const nodo = k => { const m = /^nodo:(.+)$/.exec(k); return nodoIdx(v, V[m[1]]); };
  const gM = v.d.iM !== undefined ? (() => { const i = Math.floor(v.d.iM), f = v.d.iM - i; return add(mul(v.d.g[i], 1 - f), mul(v.d.g[Math.min(v.d.g.length - 1, i + 1)], f)); })() : null;
  const iM = gM ? Math.round(proiezione(v.P, gM).s / PASSO) : null;
  const idx = k => k === 'fine' ? n - 1 : k === 'M' ? iM : typeof k === 'number' ? k : nodo(k);
  let a = idx(s.da), b = idx(s.a);
  if (s.rev) { [a, b] = [b, a]; }
  const ov = s.ov ? Math.round(s.ov / PASSO) : 0, of = s.ovFin ? Math.round(s.ovFin / PASSO) : 0;
  let pts = a <= b ? v.P.slice(Math.max(0, a - ov), Math.min(n, b + 1 + of)) : v.P.slice(b, a + 1).reverse();
  T[id] = { P: pts.map(p => p.slice()), ov: a <= b ? a - Math.max(0, a - ov) : 0, of: a <= b ? Math.min(n, b + 1 + of) - (b + 1) : 0 };
}
// raggi per punto
for (const [id, s] of Object.entries(TUBI)) {
  const tb = T[id], P = tb.P, c = arco(P), L = c.at(-1), Lc = L - (tb.ov + tb.of) * PASSO;
  tb.r = P.map((p, i) => {
    const sc = c[i] - tb.ov * PASSO;   // cm dall'inizio "vero" del tubo (negativo nella sovrapposizione)
    let r = (s.d[0] + (s.d[1] - s.d[0]) * clamp(sc / Lc, 0, 1)) / 20;
    if (sc > Lc) r = 0.985 * s.d[1] / 20;   // coda sovrapposta all'altro ramo dell'anastomosi (nascosta dentro)
    if (s.spalla) {   // continuazione del tronco: nella sovrapposizione il raggio è il 98,5% di quello del tubo che precede, poi scende al calibro del ramo (`spalla[1]` cm)
      const r0 = 0.985 * s.d[0] / 20, rr = (s.spalla[0] + (s.d[1] - s.spalla[0]) * clamp(sc / Lc, 0, 1)) / 20;
      r = sc <= 0 ? r0 : r0 + (rr - r0) * sstep(0, s.spalla[1], sc);
    }
    return r;
  });
}
// il tronco che continua (brachiale → ulnare, interossea comune → anteriore): il tubo che precede finisce dentro il successivo (raggio uguale al 98,5%)
for (const [id, tb] of Object.entries(T)) { const c = arco(tb.P), s0 = TUBI[id].spalla ? TUBI[id].spalla[1] : 0;   // calibro vero: senza la svasatura all'origine né la sovrapposizione con il tronco
  tb.rBase = Math.max(...tb.r.filter((r, i) => c[i] - tb.ov * PASSO >= s0 - 1e-9)); }
// tromba (svasatura) all'origine dei rami: il raggio parte vicino a quello del padre e scende al calibro del ramo, così non c'è un gradino
for (const [id, s] of Object.entries(TUBI)) {
  if (!s.tromba) continue;
  const tb = T[id], P = tb.P, c = arco(P), r0 = tb.r[0];
  // raggio del padre nel punto d'origine: il più grande tra i tubi del percorso padre che lo contengono
  let rPadre = 0; for (const [k, t] of Object.entries(TUBI)) if (t.p === s.tromba) { const q = proiezione(T[k].P, P[0]); if (q.d < 0.02) rPadre = Math.max(rPadre, T[k].r[Math.min(T[k].P.length - 1, Math.round(q.s / PASSO))]); }
  const A = clamp(0.85 * rPadre / r0 - 1, 0, 0.7), Lf = 2.6 * r0 + 0.1;
  tb.r = tb.r.map((r, i) => r * (1 + A * Math.max(0, 1 - c[i] / Lf) ** 2));
}
// profilo del raggio relativo (campioni a 1 mm) e raggio massimo
const rmax = {}, rp = {}, pts = {};
for (const [id, tb] of Object.entries(T)) {
  const m = tb.rBase; rmax[id] = Math.round(m * 1000) / 1000;
  const L = arco(tb.P).at(-1), M = Math.max(25, Math.ceil(L / 0.1) + 1), c = arco(tb.P);
  const prof = []; let k = 0;
  for (let j = 0; j < M; j++) { const s = L * j / (M - 1); while (k < c.length - 2 && c[k + 1] < s) k++; const u = (s - c[k]) / ((c[k + 1] - c[k]) || 1); prof.push(Math.round((tb.r[k] + (tb.r[k + 1] - tb.r[k]) * u) / m * 1000) / 1000); }
  rp[id] = prof; pts[id] = tb.P.map(p => p.map(x => Math.round(x * 1000) / 1000));
}

/* ============ Verifica ============ */
function statistiche() {
  const righe = [];
  for (const id of Object.keys(T)) {
    const tb = T[id], P = tb.P; let nD = 0, mD = 9, nV = 0, mV = 9, pe = '', svolta = 0, rc = 1e9;
    for (let i = 0; i < P.length; i++) { const p = P[i], r = tb.r[i], dp = profondo(p) - K_PROF * r; if (dp < -0.002) nD++; mD = Math.min(mD, dp);
      for (const [oid, o] of Object.entries(ALTRI)) { if (p[0] < o.lo[0] || p[0] > o.hi[0] || p[1] < o.lo[1] || p[1] > o.hi[1] || p[2] < o.lo[2] || p[2] > o.hi[2]) continue; const d = proiezione(o.pts, p).d - r - o.r; if (d < -0.002) nV++; if (d < mV) { mV = d; pe = oid; } } }
    for (let i = 1; i < P.length - 1; i++) { const th = Math.acos(clamp(dot(nrm(sub(P[i], P[i - 1])), nrm(sub(P[i + 1], P[i]))), -1, 1)); svolta = Math.max(svolta, th * 180 / Math.PI); rc = Math.min(rc, th > 1e-6 ? PASSO / th : 1e9); }
    righe.push(`${id.padEnd(26)} r ${(rmax[id] * 20).toFixed(1).padStart(4)} mm  svolta max ${svolta.toFixed(1).padStart(4)}°/mm  R curv min ${rc.toFixed(2)} cm  punti ${String(P.length).padStart(3)}  profondo<0: ${String(nD).padStart(3)} (min ${(mD * 10).toFixed(1)} mm)  nervi/vene<0: ${String(nV).padStart(3)} (min ${(mV * 10).toFixed(1)} mm ${pe})`);
  }
  return righe.join('\n');
}
if (VERIFICA) {
  for (const id of Object.keys(NVP.pts).filter(k => k.startsWith('a_'))) { const P = NVP.pts[id], rm = NVP.r[id], rpv = NVP.rp?.[id];
    T[id] = { P, r: P.map((p, i) => rm * (rpv ? rpv[Math.round(i / (P.length - 1) * (rpv.length - 1))] : 1)) }; rmax[id] = rm; }
  console.log(statistiche()); process.exit(0);
}
log('statistiche'); console.log(statistiche());
if (argv.includes('prova')) { const { writeFileSync } = await import('node:fs'); writeFileSync(argv.find(a => a.startsWith('--prova='))?.split('=')[1] || 'arterie-prova.json', JSON.stringify({ pts, r: rmax, rp })); process.exit(0); }

/* ============ Scrittura ============ */
for (const id of Object.keys(TUBI)) { NVP.pts[id] = pts[id]; NVP.r[id] = rmax[id]; NVP.rp = NVP.rp || {}; NVP.rp[id] = rp[id]; }
G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
G.saveFile(G.repack());
