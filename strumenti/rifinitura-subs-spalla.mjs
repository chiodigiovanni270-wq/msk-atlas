/* Rifinitura del tendine del sottoscapolare (`subs`) della spalla (modelli/spalla-3d.html): margine superiore più alto (l'intervallo dei rotatori non resta
   uno spazio troppo largo), contorno regolare (superiore convesso con angolo superolaterale arrotondato, laterale verticale, angolo inferolaterale raccordato,
   inferiore senza propaggini), superficie senza fori passanti, estremità fino al capo lungo nel solco, davanti alla capsula; il capo breve del bicipite è spostato in avanti quanto serve per restare davanti al tendine.

   Uso (dalla cartella del progetto):
     node strumenti/rifinitura-subs-spalla.mjs                  → riscrive `subs` (e, se serve, `bic_breve`) nel file del modello
     PROVA=1 node strumenti/rifinitura-subs-spalla.mjs          → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/rifinitura-subs-spalla.mjs   → lavora su una copia
   Va lanciato dopo `muscoli-spalla.mjs` (con le altre `rifinitura-*-spalla.mjs`, in qualsiasi ordine) e prima di `capo-lungo-spalla.mjs`
   e `borsa-spalla.mjs`. Riparte dalle
   posizioni di `subs` della revisione `BASE` con la topologia del file (i fori richiusi cambiano solo i triangoli, non i vertici), quindi si può rilanciare:
   il risultato cambia di meno di 1 mm (la seconda volta i fori sono già richiusi e il capo breve, letto dal file, si sposta ancora di qualche decimo). Se
   si rilancia `muscoli-spalla.mjs` e cambia `subs`, aggiornare `BASE`.

   Metodo. Nella vista anteriore (`VISTA`: theta, phi della camera della pagina) u va verso destra (medialmente) e v verso l'alto; l'estremità laterale del
   tendine è il punto con u minimo (`U0`); margini superiore e inferiore per colonne u, laterale per righe v (dai vertici fino a `PROF` dietro il davanti).
   1. Stiramenti in fasce lungo i margini (spostamento pieno sul margine, nullo al limite interno della fascia, smoothstep): in alto `A_SU` × f(u) nella fascia
      `BANDA_SU` (pieno fino a `PIENO_SU`, nullo a `L_SU`), raccordato all'estremità con un arco di raggio `R_ANGOLO`; di lato `A_LAT` × g(v) nella fascia
      `BANDA_LAT`, pieno sopra `V_LAT[1]` e nullo sotto `V_LAT[0]`; in basso `A_GIU` (0).
   2. Contorno regolare (solo la lastra anteriore: vertici entro `PLACCA` dalla faccia più avanzata nella stessa zona della vista). Margine superiore: arco di
      raggio `R_SU` dal margine laterale, tratto piatto all'altezza massima fino a `U_PIATTO`, poi inviluppo convesso del margine di prima fino a `U_FINE`.
      Margine inferiore senza propaggini fino a `U_BASSO` (non scende andando verso l'estremità), media mobile su `MEDIA` bin. Margine laterale verticale a
      `UL` (il punto più laterale tra `V_VERT` e il margine superiore, portato fino a `GAP_SOLCO` dal margine mediale del capo lungo nel solco: l'inserzione
      copre tutto il trochine; mappa nella fascia `BANDA_LAT2`), raccordato in alto all'arco e in basso con un quarto di ellisse (`AU`, `AV`); più in
      basso non torna verso l'esterno. Poi di nuovo il margine inferiore (dopo lo spostamento laterale). Ogni margine è portato sul nuovo con una mappa lineare
      nella sua fascia; ogni vertice spostato torna alla distanza di prima dal centro della testa omerale.
   2b. Contorno raccordato: la spezzata di destinazione (piatto, arco, verticale, ellisse, retta fino al margine inferiore a `U_BASSO`) e il contorno attuale
      per settori di `PASSO_ANG` gradi attorno a un centro nel tendine (`C_RAD`); i vertici entro `BANDA_RAD` dal contorno sono portati in proporzione sul
      nuovo lungo il raggio, `GIRI_RAD` volte. Bordo liscio: i vertici del bordo vanno verso la media dei vertici di bordo vicini (`GIRI_BORDO` volte).
   3. Fori passanti dentro il contorno (in pagina un buco da cui si vedono le strutture sotto): vertici su cui poggiano triangoli rivolti alla camera e
      triangoli rivolti indietro, a più di `D_FORO` dal bordo e non più di `PROF_FORO` dietro il davanti. Per ogni gruppo si tolgono i triangoli entro
      `R_FORO` dal centro nella vista; se restano due anelli di bordo (faccia anteriore e posteriore) ognuno è richiuso con il taglio delle orecchie nella
      vista (stesso verso dei triangoli attorno), altrimenti il gruppo resta com'è.
   4. Levigatura dove ci si è mossi (Taubin, `LEV`); pieghe (triangoli che si attraversano, o lati fra triangoli quasi capovolti lontano dal bordo: `DENTRO`,
      `CRESTA`) levigate con due anelli finché non ne restano (`GIRI_PIEGHE`).
   5. Omero: sotto l'equatore della vista i vertici spostati più lontani dall'osso di quanto lo fossero prima vi sono riaccostati (sotto la testa l'osso
      rientra verso il collo); tutti a `GAP_OSSO` dall'omero; poi di nuovo le pieghe.
   4b. Margine superiore rettilineo (`U_RETTA`, `BANDA_RETTA`): il bordo liscio e la media dei vicini nelle pieghe abbassavano il margine fra l'angolo
      superolaterale e la gobba mediale (1 mm, concavità); il margine di destinazione è l'inviluppo convesso superiore di quello attuale e i vertici nella
      fascia sotto il margine sono alzati in proporzione; si ripete dopo le pieghe e dopo la spinta dall'omero.
   5b. Capsula: lungo il raggio dal centro della testa, i vertici che hanno la capsula entro `CAPS_MARCIA` più in fuori (o a meno di `GAP_CAPS`) vanno oltre
      l'ultimo punto a meno di `GAP_CAPS`; spostamento allargato nello spazio (`R_CAPS`, a scendere) così le due facce si muovono insieme; `GIRI_CAPS` volte.
   6. Capo breve del bicipite: i vertici entro `SEP_BB` dal tendine vanno avanti lungo la vista quanto serve, spostamento allargato sulla mesh (`GIRI_BB`).
   Normali di vertice (`nm`) di `subs` ricalcolate sui vertici spostati e sui vicini; quelle del capo breve le ricalcola la pagina. Controlli stampati:
   margini prima e dopo, fori richiusi, pieghe, spostamento massimo, spostamento del capo breve. Dopo va rilanciato `borsa-spalla.mjs`. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { vicini } = await import('./lib-bp3d.mjs');
const { REAL, posDaRevisione, setMesh, saveFile, repack, log, sstep } = G;

const BASE = 'fc755f7', NOME = 'subs';
const VISTA = [-0.25, 0.15], PROF = 3.0, ZONA = 4.5;                   // cm; vertici entro ZONA dall'estremità (in u) e non più di PROF dietro il davanti
const A_SU = 0.8, PIENO_SU = 1.2, L_SU = 4.0, BANDA_SU = 1.0, R_ANGOLO = 0.6;   // cm
const A_LAT = 0.35, MEZZO_LAT = 1.2, BANDA_LAT = 0.8, V_LAT = [-0.6, 0.3];   // cm (V_LAT: quote v della vista)
const A_GIU = 0.0, L_GIU = 1.5, BANDA_GIU = 0.6;                       // cm
const BIN = 0.1, LEV = 30, GAP_OSSO = 0.05, U_LISCIO = 2.6, GIRI_PIEGHE = 12;
const R_SU = 0.45, U_PIATTO = 1.6, U_FINE = 2.8, U_BASSO = 1.6, V_VERT = -0.5, AU = 1.4, AV = 1.4, MEDIA = 4;   // cm (MEDIA in bin)
const C_RAD = [1.0, -1.4], PASSO_ANG = 3, BANDA_RAD = 0.6, GIRI_RAD = 3;                // cm dall'angolo superolaterale ideale; gradi; cm
const Y_SOLCO = 1.0, GAP_SOLCO = 0.1, BANDA_LAT2 = 1.0;                                  // cm
const U_RETTA = [0.1, 1.9], BANDA_RETTA = 0.4;                                          // cm
const GAP_CAPS = 0.08, CAPS_MARCIA = 0.25, R_CAPS = 0.3, GIRI_CAPS = 4;                                 // cm
const PLACCA = 0.6, DENTRO = 0.25, CRESTA = -0.3, R_FORO = [0.2], D_FORO = 0.25, GIRI_BORDO = 40, PROF_FORO = 1.0, SEP_BB = 0.05, GIRI_BB = 40;                                     // cm; coseno fra le normali di due triangoli adiacenti

let { nv, idx } = REAL(NOME);
const pos0 = Float64Array.from(posDaRevisione(BASE, NOME, 'modelli/spalla-3d.html')), cur = pos0.slice();
let nb = vicini(nv, idx);
const cTesta = (() => { const p = REAL('cart_omero').pos, M = Array.from({ length: 4 }, () => new Float64Array(5));
  for (let i = 0; i < p.length; i += 3) { const r = [2 * p[i], 2 * p[i + 1], 2 * p[i + 2], 1], b = p[i] ** 2 + p[i + 1] ** 2 + p[i + 2] ** 2; for (let j = 0; j < 4; j++) { for (let k = 0; k < 4; k++) M[j][k] += r[j] * r[k]; M[j][4] += r[j] * b; } }
  for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r; [M[c], M[m]] = [M[m], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; } }
  return [0, 1, 2].map(j => M[j][4] / M[j][j]); })();

// sistema della vista: e1 (u) verso destra sullo schermo, e2 (v) verso l'alto, n verso la camera
const un = v => { const l = Math.hypot(...v); return v.map(x => x / l); }, [th, ph] = VISTA;
const n = un([Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)]), e2 = un([0, 1, 0].map((v, k) => v - n[1] * n[k])), e1 = [e2[1] * n[2] - e2[2] * n[1], e2[2] * n[0] - e2[0] * n[2], e2[0] * n[1] - e2[1] * n[0]];
const proj = (P, i, e) => P[3 * i] * e[0] + P[3 * i + 1] * e[1] + P[3 * i + 2] * e[2];
// estremità: il vertice più a sinistra fra quelli davanti (la faccia anteriore del tendine sulla testa omerale)
let davanti = -1e9; for (let i = 0; i < nv; i++) davanti = Math.max(davanti, proj(cur, i, n));
const vis = []; for (let i = 0; i < nv; i++) if (proj(cur, i, n) > davanti - PROF) vis.push(i);
let U0 = 1e9; for (const i of vis) U0 = Math.min(U0, proj(cur, i, e1));
let sel = vis.filter(i => proj(cur, i, e1) < U0 + ZONA);
const uv = (P, i) => [proj(P, i, e1) - U0, proj(P, i, e2)];

// margini per colonne (alto, basso) e per righe (sinistra), dai vertici, con settori vuoti riempiti e mediana su tre
const liscio = a => { const b = a.slice(); for (let k = 0; k < a.length; k++) if (!isFinite(b[k])) { let d = 1; while (d < a.length && !isFinite(a[k + d] ?? NaN) && !isFinite(a[k - d] ?? NaN)) d++; b[k] = isFinite(a[k + d] ?? NaN) ? a[k + d] : a[k - d]; }
  return b.map((_, k) => [b[Math.max(0, k - 1)], b[k], b[Math.min(b.length - 1, k + 1)]].sort((x, y) => x - y)[1]); };
const NU = Math.ceil(ZONA / BIN) + 1;
const colonne = P => { const su = new Float64Array(NU).fill(-Infinity), giu = new Float64Array(NU).fill(Infinity);
  for (const i of sel) { const [u, v] = uv(P, i), k = Math.min(NU - 1, Math.max(0, Math.round(u / BIN))); su[k] = Math.max(su[k], v); giu[k] = Math.min(giu[k], v); }
  return [liscio(Array.from(su, x => isFinite(x) ? x : NaN)), liscio(Array.from(giu, x => isFinite(x) ? x : NaN))]; };
const interp = (a, x) => { const f = Math.min(a.length - 1.001, Math.max(0, x / BIN)), k = Math.floor(f); return a[k] + (a[k + 1] - a[k]) * (f - k); };
const [SU0, GIU0] = colonne(cur);
const vMin = Math.min(...GIU0.slice(0, Math.round(MEZZO_LAT / BIN))), vMax = Math.max(...SU0.slice(0, Math.round(MEZZO_LAT / BIN))), NV = Math.ceil((vMax - vMin) / BIN) + 1;
const righe = P => { const sx = new Float64Array(NV).fill(Infinity);
  for (const i of sel) { const [u, v] = uv(P, i), k = Math.round((v - vMin) / BIN); if (k >= 0 && k < NV) sx[k] = Math.min(sx[k], u); }
  return liscio(Array.from(sx, x => isFinite(x) ? x : NaN)); };
const SX0 = righe(cur);
const stampa = (P, et) => { const [su, giu] = colonne(P), sx = righe(P);
  log(et, 'margini alto/basso per u (cm dall\'estremità):', [0.2, 0.6, 1, 1.5, 2, 3, 4].map(u => u + ':' + interp(su, u).toFixed(2) + '/' + interp(giu, u).toFixed(2)).join(' '));
  log(et, 'margine laterale per v:', Array.from({ length: Math.ceil(NV / 3) }, (_, j) => (vMin + 3 * j * BIN).toFixed(1) + ':' + sx[3 * j].toFixed(2)).join(' ')); };
stampa(cur, 'prima');

const ss = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
// in alto anche l'angolo superolaterale arrotondato: il margine nuovo scende come un arco di raggio `R_ANGOLO` verso l'estremità
const angolo = u => u >= R_ANGOLO ? 0 : R_ANGOLO - Math.sqrt(R_ANGOLO ** 2 - (R_ANGOLO - Math.max(0, u)) ** 2);
const fSu = u => 1 - ss((u - PIENO_SU) / (L_SU - PIENO_SU)), fGiu = u => 1 - ss(u / L_GIU);
const gLat = v => ss((v - V_LAT[0]) / (V_LAT[1] - V_LAT[0]));          // 0 sotto V_LAT[0] (lì il capo breve del bicipite passa davanti), pieno sopra V_LAT[1]

const mossi = []; let mxs = 0;
for (const i of sel) { let [u, v] = uv(cur, i); const u1 = u, v1 = v;
  // in alto e in basso: la fascia larga `BANDA_SU` (`BANDA_GIU`) sotto il margine (sopra il margine inferiore) è stirata: spostamento pieno sul margine, nullo
  // al limite interno della fascia (smoothstep, quindi monotono: nessuna piega)
  { const su = interp(SU0, u), giu = interp(GIU0, u);
    v += (A_SU * fSu(u) - angolo(u)) * ss((v - (su - BANDA_SU)) / BANDA_SU) - A_GIU * fGiu(u) * ss(((giu + BANDA_GIU) - v) / BANDA_GIU); }
  // di lato: fascia larga `BANDA_LAT` dal margine laterale della riga
  { const sx = interp(SX0, v1 - vMin); u -= A_LAT * gLat(v1) * ss(((sx + BANDA_LAT) - u1) / BANDA_LAT); }
  const d = [u - u1, v - v1]; if (Math.hypot(...d) < 1e-5) continue;
  const r0 = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q]));
  for (let q = 0; q < 3; q++) cur[3 * i + q] += d[0] * e1[q] + d[1] * e2[q];
  const rr = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q]));
  for (let q = 0; q < 3; q++) cur[3 * i + q] = cTesta[q] + (cur[3 * i + q] - cTesta[q]) * r0 / rr;
  mossi.push(i); mxs = Math.max(mxs, Math.hypot(...d)); }
log('vertici spostati', mossi.length, ', nel piano della vista al massimo', (mxs * 10).toFixed(1), 'mm');

// dal contorno regolare in poi si muove solo la lastra anteriore: i vertici entro `PLACCA` dalla faccia più avanzata nella stessa zona del piano della vista
// (caselle di 1,5 mm), così la parte profonda del ventre muscolare resta dov'è e non entra nella capsula o sotto il coraco-omerale
{ const B = 0.15, top = new Map(), kk = i => { const [u, v] = uv(cur, i); return Math.floor(u / B) + ',' + Math.floor(v / B); };
  for (const i of sel) { const k = kk(i), h = proj(cur, i, n); if (!(top.get(k) >= h)) top.set(k, h); }
  const prima = sel.length; sel = sel.filter(i => proj(cur, i, n) > top.get(kk(i)) - PLACCA); log('lastra anteriore:', sel.length, 'vertici su', prima); }
// 2. contorno regolare (dopo lo stiramento): margine superiore convesso con angolo superolaterale arrotondato (arco di raggio `R_SU` dal margine laterale,
// poi tratto piatto all'altezza massima fino a `U_PIATTO`, poi inviluppo convesso dei margini di prima fino a `U_FINE`); margine inferiore senza propaggini
// (non può scendere andando verso l'estremità: massimo dei margini più mediali, fino a `U_BASSO`), media mobile su `MEDIA` bin. Ogni margine è portato sul
// nuovo con una mappa lineare nella sua fascia (fuori dalla fascia nulla cambia), stessa distanza dal centro della testa omerale.
const sposta = (i, du, dv) => { const r0 = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q]));
  for (let q = 0; q < 3; q++) cur[3 * i + q] += du * e1[q] + dv * e2[q];
  const rr = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cTesta[q])); for (let q = 0; q < 3; q++) cur[3 * i + q] = cTesta[q] + (cur[3 * i + q] - cTesta[q]) * r0 / rr; };
const media = (a, k) => a.map((_, i) => { let s = 0, c = 0; for (let d = -k; d <= k; d++) if (a[i + d] !== undefined && isFinite(a[i + d])) { s += a[i + d]; c++; } return s / c; });
let TP = 0, ULAT = 0;
{ const [SU1, GIU1] = colonne(cur), k = u => Math.round(u / BIN), SX1 = righe(cur), kv = v => Math.round((v - vMin) / BIN);
  const Tpiatto = Math.max(...SU1.slice(k(Math.max(0, R_SU)), k(U_PIATTO) + 1)), UL0 = Math.min(...SX1.slice(Math.max(0, kv(V_VERT)), kv(Tpiatto) + 1));
  // il margine laterale arriva fino a `GAP_SOLCO` dal margine mediale del tendine del capo lungo nel solco (vertici del tendine sotto `Y_SOLCO`, alle stesse
  // quote v): l'inserzione copre tutto il trochine
  const BL = REAL('bic_lungo'); let uSolco = -Infinity;
  for (let i = 0; i < BL.nv; i++) { if (BL.pos[3 * i + 1] > Y_SOLCO) continue; const v = proj(BL.pos, i, e2); if (v < V_VERT || v > Tpiatto) continue; uSolco = Math.max(uSolco, proj(BL.pos, i, e1) - U0); }
  const UL = Math.min(UL0, uSolco + GAP_SOLCO);
  log('margine laterale: era a', UL0.toFixed(2), ', margine mediale del capo lungo a', uSolco.toFixed(2), '→', UL.toFixed(2));
  // inviluppo convesso superiore da (U_PIATTO, Tpiatto) ai margini di prima fino a U_FINE
  const pts = [[U_PIATTO, Tpiatto]]; for (let j = k(U_PIATTO) + 1; j <= k(U_FINE); j++) pts.push([j * BIN, SU1[j]]);
  const hull = []; for (const p of pts) { while (hull.length >= 2) { const [a, b] = hull.slice(-2); if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) hull.pop(); else break; } hull.push(p); }
  const Tsu = u => { if (u < UL + R_SU) return Tpiatto - R_SU + Math.sqrt(Math.max(0, R_SU ** 2 - (UL + R_SU - u) ** 2)); if (u <= U_PIATTO) return Tpiatto;
    for (let j = 1; j < hull.length; j++) if (u <= hull[j][0]) { const [a, b] = [hull[j - 1], hull[j]]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]); } return interp(SU1, u); };
  const Bgiu = GIU1.slice(); for (let j = k(U_BASSO) - 1; j >= 0; j--) Bgiu[j] = Math.max(GIU1[j], Bgiu[j + 1]);
  const Tgiu = media(Bgiu, MEDIA);
  let n1 = 0;
  for (const i of sel) { const [u, v] = uv(cur, i); if (u > U_FINE) continue; let dv = 0; const su = interp(SU1, u), giu = interp(GIU1, u);
    const T = Tsu(u), m1 = su - BANDA_SU; if (v > m1 && T > m1) dv += (v - m1) * (T - m1) / (su - m1) - (v - m1);
    if (u < U_BASSO) { const Bn = interp(Tgiu, u), m2 = giu + BANDA_GIU; if (v < m2 && Bn < m2) dv += m2 - (m2 - v) * (m2 - Bn) / (m2 - giu) - v; }
    if (Math.abs(dv) > 1e-5) { sposta(i, 0, dv); n1++; } }
  // margine laterale: verticale a `UL` (il punto più laterale fra `V_VERT` e il margine superiore), in alto raccordato all'arco dell'angolo superolaterale,
  // in basso un quarto di ellisse (semiassi `AU` in u, `AV` in v) verso il margine inferiore; più in basso non torna verso l'esterno (massimo dei margini più
  // in alto)
  const SX2 = righe(cur), Lsx = SX2.slice(), vb = V_VERT - AV, cS = Tpiatto - R_SU;
  for (let j = 0; j < NV; j++) { const v = vMin + j * BIN;
    if (v > cS) Lsx[j] = UL + R_SU - Math.sqrt(Math.max(0, R_SU ** 2 - (v - cS) ** 2)); else if (v >= V_VERT) Lsx[j] = UL;
    else if (v >= vb) Lsx[j] = UL + AU - AU * Math.sqrt(Math.max(0, 1 - ((V_VERT - v) / AV) ** 2)); }
  for (let j = kv(vb) - 1; j >= 0; j--) Lsx[j] = Math.max(SX2[j], Lsx[j + 1]);
  const Tsx = media(Lsx, MEDIA); let n2 = 0;
  for (const i of sel) { const [u, v] = uv(cur, i), sx = interp(SX2, v - vMin), Ln = interp(Tsx, v - vMin), m3 = sx + BANDA_LAT2; if (u >= m3 || Ln >= m3) continue;
    const du = m3 - (m3 - u) * (m3 - Ln) / (m3 - sx) - u; if (Math.abs(du) > 1e-5) { sposta(i, du, 0); n2++; } }
  // di nuovo il margine inferiore senza propaggini, ora che il margine laterale si è spostato (l'angolo inferolaterale non deve sporgere verso il basso)
  { const [, G2] = colonne(cur), B2 = G2.slice(); for (let j = k(U_BASSO) - 1; j >= 0; j--) B2[j] = Math.max(G2[j], B2[j + 1]); const T2 = media(B2, MEDIA);
    for (const i of sel) { const [u, v] = uv(cur, i); if (u >= U_BASSO) continue; const giu = interp(G2, u), Bn = interp(T2, u), m2 = giu + BANDA_GIU;
      if (v < m2 && Bn < m2) { const dv = m2 - (m2 - v) * (m2 - Bn) / (m2 - giu) - v; if (Math.abs(dv) > 1e-5) { sposta(i, 0, dv); n1++; } } } }
  TP = Tpiatto; ULAT = UL;
  log('contorno regolare: margine superiore piatto a', Tpiatto.toFixed(2), ', laterale verticale a', UL.toFixed(2), ', vertici spostati in alto/basso', n1, ', di lato', n2); }

// 2b. contorno raccordato: attorno a un centro nel tendine (`C_RAD` dall'angolo superolaterale ideale) il contorno di destinazione è una spezzata nel piano
// della vista: margine superiore piatto da `U_PIATTO`, arco di raggio `R_SU`, margine laterale verticale fino a `V_VERT`, quarto di ellisse (`AU`, `AV`) e
// margine inferiore diritto fino al margine attuale a `U_BASSO`. Per settori di `PASSO_ANG` gradi, nel settore che va dal margine superiore a `U_PIATTO` a
// quello inferiore a `U_BASSO` passando di lato, i vertici entro `BANDA_RAD` dal contorno attuale sono portati in proporzione sul nuovo (mappa lineare
// lungo il raggio), stessa distanza dal centro della testa omerale.
for (let giro = 0; giro < GIRI_RAD; giro++) { const [, G3] = colonne(cur), vInf = interp(G3, U_BASSO), c = [ULAT + C_RAD[0], TP + C_RAD[1]];
  const poli = [[U_PIATTO, TP]]; for (let a = 0; a <= 8; a++) { const t = Math.PI / 2 + a / 8 * Math.PI / 2; poli.push([ULAT + R_SU + R_SU * Math.cos(t), TP - R_SU + R_SU * Math.sin(t)]); }
  for (let a = 0; a <= 12; a++) { const t = Math.PI + a / 12 * Math.PI / 2; poli.push([ULAT + AU + AU * Math.cos(t), V_VERT + AV * Math.sin(t)]); }
  poli.push([U_BASSO, vInf]);
  const ang = p => Math.atan2(p[1] - c[1], p[0] - c[0]), a0 = ang(poli[0]), a1 = ang(poli[poli.length - 1]);           // a0 in alto (~90°+), a1 in basso (~-90°-): settore passando per 180°
  const nel = a => { const x = (a - a0 + 4 * Math.PI) % (2 * Math.PI), y = (a1 - a0 + 4 * Math.PI) % (2 * Math.PI); return x <= y; };
  const rT = a => { const d = [Math.cos(a), Math.sin(a)]; let best = Infinity;
    for (let j = 1; j < poli.length; j++) { const p = poli[j - 1], q = poli[j], e = [q[0] - p[0], q[1] - p[1]], w = [p[0] - c[0], p[1] - c[1]], den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-12) continue;
      const t = (w[0] * e[1] - w[1] * e[0]) / den, s = (w[0] * d[1] - w[1] * d[0]) / den; if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t); } return best; };
  const NA = Math.round(360 / PASSO_ANG), bin = a => ((Math.floor((a + Math.PI) / (2 * Math.PI) * NA) % NA) + NA) % NA, rC = new Float64Array(NA).fill(NaN);
  const pol = i => { const [u, v] = uv(cur, i); return [Math.atan2(v - c[1], u - c[0]), Math.hypot(u - c[0], v - c[1])]; };
  for (const i of sel) { const [a, r] = pol(i), b = bin(a); if (!(r <= rC[b])) rC[b] = r; }
  const rCl = liscio(Array.from(rC)); let n3 = 0, mx3 = 0;
  for (const i of sel) { const [a, r] = pol(i); if (!nel(a)) continue; const b = bin(a), C0 = rCl[b], T = rT((b + 0.5) / NA * 2 * Math.PI - Math.PI), m = C0 - BANDA_RAD;
    if (!isFinite(T) || r <= m || T <= m) continue; const r2 = m + (r - m) * (T - m) / (C0 - m), dr = r2 - r; if (Math.abs(dr) < 1e-5) continue;
    sposta(i, dr * Math.cos(a), dr * Math.sin(a)); mossi.push(i); n3++; mx3 = Math.max(mx3, Math.abs(dr)); }
  if (giro === GIRI_RAD - 1) log('contorno raccordato: vertici', n3, ', al massimo', (mx3 * 10).toFixed(2), 'mm'); }

// bordo liscio: i vertici del bordo del tendine (su cui poggiano sia triangoli rivolti alla camera sia triangoli rivolti indietro) fino a `U_FINE` sono portati
// verso la media dei vertici di bordo vicini, nel piano della vista (metà del passo, `GIRI_BORDO` volte): via linguette e gradini rimasti sul contorno
{ const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], sb = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vf = new Map(); for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [0, 1, 2].map(k => [0, 1, 2].map(q => cur[3 * idx[t + k] + q])), f = crs(sb(b, a), sb(c, a)), d = (f[0] * n[0] + f[1] * n[1] + f[2] * n[2]) / (Math.hypot(...f) || 1);
    for (let k = 0; k < 3; k++) { const o = vf.get(idx[t + k]) || vf.set(idx[t + k], [0, 0]).get(idx[t + k]); if (d > 0.2) o[0]++; else if (d < -0.2) o[1]++; } }
  const R = new Set(sel.filter(i => { const o = vf.get(i); return o && o[0] && o[1] && uv(cur, i)[0] < U_FINE; })), RN = new Map([...R].map(i => [i, nb[i].filter(j => R.has(j))]));
  for (let g = 0; g < GIRI_BORDO; g++) { const D = [];
    for (const [i, L] of RN) { if (L.length < 2) continue; const p = uv(cur, i), m = [0, 1].map(k => L.reduce((s, j) => s + uv(cur, j)[k], 0) / L.length); D.push([i, 0.5 * (m[0] - p[0]), 0.5 * (m[1] - p[1])]); }
    for (const [i, du, dv] of D) { sposta(i, du, dv); mossi.push(i); } }
  log('bordo liscio: vertici di bordo', R.size); }

// margine superiore rettilineo: dopo il bordo liscio il margine tra l'angolo superolaterale e la gobba mediale (U_RETTA[0] … U_RETTA[1]) può restare concavo.
// Il margine di destinazione è l'inviluppo convesso superiore di quello attuale (da U_RETTA[0] in poi: una retta fra angolo e gobba, poi in discesa);
// i vertici nella fascia `BANDA_RETTA` sotto il margine sono alzati in proporzione (smoothstep), stessa distanza dal centro della testa omerale;
// ripetuto dopo le pieghe (la media dei vicini abbassa di nuovo il margine) e dopo la spinta dall'omero
const rettifica = () => { const [SUa] = colonne(cur), k = u => Math.round(u / BIN), pts = []; for (let j = k(U_RETTA[0]); j <= k(U_RETTA[1]); j++) pts.push([j * BIN, SUa[j]]);
  const hull = []; for (const p of pts) { while (hull.length >= 2) { const [a, b] = hull.slice(-2); if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) hull.pop(); else break; } hull.push(p); }
  const Tg = u => { for (let j = 1; j < hull.length; j++) if (u <= hull[j][0]) { const [a, b] = [hull[j - 1], hull[j]]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]); } return hull.at(-1)[1]; };
  let n4 = 0, mx4 = 0;
  for (const i of sel) { const [u, v] = uv(cur, i); if (u < U_RETTA[0] || u > U_RETTA[1]) continue; const su = interp(SUa, u), dv = (Tg(u) - su) * ss((v - (su - BANDA_RETTA)) / BANDA_RETTA);
    if (dv > 1e-5) { sposta(i, 0, dv); mossi.push(i); n4++; mx4 = Math.max(mx4, dv); } }
  log('margine superiore rettilineo: vertici', n4, ', al massimo', (mx4 * 10).toFixed(2), 'mm');  };
rettifica();

// fori passanti dentro il contorno (in pagina un buco da cui si vedono le strutture sotto; di lato si vede attraverso): la faccia anteriore si infila in un
// tunnel fino alla posteriore, e ci sono vertici su cui poggiano sia triangoli rivolti alla camera sia triangoli rivolti indietro, lontano dal bordo del
// tendine (più di `DENTRO`). Per ogni gruppo si tolgono i triangoli entro `R_FORO` dal centro nel piano della vista (e entro 5 mm nello spazio): se restano
// esattamente due anelli di bordo (faccia anteriore e posteriore) ognuno è richiuso con triangoli sui suoi vertici (taglio delle orecchie nel piano della
// vista, stesso verso dei triangoli attorno), altrimenti il gruppo resta com'è. Nessun vertice nuovo: quelli rimasti dentro non sono più usati. Rilanciando lo
// script la topologia è già quella richiusa e non si trovano più fori.
{ const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], sb = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vf = new Map(); for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [0, 1, 2].map(k => [0, 1, 2].map(q => cur[3 * idx[t + k] + q])), f = crs(sb(b, a), sb(c, a)), d = (f[0] * n[0] + f[1] * n[1] + f[2] * n[2]) / (Math.hypot(...f) || 1);
    for (let k = 0; k < 3; k++) { const o = vf.get(idx[t + k]) || vf.set(idx[t + k], [0, 0]).get(idx[t + k]); if (d > 0.3) o[0]++; else if (d < -0.3) o[1]++; } }
  const [su, giu] = colonne(cur), sx = righe(cur), dentro = i => { const [u, v] = uv(cur, i), k = Math.round((v - vMin) / BIN);
    return u < U_LISCIO && v < interp(su, u) - D_FORO && v > interp(giu, u) + D_FORO && (k < 0 || k >= NV || u > sx[k] + D_FORO); };
  const gr = []; for (const i of sel) { const o = vf.get(i); if (!o || !o[0] || !o[1] || !dentro(i)) continue; const p = [0, 1, 2].map(q => cur[3 * i + q]);
    let g = gr.find(z => Math.hypot(...sb(z.p, p)) < 0.15); if (!g) gr.push(g = { p, v: [] }); g.v.push(i); }
  let I = Array.from(idx); const esiti = [];
  for (const g of gr) for (const RF of R_FORO) { const C = [0, 1, 2].map(q => g.v.reduce((s, i) => s + cur[3 * i + q], 0) / g.v.length), cu = C[0] * e1[0] + C[1] * e1[1] + C[2] * e1[2], cv = C[0] * e2[0] + C[1] * e2[1] + C[2] * e2[2];
    const via = new Set(); for (let t = 0; t < I.length; t += 3) { const c = [0, 1, 2].map(q => (cur[3 * I[t] + q] + cur[3 * I[t + 1] + q] + cur[3 * I[t + 2] + q]) / 3);
      if (Math.hypot(...sb(c, C)) < 0.5 && Math.hypot(c[0] * e1[0] + c[1] * e1[1] + c[2] * e1[2] - cu, c[0] * e2[0] + c[1] * e2[1] + c[2] * e2[2] - cv) < RF) via.add(t); }
    if (!via.size || proj([C[0], C[1], C[2]], 0, n) < davanti - PROF_FORO) continue;
    const lati = new Set(); for (let t = 0; t < I.length; t += 3) if (!via.has(t)) for (let k = 0; k < 3; k++) lati.add(I[t + k] + '_' + I[t + (k + 1) % 3]);
    const nx = new Map(); let semplice = true;
    for (let t = 0; t < I.length; t += 3) if (!via.has(t)) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; if (!lati.has(b + '_' + a)) { if (nx.has(b)) semplice = false; nx.set(b, a); } }
    const anelli = [], visti = new Set(); for (const a of nx.keys()) { if (visti.has(a)) continue; const A = []; let x = a; while (x !== undefined && !visti.has(x)) { visti.add(x); A.push(x); x = nx.get(x); } anelli.push(A); }
    if (!semplice || anelli.length !== 2) { if (RF === R_FORO[R_FORO.length - 1]) esiti.push(C.map(x => x.toFixed(2)).join(',') + ' lasciato (' + anelli.length + ' anelli)'); continue; }
    // taglio delle orecchie nel piano della vista, nell'ordine dell'anello (così i triangoli nuovi hanno il verso di quelli attorno)
    const nuovi = []; let ok = true;
    for (const A of anelli) { const Q = A.map(i => uv(cur, i)), area = Q.reduce((s, p, k) => { const q = Q[(k + 1) % Q.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) > 0 ? 1 : -1;
      const r = A.map((_, k) => k), cr2 = (a, b, c) => ((Q[b][0] - Q[a][0]) * (Q[c][1] - Q[a][1]) - (Q[c][0] - Q[a][0]) * (Q[b][1] - Q[a][1])) * area;
      while (r.length > 3) { let fatto = false;
        for (let k = 0; k < r.length && !fatto; k++) { const a = r[(k + r.length - 1) % r.length], b = r[k], c = r[(k + 1) % r.length]; if (cr2(a, b, c) <= 1e-9) continue;
          if (r.some(j => j !== a && j !== b && j !== c && cr2(a, b, j) > 0 && cr2(b, c, j) > 0 && cr2(c, a, j) > 0)) continue;
          nuovi.push(A[a], A[b], A[c]); r.splice(k, 1); fatto = true; }
        if (!fatto) { ok = false; break; } }
      if (!ok) break; nuovi.push(A[r[0]], A[r[1]], A[r[2]]); }
    if (!ok) { if (RF === R_FORO[R_FORO.length - 1]) esiti.push(C.map(x => x.toFixed(2)).join(',') + ' lasciato (anello non semplice nella vista)'); continue; }
    I = [...I.filter((_, k) => !via.has(k - k % 3)), ...nuovi]; esiti.push(C.map(x => x.toFixed(2)).join(',') + ' richiuso (raggio ' + RF + '): ' + via.size + ' triangoli → ' + nuovi.length / 3); break; }
  if (I.length !== idx.length || esiti.some(e => e.includes('richiuso'))) { idx = Uint32Array.from(I); nb = vicini(nv, idx); }
  log('fori passanti:', esiti.length ? esiti.join('; ') : 'nessuno'); }
// levigatura dove ci si è mossi: peso pieno sui vertici spostati di più di 0,2 mm e su un anello, poi a scendere
const w = new Float64Array(nv); { let fronte = new Set([...mossi.filter(i => Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k])) > 0.02), ...sel.filter(i => uv(cur, i)[0] < U_LISCIO)]); for (const i of fronte) w[i] = 1;
  for (let a = 1; a <= 4; a++) { const nuovo = new Set(); for (const i of fronte) for (const j of nb[i]) if (!w[j]) { w[j] = a <= 1 ? 1 : 1 - (a - 1) / 4; nuovo.add(j); } fronte = nuovo; } }
const zona = []; for (let i = 0; i < nv; i++) if (w[i] > 0) zona.push(i);
for (let it = 0; it < LEV; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
  for (const i of zona) { const L = nb[i]; if (!L.length) continue; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += w[i] * lam * (s / L.length - cur[3 * i + k]); } }
  cur.set(q); }
// pieghe (triangoli che si attraversano: in pagina buchi da cui si vedono le strutture sotto): media dei vicini sui loro vertici e su due anelli, finché non
// ne restano (al massimo `GIRI_PIEGHE` volte)
const sistemaPieghe = titolo => { const ins = new Set(zona), crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], sb = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const seg = (p, q, [a, b, c]) => { const e1 = sb(b, a), e2 = sb(c, a), d = sb(q, p), pv = crs(d, e2), det = dt(e1, pv); if (Math.abs(det) < 1e-12) return false; const s = sb(p, a), u = dt(s, pv) / det; if (u < 0 || u > 1) return false;
    const qv = crs(s, e1), v = dt(d, qv) / det; if (v < 0 || u + v > 1) return false; const t = dt(e2, qv) / det; return t > 0 && t < 1; };
  const key = i => [0, 1, 2].map(q => Math.round(cur[3 * i + q] * 1e4)).join();
  const pieghe = () => { const T = []; for (let t = 0; t < idx.length; t += 3) if (ins.has(idx[t]) || ins.has(idx[t + 1]) || ins.has(idx[t + 2])) T.push(t);
    const h = new Map(), V = t => [0, 1, 2].map(k => [cur[3 * idx[t + k]], cur[3 * idx[t + k] + 1], cur[3 * idx[t + k] + 2]]);
    for (const t of T) { const c = V(t).reduce((a, p) => a.map((x, q) => x + p[q] / 3), [0, 0, 0]), kk = c.map(x => Math.floor(x / 0.1)).join(); (h.get(kk) || h.set(kk, []).get(kk)).push(t); }
    const out = new Set();
    for (const [kk, L] of h) { const [a, b, c] = kk.split(',').map(Number), M = []; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) M.push(...(h.get([a + x, b + y, c + z].join()) || []));
      for (const s of L) { const A = V(s), ka = [0, 1, 2].map(k => key(idx[s + k])); for (const t of M) { if (t <= s) continue; const kb = [0, 1, 2].map(k => key(idx[t + k])); if (ka.some(x => kb.includes(x))) continue;
        const B2 = V(t); let o = false; for (let e = 0; e < 3 && !o; e++) o = seg(A[e], A[(e + 1) % 3], B2) || seg(B2[e], B2[(e + 1) % 3], A); if (o) { for (let k = 0; k < 3; k++) { out.add(idx[s + k]); out.add(idx[t + k]); } } } } }
    // creste: lati fra due triangoli quasi capovolti l'uno rispetto all'altro (la superficie si ripiega in una tasca) lontano dal bordo del tendine
    // (lì faccia anteriore e posteriore si incontrano di taglio: è normale); dentro il contorno di almeno `DENTRO` e prima di `U_LISCIO`
    const [su, giu] = colonne(cur), sx = righe(cur), dentro = i => { const [u, v] = uv(cur, i), k = Math.round((v - vMin) / BIN);
      return u < U_LISCIO && v < interp(su, u) - DENTRO && v > interp(giu, u) + DENTRO && (k < 0 || k >= NV || u > sx[k] + DENTRO); };
    const fn = t => { const [a, b, c] = V(t), f = crs(sb(b, a), sb(c, a)), l = Math.hypot(...f) || 1; return f.map(x => x / l); }, lati = new Map();
    for (const t of T) for (let k = 0; k < 3; k++) { const a = key(idx[t + k]), b = key(idx[t + (k + 1) % 3]), kk = a < b ? a + '|' + b : b + '|' + a; (lati.get(kk) || lati.set(kk, []).get(kk)).push(t); }
    for (const L of lati.values()) if (L.length === 2 && dt(fn(L[0]), fn(L[1])) < CRESTA) { const vv = [...[0, 1, 2].map(k => idx[L[0] + k]), ...[0, 1, 2].map(k => idx[L[1] + k])];
      if (vv.every(dentro)) vv.forEach(i => out.add(i)); }
    return out; };
  let P = pieghe(); const n0 = P.size; let g = 0;
  for (; g < GIRI_PIEGHE && P.size; g++) { const D = new Set(P); for (let r = 0; r < 2; r++) for (const v of [...D]) for (const j of nb[v]) D.add(j);
    for (let it = 0; it < 6; it++) { const q = cur.slice(); for (const i of D) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += 0.5 * (s / L.length - cur[3 * i + k]); } } cur.set(q); }
    P = pieghe(); }
  log(titolo, n0, '→', P.size, 'dopo', g, 'giri'); };
sistemaPieghe('pieghe: vertici');
rettifica();
// omero: i vertici a meno di `GAP_OSSO` dall'osso (l'estremità allargata scende sul trochine) sono spinti fuori lungo il gradiente della distanza
// e, sotto l'equatore della vista (v < 0), i vertici spostati che si sono staccati dall'osso più di quanto lo fossero prima (lo spostamento conserva la
// distanza dal centro della testa, ma sotto la testa l'osso rientra verso il collo) tornano alla loro distanza di prima dall'omero
{ const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const i of zona) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], cur[3 * i + k], pos0[3 * i + k]); hi[k] = Math.max(hi[k], cur[3 * i + k], pos0[3 * i + k]); }
  G.griglia(lo, hi, 0.03, 0.2);
  const F = G.esatta(G.sdf(G.unione(['omero'])).F, ['omero'], 0.1); let n0 = 0, nA = 0;
  for (const i of new Set(mossi)) { if (!nb[i].length || uv(cur, i)[1] >= 0) continue; const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d = G.sample(F, ...p), d0 = G.sample(F, pos0[3 * i], pos0[3 * i + 1], pos0[3 * i + 2]);
    if (d <= d0 + 0.02) continue; const g = G.grad(F, p), l = Math.hypot(...g) || 1, t = Math.min(1, -uv(cur, i)[1] / 0.3); for (let k = 0; k < 3; k++) cur[3 * i + k] -= t * g[k] / l * (d - d0); nA++; }
  log('omero: vertici riaccostati', nA);
  for (const i of zona) { const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d = G.sample(F, ...p); if (d >= GAP_OSSO) continue;
    const g = G.grad(F, p), l = Math.hypot(...g) || 1; for (let k = 0; k < 3; k++) cur[3 * i + k] += g[k] / l * (GAP_OSSO - d); n0++; }
  log('omero: vertici spinti fuori', n0); }
// di nuovo le pieghe, dopo la spinta dall'omero
sistemaPieghe('pieghe dopo l’omero: vertici');
rettifica();
// capsula: il tendine allargato verso il solco le passa davanti. Lungo il raggio dal centro della testa, ogni vertice della zona che ha la capsula entro
// `CAPS_MARCIA` più in fuori (o è a meno di `GAP_CAPS`) va oltre l'ultimo punto a meno di `GAP_CAPS` dalla capsula; lo spostamento si allarga nello spazio
// (entro `R_CAPS`, a scendere), così faccia profonda e superficiale del tendine si spostano insieme senza attraversarsi; fino a `GIRI_CAPS` volte
{ const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const i of zona) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], cur[3 * i + k]); hi[k] = Math.max(hi[k], cur[3 * i + k]); }
  G.griglia(lo, hi, 0.02, 0.4); const F = G.esatta(G.sdf(G.unione(['caps'])).F, ['caps'], 0.1);
  const rad = i => { const r = [0, 1, 2].map(q => cur[3 * i + q] - cTesta[q]), l = Math.hypot(...r); return r.map(x => x / l); };
  let n0 = 0, mx = 0; for (let giro = 0; giro < GIRI_CAPS; giro++) { const d = new Float64Array(nv); let n1 = 0;
  for (const i of zona) { const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], r = rad(i); let tU = -1;
    for (let t = 0; t <= CAPS_MARCIA; t += 0.005) if (G.sample(F, ...p.map((x, k) => x + t * r[k])) < GAP_CAPS) tU = t;
    if (tU >= 0) { d[i] = tU + 0.005; n1++; } }
  if (!n1) break; if (!giro) n0 = n1;
  const src = zona.filter(i => d[i] > 0), D = new Float64Array(nv);
  for (const i of zona) for (const j of src) { const r = Math.hypot(...[0, 1, 2].map(q => cur[3 * i + q] - cur[3 * j + q])); if (r < R_CAPS) D[i] = Math.max(D[i], d[j] * (1 - sstep(0, R_CAPS, r))); }
  for (const i of zona) if (D[i] > 1e-4) { const r = rad(i); for (let k = 0; k < 3; k++) cur[3 * i + k] += D[i] * r[k]; mx = Math.max(mx, D[i]); } }
  log('capsula: vertici vicini', n0, ', tendine spostato in fuori al massimo di', (mx * 10).toFixed(2), 'mm'); }
stampa(cur, 'dopo');
{ let mx = 0; for (const i of zona) mx = Math.max(mx, Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k]))); log('spostamento massimo', (mx * 10).toFixed(2), 'mm'); }

// capo breve del bicipite: passa davanti al tendine, e l'angolo inferolaterale ora più ampio gli arriva sotto. I vertici del capo breve entro `SEP_BB` dal
// tendine (o dentro) vanno avanti, lungo la direzione di vista, quanto serve per uscirne; lo spostamento si allarga sulla mesh del capo breve (media dei
// vicini tenendo il massimo, `GIRI_BB` volte) così il muscolo si sposta tutto insieme senza assottigliarsi
let bbPos = null; const A0 = G.attrs(NOME);
{ setMesh(NOME, { pos: Float32Array.from(cur), idx }); const BB = REAL('bic_breve'), P = Float64Array.from(BB.pos), nbB = vicini(BB.nv, BB.idx);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const i of zona) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], cur[3 * i + k]); hi[k] = Math.max(hi[k], cur[3 * i + k]); }
  G.griglia(lo, hi, 0.02, 0.2); const F = G.esatta(G.sdf(G.unione([NOME])).F, [NOME], 0.1);
  const dent = p => p.every((x, k) => x > lo[k] - 0.15 && x < hi[k] + 0.15);
  const d = new Float64Array(BB.nv); let n0 = 0;
  for (let i = 0; i < BB.nv; i++) { const p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]]; if (!dent(p) || G.sample(F, ...p) >= SEP_BB) continue;
    let t = 0; while (t < 1 && G.sample(F, ...p.map((x, k) => x + t * n[k])) < SEP_BB) t += 0.005; d[i] = t; n0++; }
  let D = d; for (let g = 0; g < GIRI_BB; g++) { const E = D.slice(); for (let i = 0; i < BB.nv; i++) { const L = nbB[i]; if (!L.length) continue; let s = 0; for (const j of L) s += D[j]; E[i] = Math.max(d[i], 0.5 * D[i] + 0.5 * s / L.length); } D = E; }
  let mx = 0; for (let i = 0; i < BB.nv; i++) if (D[i] > 1e-4) { for (let k = 0; k < 3; k++) P[3 * i + k] += D[i] * n[k]; mx = Math.max(mx, D[i]); }
  if (n0) bbPos = Float32Array.from(P);
  log('capo breve del bicipite: vertici vicini al tendine', n0, ', spostato in avanti al massimo di', (mx * 10).toFixed(2), 'mm'); }

// normali di vertice: quelle già nel file, ricalcolate (media dei triangoli, pesata dall'area) sui vertici spostati e sui loro vicini
const m = G.man.meshes.findLast(x => x.n === NOME);
const nrm = m.nm !== undefined ? Int8Array.from(new Int8Array(G.buf0.buffer, G.buf0.byteOffset + m.nm, nv * 3)) : null;
if (nrm) { const toccati = new Set(zona); for (const i of zona) for (const j of nb[i]) toccati.add(j);
  const acc = new Map([...toccati].map(i => [i, [0, 0, 0]]));
  for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(i => acc.has(i))) continue;
    const a = [0, 1, 2].map(q => cur[3 * T[1] + q] - cur[3 * T[0] + q]), b2 = [0, 1, 2].map(q => cur[3 * T[2] + q] - cur[3 * T[0] + q]), f = [a[1] * b2[2] - a[2] * b2[1], a[2] * b2[0] - a[0] * b2[2], a[0] * b2[1] - a[1] * b2[0]];
    for (const i of T) if (acc.has(i)) for (let k = 0; k < 3; k++) acc.get(i)[k] += f[k]; }
  for (const [i, f] of acc) { const l = Math.hypot(...f) || 1, o = [0, 1, 2].map(k => nrm[3 * i + k]), s = o[0] * f[0] + o[1] * f[1] + o[2] * f[2] < 0 ? -1 : 1;   // segno come quello già scritto
    for (let k = 0; k < 3; k++) nrm[3 * i + k] = Math.round(127 * s * f[k] / l); } }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { const a = A0; setMesh(NOME, { pos: Float32Array.from(cur), idx, tag: a.tag, fdir: a.fdir, nrm }); if (bbPos) G.setPos('bic_breve', bbPos); saveFile(repack()); }
