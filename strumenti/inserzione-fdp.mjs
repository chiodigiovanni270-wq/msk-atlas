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
const GAP = 0.004;                  // distanza dalle strutture lungo il decorso (cm)
const SOTTO_PUL = 0.010, FUORI_PUL = 0.005;   // margine sotto la faccia interna / esterna delle pulegge (cm)
// distanza dalla faccia interna delle pulegge (cm)
const SPESS_MIN = 0.030;            // semispessore minimo sotto le pulegge (cm)
const AFFONDA = 0.10;               // quanto l'estremità entra nell'osso (cm)
const ELL0 = 0.45, ELL1 = 0.62, CAP0 = 0.78;   // da ELL0 a ELL1 la sezione diventa un'ellisse liscia; da CAP0 la punta si arrotonda
const COLLASSA = +(process.env.COLLASSA ?? 8);   // passate di collasso dei triangoli rovesciati
const LATO_MAX = 0.03;              // lato massimo dei triangoli nel tratto deformato (cm, prima dell'allungamento)
const SOPRA_TEND = 0.006;           // distanza della faccia interna delle pulegge sollevate dalla faccia volare del tendine (cm)
const RACC = 0.22;                  // frazione del tratto in cui la deformazione cresce da zero (raccordo)

const M = new Modello(), O = new Modello(undefined, ORIGINALE);
/* 0) suddivisione: nel tratto da deformare la mesh originale ha triangoli lunghi fino a 3 mm; allungati e piegati, le loro corde
      tagliano la superficie curva (si vede il retro). Bisezione del lato più lungo finché tutti i lati sono ≤ LATO_MAX. */
const g = (() => { const g0 = O.get('d_fdp'), pos = Array.from(g0.pos), dir = Array.from(g0.dir), idx = Array.from(g0.idx);
  const P0 = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], L = (a, b) => Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);
  const inReg = i => pos[3 * i + 1] < YA + 0.05;
  for (let pass = 0; pass < 12; pass++) { const mid = new Map(); let split = 0; const out = [];
    const midV = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; if (!mid.has(k)) { const n = pos.length / 3; pos.push(...[0, 1, 2].map(c => (pos[3 * a + c] + pos[3 * b + c]) / 2)); dir.push(...[0, 1, 2].map(c => Math.round((dir[3 * a + c] + dir[3 * b + c]) / 2))); mid.set(k, n); } return mid.get(k); };
    // marca i lati da dividere (il più lungo di ogni triangolo troppo grande); poi divide ogni triangolo secondo i suoi lati marcati
    const mark = new Set(), key = (a, b) => a < b ? a + ',' + b : b + ',' + a;
    for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]]; if (!T.some(inReg)) continue; const e = [[T[0], T[1]], [T[1], T[2]], [T[2], T[0]]], l = e.map(([a, b]) => L(a, b)), m = l.indexOf(Math.max(...l)); if (l[m] > LATO_MAX) mark.add(key(...e[m])); }
    for (let t = 0; t < idx.length; t += 3) { const T = [idx[t], idx[t + 1], idx[t + 2]], e = [[T[0], T[1]], [T[1], T[2]], [T[2], T[0]]], mk = e.map(([a, b]) => mark.has(key(a, b)));
      const n = mk.filter(Boolean).length; if (!n) { out.push(...T); continue; } split++;
      if (n === 3) { const [m0, m1, m2] = e.map(([a, b]) => midV(a, b)); out.push(T[0], m0, m2, m0, T[1], m1, m2, m1, T[2], m0, m1, m2); continue; }
      // 1 o 2 lati: bisezione a ventaglio dal vertice opposto al primo lato marcato
      let r = mk.indexOf(true); const A = T[r], B = T[(r + 1) % 3], C = T[(r + 2) % 3], mAB = midV(A, B);
      if (n === 1) { out.push(A, mAB, C, mAB, B, C); continue; }
      if (mk[(r + 1) % 3]) { const mBC = midV(B, C); out.push(A, mAB, C, mAB, B, mBC, mAB, mBC, C); } else { const mCA = midV(C, A); out.push(A, mAB, mCA, mAB, B, C, mAB, C, mCA); } }
    idx.length = 0; idx.push(...out); if (!split) break; }
  return { pos: Float32Array.from(pos), dir: Int8Array.from(dir), idx: Uint32Array.from(idx), tag: null }; })();
