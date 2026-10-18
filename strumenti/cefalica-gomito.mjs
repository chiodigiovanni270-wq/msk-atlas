/* Vena cefalica e cutaneo laterale dell'avambraccio (modelli/gomito-3d.html): la cefalica corre a contatto con il nervo, lateralmente a lui.

   Anatomia: il nervo cutaneo laterale sta nello stesso piano sottocutaneo della cefalica, parallelo a lei e MEDIALE/volare rispetto a lei. A livello della linea
   interepicondilea (IEL) sta medialmente a ≤ 1 cm dalla cefalica nel 78,7% dei 96 arti di Wongkerdsook et al. (Clin Anat 2011;24:56-61; direttamente sotto la vena
   in 10 arti); in 31 avambracci su 37 corre volare alla vena e in 5 le passa sotto fino al lato dorsale (Beldner et al., J Hand Surg Am 2005;30:1226-1230);
   ecografia in vivo (Im et al., Ann Rehabil Med 2017;41:421-425): contatto a 0,6 ± 1,6 cm sotto la piega del gomito, separazione a 7,0 ± 3,4 cm. Khadanovich et al.
   (Ann Anat 2024;252:152202, 93 avambracci): a livello della IEL il nervo è più profondo della cefalica.
   Nel modello (IEL a y ≈ 1,5: epicondili a x −2,95 e +3,28) la cefalica stava sul margine laterale del brachioradiale, a 2,6–2,8 cm dal nervo, senza contatto.

   Uso (dalla cartella del progetto):
     node strumenti/cefalica-gomito.mjs verifica   → non scrive: distanze cefalica-nervo (superficie contro superficie) per quota
     node strumenti/cefalica-gomito.mjs            → riscrive i punti di `v_cefalica`, `v_mediana_cub` e `v_mediana_cefalica` in NVP
     MODELLO=/tmp/copia.html node strumenti/cefalica-gomito.mjs   → lavora su una copia

   Metodo: la cefalica parte dal tracciato della revisione `BASE` (prima delle correzioni del cutaneo laterale: così lo strumento è idempotente) e, da y `Y_ALTO` in giù, è portata
   lateralmente al nervo (stesso numero di punti, scostamento laterale = somma dei raggi + `GAP`, quota nel sottocute sopra la fascia e sotto la cute), con peso a
   profilo cos² da y 4,8 (decorso di partenza) a 2,2; da y `Y_SEP` (≈ 7 cm sotto la piega) si allontana dal nervo fino a `EXTRA` cm al piano di taglio; levigatura e ripristino dei margini con i campi di distanza di
   nervi-gomito.mjs. Gli affluenti seguono: le mediane cefalica e del gomito, che finivano/nascevano sul vecchio asse, sono
   accorciate al punto in cui incrociano la nuova cefalica; poi la mediana cefalica è sollevata sopra il nervo dove lo incrocia (come cutaneo-laterale-gomito.mjs).
   Va lanciato dopo `cutaneo-laterale-gomito.mjs` (che porta il nervo sotto la mediana del gomito); due lanci danno lo stesso file. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const G = await import('./lib-modello.mjs');
const { clamp, log } = G;
const VERIFICA = process.argv.slice(2).includes('verifica');
const leggiNVP = html => JSON.parse(html.match(/const NVP=(\{.*?\});\n/s)[1]);
const NVP = leggiNVP(G.M.html);
const BASE = '66264e8';   // revisione da cui si legge il decorso di cefalica e mediane (prima di cutaneo-laterale-gomito.mjs)
const NVPB = leggiNVP(execFileSync('git', ['show', `${BASE}:modelli/gomito-3d.html`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8'));

/* ============ Parametri ============ */
const NERVO = 'n_cut_lat', CEF = 'v_cefalica', MCUB = 'v_mediana_cub', MCEF = 'v_mediana_cefalica';
const Y_ALTO = [4.8, 2.2], Y_SEP = [-6.0, -11.9], EXTRA = 1.0;   // peso: da 0 (a y 4,8) a 1 (a 2,2), poi resta 1; distalmente la vena si allontana dal nervo da y −6,0 (≈ 7 cm sotto la piega) fino a EXTRA cm laterali al piano di taglio (y −11,9)
const GAP = 0.03, LM = 1.8, SEMI_LIFT = 1.6;   // cm: giunto tra le superfici nervo-cefalica; raccordo delle mediane alla nuova confluenza; finestra del sollevamento
const GIOCO = 0.03, K_PROF = 0.8, K_CUTE = 0.1, MARGINE_LAMINE = 0.2, BANDA = 0.22, FATT_R = 1.05;

