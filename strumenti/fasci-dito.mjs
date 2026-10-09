/* Fasci neurovascolari digitali del dito (modelli/polso-dito-3d.html, sezione dito): arterie e nervi digitali palmari propri.

   Uso (dalla cartella del progetto):
     node strumenti/fasci-dito.mjs              → riscrive i tubi `arterie` e `nervi` nel sorgente della pagina
     node strumenti/fasci-dito.mjs verifica     → elenca le compenetrazioni attuali, senza scrivere
     MODELLO=/tmp/copia.html node strumenti/fasci-dito.mjs   → lavora su una copia

   Anatomia (Standring, Gray's Anatomy 42ª ed.; Netter): per lato un fascio volare-laterale, fuori dalla guaina e dalle pulegge (che sono archi
   sopra i flessori), volare alla faccia laterale delle falangi e dei legamenti collaterali, dorsale al legamento di Grayson / alla cute e nel
   tessuto sottocutaneo; nervo volare all'arteria. Alla punta i rami si portano nella polpa, davanti alla tuberosità ungueale (non nell'osso).
   Costruzione: si riparte dal decorso della revisione ORIGINALE (ORIGINALE, default f058cc0) e lo si rilassa: ogni punto viene spinto fuori
   da tutte le strutture solide (ossa, cartilagini, tendini, guaina, pulegge, placche, collaterali, intrinseci, apparato estensore) (la cute del modello è aperta sul lato volare: non è un vincolo), arteria e nervo non si toccano; poi levigatura lungo il decorso (filo teso) alternata ai vincoli, con i vincoli per ultimi.
   La prima posizione (y = 4,2) resta ferma: raccordo con le digitali comuni del palmo. */
import { Modello, Indice, sub, add, mul, unit, len, dot, clamp, log } from './lib-dito.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';

const ORIG = process.env.ORIGINALE || 'f058cc0', VERIFICA = process.argv.includes('verifica');
const M = new Modello();
const SOLIDI = ['d_mc3', 'd_p1', 'd_p2', 'd_p3', 'd_cart', 'd_fds', 'd_fdp', 'd_lumb', 'd_iod', 'guaina', 'A1', 'A2', 'A3', 'A4', 'A5', 'C1', 'C2', 'C3', 'vp_mcp', 'vp_pip', 'vp_dip',
  'cl_mcp_rad', 'cl_mcp_uln', 'cl_pip_rad', 'cl_pip_uln', 'cl_dip_rad', 'cl_dip_uln', 'sagittali', 'cappuccio', 'bl', 'triangolare', 'terminale', 'trl', 'orl', 'iod_t', 'd_edc'];
const IDX = {}; for (const n of SOLIDI) IDX[n] = new Indice([M.get(n)]);
const GAP = 0.012;

