/* Flessori-pronatori del gomito (modelli/gomito-3d.html): pronatore rotondo, FCR, palmare lungo, FDS, FDP, FCU, FPL.

   Uso (dalla cartella del progetto):
     node strumenti/flessori-pronatori-gomito.mjs              → riscrive le mesh (e i tubi di nervi e vasi) nel file del modello
     MODELLO=/tmp/copia.html node strumenti/flessori-pronatori-gomito.mjs   → lavora su una copia
     PASSO=0.08 …                                              → passo della griglia in cm (default 0,07)
     node strumenti/flessori-pronatori-gomito.mjs verifica     → non scrive: topologia, buchi, compenetrazioni e tubi delle mesh del file
     opzioni: senza-tubi (non sposta né ritaglia nervi e vasi)

   Il metodo è descritto in GUIDA_MODELLI.md. Riparte sempre dalle mesh della revisione `PARTENZA` e dai tubi del file. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { setMesh, clamp, sstep, log, repack, saveFile, realDaRevisione, REAL } = G;

const PARTENZA = 'd587775';                 // revisione con le mesh di partenza (prima di questo strumento)
const FILE_REPO = 'modelli/gomito-3d.html';
const MUSCOLI = ['fdp', 'fpl', 'fds', 'pt', 'fcr', 'pl', 'fcu'];
const ALTRI = MUSCOLI.filter(m => m !== 'fcu');
const PASSO = Number(process.env.PASSO || 0.07);   // cm, griglia
const CHIUSURA = 0.25;                     // cm, raggio della chiusura che riempie i tunnel delle mesh di partenza
const LISCIA = 0.16;                       // cm, sigma della levigatura del campo di partenza
const LISCIA2 = 0.08;                      // cm, sigma della levigatura finale (dopo i ritagli)
const GIOCO = { osso: 0.045, struttura: 0.02, muscolo: 0.025, tubo: 0.045, cute: 0.2, cft: 0.03 };   // cm
const Y_TAGLIO = -12;
const CRESCITA = { max: 0.7, sigma: 0.8 };   // cm: crescita massima nel piano del FCU e levigatura del suo profilo lungo y
const TUBI_FCU = ['n_ulnare', 'a_ulnare'];
const APERTURA = { fcu: 0.2, altri: 0.12 };             // cm: raggio dell'apertura morfologica (toglie lembi e ali più sottili di 2 × raggio)

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
  const altri = ['omero', 'ulna', 'radio', 'cart_omero', 'cart_ulna', 'cart_radio', 'caps', 'fat_ant', 'fat_post', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'anulare', 'lucl', 'mio', 'osborne', 'cft', 'lacerto', 'brach', 'bic', 'br', 'sup', 'ecrl', 'ecrb', 'edc', 'ecu', 'anc', 'tri_med'];
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
const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
const NVP0 = JSON.parse(JSON.stringify(NVP));
const PARENT = (() => { const m = G.M.html.match(/const PARENT=(\{.*?\});/s); return m ? Function(`return (${m[1]})`)() : {}; })();
// raggio efficace (la pagina appiattisce le vene e gonfia i nervi e le valvole delle vene)
const reff = id => NVP.r[id] * (id.startsWith('v_') ? 1.25 : id.startsWith('n_') ? 1.08 : 1.05);

/* ============ Campi degli ostacoli ============ */
const OSSA = ['omero', 'ulna', 'radio'];
const STRUTT = ['cart_omero', 'cart_ulna', 'cart_radio', 'caps', 'fat_ant', 'fat_post', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'anulare', 'lucl', 'quadrato', 'mio', 'osborne', 'bor_bicrad', 'bor_olecr'];
const VICINI = ['brach', 'bic', 'br', 'sup', 'ecrl', 'ecrb', 'edc', 'ecu', 'anc', 'tri_med', 'tri_lungo', 'lacerto', 'setto_med'];
// distanza esatta dalle mesh vicino alla superficie, con il segno dalla maschera dei voxel (le normali di capsula, legamenti e lamine non sono affidabili)
function campoDi(nomi) {
  const M = G.unione(nomi), { F } = G.sdf(M); gauss(F, 0.02); G.esatta(F, nomi, 0.12);
  for (let q = 0; q < N; q++) if (Math.abs(F[q]) <= 0.12) F[q] = (M[q] ? -1 : 1) * Math.abs(F[q]);
  return F;
}
// distanza con segno dall'asse dei tubi meno il raggio (nervi e vasi), solo entro 0,6 cm
function campoTubi(solo) {
  const F = new Float32Array(N).fill(1);
  for (const [id, P] of Object.entries(NVP.pts)) {
    if (solo && !solo.includes(id)) continue;
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
campi.osso = campoDi(OSSA); log('campo ossa');
campi.struttura = campoDi(STRUTT); log('campo strutture');
campi.muscolo = campoDi(VICINI); log('campo muscoli vicini');
campi.cft = campoDi(['cft']); log('campo tendine comune');
campi.cute = campoDi(['cute']); log('campo cute');
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
function riempi(Ms, r) {   // chiusura morfologica: riempie tunnel e fessure più strette di 2 × r
  const { Do } = G.sdf(Ms), F = G.chiuso(Do, r), out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = F[i] < 0 ? 1 : 0;
  return out;
}
const f0 = new Map();
let A0fcu;
for (const id of MUSCOLI) {
  if (id === 'fcu') {   // area per sezione del FCU di partenza (non spostato), da ripristinare
    const S1 = G.solid('fcu'); A0fcu = new Float64Array(NY); for (let q = 0; q < N; q++) if (S1[q]) A0fcu[jDi(q)] += PASSO * PASSO;
    G.setPos('fcu', posFcuSpostata());
  }
  const S = G.solid(id), P = riempi(S, CHIUSURA), { F } = G.sdf(P);
  gauss(F, LISCIA); rugosita(F, 3.7 * (MUSCOLI.indexOf(id) + 1)); f0.set(id, F);
  if (id === 'fcu') G.setPos('fcu', daPartenza('fcu').pos);
  log(`${id}: campo di partenza`);
}

/* ============ Ritagli e competizione tra muscoli (con o senza i tubi) ============ */
function vincoli(id, tubi) {
  const C = new Float32Array(N);
  if (!tubi && id === 'fcu') tubi = campoTubi(TUBI_FCU);   // il FCU non ingloba mai nervo e arteria ulnare (corrono nello spazio tra FCU e FDP/FDS)
  for (let q = 0; q < N; q++) C[q] = Math.max(GIOCO.osso - campi.osso[q], GIOCO.struttura - campi.struttura[q], GIOCO.muscolo - campi.muscolo[q], GIOCO.cft - campi.cft[q], tubi ? GIOCO.tubo - tubi[q] : -1, GIOCO.cute + campi.cute[q], Y_TAGLIO - yDi(q));
  for (let q = 0; q < N; q++) { const zm = zMio[q % NXY]; if (zm === zm) C[q] = Math.max(C[q], zm + GIOCO.struttura - (G.O[2] + (((q / NXY) | 0) + 0.5) * PASSO)); }
  if (id === 'fcu') for (let q = 0; q < N; q++) { const [x, y, z] = vox(q); C[q] = Math.max(C[q], limiteFcu(x, y) - z); }
  return C;
}
function apri(F, r) {   // apertura morfologica: F resta un campo con segno, solo ridotto dove il solido è più sottile di 2r
  const M = new Uint8Array(N); for (let q = 0; q < N; q++) M[q] = F[q] < 0 ? 1 : 0;
  const prof = G.edt(M, true), E = new Uint8Array(N); for (let q = 0; q < N; q++) E[q] = prof[q] >= r ? 1 : 0;
  const Dd = G.edt(E); let tolti = 0;
  for (let q = 0; q < N; q++) if (M[q]) { const v = Dd[q] - r; if (v >= 0) { F[q] = v + 0.02; tolti++; } }   // solo dove il solido viene tolto: altrove F resta quello esatto
  return tolti;
}
function costruisciCampi(tubi, deltaFisso) {
  const f1 = new Map(), f2 = new Map();
  for (const id of ALTRI) { const C = vincoli(id, tubi), F = Float32Array.from(f0.get(id)); for (let q = 0; q < N; q++) F[q] = Math.max(F[q], C[q]); f1.set(id, F); }
  // dove due muscoli si sovrappongono si dividono (vince chi è più dentro), con uno spazio tra loro
  for (const id of ALTRI) {
    const F = Float32Array.from(f1.get(id));
    for (const j of ALTRI) if (j !== id) { const Fj = f1.get(j); for (let q = 0; q < N; q++) { const c = (F[q] - Fj[q] + GIOCO.muscolo * 2) / 2; if (c > F[q]) F[q] = c; } }
    gauss(F, LISCIA2); if (id !== 'fpl') apri(F, APERTURA.altri); f2.set(id, F);
  }
  // FCU: cede il posto agli altri; la crescita nel piano della sezione ne ripristina l'area di partenza
  const C = vincoli('fcu', tubi); for (const j of ALTRI) { const Fj = f2.get(j); for (let q = 0; q < N; q++) { const c = GIOCO.muscolo - Fj[q]; if (c > C[q]) C[q] = c; } }
  const Fpre = f0.get('fcu'), delta = deltaFisso || new Float32Array(NY), fatto = new Uint8Array(NY);
  const area = d => { const a = new Float64Array(NY); for (let q = 0; q < N; q++) if (Math.max(Fpre[q] - d, C[q]) < 0) a[jDi(q)] += PASSO * PASSO; return a; };
  if (!deltaFisso) {   // la crescita si calcola senza i tubi e poi resta quella: i tubi ritagliano soltanto, il FCU non può richiudersi attorno a loro
    for (let d = 0; d <= CRESCITA.max + 1e-9; d += 0.02) { const a = area(d); for (let j = 0; j < NY; j++) if (!fatto[j] && (a[j] >= A0fcu[j] * 0.97 || d > CRESCITA.max - 1e-3)) { delta[j] = d; fatto[j] = 1; } }
    const ker = []; const sg = CRESCITA.sigma / PASSO, R = Math.ceil(3 * sg); let sk = 0; for (let k = -R; k <= R; k++) { const w = Math.exp(-k * k / (2 * sg * sg)); ker.push(w); sk += w; }
    const g = Float32Array.from(delta); for (let j = 0; j < NY; j++) { let a = 0, w = 0; for (let k = -R; k <= R; k++) { const jj = clamp(j + k, 0, NY - 1); a += g[jj] * ker[k + R]; w += ker[k + R]; } delta[j] = a / w; }
  }
  const F = Float32Array.from(Fpre); for (let q = 0; q < N; q++) F[q] = Math.max(Fpre[q] - delta[jDi(q)], C[q]);
  gauss(F, LISCIA2); apri(F, APERTURA.fcu); f2.set('fcu', F);
  const fin = (() => { const a = new Float64Array(NY); for (let q = 0; q < N; q++) if (F[q] < 0) a[jDi(q)] += PASSO * PASSO; return a; })();
  const rap = [-1, -3, -5, -7, -9, -11].map(y => { const j = Math.round((y - G.O[1]) / PASSO - 0.5); return `${y}: ${(fin[j] / A0fcu[j] * 100).toFixed(0)}%`; }).join(', ');
  log(`campi dei muscoli${tubi ? ' (con i tubi)' : ''}; crescita del FCU fino a ${(Math.max(...delta) * 10).toFixed(1)} mm; area del FCU rispetto a quella di partenza (y: %): ${rap}`);
  f2.delta = delta; return f2;
}

/* ============ Spostamento di nervi e vasi fuori dai muscoli ============ */
// un tubo può affondare in un muscolo al più per `AFFONDA` volte il proprio raggio (allora il solco resta aperto, nessun tunnel);
// se è più dentro, si sposta verso l'uscita più vicina; il tratto si sposta con continuità e gli estremi restano fermi
const AFFONDA = 0.8, TAPERA = 0.7, SIGMA_T = 0.55;   // TAPERA: cm dagli estremi fermi su cui lo spostamento sfuma; SIGMA_T: levigatura dello spostamento lungo il tubo (cm)
function spostaTubi(f2) {
  const ALTRI_CAMPI = [campi.osso, campi.struttura, campi.muscolo].map(F => [F, Object.fromEntries(Object.entries(NVP.pts).map(([id, P]) => [id, P.map(q => G.sample(F, q[0], q[1], q[2]))]))]);
  const U = new Float32Array(N).fill(1); for (const id of MUSCOLI) { const F = f2.get(id); for (let q = 0; q < N; q++) if (F[q] < U[q]) U[q] = F[q]; }
  const dentroGriglia = p => p[0] > AREA.lo[0] + 0.3 && p[0] < AREA.hi[0] - 0.3 && p[1] > AREA.lo[1] + 0.3 && p[1] < AREA.hi[1] - 0.3 && p[2] > AREA.lo[2] + 0.3 && p[2] < AREA.hi[2] - 0.3;
  const grad = (F, p) => { const e = PASSO, g = [G.sample(F, p[0] + e, p[1], p[2]) - G.sample(F, p[0] - e, p[1], p[2]), G.sample(F, p[0], p[1] + e, p[2]) - G.sample(F, p[0], p[1] - e, p[2]), G.sample(F, p[0], p[1], p[2] + e) - G.sample(F, p[0], p[1], p[2] - e)], l = Math.hypot(...g) || 1; return g.map(v => v / l); };
  for (const [id, P] of Object.entries(NVP.pts)) {
    const r = reff(id), n = P.length; if (!P.some(dentroGriglia)) continue;
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
        const v = -AFFONDA * r - G.sample(U, P[k][0], P[k][1], P[k][2]);   // v > 0: troppo dentro un muscolo
        if (it === 0) max0 = Math.max(max0, v);
        if (v > 0) { maxV = Math.max(maxV, v * (peso[k] > 0.05 ? 1 : 0)); const g = grad(U, P[k]); for (let c = 0; c < 3; c++) C[k][c] += g[c] * (v + 0.005); }
        // ossa, strutture e muscoli vicini: il tubo non va più dentro di quanto stava
        for (const [F, base] of ALTRI_CAMPI) { const need = Math.min(base[id][k], 0), w = need - G.sample(F, P[k][0], P[k][1], P[k][2]); if (w > 0) { const g = grad(F, P[k]); for (let c = 0; c < 3; c++) C[k][c] += g[c] * (w + 0.003); } }
      }
      if (maxV < 0.004 && it > 0) break;
      const T = D.map((d, k) => d.map((x, c) => x + C[k][c] * 0.7));
      for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) { let a = 0, w = 0; for (let j = -R; j <= R; j++) { const kk = k + j; if (kk < 0 || kk >= n) continue; a += T[kk][c] * ker[j + R]; w += ker[j + R]; } D[k][c] = a / w * peso[k]; P[k][c] = P0[k][c] + D[k][c]; }
    }
    if (max0 > 0) log(`tubi: ${id} ${(max0 * 10).toFixed(1)} mm dentro i muscoli, residuo ${(maxV * 10).toFixed(1)} mm`);
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
  const B = componenti(M, 0); let isole = 0, cavita = 0;
  for (let q = 0; q < N; q++) {
    if (M[q] && A.lab[q] !== big) { F[q] = 0.01; isole++; }
    else if (!M[q] && !B.dim[B.lab[q]].tocca) { F[q] = -0.01; cavita++; }
  }
  return { isole, cavita };
}

