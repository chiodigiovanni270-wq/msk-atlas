/* Legamenti del gomito (modelli/gomito-3d.html): collaterali ulnare e radiale, anulare e quadrato.

   Uso (dalla cartella del progetto):
     node strumenti/legamenti-gomito.mjs [id …]            → riscrive le mesh nel file del modello (tutte o solo quelle indicate)
     node strumenti/legamenti-gomito.mjs --prova=f.json    → non tocca il modello: scrive le mesh (con le ossa) in un JSON
     MODELLO=/tmp/copia.html node strumenti/legamenti-gomito.mjs   → lavora su una copia

   Le mesh originali passavano dentro le ossa (fino a 2 mm), con decorsi non anatomici. Qui ogni legamento è ricostruito
   sulle ossa reali (BodyParts3D) e sulle loro cartilagini (`cartilagini-gomito.mjs`, da lanciare prima): nastro che segue
   la superficie "tesa" (chiusura morfologica di ossa e cartilagini, così scavalca la rima articolare e le concavità come un
   legamento in tensione), con le inserzioni che scendono sull'osso e si allargano a ventaglio; sezione lenticolare,
   spessore ridotto verso le inserzioni, fascicoli longitudinali e direzione delle fibre per vertice. Le linee guida
   (punti in cm, sistema del modello: x laterale→mediale, y distale→prossimale, z posteriore→anteriore) sono nella
   tabella LEG: vengono proiettate sulla superficie, quindi bastano approssimative.
   Riparte sempre dalle ossa e cartilagini incorporate (che non modifica), quindi si può rilanciare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs'); // griglia corrente: G.O, G.H, G.NX… cambiano con setGriglia
const { man, setMesh, sample, clamp, sstep, log, repack, saveFile, esatta, REAL, realDaRevisione } = G;
const ORIGINALE = '10893e7';        // revisione con le mesh originali di quadrato e Osborne, da cui si riparte
const FILE_REPO = 'modelli/gomito-3d.html';
const { griglia: grigliaG, sdf, chiuso, unione, grad, sfoca, proietta, taubin, nets, campo, voxel, valuta } = G; // superfici implicite (lib-modello)
const griglia = (lo, hi, h = STEP, pad = 0.45) => grigliaG(lo, hi, h, pad);

const OSSA = ['omero', 'ulna', 'radio'];
const CART = ['cart_omero', 'cart_ulna', 'cart_radio'];
const STEP = 0.025; // passo della griglia (cm)

/* ============ Vettori ============ */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, t) => a + (b - a) * t;
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);


/* ============ Nastro legamentoso ============ */
/* L = { id, p: punti guida (primo = origine, ultimo = inserzione), w: semilarghezze [origine, centro, inserzione],
         t: spessore al centro, r: raggio di chiusura (quanto il legamento resta "teso" sulle concavità),
         fl: allargamento a ventaglio delle inserzioni, fas: numero di fascicoli, extra: solidi aggiuntivi su cui poggia } */
