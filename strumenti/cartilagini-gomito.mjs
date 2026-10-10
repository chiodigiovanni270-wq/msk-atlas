/* Cartilagini articolari del gomito (modelli/gomito-3d.html): le ricostruisce sulle ossa con bordi regolari
   e con l'estensione anatomica corretta.

   Uso (dalla cartella del progetto):
     node strumenti/cartilagini-gomito.mjs                  → riscrive cart_omero, cart_ulna, cart_radio nel file del modello
     node strumenti/cartilagini-gomito.mjs --prova=f.json   → non tocca il modello: scrive le mesh (con le ossa) in un JSON
     MODELLO=/tmp/copia.html node strumenti/cartilagini-gomito.mjs   → lavora su una copia

   Problema delle cartilagini originali (BodyParts3D): margine a dente di sega (artefatto della voxelizzazione),
   limiti artificiali, estensione non sempre coerente con l'anatomia. Qui si ripartisce dall'osso.

   1. Territorio di partenza: i vertici (suddivisi) della superficie ossea su cui poggiava la cartilagine originale
      (revisione ORIGINALE).
   2. Correzioni anatomiche sul territorio (funzioni `omero`, `ulna`, `radio`), basate sull'asse di flessione-estensione
      (calcolato qui: l'asse attorno a cui ruotando ulna e radio la distanza dall'omero dei punti articolari resta
      costante, "cerniera isometrica"; scarto medio ~0,4 mm, inclinazione ~11° nel piano frontale, coerente con l'angolo
      di carico) e sul contatto simulato in flessione (da −10° a 150°):
        - omero: il capitello (lateralmente al solco capitello-trocleare) è limitato alla faccia anteriore e inferiore:
          non oltre il margine distale-posteriore (`CAP_POST`); superficie posteriore del condilo laterale senza cartilagine
          (Gray, Anatomy of the Human Body, 1918: «limited to the front and lower part of the bone»). Troclea invariata.
        - ulna: la cartilagine originale restava 1–3 mm corta rispetto alla zona toccata dall'omero; si estende fino al
          bordo dell'incisura dove l'omero arriva in flessione (distanza < `TOCCO`) entro `ESTENDI` dal territorio originale.
          La zona nuda trasversale laterale (non toccata dall'omero) resta tale.
        - radio: fovea completa; sulla circonferenza un arco non articolare di 113° (`ARCO_NUDO`; Smith e Hotchkiss, J Shoulder
          Elbow Surg 2006; studio cadaverico su 24 gomiti: 113°, intervallo 106–120°) opposto alla incisura radiale
          dell'ulna (posizione di prono-supinazione del modello: neutra), con raccordo di `SFUMA` gradi.
   3. Il territorio (campo 0–1 sui vertici dell'osso) è levigato per diffusione e il margine è l'isolinea 0,5: curva liscia
      per costruzione. Lo spessore cresce da zero sul margine al valore pieno (`TMAX`, in cm) e si riduce dove le ossa
      affrontate sono più vicine (`GIOCO`), così le cartilagini non si compenetrano.
   4. Guscio chiuso: faccia esterna a spessore variabile, faccia interna `SOTTO` sotto la superficie ossea (le ossa nella
      pagina sono increspate di ±0,16 mm); sul margine le due facce si fondono sotto l'osso.

   Riparte sempre dalle cartilagini della revisione ORIGINALE e dalle ossa del file, quindi si può rilanciare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, repack, saveFile, realDaRevisione, log, sstep, clamp, setGriglia, solid, edt, sample, esatta } = G;

const ORIGINALE = '10893e7';                 // revisione con le cartilagini BodyParts3D originali
const FILE_REPO = 'modelli/gomito-3d.html';
const SOTTO = 0.02;                          // cm: la faccia interna sta sotto la superficie ossea
const RAGGIO_PATCH = 0.5;                    // cm: porzione di osso considerata attorno all'originale
const COP_PUNTO = 0.02;                      // cm: il punto sopra l'osso testato dentro la cartilagine originale
const RAMPA = 0.2;                           // il campo passa da 0,5 (margine) a 0,5+RAMPA: spessore da 0 al valore pieno
const GIOCO_MIN = 0.03;                      // cm: spessore minimo ammesso dove l'osso affrontato è vicinissimo
const GIOCO_RESTO = 0.03;                    // cm: spazio che resta tra due cartilagini affrontate
const RAFFINA = [[0.42, 0.70]];  // un giro per fascia del campo (da, a) in cui si raffina la mesh (0,65 → 0,33 → 0,16 mm attorno al margine visibile)
const DIFF_TESSUTO = 6;                      // passi di diffusione dello spessore (toglie le ondulazioni sul margine)

const TMAX = { cart_omero: 0.13, cart_ulna: 0.12, cart_radio: 0.13 };   // cm
const DIFF = { cart_omero: 40, cart_ulna: 40, cart_radio: 40 };         // passi di diffusione del campo del territorio
const CART = { cart_omero: 'omero', cart_ulna: 'ulna', cart_radio: 'radio' };
const ANGOLI = []; for (let a = -10; a <= 150; a += 5) ANGOLI.push(a * Math.PI / 180);   // flessione simulata
const CAP_POST = -140;                       // gradi dall'anteriore (0 = anteriore, −90 = distale, ±180 = posteriore): limite posteriore del capitello
const CAP_PROX = 100;                        // gradi: oltre questo valore (faccia posteriore-prossimale del condilo) il capitello non ha cartilagine
const S_CAP = [-1.3, -0.2];                  // cm lungo l'asse: i limiti valgono sul capitello (fino a −1,3) e scivolano via entro la troclea (−0,2)
const TOCCO = 0.4, ESTENDI = 0.25;           // ulna: distanza di contatto (cm) e massima estensione oltre il territorio originale
const ARCO_NUDO = 113, SFUMA = 12;           // radio: arco non articolare della circonferenza e raccordo (gradi)
const CIRC = [0.86, 0.96];                   // radio: tra queste frazioni del raggio locale la fovea passa alla circonferenza
const MARGINE_POSA = 0;                      // gradi: rotazione dell'arco nudo rispetto alla direzione opposta all'incisura radiale

/* ---------- vettori e mesh ---------- */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function normali(pos, idx) {
  const n = new Float64Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const f = cross([pos[3 * b] - pos[3 * a], pos[3 * b + 1] - pos[3 * a + 1], pos[3 * b + 2] - pos[3 * a + 2]], [pos[3 * c] - pos[3 * a], pos[3 * c + 1] - pos[3 * a + 1], pos[3 * c + 2] - pos[3 * a + 2]]);
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) n[3 * i + k] += f[k];
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
function vicini(nv, idx) {
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  return nb.map(s => [...s]);
}
/* porzione di osso entro `r` dai vertici di `riferimento`, suddivisa 1→4 (punti medi); normali lisce dall'osso intero */
function patchOsso(pos, idx, riferimento, r) {
  const nOsso = normali(pos, idx), cell = r, K = new Map(), key = (i, j, k) => i + ',' + j + ',' + k;
  for (let i = 0; i < riferimento.length; i += 3) { const q = [0, 1, 2].map(a => Math.floor(riferimento[i + a] / cell)), kk = key(...q); (K.get(kk) || K.set(kk, []).get(kk)).push(i); }
  const vicino = (x, y, z) => { const q = [x, y, z].map(v => Math.floor(v / cell));
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) for (const p of K.get(key(q[0] + i, q[1] + j, q[2] + k)) || [])
      if (Math.hypot(riferimento[p] - x, riferimento[p + 1] - y, riferimento[p + 2] - z) < r) return true; return false; };
  const sel = []; for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (vicino((pos[3 * a] + pos[3 * b] + pos[3 * c]) / 3, (pos[3 * a + 1] + pos[3 * b + 1] + pos[3 * c + 1]) / 3, (pos[3 * a + 2] + pos[3 * b + 2] + pos[3 * c + 2]) / 3)) sel.push(a, b, c); }
  const nuovo = new Map(), P = [], N = [], I = [], mid = new Map();
  const v = a => { let r = nuovo.get(a); if (r === undefined) { r = P.length / 3; nuovo.set(a, r); P.push(pos[3 * a], pos[3 * a + 1], pos[3 * a + 2]); N.push(nOsso[3 * a], nOsso[3 * a + 1], nOsso[3 * a + 2]); } return r; };
  const m = (a, b) => { const k = a < b ? a * 1e6 + b : b * 1e6 + a; let r = mid.get(k); if (r === undefined) { r = P.length / 3; mid.set(k, r);
    P.push((pos[3 * a] + pos[3 * b]) / 2, (pos[3 * a + 1] + pos[3 * b + 1]) / 2, (pos[3 * a + 2] + pos[3 * b + 2]) / 2);
    const nx = nOsso[3 * a] + nOsso[3 * b], ny = nOsso[3 * a + 1] + nOsso[3 * b + 1], nz = nOsso[3 * a + 2] + nOsso[3 * b + 2], l = Math.hypot(nx, ny, nz) || 1; N.push(nx / l, ny / l, nz / l); } return r; };
  for (let t = 0; t < sel.length; t += 3) { const a = sel[t], b = sel[t + 1], c = sel[t + 2], A = v(a), B = v(b), C = v(c), ab = m(a, b), bc = m(b, c), ca = m(c, a); I.push(A, ab, ca, ab, B, bc, ca, bc, C, ab, bc, ca); }
  return { pos: Float64Array.from(P), nor: Float64Array.from(N), idx: Uint32Array.from(I) };
}
/* il punto p è dentro la mesh chiusa (parità del raggio)? */
function dentro(p, pos, idx, dir = [0.3015, 0.5025, 0.8110]) {
  let n = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const h = cross(dir, e2), det = dot(e1, h); if (Math.abs(det) < 1e-14) continue;
    const f = 1 / det, s = [p[0] - pos[a], p[1] - pos[a + 1], p[2] - pos[a + 2]], u = f * dot(s, h); if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = f * dot(dir, q); if (v < 0 || u + v > 1) continue;
    if (f * dot(e2, q) > 1e-9) n++;
  }
  return n % 2 === 1;
}
const bbox = pos => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], pos[i]); hi[k] = Math.max(hi[k], pos[i]); } return [lo, hi]; };
const P3 = (S, i) => [S.pos[3 * i], S.pos[3 * i + 1], S.pos[3 * i + 2]];

