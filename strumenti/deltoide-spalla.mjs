/* Deltoide della spalla (modelli/spalla-3d.html): parte clavicolare e parte acromiale unite senza fessura, origini aderenti a clavicola e acromion,
   superficie senza punte né triangoli ripiegati, nessuna compenetrazione con ossa e strutture vicine.

   Problema. Nelle mesh di BodyParts3D (e dopo le spinte di `muscoli-spalla.mjs` e `capo-breve-spalla.mjs`) le due parti si toccano solo in profondità:
   tra il margine laterale di `delt_cl` e il margine anteriore di `delt_ac` resta una fessura, stretta in basso e larga 4–8 mm in alto, vicino
   all'acromion, dove lascia vedere borsa, coraco-acromiale e acromion; il margine del clavicolare nella fessura ha punte e triangoli ripiegati; in
   alto la parte acromiale finisce sotto il margine laterale dell'acromion con una faccia di taglio piatta. Spostare i soli vertici del margine non
   basta (margini frastagliati, lembi stirati): le due parti sono ricostruite come superfici implicite.

   Uso (dalla cartella del progetto):
     node strumenti/deltoide-spalla.mjs                → riscrive `delt_cl` e `delt_ac` nel file del modello (topologia nuova)
     PROVA=1 node strumenti/deltoide-spalla.mjs        → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/deltoide-spalla.mjs   → lavora su una copia
   Ultimo della catena (dopo `borsa-spalla.mjs`: la borsa è un ostacolo). Riparte da `delt_cl` e `delt_ac` della revisione `BASE` (mesh, tag e direzioni
   delle fibre), con le altre strutture del file come ostacoli, quindi si può rilanciare con lo stesso risultato. Se si rilanciano script precedenti
   che toccano il deltoide (`muscoli-spalla.mjs`, `capo-breve-spalla.mjs`), lanciarli sul file di `BASE` (che ha ancora la topologia di BodyParts3D),
   poi aggiornare `BASE` e rilanciare questo.

   Metodo (griglia di passo `PASSO` su tutto il deltoide anteriore e medio; campi di distanza con segno, negativi dentro).
   1. Forma di partenza: distanza con segno da ciascuna parte di BASE (segno dal riempimento per parità, valore esatto dai triangoli vicino alla superficie).
   2. Fessura: chiusura morfologica (raggio `R_SOLCO`) dell'unione delle due parti con le strutture su cui poggiano (`OSSA`, `FONDO`), limitata ai punti
      vicini a entrambe le parti (`VICINO_SOLCO`): riempie la fessura fino all'inviluppo esterno delle due superfici e, in profondità, fino alla cuffia e
      alla borsa.
   3. Origini: chiusura (raggio `R_ORIG`) dell'unione delle due parti con il margine dell'acromion, il terzo laterale della clavicola (ossa sopra `Y_OSSA`,
      scapola solo lateralmente a `X_ACR`: il coracoide resta fuori) e i legamenti sotto l'origine (`PAVIMENTO`), entro `VICINO_OSSO` da questi: la parte
      acromiale arriva sul margine laterale dell'acromion e il clavicolare sulla clavicola, invece di fermarsi a qualche millimetro.
   4. Forma comune C = riempimento ∩ (dove i punti sopra le ossa vanno solo se a meno di `VICINO_PARTE` da una parte) ∩ sotto `Y_TETTO` lateralmente a
      `X_ACR` (niente pinna dell'acromiale sopra l'acromion) e sotto il tetto della fessura (quota delle due parti allargata di `ALLARGA_SOLCO`
      e levigata, almeno `COPRI_CAL` sopra il coraco-acromiale: niente ripiano davanti all'apice); lì il riempimento delle origini sta anche sotto il tetto dell'acromion (faccia superiore
      estesa di `ESTENDI` e poi decrescente con `PENDENZA`, al posto del criterio della salita) e dalla parte dell'acromiale rispetto al deltoide
      spinale; apertura di raggio `APRI` contro le lamine sottili, fatta insieme alle due parti. Ogni parte = (sua forma gonfiata di
      `GONFIA` ∪ C) fuori dagli ostacoli: a `GAP_OSSO` dalle ossa e a `GAP_MOLLI` da cuffia, borsa, capsula, legamenti, capo breve e lungo del
      bicipite, coracobrachiale, grande pettorale e trapezio (`MOLLI`); entrambe anche dal deltoide spinale, che resta com'è.
      Divisione tra le due parti: piano bisettore (Scl − Sac)/2, piegato in profondità (`INCLINA`, `P0_INC`, `P_INC`) così l'acromiale passa sotto il
      margine del clavicolare come nel muscolo vero.
   5. Superficie a più materiali (etichette fuori / clavicolare / acromiale, un vertice per cella condiviso): la linea dove le due parti si toccano in
      superficie è la stessa per entrambe, quindi niente fessura né solco. Faccia di contatto tra le due parti con tag `TAGLIO` (colore della superficie
      di taglio, vista solo col piano di taglio). Pezzi staccati tolti (meno di `PEZZO_MIN` triangoli), Taubin vincolato `GIRI_LISCIA` volte (i vertici
      della giunzione scorrono solo lungo la giunzione), riduzione a quadriche fino a `TRI` volte i triangoli di BASE con la giunzione ferma; tag
      (muscolo/tendine) e direzioni delle fibre dal vertice di BASE più vicino; normali delle facce esterne calcolate sulle due parti insieme (nessuno
      stacco di luce sulla giunzione), `NORM_DIFF` passate di media, scritte nel file.
   6. Solo vicino alle origini: tutto questo vale entro `ZONA0` dalle ossa delle origini e sfuma fino a `ZONA1`. Fuori il riempimento si ferma `SOLCO`
      sotto l'inviluppo (la fessura si chiude in profondità e resta il solco tra i due ventri) e i vertici delle facce esterne sono
      riportati (prima della riduzione) sul punto più vicino della superficie di BASE della propria parte (peso 1 − zona; solo i vertici a meno di `VICINO_BASE` da BASE, non
      dove il punto di BASE è a meno di `GAP_MOLLI` + `MARGINE` da un ostacolo o dentro l'altra parte; dimezzando lo spostamento dove un triangolo si
      girerebbe, `GIRI_PIEGHE` volte); i vertici della sola faccia di contatto seguono i vicini (`GIRI_SPOST`). Le normali delle facce esterne sono quelle
      scritte in BASE nel punto più vicino, dove concordano con le nuove: fuori dalla zona delle origini il muscolo ha la forma e la luce di BASE.
   6b. Angolo posteriore dell'acromion (dietro `Z_ANGOLO`, entro `VICINO_OSSO` dalle ossa): la lamina dell'acromiale appoggiata sul deltoide spinale è
      aperta di raggio `APRI_ANGOLO` (finisce arrotondata, senza nodulo).
   7. Estremità distale (tendine sull'omero, troppo sottile per la griglia): sotto il piano y = `Y_BASE` restano i triangoli di BASE, tagliati con lo
      stesso piano della superficie nuova; i vertici del bordo nuovo vanno sul bordo di BASE. Lì restano i pochi incroci che BASE aveva già con il
      capo lungo del bicipite e il deltoide spinale.
   Controlli stampati: triangoli che si incrociano tra le due parti e con ossa e strutture vicine (BASE → nuovo) e scarto tra superficie nuova e BASE
   fuori dalle zone riempite e lontano dagli ostacoli. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const B = await import('./lib-bp3d.mjs');
const { REAL, realDaRevisione, saveFile, repack, log, griglia, solid, edt, sdf, unione, chiuso, esatta, sfoca, nets, sample } = G;

const BASE = '24eb995', FILE = 'modelli/spalla-3d.html', PARTI = ['delt_cl', 'delt_ac'];
const OSSA = ['scapola', 'clavicola', 'omero'], PAVIMENTO = ['cal', 'ac_leg'];
const FONDO = ['supra', 'infra', 'borsa_sad', 'caps', 'cal', 'ac_leg', 'coraco_om', 'bic_lungo', 'trasv_om', 'subs', 'bic_breve'];
const MOLLI = [...new Set([...FONDO, 'cc_trapezoide', 'cc_conoide', 'pec_cl', 'coracobr', 'trap_d', 'trap_t', 'tmin'])];
const PASSO = 0.04;                                                                                                   // cm
const R_SOLCO = 1.5, VICINO_SOLCO = 0.9, COPRI = 0.25, R_ORIG = 0.8, VICINO_OSSO = 1.0, Y_OSSA = 2.0, X_ACR = 2.4, APRI = 0.08;   // cm
const Y_TETTO = 3.5, ESTENDI = 0.12, LEVIGA_TETTO = 12, SOTTO_TETTO = 0.03, PENDENZA = [1.0, 0.15], Z_ANGOLO = -2.9, APRI_ANGOLO = 0.12, R_TACCA = 1.0, VICINO_TACCA = 0.6, Y_TACCA = 3.6, ALLARGA_SOLCO = 0.5, LEVIGA_SOLCO = 6, COPRI_CAL = 0.15, ALLARGA_CAL = 0.2, TAGLIO = 250, VICINO_PARTE = 0.5, GONFIA = 0.02, SALITA = 0.6, INCLINA = 1.5, P0_INC = 0.05, P_INC = 0.15;
const GAP_OSSO = 0.05, GAP_MOLLI = 0.05, PEZZO_MIN = 200, TRI = 1.2, NORM_DIFF = 4, GIRI_LISCIA = 40;
const ZONA0 = 1.2, ZONA1 = 3.6, SOLCO = 0.15, R_RIPORTA = 0.4, GIRI_SPOST = 12, MARGINE = 0.1, GIRI_PIEGHE = 8;
const Y_BASE = -9.0;   // cm: sotto questo piano (estremità distale, tendine sull'omero) restano i triangoli di BASE   // cm: zona delle origini (distanza dalle ossa delle origini)

/* ---- mesh di partenza (BASE): messe al posto di quelle del file, così voxelizzazioni e controlli partono da BASE anche dopo un primo lancio ---- */
const P = {};
for (const n of PARTI) { const m = realDaRevisione(BASE, n, FILE); P[n] = { ...m, nv: m.pos.length / 3 }; G.setMesh(n, { pos: m.pos, idx: m.idx, tag: m.tag, fdir: m.fdir }); }
{ // normali di vertice scritte in BASE (fuori dalla zona delle origini la superficie riprende forma e luce di BASE)
  const h = execFileSync('git', ['show', `${BASE}:${FILE}`], { cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'), maxBuffer: 1 << 30 }).toString('utf8');
  const mn = JSON.parse(h.match(G.reManRe)[2]); let b = Buffer.from(h.match(G.reDatRe)[2].trim(), 'base64'); if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
  for (const n of PARTI) { const m = mn.meshes.findLast(x => x.n === n), d = new Int8Array(b.buffer, b.byteOffset + m.nm, m.nv * 3); P[n].nrm = Float32Array.from(d, x => x / 127); } }

/* ---- griglia e campi ---- */
const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (const n of PARTI) { const p = P[n].pos; for (let i = 0; i < p.length; i++) { lo[i % 3] = Math.min(lo[i % 3], p[i]); hi[i % 3] = Math.max(hi[i % 3], p[i]); } }
griglia(lo, hi, PASSO, 0.3);
const { N } = G;
log('griglia', G.NX, G.NY, G.NZ, (N / 1e6).toFixed(1), 'M voxel');
const S = {}, D = {};
for (const n of PARTI) {
  const s = sdf(solid(n)).F, e = esatta(Float32Array.from(s), [n], 0.1);
  for (let i = 0; i < N; i++) s[i] = Math.sign(s[i] || 1) * Math.abs(e[i]);   // segno per parità (le mesh hanno pieghe), valore esatto vicino alla superficie
  S[n] = s; D[n] = new Float32Array(N); for (let i = 0; i < N; i++) D[n][i] = Math.max(0, s[i]);
}
log('distanze dalle due parti');
const vox = id => [G.O[0] + (id % G.NX + 0.5) * G.H, G.O[1] + (((id / G.NX) | 0) % G.NY + 0.5) * G.H, G.O[2] + (((id / G.NXY) | 0) + 0.5) * G.H];
const Mo = new Uint8Array(N), Mos = new Uint8Array(N); { const Ms = solid('scapola'), Mc = solid('clavicola'), Mp = unione(PAVIMENTO);
  for (let i = 0; i < N; i++) { if (Mp[i]) { Mo[i] = 1; continue; } if (!Ms[i] && !Mc[i]) continue; const p = vox(i); if (p[1] > Y_OSSA && (Mc[i] || p[0] < X_ACR)) Mo[i] = Mos[i] = 1; } }
const Df = edt(unione([...OSSA, ...FONDO])), Dbo = edt(Mo), Dcl = D.delt_cl, Dac = D.delt_ac;
// zona delle origini: 1 fino a `ZONA0` dalle ossa delle origini, 0 oltre `ZONA1`; fuori dalla zona il deltoide resta quello di BASE
const W = new Float32Array(N); for (let i = 0; i < N; i++) W[i] = 1 - G.sstep(ZONA0, ZONA1, Dbo[i]);
// sopra le ossa delle origini (faccia superiore di acromion, clavicola e articolazione acromioclavicolare) non si riempie: la direzione dall'osso più
// vicino (gradiente della distanza dalle ossa) non deve salire più di `SALITA` (seno dell'angolo con l'orizzontale)
const Dos = edt(Mos), sopra = new Uint8Array(N);   // (solo le ossa: sopra il coraco-acromiale il deltoide ci va)
for (let i = 0; i < N; i++) { if (Dos[i] > VICINO_OSSO) continue; const j = ((i / G.NX) | 0) % G.NY; if (j < 1 || j > G.NY - 2) continue;
  const gx = (Dos[i + 1] - Dos[i - 1]), gy = (Dos[i + G.NX] - Dos[i - G.NX]), gz = (Dos[i + G.NXY] - Dos[i - G.NXY]), l = Math.hypot(gx, gy, gz); if (l > 0 && gy / l > SALITA) sopra[i] = 1; }
// lateralmente a `X_ACR` (acromion) al posto del criterio della salita c'è il tetto: altezza della faccia superiore delle ossa delle origini per
// colonna (x, z), estesa di `ESTENDI` oltre il margine con un massimo mobile e levigata (`LEVIGA_TETTO` passate). Il riempimento arriva fino al
// margine superiore dell'acromion (`SOTTO_TETTO` sotto il tetto) senza salire sulla faccia superiore: niente intaccatura né cordone sul margine
// laterale, e l'altezza segue il margine (niente scalino all'angolo anteriore, dove prima c'era il piano fisso y = 3,5)
const TETTO = new Float32Array(G.NX * G.NZ).fill(-1e9);
const Msc = solid('scapola');
{ for (let i = 0; i < N; i++) if (Mos[i] && Msc[i]) { const c = i % G.NX + G.NX * ((i / G.NXY) | 0), y = G.O[1] + ((((i / G.NX) | 0) % G.NY) + 1) * G.H; if (y > TETTO[c]) TETTO[c] = y; }
  const r = Math.round(ESTENDI / G.H), T0 = TETTO.slice();
  for (let k = 0; k < G.NZ; k++) for (let i = 0; i < G.NX; i++) { let m = -1e9;
    for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { if (a * a + b * b > r * r) continue; const ii = i + a, kk = k + b; if (ii < 0 || kk < 0 || ii >= G.NX || kk >= G.NZ) continue; m = Math.max(m, T0[ii + G.NX * kk]); }
    TETTO[i + G.NX * k] = m; }
  for (let it = 0; it < LEVIGA_TETTO; it++) { const T1 = TETTO.slice();
    for (let k = 1; k < G.NZ - 1; k++) for (let i = 1; i < G.NX - 1; i++) { const c = i + G.NX * k; if (T1[c] < -1e8) continue; let s = 0, n = 0;
      for (const d of [0, 1, -1, G.NX, -G.NX]) if (T1[c + d] > -1e8) { s += T1[c + d]; n++; } TETTO[c] = s / n; } }
  // fuori dall'acromion il tetto scende con la distanza (in pianta) dall'osso: di `PENDENZA[0]` per cm in direzione laterale (x), di `PENDENZA[1]`
  // in avanti e indietro (z), dove il riempimento raccorda la parte acromiale al clavicolare: all'angolo anteriore niente blocco a gradino
  const d8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [a, b, (PENDENZA[0] * Math.abs(a) + PENDENZA[1] * Math.abs(b)) * G.H]);
  for (let it = 0, cambia = true; cambia && it < 400; it++) { cambia = false;
    for (let k = 1; k < G.NZ - 1; k++) for (let i = 1; i < G.NX - 1; i++) { const c = i + G.NX * k; let m = TETTO[c];
      for (const [a, b, l] of d8) m = Math.max(m, TETTO[c + a + G.NX * b] - l); if (m > TETTO[c] + 1e-6) { TETTO[c] = m; cambia = true; } } } }
// (vicino alla clavicola resta il criterio della salita: il clavicolare non sale sull'estremità laterale della clavicola)
{ const Dsc = edt(Uint8Array.from(Mos, (v, i) => v && Msc[i] ? 1 : 0)); for (let i = 0; i < N; i++) if (sopra[i] && vox(i)[0] < X_ACR && Dsc[i] <= Dos[i] + 1e-6) sopra[i] = 0; }
const Dsp = edt(solid('delt_sp'));
// 2. fessura (con uno strato di almeno `COPRI` sopra cuffia e borsa: dove queste salgono tra le due parti restano coperte)
const T = new Float32Array(N); for (let i = 0; i < N; i++) T[i] = Math.min(Dcl[i], Dac[i], Df[i]);
const C = chiuso(T, R_SOLCO); for (let i = 0; i < N; i++) C[i] = Math.max(Math.min(C[i], Df[i] - COPRI), Math.max(Dcl[i], Dac[i]) - VICINO_SOLCO);
// 3. origini: la chiusura con le ossa è poi «aperta» (raggio `APRI`): via le lamine più sottili di 2 × APRI che resterebbero sulle ossa
for (let i = 0; i < N; i++) T[i] = Math.min(Dcl[i], Dac[i], Dbo[i]);
const Ci = chiuso(T, R_ORIG); for (let i = 0; i < N; i++) Ci[i] = Math.max(Ci[i], Dbo[i] - VICINO_OSSO, Math.min(Dcl[i], Dac[i]) - VICINO_PARTE);
{ const A = new Uint8Array(N); for (let i = 0; i < N; i++) A[i] = Ci[i] <= 0 && !sopra[i] && Dcl[i] > 0 && Dac[i] > 0 && Dbo[i] > 0 ? 1 : 0;
  // (apertura del riempimento insieme alle due parti: aperto da solo perdeva la punta del cuneo tra muscolo e osso, e sul margine restava un'intaccatura)
  const AM = new Uint8Array(N); for (let i = 0; i < N; i++) AM[i] = A[i] || Dcl[i] <= 0 || Dac[i] <= 0 ? 1 : 0;
  const E = edt(AM, true), Er = new Uint8Array(N); for (let i = 0; i < N; i++) Er[i] = E[i] >= APRI ? 1 : 0;
  const D2 = edt(Er); for (let i = 0; i < N; i++) Ci[i] = A[i] ? D2[i] - APRI : Math.max(Ci[i], 0.02); }
// tetto del riempimento della fessura (lateralmente a `X_ACR`): per colonna (x, z) la quota più alta delle due parti di BASE, allargata con un
// massimo mobile di raggio `ALLARGA_SOLCO` e levigata (`LEVIGA_SOLCO` passate): davanti e di lato all'apice il riempimento non forma più un
// ripiano piatto a y = `Y_TETTO` sopra il muscolo vicino (gradino della parte acromiale), ma resta all'altezza delle superfici che unisce;
// sopra il coraco-acromiale (e fino a `ALLARGA_CAL` intorno) il tetto è almeno `COPRI_CAL` più alto del legamento, che davanti all'apice resta coperto
const TSOLCO = new Float32Array(G.NX * G.NZ).fill(-1e9);
{ for (let i = 0; i < N; i++) if (Dcl[i] <= 0 || Dac[i] <= 0) { const c = i % G.NX + G.NX * ((i / G.NXY) | 0), y = vox(i)[1]; if (y > TSOLCO[c]) TSOLCO[c] = y; }
  const r = Math.round(ALLARGA_SOLCO / G.H), T0 = TSOLCO.slice();
  for (let k = 0; k < G.NZ; k++) for (let i = 0; i < G.NX; i++) { let m = -1e9;
    for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { if (a * a + b * b > r * r) continue; const ii = i + a, kk = k + b; if (ii < 0 || kk < 0 || ii >= G.NX || kk >= G.NZ) continue; m = Math.max(m, T0[ii + G.NX * kk]); }
    TSOLCO[i + G.NX * k] = m; }
  for (let it = 0; it < LEVIGA_SOLCO; it++) { const T1 = TSOLCO.slice();
    for (let k = 1; k < G.NZ - 1; k++) for (let i = 1; i < G.NX - 1; i++) { const c = i + G.NX * k; if (T1[c] < -1e8) continue; let s = 0, n = 0;
      for (const d of [0, 1, -1, G.NX, -G.NX]) if (T1[c + d] > -1e8) { s += T1[c + d]; n++; } TSOLCO[c] = s / n; } }
  const Mcal = solid('cal'), TC = new Float32Array(G.NX * G.NZ).fill(-1e9), r2 = Math.round(ALLARGA_CAL / G.H);
  for (let i = 0; i < N; i++) if (Mcal[i]) { const c = i % G.NX + G.NX * ((i / G.NXY) | 0), y = vox(i)[1] + COPRI_CAL; if (y > TC[c]) TC[c] = y; }
  for (let k = 0; k < G.NZ; k++) for (let i = 0; i < G.NX; i++) { let m = -1e9;
    for (let b = -r2; b <= r2; b++) for (let a = -r2; a <= r2; a++) { if (a * a + b * b > r2 * r2) continue; const ii = i + a, kk = k + b; if (ii < 0 || kk < 0 || ii >= G.NX || kk >= G.NZ) continue; m = Math.max(m, TC[ii + G.NX * kk]); }
    const c = i + G.NX * k; if (m > TSOLCO[c]) TSOLCO[c] = m; } }
for (let i = 0; i < N; i++) { if (sopra[i]) C[i] = Math.max(C[i], 0.02);
  // (il tetto vale per il riempimento delle origini; quello della fessura tra le due parti resta sotto il piano y = `Y_TETTO` e sotto `TSOLCO`)
  const p = vox(i), t = TETTO[i % G.NX + G.NX * ((i / G.NXY) | 0)]; if (p[0] < X_ACR) { C[i] = Math.max(C[i], p[1] - Math.min(Y_TETTO, TSOLCO[i % G.NX + G.NX * ((i / G.NXY) | 0)])); Ci[i] = Math.max(Ci[i], p[1] - (t - SOTTO_TETTO)); }
  C[i] = Math.min(C[i], Ci[i]);
  // (il riempimento resta dalla parte dell'acromiale rispetto al deltoide spinale: niente lembo dell'acromiale sopra l'estremità del deltoide spinale)
  C[i] = Math.max(C[i], (Math.min(Dcl[i], Dac[i]) - Dsp[i]) / 2); }
// davanti all'apice dell'acromion il clavicolare ha due lobi più alti della faccia superiore dell'osso, separati da una tacca a V che arrivava al
// legamento coraco-acromiale (il tetto teneva il riempimento a filo dell'acromion): chiusura del solo clavicolare (raggio `R_TACCA`, entro
// `VICINO_TACCA` da esso), solo lateralmente a `X_ACR`, nella zona delle origini, sotto y = `Y_TACCA` e non sopra le ossa (niente pinna
// nella rima acromioclavicolare); non sale oltre l'inviluppo dei due lobi
{ const Ct = chiuso(Dcl, R_TACCA);
  for (let i = 0; i < N; i++) { const p = vox(i); if (Ct[i] > 0 || sopra[i] || Dcl[i] > VICINO_TACCA || Dbo[i] > VICINO_OSSO || p[0] >= X_ACR) continue; C[i] = Math.min(C[i], Math.max(Ct[i], p[1] - Y_TACCA)); } }
sfoca(C, 2);
log('chiusure');
// 4. ostacoli
const Sb = esatta(sdf(unione(OSSA)).F, OSSA, 0.1), Sm = sdf(unione(MOLLI)).F, Ssp = sdf(solid('delt_sp')).F;
const Ob = Sb; for (let i = 0; i < N; i++) Ob[i] = Math.max(GAP_OSSO - Sb[i], GAP_MOLLI - Sm[i]);
const Osp = Ssp; for (let i = 0; i < N; i++) Osp[i] = Math.max(Ob[i], GAP_MOLLI - Ssp[i]);   // entrambe le parti restano anche fuori dal deltoide spinale (che non cambia)
log('ostacoli');

/* ---- attributi dal vertice di BASE più vicino ---- */
const vicino = (pos0, nv0) => { const h = 0.3, H = new Map(), k = (x, y, z) => Math.floor(x / h) + ',' + Math.floor(y / h) + ',' + Math.floor(z / h);
  for (let i = 0; i < nv0; i++) { const q = k(pos0[3 * i], pos0[3 * i + 1], pos0[3 * i + 2]); if (!H.has(q)) H.set(q, []); H.get(q).push(i); }
  return p => { let best = -1, bd = 1e9; const c = p.map(x => Math.floor(x / h)); for (let r = 1; r < 8 && best < 0; r++)
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let d = -r; d <= r; d++) for (const i of H.get((c[0] + a) + ',' + (c[1] + b) + ',' + (c[2] + d)) || []) {
      const dd = Math.hypot(pos0[3 * i] - p[0], pos0[3 * i + 1] - p[1], pos0[3 * i + 2] - p[2]); if (dd < bd) { bd = dd; best = i; } }
    return best; }; };
