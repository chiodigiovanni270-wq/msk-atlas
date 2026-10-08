/* Quadricipite del ginocchio: tendine quadricipitale comune e terminazione dei quattro capi.

   Uso (dalla cartella del progetto):
     node strumenti/quadricipite-ginocchio.mjs            ricostruisce tendine e capi e salva il modello
     node strumenti/quadricipite-ginocchio.mjs verifica   elenca le compenetrazioni con le strutture vicine (non salva)
     node strumenti/quadricipite-ginocchio.mjs verifica originale   le stesse, sulle mesh di partenza (per confronto)

   Cosa fa (riparte sempre dalle mesh della revisione ORIGINALE, quindi si può rilanciare):
   - Tendine quadricipitale (`tenquad`): ricostruito come lamina unica, mesh parametrica liscia a bordi arrotondati
     (sezione a superellisse). Nasce sottile tra retto femorale e vasto intermedio (TQ.yTop), scende appoggiato sul
     vasto intermedio allargandosi e ispessendosi (tabelle LARGH, SPESS, CENTRO), si inserisce sulla base della rotula
     e prosegue come espansione prerotulea sottile sulla faccia anteriore della rotula fino all'apice, dove si perde
     nel tendine rotuleo. Il retto femorale vi entra dalla faccia superficiale, i vasti dai margini, il vasto
     intermedio resta profondo: aspetto trilaminare.
   - Retto femorale e vasti mediale e laterale: le mesh originali (BodyParts3D) finivano con un taglio piatto.
     Il tratto distale di ogni capo viene deformato per sezioni orizzontali (stessi vertici e triangoli): ogni sezione
     viene spostata e ridotta (tabella CAPI) così il ventre si affusola in una lamina tendinea che entra nel tendine
     comune; il colore sfuma da muscolo a tendine (tag dei vertici) e la direzione delle fibre segue la deformazione.
     Il vasto intermedio resta quello originale.
   Parametri nelle tabelle in testa. Dopo: rilanciare borse-ginocchio.mjs (la borsa prerotulea poggia sul tendine),
   poi percorsi-ginocchio.mjs ed estremi-ginocchio.mjs se cambiano gli ostacoli (vedi GUIDA_MODELLI.md). */
import { meshDaRevisione, REAL, attrs, setMesh, repack, saveFile, log, clamp, sstep, setGriglia, solid, edt, sample, sdf, unione, grad } from './lib-modello.mjs';

const ORIGINALE = 'f5ed5c1';            // revisione con le mesh di partenza del quadricipite
const VERIFICA = process.argv.includes('verifica');

/* ============ Tabelle ============ */
// profili lungo y (cm): valori interpolati con raccordo dolce tra i nodi
const TQ = { yTop: 10.3, yBot: 0.0, passo: 0.06, giro: 60, esp: 2.6, liscia: 40 };   // liscia: passate di lisciatura lungo y
const LARGH = [[10.3, 0.45], [10, 0.7], [9, 0.88], [8, 1.0], [7, 1.1], [6, 1.05], [5, 1.17], [4, 1.45], [3.5, 1.5], [3, 1.55], [2, 1.6], [1, 1.35], [0.5, 0.95], [0.15, 0.6], [0, 0.45]];   // semilarghezza
const SPESS = [[10.3, 0.0], [10.1, 0.08], [9, 0.14], [8, 0.2], [7, 0.27], [6, 0.36], [5, 0.55], [4.2, 0.72], [3.7, 0.82], [3.3, 0.55], [2.9, 0.13], [2.5, 0.08], [1, 0.08], [0.4, 0.1], [0.12, 0.06], [0, 0.0]];  // spessore totale
const CENTRO = [[10.3, -1.47], [10, -1.45], [8, -1.25], [6, -1.1], [4, -0.95], [3, -0.85], [2, -0.75], [1, -0.8], [0, -0.95]];   // x dell'asse
// capi del quadricipite: il tratto tra ya e la fine originale yb viene compresso fino a yFine; ogni sezione orizzontale
// si riduce (sx, sz alla fine) verso il proprio punto d'ancoraggio (il vertice più avanzato nella direzione `verso`,
// cioè dove le fibre convergono sul tendine), e l'ancoraggio scivola fino al bersaglio `fine` [x, z] dentro il tendine
// comune (dz: profondità sotto la faccia anteriore del tendine). `ritardo`: quota di u (0 = ya, 1 = fine) prima della
// quale la sezione non si riduce; `tendine`: intervallo di u in cui il colore passa da muscolo a tendine; `v`: anticipo
// (per cm di distanza trasversale dall'ancoraggio) del passaggio a tendine, così il ventre termina a punta sul tendine;
// `sopra`: l'ancoraggio resta almeno così sopra la faccia anteriore del vasto intermedio;
// `fuori`: strutture da cui il tratto deformato viene spinto fuori (gioco FUORI.gioco, spostamento levigato sulla mesh).
const CAPI = [
  { id: 'retto', ya: 9.0, yb: 5.8, yFine: 4.6, verso: [0, 1], fine: [-1.2, null], dz: 0.32, sx: 1.0, sz: 0.55, ritardo: 0.0, tendine: [0.05, 0.5], v: 0.12, fuori: ['vint', 'vmed'] },
  { id: 'vlat', ya: 10.5, yb: 2.2, yFine: 3.4, verso: [1, 0.6], fine: [-2.1, null], dz: 0.25, sx: 0.7, sz: 0.3, ritardo: 0.6, tendine: [0.72, 0.95], fuori: ['vint', 'femore'], sopra: 0.3 },
  { id: 'vmed', ya: 5.0, yb: 2.2, yFine: 2.35, verso: [-1, 0.5], fine: [0.55, null], dz: 0.3, sx: 0.3, sz: 0.12, ritardo: 0.2, tendine: [0.6, 0.92], fuori: ['vint', 'femore'] },
];
const FUORI = { gioco: 0.02, passate: 4, liscia: 6 };
const PAVIMENTO = { gioco: 0.03, curva: 0.2, rotula: 0.012, ya: 3.7, yb: 2.9 };   // appoggio su vasto intermedio (sopra ya) e rotula (sotto yb)

