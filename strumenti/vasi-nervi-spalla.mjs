/* Vasi e nervi della spalla (modelli/spalla-3d.html): arteria e vena ascellare (che proseguono la succlavia del file e diventano brachiali al ritaglio),
   plesso brachiale (tronchi e fasci) e nervi soprascapolare, ascellare, muscolocutaneo, radiale, mediano e ulnare.

   Uso (dalla cartella del progetto):
     node strumenti/vasi-nervi-spalla.mjs                  → riscrive le mesh nel file del modello
     node strumenti/vasi-nervi-spalla.mjs --prova=f.json   → non tocca il modello: scrive i controlli in un JSON
     MODELLO=/tmp/copia.html node strumenti/vasi-nervi-spalla.mjs   → lavora su una copia
   Va lanciato dopo `legamenti-spalla.mjs` (ossa, cartilagini, labbro e legamenti incorporati sono ostacoli). Riparte dalle mesh dei muscoli della revisione
   git `PARTENZA` (bozza BodyParts3D, prima dei canali), quindi si può rilanciare con lo stesso risultato.

   Metodo (come arterie e nervi del gomito: tubi lungo percorsi rilassati sugli ostacoli):
     1. Percorso: guide (cm, sistema del modello: x laterale→mediale, y basso→alto, z dietro→avanti) → Catmull-Rom a 1 mm → 150 passate di rilassamento:
        i punti troppo vicini a un ostacolo (ossa, cartilagini, labbro, legamenti, vasi e nervi già fatti) sono spinti fuori lungo il gradiente del campo di
        distanza, poi levigatura (peso 0,25) che raddrizza e tende il filo. Le due estremità restano ferme (origine su struttura madre o ritaglio a y = −14).
     2. Tubo a sezione circolare (14 lati) con raggio variabile lungo il percorso (vasi: calibro che cala dal tronco; nervi: costante e leggermente rastremato),
        riferimento di Bishop (nessuna torsione), estremi chiusi; le fibre (`fdir`) seguono il decorso.
     3. Continuità: l'arteria e la vena ascellari partono dall'estremo laterale della succlavia del file (centro e raggio dell'anello terminale) e vi
        entrano di 1 mm.
     4. Canali nei muscoli: i vertici dei muscoli entro raggio + 0,4 mm da un asse sono spinti radialmente fuori dal tubo (vertici soltanto: le mesh restano
        chiuse); dove il tubo attraversa la superficie di un muscolo la superficie si incava, dove il tubo corre dentro il muscolo non si vede.
     5. Controlli (stampati): distanza minima dalle ossa e dagli altri tubi, vertici dei tubi dentro i muscoli (dopo i canali), raggio di curvatura minimo.
   Percorsi approssimati su reperi dell'atlante (Gray's Anatomy; Netter): vanno verificati a vista dopo ogni modifica delle ossa. Non incluse: collaterali
   (toracoacromiale, toracica laterale, circonflesse, sottoscapolare), nervi pettorali, toracodorsale, toracico lungo, cefalica e basilica. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, setPos, posDaRevisione, saveFile, repack, log, clamp, griglia, esatta, sfoca, sdf, unione, or, solid, sample, grad } = G;

const PARTENZA = '59b7798';             // bozza con i muscoli BodyParts3D intatti
const FILE_REPO = 'modelli/spalla-3d.html';
const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nor = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a, b, t) => a + (b - a) * t;

const OSSA = ['scapola', 'clavicola', 'omero', 'costa1', 'costa2', 'costa3', 'manubrio', 'corpo_sterno'];
const FISSI = ['cart_omero', 'cart_glen', 'labbro', 'cc_conoide', 'cc_trapezoide', 'cal', 'ac_leg', 'sc_leg', 'coraco_om', 'sghl', 'mghl', 'ighl_a', 'ighl_p'];
const MUSCOLI = ['supra', 'infra', 'tmin', 'subs', 'delt_cl', 'delt_ac', 'delt_sp', 'tmaj', 'pec_cl', 'pec_st', 'pec_ab', 'pmin', 'succl', 'trap_d', 'trap_t', 'trap_a', 'lat', 'romb_mag', 'romb_min', 'elev', 'dent', 'omoi', 'bic_lungo', 'bic_breve', 'coracobr', 'tri_lungo', 'tri_lat', 'tri_med'];
const TAGLIO = -14;

/* ---- punti di riferimento ---- */
const V = n => { const m = REAL(n), o = []; for (let i = 0; i < m.pos.length; i += 3) o.push([m.pos[i], m.pos[i + 1], m.pos[i + 2]]); return o; };
const estremo = nome => { const P = V(nome), xm = Math.min(...P.map(p => p[0])), ring = P.filter(p => p[0] < xm + 0.12), c = ring.reduce((a, p) => add(a, p), [0, 0, 0]).map(x => x / ring.length);
  const r = ring.reduce((s, p) => s + len(sub(p, c)), 0) / ring.length; return { c, r }; };
