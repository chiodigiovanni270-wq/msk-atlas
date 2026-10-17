/* Capi del bicipite del gomito (modelli/gomito-3d.html): divide la mesh unica `bic` in capo lungo (`bic_lungo`, laterale) e capo breve (`bic_breve`, mediale).

   Uso (dalla cartella del progetto):
     node strumenti/bicipite-capi-gomito.mjs              → riscrive il modello: toglie `bic`, scrive `bic_lungo` e `bic_breve`
     MODELLO=/tmp/copia.html node strumenti/bicipite-capi-gomito.mjs   → lavora su una copia
     node strumenti/bicipite-capi-gomito.mjs verifica     → non scrive: volumi, compenetrazioni, chiusura delle mesh

   Perché: la mesh BodyParts3D del bicipite nella finestra del gomito (y da −2,9 a 12 cm) è un solido unico; in anatomia capo lungo (dal tubercolo
   sovraglenoideo) e capo breve (dal processo coracoideo) restano due ventri affiancati, che si fondono in basso nel tendine distale comune
   (Standring, Gray's Anatomy 42ª ed.). La mesh non distingue i due capi: il setto tra i due è una ricostruzione indicativa.
   Metodo:
   1. setto: superficie rigata verticale n·(x, z) = c(y), con n = asse maggiore delle sezioni del ventre (y 8–11,5, mediolaterale) e c(y) = mediana
      della sezione lungo n (metà dell'area per parte), levigata lungo y (`SETTO.sigmaC`); capo lungo dalla parte laterale (−x, verso il radio);
   2. vicino al setto, nella zona del solco, i triangoli si dividono (lati ≤ `SETTO.lato`, punti nuovi sulla faccia); la mesh si taglia esattamente
      sul setto (punti di taglio trovati per bisezione, sulla faccia: la superficie esterna non cambia) e ogni capo si chiude con una faccia sul setto
      (ear clipping nel piano (y, t) del setto, poi divisione dei lati lunghi, scambi di Delaunay e rilassamento);
   3. solco tra i ventri: da `SETTO.y0` (fusione perfetta: sotto, i due capi combaciano sul setto e la superficie esterna è quella originale)
      a `SETTO.y1` crescono il distacco (`gap`, totale tra i due capi) e il raggio dello spigolo arrotondato (`R`); ogni capo si ritira dal setto
      di gap/2 (spostamento che sfuma entro `Sigma` cm, lungo la superficie) e lo spigolo tra faccia sul setto e superficie esterna diventa un quarto
      di cerchio (mappa radiale dal centro del raccordo). Vicino al piano di taglio (`FASCIA`) la mappa agisce per fette orizzontali, con la
      profondità misurata dal contorno del capo alla stessa quota: in sezione due ovali separati, senza schegge sul raccordo della sezione;
   4. volume: il solco toglie circa il 2,7 % del ventre; la superficie esterna dei due capi lontano dal solco e dai tubi di vasi e nervi
      (y da 5 a 11,6) si sposta in fuori lungo la normale della quantità uniforme che rende il volume totale uguale a quello di partenza (~0,4 mm);
   5. tag (gradiente muscolo → tendine, 250 = sezione) e fibre: quelli dei vertici di partenza; i vertici nuovi li interpolano (il tag di sezione
      non si mescola), la faccia sul setto prende quelli del contorno alla stessa quota;
   6. normali scritte nel file (`nm`, letto da REAL nella pagina): quelle di partenza (interpolate sui punti nuovi) più la rotazione dovuta al solco.
      Ricalcolate dalla pagina, i triangoli originali tagliati a metà (fino a 3 mm vicino al tendine) darebbero chiazze di luce lungo il setto;
   7. dove i capi sono fusi (y < `SETTO.y0` + 0,5) la faccia sul setto è una mesh a parte (`bic_lungo_setto`, `bic_breve_setto`, `po: 1`
      nell'indice) che la pagina disegna arretrata in profondità (polygonOffset): la faccia interna, quasi di taglio rispetto allo sguardo,
      altrimenti affiorava a puntini lungo il contorno (anche 0,3 mm sotto la superficie). Isolando un capo la faccia si vede come prima.
   Il tendine distale (sotto y0) non cambia: i due capi lo dividono a metà lungo il setto e insieme lo ricompongono esatto (stessi vertici, stesse
   normali). Nella pagina i due capi hanno lo stesso colore e la stessa origine della trama delle fibre (`fo`), quindi la fusione non si vede.
   Riparte da `bic` del file se c'è (catena rilanciata: `muscoli-gomito.mjs`, `estremo-braccio-gomito.mjs`, `inserzioni-gomito.mjs` riscrivono `bic`),
   altrimenti dalla revisione `BASE`; quindi è idempotente. Va lanciato dopo quegli strumenti. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { sstep, log, setMesh, realDaRevisione } = G;
const argv = process.argv.slice(2), VERIFICA = argv.includes('verifica');

const BASE = 'b5f80c2';   // revisione con `bic` unico (prima di questo strumento)
const FILE_REPO = 'modelli/gomito-3d.html';
const TAGLIO = 12.0;      // piano di taglio prossimale (cm)
// y0 → y1: dalla fusione perfetta al solco pieno; gap = distacco totale tra i capi, R = raggio dello spigolo arrotondato, Sigma = ampiezza dello
// spostamento lungo la superficie; lato = lato massimo dei triangoli vicino al setto (entro `banda` cm), lCap = lato della faccia sul setto (vicino al bordo / altrove)
const SETTO = { yPCA: [8, 11.5], passo: 0.025, sigmaC: 0.4, y0: 5.5, y1: 9.5, gap: 0.08, R: 0.45, Sigma: 0.6, lato: 0.07, banda: 0.55, lCap: [0.07, 0.3] };
const VOL = { y: [5.0, 6.5, 11.0, 11.6], dallo: 0.08 };   // peso della compensazione: rampa in y e distanza minima dal solco oltre R + gap/2 (cm)
const NOMI = { lungo: 'bic_lungo', breve: 'bic_breve' }, SETTI = { lungo: 'bic_lungo_setto', breve: 'bic_breve_setto' };

/* ============ Mesh di partenza ============ */
const nelFile = G.man.meshes.some(m => m.n === 'bic');
const src = nelFile ? { ...G.REAL('bic'), ...G.attrs('bic') } : realDaRevisione(BASE, 'bic', FILE_REPO);
if (!nelFile) setMesh('bic', { pos: Float32Array.from(src.pos), idx: src.idx, tag: src.tag, fdir: src.fdir });   // per la voxelizzazione
log('bic di partenza da', nelFile ? 'file' : 'revisione ' + BASE, (src.pos.length / 3) + ' vertici');
const tagLerp = (a, b, t) => a >= 250 && b >= 250 ? a : a >= 250 ? b : b >= 250 ? a : Math.round(a + (b - a) * t);   // il tag di sezione non si mescola
const tagMedio = (a, b) => tagLerp(a, b, 0.5);

