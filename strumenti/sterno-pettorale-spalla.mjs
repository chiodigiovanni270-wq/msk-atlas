/* Grande pettorale, parte sternocostale (`pec_st`) della spalla (modelli/spalla-3d.html): il muscolo viene «tirato» fino al manubrio nella tasca
   sotto l'articolazione sternoclavicolare. Nessun pezzo aggiunto: si spostano solo i vertici del muscolo di BASE in quella zona; il resto, compreso
   il margine sfrangiato sul corpo dello sterno, resta quello di BodyParts3D.

   Problema. Sul manubrio il margine del muscolo di BASE rientra di circa 1 cm verso le cartilagini costali e resta più in basso (posteriore) della
   faccia anteriore dell'osso: tra muscolo e osso si vede un buco.

   Uso (dalla cartella del progetto):
     node strumenti/sterno-pettorale-spalla.mjs                → deforma `pec_st` nella tasca e scrive i dati
     PROVA=1 node strumenti/sterno-pettorale-spalla.mjs        → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/sterno-pettorale-spalla.mjs   → lavora su una copia
   Ultimo della catena della spalla. Riparte da `pec_st` della revisione `BASE` (mesh, tag, direzioni delle fibre e normali), con le altre
   strutture del file come ostacoli, quindi si può rilanciare con lo stesso risultato.

   Metodo (mappa 2D (x, y) con passo `PASSO2`, raggi lungo −z).
   1. Per ogni colonna: faccia superficiale (zt), profonda del primo tratto (zb) e dello strato più basso (zd) del muscolo di BASE; primo contatto
      con sterno, cartilagini e prima costa (zr); superficie d'appoggio zS = zr, interpolata a membrana dove il raggio passa in una fessura.
   2. Margine voluto per riga (sopra `Y_MAN`): quello del corpo dello sterno che piega verso `X_TOP` con raccordo `R_ANGOLO` in alto; ma il muscolo
      si ferma dove arriva all'osso, cioè dove l'osso sale più di `SALTO` sopra la faccia profonda del suo margine (mediana su 9 righe), e prima del
      legamento sternoclavicolare e delle altre strutture vicine.
   3. Allungamento in x: per ogni riga il margine avanza medialmente della differenza (levigata, `SIGMA_D`; in salita da `Y_MAN` su `SALITA`),
      distribuita in modo monotono su una fascia larga `BANDA` (niente pieghe). Dove il muscolo spostato attraverserebbe una struttura vicina che in
      BASE non attraversa, l'allungamento di quelle righe cala gradualmente (giri successivi).
   4. Spostamento in z, uguale per tutti gli strati della colonna (la lamina non si incrocia): la faccia profonda sale sull'osso (o scende, pesata su
      `BANDA_Z`) fino a `GAP_Z` dalla superficie d'appoggio nel punto d'arrivo; levigato (`SIGMA_Z`), mai sotto ciò che serve per restare fuori
      dall'osso (vertici controllati a ogni giro), con pendenza al più `PENDENZA` e coda in y su `CODA`. La faccia superficiale resta dov'è, salvo dove
      il muscolo diventerebbe più sottile di `T_SOPRA`; i punti intermedi si interpolano tra le due.
   5. Normali ricalcolate sui vertici mossi. Topologia, tag e fibre di BASE invariati.
   Controlli stampati: triangoli mossi che attraversano ossa e strutture vicine (con il confronto con BASE), autointersezioni, area dei triangoli,
   distanza dall'osso. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, realDaRevisione, saveFile, repack, log, griglia, solid, sdf, unione, esatta, sample, sstep, grad, clamp } = G;

const BASE = '5008394', FILE = 'modelli/spalla-3d.html', NOME = 'pec_st';
const SUPPORTO = ['manubrio', 'corpo_sterno', 'cc1', 'cc2', 'cc3', 'cc4', 'cc5', 'costa1'];
const OSSA = ['manubrio', 'corpo_sterno', 'cc1', 'cc2', 'cc3', 'costa1', 'costa2', 'clavicola'];
const MOLLI = ['pec_cl', 'sc_leg', 'succl', 'pmin', 'a_succ', 'v_succ', 'plesso'];
const BOX = [[12.6, -5.0, 5.5], [17.0, 2.6, 15.0]];                       // cm: riquadro della griglia
const PASSO = 0.03, PASSO2 = 0.05;                                          // cm
const Y_LIM = [-4.6, 2.0];                                                 // cm: righe della mappa considerate
const SIGMA_M = 0.9, Y_MAN = -2.0, X_TOP = 15.0, Y_TOP = 0.7, R_ANGOLO = 0.7;   // margine della tasca (cm)
const ZONA_X = 13.25;                                                       // cm: margine di BASE cercato solo medialmente a questa x
const SALTO = 0.25, SPESS_MOLLI = 0.6, LIBERO = 0.05;                       // margine voluto (cm)
const SALITA = 0.6, SIGMA_D = 0.2, BANDA = 2.0, GIRI = 30;                  // allungamento in x (cm)
const BANDA_Z = 1.6, GAP_Z = 0.03, SIGMA_Z = 0.4, PENDENZA = 1.0, CODA = 0.5, T_SOPRA = 0.2, K_SOPRA = 0.08;   // spostamento in z (cm)
const GAP_OSSO = 0.03, GAP_MOLLI = 0.04;

/* ---- mesh di partenza (BASE), messa al posto di quella del file ---- */
const P0 = realDaRevisione(BASE, NOME, FILE); P0.nv = P0.pos.length / 3;
{ const h = execFileSync('git', ['show', `${BASE}:${FILE}`], { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'), maxBuffer: 1 << 30 }).toString('utf8');
  const mn = JSON.parse(h.match(G.reManRe)[2]); const b = G.datiDi(h, BASE, FILE);
  const m = mn.meshes.findLast(x => x.n === NOME), d = new Int8Array(b.buffer, b.byteOffset + m.nm, m.nv * 3); P0.nrm = Float32Array.from(d, x => x / 127); }
G.setMesh(NOME, { pos: P0.pos, idx: P0.idx, tag: P0.tag, fdir: P0.fdir });

/* ---- griglia e campi ---- */
griglia(BOX[0], BOX[1], PASSO, 0);
const { N } = G;
log('griglia', G.NX, G.NY, G.NZ, (N / 1e6).toFixed(1), 'M voxel');
const dentro = p => p.every((x, k) => x > BOX[0][k] + 0.05 && x < BOX[1][k] - 0.05);
const Ssup = sdf(unione(SUPPORTO)).F; esatta(Ssup, SUPPORTO, 0.08);
const S = sdf(solid(NOME)).F; esatta(S, [NOME], 0.08);
const Sb = esatta(sdf(unione(OSSA)).F, OSSA, 0.08), Sm = sdf(unione(MOLLI)).F;
log('campi di base');

/* ---- 1. mappa 2D (x, y) con raggi lungo −z: faccia superficiale (zt), profonda del primo tratto (zb) e dello strato più basso (zd) del muscolo
   di BASE, primo contatto con lo scheletro (zr) ---- */
const MX = Math.round((BOX[1][0] - BOX[0][0]) / PASSO2), MY = Math.round((BOX[1][1] - BOX[0][1]) / PASSO2), NM = MX * MY;
const mx = i => BOX[0][0] + (i + 0.5) * PASSO2, my = j => BOX[0][1] + (j + 0.5) * PASSO2;
const conv = (F, Wt, sig) => {   // convoluzione normalizzata gaussiana (separabile) sulla mappa
  const r = Math.ceil(3 * sig / PASSO2), k = Array.from({ length: 2 * r + 1 }, (_, q) => Math.exp(-(((q - r) * PASSO2) ** 2) / (2 * sig * sig)));
  const pass = (A, sx, sy, n, m) => { const o = new Float32Array(NM); for (let b = 0; b < m; b++) for (let a = 0; a < n; a++) { let s = 0; for (let q = -r; q <= r; q++) { const c = a + q; if (c >= 0 && c < n) s += k[q + r] * A[b * sy + c * sx]; } o[b * sy + a * sx] = s; } return o; };
  const FW = Float32Array.from(F, (v, m) => Wt[m] ? v * Wt[m] : 0);
  const a = pass(pass(FW, 1, MX, MX, MY), MX, 1, MY, MX), b = pass(pass(Wt, 1, MX, MX, MY), MX, 1, MY, MX);
  return Float32Array.from(a, (x, m) => b[m] > 1e-6 ? x / b[m] : 0); };
const uno = new Float32Array(NM).fill(1), zr = new Float32Array(NM).fill(BOX[0][2]), zt = new Float32Array(NM).fill(NaN), zb = new Float32Array(NM).fill(NaN), zd = new Float32Array(NM).fill(NaN);
const DZ = 0.01, cerca = (F, x, y, z0, z1, dentroF) => { let prev = sample(F, x, y, z0); for (let z = z0 - DZ; z > z1; z -= DZ) { const d = sample(F, x, y, z); if ((d <= 0) === dentroF) return z - DZ * d / (prev - d || 1); prev = d; } return NaN; };   // primo passaggio (dentro/fuori) scendendo lungo −z
for (let j = 0; j < MY; j++) for (let i = 0; i < MX; i++) { const m = i + MX * j, x = mx(i), y = my(j);
  const r = cerca(Ssup, x, y, BOX[1][2] - 0.1, BOX[0][2] + 0.1, true); if (!Number.isNaN(r)) zr[m] = r;
  const t = cerca(S, x, y, BOX[1][2] - 0.1, zr[m] - 0.3, true); if (Number.isNaN(t)) continue;
  const b = cerca(S, x, y, t - 0.005, zr[m] - 0.3, false); zt[m] = t; zb[m] = Number.isNaN(b) ? zr[m] : b;
  zd[m] = zb[m]; for (let z = zb[m] - DZ, prev = sample(S, x, y, z + DZ); z > zr[m]; z -= DZ) { const d = sample(S, x, y, z); if (d > 0 && prev <= 0) zd[m] = z; prev = d; } }   // zd: faccia profonda dello strato più basso
log('mappa 2D', MX, '×', MY);

/* ---- 2. margine voluto: quello del corpo dello sterno, che sul manubrio piega verso X_TOP ---- */
const xCur = new Float32Array(MY).fill(NaN);
for (let j = 0; j < MY; j++) { const y = my(j); if (y < Y_LIM[0] || y > Y_LIM[1]) continue; for (let i = MX - 1; i >= 0; i--) if (!Number.isNaN(zt[i + MX * j]) && mx(i) > ZONA_X) { xCur[j] = mx(i); break; } }
const xm = new Float32Array(MY).fill(NaN);
for (let j = 0; j < MY; j++) { const y = my(j); if (y < Y_LIM[0] - 0.5 || y > Y_LIM[1]) continue;
  // corpo: gaussiana dei margini di BASE sotto Y_MAN (sopra, il margine di BASE è quello della tasca e non entra)
  let s = 0, w = 0; for (let q = 0; q < MY; q++) { const yq = my(q); if (Number.isNaN(xCur[q]) || yq > Y_MAN) continue; const g = Math.exp(-((yq - Math.min(y, Y_MAN)) ** 2) / (2 * SIGMA_M ** 2)); s += g * xCur[q]; w += g; }
  const xb = s / w; xm[j] = y <= Y_MAN ? xb : xb + (X_TOP - xb) * sstep(Y_MAN, Y_TOP, y); }   // manubrio: piega verso X_TOP
const sd2 = new Float32Array(NM).fill(-1);   // distanza con segno dal margine (positiva dentro): x < xm(y), y < Y_TOP, angolo raccordato
for (let j = 0; j < MY; j++) for (let i = 0; i < MX; i++) { if (Number.isNaN(xm[j])) continue;
  const q1 = (mx(i) - xm[j]) + R_ANGOLO, q2 = (my(j) - Y_TOP) + R_ANGOLO;
  sd2[i + MX * j] = -(Math.hypot(Math.max(q1, 0), Math.max(q2, 0)) + Math.min(Math.max(q1, q2), 0) - R_ANGOLO); }
const V0 = i => [P0.pos[3 * i], P0.pos[3 * i + 1], P0.pos[3 * i + 2]];

/* ---- 3–4. deformazione della tasca (righe del manubrio sopra Y_MAN): ogni vertice di BASE si sposta secondo campi 2D (x, y) continui. In x il
   muscolo si allunga medialmente fino al margine voluto, con stiramento monotono su una fascia larga BANDA; in z tutti gli strati della colonna si
   spostano insieme (faccia profonda sull'osso, superficiale ferma salvo spessore minimo), così la lamina non si incrocia. ---- */
const c = m => !Number.isNaN(zt[m]);
const xT = new Float32Array(MY).fill(NaN);   // margine voluto per riga (con l'angolo raccordato)
for (let j = 0; j < MY; j++) for (let i = MX - 1; i >= 0; i--) if (sd2[i + MX * j] > 0) { xT[j] = mx(i); break; }
const osso = m => zr[m] > BOX[0][2] + 0.2, zS = Float32Array.from(zr);   // superficie d'appoggio: primo contatto con lo scheletro; dove il raggio non lo trova (fessure) interpolata a membrana
for (let it = 0; it < 1500; it++) for (let m = 0; m < NM; m++) { if (osso(m)) continue; const i = m % MX, j = (m / MX) | 0; let s = 0, n = 0;
  for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) if (a >= 0 && b >= 0 && a < MX && b < MY) { s += zS[a + MX * b]; n++; } zS[m] = s / n; }
for (let j = 0; j < MY; j++) { if (Number.isNaN(xT[j]) || Number.isNaN(xCur[j])) continue;   // il margine arriva all'osso: si ferma dove l'osso sale più di SALTO sopra la faccia profonda del margine di BASE
  const e = Math.round((xCur[j] - BOX[0][0]) / PASSO2 - 0.5) + MX * j; let zE = NaN; for (let q = e; q > e - 4; q--) if (!Number.isNaN(zd[q])) { zE = zd[q]; break; } if (Number.isNaN(zE)) continue;
  for (let i = 0; i < MX; i++) { const x = mx(i), q = i + MX * j; if (x <= xCur[j] || x > xT[j]) continue; if (osso(q) && zS[q] + GAP_Z > zE + SALTO) { xT[j] = Math.max(xCur[j], x - 0.5 * PASSO2); break; } } }
{ const t = Float32Array.from(xT); for (let j = 0; j < MY; j++) { if (Number.isNaN(t[j])) continue; const w = []; for (let b = -4; b <= 4; b++) if (j + b >= 0 && j + b < MY && !Number.isNaN(t[j + b])) w.push(t[j + b]); w.sort((a, b) => a - b); xT[j] = w[w.length >> 1]; } }   // mediana su 9 righe
for (let j = 0; j < MY; j++) { if (Number.isNaN(xT[j]) || Number.isNaN(xCur[j])) continue;   // il margine nuovo si ferma prima delle strutture vicine (legamento sternoclavicolare, succlavio…)
  for (let i = 0; i < MX; i++) { const x = mx(i); if (x <= xCur[j] || x > xT[j]) continue; const z = zS[i + MX * j] + GAP_Z; let urta = false;
    for (let h = 0; h <= SPESS_MOLLI && !urta; h += 0.05) urta = sample(Sm, x, my(j), z + h) < GAP_MOLLI + LIBERO; if (urta) { xT[j] = x - LIBERO; break; } } }
const lisciaY = (A, sig) => { const o = new Float32Array(MY); for (let j = 0; j < MY; j++) { let s = 0, w = 0; for (let q = 0; q < MY; q++) { if (Number.isNaN(A[q])) continue; const g = Math.exp(-(((q - j) * PASSO2) ** 2) / (2 * sig * sig)); s += g * A[q]; w += g; } o[j] = w > 1e-6 ? s / w : NaN; } return o; };
const wy = y => sstep(Y_MAN, Y_MAN + SALITA, y);
const dRaw = Float32Array.from(xCur, (x, j) => my(j) > Y_MAN && !Number.isNaN(x) && !Number.isNaN(xT[j]) ? Math.max(0, xT[j] - x) : (Number.isNaN(x) ? NaN : 0));
const dX = lisciaY(dRaw, SIGMA_D), xcS = lisciaY(xCur, SIGMA_D);
const ly = y => { const f = clamp((y - BOX[0][1]) / PASSO2 - 0.5, 0, MY - 1.001), j = f | 0, u = f - j; return [j, u]; };
const riga = (A, y) => { const [j, u] = ly(y); return (1 - u) * A[j] + u * A[j + 1]; };
const fattore = new Float32Array(MY).fill(1);
const Xn = (x, y) => { const d = riga(dX, y) * riga(fattore, y) * wy(y), xc = riga(xcS, y); return x + d * sstep(xc - BANDA, xc, x); };
const L2 = (F, x, y) => { const fx = clamp((x - BOX[0][0]) / PASSO2 - 0.5, 0, MX - 1.001), fy = clamp((y - BOX[0][1]) / PASSO2 - 0.5, 0, MY - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, a = i + MX * j;
  return (1 - v) * ((1 - u) * F[a] + u * F[a + 1]) + v * ((1 - u) * F[a + MX] + u * F[a + MX + 1]); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const raggio = (o, d, [a, b, c]) => { const e1 = sub(b, a), e2 = sub(c, a), pv = cr(d, e2), det = dt(e1, pv); if (Math.abs(det) < 1e-12) return null; const iv = 1 / det, s0 = sub(o, a), u = dt(s0, pv) * iv; if (u < 0 || u > 1) return null;
  const qv = cr(s0, e1), v = dt(d, qv) * iv; if (v < 0 || u + v > 1) return null; const t = dt(e2, qv) * iv; return t > 0 && t < 1; };
const incroci = (Pp, I, Q, J, solo, stessa) => { const Cc = 0.3, hh = new Map(), TA = [], TV = [];   // triangoli di (Pp, I) [solo quelli con vertici mossi] che incrociano (Q, J)
  for (let t = 0; t < J.length; t += 3) { const v = [0, 1, 2].map(k => [Q[3 * J[t + k]], Q[3 * J[t + k] + 1], Q[3 * J[t + k] + 2]]); const ti = TA.length; TA.push(v); TV.push([J[t], J[t + 1], J[t + 2]]);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(v[0][q], v[1][q], v[2][q]) / Cc)), b = [0, 1, 2].map(q => Math.floor(Math.max(v[0][q], v[1][q], v[2][q]) / Cc));
    for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) { const k = x + ',' + y + ',' + z; if (!hh.has(k)) hh.set(k, []); hh.get(k).push(ti); } }
  let n = 0;
  for (let t = 0; t < I.length; t += 3) { if (solo && !solo[I[t]] && !solo[I[t + 1]] && !solo[I[t + 2]]) continue; const A = [0, 1, 2].map(k => [Pp[3 * I[t + k]], Pp[3 * I[t + k] + 1], Pp[3 * I[t + k] + 2]]);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(A[0][q], A[1][q], A[2][q]) / Cc)), b = [0, 1, 2].map(q => Math.floor(Math.max(A[0][q], A[1][q], A[2][q]) / Cc)), visti = new Set(); let o = false;
    for (let x = a[0]; x <= b[0] && !o; x++) for (let y = a[1]; y <= b[1] && !o; y++) for (let z = a[2]; z <= b[2] && !o; z++) for (const u of hh.get(x + ',' + y + ',' + z) || []) {
      if (visti.has(u)) continue; visti.add(u); if (stessa && TV[u].some(w => w === I[t] || w === I[t + 1] || w === I[t + 2])) continue;
      const Bt = TA[u]; for (let e = 0; e < 3 && !o; e++) o = raggio(A[e], sub(A[(e + 1) % 3], A[e]), Bt) || raggio(Bt[e], sub(Bt[(e + 1) % 3], Bt[e]), A); if (o) { incroci.ultimo = TV[u]; break; } }
    if (o) { n++; if (incroci.lista) incroci.lista.push([t, incroci.ultimo]); } }
  return n; };
