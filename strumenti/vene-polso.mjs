/* Vene superficiali del polso (modelli/polso-dito-3d.html, sezione polso).

   Uso (dalla cartella del progetto):
     node strumenti/vene-polso.mjs              → riscrive i tubi delle vene nel sorgente della pagina
     node strumenti/vene-polso.mjs verifica     → elenca compenetrazioni, profondità sotto la cute e curve strette, senza scrivere
     MODELLO=/tmp/copia.html node strumenti/vene-polso.mjs   → lavora su una copia
     DUMP=/tmp/vene.json node strumenti/vene-polso.mjs       → salva anche i fili calcolati (punti, raggi, profondità) per i grafici

   Rete venosa sottocutanea (Standring S, Gray's Anatomy, 42ª ed.; Netter FH, Atlante di anatomia umana):
   - vene metacarpali dorsali (II–IV spazio) e vena marginale ulnare, che risalgono dai dischi di taglio distali;
   - arcata venosa dorsale, convessa distalmente sulla diafisi dei metacarpi: più sottile al centro, dove il
     deflusso si divide, e più larga verso i due capi, dove riceve le vene metacarpali (il calibro cresce a ogni confluenza);
   - vena del pollice (dorsale), tributaria della cefalica; vena cefalica: continuazione radiale dell'arcata, sulla
     tabacchiera anatomica e poi sul margine radiale dell'avambraccio, verso il lato volare; vena basilica:
     continuazione ulnare dell'arcata, sul versante dorso-ulnare, che riceve la vena marginale ulnare;
   - plesso venoso palmare superficiale: piccole vene del palmo e della base di tenari e ipotenari che confluiscono
     nella vena mediana dell'avambraccio, che nasce al polso e risale sulla faccia volare, con calibro crescente.
   Metodo: ogni vena è un filo teso sul piano sottocutaneo. Parte da pochi punti guida (tabella VENE); lo spostamento
   dalla guida è una B-spline cubica a nodi radi (NODO), quindi il decorso è liscio per costruzione. A ogni giro i vincoli
   danno gli spostamenti desiderati, proiettati sui coefficienti ai minimi quadrati: profondità costante sotto la cute
   (centro a raggio + SOTTO_CUTE), fuori da ossa, tendini, guaine, retinacoli, muscoli (GIOCO oltre il raggio), fuori da
   nervi e arterie (il vaso li scavalca, o passa sotto dove c'è spazio solo sotto), ancoraggio alla guida forte di lato e
   debole in profondità (i nervi sottocutanei sono stati tracciati attorno ai vasi). Dove i tessuti profondi restano
   sotto la cute senza spazio per il vaso, la cute si solleva con un rilievo dolce (come per i nervi sottocutanei; si
   riparte dalla cute della revisione ORIGINALE). Due giri: il primo trova sbocchi e calibri, il secondo ricalcola i fili
   con il calibro reale di ogni punto.
   Confluenze: la tributaria sbocca nel punto del vaso principale che minimizza le deviazioni di direzione (angolo
   acuto col flusso), gli ultimi 3 mm corrono dentro il lume del vaso, parallelamente al suo asse, e lo sbocco si allarga a imbuto (opzione `fin` con rapporto > 1 di `tube`);
   dopo la confluenza il vaso principale si allarga con un raccordo dolce, con area della sezione pari alla somma di
   quelle dei due vasi (opzione `cal` di `tube`: calibro relativo lungo il decorso). Il vaso che continua un altro
   (cefalica e basilica dall'arcata) riparte dal suo estremo con la stessa tangente e lo stesso calibro.
   Va lanciato dopo `nervi-polso.mjs` e `arterie-polso.mjs` (nervi e arterie sono ostacoli) e prima delle verifiche
   finali; se cambiano nervi, arterie o cute si rilancia. Riparte sempre dalla cute della revisione ORIGINALE. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.MODELLO ||= resolve(ROOT, 'modelli', 'polso-dito-3d.html');
const G = await import('./lib-modello.mjs');
const { man, log, sstep, griglia, campo, sample } = G;

/* ============ Parametri ============ */
const ORIGINALE = '7dbbee8';                     // revisione con la cute di partenza (prima delle vene rifatte)
const FILE_REPO = 'modelli/polso-dito-3d.html';
const PASSO = 0.05;          // passo dei punti del calcolo (cm)
const PASSO_OUT = 0.06;      // passo dei punti scritti nella pagina (cm)
const GIOCO = 0.02;          // distanza minima dagli ostacoli, oltre il raggio (cm)
const SOTTO_CUTE = 0.06;     // profondità del vaso sotto la cute, oltre il raggio (cm)
const SOTTO_CUTE_MIN = 0.03; // sotto questo margine la cute si solleva (cm)
const RILIEVO = 0.35;        // larghezza (sigma) del rilievo cutaneo sopra i vasi (cm)
const ITER = 400;            // giri di rilassamento (massimo)
const ANCORA = 0.02;         // forza che riporta la linea verso la guida, in profondità (per giro)
const ANCORA_LAT = 0.2;      // idem in senso laterale
const ANGOLO = { dentro: 0.3, svasa: 0.5 }; // confluenze: tratto dentro il vaso principale e lunghezza dell'imbuto di sbocco (cm)
const NON_OSTACOLI = ['cute', 'lumtc', 'lumguy', 'adipq'];     // contenitore, spazi e adipe (le vene vi decorrono)
const VENE_ID = ['varco', 'vcef', 'vbas', 'vmcd', 'vmed'];
const TOLL = 0.02;           // tolleranza della verifica (cm), come in nervi-polso.mjs
const Y_TAGLIO = { prox: 7.98, dist: -7.38 };                  // piani di sezione (prossimale, distale)

