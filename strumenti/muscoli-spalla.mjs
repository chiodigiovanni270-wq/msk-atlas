/* Muscoli della spalla (modelli/spalla-3d.html): toglie le compenetrazioni dei muscoli BodyParts3D con le strutture più profonde
   (ossa, cartilagini, labbro, capsula, legamenti, vasi e nervi) e riscrive le normali di vertice.

   Uso (dalla cartella del progetto):
     node strumenti/muscoli-spalla.mjs                  → riscrive i muscoli nel file del modello
     node strumenti/muscoli-spalla.mjs --prova=f.json   → non tocca il modello: scrive i controlli (prima/dopo) in un JSON
     MODELLO=/tmp/copia.html node strumenti/muscoli-spalla.mjs   → lavora su una copia
   Va lanciato dopo `vasi-nervi-spalla.mjs` e prima di `borsa-spalla.mjs`; `vasi-nervi-spalla.mjs` ripristina i muscoli della revisione `59b7798` (anche la topologia) e vi
   scava i canali dei tubi. Lavora sui muscoli incorporati così come li lascia `vasi-nervi-spalla.mjs`: non va rilanciato sul proprio risultato
   (si rilancia sempre la coda della catena `vasi-nervi-spalla.mjs` → questo → `borsa-spalla.mjs`).

   Metodo:
     1. Campo di distanza con segno (griglia 0,6 mm, distanza esatta dai triangoli entro 1,2 mm dalle superfici) dall'unione degli ostacoli; la capsula è
        un solido pieno (guscio + ossa racchiudono la cavità articolare: riempimento dall'esterno), così i tendini della cuffia che entravano nella
        cavità vengono portati sulla faccia esterna della capsula, dove nella realtà si fondono con essa.
     2. Raffinamento: i triangoli dei muscoli entro `ZONA` dagli ostacoli (vertici, baricentro o punti medi dei lati) sono divisi (punti medi dei lati,
        con triangoli verdi di raccordo: nessuna fessura) finché i lati superano `LATO`; le mesh BodyParts3D ridotte hanno triangoli fino a 2 cm, che
        scavalcano un ostacolo senza avere vertici dentro (la capsula o un legamento affioravano attraverso il muscolo). Tag e direzione delle fibre
        sono interpolati sui punti nuovi.
     3. Vertici con distanza < `MARG` (dentro un ostacolo o a contatto): spostati lungo il gradiente fino a `MARG` (tre passate).
     3b. Lamine a due strati (tendini): lo strato rivolto fuori dall'ostacolo deve finire `SPESS` oltre lo strato interno spinto davanti a lui.
     4. Lo spostamento è diffuso ai vertici vicini (`DIFF` passate di media sul grafo della mesh), poi levigato (`LEV` passate con riproiezione), così la
        superficie si piega con continuità; `PARAM` dà valori più forti a sottoscapolare (davanti a labbro e capsula era ondulato) e deltoide.
        Dove restano autointersezioni (pieghe: in pagina buchi o fessure) i vertici coinvolti e quattro anelli attorno sono levigati (`PIEGHE` giri).
     4b. Taglio di `delt_cl` con un piano al 34 % della clavicola (`CLAV_FINO`, `CLAV_RAMPA`): spento (`TAGLIA_CLAVICOLA = false`), le inserzioni
        sulla clavicola restano quelle di BodyParts3D (il taglio lasciava l'osso scoperto tra deltoide e trapezio).
     4c. Ostacoli per singoli muscoli (`ESCLUSI`): il capo lungo del bicipite non vede capsula e labbro (decorre dentro la capsula), sovraspinato e
        sottoscapolare non vedono il coraco-omerale (si fondono con lui nell'intervallo dei rotatori), il trapezio (parte trasversa) non vede il
        legamento acromioclavicolare, che poi supera passando sopra, lontano dall'osso (`SOPRA`), invece di avvolgerlo e strapparsi; deltoide
        clavicolare, grande pettorale (parte clavicolare) e trapezio (parte discendente) non vedono la clavicola, così le inserzioni restano lisce
        come nei dati (la spinta fuori dall'osso le rendeva frastagliate).
     4d. Capo breve del bicipite e coracobrachiale portati fuori dal sottoscapolare; poi il capo breve è separato dal sottoscapolare controllando i
        triangoli (`separa`, parametri `SEP`): il bordo del sottoscapolare, più sottile del passo della griglia, lo attraversava senza vertici dentro.
     4e. Sovraspinato: tendine ristretto del 18 % di traverso alle fibre prima della spinta (`STRINGI` in `PARAM`): l'impronta d'inserzione risultava
        troppo larga.
     5. Deltoide e altri muscoli della spalla sopra la cuffia già sistemata (il deltoide anche davanti al capo breve), a `BORSA` (2 mm) di distanza: è lo spazio della borsa subacromion-deltoidea
        (`borsa-spalla.mjs`).
     6. Normali di vertice: somma pesata dall'area delle normali di faccia, unite sui vertici coincidenti (stessa posizione e stesso tipo di tag, così
        non si sfumano le sezioni di taglio), poi `NORM_DIFF` passate di media: la superficie non ha più sfaccettature che il materiale lucido (clearcoat e
        sheen del muscolo) trasformava in chiazze chiare a bordo netto che cambiavano con la vista. Scritte nel file (la pagina non le ricalcola).
     7. Controlli (stampati): per ogni muscolo campioni (vertici, baricentri e punti medi dei lati) dentro ciascun gruppo di ostacoli e penetrazione
        massima, prima e dopo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, saveFile, repack, log, griglia, esatta, sdf, unione, solid, or, sample, grad, attrs } = G;
const B = await import('./lib-bp3d.mjs');
const { STR } = await import('./dati-spalla.mjs');

const MARG = 0.05, DIFF = 8, PASSO = 0.06, ZONA = 0.5, LATO = 0.25, NORM_DIFF = 3, LEV = 6, SPESS = 0.12, BORSA = 0.2, PIEGHE = 8;   // SPESS: spessore minimo di una lamina (tendine) spinta fuori da un ostacolo                 // cm
const nomi = cats => STR.filter(s => cats.includes(s.cat)).flatMap(s => s.mesh.map(m => m[0]));
const MUSCOLI = nomi(['cuf', 'cin', 'tor', 'brac']);
const GRUPPI = { ossa: ['scapola', 'clavicola', 'omero', 'manubrio'], cartilagini: ['cart_omero', 'cart_glen'], capsula: ['caps', 'labbro'],
  legamenti: nomi(['leg']), vasi_nervi: nomi(['art', 'ven', 'ner']) };

griglia([-8, -14, -9], [16, 6, 8], PASSO, 0.2);
const { N, NX, NY, NZ, NXY } = G;
log('griglia', NX, NY, NZ, (N / 1e6).toFixed(1), 'M voxel');
const tutti = Object.values(GRUPPI).flat();
// campo degli ostacoli (distanza con segno), escluse eventualmente alcune strutture
function campo(esclusi = []) {
  const ost = tutti.filter(n => !esclusi.includes(n)), M = unione(ost.filter(n => n !== 'caps'));
// capsula piena: guscio (ispessito di un voxel, niente fughe) + interno non raggiungibile dall'esterno
  if (ost.includes('caps')) { const Sh = solid('caps'), Do = G.edt(Sh); for (let i = 0; i < N; i++) if (Do[i] <= PASSO * 1.01) Sh[i] = 1;
  const C = or(Sh, M.slice()), fuori = new Uint8Array(N), coda = [];
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { if (i && j && k && i < NX - 1 && j < NY - 1 && k < NZ - 1) continue; const id = i + NX * j + NXY * k; if (!C[id]) { fuori[id] = 1; coda.push(id); } }
  while (coda.length) { const id = coda.pop(), i = id % NX, j = ((id / NX) | 0) % NY, k = (id / NXY) | 0;
    for (const [d, ok] of [[1, i < NX - 1], [-1, i > 0], [NX, j < NY - 1], [-NX, j > 0], [NXY, k < NZ - 1], [-NXY, k > 0]]) { const m = id + d; if (ok && !fuori[m] && !C[m]) { fuori[m] = 1; coda.push(m); } } }
  let n = 0; for (let i = 0; i < N; i++) if (!fuori[i] && !M[i]) { M[i] = 1; n++; } log('capsula piena:', (n * PASSO ** 3).toFixed(1), 'cm³'); }
// distanza esatta dalle mesh chiuse; la capsula piena (le cui facce interne non sono bordo del solido) entra solo come distanza voxel
  const Mn = unione(ost.filter(n => n !== 'caps')), Fn = esatta(sdf(Mn).F, ost.filter(n => n !== 'caps'), 0.12), Fc = sdf(M).F, F = new Float32Array(N);
  for (let i = 0; i < N; i++) F[i] = Math.min(Fn[i], Fc[i]);
  return { F, Fn, Fc };
}
const { F, Fn, Fc } = campo();
// ostacoli tolti per singoli muscoli: il capo lungo del bicipite decorre dentro la capsula fino al tubercolo sovraglenoideo e al labbro;
// sovraspinato e sottoscapolare si fondono col coraco-omerale (intervallo dei rotatori): passarci sopra creava un rigonfiamento
// muscoli che nascono dalla clavicola (deltoide clavicolare, pettorale clavicolare, trapezio discendente): la clavicola non li respinge, così il
// bordo d'origine resta quello di BodyParts3D (spinto fuori diventava frastagliato e scopriva l'osso)
const ESCLUSI = { bic_lungo: ['caps', 'labbro'], supra: ['coraco_om'], subs: ['coraco_om'], trap_t: ['ac_leg'], delt_cl: ['clavicola'], pec_cl: ['clavicola'], trap_d: ['clavicola'] };
// lamine d'inserzione che avvolgono un legamento: passano sopra (lontano dall'osso), non attraverso
const SOPRA = { trap_t: { ostacolo: ['ac_leg'], base: ['clavicola', 'scapola'] } };
// levigatura più forte dove la superficie veniva ondulata (sottoscapolare davanti a labbro e capsula)
const PARAM = { supra: { STRINGI: 0.18 }, subs: { LEV: 24, DIFF: 20 }, delt_cl: { LEV: 30, DIFF: 40 }, delt_ac: { LEV: 24, DIFF: 30 }, trap_t: { LEV: 12, DIFF: 14 } };
log('campo pronto');
// campi per gruppo, solo per i controlli
const FG = {}; for (const [g, ns] of Object.entries(GRUPPI)) FG[g] = g === 'capsula' ? Fc : esatta(sdf(unione(ns)).F, ns, 0.12);
// campioni di una mesh: vertici, baricentri e punti medi dei lati
function campioni(pos, idx) {
  const S = Array.from(pos);
  for (let t = 0; t < idx.length; t += 3) { const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    for (let k = 0; k < 3; k++) S.push((pos[a + k] + pos[b + k] + pos[c + k]) / 3);
    for (let k = 0; k < 3; k++) S.push((pos[a + k] + pos[b + k]) / 2);
    for (let k = 0; k < 3; k++) S.push((pos[b + k] + pos[c + k]) / 2);
    for (let k = 0; k < 3; k++) S.push((pos[c + k] + pos[a + k]) / 2); }
  return S;
}
// per la capsula (campo del solido pieno, che contiene anche ossa, cartilagini e tubi) contano solo i campioni fuori da tutto il resto
const controlli = (pos, idx) => { const S = campioni(pos, idx), r = {}; for (const [g, Fx] of Object.entries(FG)) { let n = 0, mx = 0; for (let i = 0; i < S.length; i += 3) { const d = sample(Fx, S[i], S[i + 1], S[i + 2]); if (d < -0.01 && (g !== 'capsula' || sample(Fn, S[i], S[i + 1], S[i + 2]) > 0.01)) { n++; mx = Math.max(mx, -d); } } r[g] = [n, +(mx * 10).toFixed(1)]; } return r; };

/* ---- raffinamento adattivo con triangoli verdi ---- */
function raffina(pos, idx, tag, fdir, Fx) {
  let P = Array.from(pos), I = Array.from(idx), T = tag ? Array.from(tag) : null, D = fdir ? Array.from(fdir) : null;
  for (let giro = 0; giro < 5; giro++) {
    const nT = I.length / 3, vicino = (x, y, z) => sample(Fx, x, y, z) < ZONA, dist = (a, b) => Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]);
    const spezza = new Map(); let nuovi = 0;
    const chiave = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
    for (let t = 0; t < nT; t++) { const v = [I[3 * t], I[3 * t + 1], I[3 * t + 2]];
      const near = v.some(a => vicino(P[3 * a], P[3 * a + 1], P[3 * a + 2])) || vicino((P[3 * v[0]] + P[3 * v[1]] + P[3 * v[2]]) / 3, (P[3 * v[0] + 1] + P[3 * v[1] + 1] + P[3 * v[2] + 1]) / 3, (P[3 * v[0] + 2] + P[3 * v[1] + 2] + P[3 * v[2] + 2]) / 3) ||
        [[0, 1], [1, 2], [2, 0]].some(([p, q]) => vicino((P[3 * v[p]] + P[3 * v[q]]) / 2, (P[3 * v[p] + 1] + P[3 * v[q] + 1]) / 2, (P[3 * v[p] + 2] + P[3 * v[q] + 2]) / 2));
      if (!near) continue;
      for (const [p, q] of [[0, 1], [1, 2], [2, 0]]) { const k = chiave(v[p], v[q]); if (!spezza.has(k) && dist(v[p], v[q]) > LATO) spezza.set(k, -1); } }
    if (!spezza.size) break;
    for (const [k, ] of spezza) { const a = Math.floor(k / 4294967296), b = k % 4294967296, m = P.length / 3; spezza.set(k, m);
      for (let q = 0; q < 3; q++) P.push((P[3 * a + q] + P[3 * b + q]) / 2);
      if (T) T.push(T[a] >= 250 || T[b] >= 250 ? Math.max(T[a], T[b]) : Math.round((T[a] + T[b]) / 2));
      if (D) { const d = [0, 1, 2].map(q => D[3 * a + q] + D[3 * b + q]), l = Math.hypot(...d) || 1; for (let q = 0; q < 3; q++) D.push(Math.round(d[q] / l * 127)); }
      nuovi++; }
    const J = [];
    for (let t = 0; t < nT; t++) { const v = [I[3 * t], I[3 * t + 1], I[3 * t + 2]], m = [0, 1, 2].map(e => spezza.get(chiave(v[e], v[(e + 1) % 3])) ?? -1), n = m.filter(x => x >= 0).length;
      if (n === 0) { J.push(...v); continue; }
      // ruota in modo che i lati spezzati siano ab (e bc)
      let r = 0; if (n === 1) r = m.findIndex(x => x >= 0); else if (n === 2) r = [0, 1, 2].find(e => m[e] >= 0 && m[(e + 1) % 3] >= 0);
      const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3], mab = m[r], mbc = m[(r + 1) % 3], mca = m[(r + 2) % 3];
      if (n === 1) J.push(a, mab, c, mab, b, c);
      else if (n === 2) J.push(mab, b, mbc, a, mab, mbc, a, mbc, c);
      else J.push(a, mab, mca, mab, b, mbc, mca, mbc, c, mab, mbc, mca); }
    I = J; log('  raffinamento: giro', giro + 1, 'lati spezzati', nuovi, 'triangoli', I.length / 3);
  }
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I), tag: T ? Uint8Array.from(T) : null, fdir: D ? Int8Array.from(D) : null };
}

