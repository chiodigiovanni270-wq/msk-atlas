/* Retinacoli del polso (modelli/polso-dito-3d.html, sezione polso).

   Uso (dalla cartella del progetto):
     node strumenti/retinacoli-polso.mjs              → riscrive le mesh nel file del modello
     node strumenti/retinacoli-polso.mjs volari       → solo retinacolo dei flessori, legamento carpale volare e spazi
     node strumenti/retinacoli-polso.mjs estensori    → solo retinacolo degli estensori
     node strumenti/retinacoli-polso.mjs volari --solo=tettoguy,lumguy   → calcola come sempre, ma salva solo le mesh
       indicate (es. il tetto del canale di Guyon dopo uno spostamento dell'arteria ulnare: il resto non cambia)
     MODELLO=/tmp/copia.html node strumenti/retinacoli-polso.mjs   → lavora su una copia

   Ogni retinacolo è un "telo teso": una superficie z(x, y) (o r(φ, y) attorno al polso) che si appoggia sulle
   strutture che contiene (tendini, guaine, nervo mediano), resta sotto quelle che gli passano sopra (vasi e nervi del
   canale di Guyon, palmare lungo, muscoli) e si inserisce sulle ossa, dove la sua faccia profonda entra appena
   nell'osso. Il telo si trova rilassando l'equazione della membrana (media dei vicini meno una piccola pressione
   verso il piano profondo) con i due ostacoli: è teso tra i punti d'appoggio e scavalca i solchi come un retinacolo
   vero. Lo spessore si riduce verso i margini liberi; dove lo spazio è stretto il telo si assottiglia.
   - Retinacolo dei flessori (legamento trasverso del carpo, `retfl`): inserito su tubercolo dello scafoide e cresta
     del trapezio (radiale), pisiforme e uncino dell'uncinato (ulnare); la porzione prossimale sottile continua la
     fascia antibrachiale, quella distale è l'aponeurosi tra muscoli tenari e ipotenari, che ne prendono origine
     (Cobb TK et al., J Hand Surg Am 1993). Lamina profonda sul lato ulnare del FCR fino al trapezio: il FCR
     scorre in un tunnel proprio, fuori dal tunnel carpale.
   - Legamento carpale volare (`tettoguy`, tetto del canale di Guyon): dal pisiforme e dal FCU, sopra nervo e arteria
     ulnari, fino a fondersi con la faccia superficiale del retinacolo dei flessori; margini prossimale e distale
     liberi (ingresso e uscita del canale).
   - Spazi `lumtc` (tunnel carpale) e `lumguy` (canale di Guyon) ricavati tra pavimento osseo e retinacoli.
   Le linee guida (punti in cm, sistema del modello: x radiale→ulnare, y distale→prossimale, z dorsale→volare) sono
   nelle tabelle in testa. Vasi e nervi (tubi procedurali) sono letti dal sorgente della pagina.
   Riparte sempre dalle ossa, dai tendini e dai tubi incorporati, quindi si può rilanciare. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'polso-dito-3d.html');
const G = await import('./lib-modello.mjs'); // griglia corrente: G.O, G.H, G.NX… cambiano con setGriglia
const { man, setMesh, solid, edt, or, clamp, sstep, log, repack, saveFile, griglia, sdf, unione, sfoca, nets, taubin, esatta } = G;

/* ============ Parametri ============ */
const CARPO = ['scafoide', 'semilunare', 'piramidale', 'pisiforme', 'trapezio', 'trapezoide', 'capitato', 'uncinato', 'mc1', 'mc2', 'mc3', 'mc4', 'mc5'];
const CONTENUTO = ['fds', 'fdp', 'fpl', 'gulnare', 'gfpl'];          // tunnel carpale (con il nervo mediano)
const FCR = ['fcr', 'gfcr'];                                           // tunnel proprio del FCR
const GUYON = ['nuln', 'auln', 'nulnsup', 'nulnprof', 'aulnprof'];    // tubi del canale di Guyon
// contorni in pianta (x, y), chiusi e smussati: punti di controllo di una spline
const TCL = [ // retinacolo dei flessori: prossimale → ulnare (pisiforme, uncino) → distale → radiale (trapezio, scafoide)
  [-1.0, -0.8], [0.2, -0.8], [0.5, -0.86], [0.42, -1.0], [0.36, -1.15], [0.33, -1.4], [0.33, -1.68], [0.18, -1.86], [-0.08, -1.98],
  [-0.13, -2.2], [-0.12, -2.42], [-0.04, -2.6], [0.16, -2.7], [0.2, -2.84], [-0.1, -2.96], [-0.6, -3.0], [-1.1, -3.02], [-1.75, -2.96], [-2.1, -2.8],
  [-2.3, -2.62], [-2.5, -2.4], [-2.66, -2.15], [-2.72, -1.9], [-2.74, -1.5], [-2.76, -1.2], [-2.74, -1.0], [-2.68, -0.88], [-2.55, -0.8]];
// zone d'inserzione ossea del retinacolo dei flessori [x0, x1, y0, y1]: i margini che vi cadono poggiano sulla cresta
const INS_TCL = { scafoide: [[-2.95, -2.55, -1.08, -0.86]], trapezio: [[-2.92, -2.5, -2.18, -1.08]], pisiforme: [[0.2, 0.62, -1.9, -0.84]], uncino: [[-0.36, 0.5, -2.45, -1.84]] };
const VCL = [ // legamento carpale volare: ulnare (FCU, pisiforme) → distale → radiale (fusione con retinacolo e palmare lungo)
  [0.05, -0.92], [0.45, -0.9], [0.72, -1.08], [0.8, -1.45], [0.74, -1.85], [0.52, -2.14], [0.15, -2.3], [-0.3, -2.3],
  [-0.58, -2.12], [-0.6, -1.72], [-0.52, -1.3], [-0.38, -0.98]];
const MUSC_MANO = ['apb', 'op', 'fpb', 'adm', 'fdm', 'odm']; // tenari e ipotenari: originano dalla faccia volare del retinacolo
const SETTO_DIST = 0.04;   // distanza della lamina profonda dal tunnel del FCR (cm)
const SP = { tcl: 0.17, tclPross: 0.07, tclDist: 0.1, vcl: 0.06, setto: 0.04 }; // spessori (cm)
const H_VOL = 0.03;  // passo della griglia (cm)
const ORIGINALE = '4b64b75';   // revisione con muscoli e retinacolo degli estensori originali (punto di partenza)

/* ============ Utilità ============ */
const mix = (a, b, t) => a + (b - a) * t;
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
// spline chiusa di Catmull-Rom per i contorni in pianta
function contorno(P, n = 12) {
  const out = [], m = P.length;
  for (let i = 0; i < m; i++) {
    const p0 = P[(i - 1 + m) % m], p1 = P[i], p2 = P[(i + 1) % m], p3 = P[(i + 2) % m];
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(a => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3))); }
  }
  return out;
}
// distanza con segno da un poligono 2D, negativa dentro
function poligono(P, x, y) {
  let d = 1e9, s = 1;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i], ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay, h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * ex / ey) s = -s;
  }
  return s * d;
}