/* ============ Utilità ============ */
const tab = T => y => {   // T ordinata per y decrescente
  if (y >= T[0][0]) return T[0][1]; if (y <= T[T.length - 1][0]) return T[T.length - 1][1];
  for (let i = 0; i < T.length - 1; i++) { const [y0, a] = T[i], [y1, b] = T[i + 1]; if (y <= y0 && y >= y1) { const t = (y0 - y) / (y0 - y1); return a + (b - a) * t * t * (3 - 2 * t); } }
};
const larg = tab(LARGH), spess = tab(SPESS), centro = tab(CENTRO);
const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// mappa di quota lungo z: z massimo (faccia anteriore) e minimo di una mesh sulla griglia (x, y)
function quote(name, x0 = -4.5, x1 = 3.5, y0 = -1.5, y1 = 13, h = 0.04) {
  const nx = Math.round((x1 - x0) / h) + 1, ny = Math.round((y1 - y0) / h) + 1;
  const zmax = new Float32Array(nx * ny).fill(-1e9), zmin = new Float32Array(nx * ny).fill(1e9);
  const { pos, idx } = REAL(name);
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / h)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / h));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / h)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / h));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = x0 + i * h + 1e-6, y = y0 + j * h + 1.3e-6;
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const z = l1 * pos[a + 2] + l2 * pos[b + 2] + l3 * pos[c + 2], k = i + nx * j;
      if (z > zmax[k]) zmax[k] = z; if (z < zmin[k]) zmin[k] = z;
    }
  }
  // bilineare; NaN fuori dalla mesh
  const at = (w, x, y) => {
    const fx = (x - x0) / h, fy = (y - y0) / h, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return NaN;
    const g = (ii, jj) => { const q = w[ii + nx * jj]; return Math.abs(q) > 1e8 ? NaN : q; };
    const a = g(i, j), b = g(i + 1, j), c = g(i, j + 1), d = g(i + 1, j + 1);
    if ([a, b, c, d].some(isNaN)) { const q = g(Math.round(fx), Math.round(fy)); return q; }
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  return { front: (x, y) => at(zmax, x, y), back: (x, y) => at(zmin, x, y) };
}

/* ============ Mesh di partenza ============ */
meshDaRevisione(ORIGINALE);
log('mesh di partenza dalla revisione', ORIGINALE);
const QV = quote('vint'), QR = quote('rotula');

