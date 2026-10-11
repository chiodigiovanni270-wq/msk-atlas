/* Muscoli del gomito (modelli/gomito-3d.html): direzione delle fibre, tendine distale del bicipite e brachiale.

   Uso (dalla cartella del progetto):
     node strumenti/muscoli-gomito.mjs                   → riscrive le mesh nel file del modello
     node strumenti/muscoli-gomito.mjs verifica          → non scrive: elenca le compenetrazioni di bicipite e brachiale
     MODELLO=/tmp/copia.html node strumenti/muscoli-gomito.mjs   → lavora su una copia

   Passi:
   - fibre: la direzione delle fibre per vertice (`fdir`) dei muscoli BodyParts3D e ricostruiti cambiava di 1–4° tra vertici vicini (fino a
     oltre 20° sul 5% dei lati nel tricipite). Lo shader delle fibre proietta la posizione sul riferimento delle fibre, quindi a qualche
     centimetro dall'origine anche 1° sposta le striature di più di una striatura: a forte ingrandimento comparivano righe spezzate a gradini.
     Qui il campo è levigato sulla mesh (media dei vicini con segno concorde, `FIBRE.passate`), così varia con continuità; nella pagina lo
     shader usa inoltre come origine il centro di ogni struttura (uniform `fO`), che riduce il braccio di leva.
   - bicipite: il tendine distale passava dentro il brachiale (tra y ≈ +2,5 e −0,5 cm) e lontano dal lacerto fibroso. In anatomia il tendine
     scende davanti al brachiale, sul suo margine laterale, lateralmente ad arteria brachiale e nervo mediano, dà il lacerto dal suo margine
     mediale e poi si approfonda tra brachiale (medialmente) e brachioradiale/supinatore (lateralmente) fino alla tuberosità radiale.
     Il tratto tra `BIC.y` è portato in avanti (`BIC.dz`, raccordo dolce, nessuno spostamento sotto y = −0,4, dove il tendine è già laterale al brachiale, né sopra y = 4,6).
   - brachiale: la faccia anteriore sporgeva fin quasi alla cute e avvolgeva tendine del bicipite, arteria brachiale, vene comitanti e
     nervo mediano. Per ogni colonna (x, y) il muscolo è compresso lungo z tra la faccia profonda (che resta sull'osso e sulla capsula) e
     una faccia anteriore che passa sotto queste strutture con un gioco `BRA.gioco`; il limite è l'inviluppo inferiore di coni di pendenza
     `BRA.pendenza` (letto ampio e poco profondo, non un canale). Distalmente il muscolo termina con un tendine robusto sulla tuberosità
     ulnare e sulla faccia anteriore del coronoide (Standring, Gray's Anatomy 42ª ed.): il tratto distale si assottiglia verso l'osso
     (`BRA.tendine`), con il tendine che compare prima sulla faccia superficiale (colore muscolo → tendine dai tag dei vertici).
   Bicipite e brachiale ripartono sempre dalle mesh della revisione `PARTENZA`; degli altri muscoli cambia solo la direzione delle fibre
   (riletta da `PARTENZA` e levigata), la forma resta quella del file. Si può quindi rilanciare; va rilanciato dopo `legamenti-gomito.mjs`
   (che riscrive FCU e tricipite mediale con la direzione delle fibre originale) e dopo `capsula-gomito.mjs`/`cuscinetti-gomito.mjs`
   (capsula e cuscinetto anteriore delimitano la faccia profonda del brachiale). Al termine stampa le compenetrazioni residue. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { setMesh, clamp, sstep, log, repack, saveFile, realDaRevisione, REAL, attrs } = G;

const PARTENZA = '5efa523';                 // revisione con le mesh di partenza (prima di questo strumento)
const FILE_REPO = 'modelli/gomito-3d.html';
const MUSCOLI = ['bic', 'tri_lungo', 'tri_med', 'tri_lat', 'br', 'ecrl', 'ecrb', 'edc', 'fcr', 'fds', 'fdp', 'ecu', 'pl', 'sup', 'brach', 'pt', 'fcu', 'anc', 'fpl', 'edm', 'apl', 'epl'];
const FIBRE = { passate: 40, peso: 1 };      // passate di media sui vicini; peso del vertice stesso

const argv = process.argv.slice(2);
const VERIFICA = argv.includes('verifica');

// mesh corrente: quella già ricalcolata in questa esecuzione; altrimenti bicipite e brachiale dalla revisione di partenza, le altre dal file
// (la loro forma può venire da altri strumenti, es. `legamenti-gomito.mjs` per FCU e tricipite mediale); la direzione delle fibre dei
// muscoli si rilegge sempre dalla revisione di partenza, così la levigatura non si accumula
const RIMODELLATI = new Set(['bic', 'brach']);
const corrente = new Map();
function mesh(id) {
  if (corrente.has(id)) return corrente.get(id);
  let r;
  if (RIMODELLATI.has(id)) {
    const m = realDaRevisione(PARTENZA, id, FILE_REPO);
    r = { pos: Float32Array.from(m.pos), idx: m.idx, tag: m.tag ? Uint8Array.from(m.tag) : null, fdir: m.fdir ? Int8Array.from(m.fdir) : null };
  } else {
    const m = REAL(id), a = attrs(id);
    r = { pos: Float32Array.from(m.pos), idx: m.idx, tag: a.tag, fdir: a.fdir };
    if (MUSCOLI.includes(id)) { const p = realDaRevisione(PARTENZA, id, FILE_REPO); if (p.fdir && p.fdir.length === r.pos.length) r.fdir = Int8Array.from(p.fdir); }
  }
  corrente.set(id, r); return r;
}
const registra = (id, m) => { corrente.set(id, m); setMesh(id, { pos: m.pos, idx: m.idx, tag: m.tag, fdir: m.fdir }); };
function vicini(idx, nv) {
  const nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  return nb.map(s => Int32Array.from(s));
}

/* ============ Fibre ============ */
function levigaFibre(id) {
  const m = mesh(id); if (!m.fdir) return;
  const nv = m.pos.length / 3, nb = vicini(m.idx, nv);
  let F = new Float32Array(3 * nv);
  for (let i = 0; i < nv; i++) { const x = m.fdir[3 * i], y = m.fdir[3 * i + 1], z = m.fdir[3 * i + 2], l = Math.hypot(x, y, z) || 1; F[3 * i] = x / l; F[3 * i + 1] = y / l; F[3 * i + 2] = z / l; }
  const prima = scarto(F, nb);
  for (let p = 0; p < FIBRE.passate; p++) {
    const N = new Float32Array(3 * nv);
    for (let i = 0; i < nv; i++) {
      let x = F[3 * i] * FIBRE.peso, y = F[3 * i + 1] * FIBRE.peso, z = F[3 * i + 2] * FIBRE.peso;
      for (const j of nb[i]) { const s = F[3 * i] * F[3 * j] + F[3 * i + 1] * F[3 * j + 1] + F[3 * i + 2] * F[3 * j + 2] < 0 ? -1 : 1; x += s * F[3 * j]; y += s * F[3 * j + 1]; z += s * F[3 * j + 2]; }
      const l = Math.hypot(x, y, z) || 1; N[3 * i] = x / l; N[3 * i + 1] = y / l; N[3 * i + 2] = z / l;
    }
    F = N;
  }
  const fdir = new Int8Array(3 * nv); for (let i = 0; i < 3 * nv; i++) fdir[i] = Math.round(clamp(F[i], -1, 1) * 127);
  registra(id, { ...m, fdir });
  log(`fibre ${id.padEnd(9)} scarto medio tra vicini ${prima.toFixed(2)}° → ${scarto(F, nb).toFixed(2)}°`);
}
function scarto(F, nb) {
  let s = 0, c = 0;
  for (let i = 0; i < nb.length; i++) for (const j of nb[i]) { const d = Math.abs(F[3 * i] * F[3 * j] + F[3 * i + 1] * F[3 * j + 1] + F[3 * i + 2] * F[3 * j + 2]); s += Math.acos(Math.min(1, d)); c++; }
  return s / c * 180 / Math.PI;
}

