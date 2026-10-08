/* Borse sierose del ginocchio: sacche lisce e lenticolari modellate sulle superfici reali tra cui sono interposte
   (sostituiscono le mesh "bsovra", "bprep", "binfprof", "binfsup", "bans", "bgsm" di modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto, dopo stratifica-ginocchio.mjs, capsula-ginocchio.mjs e cute-ginocchio.mjs, prima di percorsi-ginocchio.mjs):
     node strumenti/borse-ginocchio.mjs [--prova]
   Con --prova stampa solo le verifiche, senza modificare il file. SOLO=bprep,binfsup ricalcola solo le borse indicate.

   Anatomia di riferimento (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020):
   - Recesso sovrapatellare: sacca appiattita dietro il tendine del quadricipite e davanti al femore distale, larga
     circa quanto la rotula, che risale per ~5-7 cm sopra il polo superiore; comunica con l'articolazione.
   - Borsa prepatellare: sottocutanea, sottile, davanti alla metà inferiore della rotula e all'inizio del tendine rotuleo.
   - Borsa infrapatellare superficiale: sottocutanea, davanti alla tuberosità tibiale e al tendine rotuleo distale.
   - Borsa infrapatellare profonda: tra la faccia posteriore del tendine rotuleo distale e la tibia, subito sopra la
     tuberosità, sotto il corpo di Hoffa: a cuneo, riempie lo spazio tra tendine e osso.
   - Borsa anserina: tra i tendini della zampa d'oca e il LCM/tibia, ~4-5 cm sotto l'interlinea, allungata lungo i tendini.
   - Borsa gastrocnemio-semimembranosa: dietro il condilo femorale mediale, profonda al tendine del capo mediale del
     gastrocnemio e tra questo e il semimembranoso (sede della cisti di Baker).

   Metodo: ogni borsa è definita da un centro, una direzione (dal piano profondo verso quello superficiale), due
   semiassi e uno spessore massimo. Su una griglia polare del contorno (superellisse) si cerca lungo la direzione la
   superficie del piano profondo; la borsa vi appoggia e cresce verso l'esterno con profilo lenticolare (bordo
   arrotondato), limitata dallo spazio libero fino alle strutture superficiali. Basi e spessori sono levigati, e le due
   facce si chiudono sul bordo: la mesh è chiusa e liscia. Il contorno è appena lobato (parametro orlo, solo verso l'interno
   della superellisse) e lo spessore varia dolcemente (parametro vuoto, solo in riduzione), come in una sacca collassata
   con un velo di liquido: l'ingombro non supera mai quello della sacca regolare. */
import { REAL, setMesh, solid, edt, sample, or, N, log, repack, saveFile, clamp } from './lib-modello.mjs';

const PROVA = process.argv.includes('--prova');
const K = 18, J = 64; // anelli e raggi della griglia polare

// cx: centro (vicino alla superficie del piano profondo); n: direzione verso l'esterno ('auto' = normale del piano profondo);
// v: asse lungo (proiettato sul piano della borsa); a, b: semiassi lungo u e v; T: spessore massimo; m: esponente del contorno
const BORSE = [
  { nome: 'bsovra', profondo: ['femore'], superficiale: ['vint', 'tenquad', 'rotula'], c: [-0.85, 5.6, 2.6], n: [0, 0, 1], v: [0, 1, 0], a: 2.1, b: 2.6, T: 0.3, m: 2.6, dy: 0.25, quadrica: true },
  { nome: 'bprep', profondo: ['rotula', 'tenrot'], superficiale: ['cute'], c: [-0.75, 1.3, 5.0], n: [0, 0.12, 1], v: [0, 1, 0], a: 1.15, b: 1.2, T: 0.13, m: 2.2, quadrica: true },
  { nome: 'binfsup', profondo: ['tibia', 'tenrot'], superficiale: ['cute'], c: [-0.85, -4.55, 3.4], n: [0, 0.1, 1], v: [0, 1, 0], a: 0.95, b: 0.8, T: 0.16, m: 2.2, liscia: 40, quadrica: true },
  { nome: 'binfprof', profondo: ['tibia'], superficiale: ['tenrot'], c: [-0.85, -3.55, 2.8], n: [0, 0.15, 1], v: [0, 1, 0], a: 0.95, b: 0.65, T: 0.5, m: 2.4, riempi: true, liscia: 25 },
  { nome: 'bans', profondo: ['tibia', 'lcm'], superficiale: ['sart', 'grac', 'semit'], c: [2.7, -5.0, 1.2], n: 'auto', v: [-0.35, -0.8, 0.45], a: 1.05, b: 1.75, T: 0.22, m: 2.2, quadrica: true },
  { nome: 'bgsm', profondo: ['femore'], superficiale: ['gmed', 'semim'], c: [2.35, 1.7, -2.6], n: 'auto', v: [0, 1, 0], a: 0.75, b: 1.45, T: 0.4, m: 2.2, riempi: true },
];

