/* Rifinitura del tendine del piccolo rotondo (`tmin`) della spalla (modelli/spalla-3d.html): estremità d'inserzione arrotondata e margine superiore senza la
   lieve concavità che aveva poco prima dell'inserzione.

   Uso (dalla cartella del progetto):
     node strumenti/rifinitura-tmin-spalla.mjs                  → riscrive `tmin` nel file del modello
     PROVA=1 node strumenti/rifinitura-tmin-spalla.mjs          → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/rifinitura-tmin-spalla.mjs   → lavora su una copia
   Va lanciato dopo `muscoli-spalla.mjs` (con `rifinitura-infra-spalla.mjs`, in qualsiasi ordine, e prima di `borsa-spalla.mjs`). Riparte dalle posizioni di `tmin`
   della revisione `BASE` (stessa topologia), quindi si può rilanciare con lo stesso risultato; se si rilancia `muscoli-spalla.mjs` e cambia `tmin`,
   aggiornare `BASE`.

   Metodo. Nella vista posteriore (`VISTA`: theta, phi della camera della pagina) u corre lungo il tendine verso la punta, v verso l'alto. La punta era un
   angolo vivo in alto, con il margine inferiore obliquo. Il contorno nuovo, per fasce di u:
   - margine superiore: inviluppo convesso superiore del margine di prima da `INIZIO_SUP` (u, cm dalla punta) fino all'arco: colma la concavità senza
     alzare il resto;
   - margine inferiore: da `INIZIO_INF` inviluppo convesso inferiore del margine di prima e della punta nuova (riempie il sottosquadro sotto la punta);
   - punta: abbassata di `ABBASSA_PUNTA` rispetto al margine superiore, raggiunta da due quarti di ellisse (tangente verticale sulla punta) lunghi
     `CAPO_SUP` sopra e `CAPO_INF` sotto: l'angolo vivo diventa una curva.
   I vertici dell'estremità sono stirati (o compressi, nell'angolo tolto) in v tra i due margini nuovi, con una fascia `BANDA` compressa in modo morbido
   sotto e sopra il contorno (i denti tornano sulla curva), poi riportati alla distanza di prima dal centro della testa omerale (il tendine resta
   appoggiato). Infine levigatura dell'estremità (`LEV_PUNTA`) e del bordo lungo la sua curva (spigoli con diedro oltre `DIEDRO_BORDO`°, `LEV_BORDO`).
   Normali di vertice (`nm`) ricalcolate sui vertici spostati e sui vicini. Controlli stampati: profilo prima e dopo, spostamento massimo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { vicini } = await import('./lib-bp3d.mjs');
const { REAL, posDaRevisione, setMesh, saveFile, repack, log } = G;

const BASE = 'fc755f7', NOME = 'tmin';
const VISTA = [4.1, 0.4], RAGGIO = 2.6, BIN = 0.05;
const INIZIO_SUP = 2.0, INIZIO_INF = 1.2, CAPO_SUP = 0.45, CAPO_INF = 0.35, ABBASSA_PUNTA = 0.18, BANDA = 0.05;   // cm
const LEV_PUNTA = 60, DIEDRO_BORDO = 95, LEV_BORDO = 100;

const { nv, idx } = REAL(NOME);
const pos0 = Float64Array.from(posDaRevisione(BASE, NOME, 'modelli/spalla-3d.html')), cur = pos0.slice();
const nb = vicini(nv, idx);
const cTesta = (() => { const p = REAL('cart_omero').pos, M = Array.from({ length: 4 }, () => new Float64Array(5));
  for (let i = 0; i < p.length; i += 3) { const r = [2 * p[i], 2 * p[i + 1], 2 * p[i + 2], 1], b = p[i] ** 2 + p[i + 1] ** 2 + p[i + 2] ** 2; for (let j = 0; j < 4; j++) { for (let k = 0; k < 4; k++) M[j][k] += r[j] * r[k]; M[j][4] += r[j] * b; } }
  for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r; [M[c], M[m]] = [M[m], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; } }
  return [0, 1, 2].map(j => M[j][4] / M[j][j]); })();

// sistema della vista: e1 (u) orizzontale sullo schermo, e2 (v) verso l'alto
const un = v => { const l = Math.hypot(...v); return v.map(x => x / l); }, [th, ph] = VISTA;
const n = un([Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)]), e2 = un([0, 1, 0].map((v, k) => v - n[1] * n[k])), e1 = [e2[1] * n[2] - e2[2] * n[1], e2[2] * n[0] - e2[0] * n[2], e2[0] * n[1] - e2[1] * n[0]];
let punta = 0; { let mu = -1e9; for (let i = 0; i < nv; i++) { const u = cur[3 * i] * e1[0] + cur[3 * i + 1] * e1[1] + cur[3 * i + 2] * e1[2]; if (u > mu) { mu = u; punta = i; } } }
const C = [0, 1, 2].map(k => cur[3 * punta + k]);
const uv = (P, i) => { const p = [0, 1, 2].map(k => P[3 * i + k] - C[k]); return [p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]]; };
const sel = []; for (let i = 0; i < nv; i++) if (Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - C[k])) < RAGGIO) sel.push(i);

// margini per fasce di u (massimo e minimo di v), levigati; la punta è u = 0
const profilo = P => { const u0 = -INIZIO_SUP - 0.4, nb2 = Math.ceil((0.05 - u0) / BIN) + 1, sup = new Float64Array(nb2).fill(-9), inf = new Float64Array(nb2).fill(9);
  for (const i of sel) { const [u, v] = uv(P, i); if (u < u0) continue; const b = Math.min(nb2 - 1, Math.floor((u - u0) / BIN)); sup[b] = Math.max(sup[b], v); inf[b] = Math.min(inf[b], v); }
  const liscia = a => a.map((_, b) => { let s = 0, k = 0; for (let d = -2; d <= 2; d++) if (a[b + d] !== undefined && Math.abs(a[b + d]) < 9) { s += a[b + d]; k++; } return k ? s / k : a[b]; });
  return { u0, nb2, S: liscia(sup), I: liscia(inf), sup, inf }; };
const pr = profilo(cur), lin = (A, u) => { const x = Math.max(0, Math.min(pr.nb2 - 1.001, (u - pr.u0) / BIN - 0.5)), b = Math.floor(x); return A[b] + (A[b + 1] - A[b]) * (x - b); };
const stampa = (P, et) => { const q = profilo(P), r = []; for (let u = -1.8; u <= 0.01; u += 0.2) { const b = Math.min(q.nb2 - 1, Math.floor((u - q.u0) / BIN)); r.push(u.toFixed(1) + ':' + q.sup[b].toFixed(2) + '/' + q.inf[b].toFixed(2)); } log(et, 'margini sup/inf per u:', r.join(' ')); };
stampa(cur, 'prima');

// contorno nuovo
const hull = (pts, sopraH) => { // inviluppo convesso superiore (sopraH) o inferiore di punti ordinati per u, come funzione di u
  const h = []; for (const p of pts) { while (h.length >= 2) { const [a, b] = [h[h.length - 2], h[h.length - 1]], cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); if (sopraH ? cr >= 0 : cr <= 0) h.pop(); else break; } h.push(p); }
  return u => { for (let k = 0; k + 1 < h.length; k++) if (u <= h[k + 1][0]) return h[k][1] + (h[k + 1][1] - h[k][1]) * (u - h[k][0]) / (h[k + 1][0] - h[k][0]); return h[h.length - 1][1]; }; };
const us = -CAPO_SUP, ui = -CAPO_INF, vP = lin(pr.S, 0) - ABBASSA_PUNTA;
const pS = []; for (let u = -INIZIO_SUP; u <= us + 1e-9; u += BIN) pS.push([u, lin(pr.S, u)]);
const pI = []; for (let u = -INIZIO_INF; u <= -BIN + 1e-9; u += BIN) pI.push([u, lin(pr.I, u)]); pI.push([0, vP]);
const invS = hull(pS, true), invI = hull(pI, false);
const vS = Math.max(lin(pr.S, us), invS(us)), vI = Math.min(lin(pr.I, ui), invI(ui));
const ell = (u, u1, v1) => vP + (v1 - vP) * Math.sqrt(Math.max(0, 1 - (1 - u / u1) ** 2));   // quarto di ellisse da (u1, v1) a (0, vP), tangente verticale sulla punta
// l'arco non va oltre il contorno di prima più che serve: sopra resta sotto l'inviluppo, sotto non scende sotto la corda tra (ui, vI) e la punta di più di quanto fa l'ellisse
const sopra = u => u < -INIZIO_SUP ? null : u <= us ? Math.max(lin(pr.S, u), invS(u)) : ell(u, us, vS);
const sotto = u => u < -INIZIO_INF ? lin(pr.I, u) : u <= ui ? Math.min(lin(pr.I, u), invI(u)) : ell(u, ui, vI);
// stiramento in v tra i margini nuovi, fascia morbida ai bordi, poi stessa distanza dal centro della testa
const mossi = []; let mxs = 0;
for (const i of sel) { const [u, v] = uv(cur, i); if (u < -INIZIO_SUP) continue;
  const vs = lin(pr.S, u), vi = lin(pr.I, u), ts = sopra(u), ti = sotto(u); if (vs - vi < 1e-3) continue;
  let vn = ti + (v - vi) * (ts - ti) / (vs - vi);
  { const x = vn - (ts - BANDA); if (x > 0) vn = ts - BANDA + BANDA * (1 - Math.exp(-x / BANDA)); }
  { const x = (ti + BANDA) - vn; if (x > 0) vn = ti + BANDA - BANDA * (1 - Math.exp(-x / BANDA)); }
  const d = vn - v; if (Math.abs(d) < 1e-5) continue;
  const r0 = Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - cTesta[k]));
  for (let k = 0; k < 3; k++) cur[3 * i + k] += d * e2[k];
  const r1 = Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - cTesta[k]));
  for (let k = 0; k < 3; k++) cur[3 * i + k] = cTesta[k] + (cur[3 * i + k] - cTesta[k]) * r0 / r1;
  mossi.push(i); mxs = Math.max(mxs, Math.abs(d)); }
log('vertici spostati', mossi.length, ', in v al massimo', (mxs * 10).toFixed(1), 'mm');

// levigatura dell'estremità: peso pieno sui vertici spostati e su due anelli, poi a scendere
const w = new Float64Array(nv); { let fronte = new Set(mossi); for (const i of fronte) w[i] = 1;
  for (let a = 1; a <= 5; a++) { const nuovo = new Set(); for (const i of fronte) for (const j of nb[i]) if (!w[j]) { w[j] = a <= 2 ? 1 : 1 - (a - 2) / 4; nuovo.add(j); } fronte = nuovo; } }
const zona = []; for (let i = 0; i < nv; i++) if (w[i] > 0) zona.push(i);
for (let it = 0; it < LEV_PUNTA; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
  for (const i of zona) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += w[i] * lam * (s / L.length - cur[3 * i + k]); } }
  cur.set(q); }
// bordo a dente di sega: Taubin lungo la catena degli spigoli con diedro oltre DIEDRO_BORDO, poi raccordo dei vicini
{ const ins = new Set(zona), nf = new Map(), ef = new Map(), lim = Math.cos(DIEDRO_BORDO * Math.PI / 180);
  for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.every(i => ins.has(i))) continue;
    const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), m = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(...m) || 1;
    nf.set(t, m.map(x => x / l)); for (let k = 0; k < 3; k++) { const x = T[k], y = T[(k + 1) % 3], key = Math.min(x, y) * nv + Math.max(x, y); (ef.get(key) || ef.set(key, []).get(key)).push(t); } }
  const bn = new Map(); for (const [key, L] of ef) if (L.length === 2) { const [p, q] = [nf.get(L[0]), nf.get(L[1])]; if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] < lim) { const a = Math.floor(key / nv), b = key % nv; (bn.get(a) || bn.set(a, []).get(a)).push(b); (bn.get(b) || bn.set(b, []).get(b)).push(a); } }
  const catena = [...bn].filter(([, L]) => L.length === 2);
  for (let it = 0; it < LEV_BORDO; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
    for (const [v, L] of catena) for (let k = 0; k < 3; k++) q[3 * v + k] += lam * ((cur[3 * L[0] + k] + cur[3 * L[1] + k]) / 2 - cur[3 * v + k]);
    cur.set(q); }
  const vic = new Set(); for (const v of bn.keys()) for (const j of nb[v]) if (!bn.has(j) && ins.has(j)) vic.add(j);
  for (let it = 0; it < 10; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
    for (const i of vic) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += lam * (s / L.length - cur[3 * i + k]); } }
    cur.set(q); }
  log('bordo dell\'estremità: vertici', bn.size, ', in catena', catena.length); }
stampa(cur, 'dopo');
{ let mx = 0; for (const i of zona) mx = Math.max(mx, Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k]))); log('spostamento massimo', (mx * 10).toFixed(2), 'mm'); }

// normali di vertice: quelle già nel file, ricalcolate (media dei triangoli, pesata dall'area) sui vertici spostati e sui loro vicini
const m = G.man.meshes.findLast(x => x.n === NOME);
const nrm = m.nm !== undefined ? Int8Array.from(new Int8Array(G.buf0.buffer, G.buf0.byteOffset + m.nm, nv * 3)) : null;
if (nrm) { const toccati = new Set(zona); for (const i of zona) for (const j of nb[i]) toccati.add(j);
  const acc = new Map([...toccati].map(i => [i, [0, 0, 0]]));
  for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(i => acc.has(i))) continue;
    const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), f = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    for (const i of T) if (acc.has(i)) for (let k = 0; k < 3; k++) acc.get(i)[k] += f[k]; }
  for (const [i, f] of acc) { const l = Math.hypot(...f) || 1, o = [0, 1, 2].map(k => nrm[3 * i + k]), s = o[0] * f[0] + o[1] * f[1] + o[2] * f[2] < 0 ? -1 : 1;   // segno come quello già scritto
    for (let k = 0; k < 3; k++) nrm[3 * i + k] = Math.round(127 * s * f[k] / l); } }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { const a = G.attrs(NOME); setMesh(NOME, { pos: Float32Array.from(cur), idx, tag: a.tag, fdir: a.fdir, nrm }); saveFile(repack()); }
