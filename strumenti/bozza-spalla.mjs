/* Bozza del modello della spalla destra (modelli/spalla-3d.html): crea il file da zero partendo da BodyParts3D.

   Uso (dalla cartella del progetto, Node 22+, `curl`):
     node strumenti/bozza-spalla.mjs              → scarica gli STL (cache in $BP3D_DIR, default tmp/bp3d-stl) e scrive modelli/spalla-3d.html
     node strumenti/bozza-spalla.mjs --prova=f    → scrive in f invece che nel modello
     node strumenti/bozza-spalla.mjs --pagina     → rifà solo pagina, elenco delle strutture e schede (da dati-spalla.mjs), lasciando le mesh del file
   ATTENZIONE: riscrive tutto il file (mesh, schede, pagina). Serve solo per partire; dopo, il modello si migliora con gli
   altri strumenti `*-spalla.mjs` (che leggono e riscrivono le mesh) e modificando le schede nella pagina.

   Metodo:
   - Strutture e schede in `dati-spalla.mjs`. Coordinate: BodyParts3D (mm; x verso sinistra, y indietro, z in alto) → modello (cm):
     x = x, y = z, z = −y, con origine nel centro della testa omerale (sfera adattata ai 45 mm superiori dell'omero, ≈ (−164,8; −72,0; 1324,6) mm).
     Come negli altri modelli: y lungo l'arto (in alto = verso la testa), z in avanti, x negativo = lato laterale del lato destro.
   - L'omero è allontanato di 2,2 mm dalla glenoide (`DISTRAZIONE`): lo spazio tra le ossa in BodyParts3D (~1 mm) non basta per due cartilagini.
   - Tutto è ritagliato al piano y = −14 cm (braccio e torace), con sezione chiusa da anelli (colore corticale/midollare per le ossa, rosso per i muscoli).
   - Mesh ridotte con collasso di spigoli a quadriche (`TRIANGOLI`), sezione non toccata.
   - Muscoli: tag (0–200) = gradiente muscolo→tendine sull'ultimo 20% verso l'osso d'inserzione; fdir = direzione delle fibre
     (parallela all'asse principale, oppure convergente sul punto d'inserzione).
   - La pagina riusa il guscio di `gomito-3d.html` (CSS, vetro, pannelli, card, camera, regioni guidate): vedi `PAGINA`.
   Si può rilanciare (stesso risultato). */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scarica, leggiSTL, ritaglia, riduci, normali, impacchetta, sstep, STL_DIR } from './lib-bp3d.mjs';
import { CATS, STR } from './dati-spalla.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = (process.argv.find(a => a.startsWith('--prova=')) || '').slice(8) || resolve(ROOT, 'modelli', 'spalla-3d.html');
const SOLO_PAGINA = process.argv.includes('--pagina');   // rifà solo pagina e schede, tenendo le mesh già nel file
const ORIGINE = [-164.8, -72.0, 1324.6];       // centro della testa omerale (mm, BodyParts3D)
const Y_TAGLIO = -14;                          // piano di taglio (cm)
const TRIANGOLI = { scapola: 30000, serratus: 25000, default: 12000, ossa: 9000 };
const t0 = Date.now(), log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);

/* ---- coordinate ---- */
const aModello = p => { const P = new Float64Array(p.length); for (let i = 0; i < p.length; i += 3) { P[i] = (p[i] - ORIGINE[0]) / 10; P[i + 1] = (p[i + 2] - ORIGINE[2]) / 10; P[i + 2] = -(p[i + 1] - ORIGINE[1]) / 10; } return P; };
const carica = (n, fma) => { const m = leggiSTL(scarica(fma)); return { n, pos: aModello(m.pos), idx: m.idx }; };

