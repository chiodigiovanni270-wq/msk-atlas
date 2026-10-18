/* Setti intermuscolari del gomito (modelli/gomito-3d.html): `setto_med` e `setto_lat`.

   Uso (dalla cartella del progetto):
     node strumenti/setti-gomito.mjs              → riscrive le mesh `setto_med` e `setto_lat` nel file del modello
     MODELLO=/tmp/copia.html node strumenti/setti-gomito.mjs   → lavora su una copia
     node strumenti/setti-gomito.mjs verifica     → non scrive: compenetrazioni e forma delle mesh del file
     node strumenti/setti-gomito.mjs prova        → non scrive: stampa solo le misure delle mesh calcolate

   Metodo e parametri: GUIDA_MODELLI.md. Non legge i setti che ci sono nel file (li sostituisce): va lanciato per ultimo nella catena del gomito
   (dopo muscoli, vene, nervi e arterie, che i setti scansano) e si può rilanciare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { clamp, sstep, log, REAL, setMesh } = G;

const MODO = process.argv.slice(2).find(a => !a.startsWith('--')) || 'scrivi';

/* ============ Tabelle ============ */
// Il setto è la membrana che sta tra i compartimenti del braccio: la sua superficie media è il luogo dei punti equidistanti dal compartimento
// posteriore (tricipite, e a valle anconeo, ECU, EDC, EDM, FCU) e da quello anteriore (brachiale, bicipite, brachioradiale, ECRL/ECRB, pronatore,
// FCR, palmare lungo, FDS), cioè lo spazio tra i muscoli; parte dall'omero (cresta sopracondiloidea) e finisce dove i due compartimenti si
// allontanano (oltre non c'è più una membrana tra i due: il resto della fascia non è modellato).
const POST = ['tri_med', 'tri_lat', 'tri_lungo', 'anc', 'ecu', 'edc', 'edm', 'fcu'];
const ANT = ['brach', 'bic', 'br', 'ecrl', 'ecrb', 'pt', 'fcr', 'pl', 'fds'];
// strutture che il setto non attraversa (oltre ai muscoli dei due compartimenti): ossa del gomito, legamenti, capsula, lacerto, borse, cuscinetti, linfonodi
const ALTRI = ['ulna', 'radio', 'cart_omero', 'cart_ulna', 'cart_radio', 'caps', 'fat_ant', 'fat_post', 'bor_olecr', 'bor_bicrad', 'ucl_ant', 'ucl_post', 'ucl_trasv',
  'rcl', 'anulare', 'lucl', 'osborne', 'lacerto', 'mio', 'quadrato', 'sup', 'fdp', 'fpl', 'apl', 'epl', 'linfonodi'];
const FORMA = {
  spessore: 0.045,    // cm: spessore nel corpo del setto (0,45 mm: membrana sottile)
  spessoreMin: 0.015, // cm: spessore dove i muscoli si toccano (la lamina entra tra di loro senza compenetrarli oltre)
  gioco: 0.008,       // cm: gioco della lamina dalla faccia dei muscoli
  spazio: { da: 0.6, a: 1.4 },     // cm: larghezza dello spazio tra i due compartimenti: sotto `da` il setto c'è, sopra `a` sfuma a zero (i muscoli si sono allontanati)
  muscoli: { da: -0.03, a: -0.005 }, // cm: distanza con segno dai muscoli dei due compartimenti: la lamina sfuma se li attraversa (compenetrazione ≥ 0,3 mm)
  fascia: { raggio: 0.8, da: 0.0, a: 0.12 },  // cm: la fascia profonda è la chiusura morfologica (palla di questo raggio) di muscoli e omero: la lamina arriva a questa superficie e vi sfuma
  osso: { da: -0.07, a: -0.015 },  // cm: distanza con segno dall'omero: lo spessore va a zero entrando nell'osso (inserzione sulla cresta, il bordo resta nascosto)
  altri: { da: 0.01, a: 0.06 },    // cm: distanza dalle altre strutture sotto la quale il setto sfuma a zero
  tubi: { da: 0.04, a: 0.12 },     // cm: distanza dal bordo dei tubi (vasi e nervi): attorno ai tubi si apre un'asola, dove il nervo (o il vaso) attraversa il setto
  cute: { da: 0.04, a: 0.14 },     // cm: profondità sotto la cute oltre la quale il setto è pieno
  testa: { da: 11.88, a: 12.0 },   // cm: la finestra del modello finisce a y = 12: la lamina sfuma prima, senza bordo aperto sul piano di taglio
  fondo: { da: -0.95, a: -0.7 },   // cm: stesso discorso verso il basso (estremo distale della griglia a y = −1,2)
  soglia: 0.05,       // w sotto cui i vertici contano come "fuori": i triangoli con tutti i vertici fuori si scartano (bordo)
  minimoArea: 0.6,    // cm²: le componenti più piccole (una faccia) sono scartate
  levigatura: 14,     // passate di Taubin sulla superficie media, con i vertici di bordo trattenuti
};
const GRIGLIA = { lo: [-5.4, -1.2, -4.7], hi: [4.8, 12.05, 3.7], passo: 0.05 };
const REGIONE = { med: { xmin: 0.2 }, lat: { xmax: 0.9 } };   // dove cercare le due lamine (x mediale +): la divisione tra l'una e l'altra passa sull'omero