/* ============ Vasi e nervi: tubi letti dal sorgente della pagina ============ */
function tubi(id) {
  const riga = G.M.html.split('\n').find(l => l.startsWith(`{id:'${id}',`));
  if (!riga) throw new Error('tubo non trovato: ' + id);
  return [...riga.matchAll(/tube\(\[\[(.*?)\]\],([\d.]+)/g)].map(m => ({ pts: m[1].split('],[').map(s => s.split(',').map(Number)), r: +m[2] }));
}
// voxel entro r + extra dalla linea centrale dei tubi
function maschTubi(ids, extra = 0) {
  const M = new Uint8Array(G.N), { O, H, NX, NY, NZ } = G, NXY = NX * NY;
  for (const id of ids) for (const { pts, r } of tubi(id)) {
    const R = r + extra;
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.ceil(L / (H * 0.5)));
      for (let q = 0; q <= n; q++) {
        const c = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * q / n);
        const i0 = Math.max(0, Math.floor((c[0] - R - O[0]) / H)), i1 = Math.min(NX - 1, Math.ceil((c[0] + R - O[0]) / H));
        const j0 = Math.max(0, Math.floor((c[1] - R - O[1]) / H)), j1 = Math.min(NY - 1, Math.ceil((c[1] + R - O[1]) / H));
        const k0 = Math.max(0, Math.floor((c[2] - R - O[2]) / H)), k1 = Math.min(NZ - 1, Math.ceil((c[2] + R - O[2]) / H));
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = O[0] + (i + 0.5) * H - c[0], y = O[1] + (j + 0.5) * H - c[1], z = O[2] + (k + 0.5) * H - c[2];
          if (x * x + y * y + z * z <= R * R) M[i + NX * j + NXY * k] = 1;
        }
      }
    }
  }
  return M;
}
const dilata = (M, r) => { if (r <= 0) return M; const D = edt(M), A = new Uint8Array(G.N); for (let i = 0; i < G.N; i++) A[i] = D[i] <= r ? 1 : 0; return A; };

/* ============ Colonne della griglia (pianta x, y) ============ */
const zk = k => G.O[2] + (k + 0.5) * G.H;
// quota della faccia superiore del solido in ogni colonna (−∞ se vuota)
function cima(M) {
  const { NX, NY, NZ } = G, NXY = NX * NY, T = new Float32Array(NXY).fill(-Infinity);
  for (let c = 0; c < NXY; c++) for (let k = NZ - 1; k >= 0; k--) if (M[c + NXY * k]) { T[c] = zk(k) + G.H / 2; break; }
  return T;
}
// quota della faccia inferiore del primo voxel di M sopra la quota Z (+∞ se nessuno)
function sopra(M, Z) {
  const { NX, NY, NZ } = G, NXY = NX * NY, T = new Float32Array(NXY).fill(Infinity);
  for (let c = 0; c < NXY; c++) { const k0 = Math.max(0, Math.ceil((Z[c] - G.O[2]) / G.H)); for (let k = k0; k < NZ; k++) if (M[c + NXY * k]) { T[c] = zk(k) - G.H / 2; break; } }
  return T;
}
// campionamento bilineare di un campo 2D sulla pianta della griglia in cui è stato calcolato (A.g) o di quella corrente
const conG = A => (A.g = { O: G.O.slice(), H: G.H, NX: G.NX, NY: G.NY }, A);
function piano(A, x, y) {
  const { O, H, NX, NY } = A.g || G; let fx = clamp((x - O[0]) / H - 0.5, 0, NX - 1.001), fy = clamp((y - O[1]) / H - 0.5, 0, NY - 1.001);
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, c = i + NX * j;
  return (A[c] * (1 - u) + A[c + 1] * u) * (1 - v) + (A[c + NX] * (1 - u) + A[c + NX + 1] * u) * v;
}
// contorno → distanza con segno su tutte le colonne
function impronta(P) {
  const { O, H, NX, NY } = G, E = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) E[i + NX * j] = poligono(P, O[0] + (i + 0.5) * H, O[1] + (j + 0.5) * H);
  return E;
}

/* ============ Telo teso (membrana con ostacoli) ============ */
/* z = media dei vicini − p·h²/4, poi z ∈ [L, U]; sovrarilassamento (SOR). Solo nelle colonne di dom; i vicini fuori
   dal dominio non contano (margine libero). Dove L > U il telo resta a metà (lo spessore si riduce dopo). */
function telo(dom, L, U, z0, p, iter = 4000, w = 1.85, dim = G) {
  const { NX, NY, H } = dim, Z = Float32Array.from(z0), ph = p * H * H;
  for (let it = 0; it < iter; it++) {
    for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
      const c = i + NX * j; if (!dom[c]) continue;
      let s = 0, n = 0;
      for (const d of [1, -1, NX, -NX]) if (dom[c + d]) { s += Z[c + d]; n++; }
      if (!n) continue;
      let z = Z[c] + w * ((s - ph * n / 4) / n - Z[c]);
      const lo = L[c], hi = U[c];
      z = lo <= hi ? clamp(z, lo, hi) : (lo + hi) / 2;
      Z[c] = z;
    }
  }
  return Z;
}
// smussatura leggera di un campo 2D nel dominio (passate di media 3×3), rispettando l'ostacolo inferiore
function liscia(Z, dom, L, passate, dim = G, fisso = null, toll = 0, U = null) {
  const { NX, NY } = dim;
  for (let p = 0; p < passate; p++) { const Q = Z.slice();
    for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) { const c = i + NX * j; if (!dom[c] || (fisso && fisso[c])) continue; let s = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const q = c + a + NX * b; if (dom[q]) { s += Z[q]; n++; } } Q[c] = Math.max(L[c] - toll, s / n); if (U && L[c] <= U[c]) Q[c] = Math.min(Q[c], U[c]); }
    Z.set(Q); }
  return Z;
}

/* ============ Mesh da campo implicito ============ */
function mesh(V, fd, nome, conFibre = true) {
  const m = nets(V, fd); if (!conFibre) m.fdir = null;
  if (!man.meshes.some(x => x.n === nome)) man.meshes.push({ n: nome });
  setMesh(nome, m); log(nome, m.pos.length / 3, 'vertici'); return m;
}
const voxel = id => [G.O[0] + (id % G.NX + 0.5) * G.H, G.O[1] + (((id / G.NX) | 0) % G.NY + 0.5) * G.H, G.O[2] + (((id / (G.NX * G.NY)) | 0) + 0.5) * G.H];

/* ============ Lamina tesa in pianta ============ */
/* o = { P: contorno, sp: (x, y) => spessore, appoggi: [cime per colonna] (il telo resta sopra), altri: maschera delle
   strutture che il telo non attraversa (sopra o sotto a seconda della prima soluzione), sopra: strutture sempre sopra
   il telo (vasi e nervi), soloSopra: strutture sopra il telo di cui si ignorano le parti più profonde (muscoli, adattati dopo), ancore: [{ zona(x, y), cima }]
   (margini inseriti: la faccia profonda entra appena nella cima), p: pressione verso il piano profondo } */
