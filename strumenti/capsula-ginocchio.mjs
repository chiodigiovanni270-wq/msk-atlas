/* Genera la capsula articolare del ginocchio e la incorpora in modelli/ginocchio-3d.html.

   Uso (dalla cartella del progetto):
     node strumenti/capsula-ginocchio.mjs [--prova]

   Con --prova calcola e stampa le verifiche senza modificare il file.

   Come funziona: legge dal file del modello le mesh reali già incorporate (ossa, menischi,
   crociati, muscoli, legamenti), le voxelizza (passo 1 mm) e costruisce la capsula come
   involucro delle superfici articolari:
     1. contenuto articolare = femore, tibia, rotula, cartilagini, menischi, crociati e corpo di
        Hoffa (quello visualizzato: funzione procedurale + deformazione TPS lette dal file);
        involucro = chiusura morfologica (raggio R) dilatata di t → segue l'osso e scavalca
        l'interlinea e la fossa intercondiloidea;
     2. inserzioni: sulla tibia appena sotto la cartilagine (più in basso davanti per Hoffa e
        dietro per il LCP), sul femore sopra i condili (più in basso posterolateralmente, sotto
        l'origine del gastrocnemio laterale), con il recesso sovrapatellare davanti;
        verso l'inserzione lo spessore si annulla e la capsula si fonde con l'osso;
     3. la capsula resta profonda alle strutture extracapsulari (LCL, legamento anterolaterale,
        tratto ileotibiale, LCM, retinacoli, MPFL, vasti, capi del gastrocnemio, semimembranoso,
        tendini rotuleo e quadricipitale…) e si inserisce ai margini della rotula;
     4. superficie con surface nets, ritagliata esattamente sulla superficie ossea (manicotto
        aperto), levigata, orientata verso l'esterno;
     5. verifiche: percentuale di vertici delle strutture extracapsulari inglobati (deve essere 0)
        e delle strutture intra-articolari coperte (deve essere ~100).
   La mesh viene salvata come 'capsula' in bpdat/bpman (quantizzazione a 16 bit come le altre);
   se esiste già viene sostituita. I parametri sono nell'oggetto P qui sotto.

   Requisiti: Node 18 o successivo, nessuna dipendenza. */
import { M, man, buf0, REAL, O, H, NX, NY, NZ, NXY, N, vi, or, solid, edt, sample, clamp, sstep, log, saveFile } from './lib-modello.mjs';
const html = M.html;
const PROVA = process.argv.includes('--prova');
const P = { R: 1.1, t: 0.26, m: 0.1, tmin: 0.14, tthin: 0.1, clear: 0.13, blur: 2, sp: 2.6, spL: 2.7, step: 0.15, smooth: 12 };
/* R: raggio di chiusura · t: distanza dal contenuto articolare · m: margine dalle strutture extracapsulari
   tmin/tthin: distanza minima dall'osso sotto muscoli / strutture sottili · clear: distacco minimo dall'osso
   blur: passate di sfocatura del campo · sp: altezza del recesso sovrapatellare · spL: sua semi-larghezza (cm; più largo,
   sale anche sui lati della troclea: recessi parapatellari) · step: passo della mesh */

const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

