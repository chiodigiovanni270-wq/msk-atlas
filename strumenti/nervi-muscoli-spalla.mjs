/* Nervi, vasi e muscoli della spalla (modelli/spalla-3d.html): nessun muscolo attraversa un nervo o un vaso.

   Problema. `vasi-nervi-spalla.mjs` traccia nervi e vasi con i muscoli della bozza come ostacolo morbido e scava i canali spostando i vertici dei
   muscoli della bozza; gli script successivi (muscoli-spalla, rifiniture, capo breve, deltoide, trapezio) rifanno i muscoli, quindi alla fine della
   catena le superfici si incrociavano: muscolocutaneo nel coracobrachiale (7,3 mm) con entrata e uscita a metà nella superficie, radiale nei capi
   mediale e laterale del tricipite (5 mm), mediano, ulnare, arteria e vena nel gran dorsale (fino a 5,3 mm), plesso e soprascapolare nel piccolo
   pettorale, dentato anteriore, omoioideo, trapezio discendente, succlavio e sovraspinato (1–3,7 mm). Quasi sempre il nervo è sepolto nel muscolo
   per più del suo raggio: spostare i vertici del muscolo non basta (la superficie scavalca il nervo), ritracciare i nervi con i muscoli come
   ostacoli rigidi non trova spazio (i muscoli BodyParts3D si toccano), e ricostruire tutto il muscolo da un campo di distanza ne cambia volume e
   dettagli lontano dai nervi (gran dorsale −11 %, lembi sottili del deltoide).

   Il gran dorsale non è nell'elenco: la sua mesh vicino al tendine è frammentata e il canale non si cuce; il fascio si sposta fuori dal muscolo con
   `fascio-dorsale-spalla.mjs`, da lanciare PRIMA di questo script.

   Dentato anteriore, succlavio, omoioideo e trapezio discendente (`FIANCO`) stanno tutti da un lato del fascio: `fascio-clavicolare-spalla.mjs`,
   da lanciare PRIMA di questo script, li riporta alla forma BodyParts3D vicino al fascio e li scosta insieme a nervi e vasi; qui il poco che resta
   (1–2 mm) diventa un solco aperto invece di un canale (vedi `incroci` e `ombra`).

   Uso (dalla cartella del progetto):
     node strumenti/nervi-muscoli-spalla.mjs                → riscrive i muscoli nel file del modello
     PROVA=1 node strumenti/nervi-muscoli-spalla.mjs        → stampa i controlli senza scrivere
     SOLO=coracobr,tri_med node strumenti/nervi-muscoli-spalla.mjs   → solo questi muscoli
     MODELLO=/tmp/copia.html node strumenti/nervi-muscoli-spalla.mjs   → lavora su una copia
     DEBUG=1 …                                              → stampa anche anelli, pieghe e catene aperte
     H=0.012, LIVELLI=0.35,0.45 …                           → passo delle griglie e livelli di taglio diversi (prove)
   Va lanciato dopo tutti gli script che rifanno muscoli, nervi o vasi, dopo `sezioni-spalla.mjs` (ultimo della catena: qui i tappi a y = −14
   restano quelli, salvo il foro dove un nervo li attraversa). Riparte dalle mesh del file e si può rilanciare: un muscolo senza compenetrazioni
   (sotto `SOGLIA_MM3`) resta com'è, quindi al secondo lancio non cambia niente. Nervi e vasi non si toccano. Tutto il giro: ~45 min.

   Metodo, per ogni muscolo con compenetrazioni (una "toppa" solo vicino ai corpi che lo attraversano; il resto della mesh resta identico):
     1. Controllo: per ogni coppia muscolo–(nervo o vaso) con i riquadri vicini, solidi su griglia di 0,2 mm; compenetrazione se il volume comune
        supera `SOGLIA_MM3`. Gli stessi numeri si stampano alla fine.
     2. Campo dei corpi (distanza con segno da nervi e vasi, griglia di passo `H`). La mesh del muscolo si raffina vicino alla linea di livello
        T (primo valore di `LIVELLI`; lati fino a `LATO`, punti medi sui triangoli di prima: la forma non cambia) e si taglia esattamente lungo
        quella linea: resta la parte a più di T dai corpi, con un bordo liscio.
     3. Toppa: livello zero del massimo raccordato (raggio `RACCORDO`, niente spigoli vivi ai bordi del foro) di d_muscolo e `GIOCO` − d_corpi
        su una griglia locale (passo `H`), surface nets entro T + `REGIONE` dai corpi, riduzione a quadriche alla densità dei triangoli tolti ×
        `DENSITA`. Dove il nervo è sepolto la toppa ha un canale con foro d'entrata e d'uscita (il muscolocutaneo perfora il coracobrachiale; il
        radiale passa tra i capi del tricipite), dove sfiora la superficie un solco. Oltre `SNAP`[1] dai corpi i vertici tornano esattamente
        sulla superficie di prima (punto più vicino dei triangoli, raccordo da `SNAP`[0]; non le pareti del canale, a più di `SUP` dalla
        superficie); più vicino `LEVIGA` passate di Taubin pesate, alternate al vincolo del gioco (ogni vertice almeno a `GIOCO` dai corpi).
        Poi la toppa si raffina vicino alla linea e si taglia lungo la stessa linea; via i pezzetti staccati.
     4. Cucitura: i due bordi sono la stessa linea di livello sulla stessa superficie, campionata in modo diverso; striscia di triangoli per
        lunghezza d'arco normalizzata (larghezza ~0). Anelli più corti di 0,2 mm ignorati; se gli anelli del muscolo e della toppa non sono
        gli stessi (superficie che sfiora il livello) si riprova con il livello successivo di `LIVELLI`, altrimenti il muscolo resta com'era.
        Poi: via i triangoli con due vertici nello stesso punto, riduzione a quadriche della fascia rifatta (entro T + 0,15) alla densità di
        prima × `DENSITA`, fori più corti di `FORO` chiusi a ventaglio, pieghe (triangoli girati) distese spostando i vertici nel baricentro dei
        vicini. Tag (muscolo/tendine, tappi) e direzione delle fibre della toppa dal vertice di prima più vicino; normali come
        `muscoli-spalla.mjs` (media per posizione, `NORM_DIFF` passate) ricalcolate nella toppa e attorno, altrove quelle del file.
   Doccia del radiale (solo `tri_med`): con il nervo sull'osso (`radiale-spalla.mjs`) una lingua del capo mediale lo copriva sul lato verso
   l'osso. Per le fette di 0,25 cm tra `DOCCIA`.y si aggiungono ai corpi segmenti (raggio del nervo) dal centro del nervo verso l'uscita più
   vicina del muscolo nel piano x–z (36 direzioni, percorso dentro il muscolo più corto, non verso l'osso, levigate su ±2 fette), fino
   all'uscita + `sbocco`, con rampa a zero agli estremi: il nervo resta scoperto tra osso e capi, il muscolo perde ~7 % di volume.
   Controlli stampati: volume comune e profondità per coppia prima e dopo (residuo ≤ 1 voxel del controllo), gioco minimo misurato, larghezza
   massima della cucitura, volume del muscolo prima e dopo, lati aperti e non manifold prima e dopo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, attrs, man, buf0, setMesh, repack, saveFile, log, sstep, setGriglia, griglia, campo, solid, edt, nets } = G;
const { riduci, compatta } = await import('./lib-bp3d.mjs');

const PROVA = !!process.env.PROVA, SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null;
const CORPI = ['plesso', 'n_soprascapolare', 'n_ascellare', 'n_muscolocutaneo', 'n_radiale', 'n_mediano', 'n_ulnare', 'a_succ', 'v_succ', 'a_asc', 'v_asc'];
const MUSCOLI = ['supra', 'infra', 'tmin', 'subs', 'delt_cl', 'delt_ac', 'delt_sp', 'tmaj', 'pec_cl', 'pec_st', 'pec_ab', 'pmin', 'succl', 'trap_d', 'trap_t', 'trap_a', 'romb_mag', 'romb_min', 'elev', 'dent', 'omoi', 'bic_lungo', 'bic_breve', 'coracobr', 'tri_lungo', 'tri_lat', 'tri_med'];
// muscoli che il fascio vascolo-nervoso incrocia senza attraversarli: niente canale (lembi di muscolo sopra e sotto il nervo, bordi frastagliati
// dove entra ed esce), il muscolo resta tutto da un lato del fascio e il fascio passa in un solco aperto. Il lato è uno solo per muscolo
// (`ombra`): quello anatomico in `LATO_F` (dal fascio verso il muscolo, gli stessi di `fascio-clavicolare-spalla.mjs`: omoioideo superficiale a plesso
// e soprascapolare, succlavio sopra e davanti a vasi e plesso), altrimenti quello che toglie meno muscolo. Le mesh sono quelle del file, come
// le lascia `fascio-clavicolare-spalla.mjs`.
const FIANCO = ['succl', 'omoi'], LATO_F = { omoi: [-0.6, 0.78, -0.12], succl: [-0.05, 0.57, 0.82] };
// toppa più larga (livelli LIVELLI_F, ritorno sulla superficie di prima oltre SNAP_F) e distanza dal muscolo levigata (LISCIA_F passate di media
// 3×3×3 sul campo): il solco ha bordi dolci
const LIVELLI_F = [0.7, 0.8, 0.6, 0.9, 0.5, 1.0, 0.65, 0.75], SNAP_F = [0.45, 0.6], SUP_F = 0.2, PEZZO_F = 0.15, CUCI_F = 0.2, LISCIA_F = +(process.env.LISCIA ?? 15);
const OMBRA = +(process.env.OMBRA ?? 1.0), INCROCIO = { cella: 0.3, raggio: 1.2, asse: 0.8, direzioni: 400, margine: 0.1, portata: 2.0 };   // cm
const SOGLIA_MM3 = 0.05, H_CTRL = 0.02;               // controllo: volume comune minimo (mm³), passo della griglia (cm)
const H = +(process.env.H ?? 0.02), GIOCO = 0.03, ZONA = 0.5, LIVELLI = process.env.LIVELLI ? process.env.LIVELLI.split(",").map(Number) : [0.35, 0.4, 0.3, 0.45], LATO = 0.04, SNAP0 = [0.15, 0.28], DENSITA = 1.5, NORM_DIFF = 3, LEVIGA = 40, RACCORDO = +(process.env.RACCORDO ?? 0.06), SUP0 = +(process.env.SUP ?? 0.04), REGIONE = +(process.env.REGIONE ?? 0.15), FORO = 0.3;   // cm

const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const pt = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
const riquadro = pos => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); } return { lo, hi }; };
const RQ = {}; const rq = n => RQ[n] ||= riquadro(REAL(n).pos);
const vicini = (a, b, m = 0) => [0, 1, 2].every(k => a.lo[k] - m <= b.hi[k] && b.lo[k] - m <= a.hi[k]);
const volume = (pos, idx) => { let v = 0; for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2]; v += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6; } return v; };
const chiaveP = (P, i) => Math.round(P[3 * i] * 2e4) + ',' + Math.round(P[3 * i + 1] * 2e4) + ',' + Math.round(P[3 * i + 2] * 2e4);
const NRM_ULTIMO = {}, topoNrm = n => NRM_ULTIMO[n] || null;
const nmDi = n => { const m = man.meshes.findLast(x => x.n === n); return m.nm !== undefined ? new Int8Array(buf0.buffer, buf0.byteOffset + m.nm, m.nv * 3).slice() : null; };

/* ---- 1. controllo: volume comune e profondità per coppia ---- */
function controllo(nomiM) {
  const out = {};
  for (const mu of nomiM) for (const nv of CORPI) { const A = rq(mu), B = rq(nv); if (!vicini(A, B)) continue;
    const lo = [0, 1, 2].map(k => Math.max(A.lo[k], B.lo[k]) - 0.05), hi = [0, 1, 2].map(k => Math.min(A.hi[k], B.hi[k]) + 0.05);
    setGriglia(lo, H_CTRL, ...[0, 1, 2].map(k => Math.ceil((hi[k] - lo[k]) / H_CTRL)));
    const Mm = solid(mu), Mn = solid(nv); let n = 0; for (let i = 0; i < G.N; i++) if (Mm[i] && Mn[i]) n++;
    if (!n) continue; const Di = edt(Mm, true); let p = 0; for (let i = 0; i < G.N; i++) if (Mm[i] && Mn[i]) p = Math.max(p, Di[i]);
    const v = n * H_CTRL ** 3 * 1000; if (v >= SOGLIA_MM3) out[mu + '/' + nv] = { volume_mm3: +v.toFixed(2), profondita_mm: +(p * 10).toFixed(2) }; }
  return out;
}