function nastro(Lg, ctx) {
  const { Fr, Fc } = ctx, n0 = Lg.p.length;
  const endW = u => 1 - sstep(0, 0.2, u) * sstep(0, 0.2, 1 - u);   // 1 alle inserzioni, 0 al centro
  const t0 = u => Lg.t * (0.55 + 0.45 * Math.sin(Math.PI * clamp(u, 0, 1)) ** 0.6);
  const lev = u => t0(u) * 0.5 - 0.01;
  const Fb = (p, u) => mix(sample(Fc, ...p), sample(Fr, ...p), endW(u));
  // 1. punti guida sulla superficie: estremi sull'osso vero, intermedi sulla superficie tesa
  const g = Lg.p.map((p, i) => { const u = i / (n0 - 1); return proietta(q => Fb(q, u), p, lev(u)); });
  Lg._g = g;
  // 2. linea densa per tratti, poi rilassata (filo teso vincolato alla superficie, guide come vincoli morbidi)
  let C = [], pin = [];
  for (let i = 0; i < n0 - 1; i++) { const m = Math.max(4, Math.ceil(len(sub(g[i + 1], g[i])) / 0.025)); for (let k = 0; k < m; k++) C.push(add(g[i], mul(sub(g[i + 1], g[i]), k / m))); pin.push(C.length - m); }
  C.push(g[n0 - 1]); pin.push(C.length - 1);
  const N = C.length, uOf = () => { const s = [0]; for (let i = 1; i < N; i++) s.push(s[i - 1] + len(sub(C[i], C[i - 1]))); return s.map(x => x / s[N - 1]); };
  let U = uOf();
  for (let it = 0; it < 120; it++) {
    const D = C.map(p => p.slice());
    for (let i = 1; i < N - 1; i++) D[i] = add(mul(C[i], 0.5), mul(add(C[i - 1], C[i + 1]), 0.25));
    pin.forEach((i, k) => { if (k > 0 && k < n0 - 1) D[i] = add(mul(D[i], 0.85), mul(g[k], 0.15)); });
    for (let i = 1; i < N - 1; i++) D[i] = proietta(q => Fb(q, U[i]), D[i], lev(U[i]), 3);
    C = D; U = uOf();
  }
  // 3. riferimento locale lungo la linea: tangente T, normale alla superficie Nn, binormale B
  const S = [0]; for (let i = 1; i < N; i++) S.push(S[i - 1] + len(sub(C[i], C[i - 1]))); const Ls = S[N - 1];
  const T = C.map((p, i) => nrm(sub(C[Math.min(N - 1, i + 2)], C[Math.max(0, i - 2)])));
  const normale = (p, u) => nrm(grad({ s: q => Fb(q, u) }, p));
  const Nn = C.map((p, i) => { const n = normale(p, U[i]); return nrm(sub(n, mul(T[i], dot(n, T[i])))); });
  // riferimento trasversale molto smussato: il nastro non si attorciglia (la conformità all'osso la dà la proiezione dei punti)
  for (let s = 0; s < 60; s++) { const Q = Nn.map(n => n.slice()); for (let i = 0; i < N; i++) { const a = Nn[Math.max(0, i - 1)], b = Nn[Math.min(N - 1, i + 1)]; Q[i] = nrm(add(mul(Nn[i], 0.5), mul(add(a, b), 0.25))); Q[i] = nrm(sub(Q[i], mul(T[i], dot(Q[i], T[i])))); } Nn.splice(0, N, ...Q); }
  const B = C.map((p, i) => nrm(cross(T[i], Nn[i])));
  const [w0, wm, w1] = Lg.w, fl = Lg.fl ?? 0.18;
  const W = u => (u < 0.5 ? mix(w0, wm, sstep(0, 0.5, u)) : mix(wm, w1, sstep(0.5, 1, u))) * (1 + fl * (1 - sstep(0, 0.18, u)) + fl * (1 - sstep(0, 0.18, 1 - u)));
  const seed = Lg.id.length * 1.7, nf = Lg.fas ?? 4;
  // 4. mesh: anelli lungo la linea; vicino agli estremi la larghezza si chiude ad arco (impronta arrotondata)
  //    e lo spessore si riduce: l'inserzione si appiattisce sull'osso. Faccia profonda proiettata sull'osso
  //    (appena dentro), faccia superficiale a cupola bassa con fascicoli, margini sottili.
  const at = s => { // punto, riferimento e u alla distanza s lungo la linea
    let i = 0; while (i < N - 2 && S[i + 1] < s) i++;
    const h = clamp((s - S[i]) / ((S[i + 1] - S[i]) || 1), 0, 1), u = mix(U[i], U[i + 1], h);
    const lerp = A => nrm(add(mul(A[i], 1 - h), mul(A[i + 1], h)));
    return { c: add(C[i], mul(sub(C[i + 1], C[i]), h)), t: lerp(T), n: lerp(Nn), b: lerp(B), u };
  };
  const M = 28, e0 = Math.min(W(0) * 0.8, Ls * 0.3), e1 = Math.min(W(1) * 0.8, Ls * 0.3), ds = 0.03;
  // ascisse degli anelli: uniformi al centro, uniformi nell'angolo sugli archi terminali (niente salti di larghezza)
  const SS = [], na = 9, nm = Math.max(8, Math.ceil((Ls - e0 - e1) / ds));
  for (let i = 0; i < na; i++) SS.push(e0 * (1 - Math.cos(Math.PI / 2 * i / na)));
  for (let i = 0; i <= nm; i++) SS.push(e0 + (Ls - e0 - e1) * i / nm);
  for (let i = na - 1; i >= 0; i--) SS.push(Ls - e1 * (1 - Math.cos(Math.PI / 2 * i / na)));
  const nr = SS.length - 1, pos = [], fdl = [], idx = [], rings = [];
  for (let r = 0; r <= nr; r++) {
    const s = SS[r], f = at(s), u = f.u;
    const k = Math.sqrt(Math.max(0, 1 - (Math.max(0, e0 - s) / e0) ** 2 - (Math.max(0, s - (Ls - e1)) / e1) ** 2));
    const Le = Math.min(0.45, Ls * 0.3), tk = 0.3 + 0.7 * sstep(0, Le, s) * sstep(0, Le, Ls - s);
    // tv = spessore visibile sopra l'osso; la faccia profonda resta appena dentro (hin) così non resta luce
    const w = W(u) * Math.max(k, 0.03), tv = Math.max(0.06, t0(u) * tk) * Math.max(k, 0.03) ** 0.5, hin = -0.012 - 0.008 * endW(u), ring = [];
    for (let j = 0; j < M; j++) {
      const th = 2 * Math.PI * j / M, cs = Math.cos(th), sn = Math.sin(th), a = w * cs;
      const q = proietta(x => Fb(x, u), add(f.c, mul(f.b, a)), hin, 6), n = nrm(add(normale(q, u), f.n));
      // fascicoli: creste longitudinali che si spostano appena lungo il legamento
      const ar = Math.abs(cs), fas = 1 + 0.06 * Math.sin((cs + 1) * Math.PI * nf + seed + 0.9 * Math.sin(s * 2.7 + seed)) * (1 - ar ** 2);
      const hgt = sn >= 0 ? (tv - hin) * Math.pow(Math.max(0, 1 - ar ** 4), 0.85) * fas : -0.006 * -sn;
      const p = add(q, mul(n, hgt)); ring.push(pos.length / 3); pos.push(...p); fdl.push(...f.t);
    }
    rings.push({ ring, c: f.c, t: f.t });
  }
  const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  // orientamento coerente su tutta la mesh: verso scelto a maggioranza (il test locale è incerto dove l'anello si chiude)
  const nrmT = (a, b, c) => cross(sub(P(b), P(a)), sub(P(c), P(a)));
  const lato = [], tappi = [[], []];
  for (let r = 0; r < nr; r++) for (let j = 0; j < M; j++) {
    const R0 = rings[r].ring, R1 = rings[r + 1].ring; lato.push([R0[j], R1[j], R0[(j + 1) % M]], [R0[(j + 1) % M], R1[j], R1[(j + 1) % M]]);
  }
  const voto = (T, outF) => T.reduce((v, t) => v + Math.sign(dot(nrmT(...t), outF(t))), 0);
  const ctr = r => mul(add(rings[r].c, rings[Math.min(nr, r + 1)].c), 0.5);
  let vL = 0; lato.forEach((t, i) => { vL += Math.sign(dot(nrmT(...t), sub(P(t[0]), ctr(Math.floor(i / (2 * M)))))); });
  [[rings[0], -1, 0], [rings[nr], 1, 1]].forEach(([R, sg, q]) => { // chiusura delle estremità (anelli già ridotti a pochi decimi di mm)
    const m = R.ring.reduce((acc, i) => add(acc, mul(P(i), 1 / M)), [0, 0, 0]), ci = pos.length / 3; pos.push(...m); fdl.push(...R.t);
    for (let j = 0; j < M; j++) tappi[q].push([ci, R.ring[j], R.ring[(j + 1) % M]]);
    const v = voto(tappi[q], () => mul(R.t, sg)); if (v < 0) tappi[q] = tappi[q].map(([a, b, c]) => [a, c, b]);
  });
  for (const [a, b, c] of lato) if (vL >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  for (const T of tappi) for (const t of T) idx.push(...t);
  const fdir = Int8Array.from(fdl.map(v => Math.round(v * 127)));
  return { pos: taubin(Float32Array.from(pos), idx, 16), idx: Uint32Array.from(idx), tag: null, fdir };
}

/* ============ Contesto: ossa e cartilagini nella griglia del legamento ============ */
function contesto(lo, hi, r, extra = []) {
  const gr = griglia(lo, hi, STEP, Math.max(0.45, r + 0.2));
  const nomi = [...OSSA, ...CART, ...extra], M = unione(nomi), { F: Fr, Do } = sdf(M), Fc = chiuso(Do, r);
  return { gr, Fr: campoB(nomi, 0.1), Fc: sfoca(Fc, 4) };
}
const bbox = pts => [[0, 1, 2].map(k => Math.min(...pts.map(p => p[k]))), [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])))];



