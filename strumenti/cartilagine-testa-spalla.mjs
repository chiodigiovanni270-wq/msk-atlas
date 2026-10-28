/* Cartilagine della testa omerale della spalla (modelli/spalla-3d.html): `cart_omero` ricostruita con margine liscio e regolare.

   Problema. La cartilagine di `cartilagini-spalla.mjs` nasce da un'isolinea sulla mesh dell'osso: il margine ha una dentellatura fine (a dente di sega)
   e un tracciato ondulato, e la superficie ripete le piccole conche e gobbe dell'osso BodyParts3D.

   Uso (dalla cartella del progetto):
     node strumenti/cartilagine-testa-spalla.mjs              → scrive `cart_omero` nel file del modello
     PROVA=1 node strumenti/cartilagine-testa-spalla.mjs      → stampa i controlli senza scrivere
     PROVA=f.json node strumenti/cartilagine-testa-spalla.mjs → come sopra, e salva la mesh nuova (pos, idx, nrm) in un JSON
     MODELLO=/tmp/copia.html node strumenti/cartilagine-testa-spalla.mjs   → lavora su una copia
   Va lanciato in fondo alla catena della spalla (dopo `margine-dorsale-spalla.mjs`). Riparte sempre dall'omero del file e dalla `cart_omero`
   della revisione git `PARTENZA` (prima di questo script, da cui prende solo il territorio), quindi si può rilanciare con lo stesso risultato.
   Se si rilancia `cartilagini-spalla.mjs` (e la catena), aggiornare PARTENZA alla revisione nuova e rilanciare anche questo.

   Metodo.
   1. Sfera della testa (come in cartilagini-spalla: adattata ai vertici dell'omero vicini alla sfera) e asse = direzione media della cartilagine di partenza.
   2. Margine: in coordinate polari attorno all'asse, l'angolo massimo della cartilagine di partenza per ogni settore (`SETTORI`), approssimato con una
      serie di Fourier di `ARMONICHE` termini (minimi quadrati): una curva chiusa liscia che segue il collo anatomico senza dentellature.
   3. Griglia polare: `ANELLI` anelli dal polo al margine × `RAGGI` meridiani, più fitti verso il margine. Per ogni nodo, raggio dell'osso lungo la
      direzione dal centro (intersezione più esterna con l'omero entro ±`FINESTRA`), levigato sulla griglia (`LEVIGA` passate) tenendolo tra
      osso + `T_MIN` − t (l'osso non buca la faccia esterna) e osso + `SU_MARGINE`…`SU_CENTRO` (al margine resta sull'osso, al centro colma le conche):
      superficie di base liscia.
   4. Guscio chiuso: faccia esterna a base + t (lo spessore t va da `T_BORDO` al margine a `T_TESTA` a `RAMPA` dal margine),
      faccia interna a `min(base, osso) − SOTTO` (sempre dentro l'osso), bordo arrotondato a mezzo cerchio (`BORDO` anelli, sporgenza `SPORGE`·semispessore).
   5. Vicini (`VICINI`: capsula, cuffia, capo lungo del bicipite, borsa, cartilagine glenoidea, labbro): dove la nuova faccia esterna entrerebbe in uno di
      essi, la si abbassa fino a `GIOCO` sotto il vicino (mai sotto osso + T_MIN), con raccordo levigato (`RACCORDO`); le loro mesh non si toccano.
   6. Normali di vertice pesate con l'angolo, scritte nel file (la pagina non le ricalcola).
   Controlli: vertici dei vicini dentro la cartilagine (prima/dopo), distanza minima dalla cartilagine glenoidea, spessore del bordo, triangoli. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, realDaRevisione, setMesh, saveFile, repack, log, sstep, clamp } = G;
const B = await import('./lib-bp3d.mjs');

const PARTENZA = 'f91a05d';            // revisione con la cartilagine di cartilagini-spalla.mjs (territorio di partenza)
const SETTORI = 72, ARMONICHE = 4;
const ANELLI = 30, RAGGI = 144, BORDO = 5;
const FINESTRA = [0.8, 0.4];           // cm sotto/sopra la sfera in cui cercare l'osso lungo il raggio
const LEVIGA = 80, SU_MARGINE = 0.02, SU_CENTRO = 0.5, RAMPA_SU = 0.6;   // levigatura vincolata della base (cm)
const T_TESTA = 0.14, T_BORDO = 0.10, T_MIN = 0.04, RAMPA = 0.3, SOTTO = 0.05, SPORGE = 0.6;
const VICINI = ['caps', 'supra', 'infra', 'subs', 'tmin', 'bic_lungo', 'borsa_sad', 'cart_glen', 'labbro', 'sghl', 'mghl', 'ighl_a', 'ighl_p', 'coraco_om', 'trasv_om'];
const GIOCO = 0.01, RACCORDO = 30;   // gioco dai vicini (cm) e giri di allargamento dell’abbassamento

const om = REAL('omero'), vec = realDaRevisione(PARTENZA, 'cart_omero', 'modelli/spalla-3d.html');
const P3 = (p, i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nor = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };

/* ---- 1. sfera e asse ---- */
function fitSfera(pts) {
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], Bv = [0, 0, 0, 0];
  for (const [x, y, z] of pts) { const r = [2 * x, 2 * y, 2 * z, 1], s = x * x + y * y + z * z; for (let a = 0; a < 4; a++) { Bv[a] += r[a] * s; for (let b = 0; b < 4; b++) A[a][b] += r[a] * r[b]; } }
  const M = A.map((r, i) => [...r, Bv[i]]);
  for (let i = 0; i < 4; i++) { let p = i; for (let k = i + 1; k < 4; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]]; for (let k = 0; k < 4; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < 5; j++) M[k][j] -= f * M[i][j]; } }
  const s = M.map((r, i) => r[4] / r[i]); return { c: [s[0], s[1], s[2]], r: Math.sqrt(s[3] + s[0] ** 2 + s[1] ** 2 + s[2] ** 2) };
}
let sf = { c: [-0.18, -0.03, 0.13], r: 2.36 };
for (let it = 0; it < 12; it++) { const sel = []; for (let i = 0; i < om.nv; i++) { const p = P3(om.pos, i), d = Math.hypot(...sub(p, sf.c)); if (p[1] > sf.c[1] - 0.3 && Math.abs(d - sf.r) < 0.15) sel.push(p); } sf = fitSfera(sel); }
const C = sf.c, R = sf.r;
let ax = [0, 0, 0]; for (let i = 0; i < vec.pos.length / 3; i++) { const d = nor(sub(P3(vec.pos, i), C)); for (let k = 0; k < 3; k++) ax[k] += d[k]; }
ax = nor(ax);
const e1 = nor(sub([0, 1, 0], ax.map(x => x * ax[1]))), e2 = cross(ax, e1);
const dirDi = (th, ph) => [0, 1, 2].map(k => Math.cos(th) * ax[k] + Math.sin(th) * (Math.cos(ph) * e1[k] + Math.sin(ph) * e2[k]));
const polari = p => { const v = sub(p, C), d = Math.hypot(...v); return { d, th: Math.acos(clamp(dot(v, ax) / d, -1, 1)), ph: Math.atan2(dot(v, e2), dot(v, e1)) }; };
log('sfera: centro', C.map(x => x.toFixed(3)).join(','), 'raggio', R.toFixed(3), 'cm; asse', ax.map(x => x.toFixed(3)).join(','));

