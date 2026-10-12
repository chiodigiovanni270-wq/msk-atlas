/* Estremo prossimale dei muscoli del braccio (modelli/gomito-3d.html): bicipite e capi del tricipite al piano di taglio y = 12 cm.

   Uso (dalla cartella del progetto):
     node strumenti/estremo-braccio-gomito.mjs                    → riscrive le mesh nel file del modello
     MODELLO=/tmp/copia.html node strumenti/estremo-braccio-gomito.mjs   → lavora su una copia
     node strumenti/estremo-braccio-gomito.mjs bic tri_lat        → solo alcuni muscoli

   Problema: le mesh BodyParts3D di bicipite e tricipite continuavano oltre il taglio; i vertici sopra y = 12 erano stati portati sul piano.
   Fino a y ≈ 11,8 la sezione è liscia, ma nell'ultimo mezzo centimetro il margine diventa a dente di sega (vertici schiacciati da
   posizioni diverse), con spigoli e punte; più in basso (y ≈ 10–11,6) restano code sottili e uncini (coda del capo corto del bicipite,
   punta del capo laterale del tricipite) che sporgono lateralmente con margini netti.
   Metodo (ogni muscolo riparte dalla revisione `PARTENZA`, quindi lo strumento si può rilanciare):
   1. campo di distanza della mesh di partenza (`F0`) e della sezione di riferimento a y = `Y0` (liscia in tutti e quattro i muscoli),
      estrusa lungo y e levigata nel piano con una gaussiana (`SIGMA`: tolgono code e uncini più sottili di ~2·SIGMA e arrotondano gli angoli);
   2. campo bersaglio: da `RAMPA[0]` a `RAMPA[1]` si passa gradualmente da `F0` alla sezione levigata, poi un'unica sezione fino al taglio, chiuso
      sul piano y = `TAGLIO` con un raccordo `RACCORDO` (spigolo del taglio appena smussato);
   3. dal bersaglio si tolgono gli ostacoli (`OSTACOLI`: omero, brachiale, brachioradiale, i tubi di vasi e nervi e i muscoli già rifatti,
      a distanza `GIOCO`): lo smussamento non deve portare il muscolo dentro di loro;
   4. nella zona sopra `ZONA` i triangoli si dividono (lati ≤ `LATO`, con tag e fibre interpolati) e i vertici vengono portati sul bersaglio con peso
      crescente in y (invariati sotto `ZONA`); qualche passata di rilassamento tangenziale, sempre riproiettando sul bersaglio, riordina i vertici.
   Cambiano solo le posizioni sopra `ZONA` (e la suddivisione dei triangoli lì): tag e direzione delle fibre restano quelli dei vertici di partenza.
   Va lanciato dopo `legamenti-gomito.mjs` e `muscoli-gomito.mjs` (che riscrivono tricipite mediale e bicipite). `--verifica` non scrive. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);   // tubi procedurali della pagina (nervi e vasi)
const { clamp, sstep, log, repack, saveFile, realDaRevisione, setMesh, sample, proietta } = G;

const PARTENZA = 'e106e55';                 // revisione con le mesh di partenza (prima di questo strumento)
const FILE_REPO = 'modelli/gomito-3d.html';
const MUSCOLI = ['bic', 'tri_lungo', 'tri_med', 'tri_lat'];
const TAGLIO = 12.0;                        // piano di taglio (cm)
const Y0 = 11.0;                            // sezione di riferimento (liscia)
const RAMPA = [9.6, 11.2];                 // dal campo originale alla sezione levigata
const SIGMA = 0.32;                         // cm, levigatura della sezione nel piano
const RACCORDO = 0.10;                      // cm, raggio dello spigolo al piano di taglio
const ZONA = 9.2;                           // sopra questa y i vertici si portano sul bersaglio (peso da 0 a 1 in `PESO`)
const PESO = [9.2, 10.2];
const LATO = 0.18;                          // cm, lato massimo dei triangoli nella zona
const RILASSA = 25;                         // passate di rilassamento tangenziale
const H = 0.04;                             // cm, passo della griglia dei campi
const OSTACOLI = ['omero', 'brach', 'br'];  // mesh che il muscolo non deve attraversare (più tutti i tubi della pagina nella zona)
const GIOCO = 0.03;                         // cm, distanza dagli ostacoli
const INCASSO = 0.09;                       // cm: un ostacolo già dentro il muscolo di partenza di oltre tanto non viene scavato

const argv = process.argv.slice(2);
const scelti = MUSCOLI.filter(m => argv.includes(m)), DA_FARE = scelti.length ? scelti : MUSCOLI;
const VERIFICA = argv.includes('--verifica');

/* ============ Suddivisione dei triangoli nella zona ============ */
// tag 250 = sezione di taglio (colore piatto), 251 = sezione del tendine, altri valori = gradiente muscolo → tendine (0–200):
// tra una sezione e un altro valore non si interpola (darebbe un tendine bianco al margine); la sezione si riassegna poi dalla normale
const tagMedio = (a, b) => a >= 250 && b >= 250 ? a : a >= 250 ? b : b >= 250 ? a : Math.round((a + b) / 2);
function suddividi(m) {
  let pos = Array.from(m.pos), idx = Array.from(m.idx), tag = m.tag ? Array.from(m.tag) : null, fdir = Array.from(m.fdir);
  const L = (a, b) => Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);
  const inZona = i => pos[3 * i + 1] > ZONA, key = (a, b) => a < b ? a * 1e7 + b : b * 1e7 + a;
  for (let passata = 0; passata < 10; passata++) {
    const mark = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(inZona)) continue;
      const e = [[T[0], T[1]], [T[1], T[2]], [T[2], T[0]]], l = e.map(([a, b]) => L(a, b)), k = l.indexOf(Math.max(...l));
      if (l[k] > LATO) mark.add(key(...e[k]));
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

