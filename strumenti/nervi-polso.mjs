/* Nervi del polso (modelli/polso-dito-3d.html, sezione polso).

   Uso (dalla cartella del progetto):
     node strumenti/nervi-polso.mjs              → riscrive i tubi dei nervi nel sorgente della pagina
     node strumenti/nervi-polso.mjs verifica     → elenca le compenetrazioni dei nervi, senza scrivere
     MODELLO=/tmp/copia.html node strumenti/nervi-polso.mjs   → lavora su una copia

   1) Piano sottocutaneo dorsale. Il ramo superficiale del nervo radiale, dopo essere uscito tra brachioradiale ed
      ECRL, decorre nel sottocute sopra il I compartimento (APL, EPB) e il retinacolo degli estensori, e incrocia
      superficialmente l'EPL nella tabacchiera anatomica (Abrams RA et al., J Hand Surg Am 1992; Robson AJ et al.,
      J Hand Surg Eur 2008). Il ramo cutaneo dorsale dell'ulnare gira attorno al margine ulnare sotto il FCU e poi
      è sottocutaneo, superficiale al retinacolo e alla guaina dell'ECU (Botte MJ et al., J Hand Surg Am 1990).
      I due tubi vengono spinti fuori da retinacoli, guaine, tendini, muscoli e ossa (almeno GIOCO oltre il raggio)
      restando sotto la cute e scansando le vene superficiali (cefalica, basilica, arcata dorsale), a cui passano
      sopra dove si incrociano. Le linee sono trattate come fili tesi (smussatura e vincoli alternati), senza spigoli.
   2) Divisioni. Un ramo non spunta più dall'estremità di un cilindro: nasce dentro il tronco, prossimalmente al
      punto di divisione, come un fascicolo affiancato agli altri (spostato verso il lato da cui uscirà), corre
      parallelo per un tratto e poi diverge con una curva dolce; l'origine del ramo è assottigliata (opzione `ini`
      di `tube`). Nelle divisioni terminali il tronco si appiattisce e si assottiglia verso la fine (opzioni `fin`,
      `piatto`), così i rami ne sembrano la continuazione. Divisioni nella tabella DIV.
   3) Cute. Vicino allo stiloide radiale e sul dorso ulnare la cute BodyParts3D dista dal retinacolo e dalle guaine
      meno del diametro del nervo: lì la cute si solleva con un rilievo dolce sopra il nervo (che infatti è palpabile),
      in modo che il nervo resti almeno SOTTO_CUTE sotto la superficie. Si riparte dalla cute della revisione ORIGINALE.
   0) Versante volare (prima di tutto): mediano, ramo motorio, ulnare, ramo profondo dell'ulnare, nervi digitali comuni e
      ramo superficiale dell'ulnare fuori da tendini, muscoli, retinacoli e ossa. Lo spostamento di ogni nervo è una
      B-spline cubica nel piano di sezione di ogni punto (decorso liscio per costruzione, punti che non scorrono lungo il
      nervo); il mediano segue una guida anatomica fino al tunnel carpale (GUIDA) e si divide al margine distale del
      retinacolo (ACCORCIA, RIDISEGNA). Ciclo completo: questo script, `retinacoli-polso.mjs volari`, di nuovo questo.
   Riparte sempre dai tubi e dalla cute della revisione ORIGINALE, quindi si può rilanciare. Va rilanciato se cambiano retinacoli,
   guaine o tendini dorsali; dopo, se serve, si rilanciano `retinacoli-polso.mjs` e `radio-volare-polso.mjs`, che
   leggono i tubi dal sorgente. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.MODELLO ||= resolve(ROOT, 'modelli', 'polso-dito-3d.html');
const G = await import('./lib-modello.mjs');
const { man, log, sstep, griglia, campo, sample } = G;

/* ============ Parametri ============ */
const ORIGINALE = '4c65cdd';                      // revisione con i tubi dei nervi originali (punto di partenza)
const FILE_REPO = 'modelli/polso-dito-3d.html';
const NERVI = ['nmed', 'nmedmot', 'ndig', 'nuln', 'nulnsup', 'nulnprof', 'nulndors', 'npalm', 'nradsup'];
const CARPO = ['scafoide', 'semilunare', 'piramidale', 'pisiforme', 'trapezio', 'trapezoide', 'capitato', 'uncinato', 'mc1', 'mc2', 'mc3', 'mc4', 'mc5'];
// piani profondi del sottocute dorsale: il nervo resta sopra tutti
const PROFONDI = ['retext', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'apl', 'epb', 'epl', 'ecrl', 'ecrb', 'edc', 'eip', 'edm', 'ecu', 'br', 'fcu',
  'radio', 'ulna', ...CARPO, 'apb', 'fpb', 'op', 'adm', 'fdm', 'odm', 'iod', 'add'];
const SOTTOCUTE = { nradsup: 'tutti', nulndors: 'tutti' };   // nervi da portare nel sottocute (tutti i loro tubi)
const VENE_SUP = ['vcef', 'vbas', 'varco'];   // vene sottocutanee del dorso: il nervo le scansa
const GIOCO = 0.04;      // distanza minima dai piani profondi, oltre il raggio (cm)
const SOTTO_CUTE = 0.05; // distanza dalla superficie cutanea, oltre il raggio (cm): dove il sottocute è più sottile
                         // la cute si solleva con un rilievo dolce sopra il nervo (sigma RILIEVO cm)