/* ---------- campi di distanza delle ossa (griglia comune) ---------- */
const GRIGLIA = { o: [-5, -4.5, -5.5], h: 0.05, n: [180, 190, 220] };
function campoOsso(nome) { // distanza con segno (negativa dentro), esatta vicino alla superficie
  const M = solid(nome), Do = edt(M), Di = edt(M, true), F = new Float32Array(G.N), h2 = G.H / 2;
  for (let i = 0; i < G.N; i++) F[i] = M[i] ? -(Di[i] - h2) : Do[i] - h2;
  return esatta(F, [nome], 0.1);
}
function ruota(p, c, a, th) { // rotazione di p di th attorno all'asse (punto c, direzione a)
  const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], co = Math.cos(th), si = Math.sin(th), kv = dot(a, v), cr = cross(a, v);
  return [0, 1, 2].map(k => c[k] + v[k] * co + cr[k] * si + a[k] * kv * (1 - co));
}

/* ---------- asse di flessione: cerniera isometrica ---------- */
function nelderMead(f, x0, st, it = 300) {
  const n = x0.length; let S = [x0.slice()]; for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += st[i]; S.push(x); } let F = S.map(f);
  for (let k = 0; k < it; k++) {
    const o = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = o.map(i => S[i]); F = o.map(i => F[i]);
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
    const rf = t => c.map((v, j) => v + t * (S[n][j] - v)), xr = rf(-1), fr = f(xr);
    if (fr < F[0]) { const xe = rf(-2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = rf(fr < F[n] ? -0.5 : 0.5), fc = f(xc); if (fc < Math.min(fr, F[n])) { S[n] = xc; F[n] = fc; } else for (let i = 1; i <= n; i++) { S[i] = S[0].map((v, j) => v + 0.5 * (S[i][j] - v)); F[i] = f(S[i]); } }
  }
  const b = F.indexOf(Math.min(...F)); return { x: S[b], f: F[b] };
}
function asseFlessione(Fh, punti) {
  const d0 = punti.map(p => sample(Fh, ...p)), sel = punti.map((p, i) => i).filter(i => d0[i] < 0.6 && d0[i] > -0.2);
  const A = [-10, 10, 25, 40, 55, 70, 85, 100].map(a => a * Math.PI / 180);
  const asse = ([y0, z0, ta, tb]) => { const a = nrm([1, Math.tan(ta), Math.tan(tb)]); return { c: [0, y0, z0], a }; };
  const J = par => { const { c, a } = asse(par); let s = 0, n = 0;
    for (const th of A) for (const i of sel) { const d = clamp(sample(Fh, ...ruota(punti[i], c, a, -th)), -0.4, 1.0); s += (d - d0[i]) ** 2; n++; } return Math.sqrt(s / n); };
  const r = nelderMead(J, [1.0, 0.1, -0.2, 0.1], [0.3, 0.3, 0.1, 0.1]), ax = asse(r.x);
  // riferimento angolare attorno all'asse: 0 = anteriore (+z), +90 = prossimale (+y), −90 = distale, ±180 = posteriore
  let u1 = [0, 0, 1]; const k = dot(u1, ax.a); u1 = nrm(u1.map((v, i) => v - k * ax.a[i])); let u2 = cross(ax.a, u1); if (u2[1] < 0) u2 = u2.map(v => -v);
  return { ...ax, u1, u2, scarto: r.f, nPunti: sel.length };
}
const alfaS = (ax, p) => { const r = [p[0] - ax.c[0], p[1] - ax.c[1], p[2] - ax.c[2]], s = dot(r, ax.a), q = r.map((v, i) => v - s * ax.a[i]); return { s, alfa: Math.atan2(dot(q, ax.u2), dot(q, ax.u1)) * 180 / Math.PI }; };

