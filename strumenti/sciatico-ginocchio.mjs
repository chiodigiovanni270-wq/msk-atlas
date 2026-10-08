/* Divisione del nervo sciatico nella fossa poplitea (modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto):
     node strumenti/sciatico-ginocchio.mjs [--prova]
     node strumenti/sciatico-ginocchio.mjs verifica     compenetrazioni dei tre nervi con muscoli e ossa (non salva)

   Anatomia (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020): lo sciatico si divide di solito all'apice della fossa
   poplitea; prima della divisione le due componenti (tibiale e peroneo comune) sono ancora avvolte nella stessa guaina,
   dopo divergono: il tibiale scende al centro della fossa, il peroneo comune lungo il margine mediale del bicipite.

   Nel modello la divisione era alla fine del tronco (y ≈ 11,6) ma tibiale e peroneo correvano poi affiancati e
   compenetrati per ~4 cm, con l'inizio dei rami visibile come un bordo netto. Lo strumento:
   1. prolunga il tronco fino al punto in cui i rami si separano davvero (DIVIDE), lungo la linea media tra i due;
   2. fa nascere i rami dentro l'ultimo tratto del tronco (sottili, poi al loro calibro) e prolunga il tronco per ~1 cm
      dentro il tibiale assottigliandosi (r1/l1): né la fine del tronco né l'inizio dei rami restano allo scoperto;
   3. leviga il primo tratto dei rami (curve più dolci) con estremi fermi;
   4. fa lo stesso alla divisione del peroneo comune in superficiale e profondo, presso il collo del perone.
   Riparte dai tubi della revisione PARTENZA, quindi si può rilanciare.

   Requisiti: Node 18 o successivo, nessuna dipendenza. */
import { M, setGriglia, N, or, solid, edt, sample, log } from './lib-modello.mjs';
import { execFileSync } from 'node:child_process';

const PARTENZA = '8a80df9';
const PROVA = process.argv.includes('--prova'), VERIFICA = process.argv.includes('verifica');
const DIVIDE = 8.4;          // quota della divisione (y, cm): sopra i rami sono nel tronco
const LISCIA = [4.5, 8.4];   // tratto dei rami levigato
const OSTACOLI = ['femore', 'tibia', 'perone', 'biclong', 'bicbrev', 'semim', 'semit', 'addmag', 'gmed', 'glat', 'plant', 'pop', 'capsula'];

