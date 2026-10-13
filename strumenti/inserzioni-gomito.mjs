/* Inserzioni distali di bicipite e brachiale (modelli/gomito-3d.html).

   Uso (dalla cartella del progetto):
     node strumenti/inserzioni-gomito.mjs                    → riscrive le mesh nel file del modello
     MODELLO=/tmp/copia.html node strumenti/inserzioni-gomito.mjs   → lavora su una copia
     node strumenti/inserzioni-gomito.mjs bic                → solo il bicipite (oppure: brach)
     node strumenti/inserzioni-gomito.mjs --verifica         → non scrive

   Problemi:
   - bicipite: il tendine distale si restringeva fino a 0,8 × 0,4 cm (area 0,3 cm²) tra y 0 e 1, poi invece di continuare a rastremarsi si allargava
     in un blocco di 1,2 × 2,1 cm (area fino a 1,3 cm²) che tra y −1,7 e −3 avvolgeva a mezzaluna il margine mediale del radio, entrandovi di 0,5 mm.
     In anatomia il tendine è un cordone appiattito che ruota e si inserisce sulla tuberosità radiale (versante mediale, cresta posteriore) con
     un'impronta ovale di ~2 × 0,7 cm (Mazzocca et al., Am J Sports Med 2007; Standring, Gray's Anatomy 42ª ed.).
   - brachiale: il tendine distale finiva con un margine squadrato a lembo e la faccia profonda non seguiva la superficie dell'ulna (coronoide e
     tuberosità ulnare): tra tendine e osso restavano fessure, e sembrava staccato.
   Metodo (ogni muscolo riparte dalla revisione `PARTENZA`, quindi lo strumento si può rilanciare):
   - bicipite: sotto y = `BIC.y[1]` il campo bersaglio è un cordone a sezione ellittica lungo una linea d'asse assegnata (`BIC.asse`: centro, semiassi
     e orientamento per y), che si rastrema e nell'ultimo tratto si appiattisce sulla faccia mediale del radio; raccordo con la forma di partenza tra
     `BIC.y[0]` e `BIC.y[1]`; dal campo si tolgono radio, ulna, brachiale, supinatore, pronatore rotondo, brachioradiale e i tubi della pagina a `GIOCO`
     (l'impronta resta appoggiata sull'osso). I triangoli della zona si dividono, i vertici vanno sul campo e si ridistribuiscono con passate di
     rilassamento tangenziale.
   - brachiale: sotto y = `BRA.y` la faccia profonda si porta sull'ulna (si riempiono le fessure fino a `BRA.riempi` dall'osso, solo sotto il muscolo),
     lo spessore resta entro `BRA.spessore(y)` dall'osso e l'estremità distale si arrotonda (levigatura `BRA.sigma`); osso e capsula restano a `GIOCO`.
   Va lanciato dopo `muscoli-gomito.mjs` e `estremo-braccio-gomito.mjs`. Se si rilanciano quelli, rilanciare poi anche questo con `PARTENZA` aggiornata
   alla revisione appena prima di questo strumento. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
const { clamp, sstep, log, repack, saveFile, realDaRevisione, setMesh, sample, proietta } = G;

const PARTENZA = '4b57a99';                 // revisione con le mesh di partenza (prima di questo strumento)
const FILE_REPO = 'modelli/gomito-3d.html';
const H = 0.04;                             // cm, passo della griglia
const GIOCO = { bic: 0.05, brach: 0.08, osso: 0.035 };   // cm, distanza dagli ostacoli (campo levigato con raccordo: lo scarto reale è ~0,5 mm minore)

// bicipite: linea d'asse del tendine per y (cm): centro (x, z), semiassi a (largo) e b (spesso), angolo dell'asse largo nel piano x-z (gradi da +x)
const BIC = {
  y: [0.6, 1.3],                            // sopra y[1] forma di partenza, sotto y[0] cordone; raccordo tra i due
  fine: -2.95,                              // estremità distale (calotta arrotondata negli ultimi `calotta` cm)
  calotta: 0.35,
  asse: [
    // y      x      z     a     b    angolo
    [1.6, -0.52, 2.52, 0.445, 0.24, 5],
    [1.0, -0.62, 2.49, 0.415, 0.22, 6],
    [0.5, -0.72, 2.33, 0.40, 0.23, 4],
    [0.0, -0.88, 2.00, 0.39, 0.23, 2],
    [-0.5, -1.08, 1.86, 0.38, 0.225, 0],
    [-1.0, -1.25, 1.78, 0.37, 0.215, 10],
    [-1.5, -1.36, 1.60, 0.37, 0.20, 40],
    [-2.0, -1.36, 1.36, 0.39, 0.18, 70],
    [-2.5, -1.30, 1.10, 0.41, 0.17, 88],
    [-3.0, -1.28, 0.92, 0.40, 0.16, 92],
  ],
  ostacoli: ['radio', 'ulna', 'brach', 'sup', 'pt', 'br', 'omero'],
  lato: 0.13,                               // cm, lato massimo dei triangoli nella zona
  rilassa: 40,
};
// brachiale
const BRA = {
  y: 0.2,                                   // sotto questa y si rifà la parte distale (raccordo fino a y + 0,6)
  riempi: 0.25,                             // cm: fessure tra faccia profonda e ulna riempite fino a questa distanza dall'osso
  vicino: 0.3,                              // ... solo dove il muscolo è entro questa distanza (cioè sotto il muscolo)
  spessore: y => 0.25 + 0.75 * sstep(-3.0, -0.6, y),   // cm, spessore massimo dall'osso
  sigma: 0.26,                              // cm, levigatura dell'estremità
  tendine: [-0.4, -2.0, 0.3],               // tag: muscolo da y[0], tendine pieno a y[1], frastagliatura (cm)
  ossa: ['ulna', 'radio', 'omero'],
  ostacoli: ['bic', 'pt', 'br', 'sup', 'caps'],
  passo: 0.08,                              // cm, griglia della superficie nuova
  liscia: { sigma: 0.22, y: [5.0, 6.8], riduci: 0.05, ostSigma: 0.12 },   // levigatura del ventre (sotto y[0] piena, sfumata fino a y[1]), riduzione dello spessore (cm), levigatura degli ostacoli
};

const argv = process.argv.slice(2);
const VERIFICA = argv.includes('--verifica');
const DA_FARE = ['bic', 'brach'].filter(m => argv.includes(m)).length ? ['bic', 'brach'].filter(m => argv.includes(m)) : ['bic', 'brach'];

/* ============ Utilità ============ */
const tagMedio = (a, b) => a >= 250 && b >= 250 ? a : a >= 250 ? b : b >= 250 ? a : Math.round((a + b) / 2);
function suddividi(m, inZona, lato) {
  let pos = Array.from(m.pos), idx = Array.from(m.idx), tag = m.tag ? Array.from(m.tag) : null, fdir = Array.from(m.fdir);
  const L = (a, b) => Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]), key = (a, b) => a < b ? a * 1e7 + b : b * 1e7 + a;
  for (let passata = 0; passata < 10; passata++) {
    const mark = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(i => inZona(pos[3 * i + 1]))) continue;
      const e = [[T[0], T[1]], [T[1], T[2]], [T[2], T[0]]], l = e.map(([a, b]) => L(a, b)), k = l.indexOf(Math.max(...l));
      if (l[k] > lato) mark.add(key(...e[k]));
    }
    if (!mark.size) break;
    const mid = new Map(), out = [];
    const midV = (a, b) => {
      const k = key(a, b); if (mid.has(k)) return mid.get(k);
      const n = pos.length / 3; for (let c = 0; c < 3; c++) { pos.push((pos[3 * a + c] + pos[3 * b + c]) / 2); fdir.push(Math.round((fdir[3 * a + c] + fdir[3 * b + c]) / 2)); }
      if (tag) tag.push(tagMedio(tag[a], tag[b])); mid.set(k, n); return n;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const T = [idx[t], idx[t + 1], idx[t + 2]], e = [[T[0], T[1]], [T[1], T[2]], [T[2], T[0]]], mk = e.map(([a, b]) => mark.has(key(a, b))), n = mk.filter(Boolean).length;
      if (!n) { out.push(...T); continue; }
      if (n === 3) { const [m0, m1, m2] = e.map(([a, b]) => midV(a, b)); out.push(T[0], m0, m2, m0, T[1], m1, m2, m1, T[2], m0, m1, m2); continue; }
      const r = mk.indexOf(true), A = T[r], B = T[(r + 1) % 3], C = T[(r + 2) % 3], mAB = midV(A, B);
      if (n === 1) { out.push(A, mAB, C, mAB, B, C); continue; }
      if (mk[(r + 1) % 3]) { const mBC = midV(B, C); out.push(A, mAB, C, mAB, B, mBC, mAB, mBC, C); } else { const mCA = midV(C, A); out.push(A, mAB, mCA, mAB, B, C, mAB, C, mCA); }
    }
    idx = out;
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: tag && Uint8Array.from(tag), fdir: Int8Array.from(fdir) };
}
function gauss3d(A, s) {
  const { NX, NY, NZ, NXY } = G, R = Math.ceil(3 * s), K = Float32Array.from({ length: 2 * R + 1 }, (_, q) => Math.exp(-((q - R) ** 2) / (2 * s * s)));
  const S = K.reduce((a, b) => a + b, 0); for (let q = 0; q < K.length; q++) K[q] /= S;
  let src = A, dst = new Float32Array(A.length);
  for (const [st, n] of [[1, NX], [NX, NY], [NXY, NZ]]) {
    for (let i = 0; i < A.length; i++) { const c = ((i / st) | 0) % n; let v = 0; for (let q = -R; q <= R; q++) { const cc = clamp(c + q, 0, n - 1); v += K[q + R] * src[i + (cc - c) * st]; } dst[i] = v; }
    [src, dst] = [dst, src];
  }
  return src;
}
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k / 4; };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };
// solido dei tubi procedurali (nervi e vasi) nella griglia corrente
function tubi() {
  const { NX, NY, NZ } = G, Ob = new Uint8Array(G.N);
  for (const t of Object.keys(NVP.pts)) {
    const P = NVP.pts[t], r = NVP.r[t];
    for (let q = 0; q + 1 < P.length; q++) {
      const a = P[q], b = P[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / 0.02));
      for (let u = 0; u <= n; u++) {
        const c = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * u / n);
        const lo = [0, 1, 2].map(k => Math.max(0, Math.floor((c[k] - r - G.O[k]) / G.H))), hi = [0, 1, 2].map((k, _, __, nn = [NX, NY, NZ][k]) => Math.min(nn - 1, Math.ceil((c[k] + r - G.O[k]) / G.H)));
        for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++)
          if (Math.hypot(G.O[0] + (i + 0.5) * G.H - c[0], G.O[1] + (j + 0.5) * G.H - c[1], G.O[2] + (k + 0.5) * G.H - c[2]) <= r) Ob[G.vi(i, j, k)] = 1;
      }
    }
  }
  return Ob;
}
// vertici sul campo `f` (peso p(y): 0 = fermo), poi rilassamento tangenziale con ritorno sul campo; triangoli rivolti verso il gradiente
function proiettaRilassa(m, f, peso, passate) {
  const nv = m.pos.length / 3, pos = Float32Array.from(m.pos);
  for (let i = 0; i < nv; i++) {
    const w = peso(pos[3 * i + 1]); if (w <= 0) continue;
    const v = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], t = proietta(f, v, 0, 30);
    for (let c = 0; c < 3; c++) pos[3 * i + c] = v[c] + (t[c] - v[c]) * w;
  }
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = m.idx[t + e], b = m.idx[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  for (let r = 0; r < passate; r++) {
    const q = Float32Array.from(pos);
    for (let i = 0; i < nv; i++) {
      const w = peso(pos[3 * i + 1]); if (w <= 0 || !nb[i].size) continue;
      let x = 0, y = 0, z = 0; for (const j of nb[i]) { x += pos[3 * j]; y += pos[3 * j + 1]; z += pos[3 * j + 2]; }
      const n = nb[i].size, a = 0.5 * w, t = proietta(f, [pos[3 * i] + a * (x / n - pos[3 * i]), pos[3 * i + 1] + a * (y / n - pos[3 * i + 1]), pos[3 * i + 2] + a * (z / n - pos[3 * i + 2])], 0, 8);
      q[3 * i] = t[0]; q[3 * i + 1] = t[1]; q[3 * i + 2] = t[2];
    }
    pos.set(q);
  }
  const gr = p => [0, 1, 2].map(k => { const e = 0.03, a = p.slice(), b = p.slice(); a[k] += e; b[k] -= e; return f(a) - f(b); });
  const idx = Uint32Array.from(m.idx); let rov = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(q => [pos[3 * q], pos[3 * q + 1], pos[3 * q + 2]]);
    const yc = (a[1] + b[1] + c[1]) / 3; if (peso(yc) <= 0) continue;
    const u = [0, 1, 2].map(k => b[k] - a[k]), v = [0, 1, 2].map(k => c[k] - a[k]), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const g = gr([0, 1, 2].map(k => (a[k] + b[k] + c[k]) / 3));
    if (n[0] * g[0] + n[1] * g[1] + n[2] * g[2] < 0) { rov++; const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  }
  return { pos, idx, rov };
}
function ostacoli(nomi, conTubi, sigma = 0.06) {
  const Ob = conTubi ? tubi() : new Uint8Array(G.N);
  for (const n of nomi) G.or(Ob, G.solid(n));
  return gauss3d(G.sdf(Ob).F, sigma / G.H);                        // levigato: niente creste a gradini dove il muscolo tocca l'ostacolo
}
function bbox(pos, filtro) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) if (filtro(pos[i + 1])) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
  return { lo, hi };
}