/* Tabella delle vene. Ogni elemento è un tubo (id della struttura nella pagina + indice del tubo).
   guida: punti [x, y] (la quota z viene dalla cute del lato indicato) o [x, y, z] (3D) in senso di scorrimento del sangue
   inizio: 'distale' | 'prossimale' (sul piano di sezione) | { continua: chiave, estremo: 'inizio'|'fine' } | null
   fine: 'prossimale' (sul piano di sezione) | { sbocca: chiave, vicino: [x, y] } | null
   r0: raggio all'origine (cm); cresce di `cresc` per cm di decorso e di una quota di area a ogni confluenza
   spartiacque (solo arcata): punto da cui il sangue defluisce in entrambe le direzioni. */
const VENE = [
  // ---- tronchi (si risolvono per primi) ----
  { k: 'arco', id: 'varco', idx: 0, lato: 'd', r0: 0.07, cresc: 0.0, rmax: 0.115, spartiacque: [-1.1, -5.45],
    guida: [[-2.85, -4.15], [-2.35, -4.85], [-1.7, -5.3], [-1.05, -5.45], [-0.4, -5.1], [0.05, -4.45], [0.3, -3.7]] },
  { k: 'cef', id: 'vcef', idx: 0, lato: 'd', r0: 0, cresc: 0.0022, rmax: 0.17, inizio: { continua: 'arco', estremo: 'inizio' }, fine: 'prossimale',
    guida: [[-3.293, -3.561, -1.364], [-3.585, -2.52, -1.129], [-3.67, -1.425, -0.984], [-3.673, -0.319, -0.949], [-3.663, 0.783, -0.918],
      [-3.564, 1.867, -0.705], [-3.444, 4.034, -0.247], [-3.358, 6.216, 0.147], [-3.303, 7.98, 0.312]] },
  { k: 'bas', id: 'vbas', idx: 0, lato: 'd', r0: 0, cresc: 0.0022, rmax: 0.18, inizio: { continua: 'arco', estremo: 'fine' }, fine: 'prossimale',
    guida: [[0.591, -2.493, -1.423], [0.893, -1.434, -1.374], [1.054, -0.343, -1.35], [1.215, 0.747, -1.283], [1.455, 1.813, -1.136],
      [1.755, 2.856, -0.931], [2.049, 3.895, -0.705], [2.282, 4.949, -0.476], [2.446, 6.018, -0.254], [2.55, 7.101, -0.07], [2.585, 7.98, -0.003]] },
  { k: 'med', id: 'vmed', idx: 0, lato: 'v', r0: 0.04, cresc: 0.0022, rmax: 0.11, inizio: 'distale', fine: 'prossimale',
    guida: [[-0.815, -7.38], [-0.825, -6.27], [-0.84, -5.174], [-0.887, -4.088], [-1.043, -3.0], [-1.309, -1.92], [-1.552, -0.835], [-1.634, 0.273],
      [-1.539, 1.381], [-1.355, 2.474], [-1.174, 3.564], [-1.046, 4.66], [-0.982, 5.763], [-0.964, 6.869], [-0.963, 7.98]] },
  // ---- tributarie ----
  { k: 'm2', id: 'vmcd', idx: 0, lato: 'd', r0: 0.052, cresc: 0.003, rmax: 0.075, inizio: 'distale', fine: { sbocca: 'arco', vicino: [-2.05, -5.0] },
    guida: [[-2.09, -7.38], [-2.07, -6.7], [-2.05, -6.0]] },
  { k: 'm3', id: 'vmcd', idx: 1, lato: 'd', r0: 0.05, cresc: 0.003, rmax: 0.07, inizio: 'distale', fine: { sbocca: 'arco', vicino: [-0.75, -5.3] },
    guida: [[-0.726, -7.38], [-0.72, -6.8], [-0.7, -6.2]] },
  { k: 'm4', id: 'vmcd', idx: 2, lato: 'd', r0: 0.052, cresc: 0.003, rmax: 0.075, inizio: 'distale', fine: { sbocca: 'arco', vicino: [-0.02, -4.6] },
    guida: [[0.472, -7.38], [0.42, -6.7], [0.3, -6.0], [0.1, -5.4]] },
  { k: 'm5', id: 'vmcd', idx: 3, lato: 'd', r0: 0.048, cresc: 0.0035, rmax: 0.075, inizio: 'distale', fine: { sbocca: 'bas', vicino: [0.82, -1.75] },
    guida: [[2.15, -7.38], [2.05, -6.2], [1.8, -5.0], [1.45, -3.8], [1.15, -2.8]] },
  { k: 'pol', id: 'vmcd', idx: 4, lato: 'd', r0: 0.055, cresc: 0.004, rmax: 0.09, inizio: 'distale', fine: { sbocca: 'cef', vicino: [-3.45, -3.2] },
    guida: [[-5.1, -7.38], [-4.9, -6.2], [-4.45, -5.0], [-4.0, -4.1]] },
  { k: 'ten', id: 'vmed', idx: 1, lato: 'v', r0: 0.028, cresc: 0.0028, rmax: 0.055, inizio: 'distale', fine: { sbocca: 'med', vicino: [-1.55, -0.95] },
    guida: [[-3.25, -4.0], [-2.85, -3.0], [-2.3, -2.1]] },
  { k: 'ipo', id: 'vmed', idx: 2, lato: 'v', r0: 0.028, cresc: 0.0028, rmax: 0.055, inizio: 'distale', fine: { sbocca: 'med', vicino: [-1.55, -0.2] },
    guida: [[1.2, -4.0], [0.65, -2.9], [-0.1, -1.75]] },
];
// la prima voce di inizio 'distale' fissa y = Y_TAGLIO.dist, 'prossimale' fissa Y_TAGLIO.prox
// ordine del calcolo dei calibri: prima le foglie, poi i tronchi
const ORDINE_CALIBRI = ['m2', 'm3', 'm4', 'm5', 'pol', 'ten', 'ipo', 'arco', 'cef', 'bas', 'med'];