const sub = (a, b) => a.map((v, k) => v - b[k]), add = (a, b, s = 1) => a.map((v, k) => v + b[k] * s), len = a => Math.hypot(...a);
const nrm = a => { const l = len(a) || 1; return a.map(v => v / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const r2 = q => q.map(v => +v.toFixed(2));
const RE = /tube\((\[\[.*?\]\]),([\d.]+)(?:,(\{[^}]*\}))?\)/g;
const blocco = (h, id) => { const a = h.indexOf(`{id:'${id}'`); return [a, h.indexOf('\n {id:', a + 5)]; };
const tubiDi = (h, id) => { const [a, b] = blocco(h, id); return [...h.slice(a, b).matchAll(RE)].map(m => ({ p: JSON.parse(m[1]), r: +m[2], o: m[3] || '', txt: m[0] })); };
const tubeTxt = t => `tube(${JSON.stringify(t.p.map(r2))},${t.r}${t.o ? ',' + t.o : ''})`;
// quota y → punto sul tubo (interpolato)
const aY = (P, y) => { for (let k = 1; k < P.length; k++) if ((P[k - 1][1] - y) * (P[k][1] - y) <= 0) { const s = (y - P[k - 1][1]) / (P[k][1] - P[k - 1][1] || 1); return add(P[k - 1], sub(P[k], P[k - 1]), s); } return null; };

function verifica(html) {
  setGriglia([-5, 2, -6.5], 0.05, 160, 260, 160);
  const MU = new Uint8Array(N); for (const n of OSTACOLI) or(MU, solid(n)); const Do = edt(MU), Di = edt(MU, true), sd = q => sample(Do, ...q) - sample(Di, ...q);
  for (const id of ['nsci', 'ntib', 'nper']) for (const t of tubiDi(html, id)) { let mx = 0, at = null;
    for (let k = 1; k < t.p.length; k++) for (let s = 0; s < 10; s++) { const q = add(t.p[k - 1], sub(t.p[k], t.p[k - 1]), s / 10); if (q[1] < 3 || q[1] > 14) continue; const d = t.r - sd(q); if (d > mx) { mx = d; at = q; } }
    log(`${id}: ${mx > 0.02 ? 'compenetrazione ' + (mx * 10).toFixed(1) + ' mm a y ' + at[1].toFixed(1) : 'nessuna compenetrazione'}`); }
  // tibiale e peroneo sotto la divisione: distanza minima tra le superfici
  const T = tubiDi(html, 'ntib')[0], P = tubiDi(html, 'nper')[0]; let dm = 9, ym = 0;
  for (const p of P.p.filter(q => q[1] < DIVIDE - 0.8 && q[1] > 3)) for (const q of T.p) { const d = len(sub(p, q)) - T.r - P.r; if (d < dm) { dm = d; ym = p[1]; } }
  log(`tibiale/peroneo sotto la divisione: distanza minima ${(dm * 10).toFixed(1)} mm a y ${ym.toFixed(1)}`);
}
if (VERIFICA) { verifica(M.html); process.exit(0); }

const root = new URL('..', import.meta.url).pathname;
const H0 = execFileSync('git', ['show', `${PARTENZA}:modelli/ginocchio-3d.html`], { cwd: root, maxBuffer: 1 << 30 }).toString('utf8');
const [sci] = tubiDi(H0, 'nsci'), [tib] = tubiDi(H0, 'ntib'), [per] = tubiDi(H0, 'nper');
const vecchi = { nsci: tubiDi(M.html, 'nsci')[0].txt, ntib: tubiDi(M.html, 'ntib')[0].txt, nper: tubiDi(M.html, 'nper')[0].txt };

// 1. tronco prolungato lungo la linea media dei rami fino a DIVIDE
const fine0 = sci.p[sci.p.length - 1][1], media = [];
for (let y = fine0 - 0.45; y > DIVIDE - 0.01; y -= 0.45) { const a = aY(tib.p, y), b = aY(per.p, y); media.push(a.map((v, k) => (v + b[k]) / 2)); }
const E = aY(tib.p, DIVIDE).map((v, k) => (v + aY(per.p, DIVIDE)[k]) / 2);
sci.p = [...sci.p, ...media.slice(0, -1), E];
const TV = nrm(sub(E, sci.p[sci.p.length - 3]));
// 2. rami: nascono dentro il tronco e ne escono verso il proprio decorso; il tronco prosegue ~1 cm dentro il tibiale
const ramo = t => { const resto = t.p.filter(q => q[1] < DIVIDE - 0.35), dir = sub(resto.find(q => len(sub(q, E)) > 1) || resto[2], E), lato = nrm(sub(dir, TV.map(x => x * dot(dir, TV))));
  return [add(E, TV, -0.9), add(add(E, TV, -0.4), lato, 0.03), add(add(E, TV, -0.05), lato, 0.08), ...resto]; };
const ext = tib.p.filter(q => q[1] < DIVIDE - 0.3 && q[1] > DIVIDE - 1.2);
tib.p = ramo(tib); per.p = ramo(per); sci.p = [...sci.p, ...ext];
sci.o = '{urep:6,r1:0.2,l1:3}'; tib.o = '{urep:6,r0:0.17,l0:1.5}'; per.o = '{urep:6,r0:0.14,l0:1.5,r1:0.17,l1:1.5}'; // rami sottili all'origine, dentro il tronco
// 3. primo tratto dei rami levigato (Laplaciano, estremi del tratto fermi)
for (const t of [tib, per]) for (let it = 0; it < 12; it++) { const Q = t.p.map(q => q.slice());
  for (let k = 3; k < t.p.length - 1; k++) { const y = Q[k][1], w = y > LISCIA[0] && y < LISCIA[1] ? 0.5 : 0; if (!w) continue; for (let c = 0; c < 3; c++) t.p[k][c] = Q[k][c] + w * ((Q[k - 1][c] + Q[k + 1][c]) / 2 - Q[k][c]); } }
// 4. divisione del peroneo comune (collo del perone) in superficiale e profondo: stessa tecnica. Ultimo tratto del
// tronco levigato (curva stretta prima della divisione), rami che nascono sottili dentro il tronco, tronco prolungato
// ~0,8 cm dentro il ramo che ne continua meglio la direzione, assottigliandosi
const [perS] = tubiDi(H0, 'nperS'), [perP] = tubiDi(H0, 'nperP');
vecchi.nperS = tubiDi(M.html, 'nperS')[0].txt; vecchi.nperP = tubiDi(M.html, 'nperP')[0].txt;
for (let it = 0; it < 20; it++) { const Q = per.p.map(q => q.slice()); for (let k = per.p.length - 5; k < per.p.length - 1; k++) for (let c = 0; c < 3; c++) per.p[k][c] = Q[k][c] + 0.5 * ((Q[k - 1][c] + Q[k + 1][c]) / 2 - Q[k][c]); }
{ const E2 = per.p[per.p.length - 1], T2 = nrm(sub(E2, per.p[per.p.length - 3]));
  const nasce = t => { const resto = t.p.filter(q => len(sub(q, E2)) > 0.3), dir = sub(resto.find(q => len(sub(q, E2)) > 1) || resto[2], E2), lato = nrm(sub(dir, T2.map(x => x * dot(dir, T2))));
    return [add(E2, T2, -0.7), add(add(E2, T2, -0.3), lato, 0.02), add(add(E2, T2, -0.02), lato, 0.05), ...resto]; };
  const cont = [perS, perP].map(t => [t, dot(nrm(sub(t.p.find(q => len(sub(q, E2)) > 1), E2)), T2)]).sort((a, b) => b[1] - a[1])[0][0];
  const ext2 = cont.p.filter(q => { const d = len(sub(q, E2)); return d > 0.25 && d <= 0.9; });
  perS.p = nasce(perS); perP.p = nasce(perP); per.p = [...per.p, ...ext2];
  per.o = '{urep:6,r0:0.14,l0:1.5,r1:0.08,l1:2}'; perS.o = perP.o = '{r0:0.09,l0:1}'; }
for (const [id, t] of [['nsci', sci], ['ntib', tib], ['nper', per], ['nperS', perS], ['nperP', perP]]) M.html = M.html.replace(vecchi[id], tubeTxt(t));
log(`divisione dello sciatico a y ${DIVIDE}`);
verifica(M.html);
if (!PROVA) { const { saveFile, repack } = await import('./lib-modello.mjs'); saveFile(repack()); }
