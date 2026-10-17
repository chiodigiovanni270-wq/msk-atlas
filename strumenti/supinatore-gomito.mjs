/* Supinatore del gomito (modelli/gomito-3d.html): toglie il tunnel in cui correva il ramo superficiale del nervo radiale e scava quello del NIP.

   Uso (dalla cartella del progetto):
     node strumenti/supinatore-gomito.mjs              → riscrive la mesh `sup`, sposta i vertici di `br` e porta `n_rad_sup` sulla superficie
     MODELLO=/tmp/copia.html node strumenti/supinatore-gomito.mjs   → lavora su una copia
     node strumenti/supinatore-gomito.mjs verifica     → non scrive: tunnel residui, vertici dentro il nervo, vicini

   Metodo e parametri: GUIDA_MODELLI.md. Va lanciato dopo nervi-gomito.mjs (che produce il decorso di partenza del ramo superficiale e il NIP dentro il muscolo) e prima di
   lacerto-gomito.mjs. Riparte sempre dalle mesh `sup` e `br` e dal tubo `n_rad_sup` della revisione `BASE`, quindi è idempotente; se si rilanciano
   gli strumenti che le riscrivono (nervi-gomito.mjs, rifinitura-estensori-gomito.mjs), aggiornare `BASE` e rilanciarlo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const G = await import('./lib-modello.mjs');
const { clamp, sstep, log, setMesh, REAL, realDaRevisione } = G;
const argv = process.argv.slice(2), VERIFICA = argv.includes('verifica');

const BASE = '37e1992';   // revisione con sup, br e n_rad_sup di partenza (prima di questo strumento)
const FILE_REPO = 'modelli/gomito-3d.html';
const PASSO = 0.05, PASSO_MESH = 0.12, TAUBIN = 20;
const AREA = { lo: [-5.8, -10.4, -1.7], hi: [0.3, 2.2, 3.0] };
// Tunnel del ramo superficiale: da `yDa` (cm) in giù il nervo corre dentro il supinatore; lo spostamento sulla superficie cresce in `rampa` cm e si annulla
// tra `yDistale` e `yDistale − rampaDistale` (più in basso il nervo resta dov'era: lì tra radio ed ECRB non c'è spazio per un letto). `maxLift`: spostamento massimo (cm).
// I solchi e i tunnel di partenza (ramo superficiale e vecchio decorso del NIP) si riempiono con la chiusura morfologica (`chiusura`, cm) del muscolo, solo entro
// `riempi` cm dal vecchio decorso del ramo superficiale e, con una rampa più larga (`riempiNip`), dal vecchio decorso del NIP, e lontano dall'arteria interossea posteriore (il cui passaggio è anatomico). Il ramo superficiale si porta sulla superficie del muscolo
// riempito, dal lato opposto al radio, e vi si scava il letto (tubo di raggio r + `gioco`); il NIP, che nervi-gomito.mjs porta dentro il muscolo, lo attraversa in un tunnel
// (raggio locale + `gioco`), con una parete di almeno `pareteNip` cm dentro l'involucro del muscolo (che può superare al più di `rilievoNip` cm); agli imbocchi il campo si sfoca aggiungendo solo muscolo (`imbocchi`). Nel brachioradiale (`letto`) i vertici entro il letto del ramo superficiale vanno sulla semicirconferenza interna del tubo (mesh suddivisa
// dove serve). Mesh del supinatore a passo `passoMesh` cm: le pareti del tunnel sono sottili (≥ 0,9 mm).
const SUP = { nervo: 'n_rad_sup', yDa: -2.0, rampa: 0.9, yDistale: -7.0, rampaDistale: 2.0, maxLift: 1.0, chiusura: 0.4, riempi: 0.28, gioco: 0.03, sigmaPercorso: 0.35, nip: 'n_pin', arteria: 'a_interossea_post', letto: ['br'], bed: { margine: 0.02, lato: 0.05, suddividi: 10, cicli: 6 },
 riempiNip: [0.15, 0.45], leviga: 2, ramiIngresso: { n_rm_sup: { coda: 0.7, profondita: 0.3 } }, pareteNip: 0.12, rilievoNip: 0.04, imbocchi: { passate: 6, raggio: 0.7, fascia: 0.6 }, passoMesh: 0.08 };
const FIBRE = { sigma: 0.5, sigmaTag: 0.22, passate: 6 };

const leggiNVP = html => JSON.parse(html.match(/const NVP=(\{.*?\});\n/s)[1]);
const NVP = leggiNVP(G.M.html);
const NVP0 = VERIFICA ? NVP : leggiNVP(execFileSync('git', ['show', `${BASE}:${FILE_REPO}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8'));

/* ============ Geometria ============ */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return mul(a, 1 / l); };
function catmull(W, passo) {
  const out = [], n = W.length, P = i => W[clamp(i, 0, n - 1)];
  for (let s = 0; s < n - 1; s++) {
    const p0 = s === 0 ? sub(mul(W[0], 2), W[1]) : P(s - 1), p1 = W[s], p2 = W[s + 1], p3 = s + 2 >= n ? sub(mul(W[n - 1], 2), W[n - 2]) : P(s + 2), m = 24;
    for (let u = 0; u < m; u++) { const t = u / m, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))); }
  }
  out.push(W[n - 1]); return risampiona(out, passo);
}
function risampiona(P, passo) {
  const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1])));
  const L = c[c.length - 1], n = Math.max(3, Math.round(L / passo)), out = []; let k = 0;
  for (let i = 0; i <= n; i++) { const s = L * i / n; while (k < c.length - 2 && c[k + 1] < s) k++; const u = (s - c[k]) / ((c[k + 1] - c[k]) || 1); out.push(add(P[k], mul(sub(P[k + 1], P[k]), u))); }
  return out;
}
const arco = P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1]))); return c; };
// punto della polilinea più vicino a q: { d, p, i }. Il decorso scende in y: si cercano solo i segmenti entro ±`FINESTRA` cm in quota (ricerca binaria sull'ascissa y)
const FINESTRA = 0.9;
function vicino(P, q) {
  let a = 0, b = P.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (P[m][1] >= q[1]) a = m; else b = m; }
  const passo = Math.max(1e-6, Math.abs(P[0][1] - P.at(-1)[1]) / (P.length - 1)), k = Math.ceil(FINESTRA / passo), i0 = Math.max(0, a - k), i1 = Math.min(P.length - 2, a + k);
  let bd = 1e18, bp = null, bi = i0;
  for (let i = i0; i <= i1; i++) { const A = P[i], ab = sub(P[i + 1], A), L2 = dot(ab, ab) || 1e-12, u = clamp(dot(sub(q, A), ab) / L2, 0, 1), p = add(A, mul(ab, u)), d = len(sub(q, p)); if (d < bd) { bd = d; bp = p; bi = i; } }
  return { d: bd, p: bp, i: bi };
}
// campo di distanza da una polilinea sulla griglia corrente (solo entro `rho`; altrove rho)
function campoDistanza(P, rho) {
  const F = new Float32Array(G.N).fill(rho), { O, H, NX, NY, NZ } = G;
  for (let s = 0; s + 1 < P.length; s++) {
    const a = P[s], b = P[s + 1], ab = sub(b, a), L2 = dot(ab, ab) || 1e-12;
    const lo = [0, 1, 2].map(k => clamp(Math.floor((Math.min(a[k], b[k]) - rho - O[k]) / H), 0, [NX, NY, NZ][k] - 1)), hi = [0, 1, 2].map(k => clamp(Math.ceil((Math.max(a[k], b[k]) + rho - O[k]) / H), 0, [NX, NY, NZ][k] - 1));
    for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
      const p = [O[0] + (i + 0.5) * H, O[1] + (j + 0.5) * H, O[2] + (k + 0.5) * H], u = clamp(dot(sub(p, a), ab) / L2, 0, 1), d = len(sub(p, add(a, mul(ab, u))));
      const id = G.vi(i, j, k); if (d < F[id]) F[id] = d; }
  }
  return F;
}
const eulero = (nv, idx) => { const E = new Set(); for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; E.add(Math.min(a, b) * 4e6 + Math.max(a, b)); } return nv - E.size + idx.length / 3; };