const RILIEVO = 0.6;
const PASSO = 0.1;   // passo dei punti dei tubi riposizionati (cm)
const SOTTO_CUTE_TESSUTI = 0.04;   // anche retinacolo, guaine e tendini dorsali restano almeno così sotto la cute (cm)
const TESSUTI = ['retext', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'apl', 'epb', 'epl', 'ecrl', 'ecrb', 'edc', 'eip', 'edm', 'ecu'];
// divisioni: genitore (id, indice del tubo), figlio (id, indice), lunghezza del tratto affiancato nel tronco (cm),
// lunghezza del raccordo sul decorso originale (cm), quota dello spostamento laterale (frazione dello spazio libero),
// ricorrente (cm): il ramo nasce di lato a questa distanza prima dell'origine e va subito verso il suo decorso
const DIV = [
  { da: ['nmed', 0], a: ['npalm', 0], aff: 1.0, racc: 1.2, k: 0.8 },
  { da: ['nmed', 0], a: ['nmedmot', 0], aff: 0.3, racc: 0.6, k: 0.75, ricorrente: 0.35 },
  { da: ['nmed', 0], a: ['ndig', 0], aff: 1.4, racc: 1.4, k: 0.75 },
  { da: ['nmed', 0], a: ['ndig', 1], aff: 1.1, racc: 1.2, k: 0.55 },
  { da: ['nmed', 0], a: ['ndig', 2], aff: 1.25, racc: 0.7, k: 0.3 },
  { da: ['nuln', 0], a: ['nulndors', 0], aff: 1.1, racc: 1.4, k: 0.8 },
  { da: ['nuln', 0], a: ['nulnsup', 0], aff: 0.9, racc: 1.0, k: 0.7 },
  { da: ['nuln', 0], a: ['nulnprof', 0], aff: 0.8, racc: 0.6, k: 0.7 },
  { da: ['nulnsup', 0], a: ['nulnsup', 1], aff: 0.8, racc: 1.0, k: 0.8 },
  { da: ['nradsup', 0], a: ['nradsup', 1], aff: 1.0, racc: 1.2, k: 0.75 },
  { da: ['nradsup', 0], a: ['nradsup', 2], aff: 1.1, racc: 1.2, k: 0.75 },
];
// tronchi che terminano dividendosi: assottigliamento finale [raggio finale, lunghezza] e appiattimento [rapporto, lunghezza]
const FINE = { 'nmed:0': { fin: [0.3, 1.3], piatto: [0.7, 2.0] }, 'nuln:0': { fin: [0.25, 0.9], piatto: [0.8, 1.4] }, 'nradsup:0': { fin: [0.25, 1.0], piatto: [0.8, 1.2] } };

/* ============ Utilità ============ */
const fmt = v => +v.toFixed(3);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nrm = a => mul(a, 1 / (len(a) || 1));
const reTube = /tube\(\[\[(.*?)\]\],([\d.]+)(?:,(\{[^}]*\}))?\)/g;
let SORGENTE0 = null;
function rigaOriginale(id) {
  SORGENTE0 ??= execFileSync('git', ['show', `${ORIGINALE}:${FILE_REPO}`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8');
  const r = SORGENTE0.split('\n').find(l => l.startsWith(`{id:'${id}',`)); if (!r) throw new Error('riga originale non trovata: ' + id);
  return r;
}
const leggi = riga => [...riga.matchAll(reTube)].map(m => ({ pts: m[1].split('],[').map(s => s.split(',').map(Number)), r: +m[2], o: {} }));
function sostituisciRiga(id, nuova) {
  const righe = G.M.html.split('\n'), i = righe.findIndex(l => l.startsWith(`{id:'${id}',`));
  if (i < 0) throw new Error('riga non trovata: ' + id);
  righe[i] = nuova; G.M.html = righe.join('\n');
}
// lunghezze cumulate lungo la polilinea; punto e tangente a una data ascissa
const ascisse = P => { const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + len(sub(P[i], P[i - 1]))); return s; };
function aAscissa(P, S, s) {
  if (s <= 0) return { p: P[0], t: nrm(sub(P[1], P[0])) };
  for (let i = 1; i < P.length; i++) if (S[i] >= s) { const u = (s - S[i - 1]) / (S[i] - S[i - 1] || 1), d = sub(P[i], P[i - 1]); return { p: add(P[i - 1], mul(d, u)), t: nrm(d) }; }
  return { p: P.at(-1), t: nrm(sub(P.at(-1), P.at(-2))) };
}
// punto più vicino di una polilinea fitta
function vicino(Q, p) { let j = 0, d = Infinity; Q.forEach((c, i) => { const e = len(sub(c, p)); if (e < d) { d = e; j = i; } }); return { q: Q[j], d, j }; }
// polilinea ricampionata a passo costante (estremi compresi)
function ricampiona(P, passo) {
  const S = ascisse(P), L = S.at(-1), n = Math.max(2, Math.round(L / passo)), out = [];
  for (let q = 0; q <= n; q++) out.push(aAscissa(P, S, L * q / n).p);
  return out;
}
// smussatura dei punti interni, estremi fissi
function smussa(P, pass, fissi = new Set()) {
  for (let p = 0; p < pass; p++) { const B = P.map(v => v.slice());
    for (let i = 1; i < P.length - 1; i++) if (!fissi.has(i)) for (const k of [0, 1, 2]) B[i][k] = (P[i - 1][k] + 2 * P[i][k] + P[i + 1][k]) / 4;
    P.splice(0, P.length, ...B); }
}

/* ============ 1) Sottocute dorsale ============ */
const RICHIESTE = [];   // punti dell'asse troppo vicini alla cute: { p, need (cm), n (normale cutanea) }
function sottocute(T) {
  for (const id of Object.keys(SOTTOCUTE)) {
    const tubi = T[id], tutti = tubi.flatMap(t => t.pts);
    const lo = [0, 1, 2].map(k => Math.min(...tutti.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...tutti.map(p => p[k])));
    griglia(lo, hi, 0.03, 0.5);
    const nomi = PROFONDI.filter(n => man.meshes.some(m => m.n === n));
    const Fp = campo(nomi).F, Fc = campo(['cute']).F;
    const gr = (F, p) => { const e = 0.05, g = [0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += e; b[k] -= e; return sample(F, ...a) - sample(F, ...b); }); return nrm(g); };
    // direzione di risalita: verso la cute (normale della superficie cutanea), non lungo il gradiente dei piani profondi,
    // che tra due tendini vicini ha un crinale e lascerebbe il nervo incastrato tra i due
    const su = p => { const a = gr(Fc, p), b = gr(Fp, p); return nrm(add(mul(a, 0.8), mul(b, 0.2))); };
    // filo teso: punti ogni PASSO cm; a ogni giro smussatura, poi la cute tira dentro (vincolo morbido) e i piani
    // profondi spingono fuori (vincolo rigido): la linea scavalca i rilievi senza spigoli. Il tronco si elabora insieme
    // al primo ramo, come un'unica linea; gli altri rami partono dal tronco già fissato
    const filo = (P, r, fissi) => {
      const tgt = r + GIOCO, tgtC = r + SOTTO_CUTE, y0 = P.map(p => p[1]);
      const vincoli = () => { for (let i = fissi; i < P.length; i++) {
        const dc = sample(Fc, ...P[i]); if (dc > -tgtC) P[i] = add(P[i], mul(gr(Fc, P[i]), -(dc + tgtC) * 0.03));
        // vena: il nervo se ne allontana di lato o le passa sopra (mai sotto: sotto ci sono i piani profondi);
        // dove i due si incrociano il nervo scavalca la vena e la cute si solleva un poco
        for (const v of VENE) { const { q, d } = vicino(v.pts, P[i]), m = r + v.r + GIOCO; if (d >= m) continue;
          const n = su(P[i]), w = sub(P[i], q), dir = nrm(add(w, mul(n, Math.abs(dot(w, n)) - dot(w, n) + 0.3 * m)));
          P[i] = add(P[i], mul(dir, (m - d) * 0.7)); }
        if (i === 0 || i === P.length - 1) P[i][1] = y0[i];   // estremi sul piano di sezione o sull'origine
        for (let q = 0; q < 3; q++) { const d = sample(Fp, ...P[i]); if (d < tgt) P[i] = add(P[i], mul(su(P[i]), tgt - d + 0.002)); } } };
      const fx = new Set(Array.from({ length: fissi }, (_, i) => i));
      for (let it = 0; it < 1500; it++) { smussa(P, 1, fx); vincoli(); }
      return P;
    };
    // vene superficiali (tubi della pagina): il nervo le scansa, non le attraversa
    const VENE = VENE_SUP.flatMap(v => leggi(G.M.html.split('\n').find(l => l.startsWith(`{id:'${v}',`)))).map(t => ({ pts: ricampiona(t.pts, 0.03), r: t.r }));
    const tr = ricampiona(tubi[0].pts, PASSO), k = tr.length - 1, R = tubi.map(t => ricampiona(t.pts, PASSO));
    if (tubi.length === 1) tubi[0].pts = filo(tr, tubi[0].r, 0);
    else {
      const A = filo([...tr, ...R[1].slice(1)], Math.min(tubi[0].r, tubi[1].r), 0);
      tubi[0].pts = A.slice(0, k + 1); tubi[1].pts = A.slice(k);
      for (let b = 2; b < tubi.length; b++) tubi[b].pts = filo([...tubi[0].pts, ...R[b].slice(1)], tubi[b].r, k + 1).slice(k);
    }
    // sollevamento della cute richiesto lungo l'asse (ogni 0,5 mm): profondità sotto la cute almeno r + SOTTO_CUTE,
    // nella direzione della normale cutanea
    for (const { pts, r } of tubi) for (let s = 0; s < pts.length - 1; s++) {
      const n = Math.max(1, Math.ceil(len(sub(pts[s + 1], pts[s])) / 0.05));
      for (let q = 0; q < n; q++) { const p = add(pts[s], mul(sub(pts[s + 1], pts[s]), q / n)), need = sample(Fc, ...p) + r + SOTTO_CUTE;
        if (need > 0) { const g = [0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += 0.05; b[k] -= 0.05; return sample(Fc, ...a) - sample(Fc, ...b); }); RICHIESTE.push({ p, need, n: nrm(g) }); } }
    }
    log(id, 'portato nel sottocute');
  }
}

