/* Flessori-pronatori del gomito (modelli/gomito-3d.html): pronatore rotondo, FCR, palmare lungo, FDS, FDP, FCU, FPL.
   L'origine tendinea comune di pronatore, FCR, palmare lungo, FDS e FCU (forma da tendine-comune-gomito.mjs) è parte delle loro mesh: nel modello
   non esiste una struttura `cft` a sé (la lamina è una mesh temporanea, usata come ostacolo e poi fusa nei muscoli).

   Uso (dalla cartella del progetto):
     node strumenti/flessori-pronatori-gomito.mjs              → riscrive le mesh (con il lacerto fibroso e i tubi di nervi e vasi) nel file del modello
     MODELLO=/tmp/copia.html node strumenti/flessori-pronatori-gomito.mjs   → lavora su una copia
     PASSO=0.08 …                                              → passo della griglia in cm (default 0,07)
     node strumenti/flessori-pronatori-gomito.mjs verifica     → non scrive: topologia, buchi, compenetrazioni e tubi delle mesh del file
     opzioni: senza-tubi (non sposta né ritaglia nervi e vasi)

   Il metodo è descritto in GUIDA_MODELLI.md. Riparte sempre da mesh e tubi della revisione `PARTENZA` (idempotente). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { campoCft, appoggio, meshCft } = await import('./tendine-comune-gomito.mjs');
const { setMesh, clamp, sstep, log, repack, saveFile, realDaRevisione, REAL } = G;

const PARTENZA = 'd587775';                 // revisione con le mesh di partenza (prima di questo strumento)
const FILE_REPO = 'modelli/gomito-3d.html';
const MUSCOLI = ['fdp', 'fpl', 'fds', 'pt', 'fcr', 'pl', 'fcu'];
const ALTRI = MUSCOLI.filter(m => m !== 'fcu');
const PASSO = Number(process.env.PASSO || 0.07);   // cm, griglia
const CHIUSURA = 0.25;                     // cm, raggio della chiusura che riempie i tunnel delle mesh di partenza
const LISCIA = 0.04;                       // cm, sigma della levigatura del campo di partenza (la forma è già levigata sulla mesh: `LISCIA_MESH`)
const LISCIA_MESH = { suddividi: 1, taubin: 40 };   // la mesh di partenza (faccette di ~3 mm) è suddivisa e levigata con Taubin, che non assottiglia le lamine
const LISCIA2 = 0.045;                     // cm, sigma della levigatura finale (dopo i ritagli)
const GIOCO = { osso: 0.045, struttura: 0.02, muscolo: 0.025, tubo: 0.045, cute: 0.2, cft: 0.03 };   // cm
const Y_TAGLIO = -12;
const CRESCITA = { max: 0.7, maxAltri: 0.4, sigma: 0.8 };   // cm: crescita massima nel piano (FCU, altri muscoli) e levigatura del suo profilo lungo y
const TUBI_FCU = ['n_ulnare', 'a_ulnare'];
const APERTURA = { fcu: 0.2, fds: 0.1, pt: 0.12, altri: 0.08 };
// capo omerale del pronatore rotondo: nella mesh di partenza era un cordone di 0,25 cm² tra epicondilo e ventre; in anatomia è un'origine
// carnosa dall'epicondilo mediale e dalla cresta sopracondiloidea. Linea d'asse [y, x, z, scala della sezione] (gira attorno al lato mediale del nervo mediano,
// e si perde nel ventre), spessore (verso il nervo) e larghezza della sezione, raccordo col ventre, chiusura [raggio, tratto y in cui entra] (cm)
const CAPO_OMERALE_PT = { cresta: [[3.15, 2.2, 0.45], [2.75, 2.25, 0.55], [2.35, 2.3, 0.65]], asse: [[2.0, 2.30, 1.25, 0.7], [1.7, 2.25, 1.35, 0.9], [1.4, 2.19, 1.45, 1], [1.0, 2.12, 1.72, 1], [0.6, 2.12, 2.18, 1], [0.2, 1.75, 2.55, 0.95], [-0.2, 1.15, 2.5, 0.8], [-0.6, 0.7, 2.5, 0.7], [-1.0, 0.35, 2.5, 0.6]], spessore: 0.8, larghezza: 1.3, raccordo: 0.4, chiusura: [0.3, [0.3, 0.8]] };
// tendine d'inserzione del pronatore rotondo: nella mesh di partenza il ventre finiva a punta ~4 mm davanti al radio, senza tendine; il tendine,
// piatto, scende dal ventre (y = da[0]) sull'angolo anterolaterale del radio (`direzione` in x, z dal centro dell'osso: il lato laterale è coperto
// dal supinatore, la faccia anteriore è del FPL) e finisce in y = a
const INS_PT = { direzione: [-0.75, 0.66], da: [-7.0, -7.6], contatto: -8.3, a: -9.1, spessore: [0.6, 0.36], larghezza: [0.95, 0.75], tendine: [-7.5, -8.3], raccordo: 0.15 };
// raccordi (cm) del massimo "morbido" tra il campo del muscolo e i vincoli: i solchi dei vasi e le linee di divisione tra due muscoli hanno margini
// arrotondati invece di spigoli vivi
const RACCORDO = { tubo: 0.18, muscolo: 0.12, ostacolo: 0.05 };
// vene superficiali e nervi cutanei stanno nel sottocutaneo, sopra la fascia: non scavano i muscoli, si portano sopra la loro superficie
// tratti (y) in cui un tubo profondo passa sopra i muscoli invece di affondarvi: il ramo superficiale del radiale, sotto il brachioradiale,
// incrocia superficialmente l'inserzione del pronatore rotondo sul radio
const SOPRA = { n_rad_sup: [-9.6, -7.0] };
// FDS e FPL restano davanti al radio: sotto y = da (raccordo tra da[0] e da[1]) non vanno lateralmente oltre il centro del radio − margine
// (lì c'è l'inserzione del pronatore, sotto il brachioradiale), il FDS solo fino a `sopra` cm davanti al centro dell'osso
const LATO_RADIO = { da: [-4.5, -5.5], margine: 0.5, sopra: { fds: 0.85, fpl: 9 } };
const SUPERFICIALI = ['v_cefalica', 'v_basilica', 'v_mediana_cub', 'v_mediana_avambraccio', 'n_cut_med_avambraccio', 'n_cut_med_braccio', 'n_cut_post_avambraccio', 'n_cut_lat'];

const argv = process.argv.slice(2);
const CON_TUBI = !argv.includes('senza-tubi');
const VERIFICA = argv.includes('verifica');

/* ============ Griglia ============ */
const AREA = { lo: [-5.3, -12.4, -3.3], hi: [3.9, 3.3, 6.1] };
G.griglia(AREA.lo, AREA.hi, PASSO, 0);
const { N, NX, NY, NZ, NXY } = G;
log(`griglia ${NX}×${NY}×${NZ} (${(N / 1e6).toFixed(1)} M voxel, passo ${PASSO} cm)`);
const gauss = (F, sigmaCm) => G.sfoca(F, Math.max(1, Math.round((sigmaCm / PASSO) ** 2 * 1.5)));   // media 3×3×3 ripetuta (varianza 2/3 voxel² per passata)
const vox = q => G.voxel(q);
// massimo raccordato (polinomiale): uguale a max(a, b) lontano dal pareggio, più alto di al più k/4 dove a ≈ b
const smin = (a, b, k) => -smax(-a, -b, k);
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const yDi = q => G.O[1] + (((q / NX) | 0) % NY + 0.5) * PASSO;
const jDi = q => ((q / NX) | 0) % NY;

/* ============ Mesh di partenza ============ */
const partenza = new Map();
function daPartenza(id) {
  if (!partenza.has(id)) { const m = realDaRevisione(PARTENZA, id, FILE_REPO); partenza.set(id, { pos: Float32Array.from(m.pos), idx: m.idx, tag: m.tag, fdir: m.fdir }); }
  return partenza.get(id);
}

