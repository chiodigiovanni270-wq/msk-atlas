/* Rifinitura finale dei gusci sottili in spazi articolari stretti e dei
   retinacoli dopo il passaggio sopra i tendini. Richiamata dal generatore.
   Cerca il punto libero più vicino fra normali e 26 direzioni, entro 4 mm;
   fallisce se occorre una deformazione maggiore. Non modifica ossa/cartilagini. */
import {surface,point,add,mul,unit,len,sub} from './lib-caviglia.mjs';
export function rifinisciContatti(meshes){
 const B=meshes.filter(m=>['tibia','fibula','talo','calcagno','navicolare','cuboide'].includes(m.n)).map(surface);
 const directions=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z)directions.push(unit([x,y,z]));
 const query=p=>B.map(S=>{const d=Math.hypot(...p.map((v,k)=>Math.max(S.root.lo[k]-v,0,v-S.root.hi[k])));return d>.5?{signed:d,n:[0,0,0]}:S.nearest(p);});
 const names=['talocalc_io','mem_io','caps_sub','ret_est_sup','ret_est_inf_sup','grasso_seno'];
 for(const name of names){const m=meshes.find(m=>m.n===name),target=name==='grasso_seno'?.07:.035;let changed=0,max=0;
  for(let i=0;i<m.pos.length/3;i++){const p=point(m,i),Q=query(p);if(Q.every(q=>q.signed>=target))continue;
   let candidate=null;const normals=Q.filter(q=>q.signed<target).map(q=>q.n),dirs=[...normals,unit(normals.reduce((a,n)=>add(a,n),[0,0,0])),...directions];
   outer:for(const r of [.015,.03,.05,.075,.1,.15,.2,.3,.4])for(const d of dirs){if(len(d)<.1)continue;const q=add(p,d,r);if(query(q).every(v=>v.signed>=target)){candidate=q;break outer;}}
   if(!candidate)throw Error(name+': contatto non risolto entro 4 mm, vertice '+i);
   max=Math.max(max,len(sub(candidate,p)));m.pos.set(candidate,i*3);changed++;
  }
  console.log('Contatti',name,changed,'vertici, spostamento massimo',max.toFixed(3),'cm');
 }
}
