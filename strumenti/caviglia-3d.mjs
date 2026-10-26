/* Generatore ripetibile: node strumenti/caviglia-3d.mjs [--ossa]
   Input: STL BodyParts3D in BP3D_DIR (/tmp/bp3d-stl), scaricati se assenti.
   Template: spalla-3d.html, mai modificato. Output: MODELLO o caviglia-3d.html.
   Ordine: ossa → cartilagini/legamenti → tendini/muscoli → vasi/nervi/borse.
   --ossa produce solo la base per la revisione geometrica. Non pubblica.
   Ricostruzioni non segmentate e limiti sono dichiarati nel pannello informazioni. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scarica,leggiSTL,ritaglia,riduci,compatta,impacchetta,sstep} from './lib-bp3d.mjs';
import {CATS,BONES,MUSCLES,ACHILLES} from './dati-caviglia.mjs';
import {articolazione} from './articolazione-caviglia.mjs';
import {tessuti} from './tessuti-caviglia.mjs';
import {rifinisciContatti} from './contatti-caviglia.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUT=process.env.MODELLO||resolve(ROOT,'modelli/caviglia-3d.html');
const O=[-80,-60,60], meshes=[], STR=[];
const onlyBones=process.argv.includes('--ossa');
function put(s,m){if(!m.idx.length)return;meshes.push({n:s.id,...m});STR.push(s);}
function load(s){const g=leggiSTL(scarica(s.fma));let pos=Float64Array.from(g.pos,(v,i)=>i%3===0?(v-O[0])/10:i%3===1?(g.pos[i+1]-O[2])/10:-(g.pos[i-1]-O[1])/10);
 let m=ritaglia(pos,g.idx,[0,-1,0],-14);m=ritaglia(m.pos,m.idx,[0,0,-1],-8);
 const fixed=Uint8Array.from({length:m.pos.length/3},(_,i)=>Math.abs(m.pos[i*3+1]-14)<.01||Math.abs(m.pos[i*3+2]-8)<.01?1:0);
 if(m.idx.length/3>14000){m=riduci(m.pos,m.idx,14000,fixed);m=compatta(m.pos,m.idx);}return m;}
for(const s of BONES){const m=load(s);m.tag=Uint8Array.from({length:m.pos.length/3},(_,i)=>Math.abs(m.pos[i*3+1]-14)<.01||Math.abs(m.pos[i*3+2]-8)<.01?80:0);put(s,m);console.log(s.id,m.pos.length/3);}
if(!onlyBones){
 const hash=createHash('sha256').update(readFileSync(resolve(ROOT,'strumenti/articolazione-caviglia.mjs'))).update(readFileSync(resolve(ROOT,'strumenti/lib-caviglia.mjs'))).update(JSON.stringify(meshes)).digest('hex').slice(0,16),cache='/tmp/msk-caviglia-articolazione-'+hash+'.json';
 if(existsSync(cache)){for(const {s,m}of JSON.parse(readFileSync(cache,'utf8')))put(s,{pos:Float64Array.from(m.pos),idx:Uint32Array.from(m.idx),...(m.fdir?{fdir:Int8Array.from(m.fdir)}:{})});console.log('Strato articolare: cache identica agli input');}
 else{const made=[];articolazione(meshes,(s,m)=>{put(s,m);made.push({s,m:{pos:Array.from(m.pos),idx:Array.from(m.idx),...(m.fdir?{fdir:Array.from(m.fdir)}:{})}});});writeFileSync(cache,JSON.stringify(made));}
 for(const s of MUSCLES){console.log('Muscolo',s.id);const m=load(s),nv=m.pos.length/3;
  // Il capo laterale del gastrocnemio è fuori campo: non etichettare come
  // muscolo una scheggia della sezione prossimale di meno di un millimetro.
  const ys=Array.from({length:nv},(_,i)=>m.pos[i*3+1]);if(s.id==='gl'&&Math.max(...ys)-Math.min(...ys)<.1)continue;
  m.tag=new Uint8Array(nv);m.fdir=new Int8Array(nv*3);
  for(let i=0;i<nv;i++){const y=m.pos[i*3+1];m.tag[i]=Math.abs(y-14)<.01?250:s.cut===null?0:Math.round(200*(1-sstep(s.cut-.3,s.cut+2,y)));m.fdir[i*3+1]=127;}
  if(s.cut!==null&&!['soleo','gm','gl','plantare'].includes(s.id)){
   const top=ritaglia(m.pos,m.idx,[0,1,0],s.cut),bottom=ritaglia(m.pos,m.idx,[0,-1,0],-s.cut);
   for(const [part,ten]of [[top,false],[bottom,true]]){part.tag=Uint8Array.from({length:part.pos.length/3},(_,i)=>ten?200:Math.abs(part.pos[i*3+1]-14)<.01?250:Math.round(200*(1-sstep(s.cut,s.cut+2,part.pos[i*3+1]))));part.fdir=Int8Array.from({length:part.pos.length},(_,i)=>i%3===1?127:0);put(ten?{...s,id:'t_'+s.id,cat:'ten',name:'Tendine – '+s.name,info:s.info+' Separazione muscolo-tendinea didattica sulla mesh BodyParts3D.'}:s,part);}
  }else if(m.idx.length>60)put(s.id==='plantare'?{...s,cat:'ten',name:'Tendine del plantare'}:s,m);
 }
 console.log('Achille');const ach=load(ACHILLES);ach.fdir=Int8Array.from({length:ach.pos.length},(_,i)=>i%3===1?127:0);put(ACHILLES,ach);
 tessuti(meshes,put);
 rifinisciContatti(meshes);
}
const {man,dat}=impacchetta(meshes);
let h=readFileSync(resolve(ROOT,'modelli/spalla-3d.html'),'utf8');
const change=(re,v)=>{if(!re.test(h))throw Error('Template incompatibile: '+re);h=h.replace(re,()=>v);};
h=h.replaceAll('spalla-3d','caviglia-3d').replaceAll('Spalla destra','Caviglia destra').replaceAll('Modello 3D della spalla','Modello 3D della caviglia');
change(/<title>.*?<\/title>/,'<title>Caviglia 3D interattiva: ossa e legamenti | MSK Atlas</title>');
change(/<meta name="strutture-bp3d"[^>]*>/,'<meta name="strutture-bp3d" content="Ossa della gamba distale, tarso, basi metatarsali e muscoli: BodyParts3D 3.0, ritagliati e semplificati. Modifiche distribuite con CC BY-SA 2.1 JP.">');
change(/<meta name="strutture-modellate"[^>]*>/,'<meta name="strutture-modellate" content="Superfici articolari, legamenti, retinacoli, guaine, borse, tessuto adiposo e decorsi vascolo-nervosi: ricostruzioni didattiche. Impronte, spessori e calibri non sono segmentazioni individuali.">');
h=h.replace(/<meta name="strutture-escluse"[^>]*>\s*/g,'');
change(/<meta name="description"[^>]*>/,'<meta name="strutture-escluse" content="Dita e avampiede distale, origini muscolari prossimali, cute, microcircolo e ramificazioni terminali; varianti anatomiche. Campo dalla gamba distale alle diafisi metatarsali. Revisione specialistica delle ricostruzioni necessaria.">\n<meta name="description" content="Esplora la caviglia destra in 3D: ossa, cartilagini, legamenti, tendini, muscoli, vasi, nervi e borse con strutture selezionabili.">');
h=h.replace(/(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*/g,'$1Caviglia 3D interattiva | MSK Atlas').replace(/(<meta (?:property|name)="(?:og:description|twitter:description)" content=")[^"]*/g,'$1Caviglia destra: anatomia tridimensionale per strati.').replace(/(<meta property="og:image:alt" content=")[^"]*/g,'$1Modello anatomico della caviglia destra');
change(/<script id="bpman" type="application\/json">.*?<\/script>/s,`<script id="bpman" type="application/json">${JSON.stringify(man)}</script>`);
change(/<script id="bpdat" type="text\/plain">.*?<\/script>/s,`<script id="bpdat" type="text/plain">${dat}</script>`);
const rows=STR.map(s=>JSON.stringify(Object.fromEntries(['id','cat','name','info','o','ins','fn'].filter(k=>s[k]).map(k=>[k,s[k]]))).slice(0,-1)+`,b:()=>[REAL('${s.id}')]}`).join(',\n');
change(/\/\* ============ Categorie ============ \*\/[\s\S]*?(?=const catById=)/,`/* ============ Categorie ============ */\nconst MUSC=new Set(['cin','cuf','tor','brac']);\nconst LACERTO_FADE=.93,LACERTO_LUCE=1.12;\nconst THMAP={tibia:.25,fibula:.15};\nconst CATS=${JSON.stringify(CATS.filter(c=>STR.some(s=>s.cat===c.id)))};\nconst S=[\n${rows}\n];\n`);
change(/const MCOL=\{[^\n]*\};/,'const MCOL={};');
change(/const REALFIB=new Set\(\[[^\]]*\]\);/,'const REALFIB=new Set('+JSON.stringify(STR.filter(s=>['leg','ten','ret','tfl'].includes(s.cat)).map(s=>s.id))+');');
change(/const HIDDEN_CATS=new Set\(\[[^\]]*\]\);/,"const HIDDEN_CATS=new Set(['cute','caps','bor','set','gua','adi','tfl']);");
h=h.replace('new ResizeObserver(fit).observe(chipsEl);','new ResizeObserver(()=>requestAnimationFrame(fit)).observe(chipsEl);');
change(/const CTR=V\(7,0,0\);const cam=\{theta:0.35,phi:0.12,r:70,target:CTR.clone\(\)\};/,'const CTR=V(0,3.4,.6);const cam={theta:-.65,phi:.20,r:52,target:CTR.clone()};');
change(/cam.baseR=\(w<h\?100:70\)/,'cam.baseR=(w<h?68:52)');
writeFileSync(OUT,h);console.log('Scritto',OUT,STR.length,'strutture');
