/* Nervi del gomito (modelli/gomito-3d.html): divisioni, rami muscolari e nervi cutanei.

   Uso (dalla cartella del progetto):
     node strumenti/nervi-gomito.mjs              → riscrive i tubi `n_*` (NVP: punti, raggio massimo `r` e profilo del raggio `rp`) nel file del modello
     MODELLO=/tmp/copia.html node strumenti/nervi-gomito.mjs   → lavora su una copia
     node strumenti/nervi-gomito.mjs verifica     → non scrive: distanze dei nervi dal resto del modello

   Metodo e parametri: GUIDA_MODELLI.md. Va lanciato dopo vene-gomito.mjs e prima di lacerto-gomito.mjs (che solleva i nervi superficiali sopra il
   lacerto e usa i nervi profondi come ostacoli). I tronchi (mediano, radiale, ulnare, NIP, ramo superficiale) ripartono dal decorso della revisione
   `PARTENZA` (già scavato dai muscoli dagli strumenti precedenti); lo strumento cambia solo le divisioni, aggiunge i rami e rifà i cutanei.
   Idempotente: legge sempre `PARTENZA` per i nervi e il file attuale per tutto il resto. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const G = await import('./lib-modello.mjs');
const { clamp, sstep, log } = G;

const argv = process.argv.slice(2);
const VERIFICA = argv.includes('verifica');
const PARTENZA = '0e33d52';   // revisione da cui si leggono i tubi dei nervi (prima di questo strumento)
const leggiNVP = html => JSON.parse(html.match(/const NVP=(\{.*?\});\n/s)[1]);
const NVP = leggiNVP(G.M.html);
const NVP0 = VERIFICA ? NVP : leggiNVP(execFileSync('git', ['show', `${PARTENZA}:modelli/gomito-3d.html`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8'));

/* ============ Tabelle ============ */
const PASSO = 0.1;   // cm, campionamento dei tracciati
// Divisione terminale del radiale: il NIP è la continuazione del tronco (nasce nel punto di divisione E con lo stesso raggio e la stessa tangente, poi si
// assottiglia: giunto testa a testa, nessuna calotta); il ramo superficiale e il NIA (dal mediano) sono rami laterali: nascono dentro il tronco `Ld` cm a monte
// dell'origine (stesso asse, raggio ridotto `k0`) e se ne staccano gradualmente (Hermite tangente al tronco in partenza e al decorso originale a `Lb` cm
// dall'origine). Il raggio del tronco scende fino a `kE` all'origine (legge di Murray: r³ del tronco ≈ somma dei r³ dei rami).
const CONTINUAZIONI = [{ id: 'n_pin', padre: 'n_radiale', Lb: 1.8, kE: 0.8, Ld: 1.8, Lov: 0.7, Lext: 0.35, rFin: 0.13, rampa: 2.6 }];
const LATERALI = [
  { id: 'n_rad_sup', padre: 'n_radiale', Ld: 1.8, Lb: 1.8, k0: 0.4, rampa: 2.6, daFine: true },
  { id: 'n_interosseo_ant', padre: 'n_mediano', Ld: 1.4, Lb: 1.5, k0: 0.4, rampa: 2.6 },
];
// Rami muscolari: nascono nel tronco `run` cm a monte del punto d'ingresso (yIn = quota sul padre), corrono accostati al tronco dal lato del muscolo
// e entrano nel ventre (la punta affonda `affonda` cm). `guida` = punto di riferimento nel muscolo (si prende il vertice del muscolo più vicino a quel punto).
const RAMI = [
  { id: 'n_rm_pt', padre: 'n_mediano', muscolo: 'pt', yIn: 0.9, run: 1.5, r: 0.045, affonda: 0.14 },
  { id: 'n_rm_fcr', padre: 'n_mediano', muscolo: 'fcr', yIn: -1.2, run: 1.4, r: 0.04, affonda: 0.14 },
  { id: 'n_rm_pl', padre: 'n_mediano', muscolo: 'pl', yIn: -1.6, run: 1.6, r: 0.032, affonda: 0.12, guida: [1.62, -1.97, 2.41] },
  { id: 'n_rm_fds1', padre: 'n_mediano', muscolo: 'fds', yIn: -2.2, run: 1.2, r: 0.05, affonda: 0.16 },
  { id: 'n_rm_fds2', padre: 'n_mediano', muscolo: 'fds', yIn: -6.2, run: 1.6, r: 0.04, affonda: 0.14 },
  { id: 'n_rm_fcu', padre: 'n_ulnare', muscolo: 'fcu', yIn: -1.0, run: 1.6, r: 0.045, affonda: 0.14 },
  { id: 'n_rm_fdp_u', padre: 'n_ulnare', muscolo: 'fdp', yIn: -5.6, run: 1.8, r: 0.04, affonda: 0.14 },
  { id: 'n_rm_br', padre: 'n_radiale', muscolo: 'br', yIn: 5.6, run: 1.6, r: 0.045, affonda: 0.14 },
  { id: 'n_rm_ecrl', padre: 'n_radiale', muscolo: 'ecrl', yIn: 3.8, run: 1.6, r: 0.04, affonda: 0.14 },
  { id: 'n_rm_sup', padre: 'n_pin', muscolo: 'sup', yIn: -2.8, run: 1.2, r: 0.04, affonda: 0.12 },
  { id: 'n_rm_ecrb', padre: 'n_radiale', muscolo: 'ecrb', yIn: 0.0, run: 1.3, r: 0.035, affonda: 0.14, guida: [-3.18, -1.2, 0.6] },
  { id: 'n_rm_bic', padre: 'n_cut_lat', muscolo: 'bic', yIn: 10.0, run: 1.4, r: 0.05, affonda: 0.16 },
  { id: 'n_rm_brach', padre: 'n_cut_lat', muscolo: 'brach', yIn: 8.4, run: 1.4, r: 0.05, affonda: 0.16 },
];
// Nervi cutanei: tratti nuovi (guide, cm) che prolungano il decorso di partenza. `testa`: i punti nuovi stanno prima del decorso di partenza (muscolocutaneo);
// `coda`: dopo (cutanei mediali). `sup`: stanno nel sottocute (sopra la fascia; `supSotto`: solo sotto quella quota); gli altri passano nel piano tra bicipite e brachiale (`esenti`: i due muscoli
// non sono ostacoli sopra y = `yEsenti`, il nervo sta nello spazio tra i due). `r`/`rDopo`: raggio all'inizio e dopo l'uscita dal piano muscolare (cm); `tutto`: anche il decorso
// di partenza è ottimizzato (altrimenti restano fermi, salvo `RACCORDO` punti vicini al tratto nuovo).
const CUTANEI = {
  n_cut_lat: { testa: [[0.55, 12.0, 0.95], [0.2, 10.5, 0.9], [-0.15, 9.0, 0.93], [-0.5, 7.7, 1.05], [-0.95, 6.5, 1.3], [-1.25, 5.5, 1.65], [-1.2, 4.85, 2.2], [-1.05, 4.4, 2.6]],
    r: 0.1, rDopo: 0.065, esenti: ['bic', 'brach'], yEsenti: 5.8, sup: false, supSotto: 4.3, ini: 'taglio', tutto: true },
  n_cut_med_avambraccio: { coda: [[2.5, 6.4, 0.5], [2.55, 7.6, 0.45], [2.6, 9.0, 0.4], [2.6, 10.5, 0.3], [2.6, 12.0, 0.25]], sup: true, fin: 'taglio' },
  n_cut_med_braccio: { coda: [[2.93, 6.0, -0.33], [2.97, 5.0, -0.36], [3.0, 4.2, -0.4]], sup: true, fin: 'punta', ini: 'taglio', tutto: true },
};
const RACCORDO = 8;   // punti (0,8 cm) del decorso di partenza vicini al tratto nuovo lasciati liberi per raccordare le tangenti
const GIOCO = 0.03, K_PROF = 0.8, K_CUTE = 0.1, MARGINE_LAMINE = 0.2, TURNO = 5;   // cm; frazione del raggio libera dalle strutture; gradi massimi di svolta per segmento di 1 mm
const TAGLIO_Y = 11.6;   // oltre |y| = 11.6 l'estremo del tubo sta sul piano di taglio (come in vessel())

