/* Fascio vascolo-nervoso sopra e sotto la clavicola (modelli/spalla-3d.html): plesso, soprascapolare, vasi succlavi e ascellari, dentato anteriore,
   succlavio, omoioideo e trapezio discendente si scostano di pochi millimetri invece di compenetrarsi.

   Problema. Con le forme BodyParts3D il fascio attraversa questi quattro muscoli (fino a ~8 mm il succlavio, ~5 mm l'omoioideo, 2–3 mm dentato e
   trapezio). Scavare solo i muscoli (canale o solco) li taglia a metà: l'omoioideo restava diviso in due dal soprascapolare, il succlavio perdeva il
   capo laterale. Qui nervi, vasi e muscoli si spostano insieme, con campi lisci e piccoli, verso il lato anatomico: l'omoioideo resta superficiale a
   plesso e soprascapolare (che passano sotto il ventre inferiore verso l'incisura), il succlavio sopra e davanti a vasi e plesso, il trapezio dietro
   e sopra, il dentato dal lato più vicino. Il poco che resta (≤ 2–3 mm, dove il muscolo è fermo sull'osso) lo toglie `nervi-muscoli-spalla.mjs`
   con un solco poco profondo.

   Uso (dalla cartella del progetto):
     node strumenti/fascio-clavicolare-spalla.mjs              → sposta tubi e muscoli nel file del modello
     PROVA=1 node strumenti/fascio-clavicolare-spalla.mjs      → stampa spostamenti e controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/fascio-clavicolare-spalla.mjs   → lavora su una copia
   Va lanciato dopo `fascio-dorsale-spalla.mjs` e PRIMA di `nervi-muscoli-spalla.mjs` (`SOLO=dent,succl,omoi,trap_d` per i solchi residui; gli
   altri muscoli non hanno compenetrazioni nuove con i tubi spostati, lo dice il controllo `altri`). Riparte sempre dalle stesse mesh, quindi si può rilanciare con lo stesso risultato: tubi della revisione
   `PARTENZA_TUBI` (uscita di `fascio-dorsale-spalla.mjs`; se si rilanciano `vasi-nervi-spalla.mjs` o `fascio-dorsale-spalla.mjs` va aggiornata al
   commit del loro risultato), muscoli della revisione `PARTENZA_MUSC` (uscita di `sezioni-spalla.mjs`, prima di qualsiasi canale di
   `nervi-muscoli-spalla.mjs`) riportati vicino al fascio alla forma BodyParts3D di `BP3D`.

   Metodo:
     1. Forma dei muscoli. Succlavio, omoioideo e trapezio discendente (`INTERI`) ripartono dalla mesh BodyParts3D intera di `BP3D`: in
        `PARTENZA_MUSC` i canali di `vasi-nervi-spalla.mjs` li avevano schiacciati contro l'osso (il capo laterale del succlavio ridotto a una
        lamina) e `muscoli-spalla.mjs` li aveva cambiati poco altrove. Il dentato tiene le correzioni di `muscoli-spalla.mjs` contro coste e altri
        muscoli: solo i vertici entro `RIPR`[0] dai tubi vanno sul punto più vicino della superficie BodyParts3D (campo con segno di `BP3D`), con
        raccordo fino a `RIPR`[1], poi `LEVIGA` passate di Taubin nella stessa fascia.
     2. Spostamenti: un campo per i tubi (lo stesso per tutti: giunzioni, calibri e raccordi restano identici nelle mesh che li condividono) e uno per
        ogni muscolo, B-spline cubiche su una griglia di controllo di passo `PASSO_C` nel riquadro dei contatti + `MARGINE` (nullo al bordo). Energia,
        minimizzata con Adam (`ITER` passi): compenetrazione tubo–muscolo, misurata sui vertici dei tubi (campo del muscolo nel punto spostato) e su
        quelli del muscolo (campo dei tubi), con `GIOCO`; tubi a ≥ `GIOCO_OSSO` da ossa, cartilagini, capsula e legamenti (o non più vicini di prima);
        tubi non più dentro gli altri muscoli di prima (peso basso: lì `nervi-muscoli-spalla.mjs` rifà il canale); muscoli non più dentro ossa e altri
        muscoli di prima; spostamento oltre `MAX` penalizzato forte; levigatezza (più forte per i tubi, `liscio_tubi`: il decorso dei nervi resta
        liscio) e ampiezza dei campi. Inserzioni ferme: lo spostamento del muscolo è moltiplicato per un raccordo da 0 a 1 tra `INSERZ`[0] e
        `INSERZ`[1] dall'osso (la faccia sull'osso resta, quella libera si scosta: dove il muscolo è sottile si assottiglia di poco). Lato anatomico:
        per omoioideo, succlavio e trapezio il campo del muscolo è prolungato di `OMBRA` cm dal lato `LATO` (dal fascio verso il muscolo) vicino ai
        contatti, così il fascio può uscire solo dal lato opposto.
     2b. Vasi nello spazio costoclavicolare: già in `PARTENZA_TUBI` succlavia e vena entravano fino a 1,6 mm in clavicola e prima costa (spazio più
        stretto del calibro). I vertici dei tubi vicini all'osso sono spinti fuori lungo la normale dell'osso, con spinta liscia
        `APPIATTI`·ln(1 + e^((GIOCO_OSSO − d)/`APPIATTI`)) ripetuta: il vaso si appiattisce contro l'osso. Dipende solo dalla posizione, quindi è
        uguale nelle mesh che si sovrappongono (succlavia/ascellare al margine della prima costa).
     3. Normali: dei tubi ruotate con il gradiente del campo; dei muscoli ricalcolate dove il vertice si è mosso, altrove quelle di prima.
   Controlli stampati: volume comune tubo–muscolo prima e dopo (griglia di 0,2 mm; anche tubi–altri muscoli), spostamento massimo e al 99 % di tubi
   e muscoli, vertici appiattiti, distanza minima dei tubi dalle ossa prima e dopo, volume dei muscoli prima e dopo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, attrs, setMesh, repack, saveFile, log, sstep, setGriglia, griglia, campo, solid, edt, sample, realDaRevisione, nrmDaRevisione, taubin } = G;

const PROVA = !!process.env.PROVA, FILE_REPO = 'modelli/spalla-3d.html';
const PARTENZA_TUBI = 'f9023f7', PARTENZA_MUSC = '554a2f5~1', BP3D = '59b7798';
const TUBI = ['plesso', 'n_soprascapolare', 'n_ascellare', 'n_muscolocutaneo', 'n_radiale', 'n_mediano', 'n_ulnare', 'a_succ', 'v_succ', 'a_asc', 'v_asc'];
const MUSC = ['dent', 'succl', 'omoi', 'trap_d'];
const OSSA = ['scapola', 'clavicola', 'omero', 'costa1', 'costa2', 'costa3', 'costa4', 'costa5', 'manubrio', 'corpo_sterno', 'cc1', 'cc2',
  'cart_omero', 'cart_glen', 'labbro', 'caps', 'cc_conoide', 'cc_trapezoide', 'cal', 'ac_leg', 'sc_leg', 'coraco_om', 'sghl', 'mghl', 'ighl_a', 'ighl_p'];
const ALTRI = ['supra', 'infra', 'tmin', 'subs', 'delt_cl', 'delt_ac', 'delt_sp', 'tmaj', 'pec_cl', 'pec_st', 'pec_ab', 'pmin', 'trap_t', 'trap_a', 'lat',
  'romb_mag', 'romb_min', 'elev', 'bic_lungo', 'bic_breve', 'coracobr', 'tri_lungo', 'tri_lat', 'tri_med'];
// lato del muscolo rispetto al fascio (versore, dal fascio verso il muscolo): dove l'uscita più vicina non è quella anatomica
const LATO = { omoi: [-0.6, 0.78, -0.12], succl: [-0.05, 0.57, 0.82], trap_d: [0, 0.5, -0.87] };
const RIPR = [0.35, 0.7], LEVIGA = 10, INTERI = ['succl', 'omoi', 'trap_d'];                         // cm, passate
const HF = 0.05, PASSO_C = 0.7, MARGINE = 2.1, ITER = +(process.env.ITER ?? 500), PASSO_ADAM = 0.004;
const GIOCO = 0.03, GIOCO_OSSO = 0.03, APPIATTI = 0.02, INSERZ = [0.05, 0.25], MAX = 0.3, OMBRA = 1.0;
const PESO = { comp: 1, osso: 3, altri: 0.3, max: 20, ampiezza: 0.02, liscio: 0.3, liscio_tubi: 1.5 };

const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nz = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const pt = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
const riquadro = (pos, n = pos.length / 3) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[3 * i + k]); hi[k] = Math.max(hi[k], pos[3 * i + k]); } return { lo, hi }; };
const volume = (pos, idx) => { let v = 0; for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2]; v += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6; } return v; };
const chiaveP = (P, i) => Math.round(P[3 * i] * 2e4) + ',' + Math.round(P[3 * i + 1] * 2e4) + ',' + Math.round(P[3 * i + 2] * 2e4);
const quantile = (a, f) => { const s = Float64Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0; };

// campo campionato con il suo gradiente (trilineare: stessi 8 voxel), su una griglia salvata
const congela = F => ({ F, O: G.O.slice(), H: G.H, NX: G.NX, NY: G.NY, NZ: G.NZ });
function sg(C, x, y, z, out) {
  const { F, O, H, NX, NY, NZ } = C, NXY = NX * NY;
  let fx = (x - O[0]) / H - 0.5, fy = (y - O[1]) / H - 0.5, fz = (z - O[2]) / H - 0.5;
  const fuori = fx < 0 || fy < 0 || fz < 0 || fx > NX - 1.001 || fy > NY - 1.001 || fz > NZ - 1.001;
  fx = Math.min(Math.max(fx, 0), NX - 1.001); fy = Math.min(Math.max(fy, 0), NY - 1.001); fz = Math.min(Math.max(fz, 0), NZ - 1.001);
  const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k, b = i + NX * j + NXY * k;
  const c000 = F[b], c100 = F[b + 1], c010 = F[b + NX], c110 = F[b + NX + 1], c001 = F[b + NXY], c101 = F[b + NXY + 1], c011 = F[b + NXY + NX], c111 = F[b + NXY + NX + 1];
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u, x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  out[0] = fuori ? 1 : y0 + (y1 - y0) * w;
  out[1] = ((c100 - c000) * (1 - v) * (1 - w) + (c110 - c010) * v * (1 - w) + (c101 - c001) * (1 - v) * w + (c111 - c011) * v * w) / H;
  out[2] = ((x10 - x00) * (1 - w) + (x11 - x01) * w) / H;
  out[3] = (y1 - y0) / H;
  return out;
}

/* ---- 0. mesh di partenza ---- */
const NRM = {};
for (const n of TUBI) { const m = realDaRevisione(PARTENZA_TUBI, n, FILE_REPO); setMesh(n, m); NRM[n] = nrmDaRevisione(PARTENZA_TUBI, n, FILE_REPO); }
const BASE = {};
for (const n of MUSC) { BASE[n] = realDaRevisione(PARTENZA_MUSC, n, FILE_REPO); NRM[n] = nrmDaRevisione(PARTENZA_MUSC, n, FILE_REPO); }
const RQT = riquadro(new Float32Array(TUBI.flatMap(n => [...REAL(n).pos])));

