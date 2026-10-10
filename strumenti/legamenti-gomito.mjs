/* Legamenti del gomito (modelli/gomito-3d.html): collaterali ulnare e radiale, anulare, quadrato, membrana interossea e legamento di Osborne
   (con i muscoli che lo invadevano: FCU, tricipite mediale, tendine flessore comune).

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
    const w = W(u) * Math.max(k, 0.03), tv = Math.max(0.03, t0(u) * tk) * Math.max(k, 0.03) ** 0.5, hin = -0.012 - 0.008 * endW(u), ring = [];
    for (let j = 0; j < M; j++) {
      const th = 2 * Math.PI * j / M, cs = Math.cos(th), sn = Math.sin(th), a = w * cs;
      const q = proietta(x => Fb(x, u), add(f.c, mul(f.b, a)), hin, 6), n = nrm(add(normale(q, u), f.n));
      // fascicoli: creste longitudinali che si spostano appena lungo il legamento
      const ar = Math.abs(cs), fas = 1 + 0.06 * Math.sin((cs + 1) * Math.PI * nf + seed + 0.9 * Math.sin(s * 2.7 + seed)) * (1 - ar ** 2);
      const hgt = sn >= 0 ? (tv - hin) * Math.pow(Math.max(0, 1 - ar ** 4), Lg.plat ?? 0.85) * fas : -0.006 * -sn;
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
function distTubi(tubi) { // distanza con segno (negativa dentro) dai tubi {pts, r}, su tutta la griglia corrente
  return valuta(p => { let d = 1e9; for (const t of tubi) for (let i = 0; i < t.pts.length - 1; i++) { const a = t.pts[i], b = t.pts[i + 1], ab = sub(b, a), q = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1); d = Math.min(d, len(sub(p, add(a, mul(ab, q)))) - t.r); } return d; });
}
function contesto(lo, hi, r, extra = [], tubi = []) {
  const gr = griglia(lo, hi, STEP, Math.max(0.45, r + 0.2));
  const nomi = [...OSSA, ...CART, ...extra], M = unione(nomi), { F: Fr, Do } = sdf(M);
  // strutture tubolari non presenti come mesh (nervo ulnare): distanza dall'asse meno il raggio, come ostacolo
  const Ft = tubi.length ? distTubi(tubi) : null;
  if (Ft) for (let i = 0; i < M.length; i++) if (Ft[i] < 0) M[i] = 1;
  const { Do: Do2 } = Ft ? sdf(M) : { Do };
  const Fb = campoB(nomi, 0.1); if (Ft) for (let i = 0; i < Fb.length; i++) if (Ft[i] < Fb[i]) Fb[i] = Ft[i];
  return { gr, Fr: Fb, Fc: sfoca(chiuso(Do2, r), 4) };
}
const tuboNervo = id => JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]).pts[id].filter(p => p[1] < 5 && p[1] > -3);
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
/* Strutture già presenti (non più usato: quadrato e Osborne sono ora ricostruiti): si conserva la forma e si spingono fuori da ossa e
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


/* ============ Quadrato: guscio sulla rima tra collo del radio e ulna ============ */
const QUAD = { maxY: -1.28, scendi: 0.3, t: 0.05, passi: 60, colonne: 9, sotto: 0.035, bordo: 0.18, sag: 0.03, arco: 1.0 };
function quadrato() {
  // Lamina continua dal margine inferiore dell'incisura radiale dell'ulna al collo del radio: per ogni angolo ψ sull'arco dell'incisura
  // (stessa ampiezza dell'anulare) un raggio orizzontale dall'asse della testa trova il collo (ultima intersezione col radio, QUAD.scendi più in basso
  // del margine) e la parete dell'ulna (prima intersezione oltre il radio, a livello del margine inferiore dell'incisura). La lamina è la superficie rigata
  // tra le due curve, con un leggero cedimento verso il basso; le due inserzioni entrano di QUAD.sotto nell'osso.
  const { cx, cz, U } = testaRadio(), Rm = REAL('radio'), Um = REAL('ulna');
  griglia([-3.4, -2.4, -1.2], [-0.2, -0.85, 1.6], 0.025, 0.1);
  const FR = campoB(['radio', 'cart_radio']);
  const A = [];
  for (let i = 0; i < U.nv; i++) { const p = [U.pos[3 * i], U.pos[3 * i + 1], U.pos[3 * i + 2]]; if (p[1] < 0.1 && p[1] > -1.8 && sample(FR, ...p) < 0.35) A.push([Math.atan2(p[2] - cz, p[0] - cx), p[1]]); }
  const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
  const phi0 = Math.atan2(A.reduce((s, a) => s + Math.sin(a[0]), 0), A.reduce((s, a) => s + Math.cos(a[0]), 0));
  const hs = Math.max(...A.map(a => Math.abs(wrap(a[0] - phi0)))) * QUAD.arco;
  // quota del margine inferiore dell'incisura per angolo: minimo di y della cartilagine ulnare per fasce di angolo, poi levigato
  const nb = 24, yMin = new Array(nb).fill(null); for (const [an, y] of A) { const k = Math.round((wrap(an - phi0) / hs + 1) / 2 * (nb - 1)); if (k >= 0 && k < nb) yMin[k] = yMin[k] === null ? y : Math.min(yMin[k], y); }
  for (let k = 0; k < nb; k++) if (yMin[k] === null) { let j = 1; while (yMin[k] === null) { const v = yMin[k - j] ?? yMin[k + j]; if (v !== undefined && v !== null) yMin[k] = v; j++; if (j > nb) break; } }
  const yS = yMin.map((_, k) => { let q = 0, n = 0; for (let d = -3; d <= 3; d++) { const v = yMin[clamp(k + d, 0, nb - 1)]; if (v !== null) { q += v; n++; } } return q / n; });
  const yAt = u => { const f = clamp(u * (nb - 1), 0, nb - 1.001), i = Math.floor(f), h = f - i; return yS[i] * (1 - h) + yS[i + 1] * h; };
  const nr = QUAD.passi, nc = QUAD.colonne, G2 = [], TH = [];
  // 0. estensione utile dell'arco: gli angoli in cui il raggio dal centro della testa incontra davvero la parete dell'ulna
  const ok = i => { const u = i / (nr - 1), psi = phi0 + hs * (2 * u - 1), d = [Math.cos(psi), 0, Math.sin(psi)], yU = Math.min(yAt(u) - 0.02, QUAD.maxY), yR = yU - QUAD.scendi;
    const tr = raggioMesh([cx, yR, cz], d, Rm); if (!tr.length) return false; return raggioMesh([cx, yU, cz], d, Um).some(t => t > tr[tr.length - 1] + 0.02); };
  let i0 = 0, i1 = nr - 1; while (i0 < nr && !ok(i0)) i0++; while (i1 > 0 && !ok(i1)) i1--;
  const uMin = i0 / (nr - 1), uMax = Math.max(uMin + 0.1, i1 / (nr - 1)), phiA = phi0 + hs * (2 * uMin - 1), phiB = phi0 + hs * (2 * uMax - 1);
  const angolo = u => phiA + (phiB - phiA) * u;
  // 1. raggi per ogni angolo: distanza del collo (tR) e della parete ulnare (tU); i valori mancanti si interpolano, poi si levigano
  const tRv = [], tUv = [], yUv = [];
  for (let i = 0; i < nr; i++) {
    const u = i / (nr - 1), uu = uMin + (uMax - uMin) * u, psi = angolo(u), d = [Math.cos(psi), 0, Math.sin(psi)], yU = Math.min(yAt(uu) - 0.02, QUAD.maxY), yR = yU - QUAD.scendi;
    const tr = raggioMesh([cx, yR, cz], d, Rm), tu = raggioMesh([cx, yU, cz], d, Um); const r = tr.length ? tr[tr.length - 1] : null;
    tRv.push(r); tUv.push(r === null ? null : (tu.find(t => t > r + 0.02) ?? null)); yUv.push(yU);
  }
  const riempi = A => { const o = A.slice(); for (let i = 0; i < o.length; i++) if (o[i] === null) { let l = i - 1, r = i + 1; while (l >= 0 && o[l] === null) l--; while (r < o.length && A[r] === null) r++; o[i] = l >= 0 && r < o.length ? o[l] + (A[r] - o[l]) * (i - l) / (r - l) : (l >= 0 ? o[l] : A[r]); } return o; };
  const lisc = A => A.map((_, i) => { let q = 0, n = 0; for (let k = -4; k <= 4; k++) { q += A[clamp(i + k, 0, A.length - 1)]; n++; } return q / n; });
  const tRs = lisc(lisc(riempi(tRv))), tUs = lisc(lisc(riempi(tUv))), yUs = lisc(yUv);
  for (let i = 0; i < nr; i++) {
    const u = i / (nr - 1), psi = angolo(u), d = [Math.cos(psi), 0, Math.sin(psi)], yU = yUs[i], yR = yU - QUAD.scendi, tR = tRs[i], tU = Math.max(tUs[i], tR + 0.12);
    const R = [cx + d[0] * tR, yR, cz + d[2] * tR], Uu = [cx + d[0] * tU, yU, cz + d[2] * tU], e = nrm(sub(Uu, R));
    const Rin = add(R, mul(e, -QUAD.sotto)), Uin = add(Uu, mul(e, QUAD.sotto)), row = [], tr2 = [];
    for (let j = 0; j < nc; j++) { const sj = j / (nc - 1), q = add(mul(Rin, 1 - sj), mul(Uin, sj)); q[1] -= QUAD.sag * Math.sin(Math.PI * sj);       // cedimento verso il basso al centro
      row.push(q); const bordo = 1 - sstep(0, QUAD.bordo, Math.min(sj, 1 - sj)); tr2.push(QUAD.t * Math.sqrt(Math.max(0, 1 - bordo * bordo)) * Math.sqrt(Math.max(0, 1 - sstep(0.88, 1, Math.abs(2 * u - 1)) ** 2)) + 0.004); }
    G2.push(row); TH.push(tr2);
  }
  const pos = [], fd = [], idx = [], id = (f, i, j) => 2 * (i * nc + j) + f;
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
    const P = G2[i][j], di = sub(G2[Math.min(nr - 1, i + 1)][j], G2[Math.max(0, i - 1)][j]), dj = sub(G2[i][Math.min(nc - 1, j + 1)], G2[i][Math.max(0, j - 1)]), n = nrm(cross(di, dj)), h = TH[i][j] / 2;
    pos.push(...add(P, mul(n, h)), ...sub(P, mul(n, h))); const f = nrm(dj); fd.push(...f, ...f); }
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) { const a = [i, j], b = [i + 1, j], c = [i + 1, j + 1], d2 = [i, j + 1];
    idx.push(id(0, ...a), id(0, ...b), id(0, ...c), id(0, ...a), id(0, ...c), id(0, ...d2)); idx.push(id(1, ...a), id(1, ...c), id(1, ...b), id(1, ...a), id(1, ...d2), id(1, ...c)); }
  // lati della lamina: chiusura perimetrale per avere un solido
  const lato = (f, g, h2) => idx.push(f, g, h2);
  for (let i = 0; i < nr - 1; i++) { for (const j of [0, nc - 1]) { const a = id(0, i, j), b = id(1, i, j), c = id(0, i + 1, j), d2 = id(1, i + 1, j); if (j === 0) { lato(a, b, c); lato(b, d2, c); } else { lato(a, c, b); lato(b, c, d2); } } }
  for (let j = 0; j < nc - 1; j++) { for (const i of [0, nr - 1]) { const a = id(0, i, j), b = id(1, i, j), c = id(0, i, j + 1), d2 = id(1, i, j + 1); if (i === 0) { lato(a, c, b); lato(b, c, d2); } else { lato(a, b, c); lato(b, d2, c); } } }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: Int8Array.from(fd.map(v => Math.round(v * 127))) };
}

