/* Fascio vascolo-nervoso ascellare e gran dorsale (modelli/spalla-3d.html): il fascio esce dal muscolo invece di attraversarlo.

   Problema. Dopo `radiale-spalla.mjs` arteria e vena ascellari, mediano, ulnare, radiale e muscolocutaneo affondano nel gran dorsale (`lat`) di
   2–5 mm lungo il tendine. Il muscolo non si può scavare: la sua mesh vicino al tendine è frammentata (17–27 anelli di taglio) e il canale di
   `nervi-muscoli-spalla.mjs` non si cuce. Si sposta il fascio (fino a ~1,5 cm), poi `nervi-muscoli-spalla.mjs` scava gli altri muscoli attorno alla
   posizione nuova.

   Uso (dalla cartella del progetto):
     node strumenti/fascio-dorsale-spalla.mjs              → sposta i tubi nel file del modello
     PROVA=1 node strumenti/fascio-dorsale-spalla.mjs      → stampa spostamenti e controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/fascio-dorsale-spalla.mjs   → lavora su una copia
   Va lanciato dopo `radiale-spalla.mjs` e PRIMA di `nervi-muscoli-spalla.mjs`, sui muscoli ancora senza canali (revisione git 554a2f5^ del modello
   per i muscoli e i corpi; poi radiale → questo → nervi-muscoli). Sul proprio risultato non cambia niente (compenetrazioni già a zero).

   Metodo. Il fascio si sposta nel piano x–z, per fette di 0,25 cm in y tra `Y_ALTO` e il taglio, con la stessa traslazione per tutti i vertici della
   fetta (calibro e piano di taglio y = −14 restano). Spostamento per fetta su una griglia di candidati (passo `PASSO`) scelto con programmazione
   dinamica: costo = Σ (GIOCO − distanza)² dei vertici entro il gioco da gran dorsale (peso `PESO_LAT`), ossa, cartilagini, capsula e muscoli in
   `DURI_MUSC` (tricipite laterale, il cui canale non si cuce; peso `PESO_OSSO`), altri tubi del fascio (peso 1) e altri muscoli (`PESO_MUSC`, saranno
   scavati da `nervi-muscoli-spalla.mjs`), più `PESO_ORIGINE` × spostamento² e `PESO_LISCIO` × variazione² tra fette vicine. Prima due blocchi rigidi
   (arteria, vena, mediano, ulnare entro ±`RAGGIO_MAX`; radiale e muscolocutaneo), poi tubo per tubo entro ±`RAGGIO2`. Gli spostamenti per fetta si levigano con `LISCIA` passate [1 2 1] (toglie la gradinatura da 0,5 mm del passo). Sopra `Y_ALTO` lo spostamento è 0.
   Distanze: campi esatti su griglia di 0,3 mm. Poi rifinitura del solo gran dorsale: triangoli raffinati vicino ai tubi (lato `LATO`), vertici spinti
   lungo il gradiente della distanza dai tubi fino a GIOCO + 0,2 mm con spostamento levigato sui vicini, via i triangoli che coprono un tubo (lamina
   sottile attraversata dal nervo: finestra); normali del file. Stampa spostamenti, distanze minime e, per ogni tubo, volume comune con gran dorsale,
   ossa, altri tubi e muscoli (griglia 0,2 mm; i volumi con plesso, succlavia e giunzioni sono le parti condivise delle mesh, non compenetrazioni). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setPos, repack, saveFile, log, sstep, setGriglia, griglia, campo, solid, edt, sample } = G;

const PROVA = !!process.env.PROVA;
const CORPI = ['a_asc', 'v_asc', 'n_mediano', 'n_ulnare', 'n_radiale', 'n_muscolocutaneo'];
const ALTRI_TUBI = ['plesso', 'n_ascellare', 'n_soprascapolare', 'a_succ', 'v_succ'];
const DURI = ['scapola', 'clavicola', 'omero', 'costa1', 'costa2', 'costa3', 'costa4', 'costa5', 'manubrio', 'corpo_sterno', 'cc1', 'cc2', 'cc3', 'cc4', 'cc5', 'cart_omero', 'cart_glen', 'labbro', 'caps'];
const DURI_MUSC = (process.env.DURI_MUSC ?? 'tri_lat').split(',').filter(Boolean);   // muscoli che il fascio non deve toccare (il loro canale non si cuce: tri_lat)
const MUSCOLI = ['supra', 'infra', 'tmin', 'subs', 'delt_cl', 'delt_ac', 'delt_sp', 'tmaj', 'pec_cl', 'pec_st', 'pec_ab', 'pmin', 'succl', 'trap_d', 'trap_t', 'trap_a', 'romb_mag', 'romb_min', 'elev', 'dent', 'omoi', 'bic_lungo', 'bic_breve', 'coracobr', 'tri_lungo', 'tri_lat', 'tri_med'];
const SIG_FIN = +(process.env.SIG_FIN ?? 3), LISCIA = +(process.env.LISCIA ?? 30), GIOCO = 0.03, FETTA = 0.25, Y_ALTO = +(process.env.Y_ALTO ?? -6.0), RAMPA = 0.75, PASSO = 0.05, RAGGIO_MAX = +(process.env.RAGGIO_MAX ?? 2.4);
const PESO_OSSO = +(process.env.PESO_OSSO ?? 5), PESO_LAT = +(process.env.PESO_LAT ?? 30), PESO_MUSC = +(process.env.PESO_MUSC ?? 0.02), PESO_ORIGINE = +(process.env.PESO_ORIGINE ?? 0.05), PESO_LISCIO = +(process.env.PESO_LISCIO ?? 40);

griglia([-4.2, -14.3, -2.6], [3.4, -5.4, 2.0], 0.03, 0);
const g = { O: G.O.slice(), NX: G.NX, NY: G.NY, NZ: G.NZ };
log('griglia', g.NX, g.NY, g.NZ);
const FL = campo(['lat']).F, FD = campo(DURI.concat(DURI_MUSC)).F, FM = campo(MUSCOLI).F;
const FT = Object.fromEntries([...CORPI, ...ALTRI_TUBI].map(n => [n, campo([n]).F])); log('campi pronti');
const f = (F, p) => sample(F, p[0], p[1], p[2]);
const pen = d => d < GIOCO ? (GIOCO - d) ** 2 : 0;

const P0 = {}; for (const n of CORPI) P0[n] = Float32Array.from(REAL(n).pos.subarray(0, REAL(n).nv * 3));
const PORIG = Object.fromEntries(CORPI.map(n => [n, Float32Array.from(P0[n])]));
const cand = []; for (let i = -RAGGIO_MAX; i <= RAGGIO_MAX + 1e-9; i += PASSO) for (let k = -RAGGIO_MAX; k <= RAGGIO_MAX + 1e-9; k += PASSO) if (Math.hypot(i, k) <= RAGGIO_MAX) cand.push([i, k]);
const NSL = Math.round((Y_ALTO - -14.0) / FETTA) + 1, ys = Array.from({ length: NSL }, (_, s) => Y_ALTO - s * FETTA);
const GRUPPI = [['a_asc', 'v_asc', 'n_mediano', 'n_ulnare'], ['n_radiale', 'n_muscolocutaneo']];   // ogni gruppo trasla in blocco (distanze reciproche conservate)
const profilo = n => {   // fette: vertici con |y − y_s| < FETTA/2
  const P = P0[n], nv = P.length / 3, V = ys.map(() => []);
  for (let i = 0; i < nv; i++) { const s = Math.round((Y_ALTO - P[3 * i + 1]) / FETTA); if (s >= 0 && s < NSL) V[s].push(i); } return V; };

// secondo giro: ogni tubo da solo, attorno alla posizione trovata dal gruppo (± `RAGGIO2`), con gli altri tubi nelle posizioni correnti
const FASI = [...GRUPPI.map(g => ({ grp: g, R: RAGGIO_MAX })), ...(process.env.RAFFINA === '0' ? [] : CORPI.map(n => ({ grp: [n], R: +(process.env.RAGGIO2 ?? 1.2) })))];
for (const { grp, R } of FASI) {
  const cand = []; for (let i = -R; i <= R + 1e-9; i += PASSO) for (let k = -R; k <= R + 1e-9; k += PASSO) if (Math.hypot(i, k) <= R) cand.push([i, k]);
  const VV = Object.fromEntries(grp.map(n => [n, profilo(n)])), altri = [...ALTRI_TUBI, ...CORPI.filter(x => !grp.includes(x))];
  const costi = ys.map((_, s) => grp.some(n => VV[n][s].length) ? cand.map(o => { let c = PESO_ORIGINE * (o[0] ** 2 + o[1] ** 2);
    for (const n of grp) for (const i of VV[n][s]) { const p = [P0[n][3 * i] + o[0], P0[n][3 * i + 1], P0[n][3 * i + 2] + o[1]];
      c += PESO_LAT * pen(f(FL, p)) + PESO_OSSO * pen(f(FD, p)) + PESO_MUSC * pen(f(FM, p)); for (const t of altri) c += pen(f(FT[t], p)); } return c; }) : null);
  // programmazione dinamica: transizione = PESO_LISCIO × |Δo|²; la prima fetta è vincolata a spostamento ~0 (raccordo con la parte alta)
  const nc = cand.length, J = ys.map(() => new Int32Array(nc)), D = []; let prev = null;
  for (let s = 0; s < NSL; s++) { if (!costi[s]) { D.push(null); continue; }
    const cur = new Float64Array(nc);
    for (let a = 0; a < nc; a++) { if (!prev) { cur[a] = costi[s][a] + PESO_LISCIO * 4 * (cand[a][0] ** 2 + cand[a][1] ** 2); continue; }
      let best = 1e18, bj = 0; for (let b = 0; b < nc; b++) { const d = PESO_LISCIO * ((cand[a][0] - cand[b][0]) ** 2 + (cand[a][1] - cand[b][1]) ** 2) + prev[b]; if (d < best) { best = d; bj = b; } }
      cur[a] = best + costi[s][a]; J[s][a] = bj; }
    D.push(cur); prev = cur; }
  let s1 = NSL - 1; while (!D[s1]) s1--; let a = 0; for (let b = 1; b < nc; b++) if (D[s1][b] < D[s1][a]) a = b;
  const off = ys.map(() => [0, 0]); for (let s = s1; s >= 0; s--) { if (!D[s]) continue; off[s] = cand[a]; a = J[s][a]; }
  for (let g = 0; g < LISCIA; g++) { const q = off.map(o => o.slice()); for (let k = 1; k < NSL - 1; k++) for (let c = 0; c < 2; c++) q[k][c] = (off[k - 1][c] + 2 * off[k][c] + off[k + 1][c]) / 4; off.forEach((o, k) => { o[0] = q[k][0]; o[1] = q[k][1]; }); }   // levigatura [1 2 1]: toglie la gradinatura del passo
  const delta = y => { if (y >= Y_ALTO) return [0, 0];
    const u = Math.max(0, Math.min(NSL - 1.001, (Y_ALTO - y) / FETTA)), s = Math.floor(u), t = u - s; return [0, 1].map(k => off[s][k] * (1 - t) + off[s + 1][k] * t); };
  for (const n of grp) {
    const Q = Float32Array.from(P0[n]); for (let i = 0; i < Q.length / 3; i++) { const d = delta(Q[3 * i + 1]); Q[3 * i] += d[0]; Q[3 * i + 2] += d[1]; }
    setPos(n, Q); P0[n] = Q; FT[n] = campo([n]).F;
    let minL = 1e9, minD = 1e9, minM = 1e9; for (let i = 0; i < Q.length / 3; i++) { const p = [Q[3 * i], Q[3 * i + 1], Q[3 * i + 2]]; if (p[1] > Y_ALTO) continue; minL = Math.min(minL, f(FL, p)); minD = Math.min(minD, f(FD, p)); minM = Math.min(minM, f(FM, p)); }
    log(n, 'distanza minima dei vertici da lat', (minL * 10).toFixed(2), 'ossa', (minD * 10).toFixed(2), 'altri muscoli', (minM * 10).toFixed(2), 'mm'); }
  { let d2 = 0; for (let k = 1; k < NSL - 1; k++) d2 = Math.max(d2, Math.hypot(off[k - 1][0] - 2 * off[k][0] + off[k + 1][0], off[k - 1][1] - 2 * off[k][1] + off[k + 1][1])); log('  curvatura massima dello spostamento (Δ² per fetta)', (d2 * 10).toFixed(2), 'mm'); }
  log('gruppo', grp.join(','), 'spostamento massimo', (Math.max(...off.map(o => Math.hypot(...o))) * 10).toFixed(1), 'mm');
  if (process.env.DEBUG) off.forEach((o, s) => grp.some(n => VV[n][s].length) && log('  y', ys[s].toFixed(2), 'o', (o[0] * 10).toFixed(1), (o[1] * 10).toFixed(1)));
}

const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], len = a => Math.hypot(a[0], a[1], a[2]);
const pt = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]], LATO = 0.06;
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

/* ---- levigatura finale del decorso: per ogni tubo lo spostamento totale per fetta (rispetto alla posizione di partenza) si leviga con un gaussiano di
   `SIG_FIN` fette (σ ≈ 0,25 cm × SIG_FIN), cioè niente ginocchi; sopra `Y_ALTO` resta 0, sotto il taglio uguale all'ultima fetta ---- */