/* ============ Dati di partenza ============ */

const r = NVP0.r[SUP.nervo], rP = NVP.r[SUP.nip], rA = NVP.r[SUP.arteria];
const vecchio = catmull(NVP0.pts[SUP.nervo], PASSO), pin = catmull(NVP.pts[SUP.nip], 0.1), pinVecchio = catmull(NVP0.pts[SUP.nip], 0.1), rPv = NVP0.r[SUP.nip], arteria = catmull(NVP.pts[SUP.arteria], 0.1);
const rpv = NVP.rp?.[SUP.nip];   // raggio locale del NIP lungo il decorso (profilo relativo)
const rLoc = i => rpv ? rP * (() => { const x = i / (pin.length - 1) * (rpv.length - 1), k = Math.min(rpv.length - 2, Math.floor(x)); return rpv[k] + (rpv[k + 1] - rpv[k]) * (x - k); })() : rP;
const baseSup = realDaRevisione(BASE, 'sup', FILE_REPO), baseLetto = Object.fromEntries(SUP.letto.map(id => [id, realDaRevisione(BASE, id, FILE_REPO)]));

/* ============ Verifica ============ */
function verificaStato(nome, nervo, sup, muscoli) {
  const out = [`${nome}:`];
  const conta = (pos, P, rr, idx) => { let n = 0, mx = 0;   // vertici e, se c'è l'indice, punti interni dei triangoli (suddivisione 4×4)
    for (let i = 0; i < pos.length; i += 3) { const d = rr - vicino(P, [pos[i], pos[i + 1], pos[i + 2]]).d; if (d > 0.003) { n++; mx = Math.max(mx, d); } }
    if (idx) for (let t = 0; t < idx.length; t += 3) { const A = [0, 1, 2].map(k => [pos[3 * idx[t + k]], pos[3 * idx[t + k] + 1], pos[3 * idx[t + k] + 2]]); if (Math.min(...A.map(q => vicino(P, q).d)) > rr + 0.35) continue;
      for (let u = 1; u < 4; u++) for (let v = 1; v < 4 - u; v++) { const q = add(add(mul(A[0], u / 4), mul(A[1], v / 4)), mul(A[2], (4 - u - v) / 4)), d = rr - vicino(P, q).d; if (d > 0.003) { n++; mx = Math.max(mx, d); } } }
    return [n, mx]; };
  const nv = sup.pos.length / 3, chi = eulero(nv, sup.idx);
  out.push(`  supinatore: ${nv} vertici, genere ${(2 - chi) / 2} (caratteristica di Eulero ${chi})`);
  for (const [n, m] of [['sup', sup], ...Object.entries(muscoli)]) { const [c, mx] = conta(m.pos, nervo, r, m.idx); out.push(`  punti di ${n} dentro il ramo superficiale (r ${(r * 10).toFixed(1)} mm): ${c}, max ${(mx * 10).toFixed(2)} mm`); }
  for (const id of ['ecrb', 'ecrl', 'pt', 'anc', 'radio', 'br'].filter(i => !(i in muscoli))) { const m = REAL(id), [c, mx] = conta(m.pos, nervo, r, m.idx); out.push(`  punti di ${id} dentro il ramo superficiale: ${c}, max ${(mx * 10).toFixed(2)} mm`); }
  return out.join('\n');
}
if (VERIFICA) {
  const nervo = catmull(NVP.pts[SUP.nervo], 0.05);
  console.log(verificaStato('stato attuale', nervo, REAL('sup'), Object.fromEntries(SUP.letto.map(id => [id, REAL(id)])))); process.exit(0);
}