/* ============ Membrana interossea: lamina tra le creste interossee di radio e ulna ============ */
const MIO = { y0: -4.7, y1: -12, obliqua: 1.2, spess: 0.05, sotto: 0.035, colonne: 16, passo: 0.1 };
function raggioMesh(o, d, M) { // parametri t > 0 delle intersezioni del raggio con la mesh
  const ts = [], P = M.pos, I = M.idx;
  for (let t = 0; t < I.length; t += 3) { const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]], h = cross(d, e2), det = dot(e1, h); if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det, sv = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]], u = f * dot(sv, h); if (u < 0 || u > 1) continue; const q = cross(sv, e1), v = f * dot(d, q); if (v < 0 || u + v > 1) continue; const tt = f * dot(e2, q); if (tt > 1e-6) ts.push(tt); }
  return ts.sort((x, y) => x - y);
}
function creste() { // punti di cresta interossea di radio (R) e ulna (U) a ogni quota y, rivolti l'uno verso l'altro, e verso R→U
  const Rm = REAL('radio'), Um = REAL('ulna'), cen = (M, y) => { let n = 0, x = 0, z = 0; for (let i = 0; i < M.pos.length; i += 3) if (Math.abs(M.pos[i + 1] - y) < 0.2) { x += M.pos[i]; z += M.pos[i + 2]; n++; } return [x / n, y, z / n]; };
  const ys = [], R = [], U = [], E = [];
  for (let y = -3.6; y >= -11.95; y -= MIO.passo) { const Rc = cen(Rm, y), Uc = cen(Um, y); let e = [Uc[0] - Rc[0], 0, Uc[2] - Rc[2]]; const l = Math.hypot(...e); e = e.map(v => v / l);
    const tr = raggioMesh(Rc, e, Rm), tu = raggioMesh(Uc, e.map(v => -v), Um);
    ys.push(y); R.push(Rc.map((v, i) => v + e[i] * tr[tr.length - 1])); U.push(Uc.map((v, i) => v - e[i] * tu[tu.length - 1])); E.push(e); }
  const liscia = A => A.map((_, i) => { let q = [0, 0, 0], n = 0; for (let k = -4; k <= 4; k++) { const j = clamp(i + k, 0, A.length - 1); for (let a = 0; a < 3; a++) q[a] += A[j][a]; n++; } return q.map(v => v / n); });
  return { ys, R: liscia(R), U: liscia(U), E: liscia(E).map(nrm) };
}
function membrana() {
  const C = creste(), at = (A, y) => { const f = clamp((C.ys[0] - y) / MIO.passo, 0, C.ys.length - 1.001), i = Math.floor(f), h = f - i; return [0, 1, 2].map(a => A[i][a] * (1 - h) + A[i + 1][a] * h); };
  const nr = Math.round((MIO.y0 - MIO.y1) / MIO.passo) + 1, nc = MIO.colonne, griglia_ = [], th = [];
  for (let i = 0; i < nr; i++) { const yr = MIO.y0 - i * MIO.passo, yu = Math.max(yr - MIO.obliqua, -11.95), Rp = at(C.R, yr), Up = at(C.U, yu), e = nrm(sub(Up, Rp));
    const Rin = add(Rp, mul(e, -MIO.sotto)), Uin = add(Up, mul(e, MIO.sotto)), row = [], tr = [];
    for (let j = 0; j < nc; j++) { const sj = j / (nc - 1); row.push(add(mul(Rin, 1 - sj), mul(Uin, sj)));
      const bordo = 1 - sstep(0, 0.12, Math.min(sj, 1 - sj));                                             // sui lati (inserzioni) la lamina si fonde nell'osso
      tr.push(MIO.spess * Math.sqrt(Math.max(0, 1 - bordo * bordo)) * sstep(0, 0.35, i * MIO.passo)); }  // margine prossimale libero: si assottiglia
    griglia_.push(row); th.push(tr); }
  const pos = [], fd = [], idx = [], id = (f, i, j) => 2 * (i * nc + j) + f;
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
    const P = griglia_[i][j], di = sub(griglia_[Math.min(nr - 1, i + 1)][j], griglia_[Math.max(0, i - 1)][j]), dj = sub(griglia_[i][Math.min(nc - 1, j + 1)], griglia_[i][Math.max(0, j - 1)]), n = nrm(cross(di, dj)), h = th[i][j] / 2;
    pos.push(...add(P, mul(n, h)), ...sub(P, mul(n, h))); const e = nrm(dj); fd.push(...e, ...e); }
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) { const a = [i, j], b = [i + 1, j], c = [i + 1, j + 1], d = [i, j + 1];
    idx.push(id(0, ...a), id(0, ...b), id(0, ...c), id(0, ...a), id(0, ...c), id(0, ...d)); idx.push(id(1, ...a), id(1, ...c), id(1, ...b), id(1, ...a), id(1, ...d), id(1, ...c)); }
  const taglio = Float32Array.from(pos); for (let i = 1; i < taglio.length; i += 3) if (taglio[i] < -12) taglio[i] = -12;   // sezione di taglio della finestra: y = −12
  return { pos: taglio, idx: Uint32Array.from(idx), tag: null, fdir: Int8Array.from(fd.map(v => Math.round(v * 127))) };
}

