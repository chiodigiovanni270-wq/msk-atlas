/* Grande pettorale, parte sternocostale (`pec_st`) della spalla (modelli/spalla-3d.html): origine sulla faccia anteriore dello sterno con margine
   mediale liscio e continuo, aderente all'osso, senza denti né rientranze.

   Problema. Nella mesh di BodyParts3D il margine mediale del muscolo sul corpo dello sterno è a dente di sega (denti fino a 15 mm rispetto alla
   linea media) e sul manubrio il muscolo non arriva all'osso: resta sospeso sopra la faccia anteriore e il margine rientra di circa 1 cm verso
   le cartilagini costali, lasciando una «tasca» tra muscolo e manubrio sotto l'articolazione sternoclavicolare.

   Uso (dalla cartella del progetto):
     node strumenti/sterno-pettorale-spalla.mjs                → riscrive `pec_st` nel file del modello (topologia nuova solo sullo sterno)
     PROVA=1 node strumenti/sterno-pettorale-spalla.mjs        → stampa i controlli senza scrivere
     MAPPA=/tmp/mappa.csv node strumenti/sterno-pettorale-spalla.mjs   → scrive anche le mappe 2D (spessore, margine) per i controlli
     MODELLO=/tmp/copia.html node strumenti/sterno-pettorale-spalla.mjs   → lavora su una copia
   Ultimo della catena della spalla. Riparte da `pec_st` della revisione `BASE` (mesh, tag, direzioni delle fibre e normali), con le altre
   strutture del file come ostacoli, quindi si può rilanciare con lo stesso risultato.

   Metodo (sullo sterno il muscolo è una lamina appoggiata alla parete toracica: lo si descrive con una mappa 2D (x, y), passo `PASSO2`).
   1. Raggi lungo −z: faccia superficiale (zt) e profonda (zb) del primo tratto di muscolo di BASE; primo contatto (zr) con sterno, cartilagini
      e prima costa, e se è sterno. Superficie d'appoggio zc: chiusura in scala di grigi di zr (disco `R_CHIUSO`, scavalca le fessure tra le
      cartilagini), levigata (`LEVIGA_Z`).
   2. Margine nuovo: x_m(y) = margine di BASE (punto più mediale coperto, riga per riga) levigato con una gaussiana di `SIGMA_M` lungo y sul corpo;
      sul manubrio (sopra `Y_MAN`) piega dolcemente verso l'esterno fino a `X_TOP` e si chiude in alto a `Y_TOP` con un raccordo di raggio `R_ANGOLO`.
      Impronta = distanza con segno 2D dal margine (positiva dentro).
   3. Faccia profonda: sullo sterno, dove BASE è entro `SOSPESO` dall'osso, aderente alla superficie d'appoggio (peso levigato `SIGMA_ADER`),
      mai sotto l'osso; altrove quella di BASE. Faccia superficiale: quella di BASE; nella tasca, allargata di `ALLARGA_TASCA` nel muscolo sul
      manubrio, la sua quota è interpolata a membrana (Laplace, `ITER_TASCA` iterazioni) tra il muscolo di BASE e il margine nuovo. Entrambe
      levigate (`SIGMA_H`); spessore arrotondato entro `ORLO` dal margine, che resta alto `T_BORDO` (niente spigolo a lama).
   4. Campo nuovo: dentro tra le due facce e dentro l'impronta; fuso con quello di BASE col peso della zona (`ZONA_X`, `ZONA_Y`); fuori da ossa
      (`GAP_OSSO`) e strutture vicine (`GAP_MOLLI`), con i vincoli sfumati verso il taglio.
   5. Superficie (surface nets) tagliata al bordo della zona (`TAGLIO_X`, `TAGLIO_Y`), riduzione a quadriche (`TRI` volte la densità di BASE),
      bordo nuovo diradato al passo `PASSO_BORDO`, cucitura a costo minimo con BASE tagliata allo stesso livello, coppie Taubin (16 sulla parte
      nuova, `CUCI_PASSI` sulla striscia della cucitura) con riproiezione fuori dagli ostacoli; tag, fibre e normali da BASE.
   Controlli stampati: triangoli che si incrociano con ossa e strutture vicine (BASE → nuovo, anche solo nella zona piena), spigoli aperti e in più
   di due triangoli, triangoli rovesciati nella cucitura, distanza della faccia profonda dall'osso, scarto del margine da x_m. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const B = await import('./lib-bp3d.mjs');
const { REAL, realDaRevisione, saveFile, repack, log, griglia, solid, edt, sdf, unione, chiuso, esatta, sfoca, nets, sample, sstep, grad, clamp } = G;

const BASE = '5008394', FILE = 'modelli/spalla-3d.html', NOME = 'pec_st';
const STERNO = ['manubrio', 'corpo_sterno'], SUPPORTO = ['manubrio', 'corpo_sterno', 'cc1', 'cc2', 'cc3', 'cc4', 'cc5', 'costa1'];
const OSSA = ['manubrio', 'corpo_sterno', 'cc1', 'cc2', 'cc3', 'cc4', 'cc5', 'costa1', 'costa2', 'clavicola'];
const MOLLI = ['pec_cl', 'sc_leg', 'succl', 'pmin', 'omoi', 'a_succ', 'v_succ', 'plesso'];
const BOX = [[12.6, -13.6, 5.5], [18.6, 2.6, 18.0]];                      // cm: riquadro della griglia
const PASSO = 0.035, PASSO2 = 0.05, R_CHIUSO = 0.8, LEVIGA_Z = 0.2;        // cm
const SOSPESO = 0.8;                                                       // cm: sullo sterno aderisce il muscolo che inizia entro SOSPESO dall'osso
const Y_LIM = [-12.9, 2.0];                                                // cm: righe della mappa considerate
const SIGMA_M = 0.9, Y_MAN = -2.6, X_TOP = 15.0, Y_TOP = 0.7, R_ANGOLO = 0.7;   // margine nuovo (cm)
const SIGMA_H = 0.1, SIGMA_ADER = 0.15, ORLO = 0.3, T_BORDO = 0.12, ITER_TASCA = 3000, ALLARGA_TASCA = 0.4;     // spessore (cm; iterazioni della membrana nella tasca)
const ZONA_X = [13.25, 13.9], ZONA_Y = [-12.9, -12.3], TAGLIO_X = 13.2, TAGLIO_Y = -12.95;   // cm
const GAP_OSSO = 0.03, GAP_MOLLI = 0.04, SOTTO = 0.03;
const PEZZO_MIN = 300, TRI = 2.5, BANDA = 0.3, PASSO_BORDO = 0.06, CUCI_PASSI = 30, CUCI_BANDA = 0.35;

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
const vox = id => [G.O[0] + (id % G.NX + 0.5) * G.H, G.O[1] + (((id / G.NX) | 0) % G.NY + 0.5) * G.H, G.O[2] + (((id / G.NXY) | 0) + 0.5) * G.H];
const dentro = p => p.every((x, k) => x > BOX[0][k] + 0.05 && x < BOX[1][k] - 0.05);
const Ssup = sdf(unione(SUPPORTO)).F; esatta(Ssup, SUPPORTO, 0.08);
const Sst = sdf(unione(STERNO)).F; esatta(Sst, STERNO, 0.08);
const S = sdf(solid(NOME)).F; esatta(S, [NOME], 0.08);
const Sb = esatta(sdf(unione(OSSA)).F, OSSA, 0.08), Sm = sdf(unione(MOLLI)).F;
log('campi di base');

/* ---- 1–2. mappa 2D (x, y) con raggi lungo −z: faccia superficiale (zt) e profonda (zb) del primo tratto di muscolo di BASE, primo contatto con
   lo scheletro (zr) e se è sterno; superficie d'appoggio zc = chiusura in scala di grigi di zr (disco R_CHIUSO) levigata ---- */