/* ============ Geometria dei tracciati ============ */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => { const l = len(a) || 1; return mul(a, 1 / l); };
const lerp3 = (a, b, t) => add(a, mul(sub(b, a), t));
function catmull(W, passo) {
  const out = []; const n = W.length, P = i => W[clamp(i, 0, n - 1)];
  for (let s = 0; s < n - 1; s++) {
    const p0 = s === 0 ? sub(mul(W[0], 2), W[1]) : P(s - 1), p1 = W[s], p2 = W[s + 1], p3 = s + 2 >= n ? sub(mul(W[n - 1], 2), W[n - 2]) : P(s + 2), m = 24;
    for (let u = 0; u < m; u++) { const t = u / m, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))); }
  }
  out.push(W[n - 1]); return risampiona(out, passo);
}
function risampiona(P, passo) {
  const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1])));
  const L = c[c.length - 1], n = Math.max(3, Math.round(L / passo)), out = []; let k = 0;
  for (let i = 0; i <= n; i++) { const s = L * i / n; while (k < c.length - 2 && c[k + 1] < s) k++; const u = (s - c[k]) / ((c[k + 1] - c[k]) || 1); out.push(add(P[k], mul(sub(P[k + 1], P[k]), u))); }
  return out;
}
const arco = P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1]))); return c; };
class Curva {
  constructor(P) { this.P = P; this.c = arco(P); this.L = this.c.at(-1); }
  at(s) { s = clamp(s, 0, this.L); let a = 0, b = this.c.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (this.c[m] <= s) a = m; else b = m; }
    return lerp3(this.P[a], this.P[b], (s - this.c[a]) / ((this.c[b] - this.c[a]) || 1)); }
  tan(s) { return nrm(sub(this.at(Math.min(this.L, s + 0.15)), this.at(Math.max(0, s - 0.15)))); }
  proietta(q) {   // punto più vicino: { s (cm), d, p }
    let bd = 1e18, bs = 0, bp = null;
    for (let i = 0; i + 1 < this.P.length; i++) { const a = this.P[i], ab = sub(this.P[i + 1], a), L2 = dot(ab, ab) || 1e-12; let u = clamp(dot(sub(q, a), ab) / L2, 0, 1);
      const p = add(a, mul(ab, u)), d = len(sub(q, p)); if (d < bd) { bd = d; bs = this.c[i] + u * (this.c[i + 1] - this.c[i]); bp = p; } }
    return { s: bs, d: bd, p: bp };
  }
  sArrivoY(y) { for (let i = 0; i + 1 < this.P.length; i++) if ((this.P[i][1] - y) * (this.P[i + 1][1] - y) <= 0) return this.c[i]; return this.L; }
}
function hermite(p0, m0, p1, m1, passo = PASSO) {
  const out = [], n = Math.max(8, Math.round(len(sub(p1, p0)) / passo * 1.5));
  for (let j = 0; j <= n; j++) { const u = j / n, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    out.push([0, 1, 2].map(c => h00 * p0[c] + h10 * m0[c] + h01 * p1[c] + h11 * m1[c])); }
  return risampiona(out, passo);
}

