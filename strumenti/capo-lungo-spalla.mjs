/* Tendine del capo lungo del bicipite (`bic_lungo`) della spalla (modelli/spalla-3d.html): tratto intra-articolare rifatto come cordone rotondo che entra
   nella capsula, mantiene il calibro del solco e si assottiglia fino al tubercolo sopraglenoideo; profilo del tratto nel solco senza propaggini; colore
   di tendine dall'inserzione alla giunzione muscolo-tendinea; capsula sollevata sopra il tendine e, nel solco, come guaina; legamento trasverso
   dell'omero (`trasv_om`, struttura nuova) sopra il solco.

   Uso (dalla cartella del progetto):
     node strumenti/capo-lungo-spalla.mjs                  → riscrive `bic_lungo` (topologia nuova), `trasv_om` (mesh nuova), `caps` e
                                                             i legamenti `SOPRA_CAPS` (posizioni) nel file del modello
     PROVA=1 node strumenti/capo-lungo-spalla.mjs          → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/capo-lungo-spalla.mjs   → lavora su una copia
   Va lanciato dopo `rifinitura-subs-spalla.mjs` e prima di `borsa-spalla.mjs`. Riparte da `bic_lungo` (mesh completa) e dalle posizioni di `caps` e
   dei legamenti gleno-omerali e coraco-omerale della revisione `BASE`, quindi si può rilanciare con lo stesso risultato; se cambiano (si rilanciano
   `labbro-capsula-spalla.mjs`, `legamenti-spalla.mjs` o `muscoli-spalla.mjs`), aggiornare `BASE`.

   Metodo.
   1. Solco: per quote (y, passo 0,1 cm) centro della sezione levigato lungo il tendine; per ogni vertice tra `SOLCO` distanza dal centro nella sezione e
      settore angolare (`ANG` settori); raggio di riferimento = quantile `Q` dei vertici dello stesso settore entro `FINESTRA` cm di quota; i vertici oltre
      `TOL` volte il riferimento (la propaggine laterale a y ≈ −0,4 e le punte più piccole) sono riportati al riferimento, poi levigatura di Taubin locale.
      Pieghe rimaste fra `SOLCO[0]` e il taglio (triangoli che si attraversano, a y ≈ −0,65): media dei vicini su due anelli, al massimo `GIRI_PIEGHE` giri.
   2. Taglio: piano perpendicolare all'asse del solco (`ASSE_DA` cm sotto il taglio) a quota `Y_CUT` (uscita dal solco); si tolgono i triangoli con un
      vertice sopra il piano (il nastro piatto e sfrangiato di BodyParts3D) e resta un anello di bordo.
   3. Asse nuovo: curva di Hermite dall'uscita del solco (tangente = asse del solco) al tubercolo sopraglenoideo `E` (tra il punto più alto del labbro e il
      punto più vicino della scapola, a `INS`), ricampionata a passo `PASSO`, levigata (`GIRI`) con il vincolo di restare a raggio + `GAP` da testa omerale e cartilagine (campo di distanza;
      il vincolo sfuma negli ultimi `LIBERO` cm, dove il tendine si fonde con labbro e tubercolo).
   4. Sezione: ellisse con asse minore verso la testa (`PIATTO`), raggio uguale a quello del solco fino al `CALO[0]` della lunghezza, poi in calo fino a
      `FINE` volte all'inserzione; nei primi `RACCORDO` cm la sezione passa dalla forma dell'anello di bordo all'ellisse. Anelli di `N_ANG` vertici,
      calotta arrotondata all'estremità; anello di bordo spianato sul suo piano e cucito al primo anello (`STACCO` cm sopra) con una striscia di triangoli.
   5. Colore (tag): 200 (tendine) sopra `MT[1]`, sfumato su quello di prima fino a `MT[0]` (giunzione muscolo-tendinea, dove il capo lungo si allarga
      nel ventre); direzione delle fibre del tratto nuovo lungo l'asse.
   6. Capsula: i vertici a meno di raggio + `CAPS_GAP` dall'asse sono spinti fuori lungo il raggio della testa; lo spostamento è esteso ai vicini nello
      spazio con un raccordo morbido (`CAPS_R`), così le due facce della capsula si muovono insieme e il rilievo sopra il tendine è liscio. Lo stesso
      spostamento vale per i legamenti appoggiati sulla capsula (`SOPRA_CAPS`). Nei primi `USCITA` cm il tendine attraversa la capsula (uscita
      nel solco) e la capsula non si sposta. Nel solco, da `GUAINA_Y` al taglio, la capsula fa da guaina: i vertici a meno di `CAPS_GAP` dal tendine
      (campo di distanza della mesh nuova) vanno fuori lungo il raggio con lo stesso raccordo; la spinta si ripete (`GIRI_GUAINA`) sui vertici che il
      raccordo ha portato dentro il tendine.
   7. Legamento trasverso dell'omero (`trasv_om`): lamina sottile sopra il solco fra le quote `TL_Y`, da `TL_LAT` oltre il margine laterale del tendine
      (trochite) a `TL_MED` oltre quello mediale (trochine, bordo del sottoscapolare); margini del tendine sostituiti dalla retta dei minimi quadrati lungo
      il legamento, angoli arrotondati (`TL_ANGOLO`); `TL_RIGHE` × `TL_COL` colonne che scendono fino a `TL_GAP` da omero, tendine, sottoscapolare e
      capsula, faccia profonda = inviluppo convesso superiore, levigata fra le righe; spessore `TL_SPESS` che si assottiglia ai margini; fibre di traverso.
   Controlli stampati: vertici spostati nel solco, anello di bordo, lunghezza e raggi del tratto nuovo, distanza minima da testa e cartilagine,
   spostamento massimo della capsula, vertici della guaina, dislivello del legamento trasverso. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { vicini } = await import('./lib-bp3d.mjs');
const { REAL, setMesh, setPos, saveFile, repack, log, sstep } = G;

const BASE = 'fc755f7', NOME = 'bic_lungo', FILE_REPO = 'modelli/spalla-3d.html';
const SOLCO = [-4.6, 1.0], ANG = 24, FINESTRA = 0.4, Q = 0.75, TOL = 1.15, GIRI_PIEGHE = 10;   // cm
const Y_CUT = 1.1, ASSE_DA = 0.6, STACCO = 0.04;
const INS = 0.6;                                    // E = dal punto più alto del labbro verso il punto più vicino della scapola (tubercolo sopraglenoideo), a questa frazione
const PASSO = 0.05, GAP = 0.02, GIRI = 300, LIBERO = 0.5, ADERENZA = [0.3, 0.8], ADER_TOL = 0.02, USCITA_INS = 1.2;
const N_ANG = 20, CALO = [0.35, 1.0], FINE = 0.7, RACCORDO = 0.5, CALOTTA = 4;
const MT = [-7.0, -5.0];
const TL_Y = [-0.5, 0.25], TL_RIGHE = 25, TL_COL = 31, TL_LARGO = 1.2, TL_LAT = 0.2, TL_ANGOLO = 0.15, TL_MED = 0.12, TL_GAP = 0.03, TL_SPESS = 0.04;   // cm
const CAPS_GAP = 0.03, CAPS_R = 0.3, USCITA = 0.25, GUAINA_Y = 0.45, GIRI_GUAINA = 6, SOPRA_CAPS = ['sghl', 'mghl', 'coraco_om'];

const un = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const pt = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];

// centro della testa omerale (sfera ai minimi quadrati sulla cartilagine)
const cTesta = (() => { const p = REAL('cart_omero').pos, M = Array.from({ length: 4 }, () => new Float64Array(5));
  for (let i = 0; i < p.length; i += 3) { const r = [2 * p[i], 2 * p[i + 1], 2 * p[i + 2], 1], b = p[i] ** 2 + p[i + 1] ** 2 + p[i + 2] ** 2; for (let j = 0; j < 4; j++) { for (let k = 0; k < 4; k++) M[j][k] += r[j] * r[k]; M[j][4] += r[j] * b; } }
  for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r; [M[c], M[m]] = [M[m], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; } }
  return [0, 1, 2].map(j => M[j][4] / M[j][j]); })();
const radiale = p => un(sub(p, cTesta));

const R0 = G.realDaRevisione(BASE, NOME, FILE_REPO);
const pos = Float64Array.from(R0.pos), nv0 = pos.length / 3, tag0 = Uint8Array.from(R0.tag), fdir0 = Int8Array.from(R0.fdir);
let idx0 = Array.from(R0.idx);

// 1. solco: centro della sezione per quote, levigato
const quote = [], centri = [];
for (let y = SOLCO[0] - 0.3; y <= Y_CUT + 0.15; y += 0.1) { let n = 0; const c = [0, 0, 0];
  for (let i = 0; i < nv0; i++) if (Math.abs(pos[3 * i + 1] - y) < 0.05) { n++; for (let k = 0; k < 3; k++) c[k] += pos[3 * i + k]; }
  if (n) { quote.push(y); centri.push(mul(c, 1 / n)); } }
const centriL = centri.map((_, j) => { const w = []; for (let d = -2; d <= 2; d++) w.push(centri[Math.min(centri.length - 1, Math.max(0, j + d))]); return mul(w.reduce(add), 1 / w.length); });
const centro = y => { let j = 0; while (j < quote.length - 2 && quote[j + 1] < y) j++; const f = Math.min(1, Math.max(0, (y - quote[j]) / (quote[j + 1] - quote[j]))); return add(mul(centriL[j], 1 - f), mul(centriL[j + 1], f)); };
{ const sel = [], info = new Map();
  for (let i = 0; i < nv0; i++) { const y = pos[3 * i + 1]; if (y < SOLCO[0] || y > SOLCO[1]) continue; const c = centro(y), dx = pos[3 * i] - c[0], dz = pos[3 * i + 2] - c[2];
    sel.push(i); info.set(i, { y, r: Math.hypot(dx, dz), a: Math.floor(((Math.atan2(dz, dx) / (2 * Math.PI)) % 1 + 1) % 1 * ANG) % ANG, dx, dz, c }); }
  const mossi = [];
  for (const i of sel) { const I = info.get(i), rs = [];
    for (const j of sel) { const J = info.get(j); if (J.a === I.a && Math.abs(J.y - I.y) < FINESTRA) rs.push(J.r); }
    rs.sort((a, b) => a - b); const ref = rs[Math.floor(Q * (rs.length - 1))];
    if (I.r > TOL * ref) { const s = ref / I.r; pos[3 * i] = I.c[0] + I.dx * s; pos[3 * i + 2] = I.c[2] + I.dz * s; mossi.push(i); } }
  const nb = vicini(nv0, idx0), zona = new Set(mossi); for (const i of mossi) for (const j of nb[i]) { zona.add(j); for (const k of nb[j]) zona.add(k); }
  for (let it = 0; it < 12; it++) { const lam = it % 2 ? -0.53 : 0.5, q = pos.slice();
    for (const i of zona) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += pos[3 * j + k]; q[3 * i + k] += lam * (s / L.length - pos[3 * i + k]); } }
    pos.set(q); }
  log('solco: vertici riportati sul profilo', mossi.length, '(quote', [...new Set(mossi.map(i => info.get(i).y.toFixed(1)))].join(' ') + ')'); }
// pieghe nel solco (triangoli del tendine che si attraversano, fra `SOLCO[0]` e il taglio): media dei vicini sui loro vertici e su due anelli, finché non
// ne restano (al massimo `GIRI_PIEGHE` volte)
{ const nb = vicini(nv0, idx0), V = t => [0, 1, 2].map(k => pt(pos, idx0[t + k])), dentro = i => pos[3 * i + 1] >= SOLCO[0] && pos[3 * i + 1] <= Y_CUT;
  const seg = (p, q, [a, b, c]) => { const e1 = sub(b, a), e2 = sub(c, a), d = sub(q, p), pv = cross(d, e2), det = dot(e1, pv); if (Math.abs(det) < 1e-12) return false;
    const s = sub(p, a), u = dot(s, pv) / det; if (u < 0 || u > 1) return false; const qv = cross(s, e1), v = dot(d, qv) / det; if (v < 0 || u + v > 1) return false; const t = dot(e2, qv) / det; return t > 0 && t < 1; };
  const pieghe = () => { const T = []; for (let t = 0; t < idx0.length; t += 3) if (dentro(idx0[t]) && dentro(idx0[t + 1]) && dentro(idx0[t + 2])) T.push(t);
    const h = new Map(); for (const t of T) { const kk = mul(V(t).reduce(add), 1 / 3).map(x => Math.floor(x / 0.1)).join(); (h.get(kk) || h.set(kk, []).get(kk)).push(t); }
    const out = new Set();
    for (const [kk, L] of h) { const [a, b, c] = kk.split(',').map(Number), M = []; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) M.push(...(h.get([a + x, b + y, c + z].join()) || []));
      for (const s of L) { const A = V(s), va = [0, 1, 2].map(k => idx0[s + k]); for (const t of M) { if (t <= s || [0, 1, 2].some(k => va.includes(idx0[t + k]))) continue;
        const B = V(t); let o = false; for (let e = 0; e < 3 && !o; e++) o = seg(A[e], A[(e + 1) % 3], B) || seg(B[e], B[(e + 1) % 3], A); if (o) for (let k = 0; k < 3; k++) { out.add(idx0[s + k]); out.add(idx0[t + k]); } } } }
    return out; };
  let P = pieghe(); const n0 = P.size; let g = 0;
  for (; g < GIRI_PIEGHE && P.size; g++) { const D = new Set(P); for (let r = 0; r < 2; r++) for (const v of [...D]) for (const j of nb[v]) D.add(j);
    for (let it = 0; it < 6; it++) { const q = pos.slice(); for (const i of D) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += pos[3 * j + k]; q[3 * i + k] += 0.5 * (s / L.length - pos[3 * i + k]); } } pos.set(q); }
    P = pieghe(); }
  log('solco, pieghe: vertici', n0, '→', P.size, 'dopo', g, 'giri'); }

// 2. taglio all'uscita dal solco
const S = centro(Y_CUT), T0 = un(sub(S, centro(Y_CUT - ASSE_DA)));
const sopra = i => dot(sub(pt(pos, i), S), T0) > 0;
{ const keep = []; for (let t = 0; t < idx0.length; t += 3) if (!sopra(idx0[t]) && !sopra(idx0[t + 1]) && !sopra(idx0[t + 2])) keep.push(idx0[t], idx0[t + 1], idx0[t + 2]);
  log('taglio: triangoli tolti', (idx0.length - keep.length) / 3); idx0 = keep; }
// vertici usati, compattati
const usato = new Int32Array(nv0).fill(-1); let nv = 0; { const u = new Uint8Array(nv0); for (const i of idx0) u[i] = 1; for (let i = 0; i < nv0; i++) if (u[i]) usato[i] = nv++; }
const P = [], TAG = [], FD = []; for (let i = 0; i < nv0; i++) if (usato[i] >= 0) { P.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); TAG.push(tag0[i]); FD.push(fdir0[3 * i], fdir0[3 * i + 1], fdir0[3 * i + 2]); }
const I = idx0.map(i => usato[i]);
// anello di bordo: lati che compaiono una volta sola, nel verso dei triangoli
const lati = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], k = Math.min(a, b) + ',' + Math.max(a, b); lati.set(k, (lati.get(k) || 0) + 1); }
const dopo = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; if (lati.get(Math.min(a, b) + ',' + Math.max(a, b)) === 1) dopo.set(a, b); }
const anelli = []; { const visti = new Set(); for (const a of dopo.keys()) { if (visti.has(a)) continue; const L = []; let v = a; while (!visti.has(v) && dopo.has(v)) { visti.add(v); L.push(v); v = dopo.get(v); } anelli.push(L); } }
// (la mesh ha già anelli aperti al ritaglio in basso, y = −14: si prende quello più vicino al taglio)
const dTaglio = L => Math.hypot(...sub(mul(L.reduce((c, i) => add(c, pt(P, i)), [0, 0, 0]), 1 / L.length), S));
anelli.sort((a, b) => dTaglio(a) - dTaglio(b));
const loop = anelli[0];
log('anello di bordo:', loop.length, 'vertici, a', (dTaglio(loop) * 10).toFixed(2), 'mm dal centro del taglio; altri anelli', anelli.slice(1).map(a => a.length).join(',') || 'nessuno');

// 3. asse nuovo
const Lab = REAL('labbro'); let top = 0; for (let i = 0; i < Lab.nv; i++) if (Lab.pos[3 * i + 1] > Lab.pos[3 * top + 1]) top = i;
const Ltop = pt(Lab.pos, top), Sc = REAL('scapola'); let sv = 0, sd = 1e9;
for (let i = 0; i < Sc.nv; i++) { const d = Math.hypot(...sub(pt(Sc.pos, i), Ltop)); if (d < sd) { sd = d; sv = i; } }
const E = add(Ltop, mul(sub(pt(Sc.pos, sv), Ltop), INS));
log('inserzione: labbro', Ltop.map(v => v.toFixed(2)).join(','), '→ scapola a', (sd * 10).toFixed(1), 'mm; E', E.map(v => v.toFixed(2)).join(','));
// bordo del taglio spianato: i vertici dell'anello sono portati sul piano per il loro centro (perpendicolare all'asse del solco), il primo anello
// del tratto nuovo parte `STACCO` cm sopra: la striscia di cucitura è corta e regolare
const Lc = mul(loop.reduce((c, i) => add(c, pt(P, i)), [0, 0, 0]), 1 / loop.length);
for (const i of loop) { const p = pt(P, i), h = dot(sub(p, Lc), T0); for (let k = 0; k < 3; k++) P[3 * i + k] -= T0[k] * h; }
const P0 = add(Lc, mul(T0, STACCO));
const dS = radiale(P0), dE = radiale(E), T1 = un(sub(mul(dE, dot(dS, dE)), dS));
const corda = Math.hypot(...sub(E, P0));
let asse = []; for (let k = 0; k <= 200; k++) { const s = k / 200, h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
  asse.push(add(add(mul(P0, h00), mul(T0, h10 * corda)), add(mul(E, h01), mul(T1, h11 * corda)))); }
const ricampiona = A => { const l = [0]; for (let k = 1; k < A.length; k++) l.push(l[k - 1] + Math.hypot(...sub(A[k], A[k - 1]))); const L = l.at(-1), n = Math.max(8, Math.round(L / PASSO)), out = [];
  for (let j = 0, k = 0; j <= n; j++) { const t = L * j / n; while (k < A.length - 2 && l[k + 1] < t) k++; const f = (t - l[k]) / (l[k + 1] - l[k] || 1); out.push(add(mul(A[k], 1 - f), mul(A[k + 1], f))); } return out; };
const lunghezze = A => { const l = [0]; for (let k = 1; k < A.length; k++) l.push(l[k - 1] + Math.hypot(...sub(A[k], A[k - 1]))); return l; };
// raggio dell'anello di bordo e profilo del raggio
const n0 = un(sub(dS, mul(T0, dot(dS, T0)))), b0 = cross(T0, n0);
const angoloIn = (p, c, b, n) => { const d = sub(p, c); return Math.atan2(dot(d, n), dot(d, b)); };
const rBordo = (() => { const v = loop.map(i => { const p = pt(P, i), d = sub(p, P0), q = sub(d, mul(T0, dot(d, T0))); return [Math.atan2(dot(q, n0), dot(q, b0)), Math.hypot(...q)]; }).sort((a, b) => a[0] - b[0]);
  return th => { let j = v.findIndex(x => x[0] > th); if (j < 0) j = 0; const a = v[(j - 1 + v.length) % v.length], b = v[j]; let da = th - a[0], db = b[0] - a[0]; if (db <= 0) db += 2 * Math.PI; if (da < 0) da += 2 * Math.PI; const f = Math.min(1, da / db); return a[1] * (1 - f) + b[1] * f; }; })();
// semiassi della sezione del solco: di traverso (a0) e verso la testa (c0)
const a0 = (rBordo(0) + rBordo(Math.PI - 1e-6)) / 2, c0 = (rBordo(Math.PI / 2) + rBordo(-Math.PI / 2)) / 2;
const calo = s => 1 - (1 - FINE) * sstep(CALO[0], CALO[1], s), raggio = s => a0 * calo(s), spess = s => c0 * calo(s);
// campo di distanza da testa e cartilagine
{ const lo = [0, 1, 2].map(k => Math.min(P0[k], E[k], cTesta[k] - 2.6)), hi = [0, 1, 2].map(k => Math.max(P0[k], E[k], cTesta[k] + 2.6));
  G.griglia(lo, hi, 0.03, 0.3); }
const F = G.esatta(G.sdf(G.unione(['omero', 'cart_omero'])).F, ['omero', 'cart_omero'], 0.1);
asse = ricampiona(asse);
for (let g = 0; g < GIRI; g++) {
  const l = lunghezze(asse), L = l.at(-1), q = asse.map(p => p.slice());
  for (let k = 2; k < asse.length - 1; k++) for (let c = 0; c < 3; c++) q[k][c] = asse[k][c] + 0.5 * ((asse[k - 1][c] + asse[k + 1][c]) / 2 - asse[k][c]);
  q[1] = add(P0, mul(T0, l[1]));
  for (let k = 2; k < q.length - 1; k++) { const s = l[k] / L, w = 1 - sstep(L - LIBERO, L, l[k]); if (w <= 0) continue;
    const need = (spess(s) + GAP) * w, d = G.sample(F, ...q[k]), gr = un(G.grad(F, q[k]));
    if (d < need) { q[k] = add(q[k], mul(gr, need - d)); continue; }
    // aderenza: nel tratto centrale il tendine resta appoggiato sulla testa (non scavalca in alto)
    const wa = sstep(ADERENZA[0], ADERENZA[1], l[k]) * (1 - sstep(L - LIBERO - USCITA_INS, L - LIBERO, l[k]));
    if (wa > 0 && d > need + ADER_TOL) q[k] = add(q[k], mul(gr, -0.3 * wa * (d - need - ADER_TOL))); }
  asse = g % 20 === 19 ? ricampiona(q) : q;
}
asse = ricampiona(asse);
const lA = lunghezze(asse), LA = lA.at(-1);
{ let mn = 1e9; for (let k = 2; k < asse.length; k++) { if (lA[k] > LA - LIBERO) break; const s = lA[k] / LA; mn = Math.min(mn, G.sample(F, ...asse[k]) - spess(s)); }
  log('asse nuovo: lunghezza', LA.toFixed(2), 'cm,', asse.length, 'anelli; semiassi', (a0 * 10).toFixed(2), '×', (c0 * 10).toFixed(2), '→', (raggio(1) * 10).toFixed(2), '×', (spess(1) * 10).toFixed(2), 'mm; distanza minima della superficie da testa e cartilagine', (mn * 10).toFixed(2), 'mm'); }

// 4. anelli
const Tg = asse.map((_, k) => un(k === 0 ? T0 : k === asse.length - 1 ? sub(asse[k], asse[k - 1]) : sub(asse[k + 1], asse[k - 1])));
const fr = asse.map((p, k) => { const n = un(sub(radiale(p), mul(Tg[k], dot(radiale(p), Tg[k])))); return { n, b: cross(Tg[k], n) }; });
const sezione = (k, th) => { const s = lA[k] / LA, a = raggio(s), c = spess(s), el = 1 / Math.hypot(Math.cos(th) / a, Math.sin(th) / c), w = sstep(0, RACCORDO, lA[k]);
  return (1 - w) * rBordo(th) + w * el; };
const base = P.length / 3, NP = [];
const anello = [];
for (let k = 0; k < asse.length; k++) { const row = []; for (let j = 0; j < N_ANG; j++) { const th = -Math.PI + 2 * Math.PI * j / N_ANG, r = sezione(k, th), d = add(mul(fr[k].b, Math.cos(th)), mul(fr[k].n, Math.sin(th)));
  row.push(base + NP.length / 3); NP.push(...add(asse[k], mul(d, r))); } anello.push(row); }
// calotta: anelli che si stringono, poi la punta
{ const k = asse.length - 1, T = Tg[k], rr = Math.max(raggio(1), spess(1));
  for (let c = 1; c <= CALOTTA; c++) { const f = c / (CALOTTA + 1) * Math.PI / 2, row = [];
    for (let j = 0; j < N_ANG; j++) { const th = -Math.PI + 2 * Math.PI * j / N_ANG, r = sezione(k, th) * Math.cos(f), d = add(mul(fr[k].b, Math.cos(th)), mul(fr[k].n, Math.sin(th)));
      row.push(base + NP.length / 3); NP.push(...add(add(asse[k], mul(T, rr * Math.sin(f))), mul(d, r))); } anello.push(row); }
  var punta = base + NP.length / 3; NP.push(...add(asse[k], mul(T, rr))); }
const NT = [];
for (let k = 0; k < anello.length - 1; k++) for (let j = 0; j < N_ANG; j++) { const a = anello[k][j], b = anello[k][(j + 1) % N_ANG], c = anello[k + 1][j], d = anello[k + 1][(j + 1) % N_ANG]; NT.push(a, c, d, a, d, b); }
const ultimo = anello.at(-1), FAN = []; for (let j = 0; j < N_ANG; j++) FAN.push(ultimo[j], punta, ultimo[(j + 1) % N_ANG]);
// cucitura anello di bordo ↔ primo anello: stesso verso angolare, partenza allineata, poi diagonale più corta
const thLoop = loop.map(i => angoloIn(pt(P, i), P0, b0, n0));
let senso = 0; for (let j = 0; j < loop.length; j++) { let d = thLoop[(j + 1) % loop.length] - thLoop[j]; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; senso += d; }
const Lp = senso > 0 ? loop.slice() : loop.slice().reverse(), thL = Lp.map(i => angoloIn(pt(P, i), P0, b0, n0));
const allP = i => i < base ? pt(P, i) : pt(NP, i - base);
let s0 = 0; for (let j = 1; j < Lp.length; j++) if (Math.abs(Math.atan2(Math.sin(thL[j] + Math.PI), Math.cos(thL[j] + Math.PI))) < Math.abs(Math.atan2(Math.sin(thL[s0] + Math.PI), Math.cos(thL[s0] + Math.PI)))) s0 = j;
const Lr = Lp.slice(s0).concat(Lp.slice(0, s0)), R = anello[0], ZIP = [];
{ let i = 0, j = 0; const M = Lr.length, N = R.length;
  while (i < M || j < N) { const a = Lr[i % M], b = Lr[(i + 1) % M], c = R[j % N], d = R[(j + 1) % N];
    const avL = i < M && (j >= N || Math.hypot(...sub(allP(b), allP(c))) < Math.hypot(...sub(allP(a), allP(d))));
    if (avL) { ZIP.push(a, b, c); i++; } else { ZIP.push(a, d, c); j++; } } }
// versi coerenti: un lato condiviso deve comparire nei due triangoli con versi opposti
const versi = T => { const s = new Set(); for (let t = 0; t < T.length; t += 3) for (let e = 0; e < 3; e++) s.add(T[t + e] + '>' + T[t + (e + 1) % 3]); return s; };
const gira = T => { for (let t = 0; t < T.length; t += 3) [T[t + 1], T[t + 2]] = [T[t + 2], T[t + 1]]; };
const conflitti = (A, B) => { const s = versi(A); let n = 0; for (let t = 0; t < B.length; t += 3) for (let e = 0; e < 3; e++) if (s.has(B[t + e] + '>' + B[t + (e + 1) % 3])) n++; return n; };
if (conflitti(I, ZIP) > 0) gira(ZIP);
if (conflitti(ZIP, NT) > 0) gira(NT);
if (conflitti(NT, FAN) > 0) gira(FAN);
log('cucitura:', ZIP.length / 3, 'triangoli; versi in conflitto', conflitti(I, ZIP), conflitti(ZIP, NT), conflitti(NT, FAN));
const pos1 = Float64Array.from([...P, ...NP]), idx1 = Uint32Array.from([...I, ...ZIP, ...NT, ...FAN]), nv1 = pos1.length / 3;
// levigatura leggera della cucitura (anello di bordo e primo anello)
{ const nb = vicini(nv1, idx1), zona = new Set(loop); for (const i of anello[0]) zona.add(i);
  for (let it = 0; it < 6; it++) { const lam = it % 2 ? -0.53 : 0.5, q = pos1.slice();
    for (const i of zona) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += pos1[3 * j + k]; q[3 * i + k] += lam * (s / L.length - pos1[3 * i + k]); } }
    pos1.set(q); } }

// 5. tag e direzione delle fibre
const tag1 = new Uint8Array(nv1), fdir1 = new Int8Array(nv1 * 3);
for (let i = 0; i < base; i++) { const t = TAG[i]; tag1[i] = t >= 250 ? t : Math.max(t, Math.round(200 * sstep(MT[0], MT[1], pos1[3 * i + 1]))); for (let k = 0; k < 3; k++) fdir1[3 * i + k] = FD[3 * i + k]; }
{ const kOf = new Int32Array(nv1 - base); anello.forEach((row, k) => row.forEach(i => kOf[i - base] = Math.min(k, asse.length - 1))); kOf[punta - base] = asse.length - 1;
  for (let i = base; i < nv1; i++) { tag1[i] = 200; const T = Tg[kOf[i - base]]; for (let k = 0; k < 3; k++) fdir1[3 * i + k] = Math.round(127 * T[k]); } }

// 6. capsula e legamenti appoggiati: spostamento lungo il raggio della testa
const lontano = p => { let best = 1e9, kb = 0; for (let k = 0; k < asse.length; k++) { const d = (p[0] - asse[k][0]) ** 2 + (p[1] - asse[k][1]) ** 2 + (p[2] - asse[k][2]) ** 2; if (d < best) { best = d; kb = k; } }
  const th = angoloIn(p, asse[kb], fr[kb].b, fr[kb].n), d = sub(p, asse[kb]), q = sub(d, mul(Tg[kb], dot(d, Tg[kb])));
  return { k: kb, d: Math.hypot(...q), r: sezione(kb, th) }; };
const capsPos = Float64Array.from(G.posDaRevisione(BASE, 'caps', FILE_REPO)), ncv = capsPos.length / 3, req = new Float64Array(ncv);
for (let i = 0; i < ncv; i++) { const p = pt(capsPos, i), L = lontano(p); if (lA[L.k] < USCITA || L.d > L.r + CAPS_GAP + 0.3) continue;
  const w = sstep(USCITA, USCITA + 0.25, lA[L.k]); if (L.d >= L.r + CAPS_GAP) continue;
  const rd = radiale(p); let t = 0; for (; t < 0.8; t += 0.005) { const M = lontano(add(p, mul(rd, t))); if (M.d >= M.r + CAPS_GAP) break; } req[i] = t * w; }
// nel solco (sotto il taglio, fino a `GUAINA_Y`) la capsula fa da guaina al tendine: vicino alla vecchia parte del tendine si usa il campo di distanza della
// mesh nuova (stessa regola: fuori lungo il raggio finché è ad almeno `CAPS_GAP`)
setMesh(NOME, { pos: Float32Array.from(pos1), idx: idx1, tag: tag1, fdir: fdir1 });
let Fb = null;
{ const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < nv1; i++) { const p = pt(pos1, i); if (p[1] < GUAINA_Y - 0.3 || p[1] > Y_CUT + 0.3) continue; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }
  G.griglia(lo, hi, 0.02, 0.6); Fb = G.esatta(G.sdf(G.unione([NOME])).F, [NOME], 0.1); let n = 0;
  for (let i = 0; i < ncv; i++) { const p = pt(capsPos, i); if (p[1] < GUAINA_Y || p[1] > Y_CUT + 0.1 || req[i] > 0 || G.sample(Fb, ...p) >= CAPS_GAP) continue;
    const rd = radiale(p); let t = 0; for (; t < 0.8; t += 0.005) if (G.sample(Fb, ...add(p, mul(rd, t))) >= CAPS_GAP) break; req[i] = t; n++; }
  log('capsula come guaina nel solco: vertici', n); }
// estensione nello spazio con raccordo morbido: delta(p) = max_j req_j · (1 − sstep(0, CAPS_R, |p − p_j|))
const fonti = []; for (let i = 0; i < ncv; i++) if (req[i] > 0) fonti.push([pt(capsPos, i), req[i]]);
const delta = p => { let m = 0; for (const [q, r] of fonti) { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < CAPS_R) m = Math.max(m, r * (1 - sstep(0, CAPS_R, d))); } return m; };
const sposta = A => { let mx = 0; for (let i = 0; i < A.length / 3; i++) { const p = pt(A, i), d = delta(p); if (d <= 0) continue; const rd = radiale(p); for (let k = 0; k < 3; k++) A[3 * i + k] += rd[k] * d; mx = Math.max(mx, d); } return mx; };
const mxCaps = sposta(capsPos);
// il raccordo può portare dentro il tendine vertici della guaina che prima ne erano fuori (dove il raggio lo prende di taglio): nel solco si ripete la spinta
// sui vertici ancora a meno di `CAPS_GAP`, con raccordo `CAPS_R`, fino a `GIRI_GUAINA` volte
for (let giro = 0; giro < GIRI_GUAINA; giro++) { const f2 = [];
  for (let i = 0; i < ncv; i++) { const p = pt(capsPos, i); if (p[1] < GUAINA_Y || p[1] > Y_CUT + 0.1 || G.sample(Fb, ...p) >= CAPS_GAP) continue;
    const rd = radiale(p); let t = 0; for (; t < 0.8; t += 0.005) if (G.sample(Fb, ...add(p, mul(rd, t))) >= CAPS_GAP) break; f2.push([p, t]); }
  if (!f2.length) break; log('guaina, giro', giro + 1, ': vertici', f2.length);
  for (let i = 0; i < ncv; i++) { const p = pt(capsPos, i); let m = 0; for (const [q, r] of f2) { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < CAPS_R) m = Math.max(m, r * (1 - sstep(0, CAPS_R, d))); }
    if (m > 0) { const rd = radiale(p); for (let k = 0; k < 3; k++) capsPos[3 * i + k] += rd[k] * m; } } }
log('capsula: vertici sopra il tendine', fonti.length, '; spostamento massimo', (mxCaps * 10).toFixed(2), 'mm');
const legPos = {}; for (const n of SOPRA_CAPS) { legPos[n] = Float64Array.from(G.posDaRevisione(BASE, n, FILE_REPO)); log(n + ': spostamento massimo', (sposta(legPos[n]) * 10).toFixed(2), 'mm'); }

// 7. legamento trasverso dell'omero (`trasv_om`): lamina sottile sopra il solco, tra trochine e trochite, fra le quote `TL_Y`. Per righe lungo il solco
// (`TL_RIGHE`) e colonne di traverso (`TL_COL`, dal trochite `TL_LAT` oltre il margine laterale del tendine fino a `TL_MED` oltre quello mediale, sul
// bordo del sottoscapolare): direzione «fuori» = dal centro della sezione dell'omero al tendine; lungo ogni colonna si
// scende da fuori fino a `TL_GAP` da omero, tendine e sottoscapolare (campo di distanza); la faccia profonda è l'inviluppo convesso superiore di questi punti
// (lamina tesa da un labbro all'altro sopra il tendine), levigata fra le righe; spessore `TL_SPESS`, che si assottiglia ai margini. Fibre di traverso.
setPos('caps', Float32Array.from(capsPos));
const trasv = (() => {
  const Om = REAL('omero'), sezOm = y => { let n = 0; const c = [0, 0, 0]; for (let i = 0; i < Om.nv; i++) if (Math.abs(Om.pos[3 * i + 1] - y) < 0.08) { n++; for (let k = 0; k < 3; k++) c[k] += Om.pos[3 * i + k]; } return mul(c, 1 / n); };
  const c0 = centro(TL_Y[0]), c1 = centro(TL_Y[1]);
  G.griglia([0, 1, 2].map(k => Math.min(c0[k], c1[k]) - TL_LARGO), [0, 1, 2].map(k => Math.max(c0[k], c1[k]) + TL_LARGO), 0.02, 0.2);
  const OST = ['omero', NOME, 'subs', 'caps'], Ft = G.esatta(G.sdf(G.unione(OST)).F, OST, 0.08);
  const righe = [], base = [];
  for (let r = 0; r < TL_RIGHE; r++) { const y = TL_Y[0] + (TL_Y[1] - TL_Y[0]) * r / (TL_RIGHE - 1), c = centro(y), T = un(sub(centro(y + 0.1), centro(y - 0.1)));
    let o = sub(c, sezOm(y)); o = un(sub(o, mul(T, dot(o, T)))); let sx = cross(T, o);
    // margini del tendine nella riga e lato del sottoscapolare: la lamina va da `TL_MED` oltre il margine verso il sottoscapolare (si appoggia sul suo bordo)
    // a `TL_LAT` oltre il margine opposto, sul trochite
    let xa = Infinity, xb = -Infinity; for (let i = 0; i < nv1; i++) { const p = pt(pos1, i); if (Math.abs(dot(sub(p, c), T)) > 0.04) continue; const x = dot(sub(p, c), sx); if (Math.abs(x) < 0.5) { xa = Math.min(xa, x); xb = Math.max(xb, x); } }
    let ms = 0; { const Sb = REAL('subs'); for (let i = 0; i < Sb.nv; i++) { const p = pt(Sb.pos, i), d = sub(p, c); if (Math.abs(dot(d, T)) < 0.1 && Math.hypot(...d) < 0.8) ms += Math.sign(dot(d, sx)); } }
    if (ms < 0) { sx = mul(sx, -1); [xa, xb] = [-xb, -xa]; }          // sx verso il sottoscapolare: x crescente = medialmente
    base.push({ c, o, sx, T, xa, xb }); }
  // margini diritti: i margini del tendine riga per riga sono sostituiti dalla retta dei minimi quadrati lungo il legamento (niente bordi ondulati)
  const retta = k => { const n = base.length, mr = (n - 1) / 2, mv = base.reduce((a, b) => a + b[k], 0) / n; let sxy = 0, sxx = 0; base.forEach((b, r) => { sxy += (r - mr) * (b[k] - mv); sxx += (r - mr) ** 2; }); return r => mv + sxy / sxx * (r - mr); };
  const XA = retta('xa'), XB = retta('xb');
  for (let r = 0; r < TL_RIGHE; r++) { const { c, o, sx, T } = base[r], xa = XA(r), xb = XB(r), pts = [];
    // angoli arrotondati: alle due estremità del legamento la larghezza si riduce (quarto di ellisse di raggio `TL_ANGOLO` lungo il solco)
    const dE = Math.min(r, TL_RIGHE - 1 - r) / (TL_RIGHE - 1) * (TL_Y[1] - TL_Y[0]), xm = (xa + xb) / 2, W = (xb + TL_MED - xa + TL_LAT) / 2;
    const fr = dE >= TL_ANGOLO ? 1 : 1 - TL_ANGOLO / W * (1 - Math.sqrt(Math.max(0, 1 - ((TL_ANGOLO - dE) / TL_ANGOLO) ** 2)));
    const X0 = xm + (xa - TL_LAT - xm) * fr, X1 = xm + (xb + TL_MED - xm) * fr;
    for (let j = 0; j < TL_COL; j++) { const x = X0 + (X1 - X0) * j / (TL_COL - 1); let h = 1.0;
      for (; h > -0.6; h -= 0.005) { const q = add(add(c, mul(sx, x)), mul(o, h)); if (G.sample(Ft, ...q) < TL_GAP) break; } pts.push([x, h]); }
    // inviluppo convesso superiore
    const hull = []; for (const p of pts) { while (hull.length >= 2) { const [A, B] = hull.slice(-2); if ((B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= 0) hull.pop(); else break; } hull.push(p); }
    const hH = x => { for (let j = 1; j < hull.length; j++) if (x <= hull[j][0] + 1e-9) { const [A, B] = [hull[j - 1], hull[j]]; return A[1] + (B[1] - A[1]) * (x - A[0]) / (B[0] - A[0] || 1); } return hull.at(-1)[1]; };
    righe.push({ c, o, sx, T, X0, X1, h: pts.map(p => hH(p[0])) }); }
  for (let g = 0; g < 6; g++) { const hs = righe.map(R => R.h.slice()); for (let r = 1; r < TL_RIGHE - 1; r++) for (let j = 0; j < TL_COL; j++) righe[r].h[j] = Math.max(hs[r][j], (hs[r - 1][j] + hs[r][j] + hs[r + 1][j]) / 3); }
  const P = [], F = [], id = (r, j, f) => (r * TL_COL + j) * 2 + f;
  for (let r = 0; r < TL_RIGHE; r++) { const R = righe[r]; for (let j = 0; j < TL_COL; j++) { const x = R.X0 + (R.X1 - R.X0) * j / (TL_COL - 1), t = Math.abs(2 * j / (TL_COL - 1) - 1), sp = TL_SPESS * (1 - 0.8 * t ** 2) * (1 - 0.7 * Math.abs(2 * r / (TL_RIGHE - 1) - 1) ** 2);
    const b = add(add(R.c, mul(R.sx, x)), mul(R.o, R.h[j])); P.push(...b, ...add(b, mul(R.o, sp))); for (let f = 0; f < 2; f++) F.push(...R.sx.map(v => Math.round(127 * v))); } }
  const I = [], quad = (a, b2, c, d) => I.push(a, b2, c, a, c, d);
  for (let r = 0; r < TL_RIGHE - 1; r++) for (let j = 0; j < TL_COL - 1; j++) { quad(id(r, j, 1), id(r, j + 1, 1), id(r + 1, j + 1, 1), id(r + 1, j, 1)); quad(id(r, j, 0), id(r + 1, j, 0), id(r + 1, j + 1, 0), id(r, j + 1, 0)); }
  for (let j = 0; j < TL_COL - 1; j++) { quad(id(0, j, 0), id(0, j + 1, 0), id(0, j + 1, 1), id(0, j, 1)); const r = TL_RIGHE - 1; quad(id(r, j, 0), id(r, j, 1), id(r, j + 1, 1), id(r, j + 1, 0)); }
  for (let r = 0; r < TL_RIGHE - 1; r++) { quad(id(r, 0, 0), id(r, 0, 1), id(r + 1, 0, 1), id(r + 1, 0, 0)); const j = TL_COL - 1; quad(id(r, j, 0), id(r + 1, j, 0), id(r + 1, j, 1), id(r, j, 1)); }
  // verso dei triangoli: volume con segno positivo (normali verso fuori)
  let vol = 0; for (let t = 0; t < I.length; t += 3) { const A = pt(P, I[t]), B = pt(P, I[t + 1]), C = pt(P, I[t + 2]); vol += dot(A, cross(B, C)); }
  if (vol < 0) for (let t = 0; t < I.length; t += 3) [I[t + 1], I[t + 2]] = [I[t + 2], I[t + 1]];
  const largh = righe.map(R => Math.max(...R.h) - Math.min(...R.h));
  log('legamento trasverso:', TL_RIGHE, 'righe ×', TL_COL, 'colonne, quote', TL_Y.join('…'), '; dislivello della lamina sopra il solco', (Math.min(...largh) * 10).toFixed(1), '–', (Math.max(...largh) * 10).toFixed(1), 'mm');
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I), tag: null, fdir: Int8Array.from(F) }; })();

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { setMesh('trasv_om', trasv); setPos('caps', Float32Array.from(capsPos));
  for (const n of SOPRA_CAPS) setPos(n, Float32Array.from(legPos[n])); saveFile(repack()); }