/* ============ Utilità ============ */
const fmt = v => +v.toFixed(3);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => mul(a, 1 / (len(a) || 1));
const mix = (a, b, t) => a + (b - a) * t;
const ascisse = P => { const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + len(sub(P[i], P[i - 1]))); return s; };
function aAscissa(P, S, s) {
  if (s <= 0) return P[0].slice();
  for (let i = 1; i < P.length; i++) if (S[i] >= s) { const u = (s - S[i - 1]) / (S[i] - S[i - 1] || 1); return add(P[i - 1], mul(sub(P[i], P[i - 1]), u)); }
  return P.at(-1).slice();
}
function ricampiona(P, passo) {
  const S = ascisse(P), L = S.at(-1), n = Math.max(2, Math.round(L / passo)), out = [];
  for (let q = 0; q <= n; q++) out.push(aAscissa(P, S, L * q / n)); return out;
}
// spline di Catmull-Rom centripeta per i punti dati
function spline(pts, passo) {
  const n = pts.length, out = [];
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1], p0 = i > 0 ? pts[i - 1] : sub(mul(p1, 2), p2), p3 = i + 2 < n ? pts[i + 2] : sub(mul(p2, 2), p1);
    const t0 = 0, t1 = t0 + Math.sqrt(len(sub(p1, p0)) || 1e-6), t2 = t1 + Math.sqrt(len(sub(p2, p1)) || 1e-6), t3 = t2 + Math.sqrt(len(sub(p3, p2)) || 1e-6);
    const m = Math.max(4, Math.ceil(len(sub(p2, p1)) / 0.01));
    for (let q = 0; q < m; q++) {
      const t = mix(t1, t2, q / m);
      const A1 = add(mul(p0, (t1 - t) / (t1 - t0)), mul(p1, (t - t0) / (t1 - t0))), A2 = add(mul(p1, (t2 - t) / (t2 - t1)), mul(p2, (t - t1) / (t2 - t1))), A3 = add(mul(p2, (t3 - t) / (t3 - t2)), mul(p3, (t - t2) / (t3 - t2)));
      const B1 = add(mul(A1, (t2 - t) / (t2 - t0)), mul(A2, (t - t0) / (t2 - t0))), B2 = add(mul(A2, (t3 - t) / (t3 - t1)), mul(A3, (t - t1) / (t3 - t1)));
      out.push(add(mul(B1, (t2 - t) / (t2 - t1)), mul(B2, (t - t1) / (t2 - t1))));
    }
  }
  out.push(pts.at(-1).slice()); return ricampiona(out, passo);
}
// punto più vicino di una polilinea: { i, u, q, d, t } (segmento, parametro, punto, distanza, tangente)
function vicino(P, p) {
  let best = { d: Infinity };
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], ab = sub(b, a), u = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))), q = add(a, mul(ab, u)), d = len(sub(p, q));
    if (d < best.d) best = { i, u, q, d, t: nrm(ab) };
  }
  return best;
}
const tangente = (P, i, k = 4) => nrm(sub(P[Math.min(P.length - 1, i + k)], P[Math.max(0, i - k)]));

/* ============ Campi ============ */
const lo = [-7.3, -7.6, -3.5], hi = [3.7, 8.1, 3.5];
griglia(lo, hi, 0.05, 0.1);
if (!process.argv.includes('verifica')) G.setPos('cute', G.posDaRevisione(ORIGINALE, 'cute', FILE_REPO));   // verifica: cute attuale della pagina
const OSTACOLI = man.meshes.map(m => m.n).filter((n, i, a) => a.indexOf(n) === i && !NON_OSTACOLI.includes(n));
log('campi: cute + ostacoli (' + OSTACOLI.length + ' mesh)');
let Fc = campo(['cute']).F;
const Fcs = G.sfoca(Float32Array.from(Fc), 5);   // cute sfocata: la profondità dei vasi segue il contorno, non le sfaccettature
const Fo = campo(OSTACOLI).F;
// vicino ai piani di sezione i campi di distanza risentono dei tappi (cute e ostacoli finiscono sul piano): i punti si valutano a 2,5 mm dal piano
const FUORI = 0.25, cly = y => Math.min(Y_TAGLIO.prox - FUORI, Math.max(Y_TAGLIO.dist + FUORI, y));
const camp = (F, p) => sample(F, p[0], cly(p[1]), p[2]);
const grd = (F, p0, e = 0.04) => { const p = [p0[0], cly(p0[1]), p0[2]]; return grdRaw(F, p, e); };
const grdRaw = (F, p, e = 0.04) => nrm([0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += e; b[k] -= e; return sample(F, ...a) - sample(F, ...b); }));
const profondita = p => -camp(Fc, p);
// quota z della cute dal lato indicato (dorsale: parte da z < 0; volare: da z > 0)
function quotaCute(x, y, lato) {
  if (lato === 'd') { for (let z = -3.4; z < 3.4; z += 0.02) if (sample(Fc, x, y, z) < 0) return z; }
  else { for (let z = 3.4; z > -3.4; z -= 0.02) if (sample(Fc, x, y, z) < 0) return z; }
  throw new Error(`cute non trovata in (${x}, ${y})`);
}
// punto guida in 3D alla profondità voluta sotto la cute: [x, y] → quota dalla cute del lato indicato; [x, y, z] → proiezione sulla stessa profondità
function punto3(g, lato, r) {
  if (g.length === 2) return [g[0], g[1], quotaCute(g[0], g[1], lato) + (lato === 'd' ? 1 : -1) * (r + SOTTO_CUTE)];
  let p = g.slice();
  for (let q = 0; q < 12; q++) { const e = -camp(Fcs, p) - (r + SOTTO_CUTE); p = add(p, mul(grd(Fcs, p, 0.06), e * 0.8)); }
  return p;
}

