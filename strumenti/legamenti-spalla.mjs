/* Legamenti della spalla (modelli/spalla-3d.html): coracoclavicolari (conoide e trapezoide), coracoacromiale, acromioclavicolare, sternoclavicolare
   anteriore, coraco-omerale e gleno-omerali (superiore, medio, inferiore con le due bande).

   Uso (dalla cartella del progetto):
     node strumenti/legamenti-spalla.mjs                  → riscrive le mesh nel file del modello
     node strumenti/legamenti-spalla.mjs --prova=f.json   → non tocca il modello: scrive i reperi e i controlli in un JSON
     MODELLO=/tmp/copia.html node strumenti/legamenti-spalla.mjs   → lavora su una copia
   Va lanciato dopo `labbro-capsula-spalla.mjs` (usa ossa, cartilagini, labbro e capsula incorporati, che non modifica); non dipende da una revisione git e
   si può rilanciare: riscrive sempre le stesse mesh.

   Legamenti liberi (tutti tranne i gleno-omerali): costruiti come volume implicito, non come nastro di mesh.
     1. Reperi di origine e inserzione sulle ossa reali (BodyParts3D), trovati con criteri geometrici: per i coracoclavicolari le coppie clavicola-scapola
        di minima distanza lungo la clavicola (il legamento va dove le due ossa sono più vicine); stampati a ogni lancio, da controllare a vista.
     2. Decorso: segmento tra i due reperi (l'estremo è 0,5 mm dentro l'osso), poi rilassato per 80 passate: i campioni troppo vicini a un ostacolo (ossa,
        cartilagini, labbro, capsula, legamenti già fatti) sono spinti fuori lungo il gradiente della distanza e il filo viene teso (smussatura), così il
        legamento aggira le strutture invece di attraversarle.
     3. Sezione ellittica lungo il decorso: larghezza e spessore variabili; le inserzioni si appoggiano all'osso con una placca sottile (`PAD`) che segue la superficie ossea
        dentro un'ellisse (impronta), per aderire su un'area ampia con bordo liscio. Campo = distanza normalizzata dall'ellisse del campione più vicino.
     4. Taglio sugli ostacoli: il volume è tagliato dove la distanza dalle altre strutture scende sotto −0,04 mm, quindi sulle ossa il legamento finisce
        esattamente sulla superficie (aderente, senza spigoli che escono) e non può compenetrare nulla. Surface nets, componente principale, riduzione.
     5. Controlli (stampati): vertici dentro ostacoli (> 0,1 mm), distanza degli estremi dalle ossa e contatti tra legamenti.
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
  const m = W.cart_omero.V.filter(p => dot(nor(sub(p, cT0)), pl) < Math.cos(1.38) + 0.03).reduce((b, p) => (p[1] * 0.4 + p[2]) > (b[1] * 0.4 + b[2]) ? p : b);
  R.ch_om = vicino('omero', add(m, nor(sub(m, cT0)), 0.5)); }
R.sc_ma = vicino('manubrio', add(R.sc_cl.p, [0, 0, 0.25]), (p, n) => n[2] > 0.3);
for (const [k, v] of Object.entries(R)) log('repere', k, v.p.map(x => x.toFixed(2)).join(','));
log('distanze coppie coracoclavicolari: trapezoide', trapz.d.toFixed(2), 'conoide', conoide.d.toFixed(2), 'cm');

/* ---- legamenti liberi: volume implicito lungo un decorso rilassato ---- */
const MESH = {}, CHECK = {}, FATTI = [];
const OSTACOLI = [...OSSA, 'cart_omero', 'cart_glen', 'labbro'];
function libero(spec) {
  const { id, A, B: Bp, w: [wA, wB], t: tm, via = [], nh, wd, lead = 0.2, sfera } = spec;
  // le fibre escono dall'osso quasi perpendicolari: due punti di guida a `lead` cm dalla superficie lungo la normale, poi il decorso si tende fra loro
  const a0 = add(A.p, A.n, -0.08), b0 = add(Bp.p, Bp.n, -0.08), ctl = [a0, add(A.p, A.n, lead), ...via, add(Bp.p, Bp.n, lead), b0];
  const wmax = Math.max(wA, wB) * 0.9, lo = [0, 1, 2].map(k => Math.min(...ctl.map(p => p[k])) - wmax - 0.7), hi = [0, 1, 2].map(k => Math.max(...ctl.map(p => p[k])) + wmax + 0.7);
  griglia(lo, hi, PASSO, 0);
  const { N, NX, NY, NZ, NXY, O, H } = G;
  // ostacoli: ossa, cartilagini, labbro e legamenti già fatti come solidi; la capsula (guscio sottile a due facce, con segno della distanza instabile)
  // è sostituita, dove serve (coraco-omerale), da una sfera che racchiude testa e capsula
  const nomi = [...OSTACOLI, ...FATTI], M = unione(OSTACOLI);
  for (const f of FATTI) or(M, solid(f));
  const Fo = esatta(sfoca(sdf(M).F, 1), nomi, 0.1);
  if (sfera) for (let i = 0; i < N; i++) { const v = G.voxel(i), d = Math.hypot(v[0] - sfera.c[0], v[1] - sfera.c[1], v[2] - sfera.c[2]) - sfera.r; if (d < Fo[i]) Fo[i] = d; }
  // decorso: polilinea ricampionata, poi rilassata
  const NS = 56; let P = []; { const L = [0]; for (let i = 1; i < ctl.length; i++) L.push(L[i - 1] + len(sub(ctl[i], ctl[i - 1]))); for (let k = 0; k < NS; k++) { const x = L[L.length - 1] * k / (NS - 1); let i = 1; while (i < L.length - 1 && L[i] < x) i++; P.push(add(ctl[i - 1], sub(ctl[i], ctl[i - 1]), clamp((x - L[i - 1]) / ((L[i] - L[i - 1]) || 1), 0, 1))); } }
  const margine = tm / 2 + 0.04;
  for (let it = 0; it < 80; it++) {
    for (let k = 1; k < NS - 1; k++) { const u = k / (NS - 1); if (u < 0.08 || u > 0.92) continue; const d = sample(Fo, ...P[k]); if (d < margine) { const g = nor(grad(Fo, P[k])); P[k] = add(P[k], g, margine - d); } }
    P = P.map((p, k) => k === 0 || k === NS - 1 ? p : mul(add(add(P[k - 1], P[k + 1]), p, 2), 0.25));
  }
  // sezioni
  const T = [], Wv = [], Nv = [], Wh = [], Th = []; let wPrev = null;
  for (let k = 0; k < NS; k++) {
    const u = k / (NS - 1), t = nor(sub(P[Math.min(NS - 1, k + 1)], P[Math.max(0, k - 1)]));
    let w = wd ? sub(wd, mul(t, dot(wd, t))) : cross(t, nh); w = nor(w); if (wPrev && dot(w, wPrev) < 0) w = mul(w, -1); wPrev = w;
    const nn = nor(cross(w, t)), fan = 1;
    T.push(t); Wv.push(w); Nv.push(nn);
    Wh.push((wA + (wB - wA) * u) / 2 * (1 - 0.18 * Math.sin(Math.PI * u)) * fan); Th.push(tm / 2 * (0.95 + 0.05 * Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.6));
  }
  // campo: campione più vicino per voxel
  const bd = new Float32Array(N).fill(1e9), bk = new Int16Array(N).fill(-1);
  for (let k = 0; k < NS; k++) { const R0 = Math.max(Wh[k], Th[k]) * 1.3 + 0.12, c = P[k], i0 = Math.max(0, Math.floor((c[0] - R0 - O[0]) / H)), i1 = Math.min(NX - 1, Math.ceil((c[0] + R0 - O[0]) / H)), j0 = Math.max(0, Math.floor((c[1] - R0 - O[1]) / H)), j1 = Math.min(NY - 1, Math.ceil((c[1] + R0 - O[1]) / H)), k0 = Math.max(0, Math.floor((c[2] - R0 - O[2]) / H)), k1 = Math.min(NZ - 1, Math.ceil((c[2] + R0 - O[2]) / H));
    for (let kk = k0; kk <= k1; kk++) for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) { const id = ii + NX * jj + NXY * kk, dx = O[0] + (ii + 0.5) * H - c[0], dy = O[1] + (jj + 0.5) * H - c[1], dz = O[2] + (kk + 0.5) * H - c[2], d2 = dx * dx + dy * dy + dz * dz; if (d2 < bd[id]) { bd[id] = d2; bk[id] = k; } } }
  const V = new Float32Array(N).fill(0.3);
  for (let id = 0; id < N; id++) { const k = bk[id]; if (k < 0) continue; const r = [O[0] + ((id % NX) + 0.5) * H - P[k][0], O[1] + (((id / NX) | 0) % NY + 0.5) * H - P[k][1], O[2] + (((id / NXY) | 0) + 0.5) * H - P[k][2]];
    const c = dot(r, T[k]), a = dot(r, Wv[k]) / Wh[k], b = dot(r, Nv[k]) / Th[k], e = (Math.sqrt(a * a + b * b) - 1) * Math.min(Wh[k], Th[k]), co = (k === 0 && c < 0) ? -c : (k === NS - 1 && c > 0) ? c : 0;
    V[id] = Math.max(e, co - 0.02, MARGINE - Fo[id]); }                                      // taglio sugli ostacoli
  // impronte: all'inserzione il legamento si appoggia all'osso con una placca sottile (spessore PAD) che segue la superficie ossea entro un'ellisse
  // sul piano tangente (semiassi: larghezza del legamento ×0,65 e FIBRA cm lungo le fibre): bordo liscio e aderente, senza lamine di striscio
  for (const [E, k, wE] of [[A, 0, wA], [Bp, NS - 1, wB]]) {
    const n = E.n, tg = nor(sub(T[k], mul(n, dot(T[k], n)))), wv = nor(cross(n, tg)), FW = wE * 0.65, FL = IMPRONTA_L, R1 = Math.max(FW, FL) + 0.1;
    const i0 = Math.max(0, Math.floor((E.p[0] - R1 - O[0]) / H)), i1 = Math.min(NX - 1, Math.ceil((E.p[0] + R1 - O[0]) / H)), j0 = Math.max(0, Math.floor((E.p[1] - R1 - O[1]) / H)), j1 = Math.min(NY - 1, Math.ceil((E.p[1] + R1 - O[1]) / H)), k0 = Math.max(0, Math.floor((E.p[2] - R1 - O[2]) / H)), k1 = Math.min(NZ - 1, Math.ceil((E.p[2] + R1 - O[2]) / H));
    for (let kk = k0; kk <= k1; kk++) for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) { const id = ii + NX * jj + NXY * kk, r = [O[0] + (ii + 0.5) * H - E.p[0], O[1] + (jj + 0.5) * H - E.p[1], O[2] + (kk + 0.5) * H - E.p[2]];
      const a = dot(r, wv), c = dot(r, tg), e = (Math.sqrt((a / FW) ** 2 + (c / FL) ** 2) - 1) * Math.min(FW, FL), h = sample(Fo, ...add(E.p, r)), vf = Math.max(e, h - PAD, MARGINE - h);
      if (vf < V[id]) V[id] = vf; } }
  // apertura morfologica (raggio APERTURA): toglie le lamelle e le schegge che il taglio sull'osso lascia dove il legamento incontra l'osso di striscio
  { const Min = new Uint8Array(N); for (let i = 0; i < N; i++) Min[i] = V[i] < 0 ? 1 : 0; const Ein = G.edt(Min, true), E = new Uint8Array(N); for (let i = 0; i < N; i++) E[i] = Ein[i] > APERTURA ? 1 : 0;
    const Dd = G.edt(E); for (let i = 0; i < N; i++) if (V[i] < 0 && Dd[i] > APERTURA) V[i] = 0.01; }
  sfoca(V, 2);
  const out = nets(V, p => { let b = 0, best = 1e9; for (let k = 0; k < NS; k++) { const d = len(sub(p, P[k])); if (d < best) { best = d; b = k; } } return T[b]; });
  // componente principale
  const nv = out.pos.length / 3, par = Int32Array.from({ length: nv }, (_, i) => i), fnd = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < out.idx.length; t += 3) { const a = fnd(out.idx[t]), b = fnd(out.idx[t + 1]), c = fnd(out.idx[t + 2]); par[b] = a; par[fnd(c)] = a; }
  const cnt = new Map(); for (let t = 0; t < out.idx.length; t += 3) { const r = fnd(out.idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const main = [...cnt.entries()].sort((x, y) => y[1] - x[1])[0][0], keep = []; for (let t = 0; t < out.idx.length; t += 3) if (fnd(out.idx[t]) === main) keep.push(out.idx[t], out.idx[t + 1], out.idx[t + 2]);
  const c0 = B.compatta(Float64Array.from(out.pos), Uint32Array.from(keep)), tri = Math.min(keep.length / 3, Math.round(4200 + 1800 * (wA + wB)));
  const rid = tri < keep.length / 3 ? B.riduci(c0.pos, c0.idx, tri, new Uint8Array(c0.pos.length / 3)) : c0, c1 = B.compatta(rid.pos, rid.idx);
  const pos = Float32Array.from(c1.pos), fdir = new Int8Array(pos.length); for (let i = 0; i < pos.length / 3; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; let b = 0, best = 1e9; for (let k = 0; k < NS; k++) { const d = len(sub(p, P[k])); if (d < best) { best = d; b = k; } } for (let q = 0; q < 3; q++) fdir[3 * i + q] = Math.round(T[b][q] * 127); }
  MESH[id] = { pos, idx: Uint32Array.from(c1.idx), tag: null, fdir };
  // controlli: vertici dentro gli ostacoli
  let dentro = 0, minF = 1e9; for (let i = 0; i < pos.length; i += 3) { const d = sample(Fo, pos[i], pos[i + 1], pos[i + 2]); if (d < TAGLIO_CHECK) dentro++; if (d < minF) minF = d; }
  const lungh = P.reduce((l, p, k) => k ? l + len(sub(p, P[k - 1])) : 0, 0);
  CHECK[id] = { vertici: pos.length / 3, triangoli: c1.idx.length / 3, lunghezza_cm: +lungh.toFixed(2), vertici_dentro_ostacoli: dentro, penetrazione_max_mm: +(Math.max(0, -minF) * 10).toFixed(2) };
  log(id, JSON.stringify(CHECK[id]));
  setMesh(id, MESH[id]); FATTI.push(id);
}
const ASSE_ANT = [0, 0, 1], SU = [0, 1, 0];
libero({ id: 'cc_trapezoide', A: R.tz_cor, B: R.tz_cl, w: [1.4, 1.9], t: 0.34, wd: ax });
libero({ id: 'cc_conoide', A: R.co_cor, B: R.co_cl, w: [0.8, 1.3], t: 0.45, wd: ax });
libero({ id: 'cal', A: R.cal_cor, B: R.cal_ac, w: [1.9, 0.9], t: 0.2, nh: SU });
libero({ id: 'ac_leg', A: R.ac_cl, B: R.ac_ac, w: [1.3, 1.3], t: 0.24, nh: SU, lead: 0.1 });
libero({ id: 'sc_leg', A: R.sc_cl, B: R.sc_ma, w: [1.5, 1.5], t: 0.34, nh: ASSE_ANT, lead: 0.15 });

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
{ libero({ id: 'coraco_om', A: R.ch_cor, B: R.ch_om, w: [1.1, 1.6], t: 0.24, nh: [0, 1, 0], sfera: { c: cT, r: 2.38 + 0.3 } }); }

/* ---- contatti tra legamenti (vertici a meno di 0,3 mm da un'altra mesh di legamento) ---- */
const IDS = Object.keys(MESH);
for (const a of IDS) for (const b of IDS) { if (a >= b || GH[a] || GH[b]) continue; const pa = MESH[a].pos, pb = MESH[b].pos; let n = 0; for (let i = 0; i < pa.length; i += 3) for (let j = 0; j < pb.length; j += 3) if (Math.abs(pa[i] - pb[j]) < 0.03 && Math.abs(pa[i + 1] - pb[j + 1]) < 0.03 && Math.abs(pa[i + 2] - pb[j + 2]) < 0.03) { n++; break; } if (n) log('contatto', a, b, n, 'vertici'); }

const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) writeFileSync(prova, JSON.stringify({ reperi: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.p])), controlli: CHECK }, null, 1));
else saveFile(repack());
