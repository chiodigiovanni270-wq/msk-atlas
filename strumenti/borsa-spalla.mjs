/* Borsa subacromion-deltoidea (SAD) della spalla (modelli/spalla-3d.html): cuscinetto sottile e chiuso, a margine liscio e arrotondato, tra
   sovraspinato e infraspinato (sotto) e deltoide e arco coracoacromiale (sopra).

   Uso (dalla cartella del progetto):
     node strumenti/borsa-spalla.mjs                  → scrive la mesh `borsa_sad` nel file del modello (~1 min)
     PROVA=1 node strumenti/borsa-spalla.mjs          → calcola e stampa i controlli senza scrivere
     VERIFICA=1 node strumenti/borsa-spalla.mjs       → stampa i controlli della mesh già nel file, senza ricostruirla
     MODELLO=/tmp/copia.html node strumenti/borsa-spalla.mjs   → lavora su una copia
   Ultimo della catena: va lanciato dopo `muscoli-spalla.mjs` (legge cuffia, ossa, capsula e cartilagine dal file, non li tocca); si può rilanciare
   (riscrive solo `borsa_sad`). La pagina disegna la borsa a faccia singola (come la capsula): vedi `bozza-spalla.mjs` (sostituzione «borsa a faccia singola»).

   Metodo: la borsa è un cuscinetto chiuso costruito su una superficie media, non uno strato ritagliato da un campo (il ritaglio lasciava il margine
   frastagliato, con pezzi staccati e chiazze). Il perimetro è un ovale sulla calotta della testa omerale, un po' più esteso davanti che dietro.
   1. Supporto: cuffia (sovra e sottospinato), capsula e omero (sul trochite la cuffia è sottile e la borsa poggia anche sull'osso), con chiusura
      morfologica di raggio `CHIUSURA` (colma gli interstizi) e sfocatura (`LISCIA`): la superficie media è a distanza `MEZZO` da questo campo e ne segue
      la forma generale, non le piccole irregolarità dei tendini.
   2. Impronta: campo in cm, positivo dentro. Ovale in coordinate angolari attorno al centro della testa (sfera ai minimi quadrati sulla cartilagine):
      direzione centrale `DIR`, semiampiezze `OVALE` (anteriore, posteriore, laterale, mediale) in gradi; limitato dalla distanza da scapola e clavicola
      (almeno `OSSO_MIN`: sotto l'acromion la borsa finisce prima) e dall'omero (`OMERO_MIN`). Sfocato (`SFUMA`), arretrato di `MARGINE`, aperto
      (`APERTURA`: toglie code e appendici più strette di 2·`APERTURA`) e chiuso (`CHIUSO_IMPRONTA`: colma le incisure), sfocato ancora: il margine è un
      ovale regolare, senza rientranze a V.
   3. Superficie media: isosuperficie tagliata esattamente dove l'impronta vale 0 (triangoli tagliati, vertici sull'isolinea), levigata (`LEV_SUP`, Taubin)
      e poi il margine levigato lungo la curva (`BORDO`). Si tengono i pezzi con almeno `PEZZO` dei triangoli.
   4. Riduzione (quadriche) della sola parte interna: i vertici del margine e della fascia `RIM` restano fermi, l'interno scende a circa `DENS`
      triangoli per cm² per faccia.
   5. Sollevamento: dove la cuffia reale sporge sotto la faccia inferiore (distanza < `SPESS` + `GAP`; le punte della mesh BodyParts3D cadono tra i vertici
      della mesh ridotta, perciò il massimo è preso sui vertici della mesh densa entro `RAGGIO_ALZA`) la superficie si alza lungo la normale, con il
      sollevamento esteso di `ALZA_ANELLI` anelli e mediato: la borsa si appoggia sulla cuffia come un telo.
   6. Cuscinetto: distanza geodetica dal margine; semispessore `SPESS` all'interno, che scende a zero sul margine con profilo ellittico su una larghezza
      `RIM` (bordo arrotondato, le due facce si uniscono sugli stessi vertici: mesh chiusa), ridotto dove supporto e ossa lasciano meno spazio (`GAP`,
      minimo `HMIN`). Facce a ± semispessore lungo la normale del campo sfocato; normali di vertice scritte nel file (`nm`): normale della superficie
      media sulle facce, pendenza del profilo (direzione verso l'interno levigata) sul bordo.
   Controlli stampati: mesh chiusa (ogni spigolo in due triangoli), volume positivo, ingombro, distanza minima dalla cuffia (ai vertici e in tre punti per
   triangolo), dalle ossa, dalla faccia profonda e dalle strutture soprastanti (deltoide, coracoacromiale, acromioclavicolare); un valore negativo è una
   compenetrazione (tra le strutture soprastanti ce ne sono in tutta la zona dove il deltoide poggia sulla cuffia: lì lo spazio per la borsa non c'è). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { riduci, compatta, vicini, diffondi, clamp } = await import('./lib-bp3d.mjs');
const { REAL, setMesh, saveFile, repack, log, griglia, esatta, sdf, unione, valuta, nets, sample } = G;

const OMERO_MIN = 0.09, LEV_SUP = 60, CHIUSO_IMPRONTA = 1.1, OSSO_MIN = 0.14, CHIUSURA = 0.15, MARGINE = 0.04, RAGGIO_ALZA = 0.12, ALZA_ANELLI = 4, APERTURA = 0.45, MEZZO = 0.115, SPESS = 0.06, RIM = 0.22, GAP = 0.02, HMIN = 0.004, LIB = 0.02, PROF = 0.1, PASSO = 0.035, LISCIA = 26, SFUMA = 45, BORDO = 150, PEZZO = 0.03, DENS = 450;   // cm
// impronta ovale sulla calotta della testa: direzione centrale `DIR` dal centro della testa (x verso mediale, y su, z avanti) e semiampiezze angolari in gradi
// (anteriore, posteriore, laterale, mediale); la borsa si estende un po' più davanti che dietro, come sul sovraspinato e sul solco bicipitale
const DIR = [-0.51, 0.85, -0.12], OVALE = { ant: 58, post: 47, lat: 38, med: 46 }, RAGGIO_IMPRONTA = 2.4;
const CUFFIA = ['supra', 'infra'], OSSA = ['scapola', 'clavicola', 'omero'], SOPRA_OSSA = ['scapola', 'clavicola'], PROFONDI = ['omero', 'caps', 'cart_omero'];
const SUPPORTO = ['supra', 'infra', 'caps', 'omero', 'cart_omero'];   // la borsa poggia su cuffia, capsula e omero (oltre la cuffia, sul trochite)
const SOPRA = ['delt_cl', 'delt_ac', 'delt_sp', 'cal', 'ac_leg'];

// centro della testa omerale: sfera ai minimi quadrati sui vertici della cartilagine (x² + y² + z² = 2ax + 2by + 2cz + d)
const cT = (() => { const p = REAL('cart_omero').pos, M = Array.from({ length: 4 }, () => new Float64Array(5));
  for (let i = 0; i < p.length; i += 3) { const r = [2 * p[i], 2 * p[i + 1], 2 * p[i + 2], 1], b = p[i] ** 2 + p[i + 1] ** 2 + p[i + 2] ** 2; for (let j = 0; j < 4; j++) { for (let k = 0; k < 4; k++) M[j][k] += r[j] * r[k]; M[j][4] += r[j] * b; } }
  for (let c = 0; c < 4; c++) { let m = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r; [M[c], M[m]] = [M[m], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 5; k++) M[r][k] -= f * M[c][k]; } }
  return [0, 1, 2].map(j => M[j][4] / M[j][j]); })();
log('centro testa omerale', cT.map(v => v.toFixed(2)).join(', '));

griglia([cT[0] - 3.7, cT[1] - 0.8, cT[2] - 3.7], [cT[0] + 2.3, cT[1] + 4.4, cT[2] + 3.7], PASSO, 0.1);
log('griglia', G.NX, G.NY, G.NZ);
const campo = nomi => esatta(sdf(unione(nomi)).F, nomi, 0.12);
const Fc = campo(CUFFIA), Fb = campo(OSSA), Fp = campo(PROFONDI), Fsc = campo(SOPRA_OSSA);
// supporto: campo esatto per sollevamento e spessore; campo chiuso (chiusura di raggio `CHIUSURA`: colma gli interstizi tra cuffia e capsula) e sfocato per la superficie media
const Fq = (() => { const { F, Do } = sdf(unione(SUPPORTO)); return { esatto: esatta(F, SUPPORTO, 0.12), Do }; })();
const Fs = G.sfoca(G.chiuso(Fq.Do, CHIUSURA), LISCIA);
log('campi pronti');

/* ---- controlli ---- */
const SOPRA_OK = SOPRA.filter(n => { try { REAL(n); return true; } catch { return false; } });
const FS = Object.fromEntries(SOPRA_OK.map(n => [n, campo([n])]));
function controlli(m) {
  const ec = new Map(), nvm = m.pos.length / 3; let vol = 0, ar = 0;
  for (let t = 0; t < m.idx.length; t += 3) { const q = [0, 1, 2].map(k => m.idx[t + k]);
    for (let k = 0; k < 3; k++) { const a = q[k], b = q[(k + 1) % 3], key = a * nvm + b; ec.set(key, (ec.get(key) || 0) + 1); }
    const [a, b, c] = q.map(i => [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]]);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; ar += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2; }
  let aperti = 0; for (const [key, n] of ec) { const a = Math.floor(key / nvm), b = key % nvm; if (n !== 1 || ec.get(b * nvm + a) !== 1) aperti++; }
  log('borsa_sad', m.idx.length / 3, 'triangoli,', nvm, 'vertici; spigoli non accoppiati:', aperti, '; volume', vol.toFixed(3), 'cm³; area', ar.toFixed(1), 'cm²');
  { const bb = [[1e9, -1e9], [1e9, -1e9], [1e9, -1e9]]; for (let i = 0; i < nvm; i++) for (let k = 0; k < 3; k++) { bb[k][0] = Math.min(bb[k][0], m.pos[3 * i + k]); bb[k][1] = Math.max(bb[k][1], m.pos[3 * i + k]); }
    log('  ingombro x', bb[0].map(v => v.toFixed(2)).join('…'), 'y', bb[1].map(v => v.toFixed(2)).join('…'), 'z', bb[2].map(v => v.toFixed(2)).join('…')); }
  const stat = (nome, F) => { let mn = 1e9, sotto = 0; for (let i = 0; i < nvm; i++) { const s = sample(F, m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]); if (s < mn) mn = s; if (s < 0) sotto++; }
    log('  distanza minima da', nome + ':', (mn * 10).toFixed(2), 'mm;', sotto, 'vertici dentro'); };
  stat('cuffia (sopra/infraspinato)', Fc); stat('ossa', Fb); stat('faccia profonda (omero, capsula, cartilagine)', Fp);
  { let dentro = 0, mn = 1e9; for (let t = 0; t < m.idx.length; t += 3) { const [a, b, c] = [0, 1, 2].map(k => [m.pos[3 * m.idx[t + k]], m.pos[3 * m.idx[t + k] + 1], m.pos[3 * m.idx[t + k] + 2]]);
      let tmn = 1e9; for (const [u, v, w] of [[1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5]]) tmn = Math.min(tmn, sample(Fc, ...[0, 1, 2].map(q => a[q] * u + b[q] * v + c[q] * w)));
      if (tmn < 0) dentro++; mn = Math.min(mn, tmn); }
    log('  triangoli con un punto (centro, metà spigoli) dentro la cuffia:', dentro, 'di', m.idx.length / 3, '; minimo', (mn * 10).toFixed(2), 'mm'); }
  for (const n of SOPRA_OK) stat(n, FS[n]);
}
if (process.env.VERIFICA) { controlli(REAL('borsa_sad')); process.exit(0); }

