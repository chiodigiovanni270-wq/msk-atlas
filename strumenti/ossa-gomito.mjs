/* Rilievi dell'omero distale del gomito (modelli/gomito-3d.html): approfondisce la fossa radiale.

   Uso (dalla cartella del progetto):
     node strumenti/ossa-gomito.mjs                  → riscrive le posizioni dei vertici di `omero` nel file del modello
     node strumenti/ossa-gomito.mjs --prova=f.json   → non tocca il modello: scrive l'omero modificato in un JSON
     MODELLO=/tmp/copia.html node strumenti/ossa-gomito.mjs   → lavora su una copia

   Nell'omero BodyParts3D la fossa coronoidea è ben definita (concavità ~3,1 mm rispetto alla superficie sfocata attorno,
   centro (0,40; 2,00) cm) mentre la fossa radiale, sopra il capitello, è appena accennata (~1,5 mm, centro (−1,40; 2,20)).
   Qui la fossa radiale viene scavata con un profilo liscio ((1 − r²)², r ellittico nel piano x–y, solo sulle facce rivolte
   in avanti) lungo la normale dell'osso, fino a una concavità paragonabile a quella della coronoidea (parametro `PROFONDITA`).
   La fossa coronoidea resta invariata. Stessi vertici e indici dell'originale: le mesh derivate (cartilagini, legamenti)
   vanno rigenerate dopo (ordine: ossa-gomito → cartilagini-gomito → legamenti-gomito).
   Riparte sempre dall'omero della revisione ORIGINALE, quindi si può rilanciare. Parametri in testa. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { setPos, saveFile, repack, realDaRevisione, log, sstep } = G;

const ORIGINALE = '10893e7';                 // revisione con le ossa BodyParts3D originali
const FILE_REPO = 'modelli/gomito-3d.html';
const FOSSA_RADIALE = { c: [-1.40, 2.20], r: [0.72, 0.62], profondita: 0.2 };   // centro (x, y), semiassi (cm), scavo massimo lungo la normale (cm)
const SOLO_ANTERIORE = [0.1, 0.45];          // la fossa agisce dove la normale guarda in avanti (componente z): da, a

const m = realDaRevisione(ORIGINALE, 'omero', FILE_REPO), nv = m.pos.length / 3, pos = Float64Array.from(m.pos), P = Float64Array.from(m.pos);
// normali di vertice (medie sulle facce), poi levigate sui vicini
const nor = new Float64Array(3 * nv), nb = Array.from({ length: nv }, () => new Set());
for (let t = 0; t < m.idx.length; t += 3) {
  const [a, b, c] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
  const u = [0, 1, 2].map(k => P[3 * b + k] - P[3 * a + k]), v = [0, 1, 2].map(k => P[3 * c + k] - P[3 * a + k]);
  const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  for (const i of [a, b, c]) for (let k = 0; k < 3; k++) nor[3 * i + k] += f[k];
  nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
}
for (let r = 0; r < 3; r++) { const q = nor.slice(); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { let s = nor[3 * i + k]; for (const j of nb[i]) s += nor[3 * j + k]; q[3 * i + k] = s; } nor.set(q); }
for (let i = 0; i < nv; i++) { const l = Math.hypot(nor[3 * i], nor[3 * i + 1], nor[3 * i + 2]) || 1; for (let k = 0; k < 3; k++) nor[3 * i + k] /= l; }

let toccati = 0, maxd = 0;
const F = FOSSA_RADIALE;
for (let i = 0; i < nv; i++) {
  const x = P[3 * i], y = P[3 * i + 1], r2 = ((x - F.c[0]) / F.r[0]) ** 2 + ((y - F.c[1]) / F.r[1]) ** 2;
  if (r2 >= 1) continue;
  const w = (1 - r2) ** 2 * sstep(SOLO_ANTERIORE[0], SOLO_ANTERIORE[1], nor[3 * i + 2]), d = F.profondita * w;
  if (d < 1e-5) continue;
  for (let k = 0; k < 3; k++) pos[3 * i + k] = P[3 * i + k] - nor[3 * i + k] * d;
  toccati++; maxd = Math.max(maxd, d);
}
log('fossa radiale: ', toccati, 'vertici spostati, scavo massimo', maxd.toFixed(3), 'cm');
const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) { writeFileSync(prova, JSON.stringify({ omero: { pos: Array.from(pos, v => +v.toFixed(4)), idx: Array.from(m.idx) } })); log('scritto', prova); }
else { setPos('omero', Float32Array.from(pos)); saveFile(repack()); }