/* ============ Verifica delle mesh del file ============ */
// punto dentro un solido: maggioranza di tre raggi (assi x, y, z) su indici a griglia dei triangoli (le mesh dei surface nets hanno qualche spigolo non-manifold)
function solidoTest(id) {
  const { pos, idx } = REAL(id), nt = idx.length / 3, C = 0.1, griglie = [];
  const V = t => [0, 1, 2].map(k => [pos[3 * idx[3 * t + k]], pos[3 * idx[3 * t + k] + 1], pos[3 * idx[3 * t + k] + 2]]);
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3, g = new Map();
    for (let t = 0; t < nt; t++) { const q = V(t), u0 = Math.floor(Math.min(q[0][u], q[1][u], q[2][u]) / C), u1 = Math.floor(Math.max(q[0][u], q[1][u], q[2][u]) / C), v0 = Math.floor(Math.min(q[0][v], q[1][v], q[2][v]) / C), v1 = Math.floor(Math.max(q[0][v], q[1][v], q[2][v]) / C);
      for (let i = u0; i <= u1; i++) for (let j = v0; j <= v1; j++) { const k = i + ',' + j; if (!g.has(k)) g.set(k, []); g.get(k).push(q); } }
    griglie.push(g);
  }
  const dentro = p => {
    let voti = 0;
    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3, v = (a + 2) % 3; let c = 0;
      for (const q of griglie[a].get(Math.floor(p[u] / C) + ',' + Math.floor(p[v] / C)) || []) {
        const d = (q[1][v] - q[2][v]) * (q[0][u] - q[2][u]) + (q[2][u] - q[1][u]) * (q[0][v] - q[2][v]); if (Math.abs(d) < 1e-12) continue;
        const l1 = ((q[1][v] - q[2][v]) * (p[u] - q[2][u]) + (q[2][u] - q[1][u]) * (p[v] - q[2][v])) / d, l2 = ((q[2][v] - q[0][v]) * (p[u] - q[2][u]) + (q[0][u] - q[2][u]) * (p[v] - q[2][v])) / d, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue; if (l1 * q[0][a] + l2 * q[1][a] + l3 * q[2][a] > p[a]) c++;
      }
      voti += c & 1;
    }
    return voti >= 2;
  };
  const distanza = p => {   // distanza esatta dalla superficie (Ericson, Real-Time Collision Detection 5.1.5)
    let best = 1e9; const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    for (let t = 0; t < nt; t++) {
      const [a, b, c] = V(t), ab = sub(b, a), ac = sub(c, a), ap = sub(p, a); let q;
      const d1 = dot(ab, ap), d2 = dot(ac, ap), bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp), cc = sub(p, c), d5 = dot(ab, cc), d6 = dot(ac, cc), vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
      if (d1 <= 0 && d2 <= 0) q = a; else if (d3 >= 0 && d4 <= d3) q = b; else if (d6 >= 0 && d5 <= d6) q = c;
      else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const w = d1 / (d1 - d3); q = [a[0] + ab[0] * w, a[1] + ab[1] * w, a[2] + ab[2] * w]; }
      else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
      else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
      else { const dn = 1 / (va + vb + vc), v = vb * dn, w = vc * dn; q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]; }
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < best) best = d;
    }
    return best;
  };
  return { dentro, distanza };
}
function topologia(id) {
  const { pos, idx } = REAL(id), nv = pos.length / 3, E = new Map(), par = new Int32Array(nv).map((_, i) => i), f = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; const k = a < b ? a * nv + b : b * nv + a; E.set(k, (E.get(k) || 0) + 1); par[f(a)] = f(b); }
  let bordo = 0, nonman = 0; for (const c of E.values()) { if (c === 1) bordo++; else if (c > 2) nonman++; }
  const comp = new Set(); for (let t = 0; t < idx.length; t++) comp.add(f(idx[t]));
  return { nv, componenti: comp.size, bordo, nonman };
}
// sezioni voxel (assi x, y, z) con buchi chiusi: un tunnel compare come buco nelle sezioni perpendicolari al suo asse
function buchiNelleSezioni(id) {
  const M = G.solid(id), dims = [NX, NY, NZ], risultato = [];
  for (let ax = 0; ax < 3; ax++) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, nu = dims[u], nvv = dims[v], sezioni = [];
    for (let a = 0; a < dims[ax]; a++) {
      const gr = new Uint8Array(nu * nvv), lab = new Int32Array(nu * nvv).fill(-1);
      for (let j = 0; j < nvv; j++) for (let i = 0; i < nu; i++) { const c = [0, 0, 0]; c[ax] = a; c[u] = i; c[v] = j; gr[i + nu * j] = M[c[0] + NX * c[1] + NXY * c[2]]; }
      for (let s0 = 0; s0 < nu * nvv; s0++) {
        if (gr[s0] || lab[s0] >= 0) continue; const st = [s0]; lab[s0] = s0; let tocca = false, cnt = 0;
        while (st.length) { const q = st.pop(), qi = q % nu, qj = (q / nu) | 0; cnt++; if (qi === 0 || qj === 0 || qi === nu - 1 || qj === nvv - 1) tocca = true;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i2 = qi + di, j2 = qj + dj; if (i2 < 0 || j2 < 0 || i2 >= nu || j2 >= nvv) continue; const q2 = i2 + nu * j2; if (!gr[q2] && lab[q2] < 0) { lab[q2] = s0; st.push(q2); } } }
        if (!tocca && cnt * PASSO * PASSO >= 0.04) sezioni.push(a);   // ≥ 4 mm²
      }
    }
    if (sezioni.length) risultato.push(`asse ${'xyz'[ax]}: ${sezioni.length} sezioni (${(G.O[ax] + sezioni[0] * PASSO).toFixed(2)} … ${(G.O[ax] + sezioni[sezioni.length - 1] * PASSO).toFixed(2)})`);
  }
  return risultato;
}
function verifica() {
  const altri = ['omero', 'ulna', 'radio', 'cart_omero', 'cart_ulna', 'cart_radio', 'caps', 'fat_ant', 'fat_post', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'anulare', 'lucl', 'mio', 'osborne', 'lacerto', 'brach', 'bic', 'br', 'sup', 'ecrl', 'ecrb', 'edc', 'ecu', 'anc', 'tri_med'];
  const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
  const solidi = new Map(); const test = id => { if (!solidi.has(id)) solidi.set(id, solidoTest(id)); return solidi.get(id); };
  let tutto = true;
  for (const id of MUSCOLI) {
    const t = topologia(id), { pos } = REAL(id), nv = pos.length / 3, righe = [], buchi = buchiNelleSezioni(id);
    if (t.componenti !== 1 || t.bordo || buchi.length) tutto = false;
    console.log(`${id}: ${t.nv} vertici, ${t.componenti} componente/i, ${t.bordo} spigoli di bordo, ${t.nonman} spigoli non-manifold; buchi nelle sezioni: ${buchi.length ? buchi.join('; ') : 'nessuno'}`);
    for (const b of [...MUSCOLI.filter(m => m !== id), ...altri]) {
      const T = test(b); let n = 0, pf = 0;
      for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; if (p[1] < Y_TAGLIO + 0.02) continue; if (T.dentro(p)) { const d = T.distanza(p); if (d > 0.003) { n++; pf = Math.max(pf, d); } } }
      if (n) righe.push(`${b}: ${n} (${(pf * 10).toFixed(2)} mm)`);
    }
    for (const [tid, P] of Object.entries(NVP.pts)) {
      let n = 0, pf = 0;
      for (let i = 0; i < nv; i++) { let d = 1e9; for (let k = 0; k + 1 < P.length; k++) { const a = P[k], b = P[k + 1], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], L2 = ux * ux + uy * uy + uz * uz || 1e-9, q = clamp(((pos[3 * i] - a[0]) * ux + (pos[3 * i + 1] - a[1]) * uy + (pos[3 * i + 2] - a[2]) * uz) / L2, 0, 1); d = Math.min(d, Math.hypot(pos[3 * i] - a[0] - ux * q, pos[3 * i + 1] - a[1] - uy * q, pos[3 * i + 2] - a[2] - uz * q)); }
        if (d < NVP.r[tid] - 0.003) { n++; pf = Math.max(pf, NVP.r[tid] - d); } }
      if (n) righe.push(`[${tid}]: ${n} (${(pf * 10).toFixed(2)} mm)`);
    }
    console.log('  vertici dentro: ' + (righe.length ? righe.join(', ') : 'nessuno'));
  }
  console.log(tutto ? 'Topologia: una sola componente chiusa e nessun buco per ogni muscolo.' : 'ATTENZIONE: componenti multiple, bordi aperti o buchi nelle sezioni.');
}
if (VERIFICA) { verifica(); process.exit(0); }
for (const id of MUSCOLI) { const m = daPartenza(id); G.setMesh(id, { pos: m.pos, idx: m.idx, tag: m.tag, fdir: m.fdir }); }

/* ============ Nervi e vasi (tubi procedurali della pagina) ============ */
// i tubi ripartono da quelli della revisione di partenza (lo strumento li riscrive nella pagina)
const htmlPartenza = (await import('node:child_process')).execFileSync('git', ['show', `${PARTENZA}:${FILE_REPO}`], { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'), maxBuffer: 1 << 30 }).toString('utf8');
const NVP = JSON.parse(htmlPartenza.match(/const NVP=(\{.*?\});\n/s)[1]);
const NVP0 = JSON.parse(JSON.stringify(NVP));
const PARENT = (() => { const m = G.M.html.match(/const PARENT=(\{.*?\});/s); return m ? Function(`return (${m[1]})`)() : {}; })();
// raggio efficace (la pagina appiattisce le vene e gonfia i nervi e le valvole delle vene)
const reff = id => NVP.r[id] * (id.startsWith('v_') ? 1.25 : id.startsWith('n_') ? 1.08 : 1.05);

/* ============ Campi degli ostacoli ============ */
const OSSA = ['omero', 'ulna', 'radio'];
const STRUTT = ['cart_omero', 'cart_ulna', 'cart_radio', 'caps', 'fat_ant', 'fat_post', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'anulare', 'lucl', 'quadrato', 'mio', 'osborne', 'bor_bicrad', 'bor_olecr'];
const VICINI = ['brach', 'bic', 'br', 'sup', 'ecrl', 'ecrb', 'edc', 'ecu', 'anc', 'tri_med', 'tri_lungo', 'setto_med'];
// distanza esatta dalle mesh vicino alla superficie, con il segno dalla maschera dei voxel (le normali di capsula, legamenti e lamine non sono affidabili)
function campoDi(nomi) {
  const M = G.unione(nomi), { F } = G.sdf(M); gauss(F, 0.02); G.esatta(F, nomi, 0.12);
  for (let q = 0; q < N; q++) if (Math.abs(F[q]) <= 0.12) F[q] = (M[q] ? -1 : 1) * Math.abs(F[q]);
  return F;
}
// distanza con segno dall'asse dei tubi meno il raggio (nervi e vasi), solo entro 0,6 cm
function campoTubi(solo, escludi = []) {
  const F = new Float32Array(N).fill(1);
  for (const [id, P] of Object.entries(NVP.pts)) {
    if (solo && !solo.includes(id)) continue;
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
const campi = {};
const J_CUTE = Math.round((Y_TAGLIO + 0.5 - G.O[1]) / PASSO);   // sotto y = −11,5 la distanza dalla cute si legge a −11,5 (la cute è chiusa da un tappo sul piano di taglio)
campi.osso = campoDi(OSSA); log('campo ossa');
campi.struttura = campoDi(STRUTT); log('campo strutture');
campi.muscolo = campoDi(VICINI); log('campo muscoli vicini');
campi.cute = campoDi(['cute']); log('campo cute');
// tendine comune: lamina unica sull'epicondilo mediale (strumenti/tendine-comune-gomito.mjs), rifatta a ogni esecuzione; i muscoli vi si appoggiano.
// Prima di spostare i vasi la lamina evita solo cute e nervo ulnare; poi (`rifaiCft`) è ricavata di nuovo con un solco per ogni nervo, arteria e vena
// nella posizione finale (i vasi sono già stati portati sulla sua superficie da `spostaTubi`: restano solchi poco profondi)
const FAPP = appoggio();
function rifaiCft(extra) {
  const m = meshCft(campoCft(Float32Array.from(FAPP), { cute: campi.cute, giocoCute: GIOCO.cute, ...extra })); G.setMesh('cft', m);
  log(`tendine comune: ${m.pos.length / 3} vertici, ${m.componenti} componenti (${m.isole} voxel isolati)`);
}
rifaiCft({ nervo: campoTubi(['n_ulnare']), giocoNervo: GIOCO.tubo });
campi.cft = campoDi(['cft']); log('campo tendine comune');
campi.cuteDentro = campi.cute.map(v => -v);   // positivo dentro la cute: i tubi non devono avvicinarsi alla cute più di quanto erano
// dietro la membrana interossea (tra radio e ulna, verso il compartimento posteriore) non ci sono flessori: la mesh del FDP vi passava con un lobo
const zMio = (() => {
  const { pos, idx } = REAL('mio'), lo = new Float32Array(NX * NY).fill(Infinity), hi = new Float32Array(NX * NY).fill(-Infinity);
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2], den = (pos[b + 1] - pos[c + 1]) * (pos[a] - pos[c]) + (pos[c] - pos[b]) * (pos[a + 1] - pos[c + 1]); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(pos[a], pos[b], pos[c]) - G.O[0]) / PASSO - 0.5)), i1 = Math.min(NX - 1, Math.floor((Math.max(pos[a], pos[b], pos[c]) - G.O[0]) / PASSO - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(pos[a + 1], pos[b + 1], pos[c + 1]) - G.O[1]) / PASSO - 0.5)), j1 = Math.min(NY - 1, Math.floor((Math.max(pos[a + 1], pos[b + 1], pos[c + 1]) - G.O[1]) / PASSO - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = G.O[0] + (i + 0.5) * PASSO, y = G.O[1] + (j + 0.5) * PASSO;
      const l1 = ((pos[b + 1] - pos[c + 1]) * (x - pos[c]) + (pos[c] - pos[b]) * (y - pos[c + 1])) / den, l2 = ((pos[c + 1] - pos[a + 1]) * (x - pos[c]) + (pos[a] - pos[c]) * (y - pos[c + 1])) / den, l3 = 1 - l1 - l2;
      if (l1 < 0 || l2 < 0 || l3 < 0) continue; const z = l1 * pos[a + 2] + l2 * pos[b + 2] + l3 * pos[c + 2], k = i + NX * j; if (z < lo[k]) lo[k] = z; if (z > hi[k]) hi[k] = z;
    }
  }
  const Z = new Float32Array(NX * NY).fill(NaN); for (let k = 0; k < Z.length; k++) if (Number.isFinite(lo[k])) Z[k] = (lo[k] + hi[k]) / 2;
  return Z;
})();

