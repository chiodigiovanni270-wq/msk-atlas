// node strumenti/verifica-sezioni-assiali.mjs — verifiche dell'intersezione su un solido noto.
import assert from 'node:assert/strict';
import {sezione} from '../assets/sezioni-assiali-worker.js';
const pos=new Float32Array([-1,-1,-1,1,-1,-1,1,1,-1,-1,1,-1,-1,-1,1,1,-1,1,1,1,1,-1,1,1]);
const idx=new Uint32Array([0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2]);
for(const y of [-.999,0,.5,.999]){
 const r=sezione({pos,idx},y);assert.equal(r.loops.length,1);assert.equal(r.open.length,0);
 const p=r.loops[0];const area=Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1]},0))/2;
 assert.ok(Math.abs(area-4)<1e-6,'Area della sezione del cubo');
}
for(const y of [-2,2])assert.equal(sezione({pos,idx},y).loops.length,0);
const open=sezione({pos,idx:idx.slice(6)},0);assert.equal(open.loops.length,0);assert.ok(open.open.length>0,'Superficie aperta segnalata, non riempita');
console.log('Sezioni assiali: aree, livelli esterni e contorni aperti verificati.');
