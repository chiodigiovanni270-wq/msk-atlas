/* Vene del gomito (modelli/gomito-3d.html): cefalica, basilica, mediana del gomito, mediana dell'avambraccio, mediane cefalica e basilica,
   perforante, comitanti della brachiale (mediale e laterale) e comitanti di radiale e ulnare.

   Uso (dalla cartella del progetto):
     node strumenti/vene-gomito.mjs              → riscrive i tubi `v_*` (NVP, raggi e profilo dei raggi `rp`) nel file del modello
     MODELLO=/tmp/copia.html node strumenti/vene-gomito.mjs   → lavora su una copia
     node strumenti/vene-gomito.mjs verifica     → non scrive: distanze delle vene dal resto del modello

   Metodo e parametri: GUIDA_MODELLI.md. Va lanciato per ultimo nella catena del gomito (dopo flessori-pronatori-gomito.mjs, che riparte dai
   tubi della revisione di partenza e quindi cancella queste vene). Le ossa, i muscoli e gli altri vasi si leggono dal file e non si toccano:
   le vene si adattano agli spazi liberi. Riparte sempre dalle guide in tabella `VENE`, quindi si può rilanciare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { clamp, sstep, log } = G;

const argv = process.argv.slice(2);
const VERIFICA = argv.includes('verifica');
const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);

/* ============ Tabelle ============ */
// Guide (cm; x mediale +, y prossimale +, z anteriore +), in ordine di flusso (dalla periferia al cuore). `taglio`: estremo sul piano di taglio (y fisso).
// `r`: raggio di partenza (cm) quando nessun affluente confluisce all'inizio; `rEst`: raggio stimato per gli ostacoli.
const VENE = {
  v_cefalica: { r: 0.15, rEst: 0.14, taglio: [1, 1], sup: [-13, 13], g: [[-4.94, -11.95, 2.28], [-4.85, -11.37, 2.29], [-4.62, -9.6, 2.21], [-4.82, -7.85, 2.02], [-5.54, -5.99, 2.13], [-5.71, -4.01, 2.5], [-5.39, -2.1, 2.56], [-4.92, -0.3, 2.38], [-4.4, 1.39, 2.06], [-3.83, 3.0, 1.63], [-3.22, 4.56, 1.19], [-2.51, 6.29, 0.98], [-1.89, 8.31, 1.26], [-1.56, 10.2, 1.61], [-1.19, 11.93, 1.74]] },
  v_basilica: { r: 0.16, rEst: 0.19, taglio: [1, 1], sup: [-13, 3.6], g: [[0.84, -11.83, 2.24], [1.2, -9.92, 2.38], [1.53, -8.08, 2.38], [1.91, -6.25, 2.3], [2.35, -4.4, 2.23], [2.88, -2.66, 2.0], [3.33, -0.97, 1.64], [3.46, 0.76, 1.28], [3.15, 2.52, 0.92], [2.98, 4.4, 0.6], [3.02, 6.2, 0.42], [3.0, 8.0, 0.3], [2.88, 9.87, 0.16], [2.69, 11.72, 0.04]] },
  v_mediana_avambraccio: { r: 0.13, rEst: 0.14, sup: [-13, 13], taglio: [1, 0], fork: ['v_mediana_cefalica', 'v_mediana_basilica'], g: [[0.02, -11.88, 3.92], [0.72, -10.27, 4.26], [0.85, -8.3, 4.61], [0.7, -6.9, 4.68], [0.62, -5.6, 4.5]] },
  v_mediana_cefalica: { r: 0.108, rEst: 0.11, sup: [-13, 13], g: [[0.62, -5.6, 4.5], [-0.8, -4.9, 4.35], [-2.5, -3.9, 4.0], [-4.0, -2.8, 3.35], [-5.4, -1.6, 2.6]] },
  v_mediana_basilica: { r: 0.108, rEst: 0.11, sup: [-13, 13], g: [[0.62, -5.6, 4.5], [1.5, -4.6, 4.3], [2.3, -3.4, 3.6], [2.95, -2.2, 2.7], [3.3, -1.1, 1.75]] },
  v_mediana_cub: { r: 0.14, rEst: 0.15, sup: [-13, 13], g: [[-4.92, -0.3, 2.38], [-4.0, 0.1, 2.95], [-3.0, 0.45, 3.15], [-1.9, 0.8, 3.22], [-0.7, 1.15, 3.22], [0.5, 1.5, 3.15], [1.5, 1.8, 2.95], [2.4, 2.1, 2.5], [3.0, 2.35, 1.85], [3.2, 2.55, 1.0]] },
  v_perforante: { r: 0.075, rEst: 0.075, turnoMax: 8, g: [[1.2, 1.7, 3.05], [1.12, 2.1, 2.85], [1.15, 2.5, 2.55], [1.35, 2.8, 2.3]] },
};
// comitanti della brachiale: guide dal file di partenza (in ordine di flusso: l'ordine del file va dalla radice al piano di taglio, qui invertito)
const COMITANTI = {
  v_comitante_med: [[2.64, 11.9, 0.81], [2.48, 10.8, 0.74], [2.37, 9.7, 0.8], [2.24, 8.6, 1.03], [2.05, 7.6, 1.39], [1.87, 6.6, 1.73], [1.72, 5.6, 2.05], [1.46, 4.7, 2.45], [1.25, 3.8, 2.75], [1.11, 2.8, 2.98], [1.05, 1.9, 3.07], [0.89, 0.9, 2.85], [0.69, 0.1, 2.35], [0.71, -1.3, 2.28], [0.15, -3.1, 1.93]],
  v_comitante_lat: [[2.64, 12.0, 1.4], [2.54, 10.9, 1.18], [2.65, 9.7, 1.21], [2.84, 8.7, 1.3], [2.84, 7.6, 1.34], [2.64, 6.6, 1.46], [2.33, 5.6, 1.6], [1.98, 4.7, 1.77], [1.69, 3.8, 2.02], [1.45, 2.8, 2.3], [1.25, 1.9, 2.6], [1.09, 0.7, 2.59], [0.77, -0.2, 1.93], [0.56, -1.3, 1.34], [0.42, -2.5, 1.62]],
};
for (const [id, g] of Object.entries(COMITANTI)) VENE[id] = { r: 0.1, rEst: 0.14, taglio: [0, 1], crescita: 1.0, g: g.slice().reverse() };
// comitanti di radiale e ulnare: due per arteria, ai lati dell'arteria (guida = decorso dell'arteria nel file, spostato di `lato` · `OFFSET`)
const COM_ART = [['v_comitante_rad_lat', 'a_radiale', -1, 'v_comitante_lat'], ['v_comitante_rad_med', 'a_radiale', 1, 'v_comitante_lat'],
  ['v_comitante_uln_lat', 'a_ulnare', -1, 'v_comitante_med'], ['v_comitante_uln_med', 'a_ulnare', 1, 'v_comitante_med']];
