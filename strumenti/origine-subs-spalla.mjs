/* Origine del sottoscapolare (`subs`) dalla fossa sottoscapolare della spalla (modelli/spalla-3d.html): margine mediale del ventre (dove la lamina
   muscolare finisce sulla faccia costale della scapola) senza schegge, punte e incisure. Prima il margine aveva una tacca a uncino (incisura di ~3 mm
   chiusa in alto da una punta sottile rivolta in basso), un ciuffo di triangoli ripiegati a metà altezza e piccole punte lungo tutto il profilo.

   Uso (dalla cartella del progetto):
     node strumenti/origine-subs-spalla.mjs                  → riscrive `subs` nel file del modello
     PROVA=1 node strumenti/origine-subs-spalla.mjs          → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/origine-subs-spalla.mjs   → lavora su una copia
     DEBUG_SAGOMA=/tmp/sagoma.ppm …                          → salva anche le due sagome (rosso prima, verde dopo, giallo entrambe)
   Va lanciato dopo `trapezio-acromion-spalla.mjs` e prima di `sezioni-spalla.mjs` (che non tocca `subs`). Riparte dalla mesh di `subs` (posizioni,
   triangoli, tag, fibre, normali) della revisione `BASE`, quindi si può rilanciare con lo stesso risultato. Se si rilanciano `muscoli-spalla.mjs` o
   `rifinitura-subs-spalla.mjs` e cambia `subs`, aggiornare `BASE`.

   Metodo. Vista `VISTA` (theta, phi come la camera della pagina) = normale media della faccia costale vicino al margine mediale: u verso il margine
   mediale, v verso l'alto, w verso la camera. Si lavora solo dove u > `U_REG` (metà mediale della fossa: il tendine e il resto del ventre non si muovono).
   0. Nodi: dove la lamina è accartocciata (lati condivisi da più di due triangoli: il ciuffo a metà margine, la punta dell'uncino), con
      `ANELLI_NODO` anelli di vicini, levigatura (`GIRI_NODI`) nelle coordinate (u, v, distanza dalla scapola) con il contorno dei nodi fermo.
   1. Sagoma: i triangoli di `subs` proiettati sulla vista e rasterizzati (pixel `PX`); sagoma regolare = apertura morfologica di raggio `R_AP` (via le
      punte), chiusura di raggio `R_CH` (la tacca a uncino diventa una concavità dolce), sfocatura gaussiana `SIGMA` e soglia 0,5 (profilo liscio); a sinistra di `U_REG`
      resta la sagoma di prima (raccordo su `RACC`). Distanze con segno 2D dalle due sagome.
   2. Flusso: a ogni giro (`GIRI_FLUSSO`, sagoma ricalcolata) i vertici di bordo (entro `BORDO` dalla sagoma) e quelli fuori dal profilo nuovo
      puntano al profilo nuovo lungo il gradiente della distanza (frazione crescente del tragitto, tutto all'ultimo giro); ogni vertice della regione
      si sposta della media gaussiana (`SIG_CAMPO`) di quei vettori, pieno sul bordo e nullo a `BANDA` dentro la sagoma. È un campo continuo nella
      vista: le due facce della lamina, che nella vista coincidono, si muovono insieme e non si incrociano (lo spostamento vertice per vertice le
      incrociava sul bordo).
   3. Aderenza: ogni vertice spostato riprende lungo w la stessa distanza con segno dalla scapola che aveva prima (almeno `GAP`), quindi la lamina resta
      appoggiata all'osso con lo stesso spessore e non entra nella scapola.
   Normali di vertice (`nm`) ricalcolate sui vertici spostati e sui vicini. Controlli stampati: vertici spostati, spostamento massimo, distanza
   minima dalla scapola, autointersezioni di `subs` nella regione, vertici fuori dal profilo regolare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { vicini } = await import('./lib-bp3d.mjs');
const { REAL, realDaRevisione, setMesh, saveFile, repack, log, sstep, dt1, reManRe, reDatRe } = G;

const BASE = '5aacd43', NOME = 'subs';
const VISTA = [0.47, -0.22];                                   // theta, phi (rad)
const U_REG = 9.0, RACC = 0.3;                                 // cm (coordinata u della vista)
const PX = 0.005, R_AP = 0.08, R_CH = 3.0, SIGMA = 0.1;        // cm
const BORDO = 0.03, BANDA = 0.5, SIG_CAMPO = 0.04, GIRI_FLUSSO = 12, GAP = 0.02;   // cm
const ANELLI_NODO = 3, GIRI_NODI = 40;   // anelli di vicini attorno ai nodi; passate di levigatura

// mesh di partenza dalla revisione BASE (con le normali scritte)
const A0 = realDaRevisione(BASE, NOME, 'modelli/spalla-3d.html');
const nrm = (() => { const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const h = execFileSync('git', ['show', `${BASE}:modelli/spalla-3d.html`], { cwd: root, maxBuffer: 1 << 30 }).toString('utf8');
  const mn = JSON.parse(h.match(reManRe)[2]), m = mn.meshes.findLast(x => x.n === NOME);
  const b = Buffer.from(h.match(reDatRe)[2].trim(), 'base64'), buf = G.GZIP ? gunzipSync(b) : b;
  return m.nm !== undefined ? Int8Array.from(new Int8Array(buf.buffer, buf.byteOffset + m.nm, m.nv * 3)) : null; })();
const idx = A0.idx, nv = A0.pos.length / 3, pos0 = Float64Array.from(A0.pos), cur = pos0.slice();
const nb = vicini(nv, idx);

// vista
const [th, ph] = VISTA, W = [Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)];
const Uv = (() => { const r = [W[2], 0, -W[0]], l = Math.hypot(...r); return r.map(x => x / l); })();
const Vv = [W[1] * Uv[2] - W[2] * Uv[1], W[2] * Uv[0] - W[0] * Uv[2], W[0] * Uv[1] - W[1] * Uv[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const uvw = (P, i) => { const p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]]; return [dot(p, Uv), dot(p, Vv), dot(p, W)]; };
const daUvw = (u, v, w) => [0, 1, 2].map(k => u * Uv[k] + v * Vv[k] + w * W[k]);

// distanza con segno dalla scapola (punto più vicino sui triangoli, griglia hash)
const distScapola = (() => { const S = REAL('scapola'), P = S.pos, I = S.idx, cell = 0.3, g = new Map(), key = (i, j, k) => i + ',' + j + ',' + k;
  const V = i => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  for (let t = 0; t < I.length; t += 3) { const a = V(I[t]), b = V(I[t + 1]), c = V(I[t + 2]);
    const lo = [0, 1, 2].map(k => Math.floor(Math.min(a[k], b[k], c[k]) / cell)), hi = [0, 1, 2].map(k => Math.floor(Math.max(a[k], b[k], c[k]) / cell));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const kk = key(i, j, k); let l = g.get(kk); if (!l) g.set(kk, l = []); l.push(t); } }
  const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  function vicino(p, a, b, c) {   // Ericson, Real-Time Collision Detection 5.1.5
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]; }
  return p => { let best = 1e9, bq = null, bt = -1; const c = p.map(x => Math.floor(x / cell));
    for (let r = 0; r <= 6; r++) { for (let i = c[0] - r; i <= c[0] + r; i++) for (let j = c[1] - r; j <= c[1] + r; j++) for (let k = c[2] - r; k <= c[2] + r; k++) {
        if (Math.max(Math.abs(i - c[0]), Math.abs(j - c[1]), Math.abs(k - c[2])) !== r) continue; const l = g.get(key(i, j, k)); if (!l) continue;
        for (const t of l) { const q = vicino(p, V(I[t]), V(I[t + 1]), V(I[t + 2])), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < best) { best = d; bq = q; bt = t; } } }
      if (best < r * cell) break; }
    if (bt < 0) return 1e9;
    const a = V(I[bt]), b = V(I[bt + 1]), cc = V(I[bt + 2]), ab = sub(b, a), ac = sub(cc, a), n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    return dot(sub(p, bq), n) >= 0 ? best : -best; }; })();

// 0. nodi: dove la lamina è accartocciata (lati condivisi da più di due triangoli) i vertici, con `ANELLI_NODO` anelli di vicini, sono levigati
//    nelle coordinate (u, v, distanza dalla scapola): la lamina vi è quasi piatta, quindi le pieghe si distendono; il contorno dei nodi resta
//    fermo; poi ogni vertice torna lungo w alla distanza levigata dalla scapola. Il margine che rientra un poco è rimesso a posto dai passi 1-3.
const distP = (P, i) => distScapola([P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
{ const E = new Map(), seme = new Set();
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3], k = a < b ? a * nv + b : b * nv + a; E.set(k, (E.get(k) || 0) + 1); }
  for (const [k, c] of E) if (c > 2) for (const i of [Math.floor(k / nv), k % nv]) if (uvw(pos0, i)[0] > U_REG - RACC) seme.add(i);
  let nodo = new Set(seme); for (let r = 0; r < ANELLI_NODO; r++) { const n2 = new Set(nodo); for (const i of nodo) for (const j of nb[i]) n2.add(j); nodo = n2; }
  const L = [...nodo], Q = new Map(), fisso = new Map(), q0 = i => { const p = uvw(pos0, i); return [p[0], p[1], distP(pos0, i)]; };
  for (const i of L) Q.set(i, q0(i)); for (const i of L) for (const j of nb[i]) if (!nodo.has(j) && !fisso.has(j)) fisso.set(j, q0(j));
  for (let g = 0; g < GIRI_NODI; g++) { const nuovo = [];
    for (const i of L) { if (!nb[i].length) continue; const s = [0, 0, 0]; for (const j of nb[i]) { const q = Q.get(j) || fisso.get(j); for (let k = 0; k < 3; k++) s[k] += q[k]; } nuovo.push([i, s.map(x => x / nb[i].length)]); }
    for (const [i, q] of nuovo) Q.set(i, q); }
  for (const i of L) { const q = Q.get(i), s0 = Math.max(GAP, q[2]); let w = uvw(pos0, i)[2];
    for (let it = 0; it < 8; it++) { const s = distScapola(daUvw(q[0], q[1], w)); if (Math.abs(s - s0) < 1e-4) break; w -= s - s0; }
    const p = daUvw(q[0], q[1], w); for (let k = 0; k < 3; k++) cur[3 * i + k] = p[k]; }
  log('nodi: vertici su lati con più di due triangoli', seme.size, ', levigati', L.length); }
const ini = cur.slice();   // punto di partenza dei passi 1-3

// 1. sagome sulla vista
const UVW0 = Array.from({ length: nv }, (_, i) => uvw(ini, i));
let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
for (const [u, v] of UVW0) if (u > U_REG - 1) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
u0 = U_REG - 1.5; u1 += R_CH + 0.5; v0 -= R_CH + 0.5; v1 += R_CH + 0.5;   // margine oltre R_CH: la chiusura non risente del bordo della griglia
const NXp = Math.ceil((u1 - u0) / PX), NYp = Math.ceil((v1 - v0) / PX), NP = NXp * NYp;
const pu = i => u0 + (i + 0.5) * PX, pv = j => v0 + (j + 0.5) * PX;
function rasterizza(Q) {   // sagoma dei triangoli proiettati (Q[i] = [u, v])
  const M = new Uint8Array(NP);
  for (let t = 0; t < idx.length; t += 3) { const [A, B, C] = [idx[t], idx[t + 1], idx[t + 2]].map(i => Q[i]);
    const lo = [Math.min(A[0], B[0], C[0]), Math.min(A[1], B[1], C[1])], hi = [Math.max(A[0], B[0], C[0]), Math.max(A[1], B[1], C[1])]; if (hi[0] < u0 || hi[1] < v0 || lo[1] > v1) continue;
    const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(den) < 1e-12) continue;
    for (let j = Math.max(0, Math.floor((lo[1] - v0) / PX)); j <= Math.min(NYp - 1, Math.ceil((hi[1] - v0) / PX)); j++) for (let i = Math.max(0, Math.floor((lo[0] - u0) / PX)); i <= Math.min(NXp - 1, Math.ceil((hi[0] - u0) / PX)); i++) {
      const x = pu(i), y = pv(j), a = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / den, b = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / den;
      if (a >= -1e-9 && b >= -1e-9 && a + b <= 1 + 1e-9) M[i + NXp * j] = 1; } }
  return M; }
const Msk = rasterizza(UVW0);
function edt2(M, inv = false) {   // distanza (cm) di ogni pixel dal pixel più vicino con M (o senza, inv)
  const D = new Float64Array(NP); for (let i = 0; i < NP; i++) D[i] = (inv ? !M[i] : M[i]) ? 0 : 1e10;
  const mx = Math.max(NXp, NYp), f = new Float64Array(mx), d = new Float64Array(mx), v = new Int32Array(mx), z = new Float64Array(mx + 1);
  for (let j = 0; j < NYp; j++) { for (let i = 0; i < NXp; i++) f[i] = D[i + NXp * j]; dt1(f, NXp, d, v, z); for (let i = 0; i < NXp; i++) D[i + NXp * j] = d[i]; }
  for (let i = 0; i < NXp; i++) { for (let j = 0; j < NYp; j++) f[j] = D[i + NXp * j]; dt1(f, NYp, d, v, z); for (let j = 0; j < NYp; j++) D[i + NXp * j] = d[j]; }
  for (let i = 0; i < NP; i++) D[i] = Math.sqrt(D[i]) * PX; return D; }
const soglia = (D, r, fuori) => { const M = new Uint8Array(NP); for (let i = 0; i < NP; i++) M[i] = fuori ? (D[i] > r ? 1 : 0) : (D[i] <= r ? 1 : 0); return M; };
const erodi = (M, r) => soglia(edt2(M, true), r, true), dilata = (M, r) => soglia(edt2(M), r, false);
let T = dilata(erodi(Msk, R_AP), R_AP); T = erodi(dilata(T, R_CH), R_CH);
const Fl = (() => { const k = Math.ceil(3 * SIGMA / PX), g = Array.from({ length: 2 * k + 1 }, (_, q) => Math.exp(-0.5 * ((q - k) * PX / SIGMA) ** 2)), sg = g.reduce((a, b) => a + b);
  const A = Float64Array.from(T), B = new Float64Array(NP);
  for (let j = 0; j < NYp; j++) for (let i = 0; i < NXp; i++) { let s = 0; for (let q = -k; q <= k; q++) { const ii = Math.min(NXp - 1, Math.max(0, i + q)); s += g[q + k] * A[ii + NXp * j]; } B[i + NXp * j] = s / sg; }
  for (let i = 0; i < NXp; i++) for (let j = 0; j < NYp; j++) { let s = 0; for (let q = -k; q <= k; q++) { const jj = Math.min(NYp - 1, Math.max(0, j + q)); s += g[q + k] * B[i + NXp * jj]; } A[i + NXp * j] = s / sg; }
  return A; })();
const Tg = new Uint8Array(NP);
for (let j = 0; j < NYp; j++) for (let i = 0; i < NXp; i++) { const w = sstep(U_REG - RACC, U_REG, pu(i)), q = i + NXp * j; Tg[q] = (1 - w) * Msk[q] + w * Fl[q] >= 0.5 ? 1 : 0; }
const sdf2 = M => { const a = edt2(M), b = edt2(M, true), D = new Float64Array(NP); for (let i = 0; i < NP; i++) D[i] = a[i] > 0 ? a[i] - PX / 2 : -(b[i] - PX / 2); return D; };
const Dc = sdf2(Msk), Dt = sdf2(Tg);
const camp = (D, u, v) => { let x = (u - u0) / PX - 0.5, y = (v - v0) / PX - 0.5; x = Math.min(NXp - 1.001, Math.max(0, x)); y = Math.min(NYp - 1.001, Math.max(0, y));
  const i = x | 0, j = y | 0, a = x - i, b = y - j, q = i + NXp * j; return (D[q] * (1 - a) + D[q + 1] * a) * (1 - b) + (D[q + NXp] * (1 - a) + D[q + NXp + 1] * a) * b; };
const sulProfilo = (u, v, liv = 0) => { for (let it = 0; it < 6; it++) { const d = camp(Dt, u, v) - liv, e = PX, gx = (camp(Dt, u + e, v) - camp(Dt, u - e, v)) / (2 * e), gy = (camp(Dt, u, v + e) - camp(Dt, u, v - e)) / (2 * e), l = Math.hypot(gx, gy) || 1;
  u -= d * gx / l; v -= d * gy / l; } return [u, v]; };
{ let piu = 0, meno = 0; for (let j = 0; j < NYp; j++) for (let i = 0; i < NXp; i++) { const q = i + NXp * j; if (Tg[q] && !Msk[q]) piu++; if (!Tg[q] && Msk[q]) meno++; }
  log('sagoma: aggiunti', (piu * PX * PX * 100).toFixed(1), 'mm², tolti', (meno * PX * PX * 100).toFixed(1), 'mm²'); }

if (process.env.DEBUG_SAGOMA) { const b = Buffer.alloc(NP * 3); for (let j = 0; j < NYp; j++) for (let i = 0; i < NXp; i++) { const q = i + NXp * j, o = 3 * (i + NXp * (NYp - 1 - j)); b[o] = Msk[q] ? 200 : 0; b[o + 1] = Tg[q] ? 200 : 0; b[o + 2] = pu(i) > U_REG ? 60 : 0; }
  (await import('node:fs')).writeFileSync(process.env.DEBUG_SAGOMA, Buffer.concat([Buffer.from(`P6 ${NXp} ${NYp} 255\n`), b])); }
// 2. flusso con un campo di spostamento 2D: a ogni giro i vertici di bordo (entro `BORDO` dalla sagoma attuale) e quelli fuori
//    dal profilo nuovo puntano al profilo nuovo (una frazione
//    crescente del tragitto, tutto all'ultimo giro); lo spostamento di ogni vertice della regione è la media gaussiana (`SIG_CAMPO`) di quelli dei
//    vertici di bordo vicini, pieno sul bordo e nullo a `BANDA` dentro la sagoma. Lo stesso campo muove nello stesso modo le due facce della lamina
//    (stessa posizione nella vista), quindi non si incrociano; `GIRI_FLUSSO` giri, ognuno con la sagoma ricalcolata.
const peso = i => sstep(U_REG - RACC, U_REG, UVW0[i][0]);
const UV = UVW0.map(p => [p[0], p[1]]), reg = [];
for (let i = 0; i < nv; i++) if (UVW0[i][0] > U_REG - RACC - 3 * SIG_CAMPO) reg.push(i);
let nBordo = 0;
for (let g = 0; g < GIRI_FLUSSO; g++) { const D = sdf2(rasterizza(UV)), passo = 1 / (GIRI_FLUSSO - g), cella = 3 * SIG_CAMPO, H2 = new Map(), d = new Map();
  for (const i of reg) { if (camp(D, ...UV[i]) <= -BORDO && camp(Dt, ...UV[i]) <= 0) continue; const t = sulProfilo(...UV[i]), w = peso(i) * passo; d.set(i, [w * (t[0] - UV[i][0]), w * (t[1] - UV[i][1])]);
    const k = Math.floor(UV[i][0] / cella) + ',' + Math.floor(UV[i][1] / cella); let l = H2.get(k); if (!l) H2.set(k, l = []); l.push(i); }
  if (g === 0) nBordo = d.size;
  const nuovo = [];
  for (const j of reg) { const f = camp(Dt, ...UV[j]) > 0 ? 1 : sstep(-BANDA, -BORDO, camp(D, ...UV[j])); if (f <= 0) continue; let sx = 0, sy = 0, sw = 0; const cu = Math.floor(UV[j][0] / cella), cv = Math.floor(UV[j][1] / cella);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = H2.get((cu + a) + ',' + (cv + b)); if (!l) continue;
      for (const i of l) { const r2 = (UV[i][0] - UV[j][0]) ** 2 + (UV[i][1] - UV[j][1]) ** 2, w = Math.exp(-0.5 * r2 / SIG_CAMPO ** 2), q = d.get(i); sx += w * q[0]; sy += w * q[1]; sw += w; } }
    if (sw > 1e-9) nuovo.push([j, [UV[j][0] + f * sx / sw, UV[j][1] + f * sy / sw]]); }
  for (const [j, p] of nuovo) UV[j] = p; }
const zona = []; for (let i = 0; i < nv; i++) if (Math.hypot(UV[i][0] - UVW0[i][0], UV[i][1] - UVW0[i][1]) > 2e-4) zona.push(i);

// 3. aderenza: stessa distanza con segno dalla scapola, lungo w
let dMin0 = 1e9, dMin = 1e9, spMax = 0;
for (const i of zona) { const p0 = [ini[3 * i], ini[3 * i + 1], ini[3 * i + 2]], s0 = Math.max(GAP, distScapola(p0)); let w = UVW0[i][2];
  dMin0 = Math.min(dMin0, distScapola(p0));
  for (let it = 0; it < 8; it++) { const s = distScapola(daUvw(UV[i][0], UV[i][1], w)); if (Math.abs(s - s0) < 1e-4) break; w -= s - s0; }
  const p = daUvw(UV[i][0], UV[i][1], w); for (let k = 0; k < 3; k++) cur[3 * i + k] = p[k];
  dMin = Math.min(dMin, distScapola(p)); spMax = Math.max(spMax, Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2])); }
log('vertici spostati', zona.length, '(bordo', nBordo + '), spostamento massimo', (spMax * 10).toFixed(2), 'mm');
log('distanza minima dalla scapola dei vertici spostati: dopo i nodi', (dMin0 * 10).toFixed(2), 'mm, dopo', (dMin * 10).toFixed(2), 'mm');

// controlli: autointersezioni di `subs` nella regione (triangoli senza vertici comuni che si attraversano),
// vertici fuori dal profilo regolare
const nTri = (P, t) => { const a = [0, 1, 2].map(k => P[3 * idx[t + 1] + k] - P[3 * idx[t] + k]), b = [0, 1, 2].map(k => P[3 * idx[t + 2] + k] - P[3 * idx[t] + k]); return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
function autointersezioni(P) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const seg = (p, q, a, b, c) => { const d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cr(d, e2), det = dot(e1, h); if (Math.abs(det) < 1e-14) return false; const f = 1 / det, s = sub(p, a), u = f * dot(s, h);
    if (u < 0 || u > 1) return false; const qq = cr(s, e1), v = f * dot(d, qq); if (v < 0 || u + v > 1) return false; const t = f * dot(e2, qq); return t > 1e-6 && t < 1 - 1e-6; };
  const V = i => [P[3 * i], P[3 * i + 1], P[3 * i + 2]], cell = 0.1, g = new Map();
  for (let t = 0; t < idx.length; t += 3) { if (![0, 1, 2].some(k => uvw(P, idx[t + k])[0] > U_REG - RACC)) continue; const T = [0, 1, 2].map(k => V(idx[t + k]));
    const lo = [0, 1, 2].map(k => Math.floor(Math.min(...T.map(x => x[k])) / cell)), hi = [0, 1, 2].map(k => Math.floor(Math.max(...T.map(x => x[k])) / cell));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const kk = i + ',' + j + ',' + k; let l = g.get(kk); if (!l) g.set(kk, l = []); l.push(t); } }
  const viste = new Set(); let n = 0;
  for (const l of g.values()) for (let a = 0; a < l.length; a++) for (let b = a + 1; b < l.length; b++) { const t = l[a], u = l[b], k = t < u ? t * idx.length + u : u * idx.length + t; if (viste.has(k)) continue; viste.add(k);
    const A = [idx[t], idx[t + 1], idx[t + 2]], B = [idx[u], idx[u + 1], idx[u + 2]]; if (A.some(x => B.includes(x))) continue; const TA = A.map(V), TB = B.map(V);
    for (let e = 0; e < 3; e++) if (seg(TA[e], TA[(e + 1) % 3], ...TB) || seg(TB[e], TB[(e + 1) % 3], ...TA)) { n++; break; } }
  return n; }
log('autointersezioni nella regione: prima', autointersezioni(pos0), ', dopo', autointersezioni(cur));
log('vertici oltre 0,2 mm fuori dal profilo regolare: prima', (() => { let n = 0; for (let i = 0; i < nv; i++) if (UVW0[i][0] >= U_REG && camp(Dt, UVW0[i][0], UVW0[i][1]) > 0.02) n++; return n; })(),
  ', dopo', (() => { let n = 0; for (let i = 0; i < nv; i++) { const q = uvw(cur, i); if (q[0] >= U_REG && camp(Dt, q[0], q[1]) > 0.02) n++; } return n; })());

// normali di vertice ricalcolate sui vertici spostati e sui vicini (segno come quello già scritto)
if (nrm) { const mossi = []; for (let i = 0; i < nv; i++) if (Math.hypot(cur[3 * i] - pos0[3 * i], cur[3 * i + 1] - pos0[3 * i + 1], cur[3 * i + 2] - pos0[3 * i + 2]) > 1e-5) mossi.push(i);   // nodi e flusso
  const toccati = new Set(mossi); for (const i of mossi) for (const j of nb[i]) toccati.add(j);
  const acc = new Map([...toccati].map(i => [i, [0, 0, 0]]));
  for (let t = 0; t < idx.length; t += 3) { const Tt = [idx[t], idx[t + 1], idx[t + 2]]; if (!Tt.some(i => acc.has(i))) continue; const f = nTri(cur, t);
    for (const i of Tt) if (acc.has(i)) for (let k = 0; k < 3; k++) acc.get(i)[k] += f[k]; }
  for (const [i, f] of acc) { const l = Math.hypot(...f) || 1, o = [0, 1, 2].map(k => nrm[3 * i + k]), s = o[0] * f[0] + o[1] * f[1] + o[2] * f[2] < 0 ? -1 : 1;
    for (let k = 0; k < 3; k++) nrm[3 * i + k] = Math.round(127 * s * f[k] / l); } }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { setMesh(NOME, { pos: Float32Array.from(cur), idx, tag: A0.tag, fdir: A0.fdir, nrm }); saveFile(repack()); }
