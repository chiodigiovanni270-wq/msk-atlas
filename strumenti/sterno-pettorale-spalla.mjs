/* Grande pettorale, parte sternocostale (`pec_st`) della spalla (modelli/spalla-3d.html): riempimento della «tasca» tra muscolo e manubrio
   sotto l'articolazione sternoclavicolare. Il resto del muscolo, compreso il margine sfrangiato sul corpo dello sterno, resta quello di BodyParts3D.

   Problema. Sul manubrio il muscolo di BASE non arriva all'osso: resta sospeso sopra la faccia anteriore e il margine rientra di circa 1 cm
   verso le cartilagini costali, lasciando un buco tra muscolo e osso (il resto del margine sullo sterno ha un aspetto sfrangiato che va tenuto).

   Uso (dalla cartella del progetto):
     node strumenti/sterno-pettorale-spalla.mjs                → aggiunge a `pec_st` il riempimento della tasca (la mesh di BASE non cambia)
     PROVA=1 node strumenti/sterno-pettorale-spalla.mjs        → stampa i controlli senza scrivere
     MAPPA=/tmp/mappa.csv node strumenti/sterno-pettorale-spalla.mjs   → scrive anche la mappa 2D della regione riempita
     MODELLO=/tmp/copia.html node strumenti/sterno-pettorale-spalla.mjs   → lavora su una copia
   Ultimo della catena della spalla. Riparte da `pec_st` della revisione `BASE` (mesh, tag, direzioni delle fibre e normali), con le altre
   strutture del file come ostacoli, quindi si può rilanciare con lo stesso risultato.

   Metodo (mappa 2D (x, y) con passo `PASSO2`, raggi lungo −z).
   1. Faccia superficiale (zt) e profonda (zb) del primo tratto di muscolo di BASE; primo contatto (zr) con sterno, cartilagini e prima costa, e se
      è sterno. Superficie d'appoggio zc: chiusura in scala di grigi di zr (disco `R_CHIUSO`), levigata (`LEVIGA_Z`).
   2. Margine della tasca: sopra `Y_MAN` il margine mediale parte da quello di BASE poco sotto (media gaussiana `SIGMA_M`), piega dolcemente verso
      `X_TOP` e si chiude in alto a `Y_TOP` con un raccordo di raggio `R_ANGOLO`.
   3. Regione riempita (sopra `Y_MAN`, lateralmente fino a `ZONA_X`): dove il muscolo manca, tra la superficie d'appoggio e una faccia superficiale
      interpolata a membrana (Laplace, `ITER_TASCA` iterazioni) dal muscolo di BASE che la circonda fino al margine, con orlo arrotondato (`ORLO`,
      alto almeno `T_BORDO`); dove il muscolo di BASE è sospeso sopra lo sterno (più di `STACCO`), tra la superficie d'appoggio e la sua faccia profonda.
   4. Guscio: campo del riempimento meno il muscolo di BASE (vi entra di `SOVRAPP`, così i due si saldano senza fessura), fuori da ossa (`GAP_OSSO`)
      e strutture vicine (`GAP_MOLLI`); surface nets, pezzi piccoli tolti, riduzione a quadriche (`TRI_GUSCIO`), coppie Taubin con riproiezione fuori
      dagli ostacoli; tag e fibre dal triangolo di BASE più vicino. `pec_st` = mesh di BASE + guscio (seconda componente chiusa della stessa mesh).
   Controlli stampati: triangoli del guscio che si incrociano con ossa e strutture vicine, spigoli aperti, volume, distanza dall'osso della faccia
   profonda. */
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
const OSSA = ['manubrio', 'corpo_sterno', 'cc1', 'cc2', 'cc3', 'costa1', 'costa2', 'clavicola'];
const MOLLI = ['pec_cl', 'sc_leg', 'succl', 'pmin', 'omoi', 'a_succ', 'v_succ', 'plesso'];
const BOX = [[12.6, -5.0, 5.5], [17.0, 2.6, 15.0]];                       // cm: riquadro della griglia
const PASSO = 0.03, PASSO2 = 0.05, R_CHIUSO = 0.8, LEVIGA_Z = 0.2;         // cm
const Y_LIM = [-4.6, 2.0];                                                 // cm: righe della mappa considerate
const SIGMA_M = 0.9, Y_MAN = -2.0, X_TOP = 15.0, Y_TOP = 0.7, R_ANGOLO = 0.7;   // margine della tasca (cm)
const ZONA_X = 13.25, ORLO = 0.3, T_BORDO = 0.12, ITER_TASCA = 3000, STACCO = 0.08, RACCORDO = 0.05;   // cm
const GAP_OSSO = 0.03, GAP_MOLLI = 0.04, SOTTO = 0.03, SOVRAPP = 0.02;
const PEZZO_MIN = 50, TRI_GUSCIO = 3000, TAUBIN = 8;

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