const OFFSET = 0.25;
// confluenze: `in` = l'estremo finale del tributario sta sul decorso del padre; `out` = l'estremo iniziale del figlio nasce sul decorso del padre
const GIUNZIONI = [
  { t: 'v_mediana_cefalica', p: 'v_cefalica', tipo: 'in' }, { t: 'v_mediana_basilica', p: 'v_basilica', tipo: 'in' },
  { t: 'v_mediana_cub', p: 'v_cefalica', tipo: 'out' }, { t: 'v_mediana_cub', p: 'v_basilica', tipo: 'in' },
  { t: 'v_mediana_cefalica', p: 'v_mediana_avambraccio', tipo: 'out' }, { t: 'v_mediana_basilica', p: 'v_mediana_avambraccio', tipo: 'out' },
  { t: 'v_perforante', p: 'v_mediana_cub', tipo: 'out' }, { t: 'v_perforante', p: 'v_comitante_lat', tipo: 'in' },
  ...COM_ART.map(([id, , , padre]) => ({ t: id, p: padre, tipo: 'in' })),
];
const GIOCO = { profondo: 0.03, cute: 0.0, vaso: 0.025 };   // cm oltre il raggio
const K_PROF = 0.8, K_CUTE = 0.1;                              // frazione del raggio che deve stare libera dalle strutture profonde e dalla cute
const PASSO_P = 0.1;                                           // cm, campionamento dei tracciati
const TURNO_SUP = 4, TURNO_PROF = 6;   // gradi massimi di svolta tra segmenti di 1 mm (raggio di curvatura ≥ ~1,4 cm le superficiali, ~1 cm le profonde)
const RMIN = 0.07, ZONA_GIUNZIONE = 1.3, TAIL = 2.2;   // TAIL: lunghezza (cm) del raccordo tangente alle confluenze
const ID_VENE = Object.keys(NVP.pts).filter(k => k.startsWith('v_'));   // vene già presenti (verranno sostituite)

