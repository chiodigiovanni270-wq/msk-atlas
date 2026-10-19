/* Legamenti della spalla (modelli/spalla-3d.html): coracoclavicolari (conoide e trapezoide), coracoacromiale, acromioclavicolare, sternoclavicolare
   anteriore, coraco-omerale e gleno-omerali (superiore, medio, inferiore con le due bande).

   Uso (dalla cartella del progetto):
     node strumenti/legamenti-spalla.mjs                  → riscrive le mesh nel file del modello
     node strumenti/legamenti-spalla.mjs --prova=f.json   → non tocca il modello: scrive i reperi e i controlli in un JSON
     MODELLO=/tmp/copia.html node strumenti/legamenti-spalla.mjs   → lavora su una copia
   Va lanciato dopo `labbro-capsula-spalla.mjs` (usa ossa, cartilagini, labbro e capsula incorporati, che non modifica); non dipende da una revisione git e
   si può rilanciare: riscrive sempre le stesse mesh.

   Legamenti liberi (tutti tranne i gleno-omerali): fasci di fibre tra due impronte ossee (`fascio`).
     1. Reperi di origine e inserzione sulle ossa reali (BodyParts3D): coracoclavicolari nelle coppie clavicola-scapola di minima distanza (trapezoide
        scostato in avanti e lateralmente, conoide indietro e medialmente), AC e SC ai due lati della rima articolare (faccia superiore / anteriore);
        stampati a ogni lancio, da controllare a vista.
     2. Impronta: ellisse sul piano tangente dell'osso (asse lungo, semiassi), campionata sui punti fitti della superficie ossea. Le fibre collegano punti
        corrispondenti (U, V) delle due impronte (assi lunghi nello stesso verso: le fibre non si incrociano); densità tale che si fondano in un unico corpo.
        Forma risultante: conoide a cono, trapezoide quadrilatero, coracoacromiale triangolare (base sul coracoide, apice sotto l'acromion).
     3. Decorso di ogni fibra: dal fondo dell'impronta (2 mm dentro l'osso) fuori lungo la normale, poi rilassato per 120 passate sugli ostacoli (ossa,
        cartilagini, labbro, legamenti già fatti; per il coraco-omerale la capsula come solido pieno, così il legamento vi si appoggia e si assottiglia
        fondendosi con essa); lo scostamento dal decorso iniziale è mediato tra fibre vicine (lamina o cordone continuo, non fili separati).
     4. Volume: unione liscia (k = 0,5 mm) di cilindri attorno alle fibre, taglio sugli ostacoli (sulle ossa finisce a filo, nessuna compenetrazione),
        apertura morfologica contro le lamelle, surface nets, componente principale, riduzione; `fdir` = direzione media delle fibre.
     5. Controlli (stampati): vertici dentro ostacoli (> 0,1 mm), penetrazione massima, contatti tra legamenti.
   Gleno-omerali (e tratto capsulare del coraco-omerale): ispessimenti della faccia ESTERNA della capsula (le inserzioni sono su labbro e collo anatomico).
     Percorso più breve sul grafo della capsula (Dijkstra, solo vertici della faccia esterna), placca = griglia (u lungo, v trasversale) proiettata sul
     piano tangente locale, sollevata di `spess` × profilo trasversale, con faccia profonda appoggiata alla capsula (nessuna sovrapposizione).
   Orologio glenoideo: SGHL ~1, MGHL ~3, IGHL anteriore ~4–5, posteriore ~7–8. Fonti: Gray's Anatomy; Turkel et al. JBJS 1981; Rios et al. 2007;
   Harris et al. 2000 (inserzioni dei coracoclavicolari). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, saveFile, repack, log, clamp, sstep, griglia, esatta, sfoca, sdf, unione, solid, or, nets, sample, grad } = G;
const B = await import('./lib-bp3d.mjs');

const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nor = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

const PAD = 0.07, IMPRONTA_L = 0.4, APERTURA = 0.05, PASSO = 0.025, MARGINE = -0.004, TAGLIO_CHECK = -0.01;     // cm
const OSSA = ['scapola', 'clavicola', 'omero', 'manubrio'];
const W = {};
for (const n of [...OSSA, 'caps', 'labbro', 'cart_omero', 'cart_glen']) {
  const m = REAL(n), V = []; for (let i = 0; i < m.pos.length; i += 3) V.push([m.pos[i], m.pos[i + 1], m.pos[i + 2]]);
  const nn = B.normali(m.pos, m.idx); W[n] = { V, m, N: V.map((_, i) => [nn[3 * i], nn[3 * i + 1], nn[3 * i + 2]]) };
  // campioni fitti della superficie (vertici + baricentri e punti a 1/3 dei triangoli) per le impronte d'inserzione
  const Vd = V.slice(), Nd = W[n].N.slice();
  for (let t = 0; t < m.idx.length; t += 3) { const [a, b, c] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
    for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]]) { Vd.push(add(add(mul(V[a], wa), V[b], wb), V[c], wc)); Nd.push(nor(add(add(mul(W[n].N[a], wa), W[n].N[b], wb), W[n].N[c], wc))); } }
  W[n].Vd = Vd; W[n].Nd = Nd;
}
const trova = (osso, filtro, punteggio) => { let best = null, bs = -1e9; W[osso].V.forEach((p, i) => { if (filtro && !filtro(p)) return; const s = punteggio(p); if (s > bs) { bs = s; best = i; } }); if (best === null) throw new Error('repere non trovato su ' + osso); return { p: W[osso].V[best], n: W[osso].N[best], osso }; };
const vicino = (osso, q, filtro) => { let b = -1, bd = 1e9; W[osso].V.forEach((p, i) => { if (filtro && !filtro(p, W[osso].N[i])) return; const d = len(sub(p, q)); if (d < bd) { bd = d; b = i; } }); return { p: W[osso].V[b], n: W[osso].N[b], osso, d: bd }; };

/* ---- reperi ---- */
const cl = W.clavicola.V, Lc = cl.reduce((b, p) => p[0] < b[0] ? p : b), Mc = cl.reduce((b, p) => p[0] > b[0] ? p : b), ax = nor(sub(Mc, Lc));
const s = p => dot(sub(p, Lc), ax);
const sc = W.scapola.V, Ct = sc.reduce((b, p) => p[2] > b[2] ? p : b);        // apice del processo coracoideo
const cor = p => len(sub(p, Ct)) < 3.6 && p[2] > 0.4;
// coppia clavicola-scapola di minima distanza con la clavicola a ascissa s0 (±0,3 cm): faccia inferiore della clavicola, faccia superiore del coracoide
const coppia = s0 => { let best = null; for (let i = 0; i < cl.length; i++) { if (Math.abs(s(cl[i]) - s0) > 0.3 || W.clavicola.N[i][1] > 0.2) continue; // solo faccia inferiore
  for (let j = 0; j < sc.length; j++) { if (W.scapola.N[j][1] < 0.1) continue; const d = len(sub(cl[i], sc[j])); if (!best || d < best.d) best = { d, i, j }; } } return { c: { p: cl[best.i], n: W.clavicola.N[best.i], osso: 'clavicola' }, s: { p: sc[best.j], n: W.scapola.N[best.j], osso: 'scapola' }, d: best.d }; };
