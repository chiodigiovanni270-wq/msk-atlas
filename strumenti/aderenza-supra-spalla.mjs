/* Aderenza del tendine del sovraspinato (`supra`) all'osso, spalla (modelli/spalla-3d.html): l'estremità d'inserzione poggia sull'omero a distanza uniforme,
   senza il lobo anteriore sollevato, la piega che lo separava dal resto e l'angolo a punta del margine inferiore.

   Uso (dalla cartella del progetto):
     node strumenti/aderenza-supra-spalla.mjs                  → riscrive `supra` e `caps` nel file del modello (~1,5 min)
     PROVA=1 node strumenti/aderenza-supra-spalla.mjs          → stampa i controlli senza scrivere
     SENZA_FORO=1 node strumenti/aderenza-supra-spalla.mjs     → non apre il foro nella capsula (solo il tendine)
     MODELLO=/tmp/copia.html node strumenti/aderenza-supra-spalla.mjs   → lavora su una copia
   Va lanciato dopo `capo-lungo-spalla.mjs` e prima di `borsa-spalla.mjs` (la borsa poggia sul sovraspinato e sulla capsula: dopo va rilanciata).
   Riparte da `supra` e `caps` della revisione `BASE` (prima di questo script), quindi si può rilanciare con lo stesso risultato; se si rilanciano gli
   script che le riscrivono (`rifinitura-supra-spalla.mjs`, `capo-lungo-spalla.mjs`) aggiornare `BASE` alla revisione che contiene il nuovo risultato.

   Problema. Lo strato interno del tendine stava a 0,5 mm dall'osso solo in una fossetta all'estremità; altrove a 1–3 mm e, nel lobo anteriore (sopra il solco
   bicipitale), a 3–5 mm: lì la capsula (lamina di 0,6–0,9 mm a ~0,3 mm dall'osso, calcolata sull'inviluppo dell'osso) passava tra tendine e osso e lo teneva
   sollevato; il margine inferiore finiva in un angolo a punta (fondo piatto e ala anteriore ripida, con un gradino di 2,7 mm). In realtà sul trochite la
   capsula non sta tra la cuffia e l'osso: si fonde con i tendini e si inserisce al collo anatomico, oltre il margine della cartilagine.

   Metodo (quote v in cm sopra il punto più basso dell'estremità laterale, nella vista `VISTA`: u verso destra, v verso l'alto).
   0. Margine inferiore arrotondato: impronta del tendine (celle (u, v) coperte dai triangoli, entrambi gli strati) «aperta» con un disco di raggio
      `RAGGIO_ARR` (toglie l'angolo sporgente) e margine inferiore di ogni colonna u levigato con una gaussiana di larghezza `SIGMA_ARR` (toglie il gradino,
      che il disco lascia perché è un angolo rientrante); la levigatura vale solo dalla parte anteriore (peso smoothstep tra `U_ARR`: il margine laterale resta
      com'è). I vertici sotto la quota `V_ARR` sono rimappati in v tra margine vecchio e nuovo (sopra non si muove nulla), riportati alla distanza di prima dal
      centro della testa e levigati (`LEV_ARR`, Taubin).
   1. Foro nella capsula (`FORO`): si tolgono i triangoli della capsula che stanno sotto l'estremità del tendine, oltre il margine della cartilagine
      (almeno `D_CART` dalla cartilagine), entro `D_FORO` dallo strato interno, nell'impronta del tendine ristretta di `BORDO_FORO` (il bordo del foro resta
      nascosto sotto la lamina) e sotto la quota `V_FORO`; i vertici rimasti senza triangoli sono tolti.
   2. Campo di scarto: per ogni vertice dello strato interno (normale verso il centro della testa) la distanza `d` da omero, cartilagine e capsula e lo scarto
      `d − GAP_AD`, limitato a [−`SU`, `MAX`]; lo strato esterno (e i vertici di bordo) prende lo scarto del vertice interno più vicino (entro `R_ACC`), così
      lo spessore della lamina resta quello di prima. Lo scarto è levigato lungo la mesh (`LEV_CAMPO` giri) e pesato dalla quota: 1 fino a `V_AD1`, 0 da `V_AD2`
      (sopra l'acromion il tendine non si tocca). I vertici scendono (o salgono) lungo il gradiente della distanza; `GIRI` giri, perché superficie e gradiente
      cambiano a ogni spostamento.
   3. Distanze minime e levigatura (`GIRI_LEV` giri alternati: spinta fuori da supporto, `GAP_MIN`, e dalle strutture vicine, `VICINE` a `GAP_VICINE` o alla
      distanza di prima se minore; poi Taubin di `LEV_LOC` passate pesato dalla quota).
   4. Superficie esterna liscia e margine distale uniforme: vedi il passo 4 più sotto (`SIGMA_EST`, `SP_BORDO`, `W_BORDO`, `V_BORDO`, `SP_MIN`).
   Normali di vertice (`nm`) ricalcolate sui vertici spostati e sui vicini. Controlli stampati: distanza dello strato interno dal supporto prima e dopo, distanza
   minima dalle altre strutture prima e dopo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { vicini, compatta } = await import('./lib-bp3d.mjs');
const { REAL, realDaRevisione, setMesh, saveFile, repack, log, sstep, clamp } = G;

const BASE = '02b4f15', FILE_REPO = 'modelli/spalla-3d.html';
const VISTA = [-1.0, 0.1];                                                    // theta, phi della camera della pagina (come rifinitura-supra-spalla.mjs)
const V_AD1 = 1.3, V_AD2 = 1.9, GAP_AD = 0.06, SU = 0.03, MAX = 0.5, GIRI = 5, LEV_CAMPO = 40, R_ACC = 0.3, LEV_LOC = 12, GIRI_LEV = 4, GAP_MIN = 0.05;   // cm
const RAGGIO_ARR = 0.45, SIGMA_ARR = 0.5, U_ARR = [-0.9, -0.4], V_ARR = 1.4, LEV_ARR = 30;                                // margine inferiore arrotondato (cm)
const SP_MIN = 0.05, SP_BORDO = 0.02, W_BORDO = 0.3, V_BORDO = [0.6, 1.0], LEV_SP = 200, GIRI_EST = 6, LEV_EST = 10, GIRI_CONC = 200, V_CONC = [1.0, 1.5], CEL_M = 0.02, SIGMA_M = 0.15, GIRI_M = 3, U_M = [-1.2, 0.85], SIGMA_EST = 0.3, W_LISCIA = 0.08;   // superficie esterna e spessore (cm)
const V_FORO = 1.0, D_CART = 0.2, D_FORO = 0.4, BORDO_FORO = -0.1;            // cm
const SUPPORTO = ['omero', 'cart_omero', 'caps'], VICINE = ['coraco_om', 'bic_lungo', 'trasv_om', 'infra', 'subs', 'sghl', 'mghl'], GAP_VICINE = 0.05;   // strutture accanto: distanza minima (cm), o quella di prima se già minore

// ---- partenza: supra e caps della revisione BASE (stessa topologia di quelle nel file)
const sup = REAL('supra'), nv = sup.nv, idx = sup.idx;
const pos0 = Float64Array.from(realDaRevisione(BASE, 'supra', FILE_REPO).pos), cur = pos0.slice();
const nb = vicini(nv, idx);
const capsB = realDaRevisione(BASE, 'caps', FILE_REPO);
const cTesta = (() => { const p = REAL('cart_omero').pos, M = Array.from({ length: 4 }, () => new Float64Array(5));
  for (let i = 0; i < p.length; i += 3) { const r = [2 * p[i], 2 * p[i + 1], 2 * p[i + 2], 1], b = p[i] ** 2 + p[i + 1] ** 2 + p[i + 2] ** 2; for (let j = 0; j < 4; j++) { for (let k = 0; k < 4; k++) M[j][k] += r[j] * r[k]; M[j][4] += r[j] * b; } }
  for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r; [M[c], M[m]] = [M[m], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; } }
  return [0, 1, 2].map(j => M[j][4] / M[j][j]); })();

// sistema della vista: e1 (u) verso destra, e2 (v) verso l'alto; origine C = punto più basso dell'estremità laterale (x < −1) del tendine
const un = v => { const l = Math.hypot(...v); return v.map(x => x / l); }, [th, ph] = VISTA;
const nV = un([Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)]), e2 = un([0, 1, 0].map((v, k) => v - nV[1] * nV[k])), e1 = [e2[1] * nV[2] - e2[2] * nV[1], e2[2] * nV[0] - e2[0] * nV[2], e2[0] * nV[1] - e2[1] * nV[0]];
let punta = 0; { let mv = 1e9; for (let i = 0; i < nv; i++) { if (pos0[3 * i] > -1) continue; const v = pos0[3 * i] * e2[0] + pos0[3 * i + 1] * e2[1] + pos0[3 * i + 2] * e2[2]; if (v < mv) { mv = v; punta = i; } } }
const C = [0, 1, 2].map(k => pos0[3 * punta + k]);
const uv = (P, i) => { const p = [0, 1, 2].map(k => P[3 * i + k] - C[k]); return [p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]]; };
const uvp = p => { const d = [0, 1, 2].map(k => p[k] - C[k]); return [d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2], d[0] * e2[0] + d[1] * e2[1] + d[2] * e2[2]]; };
const RAGGIO = 3.5, sel = []; for (let i = 0; i < nv; i++) { const p = [0, 1, 2].map(k => pos0[3 * i + k] - C[k]); if (Math.hypot(...p) < RAGGIO && p[0] * nV[0] + p[1] * nV[1] + p[2] * nV[2] > -1.5 && p[0] * nV[0] + p[1] * nV[1] + p[2] * nV[2] < 1.5) sel.push(i); }
const wq = new Float64Array(nv); for (const i of sel) wq[i] = 1 - sstep(V_AD1, V_AD2, uv(pos0, i)[1]);
const reg = sel.filter(i => wq[i] > 0);

// ---- 0. margine inferiore arrotondato: l'impronta del tendine (celle (u, v) coperte dai triangoli, entrambi gli strati) è «aperta» morfologicamente con un disco
// di raggio `RAGGIO_ARR` (toglie gli angoli sporgenti: la punta anteriore, dove il margine laterale ripido incontra quello inferiore); il margine inferiore di ogni
// colonna u scende fino al nuovo valore e le quote sopra `V_ARR` restano ferme: i vertici sono rimappati linearmente in v, poi riportati alla distanza di prima dal
// centro della testa e levigati (`LEV_ARR`, pesati dalla quota)
{ const CEL = 0.025, U0 = -2.4, U1 = 1.8, W0 = -0.4, W1 = V_ARR + 0.6, NU = Math.round((U1 - U0) / CEL), NW = Math.round((W1 - W0) / CEL), M = new Uint8Array(NU * NW);
  const UVs = new Float64Array(nv * 2); for (let i = 0; i < nv; i++) { const q = uv(cur, i); UVs[2 * i] = q[0]; UVs[2 * i + 1] = q[1]; }
  const ins = new Set(sel);
  for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.every(i => ins.has(i))) continue;
    const P = T.map(i => [UVs[2 * i], UVs[2 * i + 1]]), lo = [0, 1].map(q => Math.floor((Math.min(...P.map(x => x[q])) - (q ? W0 : U0)) / CEL)), hi = [0, 1].map(q => Math.floor((Math.max(...P.map(x => x[q])) - (q ? W0 : U0)) / CEL));
    const den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]); if (Math.abs(den) < 1e-12) continue;
    for (let a = Math.max(0, lo[0]); a <= Math.min(NU - 1, hi[0]); a++) for (let b = Math.max(0, lo[1]); b <= Math.min(NW - 1, hi[1]); b++) { const x = U0 + (a + 0.5) * CEL, y = W0 + (b + 0.5) * CEL;
      const l1 = ((P[1][1] - P[2][1]) * (x - P[2][0]) + (P[2][0] - P[1][0]) * (y - P[2][1])) / den, l2 = ((P[2][1] - P[0][1]) * (x - P[2][0]) + (P[0][0] - P[2][0]) * (y - P[2][1])) / den;
      if (l1 >= -0.05 && l2 >= -0.05 && 1 - l1 - l2 >= -0.05) M[a + NU * b] = 1; } }
  // il tendine è un solido dal punto di vista della vista: si riempiono i vuoti interni (colonna per colonna dal margine inferiore in su, fino alla quota V_ARR + 0,5)
  for (let a = 0; a < NU; a++) { let primo = -1; for (let b = 0; b < NW; b++) if (M[a + NU * b]) { primo = b; break; } if (primo >= 0) for (let b = primo; b < NW; b++) M[a + NU * b] = 1; }
  const R = Math.round(RAGGIO_ARR / CEL), disco = []; for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) if (x * x + y * y <= R * R) disco.push([x, y]);
  const E = new Uint8Array(NU * NW), D = new Uint8Array(NU * NW), dentro = (a, b) => a >= 0 && a < NU && b >= 0 && b < NW;
  for (let a = 0; a < NU; a++) for (let b = 0; b < NW; b++) { if (!M[a + NU * b]) continue; let ok = true;   // fuori dalla griglia conta come dentro (il tendine prosegue)
    for (const [x, y] of disco) { const c = a + x, d = b + y; if (dentro(c, d) && !M[c + NU * d]) { ok = false; break; } }
    E[a + NU * b] = ok ? 1 : 0; }
  for (let a = 0; a < NU; a++) for (let b = 0; b < NW; b++) if (E[a + NU * b]) for (const [x, y] of disco) { const c = a + x, d = b + y; if (dentro(c, d)) D[c + NU * d] = 1; }
  const basso = (A, a) => { for (let b = 0; b < NW; b++) if (A[a + NU * b]) return W0 + b * CEL; return null; };
  const vmin = [], vt = []; for (let a = 0; a < NU; a++) { vmin.push(basso(M, a)); vt.push(basso(D, a)); }
  // colonne: se il disco non copre una colonna (punta tolta) resta il margine di prima; poi il margine è levigato (gaussiana di larghezza `SIGMA_ARR`: toglie anche
  // il gradino tra la parte bassa e l'ala anteriore, che il disco lascia perché è un angolo rientrante)
  for (let a = 0; a < NU; a++) if (vmin[a] !== null && (vt[a] === null || vt[a] < vmin[a])) vt[a] = vmin[a];
  { const sg = SIGMA_ARR / CEL, K = Math.ceil(3 * sg), vs = vt.slice();
    for (let a = 0; a < NU; a++) if (vt[a] !== null) { let sw = 0, sv = 0; for (let k = -K; k <= K; k++) { const c = a + k; if (c < 0 || c >= NU || vt[c] === null) continue; const w = Math.exp(-0.5 * (k / sg) ** 2); sw += w; sv += w * vt[c]; } vs[a] = sv / sw; }
    for (let a = 0; a < NU; a++) if (vmin[a] !== null) vt[a] = vmin[a] + sstep(U_ARR[0], U_ARR[1], U0 + (a + 0.5) * CEL) * (vs[a] - vmin[a]); }   // solo dalla parte anteriore: il margine laterale resta com'è
  let nmov = 0, mxd = 0; const mossi = [];
  for (const i of reg) { const u = UVs[2 * i], v = UVs[2 * i + 1], a = Math.floor((u - U0) / CEL); if (a < 0 || a >= NU || vmin[a] === null || v >= V_ARR) continue;
    const d0 = vt[a] - vmin[a]; if (Math.abs(d0) <= 1e-4) continue; const v1 = vt[a] + (v - vmin[a]) * (V_ARR - vt[a]) / (V_ARR - vmin[a]), dv = v1 - v;
    const r0 = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q])); for (let q = 0; q < 3; q++) cur[3 * i + q] += dv * e2[q];
    const rr = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q])); for (let q = 0; q < 3; q++) cur[3 * i + q] = cTesta[q] + (cur[3 * i + q] - cTesta[q]) * r0 / rr;
    mossi.push(i); nmov++; mxd = Math.max(mxd, Math.abs(dv)); }
  log('margine inferiore arrotondato (disco', RAGGIO_ARR * 10, 'mm): vertici spostati', nmov, ', al massimo', (mxd * 10).toFixed(1), 'mm in v');
  const W = new Float64Array(nv); { let fronte = new Set(mossi); for (const i of fronte) W[i] = 1; for (let k = 1; k <= 4; k++) { const nuovo = new Set(); for (const i of fronte) for (const j of nb[i]) if (!W[j]) { W[j] = 1 - k / 5; nuovo.add(j); } fronte = nuovo; } }
  const zonaArr = []; for (let i = 0; i < nv; i++) if (W[i] > 0) zonaArr.push(i);
  for (let it = 0; it < LEV_ARR; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
    for (const i of zonaArr) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += W[i] * lam * (s / L.length - cur[3 * i + k]); } }
    cur.set(q); } }

const radiale = (P, i) => { const r = [0, 1, 2].map(k => P[3 * i + k] - cTesta[k]), l = Math.hypot(...r); return r.map(x => x / l); };
const normaliV = P => { const N = new Float64Array(nv * 3);
  for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]];
    const a = [0, 1, 2].map(q => P[3 * T[1] + q] - P[3 * T[0] + q]), b = [0, 1, 2].map(q => P[3 * T[2] + q] - P[3 * T[0] + q]);
    const f = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; for (const i of T) for (let k = 0; k < 3; k++) N[3 * i + k] += f[k]; }
  return N; };
// strato interno: normale rivolta verso il centro della testa
const internoDi = (P, N, i) => { const r = radiale(P, i), l = Math.hypot(N[3 * i], N[3 * i + 1], N[3 * i + 2]) || 1; return (N[3 * i] * r[0] + N[3 * i + 1] * r[1] + N[3 * i + 2] * r[2]) / l < -0.3; };

// ---- 1. foro nella capsula
let capsIdx = capsB.idx, capsPos = Float64Array.from(capsB.pos);
if (!process.env.SENZA_FORO) {
  G.griglia(C.map(v => v - RAGGIO - 0.3), C.map(v => v + RAGGIO + 0.3), 0.03, 0.1);
  G.setPos('supra', Float32Array.from(cur));   // il tendine dopo il margine arrotondato
  const Fk = G.esatta(G.sdf(G.unione(['cart_omero'])).F, ['cart_omero'], 0.1), Fs = G.esatta(G.sdf(G.unione(['supra'])).F, ['supra'], 0.1);
  // impronta del tendine: celle (u, v) coperte dai triangoli (la proiezione dei due strati è la stessa), ristrette di BORDO_FORO
  const CEL = 0.05, cel = new Map(), key = (a, b) => a + ',' + b, insel = new Set(sel);
  for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]];
    if (!T.every(i => insel.has(i))) continue;
    const P = T.map(i => uv(cur, i)), lo = [0, 1].map(q => Math.floor(Math.min(...P.map(x => x[q])) / CEL)), hi = [0, 1].map(q => Math.floor(Math.max(...P.map(x => x[q])) / CEL));
    const den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]); if (Math.abs(den) < 1e-12) continue;
    for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) { const x = (a + 0.5) * CEL, y = (b + 0.5) * CEL;
      const l1 = ((P[1][1] - P[2][1]) * (x - P[2][0]) + (P[2][0] - P[1][0]) * (y - P[2][1])) / den, l2 = ((P[2][1] - P[0][1]) * (x - P[2][0]) + (P[0][0] - P[2][0]) * (y - P[2][1])) / den;
      if (l1 >= -0.02 && l2 >= -0.02 && 1 - l1 - l2 >= -0.02) cel.set(key(a, b), 1); } }
  // BORDO_FORO > 0 restringe l'impronta, < 0 l'allarga (il foro supera il margine del tendine: la capsula finisce un poco prima, come al collo anatomico)
  const r = Math.round(Math.abs(BORDO_FORO) / CEL), coperta = (a, b) => { if (BORDO_FORO < 0) { for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) if (x * x + y * y <= r * r && cel.has(key(a + x, b + y))) return true; return false; }
    for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) if (x * x + y * y <= r * r && !cel.has(key(a + x, b + y))) return false; return true; };
  const tolti = new Uint8Array(capsIdx.length / 3); let nt = 0;
  for (let t = 0; t < capsIdx.length; t += 3) { const c = [0, 1, 2].map(k => (capsPos[3 * capsIdx[t] + k] + capsPos[3 * capsIdx[t + 1] + k] + capsPos[3 * capsIdx[t + 2] + k]) / 3);
    if (Math.hypot(...c.map((v, k) => v - C[k])) > RAGGIO) continue;
    const [u, v] = uvp(c); if (v > V_FORO || v < -0.2) continue;
    if (!coperta(Math.floor(u / CEL), Math.floor(v / CEL))) continue;
    if (G.sample(Fs, ...c) > D_FORO) continue;
    if (G.sample(Fk, ...c) < D_CART) continue;
    tolti[t / 3] = 1; nt++; }
  const nuovo = []; for (let t = 0; t < capsIdx.length; t += 3) if (!tolti[t / 3]) nuovo.push(capsIdx[t], capsIdx[t + 1], capsIdx[t + 2]);
  const comp = compatta(Float32Array.from(capsPos), Uint32Array.from(nuovo));
  capsPos = comp.pos; capsIdx = comp.idx;
  log('foro nella capsula: triangoli tolti', nt, 'su', tolti.length, '; vertici', capsB.pos.length / 3, '→', capsPos.length / 3);
}
setMesh('caps', { pos: Float32Array.from(capsPos), idx: capsIdx, tag: null, fdir: null });

// ---- 2. scarto dal supporto e discesa del tendine
G.griglia(C.map(v => v - RAGGIO - 0.3), C.map(v => v + RAGGIO + 0.3), 0.03, 0.1);
const costruisciF = () => { const M = G.or(G.or(G.solid('omero'), G.solid('cart_omero')), G.solid('caps', true)); return G.esatta(G.sdf(M).F, SUPPORTO, 0.1); };
let Fs = costruisciF();
const gapStat = (P, et) => { const N = normaliV(P), d = [];
  for (const i of reg) if (wq[i] === 1 && internoDi(P, N, i)) d.push(G.sample(Fs, P[3 * i], P[3 * i + 1], P[3 * i + 2]));
  d.sort((x, y) => x - y); const q = f => (10 * d[Math.floor(f * (d.length - 1))]).toFixed(2);
  log('strato interno', et + ':', d.length, 'vertici, distanza da omero/cartilagine/capsula (mm) min', q(0), 'p10', q(0.1), 'p25', q(0.25), 'mediana', q(0.5), 'p75', q(0.75), 'p90', q(0.9), 'max', q(1)); };
gapStat(cur, 'prima');
for (let g = 0; g < GIRI; g++) {
  const N = normaliV(cur), dl = new Float64Array(nv), noto = new Uint8Array(nv), interni = [];
  for (const i of reg) if (internoDi(cur, N, i)) { dl[i] = clamp(G.sample(Fs, cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]) - GAP_AD, -SU, MAX); noto[i] = 1; interni.push(i); }
  // strato esterno (e vertici di bordo con normale ambigua): scarto del vertice interno più vicino, con una griglia di ricerca
  const H = R_ACC, ck = (a, b, c) => a + ',' + b + ',' + c, hs = new Map();
  for (const i of interni) { const k = ck(Math.floor(cur[3 * i] / H), Math.floor(cur[3 * i + 1] / H), Math.floor(cur[3 * i + 2] / H)); (hs.get(k) || hs.set(k, []).get(k)).push(i); }
  for (const i of reg) if (!noto[i]) { const a = [0, 1, 2].map(k => Math.floor(cur[3 * i + k] / H)); let best = -1, bd = 1e9;
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) for (const j of hs.get(ck(a[0] + x, a[1] + y, a[2] + z)) || []) {
      const d2 = (cur[3 * i] - cur[3 * j]) ** 2 + (cur[3 * i + 1] - cur[3 * j + 1]) ** 2 + (cur[3 * i + 2] - cur[3 * j + 2]) ** 2; if (d2 < bd) { bd = d2; best = j; } }
    if (best >= 0 && bd < R_ACC * R_ACC) dl[i] = dl[best]; }
  for (let it = 0; it < LEV_CAMPO; it++) { const q = dl.slice(); for (const i of reg) { const L = nb[i]; let s = 0; for (const j of L) s += dl[j]; q[i] = dl[i] + 0.5 * (s / L.length - dl[i]); } dl.set(q); }
  let mx = 0;
  for (const i of reg) { const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], gr = G.grad(Fs, p), l = Math.hypot(...gr) || 1, s = wq[i] * dl[i];
    for (let k = 0; k < 3; k++) cur[3 * i + k] -= gr[k] / l * s; mx = Math.max(mx, Math.abs(s)); }
  log('giro', g + 1, ': spostamento massimo', (mx * 10).toFixed(2), 'mm su', interni.length, 'vertici interni'); }

// ---- 3. levigatura pesata dalla quota, distanza minima dal supporto e dalle strutture vicine (alternate: la spinta di una sposta i vertici rispetto all'altra)
const Fv = VICINE.filter(n => G.man.meshes.some(m => m.n === n)).map(n => ({ n, F: G.esatta(G.sdf(G.unione([n])).F, [n], 0.1) })), min0 = Fv.map(({ F }) => reg.map(i => G.sample(F, pos0[3 * i], pos0[3 * i + 1], pos0[3 * i + 2])));
const posReg = new Map(reg.map((i, k) => [i, k]));
const spingi = () => { let n = 0;
  for (const i of reg) { for (const [q, { F }] of Fv.entries()) { const t = Math.min(GAP_VICINE, min0[q][posReg.get(i)]), p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d = G.sample(F, ...p); if (d >= t) continue;
      const gr = G.grad(F, p), l = Math.hypot(...gr) || 1; for (let k = 0; k < 3; k++) cur[3 * i + k] += gr[k] / l * (t - d); n++; }
    const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d = G.sample(Fs, ...p); if (d >= GAP_MIN) continue;
    const gr = G.grad(Fs, p), l = Math.hypot(...gr) || 1; for (let k = 0; k < 3; k++) cur[3 * i + k] += gr[k] / l * (GAP_MIN - d); n++; }
  return n; };
for (let g = 0; g < GIRI_LEV; g++) { const n = spingi();
  for (let it = 0; it < LEV_LOC; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
    for (const i of reg) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += wq[i] * lam * (s / L.length - cur[3 * i + k]); } }
    cur.set(q); }
  if (g === 0) log('vertici spinti fuori dalle distanze minime (supporto e strutture vicine)', n); }
log('dopo l\'ultima levigatura restano da spingere', spingi(), 'vertici');

// ---- 4. superficie esterna liscia e margine distale uniforme (lo strato interno resta a GAP_AD dal supporto). Prima la faccia superiore aveva solchi e
// scanalature e una piega tra il lobo laterale (sottile e aderente) e quello anteriore (più spesso e sollevato), che sul margine distale faceva un'incisura.
// Strato esterno: vertici con normale verso fuori più i vicini con normale non rivolta verso la testa (entra anche la piega). Distanza dal margine nella vista
// (impronta del tendine), considerata solo all'estremità distale (`V_BORDO`). Spessore (distanza dal supporto − GAP_AD) levigato lungo lo strato (`LEV_SP`) e
// portato a `SP_BORDO` sul margine (smoothstep su `W_BORDO`): così il profilo del margine è uguale lungo tutta l'estremità. Poi, `GIRI_EST` volte: vertici vicini
// al margine verso lo spessore nuovo (gli altri solo allo spessore minimo `SP_MIN`); superficie esterna come raggio dal centro della testa per direzione,
// regressione quadratica locale pesata (gaussiana `SIGMA_EST`) e spostamento solo lungo il raggio (pesato dalla quota e da `W_LISCIA` sul margine): toglie
// solchi e piega senza abbassare la superficie convessa; Taubin leggero (`LEV_EST`). Infine spessore minimo e distanze minime alternati a Taubin leggero.
{ const N = normaliV(cur), cs = new Float64Array(nv), est = [], bordo = [];
  for (const i of reg) { const r = radiale(cur, i), l = Math.hypot(N[3 * i], N[3 * i + 1], N[3 * i + 2]) || 1; cs[i] = (N[3 * i] * r[0] + N[3 * i + 1] * r[1] + N[3 * i + 2] * r[2]) / l;
  }
  // strato esterno: si parte dai vertici con normale chiaramente verso fuori e si estende ai vicini con normale non rivolta verso la testa; così entrano anche i
  // vertici della piega tra i due lobi (normale di traverso), che con la sola normale restavano fuori e fermi
  { const ins = new Set(reg), visto = new Uint8Array(nv), coda = []; for (const i of reg) if (cs[i] > 0.6) { visto[i] = 1; coda.push(i); }
    for (let k = 0; k < coda.length; k++) for (const j of nb[coda[k]]) if (!visto[j] && ins.has(j) && cs[j] > -0.3) { visto[j] = 1; coda.push(j); }
    est.push(...coda); }
  const inEst = new Uint8Array(nv); for (const i of est) inEst[i] = 1;
  // distanza dal margine nella vista (impronta del tendine, celle (u, v)): il margine vero, non le pieghe interne della mesh
  const dm = new Float64Array(nv).fill(1e9);
  { const CEL = 0.025, mask = new Set(), key = (a, b) => a + ',' + b, ins = new Set(sel);
    for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.every(i => ins.has(i))) continue;
      const P = T.map(i => uv(cur, i)), lo = [0, 1].map(q => Math.floor(Math.min(...P.map(x => x[q])) / CEL)), hi = [0, 1].map(q => Math.floor(Math.max(...P.map(x => x[q])) / CEL));
      const den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]); if (Math.abs(den) < 1e-12) continue;
      for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) { const x = (a + 0.5) * CEL, y = (b + 0.5) * CEL;
        const l1 = ((P[1][1] - P[2][1]) * (x - P[2][0]) + (P[2][0] - P[1][0]) * (y - P[2][1])) / den, l2 = ((P[2][1] - P[0][1]) * (x - P[2][0]) + (P[0][0] - P[2][0]) * (y - P[2][1])) / den;
        if (l1 >= -0.02 && l2 >= -0.02 && 1 - l1 - l2 >= -0.02) mask.add(key(a, b)); } }
    const R = Math.ceil(2 * W_BORDO / CEL);
    for (const i of est) { const [u, v] = uv(cur, i), a = Math.floor(u / CEL), b = Math.floor(v / CEL); let best = 2 * W_BORDO;
      for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) { const d = Math.hypot(x, y) * CEL; if (d < best && !mask.has(key(a + x, b + y))) best = d; }
      dm[i] = best + 2 * W_BORDO * sstep(V_BORDO[0], V_BORDO[1], v); } }   // il profilo del margine si uniforma solo all'estremità distale
  const h = i => G.sample(Fs, cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]);
  const sp = new Float64Array(nv); for (const i of est) sp[i] = Math.max(0, h(i) - GAP_AD);
  const spStat = et => { const L = est.filter(i => wq[i] === 1).map(i => (h(i) - GAP_AD) * 10).sort((a, b) => a - b), q = f => L[Math.floor(f * (L.length - 1))].toFixed(2); log('strato esterno', et + ': spessore (mm) p10', q(0.1), 'mediana', q(0.5), 'p90', q(0.9), '; deviazione media dalla mediana', (L.reduce((s, x) => s + Math.abs(x - L[L.length >> 1]), 0) / L.length).toFixed(2)); };
  spStat('prima');
  for (let it = 0; it < LEV_SP; it++) { const q = sp.slice(); for (const i of est) { let s = 0, n = 0; for (const j of nb[i]) if (inEst[j]) { s += sp[j]; n++; } if (n) q[i] = sp[i] + 0.5 * (s / n - sp[i]); } sp.set(q); }
  const meta = new Float64Array(nv); for (const i of est) meta[i] = GAP_AD + SP_BORDO + (Math.max(sp[i], SP_MIN) - SP_BORDO) * sstep(0, W_BORDO, dm[i]);
  for (const i of bordo) meta[i] = GAP_AD + SP_BORDO * 0.5;
  const mob = [...est, ...bordo];
  for (let g = 0; g < GIRI_EST; g++) {
    // verso lo spessore nuovo solo vicino al margine (profilo uniforme); più all'interno solo lo spessore minimo, il resto lo fa la levigatura
    for (const i of mob) { const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d = G.sample(Fs, ...p), b = 1 - sstep(W_BORDO, 2 * W_BORDO, dm[i]);
      const s = wq[i] * (b * (meta[i] - d) + (1 - b) * Math.max(0, GAP_AD + SP_MIN - d)); if (!s) continue;
      const gr = G.grad(Fs, p), l = Math.hypot(...gr) || 1; for (let k = 0; k < 3; k++) cur[3 * i + k] += gr[k] / l * s; }
    // superficie esterna come campo di raggio (distanza dal centro della testa) per direzione: media gaussiana (larghezza `SIGMA_EST`) sui vertici esterni vicini
    // per direzione, e i vertici si spostano solo lungo il raggio (nessuna distorsione di traverso): toglie solchi, scanalature e la piega tra i due lobi, che una
    // levigatura sulla mesh non toglieva (la piega è uno spigolo della mesh, la media dei vicini lo sposta ma non lo apre)
    { const RR = 2.6, H = SIGMA_EST, ck = (a, b, c) => a + ',' + b + ',' + c, hs = new Map(), dir = new Map();
      for (const i of est) { const r = [0, 1, 2].map(k => cur[3 * i + k] - cTesta[k]), l = Math.hypot(...r), d = r.map(x => x / l); dir.set(i, [d, l]);
        const k = ck(...d.map(x => Math.floor(x * RR / H))); (hs.get(k) || hs.set(k, []).get(k)).push(i); }
      const nuovo = new Map();
      for (const i of est) { const [d] = dir.get(i), a = d.map(x => Math.floor(x * RR / H)); let sw = 0;
        // regressione quadratica locale pesata (nel piano tangente): la media semplice abbasserebbe la superficie, che è convessa
        const t1 = un(Math.abs(d[0]) < 0.9 ? [0, -d[2], d[1]] : [-d[2], 0, d[0]]), t2 = [d[1] * t1[2] - d[2] * t1[1], d[2] * t1[0] - d[0] * t1[2], d[0] * t1[1] - d[1] * t1[0]];
        const A = Array.from({ length: 6 }, () => new Float64Array(7));
        for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) for (const j of hs.get(ck(a[0] + x, a[1] + y, a[2] + z)) || []) {
          const [dj, lj] = dir.get(j), e = [0, 1, 2].map(k => RR * (dj[k] - d[k])), px = e[0] * t1[0] + e[1] * t1[1] + e[2] * t1[2], py = e[0] * t2[0] + e[1] * t2[1] + e[2] * t2[2];
          const w = Math.exp(-0.5 * (px * px + py * py) / SIGMA_EST ** 2), f = [1, px, py, px * px, px * py, py * py];
          for (let r = 0; r < 6; r++) { for (let c = 0; c < 6; c++) A[r][c] += w * f[r] * f[c]; A[r][6] += w * f[r] * lj; } sw += w; }
        for (let r = 0; r < 6; r++) A[r][r] += 1e-6 * (sw || 1);
        for (let c = 0; c < 6; c++) { let m = c; for (let r = c + 1; r < 6; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r; [A[c], A[m]] = [A[m], A[c]];
          for (let r = 0; r < 6; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 7; k++) A[r][k] -= f * A[c][k]; } }
        nuovo.set(i, A[0][6] / A[0][0]); }
      for (const i of est) { const [d, l] = dir.get(i), f = wq[i] * sstep(0, W_LISCIA, dm[i]), l1 = l + f * (nuovo.get(i) - l); for (let k = 0; k < 3; k++) cur[3 * i + k] = cTesta[k] + d[k] * l1; } }
    for (let it = 0; it < LEV_EST; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
      for (const i of est) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += wq[i] * lam * (s / L.length - cur[3 * i + k]); } }
      cur.set(q); } }
  // spessore minimo e distanze minime: la spinta sposta pochi vertici di colpo (punte), quindi si alterna a una levigatura leggera dello strato esterno
  const minimo = () => { let n = 0; for (const i of est) { const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d = G.sample(Fs, ...p), m = GAP_AD + Math.min(SP_MIN, meta[i] - GAP_AD); if (d >= m) continue;
    const gr = G.grad(Fs, p), l = Math.hypot(...gr) || 1; for (let k = 0; k < 3; k++) cur[3 * i + k] += gr[k] / l * (m - d); n++; } return n; };
  const nm0 = minimo(), ns0 = spingi();
  for (let g = 0; g < 4; g++) { for (let it = 0; it < LEV_EST; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
      for (const i of est) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += wq[i] * lam * (s / L.length - cur[3 * i + k]); } }
      cur.set(q); }
    minimo(); spingi(); }
  log('strato esterno: vertici', est.length, ', entro', W_BORDO * 10, 'mm dal margine', est.filter(i => dm[i] < W_BORDO).length, '; riportati allo spessore minimo', nm0, '; spinti fuori dalle distanze minime', ns0, '; dopo la levigatura finale', minimo(), '+', spingi());
  spStat('dopo'); }

// ---- 5. riempimento delle concavità (solco tra i due lobi e incisura a V sul margine distale): levigatura «da una parte sola», ogni vertice esterno o di
// margine si sposta verso la media dei vicini solo se così esce dal tendine (concavità: il laplaciano ha componente lungo la normale uscente), le parti convesse
// restano dove sono. È come una chiusura morfologica: solchi e incisure si colmano senza abbassare né restringere il resto. `GIRI_CONC` passate (peso dalla quota,
// solo sotto `V_CONC`), poi spessore e distanze minime dal supporto e dalle strutture vicine.
{ const N0 = normaliV(cur), zona = reg.filter(i => uv(cur, i)[1] < V_CONC[1]).filter(i => { const r = radiale(cur, i), l = Math.hypot(N0[3 * i], N0[3 * i + 1], N0[3 * i + 2]) || 1; return (N0[3 * i] * r[0] + N0[3 * i + 1] * r[1] + N0[3 * i + 2] * r[2]) / l > -0.5; });
  const wc = new Float64Array(nv); for (const i of zona) wc[i] = wq[i] * (1 - sstep(V_CONC[0], V_CONC[1], uv(cur, i)[1]));
  let mossi = 0;
  for (let g = 0; g < GIRI_CONC; g++) { const N = normaliV(cur), q = cur.slice();
    for (const i of zona) { const L = nb[i], d = [0, 0, 0]; for (const j of L) for (let k = 0; k < 3; k++) d[k] += cur[3 * j + k] / L.length; for (let k = 0; k < 3; k++) d[k] -= cur[3 * i + k];
      if (d[0] * N[3 * i] + d[1] * N[3 * i + 1] + d[2] * N[3 * i + 2] <= 0) continue;
      for (let k = 0; k < 3; k++) q[3 * i + k] += 0.5 * wc[i] * d[k]; if (g === GIRI_CONC - 1) mossi++; }
    cur.set(q);
    if (g % 20 === 19) spingi(); }
  log('concavità riempite: vertici nella zona', zona.length, ', ancora in concavità all\'ultima passata', mossi, '; spinti fuori dalle distanze minime', spingi()); }
// ---- 6. margine distale liscio nella vista laterale: i passi precedenti (discesa, spessore che scende sul margine) spostano il bordo di qualche decimo di mm e
// lasciavano un gradino e un'incisura a V tra il lobo laterale e quello anteriore (margine inferiore che sale di 1,2 mm in 0,4 mm e ridiscende). Margine
// inferiore per colonne u (`CEL_M`, dagli incroci degli spigoli dei triangoli), levigato con una gaussiana di larghezza `SIGMA_M`; i vertici sotto `V_ARR`
// sono rimappati in v tra margine vecchio e nuovo, riportati alla distanza di prima dal centro della testa, levigati (Taubin leggero) e rispinti fuori dalle
// distanze minime; `GIRI_M` volte.
{ const ins = new Set(sel); let mx = 0;
  const vminDi = () => { const vm = new Map();
    for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.every(i => ins.has(i))) continue; const P = T.map(i => uv(cur, i));
      const lo = Math.floor(Math.min(...P.map(p => p[0])) / CEL_M), hi = Math.floor(Math.max(...P.map(p => p[0])) / CEL_M);
      for (let a = lo; a <= hi; a++) { const x = (a + 0.5) * CEL_M; for (let e = 0; e < 3; e++) { const p = P[e], q = P[(e + 1) % 3]; if ((p[0] - x) * (q[0] - x) > 0 || p[0] === q[0]) continue;
        const y = p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]); if (!vm.has(a) || y < vm.get(a)) vm.set(a, y); } } }
    return vm; };
  for (let g = 0; g < GIRI_M; g++) { const vm = vminDi(), sg = SIGMA_M / CEL_M, K = Math.ceil(3 * sg), vt = new Map();
    for (const [a, y] of vm) { if (y > V_ARR - 0.2 || a * CEL_M < U_M[0] - 0.3 || a * CEL_M > U_M[1] + 0.3) continue; let sw = 0, sy = 0; for (let k = -K; k <= K; k++) { const z = vm.get(a + k); if (z === undefined || z > V_ARR - 0.2 || (a + k) * CEL_M < U_M[0] - 0.3 || (a + k) * CEL_M > U_M[1] + 0.3) continue; const w = Math.exp(-0.5 * (k / sg) ** 2); sw += w; sy += w * z; } vt.set(a, sy / sw); }
    const mossi = [];
    for (const i of reg) { const [u, v] = uv(cur, i); if (v >= V_ARR) continue; const a = Math.floor(u / CEL_M), y0 = vm.get(a), y1 = vt.get(a); if (y0 === undefined || y1 === undefined || Math.abs(y1 - y0) < 1e-5) continue;
      const v1 = y1 + (v - y0) * (V_ARR - y1) / (V_ARR - y0), dv = (v1 - v) * wq[i] * sstep(U_M[0] - 0.1, U_M[0] + 0.1, u) * (1 - sstep(U_M[1] - 0.1, U_M[1] + 0.1, u)); const r0 = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q]));
      for (let q = 0; q < 3; q++) cur[3 * i + q] += dv * e2[q]; if (!process.env.SOLO_V) { const rr = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q])); for (let q = 0; q < 3; q++) cur[3 * i + q] = cTesta[q] + (cur[3 * i + q] - cTesta[q]) * r0 / rr; }
      mossi.push(i); mx = Math.max(mx, Math.abs(dv)); }
    const W = new Set(mossi); for (const i of mossi) for (const j of nb[i]) W.add(j);
    for (let it = 0; it < 6; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice(); for (const i of W) { if (!wq[i]) continue; const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += wq[i] * lam * (s / L.length - cur[3 * i + k]); } } cur.set(q); }
    spingi(); }
  const vm = vminDi(); let salto = 0; for (const [a, y] of vm) { const z = vm.get(a + 1); if (z !== undefined && a * CEL_M > U_M[0] && a * CEL_M < U_M[1]) salto = Math.max(salto, Math.abs(z - y)); }
  log('margine distale liscio: spostamento massimo in v', (mx * 10).toFixed(2), 'mm; salto massimo del margine tra colonne vicine (', CEL_M * 10, 'mm)', (salto * 10).toFixed(2), 'mm'); }
gapStat(cur, 'dopo');
{ let mx = 0; for (const i of reg) mx = Math.max(mx, Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k]))); log('spostamento massimo del tendine', (mx * 10).toFixed(2), 'mm'); }

// ---- controlli: distanza minima dei vertici spostati dalle altre strutture, prima e dopo
{ const ALTRE = ['infra', 'subs', 'tmin', 'bic_lungo', 'bic_breve', 'trasv_om', 'coraco_om', 'sghl', 'mghl', 'scapola', 'clavicola', 'omero', 'cart_omero', 'caps'], out = [];
  const mossi = reg.filter(i => Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k])) > 1e-5);
  for (const n of ALTRE) { if (!G.man.meshes.some(m => m.n === n)) continue; const F = G.esatta(G.sdf(G.unione([n])).F, [n], 0.1);
    let a = 1e9, b = 1e9; for (const i of mossi) { a = Math.min(a, G.sample(F, pos0[3 * i], pos0[3 * i + 1], pos0[3 * i + 2])); b = Math.min(b, G.sample(F, cur[3 * i], cur[3 * i + 1], cur[3 * i + 2])); }
    out.push(n + ' ' + (10 * a).toFixed(2) + '→' + (10 * b).toFixed(2)); }
  log('distanza minima dei vertici spostati (mm), prima→dopo:', out.join(' | ')); }

// ---- normali di vertice: quelle già nel file, ricalcolate sui vertici spostati e sui loro vicini
const m = G.man.meshes.findLast(x => x.n === 'supra');
const nrm = m.nm !== undefined ? Int8Array.from(new Int8Array(G.buf0.buffer, G.buf0.byteOffset + m.nm, nv * 3)) : null;
if (nrm) { const toccati = new Set(); for (const i of reg) if (Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k])) > 1e-5) toccati.add(i);
  for (const i of [...toccati]) for (const j of nb[i]) toccati.add(j);
  const acc = new Map([...toccati].map(i => [i, [0, 0, 0]]));
  for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(i => acc.has(i))) continue;
    const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b2 = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), f = [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]];
    for (const i of T) if (acc.has(i)) for (let k = 0; k < 3; k++) acc.get(i)[k] += f[k]; }
  let neg = 0; for (const [i, f] of acc) { const o = [0, 1, 2].map(k => nrm[3 * i + k]); if (o[0] * f[0] + o[1] * f[1] + o[2] * f[2] < 0) neg++; }
  const s = neg > acc.size / 2 ? -1 : 1;
  for (const [i, f] of acc) { const l = Math.hypot(...f) || 1; for (let k = 0; k < 3; k++) nrm[3 * i + k] = Math.round(127 * s * f[k] / l); } }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { const a = G.attrs('supra'); setMesh('supra', { pos: Float32Array.from(cur), idx, tag: a.tag, fdir: a.fdir, nrm }); saveFile(repack()); }
