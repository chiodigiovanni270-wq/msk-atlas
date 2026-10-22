/* Capo breve del bicipite della spalla (modelli/spalla-3d.html): decorso liscio davanti al sottoscapolare, dall'apice del coracoide in giù.

   Problema. `separa` (in `muscoli-spalla.mjs`) porta il capo breve davanti al sottoscapolare spostando in avanti i vertici che lo attraversano, con
   uno spostamento reso liscio come una membrana: la faccia posteriore va avanti fino a 4–5 mm, quella anteriore molto meno (il deltoide è davanti),
   quindi sotto il coracoide il tendine diventa una lamina schiacciata e irregolare, con una gobba sul margine laterale e una piega a S nel profilo.

   Uso (dalla cartella del progetto):
     node strumenti/capo-breve-spalla.mjs                → riscrive `bic_breve` nel file del modello
     PROVA=1 node strumenti/capo-breve-spalla.mjs        → stampa profili e controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/capo-breve-spalla.mjs   → lavora su una copia
   Va lanciato dopo `rifinitura-subs-spalla.mjs` (che sposta anche il capo breve) e dopo `capo-lungo-spalla.mjs`; `borsa-spalla.mjs` non ne dipende.
   Riparte dalla forma del capo breve prima di `separa` (revisione `PARTENZA`) e da quella della revisione `BASE` (stessa topologia), con le altre
   strutture del file come ostacoli, quindi si può rilanciare con lo stesso risultato. Se si rilanciano `muscoli-spalla.mjs` o `rifinitura-subs-spalla.mjs`,
   aggiornare `BASE`.

   Metodo. Il capo breve scende quasi verticale (y): per fette orizzontali (`FETTA`) la sezione di `PARTENZA` è mossa solo in avanti (z) con una mappa
   affine z' = c(y) + b(y)·(z − zc(y)) (zc = centro della fetta), liscia in y e con b > 0: la sezione resta regolare (traslata e, se serve, assottigliata
   in modo uniforme) e la mappa non può creare pieghe. Nessuno spostamento per singolo vertice e nessuna levigatura sulla mesh (creavano pieghe).
   1. Margini laterale e mediale: x minimo e massimo di ogni fetta contro i loro profili levigati (`SIGMA_MARG`); correzione lineare in x tra i due
      margini, levigata lungo y (`SIGMA_CORR`): via la gobba del margine laterale sotto la giunzione muscolo-tendinea (al massimo ~1 mm).
   2. Pavimento e tetto: le superfici di sottoscapolare, capsula, coraco-omerale, omero, cartilagine, capo lungo e trasverso (`DIETRO`) e di deltoide e
      grande pettorale (`DAVANTI`) sono campionate su una griglia (x, y) di passo `CELLA`; un punto sta dietro o davanti secondo la metà dello spessore
      del capo breve di `BASE` nella stessa cella; per ogni vertice valgono le 9 celle attorno (prudente).
   3. Per ogni fetta il b più grande (≤ 1, ≥ `B_MIN`) per cui esiste c con tutti i vertici ad almeno `GAP` da pavimento e tetto; c = il minimo (il tendine
      poggia sul sottoscapolare). Sopra `Y_FISSO` (apice del coracoide, inserzione) b e c sono quelli della mappa affine che porta meglio PARTENZA su
      BASE (residuo ≤ 0,3 mm): lì resta la forma di BASE, che nel frattempo si è adattata al margine superiore del sottoscapolare.
   4. Profili lisci con i vincoli: inviluppo a pendenza limitata (b sotto il possibile, `PEND_B` per cm; c sopra il minimo, `PEND_C` cm per cm), poi
      gaussiana (`LISCIA`) e di nuovo il vincolo.
   5. Raccordo con BASE: forma nuova piena sopra `Y_PIENO`, smoothstep fino a BASE a `Y_FINE` (ventre, dove le due forme quasi coincidono) e, in alto,
      su `RACCORDO` sotto `Y_FISSO`.
   Il tetto non lascia posto in qualche fetta a y 0–0,5: lì il deltoide clavicolare entra già nel capo breve in BASE (e attraversa anche sottoscapolare e
   coracobrachiale), problema del deltoide che questo script non tocca. Controlli stampati: margini, b per fetta, profilo in z per fetta (BASE e nuovo),
   distanza minima sulla griglia da pavimento e tetto, triangoli che si incrociano con le strutture vicine (BASE → nuovo), spostamento massimo.
   Le normali le ricalcola la pagina. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, posDaRevisione, saveFile, repack, log, sstep, clamp } = G;

const PARTENZA = '27ecf50', BASE = 'e84af51', NOME = 'bic_breve', FILE = 'modelli/spalla-3d.html';
const DIETRO = ['subs', 'caps', 'coraco_om', 'omero', 'cart_omero', 'bic_lungo', 'trasv_om'];
const DAVANTI = ['delt_cl', 'delt_ac', 'pec_cl'];
const CONTROLLO = ['subs', 'coracobr', 'caps', 'coraco_om', 'omero', 'bic_lungo', 'delt_cl', 'pec_cl', 'scapola', 'cal'];
const CELLA = 0.04, FETTA = 0.1, GAP = 0.05, B_MIN = 0.35, LISCIA = 0.3, PEND_B = 1.0, PEND_C = 0.6, GAP_MIN = 0.03;   // cm; PEND_B per cm, PEND_C cm per cm; GAP_MIN solo nei controlli
const SIGMA_MARG = 0.5, SIGMA_CORR = 0.15;                                                       // cm
const Y_PIENO = -2.4, Y_FINE = -3.4, Y_FISSO = 1.05, RACCORDO = 0.35;                                       // cm (quote y)

const cur = REAL(NOME), nv = cur.nv, idx = cur.idx;
const pOld = Float64Array.from(posDaRevisione(PARTENZA, NOME, FILE)), pBase = posDaRevisione(BASE, NOME, FILE);
if (pOld.length !== 3 * nv || pBase.length !== 3 * nv) throw new Error('topologia diversa da PARTENZA/BASE');

// peso della forma nuova lungo y
const peso = y => sstep(Y_FINE, Y_PIENO, y) * (1 - sstep(Y_FISSO - RACCORDO, Y_FISSO, y));
const zona = []; for (let i = 0; i < nv; i++) if (peso(pOld[3 * i + 1]) > 0) zona.push(i);

/* 1. margini laterale e mediale (su PARTENZA, prima della mappa in z): per fette di `FETTA`, x minimo e massimo contro i loro profili levigati
   (gaussiana `SIGMA_MARG`); la correzione va da quella del margine laterale a quella del mediale linearmente in x, levigata lungo y (`SIGMA_CORR`) e
   pesata come la forma nuova: via la gobba del margine laterale sotto la giunzione muscolo-tendinea */
{ const g0 = Math.floor(Y_FINE / FETTA) - 2, NG = Math.ceil(Y_FISSO / FETTA) + 3 - g0, mn = new Float64Array(NG).fill(1e9), mx = new Float64Array(NG).fill(-1e9), cnt = new Int32Array(NG);
  for (let i = 0; i < nv; i++) { const f = Math.floor(pOld[3 * i + 1] / FETTA) - g0; if (f < 0 || f >= NG) continue; cnt[f]++; mn[f] = Math.min(mn[f], pOld[3 * i]); mx[f] = Math.max(mx[f], pOld[3 * i]); }
  const gs = (A, sg) => { const r = sg / FETTA, Kg = []; for (let d = -Math.ceil(3 * r); d <= Math.ceil(3 * r); d++) Kg.push([d, Math.exp(-d * d / (2 * r * r))]);
    return A.map((_, f) => { let w = 0, v = 0; for (const [d, k] of Kg) { const g = f + d; if (g < 0 || g >= NG || cnt[g] < 3) continue; w += k; v += k * A[g]; } return w ? v / w : A[f]; }); };
  const dMin = gs(gs(mn, SIGMA_MARG).map((v, f) => cnt[f] > 2 ? v - mn[f] : 0), SIGMA_CORR), dMax = gs(gs(mx, SIGMA_MARG).map((v, f) => cnt[f] > 2 ? v - mx[f] : 0), SIGMA_CORR);
  const ip = (A, y) => { const t = y / FETTA - g0 - 0.5, f = clamp(Math.floor(t), 0, NG - 2), u = clamp(t - f, 0, 1); return A[f] * (1 - u) + A[f + 1] * u; };
  let mxc = 0; for (const i of zona) { const y = pOld[3 * i + 1], w = peso(y), t = clamp((pOld[3 * i] - ip(mn, y)) / Math.max(0.05, ip(mx, y) - ip(mn, y)), 0, 1), d = w * ((1 - t) * ip(dMin, y) + t * ip(dMax, y));
    pOld[3 * i] += d; mxc = Math.max(mxc, Math.abs(d)); }
  log('margini levigati: correzione massima in x', (mxc * 10).toFixed(1), 'mm'); }