/* ============ Anulare e quadrato (superfici implicite attorno alla testa e al collo del radio) ============ */
const ANU = {
  top: -0.3, bot: -1.2,        // cm: fascia di y coperta dall'anulare (circonferenza della testa e collo)
  gap: 0.01, t: 0.09, fine: 0.04, finePos: 0.55, pienoPos: 1.7, restringi: 0.3, sulRadio: 0.5, chiusura: 0.2,          // distanza dalla superficie ossea e spessore (0,7 mm)
  quadTop: -1.15, quadBot: -1.75, quadW: 0.3,  // quadrato: fascia di y e distanza massima dalle due ossa
};
// campo di distanza con segno di un gruppo di solidi chiusi (negativo dentro): minimo dei campi dei singoli solidi, ciascuno con la
// distanza esatta (segno dalla sua superficie) fino a `banda`. L'unione voxel con un solo passaggio esatto sbaglierebbe il segno
// dove una faccia di un solido (es. la faccia interna di una cartilagine) è più vicina della superficie del solido che contiene il punto.
function campoB(nomi, banda = 0.3) {
  let F = null;
  for (const n of nomi) { const { F: Fi } = sdf(solid_(n)); const Ei = esatta(sfoca(Fi, 1), [n], banda); if (!F) F = Ei; else for (let i = 0; i < F.length; i++) if (Ei[i] < F[i]) F[i] = Ei[i]; }
  return F;
}
const solid_ = n => G.solid(n);
function testaRadio() { // centro della testa (x, z) e centro/semiampiezza angolare dell'incisura radiale dell'ulna
  const R = REAL('radio'), U = REAL('cart_ulna'); let cx = 0, cz = 0, n = 0;
  for (let i = 0; i < R.nv; i++) { const y = R.pos[3 * i + 1]; if (y < -0.4 && y > -0.9) { cx += R.pos[3 * i]; cz += R.pos[3 * i + 2]; n++; } } cx /= n; cz /= n;
  return { cx, cz, U };
}
function anulare() {
  const { cx, cz, U } = testaRadio();
  griglia([-4.1, -1.95, -1.2], [-0.2, 0.3, 2.3], 0.02, 0.1);
  const FR = campoB(['radio', 'cart_radio']), FU = campoB(['ulna', 'cart_ulna']), FRU = campoB(['radio', 'cart_radio', 'ulna', 'cart_ulna']);
  // chiusura morfologica di radio e ulna insieme: la superficie "tesa" scavalca la rima radio-ulnare, così le estremità raggiungono l'ulna
  const { Do } = sdf(unione(['radio', 'cart_radio', 'ulna', 'cart_ulna'])), FCl = sfoca(chiuso(Do, ANU.chiusura), 2), FRs = sfoca(Float32Array.from(FR), 2);
  // incisura radiale: vertici della cartilagine ulnare vicini al radio, a livello della testa
  const A = []; for (let i = 0; i < U.nv; i++) { const p = [U.pos[3 * i], U.pos[3 * i + 1], U.pos[3 * i + 2]]; if (p[1] < 0.1 && p[1] > -1.7 && sample(FR, ...p) < 0.35) A.push(Math.atan2(p[2] - cz, p[0] - cx)); }
  const phi0 = Math.atan2(A.reduce((s, a) => s + Math.sin(a), 0), A.reduce((s, a) => s + Math.cos(a), 0));
  const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
  const hs = Math.max(...A.map(a => Math.abs(wrap(a - phi0))));
  log('anulare: incisura radiale centrata a', (phi0 * 180 / Math.PI).toFixed(0), '°, semiampiezza', (hs * 180 / Math.PI).toFixed(0), '°');
  const g = p => {
    const dr = sample(FRs, ...p), du = sample(FU, ...p), dcl = sample(FCl, ...p), dn = Math.abs(wrap(Math.atan2(p[2] - cz, p[0] - cx) - phi0));
    // verso le estremità (dn → margini dell'incisura) lo spessore scende a ANU.fine e la fascia si restringe: la fine è una pellicola che si perde sull'ulna
    const w = sstep(hs * ANU.finePos, hs * ANU.pienoPos, dn), th = ANU.fine + (ANU.t - ANU.fine) * w;
    const sup = dr < ANU.sulRadio ? dr : dcl;                                      // sul radio: distanza dal radio; verso l'ulna: dalla superficie tesa
    const wl = sstep(hs * 0.9, hs * 1.5, dn), d = (1 - wl) * dcl + wl * dr;       // fuori dall'incisura segue il radio, dentro la chiusura radio+ulna
    let e = Math.max(d - (ANU.gap + th), ANU.gap - d);                            // guscio
    const rid = 1 - w;                                                             // 0 al centro, 1 alle estremità
    e = smax(e, p[1] - (ANU.top - ANU.restringi * rid), 0.05); e = smax(e, (ANU.bot + ANU.restringi * rid) - p[1], 0.07);
    e = smax(e, hs * ANU.finePos - dn, 0.05);                                      // ultimo limite angolare: già a spessore minimo
    e = smax(e, 0.006 - du, 0.015);                                                // fuori dall'ulna
    return e;
  };
  const mesh = nets(sfoca(valuta(g), 1), p => nrm(cross([0, 1, 0], [p[0] - cx, 0, p[2] - cz])));
  return mesh;
}
/* Strutture minori già presenti (quadrato, legamento di Osborne): si conserva la forma e si spingono fuori da ossa e
   cartilagini i vertici che le attraversano, lungo il gradiente della distanza, con spostamento levigato sulla mesh. */