/* ============ Campi sulla griglia fine ============ */
setMesh('sup', { pos: Float32Array.from(baseSup.pos), idx: baseSup.idx, tag: baseSup.tag, fdir: baseSup.fdir });
G.griglia(AREA.lo, AREA.hi, PASSO, 0);
const FINE = { O: [...G.O], H: G.H, NX: G.NX, NY: G.NY, NZ: G.NZ, NXY: G.NXY };
const campFine = (F, x, y, z) => {
  const { O, H, NX, NY, NZ, NXY } = FINE; let fx = (x - O[0]) / H - 0.5, fy = (y - O[1]) / H - 0.5, fz = (z - O[2]) / H - 0.5;
  fx = clamp(fx, 0, NX - 1.001); fy = clamp(fy, 0, NY - 1.001); fz = clamp(fz, 0, NZ - 1.001);
  const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k, b = i + NX * j + NXY * k, l = (a, c, t) => a + (c - a) * t;
  return l(l(l(F[b], F[b + 1], u), l(F[b + NX], F[b + NX + 1], u), v), l(l(F[b + NXY], F[b + NXY + 1], u), l(F[b + NXY + NX], F[b + NXY + NX + 1], u), v), w);
};
log('campi: supinatore');
const { F: Fs, Do } = G.campo(['sup']);
const Fcl = G.chiuso(Do, SUP.chiusura);
const Dold = campoDistanza(vecchio, 0.8), Dpin = campoDistanza(pin, 0.8), Dart = campoDistanza(arteria, 0.8), DpinOld = campoDistanza(pinVecchio, 0.8);
const F1 = new Float32Array(G.N);   // supinatore con i tunnel e i solchi di partenza riempiti (ramo superficiale e vecchio decorso del NIP)
let riempiti = 0;
for (let q = 0; q < G.N; q++) {
  const lontanoArteria = sstep(rA + 0.06, rA + 0.16, Dart[q]), w = (1 - sstep(r + SUP.riempi * 0.7, r + SUP.riempi, Dold[q])) * lontanoArteria;
  F1[q] = Math.min(Fs[q], Fcl[q] + 3 * (1 - w));
  // vecchio solco del NIP: fusione graduale (rampa larga `riempiNip`) tra muscolo e chiusura, senza gradino sul bordo del riempimento
  const wN = (1 - sstep(rPv + SUP.riempiNip[0], rPv + SUP.riempiNip[1], DpinOld[q])) * lontanoArteria;
  if (wN > 0) F1[q] += wN * (Math.min(F1[q], Fcl[q]) - F1[q]);
  if (Fs[q] >= 0 && F1[q] < 0) riempiti++;
}
log('voxel riempiti', riempiti);

