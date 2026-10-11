/* Capsula articolare del gomito (modelli/gomito-3d.html): mesh `caps`.

   Uso (dalla cartella del progetto):
     node strumenti/capsula-gomito.mjs                  → riscrive la mesh nel file del modello
     node strumenti/capsula-gomito.mjs --prova=f.json   → non tocca il modello: scrive la capsula (con ossa e cartilagini) in un JSON
     MODELLO=/tmp/copia.html node strumenti/capsula-gomito.mjs   → lavora su una copia

   Un'unica capsula avvolge le articolazioni omero-ulnare, omero-radiale e radio-ulnare prossimale (Gray's Anatomy; Morrey, The Elbow and Its Disorders).
   Costruzione in 3D (non per fette):
     1. contenuto articolare K = estremità ossee entro le linee d'inserzione + cartilagini + cuscinetti adiposi + legamento anulare. Le linee d'inserzione
        seguono i reperi: sull'omero la capsula si inserisce a `d.omero` cm dal margine della cartilagine e a `d.fossette` cm oltre i cuscinetti adiposi
        (quindi sopra le fossette coronoidea, radiale e olecranica; epicondili esclusi, extracapsulari); sull'ulna a `d.ulna` cm dal margine articolare
        (margine anteriore del coronoide, margini dell'olecrano e dell'incisura radiale); sul radio a `d.radio` cm sotto la cartilagine della testa
        (collo del radio: recesso sacciforme sotto il legamento anulare);
     2. superficie tesa = chiusura morfologica 3D di K (raggio `chiusura`): aderisce all'osso convesso e scavalca rime articolari, fossette e solchi;
     3. guscio di spessore `th` appena fuori dalla superficie tesa; lo spessore scende a `thkMin` avvicinandosi all'osso escluso (linea d'inserzione, `rastrema`);
        il guscio è tagliato sulla superficie ossea, poi surface nets, componente principale, orientamento coerente verso l'esterno;
     4. controlli: cartilagini racchiuse (raggi che escono senza incontrare capsula, ossa o legamenti) e distanza capsula-osso.
   Riparte sempre da ossa, cartilagini, legamenti e cuscinetti incorporati (che non modifica). Ordine di lancio: ossa-gomito → cartilagini-gomito →
   legamenti-gomito → capsula-gomito → cuscinetti-gomito (i cuscinetti usano la faccia profonda della capsula; la capsula usa i cuscinetti presenti:
   lanciarla una sola volta prima dei cuscinetti, altrimenti si restringono a ogni giro). Parametri nell'oggetto P. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { setMesh, sstep, log, repack, saveFile, esatta, REAL, griglia, sdf, sfoca, unione, nets, edt, solid } = G;

const P = {
  passo: 0.03, lo: [-3.9, -2.7, -2.9], hi: [3.9, 3.9, 2.5],
  d: { omero: 0.35, fossette: 0.3, ulna: 0.3, radio: 0.55 },   // cm: distanza delle linee d'inserzione dai reperi (vedi sopra)
  chiusura: 0.7,                       // cm: raggio della chiusura morfologica 3D
  liscia: 0.35,                        // cm: levigatura (sigma) dei campi che definiscono le linee d'inserzione
  levigaF: 6,                          // passate di levigatura della superficie tesa
  fuori: 0.045, th: 0.09,              // distanza dalla superficie tesa e spessore del guscio (cm)
  rastrema: 0.35,                      // cm: distanza dall'osso escluso entro cui lo spessore scende a `thkMin`
  thkMin: 0.065,                       // cm: spessore minimo al bordo (più sottile del passo della griglia genererebbe schegge e buchi)
  gbone: 0.012,                        // distanza minima dall'osso (cm)
};
const OSSA = ['omero', 'ulna', 'radio'], CART = ['cart_omero', 'cart_ulna', 'cart_radio'], GRASSO = ['fat_ant', 'fat_post'];
const LEG = ['anulare', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'lucl', 'quadrato'];

griglia(P.lo, P.hi, P.passo, 0);
const { NX, NY, NZ, NXY } = G, N = G.N;
log('griglia', NX, NY, NZ, (N / 1e6).toFixed(1), 'M voxel');
const dist = nomi => edt(unione(nomi));          // distanza (cm) dal solido
const SH = solid('omero'), SU = solid('ulna'), SR = solid('radio');
const dCH = dist(['cart_omero']), dCU = dist(['cart_ulna']), dCR = dist(['cart_radio']), dF = dist(GRASSO);
// 1. contenuto articolare: per ogni osso un campo "distanza dal reperto − soglia", levigato (linea d'inserzione liscia, non frastagliata come i
// margini delle cartilagini o i lobuli dei cuscinetti); dentro K le parti di osso con campo < 0, poi cartilagini, cuscinetti (levigati) e legamento anulare
const lev = (F, sigma) => { const n = Math.max(1, Math.round(1.5 * (sigma / G.H) ** 2)); return sfoca(F, n); };
const eH = new Float32Array(N), eU = new Float32Array(N), eR = new Float32Array(N), eF = new Float32Array(N);
for (let i = 0; i < N; i++) { eH[i] = Math.min(dCH[i] - P.d.omero, dF[i] - P.d.fossette); eU[i] = dCU[i] - P.d.ulna; eR[i] = dCR[i] - P.d.radio; eF[i] = dF[i] - 0.06; }
for (const F of [eH, eU, eR]) lev(F, P.liscia); lev(eF, P.liscia / 2);
const K = unione([...CART, 'anulare']), ESC = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const inH = SH[i] && eH[i] <= 0, inU = SU[i] && eU[i] <= 0, inR = SR[i] && eR[i] <= 0;
  if (inH || inU || inR || eF[i] <= 0) K[i] = 1; else if (SH[i] || SU[i] || SR[i]) ESC[i] = 1;
}
// 2. chiusura morfologica 3D: dilatazione e erosione con trasformata di distanza esatta
const Do = edt(K), A = new Uint8Array(N); for (let i = 0; i < N; i++) A[i] = Do[i] <= P.chiusura ? 1 : 0;
const Ein = edt(A, true), CL = new Uint8Array(N); for (let i = 0; i < N; i++) CL[i] = (A[i] && Ein[i] > P.chiusura) || K[i] ? 1 : 0;
const { F: Fcl } = sdf(CL); sfoca(Fcl, P.levigaF);       // distanza con segno dalla superficie tesa, levigata
log('chiusura fatta');
// 3. guscio
const dEsc = sfoca(edt(ESC), 3), FB = esatta(sfoca(sdf(unione(OSSA)).F, 1), OSSA, 0.1);
const V = new Float32Array(N).fill(1); let nShell = 0;
for (let i = 0; i < N; i++) { const d = Fcl[i];
  if (d < P.fuori - 0.05 || d > P.fuori + P.th + 0.1) continue;
  const thk = Math.max(P.thkMin, P.th * sstep(0, P.rastrema, dEsc[i]));   // il guscio non si interrompe mai prima di arrivare all'osso
  V[i] = Math.max(d - (P.fuori + thk), P.fuori - d, P.gbone - FB[i]); if (V[i] < 0) nShell++; }
log('campo costruito,', nShell, 'voxel di guscio');
function componentiPrincipali(Vf, quota = 0.05) {
  const lab = new Int32Array(N), vol = [0]; let n = 0;
  for (let s = 0; s < N; s++) { if (Vf[s] >= 0 || lab[s]) continue; n++; vol.push(0); const st = [s]; lab[s] = n;
    while (st.length) { const id = st.pop(); vol[n]++; const i = id % NX, j = ((id / NX) | 0) % NY, k = (id / NXY) | 0;
      for (const [ok, d] of [[i > 0, -1], [i < NX - 1, 1], [j > 0, -NX], [j < NY - 1, NX], [k > 0, -NXY], [k < NZ - 1, NXY]]) if (ok && Vf[id + d] < 0 && !lab[id + d]) { lab[id + d] = n; st.push(id + d); } } }
  const mx = Math.max(...vol), tieni = vol.map(v => v >= quota * mx);
  for (let i = 0; i < N; i++) if (Vf[i] < 0 && !tieni[lab[i]]) Vf[i] = 0.01;
  return vol.slice(1).filter(v => v >= quota * mx).length;
}
log('componenti tenute:', componentiPrincipali(V));
const mesh = nets(sfoca(V, 1), () => [0, 0, 1]);
// i bordi sottili lungo le linee d'inserzione (spessore ≈ 1 voxel) generano qualche triangolo con avvolgimento incoerente: si riorienta ogni componente
// connessa (propagazione dell'orientamento sui bordi manifold) e la si gira in modo che il volume sia positivo (normali verso l'esterno)
function orienta(m) {
  const T = m.idx.length / 3, ed = new Map();
  for (let t = 0; t < T; t++) for (let q = 0; q < 3; q++) { const a = m.idx[3 * t + q], b = m.idx[3 * t + (q + 1) % 3], k = a < b ? a * 4294967296 + b : b * 4294967296 + a; const e = ed.get(k); if (e) e.push(t); else ed.set(k, [t]); }
  const flip = new Uint8Array(T), seen = new Uint8Array(T), dir = (t, a, b) => { for (let q = 0; q < 3; q++) { const u = m.idx[3 * t + q], v = m.idx[3 * t + (q + 1) % 3]; if (u === a && v === b) return 1; if (u === b && v === a) return -1; } return 0; };
  const comp = new Int32Array(T).fill(-1); let nc = 0;
  for (let s = 0; s < T; s++) { if (seen[s]) continue; seen[s] = 1; comp[s] = nc; const st = [s];
    while (st.length) { const t = st.pop();
      for (let q = 0; q < 3; q++) { const a = m.idx[3 * t + q], b = m.idx[3 * t + (q + 1) % 3], e = ed.get(a < b ? a * 4294967296 + b : b * 4294967296 + a); if (e.length !== 2) continue;
        const u = e[0] === t ? e[1] : e[0]; if (seen[u]) continue; seen[u] = 1; comp[u] = nc;
        // t orientato (a→b) (con eventuale flip); u deve percorrere il bordo in senso opposto
        const dt = dir(t, a, b) * (flip[t] ? -1 : 1), du = dir(u, a, b); flip[u] = du === dt ? 1 : 0; st.push(u); } }
    nc++; }
  const vol = new Float64Array(nc), p = m.pos;
  for (let t = 0; t < T; t++) { let [a, b, c] = [0, 1, 2].map(q => 3 * m.idx[3 * t + q]); if (flip[t]) [b, c] = [c, b];
    vol[comp[t]] += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; }
  let nf = 0; const idx = m.idx.slice();
  for (let t = 0; t < T; t++) { if (flip[t] !== (vol[comp[t]] < 0 ? 1 : 0)) { const b = idx[3 * t + 1]; idx[3 * t + 1] = idx[3 * t + 2]; idx[3 * t + 2] = b; nf++; } }
  log('triangoli riorientati', nf, 'su', T);
  return { pos: m.pos, idx };
}
const out = { pos: mesh.pos, idx: orienta(mesh).idx, tag: null, fdir: null };
let vol = 0; for (let t = 0; t < out.idx.length; t += 3) { const a = 3 * out.idx[t], b = 3 * out.idx[t + 1], c = 3 * out.idx[t + 2], p = out.pos;
  vol += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6; }
log('capsula', out.pos.length / 3, 'vertici, volume', vol.toFixed(2), 'cm³');
setMesh('caps', out);

// 4. controlli. (a) cartilagine racchiusa: da un campione di vertici di ogni cartilagine, 26 raggi; un raggio che esce dalla griglia senza incontrare
// capsula (dilatata di un voxel), ossa o legamenti indica un punto scoperto. (b) distanza dei vertici della capsula da ossa e cartilagini.
{
  const C0 = solid('caps'), BL = unione([...OSSA, ...LEG]), C = new Uint8Array(N);
  for (let i = NXY; i < N - NXY; i++) if (C0[i] || C0[i + 1] || C0[i - 1] || C0[i + NX] || C0[i - NX] || C0[i + NXY] || C0[i - NXY]) C[i] = 1;
  const dirs = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) { const l = Math.hypot(a, b, c); dirs.push([a / l, b / l, c / l]); }
  const { O, H } = G, buchi = {};
  for (const n of CART) { const m = REAL(n); let tot = 0, sc = 0; const zone = {};
    for (let v = 0; v < m.pos.length; v += 18) { tot++; let esce = false;
      for (const d of dirs) { let hit = false;
        for (let s = 0.06; s < 6; s += H * 0.7) { const i = Math.floor((m.pos[v] + d[0] * s - O[0]) / H), j = Math.floor((m.pos[v + 1] + d[1] * s - O[1]) / H), k = Math.floor((m.pos[v + 2] + d[2] * s - O[2]) / H);
          if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) break; const id = i + NX * j + NXY * k; if (C[id] || BL[id]) { hit = true; break; } }
        if (!hit) { esce = true;
          if (process.env.DEBUG) for (let s = 0.06; s < 6; s += G.H * 0.5) { const x = m.pos[v] + d[0] * s, y = m.pos[v + 1] + d[1] * s, z = m.pos[v + 2] + d[2] * s; if (G.sample(Fcl, x, y, z) > P.fuori + P.th / 2) {
            const q = [x, y, z].map(a => (Math.round(a * 4) / 4).toFixed(2)).join(','); buchi[q] = buchi[q] || [0, G.sample(dEsc, x, y, z).toFixed(2), G.sample(FB, x, y, z).toFixed(2)]; buchi[q][0]++; break; } }
          break; } }
      if (esce) { sc++; const q = [0, 1, 2].map(a => (Math.round(m.pos[v + a] * 2) / 2).toFixed(1)).join(','); zone[q] = (zone[q] || 0) + 1; } }
    log('controllo', n, ': scoperti', sc, 'su', tot, process.env.DEBUG ? Object.entries(zone).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `(${k})×${v}`).join(' ') : ''); }
  if (process.env.DEBUG) console.log('buchi (punto: n, dist. osso escluso, dist. osso):', Object.entries(buchi).sort((a, b) => b[1][0] - a[1][0]).slice(0, 14).map(([k, v]) => `(${k}) ${v.join('/')}`).join('  '));
  const { F } = sdf(unione([...OSSA, ...CART])), h = [0, 0, 0, 0, 0];
  for (let v = 0; v < out.pos.length; v += 3) { const d = G.sample(F, out.pos[v], out.pos[v + 1], out.pos[v + 2]); h[d < 0.15 ? 0 : d < 0.25 ? 1 : d < 0.35 ? 2 : d < 0.5 ? 3 : 4]++; }
  log('distanza capsula-osso (vertici) <1.5, 1.5-2.5, 2.5-3.5, 3.5-5, >5 mm:', h.join(' '));
}
const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) { const U = { caps: { pos: Array.from(out.pos, v => +v.toFixed(4)), idx: Array.from(out.idx) } }; for (const o of [...OSSA, ...CART, ...GRASSO, ...LEG, 'osborne']) { const m = REAL(o); U[o] = { pos: Array.from(m.pos, v => +v.toFixed(4)), idx: Array.from(m.idx) }; } writeFileSync(prova, JSON.stringify(U)); log('scritto', prova); }
else saveFile(repack());