const MX = Math.round((BOX[1][0] - BOX[0][0]) / PASSO2), MY = Math.round((BOX[1][1] - BOX[0][1]) / PASSO2), NM = MX * MY;
const mx = i => BOX[0][0] + (i + 0.5) * PASSO2, my = j => BOX[0][1] + (j + 0.5) * PASSO2;
const conv = (F, Wt, sig) => {   // convoluzione normalizzata gaussiana (separabile) sulla mappa
  const r = Math.ceil(3 * sig / PASSO2), k = Array.from({ length: 2 * r + 1 }, (_, q) => Math.exp(-(((q - r) * PASSO2) ** 2) / (2 * sig * sig)));
  const pass = (A, sx, sy, n, m) => { const o = new Float32Array(NM); for (let b = 0; b < m; b++) for (let a = 0; a < n; a++) { let s = 0; for (let q = -r; q <= r; q++) { const c = a + q; if (c >= 0 && c < n) s += k[q + r] * A[b * sy + c * sx]; } o[b * sy + a * sx] = s; } return o; };
  const FW = Float32Array.from(F, (v, m) => Wt[m] ? v * Wt[m] : 0);
  const a = pass(pass(FW, 1, MX, MX, MY), MX, 1, MY, MX), b = pass(pass(Wt, 1, MX, MX, MY), MX, 1, MY, MX);
  return Float32Array.from(a, (x, m) => b[m] > 1e-6 ? x / b[m] : 0); };
const filtro = (F, R, fn) => { const r = Math.round(R / PASSO2), o = new Float32Array(NM); for (let j = 0; j < MY; j++) for (let i = 0; i < MX; i++) { let v = fn === Math.max ? -1e9 : 1e9;
  for (let b = -r; b <= r; b++) { const jj = j + b; if (jj < 0 || jj >= MY) continue; for (let a = -r; a <= r; a++) { const ii = i + a; if (ii < 0 || ii >= MX || a * a + b * b > r * r) continue; v = fn(v, F[ii + MX * jj]); } } o[i + MX * j] = v; } return o; };
const uno = new Float32Array(NM).fill(1), zr = new Float32Array(NM).fill(BOX[0][2]), zt = new Float32Array(NM).fill(NaN), zb = new Float32Array(NM).fill(NaN), st = new Float32Array(NM);
const DZ = 0.01, cerca = (F, x, y, z0, z1, dentroF) => { let prev = sample(F, x, y, z0); for (let z = z0 - DZ; z > z1; z -= DZ) { const d = sample(F, x, y, z); if ((d <= 0) === dentroF) return z - DZ * d / (prev - d || 1); prev = d; } return NaN; };   // primo passaggio (dentro/fuori) scendendo lungo −z
for (let j = 0; j < MY; j++) for (let i = 0; i < MX; i++) { const m = i + MX * j, x = mx(i), y = my(j);
  const r = cerca(Ssup, x, y, BOX[1][2] - 0.1, BOX[0][2] + 0.1, true); if (!Number.isNaN(r)) { zr[m] = r; st[m] = sample(Sst, x, y, r - 0.02) < 0.04 ? 1 : 0; }
  const t = cerca(S, x, y, BOX[1][2] - 0.1, zr[m] - 0.3, true); if (Number.isNaN(t)) continue;
  const b = cerca(S, x, y, t - 0.005, zr[m] - 0.3, false); zt[m] = t; zb[m] = Number.isNaN(b) ? zr[m] : b; }