const trapz = coppia(2.6), conoide = coppia(4.0);
const R = {
  tz_cl: trapz.c, tz_cor: trapz.s, co_cl: conoide.c, co_cor: conoide.s,
  cal_cor: trova('scapola', p => cor(p) && p[2] > 2.0 && p[2] < 2.7, p => -p[0] + 0.5 * p[1]),                  // margine laterale del coracoide
  cal_ac: trova('scapola', p => p[1] > 2.6, p => p[2] - 0.4 * p[0] - 0.1 * p[1]),                              // apice anteriore dell'acromion
  ac_cl: trova('clavicola', p => s(p) < 0.9, p => p[1]),                                                       // estremo laterale della clavicola (superiore)
  sc_cl: trova('clavicola', p => s(p) > s(Mc) - 0.6, p => p[2]),                                               // estremo mediale (faccia anteriore)
  ch_cor: trova('scapola', p => cor(p) && p[2] > 0.5 && p[2] < 1.2, p => -p[0] + 0.3 * p[1]),                  // base laterale del coracoide
};
{ const a = R.ac_cl.p; R.ac_ac = (() => { let b = -1, bs = -1e9; W.scapola.V.forEach((p, i) => { if (len(sub(p, a)) > 1.4 || p[1] < a[1] - 0.7) return; const sc2 = p[1]; if (sc2 > bs) { bs = sc2; b = i; } }); return { p: W.scapola.V[b], n: W.scapola.N[b], osso: 'scapola' }; })(); }
// coraco-omerale: inserzione sull'omero subito fuori dal margine antero-superiore della cartilagine (tubercolo minore e maggiore), 5 mm verso l'esterno
{ const cT0 = W.cart_omero.V.reduce((a, p) => add(a, p), [0, 0, 0]).map(x => x / W.cart_omero.V.length), pl = nor(sub(W.cart_omero.V.reduce((b, p) => p[1] > b[1] ? p : b), cT0));
  const m = W.cart_omero.V.filter(p => dot(nor(sub(p, cT0)), pl) < Math.cos(1.38) + 0.03).reduce((b, p) => (p[1] * 1.0 + p[2] * 0.8) > (b[1] * 1.0 + b[2] * 0.8) ? p : b);   // margine antero-superiore (intervallo dei rotatori)
  const dc = p => { let b = 1e9; for (const q of W.cart_omero.V) { const d = len(sub(p, q)); if (d < b) b = d; } return b; };
  // punto sul collo dell'omero a 0,9–1,3 cm dal bordo della cartilagine (le fibre non finiscono sulla cartilagine ma sull'osso, sui tubercoli),
  // in alto e davanti (intervallo dei rotatori)
  const cand = W.omero.Vd.map((p, i) => [p, i]).filter(([p]) => p[1] > cT0[1] + 0.3 && p[2] > cT0[2] + 0.8).filter(([p]) => { const d = dc(p); return d > 0.9 && d < 1.3; });
  const [pb, ib] = cand.reduce((b, c) => (c[0][1] * 1.0 + c[0][2] * 0.8) > (b[0][1] * 1.0 + b[0][2] * 0.8) ? c : b);
  R.ch_om = { p: pb, n: W.omero.Nd[ib], osso: 'omero' }; }