/* ============ Geometria dei tracciati ============ */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return mul(a, 1 / l); };
function catmull(W, passo) {   // Catmull-Rom centripeta attraverso W, ricampionata a passo costante
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
const arcoCache = new WeakMap();
function proiezione(P, q) {   // punto più vicino di una polilinea: { p, s (frazione d'arco), d, i, tang }
  let c = arcoCache.get(P); if (!c || c.n !== P.length) { const a = [0]; for (let i = 1; i < P.length; i++) a.push(a[i - 1] + len(sub(P[i], P[i - 1]))); arcoCache.set(P, c = { a, n: P.length }); }
  let bd = 1e18, bi = 0, bu = 0; const qx = q[0], qy = q[1], qz = q[2];
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], L2 = ux * ux + uy * uy + uz * uz || 1e-12;
    let u = ((qx - a[0]) * ux + (qy - a[1]) * uy + (qz - a[2]) * uz) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const dx = qx - a[0] - ux * u, dy = qy - a[1] - uy * u, dz = qz - a[2] - uz * u, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bd) { bd = d2; bi = i; bu = u; }
  }
  const a = P[bi], b = P[bi + 1], ab = sub(b, a), L = c.a;
  return { p: add(a, mul(ab, bu)), d: Math.sqrt(bd), i: bi, s: (L[bi] + bu * (L[bi + 1] - L[bi])) / L[L.length - 1], tang: nrm(ab) };
}
const arco = P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1]))); return c; };

/* ============ Campi (strutture profonde e cute) ============ */
const SHEET = ['lacerto', 'cet', 'osborne', 'mio', 'setto_med', 'setto_lat', 'quadrato', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'lucl', 'anulare', 'caps', 'bor_olecr', 'bor_bicrad', 'cart_omero', 'cart_ulna', 'cart_radio'];
G.griglia([-6.4, -12.2, -5.0], [4.6, 12.2, 6.1], 0.08, 0);
const tutte = G.man.meshes.map(m => m.n).filter((n, i, a) => a.indexOf(n) === i);
const SOLIDI = tutte.filter(n => n !== 'cute' && !SHEET.includes(n));
const BANDA = 0.22;
log('campi: strutture profonde');
const Fs = (() => { const M = G.unione(SOLIDI), { F } = G.sdf(M); G.esatta(F, SOLIDI, BANDA); for (let q = 0; q < G.N; q++) if (Math.abs(F[q]) <= BANDA) F[q] = (M[q] ? -1 : 1) * Math.abs(F[q]); return F; })();
const CHIUSURA_FASCIA = 0.4;   // cm: la fascia profonda scavalca le fessure tra i muscoli; le vene superficiali stanno fuori da questa superficie
const Fc = (() => { const M = G.unione(SOLIDI), { Do } = G.sdf(M); const F = G.chiuso(Do, CHIUSURA_FASCIA); G.esatta(F, SOLIDI, 0); return F; })();
const Fh = (() => { const F = new Float32Array(G.N).fill(5); G.esatta(F, SHEET, BANDA); for (let q = 0; q < G.N; q++) F[q] = Math.abs(F[q]); return F; })();
log('campi: cute');
const Fk = G.campo(['cute']).F;
const profondo = p => Math.min(G.sample(Fs, p[0], p[1], p[2]), G.sample(Fh, p[0], p[1], p[2]));
const sopraFascia = p => Math.min(G.sample(Fc, p[0], p[1], p[2]), G.sample(Fh, p[0], p[1], p[2]));
// distanza dalle strutture che contano per la vena `d` nel punto p (le superficiali stanno sopra la fascia, nei tratti `sup`)
const distStrutt = (d, p) => d.sup && p[1] >= d.sup[0] && p[1] <= d.sup[1] ? sopraFascia(p) : profondo(p);
const dentroCute = p => -G.sample(Fk, p[0], p[1], p[2]);   // > 0 dentro la cute
const gradP = (d, p) => G.grad({ s: q => distStrutt(d, q) }, p, 0.05), gradK = p => G.grad({ s: dentroCute }, p, 0.05);