const lip = F => { const G = Float32Array.from(F), d1 = PENDENZA * PASSO2, d2 = d1 * Math.SQRT2;   // inviluppo superiore con pendenza al più PENDENZA (cono), per passate di chamfer
  for (let rip = 0; rip < 2; rip++) { for (let j = 0; j < MY; j++) for (let i = 0; i < MX; i++) { const m = i + MX * j; let g = G[m];
      if (i > 0) g = Math.max(g, G[m - 1] - d1); if (j > 0) { g = Math.max(g, G[m - MX] - d1); if (i > 0) g = Math.max(g, G[m - MX - 1] - d2); if (i < MX - 1) g = Math.max(g, G[m - MX + 1] - d2); } G[m] = g; }
    for (let j = MY - 1; j >= 0; j--) for (let i = MX - 1; i >= 0; i--) { const m = i + MX * j; let g = G[m];
      if (i < MX - 1) g = Math.max(g, G[m + 1] - d1); if (j < MY - 1) { g = Math.max(g, G[m + MX] - d1); if (i < MX - 1) g = Math.max(g, G[m + MX + 1] - d2); if (i > 0) g = Math.max(g, G[m + MX - 1] - d2); } G[m] = g; } }
  return G; };
const peso = new Float32Array(NM), serve = new Float32Array(NM), zona = y => sstep(Y_MAN - CODA, Y_MAN, y);   // zona: finestra in y dello spostamento in z (continua)
const campo = () => {   // faccia profonda: spostamento in z per colonna (coordinate di BASE), ricalcolato a ogni giro perché dipende dall'allungamento della riga
  const D = new Float32Array(NM); peso.fill(0);
  for (let m = 0; m < NM; m++) { if (!c(m)) continue; const x = mx(m % MX), y = my((m / MX) | 0), w = wy(y), xc = riga(xcS, y), W = w * sstep(xc - BANDA_Z, xc - 0.1, x);
    if (W <= 0) { peso[m] = 1; continue; } const xp = Xn(x, y), q = Math.round((xp - BOX[0][0]) / PASSO2 - 0.5) + MX * ((m / MX) | 0); if (!osso(q)) continue;   // punto d'arrivo senza osso sotto: dai vicini
    peso[m] = 1; const r = L2(zS, xp, y) + GAP_Z - zd[m] - Math.max(0, zS[m] + GAP_Z - zd[m]); D[m] = r > 0 ? r : W * r; }   // r > 0: sale sull'osso; r < 0: scende (pesato)
  let F = conv(D, peso, SIGMA_Z); for (let m = 0; m < NM; m++) F[m] = Math.max(F[m], serve[m]);   // levigato, ma mai sotto il sollevamento che serve per restare fuori dall'osso
  for (let k = 0; k < 4; k++) { F = conv(F, uno, SIGMA_Z / 3); for (let m = 0; m < NM; m++) F[m] = Math.max(F[m], serve[m]); }
  for (let m = 0; m < NM; m++) F[m] *= zona(my((m / MX) | 0)); return lip(F); };
