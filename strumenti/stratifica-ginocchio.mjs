/* Rapporti anatomici tra legamenti collaterali, zampa d'oca, semimembranoso e bicipite femorale del ginocchio.

   Uso (dalla cartella del progetto):
     node strumenti/stratifica-ginocchio.mjs [--prova]
     node strumenti/capsula-ginocchio.mjs        (dopo: la capsula dipende dalle strutture vicine)
     node strumenti/cute-ginocchio.mjs           (sottocute sopra i tendini spostati)
     node strumenti/borse-ginocchio.mjs          (borse sierose tra i piani)
     node strumenti/percorsi-ginocchio.mjs       (infine: vasi e nervi girano attorno alle strutture)

   Le mesh di partenza sono sempre quelle originali (BodyParts3D) lette dalla revisione git ORIGINALE, quindi lo
   script si può rilanciare dopo ogni modifica delle regole. Con --prova stampa solo le verifiche, senza scrivere.

   Anatomia di riferimento:
   - LCM superficiale: banda piatta dall'epicondilo mediale alla tibia (~6 cm sotto l'interlinea), coperta
     distalmente da sartorio, gracile e semitendinoso con la borsa anserina interposta
     (Warren LF, Marshall JL, JBJS Am 1979;61:56-62; LaPrade RF et al., JBJS Am 2007;89:2000-10).
     La mesh del LCM non viene modificata: si spostano le strutture che la attraversano.
   - Semimembranoso: inserzione diretta sulla tibia postero-mediale subito sotto l'interlinea; il braccio
     anteriore passa profondo al LCM e si inserisce ~1 cm sotto l'interlinea (LaPrade 2007). Non prosegue
     lungo la tibia mediale: la coda della mesh BodyParts3D oltre l'inserzione viene rimossa e il tendine
     affonda nella corticale all'inserzione (breve tratto tendineo dopo la giunzione mio-tendinea).
   - Semitendinoso: postero-mediale e superficiale al semimembranoso, poi curva in avanti sopra il LCM verso
     la zampa d'oca, sotto il gracile e il sartorio.
   - Bicipite femorale: all'interlinea decorre posteriormente al LCL; sulla testa del perone il braccio
     anteriore del capo lungo passa lateralmente (superficiale) al LCL, che quindi vi si inserisce al di sotto
     (Terry GC, LaPrade RF, AJSM 1996;24:2-8; LaPrade RF et al., AJSM 2003;31:854-60). I due capi si spostano
     insieme (stessa traslazione per sezione), così il tendine conserva la sezione compatta e scende diritto sulla
     testa del perone senza avvolgerla; le sfrangiature della mesh oltre l'inserzione vengono tolte.
   - Zampa d'oca: i tendini appoggiano sul LCM e sulla borsa anserina (nessuno spazio vuoto tra i piani) e si
     inseriscono sulla faccia antero-mediale della tibia, ~4 cm sotto l'interlinea (AJR, doi:10.2214/AJR.19.21315);
     il sartorio, il più superficiale, copre gracile e semitendinoso. All'inserzione i tendini entrano nella
     corticale per sezioni rigide (conservano lo spessore). Dopo la giunzione mio-tendinea il colore resta quello
     del tendine fino all'inserzione (i tag delle mesh originali ricadevano a "muscolo" nel ventaglio d'inserzione).
   - Tratto ileotibiale: si inserisce sul tubercolo di Gerdy, sulla faccia antero-laterale del condilo tibiale
     ~1 cm sotto l'interlinea laterale; la mesh originale finiva sopra il tubercolo: il tratto distale viene
     allungato e appoggiato sull'osso, con l'estremità che affonda nella corticale del tubercolo.

   Metodo: nessuna spinta locale. Ogni struttura viene spostata per sezioni trasversali (fasce di 0,5 mm lungo
   l'asse verticale): per ogni sezione si calcola lo spostamento minimo che la libera dalla struttura di
   riferimento in una direzione prestabilita; il profilo lungo la struttura è un inviluppo gaussiano ampio
   (ogni sezione raggiunge lo spostamento necessario, le vicine lo seguono con una campana), così il decorso
   cambia con curve dolci e la sezione non si deforma. Si lavora solo nella regione del ginocchio (ZONA).
   Con --dettaglio stampa anche i livelli degli spostamenti e delle compenetrazioni residue. */
import { REAL, setPos, setMesh, attrs, N, or, solid, edt, sample, sstep, clamp, log, repack, saveFile, meshDaRevisione } from './lib-modello.mjs';

const ORIGINALE = 'b4df739'; // ultima revisione con le mesh originali di muscoli, tendini e legamenti
meshDaRevisione(ORIGINALE);

const PROVA = process.argv.includes('--prova');
const BIN = 0.05, MARGINE = 0.06, TMAX = 1.2, PASSATE = 5;
const ZONA = y => y > -9.5 && y < 5; // solo la regione del ginocchio: coscia e gamba restano come sono