// impronta: positiva dentro, in cm; sfocata perché il margine sia una curva dolce
// base dell'ovale: asse centrale, asse antero-posteriore e asse mediolaterale
const nrmz = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const D0 = nrmz(DIR), AP = nrmz([0, 0, 1].map((x, k) => x - D0[2] * D0[k])), ML = [D0[1] * AP[2] - D0[2] * AP[1], D0[2] * AP[0] - D0[0] * AP[2], D0[0] * AP[1] - D0[1] * AP[0]];
const sinD = g => Math.sin(g * Math.PI / 180);
let k0 = 0;
const Mk = valuta(p => { const id = k0++, v = [0, 1, 2].map(k => p[k] - cT[k]), l = Math.hypot(...v) || 1, u = v.map(x => x / l);
  const c = u[0] * D0[0] + u[1] * D0[1] + u[2] * D0[2], a = u[0] * AP[0] + u[1] * AP[1] + u[2] * AP[2], b = u[0] * ML[0] + u[1] * ML[1] + u[2] * ML[2];
  const e = c <= 0 ? 9 : Math.hypot(a / sinD(a >= 0 ? OVALE.ant : OVALE.post), b / sinD(b >= 0 ? OVALE.med : OVALE.lat));
  return Math.min((1 - e) * RAGGIO_IMPRONTA, Fsc[id] - Math.max(SPESS + GAP, OSSO_MIN), Fb[id] - OMERO_MIN); });