/* ============ Setto ============ */
// asse maggiore delle sezioni del ventre (piano x-z)
let n2, m2;
{
  let sx = 0, sz = 0, k = 0; const P = [];
  for (let i = 0; i < src.pos.length; i += 3) if (src.pos[i + 1] > SETTO.yPCA[0] && src.pos[i + 1] < SETTO.yPCA[1]) { P.push([src.pos[i], src.pos[i + 2]]); sx += src.pos[i]; sz += src.pos[i + 2]; k++; }
  sx /= k; sz /= k; let a = 0, b = 0, c = 0;
  for (const [x, z] of P) { a += (x - sx) ** 2; b += (x - sx) * (z - sz); c += (z - sz) ** 2; }
  const th = 0.5 * Math.atan2(2 * b, a - c); n2 = [Math.cos(th), Math.sin(th)];
  if (n2[0] < 0) n2 = [-n2[0], -n2[1]];                 // n verso mediale (+x)
  m2 = [-n2[1], n2[0]]; if (m2[1] < 0) m2 = [-m2[0], -m2[1]];   // t verso anteriore (+z)
}
// c(y): mediana della sezione lungo n
let cTab, cY0, cH;
{
  const lo = [0, 1, 2].map(k => Math.min(...src.pos.filter((_, i) => i % 3 === k)) - 0.1), hi = [0, 1, 2].map(k => Math.max(...src.pos.filter((_, i) => i % 3 === k)) + 0.1);
  const h = SETTO.passo, nn = [0, 1, 2].map(k => Math.ceil((hi[k] - lo[k]) / h));
  G.setGriglia(lo, h, nn[0], nn[1], nn[2]);
  const M = G.solid('bic'), NX = nn[0], NY = nn[1], NZ = nn[2];
  const raw = new Float64Array(NY).fill(NaN);
  for (let j = 0; j < NY; j++) {
    const u = [];
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (M[i + NX * j + NX * NY * k]) u.push(n2[0] * (lo[0] + (i + 0.5) * h) + n2[1] * (lo[2] + (k + 0.5) * h));
    if (u.length >= 4) { u.sort((a, b) => a - b); raw[j] = u[u.length >> 1]; }
  }
  const s = SETTO.sigmaC / h, r = Math.ceil(3 * s); cTab = new Float64Array(NY);
  for (let j = 0; j < NY; j++) { let a = 0, w = 0; for (let q = -r; q <= r; q++) { const v = raw[j + q]; if (v === v && v !== undefined) { const e = Math.exp(-0.5 * (q / s) ** 2); a += e * v; w += e; } } cTab[j] = w ? a / w : NaN; }
  // estremi senza sezione: valore più vicino
  let first = cTab.findIndex(v => v === v), last = cTab.length - 1; while (!(cTab[last] === cTab[last])) last--;
  for (let j = 0; j < first; j++) cTab[j] = cTab[first]; for (let j = last + 1; j < NY; j++) cTab[j] = cTab[last];
  cY0 = lo[1] + 0.5 * h; cH = h;
}
const cAt = y => { const f = Math.min(Math.max((y - cY0) / cH, 0), cTab.length - 1.000001), j = Math.floor(f), t = f - j; return cTab[j] * (1 - t) + cTab[j + 1] * t; };
const sOf = p => n2[0] * p[0] + n2[1] * p[2] - cAt(p[1]);   // < 0: capo lungo (laterale), > 0: capo breve
const gapAt = y => 0.5 * SETTO.gap * sstep(SETTO.y0, SETTO.y1, y), RAt = y => SETTO.R * sstep(SETTO.y0, SETTO.y1, y);
log('setto: n =', n2.map(v => v.toFixed(3)).join(' '), ' c(4, 8, 12) =', [4, 8, 12].map(y => cAt(y).toFixed(2)).join(' '));

