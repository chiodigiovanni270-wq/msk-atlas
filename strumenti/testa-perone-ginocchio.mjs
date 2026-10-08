/* Inserzioni sulla testa del perone: LCL, bicipite femorale e decorso del nervo peroneo comune (modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto):
     node strumenti/testa-perone-ginocchio.mjs [--prova]

   Anatomia (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020; LaPrade RF et al., Am J Sports Med 2003;31:854-60):
   il LCL si inserisce sulla faccia laterale della testa del perone, davanti all'apice; il tendine del bicipite femorale
   arriva da dietro-sopra con decorso rettilineo e si inserisce sulla parte postero-laterale della testa fino all'apice,
   abbracciando l'inserzione del LCL; il nervo peroneo comune segue il margine postero-mediale del bicipite, passa dietro
   la testa e avvolge il collo del perone.
   Nel modello il LCL occupava la faccia laterale fin quasi al margine posteriore e il bicipite scendeva dietro la testa
   per poi agganciarsi in avanti sotto l'apice (uncino); il nervo ne seguiva la curva.

   Metodo: ogni struttura riceve uno spostamento rigido D pesato lungo y (0 sopra y[0], pieno sotto y[1], raccordo
   smoothstep); i vertici che finiscono dentro le strutture di riferimento (ossa e strutture già sistemate) e prima
   non lo erano vengono riportati fuori a GAP lungo il gradiente della distanza, con lo spostamento raccordato sulla
   mesh; sotto `affonda` l'estremità del tendine resta libera di entrare nell'osso (inserzione), senza punte. Il nervo (tubo) segue il bicipite con lo stesso peso e viene tenuto a DISTANZA dalle superfici vicine.
   Riparte dalla revisione PARTENZA, quindi si può rilanciare.

   Requisiti: Node 18 o successivo, nessuna dipendenza. */
import { M, REAL, setPos, posDaRevisione, setGriglia, N, or, solid, edt, sample, sstep, log, repack, saveFile } from './lib-modello.mjs';
import { execFileSync } from 'node:child_process';

const PARTENZA = 'ab3a67e', PROVA = process.argv.includes('--prova');
const GAP = 0.03;
const REGOLE = [
  { nome: 'lcl', rif: ['perone', 'tibia', 'femore'], y: [1.5, -2.6], D: [0.15, 0, 0.35] },
  { nome: 'biclong', rif: ['perone', 'tibia', 'lcl'], y: [3, -1.5], D: [0.2, 0, 0.55], affonda: -2.1 },
  { nome: 'bicbrev', rif: ['perone', 'tibia', 'lcl'], y: [3, -1.5], D: [0.2, 0, 0.55], affonda: -2.1 },
];
const NERVO = { y: [4, 0.5, -3, -5.5], D: [0.15, 0, 0.45], DISTANZA: 0.06, ost: ['biclong', 'bicbrev', 'perone', 'tibia', 'lcl', 'femore', 'glat', 'plant', 'capsula'] };

for (const R of REGOLE) setPos(R.nome, posDaRevisione(PARTENZA, R.nome, 'modelli/ginocchio-3d.html'));
setGriglia([-6.5, -7, -5.5], 0.04, 110, 300, 170);   // testa del perone e tratto distale del bicipite

const campo = nomi => { const S = new Uint8Array(N); for (const n of nomi) or(S, solid(n)); const Do = edt(S), Di = edt(S, true);
  const sd = q => sample(Do, ...q) - sample(Di, ...q);
  const gr = q => { const e = 0.04, g = [0, 1, 2].map(c => { const a = q.slice(), b = q.slice(); a[c] += e; b[c] -= e; return sd(a) - sd(b); }), l = Math.hypot(...g) || 1; return g.map(v => v / l); };
  return { sd, gr }; };