R.sc_ma = vicino('manubrio', add(R.sc_cl.p, [0, 0, 0.25]), (p, n) => n[2] > 0.3);
for (const [k, v] of Object.entries(R)) log('repere', k, v.p.map(x => x.toFixed(2)).join(','));
log('distanze coppie coracoclavicolari: trapezoide', trapz.d.toFixed(2), 'conoide', conoide.d.toFixed(2), 'cm');

/* ---- legamenti liberi: fascio di fibre tra due impronte ossee ---- */
const MESH = {}, CHECK = {}, FATTI = [];
const OSTACOLI = [...OSSA, 'cart_omero', 'cart_glen', 'labbro'];
// impronta: vertici dell'osso entro un'ellisse sul piano tangente (centro E.p, asse lungo `asse`, semiassi a × b), con normale concorde;
// restituisce la funzione che porta (U, V) del disco unitario sul punto d'osso corrispondente e la normale media
function impronta(E, asse, a, b) {
  const Wo = W[E.osso]; let n = [0, 0, 0];
  Wo.Vd.forEach((p, i) => { if (len(sub(p, E.p)) < Math.max(a, b) + 0.1 && dot(Wo.Nd[i], E.n) > 0.3) n = add(n, Wo.Nd[i]); }); n = nor(n);
  const u = nor(sub(asse, mul(n, dot(asse, n)))), v = cross(n, u), pts = [];
  Wo.Vd.forEach((p, i) => { const r = sub(p, E.p), h = dot(r, n), x = dot(r, u) / a, y = dot(r, v) / b; if (Math.abs(h) < 0.5 && x * x + y * y < 1.25 && dot(Wo.Nd[i], n) > 0.2) pts.push([p, x, y, Wo.Nd[i]]); });
  if (pts.length < 8) throw new Error('impronta povera su ' + E.osso);
  return { n, u, v, a, b, at: (U, V) => { let best = null, bd = 1e9; for (const q of pts) { const d = (q[1] - U) ** 2 + (q[2] - V) ** 2; if (d < bd) { bd = d; best = q; } } return { p: best[0], n: best[3] }; } };
}
/* spec: A, B reperi { p, n, osso }; ia, ib = [asse, a, b] delle impronte (assi lunghi orientati nello stesso verso, così le fibre non si incrociano);
   nu × nv fibre; rf raggio della fibra (cm); via: punti di passaggio comuni; sfera: ostacolo aggiuntivo (testa + capsula); lead: uscita dall'osso lungo la normale */