G.sfoca(Mk, SFUMA);
// apertura morfologica (erosione e dilatazione di raggio `APERTURA`; il margine arretra di `MARGINE` rispetto alle distanze richieste, perché la sfocatura
// le sfora ai bordi): toglie code e appendici più strette di 2·APERTURA e arrotonda gli angoli convessi;
// il campo torna a una distanza con segno dal bordo (saturata a APERTURA all'interno), ancora sfocata per togliere la gradinatura dei voxel
{ const B = new Uint8Array(G.N), R = new Uint8Array(G.N); for (let i = 0; i < G.N; i++) B[i] = Mk[i] > MARGINE ? 1 : 0;
  const E = G.edt(B, true); for (let i = 0; i < G.N; i++) R[i] = E[i] > APERTURA ? 1 : 0;
  const D = G.edt(R); for (let i = 0; i < G.N; i++) Mk[i] = Math.min(APERTURA - D[i], 1);
  // poi chiusura (dilatazione ed erosione di raggio `CHIUSO_IMPRONTA`): colma le rientranze, il margine resta ovale senza incisure
  const C2 = new Uint8Array(G.N); for (let i = 0; i < G.N; i++) C2[i] = Mk[i] > 0 ? 1 : 0;
  const F2 = G.chiuso(G.edt(C2), CHIUSO_IMPRONTA); for (let i = 0; i < G.N; i++) Mk[i] = Math.min(-F2[i], 1); G.sfoca(Mk, 16); }