/* ============ 3) Cute sollevata sopra i nervi sottocutanei ============ */
function cute() {
  // anche i vertici di retinacolo, guaine e tendini che arrivano alla cute (o la superano: nella cute BodyParts3D il
  // sottocute sopra lo stiloide radiale è quasi assente)
  griglia([-4.6, -3.5, -2.6], [2.6, 3.5, 2.6], 0.03, 0.2); const Fc = campo(['cute']).F;
  for (const n of TESSUTI) { if (!man.meshes.some(m => m.n === n)) continue; const { pos } = G.REAL(n);
    for (let i = 0; i < pos.length; i += 3) { const p = [pos[i], pos[i + 1], pos[i + 2]]; if (Math.abs(p[1]) > 3.4) continue;
      const need = sample(Fc, ...p) + SOTTO_CUTE_TESSUTI;
      if (need > 0) { const g = [0, 1, 2].map(k => { const a = p.slice(), b = p.slice(); a[k] += 0.05; b[k] -= 0.05; return sample(Fc, ...a) - sample(Fc, ...b); }); RICHIESTE.push({ p, need, n: nrm(g) }); } } }
  const pos = G.REAL('cute').pos.slice(), nv = pos.length / 3;
  const box = [0, 1, 2].map(k => [Math.min(...RICHIESTE.map(a => a.p[k])) - 1, Math.max(...RICHIESTE.map(a => a.p[k])) + 1]);
  let mx = 0, mossi = 0;
  for (let i = 0; i < nv; i++) {
    const q = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; if (![0, 1, 2].every(k => q[k] > box[k][0] && q[k] < box[k][1])) continue;
    let best = 0, dir = null;
    for (const a of RICHIESTE) { const w = (a.need * 1.3 + 0.02) * Math.exp(-0.5 * (len(sub(q, a.p)) / RILIEVO) ** 2); if (w > best) { best = w; dir = a.n; } }
    if (best < 1e-4) continue;
    for (let k = 0; k < 3; k++) pos[3 * i + k] += dir[k] * best;
    mx = Math.max(mx, best); mossi++;
  }
  G.setPos('cute', pos);
  log('cute sollevata sopra i nervi:', mossi, 'vertici, fino a', (mx * 10).toFixed(1), 'mm');
}