/* ============ Colonne lungo z ============ */
// griglia in (x, y): per ogni nodo la z minima e massima di una mesh (rasterizzazione dei triangoli proiettati sul piano frontale)
const GR = { x0: -3, x1: 3.5, y0: -4, y1: 13, h: 0.05 };
GR.nx = Math.round((GR.x1 - GR.x0) / GR.h) + 1; GR.ny = Math.round((GR.y1 - GR.y0) / GR.h) + 1;
const nodo = (i, j) => i + GR.nx * j;
function colonne(pos, idx, lo = new Float32Array(GR.nx * GR.ny).fill(Infinity), hi = new Float32Array(GR.nx * GR.ny).fill(-Infinity)) {
  for (let t = 0; t < idx.length; t += 3) {
    const a = 3 * idx[t], b = 3 * idx[t + 1], c = 3 * idx[t + 2];
    const ax = pos[a], ay = pos[a + 1], bx = pos[b], by = pos[b + 1], cx = pos[c], cy = pos[c + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - GR.x0) / GR.h)), i1 = Math.min(GR.nx - 1, Math.floor((Math.max(ax, bx, cx) - GR.x0) / GR.h));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - GR.y0) / GR.h)), j1 = Math.min(GR.ny - 1, Math.floor((Math.max(ay, by, cy) - GR.y0) / GR.h));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = GR.x0 + i * GR.h, y = GR.y0 + j * GR.h;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, w = 1 - u - v;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      const z = u * pos[a + 2] + v * pos[b + 2] + w * pos[c + 2], k = nodo(i, j);
      if (z < lo[k]) lo[k] = z; if (z > hi[k]) hi[k] = z;
    }
  }
  return { lo, hi };
}
// tubo procedurale della pagina (nervi e vasi): faccia inferiore (z minima) per colonna
const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
function colonneTubo(id, lo = new Float32Array(GR.nx * GR.ny).fill(Infinity)) {
  const P = NVP.pts[id], r = NVP.r[id];
  for (let s = 0; s + 1 < P.length; s++) {
    const a = P[s], b = P[s + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / 0.02));
    for (let q = 0; q <= n; q++) {
      const f = q / n, cx = a[0] + (b[0] - a[0]) * f, cy = a[1] + (b[1] - a[1]) * f, cz = a[2] + (b[2] - a[2]) * f;
      const i0 = Math.max(0, Math.ceil((cx - r - GR.x0) / GR.h)), i1 = Math.min(GR.nx - 1, Math.floor((cx + r - GR.x0) / GR.h));
      const j0 = Math.max(0, Math.ceil((cy - r - GR.y0) / GR.h)), j1 = Math.min(GR.ny - 1, Math.floor((cy + r - GR.y0) / GR.h));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d2 = (GR.x0 + i * GR.h - cx) ** 2 + (GR.y0 + j * GR.h - cy) ** 2; if (d2 > r * r) continue;
        const z = cz - Math.sqrt(r * r - d2), k = nodo(i, j); if (z < lo[k]) lo[k] = z;
      }
    }
  }
  return lo;
}
// valore bilineare di un campo della griglia (nodi senza valore = NaN restano esclusi)
function campiona(F, x, y) {
  const fx = (x - GR.x0) / GR.h, fy = (y - GR.y0) / GR.h, i = clamp(Math.floor(fx), 0, GR.nx - 2), j = clamp(Math.floor(fy), 0, GR.ny - 2), u = fx - i, v = fy - j;
  let s = 0, w = 0;
  for (const [di, dj, ww] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) { const f = F[nodo(i + di, j + dj)]; if (Number.isFinite(f) && ww > 0) { s += f * ww; w += ww; } }
  return w > 0 ? s / w : NaN;
}