/* ---- 4. riempimento della tasca (sopra Y_MAN): dove il muscolo manca, tra la superficie d'appoggio e una faccia superficiale interpolata a
   membrana (Laplace, ITER_TASCA) dal muscolo di BASE che la circonda fino al margine nuovo; dove il muscolo di BASE è sospeso sopra lo sterno,
   tra la superficie d'appoggio e la sua faccia profonda. Il muscolo di BASE resta com'è (anche il margine sfrangiato del corpo dello sterno). ---- */
const c = m => !Number.isNaN(zt[m]), alto = m => my((m / MX) | 0) > Y_MAN && mx(m % MX) > ZONA_X;
const buco = Uint8Array.from(zt, (z, m) => !c(m) && sd2[m] > 0 && alto(m) ? 1 : 0);
const sotto = Uint8Array.from(zt, (z, m) => c(m) && st[m] && sd2[m] > 0 && alto(m) && zb[m] - zc[m] > STACCO ? 1 : 0);
const Z = Float32Array.from(zc, (z, m) => c(m) ? zt[m] : z);
for (let it = 0; it < ITER_TASCA; it++) for (let m = 0; m < NM; m++) { if (!buco[m]) continue; const i = m % MX, j = (m / MX) | 0; let s = 0, n = 0;
  for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) { if (a < 0 || b < 0 || a >= MX || b >= MY) continue; const q = a + MX * b; s += sd2[q] > 0 ? Z[q] : zc[q]; n++; } Z[m] = s / n; }
const reg = Float32Array.from(buco, (v, m) => v || sotto[m] ? 1 : 0);
const bot = new Float32Array(NM), th = new Float32Array(NM);   // faccia profonda e spessore del riempimento (arrotondato entro ORLO dal margine, alto almeno T_BORDO)
for (let m = 0; m < NM; m++) { bot[m] = zr[m] > BOX[0][2] + 0.2 ? Math.max(zc[m], zr[m] + GAP_OSSO) : zc[m]; if (!reg[m]) continue;
  const top = buco[m] ? Math.max(Z[m], bot[m] + T_BORDO) : zb[m] + RACCORDO, e = clamp(sd2[m] / ORLO, 0, 1);
  th[m] = buco[m] ? T_BORDO + (top - bot[m] - T_BORDO) * Math.sqrt(1 - (1 - e) * (1 - e)) : top - bot[m]; }
{ const r = Math.round(0.08 / PASSO2); const b1 = Float32Array.from(bot); for (let m = 0; m < NM; m++) if (reg[m]) { let s = 0, n = 0; const i = m % MX, j = (m / MX) | 0;   // levigatura leggera dentro la regione
    for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const q = (i + a) + MX * (j + b); if (i + a >= 0 && j + b >= 0 && i + a < MX && j + b < MY && reg[q]) { s += b1[q]; n++; } } bot[m] = Math.max(s / n, zr[m] + GAP_OSSO); } }
log('tasca: pixel riempiti', buco.reduce((a, v) => a + v, 0), ', sotto il muscolo sospeso', sotto.reduce((a, v) => a + v, 0), '(area', (reg.reduce((a, v) => a + v, 0) * PASSO2 * PASSO2).toFixed(2), 'cm²)');
if (process.env.MAPPA) { const r = ['x,y,reg,buco,sotto,th,sd2']; for (let m = 0; m < NM; m++) r.push([mx(m % MX).toFixed(3), my((m / MX) | 0).toFixed(3), reg[m], buco[m], sotto[m], th[m].toFixed(3), sd2[m].toFixed(3)].join(','));
  writeFileSync(process.env.MAPPA, r.join('\n')); log('mappe scritte'); }