/* ---- normali di vertice senza sfaccettature ---- */
function normaliLisce(pos, idx, tag) {
  const nv = pos.length / 3, key = new Map(), grp = new Int32Array(nv);
  for (let i = 0; i < nv; i++) { const k = Math.round(pos[3 * i] * 2e4) + ',' + Math.round(pos[3 * i + 1] * 2e4) + ',' + Math.round(pos[3 * i + 2] * 2e4) + ',' + (tag && tag[i] >= 250 ? 1 : 0); let g = key.get(k); if (g === undefined) { g = key.size; key.set(k, g); } grp[i] = g; }
  const A = new Float64Array(key.size * 3);
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const u = [0, 1, 2].map(k => pos[3 * b + k] - pos[3 * a + k]), w = [0, 1, 2].map(k => pos[3 * c + k] - pos[3 * a + k]), f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) A[3 * grp[v] + k] += f[k]; }
  // grafo sui gruppi
  const nb = Array.from({ length: key.size }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const x = grp[idx[t + e]], y = grp[idx[t + (e + 1) % 3]]; if (x !== y) { nb[x].add(y); nb[y].add(x); } }
  const nl = nb.map(s => [...s]);
  const nrm = (X) => { for (let i = 0; i < key.size; i++) { const l = Math.hypot(X[3 * i], X[3 * i + 1], X[3 * i + 2]) || 1; for (let k = 0; k < 3; k++) X[3 * i + k] /= l; } return X; };
  let X = nrm(A);
  for (let p = 0; p < NORM_DIFF; p++) { const Y = new Float64Array(X.length); for (let i = 0; i < key.size; i++) { for (let k = 0; k < 3; k++) { let s = 2 * X[3 * i + k]; for (const j of nl[i]) s += X[3 * j + k] / nl[i].length; Y[3 * i + k] = s; } } X = nrm(Y); }
  const out = new Int8Array(nv * 3); for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) out[3 * i + k] = Math.round(X[3 * grp[i] + k] * 127);
  return out;
}

