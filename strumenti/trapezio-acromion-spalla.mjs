/* Trapezio, parte trasversa (`trap_t`) della spalla (modelli/spalla-3d.html): estremità d'inserzione su acromion e legamento acromioclavicolare
   aderente all'osso, con margine liscio, senza frammenti né triangoli accartocciati.

   Problema. Nella mesh di BodyParts3D (dopo la spinta «sopra il legamento» di `muscoli-spalla.mjs`) la lamina d'inserzione resta sollevata 1–3 mm
   dalla faccia superiore dell'acromion, ha il margine laterale a dente di sega e, dove passa sopra il legamento acromioclavicolare, è accartocciata
   (triangoli ripiegati e un frammento staccato). Spostare i vertici non basta: l'estremità è ricostruita come superficie implicita e ricucita al
   resto del muscolo, che non cambia.

   Uso (dalla cartella del progetto):
     node strumenti/trapezio-acromion-spalla.mjs                → riscrive `trap_t` nel file del modello (topologia nuova solo vicino all'acromion)
     PROVA=1 node strumenti/trapezio-acromion-spalla.mjs        → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/trapezio-acromion-spalla.mjs   → lavora su una copia
   Dopo `deltoide-spalla.mjs` (il deltoide è un ostacolo). Riparte da `trap_t` della revisione `BASE` (mesh, tag, direzioni delle fibre e normali),
   con le altre strutture del file come ostacoli, quindi si può rilanciare con lo stesso risultato.

   Metodo (griglia di passo `PASSO` attorno all'acromion; campi di distanza con segno, negativi dentro).
   1. Ossa d'inserzione: acromion (scapola sopra `Y_INS` e lateralmente a `X_INS`), estremità laterale della clavicola (lateralmente a `X_CLAV`) e
      legamento acromioclavicolare. Zona: 1 fino a `ZONA0` da queste, 0 oltre `ZONA1`; fuori dalla zona il muscolo resta quello di BASE.
   2. Forma: solido di BASE (riempimento per parità) aperto di raggio `APRI` (via le pieghe sottili dell'accartocciamento e i denti del margine),
      solo il pezzo più grande; chiusura di raggio `R_ADER` con le ossa d'inserzione, limitata ai punti entro `VICINO_M` dal muscolo ed entro
      `VICINO_O` dalle ossa: la lamina scende sull'acromion e sul legamento e vi resta appoggiata. Campo levigato (`LEVIGA` passate) e fuso con quello
      di BASE col peso della zona; fuori da ossa (`GAP_OSSO`) e dalle strutture vicine (`GAP_MOLLI`, `MOLLI`).
   3. Superficie (surface nets) tagliata a `ZCUT` dalle ossa d'inserzione; pezzi staccati tolti (meno di `PEZZO_MIN` triangoli), riduzione a quadriche
      fino a `TRI` volte la densità di BASE nella stessa zona, bordo fermo. BASE tagliata allo stesso livello; i due bordi sono cuciti con una
      striscia di triangoli (un'unica mesh chiusa, senza fessura).
   4. Tag (muscolo/tendine) e direzioni delle fibre dal triangolo di BASE più vicino; normali ricalcolate nella parte nuova e sfumate su quelle di
      BASE entro `BANDA` oltre il taglio.
   Controlli stampati: triangoli che si incrociano con ossa e strutture vicine (BASE → nuovo), distanza della faccia inferiore dall'acromion. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const B = await import('./lib-bp3d.mjs');
const { REAL, realDaRevisione, saveFile, repack, log, griglia, solid, edt, sdf, unione, chiuso, esatta, sfoca, nets, sample, sstep } = G;

const BASE = 'b0115aa', FILE = 'modelli/spalla-3d.html', NOME = 'trap_t';
const OSSA = ['scapola', 'clavicola', 'omero'], LEG = ['ac_leg'];
const MOLLI = ['ac_leg', 'cal', 'supra', 'delt_cl', 'delt_ac', 'delt_sp', 'trap_d', 'trap_a', 'borsa_sad', 'cc_trapezoide', 'cc_conoide'];
const BOX = [[-1.2, 1.4, -7.0], [6.0, 6.4, 1.0]];                                                     // cm: riquadro della griglia
const PASSO = 0.03, Y_INS = 2.0, X_INS = 2.6, X_CLAV = 3.2;                                            // cm
const ZONA0 = 0.9, ZONA1 = 1.7, ZCUT = 1.9, BANDA = 0.3;                                               // cm
const APRI = 0.06, R_ADER = 0.4, VICINO_M = 0.3, VICINO_O = 0.4, LEVIGA = 3, GAP_OSSO = 0.03, GAP_MOLLI = 0.04;
const PEZZO_MIN = 300, TRI = 1.3;

/* ---- mesh di partenza (BASE), messa al posto di quella del file: voxelizzazione e controlli partono sempre da BASE ---- */
const P0 = realDaRevisione(BASE, NOME, FILE); P0.nv = P0.pos.length / 3;
{ const h = execFileSync('git', ['show', `${BASE}:${FILE}`], { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'), maxBuffer: 1 << 30 }).toString('utf8');
  const mn = JSON.parse(h.match(G.reManRe)[2]); let b = Buffer.from(h.match(G.reDatRe)[2].trim(), 'base64'); if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
  const m = mn.meshes.findLast(x => x.n === NOME), d = new Int8Array(b.buffer, b.byteOffset + m.nm, m.nv * 3); P0.nrm = Float32Array.from(d, x => x / 127); }
G.setMesh(NOME, { pos: P0.pos, idx: P0.idx, tag: P0.tag, fdir: P0.fdir });

/* ---- griglia e campi ---- */
griglia(BOX[0], BOX[1], PASSO, 0);
const { N } = G;
log('griglia', G.NX, G.NY, G.NZ, (N / 1e6).toFixed(1), 'M voxel');
const vox = id => [G.O[0] + (id % G.NX + 0.5) * G.H, G.O[1] + (((id / G.NX) | 0) % G.NY + 0.5) * G.H, G.O[2] + (((id / G.NXY) | 0) + 0.5) * G.H];
const dentro = p => p.every((x, k) => x > BOX[0][k] + 0.05 && x < BOX[1][k] - 0.05);
// 1. ossa d'inserzione e zona
const Mins = new Uint8Array(N); { const Ms = solid('scapola'), Mc = solid('clavicola'), Ml = unione(LEG);
  for (let i = 0; i < N; i++) { if (Ml[i]) { Mins[i] = 1; continue; } if (!Ms[i] && !Mc[i]) continue; const p = vox(i);
    if ((Ms[i] && p[1] > Y_INS && p[0] < X_INS) || (Mc[i] && p[0] < X_CLAV)) Mins[i] = 1; } }
const Dins = edt(Mins), W = new Float32Array(N); for (let i = 0; i < N; i++) W[i] = 1 - sstep(ZONA0, ZONA1, Dins[i]);
const zonaV = p => dentro(p) ? sample(Dins, ...p) : 1e3;   // distanza di un vertice dalle ossa d'inserzione (fuori dal riquadro: lontano)
// 2. forma
const S = sdf(solid(NOME)).F; esatta(S, [NOME], 0.08);
const Mo = new Uint8Array(N); { const A = new Uint8Array(N); for (let i = 0; i < N; i++) A[i] = S[i] < 0 ? 1 : 0;
  const E = edt(A, true), Er = new Uint8Array(N); for (let i = 0; i < N; i++) Er[i] = E[i] >= APRI ? 1 : 0;
  const D2 = edt(Er); for (let i = 0; i < N; i++) Mo[i] = A[i] && D2[i] <= APRI ? 1 : 0; }
{ // solo il pezzo più grande (6-connesso)
  const lab = new Int32Array(N).fill(-1), dim = []; const st = new Int32Array(N);
  for (let s = 0; s < N; s++) { if (!Mo[s] || lab[s] >= 0) continue; const L = dim.length; let n = 0, top = 0; st[top++] = s; lab[s] = L;
    while (top) { const i = st[--top]; n++; const x = i % G.NX, y = ((i / G.NX) | 0) % G.NY, z = (i / G.NXY) | 0;
      for (const [d, ok] of [[1, x < G.NX - 1], [-1, x > 0], [G.NX, y < G.NY - 1], [-G.NX, y > 0], [G.NXY, z < G.NZ - 1], [-G.NXY, z > 0]]) { const j = i + d; if (ok && Mo[j] && lab[j] < 0) { lab[j] = L; st[top++] = j; } } }
    dim.push(n); }
  const big = dim.indexOf(Math.max(...dim)); let tolti = 0; for (let i = 0; i < N; i++) if (Mo[i] && lab[i] !== big) { Mo[i] = 0; tolti++; }
  log('apertura: pezzi', dim.length, ', voxel staccati tolti', tolti); }
const Dm = edt(Mo), T = new Float32Array(N); for (let i = 0; i < N; i++) T[i] = Math.min(Dm[i], Dins[i]);
const Cc = chiuso(T, R_ADER), Mf = new Uint8Array(N);
for (let i = 0; i < N; i++) Mf[i] = Mo[i] || (Cc[i] <= 0 && !Mins[i] && Dm[i] <= VICINO_M && Dins[i] <= VICINO_O) ? 1 : 0;
const Fn = sdf(Mf).F; sfoca(Fn, LEVIGA);
log('forma nuova');
const Sb = esatta(sdf(unione(OSSA)).F, OSSA, 0.08), Sm = sdf(unione(MOLLI)).F;
const V = new Float32Array(N);
for (let i = 0; i < N; i++) { const w = W[i]; V[i] = w <= 0 ? S[i] : Math.max(w * Fn[i] + (1 - w) * S[i], GAP_OSSO - Sb[i], GAP_MOLLI - Sm[i]); }
log('campo pronto');

/* ---- 3. superficie nuova, tagliata a ZCUT, e BASE tagliata allo stesso livello ---- */
let nuova = nets(V, () => [1, 0, 0]);
{ const s = Float64Array.from({ length: nuova.pos.length / 3 }, (_, i) => ZCUT - zonaV([nuova.pos[3 * i], nuova.pos[3 * i + 1], nuova.pos[3 * i + 2]]));
  const c = B.ritagliaCampo(nuova.pos, nuova.idx, s); nuova = { pos: c.pos, idx: c.idx, s: c.s }; }
{ // pezzi staccati
  const nv = nuova.pos.length / 3, par = Int32Array.from({ length: nv }, (_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < nuova.idx.length; t += 3) { const a = f(nuova.idx[t]); par[f(nuova.idx[t + 1])] = a; par[f(nuova.idx[t + 2])] = a; }
  const cnt = new Map(); for (let t = 0; t < nuova.idx.length; t += 3) { const r = f(nuova.idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const I = []; for (let t = 0; t < nuova.idx.length; t += 3) if (cnt.get(f(nuova.idx[t])) >= PEZZO_MIN) I.push(nuova.idx[t], nuova.idx[t + 1], nuova.idx[t + 2]);
  log('superficie nuova: pezzi', cnt.size, ', triangoli in pezzi staccati tolti', nuova.idx.length / 3 - I.length / 3);
  const c = B.compatta(nuova.pos, Uint32Array.from(I), [nuova.s]); nuova = { pos: c.pos, idx: c.idx, s: c.extra[0] }; }
const sB = Float64Array.from({ length: P0.nv }, (_, i) => zonaV([P0.pos[3 * i], P0.pos[3 * i + 1], P0.pos[3 * i + 2]]) - ZCUT);
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
const nN = nuova.pos.length / 3, pos = [...nuova.pos, ...vec.pos], idx = [...nuova.idx, ...Array.from(vec.idx, v => v + nN)];
const AN = anelli(nuova.idx, v => Math.abs(nuova.s[v]) < 1e-9), AB = anelli(vec.idx, v => vec.orig[v] < 0).map(r => r.map(v => v + nN));
const pt = v => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]], dd = (a, b) => Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);
const cen = r => { const c = [0, 0, 0]; for (const v of r) for (let k = 0; k < 3; k++) c[k] += pos[3 * v + k] / r.length; return c; };
log('anelli del taglio: nuova', AN.map(r => r.length).join(' '), '; BASE', AB.map(r => r.length).join(' '));
let cuciti = 0, scartoMax = 0;
for (const A of AB) {   // A: bordo di BASE nel verso dei suoi triangoli; Bn: bordo nuovo più vicino, nel verso opposto ai suoi triangoli
  const ca = cen(A); let best = null, bd = 1e9; for (const r of AN) { const c = cen(r), d = Math.hypot(c[0] - ca[0], c[1] - ca[1], c[2] - ca[2]); if (d < bd) { bd = d; best = r; } }
  if (!best || bd > 0.5) { log('ATTENZIONE: anello di BASE senza corrispondente', A.length); continue; }
  let Bn = [...best].reverse(); let j0 = 0, m = 1e9; for (let j = 0; j < Bn.length; j++) { const d = dd(A[0], Bn[j]); if (d < m) { m = d; j0 = j; } } Bn = [...Bn.slice(j0), ...Bn.slice(0, j0)];
  let i = 0, j = 0; const nA = A.length, nB = Bn.length;
  while (i < nA || j < nB) { const a = A[i % nA], a1 = A[(i + 1) % nA], b = Bn[j % nB], b1 = Bn[(j + 1) % nB];
    const avA = j >= nB || (i < nA && dd(a1, b) <= dd(a, b1));
    if (avA) { idx.push(a1, a, b); i++; } else { idx.push(b, b1, a); j++; } scartoMax = Math.max(scartoMax, dd(a, b)); }
  cuciti++; }
log('anelli cuciti', cuciti, ', distanza massima tra i due bordi', (scartoMax * 10).toFixed(2), 'mm');

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
{ // spigoli: ogni spigolo in due triangoli (mesh chiusa)
  const ec = new Map(); for (let t = 0; t < R.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = R.idx[t + k], b = R.idx[t + (k + 1) % 3], q = a < b ? a + ',' + b : b + ',' + a; ec.set(q, (ec.get(q) || 0) + 1); }
  let aperti = 0, multipli = 0; for (const c of ec.values()) { if (c === 1) aperti++; else if (c > 2) multipli++; } log('spigoli di bordo', aperti, ', spigoli in più di due triangoli', multipli); }
{ // distanza dall'osso dei vertici della parte nuova sopra l'acromion (faccia inferiore della lamina)
  const d = []; for (let i = 0; i < nN; i++) { const p = pt(i); if (!dentro(p) || p[0] > X_INS || sample(Sb, ...p) > 0.4) continue; d.push(sample(Sb, ...p)); }
  const d0 = []; for (let i = 0; i < P0.nv; i++) { const p = V0(i); if (!dentro(p) || p[0] > X_INS || sample(Sb, ...p) > 0.4 || sB[i] > 0) continue; d0.push(sample(Sb, ...p)); }
  const q = a => { a.sort((x, y) => x - y); return a.length ? `minimo ${(a[0] * 10).toFixed(2)} mm, 10% ${(a[Math.floor(a.length * 0.1)] * 10).toFixed(2)} mm` : '-'; };
  log('vertici entro 4 mm dalle ossa lateralmente a X_INS: BASE', d0.length, q(d0), '→ nuovo', d.length, q(d)); }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { G.setMesh(NOME, R); saveFile(repack()); }
