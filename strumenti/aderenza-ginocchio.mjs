/* Tendini della zampa d'oca e tratto ileotibiale appoggiati sui piani profondi del ginocchio (modelli/ginocchio-3d.html).

   Uso (dalla cartella del progetto):
     node strumenti/aderenza-ginocchio.mjs [--prova]
     node strumenti/retinacoli-ginocchio.mjs      (dopo: i retinacoli usano sartorio e tratto ileotibiale come margini)

   Anatomia (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020; Warren LF, Marshall JL, JBJS Am 1979;61:56-62;
   Fairclough J et al., J Anat 2006;208:309-16):
   - Zampa d'oca: sartorio, gracile e semitendinoso scendono addossati tra loro e ai piani profondi (capsula
     postero-mediale, LCM superficiale con la borsa anserina interposta); il semitendinoso sta sul semimembranoso.
     Tra i piani c'è solo fascia e poco grasso: nessuno spazio vuoto.
   - Tratto ileotibiale: ispessimento della fascia lata, unito al femore dal setto intermuscolare laterale; sulla coscia
     distale è applicato al vasto laterale, sul condilo laterale ne è separato solo da un sottile strato di grasso.
   La mesh di partenza del sartorio (BodyParts3D) ha inoltre una punta (vertici tirati fuori fino a 2 cm presso
   l'inserzione): i vertici che si staccano dai vicini vengono riportati nel baricentro dei vicini.

   Metodo: ogni struttura si sposta per sezioni orizzontali (fasce di 0,5 mm) rigide, nel piano orizzontale, verso
   l'asse del ginocchio (direzione levigata lungo l'altezza). Per ogni fascia si misura la corsa libera: quanto può
   avanzare prima che un suo vertice arrivi a `gap` dal riferimento (strutture profonde, vasi e nervi profondi). Il
   profilo degli spostamenti è l'inviluppo inferiore di parabole di raggio RAGGIO: nessuna fascia supera la propria
   corsa (niente compenetrazioni) e il decorso cambia con curve dolci. I tendini già spostati fanno da riferimento
   per i successivi (gracile e semitendinoso, poi il sartorio sopra di loro). Vasi e nervi sottocutanei (grande
   safena, nervo safeno sotto il canale degli adduttori, ramo infrarotuleo) seguono i tendini su cui appoggiano e
   ne restano fuori. Mesh dalla revisione PARTENZA e tubi dalla revisione TUBI (prima dei retinacoli), quindi lo
   script si può rilanciare. Per le prove: DEBUG=1 stampa la corsa libera per fascia, SENZA=<struttura|OST> la
   toglie dal riferimento.

   Requisiti: Node 18 o successivo, nessuna dipendenza. */
import { M, REAL, setPos, posDaRevisione, N, or, solid, edt, sample, clamp, sstep, log, repack, saveFile, O, H, NX, NY, NZ, NXY } from './lib-modello.mjs';
import { execFileSync } from 'node:child_process';

const PARTENZA = 'a9faf26'; // mesh prima di questo strumento
const TUBI = '98225d3';     // decorsi di vasi e nervi prima di retinacoli-ginocchio.mjs (che va rilanciato dopo)
const PROVA = process.argv.includes('--prova');
const BIN = 0.05, PASSO = 0.01, RAGGIO = 3, ASSE = [-0.3, 0]; // RAGGIO (cm): raggio di curvatura minimo del profilo degli spostamenti
const PROFONDI_MED = ['femore', 'tibia', 'capsula', 'lcm', 'bans', 'mpfl', 'vmed'];
const REGOLE = [
  // dal profondo al superficiale: gracile e semitendinoso, poi il sartorio sopra di loro
  { sposta: 'grac', rif: [...PROFONDI_MED, 'semim', 'semit', 'addmag'], y: [-5.5, 6.5], gap: 0.08, sigma: 0.7, max: 0.8 },
  { sposta: 'semit', rif: ['femore', 'tibia', 'capsula', 'lcm', 'bans', 'semim', 'gmed', 'grac'], y: [-5.5, 6], gap: 0.08, sigma: 0.7, max: 0.8 },
  { sposta: 'sart', rif: [...PROFONDI_MED, 'grac', 'semit', 'addmag'], y: [-5.6, 7], gap: 0.08, sigma: 0.7, max: 1.0 },
  // tratto ileotibiale: sul vasto laterale; sul condilo ~2 mm di grasso
  { sposta: 'itb', rif: ['vlat', 'femore', 'capsula', 'cartfem', 'bicbrev'], y: [-0.5, 9.5], gap: y => 0.08 + 0.12 * (1 - sstep(3, 4.5, y)), sigma: 0.8, max: 0.8 },
];
// vasi e nervi sottocutanei che seguono i tendini (con il tratto in cui li seguono)
const TRASPORTA = { vgs: () => 1, nsaf: y => 1 - sstep(2.6, 3.4, y), ninfra: () => 1 };

