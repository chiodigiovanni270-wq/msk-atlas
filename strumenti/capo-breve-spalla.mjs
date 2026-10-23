/* Capo breve del bicipite della spalla (modelli/spalla-3d.html): decorso liscio davanti al sottoscapolare, dall'apice del coracoide in giù.

   Problema. `separa` (in `muscoli-spalla.mjs`) porta il capo breve davanti al sottoscapolare spostando in avanti i vertici che lo attraversano, con
   uno spostamento reso liscio come una membrana: la faccia posteriore va avanti fino a 4–5 mm, quella anteriore molto meno (il deltoide è davanti),
   quindi sotto il coracoide il tendine diventa una lamina schiacciata e irregolare, con una gobba sul margine laterale e una piega a S nel profilo.

   Uso (dalla cartella del progetto):
     node strumenti/capo-breve-spalla.mjs                → riscrive `bic_breve` e `delt_cl` nel file del modello
     PROVA=1 node strumenti/capo-breve-spalla.mjs        → stampa profili e controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/capo-breve-spalla.mjs   → lavora su una copia
   Va lanciato dopo `rifinitura-subs-spalla.mjs` (che sposta anche il capo breve) e dopo `capo-lungo-spalla.mjs`; `borsa-spalla.mjs` non ne dipende.
   Riparte dalla forma del capo breve prima di `separa` (revisione `PARTENZA`), da capo breve e deltoide della revisione `BASE` (stessa topologia), con le altre
   strutture del file come ostacoli, quindi si può rilanciare con lo stesso risultato. Se si rilanciano `muscoli-spalla.mjs` o `rifinitura-subs-spalla.mjs`,
   aggiornare `BASE`.

   Metodo. Il capo breve scende quasi verticale (y): per fette orizzontali (`FETTA`) la sezione di `PARTENZA` (circa 6 × 8 mm, quasi tonda) è mossa solo
   in avanti (z) con una mappa affine z' = c(y) + b(y)·(z − zc(y)) (zc = centro della fetta), liscia in y e con b > 0: la sezione resta regolare e la
   mappa non può creare pieghe. Nessuno spostamento per singolo vertice e nessuna levigatura sulla mesh (creavano pieghe).
   1. Margini laterale e mediale: x minimo e massimo di ogni fetta contro i loro profili levigati (`SIGMA_MARG`); correzione lineare in x tra i due
      margini, levigata lungo y (`SIGMA_CORR`): via la gobba del margine laterale sotto la giunzione muscolo-tendinea (al massimo ~1 mm).
   1b. Sezione arrotondata: ogni vertice va verso l'ellisse dei momenti della sua fetta (levigati lungo y, `SIGMA_ELL`) per la frazione `TONDO`: lati
      diritti e spigoli della sezione di BodyParts3D (in alcune fette quasi un rombo) diventano curvi.
   2. Pavimento e tetto: le superfici di sottoscapolare, capsula, coraco-omerale, omero, cartilagine, capo lungo e trasverso (`DIETRO`) e di deltoide
      acromiale e grande pettorale (`DAVANTI`) sono campionate su una griglia (x, y) di passo `CELLA`; un punto sta dietro o davanti secondo la metà
      dello spessore del capo breve di `BASE` nella stessa cella; per ogni vertice valgono le 9 celle attorno (prudente).
   3. Per ogni fetta il b più grande (≤ 1, ≥ `B_MIN`) per cui esiste c con tutti i vertici ad almeno `GAP` da pavimento e tetto; c = il minimo (il tendine
      poggia sul sottoscapolare). Sopra `Y_FISSO` (apice del coracoide, inserzione) b e c sono quelli della mappa affine che porta meglio PARTENZA su
      BASE (residuo ≤ 0,3 mm): lì resta la forma di BASE, che nel frattempo si è adattata al margine superiore del sottoscapolare.
   4. Profili lisci con i vincoli: inviluppi a pendenza limitata (b sotto il possibile, `PEND_B` per cm; c tra pavimento e tetto, `PEND_C` cm per cm),
      gaussiana (`LISCIA`) e di nuovo i vincoli. Con il deltoide clavicolare fuori dal tetto b resta 1: spessore originale.
   5. Raccordo con BASE: forma nuova piena sopra `Y_PIENO`, smoothstep fino a BASE a `Y_FINE` (ventre, dove le due forme quasi coincidono) e, in alto,
      su `RACCORDO` sotto `Y_FISSO`.
   6. Deltoide clavicolare: prima schiacciava il tendine (b fino a 0,35, sezione 8 × 3 mm). Ora la sua faccia profonda va avanti davanti al capo breve
      (punto 6 nel codice: vertici davanti alla metà del capo breve di BASE e sotto `Y_DELT`, membrana sui vicini, al massimo ~6,5 mm; normali di BASE
      ricalcolate sui vertici spostati). Resta la lamina sottile del margine inferiore del deltoide che a y 0–0,5 passa dietro il capo breve (e attraversa
      sottoscapolare e coracobrachiale): era già in BASE, problema del deltoide da sistemare a parte.
   Controlli stampati: margini, arrotondamento, b per fetta, profilo in z per fetta (BASE e nuovo), distanza minima sulla griglia da pavimento e tetto,
   triangoli che si incrociano del capo breve e del deltoide spostato con le strutture vicine (BASE → nuovo), spostamento massimo.
   Normali del capo breve ricalcolate dalla pagina. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, posDaRevisione, saveFile, repack, log, sstep, clamp } = G;

const PARTENZA = '27ecf50', BASE = 'e84af51', NOME = 'bic_breve', FILE = 'modelli/spalla-3d.html';
const DIETRO = ['subs', 'caps', 'coraco_om', 'omero', 'cart_omero', 'bic_lungo', 'trasv_om'];
const DAVANTI = ['delt_ac', 'pec_cl'];   // il deltoide clavicolare si sposta lui (punto 6)
const VICINI_D = ['pec_cl', 'coracobr', 'subs', 'clavicola', 'scapola', 'cal', 'delt_ac', 'supra', 'borsa_sad', 'coraco_om'];
const CONTROLLO = ['subs', 'coracobr', 'caps', 'coraco_om', 'omero', 'bic_lungo', 'delt_cl', 'pec_cl', 'scapola', 'cal'];
const CELLA = 0.04, FETTA = 0.1, GAP = 0.05, B_MIN = 0.35, LISCIA = 0.3, PEND_B = 1.0, PEND_C = 1.0, GAP_MIN = 0.03;   // cm; PEND_B per cm, PEND_C cm per cm; GAP_MIN solo nei controlli
const SIGMA_MARG = 0.5, SIGMA_CORR = 0.15, SIGMA_ELL = 0.3, TONDO = 0.6;                                                       // cm
const GAP_D = 0.06, CALO_D = 0.9, GIRI_D = 40, R_D = 0.3, K_D = 4, Y_DELT = 0.6;                                // cm (R_D: vicini nello spazio; K_D: celle attorno, i triangoli del deltoide sono grandi; sopra Y_DELT il deltoide avvolge il coracoide e non si tocca)
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

/* 1b. sezione arrotondata: per fetta, ellisse dei momenti del secondo ordine della sezione (centro, assi e orientamento nel piano x-z, levigati lungo y
   con `SIGMA_ELL`); ogni vertice va verso l'ellisse lungo il raggio dal centro per la frazione `TONDO` × peso (lati diritti e spigoli della sezione
   di BodyParts3D, che in alcune fette è quasi un rombo, diventano curvi) */
{ const g0 = Math.floor(Y_FINE / FETTA) - 2, NG = Math.ceil(Y_FISSO / FETTA) + 3 - g0, M = Array.from({ length: NG }, () => [0, 0, 0, 0, 0, 0]);
  for (let i = 0; i < nv; i++) { const f = Math.floor(pOld[3 * i + 1] / FETTA) - g0; if (f < 0 || f >= NG) continue; const x = pOld[3 * i], z = pOld[3 * i + 2], m = M[f]; m[0]++; m[1] += x; m[2] += z; m[3] += x * x; m[4] += x * z; m[5] += z * z; }
  const ok = f => M[f][0] > 5, par = M.map(m => { if (m[0] < 6) return null; const n = m[0], cx = m[1] / n, cz = m[2] / n; return [cx, cz, m[3] / n - cx * cx, m[4] / n - cx * cz, m[5] / n - cz * cz]; });
  const r = SIGMA_ELL / FETTA, Kg = []; for (let d = -Math.ceil(3 * r); d <= Math.ceil(3 * r); d++) Kg.push([d, Math.exp(-d * d / (2 * r * r))]);
  const P = par.map((_, f) => { const v = [0, 0, 0, 0, 0]; let w = 0; for (const [d, k] of Kg) { const g = f + d; if (g < 0 || g >= NG || !ok(g)) continue; w += k; for (let q = 0; q < 5; q++) v[q] += k * par[g][q]; } return w ? v.map(x => x / w) : null; });
  let mxr = 0;
  for (const i of zona) { const y = pOld[3 * i + 1], w = TONDO * peso(y); if (w <= 0) continue; const t = y / FETTA - g0 - 0.5, f = clamp(Math.floor(t), 0, NG - 2), u = clamp(t - f, 0, 1); if (!P[f] || !P[f + 1]) continue;
    const [cx, cz, sxx, sxz, szz] = P[f].map((v, q) => v * (1 - u) + P[f + 1][q] * u), dx = pOld[3 * i] - cx, dz = pOld[3 * i + 2] - cz, rr = Math.hypot(dx, dz); if (rr < 1e-6) continue;
    // contorno dell'ellisse uniforme con quei momenti (semiassi = 2·σ) lungo la direzione del vertice: r_e = 1 / sqrt(dᵀ (4Σ)⁻¹ d)
    const det = sxx * szz - sxz * sxz, ex = dx / rr, ez = dz / rr, q = (szz * ex * ex - 2 * sxz * ex * ez + sxx * ez * ez) / (4 * det), re = 1 / Math.sqrt(q), nr = rr + w * (re - rr);
    pOld[3 * i] = cx + ex * nr; pOld[3 * i + 2] = cz + ez * nr; mxr = Math.max(mxr, Math.abs(nr - rr)); }
  log('sezione arrotondata: spostamento massimo', (mxr * 10).toFixed(1), 'mm'); }

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
const cX = Float64Array.from({ length: NF }, (_, f) => fette[f].length && !fisso(f) ? cMax(f, bS[f]) : 1e9);
// c tra il minimo (pavimento) e il massimo (tetto): inviluppi a pendenza limitata dei due, gaussiana, di nuovo i vincoli (il pavimento prevale)
let cS = cono(cM, PEND_C, true).map((v, f) => Math.min(v, cono(cX, PEND_C, false)[f]));
cS = gauss(cS).map((v, f) => Math.max(Math.min(v, cX[f]), cM[f]));
let stretti = 0; for (let f = 0; f < NF; f++) if (fette[f].length && cS[f] > cMax(f, bS[f]) + 1e-6) stretti++;
/* 5. forma nuova e raccordo con BASE */
const pos = Float64Array.from(pBase);
const interp = (A, y) => { const t = y / FETTA - f0 - 0.5, f = clamp(Math.floor(t), 0, NF - 2), u = clamp(t - f, 0, 1); return A[f] * (1 - u) + A[f + 1] * u; };
for (const i of zona) { const y = pOld[3 * i + 1], w = peso(y), z = interp(cS, y) + interp(bS, y) * (pOld[3 * i + 2] - interp(zc, y));
  pos[3 * i] = w * pOld[3 * i] + (1 - w) * pBase[3 * i]; pos[3 * i + 1] = w * y + (1 - w) * pBase[3 * i + 1]; pos[3 * i + 2] = w * z + (1 - w) * pBase[3 * i + 2]; }

