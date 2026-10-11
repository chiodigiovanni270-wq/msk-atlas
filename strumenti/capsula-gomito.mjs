/* Capsula articolare del gomito (modelli/gomito-3d.html): mesh `caps`.

   Uso (dalla cartella del progetto):
     node strumenti/capsula-gomito.mjs                  → riscrive la mesh nel file del modello
     node strumenti/capsula-gomito.mjs --prova=f.json   → non tocca il modello: scrive la capsula (con ossa e cartilagini) in un JSON
     MODELLO=/tmp/copia.html node strumenti/capsula-gomito.mjs   → lavora su una copia

   Un'unica capsula avvolge le articolazioni omero-ulnare, omero-radiale e radio-ulnare prossimale: un manicotto continuo, aperto alle due estremità dove
   si inserisce sull'osso. La capsula originale era un telo con bordi frastagliati, con ampie aperture sui lati mediale e laterale e interrotta sopra
   le fossette. Qui il manicotto è costruito per anelli lungo l'asse del braccio (y):
     1. contenuto articolare = omero (fino a `Y.H`, entro `X.H` ai lati: epicondili esclusi, sono extracapsulari), ulna (da `Y.U`), radio (da `Y.R`) e
        cartilagini; per ogni quota y la superficie tesa è la chiusura morfologica 2D (raggio `chiusura`) della proiezione del contenuto in una finestra di ± `finestra`
        cm lungo y: aderisce all'osso e scavalca solchi, interlinee e fossette (coronoidea, radiale, olecranica: il grasso sta tra osso e superficie);
     2. il guscio, di spessore `th`, sta appena fuori dalla superficie tesa; verso le due estremità lo spessore scende a zero (`rastrema`), dove la capsula si fonde con l'osso;
     3. il guscio è tagliato esattamente sulla superficie ossea (dove un osso lo attraversa, come agli epicondili, finisce lì: è la linea d'inserzione),
        poi surface nets, componenti principali, orientamento verso l'esterno.
   Riparte sempre da ossa e cartilagini incorporate (che non modifica). Ordine di lancio: ossa-gomito → cartilagini-gomito → legamenti-gomito →
   capsula-gomito → cuscinetti-gomito (i cuscinetti usano la faccia profonda della capsula). Parametri nell'oggetto P. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { setMesh, clamp, sstep, log, repack, saveFile, esatta, REAL, griglia, sdf, sfoca, unione, nets } = G;

const P = {
  passo: 0.04, lo: [-3.9, -2.3, -2.8], hi: [4.0, 3.7, 2.6],
  finestra: 0.6,                       // cm: finestra lungo y entro cui il contenuto concorre all'inviluppo di ogni anello
  Y: { H: [-0.7, 3.1], Hlati: 1.3, U: [-1.4, 2.0], R: [-1.5, 0.3] },   // intervalli di quota (cm) in cui omero, ulna e radio entrano nel contenuto
  X: { H: [-3.0, 3.0, 1.0, 2.6, 0.2] }, // omero: intervallo di x; la quota massima scende di `Y.Hlati` tra |x−x0| = [2]…[3] (x0 = [4]): ai lati la capsula si inserisce più in basso, alla base degli epicondili
  fuori: 0.015, th: 0.10,              // distanza dall'inviluppo e spessore del guscio (cm)
  thkMin: 0.05,                       // cm: sotto questo spessore il guscio non si costruisce (sotto il passo della griglia genererebbe schegge)
  rastrema: 0.6,                       // cm: tratto, lungo y a partire dalle linee d'inserzione, in cui lo spessore scende a zero
  // linee d'inserzione curve (non piani y = costante): quota massima sull'omero e minima su ulna/radio in funzione di (x, z); z > 0 anteriore, x < 0 laterale
  top: { post: 0.4, ant: 0.25 },       // cm in più sopra la fossetta olecranica (z < −0.2) e sopra le fossette coronoidea/radiale (z > 0.2, al centro)
  bot: { y0: -1.35, post: 0.9, rad: 0.45, med: 0.45 },  // quota minima: -1.35 cm al centro; più alta dietro (bordo articolare dell'olecrano), più alta sul lato mediale (margine del coronoide), più bassa attorno al collo del radio (legamento anulare)
  gbone: 0.012,                        // distanza minima dall'osso (cm)
  chiusura: 0.9, levigaD: 4,                       // cm: raggio della chiusura morfologica 2D per sezione
};
const OSSA = ['omero', 'ulna', 'radio', 'cart_omero', 'cart_ulna', 'cart_radio'];

const yTop = (x, z) => P.Y.H[1] - P.Y.Hlati * sstep(P.X.H[2], P.X.H[3], Math.abs(x - P.X.H[4]))
  + P.top.post * sstep(-0.2, -1.1, z) + P.top.ant * sstep(0.2, 1.0, z) * (1 - sstep(1.0, 2.2, Math.abs(x - P.X.H[4])));
const yBot = (x, z) => P.bot.y0 + P.bot.post * sstep(0, -1.2, z) + P.bot.med * sstep(0.2, 1.2, x) - P.bot.rad * sstep(-0.3, -1.3, x);
griglia(P.lo, P.hi, P.passo, 0);
const { NX, NY, NZ, NXY, O, H } = G, N = G.N;
log('griglia', NX, NY, NZ, (N / 1e6).toFixed(1), 'M voxel');
const { F: F0 } = sdf(unione(OSSA)), FBall = esatta(sfoca(F0, 1), OSSA, 0.1);

// contenuto articolare: presenza di osso nel territorio, per colonna (i, k) e quota j
const SH = unione(['omero', 'cart_omero']), SU = unione(['ulna', 'cart_ulna']), SR = unione(['radio', 'cart_radio']);
const pres = new Uint8Array(N);
for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { const y = O[1] + (j + 0.5) * H, z = O[2] + (k + 0.5) * H; for (let i = 0; i < NX; i++) {
  const id = i + NX * (j + NY * k), x = O[0] + (i + 0.5) * H;
  if ((SH[id] && y >= P.Y.H[0] && y <= yTop(x, z) && x >= P.X.H[0] && x <= P.X.H[1]) || (SU[id] && y >= yBot(x, z) && y <= P.Y.U[1]) || (SR[id] && y >= yBot(x, z) && y <= P.Y.R[1])) pres[id] = 1; } }
// presenza entro la finestra ±w (somme cumulative lungo j)
const w = Math.round(P.finestra / H), cum = new Int32Array(NX * NZ * (NY + 1));
const ci = (i, j, k) => i + NX * (k + NZ * j);
for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) cum[ci(i, j + 1, k)] = cum[ci(i, j, k)] + pres[i + NX * (j + NY * k)];
const inWin = (i, j, k) => cum[ci(i, Math.min(NY, j + w + 1), k)] - cum[ci(i, Math.max(0, j - w), k)] > 0;

// per ogni quota j: maschera 2D (x–z) del contenuto presente nella finestra, chiusura morfologica di raggio `chiusura` (dilatazione ed erosione con
// distanza chamfer 3-4): la superficie tesa aderisce all'osso e scavalca solo solchi, interlinee e fossette; poi distanza dal bordo (positiva fuori)
const dist2 = (mask, inv) => { // distanza (cm) dai pixel con mask != inv (0 dentro l'insieme), chamfer 3-4
  const D = new Float32Array(NX * NZ), INF = 1e9; for (let q = 0; q < NX * NZ; q++) D[q] = (mask[q] ? 1 : 0) === (inv ? 0 : 1) ? 0 : INF;
  const at = (i, k) => (i < 0 || k < 0 || i >= NX || k >= NZ) ? (inv ? 0 : INF) : D[i + NX * k];   // fuori griglia = complemento (l'erosione non sale sul bordo)
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const q = i + NX * k; D[q] = Math.min(D[q], at(i - 1, k) + 3, at(i, k - 1) + 3, at(i - 1, k - 1) + 4, at(i + 1, k - 1) + 4); }
  for (let k = NZ - 1; k >= 0; k--) for (let i = NX - 1; i >= 0; i--) { const q = i + NX * k; D[q] = Math.min(D[q], at(i + 1, k) + 3, at(i, k + 1) + 3, at(i + 1, k + 1) + 4, at(i - 1, k + 1) + 4); }
  for (let q = 0; q < D.length; q++) D[q] = D[q] / 3 * H; return D; };
const Dout = new Float32Array(N).fill(9), tap = new Float32Array(NY);
let j0 = -1, j1 = -1;
for (let j = 0; j < NY; j++) {
  let own = false; const m = new Uint8Array(NX * NZ);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { if (pres[i + NX * (j + NY * k)]) own = true; if (inWin(i, j, k)) m[i + NX * k] = 1; }
  if (!own) continue;
  if (j0 < 0) j0 = j; j1 = j;
  const dl = dist2(m, false);                        // distanza dall'insieme (fuori), 0 dentro
  const cl = new Uint8Array(NX * NZ); for (let q = 0; q < cl.length; q++) cl[q] = dl[q] <= P.chiusura ? 1 : 0;
  const de = dist2(cl, true);                        // distanza dal complemento della dilatazione (dentro la dilatazione)
  const chi = new Uint8Array(NX * NZ); for (let q = 0; q < chi.length; q++) chi[q] = cl[q] && de[q] > P.chiusura ? 1 : 0;   // erosione = chiusura
  for (let q = 0; q < chi.length; q++) if (m[q]) chi[q] = 1;
  const d = dist2(chi, false);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) Dout[i + NX * (j + NY * k)] = d[i + NX * k];
}
log('sezioni', j0, '→', j1, '(y', (O[1] + (j0 + 0.5) * H).toFixed(2), '→', (O[1] + (j1 + 0.5) * H).toFixed(2) + ')');
for (let i = 0; i < N; i++) Dout[i] = Math.min(Dout[i], 1.5);
for (let p = 0; p < P.levigaD; p++) sfoca(Dout, 3);      // le sezioni sono indipendenti: la levigatura 3D toglie i gradini lungo y
const V = new Float32Array(N).fill(1);
for (let j = j0; j <= j1; j++) {
  const y = O[1] + (j + 0.5) * H;
  for (let k = 0; k < NZ; k++) { const z = O[2] + (k + 0.5) * H; for (let i = 0; i < NX; i++) { const id = i + NX * (j + NY * k), d = Dout[id];
    const x = O[0] + (i + 0.5) * H;
    // lo spessore scende a zero in modo dolce lungo le linee d'inserzione curve (distanza in y dalla quota minima e massima della colonna)
    const thk = P.th * sstep(0, P.rastrema, Math.min(y - yBot(x, z), yTop(x, z) - y));
    if (thk < P.thkMin || d > P.fuori + thk + 0.1) continue;
    V[id] = Math.max(d - (P.fuori + thk), P.fuori - d, P.gbone - FBall[id]); } }
}
log('campo costruito');
function componentiPrincipali(Vf, quota = 0.05) {
  const lab = new Int32Array(N), vol = [0]; let n = 0;
  for (let s = 0; s < N; s++) { if (Vf[s] >= 0 || lab[s]) continue; n++; vol.push(0); const st = [s]; lab[s] = n;
    while (st.length) { const id = st.pop(); vol[n]++; const i = id % NX, j = ((id / NX) | 0) % NY, k = (id / NXY) | 0;
      for (const [ok, d] of [[i > 0, -1], [i < NX - 1, 1], [j > 0, -NX], [j < NY - 1, NX], [k > 0, -NXY], [k < NZ - 1, NXY]]) if (ok && Vf[id + d] < 0 && !lab[id + d]) { lab[id + d] = n; st.push(id + d); } } }
  const mx = Math.max(...vol), tieni = vol.map(v => v >= quota * mx);
  for (let i = 0; i < N; i++) if (Vf[i] < 0 && !tieni[lab[i]]) Vf[i] = 0.01;
  return vol.slice(1).filter(v => v >= quota * mx).length;
}
log('componenti tenute:', componentiPrincipali(V));
const mesh = nets(sfoca(V, 1), () => [0, 0, 1]);
// i bordi sottili lungo le linee d'inserzione (spessore ≈ 1 voxel) generano qualche triangolo con avvolgimento incoerente: si riorienta ogni componente
// connessa (propagazione dell'orientamento sui bordi manifold) e la si gira in modo che il volume sia positivo (normali verso l'esterno)
function orienta(m) {
  const T = m.idx.length / 3, ed = new Map();
  for (let t = 0; t < T; t++) for (let q = 0; q < 3; q++) { const a = m.idx[3 * t + q], b = m.idx[3 * t + (q + 1) % 3], k = a < b ? a * 4294967296 + b : b * 4294967296 + a; const e = ed.get(k); if (e) e.push(t); else ed.set(k, [t]); }
  const flip = new Uint8Array(T), seen = new Uint8Array(T), dir = (t, a, b) => { for (let q = 0; q < 3; q++) { const u = m.idx[3 * t + q], v = m.idx[3 * t + (q + 1) % 3]; if (u === a && v === b) return 1; if (u === b && v === a) return -1; } return 0; };
  const comp = new Int32Array(T).fill(-1); let nc = 0;
  for (let s = 0; s < T; s++) { if (seen[s]) continue; seen[s] = 1; comp[s] = nc; const st = [s];
    while (st.length) { const t = st.pop();
      for (let q = 0; q < 3; q++) { const a = m.idx[3 * t + q], b = m.idx[3 * t + (q + 1) % 3], e = ed.get(a < b ? a * 4294967296 + b : b * 4294967296 + a); if (e.length !== 2) continue;
        const u = e[0] === t ? e[1] : e[0]; if (seen[u]) continue; seen[u] = 1; comp[u] = nc;
        // t orientato (a→b) (con eventuale flip); u deve percorrere il bordo in senso opposto
        const dt = dir(t, a, b) * (flip[t] ? -1 : 1), du = dir(u, a, b); flip[u] = du === dt ? 1 : 0; st.push(u); } }
    nc++; }
  const vol = new Float64Array(nc), p = m.pos;
  for (let t = 0; t < T; t++) { let [a, b, c] = [0, 1, 2].map(q => 3 * m.idx[3 * t + q]); if (flip[t]) [b, c] = [c, b];
    vol[comp[t]] += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; }
  let nf = 0; const idx = m.idx.slice();
  for (let t = 0; t < T; t++) { if (flip[t] !== (vol[comp[t]] < 0 ? 1 : 0)) { const b = idx[3 * t + 1]; idx[3 * t + 1] = idx[3 * t + 2]; idx[3 * t + 2] = b; nf++; } }
  log('triangoli riorientati', nf, 'su', T);
  return { pos: m.pos, idx };
}
const out = { pos: mesh.pos, idx: orienta(mesh).idx, tag: null, fdir: null };
let vol = 0; for (let t = 0; t < out.idx.length; t += 3) { const a = 3 * out.idx[t], b = 3 * out.idx[t + 1], c = 3 * out.idx[t + 2], p = out.pos;
  vol += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; }
log('capsula', out.pos.length / 3, 'vertici, volume', vol.toFixed(2), 'cm³');
const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
setMesh('caps', out);
if (prova) { const U = { caps: { pos: Array.from(out.pos, v => +v.toFixed(4)), idx: Array.from(out.idx) } }; for (const o of [...OSSA, 'fat_ant', 'fat_post', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'lucl', 'anulare', 'quadrato', 'osborne']) { const m = REAL(o); U[o] = { pos: Array.from(m.pos, v => +v.toFixed(4)), idx: Array.from(m.idx) }; } writeFileSync(prova, JSON.stringify(U)); log('scritto', prova); }
else saveFile(repack());