const REGOLE = [
  // semimembranoso: coda oltre l'inserzione tagliata (affonda nella tibia tra y -2,1 e -3,0);
  // all'altezza dei condili il tendine decorre dietro al LCM, sotto l'interlinea il braccio anteriore gli passa sotto
  { tipo: 'taglia', nome: 'semim', ySink: -2.1, yCut: -3.0, tendine: [0.4, -0.9],
    affonda: (x, y, z) => sstep(-0.75, -0.35, z) * sstep(-0.5, -1.1, y) }, // punta del braccio anteriore sotto il LCM
  { tipo: 'sez', sposta: ['semim'], rif: ['lcm'], modo: 'dietro', dove: y => y > -1.4, sigma: 0.9, max: 0.9 },
  { tipo: 'sez', sposta: ['semim'], rif: ['lcm'], modo: 'dentro', dove: y => y <= -1.4, sigma: 0.4, max: 0.4 },
  // semitendinoso postero-mediale e superficiale al semimembranoso
  { tipo: 'sez', sposta: ['semit'], rif: ['semim'], modo: 'postero-mediale', dir: [0.6, 0, -0.8], dove: y => y < 4, sigma: 1.0, max: 0.9 },
  { tipo: 'sez', sposta: ['semit'], rif: ['gmed'], modo: 'mediale', dir: [1, 0, 0], dove: y => y < -4, sigma: 0.8, max: 0.3 },
  // borsa anserina e zampa d'oca superficiali al LCM, sartorio il più superficiale
  // (il LCM originale, banda liscia fino all'inserzione tibiale, non si tocca; la borsa anserina, sottile e
  //  comprimibile, gli sta sopra e i tendini vi scorrono sopra senza sollevarsi dall'inserzione)
  { tipo: 'sez', sposta: ['bans'], rif: ['lcm'], modo: 'fuori', sigma: 0.5, max: 0.25 },
  { tipo: 'sez', sposta: ['grac', 'semit'], rif: ['lcm'], modo: 'fuori', sigma: 0.8, max: 0.7 },
  { tipo: 'sez', sposta: ['grac'], rif: ['semit'], modo: 'fuori', dove: y => y < -4, sigma: 0.8, max: 0.3 }, // gracile sopra il semitendinoso
  { tipo: 'sez', sposta: ['sart'], rif: ['lcm', 'grac', 'semit'], modo: 'fuori', sigma: 0.8, max: 0.6 },
  // colore del tendine continuo fino all'inserzione
  { tipo: 'tendine', nomi: ['sart', 'grac', 'semit'] },
  // tendini della zampa d'oca appoggiati sui piani sottostanti (dal profondo al superficiale), senza spazi vuoti
  { tipo: 'aderisci', sposta: ['semit'], rif: ['tibia', 'lcm', 'bans', 'semim', 'gmed'], dove: y => y < -2.5 && y > -8.5, gap: 0.07, sigma: 0.6, max: 0.6 },
  { tipo: 'aderisci', sposta: ['grac'], rif: ['tibia', 'lcm', 'bans', 'semit'], dove: y => y < -1 && y > -8.5, gap: 0.07, sigma: 0.6, max: 0.6 },
  { tipo: 'aderisci', sposta: ['sart'], rif: ['tibia', 'lcm', 'bans', 'grac', 'semit'], dove: y => y < -1.5 && y > -8.5, gap: 0.07, sigma: 0.6, max: 0.6 },
  // inserzione sulla tibia antero-mediale: i tendini si appiattiscono sull'osso e vi affondano; tolte le sfrangiature
  { tipo: 'taglia', nome: 'sart', ySink: -5.8, yPieno: -7.8, yCut: -8.1, liscia: 25, trasla: true },
  { tipo: 'taglia', nome: 'grac', ySink: -5.8, yPieno: -7.6, yCut: -7.9, liscia: 25, trasla: true }, // sotto il ventaglio del sartorio
  { tipo: 'taglia', nome: 'semit', ySink: -5.8, yPieno: -7.5, yCut: -7.8, liscia: 25, trasla: true },
  { tipo: 'taglia', nome: 'bans', ySink: -5.6, yPieno: -6.9, yCut: -7.2, trasla: true }, // la borsa finisce all'inserzione, sotto i tendini
  // bicipite (capo lungo e breve insieme) posteriore al LCL all'interlinea, raccordato con l'inserzione sul perone
  { tipo: 'sez', sposta: ['biclong', 'bicbrev'], insieme: true, rif: ['lcl'], modo: 'dietro', dove: y => y > -3.0, sigma: 1.4, max: 0.8 },
  // sulla testa del perone il braccio anteriore del capo lungo passa lateralmente al LCL: il bicipite si solleva quanto basta
  { tipo: 'sez', sposta: ['biclong', 'bicbrev'], insieme: true, rif: ['lcl'], modo: 'fuori', dove: y => y <= -2.6, sigma: 0.8, max: 0.35 },
  // bicipite laterale al capo laterale del gastrocnemio (tra i due passa il nervo peroneo comune)
  { tipo: 'sez', sposta: ['biclong', 'bicbrev'], insieme: true, rif: ['glat'], modo: 'laterale', dir: [-1, 0, 0], dove: y => y > -1.5, sigma: 0.9, max: 0.6 },
  // lo spostamento totale del bicipite diventa una B-spline a nodi radi lungo y: il decorso cambia direzione in blocco,
  // senza le ondulazioni delle campane strette delle tre regole precedenti
  { tipo: 'liscia', nomi: ['biclong', 'bicbrev'], nodo: 1.5, ySu: 16, yGiu: -4.5, rigidezza: 3 },
  // inserzione sulla testa del perone: il tendine affonda nella corticale e le sfrangiature oltre l'inserzione
  // (che pendevano dietro la testa) vengono tolte
  { tipo: 'taglia', nome: 'biclong', ySink: -3.0, yCut: -3.9 },
  { tipo: 'taglia', nome: 'bicbrev', ySink: -2.8, yCut: -3.6 },
  // tratto ileotibiale fino al tubercolo di Gerdy, appoggiato sul condilo tibiale; l'estremità affonda nel tubercolo
  { tipo: 'allunga', nome: 'itb', y0: -0.8, yFine: -3.35 },
  { tipo: 'aderisci', sposta: ['itb'], rif: ['tibia'], dove: y => y < -1.8, entrambi: true, gap: 0.02, sigma: 0.4, max: 0.6 },
  { tipo: 'taglia', nome: 'itb', ySink: -2.75, yCut: -3.4 },
];
const CONTROLLO = [['lcm', 'semim'], ['semim', 'gmed'], ['semit', 'gmed'], ['lcm', 'grac'], ['lcm', 'semit'], ['lcm', 'sart'], ['lcm', 'bans'], ['semit', 'semim'], ['grac', 'semit'],
  ['sart', 'grac'], ['sart', 'semit'], ['lcl', 'biclong'], ['lcl', 'bicbrev'], ['biclong', 'glat'], ['bicbrev', 'glat'], ['biclong', 'plant'], ['itb', 'all']];