// superficie media (solo dove l'impronta è vicina a positiva: il ritaglio esatto è sulla mesh)
k0 = 0;
const V = valuta(() => { const id = k0++; return Mk[id] > -0.3 ? Fs[id] - MEZZO : 1; });
const m0 = nets(V, () => [0, 1, 0]);
log('superficie media', m0.idx.length / 3, 'triangoli');

/* ---- ritaglio esatto sull'isolinea 0 dell'impronta ---- */
let pos = [], idx = [];
{ const P0 = m0.pos, nv0 = P0.length / 3, val = new Float64Array(nv0);
  for (let i = 0; i < nv0; i++) val[i] = sample(Mk, P0[3 * i], P0[3 * i + 1], P0[3 * i + 2]);
  const nuovo = new Map(), mappa = new Int32Array(nv0).fill(-1);
  const vert = i => { if (mappa[i] < 0) { mappa[i] = pos.length / 3; pos.push(P0[3 * i], P0[3 * i + 1], P0[3 * i + 2]); } return mappa[i]; };
  const taglio = (a, b) => { const k = a < b ? a * nv0 + b : b * nv0 + a; let r = nuovo.get(k); if (r !== undefined) return r;
    const t = val[a] / (val[a] - val[b]); r = pos.length / 3; nuovo.set(k, r);
    for (let q = 0; q < 3; q++) pos.push(P0[3 * a + q] + (P0[3 * b + q] - P0[3 * a + q]) * t); return r; };
  for (let t = 0; t < m0.idx.length; t += 3) {
    const T = [m0.idx[t], m0.idx[t + 1], m0.idx[t + 2]], dentro = T.map(i => val[i] > 0), n = dentro.filter(Boolean).length;
    if (n === 0) continue; if (n === 3) { idx.push(vert(T[0]), vert(T[1]), vert(T[2])); continue; }
    const poly = []; for (let k = 0; k < 3; k++) { const a = T[k], b = T[(k + 1) % 3];
      if (dentro[k]) poly.push(vert(a)); if (dentro[k] !== dentro[(k + 1) % 3]) poly.push(taglio(a, b)); }
    for (let k = 1; k + 1 < poly.length; k++) idx.push(poly[0], poly[k], poly[k + 1]); }
  pos = Float64Array.from(pos); idx = Uint32Array.from(idx); }