// distanza minima (cm) da ossa, cartilagini e dagli altri legamenti indicati (ricostruiti qui sopra)
const SPINGI = {};
function spingiFuori(nome, minimo, FO) {
  const m = realDaRevisione(ORIGINALE, nome, FILE_REPO), nv = m.pos.length / 3, nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < m.idx.length; t += 3) { const [a, b, c] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const NB = nb.map(x => [...x]), P = Float64Array.from(m.pos), P0 = Float64Array.from(m.pos);
  let giri = 0;
  for (let it = 0; it < 60; it++) {
    // spinta scalare richiesta in ogni vertice, estesa ai vicini (dilatazione) e levigata: il campo di spostamento è regolare
    let s = new Float64Array(nv), tot = 0;
    for (let i = 0; i < nv; i++) { const d = sample(FO, P[3 * i], P[3 * i + 1], P[3 * i + 2]); if (d < minimo) { s[i] = minimo - d; tot += s[i]; } }
    if (tot < 1e-4) break;
    for (let r = 0; r < 4; r++) { const q = s.slice(); for (let i = 0; i < nv; i++) for (const j of NB[i]) q[i] = Math.max(q[i], s[j] * 0.85); s = q; }
    for (let r = 0; r < 6; r++) { const q = s.slice(); for (let i = 0; i < nv; i++) { let v = s[i]; for (const j of NB[i]) v += s[j]; q[i] = v / (NB[i].length + 1); } s = q; }
    // direzione: gradiente della distanza, levigato sui vicini
    let G3 = new Float64Array(3 * nv);
    for (let i = 0; i < nv; i++) { const g = nrm(grad(FO, [P[3 * i], P[3 * i + 1], P[3 * i + 2]])); G3.set(g, 3 * i); }
    for (let r = 0; r < 4; r++) { const q = G3.slice(); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { let v = G3[3 * i + k]; for (const j of NB[i]) v += G3[3 * j + k]; q[3 * i + k] = v / (NB[i].length + 1); } G3 = q; }
    for (let i = 0; i < nv; i++) { const g = nrm([G3[3 * i], G3[3 * i + 1], G3[3 * i + 2]]); for (let k = 0; k < 3; k++) P[3 * i + k] += g[k] * s[i] * 0.7; }
    giri = it;
  }
  const mosso = giri;
  let n = 0, md = 0; for (let i = 0; i < nv; i++) { const d = Math.hypot(P[3 * i] - P0[3 * i], P[3 * i + 1] - P0[3 * i + 1], P[3 * i + 2] - P0[3 * i + 2]); if (d > 0.002) n++; md = Math.max(md, d); }
  log(nome, 'spinto fuori dalle ossa:', n, 'vertici spostati (max', md.toFixed(2), 'cm,', mosso + 1, 'giri)');
  return { pos: Float32Array.from(P), idx: Uint32Array.from(m.idx), tag: m.tag, fdir: m.fdir };
}

