/* Ventri pieni del gran dorsale e del grande pettorale (modelli/spalla-3d.html): via le cavità interne viste nella vista assiale.

   Problema (segnalato il 2026-10-31 dalla vista assiale): nelle sezioni i ventri di `lat` (gran dorsale) e `pec_st` (grande pettorale, parte
   sternocostale) mostrano fessure e anelli vuoti dentro il muscolo.
     - `pec_st`: un guscio interno chiuso (616 triangoli, −4,1 cm³, y −6,2…−3,6 cm), residuo di BodyParts3D: nelle sezioni una fessura lunga fino a 6 cm.
     - `lat`: due gusci interni chiusi (−0,51 e −0,02 cm³) e un canale cieco (y −9,2…−7,6 cm, vicino al tendine) con l'imbocco sulla faccia
       superficiale a y ≈ −7,9; più piccoli fori vicino al piano di taglio y = −14 e a y ≈ −12,5. Sono residui del riempimento per parità di
       `margine-dorsale-spalla.mjs` (lamelle aggrovigliate della mesh di partenza), non canali di nervi o vasi: dentro non passa nessun tubo.

   Uso (dalla cartella del progetto):
     node strumenti/ventri-pieni-spalla.mjs              → scrive nel file del modello
     PROVA=1 node strumenti/ventri-pieni-spalla.mjs      → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/ventri-pieni-spalla.mjs   → lavora su una copia
   Ultimo della catena della spalla (dopo `ritocco-fascio-spalla.mjs`; nessuno script successivo tocca `lat` e `pec_st`). Riparte sempre dalle mesh
   di `lat` e `pec_st` della revisione `PARTENZA`, quindi si può rilanciare con lo stesso risultato. Se si rilancia uno script precedente che
   cambia `lat` (`margine-dorsale-spalla.mjs`) o `pec_st` (`sterno-pettorale-spalla.mjs`), aggiornare `PARTENZA` al commit del suo risultato.

   Metodo (i vertici che restano non si muovono: il profilo esterno è identico):
   1. Pareti delle cavità. Per ogni triangolo, il punto a `EPS` dal baricentro lungo la normale esterna si prova nella sezione assiale del muscolo
      alla sua quota (stesso calcolo della vista assiale, `assets/sezioni-assiali-worker.js`): se cade fuori dal muscolo ma dentro il suo contorno
      esterno (contenuto in un numero pari ≥ 2 di anelli) il triangolo è la parete di una cavità e si toglie. Via anche i pezzetti staccati che
      restano (componenti con volume sotto `PEZZO` cm³).
   2. Lembo. Ogni bordo rimasto (imbocco del canale) si chiude come in `margine-capsula-spalla.mjs`: triangolazione di area minima (Liepa 2003),
      raffinata con baricentri e scambi di diagonali fino alla lunghezza dei lati del bordo, poi membrana (vertici nuovi = media dei vicini,
      `MEMBRANA` passate, bordo fisso) e spinta fuori dalle strutture vicine (`VICINI`) fino a `GIOCO`. Tag, fibre e normali dei vertici nuovi
      dal vertice di bordo più vicino (normali: dal lembo).
   1b. Solo per `lat`: tasca cieca (rientranza a bocca stretta, y −8,3…−7,5 cm, `TASCA`): le pareti i cui raggi nel piano della sezione incontrano il muscolo
      entro `RAGGIO` in almeno `SOGLIA` delle `N_DIR` direzioni sono tolte; la bocca resta un bordo e si chiude con il lembo del passo 2 (la rientranza
      larga lungo il tendine, aperta verso fuori, resta com'è).
   Controlli stampati: triangoli tolti, bordi chiusi, volume prima/dopo, livelli della vista assiale con anelli vuoti (passo 0,25 mm) prima/dopo,
   lati aperti, volume comune con i vicini nella zona toccata prima/dopo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, repack, saveFile, log, realDaRevisione, nrmDaRevisione, setGriglia, solid } = G;
const { compatta } = await import('./lib-bp3d.mjs');
const W = await import('../assets/sezioni-assiali-worker.js');

// tasca cieca (lat): rientranza con la bocca stretta sulla faccia superficiale, vicino al tendine (y −8,3…−7,5): vista nella sezione sembra un foro
const TASCA = { lo: [-0.5, -8.4, -2.2], hi: [1.3, -7.45, -0.5], RAGGIO: 1.0, N_DIR: 32, SOGLIA: 0.8 };
const PROVA = !!process.env.PROVA, FILE_REPO = 'modelli/spalla-3d.html', PARTENZA = 'bf25a74';
const MUSCOLI = ['pec_st', 'lat'];
const EPS = 0.003, PEZZO = 0.05, MEMBRANA = 150, GIOCO = 0.01;                        // cm, cm³
const VICINI = { lat: ['tmaj', 'tri_lungo', 'coracobr', 'bic_breve', 'omero', 'scapola', 'a_asc', 'v_asc', 'n_radiale', 'n_ulnare', 'n_mediano'],
                 pec_st: ['pec_cl', 'pec_ab', 'pmin', 'coracobr', 'bic_breve', 'omero', 'corpo_sterno', 'manubrio'] };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = a => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const pt = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
const chiaveP = (P, i) => Math.round(P[3 * i] * 2e4) + ',' + Math.round(P[3 * i + 1] * 2e4) + ',' + Math.round(P[3 * i + 2] * 2e4);
const volume = (P, I) => { let v = 0; for (let t = 0; t < I.length; t += 3) { const a = pt(P, I[t]), b = pt(P, I[t + 1]), c = pt(P, I[t + 2]); v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; } return v; };
const riquadro = (P, I) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const i of I) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[3 * i + k]); hi[k] = Math.max(hi[k], P[3 * i + k]); } return { lo, hi }; };
// quanti anelli della sezione contengono q
const contiene = (q, loops) => { let n = 0; for (const poly of loops) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } if (c) n++; } return n; };
// livelli (passo 0,25 mm) in cui la sezione ha un anello dentro un altro (un vuoto nel muscolo)
function livelliVuoti(P, I) {
  const mesh = W.indicizza({ id: 'm', pos: P, idx: I }); let ylo = 1e9, yhi = -1e9; for (let i = 1; i < P.length; i += 3) { ylo = Math.min(ylo, P[i]); yhi = Math.max(yhi, P[i]); }
  const out = []; for (let y = Math.ceil(ylo * 40) / 40; y < yhi; y += 0.025) { const yy = +y.toFixed(3), s = W.sezione(mesh, yy);
    let area = 0; s.loops.forEach((p, i) => { if (contiene(p[0], s.loops.filter((q, j) => j !== i)) % 2 === 1) { let a = 0; for (let k = 0; k < p.length; k++) { const q = p[(k + 1) % p.length]; a += p[k][0] * q[1] - q[0] * p[k][1]; } area += Math.abs(a) / 2; } });
    if (area > 0) out.push([yy, area * 100]); }
  return out;
}
const riassunto = L => L.length ? `${L.length} livelli, y ${L[0][0]}…${L.at(-1)[0]} cm, vuoto massimo ${Math.max(...L.map(x => x[1])).toFixed(1)} mm²` : 'nessuno';
// volume comune (mm³) di due mesh nel riquadro B, griglia 0,2 mm
function comune(PA, IA, nomeB, B) {
  setGriglia(B.lo, 0.02, ...[0, 1, 2].map(k => Math.ceil((B.hi[k] - B.lo[k]) / 0.02)));
  const tmp = '__ventre'; setMesh(tmp, { pos: PA, idx: IA }); const A = solid(tmp), C = solid(nomeB); G.ripristina(tmp); G.man.meshes.splice(G.man.meshes.findIndex(m => m.n === tmp), 1);
  let n = 0; for (let i = 0; i < G.N; i++) if (A[i] && C[i]) n++; return n * 8e-3;
}

/* ---- 1. pareti delle cavità ---- */
// frazione delle direzioni nel piano della sezione in cui un raggio da q incontra il muscolo entro RAGGIO (q in una tasca quasi chiusa: vicino a 1)
function chiusura(q, loops) {
  let hit = 0;
  for (let d = 0; d < TASCA.N_DIR; d++) { const a = 2 * Math.PI * (d + 0.5) / TASCA.N_DIR, dx = Math.cos(a), dz = Math.sin(a); let tmin = 1e9;
    for (const poly of loops) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const A = poly[i], B = poly[j], ex = B[0] - A[0], ez = B[1] - A[1], den = dx * ez - dz * ex; if (!den) continue;
      const t = ((A[0] - q[0]) * ez - (A[1] - q[1]) * ex) / den, u = ((A[0] - q[0]) * dz - (A[1] - q[1]) * dx) / den; if (t > 1e-6 && u >= 0 && u <= 1 && t < tmin) tmin = t; }
    if (tmin <= TASCA.RAGGIO) hit++; }
  return hit / TASCA.N_DIR;
}
const inTasca = q => [0, 1, 2].every(k => q[k] >= TASCA.lo[k] && q[k] <= TASCA.hi[k]);
function pareti(P, I, tasca = false) {
  const mesh = W.indicizza({ id: 'm', pos: P, idx: I }), nt = I.length / 3, via = new Uint8Array(nt), cache = new Map();
  for (let t = 0; t < nt; t++) { const p = [0, 1, 2].map(e => pt(P, I[3 * t + e])), n = cross(sub(p[1], p[0]), sub(p[2], p[0])), l = len(n); if (!l) continue;
    const q = [0, 1, 2].map(k => (p[0][k] + p[1][k] + p[2][k]) / 3 + EPS * n[k] / l), y = Math.round(q[1] * 1000) / 1000;
    let s = cache.get(y); if (!s) { s = W.sezione(mesh, y); cache.set(y, s); }
    if (s.open.length) continue; const k = contiene([q[0], q[2]], s.loops); if (k >= 2 && k % 2 === 0) via[t] = 1;
    else if (tasca && k === 0 && inTasca(q) && chiusura([q[0], q[2]], s.loops) >= TASCA.SOGLIA) via[t] = 1; }
  return via;
}
// componenti (per posizione) e loro volume
function pezzi(P, I) {
  const nv = P.length / 3, K = new Map(), u = new Int32Array(nv); for (let i = 0; i < nv; i++) { const k = chiaveP(P, i); if (!K.has(k)) K.set(k, K.size); u[i] = K.get(k); }
  const par = Int32Array.from({ length: K.size }, (_, i) => i), f = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < I.length; t += 3) for (let e = 1; e < 3; e++) { const a = f(u[I[t]]), b = f(u[I[t + e]]); if (a !== b) par[a] = b; }
  const C = new Map(); for (let t = 0; t < I.length; t += 3) { const r = f(u[I[t]]); (C.get(r) || C.set(r, []).get(r)).push(t); }
  return [...C.values()].map(T => ({ T, v: volume(P, T.flatMap(t => [I[t], I[t + 1], I[t + 2]])) }));
}
// bordi (per posizione) come anelli di vertici, nel verso dei triangoli
function bordi(P, I) {
  const E = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], ka = chiaveP(P, a), kb = chiaveP(P, b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka; (E.get(k) || E.set(k, []).get(k)).push([a, b]); }
  const succ = new Map(); let pinze = 0; for (const L of E.values()) if (L.length === 1) { const [a, b] = L[0], k = chiaveP(P, a); if (succ.has(k)) pinze++; succ.set(k, [a, b]); }
  const loops = [], fatto = new Set();
  for (const [k0] of succ) { if (fatto.has(k0)) continue; const L = []; let k = k0, ok = true;
    while (!fatto.has(k)) { fatto.add(k); const e = succ.get(k); if (!e) { ok = false; break; } L.push(e[0]); k = chiaveP(P, e[1]); }
    if (ok && k === k0 && L.length >= 3) loops.push(L); else pinze++; }
  return { loops, pinze };
}