const zc = conv(filtro(filtro(zr, R_CHIUSO, Math.max), R_CHIUSO, Math.min), uno, LEVIGA_Z);
log('mappa 2D', MX, '×', MY);

/* ---- 3. margine nuovo ---- */
const xCur = new Float32Array(MY).fill(NaN);
for (let j = 0; j < MY; j++) { const y = my(j); if (y < Y_LIM[0] || y > Y_LIM[1]) continue; for (let i = MX - 1; i >= 0; i--) if (!Number.isNaN(zt[i + MX * j]) && mx(i) > ZONA_X[0]) { xCur[j] = mx(i); break; } }
const xm = new Float32Array(MY).fill(NaN);
for (let j = 0; j < MY; j++) { const y = my(j); if (y < Y_LIM[0] - 0.5 || y > Y_LIM[1]) continue;
  // corpo: gaussiana dei margini di BASE sotto Y_MAN (sopra, il margine di BASE è quello della tasca e non entra)
  let s = 0, w = 0; for (let q = 0; q < MY; q++) { const yq = my(q); if (Number.isNaN(xCur[q]) || yq > Y_MAN) continue; const g = Math.exp(-((yq - Math.min(y, Y_MAN)) ** 2) / (2 * SIGMA_M ** 2)); s += g * xCur[q]; w += g; }
  const xb = s / w; xm[j] = y <= Y_MAN ? xb : xb + (X_TOP - xb) * sstep(Y_MAN, Y_TOP, y); }   // manubrio: piega verso X_TOP
const sd2 = new Float32Array(NM).fill(-1);   // distanza con segno dal margine (positiva dentro): x < xm(y), y < Y_TOP, angolo raccordato
for (let j = 0; j < MY; j++) for (let i = 0; i < MX; i++) { if (Number.isNaN(xm[j])) continue;
  const q1 = (mx(i) - xm[j]) + R_ANGOLO, q2 = (my(j) - Y_TOP) + R_ANGOLO;
  sd2[i + MX * j] = -(Math.hypot(Math.max(q1, 0), Math.max(q2, 0)) + Math.min(Math.max(q1, q2), 0) - R_ANGOLO); }

/* ---- 4. faccia profonda e spessore nuovi ---- */
// faccia profonda: sullo sterno (entro SOSPESO) aderente alla superficie d'appoggio, altrove quella di BASE; dove il muscolo manca (tasca), sulla superficie
const c = m => !Number.isNaN(zt[m]), pieno = Float32Array.from(zt, (v, m) => c(m) && sd2[m] > 0 ? 1 : 0);
const ader = conv(Float32Array.from(st, (v, m) => v && (!c(m) || zb[m] - zc[m] < SOSPESO) ? 1 : 0), uno, SIGMA_ADER);
const bot0 = Float32Array.from(zc, (z, m) => c(m) ? ader[m] * Math.min(z, zb[m]) + (1 - ader[m]) * zb[m] : z);
const top0 = Float32Array.from(zt, (z, m) => c(m) ? z : NaN);
// tasca: quota della faccia superficiale interpolata a membrana (Laplace) tra il muscolo di BASE che la circonda e il margine nuovo (sulla superficie d'appoggio)
const T = Float32Array.from(zt, (z, m) => c(m) ? Math.max(z - zc[m], 0) : 0), buco = Uint8Array.from(zt, (z, m) => !c(m) && sd2[m] > 0 && mx(m % MX) > ZONA_X[0] ? 1 : 0);
{ // sul manubrio la tasca si allarga di ALLARGA_TASCA nel muscolo di BASE: il bordo vecchio, assottigliato, non resta come cresta
  const r = Math.round(ALLARGA_TASCA / PASSO2), b0 = Uint8Array.from(buco);
  for (let m = 0; m < NM; m++) { if (b0[m] || sd2[m] <= 0 || my((m / MX) | 0) < Y_MAN || mx(m % MX) < ZONA_X[0]) continue; const i = m % MX, j = (m / MX) | 0;
    for (let b = -r; b <= r && !buco[m]; b++) for (let a = -r; a <= r; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < MX && jj < MY && a * a + b * b <= r * r && b0[ii + MX * jj]) { buco[m] = 1; break; } } } }
const Z = Float32Array.from(zc, (z, m) => c(m) ? zt[m] : z + T[m]);   // quota della faccia superficiale; al margine nuovo è la superficie d'appoggio
for (let it = 0; it < ITER_TASCA; it++) for (let m = 0; m < NM; m++) { if (!buco[m]) continue; const i = m % MX, j = (m / MX) | 0; let s = 0, n = 0;
  for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) { if (a < 0 || b < 0 || a >= MX || b >= MY) continue; const q = a + MX * b; s += sd2[q] > 0 ? Z[q] : zc[q]; n++; } Z[m] = s / n; }
