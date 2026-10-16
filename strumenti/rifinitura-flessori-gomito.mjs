/* Rifinitura dei flessori-pronatori del gomito (modelli/gomito-3d.html): flessore lungo del pollice (FPL) e origine tendinea comune sull'epicondilo mediale.

   Uso (dalla cartella del progetto):
     node strumenti/rifinitura-flessori-gomito.mjs              → riscrive fpl, fdp, fds, pt, fcr, pl, fcu e lacerto nel file del modello
     MODELLO=/tmp/copia.html node strumenti/rifinitura-flessori-gomito.mjs   → lavora su una copia
     PASSO=0.07 …                                              → passo della griglia in cm (default 0,06)
   Verifica: node strumenti/flessori-pronatori-gomito.mjs verifica

   Riparte sempre dalle mesh della revisione `BASE` (idempotente). Va lanciato dopo `flessori-pronatori-gomito.mjs` e `vene-gomito.mjs`
   (non sposta nervi e vasi: li tratta come ostacoli). Se si rilancia `flessori-pronatori-gomito.mjs`, aggiornare `BASE` e rilanciare questo.

   (1) FPL. Nella revisione di partenza il FPL nasceva a y = −7,5 cm (4,5 cm sotto la tuberosità radiale, y ≈ −2,9) ed era una striscia di
       0,25–0,5 cm² sull'angolo anterolaterale del radio, mentre il FDP occupava anche la faccia anteriore del radio. In anatomia il FPL nasce dalla
       faccia anteriore del radio, dal di sotto della tuberosità e della linea obliqua fino al pronatore quadrato, e dalla membrana interossea
       adiacente; il nervo interosseo anteriore scende sulla membrana tra FPL (lateralmente) e FDP (medialmente) (Standring, Gray's Anatomy 42ª ed.).
       Il ventre è ricostruito come lamina carnosa sulla faccia anteriore del radio (`FPL`): spessore crescente in senso distale, limite mediale al
       nervo interosseo anteriore, limite laterale al margine anterolaterale del radio (più mediale vicino all'origine, sotto la linea obliqua),
       estremità prossimale arrotondata appena sotto la tuberosità. FDP e FDS cedono il volume occupato.
   (2) Origine tendinea comune. Le estremità tendinee di pronatore rotondo, FCR, palmare lungo, FDS e FCU erano cinque pezzi separati da fessure,
       con superficie irregolare e ali sopra e dietro l'epicondilo. Nella zona dell'origine (`ZONA`) l'unione dei cinque muscoli è chiusa
       (`INVOLUCRO.chiusura`: le fessure si colmano), levigata e aperta (niente ali): ne risulta un tendine congiunto liscio che converge sulla faccia
       antero-inferiore dell'epicondilo. È poi diviso tra i muscoli con setti lisci (etichette levigate, `SETTI`) e un gioco minimo: ogni muscolo
       resta una struttura a sé, ma l'insieme appare come un unico tendine (Otoshi K et al., Surg Radiol Anat 2014;36:289–294: FDS e FCU nascono in
       gran parte dai setti intermuscolari che con il tendine comune formano un complesso unico). Colore da tendine entro ~0,5–1,6 cm dall'omero
       (`TENDINE`), fibre orientate verso l'epicondilo. Fuori dalla zona la forma resta quella di partenza (raccordo graduale).
   (3) Lacerto fibroso: sollevato sull'involucro dei flessori dove il nuovo tendine lo attraversa (come in flessori-pronatori-gomito.mjs). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { appoggio, campoCft, CFT } = await import('./tendine-comune-gomito.mjs');
const { setMesh, clamp, sstep, log, repack, saveFile, realDaRevisione, REAL } = G;

const BASE = '0741a5f';                     // revisione con le mesh di partenza (prima di questo strumento)
const FILE_REPO = 'modelli/gomito-3d.html';
const MUSCOLI = ['fpl', 'fdp', 'fds', 'pt', 'fcr', 'pl', 'fcu'];
const ORIGINE = ['pt', 'fcr', 'pl', 'fds', 'fcu'];
const PASSO = Number(process.env.PASSO || 0.06);
const GIOCO = { osso: 0.045, struttura: 0.02, muscolo: 0.025, tubo: 0.045, cute: 0.2, setto: 0.02 };   // cm
const Y_TAGLIO = -12;
// FPL: estremità prossimale (y), tratto in cui si allarga, spessore dalla superficie del radio [y, cm], margini (cm) dal bordo laterale e oltre il
// bordo mediale del radio, piano posteriore (sotto il centro del radio non va: dietro c'è la membrana)
const FPL = { cima: -3.6, rampa: 2.4, spessore: [[-3.6, 0.35], [-5, 0.48], [-8, 0.85], [-12, 1.0]], lat: 0.12, latCima: 0.55, med: 0.35, dietro: 0.05, raccordo: 0.25, pt: -7.0, ptLato: 0.45, compensa: 0.25, fuso: 0.5 };
// zona dell'origine: peso 1 entro r0 dal centro E, 0 oltre r1; sopra y = sopra[0…1] (cresta sopracondiloidea, capo omerale del pronatore) resta la forma di partenza
const ZONA = { E: [2.75, 0.9, 0.5], r0: 1.8, r1: 2.8, sopra: [2.9, 3.4] };
// involucro: la cupola tendinea (forma di tendine-comune-gomito.mjs, spessore `cupola`) unita ai muscoli, chiusa, levigata e aperta; dietro
// l'epicondilo (punto d'appoggio sull'omero con z < `dietro`, sopra y = `dietroDa`) non va: lì c'è il solco del nervo ulnare
const INVOLUCRO = { cupola: [0.42, 0.26], chiusura: 0.45, liscia: 0.2, apertura: 0.18, dopoApertura: 0.08, vicino: 0.4, dietro: -0.45, dietroDa: 0.4, dietroLiscia: 0.12 };
// capo omerale del FCU: il ventre finiva ~5 mm sotto e dietro l'apice dell'epicondilo; un fuso [da, a, raggio] lo porta all'apice (versante
// postero-inferiore), superficiale al legamento di Osborne e al nervo ulnare, che restano ostacoli
const CAPO_OMERALE_FCU = [[2.7, 0.45, -0.55], [3.12, 1.2, -0.15], 0.27];
// setti: ogni voxel dell'involucro va al muscolo che si incontra proseguendo dalla sua posizione in direzione opposta all'apice (`TENDINE.verso`),
// a passi `passi` (cm): i setti convergono sull'epicondilo; etichette levigate (sigma) e convertite in distanza (scala)
const SETTI = { sigma: 0.22, raccordo: 0.12, finale: 0.05, taglio: 0.1, scala: 0.3, passi: [0, 0.25, 0.5, 0.8, 1.1, 1.5, 2.0] };
const TENDINE = { fcr: [0.3, 1.0], pl: [0.3, 1.0], fds: [0.3, 0.95], fcu: [0.3, 0.95], pt: [0.25, 0.85], verso: [3.0, 1.1, 0.25] };   // distanza dall'omero (cm) a cui il colore va da tendine a muscolo; punto d'origine delle fibre
const CAPO_PT = { arteria: [1.2, 3.4, 1.0], chiusura: 0.5, piega: 0.35, apertura: 0.15, vicino: 1.0, da: 0.4 };   // tratto [y da, y a, raggio] in cui vale il piano dell'arteria; raggi di chiusura (con l'omero, del solo pronatore) e apertura, distanza massima da omero e pronatore, y minima (cm)
const MESH = { passo: 0.15, passoOrigine: 0.1, taubin: 20 };
const FIBRE = { sigma: 0.5, sigmaTag: 0.22, passate: 6 };
const SUPERFICIALI = ['v_cefalica', 'v_basilica', 'v_mediana_cub', 'v_mediana_avambraccio', 'n_cut_med_avambraccio', 'n_cut_med_braccio', 'n_cut_post_avambraccio', 'n_cut_lat'];

/* ============ Griglia e mesh di partenza ============ */
const AREA = { lo: [-5.3, -12.4, -3.3], hi: [3.9, 3.3, 6.1] };
G.griglia(AREA.lo, AREA.hi, PASSO, 0);
const { N, NX, NY, NZ, NXY } = G;
log(`griglia ${NX}×${NY}×${NZ} (${(N / 1e6).toFixed(1)} M voxel, passo ${PASSO} cm)`);
const gauss = (F, s) => G.sfoca(F, Math.max(1, Math.round((s / PASSO) ** 2 * 1.5)));
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const yDi = q => G.O[1] + (((q / NX) | 0) % NY + 0.5) * PASSO;
const base = new Map();
for (const id of [...MUSCOLI, 'lacerto']) { const m = realDaRevisione(BASE, id, FILE_REPO); base.set(id, m); setMesh(id, { pos: Float32Array.from(m.pos), idx: m.idx, tag: m.tag, fdir: m.fdir }); }