/* ============ Limite posteriore del FCU: non oltre il bordo posteriore dell'ulna ============ */
function profilo(pos, f, Y0 = -12.5, Y1 = 3, H = 0.1) {   // profilo per sezione y di f(pos, i) (minimo o media, secondo `f`), levigato
  const n = Math.round((Y1 - Y0) / H) + 1, v = new Float32Array(n).fill(NaN), c = new Float32Array(n);
  for (let i = 0; i < pos.length; i += 3) { const k = Math.round((pos[i + 1] - Y0) / H); if (k < 0 || k >= n) continue; f(v, c, k, i); }
  for (let k = 0; k < n; k++) if (!Number.isFinite(v[k])) v[k] = k ? v[k - 1] : 0;
  for (let p = 0; p < 80; p++) for (let k = 1; k < n - 1; k++) v[k] = (v[k - 1] + 2 * v[k] + v[k + 1]) / 4;
  return y => v[clamp(Math.round((y - Y0) / H), 0, n - 1)];
}
const minZ = pos => profilo(pos, (v, c, k, i) => { if (!(v[k] <= pos[i + 2])) v[k] = pos[i + 2]; });
const mediaX = pos => profilo(pos, (v, c, k, i) => { v[k] = (Number.isFinite(v[k]) ? v[k] * c[k] : 0) + pos[i]; c[k]++; v[k] /= c[k]; });
// il profilo posteriore del FCU non va oltre quello dei suoi vicini laterali (ulna, anconeo, ECU) meno `dietro` cm: il FCU sta sul lato mediale
// del bordo posteriore dell'ulna, a livello del contorno posteriore dell'avambraccio, non dietro l'olecrano; il limite è un arco, non un piano
const FCU = { dietro: 0.1, arco: 0.4, largo: 1.1, sposta: { max: 1.3, medialeSuAnt: 0.35, monte: [1.7, 0.6] } };
const zUlna = (() => {
  const ps = ['ulna', 'anc', 'ecu'].map(id => REAL(id).pos), fs = ps.map(minZ);
  const ext = ps.map(pos => { let a = 1e9, b = -1e9; for (let i = 1; i < pos.length; i += 3) { a = Math.min(a, pos[i]); b = Math.max(b, pos[i]); } return [a, b]; });
  return y => Math.min(...fs.filter((f, k) => y >= ext[k][0] + 0.1 && y <= ext[k][1] - 0.1 || k === 0).map(f => f(y)));
})();
const xFcu = mediaX(daPartenza('fcu').pos);
// ondulazione organica del limite (rumore di valore 2D, ampiezza di decimi di mm): una faccia perfettamente liscia e inclinata farebbe comparire
// nella pagina bande regolari (aliasing dell'occlusione ambientale precalcolata sulla griglia di 1 mm)
const rumore = (() => {
  const h = (i, j) => { let v = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); v ^= v >>> 16; return (v >>> 0) / 4294967296 * 2 - 1; };
  return (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
    return (h(i, j) * (1 - a) + h(i + 1, j) * a) * (1 - b) + (h(i, j + 1) * (1 - a) + h(i + 1, j + 1) * a) * b; };
})();
const rumore3 = (() => {
  const h = (i, j, k) => { let v = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1440662683)) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); v ^= v >>> 16; return (v >>> 0) / 4294967296 * 2 - 1; };
  return (x, y, z) => { const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), u = x - i, v = y - j, w = z - k, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v), c = w * w * (3 - 2 * w), l = (p, q, t) => p + (q - p) * t;
    return l(l(l(h(i, j, k), h(i + 1, j, k), a), l(h(i, j + 1, k), h(i + 1, j + 1, k), a), b), l(l(h(i, j, k + 1), h(i + 1, j, k + 1), a), l(h(i, j + 1, k + 1), h(i + 1, j + 1, k + 1), a), b), c); };
})();
// leggera rugosità della superficie libera dei muscoli (più lunga lungo le fibre): spezza le bande regolari che la pagina disegna su facce lisce inclinate
const RUGOSITA = { a1: 0.008, l1: [0.3, 0.5, 0.3], a2: 0.02, l2: [1.0, 1.6, 1.0] };
function rugosita(F, seme) {
  for (let q = 0; q < N; q++) if (Math.abs(F[q]) < 0.3) { const [x, y, z] = vox(q), R = RUGOSITA;
    F[q] += R.a1 * rumore3(x / R.l1[0] + seme, y / R.l1[1], z / R.l1[2]) + R.a2 * rumore3(x / R.l2[0], y / R.l2[1] + seme, z / R.l2[2]); }
}
const limiteFcu = (x, y) => zUlna(y) - FCU.dietro + FCU.arco * Math.min(2, Math.abs(x - xFcu(y)) / FCU.largo) ** 2 + 0.05 * rumore(x / 0.9 + 11, y / 0.9) + 0.025 * rumore(x / 0.3 + 5, y / 0.3 + 3);
// il FCU di partenza è traslato per sezione (liscia in y) fin dove il suo profilo posteriore rispetta il limite, un poco in senso mediale
function posFcuSpostata() {
  const m = daPartenza('fcu'), pos = Float32Array.from(m.pos), zF = minZ(m.pos), S = FCU.sposta;
  const dz = y => clamp(zUlna(y) - FCU.dietro - zF(y), 0, S.max) * sstep(S.monte[0], S.monte[1], y);
  for (let i = 0; i < pos.length; i += 3) { const d = dz(pos[i + 1]); pos[i + 2] += d; pos[i] += d * S.medialeSuAnt; }
  return pos;
}

/* ============ Campi di partenza dei muscoli (indipendenti dai tubi) ============ */
// suddivisione a punto medio (ogni triangolo in 4) e levigatura di Taubin: toglie le faccette senza ridurre lo spessore (una gaussiana
// sul campo di distanza cancellava le lamine sottili: capo radiale del FDS, tendine d'inserzione del pronatore, FPL)
function levigaMesh(pos, idx) {
  let P = Array.from(pos), I = Array.from(idx);
  for (let s = 0; s < LISCIA_MESH.suddividi; s++) {
    const mid = new Map(), J = [];
    const m = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; if (!mid.has(k)) { mid.set(k, P.length / 3); P.push((P[3 * a] + P[3 * b]) / 2, (P[3 * a + 1] + P[3 * b + 1]) / 2, (P[3 * a + 2] + P[3 * b + 2]) / 2); } return mid.get(k); };
    for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t], I[t + 1], I[t + 2]], ab = m(a, b), bc = m(b, c), ca = m(c, a); J.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); }
    I = J;
  }
  const pl = G.taubin(Float32Array.from(P), Uint32Array.from(I), LISCIA_MESH.taubin);
  return { pos: pl, idx: Uint32Array.from(I) };
}
function riempi(Ms, r) {   // chiusura morfologica: riempie tunnel e fessure più strette di 2 × r
  const { Do } = G.sdf(Ms), F = G.chiuso(Do, r), out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = F[i] < 0 ? 1 : 0;
  return out;
}
const f0 = new Map(), A0 = new Map();   // campo di partenza e area per sezione (cm²) della mesh di partenza, da ripristinare
for (const id of MUSCOLI) {
  { const S1 = G.solid(id), a = new Float64Array(NY); for (let q = 0; q < N; q++) if (S1[q]) a[jDi(q)] += PASSO * PASSO;
    A0.set(id, a); }
  const m = daPartenza(id), lev = levigaMesh(id === 'fcu' ? posFcuSpostata() : m.pos, m.idx);
  G.setMesh(id, { pos: lev.pos, idx: lev.idx, tag: null, fdir: null });
  const S = G.solid(id), P = riempi(S, CHIUSURA), { F } = G.sdf(P);
  gauss(F, LISCIA); rugosita(F, 3.7 * (MUSCOLI.indexOf(id) + 1)); f0.set(id, F);
  log(`${id}: campo di partenza`);
}