/* ---- 1. ossa (servono anche come riferimento per le inserzioni) ---- */
const grezze = new Map();      // nome mesh → mesh intera (cm)
if (!SOLO_PAGINA) for (const s of STR) for (const [n, f] of s.mesh) if (f && !grezze.has(n)) grezze.set(n, carica(n, f));
// Spazio articolare: in BodyParts3D tra glenoide e testa omerale restano ~1 mm, troppo poco per due cartilagini. L'omero viene allontanato
// dalla glenoide di DISTRAZIONE cm lungo la congiungente (come nella radiografia, dove lo spazio articolare è di 3–5 mm).
const DISTRAZIONE = 0.22;
if (!SOLO_PAGINA) {
  const sc = grezze.get('scapola').pos, dm = [];
  for (let i = 0; i < sc.length; i += 3) dm.push([Math.hypot(sc[i], sc[i + 1], sc[i + 2]), i]);
  dm.sort((a, b) => a[0] - b[0]);
  const g = [0, 0, 0], N = dm.filter(x => x[0] < dm[0][0] + 0.25).length;
  for (const [, i] of dm.slice(0, N)) for (let q = 0; q < 3; q++) g[q] += sc[i + q] / N;
  const l = Math.hypot(...g), u = g.map(x => -x / l), om = grezze.get('omero').pos;       // dalla glenoide verso il centro della testa (origine)
  for (let i = 0; i < om.length; i += 3) for (let q = 0; q < 3; q++) om[i + q] += u[q] * DISTRAZIONE;
  log('omero allontanato di', DISTRAZIONE, 'cm lungo', u.map(x => x.toFixed(2)).join(','), '(distanza minima glenoide-testa prima:', (dm[0][0] - 2.36).toFixed(2), 'cm)');
}
const puntiOsso = nome => { const s = STR.find(x => x.id === nome), pts = []; for (const [n] of s.mesh) { const p = grezze.get(n).pos; for (let i = 0; i < p.length; i += 3 * 5) pts.push([p[i], p[i + 1], p[i + 2]]); } return pts; };
const dMin = (p, pts) => { let m = 1e9; for (const q of pts) { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < m) m = d; } return Math.sqrt(m); };

/* ---- 2. ritaglio, riduzione, tag e fibre ---- */
function asse(P) { // asse principale (iterazione di potenza sulla covarianza)
  const n = P.length / 3, c = [0, 0, 0]; for (let i = 0; i < P.length; i++) c[i % 3] += P[i] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < P.length; i += 3) { const d = [P[i] - c[0], P[i + 1] - c[1], P[i + 2] - c[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b]; }
  let v = [0.3, 0.8, 0.5]; for (let it = 0; it < 60; it++) { const w = C.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]), l = Math.hypot(...w) || 1; v = w.map(x => x / l); }
  return { c, v };
}
const mesh = [];
for (const s of SOLO_PAGINA ? [] : STR) {
  const osso = s.cat === 'ossa', musc = ['cuf', 'cin', 'tor', 'brac'].includes(s.cat);
  for (const [n, f] of s.mesh) {
    if (!f) continue;                                  // struttura costruita da uno strumento successivo
    const g = grezze.get(n);
    const r = ritaglia(g.pos, g.idx, [0, 1, 0], Y_TAGLIO);
    if (!r.idx.length) { log('vuota dopo il taglio:', n); continue; }
    const fissi = Uint8Array.from(r.sezione, v => v >= 0 ? 1 : 0);
    const obiettivo = TRIANGOLI[n] || (osso ? TRIANGOLI.ossa : TRIANGOLI.default);
    let pos = r.pos, idx = r.idx, sez = r.sezione;
    if (idx.length / 3 > obiettivo) {
      const d = riduci(pos, idx, obiettivo, fissi);
      // riordina l'attributo `sezione` sui vertici rimasti (le posizioni di collasso tengono l'indice di `a`)
      const usati = new Map(); let k = 0; for (const i of d.idx) if (!usati.has(i)) usati.set(i, k++);
      const p2 = new Float64Array(k * 3), s2 = new Float32Array(k); for (const [i, j] of usati) { for (let q = 0; q < 3; q++) p2[3 * j + q] = d.pos[3 * i + q]; s2[j] = sez[i]; }
      pos = p2; idx = Uint32Array.from(d.idx, i => usati.get(i)); sez = s2;
    }
    const nv = pos.length / 3, out = { n, pos, idx };
    if (osso) out.tag = Uint8Array.from(sez, v => v < 0 ? 0 : 10 + Math.round(100 * v));
    if (musc) {
      const lato = []; for (let i = 0; i < nv; i++) if (sez[i] < 0) lato.push(i);
      const L = new Float64Array(lato.length * 3); lato.forEach((i, j) => { for (let q = 0; q < 3; q++) L[3 * j + q] = pos[3 * i + q]; });
      const { c, v } = asse(L);
      let lo = 1e9, hi = -1e9; const u = new Float64Array(nv);
      for (let i = 0; i < nv; i++) { u[i] = (pos[3 * i] - c[0]) * v[0] + (pos[3 * i + 1] - c[1]) * v[1] + (pos[3 * i + 2] - c[2]) * v[2]; if (sez[i] < 0) { lo = Math.min(lo, u[i]); hi = Math.max(hi, u[i]); } }
      const pts = s.osso ? puntiOsso(s.osso) : null;
      let flip = false, punto = null;
      if (pts) {
        const dA = [], dB = [];
        for (let i = 0; i < nv; i += 3) { const t = (u[i] - lo) / (hi - lo || 1); if (t < 0.15) dA.push(dMin([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], pts)); else if (t > 0.85) dB.push(dMin([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], pts)); }
        const mA = dA.length ? dA.reduce((a, b) => a + b) / dA.length : 1e9, mB = dB.length ? dB.reduce((a, b) => a + b) / dB.length : 1e9;
        flip = mA < mB;
        // punto d'inserzione = centroide dei vertici più vicini all'osso
        const dd = []; for (let i = 0; i < nv; i += 2) if (sez[i] < 0) dd.push([dMin([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], pts), i]);
        dd.sort((a, b) => a[0] - b[0]); const top = dd.slice(0, Math.max(10, Math.round(dd.length * 0.04)));
        punto = [0, 0, 0]; for (const [, i] of top) for (let q = 0; q < 3; q++) punto[q] += pos[3 * i + q] / top.length;
      }
      out.tag = new Uint8Array(nv); out.fdir = new Int8Array(nv * 3);
      for (let i = 0; i < nv; i++) {
        let t = (u[i] - lo) / (hi - lo || 1); if (flip) t = 1 - t;
        out.tag[i] = sez[i] >= 0 ? 250 : Math.round(200 * sstep(0.8, 1.0, pts ? t : 0));
        let d = v;
        if (s.modo === 'conv' && punto) { d = [punto[0] - pos[3 * i], punto[1] - pos[3 * i + 1], punto[2] - pos[3 * i + 2]]; const l = Math.hypot(...d) || 1; d = d.map(x => x / l); }
        for (let q = 0; q < 3; q++) out.fdir[3 * i + q] = Math.round(d[q] * 127);
      }
    }
    mesh.push(out);
    log(n.padEnd(12), String(g.idx.length / 3).padStart(7), '→', String(idx.length / 3).padStart(6), 'triangoli');
  }
}
let man, dat;
if (SOLO_PAGINA) {
  const e = readFileSync(OUT, 'utf8'); man = JSON.parse(e.match(/<script id="bpman" type="application\/json">(.*?)<\/script>/s)[1]); dat = e.match(/<script id="bpdat" type="text\/plain">(.*?)<\/script>/s)[1];
} else ({ man, dat } = impacchetta(mesh));
log('mesh', man.meshes.length, 'dati', Math.round(dat.length / 1024), 'KB (gzip+base64)');

