/* Inserzione del flessore profondo (FDP) del dito (modelli/polso-dito-3d.html, sezione dito, mesh `d_fdp`).

   Uso (dalla cartella del progetto):
     node strumenti/inserzione-fdp.mjs              → riscrive d_fdp nel file del modello
     MODELLO=/tmp/copia.html node strumenti/inserzione-fdp.mjs   → lavora su una copia

   Nel modello originale il tendine finisce sulla rima interfalangea distale (y ≈ −4,75). Il FDP si inserisce invece sulla faccia
   volare della base della falange distale. Qui non si costruisce una mesh nuova: si DEFORMA la mesh originale del tendine (stessi
   vertici, stessa superficie, stessa direzione delle fibre → stesso aspetto dall'inizio alla fine), come per l'EDC che termina
   direttamente sulla base della falange intermedia:
   - da YA in giù il tendine viene allungato fino a YFIN e piegato lungo una nuova linea d'asse;
   - la linea d'asse resta sotto la faccia interna delle pulegge (C3, A5) e sopra osso, cartilagine e placca volare; dove lo spazio
     sotto la puleggia è stretto il tendine si appiattisce;
   - verso la fine il tendine si allarga e si appiattisce appena e la sua estremità originale affonda nella base di P3 (inserzione);
   - la deformazione parte da zero a YA (raccordo graduale): nessuna giunzione.
   Riparte sempre dal FDP della revisione ORIGINALE, quindi si può rilanciare. Parametri in testa.
   Sistema di riferimento: y = asse del dito (distale verso −y), x = radio-ulnare, z = dorso (−) / volare (+). */
import { Modello, Indice, add, sub, mul, cross, unit, clamp, sstep, log } from './lib-dito.mjs';

const ORIGINALE = 'ce9a824';
const YA = -3.85;                   // inizio della deformazione (subito distale alla A4)
const YEND0 = -4.75, YFIN = -5.28;  // fine del tendine originale e fine nuova (sulla base di P3)
const YINS = -4.97;                 // da qui l'estremità scende nell'osso (inserzione)
const LARGH = 1.30, SPESS = 0.80;   // allargamento e spessore relativi all'estremità
const GAP = 0.008;                  // distanza dalle strutture lungo il decorso (cm)
const SOTTO_PUL = 0.010, FUORI_PUL = 0.012;   // margine sotto la faccia interna / esterna delle pulegge (cm)
// distanza dalla faccia interna delle pulegge (cm)
const SPESS_MIN = 0.012;            // semispessore minimo sotto le pulegge (cm)
const AFFONDA = 0.10;               // quanto l'estremità entra nell'osso (cm)
const ELL0 = 0.45, ELL1 = 0.62, CAP0 = 0.78;   // da ELL0 a ELL1 la sezione diventa un'ellisse liscia; da CAP0 la punta si arrotonda
const COLLASSA = +(process.env.COLLASSA ?? 4);   // passate di collasso dei triangoli rovesciati
const RACC = 0.22;                  // frazione del tratto in cui la deformazione cresce da zero (raccordo)

const M = new Modello(), O = new Modello(undefined, ORIGINALE);
const g = O.get('d_fdp'), nv = g.pos.length / 3, P = i => [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]];

/* 1) asse e semispessori del tendine originale, per fette lungo y (lisciati) */
const NS = 70, yS = Array.from({ length: NS }, (_, k) => YA + 0.25 + (YEND0 - 0.02 - (YA + 0.25)) * k / (NS - 1));
let CX = [], CZ = [], HX = [], HZ = [];
for (const y of yS) { let lo = [9, 9], hi = [-9, -9], n = 0; for (let i = 0; i < nv; i++) if (Math.abs(g.pos[3 * i + 1] - y) < 0.05) { n++; lo[0] = Math.min(lo[0], g.pos[3 * i]); hi[0] = Math.max(hi[0], g.pos[3 * i]); lo[1] = Math.min(lo[1], g.pos[3 * i + 2]); hi[1] = Math.max(hi[1], g.pos[3 * i + 2]); }
  CX.push((lo[0] + hi[0]) / 2); CZ.push((lo[1] + hi[1]) / 2); HX.push((hi[0] - lo[0]) / 2); HZ.push((hi[1] - lo[1]) / 2); }
const liscia = (A, it = 30) => { let o = A.slice(); for (let r = 0; r < it; r++) o = o.map((v, k) => k === 0 || k === NS - 1 ? v : 0.25 * o[k - 1] + 0.5 * v + 0.25 * o[k + 1]); return o; };
CX = liscia(CX); CZ = liscia(CZ); HX = liscia(HX, 10); HZ = liscia(HZ, 10);
const inS = (A, y) => { const f = clamp((y - yS[0]) / (yS[NS - 1] - yS[0]), 0, 1) * (NS - 1), k = Math.min(NS - 2, Math.floor(f)), t = f - k; return A[k] * (1 - t) + A[k + 1] * t; };
const hz0 = inS(HZ, YA), hx0 = inS(HX, YA);
log('tendine originale a y', YA, ': centro', inS(CX, YA).toFixed(3), inS(CZ, YA).toFixed(3), 'semiassi', hx0.toFixed(3), hz0.toFixed(3));