/* ---- 2. margine: serie di Fourier dell'angolo massimo per settore ---- */
const thMax = new Float64Array(SETTORI);
for (let i = 0; i < vec.pos.length / 3; i++) { const q = polari(P3(vec.pos, i)), k = Math.floor((q.ph + Math.PI) / (2 * Math.PI) * SETTORI) % SETTORI; if (q.th > thMax[k]) thMax[k] = q.th; }
const coef = (() => {   // minimi quadrati su 1, cos kφ, sin kφ (settori equispaziati: proiezione diretta)
  const c = [0]; for (let k = 0; k < SETTORI; k++) c[0] += thMax[k] / SETTORI;
  for (let h = 1; h <= ARMONICHE; h++) { let a = 0, b = 0; for (let k = 0; k < SETTORI; k++) { const ph = -Math.PI + (k + 0.5) / SETTORI * 2 * Math.PI; a += 2 * thMax[k] * Math.cos(h * ph) / SETTORI; b += 2 * thMax[k] * Math.sin(h * ph) / SETTORI; } c.push(a, b); }
  return c;
})();
const thM = ph => { let t = coef[0]; for (let h = 1; h <= ARMONICHE; h++) t += coef[2 * h - 1] * Math.cos(h * ph) + coef[2 * h] * Math.sin(h * ph); return t; };
{ let mx = 0; for (let k = 0; k < SETTORI; k++) mx = Math.max(mx, Math.abs(thM(-Math.PI + (k + 0.5) / SETTORI * 2 * Math.PI) - thMax[k]) * R); log('margine: scarto massimo dal margine di partenza', (mx * 10).toFixed(1), 'mm'); }

