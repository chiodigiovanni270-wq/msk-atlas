/* Rifinitura degli estensori del gomito (modelli/gomito-3d.html): anconeo, estensore proprio del mignolo (EDM), abduttore lungo del pollice (APL),
   estensore lungo del pollice (EPL); nervo interosseo posteriore e arteria interossea posteriore tra strato superficiale e profondo.

   Uso (dalla cartella del progetto):
     node strumenti/rifinitura-estensori-gomito.mjs             → riscrive anc, edm, apl, epl, ecu, edc, ecrb e i tubi n_pin, a_interossea_post
     node strumenti/rifinitura-estensori-gomito.mjs verifica    → elenca le compenetrazioni degli estensori senza scrivere
     MODELLO=/tmp/copia.html node strumenti/rifinitura-estensori-gomito.mjs   → lavora su una copia
     PASSO=0.07 …                                               → passo della griglia in cm (default 0,06)

   Riparte sempre dalle mesh e dai tubi della revisione `BASE` (idempotente). Va lanciato dopo `rifinitura-flessori-gomito.mjs`; se si rilancia
   uno strumento che riscrive questi muscoli o i tubi (`flessori-pronatori-gomito.mjs`, `vene-gomito.mjs`), aggiornare `BASE` e rilanciarlo.
   Fonte: Standring, Gray's Anatomy 42ª ed. (avambraccio, compartimento posteriore).

   (1) Anconeo. Era un ovale verticale lungo l'ulna, staccato dall'epicondilo laterale. In anatomia è triangolare: nasce con un breve tendine dalla
       faccia posteriore dell'epicondilo laterale e si allarga in basso e medialmente fino alla faccia laterale dell'olecrano e al quarto prossimale
       della faccia posteriore dell'ulna; il margine superiore continua il capo mediale del tricipite. Ricostruito come lamina sul letto teso di omero,
       capsula, legamenti laterali, supinatore e ulna (chiuso: scavalca la fossetta tra epicondilo e olecrano), entro il triangolo `ANCONEO` (apice,
       olecrano, margine posteriore dell'ulna, nel piano dei tre punti): spessore a cupola, sottile ai margini e all'apice tendineo.
   (2) EDM. Era un nastro di 2–3 mm infossato tra EDC ed ECU (sul tragitto del nervo interosseo posteriore). In anatomia è un ventre sottile ma
       fusato dello strato superficiale, tra EDC (lateralmente) ed ECU (medialmente), dal tendine comune. Ricostruito sotto l'involucro superficiale
       di EDC, ECU ed EDM (chiusura che colma il solco), lungo l'asse del vecchio EDM, con larghezza e spessore della tabella `EDM`; EDC ed ECU cedono il volume.
   (3) APL ed EPL. L'APL compariva solo a y −7,3 e finiva con un'estremità arrotondata prima del piano di taglio; l'EPL era un frammento sotto y −10,3.
       In anatomia l'APL nasce dalla parte laterale della faccia posteriore dell'ulna sotto l'inserzione dell'anconeo, dalla membrana interossea e dal
       terzo medio della faccia posteriore del radio; l'EPL dal terzo medio della faccia posteriore dell'ulna (parte laterale), sotto l'APL, e dalla
       membrana. Lo strato profondo è ricostruito come lamina sulla faccia posteriore di ulna, membrana e radio (spessore `PROFONDO`, sezione fusata),
       tra la metà del radio e il margine posteriore dell'ulna, ed è diviso da un setto: APL lateralmente e prossimalmente, EPL medialmente da y −7,6.
       ECU, EDC ed ECRB cedono il volume (l'ECU copriva tutta la faccia posteriore dell'ulna e in parte vi entrava); il tratto prossimale dell'ECU,
       che scendeva sopra il territorio dell'anconeo, è spostato lungo il margine laterale dell'anconeo (`ECU_LATERALE`). Le origini a "dito" di ECU,
       EDC ed EDM sull'epicondilo restano quelle di partenza: il tendine comune degli estensori è un passo successivo.
   (4) Nervo interosseo posteriore e arteria interossea posteriore: sotto il supinatore il nervo decorreva nel solco sottocutaneo tra EDC ed ECU e
       l'arteria sulla membrana interossea (dentro l'APL). In anatomia scendono insieme tra strato superficiale e profondo, sulla superficie di APL ed
       EPL: i punti dei due tubi sono portati sulla faccia posteriore dello strato profondo o del supinatore (nervo sotto y ≈ −6, arteria sotto
       y ≈ −4,5, così passa tra supinatore e APL invece di attraversarlo; raccordi graduali, tabella `TUBI`). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { setMesh, clamp, sstep, log, repack, saveFile, realDaRevisione, REAL } = G;
const VERIFICA = process.argv.includes('verifica');

const BASE = '74750f6';                     // revisione con le mesh e i tubi di partenza (prima di questo strumento)
const FILE_REPO = 'modelli/gomito-3d.html';
const NUOVI = ['anc', 'edm', 'apl', 'epl'], CEDONO = ['ecu', 'edc', 'ecrb'], MUSCOLI = [...NUOVI, ...CEDONO];
const TUBI_MOSSI = ['n_pin', 'a_interossea_post'];
const PASSO = Number(process.env.PASSO || 0.06);
const GIOCO = { osso: 0.045, struttura: 0.02, muscolo: 0.025, tubo: 0.045, cute: 0.2, setto: 0.012 };   // cm
const Y_TAGLIO = -12;
// anconeo: apice (faccia posteriore dell'epicondilo laterale), angolo superiore sull'olecrano, angolo inferiore sul margine posteriore dell'ulna;
// (margine del triangolo: arriva a contatto con l'ECU), spessore dal letto (ai margini → al centro, profilo a cupola), chiusura del letto, profondità
// massima sotto il letto chiuso (il muscolo riempie la fossetta tra olecrano, capo radiale e supinatore fino alle strutture reali), lunghezza del tendine
const ANCONEO = { A: [-2.5, 1.55, -1.05], B: [-0.45, 1.25, -1.6], C: [-0.65, -4.6, -1.15], margine: 0.15, spessore: [0.15, 0.7], letto: 0.5, fondo: 1.0, tendine: [0.35, 0.9] };
// strato profondo (APL + EPL): spessore dal letto (ulna, radio, membrana) [y, cm], estremità prossimale sul lato ulnare e radiale, limiti nella
// coordinata s (0 = centro del radio, 1 = centro dell'ulna), riduzione ai margini (fuso), setto APL/EPL [y, s], estremità prossimale dell'EPL
// e raccordo (cm) tra estremità e setto (l'EPL comincia arrotondato accanto all'APL)
const PROFONDO = { spessore: [[-5.1, 0.3], [-6, 0.5], [-8, 0.75], [-10, 0.9], [-12, 1.0]], cimaUlna: -5.1, cimaRadio: -7.6, sLat: -0.15, sMed: 1.05, fuso: 0.55,
  setto: [[-7.6, 0.75], [-12, 0.45]], cimaEPL: -7.6, angolo: 0.8, raccordo: 0.3, apertura: 0.12 };
// EDM: larghezza e spessore [y, cm] sotto la faccia posteriore dell'involucro superficiale (chiusura `involucro` di EDC, ECU, EDM), estremità prossimale
const EDM = { larghezza: [[0.75, 0.2], [0.2, 0.35], [-1, 0.5], [-3, 0.7], [-6, 0.8], [-12, 0.75]], spessore: [[0.75, 0.15], [0.2, 0.22], [-1, 0.33], [-4, 0.42], [-12, 0.45]],
  cima: 0.75, involucro: 0.5 };
// tubi: sotto y = da (raccordo fino ad a) seguono la faccia posteriore dello strato profondo; l'arteria scende `dx` cm medialmente al nervo
// (o del supinatore, da cui escono; dove mancano entrambi, `fuori` cm dietro la linea radio-ulna). L'arteria passa dietro già sotto il margine prossimale della membrana
// (tra supinatore e APL), così non attraversa l'APL
const TUBI = { n_pin: [-5.8, -7.0], a_interossea_post: [-4.5, -5.3], dx: 0.32, gioco: 0.03, fuori: 0.3, lisci: 6 };
const SUP = { liscia: 0.15, allarga: 0.07 };
const SOLCO = { chiusura: 0.45, fascia: [-0.5, 0.6] };
const ECU_LATERALE = [-0.5, -2.2, 0.15];   // y sopra cui la traslazione è piena, y dove si annulla, gioco dal margine (cm)
const MESH = { passo: 0.12, passoNuovi: 0.1, taubin: 20 };
const FIBRE = { sigma: 0.5, sigmaTag: 0.22, passate: 6 };
const ASSE = (() => { const v = [-0.15, -1, 0.3], l = Math.hypot(...v); return v.map(x => x / l); })();   // asse dell'avambraccio (verso distale)

/* ============ Griglia e mesh di partenza ============ */
const AREA = { lo: [-6.3, -12.4, -3.4], hi: [2.3, 3.4, 3.6] };
G.griglia(AREA.lo, AREA.hi, PASSO, 0);
const { N, NX, NY, NZ, NXY } = G;
log(`griglia ${NX}×${NY}×${NZ} (${(N / 1e6).toFixed(1)} M voxel, passo ${PASSO} cm)`);
const gauss = (F, s) => G.sfoca(F, Math.max(1, Math.round((s / PASSO) ** 2 * 1.5)));
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const yDi = q => G.O[1] + (((q / NX) | 0) % NY + 0.5) * PASSO;
const interp = (T, y) => { if (y >= T[0][0]) return T[0][1]; for (let i = 0; i + 1 < T.length; i++) if (y >= T[i + 1][0]) { const t = (y - T[i][0]) / (T[i + 1][0] - T[i][0]); return T[i][1] + (T[i + 1][1] - T[i][1]) * t; } return T[T.length - 1][1]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
const reff = id => NVP.r[id] * (id.startsWith('v_') ? 1.25 : id.startsWith('n_') ? 1.08 : 1.05);
const base = new Map();
if (!VERIFICA) {
  for (const id of MUSCOLI) { const m = realDaRevisione(BASE, id, FILE_REPO); base.set(id, m); setMesh(id, { pos: Float32Array.from(m.pos), idx: m.idx, tag: m.tag, fdir: m.fdir }); }
  const h = execFileSync('git', ['show', `${BASE}:${FILE_REPO}`], { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'), maxBuffer: 1 << 30 }).toString('utf8');
  const NVP0 = JSON.parse(h.match(/const NVP=(\{.*?\});\n/s)[1]);
  for (const id of TUBI_MOSSI) NVP.pts[id] = NVP0.pts[id];
}

/* ============ Campi ============ */
const OSSA = ['omero', 'ulna', 'radio'];
const STRUTT = ['cart_omero', 'cart_ulna', 'cart_radio', 'caps', 'fat_post', 'ucl_post', 'rcl', 'anulare', 'lucl', 'mio', 'bor_olecr', 'quadrato'];
const VICINI = ['br', 'ecrl', 'tri_med', 'tri_lat', 'tri_lungo', 'fcu', 'fdp', 'fpl', 'setto_lat'];
// solido per sola parità lungo z (come in rifinitura-flessori-gomito.mjs: niente gradini sulle mesh rifatte)
function solidoParita(nome) {
  const { pos, idx } = REAL(nome), M = new Uint8Array(N), H = PASSO, O = G.O, cols = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2], ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - O[0]) / H - 0.5)), i1 = Math.min(NX - 1, Math.floor((Math.max(ax, bx, cx) - O[0]) / H - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - O[1]) / H - 0.5)), j1 = Math.min(NY - 1, Math.floor((Math.max(ay, by, cy) - O[1]) / H - 0.5));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = O[0] + (i + 0.5) * H + 1e-5, y = O[1] + (j + 0.5) * H + 1.3e-5, l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const key = i + NX * j; let L = cols.get(key); if (!L) cols.set(key, L = []); L.push(l1 * pos[a + 2] + l2 * pos[b + 2] + l3 * pos[c + 2]);
    }
  }
  for (const [key, L] of cols) { L.sort((u, v) => u - v); for (let q = 0; q + 1 < L.length; q += 2) { const k0 = Math.max(0, Math.ceil((L[q] - O[2]) / H - 0.5)), k1 = Math.min(NZ - 1, Math.floor((L[q + 1] - O[2]) / H - 0.5)); for (let k = k0; k <= k1; k++) M[key + NXY * k] = 1; } }
  return M;
}
function campoDi(nomi, lamine = false) {   // distanza esatta vicino alla superficie, segno dal solido per parità (lamine: anche i voxel della superficie)
  const M = lamine ? G.unione(nomi) : new Uint8Array(N); if (!lamine) for (const n of nomi) { const S = solidoParita(n); for (let q = 0; q < N; q++) M[q] |= S[q]; }
  const { F } = G.sdf(M); gauss(F, 0.02); G.esatta(F, nomi, 0.12);
  for (let q = 0; q < N; q++) if (Math.abs(F[q]) <= 0.12) F[q] = (M[q] ? -1 : 1) * Math.abs(F[q]);
  return F;
}
function campoTubi({ solo = null, escludi = [] } = {}) {
  const F = new Float32Array(N).fill(1);
  for (const [id, P] of Object.entries(NVP.pts)) {
    if ((solo && !solo.includes(id)) || escludi.includes(id)) continue;
    const r = reff(id);
    for (let s = 0; s + 1 < P.length; s++) {
      const a = P[s], b = P[s + 1], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], L2 = ux * ux + uy * uy + uz * uz || 1e-9, R = r + 0.6;
      const lo = [0, 1, 2].map(k => Math.min(a[k], b[k]) - R), hi = [0, 1, 2].map(k => Math.max(a[k], b[k]) + R);
      const i0 = [0, 1, 2].map(k => Math.max(0, Math.floor((lo[k] - G.O[k]) / PASSO))), i1 = [0, 1, 2].map(k => Math.min([NX, NY, NZ][k] - 1, Math.ceil((hi[k] - G.O[k]) / PASSO)));
      for (let k = i0[2]; k <= i1[2]; k++) for (let j = i0[1]; j <= i1[1]; j++) for (let i = i0[0]; i <= i1[0]; i++) {
        const x = G.O[0] + (i + 0.5) * PASSO, y = G.O[1] + (j + 0.5) * PASSO, z = G.O[2] + (k + 0.5) * PASSO;
        const f = clamp(((x - a[0]) * ux + (y - a[1]) * uy + (z - a[2]) * uz) / L2, 0, 1), d = Math.hypot(x - a[0] - ux * f, y - a[1] - uy * f, z - a[2] - uz * f) - r, q = i + NX * j + NXY * k;
        if (d < F[q]) F[q] = d;
      }
    }
  }
  return F;
}