/* 2) superficie d'appoggio (ossa, cartilagine, placca) e tetto (faccia interna delle pulegge) lungo y */
const ALTE = ['d_p3', 'd_p2', 'd_cart', 'vp_dip'].map(n => new Indice([M.get(n)], 0.1));
const quota = (x, y) => { for (let z = 0.9; z > -1.3; z -= 0.004) { const p = [x, y, z]; for (const S of ALTE) { const r = S.vicino(p, 0.02); if (r && (r.d < 0.002 || S.dentro(p))) return z; } } return -1.3; };
const PUL = ['A4', 'C3', 'A5'].map(n => M.get(n));
const NR = 70, ys = Array.from({ length: NR }, (_, k) => YA + (YFIN - YA) * k / (NR - 1)), sOf = y => clamp((YA - y) / (YA - YFIN), 0, 1);
const yOrig = y => YA + (YEND0 - YA) * sOf(y);                       // y del tendine originale che finisce a y (dopo l'allungamento)
const XC = ys.map(y => inS(CX, yOrig(y)));
const AX = ys.map(y => inS(HX, yOrig(y)) * (1 + (LARGH - 1) * sstep(0.5, 1, sOf(y))));
let AZ = ys.map(y => inS(HZ, yOrig(y)) * (1 - (1 - SPESS) * sstep(0.5, 1, sOf(y))));
const FF = Array.from({ length: 17 }, (_, j) => -1 + j / 8);   // posizioni attraverso la larghezza del tendine
const PROF = ys.map((y, k) => FF.map(f => quota(XC[k] + f * AX[k] * 1.05, y)));   // pavimento (osso, cartilagine, placca) attraverso la larghezza
const SUP0 = PROF.map(r => Math.max(...r));
let SUP = SUP0.slice(); for (let it = 0; it < 40; it++) { SUP = SUP.map((v, k) => k === 0 || k === NR - 1 ? v : 0.25 * SUP[k - 1] + 0.5 * v + 0.25 * SUP[k + 1]); SUP = SUP.map((v, k) => clamp(v, SUP0[k], SUP0[k] + 0.02)); }
// tetto: per ogni fetta, faccia interna (dorsale) del tetto delle pulegge sopra il tendine (solo la parte centrale, non i lati)
const TET = ys.map((y, k) => { let m = 9; for (const G of PUL) for (let i = 0; i < G.pos.length / 3; i++) { if (Math.abs(G.pos[3 * i + 1] - y) > 0.025 || Math.abs(G.pos[3 * i] - XC[k]) > AX[k] * 0.7) continue; const z = G.pos[3 * i + 2]; if (z > SUP0[k] - 0.02) m = Math.min(m, z); } return m < 9 ? m - SOTTO_PUL : 9; });
// faccia ESTERNA delle pulegge sopra il tendine: il tendine può stare nello spessore della puleggia (opaca) ma non uscirne
const EST = ys.map((y, k) => { let m = -9; for (const G of PUL) for (let i = 0; i < G.pos.length / 3; i++) { if (Math.abs(G.pos[3 * i + 1] - y) > 0.025 || Math.abs(G.pos[3 * i] - XC[k]) > AX[k] * 1.05) continue; const z = G.pos[3 * i + 2]; if (z > SUP0[k]) m = Math.max(m, z); } return m > -9 ? m - FUORI_PUL : 9; });
for (let k = 0; k < NR; k++) TET[k] = Math.max(TET[k], Math.min(EST[k], 9));   // dove la puleggia poggia sulla placca, il limite è la sua faccia esterna
let TT = TET.slice(); for (let it = 0; it < 4; it++) TT = TT.map((v, k) => Math.min(v, k > 0 ? TT[k - 1] + 0.02 : v, k < NR - 1 ? TT[k + 1] + 0.02 : v));
// spessore: dove lo spazio tra appoggio e tetto è minore, il tendine si appiattisce
const SPZ = ys.map((y, k) => Math.max(SPESS_MIN, (TT[k] - SUP[k] - GAP) / 2));   // dove il tendine passa sulla placca sotto la puleggia, si assottiglia
for (let it = 0; it < 3; it++) AZ = AZ.map((v, k) => Math.min(v, SPZ[k]));
{ let a = AZ.slice(); for (let it = 0; it < 30; it++) a = a.map((v, k) => k === 0 || k === NR - 1 ? v : Math.min(0.25 * a[k - 1] + 0.5 * v + 0.25 * a[k + 1], SPZ[k], AZ[k])); AZ = a; }

