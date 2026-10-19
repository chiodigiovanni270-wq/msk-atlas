/* Rifinitura del tendine del sottospinato (`infra`) della spalla (modelli/spalla-3d.html): toglie le pieghe e le punte sul margine superiore del tendine,
   vicino all'inserzione sul trochite, dove la lamina a due strati lasciata da `muscoli-spalla.mjs` si ripiegava su se stessa (lembi, spigoli a 180°), e rende
   convessa l'estremità d'inserzione (il margine superiore scendeva in obliquo verso la punta con una lieve concavità).

   Uso (dalla cartella del progetto):
     node strumenti/rifinitura-infra-spalla.mjs                  → riscrive `infra` nel file del modello
     PROVA=1 node strumenti/rifinitura-infra-spalla.mjs          → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/rifinitura-infra-spalla.mjs   → lavora su una copia
   Va lanciato dopo `muscoli-spalla.mjs` e prima di `borsa-spalla.mjs` (la borsa poggia sul sottospinato). Riparte dalle posizioni di `infra` della
   revisione `BASE` (stessa topologia), quindi si può rilanciare con lo stesso risultato; se si rilancia `muscoli-spalla.mjs` e cambia `infra`,
   aggiornare `BASE` alla revisione che contiene il nuovo risultato (prima di questo script).

   Metodo: nelle sfere `ZONE` (centro, raggio pieno, raggio esterno, in cm) i vertici sono levigati con `PASSATE` giri di Taubin ristretti alla zona
   (peso 1 nel raggio pieno, che scende a 0 al raggio esterno con curva smoothstep): il resto della mesh non si muove. Le zone `forte` (punte più piccole del passo della
   mesh) sono poi mediate con i vicini senza compensazione per `PASSATE_FORTI` giri. Le normali di vertice scritte nel file
   (`nm`) sono ricalcolate solo sui vertici spostati e su quelli vicini. Controlli stampati: spigoli con angolo diedro oltre `SOGLIA`° (a 180° sono i
   bordi naturali della lamina a due strati) e triangoli con qualità minore di `QMIN` dentro le sfere, prima e dopo.
   Poi l'estremità d'inserzione è resa convessa (vedi «inserzione a estremità convessa» più sotto: `VISTA`, `INIZIO`), levigata (`LEV_PUNTA`) e il suo bordo
   a dente di sega è levigato lungo la curva (`DIEDRO_BORDO`, `LEV_BORDO`). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { vicini } = await import('./lib-bp3d.mjs');
const { REAL, posDaRevisione, setMesh, saveFile, repack, log, sstep } = G;

const BASE = '56ca2ad';
const ZONE = [{ c: [-1.1, 1.8, -1.7], r0: 0.8, r1: 1.3 },      // lembo ripiegato sul margine superiore
              { c: [-2.6, 1.3, -0.3], r0: 0.5, r1: 0.9 },       // punte vicino all'inserzione
              { c: [-2.6, 1.42, -0.38], r0: 0.12, r1: 0.3, forte: true },    // ultime punte sull'angolo dell'inserzione
              { c: [-1.15, 1.85, -1.6], r0: 0.12, r1: 0.3, forte: true }];   // ultima fessura sul margine superiore
const PASSATE = 120, PASSATE_FORTI = 25, SOGLIA = 100, QMIN = 0.05;

const base = REAL('infra'), nv = base.nv, idx = base.idx;
const pos0 = Float64Array.from(posDaRevisione(BASE, 'infra', 'modelli/spalla-3d.html')), cur = pos0.slice();
const nb = vicini(nv, idx);
const peso = new Float64Array(nv), forte = new Float64Array(nv);
for (let i = 0; i < nv; i++) for (const z of ZONE) { const d = Math.hypot(cur[3 * i] - z.c[0], cur[3 * i + 1] - z.c[1], cur[3 * i + 2] - z.c[2]); { const w = 1 - sstep(z.r0, z.r1, d); if (z.forte) forte[i] = Math.max(forte[i], w); else peso[i] = Math.max(peso[i], w); } }
const attivi = []; for (let i = 0; i < nv; i++) if (peso[i] > 0 || forte[i] > 0) { attivi.push(i); if (!peso[i]) peso[i] = 1e-9; }
log('vertici nelle zone', attivi.length);

function controlli(p, etichetta) {
  const ntr = idx.length / 3, nf = [], ef = new Map(); let qb = 0, pieghe = 0;
  for (let t = 0; t < ntr; t++) { const [a, b, c] = [0, 1, 2].map(k => idx[3 * t + k]); const u = [0, 1, 2].map(q => p[3 * b + q] - p[3 * a + q]), w = [0, 1, 2].map(q => p[3 * c + q] - p[3 * a + q]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1; nf.push(n.map(v => v / l));
    const e = [Math.hypot(...u), Math.hypot(...w), Math.hypot(...[0, 1, 2].map(q => p[3 * c + q] - p[3 * b + q]))], Q = 4 * Math.sqrt(3) * (l / 2) / (e[0] ** 2 + e[1] ** 2 + e[2] ** 2);
    if (peso[a] > 0 && peso[b] > 0 && peso[c] > 0 && Q < QMIN) qb++;
    for (let k = 0; k < 3; k++) { const x = idx[3 * t + k], y = idx[3 * t + (k + 1) % 3], key = Math.min(x, y) * nv + Math.max(x, y); (ef.get(key) || ef.set(key, []).get(key)).push(t); } }
  for (const [key, L] of ef) if (L.length === 2) { const a = Math.floor(key / nv), b = key % nv; if (peso[a] > 0 && peso[b] > 0) { const d = nf[L[0]][0] * nf[L[1]][0] + nf[L[0]][1] * nf[L[1]][1] + nf[L[0]][2] * nf[L[1]][2]; if (Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI > SOGLIA) pieghe++; } }
  log(etichetta + ': spigoli con diedro >' + SOGLIA + '°', pieghe, '; triangoli con qualità <' + QMIN, qb);
}
controlli(cur, 'prima');

for (let it = 0; it < PASSATE; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
  for (const i of attivi) { const L = nb[i]; if (!L.length) continue; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += peso[i] * lam * (s / L.length - cur[3 * i + k]); } }
  cur.set(q); }
// zone «forti»: media dei vicini senza compensazione (restringe le punte più piccole del passo della mesh), poi una levigatura di Taubin leggera
for (let it = 0; it < PASSATE_FORTI; it++) { const q = cur.slice();
  for (const i of attivi) if (forte[i] > 0) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += forte[i] * 0.5 * (s / L.length - cur[3 * i + k]); } }
  cur.set(q); }
controlli(cur, 'dopo');

/* ---- inserzione a estremità convessa ----
   Nella vista posterolaterale (`VISTA`: theta, phi della camera della pagina) il margine superiore del tendine scendeva in obliquo fino alla punta, con
   una lieve concavità: l'impronta del sottospinato è invece un trapezio a margini convessi che occupa anche la parte posteriore della faccetta superiore
   del trochite (Mochizuki et al., J Bone Joint Surg Am 2008). In quella vista: u lungo il tendine verso la punta, v verso l'alto. Il margine superiore
   resta quello di prima fino a `INIZIO` (u, cm dalla punta) e poi segue un quarto di ellisse fino alla punta; i vertici dell'estremità sono stirati in v
   dal margine inferiore (fermo) a quello nuovo, poi riportati alla distanza di prima dal centro della testa omerale (il tendine resta appoggiato). */