/* tubi della pagina che fanno da ostacolo: nervi e arterie (altre vene: solo in verifica) */
const reTube = /tube\(\[\[(.*?)\]\],([\d.]+)(?:,(\{[^}]*\}))?\)/g;
const leggi = riga => [...riga.matchAll(reTube)].map(m => ({ pts: m[1].split('],[').map(s => s.split(',').map(Number)), r: +m[2], o: m[3] || '' }));
const righe = () => G.M.html.split('\n');
function tubiPagina(cat) {
  const out = [];
  for (const l of righe()) { const m = l.match(new RegExp(`^\\{id:'(\\w+)',nw:1,cat:'${cat}'`)); if (m) for (const t of leggi(l)) out.push({ id: m[1], ...t }); }
  return out;
}
const CELLA = 0.25, chiave = (i, j, k) => i + ',' + j + ',' + k;
function indiceTubi(tubi) {
  const H = new Map();
  for (const t of tubi) for (const p of ricampiona(t.pts, 0.04)) {
    const c = p.map(v => Math.floor(v / CELLA)), k = chiave(...c); if (!H.has(k)) H.set(k, []); H.get(k).push({ p, r: t.r });
  }
  return H;
}
function tuboVicino(H, p, raggio) {  // punto del tubo più vicino con il margine più negativo
  const c = p.map(v => Math.floor(v / CELLA)); let best = null;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
    const L = H.get(chiave(c[0] + a, c[1] + b, c[2] + d)); if (!L) continue;
    for (const { p: q, r } of L) { const e = len(sub(p, q)) - raggio - r; if (!best || e < best.e) best = { e, q, rn: r }; }
  }
  return best;
}
const NERVI_ART = indiceTubi([...tubiPagina('ner'), ...tubiPagina('art')]);

/* ============ Rilassamento di un filo ============ */
// Il decorso è la guida (spline) più uno spostamento B-spline cubico a nodi radi (NODO cm): liscio per costruzione,
// niente scatti. A ogni giro i vincoli (profondità sotto la cute, ostacoli, nervi e arterie) danno gli spostamenti
// desiderati dei punti, che si proiettano sui coefficienti con i minimi quadrati pesati.
const NODO = 0.7;
const GAIN_O = 1.0, GAIN_N = 1.2, STEP = 0.5;   // guadagni delle spinte (ostacoli, nervi e arterie) e passo di aggiornamento dei coefficienti
const bs = u => { u = Math.abs(u); return u < 1 ? (4 - 6 * u * u + 3 * u ** 3) / 6 : u < 2 ? (2 - u) ** 3 / 6 : 0; };
function risolviSolo(M, b) {  // eliminazione di Gauss con pivot parziale
  const n = b.length; M = M.map(r => r.slice()); b = b.slice();
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (!f) continue; for (let k = c; k < n; k++) M[r][k] -= f * M[c][k]; b[r] -= f * b[c]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let t = b[r]; for (let k = r + 1; k < n; k++) t -= M[r][k] * x[k]; x[r] = t / M[r][r]; }
  return x;
}
function risolvi(P, R, fissi, vincoloY) {
  const n = P.length, G0 = P.map(v => v.slice()), S = ascisse(G0), L = S.at(-1), m = Math.ceil(L / NODO) + 3;
  const B = S.map(s => { const t = s / NODO + 1; return Array.from({ length: m }, (_, j) => bs(t - j)); });   // coefficiente j al nodo j - 1
  // pesi per asse: i punti fissi non si spostano (peso alto); gli estremi sul piano di sezione tengono y
  const W = [0, 1, 2].map(k => P.map((_, i) => fissi[i] ? 400 : 1));
  if (vincoloY) for (const [i] of vincoloY) for (let q = 0; q < n; q++) if (Math.abs(S[q] - S[i]) < 0.5) W[1][q] = 400;   // gli ultimi 5 mm restano sul piano di sezione
  const A = [0, 1, 2].map(k => { const M = Array.from({ length: m }, () => new Array(m).fill(0));
    for (let i = 0; i < n; i++) for (let a = 0; a < m; a++) { const ba = B[i][a]; if (!ba) continue; for (let c = 0; c < m; c++) M[a][c] += W[k][i] * ba * B[i][c]; }
    for (let a = 0; a < m; a++) M[a][a] += 1e-3; return M; });
  const C = [0, 1, 2].map(() => new Array(m).fill(0));
  const posiz = () => G0.map((g, i) => [0, 1, 2].map(k => { let d = 0; for (let j = 0; j < m; j++) d += B[i][j] * C[k][j]; return g[k] + d; }));
  const Fs = Fcs;
  for (let it = 0; it < ITER; it++) {
    const Q = posiz(), D = Q.map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let p = Q[i]; const r = R[i];
      if (fissi[i]) { D[i] = sub(G0[i], p); continue; }
      // ancoraggio alla guida: forte in senso laterale (i nervi sottocutanei sono stati tracciati attorno al decorso di partenza),
      // debole in profondità (la profondità la decide la cute)
      const nc = grd(Fs, p, 0.06), ga = sub(G0[i], p), gn = dot(ga, nc);
      const tn = tuboVicino(NERVI_ART, p, r + GIOCO * 0.5);
      let d = add(mul(sub(ga, mul(nc, gn)), ANCORA_LAT * (tn && tn.e < 0 ? 0.15 : 1)), mul(nc, gn * ANCORA));
      // ostacoli rigidi: ossa, tendini, muscoli… (campo con segno: negativo dentro); il vaso li scavalca verso la cute
      const dO = camp(Fo, p), need = r + GIOCO, su = nrm(add(mul(grd(Fs, p, 0.06), 0.85), mul(grd(Fo, p), 0.15)));
      if (dO < need) d = add(d, mul(su, (need - dO) * GAIN_O + 0.002));
      // profondità sotto la cute (campo di distanza sfocato): verso il livello r + SOTTO_CUTE; in profondità solo se resta spazio
      const e = -camp(Fs, p) - (r + SOTTO_CUTE);
      if (e > 1e-4 || (e < -1e-4 && dO > need + 0.04 && !(tn && tn.e < 0.06))) d = add(d, mul(grd(Fs, p, 0.06), e * 0.4));
      // nervi e arterie: il vaso si allontana scavalcandoli
      const t = tn;
      if (t && t.e < 0) {
        // il vaso passa sopra il nervo (verso la cute) se resta entro 0,3 mm dalla superficie, altrimenti sotto (più in profondità);
        // in più si sposta di lato quanto serve
        const w = sub(p, t.q), wn = dot(w, nc), wt = sub(w, mul(nc, wn)), dn = -camp(Fs, t.q), sopra = dn - t.rn - r - GIOCO >= -0.03;
        d = add(d, mul(nrm(add(wt, mul(nc, (sopra ? 1 : -1) * (Math.abs(wn) + 0.3 * len(wt))))), -t.e * GAIN_N + 0.002)); }
      if (p[1] > Y_TAGLIO.prox - 0.8 || p[1] < Y_TAGLIO.dist + 0.8) d[1] = 0;   // vicino ai piani di sezione le spinte non hanno componente lungo y
      D[i] = d;
    }
    let mx = 0;
    for (let k = 0; k < 3; k++) {
      const rhs = new Array(m).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) rhs[j] += W[k][i] * B[i][j] * D[i][k];
      const dc = risolviSolo(A[k], rhs); for (let j = 0; j < m; j++) { C[k][j] += STEP * dc[j]; mx = Math.max(mx, Math.abs(dc[j])); }
    }
    if (mx < 2e-5) break;
  }
  const out = posiz();
  if (vincoloY) for (const [i, y] of vincoloY) out[i][1] = y;
  for (let i = 0; i < n; i++) P[i] = out[i];
}