/* ---- superfici: una sola superficie a più materiali per le due parti ----
   Etichette sulla griglia: 0 fuori, 1 clavicolare, 2 acromiale. Surface nets con un vertice per cella condiviso da tutti i materiali: faccia esterna
   del clavicolare (tipo 1), dell'acromiale (tipo 2) e faccia di contatto tra le due (tipo 3, con la normale verso l'acromiale). Le due facce esterne
   hanno in comune la linea di giunzione, quindi in superficie non resta né fessura né solco; la faccia di contatto è la stessa nelle due mesh (di
   verso opposto), nascosta quando le due parti sono accese e visibile come superficie di taglio quando se ne spegne una. */
const Vcl = new Float32Array(N), Vac = new Float32Array(N), Bs = new Float32Array(N), L = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  // piano di divisione piegato in profondità vicino a cuffia e borsa: sotto la superficie (profondità = −C dall'inviluppo) si sposta verso il
  // clavicolare, così la parte acromiale gli passa sotto; in superficie resta il bisettore delle due distanze
  const inc = INCLINA * Math.min(Math.max(-C[i] - P0_INC, 0), P_INC) * (1 - G.sstep(0.5, 0.9, Df[i]));
  // (GONFIA: superficie spostata appena fuori, così le lamine più sottili del passo della griglia, come l'estremità tendinea sull'omero, non si bucano)
  // fuori dalla zona delle origini il riempimento si ferma `SOLCO` sotto l'inviluppo: la fessura si chiude in profondità e resta il solco tra i due ventri
  const Cz = C[i] + (1 - W[i]) * SOLCO;
  Vcl[i] = Math.max(Math.min(S.delt_cl[i] - GONFIA, Cz), Osp[i]); Vac[i] = Math.max(Math.min(S.delt_ac[i] - GONFIA, Cz), Osp[i]); Bs[i] = (S.delt_cl[i] - S.delt_ac[i]) / 2 + inc * W[i];
  L[i] = Vcl[i] < 0 && (Bs[i] < 0 || Vac[i] >= 0) ? 1 : Vac[i] < 0 ? 2 : 0;
}
/* angolo posteriore dell'acromion (dietro z = `Z_ANGOLO`, entro `VICINO_OSSO` dalle ossa): l'estremità posteriore dell'acromiale è una lamina sottile
   appoggiata sul deltoide spinale e finiva con un nodulo; apertura di raggio `APRI_ANGOLO` della sola parte acromiale, sfumata in 4 mm */
{ const Ma = Uint8Array.from(Vac, v => v < 0 ? 1 : 0), E = edt(Ma, true), Er = new Uint8Array(N); for (let i = 0; i < N; i++) Er[i] = E[i] >= APRI_ANGOLO ? 1 : 0;
  const D2 = edt(Er); let tolti = 0;
  for (let i = 0; i < N; i++) { if (!Ma[i]) continue; const p = vox(i), w = G.sstep(Z_ANGOLO + 0.4, Z_ANGOLO, p[2]) * (1 - G.sstep(VICINO_OSSO - 0.3, VICINO_OSSO, Dbo[i])); if (w <= 0) continue;
    const v = (1 - w) * Vac[i] + w * Math.max(Vac[i], D2[i] - APRI_ANGOLO); if (v >= 0) { tolti++; Vcl[i] = Math.max(Vcl[i], v); } Vac[i] = v;   // (tolto da entrambe: non diventa clavicolare)
    L[i] = Vcl[i] < 0 && (Bs[i] < 0 || Vac[i] >= 0) ? 1 : Vac[i] < 0 ? 2 : 0; }
  log('angolo posteriore: voxel dell\'acromiale tolti', tolti); }