/* ============ Campi (strutture profonde, fascia, cute) ============ */
const SHEET = ['lacerto', 'cet', 'osborne', 'mio', 'setto_med', 'setto_lat', 'quadrato', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'lucl', 'anulare', 'caps', 'bor_olecr', 'bor_bicrad', 'cart_omero', 'cart_ulna', 'cart_radio'];
G.griglia([-6.4, -12.2, -5.0], [4.6, 12.2, 6.1], 0.08, 0);
const tutte = G.man.meshes.map(m => m.n).filter((n, i, a) => a.indexOf(n) === i);
const SOLIDI = tutte.filter(n => n !== 'cute' && !SHEET.includes(n));
const BANDA = 0.22;
const sdfDa = nomi => { const M = G.unione(nomi), { F } = G.sdf(M); G.esatta(F, nomi, BANDA); for (let q = 0; q < G.N; q++) if (Math.abs(F[q]) <= BANDA) F[q] = (M[q] ? -1 : 1) * Math.abs(F[q]); return F; };
log('campi: strutture profonde');
const Fs = sdfDa(SOLIDI);
const ESENTI_TUTTI = [...new Set(Object.values(CUTANEI).flatMap(c => c.esenti || []))];
const FsEsenti = ESENTI_TUTTI.length ? sdfDa(SOLIDI.filter(n => !ESENTI_TUTTI.includes(n))) : Fs;
const Fc = (() => { const M = G.unione(SOLIDI), { Do } = G.sdf(M); const F = G.chiuso(Do, 0.4); G.esatta(F, SOLIDI, 0); return F; })();
const Fh = (() => { const F = new Float32Array(G.N).fill(5); G.esatta(F, SHEET, BANDA); for (let q = 0; q < G.N; q++) F[q] = Math.abs(F[q]); return F; })();
log('campi: cute');
const Fk = G.campo(['cute']).F;
const dentroCute = p => -G.sample(Fk, p[0], p[1], p[2]);
const dSolidi = p => Math.min(G.sample(Fs, p[0], p[1], p[2]), G.sample(Fh, p[0], p[1], p[2]) + MARGINE_LAMINE);
const dSopraFascia = p => Math.min(G.sample(Fc, p[0], p[1], p[2]), G.sample(Fh, p[0], p[1], p[2]) + MARGINE_LAMINE);
const dEsenti = p => Math.min(G.sample(FsEsenti, p[0], p[1], p[2]), G.sample(Fh, p[0], p[1], p[2]) + MARGINE_LAMINE);
const gradDi = (f, p) => G.grad({ s: f }, p, 0.05);

