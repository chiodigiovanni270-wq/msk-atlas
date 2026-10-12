/* Braccio del gomito (modelli/gomito-3d.html): forma di bicipite e capi del tricipite da y ≈ 4,8 cm al piano di taglio y = 12 cm.

   Uso (dalla cartella del progetto):
     node strumenti/estremo-braccio-gomito.mjs                    → riscrive le mesh nel file del modello
     MODELLO=/tmp/copia.html node strumenti/estremo-braccio-gomito.mjs   → lavora su una copia
     node strumenti/estremo-braccio-gomito.mjs bic tri_lat        → solo alcuni muscoli

   Problemi delle mesh BodyParts3D (a bassa risoluzione, ~3 mm):
   - facce piane e creste nette (la sfumatura delle normali le nascondeva solo in parte): blocchi "a prisma" con spigoli, un lobo
     medioposteriore del capo lungo del tricipite (y ≈ 7,5–9, ritagliato dal piano x = 4,576), code e uncini sottili (coda del capo corto del
     bicipite, punta del capo laterale del tricipite);
   - al piano di taglio i vertici oltre y = 12 erano stati schiacciati sul piano: dall'ultimo mezzo centimetro il margine era a dente di sega.
   Metodo (ogni muscolo riparte dalla revisione `PARTENZA`, quindi lo strumento si può rilanciare):
   1. campo di distanza della mesh (`F0`) e sua versione levigata con una gaussiana 3D (`Fh`, `REG.sigma`: arrotonda creste e facce, toglie code e
      lobi sottili); da `REG.y[0]` a `REG.y[1]` il campo passa gradualmente da `F0` a `Fh`;
   2. vicino al taglio: sezione di riferimento a y = `Y0` (liscia), levigata nel piano con la stessa sigma ed estrusa fino al taglio, da `RAMPA`;
      chiusa sul piano y = `TAGLIO` con un raccordo `RACCORDO`;
   3. dal campo si tolgono gli ostacoli (`OSTACOLI`: omero, brachiale, brachioradiale, i tubi di vasi e nervi e i muscoli già rifatti, a distanza
      `GIOCO`): lo smussamento non deve portare il muscolo dentro di loro (non si scava dove un tubo era già incassato di oltre `INCASSO`);
   4. sopra `ZONA` i triangoli si dividono (lati ≤ `LATO`, con tag e fibre interpolati; così la superficie levigata è campionata abbastanza fitta
      e non si vedono facce piane); ogni vertice va sul campo bersaglio. Spostamento = proiezione sul bersaglio + granulosità propria del vertice
      (differenza dalla proiezione sul campo di partenza), che sfuma sopra `REG.y[0]` + 1,6 cm: nessun bordo tra zona toccata e zona intatta.
      Vicino al taglio (`RIL`) qualche passata di rilassamento tangenziale con ritorno sul bersaglio riordina i vertici.
   Per il capo lungo (`PER`) la levigatura parte più in basso (y 3,5) e lungo le fibre ha sigma più ampia (`sigmaY`): toglie le ondulazioni del profilo laterale.
   Sempre per il capo lungo, `larghezza`: la radice dell'area delle sezioni era costante vicino al tendine e poi cresceva linearmente (spigolo, visto come ampia curva
   concava del bordo mediale); la larghezza viene riempita fino alla corda da y 4 a 10, levigata (sigma 1 cm) e imposta scalando le sezioni attorno al baricentro
   (fino a +16 %, trasformazione `T` applicata ai vertici; poi chi tocca un ostacolo torna fuori dal suo margine).
   Il capo mediale (`PER.tri_med`) è rifatto anche nell'estremo distale (da y 0,3: levigatura più fine, ulna come ostacolo) e il suo margine laterale non supera il profilo del capo laterale (`latmax`).
   Il tendine distale di capo lungo e capo laterale (`TEND`) è una fascia sfumata e simmetrica sull'asse tra i due capi (vedi commento sopra `TEND`).
   Tag e fibre restano quelli dei vertici di partenza; il tag di sezione (250) non si interpola e si riassegna dalla normale (faccia rivolta in alto).
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
const Y0 = 10.6;                            // sezione di riferimento (liscia)
const RAMPA = [9.0, 11.0];                 // dal campo originale alla sezione levigata
const RACCORDO = 0.10;                      // cm, raggio dello spigolo al piano di taglio
let ZONA = 4.8;                             // sopra questa y i triangoli si dividono
const LATO = 0.2;                           // cm, lato massimo dei triangoli nella zona
const RILASSA = 25;                         // passate di rilassamento tangenziale (solo vicino al taglio, peso `RIL`)
const RIL = [10.0, 10.8];
const REG0 = { y: [4.8, 7.2], sigma: 0.55, sigmaY: 0.55 };  // regolarizzazione della forma: da y[0] a y[1] cresce il peso del campo levigato con una gaussiana 3D (`sigma` nel piano, `sigmaY` lungo il muscolo, cm)
let REG = REG0;
// il capo lungo del tricipite ha il profilo laterale ondulato (avvallamenti e spalle tra y ≈ 4 e 9): qui la levigatura parte più in basso e lungo le fibre è molto più ampia
const PER = {
  // capo mediale: l'estremo distale (y 0–5) era una lamina sottile con punte, lembi e un margine laterale che oltrepassava il profilo del capo laterale (`latmax`: x minima
  // ammessa per y, cm, già a ~1 mm sotto il bordo del capo laterale); levigatura più fine (`basso`, da y[0] a y[1]), ostacolo in più: l'ulna (olecrano)
  tri_med: { zona: 0.3, reg: REG0, ostacoli: ['ulna'], basso: { y: [0.6, 2.6], sigma: 0.3, sigmaY: 0.3 },
    latmax: { y: [[0.5, -0.2], [1, -0.5], [2, -0.52], [3, -0.61], [4, -0.76], [5, -0.79], [6, -0.81]], dentro: [0.5, 1.4], fuori: [5.0, 5.8], raccordo: 0.25 } },
  tri_lungo: { zona: 3.5, reg: { y: [3.5, 6.5], sigma: 0.55, sigmaY: 0.8 },
  // larghezza delle sezioni (radice dell'area) lungo y: tratto costante vicino al tendine e poi crescita lineare formavano uno spigolo, visto come ampia curva concava del bordo;
  // la larghezza viene riempita fino alla corda tra `y[0]` e `y[1]` (mai assottigliata), levigata con una gaussiana di `sigma` (cm) e imposta scalando le sezioni attorno al loro baricentro
  larghezza: { y: [4.0, 10.0], sigma: 1.0, sfuma: [[3.2, 4.0], [9.2, 10.2]] } } };

// Tendine distale comune (capo lungo e capo laterale): nel modello di partenza i tag disegnavano due triangoli bianchi a spigolo netto, con l'apice in alto e
// asimmetrici. Ora il tag (0–200, muscolo → tendine) segue un'unica fascia centrata sull'asse tra i due capi (`xa`), il cui semilato cresce verso il basso con
// profilo a radice (apice arrotondato, non a punta) fino a `ya` − `L`; margine sfumato (`soft`), frastagliato lungo le fibre (`noise`: lingue verticali) e
// compresso con `gamma` (il colore passa troppo presto al bianco); solo sulla faccia posteriore (normale z); sotto y 2,3 resta tendine pieno.
const TEND = { muscoli: ['tri_lungo', 'tri_lat'], xa: 0.42, ya: 7.9, L: 3.9, H0: 1.0, soft: 0.7, noise: 0.25, gamma: 1.6, fade: 2.4, pn: [0.15, -0.35] };

const H = 0.04;                             // cm, passo della griglia dei campi
const OSTACOLI = ['omero', 'brach', 'br'];  // mesh che il muscolo non deve attraversare (più tutti i tubi della pagina nella zona)
const GIOCO = 0.05;                         // cm, distanza dagli ostacoli
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
// levigatura gaussiana 3D (separabile) sulla griglia corrente
function gauss3d(A, sigmaCelle, sigmaYCelle = sigmaCelle) {
  const { NX, NY, NZ, NXY } = G;
  let src = A, dst = new Float32Array(A.length);
  for (const [st, n, sg] of [[1, NX, sigmaCelle], [NX, NY, sigmaYCelle], [NXY, NZ, sigmaCelle]]) {
    const R = Math.ceil(3 * sg), K = Float32Array.from({ length: 2 * R + 1 }, (_, q) => Math.exp(-((q - R) ** 2) / (2 * sg ** 2)));
    const S = K.reduce((a, b) => a + b, 0); for (let q = 0; q < K.length; q++) K[q] /= S;
    for (let i = 0; i < A.length; i++) {
      const c = ((i / st) | 0) % n; let v = 0;
      for (let q = -R; q <= R; q++) { const cc = c + q < 0 ? 0 : c + q >= n ? n - 1 : c + q; v += K[q + R] * src[i + (cc - c) * st]; }
      dst[i] = v;
    }
    [src, dst] = [dst, src];
  }
  return src;
}
// smax polinomiale (raccordo di raggio k)
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k / 4; };

const finiti = [];                          // muscoli già rifatti: ostacoli per i successivi (restano distinti, senza sovrapposizioni)
function campoBersaglio(id, m) {
  setMesh(id, { pos: m.pos, idx: m.idx, tag: m.tag, fdir: m.fdir });
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.pos[i + k]); hi[k] = Math.max(hi[k], m.pos[i + k]); }
  lo[1] = Math.min(REG.y[0] - 0.8, (PER[id]?.larghezza?.sfuma[0][0] ?? Infinity) - 0.5, (PER[id]?.basso?.y[0] ?? Infinity) - 0.6); hi[1] = TAGLIO + 0.4;
  G.griglia(lo, hi, H, 0.6);
  const { NX, NY, NZ, NXY } = G;
  // solido: si usa solo sotto il piano della sezione di riferimento (sopra la mesh è stata schiacciata sul piano)
  const M = G.solid(id);
  const j0 = Math.round((Y0 - G.O[1]) / G.H - 0.5);
  const S0 = new Uint8Array(G.N);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const v = M[G.vi(i, j0, k)]; for (let j = 0; j < NY; j++) S0[G.vi(i, j, k)] = v; }
  const { F: Fp } = G.sdf(S0);                                     // prisma della sezione di riferimento
  const D = new Float32Array(NX * NZ); for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) D[i + NX * k] = Fp[G.vi(i, j0, k)];
  const Dl = gauss2d(D, NX, NZ, REG.sigma / G.H);   // stessa sigma della levigatura 3D: sezione e campo sotto si raccordano senza gradino
  const { F: F0 } = G.sdf(M); G.sfoca(F0, 1);
  const BA = PER[id]?.basso, Fl = BA ? gauss3d(F0, BA.sigma / G.H, BA.sigmaY / G.H) : null;   // levigatura più fine per l'estremo distale
  const Fh = gauss3d(F0, REG.sigma / G.H, REG.sigmaY / G.H);                         // forma levigata (toglie facce, creste e lobi sottili)
  const F = new Float32Array(G.N);
  for (let j = 0; j < NY; j++) {
    const y = G.O[1] + (j + 0.5) * G.H, w = sstep(RAMPA[0], RAMPA[1], y), wr = sstep(REG.y[0], REG.y[1], y);
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const q = G.vi(i, j, k), prisma = Dl[i + NX * k], f0b = BA ? (1 - sstep(BA.y[0], BA.y[1], y)) * F0[q] + sstep(BA.y[0], BA.y[1], y) * Fl[q] : F0[q], base = (1 - wr) * f0b + wr * Fh[q];
      F[q] = smax(w >= 1 ? prisma : (1 - w) * base + w * prisma, y - TAGLIO, RACCORDO);
    }
  }
  // larghezza delle sezioni (radice dell'area misurata sul campo): riempita fino alla corda, levigata; il fattore di scala per ogni y (sezioni scalate
  // attorno al baricentro) diventa la trasformazione `T`, che si applica ai vertici già proiettati (ricampionare il campo lasciava striature sulla superficie)
  const LAR = PER[id]?.larghezza;
  let T = null;
  if (LAR) {
    const A = new Float32Array(NY), cx = new Float32Array(NY), cz = new Float32Array(NY);
    for (let j = 0; j < NY; j++) {
      let n = 0, sx = 0, sz = 0;
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (F[G.vi(i, j, k)] < 0) { n++; sx += i; sz += k; }
      A[j] = n * G.H * G.H; cx[j] = n ? G.O[0] + (sx / n + 0.5) * G.H : NaN; cz[j] = n ? G.O[2] + (sz / n + 0.5) * G.H : NaN;
    }
    const yj = j => G.O[1] + (j + 0.5) * G.H, jy = y => clamp(Math.round((y - G.O[1]) / G.H - 0.5), 0, NY - 1);
    const media = (a, r) => Float32Array.from(a, (v, j) => { let t = 0, n = 0; for (let q = -r; q <= r; q++) { const w = a[j + q]; if (w > 0 || w < 0) { t += w; n++; } } return n ? t / n : NaN; });
    const wc = media(Float32Array.from(A, Math.sqrt), 3), cxs = media(cx, 8), czs = media(cz, 8);
    const ja = jy(LAR.y[0]), jb = jy(LAR.y[1]), wh = Float32Array.from(wc), sc = new Float32Array(NY).fill(1);
    for (let j = ja; j <= jb; j++) wh[j] = Math.max(wc[j], wc[ja] + (wc[jb] - wc[ja]) * (j - ja) / (jb - ja));
    // gaussiana lungo y con estensione dispari agli estremi del tratto (le estremità non si spostano)
    const R = Math.ceil(3 * LAR.sigma / G.H), lo0 = jy(LAR.sfuma[0][0]) - R, hi0 = jb + R;
    const ext = j => j < ja ? 2 * wh[ja] - wh[Math.min(2 * ja - j, NY - 1)] : j > jb ? 2 * wh[jb] - wh[Math.max(2 * jb - j, 0)] : wh[j];
    const K = Float32Array.from({ length: 2 * R + 1 }, (_, q) => Math.exp(-((q - R) ** 2) / (2 * (LAR.sigma / G.H) ** 2))), SK = K.reduce((a, b) => a + b, 0);
    for (let j = Math.max(lo0, 0); j <= Math.min(hi0, NY - 1); j++) {
      let wt = 0; for (let q = -R; q <= R; q++) wt += K[q + R] * ext(j + q); wt /= SK;
      const y = yj(j), f = sstep(LAR.sfuma[0][0], LAR.sfuma[0][1], y) * (1 - sstep(LAR.sfuma[1][0], LAR.sfuma[1][1], y));
      if (f > 0 && wc[j] > 0) sc[j] = 1 + (wt / wc[j] - 1) * f;
    }
    const lin = (a, y) => { const u = clamp((y - G.O[1]) / G.H - 0.5, 0, NY - 1.001), j = u | 0; return a[j] + (a[j + 1] - a[j]) * (u - j); };
    T = p => { const s = lin(sc, p[1]); if (s === 1 || !(s > 0)) return p; const x = lin(cxs, p[1]), z = lin(czs, p[1]); return [x + (p[0] - x) * s, p[1], z + (p[2] - z) * s]; };
  }
  // margine laterale: il capo mediale non oltrepassa il profilo del capo laterale (taglio con raccordo, sfumato agli estremi)
  const LM = PER[id]?.latmax;
  if (LM) {
    const xl = y => { const T = LM.y; if (y <= T[0][0]) return T[0][1]; for (let q = 1; q < T.length; q++) if (y <= T[q][0]) return T[q - 1][1] + (T[q][1] - T[q - 1][1]) * (y - T[q - 1][0]) / (T[q][0] - T[q - 1][0]); return T[T.length - 1][1]; };
    for (let j = 0; j < NY; j++) {
      const y = G.O[1] + (j + 0.5) * G.H, wy = sstep(LM.dentro[0], LM.dentro[1], y) * (1 - sstep(LM.fuori[0], LM.fuori[1], y)); if (wy <= 0) continue;
      const lim = xl(y);
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const q = G.vi(i, j, k), c = lim - (G.O[0] + (i + 0.5) * G.H) - (1 - wy) * 3; if (c > -LM.raccordo) F[q] = smax(F[q], c, LM.raccordo); }
    }
  }
  // ostacoli: mesh e tubi vicini, il muscolo resta a GIOCO di distanza
  const Ob = new Uint8Array(G.N);
  for (const nome of OSTACOLI.concat(PER[id]?.ostacoli ?? [], finiti)) if (nome !== id) G.or(Ob, G.solid(nome));
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
  const C = new Float32Array(G.N); for (let q = 0; q < G.N; q++) { C[q] = GIOCO - Fo[q]; F[q] = Math.max(F[q], C[q]); }
  return { F, F0, T, C };
}

/* ============ Tendine distale ============ */
function normali(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]], u = [0, 1, 2].map(k => pos[3 * b + k] - pos[3 * a + k]), v = [0, 1, 2].map(k => pos[3 * c + k] - pos[3 * a + k]);
    const q = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) n[3 * i + k] += q[k];
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
const rumore = (x, y) => Math.sin(x * 9.1 + y * 0.7) * 0.5 + Math.sin(x * 17.3 - y * 1.1 + 1.7) * 0.3 + Math.sin(x * 31.7 + y * 0.4 + 4.2) * 0.2;
function tendineDistale(pos, idx, tag) {
  const P = TEND, N = normali(pos, idx);
  for (let i = 0; i < pos.length / 3; i++) {
    if (tag[i] >= 250) continue;                              // sezioni di taglio: non toccare
    const x = pos[3 * i], y = pos[3 * i + 1]; if (y <= 2.3) continue;
    const t = clamp((P.ya - y) / P.L, 0, 1.6), hw = P.H0 * Math.sqrt(t), d = Math.abs(x - P.xa) + P.noise * rumore(x, y), soft = P.soft * (0.6 + 0.4 * Math.min(t, 1));
    let w = (1 - sstep(hw - soft, hw + soft, d)) * sstep(P.ya, P.ya - P.fade, y) * Math.max(sstep(P.pn[0], P.pn[1], N[3 * i + 2]), sstep(3.6, 2.8, y));
    tag[i] = Math.round(200 * Math.max(Math.pow(w, P.gamma), sstep(3.4, 2.3, y)));
  }
}