/* ============ 0) Versante volare: nervi fuori da tendini, muscoli e retinacoli ============ */
const VOLARI = { // tubo → strutture da cui deve stare lontano (oltre il raggio)
  'nmed:0': ['retfl', 'fds', 'fdp', 'fpl', 'fcr', 'gfcr', 'pl', 'pq', 'capvol', 'radio', 'ulna', 'semilunare', 'capitato', 'scafoide', 'trapezio'],
  'nmedmot:0': ['retfl', 'apb', 'fpb', 'op', 'trapezio', 'mc1', 'pl'],
  'nuln:0': ['fcu', 'pisiforme', 'retfl', 'tettoguy', 'ulna', 'fds', 'fdp', 'auln'],   // auln: l'arteria gli sta radialmente
  'nulnprof:0': ['uncinato', 'pisiforme', 'fdm', 'odm', 'adm', 'retfl', 'mc5', 'mc4', 'fds', 'fdp', 'fpl', 'lumb', 'iod', 'iop', 'mc3', 'mc2', 'capitato', 'trapezoide', 'fcu', 'auln'],   // non 'add': il ramo profondo termina nell'adduttore del pollice, che innerva
  // nervi digitali comuni: profondi all'aponeurosi palmare (`pl`), sopra i tendini flessori e i lombricali
  // e profondi all'arco palmare superficiale (`auln`, tubo dell'arteria letto dal sorgente attuale)
  'ndig:0': ['pl', 'auln', 'retfl', 'fds', 'fdp', 'lumb', 'mc2', 'mc3', 'mc4', 'add'],
  'ndig:1': ['pl', 'auln', 'retfl', 'fds', 'fdp', 'lumb', 'mc2', 'mc3', 'mc4', 'add'],
  'ndig:2': ['pl', 'auln', 'retfl', 'fds', 'fdp', 'lumb', 'mc2', 'mc3', 'mc4', 'add', 'apb', 'fpb'],
  'nulnsup:0': ['pl', 'auln', 'retfl', 'tettoguy', 'pisiforme', 'adm', 'fdm', 'fds', 'fdp', 'lumb', 'mc4', 'mc5'],
  'nulnsup:1': ['pl', 'auln', 'retfl', 'tettoguy', 'pisiforme', 'adm', 'fdm', 'fds', 'fdp', 'lumb', 'mc4', 'mc5'],
};
// estremi liberi di scorrere sul loro piano: inizio dei tronchi (piano di sezione), fine dei rami digitali e del ramo
// profondo dell'ulnare (che termina nell'adduttore del pollice); tutti gli altri estremi sono origini o divisioni e restano dove sono
const LIBERI = { 'nulnprof:0': [0, 1], 'nmed:0': [1, 0], 'nuln:0': [1, 0], 'ndig:0': [0, 1], 'ndig:1': [0, 1], 'ndig:2': [0, 1], 'nulnsup:0': [0, 1], 'nulnsup:1': [0, 1] };
// nel tunnel carpale il mediano è appiattito (sezione ovale, larga e bassa a parità di area): rapporto altezza/larghezza
// sezione già ovale nell'avambraccio distale (tra FDS, FDP e FCR) e appiattimento progressivo nel tunnel, da prossimale
// (livello del pisiforme) a distale (uncino dell'uncinato), come nella RM normale: [y, rapporto] a tratti, poi di nuovo
// rotondo oltre il margine distale del retinacolo
const TUNNEL = [[1.4, 1], [0.6, 0.7], [-1.0, 0.7], [-2.0, 0.5], [-2.8, 0.5], [-3.4, 1]];
// guida del mediano dall'avambraccio distale al tunnel carpale. Al polso il nervo è ulnare al FCR e radiale al FDS,
// sotto il palmare lungo; nel tunnel sta nella metà radiale, volare ai tendini del FDS di II e III dito, e distalmente
// sale subito sotto il retinacolo dei flessori (Mesgarzadeh M et al., Radiology 1989; Standring S, Gray's Anatomy).
// Il decorso originale è più profondo e radiale (tra FPL e FCR, sotto la guaina del FCR). La guida è il percorso ottimo
// trovato con la programmazione dinamica su sezioni ogni mm (stati x-z ogni 0,4 mm): costo = compenetrazione della
// sezione ovale con tendini, guaina del FCR (con lo spazio per la lamina) e tetto del retinacolo, più la levigatezza,
// con il vincolo di stare ulnare all'asse del FCR. Il nervo vi è portato all'inizio e poi richiamato debolmente;
// le spinte degli ostacoli rifiniscono. Punti [y, x, z] da prossimale a distale
const RACCORDO_GUIDA = 0.8;   // lunghezza dei raccordi tra decorso originale e guida (cm)
// posizione della guida alla quota y e peso (0 fuori, 1 nel tratto guidato)
function guida(chiave, y) {
  const A = GUIDA[chiave]; if (!A || y > A[0][0] + RACCORDO_GUIDA || y < A.at(-1)[0] - RACCORDO_GUIDA) return null;
  const w = sstep(A[0][0] + RACCORDO_GUIDA, A[0][0], y) * sstep(A.at(-1)[0] - RACCORDO_GUIDA, A.at(-1)[0], y);
  let k = 0; while (k < A.length - 2 && y < A[k + 1][0]) k++;
  const u = Math.min(1, Math.max(0, (y - A[k][0]) / (A[k + 1][0] - A[k][0])));
  return { x: A[k][1] + (A[k + 1][1] - A[k][1]) * u, z: A[k][2] + (A[k + 1][2] - A[k][2]) * u, w };
}
const GUIDA = { 'nmed:0': [[1.0, -1.34, 0.95], [0.8, -1.38, 0.95], [0.6, -1.36, 0.95], [0.4, -1.27, 0.95], [0.2, -1.26, 0.95], [0.0, -1.27, 0.96],
  [-0.2, -1.34, 1.01], [-0.4, -1.42, 1.03], [-0.6, -1.46, 1.00], [-0.8, -1.49, 0.99], [-1.0, -1.46, 1.06], [-1.2, -1.38, 1.15], [-1.4, -1.30, 1.27],
  [-1.8, -1.30, 1.21], [-2.2, -1.42, 1.13], [-2.6, -1.74, 1.06]] };
const rtTunnel = y => { if (y >= TUNNEL[0][0] || y <= TUNNEL.at(-1)[0]) return 1; let k = 0; while (y < TUNNEL[k + 1][0]) k++;
  const [ya, a] = TUNNEL[k], [yb, b] = TUNNEL[k + 1]; return a + (b - a) * sstep(ya, yb, y); };