/* ---- 3. raggio dell'osso lungo i raggi della griglia ---- */
const tri = []; for (let t = 0; t < om.idx.length; t += 3) tri.push([om.idx[t], om.idx[t + 1], om.idx[t + 2]]);
function raggioOsso(d) {   // intersezione più esterna del raggio C + s·d con l'omero, s ∈ [R − FINESTRA[0], R + FINESTRA[1]] (Möller–Trumbore)
  let best = -1;
  for (const [a, b, c] of tri) {
    const A = P3(om.pos, a), E1 = sub(P3(om.pos, b), A), E2 = sub(P3(om.pos, c), A), p = cross(d, E2), det = dot(E1, p); if (Math.abs(det) < 1e-12) continue;
    const T = sub(C, A), u = dot(T, p) / det; if (u < 0 || u > 1) continue; const q = cross(T, E1), v = dot(d, q) / det; if (v < 0 || u + v > 1) continue;
    const s = dot(E2, q) / det; if (s > R - FINESTRA[0] && s < R + FINESTRA[1] && s > best) best = s;
  }
  return best;
}
const uDi = i => 1 - (1 - i / ANELLI) ** 1.25;              // anelli più fitti verso il margine
const nodi = [];                                            // [anello][raggio] → {th, ph}
for (let i = 1; i <= ANELLI; i++) { const r = []; for (let j = 0; j < RAGGI; j++) { const ph = -Math.PI + j / RAGGI * 2 * Math.PI; r.push({ th: uDi(i) * thM(ph), ph }); } nodi.push(r); }
const NV = 1 + ANELLI * RAGGI, vid = (i, j) => i === 0 ? 0 : 1 + (i - 1) * RAGGI + ((j % RAGGI) + RAGGI) % RAGGI;
const dirs = new Array(NV); dirs[0] = ax; for (let i = 1; i <= ANELLI; i++) for (let j = 0; j < RAGGI; j++) dirs[vid(i, j)] = dirDi(nodi[i - 1][j].th, nodi[i - 1][j].ph);
const rOsso = new Float64Array(NV); let mancanti = 0;
for (let v = 0; v < NV; v++) { rOsso[v] = raggioOsso(dirs[v]); if (rOsso[v] < 0) mancanti++; }
// adiacenza della griglia (polo + anelli + meridiani) e triangoli
const idxG = [];
for (let j = 0; j < RAGGI; j++) idxG.push(0, vid(1, j), vid(1, j + 1));
for (let i = 1; i < ANELLI; i++) for (let j = 0; j < RAGGI; j++) { const a = vid(i, j), b = vid(i, j + 1), c = vid(i + 1, j), d = vid(i + 1, j + 1); idxG.push(a, c, d, a, d, b); }
const nb = B.vicini(NV, idxG);
const distMargine = v => v === 0 ? 1e9 : (() => { const i = Math.floor((v - 1) / RAGGI) + 1, j = (v - 1) % RAGGI, n = nodi[i - 1][j]; return (thM(n.ph) - n.th) * R; })();
if (mancanti) { log('raggi senza osso:', mancanti, '(riempiti dai vicini)'); for (let g = 0; g < 50; g++) for (let v = 0; v < NV; v++) if (rOsso[v] < 0) { const L = nb[v].filter(w => rOsso[w] > 0); if (L.length) rOsso[v] = L.reduce((s, w) => s + rOsso[w], 0) / L.length; } }
// levigatura vincolata: la base non sale più di SU(v) sopra l'osso (poco al margine, dove l'osso scende verso il collo; di più al centro, per colmare le conche)
const SU = v => SU_MARGINE + (SU_CENTRO - SU_MARGINE) * sstep(0, RAMPA_SU, distMargine(v));
// e non scende tanto che l'osso buchi la faccia esterna (base + t ≥ osso + T_MIN): sulle gobbe dell'osso la superficie si alza dolcemente
const spessore = v => T_BORDO + (T_TESTA - T_BORDO) * sstep(0, RAMPA, distMargine(v));
let base = Float64Array.from(rOsso);
for (let g = 0; g < LEVIGA; g++) { base = B.diffondi(base, nb, 1); for (let v = 0; v < NV; v++) base[v] = clamp(base[v], rOsso[v] + T_MIN - spessore(v), rOsso[v] + SU(v)); }
{ let su = 0, giu = 0; for (let v = 0; v < NV; v++) { su = Math.max(su, base[v] - rOsso[v]); giu = Math.max(giu, rOsso[v] - base[v]); } log('base levigata: fino a', (su * 10).toFixed(2), 'mm sopra e', (giu * 10).toFixed(2), 'mm sotto l\'osso'); }