// corpo di Hoffa come appare nel modello: funzione procedurale hoffa() deformata con la TPS (bptps),
// entrambe lette dal file, campionate e voxelizzate
function hoffaVisualizzato() {
  const src = name => { const a = html.indexOf('function ' + name + '('); let d = 0, i = html.indexOf('{', a);
    for (; i < html.length; i++) { if (html[i] === '{') d++; else if (html[i] === '}' && --d === 0) break; } return html.slice(a, i + 1); };
  const hoffa = new Function('clamp', src('sEll') + src('smin') + src('hoffa') + '; return hoffa;')(clamp);
  const T = JSON.parse(html.match(/<script id="bptps" type="application\/json">(.*?)<\/script>/s)[1]);
  const tps = (x, y, z) => { const { P: Q, W, A: Af } = T; const o = [0, 1, 2].map(k => Af[0][k] + Af[1][k] * x + Af[2][k] * y + Af[3][k] * z);
    for (let i = 0; i < Q.length; i++) { const d = Math.hypot(x - Q[i][0], y - Q[i][1], z - Q[i][2]); for (let k = 0; k < 3; k++) o[k] += W[i][k] * d; } return o; };
  const M = new Uint8Array(N), s = 0.04;
  for (let x = -2; x <= 2; x += s) for (let y = -3.2; y <= 0.5; y += s) for (let z = 0.9; z <= 3.0; z += s) {
    if (hoffa(x, y, z) >= 0) continue; const [a, b, c] = tps(x, y, z);
    const i = Math.floor((a - O[0]) / H), j = Math.floor((b - O[1]) / H), k = Math.floor((c - O[2]) / H);
    if (i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ) M[vi(i, j, k)] = 1;
  }
  return M;
}

/* ============ 1–3. Campo implicito ============ */
const BONES = new Uint8Array(N); for (const n of ['femore', 'tibia', 'rotula']) or(BONES, solid(n));
const CORE = BONES.slice();
for (const n of ['menmed', 'menlat', 'lca', 'lcp', 'menfem', 'trasv']) or(CORE, solid(n));
or(CORE, hoffaVisualizzato());
for (const n of ['cartfem', 'carttib', 'cartrot']) or(CORE, solid(n, true)); // mesh aperte
// extracapsulari: muscoli spessi (la capsula può passarvi dentro, vicino all'osso) e strutture sottili
const NB = new Uint8Array(N), SH = new Uint8Array(N);
for (const n of ['vint', 'vmed', 'vlat', 'retto', 'glat', 'gmed', 'plant', 'sol']) or(NB, solid(n));
for (const n of ['lcl', 'all', 'itb', 'popfib', 'lcm', 'mpfl', 'retmed', 'retlat', 'semim', 'semit', 'sart', 'grac', 'biclong', 'bicbrev', 'addmag', 'tenrot', 'tenquad']) or(SH, solid(n));
log('voxel');
const Dc = edt(CORE);
const A = new Uint8Array(N); for (let i = 0; i < N; i++) A[i] = Dc[i] <= P.R ? 1 : 0;
const E = edt(A, true), Dn = edt(NB), Ds = edt(SH);
const yT = (x, z) => { const wAnt = sstep(0.8, 2.0, z) * (1 - sstep(1.2, 2.2, Math.abs(x + 0.9))), wPost = 1 - sstep(-2.6, -1.6, z), wC = 1 - sstep(0.4, 1.6, Math.abs(x - 0.2)); return -2.35 - 0.45 * wAnt - 0.8 * wPost * wC; }; // davanti più in basso solo dietro al tendine rotuleo
const yF = (x, z) => { const wAnt = sstep(0.6, 2.2, z), wPost = 1 - sstep(-2.4, -1.2, z), g = Math.exp(-Math.pow((x + 1.1) / P.spL, 2));
  const wPL = sstep(-2.6, -3.3, x) * Math.exp(-Math.pow((z + 2.0) / 0.9, 2)); // posterolaterale: sotto l'origine del gastrocnemio laterale
  return 2.7 + 0.5 * wPost + wAnt * (0.6 + P.sp * g) - 0.9 * wPL; };