/* ============ Mesh di lavoro (array JS) ============ */
const P = [], T = [], F = [];   // posizioni [x,y,z], tag, fibre [x,y,z]
for (let i = 0; i < src.pos.length / 3; i++) {
  P.push([src.pos[3 * i], src.pos[3 * i + 1], src.pos[3 * i + 2]]); T.push(src.tag[i]);
  F.push([src.fdir[3 * i] / 127, src.fdir[3 * i + 1] / 127, src.fdir[3 * i + 2] / 127]);
}
let TR = []; for (let t = 0; t < src.idx.length; t += 3) TR.push([src.idx[t], src.idx[t + 1], src.idx[t + 2]]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// normali di vertice della superficie di partenza (pesate per area, come le calcola la pagina); i vertici nuovi le interpolano
const NRM = P.map(() => [0, 0, 0]);
for (const [a, b, c] of TR) { const f = cross(sub(P[b], P[a]), sub(P[c], P[a])); for (const q of [a, b, c]) { NRM[q][0] += f[0]; NRM[q][1] += f[1]; NRM[q][2] += f[2]; } }
for (let i = 0; i < NRM.length; i++) NRM[i] = norm(NRM[i]);
const nuovo = (p, tag, f, n) => { P.push(p); T.push(tag); F.push(f); NRM.push(n); return P.length - 1; };
// punto nuovo sul lato a-b: sulla faccia (la superficie non cambia); la normale è quella interpolata, che la pagina mostrava in quel punto
const puntoLato = (a, b, t) => [lerp(P[a], P[b], t), norm(lerp(NRM[a], NRM[b], t))];

// suddivisione conforme dei lati lunghi vicino al setto, nella zona del solco (1 → 2/3/4)
function suddividi() {
  const vicino = i => Math.abs(sOf(P[i])) < SETTO.banda;
  for (let pass = 0; pass < 10; pass++) {
    const mid = new Map(); let nsp = 0;
    const key = (a, b) => a < b ? a * 4194304 + b : b * 4194304 + a;
    const segna = (a, b) => {
      const k = key(a, b); if (mid.has(k)) return;
      const pa = P[a], pb = P[b];
      if (Math.max(pa[1], pb[1]) < SETTO.y0 - 0.3 || len(sub(pa, pb)) <= SETTO.lato) return;
      if (!(vicino(a) || vicino(b) || sOf(pa) * sOf(pb) < 0)) return;
      const [p, n] = puntoLato(a, b, 0.5); mid.set(k, nuovo(p, tagMedio(T[a], T[b]), lerp(F[a], F[b], 0.5), n)); nsp++;
    };
    for (const [a, b, c] of TR) { segna(a, b); segna(b, c); segna(c, a); }
    if (!nsp) break;
    const out = [];
    for (const [a, b, c] of TR) {
      const ab = mid.get(key(a, b)), bc = mid.get(key(b, c)), ca = mid.get(key(c, a)), k = (ab !== undefined) + (bc !== undefined) + (ca !== undefined);
      if (k === 0) out.push([a, b, c]);
      else if (k === 3) out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      else if (k === 1) {
        if (ab !== undefined) out.push([a, ab, c], [ab, b, c]); else if (bc !== undefined) out.push([a, b, bc], [a, bc, c]); else out.push([a, b, ca], [ca, b, c]);
      } else {   // due lati: triangolo (v, w, x) con lati segnati v-w e x-v; triangolo d'angolo + quadrilatero diviso dalla diagonale più corta
        const [v, w, x, mvw, mxv] = ab === undefined ? [c, a, b, ca, bc] : bc === undefined ? [a, b, c, ab, ca] : [b, c, a, bc, ab];
        out.push([v, mvw, mxv]);
        if (len(sub(P[mvw], P[x])) < len(sub(P[w], P[mxv]))) out.push([mvw, w, x], [mvw, x, mxv]); else out.push([mvw, w, mxv], [w, x, mxv]);
      }
    }
    TR = out; log('suddivisione', pass + 1, nsp + ' lati divisi');
  }
}
suddividi();

/* ============ Taglio sul setto ============ */
const S0 = P.map(p => { const s = sOf(p); return Math.abs(s) < 1e-6 ? 1e-6 : s; });
const taglio = new Map();   // lato → vertice sul setto
const SUL = new Set();      // vertici sul setto (contorno)
function puntoTaglio(a, b) {
  const k = a < b ? a * 4194304 + b : b * 4194304 + a; if (taglio.has(k)) return taglio.get(k);
  let lo = 0, hi = 1; const sa = S0[a];
  for (let it = 0; it < 40; it++) { const t = 0.5 * (lo + hi), s = sOf(lerp(P[a], P[b], t)); if ((s < 0) === (sa < 0)) lo = t; else hi = t; }
  const t = 0.5 * (lo + hi), [p, n] = puntoLato(a, b, t), i = nuovo(p, tagLerp(T[a], T[b], t), lerp(F[a], F[b], t), n);   // tag interpolato alla posizione: alla giunzione muscolo-tendine cambia in pochi mm
  S0[i] = 0; SUL.add(i); taglio.set(k, i); return i;
}
const lati = { lungo: [], breve: [] };
for (const tri of TR) {
  const sg = tri.map(q => S0[q] < 0);
  if (sg[0] === sg[1] && sg[1] === sg[2]) { lati[sg[0] ? 'lungo' : 'breve'].push(tri); continue; }
  const r = sg[0] !== sg[1] && sg[0] !== sg[2] ? 0 : sg[1] !== sg[0] && sg[1] !== sg[2] ? 1 : 2;   // vertice isolato
  const a = tri[r], b = tri[(r + 1) % 3], c = tri[(r + 2) % 3], pab = puntoTaglio(a, b), pca = puntoTaglio(c, a);
  const iso = S0[a] < 0 ? 'lungo' : 'breve', alt = iso === 'lungo' ? 'breve' : 'lungo';
  lati[iso].push([a, pab, pca]); lati[alt].push([pab, b, c], [pab, c, pca]);
}
log('taglio:', SUL.size + ' vertici sul setto; triangoli', lati.lungo.length, '+', lati.breve.length);

// contorno sul setto (dal capo lungo): lati usati da un solo triangolo, senza badare al verso (la punta del tendine BodyParts3D ha triangoli rovesciati)
function contorni(tris) {
  const cnt = new Map(), vic = new Map();
  for (const [a, b, c] of tris) for (const [u, v] of [[a, b], [b, c], [c, a]]) { const k = u < v ? u + ',' + v : v + ',' + u; cnt.set(k, (cnt.get(k) || 0) + 1); }
  for (const [k, c] of cnt) if (c === 1) { const [u, v] = k.split(',').map(Number); (vic.get(u) || vic.set(u, []).get(u)).push(v); (vic.get(v) || vic.set(v, []).get(v)).push(u); }
  const loops = [], vis = new Set();
  for (const s of vic.keys()) {
    if (vis.has(s)) continue; const L = []; let prev = -1, v = s;
    while (v !== undefined && !vis.has(v)) { vis.add(v); L.push(v); const nx = vic.get(v).find(q => q !== prev && !vis.has(q)); prev = v; v = nx; }
    loops.push(L);
  }
  return loops;
}
const anelli = contorni(lati.lungo);
if (anelli.length !== 1) { console.error('contorni sul setto:', anelli.map(l => l.length)); throw new Error('il setto taglia la mesh in più di un contorno'); }
const anello = anelli[0];
log('contorno:', anello.length, 'vertici');

/* ============ Faccia sul setto (piano (y, t)) ============ */
const tOf = p => m2[0] * p[0] + m2[1] * p[2];
const da2D = ([y, t]) => { const c = cAt(y); return [n2[0] * c + m2[0] * t, y, n2[1] * c + m2[1] * t]; };
const Q = anello.map(i => [P[i][1], tOf(P[i])]);   // vertici 2D: prima quelli del contorno (fissi)
const NB = Q.length;
const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
let ord = Q.map((_, i) => i);
{ let A = 0; for (let i = 0; i < NB; i++) A += area2([0, 0], Q[i], Q[(i + 1) % NB]); if (A < 0) ord.reverse(); }
// ear clipping
let CT = [];
{
  const pts = ord.slice(), inTri = (p, a, b, c) => area2(a, b, p) >= -1e-12 && area2(b, c, p) >= -1e-12 && area2(c, a, p) >= -1e-12;
  let guard = 0, forzati = 0;
  while (pts.length > 3 && guard++ < 1e6) {
    let fatto = false;
    for (let i = 0; i < pts.length; i++) {
      const ia = pts[(i + pts.length - 1) % pts.length], ib = pts[i], ic = pts[(i + 1) % pts.length], a = Q[ia], b = Q[ib], c = Q[ic];
      if (area2(a, b, c) <= 1e-12) continue;
      let ok = true;
      for (const j of pts) { if (j === ia || j === ib || j === ic) continue; const p = Q[j]; if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === c[0] && p[1] === c[1])) continue; if (inTri(p, a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      CT.push([ia, ib, ic]); pts.splice(i, 1); fatto = true; break;
    }
    if (!fatto) {   // ripiego: l'orecchio convesso più ampio anche se contiene un vertice (contorno quasi degenere); segnalato
      let best = -1, ab = 0; for (let i = 0; i < pts.length; i++) { const A = area2(Q[pts[(i + pts.length - 1) % pts.length]], Q[pts[i]], Q[pts[(i + 1) % pts.length]]); if (A > ab) { ab = A; best = i; } }
      if (best < 0) throw new Error('ear clipping bloccato con ' + pts.length + ' vertici');
      CT.push([pts[(best + pts.length - 1) % pts.length], pts[best], pts[(best + 1) % pts.length]]); pts.splice(best, 1); forzati++;
    }
  }
  if (pts.length === 3) CT.push(pts.slice());
  if (forzati) log('ear clipping: ' + forzati + ' orecchi forzati (contorno quasi degenere)');
}
// distanza (nel piano del setto) dal tratto laterale del contorno (esclusa la sezione di taglio, tag 250)
const segLat = [];
for (let i = 0; i < NB; i++) { const a = anello[i], b = anello[(i + 1) % NB]; if (T[a] < 250 || T[b] < 250) if (!(T[a] >= 250 && T[b] >= 250)) segLat.push([Q[i], Q[(i + 1) % NB]]); }
const SEC = 0.05, secLat = new Map();   // segmenti per fasce di y
for (const s of segLat) for (let k = Math.floor(Math.min(s[0][0], s[1][0]) / SEC); k <= Math.floor(Math.max(s[0][0], s[1][0]) / SEC); k++) (secLat.get(k) || secLat.set(k, []).get(k)).push(s);
function distLat(p, r = 0.4) {   // → [distanza, punto più vicino]; oltre r: [Infinity, null]
  let best = Infinity, bq = null;
  const vicini = new Set(); for (let k = Math.floor((p[0] - r) / SEC); k <= Math.floor((p[0] + r) / SEC); k++) for (const s of secLat.get(k) || []) vicini.add(s);
  for (const [a, b] of vicini) {
    const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] * d[0] + d[1] * d[1], t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2)) : 0;
    const q = [a[0] + t * d[0], a[1] + t * d[1]], e = Math.hypot(p[0] - q[0], p[1] - q[1]); if (e < best) { best = e; bq = q; }
  }
  return [best, bq];
}
const lCap = p => p[0] > SETTO.y0 - 0.3 && distLat(p)[0] < SETTO.R + 0.12 ? SETTO.lCap[0] : SETTO.lCap[1];
// raffinamento: divisione dei lati interni lunghi, scambi di Delaunay, rilassamento
{
  const ek = (a, b) => a < b ? a + ',' + b : b + ',' + a;
  const incCirc = (a, b, c, d) => {   // d dentro il cerchio di (a,b,c) (antiorario)
    const ax = a[0] - d[0], ay = a[1] - d[1], bx = b[0] - d[0], by = b[1] - d[1], cx = c[0] - d[0], cy = c[1] - d[1];
    return (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay) > 1e-14;
  };
  const adiacenze = () => { const m = new Map(); CT.forEach((t, k) => { for (let e = 0; e < 3; e++) { const key = ek(t[e], t[(e + 1) % 3]); (m.get(key) || m.set(key, []).get(key)).push(k); } }); return m; };
  const flips = () => {
    for (let it = 0; it < 60; it++) {
      const adj = adiacenze(); let nf = 0; const toccati = new Set();
      for (const [key, ts] of adj) {
        if (ts.length !== 2 || toccati.has(ts[0]) || toccati.has(ts[1])) continue;
        const [k1, k2] = ts, t1 = CT[k1], t2 = CT[k2], [u, v] = key.split(',').map(Number);
        const a = t1.find(q => q !== u && q !== v), b = t2.find(q => q !== u && q !== v);
        // t1 = (u', v', a) antiorario
        const i1 = t1.indexOf(a), p = t1[(i1 + 1) % 3], q = t1[(i1 + 2) % 3];
        if (!incCirc(Q[a], Q[p], Q[q], Q[b])) continue;
        if (area2(Q[a], Q[p], Q[b]) <= 1e-12 || area2(Q[a], Q[b], Q[q]) <= 1e-12) continue;   // quadrilatero non convesso
        CT[k1] = [a, p, b]; CT[k2] = [a, b, q]; toccati.add(k1); toccati.add(k2); nf++;
      }
      if (!nf) break;
    }
  };
  flips();
  for (let pass = 0, ns = Infinity; pass < 30 && ns > 4; pass++) {   // ultime passate: pochi lati residui al bordo, non servono
    const adj = adiacenze(), cand = [];
    for (const [key, ts] of adj) { if (ts.length !== 2) continue; const [u, v] = key.split(',').map(Number), m = [(Q[u][0] + Q[v][0]) / 2, (Q[u][1] + Q[v][1]) / 2], l = Math.hypot(Q[u][0] - Q[v][0], Q[u][1] - Q[v][1]); if (l > lCap(m)) cand.push([l, u, v, ts]); }
    if (!cand.length) break;
    cand.sort((a, b) => b[0] - a[0]); const toccati = new Set(); ns = 0;
    for (const [, u, v, ts] of cand) {
      if (toccati.has(ts[0]) || toccati.has(ts[1])) continue;
      const w = Q.push([(Q[u][0] + Q[v][0]) / 2, (Q[u][1] + Q[v][1]) / 2]) - 1;
      for (const k of ts) { const t = CT[k], o = t.find(q => q !== u && q !== v), io = t.indexOf(o), p = t[(io + 1) % 3], q = t[(io + 2) % 3]; CT[k] = [o, p, w]; CT.push([o, w, q]); toccati.add(k); toccati.add(CT.length - 1); }
      ns++;
    }
    flips();
    // rilassamento dei vertici interni (solo se nessun triangolo si rovescia)
    const vic = new Map(); for (const t of CT) for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3]; if (a >= NB) (vic.get(a) || vic.set(a, new Set()).get(a)).add(b); if (b >= NB) (vic.get(b) || vic.set(b, new Set()).get(b)).add(a); }
    const triDi = new Map(); CT.forEach((t, k) => t.forEach(q => { if (q >= NB) (triDi.get(q) || triDi.set(q, []).get(q)).push(k); }));
    for (let r = 0; r < 3; r++) for (const [i, ns2] of vic) {
      let y = 0, t = 0; for (const j of ns2) { y += Q[j][0]; t += Q[j][1]; } const old = Q[i]; Q[i] = [old[0] + 0.5 * (y / ns2.size - old[0]), old[1] + 0.5 * (t / ns2.size - old[1])];
      if (triDi.get(i).some(k => area2(...CT[k].map(q => Q[q])) <= 1e-12)) Q[i] = old;
    }
    log('faccia sul setto: passata', pass + 1, ns + ' lati divisi,', CT.length + ' triangoli');
  }
}