/* ============ Verifica ============ */
if (VERIFICA) {
  const gruppi = { ossa: OSSA, strutture: STRUTT, vicini: [...VICINI, 'sup'], ...Object.fromEntries(MUSCOLI.map(id => [id, [id]])) };
  const C = Object.fromEntries(Object.entries(gruppi).map(([k, v]) => [k, campoDi(v, k === 'strutture')])); log('campi');
  let tutto = true;
  for (const id of MUSCOLI) {
    const { pos, idx } = REAL(id), nv = pos.length / 3, righe = [];
    for (const [k, F] of Object.entries(C)) { if (k === id) continue; let n = 0, mx = 0;
      for (let i = 0; i < nv; i++) { if (pos[3 * i + 1] < Y_TAGLIO + 0.05) continue; const v = G.sample(F, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); if (v < -0.01) { n++; mx = Math.max(mx, -v); } }
      if (n) righe.push(`${k}: ${n} (${(mx * 10).toFixed(2)} mm)`); }
    for (const [t, P] of Object.entries(NVP.pts)) { let n = 0, mx = 0; const r = NVP.r[t];
      for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; let d = 1e9;
        for (let s = 0; s + 1 < P.length; s++) { const a = P[s], u = sub(P[s + 1], a), f = clamp(dot(sub(p, a), u) / (dot(u, u) || 1e-9), 0, 1); d = Math.min(d, Math.hypot(p[0] - a[0] - u[0] * f, p[1] - a[1] - u[1] * f, p[2] - a[2] - u[2] * f)); }
        if (d < r - 0.003) { n++; mx = Math.max(mx, r - d); } }
      if (n) righe.push(`[${t}]: ${n} (${(mx * 10).toFixed(2)} mm)`); }
    // topologia: bordi aperti, spigoli condivisi da più di due facce (punti di contatto delle surface nets, innocui) e componenti
    const e = new Map(); for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3], key = a < b ? a + ',' + b : b + ',' + a; e.set(key, (e.get(key) || 0) + 1); }
    let aperti = 0, nonman = 0; for (const [, c] of e) { if (c === 1) aperti++; else if (c > 2) nonman++; }
    const par = Int32Array.from({ length: nv }, (_, i) => i), f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    for (let t = 0; t < idx.length; t += 3) { par[f(idx[t])] = f(idx[t + 1]); par[f(idx[t + 1])] = f(idx[t + 2]); }
    const comp = new Set(); for (let i = 0; i < nv; i++) comp.add(f(i));
    if (aperti || comp.size !== 1) tutto = false;
    console.log(`${id} (${nv} vertici, ${comp.size} componenti, ${aperti} bordi aperti, ${nonman} spigoli non-manifold): ${righe.length ? righe.join(', ') : 'nessuna compenetrazione'}`);
  }
  console.log(tutto ? 'Topologia: una sola componente chiusa per ogni muscolo.' : 'ATTENZIONE: componenti multiple o bordi aperti.');
  process.exit(0);
}