/* ============ Bicipite ============ */
function asse(y) {
  const A = BIC.asse; if (y >= A[0][0]) return A[0].slice(1);
  for (let q = 1; q < A.length; q++) if (y >= A[q][0]) { const t = (y - A[q - 1][0]) / (A[q][0] - A[q - 1][0]); return A[q - 1].slice(1).map((v, k) => v + (A[q][k + 1] - v) * t); }
  return A[A.length - 1].slice(1);
}
function bicipite() {
  const p0 = realDaRevisione(PARTENZA, 'bic', FILE_REPO);
  const m = suddividi({ pos: Float32Array.from(p0.pos), idx: p0.idx, tag: p0.tag, fdir: p0.fdir }, y => y < BIC.y[1] + 0.2, BIC.lato);
  setMesh('bic', m);
  const { lo, hi } = bbox(m.pos, y => y < BIC.y[1] + 0.8); lo[1] = Math.min(lo[1], BIC.fine) - 0.3;
  G.griglia(lo, hi, H, 0.5);
  const { NX, NY, NZ } = G;
  const { F: F0 } = G.sdf(G.solid('bic')); G.sfoca(F0, 1);
  // cordone: distanza (approssimata) dall'ellisse della sezione, con calotta all'estremità
  const T = new Float32Array(G.N);
  for (let j = 0; j < NY; j++) {
    const y = G.O[1] + (j + 0.5) * G.H, [cx, cz, a0, b0, ang] = asse(y), th = ang * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
    const e = clamp((y - BIC.fine) / BIC.calotta, 0, 1), k = Math.sqrt(1 - (1 - e) ** 2), a = a0 * Math.max(k, 0.02), b = b0 * Math.max(k, 0.02);
    for (let kk = 0; kk < NZ; kk++) for (let i = 0; i < NX; i++) {
      const dx = G.O[0] + (i + 0.5) * G.H - cx, dz = G.O[2] + (kk + 0.5) * G.H - cz, u = dx * c + dz * s, v = -dx * s + dz * c;
      let d = (Math.hypot(u / a, v / b) - 1) * Math.min(a, b);
      if (y < BIC.fine) d = Math.max(d, BIC.fine - y);
      T[G.vi(i, j, kk)] = d;
    }
  }
  const Ts = gauss3d(T, 0.06 / G.H);
  const F = new Float32Array(G.N);
  for (let j = 0; j < NY; j++) {
    const y = G.O[1] + (j + 0.5) * G.H, w = sstep(BIC.y[0], BIC.y[1], y);
    for (let kk = 0; kk < NZ; kk++) for (let i = 0; i < NX; i++) { const q = G.vi(i, j, kk); F[q] = w * F0[q] + (1 - w) * Ts[q]; }
  }
  const Fo = ostacoli(BIC.ostacoli, true);
  for (let q = 0; q < G.N; q++) F[q] = smax(F[q], GIOCO.bic - Fo[q], 0.06);
  const f = p => sample(F, p[0], p[1], p[2]);
  const peso = y => 1 - sstep(BIC.y[0], BIC.y[1] + 0.1, y);
  const r = proiettaRilassa(m, f, peso, BIC.rilassa);
  // sotto y[0] tutto tendine
  const tag = Uint8Array.from(m.tag); for (let i = 0; i < tag.length; i++) if (tag[i] < 250 && r.pos[3 * i + 1] < BIC.y[1]) tag[i] = Math.max(tag[i], Math.round(200 * (1 - sstep(BIC.y[0] - 0.4, BIC.y[1], r.pos[3 * i + 1])) + tag[i] * sstep(BIC.y[0] - 0.4, BIC.y[1], r.pos[3 * i + 1])));
  log(`bic       vertici ${p0.pos.length / 3} → ${r.pos.length / 3}, triangoli rimessi nel verso giusto ${r.rov}`);
  return { pos: r.pos, idx: r.idx, tag, fdir: m.fdir };
}

