/* Controlli offline dell'anca, senza scrivere né scaricare dati.
   node strumenti/verifica-anca.mjs
   MODELLO=/percorso/anca.html per una copia. Dopo articolazione-anca.mjs.
   Controlla catalogo, buffer, riferimenti, materiali rispetto alla spalla e distanze
   delle superfici articolari dalle ossa. Griglia 0,6 mm; tolleranza 0,3 mm.
   Non certifica le impronte anatomiche né rileva tutti gli incroci tra triangoli.
*/
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {STR,CATS} from './dati-anca.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.env.MODELLO ||=resolve(root,'modelli/anca-3d.html');
const G=await import('./lib-modello.mjs');
const h=G.M.html,shoulder=readFileSync(resolve(root,'modelli/spalla-3d.html'),'utf8');
assert.equal(STR.length,35);assert.equal(new Set(STR.map(s=>s.id)).size,35);
assert.equal(G.man.meshes.length,36);assert.equal(new Set(G.man.meshes.map(m=>m.n)).size,36);
for(const s of STR){assert(CATS.some(c=>c.id===s.cat));assert(h.includes('"id":"'+s.id+'"'));if(['cin','cuf','tor','brac','leg','tfl'].includes(s.cat))assert(s.o&&s.ins&&s.fn);}
for(const ref of h.matchAll(/REAL\(["']([^"']+)["']\)/g))assert(G.man.meshes.some(m=>m.n===ref[1]),ref[1]);
for(const m of G.man.meshes){const g=G.REAL(m.n);assert(g.pos.every(Number.isFinite),m.n);assert(g.idx.every(i=>i<g.nv),m.n);assert.equal(g.idx.length%3,0);}
// I blocchi effettivamente eseguiti rimangono quelli del visualizzatore di riferimento.
for(const [from,to]of [['function makeMat(', 'function finishGeo('],['function shaderize(', 'const REALFIB='],['function buildStruct(', '/* ============ Camera']]){
 const block=s=>s.slice(s.indexOf(from),s.indexOf(to));assert(h.includes(from)&&shoulder.includes(from));assert.equal(block(h),block(shoulder),from);
}
assert.equal(h.match(/<style>([\s\S]*?)<\/style>/)[1],shoulder.match(/<style>([\s\S]*?)<\/style>/)[1]);
assert(h.includes('<title>Anca 3D | MSK Atlas</title>'));assert(h.includes('data-theme="dark"'));assert(h.includes('src="../assets/nav.js"'));
assert(h.includes('<b>Materiale didattico.</b> Non destinato a uso clinico o diagnostico.'));
console.log('OK: 35 schede, 36 mesh, buffer, categorie, riferimenti; CSS, shader e materiali identici alla spalla.');
const names=['cart_testa','cart_acet','labbro','capsula','iliofemorale_a','iliofemorale_b','pubofemorale','ischiofemorale','trasverso','rotondo'];
G.griglia([-7,-7,-5],[4,5,5],.06,0);
for(const bone of ['femore','coxale']){const {F}=G.campo([bone]);for(const n of names){const m=G.REAL(n),limit=n.startsWith('cart_')?G.man.meshes.find(e=>e.n===n).extNv:m.nv;let count=0,min=Infinity;for(let i=0;i<limit;i++){const d=G.sample(F,...m.pos.subarray(i*3,i*3+3));if(d<-.03)count++;min=Math.min(min,d);}console.log(`${bone} / ${n}: ${count} vertici oltre 0,3 mm; distanza minima ${(min*10).toFixed(2)} mm`);assert.equal(count,0,`${n} attraversa ${bone}`);}}
// La fovea deve restare aperta: nessuna faccia esterna nella calotta centrale.
const f=G.REAL('cart_testa'),axis=[1.777,.408,-.366],norm=Math.hypot(...axis);let nearest=Math.PI;
for(let i=0;i<G.man.meshes.find(e=>e.n==='cart_testa').extNv;i++){const p=Array.from(f.pos.subarray(i*3,i*3+3)),cos=p.reduce((s,v,k)=>s+v*axis[k],0)/(Math.hypot(...p)*norm);nearest=Math.min(nearest,Math.acos(Math.min(1,cos)));}
assert(nearest>.20);console.log('OK: fovea libera, apertura minima', (nearest*180/Math.PI).toFixed(1),'gradi.');