function lamina(o) {
  const { NX, NY, NZ } = G, NXY = NX * NY, H = G.H;
  const xc = c => G.O[0] + (c % NX + 0.5) * H, yc = c => G.O[1] + (((c / NX) | 0) + 0.5) * H;
  const E = impronta(contorno(o.P)), dom = new Uint8Array(NXY), T = new Float32Array(NXY), L = new Float32Array(NXY), U = new Float32Array(NXY).fill(Infinity);
  for (let c = 0; c < NXY; c++) {
    dom[c] = E[c] < 2.5 * H ? 1 : 0; T[c] = o.sp(xc(c), yc(c));
    L[c] = Math.max(...o.appoggi.map(t => t[c])) + T[c] / 2; if (!isFinite(L[c])) L[c] = -5;
  }
  const z0 = new Float32Array(NXY); for (let c = 0; c < NXY; c++) z0[c] = L[c] > -5 ? L[c] + 0.15 : 1.2;
  const L0 = L.slice();
  let Z = telo(dom, L, U, z0, o.p, 2500);
  // strutture "altre": sotto il telo spingono in su, sopra lo tengono giù
  const sotto = new Float32Array(NXY).fill(-Infinity), sopra = new Float32Array(NXY).fill(Infinity);
  for (let c = 0; c < NXY; c++) { if (!dom[c]) continue; for (let k = 0; k < NZ; k++) {
    const i = c + NXY * k, z = zk(k);
    if (o.altri[i]) { if (z < Z[c]) sotto[c] = Math.max(sotto[c], z + H / 2); else sopra[c] = Math.min(sopra[c], z - H / 2); }
    else if (o.soloSopra && o.soloSopra[i] && z > Z[c] - T[c] / 2) sopra[c] = Math.min(sopra[c], z - H / 2); // le parti più profonde si adattano dopo
    if (o.sopra && o.sopra[i] && z > L0[c] - T[c] / 2) sopra[c] = Math.min(sopra[c], z - H / 2);           // vasi e nervi: sempre sopra il telo
  } }
  for (let c = 0; c < NXY; c++) { L[c] = Math.max(L[c], sotto[c] + 0.02 + T[c] / 2); U[c] = sopra[c] - 0.02 - T[c] / 2; }
  // ancore: nelle colonne vicine al margine, sopra la cima ossea, il telo è fissato sull'osso
  let fissi = 0;
  for (let c = 0; c < NXY; c++) { if (!dom[c] || E[c] < -(o.striscia ?? 0.11) || E[c] > 0.04) continue;
    for (const a of o.ancore) { const w = a.zona(xc(c), yc(c)); if (!w || !(a.cima[c] > (a.min ?? 0.3))) continue;
      const z = Math.min(Math.max(a.cima[c] + T[c] / 2 - (a.affonda ?? 0.03), L[c]), U[c]);   // l'inserzione non entra in vasi, nervi o tendini
      L[c] = Math.max(L[c], z - 0.3 * (1 - w)); U[c] = Math.min(U[c], z + 0.6 * (1 - w)); fissi++; } }        // ai bordi della zona il vincolo si allenta (niente gradini)
  Z = telo(dom, L, U, Z, o.p, 3000);
  Z = liscia(Z, dom, L, o.liscia ?? 2, G, null, o.toll ?? 0, U);   // tolleranza: toglie la gradinatura dei voxel sotto il telo
  // dove le strutture sopra e sotto lasciano meno dello spessore il telo si assottiglia (mai sotto 0,045 cm) e resta sotto quelle superiori
  let stretti = 0;
  for (let c = 0; c < NXY; c++) { if (!dom[c] || L[c] <= U[c]) continue; const giu = L[c] - T[c] / 2, su = U[c] + T[c] / 2;
    T[c] = Math.max(0.045, su - giu); Z[c] = su - T[c] / 2; if (E[c] < 0) stretti++; }   // se manca spazio cede la struttura sotto (guaina), non quella sopra (nervo, vaso, muscolo)
  const Gz = new Float32Array(NXY);
  for (let c = NX; c < NXY - NX; c++) if (dom[c]) Gz[c] = Math.min(3, Math.hypot((Z[c + 1] - Z[c - 1]) / (2 * H), (Z[c + NX] - Z[c - NX]) / (2 * H)));
  log('  ancorate', fissi, 'colonne; strette', stretti);
  return { E: conG(E), Z: conG(Z), T: conG(T), Gz: conG(Gz), dom };
}
// zone d'inserzione: peso 1 all'interno, che cala a 0 negli ultimi `m` cm verso i lati del rettangolo (0 fuori)
const inZone = (R, m = 0.1) => (x, y) => Math.max(0, ...R.map(([x0, x1, y0, y1]) => sstep(0, m, Math.min(x - x0, x1 - x, y - y0, y1 - y))));
const fibreX = ({ Z }) => p => { const e = 0.05; return [1, 0, (piano(Z, p[0] + e, p[1]) - piano(Z, p[0] - e, p[1])) / (2 * e)]; };

/* ============ Lastra: mesh parametrica di una lamina ============ */
/* Contorno ricampionato a passo costante e "stellato" rispetto al centro c: punti interni c + ρ·(B − c). Faccia
   superficiale e profonda a ±spessore/2 lungo la normale della superficie media, margine arrotondato (semicerchio).
   Lo spessore si riduce verso il margine (bordo sottile ma pieno). fd(p) = direzione delle fibre. */