/* ---- 1. forma BodyParts3D vicino al fascio ---- */
const RIPRISTINO = {};
for (const mu of MUSC) {
  const B = BASE[mu], A = realDaRevisione(BP3D, mu, FILE_REPO), nv = B.pos.length / 3, { lo, hi } = riquadro(B.pos);
  if (INTERI.includes(mu)) { BASE[mu] = A; NRM[mu] = null; RIPRISTINO[mu] = 'forma BodyParts3D intera'; log(mu, 'forma BodyParts3D intera'); continue; }
  setMesh('_bp3d', A); griglia(lo, hi, 0.03, 0.3); const FA = congela(campo(['_bp3d']).F), FT = congela(campo(TUBI).F);
  const P = Float32Array.from(B.pos), w = new Float32Array(nv), o = [0, 0, 0, 0];
  for (let i = 0; i < nv; i++) { w[i] = 1 - sstep(RIPR[0], RIPR[1], sg(FT, ...pt(P, i), o)[0]); if (!w[i]) continue;
    for (let it = 0; it < 3; it++) { sg(FA, ...pt(P, i), o); const g = nz([o[1], o[2], o[3]]); for (let k = 0; k < 3; k++) P[3 * i + k] -= w[i] * o[0] * g[k]; } }
  // Taubin solo nella fascia ripristinata (i vertici fuori restano dove sono)
  // (sulla mesh saldata: i vertici doppi delle cuciture di tag e normali restano insieme)
  const K = new Map(), u = new Int32Array(nv); for (let i = 0; i < nv; i++) { const k = chiaveP(B.pos, i); if (!K.has(k)) K.set(k, K.size); u[i] = K.get(k); }
  const PU = new Float32Array(K.size * 3); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) PU[3 * u[i] + k] = P[3 * i + k];
  const S = taubin(PU, Uint32Array.from(B.idx, i => u[i]), LEVIGA);
  let mx = 0; for (let i = 0; i < nv; i++) { const f = sstep(0, 0.3, w[i]); for (let k = 0; k < 3; k++) P[3 * i + k] += f * (S[3 * u[i] + k] - P[3 * i + k]); mx = Math.max(mx, len(sub(pt(P, i), pt(B.pos, i)))); }
  BASE[mu] = { ...B, pos: P }; RIPRISTINO[mu] = { vertici: [...w].filter(x => x > 0).length, spostamento_max_mm: +(mx * 10).toFixed(1) };
  log(mu, 'forma BodyParts3D ripristinata vicino al fascio:', JSON.stringify(RIPRISTINO[mu]));
}
G.ripristina('_bp3d');
for (const mu of MUSC) setMesh(mu, BASE[mu]);