const VISTA = [4.1, 0.4], CENTRO_PUNTA = [-2.3, 1.1, -0.6], RAGGIO_PUNTA = 1.9, INIZIO = 1.25, BIN = 0.05, LEV_PUNTA = 60, BANDA = 0.06, DIEDRO_BORDO = 95, LEV_BORDO = 100;
const cTesta = (() => { const p = REAL('cart_omero').pos, M = Array.from({ length: 4 }, () => new Float64Array(5));
  for (let i = 0; i < p.length; i += 3) { const r = [2 * p[i], 2 * p[i + 1], 2 * p[i + 2], 1], b = p[i] ** 2 + p[i + 1] ** 2 + p[i + 2] ** 2; for (let j = 0; j < 4; j++) { for (let k = 0; k < 4; k++) M[j][k] += r[j] * r[k]; M[j][4] += r[j] * b; } }
  for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r; [M[c], M[m]] = [M[m], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; } }
  return [0, 1, 2].map(j => M[j][4] / M[j][j]); })();
const convessi = [];
{ const un = v => { const l = Math.hypot(...v); return v.map(x => x / l); }, [th, ph] = VISTA;
  const n = un([Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)]), e2 = un([0, 1, 0].map((v, k) => v - n[1] * n[k])), e1 = [e2[1] * n[2] - e2[2] * n[1], e2[2] * n[0] - e2[0] * n[2], e2[0] * n[1] - e2[1] * n[0]];
  const uv = i => { const p = [0, 1, 2].map(k => cur[3 * i + k] - CENTRO_PUNTA[k]); return [p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]]; };
  const sel = []; for (let i = 0; i < nv; i++) if (Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - CENTRO_PUNTA[k])) < RAGGIO_PUNTA) sel.push([i, ...uv(i)]);
  const ub = Math.max(...sel.map(q => q[1])), ua = ub - INIZIO, vb = sel.filter(q => q[1] > ub - 0.08).reduce((s, q, _, L) => s + q[2] / L.length, 0);
  // margini superiore e inferiore per fasce di u (massimo e minimo di v), levigati
  const nb2 = Math.ceil((ub - ua + 0.6) / BIN) + 1, u0 = ua - 0.5, sup = new Float64Array(nb2).fill(-9), inf = new Float64Array(nb2).fill(9), fascia = u => Math.max(0, Math.min(nb2 - 1, Math.floor((u - u0) / BIN)));
  for (const [, u, v] of sel) if (u >= u0) { const b = fascia(u); sup[b] = Math.max(sup[b], v); inf[b] = Math.min(inf[b], v); }
  const liscia = a => a.map((_, b) => { let s = 0, n = 0; for (let d = -2; d <= 2; d++) if (a[b + d] !== undefined && Math.abs(a[b + d]) < 9) { s += a[b + d]; n++; } return n ? s / n : a[b]; });
  const S = liscia(sup), I = liscia(inf), lin = (A, u) => { const x = Math.max(0, Math.min(nb2 - 1.001, (u - u0) / BIN - 0.5)), b = Math.floor(x); return A[b] + (A[b + 1] - A[b]) * (x - b); };
  const vt0 = lin(S, ua);
  const bersaglio = u => u <= ua ? -Infinity : vb + (vt0 - vb) * Math.sqrt(Math.max(0, 1 - ((u - ua) / (ub - ua)) ** 2));
  let mxs = 0;
  for (const [i, u, v] of sel) { if (u <= ua) continue; const vs = lin(S, u), vi = lin(I, u), vt = Math.max(vs, bersaglio(u)); if (vs - vi < 1e-3 || vt <= vs) continue;
    let vn = vi + (v - vi) * (vt - vi) / (vs - vi);
    // fascia sotto il margine nuovo compressa in modo morbido sotto la curva: i denti che la superavano tornano sul margine liscio
    { const x = vn - (vt - BANDA); if (x > 0) vn = vt - BANDA + BANDA * (1 - Math.exp(-x / BANDA)); }
    const d = vn - v; if (Math.abs(d) <= 1e-5) continue;
    const r0 = Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - cTesta[k]));
    for (let k = 0; k < 3; k++) cur[3 * i + k] += d * e2[k];
    const r1 = Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - cTesta[k]));
    for (let k = 0; k < 3; k++) cur[3 * i + k] = cTesta[k] + (cur[3 * i + k] - cTesta[k]) * r0 / r1;
    convessi.push(i); mxs = Math.max(mxs, Math.abs(d)); }
  log('inserzione convessa: punta u', ub.toFixed(2), 'v', vb.toFixed(2), '; margine superiore da u', ua.toFixed(2), '(v', vt0.toFixed(2) + '); vertici spostati', convessi.length, ', al massimo', (mxs * 10).toFixed(1), 'mm');
  for (const i of convessi) if (!peso[i] && !forte[i]) { peso[i] = 1e-9; attivi.push(i); }
  // levigatura dell'estremità stirata e della sua fascia (`LEV_PUNTA` giri di Taubin, peso pieno sui vertici spostati e su due anelli attorno, poi a scendere):
  // lo stiramento conserva le piccole dentellature del margine, che diventano più evidenti
  const w = new Float64Array(nv); let fronte = new Set(convessi); for (const i of fronte) w[i] = 1;
  for (let a = 1; a <= 5; a++) { const nuovo = new Set(); for (const i of fronte) for (const j of nb[i]) if (!w[j]) { w[j] = a <= 2 ? 1 : 1 - (a - 2) / 4; nuovo.add(j); } fronte = nuovo; }
  const L2 = []; for (let i = 0; i < nv; i++) if (w[i] > 0) L2.push(i);
  for (let it = 0; it < LEV_PUNTA; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
    for (const i of L2) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += w[i] * lam * (s / L.length - cur[3 * i + k]); } }
    cur.set(q); }
  // bordo dell'estremità a dente di sega (spigoli con diedro oltre `DIEDRO_BORDO`°: i vertici del bordo passano da uno strato all'altro del tendine):
  // levigatura lungo la catena del bordo (`LEV_BORDO` giri di Taubin, estremi fermi), poi raccordo dei vertici vicini
  { const ins = new Set(L2), nf = new Map(), ef = new Map(), lim = Math.cos(DIEDRO_BORDO * Math.PI / 180);
    for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.every(i => ins.has(i))) continue;
      const u = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), w2 = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), n = [u[1] * w2[2] - u[2] * w2[1], u[2] * w2[0] - u[0] * w2[2], u[0] * w2[1] - u[1] * w2[0]], l = Math.hypot(...n) || 1;
      nf.set(t, n.map(v => v / l)); for (let k = 0; k < 3; k++) { const a = T[k], b = T[(k + 1) % 3], key = Math.min(a, b) * nv + Math.max(a, b); (ef.get(key) || ef.set(key, []).get(key)).push(t); } }
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
  for (const i of L2) if (!peso[i] && !forte[i]) { peso[i] = 1e-9; attivi.push(i); } }