const J_CUTE = Math.round((Y_TAGLIO + 0.5 - G.O[1]) / PASSO);
const campi = { osso: campoDi(OSSA) }; log('campo ossa');
campi.struttura = campoDi(STRUTT, true); log('campo strutture');
campi.vicini = campoDi(VICINI);
// supinatore: il margine distale della mesh è frastagliato (denti di ~3 mm); come ostacolo vale il suo campo levigato, allargato di quanto
// la levigatura lo restringe sugli spigoli (le facce degli altri muscoli contro il supinatore restano lisce)
campi.sup = campoDi(['sup']); gauss(campi.sup, SUP.liscia); for (let q = 0; q < N; q++) campi.sup[q] -= SUP.allarga;
log('campi dei muscoli vicini');
campi.cute = campoDi(['cute']); log('campo cute');
campi.tubi = campoTubi({ escludi: TUBI_MOSSI }); log('campo dei tubi');
function ostacoli(tubi) {   // positivo = vietato
  const C = new Float32Array(N);
  for (let q = 0; q < N; q++) { const j = ((q / NX) | 0) % NY;
    C[q] = Math.max(GIOCO.osso - campi.osso[q], GIOCO.struttura - campi.struttura[q], GIOCO.muscolo - campi.vicini[q], GIOCO.muscolo - campi.sup[q], GIOCO.tubo - tubi[q], GIOCO.cute + campi.cute[j < J_CUTE ? q + (J_CUTE - j) * NX : q]); }
  return C;
}
/* ============ Triangolo dell'anconeo (nel piano dei tre punti) ============ */
const { A, B, C } = ANCONEO, n = norm(cross(sub(B, A), sub(C, A))), nOut = n[2] < 0 ? n : n.map(v => -v);
const e1 = norm(sub(B, A)), e2 = norm(cross(nOut, e1)), uv = p => { const d = sub(p, A); return [dot(d, e1), dot(d, e2)]; };
const T2 = [[0, 0], uv(B), uv(C)];
const sdTri = (p) => {   // distanza con segno dal triangolo nel piano (negativa dentro)
  let d = Infinity, s = 1;
  for (let i = 0; i < 3; i++) { const a = T2[i], b = T2[(i + 1) % 3], e = [b[0] - a[0], b[1] - a[1]], w = [p[0] - a[0], p[1] - a[1]], t = clamp((w[0] * e[0] + w[1] * e[1]) / (e[0] * e[0] + e[1] * e[1]), 0, 1);
    d = Math.min(d, Math.hypot(w[0] - e[0] * t, w[1] - e[1] * t)); }
  const c = T2.map((a, i) => { const b = T2[(i + 1) % 3]; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); });
  if ((c[0] >= 0 && c[1] >= 0 && c[2] >= 0) || (c[0] <= 0 && c[1] <= 0 && c[2] <= 0)) s = -1;
  return s * d;
};
// ECU: nella mesh di partenza il tratto prossimale (tendine "a dito") scendeva sopra il territorio dell'anconeo. Le sezioni sopra
// y = ECU_LATERALE[0] sono traslate nel piano del triangolo, perpendicolarmente al margine laterale (apice → ulna), quanto basta a uscirne
// (più `ECU_LATERALE[2]`), con raccordo fino a y = ECU_LATERALE[1]: l'ECU risale lungo il margine laterale dell'anconeo verso l'epicondilo
{
  const [y0, y1, gioco] = ECU_LATERALE, a = T2[0], c = T2[2], ac = [c[0] - a[0], c[1] - a[1]], l = Math.hypot(...ac);
  let n2 = [ac[1] / l, -ac[0] / l]; const b = T2[1]; if ((b[0] - a[0]) * n2[0] + (b[1] - a[1]) * n2[1] > 0) n2 = n2.map(v => -v);   // verso l'esterno
  const n3 = [0, 1, 2].map(k => n2[0] * e1[k] + n2[1] * e2[k]);
  const m = REAL('ecu'), pos = Float32Array.from(m.pos), nv = pos.length / 3, bisogno = new Float64Array(NY);
  for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], w = uv(p), dentro = (w[0] - a[0]) * n2[0] + (w[1] - a[1]) * n2[1];   // < 0: dalla parte dell'anconeo
    if (sdTri(w) < 0.3 && p[1] > y1) { const j = clamp(Math.round((p[1] - G.O[1]) / PASSO - 0.5), 0, NY - 1); bisogno[j] = Math.max(bisogno[j], -dentro + gioco); } }
  for (let p = 0; p < 40; p++) for (let j = 1; j < NY - 1; j++) bisogno[j] = Math.max(bisogno[j], (bisogno[j - 1] + 2 * bisogno[j] + bisogno[j + 1]) / 4);   // inviluppo levigato
  let max = 0;
  for (let i = 0; i < nv; i++) { const y = pos[3 * i + 1], j = clamp(Math.round((y - G.O[1]) / PASSO - 0.5), 0, NY - 1), d = bisogno[j] * sstep(y1, y0, y); max = Math.max(max, d);
    for (let k = 0; k < 3; k++) pos[3 * i + k] += n3[k] * d; }
  base.set('ecu', { ...base.get('ecu'), pos }); setMesh('ecu', base.get('ecu'));   // anche colore e fibre si leggono dalla mesh spostata
  log(`ECU: tratto prossimale spostato lateralmente al più di ${(max * 10).toFixed(1)} mm`);
}
const F = new Map();
for (const id of MUSCOLI) F.set(id, campoDi([id]));
log('campi dei muscoli');
const areaDi = Fm => { const a = new Float64Array(NY); for (let q = 0; q < N; q++) if (Fm[q] < 0) a[((q / NX) | 0) % NY] += PASSO * PASSO; return a; };
const righeArea = () => MUSCOLI.map(id => { const a = areaDi(F.get(id)); return id + ' ' + [1, 0, -2, -4, -6, -8, -10, -11.9].map(y => a[Math.round((y - G.O[1]) / PASSO - 0.5)].toFixed(2)).join('/'); }).join('; ');
log(`area di partenza (cm², y 1/0/−2/−4/−6/−8/−10/−11,9): ${righeArea()}`);
const C0 = ostacoli(campi.tubi);
const nuovo = (id, Fn) => { const Fm = F.get(id); for (let q = 0; q < N; q++) Fm[q] = Math.max(smax(Fn[q], C0[q], 0.05), Y_TAGLIO - yDi(q)); };
// apertura morfologica: toglie ali e punte più sottili di 2r; la distanza dei voxel è a gradini, quindi il campo è poi levigato e
// ritagliato di nuovo dagli ostacoli (altrimenti i margini tagliati dall'apertura escono a dente di sega)
function apri(Fm, r) {
  const M = new Uint8Array(N); for (let q = 0; q < N; q++) M[q] = Fm[q] < 0 ? 1 : 0;
  const prof = G.edt(M, true), E = new Uint8Array(N); for (let q = 0; q < N; q++) E[q] = prof[q] >= r ? 1 : 0;
  const Dd = G.edt(E); for (let q = 0; q < N; q++) if (M[q]) { const v = Dd[q] - r; if (v >= 0) Fm[q] = v + 0.02; }
  gauss(Fm, 0.05); for (let q = 0; q < N; q++) Fm[q] = Math.max(Fm[q], C0[q], Y_TAGLIO - yDi(q));
}

