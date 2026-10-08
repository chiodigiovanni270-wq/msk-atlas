/* Tendine rotuleo del ginocchio (modelli/ginocchio-3d.html): ricostruito come mesh parametrica liscia.

   Uso (dalla cartella del progetto):
     node strumenti/tendine-rotuleo-ginocchio.mjs [--prova]
     node strumenti/tendine-rotuleo-ginocchio.mjs verifica      compenetrazioni con le strutture vicine (non salva)
   Dopo: borse-ginocchio.mjs (borse infrapatellari e prerotulea poggiano sul tendine) e retinacoli-ginocchio.mjs
   (i retinacoli si fondono ai margini del tendine).

   Anatomia (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020; Dye SF, Am J Sports Med 1998):
   - nasce dall'apice e dal margine inferiore della rotula (anche dalla faccia posteriore non articolare del polo
     inferiore), in continuità con le fibre superficiali del tendine quadricipitale sulla faccia anteriore della rotula;
   - scende verso la tuberosità tibiale restringendosi un poco (circa 2,5–3 cm all'apice, 2–2,5 cm a metà), con sezione
     ovale appiattita a margini arrotondati, spessore 4–6 mm, maggiore distalmente;
   - si inserisce sulla parte inferiore della tuberosità tibiale con un'impronta allargata a goccia; dietro c'è il corpo
     adiposo di Hoffa, distalmente la borsa infrapatellare profonda lo separa dalla tibia.
   Nel modello di partenza (BodyParts3D) era una fascia rettangolare di spessore uniforme, staccata dall'apice e
   terminata con un taglio piatto sopra la tibia.

   Metodo: per righe orizzontali (passo PASSO) una sezione a superellisse con larghezza, spessore e asse dalle tabelle;
   la faccia profonda è il "pavimento": sopra l'apice la faccia anteriore della rotula, sotto una linea tesa dall'apice
   alla tuberosità, mai dentro tibia, borsa infrapatellare profonda e corpo di Hoffa (gioco GIOCO), lisciata lungo y.
   All'inserzione la faccia profonda poggia sulla tibia e lo spessore va a zero: il tendine finisce sull'osso. Fibre
   lungo il tendine. Non dipende dalla mesh di partenza del tendine, quindi si può rilanciare.

   Requisiti: Node 18 o successivo, nessuna dipendenza. */
import { REAL, setMesh, repack, saveFile, log, clamp, sstep, setGriglia, solid, edt, sample } from './lib-modello.mjs';

const PROVA = process.argv.includes('--prova'), VERIFICA = process.argv.includes('verifica');
/* ============ Tabelle (cm) ============ */
const Y_TOP = 0.95, Y_BOT = -5.7, PASSO = 0.05, GIRO = 64, ESP = 2.2, GIOCO = 0.03;
const LARGH = [[0.95, 0.45], [0.6, 0.95], [0.1, 1.25], [-0.4, 1.3], [-1.5, 1.2], [-3, 1.08], [-4, 1.05], [-4.7, 1.12], [-5.1, 1.0], [-5.45, 0.72], [-5.7, 0.3]]; // semilarghezza
const SPESS = [[0.95, 0.0], [0.6, 0.12], [0.2, 0.25], [-0.4, 0.42], [-2, 0.46], [-3.5, 0.52], [-4.5, 0.55], [-5.1, 0.38], [-5.5, 0.12], [-5.7, 0.0]];
const CENTRO = [[0.95, -0.85], [-0.4, -0.88], [-3, -0.9], [-5.7, -0.95]];           // x dell'asse
const LINEA = [[-0.45, 3.32], [-4.2, 2.98]];                                        // faccia profonda tesa sotto l'apice (y, z)
const APICE = -0.42;                                                                // sotto: linea tesa; sopra: rotula
const VICINE = ['rotula', 'cartrot', 'tibia', 'binfprof', 'binfsup', 'bprep', 'hoffa', 'capsula', 'retmed', 'retlat', 'tenquad'];

const tab = T => y => { if (y >= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (y >= T[i][0]) { const [y0, a] = T[i - 1], [y1, b] = T[i]; return b + (a - b) * (y - y1) / (y0 - y1); } return T[T.length - 1][1]; }; // lineare (poi lisciato)
const larg = tab(LARGH), spess = tab(SPESS), centro = tab(CENTRO);
const nrm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };

// faccia anteriore (z massimo) di una mesh sulla griglia (x, y); NaN fuori dalla mesh
function fronte(name, x0 = -3.5, x1 = 1.8, y0 = -6.5, y1 = 1.5, h = 0.03) {
  const nx = Math.round((x1 - x0) / h) + 1, ny = Math.round((y1 - y0) / h) + 1, zmax = new Float32Array(nx * ny).fill(-1e9);
  const { pos, idx } = REAL(name);
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2], ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / h)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / h));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / h)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / h));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = x0 + i * h + 1e-6, y = y0 + j * h + 1.3e-6, l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const z = l1 * pos[a + 2] + l2 * pos[b + 2] + l3 * pos[c + 2], k = i + nx * j; if (z > zmax[k]) zmax[k] = z; } }
  return (x, y) => { const fx = (x - x0) / h, fy = (y - y0) / h, i = Math.round(fx), j = Math.round(fy); if (i < 0 || j < 0 || i >= nx || j >= ny) return NaN; const q = zmax[i + nx * j]; return q < -1e8 ? NaN : q; };
}

