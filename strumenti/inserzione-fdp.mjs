/* Inserzione del flessore profondo (FDP) del dito (modelli/polso-dito-3d.html, sezione dito, mesh `d_fdp`).

   Uso (dalla cartella del progetto):
     node strumenti/inserzione-fdp.mjs              → riscrive d_fdp nel file del modello
     MODELLO=/tmp/copia.html node strumenti/inserzione-fdp.mjs   → lavora su una copia

   Nel modello originale il tendine finisce quasi alla rima interfalangea distale (y ≈ −4,75). Il FDP si inserisce invece sulla
   faccia volare della base della falange distale, distalmente alla placca volare: qui il tendine viene tagliato a Y0 e il tratto
   distale è ricostruito come loft (stessa sezione, che si allarga e si appiattisce) fino a YFIN, appoggiato alla faccia volare di P3
   e fuori da osso, cartilagine e placca volare. Riparte sempre dal FDP della revisione ORIGINALE, quindi si può rilanciare.
   Sistema di riferimento: y = asse del dito (distale verso −y), x = radio-ulnare, z = dorso (−) / volare (+). */
import { Modello, Indice, add, sub, mul, unit, clamp, sstep, log } from './lib-dito.mjs';

const ORIGINALE = 'ce9a824';
const Y0 = -4.40, YEND0 = -4.75, YFIN = -5.22;     // inizio del tratto modificato, fine originale, fine nuova (cm)
const LARGH = 1.5, APPIATT = 0.6;                  // allargamento e riduzione dello spessore alla fine
const GAP = 0.006;                                  // distanza minima dalle strutture

const M = new Modello(), O = new Modello(undefined, ORIGINALE);
const g = O.get('d_fdp'), nv = g.pos.length / 3;
const solidi = ['d_p3', 'd_p2', 'd_cart', 'vp_dip'].map(n => new Indice([M.get(n)], 0.1));

// sezione di riferimento: centro della sezione a Y0 (vertici entro 0,06)
let cx = 0, cz = 0, c = 0; for (let i = 0; i < nv; i++) if (Math.abs(g.pos[3 * i + 1] - Y0) < 0.06) { cx += g.pos[3 * i]; cz += g.pos[3 * i + 2]; c++; }
cx /= c; cz /= c; log('sezione di riferimento a y', Y0, ':', c, 'vertici, centro x', cx.toFixed(2), 'z', cz.toFixed(2));

// 1) taglia il tendine originale a Y0 (via i triangoli con un vertice oltre) e rinumera i vertici
const keepT = []; for (let t = 0; t < g.idx.length; t += 3) if ([0, 1, 2].every(k => g.pos[3 * g.idx[t + k] + 1] >= Y0 - 0.02)) keepT.push(t);
const map = new Int32Array(nv).fill(-1); let nn = 0; const pos = [], dir = [];
for (const t of keepT) for (let k = 0; k < 3; k++) { const v = g.idx[t + k]; if (map[v] < 0) { map[v] = nn++; pos.push([g.pos[3 * v], g.pos[3 * v + 1], g.pos[3 * v + 2]]); dir.push(g.dir[3 * v], g.dir[3 * v + 1], g.dir[3 * v + 2]); } }
const idx = []; for (const t of keepT) for (let k = 0; k < 3; k++) idx.push(map[g.idx[t + k]]);
// 2) sezione a Y0: punti ordinati per angolo attorno al centro, raggio interpolato su NA direzioni
const NA = 28, sez = []; for (let i = 0; i < nv; i++) if (Math.abs(g.pos[3 * i + 1] - Y0) < 0.06) sez.push([Math.atan2(g.pos[3 * i + 2] - cz, g.pos[3 * i] - cx), Math.hypot(g.pos[3 * i] - cx, g.pos[3 * i + 2] - cz)]);
sez.sort((u, v) => u[0] - v[0]);
const raggio = th => { let best = 0, bw = -1; for (let k = 0; k < sez.length; k++) { let d = Math.abs(sez[k][0] - th); d = Math.min(d, 2 * Math.PI - d); const w = Math.exp(-d * d / (2 * 0.22 * 0.22)); best += w * sez[k][1]; bw += 0; } let tw = 0; for (const q of sez) { let d = Math.abs(q[0] - th); d = Math.min(d, 2 * Math.PI - d); tw += Math.exp(-d * d / (2 * 0.22 * 0.22)); } return best / tw; };
const RING = Array.from({ length: NA }, (_, k) => { const th = -Math.PI + 2 * Math.PI * k / NA; return [Math.cos(th) * raggio(th), Math.sin(th) * raggio(th)]; });
// 3) altezza (z volare) della superficie d'appoggio lungo y, lisciata
const ALTE = ['d_p3', 'd_p2', 'd_cart', 'vp_dip'].map(n => new Indice([M.get(n)], 0.1));
const quota = (x, y) => { for (let z = 0.9; z > -1.3; z -= 0.01) { const p = [x, y, z]; for (const S of ALTE) { const r = S.vicino(p, 0.02); if (r && (r.d < 0.004 || S.dentro(p))) return z; } } return -1.3; };
const NR = 34, ys = Array.from({ length: NR }, (_, k) => Y0 + (YFIN - Y0) * k / (NR - 1));
let hq = ys.map(y => { let m = -9; for (let x = cx - 0.3; x <= cx + 0.3001; x += 0.05) m = Math.max(m, quota(x, y)); return m; });
for (let it = 0; it < 40; it++) hq = hq.map((v, k) => k === 0 || k === NR - 1 ? v : 0.25 * hq[k - 1] + 0.5 * v + 0.25 * hq[k + 1]);
// 4) loft: anelli da Y0 a YFIN; la sezione si allarga, si appiattisce e scende sulla faccia volare
const SEMI = RING.reduce((m, q) => Math.max(m, Math.abs(q[1])), 0), CH = 0.10;
const base = pos.length, anelli = [];
for (let k = 0; k < NR; k++) { const s = k / (NR - 1), e = s * s * (3 - 2 * s), y = ys[k], sx = 1 + (LARGH - 1) * e, sz = (1 - (1 - APPIATT) * e);
  const zs = hq[k] + GAP + SEMI * sz, zc = Math.max(cz + (zs - cz) * e, zs);   // mai sotto la superficie d'appoggio; poi la segue
  // aderenza: la faccia dorsale del tendine segue la quota locale della superficie (x, y), la volare le sta sopra di uno spessore
  const w = sstep(0.12, 0.55, s), ring = RING.map(([rx, rz]) => { const x = cx + rx * sx, zf = zc + rz * sz; if (w <= 0) return [x, y, zf]; const t = (rz + SEMI) / (2 * SEMI), zl = quota(x, y) + GAP + t * 2 * SEMI * sz; return [x, y, zf * (1 - w) + zl * w]; }); anelli.push(ring); for (const q of ring) { pos.push(q); dir.push(0, 127, 0); } }