function lastra(lam, P, c, fd, { passo = 0.035, nr = 26, bordo = 5, assott = 0.14 } = {}) {
  const B0 = contorno(P, 24), Ls = [0]; for (let i = 1; i <= B0.length; i++) Ls.push(Ls[i - 1] + Math.hypot(...[0, 1].map(a => B0[i % B0.length][a] - B0[i - 1][a])));
  const nt = Math.round(Ls[B0.length] / passo), B = [];
  for (let i = 0, j = 0; i < nt; i++) { const s = Ls[B0.length] * i / nt; while (Ls[j + 1] < s) j++; const u = (s - Ls[j]) / (Ls[j + 1] - Ls[j]), a = B0[j], b = B0[(j + 1) % B0.length]; B.push([mix(a[0], b[0], u), mix(a[1], b[1], u)]); }
  const zf = (x, y) => piano(lam.Z, x, y), tf = (x, y) => piano(lam.T, x, y);
  const nrm3 = (x, y) => { const e = 0.07, zx = (zf(x + e, y) - zf(x - e, y)) / (2 * e), zy = (zf(x, y + e) - zf(x, y - e)) / (2 * e), l = Math.hypot(zx, zy, 1); return [-zx / l, -zy / l, 1 / l]; };
  const pos = [], fdl = [], idx = [];
  const vtx = (p, x, y) => { pos.push(...p); const d = fd([x, y, p[2]]), l = Math.hypot(...d) || 1; fdl.push(...d.map(v => v / l)); return pos.length / 3 - 1; };
  const R = k => 1 - (1 - k / nr) ** 1.35;                                 // anelli più fitti verso il margine
  const facce = [[], []], cen = [];
  for (const sg of [1, -1]) {
    const x0 = c[0], y0 = c[1], n = nrm3(x0, y0), t = tf(x0, y0) / 2 * sg, z = zf(x0, y0);
    cen.push(vtx([x0 + n[0] * t, y0 + n[1] * t, z + n[2] * t], x0, y0));
  }
  for (let k = 1; k <= nr; k++) for (let si = 0; si < 2; si++) {
    const sg = si ? -1 : 1, ring = [];
    for (let i = 0; i < nt; i++) {
      const r = R(k), x = c[0] + r * (B[i][0] - c[0]), y = c[1] + r * (B[i][1] - c[1]), dm = (1 - r) * Math.hypot(B[i][0] - c[0], B[i][1] - c[1]);
      const t = tf(x, y) * (0.5 + 0.5 * sstep(0, assott, dm)) / 2 * sg, n = nrm3(x, y), z = zf(x, y);
      ring.push(vtx([x + n[0] * t, y + n[1] * t, z + n[2] * t], x, y));
    }
    facce[si].push(ring);
  }
  // margine: semicerchio dalla faccia superficiale a quella profonda, verso l'esterno
  const rim = [facce[0][nr - 1]];
  for (let m = 1; m < bordo; m++) { const a = Math.PI * m / bordo, ring = [];
    for (let i = 0; i < nt; i++) {
      const x = B[i][0], y = B[i][1], z = zf(x, y), n = nrm3(x, y), t = tf(x, y) * 0.5 / 2;
      const tg = [B[(i + 1) % nt][0] - B[(i - 1 + nt) % nt][0], B[(i + 1) % nt][1] - B[(i - 1 + nt) % nt][1]];
      let o = [tg[1], -tg[0]]; if (o[0] * (x - c[0]) + o[1] * (y - c[1]) < 0) o = [-o[0], -o[1]];
      const ol = Math.hypot(...o), o3 = [o[0] / ol, o[1] / ol, -(n[0] * o[0] + n[1] * o[1]) / (n[2] * ol)], l3 = Math.hypot(...o3);
      const ca = Math.cos(a) * t, sa = Math.sin(a) * t * 0.8;
      ring.push(vtx([x + n[0] * ca + o3[0] / l3 * sa, y + n[1] * ca + o3[1] / l3 * sa, z + n[2] * ca + o3[2] / l3 * sa], x, y));
    }
    rim.push(ring); }
  rim.push(facce[1][nr - 1]);
  const quad = (a, b, cc, d) => idx.push(a, b, cc, a, cc, d);
  for (let si = 0; si < 2; si++) { const F = facce[si];
    for (let i = 0; i < nt; i++) idx.push(cen[si], F[0][i], F[0][(i + 1) % nt]);
    for (let k = 0; k < nr - 1; k++) for (let i = 0; i < nt; i++) quad(F[k][i], F[k + 1][i], F[k + 1][(i + 1) % nt], F[k][(i + 1) % nt]); }
  for (let m = 0; m < rim.length - 1; m++) for (let i = 0; i < nt; i++) quad(rim[m][i], rim[m + 1][i], rim[m + 1][(i + 1) % nt], rim[m][(i + 1) % nt]);
  orienta(pos, idx);
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: Int8Array.from(fdl.map(v => Math.round(v * 127))) };
}
// orientamento coerente (propagazione sulle facce adiacenti) e verso l'esterno (volume con segno positivo)
function orienta(pos, idx) {
  const nT = idx.length / 3, ed = new Map(), key = (a, b) => a < b ? a * 4294967296 + b : b * 4294967296 + a;
  for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) { const k = key(idx[3 * t + e], idx[3 * t + (e + 1) % 3]); (ed.get(k) || ed.set(k, []).get(k)).push(t); }
  const fatto = new Uint8Array(nT);
  for (let s = 0; s < nT; s++) { if (fatto[s]) continue; fatto[s] = 1; const coda = [s];
    while (coda.length) { const t = coda.pop();
      for (let e = 0; e < 3; e++) { const a = idx[3 * t + e], b = idx[3 * t + (e + 1) % 3];
        for (const u of ed.get(key(a, b))) { if (fatto[u]) continue; fatto[u] = 1;
          let concorde = false; for (let f = 0; f < 3; f++) if (idx[3 * u + f] === a && idx[3 * u + (f + 1) % 3] === b) concorde = true;
          if (concorde) { const x = idx[3 * u + 1]; idx[3 * u + 1] = idx[3 * u + 2]; idx[3 * u + 2] = x; }
          coda.push(u); } } } }
  let vol = 0; for (let t = 0; t < nT; t++) { const [a, b, c] = [0, 1, 2].map(f => idx[3 * t + f] * 3);
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]); }
  if (vol < 0) for (let t = 0; t < nT; t++) { const x = idx[3 * t + 1]; idx[3 * t + 1] = idx[3 * t + 2]; idx[3 * t + 2] = x; }
}
// unione di più mesh in una
function unisci(...M) {
  const pos = [], idx = [], fd = []; let o = 0;
  for (const m of M) { pos.push(...m.pos); fd.push(...m.fdir); for (const i of m.idx) idx.push(i + o); o += m.pos.length / 3; }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: Int8Array.from(fd) };
}
const salva = (nome, m) => { if (!man.meshes.some(x => x.n === nome)) man.meshes.push({ n: nome }); setMesh(nome, m); log(nome, m.pos.length / 3, 'vertici'); };

