/* Sezioni di taglio distali dei muscoli della spalla (modelli/spalla-3d.html): tappo piatto a y = −14 chiuso sul contorno del muscolo.

   Problema. La bozza ritaglia i muscoli a y = −14 cm e chiude la sezione con un tappo (vertici propri, tag 250) il cui bordo coincide con il
   bordo della parete. Gli script successivi (spinte, Taubin, riduzione) hanno spostato la parete ma non il tappo: il bordo della parete è
   risalito fino a y −12,3/−13,9 e rientrato di 4–18 mm, quindi guardando dal basso si vede il tappo piatto e, attorno, un anello aperto da cui
   si vede l'interno del muscolo (facce interne della parete).

   Uso (dalla cartella del progetto):
     node strumenti/sezioni-spalla.mjs                → riscrive le sezioni nel file del modello
     PROVA=1 node strumenti/sezioni-spalla.mjs        → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/sezioni-spalla.mjs   → lavora su una copia
   Ultimo della catena (dopo `deltoide-spalla.mjs`). Riparte dalle mesh del file e si può rilanciare: al secondo lancio il bordo è già sul
   piano e il tappo viene solo ricostruito uguale. Se si rilancia uno script precedente che tocca questi muscoli, rilanciare poi anche questo.

   Metodo, per ogni muscolo con tappo a y = −14 (`Y_TAGLIO`):
   1. Toglie il tappo vecchio (vertici tag 250/251 sotto `Y_TAGLIO` + 0,1) e trova gli anelli di bordo della parete vicini al taglio (y medio
      sotto `Y_ANELLO`).
   2. Prolunga la parete fino al piano: ogni vertice dell'anello scende in verticale fino a y = −14 (in verticale, non lungo la pendenza della
      parete: così il contorno sul piano è quello del bordo attuale e i tappi di muscoli vicini non si accavallano); dove il contorno proiettato
      si incrocia (zig-zag del bordo) i vertici coinvolti si spostano verso la media dei vicini finché non ci sono incroci. I vertici vicini
      seguono con peso che sfuma a zero entro `SFUMA` (≥ 2 volte lo spostamento di ciascun vertice dell'anello), così la parete resta liscia.
      Nessun vertice sotto il piano.
   3. Tappo nuovo: triangolazione di Delaunay conforme del contorno (proiettato sul piano) con punti interni a griglia di passo `H_TAPPO`;
      i lati del contorno mancanti vengono divisi a metà finché compaiono tutti. Vertici propri (tag 250, direzione delle fibre del vertice di
      parete più vicino), normale verso il basso: il bordo del tappo coincide con il bordo della parete, senza fessura.
   4. Normali: dove il file le ha scritte (`nm`) si ricalcolano solo per i vertici spostati (verso conservato), il tappo ha (0, −1, 0).
   Controlli stampati: incroci del contorno (0), lati del contorno mancanti nel tappo (0), distanza massima tra bordo del tappo e bordo della
   parete (~0), altri bordi aperti della parete (0). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const { REAL, attrs, man, buf0, setMesh, repack, saveFile, log, sstep } = await import('./lib-modello.mjs');

const Y_TAGLIO = -14, Y_ANELLO = -12, SFUMA = 1.2, H_TAPPO = 0.18;
const PROVA = !!process.env.PROVA;

const nmDi = n => { const m = man.meshes.findLast(x => x.n === n); return m.nm !== undefined ? new Int8Array(buf0.buffer, buf0.byteOffset + m.nm, m.nv * 3).slice() : null; };

/* ---- triangolazione di Delaunay (Bowyer–Watson) di punti 2D; restituisce terne di indici ---- */
function delaunay(P) {
  const n = P.length; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const d = Math.max(x1 - x0, y1 - y0) * 20, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const Q = P.concat([[cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]]);
  const cc = (a, b, c) => { const [ax, ay] = Q[a], [bx, by] = Q[b], [qx, qy] = Q[c], D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / D;
    return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2]; };
  let T = [[n, n + 1, n + 2, ...cc(n, n + 1, n + 2)]];
  for (let i = 0; i < n; i++) {
    const [px, py] = Q[i], bad = [], keep = [];
    for (const t of T) ((px - t[3]) ** 2 + (py - t[4]) ** 2 < t[5] * (1 - 1e-12) ? bad : keep).push(t);
    const E = new Map();
    for (const t of bad) for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], key = a < b ? a + ',' + b : b + ',' + a; E.set(key, E.has(key) ? null : [a, b]); }
    for (const e of E.values()) if (e) keep.push([e[0], e[1], i, ...cc(e[0], e[1], i)]);
    T = keep;
  }
  return T.filter(t => t[0] < n && t[1] < n && t[2] < n).map(t => [t[0], t[1], t[2]]);
}
const dentro = (L, x, y) => { let c = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const [xi, yi] = L[i], [xj, yj] = L[j];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const incroci = L => { const k = []; const m = L.length, cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) { if (i === 0 && j === m - 1) continue; const a = L[i], b = L[(i + 1) % m], c = L[j], d = L[(j + 1) % m];
    if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) k.push(i, j); } return k; };