if (SIG_FIN > 0) for (const n of CORPI) { const Q0 = PORIG[n], Q1 = P0[n], nv = Q0.length / 3, SUM = ys.map(() => [0, 0, 0]);
  for (let i = 0; i < nv; i++) { const k = Math.round((Y_ALTO - Q0[3 * i + 1]) / FETTA); if (k < 0 || k >= NSL) continue; SUM[k][0] += Q1[3 * i] - Q0[3 * i]; SUM[k][1] += Q1[3 * i + 2] - Q0[3 * i + 2]; SUM[k][2]++; }
  const D = SUM.map(a => a[2] ? [a[0] / a[2], a[1] / a[2]] : null); for (let k = 0; k < NSL; k++) if (!D[k]) D[k] = k ? D[k - 1] : [0, 0];
  const at = k => k < 0 ? [0, 0] : D[Math.min(k, NSL - 1)], G2 = D.map((_, k) => { let W = 0, v = [0, 0]; for (let t = -Math.ceil(3 * SIG_FIN); t <= Math.ceil(3 * SIG_FIN); t++) { const w = Math.exp(-t * t / (2 * SIG_FIN * SIG_FIN)), d = at(k + t); W += w; v[0] += w * d[0]; v[1] += w * d[1]; } const r = sstep(0, 2 * SIG_FIN, k); return [r * v[0] / W, r * v[1] / W]; });   // raccordo a zero in cima (niente gradino a Y_ALTO)
  const delta = y => { if (y >= Y_ALTO) return [0, 0]; const u = Math.max(0, Math.min(NSL - 1.001, (Y_ALTO - y) / FETTA)), k = Math.floor(u), t = u - k; return [0, 1].map(c => G2[k][c] * (1 - t) + G2[k + 1][c] * t); };
  const Q = Float32Array.from(Q0); for (let i = 0; i < nv; i++) { const d = delta(Q[3 * i + 1]); Q[3 * i] += d[0]; Q[3 * i + 2] += d[1]; }
  setPos(n, Q); P0[n] = Q; FT[n] = campo([n]).F; }
