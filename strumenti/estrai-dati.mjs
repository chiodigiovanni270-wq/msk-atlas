/* Estrae i dati delle mesh incorporati in un modello (base64 nei blocchi bpdat/bpdat2) in file binari
   versionati in assets/dati/<nome>/, caricati dalla pagina con fetch. Passo dell'integrazione di un modello nel repository:
   i modelli creati in chat restano un file singolo autocontenuto e si convertono con questo script.

   Uso (dalla cartella del progetto):
     node strumenti/estrai-dati.mjs <nome>-3d              → converte modelli/<nome>-3d.html
     node strumenti/estrai-dati.mjs <nome>-3d verifica     → non scrive: controlla una pagina già convertita
     REV=<commit> node strumenti/estrai-dati.mjs <nome>-3d verifica   (default REV=HEAD)

   Conversione:
   - ogni blocco bpdat/bpdat2 diventa <script id="…" type="text/plain" data-src="../assets/dati/<nome>/<id>.<hash>.br" data-len="…"></script>
     e il binario (decompresso se era gzip) si salva compresso con brotli q11 (formato e nomi in lib-dati.mjs);
   - nel caricatore della pagina la decodifica base64 (atob + eventuale DecompressionStream gzip) diventa `await datiBP(id)`;
     il caricatore sincrono (const BP=(()=>{…})(), ginocchio) diventa loadBP() asincrono, chiamato all'inizio della costruzione;
   - dopo i blocchi dei dati si aggiunge lo script DATI_BP (datiBP): avvia subito il download, in parallelo a three.js,
     controlla la lunghezza ricevuta e, se i dati non arrivano (file://, rete, server senza Content-Encoding: br),
     scrive un messaggio nel riquadro di caricamento. Nient'altro della pagina cambia (strutture, geometrie, controlli).
   Lo script si ferma se la pagina è già convertita o se il caricatore non ha la forma attesa.

   verifica: la pagina non contiene più base64 né atob, e i binari letti da assets/dati/ sono identici byte per byte
   a quelli incorporati nella revisione REV (quella prima della conversione). */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT, reBlocco, leggiDati, scriviDati } from './lib-dati.mjs';

const nome = process.argv[2], VERIFICA = process.argv.includes('verifica');
if (!nome || !/^[a-z0-9-]+-3d$/.test(nome)) { console.error('Uso: node strumenti/estrai-dati.mjs <nome>-3d [verifica]'); process.exit(1); }
const FILE = resolve(ROOT, 'modelli', `${nome}.html`), REL = `modelli/${nome}.html`;
let h = readFileSync(FILE, 'utf8');
const ids = ['bpdat', 'bpdat2'].filter(id => reBlocco(id).test(h));
const convertito = id => /\sdata-src="/.test(h.match(reBlocco(id))[2]);

// script di avvio del download (uguale in tutti i modelli)
const DATI_BP = `<script>/* DATI_BP: dati delle mesh in assets/dati/ (strumenti/estrai-dati.mjs). Il download parte subito, in parallelo a three.js;
   il server li invia con Content-Encoding: br, quindi arrivano già decompressi (lunghezza in data-len). */
const datiBP=(()=>{const P={};
  const errore=t=>{const l=document.getElementById('loadTxt'),b=document.querySelector('#load .bar');
    if(l){l.textContent=t;l.style.cssText='max-width:32em;padding:0 16px;text-align:center;line-height:1.5';}if(b)b.hidden=true;console.error(t);return new Promise(()=>{});};
  const scarica=async el=>{
    if(location.protocol==='file:')return errore('Questo modello va aperto da un server web: i dati 3D sono in un file separato. In locale: node strumenti/server.mjs');
    let ab;try{const r=await fetch(el.dataset.src);if(!r.ok)return errore('Dati del modello non trovati (HTTP '+r.status+'). Ricarica la pagina.');ab=await r.arrayBuffer();}
    catch(e){return errore('Impossibile scaricare i dati del modello. Controlla la connessione e ricarica la pagina.');}
    if(ab.byteLength!==+el.dataset.len)return errore('Dati del modello non validi: il server deve inviarli con Content-Encoding: br (in locale: node strumenti/server.mjs).');
    return ab;};
  return id=>P[id]||(P[id]=scarica(document.getElementById(id)));})();
datiBP(location.hash==='#dito'&&document.getElementById('bpdat2')?'bpdat2':'bpdat');
</script>`;