/* ---- normali di vertice senza sfaccettature (come muscoli-spalla.mjs) ---- */
function normaliLisce(pos, idx, tag) {
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
  for (let p = 0; p < NORM_DIFF; p++) { const Y = new Float64Array(X.length); for (let i = 0; i < key.size; i++) for (let k = 0; k < 3; k++) { let s = 2 * X[3 * i + k]; for (const j of nl[i]) s += X[3 * j + k] / nl[i].length; Y[3 * i + k] = s; } X = norma(Y); }
  const out = new Int8Array(nv * 3); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) out[3 * i + k] = Math.round(X[3 * grp[i] + k] * 127);
  return out;
}

/* ---- punto più vicino della superficie (triangoli in una griglia di celle) ---- */
// punto più vicino di un triangolo (Ericson, Real-Time Collision Detection 5.1.5)
const cpTri = (p, a, b, c) => { const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, ab, d1 / (d1 - d3));
  const pc = sub(p, c), d5 = dot(ab, pc), d6 = dot(ac, pc); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const dn = 1 / (va + vb + vc); return add(a, add(mul(ab, vb * dn), mul(ac, vc * dn))); };
function superficie(pos, idx, cella = 0.25) {
  const hash = new Map(), kk = (i, j, k) => (i + 2000) + 4000 * ((j + 2000) + 4000 * (k + 2000)), T = [];
  for (let t = 0; t < idx.length; t += 3) { const v = [idx[t], idx[t + 1], idx[t + 2]].map(a => pt(pos, a)); T.push(v);
    const lo = [0, 1, 2].map(k => Math.floor(Math.min(v[0][k], v[1][k], v[2][k]) / cella)), hi = [0, 1, 2].map(k => Math.floor(Math.max(v[0][k], v[1][k], v[2][k]) / cella));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const key = kk(i, j, k); let L = hash.get(key); if (!L) hash.set(key, L = []); L.push(t / 3); } }
  return p => { const c = p.map(x => Math.floor(x / cella)); let best = null, bd = 1e9;
    for (let r = 1; r <= 4; r++) { for (let i = c[0] - r; i <= c[0] + r; i++) for (let j = c[1] - r; j <= c[1] + r; j++) for (let k = c[2] - r; k <= c[2] + r; k++) {
        if (r > 1 && Math.max(Math.abs(i - c[0]), Math.abs(j - c[1]), Math.abs(k - c[2])) !== r) continue;   // solo il guscio nuovo
        for (const t of hash.get(kk(i, j, k)) || []) { const q = cpTri(p, ...T[t]), d = len(sub(p, q)); if (d < bd) { bd = d; best = { q, t, d }; } } }
      if (best && bd <= (r - 1) * cella) break; }
    return best; };
}