/* ============ Tabella dei legamenti collaterali ============ */
/* p: punti guida origine → inserzione; w: semilarghezze [origine, centro, inserzione]; t: spessore al centro;
   r: raggio della chiusura morfologica (quanto il legamento resta teso sopra le concavità e la rima articolare) */
const LEG = [
  // collaterale ulnare (mediale). Riferimenti sull'ulna: tubercolo sublime (1,27; −1,10; 0,2); margine mediale dell'olecrano (1,35; 0,7; −1,45);
  // sull'omero: faccia antero-inferiore dell'epicondilo mediale (cima: 3,28; 1,37; 0,05)
  { id: 'ucl_ant', p: [[2.75, 0.95, 0.3], [2.2, 0.5, 0.36], [1.7, -0.25, 0.33], [1.4, -0.8, 0.27], [1.27, -1.08, 0.2]], w: [0.2, 0.19, 0.26], t: 0.07, r: 1.1, fas: 4 },
  { id: 'ucl_post', p: [[2.8, 0.95, -0.3], [2.1, 0.85, -0.95], [1.4, 0.7, -1.43]], w: [0.2, 0.42, 0.62], t: 0.065, r: 0.8, fas: 6 },
  { id: 'ucl_trasv', p: [[1.17, -0.12, -0.95], [1.13, -0.38, -0.8], [1.12, -0.6, -0.7], [1.2, -0.9, -0.35], [1.28, -1.07, 0.02]], w: [0.12, 0.13, 0.16], t: 0.05, r: 0.2, fas: 3, fl: 0.0, plat: 0.35 },
  // collaterale radiale e collaterale ulnare laterale (origine comune sotto l'epicondilo laterale)
  { id: 'rcl', p: [[-2.85, 1.4, -0.4], [-2.98, 0.6, -0.1], [-3.08, -0.2, 0.12], [-3.1, -0.6, 0.2]], w: [0.17, 0.2, 0.28], t: 0.06, r: 1.0, fas: 5, fl: 0.1, extra: ['anulare'] },
  { id: 'lucl', p: [[-2.85, 1.4, -0.4], [-3.02, 0.5, -0.5], [-2.85, -0.3, -0.78], [-2.2, -1.15, -0.72], [-1.5, -1.8, -0.45]], w: [0.17, 0.17, 0.22], t: 0.055, r: 0.9, fas: 4, fl: 0.1, extra: ['anulare', 'quadrato'] },
  // legamento di Osborne (retinacolo del tunnel cubitale): dalla faccia posteriore dell'epicondilo mediale al margine mediale dell'olecrano,
  // a ponte sopra il nervo ulnare e il fascio posteriore del collaterale ulnare (che fanno da ostacolo: nervo = tubo di raggio 2 mm, vedi `tubi`)
  { id: 'osborne', p: [[3.18, 1.2, -0.3], [2.95, 1.1, -0.95], [2.2, 1.05, -1.45], [1.3, 1.1, -1.3]], w: [0.4, 0.5, 0.42], t: 0.07, r: 0.9, fas: 5, fl: 0.12, plat: 0.5, extra: ['ucl_post'], tubi: 'n_ulnare' },
];