const taper = (x, y, z) => sstep(yT(x, z), yT(x, z) + 0.5, y) * (1 - sstep(yF(x, z) - 0.7, yF(x, z), y));
const F = new Float32Array(N);
for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const x = O[0] + (i + 0.5) * H, y = O[1] + (j + 0.5) * H, z = O[2] + (k + 0.5) * H, q = vi(i, j, k);
  const t = -0.2 + (P.t + 0.2) * taper(x, y, z);                    // verso le inserzioni affonda nell'osso
  let f = (P.R - E[q]) - t;
  f = smax(f, Math.min(P.m - Dn[q], Dc[q] - Math.min(P.tmin, t)), 0.12);
  f = smax(f, Math.min(P.m - Ds[q], Dc[q] - Math.min(P.tthin, t)), 0.12);
  const pl = 0.058 * (x + 0.696) - 0.264 * (y - 1.515) + 0.963 * (z - 3.91) + 0.05; // piano medio della rotula
  f = smax(f, pl - 3 * sstep(1.5, 2.4, Math.abs(y - 1.5)), 0.12);    // (solo all'altezza della rotula)
  F[q] = f;
}
for (let pass = 0; pass < P.blur; pass++) for (const [st, n] of [[1, NX], [NX, NY], [NXY, NZ]]) {
  const T = F.slice();
  for (let q = 0; q < N; q++) { const c = Math.floor(q / st) % n; if (c === 0 || c === n - 1) continue; F[q] = 0.25 * T[q - st] + 0.5 * T[q] + 0.25 * T[q + st]; }
}
log('campo');
const f = (x, y, z) => sample(F, x, y, z);
const grad = (G, x, y, z, e = 0.05) => [sample(G, x + e, y, z) - sample(G, x - e, y, z), sample(G, x, y + e, z) - sample(G, x, y - e, z), sample(G, x, y, z + e) - sample(G, x, y, z - e)];

/* ============ 4. Superficie ============ */
const st = P.step, mn = [-5.4, -4.2, -4.6], mx = [5.4, 7.5, 5.4];
const nx = Math.ceil((mx[0] - mn[0]) / st) + 1, ny = Math.ceil((mx[1] - mn[1]) / st) + 1, nz = Math.ceil((mx[2] - mn[2]) / st) + 1;
const G = new Float32Array(nx * ny * nz); { let n = 0; for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) G[n++] = f(mn[0] + i * st, mn[1] + j * st, mn[2] + k * st); }
const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const sy = nx, sz = nx * ny, cx = nx - 1, cy = ny - 1, cz = nz - 1, C = new Int32Array(cx * cy * cz).fill(-1);
let Pv = [], I = [];
{
  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const base = i + j * sy + k * sz; let mask = 0;
    for (let c = 0; c < 8; c++) { v[c] = G[base + CO[c][0] + CO[c][1] * sy + CO[c][2] * sz]; if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let ax = 0, ay = 0, az = 0, cnt = 0;
    for (const [a, b] of ED) if ((v[a] < 0) !== (v[b] < 0)) { const t = v[a] / (v[a] - v[b]); ax += CO[a][0] + (CO[b][0] - CO[a][0]) * t; ay += CO[a][1] + (CO[b][1] - CO[a][1]) * t; az += CO[a][2] + (CO[b][2] - CO[a][2]) * t; cnt++; }
    C[i + j * cx + k * cx * cy] = Pv.length / 3; Pv.push(mn[0] + (i + ax / cnt) * st, mn[1] + (j + ay / cnt) * st, mn[2] + (k + az / cnt) * st);
  }
  const cid = (i, j, k) => C[i + j * cx + k * cx * cy], quad = (a, b, c, d) => I.push(a, b, c, a, c, d);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    if (cid(i, j, k) < 0) continue; const s0 = G[i + j * sy + k * sz] < 0;
    if (j > 0 && k > 0 && s0 !== (G[i + 1 + j * sy + k * sz] < 0)) quad(cid(i, j, k), cid(i, j - 1, k), cid(i, j - 1, k - 1), cid(i, j, k - 1));
    if (i > 0 && k > 0 && s0 !== (G[i + (j + 1) * sy + k * sz] < 0)) quad(cid(i, j, k), cid(i, j, k - 1), cid(i - 1, j, k - 1), cid(i - 1, j, k));
    if (i > 0 && j > 0 && s0 !== (G[i + j * sy + (k + 1) * sz] < 0)) quad(cid(i, j, k), cid(i - 1, j, k), cid(i - 1, j - 1, k), cid(i, j - 1, k));
  }
}
const faceAgrees = t => { // normale del triangolo concorde con il gradiente del campo (verso l'esterno)
  const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
  const ux = Pv[3 * b] - Pv[3 * a], uy = Pv[3 * b + 1] - Pv[3 * a + 1], uz = Pv[3 * b + 2] - Pv[3 * a + 2], wx = Pv[3 * c] - Pv[3 * a], wy = Pv[3 * c + 1] - Pv[3 * a + 1], wz = Pv[3 * c + 2] - Pv[3 * a + 2];
  const g = grad(F, (Pv[3 * a] + Pv[3 * b] + Pv[3 * c]) / 3, (Pv[3 * a + 1] + Pv[3 * b + 1] + Pv[3 * c + 1]) / 3, (Pv[3 * a + 2] + Pv[3 * b + 2] + Pv[3 * c + 2]) / 3);
  return (uy * wz - uz * wy) * g[0] + (uz * wx - ux * wz) * g[1] + (ux * wy - uy * wx) * g[2] > 0;
};
const flip = t => { const x = I[3 * t + 1]; I[3 * t + 1] = I[3 * t + 2]; I[3 * t + 2] = x; };
for (let t = 0; t < I.length / 3; t++) if (!faceAgrees(t)) flip(t);
log('surface nets', Pv.length / 3, 'vertici');

