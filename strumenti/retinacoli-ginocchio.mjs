/* Retinacoli rotulei del ginocchio (`retlat`, `retmed`) ricostruiti come "teli tesi" in modelli/ginocchio-3d.html.

   Uso (dalla cartella del progetto):
     node strumenti/retinacoli-ginocchio.mjs [laterale|mediale] [--prova]
     node strumenti/retinacoli-ginocchio.mjs verifica

   Anatomia (Fulkerson JP, Gossling HR, Clin Orthop 1980; Warren LF, Marshall JL, J Bone Joint Surg Am 1979;
   Merican AM, Amis AA, J Bone Joint Surg Br 2008): ai lati della rotula, tra il margine inferiore dei vasti, il tratto
   ileotibiale (lateralmente) o la zampa d'oca e il LCM (medialmente) e la tibia, l'osso è coperto da una lamina
   fibrosa continua sopra la capsula. Lateralmente nasce dall'aponeurosi del vasto laterale e dal margine anteriore
   del tratto ileotibiale e si inserisce sul margine laterale di rotula e tendine rotuleo e sulla tibia; medialmente
   nasce dall'aponeurosi del vasto mediale obliquo e dalla fascia, e passa sopra la capsula con l'MPFL che resta
   distinto (strato 2 di Warren e Marshall).

   Come funziona (per ogni lato, griglia di 0,4 mm):
     1. piano profondo = ossa, cartilagini, menischi, capsula (con il suo contenuto, per riempimento dall'esterno),
        vasto intermedio, tendini quadricipitale e rotuleo; chiusura morfologica di raggio CHIUSURA (ampia: il telo
        va teso dal margine della rotula al condilo, senza ripiegarsi nel sottosquadro tra rotula e femore);
     2. vasi: le arterie vicine al telo scendono verso il piano profondo reale senza entrarvi (ossa, capsula) e i
        tratti vicini entrano nel piano profondo, così dove non c'è spazio il telo le scavalca con un rilievo dolce;
        i rami sottocutanei (SOPRA) salgono sopra il telo con uno spostamento levigato lungo il tubo. Le coordinate
        dei tubi nella pagina vengono riscritte, ripartendo sempre da quelle della revisione ORIGINALE;
     3. telo = lamina di spessore SPESS (SPESS_BORDO al bordo) centrata a DIST dal piano profondo, dentro una
        finestra in coordinate cilindriche attorno all'asse del ginocchio: dal margine della rotula e del tendine
        rotuleo (misurato sulle mesh, con SORMONTO gradi sul margine) al margine anteriore del tratto ileotibiale o
        del sartorio (misurato, più `sotto` gradi di infilata), dalla tibia (`yBasso`) fino a `sopra` cm oltre il
        margine inferiore del vasto (misurato), angoli arrotondati (RACCORDO); il telo finisce dove entra in una
        struttura che gli sta sopra (`sopraLui`: vasti, tratto ileotibiale, sartorio, MPFL…), così i margini sono
        nascosti e l'MPFL resta una banda distinta;
     4. superficie media parametrica (griglia angolo × altezza, passi PASSO_T e PASSO_Y): per ogni nodo il punto più
        esterno del raggio dall'asse alla distanza DIST, triangoli tagliati esattamente sul contorno, contorno
        levigato, Taubin; due facce lungo la normale unite al bordo; fibre trasversali (orizzontali).
   Le mesh vengono sostituite (stesso nome, stessa scheda). Non usa i vecchi retinacoli e riparte dai tubi originali,
   quindi si può rilanciare (idempotente; con un solo lato i vasi ripartono invece dalle coordinate attuali).
   `verifica` elenca vertici dei retinacoli dentro altre strutture, distanza dalla cute e vasi o nervi che li toccano;
   durante il calcolo viene registrato il numero di pieghe (salti del raggio tra nodi vicini, atteso 0).
   Va lanciato dopo `capsula-ginocchio.mjs` (e rilanciato se cambiano capsula, rotula, tendini o vasti).

   Requisiti: Node 18 o successivo, nessuna dipendenza. */
