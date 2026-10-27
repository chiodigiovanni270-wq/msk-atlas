/* Gran dorsale e vicini della spalla (modelli/spalla-3d.html): tendine ricostruito pulito, dietro al coracobrachiale.

   Problema. Nella mesh di BodyParts3D il tendine del gran dorsale (`lat`, x < ~1 cm, vicino all'omero) è un groviglio di lamelle che si attraversano
   (nelle sezioni il contorno è una linea a zig-zag con autointersezioni): margine a dente di sega e compenetrazione col coracobrachiale (fino a ~5 mm,
   quasi 3 cm³), col bicipite breve e col capo lungo del tricipite. Spostare i vertici non basta (le facce sono aggrovigliate): si ricostruisce la superficie.

   Uso (dalla cartella del progetto):
     node strumenti/margine-dorsale-spalla.mjs              → scrive nel file del modello
     PROVA=1 node strumenti/margine-dorsale-spalla.mjs      → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/margine-dorsale-spalla.mjs   → lavora su una copia
   Va lanciato in fondo alla catena della spalla (dopo `nervi-muscoli-spalla.mjs`), una volta sola, sulle mesh della revisione git 396f561 del modello
   (prima di questo script): ricostruisce `lat` da quella che trova nel file, quindi non va rilanciato sul proprio risultato.

   Metodo.
   1. Ricostruzione di `lat`. Solido voxelizzato (griglia `H_LAT`, riempimento per parità ∪ superficie); campo con segno = distanza esatta dai triangoli nel ventre (levigata di `SFOCA_V`
      passate, ispessita di `DILATA`: la superficie segue la mesh senza gradinatura) e chiusura morfologica di raggio `R_TENDINE` nella zona del tendine
      (x < `X_TENDINE`, raccordo fino a `X_RACCORDO`: richiude le lamelle che si attraversano, levigata di `SFOCA` passate); più scavo dei tubi vasculo-nervosi (distanza ≥ `GIOCO_TUBO`: il nervo passa in una finestra senza toccare)
      e dei muscoli in `DAVANTI` (coracobrachiale, capo breve del bicipite) con tutto ciò che sta davanti alla loro faccia posteriore (+z = anteriore),
      a distanza `GIOCO_DAVANTI` e con bordo arrotondato (`SFOCA_OMBRA`): il tendine passa dietro di loro, che restano come sono.
      Superficie con surface nets e Taubin; tag (muscolo/tendine) e direzione delle fibre dal vertice originale più vicino; il piano di taglio y = −14
      resta piano. Normali non scritte (le calcola la pagina).
   2. Separazione. Per i vicini (`PARTNER`) i vertici entro `GIOCO` da `lat` si spingono fuori lungo il gradiente della distanza da `lat` (griglia 0,3 mm),
      con spostamento levigato sulla mesh (`DIFFUSIONE` passate) e `GIRI` giri; nessun vertice entra in ossa o tubi più di quanto già non fosse
      (distanza minima `min(0,03 cm, distanza di partenza)`).
   3. Controllo: volume comune di `lat` coi vicini e coi tubi, dei vicini coi tubi (griglia 0,2 mm; ≤ 1,4 mm³ è rumore), numero di triangoli di `lat`. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setPos, setMesh, attrs, repack, saveFile, log, sstep, setGriglia, griglia, campo, solid, edt, chiuso, sfoca, nets, semplifica, taubin, sdf, sample, grad, unione } = G;

const PROVA = !!process.env.PROVA;
const PARTNER = (process.env.PARTNER ?? 'tri_lungo').split(',').filter(Boolean);
const TUBI = ['a_asc', 'v_asc', 'n_mediano', 'n_ulnare', 'n_radiale', 'n_muscolocutaneo', 'plesso', 'n_ascellare', 'n_soprascapolare', 'a_succ', 'v_succ'];
const DURI = ['scapola', 'clavicola', 'omero', 'costa1', 'costa2', 'costa3', 'costa4', 'costa5', 'manubrio', 'corpo_sterno', 'cc1', 'cc2', 'cc3', 'cc4', 'cc5', 'cart_omero', 'cart_glen', 'labbro', 'caps'];
const H_LAT = +(process.env.H_LAT ?? 0.035), R_CHIUSURA = +(process.env.R_CHIUSURA ?? 0.05), R_TENDINE = +(process.env.R_TENDINE ?? 0.14), X_TENDINE = +(process.env.X_TENDINE ?? 0.8), X_RACCORDO = +(process.env.X_RACCORDO ?? 2.0);
const TRI_OBIETTIVO = +(process.env.TRI_OBIETTIVO ?? 90000), ERR_MAX = +(process.env.ERR_MAX ?? 1e-5);
const DAVANTI = (process.env.DAVANTI ?? 'coracobr,bic_breve').split(',').filter(Boolean), GIOCO_DAVANTI = +(process.env.GIOCO_DAVANTI ?? 0.02), SFOCA_OMBRA = +(process.env.SFOCA_OMBRA ?? 3);
const SFOCA_V = +(process.env.SFOCA_V ?? 1), LISCIA_FIN = +(process.env.LISCIA_FIN ?? 16), DILATA = +(process.env.DILATA ?? 0.015), ESATTO = process.env.ESATTO !== '0';
const SFOCA = +(process.env.SFOCA ?? 3), GIOCO_TUBO = +(process.env.GIOCO_TUBO ?? 0.04);
const GIOCO = +(process.env.GIOCO ?? 0.02), GIRI = +(process.env.GIRI ?? 6), DIFFUSIONE = +(process.env.DIFFUSIONE ?? 12), GIOCO_OST = 0.03;
const BOX = [[-1.8, -11.4, -4.2], [1.8, -5.0, 2.0]];   // dove lat e vicini si toccano (cm)

const pt = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
const nrm = g => { const l = Math.hypot(g[0], g[1], g[2]) || 1; return [g[0] / l, g[1] / l, g[2] / l]; };
const dentro = (p, B) => p[0] >= B[0][0] && p[0] <= B[1][0] && p[1] >= B[0][1] && p[1] <= B[1][1] && p[2] >= B[0][2] && p[2] <= B[1][2];
const bbox = n => { const { pos, nv } = REAL(n), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[3 * i + k]); hi[k] = Math.max(hi[k], pos[3 * i + k]); } return { lo, hi }; };
function comune2(a, b, B) {   // volume comune (mm³), griglia 0,2 mm, solo dove le scatole delle due mesh si sovrappongono (e nel riquadro B, se dato)
  const qa = bbox(a), qb = bbox(b), lo = [0, 1, 2].map(k => Math.max(qa.lo[k], qb.lo[k], B ? B[0][k] : -1e9) - 0.05), hi = [0, 1, 2].map(k => Math.min(qa.hi[k], qb.hi[k], B ? B[1][k] : 1e9) + 0.05);
  if (!lo.every((v, k) => v < hi[k] - 0.1)) return 0;
  setGriglia(lo, 0.02, ...[0, 1, 2].map(k => Math.ceil((hi[k] - lo[k]) / 0.02))); const A = solid(a), C = solid(b); let n = 0; for (let i = 0; i < G.N; i++) if (A[i] && C[i]) n++; return n * 0.02 ** 3 * 1000; }

/* ---- 1. ricostruzione di lat e del coracobrachiale ---- */
// vertice originale più vicino (tag, fibre) di una mesh, da una griglia di celle
function origine(nome) { const L0 = REAL(nome), at = attrs(nome), P0 = L0.pos, cella = 0.15, H1 = new Map(), key = (i, j, k) => i + ',' + j + ',' + k;
  for (let i = 0; i < L0.nv; i++) { const k = key(Math.floor(P0[3 * i] / cella), Math.floor(P0[3 * i + 1] / cella), Math.floor(P0[3 * i + 2] / cella)); (H1.get(k) ?? H1.set(k, []).get(k)).push(i); }
  const vicino = p => { const c = [0, 1, 2].map(q => Math.floor(p[q] / cella)); for (let R = 0; R < 12; R++) { let best = -1, bd = 1e9;
      for (let a = -R; a <= R; a++) for (let bq = -R; bq <= R; bq++) for (let cq = -R; cq <= R; cq++) { if (Math.max(Math.abs(a), Math.abs(bq), Math.abs(cq)) !== R) continue; const L = H1.get(key(c[0] + a, c[1] + bq, c[2] + cq)); if (!L) continue;
        for (const i of L) { const d = (P0[3 * i] - p[0]) ** 2 + (P0[3 * i + 1] - p[1]) ** 2 + (P0[3 * i + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = i; } } }
      if (best >= 0 && R >= 1) return best; } return 0; };
  return { at, nv0: L0.nv, nt0: L0.idx.length / 3, vicino }; }
// campo → surface nets → semplificazione → tag e fibre dal vertice originale → mesh del modello
function costruisci(nome, F, o, obiettivo, ylim) {
  const m0 = nets(F, () => [0, 1, 0]); log(nome + ': surface nets', m0.pos.length / 3, 'vertici', m0.idx.length / 3, 'triangoli');
  const m = semplifica(m0.pos, m0.idx, ERR_MAX, obiettivo), nv = m.pos.length / 3; if (LISCIA_FIN > 0) m.pos = taubin(m.pos, m.idx, LISCIA_FIN);   // toglie la dentellatura dei vertici lungo le pieghe
  log(nome + ': semplificata a', nv, 'vertici', m.idx.length / 3, 'triangoli (prima', o.nv0, '/', o.nt0, ')');
  const tag = o.at.tag ? new Uint8Array(nv) : null, fdir = o.at.fdir ? new Int8Array(nv * 3) : null;
  for (let i = 0; i < nv; i++) { const p = pt(m.pos, i); if (ylim !== undefined && p[1] < ylim + 0.03) m.pos[3 * i + 1] = ylim; const j = o.vicino(p); if (tag) tag[i] = o.at.tag[j]; if (fdir) for (let k = 0; k < 3; k++) fdir[3 * i + k] = o.at.fdir[3 * j + k]; }   // piano di taglio piano
  setMesh(nome, { pos: m.pos, idx: m.idx, tag, fdir }); }

const OL = origine('lat');
{ const b = bbox('lat'), g = griglia(b.lo, b.hi, H_LAT, 0.25); log('lat: griglia', g.nx, g.ny, g.nz, 'h', H_LAT);
  const M = solid('lat'), Do = edt(M), F2 = chiuso(Do, R_TENDINE), F1 = ESATTO ? campo(['lat']).F : chiuso(Do, R_CHIUSURA); log('lat: campi fatti');
  sfoca(F1, ESATTO ? SFOCA_V : 1); sfoca(F2, SFOCA); for (let i = 0; i < G.N; i++) F1[i] -= DILATA;   // DILATA: ispessisce un poco le lamine più sottili di un voxel (altrimenti la superficie si buca)   // F1: distanza esatta dai triangoli (ventre: segue la mesh senza gradinatura), F2 (zona del tendine) chiusura molto levigata
  const F = new Float32Array(G.N); for (let k = 0; k < G.NZ; k++) for (let j = 0; j < G.NY; j++) for (let i = 0; i < G.NX; i++) { const id = i + G.NX * j + G.NXY * k, x = G.O[0] + (i + 0.5) * G.H, w = 1 - sstep(X_TENDINE, X_RACCORDO, x); F[id] = (1 - w) * F1[id] + w * F2[id]; }
  const Dt = edt(unione(TUBI)); for (let i = 0; i < G.N; i++) F[i] = Math.max(F[i], GIOCO_TUBO - Dt[i]);   // il nervo passa in una finestra senza toccare
  // muscoli che stanno davanti al gran dorsale (coracobrachiale, capo breve del bicipite): lat esce dal muscolo e da tutto ciò che sta davanti
  // alla sua faccia posteriore (+z = anteriore), cioè passa dietro; l'ombra si arrotonda (SFOCA_OMBRA) perché il bordo del taglio sia liscio
  if (DAVANTI.length) { const O = unione(DAVANTI), Om = new Uint8Array(G.N);
    for (let j = 0; j < G.NY; j++) for (let i = 0; i < G.NX; i++) { let dietro = false; for (let k = 0; k < G.NZ; k++) { const id = i + G.NX * j + G.NXY * k; if (O[id]) dietro = true; if (dietro) Om[id] = 1; } }
    const FO = sdf(Om).F; sfoca(FO, SFOCA_OMBRA); for (let i = 0; i < G.N; i++) F[i] = Math.max(F[i], GIOCO_DAVANTI - FO[i]); }
  log('lat: campo pronto'); costruisci('lat', F, OL, TRI_OBIETTIVO, b.lo[1]); }


/* ---- 2. separazione dei vicini ---- */
const P = {}, NB = {}, D0 = {};
const vicini = name => { const { idx, nv } = REAL(name), nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); } return nb.map(s => [...s]); };
for (const n of PARTNER) { const r = REAL(n); P[n] = Float32Array.from(r.pos.subarray(0, r.nv * 3)); NB[n] = vicini(n); }
griglia(...BOX, 0.03, 0);
{ const FOST = campo([...DURI, ...TUBI]).F; for (const n of PARTNER) { const Q = P[n]; D0[n] = new Float32Array(Q.length / 3); for (let i = 0; i < Q.length / 3; i++) D0[n][i] = sample(FOST, Q[3 * i], Q[3 * i + 1], Q[3 * i + 2]); } }
for (let giro = 0; giro < GIRI; giro++) {
  griglia(...BOX, 0.03, 0);
  const FL = campo(['lat']).F, FOST = campo([...DURI, ...TUBI]).F; let tot = 0, mx = 0, spinti = 0;
  for (const n of PARTNER) { const Q = P[n], nv = Q.length / 3, D = new Float32Array(Q.length);
    for (let i = 0; i < nv; i++) { const p = pt(Q, i); if (!dentro(p, BOX)) continue; const d = sample(FL, p[0], p[1], p[2]); if (d >= GIOCO) continue; const g = nrm(grad(FL, p));
      for (let k = 0; k < 3; k++) D[3 * i + k] = g[k] * (GIOCO - d) * 1.1; tot++; }
    for (let s = 0; s < DIFFUSIONE; s++) { const E = Float32Array.from(D);
      for (let i = 0; i < nv; i++) { const L = NB[n][i]; if (!L.length) continue; for (let k = 0; k < 3; k++) { let m = 0; for (const j of L) m += E[3 * j + k]; D[3 * i + k] = 0.5 * E[3 * i + k] + 0.5 * m / L.length; } } }
    for (let i = 0; i < nv * 3; i++) { Q[i] += D[i]; mx = Math.max(mx, Math.abs(D[i])); }
    for (let i = 0; i < nv; i++) { const p = pt(Q, i); if (!dentro(p, BOX)) continue; const lim = Math.min(GIOCO_OST, D0[n][i]);
      for (let it = 0; it < 4; it++) { const d = sample(FOST, p[0], p[1], p[2]); if (d >= lim - 1e-4) break; const g = nrm(grad(FOST, p)); for (let k = 0; k < 3; k++) p[k] += g[k] * (lim - d); spinti++; }
      Q[3 * i] = p[0]; Q[3 * i + 1] = p[1]; Q[3 * i + 2] = p[2]; }
    setPos(n, Float32Array.from(Q)); }
  log('giro', giro + 1, '| vertici da spostare', tot, '| spostamento massimo', (mx * 10).toFixed(2), 'mm | riportati fuori da ossa/tubi', spinti);
  if (!tot) break;
}

/* ---- 3. controllo ---- */
for (const m of [...DAVANTI, ...PARTNER]) log('lat ∩', m, comune2('lat', m).toFixed(1), 'mm³');
for (const n of ['lat', ...PARTNER]) { const out = {}; for (const t of TUBI) { const v = comune2(n, t); if (v >= 0.05) out[t] = +v.toFixed(1); } log('controllo', n, 'tubi', JSON.stringify(out)); }
if (!PROVA) saveFile(repack());