/* ============ Lato volare: retinacolo dei flessori, legamento carpale volare, spazi ============ */
function volari() {
  for (const m of MUSC_MANO) G.setPos(m, G.posDaRevisione(ORIGINALE, m, 'modelli/polso-dito-3d.html')); // si riparte dai muscoli originali
  griglia([-3.7, -3.4, -0.5], [1.5, -0.4, 2.5], H_VOL, 0);
  const { NX, NY, NZ } = G, NXY = NX * NY;
  log('griglia', NX, NY, NZ);
  const ossa = unione(CARPO), legPis = unione(['pisham', 'pismc']), cont = or(unione(CONTENUTO), maschTubi(['nmed'])), fcr = unione(FCR);
  const guy = maschTubi(GUYON), fcu = unione(['fcu']);
  const tB = cima(ossa), tP = cima(legPis), tF = cima(fcu), ossoPis = Float32Array.from(tB, (v, c) => Math.max(v, tP[c]));
  const muscoli = unione(MUSC_MANO);

  // --- retinacolo dei flessori: pieno sulle ossa, sottile nella porzione prossimale (fascia) e distale (aponeurosi)
  log('retinacolo dei flessori');
  const spT = (x, y) => SP.tcl * (1 - sstep(-1.25, -0.82, y)) * (1 - sstep(-2.45, -2.95, y)) + SP.tclPross * sstep(-1.25, -0.82, y) + SP.tclDist * sstep(-2.45, -2.95, y);
  const tcl = lamina({
    P: TCL, sp: spT, p: 0.08, liscia: 14, toll: 0.02,
    appoggi: [Float32Array.from(tB, v => v - 0.03), Float32Array.from(tP, v => v - 0.03), cima(dilata(or(cont, fcr), 0.03))],
    altri: maschTubi(['npalm', 'nmedmot', 'nulnprof', 'aulnprof']), soloSopra: muscoli, sopra: maschTubi(['nuln', 'auln', 'nulnsup', 'aradsup']), // il palmare lungo si fonde con la faccia superficiale
    // il ramo palmare superficiale della radiale corre sul margine radiale, superficiale al retinacolo (nei tenari)
    ancore: [{ zona: inZone(INS_TCL.scafoide), cima: tB, min: 0.35 }, { zona: inZone(INS_TCL.trapezio), cima: tB, min: 0.85 },
      { zona: inZone(INS_TCL.pisiforme), cima: ossoPis, min: 1.0 }, { zona: inZone(INS_TCL.uncino), cima: ossoPis, min: 0.7 }],
  });
  adattaMuscoli(tcl, MUSC_MANO);
  const topT = conG(new Float32Array(NXY).fill(-Infinity)); for (let c = 0; c < NXY; c++) if (tcl.dom[c] && tcl.E[c] < 0) topT[c] = tcl.Z[c] + tcl.T[c] / 2;

  // --- legamento carpale volare: dal pisiforme e dal FCU, sopra nervo e arteria ulnari, fuso con il retinacolo dei flessori
  log('legamento carpale volare');
  const cuteS = solid('cute', true), tADM = cima(unione(['adm'])); // ulnarmente su pisiforme, FCU e origine dell'ADM
  const vcl = lamina({
    P: VCL, sp: () => SP.vcl, p: 5, liscia: 6,
    appoggi: [topT, Float32Array.from(tB, v => v - 0.03), tP, cima(dilata(guy, 0.05)), Float32Array.from(tADM, v => v + 0.01)],
    altri: dilata(cuteS, 0.08),
    ancore: [{ zona: x => x > 0.35, cima: Float32Array.from(tB, (v, c) => Math.max(v, tF[c], tADM[c])), affonda: 0.01 }, { zona: x => x < -0.25, cima: topT }],
  });
  salva('tettoguy', lastra(vcl, VCL, [0.1, -1.6], fibreX(vcl), { passo: 0.04, nr: 14, assott: 0.22 }));

  // --- spazi: tunnel carpale (tra pavimento osseo chiuso e faccia profonda del retinacolo, senza il tunnel del FCR)
  log('spazi');
  const pavG = conG(Float32Array.from(topT, (v, c) => Math.max(v, tB[c], tP[c])));
  griglia([-3.3, -3.2, -0.5], [1.2, -0.6, 2.3], 0.055, 0);
  const ossa2 = unione(CARPO), cont2 = or(unione(CONTENUTO), maschTubi(['nmed'])), fcr2 = unione(FCR), dA2 = edt(fcr2), dB2 = edt(cont2), N2 = G.NX * G.NY;
  const V2 = new Float32Array(G.N);
  const { Do } = sdf(ossa2), Fo = G.chiuso(Do, 0.25), chiusi = new Uint8Array(G.N); for (let i = 0; i < G.N; i++) chiusi[i] = Fo[i] <= 0 ? 1 : 0;
  const pav = conG(cima(chiusi)), Fos = sdf(ossa2).F;
  for (let id = 0; id < G.N; id++) {
    const p = voxel(id), e = piano(tcl.E, p[0], p[1]);
    let f = Math.max(p[2] - (piano(tcl.Z, p[0], p[1]) - piano(tcl.T, p[0], p[1]) / 2) + 0.015, piano(pav, p[0], p[1]) - p[2] + 0.01, e + 0.08, 0.01 - Fos[id]);
    if (dA2[id] < 0.4) f = Math.max(f, (dB2[id] - dA2[id]) * (1 - sstep(0.25, 0.4, dA2[id])));
    V2[id] = f;
  }
  mesh(sfoca(V2, 2), () => [0, 1, 0], 'lumtc', false);
  // canale di Guyon: tra pavimento (retinacolo dei flessori, piso-uncinato, ossa) e legamento carpale volare
  for (let id = 0; id < G.N; id++) {
    const p = voxel(id);
    V2[id] = Math.max(p[2] - (piano(vcl.Z, p[0], p[1]) - piano(vcl.T, p[0], p[1]) / 2) + 0.012, piano(pavG, p[0], p[1]) - p[2] + 0.012, piano(vcl.E, p[0], p[1]) + 0.06, 0.01 - Fos[id]);
  }
  mesh(sfoca(V2, 2), () => [0, 1, 0], 'lumguy', false);

  // --- lamina profonda: setto tra il tunnel del FCR e il tunnel carpale, dalla faccia profonda del retinacolo all'osso
  griglia([-2.95, -2.5, 0.3], [-1.2, -0.9, 1.95], 0.03, 0);
  const dA = edt(unione(FCR)), dB = edt(or(unione(CONTENUTO), maschTubi(['nmed']))), V3 = new Float32Array(G.N);
  for (let id = 0; id < G.N; id++) {
    const p = voxel(id); if (dA[id] > 0.7) { V3[id] = 1; continue; }
    // manicotto continuo attorno al tunnel del FCR (guaina e tendine), a distanza fissa SETTO_DIST dalla sua superficie:
    // non dipende dalla posizione del nervo (la lamina profonda separa sempre il FCR dal tunnel carpale)
    let w = Math.abs(dA[id] - SETTO_DIST) - SP.setto / 2;
    w = Math.max(w, 0.012 - dA[id], 0.012 - dB[id], p[2] - (piano(tcl.Z, p[0], p[1]) - piano(tcl.T, p[0], p[1]) / 2 + 0.02), piano(tcl.E, p[0], p[1]) + 0.05);
    V3[id] = smax(w, Math.max(p[1] + 1.0, -2.38 - p[1]), 0.03);                           // estremità nette (trapezio, da −1,0 a −2,38)
  }
  salva('retfl', unisci(lastra(tcl, TCL, [-1.15, -1.9], fibreX(tcl), { passo: 0.055, nr: 18 }), nets(V3, () => [0, 1, 0])));
}
const vid = p => { const { O, H, NX, NY } = G; return Math.floor((p[0] - O[0]) / H) + NX * Math.floor((p[1] - O[1]) / H) + NX * NY * Math.floor((p[2] - O[2]) / H); };

/* ============ Retinacolo degli estensori ============ */
/* Coordinate cilindriche attorno a un asse longitudinale (parallelo a y) al centro del polso: θ = 0° radiale, 90° dorsale,
   180° ulnare, oltre 180° volare-ulnare; r = distanza dall'asse. Fino a θ = `tieni` il retinacolo resta quello originale
   (superficie media, spessore e bordi letti dalla revisione ORIGINALE). Il tratto ulnare è un telo teso sopra la guaina
   dell'ECU, la testa e lo stiloide ulnari (senza inserirsi sull'ulna: non limita la prono-supinazione), fino al piramidale,
   al pisiforme e alla fascia del FCU (Taleisnik J et al., J Hand Surg Am 1984). */
