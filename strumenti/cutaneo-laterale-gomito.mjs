/* Cutaneo laterale dell'avambraccio (modelli/gomito-3d.html): relazione con le vene superficiali nei due incroci.

   Anatomia (Standring, Gray's Anatomy 42ª ed.; Yamada et al., Clin Anat 2008;21:307-313): il nervo emerge lateralmente al tendine del bicipite, buca la fascia
   e scende nel sottocute DIETRO (in profondità a) la vena cefalica e la mediana del gomito, davanti al brachioradiale. Nei 128 arti di Yamada era più profondo
   della mediana del gomito in 56 casi e la mediana lo scavalcava in 8; non risultano casi con il nervo sopra la vena. La variabilità sopra/sotto riguarda il
   cutaneo mediale. Nel modello di partenza il nervo passava SOPRA la mediana del gomito (x −2,0; y +0,8) e sotto la mediana cefalica (x −3,2; y −3,4) con i
   tubi sovrapposti.

   Uso (dalla cartella del progetto):
     node strumenti/cutaneo-laterale-gomito.mjs verifica   → non scrive: posizione del nervo rispetto alle vene agli incroci e distanze dalle strutture
     node strumenti/cutaneo-laterale-gomito.mjs            → riscrive solo i punti di `n_cut_lat` e `v_mediana_cefalica` in NVP (stesso numero di punti: i profili `rp` restano validi)
     MODELLO=/tmp/copia.html node strumenti/cutaneo-laterale-gomito.mjs   → lavora su una copia

   Metodo: spostamenti solo lungo z (anteriore +), con un profilo cos² (nullo alle estremità della finestra, quindi raccordo liscio e nessun punto fisso da gestire):
   (1) mediana del gomito: il nervo scende sotto la vena fino a lasciare `GIOCO` tra le superfici (la vena non si sposta: tra muscolo e cute c'è lo spazio);
   (2) mediana cefalica: il nervo poggia sul brachioradiale e la vena viene sollevata sopra di lui (il nervo sale solo quanto serve per uscire dal muscolo).
   Va lanciato dopo `nervi-gomito.mjs`, `vene-gomito.mjs` e `lacerto-gomito.mjs`; se si rilanciano, rilanciare anche questo (idempotente: il bersaglio è assoluto,
   due lanci danno lo stesso file). Cefalica: la vena sta sul margine laterale del brachioradiale, quindi nessun incrocio (vedi GUIDA_MODELLI.md). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { clamp, log } = G;

const VERIFICA = process.argv.slice(2).includes('verifica');
const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);

/* ============ Parametri ============ */
const NERVO = 'n_cut_lat';
const INCROCI = [
  { vena: 'v_mediana_cub', modo: 'nervo-sotto', semi: 2.0 },       // semi = semi-larghezza (cm di tracciato) della finestra di spostamento
  { vena: 'v_mediana_cefalica', modo: 'vena-sopra', semi: 1.6 },
];
const GIOCO = 0.03, K_PROF = 0.8, K_CUTE = 0.1, MARGINE_LAMINE = 0.2, BANDA = 0.22;   // cm; frazione del raggio libera da strutture e cute (come nervi-gomito.mjs)
const FATT_R = 1.05;   // raggio effettivo degli ostacoli, come negli altri strumenti

/* ============ Geometria ============ */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = a => Math.hypot(a[0], a[1], a[2]);
const arco = P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1]))); return c; };
const raggioDa = (k, f) => { const x = clamp(f, 0, 1) * (k.length - 1), i = Math.min(k.length - 2, Math.floor(x)); return k[i] + (k[i + 1] - k[i]) * (x - i); };
const raggio = (id, i) => { const n = NVP.pts[id].length, k = NVP.rp?.[id]; return NVP.r[id] * (k ? raggioDa(k, i / (n - 1)) : 1); };
function proietta(P, q) {   // punto più vicino di una polilinea: { d, i (segmento), u, p }
  let bd = 1e18, bi = 0, bu = 0, bp = null;
  for (let i = 0; i + 1 < P.length; i++) { const a = P[i], ab = sub(P[i + 1], a), L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12, u = clamp((sub(q, a)[0] * ab[0] + sub(q, a)[1] * ab[1] + sub(q, a)[2] * ab[2]) / L2, 0, 1);
    const p = [a[0] + ab[0] * u, a[1] + ab[1] * u, a[2] + ab[2] * u], d = len(sub(q, p)); if (d < bd) { bd = d; bi = i; bu = u; bp = p; } }
  return { d: bd, i: bi, u: bu, p: bp };
}
const bump = (d, semi) => d >= semi ? 0 : Math.cos(Math.PI / 2 * d / semi) ** 2;   // 1 al centro, 0 al bordo, derivata nulla ai due estremi