const rEff = (id, y, r) => id === 'nmed' ? r * Math.sqrt(rtTunnel(y)) : r;   // raggio nella direzione volare-dorsale
// sezione ovale del mediano (tronco): punti del contorno nel piano x-z, semiassi larghezza r/√rt e altezza r√rt
const OVALE = [...Array(12).keys()].map(i => i / 12 * 2 * Math.PI);
const contorno = (id, y, r) => id !== 'nmed' ? null : OVALE.map(a => [r / Math.sqrt(rtTunnel(y)) * Math.cos(a), 0, r * Math.sqrt(rtTunnel(y)) * Math.sin(a)]);
// quota (distanza dal campo F meno il raggio) peggiore sul contorno della sezione, e il suo punto
function peggioreContorno(F, id, p, r) {
  const C = contorno(id, p[1], r); if (!C) return { d: sample(F, ...p) - r, q: p, c: [0, 0, 0] };
  let d = 1e9, q = p, c = null; for (const o of C) { const x = add(p, o), e = sample(F, ...x); if (e < d) { d = e; q = x; c = o; } } return { d, q, c };
}
const SOTTO_PL = ['ndig', 'nulnsup'];   // nervi che stanno sempre profondi all'aponeurosi palmare
const Y_PL = -9;   // y distale oltre cui l'aponeurosi palmare si divide in digitazioni e non vincola più i nervi digitali (cm)
const NODI = { 'nmed:0': 1.1, 'nuln:0': 0.8, 'nulnprof:0': 0.45, base: 0.6 };   // passo dei nodi della B-spline dello spostamento (cm): più grande = decorso più disteso
const TENSIONE = 0.15;   // a ogni giro ogni nodo si avvicina alla media dei vicini: spostamento senza ondulazioni
// decorsi di partenza da distendere (passate di smussatura, estremi fissi): il ramo profondo dell'ulnare originale
// attraversa il palmo dritto e poi fa una gobba distale prima di finire contro il II metacarpo; disteso descrive
// un arco regolare a convessità distale, come l'arcata palmare profonda che accompagna
const DISTENDI = { 'nulnprof:0': 60 };
// la lamina profonda del retinacolo attorno alla guaina del FCR è costruita da retinacoli-polso.mjs attorno al
// mediano: qui conta solo il tetto del retinacolo (si ignora la parte entro `dist` cm dalla guaina, il cui spazio
// per la lamina è garantito da EXTRA_V), altrimenti la lamina della revisione precedente terrebbe il nervo dov'era
const SENZA_SETTO = { 'nmed:0': { retfl: ['gfcr', 0.15] } };
// lunghezza (cm) della rampa con cui lo spostamento si annulla verso un estremo vincolato (base 0,8): per l'ulnare,
// che a livello del pisiforme si sposta di qualche mm, una rampa corta darebbe una piega prima della divisione
const RAMPA = { 'nuln:0': 2.0 };
const SPOST_MAX = 1.0;   // spostamento massimo di un punto dal decorso di partenza (cm): evita che un vincolo mal posto scagli il nervo lontano
const GIOCO_V = 0.03;
const GIOCO_DIG = 0.01;   // i nervi digitali passano in un corridoio stretto tra aponeurosi, lombricali e interossei
// gioco ridotto (cm) per singoli tubi e ostacoli: il ramo motorio ricorrente risale nel varco stretto tra il margine
// radiale dell'aponeurosi palmare e l'opponente del pollice, sfiorando l'aponeurosi senza attraversarla
const GIOCO_T = { 'nmedmot:0': { pl: 0.01 } };
// priorità degli ostacoli dove lo spazio non basta (spinta proporzionale alla compenetrazione per il peso): nell'avambraccio
// distale lo spazio tra guaina del FCR e FDP è più stretto del mediano; il compromesso cade sul FDP, su cui il nervo poggia
const PESO_V = { gfcr: 2, auln: 4 };   // auln: sotto l'arco il nervo deve scendere su un tratto breve (la tensione della spline lo trattiene)
// spazio (cm) per la lamina profonda del retinacolo tra il tunnel del FCR e il mediano; la lamina esiste solo sotto il
// retinacolo: rampa in y da Y_SETTO[0] a Y_SETTO[1]
const EXTRA_V = { gfcr: 0.04 }, Y_SETTO = [0.0, -0.6];
// arterie usate come ostacoli (tubi letti dal sorgente attuale, sistemati da `arterie-polso.mjs`): l'arco palmare
// superficiale passa tra aponeurosi e nervi digitali comuni, che gli stanno sempre dorsalmente (come per un telo);
// nell'avambraccio distale e nel canale di Guyon l'arteria ulnare sta radialmente al nervo ulnare (`aulnprof` serve alla
// sola verifica: il ramo profondo dell'arteria evita da sé il ramo profondo del nervo)
const TUBI_V = ['auln', 'aulnprof'];
// direzione d'uscita imposta da un'arteria nel tratto y > y0: il nervo ulnare e il suo ramo superficiale, fino all'uscita
// dal canale di Guyon, si spostano sempre in senso ulnare (l'arteria resta radiale); più distalmente il ramo
// superficiale passa sotto l'arco palmare superficiale (come sotto un telo)
const DIR_V = { 'nuln:0': { auln: { dir: [1, 0, 0], y0: -9 } }, 'nulnsup:0': { auln: { dir: [1, 0, 0], y0: -2.4 } }, 'nulnsup:1': { auln: { dir: [1, 0, 0], y0: -2.4 } } };
function campoTuboPagina(id) {
  const L = G.M.html.split('\n'), a = L.findIndex(l => l.startsWith("if(MODE==='polso')")), riga = L.slice(a).find(l => l.startsWith(`{id:'${id}',`));
  const F = new Float32Array(G.N).fill(1);
  for (const m of riga.matchAll(/tube\(\[\[(.*?)\]\],([\d.]+)(?:,(\{[^}]*\}))?\)/g)) {
    const P = m[1].split('],[').map(s => s.split(',').map(Number)), r0 = +m[2], o = m[3] ? Function('return ' + m[3])() : {}, S = ascisse(P), L0 = S.at(-1);
    const rg = s => { let f = 1; if (o.ini) f *= o.ini[0] + (1 - o.ini[0]) * sstep(0, o.ini[1], s); if (o.fin) f *= o.fin[0] + (1 - o.fin[0]) * sstep(0, o.fin[1], L0 - s); return r0 * f; };
    for (let i = 0; i < P.length - 1; i++) {
      const A = P[i], B = P[i + 1], r = Math.max(rg(S[i]), rg(S[i + 1])), AB = sub(B, A), ab2 = dot(AB, AB) || 1;
      const i0 = [0, 1, 2].map(k => Math.max(0, Math.floor((Math.min(A[k], B[k]) - r - 0.35 - G.O[k]) / G.H))), i1 = [0, 1, 2].map(k => Math.min([G.NX, G.NY, G.NZ][k] - 1, Math.ceil((Math.max(A[k], B[k]) + r + 0.35 - G.O[k]) / G.H)));
      for (let z = i0[2]; z <= i1[2]; z++) for (let y = i0[1]; y <= i1[1]; y++) for (let x = i0[0]; x <= i1[0]; x++) {
        const q = [G.O[0] + (x + 0.5) * G.H, G.O[1] + (y + 0.5) * G.H, G.O[2] + (z + 0.5) * G.H], u = Math.max(0, Math.min(1, dot(sub(q, A), AB) / ab2));
        const d = len(sub(q, add(A, mul(AB, u)))) - r, id = G.vi(x, y, z); if (d < F[id]) F[id] = d; }
    }
  }
  return F;
}
function volari(T) {
  for (const [chiave, nomi] of Object.entries(VOLARI)) {
    const [id, b] = chiave.split(':'), t = T[id][+b], r = t.r;
    const P = ricampiona(t.pts, 0.1), n = P.length;
    if (DISTENDI[chiave]) smussa(P, DISTENDI[chiave]);   // decorso di partenza con una gobba disegnata a mano: prima si distende
    if (GUIDA[chiave]) {   // decorso di partenza portato sulla guida (con raccordi dolci): le spinte da sole resterebbero
      for (const p of P) { const gd = guida(chiave, p[1]); if (gd) { p[0] += (gd.x - p[0]) * gd.w; p[2] += (gd.z - p[2]) * gd.w; } }   // incastrate nella strettoia tra FCR e FDS
      smussa(P, 30); }
    const P0 = P.map(p => p.slice());   // P0: decorso di partenza, da cui ci si allontana al massimo di SPOST_MAX
    const lo = [0, 1, 2].map(k => Math.min(...P.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...P.map(p => p[k])));
    griglia(lo, hi, 0.03, SPOST_MAX + 0.4);   // la griglia deve contenere tutto ciò che il nervo può raggiungere, altrimenti i campi sono costanti fuori e non spingono più
    const noms = nomi.filter(m => man.meshes.some(x => x.n === m) || TUBI_V.includes(m)), Fs = noms.map(m => TUBI_V.includes(m) ? campoTuboPagina(m) : campo([m]).F);
    for (const [a, [b, dist]] of Object.entries(SENZA_SETTO[chiave] || {})) {   // ostacolo a meno della parte vicina a b
      const Fa = Fs[noms.indexOf(a)], Fb = Fs[noms.indexOf(b)]; for (let i = 0; i < Fa.length; i++) Fa[i] = Math.max(Fa[i], dist - Fb[i]); }
    const gr = (F, p) => { const e = 0.05, g = [0, 1, 2].map(k => { const a = p.slice(), c = p.slice(); a[k] += e; c[k] -= e; return sample(F, ...a) - sample(F, ...c); }); return nrm(g); };
    const [l0, l1] = LIBERI[chiave] || [0, 0];
    // spinta richiesta in ogni punto: fuori da ogni ostacolo, almeno il gioco oltre il raggio (sul contorno ovale per il mediano)
    // lato di partenza: dove il decorso originale è fuori da un ostacolo, la spinta non lo fa mai attraversare (dentro un
    // tendine il gradiente cambia verso a metà e porterebbe il nervo fuori dal lato opposto)
    const lato0 = P.map(p => Fs.map(F => sample(F, ...p) - r > -0.02 ? gr(F, p) : null));
    const spinte = () => P.map((p, i) => { let f = [0, 0, 0], att = false; Fs.forEach((F, j) => {
      if (noms[j] === 'pl' && SOTTO_PL.includes(id) && p[1] < Y_PL) return;   // oltre le digitazioni dell'aponeurosi (testa dei metacarpali) i nervi digitali ne escono
      const { d: d0, q } = peggioreContorno(F, id, p, r), ex = GIOCO_V + (EXTRA_V[noms[j]] || 0) * sstep(Y_SETTO[0], Y_SETTO[1], p[1]), g = SOTTO_PL.includes(id) ? GIOCO_DIG : GIOCO_T[chiave]?.[noms[j]] ?? GIOCO_V, d = d0 - (ex - GIOCO_V); if (d - g >= 0) return;
      // l'aponeurosi palmare è un telo sottile: il nervo sta sempre sotto (dorsalmente), il gradiente cambierebbe verso attraversandola;
      const telo = (noms[j] === 'pl' || TUBI_V.includes(noms[j])) && SOTTO_PL.includes(id);
      // per l'aponeurosi la direzione è quella del gradiente, ribaltata verso il dorso se punta in senso volare: lontano
      // dal telo resta dorsale, vicino ai setti profondi dell'aponeurosi diventa laterale (non li si percorre verso il dorso)
      let dir = gr(F, q); if (telo && dir[2] > 0) dir = [dir[0], dir[1], -dir[2]];
      // sotto l'arco palmare superficiale il nervo scende sempre (la normale dell'arco, di fianco, sarebbe quasi parallela
      // al nervo nel punto d'incrocio e non lo sposterebbe)
      if (telo && TUBI_V.includes(noms[j])) dir = [0, 0, -1];
      const dv = DIR_V[chiave]?.[noms[j]];
      if (dv && p[1] > dv.y0) dir = dv.dir;
      else if (!telo && lato0[i][j] && dot(dir, lato0[i][j]) < 0) dir = lato0[i][j];
      f = add(f, mul(dir, Math.min((g - d) * 0.6 * (PESO_V[noms[j]] || 1), 0.08))); att = true; });
      // richiamo debole verso la guida anatomica (le spinte degli ostacoli prevalgono sempre)
      const gd = guida(chiave, p[1]);
      if (gd) { const v = [gd.x - p[0], 0, gd.z - p[2]], l = len(v); if (l > 0.005) { f = add(f, mul(v, Math.min(0.02, l) / l * gd.w)); att = true; } }
      return att ? f : null; });
    // spostamento liscio per costruzione: B-spline cubica sull'ascissa del decorso di partenza, nodi ogni NODI cm, sempre
    // nel piano di sezione del decorso di partenza (i punti non scorrono lungo il nervo: niente ammucchiamenti, salti,
    // spigoli o anelli compenetrati). Agli estremi vincolati lo spostamento si annulla con una rampa dolce; le spinte
    // muovono i nodi (media pesata delle spinte dei punti che ciascun nodo controlla)
    const S0 = ascisse(P0), L = S0.at(-1), m = Math.max(2, Math.round(L / (NODI[chiave] || NODI.base))), hn = L / m, J = m + 3;
    const bs = u => { u = Math.abs(u); return u < 1 ? (4 - 6 * u * u + 3 * u ** 3) / 6 : u < 2 ? (2 - u) ** 3 / 6 : 0; };
    const W = S0.map(s => Array.from({ length: J }, (_, j) => bs(s / hn - (j - 1))));
    const E = Math.min(RAMPA[chiave] || 0.8, L / 3), env = S0.map(s => (l0 ? 1 : sstep(0, E, s)) * (l1 ? 1 : sstep(0, E, L - s)));
    const T0 = P0.map((_, i) => nrm(sub(P0[Math.min(n - 1, i + 1)], P0[Math.max(0, i - 1)])));
    const C = Array.from({ length: J }, () => [0, 0, 0]);
    const aggiorna = () => { for (let i = 0; i < n; i++) { let d = [0, 0, 0]; for (let j = 0; j < J; j++) if (W[i][j]) d = add(d, mul(C[j], W[i][j]));
      d = mul(sub(d, mul(T0[i], dot(d, T0[i]))), env[i]); const l = len(d); if (l > SPOST_MAX) d = mul(d, SPOST_MAX / l); P[i] = add(P0[i], d); } };
    for (let it = 0; it < 900; it++) {
      const f = spinte(); let mosso = false;
      for (let j = 0; j < J; j++) { let s = [0, 0, 0], w = 0, wa = 0;
        for (let i = 0; i < n; i++) { const c = W[i][j] * env[i]; if (!c) continue; w += c; if (f[i]) { s = add(s, mul(f[i], c)); wa += c; } }
        if (wa) { C[j] = add(C[j], mul(s, 0.7 / (wa + 0.2 * w))); mosso = true; } }
      const C1 = C.map(c => c.slice()); for (let j = 1; j < J - 1; j++) C[j] = add(C1[j], mul(sub(add(C1[j - 1], C1[j + 1]), mul(C1[j], 2)), TENSIONE / 2));
      aggiorna(); if (!mosso) break;
    }
    const sp = Math.max(...P.map((p, i) => len(sub(p, aAscissa(t.pts, ascisse(t.pts), ascisse(P)[i] * ascisse(t.pts).at(-1) / ascisse(P).at(-1)).p))));
    t.pts = P; log(chiave, 'versante volare: scostamento massimo', (sp * 10).toFixed(1), 'mm');
  }
}