const top1 = Float32Array.from(top0, (z, m) => Number.isNaN(z) || buco[m] ? Math.max(Z[m], zc[m] + T_BORDO) : z);
const bot = conv(bot0, uno, SIGMA_H), top = conv(top1, uno, SIGMA_H);
for (let m = 0; m < NM; m++) if (zr[m] > BOX[0][2] + 0.2) bot[m] = Math.max(bot[m], zr[m] + GAP_OSSO);   // la levigatura abbassa i rilievi dell'osso: la faccia profonda non scende sotto l'osso
const th = new Float32Array(NM);   // spessore nuovo: arrotondato entro ORLO dal margine, che resta alto T_BORDO (niente spigolo a lama)
for (let m = 0; m < NM; m++) { if (sd2[m] <= 0) continue; const e = clamp(sd2[m] / ORLO, 0, 1); const t = Math.max(top[m] - bot[m], T_BORDO); th[m] = T_BORDO + (t - T_BORDO) * Math.sqrt(1 - (1 - e) * (1 - e)); }
if (process.env.MAPPA) { const r = ['x,y,ok,h0,gap0,sd2,hN,bot']; for (let m = 0; m < NM; m++) r.push([mx(m % MX).toFixed(3), my((m / MX) | 0).toFixed(3), 1, c(m) ? (zt[m] - zc[m]).toFixed(3) : 0, c(m) ? (zb[m] - zc[m]).toFixed(3) : -1, sd2[m].toFixed(3), th[m].toFixed(3), (bot[m] - zc[m]).toFixed(3)].join(','));
  writeFileSync(process.env.MAPPA, r.join('\n')); writeFileSync(process.env.MAPPA + '.margine', Array.from(xCur, (v, j) => `${my(j).toFixed(3)},${v},${xm[j]}`).join('\n')); log('mappe scritte'); }
if (process.env.SOLO_MAPPA) process.exit(0);

/* ---- 5. campo nuovo ---- */
const L2 = (F, x, y) => { const fx = clamp((x - BOX[0][0]) / PASSO2 - 0.5, 0, MX - 1.001), fy = clamp((y - BOX[0][1]) / PASSO2 - 0.5, 0, MY - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, a = i + MX * j;
  return (1 - v) * ((1 - u) * F[a] + u * F[a + 1]) + v * ((1 - u) * F[a + MX] + u * F[a + MX + 1]); };
const zonaW = p => sstep(ZONA_X[0], ZONA_X[1], p[0]) * sstep(ZONA_Y[0], ZONA_Y[1], p[1]);
const V = new Float32Array(N); let cambiati = 0;
for (let i = 0; i < N; i++) { const p = vox(i), w = zonaW(p); if (w <= 0) { V[i] = S[i]; continue; }
  const b = L2(bot, p[0], p[1]), Fh = Math.max(b - SOTTO - p[2], p[2] - b - L2(th, p[0], p[1]), -L2(sd2, p[0], p[1]));
  V[i] = w * Fh + (1 - w) * S[i]; }
sfoca(V, 1);
// vincoli di contatto pieni nella zona, sfumati verso il taglio (al taglio il campo resta quello di BASE, perché i due bordi combacino)
for (let i = 0; i < N; i++) { const p = vox(i), wc = sstep(TAGLIO_X + 0.03, ZONA_X[1], p[0]) * sstep(TAGLIO_Y + 0.03, ZONA_Y[1], p[1]); if (wc <= 0) continue;
  const v = wc * Math.max(V[i], GAP_OSSO - Sb[i], GAP_MOLLI - Sm[i]) + (1 - wc) * V[i]; if ((v < 0) !== (S[i] < 0)) cambiati++; V[i] = v; }
log('campo pronto: voxel cambiati', cambiati);
const taglio = p => Math.min(p[0] - TAGLIO_X, p[1] - TAGLIO_Y);   // ≥ 0 nella parte rifatta
/* ---- 6. superficie nuova, tagliata al bordo della zona, e BASE tagliata allo stesso livello ---- */
let nuova = nets(V, () => [1, 0, 0]);
{ const s = Float64Array.from({ length: nuova.pos.length / 3 }, (_, i) => taglio([nuova.pos[3 * i], nuova.pos[3 * i + 1], nuova.pos[3 * i + 2]]));
  const c = B.ritagliaCampo(nuova.pos, nuova.idx, s); nuova = { pos: c.pos, idx: c.idx, s: c.s }; }
{ // pezzi staccati
  const nv = nuova.pos.length / 3, par = Int32Array.from({ length: nv }, (_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < nuova.idx.length; t += 3) { const a = f(nuova.idx[t]); par[f(nuova.idx[t + 1])] = a; par[f(nuova.idx[t + 2])] = a; }
  const cnt = new Map(); for (let t = 0; t < nuova.idx.length; t += 3) { const r = f(nuova.idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const I = []; for (let t = 0; t < nuova.idx.length; t += 3) if (cnt.get(f(nuova.idx[t])) >= PEZZO_MIN) I.push(nuova.idx[t], nuova.idx[t + 1], nuova.idx[t + 2]);
  log('superficie nuova: pezzi', cnt.size, ', triangoli in pezzi staccati tolti', nuova.idx.length / 3 - I.length / 3);
  const c = B.compatta(nuova.pos, Uint32Array.from(I), [nuova.s]); nuova = { pos: c.pos, idx: c.idx, s: c.extra[0] }; }
const sB = Float64Array.from({ length: P0.nv }, (_, i) => -taglio([P0.pos[3 * i], P0.pos[3 * i + 1], P0.pos[3 * i + 2]]));
const at0 = new Float64Array(P0.nv * 7); for (let i = 0; i < P0.nv; i++) { at0[7 * i] = P0.tag[i]; for (let k = 0; k < 3; k++) { at0[7 * i + 1 + k] = P0.fdir[3 * i + k]; at0[7 * i + 4 + k] = P0.nrm[3 * i + k]; } }
const vec = B.ritagliaCampo(P0.pos, P0.idx, sB, at0, 7);

{ // riduzione della parte nuova alla densità di BASE nella stessa zona (bordo del taglio fermo)
  let area0 = 0, n0 = 0; for (let t = 0; t < P0.idx.length; t += 3) if (sB[P0.idx[t]] < 0 && sB[P0.idx[t + 1]] < 0 && sB[P0.idx[t + 2]] < 0) n0++;
  const nv = nuova.pos.length / 3, fissi = new Uint8Array(nv); for (let i = 0; i < nv; i++) if (Math.abs(nuova.s[i]) < 1e-9) fissi[i] = 1;
  const target = Math.max(Math.round(n0 * TRI), 2000), r = B.riduci(Float64Array.from(nuova.pos), nuova.idx, target, fissi);
  const c = B.compatta(r.pos, r.idx, [nuova.s]); log('parte nuova ridotta:', nuova.idx.length / 3, '→', c.idx.length / 3, 'triangoli (BASE nella zona', n0, ')'); nuova = { pos: c.pos, idx: c.idx, s: c.extra[0] }; void area0; }

/* ---- cucitura: bordi del taglio (anelli di spigoli usati una volta sola) uniti con una striscia di triangoli ---- */
const anelli = (idx, sul) => { const nx = new Map();
  const ec = new Map(); for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; ec.set(a + ',' + b, 1); }
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; if (!ec.has(b + ',' + a) && sul(a) && sul(b)) nx.set(a, b); }
  const L = [], visto = new Set(); for (const s of nx.keys()) { if (visto.has(s)) continue; const r = []; let v = s; while (v !== undefined && !visto.has(v)) { visto.add(v); r.push(v); v = nx.get(v); } if (r.length > 2) L.push(r); }
  return L; };
{ // bordo nuovo diradato al passo PASSO_BORDO (la riduzione lascia fermi i vertici del taglio, fitti come la griglia): ogni vertice del bordo più vicino
  // di PASSO_BORDO all'ultimo tenuto confluisce in quello; i triangoli degeneri sono tolti
  const P = nuova.pos, d = (a, b) => Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]), map = Int32Array.from({ length: P.length / 3 }, (_, i) => i);
  for (const r of anelli(nuova.idx, v => Math.abs(nuova.s[v]) < 1e-9)) { let k = r[0]; for (let q = 1; q < r.length; q++) { const v = r[q]; if (d(k, v) < PASSO_BORDO && d(v, r[0]) >= PASSO_BORDO / 2) map[v] = k; else k = v; } }
  const I = []; for (let t = 0; t < nuova.idx.length; t += 3) { const v = [map[nuova.idx[t]], map[nuova.idx[t + 1]], map[nuova.idx[t + 2]]]; if (v[0] !== v[1] && v[1] !== v[2] && v[0] !== v[2]) I.push(...v); }
  const c = B.compatta(nuova.pos, Uint32Array.from(I), [nuova.s]); log('bordo nuovo diradato:', anelli(c.idx, v => Math.abs(c.extra[0][v]) < 1e-9).map(r => r.length).join(' '), 'vertici'); nuova = { pos: c.pos, idx: c.idx, s: c.extra[0] }; }