const Ea = estremo('a_succ'), Ev = estremo('v_succ');
log('estremo laterale succlavia: arteria', Ea.c.map(x => x.toFixed(2)).join(','), 'r', Ea.r.toFixed(2), '– vena', Ev.c.map(x => x.toFixed(2)).join(','), 'r', Ev.r.toFixed(2));
const om = V('omero'), omY = y => { const s = om.filter(p => Math.abs(p[1] - y) < 0.3); const c = [0, 2].map(k => s.reduce((a, p) => a + p[k], 0) / s.length); return { x: c[0], z: c[1], xmin: Math.min(...s.map(p => p[0])), xmax: Math.max(...s.map(p => p[0])) }; };
const H14 = omY(-14), H8 = omY(-8), H4 = omY(-4);
// incisura soprascapolare: punto più basso del margine superiore della scapola tra coracoide e corpo
const sc = V('scapola');
const notch = (() => { let best = null; for (let x = 3.4; x <= 6.2; x += 0.2) { const s = sc.filter(p => Math.abs(p[0] - x) < 0.15 && p[2] > -0.5 && p[2] < 3.0 && p[1] > 1.2); if (!s.length) continue; const t = s.reduce((b, p) => p[1] > b[1] ? p : b); if (!best || t[1] < best[1]) best = t; } return best; })();
log('incisura soprascapolare', notch.map(x => x.toFixed(2)).join(','));
log('omero (x medio, z medio) a y −14:', H14.x.toFixed(2), H14.z.toFixed(2), '– y −8:', H8.x.toFixed(2), H8.z.toFixed(2), '– y −4:', H4.x.toFixed(2), H4.z.toFixed(2));
const brX = y => lerp(H14.xmax, H4.xmax, clamp((y + 14) / 10, 0, 1));          // faccia mediale della diafisi (x grande = mediale)
const AX = [3.2, -0.6, 2.9];                                                       // asse del fascio vascolo-nervoso sotto il coracoide