/* ---- rifinitura del gran dorsale: i pochi decimi di mm rimasti (tubo che sfiora la superficie) si tolgono spostando i vertici di `lat` vicini ai tubi
   lungo il gradiente della distanza dai tubi, fino a GIOCO + 0,02 cm, con spostamento levigato sui vicini (30 giri); stessa mesh, normali del file ---- */
{ const L0 = REAL('lat'), m0 = G.man.meshes.findLast(x => x.n === 'lat'), at0 = G.attrs('lat'), nm0 = m0.nm !== undefined ? new Int8Array(G.buf0.buffer, G.buf0.byteOffset + m0.nm, L0.nv * 3).slice() : null;
  const fmin = p => Math.min(...CORPI.map(n => f(FT[n], p)));
  const ex = []; if (at0.tag) ex.push({ a: at0.tag, mid: MID_TAG }); if (at0.fdir) ex.push({ a: at0.fdir, mid: MID_DIR }); if (nm0) ex.push({ a: nm0, mid: MID_DIR });
  const Rf = raffina(L0.pos.subarray(0, L0.nv * 3), L0.idx, ex, p => p[1] < -5.4 && p[1] > -14.3 && p[0] > -4.2 && p[0] < 3.4 && p[2] > -2.6 && p[2] < 2.0 && fmin(p) < +(process.env.ZONA_RAFF ?? 0.15));
  const L = { idx: Rf.idx, nv: Rf.pos.length / 3 }, nv = L.nv, P = Float32Array.from(Rf.pos), Pa = Float32Array.from(P), nb = Array.from({ length: nv }, () => new Set());
  let ei = 0; const tagN = at0.tag ? Uint8Array.from(Rf.extra[ei++]) : null, fdirN = at0.fdir ? Int8Array.from(Rf.extra[ei++]) : null, nmN = nm0 ? Int8Array.from(Rf.extra[ei++]) : null;
  for (let t = 0; t < L.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = L.idx[t + e], b = L.idx[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  const NB = nb.map(x => [...x]), vic = new Uint8Array(nv); let nvic = 0;
  for (let i = 0; i < nv; i++) { const p = [P[3 * i], P[3 * i + 1], P[3 * i + 2]]; if (p[1] > -5.4 || p[1] < -14.3 || p[0] < -4.2 || p[0] > 3.4 || p[2] < -2.6 || p[2] > 2.0) continue; if (fmin(p) < 0.25) { vic[i] = 1; nvic++; } }
  const D = new Float32Array(nv * 3); let mx = 0;
  for (let giro = 0; giro < 30; giro++) { const need = new Float32Array(nv * 3), ND = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { if (!vic[i]) continue; const p = [Pa[3 * i] + D[3 * i], Pa[3 * i + 1] + D[3 * i + 1], Pa[3 * i + 2] + D[3 * i + 2]], d = fmin(p);
      if (d >= GIOCO + 0.02) continue; const e = 0.03, gr = [0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += e; b[k] -= e; return fmin(a) - fmin(b); }), l = Math.hypot(...gr) || 1;
      for (let k = 0; k < 3; k++) need[3 * i + k] = gr[k] / l * (GIOCO + 0.02 - d) * 1.1; }
    for (let i = 0; i < nv; i++) { for (let k = 0; k < 3; k++) { let m = D[3 * i + k]; if (vic[i] && NB[i].length) { m = 0; for (const j of NB[i]) m += D[3 * j + k]; m = 0.4 * D[3 * i + k] + 0.6 * m / NB[i].length; }
        ND[3 * i + k] = m + need[3 * i + k]; } }
    D.set(ND); }
  for (let i = 0; i < nv; i++) { for (let k = 0; k < 3; k++) P[3 * i + k] += D[3 * i + k]; mx = Math.max(mx, Math.hypot(D[3 * i], D[3 * i + 1], D[3 * i + 2])); }
  log('lat: vertici vicini ai tubi', nvic, '| spostamento massimo', (mx * 10).toFixed(2), 'mm');
  { let r = 0, dm = 1; for (let i = 0; i < nv; i++) if (vic[i]) { const d = fmin(pt(P, i)); if (d < GIOCO - 1e-3) r++; dm = Math.min(dm, d); } log('lat: vertici ancora entro il gioco', r, 'distanza minima', (dm * 10).toFixed(2), 'mm'); }
  // lamine sottili che il tubo attraversa (il vertice è fuori, ma il triangolo copre il tubo): via i triangoli con baricentro o punto medio di un lato entro il gioco
  // (il nervo passa in una finestra della lamina, come attraverso una fascia)
  const I2 = []; let tolti = 0; for (let t = 0; t < L.idx.length; t += 3) { const v = [L.idx[t], L.idx[t + 1], L.idx[t + 2]].map(i => pt(P, i)), c = mul(add(add(v[0], v[1]), v[2]), 1 / 3);
    const dentro = [c, mul(add(v[0], v[1]), 0.5), mul(add(v[1], v[2]), 0.5), mul(add(v[2], v[0]), 0.5)].some(q => fmin(q) < GIOCO - 0.005);
    if (dentro) tolti++; else I2.push(L.idx[t], L.idx[t + 1], L.idx[t + 2]); }
  log('lat: triangoli', L0.idx.length / 3, '→', L.idx.length / 3, '| tolti perché coprono un tubo', tolti);
  G.setMesh('lat', { pos: P, idx: Uint32Array.from(I2), tag: tagN, fdir: fdirN, nrm: nmN }); }
if (process.env.DEBUG) for (const n of CORPI) { const Q = P0[n], r = {}; for (let i = 0; i < Q.length / 3; i++) { const p = [Q[3 * i], Q[3 * i + 1], Q[3 * i + 2]], d = f(FL, p); if (d < 0) { const k = Math.round(p[1] * 4) / 4; r[k] = Math.min(r[k] ?? 1, d); } }
  log('DEBUG lat<0', n, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +(v * 10).toFixed(2)])))); }