/* ============ Vasi diversi dalle vene (ostacoli) ============ */
const ALTRI = {};
for (const [id, P] of Object.entries(NVP.pts)) if (!id.startsWith('v_')) { const pts = risampiona(P, 0.1), r = NVP.r[id] * (id.startsWith('n_') ? 1.08 : 1.05); ALTRI[id] = { pts, r, lo: [0, 1, 2].map(k => Math.min(...pts.map(p => p[k])) - r - 0.6), hi: [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])) + r + 0.6) }; }
// comitanti di radiale e ulnare dalle arterie del file
for (const [id, art, lato, padre] of COM_ART) {
  const A = risampiona(NVP.pts[art], 0.25), n = A.length, g = [];
  for (let i = 0; i < n; i++) { const T = nrm(sub(A[Math.min(n - 1, i + 1)], A[Math.max(0, i - 1)])); let e = sub([1, 0, 0], mul(T, T[0])); if (len(e) < 0.3) e = sub([0, 0, 1], mul(T, T[2])); e = nrm(e); g.push(add(A[i], mul(e, lato * OFFSET))); }
  VENE[id] = { r: 0.075, rEst: 0.075, taglio: [1, 0], g: g.reverse() };   // dal piano di taglio alla biforcazione dell'arteria brachiale
  VENE[id].g = VENE[id].g.slice(0, -1);
}

// la brachiale nasce "dentro" una delle sue comitanti (la più vicina): ne ripercorre l'ultimo tratto con raggio minore, così non c'è un giunto
// testa a testa; l'altra comitante la raggiunge come un normale affluente (`cont`: continuazione, nessun salto di calibro)
for (const padre of ['v_comitante_lat', 'v_comitante_med']) {
  const tribs = COM_ART.filter(c => c[3] === padre).map(c => c[0]); let best = null, bd = 1e9;
  for (const t of tribs) { const d = len(sub(VENE[t].g.at(-1), VENE[padre].g[0])); if (d < bd) { bd = d; best = t; } }
  VENE[padre].g = [...VENE[best].g.slice(-6), ...VENE[padre].g]; VENE[padre].r = 0.068; VENE[padre].da = best; VENE[best].cont = true;
}

