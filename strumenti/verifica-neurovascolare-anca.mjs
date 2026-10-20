/* Verifica offline dopo vasi-nervi-anca.mjs. Nessuna scrittura/download.
   node strumenti/verifica-neurovascolare-anca.mjs
   MODELLO=/percorso/copia.html opzionale. Misura il file quantizzato realmente caricato.
   BASE è la revisione articolare precedente: verifica l'invarianza delle 36 mesh originali.
   Test sui vertici, non una validazione clinica o completa delle intersezioni dei triangoli. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NV} from './dati-neurovascolari-anca.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.env.MODELLO ||=resolve(root,'modelli/anca-3d.html');
const G=await import('./lib-modello.mjs');
const BASE='ebcccf75183c0081b9477d7c852e6b5e35048e1c';
const h=execFileSync('git',['show',BASE+':modelli/anca-3d.html'],{cwd:root,maxBuffer:20e6}).toString();
const man=JSON.parse(h.match(G.reManRe)[2]);let raw=Buffer.from(h.match(G.reDatRe)[2].trim(),'base64');if(raw[0]===31&&raw[1]===139)raw=gunzipSync(raw);
assert.deepEqual(G.man.min,man.min);assert.deepEqual(G.man.max,man.max);
for(const m of man.meshes){const g=G.REAL(m.n);const q=new Uint16Array(raw.buffer.slice(raw.byteOffset+m.p,raw.byteOffset+m.p+m.nv*6)),p=Float32Array.from(q,(v,i)=>man.min[i%3]+v/65535*(man.max[i%3]-man.min[i%3]));assert.deepEqual(g.pos,p,m.n+' cambiata');const I=m.i16?Uint16Array:Uint32Array;const idx=new I(raw.buffer.slice(raw.byteOffset+m.i,raw.byteOffset+m.i+m.ni*(m.i16?2:4)));assert.deepEqual(g.idx,idx,m.n+' topologia cambiata');}
console.log('OK: tutte le 36 mesh preesistenti identiche alla revisione articolare.');
G.griglia([-7.4,-16.4,-10],[14,16.4,6.6],.10,.2);const R=G.campo(['coxale','femore','sacro','cart_testa','cart_acet','capsula']).F;
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],point=(g,i)=>Array.from(g.pos.slice(3*i,3*i+3));
for(const s of NV){const g=G.REAL(s.id),edges=new Map();let deg=0,inside=0,min=Infinity;
 for(let t=0;t<g.idx.length;t+=3){const [a,b,c]=g.idx.slice(t,t+3);if(Math.hypot(...cross(sub(point(g,b),point(g,a)),sub(point(g,c),point(g,a))))<1e-9)deg++;for(const [u,v]of[[a,b],[b,c],[c,a]]){const k=Math.min(u,v)+','+Math.max(u,v),e=edges.get(k)||[0,0];e[0]++;e[1]+=u<v?1:-1;edges.set(k,e);}}
 assert.equal(deg,0,s.id+' triangoli degeneri');assert.equal([...edges.values()].filter(([n,dir])=>n!==2||dir!==0).length,0,s.id+' mesh non chiusa/orientata');
 for(let i=0;i<g.nv;i++){const d=G.sample(R,...point(g,i));min=Math.min(min,d);if(d<-.03)inside++;}assert.equal(inside,0,s.id+' attraversa osso/capsula');
 console.log(s.id,`${g.nv} vertici, chiusa; distanza minima ${(min*10).toFixed(2)} mm`);
}
console.log('OK: 27 strutture vascolo-nervose chiuse; nessun vertice oltre 0,3 mm dentro ossa/cartilagini/capsula.');