// altri vasi (ostacoli): arterie e vene dal file attuale
const ALTRI = {};
for (const [id, P] of Object.entries(NVP.pts)) if (!id.startsWith('n_')) { const pts = catmull(P, 0.1), r = NVP.r[id] * 1.05; ALTRI[id] = { pts, r, c: new Curva(pts), lo: [0, 1, 2].map(k => Math.min(...pts.map(p => p[k])) - r - 0.6), hi: [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])) + r + 0.6) }; }
const vicinoAltri = (p, extra) => { let m = 9, id = ''; for (const [k, o] of Object.entries(ALTRI)) { if (p[0] < o.lo[0] || p[0] > o.hi[0] || p[1] < o.lo[1] || p[1] > o.hi[1] || p[2] < o.lo[2] || p[2] > o.hi[2]) continue; const d = o.c.proietta(p).d - o.r; if (d < m) { m = d; id = k; } } return { d: m, id }; };

/* ============ Costruzione dei tubi ============ */
// T[id] = { P (punti, passo PASSO), r (raggio massimo, cm), k: (s cm dall'inizio) → raggio relativo, ini/fin: 'taglio' | 'punta' | 'dentro' }
const T = {};
const nervi0 = Object.keys(NVP0.pts).filter(k => k.startsWith('n_'));
for (const id of nervi0) T[id] = { P: catmull(NVP0.pts[id], PASSO), r: NVP0.r[id], k: () => 1, ini: Math.abs(NVP0.pts[id][0][1]) > TAGLIO_Y ? 'taglio' : 'punta', fin: Math.abs(NVP0.pts[id].at(-1)[1]) > TAGLIO_Y ? 'taglio' : 'punta' };
const PARENT_NUOVI = {};   // id → padre (per la pagina)