/* ---- 2. contatti e campi ---- */
const CONT = {};          // per muscolo: vertici dei tubi dentro il muscolo e vertici del muscolo dentro i tubi
for (const mu of MUSC) { const R = REAL(mu), A = riquadro(R.pos), lo = A.lo.map((v, k) => Math.max(v, RQT.lo[k])), hi = A.hi.map((v, k) => Math.min(v, RQT.hi[k]));
  if (![0, 1, 2].every(k => lo[k] < hi[k])) continue; griglia(lo, hi, HF, 0.3); const FM = congela(campo([mu]).F), FT = congela(campo(TUBI).F), o = [0, 0, 0, 0], C = [];
  for (const n of TUBI) { const T = REAL(n); for (let i = 0; i < T.nv; i++) { const p = pt(T.pos, i); if (sg(FM, ...p, o)[0] < GIOCO) C.push(p); } }
  for (let i = 0; i < R.nv; i++) { const p = pt(R.pos, i); if (sg(FT, ...p, o)[0] < GIOCO) C.push(p); }
  if (C.length) CONT[mu] = C; log(mu, 'punti di contatto con il fascio', C.length); }
const tutti = Object.values(CONT).flat(), RC = riquadro(new Float32Array(tutti.flat()));
const RLO = RC.lo.map(v => v - MARGINE), RHI = RC.hi.map(v => v + MARGINE);
griglia(RLO, RHI, HF, 0.3); log('regione', RLO.map(v => v.toFixed(1)).join(','), '→', RHI.map(v => v.toFixed(1)).join(','), '| griglia', G.NX, G.NY, G.NZ);
const FT = congela(campo(TUBI).F), FB = congela(campo(OSSA).F), FO = congela(campo(ALTRI).F), FM = {};
for (const mu of MUSC) { const F = campo([mu]).F;
  if (LATO[mu] && CONT[mu]) { // ombra: il muscolo si prolunga dal suo lato (u) vicino ai contatti, il fascio esce solo dall'altro
    const u = nz(LATO[mu]), M = new Uint8Array(G.N); for (const p of CONT[mu]) { const i = Math.floor((p[0] - G.O[0]) / G.H), j = Math.floor((p[1] - G.O[1]) / G.H), k = Math.floor((p[2] - G.O[2]) / G.H); M[G.vi(i, j, k)] = 1; }
    const D = edt(M), F0 = F.slice(); let n = 0;
    for (let id = 0; id < G.N; id++) { if (D[id] > 1.5) continue; const p = G.voxel(id); let m = F0[id];
      for (let t = HF; t <= OMBRA + 1e-6; t += HF) m = Math.min(m, sample(F0, p[0] - t * u[0], p[1] - t * u[1], p[2] - t * u[2]));
      if (m < F[id]) { F[id] = m; n++; } }
    log(mu, 'ombra dal lato', u.map(v => v.toFixed(2)).join(','), '| voxel', n); }
  FM[mu] = congela(F); }

