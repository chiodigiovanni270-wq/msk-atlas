#!/usr/bin/env node
/*
 * Pagine di testo per distretto: anatomia/<distretto>.html
 *
 * Uso:
 *   node strumenti/pagine-anatomia.mjs            genera (o rigenera) le pagine
 *   node strumenti/pagine-anatomia.mjs verifica   non scrive: controlla le pagine già presenti
 *
 * Metodo: legge da ogni modello SOLO l'elenco delle categorie (CATS) e delle strutture (S: id, cat, name, info),
 * senza toccare i blob base64 (`b:()=>…` non viene mai eseguita). Il testo delle pagine è composto solo da nomi e note `info`
 * del modello, riportate parola per parola; le strutture senza `info` compaiono col solo nome. Il testo di raccordo
 * è generico (cosa mostra il modello, come si usa). Non modifica nessun file in modelli/.
 *
 * Verifica: ricostruisce i dati dai modelli e li confronta con i file HTML su disco: ogni nota coincide con l'`info`
 * del modello, nomi e id coincidono, nessuna struttura manca o è in più; conteggi uguali a `data-strutture` della home;
 * id presenti in assets/strutture.json; title ≈60 caratteri, description ≤160, canonical, immagine social, sitemap,
 * link in home e riga "Anatomia:" in fondo; link ai modelli corretti (?struttura=<id>, #dito per il dito).
 *
 * Si può rilanciare in qualsiasi momento (riparte dai modelli). Va rilanciato dopo ogni modifica a nomi, `info`,
 * categorie o strutture di un modello, e per ogni nuovo modello (aggiungerlo alla tabella PAGINE qui sotto).
 * Node 22+, nessuna dipendenza.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITO = 'https://www.mskatlas.com';

/* Strutture (per modello/sezione) il cui link ?struttura=<id> non funziona: il link punta al modello base.
   Vuoto: verificato in Chrome che tutti gli id si aprono (vedi GUIDA_MODELLI.md, "Pagine di testo"). */
const SENZA_DEEP_LINK = {};

/* Una voce per pagina. `sezioni`: una per tavola del file del modello (il polso e il dito stanno nello stesso file). */
const PAGINE = [
  { slug: 'spalla', nome: 'Spalla', h1: 'Anatomia della spalla', og: 'spalla-3d', modello: 'spalla-3d.html',
    oggetto: 'la spalla destra', di: 'della spalla destra',
    sezioni: [{ chiave: 'spalla', titolo: null, nth: 0, hash: '', cta: 'Apri il modello 3D della spalla' }] },
  { slug: 'gomito', nome: 'Gomito', h1: 'Anatomia del gomito', og: 'gomito-3d', modello: 'gomito-3d.html',
    oggetto: 'il gomito destro', di: 'del gomito destro',
    sezioni: [{ chiave: 'gomito', titolo: null, nth: 0, hash: '', cta: 'Apri il modello 3D del gomito' }] },
  { slug: 'polso-dito', nome: 'Polso e dito', h1: 'Anatomia di polso e dito', og: 'polso-dito-3d', modello: 'polso-dito-3d.html',
    oggetto: 'il polso destro e il dito medio', di: 'del polso destro e del dito medio',
    sezioni: [
      { chiave: 'polso', titolo: 'Polso', nth: 0, hash: '', cta: 'Apri il modello 3D del polso' },
      { chiave: 'dito', titolo: 'Dito', nth: 1, hash: '#dito', cta: 'Apri il modello 3D del dito' },
    ] },
  { slug: 'anca', nome: 'Anca', h1: 'Anatomia dell’anca', og: 'anca-3d', modello: 'anca-3d.html',
    oggetto: 'l’anca destra', di: 'dell’anca destra',
    sezioni: [{ chiave: 'anca', titolo: null, nth: 0, hash: '', cta: 'Apri il modello 3D dell’anca' }] },
  { slug: 'ginocchio', nome: 'Ginocchio', h1: 'Anatomia del ginocchio', og: 'ginocchio-3d', modello: 'ginocchio-3d.html',
    oggetto: 'il ginocchio destro', di: 'del ginocchio destro',
    sezioni: [{ chiave: 'ginocchio', titolo: null, nth: 0, hash: '', cta: 'Apri il modello 3D del ginocchio' }] },
];

/* ---------- lettura dei modelli (solo CATS e S) ---------- */
const stub = new Proxy(function () {}, { get: () => stub, apply: () => stub, construct: () => stub });
const globale = new Proxy({}, { has: (t, k) => typeof k === 'string' && k !== 'return', get: (t, k) => (k === Symbol.unscopables ? undefined : stub) });
const valuta = (src) => new Function('G', 'with(G){ return (' + src + '); }')(globale);