/* ============ Costruzione dei tubi ============ */
let R_TOT = new Map();   // chiave → { P (punti), r (raggi), ... }
let PRECEDENTE = null;   // risultato del giro precedente: dà il calibro reale a ogni punto
function calcola(sp) {
  const rprov = sp.rmax;
  // guida in 3D
  // raggio di ogni punto guida: al primo giro il massimo, poi il calibro del giro precedente (alla stessa frazione del decorso)
  const rGuida = i => { const pr = PRECEDENTE && PRECEDENTE.get(sp.k); if (!pr) return rprov; const q = (i + 0.5) / sp.guida.length * pr.S.at(-1); for (let j = 1; j < pr.S.length; j++) if (pr.S[j] >= q) return mix(pr.r[j - 1], pr.r[j], (q - pr.S[j - 1]) / (pr.S[j] - pr.S[j - 1] || 1)); return pr.r.at(-1); };
  let guida = sp.guida.map((g, i) => punto3(g, sp.lato, rGuida(i)));
  const fissi = [], pre = [], post = [];
  // inizio
  let inizioY = null;
  if (sp.inizio === 'distale') { guida[0][1] = Y_TAGLIO.dist; inizioY = Y_TAGLIO.dist; }
  else if (sp.inizio && sp.inizio.continua) {
    const pa = R_TOT.get(sp.inizio.continua), ini = sp.inizio.estremo === 'inizio';
    const J = ini ? pa.P[0] : pa.P.at(-1), u = ini ? nrm(sub(pa.P[0], pa.P[Math.min(5, pa.P.length - 1)])) : nrm(sub(pa.P.at(-1), pa.P[Math.max(0, pa.P.length - 6)]));
    sp.u0 = u; sp.J0 = J;
    // la continuazione parte dall'estremo del vaso precedente, con la stessa tangente e lo stesso calibro
    pre.push(J, add(J, mul(u, 0.12)), add(J, mul(u, 0.24)));
  }
  // fine
  let fineY = null;
  if (sp.fine === 'prossimale') { guida[guida.length - 1][1] = Y_TAGLIO.prox; fineY = Y_TAGLIO.prox; }
  else if (sp.fine && sp.fine.sbocca) {
    const pa = R_TOT.get(sp.fine.sbocca), v = sp.fine.vicino, ultimo = guida.at(-1);
    const prec = guida.length > 1 ? guida.at(-2) : sub(ultimo, [0, -0.5, 0]), h = nrm(sub(ultimo, prec));
    const S = ascisse(pa.P);
    // punto di sbocco: tra i punti del vaso principale vicini a `vicino`, quello che minimizza le deviazioni di direzione
    // (della tributaria verso lo sbocco e dello sbocco rispetto al flusso del vaso principale)
    let best = null;
    for (let i = 2; i < pa.P.length - 2; i++) {
      const J = pa.P[i], dh = Math.hypot(J[0] - v[0], J[1] - v[1]); if (dh > 1.3 || S[i] < 0.6 || S[i] > S.at(-1) - 0.6) continue;
      const d = sub(J, ultimo), dl = len(d); if (dl < 0.8 || dl > 3.0) continue;
      const dir = pa.sW !== undefined && S[i] < pa.sW ? -1 : 1, u = mul(tangente(pa.P, i), dir), du = nrm(d);
      const c = Math.acos(Math.min(1, dot(h, du))) + 2.0 * Math.acos(Math.min(1, dot(du, u))) + 0.2 * Math.abs(dl - 1.6) + 0.4 * dh;
      if (!best || c < best.c) best = { c, i, J, u, dl };
    }
    if (!best) throw new Error('sbocco non trovato: ' + sp.k);
    sp.J = best.J; sp.u = best.u; sp.sJ = S[best.i]; sp.padre = sp.fine.sbocca;
    log(sp.k, 'sbocca in', sp.fine.sbocca, 'a', best.J.map(fmt).join(','), '- angolo col flusso', (Math.acos(dot(nrm(sub(best.J, ultimo)), best.u)) * 180 / Math.PI).toFixed(0) + '°');
    // gli ultimi 3 mm corrono dentro il lume del vaso principale, paralleli al suo asse
    post.push(sub(best.J, mul(best.u, ANGOLO.dentro)), sub(best.J, mul(best.u, ANGOLO.dentro / 2)), best.J);
  }
  // decorso di partenza: blocco rettilineo di continuazione, raccordo di Hermite, spline sui punti guida, raccordo di Hermite,
  // blocco rettilineo dentro il vaso principale (così le tangenti agli sbocchi coincidono con quelle del vaso)
  let pezzi = [];
  const herm = (A, ta, B, tb) => { const L = len(sub(B, A)), out = []; for (let q = 1; q < 40; q++) { const t = q / 40, h00 = 2 * t ** 3 - 3 * t * t + 1, h10 = t ** 3 - 2 * t * t + t, h01 = -2 * t ** 3 + 3 * t * t, h11 = t ** 3 - t * t;
    out.push([0, 1, 2].map(k => h00 * A[k] + h10 * L * ta[k] + h01 * B[k] + h11 * L * tb[k])); } return out; };
  const g0 = guida[0], g1 = guida.at(-1), tg0 = nrm(sub(guida[Math.min(1, guida.length - 1)], g0)), tg1 = nrm(sub(g1, guida[Math.max(0, guida.length - 2)]));
  if (pre.length) { pezzi.push(...pre); pezzi.push(...herm(pre.at(-1), sp.u0, g0, tg0)); }
  const cr = spline(guida, 0.02);
  pezzi.push(...cr);
  if (post.length) { const T0 = post[0]; pezzi.push(...herm(g1, tg1, T0, sp.u), ...post); }
  let P = ricampiona(pezzi, PASSO);
  const n = P.length; for (let i = 0; i < n; i++) fissi.push(false);
  if (pre.length) { const Sf = ascisse(P); for (let i = 0; i < n; i++) if (Sf[i] <= 0.25) fissi[i] = true; }
  if (post.length) { const Sf = ascisse(P), L = Sf.at(-1); for (let i = 0; i < n; i++) if (Sf[i] >= L - ANGOLO.dentro) fissi[i] = true; }
  // raggio di calcolo di ogni punto: al primo giro il massimo del vaso, poi il calibro reale del giro precedente
  let R = P.map(() => rprov);
  if (PRECEDENTE && PRECEDENTE.get(sp.k)) {
    const pr = PRECEDENTE.get(sp.k), Sp = pr.S, Lp = Sp.at(-1), Sn = ascisse(P), Ln = Sn.at(-1);
    R = Sn.map(sv => { const t = sv / Ln * Lp; for (let i = 1; i < Sp.length; i++) if (Sp[i] >= t) return mix(pr.r[i - 1], pr.r[i], (t - Sp[i - 1]) / (Sp[i] - Sp[i - 1] || 1)); return pr.r.at(-1); });
  }
  const vY = []; if (inizioY !== null) vY.push([0, inizioY]); if (fineY !== null) vY.push([n - 1, fineY]);
  risolvi(P, R, fissi, vY);
  const S = ascisse(P);
  const rec = { P, S, sp, fissi, R };
  if (sp.spartiacque) { const c = vicino(P, [sp.spartiacque[0], sp.spartiacque[1], P[Math.floor(P.length / 2)][2]]); rec.sW = S[c.i] + (S[c.i + 1] - S[c.i]) * c.u; }
  R_TOT.set(sp.k, rec);
  log(sp.k, 'risolto:', n, 'punti, lunghezza', S.at(-1).toFixed(2), 'cm');
}