/* 2. pavimento e tetto sulla griglia (x, y) */
let lo = [1e9, 1e9], hi = [-1e9, -1e9];
for (const i of zona) for (const P of [pOld, pBase]) for (let k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], P[3 * i + k]); hi[k] = Math.max(hi[k], P[3 * i + k]); }
lo = lo.map(x => x - 0.3); hi = hi.map(x => x + 0.3);
const NXc = Math.ceil((hi[0] - lo[0]) / CELLA), NYc = Math.ceil((hi[1] - lo[1]) / CELLA), cel = (x, y) => { const a = Math.floor((x - lo[0]) / CELLA), b = Math.floor((y - lo[1]) / CELLA); return a < 0 || b < 0 || a >= NXc || b >= NYc ? -1 : a + NXc * b; };
const campiona = (pos, I, f) => { for (let t = 0; t < I.length; t += 3) { const A = [0, 1, 2].map(k => [pos[3 * I[t + k]], pos[3 * I[t + k] + 1], pos[3 * I[t + k] + 2]]);
  if (A.every(p => p[0] < lo[0] || p[0] > hi[0] || p[1] < lo[1] || p[1] > hi[1])) continue;
  const L = Math.max(...[0, 1, 2].map(k => Math.hypot(A[k][0] - A[(k + 1) % 3][0], A[k][1] - A[(k + 1) % 3][1]))), n = Math.max(1, Math.ceil(L / (CELLA * 0.5)));
  for (let u = 0; u <= n; u++) for (let v = 0; u + v <= n; v++) { const a = u / n, b = v / n, c = 1 - a - b, p = [0, 1, 2].map(q => a * A[0][q] + b * A[1][q] + c * A[2][q]); const id = cel(p[0], p[1]); if (id >= 0) f(id, p[2]); } } };
