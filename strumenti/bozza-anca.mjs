/* Anca destra — prima versione, generatore ripetibile.
   node strumenti/bozza-anca.mjs [--prova=/percorso/anca.html]
   Node 22+, curl. STL in BP3D_DIR o /tmp/bp3d-stl (lib-bp3d.mjs).
   Riusa il visualizzatore della spalla, senza modificarla. Riscrive SOLO l'anca.
   Origine: fit sferico della testa femorale BP3D, mm (-81.75,-93.03,820).
   Coordinate in cm: X=x, Y=z, Z=-y. Campo verticale -16..16 cm.
   Le superfici articolari e i legamenti sono ricostruzioni indicative:
   revisione anatomica necessaria prima di pubblicare. Nessun deploy automatico.
*/
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scarica,leggiSTL,ritaglia,riduci,compatta,impacchetta,sstep} from './lib-bp3d.mjs';
import {CATS,STR} from './dati-anca.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUT=(process.argv.find(a=>a.startsWith('--prova='))||'').slice(8)||resolve(ROOT,'modelli/anca-3d.html');
const O=[-81.75,-93.03,820], MUSC=['cin','cuf','tor','brac'];
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,t)=>a.map(x=>x*t),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),len=a=>Math.hypot(...a),unit=a=>mul(a,1/(len(a)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],mix=(a,b,t)=>add(mul(a,1-t),mul(b,t));
const meshes=[],raw={};
function smooth(pos,idx,passes=4){
 const adj=Array.from({length:pos.length/3},()=>new Set());for(let t=0;t<idx.length;t+=3){const [a,b,c]=idx.subarray(t,t+3);adj[a].add(b).add(c);adj[b].add(a).add(c);adj[c].add(a).add(b);}
 for(let p=0;p<passes;p++)for(const k of [.35,-.36]){const q=pos.slice();for(let i=0;i<adj.length;i++){const ns=adj[i];if(!ns.size)continue;for(let d=0;d<3;d++){let a=0;for(const j of ns)a+=pos[j*3+d];q[i*3+d]+=k*(a/ns.size-pos[i*3+d]);}}pos=q;}return pos;
}
for(const s of STR.filter(s=>s.fma)){
 let g=leggiSTL(scarica(s.fma));let pos=Float64Array.from(g.pos,(v,i)=>i%3===0?(v-O[0])/10:i%3===1?(g.pos[i+1]-O[2])/10:-(g.pos[i-1]-O[1])/10),idx=g.idx;
 // Ritaglio superiore prima di quello inferiore. Nessun muscolo è stirato per adattarlo.
 pos=smooth(pos,idx,s.cat==='ossa'?2:5);
 let a=ritaglia(pos,idx,[0,-1,0],-16),b=ritaglia(a.pos,a.idx,[0,1,0],-16);
 pos=b.pos;idx=b.idx;const fixed=Uint8Array.from({length:pos.length/3},(_,i)=>Math.abs(pos[3*i+1])>15.97?1:0);
 const budget=s.id==='tit'?18000:s.id==='coxale'?17000:s.cat==='ossa'?10000:10000;
 if(idx.length/3>budget){const d=riduci(pos,idx,budget,fixed);const q=compatta(d.pos,d.idx);pos=q.pos;idx=q.idx;}
 const nv=pos.length/3,out={n:s.id,pos,idx};
 if(s.cat==='ossa'){out.tag=new Uint8Array(nv);for(let i=0;i<nv;i++)if(Math.abs(pos[3*i+1])>15.99)out.tag[i]=80;}
 if(MUSC.includes(s.cat)){
  out.tag=new Uint8Array(nv);out.fdir=new Int8Array(nv*3);
  // Inserzione riportata sulla mesh reale: riferimento grafico, non impronta segmentata.
  let tip=s.tip,near=Infinity;for(let i=0;i<nv;i++){const p=Array.from(pos.subarray(3*i,3*i+3)),d=len(sub(p,s.tip));if(d<near){near=d;tip=p;}}
  for(let i=0;i<nv;i++){const p=Array.from(pos.subarray(3*i,3*i+3)),d=sub(tip,p),l=len(d);out.tag[i]=Math.abs(p[1])>15.98?250:Math.round(200*(1-sstep(.3,2.5,l)));const f=unit(d);for(let k=0;k<3;k++)out.fdir[3*i+k]=Math.round(f[k]*127);}
 }
 meshes.push(out);raw[s.id]=out;console.log(s.id,nv,'vertici',idx.length/3,'triangoli');
}
// Intersezione esatta raggio-triangolo per ricostruire superfici sulla mesh ossea.
function ray(mesh,d){let best=Infinity;const p=mesh.pos,I=mesh.idx;for(let t=0;t<I.length;t+=3){const a=Array.from(p.subarray(I[t]*3,I[t]*3+3)),b=Array.from(p.subarray(I[t+1]*3,I[t+1]*3+3)),c=Array.from(p.subarray(I[t+2]*3,I[t+2]*3+3)),e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-8)continue;const inv=1/det,s=mul(a,-1),u=dot(s,h)*inv;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(d,q)*inv;if(v<0||u+v>1)continue;const r=dot(e2,q)*inv;if(r>1.4&&r<3.5)best=Math.min(best,r);}return best;}
const N=unit([-.88,-.38,.29]),U=unit(sub([0,1,0],mul(N,N[1]))),V=cross(N,U);
const rad=p=>add(mul(U,Math.cos(p)),mul(V,Math.sin(p)));
const dir=(theta,phi)=>add(mul(N,Math.cos(theta)),mul(rad(phi),Math.sin(theta)));
// Mesh closed shell from a rectangular patch; boundary sidewalls preserve thickness.
function shell(n,nu,nv,fn,thick=.06){const P=[],I=[];for(let side=0;side<2;side++)for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++)P.push(...fn(i/nu,j/nv,side));const count=(nu+1)*(nv+1),at=(i,j)=>i*(nv+1)+j;
 for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){let a=at(i,j),b=at(i+1,j),c=at(i+1,j+1),d=at(i,j+1);I.push(a,b,c,a,c,d,a+count,c+count,b+count,a+count,d+count,c+count);}
 const edge=(a,b)=>I.push(a,a+count,b+count,a,b+count,b);
 for(let i=0;i<nu;i++){edge(at(i,0),at(i+1,0));edge(at(i+1,nv),at(i,nv));}for(let j=0;j<nv;j++){edge(at(0,j+1),at(0,j));edge(at(nu,j),at(nu,j+1));}
 const m={n,pos:Float64Array.from(P),idx:Uint32Array.from(I)};meshes.push(m);return m;
}
// Cartilagine: direzioni sferiche campionate sulla testa vera; margini indicativi, fovea non segmentata.
const femR=new Map(),coxR=new Map();const rr=(m,d,cache)=>{const k=d.map(x=>x.toFixed(5)).join(',');if(!cache.has(k))cache.set(k,ray(m,d));return cache.get(k);};
shell('cart_testa',28,80,(a,b,side)=>{const d=dir(.92+a*1.90,b*Math.PI*2);let r=rr(raw.femore,d,femR);if(!Number.isFinite(r))r=2.30;return mul(d,r+(side?-.02:.065));});
// Superficie semilunare: non riempie la fossa centrale né l'incisura inferiore.
shell('cart_acet',16,72,(a,b,side)=>{const phi=-Math.PI+.40+b*(2*Math.PI-.80),d=dir(1.32+a*.67,phi);let r=rr(raw.coxale,d,coxR);if(!Number.isFinite(r))r=2.48;return mul(d,r+(side?.015:-.06));});
// Raccordo acetabolare, adattato ai vertici ossei vicini alla posizione attesa.
function nearest(p){let best=Infinity,out=p;const A=raw.coxale.pos;for(let i=0;i<A.length;i+=3){const q=Array.from(A.subarray(i,i+3)),d=len(sub(p,q));if(d<best){best=d;out=q;}}return best<1?out:p;}
const rim=[];for(let i=0;i<=100;i++){const phi=-Math.PI+.40+i/100*(2*Math.PI-.80);rim.push(nearest(add(mul(N,.38),mul(rad(phi),2.43))));}
for(let k=0;k<8;k++){const a=rim.map(p=>p.slice());for(let i=1;i<rim.length-1;i++)rim[i]=mix(a[i],mix(a[i-1],a[i+1],.5),.4);}
function atR(t){const i=Math.min(99,Math.floor(t*100)),f=t*100-i;return mix(rim[i],rim[i+1],f);}
shell('labbro',100,12,(t,b,side)=>{const p=atR(t),radial=unit(sub(p,mul(N,dot(p,N)))),a=b*2*Math.PI;return add(p,add(mul(N,.16*Math.cos(a)),mul(radial,.13*Math.sin(a)+(side?-.015:0))));});
const neck=unit([-3,-2.6,-.7]),NC=[-3,-2.6,-.7],NU=unit(sub([0,1,0],mul(neck,neck[1]))),NV=cross(neck,NU);
function cuff(t,phi){const a=add(mul(N,.30),mul(rad(phi),2.62)),b=add(NC,add(mul(NU,1.48*Math.cos(phi)),mul(NV,1.43*Math.sin(phi))));return add(mix(a,b,t),mul(rad(phi),.24*Math.sin(Math.PI*t)));}
shell('capsula',24,80,(t,b,side)=>add(cuff(t,b*2*Math.PI),mul(rad(b*2*Math.PI),side?-.045:.045)));
// Nastri sul mantello capsulare: le inserzioni restano approssimazioni esplicite.
function band(n,p0,p1,width){return shell(n,28,8,(t,b,side)=>{const phi=p0+(p1-p0)*sstep(0,1,t)+(b-.5)*width*(.65+.35*Math.sin(Math.PI*t));return add(cuff(t,phi),mul(rad(phi),side?.065:.13));});}
band('iliofemorale_a',-.22,-.02,.36);band('iliofemorale_b',-.22,-1.45,.34);band('pubofemorale',-2.50,-1.72,.35);band('ischiofemorale',1.8,.85,.48);
// Piccole bande chiuse fra punti guida.
function strap(n,A,B,w){const d=unit(sub(B,A)),u=unit(cross(d,[0,1,0])),v=cross(d,u);return shell(n,24,8,(t,b,side)=>add(mix(A,B,t),add(mul(u,(b-.5)*w),mul(v,side?-.035:.035))));}
strap('trasverso',rim[0],rim[100],.26);
strap('rotondo',mix(rim[0],rim[100],.5),mul(dir(2.8,2.8),2.15),.24);
const {man,dat}=impacchetta(meshes);
let h=readFileSync(resolve(ROOT,'modelli/spalla-3d.html'),'utf8');
const change=(re,value,name)=>{if(!re.test(h))throw Error('Template incompatibile: '+name);h=h.replace(re,()=>value);};
change(/<title>.*?<\/title>/,'<title>Anca 3D | MSK Atlas</title>','title');
change(/<h1>Spalla destra<\/h1>/,'<h1>Anca destra</h1>','titolo');
h=h.replace('Modello 3D della spalla','Modello 3D dell’anca');
change(/<meta name="strutture-bp3d"[^>]*>/,'<meta name="strutture-bp3d" content="Osso coxale destro, femore prossimale destro, sacro, glutei, rotatori profondi, flessori, adduttori, ischiocrurali e tratto ileotibiale; geometrie ritagliate e levigate.">','crediti');
change(/<meta name="strutture-modellate"[^>]*>/,'<meta name="strutture-modellate" content="Prima versione da revisionare: cartilagini, labbro, capsula e legamenti sono ricostruzioni indicative; fibre e transizioni tendinee sono grafiche, non segmentazioni. La precisione delle impronte non è ancora validata.">\n<meta name="strutture-escluse" content="Vasi, nervi, borse, cute, varianti anatomiche e dettagli dei singoli tendini non sono inclusi in questa prima versione.">','ricostruzioni');
change(/<meta name="description"[^>]*>/,'<meta name="description" content="Anca destra 3D: prima versione didattica con ossa, muscoli e strutture articolari selezionabili. In revisione anatomica.">','descrizione');
change(/<script id="bpman" type="application\/json">.*?<\/script>/s,`<script id="bpman" type="application/json">${JSON.stringify(man)}</script>`,'manifest');
change(/<script id="bpdat" type="text\/plain">.*?<\/script>/s,`<script id="bpdat" type="text/plain">${dat}</script>`,'dati');
const fields=s=>JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k])=>['id','cat','name','info','o','ins','fn'].includes(k)))).slice(0,-1);
const rows=STR.map(s=>fields(s)+`,b:()=>[${(s.id==='iliofemorale'?['iliofemorale_a','iliofemorale_b']:[s.id]).map(n=>`REAL(${JSON.stringify(n)})`).join(',')}]}`).join(',\n');
change(/\/\* ============ Categorie ============ \*\/[\s\S]*?(?=const catById=)/,`/* ============ Categorie ============ */\nconst MUSC=new Set(${JSON.stringify(MUSC)});\nconst LACERTO_FADE=.93,LACERTO_LUCE=1.12;\nconst THMAP={femore:.3,coxale:.18,sacro:.2};\nconst CATS=${JSON.stringify(CATS)};\nconst S=[\n${rows}\n];\n`,'catalogo');
const cols=['#a8433a','#983a33','#a63f36','#9f3c34','#ad463c','#a0413a','#9c3a33','#a4403a'];
change(/const MCOL=\{[^\n]*\};/,'const MCOL='+JSON.stringify(Object.fromEntries(STR.filter(s=>MUSC.includes(s.cat)).map((s,i)=>[s.id,cols[i%cols.length]])))+';','colori');
change(/const CTR=V\(7,0,0\);const cam=\{theta:0.35,phi:0.12,r:70,target:CTR.clone\(\)\};/,'const CTR=V(1,0,0);const cam={theta:-.35,phi:.12,r:76,target:CTR.clone()};','camera');
change(/cam.baseR=\(w<h\?100:70\)/,'cam.baseR=(w<h?112:76)','camera mobile');
// Anteprima esplicitamente in revisione, anche se aperta fuori dal ramo di sviluppo.
change(/<b>Materiale didattico\.<\/b>/,'<b>Prima versione · in revisione anatomica.</b> Materiale didattico.','stato');
writeFileSync(OUT,h);console.log('Scritto',OUT,STR.length,'strutture',meshes.length,'mesh',Math.round(h.length/1024),'KB');