// fuso a sezione ellittica lungo una linea d'asse: punti {p, n (direzione dello spessore), th (spessore), wd (larghezza)}; estremità arrotondate
function fuso(pts, { y: Y = [-1e9, 1e9], inizio = true } = {}) {
  const F = new Float32Array(N).fill(1), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const q of pts) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], q.p[c] - 0.8); hi[c] = Math.max(hi[c], q.p[c] + 0.8); }
  const i0 = [0, 1, 2].map(c => Math.max(0, Math.floor((lo[c] - G.O[c]) / PASSO))), i1 = [0, 1, 2].map(c => Math.min([NX, NY, NZ][c] - 1, Math.ceil((hi[c] - G.O[c]) / PASSO)));
  for (let k = i0[2]; k <= i1[2]; k++) for (let j = i0[1]; j <= i1[1]; j++) for (let i = i0[0]; i <= i1[0]; i++) {
    const x = G.O[0] + (i + 0.5) * PASSO, y = G.O[1] + (j + 0.5) * PASSO, z = G.O[2] + (k + 0.5) * PASSO;
    if (y > Y[1] || y < Y[0]) continue;
    let best = 0, bd = 1e9; for (let m = 0; m < pts.length; m++) { const d = (pts[m].p[0] - x) ** 2 + (pts[m].p[1] - y) ** 2 + (pts[m].p[2] - z) ** 2; if (d < bd) { bd = d; best = m; } }
    const q = pts[best], t = best < pts.length - 1 ? [pts[best + 1].p[0] - q.p[0], pts[best + 1].p[1] - q.p[1], pts[best + 1].p[2] - q.p[2]] : [q.p[0] - pts[best - 1].p[0], q.p[1] - pts[best - 1].p[1], q.p[2] - pts[best - 1].p[2]];
    const tl = Math.hypot(...t), T = t.map(v => v / tl), dn = q.n[0] * T[0] + q.n[2] * T[2], Nn = [q.n[0] - dn * T[0], -dn * T[1], q.n[2] - dn * T[2]], nl = Math.hypot(...Nn), Nu = Nn.map(v => v / nl);
    const B = [T[1] * Nu[2] - T[2] * Nu[1], T[2] * Nu[0] - T[0] * Nu[2], T[0] * Nu[1] - T[1] * Nu[0]], d = [x - q.p[0], y - q.p[1], z - q.p[2]];
    const s = d[0] * T[0] + d[1] * T[1] + d[2] * T[2], u = d[0] * Nu[0] + d[1] * Nu[1] + d[2] * Nu[2], v = d[0] * B[0] + d[1] * B[1] + d[2] * B[2];
    const a = q.th / 2, b = q.wd / 2, e = Math.hypot(u / a, v / b), sd = (e - 1) * Math.min(a, b);
    const fine = best === pts.length - 1 ? Math.max(0, s) : best === 0 && inizio ? Math.max(0, -s) : 0;   // estremità arrotondate (oltre l'ultimo punto s > 0, prima del primo s < 0)
    const val = Math.hypot(Math.max(sd, 0), fine) + Math.min(sd, 0), qq = i + NX * j + NXY * k; if (val < F[qq]) F[qq] = val;
  }
  return F;
}

/* ============ Tendine d'inserzione del pronatore rotondo ============ */
// linea d'asse: dal baricentro delle sezioni del ventre (y da[0]…da[1]) al punto di contatto sulla faccia anterolaterale del radio (il più
// vicino al ventre), che poi scende lungo l'osso fino a y = a; sezione ellittica appiattita contro l'osso (spessore e larghezza dalle tabelle)
function tendinePT() {
  const pt = daPartenza('pt').pos, ra = REAL('radio').pos;   // punto di contatto: il vertice della sezione che dal centro dell'osso sta nella `direzione` (angolo anterolaterale)
  const centro = y => { let n = 0, x = 0, z = 0; for (let i = 0; i < pt.length; i += 3) if (Math.abs(pt[i + 1] - y) < 0.12) { n++; x += pt[i]; z += pt[i + 2]; } return n ? [x / n, y, z / n] : null; };
  const sezRadio = y => { let n = 0, x = 0, z = 0; const V = []; for (let i = 0; i < ra.length; i += 3) if (Math.abs(ra[i + 1] - y) < 0.1) { n++; x += ra[i]; z += ra[i + 2]; V.push([ra[i], ra[i + 2]]); } return { c: [x / n, z / n], V }; };
  const c0 = centro(INS_PT.da[1]);
  const contatto = y => {   // punto della superficie del radio più vicino al ventre, spostato in fuori di metà spessore + gioco
    const { c, V } = sezRadio(y); let best = null, bd = -1e9; for (const v of V) { const l = Math.hypot(v[0] - c[0], v[1] - c[1]) || 1, d = ((v[0] - c[0]) * INS_PT.direzione[0] + (v[1] - c[1]) * INS_PT.direzione[1]) / l; if (d > bd) { bd = d; best = v; } }
    const n = [best[0] - c[0], best[1] - c[1]], l = Math.hypot(...n); return { p: [best[0], y, best[1]], n: [n[0] / l, 0, n[1] / l] };
  };
  const pts = [], ys = [];
  for (let y = INS_PT.da[0]; y >= INS_PT.a - 1e-9; y -= 0.05) ys.push(y);
  for (const y of ys) {
    const w = sstep(INS_PT.da[0], INS_PT.contatto, y), cv = centro(Math.max(y, INS_PT.da[1])) || c0, k = contatto(Math.min(y, INS_PT.contatto - 0.0)), th = INS_PT.spessore[0] + (INS_PT.spessore[1] - INS_PT.spessore[0]) * w;
    const sopra = [k.p[0] + k.n[0] * (th / 2 + GIOCO.osso), y, k.p[2] + k.n[2] * (th / 2 + GIOCO.osso)];
    pts.push({ p: [cv[0] + (sopra[0] - cv[0]) * w, y, cv[2] + (sopra[2] - cv[2]) * w], n: k.n, th, wd: INS_PT.larghezza[0] + (INS_PT.larghezza[1] - INS_PT.larghezza[0]) * w });
  }
  // levigatura della linea d'asse (raccordo dolce tra ventre e osso)
  for (let it = 0; it < 30; it++) for (let k = 1; k < pts.length - 1; k++) for (const c of [0, 2]) pts[k].p[c] = (pts[k - 1].p[c] + 2 * pts[k].p[c] + pts[k + 1].p[c]) / 4;
  // poi ogni punto della parte appoggiata all'osso sta esattamente a metà spessore + gioco dalla superficie (distanza esatta dall'osso)
  for (const q of pts) {
    if (q.p[1] > INS_PT.da[1]) continue;
    for (let it = 0; it < 20; it++) {
      const d = G.sample(campi.osso, ...q.p), voluto = q.th / 2 + GIOCO.osso + 0.01; if (Math.abs(d - voluto) < 0.003) break;
      const e = PASSO, g = [G.sample(campi.osso, q.p[0] + e, q.p[1], q.p[2]) - G.sample(campi.osso, q.p[0] - e, q.p[1], q.p[2]), 0, G.sample(campi.osso, q.p[0], q.p[1], q.p[2] + e) - G.sample(campi.osso, q.p[0], q.p[1], q.p[2] - e)], l = Math.hypot(...g) || 1;
      q.p[0] += g[0] / l * (voluto - d) * 0.8; q.p[2] += g[2] / l * (voluto - d) * 0.8; q.n = [g[0] / l, 0, g[2] / l];
    }
  }
  return fuso(pts, { y: [INS_PT.a - 0.6, INS_PT.da[0] + 0.3], inizio: false });
}
{ const T = tendinePT(), F = f0.get('pt'); for (let q = 0; q < N; q++) if (T[q] < 0.5) F[q] = smin(F[q], T[q], INS_PT.raccordo);
  log('pronatore rotondo: tendine d\'inserzione sul radio'); }

/* ============ Capo omerale del pronatore rotondo ============ */
// nella mesh di partenza si strozza (0,25 cm² a y 0,6–0,8) e salta davanti al nervo mediano: qui è un fuso continuo dalla cresta
// sopracondiloidea mediale al ventre, che passa sul lato mediale del nervo e poi davanti (il nervo resta profondo al capo omerale)
{
  // origine ossea: la mesh di partenza lasciava la punta del capo omerale a ~8 mm davanti all'omero (y ≈ 2,5); in anatomia nasce dalla cresta
  // sopracondiloidea mediale (e dal setto intermuscolare), sopra l'epicondilo, davanti al tendine comune. Punti [y, x, scala] aggiunti in alto:
  // la quota z è quella a cui la faccia posteriore del fuso tocca l'osso (gioco `GIOCO.osso`)
  const A = [...CAPO_OMERALE_PT.cresta.map(([y, x, sc]) => {
    const th = CAPO_OMERALE_PT.spessore * sc; let z = -0.5; while (z < 3 && G.sample(campi.osso, x, y, z) < th / 2 + GIOCO.osso + 0.02) z += 0.01;
    return [y, x, z, sc]; }), ...CAPO_OMERALE_PT.asse], med = NVP.pts.n_mediano;
  const nervo = y => { for (let s = 0; s + 1 < med.length; s++) { const a = med[s], b = med[s + 1]; if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) { const f = (a[1] - y) / (a[1] - b[1]); return [a[0] + (b[0] - a[0]) * f, a[2] + (b[2] - a[2]) * f]; } } return null; };
  const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);   // Catmull-Rom
  const pts = [];
  for (let k = 0; k + 1 < A.length; k++) for (let t = 0; t < 1 - 1e-9; t += 0.125) {
    const P = [A[Math.max(0, k - 1)], A[k], A[k + 1], A[Math.min(A.length - 1, k + 2)]], p = [1, 0, 2].map(c => cr(P[0][c], P[1][c], P[2][c], P[3][c], t));
    const sc = A[k][3] + (A[k + 1][3] - A[k][3]) * t, nv = nervo(p[1]), n = [nv[0] - p[0], 0, nv[1] - p[2]], l = Math.hypot(n[0], n[2]);
    pts.push({ p, n: [n[0] / l, 0, n[2] / l], th: CAPO_OMERALE_PT.spessore * sc, wd: CAPO_OMERALE_PT.larghezza * sc });
  }
  { const u = A[A.length - 1], nv = nervo(u[0]), n = [nv[0] - u[1], 0, nv[1] - u[2]], l = Math.hypot(n[0], n[2]); pts.push({ p: [u[1], u[0], u[2]], n: [n[0] / l, 0, n[2] / l], th: CAPO_OMERALE_PT.spessore * u[3], wd: CAPO_OMERALE_PT.larghezza * u[3] }); }
  const T = fuso(pts), F = f0.get('pt'); for (let q = 0; q < N; q++) if (T[q] < 0.5) F[q] = smin(F[q], T[q], CAPO_OMERALE_PT.raccordo);
  // la parte alta della mesh di partenza e il fuso diventano una massa unica: chiusura (riempie tasche e pieghe tra i due) sopra y ≈ 0,5
  { const M = new Uint8Array(N); for (let q = 0; q < N; q++) M[q] = F[q] < 0 ? 1 : 0;
    const Fc = G.chiuso(G.sdf(M).Do, CAPO_OMERALE_PT.chiusura[0]), Y = CAPO_OMERALE_PT.chiusura[1];
    for (let q = 0; q < N; q++) { const w = sstep(Y[0], Y[1], yDi(q)); if (w > 0) F[q] = Math.min(F[q], Fc[q] + (1 - w)); } }
  log('pronatore rotondo: capo omerale continuo attorno al nervo mediano');
}