/* ---------- tubi della pagina ---------- */
function tubiDi(html, id) {
  const a = html.indexOf(`{id:'${id}'`), b = html.indexOf('\n {id:', a + 5), src = html.slice(a, b);
  return [...src.matchAll(/tube\((\[\[.*?\]\]),([\d.]+)/g)].map(m => ({ p: JSON.parse(m[1]), r: +m[2], txt: m[1] }));
}
const VASI = html => [...html.matchAll(/\{id:'([a-zA-Z]+)',nw:1,cat:'(art|ven|ner)'/g)].map(m => m[1]);

/* ---------- stato di partenza ---------- */
const root = new URL('..', import.meta.url).pathname;
const H0 = execFileSync('git', ['show', `${TUBI}:modelli/ginocchio-3d.html`], { cwd: root, maxBuffer: 1 << 30 }).toString('utf8');
for (const id of VASI(M.html)) { const a = tubiDi(M.html, id), b = tubiDi(H0, id); a.forEach((T, k) => { if (b[k] && b[k].txt !== T.txt) M.html = M.html.replace(T.txt, b[k].txt); }); }
const NOMI = [...new Set(REGOLE.map(R => R.sposta))];
for (const n of NOMI) setPos(n, posDaRevisione(PARTENZA, n, 'modelli/ginocchio-3d.html'));
const P0 = new Map(NOMI.map(n => [n, new Float32Array(REAL(n).pos)]));

/* ---------- punta del sartorio ---------- */
function togliPunte(name) {
  const { pos, idx } = REAL(name), p = new Float32Array(pos), nv = p.length / 3, nb = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[idx[t + a]].add(idx[t + b]);
  let tot = 0;
  for (let it = 0; it < 10; it++) { let k = 0;
    for (let i = 0; i < nv; i++) { const s = [...nb[i]]; if (!s.length) continue; const c = [0, 0, 0]; let el = 0;
      for (const j of s) { for (let q = 0; q < 3; q++) c[q] += p[3 * j + q] / s.length; el += Math.hypot(p[3 * j] - p[3 * i], p[3 * j + 1] - p[3 * i + 1], p[3 * j + 2] - p[3 * i + 2]) / s.length; }
      const d = Math.hypot(c[0] - p[3 * i], c[1] - p[3 * i + 1], c[2] - p[3 * i + 2]);
      if (d > 0.25 && d > 0.7 * el) { for (let q = 0; q < 3; q++) p[3 * i + q] = c[q]; k++; } }
    tot += k; if (!k) break; }
  setPos(name, p); return tot;
}
log(`sart: ${togliPunte('sart')} vertici della punta riportati tra i vicini`);

/* ---------- ostacoli: vasi e nervi profondi ---------- */
const OST = new Uint8Array(N);
for (const id of VASI(M.html)) for (const T of tubiDi(M.html, id)) {
  const w = TRASPORTA[id];
  for (let k = 1; k < T.p.length; k++) { const a = T.p[k - 1], b = T.p[k], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.ceil(L / (H / 2));
    for (let s = 0; s <= n; s++) { const q = a.map((v, c) => v + (b[c] - v) * s / n); if (w && w(q[1]) > 0.5) continue; const r = T.r + 0.03, m = Math.ceil(r / H);
      const i0 = Math.round((q[0] - O[0]) / H), j0 = Math.round((q[1] - O[1]) / H), k0 = Math.round((q[2] - O[2]) / H);
      for (let i = i0 - m; i <= i0 + m; i++) for (let j = j0 - m; j <= j0 + m; j++) for (let kk = k0 - m; kk <= k0 + m; kk++) {
        if (i < 0 || j < 0 || kk < 0 || i >= NX || j >= NY || kk >= NZ) continue;
        if (Math.hypot(O[0] + i * H - q[0], O[1] + j * H - q[1], O[2] + kk * H - q[2]) <= r) OST[i + NX * j + NXY * kk] = 1; } } } }

/* ---------- aderenza per sezioni ---------- */
const blur = (a, s) => { const r = Math.ceil(3 * s), out = new Float64Array(a.length); for (let k = 0; k < a.length; k++) { let v = 0, w = 0; for (let j = -r; j <= r; j++) { const q = k + j; if (q < 0 || q >= a.length) continue; const ww = Math.exp(-(j * j) / (2 * s * s)); v += a[q] * ww; w += ww; } out[k] = v / w; } return out; };
const APERTE = ['capsula', 'cartfem', 'retmed', 'retlat'];

function aderisci(R) {
  const gap = typeof R.gap === 'function' ? R.gap : () => R.gap, dove = y => y > R.y[0] && y < R.y[1];
  const { pos, nv } = REAL(R.sposta); let a = Infinity, b = -Infinity; for (let i = 0; i < nv; i++) { a = Math.min(a, pos[3 * i + 1]); b = Math.max(b, pos[3 * i + 1]); }
  const y0 = a - 1, nb = Math.ceil((b - a + 2) / BIN) + 1, bin = y => clamp((y - y0) / BIN, 0, nb - 1);
  const SO = new Uint8Array(N); for (const n of R.rif) if (n !== process.env.SENZA) or(SO, solid(n, APERTE.includes(n))); if (process.env.SENZA !== 'OST') or(SO, OST);
  const DO = edt(SO), DI = edt(SO, true), F = (x, y, z) => sample(DO, x, y, z) - sample(DI, x, y, z);
  // direzione di ogni fascia: orizzontale, dal baricentro della sezione verso l'asse del ginocchio (levigata lungo y)
  const cx = new Float64Array(nb), cz = new Float64Array(nb), cn = new Float64Array(nb);
  for (let i = 0; i < nv; i++) { const k = Math.round(bin(pos[3 * i + 1])); cx[k] += pos[3 * i]; cz[k] += pos[3 * i + 2]; cn[k]++; }
  let Dx = new Float64Array(nb), Dz = new Float64Array(nb);
  for (let k = 0; k < nb; k++) if (cn[k]) { const ux = ASSE[0] - cx[k] / cn[k], uz = ASSE[1] - cz[k] / cn[k], l = Math.hypot(ux, uz) || 1; Dx[k] = ux / l; Dz[k] = uz / l; }
  Dx = blur(Dx, 0.5 / BIN); Dz = blur(Dz, 0.5 / BIN);
  for (let k = 0; k < nb; k++) { const l = Math.hypot(Dx[k], Dz[k]) || 1; Dx[k] /= l; Dz[k] /= l; }
  // corsa libera di ogni fascia lungo la sua direzione: il primo vertice che arriva a `gap` dal riferimento la ferma
  const t = new Float64Array(nb).fill(R.max), occ = new Uint8Array(nb);
  for (let i = 0; i < nv; i++) { const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2], k = Math.round(bin(y)); occ[k] = 1;
    if (!dove(y)) { t[k] = 0; continue; }
    let u = 0; const g = gap(y); while (u < t[k] && F(x + Dx[k] * (u + PASSO), y, z + Dz[k] * (u + PASSO)) >= g) u += PASSO; t[k] = Math.min(t[k], u); }
  for (let k = 0; k < nb; k++) if (!occ[k]) t[k] = R.max; // fasce vuote (fuori dalla struttura) non vincolano
  if (process.env.DEBUG) console.log(R.sposta, [...Array(nb).keys()].filter(k => k % 10 === 0 && occ[k] && dove(y0 + k * BIN)).map(k => `${(y0 + k * BIN).toFixed(1)}:${(t[k] * 10).toFixed(1)}`).join(" "));
  // profilo: inviluppo inferiore di parabole di raggio RAGGIO (curvatura limitata, mai oltre la corsa libera)
  const A = Float64Array.from(t, (_, k) => { let v = t[k]; for (let j = 0; j < nb; j++) { const w = t[j] + ((j - k) * BIN) ** 2 / (2 * RAGGIO); if (w < v) v = w; } return Math.max(0, v); });
  const out = new Float32Array(pos); let mx = 0, ymx = 0;
  for (let i = 0; i < nv; i++) { const f = bin(pos[3 * i + 1]), k0 = Math.floor(f), k1 = Math.min(nb - 1, k0 + 1), u = f - k0, Lr = v => v[k0] * (1 - u) + v[k1] * u, am = Lr(A);
    if (am > mx) { mx = am; ymx = pos[3 * i + 1]; } out[3 * i] += Lr(Dx) * am; out[3 * i + 2] += Lr(Dz) * am; }
  setPos(R.sposta, out);
  log(`${R.sposta} verso ${R.rif.join('+')}: spostamento massimo ${(mx * 10).toFixed(1)} mm (y ${ymx.toFixed(1)})`);
}

for (const R of REGOLE) aderisci(R);

/* ---------- vasi e nervi sottocutanei seguono i tendini ---------- */
const mossi = NOMI.map(n => ({ p0: P0.get(n), p1: REAL(n).pos }));
const spost = q => { let bd = Infinity, bv = null; for (const { p0, p1 } of mossi) for (let i = 0; i < p0.length; i += 3) {
  const d = (p0[i] - q[0]) ** 2 + (p0[i + 1] - q[1]) ** 2 + (p0[i + 2] - q[2]) ** 2; if (d < bd) { bd = d; bv = [p1[i] - p0[i], p1[i + 1] - p0[i + 1], p1[i + 2] - p0[i + 2]]; } }
  const w = 1 - sstep(0.5, 1.3, Math.sqrt(bd)); return bv.map(v => v * w); };
const TU = new Uint8Array(N); for (const n of NOMI) or(TU, solid(n)); const TO = edt(TU), TI = edt(TU, true);
const SD = q => sample(TO, ...q) - sample(TI, ...q);
const gradSD = q => { const e = 0.05, g = [0, 1, 2].map(c => { const a = q.slice(), b = q.slice(); a[c] += e; b[c] -= e; return SD(a) - SD(b); }), l = Math.hypot(...g) || 1; return g.map(v => v / l); };
for (const id in TRASPORTA) tubiDi(M.html, id).forEach(T => {
  let d = T.p.map(q => spost(q).map(v => v * TRASPORTA[id](q[1])));
  for (let r = 0; r < 6; r++) d = d.map((v, k) => k === 0 || k === d.length - 1 ? v : v.map((c, q) => (d[k - 1][q] + 2 * c + d[k + 1][q]) / 4));
  const np = T.p.map((q, k) => q.map((v, c) => v + d[k][c]));
  // nessun punto dentro i tendini spostati: si esce lungo il gradiente della distanza (punti vicini, fino al raggio + 0,3 mm)
  for (const q of np) for (let it = 0; it < 30; it++) { const v = SD(q); if (v >= T.r + 0.03) break; const g = gradSD(q);
    for (let c = 0; c < 3; c++) q[c] += g[c] * Math.min(0.05, T.r + 0.03 - v); }
  np.forEach(q => { for (let c = 0; c < 3; c++) q[c] = +q[c].toFixed(2); });
  log(`${id}: spostamento massimo ${(Math.max(...d.map(v => Math.hypot(...v))) * 10).toFixed(1)} mm`);
  M.html = M.html.replace(T.txt, JSON.stringify(np));
});
// il ramo infrarotuleo parte dal nervo safeno: primo punto agganciato al punto più vicino del tronco
{ const tr = tubiDi(M.html, 'nsaf')[0].p, T = tubiDi(M.html, 'ninfra')[0], p = T.p.map(q => q.slice());
  let bq = tr[0], bd = Infinity; for (const q of tr) { const d = Math.hypot(q[0] - p[0][0], q[1] - p[0][1], q[2] - p[0][2]); if (d < bd) { bd = d; bq = q; } }
  const d0 = bq.map((v, c) => v - p[0][c]); for (let k = 0; k < p.length; k++) { const w = Math.max(0, 1 - k / 4); for (let c = 0; c < 3; c++) p[k][c] = +(p[k][c] + d0[c] * w).toFixed(2); }
  M.html = M.html.replace(T.txt, JSON.stringify(p)); }

if (PROVA) process.exit(0);
saveFile(repack());
