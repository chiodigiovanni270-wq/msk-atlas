// node strumenti/verifica-muscoli-assiali.mjs
// Sola lettura: controlla ogni livello intero in mm dei 28 muscoli REAL della spalla.
// Usa le stesse posizioni decodificate e categorie del viewer, senza modificare i dati.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sezione,indicizza} from '../assets/sezioni-assiali-worker.js';
process.env.MODELLO=fileURLToPath(new URL('../modelli/spalla-3d.html',import.meta.url));
const G=await import('./lib-modello.mjs');
const muscles=[...G.M.html.matchAll(/\{id:"([^"]+)",cat:"(cuf|cin|tor|brac)"/g)].map(m=>({id:m[1],cat:m[2]}));
assert.ok(muscles.length>0,'Nessun muscolo trovato: verificare il catalogo');
const open=[];let levels=0,repaired=0;
for(const {id,cat} of muscles){
 const mesh=indicizza({...G.REAL(id),id,cat});let min=Infinity,max=-Infinity;
 for(let i=1;i<mesh.pos.length;i+=3){min=Math.min(min,mesh.pos[i]);max=Math.max(max,mesh.pos[i]);}
 for(let mm=Math.ceil(min*10);mm<=Math.floor(max*10);mm++){
  levels++;const s=sezione(mesh,mm/10);if(s.repairedGapMM)repaired++;
  if(s.open.length)open.push({id,mm,chains:s.open.length});
 }
}
assert.deepEqual(open,[],'Contorni muscolari aperti da esaminare; non riempire automaticamente aperture estese');
console.log({muscles:muscles.length,levels,repaired,open:open.length});