// metà dello spessore del capo breve di BASE per cella (dove manca: media della fetta)
const zMin = new Float64Array(NXc * NYc).fill(1e9), zMax = new Float64Array(NXc * NYc).fill(-1e9);
campiona(pBase, idx, (id, z) => { zMin[id] = Math.min(zMin[id], z); zMax[id] = Math.max(zMax[id], z); });
const midFetta = new Map(); for (let i = 0; i < nv; i++) { const f = Math.floor(pBase[3 * i + 1] / FETTA); if (!midFetta.has(f)) midFetta.set(f, [0, 0]); const m = midFetta.get(f); m[0] += pBase[3 * i + 2]; m[1]++; }
const mid = id => { if (zMin[id] < 1e9) return 0.5 * (zMin[id] + zMax[id]); const y = lo[1] + (Math.floor(id / NXc) + 0.5) * CELLA, m = midFetta.get(Math.floor(y / FETTA)); return m ? m[0] / m[1] : 0; };
const pav = new Float64Array(NXc * NYc).fill(-1e9), tet = new Float64Array(NXc * NYc).fill(1e9);
for (const n of DIETRO) { const R = REAL(n); campiona(R.pos, R.idx, (id, z) => { if (z < mid(id)) pav[id] = Math.max(pav[id], z); }); }
for (const n of DAVANTI) { const R = REAL(n); campiona(R.pos, R.idx, (id, z) => { if (z > mid(id)) tet[id] = Math.min(tet[id], z); }); }
// limiti di un vertice: celle entro un raggio di 1 (prudente)
const lim = (x, y) => { let p = -1e9, t = 1e9; const a0 = Math.floor((x - lo[0]) / CELLA), b0 = Math.floor((y - lo[1]) / CELLA);
  for (let a = a0 - 1; a <= a0 + 1; a++) for (let b = b0 - 1; b <= b0 + 1; b++) { if (a < 0 || b < 0 || a >= NXc || b >= NYc) continue; const id = a + NXc * b; p = Math.max(p, pav[id]); t = Math.min(t, tet[id]); } return [p, t]; };
const L = new Float64Array(2 * nv); for (let i = 0; i < nv; i++) { const [p, t] = lim(pOld[3 * i], pOld[3 * i + 1]); L[2 * i] = p; L[2 * i + 1] = t; }