/* ============ Bicipite ============ */
// spostamento in avanti (z) del tendine distale in funzione di y: 0 fuori da [y[0], y[3]], pieno tra y[1] e y[2], raccordi a S
const BIC = { dz: 0.65, y: [-0.4, 0.8, 2.4, 4.6] };
const dzBic = y => BIC.dz * sstep(BIC.y[0], BIC.y[1], y) * (1 - sstep(BIC.y[2], BIC.y[3], y));
function bicipite() {
  const m = mesh('bic'), pos = Float32Array.from(m.pos);
  for (let i = 0; i < pos.length; i += 3) pos[i + 2] += dzBic(pos[i + 1]);
  registra('bic', { ...m, pos });
  log(`bicipite: tendine distale portato in avanti di ${BIC.dz} cm tra y ${BIC.y[1]} e ${BIC.y[2]}`);
}

/* ============ Brachiale ============ */
const BRA = {
  ostacoli: ['bic', 'lacerto'],                                                          // mesh davanti al brachiale
  tubi: ['a_brachiale', 'n_mediano', 'v_comitante_med', 'v_comitante_lat', 'v_mediana_cub'],   // fascio neurovascolare sul brachiale e vena superficiale
  gioco: 0.03,          // cm tra la faccia anteriore del brachiale e le strutture che vi poggiano
  pendenza: 0.8,        // pendenza dei coni dell'inviluppo (letto ampio e poco profondo: 0,8 cm di risalita per cm di distanza)
  raggio: 2.0,          // cm, distanza massima considerata per i coni
  davanti: 0.3,         // un ostacolo conta solo se la sua faccia inferiore sta almeno così sopra la faccia profonda del brachiale
  minimo: 0.45,         // cm, spessore minimo del muscolo nella colonna
  braccio: [3.6, 5.0],  // il limite agisce in pieno sotto y = braccio[0] e si annulla sopra braccio[1] (nel braccio la forma resta quella di partenza)
  passo: 0.08,          // cm, griglia della ricostruzione
  esclusi: ['br', 'pt', 'bic', 'omero', 'ulna', 'caps', 'fat_ant'],   // strutture vicine sottratte dal solido ricostruito
  // tendine distale: la faccia superficiale diventa tendine da y = sup[0] a sup[1], la profonda da prof[0] a prof[1];
  // sotto y = assottiglia[0] il muscolo si appiattisce verso la faccia profonda fino al fattore `fattore` in y = assottiglia[1]
  tendine: { sup: [-0.4, -1.3], prof: [-1.7, -2.6], assottiglia: [-1.2, -3.1], fattore: 0.55 },
};
function brachiale() {
  const m = mesh('brach'), pos = Float32Array.from(m.pos), nv = pos.length / 3;
  const { lo: zb, hi: zf } = colonne(m.pos, m.idx);
  // faccia inferiore degli ostacoli, solo dove stanno davanti al muscolo
  const O = new Float32Array(GR.nx * GR.ny).fill(Infinity);
  for (const id of BRA.ostacoli) { const o = mesh(id); colonne(o.pos, o.idx, O, new Float32Array(GR.nx * GR.ny)); }
  for (const id of BRA.tubi) colonneTubo(id, O);
  const att = [];
  for (let k = 0; k < O.length; k++) if (Number.isFinite(O[k]) && Number.isFinite(zb[k]) && O[k] > zb[k] + BRA.davanti) att.push(k);
  // inviluppo inferiore dei coni con vertice nella faccia inferiore degli ostacoli
  const C = new Float32Array(GR.nx * GR.ny).fill(Infinity), R = Math.ceil(BRA.raggio / GR.h);
  for (const k of att) {
    const i0 = k % GR.nx, j0 = (k / GR.nx) | 0, base = O[k] - BRA.gioco;
    for (let j = Math.max(0, j0 - R); j <= Math.min(GR.ny - 1, j0 + R); j++) for (let i = Math.max(0, i0 - R); i <= Math.min(GR.nx - 1, i0 + R); i++) {
      const d = Math.hypot(i - i0, j - j0) * GR.h; if (d > BRA.raggio) continue;
      const v = base + BRA.pendenza * d, q = nodo(i, j); if (v < C[q]) C[q] = v;
    }
  }
  // nuova faccia anteriore per colonna
  const Zf = new Float32Array(GR.nx * GR.ny).fill(NaN), Zb = new Float32Array(GR.nx * GR.ny).fill(NaN), ZF = new Float32Array(GR.nx * GR.ny).fill(NaN);
  let maxAbb = 0;
  for (let k = 0; k < zf.length; k++) if (Number.isFinite(zf[k])) {
    Zb[k] = zb[k]; Zf[k] = zf[k];
    const lim = Math.min(zf[k], Math.max(C[k], zb[k] + Math.min(BRA.minimo, zf[k] - zb[k]))), y = GR.y0 + ((k / GR.nx) | 0) * GR.h;
    ZF[k] = zf[k] - (zf[k] - lim) * (1 - sstep(BRA.braccio[0], BRA.braccio[1], y));
    maxAbb = Math.max(maxAbb, zf[k] - ZF[k]);
  }
  // assottigliamento verso l'inserzione (la faccia profonda resta sull'osso)
  const T = BRA.tendine;
  for (let k = 0; k < ZF.length; k++) if (Number.isFinite(ZF[k])) {
    const y = GR.y0 + ((k / GR.nx) | 0) * GR.h, f = 1 - (1 - T.fattore) * sstep(T.assottiglia[0], T.assottiglia[1], y);
    ZF[k] = Zb[k] + (ZF[k] - Zb[k]) * f;
  }
  // La mesh di partenza aveva un tunnel interno attorno al tendine del bicipite (colonne con 4 intersezioni tra y ≈ −1 e 3):
  // il muscolo si ricostruisce come solido pieno tra faccia profonda e nuova faccia anteriore di ogni colonna (surface nets).
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], pos[3 * i + q]); hi[q] = Math.max(hi[q], pos[3 * i + q]); }
  G.griglia(lo, hi, BRA.passo, 0.2);
  const M = new Uint8Array(G.N);
  for (let id = 0; id < G.N; id++) {
    const [x, y, z] = G.voxel(id), b = campiona(Zb, x, y), F = campiona(ZF, x, y);
    if (Number.isFinite(b) && Number.isFinite(F) && z >= b && z <= F) M[id] = 1;
  }
  for (const id of BRA.esclusi) { const E = G.solid(id); for (let q = 0; q < G.N; q++) if (E[q]) M[q] = 0; }
  const { F } = G.sdf(M); G.sfoca(F, 2);
  // direzione delle fibre dal vertice di partenza più vicino (riportato sulla forma nuova con la stessa compressione delle colonne)
  const P = new Float32Array(3 * nv), cella = 0.25, hash = new Map(), chiave = (x, y, z) => `${Math.floor(x / cella)},${Math.floor(y / cella)},${Math.floor(z / cella)}`;
  for (let i = 0; i < nv; i++) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], b = campiona(Zb, x, y), f = campiona(Zf, x, y), Fz = campiona(ZF, x, y);
    P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = Number.isFinite(b) && f - b > 1e-4 ? b + (z - b) * (Fz - b) / (f - b) : z;
    const c = chiave(P[3 * i], y, P[3 * i + 2]); if (!hash.has(c)) hash.set(c, []); hash.get(c).push(i);
  }
  const vicino = p => {
    let best = -1, bd = Infinity; const [cx, cy, cz] = p.map(v => Math.floor(v / cella));
    for (let r = 1; r <= 4 && best < 0; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) for (const i of hash.get(`${cx + a},${cy + b},${cz + c}`) || []) {
      const d = (P[3 * i] - p[0]) ** 2 + (P[3 * i + 1] - p[1]) ** 2 + (P[3 * i + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = i; }
    }
    return Math.max(0, best);
  };
  const out = G.nets(F, p => { const i = vicino(p); return [m.fdir[3 * i], m.fdir[3 * i + 1], m.fdir[3 * i + 2]]; });
  // tendine: compare prima sulla faccia superficiale (t = 1) e poi su quella profonda (t = 0)
  const n2 = out.pos.length / 3, tag = new Uint8Array(n2);
  for (let i = 0; i < n2; i++) {
    const x = out.pos[3 * i], y = out.pos[3 * i + 1], z = out.pos[3 * i + 2], b = campiona(Zb, x, y), Fz = campiona(ZF, x, y);
    const t = Number.isFinite(b) && Fz - b > 1e-4 ? clamp((z - b) / (Fz - b), 0, 1) : 0.5;
    const y0 = T.prof[0] + (T.sup[0] - T.prof[0]) * t, y1 = T.prof[1] + (T.sup[1] - T.prof[1]) * t;
    tag[i] = Math.round(200 * sstep(y0, y1, y));
  }
  registra('brach', { pos: out.pos, idx: out.idx, tag, fdir: out.fdir });
  log(`brachiale: faccia anteriore abbassata fino a ${(maxAbb * 10).toFixed(1)} mm sotto ${BRA.ostacoli.concat(BRA.tubi).join(', ')}; tunnel chiuso, tendine distale; ${n2} vertici`);
}