// il deltoide (parte clavicolare) nasce dal terzo laterale del margine anteriore della clavicola: la mesh BodyParts3D scende molto più medialmente.
// Taglio con un piano perpendicolare all'asse della clavicola, a `CLAV_FINO` (frazione della lunghezza dall'estremo laterale); i triangoli attraversati
// sono tagliati esattamente (vertici nuovi sui lati, tag e direzione fibre interpolati), quindi il bordo di origine è netto e non a dente di sega
const CLAV_FINO = 0.34, CLAV_RAMPA = 0.06, TAGLIA_CLAVICOLA = false;   // spento: Giovanni preferisce l'inserzione BodyParts3D originale
function tagliaClavicola(pos, idx, tag, fdir) {
  const c = REAL('clavicola').pos; let a = null, b = null;
  for (let i = 0; i < c.length; i += 3) { if (!a || c[i] < a[0]) a = [c[i], c[i + 1], c[i + 2]]; if (!b || c[i] > b[0]) b = [c[i], c[i + 1], c[i + 2]]; }
  const ax = [0, 1, 2].map(q => b[q] - a[q]), L = Math.hypot(...ax), u = ax.map(v => v / L);
  const P = Array.from(pos), T = tag ? Array.from(tag) : null, D = fdir ? Array.from(fdir) : null, out = [], memo = new Map();
  const h = v => ((P[3 * v] - a[0]) * u[0] + (P[3 * v + 1] - a[1]) * u[1] + (P[3 * v + 2] - a[2]) * u[2]) / L - CLAV_FINO;   // <= 0: si tiene
  const nuovo = (v, w) => { const k = v < w ? v + ',' + w : w + ',' + v; if (memo.has(k)) return memo.get(k); const hv = h(v), hw = h(w), f = hv / (hv - hw), m = P.length / 3;
    for (let q = 0; q < 3; q++) P.push(P[3 * v + q] + (P[3 * w + q] - P[3 * v + q]) * f);
    if (T) T.push(T[v] >= 250 || T[w] >= 250 ? Math.max(T[v], T[w]) : Math.round(T[v] + (T[w] - T[v]) * f));
    if (D) { const d = [0, 1, 2].map(q => D[3 * v + q] * (1 - f) + D[3 * w + q] * f), l = Math.hypot(...d) || 1; for (let q = 0; q < 3; q++) D.push(Math.round(d[q] / l * 127)); }
    memo.set(k, m); return m; };
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]], poly = [];
    for (let k = 0; k < 3; k++) { const x = v[k], y = v[(k + 1) % 3], hx = h(x), hy = h(y); if (hx <= 0) poly.push(x); if ((hx <= 0) !== (hy <= 0)) poly.push(nuovo(x, y)); }
    for (let k = 1; k + 1 < poly.length; k++) out.push(poly[0], poly[k], poly[k + 1]);
  }
  // raccordo con l'osso: i vertici entro `CLAV_RAMPA` dal piano scendono verso la clavicola (fino a toccarla sul piano), così il muscolo finisce
  // assottigliandosi sulla sua inserzione, come gli altri, invece che con una parete di taglio
  { const usati = new Set(out), cv = REAL('clavicola').pos;
    for (const v of usati) { const hv = h(v); if (hv < -CLAV_RAMPA) continue; const w = G.sstep(-CLAV_RAMPA, 0, hv); let best = 1e9, bi = 0;
      for (let j = 0; j < cv.length; j += 3) { const d = (cv[j] - P[3 * v]) ** 2 + (cv[j + 1] - P[3 * v + 1]) ** 2 + (cv[j + 2] - P[3 * v + 2]) ** 2; if (d < best) { best = d; bi = j; } }
      for (let q = 0; q < 3; q++) P[3 * v + q] += (cv[bi + q] - P[3 * v + q]) * w; } }
  log('delt_cl: tagliato al', Math.round(CLAV_FINO * 100), '% della clavicola,', (idx.length - out.length) / 3, 'triangoli in meno netti');
  return { pos: Float32Array.from(P), idx: Uint32Array.from(out), tag: T ? Uint8Array.from(T) : null, fdir: D ? Int8Array.from(D) : null };
}

