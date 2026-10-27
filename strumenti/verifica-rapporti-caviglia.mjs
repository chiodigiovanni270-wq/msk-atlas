// Diagnostica campionata, non certificazione anatomica. Nessuna modifica.
// Uso: node strumenti/verifica-rapporti-caviglia.mjs; MODELLO per una copia.
import {fileURLToPath} from 'node:url';
process.env.MODELLO ||= fileURLToPath(new URL('../modelli/caviglia-3d.html',import.meta.url));
const G=await import('./lib-modello.mjs');
const {surface,point}=await import('./lib-caviglia.mjs');
const muscles=['ta','ehl','edl','ft','fl','fb','tp','fdl','fhl','soleo','gm','edb','ehb','abh','fdb','adm','qp'].filter(n=>G.man.meshes.some(m=>m.n===n)).map(n=>({n,s:surface(G.REAL(n))}));
let total=0;
for(const entry of G.man.meshes.filter(m=>/^(a_|v_|n_)/.test(m.n))){const m=G.REAL(entry.n),hits=[];for(const {n,s}of muscles){let count=0,min=0;for(let i=0;i<m.nv;i+=Math.max(1,Math.floor(m.nv/150))){const p=point(m,i);if(p.some((v,k)=>v<s.root.lo[k]||v>s.root.hi[k]))continue;const q=s.nearest(p);if(q.signed<-.03){count++;min=Math.min(min,q.signed);}}if(count)hits.push({muscle:n,count,mm:+(min*10).toFixed(2)});}if(hits.length){total+=hits.reduce((n,h)=>n+h.count,0);console.log(entry.n,JSON.stringify(hits));}}

console.log("Campioni muscolari oltre 0,3 mm:",total);
if(process.argv.includes("--strict") && total)process.exitCode=1;