/* ============ Origine dal tendine comune ============ */
// pronatore rotondo, FCR, palmare lungo, FDS e FCU nascono dalla faccia profonda e distale del tendine comune (Standring, Gray's Anatomy 42ª ed.):
// nella mesh di partenza le loro estremità tendinee finivano 2–12 mm prima dell'osso o del tendine. Per ogni muscolo una chiusura morfologica di
// raggio `raggio` dell'unione muscolo ∪ tendine colma lo spazio tra i due (solo entro `vicino` cm dal tendine, da y = `da` in su): l'estremità
// si allarga sulla lamina come un'aponeurosi di origine. Poi ritagli e competizione tra muscoli lasciano 0,3 mm di gioco.
const ORIGINE = { raggio: { pt: 0.4, fcr: 0.5, pl: 0.5, fds: 0.5, fcu: 0.8 }, vicino: { pt: 0.8, fcr: 1.0, pl: 1.0, fds: 1.0, fcu: 1.8 }, da: -0.5 };
function collegaOrigini() {
  const Mc = new Uint8Array(N); for (let q = 0; q < N; q++) Mc[q] = campi.cft[q] < 0 ? 1 : 0;
  for (const id of ['pt', 'fcr', 'pl', 'fds', 'fcu']) {
    const F = f0.get(id), U = new Uint8Array(N); for (let q = 0; q < N; q++) U[q] = F[q] < 0 || Mc[q] ? 1 : 0;
    const Cl = G.chiuso(G.sdf(U).Do, ORIGINE.raggio[id]); let n = 0;
    for (let q = 0; q < N; q++) if (Cl[q] < 0 && campi.cft[q] > 0 && campi.cft[q] < ORIGINE.vicino[id] && yDi(q) > ORIGINE.da && F[q] >= 0) { F[q] = Cl[q]; n++; }
    gauss(F, 0.03);
    log(`${id}: origine dal tendine comune (${n} voxel aggiunti)`);
  }
}
collegaOrigini();

/* ============ Fusione dell'origine tendinea comune nei muscoli ============ */
// Durante i calcoli la lamina `cft` (mesh temporanea) è un ostacolo solido: i muscoli le si appoggiano. Alla fine ogni parte della lamina diventa parte
// del muscolo che la tocca più vicino (zona di contatto: voxel della lamina a meno di 1,2 mm dal corpo finale del muscolo) e si fonde con esso: la lamina,
// ingrossata di `INGROSSA` cm per chiudere lo spazio di gioco tra lamina e muscolo, è divisa in regioni dal confine tra le zone di contatto (levigato; tra
// regioni vicine resta un gioco), ritagliata da ossa, strutture, cute, tubi e dai corpi degli altri muscoli, e unita al campo del muscolo. Nessuna mesh
// `cft` resta nel modello. Il colore da tendine sfuma dal pezzo al ventre (`TAG_PEZZO`: distanza a cui il tag va da 200 a 0).
const NOMI_ORIGINE = ['pt', 'fcr', 'pl', 'fds', 'fcu'], INGROSSA = 0.05, CONTATTO = 0.12, TAG_PEZZO = [0.55, 0.05];
let pezziFinali = null;
function fondiOrigini(f2, tubi) {
  const T = campi.cft, idx = []; for (let q = 0; q < N; q++) if (T[q] < INGROSSA) idx.push(q);
  const D = NOMI_ORIGINE.map(id => { const M = new Uint8Array(N); let n = 0; for (const q of idx) if (T[q] < CONTATTO && f2.get(id)[q] < 0.12) { M[q] = 1; n++; } return { n, F: n ? G.edt(M) : null }; });
  const own = new Int8Array(N).fill(-1);
  for (const q of idx) { let best = Infinity; D.forEach((d, k) => { if (d.n && d.F[q] + 1e-4 * k < best) { best = d.F[q] + 1e-4 * k; own[q] = k; } }); }
  const W = new Float32Array(N); for (const q of idx) W[q] = 1; G.sfoca(W, 3);
  const Q = new Map(); let lam = 0, preso = 0;
  NOMI_ORIGINE.forEach((id, k) => {
    const B = new Float32Array(N); for (const q of idx) if (own[q] === k) B[q] = 1; G.sfoca(B, 3);
    const C = vincoli(id, true), R = new Float32Array(N).fill(1);   // la lamina stessa non è un ostacolo del suo pezzo
    for (const j of MUSCOLI) if (j !== id) { const Fj = f2.get(j); for (let q = 0; q < N; q++) { const c = GIOCO.muscolo - Fj[q]; if (c > C[q]) C[q] = c; } }
    if (tubi) for (let q = 0; q < N; q++) { const c = GIOCO.tubo - tubi[q]; if (c > C[q]) C[q] = c; }
    for (const q of idx) { const reg = W[q] > 1e-4 ? (0.56 - B[q] / W[q]) * 0.4 : 1; R[q] = smax(smax(T[q] - INGROSSA, reg, 0.05), C[q], RACCORDO.ostacolo); }
    Q.set(id, R); });
  for (const q of idx) { if (T[q] < 0) lam++; if (T[q] < 0 && NOMI_ORIGINE.some(id => Q.get(id)[q] < 0)) preso++; }
  for (const id of MUSCOLI) { const R = Q.get(id); if (!R) continue; const F = f2.get(id); for (const q of idx) if (R[q] < F[q]) F[q] = R[q]; }
  pezziFinali = Q;
  log(`origine tendinea comune: ${lam} voxel di lamina, ${preso} nei muscoli; zone di contatto ${NOMI_ORIGINE.map((id, k) => `${id} ${D[k].n}`).join(', ')}`);
}