// campo con segno dell'osso (positivo fuori) e normale
const BONES = new Uint8Array(N); for (const n of ['femore', 'tibia', 'perone', 'rotula']) or(BONES, solid(n));
const Do = edt(BONES), Di = edt(BONES, true), GB = new Float32Array(N);
for (let i = 0; i < N; i++) GB[i] = Do[i] - Di[i] + (BONES[i] ? 0.05 : -0.05);
const normal = (x, y, z, e = 0.05) => { const n = [sample(GB, x + e, y, z) - sample(GB, x - e, y, z), sample(GB, x, y + e, z) - sample(GB, x, y - e, z), sample(GB, x, y, z + e) - sample(GB, x, y, z - e)]; const l = Math.hypot(...n) || 1; return n.map(v => v / l); };

// compenetrazione nella regione del ginocchio: % di vertici di a dentro b (>0,5 mm) e viceversa
function compenetrazione(a, b) {
  const Db = edt(solid(b), true), Da = edt(solid(a), true), A = REAL(a), B = REAL(b); let ca = 0, cb = 0;
  let na = 0, nb = 0; const zona = y => y > -8 && y < 5; // solo la regione del ginocchio
  for (let i = 0; i < A.nv; i++) if (zona(A.pos[3 * i + 1])) { na++; if (sample(Db, A.pos[3 * i], A.pos[3 * i + 1], A.pos[3 * i + 2]) > 0.05) ca++; }
  for (let i = 0; i < B.nv; i++) if (zona(B.pos[3 * i + 1])) { nb++; if (sample(Da, B.pos[3 * i], B.pos[3 * i + 1], B.pos[3 * i + 2]) > 0.05) cb++; }
  return `${a}/${b} ${(100 * ca / Math.max(1, na)).toFixed(1)}%·${(100 * cb / Math.max(1, nb)).toFixed(1)}%`;
}
const rapporto = t => console.log(t, CONTROLLO.map(([a, b]) => compenetrazione(a, b)).join('  '));
rapporto('Prima:');

const orig = new Map(), keep = name => { if (!orig.has(name)) orig.set(name, new Float32Array(REAL(name).pos)); };
const blur = (a, s) => { const r = Math.ceil(3 * s), out = new Float64Array(a.length); for (let k = 0; k < a.length; k++) { let v = 0, w = 0; for (let j = -r; j <= r; j++) { const q = k + j; if (q < 0 || q >= a.length) continue; const ww = Math.exp(-(j * j) / (2 * s * s)); v += a[q] * ww; w += ww; } out[k] = v / w; } return out; };
// inviluppo gaussiano: ogni sezione raggiunge lo spostamento richiesto, i vicini lo seguono con una campana di ampiezza s
const inviluppo = (a, s) => Array.from(a, (_, k) => { let m = 0; const r = Math.ceil(3 * s); for (let j = -r; j <= r; j++) { const q = a[k + j]; if (q > 0) m = Math.max(m, q * Math.exp(-(j * j) / (2 * s * s))); } return m; });