/* ============ Tracciati ============ */
const V = {};   // id → { P (punti), fissoY: [ini, fin] }
for (const [id, d] of Object.entries(VENE)) { d.turnoMax = d.turnoMax || (d.sup ? TURNO_SUP : TURNO_PROF); V[id] = { P: catmull(d.g, PASSO_P), G0: null, d }; }
for (const v of Object.values(V)) v.G0 = v.P.map(p => p.slice());
const raggioEst = id => VENE[id].rEst;
// nodi di confluenza: veine che si incontrano in un punto (esentate tra loro vicino al punto)
function trovaNodi() {
  const nodi = [];
  for (const g of GIUNZIONI) {
    const X = V[g.t], P = V[g.p], ei = g.tipo === 'in' ? X.P.length - 1 : 0, proj = proiezione(P.P, X.P[ei]);
    let nodo = nodi.find(n => n.padre === g.p && len(sub(n.pos, proj.p)) < 0.9);
    if (!nodo) nodi.push(nodo = { padre: g.p, pos: proj.p, vene: new Set([g.p]) });
    nodo.vene.add(g.t);
  }
  return nodi;
}
function ottimizza(iter) {
  const nodi = trovaNodi();
  const inNodo = (a, b, pa, pb) => nodi.some(n => n.vene.has(a) && n.vene.has(b) && len(sub(pa, n.pos)) < ZONA_GIUNZIONE && len(sub(pb, n.pos)) < ZONA_GIUNZIONE);
  const ids = Object.keys(V);
  for (let it = 0; it < iter; it++) {
    const forza = 1; if (it % 50 === 0) log('iterazione', it);
    for (const id of ids) {
      const v = V[id], P = v.P, n = P.length, r = raggioEst(id), cd = K_PROF * r + GIOCO.profondo, ck = K_CUTE * r + GIOCO.cute;
      const D = P.map(() => [0, 0, 0]);
      for (let i = 0; i < n; i++) {
        const p = P[i], fisso = (i === 0 && v.d.taglio?.[0]) || (i === n - 1 && v.d.taglio?.[1]);
        let f = [0, 0, 0];
        // strutture profonde
        const dp = distStrutt(v.d, p); if (dp < cd) { const g = gradP(v.d, p), l = len(g) || 1; f = add(f, mul(g, 0.5 * (cd - dp) / l)); }
        // cute
        const dk = dentroCute(p); if (dk < ck) { const g = gradK(p), l = len(g) || 1; f = add(f, mul(g, 0.35 * (ck - dk) / l)); }
        // arterie e nervi
        for (const o of Object.values(ALTRI)) {
          if (p[0] < o.lo[0] || p[0] > o.hi[0] || p[1] < o.lo[1] || p[1] > o.hi[1] || p[2] < o.lo[2] || p[2] > o.hi[2]) continue;
          const q = proiezione(o.pts, p), need = r + o.r + GIOCO.vaso;
          if (q.d < need) { const dir = q.d > 1e-4 ? mul(sub(p, q.p), 1 / q.d) : [0, 0, 1]; f = add(f, mul(dir, 0.4 * (need - q.d))); }
        }
        // altre vene
        for (const id2 of ids) {
          if (id2 === id) continue; const w = V[id2], q = proiezione(w.P, p), need = r + raggioEst(id2) + GIOCO.vaso;
          if (q.d < need && !inNodo(id, id2, p, q.p)) { const dir = q.d > 1e-4 ? mul(sub(p, q.p), 1 / q.d) : [0, 0, 1]; f = add(f, mul(dir, 0.5 * (need - q.d))); }
        }
        // richiamo verso la guida
        f = add(f, mul(sub(v.G0[i], p), 0.02));
        if (fisso) f[1] = 0;
        D[i] = mul(f, forza);
      }
      // smussatura
      let Q = P.map((p, i) => add(p, D[i]));
      for (let pass = 0; pass < 2; pass++) Q = Q.map((p, i) => { if (i === 0 || i === n - 1) return p; const m = mul(add(Q[i - 1], Q[i + 1]), 0.5); return add(p, mul(sub(m, p), 0.5)); });
      // curvatura massima: dove la svolta tra segmenti supera `turnoMax` il punto va sulla media dei vicini (tre passate)
      for (let pass = 0; pass < 3; pass++) { const R = Q.map(p => p.slice());
        for (let i = 1; i < n - 1; i++) { const a = nrm(sub(Q[i], Q[i - 1])), b = nrm(sub(Q[i + 1], Q[i])), th = Math.acos(clamp(dot(a, b), -1, 1)) * 180 / Math.PI;
          if (th > v.d.turnoMax) { const w = Math.min(1, (th - v.d.turnoMax) / v.d.turnoMax); R[i] = add(Q[i], mul(sub(mul(add(Q[i - 1], Q[i + 1]), 0.5), Q[i]), w)); } }
        Q = R; }
      const S = Q;
      for (let i = 0; i < n; i++) { const fissoY = (i === 0 && v.d.taglio?.[0]) || (i === n - 1 && v.d.taglio?.[1]); P[i] = S[i]; if (fissoY) P[i][1] = v.G0[i][1]; }
    }
    // confluenze: l'ultimo/primo tratto è una curva di Hermite che arriva (parte) tangente al decorso del padre, nel verso del flusso
    for (const g of GIUNZIONI) {
      const X = V[g.t], P = V[g.p], n = X.P.length, dentro = g.tipo === 'in', e0 = dentro ? n - 1 : 0;
      const proj = proiezione(P.P, X.P[e0]), k = Math.min(n - 3, Math.round(TAIL / PASSO_P));
      if (k < 3) continue;
      const i0 = dentro ? n - 1 - k : k, p0 = dentro ? X.P[i0] : proj.p, p1 = dentro ? proj.p : X.P[i0];
      const tx = nrm(sub(X.P[Math.min(n - 1, i0 + 1)], X.P[Math.max(0, i0 - 1)])), d = len(sub(p1, p0));
      const m0 = dentro ? mul(tx, d) : mul(proj.tang, d), m1 = dentro ? mul(proj.tang, d) : mul(tx, d);
      for (let j = 0; j <= k; j++) { const u = j / k, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
        const H = [0, 1, 2].map(c => h00 * p0[c] + h10 * m0[c] + h01 * p1[c] + h11 * m1[c]), i = dentro ? i0 + j : j;
        if (dentro ? j === 0 : j === k) continue;   // il punto di raccordo con il resto della vena non si sposta
        const w = (dentro ? u : 1 - u) < 0.999 ? 0.5 : 1; X.P[i] = add(X.P[i], mul(sub(H, X.P[i]), w)); }
      X.P[e0] = proj.p.slice();
    }
  }
}
log('ottimizzazione');
ottimizza(Number(process.env.ITER || 300));
// parte iniziale della brachiale = copia esatta del tratto finale della comitante da cui nasce (tubi coincidenti, la brachiale più sottile dentro): nessun moncone
for (const [padre, v] of Object.entries(V)) if (v.d.da) {
  const T = V[v.d.da].P, m = proiezione(v.P, T.at(-1)).i + 1;
  v.P = [...T.slice(-m), ...v.P.slice(m)];
  for (let pass = 0; pass < 12; pass++) for (let i = Math.max(1, m - 2); i < Math.min(v.P.length - 1, m + 10); i++) v.P[i] = add(v.P[i], mul(sub(mul(add(v.P[i - 1], v.P[i + 1]), 0.5), v.P[i]), 0.4));
}
for (const v of Object.values(V)) v.P = risampiona(v.P, PASSO_P);