/* ============ Ritagli e competizione tra muscoli (con o senza i tubi) ============ */
const centroRadio = (() => {   // centro (x, z) della sezione del radio a ogni y, levigato
  const ra = REAL('radio').pos, c = new Float64Array(2 * NY), n = new Float64Array(NY);
  for (let i = 0; i < ra.length; i += 3) { const j = Math.round((ra[i + 1] - G.O[1]) / PASSO - 0.5); if (j >= 0 && j < NY) { c[2 * j] += ra[i]; c[2 * j + 1] += ra[i + 2]; n[j]++; } }
  const v = Array.from({ length: NY }, (_, j) => { let x = 0, z = 0, m = 0; for (let k = -6; k <= 6; k++) { const jj = j + k; if (jj >= 0 && jj < NY && n[jj]) { x += c[2 * jj]; z += c[2 * jj + 1]; m += n[jj]; } } return m ? [x / m, z / m] : [0, -99]; });
  return y => v[clamp(Math.round((y - G.O[1]) / PASSO - 0.5), 0, NY - 1)];
})();
function vincoli(id, senzaCft = false) {
  const C = new Float32Array(N);
  const T = id === 'fcu' ? (campi.tubiFcu ||= campoTubi(TUBI_FCU)) : null;   // il FCU non ingloba mai nervo e arteria ulnare (corrono nello spazio tra FCU e FDP/FDS)
  for (let q = 0; q < N; q++) C[q] = Math.max(GIOCO.osso - campi.osso[q], GIOCO.struttura - campi.struttura[q], GIOCO.muscolo - campi.muscolo[q], senzaCft ? -1 : GIOCO.cft - campi.cft[q], T ? GIOCO.tubo - T[q] : -1, GIOCO.cute + campi.cute[jDi(q) < J_CUTE ? q + (J_CUTE - jDi(q)) * NX : q]);
  for (let q = 0; q < N; q++) { const zm = zMio[q % NXY]; if (zm === zm) C[q] = Math.max(C[q], zm + GIOCO.struttura - (G.O[2] + (((q / NXY) | 0) + 0.5) * PASSO)); }
  if (id === 'fcu') for (let q = 0; q < N; q++) { const [x, y, z] = vox(q); C[q] = Math.max(C[q], limiteFcu(x, y) - z); }
  if (LATO_RADIO.sopra[id]) for (let q = 0; q < N; q++) {
    const [x, y, z] = vox(q), w = sstep(LATO_RADIO.da[0], LATO_RADIO.da[1], y); if (w <= 0) continue;
    const [xc, zc] = centroRadio(y), c = Math.min(xc - LATO_RADIO.margine - x, zc + LATO_RADIO.sopra[id] - z);
    C[q] = Math.max(C[q], c + GIOCO.muscolo - (1 - w));
  }
  return C;
}
function apri(F, r) {   // apertura morfologica: F resta un campo con segno, solo ridotto dove il solido è più sottile di 2r
  const M = new Uint8Array(N); for (let q = 0; q < N; q++) M[q] = F[q] < 0 ? 1 : 0;
  const prof = G.edt(M, true), E = new Uint8Array(N); for (let q = 0; q < N; q++) E[q] = prof[q] >= r ? 1 : 0;
  const Dd = G.edt(E); let tolti = 0;
  for (let q = 0; q < N; q++) if (M[q]) { const v = Dd[q] - r; if (v >= 0) { F[q] = v + 0.02; tolti++; } }   // solo dove il solido viene tolto: altrove F resta quello esatto
  return tolti;
}
// crescita nel piano della sezione: δ(y) ≥ 0 (levigato lungo y) tale che l'area del solido max(F0 − δ, C) torni ≈ quella di partenza
function crescita(F0, C, A, max) {
  const delta = new Float32Array(NY), fatto = new Uint8Array(NY);
  const area = d => { const a = new Float64Array(NY); for (let q = 0; q < N; q++) if (Math.max(F0[q] - d, C[q]) < 0) a[jDi(q)] += PASSO * PASSO; return a; };
  for (let d = 0; d <= max + 1e-9; d += 0.02) { const a = area(d); for (let j = 0; j < NY; j++) if (!fatto[j] && (a[j] >= A[j] * 0.97 || d > max - 1e-3)) { delta[j] = d; fatto[j] = 1; } }
  const ker = [], sg = CRESCITA.sigma / PASSO, R = Math.ceil(3 * sg); for (let k = -R; k <= R; k++) ker.push(Math.exp(-k * k / (2 * sg * sg)));
  const g = Float32Array.from(delta); for (let j = 0; j < NY; j++) { let a = 0, w = 0; for (let k = -R; k <= R; k++) { const jj = clamp(j + k, 0, NY - 1); a += g[jj] * ker[k + R]; w += ker[k + R]; } delta[j] = a / w; }
  return delta;
}
const areaDi = F => { const a = new Float64Array(NY); for (let q = 0; q < N; q++) if (F[q] < 0) a[jDi(q)] += PASSO * PASSO; return a; };
// tubi: solco raccordato (massimo morbido) invece di un cilindro a spigolo vivo
function ritagliaTubi(F, T) { if (!T) return; for (let q = 0; q < N; q++) { const c = GIOCO.tubo - T[q]; if (c > -RACCORDO.tubo) F[q] = smax(F[q], c, RACCORDO.tubo); } }
// precedenze nella divisione: +1 se j prevale su id, −1 se id prevale su j, 0 se si dividono a metà. Il tendine d'inserzione del pronatore
// (sottile, perderebbe la divisione con i ventri vicini) e il FPL, strato profondo sulla faccia anteriore del radio, sotto il FDS
const PRECEDENZE = [['pt', y => y < INS_PT.da[0] - 0.3], ['fpl', () => true]];
function precedenza(id, j, y) {
  for (const [m, dove] of PRECEDENZE) if (dove(y)) { if (j === m && id !== m) return 1; if (id === m && j !== m && j !== 'pt') return -1; }
  return 0;
}
// ordine della crescita (dal profondo al superficiale): ogni muscolo cresce solo nello spazio lasciato libero dagli altri
const ORDINE_CRESCITA = ['fdp', 'fpl', 'fds', 'pt', 'fcr', 'pl', 'fcu'];
function costruisciCampi(tubi, delte) {
  const f1 = new Map(), f2 = new Map(), C0 = new Map(), nuoveDelte = new Map();
  for (const id of MUSCOLI) { const C = vincoli(id), F0 = f0.get(id), F = new Float32Array(N); for (let q = 0; q < N; q++) F[q] = smax(F0[q], C[q], RACCORDO.ostacolo); ritagliaTubi(F, tubi); f1.set(id, F); C0.set(id, C); }
  // 1) ripartizione: dove due muscoli si sovrappongono si dividono (vince chi è più dentro), con uno spazio tra loro e margini arrotondati;
  //    il FCU (spostato) cede il posto agli altri
  for (const id of MUSCOLI) {
    const F = Float32Array.from(f1.get(id));
    for (const j of MUSCOLI) if (j !== id) {
      const Fj = f1.get(j);
      if (id === 'fcu') { for (let q = 0; q < N; q++) { const c = GIOCO.muscolo - Fj[q]; if (c > F[q] - RACCORDO.muscolo) F[q] = smax(F[q], c, RACCORDO.muscolo); } }
      else if (j !== 'fcu') for (let q = 0; q < N; q++) {
        const prec = precedenza(id, j, yDi(q));
        if (prec < 0) continue;
        const c = prec > 0 ? GIOCO.muscolo - Fj[q] : (F[q] - Fj[q] + GIOCO.muscolo * 2) / 2; if (c > F[q] - RACCORDO.muscolo) F[q] = smax(F[q], c, RACCORDO.muscolo);
      }
    }
    f2.set(id, F);
  }
  // 2) crescita nel piano della sezione, uno alla volta, solo nello spazio libero (ossa, strutture, altri muscoli e tubi restano ostacoli):
  //    l'area di ogni sezione torna ≈ quella di partenza dove c'è posto
  for (const id of ORDINE_CRESCITA) {
    const C = Float32Array.from(C0.get(id));
    for (const j of MUSCOLI) if (j !== id) { const Fj = f2.get(j); for (let q = 0; q < N; q++) { const c = GIOCO.muscolo - Fj[q]; if (c > C[q]) C[q] = c; } }
    if (tubi) for (let q = 0; q < N; q++) { const c = GIOCO.tubo - tubi[q]; if (c > C[q]) C[q] = c; }
    const F0 = f0.get(id), d = delte ? delte.get(id) : crescita(F0, C, A0.get(id), id === 'fcu' ? CRESCITA.max : CRESCITA.maxAltri); nuoveDelte.set(id, d);
    const F = new Float32Array(N); for (let q = 0; q < N; q++) F[q] = Math.min(f2.get(id)[q], smax(F0[q] - d[jDi(q)], C[q], RACCORDO.ostacolo));
    // solo lo spazio libero: il nuovo solido non entra negli altri muscoli (raccordo arrotondato)
    for (const j of MUSCOLI) if (j !== id) { const Fj = f2.get(j); for (let q = 0; q < N; q++) { const c = GIOCO.muscolo - Fj[q]; if (c > F[q]) F[q] = c; } }   // spigolo vivo: i raccordi sono già nella ripartizione e qui assottiglierebbero le lamine
    ritagliaTubi(F, tubi);
    gauss(F, LISCIA2); if (id !== 'fpl') apri(F, APERTURA[id] || APERTURA.altri);
    f2.set(id, F);
  }
  // piano di taglio a spigolo vivo (dopo le levigature): i muscoli arrivano fino a y = −12 come le altre strutture
  for (const id of MUSCOLI) { const F = f2.get(id); for (let q = 0; q < N; q++) F[q] = Math.max(F[q], Y_TAGLIO - yDi(q)); }
  const righe = MUSCOLI.map(id => { const a = areaDi(f2.get(id)), A = A0.get(id); return id + ' ' + [2, 1, 0, -2, -4, -6, -8, -10, -11.9].map(y => { const j = Math.round((y - G.O[1]) / PASSO - 0.5); return A[j] > 0.02 ? (a[j] / A[j] * 100).toFixed(0) : '–'; }).join('/'); });
  log(`campi dei muscoli${tubi ? ' (con i tubi)' : ''}; area rispetto a quella di partenza in % (y 2/1/0/−2/−4/−6/−8/−10/−11,9): ${righe.join('; ')}`);
  f2.delte = nuoveDelte; return f2;
}

/* ============ Spostamento di nervi e vasi fuori dai muscoli ============ */
// un tubo può affondare in un muscolo al più per `AFFONDA` volte il proprio raggio (allora il solco resta aperto, nessun tunnel);
// se è più dentro, si sposta verso l'uscita più vicina; il tratto si sposta con continuità e gli estremi restano fermi
const AFFONDA = 0.3, FUORI_SUP = 0.04, TAPERA = 0.7, SIGMA_T = 0.55;   // AFFONDA: profondità massima (× raggio) dei tubi profondi; FUORI_SUP: distanza (cm) dei superficiali dai muscoli
   // TAPERA: cm dagli estremi fermi su cui lo spostamento sfuma; SIGMA_T: levigatura dello spostamento lungo il tubo (cm)
function spostaTubi(f2) {
  const ALTRI_CAMPI = [campi.osso, campi.struttura, campi.muscolo, campi.cuteDentro].map(F => [F, Object.fromEntries(Object.entries(NVP.pts).map(([id, P]) => [id, P.map(q => G.sample(F, q[0], q[1], q[2]))]))]);
  const U = new Float32Array(N).fill(1); for (const id of MUSCOLI) { const F = f2.get(id); for (let q = 0; q < N; q++) if (F[q] < U[q]) U[q] = F[q]; }
  for (let q = 0; q < N; q++) if (campi.cft[q] < U[q]) U[q] = campi.cft[q];   // anche il tendine comune: vasi e vene superficiali non lo attraversano, passano sulla sua superficie
  const dentroGriglia = p => p[0] > AREA.lo[0] + 0.3 && p[0] < AREA.hi[0] - 0.3 && p[1] > AREA.lo[1] + 0.3 && p[1] < AREA.hi[1] - 0.3 && p[2] > AREA.lo[2] + 0.3 && p[2] < AREA.hi[2] - 0.3;
  const grad = (F, p) => { const e = PASSO, g = [G.sample(F, p[0] + e, p[1], p[2]) - G.sample(F, p[0] - e, p[1], p[2]), G.sample(F, p[0], p[1] + e, p[2]) - G.sample(F, p[0], p[1] - e, p[2]), G.sample(F, p[0], p[1], p[2] + e) - G.sample(F, p[0], p[1], p[2] - e)], l = Math.hypot(...g) || 1; return g.map(v => v / l); };
  for (const [id, P] of Object.entries(NVP.pts)) {
    const r = reff(id), n = P.length, sup = SUPERFICIALI.includes(id); if (!P.some(dentroGriglia)) continue;
    const z = SOPRA[id], limiteDi = y => sup || (z && y >= z[0] && y <= z[1]) ? r + FUORI_SUP : -AFFONDA * r;   // valore minimo del campo dei muscoli sull'asse del tubo
    const arc = [0]; for (let k = 1; k < n; k++) arc.push(arc[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1], P[k][2] - P[k - 1][2]));
    // gli estremi fermi sono quelli attaccati al vaso d'origine, al piano di taglio o a un altro tubo (anastomosi); l'altro estremo è libero
    const altri = Object.entries(NVP0.pts).filter(([k]) => k !== id).flatMap(([, Q]) => Q);
    const fermo = p => Math.abs(p[1]) > 11.6 || altri.some(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.06);
    const f0_ = fermo(P[0]) || !!PARENT[id], f1_ = fermo(P[n - 1]);
    const peso = arc.map(s => Math.min(f0_ ? s / TAPERA : 1, f1_ ? (arc[n - 1] - s) / TAPERA : 1, 1)).map(w => w * w * (3 - 2 * w));
    // lo spostamento Δ è una funzione liscia dell'ascissa lungo il tubo (media gaussiana di σ = `SIGMA_T`): a ogni giro si aggiunge la
    // correzione richiesta dai punti troppo dentro i muscoli e si leviga; converge a un inviluppo liscio che soddisfa il vincolo
    const P0 = P.map(q => [...q]), D = P.map(() => [0, 0, 0]), ker = [];
    const dk = arc[n - 1] / (n - 1), R = Math.ceil(3 * SIGMA_T / dk); let sk = 0; for (let k = -R; k <= R; k++) { const w = Math.exp(-((k * dk) ** 2) / (2 * SIGMA_T ** 2)); ker.push(w); sk += w; }
    let max0 = 0, maxV = 0;
    for (let it = 0; it < 300; it++) {
      maxV = 0; const C = P.map(() => [0, 0, 0]);
      for (let k = 0; k < n; k++) {
        if (!dentroGriglia(P[k])) continue;
        const v = limiteDi(P0[k][1]) - G.sample(U, P[k][0], P[k][1], P[k][2]);   // v > 0: troppo dentro (o, per i superficiali, troppo vicino a) un muscolo
        if (it === 0) max0 = Math.max(max0, v);
        if (v > 0) { maxV = Math.max(maxV, v * (peso[k] > 0.05 ? 1 : 0)); const g = grad(U, P[k]); for (let c = 0; c < 3; c++) C[k][c] += g[c] * (v + 0.005); }
        // ossa, strutture e muscoli vicini: il tubo non va più dentro di quanto stava
        for (const [F, base] of ALTRI_CAMPI) { const need = Math.min(base[id][k], 0), w = need - G.sample(F, P[k][0], P[k][1], P[k][2]); if (w > 0) { const g = grad(F, P[k]); for (let c = 0; c < 3; c++) C[k][c] += g[c] * (w + 0.003); } }
      }
      if (maxV < 0.004 && it > 0) break;
      const T = D.map((d, k) => d.map((x, c) => x + C[k][c] * 0.7));
      for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) { let a = 0, w = 0; for (let j = -R; j <= R; j++) { const kk = k + j; if (kk < 0 || kk >= n) continue; a += T[kk][c] * ker[j + R]; w += ker[j + R]; } D[k][c] = a / w * peso[k]; P[k][c] = P0[k][c] + D[k][c]; }
    }
    if (max0 > 0) log(`tubi: ${id}${sup ? ' (superficiale)' : ''} da spostare di ${(max0 * 10).toFixed(1)} mm, residuo ${(maxV * 10).toFixed(1)} mm`);
  }
}
// i rami che nascono da un altro vaso (PARENT) restano attaccati al punto d'origine se questo si è spostato
function allineaRami() {
  for (const [id, padre] of Object.entries(PARENT)) {
    const P = NVP.pts[id], Q = NVP.pts[padre]; if (!P || !Q) continue;
    let best = 0, bd = Infinity; for (let k = 0; k < Q.length; k++) { const d = Math.hypot(Q[k][0] - NVP0.pts[id][0][0], Q[k][1] - NVP0.pts[id][0][1], Q[k][2] - NVP0.pts[id][0][2]); if (d < bd) { bd = d; best = k; } }
    if (bd < 0.05) for (let c = 0; c < 3; c++) P[0][c] = Q[best][c];
  }
}
const pyJson = v => Array.isArray(v) ? '[' + v.map(pyJson).join(', ') + ']' : (v && typeof v === 'object') ? '{' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ': ' + pyJson(x)).join(', ') + '}' : typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : JSON.stringify(v);