/* ============ Solco tra i ventri e mesh dei due capi ============ */
// mappa dello spigolo: (σ dal setto dopo il ritiro, d dalla superficie esterna) → punto sul quarto di cerchio di raggio R centrato in (g + R, R)
function spigolo(sg, d, g, R) {
  if (R < 1e-6 || sg - g >= R || d >= R) return [sg, d];
  const vx = sg - g - R, vy = d - R, l = Math.hypot(vx, vy); if (l < 1e-9) return [sg, d];
  const ux = vx / l, uy = vy / l; let rb = Infinity; if (ux < 0) rb = Math.min(rb, R / -ux); if (uy < 0) rb = Math.min(rb, R / -uy);
  const k = R / rb; return [g + R + vx * k, R + vy * k];
}
const ritiro = (s, g) => s >= SETTO.Sigma ? s : s + g * (1 - s / SETTO.Sigma) ** 2;
// vicino al piano di taglio (da `FASCIA` cm sotto, con il raccordo di 1 mm della sezione) ogni fetta orizzontale si mappa nel piano: profondità dal
// contorno del capo alla stessa quota (fino a TAGLIO − `CIMA`: più su il raccordo rientra e si misura da lì), spostamento orizzontale; superficie
// esterna, raccordo, sezione e faccia sul setto seguono la stessa mappa e il solco arriva pulito sulla sezione. Sotto la fascia, raccordo lungo la normale.
const FASCIA = 0.4, CIMA = 0.12, PASSO_F = 0.02, Y_F = TAGLIO - FASCIA - 0.2;
function contorniFetta(tris) {   // per quota: segmenti (x, z) del contorno del capo
  const livelli = [];
  for (let Y = Y_F; Y <= TAGLIO - CIMA + 1e-9; Y += PASSO_F) {
    const seg = [];
    for (const t of tris) {
      const q = []; for (let e = 0; e < 3; e++) { const a = P[t[e]], b = P[t[(e + 1) % 3]]; if ((a[1] - Y) * (b[1] - Y) < 0) { const u = (Y - a[1]) / (b[1] - a[1]); q.push([a[0] + u * (b[0] - a[0]), a[2] + u * (b[2] - a[2])]); } }
      if (q.length === 2) seg.push(q);
    }
    livelli.push(seg);
  }
  return p => {
    const seg = livelli[Math.max(0, Math.min(livelli.length - 1, Math.round((p[1] - Y_F) / PASSO_F)))];
    let best = Infinity, bq = null;
    for (const [A, B] of seg) {
      const d = [B[0] - A[0], B[1] - A[1]], l2 = d[0] * d[0] + d[1] * d[1];
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - A[0]) * d[0] + (p[2] - A[1]) * d[1]) / l2)) : 0, q = [A[0] + t * d[0], A[1] + t * d[1]], e = Math.hypot(p[0] - q[0], p[2] - q[1]);
      if (e < best) { best = e; bq = q; }
    }
    return [best, bq];
  };
}
const n3 = [n2[0], 0, n2[1]], m3 = [m2[0], 0, m2[1]];
// tag e fibre della faccia sul setto: media dei vertici del contorno alla stessa quota (escluse le sezioni)
function attrSetto(y) {
  let w = 0, tg = 0, f = [0, 0, 0];
  for (const i of anello) { if (T[i] >= 250) continue; const e = Math.exp(-0.5 * ((P[i][1] - y) / 0.1) ** 2); w += e; tg += e * T[i]; f = add(f, mul(F[i], e)); }
  return w > 1e-9 ? [Math.round(tg / w), norm(f)] : [0, [0, 1, 0]];
}