/* ---- autointersezioni: coppie di triangoli non adiacenti che si attraversano (pieghe dove due strati vicini sono stati spinti in modo diverso:
   in pagina sembrano piccoli buchi o fessure); restituisce i vertici coinvolti ---- */
function intersecanti(P, I) {
  const T = I.length / 3, C = 0.3, h = new Map(), W = new Int32Array(P.length / 3), id = new Map();
  for (let v = 0; v < P.length / 3; v++) { const k = Math.round(P[3 * v] * 1e4) + ',' + Math.round(P[3 * v + 1] * 1e4) + ',' + Math.round(P[3 * v + 2] * 1e4); if (!id.has(k)) id.set(k, id.size); W[v] = id.get(k); }
  const tv = t => [0, 1, 2].map(k => [P[3 * I[3 * t + k]], P[3 * I[3 * t + k] + 1], P[3 * I[3 * t + k] + 2]]);
  for (let t = 0; t < T; t++) { const v = tv(t), lo = [0, 1, 2].map(q => Math.floor(Math.min(v[0][q], v[1][q], v[2][q]) / C)), hi = [0, 1, 2].map(q => Math.floor(Math.max(v[0][q], v[1][q], v[2][q]) / C));
    for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) for (let c = lo[2]; c <= hi[2]; c++) { const k = a + ',' + b + ',' + c; let L = h.get(k); if (!L) h.set(k, L = []); L.push(t); } }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const segTri = (p, q, [a, b, c]) => { const e1 = sub(b, a), e2 = sub(c, a), d = sub(q, p), pv = cr(d, e2), det = dt(e1, pv); if (Math.abs(det) < 1e-12) return false; const iv = 1 / det, s0 = sub(p, a), u = dt(s0, pv) * iv; if (u < 0 || u > 1) return false;
    const qv = cr(s0, e1), v = dt(d, qv) * iv; if (v < 0 || u + v > 1) return false; const tt = dt(e2, qv) * iv; return tt > 0 && tt < 1; };
  const out = new Set(), fatti = new Set(), coppie = [];
  for (const L of h.values()) for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const s0 = L[i], t = L[j], kk = s0 < t ? s0 * T + t : t * T + s0; if (fatti.has(kk)) continue; fatti.add(kk);
    const ws = [0, 1, 2].map(q => W[I[3 * s0 + q]]), wt = [0, 1, 2].map(q => W[I[3 * t + q]]); if (ws.some(x => wt.includes(x))) continue;
    const A = tv(s0), Bt = tv(t); let x = false; for (let e = 0; e < 3 && !x; e++) x = segTri(A[e], A[(e + 1) % 3], Bt) || segTri(Bt[e], Bt[(e + 1) % 3], A);
    if (x) { coppie.push([s0, t]); for (let q = 0; q < 3; q++) { out.add(I[3 * s0 + q]); out.add(I[3 * t + q]); } } }
  out.coppie = coppie;
  return out;
}
const CHECK = {};
const MESHES = {};
// sposta fuori dagli ostacoli del campo Fx i vertici del muscolo (raffinando prima la mesh vicino agli ostacoli); restituisce i vertici spostati
// base: campo di un'altra struttura (es. l'osso di inserzione): se dato, i vertici sono spinti lontano da lei (fuori, «sopra» l'ostacolo) invece che
// verso il lato più vicino dell'ostacolo, che per una lamina che lo avvolge vorrebbe dire strapparla
function libera(nome, Fx, conControlli = true, marg = MARG, base = null) {
  const spinta = (p, dd) => { const gf = grad(Fx, p), lf = Math.hypot(...gf) || 1; if (!base) return [gf, dd / lf];
    const gb = grad(base, p), lb = Math.hypot(...gb) || 1, u = gb.map(v => v / lb), c = Math.max(0.3, (gf[0] * u[0] + gf[1] * u[1] + gf[2] * u[2]) / lf); return [u, dd / c]; };
  const LEVm = PARAM[nome]?.LEV ?? LEV, DIFFm = PARAM[nome]?.DIFF ?? DIFF, SPESSm = PARAM[nome]?.SPESS ?? SPESS;
  const m0 = REAL(nome), a0 = attrs(nome), S0 = TAGLIA_CLAVICOLA && nome === 'delt_cl' && conControlli ? tagliaClavicola(m0.pos, m0.idx, a0.tag, a0.fdir) : { pos: m0.pos, idx: m0.idx, tag: a0.tag, fdir: a0.fdir }, R = raffina(S0.pos, S0.idx, S0.tag, S0.fdir, Fx), pos = Float32Array.from(R.pos), nv = pos.length / 3, prima = conControlli ? controlli(m0.pos, m0.idx) : null;
  // tendine più stretto all'inserzione (`STRINGI` in PARAM): i vertici tendinei (tag alto) si avvicinano all'asse del tendine, solo di traverso alla
  // direzione delle fibre; poi la spinta fuori dagli ostacoli li rimette sulla superficie
  const STR = PARAM[nome]?.STRINGI;
  if (STR && R.tag) { const tw = i => R.tag[i] >= 250 ? 0 : G.sstep(110, 190, R.tag[i]); let c = [0, 0, 0], d = [0, 0, 0], n = 0;
    for (let i = 0; i < nv; i++) if (tw(i) > 0.5) { n++; for (let q = 0; q < 3; q++) { c[q] += pos[3 * i + q]; d[q] += R.fdir ? R.fdir[3 * i + q] : 0; } }
    if (n) { c = c.map(v => v / n); const ld = Math.hypot(...d) || 1; d = d.map(v => v / ld);
      for (let i = 0; i < nv; i++) { const w = tw(i); if (!w) continue; const r = [0, 1, 2].map(q => pos[3 * i + q] - c[q]), a = r[0] * d[0] + r[1] * d[1] + r[2] * d[2];
        for (let q = 0; q < 3; q++) pos[3 * i + q] -= (r[q] - a * d[q]) * STR * w; }
      log(nome, 'tendine stretto del', Math.round(STR * 100), '% di traverso alle fibre su', n, 'vertici'); } }
  const D = new Float32Array(nv * 3), req = new Uint8Array(nv);
  // lamine sottili (tendini a due strati): lo strato rivolto verso l'ostacolo e quello rivolto fuori vanno spinti entrambi, e il secondo di SPESS in più,
  // altrimenti i due strati si sovrappongono (z-fighting: chiazze scure a bordo netto che cambiano con la vista)
  const VN = new Float64Array(nv * 3);
  for (let t = 0; t < R.idx.length; t += 3) { const [a, b, c] = [R.idx[t], R.idx[t + 1], R.idx[t + 2]], u = [0, 1, 2].map(q => pos[3 * b + q] - pos[3 * a + q]), w = [0, 1, 2].map(q => pos[3 * c + q] - pos[3 * a + q]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; for (const v of [a, b, c]) for (let q = 0; q < 3; q++) VN[3 * v + q] += n[q]; }
  const fuori = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; if (sample(Fx, ...p) >= ZONA) continue; const g = grad(Fx, p), l = Math.hypot(...g) * Math.hypot(VN[3 * i], VN[3 * i + 1], VN[3 * i + 2]) || 1; if ((g[0] * VN[3 * i] + g[1] * VN[3 * i + 1] + g[2] * VN[3 * i + 2]) / l > 0.3) fuori[i] = 1; }
  const MIN = i => marg + (fuori[i] ? SPESSm : 0);
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < nv; i++) {
    const p = [pos[3 * i] + D[3 * i], pos[3 * i + 1] + D[3 * i + 1], pos[3 * i + 2] + D[3 * i + 2]], d = sample(Fx, ...p); if (d >= MIN(i)) continue;
    const [g, k] = spinta(p, MIN(i) - d); D[3 * i] += g[0] * k; D[3 * i + 1] += g[1] * k; D[3 * i + 2] += g[2] * k; req[i] = 1;
  }
  // strati sovrapposti: un vertice dello strato esterno che sta davanti (lungo la spinta) a un vertice spinto dello strato interno deve restare
  // SPESS oltre la sua nuova posizione, altrimenti lo strato interno lo scavalca (piega: in pagina un buco o una fessura)
  { const C = 0.5, hs = new Map(), cella = (x, y, z) => Math.floor(x / C) + ',' + Math.floor(y / C) + ',' + Math.floor(z / C);
    for (let i = 0; i < nv; i++) if (req[i]) { const k = cella(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); let L = hs.get(k); if (!L) hs.set(k, L = []); L.push(i); }
    let n = 0;
    for (let rip = 0; rip < 2; rip++) for (let j = 0; j < nv; j++) { if (req[j] === 1) continue; const pj = [pos[3 * j], pos[3 * j + 1], pos[3 * j + 2]], cx = Math.floor(pj[0] / C), cy = Math.floor(pj[1] / C), cz = Math.floor(pj[2] / C);
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) { const L = hs.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)); if (!L) continue;
        for (const i of L) { const Di = [D[3 * i], D[3 * i + 1], D[3 * i + 2]], m = Math.hypot(...Di); if (m < 0.02) continue; const u = Di.map(v => v / m), r = [0, 1, 2].map(q => pj[q] - pos[3 * i + q]), sj = r[0] * u[0] + r[1] * u[1] + r[2] * u[2];
          const ni = [VN[3 * i], VN[3 * i + 1], VN[3 * i + 2]], nj = [VN[3 * j], VN[3 * j + 1], VN[3 * j + 2]], li = Math.hypot(...ni) || 1, lj = Math.hypot(...nj) || 1;
          if ((ni[0] * u[0] + ni[1] * u[1] + ni[2] * u[2]) / li > -0.2 || (nj[0] * u[0] + nj[1] * u[1] + nj[2] * u[2]) / lj < 0.3) continue;   // i sulla faccia verso l'ostacolo, j su quella opposta
          if (sj <= 0.02 || sj > 1.0 || Math.hypot(r[0] - sj * u[0], r[1] - sj * u[1], r[2] - sj * u[2]) > 0.25) continue;
          const dj = D[3 * j] * u[0] + D[3 * j + 1] * u[1] + D[3 * j + 2] * u[2], need = m + SPESSm - sj - dj; if (need <= 0) continue;
          for (let q = 0; q < 3; q++) D[3 * j + q] += u[q] * need; req[j] = 2; n++; } } }
    if (n) log(nome, 'strato esterno spinto davanti allo strato interno', n); }
  const nb = B.vicini(nv, R.idx), comp = [0, 1, 2].map(q => B.diffondi(Array.from({ length: nv }, (_, i) => D[3 * i + q]), nb, DIFFm));
  let mossi = 0;
  for (let i = 0; i < nv; i++) {
    if (req[i]) { mossi++; for (let q = 0; q < 3; q++) pos[3 * i + q] += D[3 * i + q]; continue; }
    const s = [comp[0][i], comp[1][i], comp[2][i]], l = Math.hypot(...s); if (l < 1e-5) continue;
    for (let q = 0; q < 3; q++) pos[3 * i + q] += s[q] * 0.8;
  }
  // levigatura dei vertici spostati: il gradiente del campo a voxel è rumoroso e il muscolo spinto fuori si increspava (facce a bordo netto);
  // media coi vicini e riproiezione fuori dall'ostacolo, a più riprese
  const mov = new Uint8Array(nv); for (let i = 0; i < nv; i++) if (Math.hypot(D[3 * i], D[3 * i + 1], D[3 * i + 2]) > 1e-4 || Math.hypot(comp[0][i], comp[1][i], comp[2][i]) > 1e-4) mov[i] = 1;
  for (let r = 0; r < LEVm; r++) {
    const nuovo = Float32Array.from(pos);
    for (let i = 0; i < nv; i++) { if (!mov[i] || !nb[i].length) continue; for (let q = 0; q < 3; q++) { let s = 0; for (const j of nb[i]) s += pos[3 * j + q]; nuovo[3 * i + q] = 0.4 * pos[3 * i + q] + 0.6 * s / nb[i].length; } }
    for (let i = 0; i < nv; i++) { if (!mov[i]) continue; const p = [nuovo[3 * i], nuovo[3 * i + 1], nuovo[3 * i + 2]], d = sample(Fx, ...p); if (d < MIN(i)) { const [g, k] = spinta(p, MIN(i) - d); for (let q = 0; q < 3; q++) nuovo[3 * i + q] += g[q] * k; } }
    pos.set(nuovo);
  }
  // pieghe: dove la mesh si autointerseca si levigano i vertici coinvolti e quattro anelli attorno (con riproiezione fuori dagli ostacoli)
  let pieghe0 = null;
  for (let giro = 0; giro < PIEGHE; giro++) {
    const X = intersecanti(pos, R.idx); if (giro === 0) pieghe0 = X.size; if (!X.size) break;
    const zona = new Set(X); for (let r = 0; r < 4; r++) for (const v of [...zona]) for (const w of nb[v]) zona.add(w);
    for (let it = 0; it < 4; it++) { const nuovo = Float32Array.from(pos);
      for (const i of zona) { if (!nb[i].length) continue; for (let q = 0; q < 3; q++) { let sm = 0; for (const j of nb[i]) sm += pos[3 * j + q]; nuovo[3 * i + q] = 0.3 * pos[3 * i + q] + 0.7 * sm / nb[i].length; }
        const p = [nuovo[3 * i], nuovo[3 * i + 1], nuovo[3 * i + 2]], d = sample(Fx, ...p); if (d < MIN(i)) { const [g, k] = spinta(p, MIN(i) - d); for (let q = 0; q < 3; q++) nuovo[3 * i + q] += g[q] * k; } }
      pos.set(nuovo); }
  }
  // pieghe rimaste: ogni triangolo di una coppia che si attraversa è spostato, a piccoli passi, lungo la normale dell'altro verso il lato in cui sta
  // il suo baricentro (le due falde si separano)
  for (let giro = 0; giro < 30; giro++) {
    const X = intersecanti(pos, R.idx); if (!X.size) break; const S = new Float32Array(nv * 3), cnt = new Uint16Array(nv);
    const tri = t => [0, 1, 2].map(k => [pos[3 * R.idx[3 * t + k]], pos[3 * R.idx[3 * t + k] + 1], pos[3 * R.idx[3 * t + k] + 2]]);
    const norm = v => { const u = [0, 1, 2].map(q => v[1][q] - v[0][q]), w = [0, 1, 2].map(q => v[2][q] - v[0][q]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1; return n.map(x => x / l); };
    for (const [a, b] of X.coppie) for (const [p, q] of [[a, b], [b, a]]) { const P = tri(p), Q = tri(q), nq = norm(Q), c = [0, 1, 2].map(k => (P[0][k] + P[1][k] + P[2][k]) / 3), sd = Math.sign((c[0] - Q[0][0]) * nq[0] + (c[1] - Q[0][1]) * nq[1] + (c[2] - Q[0][2]) * nq[2]) || 1;
      for (let k = 0; k < 3; k++) { const v = R.idx[3 * p + k]; for (let r = 0; r < 3; r++) S[3 * v + r] += sd * nq[r] * 0.008; cnt[v]++; } }
    for (let v = 0; v < nv; v++) if (cnt[v]) for (let r = 0; r < 3; r++) pos[3 * v + r] += S[3 * v + r] / cnt[v];
  }
  if (pieghe0) log(nome, 'vertici in pieghe', pieghe0, '→', intersecanti(pos, R.idx).size);
  // i vertici spostati per diffusione non devono entrare negli ostacoli
  for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], d = sample(Fx, ...p); if (d >= MIN(i) * 0.5) continue; const [g, k] = spinta(p, MIN(i) - d); for (let q = 0; q < 3; q++) pos[3 * i + q] += g[q] * k; }
  MESHES[nome] = { pos, idx: R.idx, tag: R.tag, fdir: R.fdir };
  setMesh(nome, MESHES[nome]);
  if (!conControlli) return mossi;
  CHECK[nome] = { vertici: nv, triangoli: R.idx.length / 3, spostati: mossi, prima, dopo: controlli(pos, R.idx) };
  log(nome, 'tri', R.idx.length / 3, 'spostati', mossi, 'prima', JSON.stringify(prima), 'dopo', JSON.stringify(CHECK[nome].dopo));
}
/* ---- separazione di due muscoli lungo una direzione (capo breve del bicipite davanti al sottoscapolare) ----
   Il campo di distanza vede solo i vertici: il bordo del sottoscapolare è una lamina più sottile del passo della griglia e attraversava il capo breve
   fino a 3 mm con tutti i vertici del capo breve fuori. Qui si controllano i triangoli: i vertici di `nome` dentro `altro` (raggi con numero di
   avvolgimento) devono uscirne lungo `dir`, quelli dei triangoli che lo attraversano avanzano di `passo`; lo spostamento è un campo scalare reso liscio
   come una membrana (massimo tra richiesto e media dei vicini × `CALO`), con vicini sul grafo e nello spazio entro `RS` (lo spessore di una lamina si
   sposta tutto insieme, le due facce non si incrociano); si ripete finché non resta nulla (al massimo `giri` volte). */