/* ============ 0') Punto di divisione del mediano ============ */
// nel decorso originale tutti i rami terminali del mediano partono dall'estremità radiale del tronco (verso i tenari),
// e i rami diretti al II-III spazio devono tornare indietro con una piega a V. Il tronco si accorcia di ACCORCIA cm
// (divisione al margine distale del retinacolo): i rami che proseguono nella direzione del tronco (I spazio, ramo
// motorio) ne ereditano la coda, gli altri nascono dal nuovo punto di divisione e raggiungono il loro decorso con un raccordo
const ACCORCIA = { nmed: 0.5 };
// ramo motorio ricorrente (tenare): dal lato radiale del mediano al margine distale del retinacolo curva subito in senso
// radiale e prossimale (ricorrente) ed entra nei muscoli tenari tra APB e FPB (Lanz U, J Hand Surg Am 1977; Standring S,
// Gray's Anatomy). Decorso ridisegnato dal punto di divisione: punti dopo il primo (cm), l'ultimo è quello originale.
// Resta profondo all'aponeurosi palmare (`pl`) fino al suo margine radiale e risale nel varco tra aponeurosi e FPB,
// sopra l'opponente: non attraversa l'aponeurosi
const RIDISEGNA = { nmedmot: [[-1.84, -3.05, 1.02], [-1.92, -3.28, 1.02], [-2.0, -3.39, 1.2], [-2.05, -3.44, 1.48], [-2.13, -3.44, 1.8], [-2.33, -3.35, 1.98], [-2.547, -3.181, 1.979]] };
function accorcia(T) {
  for (const [id, cut] of Object.entries(ACCORCIA)) {
    const tr = T[id][0], P = ricampiona(tr.pts, 0.05), S = ascisse(P), L = S.at(-1), E = P.at(-1);
    const k = P.findIndex((_, i) => S[i] >= L - cut), coda = P.slice(k), c0 = P[k], td = nrm(sub(E, c0));
    tr.pts = P.slice(0, k + 1);
    for (const tubi of Object.values(T)) for (const t of tubi) {
      if (t === tr || len(sub(t.pts[0], E)) > 0.02) continue;
      const nome = Object.keys(T).find(k => T[k].includes(t));
      if (RIDISEGNA[nome]) { t.pts = ricampiona([c0, ...RIDISEGNA[nome]], 0.1); smussa(t.pts, 10); continue; }
      const C = ricampiona(t.pts, 0.05), SC = ascisse(C), d = nrm(sub(aAscissa(C, SC, Math.min(1, SC.at(-1))).p, E));
      if (dot(d, td) > 0.85 || SC.at(-1) < 1.5) { t.pts = [...coda.slice(0, -1), ...C]; continue; }
      const R = ricampiona([c0, ...C.filter((_, i) => SC[i] > 0.8)], 0.1);
      smussa(R, 25, new Set(R.map((_, i) => i).filter(i => i === 0 || i >= 16))); t.pts = R;
    }
  }
}