/* ============ Geometria ============ */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], len = a => Math.hypot(a[0], a[1], a[2]);
const arco = P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1]))); return c; };
const raggioDa = (k, f) => { const x = clamp(f, 0, 1) * (k.length - 1), i = Math.min(k.length - 2, Math.floor(x)); return k[i] + (k[i + 1] - k[i]) * (x - i); };
const rr = (id, i, n = NVP.pts[id].length) => NVP.r[id] * raggioDa(NVP.rp[id], i / (n - 1));
const ramp = (a, b, y) => Math.sin(Math.PI / 2 * clamp((y - a) / (b - a), 0, 1)) ** 2;   // 0 in a, 1 in b (a e b in qualunque ordine), derivata nulla alle estremità
function proietta(P, q) {
  let bd = 1e18, bi = 0, bu = 0, bp = null;
  for (let i = 0; i + 1 < P.length; i++) { const a = P[i], ab = sub(P[i + 1], a), L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12, d0 = sub(q, a), u = clamp((d0[0] * ab[0] + d0[1] * ab[1] + d0[2] * ab[2]) / L2, 0, 1);
    const p = add(a, mul(ab, u)), d = len(sub(q, p)); if (d < bd) { bd = d; bi = i; bu = u; bp = p; } }
  return { d: bd, i: bi, u: bu, p: bp };
}
function atY(P, y) {   // punto della polilinea a quota y (primo attraversamento): { p, i (indice frazionario) }
  for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) { const u = (y - a[1]) / (b[1] - a[1]); return { p: [a[0] + u * (b[0] - a[0]), y, a[2] + u * (b[2] - a[2])], i: i + u }; } }
  return null;
}
const svolta = P => { let m = 0; for (let i = 1; i < P.length - 1; i++) { const a = sub(P[i], P[i - 1]), b = sub(P[i + 1], P[i]); m = Math.max(m, Math.acos(clamp((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b) || 1), -1, 1)) * 180 / Math.PI); } return m; };

/* ============ Campi (strutture profonde, fascia, cute) ============ */
const SHEET = ['lacerto', 'osborne', 'mio', 'setto_med', 'setto_lat', 'quadrato', 'ucl_ant', 'ucl_post', 'ucl_trasv', 'rcl', 'lucl', 'anulare', 'caps', 'bor_olecr', 'bor_bicrad', 'cart_omero', 'cart_ulna', 'cart_radio'];
G.griglia([-6.4, -12.2, -5.0], [1.6, 7.0, 6.1], 0.08, 0);
const tutte = G.man.meshes.map(m => m.n).filter((n, i, a) => a.indexOf(n) === i && n !== 'sup_prof');
const SOLIDI = tutte.filter(n => n !== 'cute' && !SHEET.includes(n));
log('campi: strutture profonde');
const Fc = (() => { const M = G.unione(SOLIDI), { Do } = G.sdf(M); const F = G.chiuso(Do, 0.4); G.esatta(F, SOLIDI, 0); return F; })();
const Fh = (() => { const F = new Float32Array(G.N).fill(5); G.esatta(F, SHEET, BANDA); for (let q = 0; q < G.N; q++) F[q] = Math.abs(F[q]); return F; })();
log('campi: cute');
const Fk = G.campo(['cute']).F;
const dentroCute = p => -G.sample(Fk, p[0], p[1], p[2]);
const dSopraFascia = p => Math.min(G.sample(Fc, p[0], p[1], p[2]), G.sample(Fh, p[0], p[1], p[2]) + MARGINE_LAMINE);
const margine = (p, r) => Math.min(dSopraFascia(p) - K_PROF * r - GIOCO, dentroCute(p) - K_CUTE * r);   // ≥ 0: nel sottocute, sopra la fascia
function sceltaZ(x, y, r, zn) {   // quota valida più vicina a zn
  let best = zn, bm = -9;
  for (let dz = 0; dz <= 1.0; dz += 0.01) for (const s of dz ? [1, -1] : [1]) { const z = zn + s * dz, m = margine([x, y, z], r); if (m >= 0) return z; if (m > bm) { bm = m; best = z; } }
  return best;
}