// ritaglio esatto sulla superficie ossea: la capsula finisce sull'osso (manicotto aperto)
const Dbo = edt(BONES), Dbi = edt(BONES, true), GB = new Float32Array(N);
for (let i = 0; i < N; i++) GB[i] = Dbo[i] - Dbi[i] + (BONES[i] ? 0.05 : -0.05);
{
  const gv = new Float32Array(Pv.length / 3); for (let i = 0; i < gv.length; i++) gv[i] = sample(GB, Pv[3 * i], Pv[3 * i + 1], Pv[3 * i + 2]);
  const emap = new Map();
  const cut = (a, b) => {
    const k = a < b ? a + '_' + b : b + '_' + a; if (emap.has(k)) return emap.get(k);
    const t = gv[a] / (gv[a] - gv[b]), id = Pv.length / 3;
    Pv.push(Pv[3 * a] + (Pv[3 * b] - Pv[3 * a]) * t, Pv[3 * a + 1] + (Pv[3 * b + 1] - Pv[3 * a + 1]) * t, Pv[3 * a + 2] + (Pv[3 * b + 2] - Pv[3 * a + 2]) * t);
    emap.set(k, id); return id;
  };
  const I2 = [];
  for (let t = 0; t < I.length; t += 3) {
    const v3 = [I[t], I[t + 1], I[t + 2]], np = v3.filter(o => gv[o] > 0).length;
    if (np === 3) { I2.push(...v3); continue; } if (np === 0) continue;
    for (let r = 0; r < 3; r++) {
      const a = v3[r], b = v3[(r + 1) % 3], c = v3[(r + 2) % 3];
      if (np === 1 && gv[a] > 0) { I2.push(a, cut(a, b), cut(a, c)); break; }
      if (np === 2 && gv[a] <= 0) { const ab = cut(a, b), ac = cut(a, c); I2.push(ab, b, c, ab, c, ac); break; }
    }
  }
  // solo la componente connessa più grande, vertici compattati
  const n0 = Pv.length / 3, par = new Int32Array(n0).map((_, i) => i), fd = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < I2.length; t += 3) { par[fd(I2[t])] = fd(I2[t + 1]); par[fd(I2[t + 1])] = fd(I2[t + 2]); }
  const cnt = new Map(); for (let t = 0; t < I2.length; t += 3) { const r = fd(I2[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const keep = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const remap = new Int32Array(n0).fill(-1), P2 = []; I = [];
  for (let t = 0; t < I2.length; t += 3) if (fd(I2[t]) === keep) for (let r = 0; r < 3; r++) {
    const o = I2[t + r]; if (remap[o] < 0) { remap[o] = P2.length / 3; P2.push(Pv[3 * o], Pv[3 * o + 1], Pv[3 * o + 2]); } I.push(remap[o]);
  }
  Pv = P2;
}

// levigatura di Taubin a bordo fisso
const nv = Pv.length / 3, nbr = Array.from({ length: nv }, () => new Set()), bnd = new Uint8Array(nv);
{
  const edges = new Map(), ek = (a, b) => a < b ? a * nv + b : b * nv + a;
  for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) edges.set(ek(a, b), (edges.get(ek(a, b)) || 0) + 1);
  for (const [k, c] of edges) { const a = Math.floor(k / nv), b = k % nv; nbr[a].add(b); nbr[b].add(a); if (c === 1) { bnd[a] = 1; bnd[b] = 1; } }
}
const relax = (lam, only) => {
  const Q = Pv.slice();
  for (const i of only || nbr.keys()) {
    if (bnd[i] || !nbr[i].size) continue; let sx = 0, sy = 0, sz = 0;
    for (const j of nbr[i]) { sx += Pv[3 * j]; sy += Pv[3 * j + 1]; sz += Pv[3 * j + 2]; }
    const m = nbr[i].size; Q[3 * i] += lam * (sx / m - Pv[3 * i]); Q[3 * i + 1] += lam * (sy / m - Pv[3 * i + 1]); Q[3 * i + 2] += lam * (sz / m - Pv[3 * i + 2]);
  }
  Pv = Q;
};
for (let s = 0; s < P.smooth; s++) { relax(0.5); relax(-0.53); }

// distacco minimo dall'osso lontano dalle inserzioni (l'osso non deve "bucare" la capsula)
for (let i = 0; i < nv; i++) {
  if (bnd[i]) continue; const x = Pv[3 * i], y = Pv[3 * i + 1], z = Pv[3 * i + 2];
  const target = P.clear * taper(x, y, z), g = sample(GB, x, y, z); if (g >= target) continue;
  const n = grad(GB, x, y, z), l = Math.hypot(...n) || 1, d = target - g;
  Pv[3 * i] += n[0] / l * d; Pv[3 * i + 1] += n[1] / l * d; Pv[3 * i + 2] += n[2] / l * d;
}
relax(0.3); relax(-0.31);

// se tra un vertice e l'osso c'è una struttura extracapsulare sottile, il vertice torna sotto di essa
{
  const extra = (x, y, z) => Math.min(sample(Dn, x, y, z), sample(Ds, x, y, z)) < 0.02, moved = new Set();
  for (let i = 0; i < nv; i++) {
    const x = Pv[3 * i], y = Pv[3 * i + 1], z = Pv[3 * i + 2]; if (extra(x, y, z)) continue;
    const g = sample(GB, x, y, z); if (g <= 0 || g > 0.6) continue;
    const n = grad(GB, x, y, z), l = Math.hypot(...n) || 1, gx = n[0] / l, gy = n[1] / l, gz = n[2] / l;
    let hit = -1, far = -1;
    for (let d = 0.02; d < g; d += 0.02) { const on = extra(x - gx * d, y - gy * d, z - gz * d); if (on) { if (hit < 0) hit = d; far = d; } else if (hit >= 0) break; }
    if (hit < 0) continue;
    const d = Math.min(g - 0.03, Math.max(far + 0.04, hit + 0.06));
    Pv[3 * i] -= gx * d; Pv[3 * i + 1] -= gy * d; Pv[3 * i + 2] -= gz * d; moved.add(i);
  }
  const ring = new Set(); for (const i of moved) for (const j of nbr[i]) if (!moved.has(j)) { ring.add(j); for (const k of nbr[j]) if (!moved.has(k)) ring.add(k); }
  for (let it = 0; it < 4; it++) relax(0.5, ring);
  log('vertici riportati sotto strutture extracapsulari:', moved.size);
}

// orientamento coerente per propagazione, poi verso l'esterno per ogni regione
{
  const nt = I.length / 3, em = new Map(), done = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) for (let r = 0; r < 3; r++) { const a = I[3 * t + r], b = I[3 * t + (r + 1) % 3], k = a < b ? a * nv + b : b * nv + a; (em.get(k) || em.set(k, []).get(k)).push(t); }
  for (let s0 = 0; s0 < nt; s0++) {
    if (done[s0]) continue; done[s0] = 1; const Q = [s0], R = [s0];
    while (Q.length) {
      const t = Q.pop();
      for (let r = 0; r < 3; r++) {
        const a = I[3 * t + r], b = I[3 * t + (r + 1) % 3], L = em.get(a < b ? a * nv + b : b * nv + a); if (L.length !== 2) continue;
        for (const u of L) {
          if (u === t || done[u]) continue; let same = false;
          for (let q = 0; q < 3; q++) if (I[3 * u + q] === a && I[3 * u + (q + 1) % 3] === b) same = true;
          if (same) flip(u); done[u] = 1; Q.push(u); R.push(u);
        }
      }
    }
    let ag = 0; for (const t of R) if (faceAgrees(t)) ag++; if (ag < R.length / 2) for (const t of R) flip(t);
  }
}
log('mesh:', nv, 'vertici,', I.length / 3, 'triangoli');