/* ============ Nuovo decorso del nervo: sulla superficie, dal lato opposto al radio ============ */
const rad = REAL('radio'), centroRadio = y => { let s = [0, 0, 0], n = 0; for (let i = 0; i < rad.pos.length; i += 3) if (Math.abs(rad.pos[i + 1] - y) < 0.3) { s = add(s, [rad.pos[i], rad.pos[i + 1], rad.pos[i + 2]]); n++; } return n ? mul(s, 1 / n) : null; };
const peso = y => sstep(SUP.yDa, SUP.yDa - SUP.rampa, y) * (1 - sstep(SUP.yDistale, SUP.yDistale - SUP.rampaDistale, y));   // spostamento graduale agli estremi
let spost = vecchio.map((p, i) => {
  const t = peso(p[1]); if (t <= 0) return [0, 0, 0];
  const T = nrm(sub(vecchio[Math.min(vecchio.length - 1, i + 1)], vecchio[Math.max(0, i - 1)])), c = centroRadio(p[1]) || p;
  let d = sub(sub(p, c), mul(T, dot(sub(p, c), T))); d = nrm(d);
  let s = 0; while (s < SUP.maxLift && campFine(F1, p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s) < 0) s += 0.01;   // fino alla superficie del supinatore riempito
  return mul(d, s * t);
});
{   // levigatura dello spostamento lungo il decorso
  const c = arco(vecchio), S = spost.map((_, i) => { let w = 0, s = [0, 0, 0]; for (let j = 0; j < vecchio.length; j++) { const dd = c[j] - c[i]; if (Math.abs(dd) > 3 * SUP.sigmaPercorso) continue; const g = Math.exp(-0.5 * (dd / SUP.sigmaPercorso) ** 2); w += g; s = add(s, mul(spost[j], g)); } return mul(s, 1 / w); });
  spost = S;
}
const nuovo = vecchio.map((p, i) => add(p, spost[i]));
log('decorso: spostamento massimo', Math.max(...spost.map(len)).toFixed(2), 'cm');

