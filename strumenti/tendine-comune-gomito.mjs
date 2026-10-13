/* Origine tendinea comune dei flessori-pronatori del gomito (forma, modelli/gomito-3d.html).

   Il tendine comune non è una struttura a sé: è la parte tendinea dei muscoli che ne nascono (pronatore rotondo, FCR, palmare lungo, FDS, FCU). Questo
   modulo ne calcola la forma come lamina appoggiata alla faccia antero-inferiore dell'epicondilo mediale e, in senso distale, sopra il fascio anteriore del
   collaterale ulnare (Standring, Gray's Anatomy 42ª ed.: il tendine comune nasce dalla faccia antero-inferiore dell'epicondilo mediale; il fascio anteriore
   del collaterale ulnare decorre subito in profondità). `flessori-pronatori-gomito.mjs` ne importa `appoggio`, `campoCft` e `meshCft`: la lamina è una mesh
   temporanea (ostacolo dei muscoli), poi fusa nelle loro mesh; nel file del modello non c'è più una mesh `cft`.
   Il tendine di partenza (BodyParts3D) erano tre frammenti isolati, uno staccato a 2,6–5,8 mm dall'osso, senza continuità con i muscoli. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { clamp, sstep, log } = G;

/* ============ Parametri (cm) ============ */
export const CFT = {
  appoggio: ['omero', 'ulna', 'radio', 'ucl_ant', 'ucl_trasv', 'caps'],   // superficie d'appoggio: unione di questi solidi, tesa con una chiusura
  chiusura: 0.3,        // raggio della chiusura morfologica: la lamina scavalca la rima articolare e le concavità, come una fascia tesa
  gioco: 0.03,          // distanza della faccia profonda dalla superficie d'appoggio (aderisce senza entrare)
  spessore: [0.36, 0.2],   // sull'epicondilo / sul collaterale (sfuma in y tra `sfuma`)
  sfuma: [0.9, -0.5],
  raccordo: 0.06,       // raccordo dei margini (massimo morbido tra faccia, spessore e regione)
  // impronta sull'epicondilo: ellisse nel piano (x, y), vista da anteriore, davanti al piano z = `zmin` (la faccia anteriore e l'apice; la faccia
  // posteriore, con il solco del nervo ulnare, resta libera); vale per il punto d'appoggio sulla superficie, non per il punto della lamina
  impronta: { c: [2.62, 1.35], a: [0.78, 1.02], zmin: -0.12 },
  // lingua distale sopra il fascio anteriore del collaterale ulnare: tubo attorno a una linea d'asse (punti guida), rivolta verso l'anteromediale
  lingua: { asse: [[2.72, 1.05, 0.40], [1.23, -1.0, 0.21]], fuori: [0.91, 0, 0.41], larga: [0.78, 0.6] },
};

const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const distSeg = (p, a, b) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], f = clamp(((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1] + (p[2] - a[2]) * u[2]) / L2, 0, 1);
  return [Math.hypot(p[0] - a[0] - u[0] * f, p[1] - a[1] - u[1] * f, p[2] - a[2] - u[2] * f), f]; };

/* Campo della lamina (negativo dentro) nella griglia corrente. `F` è il campo (distanza con segno) della superficie d'appoggio tesa, utile
   anche a chi lo chiama per sapere dov'è la faccia superficiale. */