/* ============ Pulizia del solido: nessuna isola e nessuna cavità interna ============ */
function componenti(M, valore) {
  const lab = new Int32Array(N).fill(-1), dim = [], st = new Int32Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (M[s0] !== valore || lab[s0] >= 0) continue;
    let sp = 0, n = 0, tocca = false; const l = dim.length; st[sp++] = s0; lab[s0] = l;
    while (sp) {
      const q = st[--sp]; n++; const i = q % NX, j = ((q / NX) | 0) % NY, k = (q / NXY) | 0;
      if (i === 0 || j === 0 || k === 0 || i === NX - 1 || j === NY - 1 || k === NZ - 1) tocca = true;
      for (const [d, ok] of [[1, i < NX - 1], [-1, i > 0], [NX, j < NY - 1], [-NX, j > 0], [NXY, k < NZ - 1], [-NXY, k > 0]]) { if (!ok) continue; const r = q + d; if (M[r] === valore && lab[r] < 0) { lab[r] = l; st[sp++] = r; } }
    }
    dim.push({ n, tocca });
  }
  return { lab, dim };
}
function pulisci(F) {
  const M = new Uint8Array(N); for (let q = 0; q < N; q++) M[q] = F[q] < 0 ? 1 : 0;
  const A = componenti(M, 1); let big = 0; A.dim.forEach((d, i) => { if (d.n > A.dim[big].n) big = i; });
  const B = componenti(M, 0); let isole = 0, cavita = 0; const dove = [0, 0, 0];
  for (let q = 0; q < N; q++) {
    if (M[q] && A.lab[q] !== big) { F[q] = 0.01; isole++; const v = vox(q); for (let c = 0; c < 3; c++) dove[c] += v[c]; }
    else if (!M[q] && !B.dim[B.lab[q]].tocca) { F[q] = -0.01; cavita++; }
  }
  return { isole, cavita, dove: isole ? dove.map(v => +(v / isole).toFixed(2)) : null };
}

/* ============ Mesh dal campo ============ */
const MESH = { passo: Number(process.env.MESH || 0.15), passoOrigine: Number(process.env.MESH_ORIGINE || 0.1), taubin: 20 };   // cm: passo della griglia della mesh finale (più largo del campo: vertici ogni ~1,5 mm come le mesh originali) e passate di Taubin
const TAUBIN = MESH.taubin;   // passate di Taubin sulla mesh dei surface nets (oltre alle 12 di `nets`)
const FIBRE = { sigma: 0.5, sigmaTag: 0.22, passate: 6 };   // cm: nucleo gaussiano con cui fibre e tag sono ricavati dai vertici di partenza; passate di levigatura sulla mesh
function adiacenza(idx, nv) {
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  return nb.map(s => Int32Array.from(s));
}
function costruisci(id, F) {
  const m = daPartenza(id), nv = m.pos.length / 3;
  const cella = 0.25, hash = new Map(), ch = (x, y, z) => `${Math.floor(x / cella)},${Math.floor(y / cella)},${Math.floor(z / cella)}`;
  for (let i = 0; i < nv; i++) { const c = ch(m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]); if (!hash.has(c)) hash.set(c, []); hash.get(c).push(i); }
  const RC = Math.ceil(3 * FIBRE.sigma / cella);
  const candidati = p => {   // vertici di partenza entro 3 sigma (nucleo gaussiano: nessun salto al cambiare del vertice più vicino)
    const [cx, cy, cz] = p.map(v => Math.floor(v / cella)); const L = [];
    for (let a = -RC; a <= RC; a++) for (let b = -RC; b <= RC; b++) for (let c = -RC; c <= RC; c++) for (const i of hash.get(`${cx + a},${cy + b},${cz + c}`) || []) L.push([i, (m.pos[3 * i] - p[0]) ** 2 + (m.pos[3 * i + 1] - p[1]) ** 2 + (m.pos[3 * i + 2] - p[2]) ** 2]);
    return L.sort((u, v) => u[1] - v[1]);
  };
  // campo fine → griglia larga: la mesh ha vertici ogni ~1,5 mm, poi i vertici si riportano sul livello zero del campo fine
  const fine = { O: [...G.O], H: PASSO, NX, NY, NZ, NXY };
  const campFine = (x, y, z) => {
    let fx = (x - fine.O[0]) / fine.H - 0.5, fy = (y - fine.O[1]) / fine.H - 0.5, fz = (z - fine.O[2]) / fine.H - 0.5;
    fx = clamp(fx, 0, fine.NX - 1.001); fy = clamp(fy, 0, fine.NY - 1.001); fz = clamp(fz, 0, fine.NZ - 1.001);
    const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k, b = i + fine.NX * j + fine.NXY * k, l = (a, c, t) => a + (c - a) * t;
    return l(l(l(F[b], F[b + 1], u), l(F[b + fine.NX], F[b + fine.NX + 1], u), v), l(l(F[b + fine.NXY], F[b + fine.NXY + 1], u), l(F[b + fine.NXY + fine.NX], F[b + fine.NXY + fine.NX + 1], u), v), w);
  };
  const passoMesh = NOMI_ORIGINE.includes(id) ? MESH.passoOrigine : MESH.passo;   // le origini tendinee (2–3,6 mm di spessore) vogliono una maglia più fitta
  const nc = [0, 1, 2].map(k => Math.ceil((AREA.hi[k] - AREA.lo[k]) / passoMesh));
  G.setGriglia(AREA.lo, passoMesh, nc[0], nc[1], nc[2]);
  const Fc = G.valuta(p => campFine(p[0], p[1], p[2]));
  const out = G.nets(Fc, () => [0, 1, 0]);
  G.setGriglia(fine.O, PASSO, NX, NY, NZ);
  const n2 = out.pos.length / 3;
  let pos = out.pos;
  pos = G.taubin(pos, out.idx, TAUBIN);
  const e = PASSO * 0.75;
  for (let i = 0; i < n2; i++) {   // Newton verso F = 0 con il gradiente del campo fine
    let p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    for (let it = 0; it < 5; it++) {
      const v = campFine(p[0], p[1], p[2]), g = [campFine(p[0] + e, p[1], p[2]) - campFine(p[0] - e, p[1], p[2]), campFine(p[0], p[1] + e, p[2]) - campFine(p[0], p[1] - e, p[2]), campFine(p[0], p[1], p[2] + e) - campFine(p[0], p[1], p[2] - e)].map(x => x / (2 * e)), g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] || 1;
      const st = clamp(v / g2, -0.1, 0.1); p = [p[0] - g[0] * st, p[1] - g[1] * st, p[2] - g[2] * st]; if (Math.abs(v) < 2e-4) break;
    }
    pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
  }
  for (let i = 0; i < n2; i++) if (pos[3 * i + 1] < Y_TAGLIO + 0.05) pos[3 * i + 1] = Y_TAGLIO;   // sul piano di taglio
  // tag (0–200 muscolo → tendine; 250/251 sezioni di taglio) e fibre: media pesata dei vertici di partenza vicini
  const tagF = new Float32Array(n2), fd = new Float32Array(3 * n2), sezione = new Uint8Array(n2);
  for (let i = 0; i < n2; i++) {
    const L = candidati([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), taglio = pos[3 * i + 1] <= Y_TAGLIO + 1e-4;
    if (!L.length) { fd[3 * i + 1] = 1; continue; }
    if (taglio) { const c = L.find(([j]) => m.tag[j] >= 250) || L[0]; sezione[i] = m.tag[c[0]] >= 250 ? m.tag[c[0]] : 250; }
    let st = 0, swt = 0, ref = null; const f = [0, 0, 0];
    for (const [j, d2] of L) {
      const wt = Math.exp(-d2 / (2 * FIBRE.sigmaTag ** 2)); if (m.tag[j] < 250) { st += wt * m.tag[j]; swt += wt; }
      const w = Math.exp(-d2 / (2 * FIBRE.sigma ** 2)), v = [m.fdir[3 * j], m.fdir[3 * j + 1], m.fdir[3 * j + 2]]; if (!ref) ref = v;
      const sg = v[0] * ref[0] + v[1] * ref[1] + v[2] * ref[2] < 0 ? -1 : 1; for (let k = 0; k < 3; k++) f[k] += sg * v[k] * w;
    }
    tagF[i] = swt > 1e-9 ? st / swt : m.tag[L[0][0]];
    const l = Math.hypot(...f) || 1; for (let k = 0; k < 3; k++) fd[3 * i + k] = f[k] / l;
  }
  const nb = adiacenza(out.idx, n2);
  for (let p = 0; p < FIBRE.passate; p++) {   // levigatura: media dei vicini con segno concorde
    const Nn = new Float32Array(3 * n2);
    for (let i = 0; i < n2; i++) {
      let x = fd[3 * i], y = fd[3 * i + 1], z = fd[3 * i + 2];
      for (const j of nb[i]) { const sg = fd[3 * i] * fd[3 * j] + fd[3 * i + 1] * fd[3 * j + 1] + fd[3 * i + 2] * fd[3 * j + 2] < 0 ? -1 : 1; x += sg * fd[3 * j]; y += sg * fd[3 * j + 1]; z += sg * fd[3 * j + 2]; }
      const l = Math.hypot(x, y, z) || 1; Nn[3 * i] = x / l; Nn[3 * i + 1] = y / l; Nn[3 * i + 2] = z / l;
    }
    fd.set(Nn);
  }
  for (let p = 0; p < 6; p++) { const T = Float32Array.from(tagF); for (let i = 0; i < n2; i++) { let s = tagF[i] * 2, c = 2; for (const j of nb[i]) { s += tagF[j]; c++; } T[i] = s / c; } tagF.set(T); }
  const tag = new Uint8Array(n2), fdir = new Int8Array(3 * n2);
  if (id === 'pt') for (let i = 0; i < n2; i++) tagF[i] = Math.max(tagF[i], 200 * sstep(INS_PT.tendine[0], INS_PT.tendine[1], pos[3 * i + 1]));
  const Fp = pezziFinali && pezziFinali.get(id); if (Fp) for (let i = 0; i < n2; i++) { const d = G.sample(Fp, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); if (d < TAG_PEZZO[0]) tagF[i] = Math.max(tagF[i], 200 * (1 - sstep(TAG_PEZZO[1], TAG_PEZZO[0], d))); }
  for (let i = 0; i < n2; i++) { tag[i] = sezione[i] || Math.round(clamp(tagF[i], 0, 200)); for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(clamp(fd[3 * i + k], -1, 1) * 127); }
  return { pos, idx: out.idx, tag, fdir };
}