/* ---- raffinamento con triangoli verdi (punti medi: la forma non cambia) ---- */
function raffina(pos, idx, extra, vicino) {
  let P = Array.from(pos), I = Array.from(idx); const X = extra.map(e => ({ a: Array.from(e.a), mid: e.mid }));
  const chiave = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
  for (let giro = 0; giro < 8; giro++) {
    const nT = I.length / 3, spezza = new Map();
    for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) { const u = I[3 * t + e], v = I[3 * t + (e + 1) % 3], a = pt(P, u), b = pt(P, v);
      if (len(sub(a, b)) > LATO && (vicino(a) || vicino(b) || vicino(mul(add(a, b), 0.5)))) spezza.set(chiave(u, v), -1); }
    if (!spezza.size) break;
    for (const [k] of spezza) { const a = Math.floor(k / 4294967296), b = k % 4294967296; spezza.set(k, P.length / 3);
      for (let q = 0; q < 3; q++) P.push((P[3 * a + q] + P[3 * b + q]) / 2); for (const x of X) x.a.push(...x.mid(x.a, a, b)); }
    const J = [];
    for (let t = 0; t < nT; t++) { const v = [I[3 * t], I[3 * t + 1], I[3 * t + 2]], m = [0, 1, 2].map(e => spezza.get(chiave(v[e], v[(e + 1) % 3])) ?? -1), n = m.filter(x => x >= 0).length;
      if (n === 0) { J.push(...v); continue; }
      let r = 0; if (n === 1) r = m.findIndex(x => x >= 0); else if (n === 2) r = [0, 1, 2].find(e => m[e] >= 0 && m[(e + 1) % 3] >= 0);
      const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3], mab = m[r], mbc = m[(r + 1) % 3], mca = m[(r + 2) % 3];
      if (n === 1) J.push(a, mab, c, mab, b, c); else if (n === 2) J.push(mab, b, mbc, a, mab, mbc, a, mbc, c); else J.push(a, mab, mca, mab, b, mbc, mca, mbc, c, mab, mbc, mca); }
    I = J;
  }
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I), extra: X.map(x => x.a) };
}
const MID_TAG = (A, a, b) => [A[a] >= 250 || A[b] >= 250 ? Math.max(A[a], A[b]) : Math.round((A[a] + A[b]) / 2)];
const MID_DIR = (A, a, b) => { const d = [0, 1, 2].map(q => A[3 * a + q] + A[3 * b + q]), l = Math.hypot(...d) || 1; return d.map(x => Math.round(x / l * 127)); };

/* ---- taglio esatto lungo la linea di livello f = c: resta la parte con f ≥ c (sopra) o f < c; bordo come segmenti orientati ---- */
function taglia(pos, idx, f, c, sopra, K) {
  const P = Array.from(pos), F = Array.from(f), nuovi = new Map(), I = [], seg = [], orig = [], tieni = v => (F[v] >= c) === sopra;
  const punto = (a, b) => { const ka = K(a), kb = K(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka; let i = nuovi.get(k); if (i !== undefined) return i;
    const [p, q] = ka < kb ? [a, b] : [b, a], t = (c - F[p]) / (F[q] - F[p]); i = P.length / 3; for (let e = 0; e < 3; e++) P.push(P[3 * p + e] + (P[3 * q + e] - P[3 * p + e]) * t); F.push(c); nuovi.set(k, i); orig.push([p, q, t]); return i; };
  for (let t = 0; t < idx.length; t += 3) { const v = [idx[t], idx[t + 1], idx[t + 2]], s = v.map(tieni);
    if (s.every(x => x)) { I.push(...v); continue; } if (!s.some(x => x)) continue;
    const poli = [], cut = []; for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3]; if (s[e]) poli.push(a); if (s[e] !== s[(e + 1) % 3]) { cut.push(poli.length); poli.push(punto(a, b)); } }
    for (let q = 1; q < poli.length - 1; q++) I.push(poli[0], poli[q], poli[q + 1]);
    // lato di taglio: tra i due punti nuovi, nel verso del poligono tenuto
    const [i0, i1] = cut; if ((i0 + 1) % poli.length === i1) seg.push([poli[i0], poli[i1]]); else seg.push([poli[i1], poli[i0]]); }
  return { pos: Float32Array.from(P), idx: I, seg, orig };
}
// anelli chiusi da segmenti orientati (per indice); null se non si chiudono. Un punto con due segmenti in uscita (lato non manifold della
// mesh tagliata) si attraversa due volte nello stesso anello. Con `P`: una catena che finisce nello stesso punto, entro 0,01 mm, dove ne
// comincia un'altra vi si unisce (vertici doppi della mesh)
function anelli(seg, P) {
  const succ = new Map(); for (const [u, v] of seg) { if (!succ.has(u)) succ.set(u, []); succ.get(u).push(v); }
  if (P) { const pred = new Set(seg.map(([, v]) => v)), inizi = [...succ.keys()].filter(u => !pred.has(u));
    for (const [, v] of seg) if (!succ.has(v)) { const j = inizi.findIndex(u => len(sub(pt(P, u), pt(P, v))) < 1e-3); if (j >= 0) { succ.set(v, [inizi[j]]); inizi.splice(j, 1); } } }
  const L = [];
  for (const [u0, out] of succ) while (out.length) { const loop = []; let u = u0;
    do { const o = succ.get(u); if (!o || !o.length) return null; loop.push(u); u = o.shift(); } while (u !== u0);
    L.push(loop); }
  return P ? L.filter(l => l.reduce((s, v, k) => s + len(sub(pt(P, v), pt(P, l[(k + 1) % l.length]))), 0) > 0.02) : L;   // via gli anelli lunghi meno di 0,2 mm (il foro che resta non si vede)
}
// cucitura di due anelli sulla stessa linea: A nel verso della parte tenuta del muscolo, B nel verso della toppa (opposto)
function cuci(pos, A, B) {
  const d = (i, j) => len(sub(pt(pos, i), pt(pos, j)));
  let s = 0; for (let j = 1; j < B.length; j++) if (d(A[0], B[j]) < d(A[0], B[s])) s = j;
  const a = k => A[k % A.length], b = k => B[((s - k) % B.length + B.length) % B.length];
  const arco = (n, f) => { const L = [0]; for (let k = 1; k <= n; k++) L.push(L[k - 1] + d(f(k - 1), f(k))); return L.map(x => x / L[n]); };
  const SA = arco(A.length, a), SB = arco(B.length, b), T = []; let i = 0, j = 0, larg = 0;
  while (i < A.length || j < B.length) { const avA = i < A.length && (j >= B.length || SA[i + 1] <= SB[j + 1]); larg = Math.max(larg, d(a(i), b(j)));
    if (avA) { T.push([a(i + 1), a(i), b(j)]); i++; } else { T.push([b(j), b(j + 1), a(i)]); j++; } }
  return { T, larg };
}

/* ---- pieghe: triangoli girati rispetto alla somma delle normali dei loro vertici; i loro vertici (e i vicini) liberi vanno nel baricentro
   dei vicini, poi `spingi` (fuori dal gioco), finché non ce ne sono più (al massimo 60 giri) ---- */
function distendi(P, I, libero, spingi) {
  const nv = P.length / 3, NB = Array.from({ length: nv }, () => new Set()); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3]; NB[a].add(b); NB[b].add(a); }
  let resto = 0;
  for (let it = 0; it < 60; it++) { const vn = new Float64Array(nv * 3), fn = [];
    for (let t = 0; t < I.length; t += 3) { const p = [0, 1, 2].map(e => pt(P, I[t + e])), f = cross(sub(p[1], p[0]), sub(p[2], p[0])); fn.push(f); for (let e = 0; e < 3; e++) for (let k = 0; k < 3; k++) vn[3 * I[t + e] + k] += f[k]; }
    const brutti = new Set(); resto = 0;
    fn.forEach((f, q) => { const n = [0, 1, 2].map(k => [0, 1, 2].reduce((s, e) => s + vn[3 * I[3 * q + e] + k], 0)); if (len(f) && dot(f, n) < 0) { resto++; for (let e = 0; e < 3; e++) { const v = I[3 * q + e]; brutti.add(v); for (const w of NB[v]) brutti.add(w); } } });
    if (!resto) break;
    const nuovi = []; for (const i of brutti) { if (!libero(i) || !NB[i].size) continue; const m = [0, 0, 0]; for (const j of NB[i]) for (let k = 0; k < 3; k++) m[k] += P[3 * j + k] / NB[i].size; nuovi.push([i, m]); }
    for (const [i, m] of nuovi) P.set(spingi(m), 3 * i); }
  return resto;
}