/* ---- 3. campi di spostamento (B-spline cubiche) ---- */
const NC = [0, 1, 2].map(k => Math.ceil((RHI[k] - RLO[k]) / PASSO_C) + 1), NCT = NC[0] * NC[1] * NC[2];
const libero = new Uint8Array(NCT);   // nodi del bordo (due strati) fermi: il campo si annulla con continuità
for (let k = 2; k < NC[2] - 2; k++) for (let j = 2; j < NC[1] - 2; j++) for (let i = 2; i < NC[0] - 2; i++) libero[i + NC[0] * (j + NC[1] * k)] = 1;
const bs = t => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
function base(p, I, W, o) { // 64 nodi e pesi (−1 dove il nodo è fuori dalla griglia)
  const a = [0, 1, 2].map(k => { const t = (p[k] - RLO[k]) / PASSO_C, i = Math.floor(t); return { i: i - 1, w: bs(t - i) }; });
  let q = o; for (let c = 0; c < 4; c++) for (let b = 0; b < 4; b++) for (let a0 = 0; a0 < 4; a0++) { const i = a[0].i + a0, j = a[1].i + b, k = a[2].i + c;
    const ok = i >= 0 && j >= 0 && k >= 0 && i < NC[0] && j < NC[1] && k < NC[2]; I[q] = ok ? i + NC[0] * (j + NC[1] * k) : -1; W[q] = ok ? a[0].w[a0] * a[1].w[b] * a[2].w[c] : 0; q++; }
}
const valD = (c, I, W, o, out) => { out[0] = out[1] = out[2] = 0; for (let q = o; q < o + 64; q++) { const n = I[q]; if (n < 0) continue; const w = W[q]; out[0] += w * c[3 * n]; out[1] += w * c[3 * n + 1]; out[2] += w * c[3 * n + 2]; } return out; };
const accD = (g, I, W, o, v) => { for (let q = o; q < o + 64; q++) { const n = I[q]; if (n < 0) continue; const w = W[q]; g[3 * n] += w * v[0]; g[3 * n + 1] += w * v[1]; g[3 * n + 2] += w * v[2]; } };
const dentro = p => [0, 1, 2].every(k => p[k] > RLO[k] && p[k] < RHI[k]);
const IB = new Float64Array(64), Itmp = new Int32Array(64);
function campoD(c, p) { base(p, Itmp, IB, 0); return valD(c, Itmp, IB, 0, [0, 0, 0]); }