const SEP = { MARG: 0.03, PASSO: 0.01, GIRI: 80, LISCIA: 60, CALO: 0.98, RS: 0.4 };
function separa(nome, altro, dir) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const raggio = (o, d, [a, b, c]) => { const e1 = sub(b, a), e2 = sub(c, a), pv = cr(d, e2), det = dt(e1, pv); if (Math.abs(det) < 1e-12) return null; const iv = 1 / det, s = sub(o, a), u = dt(s, pv) * iv; if (u < 0 || u > 1) return null;
    const qv = cr(s, e1), v = dt(d, qv) * iv; if (v < 0 || u + v > 1) return null; const t = dt(e2, qv) * iv; return t > 0 ? [t, Math.sign(det)] : null; };
  const lato = (p, q, T) => { const r = raggio(p, sub(q, p), T); return r && r[0] < 1; };
  const R = MESHES[nome], A = REAL(altro), I = R.idx, nv = R.pos.length / 3, cur = REAL(nome).pos;
  const id = new Map(), W = new Int32Array(nv); for (let v = 0; v < nv; v++) { const k = [0, 1, 2].map(q => Math.round(cur[3 * v + q] * 1e4)).join(); if (!id.has(k)) id.set(k, id.size); W[v] = id.get(k); }
  const nw = id.size, p0 = new Float64Array(3 * nw); for (let v = 0; v < nv; v++) for (let q = 0; q < 3; q++) p0[3 * W[v] + q] = cur[3 * v + q];
  const vic = Array.from({ length: nw }, () => new Set()); for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = W[I[t + k]], b = W[I[t + (k + 1) % 3]]; vic[a].add(b); vic[b].add(a); }
  const cella = (x, h) => [0, 1, 2].map(q => Math.floor(x[q] / h)).join(), hs = new Map();
  for (let w = 0; w < nw; w++) { const k = cella([p0[3 * w], p0[3 * w + 1], p0[3 * w + 2]], SEP.RS); if (!hs.has(k)) hs.set(k, []); hs.get(k).push(w); }
  for (let w = 0; w < nw; w++) { const c = [0, 1, 2].map(q => Math.floor(p0[3 * w + q] / SEP.RS));
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) for (const u of hs.get([c[0] + a, c[1] + b, c[2] + d].join()) || [])
      if (u !== w && Math.hypot(p0[3 * u] - p0[3 * w], p0[3 * u + 1] - p0[3 * w + 1], p0[3 * u + 2] - p0[3 * w + 2]) < SEP.RS) vic[w].add(u); }
  const nb = vic.map(x => [...x]);
  const TA = []; for (let t = 0; t < A.idx.length; t += 3) TA.push([0, 1, 2].map(k => [A.pos[3 * A.idx[t + k]], A.pos[3 * A.idx[t + k] + 1], A.pos[3 * A.idx[t + k] + 2]]));
  const C = 0.3, hA = new Map(); TA.forEach((v, t) => { const lo = [0, 1, 2].map(q => Math.floor(Math.min(v[0][q], v[1][q], v[2][q]) / C)), hi = [0, 1, 2].map(q => Math.floor(Math.max(v[0][q], v[1][q], v[2][q]) / C));
    for (let a = lo[0]; a <= hi[0]; a++) for (let b = lo[1]; b <= hi[1]; b++) for (let c = lo[2]; c <= hi[2]; c++) { const k = [a, b, c].join(); if (!hA.has(k)) hA.set(k, []); hA.get(k).push(t); } });
  const bb = [0, 1, 2].map(q => [Infinity, -Infinity]); for (let i = 0; i < A.pos.length; i++) { const q = i % 3; bb[q][0] = Math.min(bb[q][0], A.pos[i]); bb[q][1] = Math.max(bb[q][1], A.pos[i]); }
  const T = new Float64Array(nw), REQ = new Float64Array(nw), P = w => [0, 1, 2].map(q => p0[3 * w + q] + T[w] * dir[q]);
  // distanza lungo dir fino all'uscita da `altro` (0 se il punto è fuori)
  const uscita = o => { if (o.some((x, q) => x < bb[q][0] - 0.01 || x > bb[q][1] + 0.01)) return 0; const H = []; for (const t of TA) { const r = raggio(o, dir, t); if (r) H.push(r); }
    let s = H.reduce((a, b) => a + b[1], 0); if (!s) return 0; H.sort((a, b) => a[0] - b[0]); for (const [t, sg] of H) { s -= sg; if (!s) return t; } return H[H.length - 1][0]; };
  const storia = [];
  for (let g = 0; g <= SEP.GIRI; g++) {
    let dentro = 0, attraversano = 0;
    for (let w = 0; w < nw; w++) { const u = uscita(P(w)); if (u > 0) { REQ[w] = Math.max(REQ[w], T[w] + u + SEP.MARG); dentro++; } }
    for (let s = 0; s < I.length; s += 3) { const a = [0, 1, 2].map(k => P(W[I[s + k]])), lo = [0, 1, 2].map(q => Math.floor(Math.min(a[0][q], a[1][q], a[2][q]) / C)), hi = [0, 1, 2].map(q => Math.floor(Math.max(a[0][q], a[1][q], a[2][q]) / C));
      let o = false; const visti = new Set();
      for (let x = lo[0]; x <= hi[0] && !o; x++) for (let y = lo[1]; y <= hi[1] && !o; y++) for (let z = lo[2]; z <= hi[2] && !o; z++) for (const t of hA.get([x, y, z].join()) || []) {
        if (visti.has(t)) continue; visti.add(t); const b = TA[t]; for (let e = 0; e < 3 && !o; e++) o = lato(a[e], a[(e + 1) % 3], b) || lato(b[e], b[(e + 1) % 3], a); if (o) break; }
      if (o) { attraversano++; for (let k = 0; k < 3; k++) { const w = W[I[s + k]]; REQ[w] = Math.max(REQ[w], T[w] + SEP.PASSO); } } }
    storia.push(dentro + '/' + attraversano); if (!dentro && !attraversano) break;
    for (let w = 0; w < nw; w++) T[w] = Math.max(T[w], REQ[w]);
    for (let r = 0; r < SEP.LISCIA; r++) { const U = Float64Array.from(T); for (let w = 0; w < nw; w++) { let s = 0; for (const u of nb[w]) s += T[u]; U[w] = Math.max(REQ[w], nb[w].length ? s / nb[w].length * SEP.CALO : 0); } T.set(U); }
  }
  const pos = new Float32Array(3 * nv); for (let v = 0; v < nv; v++) { const p = P(W[v]); for (let q = 0; q < 3; q++) pos[3 * v + q] = p[q]; }
  MESHES[nome] = { ...R, pos }; setMesh(nome, MESHES[nome]);
  log(nome, 'separato da', altro, '(vertici dentro / triangoli che attraversano, per giro)', storia.join(' '), 'spostamento massimo', (Math.max(...T) * 10).toFixed(1), 'mm');
  return storia[storia.length - 1];
}
const CAMPI = {}; for (const [m, ex] of Object.entries(ESCLUSI)) { CAMPI[m] = campo(ex).F; log('campo senza', ex.join(', '), 'per', m); }
for (const nome of MUSCOLI) libera(nome, CAMPI[nome] || F);
for (const [nome, { ostacolo, base }] of Object.entries(SOPRA)) { const Fo = esatta(sdf(unione(ostacolo)).F, ostacolo, 0.12), Fb = esatta(sdf(unione(base)).F, base, 0.12);
  const n = libera(nome, Fo, false, MARG, Fb); CHECK[nome].sopra = n; log(nome, 'sollevati sopra', ostacolo.join(', '), n); }