const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
const reff = id => NVP.r[id] * 1.08;

/* ============ Campi ============ */
G.griglia(GRIGLIA.lo, GRIGLIA.hi, GRIGLIA.passo, 0);
const { N, NX, NY, NZ, H } = G;
const campoDi = nomi => G.campo(nomi).F;                 // distanza con segno (negativa dentro), esatta vicino alla superficie
const Fpost = campoDi(POST), Fant = campoDi(ANT), Fomero = campoDi(['omero']), Faltri = campoDi(ALTRI);
const Ftutto = (() => { const { Do } = G.sdf(G.unione([...POST, ...ANT, 'omero'])); return G.chiuso(Do, FORMA.fascia.raggio); })();   // < 0 dentro la fascia profonda
const Fcute = G.sdf(G.solid('cute')).F; G.sfoca(Fcute, 1);
log('campi dei compartimenti, omero, altre strutture e cute');
// distanza dal bordo dei tubi (vasi e nervi; raggio massimo del tubo)
const Ftubi = new Float32Array(N).fill(9);
for (const [id, P] of Object.entries(NVP.pts)) {
  const r = reff(id);
  for (let s = 0; s + 1 < P.length; s++) {
    const a = P[s], b = P[s + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = Math.max(1, Math.ceil(L / (H * 0.5)));
    for (let u = 0; u <= m; u++) {
      const c = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * u / m), R = Math.ceil((r + 0.2) / H) + 1;
      if (c[0] < GRIGLIA.lo[0] - 1 || c[0] > GRIGLIA.hi[0] + 1 || c[1] < GRIGLIA.lo[1] - 1 || c[1] > GRIGLIA.hi[1] + 1) continue;
      const i0 = Math.floor((c[0] - G.O[0]) / H), j0 = Math.floor((c[1] - G.O[1]) / H), k0 = Math.floor((c[2] - G.O[2]) / H);
      for (let k = k0 - R; k <= k0 + R; k++) for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) {
        if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) continue;
        const q = G.vi(i, j, k), p = G.voxel(q), d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r; if (d < Ftubi[q]) Ftubi[q] = d;
      }
    }
  }
}
log('campo dei tubi');
// superficie media tra i due compartimenti: f = distanza dal posteriore − distanza dall'anteriore (negativa dalla parte del posteriore)
const F = new Float32Array(N); for (let i = 0; i < N; i++) F[i] = Fpost[i] - Fant[i];
G.sfoca(F, 1);

/* ============ Peso (0-1) in un punto: 1 = lamina piena, 0 = nessuna lamina ============ */
const campiona = (A, p) => G.sample(A, p[0], p[1], p[2]);
const pesi = p => {
  const dp = campiona(Fpost, p), da = campiona(Fant, p), spazio = dp + da;
  const wSpazio = 1 - sstep(FORMA.spazio.da, FORMA.spazio.a, spazio);
  const wMuscoli = sstep(FORMA.muscoli.da, FORMA.muscoli.a, Math.min(dp, da));
  const wFascia = sstep(FORMA.fascia.da, FORMA.fascia.a, -campiona(Ftutto, p));
  const wTesta = (1 - sstep(FORMA.testa.da, FORMA.testa.a, p[1])) * sstep(FORMA.fondo.da, FORMA.fondo.a, p[1]);
  const wOsso = sstep(FORMA.osso.da, FORMA.osso.a, campiona(Fomero, p));
  const wAltri = sstep(FORMA.altri.da, FORMA.altri.a, campiona(Faltri, p));
  const wTubi = sstep(FORMA.tubi.da, FORMA.tubi.a, campiona(Ftubi, p));
  const wCute = sstep(FORMA.cute.da, FORMA.cute.a, -campiona(Fcute, p));
  return { w: wTesta * wSpazio * wMuscoli * wFascia * wOsso * wAltri * wTubi * wCute, spazio, wSpazio, wMuscoli, wFascia, wOsso, wAltri, wTubi, wCute };
};

