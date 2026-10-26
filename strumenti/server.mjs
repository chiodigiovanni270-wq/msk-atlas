/* Server locale per provare il sito (sostituisce python3 -m http.server): serve la cartella del progetto
   e invia i dati delle mesh (assets/dati/**.br) con Content-Encoding: br, come Vercel (vercel.json),
   così la pagina li riceve già decompressi. Senza questa intestazione i modelli mostrano un messaggio di errore.

   Uso (dalla cartella del progetto):
     node strumenti/server.mjs            → http://localhost:8000/
     PORT=8080 node strumenti/server.mjs

   Le pagine mancanti rispondono con 404.html. Nessuna cache (Cache-Control: no-store). Requisiti: Node 22+, nessuna dipendenza. */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { dirname, resolve, extname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), PORT = +process.env.PORT || 8000;
const TIPI = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const file = p => { try { const s = statSync(p); return s.isDirectory() ? file(resolve(p, 'index.html')) : p; } catch { return null; } };

createServer((req, res) => {
  let percorso; try { percorso = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  const p = resolve(ROOT, '.' + percorso), r = relative(ROOT, p);
  if (r.startsWith('..') || isAbsolute(r)) { res.writeHead(403).end(); return; }
  let f = file(p), stato = 200;
  if (!f) { f = resolve(ROOT, '404.html'); stato = 404; }
  const h = { 'Cache-Control': 'no-store' };
  if (f.endsWith('.br') && relative(ROOT, f).split(sep).slice(0, 2).join('/') === 'assets/dati') { h['Content-Type'] = 'application/octet-stream'; h['Content-Encoding'] = 'br'; }
  else h['Content-Type'] = TIPI[extname(f).toLowerCase()] || 'application/octet-stream';
  h['Content-Length'] = statSync(f).size;
  res.writeHead(stato, h);
  if (req.method === 'HEAD') res.end(); else createReadStream(f).pipe(res);
  console.log(stato, req.method, percorso);
}).listen(PORT, () => console.log(`MSK Atlas in locale: http://localhost:${PORT}/  (Ctrl+C per fermare)`));