/* ============ Campi (strutture profonde, fascia, cute) ============ */
const SHEET = ['lacerto', 'osborne', 'mio', 'setto_med', 'setto_lat', 'quadrato', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'lucl', 'anulare', 'caps', 'bor_olecr', 'bor_bicrad', 'cart_omero', 'cart_ulna', 'cart_radio'];
G.griglia([-6.4, -9.8, -5.0], [1.6, 5.2, 6.1], 0.08, 0);
const tutte = G.man.meshes.map(m => m.n).filter((n, i, a) => a.indexOf(n) === i && n !== 'sup_prof');
const SOLIDI = tutte.filter(n => n !== 'cute' && !SHEET.includes(n));
log('campi: strutture profonde');
const Fs = (() => { const M = G.unione(SOLIDI), { F } = G.sdf(M); G.esatta(F, SOLIDI, BANDA); for (let q = 0; q < G.N; q++) if (Math.abs(F[q]) <= BANDA) F[q] = (M[q] ? -1 : 1) * Math.abs(F[q]); return F; })();
const Fc = (() => { const M = G.unione(SOLIDI), { Do } = G.sdf(M); const F = G.chiuso(Do, 0.4); G.esatta(F, SOLIDI, 0); return F; })();
const Fh = (() => { const F = new Float32Array(G.N).fill(5); G.esatta(F, SHEET, BANDA); for (let q = 0; q < G.N; q++) F[q] = Math.abs(F[q]); return F; })();
log('campi: cute');
const Fk = G.campo(['cute']).F;
const dentroCute = p => -G.sample(Fk, p[0], p[1], p[2]);
const dSopraFascia = p => Math.min(G.sample(Fc, p[0], p[1], p[2]), G.sample(Fh, p[0], p[1], p[2]) + MARGINE_LAMINE);   // per i tubi nel sottocute

/* ============ Relazione nervo-vena ============ */
function relazione(nome, nerv, ven) {   // nervo/vena: punti; ritorna i dati all'incrocio in proiezione (x, y) e la distanza minima tra le superfici
  const idN = NERVO, rN = i => raggio(idN, i) * FATT_R; let best = null;
  for (let i = 0; i < nerv.length; i++) { const q = proietta(ven.P.map(p => [p[0], p[1], 0]), [nerv[i][0], nerv[i][1], 0]); if (!best || q.d < best.dxy) best = { i, dxy: q.d, j: q.i + q.u, p: q.p }; }
  const jv = Math.min(ven.P.length - 1, Math.round(best.j)), zV = ven.P[jv][2];
  let dmin = 1e9, im = 0; for (let i = 0; i < nerv.length; i++) { const q = proietta(ven.P, nerv[i]), d = q.d - rN(i) - raggio(ven.id, Math.round(q.i + q.u)) * FATT_R; if (d < dmin) { dmin = d; im = i; } }
  return { nome, i: best.i, xy: best.p.slice(0, 2), zN: nerv[best.i][2], zV, dz: nerv[best.i][2] - zV, dmin, im };
}

const nerv0 = NVP.pts[NERVO].map(p => p.slice()), cN = arco(nerv0);
const rapporto = (nervoPts, veneMod = {}) => INCROCI.map(I => relazione(I.vena, nervoPts, { id: I.vena, P: veneMod[I.vena] || NVP.pts[I.vena] }));
const stampa = (titolo, R) => { console.log(titolo); for (const r of R) console.log(`  ${r.nome.padEnd(20)} incrocio (x ${r.xy[0].toFixed(2)}, y ${r.xy[1].toFixed(2)})  z nervo ${r.zN.toFixed(3)}  z vena ${r.zV.toFixed(3)}  Δz ${r.dz >= 0 ? '+' : ''}${r.dz.toFixed(3)} (${r.dz >= 0 ? 'nervo SOPRA' : 'nervo SOTTO'})  distanza minima tra le superfici ${(r.dmin * 10).toFixed(2)} mm`); };
const stato = (nervoPts, veneMod = {}) => {   // margini dal resto del modello vicino agli incroci (entro 2 cm in x, y dall'incrocio; la griglia dei campi finisce a y −9,8)
  const vicino = (p, R) => R.some(r => Math.hypot(p[0] - r.xy[0], p[1] - r.xy[1]) < 2);
  const R = rapporto(nervoPts, veneMod);
  let mF = 9, mC = 9, mFp = null; nervoPts.forEach((p, i) => { if (!vicino(p, R)) return; const r = raggio(NERVO, i); const df = dSopraFascia(p) - K_PROF * r, dk = dentroCute(p) - K_CUTE * r; if (df < mF) { mF = df; mFp = p; } mC = Math.min(mC, dk); });
  const veneStato = Object.keys(veneMod).map(id => { let m = 9, mk = 9; const Ri = R.find(r => r.nome === id); veneMod[id].forEach((p, i) => { if (Math.hypot(p[0] - Ri.xy[0], p[1] - Ri.xy[1]) > 2) return; const r = raggio(id, i); m = Math.min(m, dSopraFascia(p) - K_PROF * r); mk = Math.min(mk, dentroCute(p) - K_CUTE * r); }); return `${id}: margine dalla fascia ${(m * 10).toFixed(2)} mm, dalla cute ${(mk * 10).toFixed(2)} mm`; });
  return `  nervo: margine dalla fascia ${(mF * 10).toFixed(2)} mm (@ ${mFp?.map(c => c.toFixed(1)).join(',')}), dalla cute ${(mC * 10).toFixed(2)} mm\n  ` + veneStato.join('\n  ');
};