/* ---------- campo del territorio ---------- */
function territorio(S, Corig) {
  const [lo, hi] = bbox(Corig.pos), nv = S.pos.length / 3, f = new Float64Array(nv);
  for (let i = 0; i < nv; i++) {
    const p = [S.pos[3 * i] + COP_PUNTO * S.nor[3 * i], S.pos[3 * i + 1] + COP_PUNTO * S.nor[3 * i + 1], S.pos[3 * i + 2] + COP_PUNTO * S.nor[3 * i + 2]];
    if (p.every((v, k) => v > lo[k] - 0.05 && v < hi[k] + 0.05) && dentro(p, Corig.pos, Corig.idx)) f[i] = 1;
  }
  return f;
}
function diffondi(f, nb, passi) {
  let a = Float64Array.from(f);
  for (let it = 0; it < passi; it++) { const q = a.slice(); for (let i = 0; i < a.length; i++) { let s = a[i]; for (const j of nb[i]) s += a[j]; q[i] = s / (nb[i].length + 1); } a = q; }
  return a;
}

/* raffinamento adattivo: dimezza gli spigoli che attraversano la fascia attorno al margine (f tra `lo` e `hi`), con modelli
   conformi 1→2, 1→3, 1→4 (nessuna giunzione a T); la posizione, la normale e il campo dei nuovi vertici sono interpolati */