/* ============ Tabella dei legamenti collaterali ============ */
/* p: punti guida origine → inserzione; w: semilarghezze [origine, centro, inserzione]; t: spessore al centro;
   r: raggio della chiusura morfologica (quanto il legamento resta teso sopra le concavità e la rima articolare) */
const LEG = [
  // collaterale ulnare (mediale). Riferimenti sull'ulna: tubercolo sublime (1,27; −1,10; 0,2); margine mediale dell'olecrano (1,35; 0,7; −1,45);
  // sull'omero: faccia antero-inferiore dell'epicondilo mediale (cima: 3,28; 1,37; 0,05)
  { id: 'ucl_ant', p: [[2.75, 0.95, 0.3], [2.2, 0.5, 0.36], [1.7, -0.25, 0.33], [1.4, -0.8, 0.27], [1.27, -1.08, 0.2]], w: [0.2, 0.19, 0.26], t: 0.07, r: 1.1, fas: 4 },
  { id: 'ucl_post', p: [[2.8, 0.95, -0.3], [2.1, 0.85, -0.95], [1.4, 0.7, -1.43]], w: [0.2, 0.42, 0.62], t: 0.065, r: 0.8, fas: 6 },
  { id: 'ucl_trasv', p: [[1.22, 0.1, -1.02], [1.13, -0.5, -0.75], [1.2, -0.85, -0.4], [1.27, -1.05, 0.05]], w: [0.1, 0.1, 0.1], t: 0.06, r: 0.25, fas: 3 },
  // collaterale radiale e collaterale ulnare laterale (origine comune sotto l'epicondilo laterale)
  { id: 'rcl', p: [[-2.85, 1.4, -0.4], [-2.98, 0.6, -0.1], [-3.08, -0.2, 0.12], [-3.1, -0.6, 0.2]], w: [0.17, 0.2, 0.28], t: 0.06, r: 1.0, fas: 5, fl: 0.1, extra: ['anulare'] },
  { id: 'lucl', p: [[-2.85, 1.4, -0.4], [-3.02, 0.5, -0.5], [-2.85, -0.3, -0.78], [-2.2, -1.15, -0.72], [-1.5, -1.8, -0.45]], w: [0.17, 0.17, 0.22], t: 0.055, r: 0.9, fas: 4, fl: 0.1, extra: ['anulare'] },
];