/* ============ Tendine quadricipitale comune ============ */
// pavimento (faccia profonda) del tendine in (x, y)
function pavimento(x, y) {
  const xc = centro(y);
  // sul vasto intermedio: faccia anteriore + gioco, con una curvatura trasversale che segue il ventre
  const yv = Math.max(y, PAVIMENTO.ya - 0.3);
  let fc = QV.front(xc, yv); if (isNaN(fc)) fc = QV.front(xc, PAVIMENTO.ya);
  let zv = fc + PAVIMENTO.gioco - PAVIMENTO.curva * (x - xc) ** 2;
  const fv = QV.front(x, yv); if (!isNaN(fv)) zv = Math.max(zv, fv + PAVIMENTO.gioco);
  if (y >= PAVIMENTO.ya) return zv;
  // sulla rotula: faccia anteriore + gioco (sopra la base si campiona l'ultima quota valida)
  let zr = NaN;
  for (let yy = Math.min(y, 3.25); yy > -0.6 && isNaN(zr); yy -= 0.05) zr = QR.front(x, yy);
  if (isNaN(zr)) zr = zv;
  zr += PAVIMENTO.rotula;
  if (y <= PAVIMENTO.yb) return zr;
  const s = sstep(PAVIMENTO.ya, PAVIMENTO.yb, y);
  return zv + (zr - zv) * s;
}
function tendine() {
  const nr = Math.round((TQ.yTop - TQ.yBot) / TQ.passo) + 1, G = TQ.giro;
  // pavimento lisciato lungo x per ogni riga (niente spigoli dove cambia l'appoggio)
  const pos = [], fdirRow = [];
  const righe = [];
  for (let r = 0; r < nr; r++) {
    const y = TQ.yTop - (TQ.yTop - TQ.yBot) * r / (nr - 1);
    const w = larg(y), h = spess(y), xc = centro(y);
    const ring = [];
    for (let g = 0; g < G; g++) {
      const th = 2 * Math.PI * g / G, c = Math.cos(th), s = Math.sin(th);
      const u = Math.sign(c) * Math.abs(c) ** (2 / TQ.esp), v = Math.sign(s) * Math.abs(s) ** (2 / TQ.esp);
      const x = xc + w * u;
      // pavimento mediato su un piccolo intorno in x
      let zp = 0; for (const dx of [-0.12, -0.06, 0, 0.06, 0.12]) zp += pavimento(x + dx, y); zp /= 5;
      ring.push([x, y, zp + h * (1 + v) / 2]);
    }
    righe.push(ring);
  }
  // lisciatura lungo y della quota z (le mappe di quota hanno piccoli gradini)
  for (let it = 0; it < TQ.liscia; it++) for (let r = 1; r < nr - 1; r++) for (let g = 0; g < G; g++)
    righe[r][g][2] = 0.25 * righe[r - 1][g][2] + 0.5 * righe[r][g][2] + 0.25 * righe[r + 1][g][2];
  righe.forEach(R => R.forEach(p => pos.push(...p)));
  // estremi chiusi con un vertice centrale
  const cTop = righe[0].reduce((a, p) => a.map((v, k) => v + p[k] / G), [0, 0, 0]), cBot = righe[nr - 1].reduce((a, p) => a.map((v, k) => v + p[k] / G), [0, 0, 0]);
  const iTop = pos.length / 3; pos.push(...cTop); const iBot = pos.length / 3; pos.push(...cBot);
  const idx = [];
  for (let r = 0; r < nr - 1; r++) for (let g = 0; g < G; g++) {
    const a = r * G + g, b = r * G + (g + 1) % G, c = (r + 1) * G + g, d = (r + 1) * G + (g + 1) % G;
    idx.push(a, c, b, b, c, d);
  }
  for (let g = 0; g < G; g++) { idx.push(iTop, g, (g + 1) % G); idx.push(iBot, (nr - 1) * G + (g + 1) % G, (nr - 1) * G + g); }
  // orientamento verso l'esterno: confronto con la normale media di una riga centrale
  const P = new Float32Array(pos), I = Uint32Array.from(idx);
  let sgn = 0; const rm = Math.floor(nr / 2);
  for (let g = 0; g < G; g++) {
    const t = 6 * (rm * G + g), a = I[t], b = I[t + 1], c = I[t + 2];
    const ab = [P[3 * b] - P[3 * a], P[3 * b + 1] - P[3 * a + 1], P[3 * b + 2] - P[3 * a + 2]], ac = [P[3 * c] - P[3 * a], P[3 * c + 1] - P[3 * a + 1], P[3 * c + 2] - P[3 * a + 2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const cc = righe[rm].reduce((s, p) => s.map((v, k) => v + p[k] / G), [0, 0, 0]);
    sgn += n[0] * (P[3 * a] - cc[0]) + n[2] * (P[3 * a + 2] - cc[2]);
  }
  if (sgn < 0) for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  // direzione delle fibre: lungo l'asse del tendine (tangente tra righe vicine)
  const nv = P.length / 3, fdir = new Int8Array(nv * 3);
  for (let r = 0; r < nr; r++) for (let g = 0; g < G; g++) {
    const r0 = Math.max(0, r - 1), r1 = Math.min(nr - 1, r + 1), A = righe[r0][g], B = righe[r1][g];
    const d = nrm([B[0] - A[0], B[1] - A[1], B[2] - A[2]]); for (let k = 0; k < 3; k++) fdir[3 * (r * G + g) + k] = Math.round(d[k] * 127);
  }
  for (const i of [iTop, iBot]) { fdir[3 * i + 1] = -127; }
  log('tendine quadricipitale:', nv, 'vertici');
  return { pos: P, idx: I, tag: null, fdir };
}

/* ============ Capi del quadricipite ============ */
function capo(C, QT) {
  const { pos: P0, idx } = REAL(C.id), { tag: T0, fdir: D0 } = attrs(C.id), nv = P0.length / 3;
  // ancoraggio per fasce di 0,2 cm lungo y (lisciato)
  const B = 0.2, nb = Math.ceil((C.ya + 1 - C.yb) / B) + 1, acc = Array.from({ length: nb }, () => ({ s: -1e9, x: 0, z: 0 }));
  const bin = y => clamp(Math.floor((y - C.yb) / B), 0, nb - 1);
  for (let i = 0; i < nv; i++) {
    const x = P0[3 * i], y = P0[3 * i + 1], z = P0[3 * i + 2]; if (y > C.ya + 1) continue;
    const s = C.verso[0] * x + C.verso[1] * z, a = acc[bin(y)]; if (s > a.s) { a.s = s; a.x = x; a.z = z; }
  }
  for (let b = 0; b < nb; b++) if (acc[b].s < -1e8) Object.assign(acc[b], acc[Math.max(0, b - 1)]);
  let AX = acc.map(a => a.x), AZ = acc.map(a => a.z);
  for (let it = 0; it < 4; it++) { AX = AX.map((v, b) => (AX[Math.max(0, b - 1)] + 2 * v + AX[Math.min(nb - 1, b + 1)]) / 4); AZ = AZ.map((v, b) => (AZ[Math.max(0, b - 1)] + 2 * v + AZ[Math.min(nb - 1, b + 1)]) / 4); }
  const anc = y => { const f = clamp((y - C.yb) / B - 0.5, 0, nb - 1), b = Math.floor(f), t = f - b, b1 = Math.min(nb - 1, b + 1); return [AX[b] + (AX[b1] - AX[b]) * t, AZ[b] + (AZ[b1] - AZ[b]) * t]; };
  // bersaglio: dentro il tendine comune, dz sotto la sua faccia anteriore
  const xt = C.fine[0], zt = QT.front(xt, C.yFine) - C.dz;
  const mappa = p => {
    const y = p[1]; if (y >= C.ya) return p.slice();
    const u = clamp((C.ya - y) / (C.ya - C.yb), 0, 1.05);
    const g = sstep(0, 1, u), g2 = sstep(C.ritardo, 1, u);
    const [ax, az] = anc(y), nx = ax + (xt - ax) * g, ny = C.ya - (C.ya - C.yFine) * u;
    let nz = az + (zt - az) * g;
    // l'ancoraggio scivola sopra il vasto intermedio (mai attraverso): quota minima raccordata
    if (C.sopra !== undefined && g > 0) { const fv = QV.front(nx, ny); if (!isNaN(fv)) { const zm = fv + C.sopra, k = 0.08; nz = nz + k * Math.log1p(Math.exp((zm - nz) / k)) * g; } }
    const sx = 1 + (C.sx - 1) * g2, sz = 1 + (C.sz - 1) * g2;
    return [nx + sx * (p[0] - ax), ny, nz + sz * (p[2] - az)];
  };
  const pos = new Float32Array(nv * 3), tag = new Uint8Array(nv), fdir = new Int8Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const p = [P0[3 * i], P0[3 * i + 1], P0[3 * i + 2]], q = mappa(p);
    pos.set(q, 3 * i);
    const u = clamp((C.ya - p[1]) / (C.ya - C.yb), 0, 1), [ax0, az0] = anc(p[1]);
    const ut = u + (C.v || 0) * Math.abs(p[0] - ax0);
    let t = T0 ? T0[i] : 0;
    if (t >= 250 && p[1] < 10) t = 200;                         // tappo distale tagliato: ora dentro il tendine
    if (t < 250) t = Math.max(t, Math.round(200 * sstep(C.tendine[0], C.tendine[1], ut)));
    tag[i] = t;
    // direzione delle fibre trasformata dalla deformazione (differenza finita)
    const d = D0 ? [D0[3 * i] / 127, D0[3 * i + 1] / 127, D0[3 * i + 2] / 127] : [0, 1, 0], e = 0.02;
    const q2 = mappa([p[0] + d[0] * e, p[1] + d[1] * e, p[2] + d[2] * e]), dd = nrm([q2[0] - q[0], q2[1] - q[1], q2[2] - q[2]]);
    for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(dd[k] * 127);
  }
  // spinta fuori dagli ostacoli (solo il tratto deformato); lo spostamento viene levigato sui vicini
  if (C.fuori) {
    setGriglia([-6, 1, -1], 0.05, 220, 220, 180);
    const { F } = sdf(unione(C.fuori)), zona = [];
    for (let i = 0; i < nv; i++) if (P0[3 * i + 1] < C.ya) zona.push(i);
    const nb = Array.from({ length: nv }, () => []);
    for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; nb[a].push(b); nb[b].push(a); }
    const spingi = () => { let n = 0; for (const i of zona) {
      const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], f = sample(F, ...p); if (f >= FUORI.gioco) continue;
      const g = nrm(grad(F, p)); for (let k = 0; k < 3; k++) pos[3 * i + k] += g[k] * (FUORI.gioco - f); n++; } return n; };
    for (let it = 0; it < FUORI.passate; it++) {
      const prima = pos.slice(); const n = spingi(); if (!n) break;
      let dsp = new Float32Array(nv * 3); for (const i of zona) for (let k = 0; k < 3; k++) dsp[3 * i + k] = pos[3 * i + k] - prima[3 * i + k];
      for (let l = 0; l < FUORI.liscia; l++) { const q = dsp.slice(); for (const i of zona) { const L = nb[i]; for (let k = 0; k < 3; k++) { let m = 0; for (const j of L) m += dsp[3 * j + k]; m /= L.length; q[3 * i + k] = Math.abs(dsp[3 * i + k]) > Math.abs(m) ? dsp[3 * i + k] : 0.5 * (dsp[3 * i + k] + m); } } dsp = q; }
      for (const i of zona) for (let k = 0; k < 3; k++) pos[3 * i + k] = prima[3 * i + k] + dsp[3 * i + k];
    }
    log(C.id + ': vertici ancora dentro', C.fuori.join('/') + ':', spingi());
  }
  log(C.id + ':', nv, 'vertici, fine a y =', C.yFine, 'bersaglio', [xt, zt.toFixed(2)]);
  return { pos, idx: Uint32Array.from(idx), tag, fdir };
}