/* ============ (1) Anconeo ============ */
{
  // letto teso: ossa, capsula, legamenti laterali e supinatore, chiusi; la faccia superficiale segue il letto chiuso, quella profonda le strutture
  // reali (ostacoli comuni): niente vuoto sotto il muscolo dove il letto chiuso scavalca la fossetta
  const Mb = G.unione(['omero', 'ulna', 'radio', 'caps', 'anulare', 'lucl', 'rcl', 'sup']), Bed = G.chiuso(G.sdf(Mb).Do, ANCONEO.letto); gauss(Bed, 0.05);
  // cupola liscia: prodotto delle coordinate baricentriche (1 al baricentro, 0 sui lati; niente creste sull'asse mediale del triangolo)
  const den = (T2[1][1] - T2[2][1]) * (T2[0][0] - T2[2][0]) + (T2[2][0] - T2[1][0]) * (T2[0][1] - T2[2][1]);
  const cupola = p => { const l1 = ((T2[1][1] - T2[2][1]) * (p[0] - T2[2][0]) + (T2[2][0] - T2[1][0]) * (p[1] - T2[2][1])) / den, l2 = ((T2[2][1] - T2[0][1]) * (p[0] - T2[2][0]) + (T2[0][0] - T2[2][0]) * (p[1] - T2[2][1])) / den, l3 = 1 - l1 - l2;
    return Math.cbrt(clamp(27 * Math.max(l1, 0) * Math.max(l2, 0) * Math.max(l3, 0), 0, 1)); };
  const Fn = new Float32Array(N).fill(1);
  for (let q = 0; q < N; q++) {
    const p = G.voxel(q), h = dot(sub(p, A), nOut); if (h < -2 || h > 1.5 || Bed[q] > 1 || Bed[q] < -ANCONEO.fondo - 0.3) continue;
    const w = uv(p), t = sdTri(w) - ANCONEO.margine; if (t > 0.5) continue;
    const T = ANCONEO.spessore[0] + (ANCONEO.spessore[1] - ANCONEO.spessore[0]) * cupola(w);
    let f = smax(-ANCONEO.fondo - Bed[q], Bed[q] - T, 0.1); f = smax(f, t, 0.15);
    Fn[q] = f;
  }
  gauss(Fn, 0.04); nuovo('anc', Fn);
  apri(F.get('anc'), 0.1);
}