import { execFileSync } from 'node:child_process';
import { M, REAL, man, setMesh, repack, saveFile, griglia, solid, unione, sdf, chiuso, edt, sfoca, sample, taubin, proietta, grad, N, NX, NY, NZ, NXY, O, H, vi, clamp, sstep, log } from './lib-modello.mjs';

const ASSE = [-0.3, 0];   // asse verticale del ginocchio (x, z): coordinate cilindriche per le finestre
const LATI = {
  laterale: { nome: 'retlat', segno: -1, vasto: 'vlat', dietro: ['itb'], sotto: 5, yBasso: -3.0, sopra: 0.7, xLim: [-7.4, 0.6],
    sopraLui: ['vlat', 'itb', 'lcl', 'all', 'biclong', 'bicbrev', 'retto'] },
  mediale: { nome: 'retmed', segno: 1, vasto: 'vmed', dietro: ['sart'], sotto: 4, yBasso: -2.8, sopra: 0.7, xLim: [-1.0, 6.6],
    sopraLui: ['vmed', 'sart', 'grac', 'semit', 'lcm', 'mpfl', 'retto'] },
};
// cm (angoli in gradi): distanza e spessore della lamina, tratto del bordo in cui si assottiglia, passi della griglia
const DIST = 0.13, SPESS = 0.12, SPESS_BORDO = 0.04, BORDO = 0.5, PASSO_T = 1.5, PASSO_Y = 0.12;
const CHIUSURA = 3.0, SORMONTO = 2.5, RACCORDO = 0.35, YMAX = 6.5, LISCIA_BORDO = 12;
const PEZZO_MIN = 0.1;   // pezzi del telo tenuti (frazione del più grande: l'MPFL divide il mediale)
const PROFONDO = ['femore', 'tibia', 'perone', 'rotula', 'menmed', 'menlat', 'vint', 'tenquad', 'tenrot', 'hoffa'];
const APERTE = ['cartfem', 'carttib', 'cartrot', 'capsula'];   // mesh aperte: solo superficie

const deg = Math.PI / 180, theta = (x, z, s) => s * Math.atan2(x - ASSE[0], z - ASSE[1]) / deg; // gradi, positivi verso il lato
const rho = (x, z) => Math.hypot(x - ASSE[0], z - ASSE[1]);
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