const ER = {
  asse: [-1.3, -0.35], th: [-24, 228], dth: 0.8, y: [-1.9, 2.45], dy: 0.03,
  tieni: 140,
  // bordi del tratto ulnare: [θ, y prossimale, y distale]; a θ = tieni si raccordano con quelli originali
  bordi: [[140, 0.86, -0.98], [160, 0.6, -1.2], [180, 0.3, -1.38], [195, 0.0, -1.52], [208, -0.32, -1.62], [216, -0.6, -1.66]],
  fine: 219,                                   // estremità ulnare: pisiforme e fascia del FCU
  inserzione: [190, 225, -1.8, -0.7],          // zona d'inserzione ossea [θ0, θ1, y0, y1] (piramidale, pisiforme)
  sp: 0.115,
  dentro: ['radio', 'ulna', 'scafoide', 'semilunare', 'piramidale', 'pisiforme', 'trapezio', 'trapezoide', 'capitato', 'uncinato', 'mc1', 'mc2', 'mc3', 'mc4', 'mc5',
    'ecrl', 'ecrb', 'edc', 'edm', 'eip', 'epl', 'apl', 'epb', 'ecu', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'drc', 'dic', 'ucl', 'tfcc', 'fcu', 'pisham', 'pismc'],
  fuori: ['nulndors', 'vbas', 'vcef', 'nradsup'],
};
function estensori() {
  const D2R = Math.PI / 180, [XC, ZC] = ER.asse;
  const nT = Math.round((ER.th[1] - ER.th[0]) / ER.dth) + 1, nY = Math.round((ER.y[1] - ER.y[0]) / ER.dy) + 1, dim = { NX: nT, NY: nY, H: ER.dy };
  const thI = i => ER.th[0] + i * ER.dth, yJ = j => ER.y[0] + j * ER.dy, n2 = nT * nY;
  const punto = (th, y, r) => [XC - r * Math.cos(th * D2R), y, ZC - r * Math.sin(th * D2R)];
  // --- retinacolo originale: raggi dall'asse, intersezioni con le sezioni a y costante
  const old = G.realDaRevisione(ORIGINALE, 'retext', 'modelli/polso-dito-3d.html');
  const rOld = new Float32Array(n2).fill(NaN), tOld = new Float32Array(n2).fill(NaN);
  for (let j = 0; j < nY; j++) {
    const y = yJ(j), seg = [], P = old.pos, I = old.idx;
    for (let t = 0; t < I.length; t += 3) { const q = [0, 1, 2].map(k => [P[3 * I[t + k]], P[3 * I[t + k] + 1], P[3 * I[t + k] + 2]]), sv = q.map(p => p[1] - y);
      if (Math.min(...sv) >= 0 || Math.max(...sv) <= 0) continue; const e = [];
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) if ((sv[a] < 0) !== (sv[b] < 0)) { const u = sv[a] / (sv[a] - sv[b]); e.push([q[a][0] + (q[b][0] - q[a][0]) * u, q[a][2] + (q[b][2] - q[a][2]) * u]); }
      if (e.length === 2) seg.push(e); }
    for (let i = 0; i < nT; i++) {
      const dx = -Math.cos(thI(i) * D2R), dz = -Math.sin(thI(i) * D2R), h = [];
      for (const [a, b] of seg) { const ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-12) continue;
        const r = ((a[0] - XC) * ez - (a[1] - ZC) * ex) / den, u = ((a[0] - XC) * dz - (a[1] - ZC) * dx) / den; if (r > 0 && u >= 0 && u <= 1) h.push(r); }
      h.sort((p, q) => p - q);
      if (h.length === 2 && h[1] - h[0] < 0.2 && h[1] - h[0] > 0.06) { rOld[i + nT * j] = (h[0] + h[1]) / 2; tOld[i + nT * j] = h[1] - h[0]; }
    }
  }
  // bordi originali (per colonna θ) smussati lungo θ
  const yHi0 = new Float32Array(nT).fill(NaN), yLo0 = new Float32Array(nT).fill(NaN);
  for (let i = 0; i < nT; i++) for (let j = 0; j < nY; j++) if (!isNaN(rOld[i + nT * j])) { yLo0[i] = isNaN(yLo0[i]) ? yJ(j) : yLo0[i]; yHi0[i] = yJ(j); }
  const media = (A, w) => Float32Array.from(A, (v, i) => { let s = 0, n = 0; for (let k = -w; k <= w; k++) { const q = A[i + k]; if (q === q && q !== undefined) { s += q; n++; } } return n ? s / n : NaN; });
  const yHiO = media(media(yHi0, 6), 6), yLoO = media(media(yLo0, 6), 6);
  // superficie e spessore originali appena smussati (la mesh originale ha facce grandi): media 3×3 sulle celle valide
  for (const A of [rOld, tOld]) for (let p = 0; p < 5; p++) { const Q = A.slice();
    for (let j = 1; j < nY - 1; j++) for (let i = 1; i < nT - 1; i++) { const c = i + nT * j; if (isNaN(A[c])) continue; let s = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const v = A[c + a + nT * b]; if (!isNaN(v)) { s += v; n++; } } Q[c] = s / n; }
    A.set(Q); }
  let th0 = ER.th[1]; for (let i = 0; i < nT; i++) if (!isNaN(yHi0[i]) && yHi0[i] - yLo0[i] > 0.6) { th0 = thI(i); break; }
  const iT = th => clamp(Math.round((th - ER.th[0]) / ER.dth), 0, nT - 1);
  const tab = (th, k) => { const B = ER.bordi; if (th <= B[0][0]) return B[0][k]; for (let q = 1; q < B.length; q++) if (th <= B[q][0]) return mix(B[q - 1][k], B[q][k], (th - B[q - 1][0]) / (B[q][0] - B[q - 1][0])); return B[B.length - 1][k]; };
  const raccordo = th => 1 - sstep(ER.tieni, ER.tieni + 25, th);
  const yHi = th => th <= ER.tieni ? yHiO[iT(th)] : tab(th, 1) + (yHiO[iT(ER.tieni)] - tab(ER.tieni, 1)) * raccordo(th);
  const yLo = th => th <= ER.tieni ? yLoO[iT(th)] : tab(th, 2) + (yLoO[iT(ER.tieni)] - tab(ER.tieni, 2)) * raccordo(th);
  log('  originale da θ =', th0, '°; bordi a θ =', ER.tieni, '°:', yHi(ER.tieni).toFixed(2), yLo(ER.tieni).toFixed(2));
  // --- ostacoli lungo i raggi: cima delle strutture contenute, prima struttura superficiale (cute, vasi e nervi sottocutanei)
  griglia([-4.7, -2.0, -2.8], [2.1, 2.6, 1.9], 0.03, 0);
  const dentro = unione(ER.dentro), osso = unione(ER.dentro.slice(0, 15)), fuori = or(solid('cute', true), maschTubi(ER.fuori));
  const fcuM = unione(['fcu']), ten = unione(ER.dentro.filter(n => !/^g\d$/.test(n))), rTen = new Float32Array(n2).fill(0), rIn = new Float32Array(n2).fill(0), rOs = new Float32Array(n2).fill(0), rF = new Float32Array(n2).fill(0);
  const vx = p => { const { O, H, NX, NY, NZ } = G, i = Math.floor((p[0] - O[0]) / H), j = Math.floor((p[1] - O[1]) / H), k = Math.floor((p[2] - O[2]) / H); return i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ ? -1 : i + NX * j + NX * NY * k; };
  for (let j = 0; j < nY; j++) for (let i = 0; i < nT; i++) { const c = i + nT * j;
    for (let r = 0.3; r < 3.8; r += 0.015) { const id = vx(punto(thI(i), yJ(j), r)); if (id < 0) continue; if (dentro[id]) rIn[c] = r; if (ten[id]) rTen[c] = r; if (osso[id]) rOs[c] = r; if (fcuM[id]) rF[c] = r; } }
  // --- impronta, spessore, ancore
  const dom = new Uint8Array(n2), fisso = new Uint8Array(n2), T = new Float32Array(n2), L = new Float32Array(n2), U = new Float32Array(n2).fill(Infinity), Z0 = new Float32Array(n2);
  for (let j = 0; j < nY; j++) for (let i = 0; i < nT; i++) { const c = i + nT * j, th = thI(i), y = yJ(j);
    dom[c] = th >= th0 - 2 && th <= ER.fine + 2 && y >= yLo(th) - 0.08 && y <= yHi(th) + 0.08 ? 1 : 0;
    const vecchio = th <= ER.tieni && !isNaN(rOld[c]), w = sstep(ER.tieni - 30, ER.tieni, th);   // raccordo: dal vincolo pieno alla membrana libera
    T[c] = vecchio ? mix(tOld[c], ER.sp, w) : ER.sp; L[c] = rIn[c] + 0.02 + T[c] / 2; Z0[c] = vecchio ? rOld[c] : L[c] + 0.1;
    const interno = vecchio && j > 1 && j < nY - 2 && [-2, -1, 1, 2].every(d => !isNaN(rOld[c + d * nT]));      // lontano dai bordi
    // dove una guaina o un tendine sporge oltre il retinacolo originale (la superficie originale è più bassa di quanto serve) la cella non è bloccata: si alza di quel che basta
    const manca = L[c] - rOld[c] > 0.005;
    if (vecchio) { if (w <= 0 && interno && manca) { U[c] = L[c] + 0.35; } else if (w <= 0 && interno) { L[c] = U[c] = rOld[c]; fisso[c] = 1; } else { const m = Math.max(w * 0.25, interno ? 0 : 0.03); L[c] = Math.max(L[c], rOld[c] - m); U[c] = rOld[c] + m; } }
    const [a0, a1, b0, b1] = ER.inserzione;
    if (th >= a0 && th <= a1 && y >= b0 && y <= b1 && rOs[c] > 1) { L[c] = U[c] = Math.max(rOs[c], rF[c]) + T[c] / 2 - 0.03; } // su pisiforme e piramidale; dove c'è il FCU, sulla sua fascia
  }
  // spessore: nel tratto originale si tiene, poi raccordato
  const Ts = liscia(Float32Array.from(T), dom, new Float32Array(n2), 6, dim);
  let Z = telo(dom, L, U, Z0, 0.4, 1500, 1.85, dim);
  for (let j = 0; j < nY; j++) for (let i = 0; i < nT; i++) { const c = i + nT * j; if (!dom[c] || fisso[c]) continue;
    for (let r = Z[c] - T[c] / 2; r < 3.8; r += 0.015) { const id = vx(punto(thI(i), yJ(j), r)); if (id >= 0 && fuori[id]) { U[c] = Math.max(L[c], r - 0.03 - T[c] / 2); break; } } }
  Z = telo(dom, L, U, Z, 0.4, 3000, 1.85, dim);
  Z = liscia(Z, dom, L, 4, dim, fisso);
  // sotto le vene e i nervi sottocutanei il retinacolo si assottiglia dall'esterno (anche nel tratto originale)
  let sottili = 0;
  for (let j = 0; j < nY; j++) for (let i = 0; i < nT; i++) { const c = i + nT * j; if (!dom[c]) continue;
    const t = Ts[c], dentroR = Z[c] - t / 2;
    for (let r = dentroR; r < Z[c] + t / 2 + 0.03; r += 0.01) { const id = vx(punto(thI(i), yJ(j), r)); if (id >= 0 && fuori[id]) {
      const su = r - 0.025, tn = Math.max(0.045, su - dentroR); Ts[c] = tn;           // se non basta, la faccia profonda scende nella guaina, non nel tendine
      Z[c] = Math.max(su - tn / 2, Math.min(dentroR, rTen[c] + 0.01) + tn / 2); sottili++; break; } } }
  log('  assottigliato sotto vene e nervi sottocutanei in', sottili, 'celle');
  const Rf = (th, y) => { const fi = clamp((th - ER.th[0]) / ER.dth, 0, nT - 1.001), fj = clamp((y - ER.y[0]) / ER.dy, 0, nY - 1.001), i = fi | 0, j = fj | 0, u = fi - i, v = fj - j, c = i + nT * j;
    return [(Z[c] * (1 - u) + Z[c + 1] * u) * (1 - v) + (Z[c + nT] * (1 - u) + Z[c + nT + 1] * u) * v, (Ts[c] * (1 - u) + Ts[c + 1] * u) * (1 - v) + (Ts[c + nT] * (1 - u) + Ts[c + nT + 1] * u) * v]; };
  const sup = (th, y) => {
    const [r, t] = Rf(th, y), p = punto(th, y, r), e = 0.4;
    const a = punto(th + e, y, Rf(th + e, y)[0]), b = punto(th - e, y, Rf(th - e, y)[0]), cc = punto(th, y + 0.03, Rf(th, y + 0.03)[0]), d = punto(th, y - 0.03, Rf(th, y - 0.03)[0]);
    const pt = [0, 1, 2].map(k => a[k] - b[k]), py = [0, 1, 2].map(k => cc[k] - d[k]);
    let n = [pt[1] * py[2] - pt[2] * py[1], pt[2] * py[0] - pt[0] * py[2], pt[0] * py[1] - pt[1] * py[0]]; const l = Math.hypot(...n) || 1; n = n.map(v => v / l);
    const rad = [p[0] - XC, 0, p[2] - ZC]; if (n[0] * rad[0] + n[2] * rad[2] < 0) n = n.map(v => -v);
    const lt = Math.hypot(...pt) || 1, ly = Math.hypot(...py) || 1;
    return { p, n, t, f: pt.map(v => v / lt), dy: py.map(v => v / ly) };
  };
  salva('retext', striscia(sup, th0, ER.fine, yLo, yHi, { R0: 2.0, testa: 0.22, passo: 0.05, nv: 18 }));
}
/* Striscia: mesh di una lamina parametrizzata su (θ, y) tra due bordi yLo(θ), yHi(θ): facce a ±spessore/2 lungo la normale,
   bordi arrotondati, estremità arrotondate (la larghezza si chiude a quarto di ellisse negli ultimi `testa` cm). */