/* ============ Muscoli che invadono il retinacolo: si ritraggono dietro la faccia superficiale di Osborne ============ */
/* Il FCU, il capo mediale del tricipite e il tendine flessore comune del modello arrivano fino al tunnel cubitale: dove la superficie di un muscolo sta
   sul lato profondo del retinacolo (o dentro di esso) viene portata appena oltre la faccia superficiale, con spostamento levigato e smorzato con la
   distanza dalla lamina. Riparte sempre dalle mesh originali. */
const SGOMBRA = { muscoli: ['fcu', 'tri_med', 'cft'], margine: 0.03, portata: 0.9, dolce: [0.35, 0.9], passate: 6 };
function sgombraMuscoli() {
  const B = REAL('osborne'), nb = B.pos.length / 3, nerv = [{ pts: tuboNervo('n_ulnare'), r: 0.2 }];
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < B.pos.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], B.pos[i]); hi[k] = Math.max(hi[k], B.pos[i]); }
  grigliaG(lo.map(v => v - 0.6), hi.map(v => v + 0.6), 0.04, 0);
  const Fd = campoB([...OSSA, ...CART, 'ucl_post'], 0.35), Ft = distTubi(nerv); for (let i = 0; i < Fd.length; i++) if (Ft[i] < Fd[i]) Fd[i] = Ft[i];
  const nOut = Array.from({ length: nb }, (_, i) => nrm(grad(Fd, [B.pos[3 * i], B.pos[3 * i + 1], B.pos[3 * i + 2]])));  // verso "fuori": lontano da ossa, collaterale e nervo
  const res = {};
  for (const id of SGOMBRA.muscoli) {
    const m = realDaRevisione(ORIGINALE, id, FILE_REPO), nv = m.pos.length / 3, P = Float64Array.from(m.pos), D = new Float64Array(3 * nv);
    let s = new Float64Array(nv), sx = [new Float64Array(nv), new Float64Array(nv), new Float64Array(nv)], n = 0, mx = 0;
    for (let i = 0; i < nv; i++) {
      const p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]]; let bj = -1, bd = 1e9;
      for (let j = 0; j < nb; j++) { const d = (B.pos[3 * j] - p[0]) ** 2 + (B.pos[3 * j + 1] - p[1]) ** 2 + (B.pos[3 * j + 2] - p[2]) ** 2; if (d < bd) { bd = d; bj = j; } }
      bd = Math.sqrt(bd); if (bd > SGOMBRA.portata) continue;
      const q = [B.pos[3 * bj], B.pos[3 * bj + 1], B.pos[3 * bj + 2]], d = dot(sub(p, q), nOut[bj]);
      if (d >= SGOMBRA.margine) continue;
      const w = 1 - sstep(SGOMBRA.dolce[0], SGOMBRA.dolce[1], bd), spost = (SGOMBRA.margine - d) * w;
      for (let k = 0; k < 3; k++) sx[k][i] = nOut[bj][k] * spost;
      n++; mx = Math.max(mx, spost);
    }
    // levigatura dello spostamento sui vicini (stessi vertici, stessa topologia)
    const NB = Array.from({ length: nv }, () => new Set());
    for (let t = 0; t < m.idx.length; t += 3) { const [a, b, c] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]]; NB[a].add(b).add(c); NB[b].add(a).add(c); NB[c].add(a).add(b); }
    for (let r = 0; r < SGOMBRA.passate; r++) for (let k = 0; k < 3; k++) { const q = sx[k].slice(); for (let i = 0; i < nv; i++) { let v = sx[k][i], c = 1; for (const j of NB[i]) { v += sx[k][j]; c++; } q[i] = v / c; } sx[k] = q; }
    const pos = new Float32Array(3 * nv); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) pos[3 * i + k] = P[3 * i + k] + sx[k][i];
    log(id, 'ritratto dal retinacolo:', n, 'vertici spinti (max', (mx * 10).toFixed(1), 'mm)');
    registra(id, { pos, idx: Uint32Array.from(m.idx), tag: m.tag, fdir: m.fdir }); res[id] = true;
  }
}