// tabella liscia: valori per fasce (passo p) → funzione interpolata, con media mobile e riempimento dei buchi
function tabella(m, p, liscia = 1) {
  const ks = [...m.keys()].sort((a, b) => a - b), k0 = ks[0], k1 = ks[ks.length - 1]; let v = [];
  for (let k = k0; k <= k1; k++) v.push(m.has(k) ? m.get(k) : null);
  for (let i = 0; i < v.length; i++) if (v[i] === null) { let a = i - 1, b = i + 1; while (v[b] === null) b++; v[i] = v[a] + (v[b] - v[a]) * (i - a) / (b - a); }
  for (let r = 0; r < liscia; r++) v = v.map((x, i) => (v[Math.max(0, i - 1)] + 2 * x + v[Math.min(v.length - 1, i + 1)]) / 4);
  return t => { const u = clamp(t / p - k0, 0, v.length - 1), i = Math.min(v.length - 2, Math.floor(u)); return v[i] + (v[i + 1] - v[i]) * (u - i); };
}
function bordi(L) {
  const s = L.segno, pat = new Map(), die = new Map(), vas = new Map();
  for (const n of ['rotula', 'tenrot', 'tenquad']) { const { pos, nv } = REAL(n); for (let i = 0; i < nv; i++) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2]; if (z < 1.5) continue; const k = Math.round(y * 2), t = theta(x, z, s);
    if (!pat.has(k) || t > pat.get(k)) pat.set(k, t); } }
  for (const n of L.dietro) { const { pos, nv } = REAL(n); for (let i = 0; i < nv; i++) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], t = theta(x, z, s); if (t < 10 || y > YMAX + 1 || y < L.yBasso - 1.5) continue; const k = Math.round(y * 2);
    if (!die.has(k) || t < die.get(k)) die.set(k, t); } }
  { const { pos, nv } = REAL(L.vasto); for (let i = 0; i < nv; i++) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], t = theta(x, z, s); if (t < 0) continue; const k = Math.round(t / 5);
    if (!vas.has(k) || y < vas.get(k)) vas.set(k, y); } }
  return { pat: tabella(pat, 0.5), die: tabella(die, 0.5, 2), vas: tabella(vas, 5, 2) };
}
// tubi della pagina (vasi): punti e raggio, letti dal sorgente
function tubi(id) {
  const a = M.html.indexOf(`{id:'${id}'`), b = M.html.indexOf('\n {id:', a + 5), src = M.html.slice(a, b);
  return [...src.matchAll(/tube\((\[\[.*?\]\]),([\d.]+)/g)].map(m => ({ p: JSON.parse(m[1]), r: +m[2], txt: m[1] }));
}
const ORIGINALE = '9deb601';  // revisione con i decorsi di vasi e nervi di partenza (prima di questo strumento, dopo aderenza-ginocchio.mjs)
const SOPRA = ['ninfra'];   // rami sottocutanei: passano sopra i retinacoli; arterie genicolari e il resto sotto
function ripristinaTubi() {
  const root = new URL('..', import.meta.url).pathname, h = execFileSync('git', ['show', `${ORIGINALE}:modelli/ginocchio-3d.html`], { cwd: root, maxBuffer: 1 << 30 }).toString('utf8');
  for (const id of VASI()) { const a = h.indexOf(`{id:'${id}'`), b = h.indexOf('\n {id:', a + 5), orig = [...h.slice(a, b).matchAll(/tube\((\[\[.*?\]\]),/g)].map(m => m[1]);
    tubi(id).forEach((T, k) => { if (orig[k] && orig[k] !== T.txt) M.html = M.html.replace(T.txt, orig[k]); }); }
}
const VASI = () => [...M.html.matchAll(/\{id:'([a-zA-Z]+)',nw:1,cat:'(art|ven|ner)'/g)].map(m => m[1]);
// vasi e nervi vicini al telo. Chi sta sotto (arterie genicolari) scende verso il piano profondo fin dove può senza
// entrare nel piano profondo reale (ossa, capsula); dove non c'è spazio è il telo a sollevarsi sopra il vaso (il tubo entra nel piano profondo e la
// chiusura ne fa un rilievo dolce). Chi sta sopra (rami sottocutanei, SOPRA) sale sopra la faccia superficiale.
// Spostamento lungo il gradiente del campo, esteso ai punti vicini del tubo; le coordinate nel sorgente vengono riscritte.
function scostaVasi(f, vicino, Dr, sopra, nome, evita) {
  const mossi = [];
  for (const id of VASI()) { if (SOPRA.includes(id) !== sopra) continue; tubi(id).forEach((T, k) => {
    const p = T.p.map(q => q.slice()), lim = T.r + SPESS / 2 + 0.15;
    if (!p.some(q => vicino(q, lim))) return;
    const bersaglio = sopra ? DIST + SPESS / 2 + T.r + 0.04 : DIST - SPESS / 2 - T.r - 0.02, fb = q => sample(Dr, q[0], q[1], q[2]);
    let mx = 0;
    for (let ciclo = 0; ciclo < 4; ciclo++) {   // nervi: spinta, poi levigatura dello spostamento lungo il tubo (niente ondulazioni)
    if (ciclo && !sopra) break;
    if (ciclo) { let D = p.map((q, i) => q.map((v, c) => v - T.p[i][c]));
      for (let r = 0; r < 4; r++) D = D.map((d, i) => d.map((v, c) => i === 0 || i === D.length - 1 ? v : 0.25 * D[i - 1][c] + 0.5 * v + 0.25 * D[i + 1][c]));
      p.forEach((q, i) => { for (let c = 0; c < 3; c++) q[c] = T.p[i][c] + D[i][c]; }); }
    for (let giro = 0; giro < 20; giro++) {
      const d = p.map(q => { if (!vicino(q, lim + 0.1)) return 0; const v = f(q); return sopra ? Math.max(0, bersaglio - v) : Math.min(0, bersaglio - v); });
      const dl = d.map((v, i) => { const a = d[i - 1] ?? v, c = d[i + 1] ?? v; return Math.abs(v) >= Math.abs(0.5 * (a + c)) ? v : 0.5 * (a + c); }); // allarga ai vicini
      let att = 0;
      p.forEach((q, i) => { if (!dl[i] || i === 0) return; const g = grad({ s: f }, q), l = Math.hypot(...g) || 1, o = q.slice();
        for (let c = 0; c < 3; c++) q[c] += g[c] / l * dl[i];
        if (!sopra && fb(q) < T.r + 0.06) { const u = Math.max(0, Math.min(1, (fb(o) - T.r - 0.06) / Math.max(1e-6, fb(o) - fb(q)))); for (let c = 0; c < 3; c++) q[c] = o[c] + (q[c] - o[c]) * u; } // mai nell'osso né nella capsula
        const m = Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]); if (m > 0.003) att++; });
      if (!att) break;
    } }
    // rami sopra il telo: lo spostamento (levigato) non li porta dentro le strutture superficiali (es. sartorio):
    // dove servirebbe, si accorcia fino al bordo della struttura
    if (evita) p.forEach((q, i) => { const o = T.p[i], at = u => sample(evita, ...o.map((v, c) => v + (q[c] - v) * u)), m = T.r + 0.02;
      if (at(1) >= m || at(0) < m) return; let a = 0, b = 1; for (let it = 0; it < 12; it++) { const u = (a + b) / 2; if (at(u) >= m) a = u; else b = u; }
      for (let c = 0; c < 3; c++) q[c] = o[c] + (q[c] - o[c]) * a; });
    p.forEach((q, i) => mx = Math.max(mx, Math.hypot(...q.map((v, c) => v - T.p[i][c]))));
    const txt = JSON.stringify(p.map(q => q.map(v => +v.toFixed(2))));
    if (txt !== T.txt) { M.html = M.html.replace(T.txt, txt); log(`${nome}: ${id}:${k} ${sopra ? 'sopra' : 'sotto'} il telo, spostato fino a ${(mx * 10).toFixed(1)} mm`); }
    const vic = p.map(q => vicino(q, lim + 0.3));   // solo i tratti vicini al telo entrano nel piano profondo
    mossi.push({ p, r: T.r, seg: p.map((_, i) => vic[i] || vic[i + 1] || vic[i - 1]) });
  }); }
  return mossi;
}
// piano profondo come campo di distanza dalla sua chiusura: tutto ciò che non è raggiungibile dall'esterno attraverso P
function campoProfondo(P) {
  const fuori = new Uint8Array(N), Q = new Int32Array(N); let qh = 0, qt = 0;
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++)
    if ((i === 0 || j === 0 || k === 0 || i === NX - 1 || j === NY - 1 || k === NZ - 1) && !P[vi(i, j, k)]) { const q = vi(i, j, k); fuori[q] = 1; Q[qt++] = q; }
  while (qh < qt) { const q = Q[qh++], i = q % NX, j = ((q / NX) | 0) % NY, k = (q / NXY) | 0;
    for (const [c, d, lim] of [[i, 1, 0], [i, -1, NX - 1], [j, NX, 0], [j, -NX, NY - 1], [k, NXY, 0], [k, -NXY, NZ - 1]]) {
      if (c === lim) continue; const r = q - d; if (!fuori[r] && !P[r]) { fuori[r] = 1; Q[qt++] = r; } } }
  const Dr = edt(fuori, true);   // distanza dal piano profondo reale (ossa, capsula…), per i vasi
  return { F: sfoca(chiuso(Dr, CHIUSURA), 2), Dr };
}
function tuboInVoxel(P, { p, r, seg }) {
  for (let q = 0; q + 1 < p.length; q++) if (seg[q] && seg[q + 1]) for (let u = 0; u <= 1; u += 0.05) { const c = p[q].map((v, j) => v + (p[q + 1][j] - v) * u), R = r + 0.02;
    for (let dz = -R; dz <= R; dz += H) for (let dy = -R; dy <= R; dy += H) for (let dx = -R; dx <= R; dx += H) { if (dx * dx + dy * dy + dz * dz > R * R) continue;
      const i = Math.floor((c[0] + dx - O[0]) / H), j = Math.floor((c[1] + dy - O[1]) / H), k = Math.floor((c[2] + dz - O[2]) / H);
      if (i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ) P[vi(i, j, k)] = 1; } }
}