export function campoCft(Fapp, { cute = null, giocoCute = 0.2, nervo = null, giocoNervo = 0.045 } = {}) {
  const { N, NX, NY, NXY } = G, T = new Float32Array(N).fill(1);
  const Fn = G.sfoca(Float32Array.from(Fapp), 3);   // normali da un campo più levigato (Fapp è esatto vicino alle ossa e teso altrove: le normali verrebbero rumorose)
  const I = CFT.impronta, L = CFT.lingua, k = CFT.raccordo;
  const asse = L.asse.map(p => [p[0] + L.fuori[0] * 0.3, p[1], p[2] + L.fuori[2] * 0.3]);
  for (let q = 0; q < N; q++) {
    const d = Fapp[q]; if (d < -0.25 || d > 0.7) continue;
    const [x, y, z] = G.voxel(q); if (y > 2.8 || y < -1.7 || x < 0.9) continue;
    // la regione si valuta sul punto della superficie d'appoggio più vicino (proiezione lungo la normale): il margine della lamina è allora
    // perpendicolare alla superficie ovunque, senza tratti quasi tangenti che lascerebbero un bordo a denti
    const g = G.grad(Fn, [x, y, z]), gl = Math.hypot(...g) || 1, s = [x - g[0] / gl * d, y - g[1] / gl * d, z - g[2] / gl * d];
    // regione 1: impronta ellittica (x, y) davanti al piano z = `zmin` (anteriore e apice)
    const e = Math.hypot((s[0] - I.c[0]) / I.a[0], (s[1] - I.c[1]) / I.a[1]), r1 = Math.max((e - 1) * Math.min(...I.a), I.zmin - s[2]);
    // regione 2: tubo attorno alla linea d'asse sopra il collaterale
    const [ds, f] = distSeg(s, asse[0], asse[1]), w = L.larga[0] + (L.larga[1] - L.larga[0]) * f, r2 = ds - w;
    const th = CFT.spessore[1] + (CFT.spessore[0] - CFT.spessore[1]) * sstep(CFT.sfuma[1], CFT.sfuma[0], y);
    const guscio = Math.max(CFT.gioco - d, d - (CFT.gioco + th));
    T[q] = smax(guscio, Math.min(r1, r2), k);
    if (cute) T[q] = smax(T[q], cute[q] + giocoCute, 0.05);   // sotto la cute, come i muscoli
    if (nervo) T[q] = smax(T[q], giocoNervo - nervo[q], 0.05);   // il nervo ulnare (distanza dall'asse meno il raggio) non è mai dentro la lamina
  }
  return T;
}

/* Superficie d'appoggio tesa: chiusura dell'unione di ossa, collaterale ulnare e capsula, levigata. Restituisce il campo (distanza con segno).
   Dove la chiusura non aggiunge nulla (superficie convessa o piana) la distanza è quella esatta dai triangoli: la trasformata di distanza dei
   voxel sbaglia di ~0,35 mm, più del gioco con cui la lamina aderisce all'osso, e l'osso bucherebbe la faccia profonda. */
export function appoggio() {
  const { N } = G, nomi = CFT.appoggio, M = G.unione(nomi), { F, Do } = G.sdf(M);
  const Fc = G.sfoca(G.chiuso(Do, CFT.chiusura), 2), banda = 0.15, Fe = Float32Array.from(F);
  G.esatta(Fe, nomi, banda);
  for (let q = 0; q < N; q++) if (Math.abs(Fe[q]) <= banda) Fe[q] = (M[q] ? -1 : 1) * Math.abs(Fe[q]);
  for (let q = 0; q < N; q++) {
    if (Math.abs(Fe[q]) > banda || Fe[q] < 0) continue;
    const w = sstep(0.03, 0.09, Fe[q] - Fc[q]) + sstep(0.11, 0.15, Fe[q]);   // 0 = superficie esatta; 1 = superficie tesa (chiusura aggiunge più di 0,9 mm, o fuori banda)
    Fc[q] = Fe[q] * (1 - Math.min(w, 1)) + Fc[q] * Math.min(w, 1);
  }
  return Fc;
}

/* Pulizia: una sola componente (la più grande) e nessuna cavità. */
function pulisci(T) {
  const { N, NX, NY, NZ, NXY } = G, M = new Uint8Array(N); for (let q = 0; q < N; q++) M[q] = T[q] < 0 ? 1 : 0;
  const lab = new Int32Array(N).fill(-1), st = new Int32Array(N), dim = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!M[s0] || lab[s0] >= 0) continue; let sp = 0, n = 0; const l = dim.length; st[sp++] = s0; lab[s0] = l;
    while (sp) { const q = st[--sp]; n++; const i = q % NX, j = ((q / NX) | 0) % NY, k = (q / NXY) | 0;
      for (const [d, ok] of [[1, i < NX - 1], [-1, i > 0], [NX, j < NY - 1], [-NX, j > 0], [NXY, k < NZ - 1], [-NXY, k > 0]]) { if (!ok) continue; const r = q + d; if (M[r] && lab[r] < 0) { lab[r] = l; st[sp++] = r; } } }
    dim.push(n);
  }
  let big = 0; dim.forEach((n, i) => { if (n > dim[big]) big = i; });
  let isole = 0; for (let q = 0; q < N; q++) if (M[q] && lab[q] !== big) { T[q] = 0.01; isole++; }
  return { componenti: dim.length, isole };
}