/* ============ Esecuzione ============ */
const args = process.argv.slice(2), prova = (args.find(a => a.startsWith('--prova=')) || '').split('=')[1];
const SOLO = args.filter(a => !a.startsWith('--')), vuole = id => !SOLO.length || SOLO.includes(id);
const uscita = {};
const registra = (id, mesh) => { setMesh(id, mesh); if (prova) uscita[id] = { pos: Array.from(mesh.pos, v => +v.toFixed(4)), idx: Array.from(mesh.idx) }; };
if (vuole('anulare')) { const mesh = anulare(); log('anulare', mesh.pos.length / 3, 'vertici'); registra('anulare', mesh); }
if (vuole('quadrato')) { const mesh = quadrato(); log('quadrato', mesh.pos.length / 3, 'vertici'); registra('quadrato', mesh); }
if (vuole('mio')) { const mesh = membrana(); log('mio', mesh.pos.length / 3, 'vertici'); registra('mio', mesh); }
for (const Lg of LEG) {
  if (!vuole(Lg.id)) continue;
  const [lo, hi] = bbox(Lg.p), ctx = contesto(lo, hi, Lg.r, Lg.extra || [], Lg.tubi ? [{ pts: tuboNervo(Lg.tubi), r: 0.23 }] : []), mesh = nastro(Lg, ctx);
  log(Lg.id, mesh.pos.length / 3, 'vertici');
  if (prova) (uscita.__pts ||= []).push(...Lg._g.map((q, i) => [...q, i === 0 ? 0xff0000 : i === Lg._g.length - 1 ? 0x0000ff : 0xffff00, 0.04]));
  registra(Lg.id, mesh);
}
if (vuole('osborne') || vuole('fcu')) sgombraMuscoli();
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
  for (const id of [...LEG.map(l => l.id), "anulare", ...Object.keys(SPINGI)]) { if (!vuole(id)) continue; const P = REAL(id).pos, nv = P.length / 3, r = [];
    for (const o of [...OSSA, ...CART]) { let k = 0, mx = 0, mn = 9; for (let i = 0; i < nv; i++) { const d = sample(SD[o], P[3 * i], P[3 * i + 1], P[3 * i + 2]); mn = Math.min(mn, d); if (d < -0.03) { k++; mx = Math.max(mx, -d); } } if (k) r.push(`${o} ${k} (${(100 * k / nv).toFixed(0)}%, max ${mx.toFixed(2)})`); }
    log(id, 'verifica: dentro', r.length ? r.join('; ') : 'niente (>0,3 mm)'); }
}
if (prova) { for (const o of [...OSSA, ...CART]) { const m = REAL(o); uscita[o] = { pos: Array.from(m.pos, v => +v.toFixed(4)), idx: Array.from(m.idx) }; } writeFileSync(prova, JSON.stringify(uscita)); log('scritto', prova); }
else saveFile(repack());