let mx = 0; for (const i of attivi) mx = Math.max(mx, Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k]))); log('spostamento massimo', (mx * 10).toFixed(2), 'mm');

// normali di vertice: quelle già nel file, ricalcolate (media dei triangoli, pesata dall'area) sui vertici spostati e sui loro vicini
const m = G.man.meshes.findLast(x => x.n === 'infra');
const nrm = Int8Array.from(new Int8Array(G.buf0.buffer, G.buf0.byteOffset + m.nm, nv * 3));
const toccati = new Set(attivi); for (const i of attivi) for (const j of nb[i]) toccati.add(j);
const acc = new Map([...toccati].map(i => [i, [0, 0, 0]]));
for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(i => acc.has(i))) continue;
  const u = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), w = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const i of T) if (acc.has(i)) for (let k = 0; k < 3; k++) acc.get(i)[k] += n[k]; }
for (const [i, n] of acc) { const l = Math.hypot(...n) || 1, o = [0, 1, 2].map(k => nrm[3 * i + k]), ph = o[0] * n[0] + o[1] * n[1] + o[2] * n[2] < 0 ? -1 : 1;   // segno come quello già scritto
  for (let k = 0; k < 3; k++) nrm[3 * i + k] = Math.round(127 * ph * n[k] / l); }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { const a = G.attrs('infra'); setMesh('infra', { pos: Float32Array.from(cur), idx, tag: a.tag, fdir: a.fdir, nrm }); saveFile(repack()); }
