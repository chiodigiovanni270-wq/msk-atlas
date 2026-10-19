/* Muscoli della spalla (modelli/spalla-3d.html): toglie le compenetrazioni dei muscoli BodyParts3D con le strutture più profonde
   (ossa, cartilagini, labbro, capsula, legamenti, vasi e nervi) e riscrive le normali di vertice.

   Uso (dalla cartella del progetto):
     node strumenti/muscoli-spalla.mjs                  → riscrive i muscoli nel file del modello
     node strumenti/muscoli-spalla.mjs --prova=f.json   → non tocca il modello: scrive i controlli (prima/dopo) in un JSON
     MODELLO=/tmp/copia.html node strumenti/muscoli-spalla.mjs   → lavora su una copia
   È l'ultimo della catena: va lanciato dopo `vasi-nervi-spalla.mjs`, che ripristina i muscoli della revisione `59b7798` (anche la topologia) e vi
   scava i canali dei tubi. Lavora sui muscoli incorporati e sposta vertici solo verso l'esterno degli ostacoli: rilanciarlo sul proprio risultato
   non cambia nulla; se si rifà uno strato più profondo va rilanciato `vasi-nervi-spalla.mjs` e poi questo.

   Metodo:
     1. Campo di distanza con segno (griglia 0,6 mm, distanza esatta dai triangoli entro 1,2 mm dalle superfici) dall'unione degli ostacoli; la capsula è
        un solido pieno (guscio + ossa racchiudono la cavità articolare: riempimento dall'esterno), così i tendini della cuffia che entravano nella
        cavità vengono portati sulla faccia esterna della capsula, dove nella realtà si fondono con essa.
     2. Raffinamento: i triangoli dei muscoli entro `ZONA` dagli ostacoli (vertici, baricentro o punti medi dei lati) sono divisi (punti medi dei lati,
        con triangoli verdi di raccordo: nessuna fessura) finché i lati superano `LATO`; le mesh BodyParts3D ridotte hanno triangoli fino a 2 cm, che
        scavalcano un ostacolo senza avere vertici dentro (la capsula o un legamento affioravano attraverso il muscolo). Tag e direzione delle fibre
        sono interpolati sui punti nuovi.
     3. Vertici con distanza < `MARG` (dentro un ostacolo o a contatto): spostati lungo il gradiente fino a `MARG` (tre passate).
     4. Lo spostamento è diffuso ai vertici vicini (`DIFF` passate di media sul grafo della mesh), così la superficie del muscolo si piega con continuità
        invece di formare un gradino.
     4b. `delt_cl`: tolti i triangoli oltre il 34 % della clavicola (dall'estremo laterale): l'origine reale è sul terzo laterale.
     5. Deltoide e altri muscoli della spalla sopra la cuffia già sistemata (stesso procedimento con la cuffia come ostacolo).
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

const MARG = 0.05, DIFF = 8, PASSO = 0.06, ZONA = 0.5, LATO = 0.25, NORM_DIFF = 3, LEV = 6, SPESS = 0.12;   // SPESS: spessore minimo di una lamina (tendine) spinta fuori da un ostacolo                 // cm
const nomi = cats => STR.filter(s => cats.includes(s.cat)).flatMap(s => s.mesh.map(m => m[0]));
const MUSCOLI = nomi(['cuf', 'cin', 'tor', 'brac']);
const GRUPPI = { ossa: ['scapola', 'clavicola', 'omero', 'manubrio'], cartilagini: ['cart_omero', 'cart_glen'], capsula: ['caps', 'labbro'],
  legamenti: nomi(['leg']), vasi_nervi: nomi(['art', 'ven', 'ner']) };

griglia([-8, -14, -9], [16, 6, 8], PASSO, 0.2);
const { N, NX, NY, NZ, NXY } = G;
log('griglia', NX, NY, NZ, (N / 1e6).toFixed(1), 'M voxel');
const tutti = Object.values(GRUPPI).flat();
const M = unione(tutti.filter(n => n !== 'caps'));
// capsula piena: guscio (ispessito di un voxel, niente fughe) + interno non raggiungibile dall'esterno
{ const Sh = solid('caps'), Do = G.edt(Sh); for (let i = 0; i < N; i++) if (Do[i] <= PASSO * 1.01) Sh[i] = 1;
  const C = or(Sh, M.slice()), fuori = new Uint8Array(N), coda = [];
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { if (i && j && k && i < NX - 1 && j < NY - 1 && k < NZ - 1) continue; const id = i + NX * j + NXY * k; if (!C[id]) { fuori[id] = 1; coda.push(id); } }
  while (coda.length) { const id = coda.pop(), i = id % NX, j = ((id / NX) | 0) % NY, k = (id / NXY) | 0;
    for (const [d, ok] of [[1, i < NX - 1], [-1, i > 0], [NX, j < NY - 1], [-NX, j > 0], [NXY, k < NZ - 1], [-NXY, k > 0]]) { const m = id + d; if (ok && !fuori[m] && !C[m]) { fuori[m] = 1; coda.push(m); } } }
  let n = 0; for (let i = 0; i < N; i++) if (!fuori[i] && !M[i]) { M[i] = 1; n++; } log('capsula piena:', (n * PASSO ** 3).toFixed(1), 'cm³'); }
// distanza esatta dalle mesh chiuse; la capsula piena (le cui facce interne non sono bordo del solido) entra solo come distanza voxel
const Mn = unione(tutti.filter(n => n !== 'caps')), Fn = esatta(sdf(Mn).F, tutti.filter(n => n !== 'caps'), 0.12), Fc = sdf(M).F, F = new Float32Array(N);
for (let i = 0; i < N; i++) F[i] = Math.min(Fn[i], Fc[i]);
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
const CLAV_FINO = 0.34;
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
  log('delt_cl: tagliato al', Math.round(CLAV_FINO * 100), '% della clavicola,', (idx.length - out.length) / 3, 'triangoli in meno netti');
  return { pos: Float32Array.from(P), idx: Uint32Array.from(out), tag: T ? Uint8Array.from(T) : null, fdir: D ? Int8Array.from(D) : null };
}
const CHECK = {};
const MESHES = {};
// sposta fuori dagli ostacoli del campo Fx i vertici del muscolo (raffinando prima la mesh vicino agli ostacoli); restituisce i vertici spostati
function libera(nome, Fx, conControlli = true) {
  const m0 = REAL(nome), a0 = attrs(nome), S0 = nome === 'delt_cl' ? tagliaClavicola(m0.pos, m0.idx, a0.tag, a0.fdir) : { pos: m0.pos, idx: m0.idx, tag: a0.tag, fdir: a0.fdir }, R = raffina(S0.pos, S0.idx, S0.tag, S0.fdir, Fx), pos = Float32Array.from(R.pos), nv = pos.length / 3, prima = conControlli ? controlli(m0.pos, m0.idx) : null;
  const D = new Float32Array(nv * 3), req = new Uint8Array(nv);
  // lamine sottili (tendini a due strati): lo strato rivolto verso l'ostacolo e quello rivolto fuori vanno spinti entrambi, e il secondo di SPESS in più,
  // altrimenti i due strati si sovrappongono (z-fighting: chiazze scure a bordo netto che cambiano con la vista)
  const VN = new Float64Array(nv * 3);
  for (let t = 0; t < R.idx.length; t += 3) { const [a, b, c] = [R.idx[t], R.idx[t + 1], R.idx[t + 2]], u = [0, 1, 2].map(q => pos[3 * b + q] - pos[3 * a + q]), w = [0, 1, 2].map(q => pos[3 * c + q] - pos[3 * a + q]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; for (const v of [a, b, c]) for (let q = 0; q < 3; q++) VN[3 * v + q] += n[q]; }
  const fuori = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; if (sample(Fx, ...p) >= ZONA) continue; const g = grad(Fx, p), l = Math.hypot(...g) * Math.hypot(VN[3 * i], VN[3 * i + 1], VN[3 * i + 2]) || 1; if ((g[0] * VN[3 * i] + g[1] * VN[3 * i + 1] + g[2] * VN[3 * i + 2]) / l > 0.3) fuori[i] = 1; }
  const MIN = i => MARG + (fuori[i] ? SPESS : 0);
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < nv; i++) {
    const p = [pos[3 * i] + D[3 * i], pos[3 * i + 1] + D[3 * i + 1], pos[3 * i + 2] + D[3 * i + 2]], d = sample(Fx, ...p); if (d >= MIN(i)) continue;
    const g = grad(Fx, p), l = Math.hypot(...g) || 1, k = (MIN(i) - d) / l; D[3 * i] += g[0] * k; D[3 * i + 1] += g[1] * k; D[3 * i + 2] += g[2] * k; req[i] = 1;
  }
  const nb = B.vicini(nv, R.idx), comp = [0, 1, 2].map(q => B.diffondi(Array.from({ length: nv }, (_, i) => D[3 * i + q]), nb, DIFF));
  let mossi = 0;
  for (let i = 0; i < nv; i++) {
    if (req[i]) { mossi++; for (let q = 0; q < 3; q++) pos[3 * i + q] += D[3 * i + q]; continue; }
    const s = [comp[0][i], comp[1][i], comp[2][i]], l = Math.hypot(...s); if (l < 1e-5) continue;
    for (let q = 0; q < 3; q++) pos[3 * i + q] += s[q] * 0.8;
  }
  // levigatura dei vertici spostati: il gradiente del campo a voxel è rumoroso e il muscolo spinto fuori si increspava (facce a bordo netto);
  // media coi vicini e riproiezione fuori dall'ostacolo, a più riprese
  const mov = new Uint8Array(nv); for (let i = 0; i < nv; i++) if (Math.hypot(D[3 * i], D[3 * i + 1], D[3 * i + 2]) > 1e-4 || Math.hypot(comp[0][i], comp[1][i], comp[2][i]) > 1e-4) mov[i] = 1;
  for (let r = 0; r < LEV; r++) {
    const nuovo = Float32Array.from(pos);
    for (let i = 0; i < nv; i++) { if (!mov[i] || !nb[i].length) continue; for (let q = 0; q < 3; q++) { let s = 0; for (const j of nb[i]) s += pos[3 * j + q]; nuovo[3 * i + q] = 0.4 * pos[3 * i + q] + 0.6 * s / nb[i].length; } }
    for (let i = 0; i < nv; i++) { if (!mov[i]) continue; const p = [nuovo[3 * i], nuovo[3 * i + 1], nuovo[3 * i + 2]], d = sample(Fx, ...p); if (d < MIN(i)) { const g = grad(Fx, p), l = Math.hypot(...g) || 1, k = (MIN(i) - d) / l; for (let q = 0; q < 3; q++) nuovo[3 * i + q] += g[q] * k; } }
    pos.set(nuovo);
  }
  // i vertici spostati per diffusione non devono entrare negli ostacoli
  for (let i = 0; i < nv; i++) { const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], d = sample(Fx, ...p); if (d >= MIN(i) * 0.5) continue; const g = grad(Fx, p), l = Math.hypot(...g) || 1, k = (MIN(i) - d) / l; for (let q = 0; q < 3; q++) pos[3 * i + q] += g[q] * k; }
  MESHES[nome] = { pos, idx: R.idx, tag: R.tag, fdir: R.fdir };
  setMesh(nome, MESHES[nome]);
  if (!conControlli) return mossi;
  CHECK[nome] = { vertici: nv, triangoli: R.idx.length / 3, spostati: mossi, prima, dopo: controlli(pos, R.idx) };
  log(nome, 'tri', R.idx.length / 3, 'spostati', mossi, 'prima', JSON.stringify(prima), 'dopo', JSON.stringify(CHECK[nome].dopo));
}
for (const nome of MUSCOLI) libera(nome, F);
// deltoide sopra la cuffia: dove i tendini della cuffia (già sistemati) attraversano il deltoide, il deltoide si solleva sopra di loro
{ const CUF = nomi(['cuf']), Fc2 = esatta(sdf(unione(CUF)).F, CUF, 0.12);
  for (const nome of nomi(['cin'])) { const n = libera(nome, Fc2, false); CHECK[nome].sopra_cuffia = n; log(nome, 'sollevati sopra la cuffia', n); } }
// normali
for (const nome of MUSCOLI) { const T = MESHES[nome], cur = REAL(nome); T.pos = Float32Array.from(cur.pos); T.nrm = normaliLisce(T.pos, T.idx, T.tag); setMesh(nome, T); }
const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
if (prova) writeFileSync(prova, JSON.stringify(CHECK, null, 1));
else saveFile(repack());