/* ============ Letto nel supinatore ============ */
const Dnuovo = campoDistanza(nuovo, r + 0.5), F2 = new Float32Array(G.N), rr = r + SUP.gioco;
for (let q = 0; q < G.N; q++) F2[q] = Math.max(F1[q], rr - Dnuovo[q]);
// manicotto (parete) e tunnel del NIP: la parete è un manicotto di muscolo spesso `pareteNip` intorno al tunnel, solo dentro l'involucro del muscolo (chiusura), che chiude
// i punti in cui la parete sarebbe sottile o bucata (sporge al più `rilievoNip` cm oltre l'involucro); poi il tunnel (raggio locale + `gioco`)
function tunnelNip(F) {
  const Rb = rP + SUP.gioco, Rp = Rb + SUP.pareteNip; let scavati = 0, aggiunti = 0;
  for (let q = 0; q < G.N; q++) { if (Dpin[q] > Rp || Fcl[q] >= SUP.rilievoNip) continue; const v = vicino(pin, G.voxel(q)), m = Math.max(v.d - (rLoc(v.i) + SUP.gioco + SUP.pareteNip), Fcl[q] - SUP.rilievoNip); if (m < F[q]) { if (F[q] >= 0 && m < 0) aggiunti++; F[q] = m; } }
  for (let q = 0; q < G.N; q++) { if (Dpin[q] > Rb) continue; const v = vicino(pin, G.voxel(q)), c = rLoc(v.i) + SUP.gioco - v.d; if (c > F[q]) { if (F[q] < 0 && c > 0) scavati++; F[q] = c; } }
  return { scavati, aggiunti };
}
/* ============ Tunnel del NIP ============ */
// Il NIP (decorso di nervi-gomito.mjs, tutto dentro il muscolo tra l'arcata di Frohse e il margine distale) attraversa il supinatore riempito: tunnel di raggio
// locale del nervo (profilo `rp`) + `gioco`, aperto solo dove il nervo entra ed esce.
{
  const Rb = rP + SUP.gioco, { scavati, aggiunti } = tunnelNip(F2);
  log('tunnel del NIP: voxel scavati', scavati, '; parete: voxel aggiunti', aggiunti);
  // imbocchi: il campo del muscolo si sfoca solo aggiungendo muscolo (`imbocchi.passate`) entro `imbocchi.raggio` cm dall'asse e `imbocchi.fascia` cm dall'imbocco
  // (primo e ultimo punto del NIP avvolto per intero): bordi arrotondati, niente fossette; poi il tunnel si rimette
  const T = pin.map((p, i) => nrm(sub(pin[Math.min(pin.length - 1, i + 1)], pin[Math.max(0, i - 1)])));
  const avvolto = i => { const t = T[i], u = nrm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(t, u); let n = 0;
    for (let a = 0; a < 32; a++) { const th = a / 32 * 2 * Math.PI, R = rLoc(i) + SUP.gioco + 0.04, q = add(pin[i], add(mul(u, R * Math.cos(th)), mul(v, R * Math.sin(th)))); if (campFine(F2, ...q) < 0) n++; } return n === 32; };
  const chiusi = pin.map((_, i) => avvolto(i)), iE = chiusi.indexOf(true), iX = chiusi.lastIndexOf(true);
  if (iE >= 0) {
    const { passate, raggio, fascia } = SUP.imbocchi, yE = pin[iE][1], yX = pin[iX][1], Fb = G.sfoca(Float32Array.from(F2), passate);
    log('imbocchi del NIP: y', yE.toFixed(2), 'e', yX.toFixed(2));
    for (let q = 0; q < G.N; q++) { if (Dpin[q] > raggio) continue; const y = G.voxel(q)[1], w = (1 - sstep(raggio - 0.15, raggio, Dpin[q])) * Math.max(1 - sstep(fascia * 0.6, fascia, Math.abs(y - yE)), 1 - sstep(fascia * 0.6, fascia, Math.abs(y - yX)));
      if (w > 0) F2[q] = Math.min(F2[q], F2[q] + w * (Fb[q] - F2[q])); }
    for (let q = 0; q < G.N; q++) { if (Dpin[q] > Rb) continue; const v = vicino(pin, G.voxel(q)); F2[q] = Math.max(F2[q], rLoc(v.i) + SUP.gioco - v.d); }
  }
}
// levigatura leggera di tutto il campo (`leviga` passate: niente pieghe vive dove si incontrano riempimento, letto e tunnel), poi letto, parete e tunnel si rimettono
{ const Fl = G.sfoca(Float32Array.from(F2), SUP.leviga); for (let q = 0; q < G.N; q++) F2[q] = Dpin[q] < 0.5 ? Math.min(F2[q], Fl[q]) : Fl[q]; }   // vicino al NIP la levigatura non assottiglia la parete
for (let q = 0; q < G.N; q++) F2[q] = Math.max(F2[q], rr - Dnuovo[q]);
tunnelNip(F2);
// isole e cavità (come negli altri strumenti): una sola componente, nessun vuoto chiuso
{
  const M = new Uint8Array(G.N); for (let q = 0; q < G.N; q++) M[q] = F2[q] < 0 ? 1 : 0;
  const lab = new Int32Array(G.N).fill(-1), st = new Int32Array(G.N), dim = [], { NX, NY, NZ, NXY } = G;
  const comp = valore => { lab.fill(-1); dim.length = 0;
    for (let s0 = 0; s0 < G.N; s0++) { if (M[s0] !== valore || lab[s0] >= 0) continue; let sp = 0, n = 0, tocca = false; const l = dim.length; st[sp++] = s0; lab[s0] = l;
      while (sp) { const q = st[--sp]; n++; const i = q % NX, j = ((q / NX) | 0) % NY, k = (q / NXY) | 0; if (i === 0 || j === 0 || k === 0 || i === NX - 1 || j === NY - 1 || k === NZ - 1) tocca = true;
        for (const [d, ok] of [[1, i < NX - 1], [-1, i > 0], [NX, j < NY - 1], [-NX, j > 0], [NXY, k < NZ - 1], [-NXY, k > 0]]) { if (!ok) continue; const rq = q + d; if (M[rq] === valore && lab[rq] < 0) { lab[rq] = l; st[sp++] = rq; } } }
      dim.push({ n, tocca }); } };
  comp(1); let big = 0; dim.forEach((d, i) => { if (d.n > dim[big].n) big = i; }); let isole = 0; for (let q = 0; q < G.N; q++) if (M[q] && lab[q] !== big) { F2[q] = 0.01; isole++; }
  for (let q = 0; q < G.N; q++) M[q] = F2[q] < 0 ? 1 : 0; comp(0); let cavita = 0; for (let q = 0; q < G.N; q++) if (!M[q] && !dim[lab[q]].tocca) { F2[q] = -0.01; cavita++; }
  log('pulizia: isole', isole, 'cavità', cavita);
}

