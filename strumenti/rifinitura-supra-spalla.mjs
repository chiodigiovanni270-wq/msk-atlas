/* Rifinitura del tendine del sovraspinato (`supra`) della spalla (modelli/spalla-3d.html): estremità d'inserzione a U, simmetrica e arrotondata, invece
   dell'estremità obliqua con la punta spostata verso l'avanti.

   Uso (dalla cartella del progetto):
     node strumenti/rifinitura-supra-spalla.mjs                  → riscrive `supra` nel file del modello
     PROVA=1 node strumenti/rifinitura-supra-spalla.mjs          → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/rifinitura-supra-spalla.mjs   → lavora su una copia
   Va lanciato dopo `muscoli-spalla.mjs` e prima di `borsa-spalla.mjs` (la borsa poggia sul sovraspinato). Riparte dalle posizioni di `supra` della revisione
   `BASE` (stessa topologia), quindi si può rilanciare con lo stesso risultato; se si rilancia `muscoli-spalla.mjs` e cambia `supra`, aggiornare `BASE`.

   Metodo. Nella vista laterale (`VISTA`: theta, phi della camera della pagina) il tendine scende verso l'inserzione: u verso destra (avanti), v verso
   l'alto. Il contorno nuovo resta quello di prima sopra `V_ALTO` (cm sopra il punto più basso del tendine); sotto è una U: i due margini partono dai
   margini di prima a `V_ALTO` e scendono come una superellisse (esponente `ESP`: 2 = ellisse, di più = lati più diritti) fino al fondo, a quota `V_FONDO`,
   centrato tra i due margini. I vertici dell'estremità sono portati dal contorno vecchio al nuovo con una mappa radiale attorno al punto `O` (a metà
   larghezza, `O_SOPRA` sopra `V_ALTO`): lungo ogni direzione la distanza da O è scalata del rapporto tra contorno nuovo e vecchio (1 verso l'alto, dove
   il contorno non cambia), poi i vertici sono riportati alla distanza di prima dal centro della testa omerale (il tendine resta appoggiato). Infine
   levigatura dell'estremità (`LEV_PUNTA`) e del bordo lungo la sua curva (spigoli con diedro oltre `DIEDRO_BORDO`°, `LEV_BORDO`), appiattimento delle pieghe
   del bordo (`DIEDRO_PIEGA`, `PASSATE_PIEGA`), contenimento dei vertici rimasti fuori dalla U e distanza minima `GAP_OSSO` dall'omero. Normali di vertice
   (`nm`) ricalcolate sui vertici spostati e sui vicini. Controlli stampati: margini per quote prima e dopo, spostamento massimo.

   Estensione: la U finisce a metà della grande tuberosità (fondo a `V_FONDO` = 0,9 cm sopra il punto più basso di prima, `V_ALTO` = 2,2 cm: dove il tendine è
   più largo), cioè sulla sola faccetta superiore, dove si inserisce il sovraspinato; prima scendeva fino alla cresta sopra il collo chirurgico e copriva anche le
   faccette di sottospinato e piccolo rotondo. La spinta fuori dall'osso (`GAP_OSSO`) è alternata a una levigatura locale (`GIRI_GAP` giri di `LEV_GAP` passate
   sui vertici spinti e due-tre anelli di vicini): da sola lasciava un lembo appuntito all'angolo del solco bicipitale. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { vicini } = await import('./lib-bp3d.mjs');
const { REAL, posDaRevisione, setMesh, saveFile, repack, log, sstep } = G;

const BASE = 'fc755f7', NOME = 'supra';
const VISTA = [-1.0, 0.1], RAGGIO = 3.5, PROF = 1.5;                  // cm; PROF: si escludono i vertici più di PROF dietro il punto più basso (lungo la vista)
const V_ALTO = 2.2, V_FONDO = 0.9, ESP = 2.4, O_SOPRA = 0.3, BANDA = 0.05; // cm
const ACR = { c: [0.9, 2.55, -0.25], r0: 1.25, r1: 1.8 }, PASSATE_ACR = 150, PASSATE_ACR_FORTI = 20, DIEDRO_ACR = 70, GAP_ACR = 0.03, SPESS_ACR = 0.06, PIEGA_ACR = 0.1;   // sotto l'acromion (cm)
const GAP_OSSO = 0.05, GIRI_GAP = 8, LEV_GAP = 60, NBIN = 360, DIEDRO_PIEGA = 110, PASSATE_PIEGA = 40, LEV_PUNTA = 400, DIEDRO_BORDO = 95, LEV_BORDO = 200;

const { nv, idx } = REAL(NOME);
const pos0 = Float64Array.from(posDaRevisione(BASE, NOME, 'modelli/spalla-3d.html')), cur = pos0.slice();
const nb = vicini(nv, idx);
const cTesta = (() => { const p = REAL('cart_omero').pos, M = Array.from({ length: 4 }, () => new Float64Array(5));
  for (let i = 0; i < p.length; i += 3) { const r = [2 * p[i], 2 * p[i + 1], 2 * p[i + 2], 1], b = p[i] ** 2 + p[i + 1] ** 2 + p[i + 2] ** 2; for (let j = 0; j < 4; j++) { for (let k = 0; k < 4; k++) M[j][k] += r[j] * r[k]; M[j][4] += r[j] * b; } }
  for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r; [M[c], M[m]] = [M[m], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; } }
  return [0, 1, 2].map(j => M[j][4] / M[j][j]); })();

// sistema della vista: e1 (u) verso destra sullo schermo, e2 (v) verso l'alto, n verso la camera
const un = v => { const l = Math.hypot(...v); return v.map(x => x / l); }, [th, ph] = VISTA;
const n = un([Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)]), e2 = un([0, 1, 0].map((v, k) => v - n[1] * n[k])), e1 = [e2[1] * n[2] - e2[2] * n[1], e2[2] * n[0] - e2[0] * n[2], e2[0] * n[1] - e2[1] * n[0]];
let fondo = 0; { let mv = 1e9; for (let i = 0; i < nv; i++) { const v = cur[3 * i] * e2[0] + cur[3 * i + 1] * e2[1] + cur[3 * i + 2] * e2[2]; if (v < mv) { mv = v; fondo = i; } } }
const C = [0, 1, 2].map(k => cur[3 * fondo + k]);
const uv = (P, i) => { const p = [0, 1, 2].map(k => P[3 * i + k] - C[k]); return [p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]]; };
const sel = []; for (let i = 0; i < nv; i++) { const p = [0, 1, 2].map(k => cur[3 * i + k] - C[k]); if (Math.hypot(...p) < RAGGIO && p[0] * n[0] + p[1] * n[1] + p[2] * n[2] > -PROF) sel.push(i); }

// margini sinistro e destro per quote (v), dai vertici
const margini = (P, v0, v1) => { let lo = 1e9, hi = -1e9; for (const i of sel) { const [u, v] = uv(P, i); if (v >= v0 && v < v1) { lo = Math.min(lo, u); hi = Math.max(hi, u); } } return [lo, hi]; };
const stampa = (P, et) => { const r = []; for (let v = 3.2; v >= -0.01; v -= 0.2) { const [a, b] = margini(P, v - 0.05, v + 0.05); r.push(v.toFixed(1) + ':' + (a < 1e8 ? a.toFixed(2) + '…' + b.toFixed(2) : '-')); } log(et, 'margini sinistro…destro per quota v:', r.join(' ')); };
stampa(cur, 'prima');

// contorno nuovo: sopra V_ALTO quello di prima, sotto una U (superellisse) che parte dai margini di prima a V_ALTO
const [L0, R0] = margini(cur, V_ALTO - 0.05, V_ALTO + 0.05), cx = (L0 + R0) / 2, aL = cx - L0, aR = R0 - cx, b = V_ALTO - V_FONDO;
const O = [cx, V_ALTO + O_SOPRA];
const dentroU = (u, v) => { if (v < V_FONDO) return false; const t = (V_ALTO - v) / b, s = Math.pow(Math.max(0, 1 - Math.pow(t, ESP)), 1 / ESP); return u >= cx - aL * s && u <= cx + aR * s; };
// contorno di prima come funzione radiale attorno a O (massimo per settore angolare, levigato)
const Rold = new Float64Array(NBIN).fill(0), ang = (du, dv) => ((Math.atan2(dv, du) / (2 * Math.PI)) % 1 + 1) % 1;
for (const i of sel) { const [u, v] = uv(cur, i), du = u - O[0], dv = v - O[1], k = Math.floor(ang(du, dv) * NBIN) % NBIN; Rold[k] = Math.max(Rold[k], Math.hypot(du, dv)); }
// settori vuoti riempiti dai vicini, poi mediana su 5 settori: un vertice isolato non sposta il contorno
const Rv = (() => { const a = Float64Array.from(Rold); for (let k = 0; k < NBIN; k++) if (!a[k]) { let d = 1; while (d < NBIN / 2 && !Rold[(k + d) % NBIN] && !Rold[(k - d + NBIN) % NBIN]) d++; a[k] = Math.max(Rold[(k + d) % NBIN], Rold[(k - d + NBIN) % NBIN]); }
  return a.map((_, k) => { const w = []; for (let d = -2; d <= 2; d++) w.push(a[(k + d + NBIN) % NBIN]); return w.sort((x, y) => x - y)[2]; }); })();
// contorno nuovo lungo ogni direzione: si cammina dal centro finché si è dentro; sopra V_ALTO vale il contorno di prima
const Rnew = new Float64Array(NBIN);
for (let k = 0; k < NBIN; k++) { const a = (k + 0.5) / NBIN * 2 * Math.PI, du = Math.cos(a), dv = Math.sin(a); let r = 0;
  for (; r < 4; r += 0.005) { const u = O[0] + du * r, v = O[1] + dv * r; if (v >= V_ALTO) { if (r > Rv[k]) break; } else if (!dentroU(u, v)) break; }
  Rnew[k] = r; }
const scala = (du, dv) => { const x = ang(du, dv) * NBIN - 0.5, k0 = (Math.floor(x) + NBIN) % NBIN, k1 = (k0 + 1) % NBIN, f = x - Math.floor(x);
  const s0 = Rv[k0] > 1e-3 ? Rnew[k0] / Rv[k0] : 1, s1 = Rv[k1] > 1e-3 ? Rnew[k1] / Rv[k1] : 1; return s0 + (s1 - s0) * f; };
log('U: da quota', V_ALTO, 'margini', L0.toFixed(2), '…', R0.toFixed(2), '; fondo a', V_FONDO, 'centrato su u', cx.toFixed(2));

// mappa radiale, fascia morbida sul contorno nuovo, poi stessa distanza dal centro della testa
const mossi = []; let mxs = 0;
for (const i of sel) { const [u, v] = uv(cur, i), du = u - O[0], dv = v - O[1], r = Math.hypot(du, dv); if (r < 1e-6 || v > O[1]) continue;
  const k = Math.floor(ang(du, dv) * NBIN) % NBIN, s = scala(du, dv); let r1 = r * s;
  { const x = r1 - (Rnew[k] - BANDA); if (x > 0) r1 = Rnew[k] - BANDA + BANDA * (1 - Math.exp(-x / BANDA)); }
  const d = [du / r * (r1 - r), dv / r * (r1 - r)]; if (Math.hypot(...d) < 1e-5) continue;
  const r0 = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q]));
  for (let q = 0; q < 3; q++) cur[3 * i + q] += d[0] * e1[q] + d[1] * e2[q];
  const rr = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q]));
  for (let q = 0; q < 3; q++) cur[3 * i + q] = cTesta[q] + (cur[3 * i + q] - cTesta[q]) * r0 / rr;
  mossi.push(i); mxs = Math.max(mxs, Math.hypot(...d)); }
log('vertici spostati', mossi.length, ', nel piano della vista al massimo', (mxs * 10).toFixed(1), 'mm');

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
    const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b2 = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), m = [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]], l = Math.hypot(...m) || 1;
    nf.set(t, m.map(x => x / l)); for (let k = 0; k < 3; k++) { const x = T[k], y = T[(k + 1) % 3], key = Math.min(x, y) * nv + Math.max(x, y); (ef.get(key) || ef.set(key, []).get(key)).push(t); } }
  const bn = new Map(); for (const [key, L] of ef) if (L.length === 2) { const [p, q] = [nf.get(L[0]), nf.get(L[1])]; if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] < lim) { const a = Math.floor(key / nv), b2 = key % nv; (bn.get(a) || bn.set(a, []).get(a)).push(b2); (bn.get(b2) || bn.set(b2, []).get(b2)).push(a); } }
  const catena = [...bn].filter(([, L]) => L.length === 2);
  for (let it = 0; it < LEV_BORDO; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
    for (const [v, L] of catena) for (let k = 0; k < 3; k++) q[3 * v + k] += lam * ((cur[3 * L[0] + k] + cur[3 * L[1] + k]) / 2 - cur[3 * v + k]);
    cur.set(q); }
  const vic = new Set(); for (const v of bn.keys()) for (const j of nb[v]) if (!bn.has(j) && ins.has(j)) vic.add(j);
  for (let it = 0; it < 10; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
    for (const i of vic) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += lam * (s / L.length - cur[3 * i + k]); } }
    cur.set(q); }
  log('bordo dell\'estremità: vertici', bn.size, ', in catena', catena.length); }
// pieghe del bordo (la lamina compressa nell'angolo tolto si ripiega: spigoli con diedro oltre `DIEDRO_PIEGA`°): media dei vicini sui vertici della piega e su
// un anello (`PASSATE_PIEGA` giri); il contenimento che segue rimette il bordo sul contorno
{ const ins = new Set(zona), nf = new Map(), ef = new Map(), lim = Math.cos(DIEDRO_PIEGA * Math.PI / 180);
  for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.every(i => ins.has(i))) continue;
    const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b2 = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), m = [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]], l = Math.hypot(...m) || 1;
    nf.set(t, m.map(x => x / l)); for (let k = 0; k < 3; k++) { const x = T[k], y = T[(k + 1) % 3], key = Math.min(x, y) * nv + Math.max(x, y); (ef.get(key) || ef.set(key, []).get(key)).push(t); } }
  const pv = new Set(); for (const [key, L] of ef) if (L.length === 2) { const [p, q] = [nf.get(L[0]), nf.get(L[1])]; if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] < lim) { pv.add(Math.floor(key / nv)); pv.add(key % nv); } }
  const D = new Set(pv); for (const v of pv) for (const j of nb[v]) if (ins.has(j)) D.add(j);
  for (let it = 0; it < PASSATE_PIEGA; it++) { const q = cur.slice(); for (const i of D) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += 0.5 * (s / L.length - cur[3 * i + k]); } } cur.set(q); }
  log('pieghe del bordo: vertici', pv.size, '(con un anello', D.size + ')'); }
// contenimento: dopo le levigature, i vertici rimasti fuori dal contorno nuovo (lembi, punte) tornano sulla curva, poi raccordo dei vicini
{ const fuori = []; for (const i of sel) { const [u, v] = uv(cur, i), du = u - O[0], dv = v - O[1], r = Math.hypot(du, dv); if (r < 1e-6 || v > O[1]) continue;
    if (v > V_ALTO - 0.15) continue;   // sopra la U il contorno è quello di prima: non si tocca
    const k = Math.floor(ang(du, dv) * NBIN) % NBIN, R = Rnew[k]; if (r <= R - BANDA) continue;
    const r1 = R - BANDA + BANDA * (1 - Math.exp(-(r - (R - BANDA)) / BANDA)), d = [du / r * (r1 - r), dv / r * (r1 - r)];
    const r0 = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q]));
    for (let q = 0; q < 3; q++) cur[3 * i + q] += d[0] * e1[q] + d[1] * e2[q];
    const rr = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q])); for (let q = 0; q < 3; q++) cur[3 * i + q] = cTesta[q] + (cur[3 * i + q] - cTesta[q]) * r0 / rr;
    fuori.push(i); }
  const vic = new Set(); for (const i of fuori) for (const j of nb[i]) vic.add(j); for (const i of fuori) vic.delete(i);
  for (let it = 0; it < 10; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
    for (const i of vic) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += lam * (s / L.length - cur[3 * i + k]); } }
    cur.set(q); }
  log('contenimento: vertici riportati sul contorno', fuori.length); }
// sotto l'acromion: la lamina a due strati lasciata da `muscoli-spalla.mjs` ha punte e triangoli che si incrociano (dente di sega visibile dall'alto e di lato);
// levigatura di Taubin nella sfera `ACR` (peso pieno fino a r0, smoothstep fino a r1) per `PASSATE_ACR` giri, poi media semplice dei vertici con spigoli oltre
// `DIEDRO_ACR`° e dei loro vicini (`PASSATE_ACR_FORTI` giri), infine distanza minima `GAP_ACR` da acromion, clavicola, cartilagine e capsula
{ const wA = new Float64Array(nv), zA = [];
  for (let i = 0; i < nv; i++) { const d = Math.hypot(cur[3 * i] - ACR.c[0], cur[3 * i + 1] - ACR.c[1], cur[3 * i + 2] - ACR.c[2]); wA[i] = 1 - sstep(ACR.r0, ACR.r1, d); if (wA[i] > 0) zA.push(i); }
  const spigoli = () => { const ins = new Set(zA), nf = new Map(), ef = new Map(), lim = Math.cos(DIEDRO_ACR * Math.PI / 180), out = new Set();
    for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.every(i => ins.has(i))) continue;
      const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b2 = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), m = [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]], l = Math.hypot(...m) || 1;
      nf.set(t, m.map(x => x / l)); for (let k = 0; k < 3; k++) { const x = T[k], y = T[(k + 1) % 3], key = Math.min(x, y) * nv + Math.max(x, y); (ef.get(key) || ef.set(key, []).get(key)).push(t); } }
    for (const [key, L] of ef) if (L.length === 2) { const [p, q] = [nf.get(L[0]), nf.get(L[1])], c = p[0] * q[0] + p[1] * q[1] + p[2] * q[2]; if (c < lim && c > -0.97) { out.add(Math.floor(key / nv)); out.add(key % nv); } }
    return out; };
  const n0 = spigoli().size;
  for (let it = 0; it < PASSATE_ACR; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
    for (const i of zA) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += wA[i] * lam * (s / L.length - cur[3 * i + k]); } }
    cur.set(q); }
  for (let it = 0; it < PASSATE_ACR_FORTI; it++) { const pv = spigoli(), D = new Set(pv); for (const v of pv) for (const j of nb[v]) if (wA[j] > 0) D.add(j); if (!pv.size) break;
    const q = cur.slice(); for (const i of D) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += 0.5 * (s / L.length - cur[3 * i + k]); } } cur.set(q); }
  // strati che si incrociano: i vertici dello strato profondo (normale verso la testa) che lungo il raggio della testa stanno oltre lo strato superficiale
  // (meno di `SPESS_ACR` sotto) sono riportati sotto; il raggio dello strato superficiale si trova intersecando il raggio con i suoi triangoli
  const strati = () => { const nrm = new Float64Array(nv * 3), inZ = new Set(zA);
    for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(i => inZ.has(i))) continue;
      const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b2 = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), m = [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]];
      for (const i of T) for (let k = 0; k < 3; k++) nrm[3 * i + k] += m[k]; }
    const rad = i => { const d = [0, 1, 2].map(k => cur[3 * i + k] - cTesta[k]), l = Math.hypot(...d); return d.map(x => x / l); };
    const sup = [], prof = [];
    for (const i of zA) { const r = rad(i), n = [nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]], c = (n[0] * r[0] + n[1] * r[1] + n[2] * r[2]) / (Math.hypot(...n) || 1); if (c > 0.3) sup.push(i); else if (c < -0.3) prof.push(i); }
    const S = new Set(sup), tris = []; for (let t = 0; t < idx.length; t += 3) if (S.has(idx[t]) && S.has(idx[t + 1]) && S.has(idx[t + 2])) tris.push(t);
    let n = 0;
    for (const i of prof) { const o = cTesta, d = rad(i), r0 = Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - o[k])); let best = Infinity;
      for (const t of tris) { const A = [0, 1, 2].map(k => cur[3 * idx[t] + k]), B = [0, 1, 2].map(k => cur[3 * idx[t + 1] + k]), C = [0, 1, 2].map(k => cur[3 * idx[t + 2] + k]);
        const e1 = B.map((v, k) => v - A[k]), e2 = C.map((v, k) => v - A[k]), pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
        if (Math.abs(det) < 1e-12) continue; const tv = o.map((v, k) => v - A[k]), u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det; if (u < 0 || u > 1) continue;
        const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det; if (v < 0 || u + v > 1) continue;
        const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det; if (tt > 0 && Math.abs(tt - r0) < Math.abs(best - r0)) best = tt; }
      if (best < Infinity && r0 > best - SPESS_ACR && r0 < best + 0.3) { const r1 = best - SPESS_ACR; for (let k = 0; k < 3; k++) cur[3 * i + k] = o[k] + d[k] * r1; n++; } }
    return n; };
  { const ns = []; for (let g = 0; g < 4; g++) { ns.push(strati());
      for (let it = 0; it < 10; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
        for (const i of zA) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += wA[i] * lam * (s / L.length - cur[3 * i + k]); } }
        cur.set(q); } }
    ns.push(strati()); log('sotto l\'acromion: vertici dello strato profondo riportati sotto quello superficiale, per giro', ns.join(' ')); }
  // pieghe sottili sulla faccia superficiale (fessure chiare a bordo scuro): lungo i raggi verso il centro della testa, due facce affacciate (una dritta e una
  // rovescia) a meno di `PIEGA_ACR` cm, sopra i due strati della lamina, sono una piega; i loro vertici e due anelli sono mediati con i vicini (senza
  // compensazione, la piega si appiattisce) finché i raggi non ne trovano più
  const pieghe = () => { const inZ = new Set(zA), tris = []; for (let t = 0; t < idx.length; t += 3) if (inZ.has(idx[t]) && inZ.has(idx[t + 1]) && inZ.has(idx[t + 2])) tris.push(t);
    const h = new Map(), C = 0.1, key = (a, b) => a + ',' + b;
    // griglia in coordinate sferiche attorno alla testa per trovare i triangoli lungo un raggio
    const sph = p => { const d = [0, 1, 2].map(k => p[k] - cTesta[k]), r = Math.hypot(...d); return [Math.atan2(d[0], d[2]) * r, Math.asin(d[1] / r) * r]; };
    for (const t of tris) { const S = [0, 1, 2].map(j => sph([0, 1, 2].map(k => cur[3 * idx[t + j] + k]))); const lo = [0, 1].map(q => Math.floor(Math.min(...S.map(x => x[q])) / C)), hi = [0, 1].map(q => Math.floor(Math.max(...S.map(x => x[q])) / C));
      for (let a = lo[0]; a <= hi[0]; a++) for (let b2 = lo[1]; b2 <= hi[1]; b2++) (h.get(key(a, b2)) || h.set(key(a, b2), []).get(key(a, b2))).push(t); }
    const out = new Set();
    for (const i of zA) { const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d0 = [0, 1, 2].map(k => cTesta[k] - p[k]), l0 = Math.hypot(...d0), d = d0.map(x => x / l0), o = p.map((v, k) => v - d[k] * 1.0), sp = sph(p);
      const cand = h.get(key(Math.floor(sp[0] / C), Math.floor(sp[1] / C))) || [], hits = [];
      for (const t of cand) { const A = [0, 1, 2].map(k => cur[3 * idx[t] + k]), B = [0, 1, 2].map(k => cur[3 * idx[t + 1] + k]), Cc = [0, 1, 2].map(k => cur[3 * idx[t + 2] + k]);
        const e1 = B.map((v, k) => v - A[k]), e2 = Cc.map((v, k) => v - A[k]), pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
        if (Math.abs(det) < 1e-12) continue; const tv = o.map((v, k) => v - A[k]), u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det; if (u < 0 || u > 1) continue;
        const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]], v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det; if (v < 0 || u + v > 1) continue;
        const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det; if (tt <= 0) continue;
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; hits.push([tt, t, Math.sign(n[0] * d[0] + n[1] * d[1] + n[2] * d[2])]); }
      hits.sort((a, b2) => a[0] - b2[0]);
      if (hits.length >= 4 && hits[1][0] - hits[0][0] < PIEGA_ACR && hits[0][2] !== hits[1][2]) { out.add(hits[0][1]); out.add(hits[1][1]); } }
    return out; };
  { const ns = []; for (let g = 0; g < 15; g++) { const T = pieghe(); ns.push(T.size); if (!T.size) break;
      let D = new Set(); for (const t of T) for (let k = 0; k < 3; k++) D.add(idx[t + k]); for (let r = 0; r < 2; r++) { const E = new Set(D); for (const v of D) for (const j of nb[v]) if (wA[j] > 0) E.add(j); D = E; }
      for (let it = 0; it < 6; it++) { const q = cur.slice(); for (const i of D) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += 0.5 * (s / L.length - cur[3 * i + k]); } } cur.set(q); } }
    log('sotto l\'acromion: triangoli in pieghe sottili, per giro', ns.join(' ')); }
  // pieghe rovesciate (si vedeva l'interno della lamina, grigio, in fessure sottili): triangoli con la faccia rivolta al contrario dei tre vicini
  // rispetto al raggio della testa; i loro vertici e un anello sono mediati con i vicini finché non ne restano
  const rovesciati = () => { const inZ = new Set(zA), sg = new Map(), adj = new Map(), out = [];
    for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.every(i => inZ.has(i))) continue;
      const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b2 = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), m = [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]];
      const c = [0, 1, 2].map(q => (cur[3 * T[0] + q] + cur[3 * T[1] + q] + cur[3 * T[2] + q]) / 3 - cTesta[q]), d = (m[0] * c[0] + m[1] * c[1] + m[2] * c[2]) / ((Math.hypot(...m) || 1) * Math.hypot(...c));
      sg.set(t, d); for (let k = 0; k < 3; k++) { const x = T[k], y = T[(k + 1) % 3], key = Math.min(x, y) * nv + Math.max(x, y); (adj.get(key) || adj.set(key, []).get(key)).push(t); } }
    const vic = new Map(); for (const L of adj.values()) if (L.length === 2) { (vic.get(L[0]) || vic.set(L[0], []).get(L[0])).push(L[1]); (vic.get(L[1]) || vic.set(L[1], []).get(L[1])).push(L[0]); }
    for (const [t, d] of sg) { const V = vic.get(t) || []; if (V.length === 3 && V.every(u => sg.get(u) * d < 0 && Math.abs(sg.get(u)) > 0.2)) out.push(t); }
    return out; };
  { const r0 = rovesciati().length; let g = 0;
    for (; g < 40; g++) { const R = rovesciati(); if (!R.length) break; const D = new Set(); for (const t of R) for (let k = 0; k < 3; k++) { D.add(idx[t + k]); for (const j of nb[idx[t + k]]) D.add(j); }
      for (let it = 0; it < 3; it++) { const q = cur.slice(); for (const i of D) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += 0.5 * (s / L.length - cur[3 * i + k]); } } cur.set(q); } }
    log('sotto l\'acromion: triangoli rovesciati', r0, '→', rovesciati().length, 'in', g, 'giri'); }
  const lo = ACR.c.map(v => v - ACR.r1 - 0.3), hi = ACR.c.map(v => v + ACR.r1 + 0.3); G.griglia(lo, hi, 0.03, 0.1);
  const OST = ['scapola', 'clavicola', 'cart_omero', 'caps', 'omero'], Fo = G.esatta(G.sdf(G.unione(OST)).F, OST, 0.1); let spinti = 0;
  for (let r = 0; r < 3; r++) for (const i of zA) { const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d = G.sample(Fo, ...p); if (d >= GAP_ACR) continue;
    const g = G.grad(Fo, p), l = Math.hypot(...g) || 1; for (let k = 0; k < 3; k++) cur[3 * i + k] += g[k] / l * (GAP_ACR - d); if (!r) spinti++; }
  for (const i of zA) if (!zona.includes(i)) zona.push(i);
  log('sotto l\'acromion: vertici nella sfera', zA.length, '; vertici su spigoli vivi', n0, '→', spigoli().size, '; spinti fuori dagli ostacoli', spinti); }
// omero: i vertici a meno di `GAP_OSSO` dall'osso (l'estremità allargata scende sul trochite) sono spinti fuori lungo il gradiente della distanza
{ G.griglia(C.map(v => v - RAGGIO), C.map(v => v + RAGGIO), 0.03, 0.1);
  const F = G.esatta(G.sdf(G.unione(['omero'])).F, ['omero'], 0.1); let n0 = 0;
  const spingi = () => { const P = new Set();
    for (const i of zona) { const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d = G.sample(F, ...p); if (d >= GAP_OSSO) continue;
      const g = G.grad(F, p), l = Math.hypot(...g) || 1; for (let k = 0; k < 3; k++) cur[3 * i + k] += g[k] / l * (GAP_OSSO - d); P.add(i); }
    return P; };
  // la spinta sposta di colpo pochi vertici (lembi all'angolo del solco): spinta e levigatura locale dei vertici spinti e dei vicini si alternano (`GIRI_GAP`)
  for (let g = 0; g < GIRI_GAP; g++) { const P = spingi(); if (g === 0) n0 = P.size; if (!P.size) break;
    const R = new Set(P); for (let a = 0; a < 3; a++) for (const i of [...R]) for (const j of nb[i]) R.add(j);
    for (let it = 0; it < LEV_GAP; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
      for (const i of R) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += lam * (s / L.length - cur[3 * i + k]); } }
      cur.set(q); } }
  const resto = spingi();
  log('omero: vertici spinti fuori', n0, '; dopo levigatura ne restano', resto.size, 'a meno di', GAP_OSSO * 10, 'mm'); }
stampa(cur, 'dopo');
{ let mx = 0; for (const i of zona) mx = Math.max(mx, Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k]))); log('spostamento massimo', (mx * 10).toFixed(2), 'mm'); }

// normali di vertice: quelle già nel file, ricalcolate (media dei triangoli, pesata dall'area) sui vertici spostati e sui loro vicini
const m = G.man.meshes.findLast(x => x.n === NOME);
const nrm = m.nm !== undefined ? Int8Array.from(new Int8Array(G.buf0.buffer, G.buf0.byteOffset + m.nm, nv * 3)) : null;
if (nrm) { const toccati = new Set(zona); for (const i of zona) for (const j of nb[i]) toccati.add(j);
  const acc = new Map([...toccati].map(i => [i, [0, 0, 0]]));
  for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(i => acc.has(i))) continue;
    const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b2 = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), f = [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]];
    for (const i of T) if (acc.has(i)) for (let k = 0; k < 3; k++) acc.get(i)[k] += f[k]; }
  // segno: quello della maggioranza delle normali già scritte, uguale per tutti (il verso dei triangoli è coerente; con il segno vertice per vertice le pieghe
  // spianate sotto l'acromion restavano con normali rovesciate, fessure chiare a bordo scuro)
  let neg = 0; for (const [i, f] of acc) { const o = [0, 1, 2].map(k => nrm[3 * i + k]); if (o[0] * f[0] + o[1] * f[1] + o[2] * f[2] < 0) neg++; }
  const s = neg > acc.size / 2 ? -1 : 1;
  for (const [i, f] of acc) { const l = Math.hypot(...f) || 1;
    for (let k = 0; k < 3; k++) nrm[3 * i + k] = Math.round(127 * s * f[k] / l); } }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { const a = G.attrs(NOME); setMesh(NOME, { pos: Float32Array.from(cur), idx, tag: a.tag, fdir: a.fdir, nrm }); saveFile(repack()); }