for (let k = 0; k < NR - 1; k++) for (let j = 0; j < NA; j++) { const a = base + k * NA + j, b = base + k * NA + (j + 1) % NA, c = base + (k + 1) * NA + j, d = base + (k + 1) * NA + (j + 1) % NA; idx.push(a, b, c, b, d, c); }
// tappo distale: ventaglio sull'ultimo anello (l'estremità si fonde con l'osso)
const cen = pos.length; { const r = anelli[NR - 1]; pos.push([r.reduce((u, q) => u + q[0], 0) / NA, r[0][1], r.reduce((u, q) => u + q[2], 0) / NA]); dir.push(0, 127, 0); for (let j = 0; j < NA; j++) idx.push(cen, base + (NR - 1) * NA + (j + 1) % NA, base + (NR - 1) * NA + j); }
// 5) fuori da osso, cartilagine e placca: spinta minima solo sui vertici del loft, ripetuta con una lieve levigatura
let spinti = 0;
const fuori = i => { for (const S of solidi) { const r = S.vicino(pos[i], 0.1); if (!r) continue; if (S.dentro(pos[i])) { pos[i] = add(r.q, mul(r.d > 1e-5 ? unit(sub(r.q, pos[i])) : r.n, GAP + r.d)); spinti++; } else if (r.d < GAP) { pos[i] = add(r.q, mul(unit(sub(pos[i], r.q)), GAP)); spinti++; } } };
for (let it = 0; it < 4; it++) { for (let i = base; i < pos.length; i++) fuori(i);
  if (it < 3) { const q = pos.map(p => p.slice()); for (let k = 1; k < NR - 1; k++) for (let j = 0; j < NA; j++) { const i = base + k * NA + j, nb = [base + (k - 1) * NA + j, base + (k + 1) * NA + j, base + k * NA + (j + 1) % NA, base + k * NA + (j + NA - 1) % NA]; for (let a = 0; a < 3; a++) q[i][a] = 0.5 * pos[i][a] + 0.125 * nb.reduce((u, v) => u + pos[v][a], 0); } for (let i = base; i < pos.length; i++) pos[i] = q[i]; } }
log('anelli', NR, '; vertici nuovi', pos.length - base, '; spinte fuori dalle strutture', spinti);
M.set('d_fdp', { pos: Float32Array.from(pos.flat()), idx: Uint32Array.from(idx), dir: Int8Array.from(dir), tag: null });
M.salva();
