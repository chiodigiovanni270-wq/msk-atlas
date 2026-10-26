/* Funzioni per costruire un modello nuovo partendo dai file STL di BodyParts3D (usate da bozza-spalla.mjs):
   scarico dei file, lettura STL con saldatura dei vertici, ritaglio con un piano e chiusura della sezione,
   riduzione dei triangoli (quadriche) e impacchettamento nel formato bpman/bpdat dei modelli.
   Nessuna dipendenza: Node 22+, `curl` per il download. */
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const STL_URL = 'https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/main/assets/BodyParts3D_data/stl/';
export const STL_DIR = process.env.BP3D_DIR || join(tmpdir(), 'bp3d-stl');
export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---- download (cache in STL_DIR) ---- */
export function scarica(fma) {
  mkdirSync(STL_DIR, { recursive: true });
  const f = join(STL_DIR, `FMA${fma}.stl`);
  if (!existsSync(f) || statSync(f).size < 200) execFileSync('curl', ['-sS', '-f', '-o', f, `${STL_URL}FMA${fma}.stl`]);
  return f;
}

/* ---- lettura STL binario, vertici saldati (1 µm) ---- */
export function leggiSTL(f) {
  const b = readFileSync(f), n = b.readUInt32LE(80), map = new Map(), P = [], I = new Uint32Array(n * 3);
  for (let t = 0; t < n; t++) for (let v = 0; v < 3; v++) {
    const o = 84 + t * 50 + 12 + v * 12, x = b.readFloatLE(o), y = b.readFloatLE(o + 4), z = b.readFloatLE(o + 8);
    const k = Math.round(x * 1000) + ',' + Math.round(y * 1000) + ',' + Math.round(z * 1000);
    let id = map.get(k); if (id === undefined) { id = P.length / 3; P.push(x, y, z); map.set(k, id); }
    I[t * 3 + v] = id;
  }
  // toglie i triangoli degeneri
  const J = []; for (let t = 0; t < n; t++) { const a = I[3 * t], c = I[3 * t + 1], d = I[3 * t + 2]; if (a !== c && c !== d && a !== d) J.push(a, c, d); }
  return { pos: Float64Array.from(P), idx: Uint32Array.from(J) };
}

/* ---- tiene solo i vertici usati; extra = array per vertice da riordinare ---- */
export function compatta(pos, idx, extra = []) {
  const nv = pos.length / 3, map = new Int32Array(nv).fill(-1); let n = 0;
  for (const i of idx) if (map[i] < 0) map[i] = n++;
  const p = new Float64Array(n * 3), ex = extra.map(e => new e.constructor(n * (e.length / nv)));
  for (let i = 0; i < nv; i++) if (map[i] >= 0) {
    const j = map[i]; for (let k = 0; k < 3; k++) p[3 * j + k] = pos[3 * i + k];
    extra.forEach((e, q) => { const m = e.length / nv; for (let k = 0; k < m; k++) ex[q][m * j + k] = e[m * i + k]; });
  }
  return { pos: p, idx: Uint32Array.from(idx, i => map[i]), extra: ex };
}

/* ---- ritaglio con il piano n·p = d (resta n·p >= d) e chiusura della sezione ----
   La sezione è fatta di anelli concentrici (frazioni `ANELLI` della sezione, ridotti verso il baricentro) con vertici propri:
   `prof` (0 sul bordo → 1 al centro) dà il colore alla pagina (corticale/midollare per le ossa). Vertici ≥ nLato sono della sezione. */
