// Pubblicazione statica: le bozze esistono soltanto nelle Preview protette.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { costruisciInglese } from './build-en.mjs';
const preview = process.env.VERCEL_ENV === 'preview' || (!process.env.VERCEL && process.argv.includes('--preview'));
const drafts = new Set(['modelli/anca-3d.html', 'modelli/caviglia-3d.html']);
await rm('dist', { recursive: true, force: true });
await mkdir('dist/modelli', { recursive: true });
for (const file of ['assets', 'favicon.ico', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml', '404.html', 'index.html']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
for (const file of await readdir('modelli')) {
  if (file === 'spalla-assiale-prova.html' && !preview) continue;
  if (file.endsWith('.html') && (preview || !drafts.has(`modelli/${file}`))) await cp(`modelli/${file}`, `dist/modelli/${file}`);
}
if (!preview) {
  let home = await readFile('index.html', 'utf8');
  let changed = 0;
  home = home.replace(/<li class="card" data-strutture="\d+">[\s\S]*?<\/li>/g, card => {
    const path = card.match(/class="card-link" href="([^"]+)"/)?.[1];
    if (!drafts.has(path)) return card;
    changed++;
    return card.replace('class="card"', 'class="card" data-state="coming-soon"')
      .replace(/<a class="card-link" href="[^"]+">([^<]+)<\/a>/, '<span>$1</span>')
      .replace(/<span class="go"[\s\S]*?<\/span>/, '')
      .replace('<p class="meta"></p>', '<p class="meta">In lavorazione · Prossimamente</p>');
  });
  if (changed !== drafts.size) throw new Error('Schede delle bozze mancanti: pubblicazione interrotta');
  const available = (home.match(/<li class="card" data-strutture=/g) || []).length;
  home = home.replace('class="grid"', `class="grid" data-summary="${available} disponibili · ${changed} in arrivo"`);
  await writeFile('dist/index.html', home);
  const records = JSON.parse(await readFile('assets/strutture.json', 'utf8'));
  await writeFile('dist/assets/strutture.json', JSON.stringify(records.filter(r => !drafts.has(r.path))));
  for (const file of ['sitemap.xml', '404.html']) {
    const source = await readFile(file, 'utf8');
    await writeFile(`dist/${file}`, source.split('\n').filter(line => ![...drafts].some(path => line.includes(path))).join('\n'));
  }
} else {
  await writeFile('dist/robots.txt', 'User-agent: *\nDisallow: /\n');
}
await costruisciInglese({ preview, drafts, dettagli: process.argv.includes('--traduzioni'), rigoroso: process.argv.includes('--rigoroso') });
// Accesso alla prova solo nelle Preview: il dominio pubblico non riceve il banner.
if (preview) {
  const banner = `<aside aria-label="Funzione in prova" style="position:fixed;top:85px;left:50%;transform:translateX(-50%);z-index:1000;width:max-content;max-width:calc(100% - 24px);padding:12px 18px;border:1px solid #72b4d0;border-radius:12px;background:#182630;color:#e5eaef;box-shadow:0 8px 30px #0008;font:14px system-ui;text-align:center"><span style="display:block;font-size:10px;letter-spacing:.12em;margin-bottom:5px;color:#a5c6d5">PREVIEW · FUNZIONE IN PROVA</span><a href="/modelli/spalla-assiale-prova.html" style="color:#c4edff;font-weight:600;text-decoration:underline">Apri Spalla · Sezioni assiali →</a></aside>`;
  for (const file of ['index.html', 'modelli/spalla-3d.html']) {
    const path = `dist/${file}`;
    const html = await readFile(path, 'utf8');
    await writeFile(path, html.replace(/<body([^>]*)>/, match => match + banner));
  }
}
console.log(`Build ${preview ? 'preview privata' : 'pubblica'} completata in dist/`);