/* ============ Mesh del supinatore, colore e fibre ============ */
function costruisci(Fm, m, passoMesh = PASSO_MESH) {
  const nv0 = m.pos.length / 3, cella = 0.25, hash = new Map(), ch = (x, y, z) => `${Math.floor(x / cella)},${Math.floor(y / cella)},${Math.floor(z / cella)}`;
  for (let i = 0; i < nv0; i++) { const c = ch(m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]); if (!hash.has(c)) hash.set(c, []); hash.get(c).push(i); }
  const RC = Math.ceil(3 * FIBRE.sigma / cella);
  const candidati = p => { const [cx, cy, cz] = p.map(v => Math.floor(v / cella)), Lc = [];
    for (let a = -RC; a <= RC; a++) for (let b = -RC; b <= RC; b++) for (let c = -RC; c <= RC; c++) for (const i of hash.get(`${cx + a},${cy + b},${cz + c}`) || []) Lc.push([i, (m.pos[3 * i] - p[0]) ** 2 + (m.pos[3 * i + 1] - p[1]) ** 2 + (m.pos[3 * i + 2] - p[2]) ** 2]);
    return Lc.sort((u, v) => u[1] - v[1]); };
  const f = (x, y, z) => campFine(Fm, x, y, z), e = PASSO * 0.75;
  const nc = [0, 1, 2].map(k => Math.ceil((AREA.hi[k] - AREA.lo[k]) / passoMesh));
  G.setGriglia(AREA.lo, passoMesh, nc[0], nc[1], nc[2]);
  const out = G.nets(G.valuta(p => f(p[0], p[1], p[2])), () => [0, 1, 0]);
  G.setGriglia(FINE.O, FINE.H, FINE.NX, FINE.NY, FINE.NZ);
  const n2 = out.pos.length / 3, pos = G.taubin(out.pos, out.idx, TAUBIN);
  const gradF = p => [f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]), f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]), f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e)].map(v => v / (2 * e));
  for (let i = 0; i < n2; i++) {   // Newton verso F = 0
    let p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    for (let it = 0; it < 5; it++) { const v = f(...p), g = gradF(p), g2 = dot(g, g) || 1, st = clamp(v / g2, -0.1, 0.1); p = sub(p, mul(g, st)); if (Math.abs(v) < 2e-4) break; }
    pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
  }
  const tagF = new Float32Array(n2), fd = new Float32Array(3 * n2);
  const tangente = (p, d) => { const g = gradF(p), n = nrm(g), dn = dot(d, n); return nrm(sub(d, mul(n, dn))); };
  for (let i = 0; i < n2; i++) {
    const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], Lc = candidati(p); if (!Lc.length) { fd.set([0, -1, 0], 3 * i); continue; }
    let st = 0, swt = 0, ref = null; const fs = [0, 0, 0];
    for (const [j, d2] of Lc) {
      const wt = Math.exp(-d2 / (2 * FIBRE.sigmaTag ** 2)); if (m.tag[j] < 250) { st += wt * m.tag[j]; swt += wt; }
      const w = Math.exp(-d2 / (2 * FIBRE.sigma ** 2)), v = [m.fdir[3 * j], m.fdir[3 * j + 1], m.fdir[3 * j + 2]]; if (!ref) ref = v;
      const sg = dot(v, ref) < 0 ? -1 : 1; for (let k = 0; k < 3; k++) fs[k] += sg * v[k] * w;
    }
    tagF[i] = swt > 1e-9 ? st / swt : (m.tag[Lc[0][0]] < 250 ? m.tag[Lc[0][0]] : 0);
    fd.set(tangente(p, nrm(fs)), 3 * i);
  }
  const nb = Array.from({ length: n2 }, () => new Set()); for (let t = 0; t < out.idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = out.idx[t + k], b = out.idx[t + (k + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  for (let p = 0; p < FIBRE.passate; p++) { const Nn = new Float32Array(3 * n2);
    for (let i = 0; i < n2; i++) { let x = fd[3 * i], y = fd[3 * i + 1], z = fd[3 * i + 2];
      for (const j of nb[i]) { const sg = fd[3 * i] * fd[3 * j] + fd[3 * i + 1] * fd[3 * j + 1] + fd[3 * i + 2] * fd[3 * j + 2] < 0 ? -1 : 1; x += sg * fd[3 * j]; y += sg * fd[3 * j + 1]; z += sg * fd[3 * j + 2]; }
      const l = Math.hypot(x, y, z) || 1; Nn[3 * i] = x / l; Nn[3 * i + 1] = y / l; Nn[3 * i + 2] = z / l; }
    fd.set(Nn); }
  for (let p = 0; p < 6; p++) { const T = Float32Array.from(tagF); for (let i = 0; i < n2; i++) { let s = tagF[i] * 2, c = 2; for (const j of nb[i]) { s += tagF[j]; c++; } T[i] = s / c; } tagF.set(T); }
  const tag = new Uint8Array(n2), fdir = new Int8Array(3 * n2);
  for (let i = 0; i < n2; i++) { tag[i] = Math.round(clamp(tagF[i], 0, 200)); for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(clamp(fd[3 * i + k], -1, 1) * 127); }
  return { pos, idx: out.idx, tag, fdir };
}
const round = P => P.map(p => p.map(x => Math.round(x * 1000) / 1000));
const nuovoSup = costruisci(F2, baseSup, SUP.passoMesh);
log('supinatore:', nuovoSup.pos.length / 3, 'vertici');
// rami nervosi che entrano nel supinatore (`ramiIngresso`): il muscolo ricostruito può arretrare di qualche decimo di millimetro e lasciare la punta fuori dalla superficie;
// negli ultimi `coda` cm il ramo è spinto verso l'interno (gradiente del campo, spostamento crescente verso la punta) finché la punta sta `profondita` cm sotto la superficie
for (const [id, C] of Object.entries(SUP.ramiIngresso)) {
  let P = catmull(NVP.pts[id], 0.05); const c = arco(P), L = c.at(-1), prof = p => -campFine(F2, ...p), e = PASSO * 0.75;
  for (let giro = 0; giro < 6; giro++) P = P.map((p, i) => { const w = sstep(L - C.coda, L, c[i]), need = C.profondita * w, d = prof(p); if (w <= 0 || d >= need) return p;
    const g = [campFine(F2, p[0] + e, p[1], p[2]) - campFine(F2, p[0] - e, p[1], p[2]), campFine(F2, p[0], p[1] + e, p[2]) - campFine(F2, p[0], p[1] - e, p[2]), campFine(F2, p[0], p[1], p[2] + e) - campFine(F2, p[0], p[1], p[2] - e)];
    const l = len(g) || 1; return add(p, mul(g, -(need - d) / l * 0.8)); });
  log(id + ': punta a', (prof(P.at(-1)) * 10).toFixed(2), 'mm sotto la superficie del supinatore');
  NVP.pts[id] = round(risampiona(P, 0.15));
}

/* ============ Letto nel brachioradiale: vertici spinti fuori dal tubo, spostamento levigato ============ */
// suddivisione conforme dei triangoli vicini al nervo (spigoli più lunghi di `lmax` con il punto medio entro `zona` dall'asse): 1→2, 1→3 o 1→4 triangoli, senza crepe;
// colore e fibre dei vertici nuovi sono la media dei due estremi. I triangoli originali (1,5 mm) sono più larghi del letto e lo attraverserebbero.
function rifinisci(m, zona, lmax, passate) {
  let pos = Array.from(m.pos), idx = Array.from(m.idx), tag = Array.from(m.tag), fdir = Array.from(m.fdir);
  for (let giro = 0; giro < passate; giro++) {
    const nPrima = pos.length / 3;
    const medio = new Map(), chiave = (a, b) => a < b ? a * 4e6 + b : b * 4e6 + a;
    const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    const dividi = (a, b) => { const k = chiave(a, b); if (medio.has(k)) return medio.get(k); const pa = P(a), pb = P(b);
      if (len(sub(pa, pb)) <= lmax || vicino(nuovo, mul(add(pa, pb), 0.5)).d > zona) { medio.set(k, -1); return -1; }
      const n = pos.length / 3, mp = mul(add(pa, pb), 0.5); pos.push(...mp); tag.push(Math.round((tag[a] + tag[b]) / 2));
      const fa = [fdir[3 * a], fdir[3 * a + 1], fdir[3 * a + 2]], fb = [fdir[3 * b], fdir[3 * b + 1], fdir[3 * b + 2]], sg = dot(fa, fb) < 0 ? -1 : 1, fm = nrm(add(fa, mul(fb, sg)));
      fdir.push(...fm.map(x => Math.round(x * 127))); medio.set(k, n); return n; };
    const nuoviIdx = [], nt = idx.length / 3;
    for (let t = 0; t < nt; t++) {
      const v = [idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]], mm = [dividi(v[0], v[1]), dividi(v[1], v[2]), dividi(v[2], v[0])], f = mm.map(x => x >= 0), nf = f.filter(Boolean).length;
      if (nf === 0) { nuoviIdx.push(...v); continue; }
      if (nf === 3) { nuoviIdx.push(v[0], mm[0], mm[2], mm[0], v[1], mm[1], mm[2], mm[1], v[2], mm[0], mm[1], mm[2]); continue; }
      if (nf === 1) { const e = f.indexOf(true), a = v[e], b = v[(e + 1) % 3], c = v[(e + 2) % 3], mid = mm[e]; nuoviIdx.push(a, mid, c, mid, b, c); continue; }
      // due spigoli: il vertice condiviso è v1 dopo la rotazione
      const e = f.indexOf(false), s = (e + 2) % 3;   // spigolo non diviso e; il vertice condiviso dai due divisi è v[(e+2)%3]
      const w = [v[(s + 2) % 3], v[s], v[(s + 1) % 3]], m0 = mm[(s + 2) % 3], m1 = mm[s];
      nuoviIdx.push(m0, w[1], m1, w[0], m0, m1, w[0], m1, w[2]);
    }
    idx = nuoviIdx;
    if (pos.length / 3 === nPrima) break;   // nessuno spigolo da dividere
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: Uint8Array.from(tag), fdir: Int8Array.from(fdir) };
}
// normali dei vertici (media pesata dall'area), orientate verso l'esterno con il segno del volume della mesh
function normaliVertici(pos, idx) {
  const nv = pos.length / 3, N = new Float64Array(3 * nv); let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const A = [0, 1, 2].map(k => [pos[3 * idx[t + k]], pos[3 * idx[t + k] + 1], pos[3 * idx[t + k] + 2]]), c = [A[1][1] - A[0][1], 0, 0];
    const e1 = sub(A[1], A[0]), e2 = sub(A[2], A[0]), n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    vol += dot(A[0], [A[1][1] * A[2][2] - A[1][2] * A[2][1], A[1][2] * A[2][0] - A[1][0] * A[2][2], A[1][0] * A[2][1] - A[1][1] * A[2][0]]) / 6;
    for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) N[3 * idx[t + k] + j] += n[j];
  }
  const s = vol < 0 ? -1 : 1; for (let i = 0; i < nv; i++) { const l = Math.hypot(N[3 * i], N[3 * i + 1], N[3 * i + 2]) || 1; for (let j = 0; j < 3; j++) N[3 * i + j] *= s / l; }
  return N;
}
// letto: i vertici entro il tubo (r + gioco) vanno sulla semicirconferenza rivolta verso l'interno del muscolo (stessa posizione laterale e assiale, profondità dal cerchio):
// la superficie si incava intorno al nervo invece di aprirsi. La mappa stira i triangoli: suddivisione e nuova mappa si alternano per `cicli` volte.
function lettoMuscolo(id) {
  const Rb = r + SUP.gioco + SUP.bed.margine; let m = { pos: Float32Array.from(baseLetto[id].pos), idx: baseLetto[id].idx, tag: baseLetto[id].tag, fdir: baseLetto[id].fdir }, mosse = 0;
  for (let ciclo = 0; ciclo < SUP.bed.cicli; ciclo++) {
    m = rifinisci(m, Rb + 0.35, SUP.bed.lato, SUP.bed.suddividi); const pos = Float32Array.from(m.pos), nv = pos.length / 3, N = normaliVertici(m.pos, m.idx);
    for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; if (p[1] > nuovo[0][1] + 0.5 || p[1] < nuovo.at(-1)[1] - 0.5) continue;
      const v = vicino(nuovo, p); if (v.d >= Rb) continue;
      const T = nrm(sub(nuovo[Math.min(nuovo.length - 1, v.i + 1)], nuovo[v.i])); let u = [-N[3 * i], -N[3 * i + 1], -N[3 * i + 2]]; u = sub(u, mul(T, dot(u, T))); if (len(u) < 0.2) continue; u = nrm(u);
      const q = sub(p, v.p), ax = mul(T, dot(q, T)), l = sub(sub(q, ax), mul(u, dot(q, u))), ll = len(l), h = Math.sqrt(Math.max(0, Rb * Rb - ll * ll)), np = add(add(v.p, add(ax, l)), mul(u, h));
      pos[3 * i] = np[0]; pos[3 * i + 1] = np[1]; pos[3 * i + 2] = np[2]; mosse++; }
    m = { pos, idx: m.idx, tag: m.tag, fdir: m.fdir };
  }
  log(id + ': vertici', m.pos.length / 3, '(da ' + baseLetto[id].pos.length / 3 + '), spostamenti', mosse);
  return m;
}
const meshLetto = Object.fromEntries(SUP.letto.map(id => [id, lettoMuscolo(id)]));

/* ============ Stato finale, verifica e scrittura ============ */
const ver = verificaStato('nuovo stato', nuovo, nuovoSup, meshLetto);
console.log(ver);
// i vertici di ecrb, ecrl, pt, anc e radio vengono letti dal file, che non cambia
setMesh('sup', nuovoSup); G.man.meshes = G.man.meshes.filter(m => m.n !== 'sup_prof');   // la divisione in due capi (versione precedente) non c'è più
for (const id of SUP.letto) setMesh(id, meshLetto[id]);
NVP.pts[SUP.nervo] = round(risampiona(nuovo, 0.15));
G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
G.saveFile(G.repack());