const riempi = A => { const o = Float32Array.from(A, v => Number.isNaN(v) ? 0 : v), ok = Uint8Array.from(A, v => Number.isNaN(v) ? 0 : 1);   // estensione a membrana fuori dal muscolo
  for (let it = 0; it < 600; it++) for (let m = 0; m < NM; m++) { if (ok[m]) continue; const i = m % MX, j = (m / MX) | 0; let s = 0, n = 0;
    for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) if (a >= 0 && b >= 0 && a < MX && b < MY) { s += o[a + MX * b]; n++; } o[m] = s / n; } return o; };
const ztF = riempi(zt), zdF = riempi(zd);
const cima = DB => {   // faccia superficiale: resta dov'è, salvo dove la faccia profonda sollevata la lascerebbe più sottile di T_SOPRA (raccordo morbido)
  const need = Float32Array.from(DB, (b, m) => zdF[m] + b + Math.min(ztF[m] - zdF[m], T_SOPRA) - ztF[m]);
  let D = Float32Array.from(need, a => (a + Math.sqrt(a * a + K_SOPRA * K_SOPRA)) / 2); D = conv(D, uno, SIGMA_Z / 3); for (let m = 0; m < NM; m++) D[m] = Math.max(D[m], need[m]); return lip(D); };
const spostaZ = (DB, DT, x, y, z) => { const b = L2(DB, x, y), t = L2(DT, x, y), z0 = L2(zdF, x, y), z1 = L2(ztF, x, y), f = z1 - z0 > 1e-3 ? clamp((z - z0) / (z1 - z0), 0, 1) : 0; return b + f * (t - b); };
const pos = Float32Array.from(P0.pos), nv = P0.nv, pt = v => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]], mosso = new Uint8Array(nv), d0 = new Float32Array(nv).fill(1);
for (let v = 0; v < nv; v++) { const p = V0(v); if (dentro(p) && zona(p[1]) > 0) d0[v] = sample(Sb, ...p); }
const Qm = {}; for (const o of MOLLI) { const Q = REAL(o); if (!incroci(P0.pos, P0.idx, Q.pos, Q.idx, Uint8Array.from({ length: P0.nv }, (_, v) => zona(P0.pos[3 * v + 1]) > 0 ? 1 : 0))) Qm[o] = Q; }   // strutture che il muscolo di BASE non attraversa qui
log('strutture vicine da non attraversare:', Object.keys(Qm).join(', '));
let DZs, DTs, inOsso = 0, inMolli = 0;
for (let giro = 0; giro <= GIRI; giro++) {   // lo spostamento è lo stesso per tutti gli strati della colonna; se un vertice entra nell'osso più di quanto fosse in BASE, si alza la colonna
  DZs = campo(); DTs = cima(DZs); inOsso = 0; inMolli = 0; const urto = new Uint8Array(MY);
  for (let v = 0; v < nv; v++) { const x = P0.pos[3 * v], y = P0.pos[3 * v + 1]; if (!dentro(V0(v)) || zona(y) <= 0) continue;
    const xn = Xn(x, y), dz = spostaZ(DZs, DTs, x, y, P0.pos[3 * v + 2]); if (Math.abs(xn - x) + Math.abs(dz) < 1e-5) continue; pos[3 * v] = xn; pos[3 * v + 2] = P0.pos[3 * v + 2] + dz; mosso[v] = 1;
    const p = pt(v); if (!dentro(p)) continue; const d = sample(Sb, ...p), g = Math.min(GAP_OSSO, d0[v]); if (d0[v] < 0 || d >= g - 0.003) continue; inOsso++;   // i vertici già dentro l'osso in BASE (inserzione) non si inseguono
    const n = grad(Sb, p), l = Math.hypot(...n), nz = l > 1e-8 ? n[2] / l : 1, alza = (g - d) / Math.max(nz, 0.35);
    const i0 = Math.round((x - BOX[0][0]) / PASSO2 - 0.5), j0 = Math.round((y - BOX[0][1]) / PASSO2 - 0.5);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const i = i0 + a, j = j0 + b; if (i >= 0 && j >= 0 && i < MX && j < MY) serve[i + MX * j] = Math.max(serve[i + MX * j], dz + alza); } }
  for (const o in Qm) { const Q = Qm[o]; incroci.lista = []; incroci(pos, P0.idx, Q.pos, Q.idx, mosso); for (const [t] of incroci.lista) { inMolli++; urto[Math.round((P0.pos[3 * P0.idx[t] + 1] - BOX[0][1]) / PASSO2 - 0.5)] = 1; } incroci.lista = null; }
  for (let j = 0; j < MY; j++) if (urto[j]) for (let b = -14; b <= 14; b++) if (j + b >= 0 && j + b < MY) fattore[j + b] *= 1 - 0.08 * Math.exp(-b * b / 50);   // contro le strutture vicine: la riga (e le vicine) si allunga meno
  if (!inOsso && !inMolli) break; }
{ const gr = F => { let g = 0; for (let j = 1; j < MY - 1; j++) for (let i = 1; i < MX - 1; i++) { const m = i + MX * j; g = Math.max(g, Math.hypot(F[m + 1] - F[m - 1], F[m + MX] - F[m - MX]) / (2 * PASSO2)); } return g; };
  log('pendenza massima dello spostamento in z: faccia profonda', gr(DZs).toFixed(2), ', superficiale', gr(DTs).toFixed(2)); }
