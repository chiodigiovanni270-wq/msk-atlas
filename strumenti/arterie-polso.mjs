/* Arterie del polso (modelli/polso-dito-3d.html, sezione polso).

   Uso (dalla cartella del progetto):
     node strumenti/arterie-polso.mjs              → riscrive i tubi delle arterie nel sorgente della pagina
     node strumenti/arterie-polso.mjs verifica     → elenca le compenetrazioni delle arterie, senza scrivere
     MODELLO=/tmp/copia.html node strumenti/arterie-polso.mjs   → lavora su una copia
     node strumenti/arterie-polso.mjs solo=arad,auln   → ricalcola e scrive solo alcune arterie (anche con `verifica`)

   Le arterie (tubi procedurali) vengono portate fuori da ossa, cartilagini, legamenti, capsula, retinacoli, tendini,
   guaine, aponeurosi, muscoli, nervi e vene, e restano sotto la cute. Tra ventri muscolari a contatto (le mesh di
   BodyParts3D si toccano, senza spazio tra loro) l'arteria scorre in un solco profondo al più TOLL_VENTRE, come nei
   piani intermuscolari; sui tendini (tag per vertice ≥ TAG_VENTRE) e su tutte le altre strutture nessuna tolleranza.
   Eccezioni anatomiche (ECCEZIONI): l'arteria radiale passa tra i capi del I interosseo dorsale e tra i capi
   dell'adduttore del pollice per entrare nel palmo; il ramo palmare superficiale della radiale attraversa i tenari
   superficiali; il ramo palmare profondo dell'ulnare perfora l'opponente del mignolo (Standring S, Gray's Anatomy,
   42ª ed.; Netter FH, Atlante di anatomia umana). Rapporti imposti (VINCOLI):
   - arteria ulnare radiale al nervo ulnare nell'avambraccio e nel canale di Guyon, sotto il legamento carpale volare
     e sopra il retinacolo dei flessori;
   - arco palmare profondo dorsale ai tendini flessori e alla guaina ulnare, sulle basi dei metacarpi;
   - arco palmare superficiale subito sotto l'aponeurosi palmare e superficiale a tendini flessori e nervi digitali;
   - arterie del palmo sempre profonde all'aponeurosi palmare (telo sottile).
   Strutture adattate dopo alle arterie (RICOSTRUITI, nella zona indicata non sono ostacoli): tetto del
   canale di Guyon (`retinacoli-polso.mjs volari` ricostruisce il tetto sopra nervo e arteria ulnari) e nervi digitali
   comuni sotto l'arco superficiale (`nervi-polso.mjs` li tiene dorsali all'arco: tra aponeurosi e nervi lo spazio
   non basta) e nervo ulnare nell'avambraccio distale e nel canale (lo spazio radiale al nervo è occupato da guaina
   ulnare e FDS: l'arteria vi si affianca e il nervo si sposta in senso ulnare). Ciclo completo, in un giro: questo
   script; `nervi-polso.mjs`; `retinacoli-polso.mjs volari --solo=tettoguy,lumguy`; questo script con
   `solo=aradsup,aulnprof,adig,amcp,aprinc,adca` (i rami evitano i nervi nella posizione finale); le verifiche. I tronchi
   (TRONCHI) usano i nervi della revisione ORIGINALE, come li calcola `nervi-polso.mjs` senza le arterie: così il ciclo è
   coerente.
   Metodo: programmazione dinamica sulle sezioni del decorso (vedi `risolvi`): per ogni sezione tutte le posizioni
   entro lo spostamento massimo, costo = compenetrazioni + rapporti violati + cute + scostamento, pendenza limitata tra
   sezioni vicine; il cammino di costo minimo è globale, poi lisciato, carenato (curvatura distribuita in archi
   morbidi) e riparato localmente senza mai peggiorare un punto. I rami restano attaccati al vaso da cui nascono e le anastomosi ai loro estremi: prima si sistemano i tronchi,
   poi i rami, che seguono lo spostamento del punto d'origine. Calibro (CALIBRO): i tronchi si assottigliano
   gradualmente verso gli archi, i rami nascono con un'origine svasata che si raccorda al tronco (opzioni `ini`, `fin`
   di `tube`). La verifica conferma ogni compenetrazione con la distanza esatta dai triangoli delle mesh.
   Riparte sempre dai tubi delle arterie della revisione ORIGINALE, quindi si può rilanciare. Si lancia dopo
   `radio-volare-polso.mjs` (che riscrive l'arteria radiale: se lo si rilancia, va aggiornata ORIGINALE). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.MODELLO ||= resolve(ROOT, 'modelli', 'polso-dito-3d.html');
const G = await import('./lib-modello.mjs');
const { man, log, sstep, griglia, campo, sample } = G;

const ORIGINALE = '2426d75';                      // revisione con i tubi delle arterie di partenza
const FILE_REPO = 'modelli/polso-dito-3d.html';
// ordine: prima i tronchi, poi i rami (ogni ramo segue il vaso da cui nasce)
const ARTERIE = ['arad', 'auln', 'aradsup', 'aulnprof', 'adig', 'amcp', 'aprinc', 'adca'];
const SOLO = process.argv.find(a => a.startsWith('solo='))?.slice(5).split(',') || ARTERIE;
const TUBI_OSTACOLO = ['ner', 'ven'];                      // categorie di tubi da cui le arterie stanno lontane
const NON_OSTACOLI = ['cute', 'lumtc', 'lumguy', 'adipq']; // cute: contenitore; spazi; adipe (le arterie vi decorrono)
const Y_TAGLIO = [7.9, -7.3];   // piani di taglio (prossimale, distale): un estremo oltre questi scorre sul piano
const GIOCO = 0.01;        // distanza minima dagli ostacoli, oltre il raggio (cm)
const GIOCO_CUTE = 0.08;   // distanza minima dalla superficie cutanea, oltre il raggio (cm)
const SPOST_MAX = { 'auln:0': 1.2, 'adca:0': 1.2, 'adca:3': 1.2, base: 0.9 };   // spostamento massimo dal decorso di partenza (cm)
const PENDENZA = { 'auln:0': 1, base: 2 };   // variazione massima dello spostamento tra sezioni vicine (passi di griglia per sezione)
const DISTENDI = 16;       // passate di smussatura del decorso di partenza (estremi fissi): curve più dolci
const PASSO = 0.05;        // passo dei punti dei tubi (cm): sezioni del calcolo e punti scritti nella pagina

// passaggi anatomici attraverso ventri muscolari: struttura → condizione sul punto (p) e sull'ascissa dall'origine (s)
const ECCEZIONI = {
  'arad:0': { iod: p => p[0] < -2.0, add: () => true },   // tra i capi del I interosseo dorsale e dell'adduttore del pollice
  'aradsup:0': { apb: () => true, fpb: () => true },       // attraversa i tenari superficiali
  'aulnprof:0': { odm: () => true },                       // perfora l'opponente del mignolo
};
// strutture adattate dopo alle arterie, che nella zona indicata non sono ostacoli (valgono solo i VINCOLI):
// - tetto del canale di Guyon (legamento carpale volare), ricostruito sopra nervo e arteria da `retinacoli-polso.mjs
//   volari` (il pavimento, retinacolo dei flessori, resta un ostacolo: l'arteria gli sta sopra e lui non cambia);
// - nervi digitali comuni e ramo superficiale dell'ulnare, che `nervi-polso.mjs` tiene dorsali all'arco palmare
//   superficiale (tra aponeurosi e nervi lo spazio non basta per l'arco: i nervi scendono dove l'arco li incrocia);
// - nervo ulnare e suoi rami nell'avambraccio distale e nel canale di Guyon: lo spazio radiale al nervo è occupato da
//   guaina ulnare e FDS; l'arteria vi si affianca e `nervi-polso.mjs` sposta il nervo in senso ulnare quanto serve.
//   `peso`: ostacolo cedevole (penalità ridotta: l'arteria lo compenetra solo dove lo spazio non basta; anche funzione del punto)
const GUYON_Y = [-3.0, -0.6], Y_ARCO = -3.0;
const inGuyon = p => p[1] > GUYON_Y[0] && p[1] < GUYON_Y[1];
const RICOSTRUITI = {
  'auln:0': [{ nomi: ['tettoguy'], dove: inGuyon }, { nomi: ['ndig', 'nulnsup'], dove: p => p[1] < Y_ARCO, peso: 0.3 },
    // nell'avambraccio distale il nervo ha spazio per spostarsi in senso ulnare; nel canale no (pisiforme): lì è rigido,
    // con un passaggio graduale (niente gradino nel decorso dell'arteria)
    { nomi: ['nuln', 'nulnsup', 'nulnprof'], dove: p => p[1] > -0.4 && p[1] < 6, peso: p => 0.3 + 0.7 * sstep(0.8, -0.4, p[1]) }],
};
// peso della compenetrazione di un ostacolo nel punto p: 1 = ostacolo, 0 = adattato dopo, in mezzo = cedevole
const pesoOstacolo = (chiave, n, p) => { const r = (RICOSTRUITI[chiave] || []).find(r => r.nomi.includes(n) && r.dove(p)); return r ? (typeof r.peso === 'function' ? r.peso(p) : r.peso ?? 0) : 1; };
const ricostruito = (chiave, n, p) => pesoOstacolo(chiave, n, p) < 1;
// rapporti imposti: nel tratto con y in [y0, y1] (e dove vale `dove`) le strutture `nomi` non devono trovarsi in direzione
// `dir` dall'arteria (entro `l`, di norma RAGGI cm); dove l'arteria le tocca, ne esce proprio in direzione `dir`. Con `entro` il
// rapporto è opposto: la struttura deve trovarsi in direzione `dir` a non più di `entro` cm. `tubi`: a quali arterie
const FLESSORI = ['fds', 'fdp', 'fpl', 'gulnare', 'gfpl', 'lumb'];
const VINCOLI = [
  { tubi: ['auln:0'], y: [-3.0, 9], lato: ['nuln', 'nulnsup'], dir: [-1, 0, 0], min: -0.12, vicino: { y: [-1.6, 6], d: 0.55 } },   // ulnare subito radiale al nervo ulnare (min < 0: il nervo, cedevole, si sposta poi in senso ulnare)
  { tubi: ['arad:0'], y: [-9, -2.6], nomi: [...FLESSORI, 'nmed', 'ndig', 'nulnsup'], dir: [0, 0, -1] },   // arco profondo dorsale ai flessori
  { tubi: ['auln:0'], y: [-9, -1.6], nomi: [...FLESSORI, 'ndig', 'nmed', 'nulnsup'], dir: [0, 0, 1] },   // poi superficiale ai rami del nervo, arco volare a flessori e nervi digitali
  { tubi: 'tutti', y: [-9, 9], nomi: ['pl'], dir: [0, 0, -1] },   // aponeurosi palmare (telo sottile): le arterie le stanno sempre dorsalmente
  { tubi: ['auln:0'], y: [-9, -3.3], dove: p => p[0] > -2.2, nomi: ['pl'], dir: [0, 0, 1], entro: 0.25 },   // arco superficiale subito sotto l'aponeurosi (oltre il margine distale del retinacolo)
  { tubi: ['auln:0'], y: GUYON_Y, nomi: ['tettoguy'], dir: [0, 0, -1] },   // canale di Guyon: sotto il tetto...
  { tubi: ['auln:0', 'aulnprof:0'], y: [-2.4, -0.4], nomi: ['retfl'], dir: [0, 0, 1], l: 2.0 },   // ...e sopra il retinacolo dei flessori (non nel tunnel carpale)
  // dove l'arco superficiale incrocia un nervo digitale (che poi scende sotto l'arco), tra arco e tendini resta lo
  // spazio per il nervo: niente flessori né lombricali entro `lontano` cm sotto l'asse dell'arco
  { tubi: ['auln:0'], y: [-9, Y_ARCO], nomi: [...FLESSORI, 'add'], dir: [0, 0, -1], lontano: 0.30, se: { nomi: ['ndig', 'nulnsup'], l: 0.4 } },
];
const RAGGI = 0.9;
const vincoli = chiave => VINCOLI.filter(v => v.tubi === 'tutti' || v.tubi.includes(chiave));
const vale = (v, p) => p[1] >= v.y[0] && p[1] <= v.y[1] && (!v.dove || v.dove(p));
const vincolo = (V, n, p) => V.find(v => v.nomi && !v.entro && !v.lontano && v.nomi.includes(n) && vale(v, p));
// lato: il centro dell'arteria sta dal lato `dir` rispetto al punto più vicino dell'asse del nervo (a qualunque profondità);
// con `vicino` (nel tratto vicino.y) l'arteria accompagna il nervo: assi a non più di vicino.d cm. Restituisce di quanto
// (cm) il rapporto non è rispettato (0 se lo è): penalità graduale, così il decorso si può lisciare
function latoSbagliato(v, p, tubi = OSTACOLI_TUBI) {
  let best = 1e9, q = null;
  for (const t of tubi) { if (!v.lato.includes(t.id)) continue;
    for (let i = 0; i < t.pts.length - 1; i++) { const a = t.pts[i], b = t.pts[i + 1], ab = sub(b, a), u = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))), c = add(a, mul(ab, u)), d = len(sub(p, c)); if (d < best) { best = d; q = c; } } }
  if (!q || best > 1.5) return 0;
  return Math.max(0, (v.min || 0) - dot(sub(p, q), v.dir)) + (v.vicino && p[1] > v.vicino.y[0] && p[1] < v.vicino.y[1] ? Math.max(0, best - v.vicino.d) : 0);
}

// calibro: fin = [raggio relativo alla fine, lunghezza del raccordo in cm]; ini = idem all'origine (>1: origine svasata)
const CALIBRO = {
  'arad:0': { fin: [0.6, 5.5] },      // radiale (~2,4 mm) → arco profondo (~1,4 mm)
  'auln:0': { fin: [0.45, 10.0] },      // ulnare → arco superficiale, che si chiude col ramo superficiale della radiale
  'aradsup:0': { ini: [1.5, 0.35] }, 'aulnprof:0': { ini: [1.6, 0.35] },
  'adig:0': { ini: [1.5, 0.35] }, 'adig:1': { ini: [1.5, 0.35] }, 'adig:2': { ini: [1.5, 0.35] }, 'adig:3': { ini: [1.5, 0.35] },
  'amcp:0': { ini: [1.6, 0.3] }, 'amcp:1': { ini: [1.6, 0.3] }, 'amcp:2': { ini: [1.6, 0.3] },
  'aprinc:0': { ini: [1.5, 0.35] }, 'aprinc:1': { ini: [1.4, 0.3] },
  'adca:0': { ini: [1.5, 0.35] }, 'adca:1': { ini: [1.4, 0.3] }, 'adca:2': { ini: [1.4, 0.3] }, 'adca:3': { ini: [1.4, 0.3] },
};

const fmt = v => +v.toFixed(3);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => mul(a, 1 / (len(a) || 1));
const reTube = /tube\(\[\[(.*?)\]\],([\d.]+)(?:,(\{[^}]*\}))?\)/g;

let SORGENTE0 = null;
function rigaOriginale(id) {
  SORGENTE0 ??= execFileSync('git', ['show', `${ORIGINALE}:${FILE_REPO}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8');
  const r = SORGENTE0.split('\n').find(l => l.startsWith(`{id:'${id}',`)); if (!r) throw new Error('riga originale non trovata: ' + id);
  return r;
}
// sezione polso del sorgente attuale (le righe della sezione dito hanno gli stessi id di alcune strutture)
const SEZ = (() => { const L = G.M.html.split('\n'), a = L.findIndex(l => l.startsWith("if(MODE==='polso')")), b = L.findIndex((l, i) => i > a && l.startsWith('}else{'));
  return [a, b > a ? b : L.length]; })();
const rigaAttuale = id => G.M.html.split('\n').slice(...SEZ).find(l => l.startsWith(`{id:'${id}',`));
const leggi = riga => [...riga.matchAll(reTube)].map(m => ({ pts: m[1].split('],[').map(s => s.split(',').map(Number)), r: +m[2], o: m[3] ? Function('return ' + m[3])() : {} }));
const CAT = {}; for (const l of G.M.html.split('\n').slice(...SEZ)) { const m = l.match(/^\{id:'([^']+)',.*?cat:'([^']+)'/); if (m) CAT[m[1]] = m[2]; }

const ascisse = P => { const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + len(sub(P[i], P[i - 1]))); return s; };
function aAscissa(P, S, s) {
  if (s <= 0) return P[0];
  for (let i = 1; i < P.length; i++) if (S[i] >= s) { const u = (s - S[i - 1]) / (S[i] - S[i - 1] || 1); return add(P[i - 1], mul(sub(P[i], P[i - 1]), u)); }
  return P.at(-1);
}
function ricampiona(P, passo) {
  const S = ascisse(P), L = S.at(-1), n = Math.max(2, Math.round(L / passo)), out = [];
  for (let q = 0; q <= n; q++) out.push(aAscissa(P, S, L * q / n));
  return out;
}
function smussa(P, pass) {
  for (let p = 0; p < pass; p++) { const B = P.map(v => v.slice());
    for (let i = 1; i < P.length - 1; i++) for (const k of [0, 1, 2]) B[i][k] = (P[i - 1][k] + 2 * P[i][k] + P[i + 1][k]) / 4;
    P.splice(0, P.length, ...B); }
}
// raggio lungo il tubo (come `tube` nella pagina): s = ascissa, L = lunghezza
const raggio = (t, s, L) => { let f = 1; const o = t.o || {};
  if (o.ini) f *= o.ini[0] + (1 - o.ini[0]) * sstep(0, o.ini[1], s); if (o.fin) f *= o.fin[0] + (1 - o.fin[0]) * sstep(0, o.fin[1], L - s); return t.r * f; };
// distanza punto-segmento e punto-polilinea
const segd = (p, a, b) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))); return len(sub(p, add(a, mul(ab, t)))); };
// campo di distanza (con segno, dalla superficie) di un tubo sulla griglia corrente: banda attorno all'asse
function campoTubo(t) {
  const F = new Float32Array(G.N).fill(1), P = t.pts, S = ascisse(P), L = S.at(-1), B = 0.35;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], r = Math.max(raggio(t, S[i], L), raggio(t, S[i + 1], L)), lo = [0, 1, 2].map(k => Math.min(a[k], b[k]) - r - B), hi = [0, 1, 2].map(k => Math.max(a[k], b[k]) + r + B);
    const i0 = [0, 1, 2].map(k => Math.max(0, Math.floor((lo[k] - G.O[k]) / G.H))), i1 = [0, 1, 2].map(k => Math.min([G.NX, G.NY, G.NZ][k] - 1, Math.ceil((hi[k] - G.O[k]) / G.H)));
    for (let z = i0[2]; z <= i1[2]; z++) for (let y = i0[1]; y <= i1[1]; y++) for (let x = i0[0]; x <= i1[0]; x++) {
      const p = [G.O[0] + (x + 0.5) * G.H, G.O[1] + (y + 0.5) * G.H, G.O[2] + (z + 0.5) * G.H], id = G.vi(x, y, z), d = segd(p, a, b) - r;
      if (d < F[id]) F[id] = d; }
  }
  return F;
}
const gr = (F, p) => { const e = 0.04, g = [0, 1, 2].map(k => { const a = p.slice(), c = p.slice(); a[k] += e; c[k] -= e; return sample(F, ...a) - sample(F, ...c); }); return nrm(g); };
const bboxMesh = new Map();
function bbox(n) { if (!bboxMesh.has(n)) { const { pos } = G.REAL(n), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); } bboxMesh.set(n, { lo, hi }); }
  return bboxMesh.get(n); }
const MESH = [...new Set(man.meshes.map(m => m.n))].filter(n => !NON_OSTACOLI.includes(n));
// tubi di nervi e vene: sorgente attuale. I tronchi (TRONCHI) usano invece i nervi della revisione ORIGINALE, cioè come
// li calcola `nervi-polso.mjs` senza le arterie: il ciclo arterie → nervi è così coerente e si chiude in un giro (i nervi
// si adattano ai tronchi; i rami, ricalcolati dopo i nervi, evitano i nervi nella posizione finale)
const TRONCHI = ['arad:0', 'auln:0'];
const OSTACOLI_TUBI = Object.keys(CAT).filter(id => TUBI_OSTACOLO.includes(CAT[id])).flatMap(id => leggi(rigaAttuale(id)).map((t, b) => ({ ...t, id, b })));
const OSTACOLI_TUBI0 = OSTACOLI_TUBI.map(t => CAT[t.id] === 'ner' ? { ...leggi(rigaOriginale(t.id))[t.b], id: t.id, b: t.b } : t);

/* ============ Ostacoli attorno a un decorso ============ */
// Nei muscoli di BodyParts3D il tag per vertice distingue ventre (0) e tendine (200). Tra ventri muscolari a contatto
// non c'è spazio libero (le mesh si toccano): l'arteria vi scorre in un solco profondo al più TOLL_VENTRE, come nei
// piani intermuscolari reali. Tendini, ossa, cartilagini, legamenti, guaine, retinacoli, nervi e vene: nessuna tolleranza.
const MUSCOLI = ['fless', 'est', 'mano'], TAG_VENTRE = 100, TOLL_VENTRE = 0.04, SENZA_SOLCO = ['pl'];   // aponeurosi palmare: sempre senza solco
function tagVicino(n) {   // tag del vertice più vicino (griglia di celle di 0,1 cm sui vertici)
  const { pos } = G.REAL(n), { tag } = G.attrs(n), cel = new Map(), k = (i, j, l) => i + ',' + j + ',' + l;
  for (let v = 0; v < pos.length / 3; v++) { const c = k(...[0, 1, 2].map(q => Math.floor(pos[3 * v + q] / 0.1))); if (!cel.has(c)) cel.set(c, []); cel.get(c).push(v); }
  return p => { const c = p.map(v => Math.floor(v / 0.1)); let best = 1e9, t = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) for (const v of cel.get(k(c[0] + i, c[1] + j, c[2] + l)) || []) {
      const d = (pos[3 * v] - p[0]) ** 2 + (pos[3 * v + 1] - p[1]) ** 2 + (pos[3 * v + 2] - p[2]) ** 2; if (d < best) { best = d; t = tag ? tag[v] : 0; } }
    return best < 1e9 ? t : 0; };
}
function ostacoli(P, r, pad, tubi = OSTACOLI_TUBI) {
  const lo = [0, 1, 2].map(k => Math.min(...P.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...P.map(p => p[k])));
  griglia(lo, hi, 0.03, pad);
  const dentro = bb => [0, 1, 2].every(k => bb.hi[k] > lo[k] - pad && bb.lo[k] < hi[k] + pad);
  const O = [];
  for (const n of MESH) if (dentro(bbox(n))) O.push({ n, F: campo([n]).F, tag: MUSCOLI.includes(CAT[n]) && !SENZA_SOLCO.includes(n) ? tagVicino(n) : null });
  for (const t of tubi) { const bb = { lo: [0, 1, 2].map(k => Math.min(...t.pts.map(p => p[k])) - 0.2), hi: [0, 1, 2].map(k => Math.max(...t.pts.map(p => p[k])) + 0.2) };
    if (dentro(bb)) O.push({ n: t.id, nb: t.id + '[' + t.b + ']', F: campoTubo(t) }); }
  const Fc = campo(['cute']).F;
  return { O, Fc };
}
// margine richiesto (cm, oltre il raggio) da un ostacolo nel punto p: negativo nei ventri muscolari (solco ammesso); dai
// nervi un po' di più (GIOCO_NERVI), così che `nervi-polso.mjs`, che tiene i nervi a 0,1–0,3 mm dagli ostacoli, non
// debba spostarli dove non hanno spazio
const GIOCO_NERVI = 0.045;
const soglia = (o, p) => o.tag && o.tag(p) < TAG_VENTRE ? -TOLL_VENTRE : CAT[o.n] === 'ner' ? GIOCO_NERVI : GIOCO;