// campioni: vertici (saldati) dei tubi e dei muscoli nella regione, con il valore dei campi in partenza
function campioni(nomi) { const S = []; const o = [0, 0, 0, 0];
  for (const n of nomi) { const R = REAL(n), vis = new Set(); for (let i = 0; i < R.nv; i++) { const k = chiaveP(R.pos, i); if (vis.has(k)) continue; vis.add(k); const p = pt(R.pos, i); if (dentro(p)) S.push({ n, p }); } }
  const I = new Int32Array(S.length * 64), W = new Float32Array(S.length * 64); S.forEach((s, q) => base(s.p, I, W, 64 * q));
  for (const s of S) { s.b = sg(FB, ...s.p, o)[0]; s.a = sg(FO, ...s.p, o)[0]; s.l = sstep(INSERZ[0], INSERZ[1], s.b); } return { S, I, W }; }
const CT = campioni(TUBI), CM = campioni(MUSC);
for (const s of CT.S) s.m = MUSC.filter(mu => sg(FM[mu], ...s.p, [0, 0, 0, 0])[0] < 0.6);
log('campioni: tubi', CT.S.length, '| muscoli', CM.S.length, '| nodi di controllo', NC.join('×'));

const campi = { tubi: new Float64Array(NCT * 3) }; for (const mu of MUSC) campi[mu] = new Float64Array(NCT * 3);
const nomiC = Object.keys(campi), adam = Object.fromEntries(nomiC.map(k => [k, { m: new Float64Array(NCT * 3), v: new Float64Array(NCT * 3) }]));
function energia(grad) {
  for (const k of nomiC) grad[k].fill(0);
  const E = { comp: 0, osso: 0, altri: 0, max: 0, regol: 0 }, o = [0, 0, 0, 0], dt = [0, 0, 0], dm = [0, 0, 0], v = [0, 0, 0];
  // penalità (soglia − campo)² nel punto q; il gradiente va ai campi che spostano q (segno +1 o −1)
  const pen = (C, q, soglia, peso, voce, dest) => { sg(C, ...q, o); if (o[0] >= soglia) return; const r = soglia - o[0]; E[voce] += peso * r * r;
    for (const [g, S3, z] of dest) { const f = -2 * peso * r * z; v[0] = f * o[1]; v[1] = f * o[2]; v[2] = f * o[3]; accD(g, ...S3, v); } };
  const cap = (d, g, S3, peso) => { const l = len(d); if (l <= MAX) return; const r = l - MAX; E.max += peso * r * r; const f = 2 * peso * r / l; accD(g, ...S3, [f * d[0], f * d[1], f * d[2]]); };
  // tubi: campo del muscolo nel punto spostato (il muscolo spostato di dm equivale al punto spostato di −dm)
  CT.S.forEach((s, q) => { const S3 = [CT.I, CT.W, 64 * q]; valD(campi.tubi, ...S3, dt); const p = add(s.p, dt);
    for (const mu of s.m) { valD(campi[mu], ...S3, dm); pen(FM[mu], add(p, dm, -s.l), GIOCO, PESO.comp, 'comp', [[grad.tubi, S3, 1], [grad[mu], S3, -s.l]]); }
    pen(FB, p, Math.min(s.b, GIOCO_OSSO), PESO.osso, 'osso', [[grad.tubi, S3, 1]]);
    pen(FO, p, Math.min(s.a, GIOCO), PESO.altri, 'altri', [[grad.tubi, S3, 1]]);
    cap(dt, grad.tubi, S3, PESO.max); });
  // muscoli: campo dei tubi nel punto spostato
  CM.S.forEach((s, q) => { const S3 = [CM.I, CM.W, 64 * q], mu = s.n; if (!s.l) return; valD(campi[mu], ...S3, dm); valD(campi.tubi, ...S3, dt); const p = add(s.p, dm, s.l);
    pen(FT, sub(p, dt), GIOCO, PESO.comp, 'comp', [[grad[mu], S3, s.l], [grad.tubi, S3, -1]]);
    pen(FB, p, Math.min(s.b, 0), PESO.osso, 'osso', [[grad[mu], S3, s.l]]);
    pen(FO, p, Math.min(s.a, 0), PESO.altri, 'altri', [[grad[mu], S3, s.l]]);
    cap(dm, grad[mu], S3, PESO.max); });
  // ampiezza e levigatezza dei campi
  for (const k of nomiC) { const c = campi[k], g = grad[k], pl = k === 'tubi' ? PESO.liscio_tubi : PESO.liscio;
    for (let n = 0; n < NCT; n++) { if (!libero[n]) continue; for (let e = 0; e < 3; e++) { E.regol += PESO.ampiezza * c[3 * n + e] ** 2; g[3 * n + e] += 2 * PESO.ampiezza * c[3 * n + e]; } }
    for (let k2 = 0; k2 < NC[2]; k2++) for (let j = 0; j < NC[1]; j++) for (let i = 0; i < NC[0]; i++) { const n = i + NC[0] * (j + NC[1] * k2);
      for (const m of [i + 1 < NC[0] ? n + 1 : -1, j + 1 < NC[1] ? n + NC[0] : -1, k2 + 1 < NC[2] ? n + NC[0] * NC[1] : -1]) { if (m < 0) continue;
        for (let e = 0; e < 3; e++) { const d = c[3 * n + e] - c[3 * m + e]; E.regol += pl * d * d; g[3 * n + e] += 2 * pl * d; g[3 * m + e] -= 2 * pl * d; } } } }
  return E;
}