/* ---- 4. guscio ---- */
const rEst = new Float64Array(NV), rInt = new Float64Array(NV), rMin = new Float64Array(NV);
for (let v = 0; v < NV; v++) { rMin[v] = rOsso[v] + T_MIN; rEst[v] = base[v] + spessore(v); rInt[v] = Math.min(base[v], rOsso[v]) - SOTTO; }

/* ---- 5. vicini: la faccia esterna non entra nelle strutture accanto ---- */
// per ogni vertice dei vicini che cade nel territorio, il raggio a cui sta lungo la sua direzione: la faccia esterna resta sotto
function campionaGriglia(f, th, ph) {   // interpolazione bilineare sulla griglia polare (u, φ)
  const m = thM(ph), u = th / m; if (u > 1) return null;
  const jf = ((ph + Math.PI) / (2 * Math.PI) * RAGGI + RAGGI) % RAGGI, j0 = Math.floor(jf), tj = jf - j0;
  const iu = 1 - (1 - u) ** (1 / 1.25), ifl = iu * ANELLI, i0 = Math.min(ANELLI - 1, Math.floor(ifl)), ti = ifl - i0;
  const g = (i, j) => f[vid(i, j)];
  return (1 - ti) * ((1 - tj) * g(i0, j0) + tj * g(i0, j0 + 1)) + ti * ((1 - tj) * g(i0 + 1, j0) + tj * g(i0 + 1, j0 + 1));
}
const vicini = VICINI.map(n => ({ n, m: REAL(n) }));
const tetto = new Float64Array(NV).fill(1e9), chi = new Map();
for (const { n: nomeV, m } of vicini) for (let k = 0; k < m.nv; k++) {
  const q = polari(P3(m.pos, k)); if (q.th > thM(q.ph) + 0.05 || q.d > R + 0.6 || q.d < R - 0.6) continue;
  const ri = campionaGriglia(rInt, Math.min(q.th, thM(q.ph)), q.ph); if (ri === null || q.d < ri) continue;   // sotto la faccia interna: è già dentro l'osso, non conta
  // il vertice limita i nodi vicini (entro ~1 mm lungo la superficie)
  for (let v = 0; v < NV; v++) { const dd = dirs[v], c = dot(dd, nor(sub(P3(m.pos, k), C))); if (c < 0.99991) continue; if (q.d - GIOCO < rEst[v]) chi.set(nomeV, (chi.get(nomeV) || 0) + 1); tetto[v] = Math.min(tetto[v], q.d - GIOCO); }
}
let abbassati = 0;
{
  const dz = new Float64Array(NV); for (let v = 0; v < NV; v++) if (tetto[v] < rEst[v]) { dz[v] = Math.min(rEst[v] - tetto[v], rEst[v] - rMin[v]); abbassati++; }
  // raccordo: abbassamento allargato e levigato (mai meno di quello richiesto, mai sotto osso + T_MIN)
  let f = Float64Array.from(dz); for (let g = 0; g < RACCORDO; g++) { f = B.diffondi(f, nb, 2); for (let v = 0; v < NV; v++) f[v] = Math.max(f[v], dz[v]); }
  log("abbassamento massimo", (Math.max(...dz) * 10).toFixed(2), "mm");
  for (let v = 0; v < NV; v++) rEst[v] = Math.max(rMin[v], rEst[v] - f[v]);
}
log('nodi della faccia esterna abbassati per i vicini:', abbassati, [...chi].map(([a, b]) => a + ' ' + b).join(', '));