/* ============ Verifica ============ */
// per ogni coppia: vertici di `a` dentro `b` (test di parità lungo z sulle colonne) e profondità massima
function dentro(a, b) {
  const A = mesh(a), B = mesh(b);
  const ints = new Map();
  const { idx, pos } = B;
  for (let t = 0; t < idx.length; t += 3) {
    const p = 3 * idx[t], q = 3 * idx[t + 1], r = 3 * idx[t + 2];
    const den = (pos[q + 1] - pos[r + 1]) * (pos[p] - pos[r]) + (pos[r] - pos[q]) * (pos[p + 1] - pos[r + 1]); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.ceil((Math.min(pos[p], pos[q], pos[r]) - GR.x0) / GR.h), i1 = Math.floor((Math.max(pos[p], pos[q], pos[r]) - GR.x0) / GR.h);
    const j0 = Math.ceil((Math.min(pos[p + 1], pos[q + 1], pos[r + 1]) - GR.y0) / GR.h), j1 = Math.floor((Math.max(pos[p + 1], pos[q + 1], pos[r + 1]) - GR.y0) / GR.h);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = GR.x0 + i * GR.h, y = GR.y0 + j * GR.h;
      const u = ((pos[q + 1] - pos[r + 1]) * (x - pos[r]) + (pos[r] - pos[q]) * (y - pos[r + 1])) / den, v = ((pos[r + 1] - pos[p + 1]) * (x - pos[r]) + (pos[p] - pos[r]) * (y - pos[r + 1])) / den, w = 1 - u - v;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      const k = nodo(i, j); if (!ints.has(k)) ints.set(k, []); ints.get(k).push(u * pos[p + 2] + v * pos[q + 2] + w * pos[r + 2]);
    }
  }
  let n = 0, prof = 0, y0 = Infinity, y1 = -Infinity; const nv = A.pos.length / 3;
  for (let i = 0; i < nv; i++) {
    const x = A.pos[3 * i], y = A.pos[3 * i + 1], z = A.pos[3 * i + 2];
    const k = nodo(Math.round((x - GR.x0) / GR.h), Math.round((y - GR.y0) / GR.h)), zs = ints.get(k); if (!zs) continue;
    const s = zs.slice().sort((u, v) => u - v); let c = 0, d = Infinity;
    for (const v of s) { if (v > z) c++; d = Math.min(d, Math.abs(v - z)); }
    if (c % 2 === 1) { n++; prof = Math.max(prof, d); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { n, nv, prof, y0, y1 };
}
function dentroTubo(a, id) {
  const A = mesh(a), P = NVP.pts[id], r = NVP.r[id]; let n = 0, prof = 0;
  for (let i = 0; i < A.pos.length; i += 3) {
    let d = Infinity;
    for (let s = 0; s + 1 < P.length; s++) {
      const p = P[s], q = P[s + 1], ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], L2 = ux * ux + uy * uy + uz * uz;
      const f = clamp(((A.pos[i] - p[0]) * ux + (A.pos[i + 1] - p[1]) * uy + (A.pos[i + 2] - p[2]) * uz) / (L2 || 1), 0, 1);
      d = Math.min(d, Math.hypot(A.pos[i] - p[0] - ux * f, A.pos[i + 1] - p[1] - uy * f, A.pos[i + 2] - p[2] - uz * f));
    }
    if (d < r) { n++; prof = Math.max(prof, r - d); }
  }
  return { n, nv: A.pos.length / 3, prof };
}
function verifica() {
  const righe = [['brach', 'bic'], ['bic', 'brach'], ['brach', 'lacerto'], ['brach', 'br'], ['brach', 'pt'], ['brach', 'omero'], ['brach', 'ulna'], ['brach', 'caps'], ['bic', 'br'], ['bic', 'radio'], ['bic', 'lacerto']];
  for (const [a, b] of righe) { const r = dentro(a, b); console.log(`  ${a} dentro ${b}: ${r.n}/${r.nv} vertici, max ${(r.prof * 10).toFixed(1)} mm` + (r.n ? ` (y ${r.y0.toFixed(1)} … ${r.y1.toFixed(1)})` : '')); }
  for (const id of [...new Set(BRA.tubi.concat(['n_radiale', 'v_mediana_cub', 'n_cut_lat']))]) for (const a of ['brach', 'bic']) {
    const r = dentroTubo(a, id); if (r.n) console.log(`  ${a} dentro ${id}: ${r.n} vertici, max ${(r.prof * 10).toFixed(1)} mm`);
  }
}

if (VERIFICA) {
  // verifica delle mesh del file (non della revisione di partenza)
  for (const id of ['brach', 'bic', 'lacerto', 'br', 'pt', 'omero', 'ulna', 'radio', 'caps']) { const r = REAL(id); corrente.set(id, { pos: r.pos, idx: r.idx }); }
  verifica();
} else {
  // sempre tutti e tre, in quest'ordine: il brachiale usa il bicipite già spostato, e ogni passo riparte dalle mesh di `PARTENZA`
  MUSCOLI.forEach(levigaFibre); bicipite(); brachiale();
  verifica();
  saveFile(repack());
}