/* ============ Esecuzione ============ */
let f2 = costruisciCampi(null);
if (CON_TUBI) {
  spostaTubi(f2); allineaRami();
  rifaiCft({ nervo: campoTubi(null), giocoNervo: GIOCO.tubo }); campi.cft = campoDi(['cft']);
  f2 = costruisciCampi(campoTubi(null, SUPERFICIALI), f2.delte);
  G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${pyJson(NVP)};\n`);
}
fondiOrigini(f2, CON_TUBI ? campoTubi(null, SUPERFICIALI) : null);
for (const id of MUSCOLI) {
  const pul = pulisci(f2.get(id));
  const r = costruisci(id, f2.get(id));
  setMesh(id, r);
  log(`${id}: ${r.pos.length / 3} vertici (${pul.isole} voxel isolati rimossi${pul.isole > 300 ? ' — ATTENZIONE: parte staccata dal muscolo, attorno a ' + JSON.stringify(pul.dove) : ''}, ${pul.cavita} cavità riempite)`);
}

/* ============ Lacerto fibroso adagiato sui flessori ============ */
// il lacerto è un'aponeurosi superficiale che dal tendine del bicipite si porta medialmente sopra arteria brachiale, nervo mediano e origine dei
// flessori-pronatori, fondendosi con la fascia antibrachiale. Nella mesh di partenza il suo margine mediale affondava tra pronatore e FCR e
// dentro il palmare lungo: i muscoli ne portavano l'impronta (solchi e fessure, ben visibili mostrando solo i flessori). Ora i muscoli non lo
// considerano un ostacolo e il lacerto è sollevato sull'involucro dei flessori (chiusura: le fessure tra i ventri restano colmate, come dalla
// fascia), con uno spostamento levigato sulla mesh che conserva lo spessore della lamina; l'origine dal bicipite non si muove
const LACERTO = { chiusura: 0.3, gioco: 0.03, vicinato: 0.2, iter: 6, passate: 15 };
function adagiaLacerto() {
  const m = daPartenza('lacerto'), pos = Float32Array.from(m.pos), nv = pos.length / 3;
  const { Do } = G.sdf(G.unione(MUSCOLI)), U = G.chiuso(Do, LACERTO.chiusura); gauss(U, 0.05);
  const adj = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = m.idx[t + e], b = m.idx[t + (e + 1) % 3]; adj[a].add(b); adj[b].add(a); }
  const A = adj.map(s => [...s]);
  const vicini = (() => {   // vertici entro `vicinato` (l'altra faccia della lamina)
    const c = LACERTO.vicinato, key = (x, y, z) => `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`, H = new Map();
    for (let i = 0; i < nv; i++) { const k = key(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); if (!H.has(k)) H.set(k, []); H.get(k).push(i); }
    return Array.from({ length: nv }, (_, i) => { const r = [], [x, y, z] = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of H.get(key(x + dx * c, y + dy * c, z + dz * c)) || []) if (Math.hypot(pos[3 * j] - x, pos[3 * j + 1] - y, pos[3 * j + 2] - z) < c) r.push(j);
      return r; });
  })();
  const grad = (x, y, z) => { const e = PASSO, g = [G.sample(U, x + e, y, z) - G.sample(U, x - e, y, z), G.sample(U, x, y + e, z) - G.sample(U, x, y - e, z), G.sample(U, x, y, z + e) - G.sample(U, x, y, z - e)], l = Math.hypot(...g) || 1; return g.map(v => v / l); };
  let mosso = 0, max = 0;
  for (let it = 0; it < LACERTO.iter; it++) {
    const need = new Float32Array(nv); for (let i = 0; i < nv; i++) need[i] = Math.max(0, LACERTO.gioco - G.sample(U, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]));
    const N2 = new Float32Array(nv); for (let i = 0; i < nv; i++) { let v = 0; for (const j of vicini[i]) v = Math.max(v, need[j]); N2[i] = v; }
    let D = new Float32Array(3 * nv), g = new Float32Array(3 * nv);
    for (let i = 0; i < nv; i++) { const n = grad(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); for (let c = 0; c < 3; c++) { g[3 * i + c] = n[c]; D[3 * i + c] = n[c] * N2[i]; } }
    for (let k = 0; k < LACERTO.passate; k++) {
      const E = new Float32Array(3 * nv);
      for (let i = 0; i < nv; i++) { const a = A[i]; for (let c = 0; c < 3; c++) { let s = 0; for (const j of a) s += D[3 * j + c]; E[3 * i + c] = a.length ? 0.5 * D[3 * i + c] + 0.5 * s / a.length : D[3 * i + c]; } }
      for (let i = 0; i < nv; i++) { const pr = E[3 * i] * g[3 * i] + E[3 * i + 1] * g[3 * i + 1] + E[3 * i + 2] * g[3 * i + 2], manca = N2[i] - pr; if (manca > 0) for (let c = 0; c < 3; c++) E[3 * i + c] += manca * g[3 * i + c]; }
      D = E;
    }
    let n = 0; for (let i = 0; i < nv; i++) { const l = Math.hypot(D[3 * i], D[3 * i + 1], D[3 * i + 2]); if (l > 1e-4) n++; for (let c = 0; c < 3; c++) pos[3 * i + c] += D[3 * i + c]; }
    if (!n) break; mosso = Math.max(mosso, n);
  }
  for (let i = 0; i < nv; i++) max = Math.max(max, Math.hypot(pos[3 * i] - m.pos[3 * i], pos[3 * i + 1] - m.pos[3 * i + 1], pos[3 * i + 2] - m.pos[3 * i + 2]));
  let dentro = 0, cute = 0; for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; if (G.sample(U, ...p) < 0) dentro++; if (G.sample(campi.cute, ...p) > -0.05) cute++; }
  setMesh('lacerto', { pos, idx: m.idx, tag: m.tag, fdir: m.fdir });
  log(`lacerto fibroso: ${mosso} vertici su ${nv} sollevati sui flessori (al più ${(max * 10).toFixed(1)} mm); ancora dentro l'involucro ${dentro}, a meno di 0,5 mm dalla cute ${cute}`);
}
adagiaLacerto();

/* ============ Pagina: niente scheda del tendine comune ============ */
// l'origine tendinea comune è parte dei muscoli (stesse mesh): la mesh `cft` e la sua scheda non esistono più. Sostituzioni idempotenti sul testo della pagina.
{
  const i = G.man.meshes.findIndex(m => m.n === 'cft'); if (i >= 0) G.man.meshes.splice(i, 1);
  const sost = (da, a) => { if (G.M.html.includes(da)) G.M.html = G.M.html.replace(da, () => a); };
  G.M.html = G.M.html.replace(/^\{id:'cft',cat:'ten',.*\},\n/m, '').replace(/'cft',/g, '');
  sost('Superficialmente il tendine comune dei flessori.', 'Superficialmente l’origine tendinea comune dei flessori-pronatori (parte dei muscoli).');
  sost("Capo omerale (epicondilo mediale) e capo ulnare (coronoide); inserzione", "Capo omerale (dall’origine tendinea comune sull’epicondilo mediale) e capo ulnare (coronoide); inserzione");
  sost("info:\"Dal tendine comune dei flessori, medialmente al pronatore rotondo;", "info:\"Dall’origine tendinea comune dei flessori sull’epicondilo mediale (sede dell’epicondilite mediale, meno frequente della laterale; il fascio anteriore del collaterale ulnare decorre subito in profondità), medialmente al pronatore rotondo;");
}
saveFile(repack());
if (CON_TUBI) console.log('Attenzione: le vene sono tornate a quelle della revisione di partenza: rilanciare `node strumenti/vene-gomito.mjs`.');