/* Mesh dalla lamina: surface nets su griglia di `passo` cm, Taubin, vertici riportati sul livello zero del campo fine (Newton);
   fibre lungo il tendine (−y proiettato sul piano tangente). */
export function meshCft(T, { passo = 0.06, taubin = 20 } = {}) {
  G.sfoca(T, 1); const pul = pulisci(T), fine = { O: [...G.O], H: G.H, NX: G.NX, NY: G.NY, NZ: G.NZ, NXY: G.NXY };
  const campFine = (x, y, z) => {
    let fx = (x - fine.O[0]) / fine.H - 0.5, fy = (y - fine.O[1]) / fine.H - 0.5, fz = (z - fine.O[2]) / fine.H - 0.5;
    fx = clamp(fx, 0, fine.NX - 1.001); fy = clamp(fy, 0, fine.NY - 1.001); fz = clamp(fz, 0, fine.NZ - 1.001);
    const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k, b = i + fine.NX * j + fine.NXY * k, l = (a, c, t) => a + (c - a) * t;
    return l(l(l(T[b], T[b + 1], u), l(T[b + fine.NX], T[b + fine.NX + 1], u), v), l(l(T[b + fine.NXY], T[b + fine.NXY + 1], u), l(T[b + fine.NXY + fine.NX], T[b + fine.NXY + fine.NX + 1], u), v), w);
  };
  const hi = [0, 1, 2].map(c => fine.O[c] + [fine.NX, fine.NY, fine.NZ][c] * fine.H), nc = [0, 1, 2].map(c => Math.ceil((hi[c] - fine.O[c]) / passo));
  G.setGriglia(fine.O, passo, nc[0], nc[1], nc[2]);
  const Fc = G.valuta(p => campFine(p[0], p[1], p[2])), out = G.nets(Fc, () => [0, 1, 0]);
  G.setGriglia(fine.O, fine.H, fine.NX, fine.NY, fine.NZ);
  const nv = out.pos.length / 3; let pos = G.taubin(out.pos, out.idx, taubin);
  const e = fine.H * 0.75;
  for (let i = 0; i < nv; i++) {
    let p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    for (let it = 0; it < 5; it++) {
      const v = campFine(...p), g = [campFine(p[0] + e, p[1], p[2]) - campFine(p[0] - e, p[1], p[2]), campFine(p[0], p[1] + e, p[2]) - campFine(p[0], p[1] - e, p[2]), campFine(p[0], p[1], p[2] + e) - campFine(p[0], p[1], p[2] - e)].map(x => x / (2 * e)), g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] || 1;
      const st = clamp(v / g2, -0.1, 0.1); p = [p[0] - g[0] * st, p[1] - g[1] * st, p[2] - g[2] * st]; if (Math.abs(v) < 2e-4) break;
    }
    pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
  }
  const fdir = new Int8Array(3 * nv);
  for (let i = 0; i < nv; i++) {
    const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], g = G.grad({ s: (a, b, c) => campFine(a, b, c) }, p, e), gl = Math.hypot(...g) || 1, n = g.map(v => v / gl);
    let f = [-n[0] * (-n[1]), -1 - n[1] * (-n[1]), -n[2] * (-n[1])]; const fl = Math.hypot(...f) || 1; f = f.map(v => v / fl);
    for (let c = 0; c < 3; c++) fdir[3 * i + c] = Math.round(clamp(f[c], -1, 1) * 127);
  }
  return { pos, idx: out.idx, tag: null, fdir, isole: pul.isole, componenti: pul.componenti };
}