function taglia({ nome, ySink, yCut, yPieno = yCut, affonda, tendine, liscia = 0, trasla = false }) { // yPieno: livello a cui il tendine è tutto nell'osso
  keep(nome);
  const { pos, idx, nv } = REAL(nome), { tag, fdir } = attrs(nome), P = new Float32Array(pos);
  if (liscia) { // levigatura di Taubin dell'estremità (via le sfrangiature della mesh originale), progressiva sotto ySink + 0,6
    const nb = Array.from({ length: nv }, () => new Set()); for (let t = 0; t < idx.length; t += 3) for (let r = 0; r < 3; r++) { const a = idx[t + r], b = idx[t + (r + 1) % 3]; nb[a].add(b); nb[b].add(a); }
    const w = Float32Array.from({ length: nv }, (_, i) => sstep(ySink + 0.6, ySink - 0.4, P[3 * i + 1]));
    for (let it = 0; it < 2 * liscia; it++) { const f = it % 2 ? -0.53 : 0.5, Q = new Float32Array(P);
      for (let i = 0; i < nv; i++) { if (!w[i] || !nb[i].size) continue; const c = [0, 0, 0]; for (const j of nb[i]) for (let k = 0; k < 3; k++) c[k] += Q[3 * j + k];
        for (let k = 0; k < 3; k++) P[3 * i + k] = Q[3 * i + k] + f * w[i] * (c[k] / nb[i].size - Q[3 * i + k]); } }
  }
  if (trasla) { // il tendine entra nell'osso per sezioni rigide (conserva lo spessore, niente appiattimento)
    let y0 = Infinity; for (let i = 0; i < nv; i++) y0 = Math.min(y0, P[3 * i + 1]); const nb = Math.ceil((ySink + 1 - y0) / BIN) + 2, bin = y => clamp((y - y0) / BIN, 0, nb - 1);
    const dmax = new Float64Array(nb).fill(-Infinity), D = [new Float64Array(nb), new Float64Array(nb), new Float64Array(nb)];
    for (let i = 0; i < nv; i++) { const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2]; if (y > ySink + 0.5) continue; const b = Math.round(bin(y)), g = sample(GB, x, y, z);
      dmax[b] = Math.max(dmax[b], g); const n = normal(x, y, z); for (let k = 0; k < 3; k++) D[k][b] -= n[k]; }
    const m = Float64Array.from(dmax, (d, b) => d === -Infinity ? 0 : sstep(ySink, yPieno, y0 + b * BIN) * Math.max(0, d + 0.06));
    const sg = 0.25 / BIN, A = blur(inviluppo(m, sg), sg / 3), Dx = blur(D[0], 4 * sg), Dy = blur(D[1], 4 * sg), Dz = blur(D[2], 4 * sg);
    for (let i = 0; i < nv; i++) { const f = bin(P[3 * i + 1]), k0 = Math.floor(f), k1 = Math.min(nb - 1, k0 + 1), u = f - k0, lerp = a => a[k0] * (1 - u) + a[k1] * u;
      const a = lerp(A); if (a < 1e-4) continue; const v = [lerp(Dx), lerp(Dy), lerp(Dz)], l = Math.hypot(...v) || 1; for (let k = 0; k < 3; k++) P[3 * i + k] += v[k] / l * a; }
  } else for (let i = 0; i < nv; i++) { // accompagna il tendine dentro la corticale verso l'inserzione
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    const s = Math.max(y > ySink ? 0 : sstep(ySink, yPieno, y), affonda ? affonda(x, y, z) : 0); if (s <= 0) continue;
    const g = sample(GB, x, y, z); if (g < -0.08) continue;
    const n = normal(x, y, z), d = s * (g + 0.08); P[3 * i] -= n[0] * d; P[3 * i + 1] -= n[1] * d; P[3 * i + 2] -= n[2] * d;
  }
  const TG = tag && Uint8Array.from(tag); // giunzione mio-tendinea: breve tendine prima dell'inserzione
  if (TG && tendine) for (let i = 0; i < nv; i++) if (TG[i] < 250) TG[i] = Math.max(TG[i], Math.round(200 * sstep(tendine[0], tendine[1], P[3 * i + 1]))); // 250/251: sezioni di taglio
  const T = []; for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if ((P[3 * a + 1] + P[3 * b + 1] + P[3 * c + 1]) / 3 >= yCut) T.push(a, b, c); }
  const map = new Int32Array(nv).fill(-1), np = [], nt = [], nf = [], ni = [];
  for (const o of T) { if (map[o] < 0) { map[o] = np.length / 3; np.push(P[3 * o], P[3 * o + 1], P[3 * o + 2]); if (tag) nt.push(TG[o]); if (fdir) nf.push(fdir[3 * o], fdir[3 * o + 1], fdir[3 * o + 2]); } ni.push(map[o]); }
  // chiusura dei bordi aperti (dentro l'osso) con un ventaglio; non quelli sul piano di taglio della coscia
  const cnt = new Map(), dir = new Map(); for (let t = 0; t < ni.length; t += 3) for (let r = 0; r < 3; r++) { const a = ni[t + r], b = ni[t + (r + 1) % 3], k = Math.min(a, b) + '_' + Math.max(a, b); cnt.set(k, (cnt.get(k) || 0) + 1); dir.set(k, [a, b]); }
  const next = new Map(); for (const [k, c] of cnt) if (c === 1) { const [a, b] = dir.get(k); next.set(b, a); }
  const visti = new Set(); let loops = 0;
  for (const s0 of next.keys()) {
    if (visti.has(s0)) continue; const L = []; let v = s0; while (!visti.has(v) && next.has(v)) { visti.add(v); L.push(v); v = next.get(v); }
    if (L.length < 3 || L.every(q => Math.abs(np[3 * q + 1]) > 19)) continue; loops++; // i bordi sul piano di taglio hanno già la loro sezione: un ventaglio la duplicherebbe
    const c = np.length / 3, m = [0, 1, 2].map(k => L.reduce((s, q) => s + np[3 * q + k], 0) / L.length); np.push(...m);
    if (tag) nt.push(Math.round(L.reduce((s, q) => s + nt[q], 0) / L.length));
    if (fdir) nf.push(...[0, 1, 2].map(k => Math.round(L.reduce((s, q) => s + nf[3 * q + k], 0) / L.length)));
    for (let j = 0; j < L.length; j++) ni.push(L[j], L[(j + 1) % L.length], c);
  }
  setMesh(nome, { pos: Float32Array.from(np), idx: Uint32Array.from(ni), tag: tag ? Uint8Array.from(nt) : null, fdir: fdir ? Int8Array.from(nf) : null });
  log(`taglio ${nome}: ${nv} → ${np.length / 3} vertici, ${loops} bordi chiusi`);
}