function capo(nome) {
  const e = nome === 'lungo' ? -1 : 1, dentro = mul(n3, e), tris = lati[nome];   // dentro: dal setto verso l'interno del capo
  // pos0, nb: posizione prima del solco e normale di partenza (null per la faccia sul setto): servono alle normali scritte nel file (vedi normali())
  const usa = new Map(), pos = [], tag = [], fib = [], pos0 = [], nb = [], saldati = new Set();
  const add1 = (p, t, f, p0, n) => { pos.push(p); tag.push(t); fib.push(f); pos0.push(p0); nb.push(n); return pos.length - 1; };
  const bordo = contorniFetta(tris);
  // direzione verso l'interno, ortogonale al setto: dalla normale esterna, o solo orizzontale (fetta)
  const verso = (N, orizz) => { const v = mul(N, -1); if (orizz) v[1] = 0; return norm(sub(v, mul(n3, dot(v, n3)))); };
  const pesoFetta = y => sstep(Y_F, TAGLIO - FASCIA, y);
  // mappa nella fetta orizzontale: (σ, profondità dal contorno alla stessa quota); N: normale esterna (null per sezione e faccia sul setto)
  function fetta(p, s, N) {
    const g = gapAt(p[1]), R = RAt(p[1]), [d, q] = bordo(p), s1 = ritiro(s, g), [s2, d2] = spigolo(s1, d, g, R);
    let dir = q && d > 1e-6 ? norm([p[0] - q[0], 0, p[2] - q[1]]) : [0, 0, 0];
    if (N) dir = norm(lerp(verso(N, true), dir, sstep(0.01, 0.05, d)));   // sulla parete il contorno passa per il vertice: direzione dalla normale
    return add(mul(dentro, s2 - s), mul(dir, d2 - d));
  }
  // superficie esterna: ritiro lungo la superficie e raccordo verso l'interno lungo la normale; nella fascia sfuma nella mappa per fette
  function esterno(p, s, N) {
    const w = pesoFetta(p[1]); if (w >= 1) return fetta(p, s, N);
    const g = gapAt(p[1]), R = RAt(p[1]), s1 = ritiro(s, g), [s2, d2] = spigolo(s1, 0, g, R);
    const tg = sub(dentro, mul(N, dot(dentro, N))), k = Math.max(dot(tg, dentro), 0.3), DA = add(mul(tg, (s2 - s) / k), mul(N, -d2));
    return w > 0 ? lerp(DA, fetta(p, s, N), w) : DA;
  }
  // vertici del contorno sul setto (condivisi da superficie esterna e faccia sul setto): spostamento calcolato una volta
  const spostSetto = new Map();
  const sulSetto = i => { if (!spostSetto.has(i)) spostSetto.set(i, T[i] >= 250 ? fetta(P[i], 0, null) : esterno(P[i], 0, NRM[i])); return spostSetto.get(i); };
  // superficie esterna e sezione di taglio
  for (const t of tris) for (const i of t) {
    if (usa.has(i)) continue;
    const p = P[i]; let q = p;
    if (SUL.has(i)) q = add(p, sulSetto(i));
    else {
      const s = e * sOf(p);
      if (gapAt(p[1]) > 1e-7 && s < SETTO.Sigma) q = add(p, T[i] >= 250 ? fetta(p, s, null) : esterno(p, s, NRM[i]));
    }
    usa.set(i, add1(q, T[i], F[i], p, NRM[i]));
  }
  const idx = tris.map(t => t.map(i => usa.get(i)));
  // faccia sul setto: vertici propri (spigolo vivo con la superficie esterna), saldati dove il raccordo è arrotondato
  const capIdx = new Map();
  for (let k = 0; k < Q.length; k++) {
    const y = Q[k][0], [tg, f] = attrSetto(y);
    if (k < NB) {
      const i = anello[k], R = RAt(P[i][1]);
      if (T[i] < 250 && R > 0.02) { capIdx.set(k, usa.get(i)); saldati.add(usa.get(i)); continue; }   // raccordo: stesso vertice della superficie esterna (normale continua)
      capIdx.set(k, add1(add(P[i], sulSetto(i)), tg, f, P[i], null)); continue;
    }
    const p = da2D(Q[k]), g = gapAt(y), R = RAt(y);
    let D = mul(dentro, g);
    if (R > 1e-6) {
      const [d, qq] = distLat(Q[k]);
      if (d < R) { const [s2, d2] = spigolo(g, d, g, R), dir = norm(add(mul([0, 1, 0], Q[k][0] - qq[0]), mul(m3, Q[k][1] - qq[1]))); D = add(mul(dentro, s2), mul(dir, d2 - d)); }
    }
    const w = pesoFetta(y); if (w > 0) D = lerp(D, fetta(p, 0, null), w);
    capIdx.set(k, add1(add(p, D), tg, f, p, null));
  }
  // orientamento: la normale della faccia sul setto punta fuori dal capo (verso −dentro); `setto`: triangoli della zona fusa (mesh a parte, vedi 7.)
  const setto = new Set();
  for (const t of CT) {
    const a = capIdx.get(t[0]), b = capIdx.get(t[1]), c = capIdx.get(t[2]);
    const nn = cross(sub(da2D(Q[t[1]]), da2D(Q[t[0]])), sub(da2D(Q[t[2]]), da2D(Q[t[0]])));
    if (Math.max(Q[t[0]][0], Q[t[1]][0], Q[t[2]][0]) < SETTO.y0 + 0.5) setto.add(idx.length);
    idx.push(dot(nn, dentro) < 0 ? [a, b, c] : [a, c, b]);
  }
  return { pos, tag, fib, idx, setto, pos0, nb, saldati };
}
const capi = { lungo: capo('lungo'), breve: capo('breve') };