/* ---- 4. minimizzazione (Adam) ---- */
const grad = Object.fromEntries(nomiC.map(k => [k, new Float64Array(NCT * 3)]));
let E0 = null;
for (let it = 1; it <= ITER; it++) { const E = energia(grad); E0 ||= E;
  for (const k of nomiC) { const c = campi[k], g = grad[k], { m, v } = adam[k];
    for (let n = 0; n < NCT; n++) { if (!libero[n]) continue; for (let e = 0; e < 3; e++) { const i = 3 * n + e; m[i] = 0.9 * m[i] + 0.1 * g[i]; v[i] = 0.999 * v[i] + 0.001 * g[i] * g[i];
      c[i] -= PASSO_ADAM * (m[i] / (1 - 0.9 ** it)) / (Math.sqrt(v[i] / (1 - 0.999 ** it)) + 1e-9); } } }
  if (it === 1 || it % 50 === 0) log('passo', it, Object.entries(E).map(([k, x]) => k + ' ' + x.toExponential(2)).join(' | ')); }

/* ---- 5. applicazione ---- */
const muovi = (pos, c, inserz = false) => { const P = Float32Array.from(pos), D = new Float32Array(pos.length); for (let i = 0; i < pos.length / 3; i++) { const p = pt(pos, i); if (!dentro(p)) continue;
  const d = campoD(c, p), l = inserz ? sstep(INSERZ[0], INSERZ[1], sg(FB, ...p, [0, 0, 0, 0])[0]) : 1; for (let k = 0; k < 3; k++) d[k] *= l; for (let k = 0; k < 3; k++) { P[3 * i + k] += d[k]; D[3 * i + k] = d[k]; } } return { P, D }; };