const nN = nuova.pos.length / 3, pos = [...nuova.pos, ...vec.pos], idx = [...nuova.idx, ...Array.from(vec.idx, v => v + nN)];
const AN = anelli(nuova.idx, v => Math.abs(nuova.s[v]) < 1e-9), AB = anelli(vec.idx, v => vec.orig[v] < 0).map(r => r.map(v => v + nN));
const pt = v => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]], dd = (a, b) => Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);
const cen = r => { const c = [0, 0, 0]; for (const v of r) for (let k = 0; k < 3; k++) c[k] += pos[3 * v + k] / r.length; return c; };
log('anelli del taglio: nuova', AN.map(r => r.length).join(' '), '; BASE', AB.map(r => r.length).join(' '));
let cuciti = 0, scartoMax = 0;
for (const A of AB) {   // A: bordo di BASE nel verso dei suoi triangoli; Bn: bordo nuovo più vicino, nel verso opposto ai suoi triangoli
  // anello nuovo più vicino: distanza media dei vertici di A dal più vicino dell'anello (i due bordi hanno densità diverse: il baricentro non basta)
  let best = null, bd = 1e9; for (const r of AN) { let sm = 0; for (let q = 0; q < A.length; q += 4) { let mn = 1e9; for (const v of r) mn = Math.min(mn, dd(A[q], v)); sm += mn; } const d = sm / Math.ceil(A.length / 4); if (d < bd) { bd = d; best = r; } }
  if (!best || bd > 0.5) { log('ATTENZIONE: anello di BASE senza corrispondente', A.length); continue; }
  // cucitura a costo minimo (programmazione dinamica sulla somma delle lunghezze degli spigoli nuovi): i due bordi hanno densità molto diverse
  const zip = Bn0 => { let j0 = 0, m = 1e9; for (let j = 0; j < Bn0.length; j++) { const d = dd(A[0], Bn0[j]); if (d < m) { m = d; j0 = j; } } const Bn = [...Bn0.slice(j0), ...Bn0.slice(0, j0)];
    const nA = A.length, nB = Bn.length, W1 = nB + 1, C = new Float64Array((nA + 1) * W1).fill(Infinity), da = new Uint8Array((nA + 1) * W1); C[0] = 0;
    for (let i = 0; i <= nA; i++) for (let j = 0; j <= nB; j++) { const c = C[i * W1 + j]; if (c === Infinity) continue;
      if (i < nA) { const v = c + dd(A[(i + 1) % nA], Bn[j % nB]), q = (i + 1) * W1 + j; if (v < C[q]) { C[q] = v; da[q] = 1; } }
      if (j < nB) { const v = c + dd(A[i % nA], Bn[(j + 1) % nB]), q = i * W1 + j + 1; if (v < C[q]) { C[q] = v; da[q] = 2; } } }
    const T = []; let i = nA, j = nB, sc = 0;
    while (i > 0 || j > 0) { const q = i * W1 + j; if (da[q] === 1) { i--; T.push(A[(i + 1) % nA], A[i % nA], Bn[j % nB]); sc = Math.max(sc, dd(A[(i + 1) % nA], Bn[j % nB])); } else { j--; T.push(Bn[j % nB], Bn[(j + 1) % nB], A[i % nA]); sc = Math.max(sc, dd(A[i % nA], Bn[(j + 1) % nB])); } }
    return { T, sc }; };
  // verso: opposto a quello dei triangoli del bordo nuovo; se l'orientamento delle due superfici non torna, vince il verso con lo scarto minore
  const z1 = zip([...best].reverse()), z2 = zip([...best]), z = z1.sc <= z2.sc ? z1 : z2; if (z !== z1) log('ATTENZIONE: anello cucito nel verso dei triangoli del bordo nuovo');
  idx.push(...z.T); scartoMax = Math.max(scartoMax, z.sc);
  cuciti++; }
