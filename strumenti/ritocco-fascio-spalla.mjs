/* Ritocco del fascio vascolo-nervoso sotto la clavicola (modelli/spalla-3d.html): punte del dentato anteriore accorciate e vena liscia sulla prima costa.

   Problema (segnalato il 2026-10-30, dopo `fascio-clavicolare-spalla.mjs` e `nervi-muscoli-spalla.mjs`):
     a. Due digitazioni del dentato anteriore finiscono tra i fasci del plesso con una punta sottile e sfrangiata (lamine di 0,5–1 mm con fori,
        residuo dei canali): la digitazione alta (biancastra, tendinea) e quella sotto (rossa) avvolgono un fascio come un uncino.
     b. Vena ascellare/succlavia sul margine laterale della prima costa: l'appiattimento contro l'osso di `fascio-clavicolare-spalla.mjs` vi ha lasciato
        pieghe (triangoli ribaltati) che sporgono come una corona frastagliata e sembrano entrare nella costa.

   Uso (dalla cartella del progetto):
     node strumenti/ritocco-fascio-spalla.mjs              → scrive nel file del modello
     PROVA=1 node strumenti/ritocco-fascio-spalla.mjs      → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/ritocco-fascio-spalla.mjs   → lavora su una copia
   Ultimo della catena della spalla (dopo il secondo `trapezio-acromion-spalla.mjs`; nessuno script successivo tocca dentato e vene). Riparte sempre
   dalle mesh della revisione `PARTENZA` (dentato, vene), quindi si può rilanciare con lo stesso risultato; se si rilancia uno script precedente che
   cambia dentato, tubi o ossa, `PARTENZA` va aggiornata al commit del suo risultato e le `PUNTE` ricontrollate.

   Metodo:
     a. Punte del dentato. Per ogni zona di `PUNTE` (centro, raggio): vertici «sottili e vicini», cioè entro `VICINO` dai tubi e con semispessore
        (massimo della profondità nel muscolo lungo la normale interna) sotto `SOTTILE`. Il piano di taglio è perpendicolare alla direzione dal corpo
        della digitazione (vertici della zona non sottili) alla punta (vertici sottili e vicini), tenuta nel piano della lamina (tolta la componente
        lungo la sua normale, terzo asse principale); passa `MARGINE_T` prima del vertice sottile più arretrato. Si tolgono solo le parti oltre il
        piano interamente dentro la sfera della zona (il resto del muscolo non cambia); i triangoli attraversati sono divisi sul piano e il
        contorno è chiuso con una faccia piana (taglio delle orecchie nel piano), con normale lungo il piano: un'estremità netta, non una lamina.
     b. Vena. Vertici di `VENE` entro `ZONA_V` dalle ossa (clavicola, prima costa, cartilagine): `PASSATE_V` passate di Taubin pesate (peso 1 fino a
        `ZONA_V`[0] dall'osso, raccordo fino a `ZONA_V`[1]), ognuna seguita da una spinta fuori dall'osso fino a `GIOCO_V` lungo la normale
        dell'osso. Le pieghe si distendono, la vena resta appoggiata alla costa senza entrarvi. Normali ricalcolate dove il vertice si è mosso.
   Controlli stampati: vertici e triangoli tolti per punta, contorni chiusi, distanza minima dentato–tubi nella zona prima/dopo, lati con diedro > 90°
   delle vene prima/dopo, distanza minima vene–ossa prima/dopo, spostamento massimo delle vene. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, repack, saveFile, log, sstep, griglia, campo, sample, grad, realDaRevisione, nrmDaRevisione } = G;

const PROVA = !!process.env.PROVA, FILE_REPO = 'modelli/spalla-3d.html', PARTENZA = 'b24e611';
const TUBI = ['plesso', 'n_soprascapolare', 'n_ascellare', 'n_muscolocutaneo', 'n_radiale', 'n_mediano', 'n_ulnare', 'a_succ', 'v_succ', 'a_asc', 'v_asc'];
const PUNTE = [{ nome: 'digitazione alta', c: [9.3, 3.3, 2.3], r: 1.6 }, { nome: 'digitazione sotto', c: [6.6, 0.6, 2.3], r: 1.4 }];   // cm
const VICINO = 0.3, SOTTILE = 0.06, MARGINE_T = 0.1;                                          // cm
const VENE = ['v_asc', 'v_succ'], OSSA_V = ['clavicola', 'costa1', 'cc1', 'manubrio'], ZONA_V = [0.15, 0.35], PASSATE_V = 30, GIOCO_V = 0.03;
// tappi alla giunzione (x in cm, verso mediale): l'ascellare termina dentro la succlavia, la succlavia dentro l'ascellare
// giunzione: tappo della succlavia ristretto verso l'asse (fattore RESTRINGI_G[0] all'estremità, 1 da X_G[1]) e portato dentro l'ascellare fino a
// X_G[0]; l'ascellare dentro la succlavia da X_G[2] (x in cm, verso mediale)
const X_G = [9.45, 9.6, 9.6], RESTRINGI_G = [0.6, 9.2], PASSATE_G = 10, GIOCO_G = 0.03;
const GIUNZIONE = [['v_succ', 'v_asc', x => 1 - sstep(X_G[0] - 0.15, X_G[0], x)], ['v_asc', 'v_succ', x => sstep(X_G[2] - 0.05, X_G[2] + 0.05, x)]];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nz = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const pt = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
const chiave = (P, i) => Math.round(P[3 * i] * 2e4) + ',' + Math.round(P[3 * i + 1] * 2e4) + ',' + Math.round(P[3 * i + 2] * 2e4);
const salda = P => { const K = new Map(), u = new Int32Array(P.length / 3); for (let i = 0; i < u.length; i++) { const k = chiave(P, i); if (!K.has(k)) K.set(k, K.size); u[i] = K.get(k); } return { u, n: K.size }; };
const dentroG = p => [0, 1, 2].every(k => p[k] > G.O[k] + 0.02 && p[k] < G.O[k] + [G.NX, G.NY, G.NZ][k] * G.H - 0.02);
// asse principale minore (normale di una lamina) di un insieme di punti
function normaleLamina(Q) {
  const m = [0, 1, 2].map(k => Q.reduce((s, p) => s + p[k], 0) / Q.length), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of Q) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += (p[a] - m[a]) * (p[b] - m[b]);
  const tr = C[0][0] + C[1][1] + C[2][2], M = C.map((r, i) => r.map((v, j) => (i === j ? tr : 0) - v));   // autovettore minore di C = maggiore di tr·I − C
  let v = [0.3, 0.5, 0.8]; for (let it = 0; it < 300; it++) v = nz([0, 1, 2].map(i => dot(M[i], v))); return v;
}
// lati con diedro > 90° (pieghe) di una mesh
function pieghe(P, I) {
  const { u } = salda(P), E = new Map(), FN = [];
  for (let t = 0; t < I.length; t += 3) { FN.push(nz(cross(sub(pt(P, I[t + 1]), pt(P, I[t])), sub(pt(P, I[t + 2]), pt(P, I[t])))));
    for (let e = 0; e < 3; e++) { const a = u[I[t + e]], b = u[I[t + (e + 1) % 3]], k = a < b ? a + '|' + b : b + '|' + a; (E.get(k) || E.set(k, []).get(k)).push(t / 3); } }
  let n = 0; for (const f of E.values()) if (f.length === 2 && dot(FN[f[0]], FN[f[1]]) < 0) n++; return n;
}
// normali di vertice (int8 × 127), mediate sui vertici coincidenti
function normali(P, I) {
  const { u, n } = salda(P), A = new Float64Array(n * 3);
  for (let t = 0; t < I.length; t += 3) { const f = cross(sub(pt(P, I[t + 1]), pt(P, I[t])), sub(pt(P, I[t + 2]), pt(P, I[t]))); for (let e = 0; e < 3; e++) for (let k = 0; k < 3; k++) A[3 * u[I[t + e]] + k] += f[k]; }
  const N = new Int8Array(P.length); for (let i = 0; i < u.length; i++) { const v = nz([A[3 * u[i]], A[3 * u[i] + 1], A[3 * u[i] + 2]]); for (let k = 0; k < 3; k++) N[3 * i + k] = Math.round(v[k] * 127); }
  return N;
}
const FINE = {};

/* ---- a. punte del dentato ---- */
{
  const B = realDaRevisione(PARTENZA, 'dent', FILE_REPO), N0 = nrmDaRevisione(PARTENZA, 'dent', FILE_REPO);
  let P = Array.from(B.pos), I = Array.from(B.idx), T = Array.from(B.tag || []), D = Array.from(B.fdir || []), NR = N0 ? Array.from(N0) : null;
  griglia([4, -2, -2], [12, 6, 5], 0.025, 0.3); const FT = campo(TUBI).F, FM = campo(['dent']).F;
  const semispessore = p => { const g = nz(grad(FM, p)); let h = 0; for (let t = 0; t <= 0.3; t += 0.01) { const q = [p[0] - g[0] * t, p[1] - g[1] * t, p[2] - g[2] * t]; if (!dentroG(q)) break; h = Math.max(h, -sample(FM, ...q)); } return h; };
  const dminZona = (P, Z) => { let d = 9; for (let i = 0; i < P.length / 3; i++) { const p = pt(P, i); if (len(sub(p, Z.c)) < Z.r && dentroG(p)) d = Math.min(d, sample(FT, ...p)); } return d; };
  for (const Z of PUNTE) {
    const nv = P.length / 3, punta = [], corpo = [];
    for (let i = 0; i < nv; i++) { const p = pt(P, i); if (len(sub(p, Z.c)) > Z.r) continue;
      if (sample(FT, ...p) < VICINO && semispessore(p) < SOTTILE) punta.push(p); else corpo.push(p); }
    const nl = normaleLamina(corpo), mp = [0, 1, 2].map(k => punta.reduce((s, p) => s + p[k], 0) / punta.length), mc = [0, 1, 2].map(k => corpo.reduce((s, p) => s + p[k], 0) / corpo.length);
    let n = sub(mp, mc); n = nz(sub(n, nl.map(v => v * dot(n, nl))));
    const s0 = Math.min(...punta.map(p => dot(p, n))) - MARGINE_T, s = i => dot(pt(P, i), n) - s0;
    // parti oltre il piano tutte dentro la sfera: tolte
    const { u, n: nu } = salda(P), oltre = new Uint8Array(nu), fuori = new Uint8Array(nu);
    for (let i = 0; i < nv; i++) if (s(i) > 0) { oltre[u[i]] = 1; if (len(sub(pt(P, i), Z.c)) > Z.r) fuori[u[i]] = 1; }
    const par = Int32Array.from({ length: nu }, (_, i) => i), f = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = u[I[t + e]], b = u[I[t + (e + 1) % 3]]; if (oltre[a] && oltre[b]) par[f(a)] = f(b); }
    const esce = new Set(); for (let w = 0; w < nu; w++) if (fuori[w]) esce.add(f(w));
    const via = w => !!oltre[w] && !esce.has(f(w));
    // divisione dei triangoli sul piano
    const nuovi = new Map(), sul = new Set();
    const taglio = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; if (nuovi.has(k)) return nuovi.get(k);
      const sa = s(a), sb = s(b), t = sa / (sa - sb), j = P.length / 3; for (let k2 = 0; k2 < 3; k2++) P.push(P[3 * a + k2] + t * (P[3 * b + k2] - P[3 * a + k2]));
      if (T.length) T.push(Math.round(T[a] + t * (T[b] - T[a]))); if (D.length) for (let k2 = 0; k2 < 3; k2++) D.push(Math.round(D[3 * a + k2] + t * (D[3 * b + k2] - D[3 * a + k2])));
      if (NR) { const v = nz([0, 1, 2].map(k2 => NR[3 * a + k2] + t * (NR[3 * b + k2] - NR[3 * a + k2]))); for (let k2 = 0; k2 < 3; k2++) NR.push(Math.round(v[k2] * 127)); }
      nuovi.set(k, j); sul.add(j); return j; };
    const I2 = []; let tolti = 0;
    for (let t = 0; t < I.length; t += 3) { const v = [I[t], I[t + 1], I[t + 2]], x = v.map(i => via(u[i]));
      if (!x[0] && !x[1] && !x[2]) { I2.push(...v); continue; }
      if (x[0] && x[1] && x[2]) { tolti++; continue; }
      const r = x.filter(Boolean).length === 1 ? x.indexOf(true) : x.indexOf(false), a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3], pab = taglio(a, b), pca = taglio(c, a);
      if (x[r]) I2.push(pab, b, c, pab, c, pca); else I2.push(a, pab, pca); tolti++; }
    I = I2;
    // contorni sul piano (lati di bordo con entrambi gli estremi sul piano) chiusi col taglio delle orecchie
    const { u: u2 } = salda(P), cnt = new Map();
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], k = u2[a] < u2[b] ? u2[a] + '|' + u2[b] : u2[b] + '|' + u2[a]; const o = cnt.get(k); if (o) o.n++; else cnt.set(k, { n: 1, a, b }); }
    const vic = new Map(), rapp = new Map();
    for (const { n: c, a, b } of cnt.values()) if (c === 1 && sul.has(a) && sul.has(b)) { const x = u2[a], y = u2[b]; rapp.set(x, a); rapp.set(y, b); (vic.get(x) || vic.set(x, []).get(x)).push(y); (vic.get(y) || vic.set(y, []).get(y)).push(x); }
    const visti = new Set(), anelli = [];
    for (const s1 of vic.keys()) { if (visti.has(s1)) continue; const L = []; let prev = -1, w = s1;
      while (w !== undefined && !visti.has(w)) { visti.add(w); L.push(w); const nx = vic.get(w).find(q => q !== prev && !visti.has(q)); prev = w; w = nx; }
      anelli.push(L); }
    const e1 = nz(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(n, e1), area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let facce = 0; const inizioFacce = I.length;
    for (const L of anelli) { if (L.length < 3) continue;
      const base = L.map(w => { const i = rapp.get(w), j = P.length / 3; for (let k = 0; k < 3; k++) P.push(P[3 * i + k]); if (T.length) T.push(T[i]); if (D.length) for (let k = 0; k < 3; k++) D.push(D[3 * i + k]); if (NR) for (let k = 0; k < 3; k++) NR.push(Math.round(n[k] * 127)); return j; });
      const Q = base.map(j => { const p = pt(P, j); return [dot(p, e1), dot(p, e2)]; }); let A = 0; for (let i = 0; i < Q.length; i++) A += area2([0, 0], Q[i], Q[(i + 1) % Q.length]);
      const pts = Q.map((_, i) => i); if (A < 0) pts.reverse(); const inTri = (p, a, b, c) => area2(a, b, p) >= -1e-12 && area2(b, c, p) >= -1e-12 && area2(c, a, p) >= -1e-12;
      while (pts.length > 3) { let fatto = false;
        for (let i = 0; i < pts.length && !fatto; i++) { const ia = pts[(i + pts.length - 1) % pts.length], ib = pts[i], ic = pts[(i + 1) % pts.length];
          if (area2(Q[ia], Q[ib], Q[ic]) <= 1e-12) continue; if (pts.some(j => j !== ia && j !== ib && j !== ic && inTri(Q[j], Q[ia], Q[ib], Q[ic]))) continue;
          I.push(base[ia], base[ib], base[ic]); pts.splice(i, 1); fatto = true; }
        if (!fatto) { const [ia, ib, ic] = pts.slice(0, 3); I.push(base[ia], base[ib], base[ic]); pts.splice(1, 1); } }
      I.push(...pts.map(i => base[i])); facce++; }
    // verso della faccia: e1 × e2 = n (fuori dal muscolo rimasto)
    for (let t = inizioFacce; t < I.length; t += 3) { const fn = cross(sub(pt(P, I[t + 1]), pt(P, I[t])), sub(pt(P, I[t + 2]), pt(P, I[t])));
      if (dot(fn, n) < 0) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; } }
    // vertici non più usati
    const usato = new Int32Array(P.length / 3).fill(-1); let m = 0; for (const i of I) if (usato[i] < 0) usato[i] = m++;
    const P2 = new Array(m * 3), T2 = T.length ? new Array(m) : [], D2 = D.length ? new Array(m * 3) : [], N2 = NR ? new Array(m * 3) : null;
    for (let i = 0; i < usato.length; i++) { const j = usato[i]; if (j < 0) continue; for (let k = 0; k < 3; k++) { P2[3 * j + k] = P[3 * i + k]; if (D.length) D2[3 * j + k] = D[3 * i + k]; if (NR) N2[3 * j + k] = NR[3 * i + k]; } if (T.length) T2[j] = T[i]; }
    const d0 = dminZona(B.pos, Z); P = P2; T = T2; D = D2; NR = N2; I = I.map(i => usato[i]);
    FINE[Z.nome] = { vertici_punta: punta.length, piano: { n: n.map(v => +v.toFixed(2)), s0: +s0.toFixed(3) }, triangoli_tolti_o_divisi: tolti, contorni: anelli.map(L => L.length), facce,
      vertici: [nv, m], dist_min_tubi_mm: [+(d0 * 10).toFixed(2), +(dminZona(Float32Array.from(P), Z) * 10).toFixed(2)] };
    log('dentato,', Z.nome + ':', JSON.stringify(FINE[Z.nome]));
  }
  setMesh('dent', { pos: Float32Array.from(P), idx: Uint32Array.from(I), tag: T.length ? Uint8Array.from(T) : null, fdir: D.length ? Int8Array.from(D) : null, nrm: NR ? Int8Array.from(NR) : null });
}