function raffina(S, f, fasce) {
  let pos = Array.from(S.pos), nor = Array.from(S.nor), F = Array.from(f), idx = Array.from(S.idx);
  for (const [lo, hi] of fasce) {
    const mid = new Map(), I = [], nvIn = pos.length / 3;
    const dec = (a, b) => { const fa = F[a], fb = F[b]; return Math.max(fa, fb) >= lo && Math.min(fa, fb) <= hi; };
    const m = (a, b) => { const k = a < b ? a * 1e7 + b : b * 1e7 + a; let r = mid.get(k); if (r === undefined) { r = pos.length / 3; mid.set(k, r);
      for (let c = 0; c < 3; c++) pos.push((pos[3 * a + c] + pos[3 * b + c]) / 2);
      const nx = nor[3 * a] + nor[3 * b], ny = nor[3 * a + 1] + nor[3 * b + 1], nz = nor[3 * a + 2] + nor[3 * b + 2], l = Math.hypot(nx, ny, nz) || 1; nor.push(nx / l, ny / l, nz / l); F.push((F[a] + F[b]) / 2); } return r; };
    for (let t = 0; t < idx.length; t += 3) {
      let v = [idx[t], idx[t + 1], idx[t + 2]]; const sp = [dec(v[0], v[1]), dec(v[1], v[2]), dec(v[2], v[0])], n = sp.filter(Boolean).length;
      if (n === 0) { I.push(...v); continue; }
      if (n === 3) { const ab = m(v[0], v[1]), bc = m(v[1], v[2]), ca = m(v[2], v[0]); I.push(v[0], ab, ca, ab, v[1], bc, ca, bc, v[2], ab, bc, ca); continue; }
      if (n === 1) { const k = sp.indexOf(true), a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3], ab = m(a, b); I.push(a, ab, c, ab, b, c); continue; }
      const k = sp.indexOf(false), a = v[(k + 1) % 3], b = v[(k + 2) % 3], c = v[k];          // lato c-a intero: spezzati a-b e b-c; vertice comune b
      const ab = m(a, b), bc = m(b, c); I.push(ab, b, bc);
      const d1 = Math.hypot(...[0, 1, 2].map(q => pos[3 * ab + q] - pos[3 * c + q])), d2 = Math.hypot(...[0, 1, 2].map(q => pos[3 * bc + q] - pos[3 * a + q]));
      if (d1 < d2) I.push(a, ab, c, ab, bc, c); else I.push(a, ab, bc, a, bc, c);
    }
    idx = I;
  }
  return { pos: Float64Array.from(pos), nor: Float64Array.from(nor), idx: Uint32Array.from(idx), f: Float64Array.from(F) };
}