function fascio(spec) {
  const { id, A, B: Bp, ia, ib, rf = 0.09, via = [], sfera, lead = 0.15, vita = 1, fineB = 1 } = spec;   // fineB: raggio relativo delle fibre all'inserzione B (assottigliamento)
  // densità delle fibre: passo ≤ 1,6 × raggio sull'impronta più larga, così le fibre si fondono in un unico corpo (niente dita separate)
  const nu = Math.max(spec.nu || 2, Math.ceil(1.7 * Math.max(ia[1], ib[1]) / (1.6 * rf)) + 1), nv = Math.max(spec.nv || 1, Math.ceil(1.4 * Math.max(ia[2], ib[2]) / (1.6 * rf)) + 1);
  const IA = impronta(A, ...ia), IB = impronta(Bp, ...ib);
  // griglia di fibre sul disco (righe U lungo l'asse lungo, colonne V lungo il corto), dentro l'ellisse
  const UV = []; for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const U = nu > 1 ? -0.85 + 1.7 * i / (nu - 1) : 0, V = nv > 1 ? -0.7 + 1.4 * j / (nv - 1) : 0; if (U * U + V * V <= 1.1) UV.push([U, V]); }
  const ctl0 = [A.p, Bp.p, ...via], wmax = Math.max(ia[1], ib[1]) + 0.4;
  const lo = [0, 1, 2].map(k => Math.min(...ctl0.map(p => p[k])) - wmax - 0.6), hi = [0, 1, 2].map(k => Math.max(...ctl0.map(p => p[k])) + wmax + 0.6);
  griglia(lo, hi, PASSO, 0);
  const { N, NX, NY, NZ, NXY, O, H } = G;
  const EXTRA = spec.extra || [], nomi = [...OSTACOLI, ...FATTI, ...EXTRA], M = unione(OSTACOLI); for (const f of [...FATTI, ...EXTRA]) or(M, solid(f));
  const Fosso = spec.capsula ? esatta(sfoca(sdf(M).F, 1), nomi, 0.1) : null;   // ostacoli ossei (e legamenti già fatti) senza la capsula piena
  // capsula come solido pieno: guscio + ossa racchiudono la cavità articolare; si riempie con un riempimento dall'esterno che parte solo dalle facce
  // della griglia lontane dalla testa (la griglia taglia la testa: dalla faccia di taglio il riempimento entrerebbe nella cavità)
  if (spec.capsula) { const C = or(solid('caps'), M.slice()), R2 = spec.capsula.r, cc = spec.capsula.c, fuori = new Uint8Array(N), coda = [];
    for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { if (i && j && k && i < NX - 1 && j < NY - 1 && k < NZ - 1) continue; const id = i + NX * j + NXY * k, q = G.voxel(id); if (!C[id] && Math.hypot(q[0] - cc[0], q[1] - cc[1], q[2] - cc[2]) > R2) { fuori[id] = 1; coda.push(id); } }
    while (coda.length) { const id = coda.pop(), i = id % NX, j = ((id / NX) | 0) % NY, k = (id / NXY) | 0;
      for (const [d, ok] of [[1, i < NX - 1], [-1, i > 0], [NX, j < NY - 1], [-NX, j > 0], [NXY, k < NZ - 1], [-NXY, k > 0]]) { const m = id + d; if (ok && !fuori[m] && !C[m]) { fuori[m] = 1; coda.push(m); } } }
    for (let i = 0; i < N; i++) if (!fuori[i]) M[i] = 1; nomi.push('caps'); }
  const Fo = esatta(sfoca(sdf(M).F, 1), nomi, 0.1);
  // la capsula piena è ostacolo ovunque tranne vicino all'inserzione B: lì il legamento si fonde con la capsula (è un suo ispessimento) e prosegue fino
  // all'osso; gli ostacoli ossei restano sempre attivi
  if (spec.capsula) { const RB = spec.capsula.libera || 0.9; for (let i = 0; i < N; i++) { const q = G.voxel(i), r = Math.hypot(q[0] - Bp.p[0], q[1] - Bp.p[1], q[2] - Bp.p[2]), w = sstep(RB * 0.6, RB, r); Fo[i] = Math.min(Fosso[i], Fo[i] + (1 - w) * 2); } }
  if (sfera) for (let i = 0; i < N; i++) { const q = G.voxel(i), d = Math.hypot(q[0] - sfera.c[0], q[1] - sfera.c[1], q[2] - sfera.c[2]) - sfera.r; if (d < Fo[i]) Fo[i] = d; }
  // centroide comune dei punti di passaggio: le fibre ci passano accostate (vita del legamento) con la loro posizione relativa
  const NS = 40, F0 = [], LIN = [];
  for (const [U, V] of UV) {
    const a = IA.at(U, V), b = IB.at(U, V), a0 = add(a.p, a.n, -0.2), b0 = add(b.p, b.n, -0.2);   // le fibre finiscono 2 mm dentro l'osso: il taglio sull'osso le fa terminare a filo
    const off = add(mul(IA.u, U * ia[1] * 0.5), IA.v, V * ia[2] * 0.5);
    const ctl = [a0, add(a.p, a.n, lead), ...via.map(q => add(q, off, vita)), add(b.p, b.n, lead), b0];
    const L = [0]; for (let i = 1; i < ctl.length; i++) L.push(L[i - 1] + len(sub(ctl[i], ctl[i - 1])));
    const P = []; for (let k = 0; k < NS; k++) { const x = L[L.length - 1] * k / (NS - 1); let i = 1; while (i < L.length - 1 && L[i] < x) i++; P.push(add(ctl[i - 1], sub(ctl[i], ctl[i - 1]), clamp((x - L[i - 1]) / ((L[i] - L[i - 1]) || 1), 0, 1))); }
    F0.push(P); LIN.push(P.map(p => p.slice()));
  }
  // vicine nella griglia (U, V): lo scostamento dal decorso iniziale è mediato tra fibre vicine, così il legamento resta una lamina o un cordone
  // continuo invece di un fascio di fili che si separano sulle irregolarità dell'osso
  const VIC = UV.map(([U, V], f) => UV.map(([U2, V2], g) => [g, (U - U2) ** 2 + (V - V2) ** 2]).filter(([g, d]) => g !== f && d < 0.5).map(([g]) => g));
  let fibre = F0;
  for (let it = 0; it < 120; it++) {
    for (const P of fibre) for (let k = 2; k < NS - 2; k++) { const d = sample(Fo, ...P[k]), m = rf + 0.03; if (d < m) P[k] = add(P[k], nor(grad(Fo, P[k])), m - d); }
    fibre = fibre.map(P => P.map((p, k) => k < 1 || k > NS - 2 ? p : mul(add(add(P[k - 1], P[k + 1]), p, 2), 0.25)));
    fibre = fibre.map((P, f) => VIC[f].length ? P.map((p, k) => { if (k < 3 || k > NS - 4) return p; let dm = [0, 0, 0]; for (const g of VIC[f]) dm = add(dm, sub(fibre[g][k], LIN[g][k])); dm = mul(dm, 1 / VIC[f].length); return add(mul(p, 0.5), add(LIN[f][k], dm), 0.5); }) : P);
  }
  // controllo finale: nessun campione dentro gli ostacoli dopo la media
  for (const P of fibre) for (let k = 2; k < NS - 2; k++) { const d = sample(Fo, ...P[k]), m = rf + 0.03; if (d < m) P[k] = add(P[k], nor(grad(Fo, P[k])), m - d); }
  // campo: unione liscia (k) delle distanze dalle fibre, raggio che si allarga alle inserzioni (fibre che si aprono a ventaglio nell'osso)
  const K = 0.05, S = new Float32Array(N), T = new Float32Array(N * 3), R0 = rf * 1.5 + 4 * K;
  for (const P of fibre) {
    const Dm = new Map();
    for (let k = 0; k < NS - 1; k++) { const p = P[k], q = P[k + 1], e = sub(q, p), l2 = dot(e, e) || 1e-9, t = nor(e);
      const i0 = Math.max(0, Math.floor((Math.min(p[0], q[0]) - R0 - O[0]) / H)), i1 = Math.min(NX - 1, Math.ceil((Math.max(p[0], q[0]) + R0 - O[0]) / H));
      const j0 = Math.max(0, Math.floor((Math.min(p[1], q[1]) - R0 - O[1]) / H)), j1 = Math.min(NY - 1, Math.ceil((Math.max(p[1], q[1]) + R0 - O[1]) / H));
      const k0 = Math.max(0, Math.floor((Math.min(p[2], q[2]) - R0 - O[2]) / H)), k1 = Math.min(NZ - 1, Math.ceil((Math.max(p[2], q[2]) + R0 - O[2]) / H));
      for (let kk = k0; kk <= k1; kk++) for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const x = O[0] + (ii + 0.5) * H - p[0], y = O[1] + (jj + 0.5) * H - p[1], z = O[2] + (kk + 0.5) * H - p[2], s = clamp((x * e[0] + y * e[1] + z * e[2]) / l2, 0, 1);
        const dx = x - s * e[0], dy = y - s * e[1], dz = z - s * e[2], u = (k + s) / (NS - 1), r = rf * (1 + (fineB - 1) * u) * (1 + 0.2 * (sstep(0.18, 0, u) + (fineB < 1 ? 0 : sstep(0.82, 1, u))));
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - r; if (d > 4 * K) continue;
        const id = ii + NX * jj + NXY * kk, o = Dm.get(id); if (o === undefined || d < o[0]) Dm.set(id, [d, t]); } }
    for (const [id, [d, t]] of Dm) { const w = Math.exp(-d / K); S[id] += w; T[3 * id] += w * t[0]; T[3 * id + 1] += w * t[1]; T[3 * id + 2] += w * t[2]; }
  }
  const V = new Float32Array(N);
  for (let id = 0; id < N; id++) V[id] = Math.max(S[id] > 0 ? -K * Math.log(S[id]) : 4 * K, MARGINE - Fo[id]);       // taglio sugli ostacoli
  { const Min = new Uint8Array(N); for (let i = 0; i < N; i++) Min[i] = V[i] < 0 ? 1 : 0; const Ein = G.edt(Min, true), E = new Uint8Array(N); for (let i = 0; i < N; i++) E[i] = Ein[i] > APERTURA ? 1 : 0;
    const Dd = G.edt(E); for (let i = 0; i < N; i++) if (V[i] < 0 && Dd[i] > APERTURA) V[i] = 0.01; }
  sfoca(V, 1);
  const tdir = p => { const i = Math.min(NX - 1, Math.max(0, Math.floor((p[0] - O[0]) / H))), j = Math.min(NY - 1, Math.max(0, Math.floor((p[1] - O[1]) / H))), k = Math.min(NZ - 1, Math.max(0, Math.floor((p[2] - O[2]) / H))), id = i + NX * j + NXY * k; return nor([T[3 * id], T[3 * id + 1], T[3 * id + 2]]); };
  const out = nets(V, tdir);
  const nvx = out.pos.length / 3, par = Int32Array.from({ length: nvx }, (_, i) => i), fnd = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < out.idx.length; t += 3) { const a = fnd(out.idx[t]), b = fnd(out.idx[t + 1]), c = fnd(out.idx[t + 2]); par[b] = a; par[fnd(c)] = a; }
  const cnt = new Map(); for (let t = 0; t < out.idx.length; t += 3) { const r = fnd(out.idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const main = [...cnt.entries()].sort((x, y) => y[1] - x[1])[0][0], keep = []; for (let t = 0; t < out.idx.length; t += 3) if (fnd(out.idx[t]) === main) keep.push(out.idx[t], out.idx[t + 1], out.idx[t + 2]);
  const c0 = B.compatta(Float64Array.from(out.pos), Uint32Array.from(keep)), tri = Math.min(keep.length / 3, 9000);
  const rid = tri < keep.length / 3 ? B.riduci(c0.pos, c0.idx, tri, new Uint8Array(c0.pos.length / 3)) : c0, c1 = B.compatta(rid.pos, rid.idx);
  const pos = Float32Array.from(c1.pos), fdir = new Int8Array(pos.length); for (let i = 0; i < pos.length / 3; i++) { const t = tdir([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]); for (let q = 0; q < 3; q++) fdir[3 * i + q] = Math.round(t[q] * 127); }
  MESH[id] = { pos, idx: Uint32Array.from(c1.idx), tag: null, fdir };
  let dentro = 0, minF = 1e9; for (let i = 0; i < pos.length; i += 3) { const d = sample(Fo, pos[i], pos[i + 1], pos[i + 2]); if (d < TAGLIO_CHECK) dentro++; if (d < minF) minF = d; }
  const lungh = fibre.reduce((s2, P) => s2 + P.reduce((l, p, k) => k ? l + len(sub(p, P[k - 1])) : 0, 0), 0) / fibre.length;
  CHECK[id] = { fibre: fibre.length, vertici: pos.length / 3, triangoli: c1.idx.length / 3, lunghezza_media_cm: +lungh.toFixed(2), vertici_dentro_ostacoli: dentro, penetrazione_max_mm: +(Math.max(0, -minF) * 10).toFixed(2) };
  log(id, JSON.stringify(CHECK[id]));
  setMesh(id, MESH[id]); FATTI.push(id);
}
const ASSE_ANT = [0, 0, 1], SU = [0, 1, 0];
// articolazioni acromioclavicolare e sternoclavicolare: centro della rima = metà della coppia di punti più vicini; impronte ai due lati, sulla faccia
// superiore (AC) o anteriore (SC), a distanza dalla rima: le fibre scavalcano l'articolazione
const rima = (oa, fa, ob, fb) => { let best = null; for (const p of W[oa].V) { if (!fa(p)) continue; for (const q of W[ob].V) { if (!fb(q)) continue; const d = len(sub(p, q)); if (!best || d < best.d) best = { d, p, q }; } } return mul(add(best.p, best.q), 0.5); };
const Jac = rima('clavicola', p => s(p) < 1.2, 'scapola', p => p[1] > 2.4 && p[0] < 3), Jsc = rima('clavicola', p => s(p) > s(Mc) - 1.2, 'manubrio', () => true);
R.ac_cl = vicino('clavicola', add(add(Jac, SU, 0.5), ax, 0.55), (p, n) => n[1] > 0.4);
R.ac_ac = vicino('scapola', add(add(Jac, SU, 0.5), ax, -0.55), (p, n) => n[1] > 0.4);
R.sc_cl = vicino('clavicola', add(add(Jsc, ASSE_ANT, 0.6), ax, -0.6), (p, n) => n[2] > 0.3);
R.sc_ma = vicino('manubrio', add(add(add(Jsc, ASSE_ANT, 0.6), ax, 0.45), SU, -0.35), (p, n) => n[2] > 0.3);
log('rima AC', Jac.map(x => x.toFixed(2)).join(','), '– rima SC', Jsc.map(x => x.toFixed(2)).join(','));
const CORACOIDE = nor(sub(Ct, R.ch_cor.p));                       // asse del processo coracoideo (dalla base all'apice)
const TRAPZ = [-0.6, 0, 1];                                        // linea trapezoidea: in avanti e lateralmente
// trapezoide anterolaterale e conoide posteromediale: impronte scostate di 2 mm in versi opposti, così i due legamenti restano separati
const sposta = (E, d, k) => vicino(E.osso, add(E.p, d, k), (p, n) => dot(n, E.n) > 0.3);
const AL = nor([-1, 0, 0.6]);
fascio({ id: 'cc_trapezoide', A: sposta(R.tz_cor, AL, 0.2), B: sposta(R.tz_cl, AL, 0.2), ia: [TRAPZ, 0.45, 0.13], ib: [TRAPZ, 0.65, 0.15], nu: 7, nv: 2, rf: 0.085 });
fascio({ id: 'cc_conoide', A: sposta(R.co_cor, AL, -0.15), B: sposta(R.co_cl, AL, -0.15), ia: [ax, 0.22, 0.18], ib: [ax, 0.5, 0.3], nu: 4, nv: 3, rf: 0.095 });
// coracoacromiale: base larga sul margine laterale del coracoide (fascio anteriore dall'apice, posteriore dalla base), apice sotto la punta dell'acromion
fascio({ id: 'cal', A: R.cal_cor, B: R.cal_ac, ia: [CORACOIDE, 0.95, 0.12], ib: [[1, 0, 0], 0.42, 0.12], nu: 8, nv: 2, rf: 0.075 });
fascio({ id: 'ac_leg', A: R.ac_cl, B: R.ac_ac, ia: [ASSE_ANT, 0.55, 0.2], ib: [ASSE_ANT, 0.55, 0.2], rf: 0.065 });
fascio({ id: 'sc_leg', A: R.sc_cl, B: R.sc_ma, ia: [SU, 0.6, 0.25], ib: [SU, 0.6, 0.25], nu: 6, nv: 2, rf: 0.09 });

/* ---- gleno-omerali e coraco-omerale: ispessimenti della faccia esterna della capsula ---- */
const cap = W.caps, nCap = cap.V.length;
const cT = (() => { const V = W.cart_omero.V; return V.reduce((a, p) => add(a, p), [0, 0, 0]).map(x => x / V.length); })();
const esterno = cap.V.map((p, i) => dot(cap.N[i], sub(p, cT)) > 0.0);          // vertici della faccia esterna (la capsula è un guscio con due facce)
const adjC = Array.from({ length: nCap }, () => []);
for (let t = 0; t < cap.m.idx.length; t += 3) for (let k = 0; k < 3; k++) { const u = cap.m.idx[t + k], v = cap.m.idx[t + (k + 1) % 3]; if (!esterno[u] || !esterno[v]) continue; const d = len(sub(cap.V[u], cap.V[v])); adjC[u].push([v, d]); adjC[v].push([u, d]); }
{ let N2 = cap.N; for (let it = 0; it < 12; it++) N2 = N2.map((n, i) => { if (!esterno[i]) return n; let a = mul(n, 2); for (const [j] of adjC[i]) a = add(a, N2[j]); return nor(a); }); cap.N = N2; }
function percorso(i0, i1) {
  const D = new Float64Array(nCap).fill(1e9), P = new Int32Array(nCap).fill(-1), Hp = []; D[i0] = 0;
  const push = it => { Hp.push(it); let i = Hp.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (Hp[p][0] <= Hp[i][0]) break; [Hp[p], Hp[i]] = [Hp[i], Hp[p]]; i = p; } };
  const pop = () => { const top = Hp[0], last = Hp.pop(); if (Hp.length) { Hp[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < Hp.length && Hp[l][0] < Hp[m][0]) m = l; if (r < Hp.length && Hp[r][0] < Hp[m][0]) m = r; if (m === i) break; [Hp[m], Hp[i]] = [Hp[i], Hp[m]]; i = m; } } return top; };
  push([0, i0]);
  while (Hp.length) { const [d, u] = pop(); if (d > D[u]) continue; if (u === i1) break; for (const [v, w] of adjC[u]) if (d + w < D[v]) { D[v] = d + w; P[v] = u; push([D[v], v]); } }
  if (P[i1] < 0 && i1 !== i0) throw new Error('nessun percorso sulla faccia esterna della capsula');
  const out = []; for (let v = i1; v >= 0; v = P[v]) out.push(v); return out.reverse();
}
const idxCap = q => { let b = -1, bd = 1e9; cap.V.forEach((p, i) => { if (!esterno[i]) return; const d = len(sub(p, q)); if (d < bd) { bd = d; b = i; } }); return b; };
const leviga = (path, it) => { let P = path; for (let k = 0; k < it; k++) P = P.map((p, i) => i === 0 || i === P.length - 1 ? p : mul(add(add(P[i - 1], P[i + 1]), p, 2), 0.25)); return P; };
const nq = p => { let b = -1, bd = 1e9; cap.V.forEach((q, i) => { if (!esterno[i]) return; const d = len(sub(p, q)); if (d < bd) { bd = d; b = i; } }); return { q: cap.V[b], n: cap.N[b] }; };
function placca(A, Bp, w0, w1, spess) {
  const cam = percorso(idxCap(A.p ?? A), idxCap(Bp.p ?? Bp));
  if (cam.length < 4) throw new Error('percorso troppo corto');
  let pts = leviga(cam.map(i => cap.V[i]), 16); pts[0] = cap.V[cam[0]]; pts[pts.length - 1] = cap.V[cam[cam.length - 1]];
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + len(sub(pts[i], pts[i - 1]))); const tot = L[L.length - 1];
  const NU = 56, NV = 11, cen = [];
  for (let k = 0; k < NU; k++) { const x = tot * k / (NU - 1); let i = 1; while (i < L.length - 1 && L[i] < x) i++; const t = (x - L[i - 1]) / ((L[i] - L[i - 1]) || 1); cen.push(add(pts[i - 1], sub(pts[i], pts[i - 1]), clamp(t, 0, 1))); }
  const grid = (h0, h1) => { const g = []; for (let k = 0; k < NU; k++) { const u = k / (NU - 1), tg = nor(sub(cen[Math.min(NU - 1, k + 1)], cen[Math.max(0, k - 1)])), q0 = nq(cen[k]), wd = nor(cross(tg, q0.n)), w = (w1 + (w0 - w1) * (1 - Math.sin(Math.PI * u) ** 0.6)) / 2, row = [];
      for (let j = 0; j < NV; j++) { const v = 2 * j / (NV - 1) - 1, p = add(cen[k], wd, v * w), q = nq(p), prof = 1 - v * v, hh = h0 + (h1 - h0) * prof; row.push([add(add(p, q.n, -dot(sub(p, q.q), q.n)), q.n, hh), tg]); } g.push(row); } return g; };
  const levG = g => { let X = g.map(r => r.map(([p]) => p)); for (let it = 0; it < 10; it++) X = X.map((r, k) => r.map((p, j) => { let a = mul(p, 2), w = 2; for (const [dk, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const q = X[k + dk]?.[j + dj]; if (q) { a = add(a, q); w++; } } return mul(a, 1 / w); })); return g.map((r, k) => r.map(([, tg], j) => [X[k][j], tg])); };
  const gO = levG(grid(0.005, 0.005 + spess)), gI = levG(grid(0.005, 0.005)), n0 = NU * NV, pos = [], fd = [], idx = [];
  for (const g of [gO, gI]) for (const row of g) for (const [p, tg] of row) { pos.push(...p); fd.push(...tg.map(x => Math.round(x * 127))); }
  for (let k = 0; k < NU - 1; k++) for (let j = 0; j < NV - 1; j++) { const a = k * NV + j, b = a + 1, c = a + NV, d = c + 1; idx.push(a, b, c, b, d, c, n0 + a, n0 + c, n0 + b, n0 + b, n0 + c, n0 + d); }
  { const a = idx[0], b = idx[1], c = idx[2], P3 = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], nn = cross(sub(P3(b), P3(a)), sub(P3(c), P3(a))), q = nq(P3(a));
    if (dot(nn, q.n) < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; } }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: Int8Array.from(fd) };
}
// orologio glenoideo (labbro) e margine della testa
const lab = W.labbro.V, cenL = lab.reduce((a, p) => add(a, p), [0, 0, 0]).map(x => x / lab.length), apex = lab.filter((_, i) => i % 5 === 2);
const glN = nor(sub(cT, cenL)), up = nor(add([0, 1, 0], glN, -glN[1])), ant = nor(cross(up, glN)), antS = dot(ant, [0, 0, 1]) < 0 ? mul(ant, -1) : ant;
const oraL = deg => { const t = deg * Math.PI / 180, d = add(mul(up, Math.cos(t)), antS, Math.sin(t)); return apex.reduce((b, p) => dot(nor(sub(p, cenL)), d) > dot(nor(sub(b, cenL)), d) ? p : b); };
const polo = nor(sub(W.cart_omero.V.reduce((b, p) => p[1] > b[1] ? p : b), cT)), bordo = W.cart_omero.V.filter(p => dot(nor(sub(p, cT)), polo) < Math.cos(1.38) + 0.03);
const oraT = (az, el) => { const d = nor(add(add(mul(up, Math.cos(az)), antS, Math.sin(az)), [0, el, 0])); return bordo.reduce((b, p) => dot(nor(sub(p, cT)), d) > dot(nor(sub(b, cT)), d) ? p : b); };
const GH = { sghl: [oraL(30), oraT(0.9, 0.1), 0.55], mghl: [oraL(90), oraT(1.5, 0), 0.7], ighl_a: [oraL(135), oraT(2.1, -0.2), 0.85], ighl_p: [oraL(-135), oraT(-2.1, -0.2), 0.75] };
for (const [id, [a, b, w]] of Object.entries(GH)) { MESH[id] = placca(a, b, w, w * 0.85, 0.06); setMesh(id, MESH[id]); log(id, MESH[id].pos.length / 3, 'vertici'); }