/* ============ Campi ============ */
// levigatura gaussiana (separabile) di un campo 2D n0 × n1
function gauss2d(A, n0, n1, sigmaCelle) {
  const R = Math.ceil(3 * sigmaCelle), K = Array.from({ length: 2 * R + 1 }, (_, q) => Math.exp(-((q - R) ** 2) / (2 * sigmaCelle ** 2))), S = K.reduce((a, b) => a + b, 0);
  const passo = (src, dst, n, st, m, sm) => { for (let b = 0; b < m; b++) for (let a = 0; a < n; a++) { let s = 0; for (let q = -R; q <= R; q++) { const c = clamp(a + q, 0, n - 1); s += K[q + R] * src[b * sm + c * st]; } dst[b * sm + a * st] = s / S; } };
  const B = new Float32Array(A.length), C = new Float32Array(A.length);
  passo(A, B, n0, 1, n1, n0); passo(B, C, n1, n0, n0, 1);
  return C;
}
// smax polinomiale (raccordo di raggio k)
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k / 4; };

const finiti = [];                          // muscoli già rifatti: ostacoli per i successivi (restano distinti, senza sovrapposizioni)
function campoBersaglio(id, m) {
  setMesh(id, { pos: m.pos, idx: m.idx, tag: m.tag, fdir: m.fdir });
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.pos[i + k]); hi[k] = Math.max(hi[k], m.pos[i + k]); }
  lo[1] = RAMPA[0] - 0.6; hi[1] = TAGLIO + 0.4;
  G.griglia(lo, hi, H, 0.6);
  const { NX, NY, NZ, NXY } = G;
  // solido: si usa solo sotto il piano della sezione di riferimento (sopra la mesh è stata schiacciata sul piano)
  const M = G.solid(id);
  const j0 = Math.round((Y0 - G.O[1]) / G.H - 0.5);
  const S0 = new Uint8Array(G.N);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const v = M[G.vi(i, j0, k)]; for (let j = 0; j < NY; j++) S0[G.vi(i, j, k)] = v; }
  const { F: Fp } = G.sdf(S0);                                     // prisma della sezione di riferimento
  const D = new Float32Array(NX * NZ); for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) D[i + NX * k] = Fp[G.vi(i, j0, k)];
  const Dl = gauss2d(D, NX, NZ, SIGMA / G.H);
  const { F: F0 } = G.sdf(M); G.sfoca(F0, 1);
  const F = new Float32Array(G.N);
  for (let j = 0; j < NY; j++) {
    const y = G.O[1] + (j + 0.5) * G.H, w = sstep(RAMPA[0], RAMPA[1], y);
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const q = G.vi(i, j, k), prisma = Dl[i + NX * k];
      F[q] = smax(w >= 1 ? prisma : (1 - w) * F0[q] + w * prisma, y - TAGLIO, RACCORDO);
    }
  }
  // ostacoli: mesh e tubi vicini, il muscolo resta a GIOCO di distanza
  const Ob = new Uint8Array(G.N);
  for (const nome of OSTACOLI.concat(finiti)) if (nome !== id) G.or(Ob, G.solid(nome));
  for (const t of Object.keys(NVP.pts)) {
    const P = NVP.pts[t], r = NVP.r[t];
    for (let q = 0; q + 1 < P.length; q++) {
      const a = P[q], b = P[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / 0.02));
      for (let u = 0; u <= n; u++) {
        const c = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * u / n);
        if (c[1] < G.O[1] - r || c[1] > G.O[1] + NY * G.H + r) continue;
        const i0 = Math.max(0, Math.floor((c[0] - r - G.O[0]) / G.H)), i1 = Math.min(NX - 1, Math.ceil((c[0] + r - G.O[0]) / G.H));
        const j0 = Math.max(0, Math.floor((c[1] - r - G.O[1]) / G.H)), j1 = Math.min(NY - 1, Math.ceil((c[1] + r - G.O[1]) / G.H));
        const k0 = Math.max(0, Math.floor((c[2] - r - G.O[2]) / G.H)), k1 = Math.min(NZ - 1, Math.ceil((c[2] + r - G.O[2]) / G.H));
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          if (Math.hypot(G.O[0] + (i + 0.5) * G.H - c[0], G.O[1] + (j + 0.5) * G.H - c[1], G.O[2] + (k + 0.5) * G.H - c[2]) <= r) Ob[G.vi(i, j, k)] = 1;
        }
      }
    }
  }
  // dove un ostacolo era già dentro il muscolo di partenza (es. vena basilica nel capo mediale) non si scava: ritaglio sgualcito e senza senso
  const dentroOrig = new Uint8Array(G.N);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) dentroOrig[G.vi(i, j, k)] = j <= j0 ? M[G.vi(i, j, k)] : S0[G.vi(i, j, k)];
  const { F: Fd } = G.sdf(dentroOrig);
  for (let q = 0; q < G.N; q++) if (Ob[q] && Fd[q] < -INCASSO) Ob[q] = 0;
  const { F: Fo } = G.sdf(Ob);
  for (let q = 0; q < G.N; q++) F[q] = Math.max(F[q], GIOCO - Fo[q]);
  return F;
}