function striscia(sup, th0, th1, yLo, yHi, { R0 = 2, passo = 0.04, nv = 26, bordo = 5, assott = 0.14, testa = 0.3 } = {}) {
  const lung = (th1 - th0) * Math.PI / 180 * R0, ncol = Math.max(8, Math.round(lung / passo)), pos = [], fdl = [], idx = [], anelli = [];
  const vtx = (p, f) => { pos.push(...p); fdl.push(...f); return pos.length / 3 - 1; };
  const V = j => 0.5 - 0.5 * Math.cos(Math.PI * j / nv);                 // righe più fitte verso i bordi
  for (let i = 0; i <= ncol; i++) {
    const th = mix(th0, th1, i / ncol), d = Math.min(i, ncol - i) / ncol * lung, k = Math.sqrt(Math.max(0.0025, 1 - (1 - Math.min(1, d / testa)) ** 2));
    const ym = (yLo(th) + yHi(th)) / 2, hw = (yHi(th) - yLo(th)) / 2 * k, ring = [], top = [], bot = [];
    for (let j = 0; j <= nv; j++) { const y = ym - hw + 2 * hw * V(j), s = sup(th, y), em = Math.min(y - (ym - hw), ym + hw - y, d);
      const t = s.t * (0.5 + 0.5 * sstep(0, assott, em)) * Math.max(k, 0.4) / 2;
      top.push(vtx(s.p.map((v, a) => v + s.n[a] * t), s.f)); bot.push(vtx(s.p.map((v, a) => v - s.n[a] * t), s.f)); }
    const arco = (y, sg) => { const s = sup(th, y), t = s.t * 0.5 * Math.max(k, 0.4) / 2, out = [];
      for (let m = 1; m < bordo; m++) { const a = Math.PI * m / bordo; out.push(vtx(s.p.map((v, q) => v + s.n[q] * t * Math.cos(a) * sg + s.dy[q] * t * 0.8 * Math.sin(a) * sg), s.f)); }
      return out; };
    ring.push(...top, ...arco(ym + hw, 1), ...bot.reverse(), ...arco(ym - hw, -1));
    anelli.push(ring);
  }
  const M = anelli[0].length;
  for (let i = 0; i < ncol; i++) for (let j = 0; j < M; j++) { const a = anelli[i][j], b = anelli[i + 1][j], c = anelli[i + 1][(j + 1) % M], d = anelli[i][(j + 1) % M]; idx.push(a, b, c, a, c, d); }
  for (const R of [anelli[0], anelli[ncol]]) { const m = [0, 1, 2].map(k => R.reduce((s, v) => s + pos[3 * v + k], 0) / M), ci = vtx(m, fdl.slice(3 * R[0], 3 * R[0] + 3)); for (let j = 0; j < M; j++) idx.push(ci, R[j], R[(j + 1) % M]); }
  orienta(pos, idx);
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), tag: null, fdir: Int8Array.from(fdl.map(v => Math.round(v * 127))) };
}