/* ---- fori: bordi (per posizione) vicini ai corpi e più corti di FORO, chiusi a ventaglio dal primo vertice ---- */
function chiudiFori(P, I, vicino) {
  const E = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], ka = chiaveP(P, a), kb = chiaveP(P, b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    if (!E.has(k)) E.set(k, []); E.get(k).push([a, b]); }
  const succ = new Map(); for (const L of E.values()) if (L.length === 1) { const [a, b] = L[0]; succ.set(chiaveP(P, a), [a, b]); }
  const T = [], fatto = new Set();
  for (const [k0] of succ) { if (fatto.has(k0)) continue; const loop = []; let k = k0, ok = true;
    while (!fatto.has(k)) { fatto.add(k); const e = succ.get(k); if (!e) { ok = false; break; } loop.push(e[0]); k = chiaveP(P, e[1]); }
    if (!ok || k !== k0 || loop.length < 3) continue;
    const lu = loop.reduce((s, v, q) => s + len(sub(pt(P, v), pt(P, loop[(q + 1) % loop.length]))), 0);
    if (lu > FORO || !loop.every(v => vicino(pt(P, v)))) continue;
    for (let q = 1; q < loop.length - 1; q++) T.push(loop[0], loop[q + 1], loop[q]); }
  return T;
}

/* ---- doccia del radiale nel capo mediale: segmenti dal centro del nervo (fette di 0,25 cm tra DOCCIA.y) verso l'uscita più vicina del
   muscolo (non verso l'osso), lunghi fino all'uscita + `sbocco` e a zero ai due estremi (rampa DOCCIA.rampa); come corpi in più per il solo capo mediale: il nervo resta
   visibile tra i capi, appoggiato all'osso, e non coperto da muscolo ---- */
const DOCCIA = { y: [-7.0, -11.2], rampa: 0.8, raggio: 0.17, angoli: 36, max: 3, sbocco: 0.4, rif: [0, 0, 1], peso: 20 };
function docciaRadiale() {
  const N = REAL('n_radiale'), O = REAL('omero'), T = REAL('tri_med'), tp = i => pt(T.pos, T.idx[i]), fette = [];
  // per ogni fetta: direzione nel piano x–z con il percorso più corto dentro il capo mediale e vicina alla direzione di riferimento `rif`, non verso l'osso; lunghezza fino all'uscita + `sbocco`
  const attraversi = (c, d) => { const ts = []; for (let t = 0; t < T.idx.length; t += 3) { const a = tp(t), b = tp(t + 1), cc = tp(t + 2), e1 = sub(b, a), e2 = sub(cc, a), h = cross(d, e2), det = dot(e1, h); if (Math.abs(det) < 1e-12) continue;
      const f = 1 / det, sv = sub(c, a), u = f * dot(sv, h); if (u < 0 || u > 1) continue; const q = cross(sv, e1), v = f * dot(d, q); if (v < 0 || u + v > 1) continue; const tt = f * dot(e2, q); if (tt > 1e-6) ts.push(tt); } return ts.sort((x, y) => x - y); };
  for (let y = DOCCIA.y[0]; y >= DOCCIA.y[1] - 1e-6; y -= 0.25) {
    let n = 0, c = [0, 0, 0]; for (let i = 0; i < N.nv; i++) if (Math.abs(N.pos[3 * i + 1] - y) < 0.125) { n++; for (let k = 0; k < 3; k++) c[k] += N.pos[3 * i + k]; }
    if (!n) continue; c = c.map(v => v / n);
    let bd = 1e9, bq = null; for (let i = 0; i < O.nv; i++) { const q = pt(O.pos, i), d = len(sub(q, c)); if (d < bd) { bd = d; bq = q; } }
    const via = sub(c, bq), lv = len(via) || 1; let best = null;
    for (let a = 0; a < DOCCIA.angoli; a++) { const th = 2 * Math.PI * a / DOCCIA.angoli, d = [Math.cos(th), 0, Math.sin(th)]; if (dot(d, via) / lv < -0.2) continue;
      const ts = attraversi(c, d); let dentro = ts.length % 2 === 1, prev = 0, tot = 0, uscita = 0;
      for (const t of ts) { if (t > DOCCIA.max) break; if (dentro) { tot += t - prev; uscita = t; } prev = t; dentro = !dentro; }
      if (dentro && prev < DOCCIA.max) { tot += DOCCIA.max - prev; uscita = DOCCIA.max; }
      const costo = tot + DOCCIA.peso * (1 - dot(d, DOCCIA.rif));   // percorso nel muscolo + scarto dalla direzione di riferimento (davanti e un po' lateralmente: la doccia non cambia verso da una fetta all'altra)
      if (!best || costo < best.costo - 1e-9) best = { tot, d, uscita, costo }; }
    if (process.env.DEBUG) log('  doccia y', y.toFixed(2), 'direzione (x,z)', best.d[0].toFixed(2), best.d[2].toFixed(2), 'dentro', best.tot.toFixed(2), 'uscita', best.uscita.toFixed(2));
    fette.push({ y, c, d: best.d, L: best.uscita + DOCCIA.sbocco });
  }
  // direzioni e lunghezze levigate lungo il nervo (media su ±2 fette), rampa agli estremi
  return fette.map((f, i) => { let d = [0, 0, 0], L = 0, w = 0; for (let k = -2; k <= 2; k++) { const g = fette[i + k]; if (!g) continue; for (let q = 0; q < 3; q++) d[q] += g.d[q]; L += g.L; w++; }
    const l = len(d) || 1; d = d.map(v => v / l); L = L / w * sstep(DOCCIA.y[0], DOCCIA.y[0] - DOCCIA.rampa, f.y) * sstep(DOCCIA.y[1], DOCCIA.y[1] + DOCCIA.rampa, f.y);
    return [f.c, add(f.c, d, L)]; });
}
// distanza con segno dalla doccia (raggio = quello del nervo) unita al campo dei corpi: FK = min(FK, d − raggio)
function scavaDoccia(FK, doc) {
  if (!doc.length) return;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const [a, b] of doc) for (const q of [a, b]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k] - 0.6); hi[k] = Math.max(hi[k], q[k] + 0.6); }
  const dSeg = (p, a, b) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))); return len(sub(p, add(a, ab, t))); };
  for (let i = 0; i < G.N; i++) { const p = G.voxel(i); if ([0, 1, 2].some(k => p[k] < lo[k] || p[k] > hi[k])) continue;
    let d = 1e9; for (const [a, b] of doc) d = Math.min(d, dSeg(p, a, b)); if (d - DOCCIA.raggio < FK[i]) FK[i] = d - DOCCIA.raggio; }
}