/* ============ Cefalica ============ */
const nerv = NVP.pts[NERVO];
const C0 = NVPB.pts[CEF], nC = C0.length, peso = y => ramp(Y_ALTO[0], Y_ALTO[1], y);
const Cn = C0.map((p, i) => {
  const w = peso(p[1]); if (w <= 0) return p.slice();
  const nv = atY(nerv, p[1]); if (!nv) return p.slice();
  const rn = rr(NERVO, nv.i), rv = rr(CEF, i, nC), x = nv.p[0] - (rn + rv) * FATT_R - GAP - EXTRA * ramp(Y_SEP[0], Y_SEP[1], p[1]), z = sceltaZ(x, p[1], rv, nv.p[2]);
  return [p[0] + w * (x - p[0]), p[1], p[2] + w * (z - p[2])];
});
const attivi = i => peso(C0[i][1]) > 0 && i > 0 && i < nC - 1;
const levigabili = i => i > 0 && i < nC - 1 && C0.slice(Math.max(0, i - 12), Math.min(nC, i + 13)).some(p => peso(p[1]) > 0);   // margine di 12 punti: nessuna svolta al limite del tratto spostato
const leviga = n => { for (let pass = 0; pass < n; pass++) { const Q = Cn.map(p => p.slice()); for (let i = 0; i < nC; i++) if (levigabili(i)) Cn[i] = add(Q[i], mul(sub(mul(add(Q[i - 1], Q[i + 1]), 0.5), Q[i]), 0.5)); } };
// ripristino dei margini (fascia, cute) e del giunto con il nervo
const gradDi = (f, p) => G.grad({ s: f }, p, 0.05);
const ripristina = n => { for (let it = 0; it < n; it++) for (let i = 0; i < nC; i++) if (attivi(i)) {
  const p = Cn[i], r = rr(CEF, i, nC); let f = [0, 0, 0];
  const df = dSopraFascia(p) - K_PROF * r - GIOCO; if (df < 0) { const g = gradDi(dSopraFascia, p), l = len(g) || 1; f = add(f, mul(g, -df / l)); }
  const dk = dentroCute(p) - K_CUTE * r; if (dk < 0) { const g = gradDi(dentroCute, p), l = len(g) || 1; f = add(f, mul(g, -dk / l)); }
  const q = proietta(nerv, p), nd = (rr(NERVO, 0) + r) * FATT_R + GAP * 0.5; if (q.d < nd) { const dir = q.d > 1e-4 ? mul(sub(p, q.p), 1 / q.d) : [-1, 0, 0]; f = add(f, mul(dir, nd - q.d)); }
  Cn[i] = add(p, f);
} };
leviga(40);   // la quota valida cambia a gradini: levigatura lunga, poi alternanza di ripristino e levigatura
for (let giro = 0; giro < 4; giro++) { ripristina(10); leviga(12); }
ripristina(10);

const rapportoCefalica = P => [3, 1.5, 0, -2, -4, -6, -8].map(y => {
  const c = atY(P, y), n = atY(nerv, y); if (!c || !n) return `y ${y}: –`;
  const q = proietta(nerv, c.p), gap = q.d - (rr(CEF, Math.round(c.i), nC) + rr(NERVO, Math.round(n.i))) * FATT_R;
  return `y ${String(y).padStart(5)}: vena x ${c.p[0].toFixed(2)} z ${c.p[2].toFixed(2)}  nervo x ${n.p[0].toFixed(2)} z ${n.p[2].toFixed(2)}  Δx ${(c.p[0] - n.p[0]).toFixed(2)} (${c.p[0] < n.p[0] ? 'vena laterale' : 'vena MEDIALE'})  distanza tra le superfici ${(gap * 10).toFixed(1)} mm`;
}).join('\n');
console.log('Cefalica prima (base):\n' + rapportoCefalica(C0));
if (VERIFICA) process.exit(0);
console.log('Cefalica dopo:\n' + rapportoCefalica(Cn));
{ let mm = 9, mp = null; Cn.forEach((p, i) => { if (peso(C0[i][1]) > 0) { const m = margine(p, rr(CEF, i, nC)); if (m < mm) { mm = m; mp = p; } } }); console.log(`  margine minimo da fascia/cute nel tratto spostato: ${(mm * 10).toFixed(2)} mm @ ${mp?.map(c => c.toFixed(1)).join(',')}; svolta max ${svolta(C0).toFixed(1)}° → ${svolta(Cn).toFixed(1)}°`); }