/* ---- controllo: volume comune tubo–struttura (griglia 0,2 mm) ---- */
function comune(a, nomi) { const out = {};
  for (const b of nomi) { const A = REAL(a), B = REAL(b), bb = P => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); } return { lo, hi }; }, qa = bb(A.pos.subarray(0, A.nv * 3)), qb = bb(B.pos.subarray(0, B.nv * 3));
    if (![0, 1, 2].every(k => qa.lo[k] <= qb.hi[k] && qb.lo[k] <= qa.hi[k])) continue;
    const lo = [0, 1, 2].map(k => Math.max(qa.lo[k], qb.lo[k]) - 0.05), hi = [0, 1, 2].map(k => Math.min(qa.hi[k], qb.hi[k]) + 0.05);
    setGriglia(lo, 0.02, ...[0, 1, 2].map(k => Math.ceil((hi[k] - lo[k]) / 0.02)));
    const Ma = solid(a), Mb = solid(b); let n = 0; for (let i = 0; i < G.N; i++) if (Ma[i] && Mb[i]) n++; const v = n * 0.02 ** 3 * 1000; if (v >= 0.05) out[b] = +v.toFixed(1);
    if (process.env.DEBUG && n && b === 'lat') { let c = [0, 0, 0], lo2 = [1e9, 1e9, 1e9], hi2 = [-1e9, -1e9, -1e9]; for (let i = 0; i < G.N; i++) if (Ma[i] && Mb[i]) { const p = G.voxel(i); for (let k = 0; k < 3; k++) { c[k] += p[k] / n; lo2[k] = Math.min(lo2[k], p[k]); hi2[k] = Math.max(hi2[k], p[k]); } } log('  DEBUG sovrapposizione', a, b, 'centro', c.map(x => x.toFixed(2)), 'da', lo2.map(x => x.toFixed(2)), 'a', hi2.map(x => x.toFixed(2))); } }
  return out; }
for (const n of CORPI) log('controllo', n, 'lat', JSON.stringify(comune(n, ['lat'])), '| ossa', JSON.stringify(comune(n, DURI)), '| altri tubi', JSON.stringify(comune(n, [...ALTRI_TUBI, ...CORPI.filter(x => x !== n)])), '| altri muscoli', JSON.stringify(comune(n, MUSCOLI)));
if (!PROVA) saveFile(repack());
