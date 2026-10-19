/* Vasi e nervi della spalla (modelli/spalla-3d.html): arteria e vena succlavie e ascellari (un solo vaso per lato, diviso in due strutture al margine
   laterale della prima costa), plesso brachiale (radici C5–T1, tronchi, divisioni e fasci) e nervi soprascapolare, ascellare, muscolocutaneo, radiale,
   mediano (con le due radici) e ulnare.

   Uso (dalla cartella del progetto):
     node strumenti/vasi-nervi-spalla.mjs                  → riscrive le mesh nel file del modello
     node strumenti/vasi-nervi-spalla.mjs --prova=f.json   → non tocca il modello: scrive i controlli in un JSON
     MODELLO=/tmp/copia.html node strumenti/vasi-nervi-spalla.mjs   → lavora su una copia
     SOLO_NERVI=1 node strumenti/vasi-nervi-spalla.mjs   → riscrive solo vasi e nervi e lascia i muscoli del file (per una correzione di un nervo che
                                                           non tocca i muscoli: non serve rilanciare la coda della catena; verificare le compenetrazioni)
   Va lanciato dopo `legamenti-spalla.mjs` (ossa, cartilagini, labbro, capsula e legamenti incorporati sono ostacoli) e prima di `muscoli-spalla.mjs`.
   Riparte dalla revisione git `PARTENZA` (bozza BodyParts3D) per le guide della succlavia e per i muscoli, che riporta come erano prima dei canali:
   si può rilanciare con lo stesso risultato, poi va rilanciato `muscoli-spalla.mjs`.

   Metodo:
     1. Percorsi: guide (cm, sistema del modello: x laterale→mediale, y basso→alto, z dietro→avanti) → Catmull-Rom a 1 mm → rilassamento (220 passate):
        ostacoli rigidi (ossa, cartilagini, labbro, capsula, legamenti: campo di distanza esatto, l'asse resta a ≥ raggio + 0,3 mm), muscoli come ostacolo
        morbido (spinta parziale verso l'esterno, così il percorso cerca i piani tra i muscoli; peso `molle` per tratto: 0 dove il nervo entra davvero nel
        muscolo, per esempio il muscolocutaneo nel coracobrachiale), repulsione esplicita dagli altri vasi e nervi già fatti (esclusi quelli con cui il
        nervo si unisce), richiamo debole alla guida e levigatura; poi levigatura adattiva fino al raggio di curvatura minimo `Rmin`.
     2. Vasi (succlavia → ascellare → brachiale): un solo percorso per l'arteria e uno per la vena, dall'estremo mediale della succlavia BodyParts3D al
        ritaglio (y = −14), con calibro che cala in modo continuo (profilo per punti di riferimento con raccordi smoothstep, tabella `CAL`). Il tubo è diviso
        al margine laterale della prima costa: succlavia e ascellare si sovrappongono per 3 mm al 98,5 % del raggio, quindi non c'è gradino né bordo.
     3. Plesso: le corde sono definite rispetto all'arteria (fascio laterale di lato e in avanti, posteriore dietro, mediale medialmente), tronchi e radici
        sopra la prima costa dietro la succlavia, divisioni dai tronchi ai fasci; i nervi terminali nascono dall'estremo del fascio con una tangente che
        prosegue quella del fascio; il mediano nasce dall'unione di radice laterale e mediale davanti all'arteria.
     4. Superficie dei nervi: campo implicito (distanza da tubi a raggio variabile) con unione morbida (smooth-min polinomiale, k = `KRAC`) solo tra tratti
        che si uniscono: le biforcazioni e le confluenze hanno un raccordo continuo, non tubi accostati; tratti vicini ma non uniti restano separati.
        Surface nets su griglia locale (passo `HN`), Taubin, riduzione a quadriche. Ogni struttura (plesso, ogni nervo) è una mesh: vicino a ogni
        giunzione contiene anche i primi `DGIUN` cm dei tratti di altre strutture, al 97 % del raggio, così il raccordo è identico nelle due mesh.
     5. Canali nei muscoli (della revisione `PARTENZA`): i vertici entro raggio + 0,4 mm da un asse sono spinti radialmente fuori dal tubo.
     6. Controlli (stampati): distanza minima dagli ostacoli rigidi, profondità nei muscoli prima dei canali, raggio di curvatura minimo, calibro agli estremi.
   Calibri (diametri): succlavia 8 mm → ascellare 6,5 mm → brachiale 4,4 mm (ascellare ~6–7 mm: "Caliber and fitness of the axillary artery as a
   conduit for large-bore cardiovascular procedures", PubMed 29130612; brachiale ~4 mm: valore usuale in eco); vena 8,4 → 5,4 mm, stretta a 7,4 mm tra
   clavicola e prima costa (valori indicativi, nessuna fonte consultata); nervi da aree di sezione ecografiche (Cartwright et al., "Cross-sectional area
   reference values for nerve ultrasonography", Muscle Nerve 2008: mediano ~9 mm² nel braccio, ulnare e radiale ~7 mm²) convertite in raggio di sezione
   circolare; radici, tronchi e fasci stimati (3–4,5 mm).
   Percorsi su reperi dell'atlante (Gray's Anatomy; Netter): vanno verificati a vista dopo ogni modifica di ossa o muscoli. Non incluse: collaterali
   (toracoacromiale, toracica laterale, circonflesse, sottoscapolare), nervi pettorali, toracodorsale, toracico lungo, cutanei mediali, cefalica e basilica. */
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.MODELLO ||= resolve(ROOT, 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, setPos, saveFile, repack, log, clamp, griglia, setGriglia, esatta, sfoca, sdf, unione, sample, grad, taubin } = G;
const { riduci, compatta } = await import('./lib-bp3d.mjs');

const PARTENZA = '59b7798';               // bozza: muscoli e vasi BodyParts3D intatti
const FILE_REPO = 'modelli/spalla-3d.html';
const TAGLIO = -14;
const KRAC = 0.12, DGIUN = 1.6, HN = 0.035;   // raccordo dell'unione morbida (cm), estensione dei tratti altrui nelle giunzioni, passo della griglia dei nervi

const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nor = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a, b, t) => a + (b - a) * t, ss = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

const OSSA = ['scapola', 'clavicola', 'omero', 'costa1', 'costa2', 'costa3', 'costa4', 'costa5', 'manubrio', 'corpo_sterno', 'cc1', 'cc2'];
const FISSI = ['cart_omero', 'cart_glen', 'labbro', 'caps', 'cc_conoide', 'cc_trapezoide', 'cal', 'ac_leg', 'sc_leg', 'coraco_om', 'sghl', 'mghl', 'ighl_a', 'ighl_p'];
const MUSCOLI = ['supra', 'infra', 'tmin', 'subs', 'delt_cl', 'delt_ac', 'delt_sp', 'tmaj', 'pec_cl', 'pec_st', 'pec_ab', 'pmin', 'succl', 'trap_d', 'trap_t', 'trap_a', 'lat', 'romb_mag', 'romb_min', 'elev', 'dent', 'omoi', 'bic_lungo', 'bic_breve', 'coracobr', 'tri_lungo', 'tri_lat', 'tri_med'];