/* ============ 2) Divisioni ============ */
function divisioni(T) {
  for (const { da, a, aff, racc, k, ricorrente } of DIV) {
    const tr = T[da[0]][da[1]], ra = T[a[0]][a[1]], P = tr.pts, S = ascisse(P), C = ra.pts, SC = ascisse(C);
    // punto di origine sul tronco: il più vicino al primo punto del ramo
    let j = 0, dm = Infinity; P.forEach((q, i) => { const d = len(sub(q, C[0])); if (d < dm) { dm = d; j = i; } });
    const s0 = S[j], { t: Tt } = aAscissa(P, S, s0), terminale = j === P.length - 1;
    // lato d'uscita: direzione del ramo dopo il raccordo, senza la componente lungo il tronco
    const dir = sub(aAscissa(C, SC, Math.min(racc, SC.at(-1))).p, C[0]); let lat = sub(dir, mul(Tt, dot(dir, Tt)));
    if (len(lat) < 1e-3) lat = [0, 0, 1]; lat = nrm(lat);
    const Rloc = terminale ? tr.r * ((FINE[da.join(':')]?.fin?.[0] ?? 1) + 1) / 2 : tr.r;
    const m = Math.max(0, Rloc - ra.r) * k;
    // tratto affiancato dentro il tronco (dall'ascissa s0 − aff all'origine), poi decorso originale con lo spostamento che si annulla
    const pre = [], n = Math.max(3, Math.round(aff / 0.15));
    // il fascicolo resta dentro la sezione del tronco, che può essere ovale (tunnel carpale, appiattimento finale) e
    // assottigliata verso la fine: spostamento al più fino al bordo dell'ovale nella direzione `lat`, meno il raggio del ramo
    const f = FINE[da.join(':')] || {}, L = S.at(-1);
    const dentro = (s, t) => { let rr = tr.r, rt = 1;
      if (f.fin) rr *= f.fin[0] + (1 - f.fin[0]) * sstep(0, f.fin[1], L - s);
      if (f.piatto) rt = Math.min(rt, 1 - (1 - f.piatto[0]) * sstep(L - f.piatto[1], L, s));
      if (da[0] === 'nmed' && da[1] === 0) rt = Math.min(rt, rtTunnel(aAscissa(P, S, s).p[1]));
      let B = sub([1, 0, 0], mul(t, t[0])); B = nrm(B); const Nn = cross(t, B), lx = dot(lat, B), lz = dot(lat, Nn);
      const rho = 1 / Math.hypot(lx / (rr / Math.sqrt(rt)), lz / (rr * Math.sqrt(rt)));
      return Math.max(0, rho - ra.r * 0.6); };
    for (let q = 0; q < n; q++) { const s = s0 - aff + aff * q / n, { p, t } = aAscissa(P, S, s); pre.push(add(p, mul(lat, Math.min(m * (0.55 + 0.45 * q / n), dentro(s, t))))); }
    const post = C.map((p, i) => add(p, mul(lat, m * (1 - sstep(0, racc, SC[i])))));
    // ramo ricorrente (motorio del mediano): esce dal fianco del tronco poco prima della divisione e va subito
    // all'indietro verso i tenari, senza correre in avanti nel tronco e ripiegare su sé stesso
    if (ricorrente) {
      pre.length = 0;
      for (const [ds, f] of [[ricorrente + aff, 0.5], [ricorrente, 1]]) pre.push(add(aAscissa(P, S, s0 - ds).p, mul(lat, m * f)));
      post.splice(0, post.findIndex((_, i) => SC[i] >= 0.4));
    }
    // raccordo tra il fascicolo nel tronco e il decorso del ramo: smussatura dei soli punti attorno alla giunzione
    const J0 = ricampiona(pre.concat([post[0]]), 0.1).length - 1, R = ricampiona([...pre, ...post], 0.1);
    smussa(R, 12, new Set(R.map((_, i) => i).filter(i => i === 0 || Math.abs(i - J0) > 6)));
    ra.pts = R;
    ra.o.ini = [0.35, Math.min(0.5, aff * 0.45)];
  }
  for (const [chiave, f] of Object.entries(FINE)) {
    const [id, b] = chiave.split(':'), t = T[id][+b], L = ascisse(t.pts).at(-1);
    if (f.fin) t.o.fin = f.fin;
    const tunnel = id === 'nmed' && +b === 0, pts = t.pts, S = ascisse(pts);
    if (f.piatto || tunnel) { // rapporto altezza/larghezza lungo il tubo: appiattimento finale e, per il mediano, tunnel carpale
      const prof = u => { const s = u * L; let q = 1;
        if (f.piatto) q = Math.min(q, 1 - (1 - f.piatto[0]) * sstep(L - f.piatto[1], L, s));
        if (tunnel) q = Math.min(q, rtTunnel(aAscissa(pts, S, s).p[1]));
        return q; };
      t.o.piatto = Array.from({ length: 41 }, (_, i) => [fmt(i / 40), fmt(prof(i / 40))]); t.o.wdir = [1, 0, 0];
    }
  }
}