/* ============ Superficie media (surface nets sul campo F) ============ */
function superficie(F) {
  const a = G.nets(F, () => [0, 1, 0]);
  return { pos: a.pos, idx: a.idx };
}
const S0 = superficie(F);
log(`superficie media: ${S0.pos.length / 3} vertici, ${S0.idx.length / 3} triangoli`);

/* ============ Costruzione delle due lamine ============ */
const area = (pos, idx) => { let s = 0; for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
  const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
  s += 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]); } return s; };

function lamina(regione, nome) {
  const { pos: P0, idx: I0 } = S0, nv0 = P0.length / 3;
  const fuori = p => (regione.xmin !== undefined && p[0] < regione.xmin) || (regione.xmax !== undefined && p[0] > regione.xmax);
  // peso per vertice
  const W = new Float32Array(nv0), SP = new Float32Array(nv0);
  for (let i = 0; i < nv0; i++) {
    const p = [P0[3 * i], P0[3 * i + 1], P0[3 * i + 2]];
    if (fuori(p)) continue;
    const r = pesi(p); W[i] = r.w; SP[i] = r.spazio;
  }
  // triangoli con almeno un vertice dentro; componenti connesse (per vertici con peso)
  let tri = []; for (let t = 0; t < I0.length; t += 3) if (W[I0[t]] > FORMA.soglia || W[I0[t + 1]] > FORMA.soglia || W[I0[t + 2]] > FORMA.soglia) tri.push(t);
  const padre = new Int32Array(nv0).map((_, i) => i), trova = x => { while (padre[x] !== x) { padre[x] = padre[padre[x]]; x = padre[x]; } return x; };
  for (const t of tri) { const a = trova(I0[t]), b = trova(I0[t + 1]), c = trova(I0[t + 2]); padre[b] = a; padre[trova(c)] = a; }
  const comp = new Map(); for (const t of tri) { const k = trova(I0[t]); (comp.get(k) || comp.set(k, []).get(k)).push(t); }
  const tieni = []; for (const [, L] of comp) { let s = 0; for (const t of L) s += area(P0, I0.subarray(t, t + 3)); if (s >= FORMA.minimoArea) tieni.push(...L); }
  tri = tieni;
  // vertici usati e rinumerazione
  const nuovo = new Int32Array(nv0).fill(-1), usati = []; for (const t of tri) for (let k = 0; k < 3; k++) { const v = I0[t + k]; if (nuovo[v] < 0) { nuovo[v] = usati.length; usati.push(v); } }
  let n = usati.length, pos = new Float32Array(n * 3), w = new Float32Array(n);
  usati.forEach((v, i) => { for (let k = 0; k < 3; k++) pos[3 * i + k] = P0[3 * v + k]; w[i] = W[v]; });
  let idx = []; for (const t of tri) idx.push(nuovo[I0[t]], nuovo[I0[t + 1]], nuovo[I0[t + 2]]);
  // levigatura (Taubin) trattenendo i vertici di bordo, poi pesi ricalcolati sulla superficie levigata
  pos = lisciaConBordo(pos, idx, FORMA.levigatura);
  for (let i = 0; i < n; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; w[i] = fuori(p) ? 0 : pesi(p).w; }
  { const f = []; for (let t = 0; t < idx.length; t += 3) if (w[idx[t]] > FORMA.soglia || w[idx[t + 1]] > FORMA.soglia || w[idx[t + 2]] > FORMA.soglia) f.push(idx[t], idx[t + 1], idx[t + 2]); idx = f; }   // il bordo segue i pesi sulla superficie levigata
  // normali della superficie media (per vertice, dalle facce), orientate come il gradiente di F (verso l'anteriore)
  const nrm = new Float32Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const q of [a, b, c]) for (let k = 0; k < 3; k++) nrm[q + k] += f[k]; }
  for (let i = 0; i < n; i++) { const l = Math.hypot(nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]) || 1; for (let k = 0; k < 3; k++) nrm[3 * i + k] /= l; }
  // spessore per vertice
  const T = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = pesi([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
    const tmax = Math.max(FORMA.spessoreMin, Math.min(FORMA.spessore, r.spazio - 2 * FORMA.gioco));
    T[i] = w[i] > FORMA.soglia ? tmax * sstep(FORMA.soglia, 0.6, w[i]) : 0; }
  // lastra chiusa: faccia posteriore (−n) e anteriore (+n); sul bordo lo spessore va a zero e le due facce coincidono
  const pos2 = new Float32Array(n * 6), nm = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    pos2[3 * i + k] = pos[3 * i + k] + nrm[3 * i + k] * T[i] / 2; pos2[3 * (n + i) + k] = pos[3 * i + k] - nrm[3 * i + k] * T[i] / 2;
    nm[3 * i + k] = nrm[3 * i + k]; nm[3 * (n + i) + k] = -nrm[3 * i + k]; }
  const giu = i => T[i] > 1e-6 ? n + i : i;   // sul bordo (spessore 0) le due facce condividono i vertici: lastra chiusa
  const idx2 = []; for (let t = 0; t < idx.length; t += 3) { idx2.push(idx[t], idx[t + 1], idx[t + 2]); idx2.push(giu(idx[t]), giu(idx[t + 2]), giu(idx[t + 1])); }
  log(`${nome}: ${n} vertici sulla superficie media, area ${area(pos, idx).toFixed(2)} cm², spessore massimo ${(Math.max(...T) * 10).toFixed(2)} mm`);
  return { pos: pos2, idx: Uint32Array.from(idx2), tag: null, fdir: null, nrm: Int8Array.from(nm, x => Math.round(x * 127)), media: pos, T, w };
}
function lisciaConBordo(pos, I, iter) {
  const nv = pos.length / 3, nb = Array.from({ length: nv }, () => new Set()), cnt = new Map();
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; nb[a].add(b); nb[b].add(a); const key = a < b ? a * nv + b : b * nv + a; cnt.set(key, (cnt.get(key) || 0) + 1); }
  const fisso = new Uint8Array(nv); for (const [key, c] of cnt) if (c === 1) { fisso[Math.floor(key / nv)] = 1; fisso[key % nv] = 1; }
  const NB = nb.map(s => [...s]);
  for (let it = 0; it < iter; it++) {
    const lam = it % 2 ? -0.53 : 0.5, q = pos.slice();
    for (let i = 0; i < nv; i++) { if (fisso[i]) continue; const L = NB[i]; if (!L.length) continue; let x = 0, y = 0, z = 0; for (const j of L) { x += pos[3 * j]; y += pos[3 * j + 1]; z += pos[3 * j + 2]; }
      q[3 * i] += lam * (x / L.length - pos[3 * i]); q[3 * i + 1] += lam * (y / L.length - pos[3 * i + 1]); q[3 * i + 2] += lam * (z / L.length - pos[3 * i + 2]); }
    pos = q;
  }
  return pos;
}