/* ---- muscoli da un lato del fascio (FIANCO) ---- */
// incroci: voxel comuni a muscolo e corpo raggruppati (celle di INCROCIO.cella vicine); per ogni gruppo l'asse del corpo (componente
// principale dei vertici entro INCROCIO.asse dal centro) e il suo raggio (90° percentile). Il lato d di un incrocio è perpendicolare all'asse;
// muscolo tolto = voxel del muscolo entro INCROCIO.raggio, dietro al corpo rispetto a d (fino a OMBRA) e a meno di raggio + margine dall'asse
// spostato lungo d. Il muscolo resta dal lato d
function incroci(mu, corpi) {
  const Mm = solid(mu), out = [], NX = G.NX, NXY = G.NX * G.NY, h = G.H;
  for (const c of corpi) { const Mc = solid(c), celle = new Map(), kc = p => p.map(x => Math.floor(x / INCROCIO.cella)).join(',');
    for (let i = 0; i < G.N; i++) if (Mm[i] && Mc[i]) { const p = G.voxel(i), k = kc(p); let e = celle.get(k); if (!e) celle.set(k, e = { n: 0, s: [0, 0, 0] }); e.n++; for (let q = 0; q < 3; q++) e.s[q] += p[q]; }
    const chiavi = [...celle.keys()], par = new Map(chiavi.map(k => [k, k])), f = k => { while (par.get(k) !== k) k = par.get(k); return k; };
    for (const k of chiavi) { const [x, y, z] = k.split(',').map(Number); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const k2 = [x + dx, y + dy, z + dz].join(','); if (celle.has(k2)) par.set(f(k), f(k2)); } }
    const gruppi = new Map(); for (const k of chiavi) { const r = f(k), e = celle.get(k); let g = gruppi.get(r); if (!g) gruppi.set(r, g = { n: 0, s: [0, 0, 0] }); g.n += e.n; for (let q = 0; q < 3; q++) g.s[q] += e.s[q]; }
    const B = REAL(c);
    for (const g of gruppi.values()) { if (g.n * h ** 3 * 1000 < SOGLIA_MM3) continue; const c0 = mul(g.s, 1 / g.n);
      // asse e raggio del corpo vicino all'incrocio
      const P = []; for (let i = 0; i < B.nv; i++) { const p = pt(B.pos, i); if (len(sub(p, c0)) < INCROCIO.asse) P.push(p); }
      const m = [0, 1, 2].map(k => P.reduce((s, p) => s + p[k], 0) / P.length), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (const p of P) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - m[i]) * (p[j] - m[j]);
      let ax = [1, 0.3, 0.2]; for (let it = 0; it < 60; it++) { ax = [0, 1, 2].map(i => dot(C[i], ax)); ax = mul(ax, 1 / len(ax)); }
      const rad = P.map(p => { const r = sub(p, m); return len(sub(r, mul(ax, dot(r, ax)))); }).sort((x, y) => x - y)[Math.floor(P.length * 0.9)] || 0.2;
      let e1 = cross(ax, Math.abs(ax[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]); e1 = mul(e1, 1 / len(e1)); const e2 = cross(ax, e1);
      // voxel del muscolo vicini
      const Q = [], r = Math.ceil(INCROCIO.raggio / h), ii = [0, 1, 2].map(k => Math.floor((m[k] - G.O[k]) / h));
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = ii[0] + dx, y = ii[1] + dy, z = ii[2] + dz;
        if (x < 0 || y < 0 || z < 0 || x >= G.NX || y >= G.NY || z >= G.NZ || dx * dx + dy * dy + dz * dz > r * r) continue; const id = x + NX * y + NXY * z; if (Mm[id]) Q.push(sub(G.voxel(id), m)); }
      out.push({ corpo: c, c: m, ax, rad, Q, voxel: g.n }); } }
  // muscolo tolto con il lato d (perpendicolare all'asse del corpo) in un incrocio
  const tolti = (x, d) => { let n = 0; for (const q of x.Q) { const t = dot(q, d); if (t > 0 || t < -OMBRA) continue; if (len(sub(q, add(mul(x.ax, dot(q, x.ax)), mul(d, t)))) < x.rad + INCROCIO.margine) n++; } return n; };
  const lato = (x, g) => { const d = sub(g, mul(x.ax, dot(g, x.ax))), l = len(d); return l > 0.2 ? mul(d, 1 / l) : null; };
  // un solo lato g per tutto il muscolo (in ogni incrocio la sua componente perpendicolare all'asse del corpo): il muscolo non passa sopra un
  // vaso e sotto quello accanto. Direzioni g su una sfera (spirale di Fibonacci), si sceglie quella che toglie meno muscolo in tutto
  let best = LATO_F[mu] ? { g: mul(LATO_F[mu], 1 / len(LATO_F[mu])) } : null;
  if (!best) for (let a = 0; a < INCROCIO.direzioni; a++) { const z = 1 - 2 * (a + 0.5) / INCROCIO.direzioni, r = Math.sqrt(1 - z * z), th = a * Math.PI * (3 - Math.sqrt(5)), g = [r * Math.cos(th), r * Math.sin(th), z];
    let n = 0; for (const x of out) { const d = lato(x, g); n += d ? tolti(x, d) : 1e6; } if (!best || n < best.n) best = { n, g }; }
  return { g: best.g, X: out.map(x => { const d = lato(x, best.g); return { corpo: x.corpo, c: x.c, s: d, tolti_mm3: +(tolti(x, d) * h ** 3 * 1000).toFixed(1), raggio_mm: +(x.rad * 10).toFixed(1), voxel: x.voxel }; }) };
}
// ombra dei corpi: FK(p) ← min su t ∈ [0, OMBRA] di FK(p + t·s), con s il lato del muscolo dell'incrocio più vicino (entro INCROCIO.portata).
// Un punto è nell'ombra se andando verso il lato del muscolo incontra un nervo o un vaso: il muscolo che copre il corpo dal lato opposto viene
// tolto dalla toppa, e resta un solco aperto invece di un canale
function ombra(FK, X) {
  const NX = G.NX, NY = G.NY, NZ = G.NZ, NXY = NX * NY, h = G.H, passi = Math.ceil(OMBRA / h), out = FK.slice();
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const id = i + NX * j + NXY * k;
    if (FK[id] > OMBRA + 0.6) continue; const p = G.voxel(id); let d = null, bd = INCROCIO.portata; for (const x of X) { const e = len(sub(p, x.c)); if (e < bd) { bd = e; d = x.s; } }
    if (!d) continue; let m = FK[id];
    for (let q = 1; q <= passi; q++) { const x = Math.round(i + d[0] * q), y = Math.round(j + d[1] * q), z = Math.round(k + d[2] * q);
      if (x < 0 || y < 0 || z < 0 || x >= NX || y >= NY || z >= NZ) break; const v = FK[x + NX * y + NXY * z]; if (v < m) m = v; if (m < -0.1) break; }
    out[id] = m; }
  FK.set(out);
}

/* ---- 2–4. toppa ---- */
// (DEBUG) triangoli girati rispetto alla somma delle normali dei vertici
const girati = (P, I, f) => { const vn = new Float64Array(P.length), fn = []; for (let t = 0; t < I.length; t += 3) { const p = [0, 1, 2].map(e => pt(P, I[t + e])), n = cross(sub(p[1], p[0]), sub(p[2], p[0])); fn.push(n); for (let e = 0; e < 3; e++) for (let k = 0; k < 3; k++) vn[3 * I[t + e] + k] += n[k]; }
  let c = 0; fn.forEach((n, q) => { if (!len(n)) return; const m = [0, 1, 2].map(k => [0, 1, 2].reduce((s, e) => s + vn[3 * I[3 * q + e] + k], 0)), cen = mul(add(add(pt(P, I[3 * q]), pt(P, I[3 * q + 1])), pt(P, I[3 * q + 2])), 1 / 3); if (dot(n, m) < -0.2 * len(n) * len(m) && (!f || f(cen))) c++; }); return c; };