/* ============ Muscolo ============ */
function muscolo(id) {
  ZONA = PER[id]?.zona ?? 4.8; REG = PER[id]?.reg ?? REG0;
  const p0 = realDaRevisione(PARTENZA, id, FILE_REPO);
  const m = suddividi({ pos: Float32Array.from(p0.pos), idx: p0.idx, tag: p0.tag, fdir: p0.fdir });
  const nv = m.pos.length / 3;
  const { F, F0, T, C } = campoBersaglio(id, m);
  const g0 = PER[id]?.basso?.y[0] ?? REG.y[0];                    // sopra g0 + 1,6 cm la granulosità dei vertici di partenza è sfumata
  const f = p => sample(F, p[0], p[1], p[2]), f0 = p => sample(F0, p[0], p[1], p[2]), fc = p => sample(C, p[0], p[1], p[2]);
  const peso = new Float32Array(nv); for (let i = 0; i < nv; i++) peso[i] = sstep(RIL[0], RIL[1], m.pos[3 * i + 1]);
  const pos = Float32Array.from(m.pos);
  // spostamento = (proiezione sulla forma bersaglio) − (proiezione sulla forma di partenza): la granulosità propria dei vertici (± 0,2 mm)
  // resta (sfuma sopra REG.y[0]), e dove i due campi coincidono il vertice non si muove
  for (let i = 0; i < nv; i++) {
    const v = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], a = sstep(g0, g0 + 1.6, v[1]);
    const pt = proietta(f, v, 0, 24), pl = a < 1 ? proietta(f0, v, 0, 24) : v;
    for (let c = 0; c < 3; c++) pos[3 * i + c] = pt[c] + (1 - a) * (v[c] - pl[c]);
  }
  // larghezza imposta (T) e, dove le sezioni scalate toccano un ostacolo, ritorno fuori dal suo margine
  if (T) for (let i = 0; i < nv; i++) {
    let p = T([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]); if (fc(p) > 0) p = proietta(fc, p, 0, 12);
    pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
  }
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
  if (m.tag) for (let i = 0; i < nv; i++) if (pos[3 * i + 1] > TAGLIO - 0.3) {
    const g = gradP([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), l = Math.hypot(...g) || 1;
    if (g[1] / l > 0.6) { if (m.tag[i] < 250) ntag++; m.tag[i] = 250; }
  }
  let rov = 0, maxS = 0;
  const idx = Uint32Array.from(m.idx);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(q => [pos[3 * q], pos[3 * q + 1], pos[3 * q + 2]]);
    if ((a[1] + b[1] + c[1]) / 3 <= 9.2) continue;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const g = gradP([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    if (n[0] * g[0] + n[1] * g[1] + n[2] * g[2] < 0) { rov++; const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  }
  for (let i = 0; i < nv; i++) maxS = Math.max(maxS, Math.hypot(pos[3 * i] - m.pos[3 * i], pos[3 * i + 1] - m.pos[3 * i + 1], pos[3 * i + 2] - m.pos[3 * i + 2]));
  if (m.tag && TEND.muscoli.includes(id)) tendineDistale(pos, idx, m.tag);
  log(`${id.padEnd(9)} vertici ${p0.pos.length / 3} → ${nv}, triangoli rimessi nel verso giusto ${rov}, vertici di sezione aggiunti ${ntag}, spostamento massimo ${(maxS * 10).toFixed(1)} mm`);
  return { pos, idx, tag: m.tag, fdir: m.fdir };
}

const risultati = new Map();
for (const id of DA_FARE) { const r = muscolo(id); risultati.set(id, r); setMesh(id, r); finiti.push(id); }
if (!VERIFICA) saveFile(repack());