/* ---- specifiche: guide, raggi (cm) ---- */
const SPEC = [
  { id: 'a_asc', cat: 'art', r: [Ea.r, 0.27, 0.21], guide: [Ea.c, [6.3, 1.7, 3.5], AX, [1.5, -2.6, 2.2], [0.9, -5, 1.4], [0.4, -9, 0.7], [0.0, -12, 0.2], [-0.3, TAGLIO, 0.0]], fisso: [true, false] },
  { id: 'v_asc', cat: 'ven', r: [Ev.r, 0.36, 0.28], guide: [Ev.c, [6.6, 1.5, 3.9], add(AX, [0.45, -0.15, 0.2]), [2.0, -2.6, 2.6], [1.5, -5, 1.9], [1.1, -9, 1.2], [0.8, -12, 0.8], [0.7, TAGLIO, 0.6]], fisso: [true, false] },
  { id: 'plesso', cat: 'ner', multi: true },
  { id: 'n_soprascapolare', cat: 'ner', r: [0.1, 0.07], guide: [[9.0, 3.8, 2.4], [6.3, 3.5, 1.8], notch, [3.4, 3.1, -0.5], [1.6, 2.5, -1.6]], fisso: [false, false] },
  { id: 'n_ascellare', cat: 'ner', r: [0.14, 0.1], guide: [[3.4, -1.0, 2.3], [2.0, -2.0, 0.6], [0.8, -2.9, -1.2], [-1.4, -3.4, -1.6], [-3.4, -3.3, -0.8], [-4.6, -3.0, 0.6]], fisso: [false, false] },
  { id: 'n_muscolocutaneo', cat: 'ner', r: [0.11, 0.1], guide: [[3.6, -0.5, 3.3], [2.4, -2.6, 2.8], [0.6, -5.5, 2.4], [-1.2, -9.5, 2.0], [-2.2, TAGLIO, 1.6]], fisso: [false, false] },
  { id: 'n_radiale', cat: 'ner', r: [0.19, 0.15], guide: [[3.0, -1.2, 1.4], [1.8, -3.6, 0.3], [0.4, -5.6, -1.0], [-1.8, -7.8, -1.6], [-3.6, -10.0, -1.1], [-4.8, -12.2, -0.2], [-5.0, TAGLIO, 0.6]], fisso: [false, false] },
  { id: 'n_mediano', cat: 'ner', r: [0.16, 0.15], guide: [[3.5, -0.4, 3.5], [2.3, -2.7, 2.7], [1.3, -5.5, 1.9], [0.5, -9.5, 1.2], [0.1, TAGLIO, 1.0]], fisso: [false, false] },
  { id: 'n_ulnare', cat: 'ner', r: [0.13, 0.12], guide: [[3.0, -0.2, 2.9], [2.3, -3.0, 2.0], [1.7, -6.5, 1.0], [1.0, -10, 0.1], [0.4, TAGLIO, -0.6]], fisso: [false, false] },
];
// plesso: tre tronchi sopra la prima costa che convergono sotto la clavicola, poi tre fasci attorno all'arteria (laterale, posteriore, mediale)
const PLESSO = [
  { r: [0.2, 0.17], guide: [[10.8, 4.6, 2.4], [9.2, 3.6, 2.7], [7.6, 2.5, 3.2]] },               // tronco superiore
  { r: [0.2, 0.17], guide: [[11.0, 4.0, 1.8], [9.4, 3.2, 2.4], [7.6, 2.3, 3.0]] },               // tronco medio
  { r: [0.19, 0.16], guide: [[11.2, 3.4, 1.4], [9.5, 2.8, 2.2], [7.6, 2.1, 2.9]] },              // tronco inferiore
  { r: [0.2, 0.17], guide: [[7.6, 2.4, 3.2], [5.6, 1.4, 3.6], [3.6, -0.4, 3.5]] },               // fascio laterale (davanti e lateralmente all'arteria)
  { r: [0.2, 0.17], guide: [[7.6, 2.3, 3.0], [5.6, 1.1, 2.7], [3.2, -1.0, 1.7]] },               // fascio posteriore (dietro l'arteria)
  { r: [0.18, 0.15], guide: [[7.6, 2.1, 2.9], [5.8, 0.9, 3.1], [3.4, -0.6, 3.0]] },              // fascio mediale (medialmente all'arteria)
];

/* ---- campo di distanza degli ostacoli ---- */
const tutti = [...SPEC.flatMap(s => s.multi ? PLESSO.flatMap(p => p.guide) : s.guide)];
const lo = [0, 1, 2].map(k => Math.min(...tutti.map(p => p[k])) - 1.5), hi = [0, 1, 2].map(k => Math.max(...tutti.map(p => p[k])) + 1.5);
griglia(lo, hi, 0.05, 0);
const N = G.N;
log('griglia', G.NX, G.NY, G.NZ, (N / 1e6).toFixed(1), 'M voxel');
const MESH = {}, CHECK = {}, ASSI = {}, FATTI = [];
const campoOstacoli = () => { const nomi = [...OSSA, ...FISSI, ...FATTI], M = unione(nomi); return esatta(sfoca(sdf(M).F, 1), nomi, 0.12); };