/* ============ (3) Strato profondo: APL ed EPL ============ */
// sezione di radio e ulna a ogni y (centro nel piano x-z), levigata lungo y
const sezione = nome => {
  const M = G.solid(nome), cx = new Float64Array(NY).fill(NaN), cz = new Float64Array(NY).fill(NaN);
  for (let j = 0; j < NY; j++) { let sx = 0, sz = 0, n = 0; for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (M[i + NX * j + NXY * k]) { sx += G.O[0] + (i + 0.5) * PASSO; sz += G.O[2] + (k + 0.5) * PASSO; n++; } if (n) { cx[j] = sx / n; cz[j] = sz / n; } }
  const lisc = v => { const ok = [...v.keys()].filter(j => v[j] === v[j]); for (let j = 0; j < NY; j++) if (!(v[j] === v[j])) v[j] = v[j < ok[0] ? ok[0] : ok[ok.length - 1]]; for (let p = 0; p < 30; p++) for (let j = 1; j < NY - 1; j++) v[j] = (v[j - 1] + 2 * v[j] + v[j + 1]) / 4; return v; };
  lisc(cx); lisc(cz); return j => [cx[j], cz[j]];
};
const cR = sezione('radio'), cU = sezione('ulna');
const telaio = j => {   // R, versore radio→ulna, distanza, normale posteriore (nel piano x-z)
  const r = cR(j), u = cU(j), L = Math.hypot(u[0] - r[0], u[1] - r[1]) || 1, e = [(u[0] - r[0]) / L, (u[1] - r[1]) / L];
  let n = [e[1], -e[0]]; if (n[1] > 0) n = [-n[0], -n[1]];
  return { r, e, L, n };
};
const Fdeep = new Float32Array(N).fill(1), Sdeep = new Float32Array(N);
{
  const Bed = campoDi(['ulna', 'radio', 'mio'], true), k = PROFONDO.raccordo;
  for (let q = 0; q < N; q++) {
    const [x, y, z] = G.voxel(q); if (y > PROFONDO.cimaUlna + 0.5 || Bed[q] > 1.5) continue;
    const j = ((q / NX) | 0) % NY, { r, e, L, n } = telaio(j), dx = x - r[0], dz = z - r[1], s = (dx * e[0] + dz * e[1]) / L, h = dx * n[0] + dz * n[1];
    Sdeep[q] = s;
    const t = clamp((s - PROFONDO.sLat) / (PROFONDO.sMed - PROFONDO.sLat), 0, 1), T = interp(PROFONDO.spessore, y) * (1 - PROFONDO.fuso + PROFONDO.fuso * Math.sin(Math.PI * t));
    const cima = PROFONDO.cimaRadio + (PROFONDO.cimaUlna - PROFONDO.cimaRadio) * sstep(0.15, 0.7, s);
    let f = smax(Bed[q] - T, -h, k); f = smax(f, (PROFONDO.sLat - s) * L, k); f = smax(f, (s - PROFONDO.sMed) * L, k); f = smax(f, y - cima, k * 2);
    Fdeep[q] = f;
  }
  gauss(Fdeep, 0.05);
  for (let q = 0; q < N; q++) Fdeep[q] = Math.max(smax(Fdeep[q], C0[q], 0.05), GIOCO.muscolo - F.get('anc')[q], Y_TAGLIO - yDi(q));
  apri(Fdeep, PROFONDO.apertura); for (let q = 0; q < N; q++) Fdeep[q] = Math.max(Fdeep[q], GIOCO.muscolo - F.get('anc')[q]);
  // setto APL/EPL: EPL medialmente a s = setto(y), sotto cimaEPL
  const Fa = new Float32Array(N), Fe = new Float32Array(N);
  for (let q = 0; q < N; q++) {
    const y = yDi(q), j = ((q / NX) | 0) % NY, L = telaio(j).L, g = smax((interp(PROFONDO.setto, y) - Sdeep[q]) * L, y - PROFONDO.cimaEPL, PROFONDO.angolo);   // < 0 nell'EPL
    Fa[q] = Math.max(Fdeep[q], -g + GIOCO.setto); Fe[q] = Math.max(Fdeep[q], g + GIOCO.setto);
  }
  F.set('apl', Fa); F.set('epl', Fe);
}
log('strato profondo (APL, EPL)');

/* ============ (4) Nervo interosseo posteriore e arteria interossea posteriore ============ */
{
  // z della faccia posteriore dello strato profondo o del supinatore (da cui il nervo emerge) lungo la verticale (x, y): primo punto dentro
  // risalendo da dietro, fino a zA (davanti alla linea radio-ulna)
  const superficie = (x, y, zA) => {
    for (let z = AREA.lo[2] + 0.1; z < zA; z += PASSO / 3) { const v = Math.min(G.sample(Fdeep, x, y, z), G.sample(campi.sup, x, y, z) + SUP.allarga); if (v < 0) return z; }
    return null;
  };
  const sposta = (id, xDa) => {
    const P = NVP.pts[id].map(p => p.slice()), nuovoZ = P.map(p => p[2]), nuovoX = P.map(p => p[0]);
    const [da, a] = TUBI[id];
    P.forEach((p, i) => {
      const w = sstep(da, a, p[1]); if (w <= 0) return;
      const x = xDa ? xDa(p[1], p[0]) : p[0], j = clamp(Math.round((p[1] - G.O[1]) / PASSO - 0.5), 0, NY - 1), { r, e } = telaio(j);
      let zs = superficie(x, p[1], r[1] + 0.8);
      if (zs === null) zs = r[1] + (x - r[0]) * e[1] / (e[0] || 1e-6) - TUBI.fuori;   // dietro la linea radio-ulna
      nuovoX[i] = p[0] + w * (x - p[0]); nuovoZ[i] = p[2] + w * (zs - reff(id) - TUBI.gioco - p[2]);
    });
    for (let it = 0; it < TUBI.lisci; it++) for (let i = 1; i + 1 < P.length; i++) if (P[i][1] < da) { nuovoZ[i] = (nuovoZ[i - 1] + 2 * nuovoZ[i] + nuovoZ[i + 1]) / 4; nuovoX[i] = (nuovoX[i - 1] + 2 * nuovoX[i] + nuovoX[i + 1]) / 4; }
    let max = 0; P.forEach((p, i) => { max = Math.max(max, Math.hypot(nuovoX[i] - p[0], nuovoZ[i] - p[2])); p[0] = Math.round(nuovoX[i] * 1000) / 1000; p[2] = Math.round(nuovoZ[i] * 1000) / 1000; });
    NVP.pts[id] = P; return max;
  };
  const mPin = sposta('n_pin');
  const xPin = y => { const P = NVP.pts.n_pin; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); } return null; };
  const mPia = sposta('a_interossea_post', (y, x0) => { const xp = xPin(y); return xp === null ? x0 : x0 + (xp + TUBI.dx - x0) * sstep(-4.5, -7.0, y); });
  log(`tubi spostati: nervo interosseo posteriore al più ${(mPin * 10).toFixed(1)} mm, arteria interossea posteriore ${(mPia * 10).toFixed(1)} mm`);
  G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
}
const tubiMossi = campoTubi({ solo: TUBI_MOSSI });
for (const id of MUSCOLI) { const Fm = F.get(id); for (let q = 0; q < N; q++) Fm[q] = Math.max(Fm[q], GIOCO.tubo - tubiMossi[q]); }