function rattoppa(mu, corpi, T) {
  const fianco = FIANCO.includes(mu), SNAP = fianco ? SNAP_F : SNAP0, SUP = fianco ? SUP_F : SUP0;
  const R0 = REAL(mu), at = attrs(mu), nv0 = R0.nv, pos0 = R0.pos.subarray(0, nv0 * 3), idx0 = R0.idx, A = rq(mu), nm0 = nmDi(mu);
  // campo dei corpi vicino al muscolo (con la doccia del radiale nel capo mediale: `docciaRadiale`)
  const doc = mu === 'tri_med' && corpi.includes('n_radiale') ? docciaRadiale() : [];
  const Z = ZONA + (FIANCO.includes(mu) ? OMBRA : 0), Bc = corpi.map(rq), zlo = [0, 1, 2].map(k => Math.max(A.lo[k], Math.min(...Bc.map(b => b.lo[k])) - (Z - ZONA)) - ZONA), zhi = [0, 1, 2].map(k => Math.min(A.hi[k], Math.max(...Bc.map(b => b.hi[k])) + (Z - ZONA)) + ZONA);
  for (const [, b] of doc) for (let k = 0; k < 3; k++) { zlo[k] = Math.min(zlo[k], b[k] - ZONA); zhi[k] = Math.max(zhi[k], b[k] + ZONA); }
  griglia(zlo, zhi, H, 0); const FK = campo(corpi).F; scavaDoccia(FK, doc); if (fianco) { const { g, X } = INCROCI_X[mu] ||= incroci(mu, corpi); ombra(FK, X); INCROCI[mu] = { lato: g.map(v => +v.toFixed(2)), incroci: X.map(x => ({ ...x, c: x.c.map(v => +v.toFixed(2)), s: x.s.map(v => +v.toFixed(2)) })) }; log(mu, 'incroci', JSON.stringify(INCROCI[mu])); } const gk = { O: G.O.slice(), NX: G.NX, NY: G.NY, NZ: G.NZ };
  const fk = p => { const x = (p[0] - gk.O[0]) / H - 0.5, y = (p[1] - gk.O[1]) / H - 0.5, z = (p[2] - gk.O[2]) / H - 0.5, i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    if (i < 0 || j < 0 || k < 0 || i >= gk.NX - 1 || j >= gk.NY - 1 || k >= gk.NZ - 1) return 1; const u = x - i, v = y - j, w = z - k, b = i + gk.NX * (j + gk.NY * k), NX = gk.NX, NXY = gk.NX * gk.NY, l = (a, c, t) => a + (c - a) * t;
    return l(l(l(FK[b], FK[b + 1], u), l(FK[b + NX], FK[b + NX + 1], u), v), l(l(FK[b + NXY], FK[b + NXY + 1], u), l(FK[b + NXY + NX], FK[b + NXY + NX + 1], u), v), w); };
  const fv = P => { const f = new Float32Array(P.length / 3); for (let i = 0; i < f.length; i++) f[i] = fk(pt(P, i)); return f; };
  // 2. muscolo: raffinamento vicino alla linea T e taglio
  const ex = []; if (at.tag) ex.push({ a: at.tag, mid: MID_TAG }); if (at.fdir) ex.push({ a: at.fdir, mid: MID_DIR }); if (nm0) ex.push({ a: nm0, mid: MID_DIR });
  const Rf = raffina(pos0, idx0, ex, p => Math.abs(fk(p) - T) < 0.1), nR = Rf.pos.length / 3;
  const Mt = taglia(Rf.pos, Rf.idx, fv(Rf.pos), T, true, i => chiaveP(Rf.pos, i)), LA = anelli(Mt.seg, Mt.pos);
  if (!LA) { log(mu, 'ATTENZIONE: il taglio del muscolo non dà anelli chiusi, lasciato com\'era'); return { errore: 'taglio del muscolo' }; }
  // 3. toppa: griglia attorno alla parte tolta
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], fR = fv(Rf.pos); let aT = 0, nT = 0;
  for (let t = 0; t < Rf.idx.length; t += 3) { const v = [0, 1, 2].map(e => Rf.idx[t + e]); if (!v.some(i => fR[i] < T)) continue; const p = v.map(i => pt(Rf.pos, i)); aT += len(cross(sub(p[1], p[0]), sub(p[2], p[0]))) / 2; nT++;
    for (const q of p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }
  // (densità di riferimento: i triangoli tolti della mesh di prima, non quelli raffinati)
  let aO = 0, nO = 0; for (let t = 0; t < idx0.length; t += 3) { const p = [0, 1, 2].map(e => pt(pos0, idx0[t + e])); if (!p.some(q => fk(q) < T)) continue; aO += len(cross(sub(p[1], p[0]), sub(p[2], p[0]))) / 2; nO++; }
  griglia(lo, hi, H, 0.15); const FMu = campo([mu]).F; if (fianco) G.sfoca(FMu, LISCIA_F); const V = new Float32Array(G.N); for (let i = 0; i < G.N; i++) { const a = FMu[i], b = GIOCO - fk(G.voxel(i)), h = Math.min(1, Math.max(0, 0.5 + 0.5 * (a - b) / RACCORDO)); V[i] = b + (a - b) * h + RACCORDO * h * (1 - h); }
  const S = nets(V, () => [0, 1, 0]);
  // solo la parte vicina ai corpi (un vertice entro T + 0,05), ridotta alla densità di prima × DENSITA
  const fS = fv(S.pos), tri = []; for (let t = 0; t < S.idx.length; t += 3) if ([0, 1, 2].some(e => fS[S.idx[t + e]] < T + REGIONE)) tri.push(S.idx[t], S.idx[t + 1], S.idx[t + 2]);
  let aS = 0; for (let t = 0; t < tri.length; t += 3) { const p = [0, 1, 2].map(e => pt(S.pos, tri[t + e])); aS += len(cross(sub(p[1], p[0]), sub(p[2], p[0]))) / 2; }
  const red = riduci(Float64Array.from(S.pos), Uint32Array.from(tri), Math.max(300, Math.round(aS / (aO / Math.max(1, nO)) * DENSITA))), cmp = compatta(red.pos, red.idx);
  const ptp = Float32Array.from(cmp.pos), itp = Array.from(cmp.idx), nvp = ptp.length / 3;
  // ritorno sulla superficie di prima lontano dai corpi; vicino levigatura e gioco
  const sup = superficie(pos0, idx0), nbr = Array.from({ length: nvp }, () => new Set()); for (let t = 0; t < itp.length; t += 3) for (let e = 0; e < 3; e++) { const a = itp[t + e], b = itp[t + (e + 1) % 3]; nbr[a].add(b); nbr[b].add(a); }
  const NB = nbr.map(x => [...x]), peso = new Float32Array(nvp); for (let i = 0; i < nvp; i++) { const p = pt(ptp, i), b = sup(p); const f = fk(p); peso[i] = f >= SNAP[1] || (b && b.d < SUP) ? 1 - sstep(SNAP[0], SNAP[1], f) : 1; }   // (le pareti del canale non tornano sulla superficie)
  const gradK = p => { const e = H * 0.5; return [0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += e; b[k] -= e; return (fk(a) - fk(b)) / (2 * e); }); };
  const fuori = p => { for (let it = 0; it < 6; it++) { const f = fk(p); if (f >= GIOCO) break; const g = gradK(p), l = len(g) || 1; p = add(p, g, (GIOCO - f) / (l * l) * 1.05); } return p; };
  const gioco = () => { for (let i = 0; i < nvp; i++) ptp.set(fuori(pt(ptp, i)), 3 * i); };
  const snap = () => { for (let i = 0; i < nvp; i++) { if (peso[i] >= 1) continue; const p = pt(ptp, i), b = sup(p); if (b) ptp.set(add(p, sub(b.q, p), 1 - peso[i]), 3 * i); } };
  if (process.env.DEBUG) log('  girati toppa: nets prima della riduzione', girati(S.pos, tri));
  if (process.env.DEBUG) log('  girati toppa: nets', girati(ptp, itp)); snap(); if (process.env.DEBUG) log('  girati toppa: snap', girati(ptp, itp));
  for (let it = 0; it < LEVIGA; it++) { const lam = it % 2 ? -0.53 : 0.5, q = ptp.slice();
    for (let i = 0; i < nvp; i++) { if (!peso[i] || !NB[i].length) continue; const m = [0, 0, 0]; for (const j of NB[i]) for (let k = 0; k < 3; k++) m[k] += ptp[3 * j + k] / NB[i].length;
      for (let k = 0; k < 3; k++) q[3 * i + k] += lam * peso[i] * (m[k] - ptp[3 * i + k]); }
    ptp.set(q); if (it % 2) { snap(); gioco(); } }
  snap(); gioco(); if (process.env.DEBUG) log('  girati toppa: levigata', girati(ptp, itp));
  if (process.env.DEBUG) { const h = {}; const vn = new Float64Array(ptp.length); const fn = []; for (let t = 0; t < itp.length; t += 3) { const p = [0, 1, 2].map(e => pt(ptp, itp[t + e])), f = cross(sub(p[1], p[0]), sub(p[2], p[0])); fn.push(f); for (let e = 0; e < 3; e++) for (let k = 0; k < 3; k++) vn[3 * itp[t + e] + k] += f[k]; }
    fn.forEach((f, q) => { const n = [0, 1, 2].map(k => [0, 1, 2].reduce((s, e) => s + vn[3 * itp[3 * q + e] + k], 0)); if (len(f) && dot(f, n) < 0) { const c = mul(add(add(pt(ptp, itp[3 * q]), pt(ptp, itp[3 * q + 1])), pt(ptp, itp[3 * q + 2])), 1 / 3), b = (Math.round(fk(c) * 20) / 20).toFixed(2) + (c[1] < -13.9 ? 'tappo' : ''); h[b] = (h[b] || 0) + 1; } }); log('  pieghe toppa per fk', JSON.stringify(h)); }
  if (process.env.DEBUG) log('  girati: muscolo', girati(pos0, idx0, p => fk(p) < 1), 'toppa', girati(ptp, itp));
  // taglio della toppa lungo la stessa linea (resta f < T); via i pezzetti staccati (componenti senza bordo di taglio)
  // (prima del taglio anche la toppa si raffina vicino alla linea, e i punti nuovi vanno sulla superficie di prima: le due linee coincidono)
  const Rp = raffina(ptp, itp, [], p => Math.abs(fk(p) - T) < 0.1), pr = Rp.pos;
  for (let i = nvp; i < pr.length / 3; i++) { const p = pt(pr, i), w = sstep(SNAP[0], SNAP[1], fk(p)), b = w > 0 ? sup(p) : null; if (b) pr.set(add(p, sub(b.q, p), w), 3 * i); }
  const Tt = taglia(pr, Rp.idx, fv(pr), T, false, i => chiaveP(pr, i)), nP = Tt.pos.length / 3, nT2 = Tt.idx.length / 3;
  const par = Int32Array.from({ length: nP }, (_, i) => i), trova = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < nT2; t++) for (let e = 1; e < 3; e++) { const a = trova(Tt.idx[3 * t]), b = trova(Tt.idx[3 * t + e]); if (a !== b) par[a] = b; }
  const conBordo = new Set(Tt.seg.map(([u]) => trova(u))), itp2 = []; let staccati = 0; for (let t = 0; t < nT2; t++) if (conBordo.has(trova(Tt.idx[3 * t]))) itp2.push(Tt.idx[3 * t], Tt.idx[3 * t + 1], Tt.idx[3 * t + 2]); else staccati++;
  const LB = anelli(Tt.seg, Tt.pos);
  if (!LB && process.env.DEBUG) { const da = new Map(), a = new Map(); for (const [u, v] of Tt.seg) { da.set(u, v); a.set(v, u); }
    const capi = [...da.keys()].filter(u => !a.has(u)), code = [...a.keys()].filter(v => !da.has(v)), bb = riquadro(S.pos);
    log('  catene aperte', capi.length, code.length, 'riquadro della griglia', bb.lo.map(x => x.toFixed(2)), bb.hi.map(x => x.toFixed(2)));
    for (const u of [...capi, ...code].slice(0, 12)) log('   ', pt(Tt.pos, u).map(x => x.toFixed(2)).join(' ')); }
  if (process.env.DEBUG && LB && LB.length !== LA.length) { const lu = (P, L) => L.reduce((s, v, k) => s + len(sub(pt(P, v), pt(P, L[(k + 1) % L.length]))), 0);
    log('    anelli muscolo', LA.map(L => lu(Mt.pos, L).toFixed(2) + '@' + pt(Mt.pos, L[0]).map(x => x.toFixed(2))).join(' '));
    log('    anelli toppa', LB.map(L => lu(Tt.pos, L).toFixed(2) + '@' + pt(Tt.pos, L[0]).map(x => x.toFixed(2))).join(' ')); }
  if (!LB || LB.length !== LA.length) { log(mu, 'ATTENZIONE: anelli diversi (muscolo', LA.length, 'toppa', LB ? LB.length : '?', '), lasciato com\'era'); return { errore: 'anelli' }; }
  if (process.env.DEBUG) log('  girati dopo il taglio: muscolo', girati(Mt.pos, Mt.idx, p => fk(p) < 1), 'toppa', girati(Tt.pos, itp2));
  // 4. unione e cucitura
  const nM = Mt.pos.length / 3, pos = new Float32Array((nM + nP) * 3); pos.set(Mt.pos); pos.set(Tt.pos, nM * 3);
  const idx = Mt.idx.slice(); for (const v of itp2) idx.push(v + nM);
  const bar = L => { const c = [0, 0, 0]; for (const v of L) for (let k = 0; k < 3; k++) c[k] += pos[3 * v + k] / L.length; return c; };
  const liberi = LB.map(L => L.map(v => v + nM)); let larg = 0;
  for (const La of LA) { const c = bar(La); liberi.sort((x, y) => len(sub(bar(x), c)) - len(sub(bar(y), c))); const Lb = liberi.shift(), r = cuci(pos, La, Lb); for (const t of r.T) idx.push(...t); larg = Math.max(larg, r.larg);
    if (fianco && r.larg > CUCI_F) { log(mu, 'ATTENZIONE: anello cucito largo', (r.larg * 10).toFixed(2), 'mm (anelli non corrispondenti), lasciato com\'era'); return { errore: 'cucitura' }; }
    if (process.env.DEBUG) { const hd = (X, Y) => Math.max(...X.map(i => Math.min(...Y.map(j => len(sub(pt(pos, i), pt(pos, j))))))), lu = L => L.reduce((s, v, k) => s + len(sub(pt(pos, v), pt(pos, L[(k + 1) % L.length]))), 0);
      log('  anello', La.length, lu(La).toFixed(2), '/', Lb.length, lu(Lb).toFixed(2), 'distanza A→B', hd(La, Lb).toFixed(4), 'B→A', hd(Lb, La).toFixed(4), 'larghezza', r.larg.toFixed(4)); } }
  // attributi: muscolo (raffinato e tagliato: i punti del taglio prendono quelli del vertice più vicino del lato), toppa dal vertice di prima più vicino
  const nTot = nM + nP, attr = (src, m) => { const out = new (src.constructor)(nTot * m); out.set(src.subarray(0, nR * m));
    Mt.orig.forEach(([a, b, t], q) => { const i = nR + q, s = t < 0.5 ? a : b; for (let k = 0; k < m; k++) out[m * i + k] = src[m * s + k]; }); return out; };
  let e0 = 0; const tag = at.tag ? attr(Uint8Array.from(Rf.extra[e0++]), 1) : null, fdir = at.fdir ? attr(Int8Array.from(Rf.extra[e0++]), 3) : null, nmM = nm0 ? attr(Int8Array.from(Rf.extra[e0++]), 3) : null;
  for (let i = nM; i < nTot; i++) { const p = pt(pos, i), b = sup(p); if (!b) continue; const vs = [idx0[3 * b.t], idx0[3 * b.t + 1], idx0[3 * b.t + 2]]; let a = vs[0], bd = 1e9;
    for (const v of vs) { const e = len(sub(p, pt(pos0, v))); if (e < bd) { bd = e; a = v; } }
    if (tag) tag[i] = at.tag[a]; if (fdir) for (let k = 0; k < 3; k++) fdir[3 * i + k] = at.fdir[3 * a + k]; }
  // via i triangoli con due vertici nello stesso punto (taglio vicino a un vertice, punti dei due bordi coincidenti): per posizione la superficie resta chiusa
  const idxN = []; for (let t = 0; t < idx.length; t += 3) { const k = [0, 1, 2].map(e => chiaveP(pos, idx[t + e])); if (k[0] !== k[1] && k[1] !== k[2] && k[0] !== k[2]) idxN.push(idx[t], idx[t + 1], idx[t + 2]); }
  // riduzione della fascia raffinata (muscolo attorno al taglio, cucitura, toppa) alla densità di prima × DENSITA: via anche i triangoli sottili
  // della cucitura; fissi i vertici lontani (mesh di prima, intatta) e quelli che condividono la posizione con un altro (giunture dei tag)
  const nTot2 = pos.length / 3, fisso = new Uint8Array(nTot2), quanti = new Map(); for (let i = 0; i < nTot2; i++) { const k = chiaveP(pos, i); quanti.set(k, (quanti.get(k) || 0) + 1); }
  for (let i = 0; i < nTot2; i++) if (fk(pt(pos, i)) > T + 0.15 || quanti.get(chiaveP(pos, i)) > 1) fisso[i] = 1;
  let nFissi = 0, aLib = 0; for (let t = 0; t < idxN.length; t += 3) { const v = [0, 1, 2].map(e => idxN[t + e]); if (v.every(i => fisso[i])) { nFissi++; continue; } const p = v.map(i => pt(pos, i)); aLib += len(cross(sub(p[1], p[0]), sub(p[2], p[0]))) / 2; }
  if (process.env.DEBUG) log('  girati dopo la cucitura', girati(pos, idxN, p => fk(p) < 1));
  const rid = riduci(Float64Array.from(pos), Uint32Array.from(idxN), nFissi + Math.round(aLib / (aO / Math.max(1, nO)) * DENSITA), fisso);
  const extra = [tag, fdir, nmM].filter(Boolean), c2 = compatta(rid.pos, rid.idx, extra), P2 = Float32Array.from(c2.pos), nv = P2.length / 3; let I2 = c2.idx;
  let q = 0; const T2 = tag ? c2.extra[q++] : null, D2 = fdir ? c2.extra[q++] : null, N2 = nmM ? c2.extra[q++] : null;
  if (process.env.DEBUG) log('  girati dopo la riduzione', girati(P2, I2, p => fk(p) < 1));
  // fori piccoli (anelli corti tolti, giunture doppie al tappo): chiusi a ventaglio se il bordo è più corto di `FORO`
  const chiusi = chiudiFori(P2, I2, p => fk(p) < 1); if (chiusi.length) I2 = Uint32Array.from([...I2, ...chiusi]);
  // pieghe rimaste attorno al taglio e alla cucitura (vertici fissi esclusi)
  const fisso2 = new Uint8Array(nv), quanti2 = new Map(); for (let i = 0; i < nv; i++) { const k = chiaveP(P2, i); quanti2.set(k, (quanti2.get(k) || 0) + 1); }
  for (let i = 0; i < nv; i++) if (fk(pt(P2, i)) > T + 0.15 || quanti2.get(chiaveP(P2, i)) > 1) fisso2[i] = 1;
  const pieghe = distendi(P2, I2, i => !fisso2[i], fuori);
  const chiusi2 = chiudiFori(P2, I2, p => fk(p) < 1); if (chiusi2.length) { if (process.env.DEBUG) log('  fori chiusi dopo la distensione', chiusi2.length / 3); I2 = Uint32Array.from([...I2, ...chiusi2]); }
  if (process.env.DEBUG) log('  girati dopo la distensione', girati(P2, I2, p => fk(p) < 1), 'pieghe', pieghe);
  // normali: nuove entro T + 0,15 dai corpi (toppa, cucitura e attorno), altrove quelle del file
  const NL = normaliLisce(P2, I2, T2), nrm = new Int8Array(nv * 3);
  for (let i = 0; i < nv; i++) { const nuova = !N2 || fk(pt(P2, i)) < T + 0.15; for (let k = 0; k < 3; k++) nrm[3 * i + k] = nuova ? NL[3 * i + k] : N2[3 * i + k]; }
  // controlli
  let gmin = 1; for (let t = 0; t < I2.length; t += 3) { const p = [0, 1, 2].map(e => pt(P2, I2[t + e])); gmin = Math.min(gmin, fk(p[0]), fk(mul(add(add(p[0], p[1]), p[2]), 1 / 3))); }
  const conta = (I, P) => { const u = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = chiaveP(P, I[t + e]), b = chiaveP(P, I[t + (e + 1) % 3]), k = a < b ? a + '|' + b : b + '|' + a; u.set(k, (u.get(k) || 0) + 1); }
    let n1 = 0, n3 = 0; for (const n of u.values()) { if (n === 1) n1++; if (n > 2) n3++; } return n1 + '/' + n3; };
  const aperti = [conta(idx0, pos0), conta(I2, P2)], v0 = volume(pos0, idx0), v1 = volume(P2, I2);
  setMesh(mu, { pos: P2, idx: I2, tag: T2, fdir: D2, nrm }); delete RQ[mu]; NRM_ULTIMO[mu] = nrm;
  log(mu, 'toppa attorno a', corpi.join(','), '| anelli', LA.length, '| toppa', itp2.length / 3, 'triangoli (pezzetti staccati tolti', staccati + ') | cucitura larga al massimo', (larg * 10).toFixed(3), 'mm | volume', v0.toFixed(2), '→', v1.toFixed(2), 'cm³ | gioco minimo', (gmin * 10).toFixed(2), 'mm | lati aperti/non manifold', aperti.join(' → '));
  return { anelli: LA.length, triangoli: [idx0.length / 3, I2.length / 3], cucitura_mm: +(larg * 10).toFixed(3), volume_cm3: [+v0.toFixed(2), +v1.toFixed(2)], gioco_min_mm: +(gmin * 10).toFixed(2), lati_aperti_non_manifold: aperti };
}

