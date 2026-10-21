/* Rigenera assets/strutture.json dai nomi/ID delle tavole della home.
   Uso: node strumenti/indice-ricerca.mjs. Rilanciabile; nessuna mesh modificata. */
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
const home=readFileSync('index.html','utf8'), records=[];
const literal=`(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
const prop=k=>`["']?${k}["']?\\s*:\\s*(${literal})`;
const row=new RegExp(`\\{\\s*${prop('id')}\\s*,\\s*(?:nw\\s*:\\s*1\\s*,\\s*)?${prop('cat')}\\s*,\\s*${prop('name')}`,'g');
const decode=s=>vm.runInNewContext(s,Object.create(null),{timeout:1000});
for(const card of home.matchAll(/<li class="card" data-strutture="(\d+)">([\s\S]*?)<\/li>/g)){
 const [,count,body]=card, [,path,label]=body.match(/class="card-link" href="([^"]+)">([^<]+)/);
 const source=readFileSync(path,'utf8'); let total=0;
 const sections=[...source.matchAll(/(?:const )?CATS\s*=\s*(\[[\s\S]*?\]);/g)];
 for(let i=0;i<sections.length;i++){
  const block=source.slice(sections[i].index,sections[i+1]?.index??source.length);
  const categories=decode('('+sections[i][1]+')');
  for(const match of block.matchAll(row)){
   const [id,cat,name]=match.slice(1).map(decode), section=sections.length>1?(i?'dito':'polso'):'';
   const category=categories.find(c=>c.id===cat)?.name;
   if(!category)throw Error(`Categoria mancante: ${path} ${id}`);
   records.push({id,name,category,model:section?(i?'Dito':'Polso'):label,path,section});total++;
  }
 }
 if(total!==Number(count))throw Error(`${path}: ${total} strutture, attese ${count}`);
}
if(new Set(records.map(r=>`${r.path}#${r.section}:${r.id}`)).size!==records.length)throw Error('ID duplicati');
writeFileSync('assets/strutture.json',JSON.stringify(records)+'\n');
console.log(`${records.length} strutture indicizzate`);
