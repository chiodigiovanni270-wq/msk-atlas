/* Inserzione del flessore profondo (FDP) del dito (modelli/polso-dito-3d.html, sezione dito, mesh `d_fdp`).

   Uso (dalla cartella del progetto):
     node strumenti/inserzione-fdp.mjs              → riscrive d_fdp nel file del modello
     MODELLO=/tmp/copia.html node strumenti/inserzione-fdp.mjs   → lavora su una copia

   Nel modello originale il tendine finisce sulla rima interfalangea distale. Il FDP si inserisce invece sulla faccia volare della
   base della falange distale, distalmente alla placca volare. Qui il tendine originale viene tagliato a YCUT (dove è ancora un
   nastro regolare dentro la guaina) e il tratto distale è ricostruito come tubo a sezione ellittica lungo una linea d'asse liscia:
   - la giunzione è cucita direttamente sul bordo del taglio (nessuno scalino, mesh continua);
   - la sezione parte uguale a quella del tendine al taglio, poi si allarga e si appiattisce (aponeurosi d'inserzione);
   - l'asse scavalca la placca volare e scende sulla faccia volare di P3; l'ultimo tratto affonda nell'osso (inserzione).
   Riparte sempre dal FDP della revisione ORIGINALE, quindi si può rilanciare. Parametri in testa.
   Sistema di riferimento: y = asse del dito (distale verso −y), x = radio-ulnare, z = dorso (−) / volare (+). */
import { Modello, Indice, add, sub, mul, dot, cross, unit, len, clamp, sstep, log } from './lib-dito.mjs';

const ORIGINALE = 'ce9a824';
const YCUT = -3.75, SOVRAPP = 0.20, MANICOTTO = 1.0, INIZIO = 1.0, ATTACCO = 0.10, RACC_O = 0.25;   // taglio dell'originale; il manicotto parte SOVRAPP cm più prossimale, allargato del 4%,
                                    // RACC_O: tratto prossimale in cui la superficie originale si raccorda all'involucro (cm)
const YINS = -4.98, YFIN = -5.42;   // inizio dell'inserzione (l'asse inizia a scendere nell'osso) e fine del tendine
const LARGH = 1.28, SPESS_FIN = 0.65;  // semiasse x finale / iniziale; semiasse z finale / iniziale
const GAP = 0.015;                  // distanza minima dalle strutture lungo il decorso (cm)
const AFFONDA = 0.010;               // oltre l'immersione completa: all'estremità anche la faccia volare è sotto la superficie dell'osso (cm)
const SOTTO_A5 = 0.025, SPESS_MIN = 0.035;   // margine sotto la A5; semispessore minimo del tendine sotto la puleggia
// margine della faccia volare del tendine sotto la faccia esterna della A5 (cm)
const RACC = 0.30;                  // frazione del decorso in cui la sezione reale del taglio diventa ellittica
const NR = 60, NA = 72;             // anelli lungo il decorso, punti per anello

const M = new Modello(), O = new Modello(undefined, ORIGINALE);
const g = O.get('d_fdp'), nv = g.pos.length / 3, P = i => [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]];

/* 1) parte prossimale: si tengono i triangoli del tendine originale con tutti i vertici prossimali a YCUT (vertici non spostati).
      Il tratto nuovo parte SOVRAPP cm più prossimale come un manicotto che avvolge l'estremità del tendine originale: la sezione di
      partenza è l'involucro convesso della sezione reale (le pieghe interne del mesh originale restano coperte, nessuna cucitura). */