/* ============ Calibri ============ */
// raggio lungo il decorso: r0 + crescita, più l'area delle tributarie dopo ciascuna confluenza (raccordo dolce)
function calibro(k) {
  const rec = R_TOT.get(k), sp = rec.sp, S = rec.S, Lt = S.at(-1);
  const trib = VENE.filter(v => v.fine && v.fine.sbocca === k).map(v => ({ sJ: R_TOT.get(v.k).sp.sJ, r: R_TOT.get(v.k).rFine }));
  const sW = rec.sW ?? 0, rIni = sp.inizio && sp.inizio.continua ? R_TOT.get(sp.inizio.continua).rEstremo[sp.inizio.estremo] : sp.r0;
  const r = S.map(s => {
    // distanza dalla sorgente lungo il verso di scorrimento (arcata: dallo spartiacque; altrove: dall'inizio)
    const lato = rec.sW === undefined ? 1 : (s < sW ? -1 : 1), d = (s - sW) * lato;
    let a = (rIni + sp.cresc * Math.abs(rec.sW === undefined ? s : d)) ** 2;
    for (const t of trib) {
      const dj = (t.sJ - sW) * lato; if (dj < 0) continue;          // tributaria sull'altro lato dello spartiacque
      a += t.r * t.r * sstep(dj - 0.15, dj + 0.85, d);
    }
    return Math.sqrt(a);
  });
  rec.r = r;
  rec.rFine = r.at(-1);
  rec.rEstremo = { inizio: r[0], fine: r.at(-1) };
  // le tributarie che sboccano devono restare più strette del vaso principale
  const rmax = Math.max(...r); rec.rmax = rmax;
  log(k, 'calibro: raggio da', Math.min(...r).toFixed(3), 'a', rmax.toFixed(3), 'cm (diametro', (2 * rmax * 10).toFixed(1), 'mm)');
}