/* ============ Muscoli tenari e ipotenari: origine dalla faccia volare del retinacolo ============ */
/* Le parti dei muscoli che finiscono dentro il retinacolo o subito sotto (nel tunnel) vengono spostate lungo la normale
   della lamina fino alla sua faccia superficiale; lo spostamento si diffonde sulla mesh (niente pieghe). Riparte dalle
   posizioni della revisione ORIGINALE. Distalmente all'uncino (aponeurosi) si spostano solo le parti dentro la lamina. */
function adattaMuscoli(lam, nomi) {
  const zf = (x, y) => piano(lam.Z, x, y);
  for (const nome of nomi) {
    const { idx } = G.REAL(nome); let pos = G.posDaRevisione(ORIGINALE, nome, 'modelli/polso-dito-3d.html'), mx = 0, n0 = 0;
    const nv = pos.length / 3, nb = Array.from({ length: nv }, () => new Set()); for (let t = 0; t < idx.length; t += 3) { const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
    for (let passo = 0; passo < 2; passo++) {
    const req = new Float32Array(nv), N = new Float32Array(nv * 3); let n = 0;
    for (let i = 0; i < nv; i++) {
      const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], e = piano(lam.E, x, y); if (e > 0.09) continue;
      const g = [(zf(x + 0.03, y) - zf(x - 0.03, y)) / 0.06, (zf(x, y + 0.03) - zf(x, y - 0.03)) / 0.06], l = Math.hypot(g[0], g[1], 1);
      const sd = (z - zf(x, y)) / l, t = piano(lam.T, x, y) * (0.5 + 0.5 * sstep(0, 0.14, -e)) / 2 + 0.03;
      const profondo = y > -2.45 ? -0.45 : -t;                              // nell'aponeurosi distale i muscoli possono stare sotto
      if (sd < t && sd > profondo) { req[i] = t - sd; N[3 * i] = -g[0] / l; N[3 * i + 1] = -g[1] / l; N[3 * i + 2] = 1 / l; n++; }
    }
    if (!n) break; if (!passo) n0 = n;
    let D = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) if (req[i]) for (let k = 0; k < 3; k++) D[3 * i + k] = N[3 * i + k] * req[i];
    for (let it = 0; it < 40; it++) { const Q = D.slice();
      for (let i = 0; i < nv; i++) { let s0 = 0, s1 = 0, s2 = 0, n = 0; for (const j of nb[i]) { s0 += D[3 * j]; s1 += D[3 * j + 1]; s2 += D[3 * j + 2]; n++; }
        if (!n) continue; Q[3 * i] = (D[3 * i] + s0) / (n + 1); Q[3 * i + 1] = (D[3 * i + 1] + s1) / (n + 1); Q[3 * i + 2] = (D[3 * i + 2] + s2) / (n + 1);
        if (req[i]) { const d = Q[3 * i] * N[3 * i] + Q[3 * i + 1] * N[3 * i + 1] + Q[3 * i + 2] * N[3 * i + 2]; if (d < req[i]) for (let k = 0; k < 3; k++) Q[3 * i + k] += N[3 * i + k] * (req[i] - d); } }
      D = Q; }
    pos = Float32Array.from(pos, (v, k) => v + D[k]); for (let i = 0; i < nv; i++) mx = Math.max(mx, Math.hypot(D[3 * i], D[3 * i + 1], D[3 * i + 2]));
    }
    if (!n0) { log(nome, 'nessuna sovrapposizione'); continue; }
    G.setPos(nome, pos); log(nome, n0, 'vertici sulla faccia volare del retinacolo; spostamento massimo', mx.toFixed(2), 'cm');
  }
}

/* ============ Verifica: compenetrazioni ============ */
/* Per ogni coppia (A, B): vertici di A che stanno dentro B (oltre 0,2 mm) e profondità massima. Solo lettura. */
const TUBI = ['nmed', 'nmedmot', 'npalm', 'nuln', 'nulnsup', 'nulnprof', 'auln', 'aulnprof', 'aradsup', 'nulndors', 'vbas', 'vcef', 'nradsup', 'arad'];
const VERIFICA = {
  retfl: ['fds', 'fdp', 'fpl', 'fcr', 'gulnare', 'gfpl', 'gfcr', 'nmed', 'nuln', 'auln', 'nulnsup', 'nulnprof', 'aulnprof', 'npalm', 'nmedmot', 'apb', 'op', 'fpb', 'adm', 'fdm', 'odm', 'pisiforme', 'uncinato', 'trapezio', 'scafoide'],
  tettoguy: ['nuln', 'auln', 'nulnsup', 'nulnprof', 'aulnprof', 'fcu', 'adm', 'cute'],
  retext: ['ecu', 'g6', 'edm', 'g5', 'edc', 'g4', 'epl', 'g3', 'ecrl', 'ecrb', 'g2', 'apl', 'epb', 'g1', 'nulndors', 'vbas', 'vcef', 'nradsup', 'fcu', 'cute', 'ulna', 'radio'],
  apb: ['aradsup', 'nmedmot', 'op', 'fpb'], op: ['aradsup', 'fpb', 'apb'], fpb: ['nmed', 'fpl', 'fcr'], fdm: ['nulnprof', 'aulnprof', 'adm'], odm: ['nulnprof', 'aulnprof', 'fdm'],
};
function verifica(dett = process.argv.includes('--dove')) {
  const bb = pos => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], pos[i]); hi[k] = Math.max(hi[k], pos[i]); } return [lo, hi]; };
  for (const [a, lista] of Object.entries(VERIFICA)) {
    const { pos } = G.REAL(a), [lo, hi] = bb(pos), righe = [];
    griglia(lo, hi, 0.02, 0.1);
    for (const b of lista) {
      const M = TUBI.includes(b) ? maschTubi([b]) : solid(b, b === 'cute'), D = edt(M, true); let n = 0, mx = 0; const qlo = [9, 9, 9], qhi = [-9, -9, -9];
      for (let i = 0; i < pos.length; i += 3) { const id = vid([pos[i], pos[i + 1], pos[i + 2]]); if (id < 0 || id >= G.N || !M[id]) continue; const d = D[id];
        if (d > 0.02) { n++; mx = Math.max(mx, d); for (let k = 0; k < 3; k++) { qlo[k] = Math.min(qlo[k], pos[i + k]); qhi[k] = Math.max(qhi[k], pos[i + k]); } } }
      if (n) righe.push(`${b} ${n} (${(mx * 10).toFixed(1)} mm${dett ? ' in ' + [0, 1, 2].map(k => qlo[k].toFixed(2) + '…' + qhi[k].toFixed(2)).join(' ') : ''})`);
    }
    log(a.padEnd(9), righe.length ? 'dentro: ' + righe.join(', ') : 'nessuna compenetrazione');
  }
}

/* ============ Esecuzione ============ */
const SOLO = process.argv.slice(2).filter(a => !a.startsWith('--'));
const SALVA_SOLO = process.argv.find(a => a.startsWith('--solo='))?.slice(7).split(',');
if (SOLO.includes('verifica')) { verifica(); process.exit(0); }
const vuole = id => !SOLO.length || SOLO.includes(id);
if (vuole('volari')) volari();
if (vuole('estensori')) { log('retinacolo degli estensori'); estensori(); }
if (SALVA_SOLO) for (const m of man.meshes) if (!SALVA_SOLO.includes(m.n)) G.ripristina(m.n);
saveFile(repack());