// solo i pezzi grandi (toglie i frammenti dove l'impronta tocca appena la superficie)
{ const nv = pos.length / 3, par = Int32Array.from({ length: nv }, (_, k) => k), f = k => { while (par[k] !== k) k = par[k] = par[par[k]]; return k; };
  for (let t = 0; t < idx.length; t += 3) { par[f(idx[t + 1])] = f(idx[t]); par[f(idx[t + 2])] = f(idx[t]); }
  const cnt = new Map(); for (let t = 0; t < idx.length; t += 3) { const r = f(idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const tot = idx.length / 3, I = []; for (let t = 0; t < idx.length; t += 3) if (cnt.get(f(idx[t])) >= PEZZO * tot) I.push(idx[t], idx[t + 1], idx[t + 2]);
  log('pezzi', cnt.size, 'tenuti', I.length / 3, 'di', tot, 'triangoli'); const c = compatta(pos, Uint32Array.from(I)); pos = c.pos; idx = c.idx; }

/* ---- margine: spigoli usati una volta, levigati lungo la curva ---- */
const bordoDi = () => { const nv = pos.length / 3, ec = new Map(), bn = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3], key = a < b ? a * nv + b : b * nv + a; ec.set(key, (ec.get(key) || 0) + 1); }
  for (const [key, n] of ec) if (n === 1) { const a = Math.floor(key / nv), b = key % nv; (bn.get(a) || bn.set(a, []).get(a)).push(b); (bn.get(b) || bn.set(b, []).get(b)).push(a); }
  return bn; };
let bn = bordoDi();
// levigatura della superficie intera (Taubin, non restringe): il telo segue la forma generale della testa, senza creste e lobi sulle sporgenze ossee
pos = Float64Array.from(G.taubin(Float32Array.from(pos), idx, LEV_SUP));
log('margine: vertici', bn.size, 'ramificazioni', [...bn.values()].filter(l => l.length !== 2).length);
for (let it = 0; it < BORDO; it++) { const lam = it % 2 ? -0.53 : 0.5, q = pos.slice();
  for (const [v, L] of bn) { for (let k = 0; k < 3; k++) { let s = 0; for (const w of L) s += pos[3 * w + k]; q[3 * v + k] += lam * (s / L.length - pos[3 * v + k]); } }
  pos = q; }