/* --- continuazione (NIP) e rami laterali (ramo superficiale, NIA) --- */
// Giunto della continuazione: il figlio parte `Lov` cm a monte della divisione, coassiale con il tronco, con raggio che passa da 0,7 a 1,08 volte quello del tronco
// (le superfici si incrociano con pendenza dolce, nessun anello di giunzione); il tronco prosegue `Lext` cm dentro il figlio (la sua estremità resta dentro) e
// dal punto di divisione il raggio del figlio scende fino a `rFin`.
for (const C of CONTINUAZIONI) {
  const tp = T[C.padre], R = new Curva(tp.P), sE = R.L, tR = R.tan(sE), c = T[C.id], O = new Curva(c.P), E = R.P.at(-1), C1 = O.at(C.Lb), tC1 = O.tan(C.Lb), ch = len(sub(C1, E));
  const kT = s => (1 + (C.kE - 1) * sstep(sE - C.Ld, sE, s)) * (1 - 0.12 * sstep(sE, sE + C.Lext, s)), rT = s => tp.r * kT(s);
  const ov = R.P.filter((p, i) => R.c[i] >= sE - C.Lov - 1e-9), parte = hermite(E, mul(tR, ch), C1, mul(tC1, ch)), coda = O.P.filter((p, i) => O.c[i] > C.Lb + 0.05);
  c.P = risampiona([...ov, ...parte.slice(1), ...coda], PASSO); c.ini = 'dentro'; PARENT_NUOVI[C.id] = C.padre;
  const Cn = new Curva(c.P), Lov = R.L - (sE - C.Lov), rE = rT(sE) * 1.08;
  const rAbs = u => u <= Lov ? rT(sE - Lov + u) * (0.7 + 0.38 * sstep(0, Lov, u)) : rE + (C.rFin - rE) * sstep(0, C.rampa, u - Lov);
  c.r = rE; c.k = u => rAbs(u) / rE;
  const ext = []; for (let s = Lov + PASSO; s <= Lov + C.Lext + 1e-9; s += PASSO) ext.push(Cn.at(s));
  tp.P = [...tp.P, ...ext]; tp.fin = 'dentro'; tp.sE = sE;
  tp.k = kT;
}
for (const Lt of LATERALI) {
  const Pd = new Curva(T[Lt.padre].P), c = T[Lt.id], Cc = new Curva(c.P), pr = Pd.proietta(c.P[0]), sO = Lt.daFine ? (T[Lt.padre].sE ?? Pd.L) : pr.s, S0s = Math.max(0, sO - Lt.Ld), S0 = Pd.at(S0s), tS0 = Pd.tan(S0s);
  const C1 = Cc.at(Lt.Lb), tC1 = Cc.tan(Lt.Lb), ch = len(sub(C1, S0));
  const parte = hermite(S0, mul(tS0, ch), C1, mul(tC1, ch)), coda = Cc.P.filter((p, i) => Cc.c[i] > Lt.Lb + 0.05);
  c.P = risampiona([...parte, ...coda], PASSO); c.ini = 'dentro'; c.k = s => Lt.k0 + (1 - Lt.k0) * sstep(0, Lt.rampa, s); PARENT_NUOVI[Lt.id] = Lt.padre;
}