const fasce = new Map(); // intervallo verticale fisso per struttura
// direzione di uscita più breve: gradiente della distanza con segno (A: distanza da fuori, B: da dentro)
const gradS = (A, B, x, y, z, e = 0.05) => { const f = (a, b, c) => sample(A, a, b, c) - sample(B, a, b, c); const g = [f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)]; const l = Math.hypot(...g); return l > 1e-6 ? g.map(v => v / l) : null; };
const fascia = (key, names) => { // fasce di BIN lungo y che coprono tutte le strutture del gruppo
  if (!fasce.has(key)) { let a = Infinity, b = -Infinity; for (const n of names) { const { pos, nv } = REAL(n); for (let i = 0; i < nv; i++) { a = Math.min(a, pos[3 * i + 1]); b = Math.max(b, pos[3 * i + 1]); } }
    fasce.set(key, [a - 1, Math.ceil((b - a + 2) / BIN) + 1]); }
  const [y0, nb] = fasce.get(key); return { nb, bin: y => clamp((y - y0) / BIN, 0, nb - 1) };
};
// applica a ogni vertice la traslazione della sua fascia (ampiezza A lungo le direzioni Dx, Dy, Dz)
function trasla(name, bin, A, Dx, Dy, Dz, nb) {
  const { pos, nv } = REAL(name), out = new Float32Array(pos);
  for (let i = 0; i < nv; i++) {
    const f = bin(pos[3 * i + 1]), k0 = Math.floor(f), k1 = Math.min(nb - 1, k0 + 1), u = f - k0, lerp = a => a[k0] * (1 - u) + a[k1] * u;
    const a = lerp(A); if (Math.abs(a) < 1e-4) continue;
    const v = [lerp(Dx), lerp(Dy), lerp(Dz)], l = Math.hypot(...v); if (l < 1e-9) continue;
    for (let c = 0; c < 3; c++) out[3 * i + c] += v[c] / l * a;
  }
  setPos(name, out);
}
function sezioni(R) {
  const tot = new Map(), gruppi = R.insieme ? [R.sposta] : R.sposta.map(n => [n]);
  for (let pass = 0; pass < PASSATE; pass++) {
    const SO = new Uint8Array(N); for (const n of R.rif) or(SO, solid(n)); const DO = edt(SO), DOi = R.esci ? edt(SO, true) : null;
    let any = false, maxA = 0;
    for (const G of gruppi) {
      G.forEach(keep);
      const key = G.join('+'), { nb, bin } = fascia(key, G);
      const need = new Float64Array(nb), D = [new Float64Array(nb), new Float64Array(nb), new Float64Array(nb)];
      for (const name of G) {
        const { pos, nv } = REAL(name);
        for (let i = 0; i < nv; i++) {
          const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; if (!ZONA(y) || (R.dove && !R.dove(y))) continue;
          if (sample(DO, x, y, z) >= MARGINE) continue;
          // direzioni possibili: indietro; oppure lungo la normale all'osso (fuori/dentro) o, se più breve, lungo l'asse medio-laterale
          const n = normal(x, y, z), cand = R.dir ? [R.dir] : (R.modo === 'dietro' ? [[0, 0, -1]] : R.modo === 'fuori' ? [n, [Math.sign(x), 0, 0]] : [n.map(v => -v)]).concat(R.dirs || []);
          if (R.esci) { const g = gradS(DO, DOi, x, y, z); if (g) cand.push(g); } // uscita più breve dal riferimento
          let t = Infinity, d = null;
          for (const c of cand) { let u = 0.02; for (; u <= TMAX; u += 0.02) if (sample(DO, x + c[0] * u, y + c[1] * u, z + c[2] * u) >= MARGINE) break; if (u <= TMAX && u < t) { t = u; d = c; } }
          if (!d) continue;
          const b = Math.round(bin(y)); need[b] = Math.max(need[b], t); for (let k = 0; k < 3; k++) D[k][b] += d[k] * t;
        }
        // anche il caso inverso: punti del riferimento racchiusi dentro la struttura (legamento sottile dentro un tendine spesso)
        const SMs = solid(name), DMi = edt(SMs, true), DMo = R.esci ? edt(SMs) : null;
        for (const rn of R.rif) { const Q = REAL(rn);
          for (let i = 0; i < Q.nv; i++) {
            const x = Q.pos[3 * i], y = Q.pos[3 * i + 1], z = Q.pos[3 * i + 2]; if (!ZONA(y) || (R.dove && !R.dove(y))) continue;
            if (sample(DMi, x, y, z) < 0.03) continue;
            const n = normal(x, y, z), cand = R.dir ? [R.dir] : (R.modo === 'dietro' ? [[0, 0, -1]] : R.modo === 'fuori' ? [n, [Math.sign(x), 0, 0]] : [n.map(v => -v)]).concat(R.dirs || []);
            if (R.esci) { const g = gradS(DMo, DMi, x, y, z); if (g) cand.push(g.map(v => -v)); }
            let t = Infinity, d = null;
            for (const c of cand) { let u = 0.02; for (; u <= TMAX; u += 0.02) if (sample(DMi, x - c[0] * u, y - c[1] * u, z - c[2] * u) <= 0) break; if (u <= TMAX && u + MARGINE < t) { t = u + MARGINE; d = c; } }
            if (!d) continue;
            const b = Math.round(bin(y)); need[b] = Math.max(need[b], t); for (let k = 0; k < 3; k++) D[k][b] += d[k] * t;
          } }
      }
      if (Math.max(...need) < 0.01) continue; any = true;
      const s = R.sigma / BIN, A = blur(inviluppo(need, s), s / 4), Dx = blur(D[0], 3 * s), Dy = blur(D[1], 3 * s), Dz = blur(D[2], 3 * s); // direzione molto regolare
      const T0 = tot.get(key) || new Float64Array(nb);
      for (let k = 0; k < nb; k++) { A[k] = Math.min(A[k], Math.max(0, R.max - T0[k])); T0[k] += A[k]; maxA = Math.max(maxA, T0[k]); }
      tot.set(key, T0);
      for (const name of G) trasla(name, bin, A, Dx, Dy, Dz, nb);
    }
    log(`${R.sposta.join('+')} ${R.modo} rispetto a ${R.rif.join('+')}, passata ${pass + 1}: spostamento massimo ${(maxA * 10).toFixed(1)} mm`);
    if (!any) break;
  }
}