/* ---- 3. pagina: guscio di gomito-3d.html con strutture, schede e camera della spalla ---- */
const src = readFileSync(resolve(ROOT, 'modelli', 'gomito-3d.html'), 'utf8');
let h = src;
const sost = (re, nuovo, nome) => { const prima = h; h = h.replace(re, typeof nuovo === 'function' ? nuovo : () => nuovo); if (h === prima) throw new Error('pagina: sostituzione non riuscita: ' + nome); };
const js = x => JSON.stringify(x);
const MUSC = ['cuf', 'cin', 'tor', 'brac'];

sost(/<title>.*?<\/title>/, '<title>Spalla 3D | MSK Atlas</title>', 'title');
sost(/<meta name="strutture-bp3d"[\s\S]*?(?=<link rel="icon")/,
  '<meta name="strutture-bp3d" content="Ossa (scapola, clavicola, omero, coste I–V, sterno), cartilagini costali, cuffia dei rotatori, deltoide, grande rotondo, muscoli del torace e del dorso, muscoli del braccio e vasi succlavi.">\n' +
  '<meta name="strutture-modellate" content="Cartilagine della testa omerale e della glenoide, labbro glenoideo, capsula articolare e legamenti (coracoclavicolari, coracoacromiale, acromioclavicolare, sternoclavicolare, coraco-omerale, gleno-omerali): ricostruiti sulle ossa reali, con inserzioni e decorso verificati rispetto alle altre strutture.">\n' +
  '<meta name="description" content="Modello 3D interattivo della spalla destra: ossa, muscoli della cuffia e della cintura scapolare, vasi e nervi. Materiale didattico.">\n', 'meta');