/* controllo: distanza dagli ostacoli sulla griglia (nessuno spostamento per vertice: creava pieghe) */
const distanze = P => { let dp = 1e9, dt = 1e9, np = 0, nt = 0; for (const i of zona) { const [p, t] = lim(P[3 * i], P[3 * i + 1]), a = P[3 * i + 2] - p, b = t - P[3 * i + 2]; dp = Math.min(dp, a); dt = Math.min(dt, b); if (a < GAP_MIN) np++; if (b < GAP_MIN) nt++; }
  return `dietro ${(dp * 10).toFixed(2)} mm (${np} vertici sotto ${GAP_MIN * 10} mm), davanti ${(dt * 10).toFixed(2)} mm (${nt})`; };

/* 6. deltoide clavicolare davanti al capo breve: i vertici della sua faccia profonda che stanno nello spessore del capo breve (tra la faccia
   posteriore − 0,5 mm e quella anteriore + `GAP_D`, celle vicine sulla griglia) vanno avanti fino a `GAP_D` davanti alla faccia anteriore; lo
   spostamento si allarga come una membrana sui vicini (grafo e spazio entro `R_D`: massimo tra richiesto e media × `CALO_D`, `GIRI_D` volte), così la
   faccia profonda si solleva senza gradini. Riparte da `delt_cl` di BASE; normali di vertice ricalcolate sui vertici spostati e sui vicini. */