// avvicina la struttura al riferimento finché lo spazio tra le due è `gap` (con `entrambi` anche allontana se vi entra):
// per ogni fascia la distanza minima dal riferimento; il profilo è un inviluppo inferiore gaussiano, così nessuna
// sezione supera la propria distanza (niente compenetrazioni) e il decorso resta dolce
function aderisci(R) {
  const gap = typeof R.gap === 'function' ? R.gap : () => R.gap, tot = new Map(), gruppi = R.insieme ? [R.sposta] : R.sposta.map(n => [n]);
  for (let pass = 0; pass < PASSATE; pass++) {
    const SO = new Uint8Array(N); for (const n of R.rif) or(SO, solid(n)); const DO = edt(SO), DI = edt(SO, true);
    let maxA = 0;
    for (const G of gruppi) {
      G.forEach(keep);
      const key = G.join('+'), { nb, bin } = fascia(key, G);
      const dmin = new Float64Array(nb).fill(Infinity), D = [new Float64Array(nb), new Float64Array(nb), new Float64Array(nb)], arg = new Array(nb).fill(null), vuota = new Uint8Array(nb).fill(1);
      for (const name of G) { const { pos, nv } = REAL(name);
        for (let i = 0; i < nv; i++) { const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; vuota[Math.round(bin(y))] = 0; if (!ZONA(y) || !R.dove(y)) continue;
          const b = Math.round(bin(y)), d = sample(DO, x, y, z) - sample(DI, x, y, z) - gap(y); if (d < dmin[b]) { dmin[b] = d; arg[b] = [x, y, z]; } } }
      // vertici del riferimento già dentro la struttura (riferimento sottile tra vertici radi): lì non ci si avvicina oltre
      const dent = new Float64Array(nb);
      for (const name of G) { const DMi = edt(solid(name), true);
        for (const rn of R.rif) { const Q = REAL(rn); for (let i = 0; i < Q.nv; i++) { const y = Q.pos[3 * i + 1]; if (!ZONA(y) || !R.dove(y)) continue;
          const d = sample(DMi, Q.pos[3 * i], y, Q.pos[3 * i + 2]); if (d > 0.02) { const b = Math.round(bin(y)); dent[b] = Math.max(dent[b], d + gap(y)); } } } }
      const m = new Float64Array(nb);
      for (let b = 0; b < nb; b++) { if (!arg[b]) continue; const v = Math.min(dmin[b], -dent[b]); m[b] = R.entrambi ? v : Math.max(0, v);
        const g = gradS(DO, DI, ...arg[b]); if (g) for (let k = 0; k < 3; k++) D[k][b] -= g[k]; }
      const s = R.sigma / BIN, pos_ = m.map(v => Math.max(0, v)), neg = m.map(v => Math.max(0, -v)), M = Math.max(...pos_);
      const E = inviluppo(pos_.map((v, k) => vuota[k] ? 0 : M - v + 1e-9), s); // inviluppo inferiore: A ≤ m in ogni fascia occupata
      const A = Float64Array.from(pos_, (_, k) => Math.max(0, M - E[k])), B = inviluppo(neg, s);
      const T0 = tot.get(key) || new Float64Array(nb);
      for (let k = 0; k < nb; k++) { A[k] = clamp(A[k] - B[k], -R.max - T0[k], R.max - T0[k]); T0[k] += A[k]; maxA = Math.max(maxA, Math.abs(T0[k])); }
      tot.set(key, T0);
      const Dx = blur(D[0], 3 * s), Dy = blur(D[1], 3 * s), Dz = blur(D[2], 3 * s);
      for (const name of G) trasla(name, bin, A, Dx, Dy, Dz, nb);
    }
    log(`${R.sposta.join('+')} aderisce a ${R.rif.join('+')}, passata ${pass + 1}: spostamento massimo ${(maxA * 10).toFixed(1)} mm`);
  }
}