/* ============ Tubi di vasi e nervi (NVP) ============ */
const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
const raggioDa = (k, s) => { const x = Math.min(Math.max(s, 0), 1) * (k.length - 1), i = Math.min(k.length - 2, Math.floor(x)); return k[i] + (k[i + 1] - k[i]) * (x - i); };
const TUBI = Object.entries(NVP.pts).filter(([, pts]) => pts.some(p => p[1] > SETTO.y0 - 1.5 && p[0] > -2.5 && p[0] < 5 && p[2] > -0.5 && p[2] < 5))
  .map(([id, pts]) => ({ id, pts, r: i => NVP.r[id] * (NVP.rp && NVP.rp[id] ? raggioDa(NVP.rp[id], i / (pts.length - 1)) : 1) }));
const fuoriTubo = (t, p) => { let d = Infinity; for (let s = 0; s + 1 < t.pts.length; s++) { const a = t.pts[s], b = t.pts[s + 1], u = sub(b, a), L2 = dot(u, u) || 1, k = Math.min(1, Math.max(0, dot(sub(p, a), u) / L2)); d = Math.min(d, len(sub(p, add(a, mul(u, k)))) - t.r(s + k)); } return d; };
const fuoriTubi = p => Math.min(...TUBI.map(t => fuoriTubo(t, p)));