/* --- nervi cutanei: tratto nuovo ottimizzato come le vene superficiali (forze dalle strutture, dalla cute e dai vasi; richiamo alla guida; svolta limitata) --- */
function ottimizzaCutaneo(id, cfg, nuovi, iFissi) {   // nuovi: punti (tutto il tubo); iFissi: indici fissi (decorso di partenza)
  const P = nuovi.map(p => p.slice()), G0 = nuovi.map(p => p.slice()), n = P.length, r = cfg.rOpt;
  const campo = p => cfg.sup || (cfg.supSotto !== undefined && p[1] < cfg.supSotto) ? dSopraFascia(p) : cfg.esenti && p[1] > cfg.yEsenti ? dEsenti(p) : dSolidi(p);
  const nerviPts = Object.entries(T).filter(([k]) => k !== id).map(([k, v]) => ({ k, c: new Curva(v.P), r: v.r * 1.05 }));
  for (let it = 0; it < 250; it++) {
    const D = P.map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      if (iFissi(i)) continue;
      const p = P[i]; let f = [0, 0, 0];
      const dp = campo(p), need = K_PROF * r + GIOCO; if (dp < need) { const g = gradDi(campo, p), l = len(g) || 1; f = add(f, mul(g, 0.5 * (need - dp) / l)); }
      const dk = dentroCute(p), ck = K_CUTE * r; if (dk < ck) { const g = gradDi(dentroCute, p), l = len(g) || 1; f = add(f, mul(g, 0.35 * (ck - dk) / l)); }
      for (const o of Object.values(ALTRI)) { if (p[0] < o.lo[0] || p[0] > o.hi[0] || p[1] < o.lo[1] || p[1] > o.hi[1] || p[2] < o.lo[2] || p[2] > o.hi[2]) continue;
        const q = o.c.proietta(p), nd = r + o.r + GIOCO; if (q.d < nd) { const dir = q.d > 1e-4 ? mul(sub(p, q.p), 1 / q.d) : [0, 0, 1]; f = add(f, mul(dir, 0.8 * (nd - q.d))); } }
      for (const o of nerviPts) { const q = o.c.proietta(p), nd = r + o.r + GIOCO; if (q.d < nd) { const dir = q.d > 1e-4 ? mul(sub(p, q.p), 1 / q.d) : [0, 0, 1]; f = add(f, mul(dir, 0.4 * (nd - q.d))); } }
      f = add(f, mul(sub(G0[i], p), 0.02));
      D[i] = f;
    }
    let Q = P.map((p, i) => add(p, D[i]));
    for (let pass = 0; pass < 2; pass++) Q = Q.map((p, i) => { if (iFissi(i) || i === 0 || i === n - 1) return p; return add(p, mul(sub(mul(add(Q[i - 1], Q[i + 1]), 0.5), p), 0.5)); });
    for (let pass = 0; pass < 3; pass++) { const R = Q.map(p => p.slice());
      for (let i = 1; i < n - 1; i++) { if (iFissi(i)) continue; const a = nrm(sub(Q[i], Q[i - 1])), b = nrm(sub(Q[i + 1], Q[i])), th = Math.acos(clamp(dot(a, b), -1, 1)) * 180 / Math.PI;
        if (th > TURNO) { const w = Math.min(1, (th - TURNO) / TURNO); R[i] = add(Q[i], mul(sub(mul(add(Q[i - 1], Q[i + 1]), 0.5), Q[i]), w)); } }
      Q = R; }
    for (let i = 0; i < n; i++) { if (iFissi(i)) continue; P[i] = Q[i]; if ((i === 0 && cfg.ini === 'taglio') || (i === n - 1 && cfg.fin === 'taglio')) P[i][1] = G0[i][1]; }
  }
  return P;
}
function costruisciCutanei() {
  for (const [id, cfg] of Object.entries(CUTANEI)) {
    const t = T[id], vecchio = t.P; cfg.rOpt = cfg.r || t.r;
    let P, nFissoIni = 0, nFissoFin = 0;
    if (cfg.testa) {
      const nuovo = catmull([...cfg.testa, vecchio[0], vecchio[Math.min(vecchio.length - 1, 5)]], PASSO), k = nuovo.findIndex((p, i) => i > 3 && len(sub(p, vecchio[0])) < 0.05) ;
      const parte = nuovo.slice(0, k < 0 ? nuovo.length : k); P = [...parte, ...vecchio]; nFissoFin = vecchio.length; t.ini = cfg.ini || t.ini;
      const ott = ottimizzaCutaneo(id, cfg, P, i => !cfg.tutto && i >= P.length - nFissoFin + RACCORDO); t.P = risampiona(ott, PASSO);
    } else {
      const nuovo = catmull([vecchio.at(-1), ...cfg.coda], PASSO); P = [...vecchio, ...nuovo.slice(1)]; nFissoIni = vecchio.length;
      t.fin = cfg.fin || t.fin; t.ini = cfg.ini || t.ini; const ott = ottimizzaCutaneo(id, cfg, P, i => !cfg.tutto && i < nFissoIni - RACCORDO); t.P = risampiona(ott, PASSO);
    }
    if (cfg.testa) { t.r = cfg.r; const Ln = arco(t.P).at(-1), sJ = arco(t.P)[t.P.findIndex(p => len(sub(p, vecchio[0])) < 0.06)]; t.k = s => (cfg.rDopo / cfg.r) + (1 - cfg.rDopo / cfg.r) * (1 - sstep(0, sJ ?? Ln * 0.3, s)); }
    log('cutaneo', id, 'punti', t.P.length);
  }
}
if (!VERIFICA) costruisciCutanei();