/* ============ (2) EDM ============ */
{
  // asse: baricentro del vecchio EDM a ogni y (levigato), estremità prossimale `EDM.cima`
  const m = base.get('edm'), sx = new Float64Array(NY), sn = new Float64Array(NY);
  for (let i = 0; i < m.pos.length / 3; i++) { const j = Math.round((m.pos[3 * i + 1] - G.O[1]) / PASSO - 0.5); if (j >= 0 && j < NY) { sx[j] += m.pos[3 * i]; sn[j]++; } }
  const ok = [...sx.keys()].filter(j => sn[j] > 0), xc = new Float64Array(NY);
  for (let j = 0; j < NY; j++) { const jj = sn[j] ? j : ok.reduce((b, k) => Math.abs(k - j) < Math.abs(b - j) ? k : b, ok[0]); xc[j] = sx[jj] / sn[jj]; }
  for (let p = 0; p < 40; p++) for (let j = 1; j < NY - 1; j++) xc[j] = (xc[j - 1] + 2 * xc[j] + xc[j + 1]) / 4;
  // involucro superficiale: EDC, ECU ed EDM chiusi (colma il solco tra EDC ed ECU), ritagliato dagli ostacoli
  const U = new Uint8Array(N); for (const id of ['edc', 'ecu', 'edm']) { const Fm = F.get(id); for (let q = 0; q < N; q++) if (Fm[q] < 0) U[q] = 1; }
  const Env = G.chiuso(G.sdf(U).Do, EDM.involucro); gauss(Env, 0.08);
  // faccia posteriore dell'involucro: prima z (da dietro) in cui il campo diventa negativo, per colonna (x, y); levigata
  const zP = new Float32Array(NX * NY).fill(NaN);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) for (let k = 0; k + 1 < NZ; k++) { const a = Env[i + NX * j + NXY * k], b = Env[i + NX * j + NXY * (k + 1)]; if (a >= 0 && b < 0) { zP[i + NX * j] = G.O[2] + (k + 0.5 + a / (a - b)) * PASSO; break; } }
  const Fn = new Float32Array(N).fill(1);
  for (let q = 0; q < N; q++) {
    const [x, y, z] = G.voxel(q), c = q % NXY, z0 = zP[c]; if (y > EDM.cima + 0.4 || !(z0 === z0)) continue;
    const j = ((q / NX) | 0) % NY, W = interp(EDM.larghezza, y), D = interp(EDM.spessore, y), dx = x - xc[j], t = clamp(2 * dx / W, -1, 1);
    let f = smax(z0 - z, z - z0 - D * Math.sqrt(1 - t * t * 0.85), 0.06); f = smax(f, Math.abs(dx) - W / 2, 0.08); f = smax(f, y - EDM.cima, 0.2);
    Fn[q] = f;
  }
  gauss(Fn, 0.04); nuovo('edm', Fn);
  { const Fm = F.get('edm'); for (let q = 0; q < N; q++) Fm[q] = Math.max(Fm[q], GIOCO.tubo - tubiMossi[q], GIOCO.muscolo - F.get('apl')[q], GIOCO.muscolo - F.get('epl')[q], GIOCO.muscolo - F.get('anc')[q]); }
}
log('EDM');

/* ============ Gli altri cedono il volume ============ */
// ordine di precedenza: anconeo, APL, EPL, EDM, poi ECU, EDC, ECRB (fra questi tre si dividono a metà dove si toccano); tutti scansano gli ostacoli comuni
for (const id of CEDONO) {
  const Fm = F.get(id);
  for (let q = 0; q < N; q++) {
    let c = GIOCO.osso - campi.osso[q]; for (const n of NUOVI) c = Math.max(c, GIOCO.muscolo - F.get(n)[q]);
    c = Math.max(c, GIOCO.tubo - tubiMossi[q], C0[q]);   // C0: ossa, strutture, muscoli vicini, supinatore, tubi, cute
    if (c > Fm[q] - 0.1) Fm[q] = smax(Fm[q], c, 0.1);
  }
}
{
  const copie = new Map(CEDONO.map(id => [id, Float32Array.from(F.get(id))]));
  for (const id of CEDONO) { const Fm = F.get(id); for (const j of CEDONO) if (j !== id) { const Fj = copie.get(j); for (let q = 0; q < N; q++) { const c = (Fm[q] - Fj[q] + GIOCO.setto * 2) / 2; if (c > Fm[q]) Fm[q] = c; } } }
}
/* ============ Solco tra anconeo ed ECU ============ */
// tra il margine laterale dell'anconeo e l'ECU restava un solco profondo fino al supinatore (fessura scura nella vista posteriore): l'unione di
// anconeo, ECU, ossa e supinatore è chiusa (`SOLCO.chiusura`) e lo spazio vuoto aggiunto dalla chiusura in una fascia attorno al margine
// laterale (da `SOLCO.fascia[0]` cm dentro a `SOLCO.fascia[1]` cm fuori dalla retta apice → angolo ulnare) va all'anconeo fino al margine del
// triangolo (`ANCONEO.margine`) e all'ECU oltre: i due muscoli si toccano e l'anconeo resta triangolare
{
  const Fa = F.get('anc'), Fu = F.get('ecu'), M = new Uint8Array(N);
  for (let q = 0; q < N; q++) if (Fa[q] < 0 || Fu[q] < 0 || campi.osso[q] < 0 || campi.sup[q] < 0) M[q] = 1;
  const Cl = G.chiuso(G.sdf(M).Do, SOLCO.chiusura); gauss(Cl, 0.05);
  const altri = ['edm', 'apl', 'epl', 'edc', 'ecrb'].map(id => F.get(id)), Fa0 = Float32Array.from(Fa), Fu0 = Float32Array.from(Fu);
  const a = T2[0], c = T2[2], ac = [c[0] - a[0], c[1] - a[1]], l = Math.hypot(...ac); let n2 = [ac[1] / l, -ac[0] / l];
  if ((T2[1][0] - a[0]) * n2[0] + (T2[1][1] - a[1]) * n2[1] > 0) n2 = n2.map(v => -v);   // verso l'esterno (lato dell'ECU)
  const [dentro, fuori] = SOLCO.fascia, mezzo = (fuori - dentro) / 2, centro = (fuori + dentro) / 2;
  let n = 0;
  for (let q = 0; q < N; q++) {
    if (Cl[q] > 0.2) continue; const p = G.voxel(q); if (p[1] > A[1] + 0.3 || p[1] < C[1] - 0.3) continue;
    const w = uv(p), d = (w[0] - a[0]) * n2[0] + (w[1] - a[1]) * n2[1], lungo = ((w[0] - a[0]) * ac[0] + (w[1] - a[1]) * ac[1]) / l;
    if (Math.abs(d - centro) > mezzo + 0.3) continue;
    let v = smax(Cl[q], Math.abs(d - centro) - mezzo, 0.1); v = smax(v, Math.max(-lungo, lungo - l), 0.2); v = Math.max(v, C0[q]);
    for (const Fo of altri) v = Math.max(v, GIOCO.muscolo - Fo[q]);
    const lato = (d - ANCONEO.margine) * 1;   // < 0: anconeo, > 0: ECU
    const va = Math.max(v, lato + GIOCO.setto, GIOCO.muscolo - Fu0[q]), vu = Math.max(v, -lato + GIOCO.setto, GIOCO.muscolo - Fa0[q]);
    if (va < Fa[q]) { if (Fa[q] >= 0 && va < 0) n++; Fa[q] = va; }
    if (vu < Fu[q]) { if (Fu[q] >= 0 && vu < 0) n++; Fu[q] = vu; }
  }
  log(`solco tra anconeo ed ECU: ${(n * PASSO ** 3).toFixed(2)} cm³ colmati`);
}
for (const id of MUSCOLI) { const Fm = F.get(id); for (let q = 0; q < N; q++) Fm[q] = Math.max(Fm[q], Y_TAGLIO - yDi(q)); }
log(`area finale (cm², y 1/0/−2/−4/−6/−8/−10/−11,9): ${righeArea()}`);