/* 3) linea d'asse nuova: parte dall'asse originale, poggia sulla superficie, sotto il tetto; l'estremità affonda nell'osso */
const INS = ys.map(y => sstep(0, 1, (YINS - y) / (YINS - YFIN)));
let ZC = ys.map((y, k) => { const orig = inS(CZ, yOrig(y)), appoggio = SUP[k] + GAP + AZ[k], w = sstep(0, 0.35, sOf(y));
  return Math.max(orig * (1 - w) + appoggio * w, appoggio) - INS[k] * (2 * AZ[k] + GAP + AFFONDA); });
ZC = ZC.map((z, k) => Math.min(z, TT[k] - AZ[k]));
ZC[0] = inS(CZ, YA);
for (let it = 0; it < 15; it++) ZC = ZC.map((v, k) => k === 0 || k === NR - 1 ? v : Math.min(0.25 * ZC[k - 1] + 0.5 * v + 0.25 * ZC[k + 1], TT[k] - AZ[k]));
// la placca (e l'osso) prevalgono sul tetto: la faccia dorsale del tendine non scende mai sotto la superficie d'appoggio, fino all'inserzione
// la faccia dorsale della sezione ellittica (alta ai lati) deve stare sopra il pavimento in ogni punto della larghezza
const MINZ = ys.map((y, k) => Math.max(...FF.map((f, j) => PROF[k][j] + GAP + AZ[k] * Math.sqrt(Math.max(0, 1 - Math.min(1, Math.abs(f / 1.05)) ** 2)))));
ZC = ZC.map((z, k) => { const w = sstep(0, 0.6, INS[k]); return Math.max(z, MINZ[k]) * (1 - w) + z * w; });   // nell'inserzione il vincolo si spegne gradualmente (niente scalini)
for (let it = 0; it < 6; it++) ZC = ZC.map((v, k) => k === 0 || k === NR - 1 || INS[k] <= 0 ? v : 0.25 * ZC[k - 1] + 0.5 * v + 0.25 * ZC[k + 1]);
const C = ys.map((y, k) => [XC[k], y, ZC[k]]);
const inR = (A, s) => { const f = clamp(s, 0, 1) * (NR - 1), k = Math.min(NR - 2, Math.floor(f)), t = f - k; return Array.isArray(A[0]) ? A[k].map((v, a) => v * (1 - t) + A[k + 1][a] * t) : A[k] * (1 - t) + A[k + 1] * t; };
const TAN = C.map((c, k) => unit(sub(C[Math.min(NR - 1, k + 1)], C[Math.max(0, k - 1)])));

/* 4) deformazione: ogni vertice distale a YA conserva la sua posizione relativa all'asse originale (x, z), scalata, nel riferimento
      della nuova linea d'asse; il peso cresce da zero a YA (raccordo) */
// raggio normalizzato massimo della sezione originale per fascia lungo il tendine e settore angolare (superficie esterna)
const NB_S = 24, NB_T = 36, rbin = (s, th) => Math.min(NB_S - 1, Math.floor(s * NB_S)) * NB_T + Math.min(NB_T - 1, Math.floor((th + Math.PI) / (2 * Math.PI) * NB_T));
const RMAX = new Float32Array(NB_S * NB_T);
for (let i = 0; i < nv; i++) { const p = P(i); if (p[1] >= YA) continue; const s = clamp((YA - p[1]) / (YA - YEND0), 0, 1), u = (p[0] - inS(CX, p[1])) / (inS(HX, p[1]) || 1e-3), w = (p[2] - inS(CZ, p[1])) / (inS(HZ, p[1]) || 1e-3);
  const b = rbin(s, Math.atan2(w, u)); RMAX[b] = Math.max(RMAX[b], Math.hypot(u, w)); }