// normali ruotate con il gradiente dello spostamento: n' ∝ (I − Jᵀ) n
const ruotaNormali = (pos, nm, c) => { if (!nm) return null; const out = Int8Array.from(nm), e = 0.02;
  for (let i = 0; i < pos.length / 3; i++) { const p = pt(pos, i); if (!dentro(p)) continue; const J = [0, 1, 2].map(k => { const a = campoD(c, add(p, [k === 0 ? e : 0, k === 1 ? e : 0, k === 2 ? e : 0])), b = campoD(c, add(p, [k === 0 ? -e : 0, k === 1 ? -e : 0, k === 2 ? -e : 0])); return sub(a, b).map(x => x / (2 * e)); });
    const n = [nm[3 * i] / 127, nm[3 * i + 1] / 127, nm[3 * i + 2] / 127], m = nz([0, 1, 2].map(j => n[j] - (J[j][0] * n[0] + J[j][1] * n[1] + J[j][2] * n[2])));
    for (let k = 0; k < 3; k++) out[3 * i + k] = Math.round(m[k] * 127); }
  return out; };
// normali di vertice senza sfaccettature (come muscoli-spalla.mjs e nervi-muscoli-spalla.mjs)
function normaliLisce(pos, idx, tag, passate = 3) {
  const nv = pos.length / 3, key = new Map(), grp = new Int32Array(nv);
  for (let i = 0; i < nv; i++) { const k = chiaveP(pos, i) + ',' + (tag && tag[i] >= 250 ? 1 : 0); let g = key.get(k); if (g === undefined) { g = key.size; key.set(k, g); } grp[i] = g; }
  const A = new Float64Array(key.size * 3);
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2], f = cross(sub(pt(pos, b), pt(pos, a)), sub(pt(pos, c), pt(pos, a)));
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) A[3 * grp[v] + k] += f[k]; }
  const nb = Array.from({ length: key.size }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const x = grp[idx[t + e]], y = grp[idx[t + (e + 1) % 3]]; if (x !== y) { nb[x].add(y); nb[y].add(x); } }
  const nl = nb.map(s => [...s]);
  const norma = X => { for (let i = 0; i < key.size; i++) { const l = Math.hypot(X[3 * i], X[3 * i + 1], X[3 * i + 2]) || 1; for (let k = 0; k < 3; k++) X[3 * i + k] /= l; } return X; };
  let X = norma(A);
  for (let p = 0; p < passate; p++) { const Y = new Float64Array(X.length); for (let i = 0; i < key.size; i++) for (let k = 0; k < 3; k++) { let s = 2 * X[3 * i + k]; for (const j of nl[i]) s += X[3 * j + k] / nl[i].length; Y[3 * i + k] = s; } X = norma(Y); }
  const out = new Int8Array(nv * 3); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) out[3 * i + k] = Math.round(X[3 * grp[i] + k] * 127);
  return out;
}

// controllo: volume comune (griglia di 0,2 mm) e profondità per coppia
const H_CTRL = 0.02, SOGLIA_MM3 = 0.05;
function controllo(A, B) { const out = {};
  for (const a of A) for (const b of B) { const RA = riquadro(REAL(a).pos), RB = riquadro(REAL(b).pos); if (![0, 1, 2].every(k => RA.lo[k] <= RB.hi[k] && RB.lo[k] <= RA.hi[k])) continue;
    const lo = [0, 1, 2].map(k => Math.max(RA.lo[k], RB.lo[k]) - 0.05), hi = [0, 1, 2].map(k => Math.min(RA.hi[k], RB.hi[k]) + 0.05);
    setGriglia(lo, H_CTRL, ...[0, 1, 2].map(k => Math.ceil((hi[k] - lo[k]) / H_CTRL)));
    const Ma = solid(a), Mb = solid(b); let n = 0; for (let i = 0; i < G.N; i++) if (Ma[i] && Mb[i]) n++; if (!n) continue;
    const Di = edt(Ma, true); let p = 0; for (let i = 0; i < G.N; i++) if (Ma[i] && Mb[i]) p = Math.max(p, Di[i]);
    const v = n * H_CTRL ** 3 * 1000; if (v >= SOGLIA_MM3) out[a + '/' + b] = [+v.toFixed(2), +(p * 10).toFixed(2)]; }
  return out; }
const vicinoA = n => { const R = riquadro(REAL(n).pos); return [0, 1, 2].every(k => R.lo[k] < RHI[k] && RLO[k] < R.hi[k]); };
const ALTRI_V = ALTRI.filter(vicinoA), TUBI_V = TUBI.filter(vicinoA);
const PRIMA = { muscoli: controllo(MUSC, TUBI_V), altri: controllo(ALTRI_V, TUBI_V) };
const VOL0 = Object.fromEntries(MUSC.map(mu => [mu, volume(REAL(mu).pos, REAL(mu).idx)]));