/* ============ Cute ============ */
function cute() {
  // fino a 3 giri: dopo ogni rilievo si ricalcola il campo della cute e si solleva ancora dove il vaso sporge
  for (let giro = 0; giro < 3; giro++) {
    const RICH = [];
    for (const [k, rec] of R_TOT) for (let i = 0; i < rec.P.length; i++) {
      const p = rec.P[i], margine = profondita(p) - rec.r[i]; if (margine >= SOTTO_CUTE_MIN) continue;
      RICH.push({ p, need: SOTTO_CUTE_MIN - margine, n: grd(Fc, p) });
    }
    if (!RICH.length) { log('cute: nessun altro rilievo necessario'); return; }
    const pos = G.REAL('cute').pos.slice(), nv = pos.length / 3;
    const box = [0, 1, 2].map(k => [Math.min(...RICH.map(a => a.p[k])) - 1, Math.max(...RICH.map(a => a.p[k])) + 1]);
    let mx = 0, mossi = 0;
    for (let i = 0; i < nv; i++) {
      const q = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; if (![0, 1, 2].every(k => q[k] > box[k][0] && q[k] < box[k][1])) continue;
      let best = 0, dir = null;
      for (const a of RICH) { const dd = len(sub(q, a.p)); if (dd > 4 * RILIEVO) continue; const w = (a.need * 1.3 + 0.01) * Math.exp(-0.5 * (dd / RILIEVO) ** 2); if (w > best) { best = w; dir = a.n; } }
      if (best < 1e-4) continue;
      const sulPiano = q[1] > Y_TAGLIO.prox + 0.03 - 0.3 || q[1] < Y_TAGLIO.dist - 0.03 + 0.3;   // i dischi di taglio restano piani
      for (let k = 0; k < 3; k++) if (!(sulPiano && k === 1)) pos[3 * i + k] += dir[k] * best;
      mx = Math.max(mx, best); mossi++;
    }
    G.setPos('cute', pos);
    log('cute sollevata sopra le vene (giro ' + (giro + 1) + '):', mossi, 'vertici, fino a', (mx * 10).toFixed(1), 'mm');
    Fc = campo(['cute']).F;
  }
}

/* ============ Scrittura ============ */
function sostituisciRiga(id, nuova) {
  const rr = righe(), i = rr.findIndex(l => l.startsWith(`{id:'${id}',`)); if (i < 0) throw new Error('riga non trovata: ' + id);
  rr[i] = nuova; G.M.html = rr.join('\n');
}
function tuboTesto(rec) {
  const P = ricampiona(rec.P, PASSO_OUT), S = ascisse(P), L = S.at(-1), r = rec.r, Sr = rec.S;
  const interp = s => { for (let i = 1; i < Sr.length; i++) if (Sr[i] >= s) return mix(r[i - 1], r[i], (s - Sr[i - 1]) / (Sr[i] - Sr[i - 1] || 1)); return r.at(-1); };
  const rb = rec.rmax, kn = [];
  const nk = Math.max(8, Math.round(L / 0.2));
  for (let q = 0; q <= nk; q++) { const t = q / nk; kn.push([+t.toFixed(4), +(interp(t * L) / rb).toFixed(3)]); }
  const o = [];
  if (rec.flare) o.push(`fin:[${rec.flare},${ANGOLO.svasa}]`);
  o.push('cal:' + JSON.stringify(kn), `seg:${Math.min(320, Math.max(40, Math.round(L * 12)))}`);
  return 'tube([' + P.map(p => '[' + p.map(fmt).join(',') + ']').join(',') + '],' + fmt(rb) + ',{' + o.join(',') + '})';
}
function scrivi() {
  for (const id of VENE_ID) {
    const tubi = VENE.filter(v => v.id === id).sort((a, b) => a.idx - b.idx).map(v => tuboTesto(R_TOT.get(v.k)));
    const l = righe().find(x => x.startsWith(`{id:'${id}',`)), re = /b:\(\)=>\[tube\(.*\)\]\},?$/;
    if (!re.test(l)) throw new Error('riga dei tubi non riconosciuta: ' + id);
    const nuova = l.replace(re, () => `b:()=>[${tubi.join(',')}]},`);
    sostituisciRiga(id, nuova);
  }
}