const ANELLI = [1, 0.72, 0.45, 0.2];
export function ritaglia(pos, idx, n, d) {
  const nv = pos.length / 3, s = new Float64Array(nv);
  for (let i = 0; i < nv; i++) s[i] = n[0] * pos[3 * i] + n[1] * pos[3 * i + 1] + n[2] * pos[3 * i + 2] - d;
  const P = Array.from(pos), cache = new Map(), I = [], seg = new Map();
  const mk = (a, b) => {
    const k = a < b ? a + '_' + b : b + '_' + a; let v = cache.get(k); if (v !== undefined) return v;
    const t = s[a] / (s[a] - s[b]); v = P.length / 3;
    P.push(pos[3 * a] + (pos[3 * b] - pos[3 * a]) * t, pos[3 * a + 1] + (pos[3 * b + 1] - pos[3 * a + 1]) * t, pos[3 * a + 2] + (pos[3 * b + 2] - pos[3 * a + 2]) * t);
    cache.set(k, v); return v;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]], inn = v.map(q => s[q] >= 0), c = inn[0] + inn[1] + inn[2];
    if (c === 3) I.push(...v);
    else if (c === 1) { const k = inn.indexOf(true), A = v[k], B = v[(k + 1) % 3], C = v[(k + 2) % 3], p = mk(A, B), q = mk(C, A); I.push(A, p, q); seg.set(p, q); }
    else if (c === 2) { const k = inn.indexOf(false), C = v[k], A = v[(k + 1) % 3], B = v[(k + 2) % 3], p = mk(B, C), q = mk(C, A); I.push(A, B, p, A, p, q); seg.set(p, q); }
  }
  // anelli di bordo
  const loops = [], done = new Set();
  for (const st of seg.keys()) {
    if (done.has(st)) continue; const L = []; let c = st;
    while (c !== undefined && !done.has(c)) { done.add(c); L.push(c); c = seg.get(c); }
    if (c === st && L.length >= 3) loops.push(L);
  }
  const nLato = P.length / 3, prof = [], out = [-n[0], -n[1], -n[2]];
  const orienta = (a, b, c) => { // triangolo con la normale verso l'esterno della sezione
    const u = [0, 1, 2].map(k => P[3 * b + k] - P[3 * a + k]), w = [0, 1, 2].map(k => P[3 * c + k] - P[3 * a + k]);
    const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    return f[0] * out[0] + f[1] * out[1] + f[2] * out[2] >= 0 ? [a, b, c] : [a, c, b];
  };
  for (const L of loops) {
    const m = L.length, cen = [0, 0, 0]; for (const q of L) for (let k = 0; k < 3; k++) cen[k] += P[3 * q + k] / m;
    const rings = ANELLI.map((f, r) => L.map(q => {
      const id = P.length / 3; for (let k = 0; k < 3; k++) P.push(cen[k] + f * (P[3 * q + k] - cen[k])); prof[id - nLato] = 1 - f; return id;
    }));
    const ctr = P.length / 3; P.push(...cen); prof[ctr - nLato] = 1;
    for (let r = 0; r + 1 < rings.length; r++) for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, a = rings[r][i], b = rings[r][j], c = rings[r + 1][i], e = rings[r + 1][j];
      I.push(...orienta(a, b, c), ...orienta(b, e, c));
    }
    const last = rings[rings.length - 1]; for (let i = 0; i < m; i++) I.push(...orienta(last[i], last[(i + 1) % m], ctr));
  }
  // l'anello esterno della sezione coincide in posizione con il bordo del lato: stessi punti, vertici distinti (colore a parte)
  const { pos: p2, idx: i2, extra } = compatta(Float64Array.from(P), Uint32Array.from(I), [Float32Array.from({ length: P.length / 3 }, (_, i) => i >= nLato ? prof[i - nLato] : -1)]);
  let nL = 0; for (let i = 0; i < extra[0].length; i++) if (extra[0][i] < 0) nL++;
  // dopo compatta i vertici del lato restano prima di quelli della sezione (ordine conservato)
  return { pos: p2, idx: i2, sezione: extra[0], nLato: nL, anelli: loops.length };
}