/* ============ Volume ============ */
const volume = (pos, idx) => { let v = 0; for (const [a, b, c] of idx) v += dot(pos[a], cross(pos[b], pos[c])); return v / 6; };
const V0 = (() => { const p = [], t = []; for (let i = 0; i < src.pos.length; i += 3) p.push([src.pos[i], src.pos[i + 1], src.pos[i + 2]]); for (let i = 0; i < src.idx.length; i += 3) t.push([src.idx[i], src.idx[i + 1], src.idx[i + 2]]); return volume(p, t); })();   // mesh di partenza
// peso della compensazione: rampa in y, lontano dal solco e dai tubi di vasi e nervi (che il bicipite sfiora: non vi si spinge dentro)
const pesoVol = (p, s) => { const w = sstep(VOL.y[0], VOL.y[1], p[1]) * (1 - sstep(VOL.y[2], VOL.y[3], p[1])) * sstep(0, 0.1, s - (SETTO.R + SETTO.gap / 2 + VOL.dallo)); return w > 0 ? w * sstep(0.03, 0.1, fuoriTubi(p)) : 0; };
{
  const vertN = (m) => { const N = m.pos.map(() => [0, 0, 0]), A = m.pos.map(() => 0); for (const [a, b, c] of m.idx) { const f = cross(sub(m.pos[b], m.pos[a]), sub(m.pos[c], m.pos[a])), ar = len(f) / 6; for (const q of [a, b, c]) { N[q] = add(N[q], f); A[q] += ar; } } return { N: N.map(norm), A }; };
  for (let it = 0; it < 3; it++) {
    const V1 = volume(capi.lungo.pos, capi.lungo.idx) + volume(capi.breve.pos, capi.breve.idx), dV = V0 - V1;
    let W = 0; const info = {};
    for (const nome of ['lungo', 'breve']) {
      const m = capi[nome], e = nome === 'lungo' ? -1 : 1, { N, A } = vertN(m), w = m.pos.map((p, i) => m.tag[i] >= 250 ? 0 : pesoVol(p, e * sOf(p)));
      info[nome] = { N, w }; m.pos.forEach((_, i) => { W += A[i] * w[i]; });
    }
    const delta = dV / W;
    log('volume: partenza', V0.toFixed(3), 'cm³, capi', V1.toFixed(3), `(${(100 * (V1 / V0 - 1)).toFixed(2)} %), spostamento in fuori ${(10 * delta).toFixed(3)} mm`);
    if (Math.abs(dV / V0) < 1e-5) break;
    for (const nome of ['lungo', 'breve']) { const m = capi[nome], { N, w } = info[nome]; m.pos = m.pos.map((p, i) => w[i] ? add(p, mul(N[i], delta * w[i])) : p); }
  }
}

/* ============ Verifiche ============ */
function bordiAperti(m) {   // lati usati un numero dispari di volte, per posizione (mesh chiusa: 0; il verso non conta, vedi la punta del tendine)
  const kp = i => m.pos[i].map(v => Math.round(v * 1e5)).join(','), cnt = new Map();
  for (const [a, b, c] of m.idx) for (const [u, v] of [[a, b], [b, c], [c, a]]) { const ku = kp(u), kv = kp(v), k = ku < kv ? ku + '|' + kv : kv + '|' + ku; cnt.set(k, (cnt.get(k) || 0) + 1); }
  let open = 0; for (const c of cnt.values()) if (c % 2) open++; return open;
}
const Vl = volume(capi.lungo.pos, capi.lungo.idx), Vb = volume(capi.breve.pos, capi.breve.idx);
log(`capo lungo ${capi.lungo.pos.length} vertici, ${(Vl).toFixed(2)} cm³; capo breve ${capi.breve.pos.length} vertici, ${(Vb).toFixed(2)} cm³; totale ${(Vl + Vb).toFixed(2)} contro ${V0.toFixed(2)} (${(100 * ((Vl + Vb) / V0 - 1)).toFixed(3)} %)`);
log('lati aperti (per posizione): lungo', bordiAperti(capi.lungo), ', breve', bordiAperti(capi.breve));
// distacco tra i capi sul piano di taglio e alla fusione
for (const y of [5, 6, 7, 8, 9, 10, 11, 11.9]) {
  let dl = -Infinity, db = Infinity;
  for (const p of capi.lungo.pos) if (Math.abs(p[1] - y) < 0.05) dl = Math.max(dl, sOf(p));
  for (const p of capi.breve.pos) if (Math.abs(p[1] - y) < 0.05) db = Math.min(db, sOf(p));
  log(`y ${y}: distacco tra i capi ${(10 * (db - dl)).toFixed(2)} mm`);
}