/* ============ Percorso: programmazione dinamica sulle sezioni ============ */
// Per ogni sezione del decorso (piani perpendicolari all'asse, ogni PASSO cm) si valutano tutte le posizioni entro lo
// spostamento massimo su una griglia di passo H_DP: costo = compenetrazione degli ostacoli attivi (oltre la soglia),
// violazione dei rapporti imposti (VINCOLI), distanza dalla cute, scostamento dal decorso di partenza; tra sezioni
// vicine lo spostamento cambia al più di PENDENZA passi di griglia, con un costo sulla variazione. Il cammino di costo
// minimo è globale (niente minimi locali). Due passate: la prima ampia sul decorso di partenza, poi una lisciatura delle
// posizioni che non peggiora nessun punto e una seconda passata fine sul decorso lisciato (dove il decorso cambia
// molto, i piani di sezione del decorso di partenza si incrocerebbero e darebbero pieghe), poi di nuovo la lisciatura.
const H_DP = 0.03, K_PEN = 300, K_RAPP = 40, K_DEV = 1.5, K_LISCIO = 0.25, SPOST_FINE = 0.3, LISCIA = 100, CARENA = 600, MARGINE_DP = 0.04;
function risolvi(chiave, t, fissi) {
  const tubi = TRONCHI.includes(chiave) ? OSTACOLI_TUBI0 : OSTACOLI_TUBI;
  const SM = SPOST_MAX[chiave] || SPOST_MAX.base, { O, Fc } = ostacoli(t.pts, t.r, SM + 0.4, tubi);
  const ecc = ECCEZIONI[chiave] || {}, V = vincoli(chiave);
  const taglio = p => p[1] >= Y_TAGLIO[0] || p[1] <= Y_TAGLIO[1];
  const colpisce = (o, p, d, l = RAGGI) => { for (let k = 1; k <= 9; k++) if (sample(o.F, ...add(p, mul(d, l * k / 9))) < 0) return true; return false; };
  // distanza del primo contatto lungo il raggio (fino a l; Infinity se nessuno), raffinata per bisezione: penalità graduali
  const contatto = (o, p, d, l) => { let a = 0, b = null; for (let k = 1; k <= 12; k++) { const t = l * k / 12; if (sample(o.F, ...add(p, mul(d, t))) < 0) { b = t; break; } a = t; }
    if (b === null) return Infinity; for (let it = 0; it < 5; it++) { const c = (a + b) / 2; if (sample(o.F, ...add(p, mul(d, c))) < 0) b = c; else a = c; } return b; };
  // contesto di un decorso: ostacoli attivi e raggio in ogni sezione (le eccezioni anatomiche e l'origine del ramo,
  // dentro il tronco, non contano; le strutture adattate dopo pesano secondo RICOSTRUITI)
  const contesto = P => { const S = ascisse(P), L = S.at(-1);
    return { R: S.map(s => raggio(t, s, L)), Oi: P.map((p, i) => O.filter(o => !(ecc[o.n] && ecc[o.n](p, S[i])) && !(t.padre && S[i] < 0.5 && t.padre.ecc[o.n] && t.padre.ecc[o.n](p, S[i])))) }; };
  // violazione nel punto p della sezione i (0 = libero): compenetrazioni, rapporti, cute
  // m: margine in più (cm) usato nella programmazione dinamica, così che lisciatura e riparazione (m = 0) abbiano un po'
  // di spazio per arrotondare le curve senza superare le soglie
  // rigidi: solo vincoli fisici (ostacoli rigidi e cute), per la lisciatura: un arrotondamento locale non attraversa
  // nessuna struttura, quindi non può invertire un rapporto
  const violazione = (cx, i, p, rigidi = false, m = 0) => { let k = 0;
    for (const o of cx.Oi[i]) { const d = sample(o.F, ...p) - cx.R[i];
      if (d < GIOCO + m && !taglio(p)) { const th = soglia(o, p) + m, w = pesoOstacolo(chiave, o.n, p); if (d < th && w && (w === 1 || !rigidi)) k += w * K_PEN * (th - d); }
      if (rigidi) continue;
      const v = vincolo(V, o.n, p); if (v) { const l = (v.l || RAGGI) + 2.5 * m, c = contatto(o, p, v.dir, l); if (c < l) k += K_RAPP * 0.5 + K_PEN * (l - c); }
      for (const w of V) if (w.entro && w.nomi.includes(o.n) && vale(w, p)) { const l = w.entro - 2.5 * m, c = contatto(o, p, w.dir, 2 * l); if (c > l) k += K_PEN * Math.min(l, c - l); } }
    if (!rigidi) for (const w of V) if (w.lato && vale(w, p)) k += K_PEN * latoSbagliato(m ? { ...w, min: (w.min || 0) + m, vicino: w.vicino && { ...w.vicino, d: w.vicino.d - m } } : w, p, tubi);
    if (!rigidi) for (const w of V) if (w.lontano && vale(w, p)) {   // spazio sotto l'arco dove incrocia un nervo
      const nervi = cx.Oi[i].filter(o => w.se.nomi.includes(o.n));
      const sl = w.se.l + 2.5 * m;
      if (nervi.some(o => colpisce(o, p, [0, 0, 1], sl) || colpisce(o, p, [0, 0, -1], sl) || sample(o.F, ...p) < 0))
        for (const o of cx.Oi[i]) if (w.nomi.includes(o.n)) { const l = w.lontano + 2.5 * m, c = contatto(o, p, w.dir, l); if (c < l) k += K_PEN * (l - c); } }
    if (!taglio(p)) { const dc = -sample(Fc, ...p) - cx.R[i]; if (dc < GIOCO_CUTE + m) k += K_PEN * (GIOCO_CUTE + m - dc); }
    return k; };
  const pend = PENDENZA[chiave] ?? PENDENZA.base;
  const n0 = t.pts.length, fermo = i => (i === 0 && !fissi[0]) || (i === n0 - 1 && !fissi[1]);
  // una passata di programmazione dinamica attorno al decorso P0 (spostamento massimo sm)
  const passata = (P0, sm) => {
    const n = P0.length, S0 = ascisse(P0), L = S0.at(-1), cx = contesto(P0);
    const T0 = P0.map((_, i) => nrm(sub(P0[Math.min(n - 1, i + 1)], P0[Math.max(0, i - 1)])));
    const B1 = [], B2 = []; let b = Math.abs(T0[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];   // basi con trasporto parallelo
    for (let i = 0; i < n; i++) { b = nrm(sub(b, mul(T0[i], dot(b, T0[i])))); B1.push(b); B2.push([T0[i][1] * b[2] - T0[i][2] * b[1], T0[i][2] * b[0] - T0[i][0] * b[2], T0[i][0] * b[1] - T0[i][1] * b[0]]); }
    const M = Math.round(sm / H_DP), W = 2 * M + 1, C = [];
    for (let a = -M; a <= M; a++) for (let c = -M; c <= M; c++) C.push([a, c]);
    const E = Math.min(0.8, L / 3), env = S0.map(s => (fissi[0] ? 1 : sstep(0, E, s)) * (fissi[1] ? 1 : sstep(0, E, L - s)));
    const ok = (i, [a, c]) => Math.hypot(a, c) * H_DP <= sm * env[i] + 1e-9;
    const pos = (i, [a, c]) => add(P0[i], add(mul(B1[i], a * H_DP), mul(B2[i], c * H_DP)));
    const costo = (i, cc) => violazione(cx, i, pos(i, cc), false, MARGINE_DP) + K_DEV * ((cc[0] * H_DP) ** 2 + (cc[1] * H_DP) ** 2);
    let D = new Float64Array(C.length).fill(Infinity); const prev = [];   // D[k]: costo minimo fino alla sezione corrente in k
    C.forEach((cc, k) => { if (ok(0, cc)) D[k] = costo(0, cc); });
    for (let i = 1; i < n; i++) {
      const Dn = new Float64Array(C.length).fill(Infinity), pv = new Int32Array(C.length).fill(-1), ds = S0[i] - S0[i - 1] || 0.1, kl = K_LISCIO * H_DP * H_DP / ds;
      C.forEach((cc, k) => { if (!ok(i, cc)) return; let best = Infinity, bj = -1;
        for (let da = -pend; da <= pend; da++) for (let dc = -pend; dc <= pend; dc++) { const a = cc[0] + da, c = cc[1] + dc; if (a < -M || a > M || c < -M || c > M) continue;
          const j = (a + M) * W + (c + M); if (D[j] === Infinity) continue; const v = D[j] + kl * (da * da + dc * dc); if (v < best) { best = v; bj = j; } }
        if (bj >= 0) { Dn[k] = best + costo(i, cc) * ds / 0.1; pv[k] = bj; } });
      prev.push(pv); D = Dn;
    }
    let k = 0; D.forEach((v, j) => { if (v < D[k]) k = j; });
    const P = new Array(n); for (let i = n - 1; i >= 0; i--) { P[i] = fermo(i) ? P0[i] : pos(i, C[k]); if (i) k = prev[i - 1][k]; }
    return P;
  };
  // lisciatura delle posizioni: media con i vicini, ma nessun punto accetta una violazione maggiore della sua (sui punti
  // del cammino, senza ricampionare: ricampionare taglierebbe le curve; gli ostacoli cedevoli non bloccano la lisciatura);
  // gli estremi vincolati restano fermi
  const liscia = P0 => {
    const P = P0.map(p => p.slice()), n = P.length, cx = contesto(P), viol = (i, p) => violazione(cx, i, p, true), v = P.map((p, i) => viol(i, p));
    // estremi liberi: proseguono in linea retta dai punti vicini (sui piani di taglio fino al piano), senza gomito
    const yTaglio = [0, 1].map(e => taglio(P0[e ? n - 1 : 0]) ? P0[e ? n - 1 : 0][1] : null);
    const estremi = () => { for (const e of [0, 1]) { if (!fissi[e]) continue; const i = e ? n - 1 : 0, sg = e ? -1 : 1;
      if (yTaglio[e] !== null) {   // tutti i punti nella fascia di taglio sulla retta che prolunga il vaso fino al piano
        let j = i + sg; while (taglio(P[j]) && Math.abs(j - i) < n - 3) j += sg;
        const dir = nrm(sub(P[j], P[j + sg])), dist = Math.abs(dir[1]) > 0.05 ? (yTaglio[e] - P[j][1]) / dir[1] : PASSO * Math.abs(j - i);
        for (let q = i; q !== j; q += sg) P[q] = add(P[j], mul(dir, Math.max(0, dist) * Math.abs(q - j) / Math.abs(i - j))); }
      else { const j = i + sg, h = i + 2 * sg, q = add(P[j], sub(P[j], P[h])), vq = viol(i, q); if (vq <= v[i] + 1e-6) { P[i] = q; v[i] = vq; } } } };
    for (let pass = 0; pass < LISCIA; pass++) { for (let i = 1; i < n - 1; i++) {
      const q = mul(add(add(P[i - 1], P[i + 1]), mul(P[i], 2)), 0.25), vq = viol(i, q); if (vq <= v[i] + 1e-6) { P[i] = q; v[i] = vq; } }
      estremi(); }
    // carenatura: la media con i vicini si comporta come un filo teso (tratti dritti e spigoli a contatto con gli
    // ostacoli); il passo biarmonico riduce invece la variazione della curvatura e la distribuisce in archi morbidi
    for (let pass = 0; pass < CARENA; pass++) { for (let i = 2; i < n - 2; i++) {
      const b4 = add(add(P[i - 2], P[i + 2]), add(mul(add(P[i - 1], P[i + 1]), -4), mul(P[i], 6))), q = sub(P[i], mul(b4, 0.12)), vq = viol(i, q);
      if (vq <= v[i] + 1e-6) { P[i] = q; v[i] = vq; } }
      estremi(); }
    return { P, v };
  };
  // riparazione locale: si controllano anche i punti medi dei segmenti; dove un ostacolo è compenetrato, i due estremi
  // del segmento si spostano lungo la normale uscente dell'ostacolo, solo se la violazione complessiva diminuisce
  const ripara = P0 => {
    const P = P0.map(p => p.slice()), n = P.length, cx = contesto(P);
    const vmed = (i, a, b) => violazione(cx, i, mul(add(a, b), 0.5));
    const tot = i => violazione(cx, i, P[i]) + (i < n - 1 ? vmed(i, P[i], P[i + 1]) : 0) + (i > 0 ? vmed(i - 1, P[i - 1], P[i]) : 0);
    for (let it = 0; it < 40; it++) { let mosso = false;
      for (let i = 0; i < n; i++) { if (fermo(i) || (i === 0 && !fissi[0]) || (i === n - 1 && !fissi[1])) continue;
        for (const q of [P[i], i < n - 1 ? mul(add(P[i], P[i + 1]), 0.5) : null, i > 0 ? mul(add(P[i - 1], P[i]), 0.5) : null]) { if (!q) continue;
          let f = [0, 0, 0];
          for (const o of cx.Oi[i]) { if (ricostruito(chiave, o.n, q) || taglio(q)) continue; const d = sample(o.F, ...q) - cx.R[i], th = soglia(o, q); if (d < th) f = add(f, mul(gr(o.F, q), th - d + 0.003)); }
          if (len(f) < 1e-5) continue;
          const v0 = tot(i), old = P[i]; P[i] = add(old, f); if (tot(i) < v0 - 1e-6) mosso = true; else P[i] = old; } }
      if (!mosso) break; }
    return P;
  };
  const P00 = t.pts.map(p => p.slice());
  let { P } = liscia(passata(P00, SM));
  const r2 = liscia(ripara(liscia(passata(P, SPOST_FINE)).P)); P = r2.P;
  t.pts = P;
  const res = r2.v.filter(x => x > 0.5).length, scost = Math.max(...P.map(p => { let d = 1e9; for (const q of P00) d = Math.min(d, len(sub(p, q))); return d; }));
  log(chiave, 'scostamento massimo', (scost * 10).toFixed(1), 'mm; punti con violazione residua', res);
  if (process.env.DEBUG) { const cx = contesto(P); for (let i = 0; i < P.length; i += 5) { const p = P[i], w = cx.Oi[i].map(o => [o.nb || o.n, sample(o.F, ...p) - cx.R[i], soglia(o, p)]).sort((a, b) => (a[1] - a[2]) - (b[1] - b[2])).slice(0, 3);
    log(`  ${i} ${p.map(x => x.toFixed(2)).join(' ')} viol ${r2.v[i].toFixed(2)} | ${w.map(([a, x, th]) => a + ' ' + (x * 10).toFixed(1) + (th < 0 ? 'v' : '')).join(', ')}`); } }
}

/* ============ Origini e anastomosi ============ */
// per ogni estremo di un ramo: il tubo (già sistemato) su cui poggia e la sua ascissa nel decorso di partenza
function attacchi(T) {
  const tutti = Object.entries(T).flatMap(([id, tt]) => tt.map((t, b) => ({ k: id + ':' + b, t })));
  const ordine = tutti.map(x => x.k);
  for (const { k, t } of tutti) {
    t.att = [null, null];
    for (const e of [0, 1]) { const p = e ? t.pts.at(-1) : t.pts[0];
      for (const { k: k2, t: t2 } of tutti) { if (ordine.indexOf(k2) >= ordine.indexOf(k)) continue;
        const S = ascisse(t2.pts); let best = 1e9, sb = 0;
        for (let i = 0; i < t2.pts.length - 1; i++) { const a = t2.pts[i], b = t2.pts[i + 1], ab = sub(b, a), u = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab))), d = len(sub(p, add(a, mul(ab, u))));
          if (d < best) { best = d; sb = S[i] + u * len(ab); } }
        if (best < 0.02 && !t.att[e]) t.att[e] = { k: k2, t: t2, s: sb, L0: S.at(-1) };
      } }
  }
}
// porta l'estremo e sul nuovo punto del tubo padre, con uno spostamento che si annulla dolcemente lungo il ramo
function segui(t, e, P) {
  const a = t.att[e], S = ascisse(a.t.pts), q = aAscissa(a.t.pts, S, a.s * S.at(-1) / a.L0), d = sub(q, e ? P.at(-1) : P[0]);
  const SP = ascisse(P), L = SP.at(-1);
  P.forEach((p, i) => { const s = e ? L - SP[i] : SP[i]; P[i] = add(p, mul(d, 1 - sstep(0, Math.min(1.2, L * 0.6), s))); });
}