/* ---- riduzione dei triangoli (quadriche, collasso di spigoli); `fissi` = vertici che non si toccano ---- */
export function riduci(pos, idx, target, fissi) {
  const nv = pos.length / 3; let nt = idx.length / 3; if (nt <= target) return { pos, idx, map: null };
  const P = Float64Array.from(pos), F = Uint32Array.from(idx), vivo = new Uint8Array(nt).fill(1), Q = new Float64Array(nv * 10);
  const vf = Array.from({ length: nv }, () => []);
  const pianoQ = (a, b, c, d, w) => [a * a * w, a * b * w, a * c * w, a * d * w, b * b * w, b * c * w, b * d * w, c * c * w, c * d * w, d * d * w];
  const nor = t => {
    const a = F[3 * t], b = F[3 * t + 1], c = F[3 * t + 2];
    const u = [P[3 * b] - P[3 * a], P[3 * b + 1] - P[3 * a + 1], P[3 * b + 2] - P[3 * a + 2]], w = [P[3 * c] - P[3 * a], P[3 * c + 1] - P[3 * a + 1], P[3 * c + 2] - P[3 * a + 2]];
    return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  };
  for (let t = 0; t < nt; t++) {
    const f = nor(t), A = Math.hypot(f[0], f[1], f[2]) / 2; if (A < 1e-14) continue;
    const a = f[0] / (2 * A), b = f[1] / (2 * A), c = f[2] / (2 * A), a0 = F[3 * t], d = -(a * P[3 * a0] + b * P[3 * a0 + 1] + c * P[3 * a0 + 2]);
    const q = pianoQ(a, b, c, d, A); for (let k = 0; k < 3; k++) { const v = F[3 * t + k]; for (let j = 0; j < 10; j++) Q[10 * v + j] += q[j]; vf[v].push(t); }
    for (let k = 0; k < 3; k++) vf[F[3 * t + k]].length;
  }
  // spigoli di bordo (usati una sola volta): piani di vincolo
  const ec = new Map(); for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const a = F[3 * t + k], b = F[3 * t + (k + 1) % 3], key = a < b ? a * nv + b : b * nv + a; ec.set(key, (ec.get(key) || 0) + 1); }
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
    const a = F[3 * t + k], b = F[3 * t + (k + 1) % 3], key = a < b ? a * nv + b : b * nv + a; if (ec.get(key) !== 1) continue;
    const f = nor(t), e = [P[3 * b] - P[3 * a], P[3 * b + 1] - P[3 * a + 1], P[3 * b + 2] - P[3 * a + 2]];
    let g = [f[1] * e[2] - f[2] * e[1], f[2] * e[0] - f[0] * e[2], f[0] * e[1] - f[1] * e[0]]; const l = Math.hypot(...g) || 1; g = g.map(x => x / l);
    const d = -(g[0] * P[3 * a] + g[1] * P[3 * a + 1] + g[2] * P[3 * a + 2]), q = pianoQ(g[0], g[1], g[2], d, 100 * (Math.hypot(...e) ** 2));
    for (const v of [a, b]) for (let j = 0; j < 10; j++) Q[10 * v + j] += q[j];
  }
  const err = (q, x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  const ver = new Uint32Array(nv), heap = [];
  const push = e => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].c <= heap[i].c) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l].c < heap[m].c) m = l; if (r < heap.length && heap[r].c < heap[m].c) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const candidato = (a, b) => {
    if (fissi && (fissi[a] || fissi[b])) return null;
    const q = new Float64Array(10); for (let j = 0; j < 10; j++) q[j] = Q[10 * a + j] + Q[10 * b + j];
    const cand = [[P[3 * a], P[3 * a + 1], P[3 * a + 2]], [P[3 * b], P[3 * b + 1], P[3 * b + 2]], [(P[3 * a] + P[3 * b]) / 2, (P[3 * a + 1] + P[3 * b + 1]) / 2, (P[3 * a + 2] + P[3 * b + 2]) / 2]];
    let best = null; for (const c of cand) { const e = err(q, ...c); if (!best || e < best.c) best = { c: e, p: c }; }
    return { c: best.c, p: best.p, a, b, va: ver[a], vb: ver[b] };
  };
  const vicini = v => { const s = new Set(); for (const t of vf[v]) if (vivo[t]) for (let k = 0; k < 3; k++) { const w = F[3 * t + k]; if (w !== v) s.add(w); } return s; };
  for (const key of ec.keys()) { const a = Math.floor(key / nv), b = key % nv, e = candidato(a, b); if (e) push(e); }
  while (nt > target && heap.length) {
    const e = pop(); if (ver[e.a] !== e.va || ver[e.b] !== e.vb) continue;
    const { a, b } = e; let ok = true;
    // controllo dei ribaltamenti
    for (const [v, other] of [[a, b], [b, a]]) {
      for (const t of vf[v]) { if (!vivo[t]) continue; const k0 = F[3 * t], k1 = F[3 * t + 1], k2 = F[3 * t + 2]; if (k0 === other || k1 === other || k2 === other) continue; if (k0 !== v && k1 !== v && k2 !== v) continue;
        const f0 = nor(t), sv = [P[3 * v], P[3 * v + 1], P[3 * v + 2]]; P[3 * v] = e.p[0]; P[3 * v + 1] = e.p[1]; P[3 * v + 2] = e.p[2]; const f1 = nor(t); P[3 * v] = sv[0]; P[3 * v + 1] = sv[1]; P[3 * v + 2] = sv[2];
        const l0 = Math.hypot(...f0), l1 = Math.hypot(...f1); if (l1 < 1e-14 * 0 || (f0[0] * f1[0] + f0[1] * f1[1] + f0[2] * f1[2]) < 0.2 * l0 * l1) { ok = false; break; } }
      if (!ok) break;
    }
    if (!ok) continue;
    P[3 * a] = e.p[0]; P[3 * a + 1] = e.p[1]; P[3 * a + 2] = e.p[2];
    for (let j = 0; j < 10; j++) Q[10 * a + j] += Q[10 * b + j];
    for (const t of vf[b]) { if (!vivo[t]) continue; let has = false, hb = false; for (let k = 0; k < 3; k++) { if (F[3 * t + k] === a) has = true; if (F[3 * t + k] === b) hb = true; }
      if (!hb) continue; if (has) { vivo[t] = 0; nt--; } else { for (let k = 0; k < 3; k++) if (F[3 * t + k] === b) F[3 * t + k] = a; vf[a].push(t); } }
    ver[a]++; ver[b]++;
    for (const w of vicini(a)) { const c = candidato(Math.min(a, w), Math.max(a, w)); if (c) push(c); }
  }
  const I2 = []; for (let t = 0; t < vivo.length; t++) if (vivo[t]) I2.push(F[3 * t], F[3 * t + 1], F[3 * t + 2]);
  return { pos: P, idx: Uint32Array.from(I2), map: true };
}