/* ============ Raggi: legge di Murray alle confluenze ============ */
const raggioDa = (k, s) => { const x = clamp(s, 0, 1) * (k.length - 1), i = Math.min(k.length - 2, Math.floor(x)); return k[i] + (k[i + 1] - k[i]) * (x - i); };
const CAP_GIUNZIONE = 0.78;   // il tributario (o il figlio) arriva alla confluenza con raggio ≤ questa frazione di quello del padre e vi si fonde
const RAMPA = 1.2;            // cm: il padre cambia calibro nei RAMPA cm che precedono (tributari) o seguono (rami) la confluenza
function profili() {
  const eventi = {}; for (const id of Object.keys(V)) eventi[id] = [];
  const L = {}; for (const id of Object.keys(V)) L[id] = arco(V[id].P).at(-1);
  const qIni = id => V[id].d.r ** 3, memoFine = {}, inizio = {};
  const qFine = id => {
    if (memoFine[id] !== undefined) return memoFine[id];
    const d = V[id].d; let q;
    if (d.fork) q = d.fork.reduce((a, f) => a + qIni(f), 0);
    else { q = qInizio(id); for (const e of eventi[id]) q += e.dq(); }
    return memoFine[id] = q;
  };
  const qInizio = id => { if (inizio[id] !== undefined) return inizio[id]; const dentro = GIUNZIONI.filter(g => g.t !== id && g.p === id && g.tipo === 'in' && proiezione(V[id].P, V[g.t].P[V[g.t].P.length - 1]).s < 0.04);
    return inizio[id] = dentro.length ? dentro.reduce((a, g) => a + qFine(g.t), 0) : qIni(id); };
  const giu = [];   // giunzioni con la posizione sul padre
  for (const g of GIUNZIONI) {
    const X = V[g.t], P = V[g.p], e0 = g.tipo === 'in' ? X.P.length - 1 : 0, s = proiezione(P.P, X.P[e0]).s;
    giu.push({ ...g, s });
    if (g.tipo === 'in' && s >= 0.04 && !V[g.t].d.cont) eventi[g.p].push({ a: s - RAMPA / L[g.p], b: s, dq: () => qFine(g.t) });
    if (g.tipo === 'out' && s < 0.96 && !V[g.p].d.fork?.includes(g.t)) eventi[g.p].push({ a: s, b: s + RAMPA / L[g.p], dq: () => -qIni(g.t) });
  }
  const out = {};
  for (const id of Object.keys(V)) {
    const M = Math.max(25, Math.ceil(L[id] / 0.25) + 1), q0 = qInizio(id), ev = eventi[id], fork = V[id].d.fork ? qFine(id) : null, k = [];
    for (let j = 0; j < M; j++) { const sj = j / (M - 1); let q = q0;
      for (const e of ev) q += e.dq() * sstep(e.a, e.b, sj);
      if (fork !== null) q = q0 + (fork - q0) * sj;
      if (V[id].d.crescita) q *= 1 + V[id].d.crescita * sj;
      k.push(Math.cbrt(Math.max(q, RMIN ** 3))); }
    out[id] = k;
  }
  // tetto del raggio vicino alle confluenze + estremo affusolato (la calotta resta dentro il padre)
  const base = {}; for (const id of Object.keys(out)) base[id] = out[id].slice();
  for (const g of giu) {
    if (V[g.t].d.cont) continue;
    const k = out[g.t], M = k.length, rP = raggioDa(base[g.p], g.s), cap0 = CAP_GIUNZIONE * rP;
    for (let j = 0; j < M; j++) { const sj = j / (M - 1), d = (g.tipo === 'in' ? 1 - sj : sj) * L[g.t];
      const cap = cap0 + (k[j] - cap0) * sstep(0.25 * TAIL, TAIL, d);
      const fuso = V[g.p].d.fork?.includes(g.t) || (g.tipo === 'in' && g.s < 0.04);   // confluenza proprio all'estremo del padre: stesso raggio, nessuna calotta
      k[j] = Math.min(k[j], cap) * (fuso ? 1 : 0.6 + 0.4 * sstep(0, 0.4, d)); }
  }
  // biforcazione: il tronco si restringe fino al raggio con cui partono i rami, così la sua calotta non sporge
  for (const id of Object.keys(V)) if (V[id].d.fork) { const k = out[id], M = k.length, rEnd = CAP_GIUNZIONE * k[M - 1];
    for (let j = 0; j < M; j++) { const d = (1 - j / (M - 1)) * L[id]; k[j] = k[j] + (Math.min(k[j], rEnd) - k[j]) * (1 - sstep(0, RAMPA, d)); } }
  // padre che nasce dalla confluenza di tributari: parte con il raggio con cui questi arrivano e cresce fino al valore di Murray
  for (const g of giu) if (g.tipo === 'in' && g.s < 0.04) { const k = out[g.p], M = k.length, rS = CAP_GIUNZIONE * base[g.p][0];
    for (let j = 0; j < M; j++) { const d = j / (M - 1) * L[g.p]; k[j] = rS + (k[j] - rS) * sstep(0, RAMPA, d); } }
  return out;
}
const RAGGI = profili();