function leggiModello(file) {
  const righe = fs.readFileSync(path.join(RADICE, 'modelli', file), 'utf8').split('\n');
  const trova = (re) => righe.map((r, i) => (re.test(r) ? i : -1)).filter((i) => i >= 0);
  const blocco = (ini, chiudi) => {
    const t = [];
    for (let j = ini; j < righe.length; j++) { t.push(righe[j]); if (chiudi.test(righe[j])) break; }
    return t.join('\n').replace(/^(const )?(CATS|S)=/, '').replace(/;\s*$/, '');
  };
  const iC = trova(/^(const )?CATS=\[/), iS = trova(/^(const )?S=\[\s*$/);
  return iS.map((s, n) => ({
    cats: valuta(blocco(iC[n], /^\];\s*$|\];\s*$/)),
    s: valuta(blocco(s, /^\];\s*$/)).map((x) => ({ id: x.id, cat: x.cat, name: x.name, info: x.info || '' })),
  }));
}

/* ---------- utilità ---------- */
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const minuscolo = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const linkModello = (p, sez, id) => {
  const base = `../modelli/${p.modello}`;
  const senza = (SENZA_DEEP_LINK[p.slug] || {})[sez.chiave] || [];
  return senza.includes(id) ? base + sez.hash : `${base}?struttura=${encodeURIComponent(id)}${sez.hash}`;
};

function dati(p) {
  const m = leggiModello(p.modello);
  return p.sezioni.map((sez) => {
    const { cats, s } = m[sez.nth];
    const gruppi = cats.map((c) => ({ id: c.id, name: c.name, voci: s.filter((x) => x.cat === c.id) })).filter((g) => g.voci.length);
    return { ...sez, gruppi, totale: s.length, s };
  });
}

function descrizione(p, sezioni) {
  const n = sezioni.reduce((a, s) => a + s.totale, 0);
  const nomi = [];
  for (const s of sezioni) for (const g of s.gruppi) { const k = minuscolo(g.name); if (!nomi.includes(k)) nomi.push(k); }
  const testa = `${n} strutture ${p.di}: `, coda = '. Elenco con note didattiche. Materiale didattico.';
  let elenco = [];
  for (const k of nomi) { if ((testa + [...elenco, k].join(', ') + '…' + coda).length > 160) break; elenco.push(k); }
  return testa + elenco.join(', ') + (elenco.length < nomi.length ? '…' : '') + coda;
}

const titolo = (p) => `${p.h1}: strutture e schede | MSK Atlas`;

/* ---------- pagina ---------- */
function riga(p) {
  const voci = PAGINE.map((q) => (q.slug === p.slug
    ? `<a href="${q.slug}.html" aria-current="page">${q.nome}</a>`
    : `<a href="${q.slug}.html">${q.nome}</a>`));
  return `<nav class="altre" aria-label="Altre pagine di anatomia"><span>Anatomia:</span> ${voci.join(' · ')}</nav>`;
}

