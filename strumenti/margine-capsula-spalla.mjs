/* Margine laterale della capsula della spalla (modelli/spalla-3d.html): bordi liberi della capsula lisci e regolari.

   Problema. Dove la capsula si apre per il tendine della cuffia e per il capo lungo del bicipite (foro di `aderenza-supra-spalla.mjs`, sul lato laterale
   e superiore, oltre il margine della cartilagine) il bordo è a dente di sega: i triangoli sono tolti uno per uno e restano punte, denti e anelli
   frastagliati lunghi qualche millimetro, con fessure e lembi che affiorano accanto al tendine.

   Uso (dalla cartella del progetto):
     node strumenti/margine-capsula-spalla.mjs              → scrive `caps` nel file del modello
     PROVA=1 node strumenti/margine-capsula-spalla.mjs      → stampa i controlli senza scrivere
     PROVA=f.json node strumenti/margine-capsula-spalla.mjs → come sopra, e salva la mesh nuova (pos, idx) in un JSON
     MODELLO=/tmp/copia.html node strumenti/margine-capsula-spalla.mjs   → lavora su una copia
   Va lanciato in fondo alla catena della spalla (dopo `cartilagine-testa-spalla.mjs`). Riparte sempre dalla `caps` della revisione git `PARTENZA`
   (prima di questo script), quindi si può rilanciare con lo stesso risultato; se si rilancia la catena, aggiornare PARTENZA e rilanciare anche questo.
   La capsula resta sullo stesso supporto (stesso numero di vertici salvo le punte tolte): non cambia la topologia fuori dai bordi liberi.

   Metodo.
   1. Pulizia: si tolgono a giri i triangoli con due o più spigoli sul bordo (punte e lembi di un solo triangolo) e quelli sugli spigoli non-manifold.
   2. Bordi: gli anelli di spigoli di bordo, ordinati; ogni vertice di bordo si porta alla media dei vicini lungo l'anello (smussatura di Taubin,
      `GIRI`, `LAMBDA`/`MU`), mai oltre `SPOSTA_MAX` dalla posizione di partenza.
   3. Interno: lo spostamento si estende ai vertici entro `ANELLI` anelli di triangoli dal bordo, con peso (1 − r/ANELLI)², poi una levigatura leggera
      (`LEVIGA` passate) solo di quei vertici, che tiene i triangoli ben formati.
   4. Aderenza: un vertice spostato non scende sotto la sua distanza di partenza dall'osso (e mai sotto `GIOCO_OSSO`); dalle strutture accanto (cuffia,
      capo lungo, trasverso, coraco-omerale) non si avvicina più di quanto era prima.
   Controlli: lunghezza e irregolarità dei bordi (scarto dal bordo levigato) prima/dopo, vertici della capsula dentro le strutture vicine, distanza minima dall'osso. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { realDaRevisione, setMesh, saveFile, repack, log, clamp } = G;
const B = await import('./lib-bp3d.mjs');

const PARTENZA = '9f9af0c', FILE_REPO = 'modelli/spalla-3d.html';
const CHIUDI = 1.0,  GIRI = 80, LAMBDA = 0.5, MU = -0.53, SPOSTA_MAX = 0.2;    // cm
const MEMBRANA = 150, ANELLI = 7, LEVIGA = 6, GIOCO_OSSO = 0.015;
const OSSA = ['omero', 'cart_omero', 'scapola'], VICINE = ['supra', 'infra', 'subs', 'bic_lungo', 'trasv_om', 'coraco_om', 'sghl', 'mghl'];

const c0 = realDaRevisione(PARTENZA, 'caps', FILE_REPO);
let P0 = Float64Array.from(c0.pos);
let idx = Array.from(c0.idx);
const P3 = (p, i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = a => Math.hypot(...a);

/* ---- 1. pulizia: punte e lembi ---- */
const chiave = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
function spigoli(I) { const e = new Map(); for (let t = 0; t < I.length; t += 3) for (let q = 0; q < 3; q++) { const k = chiave(I[t + q], I[t + (q + 1) % 3]); e.set(k, (e.get(k) || 0) + 1); } return e; }
let tolti = 0;
for (let g = 0; g < 12; g++) {
  const e = spigoli(idx), nuovo = []; let n = 0;
  for (let t = 0; t < idx.length; t += 3) {
    let bordo = 0, nm = 0; for (let q = 0; q < 3; q++) { const c = e.get(chiave(idx[t + q], idx[t + (q + 1) % 3])); if (c === 1) bordo++; else if (c > 2) nm++; }
    if (bordo >= 2 || nm) { n++; continue; } nuovo.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  idx = nuovo; tolti += n; if (!n) break;
}
log('pulizia: triangoli tolti', tolti, 'su', c0.idx.length / 3);

/* ---- anelli di bordo ---- */
function anelli(I) {
  const e = spigoli(I), adj = new Map();
  for (const [k, c] of e) if (c === 1) { const u = Math.floor(k / 4294967296), v = k % 4294967296; (adj.get(u) || adj.set(u, []).get(u)).push(v); (adj.get(v) || adj.set(v, []).get(v)).push(u); }
  const visti = new Set(), loops = []; let pinze = 0;
  for (const s of adj.keys()) {
    if (visti.has(s)) continue; const L = [s]; visti.add(s); let prev = -1, cur = s;
    for (;;) { const nb = adj.get(cur); if (nb.length !== 2) pinze++; const n = nb.find(x => x !== prev && !visti.has(x)); if (n === undefined) break; L.push(n); visti.add(n); prev = cur; cur = n; }
    loops.push(L);
  }
  return { loops, pinze };
}
let { loops, pinze } = anelli(idx);
/* 1b. fessure e piccoli fori (anello più corto di `CHIUDI` cm): si chiudono con un ventaglio dal baricentro, con il verso dei triangoli vicini */
const perim = (L, P) => { let s = 0; for (let i = 0; i < L.length; i++) s += len(sub(P3(P, L[i]), P3(P, L[(i + 1) % L.length]))); return s; };
const Pv = Array.from(P0); let chiusi = 0;
for (const L of loops) {
  if (perim(L, P0) >= CHIUDI) continue;
  const dir = new Set(); for (let t = 0; t < idx.length; t += 3) for (let q = 0; q < 3; q++) dir.add(idx[t + q] * 4294967296 + idx[t + (q + 1) % 3]);
  const cen = [0, 1, 2].map(k => L.reduce((s, i) => s + P0[3 * i + k], 0) / L.length), cid = Pv.length / 3; Pv.push(...cen);
  for (let i = 0; i < L.length; i++) { const u = L[i], v = L[(i + 1) % L.length]; if (dir.has(u * 4294967296 + v)) idx.push(v, u, cid); else idx.push(u, v, cid); }
  chiusi++;
}
P0 = Float64Array.from(Pv); ({ loops, pinze } = anelli(idx)); log('anelli piccoli chiusi:', chiusi);
// irregolarità: scarto medio dei vertici dall'anello levigato (Taubin, 40 giri: non restringe l'anello)
function irregolarita(L, P) {
  let Q = L.map(i => P3(P, i)); const K = Q.length;
  for (let g = 0; g < 80; g++) Q = Q.map((p, i) => { const a = Q[(i + K - 1) % K], b = Q[(i + 1) % K], f = g % 2 ? MU : LAMBDA; return [0, 1, 2].map(k => p[k] + f * ((a[k] + b[k]) / 2 - p[k])); });
  let s = 0, m = 0; L.forEach((i, j) => { const d = len(sub(P3(P, i), Q[j])); s += d; m = Math.max(m, d); }); return [s / K, m];
}
const riga = (P) => loops.filter(L => L.length >= 6).map(L => `${L.length}v ${(perim(L, P) * 10).toFixed(0)}mm irr ${irregolarita(L, P).map(x => (x * 10).toFixed(2)).join('/')}`).join('; ');
log('bordi liberi:', loops.length, 'anelli, pinze', pinze, '| prima (lunghezza, scarto medio/massimo dal bordo levigato):', riga(P0));

/* ---- 2. levigatura dei bordi ---- */
const nv = P0.length / 3, disp = new Float64Array(nv * 3), nb = B.vicini(nv, idx);
const P1 = P0.slice(), bordo = new Int32Array(nv).fill(-1);
for (const L of loops) {
  const K = L.length; if (K < 4) continue;
  let Q = L.map(i => P3(P0, i));
  const passo = f => { Q = Q.map((p, i) => { const a = Q[(i + K - 1) % K], b = Q[(i + 1) % K]; return [0, 1, 2].map(k => p[k] + f * ((a[k] + b[k]) / 2 - p[k])); }); };
  for (let g = 0; g < GIRI; g++) { passo(LAMBDA); passo(MU); }
  L.forEach((i, j) => { const d = sub(Q[j], P3(P0, i)), l = len(d), f = l > SPOSTA_MAX ? SPOSTA_MAX / l : 1; for (let k = 0; k < 3; k++) disp[3 * i + k] = d[k] * f; bordo[i] = 0; });
}
/* ---- 3. estensione all'interno ---- */
const anello = new Int32Array(nv).fill(-1), sorg = new Int32Array(nv).fill(-1); let fronte = [];
for (let i = 0; i < nv; i++) if (bordo[i] === 0) { anello[i] = 0; sorg[i] = i; fronte.push(i); }
for (let r = 1; r <= ANELLI; r++) { const nx = []; for (const i of fronte) for (const j of nb[i]) if (anello[j] < 0) { anello[j] = r; sorg[j] = sorg[i]; nx.push(j); } fronte = nx; }
for (let i = 0; i < nv; i++) if (anello[i] >= 0) {
  const w = (1 - anello[i] / (ANELLI + 1)) ** 2, s = sorg[i];
  for (let k = 0; k < 3; k++) P1[3 * i + k] = P0[3 * i + k] + disp[3 * s + k] * w;
}
const toccati = []; for (let i = 0; i < nv; i++) if (anello[i] > 0) toccati.push(i);
for (let g = 0; g < LEVIGA; g++) { const Q = P1.slice(); for (const i of toccati) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += P1[3 * j + k]; Q[3 * i + k] = P1[3 * i + k] + 0.5 * (s / L.length - P1[3 * i + k]); } } P1.set(Q); }