log('anelli cuciti', cuciti, ', distanza massima tra i due bordi', (scartoMax * 10).toFixed(2), 'mm');

/* Levigatura della superficie e della cucitura, con peso continuo che si annulla fuori
   dalla zona operata. Coppie Taubin limitano il ritiro della lamina; dopo ciascuna
   coppia riproiettiamo fuori da ossa, legamento e tessuti vicini. */
{
  const prima = Float64Array.from(pos);
  const nv = pos.length / 3, adj = Array.from({length: nv}, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = idx[t+k], b = idx[t+(k+1)%3]; adj[a].add(b); adj[b].add(a);
  }
  // prima la parte nuova (16 coppie), poi solo la striscia della cucitura su entrambi i lati (CUCI_PASSI coppie entro CUCI_BANDA dal taglio)
  const generale = Float64Array.from({length:nv}, (_,i) => 1-sstep(-0.2,BANDA,-taglio(pt(i)))), cucitura = Float64Array.from({length:nv}, (_,i) => (i < nN ? 1 : vec.orig[i-nN] < 0 ? 0.5 : 0)*(1-sstep(0,CUCI_BANDA,Math.abs(taglio(pt(i))))));   // dal lato di BASE solo i vertici del bordo (i suoi triangoli sono grandi)
  for (let pass = 0; pass < 16 + CUCI_PASSI; pass++) { const weights = pass < 16 ? generale : cucitura;
    for (const lambda of [0.45,-0.47]) {
      const prev = Float64Array.from(pos);
      for (let i = 0; i < nv; i++) {
        if (!weights[i] || !adj[i].size) continue;
        for (let k = 0; k < 3; k++) {
          let sum = 0; for (const j of adj[i]) sum += prev[3*j+k];
          pos[3*i+k] = prev[3*i+k] + lambda*weights[i]*(sum/adj[i].size-prev[3*i+k]);
        }
      }
    }
    for (let i = 0; i < nv; i++) {
      if (!weights[i]) continue;
      for (const [field,gap] of [[Sb,GAP_OSSO],[Sm,GAP_MOLLI]]) {
        const p = pt(i); if (!dentro(p)) continue;
        const d = sample(field,...p); if (d >= gap) continue;
        const n = grad(field,p), norm2 = n.reduce((s,v)=>s+v*v,0);
        // grad() restituisce differenze finite, non derivate: usare la direzione unitaria.
        if (norm2 > 1e-8) for (let k=0;k<3;k++) pos[3*i+k] += n[k]*Math.min(PASSO, gap-d)/Math.sqrt(norm2);
      }
    }
  }
  let spostamento = 0;
  for (let i = 0; i < nv; i++) {
    const d = Math.hypot(...[0,1,2].map(k => pos[3*i+k]-prima[3*i+k]));
    if (!Number.isFinite(d) || d > 0.5) throw new Error('Levigatura instabile: vertice '+i+' ('+(i < nN ? 'nuovo' : 'BASE')+') in '+[0,1,2].map(k => prima[3*i+k].toFixed(2))+', spostamento '+d+' cm');
    spostamento = Math.max(spostamento,d);
  }
  log('superficie e cucitura: 16 +', CUCI_PASSI, 'coppie Taubin, spostamento massimo', (10*spostamento).toFixed(2), 'mm');
}