function telo(L) {
  const s = L.segno, B = bordi(L);
  griglia([L.xLim[0], L.yBasso - 1.2, -2.6], [L.xLim[1], YMAX + 0.6, 6.4], 0.04, 0.1);
  log(L.nome, 'griglia', NX, NY, NZ);
  // finestra (cm, negativa dentro)
  const fin = (t, y, r) => {
    const a = (B.pat(y) - SORMONTO - t) * r * deg, b = (t - B.die(y) - L.sotto) * r * deg, c = y - Math.min(YMAX, B.vas(t) + L.sopra), d = L.yBasso - y;
    return smax(smax(a, b, RACCORDO), smax(c, d, RACCORDO), RACCORDO);
  };
  // 1. piano profondo: solidi + superfici aperte, poi chiusura; le arterie vicine scendono sotto il telo e diventano
  //    parte del piano profondo (dove non c'è spazio il telo le scavalca)
  const P = unione(PROFONDO); for (const n of APERTE) { const S = solid(n, true); for (let i = 0; i < N; i++) P[i] |= S[i]; }
  let { F, Dr } = campoProfondo(P), f = p => sample(F, p[0], p[1], p[2]); log('piano profondo');
  const vicino = (q, lim, w = 0.2) => fin(theta(q[0], q[2], s), q[1], rho(q[0], q[2])) < w && Math.abs(f(q) - DIST) < lim;
  const arterie = scostaVasi(f, vicino, Dr, false, L.nome);
  if (arterie.length) { for (const T of arterie) tuboInVoxel(P, T); ({ F } = campoProfondo(P)); }
  log('chiusura');
  // strutture che stanno sopra il telo: il telo finisce dove vi entra
  const { F: So } = sdf(unione(L.sopraLui)); sfoca(So, 1); log('strutture sopra');
  const so = p => sample(So, p[0], p[1], p[2]);
  // 3. superficie media su una griglia (angolo, y): per ogni nodo il punto più esterno del raggio dall'asse dove il
  //    campo vale DIST; valore di taglio g = finestra ∪ strutture sopra (negativo dove il telo c'è)
  const t0 = Math.min(...[-1, 0, 2, 4].map(B.pat)) - SORMONTO - 4, t1 = Math.max(...[-3, 0, 3, 6].map(B.die)) + L.sotto + 4;
  const nt = Math.ceil((t1 - t0) / PASSO_T) + 1, ny = Math.ceil((YMAX - L.yBasso + 1) / PASSO_Y) + 1;
  const nodo = new Array(nt * ny), g = new Float32Array(nt * ny).fill(1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nt; i++) {
    const t = t0 + i * PASSO_T, y = L.yBasso - 0.5 + j * PASSO_Y, al = s * t * deg, u = [Math.sin(al), 0, Math.cos(al)];
    const pt = r => [ASSE[0] + u[0] * r, y, ASSE[1] + u[2] * r];
    let r = 9; while (r > 0.5 && f(pt(r)) > DIST) r -= 0.05; if (r <= 0.5) continue;
    let lo = r, hi = r + 0.05; for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (f(pt(m)) > DIST) hi = m; else lo = m; }
    const p = pt((lo + hi) / 2); nodo[i + nt * j] = p;
    g[i + nt * j] = Math.max(fin(t, y, (lo + hi) / 2), -so(p) + SPESS / 2 + 0.02);
  }
  { let salti = 0; for (let j = 0; j < ny; j++) for (let i = 0; i + 1 < nt; i++) { const a = i + nt * j, b = a + 1;
      if (nodo[a] && nodo[b] && (g[a] < 0 || g[b] < 0) && Math.abs(rho(nodo[a][0], nodo[a][2]) - rho(nodo[b][0], nodo[b][2])) > 0.25) { salti++; if (process.env.DBG) console.log('salto', (t0 + i * PASSO_T).toFixed(1), (L.yBasso - 0.5 + j * PASSO_Y).toFixed(2), rho(nodo[a][0], nodo[a][2]).toFixed(2), rho(nodo[b][0], nodo[b][2]).toFixed(2), g[a].toFixed(2), g[b].toFixed(2)); } }
    log(L.nome, 'pieghe (salti del raggio > 2,5 mm tra nodi vicini):', salti); }
  // triangoli della griglia tagliati sul livello g = 0 (vertici interpolati sui lati)
  const Pm = [], Gv = [], I = [], key = new Map();
  const vtx = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (key.has(k)) return key.get(k);
    let p, gg; if (b < 0) { p = nodo[a]; gg = g[a]; } else { const t = g[a] / (g[a] - g[b]); p = nodo[a].map((v, q) => v + (nodo[b][q] - v) * t); gg = 0; }
    const id = Pm.length / 3; Pm.push(...p); Gv.push(gg); key.set(k, id); return id; };
  const tri = (a, b, c) => { const v = [a, b, c]; if (v.some(q => !nodo[q])) return; const np = v.filter(q => g[q] < 0).length; if (!np) return;
    if (np === 3) { I.push(vtx(a, -1), vtx(b, -1), vtx(c, -1)); return; }
    for (let r = 0; r < 3; r++) { const A = v[r], Bq = v[(r + 1) % 3], C = v[(r + 2) % 3];
      if (np === 1 && g[A] < 0) { I.push(vtx(A, -1), vtx(A, Bq), vtx(A, C)); return; }
      if (np === 2 && g[A] >= 0) { const ab = vtx(Bq, A), ac = vtx(C, A); I.push(ab, vtx(Bq, -1), vtx(C, -1), ab, vtx(C, -1), ac); return; } } };
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nt; i++) { const a = i + nt * j, b = a + 1, c = a + nt, d = c + 1; tri(a, b, d); tri(a, d, c); }
  const M = grande({ pos: Float32Array.from(Pm), idx: Uint32Array.from(I), fdir: new Int8Array(Pm.length), g: Float32Array.from(Gv) });
  // levigatura della superficie media e riproiezione sul livello DIST
  // contorno: media mobile lungo il bordo (toglie gli scalini del taglio sulla griglia)
  { const n0 = M.pos.length / 3, cnt = new Map(), ek = (a, b) => a < b ? a * n0 + b : b * n0 + a, vic = new Map();
    for (let t = 0; t < M.idx.length; t += 3) for (let r = 0; r < 3; r++) { const k = ek(M.idx[t + r], M.idx[t + (r + 1) % 3]); cnt.set(k, (cnt.get(k) || 0) + 1); }
    for (const [k, c] of cnt) if (c === 1) { const a = Math.floor(k / n0), b = k % n0; (vic.get(a) || vic.set(a, []).get(a)).push(b); (vic.get(b) || vic.set(b, []).get(b)).push(a); }
    for (let it = 0; it < LISCIA_BORDO; it++) { const P0 = M.pos.slice();
      for (const [i, L2] of vic) { if (L2.length !== 2) continue; const [a, b] = L2; for (let c = 0; c < 3; c++) M.pos[3 * i + c] = 0.5 * P0[3 * i + c] + 0.25 * (P0[3 * a + c] + P0[3 * b + c]); } } }
  let pos = taubin(M.pos, M.idx, 6); const nv = pos.length / 3;
  for (let i = 0; i < nv; i++) { const p = proietta(f, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], DIST, 4); pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2]; }
  // 4. due facce a ± spessore/2 lungo la normale del campo, unite lungo il bordo; spessore che cala verso il bordo
  const nb = Array.from({ length: nv }, () => []), lati = new Map(), ek = (a, b) => a < b ? a * nv + b : b * nv + a;
  for (let t = 0; t < M.idx.length; t += 3) for (let r = 0; r < 3; r++) { const a = M.idx[t + r], b = M.idx[t + (r + 1) % 3];
    const k = ek(a, b), e = lati.get(k); if (e) e.n++; else lati.set(k, { n: 1, a, b }); }
  // distanza dal bordo (lungo la mesh) per lo spessore
  const db = new Float32Array(nv).fill(9), adj = Array.from({ length: nv }, () => []);
  for (const { a, b, n } of lati.values()) { const l = Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]); adj[a].push([b, l]); adj[b].push([a, l]); if (n === 1) { db[a] = 0; db[b] = 0; } }
  for (let it = 0; it < 60; it++) { let ch = false; for (let i = 0; i < nv; i++) for (const [j, l] of adj[i]) if (db[j] + l < db[i] - 1e-6) { db[i] = db[j] + l; ch = true; } if (!ch) break; }
  const out = new Float32Array(nv * 6), fdir = new Int8Array(nv * 6);
  for (let i = 0; i < nv; i++) {
    const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]], gr = grad({ s: f }, p), l = Math.hypot(...gr) || 1, n = gr.map(v => v / l);
    const sp = SPESS_BORDO + (SPESS - SPESS_BORDO) * sstep(0, BORDO, db[i]);
    for (let k = 0; k < 3; k++) { out[3 * i + k] = p[k] + n[k] * sp / 2; out[3 * (nv + i) + k] = p[k] - n[k] * sp / 2; }
    const d = [p[2] - ASSE[1], 0, -(p[0] - ASSE[0])], dl = Math.hypot(...d) || 1;
    for (let k = 0; k < 3; k++) fdir[3 * i + k] = fdir[3 * (nv + i) + k] = Math.round(d[k] / dl * 127);
  }
  const idx = [];
  for (let t = 0; t < M.idx.length; t += 3) { const [a, b, c] = [M.idx[t], M.idx[t + 1], M.idx[t + 2]]; idx.push(a, b, c, nv + a, nv + c, nv + b); }
  for (const { a, b, n } of lati.values()) if (n === 1) idx.push(a, nv + a, nv + b, a, nv + b, b);
  // orientamento: la faccia esterna (prime nv) con la normale verso fuori; il bordo si orienta con il resto
  const nrmT = (t) => { const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(q => [out[3 * q], out[3 * q + 1], out[3 * q + 2]]);
    const u = [0, 1, 2].map(k => b[k] - a[k]), w = [0, 1, 2].map(k => c[k] - a[k]); return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };
  { const q = idx.slice(0, 3), c = [0, 1, 2].map(k => (out[3 * q[0] + k] + out[3 * q[1] + k] + out[3 * q[2] + k]) / 3), gr = grad({ s: f }, c), n = nrmT(0);
    if (n[0] * gr[0] + n[1] * gr[1] + n[2] * gr[2] < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; } }
  orienta(idx, nv * 2);
  log(L.nome, nv * 2, 'vertici,', idx.length / 3, 'triangoli');
  scostaVasi(f, (q, lim) => vicino(q, lim, 0.4), Dr, true, L.nome, So);   // i nervi sopra anche un po' oltre il bordo
  return { pos: out, idx: Uint32Array.from(idx), tag: null, fdir };
}
// orientamento coerente per propagazione dal primo triangolo di ogni pezzo
function orienta(I, nv) {
  const nt = I.length / 3, em = new Map(), done = new Uint8Array(nt), ek = (a, b) => a < b ? a * nv + b : b * nv + a;
  for (let t = 0; t < nt; t++) for (let r = 0; r < 3; r++) { const k = ek(I[3 * t + r], I[3 * t + (r + 1) % 3]); (em.get(k) || em.set(k, []).get(k)).push(t); }
  for (let s0 = 0; s0 < nt; s0++) { if (done[s0]) continue; done[s0] = 1; const Q = [s0];   // un seme per pezzo (le facce esterne vengono prima)
  while (Q.length) { const t = Q.pop();
    for (let r = 0; r < 3; r++) { const a = I[3 * t + r], b = I[3 * t + (r + 1) % 3];
      for (const u of em.get(ek(a, b))) { if (u === t || done[u]) continue; let same = false;
        for (let q = 0; q < 3; q++) if (I[3 * u + q] === a && I[3 * u + (q + 1) % 3] === b) same = true;
        if (same) { const x = I[3 * u + 1]; I[3 * u + 1] = I[3 * u + 2]; I[3 * u + 2] = x; } done[u] = 1; Q.push(u); } } } }
}
function grande(M) {
  const { pos, idx, fdir } = M, nv = pos.length / 3, par = new Int32Array(nv).map((_, i) => i), fd = a => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (let t = 0; t < idx.length; t += 3) { par[fd(idx[t])] = fd(idx[t + 1]); par[fd(idx[t + 1])] = fd(idx[t + 2]); }
  const cnt = new Map(); for (let t = 0; t < idx.length; t += 3) { const r = fd(idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const mx = Math.max(...cnt.values()), keep = new Set([...cnt.entries()].filter(([, c]) => c >= PEZZO_MIN * mx).map(([r]) => r)), map = new Int32Array(nv).fill(-1), P = [], D = [], I = [];
  for (let t = 0; t < idx.length; t += 3) if (keep.has(fd(idx[t]))) for (let r = 0; r < 3; r++) { const o = idx[t + r];
    if (map[o] < 0) { map[o] = P.length / 3; P.push(pos[3 * o], pos[3 * o + 1], pos[3 * o + 2]); D.push(fdir[3 * o], fdir[3 * o + 1], fdir[3 * o + 2]); } I.push(map[o]); }
  log('pezzi', [...cnt.values()].sort((a, b) => b - a).join('/'), '→ tenuti', keep.size, ',', P.length / 3, 'vertici');
  return { pos: new Float32Array(P), idx: Uint32Array.from(I), tag: null, fdir: Int8Array.from(D) };
}

function verifica() {
  const nomiTutti = [...new Set(man.meshes.map(m => m.n))];
  for (const L of Object.values(LATI)) {
    const { pos, nv } = REAL(L.nome); let lo = [9, 9, 9], hi = [-9, -9, -9];
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[3 * i + k]); hi[k] = Math.max(hi[k], pos[3 * i + k]); }
    griglia(lo, hi, 0.04, 1.2);
    const righe = [];
    for (const n of nomiTutti) { if (n === L.nome || ['cute', 'capsula', 'cartfem', 'carttib', 'cartrot'].includes(n)) continue;
      const { F } = sdf(solid(n)); let c = 0, mx = 0; for (let i = 0; i < nv; i++) { const d = -sample(F, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); if (d > 0.02) { c++; mx = Math.max(mx, d); } }
      if (c) righe.push(`${n}: ${c} vertici, max ${(mx * 10).toFixed(1)} mm`); }
    const { F: Fc } = sdf(solid('cute')); let mc = 9; for (let i = 0; i < nv; i++) mc = Math.min(mc, -sample(Fc, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]));
    const vasi = [];
    for (const id of VASI()) tubi(id).forEach((T, k) => {
      let mn = 9; for (let q = 0; q + 1 < T.p.length; q++) for (let u = 0; u < 1; u += 0.1) { const c = T.p[q].map((v, j) => v + (T.p[q + 1][j] - v) * u);
        for (let i = 0; i < nv; i += 3) mn = Math.min(mn, Math.hypot(pos[3 * i] - c[0], pos[3 * i + 1] - c[1], pos[3 * i + 2] - c[2]) - T.r); }
      if (mn < 0.02) vasi.push(`${id}:${k} ${(mn * 10).toFixed(1)} mm`); });
    console.log(`\n${L.nome} (${nv} vertici)\n  dentro altre strutture (>0,2 mm): ${righe.join(' · ') || 'nessuna'}\n  distanza minima dalla cute: ${(mc * 10).toFixed(1)} mm\n  vasi/nervi a meno di 0,2 mm: ${vasi.join(' · ') || 'nessuno'}`);
  }
}

const arg = process.argv.slice(2);
if (arg.includes('verifica')) verifica();
else {
  const quali = Object.keys(LATI).filter(k => arg.includes(k)); if (!quali.length) quali.push(...Object.keys(LATI));
  if (quali.length === Object.keys(LATI).length) ripristinaTubi(); else log('solo un lato: i vasi ripartono dalle coordinate attuali');
  for (const k of quali) { const M = telo(LATI[k]); setMesh(LATI[k].nome, M); }
  if (!arg.includes('--prova')) saveFile(repack());
}