// superficie esterna invariata sotto la fusione: massimo spostamento dei vertici di partenza sotto y0 − 0,5
{
  let mx = 0; const kp = p => p.map(v => Math.round(v * 1e4)).join(','), orig = new Set(); for (let i = 0; i < src.pos.length / 3; i++) if (src.pos[3 * i + 1] < SETTO.y0 - 0.5) orig.add(kp([src.pos[3 * i], src.pos[3 * i + 1], src.pos[3 * i + 2]]));
  let tot = 0, trovati = 0; for (const m of [capi.lungo, capi.breve]) for (let i = 0; i < m.pos.length; i++) if (m.pos[i][1] < SETTO.y0 - 0.5 && Math.abs(sOf(m.pos[i])) > 1e-4) { tot++; if (orig.has(kp(m.pos[i]))) trovati++; }
  log(`sotto y ${SETTO.y0 - 0.5}: ${trovati}/${tot} vertici esterni dei capi coincidono con quelli di partenza`);
}
// compenetrazioni nella zona modificata (y > y0 − 0,7): mesh vicine (distanza esatta) e tubi di vasi e nervi, prima (bic) e dopo (i due capi)
{
  const lo = [0, 1, 2].map(k => Math.min(...capi.lungo.pos.map(p => p[k]), ...capi.breve.pos.map(p => p[k])) - 0.3); lo[1] = SETTO.y0 - 0.7;
  const hi = [0, 1, 2].map(k => Math.max(...capi.lungo.pos.map(p => p[k]), ...capi.breve.pos.map(p => p[k])) + 0.3);
  G.setGriglia(lo, 0.03, ...[0, 1, 2].map(k => Math.ceil((hi[k] - lo[k]) / 0.03)));
  const prima = []; for (let i = 0; i < src.pos.length / 3; i++) if (src.pos[3 * i + 1] > lo[1]) prima.push([src.pos[3 * i], src.pos[3 * i + 1], src.pos[3 * i + 2]]);
  const dopo = [...capi.lungo.pos, ...capi.breve.pos].filter(p => p[1] > lo[1]);
  const conta = (pts, f) => { let n = 0, mx = 0; for (const p of pts) { const d = f(p); if (d < -0.01) { n++; mx = Math.max(mx, -d); } } return `${n} (max ${(10 * mx).toFixed(2)} mm)`; };
  // mesh vicine (la cute no: contiene tutto)
  const vicine = G.man.meshes.map(m => m.n).filter(n => !['bic', NOMI.lungo, NOMI.breve, SETTI.lungo, SETTI.breve, 'cute'].includes(n)).filter(n => {
    const { pos } = G.REAL(n); for (let i = 0; i < pos.length; i += 3) if (pos[i] > lo[0] && pos[i] < hi[0] && pos[i + 1] > lo[1] && pos[i + 1] < hi[1] && pos[i + 2] > lo[2] && pos[i + 2] < hi[2]) return true; return false;
  });
  const righe = [];
  for (const n of vicine) {
    const F = G.esatta(G.sdf(G.solid(n)).F, [n], 0.07), f = p => G.sample(F, p[0], p[1], p[2]);
    righe.push(`  ${n}: prima ${conta(prima, f)}, dopo ${conta(dopo, f)}`);
  }
  for (const t of TUBI) {
    const f = p => fuoriTubo(t, p), a = conta(prima, f), b = conta(dopo, f); if (a[0] !== '0' || b[0] !== '0') righe.push(`  ${t.id}: prima ${a}, dopo ${b}`);
  }
  log('vertici dentro altre strutture (> 0,1 mm), zona y > ' + lo[1].toFixed(1) + ':\n' + righe.join('\n'));
}

/* ============ Normali ============ */
// La pagina ricalcolerebbe le normali dai triangoli: sui triangoli originali tagliati a metà (fino a 3 mm vicino al tendine) cambierebbe il peso con
// cui si mediano attorno ai vertici vicini al setto, e la fusione mostrerebbe chiazze di luce. Le normali si scrivono quindi nel file: per la superficie
// esterna e la sezione = normale di partenza (interpolata sui punti nuovi: quella che la pagina mostrava lì) + rotazione dovuta al solco (differenza
// tra le normali dei triangoli dopo e prima dello spostamento: zero dove nulla si muove); per la faccia sul setto e il raccordo saldato, dai triangoli.
const normaliTri = (pos, idx) => { const N = pos.map(() => [0, 0, 0]); for (const [a, b, c] of idx) { const f = cross(sub(pos[b], pos[a]), sub(pos[c], pos[a])); for (const q of [a, b, c]) N[q] = add(N[q], f); } return N.map(norm); };
for (const m of [capi.lungo, capi.breve]) {
  const N0 = normaliTri(m.pos0, m.idx), N1 = normaliTri(m.pos, m.idx);
  m.nrm = m.pos.map((_, i) => m.nb[i] && !m.saldati.has(i) ? norm(add(m.nb[i], sub(N1[i], N0[i]))) : N1[i]);
}

if (VERIFICA) process.exit(0);
/* ============ Scrittura ============ */
// una mesh con i triangoli scelti (vertici rinumerati); i vertici in comune tra le due (raccordo saldato) si ripetono nelle due mesh
const pack = (m, tris) => {
  const nuovoIdx = new Map(), usati = []; for (const t of tris) for (const v of t) if (!nuovoIdx.has(v)) { nuovoIdx.set(v, usati.length); usati.push(v); }
  const nv = usati.length, pos = new Float32Array(nv * 3), fdir = new Int8Array(nv * 3), nrm = new Int8Array(nv * 3), tag = Uint8Array.from(usati.map(v => m.tag[v]));
  usati.forEach((v, i) => { pos.set(m.pos[v], 3 * i); const f = norm(m.fib[v]); for (let k = 0; k < 3; k++) { fdir[3 * i + k] = Math.round(f[k] * 127); nrm[3 * i + k] = Math.round(m.nrm[v][k] * 127); } });
  return { pos, idx: Uint32Array.from(tris.flatMap(t => t.map(v => nuovoIdx.get(v)))), tag, fdir, nrm };
};
const NOMI_TUTTI = ['bic', NOMI.lungo, NOMI.breve, SETTI.lungo, SETTI.breve];
const at = G.man.meshes.findIndex(m => m.n === 'bic' || m.n === NOMI.lungo);   // stesso posto nell'indice a ogni lancio
G.man.meshes = G.man.meshes.filter(m => !NOMI_TUTTI.includes(m.n));
G.man.meshes.splice(at >= 0 ? at : G.man.meshes.length, 0, { n: NOMI.lungo }, { n: SETTI.lungo, po: 1 }, { n: NOMI.breve }, { n: SETTI.breve, po: 1 });   // po: polygonOffset nella pagina
for (const nome of ['lungo', 'breve']) {
  const m = capi[nome];
  setMesh(NOMI[nome], pack(m, m.idx.filter((_, k) => !m.setto.has(k)))); setMesh(SETTI[nome], pack(m, m.idx.filter((_, k) => m.setto.has(k))));
}
G.saveFile(G.repack());