/* ---- 4. attributi e normali ---- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const tri = (p, a, b, c) => { const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dt(ab, ap), d2 = dt(ac, ap); if (d1 <= 0 && d2 <= 0) return [1, 0, 0];   // punto più vicino (Ericson), baricentriche
  const bp = sub(p, b), d3 = dt(ab, bp), d4 = dt(ac, bp); if (d3 >= 0 && d4 <= d3) return [0, 1, 0]; const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cp = sub(p, c), d5 = dt(ab, cp), d6 = dt(ac, cp); if (d6 >= 0 && d5 <= d6) return [0, 0, 1]; const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [1 - v - w, v, w]; };
const h = 0.2, Hm = new Map(), key = (a, b, c) => a + ',' + b + ',' + c, V0 = i => [P0.pos[3 * i], P0.pos[3 * i + 1], P0.pos[3 * i + 2]];
for (let t = 0; t < P0.idx.length; t += 3) { const q = [0, 1, 2].map(k => Math.floor((P0.pos[3 * P0.idx[t]] * 0 + (P0.pos[3 * P0.idx[t] + k] + P0.pos[3 * P0.idx[t + 1] + k] + P0.pos[3 * P0.idx[t + 2] + k]) / 3) / h)); const k = key(...q); if (!Hm.has(k)) Hm.set(k, []); Hm.get(k).push(t); }
const piuVicino = p => { const c = p.map(x => Math.floor(x / h)); let best = null, bd = 1e9;
  for (let r = 1; r <= 4 && !best; r++) for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) for (const t of Hm.get(key(c[0] + x, c[1] + y, c[2] + z)) || []) {
    const A = V0(P0.idx[t]), Bv = V0(P0.idx[t + 1]), Cv = V0(P0.idx[t + 2]), w = tri(p, A, Bv, Cv), q = [0, 1, 2].map(k => w[0] * A[k] + w[1] * Bv[k] + w[2] * Cv[k]), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (d < bd) { bd = d; best = { t, w }; } }
  return best; };
const nv = pos.length / 3, tag = new Uint8Array(nv), fdir = new Int8Array(nv * 3), nrm = new Int8Array(nv * 3), nB0 = new Float64Array(nv * 3), sv = new Float64Array(nv);
for (let i = 0; i < nv; i++) {
  if (i >= nN) { const q = i - nN; tag[i] = Math.round(vec.attr[7 * q]); const d = [1, 2, 3].map(m => vec.attr[7 * q + m]), l = Math.hypot(...d) || 1; for (let k = 0; k < 3; k++) { fdir[3 * i + k] = Math.round(127 * d[k] / l); nB0[3 * i + k] = vec.attr[7 * q + 4 + k]; } sv[i] = vec.s[q]; continue; }
  const b = piuVicino(pt(i)); sv[i] = -1; if (!b) continue; const T3 = [P0.idx[b.t], P0.idx[b.t + 1], P0.idx[b.t + 2]];
  tag[i] = Math.round(b.w[0] * P0.tag[T3[0]] + b.w[1] * P0.tag[T3[1]] + b.w[2] * P0.tag[T3[2]]);
  const d = [0, 1, 2].map(k => b.w[0] * P0.fdir[3 * T3[0] + k] + b.w[1] * P0.fdir[3 * T3[1] + k] + b.w[2] * P0.fdir[3 * T3[2] + k]), l = Math.hypot(...d) || 1; for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(127 * d[k] / l); }
{ const nn = new Float64Array(nv * 3); for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]], u = sub(pt(b), pt(a)), w = sub(pt(c), pt(a)), f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nn[3 * v + k] += f[k]; }
  for (let i = 0; i < nv; i++) { const l = Math.hypot(nn[3 * i], nn[3 * i + 1], nn[3 * i + 2]) || 1, u = i < nN ? 0 : sstep(0, BANDA, sv[i]), lb = Math.hypot(nB0[3 * i], nB0[3 * i + 1], nB0[3 * i + 2]) || 1;
    const n = [0, 1, 2].map(k => (1 - u) * nn[3 * i + k] / l + u * nB0[3 * i + k] / lb), ln = Math.hypot(...n) || 1; for (let k = 0; k < 3; k++) nrm[3 * i + k] = Math.round(127 * n[k] / ln); } }
const R = { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag, fdir, nrm };

{ // triangoli della striscia di cucitura con la faccia opposta alle normali dei vertici
  let rov = 0, tot = 0; for (let t = 0; t < R.idx.length; t += 3) { const [a, b, c2] = [R.idx[t], R.idx[t + 1], R.idx[t + 2]]; const P = v => [R.pos[3 * v], R.pos[3 * v + 1], R.pos[3 * v + 2]];
  const m = [0, 1, 2].map(k => (P(a)[k] + P(b)[k] + P(c2)[k]) / 3); if (Math.abs(taglio(m)) > 0.3) continue; tot++;
  const u = sub(P(b), P(a)), w = sub(P(c2), P(a)), f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], n = [0, 1, 2].map(k => R.nrm[3 * a + k] + R.nrm[3 * b + k] + R.nrm[3 * c2 + k]);
  if (dt(f, n) < 0) rov++; } log('striscia della cucitura (entro 3 mm dal taglio): triangoli', tot, ', rovesciati', rov); }
log(NOME, ':', nv, 'vertici,', idx.length / 3, 'triangoli (BASE', P0.nv, 'vertici,', P0.idx.length / 3, 'triangoli)');

/* ---- controlli ---- */
const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const raggio = (o, d, [a, b, c]) => { const e1 = sub(b, a), e2 = sub(c, a), pv = cr(d, e2), det = dt(e1, pv); if (Math.abs(det) < 1e-12) return null; const iv = 1 / det, s0 = sub(o, a), u = dt(s0, pv) * iv; if (u < 0 || u > 1) return null;
  const qv = cr(s0, e1), v = dt(d, qv) * iv; if (v < 0 || u + v > 1) return null; const t = dt(e2, qv) * iv; return t > 0 && t < 1; };