const { NX, NY, NZ, NXY } = G, cx = NX - 1, cy = NY - 1, cz = NZ - 1, cid = new Int32Array(cx * cy * cz).fill(-1), PV = [];
const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const ED = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const OFF = CO.map(c => c[0] + c[1] * NX + c[2] * NXY);
for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
  const b = i + NX * j + NXY * k, l0 = L[b]; let diff = false; for (let c = 1; c < 8; c++) if (L[b + OFF[c]] !== l0) { diff = true; break; } if (!diff) continue;
  let ax = 0, ay = 0, az = 0, n = 0;
  for (const [a, e] of ED) { const ia = b + OFF[a], ib = b + OFF[e], la = L[ia], lb = L[ib]; if (la === lb) continue;
    let fa, fb; if (la && lb) { fa = Bs[ia]; fb = Bs[ib]; if (la === 2) { fa = -fa; fb = -fb; } } else { const F = (la || lb) === 1 ? Vcl : Vac; fa = F[ia]; fb = F[ib]; if (!la) { fa = -fa; fb = -fb; } }
    const t = fa < 0 && fb >= 0 ? fa / (fa - fb) : 0.5;   // fa: lato del materiale «a» (negativo), fb: altro lato
    ax += CO[a][0] + (CO[e][0] - CO[a][0]) * t; ay += CO[a][1] + (CO[e][1] - CO[a][1]) * t; az += CO[a][2] + (CO[e][2] - CO[a][2]) * t; n++; }
  cid[i + cx * j + cx * cy * k] = PV.length / 3;
  PV.push(G.O[0] + (i + 0.5 + ax / n) * G.H, G.O[1] + (j + 0.5 + ay / n) * G.H, G.O[2] + (k + 0.5 + az / n) * G.H);
}
const nvT = PV.length / 3; let pos = Float64Array.from(PV); PV.length = 0;
const cel = (i, j, k) => cid[i + cx * j + cx * cy * k];
const FT = [[], [], [], []];   // triangoli per tipo (1, 2, 3)
{ const quad = (t, q, dir, ax) => { if (q.some(v => v < 0)) return;
    const [a, b, c] = q, u = [0, 1, 2].map(r => pos[3 * b + r] - pos[3 * a + r]), w = [0, 1, 2].map(r => pos[3 * c + r] - pos[3 * a + r]), nz = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (nz[ax] * dir < 0) q.reverse(); FT[t].push(q[0], q[1], q[2], q[0], q[2], q[3]); };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
    const b = i + NX * j + NXY * k, la = L[b];
    for (const [ax, st] of [[0, 1], [1, NX], [2, NXY]]) { const lb = L[b + st]; if (la === lb) continue;
      // tipo e verso: le facce esterne guardano fuori, quella di contatto verso l'acromiale
      const t = la && lb ? 3 : (la || lb), verso = la && lb ? (lb === 2 ? 1 : -1) : (lb === 0 ? 1 : -1);
      const q = ax === 0 ? [cel(i, j, k), cel(i, j - 1, k), cel(i, j - 1, k - 1), cel(i, j, k - 1)] : ax === 1 ? [cel(i, j, k), cel(i, j, k - 1), cel(i - 1, j, k - 1), cel(i - 1, j, k)] : [cel(i, j, k), cel(i - 1, j, k), cel(i - 1, j - 1, k), cel(i, j - 1, k)];
      quad(t, q, verso, ax); } } }