const dminOssa = () => { griglia(RLO, RHI, HF, 0.3); const F = congela(campo(OSSA).F), o = [0, 0, 0, 0]; let d = 1;
  for (const n of TUBI_V) { const R = REAL(n); for (let i = 0; i < R.nv; i++) { const p = pt(R.pos, i); if (dentro(p)) d = Math.min(d, sg(F, ...p, o)[0]); } } return d; };
const DMIN0 = dminOssa();
const SPOST = {}, APPIATTITI = {};
// tubi ancora dentro clavicola e prima costa (spazio costoclavicolare più stretto della vena): appiattiti contro l'osso, spinta liscia
// k·ln(1 + e^((GIOCO_OSSO − d)/k)) lungo la normale dell'osso, ripetuta; dipende solo dalla posizione, quindi è uguale nelle mesh che si sovrappongono
const appiattisci = P => { const o = [0, 0, 0, 0], mossi = new Uint8Array(P.length / 3);
  for (let i = 0; i < P.length / 3; i++) { if (!dentro(pt(P, i))) continue;
    for (let it = 0; it < 4; it++) { sg(FB, ...pt(P, i), o); const x = (GIOCO_OSSO - o[0]) / APPIATTI; if (x < -4) break; const sp = APPIATTI * Math.log1p(Math.exp(x)), g = nz([o[1], o[2], o[3]]);
      for (let k = 0; k < 3; k++) P[3 * i + k] += sp * g[k]; if (sp > 1e-4) mossi[i] = 1; } }
  return mossi; };
for (const n of TUBI_V) { const R = REAL(n), at = attrs(n), { P, D } = muovi(R.pos, campi.tubi), mossi = appiattisci(P);
  let nrm = ruotaNormali(R.pos, NRM[n], campi.tubi); if (mossi.some(x => x)) { const NL = normaliLisce(P, R.idx, null); nrm ||= NL; for (let i = 0; i < mossi.length; i++) if (mossi[i]) for (let k = 0; k < 3; k++) nrm[3 * i + k] = NL[3 * i + k]; }
  for (let i = 0; i < D.length; i++) D[i] = P[i] - R.pos[i];
  setMesh(n, { pos: P, idx: R.idx, tag: at.tag, fdir: at.fdir, nrm }); SPOST[n] = D; APPIATTITI[n] = mossi.reduce((s, x) => s + x, 0); }
for (const mu of MUSC) { const R = REAL(mu), B = BASE[mu], { P, D } = muovi(R.pos, campi[mu], true), nv = R.nv;
  const NL = normaliLisce(P, R.idx, B.tag), N0 = NRM[mu], nrm = new Int8Array(nv * 3), P0 = N0 && realDaRevisione(PARTENZA_MUSC, mu, FILE_REPO).pos;
  for (let i = 0; i < nv; i++) { const mosso = !N0 || len(sub(pt(P, i), pt(P0, i))) > 0.001; for (let k = 0; k < 3; k++) nrm[3 * i + k] = mosso ? NL[3 * i + k] : N0[3 * i + k]; }
  setMesh(mu, { pos: P, idx: R.idx, tag: B.tag, fdir: B.fdir, nrm }); SPOST[mu] = D; }
const DOPO = { muscoli: controllo(MUSC, TUBI_V), altri: controllo(ALTRI_V, TUBI_V) };

// distanza minima dei tubi dalle ossa (nella regione), spostamenti
const dmin = dminOssa();
const stat = D => { const l = []; for (let i = 0; i < D.length / 3; i++) { const x = len(pt(D, i)); if (x > 1e-5) l.push(x); } return l.length ? [+(quantile(l, 0.99) * 10).toFixed(2), +(Math.max(...l) * 10).toFixed(2)] : [0, 0]; };
log('spostamenti (mm, 99 % e massimo):', JSON.stringify(Object.fromEntries(Object.entries(SPOST).map(([n, D]) => [n, stat(D)]))));
log('volume dei muscoli (cm³):', JSON.stringify(Object.fromEntries(MUSC.map(mu => [mu, [+VOL0[mu].toFixed(2), +volume(REAL(mu).pos, REAL(mu).idx).toFixed(2)]]))));
log('tubi: vertici appiattiti contro l\'osso', JSON.stringify(APPIATTITI)); log('tubi: distanza minima dalle ossa', (DMIN0 * 10).toFixed(2), '→', (dmin * 10).toFixed(2), 'mm');
log('compenetrazioni [mm³, mm] prima', JSON.stringify(PRIMA)); log('compenetrazioni [mm³, mm] dopo', JSON.stringify(DOPO));
if (!PROVA) saveFile(repack());
