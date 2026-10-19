/* Muscoli della spalla (modelli/spalla-3d.html): toglie le compenetrazioni dei muscoli BodyParts3D con le strutture più profonde
   (ossa, cartilagini, labbro, capsula, legamenti, vasi e nervi).

   Uso (dalla cartella del progetto):
     node strumenti/muscoli-spalla.mjs                  → riscrive le posizioni dei muscoli nel file del modello
     node strumenti/muscoli-spalla.mjs --prova=f.json   → non tocca il modello: scrive i controlli (prima/dopo) in un JSON
     MODELLO=/tmp/copia.html node strumenti/muscoli-spalla.mjs   → lavora su una copia
   È l'ultimo della catena: va lanciato dopo `vasi-nervi-spalla.mjs`, che riparte dai muscoli della revisione `59b7798` e vi scava i canali dei tubi.
   Lavora sui muscoli incorporati e sposta solo vertici verso l'esterno degli ostacoli: rilanciarlo sul proprio risultato non cambia nulla, ma se si
   rifà uno strato più profondo va rilanciato `vasi-nervi-spalla.mjs` (che ripristina i muscoli) e poi questo.

   Metodo:
     1. Campo di distanza con segno (griglia 0,6 mm, distanza esatta dai triangoli entro 1,2 mm dalle superfici) dall'unione degli ostacoli; la capsula è
        un solido pieno (guscio + ossa racchiudono la cavità articolare: riempimento dall'esterno), così i tendini della cuffia che entravano nella
        cavità vengono portati sulla faccia esterna della capsula, dove nella realtà si fondono con essa.
     2. Vertici di un muscolo con distanza < `MARG` (dentro un ostacolo o a contatto): spostati lungo il gradiente fino a `MARG` (tre passate).
     3. Lo spostamento è diffuso ai vertici vicini (`DIFF` passate di media sul grafo della mesh, peso calante), così la superficie del muscolo si piega
        con continuità invece di formare un gradino; i vertici che dovevano uscire mantengono almeno lo spostamento richiesto.
     4. Deltoide (e gli altri muscoli della spalla) sopra la cuffia: stesso spostamento, con la cuffia già sistemata come ostacolo.
     5. Controlli (stampati): per ogni muscolo vertici dentro ciascun gruppo di ostacoli e penetrazione massima, prima e dopo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setPos, saveFile, repack, log, griglia, esatta, sdf, unione, solid, or, sample, grad } = G;
const B = await import('./lib-bp3d.mjs');
const { STR } = await import('./dati-spalla.mjs');

const MARG = 0.05, DIFF = 8, PASSO = 0.06;                                                         // cm
const nomi = cats => STR.filter(s => cats.includes(s.cat)).flatMap(s => s.mesh.map(m => m[0]));
const MUSCOLI = nomi(['cuf', 'cin', 'tor', 'brac']);
const GRUPPI = { ossa: ['scapola', 'clavicola', 'omero', 'manubrio'], cartilagini: ['cart_omero', 'cart_glen'], capsula: ['caps', 'labbro'],
  legamenti: nomi(['leg']), vasi_nervi: nomi(['art', 'ven', 'ner']) };

griglia([-8, -14, -9], [16, 6, 8], PASSO, 0.2);
const { N, NX, NY, NZ, NXY } = G;
log('griglia', NX, NY, NZ, (N / 1e6).toFixed(1), 'M voxel');
const tutti = Object.values(GRUPPI).flat();
const M = unione(tutti.filter(n => n !== 'caps'));
// capsula piena: guscio (ispessito di un voxel, niente fughe) + interno non raggiungibile dall'esterno
{ const Sh = solid('caps'), Do = G.edt(Sh); for (let i = 0; i < N; i++) if (Do[i] <= PASSO * 1.01) Sh[i] = 1;
  const C = or(Sh, M.slice()), fuori = new Uint8Array(N), coda = [];
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { if (i && j && k && i < NX - 1 && j < NY - 1 && k < NZ - 1) continue; const id = i + NX * j + NXY * k; if (!C[id]) { fuori[id] = 1; coda.push(id); } }
  while (coda.length) { const id = coda.pop(), i = id % NX, j = ((id / NX) | 0) % NY, k = (id / NXY) | 0;
    for (const [d, ok] of [[1, i < NX - 1], [-1, i > 0], [NX, j < NY - 1], [-NX, j > 0], [NXY, k < NZ - 1], [-NXY, k > 0]]) { const m = id + d; if (ok && !fuori[m] && !C[m]) { fuori[m] = 1; coda.push(m); } } }
  let n = 0; for (let i = 0; i < N; i++) if (!fuori[i] && !M[i]) { M[i] = 1; n++; } log('capsula piena:', (n * PASSO ** 3).toFixed(1), 'cm³'); }
// distanza esatta dalle mesh chiuse; la capsula piena (le cui facce interne non sono bordo del solido) entra solo come distanza voxel
const Mn = unione(tutti.filter(n => n !== 'caps')), Fn = esatta(sdf(Mn).F, tutti.filter(n => n !== 'caps'), 0.12), Fc = sdf(M).F, F = new Float32Array(N);
for (let i = 0; i < N; i++) F[i] = Math.min(Fn[i], Fc[i]);
log('campo pronto');
// campi per gruppo, solo per i controlli
const FG = {}; for (const [g, ns] of Object.entries(GRUPPI)) FG[g] = g === 'capsula' ? Fc : esatta(sdf(unione(ns)).F, ns, 0.12);
// per la capsula (campo del solido pieno, che contiene anche ossa, cartilagini e tubi) contano solo i vertici fuori da tutto il resto
const controlli = pos => { const r = {}; for (const [g, Fx] of Object.entries(FG)) { let n = 0, mx = 0; for (let i = 0; i < pos.length; i += 3) { const d = sample(Fx, pos[i], pos[i + 1], pos[i + 2]); if (d < -0.01 && (g !== 'capsula' || sample(Fn, pos[i], pos[i + 1], pos[i + 2]) > 0.01)) { n++; mx = Math.max(mx, -d); } } r[g] = [n, +(mx * 10).toFixed(1)]; } return r; };

const CHECK = {};
function libera(nome, F, conControlli = true) {
  const m = REAL(nome), pos = Float32Array.from(m.pos), nv = pos.length / 3, prima = conControlli ? controlli(pos) : null;
  const D = new Float32Array(nv * 3), req = new Float32Array(nv);
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < nv; i++) {
    const p = [pos[3 * i] + D[3 * i], pos[3 * i + 1] + D[3 * i + 1], pos[3 * i + 2] + D[3 * i + 2]], d = sample(F, ...p); if (d >= MARG) continue;
    const g = grad(F, p), l = Math.hypot(...g) || 1, k = (MARG - d) / l; D[3 * i] += g[0] * k; D[3 * i + 1] += g[1] * k; D[3 * i + 2] += g[2] * k; req[i] = 1;
  }
  const nb = B.vicini(nv, m.idx), comp = [0, 1, 2].map(q => B.diffondi(Array.from({ length: nv }, (_, i) => D[3 * i + q]), nb, DIFF));
  let mossi = 0;
  for (let i = 0; i < nv; i++) {
    if (req[i]) { mossi++; for (let q = 0; q < 3; q++) pos[3 * i + q] += D[3 * i + q]; continue; }
    const s = [comp[0][i], comp[1][i], comp[2][i]], l = Math.hypot(...s); if (l < 1e-5) continue;
    for (let q = 0; q < 3; q++) pos[3 * i + q] += s[q] * 0.8;
  }
  // i vertici spostati per diffusione non devono entrare negli ostacoli
  for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], d = sample(F, ...p); if (d >= MARG * 0.5) continue; const g = grad(F, p), l = Math.hypot(...g) || 1, k = (MARG - d) / l; for (let q = 0; q < 3; q++) pos[3 * i + q] += g[q] * k; }
  setPos(nome, pos);
  if (!conControlli) return mossi;
  const dopo = controlli(pos);
  CHECK[nome] = { vertici: nv, spostati: mossi, prima, dopo };
  log(nome, 'spostati', mossi, 'prima', JSON.stringify(prima), 'dopo', JSON.stringify(dopo));
}
for (const nome of MUSCOLI) libera(nome, F);
// deltoide sopra la cuffia: dove i tendini della cuffia (già sistemati) attraversano il deltoide, il deltoide si solleva sopra di loro
{ const CUF = nomi(['cuf']), Fc2 = esatta(sdf(unione(CUF)).F, CUF, 0.12);
  for (const nome of nomi(['cin'])) { const n = libera(nome, Fc2, false); CHECK[nome].sopra_cuffia = n; log(nome, 'sollevati sopra la cuffia', n); } }
const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) writeFileSync(prova, JSON.stringify(CHECK, null, 1));
else saveFile(repack());