for (const R of REGOLE) {
  const { sd, gr } = campo(R.rif), { pos: p0, idx } = REAL(R.nome), pos = Float32Array.from(p0), nv = pos.length / 3;
  const dentro0 = new Uint8Array(nv); for (let i = 0; i < nv; i++) dentro0[i] = sd([p0[3 * i], p0[3 * i + 1], p0[3 * i + 2]]) < GAP || p0[3 * i + 1] + R.D[1] < (R.affonda ?? -Infinity);
  for (let i = 0; i < nv; i++) { const w = sstep(R.y[0], R.y[1], pos[3 * i + 1]); for (let c = 0; c < 3; c++) pos[3 * i + c] += R.D[c] * w; }
  // fuori dalle strutture di riferimento (solo i vertici che prima erano fuori: le punte d'inserzione restano nell'osso)
  const Dp = new Float32Array(3 * nv);
  for (let i = 0; i < nv; i++) { if (dentro0[i]) continue; const q = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], d = sd(q); if (d >= GAP) continue;
    const g = gr(q); for (let c = 0; c < 3; c++) Dp[3 * i + c] = g[c] * (GAP - d); }
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[idx[t + a]].add(idx[t + b]);
  for (let it = 0; it < 15; it++) { const O = Dp.slice(); for (let i = 0; i < nv; i++) { if (!nb[i].size) continue; const m = [0, 0, 0];
    for (const j of nb[i]) for (let c = 0; c < 3; c++) m[c] += O[3 * j + c] / nb[i].size;
    for (let c = 0; c < 3; c++) Dp[3 * i + c] = 0.5 * O[3 * i + c] + 0.5 * m[c]; } }
  for (let i = 0; i < 3 * nv; i++) pos[i] += Dp[i];
  // ultima passata esatta: nessun vertice (prima fuori) resta dentro
  let res = 0; for (let i = 0; i < nv; i++) { if (dentro0[i]) continue; const q = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], d = sd(q); if (d >= GAP * 0.5) continue;
    const g = gr(q); for (let c = 0; c < 3; c++) pos[3 * i + c] += g[c] * (GAP - d); res++; }
  setPos(R.nome, pos);
  log(`${R.nome}: spostato di ${R.D.map(v => (v * 10).toFixed(1)).join('/')} mm (x/y/z) sotto y ${R.y[1]}; vertici riportati fuori ${res}`);
}

// nervo peroneo comune: segue il bicipite, poi torna al decorso originale attorno al collo
{ const RE = /tube\((\[\[.*?\]\]),([\d.]+)(?:,(\{[^}]*\}))?\)/;
  const blocco = (h, id) => { const a = h.indexOf(`{id:'${id}'`); return h.slice(a, h.indexOf('\n {id:', a + 5)); };
  const root = new URL('..', import.meta.url).pathname;
  const H0 = execFileSync('git', ['show', `${PARTENZA}:modelli/ginocchio-3d.html`], { cwd: root, maxBuffer: 1 << 30 }).toString('utf8');
  const m0 = blocco(H0, 'nper').match(RE), m1 = blocco(M.html, 'nper').match(RE), P = JSON.parse(m0[1]), r = +m0[2];
  const [a, b, c, d] = NERVO.y, w = y => sstep(a, b, y) * (1 - sstep(c, d, y));
  for (const q of P) { const k = w(q[1]); for (let j = 0; j < 3; j++) q[j] += NERVO.D[j] * k; }
  const { sd, gr } = campo(NERVO.ost); let mx = 0;
  for (let it = 0; it < 30; it++) { for (const q of P) { if (q[1] > a || q[1] < d) continue; const s = sd(q) - r; if (s >= NERVO.DISTANZA) continue;
      const g = gr(q); for (let j = 0; j < 3; j++) q[j] += g[j] * (NERVO.DISTANZA - s) * 0.7; if (it === 0) mx = Math.max(mx, NERVO.DISTANZA - s); }
    const Q = P.map(q => q.slice()); for (let k = 1; k < P.length - 1; k++) { if (P[k][1] > a || P[k][1] < d) continue; for (let j = 0; j < 3; j++) P[k][j] = Q[k][j] + 0.3 * ((Q[k - 1][j] + Q[k + 1][j]) / 2 - Q[k][j]); } }
  let pen = 0; for (const q of P) if (q[1] < a && q[1] > d) pen = Math.max(pen, r - sd(q));
  M.html = M.html.replace(m1[0], m1[0].replace(m1[1], JSON.stringify(P.map(q => q.map(v => +v.toFixed(2))))));
  log(`nper: compenetrazione residua massima ${(Math.max(0, pen) * 10).toFixed(1)} mm`); }

if (!PROVA) saveFile(repack());