// (mesh di BASE, non del file: `deltoide-spalla.mjs`, che viene dopo, riscrive il deltoide con un'altra topologia)
const D0b = G.realDaRevisione(BASE, 'delt_cl', FILE), D0 = { nv: D0b.pos.length / 3, idx: D0b.idx }, nD = D0.nv, dPos = Float64Array.from(D0b.pos), aD = { tag: D0b.tag, fdir: D0b.fdir };
const fr = new Float64Array(NXc * NYc).fill(-1e9), re = new Float64Array(NXc * NYc).fill(1e9);
campiona(pos, idx, (id, z) => { fr[id] = Math.max(fr[id], z); re[id] = Math.min(re[id], z); });
const reqD = new Float64Array(nD);
for (let i = 0; i < nD; i++) { const x = dPos[3 * i], y = dPos[3 * i + 1], z = dPos[3 * i + 2], a0 = Math.floor((x - lo[0]) / CELLA), b0 = Math.floor((y - lo[1]) / CELLA); let f = -1e9, r = 1e9;
  for (let a = a0 - K_D; a <= a0 + K_D; a++) for (let b = b0 - K_D; b <= b0 + K_D; b++) { if (a < 0 || b < 0 || a >= NXc || b >= NYc) continue; f = Math.max(f, fr[a + NXc * b]); r = Math.min(r, re[a + NXc * b]); }
  const c0 = cel(x, y); if (y < Y_DELT && f > -1e9 && c0 >= 0 && z > mid(c0) && z < f + GAP_D) reqD[i] = f + GAP_D - z; }   // solo i vertici davanti alla metà del capo breve di BASE: la lamina sottile del margine inferiore del deltoide che gli passa dietro resta com'è