sost(/Modello 3D del gomito/, 'Modello 3D della spalla', 'aria');
sost(/<h1>Gomito destro<\/h1>/, '<h1>Spalla destra</h1>', 'h1');
sost(/\s*<button class="flip"[^\n]*<\/button>/, '', 'flip html');
sost(/document\.getElementById\('bFlip'\)[^\n]*\n/, '', 'flip js');
sost(/<script id="bpman" type="application\/json">.*?<\/script>/s, () => `<script id="bpman" type="application/json">${JSON.stringify(man)}</script>`, 'bpman');
sost(/<script id="bpdat" type="text\/plain">.*?<\/script>/s, () => `<script id="bpdat" type="text/plain">${dat}</script>`, 'bpdat');

// strutture
const campo = (k, v) => v ? `${k}:${js(v)},` : '';
const riga = s => `{id:${js(s.id)},cat:${js(s.cat)},name:${js(s.name)},info:${js(s.info)},${campo('o', s.o)}${campo('ins', s.ins)}${campo('fn', s.fn)}` +
  `${s.cat === 'art' || s.cat === 'ven' ? 'nw:1,' : ''}b:()=>[${s.mesh.map(([n]) => `REAL(${js(n)})`).join(',')}]},`;
const blocco = `/* ============ Categorie ============ */
const MUSC=new Set(${js(MUSC)});
const LACERTO_FADE=0.93,LACERTO_LUCE=1.12;
const THMAP={scapola:0.3,clavicola:0.3,omero:0.34,coste:0.3,sterno:0.3};
const CATS=${js(CATS)};
const S=[
${STR.map(riga).join('\n')}
];

`;
sost(/\/\* ============ Categorie ============ \*\/[\s\S]*?(?=const catById=)/, () => blocco, 'strutture');
sost(/const MCOL=\{[^\n]*\};/, 'const MCOL=' + js(Object.fromEntries(STR.filter(s => MUSC.includes(s.cat)).map((s, i) => [s.id, ['#a8433a', '#983a33', '#a63f36', '#9f3c34', '#ad463c', '#a0413a', '#9c3a33', '#a4403a'][i % 8]]))) + ';', 'mcol');
sost(/const REALFIB=new Set\([^\n]*\);/, 'const REALFIB=new Set([]);', 'realfib');
sost(/case 'brac':case 'fless':case 'est':/, "case 'cuf':case 'cin':case 'tor':case 'brac':", 'materiale muscoli');
sost(/brac:'#7c2622',fless:'#7c2622',est:'#7c2622'/, "cuf:'#7c2622',cin:'#7c2622',tor:'#7c2622',brac:'#7c2622'", 'capc');
sost(/const VS=0\.1,/, 'const VS=0.2,', 'ao');
// camera
sost(/const cam=\{theta:0\.35,phi:0\.12,r:24,target:V\(0,0,0\)\}/, 'const CTR=V(7,0,0);const cam={theta:0.35,phi:0.12,r:70,target:CTR.clone()}', 'cam');
sost(/clamp\(cam\.r\*0\.42,4,15\)/, 'clamp(cam.r*0.42,8,26)', 'ombre');
sost(/cam\.baseR=\(w<h\?54:40\)/, 'cam.baseR=(w<h?100:70)', 'baseR');
sost(/tg:V\(0,0,0\)\}\};\n\}\)\);/, 'tg:CTR.clone()}};\n}));', 'viste');
sost(/cam\.r\*lastPinch\/dist,4,90/, 'cam.r*lastPinch/dist,6,170', 'pinch');
sost(/Math\.exp\(e\.deltaY\*0\.0012\),4,90/, 'Math.exp(e.deltaY*0.0012),6,170', 'ruota');
sost(/Math\.max\(4,cam\.r\*0\.9\)/, 'Math.max(6,cam.r*0.9)', 'tasto +');
sost(/Math\.min\(90,cam\.r\*1\.1\)/, 'Math.min(170,cam.r*1.1)', 'tasto -');
// regioni guidate: per ora nessuna
sost(/const REG=\[[\s\S]*?\n\];\n(?=const regsEl)/, 'const REG=[];\n', 'regioni');
sost(/REG\.forEach\(R=>\{const b=/, "if(!REG.length)regsEl.style.display='none';REG.forEach(R=>{const b=", 'regs nascoste');

writeFileSync(OUT, h);
log('scritto', OUT, Math.round(h.length / 1024) + ' KB');