const nv = g.pos.length / 3, P = i => [g.pos[3 * i], g.pos[3 * i + 1], g.pos[3 * i + 2]];
log('mesh suddivisa nel tratto distale:', nv, 'vertici,', g.idx.length / 3, 'triangoli');

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
const PUL = ['A4', 'C3', 'A5'].map(n => O.get(n));   // pulegge originali (questo strumento le adatta al tendine: vedi 6)
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
{ let a = AZ.slice(); for (let it = 0; it < 80; it++) a = a.map((v, k) => k === 0 || k === NR - 1 ? v : Math.min(0.25 * a[k - 1] + 0.5 * v + 0.25 * a[k + 1], SPZ[k], AZ[k])); AZ = a; }

/* 3) linea d'asse nuova: parte dall'asse originale, poggia sulla superficie, sotto il tetto; l'estremità affonda nell'osso */
const INS = ys.map(y => sstep(0, 1, (YINS - y) / (YINS - YFIN)));
let ZC = ys.map((y, k) => { const orig = inS(CZ, yOrig(y)), appoggio = SUP[k] + GAP + AZ[k], w = sstep(0, 0.35, sOf(y));
  return Math.max(orig * (1 - w) + appoggio * w, appoggio) - INS[k] * (2 * AZ[k] + GAP + AFFONDA); });
ZC = ZC.map((z, k) => Math.min(z, TT[k] - AZ[k]));
ZC[0] = inS(CZ, YA);
for (let it = 0; it < 15; it++) ZC = ZC.map((v, k) => k === 0 || k === NR - 1 ? v : Math.min(0.25 * ZC[k - 1] + 0.5 * v + 0.25 * ZC[k + 1], TT[k] - AZ[k]));
// la placca (e l'osso) prevalgono sul tetto: la faccia dorsale del tendine non scende mai sotto la superficie d'appoggio, fino all'inserzione
// faccia esterna delle pulegge attraverso la larghezza: lo spessore si riduce dove lo spazio tra pavimento e puleggia è minore
const PULI = PUL.map(G => new Indice([G], 0.1));
const ESTX = ys.map((y, k) => FF.map((f, j) => { const x = XC[k] + f * AX[k] * 1.05; let m = 9; for (const S of PULI) { for (let z = PROF[k][j] + 0.003; z < PROF[k][j] + 0.35; z += 0.004) { const q = [x, y, z]; if (S.dentro(q)) { let z2 = z; while (z2 < z + 0.3 && S.dentro([x, y, z2])) z2 += 0.003; m = Math.min(m, z2); break; } } } return m; }));
for (let k = 0; k < NR; k++) { let lim = 9; FF.forEach((f, j) => { if (ESTX[k][j] > 8) return; const w = Math.sqrt(Math.max(0.05, 1 - (f / 1.05) ** 2)); lim = Math.min(lim, (ESTX[k][j] - FUORI_PUL - PROF[k][j] - GAP) / (2 * w)); }); if (lim < 9) AZ[k] = Math.min(AZ[k], Math.max(SPESS_MIN, lim)); }
{ let a = AZ.slice(); for (let it = 0; it < 4; it++) a = a.map((v, k) => k === 0 || k === NR - 1 ? v : Math.min(v, 0.5 * (a[k - 1] + a[k + 1]) + 0.004)); AZ = a; }
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
// pieghe della mesh originale che la deformazione rovescia: un triangolo la cui normale è opposta a quella media dei triangoli
// adiacenti viene collassato sul suo baricentro (degenere, invisibile); ripetuto finché non ne restano
{ let tot = 0; const tri = g.idx.length / 3, adj = Array.from({ length: tri }, () => []), byEdge = new Map();
  for (let t = 0; t < tri; t++) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const u = g.idx[3 * t + a], v = g.idx[3 * t + b], k = u < v ? u + ',' + v : v + ',' + u; const o = byEdge.get(k); if (o !== undefined) { adj[t].push(o); adj[o].push(t); } else byEdge.set(k, t); }
  const nrm = t => { const A = [0, 1, 2].map(k => { const i = g.idx[3 * t + k]; return [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; }); return cross(sub(A[1], A[0]), sub(A[2], A[0])); };
  for (let it = 0; it < COLLASSA; it++) { let n = 0;
    for (let t = 0; t < tri; t++) { const ii = [g.idx[3 * t], g.idx[3 * t + 1], g.idx[3 * t + 2]]; if (ii.some(i => g.pos[3 * i + 1] > YA - 0.3)) continue;
      const fn = nrm(t), ln = Math.hypot(...fn); if (ln < 1e-12) continue; let m = [0, 0, 0]; for (const o of adj[t]) { const q = nrm(o), l = Math.hypot(...q); if (l > 1e-12) m = add(m, mul(q, 1 / l)); }
      const lm = Math.hypot(...m); if (lm < 1e-6) continue; if ((fn[0] * m[0] + fn[1] * m[1] + fn[2] * m[2]) / (ln * lm) < -0.2) { const cen = [0, 1, 2].map(a => ii.reduce((u, i) => u + pos[3 * i + a], 0) / 3); for (const i of ii) for (let a = 0; a < 3; a++) pos[3 * i + a] = cen[a]; n++; } }
    tot += n; if (!n) break; }
  log('triangoli rovesciati collassati', tot); }

