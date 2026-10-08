/* Passaggio del fascio popliteo sotto l'arcata tendinea del soleo (modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto):
     node strumenti/arcata-soleo-ginocchio.mjs [--prova]
   Con --prova stampa solo le verifiche, senza modificare il file.

   Anatomia (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020):
   - Arteria e vena poplitea e nervo tibiale scendono sul popliteo e passano PROFONDI all'arcata tendinea del soleo
     (tesa tra l'origine fibulare e quella tibiale del muscolo), non attraverso il muscolo; sotto l'arcata il fascio
     poggia sul tibiale posteriore, coperto dal soleo.
   - Al margine inferiore del popliteo l'arteria si divide in tibiale anteriore e posteriore; la vena poplitea nasce
     dalla confluenza delle vene tibiali anteriori (satelliti dell'arteria tibiale anteriore, che passa sopra la
     membrana interossea) e posteriori. Le vene satelliti sono di solito doppie: qui una per lato.

   Nel modello (dopo percorsi-ginocchio.mjs) il fascio attraversava la parte alta del soleo in una fessura aperta
   all'indietro e la vena poplitea finiva con un bordo netto sull'origine della tibiale posteriore. Lo strumento:
   1. sposta il fascio (arterie, vene e nervo tibiale; quote e spostamenti in SPOSTA) in avanti, verso il tibiale
      posteriore, e lateralmente al capo tibiale del soleo, con un campo di spostamento liscio (stessa traslazione per
      tutti i tubi alla stessa quota: rapporti e origini dei rami restano);
   2. riparte dal soleo precedente allo scavo di percorsi-ginocchio.mjs (revisione PRESCAVO, vertici ritrovati per
      posizione nella revisione ORDINE perché poi riordinati) e ricostruisce la zona BOX come superficie implicita:
      soleo meno un canale lungo il fascio (tubo + GAP prolungato in avanti fino al piano osseo, canali dei vari tubi
      fusi con raccordo UNIONE, raccordo ARROT con la superficie del muscolo), con surface nets e Taubin. Il muscolo resta
      intero dietro al fascio (l'arcata, con margine superiore concavo) e il fascio scorre tra soleo e tibiale
      posteriore. Fuori da BOX la mesh resta quella originale: si tolgono i suoi triangoli con un vertice in BOX, della
      superficie nuova si tengono quelli che cadono nel buco, il bordo nuovo si posa su quello originale e le due parti
      si ricuciono con una striscia di triangoli; gli ultimi RACC anelli della superficie nuova vengono levigati. Tag
      (muscolo/tendine) e direzione delle fibre dei vertici nuovi dai 4 vertici originali più vicini;
   3. costruisce la confluenza delle vene: le tibiali (posteriore e anteriore) nascono dentro l'ultimo tratto della
      poplitea, ne seguono la direzione per qualche millimetro e poi divergono; la poplitea si assottiglia dentro di
      loro, così non si vede nessun bordo. Allo stesso modo le arterie tibiali nascono dentro la fine della poplitea;
   4. aggiunge la vena tibiale anteriore (`vtant`), satellite dell'arteria tibiale anteriore fino al taglio della gamba:
      il lato rispetto all'arteria si sceglie sezione per sezione con la programmazione dinamica (meno compenetrazione,
      lato che cambia lentamente), poi il filo viene levigato e tenuto fuori da ossa, muscoli e altri tubi.
   Riparte da tubi e soleo della revisione PARTENZA, quindi si può rilanciare. `node strumenti/arcata-soleo-ginocchio.mjs
   verifica` elenca le compenetrazioni del fascio con ossa e muscoli e della vena tibiale anteriore con gli altri tubi;
   DEBUG=1 stampa i dettagli della cucitura.

   Requisiti: Node 18 o successivo, nessuna dipendenza. */
import { M, REAL, setPos, setMesh, posDaRevisione, realDaRevisione, setGriglia, griglia, N, or, solid, edt, sdf, esatta, nets, voxel, sample, clamp, sstep, log, repack, saveFile, O, H, NX, NY, NZ, NXY } from './lib-modello.mjs';
import { execFileSync } from 'node:child_process';

const PARTENZA = '2542f99';   // tubi e soleo prima di questo strumento
const PRESCAVO = 'c80c4a1';   // soleo prima dello scavo di percorsi-ginocchio.mjs
const ORDINE = '66d0393';     // stesso soleo di PRESCAVO, con lo scavo: serve a ritrovare i vertici (riordinati dopo)
const PROVA = process.argv.includes('--prova');
const FILE_REV = 'modelli/ginocchio-3d.html';