const pos = [], dir = [], idx = [], mapV = new Map();
const vOrig = i => { if (!mapV.has(i)) { mapV.set(i, pos.length); pos.push(P(i)); dir.push(g.dir[3 * i], g.dir[3 * i + 1], g.dir[3 * i + 2]); } return mapV.get(i); };
for (let t = 0; t < g.idx.length; t += 3) if ([0, 1, 2].every(k => g.pos[3 * g.idx[t + k] + 1] >= YCUT)) idx.push(vOrig(g.idx[t]), vOrig(g.idx[t + 1]), vOrig(g.idx[t + 2]));
const nOrigT = idx.length, Y0 = YCUT + SOVRAPP;
// sezione dell'originale nella fascia [YCUT, Y0 + 0.03]: punti proiettati sul piano (x, z) e loro involucro convesso
const fascia = []; for (let i = 0; i < nv; i++) { const y = g.pos[3 * i + 1]; if (y >= YCUT - 0.02 && y <= Y0 + 0.03) fascia.push([g.pos[3 * i], g.pos[3 * i + 2]]); }
// interseca anche gli spigoli con il piano y = Y0 (la sezione esatta, più fitta dei soli vertici)
for (let t = 0; t < g.idx.length; t += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const A = P(g.idx[t + a]), B = P(g.idx[t + b]); if ((A[1] - Y0) * (B[1] - Y0) < 0) { const u = (A[1] - Y0) / (A[1] - B[1]); fascia.push([A[0] + (B[0] - A[0]) * u, A[2] + (B[2] - A[2]) * u]); } }
const hull = (() => { const pts = fascia.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); })();   // antiorario in (x, z)
const c0 = [(Math.min(...hull.map(p => p[0])) + Math.max(...hull.map(p => p[0]))) / 2, Y0, (Math.min(...hull.map(p => p[1])) + Math.max(...hull.map(p => p[1]))) / 2];
const ax0 = (Math.max(...hull.map(p => p[0])) - Math.min(...hull.map(p => p[0]))) / 2 * MANICOTTO, az0 = (Math.max(...hull.map(p => p[1])) - Math.min(...hull.map(p => p[1]))) / 2 * MANICOTTO;
log('taglio a y', YCUT, '; manicotto da y', Y0.toFixed(3), '; involucro', hull.length, 'punti; centro', c0.map(v => v.toFixed(3)).join(','), 'semiassi', ax0.toFixed(3), az0.toFixed(3));
// involucro ricampionato a NA punti per lunghezza d'arco, dal punto più radiale (x minima), leggermente allargato (MANICOTTO)
let L0 = hull.map(p => [(p[0] - c0[0]) * MANICOTTO, (p[1] - c0[2]) * MANICOTTO]);
{ let im = 0; for (let i = 1; i < L0.length; i++) if (L0[i][0] < L0[im][0]) im = i; L0 = [...L0.slice(im), ...L0.slice(0, im)]; }
const cum = [0]; for (let i = 1; i <= L0.length; i++) cum.push(cum[i - 1] + Math.hypot(L0[i % L0.length][0] - L0[i - 1][0], L0[i % L0.length][1] - L0[i - 1][1]));
const SEZ = Array.from({ length: NA }, (_, j) => { const d = cum[L0.length] * j / NA; let i = 0; while (cum[i + 1] < d) i++; const t = (d - cum[i]) / (cum[i + 1] - cum[i] || 1), a = L0[i], b = L0[(i + 1) % L0.length]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; });
let SEZL = SEZ.map(q => q.slice()); for (let it = 0; it < 4; it++) SEZL = SEZL.map((q, j) => { const a = SEZL[(j + NA - 1) % NA], b = SEZL[(j + 1) % NA]; return [0.5 * q[0] + 0.25 * (a[0] + b[0]), 0.5 * q[1] + 0.25 * (a[1] + b[1])]; });
// raggio dell'involucro (non allargato) lungo la direzione th attorno al centro, nel piano (x, z)
const HR = hull.map(p => [p[0] - c0[0], p[1] - c0[2]]);
const rHull = th => { const d = [Math.cos(th), Math.sin(th)]; let best = 0;
  for (let i = 0; i < HR.length; i++) { const a = HR[i], b = HR[(i + 1) % HR.length], e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-12) continue;
    const t = (a[0] * e[1] - a[1] * e[0]) / den, u = (a[0] * d[1] - a[1] * d[0]) / den; if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t); } return best; };
// raccordo della superficie originale: prossimalmente a Y0 si gonfia gradualmente fino all'involucro (che diventa la sezione del
// tratto nuovo, senza gradino); distalmente a Y0 resta nascosta dentro il tratto nuovo
for (const [i, v] of mapV) { const p = pos[v], dx = p[0] - c0[0], dz = p[2] - c0[2], r = Math.hypot(dx, dz); if (r < 1e-6) continue;
  const th = Math.atan2(dz, dx), rh = rHull(th) * MANICOTTO;
  let rn = r;
  if (p[1] >= Y0) { const w = sstep(Y0 + RACC_O, Y0, p[1]); if (rh > r) rn = r + (rh - r) * w; }
  else rn = Math.min(r, rh * 0.96);
  pos[v] = [c0[0] + dx / r * rn, p[1], c0[2] + dz / r * rn]; }
const ELL = (j, ax, az) => { const th = Math.PI + 2 * Math.PI * j / NA, ez = Math.sin(th); return [Math.cos(th) * ax, (ez < 0 ? ez * 0.85 : ez) * az]; };

/* 2) quota volare della superficie d'appoggio (ossa, cartilagine, placca volare) */
const ALTE = ['d_p3', 'd_p2', 'd_cart', 'vp_dip'].map(n => new Indice([M.get(n)], 0.1));
const quota = (x, y) => { for (let z = 0.9; z > -1.3; z -= 0.005) { const p = [x, y, z]; for (const S of ALTE) { const r = S.vicino(p, 0.02); if (r && (r.d < 0.003 || S.dentro(p))) return z; } } return -1.3; };

