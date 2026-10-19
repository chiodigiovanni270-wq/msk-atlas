/* Rifinitura del tendine del sottoscapolare (`subs`) della spalla (modelli/spalla-3d.html): margine superiore più alto e estremità laterale più ampia e
   arrotondata sul trochine, così l'intervallo dei rotatori (tra sovraspinato e sottoscapolare) non resta uno spazio troppo largo.

   Uso (dalla cartella del progetto):
     node strumenti/rifinitura-subs-spalla.mjs                  → riscrive `subs` nel file del modello
     PROVA=1 node strumenti/rifinitura-subs-spalla.mjs          → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/rifinitura-subs-spalla.mjs   → lavora su una copia
   Va lanciato dopo `muscoli-spalla.mjs` (con le altre `rifinitura-*-spalla.mjs`, in qualsiasi ordine) e prima di `borsa-spalla.mjs`. Riparte dalle
   posizioni di `subs` della revisione `BASE` (stessa topologia), quindi si può rilanciare con lo stesso risultato; se si rilancia `muscoli-spalla.mjs` e
   cambia `subs`, aggiornare `BASE`.

   Metodo. Nella vista anteriore (`VISTA`: theta, phi della camera della pagina) u va verso destra (medialmente) e v verso l'alto; l'estremità laterale del
   tendine è il punto con u minimo (`U0`); margini superiore e inferiore per colonne u, laterale per righe v (dai vertici fino a `PROF` dietro il davanti).
   Tre stiramenti in fasce lungo i margini (spostamento pieno sul margine, nullo al limite interno della fascia, smoothstep: monotono, nessuna piega):
     - in alto: fascia `BANDA_SU`, il margine superiore sale di `A_SU` × f(u), con f = 1 fino a `PIENO_SU` dall'estremità e poi a scendere fino a 0 a `L_SU`;
     - di lato: fascia `BANDA_LAT`, il margine laterale si sposta di `A_LAT` × g(v), con g pieno sopra `V_LAT[1]` e nullo sotto `V_LAT[0]` (più in basso il
       capo breve del bicipite passa davanti: allargare lì lo attraversava);
     - in basso: fascia `BANDA_GIU`, `A_GIU` fino a `L_GIU` (ora 0: il margine inferiore va già bene e sotto c'è il capo breve).
   Il margine superiore nuovo si raccorda all'estremità con un arco di raggio `R_ANGOLO` (angolo superolaterale arrotondato).
   Poi i vertici sono riportati alla distanza di prima dal centro della testa omerale (il tendine resta appoggiato), levigati dove si sono mossi (Taubin,
   `LEV`) e tenuti a `GAP_OSSO` dall'omero. Normali di vertice (`nm`) ricalcolate sui vertici spostati e sui vicini. Controlli stampati: margini
   superiore e inferiore per colonne e margine laterale per righe, prima e dopo; spostamento massimo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { vicini } = await import('./lib-bp3d.mjs');
const { REAL, posDaRevisione, setMesh, saveFile, repack, log } = G;

const BASE = 'fc755f7', NOME = 'subs';
const VISTA = [-0.25, 0.15], PROF = 3.0, ZONA = 4.5;                   // cm; vertici entro ZONA dall'estremità (in u) e non più di PROF dietro il davanti
const A_SU = 0.8, PIENO_SU = 1.2, L_SU = 4.0, BANDA_SU = 1.0, R_ANGOLO = 0.6;   // cm
const A_LAT = 0.35, MEZZO_LAT = 1.2, BANDA_LAT = 0.8, V_LAT = [-0.6, 0.3];   // cm (V_LAT: quote v della vista)
const A_GIU = 0.0, L_GIU = 1.5, BANDA_GIU = 0.6;                       // cm
const BIN = 0.1, LEV = 30, GAP_OSSO = 0.05;

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
const proj = (P, i, e) => P[3 * i] * e[0] + P[3 * i + 1] * e[1] + P[3 * i + 2] * e[2];
// estremità: il vertice più a sinistra fra quelli davanti (la faccia anteriore del tendine sulla testa omerale)
let davanti = -1e9; for (let i = 0; i < nv; i++) davanti = Math.max(davanti, proj(cur, i, n));
const vis = []; for (let i = 0; i < nv; i++) if (proj(cur, i, n) > davanti - PROF) vis.push(i);
let U0 = 1e9; for (const i of vis) U0 = Math.min(U0, proj(cur, i, e1));
const sel = vis.filter(i => proj(cur, i, e1) < U0 + ZONA);
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

// levigatura dove ci si è mossi: peso pieno sui vertici spostati di più di 0,2 mm e su un anello, poi a scendere
const w = new Float64Array(nv); { let fronte = new Set(mossi.filter(i => Math.hypot(...[0, 1, 2].map(k => cur[3 * i + k] - pos0[3 * i + k])) > 0.02)); for (const i of fronte) w[i] = 1;
  for (let a = 1; a <= 4; a++) { const nuovo = new Set(); for (const i of fronte) for (const j of nb[i]) if (!w[j]) { w[j] = a <= 1 ? 1 : 1 - (a - 1) / 4; nuovo.add(j); } fronte = nuovo; } }
const zona = []; for (let i = 0; i < nv; i++) if (w[i] > 0) zona.push(i);
for (let it = 0; it < LEV; it++) { const lam = it % 2 ? -0.53 : 0.5, q = cur.slice();
  for (const i of zona) { const L = nb[i]; for (let k = 0; k < 3; k++) { let s = 0; for (const j of L) s += cur[3 * j + k]; q[3 * i + k] += w[i] * lam * (s / L.length - cur[3 * i + k]); } }
  cur.set(q); }
// omero: i vertici a meno di `GAP_OSSO` dall'osso (l'estremità allargata scende sul trochine) sono spinti fuori lungo il gradiente della distanza
{ const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const i of zona) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], cur[3 * i + k]); hi[k] = Math.max(hi[k], cur[3 * i + k]); }
  G.griglia(lo, hi, 0.03, 0.2);
  const F = G.esatta(G.sdf(G.unione(['omero'])).F, ['omero'], 0.1); let n0 = 0;
  for (const i of zona) { const p = [cur[3 * i], cur[3 * i + 1], cur[3 * i + 2]], d = G.sample(F, ...p); if (d >= GAP_OSSO) continue;
    const g = G.grad(F, p), l = Math.hypot(...g) || 1; for (let k = 0; k < 3; k++) cur[3 * i + k] += g[k] / l * (GAP_OSSO - d); n0++; }
  log('omero: vertici spinti fuori', n0); }
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
  for (const [i, f] of acc) { const l = Math.hypot(...f) || 1, o = [0, 1, 2].map(k => nrm[3 * i + k]), s = o[0] * f[0] + o[1] * f[1] + o[2] * f[2] < 0 ? -1 : 1;   // segno come quello già scritto
    for (let k = 0; k < 3; k++) nrm[3 * i + k] = Math.round(127 * s * f[k] / l); } }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { const a = G.attrs(NOME); setMesh(NOME, { pos: Float32Array.from(cur), idx, tag: a.tag, fdir: a.fdir, nrm }); saveFile(repack()); }
