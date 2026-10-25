/* Correzione locale dei rapporti vascolari del ginocchio.
   node strumenti/rifinitura-arterie-ginocchio.mjs
   MODELLO=/percorso/copia.html per la revisione. Non pubblica.
   Rilanciabile dalla revisione BASE; riusa i canali del generatore originale.
   Prima corregge il contatto dei rami inferiori con ossa/collaterali,
   poi apre piccoli corridoi sulla faccia dei muscoli che coprono le arterie.
   Non porta i vasi nel sottocute e non cambia calibri o inserzioni ossee. */
import * as G from './lib-modello.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const BASE='b174d4f18287f4363cc3643fe52104176be79ebe';
const root=fileURLToPath(new URL('..',import.meta.url));
if(process.argv.includes('--lamine')){
 const a=G.M.html.indexOf("{id:'agen'"),b=G.M.html.indexOf('\n {id:',a+1);
 const tubes=[...G.M.html.slice(a,b).matchAll(/tube\((\[\[.*?\]\]),([\d.]+)/g)];
 const pts=JSON.parse(tubes[2][1]),samples=[];
 for(let i=1;i<pts.length;i++)for(let j=0;j<10;j++)samples.push(pts[i-1].map((v,k)=>v+(pts[i][k]-v)*j/10));
 function deep(p,I,y,z){let lo=Infinity,hi=-Infinity;
  for(let t=0;t<I.length;t+=3){const[a,b,c]=I.slice(t,t+3).map(i=>i*3);const ay=p[a+1],az=p[a+2],by=p[b+1],bz=p[b+2],cy=p[c+1],cz=p[c+2];
   const d=(by-cy)*(az-cz)+(cz-bz)*(ay-cy);if(Math.abs(d)<1e-10)continue;
   const u=((by-cy)*(z-cz)+(cz-bz)*(y-cy))/d,v=((cy-ay)*(z-cz)+(az-cz)*(y-cy))/d;
   if(u<0||v<0||u+v>1)continue;const x=u*p[a]+v*p[b]+(1-u-v)*p[c];lo=Math.min(lo,x);hi=Math.max(hi,x);
  }return [lo,hi];}
 const originals=Object.fromEntries(['sart','semit'].map(n=>[n,G.realDaRevisione(BASE,n,'modelli/ginocchio-3d.html')]));
 const bumps=samples.flatMap(q=>{let delta=0;
  for(const m of Object.values(originals)){const[lo,hi]=deep(m.pos,m.idx,q[1],q[2]);const d=q[0]+.32-lo;
   if(Number.isFinite(lo)&&d>0&&d<1.2&&q[0]<hi+.4)delta=Math.max(delta,d);}
  return delta?[{q,d:delta}]:[];
 });
 for(const n of ['sart','semit']){
  const m=originals[n],p=m.pos.slice();
  for(let i=0;i<p.length;i+=3){let d=0;for(const b of bumps){if(Math.abs(p[i]-b.q[0])>1)continue;
   const r=Math.hypot(p[i+1]-b.q[1],p[i+2]-b.q[2]);d=Math.max(d,b.d*Math.exp(-((r/.5)**2)));}p[i]+=d;}
  G.setMesh(n,{...m,pos:p});G.log(n+': lamina sollevata in continuità, senza incisione');
 }
 G.griglia([1.5,-7,-2.5],[6.5,1,4],.04,.3);
 const F=G.campo(['sart','grac','semit','gmed']).F;
 const points={},originalHtml=execFileSync('git',['show',`${BASE}:modelli/ginocchio-3d.html`],{cwd:root,maxBuffer:32e6}).toString();
 for(const id of ['nsaf','ninfra']){
  const a=G.M.html.indexOf(`{id:'${id}'`),b=G.M.html.indexOf('\n {id:',a+1),block=G.M.html.slice(a,b);
  const match=block.match(/tube\((\[\[.*?\]\]),/),P=JSON.parse(originalHtml.slice(originalHtml.indexOf(`{id:'${id}'`)).match(/tube\((\[\[.*?\]\]),/)[1]);
  for(let i=0;i<P.length;i++){
   if(P[i][1]<-6||P[i][1]>0||P[i][0]<2)continue;
   if(id==='ninfra'&&i===0){const root=points.nsaf.find(p=>Math.abs(p[1]+1.35)<.15);if(root)P[i]=root.slice();}
   const target=id==='nsaf'?.20:.17;
   if(G.sample(F,...P[i])<target)P[i]=G.proietta(q=>G.sample(F,...q),P[i],target,25).map(v=>+v.toFixed(4));
  }
  points[id]=P;G.M.html=G.M.html.replace(match[1],JSON.stringify(P));
 }
 G.saveFile(G.repack());process.exit(0);
}
const before=execFileSync('git',['show',`${BASE}:modelli/ginocchio-3d.html`],{cwd:root,maxBuffer:32e6}).toString();
const block=h=>{const a=h.indexOf("{id:'agen'"),b=h.indexOf('\n {id:',a+1);return {a,b,text:h.slice(a,b)};};
const base=block(before),cur=block(G.M.html);
G.griglia([-6,-5,-5],[6,7,4],.04,.3);
const F=G.campo(['femore','tibia','perone','lcm','lcl']).F;
let n=0;
const text=base.text.replace(/tube\((\[\[.*?\]\]),([\d.]+)/g,(all,src,r)=>{
 const k=n++;if(k<2)return all;
 const P=JSON.parse(src),out=P.map(p=>p.slice());
 for(let it=0;it<30;it++){
  const old=out.map(p=>p.slice());
  for(let i=1;i<out.length;i++){
   let p=old[i].map((v,c)=>v+.2*((old[i-1][c]+old[Math.min(old.length-1,i+1)][c])/2-v)+.01*(P[i][c]-v));
   if(G.sample(F,...p)<+r+.12)p=G.proietta(q=>G.sample(F,...q),p,+r+.12,20);
   out[i]=p;
  }
 }
 return 'tube('+JSON.stringify(out.map(p=>p.map(v=>+v.toFixed(4))))+','+r;
});
G.M.html=G.M.html.slice(0,cur.a)+text+G.M.html.slice(cur.b);
G.saveFile(G.buf0);
const canali=[
 {m:'bicbrev',fine:[{tubi:['agen'],y:[1,7],osso:'femore'}]},
 {m:'gmed',fine:[{tubi:['agen'],y:[-5,7],osso:'tibia'}]},
 {m:'glat',fine:[{tubi:['agen'],y:[1,7],osso:'femore'}]},
 {m:'tibant',fine:[{tubi:['aric'],y:[-10.5,-3]}]},
 {m:'extdig',fine:[{tubi:['aric'],y:[-10.5,-3]}]},
];
execFileSync(process.execPath,[fileURLToPath(new URL('./percorsi-ginocchio.mjs',import.meta.url)),'--solo-canali'],{
 cwd:root,env:{...process.env,MODELLO:G.FILE,BASE_CANALI:BASE,CANALI:JSON.stringify(canali)},stdio:'inherit',
});

execFileSync(process.execPath,[fileURLToPath(import.meta.url),'--lamine'],{cwd:root,env:{...process.env,MODELLO:G.FILE},stdio:'inherit'});