/* ---- mesh: faccia esterna, bordo arrotondato, faccia interna ---- */
const pos = [], idx = [];
const punto = (d, r) => [C[0] + d[0] * r, C[1] + d[1] * r, C[2] + d[2] * r];
for (let v = 0; v < NV; v++) pos.push(...punto(dirs[v], rEst[v]));                 // esterna: 0 … NV−1
const o = v => v, n = v => v + NV;
for (let v = 0; v < NV; v++) pos.push(...punto(dirs[v], rInt[v]));                 // interna: NV … 2NV−1
for (const [a, b, c] of Array.from({ length: idxG.length / 3 }, (_, t) => idxG.slice(3 * t, 3 * t + 3))) { idx.push(o(a), o(b), o(c)); idx.push(n(a), n(c), n(b)); }
// bordo: BORDO−1 anelli intermedi su mezzo cerchio, sporgenti oltre il margine
const anelloBordo = [Array.from({ length: RAGGI }, (_, j) => o(vid(ANELLI, j)))];
for (let s = 1; s < BORDO; s++) {
  const a = Math.PI * s / BORDO, ring = [];
  for (let j = 0; j < RAGGI; j++) {
    const v = vid(ANELLI, j), rc = (rEst[v] + rInt[v]) / 2, h = (rEst[v] - rInt[v]) / 2, nd = nodi[ANELLI - 1][j];
    ring.push(pos.length / 3); pos.push(...punto(dirDi(nd.th + SPORGE * h * Math.sin(a) / rc, nd.ph), rc + h * Math.cos(a)));
  }
  anelloBordo.push(ring);
}
anelloBordo.push(Array.from({ length: RAGGI }, (_, j) => n(vid(ANELLI, j))));
for (let s = 0; s < BORDO; s++) { const A = anelloBordo[s], Bn = anelloBordo[s + 1]; for (let j = 0; j < RAGGI; j++) { const j1 = (j + 1) % RAGGI; idx.push(A[j], Bn[j], Bn[j1], A[j], Bn[j1], A[j1]); } }
// orientamento: volume con segno positivo (normali verso l'esterno)
{ let V = 0; for (let t = 0; t < idx.length; t += 3) V += dot(P3(pos, idx[t]), cross(P3(pos, idx[t + 1]), P3(pos, idx[t + 2]))) / 6;
  if (V < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]]; log('volume', (Math.abs(V) * 1000).toFixed(0), 'mm³'); }
// normali di vertice pesate con l'angolo (scritte nel file): con il peso dell'area, che usa la pagina, il ventaglio del polo
// (tanti triangoli sottili) lascerebbe un dischetto in ombra al centro della testa
const nrm = new Float64Array(pos.length);
for (let t = 0; t < idx.length; t += 3) {
  const v = [idx[t], idx[t + 1], idx[t + 2]], p = v.map(i => P3(pos, i)), fn = nor(cross(sub(p[1], p[0]), sub(p[2], p[0])));
  for (let k = 0; k < 3; k++) { const a = nor(sub(p[(k + 1) % 3], p[k])), b = nor(sub(p[(k + 2) % 3], p[k])), w = Math.acos(clamp(dot(a, b), -1, 1)); for (let q = 0; q < 3; q++) nrm[3 * v[k] + q] += fn[q] * w; }
}
const nrm8 = new Int8Array(pos.length);
for (let i = 0; i < pos.length; i += 3) { const n = nor([nrm[i], nrm[i + 1], nrm[i + 2]]); for (let q = 0; q < 3; q++) nrm8[i + q] = Math.round(n[q] * 127); }
const nuova = { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: null, nrm: nrm8 };
log('cart_omero:', idx.length / 3, 'triangoli,', pos.length / 3, 'vertici (prima', vec.idx.length / 3, 'triangoli)');