if (process.env.SOLO_MAPPA) process.exit(0);

/* ---- 5. guscio ---- */
const L2 = (F, x, y) => { const fx = clamp((x - BOX[0][0]) / PASSO2 - 0.5, 0, MX - 1.001), fy = clamp((y - BOX[0][1]) / PASSO2 - 0.5, 0, MY - 1.001), i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, a = i + MX * j;
  return (1 - v) * ((1 - u) * F[a] + u * F[a + 1]) + v * ((1 - u) * F[a + MX] + u * F[a + MX + 1]); };
const V = new Float32Array(N).fill(1);
for (let i = 0; i < N; i++) { const p = vox(i); if (L2(reg, p[0], p[1]) <= 0) continue; const b = L2(bot, p[0], p[1]);
  const f = Math.max(b - SOTTO - p[2], p[2] - b - L2(th, p[0], p[1]), -L2(sd2, p[0], p[1]), (0.5 - L2(reg, p[0], p[1])) * PASSO2);
  V[i] = Math.max(f, -S[i] - SOVRAPP, GAP_OSSO - Sb[i], GAP_MOLLI - Sm[i]); }
let gu = nets(V, () => [1, 0, 0]);
{ // pezzi staccati
  const nv = gu.pos.length / 3, par = Int32Array.from({ length: nv }, (_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < gu.idx.length; t += 3) { const a = f(gu.idx[t]); par[f(gu.idx[t + 1])] = a; par[f(gu.idx[t + 2])] = a; }
  const cnt = new Map(); for (let t = 0; t < gu.idx.length; t += 3) { const r = f(gu.idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const I = []; for (let t = 0; t < gu.idx.length; t += 3) if (cnt.get(f(gu.idx[t])) >= PEZZO_MIN) I.push(gu.idx[t], gu.idx[t + 1], gu.idx[t + 2]);
  const r = B.riduci(Float64Array.from(gu.pos), Uint32Array.from(I), TRI_GUSCIO, new Uint8Array(gu.pos.length / 3)), c = B.compatta(r.pos, r.idx);
  log('guscio: pezzi', cnt.size, ', triangoli in pezzi piccoli tolti', gu.idx.length / 3 - I.length / 3, ', ridotto a', c.idx.length / 3, 'triangoli'); gu = { pos: Array.from(c.pos), idx: Array.from(c.idx) }; }
const pos = gu.pos, idx = gu.idx, nG = pos.length / 3, pt = v => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
{ // orientamento verso l'esterno (volume positivo)
  let vol = 0; for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [pt(idx[t]), pt(idx[t + 1]), pt(idx[t + 2])]; vol += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; } }
const dentro2 = p => p.every((x, k) => x > BOX[0][k] + 0.05 && x < BOX[1][k] - 0.05);
{ // levigatura con riproiezione fuori da ossa e strutture vicine
  const adj = Array.from({ length: nG }, () => new Set()); for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; adj[a].add(b); adj[b].add(a); }
  for (let pass = 0; pass < TAUBIN; pass++) { for (const lambda of [0.45, -0.47]) { const prev = Float64Array.from(pos);
      for (let i = 0; i < nG; i++) for (let k = 0; k < 3; k++) { let sm = 0; for (const j of adj[i]) sm += prev[3 * j + k]; pos[3 * i + k] = prev[3 * i + k] + lambda * (sm / adj[i].size - prev[3 * i + k]); } }
    for (let i = 0; i < nG; i++) for (const [F, gap] of [[Sb, GAP_OSSO], [Sm, GAP_MOLLI]]) { const p = pt(i); if (!dentro2(p)) continue; const d = sample(F, ...p); if (d >= gap) continue;
      const n = grad(F, p), l = Math.hypot(...n); if (l > 1e-8) for (let k = 0; k < 3; k++) pos[3 * i + k] += n[k] * Math.min(PASSO, gap - d) / l; } }
  log('guscio levigato:', TAUBIN, 'coppie Taubin'); }

/* ---- 6. attributi e normali del guscio; pec_st = BASE + guscio ---- */
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
const tagG = new Uint8Array(nG), fdG = new Int8Array(nG * 3), nrG = new Int8Array(nG * 3);
for (let i = 0; i < nG; i++) { const b = piuVicino(pt(i)); if (!b) continue; const T3 = [P0.idx[b.t], P0.idx[b.t + 1], P0.idx[b.t + 2]];
  tagG[i] = Math.round(b.w[0] * P0.tag[T3[0]] + b.w[1] * P0.tag[T3[1]] + b.w[2] * P0.tag[T3[2]]);
  const d = [0, 1, 2].map(k => b.w[0] * P0.fdir[3 * T3[0] + k] + b.w[1] * P0.fdir[3 * T3[1] + k] + b.w[2] * P0.fdir[3 * T3[2] + k]), l = Math.hypot(...d) || 1; for (let k = 0; k < 3; k++) fdG[3 * i + k] = Math.round(127 * d[k] / l); }
{ const nn = new Float64Array(nG * 3); for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]], u = sub(pt(b), pt(a)), w = sub(pt(c), pt(a)), f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nn[3 * v + k] += f[k]; }
  for (let i = 0; i < nG; i++) { const l = Math.hypot(nn[3 * i], nn[3 * i + 1], nn[3 * i + 2]) || 1; for (let k = 0; k < 3; k++) nrG[3 * i + k] = Math.round(127 * nn[3 * i + k] / l); } }