/* ---- 4. aderenza e vicini ---- */
const spost = []; for (let i = 0; i < nv; i++) if (anello[i] >= 0) spost.push(i);
let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (const i of spost) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P0[3 * i + k], P1[3 * i + k]); hi[k] = Math.max(hi[k], P0[3 * i + k], P1[3 * i + k]); }
G.griglia(lo, hi, 0.03, 0.4);
const FO = G.esatta(G.sdf(G.unione(OSSA)).F, OSSA, 0.15), FV = G.esatta(G.sdf(G.unione(VICINE)).F, VICINE, 0.15);
let spinti = 0;
for (const i of spost) {
  const p0 = P3(P0, i); let spinto = false;
  for (const [F, minimo] of [[FO, GIOCO_OSSO], [FV, 0.01]]) {
    const soglia = Math.min(G.sample(F, ...p0), minimo);   // non peggio di prima, né sotto il gioco
    for (let it = 0; it < 6; it++) {
      const p = P3(P1, i), d = G.sample(F, ...p); if (d >= soglia - 1e-6) break;
      const g = G.grad(F, p), l = len(g) || 1, passo = (soglia - d) * 2 * G.H * 0.75 / l;   // il gradiente è una differenza su 2·e
      for (let k = 0; k < 3; k++) P1[3 * i + k] += g[k] / l * Math.min(passo, 0.05); spinto = true;
    }
  }
  if (spinto) spinti++;
}
log('vertici spostati', spost.length, '(di cui riportati fuori da osso/vicini', spinti + ')');