/* ============ Esecuzione ============ */
function arterie() {
  const T = Object.fromEntries(ARTERIE.map(id => [id, leggi(rigaOriginale(id))]));
  attacchi(T);
  for (const id of ARTERIE) T[id].forEach((t, b) => {
    const chiave = id + ':' + b; t.o = { ...(CALIBRO[chiave] || {}) };
    if (!SOLO.includes(id)) { t.pts = leggi(rigaAttuale(id))[b].pts; return; }   // già sistemata: i rami seguono la posizione attuale
    let P = t.pts.map(p => p.slice());
    for (const e of [0, 1]) if (t.att[e]) segui(t, e, P);
    P = ricampiona(P, PASSO);
    // estremi: vincolati se poggiano su un altro vaso (origine, anastomosi), altrimenti liberi (piani di taglio, terminazioni)
    const fissi = [t.att[0] ? 0 : 1, t.att[1] ? 0 : 1];
    smussa(P, DISTENDI);
    t.pts = P;
    const padre = t.att[0] ? t.att[0].k : null;
    t.padre = padre ? { ecc: ECCEZIONI[padre] || {} } : null;
    risolvi(chiave, t, fissi);
  });
  return T;
}

const opz = o => Object.keys(o).length ? ',{' + Object.entries(o).map(([k, v]) => k + ':' + JSON.stringify(v)).join(',') + '}' : '';
function scrivi(T) {
  const righe = G.M.html.split('\n');
  for (const id of SOLO) {
    const i = righe.findIndex((l, j) => j >= SEZ[0] && j < SEZ[1] && l.startsWith(`{id:'${id}',`)); let b = 0;
    righe[i] = rigaOriginale(id).replace(reTube, () => { const t = T[id][b++];
      return 'tube([' + t.pts.map(p => '[' + p.map(fmt).join(',') + ']').join(',') + '],' + t.r + opz(t.o) + ')'; });
  }
  G.M.html = righe.join('\n'); writeFileSync(G.FILE, G.M.html); log('scritto', G.FILE);
}