/* ---------- guscio di cartilagine dal campo ---------- */
function guscio(S, f, spessore) {
  const P = [], I = [], oi = new Map(), ii = new Map(), bi = new Map(), liv = 0.5;
  const nuovoV = (x, y, z) => { P.push(x, y, z); return P.length / 3 - 1; };
  const interno = a => { let r = oi.get(a); if (r === undefined) { const t = spessore[a] - SOTTO; r = nuovoV(S.pos[3 * a] + S.nor[3 * a] * t, S.pos[3 * a + 1] + S.nor[3 * a + 1] * t, S.pos[3 * a + 2] + S.nor[3 * a + 2] * t); oi.set(a, r);
    ii.set(a, nuovoV(S.pos[3 * a] - S.nor[3 * a] * SOTTO, S.pos[3 * a + 1] - S.nor[3 * a + 1] * SOTTO, S.pos[3 * a + 2] - S.nor[3 * a + 2] * SOTTO)); } return r; };
  const faccia = a => { interno(a); return ii.get(a); };
  const bordo = (a, b) => { const k = a < b ? a * 1e6 + b : b * 1e6 + a; let r = bi.get(k); if (r === undefined) {
      const t = (liv - f[a]) / (f[b] - f[a]), x = [0, 1, 2].map(c => S.pos[3 * a + c] + t * (S.pos[3 * b + c] - S.pos[3 * a + c])), n = [0, 1, 2].map(c => S.nor[3 * a + c] + t * (S.nor[3 * b + c] - S.nor[3 * a + c])), l = Math.hypot(...n) || 1;
      r = nuovoV(x[0] - n[0] / l * SOTTO, x[1] - n[1] / l * SOTTO, x[2] - n[2] / l * SOTTO); bi.set(k, r); } return r; };
  const out = (a, b, c) => I.push(a, b, c), inn = (a, b, c) => I.push(a, c, b);
  for (let t = 0; t < S.idx.length; t += 3) {
    const v = [S.idx[t], S.idx[t + 1], S.idx[t + 2]], d = v.map(a => f[a] >= liv), n = d.filter(Boolean).length; if (n === 0) continue;
    if (n === 3) { out(interno(v[0]), interno(v[1]), interno(v[2])); inn(faccia(v[0]), faccia(v[1]), faccia(v[2])); continue; }
    if (n === 1) { const k = d.indexOf(true), a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3], e1 = bordo(a, b), e2 = bordo(a, c); out(interno(a), e1, e2); inn(faccia(a), e1, e2); continue; }
    const k = d.indexOf(false), a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3], e1 = bordo(b, a), e2 = bordo(c, a); // a fuori; b, c dentro
    out(interno(b), interno(c), e2); out(interno(b), e2, e1); inn(faccia(b), faccia(c), e2); inn(faccia(b), e2, e1);
  }
  return { pos: Float32Array.from(P), idx: Uint32Array.from(I) };
}