/* ---- 2. lembo su un anello (verso: quello dei triangoli vicini, quindi il lembo va nel verso opposto) ---- */
function lembo(Pf, L0) {
  const pv = i => [Pf[3 * i], Pf[3 * i + 1], Pf[3 * i + 2]], dd = (a, b) => len(sub(pv(a), pv(b)));
  const area = (a, b, c) => len(cross(sub(pv(b), pv(a)), sub(pv(c), pv(a)))) / 2;
  const chiave = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
  const R = L0.slice().reverse(), K = R.length;
  const w = Array.from({ length: K }, () => new Float64Array(K)), ch = Array.from({ length: K }, () => new Int32Array(K).fill(-1));
  for (let m = 2; m < K; m++) for (let i = 0; i + m < K; i++) { const j = i + m; let b = 1e18, bk = -1;
    for (let k = i + 1; k < j; k++) { const c = w[i][k] + w[k][j] + area(R[i], R[k], R[j]); if (c < b) { b = c; bk = k; } } w[i][j] = b; ch[i][j] = bk; }
  let tri = []; const pila = [[0, K - 1]];
  while (pila.length) { const [i, j] = pila.pop(); if (j - i < 2) continue; const k = ch[i][j]; tri.push([R[i], R[k], R[j]]); pila.push([i, k], [k, j]); }
  const bordoE = new Set(); for (let i = 0; i < K; i++) bordoE.add(chiave(R[i], R[(i + 1) % K]));
  const sig = new Map(); for (let i = 0; i < K; i++) sig.set(R[i], (dd(R[i], R[(i + 1) % K]) + dd(R[i], R[(i + K - 1) % K])) / 2);
  const nuovi = new Set();
  const flip = () => { for (let pass = 0; pass < 20; pass++) { let f = 0; const em = new Map();
      tri.forEach((T, ti) => { for (let q = 0; q < 3; q++) { const k = chiave(T[q], T[(q + 1) % 3]); if (bordoE.has(k)) continue; (em.get(k) || em.set(k, []).get(k)).push([ti, q]); } });
      const eSet = new Set(); for (const T of tri) for (let q = 0; q < 3; q++) eSet.add(chiave(T[q], T[(q + 1) % 3]));
      const toccati = new Set();
      for (const [, Lq] of em) { if (Lq.length !== 2) continue; const [[t1, q1], [t2, q2]] = Lq; if (toccati.has(t1) || toccati.has(t2)) continue;
        const T1 = tri[t1], T2 = tri[t2], a = T1[q1], b = T1[(q1 + 1) % 3], c = T1[(q1 + 2) % 3], d = T2[(q2 + 2) % 3];
        if (dd(c, d) >= dd(a, b) * 0.999 || eSet.has(chiave(c, d)) || bordoE.has(chiave(c, d))) continue;
        if (area(c, d, b) < 1e-8 || area(d, c, a) < 1e-8) continue;
        tri[t1] = [c, a, d]; tri[t2] = [d, b, c]; toccati.add(t1); toccati.add(t2); f++; }
      if (!f) break; } };
  flip();
  for (let giro = 0; giro < 40; giro++) { let sp = 0; const nt = [];
    for (const T of tri) { const [a, b, c] = T, cen = [0, 1, 2].map(k => (pv(a)[k] + pv(b)[k] + pv(c)[k]) / 3), sc = (sig.get(a) + sig.get(b) + sig.get(c)) / 3;
      if (![a, b, c].every(v => Math.SQRT2 * len(sub(cen, pv(v))) > sc && Math.SQRT2 * len(sub(cen, pv(v))) > sig.get(v))) { nt.push(T); continue; }
      const id = Pf.length / 3; Pf.push(...cen); sig.set(id, sc); nuovi.add(id); nt.push([a, b, id], [b, c, id], [c, a, id]); sp++; }
    tri = nt; if (!sp) break; flip(); }
  const nb = new Map(); for (const T of tri) for (let q = 0; q < 3; q++) { const a = T[q], b = T[(q + 1) % 3]; (nb.get(a) || nb.set(a, new Set()).get(a)).add(b); (nb.get(b) || nb.set(b, new Set()).get(b)).add(a); }
  const inn = [...nuovi];
  for (let g = 0; g < MEMBRANA; g++) for (const v of inn) { const Ls = [...nb.get(v)]; for (let k = 0; k < 3; k++) Pf[3 * v + k] += 0.5 * (Ls.reduce((s, x) => s + Pf[3 * x + k], 0) / Ls.length - Pf[3 * v + k]); }
  return { tri, nuovi };
}