// dopo la giunzione mio-tendinea il tag (0 muscolo … 200 tendine) non torna a scendere fino all'inserzione:
// dall'alto verso il basso il valore medio per fascia non può calare (massimo progressivo)
function tendine({ nomi }) {
  for (const nome of nomi) {
    const { pos, idx, nv } = REAL(nome), { tag, fdir } = attrs(nome), T = Uint8Array.from(tag), acc = new Map(), fb = y => Math.floor(y * 4);
    for (let i = 0; i < nv; i++) { const y = pos[3 * i + 1]; if (y > 2 || T[i] >= 250) continue; const b = fb(y), a = acc.get(b) || [0, 0]; a[0] += T[i]; a[1]++; acc.set(b, a); }
    const run = new Map(); let mx = 0; for (const b of [...acc.keys()].sort((p, q) => q - p)) { const [s, n] = acc.get(b); mx = Math.max(mx, s / n); run.set(b, mx); }
    let n = 0; for (let i = 0; i < nv; i++) { const b = fb(pos[3 * i + 1]), r = run.get(b); if (r === undefined || T[i] >= 250) continue;
      const [s, c] = acc.get(b); if (s / c < r - 5 && T[i] < r) { T[i] = Math.round(r); n++; } } // solo dove il colore ricade verso il muscolo
    setMesh(nome, { pos: new Float32Array(pos), idx: Uint32Array.from(idx), tag: T, fdir: fdir && Int8Array.from(fdir) });
    log(`tendine ${nome}: ${n} vertici distali ricolorati come tendine`);
  }
}

// allunga il tratto distale (sotto y0) fino a yFine, con un raccordo dolce
function allunga({ nome, y0, yFine }) {
  keep(nome);
  const { pos, nv } = REAL(nome), P = new Float32Array(pos); let ym = Infinity; for (let i = 0; i < nv; i++) ym = Math.min(ym, pos[3 * i + 1]);
  const k = (y0 - yFine) / (y0 - ym) - 1, e = 0.3;
  for (let i = 0; i < nv; i++) { const t = y0 - P[3 * i + 1]; P[3 * i + 1] -= k * 0.5 * (t + Math.sqrt(t * t + e * e)); }
  setPos(nome, P); log(`${nome}: estremità distale da y ${ym.toFixed(2)} a ${yFine}`);
}