const MED = lamina(REGIONE.med, 'setto_med'), LAT = lamina(REGIONE.lat, 'setto_lat');

/* ============ Controlli ============ */
function controlla(nome, m) {
  const n = m.pos.length / 3, h = n / 2, spesso = i => Math.hypot(m.pos[3 * i] - m.pos[3 * (i % h + h)], m.pos[3 * i + 1] - m.pos[3 * (i % h + h) + 1], m.pos[3 * i + 2] - m.pos[3 * (i % h + h) + 2]) > 0.003;   // i vertici a spessore ≈ 0 (bordo, dentro l'osso) non contano
  const nomiCampi = { omero: Fomero, 'muscoli posteriori': Fpost, 'muscoli anteriori': Fant, 'altre strutture': Faltri };
  const righe = []; for (const [k, A] of Object.entries(nomiCampi)) { let dentro = 0, max = 0; for (let i = 0; i < n; i++) { if (!spesso(i)) continue; const d = campiona(A, [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]]); if (d < -0.005) { dentro++; max = Math.max(max, -d); } }
    righe.push(`${k}: ${dentro} vertici dentro (max ${(max * 10).toFixed(2)} mm)`); }
  let tubo = 0, maxT = 0; for (let i = 0; i < n; i++) { if (!spesso(i)) continue; const d = campiona(Ftubi, [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]]); if (d < -0.002) { tubo++; maxT = Math.max(maxT, -d); } }
  righe.push(`tubi: ${tubo} vertici dentro (max ${(maxT * 10).toFixed(2)} mm)`);
  const E = new Map(); for (let t = 0; t < m.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = m.idx[t + k], b = m.idx[t + (k + 1) % 3], key = a < b ? a + ':' + b : b + ':' + a; E.set(key, (E.get(key) || 0) + 1); }
  let aperti = 0; for (const c of E.values()) if (c === 1) aperti++;
  console.log(`${nome}: ${n} vertici, ${m.idx.length / 3} triangoli, area ${area(m.pos, m.idx).toFixed(2)} cm²`); righe.forEach(r => console.log('  ' + r)); console.log(`  spigoli aperti (solo di bordo con spessore ≈ 0 sono attesi): ${aperti}`);
}

if (MODO === 'prova') { controlla('setto_med', MED); controlla('setto_lat', LAT); process.exit(0); }
if (MODO === 'verifica') { for (const n of ['setto_med', 'setto_lat']) { const r = REAL(n); controlla(n, { pos: r.pos, idx: r.idx }); } process.exit(0); }

controlla('setto_med', MED); controlla('setto_lat', LAT);
setMesh('setto_med', MED); setMesh('setto_lat', LAT);
G.saveFile(G.repack());