const nrm = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function campo(nomi) { // distanza con segno (positiva fuori); per la cute: distanza dalla superficie verso l'interno dell'arto
  const S = new Uint8Array(N); let pelle = false; for (const n of nomi) { if (n === 'cute') pelle = true; else or(S, solid(n)); }
  if (pelle) { const P = edt(solid('cute'), true); return p => sample(P, ...p); }
  const A = edt(S), B = edt(S, true); return p => sample(A, ...p) - sample(B, ...p);
}
const grad = (f, p, e = 0.05) => nrm([f([p[0] + e, p[1], p[2]]) - f([p[0] - e, p[1], p[2]]), f([p[0], p[1] + e, p[2]]) - f([p[0], p[1] - e, p[2]]), f([p[0], p[1], p[2] + e]) - f([p[0], p[1], p[2] - e])]);

function borsa(B) {
  const fP = campo(B.profondo), fS = campo(B.superficiale), GAP = 0.03;
  let c = B.c.slice(), n = B.n;
  if (n === 'auto') { for (let i = 0; i < 30; i++) { const d = fP(c), g = grad(fP, c); c = c.map((x, k) => x - g[k] * d * 0.8); } n = grad(fP, c); }
  n = nrm(n); const v = nrm(B.v.map((x, k) => x - n[k] * dot(B.v, n))), u = cross(v, n);
  // aspetto di sacca vera: contorno appena lobato (solo verso l'interno: la borsa resta nell'impronta della superellisse)
  // e riempimento non uniforme (lo spessore può solo ridursi), diversi per ogni borsa
  const fase = q => 2.399963 * (BORSE.indexOf(B) + 1) * (q + 1), ORLO = B.orlo ?? 0.14, VUOTO = B.vuoto ?? 0.3;
  const orlo = t => 1 - ORLO * (0.5 + 0.5 * (0.55 * Math.sin(2 * t + fase(0)) + 0.3 * Math.sin(3 * t + fase(1)) + 0.15 * Math.sin(5 * t + fase(2))));
  const pieno = (s, t) => { const x = s / B.a, y = t / B.b; return 1 - VUOTO * (0.5 + 0.5 * (0.6 * Math.sin(2.3 * x + 1.7 * y + fase(3)) + 0.4 * Math.sin(-1.9 * x + 3.1 * y + fase(4)))); };
  const sp = (r0, t) => { const r = r0 * orlo(t), ct = Math.cos(t), st = Math.sin(t), e = 2 / B.m; return [B.a * r * Math.sign(ct) * Math.abs(ct) ** e, B.b * r * Math.sign(st) * Math.abs(st) ** e + (B.dy || 0) * B.b * r * r * st]; };
  // per ogni nodo: distanza lungo n dal piano del centro alla superficie profonda, e spazio libero sopra di essa
  const base = [], lib = [];
  for (let k = 0; k <= K; k++) { base.push([]); lib.push([]);
    for (let j = 0; j < (k ? J : 1); j++) {
      const [s, t] = sp(k / K, 2 * Math.PI * j / J), q = c.map((x, i) => x + u[i] * s + v[i] * t);
      let h = 3; while (h > -3 && fP(q.map((x, i) => x + n[i] * h)) > GAP) h -= 0.01; // dall'esterno verso l'osso
      const b0 = q.map((x, i) => x + n[i] * h); let a = 0; while (a < 1.2 && fS(b0.map((x, i) => x + n[i] * (a + 0.01))) > GAP) a += 0.01;
      base[k].push(h); lib[k].push(a);
    } }
  const vic = (k, j) => k === 0 ? base[1].map((_, q) => [1, q]) : [[k, (j + 1) % J], [k, (j + J - 1) % J], [Math.max(0, k - 1), k - 1 ? j : 0], [Math.min(K, k + 1), j]];
  const leviga = (A, it) => { for (let r = 0; r < it; r++) { const C = A.map(x => x.slice());
    for (let k = 0; k <= K; k++) for (let j = 0; j < A[k].length; j++) { const V = vic(k, j); C[k][j] = 0.5 * A[k][j] + 0.5 * V.reduce((s, [p, q]) => s + A[p][q], 0) / V.length; } A.splice(0, A.length, ...C); } };
  leviga(base, B.liscia || 12); leviga(lib, 6);
  if (B.quadrica) { // base = quadrica ai minimi quadrati sul piano profondo (sacche sottili su superfici poco curve)
    const R = [], y = [];
    for (let k = 0; k <= K; k++) for (let j = 0; j < base[k].length; j++) { const [s, t] = sp(k / K, 2 * Math.PI * j / J); R.push([1, s, t, s * s, s * t, t * t]); y.push(base[k][j]); }
    const A = Array.from({ length: 6 }, (_, a) => Array.from({ length: 7 }, (_, b) => b < 6 ? R.reduce((z, r) => z + r[a] * r[b], 0) : R.reduce((z, r, i) => z + r[a] * y[i], 0)));
    for (let a = 0; a < 6; a++) { let p = a; for (let b = a + 1; b < 6; b++) if (Math.abs(A[b][a]) > Math.abs(A[p][a])) p = b; [A[a], A[p]] = [A[p], A[a]];
      for (let b = 0; b < 6; b++) if (b !== a) { const f = A[b][a] / A[a][a]; for (let q = a; q < 7; q++) A[b][q] -= f * A[a][q]; } }
    const w = A.map((r, a) => r[6] / r[a]);
    for (let k = 0; k <= K; k++) for (let j = 0; j < base[k].length; j++) { const [s, t] = sp(k / K, 2 * Math.PI * j / J), q = [1, s, t, s * s, s * t, t * t], f = q.reduce((z, v, i) => z + v * w[i], 0);
      lib[k][j] += base[k][j] - f; base[k][j] = Math.max(f, base[k][j] - 0.02); } // mai dentro il piano profondo oltre 0,2 mm
  }
  // spessore lenticolare: bordo arrotondato, minimo 0,5 mm; con "riempi" occupa lo spazio fino alla struttura superficiale
  const pos = [], idx = [], id = [];
  let libMin = Infinity, compr = 0, tot = 0;
  for (let k = 0; k <= K; k++) { id.push([]);
    for (let j = 0; j < base[k].length; j++) {
      const r = k / K, prof = Math.sqrt(Math.max(0, 1 - r * r)), [s, t] = sp(r, 2 * Math.PI * j / J);
      const hMax = B.riempi ? Math.min(B.T, lib[k][j] - GAP) : B.T, hh = Math.max(0.05 * prof, Math.min(hMax * prof * pieno(s, t), lib[k][j] - GAP));
      if (k < K) { tot++; if (lib[k][j] - GAP < B.T * prof) compr++; libMin = Math.min(libMin, lib[k][j]); }
      const q = c.map((x, i) => x + u[i] * s + v[i] * t + n[i] * (base[k][j] + GAP));
      if (k === K) { id[k].push([pos.length / 3, pos.length / 3]); pos.push(...q); continue; }
      id[k].push([pos.length / 3, pos.length / 3 + 1]); pos.push(...q, ...q.map((x, i) => x + n[i] * hh));
    } }
  for (let k = 0; k < K; k++) for (let j = 0; j < J; j++) { // facce superiore (1) e inferiore (0, orientata al contrario)
    const a = k ? id[k][j] : id[0][0], b = k ? id[k][(j + 1) % J] : id[0][0], c2 = id[k + 1][j], d = id[k + 1][(j + 1) % J];
    for (const f of [0, 1]) { const A = a[f], Bq = b[f], C = c2[f], D = d[f], w = f ? (x, y, z) => idx.push(x, y, z) : (x, y, z) => idx.push(x, z, y);
      if (k) { w(A, C, D); w(A, D, Bq); } else w(A, C, D); } }
  // levigatura di Taubin delle due facce (bordo fermo): niente punte al centro né gradini tra gli anelli
  const nv = pos.length / 3, nb = Array.from({ length: nv }, () => new Set()), fermo = new Uint8Array(nv);
  for (let t = 0; t < idx.length; t += 3) for (let r = 0; r < 3; r++) { const a = idx[t + r], b = idx[t + (r + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  for (const [a] of id[K]) fermo[a] = 1;
  for (let it = 0; it < 40; it++) { const f = it % 2 ? -0.53 : 0.5, Q = pos.slice();
    for (let i = 0; i < nv; i++) { if (fermo[i]) continue; const m = [0, 0, 0]; for (const j of nb[i]) for (let q = 0; q < 3; q++) m[q] += Q[3 * j + q];
      for (let q = 0; q < 3; q++) pos[3 * i + q] = Q[3 * i + q] + f * (m[q] / nb[i].size - Q[3 * i + q]); } }
  log(`${B.nome}: ${pos.length / 3} vertici; limitata dalle strutture superficiali nel ${(100 * compr / tot).toFixed(0)}% della superficie (spazio minimo ${(libMin * 10).toFixed(1)} mm)`);
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

for (const B of BORSE.filter(B => !process.env.SOLO || process.env.SOLO.split(',').includes(B.nome))) { const m = borsa(B); setMesh(B.nome, { pos: m.pos, idx: m.idx, tag: null, fdir: null }); }
if (PROVA) process.exit(0);
saveFile(repack());