/* ---- coraco-omerale: dal coracoide sopra la testa (libero, aggira capsula e cartilagine) ai tubercoli ---- */
// coraco-omerale: dal margine laterale della base del coracoide all'intervallo dei rotatori, appoggiato sulla capsula (sfera testa + capsula),
// ai due lati del solco bicipitale: fibre anteriori al tubercolo minore (mediale), posteriori al maggiore
// il coraco-omerale passa sopra il tendine del capo lungo del bicipite (intervallo dei rotatori): il tendine BodyParts3D intatto (revisione `BICIPITE`,
// la stessa da cui `vasi-nervi-spalla.mjs` riparte per i muscoli) è un ostacolo per le sue fibre
const BICIPITE = '59b7798';
{ const R0 = G.realDaRevisione(BICIPITE, 'bic_lungo', 'modelli/spalla-3d.html'); setMesh('bic_lungo', { pos: R0.pos, idx: R0.idx, tag: R0.tag, fdir: R0.fdir }); }
fascio({ id: 'coraco_om', extra: ['bic_lungo'], A: R.ch_cor, B: R.ch_om, ia: [CORACOIDE, 0.5, 0.14], ib: [[1, 0, 0], 0.8, 0.12], nu: 7, nv: 1, rf: 0.07, fineB: 0.85, capsula: { c: cT, r: 3.2, libera: 1.5 } });   // si assottiglia fondendosi con la capsula

/* ---- contatti tra legamenti (vertici a meno di 0,3 mm da un'altra mesh di legamento) ---- */
const IDS = Object.keys(MESH);
for (const a of IDS) for (const b of IDS) { if (a >= b || GH[a] || GH[b]) continue; const pa = MESH[a].pos, pb = MESH[b].pos; let n = 0; for (let i = 0; i < pa.length; i += 3) for (let j = 0; j < pb.length; j += 3) if (Math.abs(pa[i] - pb[j]) < 0.03 && Math.abs(pa[i + 1] - pb[j + 1]) < 0.03 && Math.abs(pa[i + 2] - pb[j + 2]) < 0.03) { n++; break; } if (n) log('contatto', a, b, n, 'vertici'); }

const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) writeFileSync(prova, JSON.stringify({ reperi: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.p])), controlli: CHECK }, null, 1));
else saveFile(repack());