/* ============ Verifica e scrittura ============ */
function statistiche(tubi) {   // tubi: id → { P, r(i) }
  const righe = [];
  for (const [id, T] of Object.entries(tubi)) {
    let nDeep = 0, nSkin = 0, nVaso = 0, mDeep = 9, mSkin = 9, mVaso = 9, peggio = '';
    for (let i = 0; i < T.P.length; i++) {
      const p = T.P[i], r = T.r(i), dp = distStrutt(T.d, p) - K_PROF * r, dk = dentroCute(p) - K_CUTE * r;
      if (dp < -0.002) nDeep++; if (dk < -0.002) nSkin++; mDeep = Math.min(mDeep, dp); mSkin = Math.min(mSkin, dk);
      for (const [oid, o] of Object.entries(ALTRI)) { const d = proiezione(o.pts, p).d - r - o.r; if (d < -0.002) nVaso++; if (d < mVaso) { mVaso = d; peggio = oid; } }
    }
    if (process.env.DETTAGLI) { const run = []; let cur = null;
      T.P.forEach((p, i) => { const r = T.r(i), dp = distStrutt(T.d, p) - K_PROF * r; if (dp < -0.004) { if (!cur) run.push(cur = { y0: p[1], y1: p[1], m: dp, p }); cur.y1 = p[1]; if (dp < cur.m) { cur.m = dp; cur.p = p; } } else cur = null; });
      righe.push(`  ${id}: ` + run.map(c => `y ${c.y0.toFixed(1)}→${c.y1.toFixed(1)} (${(c.m * 10).toFixed(1)} mm @ ${c.p.map(v => v.toFixed(2)).join(',')})`).join('; ')); }
    let svolta = 0; for (let i = 1; i < T.P.length - 1; i++) svolta = Math.max(svolta, Math.acos(clamp(dot(nrm(sub(T.P[i], T.P[i - 1])), nrm(sub(T.P[i + 1], T.P[i]))), -1, 1)) * 180 / Math.PI);
    righe.push(`${id.padEnd(24)} svolta max ${svolta.toFixed(1).padStart(4)}°  punti ${String(T.P.length).padStart(3)}  profondo<0: ${String(nDeep).padStart(3)} (min ${(mDeep * 10).toFixed(1)} mm)  cute<0: ${String(nSkin).padStart(3)} (min ${(mSkin * 10).toFixed(1)} mm)  vasi: ${String(nVaso).padStart(3)} (min ${(mVaso * 10).toFixed(1)} mm ${peggio})`);
  }
  // vene tra loro
  const ids = Object.keys(tubi), nodi = VERIFICA ? [] : trovaNodi();
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    let n = 0, m = 9;
    for (let i = 0; i < tubi[ids[a]].P.length; i++) { const p = tubi[ids[a]].P[i], q = proiezione(tubi[ids[b]].P, p), d = q.d - tubi[ids[a]].r(i) - tubi[ids[b]].r(Math.round(q.s * (tubi[ids[b]].P.length - 1)));
      if (nodi.some(nd => nd.vene.has(ids[a]) && nd.vene.has(ids[b]) && len(sub(p, nd.pos)) < ZONA_GIUNZIONE)) continue; if (d < -0.002) n++; m = Math.min(m, d); }
    if (n) righe.push(`  vena-vena ${ids[a]} / ${ids[b]}: ${n} punti, min ${(m * 10).toFixed(1)} mm`);
  }
  return righe.join('\n');
}
if (VERIFICA) {
  const tubi = {}; for (const id of Object.keys(NVP.pts).filter(k => k.startsWith('v_'))) { const rp = NVP.rp?.[id], P = NVP.pts[id];
    tubi[id] = { P, d: VENE[id] || {}, r: i => NVP.r[id] * (rp ? raggioDa(rp, i / (P.length - 1)) : 1) }; }
  console.log(statistiche(tubi)); process.exit(0);
}
const rmax = {}, rp = {}, tubi = {};
for (const [id, v] of Object.entries(V)) { const k = RAGGI[id], m = Math.max(...k); rmax[id] = Math.round(m * 1000) / 1000; rp[id] = k.map(x => Math.round(x / m * 1000) / 1000);
  tubi[id] = { P: v.P, d: v.d, r: i => m * raggioDa(k.map(x => x / m), i / (v.P.length - 1)) }; }
log('statistiche'); console.log(statistiche(tubi));
for (const id of Object.keys(V)) console.log(id, 'r max', (rmax[id] * 10).toFixed(2), 'mm; r inizio/fine', (RAGGI[id][0] * 10).toFixed(2), (RAGGI[id].at(-1) * 10).toFixed(2), 'lunghezza', arco(V[id].P).at(-1).toFixed(1), 'cm');
if (argv.includes('prova')) { writeFileSync(argv.find(a => a.startsWith('--prova='))?.split('=')[1] || 'vene-prova.json', JSON.stringify({ pts: Object.fromEntries(Object.entries(V).map(([k, v]) => [k, v.P])), r: rmax, rp })); process.exit(0); }

const round = P => P.map(p => p.map(x => Math.round(x * 1000) / 1000));
for (const id of ID_VENE) { delete NVP.pts[id]; delete NVP.r[id]; }
NVP.rp = {};
for (const [id, v] of Object.entries(V)) { NVP.pts[id] = round(v.P); NVP.r[id] = rmax[id]; NVP.rp[id] = rp[id]; }
G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
G.saveFile(G.repack());
