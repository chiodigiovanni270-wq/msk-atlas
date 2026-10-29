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
console.log(`Build ${preview ? 'preview privata' : 'pubblica'} completata in dist/`);
