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
// Strumento assiale nella stessa pagina, solo Preview finché non approvato.
if (preview) {
  const path = 'dist/modelli/spalla-3d.html';
  let html = await readFile(path, 'utf8');
  html = html.replace('</head>', '<link rel="stylesheet" href="../assets/visualizzazioni-spalla.css"></head>')
    .replace('<h1>Spalla destra</h1>', '<h1>Spalla destra</h1><button id="ax-toggle" aria-expanded="false" aria-controls="ax-panel"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 8 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5M3 16l9 5 9-5"/></svg> Sezioni assiali</button>')
    .replace('const w=innerWidth,h=innerHeight;renderer.setSize', 'const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;renderer.setSize')
    .replace('ray.setFromCamera(new THREE.Vector2((x/innerWidth)*2-1,-(y/innerHeight)*2+1),camera);', 'const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2(((x-rect.left)/rect.width)*2-1,-((y-rect.top)/rect.height)*2+1),camera);')
    .replace('window.__dbg={S,setVis,sync,cam,', 'window.__dbg={S,setVis,sync,cam,resize,select,selected:()=>selected?.id||null,')
    .replace('</body>', '<script type="module" src="../assets/sezioni-assiali.js"></script></body>');
  await writeFile(path, html);
}
console.log(`Build ${preview ? 'preview privata' : 'pubblica'} completata in dist/`);