/* ============ Pulizia: una componente, nessuna cavità ============ */
function componenti(M, valore) {
  const lab = new Int32Array(N).fill(-1), dim = [], st = new Int32Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (M[s0] !== valore || lab[s0] >= 0) continue;
    let sp = 0, n = 0, tocca = false; const l = dim.length; st[sp++] = s0; lab[s0] = l;
    while (sp) { const q = st[--sp]; n++; const i = q % NX, j = ((q / NX) | 0) % NY, k = (q / NXY) | 0;
      if (i === 0 || j === 0 || k === 0 || i === NX - 1 || j === NY - 1 || k === NZ - 1) tocca = true;
      for (const [d, ok] of [[1, i < NX - 1], [-1, i > 0], [NX, j < NY - 1], [-NX, j > 0], [NXY, k < NZ - 1], [-NXY, k > 0]]) { if (!ok) continue; const r = q + d; if (M[r] === valore && lab[r] < 0) { lab[r] = l; st[sp++] = r; } } }
    dim.push({ n, tocca });
  }
  return { lab, dim };
}
function pulisci(Fm) {
  const M = new Uint8Array(N); for (let q = 0; q < N; q++) M[q] = Fm[q] < 0 ? 1 : 0;
  const A = componenti(M, 1); let big = 0; A.dim.forEach((d, i) => { if (d.n > A.dim[big].n) big = i; });
  const B = componenti(M, 0); let isole = 0, cavita = 0;
  for (let q = 0; q < N; q++) { if (M[q] && A.lab[q] !== big) { Fm[q] = 0.01; isole++; } else if (!M[q] && !B.dim[B.lab[q]].tocca) { Fm[q] = -0.01; cavita++; } }
  return { isole, cavita };
}