const nB = P0.nv, R = { pos: new Float32Array((nB + nG) * 3), idx: new Uint32Array(P0.idx.length + idx.length), tag: new Uint8Array(nB + nG), fdir: new Int8Array((nB + nG) * 3), nrm: new Int8Array((nB + nG) * 3) };
R.pos.set(P0.pos); R.pos.set(pos, nB * 3); R.idx.set(P0.idx); R.idx.set(idx.map(v => v + nB), P0.idx.length); R.tag.set(P0.tag); R.tag.set(tagG, nB);
R.fdir.set(P0.fdir); R.fdir.set(fdG, nB * 3); R.nrm.set(Int8Array.from(P0.nrm, x => Math.round(x * 127))); R.nrm.set(nrG, nB * 3);
log(NOME, ': BASE', nB, 'vertici +', 'guscio', nG, 'vertici,', idx.length / 3, 'triangoli');

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
log('guscio, triangoli che si incrociano:', [...OSSA, ...MOLLI].map(o => { const Q = REAL(o), n = incroci(pos, idx, Q.pos, Q.idx); return n ? `${o} ${n}` : null; }).filter(Boolean).join(', ') || 'nessuno');
{ const ec = new Map(); for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3], q = a < b ? a + ',' + b : b + ',' + a; ec.set(q, (ec.get(q) || 0) + 1); }
  let aperti = 0, multipli = 0; for (const c of ec.values()) { if (c === 1) aperti++; else if (c > 2) multipli++; }
  let vol = 0; for (let t = 0; t < idx.length; t += 3) { const a = pt(idx[t]), b = pt(idx[t + 1]), c = pt(idx[t + 2]); vol += dt(a, [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]) / 6; }
  log('guscio: spigoli di bordo', aperti, ', spigoli in più di due triangoli', multipli, ', volume', (vol * 1000).toFixed(0), 'mm³'); }
{ const d = []; for (let i = 0; i < nG; i++) { const p = pt(i); if (dentro2(p)) { const s = sample(Ssup, ...p); if (s < 0.2) d.push(s); } } d.sort((a, b) => a - b);
  log('guscio, vertici entro 2 mm da sterno e cartilagini:', d.length, d.length ? `minimo ${(d[0] * 10).toFixed(2)} mm, mediana ${(d[d.length >> 1] * 10).toFixed(2)} mm` : ''); }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { G.setMesh(NOME, R); saveFile(repack()); }