/* --- rami muscolari --- */
const muscoliPos = {};
const posMuscolo = n => muscoliPos[n] || (muscoliPos[n] = G.REAL(n).pos);
function piuVicino(pos, q) { let d = 1e18, k = 0; for (let j = 0; j < pos.length; j += 3) { const x = pos[j] - q[0], y = pos[j + 1] - q[1], z = pos[j + 2] - q[2], dd = x * x + y * y + z * z; if (dd < d) { d = dd; k = j; } } return { d: Math.sqrt(d), p: [pos[k], pos[k + 1], pos[k + 2]] }; }
function costruisciRami() {
  for (const R of RAMI) {
    if (!T[R.padre]) throw new Error('padre mancante ' + R.padre);
    const Pd = new Curva(T[R.padre].P), rP = T[R.padre].r, sIn = Pd.sArrivoY(R.yIn), s0 = Math.max(0, sIn - R.run), Pe = Pd.at(sIn);
    const pos = posMuscolo(R.muscolo), Q = piuVicino(pos, R.guida ? R.guida : Pe).p;
    let u = nrm(sub(Q, Pe)); const tg = Pd.tan(sIn); u = nrm(sub(u, mul(tg, dot(u, tg))));   // direzione laterale, perpendicolare al tronco
    const pts = [];
    for (let s = s0; s <= sIn + 1e-9; s += PASSO) { const off = (rP * (T[R.padre].k(s) || 1) + 0.6 * R.r) * sstep(s0, s0 + 0.55 * R.run, s); pts.push(add(Pd.at(s), mul(u, off))); }
    const fine = pts.at(-1), dir = nrm(sub(Q, fine)), dQ = len(sub(Q, fine));
    const nIn = nrm(mul(G.grad({ s: p => G.sample(Fs, p[0], p[1], p[2]) }, Q, 0.05), -1));   // normale entrante nel muscolo (gradiente della distanza con segno)
    let tip = add(Q, mul(nIn, R.affonda)); for (let e = 0; e <= 0.8 && G.sample(Fs, tip[0], tip[1], tip[2]) > -0.12; e += 0.03) tip = add(Q, mul(nIn, R.affonda + e));   // la punta sta sempre dentro il muscolo (almeno 1,2 mm sotto la superficie)
    const dirT = nrm(sub(tip, fine)), dT = len(sub(tip, fine));
    // raccordo dalla corsa accostata al tronco fino al punto d'ingresso nel muscolo
    const tail = hermite(fine, mul(tg, Math.max(0.3, dT)), tip, mul(dirT, Math.max(0.3, dT)));
    let P = risampiona([...pts, ...tail.slice(1)], PASSO);
    for (let pass = 0; pass < 4; pass++) P = P.map((p, i) => i < 3 || i === P.length - 1 ? p : add(p, mul(sub(mul(add(P[i - 1], P[i + 1]), 0.5), p), 0.35)));
    const L = arco(P).at(-1);
    T[R.id] = { P, r: R.r, k: s => 0.5 + 0.5 * sstep(0, 0.5, s), ini: 'dentro', fin: 'punta', muscolo: R.muscolo }; PARENT_NUOVI[R.id] = R.padre;
    T[R.id].k = s => (0.5 + 0.5 * sstep(0, 0.45, s)) * (L - s < 0.45 ? 0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - ((0.45 - (L - s)) / 0.45) ** 2)) : 1);
  }
}

/* ============ Profili dei raggi ============ */
function profili() {
  const rmax = {}, rp = {};
  for (const [id, t] of Object.entries(T)) {
    const A = arco(t.P), L = A.at(-1), M = Math.max(25, Math.ceil(L / 0.1) + 1), k = [];
    for (let j = 0; j < M; j++) { const s = L * j / (M - 1); let f = t.k(s);
      if (t.ini === 'punta' && s < 0.8) { const q = (0.8 - s) / 0.8; f *= 0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - q * q)); }
      if (t.fin === 'punta' && L - s < 0.8) { const q = (0.8 - (L - s)) / 0.8; f *= 0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - q * q)); }
      k.push(f); }
    const m = Math.max(...k); rmax[id] = Math.round(t.r * m * 10000) / 10000; rp[id] = k.map(x => Math.round(x / m * 1000) / 1000);
  }
  return { rmax, rp };
}
const raggioDa = (k, s) => { const x = clamp(s, 0, 1) * (k.length - 1), i = Math.min(k.length - 2, Math.floor(x)); return k[i] + (k[i + 1] - k[i]) * (x - i); };

if (!VERIFICA) costruisciRami();
const { rmax, rp } = profili();