/* 3) linea d'asse: da c0 a YFIN; semiassi lisci; quota del centro ≥ superficie + gap + semiasse z (sotto l'intera larghezza) */
const ys = Array.from({ length: NR }, (_, k) => c0[1] + (YFIN - c0[1]) * k / (NR - 1));   // ys[0] = poco oltre il punto più distale del taglio
const sOf = y => clamp((c0[1] - y) / (c0[1] - YFIN), 0, 1), lisc = t => t * t * (3 - 2 * t);
const AX = ys.map(y => ax0 * (1 + (LARGH - 1) * lisc(sstep(0.15, 0.75, sOf(y)))) * (1 - 0.15 * Math.pow(sstep(0.8, 1, sOf(y)), 2))), AZ = ys.map(y => az0 * (1 - (1 - SPESS_FIN) * lisc(sstep(0.10, 0.80, sOf(y)))));
const XC = ys.map(() => c0[0]);
const INS = ys.map(y => sstep(0, 1, (YINS - y) / (YINS - YFIN)));   // 0 → 1 nell'inserzione
for (let k = 0; k < NR; k++) AZ[k] *= 1 - 0.8 * INS[k];   // spatola: lo spessore cala fino al 20%
let SUP = ys.map((y, k) => { let m = -9; for (let f = -1; f <= 1.001; f += 0.25) m = Math.max(m, quota(XC[k] + f * AX[k] * 0.9, y)); return m; });
// lisciatura della quota, tenuta tra 0,05 mm sotto e 0,2 mm sopra la superficie reale (il tendine resta aderente, dopo la placca scende sull'osso)
const SUP0 = SUP.slice();
for (let it = 0; it < 40; it++) { SUP = SUP.map((v, k) => k === 0 || k === NR - 1 ? v : 0.25 * SUP[k - 1] + 0.5 * v + 0.25 * SUP[k + 1]); SUP = SUP.map((v, k) => clamp(v, SUP0[k] - 0.005, SUP0[k] + 0.02)); }
// centro: parte da c0, raggiunge la superficie, nell'inserzione affonda nell'osso
// centro: parte da c0, raggiunge la superficie e la segue; nell'inserzione il tendine si assottiglia a spatola e si salda all'osso
let ZC = ys.map((y, k) => { const appoggio = SUP[k] + GAP + AZ[k], inizio = c0[2] + (appoggio - c0[2]) * lisc(sstep(0.0, 0.5, sOf(y)));
  return Math.max(inizio, appoggio) - Math.pow(INS[k], 1.5) * (GAP + 2 * AZ[k] + AFFONDA); });
// tetto: la puleggia A5 deve coprire il tendine (la faccia volare del tendine resta sotto la faccia esterna della A5)
const A5 = M.get('A5'), nA5 = A5.pos.length / 3;
const tetto = ys.map((y, k) => { let m = -9; for (let i = 0; i < nA5; i++) if (Math.abs(A5.pos[3 * i + 1] - y) < 0.03 && Math.abs(A5.pos[3 * i] - XC[k]) < AX[k] * 0.8) m = Math.max(m, A5.pos[3 * i + 2]); return m > -9 ? m - SOTTO_A5 : 9; });
let tt = tetto.slice(); for (let it = 0; it < 6; it++) tt = tt.map((v, k) => Math.min(v, k > 0 ? tt[k - 1] + 0.03 : v, k < NR - 1 ? tt[k + 1] + 0.03 : v)); // tetto senza salti
// sotto la A5 lo spazio tra puleggia e placca è stretto: il tendine si appiattisce (spessore = spazio disponibile, mai < SPESS_MIN)
{ const lim = ys.map((y, k) => Math.max(SPESS_MIN, (tt[k] - SUP[k] - GAP) / 2)); let az = AZ.map((v, k) => Math.min(v, lim[k]));
  for (let it = 0; it < 30; it++) az = az.map((v, k) => k === 0 || k === NR - 1 ? v : Math.min(0.25 * az[k - 1] + 0.5 * v + 0.25 * az[k + 1], lim[k], AZ[k]));
  for (let k = 0; k < NR; k++) AZ[k] = az[k];
  ZC = ys.map((y, k) => { const appoggio = SUP[k] + GAP + AZ[k], inizio = c0[2] + (appoggio - c0[2]) * lisc(sstep(0.0, 0.5, sOf(y))); return Math.max(inizio, appoggio) - Math.pow(INS[k], 1.5) * (GAP + 2 * AZ[k] + AFFONDA); }); }