/* ---- controlli ---- */
function dentro(mesh) {   // test di parità lungo +x con triangoli raggruppati in celle (y, z)
  const P = mesh.pos, I = mesh.idx, h = 0.05, cel = new Map();
  for (let t = 0; t < I.length; t += 3) { const ys = [P[3 * I[t] + 1], P[3 * I[t + 1] + 1], P[3 * I[t + 2] + 1]], zs = [P[3 * I[t] + 2], P[3 * I[t + 1] + 2], P[3 * I[t + 2] + 2]];
    for (let y = Math.floor(Math.min(...ys) / h); y <= Math.floor(Math.max(...ys) / h); y++) for (let z = Math.floor(Math.min(...zs) / h); z <= Math.floor(Math.max(...zs) / h); z++) { const k = y * 100000 + z; (cel.get(k) || cel.set(k, []).get(k)).push(t); } }
  return p => { const L = cel.get(Math.floor(p[1] / h) * 100000 + Math.floor(p[2] / h)); if (!L) return false; let c = 0;
    for (const t of L) { const A = P3(P, I[t]), Bp = P3(P, I[t + 1]), Cp = P3(P, I[t + 2]);
      const d = (Bp[1] - A[1]) * (Cp[2] - A[2]) - (Cp[1] - A[1]) * (Bp[2] - A[2]); if (Math.abs(d) < 1e-14) continue;
      const u = ((p[1] - A[1]) * (Cp[2] - A[2]) - (Cp[1] - A[1]) * (p[2] - A[2])) / d, w = ((Bp[1] - A[1]) * (p[2] - A[2]) - (p[1] - A[1]) * (Bp[2] - A[2])) / d;
      if (u < 0 || w < 0 || u + w > 1) continue; const x = A[0] + u * (Bp[0] - A[0]) + w * (Cp[0] - A[0]); if (x > p[0]) c++; }
    return c % 2 === 1; };
}
const dVec = dentro(vec), dNuova = dentro(nuova), righe = [];
for (const { n: nome, m } of vicini) { let a = 0, b = 0; for (let k = 0; k < m.nv; k++) { const p = P3(m.pos, k); if (Math.hypot(...sub(p, C)) > R + 1) continue; if (dVec(p)) a++; if (dNuova(p)) b++; } if (a || b) righe.push(`${nome} ${a}→${b}`); }
log('vertici dei vicini dentro la cartilagine (prima→dopo):', righe.join(', ') || 'nessuno');
{ const g = REAL('cart_glen'); let m = 1e9; for (let i = 0; i < NV; i++) for (let k = 0; k < g.nv; k++) { const d = Math.hypot(pos[3 * i] - g.pos[3 * k], pos[3 * i + 1] - g.pos[3 * k + 1], pos[3 * i + 2] - g.pos[3 * k + 2]); if (d < m) m = d; } log('distanza minima dalla cartilagine glenoidea ≈', (m * 10).toFixed(2), 'mm'); }
{ let mn = 1e9, mx = 0; for (let j = 0; j < RAGGI; j++) { const v = vid(ANELLI, j), t = rEst[v] - rInt[v]; mn = Math.min(mn, t); mx = Math.max(mx, t); } log('spessore al margine (con SOTTO):', (mn * 10).toFixed(2), '–', (mx * 10).toFixed(2), 'mm'); }

if (process.env.PROVA) { log('PROVA: nessuna scrittura'); if (process.env.PROVA !== '1') (await import('node:fs')).writeFileSync(process.env.PROVA, JSON.stringify({ pos: [...nuova.pos], idx: [...nuova.idx], nrm: [...nuova.nrm] })); }
else { setMesh('cart_omero', nuova); saveFile(repack()); }