const incroci = (Pp, I, Q, J) => { const Cc = 0.3, hh = new Map(), TA = [];
  for (let t = 0; t < J.length; t += 3) { const v = [0, 1, 2].map(k => [Q[3 * J[t + k]], Q[3 * J[t + k] + 1], Q[3 * J[t + k] + 2]]); const ti = TA.length; TA.push(v);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(v[0][q], v[1][q], v[2][q]) / Cc)), b = [0, 1, 2].map(q => Math.floor(Math.max(v[0][q], v[1][q], v[2][q]) / Cc));
    for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) { const k = x + ',' + y + ',' + z; if (!hh.has(k)) hh.set(k, []); hh.get(k).push(ti); } }
  let n = 0;
  for (let t = 0; t < I.length; t += 3) { const A = [0, 1, 2].map(k => [Pp[3 * I[t + k]], Pp[3 * I[t + k] + 1], Pp[3 * I[t + k] + 2]]);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(A[0][q], A[1][q], A[2][q]) / Cc)), b = [0, 1, 2].map(q => Math.floor(Math.max(A[0][q], A[1][q], A[2][q]) / Cc)), visti = new Set(); let o = false;
    for (let x = a[0]; x <= b[0] && !o; x++) for (let y = a[1]; y <= b[1] && !o; y++) for (let z = a[2]; z <= b[2] && !o; z++) for (const u of hh.get(x + ',' + y + ',' + z) || []) {
      if (visti.has(u)) continue; visti.add(u); const Bt = TA[u]; for (let e = 0; e < 3 && !o; e++) o = raggio(A[e], sub(A[(e + 1) % 3], A[e]), Bt) || raggio(Bt[e], sub(Bt[(e + 1) % 3], Bt[e]), A); if (o) break; }
    if (o) n++; }
  return n; };
log(NOME, ', triangoli che si incrociano (BASE → nuovo):', [...OSSA, ...MOLLI].map(o => { const Q = REAL(o); const a = incroci(P0.pos, P0.idx, Q.pos, Q.idx), b = incroci(R.pos, R.idx, Q.pos, Q.idx); return a || b ? `${o} ${a} → ${b}` : null; }).filter(Boolean).join(', ') || 'nessuno');
const zonaT = (P, I) => { const o = []; for (let t = 0; t < I.length; t += 3) if ([0, 1, 2].every(k => P[3 * I[t + k]] > ZONA_X[1] && P[3 * I[t + k] + 1] > ZONA_Y[1])) o.push(I[t], I[t + 1], I[t + 2]); return o; };
log(NOME, ', triangoli che si incrociano nella zona piena (x > ' + ZONA_X[1] + ', BASE → nuovo):', [...OSSA, ...MOLLI].map(o => { const Q = REAL(o); const a = incroci(P0.pos, zonaT(P0.pos, P0.idx), Q.pos, Q.idx), b = incroci(R.pos, zonaT(R.pos, R.idx), Q.pos, Q.idx); return a || b ? `${o} ${a} → ${b}` : null; }).filter(Boolean).join(', ') || 'nessuno');
for (const [nome, I] of [['BASE', P0.idx], ['nuovo', R.idx]]) { // spigoli: ogni spigolo in due triangoli (mesh chiusa)
  const ec = new Map(); for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3], q = a < b ? a + ',' + b : b + ',' + a; ec.set(q, (ec.get(q) || 0) + 1); }
  let aperti = 0, multipli = 0; for (const c of ec.values()) { if (c === 1) aperti++; else if (c > 2) multipli++; } log(nome, ': spigoli di bordo', aperti, ', spigoli in più di due triangoli', multipli); }
{ // faccia profonda: distanza dall'osso dei vertici nuovi entro 4 mm dallo sterno; margine: punto più mediale per riga rispetto a x_m(y)
  const d = [], d0 = [], q = a => { a.sort((x, y) => x - y); return a.length ? `minimo ${(a[0] * 10).toFixed(2)} mm, 10% ${(a[Math.floor(a.length * 0.1)] * 10).toFixed(2)} mm, mediana ${(a[a.length >> 1] * 10).toFixed(2)} mm` : '-'; };
  const sterno = p => dentro(p) && p[0] > ZONA_X[1] && p[1] > ZONA_Y[1] ? sample(Ssup, ...p) : 9;
  for (let i = 0; i < nN; i++) { const s = sterno(pt(i)); if (s < 0.4) d.push(s); }
  for (let i = 0; i < P0.nv; i++) { const s = sterno(V0(i)); if (s < 0.4) d0.push(s); }
  log('vertici entro 4 mm da sterno e cartilagini (zona piena): BASE', d0.length, q(d0), '→ nuovo', d.length, q(d));
  const riga = (P, n) => { const r = new Map(); for (let i = 0; i < n; i++) { const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2]; if (y < -12.2 || y > 0 || x < ZONA_X[1] || !(sample(Ssup, x, y, z) < 0.15)) continue; const k = Math.round(y / 0.25); r.set(k, Math.max(r.get(k) ?? -1e9, x)); } return r; };
  const scarti = (r) => { const a = []; for (const [k, x] of r) { const j = Math.round((k * 0.25 - BOX[0][1]) / PASSO2 - 0.5); if (j >= 0 && j < MY && !Number.isNaN(xm[j])) a.push(x - xm[j]); } a.sort((x, y) => x - y); return a.length ? `da ${(a[0] * 10).toFixed(1)} a ${(a[a.length - 1] * 10).toFixed(1)} mm` : '-'; };
  log('margine mediale sull\'osso (y −12,2…0) rispetto a x_m: BASE', scarti(riga(P0.pos, P0.nv)), '→ nuovo', scarti(riga(R.pos, nN))); }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { G.setMesh(NOME, R); saveFile(repack()); }