/* ---- distanza geodetica dal margine (Dijkstra sugli spigoli) ---- */
const nvM = pos.length / 3, nbr = vicini(nvM, idx);
const geod = (pos, nbr) => { const n = pos.length / 3, d = new Float64Array(n).fill(Infinity), H = []; // heap binario [distanza, vertice]
  const push = e => { H.push(e); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  for (const v of bn.keys()) { d[v] = 0; push([0, v]); }
  while (H.length) { const [dv, v] = pop(); if (dv > d[v]) continue;
    for (const w of nbr[v]) { const l = Math.hypot(pos[3 * v] - pos[3 * w], pos[3 * v + 1] - pos[3 * w + 1], pos[3 * v + 2] - pos[3 * w + 2]), nd = dv + l; if (nd < d[w]) { d[w] = nd; push([nd, w]); } } }
  return d; };
const dist = geod(pos, nbr);

/* ---- riduzione dell'interno: bordo e fascia del margine fermi ---- */
const posD = Float64Array.from(pos);   // mesh densa (passo della griglia): serve a sapere dove la cuffia reale sporge tra i vertici della mesh ridotta
let area = 0, fissi = new Uint8Array(nvM);
for (let i = 0; i < nvM; i++) if (dist[i] < RIM + 0.06) fissi[i] = 1;
const areaT = t => { const [a, b, c] = [0, 1, 2].map(k => 3 * idx[t + k]), u = [0, 1, 2].map(q => pos[b + q] - pos[a + q]), w = [0, 1, 2].map(q => pos[c + q] - pos[a + q]);
  return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2; };
let nFissi = 0; for (let t = 0; t < idx.length; t += 3) { if (fissi[idx[t]] || fissi[idx[t + 1]] || fissi[idx[t + 2]]) nFissi++; else area += areaT(t); }
const bersaglio = Math.round(nFissi + area * DENS);
{ const r = riduci(pos, idx, bersaglio, fissi), c = compatta(r.pos, r.idx); pos = c.pos; idx = c.idx; }
log('superficie media ridotta', idx.length / 3, 'triangoli (interno', area.toFixed(1), 'cm²)');
// distanze ricalcolate sulla mesh ridotta (il margine non si è mosso)
bn = bordoDi(); const dist2 = geod(pos, vicini(pos.length / 3, idx));

/* ---- cuscinetto: facce a ± semispessore, uguali sul margine ---- */
const nv = pos.length / 3;
// normali della superficie media dal gradiente del campo sfocato (lisce, senza il rumore dei triangoli ridotti)
const nor = new Float64Array(nv * 3);
for (let i = 0; i < nv; i++) { const g = G.grad(Fs, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]), l = Math.hypot(...g) || 1; for (let k = 0; k < 3; k++) nor[3 * i + k] = g[k] / l; }
const semi = d => { const s = Math.min(1, d / RIM); return SPESS * Math.sqrt(1 - (1 - s) * (1 - s)); };
const nb = vicini(nv, idx), sm = (f, n) => diffondi(f, nb, n);
// la superficie media si alza dove la cuffia reale sporge sotto la faccia inferiore (distanza dalla cuffia < semispessore + GAP). Il sollevamento richiesto
// è il massimo sui vertici della mesh densa entro `RAGGIO_ALZA` da ogni vertice (le punte della cuffia cadono tra i vertici della mesh ridotta), esteso
// di `ALZA_ANELLI` anelli e mediato con meno passate: la borsa resta ovunque sopra quello richiesto e si appoggia sulla cuffia come un telo
{ const cella = RAGGIO_ALZA, key = (x, y, z) => Math.floor(x / cella) + ',' + Math.floor(y / cella) + ',' + Math.floor(z / cella), celle = new Map();
  for (let i = 0; i < posD.length / 3; i++) { const k = key(posD[3 * i], posD[3 * i + 1], posD[3 * i + 2]); (celle.get(k) || celle.set(k, []).get(k)).push(i); }
  const defD = new Float64Array(posD.length / 3); for (let i = 0; i < defD.length; i++) defD[i] = clamp(SPESS + GAP - sample(Fq.esatto, posD[3 * i], posD[3 * i + 1], posD[3 * i + 2]), 0, 0.1);
  let a = new Float64Array(nv);
  for (let i = 0; i < nv; i++) { const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of celle.get(key(x + dx * cella, y + dy * cella, z + dz * cella)) || [])
      if (Math.hypot(posD[3 * j] - x, posD[3 * j + 1] - y, posD[3 * j + 2] - z) <= RAGGIO_ALZA && defD[j] > a[i]) a[i] = defD[j]; }
  for (let p = 0; p < ALZA_ANELLI; p++) { const b = a.slice(); for (let i = 0; i < nv; i++) for (const j of nb[i]) if (a[j] > b[i]) b[i] = a[j]; a = b; }
  a = sm(a, ALZA_ANELLI - 1); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) pos[3 * i + k] += nor[3 * i + k] * a[i]; }