log('spostamento massimo: x', Math.max(...Array.from(dX, (d, j) => Number.isNaN(d) ? 0 : d * wy(my(j)))).toFixed(2), 'cm, z', Math.min(...DZs).toFixed(2), '…', Math.max(...DZs).toFixed(2), 'cm');
log('vertici mossi', mosso.reduce((a, b) => a + b, 0), ', ancora dentro l\'osso / strutture vicine più che in BASE', inOsso, '/', inMolli);

/* ---- 5. normali: ricalcolate sui vertici mossi (sfumate con quelle di BASE dove lo spostamento è piccolo) ---- */
const idx = P0.idx, nrm = Int8Array.from(P0.nrm, x => Math.round(x * 127));
{ const nn = new Float64Array(nv * 3); for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]]; if (!mosso[a] && !mosso[b] && !mosso[c]) continue;
    const f = cr(sub(pt(b), pt(a)), sub(pt(c), pt(a))); for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nn[3 * v + k] += f[k]; }
  for (let v = 0; v < nv; v++) { if (!mosso[v]) continue; const s = Math.hypot(pos[3 * v] - P0.pos[3 * v], pos[3 * v + 1] - P0.pos[3 * v + 1], pos[3 * v + 2] - P0.pos[3 * v + 2]), a = clamp(s / 0.05, 0, 1);
    const l = Math.hypot(nn[3 * v], nn[3 * v + 1], nn[3 * v + 2]) || 1, n = [0, 1, 2].map(k => (1 - a) * P0.nrm[3 * v + k] + a * nn[3 * v + k] / l), L = Math.hypot(...n) || 1;
    for (let k = 0; k < 3; k++) nrm[3 * v + k] = Math.round(127 * n[k] / L); } }