/* ---- normali di vertice ---- */
export function normali(pos, idx) {
  const nv = pos.length / 3, N = new Float64Array(nv * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const u = [0, 1, 2].map(k => pos[3 * b + k] - pos[3 * a + k]), w = [0, 1, 2].map(k => pos[3 * c + k] - pos[3 * a + k]);
    const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) N[3 * v + k] += f[k];
  }
  for (let i = 0; i < nv; i++) { const l = Math.hypot(N[3 * i], N[3 * i + 1], N[3 * i + 2]) || 1; for (let k = 0; k < 3; k++) N[3 * i + k] /= l; }
  return N;
}

/* ---- impacchettamento nel formato dei modelli: bpman (indice) + bpdat (binario; il file in assets/dati/ si scrive con scriviDati di lib-dati.mjs) ---- */
export function impacchetta(mesh) { // mesh: [{n, pos(cm), idx, tag?, fdir?, nrm?}]
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const m of mesh) for (let i = 0; i < m.pos.length; i++) { const k = i % 3; if (m.pos[i] < mn[k]) mn[k] = m.pos[i]; if (m.pos[i] > mx[k]) mx[k] = m.pos[i]; }
  for (let k = 0; k < 3; k++) { mn[k] = Math.floor(mn[k] * 100) / 100 - 0.02; mx[k] = Math.ceil(mx[k] * 100) / 100 + 0.02; }
  const parts = []; let len = 0;
  const push = b => { const pad = (4 - len % 4) % 4; if (pad) { parts.push(Buffer.alloc(pad)); len += pad; } const off = len; parts.push(b); len += b.length; return off; };
  const meshes = mesh.map(m => {
    const nv = m.pos.length / 3, i16 = nv < 65536, q = new Uint16Array(m.pos.length);
    for (let i = 0; i < q.length; i++) { const k = i % 3; q[i] = Math.round(clamp((m.pos[i] - mn[k]) / (mx[k] - mn[k]), 0, 1) * 65535); }
    const e = { n: m.n, nv, ni: m.idx.length, i16: i16 ? 1 : 0 };
    e.p = push(Buffer.from(q.buffer));
    if (m.tag) e.t = push(Buffer.from(Uint8Array.from(m.tag).buffer));
    if (m.fdir) e.d = push(Buffer.from(Int8Array.from(m.fdir).buffer));
    if (m.nrm) e.nm = push(Buffer.from(Int8Array.from(m.nrm).buffer));
    e.i = push(Buffer.from((i16 ? Uint16Array.from(m.idx) : Uint32Array.from(m.idx)).buffer));
    return e;
  });
  return { man: { min: mn, max: mx, meshes }, buf: Buffer.concat(parts) };
}

/* ---- ritaglio di una mesh con un campo scalare per vertice: resta s >= 0, sul bordo s = 0 (vertici nuovi per interpolazione).
   `attr`: array per vertice (stride k) da interpolare. Restituisce { pos, idx, s, attr, orig } con orig[i] = vertice di partenza (o -1 se nuovo). */