/* ============ Muscolo ============ */
function muscolo(id) {
  const p0 = realDaRevisione(PARTENZA, id, FILE_REPO);
  const m = suddividi({ pos: Float32Array.from(p0.pos), idx: p0.idx, tag: p0.tag, fdir: p0.fdir });
  const nv = m.pos.length / 3;
  const F = campoBersaglio(id, m);
  const f = p => sample(F, p[0], p[1], p[2]);
  const peso = new Float32Array(nv); for (let i = 0; i < nv; i++) peso[i] = sstep(PESO[0], PESO[1], m.pos[3 * i + 1]);
  const pos = Float32Array.from(m.pos);
  const sposta = (i, q, w) => { for (let c = 0; c < 3; c++) pos[3 * i + c] += w * (q[c] - pos[3 * i + c]); };
  for (let i = 0; i < nv; i++) if (peso[i] > 0) sposta(i, proietta(f, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], 0, 24), peso[i]);
  // rilassamento tangenziale: media dei vicini e ritorno sul bersaglio
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = m.idx[t + e], b = m.idx[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  for (let r = 0; r < RILASSA; r++) {
    const q = Float32Array.from(pos);
    for (let i = 0; i < nv; i++) if (peso[i] > 0 && nb[i].size) {
      let x = 0, y = 0, z = 0; for (const j of nb[i]) { x += pos[3 * j]; y += pos[3 * j + 1]; z += pos[3 * j + 2]; }
      const n = nb[i].size, a = 0.5 * peso[i];
      const t = proietta(f, [pos[3 * i] + a * (x / n - pos[3 * i]), pos[3 * i + 1] + a * (y / n - pos[3 * i + 1]), pos[3 * i + 2] + a * (z / n - pos[3 * i + 2])], 0, 6);
      q[3 * i] = t[0]; q[3 * i + 1] = t[1]; q[3 * i + 2] = t[2];
    }
    pos.set(q);
  }
  // normali dal bersaglio: tag di sezione sulle facce rivolte verso l'alto, triangoli rovesciati rimessi nel verso giusto
  const gradP = p => [0, 1, 2].map(k => { const e = 0.03, q = p.slice(), r = p.slice(); q[k] += e; r[k] -= e; return f(q) - f(r); });
  let ntag = 0;
  if (m.tag) for (let i = 0; i < nv; i++) if (peso[i] > 0 && pos[3 * i + 1] > TAGLIO - 0.3) {
    const g = gradP([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), l = Math.hypot(...g) || 1;
    if (g[1] / l > 0.6) { if (m.tag[i] < 250) ntag++; m.tag[i] = 250; }
  }
  let rov = 0, maxS = 0;
  const idx = Uint32Array.from(m.idx);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(q => [pos[3 * q], pos[3 * q + 1], pos[3 * q + 2]]);
    if ((a[1] + b[1] + c[1]) / 3 <= ZONA) continue;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const g = gradP([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    if (n[0] * g[0] + n[1] * g[1] + n[2] * g[2] < 0) { rov++; const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  }
  for (let i = 0; i < nv; i++) maxS = Math.max(maxS, Math.hypot(pos[3 * i] - m.pos[3 * i], pos[3 * i + 1] - m.pos[3 * i + 1], pos[3 * i + 2] - m.pos[3 * i + 2]));
  log(`${id.padEnd(9)} vertici ${p0.pos.length / 3} → ${nv}, triangoli rimessi nel verso giusto ${rov}, vertici di sezione aggiunti ${ntag}, spostamento massimo ${(maxS * 10).toFixed(1)} mm`);
  return { pos, idx, tag: m.tag, fdir: m.fdir };
}

const risultati = new Map();
for (const id of DA_FARE) { const r = muscolo(id); risultati.set(id, r); setMesh(id, r); finiti.push(id); }
if (!VERIFICA) saveFile(repack());