/* 3. b e c per fetta */
const f0 = Math.floor(Y_FINE / FETTA), f1 = Math.ceil(Math.max(...pOld.filter((_, k) => k % 3 === 1)) / FETTA), NF = f1 - f0 + 1, fette = Array.from({ length: NF }, () => []);
for (let i = 0; i < nv; i++) { const f = Math.floor(pOld[3 * i + 1] / FETTA) - f0; if (f >= 0 && f < NF) fette[f].push(i); }
const s = LISCIA / FETTA, K = []; for (let d = -Math.ceil(3 * s); d <= Math.ceil(3 * s); d++) K.push([d, Math.exp(-d * d / (2 * s * s))]);
const gauss = A => A.map((_, f) => { let w = 0, v = 0; for (const [d, k] of K) { const g = clamp(f + d, 0, NF - 1); w += k; v += k * A[g]; } return v / w; });
// centro di ogni fetta di PARTENZA (levigato): z' = c + b·(z − zc)
const zc = gauss(Float64Array.from({ length: NF }, (_, f) => fette[f].reduce((t, i) => t + pOld[3 * i + 2], 0) / Math.max(1, fette[f].length)));
const cMin = (f, b) => { let c = -1e9; for (const i of fette[f]) c = Math.max(c, L[2 * i] + GAP - b * (pOld[3 * i + 2] - zc[f])); return c; };
const cMax = (f, b) => { let c = 1e9; for (const i of fette[f]) c = Math.min(c, L[2 * i + 1] - GAP - b * (pOld[3 * i + 2] - zc[f])); return c; };
const bF = new Float64Array(NF);
const fisso = f => (f + f0) * FETTA >= Y_FISSO;   // apice del coracoide: si torna alla forma di BASE
// mappa affine che porta meglio (minimi quadrati) la fetta di PARTENZA su quella di BASE
const fit = Array.from({ length: NF }, (_, f) => { const F = fette[f]; if (F.length < 3) return [zc[f], 1, 0]; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const i of F) { const x = pOld[3 * i + 2] - zc[f], y = pBase[3 * i + 2]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const n = F.length, b = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - b * sx) / n; let r = 0; for (const i of F) r = Math.max(r, Math.abs(c + b * (pOld[3 * i + 2] - zc[f]) - pBase[3 * i + 2])); return [c, b, r]; });
for (let f = 0; f < NF; f++) { if (fisso(f)) { bF[f] = fit[f][1]; continue; } let b = 1; while (b > B_MIN && cMin(f, b) > cMax(f, b)) b -= 0.01; bF[f] = Math.max(b, B_MIN); }
/* 4. levigatura con vincoli: inviluppo a pendenza limitata (b sotto il possibile, c sopra il minimo), poi gaussiana */
const cono = (A, pend, su) => A.map((_, f) => { let v = su ? -1e9 : 1e9; for (let g = 0; g < NF; g++) { const w = A[g] + (su ? -1 : 1) * pend * Math.abs(f - g) * FETTA; v = su ? Math.max(v, w) : Math.min(v, w); } return v; });
const bE = cono(bF, PEND_B, false), bS = gauss(bE).map((v, f) => Math.min(v, bF[f]));
const cM = Float64Array.from({ length: NF }, (_, f) => fette[f].length ? (fisso(f) ? fit[f][0] : cMin(f, bS[f])) : -1e9);
const cE = cono(cM, PEND_C, true), cS = gauss(cE).map((v, f) => Math.max(v, cM[f]));
let stretti = 0; for (let f = 0; f < NF; f++) if (fette[f].length && cS[f] > cMax(f, bS[f]) + 1e-6) stretti++;
/* 5. forma nuova e raccordo con BASE */
const pos = Float64Array.from(pBase);
const interp = (A, y) => { const t = y / FETTA - f0 - 0.5, f = clamp(Math.floor(t), 0, NF - 2), u = clamp(t - f, 0, 1); return A[f] * (1 - u) + A[f + 1] * u; };
for (const i of zona) { const y = pOld[3 * i + 1], w = peso(y), z = interp(cS, y) + interp(bS, y) * (pOld[3 * i + 2] - interp(zc, y));
  pos[3 * i] = w * pOld[3 * i] + (1 - w) * pBase[3 * i]; pos[3 * i + 1] = w * y + (1 - w) * pBase[3 * i + 1]; pos[3 * i + 2] = w * z + (1 - w) * pBase[3 * i + 2]; }

/* controllo: distanza dagli ostacoli sulla griglia (nessuno spostamento per vertice: creava pieghe) */
const distanze = P => { let dp = 1e9, dt = 1e9, np = 0, nt = 0; for (const i of zona) { const [p, t] = lim(P[3 * i], P[3 * i + 1]), a = P[3 * i + 2] - p, b = t - P[3 * i + 2]; dp = Math.min(dp, a); dt = Math.min(dt, b); if (a < GAP_MIN) np++; if (b < GAP_MIN) nt++; }
  return `dietro ${(dp * 10).toFixed(2)} mm (${np} vertici sotto ${GAP_MIN * 10} mm), davanti ${(dt * 10).toFixed(2)} mm (${nt})`; };

