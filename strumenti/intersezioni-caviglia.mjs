/* Intersezioni trasversali tra triangoli: tutte le strutture, incluse quelle
   nascoste. Nessuna modifica. Non classifica automaticamente inserzioni,
   superfici coincidenti o continuità anatomiche; risultati da revisionare.
   Uso: node strumenti/intersezioni-caviglia.mjs > rapporto.jsonl */
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {surface,sub,dot,cross,add} from './lib-caviglia.mjs';
process.env.MODELLO ||=fileURLToPath(new URL('../modelli/caviglia-3d.html',import.meta.url));
const G=await import('./lib-modello.mjs');
const match=G.M.html.match(/const S=([\s\S]*?);\s*const catById/),catalog=vm.runInNewContext(match[1],{REAL:n=>n});
const models=G.man.meshes.map(m=>({id:m.n,cat:catalog.find(s=>s.id===m.n)?.cat,tree:surface(G.REAL(m.n)).root}));
const overlap=(a,b)=>a.lo.every((v,k)=>v<b.hi[k]-.002&&b.lo[k]<a.hi[k]-.002);
function segment(a,b,t){const d=sub(b,a),e1=sub(t.p[1],t.p[0]),e2=sub(t.p[2],t.p[0]),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)return null;const s=sub(a,t.p[0]),u=dot(s,h)/det;if(u<0||u>1)return null;const q=cross(s,e1),v=dot(d,q)/det;if(v<0||u+v>1)return null;const f=dot(e2,q)/det;return f>.002&&f<.998?add(a,d,f):null;}
const cut=t=>t.p.every(p=>Math.abs(p[1]-14)<.005)||t.p.every(p=>Math.abs(p[2]-8)<.005);
for(let i=0;i<models.length;i++)for(let j=i+1;j<models.length;j++){
 const a=models[i],b=models[j];if(!overlap(a.tree,b.tree))continue;let count=0,points=[];
 function visit(A,B){if(count>=40||!overlap(A,B))return;if(A.T&&B.T){for(const t of A.T)for(const u of B.T){if(cut(t)&&cut(u))continue;let hit=null;for(let e=0;e<3&&!hit;e++)hit=segment(t.p[e],t.p[(e+1)%3],u)||segment(u.p[e],u.p[(e+1)%3],t);if(hit){count++;if(points.length<3)points.push(hit.map(x=>+x.toFixed(3)));if(count>=40)return;}}}else if(A.T){visit(A,B.L);visit(A,B.R);}else if(B.T){visit(A.L,B);visit(A.R,B);}else{visit(A.L,B.L);visit(A.L,B.R);visit(A.R,B.L);visit(A.R,B.R);}}
 visit(a.tree,b.tree);if(count)console.log(JSON.stringify({a:a.id,b:b.id,categories:[a.cat,b.cat],crossings:count,capped:count>=40,points}));
}