/* ---- tubi ---- */
const catmull = (P, step = 0.1) => { const Q = [P[0], ...P, P[P.length - 1]], out = []; for (let k = 0; k < P.length - 1; k++) { const [p0, p1, p2, p3] = [Q[k], Q[k + 1], Q[k + 2], Q[k + 3]], n = Math.max(2, Math.ceil(len(sub(p2, p1)) / step));
    for (let i = 0; i < n; i++) { const t = i / n; out.push([0, 1, 2].map(a => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t * t + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t * t * t))); } } out.push(P[P.length - 1]); return out; };
const ricampiona = (P, step) => { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + len(sub(P[i], P[i - 1]))); const n = Math.max(2, Math.round(L[L.length - 1] / step)), o = []; for (let k = 0; k <= n; k++) { const x = L[L.length - 1] * k / n; let i = 1; while (i < L.length - 1 && L[i] < x) i++; o.push(add(P[i - 1], sub(P[i], P[i - 1]), clamp((x - L[i - 1]) / ((L[i] - L[i - 1]) || 1), 0, 1))); } return o; };
const raggio = (r, u) => r.length === 2 ? lerp(r[0], r[1], u) : u < 0.5 ? lerp(r[0], r[1], u * 2) : lerp(r[1], r[2], (u - 0.5) * 2);
function percorso(guide, r, fisso, Fo) {
  let P = ricampiona(catmull(guide), 0.1); const n = P.length, P0 = P.map(p => p.slice());
  for (let it = 0; it < 150; it++) {
    for (let k = 0; k < n; k++) { if (k === 0 && fisso[0] || k === n - 1 && fisso[1]) continue; const u = k / (n - 1), m = raggio(r, u) + 0.03, d = sample(Fo, ...P[k]);
      if (d < m) P[k] = add(P[k], nor(grad(Fo, P[k])), m - d);
      else { const a = P0[k], dd = sub(a, P[k]); P[k] = add(P[k], dd, 0.01); } }                       // richiamo debole verso la guida
    P = P.map((p, k) => k === 0 || k === n - 1 ? p : mul(add(add(P[k - 1], P[k + 1]), p, 2), 0.25));
    if (it % 10 === 9) P = P.map((p, k) => (k === 0 && fisso[0] || k === n - 1 && fisso[1]) ? p : p);
  }
  // le estremità libere restano a quota TAGLIO se la guida termina sul ritaglio
  if (Math.abs(guide[guide.length - 1][1] - TAGLIO) < 1e-6) P[n - 1][1] = TAGLIO;
  return P;
}
function tubo(P, r, lati = 14, tappoIni = true) {
  const n = P.length, pos = [], idx = [], fd = []; let u0 = nor(sub(P[1], P[0])); let ref = Math.abs(u0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; let e1 = nor(cross(u0, ref));
  for (let k = 0; k < n; k++) { const t = nor(sub(P[Math.min(n - 1, k + 1)], P[Math.max(0, k - 1)])); e1 = nor(sub(e1, mul(t, dot(e1, t)))); const e2 = cross(t, e1), rr = raggio(r, k / (n - 1)), tf = t.map(x => Math.round(x * 127));
    for (let s = 0; s < lati; s++) { const a = 2 * Math.PI * s / lati; pos.push(add(add(P[k], e1, Math.cos(a) * rr), e2, Math.sin(a) * rr)); fd.push(tf); } }
  for (let k = 0; k < n - 1; k++) for (let s = 0; s < lati; s++) { const s2 = (s + 1) % lati, a = k * lati + s, b = k * lati + s2, c = (k + 1) * lati + s, d = (k + 1) * lati + s2; idx.push(a, b, c, b, d, c); }
  const c0 = pos.length; pos.push(P[0], P[n - 1]); fd.push(fd[0], fd[fd.length - 1]);
  for (let s = 0; s < lati; s++) { const s2 = (s + 1) % lati; idx.push(c0, s2, s, c0 + 1, (n - 1) * lati + s, (n - 1) * lati + s2); }
  const p = new Float32Array(pos.length * 3), f = new Int8Array(pos.length * 3); pos.forEach((v, i) => { p.set([v[0], Math.max(v[1], TAGLIO), v[2]], 3 * i); f.set(fd[i], 3 * i); });   // il ritaglio è piano: nessun vertice sotto y = −14
  let vol = 0; for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2]; vol += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  return { pos: p, idx: Uint32Array.from(idx), tag: null, fdir: f };
}
const unisci = ms => { let o = 0; const pos = [], idx = [], fd = []; for (const m of ms) { pos.push(...m.pos); fd.push(...m.fdir); for (const i of m.idx) idx.push(i + o); o += m.pos.length / 3; } return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: Int8Array.from(fd) }; };
const curvaturaMin = P => { let m = 1e9; for (let k = 2; k < P.length - 2; k += 2) { const a = P[k - 2], b = P[k], c = P[k + 2], ab = len(sub(b, a)), bc = len(sub(c, b)), ac = len(sub(c, a)), s = (ab + bc + ac) / 2, A = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ac))); if (A > 1e-9) m = Math.min(m, ab * bc * ac / (4 * A)); } return m; };