function pagina(p) {
  const sezioni = dati(p);
  const n = sezioni.reduce((a, s) => a + s.totale, 0);
  const url = `${SITO}/anatomia/${p.slug}.html`, img = `${SITO}/assets/og/${p.og}.jpg`;
  const t = titolo(p), d = descrizione(p, sezioni);
  const doppia = sezioni.length > 1;
  const H = doppia ? 3 : 2; // livello dei titoli di categoria

  const cta = sezioni.map((s, i) => `<a class="btn ${i === 0 ? 'btn-light' : 'btn-glass glass'}" href="../modelli/${p.modello}${s.hash}">${s.cta} <span aria-hidden="true">↗</span></a>`).join('\n      ');
  const intro2 = doppia
    ? `Le strutture sono divise nelle due tavole del modello, Polso e Dito.`
    : `Le strutture sono raggruppate per categoria, come nell’elenco del modello.`;

  const corpo = sezioni.map((s) => {
    const pre = s.chiave;
    const toc = s.gruppi.map((g) => `<li><a href="#${pre}-${g.id}">${esc(g.name)}</a> <span>${g.voci.length}</span></li>`).join('\n          ');
    const gruppi = s.gruppi.map((g) => {
      const voci = g.voci.map((v) => {
        const a = `<a href="${linkModello(p, s, v.id)}">${esc(v.name)}</a>`;
        return `<article class="voce" id="${pre}-${esc(v.id)}" data-id="${esc(v.id)}">\n<h${H + 1}>${a}</h${H + 1}>` +
          (v.info ? `\n<p class="nota">${esc(v.info)}</p>` : '') + `\n</article>`;
      }).join('\n');
      return `<section class="cat" id="${pre}-${g.id}" aria-labelledby="${pre}-${g.id}-t">\n<h${H} id="${pre}-${g.id}-t">${esc(g.name)} <span class="n">${g.voci.length}</span></h${H}>\n${voci}\n</section>`;
    }).join('\n');
    const testa = s.titolo
      ? `<section class="tavola" id="${pre}" aria-labelledby="${pre}-tav">\n<h2 id="${pre}-tav">${s.titolo} <span class="n">${s.totale} strutture</span></h2>\n<p class="tav-cta"><a class="btn btn-glass glass" href="../modelli/${p.modello}${s.hash}">${s.cta} <span aria-hidden="true">↗</span></a></p>\n`
      : `<section class="tavola" id="${pre}">\n`;
    return `${testa}<nav class="toc" aria-label="Categorie${s.titolo ? ' · ' + s.titolo : ''}">\n        <ul>\n          ${toc}\n        </ul>\n</nav>\n${gruppi}\n</section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="it" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t)}</title>
<meta name="description" content="${esc(d)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MSK Atlas">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Modello 3D ${p.di} — MSK Atlas">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t)}">
<meta name="twitter:description" content="${esc(d)}">
<meta name="twitter:image" content="${img}">
<meta name="theme-color" content="#070a0d">
<link rel="icon" href="../favicon.ico?v=4" sizes="32x32">
<link rel="icon" href="../assets/favicon.svg?v=4" type="image/svg+xml">
<link rel="apple-touch-icon" href="../assets/icone/apple-touch-icon.png?v=4">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&family=Spectral:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/anatomia.css?v=1">
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="../"><img src="../assets/favicon.svg?v=4" width="28" height="28" alt="">‹ MSK <b>Atlas</b></a>
</div></header>

<main class="wrap">
  <article class="intro">
    <p class="kicker">Anatomia · Strutture del modello</p>
    <h1>${p.h1}</h1>
    <p class="lead">Questa pagina elenca le ${n} strutture del modello 3D interattivo di MSK Atlas che mostra ${p.oggetto}, con la nota didattica di ciascuna. ${intro2}</p>
    <p>Nel modello puoi ruotare, ingrandire, mostrare o nascondere le categorie e toccare una struttura per aprirne la scheda. Il nome di ogni struttura apre il modello con quella struttura già selezionata, isolata con le ossa e centrata.</p>
    <p class="cta">
      ${cta}
    </p>
  </article>

${corpo}
</main>

<footer><div class="wrap">
  ${riga(p)}
  <p class="torna"><a href="../">‹ Torna alla home di MSK Atlas</a></p>
  <p class="f-lic">Modelli derivati da <strong>BodyParts3D</strong>, © The Database Center for Life Science (DBCLS), modificati e integrati per MSK Atlas. Modelli modificati distribuiti con licenza <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/" target="_blank" rel="noopener">CC BY-SA 2.1 JP</a>.</p>
  <p class="f-cite"><cite>Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts.</cite> Nucleic Acids Research, 2009.</p>
  <p class="foot-note"><strong>Materiale didattico.</strong> Non destinato a uso clinico o diagnostico.</p>
</div></footer>
</body>
</html>
`;
}

/* ---------- verifica ---------- */
function verifica() {
  const errori = [];
  const ko = (m) => errori.push(m);
  const home = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');
  const sitemap = fs.readFileSync(path.join(RADICE, 'sitemap.xml'), 'utf8');
  const strutture = JSON.parse(fs.readFileSync(path.join(RADICE, 'assets/strutture.json'), 'utf8'));
  const idIndice = new Set(strutture.map((x) => `${x.path}|${x.section || ''}|${x.id}`));
  const nHome = [...home.matchAll(/<li class="card" data-strutture="(\d+)">[\s\S]*?href="modelli\/([^"#]+)(#dito)?"/g)];
  let note = 0, voci = 0;

  for (const p of PAGINE) {
    const file = path.join(RADICE, 'anatomia', p.slug + '.html');
    if (!fs.existsSync(file)) { ko(`${p.slug}: pagina mancante`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    const attesa = pagina(p);
    if (html !== attesa) ko(`${p.slug}: la pagina su disco differisce da quella generata dai modelli (rilanciare lo script)`);

    const sezioni = dati(p);
    /* metadati */
    const titoloPag = unesc((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const desc = unesc((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
    if (titoloPag.length > 62) ko(`${p.slug}: title lungo ${titoloPag.length}`);
    if (desc.length > 160 || desc.length < 50) ko(`${p.slug}: description di ${desc.length} caratteri`);
    if (!html.includes(`<link rel="canonical" href="${SITO}/anatomia/${p.slug}.html">`)) ko(`${p.slug}: canonical`);
    for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'])
      if (!html.includes(`"${tag}"`)) ko(`${p.slug}: manca ${tag}`);
    if (!fs.existsSync(path.join(RADICE, 'assets/og', p.og + '.jpg'))) ko(`${p.slug}: immagine social mancante`);
    if (!sitemap.includes(`<loc>${SITO}/anatomia/${p.slug}.html</loc>`)) ko(`${p.slug}: non in sitemap.xml`);
    if (!home.includes(`href="anatomia/${p.slug}.html"`)) ko(`${p.slug}: non collegata dalla home`);
    if (!html.includes('Materiale didattico.') || !html.includes('CC BY-SA 2.1 JP') || !html.includes('BodyParts3D')) ko(`${p.slug}: disclaimer o credito`);
    if (!html.includes('href="../"')) ko(`${p.slug}: manca il link alla home`);
    for (const q of PAGINE) if (!new RegExp(`<nav class="altre"[^>]*>[\\s\\S]*?href="${q.slug}.html"`).test(html)) ko(`${p.slug}: riga "Anatomia:" senza ${q.slug}`);
    if ((html.match(/<h1>/g) || []).length !== 1) ko(`${p.slug}: H1 non unico`);

    /* conteggio rispetto alla home */
    const tot = sezioni.reduce((a, s) => a + s.totale, 0);
    const card = nHome.filter((m) => m[2] === p.modello);
    const attesoHome = p.slug === 'polso-dito' ? card.reduce((a, m) => a + +m[1], 0) : card.length === 1 ? +card[0][1] : -1;
    if (attesoHome !== tot) ko(`${p.slug}: ${tot} strutture ma la home ne dichiara ${attesoHome}`);
    if (!new RegExp(`${tot} strutture`).test((home.match(new RegExp(`href="anatomia/${p.slug}.html"[\\s\\S]*?</a>`)) || [''])[0])) ko(`${p.slug}: conteggio nel blocco della home`);

    /* parte per parte: ogni voce nella pagina contro il modello (parola per parola) */
    const parti = html.split(/<section class="tavola"/).slice(1);
    if (parti.length !== sezioni.length) { ko(`${p.slug}: ${parti.length} tavole nella pagina, ${sezioni.length} nel modello`); continue; }
    sezioni.forEach((s, i) => {
      const trovate = [...parti[i].matchAll(/<article class="voce" id="[^"]*" data-id="([^"]*)">\s*<h\d><a href="([^"]*)">([\s\S]*?)<\/a><\/h\d>(?:\s*<p class="nota">([\s\S]*?)<\/p>)?\s*<\/article>/g)];
      const perId = new Map(trovate.map((m) => [unesc(m[1]), m]));
      if (trovate.length !== s.s.length || perId.size !== s.s.length) ko(`${p.slug}/${s.chiave}: ${trovate.length} voci nella pagina, ${s.s.length} nel modello`);
      for (const v of s.s) {
        const m = perId.get(v.id);
        if (!m) { ko(`${p.slug}/${s.chiave}: manca ${v.id}`); continue; }
        voci++;
        if (unesc(m[3]) !== v.name) ko(`${p.slug}/${v.id}: nome diverso`);
        const nota = m[4] === undefined ? '' : unesc(m[4]);
        if (nota !== v.info) ko(`${p.slug}/${v.id}: la nota non coincide con l'info del modello`);
        else if (nota) note++;
        if (m[2] !== linkModello(p, s, v.id)) ko(`${p.slug}/${v.id}: link ${m[2]}`);
        if (!idIndice.has(`modelli/${p.modello}|${p.slug === 'polso-dito' ? s.chiave : ''}|${v.id}`)) ko(`${p.slug}/${v.id}: assente da assets/strutture.json`);
      }
    });
  }
  return { errori, note, voci };
}

/* ---------- main ---------- */
if (process.argv[2] === 'verifica') {
  const { errori, note, voci } = verifica();
  if (errori.length) { console.error(errori.join('\n')); console.error(`\n${errori.length} problemi.`); process.exit(1); }
  console.log(`OK: ${PAGINE.length} pagine, ${voci} strutture, ${note} note identiche all'info del modello.`);
} else {
  fs.mkdirSync(path.join(RADICE, 'anatomia'), { recursive: true });
  for (const p of PAGINE) {
    const html = pagina(p);
    fs.writeFileSync(path.join(RADICE, 'anatomia', p.slug + '.html'), html);
    console.log(`anatomia/${p.slug}.html  ${(html.length / 1024).toFixed(0)} KB`);
  }
}