// spostamento del fascio (dx, dy, dz in cm) a quote chiave, raccordato tra una quota e l'altra (smoothstep); nullo
// fuori da [-9,6, -5,4]. In avanti sotto l'arcata e lateralmente sotto di essa (il fascio passa lateralmente al capo
// tibiale del soleo). Solo dietro al piano z ZONA_Z (i rami che vanno in avanti, come la ricorrente tibiale
// anteriore, restano dove sono)
const SPOSTA = [[-9.6, [0, 0, 0]], [-8.6, [-0.35, 0, 0.1]], [-7.6, [-0.5, 0, 0.4]], [-6.9, [-0.2, 0, 0.3]], [-5.6, [0, 0, 0]]];
const ZONA_Z = [-1.9, -1.3];
const FASCIO = ['apop', 'vpop', 'ntib', 'atpost', 'vtpost', 'atant', 'aper', 'aric'];
const GAP = 0.1, ARROT = 0.2, UNIONE = 0.3, HN = 0.06; // canale nel soleo: distanza dal tubo, raccordo col soleo e tra i canali dei tubi, passo della griglia (cm)
const CANALE_Y = [-9.6, -9.0, -5.4, -4.9];       // quote del canale (raccordo in basso e in alto)
const BOX = [[-2.6, -9.9, -4.9], [1.3, -4.75, -0.4]]; // zona del soleo ricostruita
let BASE = null;                                  // soleo prima dello scavo (posizioni, indici, tag, fibre)
const RACC = 6;                                   // anelli della superficie nuova levigati verso il bordo
const RV = 0.13, R0V = 0.15;                    // vena tibiale anteriore: raggio e raggio all'origine
const OSTACOLI = ['tibia', 'perone', 'pop', 'sol', 'tibpost', 'fdl', 'fhl', 'plant', 'gmed', 'glat', 'tibant', 'extdig', 'ehl', 'perlong', 'perbrev'];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(...a), nrm = a => { const l = len(a) || 1; return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const r2 = q => q.map(v => +v.toFixed(2));
function puntoTri(p, a, b, c) { // punto del triangolo più vicino a p (Ericson, Real-Time Collision Detection 5.1.5)
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, ab, d1 / (d1 - d3));
  const pc = sub(p, c), d5 = dot(ab, pc), d6 = dot(ac, pc); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const dn = 1 / (va + vb + vc); return add(a, add(ab.map(v => v * vb * dn), ac, vc * dn));
}

/* ---------- tubi della pagina (testo completo della chiamata, opzioni comprese) ---------- */
const RE_TUBE = /tube\((\[\[.*?\]\]),([\d.]+)(?:,(\{[^}]*\}))?\)/g;
function blocco(html, id) { const a = html.indexOf(`{id:'${id}'`); if (a < 0) return null; const b = html.indexOf('\n {id:', a + 5); return [a, b]; }
function tubiDi(html, id) {
  const [a, b] = blocco(html, id), src = html.slice(a, b);
  return [...src.matchAll(RE_TUBE)].map(m => ({ p: JSON.parse(m[1]), r: +m[2], o: m[3] || '', txt: m[0] }));
}
const tubeTxt = (p, r, o) => `tube(${JSON.stringify(p.map(r2))},${r}${o ? ',' + o : ''})`;

/* ---------- verifiche ---------- */
// compenetrazioni dei tubi del fascio (tra y -4,5 e -10,6; la vena tibiale anteriore per intero) con ossa e muscoli, e
// della vena tibiale anteriore con gli altri tubi (esclusi i primi 1,3 cm, dentro la poplitea)
function ricampiona(P, passo) { const out = [P[0]]; let resto = 0;
  for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], L = len(sub(b, a)); let t = passo - resto; while (t <= L) { out.push(add(a, sub(b, a), t / L)); t += passo; } resto = L - (t - passo); }
  if (len(sub(P[P.length - 1], out[out.length - 1])) > passo * 0.3) out.push(P[P.length - 1]); return out; }