/* ---------- main ---------- */
const prova = (process.argv.find(a => a.startsWith('--prova=')) || '').split('=')[1];
setGriglia(GRIGLIA.o, GRIGLIA.h, ...GRIGLIA.n);
const OSSA = {}, PATCH = {}, F0 = {}, NB = {};
for (const [nome, osso] of Object.entries(CART)) {
  const C = realDaRevisione(ORIGINALE, nome, FILE_REPO), B = REAL(osso);
  OSSA[osso] = B; const S = PATCH[nome] = patchOsso(B.pos, B.idx, C.pos, RAGGIO_PATCH);
  NB[nome] = vicini(S.pos.length / 3, S.idx); F0[nome] = territorio(S, C);
  log(nome, 'patch osso', S.pos.length / 3, 'vertici;', F0[nome].reduce((s, v) => s + v, 0), 'nel territorio originale');
}
const SDF = { omero: campoOsso('omero'), ulna: campoOsso('ulna'), radio: campoOsso('radio') }; log('campi di distanza delle ossa');
// punti articolari (ulna e radio) per l'asse
const punti = []; for (const [nome, osso, passo] of [['cart_ulna', 'ulna', 5], ['cart_radio', 'radio', 6]]) { let k = 0; const S = PATCH[nome];
  for (let i = 0; i < S.pos.length / 3; i++) if (F0[nome][i] && (k++ % passo === 0)) punti.push(P3(S, i)); }
const AX = asseFlessione(SDF.omero, punti);
log('asse di flessione: punto', AX.c.map(v => v.toFixed(3)), 'direzione', AX.a.map(v => v.toFixed(3)), 'scarto', AX.scarto.toFixed(3), 'cm su', AX.nPunti, 'punti');