/* ============ Mesh dal campo ============ */
const MESH = { passo: Number(process.env.MESH || 0.15), taubin: 20 };   // cm: passo della griglia della mesh finale (più largo del campo: vertici ogni ~1,5 mm come le mesh originali) e passate di Taubin
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
  const nc = [0, 1, 2].map(k => Math.ceil((AREA.hi[k] - AREA.lo[k]) / MESH.passo));
  G.setGriglia(AREA.lo, MESH.passo, nc[0], nc[1], nc[2]);
  const Fc = G.valuta(p => campFine(p[0], p[1], p[2]));
  const out = G.nets(Fc, () => [0, 1, 0]);
  G.setGriglia(fine.O, PASSO, NX, NY, NZ);
  const n2 = out.pos.length / 3;
  let pos = out.pos;
  const e = PASSO * 0.75;
  for (let i = 0; i < n2; i++) {   // Newton verso F = 0 con il gradiente del campo fine
    let p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    for (let it = 0; it < 5; it++) {
      const v = campFine(p[0], p[1], p[2]), g = [campFine(p[0] + e, p[1], p[2]) - campFine(p[0] - e, p[1], p[2]), campFine(p[0], p[1] + e, p[2]) - campFine(p[0], p[1] - e, p[2]), campFine(p[0], p[1], p[2] + e) - campFine(p[0], p[1], p[2] - e)].map(x => x / (2 * e)), g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] || 1;
      const st = clamp(v / g2, -0.1, 0.1); p = [p[0] - g[0] * st, p[1] - g[1] * st, p[2] - g[2] * st]; if (Math.abs(v) < 2e-4) break;
    }
    pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
  }
  pos = G.taubin(pos, out.idx, TAUBIN);
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
  for (let i = 0; i < n2; i++) { tag[i] = sezione[i] || Math.round(clamp(tagF[i], 0, 200)); for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(clamp(fd[3 * i + k], -1, 1) * 127); }
  return { pos, idx: out.idx, tag, fdir };
}

/* ============ Esecuzione ============ */
let f2 = costruisciCampi(null);
if (CON_TUBI) {
  spostaTubi(f2); allineaRami();
  f2 = costruisciCampi(campoTubi(), f2.delta);
  G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${pyJson(NVP)};\n`);
}
for (const id of MUSCOLI) {
  const pul = pulisci(f2.get(id));
  const r = costruisci(id, f2.get(id));
  setMesh(id, r);
  log(`${id}: ${r.pos.length / 3} vertici (${pul.isole} voxel isolati rimossi, ${pul.cavita} cavità riempite)`);
}
saveFile(repack());
