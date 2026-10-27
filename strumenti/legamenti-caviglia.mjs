/* Rifinitura ripetibile dei soli legamenti, base 35719a0.
   node strumenti/legamenti-caviglia.mjs; MODELLO per una copia.
   Eseguire dopo caviglia-3d.mjs. Conserva le altre mesh e la pagina corrente. */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {surface,point,add,sub,mix,unit,shell,patch} from './lib-caviglia.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.MODELLO||resolve(root,'modelli/caviglia-3d.html');
// Legge la base una sola volta, anche nei sandbox che restituiscono EPERM
// dopo avere completato correttamente il processo git.
let reference;try{reference=execFileSync('git',['show','35719a0:modelli/caviglia-3d.html'],{cwd:root,maxBuffer:32e6});}catch(e){if(e.status===0&&e.stdout?.length)reference=e.stdout;else throw e;}
const dir=mkdtempSync(resolve(tmpdir(),'ankle-ligaments-')),base=resolve(dir,'base.html');
writeFileSync(base,readFileSync(out));process.env.MODELLO=base;
const G=await import('./lib-modello.mjs');
const original=JSON.parse(reference.toString().match(/<script id="bpman" type="application\/json">(.*?)<\/script>/s)[1]);
// Geometrie di riferimento decodificate attraverso il formato della pagina.
import {gunzipSync} from 'node:zlib';
let data=Buffer.from(reference.toString().match(/<script id="bpdat" type="text\/plain">(.*?)<\/script>/s)[1].trim(),'base64');if(data[0]===31&&data[1]===139)data=gunzipSync(data);
function baseline(id){const m=original.meshes.find(x=>x.n===id),P=new Float32Array(m.nv*3);for(let i=0;i<P.length;i++){const k=i%3;P[i]=original.min[k]+data.readUInt16LE(m.p+i*2)/65535*(original.max[k]-original.min[k]);}const idx=Uint32Array.from({length:m.ni},(_,i)=>m.i16?data.readUInt16LE(m.i+i*2):data.readUInt32LE(m.i+i*4));return {pos:P,idx,nv:m.nv};}
const boneIds=['tibia','fibula','talo','calcagno','navicolare','cuboide',...Array.from({length:3},(_,i)=>'cuneiforme'+(i+1)),...Array.from({length:5},(_,i)=>'metatarso'+(i+1))];
const obstacles=boneIds.map(n=>({n,s:surface(G.REAL(n))}));
const near=(s,p,r)=>p.every((v,k)=>v>s.root.lo[k]-r&&v<s.root.hi[k]+r);
// Nastri: levigatura longitudinale senza restringere la larghezza o staccare
// le impronte. Le fibre vengono ricalcolate sulla geometria finale.
const guides=readFileSync(resolve(root,'strumenti/articolazione-caviglia.mjs'),'utf8');
const ids=[...guides.matchAll(/^ \['([^']+)'/gm)].map(m=>m[1]);
for(const id of ids){if(!G.man.meshes.some(m=>m.n===id))continue;const m=baseline(id),half=m.nv/2,rows=half/11;if(!Number.isInteger(rows))continue;const P=Float32Array.from(m.pos);for(let pass=0;pass<8;pass++){const prev=P.slice();for(let s=0;s<2;s++)for(let i=1;i<rows-1;i++)for(let j=0;j<11;j++){const v=s*half+i*11+j,p=mix(point({pos:prev},v),mix(point({pos:prev},v-11),point({pos:prev},v+11),.5),.35);for(const {n,s:S}of obstacles){if(!boneIds.includes(n)||!near(S,p,.1))continue;const q=S.nearest(p);if(q.signed<.015)p.splice(0,3,...add(q.p,q.n,.015));}P.set(p,v*3);}}
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

G.saveFile(G.repack());writeFileSync(out,readFileSync(base));rmSync(dir,{recursive:true});