/* 5) controllo: vertici dentro pulegge (prima dell'inserzione) e dentro osso/cartilagine */
const pp = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
for (const n of ['A4', 'C3', 'A5', 'vp_dip', 'd_cart', 'd_p2', 'd_p3']) { const S = new Indice([M.get(n)], 0.1); let k = 0, mx = 0;
  for (let i = 0; i < nv; i++) { const p = pp(i); if (p[1] > YA || (n === 'd_p3' && p[1] < YINS)) continue; if (S.dentro(p)) { k++; const r = S.vicino(p, 0.3); mx = Math.max(mx, r ? r.d : 0); } }
  log('vertici del tratto deformato dentro', n.padEnd(7), k, k ? '(max ' + mx.toFixed(3) + ')' : ''); }
/* 6) pulegge sopra il tendine: dove la puleggia originale scende fino alla placca (A5, C3) non c'è spazio per il tendine; la puleggia
      viene sollevata localmente (colonna intera: spessore invariato) quanto basta perché la sua faccia interna passi sopra il tendine,
      con raccordo dolce ai lati e alle estremità. Riparte sempre dalle pulegge originali. */
{ const H = 0.01, top = new Map(), kk = (x, y) => Math.round(x / H) + ',' + Math.round(y / H);
  for (let i = 0; i < nv; i++) { const y = pos[3 * i + 1]; if (y > YA) continue; const k = kk(pos[3 * i], y); top.set(k, Math.max(top.get(k) ?? -9, pos[3 * i + 2])); }
  const topAt = (x, y, r = 3) => { let m = -9; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const v = top.get((Math.round(x / H) + a) + ',' + (Math.round(y / H) + b)); if (v !== undefined) m = Math.max(m, v); } return m; };
  for (const n of ['C3', 'A5']) { const G = O.get(n), np = Float32Array.from(G.pos), nG = G.pos.length / 3;
    // fondo (faccia interna) della puleggia per colonna (x, y)
    const fondo = new Map(); for (let i = 0; i < nG; i++) { const k = kk(G.pos[3 * i], G.pos[3 * i + 1]); fondo.set(k, Math.min(fondo.get(k) ?? 9, G.pos[3 * i + 2])); }
    const lift = new Float32Array(nG); let mx = 0;
    for (let i = 0; i < nG; i++) { const x = G.pos[3 * i], y = G.pos[3 * i + 1], t = topAt(x, y); if (t < -8) continue; let f = 9; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const v = fondo.get((Math.round(x / H) + a) + ',' + (Math.round(y / H) + b)); if (v !== undefined) f = Math.min(f, v); }
      lift[i] = Math.max(0, t + SOPRA_TEND - f); }
    // raccordo: il sollevamento si propaga con decadimento dolce ai vertici vicini della puleggia (niente gradini)
    const nb = Array.from({ length: nG }, () => new Set()); for (let t = 0; t < G.idx.length; t += 3) { const [a, b, c] = [G.idx[t], G.idx[t + 1], G.idx[t + 2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
    let L = lift; for (let it = 0; it < 25; it++) { const o = L.slice(); for (let i = 0; i < nG; i++) { let m = o[i]; for (const j of nb[i]) m = Math.max(m, o[j] * 0.93); L[i] = m; } }
    for (let it = 0; it < 6; it++) { const o = L.slice(); for (let i = 0; i < nG; i++) { const J = [...nb[i]]; L[i] = Math.max(lift[i], 0.5 * o[i] + 0.5 * J.reduce((u, j) => u + o[j], 0) / J.length); } }
    for (let i = 0; i < nG; i++) { np[3 * i + 2] += L[i]; mx = Math.max(mx, L[i]); }
    M.set(n, { pos: np, idx: G.idx, dir: G.dir, tag: G.tag }); log('puleggia', n, 'sollevata sopra il tendine: max', (mx * 10).toFixed(2), 'mm'); } }
if (process.env.DEBUG) ys.forEach((y, k) => k % 5 === 0 && log(y.toFixed(2), 'SUP', SUP[k].toFixed(3), 'TETTO', TT[k].toFixed(3), 'ZC', ZC[k].toFixed(3), 'AZ', AZ[k].toFixed(3), 'AX', AX[k].toFixed(3)));
M.set('d_fdp', { pos, idx: g.idx, dir, tag: g.tag });
M.salva();