// capo breve del bicipite e coracobrachiale davanti al sottoscapolare: non lo attraversano
{ const Fs = esatta(sdf(unione(['subs'])).F, ['subs'], 0.12);
  for (const nome of ['bic_breve', 'coracobr']) { const n = libera(nome, Fs, false); CHECK[nome].fuori_sottoscapolare = n; log(nome, 'spostati fuori dal sottoscapolare', n); } }
CHECK.bic_breve.separato_sottoscapolare = separa('bic_breve', 'subs', [0, 0, 1]);
// deltoide sopra la cuffia (a BORSA di distanza: lo spazio della borsa subacromion-deltoidea, costruita da borsa-spalla.mjs): dove i tendini della cuffia (già sistemati) attraversano il deltoide, il deltoide si solleva sopra di loro
// il deltoide passa anche davanti al capo breve del bicipite (spostato in avanti da `separa`)
{ const CUF = nomi(['cuf']), Fc2 = esatta(sdf(unione(CUF)).F, CUF, 0.12), DAV = ['bic_breve'], Fd = esatta(sdf(unione([...CUF, ...DAV])).F, [...CUF, ...DAV], 0.12);
  for (const nome of nomi(['cin'])) { const n = libera(nome, nome.startsWith('delt') ? Fd : Fc2, false, BORSA); CHECK[nome].sopra_cuffia = n; log(nome, 'sollevati sopra la cuffia', n); } }
// normali
for (const nome of MUSCOLI) { const T = MESHES[nome], cur = REAL(nome); T.pos = Float32Array.from(cur.pos); T.nrm = normaliLisce(T.pos, T.idx, T.tag); setMesh(nome, T); }
const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) writeFileSync(prova, JSON.stringify(CHECK, null, 1));
else saveFile(repack());