/* ============ Campi ============ */
const OSSA = ['omero', 'ulna', 'radio'];
const STRUTT = ['cart_omero', 'cart_ulna', 'cart_radio', 'caps', 'fat_ant', 'fat_post', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'anulare', 'lucl', 'quadrato', 'mio', 'osborne', 'bor_bicrad', 'bor_olecr'];
const VICINI = ['brach', 'bic', 'br', 'sup', 'ecrl', 'ecrb', 'edc', 'ecu', 'anc', 'tri_med', 'tri_lungo', 'setto_med'];
// solido per sola parità lungo z (centri dei voxel): `G.solid` aggiunge anche i voxel attraversati dalla superficie, e il segno del campo
// risulterebbe spostato fino a mezzo voxel verso l'esterno, a gradini (increspature sulle mesh rifatte)
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
const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
const reff = id => NVP.r[id] * (id.startsWith('v_') ? 1.25 : id.startsWith('n_') ? 1.08 : 1.05);
function campoTubi(escludi = []) {
  const F = new Float32Array(N).fill(1);
  for (const [id, P] of Object.entries(NVP.pts)) {
    if (escludi.includes(id)) continue;
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
const J_CUTE = Math.round((Y_TAGLIO + 0.5 - G.O[1]) / PASSO);
const campi = { osso: campoDi(OSSA) }; log('campo ossa');
campi.radio = campoDi(['radio']); campi.omero = campoDi(['omero']); log('campi radio e omero');
campi.struttura = campoDi(STRUTT, true); log('campo strutture');
campi.vicini = campoDi(VICINI); log('campo muscoli vicini');
campi.cute = campoDi(['cute']); log('campo cute');
campi.tubi = campoTubi(); campi.tubiProfondi = campoTubi(SUPERFICIALI); log('campi dei tubi');
// ostacoli comuni (positivo = vietato): ossa, strutture, muscoli vicini, tubi, cute (sotto y = −11,5 letta a −11,5: la cute ha un tappo sul piano di taglio)
function ostacoli(tubi) {
  const C = new Float32Array(N);
  for (let q = 0; q < N; q++) { const j = ((q / NX) | 0) % NY;
    C[q] = Math.max(GIOCO.osso - campi.osso[q], GIOCO.struttura - campi.struttura[q], GIOCO.muscolo - campi.vicini[q], GIOCO.tubo - tubi[q], GIOCO.cute + campi.cute[j < J_CUTE ? q + (J_CUTE - j) * NX : q]); }
  return C;
}
const F = new Map();
for (const id of MUSCOLI) { F.set(id, campoDi([id])); }
log('campi dei muscoli');
const areaDi = Fm => { const a = new Float64Array(NY); for (let q = 0; q < N; q++) if (Fm[q] < 0) a[((q / NX) | 0) % NY] += PASSO * PASSO; return a; };
const A0 = new Map(MUSCOLI.map(id => [id, areaDi(F.get(id))]));
const righeArea = () => MUSCOLI.map(id => { const a = areaDi(F.get(id)); return id + ' ' + [1, 0, -2, -4, -6, -8, -10, -11.9].map(y => { const j = Math.round((y - G.O[1]) / PASSO - 0.5); return (a[j] / 1).toFixed(2); }).join('/'); }).join('; ');
log(`area di partenza (cm², y 1/0/−2/−4/−6/−8/−10/−11,9): ${righeArea()}`);

/* ============ (1) Flessore lungo del pollice ============ */
// sezione del radio a ogni y (bordo laterale, bordo mediale, centro z), levigata lungo y
const sezRadio = (() => {
  const M = G.solid('radio'), xl = new Float64Array(NY).fill(NaN), xm = new Float64Array(NY).fill(NaN), zc = new Float64Array(NY).fill(NaN);
  for (let j = 0; j < NY; j++) { let a = 1e9, b = -1e9, s = 0, n = 0; for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (M[i + NX * j + NXY * k]) { const x = G.O[0] + (i + 0.5) * PASSO; a = Math.min(a, x); b = Math.max(b, x); s += G.O[2] + (k + 0.5) * PASSO; n++; } if (n) { xl[j] = a; xm[j] = b; zc[j] = s / n; } }
  const lisc = v => { const ok = [...v.keys()].filter(j => v[j] === v[j]); for (let j = 0; j < NY; j++) if (!(v[j] === v[j])) v[j] = v[j < ok[0] ? ok[0] : ok[ok.length - 1]]; for (let p = 0; p < 20; p++) for (let j = 1; j < NY - 1; j++) v[j] = (v[j - 1] + 2 * v[j] + v[j + 1]) / 4; return v; };
  lisc(xl); lisc(xm); lisc(zc);
  return y => { const j = clamp(Math.round((y - G.O[1]) / PASSO - 0.5), 0, NY - 1); return [xl[j], xm[j], zc[j]]; };
})();
// posizione (x) del nervo interosseo anteriore a ogni y: limite mediale del FPL
const xAIN = y => { const P = NVP.pts.n_interosseo_ant; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); } return Infinity; };
const interp = (T, y) => { if (y >= T[0][0]) return T[0][1]; for (let i = 0; i + 1 < T.length; i++) if (y >= T[i + 1][0]) { const t = (y - T[i][0]) / (T[i + 1][0] - T[i][0]); return T[i][1] + (T[i + 1][1] - T[i][1]) * t; } return T[T.length - 1][1]; };
{
  const Ff = F.get('fpl'), C = ostacoli(campi.tubiProfondi), Fpt = F.get('pt'), k = FPL.raccordo, rAIN = reff('n_interosseo_ant');
  // il tendine d'inserzione del pronatore (angolo anterolaterale del radio, sotto y = `FPL.pt`) resta com'è; più in alto il ventre del pronatore è
  // superficiale al FPL e cede il volume a contatto con il radio
  // solo sulla parte laterale della faccia anteriore (frazione `ptLato` della larghezza del radio): medialmente il FPL prosegue senza interruzioni
  for (let q = 0; q < N; q++) { const [x, y] = G.voxel(q); if (y >= FPL.pt) continue; const [xl, xm] = sezRadio(y); if (x < xl + (xm - xl) * FPL.ptLato) C[q] = Math.max(C[q], GIOCO.muscolo - Fpt[q]); }
  const Fn = new Float32Array(N).fill(1);
  for (let q = 0; q < N; q++) {
    const [x, y, z] = G.voxel(q); if (y > FPL.cima + 0.4 || campi.radio[q] > 1.6) continue;
    const [xl, xm, zc] = sezRadio(y), w = sstep(FPL.cima, FPL.cima - FPL.rampa, y), T = interp(FPL.spessore, y) * (0.45 + 0.55 * w);
    // all'altezza dell'inserzione del pronatore il margine laterale passa medialmente al suo tendine (frazione `ptLato` della larghezza, raccordi lunghi lungo y)
    const wPT = sstep(FPL.pt + 1.0, FPL.pt - 0.4, y) * (1 - sstep(-8.9, -10.3, y)), lat0 = xl + FPL.lat + (xm - xl) * FPL.latCima * (1 - w);
    const lat = lat0 + wPT * Math.max(0, xl + (xm - xl) * FPL.ptLato - lat0), med = Math.min(xm + FPL.med, xAIN(y) - rAIN - GIOCO.tubo);
    // sezione fusata: spessore pieno al centro, ridotto di `fuso` ai margini laterale e mediale
    const t = clamp((x - lat) / Math.max(med - lat, 0.1), 0, 1), Tf = T * (1 + FPL.compensa * wPT) * (1 - FPL.fuso + FPL.fuso * Math.sin(Math.PI * t));   // più spesso dove è più stretto
    let f = smax(campi.radio[q] - Tf, lat - x, k); f = smax(f, x - med, k); f = smax(f, zc - FPL.dietro - z, k); f = smax(f, y - FPL.cima, k * 2);
    Fn[q] = f;
  }
  gauss(Fn, 0.05);
  let n = 0; for (let q = 0; q < N; q++) { const v = Math.max(smax(Fn[q], C[q], 0.05), Y_TAGLIO - yDi(q)); if (v < Ff[q]) { if (Ff[q] >= 0 && v < 0) n++; Ff[q] = v; } }
  log(`FPL: ${n} voxel aggiunti`);
  // FDP, FDS e pronatore cedono il volume del FPL (margini arrotondati)
  for (const id of ['fdp', 'fds', 'pt']) { const Fm = F.get(id); for (let q = 0; q < N; q++) { const c = GIOCO.muscolo - Ff[q]; if (c > Fm[q] - 0.1) Fm[q] = smax(Fm[q], c, 0.1); } }
}