log('superficie a più materiali:', nvT, 'vertici; triangoli esterni clavicolare', FT[1].length / 3, ', acromiale', FT[2].length / 3, ', contatto', FT[3].length / 3);
// pezzi staccati (meno di PEZZO_MIN triangoli, contando tutti i tipi)
{ const par = Int32Array.from({ length: nvT }, (_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 1; t <= 3; t++) for (let q = 0; q < FT[t].length; q += 3) { const a = f(FT[t][q]); par[f(FT[t][q + 1])] = a; par[f(FT[t][q + 2])] = a; }
  const cnt = new Map(); for (let t = 1; t <= 3; t++) for (let q = 0; q < FT[t].length; q += 3) { const r = f(FT[t][q]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  let tolti = 0; for (let t = 1; t <= 3; t++) { const I = []; for (let q = 0; q < FT[t].length; q += 3) if (cnt.get(f(FT[t][q])) >= PEZZO_MIN) I.push(FT[t][q], FT[t][q + 1], FT[t][q + 2]); else tolti++; FT[t] = I; }
  log('pezzi', cnt.size, ', triangoli in pezzi staccati tolti', tolti); }
// tipi dei vertici: bit 1, 2, 4 per i tipi di triangolo; giunzione = più di un tipo
const tipo = new Uint8Array(nvT); for (let t = 1; t <= 3; t++) for (const v of FT[t]) tipo[v] |= 1 << (t - 1);
const giunz = new Uint8Array(nvT); for (let v = 0; v < nvT; v++) giunz[v] = tipo[v] && (tipo[v] & (tipo[v] - 1)) ? 1 : 0;
// Taubin: ogni vertice con i vicini del suo tipo; i vertici di giunzione solo lungo la linea di giunzione (fermi se non hanno due vicini sulla linea)
{ const nb = Array.from({ length: nvT }, () => new Set());
  for (let t = 1; t <= 3; t++) for (let q = 0; q < FT[t].length; q += 3) for (let e = 0; e < 3; e++) { const a = FT[t][q + e], b = FT[t][q + (e + 1) % 3];
    if (giunz[a] && giunz[b]) { nb[a].add(b); nb[b].add(a); } else { if (!giunz[a]) nb[a].add(b); if (!giunz[b]) nb[b].add(a); } }
  const NB = nb.map((s, v) => giunz[v] && s.size !== 2 ? [] : [...s]);
  for (let it = 0; it < GIRI_LISCIA; it++) { const lam = it % 2 ? -0.53 : 0.5, q = pos.slice();
    for (let v = 0; v < nvT; v++) { const Lv = NB[v]; if (!Lv.length) continue; for (let r = 0; r < 3; r++) { let s = 0; for (const u of Lv) s += pos[3 * u + r]; q[3 * v + r] += lam * (s / Lv.length - pos[3 * v + r]); } }
    pos = q; } }
/* (prima della riduzione, che conserva così le pieghe fini di BASE) fuori dalla zona delle origini: vertici riportati sulla superficie di BASE (punto più vicino della propria parte; sulla giunzione la più vicina
   delle due), con peso 1 − W; non dove il punto di BASE cade a meno di `GAP_MOLLI` da un ostacolo (lì BASE compenetrava). I vertici della sola faccia di
   contatto seguono i vicini (spostamento medio, `GIRI_SPOST` passate). */
const VICINO_BASE = [0.04, 0.12];   // cm: si riportano su BASE i vertici che ne distano meno (non quelli del riempimento in fondo al solco)
const vicinoTri = (Pp, I) => { const h = 0.2, Hm = new Map(), key = (a, b, c) => a + ',' + b + ',' + c;
  for (let t = 0; t < I.length; t += 3) { const lo3 = [0, 1, 2].map(k => Math.floor(Math.min(Pp[3 * I[t] + k], Pp[3 * I[t + 1] + k], Pp[3 * I[t + 2] + k]) / h)), hi3 = [0, 1, 2].map(k => Math.floor(Math.max(Pp[3 * I[t] + k], Pp[3 * I[t + 1] + k], Pp[3 * I[t + 2] + k]) / h));
    for (let x = lo3[0]; x <= hi3[0]; x++) for (let y = lo3[1]; y <= hi3[1]; y++) for (let z = lo3[2]; z <= hi3[2]; z++) { const k = key(x, y, z); if (!Hm.has(k)) Hm.set(k, []); Hm.get(k).push(t); } }
  // punto più vicino su un triangolo (Ericson), con coordinate baricentriche
  const tri = (p, a, b, c) => { const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dt(ab, ap), d2 = dt(ac, ap); if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
    const bp = sub(p, b), d3 = dt(ab, bp), d4 = dt(ac, bp); if (d3 >= 0 && d4 <= d3) return [0, 1, 0]; const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
    const cp = sub(p, c), d5 = dt(ab, cp), d6 = dt(ac, cp); if (d6 >= 0 && d5 <= d6) return [0, 0, 1]; const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [1 - v - w, v, w]; };
  const V = i => [Pp[3 * i], Pp[3 * i + 1], Pp[3 * i + 2]];
  return p => { const c = p.map(x => Math.floor(x / h)), r = Math.ceil(R_RIPORTA / h); let best = null, bd = R_RIPORTA, visti = new Set();
    for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) for (const t of Hm.get(key(c[0] + x, c[1] + y, c[2] + z)) || []) {
      if (visti.has(t)) continue; visti.add(t); const A = V(I[t]), Bv = V(I[t + 1]), Cv = V(I[t + 2]), w = tri(p, A, Bv, Cv), q = [0, 1, 2].map(k => w[0] * A[k] + w[1] * Bv[k] + w[2] * Cv[k]), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (d < bd) { bd = d; best = { q, d, t, w }; } }
    return best; }; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const piuVicino = { delt_cl: vicinoTri(P.delt_cl.pos, P.delt_cl.idx), delt_ac: vicinoTri(P.delt_ac.pos, P.delt_ac.idx) };
const NB0 = Array.from({ length: nvT }, () => new Set()); for (let t = 1; t <= 3; t++) for (let q = 0; q < FT[t].length; q += 3) for (let e = 0; e < 3; e++) { const a = FT[t][q + e], b = FT[t][q + (e + 1) % 3]; NB0[a].add(b); NB0[b].add(a); }
{ const sp = new Float64Array(3 * nvT), fisso = new Uint8Array(nvT), usato = new Uint8Array(nvT); let riportati = 0; for (let k = 1; k <= 3; k++) for (const v of FT[k]) usato[v] |= 1 << (k - 1);
  for (let v = 0; v < nvT; v++) { const tp = usato[v]; if (!(tp & 3)) continue; fisso[v] = 1; const p = [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]], w = sample(W, ...p); if (w >= 1) continue;
    const cand = []; if (tp & 1) { const c = piuVicino.delt_cl(p); if (c) cand.push({ ...c, altra: S.delt_ac }); } if (tp & 2) { const c = piuVicino.delt_ac(p); if (c) cand.push({ ...c, altra: S.delt_cl }); }
    const b = cand.sort((x, y) => x.d - y.d)[0]; if (!b) continue;
    // margine: del tutto solo se il punto di BASE è ad almeno `GAP_MOLLI` + `MARGINE` dagli ostacoli e fuori dall'altra parte (in BASE si compenetravano)
    const g = Math.min(Math.max(-sample(Osp, ...b.q) / MARGINE, 0), 1) * Math.min(Math.max((sample(b.altra, ...b.q) - GAP_MOLLI) / MARGINE, 0), 1), f = (1 - w) * g * (1 - G.sstep(VICINO_BASE[0], VICINO_BASE[1], b.d)); if (f <= 0) continue;
    for (let k = 0; k < 3; k++) sp[3 * v + k] = f * (b.q[k] - p[k]); riportati++; }
  for (let it = 0; it < GIRI_SPOST; it++) for (let v = 0; v < nvT; v++) { if (fisso[v] || !NB0[v].size) continue; const s = [0, 0, 0]; for (const u of NB0[v]) for (let k = 0; k < 3; k++) s[k] += sp[3 * u + k]; for (let k = 0; k < 3; k++) sp[3 * v + k] = s[k] / NB0[v].size; }
  // triangoli che si girerebbero (BASE ha pieghe): lo spostamento dei loro vertici si dimezza, fino a `GIRI_PIEGHE` volte
  const p0 = pos.slice(), fN = (P_, a, b, c) => { const u = [0, 1, 2].map(k => P_[3 * b + k] - P_[3 * a + k]), w = [0, 1, 2].map(k => P_[3 * c + k] - P_[3 * a + k]), f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...f) || 1; return f.map(x => x / l); };
  let girati = 0;
  for (let it = 0; it <= GIRI_PIEGHE; it++) { for (let i = 0; i < 3 * nvT; i++) pos[i] = p0[i] + sp[i]; if (it === GIRI_PIEGHE) break; const dim = new Uint8Array(nvT); girati = 0;
    for (let k = 1; k <= 3; k++) for (let q = 0; q < FT[k].length; q += 3) { const [a, b, c] = [FT[k][q], FT[k][q + 1], FT[k][q + 2]], n0 = fN(p0, a, b, c), n1 = fN(pos, a, b, c);
      if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.3) { dim[a] = dim[b] = dim[c] = 1; girati++; } }
    if (!girati) break; for (let v = 0; v < nvT; v++) if (dim[v]) for (let k = 0; k < 3; k++) sp[3 * v + k] *= 0.5; }
  log('vertici riportati sulla superficie di BASE (fuori dalla zona delle origini):', riportati, '; triangoli girati rimasti', girati); }
