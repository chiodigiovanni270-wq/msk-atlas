/* Traduzioni inglesi (traduzioni/<nome>.en.json): aggiunge le voci mancanti e prepara il prospetto IT/EN da rivedere.
   Lavora sui file sorgente; la versione inglese vera e propria la genera node build-site.mjs (vedi build-en.mjs).

   Uso (dalla cartella del progetto):
     node strumenti/traduzioni.mjs                 tutte le pagine: comune, home, 404 e i modelli che hanno già un file .en.json
     node strumenti/traduzioni.mjs spalla-3d       solo il modello indicato (crea traduzioni/spalla-3d.en.json se manca)
     node strumenti/traduzioni.mjs spalla-3d --prospetto
                                                   scrive traduzioni/prospetto-spalla-3d.md (non versionato): termini dubbi
                                                   in cima, poi metadati, strutture e testi con italiano e inglese affiancati
     --verifica                                    non scrive nulla: elenca soltanto voci mancanti, modificate e obsolete
   Le voci aggiunte hanno "en" vuoto (da compilare); un testo che compare in più pagine va in comune.en.json.
   Le voci MODIFICATE (italiano cambiato) non vengono toccate: si aggiornano a mano "it" ed "en" insieme.
   Si può rilanciare quante volte si vuole. Requisiti: Node 22+, nessuna dipendenza. */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { COMUNI, applicaCodice, creaContesto, leggiTraduzioni, norm, obsolete, paginaDi, traduciHTML, traduciJS } from '../build-en.mjs';

const arg = process.argv.slice(2), verifica = arg.includes('--verifica'), prospetto = arg.includes('--prospetto');
const T = await leggiTraduzioni();
for (const n of ['comune', 'home', '404']) T[n] ||= {};
const richiesti = arg.filter(a => !a.startsWith('--'));
for (const n of richiesti) {
  if (!['comune', 'home', '404'].includes(n) && !existsSync(paginaDi(n))) { console.error(`Pagina sconosciuta: ${paginaDi(n)}`); process.exit(1); }
  T[n] ||= { meta: {}, strutture: {}, testi: {}, ignora: [], dubbi: [] };
}
const nomi = richiesti.length ? richiesti : Object.keys(T);

/* traduzione di prova di ogni pagina: raccoglie le voci mancanti */
const ctx = {};
ctx.comune = creaContesto('comune', [T.comune]);
for (const f of COMUNI) traduciJS(applicaCodice(await readFile(f, 'utf8'), T.comune, f), ctx.comune);
const manifesto = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
for (const k of ['name', 'description']) ctx.comune.traduci({ tipo: 'testo', it: manifesto[k], obbligatorio: true });
for (const n of Object.keys(T)) if (n !== 'comune') {
  ctx[n] = creaContesto(n, [T[n], T.comune]);
  traduciHTML(applicaCodice(await readFile(paginaDi(n), 'utf8'), T[n]), ctx[n]);
}

/* testi mancanti in più pagine → comune */
const pagine = new Map();
for (const [n, c] of Object.entries(ctx)) for (const m of c.stato.mancanti) if (m.chiave === 'testi') (pagine.get(m.it) || pagine.set(m.it, new Set()).get(m.it)).add(n);
const cambiati = new Set();
for (const n of nomi) {
  const { stato } = ctx[n], ob = obsolete(T[n]);
  console.log(`${n.padEnd(15)} senza traduzione ${stato.mancanti.length} · modificati ${stato.modificati.length} · obsoleti ${ob.length}`);
  for (const m of stato.modificati) console.log(`  MODIFICATO ${m.chiave}\n    prima: ${m.prima}\n    ora:   ${m.ora}`);
  for (const o of ob) console.log(`  OBSOLETO ${o}`);
  if (verifica) { for (const m of stato.mancanti) console.log(`  SENZA TRADUZIONE ${m.chiave === 'testi' ? '' : m.chiave + ': '}${m.it}`); continue; }
  for (const m of stato.mancanti) {
    if (m.chiave === 'testi') {
      const dove = pagine.get(m.it).size > 1 ? 'comune' : n;
      if (!Object.hasOwn((T[dove].testi ||= {}), m.it)) { T[dove].testi[m.it] = ''; cambiati.add(dove); }
      continue;
    }
    const [gruppo, ...resto] = m.chiave.split('.');
    if (gruppo === 'meta') (T[n].meta ||= {})[resto[0]] ||= { it: m.it, en: '' };
    else { const [id, prop] = resto; ((T[n].strutture ||= {})[id] ||= {})[prop] ||= { it: m.it, en: '' }; }
    cambiati.add(n);
  }
}
for (const n of cambiati) {
  const { __usate, ...dati } = T[n];
  await writeFile(`traduzioni/${n}.en.json`, JSON.stringify(dati, null, 2) + '\n');
  console.log(`scritto traduzioni/${n}.en.json`);
}

if (prospetto) for (const n of nomi) {
  const t = T[n], cella = s => String(s || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const righe = [`# Prospetto IT/EN — ${paginaDi(n)}`, '', '## Termini dubbi', ''];
  righe.push(...(t.dubbi?.length ? t.dubbi.map(d => `- **${d.termine}** — ${d.nota}`) : ['- Nessuno segnalato.']), '');
  if (Object.keys(t.meta || {}).length) {
    righe.push('## Metadati', '', '| Voce | Italiano | Inglese |', '| --- | --- | --- |');
    for (const [k, v] of Object.entries(t.meta)) righe.push(`| ${k} | ${cella(v.it)} | ${cella(v.en)} |`);
    righe.push('');
  }
  if (Object.keys(t.strutture || {}).length) {
    righe.push('## Strutture', '', '| Struttura | Campo | Italiano | Inglese |', '| --- | --- | --- | --- |');
    const campi = { name: 'Nome', info: 'Nota', o: 'Origine', ins: 'Inserzione', fn: 'Funzione' };
    for (const [id, p] of Object.entries(t.strutture)) for (const [k, v] of Object.entries(p)) righe.push(`| ${k === 'name' ? '**' + cella(p.name?.it) + '**' : ''} | ${campi[k] || k} | ${cella(v.it)} | ${cella(v.en)} |`);
    righe.push('');
  }
  if (Object.keys(t.testi || {}).length) {
    righe.push('## Testi', '', '| Italiano | Inglese |', '| --- | --- |');
    for (const [k, v] of Object.entries(t.testi)) righe.push(`| ${cella(norm(k))} | ${cella(v)} |`);
    righe.push('');
  }
  await writeFile(`traduzioni/prospetto-${n}.md`, righe.join('\n'));
  console.log(`scritto traduzioni/prospetto-${n}.md`);
}