/* ----- correzioni anatomiche del territorio ----- */
function omero(S, f) {
  let n = 0;
  for (let i = 0; i < f.length; i++) { if (!f[i]) continue; const { s, alfa } = alfaS(AX, P3(S, i));
    const t = sstep(S_CAP[0], S_CAP[1], s);                        // 0 = capitello, 1 = troclea
    const post = CAP_POST - 80 * t, prox = CAP_PROX + 90 * t;      // limiti angolari: valgono sul capitello e scivolano via nel solco capitello-trocleare
    const fuori = Math.max(1 - sstep(post - 10, post + 10, alfa), sstep(prox - 10, prox + 10, alfa));
    if (fuori > 0.01) { f[i] = Math.min(f[i], 1 - fuori); n++; } }
  log('omero: vertici del capitello portati fuori dal territorio', n);
}
function ulna(S, f, nome) {
  const nv = f.length, dmin = new Float64Array(nv);
  for (let i = 0; i < nv; i++) { const p = P3(S, i); let m = 9; for (const th of ANGOLI) { const d = sample(SDF.omero, ...ruota(p, AX.c, AX.a, -th)); if (d < m) m = d; } dmin[i] = m; }
  const cop = []; for (let i = 0; i < nv; i++) if (f[i]) cop.push(i);
  // griglia per la distanza dal territorio originale
  const cell = ESTENDI, K = new Map(); for (const j of cop) { const q = [0, 1, 2].map(a => Math.floor(S.pos[3 * j + a] / cell)).join(','); (K.get(q) || K.set(q, []).get(q)).push(j); }
  let n = 0; for (let i = 0; i < nv; i++) { if (f[i] || dmin[i] >= TOCCO) continue; const q = [0, 1, 2].map(a => Math.floor(S.pos[3 * i + a] / cell));
    let m = 9; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of K.get([q[0] + a, q[1] + b, q[2] + c].join(',')) || []) m = Math.min(m, Math.hypot(S.pos[3 * i] - S.pos[3 * j], S.pos[3 * i + 1] - S.pos[3 * j + 1], S.pos[3 * i + 2] - S.pos[3 * j + 2]));
    if (m <= ESTENDI) { f[i] = 1; n++; } }
  log('ulna: vertici aggiunti fino al bordo articolare', n);
}
function radio(S, f) {
  const nv = f.length, Su = PATCH.cart_ulna;
  let cx = 0, cz = 0, k = 0; for (let i = 0; i < nv; i++) if (f[i]) { cx += S.pos[3 * i]; cz += S.pos[3 * i + 2]; k++; } cx /= k; cz /= k;           // centro della testa
  let nx = 0, nz = 0, m = 0; for (let i = 0; i < Su.pos.length / 3; i++) if (F0.cart_ulna[i] && sample(SDF.radio, ...P3(Su, i)) < 0.35) { nx += Su.pos[3 * i]; nz += Su.pos[3 * i + 2]; m++; }
  nx /= m; nz /= m;                                                                                                                            // centro dell'incisura radiale
  const phi0 = Math.atan2(-(nz - cz), -(nx - cx)) + MARGINE_POSA * Math.PI / 180;                                                             // direzione opposta all'incisura
  // raggio massimo della testa per direzione (bin di 5°, media mobile): la circonferenza è la parte oltre `CIRC` del raggio locale
  const NB = 72, Rm = new Float64Array(NB), fi = i => Math.atan2(S.pos[3 * i + 2] - cz, S.pos[3 * i] - cx), rho = i => Math.hypot(S.pos[3 * i] - cx, S.pos[3 * i + 2] - cz);
  for (let i = 0; i < nv; i++) if (f[i]) { const b = ((Math.floor((fi(i) + Math.PI) / (2 * Math.PI) * NB) % NB) + NB) % NB; Rm[b] = Math.max(Rm[b], rho(i)); }
  const Rs = Rm.map((v, b) => { let q = 0; for (let d = -3; d <= 3; d++) q += Rm[(b + d + NB) % NB]; return q / 7; });
  let n = 0;
  for (let i = 0; i < nv; i++) { if (!f[i]) continue; const b = ((Math.floor((fi(i) + Math.PI) / (2 * Math.PI) * NB) % NB) + NB) % NB, circ = sstep(CIRC[0], CIRC[1], rho(i) / Rs[b]);   // 1 = circonferenza, 0 = fovea
    let d = Math.abs(fi(i) - phi0) * 180 / Math.PI; d = d > 180 ? 360 - d : d;
    const nudo = 1 - sstep(ARCO_NUDO / 2 - SFUMA / 2, ARCO_NUDO / 2 + SFUMA / 2, d);                                                         // 1 = dentro l'arco nudo
    const w = nudo * circ; if (w > 0) { f[i] = Math.min(f[i], 1 - w); n++; } }
  log('radio: arco nudo centrato a', (phi0 * 180 / Math.PI).toFixed(0), '° nel piano x–z; vertici toccati', n);
}
const CORREZIONI = { cart_omero: omero, cart_ulna: ulna, cart_radio: radio };

