/* Nervo radiale della spalla (modelli/spalla-3d.html): dal tracciato al solco radiale dell'omero.

   Problema. In `vasi-nervi-spalla.mjs` il radiale segue una guida fissa e, dietro l'omero, resta a 1–2,4 cm dall'osso, dentro il capo mediale
   e poi il capo laterale del tricipite. In anatomia il nervo scende nel solco radiale (spirale), appoggiato all'osso, tra il capo mediale
   (sotto) e il laterale (sopra): non attraversa il ventre di un muscolo. Con il nervo a distanza i canali di `nervi-muscoli-spalla.mjs`
   erano tunnel dentro i capi; con il nervo sull'osso diventano solchi tra osso e muscolo.

   Uso (dalla cartella del progetto):
     node strumenti/radiale-spalla.mjs                 → sposta il nervo nel file del modello
     PROVA=1 node strumenti/radiale-spalla.mjs         → stampa distanze e spostamenti senza scrivere
     MODELLO=/tmp/copia.html node strumenti/radiale-spalla.mjs   → lavora su una copia
   Va lanciato dopo `sezioni-spalla.mjs` e PRIMA di `nervi-muscoli-spalla.mjs` (che scava i muscoli attorno al nervo nella posizione nuova).
   Se si rilancia dopo `nervi-muscoli-spalla.mjs` i muscoli hanno ancora il canale del tracciato vecchio: ripartire dalle mesh di prima
   (revisione git di `sezioni-spalla.mjs`) e rilanciare i due script in ordine. Non si può rilanciare sul proprio risultato (il nervo è già
   sull'osso: lo spostamento è ~0, quindi è innocuo).

   Metodo. Linea centrale del nervo: baricentro dei vertici per fette di 0,25 cm in y. Per ogni fetta si cerca il punto sul solco: dalla linea
   centrale lungo il gradiente della distanza con segno dall'omero fino a distanza `RAGGIO` + `GIOCO_OSSO` dalla superficie. Lo spostamento
   (bersaglio − centro) pesa da 0 a 1 tra y = `Y_INIZIO` (lì il nervo esce dall'ascella ed è com'era) e `Y_PIENO`, è levigato con un
   filtro gaussiano di `SIGMA` fette e applicato per interpolazione lineare in y a tutti i vertici della fetta: il tubo conserva
   calibro e piano di taglio a y = −14. Nessun vertice entra nell'omero (controllo: distanza minima dall'osso). Stampa distanza dall'osso e
   spostamento per fetta, lunghezza della linea centrale prima e dopo.

   Capo mediale. Il tracciato vecchio del radiale (`vasi-nervi-spalla.mjs`) aveva spinto in fuori i vertici di `tri_med` sopra il nervo:
   restava una gobba con una piega scura sul lato mediale (y ≈ −9). Dopo lo spostamento del nervo i vertici del capo mediale entro
   `SPIANA`[0] (0,9 cm) dal tracciato vecchio (fra y = `SPIANA_Y`) si levigano con `SPIANA_IT` passi di Taubin pesati (peso 1 entro
   `SPIANA`[0], 0 oltre `SPIANA`[1] = 1,8 cm): spostamento massimo ~6,5 mm. Variabili: SPIANA0, SPIANA1, SPIANA_IT. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setPos, repack, saveFile, log, sstep, griglia, campo, sample } = G;

const PROVA = !!process.env.PROVA;
const Y_INIZIO = +(process.env.Y_INIZIO ?? -5.5), Y_PIENO = +(process.env.Y_PIENO ?? -9.5), FETTA = 0.25, SIGMA = +(process.env.SIGMA ?? 3), RAGGIO = 0.17, GIOCO_OSSO = +(process.env.GIOCO_OSSO ?? 0.15), MARGINE = 0.03, SPIANA = [+(process.env.SPIANA0 ?? 0.9), +(process.env.SPIANA1 ?? 1.8)], SPIANA_Y = [-7.5, -12.5], SPIANA_IT = +(process.env.SPIANA_IT ?? 300);   // cm

const { pos, nv } = REAL('n_radiale'), P = Float32Array.from(pos.subarray(0, nv * 3));
let ylo = 1e9, yhi = -1e9, xlo = [1e9, 1e9], xhi = [-1e9, -1e9];
for (let i = 0; i < nv; i++) { const y = P[3 * i + 1]; ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); for (const [k, a] of [[0, 0], [2, 1]]) { xlo[a] = Math.min(xlo[a], P[3 * i + k]); xhi[a] = Math.max(xhi[a], P[3 * i + k]); } }
griglia([xlo[0], ylo, xlo[1]], [xhi[0], yhi, xhi[1]], 0.03, 1.2);
const F = campo(['omero']).F, f = p => sample(F, p[0], p[1], p[2]);
const gr = p => { const e = 0.03; return [0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += e; b[k] -= e; return (f(a) - f(b)) / (2 * e); }); };

// linea centrale per fette
const ns = Math.round((yhi - ylo) / FETTA) + 1, cen = [], ys = [];
for (let s = 0; s < ns; s++) { const y = ylo + s * FETTA; let n = 0, c = [0, 0, 0]; for (let i = 0; i < nv; i++) if (Math.abs(P[3 * i + 1] - y) < FETTA / 2) { n++; for (let k = 0; k < 3; k++) c[k] += P[3 * i + k]; }
  if (!n) { cen.push(null); ys.push(y); continue; } cen.push(c.map(v => v / n)); ys.push(y); }
const D = RAGGIO + GIOCO_OSSO, sh = cen.map((c, s) => { if (!c) return [0, 0, 0]; let p = c.slice();
  for (let it = 0; it < 30; it++) { const d = f(p), g = gr(p), l = Math.hypot(...g) || 1; const e = d - D; if (Math.abs(e) < 1e-4) break; p = p.map((v, k) => v - 0.8 * e * g[k] / l); }
  const w = sstep(Y_INIZIO, Y_PIENO, ys[s]); return [0, 1, 2].map(k => w * (p[k] - c[k]) * (k === 1 ? 0 : 1)); });
// levigatura gaussiana dello spostamento lungo il nervo, poi correzione: dove una fetta resterebbe a meno di `MARGINE` dall'osso la si
// allontana lungo il gradiente della distanza e si leviga di nuovo (al massimo 12 giri)
const liscia = sh => sh.map((_, s) => { let W = 0, v = [0, 0, 0]; for (let t = -3 * SIGMA; t <= 3 * SIGMA; t++) { const u = s + t; if (u < 0 || u >= ns) continue; const w = Math.exp(-t * t / (2 * SIGMA * SIGMA)); W += w; for (let k = 0; k < 3; k++) v[k] += w * sh[u][k]; } return v.map(x => x / W); });
const delta = (G, y) => { const u = Math.max(0, Math.min(ns - 1.001, (y - ylo) / FETTA)), s = Math.floor(u), t = u - s; return [0, 1, 2].map(k => G[s][k] * (1 - t) + G[s + 1][k] * t); };
const fMin = G => { const m = new Array(ns).fill(1e9); for (let i = 0; i < nv; i++) { const y = P[3 * i + 1], d = delta(G, y), s = Math.round((y - ylo) / FETTA); m[s] = Math.min(m[s], f([P[3 * i] + d[0], y, P[3 * i + 2] + d[2]])); } return m; };
let gauss = liscia(sh);
for (let giro = 0; giro < 12; giro++) { const m = fMin(gauss); let tocca = 0;
  m.forEach((v, s) => { if (v >= MARGINE || !cen[s]) return; tocca++; const c = cen[s].map((x, k) => x + gauss[s][k]), g = gr(c), l = Math.hypot(...g) || 1; sh[s] = sh[s].map((x, k) => x + (k === 1 ? 0 : (MARGINE - v) * 1.2 * g[k] / l)); });
  if (!tocca) break; gauss = liscia(sh); }
const Q = Float32Array.from(P); for (let i = 0; i < nv; i++) { const d = delta(gauss, P[3 * i + 1]); for (let k = 0; k < 3; k++) Q[3 * i + k] += d[k]; }

// controlli
const lun = L => L.reduce((s, c, i) => i && c && L[i - 1] ? s + Math.hypot(c[0] - L[i - 1][0], c[1] - L[i - 1][1], c[2] - L[i - 1][2]) : s, 0);
const cen2 = cen.map((c, s) => c && c.map((v, k) => v + gauss[s][k]));
let dmin = 1e9; for (let i = 0; i < nv; i++) dmin = Math.min(dmin, f([Q[3 * i], Q[3 * i + 1], Q[3 * i + 2]]));
for (let s = 0; s < ns; s += 3) if (cen[s]) log('y', ys[s].toFixed(2), 'distanza dall\'osso (centro)', f(cen[s]).toFixed(2), '→', f(cen2[s]).toFixed(2), '| spostamento', Math.hypot(...gauss[s]).toFixed(2), 'cm');
log('linea centrale', lun(cen).toFixed(2), '→', lun(cen2).toFixed(2), 'cm | distanza minima dei vertici dall\'osso', (dmin * 10).toFixed(2), 'mm');
if (dmin < 0) { log('ATTENZIONE: vertici dentro l\'osso, non scritto'); process.exit(1); }
// capo mediale: il tracciato vecchio spingeva in fuori la superficie sopra il nervo (rigonfiamento con una piega scura sul lato mediale, a y ≈ −9,2);
// col nervo spostato resta solo la gobba: Taubin pesato attorno al tracciato vecchio (peso 1 entro `SPIANA`[0], 0 oltre `SPIANA`[1])
{ const M = REAL('tri_med'), V = Float64Array.from(M.pos.subarray(0, M.nv * 3)), key = new Map(), g = new Int32Array(M.nv), pts = [];
  const lin = cen.filter((c, s) => c && ys[s] <= SPIANA_Y[0] && ys[s] >= SPIANA_Y[1]); for (let i = 1; i < lin.length; i++) for (let t = 0; t < 1; t += 0.1) pts.push(lin[i - 1].map((v, k) => v + t * (lin[i][k] - v)));
  const dmin = i => { let d = 1e9; for (const q of pts) d = Math.min(d, Math.hypot(V[3 * i] - q[0], V[3 * i + 1] - q[1], V[3 * i + 2] - q[2])); return d; };
  for (let i = 0; i < M.nv; i++) { const k = Math.round(V[3 * i] * 2e4) + ',' + Math.round(V[3 * i + 1] * 2e4) + ',' + Math.round(V[3 * i + 2] * 2e4); if (!key.has(k)) key.set(k, key.size); g[i] = key.get(k); }
  const ng = key.size, nb = Array.from({ length: ng }, () => new Set()), W = new Float64Array(ng), X = new Float64Array(ng * 3);
  for (let t = 0; t < M.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = g[M.idx[t + e]], b = g[M.idx[t + (e + 1) % 3]]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
  for (let i = 0; i < M.nv; i++) { X.set(V.subarray(3 * i, 3 * i + 3), 3 * g[i]); W[g[i]] = 1 - sstep(SPIANA[0], SPIANA[1], dmin(i)); }
  const NB = nb.map(x => [...x]); let mosse = 0; for (let i = 0; i < ng; i++) if (W[i] > 0) mosse++;
  for (let it = 0; it < SPIANA_IT; it++) { const lam = it % 2 ? -0.53 : 0.5, R = X.slice(); for (let i = 0; i < ng; i++) { if (!W[i] || !NB[i].length) continue; const m = [0, 0, 0]; for (const j of NB[i]) for (let k = 0; k < 3; k++) m[k] += X[3 * j + k] / NB[i].length; for (let k = 0; k < 3; k++) R[3 * i + k] += lam * W[i] * (m[k] - X[3 * i + k]); } X.set(R); }
  const T = Float32Array.from(M.pos.subarray(0, M.nv * 3)); let dmax = 0; for (let i = 0; i < M.nv; i++) { for (let k = 0; k < 3; k++) T[3 * i + k] = X[3 * g[i] + k]; dmax = Math.max(dmax, Math.hypot(T[3 * i] - V[3 * i], T[3 * i + 1] - V[3 * i + 1], T[3 * i + 2] - V[3 * i + 2])); }
  log('capo mediale spianato attorno al tracciato vecchio:', mosse, 'vertici, spostamento massimo', (dmax * 10).toFixed(2), 'mm'); setPos('tri_med', T); }
setPos('n_radiale', Q);
if (!PROVA) saveFile(repack());