// contorno senza incroci (proiezione sul piano): media con i vicini attorno ai lati che si incrociano, finché non ce ne sono più
function districa(L) {
  const m = L.length;
  for (let giro = 0; giro < 400; giro++) { const k = incroci(L); if (!k.length) return giro;
    const S = new Set(); for (const i of k) for (let d = -2; d <= 3; d++) S.add(((i + d) % m + m) % m);
    const N = L.map(p => p.slice()); for (const i of S) { const a = L[(i + m - 1) % m], b = L[(i + 1) % m]; N[i] = [0.5 * L[i][0] + 0.25 * (a[0] + b[0]), 0.5 * L[i][1] + 0.25 * (a[1] + b[1])]; }
    for (let i = 0; i < m; i++) L[i] = N[i]; }
  return -1;
}
const distSeg = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };

/* ---- tappo di un anello (punti 2D in ordine): punti 2D e triangoli; i primi punti sono quelli dell'anello (più eventuali punti a metà dei lati) ---- */
function tappo(L) {
  // lati lunghi divisi: i punti nuovi stanno sul segmento, quindi il contorno resta quello della parete
  let C = []; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length], k = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / H_TAPPO);
    for (let j = 0; j < k; j++) C.push({ p: [a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k], src: j ? -1 : i }); }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const { p: [x, y] } of C) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const poly = C.map(c => c.p), G = [];
  for (let x = x0 + H_TAPPO / 2; x < x1; x += H_TAPPO) for (let y = y0 + H_TAPPO / 2; y < y1; y += H_TAPPO) {
    const yy = y + ((Math.round((x - x0) / H_TAPPO) % 2) ? H_TAPPO / 2 : 0);   // griglia sfalsata: triangoli quasi equilateri
    if (!dentro(poly, x, yy)) continue; let dm = 1e9; for (let i = 0; i < poly.length; i++) dm = Math.min(dm, distSeg(x, yy, poly[i], poly[(i + 1) % poly.length]));
    if (dm > 0.6 * H_TAPPO) G.push([x, yy]);
  }
  for (let giro = 0; giro < 12; giro++) {
    // Delaunay su punti appena perturbati (i punti a metà dei lati sono allineati: cerchi circoscritti degeneri); le posizioni restano esatte
    const P = C.map(c => c.p).concat(G), T = delaunay(P.map(([x, y], i) => [x + 1e-6 * Math.sin(i * 12.9898), y + 1e-6 * Math.cos(i * 78.233)])), m = C.length, E = new Set();
    for (const t of T) for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; E.add(a < b ? a + ',' + b : b + ',' + a); }
    const manca = []; for (let i = 0; i < m; i++) { const j = (i + 1) % m; if (!E.has(i < j ? i + ',' + j : j + ',' + i)) manca.push(i); }
    if (!manca.length || giro === 11) {
      const poly2 = C.map(c => c.p);
      const tri = T.filter(t => { const cx = (P[t[0]][0] + P[t[1]][0] + P[t[2]][0]) / 3, cy = (P[t[0]][1] + P[t[1]][1] + P[t[2]][1]) / 3; return dentro(poly2, cx, cy); });
      return { P, tri, C, manca: manca.length };
    }
    const nuovo = []; for (let i = 0; i < m; i++) { nuovo.push(C[i]); if (manca.includes(i)) { const a = C[i].p, b = C[(i + 1) % m].p; nuovo.push({ p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], src: -1 }); } }
    C = nuovo;
  }
}

/* ---- muscoli con tappo al taglio distale ---- */
const NOMI = man.meshes.filter((m, i) => man.meshes.findLastIndex(x => x.n === m.n) === i && m.t !== undefined).map(m => m.n).filter(n => {
  const { tag } = attrs(n), R = REAL(n); for (let i = 0; i < R.nv; i++) if (tag[i] >= 250 && R.pos[3 * i + 1] < Y_TAGLIO + 0.1) return true; return false; });
log('muscoli con sezione distale:', NOMI.join(', '));

