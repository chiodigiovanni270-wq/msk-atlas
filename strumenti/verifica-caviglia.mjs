/* Verifica offline: node strumenti/verifica-caviglia.mjs [--contatti]
   Nessuna modifica. --contatti misura le distanze ossee delle ricostruzioni
   su campioni di vertici; non certifica impronte o assenza di autointersezioni.
   MODELLO=/file.html consente il controllo di una copia. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {surface,point} from './lib-caviglia.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.env.MODELLO ||=resolve(root,'modelli/caviglia-3d.html');
const G=await import('./lib-modello.mjs'),h=G.M.html;
const code=h.match(/const CATS=([\s\S]*?);\s*const S=([\s\S]*?);\s*const catById/);
assert(code,'Catalogo riconoscibile');const CATS=vm.runInNewContext(code[1]),S=vm.runInNewContext(code[2],{REAL:n=>n});
assert.equal(new Set(S.map(s=>s.id)).size,S.length);assert.equal(new Set(G.man.meshes.map(m=>m.n)).size,G.man.meshes.length);
assert(S.length>120,'Catalogo completo atteso');
const required=['tibia','fibula','talo','calcagno','ltfa','lcf','ltfp','tfa','tfp','tfio','del_ant','del_post','del_spring','spring_sm','spring_mpo','spring_ipl','mem_io','caps_ant','caps_post','caps_sub','caps_tn','caps_cc','achille','t_tp','t_fhl','t_fdl','t_fl','t_fb','n_tibiale','n_fib_prof','n_fib_sup','n_surale','n_safeno','a_tib_ant','a_tib_post','a_fibulare','borsa_retro','grasso_kager'];
for(const id of required)assert(S.some(s=>s.id===id),id);
let triangles=0;for(const s of S){assert(CATS.some(c=>c.id===s.cat),s.id);assert(s.name&&s.info,s.id);if(['leg','ret','ten','cin','cuf','tor','brac','tfl'].includes(s.cat))assert(s.o&&s.ins&&s.fn,s.id+' OIF');for(const name of s.b()){assert(G.man.meshes.some(m=>m.n===name),name);const m=G.REAL(name);assert(m.pos.every(Number.isFinite),name);assert(m.idx.every(i=>i>=0&&i<m.nv),name);assert(m.idx.length>0&&m.idx.length%3===0,name);triangles+=m.idx.length/3;}}
for(const match of h.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(/src=|text\/plain|application\/json/.test(match[1]))continue;new vm.Script(match[2]);}
const ref=readFileSync(resolve(root,'modelli/spalla-3d.html'),'utf8');assert.equal(h.match(/<style>([\s\S]*?)<\/style>/)[1],ref.match(/<style>([\s\S]*?)<\/style>/)[1]);
for(const id of ['c','bSheet','sheetBody','chips','bAll','bBones','bTransp','bList','list','card','cName','cInfo','cIso','cHide','load','loadBar','loadTxt'])assert(h.includes('id="'+id+'"'),id);
assert(h.includes('https://www.mskatlas.com/modelli/caviglia-3d.html'));assert(h.match(/<meta name="description" content="([^"]*)"/)[1].length<=160);
assert(!/spalla-3d|Spalla destra|Anca destra/.test(h));
console.log(JSON.stringify({strutture:S.length,mesh:G.man.meshes.length,triangoli:triangles,categorie:CATS.map(c=>({id:c.id,n:S.filter(s=>s.cat===c.id).length})),esito:'OK: catalogo, riferimenti, buffer, JavaScript, controlli comuni e CSS'},null,2));
if(process.argv.includes('--contatti')){const B=['tibia','fibula','talo','calcagno','navicolare','cuboide'].map(n=>surface(G.REAL(n)));for(const s of S.filter(s=>['leg','art','ven','ner','ret','bor','adi','caps'].includes(s.cat))){let min=Infinity,count=0,total=0;for(const n of s.b()){const m=G.REAL(n),step=Math.max(1,Math.floor(m.nv/500));for(let i=0;i<m.nv;i+=step){const p=point(m,i);let d=Infinity;for(const b of B)d=Math.min(d,b.nearest(p).signed);min=Math.min(min,d);if(d<-.03)count++;total++;}}console.log(s.id,JSON.stringify({campioni:total,oltre03mm:count,minimoMM:+(min*10).toFixed(3)}));assert.equal(count,0,s.id+': compenetrazioni ossee oltre 0,3 mm');}}