export function ritagliaCampo(pos, idx, s, attr = [], k = 3) {
  const nv = pos.length / 3, P = Array.from(pos), A = Array.from(attr), S = Array.from(s), orig = Array.from({ length: nv }, (_, i) => i), cache = new Map(), I = [];
  const mk = (a, b) => {
    const key = a < b ? a + '_' + b : b + '_' + a; let v = cache.get(key); if (v !== undefined) return v;
    const t = s[a] / (s[a] - s[b]); v = P.length / 3;
    for (let q = 0; q < 3; q++) P.push(pos[3 * a + q] + (pos[3 * b + q] - pos[3 * a + q]) * t);
    for (let q = 0; q < k && attr.length; q++) A.push(attr[k * a + q] + (attr[k * b + q] - attr[k * a + q]) * t);
    S.push(0); orig.push(-1); cache.set(key, v); return v;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]], inn = v.map(q => s[q] >= 0), c = inn[0] + inn[1] + inn[2];
    if (c === 3) I.push(...v);
    else if (c === 1) { const q = inn.indexOf(true), a = v[q], b = v[(q + 1) % 3], d = v[(q + 2) % 3]; I.push(a, mk(a, b), mk(d, a)); }
    else if (c === 2) { const q = inn.indexOf(false), d = v[q], a = v[(q + 1) % 3], b = v[(q + 2) % 3], p = mk(b, d), r = mk(d, a); I.push(a, b, p, a, p, r); }
  }
  const nvN = P.length / 3, ex = [Float64Array.from(S), Float64Array.from(A)];
  const c = compatta(Float64Array.from(P), Uint32Array.from(I), [ex[0], ex[1].length ? ex[1] : new Float64Array(nvN)]);
  const map = new Int32Array(nvN).fill(-1); let n = 0; for (const i of I) if (map[i] < 0) map[i] = n++;
  const og = new Int32Array(n); for (let i = 0; i < nvN; i++) if (map[i] >= 0) og[map[i]] = orig[i];
  return { pos: c.pos, idx: c.idx, s: c.extra[0], attr: attr.length ? c.extra[1] : null, orig: og };
}

/* ---- adiacenza dei vertici (liste di vicini) e diffusione di un campo ---- */
export function vicini(nv, idx) {
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  return nb.map(x => [...x]);
}
export function diffondi(f, nb, passate) {
  let a = Float64Array.from(f), b = new Float64Array(a.length);
  for (let p = 0; p < passate; p++) { for (let i = 0; i < a.length; i++) { const L = nb[i]; let s = 0; for (const j of L) s += a[j]; b[i] = L.length ? (a[i] + s / L.length) / 2 : a[i]; } [a, b] = [b, a]; }
  return a;
}

/* ---- una suddivisione a punti medi (ogni triangolo in 4); le posizioni nuove sono sul piano dei vecchi triangoli ---- */
export function suddividi(pos, idx) {
  const P = Array.from(pos), cache = new Map(), I = [];
  const mid = (a, b) => { const k = a < b ? a * 4294967296 + b : b * 4294967296 + a; let v = cache.get(k); if (v === undefined) { v = P.length / 3; for (let q = 0; q < 3; q++) P.push((pos[3 * a + q] + pos[3 * b + q]) / 2); cache.set(k, v); } return v; };
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); }
  return { pos: Float64Array.from(P), idx: Uint32Array.from(I) };
}

/* ---- smussatura di Taubin (non restringe la forma) ---- */
export function taubin(pos, I, iter) {
  const nv = pos.length / 3, NB = vicini(nv, I);
  for (let it = 0; it < iter; it++) {
    const lam = it % 2 ? -0.53 : 0.5, q = pos.slice();
    for (let i = 0; i < nv; i++) { const L = NB[i]; if (!L.length) continue; let x = 0, y = 0, z = 0; for (const j of L) { x += pos[3 * j]; y += pos[3 * j + 1]; z += pos[3 * j + 2]; }
      q[3 * i] += lam * (x / L.length - pos[3 * i]); q[3 * i + 1] += lam * (y / L.length - pos[3 * i + 1]); q[3 * i + 2] += lam * (z / L.length - pos[3 * i + 2]); }
    pos = q;
  }
  return pos;
}
