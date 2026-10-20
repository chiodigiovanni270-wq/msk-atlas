/* Anca destra: revisione delle nove strutture articolari (10 mesh).
   node strumenti/articolazione-anca.mjs [--verifica]
   MODELLO=/percorso/copia.html per lavorare su una copia. Node 22+, nessuna rete.
   Dopo bozza-anca.mjs; riparte solo da coxale e femore incorporati e non li modifica.
   Idempotente: ricostruisce tutte le superfici e aggiorna le schede da dati-anca.mjs.
   Coordinate cm, +X mediale, +Y superiore, +Z anteriore. Origine al centro della testa.
   Cartilagini aderenti mediante intersezione con i triangoli, nessuna sfera sostitutiva.
   Labbro a sezione triangolare sul bordo campionato; capsula asimmetrica sul collo;
   legamenti capsulari come rinforzi del mantello, legamento della testa a ventaglio.
   Reperi e spessori sono ricostruzioni didattiche, non segmentazioni individuali.
   Fonti e limiti in GUIDA_MODELLI.md. --verifica controlla il file senza scrivere.
*/
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {STR} from './dati-anca.mjs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)),'../modelli/anca-3d.html');
const G=await import('./lib-modello.mjs');
const B=await import('./lib-bp3d.mjs');
const {REAL,setMesh,repack,saveFile,M,log,sstep,clamp}=G;
const add=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]), sub=(a,b)=>add(a,b,-1), mul=(a,k)=>a.map(v=>v*k), dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), len=a=>Math.hypot(...a), unit=a=>mul(a,1/(len(a)||1)), mix=(a,b,t)=>add(mul(a,1-t),b,t), cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], point=(m,i)=>Array.from(m.pos.subarray(i*3,i*3+3));
const N=unit([-.88,-.38,.29]),U=unit(sub([0,1,0],mul(N,N[1]))),V=cross(N,U),NECK=unit([-3,-2.6,-.7]);
const NU=unit(sub([0,1,0],mul(NECK,NECK[1]))),NV=cross(NECK,NU);
const rad=p=>add(mul(U,Math.cos(p)),V,Math.sin(p)), dir=(t,p)=>add(mul(N,Math.cos(t)),rad(p),Math.sin(t));
const CFG={rimRadius:2.80, notch:.62, rimSamples:128, femThickness:.08, acetThickness:.08, capsuleThickness:.08, labBase:.30, labHeight:.32};
const fem=REAL('femore'),cox=REAL('coxale');
// Möller–Trumbore, geometria preparata una sola volta. Restituisce Infinity senza intersezione.
function rays(m){const A=[];for(let t=0;t<m.idx.length;t+=3){const a=point(m,m.idx[t]),b=sub(point(m,m.idx[t+1]),a),c=sub(point(m,m.idx[t+2]),a);A.push(...a,...b,...c);}const T=Float64Array.from(A);return (d,o=[0,0,0])=>{let best=Infinity;for(let i=0;i<T.length;i+=9){const hx=d[1]*T[i+8]-d[2]*T[i+7],hy=d[2]*T[i+6]-d[0]*T[i+8],hz=d[0]*T[i+7]-d[1]*T[i+6],det=T[i+3]*hx+T[i+4]*hy+T[i+5]*hz;if(Math.abs(det)<1e-10)continue;const sx=o[0]-T[i],sy=o[1]-T[i+1],sz=o[2]-T[i+2],u=(sx*hx+sy*hy+sz*hz)/det;if(u< -1e-7||u>1+1e-7)continue;const qx=sy*T[i+5]-sz*T[i+4],qy=sz*T[i+3]-sx*T[i+5],qz=sx*T[i+4]-sy*T[i+3],v=(d[0]*qx+d[1]*qy+d[2]*qz)/det;if(v< -1e-7||u+v>1+1e-7)continue;const r=(T[i+6]*qx+T[i+7]*qy+T[i+8]*qz)/det;if(r>1e-6&&r<best)best=r;}return best;};}
const rf=rays(fem),rc=rays(cox);
let fovea=[1.78,.41,-.37],min=Infinity;
for(let i=0;i<fem.nv;i++){const p=point(fem,i),r=len(p);if(p[0]>.8&&p[1]>-.7&&p[1]<1.1&&p[2]<.2&&r<min){min=r;fovea=p;}}
const FOV=unit(fovea);log('fovea ossea (cm)',fovea.map(v=>v.toFixed(3)).join(','));
function orient(m){let vol=0;for(let t=0;t<m.idx.length;t+=3)vol+=dot(point(m,m.idx[t]),cross(point(m,m.idx[t+1]),point(m,m.idx[t+2])))/6;if(vol<0)for(let t=0;t<m.idx.length;t+=3)[m.idx[t+1],m.idx[t+2]]=[m.idx[t+2],m.idx[t+1]];return m;}
// Guscio di una superficie con bordo: vertici condivisi sulle cuciture periodiche.
function shell(base,offset){const n=base.pos.length/3,P=[],I=[];for(let side=0;side<2;side++)for(let i=0;i<n;i++)P.push(...offset(point(base,i),i,side));const ed=new Map();for(let t=0;t<base.idx.length;t+=3){const a=base.idx[t],b=base.idx[t+1],c=base.idx[t+2];I.push(a,b,c,a+n,c+n,b+n);for(const [u,v]of[[a,b],[b,c],[c,a]])ed.set(u+','+v,[u,v]);}for(const [u,v]of ed.values())if(!ed.has(v+','+u))I.push(u,u+n,v,v,u+n,v+n);return orient({pos:Float64Array.from(P),idx:Uint32Array.from(I),extNv:n});}
function patch(nu,nv,fn,periodic=false){const P=[],I=[],cols=periodic?nv:nv+1;for(let i=0;i<=nu;i++)for(let j=0;j<cols;j++)P.push(...fn(i/nu,j/nv));for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const a=i*cols+j,b=(i+1)*cols+j,c=(i+1)*cols+(j+1)%cols,d=i*cols+(j+1)%cols;I.push(a,b,c,a,c,d);}return {pos:Float64Array.from(P),idx:Uint32Array.from(I)};}
const made={};
function put(n,m){made[n]=m;setMesh(n,m);if(m.extNv!==undefined)G.man.meshes.find(e=>e.n===n).extNv=m.extNv;}
if(!process.argv.includes('--verifica')){
// Femore: territorio sulla mesh ossea suddivisa, con fovea esclusa e collo libero.
const fs=B.suddividi(fem.pos,fem.idx),nb=B.vicini(fs.pos.length/3,fs.idx);
let field=Float64Array.from({length:fs.pos.length/3},(_,i)=>{const p=point(fs,i),r=len(p),d=unit(p);return Math.min((Math.acos(clamp(dot(d,NECK),-1,1))-1.12)*2.3,(Math.acos(clamp(dot(d,FOV),-1,1))-.28)*2.3,(2.48-r)*2);});
field=B.diffondi(field,nb,5);const fc=B.ritagliaCampo(fs.pos,fs.idx,field);
put('cart_testa',shell(fc,(p,i,side)=>{const d=unit(p),r=rf(d);if(!Number.isFinite(r))throw Error('Cartilagine femorale senza osso');const gap=rc(d)-r,th=Math.max(.008,Math.min(CFG.femThickness,gap*.30))*sstep(0,.15,fc.s[i]);return mul(d,r+(side?-.025:.015+th));}));
// Acetabolo: primo incontro con la cavità a r <= rimRadius, quindi nessun fallback sferico.
const rimAngles=[];for(let i=0;i<=CFG.rimSamples;i++){const p=-Math.PI+CFG.notch+i/CFG.rimSamples*(2*Math.PI-2*CFG.notch);let t=.8;while(t<2.6&&rc(dir(t,p))>CFG.rimRadius)t+=.015;if(t>=2.6)throw Error('Bordo acetabolare non trovato');rimAngles.push(t+.035);}
// Levigatura del parametro; successiva correzione verso l'interno se il raggio manca.
for(let k=0;k<5;k++){const a=rimAngles.slice();for(let i=1;i<a.length-1;i++)rimAngles[i]=(a[i-1]+2*a[i]+a[i+1])/4;}
const rimTheta=p=>{const x=clamp((p+Math.PI-CFG.notch)/(2*Math.PI-2*CFG.notch),0,1)*CFG.rimSamples,i=Math.min(CFG.rimSamples-1,Math.floor(x));let t=rimAngles[i]+(rimAngles[i+1]-rimAngles[i])*(x-i);while(rc(dir(t,p))>CFG.rimRadius)t+=.005;return t;};
const rimAt=p=>{const d=dir(rimTheta(p),p);return mul(d,rc(d));};
const left=rimAt(-Math.PI+CFG.notch),right=rimAt(Math.PI-CFG.notch);
const rimFull=p=>{p=Math.atan2(Math.sin(p),Math.cos(p));if(Math.abs(p)<=Math.PI-CFG.notch)return rimAt(p);const x=p<0?p+2*Math.PI:p;return mix(right,left,(x-(Math.PI-CFG.notch))/(2*CFG.notch));};
const ac=patch(24,128,(a,b)=>{const p=-Math.PI+CFG.notch+b*(2*Math.PI-2*CFG.notch),t0=rimTheta(p)+.015,t1=Math.max(t0+.12,2.57-.18*(1-Math.cos(p))/2),d=dir(t0+(t1-t0)*a,p),r=rc(d);if(!Number.isFinite(r)||r>3.2)throw Error('Cartilagine acetabolare senza supporto');return mul(d,r);});
put('cart_acet',shell(ac,(p,i,side)=>{const d=unit(p),r=rc(d),gap=r-rf(d),a=Math.floor(i/129)/24,b=(i%129)/128,edge=Math.min(a,1-a,b,1-b),th=Math.max(.006,Math.min(CFG.acetThickness,gap*.30))*sstep(0,.06,edge);return mul(d,r+(side?.025:-.015-th));}));
// Labbro: sezione piena triangolare smussata, aperta solo all'incisura e chiusa dal trasverso.
const lp=[],li=[],NS=128,sec=[[0,0],[.08,.20],[.03,.32],[-.10,.20],[-.30,0]];
for(let i=0;i<=NS;i++){const p=-Math.PI+CFG.notch+i/NS*(2*Math.PI-2*CFG.notch),q=rimAt(p),d=unit(q),tangent=unit(sub(mul(N,len(q)),mul(d,dot(N,d)*len(q))));for(const [out,up]of sec)lp.push(...add(add(q,d,out),tangent,up));}
for(let i=0;i<NS;i++)for(let j=0;j<5;j++){const a=i*5+j,b=i*5+(j+1)%5,c=a+5,d=b+5;li.push(a,b,c,b,d,c);}for(let j=1;j<4;j++){li.push(0,j+1,j,NS*5,NS*5+j,NS*5+j+1);}put('labbro',orient({pos:Float64Array.from(lp),idx:Uint32Array.from(li)}));
// Capsula: inserzione anteriore distale, posteriore più prossimale sul collo.
function cuff(t,p){const start=add(rimFull(p),N,.13),d=add(mul(NU,Math.cos(p)),NV,Math.sin(p)),dist=3.5+.9*clamp(d[2],-1,1),center=mul(NECK,dist),r=rf(d,center);if(!Number.isFinite(r)||r>4)throw Error('Inserzione capsulare non trovata');const end=add(center,d,r+.025),c=mul(center,t),q=mix(start,end,t),v=unit(sub(q,c)),bone=rf(v,c),radius=Math.max(len(sub(q,c))+.12*Math.sin(Math.PI*t),Number.isFinite(bone)?bone+.12*Math.sin(Math.PI*t):0);return add(c,v,radius);}
// Regenerate with angular coordinate, preserving shared periodic seam.
const capBase=patch(36,128,(t,b)=>cuff(t,b*2*Math.PI),true);
put('capsula',shell(capBase,(p,i,side)=>{const t=Math.floor(i/128)/36,phi=(i%128)/128*2*Math.PI,d=unit(sub(p,mul(NECK,(3.5+.9*clamp(add(mul(NU,Math.cos(phi)),NV,Math.sin(phi))[2],-1,1))*t)));return add(p,d,side?0:CFG.capsuleThickness);}));
function band(n,p0,p1,w){const base=patch(32,10,(t,b)=>{const p=p0+(p1-p0)*sstep(0,1,t)+(b-.5)*w*(.65+.35*Math.sin(Math.PI*t));return cuff(t,p);});put(n,shell(base,(p,i,side)=>{const t=Math.floor(i/11)/32,b=(i%11)/10,phi=p0+(p1-p0)*sstep(0,1,t)+(b-.5)*w*(.65+.35*Math.sin(Math.PI*t)),d=add(mul(NU,Math.cos(phi)),NV,Math.sin(phi));return add(p,d,CFG.capsuleThickness+(side?.003:.02+.10*Math.sin(Math.PI*b)*Math.sin(Math.PI*t)));}));}
band('iliofemorale_a',-.80,-.22,.36);band('iliofemorale_b',-.80,-2.05,.38);band('pubofemorale',-2.25,-2.55,.42);band('ischiofemorale',1.85,.35,.46);
// Trasverso: ponte fra le estremità reali del labbro. Legamento della testa: ventaglio alla fovea.
function ribbon(n,fn,normal,th){const base=patch(32,12,fn);put(n,shell(base,(p,i,side)=>add(p,normal(p),side?-th/2:th/2)));}
ribbon('trasverso',(t,b)=>{const p=add(mix(left,right,t),N,(b-.5)*.30),d=unit(p);return mul(d,Math.max(len(p),rf(d)+.10));},p=>unit(p),.09);
ribbon('rotondo',(t,b)=>{const start=mix(left,right,.15+.70*b),end=add(fovea,unit(cross(FOV,[0,1,0])),(b-.5)*.23),p=mix(start,end,t),d=unit(p),r=rf(d),lift=Math.max(len(p),r+.055*sstep(0,.15,1-t));return mul(d,lift);},p=>unit(p),.055);
// Distanza dalle ossa: correzione comune ai due strati, preserva lo spessore.
// Griglia 0,6 mm con distanza esatta presso la superficie (lib-modello).
G.griglia([-7,-7,-5],[4,5,5],.06,0);
const boneFields=['femore','coxale'].map(n=>G.campo([n]).F);
for(const [name,m]of Object.entries(made))if(!name.startsWith('cart_')){
 const paired=name!=='labbro',count=paired?m.pos.length/6:m.pos.length/3;
 for(let i=0;i<count;i++)for(let it=0;it<10;it++)for(const F of boneFields){
  const ids=paired?[i,i+count]:[i];let worst=Infinity,q;
  for(const id of ids){const p=point(m,id),d=G.sample(F,...p);if(d<worst){worst=d;q=p;}}
  if(worst>=.025)continue;const g=unit(G.grad(F,q)),shift=mul(g,Math.min(.15,.025-worst));
  for(const id of ids)m.pos.set(add(point(m,id),shift),id*3);
 }
}
// Saldatura sulla griglia UInt16 del file: evita micro-triangoli che collassano
// soltanto dopo la compressione delle coordinate. Le ossa originali restano intatte.
for(const [name,m]of Object.entries(made)){
 const map=new Map(),remap=[],P=[],I=[];
 for(let i=0;i<m.pos.length/3;i++){const q=point(m,i).map((v,k)=>Math.round((v-G.man.min[k])/(G.man.max[k]-G.man.min[k])*65535)),key=q.join(',');
  if(!map.has(key)){map.set(key,P.length/3);P.push(...q.map((v,k)=>G.man.min[k]+v/65535*(G.man.max[k]-G.man.min[k])));}remap[i]=map.get(key);
 }
 for(let t=0;t<m.idx.length;t+=3){const [a,b,c]=Array.from(m.idx.subarray(t,t+3),i=>remap[i]);if(a!==b&&b!==c&&c!==a)I.push(a,b,c);}
 put(name,{pos:Float64Array.from(P),idx:Uint32Array.from(I),...(m.extNv!==undefined?{extNv:new Set(remap.slice(0,m.extNv)).size}:{})});
}
// Catalogue master (only text changes, all viewer controls and materials are retained).
for(const s of STR){const re=new RegExp('\\{"id":"'+s.id+'"[^\\n]*?,b:');const row=JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k])=>['id','cat','name','info','o','ins','fn'].includes(k)))).slice(0,-1)+',b:';M.html=M.html.replace(re,row);}
M.html=M.html.replace('<b>Prima versione · in revisione anatomica.</b> Materiale didattico.','<b>Materiale didattico.</b>');
M.html=M.html.replace(/<meta name="strutture-modellate"[^>]*>/,'<meta name="strutture-modellate" content="Cartilagini aderenti alle ossa con fovea e fossa acetabolare libere; labbro a sezione triangolare; capsula e legamenti ricostruiti. Reperi e spessori didattici, non segmentati. Revisione anatomica specialistica ancora necessaria; fibre e transizioni tendinee indicative.">');
// Salvataggio dopo i controlli topologici.
}
// Topologia: ogni spigolo di un solido chiuso deve avere due facce con verso opposto.
let errors=0;
for(const n of ['cart_testa','cart_acet','labbro','capsula','iliofemorale_a','iliofemorale_b','pubofemorale','ischiofemorale','trasverso','rotondo']){const m=made[n]||REAL(n),edges=new Map();let deg=0;for(let t=0;t<m.idx.length;t+=3){const a=m.idx[t],b=m.idx[t+1],c=m.idx[t+2];if(len(cross(sub(point(m,b),point(m,a)),sub(point(m,c),point(m,a))))<1e-10)deg++;for(const [u,v]of[[a,b],[b,c],[c,a]]){const k=Math.min(u,v)+','+Math.max(u,v),e=edges.get(k)||[0,0];e[0]++;e[1]+=u<v?1:-1;edges.set(k,e);}}const bad=[...edges.values()].filter(([c,s])=>c!==2||s!==0).length;log(n,m.pos.length/3,'vertici',m.idx.length/3,'triangoli','spigoli non manifold',bad,'degeneri',deg);errors+=bad+deg;}
if(errors)throw Error('Topologia non valida: nessun file scritto');
if(!process.argv.includes('--verifica'))saveFile(repack());