const wid = new Map(), W = new Int32Array(nD); for (let i = 0; i < nD; i++) { const k = [0, 1, 2].map(q => Math.round(dPos[3 * i + q] * 1e4)).join(); if (!wid.has(k)) wid.set(k, wid.size); W[i] = wid.get(k); }
const nW = wid.size, pw = new Float64Array(3 * nW); for (let i = 0; i < nD; i++) for (let q = 0; q < 3; q++) pw[3 * W[i] + q] = dPos[3 * i + q];
const vic = Array.from({ length: nW }, () => new Set()); for (let t = 0; t < D0.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = W[D0.idx[t + k]], b = W[D0.idx[t + (k + 1) % 3]]; if (a !== b) { vic[a].add(b); vic[b].add(a); } }
{ const h = new Map(), ce = w => [0, 1, 2].map(q => Math.floor(pw[3 * w + q] / R_D)); for (let w = 0; w < nW; w++) { const k = ce(w).join(); if (!h.has(k)) h.set(k, []); h.get(k).push(w); }
  for (let w = 0; w < nW; w++) { const c = ce(w); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) for (const u of h.get([c[0] + a, c[1] + b, c[2] + d].join()) || [])
    if (u !== w && Math.hypot(pw[3 * u] - pw[3 * w], pw[3 * u + 1] - pw[3 * w + 1], pw[3 * u + 2] - pw[3 * w + 2]) < R_D) vic[w].add(u); } }