// spostamento per sezioni di un gruppo (già traslato dalle regole precedenti) sostituito dalla sua approssimazione
// ai minimi quadrati con una B-spline cubica uniforme (nodi ogni `nodo` cm tra yGiu e ySu) penalizzata sulla curvatura
// (P-spline, peso `rigidezza`; ogni sezione pesa uguale): il gradino e le ondulazioni del profilo diventano una rampa
// lunga (da y ~9 a ~1) e una curva unica; sopra ySu lo spostamento è nullo (nodi fissi a zero).
// yVincolo (facoltativo): approssima il profilo solo sotto questa quota, lasciando la spline libera più in alto.
// Ogni sezione resta rigida (traslazione).
function liscia({ nomi, nodo, ySu, yGiu, yVincolo = ySu, rigidezza = 0 }) {
  const key = nomi.join('+'), { nb, bin } = fascia(key, nomi), S = [0, 1, 2].map(() => new Float64Array(nb)), C = new Float64Array(nb);
  for (const n of nomi) { const p = REAL(n).pos, o = orig.get(n); for (let i = 0; i < p.length; i += 3) { const b = Math.round(bin(o[i + 1])); for (let k = 0; k < 3; k++) S[k][b] += p[i + k] - o[i + k]; C[b]++; } }
  const nk = Math.ceil((ySu - yGiu) / nodo) + 3, B = t => { t = Math.abs(t); return t < 1 ? (4 - 6 * t * t + 3 * t * t * t) / 6 : t < 2 ? (2 - t) ** 3 / 6 : 0; };
  const base = y => Array.from({ length: nk }, (_, j) => B((y - yGiu) / nodo - (j - 1)));
  const libero = j => yGiu + (j - 1) * nodo < ySu - nodo; // i nodi in alto restano a zero
  const fasce_ = []; for (let b = 0; b < nb; b++) if (C[b]) fasce_.push(b);
  const yOf = new Float64Array(nb); { let y = -30; for (let b = 0; b < nb; b++) { while (bin(y) < b && y < 30) y += BIN / 4; yOf[b] = y; } }
  const fit = k => { // minimi quadrati pesati per numero di vertici, piccola regolarizzazione
    const A = Array.from({ length: nk }, () => new Float64Array(nk)), r = new Float64Array(nk);
    let W = 0;
    for (const b of fasce_) { const y = yOf[b]; if (y < yGiu - 1 || y > yVincolo) continue; const f = base(y), w = 1, d = S[k][b] / C[b]; W += w; // ogni sezione pesa uguale
      for (let i = 0; i < nk; i++) { if (!f[i]) continue; r[i] += w * f[i] * d; for (let j = 0; j < nk; j++) A[i][j] += w * f[i] * f[j]; } }
    const lam = rigidezza * W / nk; // differenze seconde dei coefficienti
    for (let i = 1; i < nk - 1; i++) { const q = [i - 1, i, i + 1], c = [1, -2, 1]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) A[q[a]][q[b]] += lam * c[a] * c[b]; }
    for (let i = 0; i < nk; i++) { A[i][i] += 1e-6; if (!libero(i)) { A[i].fill(0); A[i][i] = 1; r[i] = 0; } }
    for (let i = 0; i < nk; i++) { let p = i; for (let q = i + 1; q < nk; q++) if (Math.abs(A[q][i]) > Math.abs(A[p][i])) p = q; [A[i], A[p]] = [A[p], A[i]]; [r[i], r[p]] = [r[p], r[i]];
      for (let q = i + 1; q < nk; q++) { const m = A[q][i] / A[i][i]; for (let j = i; j < nk; j++) A[q][j] -= m * A[i][j]; r[q] -= m * r[i]; } }
    const c = new Float64Array(nk); for (let i = nk - 1; i >= 0; i--) { let v = r[i]; for (let j = i + 1; j < nk; j++) v -= A[i][j] * c[j]; c[i] = v / A[i][i]; }
    return y => { if (y >= ySu) return 0; const f = base(clamp(y, yGiu, ySu)); let v = 0; for (let i = 0; i < nk; i++) v += c[i] * f[i]; return v; };
  };
  const F = [0, 1, 2].map(fit);
  for (const n of nomi) { const o = orig.get(n), P = new Float32Array(o.length); for (let i = 0; i < o.length; i += 3) for (let k = 0; k < 3; k++) P[i + k] = o[i + k] + F[k](o[i + 1]); setPos(n, P); }
  log(`${key}: spostamento liscio (nodi ogni ${nodo} cm)`, process.argv.includes('--dettaglio') ? [14, 12, 10, 8, 6, 4, 2, 0, -1, -2, -3, -4].map(y => { const b = Math.round(bin(y)); return `y${y}: prima [${[0, 1, 2].map(k => (C[b] ? S[k][b] / C[b] * 10 : 0).toFixed(1))}] dopo [${F.map(f => (f(y) * 10).toFixed(1))}] mm`; }).join('\n  ') : '');
}

for (const R of REGOLE) if (!(R.tipo === 'liscia' && process.argv.includes('--senza-liscia'))) ({ taglia, sez: sezioni, aderisci, tendine, allunga, liscia })[R.tipo](R);
for (const [name, o] of orig) { const p = REAL(name).pos; if (p.length !== o.length) { console.log(`  ${name}: topologia modificata`); continue; }
  let m = 0; for (let i = 0; i < p.length; i += 3) m = Math.max(m, Math.hypot(p[i] - o[i], p[i + 1] - o[i + 1], p[i + 2] - o[i + 2]));
  const pr = {}; for (let i = 0; i < p.length; i += 3) { const k = Math.round(o[i + 1]); pr[k] = Math.max(pr[k] || 0, Math.hypot(p[i] - o[i], p[i + 1] - o[i + 1], p[i + 2] - o[i + 2])); }
  console.log(`  ${name}: spostamento massimo ${(m * 10).toFixed(1)} mm`, process.argv.includes('--dettaglio') ? Object.entries(pr).filter(([, v]) => v > 0.05).sort((a, b) => b[0] - a[0]).map(([k, v]) => `y${k}:${(v * 10).toFixed(0)}`).join(' ') : ''); }
rapporto('Dopo:');
if (process.argv.includes('--dettaglio')) for (const [a0, b0] of CONTROLLO) for (const [a, b] of [[a0, b0], [b0, a0]]) { // livelli dei residui
  const Db = edt(solid(b), true), A = REAL(a), h = {};
  for (let i = 0; i < A.nv; i++) { const y = A.pos[3 * i + 1]; if (y > -8 && y < 5 && sample(Db, A.pos[3 * i], y, A.pos[3 * i + 2]) > 0.05) h[Math.round(y)] = (h[Math.round(y)] || 0) + 1; }
  if (Object.keys(h).length) console.log(`  ${a} in ${b}:`, Object.entries(h).sort((p, q) => q[0] - p[0]).map(([k, v]) => `y${k}:${v}`).join(' '));
}
if (PROVA) process.exit(0);
saveFile(repack());