function tendine() {
  const FR = fronte('rotula'), OST = ['tibia', 'binfprof', 'hoffa'].map(n => fronte(n));
  const linea = y => LINEA[0][1] + (LINEA[1][1] - LINEA[0][1]) * (y - LINEA[0][0]) / (LINEA[1][0] - LINEA[0][0]);
  // pavimento: sopra l'apice la rotula, sotto la linea tesa; mai dentro gli ostacoli; raccordo dolce all'apice
  const pav = (x, y) => {
    let zr = NaN; for (let yy = y; yy < y + 0.4 && isNaN(zr); yy += 0.03) zr = FR(x, yy); // ai margini/sotto l'apice: la rotula poco più su
    let zl = linea(Math.min(y, LINEA[0][0]));
    for (const f of OST) { const z = f(x, y); if (!isNaN(z)) zl = Math.max(zl, z + GIOCO); }
    if (isNaN(zr)) return zl;
    const s = sstep(APICE - 0.25, APICE + 0.15, y); return zl + (zr + 0.012 - zl) * s;
  };
  const nr = Math.round((Y_TOP - Y_BOT) / PASSO) + 1, righe = [];
  for (let r = 0; r < nr; r++) {
    const y = Y_TOP - (Y_TOP - Y_BOT) * r / (nr - 1), w = larg(y), h = spess(y), xc = centro(y), ring = [];
    for (let g = 0; g < GIRO; g++) {
      const th = 2 * Math.PI * g / GIRO, c = Math.cos(th), s = Math.sin(th);
      const u = Math.sign(c) * Math.abs(c) ** (2 / ESP), v = Math.sign(s) * Math.abs(s) ** (2 / ESP), x = xc + w * u;
      let zp = 0; for (const dx of [-0.1, -0.05, 0, 0.05, 0.1]) zp += pav(x + dx, y); zp /= 5;
      ring.push([x, y, zp, h * (1 + v) / 2]);   // z del pavimento e altezza sopra di esso (lisciati separatamente)
    }
    righe.push(ring);
  }
  // pavimento lisciato lungo y (gradini delle mappe, raccordo all'apice) senza scendere sotto gli ostacoli
  for (let it = 0; it < 400; it++) for (let r = 1; r < nr - 1; r++) for (let g = 0; g < GIRO; g++) {
    const p = righe[r][g], m = 0.25 * righe[r - 1][g][2] + 0.5 * p[2] + 0.25 * righe[r + 1][g][2];
    let lim = -1e9; for (const f of OST) { const z = f(p[0], p[1]); if (!isNaN(z)) lim = Math.max(lim, z + GIOCO); }
    p[2] = Math.max(m, lim); }
  // larghezza e spessore lisciati lungo y: i raccordi tra i nodi delle tabelle non lasciano fasce in luce radente
  for (let it = 0; it < 150; it++) for (let r = 1; r < nr - 1; r++) for (let g = 0; g < GIRO; g++) for (const k of [0, 3])
    righe[r][g][k] = 0.25 * righe[r - 1][g][k] + 0.5 * righe[r][g][k] + 0.25 * righe[r + 1][g][k];
  const pos = [], G = GIRO;
  for (const R of righe) for (const [x, y, zp, dz] of R) pos.push(x, y, zp + dz);
  const cen = R => R.reduce((a, p) => [a[0] + p[0] / G, a[1] + p[1] / G, a[2] + (p[2] + p[3]) / G], [0, 0, 0]);
  const iTop = pos.length / 3; pos.push(...cen(righe[0])); const iBot = pos.length / 3; pos.push(...cen(righe[nr - 1]));
  const idx = [];
  for (let r = 0; r < nr - 1; r++) for (let g = 0; g < G; g++) { const a = r * G + g, b = r * G + (g + 1) % G, c = (r + 1) * G + g, d = (r + 1) * G + (g + 1) % G; idx.push(a, c, b, b, c, d); }
  for (let g = 0; g < G; g++) { idx.push(iTop, g, (g + 1) % G); idx.push(iBot, (nr - 1) * G + (g + 1) % G, (nr - 1) * G + g); }
  const P = new Float32Array(pos), I = Uint32Array.from(idx);
  // orientamento verso l'esterno (volume con segno positivo)
  let vol = 0; for (let t = 0; t < I.length; t += 3) { const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]); }
  if (vol < 0) for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  const nv = P.length / 3, fdir = new Int8Array(nv * 3);
  for (let r = 0; r < nr; r++) for (let g = 0; g < G; g++) { const A = righe[Math.max(0, r - 1)][g], B = righe[Math.min(nr - 1, r + 1)][g];
    const d = nrm([B[0] - A[0], B[1] - A[1], B[2] + B[3] - A[2] - A[3]]); for (let k = 0; k < 3; k++) fdir[3 * (r * G + g) + k] = Math.round(d[k] * 127); }
  for (const i of [iTop, iBot]) fdir[3 * i + 1] = -127;
  log(`tendine rotuleo: ${nv} vertici, ${I.length / 3} triangoli`);
  return { pos: P, idx: I, tag: null, fdir };
}

/* ============ Verifica: compenetrazioni (voxel 0,2 mm) ============ */
function verifica() {
  setGriglia([-3.5, -6.5, 1.5], 0.02, 265, 400, 175);
  const T = solid('tenrot'); let nT = 0; for (const v of T) nT += v;
  for (const n of VICINE) { const M = solid(n); let c = 0; for (let i = 0; i < T.length; i++) if (T[i] && M[i]) c++;
    const Di = edt(M, true); let mx = 0; for (let i = 0; i < T.length; i++) if (T[i] && M[i]) mx = Math.max(mx, Di[i]);
    log(`${n}: ${(100 * c / nT).toFixed(2)}% del tendine dentro, profondità massima ${(mx * 10).toFixed(1)} mm`); }
}
if (VERIFICA) { verifica(); process.exit(0); }
setMesh('tenrot', tendine());
verifica();
if (!PROVA) saveFile(repack());