/* ============ 5. Verifiche ============ */
const perc = (names, test) => names.map(n => { const { pos, nv } = REAL(n); let c = 0; for (let i = 0; i < nv; i++) if (test(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2])) c++; return `${n} ${(100 * c / nv).toFixed(1)}%`; }).join(' · ');
console.log('Inglobati (atteso 0):', perc(['lcl', 'all', 'itb', 'lcm', 'vint', 'vmed', 'vlat', 'glat', 'gmed', 'semim', 'plant', 'bicbrev', 'biclong', 'tenquad', 'tenrot'], (x, y, z) => f(x, y, z) < 0 && sample(Dc, x, y, z) > 0.2));
console.log('Coperti (atteso ~100):', perc(['menmed', 'menlat', 'lca', 'lcp', 'menfem', 'trasv'], (x, y, z) => f(x, y, z) < 0.02));
{ const Hf = hoffaVisualizzato(); let n = 0, c = 0; for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (Hf[vi(i, j, k)]) { n++; if (f(O[0] + (i + 0.5) * H, O[1] + (j + 0.5) * H, O[2] + (k + 0.5) * H) < 0.02) c++; }
  console.log('Hoffa coperto:', (100 * c / n).toFixed(1) + '%'); }
if (PROVA) process.exit(0);

