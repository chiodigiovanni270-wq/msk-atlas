/* Ramo posteriore (dorsale) del cutaneo laterale dell'avambraccio (modelli/gomito-3d.html): aggiunge il tubo `n_cut_lat_post`.

   Anatomia: il nervo si divide in ramo anteriore (volare) e posteriore (dorsale) nell'81,7% degli avambracci, in media 47,8 ± 34,2 mm sotto la linea interepicondilea
   (IEL; Khadanovich et al., Ann Anat 2024;252:152202, 93 avambracci); nel 21,9% la biforcazione è a livello del gomito (Wongkerdsook et al., Clin Anat 2011;24:56-61).
   Il ramo posteriore resta associato alla cefalica per tutto l'avambraccio (stesso studio) e, quando il nervo incrocia la vena, passa sotto di lei fino al lato dorsale
   (5 avambracci su 37, Beldner et al., J Hand Surg Am 2005;30:1226-1230). Nel modello (IEL a y ≈ 1,5) il nervo restava un tubo unico fino al piano di taglio (y −12).
   Qui il tronco prosegue come ramo anteriore e il posteriore si stacca a y `YB` (≈ 8,2 cm sotto la IEL: media + 1 DS; più vicino alla IEL la cefalica, a contatto
   con il tronco, non lascia spazio sotto di sé), corre in basso e lateralmente seguendo la superficie del brachioradiale, passa sotto la cefalica dove la fascia scende
   lateralmente e arriva al piano di taglio sulla faccia dorso-laterale dell'avambraccio, nel sottocute (sopra la fascia, sotto la cute).

   Uso (dalla cartella del progetto):
     node strumenti/ramo-posteriore-cutaneo-gomito.mjs verifica   → non scrive: stato attuale del tubo e della cefalica sotto il ramo
     node strumenti/ramo-posteriore-cutaneo-gomito.mjs            → scrive `n_cut_lat_post` (punti, raggio, profilo), assottiglia il tronco dopo la biforcazione,
                                                                      solleva la cefalica dove il ramo le passa sotto e aggiorna scheda e `PARENT` nella pagina
     MODELLO=/tmp/copia.html node strumenti/ramo-posteriore-cutaneo-gomito.mjs   → lavora su una copia

   Calibri (scelte di modellazione, non misure): ramo posteriore 0,45 mm (raggio massimo), tronco anteriore 0,52 mm dopo la biforcazione: r³ del tronco (0,65 mm) ≈ somma dei r³
   dei rami (legge di Murray). Il ramo nasce dentro il tronco, coassiale e con raggio ridotto (0,4 volte), e se ne stacca gradualmente (peso cos² su `Q_LEN` cm), come il ramo
   superficiale del radiale in nervi-gomito.mjs. Il profilo del tronco riparte dalla revisione `BASE`, quindi lo strumento è idempotente.
   Va lanciato dopo `nervi-gomito.mjs`, `lacerto-gomito.mjs`, `cutaneo-laterale-gomito.mjs` e `cefalica-gomito.mjs`: nervi-gomito.mjs cancella i tubi `n_*` che non conosce. */
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
const BASE = '840524a';   // revisione da cui si legge il profilo del tronco (prima del ramo posteriore)
const NVPB = leggiNVP(execFileSync('git', ['show', `${BASE}:modelli/gomito-3d.html`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8'));

/* ============ Parametri ============ */
const TRONCO = 'n_cut_lat', RAMO = 'n_cut_lat_post', CEF = 'v_cefalica';
const YB = -6.7, UP = 1.4, Q_LEN = 1.8, Y_FIN = -11.95;   // quota della biforcazione; tratto coassiale a monte (cm); distacco; piano di taglio
const DELTA = 1.6, DZ = 0.35;                              // scostamento laterale al piano di taglio (cm); il ramo mira a stare DZ sotto il tronco (passa sotto la cefalica)
const R_RAMO = 0.045, R_TRONCO_DOPO = 0.8, K0 = 0.4, RAMPA = 2.6, L_TAPER = 1.5;   // raggio massimo (cm); calibro del tronco dopo la biforcazione (frazione); raggio iniziale relativo; lunghezze (cm) dei profili
const GAP = 0.03, GIOCO = 0.03, K_PROF = 0.8, K_CUTE = 0.1, MARGINE_LAMINE = 0.2, BANDA = 0.22, FATT_R = 1.05, SEMI_LIFT = 1.6;
const PASSO = 0.1, PASSO_FILE = 0.15;

/* ============ Geometria ============ */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], len = a => Math.hypot(a[0], a[1], a[2]);
const arco = P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + len(sub(P[i], P[i - 1]))); return c; };
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ramp = (a, b, y) => Math.sin(Math.PI / 2 * clamp((y - a) / (b - a), 0, 1)) ** 2;
const raggioDa = (k, f) => { const x = clamp(f, 0, 1) * (k.length - 1), i = Math.min(k.length - 2, Math.floor(x)); return k[i] + (k[i + 1] - k[i]) * (x - i); };
const rr = (id, i, n = NVP.pts[id].length) => NVP.r[id] * raggioDa(NVP.rp[id], i / (n - 1));
function proietta(P, q) {
  let bd = 1e18, bi = 0, bu = 0, bp = null;
  for (let i = 0; i + 1 < P.length; i++) { const a = P[i], ab = sub(P[i + 1], a), L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12, d0 = sub(q, a), u = clamp((d0[0] * ab[0] + d0[1] * ab[1] + d0[2] * ab[2]) / L2, 0, 1);
    const p = add(a, mul(ab, u)), d = len(sub(q, p)); if (d < bd) { bd = d; bi = i; bu = u; bp = p; } }
  return { d: bd, i: bi, u: bu, p: bp };
}
function atY(P, y) {
  for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) { const u = (y - a[1]) / (b[1] - a[1]); return { p: [a[0] + u * (b[0] - a[0]), y, a[2] + u * (b[2] - a[2])], i: i + u }; } }
  return null;
}
function risampiona(P, passo) {
  const c = arco(P), L = c.at(-1), n = Math.max(3, Math.round(L / passo)), out = []; let k = 0;
  for (let i = 0; i <= n; i++) { const s = L * i / n; while (k < c.length - 2 && c[k + 1] < s) k++; const u = (s - c[k]) / ((c[k + 1] - c[k]) || 1); out.push(add(P[k], mul(sub(P[k + 1], P[k]), u))); }
  return out;
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
const gradDi = (f, p) => G.grad({ s: f }, p, 0.05);

/* ============ Tronco e cefalica ============ */
const tr = NVP.pts[TRONCO], cef = NVP.pts[CEF].map(p => p.slice());
const gapCef = (P, rb) => { let m = 9, im = 0; P.forEach((p, i) => { const q = proietta(cef, p), g = q.d - (rb(i) + rr(CEF, Math.round(q.i + q.u), cef.length)) * FATT_R; if (g < m) { m = g; im = i; } }); return { m, im }; };
if (VERIFICA) {
  const P = NVP.pts[RAMO]; console.log(P ? `${RAMO}: ${P.length} punti, r max ${NVP.r[RAMO]}, svolta max ${svolta(P).toFixed(1)}°, distanza minima dalla cefalica ${(gapCef(P, i => rr(RAMO, i, P.length)).m * 10).toFixed(2)} mm` : `${RAMO}: non presente`);
  process.exit(0);
}

/* ============ Ramo posteriore ============ */
const yStart = YB + UP, rb0 = R_RAMO;
let raw = [];
for (let y = yStart; y >= Y_FIN - 1e-9; y -= PASSO) {
  const n = atY(tr, y); if (!n) continue;
  const q = ramp(YB, YB - Q_LEN, y);   // 0 coassiale al tronco (a monte e alla biforcazione), 1 sul tracciato proprio
  if (q <= 0) { raw.push(n.p.slice()); continue; }
  const x = n.p[0] - DELTA * ramp(YB, Y_FIN, y), z = sceltaZ(x, y, rb0, n.p[2] - DZ);
  raw.push(add(n.p, mul(sub([x, y, z], n.p), q)));
}
const nR = raw.length, attivo = i => i > 0 && i < nR - 1 && raw[i][1] < YB + 0.2;
const leviga = k => { for (let pass = 0; pass < k; pass++) { const Q = raw.map(p => p.slice()); for (let i = 0; i < nR; i++) if (attivo(i)) raw[i] = add(Q[i], mul(sub(mul(add(Q[i - 1], Q[i + 1]), 0.5), Q[i]), 0.5)); } };
const ripristina = k => { for (let it = 0; it < k; it++) for (let i = 0; i < nR; i++) if (attivo(i) && raw[i][1] < YB - 0.8) {
  const p = raw[i]; let f = [0, 0, 0];
  const df = dSopraFascia(p) - K_PROF * rb0 - GIOCO; if (df < 0) { const g = gradDi(dSopraFascia, p), l = len(g) || 1; f = add(f, mul(g, -df / l)); }
  const dk = dentroCute(p) - K_CUTE * rb0; if (dk < 0) { const g = gradDi(dentroCute, p), l = len(g) || 1; f = add(f, mul(g, -dk / l)); }
  const q = proietta(tr, p), nd = (rr(TRONCO, 0) + rb0) * FATT_R + GAP * 0.5; if (q.d < nd) { const dir = q.d > 1e-4 ? mul(sub(p, q.p), 1 / q.d) : [-1, 0, 0]; f = add(f, mul(dir, nd - q.d)); }
  raw[i] = add(p, f);
} };
leviga(30); for (let giro = 0; giro < 4; giro++) { ripristina(10); leviga(10); } ripristina(10);
raw[0] = tr.length ? atY(tr, yStart).p : raw[0];
const P = risampiona(raw, PASSO_FILE), nP = P.length, cP = arco(P);
log(`ramo posteriore: ${nP} punti, lunghezza ${cP.at(-1).toFixed(1)} cm, da (${P[0].map(v => v.toFixed(2))}) a (${P.at(-1).map(v => v.toFixed(2))}); svolta max ${svolta(P).toFixed(1)}°`);

// profili dei raggi: ramo (nasce dentro il tronco con raggio ridotto e se ne stacca); tronco (parte dal profilo della revisione BASE, assottigliato dopo la biforcazione)
const kRamo = s => K0 + (1 - K0) * sstep(0, RAMPA, s), M = Math.max(25, Math.ceil(cP.at(-1) / 0.1) + 1);
const rpRamo = Array.from({ length: M }, (_, j) => kRamo(cP.at(-1) * j / (M - 1)));
const cT = arco(tr), LT = cT.at(-1), sB = cT[Math.max(0, tr.findIndex(p => p[1] <= YB))], rpB = NVPB.rp[TRONCO];
const rpTronco = rpB.map((k, j) => k * (1 - (1 - R_TRONCO_DOPO) * sstep(sB, sB + L_TAPER, LT * j / (rpB.length - 1))));

// la cefalica deve stare sopra il ramo dove lo incrocia: sollevamento locale (come cutaneo-laterale-gomito.mjs)
const rbf = i => R_RAMO * rpRamo[Math.round(i / (nP - 1) * (M - 1))];
let sollevata = 0;
for (let giro = 0; giro < 4; giro++) {
  const g = gapCef(P, rbf); if (g.m >= GIOCO * 0.9) break;
  const q = proietta(cef, P[g.im]), jv = Math.round(q.i + q.u), cc = arco(cef), zBers = P[g.im][2] + (rbf(g.im) + rr(CEF, jv, cef.length)) * FATT_R + GAP, dz = Math.max(0, zBers - cef[jv][2]);
  for (let i = 0; i < cef.length; i++) { const d = Math.abs(cc[i] - cc[jv]); if (d < SEMI_LIFT) cef[i][2] += dz * Math.cos(Math.PI / 2 * d / SEMI_LIFT) ** 2; }
  sollevata = Math.max(sollevata, dz); log(`cefalica sollevata di ${(dz * 10).toFixed(2)} mm sul ramo posteriore (distanza prima ${(g.m * 10).toFixed(2)} mm, y ${cef[jv][1].toFixed(1)})`);
}
{ let mm = 9, mp = null; P.forEach((p, i) => { if (p[1] < YB - 0.8) { const m = margine(p, rbf(i)); if (m < mm) { mm = m; mp = p; } } });
  let mv = 9; cef.forEach((p, i) => { if (Math.abs(p[1] - -9.5) < 2.5) mv = Math.min(mv, margine(p, rr(CEF, i, cef.length))); });
  console.log(`ramo: margine minimo da fascia/cute ${(mm * 10).toFixed(2)} mm @ ${mp?.map(c => c.toFixed(1))}; distanza minima dalla cefalica ${(gapCef(P, rbf).m * 10).toFixed(2)} mm; margine della cefalica nel tratto sollevato ${(mv * 10).toFixed(2)} mm`); }

/* ============ Scrittura ============ */
const round = Q => Q.map(p => p.map(x => Math.round(x * 1000) / 1000)), r3 = a => a.map(x => Math.round(x * 1000) / 1000);
const norm = k => { const m = Math.max(...k); return { m, k: r3(k.map(x => x / m)) }; };
const nr = norm(rpRamo), nt = norm(rpTronco);
NVP.pts[RAMO] = round(P); NVP.pts[CEF] = round(cef);
NVP.r[RAMO] = Math.round(R_RAMO * nr.m * 10000) / 10000; NVP.rp[RAMO] = nr.k;
NVP.r[TRONCO] = Math.round(NVPB.r[TRONCO] * nt.m * 10000) / 10000; NVP.rp[TRONCO] = nt.k;
let html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
const sost = (a, b, tag) => { if (html.includes(b)) return; if (html.split(a).length !== 2) throw new Error('testo non trovato: ' + tag); html = html.replace(a, () => b); };
sost("n_rm_brach:'n_cut_lat',", "n_rm_brach:'n_cut_lat',n_cut_lat_post:'n_cut_lat',", 'PARENT');
sost("b:TUBE('n_cut_lat')", "b:()=>[...vessel('n_cut_lat'),...vessel('n_cut_lat_post')]", 'scheda');
sost('name:"Nervo muscolocutaneo e cutaneo laterale dell’avambraccio"', 'name:"Nervo muscolocutaneo e cutaneo laterale dell’avambraccio (rami anteriore e posteriore)"', 'nome');
sost("passa sotto la vena mediana del gomito e decorre parallelo e mediale alla cefalica, a contatto con lei nel primo tratto dell’avambraccio.", "passa sotto la vena mediana del gomito e decorre parallelo e mediale alla cefalica, a contatto con lei nel primo tratto dell’avambraccio. Si divide in ramo anteriore (volare), che prosegue verso l’arteria radiale, e ramo posteriore (dorsale), che passa sotto la cefalica verso la faccia dorso-laterale dell’avambraccio (la quota della biforcazione varia molto).", 'info');
writeFileSync(G.FILE, html);   // le mesh incorporate non cambiano
log('scritto', G.FILE);
