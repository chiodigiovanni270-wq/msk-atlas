/* Colore muscolare sulle sezioni di taglio del ginocchio (modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto):
     node strumenti/tag-sezioni-ginocchio.mjs [--prova]

   Nelle mesh con tag per vertice (0 = muscolo, 200 = tendine: il materiale sfuma dal rosso al bianco) i vertici delle
   sezioni di taglio (|y| ≥ SOGLIA) avevano il tag del tendine: la sezione appariva bianca e, sui lati, una fascia bianca
   seghettata risaliva sul ventre. Ogni vertice della sezione prende il tag del vertice più vicino (nel piano orizzontale)
   della stessa mesh appena sotto la sezione (fascia FASCIA): dove il muscolo è carnoso la sezione è rossa, dove al
   taglio c'è davvero tendine resta bianca. Le sezioni di partenza non servono, quindi si può rilanciare.

   Requisiti: Node 18 o successivo, nessuna dipendenza. */
import { man, REAL, attrs, setMesh, log, repack, saveFile } from './lib-modello.mjs';

const SOGLIA = 19.9, FASCIA = [19.0, 19.9];
const PROVA = process.argv.includes('--prova');
let tot = 0;
for (const nome of [...new Set(man.meshes.map(m => m.n))]) {
  const { tag, fdir } = attrs(nome); if (!tag) continue;
  const { pos, idx } = REAL(nome), nv = pos.length / 3, fonti = [];
  for (let i = 0; i < nv; i++) { const a = Math.abs(pos[3 * i + 1]); if (a > FASCIA[0] && a < FASCIA[1]) fonti.push(i); }
  const t = Uint8Array.from(tag); let n = 0;
  for (let i = 0; i < nv; i++) { const y = pos[3 * i + 1]; if (Math.abs(y) < SOGLIA) continue; let bd = Infinity, bj = -1;
    for (const j of fonti) { if (Math.sign(pos[3 * j + 1]) !== Math.sign(y)) continue; const d = (pos[3 * j] - pos[3 * i]) ** 2 + (pos[3 * j + 2] - pos[3 * i + 2]) ** 2; if (d < bd) { bd = d; bj = j; } }
    if (bj >= 0 && t[i] !== tag[bj]) { t[i] = tag[bj]; n++; } }
  if (n) { setMesh(nome, { pos, idx: Uint32Array.from(idx), tag: t, fdir }); tot += n; log(`${nome}: ${n} vertici della sezione`); }
}
log(`totale ${tot} vertici`);
if (!PROVA) saveFile(repack());