/* ============ Mesh, colore e fibre ============ */
function adiacenza(idx, nv) { const nb = Array.from({ length: nv }, () => new Set()); for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); } return nb.map(s => Int32Array.from(s)); }
function costruisci(id, Fm) {
  const m = base.get(id), nv0 = m.pos.length / 3, cella = 0.25, hash = new Map(), ch = (x, y, z) => `${Math.floor(x / cella)},${Math.floor(y / cella)},${Math.floor(z / cella)}`;
  for (let i = 0; i < nv0; i++) { const c = ch(m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]); if (!hash.has(c)) hash.set(c, []); hash.get(c).push(i); }
  const RC = Math.ceil(3 * FIBRE.sigma / cella);
  const candidati = p => { const [cx, cy, cz] = p.map(v => Math.floor(v / cella)), Lc = [];
    for (let a = -RC; a <= RC; a++) for (let b = -RC; b <= RC; b++) for (let c = -RC; c <= RC; c++) for (const i of hash.get(`${cx + a},${cy + b},${cz + c}`) || []) Lc.push([i, (m.pos[3 * i] - p[0]) ** 2 + (m.pos[3 * i + 1] - p[1]) ** 2 + (m.pos[3 * i + 2] - p[2]) ** 2]);
    return Lc.sort((u, v) => u[1] - v[1]); };
  const fine = { O: [...G.O], H: PASSO };
  const campFine = (x, y, z) => {
    let fx = (x - fine.O[0]) / fine.H - 0.5, fy = (y - fine.O[1]) / fine.H - 0.5, fz = (z - fine.O[2]) / fine.H - 0.5;
    fx = clamp(fx, 0, NX - 1.001); fy = clamp(fy, 0, NY - 1.001); fz = clamp(fz, 0, NZ - 1.001);
    const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k, b = i + NX * j + NXY * k, l = (a, c, t) => a + (c - a) * t;
    return l(l(l(Fm[b], Fm[b + 1], u), l(Fm[b + NX], Fm[b + NX + 1], u), v), l(l(Fm[b + NXY], Fm[b + NXY + 1], u), l(Fm[b + NXY + NX], Fm[b + NXY + NX + 1], u), v), w);
  };
  const passoMesh = NUOVI.includes(id) ? MESH.passoNuovi : MESH.passo;
  const nc = [0, 1, 2].map(k => Math.ceil((AREA.hi[k] - AREA.lo[k]) / passoMesh));
  G.setGriglia(AREA.lo, passoMesh, nc[0], nc[1], nc[2]);
  const out = G.nets(G.valuta(p => campFine(p[0], p[1], p[2])), () => [0, 1, 0]);
  G.setGriglia(fine.O, PASSO, NX, NY, NZ);
  const n2 = out.pos.length / 3, pos = G.taubin(out.pos, out.idx, MESH.taubin), e = PASSO * 0.75;
  const gradF = p => [campFine(p[0] + e, p[1], p[2]) - campFine(p[0] - e, p[1], p[2]), campFine(p[0], p[1] + e, p[2]) - campFine(p[0], p[1] - e, p[2]), campFine(p[0], p[1], p[2] + e) - campFine(p[0], p[1], p[2] - e)].map(v => v / (2 * e));
  for (let i = 0; i < n2; i++) {   // Newton verso F = 0
    let p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    for (let it = 0; it < 5; it++) { const v = campFine(...p), g = gradF(p), g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] || 1, st = clamp(v / g2, -0.1, 0.1); p = [p[0] - g[0] * st, p[1] - g[1] * st, p[2] - g[2] * st]; if (Math.abs(v) < 2e-4) break; }
    pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
  }
  for (let i = 0; i < n2; i++) if (pos[3 * i + 1] < Y_TAGLIO + 0.05) pos[3 * i + 1] = Y_TAGLIO;
  const tagF = new Float32Array(n2), fd = new Float32Array(3 * n2), sezione = new Uint8Array(n2);
  const tangente = (p, d) => { const g = gradF(p), gl = Math.hypot(...g) || 1, n = g.map(v => v / gl), dn = dot(d, n); return norm(d.map((v, k) => v - dn * n[k])); };
  for (let i = 0; i < n2; i++) {
    const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    if (p[1] <= Y_TAGLIO + 1e-4) sezione[i] = 250;
    if (id === 'anc') {   // ventaglio dall'apice, tendine d'origine corto
      tagF[i] = 200 * (1 - sstep(ANCONEO.tendine[0], ANCONEO.tendine[1], Math.hypot(...sub(p, ANCONEO.A))));
      fd.set(tangente(p, sub(p, ANCONEO.A)), 3 * i); continue;
    }
    if (id === 'apl' || id === 'epl') { tagF[i] = 0; fd.set(tangente(p, ASSE), 3 * i); continue; }   // ventri carnosi, fibre lungo l'avambraccio
    const Lc = candidati(p); if (!Lc.length) { fd.set(tangente(p, ASSE), 3 * i); continue; }
    let st = 0, swt = 0, ref = null; const f = [0, 0, 0];
    for (const [j, d2] of Lc) {
      const wt = Math.exp(-d2 / (2 * FIBRE.sigmaTag ** 2)); if (m.tag[j] < 250) { st += wt * m.tag[j]; swt += wt; }
      const w = Math.exp(-d2 / (2 * FIBRE.sigma ** 2)), v = [m.fdir[3 * j], m.fdir[3 * j + 1], m.fdir[3 * j + 2]]; if (!ref) ref = v;
      const sg = dot(v, ref) < 0 ? -1 : 1; for (let k = 0; k < 3; k++) f[k] += sg * v[k] * w;
    }
    tagF[i] = swt > 1e-9 ? st / swt : (m.tag[Lc[0][0]] < 250 ? m.tag[Lc[0][0]] : 0);
    fd.set(tangente(p, norm(f)), 3 * i);
  }
  const nb = adiacenza(out.idx, n2);
  for (let p = 0; p < FIBRE.passate; p++) { const Nn = new Float32Array(3 * n2);
    for (let i = 0; i < n2; i++) { let x = fd[3 * i], y = fd[3 * i + 1], z = fd[3 * i + 2];
      for (const j of nb[i]) { const sg = fd[3 * i] * fd[3 * j] + fd[3 * i + 1] * fd[3 * j + 1] + fd[3 * i + 2] * fd[3 * j + 2] < 0 ? -1 : 1; x += sg * fd[3 * j]; y += sg * fd[3 * j + 1]; z += sg * fd[3 * j + 2]; }
      const l = Math.hypot(x, y, z) || 1; Nn[3 * i] = x / l; Nn[3 * i + 1] = y / l; Nn[3 * i + 2] = z / l; }
    fd.set(Nn); }
  for (let p = 0; p < 6; p++) { const T = Float32Array.from(tagF); for (let i = 0; i < n2; i++) { let s = tagF[i] * 2, c = 2; for (const j of nb[i]) { s += tagF[j]; c++; } T[i] = s / c; } tagF.set(T); }
  const tag = new Uint8Array(n2), fdir = new Int8Array(3 * n2);
  for (let i = 0; i < n2; i++) { tag[i] = sezione[i] || Math.round(clamp(tagF[i], 0, 200)); for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(clamp(fd[3 * i + k], -1, 1) * 127); }
  return { pos, idx: out.idx, tag, fdir };
}
for (const id of MUSCOLI) {
  const pul = pulisci(F.get(id)), r = costruisci(id, F.get(id)); setMesh(id, r);
  log(`${id}: ${r.pos.length / 3} vertici (${pul.isole} voxel isolati rimossi, ${pul.cavita} cavità riempite)`);
}

/* ============ Pagina: note ============ */
{
  const NOTE = {
    anc: 'Dalla faccia posteriore dell’epicondilo laterale con un breve tendine; si apre a ventaglio fino alla faccia laterale dell’olecrano e al quarto prossimale della faccia posteriore dell’ulna, coprendo la capsula postero-laterale e il legamento anulare. Stabilizzatore dinamico postero-laterale. Da non confondere con l’anconeo epitrocleare, muscolo accessorio mediale che può comprimere il nervo ulnare nel tunnel cubitale.',
    edm: 'Origina dal tendine comune degli estensori; ventre sottile e fusato dello strato superficiale, tra EDC (lateralmente) ed ECU (medialmente), spesso unito all’EDC. Innervato dal nervo interosseo posteriore; il tendine passa nel quinto compartimento dorsale del polso.',
    apl: 'Dalla parte laterale della faccia posteriore dell’ulna sotto l’inserzione dell’anconeo, dalla membrana interossea e dal terzo medio della faccia posteriore del radio, subito sotto il supinatore; strato profondo, coperto da EDC ed EDM, con il nervo interosseo posteriore sulla sua superficie. Più in basso emerge tra ECRB ed EDC e con l’estensore breve del pollice forma il primo compartimento dorsale (tenosinovite di de Quervain). Nella finestra del modello è presente solo la parte prossimale.',
    epl: 'Dal terzo medio della faccia posteriore dell’ulna (parte laterale), sotto l’origine dell’APL, e dalla membrana interossea; strato profondo, medialmente all’APL. Il tendine passa nel terzo compartimento e cambia direzione attorno al tubercolo di Lister (sede tipica di rottura dopo frattura del radio distale). Nella finestra solo il ventre prossimale.',
  };
  for (const [id, t] of Object.entries(NOTE)) {
    const re = new RegExp(`(\\{id:'${id}',cat:'est',name:"[^"]*",info:")[^"]*(")`);
    if (!re.test(G.M.html)) throw new Error('nota non trovata: ' + id);
    G.M.html = G.M.html.replace(re, (_, a, b) => a + t + b);
  }
}
saveFile(repack());
