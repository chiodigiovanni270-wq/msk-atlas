/* PROPOSTA SPERIMENTALE NON VALIDATA: usare MODELLO su una copia.
   Revisione locale ripetibile dalla base 35719a0. Nessuna modifica alle ossa.
   node strumenti/rifinitura-caviglia.mjs; MODELLO cambia l'output.
   Guide compartimentali, sezioni tubolari integre, raccordi dei rami;
   levigatura dei nastri con impronte terminali mantenute. */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {surface,point,add,sub,mul,len,mix,dot,unit,tube,shell,patch,avoid} from './lib-caviglia.mjs';
import {contattiVene} from './contatti-vene-caviglia.mjs';
if(!process.env.MODELLO)throw Error('Proposta non validata: indicare MODELLO su una copia di lavoro.');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.MODELLO||resolve(root,'modelli/caviglia-3d.html');
const dir=mkdtempSync(resolve(tmpdir(),'ankle-revision-')),base=resolve(dir,'base.html');
writeFileSync(base,process.env.BASE ? readFileSync(process.env.BASE) : execFileSync('git',['show','35719a0:modelli/caviglia-3d.html'],{cwd:root,maxBuffer:32e6}));
process.env.MODELLO=base;
const G=await import('./lib-modello.mjs');G.M.html=readFileSync(out,'utf8');
const boneIds=['tibia','fibula','talo','calcagno','navicolare','cuboide','cuneiforme1','cuneiforme2','cuneiforme3',...Array.from({length:5},(_,i)=>'metatarso'+(i+1))];
const muscleIds=['ta','ehl','edl','ft','fl','fb','tp','fdl','fhl','soleo','gm','edb','ehb','abh','fdb','adm','qp'];
const obstacles=[...boneIds,...muscleIds].filter(n=>G.man.meshes.some(m=>m.n===n)).map(n=>({n,s:surface(G.REAL(n))}));
const near=(s,p,r)=>p.every((v,k)=>v>s.root.lo[k]-r&&v<s.root.hi[k]+r);
const query=(p,r)=>obstacles.filter(({s})=>near(s,p,r)).map(({n,s})=>({n,...s.nearest(p)})).filter(q=>q.signed<r);
// Direzioni preferenziali per mantenere il compartimento dei tronchi profondi.
function preferred(id,p){if(/plant|baxter/.test(id))return [-1,1,0];if(/tib_post|tibiale/.test(id))return p[1]>2?[0,0,1]:[1,0,0];if(/fibulare/.test(id))return [1,0,0];if(/tib_ant|fib_prof/.test(id))return [0,0,1];if(/dors|tars|fib_sup/.test(id))return p[1]>1?[0,0,1]:[0,1,0];return [0,0,0];}
const paths={};
function solve(id,P,R){let Q=P.map(p=>p.slice());for(let pass=0;pass<10;pass++){
 const prev=Q.map(p=>p.slice());for(let i=0;i<Q.length;i++){
  let p=Q[i];if(i&&i<Q.length-1)p=mix(p,mix(prev[i-1],prev[i+1],.5),.45);
  for(let k=0;k<5;k++){const hits=query(p,R[i]+.04);if(!hits.length)break;const q=hits.sort((a,b)=>a.signed-b.signed)[0];let n=q.n;
   // Evita di portare il tibiale dietro al soleo o i rami plantari
   // sul versante superficiale dell’abduttore dell’alluce.
   const guide=unit(preferred(id,p));
   if(q.signed<0 && dot(n,guide)<-.25){
     // Ricerca locale sul versante anatomico previsto.
     let found=null;for(let d=.05;d<=1.2;d+=.05){const candidate=add(p,guide,d);if(!query(candidate,R[i]+.04).length){found=candidate;break;}}
     if(found){p=found;continue;}
   }
   p=add(q.p,n,R[i]+.045);
  }
  if(len(sub(p,P[i]))>(id==='n_tibiale'?1.15:.8))p=prev[i];Q[i]=p;
 }
 }
 return Q;}