/* ============ Verifica ============ */
function verifica() {
  const tuttiVene = tubiPagina('ven');
  const H = indiceTubi([...tubiPagina('ner'), ...tubiPagina('art')]);
  for (const id of VENE_ID) {
    const l = righe().find(x => x.startsWith(`{id:'${id}',`));
    leggi(l).forEach(({ pts, r, o }, b) => {
      const cal = (o.match(/cal:(\[\[.*?\]\])/) || [])[1], fn = cal ? (() => { const A = JSON.parse(cal); return t => { if (t <= A[0][0]) return A[0][1]; for (let i = 1; i < A.length; i++) if (t <= A[i][0]) return mix(A[i - 1][1], A[i][1], (t - A[i - 1][0]) / (A[i][0] - A[i - 1][0] || 1)); return A.at(-1)[1]; }; })() : () => 1;
      const P = ricampiona(pts, 0.05), S = ascisse(P), L = S.at(-1);
      let nOst = 0, pegOst = 0, dove = null, nCute = 0, pegCute = 0, doveCute = null, doveVN = null, nVN = 0, pegVN = 0, Rmin = Infinity, yR = 0, nVV = 0, pegVV = 0;
      for (let i = 0; i < P.length; i++) {
        if (P[i][1] > Y_TAGLIO.prox - 0.03 || P[i][1] < Y_TAGLIO.dist + 0.03) continue;   // l'estremo poggia sul piano di sezione
        const rr = r * fn(S[i] / L), d = camp(Fo, P[i]) - rr;
        if (d < -TOLL) { nOst++; if (d < pegOst) { pegOst = d; dove = P[i]; } }
        if (profondita(P[i]) < rr - TOLL) { nCute++; if (profondita(P[i]) - rr < pegCute) { pegCute = profondita(P[i]) - rr; doveCute = P[i]; } }
        const t = tuboVicino(H, P[i], rr); if (t && t.e < -TOLL) { nVN++; if (t.e < pegVN) { pegVN = t.e; doveVN = P[i]; } }
        if (i >= 3 && i < P.length - 3) { const a = sub(P[i], P[i - 3]), c = sub(P[i + 3], P[i]), ang = Math.acos(Math.min(1, dot(a, c) / (len(a) * len(c) || 1))), Rc = (len(a) + len(c)) / 2 / (ang || 1e-9); if (Rc < Rmin) { Rmin = Rc; yR = P[i][1]; } }
      }
      const parts = [];
      if (nOst) parts.push(`dentro tessuti ${nOst} punti (fino a ${(-pegOst * 10).toFixed(1)} mm, y = ${dove[1].toFixed(2)})`);
      if (nCute) parts.push(`fuori dalla cute ${nCute} punti (fino a ${(-pegCute * 10).toFixed(1)} mm, y = ${doveCute[1].toFixed(2)})`);
      if (nVN) parts.push(`dentro nervi/arterie ${nVN} punti (fino a ${(-pegVN * 10).toFixed(1)} mm, y = ${doveVN[1].toFixed(2)}, x = ${doveVN[0].toFixed(2)})`);
      if (Rmin < 3 * r) parts.push(`curva stretta: raggio ${(Rmin * 10).toFixed(1)} mm (y = ${yR.toFixed(2)})`);
      log(`  ${id}[${b}] r=${r} ${parts.length ? parts.join('; ') : 'ok'}`);
    });
  }
}

// vene non imparentate che si compenetrano (imparentate: tributaria e vaso principale, tributarie dello stesso vaso, continuazioni)
function veneTraLoro() {
  const tubi = []; for (const sp of VENE) { const l = righe().find(x => x.startsWith(`{id:'${sp.id}',`)); const t = leggi(l)[sp.idx]; tubi.push({ k: sp.k, sp, pts: ricampiona(t.pts, 0.06), r: t.r }); }
  const imparentate = (a, b) => a.k === b.sp.fine?.sbocca || b.k === a.sp.fine?.sbocca || (a.sp.fine?.sbocca && a.sp.fine.sbocca === b.sp.fine?.sbocca)
    || a.k === b.sp.inizio?.continua || b.k === a.sp.inizio?.continua || (a.sp.inizio?.continua && a.sp.inizio.continua === b.sp.inizio?.continua);
  let n = 0;
  for (let i = 0; i < tubi.length; i++) for (let j = i + 1; j < tubi.length; j++) {
    const a = tubi[i], b = tubi[j]; if (imparentate(a, b)) continue;
    let peg = 0, dove = null; for (const p of a.pts) { const c = vicino(b.pts, p), m = c.d - a.r * 0.8 - b.r * 0.8; if (m < peg) { peg = m; dove = p; } }
    if (peg < -TOLL) { n++; log(`  ${a.k} e ${b.k} si compenetrano (fino a ${(-peg * 10).toFixed(1)} mm, y = ${dove[1].toFixed(2)})`); }
  }
  if (!n) log('  nessuna compenetrazione tra vene non imparentate');
}

/* ============ Esecuzione ============ */
if (process.argv.includes('verifica')) { verifica(); veneTraLoro(); }
else {
  for (let giro = 0; giro < 2; giro++) {
    R_TOT = new Map();
    for (const sp of VENE) calcola(sp);
    for (const k of ORDINE_CALIBRI) calibro(k);
    PRECEDENTE = R_TOT;
  }
  // svasatura dello sbocco: rapporto tra raggio finale e raggio base, mai oltre l'85 % del vaso principale
  for (const sp of VENE) if (sp.fine && sp.fine.sbocca) {
    const rec = R_TOT.get(sp.k), pa = R_TOT.get(sp.fine.sbocca), rJ = pa.r[Math.min(pa.r.length - 1, Math.round(sp.sJ / PASSO))];
    const rapp = Math.min(1.35, 0.85 * rJ / rec.rFine); rec.flare = +Math.max(1, rapp).toFixed(2);
    log(sp.k, 'sbocca in', sp.fine.sbocca, ': raggio', rec.rFine.toFixed(3), '→ vaso', rJ.toFixed(3), ', svasatura', rec.flare);
  }
  if (process.env.DUMP) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.DUMP, JSON.stringify([...R_TOT].map(([k, r]) => ({ k, id: r.sp.id, P: r.P.map(p => p.map(fmt)), r: r.r.map(fmt), fissi: r.fissi, d: r.P.map(p => fmt(profondita(p))), o: r.P.map(p => fmt(camp(Fo, p))) })))); }
  cute();
  scrivi();
  G.saveFile(G.repack());
}