ZC = ZC.map((z, k) => Math.min(z, tt[k] - AZ[k]));
ZC[0] = c0[2];
for (let it = 0; it < 12; it++) ZC = ZC.map((v, k) => k === 0 || k === NR - 1 ? v : Math.min(0.25 * ZC[k - 1] + 0.5 * v + 0.25 * ZC[k + 1], tt[k] - AZ[k]));

if (process.env.DEBUG) ys.forEach((y, k) => k % 3 === 0 && log(y.toFixed(2), "SUP", SUP[k].toFixed(3), "ZC", ZC[k].toFixed(3), "AZ", AZ[k].toFixed(3), "AX", AX[k].toFixed(3), "tetto", tt[k].toFixed(3), "INS", INS[k].toFixed(2)));
/* 4) anelli ellittici perpendicolari alla linea d'asse */
const C = ys.map((y, k) => [XC[k], y, ZC[k]]);
const base = pos.length;
for (let k = 0; k < NR; k++) {
  const T = unit(sub(C[Math.min(NR - 1, k + 1)], C[Math.max(0, k - 1)])), Xa = unit(cross([0, 0, 1], T)), Za = unit(cross(T, Xa));   // per T ≈ −y: Xa = +x, Za = +z (stesso riferimento della sezione)
  const f = Math.round(127 * 1), d = T.map(v => Math.round(v * f));
  const b = sstep(0, RACC, sOf(ys[k])), b2 = sstep(0.01, RACC * 0.6, sOf(ys[k])), sx = AX[k] / ax0, sz = AZ[k] / az0;
  for (let j = 0; j < NA; j++) { const e = ELL(j, AX[k], AZ[k]), r0 = [SEZ[j][0] * sx, SEZ[j][1] * sz], r1 = [SEZL[j][0] * sx, SEZL[j][1] * sz];
    const q0 = [r0[0] + (r1[0] - r0[0]) * b2, r0[1] + (r1[1] - r0[1]) * b2], q = [q0[0] + (e[0] - q0[0]) * b, q0[1] + (e[1] - q0[1]) * b];
    const fr = INIZIO + (1 - INIZIO) * sstep(0, ATTACCO, (c0[1] - ys[k]));   // il manicotto nasce dentro il tendine originale e ne esce tangente
    pos.push(add(C[k], add(mul(Xa, q[0] * fr), mul(Za, q[1] * fr)))); dir.push(...d); } }
// tappo distale (dentro l'osso)
const capC = pos.length; pos.push(C[NR - 1]); dir.push(0, 127, 0);
for (let k = 1; k < NR; k++) for (let j = 0; j < NA; j++) { const a = base + (k - 1) * NA + j, b = base + (k - 1) * NA + (j + 1) % NA, c = base + k * NA + j, d = base + k * NA + (j + 1) % NA; idx.push(a, c, b, b, c, d); }
for (let j = 0; j < NA; j++) idx.push(capC, base + (NR - 1) * NA + (j + 1) % NA, base + (NR - 1) * NA + j);

// orientamento rispetto alla parte originale: il volume con segno della mesh intera dev'essere massimo (stessa convenzione ovunque)
{ const vol = () => { let v = 0; for (let t = 0; t < idx.length; t += 3) v += dot(pos[idx[t]], cross(pos[idx[t + 1]], pos[idx[t + 2]])) / 6; return v; };
  const flip = () => { for (let t = nOrigT; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; } };
  const v1 = vol(); flip(); const v2 = vol(); if (v1 > v2) flip(); log('volume con segno', Math.max(v1, v2).toFixed(4), '(alternativa', Math.min(v1, v2).toFixed(4) + ')'); }

/* 6) controllo: nessun vertice del tratto nuovo (prima dell'inserzione) dentro ossa, cartilagine o placca */
const solidi = ['d_p3', 'd_p2', 'd_cart', 'vp_dip'].map(n => [n, new Indice([M.get(n)], 0.1)]);
for (const [n, S] of solidi) { let k = 0, mx = 0; for (let v = base; v < pos.length; v++) { if (pos[v][1] < YINS) continue; if (S.dentro(pos[v])) { k++; const r = S.vicino(pos[v], 0.3); mx = Math.max(mx, r ? r.d : 0); } }
  log('vertici del tratto nuovo (prossimali all\'inserzione) dentro', n, ':', k, k ? '(max ' + mx.toFixed(3) + ')' : ''); }
log('vertici:', pos.length, '(nuovi', pos.length - base, ')');
M.set('d_fdp', { pos: Float32Array.from(pos.flat()), idx: Uint32Array.from(idx), dir: Int8Array.from(dir), tag: null });
M.salva();