stampa('Prima:', rapporto(nerv0));
console.log(stato(nerv0, { v_mediana_cub: NVP.pts.v_mediana_cub, v_mediana_cefalica: NVP.pts.v_mediana_cefalica }));
if (VERIFICA) process.exit(0);

/* ============ Spostamenti ============ */
const nerv = nerv0.map(p => p.slice()), mc = NVP.pts.v_mediana_cefalica.map(p => p.slice()), cMc = arco(mc);
const spostaZ = (P, c, iC, semi, dz) => { for (let i = 0; i < P.length; i++) { const w = bump(Math.abs(c[i] - c[iC]), semi); if (w > 0) P[i][2] += dz * w; } };

// (1) mediana del gomito: il nervo scende sotto la vena
{
  const I = INCROCI[0], ven = NVP.pts[I.vena], r = relazione(I.vena, nerv, { id: I.vena, P: ven });
  const q = proietta(ven, nerv[r.i]), rV = raggio(I.vena, Math.round(q.i + q.u)) * FATT_R, rN = raggio(NERVO, r.i) * FATT_R;
  const zBers = q.p[2] - rV - rN - GIOCO, dz = Math.min(0, zBers - nerv[r.i][2]);
  spostaZ(nerv, cN, r.i, I.semi, dz);
  log(`mediana del gomito: nervo abbassato di ${(-dz * 10).toFixed(2)} mm al centro (finestra ±${I.semi} cm)`);
}
// (2) mediana cefalica: il nervo esce dal brachioradiale, la vena sale sopra di lui
{
  const I = INCROCI[1], ven = NVP.pts[I.vena], r = relazione(I.vena, nerv, { id: I.vena, P: ven });
  const rN = raggio(NERVO, r.i);
  let dzN = 0; const base = nerv[r.i].slice();
  while (dzN < 0.2 && dSopraFascia([base[0], base[1], base[2] + dzN]) - K_PROF * rN < GIOCO) dzN += 0.005;   // minimo spostamento che porta il nervo fuori dal muscolo
  spostaZ(nerv, cN, r.i, 1.2, dzN);
  const zN = nerv[r.i][2], jv = Math.round(proietta(ven, nerv[r.i]).i + proietta(ven, nerv[r.i]).u), rV = raggio(I.vena, jv) * FATT_R;
  const zBers = zN + rN * FATT_R + GIOCO + rV, dzV = Math.max(0, zBers - ven[jv][2]);
  spostaZ(mc, cMc, jv, I.semi, dzV);
  log(`mediana cefalica: nervo alzato di ${(dzN * 10).toFixed(2)} mm, vena alzata di ${(dzV * 10).toFixed(2)} mm al centro (finestra ±${I.semi} cm)`);
}
const veneMod = { v_mediana_cefalica: mc, v_mediana_cub: NVP.pts.v_mediana_cub };
stampa('Dopo:', rapporto(nerv, veneMod));
console.log(stato(nerv, veneMod));
let mx = 0; nerv.forEach((p, i) => { mx = Math.max(mx, Math.abs(p[2] - nerv0[i][2])); }); log(`spostamento massimo del nervo ${(mx * 10).toFixed(2)} mm`);
// svolta massima (gradi per segmento): il profilo cos² non deve introdurre angoli
const svolta = P => { let m = 0; for (let i = 1; i < P.length - 1; i++) { const a = sub(P[i], P[i - 1]), b = sub(P[i + 1], P[i]); m = Math.max(m, Math.acos(clamp((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b) || 1), -1, 1)) * 180 / Math.PI); } return m; };
console.log(`  svolta massima tra segmenti: nervo ${svolta(nerv0).toFixed(1)}° → ${svolta(nerv).toFixed(1)}°, mediana cefalica ${svolta(NVP.pts.v_mediana_cefalica).toFixed(1)}° → ${svolta(mc).toFixed(1)}°`);

/* ============ Scrittura ============ */
const round = P => P.map(p => p.map(x => Math.round(x * 1000) / 1000));
NVP.pts[NERVO] = round(nerv); NVP.pts.v_mediana_cefalica = round(mc);
G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
writeFileSync(G.FILE, G.M.html);   // solo NVP: le mesh incorporate non cambiano
log('scritto', G.FILE);