const R = { pos, idx: P0.idx, tag: P0.tag, fdir: P0.fdir, nrm };

/* ---- controlli ---- */
log('triangoli mossi che si incrociano:', [...OSSA, ...MOLLI].map(o => { const Q = REAL(o), n = incroci(pos, idx, Q.pos, Q.idx, mosso), n0 = incroci(P0.pos, idx, Q.pos, Q.idx, mosso); return n || n0 ? `${o} ${n} (BASE ${n0})` : null; }).filter(Boolean).join(', ') || 'nessuno');
log('autointersezioni dei triangoli mossi: ora', incroci(pos, idx, pos, idx, mosso, true), ', in BASE', incroci(P0.pos, idx, P0.pos, idx, mosso, true));
{ let mn = 1e9, mx2 = 0; for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]]; if (!mosso[a] && !mosso[b] && !mosso[c]) continue;
    const A0 = Math.hypot(...cr(sub(V0(b), V0(a)), sub(V0(c), V0(a)))), A1 = Math.hypot(...cr(sub(pt(b), pt(a)), sub(pt(c), pt(a)))), r = A1 / (A0 || 1e-9); mn = Math.min(mn, r); mx2 = Math.max(mx2, r); }
  log('area dei triangoli mossi rispetto a BASE: da', mn.toFixed(2), 'a', mx2.toFixed(2)); }
{ const d = []; for (let v = 0; v < nv; v++) { if (!mosso[v]) continue; const p = pt(v); if (dentro(p)) { const s = sample(Ssup, ...p); if (s < 0.2) d.push(s); } } d.sort((a, b) => a - b);
  log('vertici mossi entro 2 mm da sterno e cartilagini:', d.length, d.length ? `minimo ${(d[0] * 10).toFixed(2)} mm, mediana ${(d[d.length >> 1] * 10).toFixed(2)} mm` : ''); }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { G.setMesh(NOME, R); saveFile(repack()); }