const uscita = {}, MESH = {};
for (const [nome, osso] of Object.entries(CART)) {
  const S = PATCH[nome], nv = S.pos.length / 3, nb = NB[nome], f0 = Float64Array.from(F0[nome]);
  CORREZIONI[nome](S, f0, nome);
  const fd = diffondi(f0, nb, DIFF[nome]);
  const R = raffina(S, fd, RAFFINA), f = R.f, nvR = f.length, nbR = vicini(nvR, R.idx);
  // spessore: profilo dal campo, limitato dal gioco con le ossa affrontate, poi levigato
  const altri = Object.values(CART).filter(o => o !== osso), sp = new Float64Array(nvR);
  for (let i = 0; i < nvR; i++) { if (f[i] < 0.5) continue; const g = Math.min(...altri.map(o => sample(SDF[o], R.pos[3 * i], R.pos[3 * i + 1], R.pos[3 * i + 2])));
    sp[i] = Math.min(TMAX[nome] * sstep(0.5, 0.5 + RAMPA, f[i]), Math.max(GIOCO_MIN, (g - GIOCO_RESTO) / 2)); }
  const spl = diffondi(sp, nbR, DIFF_TESSUTO);
  for (let i = 0; i < nvR; i++) sp[i] = f[i] >= 0.5 ? Math.min(sp[i], Math.max(spl[i], 0)) : 0;
  const m = guscio(R, f, sp);
  log(nome, m.pos.length / 3, 'vertici,', m.idx.length / 3, 'triangoli');
  if (prova) { uscita[nome] = { pos: Array.from(m.pos, v => +v.toFixed(4)), idx: Array.from(m.idx) }; uscita[osso] = { pos: Array.from(OSSA[osso].pos, v => +v.toFixed(4)), idx: Array.from(OSSA[osso].idx) }; }
  setMesh(nome, { pos: m.pos, idx: m.idx, tag: null, fdir: null }); MESH[nome] = m;
}
/* ---------- verifica: compenetrazioni della faccia esterna con le ossa e con le altre cartilagini ---------- */
{
  const CS = {}; for (const nome of Object.keys(CART)) CS[nome] = campoOsso(nome);
  for (const [nome, osso] of Object.entries(CART)) {
    const m = MESH[nome], nv = m.pos.length / 3, r = { ossa: 0, cart: 0, maxO: 0, maxC: 0 };
    for (let i = 0; i < nv; i++) { const p = [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]];
      if (sample(SDF[osso], ...p) < 0.012) continue;                                      // faccia interna e margine: sotto o sulla superficie del proprio osso
      for (const o of Object.values(CART)) if (o !== osso) { const d = sample(SDF[o], ...p); if (d < -0.02) { r.ossa++; r.maxO = Math.max(r.maxO, -d); } }
      for (const c of Object.keys(CART)) if (c !== nome) { const d = sample(CS[c], ...p); if (d < -0.02) { r.cart++; r.maxC = Math.max(r.maxC, -d); } } }
    log(nome, 'verifica: vertici esterni dentro altre ossa', r.ossa, '(max', r.maxO.toFixed(3), 'cm); dentro altre cartilagini', r.cart, '(max', r.maxC.toFixed(3), 'cm)');
  }
}
if (prova) { writeFileSync(prova, JSON.stringify(uscita)); log('scritto', prova); } else saveFile(repack());