/* ============ Verifica ============ */
const PARENT_PAGINA = JSON.parse((G.M.html.match(/const PARENT=(\{.*?\});/s)[1]).replace(/([a-z_0-9]+):'/g, '"$1":"').replace(/'/g, '"'));
const PARENTELA = id => PARENT_NUOVI[id] || PARENT_PAGINA[id];
function statistiche(tubi) {   // tubi: id → { P, r(i) }
  const righe = [], ids = Object.keys(tubi);
  for (const id of ids) {
    const X = tubi[id]; let nD = 0, nK = 0, nV = 0, mD = 9, mK = 9, mV = 9, vId = '', svolta = 0;
    const sup = CUTANEI[id]?.sup, supSotto = CUTANEI[id]?.supSotto;
    for (let i = 0; i < X.P.length; i++) {
      const p = X.P[i], r = X.r(i), dp = (sup || (supSotto !== undefined && p[1] < supSotto) ? dSopraFascia(p) : dSolidi(p)) - K_PROF * r, dk = dentroCute(p) - K_CUTE * r, v = vicinoAltri(p), dv = v.d - r;
      if (dp < -0.002) nD++; if (dk < -0.002) nK++; if (dv < -0.002) nV++; mD = Math.min(mD, dp); mK = Math.min(mK, dk); if (dv < mV) { mV = dv; vId = v.id + ' @' + p.map(c => c.toFixed(1)).join(','); }
    }
    for (let i = 1; i < X.P.length - 1; i++) svolta = Math.max(svolta, Math.acos(clamp(dot(nrm(sub(X.P[i], X.P[i - 1])), nrm(sub(X.P[i + 1], X.P[i]))), -1, 1)) * 180 / Math.PI * (0.1 / (len(sub(X.P[i + 1], X.P[i - 1])) / 2 || 0.1)));
    righe.push(`${id.padEnd(24)} svolta ${svolta.toFixed(1).padStart(4)}°/mm  prof<0: ${String(nD).padStart(3)} (min ${(mD * 10).toFixed(1)} mm)  cute<0: ${String(nK).padStart(3)} (min ${(mK * 10).toFixed(1)} mm)  vasi: ${String(nV).padStart(3)} (min ${(mV * 10).toFixed(1)} mm ${vId})`);
  }
  for (const id of ids.filter(i => i.startsWith('n_rm_'))) { const P = tubi[id].P, tip = P.at(-1), d = G.sample(Fs, tip[0], tip[1], tip[2]); righe.push(`  ${id}: punta a ${(d * 10).toFixed(1)} mm dalla superficie (negativo = dentro un muscolo o un osso)`); }
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    const A = tubi[ids[a]], B = tubi[ids[b]], CB = new Curva(B.P); let n = 0, m = 9;
    const imparentati = PARENTELA(ids[a]) === ids[b] || PARENTELA(ids[b]) === ids[a] || (PARENTELA(ids[a]) && PARENTELA(ids[a]) === PARENTELA(ids[b]));
    if (imparentati) continue;
    for (let i = 0; i < A.P.length; i++) { const q = CB.proietta(A.P[i]), d = q.d - A.r(i) - B.r(Math.round(q.s / CB.L * (B.P.length - 1))); if (d < -0.002) n++; m = Math.min(m, d); }
    if (n) righe.push(`  nervo-nervo ${ids[a]} / ${ids[b]}: ${n} punti, min ${(m * 10).toFixed(1)} mm`);
  }
  return righe.join('\n');
}
const tubiFinali = {};
for (const [id, t] of Object.entries(T)) { const k = rp[id]; tubiFinali[id] = { P: t.P, r: i => rmax[id] * raggioDa(k, i / (t.P.length - 1)) }; }
if (VERIFICA) {
  const tub = {}; for (const id of Object.keys(NVP.pts).filter(k => k.startsWith('n_'))) { const k = NVP.rp?.[id], P = NVP.pts[id]; tub[id] = { P: catmull(P, 0.1), r: i => NVP.r[id] * (k ? raggioDa(k, i / (P.length - 1)) : 1) }; }
  console.log(statistiche(tub)); process.exit(0);
}
log('statistiche'); console.log(statistiche(tubiFinali));
for (const id of Object.keys(T)) console.log(id.padEnd(24), 'r max', (rmax[id] * 10).toFixed(2), 'mm; lunghezza', arco(T[id].P).at(-1).toFixed(1), 'cm');

/* ============ Scrittura ============ */
if (argv.includes('prova')) { writeFileSync(argv.find(a => a.startsWith('--prova='))?.split('=')[1] || 'nervi-prova.json', JSON.stringify({ pts: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.P])), r: rmax, rp })); process.exit(0); }
const round = P => P.map(p => p.map(x => Math.round(x * 1000) / 1000));
const risc = P => risampiona(P, 0.15);
for (const id of Object.keys(NVP.pts).filter(k => k.startsWith('n_'))) { delete NVP.pts[id]; delete NVP.r[id]; if (NVP.rp) delete NVP.rp[id]; }
NVP.rp = NVP.rp || {};
for (const [id, t] of Object.entries(T)) { NVP.pts[id] = round(risc(t.P)); NVP.r[id] = rmax[id]; NVP.rp[id] = rp[id]; }
G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
G.saveFile(G.repack());