/* ---- 5. fori: lembo di capsula sul foro di ogni anello rimasto ----
   Triangolazione di area minima dell'anello (programmazione dinamica, Liepa 2003), raffinata con baricentri e scambi di diagonali fino alla lunghezza dei
   lati del bordo, poi membrana: i vertici nuovi si mediano con i vicini (`MEMBRANA` passate), si tengono fuori dall'osso (`GIOCO_OSSO`) e fuori dalle strutture accanto. */
const Pf = Array.from(P1), idxF = Array.from(idx);
const pv = i => [Pf[3 * i], Pf[3 * i + 1], Pf[3 * i + 2]], dd = (a, b) => len(sub(pv(a), pv(b)));
const area = (a, b, c) => { const u = sub(pv(b), pv(a)), v = sub(pv(c), pv(a)); return len([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]) / 2; };
const nuoviV = new Set(); let patchTri = 0, riempiti = 0;
if (!process.env.SENZA_LEMBO) for (const L0 of loops) {
  const K = L0.length; if (K < 4) continue;
  const dirSet = new Set(); for (let t = 0; t < idxF.length; t += 3) for (let q = 0; q < 3; q++) dirSet.add(idxF[t + q] * 4294967296 + idxF[t + (q + 1) % 3]);
  const R = dirSet.has(L0[0] * 4294967296 + L0[1]) ? L0.slice().reverse() : L0.slice();
  const w = Array.from({ length: K }, () => new Float64Array(K)), ch = Array.from({ length: K }, () => new Int32Array(K).fill(-1));
  for (let m = 2; m < K; m++) for (let i = 0; i + m < K; i++) { const j = i + m; let b = 1e18, bk = -1;
    for (let k = i + 1; k < j; k++) { const c = w[i][k] + w[k][j] + area(R[i], R[k], R[j]); if (c < b) { b = c; bk = k; } } w[i][j] = b; ch[i][j] = bk; }
  let tri = []; const pila = [[0, K - 1]];
  while (pila.length) { const [i, j] = pila.pop(); if (j - i < 2) continue; const k = ch[i][j]; tri.push([R[i], R[k], R[j]]); pila.push([i, k], [k, j]); }
  const bordoE = new Set(); for (let i = 0; i < K; i++) bordoE.add(chiave(R[i], R[(i + 1) % K]));
  const sig = new Map(); for (let i = 0; i < K; i++) sig.set(R[i], (dd(R[i], R[(i + 1) % K]) + dd(R[i], R[(i + K - 1) % K])) / 2);
  const nvIn = () => Pf.length / 3;
  const flip = () => { let n = 0;
    for (let pass = 0; pass < 20; pass++) { let f = 0; const em = new Map();
      tri.forEach((T, ti) => { for (let q = 0; q < 3; q++) { const a = T[q], b = T[(q + 1) % 3], k = chiave(a, b); if (bordoE.has(k)) continue; (em.get(k) || em.set(k, []).get(k)).push([ti, q]); } });
      const eSet = new Set(); for (const T of tri) for (let q = 0; q < 3; q++) eSet.add(chiave(T[q], T[(q + 1) % 3]));
      const toccati = new Set();
      for (const [k, L] of em) { if (L.length !== 2) continue; const [[t1, q1], [t2, q2]] = L; if (toccati.has(t1) || toccati.has(t2)) continue;
        const T1 = tri[t1], T2 = tri[t2], a = T1[q1], b = T1[(q1 + 1) % 3], c = T1[(q1 + 2) % 3], d = T2[(q2 + 2) % 3];
        if (dd(c, d) >= dd(a, b) * 0.999 || eSet.has(chiave(c, d)) || bordoE.has(chiave(c, d))) continue;
        if (area(c, d, b) < 1e-6 || area(d, c, a) < 1e-6) continue;
        tri[t1] = [c, a, d]; tri[t2] = [d, b, c]; toccati.add(t1); toccati.add(t2); f++; n++; }
      if (!f) break; }
    return n; };
  flip();
  for (let giro = 0; giro < 40; giro++) { let sp = 0; const nt = [];
    for (const T of tri) { const [a, b, c] = T, cen = [0, 1, 2].map(k => (pv(a)[k] + pv(b)[k] + pv(c)[k]) / 3), sc = (sig.get(a) + sig.get(b) + sig.get(c)) / 3;
      const ok = [a, b, c].every(v => Math.SQRT2 * len(sub(cen, pv(v))) > sc && Math.SQRT2 * len(sub(cen, pv(v))) > sig.get(v));
      if (!ok) { nt.push(T); continue; }
      const id = nvIn(); Pf.push(...cen); sig.set(id, sc); nuoviV.add(id); nt.push([a, b, id], [b, c, id], [c, a, id]); sp++; }
    tri = nt; if (!sp) break; flip(); }
  // membrana: i vertici nuovi sono la media dei vicini (bordo fisso)
  const nbp = new Map(); for (const T of tri) for (let q = 0; q < 3; q++) { const a = T[q], b = T[(q + 1) % 3]; (nbp.get(a) || nbp.set(a, new Set()).get(a)).add(b); (nbp.get(b) || nbp.set(b, new Set()).get(b)).add(a); }
  const inn = [...nbp.keys()].filter(v => nuoviV.has(v));
  for (let g = 0; g < MEMBRANA; g++) for (const v of inn) { const Ls = [...nbp.get(v)]; for (let k = 0; k < 3; k++) Pf[3 * v + k] += 0.5 * (Ls.reduce((s, x) => s + Pf[3 * x + k], 0) / Ls.length - Pf[3 * v + k]); }
  for (const T of tri) idxF.push(...T); patchTri += tri.length; riempiti++;
}
{ // fuori dall'osso e dalle strutture accanto (i vertici nuovi): niente compenetrazioni
  let spN = 0;
  for (let giro = 0; giro < 8; giro++) for (const v of nuoviV) for (const [F, minimo] of [[FO, GIOCO_OSSO * 2], [FV, 0.01]]) {
    const p = pv(v), d = G.sample(F, ...p); if (d >= minimo) continue;
    const g = G.grad(F, p), l = len(g) || 1, passo = Math.min((minimo - d) * 2 * G.H * 0.75 / l, 0.05); for (let k = 0; k < 3; k++) Pf[3 * v + k] += g[k] / l * passo; spN++; }
  log('lembi:', riempiti, 'fori riempiti,', patchTri, 'triangoli,', nuoviV.size, 'vertici nuovi (', spN, 'correzioni da osso/vicini)');
  const cs = F => { let n = 0, m = 1e9; for (const v of nuoviV) { const d = G.sample(F, ...pv(v)); if (d < 0) n++; m = Math.min(m, d); } return n + ' dentro, minima ' + (m * 10).toFixed(2) + ' mm'; };
  if (nuoviV.size) log('lembo: distanza dall\'osso:', cs(FO), '| dalle strutture accanto:', cs(FV)); }
