/* Borsa subacromion-deltoidea (SAD) della spalla (modelli/spalla-3d.html): lamina sottile tra sovraspinato e infraspinato (sotto) e deltoide e arco
   coracoacromiale (sopra).

   Uso (dalla cartella del progetto):
     node strumenti/borsa-spalla.mjs                  → scrive la mesh `borsa_sad` nel file del modello
     MODELLO=/tmp/copia.html node strumenti/borsa-spalla.mjs   → lavora su una copia
   Ultimo della catena: va lanciato dopo `muscoli-spalla.mjs`, che lascia tra cuffia e deltoide uno spazio di `BORSA` (2 mm); si può rilanciare
   (riscrive solo `borsa_sad`).

   Metodo: campo di distanza con segno di sovraspinato e infraspinato (tendini già sistemati), sfocato (`LISCIA`) perché lo strato sia liscio. La borsa
   è lo strato `DA`–`A` sopra di loro (una sacca sottile, a 0,6–1,5 mm dalla cuffia: il deltoide è a 2 mm), fuori dalle ossa di almeno `LIB`, lontano
   almeno `PROF` da omero e capsula (esclude la faccia profonda dei tendini) e dentro un ellissoide centrato sopra il trochite (`CENTRO`, `RAGGI`,
   relativi al centro della testa omerale, ricavato dalla cartilagine con una sfera ai minimi quadrati). Superficie con surface nets e `TAUBIN`
   passate di levigatura, poi ridotta a circa `DENS` triangoli per cm². */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { riduci, compatta } = await import('./lib-bp3d.mjs');
const { REAL, setMesh, saveFile, repack, log, griglia, esatta, sdf, unione, valuta, nets } = G;

const DA = 0.06, A = 0.15, LIB = 0.02, PROF = 0.1, PASSO = 0.035, LISCIA = 14, TAUBIN = 30, PEZZO = 0.03, DENS = 400;              // cm
const CENTRO = [-0.3, 1.6, 0.0], RAGGI = [2.8, 2.4, 2.6];                       // cm, assi x (verso mediale), y (su), z (avanti)
const CUFFIA = ['supra', 'infra'], OSSA = ['scapola', 'clavicola', 'omero'];
const PROFONDI = ['omero', 'caps', 'cart_omero'];

// centro della testa omerale: sfera ai minimi quadrati sui vertici della cartilagine (x² + y² + z² = 2ax + 2by + 2cz + d)
const cT = (() => { const p = REAL('cart_omero').pos, M = Array.from({ length: 4 }, () => new Float64Array(5));
  for (let i = 0; i < p.length; i += 3) { const r = [2 * p[i], 2 * p[i + 1], 2 * p[i + 2], 1], b = p[i] ** 2 + p[i + 1] ** 2 + p[i + 2] ** 2; for (let j = 0; j < 4; j++) { for (let k = 0; k < 4; k++) M[j][k] += r[j] * r[k]; M[j][4] += r[j] * b; } }
  for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r; [M[c], M[m]] = [M[m], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; } }
  return [0, 1, 2].map(j => M[j][4] / M[j][j]); })();
log('centro testa omerale', cT.map(v => v.toFixed(2)).join(', '));
const C = cT.map((v, k) => v + CENTRO[k]);

griglia(C.map((v, k) => v - RAGGI[k] - 0.3), C.map((v, k) => v + RAGGI[k] + 0.3), PASSO, 0.1);
log('griglia', G.NX, G.NY, G.NZ);
const campo = nomi => esatta(sdf(unione(nomi)).F, nomi, 0.12);
const Fc = campo(CUFFIA), Fb = campo(OSSA), Fp = campo(PROFONDI);
// campo della cuffia sfocato (`LISCIA` passate): lo strato a distanza costante segue la forma generale dei tendini, non le loro piccole irregolarità
const Fs = G.sfoca(Fc, LISCIA);
log('campi pronti');
const mezzo = (DA + A) / 2, sp = (A - DA) / 2;
let i = 0;
const V = valuta(p => { const id = i++, e = Math.hypot((p[0] - C[0]) / RAGGI[0], (p[1] - C[1]) / RAGGI[1], (p[2] - C[2]) / RAGGI[2]) - 1;
  return Math.max(Math.abs(Fs[id] - mezzo) - sp, LIB - Fb[id], PROF - Fp[id], e * 0.5); });
const m = nets(V, () => [0, 1, 0]);
m.pos = G.taubin(m.pos, m.idx, TAUBIN);
// tiene i pezzi con almeno `PEZZO` dei triangoli (toglie i frammenti isolati dove lo strato si interrompe)
{ const nv = m.pos.length / 3, par = Int32Array.from({ length: nv }, (_, k) => k), f = k => { while (par[k] !== k) k = par[k] = par[par[k]]; return k; };
  for (let t = 0; t < m.idx.length; t += 3) { const a = f(m.idx[t]), b = f(m.idx[t + 1]), c = f(m.idx[t + 2]); par[b] = a; par[f(c)] = a; }
  const cnt = new Map(); for (let t = 0; t < m.idx.length; t += 3) { const r = f(m.idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const tot = m.idx.length / 3, I = []; for (let t = 0; t < m.idx.length; t += 3) if (cnt.get(f(m.idx[t])) >= PEZZO * tot) I.push(m.idx[t], m.idx[t + 1], m.idx[t + 2]);
  log('borsa: pezzi', cnt.size, 'tenuto', I.length / 3, 'di', m.idx.length / 3, 'triangoli'); m.idx = Uint32Array.from(I); }
let area = 0; for (let t = 0; t < m.idx.length; t += 3) { const [a, b, c] = [0, 1, 2].map(k => 3 * m.idx[t + k]), u = [0, 1, 2].map(q => m.pos[b + q] - m.pos[a + q]), w = [0, 1, 2].map(q => m.pos[c + q] - m.pos[a + q]);
  area += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2; }
{ const r = riduci(m.pos, m.idx, Math.max(3000, Math.round(area * DENS))), c = compatta(r.pos, r.idx); m.pos = Float32Array.from(c.pos); m.idx = Uint32Array.from(c.idx); m.fdir = new Int8Array(m.pos.length).fill(0); for (let k = 1; k < m.fdir.length; k += 3) m.fdir[k] = 127; }
log('borsa_sad', m.idx.length / 3, 'triangoli, area (due facce)', area.toFixed(1), 'cm²');
setMesh('borsa_sad', m);
saveFile(repack());