/* ============ Affluenti ============ */
// mediana cefalica: finiva sul vecchio asse della cefalica; ora finisce dove incrocia il nuovo (tratto dopo l'incrocio tolto, raccordo di LM cm; spostare solo l'estremo la farebbe tornare indietro con un uncino)
let Mc = NVPB.pts[MCEF].map(p => p.slice());
const proj2 = P => P.map(p => [p[0], p[1], 0]);
{
  let jb = -1, db = 1e9; Mc.forEach((p, j) => { const q = proietta(proj2(Cn), [p[0], p[1], 0]); if (q.d < db) { db = q.d; jb = j; } });
  const idx = proietta(proj2(Cn), [Mc[jb][0], Mc[jb][1], 0]), asse = add(Cn[idx.i], mul(sub(Cn[idx.i + 1], Cn[idx.i]), idx.u)), D = sub(asse, Mc[jb]), cMc = arco(Mc);
  Mc = Mc.slice(0, jb + 1).map((p, i) => add(p, mul(D, 1 - ramp(0, LM, cMc[jb] - cMc[i]))));
  log(`mediana cefalica: accorciata di ${NVPB.pts[MCEF].length - 1 - jb} punti, nuova confluenza (${asse.map(v => v.toFixed(2)).join(', ')})`);
}
// mediana del gomito: nasceva sul vecchio asse della cefalica; ora nasce dove incrocia il nuovo (stessa quota z dell'asse, raccordo di LM cm)
let Mb = NVPB.pts[MCUB].map(p => p.slice());
{
  let jb = -1, db = 1e9; Mb.forEach((p, j) => { const q = proietta(proj2(Cn), [p[0], p[1], 0]); if (q.d < db) { db = q.d; jb = j; } });
  const q = proietta(Cn, [Mb[jb][0], Mb[jb][1], Cn[0][2]]), idx = proietta(proj2(Cn), [Mb[jb][0], Mb[jb][1], 0]);
  const asse = add(Cn[idx.i], mul(sub(Cn[idx.i + 1], Cn[idx.i]), idx.u)), D = sub(asse, Mb[jb]), cMb = arco(Mb);
  Mb = Mb.slice(jb).map((p, k) => { const s = cMb[jb + k] - cMb[jb], u = 1 - ramp(0, LM, s); return add(p, mul(D, u)); });
  log(`mediana del gomito: accorciata di ${jb} punti, nuova origine (${Mb[0].map(v => v.toFixed(2)).join(', ')})`);
}
// sollevamento delle vene che incrociano il nervo sotto di loro (nervo sempre sotto le mediane)
function sopraNervo(P, id, nome) {
  for (let giro = 0; giro < 4; giro++) {
    let bg = 9, bj = 0, bq = null; P.forEach((p, j) => { const q = proietta(nerv, p), g = q.d - (rr(id, j, P.length) + rr(NERVO, 0)) * FATT_R; if (g < bg) { bg = g; bj = j; bq = q; } });
    if (bg >= GIOCO * 0.9) break;
    const c = arco(P), zBers = bq.p[2] + (rr(id, bj, P.length) + rr(NERVO, 0)) * FATT_R + GAP, dz = Math.max(0, zBers - P[bj][2]);
    for (let i = 0; i < P.length; i++) { const d = Math.abs(c[i] - c[bj]); if (d < SEMI_LIFT) P[i][2] += dz * Math.cos(Math.PI / 2 * d / SEMI_LIFT) ** 2; }
    log(`${nome}: sollevata di ${(dz * 10).toFixed(2)} mm sul nervo (distanza prima ${(bg * 10).toFixed(2)} mm)`);
  }
}
sopraNervo(Mc, MCEF, 'mediana cefalica');
sopraNervo(Mb, MCUB, 'mediana del gomito');
const gapNervo = (P, id) => { let m = 9; P.forEach((p, j) => { const q = proietta(nerv, p); m = Math.min(m, q.d - (rr(id, j, P.length) + rr(NERVO, 0)) * FATT_R); }); return m; };
console.log(`Distanza minima dal nervo (superfici): mediana cefalica ${(gapNervo(Mc, MCEF) * 10).toFixed(2)} mm, mediana del gomito ${(gapNervo(Mb, MCUB) * 10).toFixed(2)} mm`);
{ const m = (P, id) => { let mm = 9; P.forEach((p, i) => { mm = Math.min(mm, margine(p, rr(id, i, P.length))); }); return (mm * 10).toFixed(2); };
  console.log(`  margini (fascia/cute, mm): mediana cefalica ${m(Mc, MCEF)} (base ${m(NVPB.pts[MCEF], MCEF)}), mediana del gomito ${m(Mb, MCUB)} (base ${m(NVPB.pts[MCUB], MCUB)}); svolta max: mediana cefalica ${svolta(Mc).toFixed(1)}°, mediana del gomito ${svolta(Mb).toFixed(1)}°`); }

/* ============ Scrittura ============ */
const round = P => P.map(p => p.map(x => Math.round(x * 1000) / 1000));
NVP.pts[CEF] = round(Cn); NVP.pts[MCEF] = round(Mc); NVP.pts[MCUB] = round(Mb);
G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
writeFileSync(G.FILE, G.M.html);   // solo NVP: le mesh incorporate non cambiano
log('scritto', G.FILE);