for(const e of G.man.meshes.filter(m=>/^(a_|v_|n_)/.test(m.n))){const m=G.REAL(e.n),parts=[];const paired=/^v_(tib_ant|tib_post|fibulare|dorsale|plant_med|plant_lat)$/.test(e.n);const count=paired?2:1,nv=m.nv/count,rings=(nv-2)/16;if(!Number.isInteger(rings))throw Error(e.n+': topologia tubolare non riconosciuta');
 for(let part=0;part<count;part++){const P=[],R=[];for(let i=0;i<rings;i++){let c=[0,0,0];for(let j=0;j<16;j++)c=add(c,point(m,part*nv+i*16+j),1/16);P.push(c);let r=0;for(let j=0;j<16;j++)r+=len(sub(point(m,part*nv+i*16+j),c))/16;R.push(r);}
 const Q=solve(e.n,P,R);if(!paired)paths[e.n]={P:Q,R};parts.push(tube(Q,t=>R[Math.round(t*(R.length-1))]));console.log(e.n,'spostamento max mm',Math.max(...P.map((p,i)=>len(sub(p,Q[i]))*10)).toFixed(2));}
 const pos=[],idx=[],fd=[];for(const p of parts){const off=pos.length/3;pos.push(...p.pos);idx.push(...Array.from(p.idx,i=>i+off));fd.push(...p.fdir);}G.setMesh(e.n,{pos:Float32Array.from(pos),idx:Uint32Array.from(idx),fdir:Int8Array.from(fd)});
}
// Raccordi terminali: stessi punti centrali dei tronchi, senza rami sospesi.
const parents={a_dorsale:'a_tib_ant',a_plant_med:'a_tib_post',a_plant_lat:'a_tib_post',a_mall_med:'a_tib_ant',a_mall_lat:'a_tib_ant',a_perforante:'a_fibulare',a_calc_med:'a_tib_post',a_calc_lat:'a_fibulare',a_tars_med:'a_dorsale',a_tars_lat:'a_dorsale',n_plant_med:'n_tibiale',n_plant_lat:'n_tibiale',n_calc_med:'n_tibiale',n_baxter:'n_plant_lat',n_fib_prof_lat:'n_fib_prof',n_dors_med:'n_fib_sup',n_dors_int:'n_fib_sup',n_calc_lat:'n_surale'};
for(const [id,parent]of Object.entries(parents)){const c=paths[id],p=paths[parent];let anchor=p.P.reduce((a,b)=>len(sub(a,c.P[0]))<len(sub(b,c.P[0]))?a:b);for(let i=0;i<Math.min(10,c.P.length);i++){const t=i/9;c.P[i]=mix(anchor,c.P[i],t*t*(3-2*t));}G.setMesh(id,tube(c.P,t=>c.R[Math.round(t*(c.R.length-1))]));}
// Nastri: levigatura longitudinale senza restringere la larghezza o staccare
// le impronte. Le fibre vengono ricalcolate sulla geometria finale.
const guides=readFileSync(resolve(root,'strumenti/articolazione-caviglia.mjs'),'utf8');
const ids=[...guides.matchAll(/^ \['([^']+)'/gm)].map(m=>m[1]);
for(const id of ids){if(!G.man.meshes.some(m=>m.n===id))continue;const m=G.REAL(id),half=m.nv/2,rows=half/11;if(!Number.isInteger(rows))continue;const P=Float32Array.from(m.pos);for(let pass=0;pass<8;pass++){const prev=P.slice();for(let s=0;s<2;s++)for(let i=1;i<rows-1;i++)for(let j=0;j<11;j++){const v=s*half+i*11+j,p=mix(point({pos:prev},v),mix(point({pos:prev},v-11),point({pos:prev},v+11),.5),.35);for(const {n,s:S}of obstacles){if(!boneIds.includes(n)||!near(S,p,.1))continue;const q=S.nearest(p);if(q.signed<.015)p.splice(0,3,...add(q.p,q.n,.015));}P.set(p,v*3);}}
 const fd=new Int8Array(P.length);for(let s=0;s<2;s++)for(let i=0;i<rows;i++)for(let j=0;j<11;j++){const v=s*half+i*11+j,d=unit(sub(point({pos:P},s*half+Math.min(rows-1,i+1)*11+j),point({pos:P},s*half+Math.max(0,i-1)*11+j)));fd.set(d.map(x=>Math.round(x*127)),v*3);}if(id==='ltfa'){
  const pos=[],idx=[],fdir=[];
  for(const start of [0,6]){
   const b=patch(rows-1,4,(t,u)=>point({pos:P},Math.round(t*(rows-1))*11+start+Math.round(u*4)));
   const band=shell(b,(p,i,side)=>{const row=Math.floor(i/5),col=start+i%5;return point({pos:P},side*half+row*11+col);});
   const offset=pos.length/3;pos.push(...band.pos);idx.push(...Array.from(band.idx,i=>i+offset));
   for(let side=0;side<2;side++)for(let row=0;row<rows;row++)for(let col=start;col<start+5;col++)fdir.push(...fd.slice((side*half+row*11+col)*3,(side*half+row*11+col)*3+3));
  }
  G.setMesh(id,{pos:Float32Array.from(pos),idx:Uint32Array.from(idx),fdir:Int8Array.from(fdir)});
 }else G.setMesh(id,{...m,pos:P,fdir:fd});}

// Controllo anche delle superfici (non solo delle linee centrali).
const bounded=obstacles.map(({s})=>({nearest:p=>near(s,p,.35)?s.nearest(p):{signed:1,p,n:[0,0,0]}}));
for(const e of G.man.meshes.filter(m=>/^(a_|v_|n_)/.test(m.n))){const m=G.REAL(e.n);const shift=avoid(m,bounded,.02);G.setMesh(e.n,m);console.log('Superficie',e.n,'mm',shift*10);}
for(const e of G.man.meshes.filter(m=>/^(a_|v_|n_)/.test(m.n))){const mesh=G.REAL(e.n);console.log('Contatti locali',e.n,contattiVene(mesh,obstacles));G.setMesh(e.n,mesh);}
G.saveFile(G.repack());writeFileSync(out,readFileSync(base));rmSync(dir,{recursive:true});console.log('Revisione salvata',out);