// riduzione a quadriche per tipo, con i vertici di giunzione fermi (restano gli stessi nelle due parti)
{ const nt = t => FT[t].length / 3, rc = P.delt_cl.idx.length / 3 * TRI / nt(1), ra = P.delt_ac.idx.length / 3 * TRI / nt(2), rr = { 1: rc, 2: ra, 3: (rc + ra) / 2 };
  const nuova = Float64Array.from(pos);
  for (let t = 1; t <= 3; t++) { const r = B.riduci(pos, Uint32Array.from(FT[t]), Math.round(nt(t) * Math.min(1, rr[t])), giunz);
    FT[t] = Array.from(r.idx); const usati = new Uint8Array(nvT); for (const v of FT[t]) usati[v] = 1; for (let v = 0; v < nvT; v++) if (usati[v] && !giunz[v]) for (let k = 0; k < 3; k++) nuova[3 * v + k] = r.pos[3 * v + k]; }
  pos = nuova;
  log('ridotta: triangoli esterni clavicolare', nt(1), ', acromiale', nt(2), ', contatto', nt(3)); }
// normali: delle facce esterne insieme (i vertici della linea di giunzione hanno la stessa normale nelle due parti: niente stacco di luce) e della faccia di contatto
const normaliTipo = tipi => { const nn0 = new Float64Array(3 * nvT), nb = Array.from({ length: nvT }, () => new Set());
  for (const t of tipi) for (let q = 0; q < FT[t].length; q += 3) { const T = [FT[t][q], FT[t][q + 1], FT[t][q + 2]];
    const u = [0, 1, 2].map(r => pos[3 * T[1] + r] - pos[3 * T[0] + r]), w = [0, 1, 2].map(r => pos[3 * T[2] + r] - pos[3 * T[0] + r]), f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const v of T) { for (let r = 0; r < 3; r++) nn0[3 * v + r] += f[r]; for (const x of T) if (x !== v) nb[v].add(x); } }
  let nn = nn0; for (let d = 0; d < NORM_DIFF; d++) { const q = nn.slice(); for (let v = 0; v < nvT; v++) { const s = nb[v]; if (!s.size) continue; for (const u of s) for (let r = 0; r < 3; r++) q[3 * v + r] += nn[3 * u + r] / s.size; } nn = q; }
  return nn; };