/* ---- mesh da una revisione git (lettura una volta per revisione) ---- */
const REV = {};
const daRevisione = (rev, nome) => {
  if (!REV[rev]) { const h = execFileSync('git', ['show', `${rev}:${FILE_REPO}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8');
    const man = JSON.parse(h.match(G.reManRe)[2]); let b = Buffer.from(h.match(G.reDatRe)[2].trim(), 'base64'); if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b); REV[rev] = { man, b }; }
  const { man, b } = REV[rev], m = man.meshes.findLast(x => x.n === nome); if (!m) return null;
  const q = new Uint16Array(b.buffer.slice(b.byteOffset + m.p, b.byteOffset + m.p + m.nv * 6)), pos = new Float32Array(m.nv * 3);
  for (let i = 0; i < m.nv * 3; i++) { const k = i % 3; pos[i] = man.min[k] + q[i] / 65535 * (man.max[k] - man.min[k]); }
  return pos;
};

/* ---- 0. muscoli della bozza (prima dei canali): i canali si scavano da capo; `muscoli-spalla.mjs`, dopo, toglie le altre compenetrazioni ---- */
const BASE = {};
// (anche la topologia: `muscoli-spalla.mjs` raffina le mesh vicino agli ostacoli e le riscrive con setMesh; qui si riparte sempre da quelle di PARTENZA)
for (const nome of MUSCOLI) { const R0 = G.realDaRevisione(PARTENZA, nome, FILE_REPO); BASE[nome] = R0.pos; setMesh(nome, { pos: R0.pos, idx: R0.idx, tag: R0.tag, fdir: R0.fdir }); }

/* ---- punti di riferimento ---- */
const V = n => { const m = REAL(n), o = []; for (let i = 0; i < m.pos.length; i += 3) o.push([m.pos[i], m.pos[i + 1], m.pos[i + 2]]); return o; };
// asse della succlavia BodyParts3D (revisione PARTENZA): baricentro delle sezioni a x costante, dal mediale al laterale
const asseBP = (nome, x0, x1) => { const p = daRevisione(PARTENZA, nome), out = [];
  for (let x = x0; x >= x1 - 1e-9; x -= 0.5) { const s = []; for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - x) < 0.25) s.push([p[i + 1], p[i + 2]]);
    if (s.length >= 6) out.push([x, s.reduce((a, q) => a + q[0], 0) / s.length, s.reduce((a, q) => a + q[1], 0) / s.length]); }
  return out.map((q, i) => i === 0 || i === out.length - 1 ? q : [q[0], (out[i - 1][1] + 2 * q[1] + out[i + 1][1]) / 4, (out[i - 1][2] + 2 * q[2] + out[i + 1][2]) / 4]); };
const sc = V('scapola');
// incisura soprascapolare: punto più basso del margine superiore della scapola tra la base del coracoide e l'angolo superiore
// (cima dell'osso in strisce perpendicolari al margine, nel piano x–z)
const notch = (() => { const A = [4.6, -1.0], B = [8.0, -4.2], L = Math.hypot(B[0] - A[0], B[1] - A[1]), t = [(B[0] - A[0]) / L, (B[1] - A[1]) / L]; let best = null;
  for (let s = 0.6; s <= L - 0.6; s += 0.1) { const c = [A[0] + t[0] * s, A[1] + t[1] * s]; let top = null;
    for (const p of sc) { const v = [p[0] - c[0], p[2] - c[1]]; if (Math.abs(v[0] * t[0] + v[1] * t[1]) < 0.08 && Math.abs(-v[0] * t[1] + v[1] * t[0]) < 1.2 && (!top || p[1] > top[1])) top = p; }
    if (top && (!best || top[1] < best[1])) best = top; }
  return best; })();
log('incisura soprascapolare', notch.map(x => x.toFixed(2)).join(','));
const c1 = V('costa1'), X_COSTA = Math.min(...c1.map(p => p[0]));                    // margine laterale della prima costa: succlavia → ascellare
log('margine laterale della prima costa: x =', X_COSTA.toFixed(2));

/* ---- curve ---- */
const catmull = (P, step = 0.1) => { const Q = [P[0], ...P, P[P.length - 1]], out = []; for (let k = 0; k < P.length - 1; k++) { const [p0, p1, p2, p3] = [Q[k], Q[k + 1], Q[k + 2], Q[k + 3]], n = Math.max(2, Math.ceil(len(sub(p2, p1)) / step));
    for (let i = 0; i < n; i++) { const t = i / n; out.push([0, 1, 2].map(a => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t * t + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t * t * t))); } } out.push(P[P.length - 1]); return out; };
const ricampiona = (P, step) => { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + len(sub(P[i], P[i - 1]))); const n = Math.max(2, Math.round(L[L.length - 1] / step)), o = []; for (let k = 0; k <= n; k++) { const x = L[L.length - 1] * k / n; let i = 1; while (i < L.length - 1 && L[i] < x) i++; o.push(add(P[i - 1], sub(P[i], P[i - 1]), clamp((x - L[i - 1]) / ((L[i] - L[i - 1]) || 1), 0, 1))); } return o; };
const lunghezze = P => { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + len(sub(P[i], P[i - 1]))); return L; };
const curvature = (P, passo = 5) => { const o = []; for (let k = passo; k < P.length - passo; k += 2) { const a = P[k - passo], b = P[k], c = P[k + passo], ab = len(sub(b, a)), bc = len(sub(c, b)), ac = len(sub(c, a)), s = (ab + bc + ac) / 2, A = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ac))); o.push([A > 1e-9 ? ab * bc * ac / (4 * A) : 1e9, k]); } return o; };
const curvaturaMin = (P, da = 0) => Math.min(1e9, ...curvature(P).filter(([, k]) => k >= da).map(([r]) => r));
const tangente = (P, k) => nor(sub(P[Math.min(P.length - 1, k + 2)], P[Math.max(0, k - 2)]));
// profilo per punti di riferimento [[s, r], …] (s crescente, cm): raccordi smoothstep, quindi calibro continuo e senza spigoli
const profilo = (L, anc) => L.map(s => { if (s <= anc[0][0]) return anc[0][1]; for (let i = 1; i < anc.length; i++) if (s <= anc[i][0]) return lerp(anc[i - 1][1], anc[i][1], ss((s - anc[i - 1][0]) / (anc[i][0] - anc[i - 1][0]))); return anc[anc.length - 1][1]; });

/* ---- campi degli ostacoli (griglia comune) ---- */
const RIQ = { lo: [-6.2, -14.6, -4.6], hi: [16.4, 11.4, 7.6] };
griglia(RIQ.lo, RIQ.hi, 0.05, 0);
log('griglia', G.NX, G.NY, G.NZ, (G.N / 1e6).toFixed(1), 'M voxel');
const campo = nomi => esatta(sfoca(sdf(unione(nomi)).F, 1), nomi, 0.1);
const FH = campo([...OSSA, ...FISSI]); log('campo degli ostacoli rigidi');
const FM = campo(MUSCOLI); log('campo dei muscoli');

/* ---- parete toracica: i vasi e il plesso sotto la clavicola restano lateralmente alle coste 2–5 e agli spazi intercostali (con il dentato anteriore) ----
   per ogni colonna (y, z) a passo PW: x della faccia laterale delle coste, interpolata tra una costa e l'altra; sopra la seconda costa prosegue per 1,5 cm
   salendo medialmente (pendenza 1). Vale solo lateralmente al margine della prima costa (x < 9,3): sopra la prima costa radici e tronchi sono liberi. */
const PW = 0.1, PY0 = RIQ.lo[1], PZ0 = RIQ.lo[2], PNY = Math.round((RIQ.hi[1] - PY0) / PW) + 1, PNZ = Math.round((RIQ.hi[2] - PZ0) / PW) + 1, SERR = 0.2;
const PARETE = (() => { const W = new Float32Array(PNY * PNZ).fill(NaN);
  for (const c of ['costa2', 'costa3', 'costa4', 'costa5']) { const m = REAL(c).pos; for (let i = 0; i < m.length; i += 3) { const j = Math.round((m[i + 1] - PY0) / PW), k = Math.round((m[i + 2] - PZ0) / PW);
    if (j >= 0 && j < PNY && k >= 0 && k < PNZ && !(W[j * PNZ + k] <= m[i])) W[j * PNZ + k] = m[i]; } }
  const out = W.slice();
  for (let k = 0; k < PNZ; k++) { const occ = []; for (let j = 0; j < PNY; j++) if (!isNaN(W[j * PNZ + k])) occ.push(j); if (!occ.length) continue;
    for (let q = 0; q < occ.length - 1; q++) { const j0 = occ[q], j1 = occ[q + 1]; if (j1 - j0 < 2 || (j1 - j0) * PW > 3) continue;
      for (let j = j0 + 1; j < j1; j++) out[j * PNZ + k] = lerp(W[j0 * PNZ + k], W[j1 * PNZ + k], (j - j0) / (j1 - j0)); }
    const jt = occ[occ.length - 1]; for (let j = jt + 1; j < PNY && (j - jt) * PW <= 1.5; j++) out[j * PNZ + k] = W[jt * PNZ + k] + (j - jt) * PW; }
  const sm = out.slice(); for (let j = 1; j < PNY - 1; j++) for (let k = 1; k < PNZ - 1; k++) { let a = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) { const v = out[(j + dj) * PNZ + k + dk]; if (!isNaN(v)) { a += v; n++; } } if (n >= 5 && !isNaN(out[j * PNZ + k])) sm[j * PNZ + k] = a / n; }
  return sm; })();
const parete = p => { if (p[0] > 9.3) return NaN; const j = Math.round((p[1] - PY0) / PW), k = Math.round((p[2] - PZ0) / PW); return j >= 0 && j < PNY && k >= 0 && k < PNZ ? PARETE[j * PNZ + k] : NaN; };
const aParete = (p, r) => { const w = parete(p); return !isNaN(w) && p[0] > w - r - SERR ? [w - r - SERR, p[1], p[2]] : p; };
log('parete toracica');

/* ---- rilassamento di un percorso ----
   o: { r(k) raggio, fissi(k) bool, molle(u) peso dei muscoli (0–1), altri: [{P, r}] tubi da cui stare lontani, Rmin, ancora, margine (cm, oltre il raggio, dagli ostacoli rigidi), durezza (frazione della spinta), solo_costoclavicolare (margine e durezza ridotti solo per x ≥ 8,4; pieni da x ≤ 7,6), perno(k) richiamo locale alla guida (0–1, attorno ai punti di passaggio obbligati), FD campo dei muscoli che per questo tratto sono ostacoli rigidi } */
function rilassa(P, o) {
  P = P.map(p => p.slice()); const mg = o.margine ?? 0.03, duro = o.durezza ?? 1, n = P.length, P0 = P.map(p => p.slice()), fisso = k => o.fissi(k);
  const altri = (o.altri || []).map(a => ({ P: a.P.filter((_, i) => i % 2 === 0), r: a.r.filter((_, i) => i % 2 === 0) }));
  const passa = (w, ancora, molle) => {
    for (let k = 0; k < n; k++) { if (fisso(k)) continue; const u = k / (n - 1), rr = o.r[k];
      for (const a of altri) { let bd = 1e9, bi = -1; for (let i = 0; i < a.P.length; i++) { const q = a.P[i]; if (Math.abs(q[1] - P[k][1]) > 1.2) continue; const d = len(sub(P[k], q)); if (d < bd) { bd = d; bi = i; } }
        if (bi >= 0) { const m = rr + a.r[bi] + 0.04; if (bd < m) P[k] = add(P[k], nor(sub(P[k], a.P[bi])), (m - bd) * 0.7); } }
      const wm = molle * (o.molle ? o.molle(u) : 1);
      if (wm > 0) { const dm = sample(FM, ...P[k]); if (dm < rr + 0.02) P[k] = add(P[k], nor(grad(FM, P[k])), (rr + 0.02 - dm) * 0.15 * wm); }
      const lat = o.solo_costoclavicolare ? ss((8.4 - P[k][0]) / 0.8) : 0, d = sample(FH, ...P[k]), m = rr + lerp(mg, 0.03, lat); if (d < m) P[k] = add(P[k], nor(grad(FH, P[k])), (m - d) * lerp(duro, 1, lat));
      else P[k] = add(P[k], sub(P0[k], P[k]), Math.max(ancora, o.perno ? o.perno(k) : 0));
      P[k] = aParete(P[k], rr);
      if (o.FD) { const d2 = sample(o.FD, ...P[k]), m2 = rr + 0.05; if (d2 < m2) P[k] = add(P[k], nor(grad(o.FD, P[k])), m2 - d2); }   // muscoli trattati come ostacoli rigidi per questo tratto
    }
    P = P.map((p, k) => fisso(k) || k === 0 || k === n - 1 ? p : mul(add(add(P[k - 1], P[k + 1]), p, w), 1 / (2 + w)));
  };
  for (let it = 0; it < 220; it++) passa(2, o.ancora ?? 0.004, 1);
  for (let giro = 0; giro < (o.giri ?? 25) && curvaturaMin(P, 6) < (o.Rmin || 1.5); giro++) for (let it = 0; it < 80; it++) passa(0.4, 0.0005, 0);   // levigatura forte: solo ostacoli rigidi e altri tubi (i muscoli si scavano dopo)
  if (duro === 1) for (let it = 0; it < 6; it++) for (let k = 0; k < n; k++) { if (fisso(k)) continue; const d = sample(FH, ...P[k]), m = o.r[k] + mg; if (d < m) P[k] = add(P[k], nor(grad(FH, P[k])), m - d); P[k] = aParete(P[k], o.r[k]); if (o.FD) { const d2 = sample(o.FD, ...P[k]), m2 = o.r[k] + 0.05; if (d2 < m2) P[k] = add(P[k], nor(grad(o.FD, P[k])), m2 - d2); } }   // proiezione finale sugli ostacoli rigidi
  return P;
}
const misura = (P, r, da = 0) => { let dH = 1e9, dM = 1e9, kH = 0; for (let k = da; k < P.length; k++) { const d = sample(FH, ...P[k]) - r[k]; if (d < dH) { dH = d; kH = k; } dM = Math.min(dM, sample(FM, ...P[k]) - r[k]); }
  let dP = 1e9; for (let k = da; k < P.length; k++) { const w = parete(P[k]); if (!isNaN(w)) dP = Math.min(dP, w - P[k][0] - r[k]); }
  return { distanza_min_ostacoli_rigidi_mm: +(dH * 10).toFixed(2), distanza_parete_toracica_mm: dP < 1e8 ? +(dP * 10).toFixed(2) : null, dove: P[kH].map(x => +x.toFixed(1)), profondita_max_nei_muscoli_mm: +(Math.max(0, -dM) * 10).toFixed(2), raggio_curvatura_min_cm: +curvaturaMin(P, da + 3).toFixed(2), curva_dove: (() => { const c = curvature(P).filter(([, k]) => k >= da + 3); if (!c.length) return null; const m = c.reduce((a, b) => b[0] < a[0] ? b : a); return P[m[1]].map(x => +x.toFixed(1)); })() }; };
const CHECK = {};

/* ---- 1. arteria e vena: succlavia → ascellare → brachiale ---- */
const AX = [4.6, -0.6, 2.5];      // dietro il piccolo pettorale, davanti al sottoscapolare (seconda porzione dell'ascellare)
const guidaA = [...asseBP('a_succ', 14.5, 8.5).filter((_, i) => i % 2 === 0), [7.4, 1.8, 2.95], [6.0, 0.75, 2.8], AX, [3.0, -2.3, 2.1], [2.3, -4.6, 1.2], [1.6, -7.2, 0.75], [0.8, -10.2, 0.2], [0.1, -12.4, -0.15], [-0.4, TAGLIO, -0.35]];
const guidaV = [...asseBP('v_succ', 14.0, 8.0).filter((_, i) => i % 2 === 0), [7.2, 1.1, 3.6], [5.6, 0.2, 3.4], add(AX, [0.55, -0.15, 0.55]), [3.7, -2.4, 2.6], [3.0, -4.7, 1.7], [2.3, -7.2, 1.3], [1.5, -10.2, 0.75], [0.8, -12.4, 0.45], [0.4, TAGLIO, 0.3]];
const sVicino = (P, L, q) => { let b = 0; for (let k = 1; k < P.length; k++) if (len(sub(P[k], q)) < len(sub(P[b], q))) b = k; return L[b]; };
const sY = (P, L, y) => { for (let k = 1; k < P.length; k++) if (P[k][1] <= y) return L[k]; return L[L.length - 1]; };
const sX = (P, L, x) => { for (let k = 1; k < P.length; k++) if (P[k][0] <= x) return L[k]; return L[L.length - 1]; };
function vaso(guida, cal, altri) {
  let P = ricampiona(catmull(guida), 0.1); let L = lunghezze(P);
  const anc = (P, L) => [[0, cal[0]], [sX(P, L, X_COSTA), cal[1]], [sVicino(P, L, AX), cal[2]], [sY(P, L, -7.6), cal[3]], [L[L.length - 1], cal[4]]];
  let r = profilo(L, anc(P, L)); const n = P.length;
  P = rilassa(P, { r, fissi: k => k < 4, molle: u => 1, altri, Rmin: 3.0, margine: -0.12, durezza: 0.12, solo_costoclavicolare: true });   // tra clavicola e prima costa lo spazio è più stretto dei due vasi BodyParts3D: si accetta 1–2 mm di appoggio nei solchi ossei, non un gomito; lateralmente (da x 8,4 a x 7,6, con raccordo: seconda costa, coracoide, omero) gli ostacoli rigidi valgono per intero P[n - 1][1] = TAGLIO;
  P = ricampiona(P, 0.1); L = lunghezze(P); r = profilo(L, anc(P, L));
  return { P, r, L, sCosta: sX(P, L, X_COSTA), sPM: sVicino(P, L, AX), sTM: sY(P, L, -7.6) };
}
// calibri (raggi, cm): origine, margine della prima costa, dietro il piccolo pettorale, margine inferiore del grande rotondo, ritaglio
const CAL = { art: [0.40, 0.37, 0.325, 0.25, 0.22], ven: [0.42, 0.37, 0.35, 0.31, 0.27] };
const A = vaso(guidaA, CAL.art, []);
const Vn = vaso(guidaV, CAL.ven, [A]);
CHECK.arteria = { ...misura(A.P, A.r, 4), lunghezza_cm: +A.L[A.L.length - 1].toFixed(1), diametro_mm: CAL.art.map(x => +(x * 20).toFixed(1)) };
CHECK.vena = { ...misura(Vn.P, Vn.r, 4), lunghezza_cm: +Vn.L[Vn.L.length - 1].toFixed(1), diametro_mm: CAL.ven.map(x => +(x * 20).toFixed(1)) };
log('arteria', JSON.stringify(CHECK.arteria)); log('vena', JSON.stringify(CHECK.vena));

// riferimento locale lungo l'arteria: laterale (verso l'omero), anteriore, posteriore, mediale
const art = s => { let k = 0; while (k < A.L.length - 1 && A.L[k] < s) k++; const t = tangente(A.P, k), lat = nor(sub([-1, 0, 0], mul(t, -t[0]))), zz = sub(sub([0, 0, 1], mul(t, t[2])), mul(lat, lat[2]));
  return { p: A.P[k], r: A.r[k], t, lat, ant: nor(zz), post: mul(nor(zz), -1), med: mul(lat, -1) }; };
const rel = (s, off, rn) => { const f = art(s), o = f.r + rn + 0.14; return add(f.p, Object.entries(off).reduce((v, [d, w]) => add(v, f[d], w * o), [0, 0, 0])); };

/* ---- 2. nervi: tratti (catene) con le loro giunzioni ----
   ogni tratto: id, mesh (`m`), raggi [inizio, fine], `ini` (raggio d'inizio dei tratti formati per unione), guide (punti o funzione valutata quando i
   tratti di cui ha bisogno sono pronti), `da` = tratto madre (e punto `u` lungo di esso; senza `u` l'estremo): il tratto ne prosegue la tangente per 6 mm;
   `fine: 'taglio'` = arriva al ritaglio. Tronchi, radici, divisioni e radici del mediano finiscono dentro il tratto in cui confluiscono (`entra`, `div`). */
const sC0 = sX(A.P, A.L, 7.0), sCF = A.sPM + 2.4;             // fasci: da sotto la clavicola a oltre il margine inferiore del piccolo pettorale
const fascio = (off, rn, s0 = sC0) => { const out = []; for (let s = s0; s <= sCF + 1e-6; s += (sCF - s0) / 6) out.push(rel(s, off, rn)); return out; };
const FL = fascio({ lat: 0.85, ant: 0.5 }, 0.2), FP = fascio({ post: 1 }, 0.22), FMd = fascio({ med: 0.4, post: 0.95 }, 0.19, sC0 + 0.9);
// origine del tronco superiore (C5 + C6), medio (C7), inferiore (C8 + T1): sopra la prima costa, dietro e sopra la succlavia
const UT0 = [12.4, 7.0, 1.5], MT0 = [12.9, 6.2, 1.25], LT0 = [12.6, 5.5, 1.2];
const UTs = [9.4, 4.6, 2.5], MTs = [9.5, 4.1, 2.3], LTs = [9.6, 3.7, 2.1];   // fine dei tronchi (divisioni anteriore e posteriore), dietro la clavicola
const sM = sCF + 3.2, M0 = rel(sM, { ant: 1, lat: 0.25 }, 0.17);        // unione delle radici del mediano, davanti all'arteria
const RMIN_N = +(process.env.RMIN_N || 3.0), RMIN_P = +(process.env.RMIN_P || 1.6);   // raggio di curvatura minimo (cm) di nervi e plesso
const TRATTI = [
  // fasci (definiti rispetto all'arteria)
  { id: 'fascio_lat', m: 'plesso', r: [0.2, 0.2], ini: 0.15, guide: FL },
  { id: 'fascio_post', m: 'plesso', r: [0.22, 0.22], ini: 0.15, guide: FP },
  { id: 'fascio_med', m: 'plesso', r: [0.19, 0.19], ini: 0.17, guide: FMd },
  // tronchi
  { id: 'tronco_sup', m: 'plesso', r: [0.22, 0.22], ini: 0.17, guide: [UT0, [11.0, 5.9, 1.9], UTs] },
  { id: 'tronco_med', m: 'plesso', r: [0.19, 0.19], guide: [MT0, [11.2, 5.1, 1.75], MTs] },
  { id: 'tronco_inf', m: 'plesso', r: [0.21, 0.21], ini: 0.18, guide: [LT0, [11.2, 4.65, 1.75], LTs] },
  // radici (rami anteriori dei nervi spinali, tagliati medialmente tra gli scaleni)
  { id: 'C5', m: 'plesso', r: [0.15, 0.15], guide: () => entra([[13.5, 8.4, 1.25]], 'tronco_sup') },
  { id: 'C6', m: 'plesso', r: [0.17, 0.17], guide: () => entra([[13.9, 7.7, 1.0]], 'tronco_sup') },
  { id: 'C7', m: 'plesso', r: [0.19, 0.19], guide: () => entra([[14.2, 6.8, 0.95]], 'tronco_med') },
  { id: 'C8', m: 'plesso', r: [0.18, 0.18], guide: () => entra([[14.1, 6.1, 1.05]], 'tronco_inf') },
  { id: 'T1', m: 'plesso', r: [0.14, 0.14], guide: () => entra([[13.9, 5.2, 1.4]], 'tronco_inf') },
  // divisioni: anteriori dei tronchi superiore e medio → fascio laterale; posteriori → fascio posteriore; anteriore dell'inferiore → fascio mediale
  { id: 'div_ant_sup', m: 'plesso', r: [0.17, 0.17], guide: () => div('tronco_sup', 'fascio_lat', [0, 0, 0]) },
  { id: 'div_ant_med', m: 'plesso', r: [0.14, 0.14], guide: () => div('tronco_med', 'fascio_lat', [0, 0, 0]) },
  { id: 'div_post_sup', m: 'plesso', r: [0.15, 0.15], guide: () => div('tronco_sup', 'fascio_post', [0, 0, 0]) },
  { id: 'div_post_med', m: 'plesso', r: [0.13, 0.13], guide: () => div('tronco_med', 'fascio_post', [0, 0, 0]) },
  { id: 'div_post_inf', m: 'plesso', r: [0.11, 0.11], guide: () => div('tronco_inf', 'fascio_post', [0, 0, 0]) },
  { id: 'div_ant_inf', m: 'plesso', r: [0.19, 0.19], guide: () => div('tronco_inf', 'fascio_med', [-0.2, -0.2, 0.45], 0) },
  // nervi
  // soprascapolare: dal tronco superiore lateralmente e indietro, sopra il plesso e dietro la clavicola, nell'incisura (sotto il legamento trasverso superiore),
  // sul pavimento della fossa sopraspinata sotto il sovraspinato, attorno al margine laterale della spina (incisura spinoglenoidea), nella fossa sottospinata
  { id: 'n_soprascapolare', m: 'n_soprascapolare', r: [0.11, 0.08], da: { tratto: 'tronco_sup', u: 0.55 }, guide: [[8.9, 4.5, 0.6], [7.0, 2.6, -1.0], add(notch, [0.05, 0.3, -0.1]), [4.3, 0.8, -3.0], [3.5, 0.8, -3.0], [2.6, 0.55, -2.8], [2.1, -0.3, -2.65], [2.3, -1.3, -2.7], [3.0, -2.1, -2.95], [4.1, -2.7, -3.5]], molle: u => u < 0.25 ? 1 : 0, Rmin: 1.0, ancora: 0.03, perni: () => [add(notch, [0.05, 0.3, -0.1]), [2.1, -0.3, -2.65]] },   // segue l'osso: richiamo alla guida più forte; passa per l'incisura e l'incisura spinoglenoidea (punti fissi)
  { id: 'n_muscolocutaneo', m: 'n_muscolocutaneo', r: [0.12, 0.1], da: { tratto: 'fascio_lat' }, guide: [[2.2, -3.3, 2.0], [1.2, -5.2, 1.0], [-0.4, -8.0, 0.55], [-1.4, -11.0, 0.3], [-2.0, TAGLIO, 0.05]], molle: u => u > 0.12 && u < 0.45 ? 0 : 1 },
  { id: 'rad_lat_mediano', m: 'n_mediano', r: [0.15, 0.15], da: { tratto: 'fascio_lat' }, guide: () => entra([], 'n_mediano') },
  { id: 'rad_med_mediano', m: 'n_mediano', r: [0.13, 0.13], da: { tratto: 'fascio_med' }, guide: () => entra([], 'n_mediano') },
  { id: 'n_mediano', m: 'n_mediano', r: [0.18, 0.17], ini: 0.15, guide: [M0, ...[2.5, 5, 7.5].map(d => rel(sM + d, { ant: 1, lat: 0.2 }, 0.17)), rel(A.L[A.L.length - 1] - 0.3, { ant: 1, lat: 0.05 }, 0.17)], fine: 'taglio' },
  { id: 'n_ulnare', m: 'n_ulnare', r: [0.16, 0.15], da: { tratto: 'fascio_med' }, guide: [...[1.5, 4, 7].map(d => rel(sCF + d, { med: 0.75, post: 0.75 }, 0.15)), rel(A.L[A.L.length - 1] - 0.3, { med: 0.55, post: 0.95 }, 0.15)], fine: 'taglio' },
  { id: 'n_radiale', m: 'n_radiale', r: [0.18, 0.16], da: { tratto: 'fascio_post' }, guide: [rel(sCF + 2.0, { post: 1, med: 0.2 }, 0.18), [0.9, -6.9, -0.6], [-0.4, -8.8, -1.45], [-1.8, -11.2, -1.95], [-3.0, TAGLIO, -2.0]], molle: u => u < 0.5 ? 1 : 0, fine: 'taglio' },
  // ascellare: spazio quadrangolare (sotto il piccolo rotondo, sopra il grande rotondo, lateralmente al capo lungo del tricipite), poi attorno al collo
  // chirurgico sotto il deltoide, sopra e dietro l'origine del capo laterale del tricipite: questi muscoli sono ostacoli rigidi per il nervo
  { id: 'n_ascellare', m: 'n_ascellare', r: [0.14, 0.11], da: { tratto: 'fascio_post' }, guide: [[1.4, -3.0, -0.4], [0.4, -3.1, -1.2], [-1.2, -2.75, -1.9], [-2.8, -2.8, -1.5], [-3.4, -3.0, -0.2]], molle: u => u < 0.35 ? 1 : 0, duri: ['tri_lat', 'tri_lungo', 'tmaj', 'tmin'] },
];
const T = Object.fromEntries(TRATTI.map(t => [t.id, t]));
// un tratto che confluisce in un altro ne attraversa l'inizio e finisce 6 mm più avanti, lungo il suo asse (gli ultimi 8 mm restano fissi su quell'asse):
// nessuna estremità arrotondata sporge alla giunzione
const entra = (g, verso) => { const P = T[verso].P; return [...g, P[0], P[6]]; };
// divisione: dalla fine del tronco, dietro la clavicola (spostamento `dz` del punto medio), all'inizio del fascio
const div = (tronco, fascio, d, gancio = 0.45) => { const a = T[tronco].P[T[tronco].P.length - 1], b = T[fascio].P[0]; return [a, ...(gancio ? [add(a, tangente(T[tronco].P, T[tronco].P.length - 1), gancio)] : []), add(mul(add(a, b), 0.5), d), b, T[fascio].P[10]]; };   // parte proseguendo la tangente del tronco
// percorso: i fasci e i tratti con giunzione a monte partono dall'estremo (o dal punto u) del tratto madre, proseguendone la tangente
const fatti = [], ORDINE = ['fascio_lat', 'fascio_post', 'fascio_med', 'tronco_sup', 'tronco_med', 'tronco_inf', 'C5', 'C6', 'C7', 'C8', 'T1', 'div_ant_sup', 'div_ant_med', 'div_post_sup', 'div_post_med', 'div_post_inf', 'div_ant_inf', 'n_mediano', 'rad_lat_mediano', 'rad_med_mediano', 'n_muscolocutaneo', 'n_ulnare', 'n_radiale', 'n_ascellare', 'n_soprascapolare'];
const parenti = (a, b) => { const pa = a.P[0], pz = a.P[a.P.length - 1]; return [pa, pz].some(q => b.P.some(x => len(sub(x, q)) < 0.05)) || [b.P[0], b.P[b.P.length - 1]].some(q => a.P.some(x => len(sub(x, q)) < 0.05)); };
for (const id of ORDINE) {
  const t = T[id]; let g = (typeof t.guide === 'function' ? t.guide() : t.guide).slice(), nPre = 1;
  const fissaFine = typeof t.guide === 'function';   // radici, divisioni e radici del mediano finiscono dentro il tratto in cui confluiscono
  if (t.da) { const Pm = T[t.da.tratto].P, k = t.da.u !== undefined ? Math.round(t.da.u * (Pm.length - 1)) : Pm.length - 1, e = Pm[k], tg = tangente(Pm, k), coda = fissaFine ? g.splice(-2) : [];
    g = [e, add(e, tg, 0.6), ...g.filter(q => dot(sub(q, e), tg) > 0.9 || len(sub(q, e)) > 1.6), ...coda]; nPre = 4; }
  let P = ricampiona(catmull(g), 0.1); if (t.fine === 'taglio') P[P.length - 1][1] = TAGLIO;
  const perno = new Map(); for (const q of t.perni ? t.perni() : []) { let b = 0; P.forEach((x, k) => { if (len(sub(x, q)) < len(sub(P[b], q))) b = k; }); for (let d = -10; d <= 10; d++) perno.set(b + d, Math.max(perno.get(b + d) || 0, 0.3 * (1 - Math.abs(d) / 11))); log(id, 'perno', q.map(x => x.toFixed(2)).join(','), 'distanza dagli ostacoli rigidi', (sample(FH, ...q) * 10).toFixed(1), 'mm'); }
  const n = P.length, r = P.map((_, k) => lerp(t.r[0], t.r[1], k / (n - 1)) * (t.ini ? lerp(t.ini / t.r[0], 1, ss(k / 15)) : 1));   // `ini`: un tratto formato dall'unione di altri più sottili parte dal loro calibro e si allarga in 1,5 cm (niente estremità più grossa dei rami che vi entrano)
  const altri = [A, Vn, ...fatti.filter(f => !parenti({ P }, f))];
  const FD = t.duri ? campo(t.duri) : null;
  P = rilassa(P, { FD, r, perno: k => perno.get(k) || 0, fissi: k => (k < nPre && !id.startsWith('fascio')) || (fissaFine && k > n - 9) || (id.startsWith('C') || id === 'T1' ? k < 3 : false), molle: t.molle, altri, Rmin: t.Rmin ?? (id.startsWith('n_') || id.startsWith('rad') ? RMIN_N : RMIN_P), ancora: t.ancora, giri: 80 });
  if (t.fine === 'taglio') { P[n - 1][1] = TAGLIO; P.push(add(P[n - 1], tangente(P, n - 1), 0.3)); r.push(r[n - 1]); }   // prosegue oltre il ritaglio: il taglio della superficie è netto
  t.P = P; t.rr = r; fatti.push({ P, r, id });
  CHECK[id] = { ...misura(P.slice(0, n), r, nPre + 6), lunghezza_cm: +lunghezze(P)[n - 1].toFixed(1) };
  if (FD) CHECK[id].distanza_min_muscoli_rigidi_mm = +(Math.min(...P.slice(nPre + 6, n).map((q, k) => sample(FD, ...q) - r[k + nPre + 6])) * 10).toFixed(2);
  if (id === 'n_soprascapolare') CHECK[id].distanza_dal_fondo_incisura_cm = +Math.min(...P.map(q => len(sub(q, notch)))).toFixed(2);
  log(id, JSON.stringify(CHECK[id]));
}

/* ---- 3. superfici ---- */
const MESH = {};
// vasi: tubo a sezione circolare (riferimento di Bishop); `ovIni`/`ovFin` = tratto sovrapposto al vaso vicino (raggio al 98,5 %)
// riferimento di Bishop calcolato sull'intero vaso: le due parti (succlavia, ascellare) hanno gli stessi anelli nel tratto in comune
const cornici = P => { let e1 = nor(cross(nor(sub(P[1], P[0])), [0, 1, 0.3])); return P.map((_, k) => { const t = tangente(P, k); e1 = nor(sub(e1, mul(t, dot(e1, t)))); return { t, e1 }; }); };
function tubo(P, r, lati = 20, C = cornici(P)) {
  const n = P.length, pos = [], idx = [], fd = [];
  for (let k = 0; k < n; k++) { const { t, e1 } = C[k], e2 = cross(t, e1), tf = t.map(x => Math.round(x * 127));
    for (let s = 0; s < lati; s++) { const a = 2 * Math.PI * s / lati; pos.push(add(add(P[k], e1, Math.cos(a) * r[k]), e2, Math.sin(a) * r[k])); fd.push(tf); } }
  for (let k = 0; k < n - 1; k++) for (let s = 0; s < lati; s++) { const s2 = (s + 1) % lati, a = k * lati + s, b = k * lati + s2, c = (k + 1) * lati + s, d = (k + 1) * lati + s2; idx.push(a, c, b, b, c, d); }
  const c0 = pos.length; pos.push(P[0], P[n - 1]); fd.push(fd[0], fd[fd.length - 1]);
  for (let s = 0; s < lati; s++) { const s2 = (s + 1) % lati; idx.push(c0, s, s2, c0 + 1, (n - 1) * lati + s2, (n - 1) * lati + s); }
  const p = new Float32Array(pos.length * 3), f = new Int8Array(pos.length * 3); pos.forEach((v, i) => { p.set([v[0], Math.max(v[1], TAGLIO), v[2]], 3 * i); f.set(fd[i], 3 * i); });
  let vol = 0; for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2]; vol += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  return { pos: p, idx: Uint32Array.from(idx), tag: null, fdir: f };
}
const OV = 0.3;
for (const [v, nS, nA] of [[A, 'a_succ', 'a_asc'], [Vn, 'v_succ', 'v_asc']]) {
  const kS = v.L.findIndex(s => s >= v.sCosta), kSo = v.L.findIndex(s => s >= v.sCosta + OV), kAo = v.L.findIndex(s => s >= v.sCosta - OV);
  const rS = v.r.map((x, k) => k <= kS ? x : x * lerp(1, 0.985, ss((v.L[k] - v.sCosta) / OV))), rA = v.r.map((x, k) => k >= kS ? x : x * lerp(1, 0.985, ss((v.sCosta - v.L[k]) / OV)));
  const C = cornici(v.P); MESH[nS] = tubo(v.P.slice(0, kSo + 1), rS.slice(0, kSo + 1), 20, C.slice(0, kSo + 1)); MESH[nA] = tubo(v.P.slice(kAo), rA.slice(kAo), 20, C.slice(kAo));
  log(nS, '→', nA, 'divisi a', v.sCosta.toFixed(1), 'cm dall\'origine; raggio', v.r[kS].toFixed(3));
}

// nervi: campo implicito con unione morbida tra tratti che si toccano
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };
const PARENTI = {}; for (const a of TRATTI) PARENTI[a.id] = new Set(TRATTI.filter(b => b !== a && parenti({ P: a.P }, { P: b.P })).map(b => b.id));
const IDN = Object.fromEntries(TRATTI.map((t, i) => [t.id, i]));
function superficieNervi(mesh) {
  const propri = TRATTI.filter(t => t.m === mesh), pezzi = propri.map(t => ({ t, P: t.P, r: t.rr }));
  // giunzioni con tratti di altre mesh: i loro primi DGIUN cm (al 97 %) entrano nel campo, così il raccordo è lo stesso nelle due mesh
  for (const t of propri) for (const q of PARENTI[t.id]) { const o = T[q]; if (o.m === mesh) continue;
    const giun = [t.P[0], t.P[t.P.length - 1]].concat([o.P[0], o.P[o.P.length - 1]].filter(e => t.P.some(x => len(sub(x, e)) < 0.05)));
    const sel = o.P.map((x, k) => giun.some(g => len(sub(x, g)) < DGIUN) ? k : -1).filter(k => k >= 0); if (sel.length < 2) continue;
    const k0 = sel[0], k1 = sel[sel.length - 1]; pezzi.push({ t: o, P: o.P.slice(k0, k1 + 1), r: o.rr.slice(k0, k1 + 1).map(x => x * 0.97) }); }
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const z of pezzi) for (const p of z.P) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }
  const band = 0.25 + KRAC + 2 * HN, o = lo.map(v => v - band), nx = Math.ceil((hi[0] - lo[0] + 2 * band) / HN), ny = Math.ceil((hi[1] - lo[1] + 2 * band) / HN), nz = Math.ceil((hi[2] - lo[2] + 2 * band) / HN), N = nx * ny * nz;
  const d1 = new Float32Array(N).fill(1), d2 = new Float32Array(N).fill(1), i1 = new Int16Array(N).fill(-1), i2 = new Int16Array(N).fill(-1);
  for (const z of pezzi) { const id = IDN[z.t.id], P = z.P, R = z.r;
    // distanza dal tubo del pezzo (minimo sui segmenti), poi inserita tra le due più piccole del voxel (pezzi diversi)
    const loc = new Map();
    for (let s = 0; s < P.length - 1; s++) { const a = P[s], b = P[s + 1], ab = sub(b, a), L2 = dot(ab, ab) || 1e-9, rm = Math.max(R[s], R[s + 1]) + KRAC + 2 * HN;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - rm - o[0]) / HN)), i1_ = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0]) + rm - o[0]) / HN));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - rm - o[1]) / HN)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1]) + rm - o[1]) / HN));
      const k0 = Math.max(0, Math.floor((Math.min(a[2], b[2]) - rm - o[2]) / HN)), k1 = Math.min(nz - 1, Math.ceil((Math.max(a[2], b[2]) + rm - o[2]) / HN));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1_; i++) {
        const p = [o[0] + (i + 0.5) * HN, o[1] + (j + 0.5) * HN, o[2] + (k + 0.5) * HN], ap = sub(p, a), u = clamp(dot(ap, ab) / L2, 0, 1);
        const d = len(sub(ap, mul(ab, u))) - lerp(R[s], R[s + 1], u); if (d > rm) continue;
        const v = i + nx * (j + ny * k), old = loc.get(v); if (old === undefined || d < old) loc.set(v, d); } }
    for (const [v, d] of loc) { if (d < d1[v]) { d2[v] = d1[v]; i2[v] = i1[v]; d1[v] = d; i1[v] = id; } else if (d < d2[v]) { d2[v] = d; i2[v] = id; } }
  }
  const F = new Float32Array(N);
  for (let v = 0; v < N; v++) { let f = d1[v]; if (i2[v] >= 0 && PARENTI[TRATTI[i1[v]].id].has(TRATTI[i2[v]].id)) f = smin(d1[v], d2[v], KRAC);
    const y = o[1] + ((((v / nx) | 0) % ny) + 0.5) * HN; F[v] = Math.max(f, TAGLIO - y); }
  // surface nets sulla griglia locale
  const cx = nx - 1, cy = ny - 1, cz = nz - 1, C = new Int32Array(cx * cy * cz).fill(-1), Pv = [];
  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], vv = new Float32Array(8), NXY = nx * ny;
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) { const b = i + nx * j + NXY * k; let m = 0;
    for (let c = 0; c < 8; c++) { vv[c] = F[b + CO[c][0] + CO[c][1] * nx + CO[c][2] * NXY]; if (vv[c] < 0) m |= 1 << c; } if (m === 0 || m === 255) continue;
    let ax = 0, ay = 0, az = 0, q = 0; for (const [a, bb] of ED) if ((vv[a] < 0) !== (vv[bb] < 0)) { const t = vv[a] / (vv[a] - vv[bb]); ax += CO[a][0] + (CO[bb][0] - CO[a][0]) * t; ay += CO[a][1] + (CO[bb][1] - CO[a][1]) * t; az += CO[a][2] + (CO[bb][2] - CO[a][2]) * t; q++; }
    C[i + cx * j + cx * cy * k] = Pv.length / 3; Pv.push(o[0] + (i + 0.5 + ax / q) * HN, o[1] + (j + 0.5 + ay / q) * HN, o[2] + (k + 0.5 + az / q) * HN); }
  const cid = (i, j, k) => C[i + cx * j + cx * cy * k], I = [], quad = (a, b, c, d, inv) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (inv) I.push(a, c, b, a, d, c); else I.push(a, b, c, a, c, d); };
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) { if (cid(i, j, k) < 0) continue; const b = i + nx * j + NXY * k, s0 = F[b] < 0;
    if (j > 0 && k > 0 && s0 !== (F[b + 1] < 0)) quad(cid(i, j, k), cid(i, j - 1, k), cid(i, j - 1, k - 1), cid(i, j, k - 1), s0);
    if (i > 0 && k > 0 && s0 !== (F[b + nx] < 0)) quad(cid(i, j, k), cid(i, j, k - 1), cid(i - 1, j, k - 1), cid(i - 1, j, k), s0);
    if (i > 0 && j > 0 && s0 !== (F[b + NXY] < 0)) quad(cid(i, j, k), cid(i - 1, j, k), cid(i - 1, j - 1, k), cid(i, j - 1, k), s0); }
  let pos = taubin(new Float32Array(Pv), I, 16);
  // orientamento verso l'esterno: volume con segno positivo
  let vol = 0; for (let t = 0; t < I.length; t += 3) { const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2]; vol += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6; }
  if (vol < 0) for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  // il taglio resta piano
  for (let i = 1; i < pos.length; i += 3) if (pos[i] < TAGLIO + 0.02 && pos[i] < TAGLIO + HN) pos[i] = Math.max(pos[i], TAGLIO);
  const nt0 = I.length / 3, area = (() => { let s = 0; for (let t = 0; t < I.length; t += 3) { const a = [0, 1, 2].map(k => pos[3 * I[t] + k]), b = [0, 1, 2].map(k => pos[3 * I[t + 1] + k]), c = [0, 1, 2].map(k => pos[3 * I[t + 2] + k]); s += len(cross(sub(b, a), sub(c, a))) / 2; } return s; })();
  const rid = riduci(pos, I, Math.max(2000, Math.round(area * 520))), cmp = compatta(rid.pos, rid.idx); pos = Float32Array.from(cmp.pos);
  // direzione delle fibre: tangente del tratto proprio più vicino
  const nv = pos.length / 3, fdir = new Int8Array(nv * 3), punti = propri.flatMap(t => t.P.map((p, k) => [p, tangente(t.P, k)]));
  for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; let bd = 1e9, bt = [0, 1, 0]; for (const [q, tg] of punti) { const d = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]); if (d < bd) { bd = d; bt = tg; } }
    for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(bt[k] * 127); }
  log(mesh, 'superficie:', nt0, '→', cmp.idx.length / 3, 'triangoli,', nv, 'vertici, area', area.toFixed(1), 'cm²');
  return { pos, idx: cmp.idx, tag: null, fdir };
}
for (const mesh of ['plesso', 'n_soprascapolare', 'n_ascellare', 'n_muscolocutaneo', 'n_radiale', 'n_mediano', 'n_ulnare']) MESH[mesh] = superficieNervi(mesh);
for (const [id, m] of Object.entries(MESH)) setMesh(id, m);
const mm = G.man; for (const id of Object.keys(MESH)) { const p = MESH[id].pos; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) if (p[i + k] < mm.min[k] || p[i + k] > mm.max[k]) { log('ATTENZIONE: vertice fuori dal riquadro del modello in', id); i = p.length; break; } }

/* ---- 4. canali nei muscoli ---- */
const assi = [{ P: A.P, r: A.r }, { P: Vn.P, r: Vn.r }, ...TRATTI.map(t => ({ P: t.P, r: t.rr }))];
const MARG = 0.04, dentro = {};
for (const nome of MUSCOLI) {
  const pos = Float32Array.from(BASE[nome]); let n = 0;
  for (let i = 0; i < pos.length; i += 3) for (const { P, r } of assi) {
    let bd = 1e9, bk = 0; for (let k = 0; k < P.length; k++) { if (Math.abs(P[k][0] - pos[i]) > 1) continue; const d = len(sub([pos[i], pos[i + 1], pos[i + 2]], P[k])); if (d < bd) { bd = d; bk = k; } }
    if (bd >= 1e8) continue; const m = r[bk] + MARG;
    if (bd < m) { const dir = bd > 1e-6 ? nor(sub([pos[i], pos[i + 1], pos[i + 2]], P[bk])) : [1, 0, 0]; pos[i] = P[bk][0] + dir[0] * m; pos[i + 1] = P[bk][1] + dir[1] * m; pos[i + 2] = P[bk][2] + dir[2] * m; n++; }
  }
  setPos(nome, pos); if (n) dentro[nome] = n;
}
log('canali nei muscoli: vertici spostati', JSON.stringify(dentro));

const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
// SOLO_NERVI=1: i muscoli restano quelli del file (niente canali nuovi), si riscrivono solo vasi e nervi
if (process.env.SOLO_NERVI) for (const nome of MUSCOLI) G.ripristina(nome);
if (prova) writeFileSync(prova, JSON.stringify({ controlli: CHECK, canali: dentro }, null, 1)); else saveFile(repack());