if (VERIFICA) {
  const REV = process.env.REV || 'HEAD', h0 = execFileSync('git', ['show', `${REV}:${REL}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8');
  const err = [];
  for (const id of ids) {
    if (!convertito(id)) { err.push(`${id}: non convertito`); continue; }
    const a = leggiDati(h, id, { file: FILE }), b = leggiDati(h0, id, { file: REL, rev: REV });
    if (!a.equals(b)) err.push(`${id}: binario diverso da ${REV}`); else console.log(`${id}: ${a.length} byte identici a ${REV}`);
  }
  if (/atob\(document\.getElementById/.test(h)) err.push('il caricatore usa ancora atob');
  if (!h.includes('DATI_BP:')) err.push('manca lo script DATI_BP');
  if (!/BP=await loadBP\(\)/.test(h)) err.push('manca BP=await loadBP()');
  if (err.length) { console.error('ERRORI:\n  ' + err.join('\n  ')); process.exit(1); }
  console.log('OK:', REL); process.exit(0);
}

if (!ids.length) { console.error('blocco bpdat non trovato'); process.exit(1); }
if (ids.some(convertito)) { console.error(`${REL}: già convertito`); process.exit(1); }
const sost = (da, a, cosa) => { if (!h.includes(da)) throw new Error('caricatore con forma inattesa: ' + cosa); h = h.split(da).join(a); };

// 1. caricatore: decodifica base64 (con gzip) → datiBP
const DEC = /const b=atob\(document\.getElementById\(([^;]*?)\)\.textContent\.trim\(\)\);const u8=new Uint8Array\(b\.length\);for\(let i=0;i<b\.length;i\+\+\)u8\[i\]=b\.charCodeAt\(i\);\n/;
const m = h.match(DEC); if (!m) throw new Error('decodifica base64 non trovata');
const GZ = "  const ab=await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();\n";
const SYNC = "const BP=(()=>{const man=JSON.parse(document.getElementById('bpman').textContent);\n";
if (h.includes(m[0] + GZ)) sost(m[0] + GZ, `const ab=await datiBP(${m[1]});\n`, 'gzip');
else if (h.includes(SYNC)) { // caricatore sincrono, dati non compressi (ginocchio)
  sost(SYNC + '  ' + m[0], "let BP=null;\nasync function loadBP(){const man=JSON.parse(document.getElementById('bpman').textContent);\n  const u8=new Uint8Array(await datiBP(" + m[1] + "));\n", 'sincrono');
  sost('const by={};man.meshes.forEach(m=>by[m.n]=m);return {man,u8,by};})();', 'const by={};man.meshes.forEach(m=>by[m.n]=m);return {man,u8,by};}', 'fine sincrono');
  const INIT = "(async function(){\n  const bar=document.getElementById('loadBar'),txt=document.getElementById('loadTxt');\n";
  sost(INIT, INIT + '  BP=await loadBP();\n', 'avvio costruzione');
} else throw new Error('caricatore non riconosciuto');
if (/atob\(document\.getElementById/.test(h)) throw new Error('resta una decodifica base64 non convertita');

// 2. blocchi dei dati → file in assets/dati/<nome>/
for (const id of ids) {
  const buf = leggiDati(h, id, { file: FILE });
  h = scriviDati(h, id, buf, FILE);
  const src = h.match(reBlocco(id))[2].match(/data-src="([^"]+)"/)[1];
  console.log(`${id}: ${buf.length} byte → ${src}`);
}

// 3. script di avvio del download, dopo l'ultimo blocco dei dati
const ult = h.match(reBlocco(ids.at(-1)));
h = h.slice(0, ult.index + ult[0].length) + '\n' + DATI_BP + h.slice(ult.index + ult[0].length);

writeFileSync(FILE, h);
console.log('scritto', REL, `(${(h.length / 1024).toFixed(0)} KB)`);