/* ============ Esecuzione ============ */
const args = process.argv.slice(2), prova = (args.find(a => a.startsWith('--prova=')) || '').split('=')[1];
const SOLO = args.filter(a => !a.startsWith('--')), vuole = id => !SOLO.length || SOLO.includes(id);
const uscita = {};
const registra = (id, mesh) => { setMesh(id, mesh); if (prova) uscita[id] = { pos: Array.from(mesh.pos, v => +v.toFixed(4)), idx: Array.from(mesh.idx) }; };
if (vuole('anulare')) { const mesh = anulare(); log('anulare', mesh.pos.length / 3, 'vertici'); registra('anulare', mesh); }
for (const Lg of LEG) {
  if (!vuole(Lg.id)) continue;
  const [lo, hi] = bbox(Lg.p), ctx = contesto(lo, hi, Lg.r, Lg.extra || []), mesh = nastro(Lg, ctx);
  log(Lg.id, mesh.pos.length / 3, 'vertici');
  if (prova) (uscita.__pts ||= []).push(...Lg._g.map((q, i) => [...q, i === 0 ? 0xff0000 : i === Lg._g.length - 1 ? 0x0000ff : 0xffff00, 0.04]));
  registra(Lg.id, mesh);
}
// correzioni delle strutture già presenti, dopo i legamenti ricostruiti (che fanno da ostacolo)
for (const [id, o] of Object.entries(SPINGI)) {
  if (!vuole(id)) continue;
  const m = realDaRevisione(ORIGINALE, id, FILE_REPO); let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < m.pos.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], m.pos[i]); hi[k] = Math.max(hi[k], m.pos[i]); }
  grigliaG(lo.map(v => v - 0.5), hi.map(v => v + 0.5), 0.03, 0); const FO = campoB([...OSSA, ...CART, ...o.ostacoli], 0.3);
  registra(id, spingiFuori(id, o.min, FO));
}
/* ---------- verifica: vertici dei legamenti dentro ossa e cartilagini (atteso: pochi, e a meno di 0,3 mm) ---------- */
{
  grigliaG([-4, -3, -3], [3.8, 2.5, 3], 0.04, 0);
  const H = G.H, SD = {};
  for (const o of [...OSSA, ...CART]) { const M = G.solid(o), Do = G.edt(M), Di = G.edt(M, true), F = new Float32Array(G.N); for (let i = 0; i < G.N; i++) F[i] = M[i] ? -(Di[i] - H / 2) : Do[i] - H / 2; SD[o] = esatta(F, [o], 0.1); }
  for (const id of [...LEG.map(l => l.id), 'anulare', ...Object.keys(SPINGI)]) { if (!vuole(id)) continue; const P = REAL(id).pos, nv = P.length / 3, r = [];
    for (const o of [...OSSA, ...CART]) { let k = 0, mx = 0, mn = 9; for (let i = 0; i < nv; i++) { const d = sample(SD[o], P[3 * i], P[3 * i + 1], P[3 * i + 2]); mn = Math.min(mn, d); if (d < -0.03) { k++; mx = Math.max(mx, -d); } } if (k) r.push(`${o} ${k} (${(100 * k / nv).toFixed(0)}%, max ${mx.toFixed(2)})`); }
    log(id, 'verifica: dentro', r.length ? r.join('; ') : 'niente (>0,3 mm)'); }
}
if (prova) { for (const o of [...OSSA, ...CART]) { const m = REAL(o); uscita[o] = { pos: Array.from(m.pos, v => +v.toFixed(4)), idx: Array.from(m.idx) }; } writeFileSync(prova, JSON.stringify(uscita)); log('scritto', prova); }
else saveFile(repack());