const TEND = tendine();
const BASE = process.argv.includes('originale');   // verifica originale: confronta con le mesh di partenza
if (!BASE) {
  setMesh('tenquad', TEND);
  const QT = quote('tenquad');
  for (const C of CAPI) setMesh(C.id, capo(C, QT));
}
if (!VERIFICA) saveFile(repack());

/* ============ Verifica: vertici delle strutture ricostruite dentro le strutture vicine ============ */
// (le mesh vicine sono quelle del file attuale per tendine, retto e vasti; le altre dalla revisione ORIGINALE)
const VICINE = ['femore', 'rotula', 'cartfem', 'cartrot', 'vint', 'bsovra', 'bprep', 'capsula', 'retmed', 'retlat', 'mpfl', 'itb', 'hoffa', 'tenrot', 'sart'];
const Y_MAX = 10.6;   // sopra questa quota le mesh sono quelle originali
const NUOVE = ['tenquad', ...CAPI.map(C => C.id)];
if (VERIFICA) {
  setGriglia([-6.5, -1.5, -1.5], 0.05, 230, 280, 220);
  const tutte = [...VICINE, ...NUOVE];
  for (const b of tutte) {
    const M = solid(b), D = edt(M, true), righe = [];
    for (const a of NUOVE.includes(b) ? tutte : NUOVE) {
      if (a === b || ['femore', 'rotula', 'cartfem', 'cartrot'].includes(a)) continue;
      const { pos } = REAL(a); let n = 0, mx = 0, dove = [0, 0, 0];
      for (let i = 0; i < pos.length; i += 3) {
        if (pos[i + 1] > Y_MAX) continue;
        const d = sample(D, pos[i], pos[i + 1], pos[i + 2]);
        if (d > 0.06) { n++; if (d > mx) { mx = d; dove = [pos[i], pos[i + 1], pos[i + 2]]; } }
      }
      if (n) righe.push(`${a} dentro ${b}: ${n} vertici, max ${mx.toFixed(2)} cm a [${dove.map(v => v.toFixed(1))}]`);
    }
    righe.forEach(r => console.log(r));
  }
}