/* decorso originale */
const src = execFileSync('git', ['show', `${ORIG}:modelli/polso-dito-3d.html`], { cwd: process.cwd(), maxBuffer: 1 << 30 }).toString('utf8').split('\n');
const leggi = id => { const l = src.find(l => l.startsWith("{id:'" + id + "'")); return [...l.matchAll(/tube\(\[(\[.*?\])\],([\d.]+)/g)].map(m => ({ pts: JSON.parse('[' + m[1] + ']'), r: +m[2] })); };
const att = id => { const l = readFileSync(M.file, 'utf8').split('\n').find(l => l.startsWith("{id:'" + id + "'")); return [...l.matchAll(/tube\(\[(\[.*?\])\],([\d.]+)/g)].map(m => ({ pts: JSON.parse('[' + m[1] + ']'), r: +m[2] })); };
const A = leggi('arterie'), N = leggi('nervi');
const tubi = [...A.map((t, i) => ({ ...t, k: 'a', lato: i })), ...N.map((t, i) => ({ ...t, k: 'n', lato: i }))];

/* spinta di un punto fuori dagli ostacoli ; restituisce la violazione massima */
function vincola(p, r, mod) {
  let viol = 0;
  for (const n of SOLIDI) {
    const I = IDX[n], v = I.vicino(p, r + GAP + 0.02); if (!v) continue;
    const inside = I.dentro(p), sd = inside ? -v.d : v.d, def = r + GAP - sd; if (def <= 0) continue;
    const d = v.d > 1e-5 ? unit(sub(p, v.q)) : v.n, dir = inside ? mul(d, -1) : d; viol = Math.max(viol, def);
    if (mod) { p[0] += dir[0] * def; p[1] += dir[1] * def * 0.2; p[2] += dir[2] * def; } }
  return viol;
}
function distanza(P, Q, rr) { let v = 0; // arteria–nervo dello stesso lato
  for (let i = 0; i < P.length; i++) for (let j = 0; j < Q.length; j++) { if (Math.abs(P[i][1] - Q[j][1]) > rr) continue; const d = len(sub(P[i], Q[j])); v = Math.max(v, rr - d); } return v; }

if (VERIFICA) { const cur = [...att('arterie'), ...att('nervi')]; for (const t of tubi) t.pts = cur[tubi.indexOf(t)].pts;
  for (const t of tubi) { let mx = 0, nb = 0; for (const p of t.pts) { const v = vincola(p.slice(), t.r, false); if (v > 0.004) nb++; mx = Math.max(mx, v); }
  log(t.k, t.lato, 'punti in conflitto', nb, 'violazione max', mx.toFixed(3)); } process.exit(0); }

/* rilassamento */
const P = tubi.map(t => t.pts.map(p => p.slice()));
for (let it = 0; it < 120; it++) {
  const ultima = it === 119;
  // levigatura (filo teso) tranne i primi due punti
  if (!ultima) for (const pts of P) { const Q = pts.map(p => p.slice());
    for (let i = 1; i < pts.length - 1; i++) for (let k = 0; k < 3; k++) pts[i][k] = 0.5 * Q[i][k] + 0.25 * (Q[i - 1][k] + Q[i + 1][k]); }
  for (let ti = 0; ti < tubi.length; ti++) for (let i = 1; i < P[ti].length; i++) vincola(P[ti][i], tubi[ti].r, true);
  // arteria e nervo dello stesso lato non si toccano; il nervo resta volare
  for (let l = 0; l < 2; l++) { const a = P[l], n = P[2 + l], rr = tubi[l].r + tubi[2 + l].r + GAP;
    for (let i = 1; i < a.length; i++) { const d = sub(n[i], a[i]), L = len(d); if (L < rr) { const u = L > 1e-5 ? mul(d, 1 / L) : [0, 0, 1], m = (rr - L) / 2; for (let k = 0; k < 3; k++) { n[i][k] += u[k] * m; a[i][k] -= u[k] * m; } } } }
}
for (let ti = 0; ti < tubi.length; ti++) { // spostamento massimo e violazioni residue
  let mx = 0, vm = 0; P[ti].forEach((p, i) => { mx = Math.max(mx, len(sub(p, tubi[ti].pts[i]))); vm = Math.max(vm, vincola(p.slice(), tubi[ti].r, false)); });
  log(tubi[ti].k, tubi[ti].lato, 'spostamento max', mx.toFixed(3), 'violazione residua', vm.toFixed(3)); }

/* scrittura */
const fmt = v => String(+v.toFixed(3)), serial = ti => 'tube([' + P[ti].map(p => '[' + p.map(fmt).join(',') + ']').join(',') + '],' + tubi[ti].r + (tubi[ti].k === 'n' ? ',{urep:6}' : '') + ')';
let html = readFileSync(M.file, 'utf8').split('\n');
for (const [id, ks] of [['arterie', [0, 1]], ['nervi', [2, 3]]]) { const i = html.findIndex(l => l.startsWith("{id:'" + id + "'")); html[i] = html[i].replace(/b:\(\)=>\[.*\]\},?$/, m => 'b:()=>[' + ks.map(serial).join(',') + ']' + (m.endsWith(',') ? '},' : '}')); }
writeFileSync(M.file, html.join('\n')); log('scritto', M.file);