const NE = normaliTipo([1, 2]), NC = normaliTipo([3]);
// fuori dalla zona delle origini le normali delle facce esterne sono quelle di BASE nel punto più vicino (interpolate sul triangolo), con peso 1 − W
{ const usati = new Uint8Array(nvT); for (const t of [1, 2]) for (const v of FT[t]) usati[v] = t;
  for (let v = 0; v < nvT; v++) { if (!usati[v]) continue; const p = [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]], w = sample(W, ...p); if (w >= 1) continue;
    const n = usati[v] === 1 ? 'delt_cl' : 'delt_ac', b = piuVicino[n](p); if (!b || b.d > 0.05) continue; const I = P[n].idx, Nb = P[n].nrm, l0 = Math.hypot(NE[3 * v], NE[3 * v + 1], NE[3 * v + 2]) || 1;
    const nb = [0, 1, 2].map(k => b.w[0] * Nb[3 * I[b.t] + k] + b.w[1] * Nb[3 * I[b.t + 1] + k] + b.w[2] * Nb[3 * I[b.t + 2] + k]), l1 = Math.hypot(...nb) || 1;
    // (solo dove la normale di BASE è concorde con quella nuova: dove BASE ha pieghe o normali rovesciate resta la nuova)
    const c = (nb[0] * NE[3 * v] + nb[1] * NE[3 * v + 1] + nb[2] * NE[3 * v + 2]) / (l0 * l1), u = (1 - w) * G.sstep(0.3, 0.7, c);
    for (let k = 0; k < 3; k++) NE[3 * v + k] = (1 - u) * NE[3 * v + k] / l0 + u * nb[k] / l1; } }