const campoSD = Mk => { const Do = edt(Mk), Di = edt(Mk, true); return q => sample(Do, ...q) - sample(Di, ...q); };
function verifica(html) {
  setGriglia([-5, -20.6, -6], 0.05, 140, 330, 180);
  const nomi = [...OSTACOLI], campi = nomi.map(n => campoSD(solid(n)));
  const tutti = [...FASCIO, 'vtant'].filter(id => blocco(html, id)).map(id => [id, tubiDi(html, id)]);
  for (const [id, ts] of tutti) for (const t of ts) { const Q = ricampiona(t.p, 0.05); const peggio = {};
    for (const q of Q) { if (q[1] > -4.5 || (q[1] < -10.6 && id !== 'vtant')) continue; nomi.forEach((n, i) => { const d = t.r - campi[i](q); if (d > 0.02 && d > (peggio[n]?.[0] ?? 0)) peggio[n] = [d, q]; }); }
    const s = Object.entries(peggio).map(([n, [d, q]]) => `${n} ${(d * 10).toFixed(1)} mm a y ${q[1].toFixed(1)}`).join(', ');
    log(`${id}: ${s || 'nessuna compenetrazione'}`); }
  if (!blocco(html, 'vtant')) return;
  const vt = ricampiona(tubiDi(html, 'vtant')[0].p, 0.05).slice(26), peggio = {};
  for (const m of html.matchAll(/\{id:'([a-zA-Z]+)',nw:1,cat:'(art|ven|ner)'/g)) { if (m[1] === 'vtant' || m[1] === 'atant') continue;
    for (const t of tubiDi(html, m[1])) { const Q = ricampiona(t.p, 0.05); for (const q of vt) for (const w of Q) { const d = RV + t.r - len(sub(q, w)); if (d > 0.01 && d > (peggio[m[1]]?.[0] ?? 0)) peggio[m[1]] = [d, q]; } } }
  log('vtant / altri tubi:', Object.entries(peggio).map(([n, [d, q]]) => `${n} ${(d * 10).toFixed(1)} mm a y ${q[1].toFixed(1)}`).join(', ') || 'nessuna compenetrazione');
}
if (process.argv.includes('verifica')) { verifica(M.html); process.exit(0); }

const root = new URL('..', import.meta.url).pathname;
const H0 = execFileSync('git', ['show', `${PARTENZA}:${FILE_REV}`], { cwd: root, maxBuffer: 1 << 30 }).toString('utf8');
// ripristino: tubi del fascio dalla revisione di partenza, vena tibiale anteriore tolta se già aggiunta
for (const id of FASCIO) { const a = tubiDi(M.html, id), b = tubiDi(H0, id); a.forEach((T, k) => { M.html = M.html.replace(T.txt, b[k].txt); }); }
{ const bl = blocco(M.html, 'vtant'); if (bl) M.html = M.html.slice(0, bl[0] - 1) + M.html.slice(bl[1]); }
const T = Object.fromEntries(FASCIO.map(id => [id, tubiDi(M.html, id)]));

/* ---------- 1. fascio in avanti ---------- */
const spostamento = q => { const y = q[1], wz = 1 - sstep(ZONA_Z[0], ZONA_Z[1], q[2]); if (y <= SPOSTA[0][0] || y >= SPOSTA[SPOSTA.length - 1][0]) return [0, 0, 0];
  const k = SPOSTA.findIndex(([yk]) => yk > y), [ya, a] = SPOSTA[k - 1], [yb, b] = SPOSTA[k], s = sstep(ya, yb, y); return a.map((v, c) => (v + (b[c] - v) * s) * wz); };
for (const id of FASCIO) for (const t of T[id]) t.p = t.p.map(q => add(q, spostamento(q)));
log('fascio spostato fino a', (Math.max(...SPOSTA.map(([, d]) => len(d))) * 10).toFixed(1), 'mm');

/* ---------- 2. soleo: ripristino e scavo della faccia profonda ---------- */
{
  const R0 = realDaRevisione(PARTENZA, 'sol', FILE_REV), cur = Float32Array.from(R0.pos), A = posDaRevisione(ORDINE, 'sol', FILE_REV), P = posDaRevisione(PRESCAVO, 'sol', FILE_REV);
  // i vertici sono stati riordinati dopo ORDINE: si ritrovano per posizione (solo sopra y = -13, dove ha agito lo scavo)
  let n = 0;
  for (let i = 0; i < cur.length; i += 3) { if (cur[i + 1] < -13) continue; let bd = 1e9, bj = -1;
    for (let j = 0; j < A.length; j += 3) { const d = (A[j] - cur[i]) ** 2 + (A[j + 1] - cur[i + 1]) ** 2 + (A[j + 2] - cur[i + 2]) ** 2; if (d < bd) { bd = d; bj = j; } }
    if (bd > 1e-5) throw new Error('soleo: vertice senza corrispondenza ' + i / 3);
    for (let k = 0; k < 3; k++) cur[i + k] = P[bj + k]; n++; }
  log(`soleo: ${n} vertici riportati a prima dello scavo`);
  BASE = { pos: cur, idx: Uint32Array.from(R0.idx), tag: R0.tag, fdir: R0.fdir }; // topologia della revisione di partenza (nel file può esserci già il soleo ricostruito)
  setMesh('sol', { pos: cur, idx: BASE.idx, tag: BASE.tag, fdir: BASE.fdir });
}
// canale: per ogni tratto del fascio, il tubo (raggio + GAP) prolungato in avanti (+z) fino al piano osseo: davanti al
// fascio non resta soleo, dietro resta l'arcata. Distanza con segno approssimata (positiva fuori dal canale); alle due
// estremità in altezza il canale si chiude con un raccordo
function segmentiCanale(extra) { const S = [];
  for (const t of [...FASCIO.flatMap(id => T[id]), ...extra]) for (let k = 1; k < t.p.length; k++) { const a = t.p[k - 1], b = t.p[k];
    if (Math.max(a[1], b[1]) < CANALE_Y[0] || Math.min(a[1], b[1]) > CANALE_Y[3]) continue; S.push([a, b, t.r + GAP]); }
  return S; }
function distCanale(S, q) { let best = Infinity;
  for (const [a, b, c] of S) { const ab = sub(b, a), t = clamp(dot(sub(q, a), ab) / (dot(ab, ab) || 1), 0, 1), p = add(a, ab, t), v = sub(q, p);
    const w = sstep(CANALE_Y[0], CANALE_Y[1], p[1]) * (1 - sstep(CANALE_Y[2], CANALE_Y[3], p[1])), ce = c * w - 0.4 * (1 - w);
    const d = (v[2] > 0 ? Math.hypot(v[0], v[1]) : len(v)) - ce; best = best === Infinity ? d : sminK(best, d, UNIONE); }
  return best; }
const sminK = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); }; // minimo raccordato (canali dei vari tubi fusi)
// la zona BOX del soleo (attorno all'arcata) viene ricostruita come superficie implicita: soleo meno canale, con
// raccordo di raggio ARROT tra le due superfici (surface nets + Taubin, passo HN); fuori da BOX la mesh resta quella
// originale e le due parti si ricuciono con una striscia di triangoli lungo il bordo
function arcata(extra = []) {
  const S = segmentiCanale(extra);
  setMesh('sol', { pos: BASE.pos, idx: BASE.idx, tag: BASE.tag, fdir: BASE.fdir });
  griglia(BOX[0], BOX[1], HN, 1.3); // margine ampio: il buco nella mesh originale arriva fino a un triangolo oltre BOX
  const { F } = sdf(solid('sol')); esatta(F, ['sol'], 0.12);
  const V = new Float32Array(N);
  for (let id = 0; id < N; id++) { const q = voxel(id), a = F[id], b = -distCanale(S, q); V[id] = (a + b + Math.sqrt((a - b) ** 2 + ARROT * ARROT)) / 2; }
  const net = nets(V, () => [0, 1, 0]);
  const dentro = (P, i, m = 0) => P[3 * i] > BOX[0][0] + m && P[3 * i] < BOX[1][0] - m && P[3 * i + 1] > BOX[0][1] + m && P[3 * i + 1] < BOX[1][1] - m && P[3 * i + 2] > BOX[0][2] + m && P[3 * i + 2] < BOX[1][2] - m;
  // parte originale: via i triangoli con un vertice nella zona; parte nuova: solo i triangoli tutti nella zona
  const nvB = BASE.pos.length / 3, tB = [], tN = [];
  for (let t = 0; t < BASE.idx.length; t += 3) if (![0, 1, 2].some(r => dentro(BASE.pos, BASE.idx[t + r]))) tB.push(BASE.idx[t], BASE.idx[t + 1], BASE.idx[t + 2]);
  // della superficie nuova si tengono i triangoli che cadono nel buco: il triangolo originale più vicino al baricentro
  // è uno di quelli tolti (così i due bordi corrono vicini e la cucitura è corta)
  const tolto = new Uint8Array(BASE.idx.length / 3); for (let t = 0; t < BASE.idx.length; t += 3) tolto[t / 3] = [0, 1, 2].some(r => dentro(BASE.pos, BASE.idx[t + r])) ? 1 : 0;
  const CEL = 0.5, celle = new Map(), ck = (x, y, z) => x + ',' + y + ',' + z, Q = i => [BASE.pos[3 * i], BASE.pos[3 * i + 1], BASE.pos[3 * i + 2]];
  for (let t = 0; t < BASE.idx.length; t += 3) { const v = [0, 1, 2].map(r => Q(BASE.idx[t + r])), lo = [0, 1, 2].map(k => Math.floor(Math.min(...v.map(p => p[k])) / CEL)), hi = [0, 1, 2].map(k => Math.floor(Math.max(...v.map(p => p[k])) / CEL));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = ck(x, y, z); (celle.get(k) || celle.set(k, []).get(k)).push(t / 3); } }
  const nTri = t => nrm(cross(sub(Q(BASE.idx[3 * t + 1]), Q(BASE.idx[3 * t])), sub(Q(BASE.idx[3 * t + 2]), Q(BASE.idx[3 * t]))));
  const vicinoTri = (p, n) => { const c = p.map(v => Math.floor(v / CEL)); let bd = Infinity, bt = -1; // solo facce con la stessa giacitura (niente lato opposto delle parti sottili)
    for (let r = 0; r < 4 && (bt < 0 || bd > (r - 1) * CEL); r++) for (let x = c[0] - r; x <= c[0] + r; x++) for (let y = c[1] - r; y <= c[1] + r; y++) for (let z = c[2] - r; z <= c[2] + r; z++) {
      if (Math.max(Math.abs(x - c[0]), Math.abs(y - c[1]), Math.abs(z - c[2])) !== r) continue;
      for (const t of celle.get(ck(x, y, z)) || []) { if (dot(nTri(t), n) < 0.2) continue; const d = len(sub(p, puntoTri(p, Q(BASE.idx[3 * t]), Q(BASE.idx[3 * t + 1]), Q(BASE.idx[3 * t + 2])))); if (d < bd) { bd = d; bt = t; } } }
    return bt; };
  const nT = net.idx.length / 3, sel = new Uint8Array(nT), NP = i => [net.pos[3 * i], net.pos[3 * i + 1], net.pos[3 * i + 2]];
  for (let t = 0; t < nT; t++) { const [a, b, c] = [0, 1, 2].map(r => NP(net.idx[3 * t + r])), g = [0, 1, 2].map(k => (a[k] + b[k] + c[k]) / 3), bt = vicinoTri(g, nrm(cross(sub(b, a), sub(c, a))));
    sel[t] = bt >= 0 && tolto[bt] ? 1 : 0; }
  // selezione regolarizzata (maggioranza tra i triangoli adiacenti) e solo la componente connessa più grande
  const adj = Array.from({ length: nT }, () => []), e2t = new Map(); for (let t = 0; t < nT; t++) for (let r = 0; r < 3; r++) { const a = net.idx[3 * t + r], b = net.idx[3 * t + (r + 1) % 3], k = a < b ? a + '_' + b : b + '_' + a;
    if (e2t.has(k)) { const u = e2t.get(k); adj[t].push(u); adj[u].push(t); } else e2t.set(k, t); }
  for (let it = 0; it < 6; it++) { const S0 = sel.slice(); for (let t = 0; t < nT; t++) { const m = adj[t].reduce((s, u) => s + S0[u], 0); if (adj[t].length === 3) sel[t] = m >= 2 ? 1 : 0; } }
  const comp = new Int32Array(nT).fill(-1); let migliore = -1, dim = 0;
  for (let t0 = 0; t0 < nT; t0++) { if (!sel[t0] || comp[t0] >= 0) continue; const st = [t0]; comp[t0] = t0; let n = 0; while (st.length) { const t = st.pop(); n++; for (const u of adj[t]) if (sel[u] && comp[u] < 0) { comp[u] = t0; st.push(u); } } if (n > dim) { dim = n; migliore = t0; } }
  // piccoli buchi nella parte scelta (componenti non scelte, chiuse tutt'intorno da essa): riempiti
  const dentroP = new Uint8Array(nT); for (let t = 0; t < nT; t++) dentroP[t] = comp[t] === migliore ? 1 : 0;
  const vis = new Uint8Array(nT);
  for (let t0 = 0; t0 < nT; t0++) { if (dentroP[t0] || vis[t0]) continue; const st = [t0], cc = []; vis[t0] = 1; let chiuso = true;
    while (st.length) { const t = st.pop(); cc.push(t); if (adj[t].length < 3) chiuso = false; for (const u of adj[t]) { if (dentroP[u]) continue; if (!vis[u]) { vis[u] = 1; st.push(u); } } }
    if (chiuso && cc.length < 400) for (const t of cc) dentroP[t] = 1; }
  for (let t = 0; t < nT; t++) if (dentroP[t]) tN.push(net.idx[3 * t] + nvB, net.idx[3 * t + 1] + nvB, net.idx[3 * t + 2] + nvB);
  const pos = new Float32Array([...BASE.pos, ...net.pos]), P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  if (process.env.DEBUG) log('triangoli: originale', BASE.idx.length / 3, '→', tB.length / 3, ', nuovi', tN.length / 3, 'di', net.idx.length / 3);
  // bordi: lati che appartengono a un solo triangolo, nel verso del triangolo
  const anelli = I => { const succ = new Map(), cnt = new Map(), key = (a, b) => a < b ? a + '_' + b : b + '_' + a;
    for (let t = 0; t < I.length; t += 3) for (let r = 0; r < 3; r++) { const k = key(I[t + r], I[t + (r + 1) % 3]); cnt.set(k, (cnt.get(k) || 0) + 1); }
    for (let t = 0; t < I.length; t += 3) for (let r = 0; r < 3; r++) { const a = I[t + r], b = I[t + (r + 1) % 3]; if (cnt.get(key(a, b)) === 1) succ.set(a, b); }
    const out = [], visto = new Set();
    for (const s of succ.keys()) { if (visto.has(s)) continue; const L = []; let v = s; while (v !== undefined && !visto.has(v)) { visto.add(v); L.push(v); v = succ.get(v); } if (L.length > 2) out.push(L); }
    return out; };
  const AB = anelli(tB).filter(L => L.some(i => len(sub(P(i), [clamp(P(i)[0], BOX[0][0], BOX[1][0]), clamp(P(i)[1], BOX[0][1], BOX[1][1]), clamp(P(i)[2], BOX[0][2], BOX[1][2])])) < 1));
  const AN = anelli(tN);
  if (process.env.DEBUG) { const per = L => L.reduce((s, v, k) => s + len(sub(P(v), P(L[(k + 1) % L.length]))), 0); log('anelli originale', AB.map(L => L.length + ':' + per(L).toFixed(1)).join(' '), '| nuovi', AN.map(L => L.length + ':' + per(L).toFixed(1)).join(' ')); }
  const centro = L => L.reduce((s, i) => add(s, P(i), 1 / L.length), [0, 0, 0]);
  const cuci = [], bordoN = new Set();
  for (const A of AB) { // anello della parte nuova più vicino
    const cA = centro(A); let B = null, bd = Infinity; for (const L of AN) { const d = len(sub(centro(L), cA)); if (d < bd) { bd = d; B = L; } }
    if (!B) throw new Error('arcata: anello senza corrispondenza');
    // cucitura a cerniera: si avanza sull'anello con la diagonale più corta; si prova il verso dell'anello nuovo che dà la
    // striscia più corta, e i triangoli si orientano come le facce originali vicine
    const zip = Bs => { let j0 = 0, dj = Infinity; Bs.forEach((v, j) => { const d = len(sub(P(v), P(A[0]))); if (d < dj) { dj = d; j0 = j; } });
      const nA = A.length, nB = Bs.length, a = k => A[k % nA], b = k => Bs[(j0 + k) % nB], tri = [];
      // ascissa curvilinea normalizzata dei due anelli: si avanza su quello il cui prossimo vertice viene prima
      const asc = (n, f) => { const t = [0]; for (let k = 1; k <= n; k++) t.push(t[k - 1] + len(sub(P(f(k)), P(f(k - 1))))); return t.map(v => v / t[n]); };
      // ascissa dell'anello nuovo: quella del punto più vicino dell'anello originale (resa monotona), non la sua lunghezza
      // (il bordo della superficie nuova è a gradini)
      const tA = asc(nA, a), tBs = [0];
      for (let k = 1; k < nB; k++) { const q = P(b(k)); let bd = Infinity, bt = 0;
        for (let m = 0; m < nA; m++) { const p0 = P(a(m)), p1 = P(a(m + 1)), ab = sub(p1, p0), u = clamp(dot(sub(q, p0), ab) / (dot(ab, ab) || 1), 0, 1), d = len(sub(q, add(p0, ab, u))); if (d < bd) { bd = d; bt = tA[m] + (tA[m + 1] - tA[m]) * u; } }
        const prev = tBs[k - 1]; let t = bt; if (t < prev - 0.5) t += 1; tBs.push(clamp(Math.max(prev, t), 0, 1)); }
      tBs.push(1); let i = 0, j = 0, L = 0;
      while (i < nA || j < nB) {
        const avA = j >= nB || (i < nA && tA[i + 1] <= tBs[j + 1]);
        if (avA) { tri.push(a(i + 1), a(i), b(j)); i++; L += len(sub(P(a(i)), P(b(j)))); } else { tri.push(b(j), b(j + 1), a(i)); j++; L += len(sub(P(b(j)), P(a(i)))); } }
      return { tri, L: L / (nA + nB) }; };
    const z1 = zip(B.slice().reverse()), z2 = zip(B), z = z1.L <= z2.L ? z1 : z2;
    // verso: ogni triangolo della striscia come le facce originali che toccano i suoi vertici sull'anello
    const nf = (x, y, w) => cross(sub(P(y), P(x)), sub(P(w), P(x))), su = new Set(A), nA0 = new Map(); let girati = 0;
    for (let t = 0; t < tB.length; t += 3) { const n = nf(tB[t], tB[t + 1], tB[t + 2]); for (let r = 0; r < 3; r++) if (su.has(tB[t + r])) nA0.set(tB[t + r], add(nA0.get(tB[t + r]) || [0, 0, 0], n)); }
    for (let t = 0; t < z.tri.length; t += 3) { let ref = [0, 0, 0]; for (let r = 0; r < 3; r++) if (nA0.has(z.tri[t + r])) ref = add(ref, nA0.get(z.tri[t + r]));
      if (dot(ref, nf(z.tri[t], z.tri[t + 1], z.tri[t + 2])) < 0) { const x = z.tri[t + 1]; z.tri[t + 1] = z.tri[t + 2]; z.tri[t + 2] = x; girati++; } }
    if (process.env.DEBUG) log('striscia', (z1.L).toFixed(2), (z2.L).toFixed(2), 'cm, triangoli girati', girati, 'su', z.tri.length / 3);
    cuci.push(...z.tri); const nA = A.length, nB = B.length;
    // il bordo della superficie nuova si posa sul bordo dell'originale (la striscia diventa un filo, senza gradino)
    for (const v of B) { const q = P(v); let bd = Infinity, bp = q;
      for (let m = 0; m < nA; m++) { const p0 = P(A[m]), p1 = P(A[(m + 1) % nA]), ab = sub(p1, p0), u = clamp(dot(sub(q, p0), ab) / (dot(ab, ab) || 1), 0, 1), w = add(p0, ab, u), d = len(sub(q, w)); if (d < bd) { bd = d; bp = w; } }
      for (let k = 0; k < 3; k++) pos[3 * v + k] = bp[k]; bordoN.add(v); }
    log(`arcata: cucitura di ${nA} + ${nB} vertici di bordo (distanza dei centri ${(bd * 10).toFixed(1)} mm)`);
  }
  if (AB.length !== AN.length) log(`attenzione: anelli di bordo ${AB.length} (originale) e ${AN.length} (nuova)`);
  // raccordo: i vertici nuovi entro RACC anelli dal bordo si levigano (bordo fermo), così la superficie nuova arriva
  // all'originale senza piega
  { const nb = new Map(), add1 = (a, b) => (nb.get(a) || nb.set(a, new Set()).get(a)).add(b);
    for (let t = 0; t < tN.length; t += 3) for (let r = 0; r < 3; r++) { add1(tN[t + r], tN[t + (r + 1) % 3]); add1(tN[t + (r + 1) % 3], tN[t + r]); }
    let fronte = [...bordoN], dist = new Map(fronte.map(v => [v, 0]));
    for (let r = 1; r <= RACC; r++) { const nf = []; for (const v of fronte) for (const u of nb.get(v) || []) if (!dist.has(u)) { dist.set(u, r); nf.push(u); } fronte = nf; }
    const mobili = [...dist].filter(([, r]) => r > 0).map(([v]) => v);
    for (let it = 0; it < 30; it++) { const Q0 = pos.slice(); for (const v of mobili) { const L = [...nb.get(v)], w = 0.5 * (1 - dist.get(v) / (RACC + 1)) + 0.1, m = [0, 0, 0];
      for (const u of L) for (let k = 0; k < 3; k++) m[k] += Q0[3 * u + k] / L.length; for (let k = 0; k < 3; k++) pos[3 * v + k] = Q0[3 * v + k] + w * (m[k] - Q0[3 * v + k]); } } }
  // vertici usati, tag e direzione delle fibre (per i nuovi: media pesata dei 4 vertici originali più vicini)
  const I = [...tB, ...tN, ...cuci], usa = new Int32Array(pos.length / 3).fill(-1); let n = 0; for (const v of I) if (usa[v] < 0) usa[v] = n++;
  const np = new Float32Array(3 * n), tag = new Uint8Array(n), fdir = new Int8Array(3 * n);
  for (let v = 0; v < usa.length; v++) { const u = usa[v]; if (u < 0) continue; for (let k = 0; k < 3; k++) np[3 * u + k] = pos[3 * v + k];
    if (v < nvB) { tag[u] = BASE.tag[v]; for (let k = 0; k < 3; k++) fdir[3 * u + k] = BASE.fdir[3 * v + k]; continue; }
    const q = P(v), vic = []; for (let w = 0; w < nvB; w++) { const d = len(sub(q, P(w))); if (vic.length < 4 || d < vic[3][0]) { vic.push([d, w]); vic.sort((x, y) => x[0] - y[0]); if (vic.length > 4) vic.pop(); } }
    let tw = 0, tg = 0; const fd = [0, 0, 0]; const s0 = BASE.fdir.slice(3 * vic[0][1], 3 * vic[0][1] + 3);
    for (const [d, w] of vic) { const p = 1 / (d + 0.02); tw += p; tg += p * BASE.tag[w]; const f = BASE.fdir.slice(3 * w, 3 * w + 3), sg = f[0] * s0[0] + f[1] * s0[1] + f[2] * s0[2] < 0 ? -1 : 1; for (let k = 0; k < 3; k++) fd[k] += p * sg * f[k]; }
    tag[u] = Math.round(tg / tw); const fn = nrm(fd); for (let k = 0; k < 3; k++) fdir[3 * u + k] = Math.round(fn[k] * 127); }
  const idx = Uint32Array.from(I.map(v => usa[v]));
  setMesh('sol', { pos: np, idx, tag, fdir });
  log(`soleo: zona dell'arcata ricostruita, ${nvB} → ${n} vertici, ${idx.length / 3} triangoli`);
}