/* controlli */
const profilo = P => { const r = []; for (let f = 0; f < NF; f += 3) { let zl = 1e9, zh = -1e9; for (const i of fette[f]) { zl = Math.min(zl, P[3 * i + 2]); zh = Math.max(zh, P[3 * i + 2]); } if (fette[f].length) r.push(`${((f + f0) * FETTA).toFixed(1)}:${zl.toFixed(2)}–${zh.toFixed(2)}`); } return r.join(' '); };
log('fette dove il tetto non lascia posto', stretti);
log('residuo della mappa affine PARTENZA → BASE per fetta (mm)', fit.filter((_, f) => f % 3 === 0).map(x => (x[2] * 10).toFixed(1)).join(' '));
log('b (spessore relativo) per fetta', Array.from(bS).filter((_, f) => f % 3 === 0).map(x => x.toFixed(2)).join(' '));
log('z per fetta, BASE   ', profilo(pBase));
log('z per fetta, nuovo  ', profilo(pos));
log('distanza minima sulla griglia, BASE: ', distanze(pBase));
log('distanza minima sulla griglia, nuovo:', distanze(pos));
// triangoli che si incrociano (stesso test di `separa`)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const raggio = (o, d, [a, b, c]) => { const e1 = sub(b, a), e2 = sub(c, a), pv = cr(d, e2), det = dt(e1, pv); if (Math.abs(det) < 1e-12) return null; const iv = 1 / det, s0 = sub(o, a), u = dt(s0, pv) * iv; if (u < 0 || u > 1) return null;
  const qv = cr(s0, e1), v = dt(d, qv) * iv; if (v < 0 || u + v > 1) return null; const t = dt(e2, qv) * iv; return t > 0 && t < 1; };
const incroci = (P, nome) => { const R = REAL(nome), C = 0.3, h = new Map(), TA = [];
  for (let t = 0; t < R.idx.length; t += 3) { const v = [0, 1, 2].map(k => [R.pos[3 * R.idx[t + k]], R.pos[3 * R.idx[t + k] + 1], R.pos[3 * R.idx[t + k] + 2]]); const ti = TA.length; TA.push(v);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(v[0][q], v[1][q], v[2][q]) / C)), b = [0, 1, 2].map(q => Math.floor(Math.max(v[0][q], v[1][q], v[2][q]) / C));
    for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) { const k = x + ',' + y + ',' + z; if (!h.has(k)) h.set(k, []); h.get(k).push(ti); } }
  let n = 0; const zs = new Set(zona);
  for (let t = 0; t < idx.length; t += 3) { if (![0, 1, 2].some(k => zs.has(idx[t + k]))) continue; const A = [0, 1, 2].map(k => [P[3 * idx[t + k]], P[3 * idx[t + k] + 1], P[3 * idx[t + k] + 2]]);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(A[0][q], A[1][q], A[2][q]) / C)), b = [0, 1, 2].map(q => Math.floor(Math.max(A[0][q], A[1][q], A[2][q]) / C)), visti = new Set(); let o = false;
    for (let x = a[0]; x <= b[0] && !o; x++) for (let y = a[1]; y <= b[1] && !o; y++) for (let z = a[2]; z <= b[2] && !o; z++) for (const u of h.get(x + ',' + y + ',' + z) || []) {
      if (visti.has(u)) continue; visti.add(u); const B = TA[u]; for (let e = 0; e < 3 && !o; e++) o = raggio(A[e], sub(A[(e + 1) % 3], A[e]), B) || raggio(B[e], sub(B[(e + 1) % 3], B[e]), A); if (o) break; }
    if (o) n++; }
  return n; };
log('triangoli che si incrociano (BASE → nuovo):', CONTROLLO.map(n => `${n} ${incroci(pBase, n)} → ${incroci(pos, n)}`).join(', '));
let mx = 0; for (const i of zona) mx = Math.max(mx, Math.hypot(pos[3 * i] - pBase[3 * i], pos[3 * i + 1] - pBase[3 * i + 1], pos[3 * i + 2] - pBase[3 * i + 2]));
log('spostamento massimo rispetto a BASE', (mx * 10).toFixed(1), 'mm');

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { G.setPos(NOME, Float32Array.from(pos)); saveFile(repack()); }
