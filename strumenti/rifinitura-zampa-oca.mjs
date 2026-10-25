/* Rifinitura locale della zampa d'oca, senza rilanciare la catena del ginocchio.
   Uso: node strumenti/rifinitura-zampa-oca.mjs [--prova]
   MODELLO=/percorso/copia.html per una proposta separata.
   Riparte esclusivamente dalle tre mesh della revisione BASE: rilanciabile.
   Conserva topologia e tag muscolo/tendine. Raccorda il ramo infrarotuleo
   sopra il sartorio; tronco safeno, altre mesh, materiali e controlli fermi.
   Unità cm. Vedi GUIDA_MODELLI.md per limiti e verifica.
*/
import * as G from './lib-modello.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = '4df684bf8e94525e74e8a389ca96ec63569aacd7';
const REGOLE = [
  { nome: 'semit', rif: ['femore', 'tibia', 'capsula', 'lcm', 'bans', 'semim', 'gmed'], spessore: .22 },
  { nome: 'grac', rif: ['femore', 'tibia', 'capsula', 'lcm', 'bans', 'semit', 'semim'], spessore: .20 },
  { nome: 'sart', rif: ['femore', 'tibia', 'capsula', 'lcm', 'bans', 'semit', 'grac', 'retmed', 'vmed'], spessore: .16 },
];
G.griglia([-.5, -9, -5.5], [7, 5, 5], .04, .4);

// Normali d'area della superficie originale: distinguono faccia profonda,
// superficiale e margini anche dove la corticale curva verso la cresta tibiale.
function normali(p,idx){
 const out=new Float64Array(p.length);
 for(let t=0;t<idx.length;t+=3){const a=idx[t]*3,b=idx[t+1]*3,c=idx[t+2]*3;
 const u=[0,1,2].map(k=>p[b+k]-p[a+k]),v=[0,1,2].map(k=>p[c+k]-p[a+k]);
 const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 for(const i of [a,b,c])for(let k=0;k<3;k++)out[i+k]+=n[k];}
 for(let i=0;i<out.length;i+=3){const l=Math.hypot(...out.slice(i,i+3))||1;for(let k=0;k<3;k++)out[i+k]/=l;}
 return out;
}

for (const R of REGOLE) {
  const original = G.realDaRevisione(BASE,R.nome,'modelli/ginocchio-3d.html');
  const {idx}=original, p=original.pos.slice();
  // Regolarizza il bordo originale frastagliato soltanto in sede distale.
  const liscio=G.taubin(p,idx,20);
  for(let i=0;i<p.length;i+=3){const w=G.sstep(-3.5,-6.5,p[i+1]);for(let k=0;k<3;k++)p[i+k]+=(liscio[i+k]-p[i+k])*w;}
  const U=new Uint8Array(G.N);
  for(const n of R.rif)G.or(U,G.solid(n,['retmed','capsula'].includes(n)));
  const {Do}=G.sdf(U),F=G.chiuso(Do,.45); G.sfoca(F,2);
  const out=p.slice(),norm=normali(p,idx);let max=0;
  for(let i=0;i<p.length;i+=3){
    const x=p[i],y=p[i+1],z=p[i+2],w=G.sstep(3,-3,y);
    if(!w)continue;
    const grad=G.grad(F,[x,y,z]),len=Math.hypot(...grad)||1;
    const dot=grad.reduce((v,q,k)=>v+q*norm[i+k]/len,0);
    const f=G.sstep(-.6,.6,dot);
    const thin=G.sstep(-1,-5.5,y),cap=R.spessore*(1-thin)+.10*thin;
    const thickness=cap;
    // La distanza si annulla nell'impronta terminale, senza una punta
    // sospesa o un salto di parecchi millimetri dentro la corticale.
    const entesi=G.sstep(-6.3,-7.5,y);
    const level=.035*(1-entesi)-.025*entesi+f*thickness*(1-.8*entesi);
    const q=G.proietta(q=>G.sample(F,...q),[x,y,z],level,45);
    for(let k=0;k<3;k++)out[i+k]=p[i+k]+w*(q[k]-p[i+k]);
    max=Math.max(max,Math.hypot(...[0,1,2].map(k=>out[i+k]-p[i+k])));

  }
  const smooth=G.taubin(out,idx,40);
  for(let i=0;i<out.length;i+=3){const w=G.sstep(2,-3,p[i+1]);for(let k=0;k<3;k++)out[i+k]+=(smooth[i+k]-out[i+k])*w;}
  // Piccola componente originale: evita il collasso di lati cortissimi
  // quando la lamina terminale viene quantizzata a 16 bit.
  for(let i=0;i<out.length;i++)out[i]=.97*out[i]+.03*original.pos[i];
  G.setPos(R.nome,out);
  G.log(`${R.nome}: proiezione massima ${(max*10).toFixed(2)} mm prima della levigatura; ${original.pos.length/3} vertici conservati`);
}
// Il ramo infrarotuleo resta superficiale al sartorio. Il tronco safeno e
// l'origine del ramo sono fermi; si corregge solo il breve scavalcamento.
const baseline=execFileSync('git',['show',`${BASE}:modelli/ginocchio-3d.html`],{
  cwd:fileURLToPath(new URL('..',import.meta.url)),maxBuffer:32*1024*1024,
}).toString();
const tubo=h=>{
  const a=h.indexOf("{id:'ninfra'"),b=h.indexOf("\n {id:",a+1);
  const block=h.slice(a,b),match=block.match(/tube\((\[\[.*?\]\]),/);
  return {text:match[1],pts:JSON.parse(match[1])};
};
G.griglia([1.8,-3.5,-2],[5.8,-.6,3],.04,.3);
const nerveFloor=G.campo(['sart','grac','semit','femore','tibia']).F;
const old=tubo(baseline),points=old.pts.map(p=>p.slice());
const displacement=points.map(()=>[0,0,0]);
for(let i=1;i<9;i++){
  const p=points[i],d=G.sample(nerveFloor,...p);
  if(d<.15){const q=G.proietta(p=>G.sample(nerveFloor,...p),p,.15,30);
    displacement[i]=q.map((v,k)=>v-p[k]);}
}
for(let it=0;it<12;it++){
  const copy=displacement.map(p=>p.slice());
  for(let i=1;i<10;i++)for(let k=0;k<3;k++)
    displacement[i][k]=.5*copy[i][k]+.25*(copy[i-1][k]+copy[i+1][k]);
}
for(let i=1;i<10;i++){
  let p=points[i].map((v,k)=>v+displacement[i][k]);
  if(G.sample(nerveFloor,...p)<.14)p=G.proietta(q=>G.sample(nerveFloor,...q),p,.14,30);
  points[i]=p.map(v=>+v.toFixed(4));
}
const current=tubo(G.M.html);
G.M.html=G.M.html.replace(current.text,JSON.stringify(points));
G.log('Ramo infrarotuleo: raccordo superficiale; origine, tronco safeno e tratto finale conservati');
if(!process.argv.includes('--prova'))G.saveFile(G.repack());