/* ---------- 3. confluenza delle vene e divisione dell'arteria ---------- */
// i rami nascono dentro l'ultimo tratto del tronco (due punti quasi sull'asse, appena spostati verso il lato d'uscita,
// poi il decorso del ramo); il tronco prosegue per ~1 cm dentro il ramo principale (tibiale posteriore) assottigliandosi
// (r1/l1): né la fine del tronco né l'inizio dei rami restano allo scoperto
const vpop = T.vpop[0], vtp = T.vtpost[0], at = T.atant[0], ap = T.apop[0], atp = T.atpost[0];
const fine = t => { const E = t.p[t.p.length - 1]; return [E, nrm(sub(E, t.p[t.p.length - 3]))]; };
const [E, TV] = fine(vpop), [EA, TA] = fine(ap);
function nasceDentro(P, dirUscita, e = E, tv = TV) {
  const lato = nrm(sub(dirUscita, tv.map(x => x * dot(dirUscita, tv))));
  const testa = [add(add(e, tv, -0.4), lato, 0.02), add(add(e, tv, -0.1), lato, 0.05)];
  return [...testa, ...P.filter(q => len(sub(q, e)) > 0.35)];
}
const uscita = (P, e) => sub(P.find(q => len(sub(q, e)) > 1) || P[3], e);
const prolunga = (tronco, ramo, e) => { tronco.p = [...tronco.p, ...ramo.p.filter(q => { const d = len(sub(q, e)); return d > 0.3 && d <= 1.1; })]; };
prolunga(vpop, vtp, E); prolunga(ap, atp, EA);
vtp.p = nasceDentro(vtp.p, uscita(vtp.p, E)); vtp.o = '{r0:0.17,l0:1.2}';
vpop.o = '{r1:0.13,l1:2.5}';
for (const t of [atp, at]) t.p = nasceDentro(t.p, uscita(t.p, EA), EA, TA);
ap.o = '{r1:0.12,l1:2.5}'; atp.o = '{r0:0.17,l0:1,r1:0.2,l1:3}'; at.o = '{r0:0.16,l0:1}'; // i rami nascono sottili dentro il tronco

