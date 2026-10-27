/* Rifinitura locale delle vene fibulari nello spazio tra muscoli affrontati.
   Importata dalla revisione: non scrive file. Ricerca limitata a 1,2 mm. */
import {point,add,unit,len,sub} from './lib-caviglia.mjs';
export function contattiVene(m,obstacles){
 const dirs=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)dirs.push(unit([x,y,z]));
 const clear=p=>obstacles.every(({s})=>!p.every((v,k)=>v>s.root.lo[k]-.1&&v<s.root.hi[k]+.1)||s.nearest(p).signed>=.012);
 let changed=0;for(let i=0;i<m.pos.length/3;i++){const p=point(m,i);if(clear(p))continue;let q=null;outer:for(const r of [.015,.03,.05,.08,.12])for(const d of dirs){const candidate=add(p,d,r);if(clear(candidate)){q=candidate;break outer;}}if(q){m.pos.set(q,i*3);changed++;}}
 return changed;
}