// semispessore: profilo del bordo, ridotto dove tra cuffia e strutture soprastanti manca lo spazio (distanza ≥ GAP da entrambe)
const lim = new Float64Array(nv), h = new Float64Array(nv);
for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; lim[i] = Math.min(sample(Fq.esatto, ...p), sample(Fsc, ...p)) - GAP; h[i] = semi(dist2[i]); }
{ const hs = sm(h, 2); for (let i = 0; i < nv; i++) h[i] = dist2[i] < 1e-9 ? 0 : Math.max(HMIN, Math.min(hs[i], lim[i], semi(dist2[i]))); }
const basso = new Int32Array(nv), P = [], I = [];
for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) P.push(pos[3 * i + k] + nor[3 * i + k] * h[i]);
for (let i = 0; i < nv; i++) { if (h[i] === 0) { basso[i] = i; continue; } basso[i] = P.length / 3; for (let k = 0; k < 3; k++) P.push(pos[3 * i + k] - nor[3 * i + k] * h[i]); }
for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; I.push(a, b, c, basso[a], basso[c], basso[b]); }
// normali di vertice scritte nel file: facce con la normale della superficie media, bordo con la pendenza del profilo ellittico (la pagina non le ricalcola:
// i triangoli ridotti, irregolari, darebbero luccichii a rete sulla superficie)
const nrm = new Int8Array(P.length);
// direzione verso l'interno (gradiente della distanza dal margine), levigata sui vicini: i triangoli sottili lungo il margine darebbero normali a dente di sega
const UD = [0, 1, 2].map(() => new Float64Array(nv));
for (let i = 0; i < nv; i++) { for (const j of nb[i]) { const dx = [0, 1, 2].map(k => pos[3 * j + k] - pos[3 * i + k]), l2 = dx[0] ** 2 + dx[1] ** 2 + dx[2] ** 2 || 1; for (let k = 0; k < 3; k++) UD[k][i] += (dist2[j] - dist2[i]) * dx[k] / l2; }
  const l = Math.hypot(UD[0][i], UD[1][i], UD[2][i]) || 1; for (let k = 0; k < 3; k++) UD[k][i] /= l; }
const US = UD.map(c => diffondi(c, nb, 8));
for (let i = 0; i < nv; i++) {
  const un = [0, 1, 2].map(k => nor[3 * i + k]); let u = [US[0][i], US[1][i], US[2][i]]; const pr = u[0] * un[0] + u[1] * un[1] + u[2] * un[2]; u = u.map((v, k) => v - pr * un[k]); const lu = Math.hypot(...u) || 1; u = u.map(v => v / lu);
  const s = Math.min(1, dist2[i] / RIM), hp = s < 1 ? Math.min(3, SPESS * (1 - s) / (RIM * Math.sqrt(Math.max(1e-6, 1 - (1 - s) * (1 - s))))) : 0;
  const put = (id, n) => { const l = Math.hypot(...n) || 1; for (let k = 0; k < 3; k++) nrm[3 * id + k] = Math.round(127 * n[k] / l); };
  if (h[i] === 0) put(i, u.map(v => -v)); else { put(i, [0, 1, 2].map(k => un[k] - hp * u[k])); put(basso[i], [0, 1, 2].map(k => -un[k] - hp * u[k])); } }
const m = { pos: Float32Array.from(P), idx: Uint32Array.from(I), tag: null, fdir: null, nrm };
m.fdir = new Int8Array(m.pos.length).fill(0); for (let k = 1; k < m.fdir.length; k += 3) m.fdir[k] = 127;

controlli(m);

if (process.env.PROVA) { log('PROVA: nessuna scrittura'); } else { setMesh('borsa_sad', m); saveFile(repack()); }