let Fo = campoOstacoli();
for (const s of SPEC) {
  const gruppi = s.multi ? PLESSO : [s], parti = [];
  for (const g of gruppi) {
    const P = percorso(g.guide, g.r, s.fisso || [false, false], Fo); ASSI[s.id] = (ASSI[s.id] || []).concat([{ P, r: g.r }]);
    parti.push(tubo(P, g.r));
    const dMin = Math.min(...P.map((p, k) => sample(Fo, ...p) - raggio(g.r, k / (P.length - 1))));
    CHECK[s.id + (s.multi ? '#' + parti.length : '')] = { lunghezza_cm: +P.reduce((l, p, k) => k ? l + len(sub(p, P[k - 1])) : 0, 0).toFixed(2), distanza_min_da_ossa_e_legamenti_mm: +(dMin * 10).toFixed(2), raggio_curvatura_min_cm: +curvaturaMin(P).toFixed(2) };
  }
  MESH[s.id] = parti.length === 1 ? parti[0] : unisci(parti); setMesh(s.id, MESH[s.id]); FATTI.push(s.id);
  log(s.id, MESH[s.id].pos.length / 3, 'vertici', JSON.stringify(CHECK[s.id] || CHECK[s.id + '#1']));
  if (s !== SPEC[SPEC.length - 1]) Fo = campoOstacoli();
}
const mm = G.man; for (const id of Object.keys(MESH)) { const p = MESH[id].pos; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) if (p[i + k] < mm.min[k] || p[i + k] > mm.max[k]) { log('ATTENZIONE: vertice fuori dal riquadro del modello in', id); i = p.length; break; } }

/* ---- canali nei muscoli ---- */
const assi = Object.entries(ASSI).flatMap(([id, L]) => L.map(({ P, r }) => ({ id, P, r })));
const MARG = 0.04;
let spostati = 0;
const dentro = {};
for (const nome of MUSCOLI) {
  const pos = Float32Array.from(posDaRevisione(PARTENZA, nome, FILE_REPO)); let n = 0;
  for (let i = 0; i < pos.length; i += 3) {
    for (const { P, r } of assi) {
      let bd = 1e9, bk = 0; for (let k = 0; k < P.length; k++) { const d = Math.abs(P[k][0] - pos[i]) > 1 ? 1e9 : len(sub([pos[i], pos[i + 1], pos[i + 2]], P[k])); if (d < bd) { bd = d; bk = k; } }
      if (bd >= 1e8) continue; const m = raggio(r, bk / (P.length - 1)) + MARG;
      if (bd < m) { const dir = bd > 1e-6 ? nor(sub([pos[i], pos[i + 1], pos[i + 2]], P[bk])) : [1, 0, 0]; pos[i] = P[bk][0] + dir[0] * m; pos[i + 1] = P[bk][1] + dir[1] * m; pos[i + 2] = P[bk][2] + dir[2] * m; n++; }
    }
  }
  setPos(nome, pos); spostati += n; if (n) dentro[nome] = n;
}
log('canali nei muscoli: vertici spostati', spostati, JSON.stringify(dentro));

const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) writeFileSync(prova, JSON.stringify({ controlli: CHECK, canali: dentro }, null, 1)); else saveFile(repack());