/* ============ (2) Origine tendinea comune: tendine congiunto ============ */
const pesoZona = (x, y, z) => (1 - sstep(ZONA.r0, ZONA.r1, Math.hypot(x - ZONA.E[0], y - ZONA.E[1], z - ZONA.E[2]))) * (1 - sstep(ZONA.sopra[0], ZONA.sopra[1], y));
function apri(Fm, r) {   // apertura morfologica: toglie ali e punte più sottili di 2r
  const M = new Uint8Array(N); for (let q = 0; q < N; q++) M[q] = Fm[q] < 0 ? 1 : 0;
  const prof = G.edt(M, true), E = new Uint8Array(N); for (let q = 0; q < N; q++) E[q] = prof[q] >= r ? 1 : 0;
  const Dd = G.edt(E); let tolti = 0;
  for (let q = 0; q < N; q++) if (M[q]) { const v = Dd[q] - r; if (v >= 0) { Fm[q] = v + 0.02; tolti++; } }
  return tolti;
}
const WZ = new Float32Array(N); for (let q = 0; q < N; q++) WZ[q] = pesoZona(...G.voxel(q));
{
  // involucro: unione chiusa, levigata, aperta, poi ritagliata dagli ostacoli (con tutti i tubi: non si spostano)
  { const [a, b, r] = CAPO_OMERALE_FCU, Fc = F.get('fcu'), u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = u[0] ** 2 + u[1] ** 2 + u[2] ** 2;
    for (let q = 0; q < N; q++) { if (WZ[q] <= 0) continue; const p = G.voxel(q), f = clamp(((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1] + (p[2] - a[2]) * u[2]) / L2, 0, 1);
      const d = Math.hypot(p[0] - a[0] - u[0] * f, p[1] - a[1] - u[1] * f, p[2] - a[2] - u[2] * f) - r; if (d < Fc[q]) Fc[q] = d; } }
  CFT.spessore = INVOLUCRO.cupola;
  const Tc = campoCft(appoggio(), { cute: campi.cute, giocoCute: GIOCO.cute }); log('cupola tendinea');
  const U = new Uint8Array(N); for (let q = 0; q < N; q++) if (WZ[q] > 0) { if (Tc[q] < 0) U[q] = 1; else for (const id of ORIGINE) if (F.get(id)[q] < 0) { U[q] = 1; break; } }
  // chiusura, levigatura e apertura sul solido muscoli + ossa + collaterale ulnare: la lamina aderente all'osso (spessa 3–4 mm) resta, le ali libere
  // no; poi si toglie l'osso e l'involucro resta entro `vicino` cm dall'unione di partenza
  const Uo = G.sdf(U).Do, Ub = Uint8Array.from(U), Mo = G.unione(['omero', 'ulna', 'ucl_ant', 'ucl_trasv']); for (let q = 0; q < N; q++) if (Mo[q]) Ub[q] = 1;
  const Env = G.chiuso(G.sdf(Ub).Do, INVOLUCRO.chiusura); gauss(Env, INVOLUCRO.liscia);
  const tolti = apri(Env, INVOLUCRO.apertura); gauss(Env, INVOLUCRO.dopoApertura);   // la distanza dei voxel è a gradini: senza levigatura i bordi escono a dente di sega
  for (let q = 0; q < N; q++) Env[q] = smax(Env[q], Uo[q] - INVOLUCRO.vicino, 0.1);
  const C = ostacoli(campi.tubi), Fdp = F.get('fdp'), Ffl = F.get('fpl');
  for (let q = 0; q < N; q++) C[q] = Math.max(C[q], GIOCO.muscolo - Fdp[q], GIOCO.muscolo - Ffl[q]);
  { // niente dietro l'epicondilo: vincolo valutato sul punto d'appoggio (rumoroso voxel per voxel), quindi levigato prima di usarlo
    const D = new Float32Array(N).fill(-1);
    for (let q = 0; q < N; q++) {
      const d = campi.omero[q]; if (d > 0.9 || WZ[q] <= 0) continue; const p = G.voxel(q); if (p[1] < INVOLUCRO.dietroDa) continue;
      const g = G.grad(campi.omero, p), gl = Math.hypot(...g) || 1, zs = p[2] - g[2] / gl * d;
      D[q] = smax(INVOLUCRO.dietro - zs, (INVOLUCRO.dietroDa - p[1]) * 0.5, 0.1) * 0.5;
    }
    gauss(D, INVOLUCRO.dietroLiscia); for (let q = 0; q < N; q++) C[q] = Math.max(C[q], D[q]);
  }
  for (let q = 0; q < N; q++) Env[q] = smax(Env[q], C[q], 0.05);
  // divisione: ogni voxel dell'involucro al muscolo più vicino (campo minore), etichette levigate → setti lisci
  const own = new Int8Array(N).fill(-1), W = new Float32Array(N);
  const A = TENDINE.verso, Fo = ORIGINE.map(id => F.get(id));
  for (let q = 0; q < N; q++) if (WZ[q] > 0 && Env[q] < 0.1) {
    const p = G.voxel(q), u = [p[0] - A[0], p[1] - A[1], p[2] - A[2]], ul = Math.hypot(...u) || 1;
    for (const s of SETTI.passi) { const pp = [p[0] + u[0] / ul * s, p[1] + u[1] / ul * s, p[2] + u[2] / ul * s]; let b = 0;
      Fo.forEach((Fm, k) => { const v = s ? G.sample(Fm, ...pp) : Fm[q]; if (v < b) { b = v; own[q] = k; } }); if (own[q] >= 0) break; }
    if (own[q] < 0) { let b = Infinity; Fo.forEach((Fm, k) => { if (Fm[q] < b) { b = Fm[q]; own[q] = k; } }); }
    W[q] = 1;
  }
  gauss(W, SETTI.sigma);
  const L = ORIGINE.map((id, k) => { const B = new Float32Array(N); for (let q = 0; q < N; q++) if (own[q] === k) B[q] = 1; gauss(B, SETTI.sigma); for (let q = 0; q < N; q++) B[q] = W[q] > 1e-4 ? B[q] / W[q] : 0; return B; });
  const nuovo = ORIGINE.map((id, k) => {
    const Fm = F.get(id), R = Float32Array.from(Fm);
    for (let q = 0; q < N; q++) {
      const w = WZ[q]; if (w <= 0) continue;
      let altro = 0; for (let j = 0; j < ORIGINE.length; j++) if (j !== k && L[j][q] > altro) altro = L[j][q];
      const part = W[q] > 1e-4 ? (altro - L[k][q]) * SETTI.scala + GIOCO.setto : 1;
      const Fz = smax(Env[q], part, SETTI.raccordo);   // spigoli arrotondati tra involucro e setto: fasci a margini smussati
      R[q] = (1 - w) * Fm[q] + w * Fz;
    }
    return R;
  });
  // levigatura finale nella zona (i tagli degli ostacoli lasciano orli), poi di nuovo gli ostacoli
  for (const R of nuovo) { const L0 = Float32Array.from(R); gauss(R, SETTI.finale); for (let q = 0; q < N; q++) { const w = WZ[q]; R[q] = w > 0 ? Math.max(w * R[q] + (1 - w) * L0[q], C[q]) : L0[q]; } }
  ORIGINE.forEach((id, k) => F.set(id, nuovo[k]));
  // nel raccordo tra zona e resto i muscoli non devono sovrapporsi: dove due si toccano si dividono a metà
  const copie = new Map(ORIGINE.map(id => [id, Float32Array.from(F.get(id))]));
  for (const id of ORIGINE) { const Fm = F.get(id); for (const j of ORIGINE) if (j !== id) { const Fj = copie.get(j); for (let q = 0; q < N; q++) { const c = (Fm[q] - Fj[q] + GIOCO.setto * 2) / 2; if (c > Fm[q]) Fm[q] = c; } } }
  for (const id of ORIGINE) { const Fm = F.get(id); for (let q = 0; q < N; q++) if (WZ[q] > 0) Fm[q] = smax(Fm[q], C[q], SETTI.taglio); }   // tagli degli ostacoli arrotondati (niente lembi affilati)
  let nenv = 0; for (let q = 0; q < N; q++) if (Env[q] < 0) nenv++;
  log(`origine comune: involucro di ${(nenv * PASSO ** 3).toFixed(2)} cm³ (${tolti} voxel tolti dall'apertura)`);
}
/* ============ Capo omerale del pronatore aderente all'osso ============ */
// sopra l'epicondilo il pronatore avvolgeva l'arteria collaterale ulnare inferiore con un lobo postero-mediale: un anello attorno al vaso,
// con un foro (il tunnel dell'arteria). In anatomia il ramo anteriore dell'arteria scende davanti all'epicondilo a contatto con il pronatore,
// e il capo omerale nasce con un'inserzione continua dalla cresta sopracondiloidea mediale e dal tendine comune. (a) Vicino all'arteria il
// pronatore resta dalla sua parte del vaso: non supera il piano per l'arteria con normale dal baricentro della sezione del muscolo verso il vaso
// (raccordo levigato, `CAPO_PT.arteria`); (b) l'unione di pronatore e omero è chiusa (`CAPO_PT.chiusura`) e lo spazio vuoto aggiunto, vicino
// all'omero e al pronatore, va al pronatore; (c) apertura e levigatura (niente bozzi)
{
  const Fp = F.get('pt'), M = new Uint8Array(N), Mp = new Uint8Array(N);
  { // (a) piano dell'arteria
    const id = 'a_collat_ulnare_inf', P = NVP.pts[id], ra = reff(id), [y0, y1, raggio] = CAPO_PT.arteria, Pl = new Float32Array(N).fill(-1);
    const aDi = y => { for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) { const t = (y - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t]; } } return null; };
    for (let j = 0; j < NY; j++) {
      const y = G.O[1] + (j + 0.5) * PASSO, wy = sstep(y0 - 0.4, y0, y) * (1 - sstep(y1, y1 + 0.4, y)); if (wy <= 0) continue;
      const a = aDi(y); if (!a) continue;
      let sx = 0, sz = 0, nn = 0;   // baricentro della sezione del pronatore entro `raggio` dall'arteria
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const q = i + NX * j + NXY * k; if (Fp[q] >= 0) continue; const x = G.O[0] + (i + 0.5) * PASSO, z = G.O[2] + (k + 0.5) * PASSO; if (Math.hypot(x - a[0], z - a[1]) > raggio * 1.5) continue; sx += x; sz += z; nn++; }
      if (!nn) continue;
      const nx0 = a[0] - sx / nn, nz0 = a[1] - sz / nn, nl = Math.hypot(nx0, nz0) || 1, nx = nx0 / nl, nz = nz0 / nl;
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        const x = G.O[0] + (i + 0.5) * PASSO, z = G.O[2] + (k + 0.5) * PASSO, d = Math.hypot(x - a[0], z - a[1]); if (d > raggio) continue;
        const w = wy * (1 - sstep(raggio * 0.6, raggio, d)), v = (x - a[0]) * nx + (z - a[1]) * nz + ra + GIOCO.tubo;
        Pl[i + NX * j + NXY * k] = w * v + (1 - w) * -1;
      }
    }
    gauss(Pl, 0.06); let tolti = 0; for (let q = 0; q < N; q++) if (Pl[q] > Fp[q]) { if (Fp[q] < 0 && Pl[q] >= 0) tolti++; Fp[q] = Pl[q]; }
    CAPO_PT.piano = Pl; log(`capo omerale del pronatore: ${(tolti * PASSO ** 3).toFixed(2)} cm³ tolti oltre l'arteria collaterale ulnare inferiore`);
  }
  for (let q = 0; q < N; q++) { if (Fp[q] < 0) Mp[q] = M[q] = 1; else if (campi.omero[q] < 0) M[q] = 1; }
  // chiusura del solo pronatore (colma la piega tra lobo e ventre) e dell'unione con l'omero (colma il foro sotto il lobo)
  const Cp = G.chiuso(G.sdf(Mp).Do, CAPO_PT.piega), Co = G.chiuso(G.sdf(M).Do, CAPO_PT.chiusura), Cl = new Float32Array(N);
  for (let q = 0; q < N; q++) Cl[q] = Math.min(Cp[q], Co[q]); gauss(Cl, 0.05);
  const C = ostacoli(campi.tubi), altri = MUSCOLI.filter(id => id !== 'pt').map(id => F.get(id)), P0 = Float32Array.from(Fp);
  for (let q = 0; q < N; q++) C[q] = Math.max(C[q], CAPO_PT.piano[q]);   // la chiusura non ricrea il lobo
  let n = 0;
  for (let q = 0; q < N; q++) {
    if (Cl[q] > 0.1 || campi.omero[q] > CAPO_PT.vicino || P0[q] > CAPO_PT.vicino || yDi(q) < CAPO_PT.da) continue;
    let v = Math.max(Cl[q], C[q]); for (const Fo of altri) v = Math.max(v, GIOCO.muscolo - Fo[q]);
    if (v < Fp[q]) { if (Fp[q] >= 0 && v < 0) n++; Fp[q] = v; }
  }
  const L = Float32Array.from(Fp); apri(L, CAPO_PT.apertura); gauss(L, 0.06);   // niente bozzo sporgente (l'apertura vale solo nella zona, sotto)
  for (let q = 0; q < N; q++) if (campi.omero[q] < CAPO_PT.vicino + 0.3 && yDi(q) > CAPO_PT.da - 0.3) { let v = Math.max(L[q], C[q]); for (const Fo of altri) v = Math.max(v, GIOCO.muscolo - Fo[q]); Fp[q] = v; }
  log(`capo omerale del pronatore: ${(n * PASSO ** 3).toFixed(2)} cm³ aggiunti tra muscolo e omero`);
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
  const passoMesh = ORIGINE.includes(id) || id === 'fpl' ? MESH.passoOrigine : MESH.passo;   // maglia fitta per le origini (lamina di 3–4 mm) e per il FPL (incavo attorno al tendine del pronatore)
  const nc = [0, 1, 2].map(k => Math.ceil((AREA.hi[k] - AREA.lo[k]) / passoMesh));
  G.setGriglia(AREA.lo, passoMesh, nc[0], nc[1], nc[2]);
  const out = G.nets(G.valuta(p => campFine(p[0], p[1], p[2])), () => [0, 1, 0]);
  G.setGriglia(fine.O, PASSO, NX, NY, NZ);
  const n2 = out.pos.length / 3, pos = G.taubin(out.pos, out.idx, MESH.taubin), e = PASSO * 0.75;
  const gradF = p => { const g = [campFine(p[0] + e, p[1], p[2]) - campFine(p[0] - e, p[1], p[2]), campFine(p[0], p[1] + e, p[2]) - campFine(p[0], p[1] - e, p[2]), campFine(p[0], p[1], p[2] + e) - campFine(p[0], p[1], p[2] - e)].map(v => v / (2 * e)); return g; };
  for (let i = 0; i < n2; i++) {   // Newton verso F = 0
    let p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    for (let it = 0; it < 5; it++) { const v = campFine(...p), g = gradF(p), g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] || 1, st = clamp(v / g2, -0.1, 0.1); p = [p[0] - g[0] * st, p[1] - g[1] * st, p[2] - g[2] * st]; if (Math.abs(v) < 2e-4) break; }
    pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
  }
  for (let i = 0; i < n2; i++) if (pos[3 * i + 1] < Y_TAGLIO + 0.05) pos[3 * i + 1] = Y_TAGLIO;
  const tagF = new Float32Array(n2), fd = new Float32Array(3 * n2), sezione = new Uint8Array(n2);
  for (let i = 0; i < n2; i++) {
    const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], Lc = candidati(p), taglio = p[1] <= Y_TAGLIO + 1e-4;
    if (taglio) { const c = Lc.find(([j]) => m.tag[j] >= 250); sezione[i] = c ? m.tag[c[0]] : 250; }
    if (id === 'fpl' || !Lc.length) { fd[3 * i + 1] = 1; continue; }   // FPL: ventre carnoso, fibre lungo il radio
    let st = 0, swt = 0, ref = null; const f = [0, 0, 0];
    for (const [j, d2] of Lc) {
      const wt = Math.exp(-d2 / (2 * FIBRE.sigmaTag ** 2)); if (m.tag[j] < 250) { st += wt * m.tag[j]; swt += wt; }
      const w = Math.exp(-d2 / (2 * FIBRE.sigma ** 2)), v = [m.fdir[3 * j], m.fdir[3 * j + 1], m.fdir[3 * j + 2]]; if (!ref) ref = v;
      const sg = v[0] * ref[0] + v[1] * ref[1] + v[2] * ref[2] < 0 ? -1 : 1; for (let k = 0; k < 3; k++) f[k] += sg * v[k] * w;
    }
    tagF[i] = swt > 1e-9 ? st / swt : m.tag[Lc[0][0]];
    const l = Math.hypot(...f) || 1; for (let k = 0; k < 3; k++) fd[3 * i + k] = f[k] / l;
  }
  // zona dell'origine: colore da tendine secondo la distanza dall'omero, fibre verso l'epicondilo (sul piano tangente)
  if (ORIGINE.includes(id)) for (let i = 0; i < n2; i++) {
    const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], w = pesoZona(...p); if (w <= 0 || sezione[i]) continue;
    const dH = G.sample(campi.omero, ...p), t = 200 * (1 - sstep(TENDINE[id][0], TENDINE[id][1], dH));
    tagF[i] = (1 - w) * tagF[i] + w * t;
    const g = gradF(p), gl = Math.hypot(...g) || 1, n = g.map(v => v / gl);
    let d = [TENDINE.verso[0] - p[0], TENDINE.verso[1] - p[1], TENDINE.verso[2] - p[2]]; const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; d = d.map((v, k) => v - dn * n[k]);
    const dl = Math.hypot(...d) || 1, f0 = [fd[3 * i], fd[3 * i + 1], fd[3 * i + 2]], sg = f0[0] * d[0] + f0[1] * d[1] + f0[2] * d[2] < 0 ? -1 : 1;
    const f = [0, 1, 2].map(k => (1 - w) * sg * f0[k] + w * d[k] / dl), fl = Math.hypot(...f) || 1; for (let k = 0; k < 3; k++) fd[3 * i + k] = f[k] / fl;
  }
  if (id === 'fpl') for (let i = 0; i < n2; i++) {   // fibre del FPL: asse del radio (y) proiettato sul piano tangente
    const g = gradF([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), gl = Math.hypot(...g) || 1, n = g.map(v => v / gl);
    const f = [-n[0] * n[1], 1 - n[1] * n[1], -n[2] * n[1]], fl = Math.hypot(...f) || 1; for (let k = 0; k < 3; k++) fd[3 * i + k] = f[k] / fl;
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

/* ============ (3) Lacerto fibroso adagiato sui flessori ============ */
const LACERTO = { chiusura: 0.3, gioco: 0.03, vicinato: 0.2, iter: 6, passate: 15 };
{
  const m = base.get('lacerto'), pos = Float32Array.from(m.pos), nv = pos.length / 3;
  const { Do } = G.sdf(G.unione(MUSCOLI)), U = G.chiuso(Do, LACERTO.chiusura); gauss(U, 0.05);
  const adj = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = m.idx[t + e], b = m.idx[t + (e + 1) % 3]; adj[a].add(b); adj[b].add(a); }
  const A = adj.map(s => [...s]);
  const vicini = (() => { const c = LACERTO.vicinato, key = (x, y, z) => `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`, H = new Map();
    for (let i = 0; i < nv; i++) { const k = key(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); if (!H.has(k)) H.set(k, []); H.get(k).push(i); }
    return Array.from({ length: nv }, (_, i) => { const r = [], [x, y, z] = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of H.get(key(x + dx * c, y + dy * c, z + dz * c)) || []) if (Math.hypot(pos[3 * j] - x, pos[3 * j + 1] - y, pos[3 * j + 2] - z) < c) r.push(j);
      return r; }); })();
  const grad = (x, y, z) => { const e = PASSO, g = [G.sample(U, x + e, y, z) - G.sample(U, x - e, y, z), G.sample(U, x, y + e, z) - G.sample(U, x, y - e, z), G.sample(U, x, y, z + e) - G.sample(U, x, y, z - e)], l = Math.hypot(...g) || 1; return g.map(v => v / l); };
  let mosso = 0;
  for (let it = 0; it < LACERTO.iter; it++) {
    const need = new Float32Array(nv); for (let i = 0; i < nv; i++) need[i] = Math.max(0, LACERTO.gioco - G.sample(U, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]));
    const N2 = new Float32Array(nv); for (let i = 0; i < nv; i++) { let v = 0; for (const j of vicini[i]) v = Math.max(v, need[j]); N2[i] = v; }
    let D = new Float32Array(3 * nv); const g = new Float32Array(3 * nv);
    for (let i = 0; i < nv; i++) { const n = grad(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); for (let c = 0; c < 3; c++) { g[3 * i + c] = n[c]; D[3 * i + c] = n[c] * N2[i]; } }
    for (let k = 0; k < LACERTO.passate; k++) { const E = new Float32Array(3 * nv);
      for (let i = 0; i < nv; i++) { const a = A[i]; for (let c = 0; c < 3; c++) { let s = 0; for (const j of a) s += D[3 * j + c]; E[3 * i + c] = a.length ? 0.5 * D[3 * i + c] + 0.5 * s / a.length : D[3 * i + c]; } }
      for (let i = 0; i < nv; i++) { const pr = E[3 * i] * g[3 * i] + E[3 * i + 1] * g[3 * i + 1] + E[3 * i + 2] * g[3 * i + 2], manca = N2[i] - pr; if (manca > 0) for (let c = 0; c < 3; c++) E[3 * i + c] += manca * g[3 * i + c]; }
      D = E; }
    let n = 0; for (let i = 0; i < nv; i++) { if (Math.hypot(D[3 * i], D[3 * i + 1], D[3 * i + 2]) > 1e-4) n++; for (let c = 0; c < 3; c++) pos[3 * i + c] += D[3 * i + c]; }
    if (!n) break; mosso = Math.max(mosso, n);
  }
  let max = 0; for (let i = 0; i < nv; i++) max = Math.max(max, Math.hypot(pos[3 * i] - m.pos[3 * i], pos[3 * i + 1] - m.pos[3 * i + 1], pos[3 * i + 2] - m.pos[3 * i + 2]));
  setMesh('lacerto', { pos, idx: m.idx, tag: m.tag, fdir: m.fdir });
  log(`lacerto fibroso: ${mosso} vertici sollevati (al più ${(max * 10).toFixed(1)} mm)`);
}

/* ============ Pagina: nota del FPL ============ */
{
  const da = 'info:"Dalla faccia anteriore del radio (metà prossimale della diafisi) e dalla membrana interossea;';
  const a = 'info:"Dalla faccia anteriore del radio, dal di sotto della tuberosità radiale e della linea obliqua fino al pronatore quadrato, e dalla membrana interossea adiacente (lateralmente al nervo interosseo anteriore, che lo separa dal FDP);';
  if (G.M.html.includes(da)) G.M.html = G.M.html.replace(da, () => a);
}
saveFile(repack());