const R = {};
for (const [n, te, sg] of [['delt_cl', 1, 1], ['delt_ac', 2, -1]]) {
  // vertici propri: faccia esterna e faccia di contatto hanno copie separate dei vertici della giunzione (normali diverse: spigolo vivo)
  const mapE = new Map(), mapC = new Map(), pv = [], nr = [], idx = [];
  const add = (map, v, Nn, s) => { let w = map.get(v); if (w === undefined) { w = pv.length / 3; map.set(v, w); const l = Math.hypot(Nn[3 * v], Nn[3 * v + 1], Nn[3 * v + 2]) || 1;
    for (let r = 0; r < 3; r++) { pv.push(pos[3 * v + r]); nr.push(Math.round(127 * s * Nn[3 * v + r] / l)); } } return w; };
  for (let q = 0; q < FT[te].length; q += 3) idx.push(add(mapE, FT[te][q], NE, 1), add(mapE, FT[te][q + 1], NE, 1), add(mapE, FT[te][q + 2], NE, 1));
  for (let q = 0; q < FT[3].length; q += 3) { const T = [add(mapC, FT[3][q], NC, sg), add(mapC, FT[3][q + 1], NC, sg), add(mapC, FT[3][q + 2], NC, sg)]; if (sg < 0) T.reverse(); idx.push(...T); }
  const nv = pv.length / 3, p32 = Float32Array.from(pv);
  // tag e direzioni delle fibre dal vertice di BASE più vicino
  const near = vicino(P[n].pos, P[n].nv), tag = P[n].tag ? new Uint8Array(nv) : null, fdir = P[n].fdir ? new Int8Array(nv * 3) : null;
  // (interpolati sul triangolo di BASE più vicino, come nella pagina: la parte tendinea resta quella di prima; altrimenti dal vertice più vicino)
  for (let i = 0; i < nv; i++) { const p = [p32[3 * i], p32[3 * i + 1], p32[3 * i + 2]], b = piuVicino[n](p);
    if (b) { const T = [P[n].idx[b.t], P[n].idx[b.t + 1], P[n].idx[b.t + 2]];
      if (tag) tag[i] = Math.round(b.w[0] * P[n].tag[T[0]] + b.w[1] * P[n].tag[T[1]] + b.w[2] * P[n].tag[T[2]]);
      if (fdir) { const d = [0, 1, 2].map(k => b.w[0] * P[n].fdir[3 * T[0] + k] + b.w[1] * P[n].fdir[3 * T[1] + k] + b.w[2] * P[n].fdir[3 * T[2] + k]), l = Math.hypot(...d) || 1; for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(127 * d[k] / l); }
      continue; }
    const j = near(p); if (tag) tag[i] = P[n].tag[j]; if (fdir) for (let k = 0; k < 3; k++) fdir[3 * i + k] = P[n].fdir[3 * j + k]; }
  if (tag) for (const w of mapC.values()) tag[w] = TAGLIO;   // faccia di contatto: colore della superficie di taglio del muscolo (visibile solo con l'altra parte spenta)
  R[n] = { pos: p32, idx: Uint32Array.from(idx), tag, fdir, nrm: Int8Array.from(nr), nEst: FT[te].length };   // nEst: indici della faccia esterna (la faccia di contatto segue)
}
/* estremità distale: sotto `Y_BASE` la superficie nuova è tagliata e sostituita dai triangoli di BASE (tagliati con lo stesso piano); i vertici del
   bordo nuovo vanno sul punto più vicino del bordo di BASE, così le due parti del taglio combaciano */
