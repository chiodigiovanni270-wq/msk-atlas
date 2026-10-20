/* Anca: ricostruzione ripetibile di 27 strutture vascolo-nervose.
   node strumenti/vasi-nervi-anca.mjs [--prova=report.json]
   MODELLO=/percorso/copia.html opera su una copia; --prova non scrive il modello.
   Dopo articolazione-anca.mjs. Non modifica mesh preesistenti né richiede download.
   Coordinate/territori in dati-neurovascolari-anca.mjs. Guide Catmull-Rom a 0,8 mm,
   rilassamento contro ossa/capsula e ostacoli muscolari profondi su griglia 1 mm.
   Tubi chiusi con trasporto parallelo, calibro rastremato, fibre tangenti.
   I raccordi tra strutture hanno sovrapposizione interna; non sono unioni booleane.
   Controlli sui vertici e sugli assi, non certificazione delle impronte o dei tessuti molli.
*/
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {NV,NVCATS} from './dati-neurovascolari-anca.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.env.MODELLO ||=resolve(root,'modelli/anca-3d.html');
const G=await import('./lib-modello.mjs');
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]),sub=(a,b)=>add(a,b,-1),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),len=a=>Math.hypot(...a),unit=a=>mul(a,1/(len(a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sample=(F,p)=>G.sample(F,...p),clamp=G.clamp;
function curve(P){const Q=[P[0],...P,P.at(-1)],out=[];for(let k=0;k<P.length-1;k++){const [a,b,c,d]=Q.slice(k,k+4),n=Math.max(4,Math.ceil(len(sub(b,c))/.08));for(let i=0;i<n;i++){const t=i/n;out.push(b.map((v,j)=>.5*(2*v+(-a[j]+c[j])*t+(2*a[j]-5*v+4*c[j]-d[j])*t*t+(-a[j]+3*v-3*c[j]+d[j])*t*t*t)));}}out.push(P.at(-1).slice());return out;}
const rigid=['coxale','femore','sacro','cart_testa','cart_acet','capsula'];
G.griglia([-7.4,-16.4,-10],[14,16.4,6.6],.10,.2);
G.log('Campo ossa e articolazione');const R=G.campo(rigid).F;
// Il grande gluteo e il medio gluteo sono coperture, non ostacoli da aggirare all'esterno.
const DEEP=['piriforme','ott_int','ott_est','quadrato','iliaco','psoas','pettineo','gmin'];
G.log('Campo muscoli profondi');const M=G.campo(DEEP).F;
const tracks=new Map(),report=[];
function radii(s,n){const taper=s.id.endsWith('iliaca_ext')?1/9:.22;return Array.from({length:n},(_,i)=>s.r*(1-taper*i/(n-1)));}
function push(p,F,target,strength=1){const d=sample(F,p);if(d>=target)return p;return add(p,unit(G.grad(F,p)),Math.min(.25,(target-d)*strength));}
function nearest(P,p){let j=0,d=Infinity;for(let i=0;i<P.length;i++){const q=P[i],x=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;if(x<d){d=x;j=i;}}return j;}
for(const s of NV){
 let P=curve(s.p),guide=P.map(p=>p.slice()),r=radii(s,P.length);const parent=tracks.get(s.parent);
 // Le branche nascono sull’asse del vaso di origine dopo l’adattamento.
 let anchor=null;if(parent){const continuation=s.id==='a_femorale'||s.id==='v_femorale';const k=continuation?parent.P.length-4:nearest(parent.P,P[0]);anchor=parent.P[k].slice();if(continuation)for(let i=0;i<8;i++)r[i]=parent.r[k]*.98+(r[i]-parent.r[k]*.98)*i/8;const delta=sub(anchor,P[0]);P=P.map((p,i)=>add(p,delta,Math.exp(-i/16)));guide=P.map(p=>p.slice());}
 for(let pass=0;pass<150;pass++){
  const prev=P.map(p=>p.slice());for(let i=0;i<P.length;i++){
   let p=P[i];if(i>0&&i<P.length-1)p=add(p,sub(mul(add(prev[i-1],prev[i+1]),.5),p),.45);
   p=add(p,sub(guide[i],p),.018);
   // I nervi diretti ai rotatori entrano nel muscolo al termine: nessuna repulsione muscolare.
   const terminal=s.id==='n_quadrato'||s.id==='n_ott_int'||s.id==='n_gluteo_inf';
   if(!terminal){p=push(p,M,r[i]+.035,.18);}
   p=push(p,R,r[i]+.10);
   // Separa i tronchi indipendenti; conserva la connessione delle branche.
   for(const [id,t] of tracks){if(id===s.parent||s.id.startsWith('v_')&&id===s.id.replace('v_','a_')&&i<8)continue;
    const k=nearest(t.P,p),d=len(sub(p,t.P[k])),target=r[i]+t.r[k]+.025;
    if(d<target&&!(parent&&i<18))p=add(p,unit(sub(p,t.P[k])),(target-d)*.7);
   }
   P[i]=p;
  }
  if(anchor)for(let i=0;i<8;i++)P[i]=add(P[i],sub(anchor,P[0]),(8-i)/8);
 }
 // Raccordi più regolari: levigatura su finestra 4,8 mm, poi vincolo rigido.
 for(let pass=0;pass<90;pass++){const prev=P.map(p=>p.slice());for(let i=1;i<P.length-1;i++){
  const lo=Math.max(0,i-3),hi=Math.min(P.length-1,i+3);
  let p=add(P[i],sub(mul(add(prev[lo],prev[hi]),.5),P[i]),.35);
  P[i]=push(p,R,r[i]+.12);
 }if(anchor)P[0]=anchor.slice();}
 // Proiezione rigida finale dopo il rilassamento: non modifica ossa o muscoli.
 for(let pass=0;pass<12;pass++)for(let i=0;i<P.length;i++)P[i]=push(P[i],R,r[i]+.10);
 if(anchor){const shift=len(sub(P[0],anchor));if(shift>parent.r[nearest(parent.P,anchor)])throw Error(s.id+': raccordo fuori dal vaso di origine');}
 tracks.set(s.id,{P,r});const mesh=tube(P,r,s.id==='n_ischiatico'?.72:1);
 for(let i=1;i<mesh.pos.length;i+=3)mesh.pos[i]=Math.max(-16,Math.min(16,mesh.pos[i]));
 // Volume positivo e controllo prima della scrittura.
 let vol=0;for(let i=0;i<mesh.idx.length;i+=3){const q=mesh.idx.slice(i,i+3).map(j=>Array.from(mesh.pos.slice(j*3,j*3+3)));vol+=dot(q[0],cross(q[1],q[2]))/6;}
 if(vol<0)for(let i=0;i<mesh.idx.length;i+=3)[mesh.idx[i+1],mesh.idx[i+2]]=[mesh.idx[i+2],mesh.idx[i+1]];
 let minimum=Infinity,inside=0,maxMove=0;for(let i=0;i<mesh.pos.length;i+=3){const p=Array.from(mesh.pos.slice(i,i+3)),d=sample(R,p);minimum=Math.min(minimum,d);if(d<-.03)inside++;for(let k=0;k<3;k++)if(p[k]<G.man.min[k]||p[k]>G.man.max[k])throw Error(s.id+': fuori dal riquadro '+JSON.stringify(p));}
 P.forEach((p,i)=>maxMove=Math.max(maxMove,len(sub(p,guide[i]))));
 report.push({id:s.id,vertices:mesh.pos.length/3,minRigidMm:minimum*10,insideRigid:inside,maxGuideShiftMm:maxMove*10});
 if(inside){console.log('DIAG',s.id,minimum, P.map((p,i)=>({p,d:sample(R,p),r:r[i]})).filter(q=>q.d<q.r+.01));throw Error(s.id+': intersezione rigida '+inside);}
 G.setMesh(s.id,mesh);G.log(s.id,'distanza rigida mm',(minimum*10).toFixed(2),'spostamento massimo mm',(maxMove*10).toFixed(1));
}
function tube(P,r,flat){const pos=[],idx=[],fdir=[],K=16;let u=[1,0,0];
 for(let i=0;i<P.length;i++){const t=unit(sub(P[Math.min(i+1,P.length-1)],P[Math.max(0,i-1)]));u=sub(u,mul(t,dot(u,t)));if(len(u)<.01)u=cross(t,[0,0,1]);u=unit(u);const v=cross(t,u);
  for(let j=0;j<K;j++){const a=j*2*Math.PI/K;pos.push(...add(add(P[i],u,r[i]*Math.cos(a)),v,r[i]*flat*Math.sin(a)));fdir.push(...t.map(x=>Math.round(x*127)));}
  if(i)for(let j=0;j<K;j++){const a=(i-1)*K+j,b=(i-1)*K+(j+1)%K,c=i*K+j,d=i*K+(j+1)%K;idx.push(a,b,c,b,d,c);}}
 for(const end of [0,P.length-1]){const c=pos.length/3;pos.push(...P[end]);fdir.push(0,127,0);for(let j=0;j<K;j++)idx.push(c,end*K+(end===0?(j+1)%K:j),end*K+(end===0?j:(j+1)%K));}
 return {pos:Float64Array.from(pos),idx, fdir:Int8Array.from(fdir)};
}
const prova=process.argv.find(a=>a.startsWith('--prova='));if(prova){writeFileSync(prova.slice(8),JSON.stringify(report,null,2));process.exit(0);}
// Replace only categories/catalogue; viewer, materials and controls remain byte-identical.
G.M.html=G.M.html.replace(/const CATS=(\[.*?\]);/,(_,json)=>{const cats=JSON.parse(json).filter(c=>!NVCATS.some(n=>n.id===c.id));return 'const CATS='+JSON.stringify([...cats,...NVCATS])+';';});
G.M.html=G.M.html.replace(/\n\/\* NV ANCA START \*\/[\s\S]*?\/\* NV ANCA END \*\//,'');
const rows=NV.map(s=>JSON.stringify({id:s.id,cat:s.cat,name:s.name,info:s.info}).slice(0,-1)+`,b:()=>[REAL(${JSON.stringify(s.id)})]}`).join(',\n');
G.M.html=G.M.html.replace(/(const S=\[[\s\S]*?)(\n\];)/,(_,body,end)=>body+'\n/* NV ANCA START */\n,'+rows+'\n/* NV ANCA END */'+end);
G.M.html=G.M.html.replace(/<meta name="strutture-escluse"[^>]*>/,'<meta name="strutture-escluse" content="Borse, cute, plessi lombosacrali completi, rami nervosi terminali, piccoli rami retinacolari e perforanti, vasi pudendi, sistema safenico, varianti anatomiche e dettagli dei singoli tendini.">');
G.M.html=G.M.html.replace(/(<meta name="strutture-modellate" content=")([^"]*)(">)/,(_,a,b,c)=>a+b.replace(/ Vasi e nervi:.*$/,'')+' Vasi e nervi: decorsi e calibri ricostruiti, non segmentati; in revisione anatomica.'+c);
G.saveFile(G.repack());
console.log(JSON.stringify(report,null,2));