/* ---- correzione ---- */
const nomi = SOLO || MUSCOLI;
const INCROCI = {}, INCROCI_X = {};
const PRIMA = controllo(nomi); log('prima', JSON.stringify(PRIMA));
const daFare = {}; for (const k of Object.keys(PRIMA)) { const [mu, nv] = k.split('/'); (daFare[mu] ||= []).push(nv); }
// se le linee di taglio del muscolo e della toppa non danno gli stessi anelli (superficie che sfiora il livello), si riprova con un altro livello
const ESITO = {}; for (const [mu, corpi] of Object.entries(daFare)) for (const T of FIANCO.includes(mu) ? LIVELLI_F : LIVELLI) { ESITO[mu] = rattoppa(mu, corpi, T); if (!ESITO[mu].errore) break; }
// muscoli da un lato del fascio: un pezzo rimasto staccato (meno di PEZZO_F dei vertici: dove il fascio tocca l'osso non resta spazio per il
// muscolo e il suo capo oltre il fascio si stacca) si toglie
const STACCATI = {};
for (const mu of Object.keys(ESITO).filter(m => FIANCO.includes(m) && !ESITO[m].errore)) { const R = REAL(mu), at = attrs(mu), nm = topoNrm(mu), nv = R.nv;
  const K = new Map(), v = new Int32Array(nv); for (let i = 0; i < nv; i++) { const k = chiaveP(R.pos, i); if (!K.has(k)) K.set(k, K.size); v[i] = K.get(k); }
  const par = Int32Array.from({ length: K.size }, (_, i) => i), f = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < R.idx.length; t += 3) { par[f(v[R.idx[t]])] = f(v[R.idx[t + 1]]); par[f(v[R.idx[t + 1]])] = f(v[R.idx[t + 2]]); }
  const n = new Map(); for (let i = 0; i < nv; i++) { const r = f(v[i]); n.set(r, (n.get(r) || 0) + 1); }
  const tieni = new Set([...n].filter(([, c]) => c >= PEZZO_F * nv).map(([r]) => r)); if (tieni.size === n.size) continue;
  const I = []; for (let t = 0; t < R.idx.length; t += 3) if (tieni.has(f(v[R.idx[t]]))) I.push(R.idx[t], R.idx[t + 1], R.idx[t + 2]);
  const extra = [at.tag, at.fdir, nm].filter(Boolean), c = compatta(Float64Array.from(R.pos.subarray(0, nv * 3)), Uint32Array.from(I), extra); let q = 0;
  const mesh = { pos: Float32Array.from(c.pos), idx: c.idx, tag: at.tag ? c.extra[q++] : null, fdir: at.fdir ? c.extra[q++] : null, nrm: nm ? c.extra[q++] : null };
  STACCATI[mu] = [...n.values()].filter(x => x < PEZZO_F * nv); setMesh(mu, mesh); delete RQ[mu];
  log(mu, 'tolti i pezzi staccati di', STACCATI[mu].join(', '), 'vertici'); }
const DOPO = controllo(Object.keys(daFare)); log('dopo', JSON.stringify(DOPO));
log('esito', JSON.stringify(ESITO)); if (Object.keys(STACCATI).length) log('pezzi staccati tolti', JSON.stringify(STACCATI));
if (!PROVA && Object.keys(daFare).length) saveFile(repack());