/* ---- correzione ---- */
const ESITO = {};
for (const MU of MUSCOLI) {
  const R0 = realDaRevisione(PARTENZA, MU, FILE_REPO), N0 = nrmDaRevisione(PARTENZA, MU, FILE_REPO), nv0 = R0.pos.length / 3;
  const P0 = Float32Array.from(R0.pos), I0 = Array.from(R0.idx);
  const prima = livelliVuoti(P0, I0); log(MU + ': livelli con vuoti prima:', riassunto(prima));
  // 1. pareti e pezzetti staccati
  const via = pareti(P0, I0, MU === 'lat'); let I = []; for (let t = 0; t < I0.length / 3; t++) if (!via[t]) I.push(I0[3 * t], I0[3 * t + 1], I0[3 * t + 2]);
  const tolti = via.reduce((s, x) => s + x, 0); let staccati = 0;
  { const C = pezzi(P0, I), tieni = new Set(); for (const c of C) if (c.v >= PEZZO) for (const t of c.T) tieni.add(t); else staccati += c.T.length;
    I = I.filter((_, q) => tieni.has(q - q % 3)); }
  const zona = riquadro(P0, I0.filter((_, q) => via[(q / 3) | 0]));
  log(MU + ': pareti tolte', tolti, 'triangoli; pezzetti staccati tolti', staccati, 'triangoli; zona x', zona.lo[0].toFixed(1) + '…' + zona.hi[0].toFixed(1), 'y', zona.lo[1].toFixed(1) + '…' + zona.hi[1].toFixed(1), 'z', zona.lo[2].toFixed(1) + '…' + zona.hi[2].toFixed(1));
  // 2. lembi
  const Pf = Array.from(P0), { loops, pinze } = bordi(P0, I); const nuovi = new Set(), lembi = [];
  for (const L of loops) { const per = L.reduce((s, v, k) => s + len(sub(pt(P0, v), pt(P0, L[(k + 1) % L.length]))), 0); const r = lembo(Pf, L);
    for (const T of r.tri) I.push(...T); for (const v of r.nuovi) nuovi.add(v); lembi.push(`${L.length} v, ${(per * 10).toFixed(1)} mm`); }
  log(MU + ': bordi chiusi con un lembo', lembi.length ? lembi.join('; ') : 'nessuno', pinze ? '(pinze ' + pinze + ')' : '');
  // lembo fuori dai vicini
  if (nuovi.size) { const B = riquadro(Pf, [...nuovi]); G.griglia(B.lo, B.hi, 0.02, 0.15); const FV = G.campo(VICINI[MU]).F; let spinti = 0, dentro = 0;
    for (let giro = 0; giro < 8; giro++) for (const v of nuovi) { const p = pt(Pf, v), d = G.sample(FV, ...p); if (d >= GIOCO) continue; const g = G.grad(FV, p), l = len(g) || 1; for (let k = 0; k < 3; k++) Pf[3 * v + k] += g[k] / l * Math.min(GIOCO - d, 0.05); spinti++; }
    for (const v of nuovi) if (G.sample(FV, ...pt(Pf, v)) < 0) dentro++;
    log(MU + ': lembo', nuovi.size, 'vertici nuovi; correzioni dai vicini', spinti, '; ancora dentro un vicino', dentro); }
  // attributi dei vertici nuovi: dal vertice di bordo più vicino; normali del lembo dalle facce
  const at = G.attrs(MU) && { tag: R0.tag, fdir: R0.fdir }, nT = Pf.length / 3, base = [];
  for (const L of loops) base.push(...L);
  const vicino = p => { let best = base[0], bd = 1e9; for (const b of base) { const d = len(sub(p, pt(Pf, b))); if (d < bd) { bd = d; best = b; } } return best; };
  const tag = at.tag ? new Uint8Array(nT) : null, fdir = at.fdir ? new Int8Array(nT * 3) : null, nrm = N0 ? new Int8Array(nT * 3) : null;
  for (let i = 0; i < nT; i++) { const s = i < nv0 ? i : vicino(pt(Pf, i)); if (tag) tag[i] = at.tag[s]; if (fdir) for (let k = 0; k < 3; k++) fdir[3 * i + k] = at.fdir[3 * s + k]; if (nrm) for (let k = 0; k < 3; k++) nrm[3 * i + k] = N0[3 * s + k]; }
  if (nrm && nuovi.size) { const A = new Float64Array(nT * 3); for (let t = 0; t < I.length; t += 3) { const f = cross(sub(pt(Pf, I[t + 1]), pt(Pf, I[t])), sub(pt(Pf, I[t + 2]), pt(Pf, I[t]))); for (let e = 0; e < 3; e++) for (let k = 0; k < 3; k++) A[3 * I[t + e] + k] += f[k]; }
    for (const v of nuovi) { const l = Math.hypot(A[3 * v], A[3 * v + 1], A[3 * v + 2]) || 1; for (let k = 0; k < 3; k++) nrm[3 * v + k] = Math.round(A[3 * v + k] / l * 127); } }
  const extra = [tag, fdir, nrm].filter(Boolean), c = compatta(Float64Array.from(Pf), Uint32Array.from(I), extra);
  const P2 = Float32Array.from(c.pos), I2 = c.idx; let q = 0; const T2 = tag ? c.extra[q++] : null, D2 = fdir ? c.extra[q++] : null, N2 = nrm ? c.extra[q++] : null;
  // controlli
  const dopo = livelliVuoti(P2, I2); log(MU + ': livelli con vuoti dopo:', riassunto(dopo));
  const ap = bordi(P2, I2); log(MU + ': volume', volume(P0, I0).toFixed(3), '→', volume(P2, I2).toFixed(3), 'cm³ | triangoli', I0.length / 3, '→', I2.length / 3, '| bordi aperti dopo', ap.loops.length, ap.pinze ? 'pinze ' + ap.pinze : '');
  const Z = { lo: zona.lo.map(v => v - 0.1), hi: zona.hi.map(v => v + 0.1) }, cm = {};
  for (const n of VICINI[MU]) { const a = comune(P0, Uint32Array.from(I0), n, Z), b = comune(P2, I2, n, Z); if (a > 0.05 || b > 0.05) cm[n] = `${a.toFixed(1)}→${b.toFixed(1)}`; }
  log(MU + ': volume comune con i vicini nella zona (mm³)', JSON.stringify(cm));
  ESITO[MU] = { tolti, staccati, lembi: lembi.length, livelli_vuoti: [prima.length, dopo.length], comune: cm };
  setMesh(MU, { pos: P2, idx: I2, tag: T2, fdir: D2, ...(N2 ? { nrm: N2 } : {}) });
}
log('esito', JSON.stringify(ESITO));
if (!PROVA) saveFile(repack());