for (let it = 0; it < 2; it++) { const o = RMAX.slice(); for (let a = 0; a < NB_S; a++) for (let t = 0; t < NB_T; t++) { const k = a * NB_T + t; RMAX[k] = Math.max(o[k], 0.85 * Math.max(o[a * NB_T + (t + 1) % NB_T], o[a * NB_T + (t + NB_T - 1) % NB_T])); } }
const pos = Float32Array.from(g.pos), dir = Int8Array.from(g.dir);
let mossi = 0;
for (let i = 0; i < nv; i++) {
  const p = P(i); if (p[1] >= YA) continue;
  const s = clamp((YA - p[1]) / (YA - YEND0), 0, 1), yo = p[1], cx = inS(CX, yo), cz = inS(CZ, yo), hx = inS(HX, yo) || 1e-3, hz = inS(HZ, yo) || 1e-3;
  const c = inR(C, s), T = unit(inR(TAN, s)), Xa = unit(cross([0, 0, 1], T)), Za = unit(cross(T, Xa));
  const ax = inR(AX, s), az = inR(AZ, s); let ox = (p[0] - cx) * ax / hx, oz = (p[2] - cz) * az / hz;
  // estremità: la sezione irregolare (sfilacciata nel modello originale) passa a un'ellisse liscia e la punta si arrotonda
  { const e = sstep(ELL0, ELL1, s), th = Math.atan2(oz / az, ox / ax), rc = s > CAP0 ? Math.sqrt(Math.max(0, 1 - Math.pow((s - CAP0) / (1 - CAP0), 2))) : 1;
    // le pareti interne della mesh originale (raggio minore del massimo a quell'angolo) restano proporzionalmente all'interno
    const rho = Math.min(1, Math.hypot(ox / ax, oz / az) / (RMAX[rbin(s, th)] || 1));
    ox = (ox * (1 - e) + Math.cos(th) * ax * rho * e) * (e > 0 ? rc : 1); oz = (oz * (1 - e) + Math.sin(th) * az * rho * e) * (e > 0 ? rc : 1); }
  // oltre la fine dell'asse originale (estremità arrotondata) la quota lungo l'asse si conserva
  const dy = 0;   // la punta è chiusa dall'arrotondamento della sezione
  const q = add(add(c, add(mul(Xa, ox), mul(Za, oz))), mul(T, -dy));
  const w = sstep(0, RACC, s); for (let a = 0; a < 3; a++) pos[3 * i + a] = p[a] + (q[a] - p[a]) * w;
  // direzione delle fibre ruotata con il riferimento
  const d = [g.dir[3 * i], g.dir[3 * i + 1], g.dir[3 * i + 2]], d2 = add(add(mul(Xa, d[0]), mul(T, -d[1])), mul(Za, d[2]));
  for (let a = 0; a < 3; a++) dir[3 * i + a] = Math.round(clamp(d[a] + (d2[a] - d[a]) * w, -127, 127));
  mossi++;
}
log('vertici deformati', mossi, 'su', nv);
// pieghe della mesh originale che la deformazione rovescia (faccia esterna rivolta verso l'asse): i triangoli rovesciati vengono
// collassati sul loro baricentro (degeneri, invisibili), i vicini si raccordano
{ let tot = 0; for (let it = 0; it < COLLASSA; it++) { let n = 0;
    for (let t = 0; t < g.idx.length; t += 3) { const ii = [g.idx[t], g.idx[t + 1], g.idx[t + 2]]; if (ii.some(i => g.pos[3 * i + 1] > YA - 0.4 || (YA - g.pos[3 * i + 1]) / (YA - YEND0) > CAP0 - 0.04)) continue;
      const A = ii.map(i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), fn = cross(sub(A[1], A[0]), sub(A[2], A[0])); const ln = Math.hypot(...fn); if (ln < 1e-9) continue;
      const cen = [0, 1, 2].map(a => (A[0][a] + A[1][a] + A[2][a]) / 3), s0 = clamp((YA - g.pos[3 * ii[0] + 1]) / (YA - YEND0), 0, 1), c = inR(C, s0), out = sub(cen, c); out[1] = 0;
      if ((fn[0] * out[0] + fn[2] * out[2]) / (ln * (Math.hypot(out[0], out[2]) || 1)) < -0.6) { for (const i of ii) for (let a = 0; a < 3; a++) pos[3 * i + a] = cen[a]; n++; } }
    tot += n; if (!n) break; }
  log('triangoli rovesciati collassati', tot); }

/* 5) controllo: vertici dentro pulegge (prima dell'inserzione) e dentro osso/cartilagine */
const pp = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
for (const n of ['A4', 'C3', 'A5', 'vp_dip', 'd_cart', 'd_p2', 'd_p3']) { const S = new Indice([M.get(n)], 0.1); let k = 0, mx = 0;
  for (let i = 0; i < nv; i++) { const p = pp(i); if (p[1] > YA || (n === 'd_p3' && p[1] < YINS)) continue; if (S.dentro(p)) { k++; const r = S.vicino(p, 0.3); mx = Math.max(mx, r ? r.d : 0); } }
  log('vertici del tratto deformato dentro', n.padEnd(7), k, k ? '(max ' + mx.toFixed(3) + ')' : ''); }
if (process.env.DEBUG) ys.forEach((y, k) => k % 5 === 0 && log(y.toFixed(2), 'SUP', SUP[k].toFixed(3), 'TETTO', TT[k].toFixed(3), 'ZC', ZC[k].toFixed(3), 'AZ', AZ[k].toFixed(3), 'AX', AX[k].toFixed(3)));
M.set('d_fdp', { pos, idx: g.idx, dir, tag: g.tag });
M.salva();