/* ============ Verifica ============ */
// distanza esatta (con segno: negativa dentro) di un punto da una mesh: triangolo più vicino (Ericson, Real-Time
// Collision Detection 5.1.5) e parità delle intersezioni di un raggio lungo +x. Conferma le compenetrazioni trovate
// sulla griglia, che vicino a bordi sottili (rime cartilaginee, margini dei legamenti) può dare falsi positivi
function distanzaEsatta(n, p) {
  const { pos, idx } = G.REAL(n), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let best = 1e9, cnt = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = [0, 1, 2].map(k => pos[3 * idx[t] + k]), b = [0, 1, 2].map(k => pos[3 * idx[t + 1] + k]), c = [0, 1, 2].map(k => pos[3 * idx[t + 2] + k]);
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap), bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp), cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    const va = d3 * d6 - d5 * d4, vb = d5 * d2 - d1 * d6, vc = d1 * d4 - d3 * d2;
    let q;
    if (d1 <= 0 && d2 <= 0) q = a; else if (d3 >= 0 && d4 <= d3) q = b; else if (vc <= 0 && d1 >= 0 && d3 <= 0) q = add(a, mul(ab, d1 / (d1 - d3)));
    else if (d6 >= 0 && d5 <= d6) q = c; else if (vb <= 0 && d2 >= 0 && d6 <= 0) q = add(a, mul(ac, d2 / (d2 - d6)));
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) q = add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
    else { const dn = 1 / (va + vb + vc); q = add(a, add(mul(ab, vb * dn), mul(ac, vc * dn))); }
    best = Math.min(best, len(sub(p, q)));
    const h = cross([1, 0, 0], ac), det = dot(ab, h); if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det, u = f * dot(ap, h); if (u < 0 || u > 1) continue; const qv = cross(ap, ab), v = f * qv[0]; if (v < 0 || u + v > 1) continue; if (f * dot(ac, qv) > 0) cnt++;
  }
  return cnt % 2 ? -best : best;
}
function verifica() {
  for (const id of SOLO) leggi(rigaAttuale(id)).forEach((t, b) => {
    const chiave = id + ':' + b, P = ricampiona(t.pts, 0.03), S = ascisse(P), L = S.at(-1), R = S.map(s => raggio(t, s, L));
    // curvatura: raggio minore di 2 volte il raggio del tubo → anelli compenetrati, spigolo
    const Q = t.pts; let Rmin = Infinity, yR = 0, iR = 0;
    for (let i = 1; i < Q.length - 1; i++) { const a = sub(Q[i], Q[i - 1]), c = sub(Q[i + 1], Q[i]), ang = Math.acos(Math.max(-1, Math.min(1, dot(a, c) / (len(a) * len(c) || 1)))), Rc = (len(a) + len(c)) / 2 / (ang || 1e-9);
      const rq = raggio(t, ascisse(Q)[i], ascisse(Q).at(-1)); if (Rc / rq < Rmin) { Rmin = Rc / rq; yR = Q[i][1]; iR = Rc; } }
    if (Rmin < 2) log(`  ${chiave} curva stretta: raggio ${(iR * 10).toFixed(1)} mm (y = ${yR.toFixed(2)})`);
    const { O, Fc } = ostacoli(P, t.r, 0.3), ecc = ECCEZIONI[chiave] || {};
    const att = attacchiVerifica(chiave, t);
    for (const o of O) { let c = 0, w = 0, y = 0;
      for (let i = 0; i < P.length; i++) { if (ecc[o.n] && ecc[o.n](P[i], S[i])) continue; if (P[i][1] >= Y_TAGLIO[0] || P[i][1] <= Y_TAGLIO[1]) continue; if (ricostruito(chiave, o.n, P[i]) && !process.argv.includes('--adattati')) continue; if (att.ecc[o.n] && S[i] < 0.5 && att.ecc[o.n](P[i], S[i])) continue;
        let d = sample(o.F, ...P[i]) - R[i]; const th = soglia(o, P[i]) < 0 ? -TOLL_VENTRE : 0; if (d >= th - 0.02) continue;
        if (!o.nb) d = distanzaEsatta(o.n, P[i]) - R[i];   // mesh: conferma con la distanza esatta (i tubi hanno già il campo esatto)
        if (d < th - 0.02) { c++; if (d - th < w) { w = d - th; y = P[i][1]; } } }
      if (c) log(`  ${chiave} dentro ${o.nb || o.n}: ${c} punti (fino a ${(-w * 10).toFixed(1)} mm oltre la soglia, y = ${y.toFixed(2)})`); }
    for (const v of vincoli(chiave)) if (v.lato) { const n = P.filter(p => vale(v, p) && latoSbagliato({ ...v, min: 0, vicino: null }, p) > 0).length;
      if (n) log(`  ${chiave} dal lato sbagliato di ${v.lato.join('/')}: ${n} punti`); }
    const fuori = P.filter((p, i) => p[1] < Y_TAGLIO[0] && p[1] > Y_TAGLIO[1] && -sample(Fc, ...p) < R[i]).length;
    if (fuori) log(`  ${chiave} fuori dalla cute: ${fuori} punti`);
  });
}
// eccezioni del tronco valide all'origine di un ramo (verifica)
function attacchiVerifica(chiave, t) {
  for (const id of ARTERIE) { const tt = leggi(rigaAttuale(id)); for (let b = 0; b < tt.length; b++) { const k = id + ':' + b; if (k === chiave) continue;
    for (const p of tt[b].pts.slice(0, -1).map((p, i) => [p, tt[b].pts[i + 1]])) if (segd(t.pts[0], p[0], p[1]) < 0.02) return { ecc: ECCEZIONI[k] || {} }; } }
  return { ecc: {} };
}

if (process.argv.includes('verifica')) verifica();
else scrivi(arterie());