/* ---- b. vena sulla prima costa ---- */
const topoAttr = {};   // attributi delle vene e posizioni di PARTENZA (per spostamento e normali)
for (const v of VENE) {
  const B = realDaRevisione(PARTENZA, v, FILE_REPO), N0 = nrmDaRevisione(PARTENZA, v, FILE_REPO), P = Float32Array.from(B.pos), nv = P.length / 3;
  griglia([7.5, 0.5, 1.5], [12.5, 5, 6], 0.02, 0.3); const FB = campo(OSSA_V).F;
  const w = new Float32Array(nv); for (let i = 0; i < nv; i++) { const p = pt(P, i); if (dentroG(p)) w[i] = 1 - sstep(ZONA_V[0], ZONA_V[1], sample(FB, ...p)); }
  const dmin = Q => { let d = 9; for (let i = 0; i < nv; i++) if (w[i] > 0) d = Math.min(d, sample(FB, ...pt(Q, i))); return d; };
  const { u, n: nu } = salda(P), nb = Array.from({ length: nu }, () => new Set());
  for (let t = 0; t < B.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = u[B.idx[t + e]], b = u[B.idx[t + (e + 1) % 3]]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
  const NB = nb.map(s => [...s]), Q = new Float64Array(nu * 3), W = new Float32Array(nu); for (let i = 0; i < nv; i++) { for (let k = 0; k < 3; k++) Q[3 * u[i] + k] = P[3 * i + k]; W[u[i]] = Math.max(W[u[i]], w[i]); }
  const Q0 = Q.slice(), pieghe0 = pieghe(B.pos, B.idx), d0 = dmin(B.pos);
  for (let it = 0; it < 2 * PASSATE_V; it++) { const lam = it % 2 ? -0.53 : 0.5, R = Q.slice();
    for (let i = 0; i < nu; i++) { if (!W[i] || !NB[i].length) continue; for (let k = 0; k < 3; k++) { let m = 0; for (const j of NB[i]) m += Q[3 * j + k]; R[3 * i + k] += W[i] * lam * (m / NB[i].length - Q[3 * i + k]); } }
    Q.set(R);
    if (it % 2) for (let i = 0; i < nu; i++) { if (!W[i]) continue; const p = [Q[3 * i], Q[3 * i + 1], Q[3 * i + 2]], d = sample(FB, ...p); if (d >= GIOCO_V) continue;
      const g = nz(grad(FB, p)); for (let k = 0; k < 3; k++) Q[3 * i + k] += (GIOCO_V - d) * g[k]; } }
  let mx = 0; const mosso = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) { const d = len(sub([Q[3 * u[i]], Q[3 * u[i] + 1], Q[3 * u[i] + 2]], [Q0[3 * u[i]], Q0[3 * u[i] + 1], Q0[3 * u[i] + 2]])); mx = Math.max(mx, d); if (d > 1e-4) mosso[i] = 1; for (let k = 0; k < 3; k++) P[3 * i + k] = Q[3 * u[i] + k]; }
  const NL = normali(P, B.idx), nrm = N0 ? Int8Array.from(N0) : NL; for (let i = 0; i < nv; i++) if (mosso[i]) for (let k = 0; k < 3; k++) nrm[3 * i + k] = NL[3 * i + k];
  setMesh(v, { pos: P, idx: B.idx, tag: B.tag, fdir: B.fdir, nrm }); topoAttr[v] = { tag: B.tag, fdir: B.fdir, nrm, p0: B.pos };
  FINE[v] = { vertici_lisciati: mosso.reduce((s, x) => s + x, 0), spostamento_max_mm: +(mx * 10).toFixed(2), pieghe: [pieghe0, pieghe(P, B.idx)], dist_min_ossa_mm: [+(d0 * 10).toFixed(2), +(dmin(P) * 10).toFixed(2)] };
  log(v + ':', JSON.stringify(FINE[v]));
}
/* ---- c. giunzione ascellare/succlavia. Ognuna termina con un tappo dentro l'altra, a filo della superficie: il bordo del tappo della succlavia,
   schiacciato sulla costa, sporgeva come uno spigolo accanto all'osso e il tappo accartocciato dell'ascellare affiorava. Il tappo della succlavia
   si restringe verso l'asse (sezioni di 1 mm: fattore da `RESTRINGI_G`[0] a `RESTRINGI_G`[1] fino a 1 a `X_G`[1]), poi ogni tappo è lisciato
   (`PASSATE_G` passate di Taubin pesate) e portato `GIOCO_G` sotto la superficie dell'altra vena (`GIUNZIONE`: peso per x), restando a
   `GIOCO_V` dalle ossa (l'osso prevale). Tra `X_G`[0] e
   `X_G`[2] le due superfici si incrociano senza spigoli. ---- */
{
  const R = REAL('v_succ'), P = Float32Array.from(R.pos), nv = P.length / 3, fasce = new Map();
  for (let i = 0; i < nv; i++) { const k = Math.round(P[3 * i] / 0.1); const o = fasce.get(k) || [0, 0, 0, 0]; for (let j = 0; j < 3; j++) o[j] += P[3 * i + j]; o[3]++; fasce.set(k, o); }
  for (let i = 0; i < nv; i++) { const x = P[3 * i]; if (x >= X_G[1]) continue; const o = fasce.get(Math.round(x / 0.1)), c = [o[0] / o[3], o[1] / o[3], o[2] / o[3]];
    const f = RESTRINGI_G[0] + (1 - RESTRINGI_G[0]) * sstep(RESTRINGI_G[1], X_G[1], x); for (let k = 1; k < 3; k++) P[3 * i + k] = c[k] + f * (P[3 * i + k] - c[k]); }
  setMesh('v_succ', { ...topoAttr.v_succ, pos: P, idx: R.idx });
}
for (const [v, altra, peso] of GIUNZIONE) {
  const R = REAL(v), P = Float32Array.from(R.pos), P00 = topoAttr[v].p0, nv = P.length / 3; griglia([8.3, 1.4, 2.2], [10.9, 4.3, 4.7], 0.015, 0.2); const FA = campo([altra]).F, FB = campo(OSSA_V).F;
  const { u, n: nu } = salda(P), nb = Array.from({ length: nu }, () => new Set());
  for (let t = 0; t < R.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = u[R.idx[t + e]], b = u[R.idx[t + (e + 1) % 3]]; if (a !== b) { nb[a].add(b); nb[b].add(a); } }
  const NB = nb.map(x => [...x]), Q = new Float64Array(nu * 3), W = new Float32Array(nu);
  for (let i = 0; i < nv; i++) { for (let k = 0; k < 3; k++) Q[3 * u[i] + k] = P[3 * i + k]; if (P[3 * i] > 8.4 && P[3 * i] < 10.8) W[u[i]] = peso(P[3 * i]); }
  const fuori = () => Math.max(...[...Array(nu).keys()].filter(i => W[i] > 0.99).map(i => sample(FA, Q[3 * i], Q[3 * i + 1], Q[3 * i + 2])));
  const f0 = fuori();
  for (let it = 0; it < 2 * PASSATE_G; it++) { const lam = it % 2 ? -0.53 : 0.5, S = Q.slice();
    for (let i = 0; i < nu; i++) { if (!W[i] || !NB[i].length) continue; for (let k = 0; k < 3; k++) { let m = 0; for (const j of NB[i]) m += Q[3 * j + k]; S[3 * i + k] += W[i] * lam * (m / NB[i].length - Q[3 * i + k]); } }
    Q.set(S);
    if (it % 2) for (let i = 0; i < nu; i++) { if (!W[i]) continue; const p = [Q[3 * i], Q[3 * i + 1], Q[3 * i + 2]], d = sample(FA, ...p), lim = -GIOCO_G * W[i]; if (d <= lim) continue;
      const g = nz(grad(FA, p)); for (let k = 0; k < 3; k++) Q[3 * i + k] -= W[i] * (d - lim) * g[k]; }
    if (it % 2) for (let i = 0; i < nu; i++) { if (!W[i]) continue; const p = [Q[3 * i], Q[3 * i + 1], Q[3 * i + 2]], d = sample(FB, ...p); if (d >= GIOCO_V) continue;   // l'osso prevale
      const g = nz(grad(FB, p)); for (let k = 0; k < 3; k++) Q[3 * i + k] += (GIOCO_V - d) * g[k]; } }
  let mx = 0; const mosso = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) { for (let k = 0; k < 3; k++) P[3 * i + k] = Q[3 * u[i] + k]; const d = len(sub(pt(P, i), pt(P00, i))); mx = Math.max(mx, d); if (d > 1e-4) mosso[i] = 1; }
  const NL = normali(P, R.idx), nrm = Int8Array.from(topoAttr[v].nrm); for (let i = 0; i < nv; i++) if (mosso[i]) for (let k = 0; k < 3; k++) nrm[3 * i + k] = NL[3 * i + k];
  setMesh(v, { ...topoAttr[v], pos: P, idx: R.idx, nrm });
  FINE[v + ' (tappo)'] = { vertici_mossi_da_b: mosso.reduce((s, x) => s + x, 0), spostamento_max_mm: +(mx * 10).toFixed(2), ['tappo_vs_' + altra + '_mm']: [+(f0 * 10).toFixed(2), +(fuori() * 10).toFixed(2)], pieghe: pieghe(P, R.idx) };
  log(v + ' (tappo):', JSON.stringify(FINE[v + ' (tappo)']));
}
if (!PROVA) saveFile(repack());