/* ---------- griglia e ostacoli per la vena tibiale anteriore ---------- */
const tubiVox = (lista, margine) => { const OS = new Uint8Array(N);
  for (const t of lista) for (let k = 1; k < t.p.length; k++) { const a = t.p[k - 1], b = t.p[k], n = Math.ceil(len(sub(b, a)) / (H / 2));
    for (let s = 0; s <= n; s++) { const q = add(a, sub(b, a), s / n), r = t.r + margine, m = Math.ceil(r / H);
      const i0 = Math.round((q[0] - O[0]) / H), j0 = Math.round((q[1] - O[1]) / H), k0 = Math.round((q[2] - O[2]) / H);
      for (let i = i0 - m; i <= i0 + m; i++) for (let j = j0 - m; j <= j0 + m; j++) for (let kk = k0 - m; kk <= k0 + m; kk++) {
        if (i < 0 || j < 0 || kk < 0 || i >= NX || j >= NY || kk >= NZ) continue;
        if (Math.hypot(O[0] + (i + 0.5) * H - q[0], O[1] + (j + 0.5) * H - q[1], O[2] + (kk + 0.5) * H - q[2]) <= r) OS[i + NX * j + NXY * kk] = 1; } } }
  return OS; };
const ALTRI = () => { const out = []; for (const m of M.html.matchAll(/\{id:'([a-zA-Z]+)',nw:1,cat:'(art|ven|ner)'/g)) { const id = m[1]; if (id === 'atant' || id === 'vtant') continue;
  for (const t of (FASCIO.includes(id) ? T[id] : tubiDi(M.html, id))) out.push(t); } return out; };

arcata();
setGriglia([-5, -20.6, -6], 0.05, 140, 330, 180); // dopo arcata(), che usa una griglia sua
const MU = new Uint8Array(N); for (const n of OSTACOLI) or(MU, solid(n));
const SDm = campoSD(MU), SDt = campoSD(tubiVox(ALTRI(), 0));
const SD = q => Math.min(SDm(q), SDt(q));
const gradF = (f, q) => { const e = 0.05, g = [0, 1, 2].map(c => { const a = q.slice(), b = q.slice(); a[c] += e; b[c] -= e; return f(a) - f(b); }); return nrm(g); };

/* ---------- 4. vena tibiale anteriore ---------- */
let vtant;
{
  const A = ricampiona(at.p.filter(q => q[1] > -19.86), 0.25), K = 24, OFF = at.r + RV + 0.01;
  const ref = k => { const t = nrm(sub(A[Math.min(k + 1, A.length - 1)], A[Math.max(k - 1, 0)])), b0 = nrm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); return [t, b0, cross(t, b0)]; };
  const cand = (k, j) => { const [, b, c] = ref(k), a = 2 * Math.PI * j / K; return add(A[k], add(b.map(v => v * Math.cos(a)), c, Math.sin(a)), OFF); };
  // programmazione dinamica sul lato della vena (indice d'angolo): compenetrazione + cambio di lato (al più 2 indici,
  // 30°, per sezione: la vena gira attorno all'arteria senza attraversarla)
  const k0 = A.findIndex(q => len(sub(q, A[0])) > 1.2); // i primi 1,2 cm li fa la confluenza
  const nK = A.length, cost = [], from = [];
  for (let k = k0; k < nK; k++) { const c = [], f = [];
    for (let j = 0; j < K; j++) { const q = cand(k, j), pen = Math.max(0, RV + 0.03 - SD(q)) ** 2 * 2000; let best = Infinity, bj = -1;
      if (k === k0) best = 0; else for (let i = 0; i < K; i++) { const dj = Math.min(Math.abs(i - j), K - Math.abs(i - j)); if (dj > 2) continue; const v = cost[cost.length - 1][i] + 0.2 * dj * dj; if (v < best) { best = v; bj = i; } }
      c.push(best + pen); f.push(bj); }
    cost.push(c); from.push(f); }
  let j = cost[cost.length - 1].indexOf(Math.min(...cost[cost.length - 1])); const lati = [];
  for (let k = nK - 1; k >= k0; k--) { lati.unshift(j); j = from[k - k0][j]; }
  let P = lati.map((j, i) => cand(k0 + i, j));
  if (process.env.DEBUG) log('vtant DP', P.filter((q, i) => i % 6 === 0).map(q => q[1].toFixed(1) + ':' + (SD(q) * 10).toFixed(1) + '/' + (SDm(q) * 10).toFixed(1)).join(' '));
  // origine dentro la poplitea, verso il primo punto del decorso
  P = [...nasceDentro([], sub(P[0], E)), ...P];
  // levigatura e uscita dagli ostacoli (i primi due punti, dentro la poplitea, restano fermi)
  const fermi = 2;
  for (let it = 0; it < 120; it++) {
    const Q = P.map(q => q.slice());
    for (let k = fermi; k < P.length - 1; k++) for (let c = 0; c < 3; c++) P[k][c] = 0.5 * Q[k][c] + 0.25 * (Q[k - 1][c] + Q[k + 1][c]);
    for (let k = fermi; k < P.length; k++) { if (len(sub(P[k], E)) < 0.3) continue; const v = SD(P[k]); if (v < RV + 0.04) { const g = gradF(SD, P[k]); P[k] = add(P[k], g, Math.min(0.04, RV + 0.04 - v)); }
      // mai a contatto con l'arteria satellite (resta affiancata)
      let bd = Infinity, bq = null; for (let i = 1; i < at.p.length; i++) { const a = at.p[i - 1], b = at.p[i], ab = sub(b, a), t = clamp(dot(sub(P[k], a), ab) / dot(ab, ab), 0, 1), q = add(a, ab, t), d = len(sub(P[k], q)); if (d < bd) { bd = d; bq = q; } }
      if (bd < OFF - 0.01 && len(sub(P[k], E)) > 1) P[k] = add(bq, nrm(sub(P[k], bq)), OFF); }
  }
  if (process.env.DEBUG) log('vtant fine', P.filter((q, i) => i % 6 === 0).map(q => q[1].toFixed(1) + ':' + (SD(q) * 10).toFixed(1)).join(' '));
  // fine sul taglio della gamba, come gli altri tubi
  const last = P[P.length - 1]; P.push([last[0], -19.98, last[2]], [last[0], -20.1, last[2]]); P[P.length - 3][1] = -19.85;
  vtant = { p: P.filter((q, k) => k < 10 || k > P.length - 4 || k % 2 === 0), r: RV, o: `{r0:${R0V},l0:1}` };
  log(`vena tibiale anteriore: ${vtant.p.length} punti, lunghezza ${P.slice(1).reduce((s, q, k) => s + len(sub(q, P[k])), 0).toFixed(1)} cm`);
}
// il soleo si scava anche attorno alla nuova vena (dove passa sotto l'arcata)
arcata([vtant]);

/* ---------- scrittura ---------- */
for (const id of FASCIO) tubiDi(M.html, id).forEach((t, k) => { const n = T[id][k]; M.html = M.html.replace(t.txt, tubeTxt(n.p, n.r, n.o)); });
{ const [a, b] = blocco(M.html, 'vtpost'), riga = `\n {id:'vtant',nw:1,cat:'ven',name:'Vene tibiali anteriori',info:'Satelliti dell\\u2019arteria tibiale anteriore, sopra la membrana interossea (solitamente doppie, qui una sola); al margine inferiore del popliteo si uniscono alle tibiali posteriori e formano la vena poplitea.',\n  b:()=>[${tubeTxt(vtant.p, vtant.r, vtant.o)}]},`;
  M.html = M.html.slice(0, b) + riga + M.html.slice(b); }

verifica(M.html);
if (PROVA) process.exit(0);
saveFile(repack());