/* ============ Scrittura ============ */
const opz = o => '{' + ['urep:6', ...Object.entries(o).map(([k, v]) => k + ':' + JSON.stringify(v))].join(',') + '}';
function scrivi(T) {
  for (const id of NERVI) {
    let i = 0;
    const riga = rigaOriginale(id).replace(reTube, () => { const t = T[id][i++];
      return 'tube([' + t.pts.map(p => '[' + p.map(fmt).join(',') + ']').join(',') + '],' + t.r + ',' + opz(t.o) + ')'; });
    sostituisciRiga(id, riga);
  }
}

/* ============ Verifica ============ */
const CONTRO = {
  nradsup: ['retext', 'g1', 'g2', 'g3', 'apl', 'epb', 'epl', 'ecrl', 'ecrb', 'br', 'radio', 'scafoide', 'trapezio', 'mc1', 'mc2', 'iod', 'add'],
  nulndors: ['retext', 'g5', 'g6', 'ecu', 'edm', 'edc', 'fcu', 'ulna', 'piramidale', 'uncinato', 'mc4', 'mc5', 'adm'],
  nmed: ['retfl', 'fds', 'fdp', 'fpl', 'fcr', 'gfcr', 'pl', 'pq', 'capvol'], npalm: ['retfl', 'pl', 'fcr', 'apb'], nmedmot: ['retfl', 'apb', 'fpb', 'op', 'pl'],
  ndig: ['pl', 'auln', 'retfl', 'fds', 'fdp', 'lumb'], nuln: ['fcu', 'pisiforme', 'retfl', 'tettoguy', 'auln'], nulnsup: ['pl', 'auln', 'retfl', 'tettoguy', 'pisiforme', 'adm'],
  nulnprof: ['uncinato', 'pisiforme', 'fdm', 'odm', 'adm', 'fds', 'fdp', 'fpl', 'lumb', 'iod', 'iop', 'capitato', 'mc2', 'mc3', 'mc4', 'mc5', 'trapezoide', 'auln', 'aulnprof'],
};
function verifica() {
  const mix = (a, b, t) => a + (b - a) * t;
  for (const id of NERVI) leggi(G.M.html.split('\n').find(l => l.startsWith(`{id:'${id}',`))).forEach(({ pts, r }, b) => {
    // curvatura: un raggio di curvatura minore di 2 volte il raggio del tubo fa compenetrare gli anelli (spigolo, tacche)
    let Rmin = Infinity, yR = 0; for (let i = 1; i < pts.length - 1; i++) { const a = sub(pts[i], pts[i - 1]), c = sub(pts[i + 1], pts[i]);
      const ang = Math.acos(Math.min(1, dot(a, c) / (len(a) * len(c) || 1))), R = (len(a) + len(c)) / 2 / (ang || 1e-9); if (R < Rmin) { Rmin = R; yR = pts[i][1]; } }
    if (Rmin < 2 * r) log(`  ${id}[${b}] curva stretta: raggio ${(Rmin * 10).toFixed(1)} mm (y = ${yR.toFixed(2)})`);
    const P = []; for (let s = 0; s < pts.length - 1; s++) for (let q = 0; q < 4; q++) P.push(pts[s].map((v, k) => mix(v, pts[s + 1][k], q / 4)));
    const lo = [0, 1, 2].map(k => Math.min(...P.map(p => p[k]))), hi = [0, 1, 2].map(k => Math.max(...P.map(p => p[k])));
    griglia(lo, hi, 0.03, 0.4);
    for (const c of (CONTRO[id] || [])) {
      if (!man.meshes.some(m => m.n === c) && !TUBI_V.includes(c)) continue;
      const F = TUBI_V.includes(c) ? campoTuboPagina(c) : campo([c]).F; let n = 0, peggio = 0, dove = null;
      for (const p of P) { const d = peggioreContorno(F, id, p, r).d; if (d < -0.02) { n++; if (d < peggio) { peggio = d; dove = p; } } }
      if (n) log(`  ${id}[${b}] dentro ${c}: ${n} punti (fino a ${(-peggio * 10).toFixed(1)} mm, y = ${dove[1].toFixed(2)})`);
    }
    if (SOTTOCUTE[id]) { G.griglia(lo, hi, 0.03, 0.4); const { F } = campo(['cute']); const fuori = P.filter(p => sample(F, ...p) > -r).length;
      if (fuori) log(`  ${id}[${b}] fuori dalla cute: ${fuori} punti`); }
  });
}

/* ============ Esecuzione ============ */
if (process.argv.includes('verifica')) verifica();
else {
  G.setPos('cute', G.posDaRevisione(ORIGINALE, 'cute', FILE_REPO));
  const T = Object.fromEntries(NERVI.map(id => [id, leggi(rigaOriginale(id))]));
  accorcia(T);
  volari(T);
  sottocute(T);
  cute();
  divisioni(T);
  scrivi(T);
  G.saveFile(G.repack());
}