/* ============ Scrittura nel file del modello ============ */
let buf = buf0;
const old = man.meshes.findLastIndex(m => m.n === 'capsula');
if (old >= 0) { // la capsula è sempre in coda al buffer: si tronca e si riscrive
  const m = man.meshes[old]; if (old !== man.meshes.length - 1) throw new Error('mesh capsula non in coda: rigenerare dal file originale');
  buf = buf.subarray(0, m.p); man.meshes.splice(old, 1);
}
const q = new Uint16Array(nv * 3); for (let i = 0; i < nv * 3; i++) { const k = i % 3; q[i] = Math.round(clamp((Pv[i] - man.min[k]) / (man.max[k] - man.min[k]), 0, 1) * 65535); }
const ix = nv < 65536 ? new Uint16Array(I) : new Uint32Array(I);
const pad = b => { const r = b.length % 4; return r ? Buffer.concat([b, Buffer.alloc(4 - r)]) : b; };
buf = pad(buf); const p = buf.length; buf = pad(Buffer.concat([buf, Buffer.from(q.buffer)])); const io = buf.length; buf = Buffer.concat([buf, Buffer.from(ix.buffer)]);
man.meshes.push({ n: 'capsula', nv, ni: I.length, p, i16: nv < 65536 ? 1 : 0, i: io });
saveFile(buf);