/* ============ Brachiale ============ */
function brachiale() {
  const p0 = realDaRevisione(PARTENZA, 'brach', FILE_REPO);
  const m = { pos: Float32Array.from(p0.pos), idx: p0.idx, tag: p0.tag, fdir: p0.fdir };
  setMesh('brach', m);
  const { lo, hi } = bbox(m.pos, () => true);
  G.griglia(lo, hi, BRA.passo, 0.3);
  const { NX, NY, NZ } = G;
  const { F: F0 } = G.sdf(G.solid('brach')); G.sfoca(F0, 1);
  const Mo = new Uint8Array(G.N); for (const n of BRA.ossa) G.or(Mo, G.solid(n));
  const { F: Fu } = G.sdf(Mo);
  const F1 = new Float32Array(G.N);
  for (let j = 0; j < NY; j++) {
    const y = G.O[1] + (j + 0.5) * G.H, sp = BRA.spessore(y);
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const q = G.vi(i, j, k);
      let f = smin(F0[q], Math.max(Fu[q] - BRA.riempi, F0[q] - BRA.vicino), 0.08);   // fessure verso l'osso riempite
      F1[q] = Math.max(f, Fu[q] - sp);                                                 // spessore massimo dall'osso
    }
  }
  const F1s = gauss3d(F1, BRA.sigma / G.H);
  const F = new Float32Array(G.N);
  for (let j = 0; j < NY; j++) {
    const y = G.O[1] + (j + 0.5) * G.H, w = sstep(BRA.y, BRA.y + 0.6, y);
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const q = G.vi(i, j, k); F[q] = w * F0[q] + (1 - w) * F1s[q]; }
  }
  // ventre muscolare: superficie levigata (le creste e i solchi a gradini della mesh di partenza e gli intagli dei vasi) e leggermente assottigliata
  { const L = BRA.liscia, Fs = gauss3d(F, L.sigma / G.H);
    for (let j = 0; j < NY; j++) {
      const y = G.O[1] + (j + 0.5) * G.H, w = 1 - sstep(L.y[0], L.y[1], y);
      if (w > 0) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const q = G.vi(i, j, k); F[q] = (1 - w) * F[q] + w * (Fs[q] + L.riduci); }
    } }
  const Fo = ostacoli(BRA.ostacoli, true, BRA.liscia.ostSigma), Fb = gauss3d(Fu, 0.06 / G.H);   // strutture vicine e ossa (all'osso il tendine resta più aderente)
  for (let j = 0; j < NY; j++) {
    const y = G.O[1] + (j + 0.5) * G.H, w = 1;   // ostacoli ovunque: anche la superficie ricampionata sopra la zona rifatta non deve entrare nelle strutture vicine
    if (w > 0) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const q = G.vi(i, j, k); F[q] = smax(smax(F[q], w * (GIOCO.brach - Fo[q]) + (1 - w) * -1, 0.06), GIOCO.osso - Fb[q], 0.04); }
  }
  // superficie nuova (surface nets), solo la componente principale; tag e fibre dal vertice di partenza più vicino
  const cella = 0.25, hash = new Map(), ch = (x, y, z) => `${Math.floor(x / cella)},${Math.floor(y / cella)},${Math.floor(z / cella)}`;
  for (let i = 0; i < m.pos.length / 3; i++) { const c = ch(m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]); if (!hash.has(c)) hash.set(c, []); hash.get(c).push(i); }
  const vicino = p => {
    let best = 0, bd = Infinity; const [cx, cy, cz] = p.map(v => Math.floor(v / cella));
    for (let r = 1; r <= 6 && bd === Infinity; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) for (const i of hash.get(`${cx + a},${cy + b},${cz + c}`) || []) {
      const d = (m.pos[3 * i] - p[0]) ** 2 + (m.pos[3 * i + 1] - p[1]) ** 2 + (m.pos[3 * i + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const out = G.nets(F, p => { const i = vicino(p); return [m.fdir[3 * i], m.fdir[3 * i + 1], m.fdir[3 * i + 2]]; });
  const r = componentePrincipale(out);
  const tag = new Uint8Array(r.pos.length / 3);
  // tag: sezione di taglio (≥ 250) dal vertice più vicino; sotto y = BRA.tendine[0] passaggio muscolo → tendine sfumato e frastagliato lungo le fibre
  const rum = (x, z) => Math.sin(x * 9.1 + z * 2.3) * 0.5 + Math.sin(x * 17.3 - z * 5.1 + 1.7) * 0.3 + Math.sin(x * 31.7 + z * 3.4 + 4.2) * 0.2;
  for (let i = 0; i < tag.length; i++) {
    const x = r.pos[3 * i], y = r.pos[3 * i + 1], z = r.pos[3 * i + 2], t0 = m.tag[vicino([x, y, z])];
    if (t0 >= 250) { tag[i] = t0; continue; }
    const w = sstep(BRA.tendine[0], BRA.tendine[1], y + BRA.tendine[2] * rum(x, z));
    tag[i] = y > BRA.tendine[0] + 0.5 ? t0 : Math.round(200 * Math.pow(w, 1.4));
  }
  log(`brach     vertici ${m.pos.length / 3} → ${r.pos.length / 3} (surface nets, passo ${BRA.passo * 10} mm)`);
  return { pos: r.pos, idx: r.idx, tag, fdir: r.fdir };
}
function componentePrincipale(o) {
  const nv = o.pos.length / 3, par = Int32Array.from({ length: nv }, (_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < o.idx.length; t += 3) { const a = f(o.idx[t]), b = f(o.idx[t + 1]), c = f(o.idx[t + 2]); par[b] = a; par[f(c)] = a; }
  const cnt = new Map(); for (let i = 0; i < nv; i++) { const r = f(i); cnt.set(r, (cnt.get(r) || 0) + 1); }
  let top = -1, mx = 0; for (const [r, c] of cnt) if (c > mx) { mx = c; top = r; }
  const map = new Int32Array(nv).fill(-1), P = [], D = [], I = [];
  for (let i = 0; i < nv; i++) if (f(i) === top) { map[i] = P.length / 3; P.push(o.pos[3 * i], o.pos[3 * i + 1], o.pos[3 * i + 2]); D.push(o.fdir[3 * i], o.fdir[3 * i + 1], o.fdir[3 * i + 2]); }
  for (let t = 0; t < o.idx.length; t += 3) if (map[o.idx[t]] >= 0) I.push(map[o.idx[t]], map[o.idx[t + 1]], map[o.idx[t + 2]]);
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I), fdir: Int8Array.from(D) };
}

// entrambi ripartono da `PARTENZA` anche come ostacoli (il bicipite vede il brachiale di partenza): il risultato non dipende dal file attuale
for (const id of ['bic', 'brach']) { const p = realDaRevisione(PARTENZA, id, FILE_REPO); setMesh(id, { pos: Float32Array.from(p.pos), idx: p.idx, tag: p.tag, fdir: p.fdir }); }
for (const id of DA_FARE) { const r = id === 'bic' ? bicipite() : brachiale(); setMesh(id, r); }
if (!VERIFICA) saveFile(repack());