for (const n of NOMI) {
  const R = REAL(n), { tag: tag0, fdir: fd0 } = attrs(n), nm0 = nmDi(n), I0 = R.idx;
  // 1. via il tappo vecchio
  const via = new Uint8Array(R.nv); for (let i = 0; i < R.nv; i++) via[i] = tag0[i] >= 250 && R.pos[3 * i + 1] < Y_TAGLIO + 0.1 ? 1 : 0;
  const map = new Int32Array(R.nv).fill(-1); let nv = 0; for (let i = 0; i < R.nv; i++) if (!via[i]) map[i] = nv++;
  const pos = new Float64Array(nv * 3), tag = [], fdir = [], nm = nm0 ? new Float64Array(nv * 3) : null;
  for (let i = 0; i < R.nv; i++) if (map[i] >= 0) { const j = map[i]; for (let k = 0; k < 3; k++) { pos[3 * j + k] = R.pos[3 * i + k]; if (nm) nm[3 * j + k] = nm0[3 * i + k] / 127; fdir.push(fd0 ? fd0[3 * i + k] : 0); } tag.push(tag0[i]); }
  const idx = []; for (let t = 0; t < I0.length; t += 3) { const a = map[I0[t]], b = map[I0[t + 1]], c = map[I0[t + 2]]; if (a >= 0 && b >= 0 && c >= 0) idx.push(a, b, c); }
  // anelli di bordo orientati (lato a→b di un triangolo senza il gemello b→a)
  const he = new Set(); for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) he.add(idx[t + k] + ',' + idx[t + (k + 1) % 3]);
  const nxt = new Map(); for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; if (!he.has(b + ',' + a)) nxt.set(a, b); }
  const loops = [], vis = new Set();
  for (const s of nxt.keys()) { if (vis.has(s)) continue; const L = []; let c = s; while (c !== undefined && !vis.has(c)) { vis.add(c); L.push(c); c = nxt.get(c); }
    if (c === s && L.length >= 3) loops.push(L); }
  const anelli = loops.filter(L => L.reduce((s, v) => s + pos[3 * v + 1], 0) / L.length < Y_ANELLO);
  // 2. parete prolungata fino al piano
  // in verticale: il contorno sul piano resta quello del bordo attuale, quindi i tappi di muscoli vicini non si sovrappongono
  // (prolungando lungo la pendenza della parete i tappi di bicipite, tricipite, gran dorsale e trapezio si accavallavano di 20–70 mm²)
  const inAnello = new Set(anelli.flat()), D = new Map(); let dmax = 0;
  for (const v of inAnello) { const dy = pos[3 * v + 1] - Y_TAGLIO; D.set(v, [0, -dy, 0]); dmax = Math.max(dmax, dy); }
  // contorno sul piano senza incroci: lo spostamento dei vertici dell'anello include la correzione
  let giriDistrica = 0;
  for (const L of anelli) { const L2 = L.map(v => { const d = D.get(v); return [pos[3 * v] + d[0], pos[3 * v + 2] + d[2]]; }), g = districa(L2);
    giriDistrica = g < 0 ? -1 : Math.max(giriDistrica, g);
    L.forEach((v, i) => { const d = D.get(v); d[0] = L2[i][0] - pos[3 * v]; d[2] = L2[i][1] - pos[3 * v + 2]; }); }
  // sfumatura propria di ogni vertice dell'anello (≥ 2 volte il suo spostamento): uno spostamento grande non trascina la parete lontano altrove
  const AV = [...inAnello], HB = AV.map(b => Math.max(SFUMA, 2 * Math.hypot(...D.get(b)))), Hmax = Math.max(...HB);
  const mosso = new Uint8Array(nv), Pn = Float64Array.from(pos);
  for (let i = 0; i < nv; i++) {
    if (inAnello.has(i)) { const d = D.get(i); for (let k = 0; k < 3; k++) Pn[3 * i + k] += d[k]; Pn[3 * i + 1] = Y_TAGLIO; mosso[i] = 1; continue; }
    if (pos[3 * i + 1] > Y_TAGLIO + 3 + Hmax) continue;
    let s = [0, 0, 0], ws = 0;
    AV.forEach((b, j) => { const d = Math.hypot(pos[3 * i] - pos[3 * b], pos[3 * i + 1] - pos[3 * b + 1], pos[3 * i + 2] - pos[3 * b + 2]);
      if (d >= 3 * Hmax) return; const g = Math.exp(-((d / 0.35) ** 2)) + 1e-12, f = 1 - sstep(0, HB[j], d), db = D.get(b);
      for (let k = 0; k < 3; k++) s[k] += g * f * db[k]; ws += g; });
    if (!ws || !(s[0] || s[1] || s[2])) continue;
    for (let k = 0; k < 3; k++) Pn[3 * i + k] += s[k] / ws;
    if (Pn[3 * i + 1] < Y_TAGLIO + 0.005) Pn[3 * i + 1] = Y_TAGLIO + 0.005;
    mosso[i] = 1;
  }
  const H = Hmax;
  // 3. tappi nuovi
  const P = Array.from(Pn), T = idx.slice(), TAG = tag.slice(), FD = fdir.slice(), NM = nm ? Array.from(nm) : null;
  let mancano = 0, scarto = 0, nTri = 0, nInc = 0;
  for (const L of anelli) {
    const L2 = L.map(v => [Pn[3 * v], Pn[3 * v + 2]]), { P: Q, tri, C, manca } = tappo(L2); mancano += manca; nInc += incroci(L2).length / 2;
    const base = P.length / 3;
    for (let q = 0; q < Q.length; q++) {
      P.push(Q[q][0], Y_TAGLIO, Q[q][1]); TAG.push(250);
      let best = 0, bd = 1e9; for (const v of L) { const d = (Pn[3 * v] - Q[q][0]) ** 2 + (Pn[3 * v + 2] - Q[q][1]) ** 2; if (d < bd) { bd = d; best = v; } }
      FD.push(fdir[3 * best], fdir[3 * best + 1], fdir[3 * best + 2]); if (NM) NM.push(0, -1, 0);
      if (q < C.length) { let dm = 1e9; for (let i = 0; i < L2.length; i++) dm = Math.min(dm, distSeg(Q[q][0], Q[q][1], L2[i], L2[(i + 1) % L2.length])); scarto = Math.max(scarto, dm); }
    }
    for (const [a, b, c] of tri) { const ux = Q[b][0] - Q[a][0], uz = Q[b][1] - Q[a][1], wx = Q[c][0] - Q[a][0], wz = Q[c][1] - Q[a][1];
      const ny = uz * wx - ux * wz;   // componente y di (b−a)×(c−a) con y = −14 costante
      if (ny < 0) T.push(base + a, base + b, base + c); else T.push(base + a, base + c, base + b); nTri++; }
  }
  // 4. normali scritte: ricalcolate per i vertici spostati
  if (NM) {
    const acc = new Float64Array(nv * 3);
    for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]]; if (!mosso[a] && !mosso[b] && !mosso[c]) continue;
      const u = [0, 1, 2].map(k => P[3 * b + k] - P[3 * a + k]), w = [0, 1, 2].map(k => P[3 * c + k] - P[3 * a + k]);
      const f = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (const v of [a, b, c]) for (let k = 0; k < 3; k++) acc[3 * v + k] += f[k]; }
    for (let i = 0; i < nv; i++) if (mosso[i]) { const l = Math.hypot(acc[3 * i], acc[3 * i + 1], acc[3 * i + 2]); if (!l) continue;
      let s = (acc[3 * i] * nm[3 * i] + acc[3 * i + 1] * nm[3 * i + 1] + acc[3 * i + 2] * nm[3 * i + 2]) < 0 ? -1 : 1;
      for (let k = 0; k < 3; k++) NM[3 * i + k] = s * acc[3 * i + k] / l; }
  }
  // controlli: lati di bordo dopo la ricostruzione
  const E = new Map(); for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) { const a = T[t + k], b = T[t + (k + 1) % 3], key = a < b ? a + ',' + b : b + ',' + a; E.set(key, (E.get(key) || 0) + 1); }
  let bordiParete = 0; for (const [k, c] of E) if (c === 1) { const [a, b] = k.split(',').map(Number); if (a < nv && b < nv && P[3 * a + 1] > Y_TAGLIO + 1e-6 && !(inAnello.has(a) && inAnello.has(b))) bordiParete++; }
  log(n.padEnd(11), 'anelli', anelli.length, 'spostamento max', dmax.toFixed(2), 'cm, sfuma', H.toFixed(2), '| tappo', nTri, 'triangoli, lati del contorno mancanti', mancano,
    '| incroci del contorno', nInc, '(giri per districarlo', giriDistrica + ')', '| scarto bordo tappo/parete', scarto.toExponential(1), '| altri bordi aperti', bordiParete);
  const mesh = { pos: Float32Array.from(P), idx: Uint32Array.from(T), tag: Uint8Array.from(TAG), fdir: Int8Array.from(FD) };
  if (NM) mesh.nrm = Int8Array.from(NM, x => Math.round(Math.max(-1, Math.min(1, x)) * 127));
  setMesh(n, mesh);
}
if (PROVA) log('PROVA: nessuna scrittura'); else saveFile(repack());