const Pfin = Float64Array.from(Pf);

/* ---- controlli ---- */
{ const cs = (P, F) => { let n = 0, m = 1e9; for (let i = 0; i < nv; i++) { if (anello[i] < 0) continue; const d = G.sample(F, ...P3(P, i)); if (d < 0) n++; m = Math.min(m, d); } return [n, (m * 10).toFixed(2)]; };
  log('vertici spostati dentro l\'osso (prima→dopo):', cs(P0, FO)[0], '→', cs(P1, FO)[0], '| distanza minima dall\'osso mm:', cs(P0, FO)[1], '→', cs(P1, FO)[1]);
  log('vertici spostati dentro cuffia/capo lungo/legamenti (prima→dopo):', cs(P0, FV)[0], '→', cs(P1, FV)[0], '| distanza minima mm:', cs(P0, FV)[1], '→', cs(P1, FV)[1]); }
{ let a = 0, mx = 0; for (const i of spost) { const d = len(sub(P3(P1, i), P3(P0, i))); a += d; mx = Math.max(mx, d); } log('spostamento medio / massimo mm:', (a / spost.length * 10).toFixed(2), '/', (mx * 10).toFixed(2)); }
{ let minQ = 1e9, nq = 0; const q0 = (P, t) => { const [a, b, c] = [0, 1, 2].map(k => P3(P, idx[t + k])), ab = sub(b, a), ac = sub(c, a), bc = sub(c, b); const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]; return 2 * Math.sqrt(3) * len(cr) / 2 / (len(ab) ** 2 + len(ac) ** 2 + len(bc) ** 2) * 2; };
  let m0 = 1e9, n0 = 0; for (let t = 0; t < idx.length; t += 3) { const x = q0(P1, t), y = q0(P0, t); if (x < 0.02) nq++; minQ = Math.min(minQ, x); if (y < 0.02) n0++; m0 = Math.min(m0, y); }
  log('qualità dei triangoli (minima; sotto 0,02) prima:', m0.toFixed(3), n0, '→ dopo:', minQ.toFixed(3), nq); }
log('dopo (lunghezza, scarto medio/massimo dal bordo levigato):', riga(P1));

const compatto = B.compatta(Pfin, Uint32Array.from(idxF));
const nuova = { pos: Float32Array.from(compatto.pos), idx: compatto.idx, tag: null, fdir: null };
log('capsula:', nuova.idx.length / 3, 'triangoli,', nuova.pos.length / 3, 'vertici (prima', c0.idx.length / 3, 'triangoli)');
if (process.env.PROVA) { log('PROVA: nessuna scrittura'); if (process.env.PROVA !== '1') writeFileSync(process.env.PROVA, JSON.stringify({ pos: Array.from(nuova.pos, v => +v.toFixed(4)), idx: Array.from(nuova.idx) })); }
else { setMesh('caps', nuova); saveFile(repack()); }