for (const n of PARTI) {
  const r = R[n], nv = r.pos.length / 3, at = new Float64Array(nv * 7), A0 = new Float64Array(P[n].nv * 7);
  for (let i = 0; i < nv; i++) { at[7 * i] = r.tag ? r.tag[i] : 0; for (let k = 0; k < 3; k++) { at[7 * i + 1 + k] = r.fdir ? r.fdir[3 * i + k] : 0; at[7 * i + 4 + k] = r.nrm[3 * i + k] / 127; } }
  for (let i = 0; i < P[n].nv; i++) { A0[7 * i] = P[n].tag ? P[n].tag[i] : 0; for (let k = 0; k < 3; k++) { A0[7 * i + 1 + k] = P[n].fdir ? P[n].fdir[3 * i + k] : 0; A0[7 * i + 4 + k] = P[n].nrm[3 * i + k]; } }
  const sN = Float64Array.from({ length: nv }, (_, i) => r.pos[3 * i + 1] - Y_BASE), sB = Float64Array.from({ length: P[n].nv }, (_, i) => Y_BASE - P[n].pos[3 * i + 1]);
  const cN = B.ritagliaCampo(r.pos, r.idx, sN, at, 7), cB = B.ritagliaCampo(P[n].pos, P[n].idx, sB, A0, 7);
  // bordo di BASE: segmenti dei triangoli tagliati con i due estremi sul piano
  const segB = [], nB = cB.pos.length / 3, sulB = i => cB.s[i] === 0 && cB.orig[i] < 0;
  for (let q = 0; q < cB.idx.length; q += 3) for (let e = 0; e < 3; e++) { const a = cB.idx[q + e], b = cB.idx[q + (e + 1) % 3]; if (sulB(a) && sulB(b) && a < b) segB.push(a, b); }
  let spostMax = 0; const nN = cN.pos.length / 3, pos = Float64Array.from([...cN.pos, ...cB.pos]);
  for (let i = 0; i < nN; i++) { if (!(cN.s[i] === 0 && cN.orig[i] < 0)) continue; const p = [cN.pos[3 * i], cN.pos[3 * i + 1], cN.pos[3 * i + 2]]; let best = null, bd = 1e9;
    for (let s = 0; s < segB.length; s += 2) { const a = [cB.pos[3 * segB[s]], cB.pos[3 * segB[s] + 1], cB.pos[3 * segB[s] + 2]], b = [cB.pos[3 * segB[s + 1]], cB.pos[3 * segB[s + 1] + 1], cB.pos[3 * segB[s + 1] + 2]], ab = sub(b, a), l2 = dt(ab, ab) || 1e-12, u = Math.min(Math.max(dt(sub(p, a), ab) / l2, 0), 1), q = [0, 1, 2].map(k => a[k] + u * ab[k]), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < bd) { bd = d; best = q; } }
    if (best && bd < 0.1) { for (let k = 0; k < 3; k++) pos[3 * i + k] = best[k]; spostMax = Math.max(spostMax, bd); } }
  const idxN = Array.from(cN.idx), idxB = Array.from(cB.idx, v => v + nN), at2 = [...cN.attr, ...cB.attr], nvT2 = nN + nB;
  const contatto = q => at2[7 * idxN[q]] === TAGLIO && at2[7 * idxN[q + 1]] === TAGLIO && at2[7 * idxN[q + 2]] === TAGLIO, est = [], con = [];
  for (let q = 0; q < idxN.length; q += 3) (contatto(q) ? con : est).push(idxN[q], idxN[q + 1], idxN[q + 2]);
  const tag = r.tag ? Uint8Array.from({ length: nvT2 }, (_, i) => Math.round(at2[7 * i])) : null, fdir = r.fdir ? Int8Array.from({ length: nvT2 * 3 }, (_, j) => { const i = (j / 3) | 0, k = j % 3, d = [1, 2, 3].map(m => at2[7 * i + m]), l = Math.hypot(...d) || 1; return Math.round(127 * d[k] / l); }) : null;
  const nrm = Int8Array.from({ length: nvT2 * 3 }, (_, j) => { const i = (j / 3) | 0, k = j % 3, d = [4, 5, 6].map(m => at2[7 * i + m]), l = Math.hypot(...d) || 1; return Math.round(127 * d[k] / l); });
  R[n] = { pos: Float32Array.from(pos), idx: Uint32Array.from([...est, ...idxB, ...con]), tag, fdir, nrm, nEst: est.length + idxB.length };
  log(n, ':', nvT2, 'vertici,', R[n].idx.length / 3, 'triangoli (BASE', P[n].nv, 'vertici,', P[n].idx.length / 3, 'triangoli); sotto y', Y_BASE, 'triangoli di BASE, bordo nuovo spostato al massimo di', (spostMax * 10).toFixed(2), 'mm');
}

/* ---- controlli ---- */
const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const raggio = (o, d, [a, b, c]) => { const e1 = sub(b, a), e2 = sub(c, a), pv = cr(d, e2), det = dt(e1, pv); if (Math.abs(det) < 1e-12) return null; const iv = 1 / det, s0 = sub(o, a), u = dt(s0, pv) * iv; if (u < 0 || u > 1) return null;
  const qv = cr(s0, e1), v = dt(d, qv) * iv; if (v < 0 || u + v > 1) return null; const t = dt(e2, qv) * iv; return t > 0 && t < 1; };
// triangoli di A (Pp, I) che si incrociano con quelli di B (Q, J)
const incroci = (Pp, I, Q, J) => { const Cc = 0.3, h = new Map(), TA = [];
  for (let t = 0; t < J.length; t += 3) { const v = [0, 1, 2].map(k => [Q[3 * J[t + k]], Q[3 * J[t + k] + 1], Q[3 * J[t + k] + 2]]); const ti = TA.length; TA.push(v);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(v[0][q], v[1][q], v[2][q]) / Cc)), b = [0, 1, 2].map(q => Math.floor(Math.max(v[0][q], v[1][q], v[2][q]) / Cc));
    for (let x = a[0]; x <= b[0]; x++) for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) { const k = x + ',' + y + ',' + z; if (!h.has(k)) h.set(k, []); h.get(k).push(ti); } }
  let n = 0;
  for (let t = 0; t < I.length; t += 3) { const A = [0, 1, 2].map(k => [Pp[3 * I[t + k]], Pp[3 * I[t + k] + 1], Pp[3 * I[t + k] + 2]]);
    const a = [0, 1, 2].map(q => Math.floor(Math.min(A[0][q], A[1][q], A[2][q]) / Cc)), b = [0, 1, 2].map(q => Math.floor(Math.max(A[0][q], A[1][q], A[2][q]) / Cc)), visti = new Set(); let o = false;
    for (let x = a[0]; x <= b[0] && !o; x++) for (let y = a[1]; y <= b[1] && !o; y++) for (let z = a[2]; z <= b[2] && !o; z++) for (const u of h.get(x + ',' + y + ',' + z) || []) {
      if (visti.has(u)) continue; visti.add(u); const Bt = TA[u]; if (A.some(a => Bt.some(b => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-6))) continue;   // vertice in comune (linea di giunzione): non è un incrocio
      for (let e = 0; e < 3 && !o; e++) o = raggio(A[e], sub(A[(e + 1) % 3], A[e]), Bt) || raggio(Bt[e], sub(Bt[(e + 1) % 3], Bt[e]), A); if (o) break; }
    if (o) n++; }
  return n; };
log('triangoli che si incrociano, clavicolare con acromiale (BASE → nuovo, facce esterne: la faccia di contatto è in comune):', incroci(P.delt_cl.pos, P.delt_cl.idx, P.delt_ac.pos, P.delt_ac.idx), '→',
  incroci(R.delt_cl.pos, R.delt_cl.idx.subarray(0, R.delt_cl.nEst), R.delt_ac.pos, R.delt_ac.idx.subarray(0, R.delt_ac.nEst)));
for (const n of PARTI) log(n, ', triangoli che si incrociano (BASE → nuovo):', [...OSSA, ...MOLLI, 'delt_sp'].map(o => { const Q = REAL(o);
  const a = incroci(P[n].pos, P[n].idx, Q.pos, Q.idx), b = incroci(R[n].pos, R[n].idx, Q.pos, Q.idx); return a || b ? `${o} ${a} → ${b}` : null; }).filter(Boolean).join(', ') || 'nessuno');
// scarto dalla forma di BASE: vertici nuovi fuori dalle zone riempite e lontano dagli ostacoli, distanza dalla superficie di BASE
for (const n of PARTI) { const { pos } = R[n], v = []; for (let i = 0; i < pos.length / 3; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    if (sample(C, ...p) > 0.05 && sample(Ob, ...p) < -0.1) v.push(Math.abs(sample(S[n], ...p))); }
  v.sort((a, b) => a - b); log(n, ': scarto dalla superficie di BASE fuori dai riempimenti (mm): mediana', (v[v.length >> 1] * 10).toFixed(2), ', 99%', (v[Math.floor(v.length * 0.99)] * 10).toFixed(2), ', massimo', (v[v.length - 1] * 10).toFixed(2)); }

if (process.env.PROVA) log('PROVA: nessuna scrittura');
else { for (const n of PARTI) G.setMesh(n, R[n]); saveFile(repack()); }