const RQ = new Float64Array(nW); for (let i = 0; i < nD; i++) RQ[W[i]] = Math.max(RQ[W[i]], reqD[i]);
let TD = Float64Array.from(RQ); for (let g = 0; g < GIRI_D; g++) { const U = Float64Array.from(TD); for (let w = 0; w < nW; w++) { if (!vic[w].size) continue; let t = 0; for (const u of vic[w]) t += TD[u]; U[w] = Math.max(RQ[w], t / vic[w].size * CALO_D); } TD = U; }
let nDm = 0, mxD = 0; const toccD = new Set(); for (let i = 0; i < nD; i++) { const t = TD[W[i]]; if (t > 1e-4) { dPos[3 * i + 2] += t; nDm++; mxD = Math.max(mxD, t); toccD.add(i); } }
log('deltoide clavicolare: vertici nel capo breve', reqD.filter(x => x > 0).length, ', spostati', nDm, ', al massimo di', (mxD * 10).toFixed(1), 'mm in avanti');
// normali di partenza da BASE (non dal file: dopo un primo lancio sono già cambiate), così il rilancio dà lo stesso risultato
const nrmD = (() => { const h = execFileSync('git', ['show', `${BASE}:${FILE}`], { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'), maxBuffer: 1 << 30 }).toString('utf8');
  const mn = JSON.parse(h.match(G.reManRe)[2]), m = mn.meshes.findLast(x => x.n === 'delt_cl'); let b = Buffer.from(h.match(G.reDatRe)[2].trim(), 'base64'); if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
  return m.nm !== undefined ? Int8Array.from(new Int8Array(b.buffer, b.byteOffset + m.nm, nD * 3)) : null; })();
if (nrmD && toccD.size) { const I = D0.idx, acc = new Map(); for (let t = 0; t < I.length; t += 3) if ([0, 1, 2].some(k => toccD.has(I[t + k]))) for (let k = 0; k < 3; k++) acc.set(I[t + k], [0, 0, 0]);
  for (let t = 0; t < I.length; t += 3) { const T = [I[t], I[t + 1], I[t + 2]]; if (!T.some(i => acc.has(i))) continue;
    const a = [0, 1, 2].map(q => dPos[3 * T[1] + q] - dPos[3 * T[0] + q]), b = [0, 1, 2].map(q => dPos[3 * T[2] + q] - dPos[3 * T[0] + q]), f = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    for (const i of T) if (acc.has(i)) for (let k = 0; k < 3; k++) acc.get(i)[k] += f[k]; }
  const sw = new Map(); for (const [i, f] of acc) { const w = W[i]; if (!sw.has(w)) sw.set(w, [0, 0, 0]); for (let k = 0; k < 3; k++) sw.get(w)[k] += f[k]; }
  for (const i of acc.keys()) { const f = sw.get(W[i]), l = Math.hypot(...f) || 1, o = [0, 1, 2].map(k => nrmD[3 * i + k]), sg = o[0] * f[0] + o[1] * f[1] + o[2] * f[2] < 0 ? -1 : 1;
    for (let k = 0; k < 3; k++) nrmD[3 * i + k] = Math.round(127 * sg * f[k] / l); } }
const dBase = posDaRevisione(BASE, 'delt_cl', FILE);
if (nDm) G.setMesh('delt_cl', { pos: Float32Array.from(dPos), idx: D0.idx, tag: aD.tag, fdir: aD.fdir, nrm: nrmD });

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
// triangoli di A (P, I; solo quelli con un vertice in `sel`) che si incrociano con quelli di B (Q, J)
const incroci = (P, I, sel, Q, J) => { const C = 0.3, h = new Map(), TA = [];
  for (let t = 0; t < J.length; t += 3) { const v = [0, 1, 2].map(k => [Q[3 * J[t + k]], Q[3 * J[t + k] + 1], Q[3 * J[t + k] + 2]]); const ti = TA.length; TA.push(v);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(v[0][q], v[1][q], v[2][q]) / C)), b = [0, 1, 2].map(q => Math.floor(Math.max(v[0][q], v[1][q], v[2][q]) / C));
    for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) { const k = x + ',' + y + ',' + z; if (!h.has(k)) h.set(k, []); h.get(k).push(ti); } }
  let n = 0;
  for (let t = 0; t < I.length; t += 3) { if (![0, 1, 2].some(k => sel.has(I[t + k]))) continue; const A = [0, 1, 2].map(k => [P[3 * I[t + k]], P[3 * I[t + k] + 1], P[3 * I[t + k] + 2]]);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(A[0][q], A[1][q], A[2][q]) / C)), b = [0, 1, 2].map(q => Math.floor(Math.max(A[0][q], A[1][q], A[2][q]) / C)), visti = new Set(); let o = false;
    for (let x = a[0]; x <= b[0] && !o; x++) for (let y = a[1]; y <= b[1] && !o; y++) for (let z = a[2]; z <= b[2] && !o; z++) for (const u of h.get(x + ',' + y + ',' + z) || []) {
      if (visti.has(u)) continue; visti.add(u); const B = TA[u]; for (let e = 0; e < 3 && !o; e++) o = raggio(A[e], sub(A[(e + 1) % 3], A[e]), B) || raggio(B[e], sub(B[(e + 1) % 3], B[e]), A); if (o) break; }
    if (o) n++; }
  return n; };
const zs = new Set(zona), dSel = new Set(toccD);
log('capo breve, triangoli che si incrociano (BASE → nuovo):', CONTROLLO.map(n => { const R = REAL(n), Rb = n === 'delt_cl' ? { pos: dBase, idx: R.idx } : R;
  return `${n} ${incroci(pBase, idx, zs, Rb.pos, Rb.idx)} → ${incroci(pos, idx, zs, R.pos, R.idx)}`; }).join(', '));
log('deltoide spostato, triangoli che si incrociano (BASE → nuovo):', VICINI_D.map(n => { const R = REAL(n); return `${n} ${incroci(dBase, D0.idx, dSel, R.pos, R.idx)} → ${incroci(dPos, D0.idx, dSel, R.pos, R.idx)}`; }).join(', '));
let mx = 0; for (const i of zona) mx = Math.max(mx, Math.hypot(pos[3 * i] - pBase[3 * i], pos[3 * i + 1] - pBase[3 * i + 1], pos[3 * i + 2] - pBase[3 * i + 2]));
log('spostamento massimo rispetto a BASE', (mx * 10).toFixed(1), 'mm');

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { G.setPos(NOME, Float32Array.from(pos)); saveFile(repack()); }   // delt_cl già impostato al punto 6
