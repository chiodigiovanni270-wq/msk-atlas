/* Cartilagini articolari del dito (modelli/polso-dito-3d.html, sezione dito, mesh `d_cart` in bpdat2): le rifila sul profilo articolare.

   Uso (dalla cartella del progetto):
     node strumenti/cartilagini-dito.mjs            → riscrive d_cart nel file del modello
     MODELLO=/tmp/copia.html node strumenti/cartilagini-dito.mjs   → lavora su una copia

   Le cartilagini originali formano bande attorno alle tre articolazioni (MCF, IFP, IFD) e sporgono oltre il profilo
   articolare. Qui lo spessore sopra l'osso si riduce gradualmente (fino a MINF) dove la superficie non guarda un altro
   osso entro pochi millimetri; dove è affrontata resta (al massimo SPMAX). I vertici dentro l'osso non si toccano.
   Distanze dall'osso calcolate esattamente sui triangoli (mesh piccole, senza griglia).
   Riparte sempre dalla cartilagine della revisione ORIGINALE, quindi si può rilanciare. Parametri in testa. */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync, gzipSync, constants as Z } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(process.env.MODELLO || resolve(ROOT, 'modelli', 'polso-dito-3d.html'));
const ORIGINALE = 'ce9a824';            // revisione con la cartilagine originale
const OSSA = ['d_mc3', 'd_p1', 'd_p2', 'd_p3'];
const VICINO = [0.14, 0.30];            // distanza (cm) dell'altro osso: cartilagine affrontata (intera) → non affrontata (assottigliata)
const MINF = 0.3, SPMAX = 0.09, MINSP = 0.004; // frazione di spessore che resta dove non è affrontata; spessore massimo; spessore minimo sopra l'osso (evita z-fighting)

const reMan = /(<script id="bpman2" type="application\/json">)(.*?)(<\/script>)/s, reDat = /(<script id="bpdat2" type="text\/plain">)(.*?)(<\/script>)/s;
const leggi = h => { let b = Buffer.from(h.match(reDat)[2].trim(), 'base64'); const gz = b[0] === 0x1f && b[1] === 0x8b; return { b: gz ? gunzipSync(b) : b, gz, man: JSON.parse(h.match(reMan)[2]) }; };
const mesh = ({ b, man }, n) => { const m = man.meshes.find(x => x.n === n), q = new Uint16Array(b.buffer.slice(b.byteOffset + m.p, b.byteOffset + m.p + m.nv * 6)), pos = new Float32Array(m.nv * 3);
  for (let i = 0; i < pos.length; i++) { const k = i % 3; pos[i] = man.min[k] + q[i] / 65535 * (man.max[k] - man.min[k]); }
  const ib = b.buffer.slice(b.byteOffset + m.i, b.byteOffset + m.i + m.ni * (m.i16 ? 2 : 4)); return { pos, idx: m.i16 ? new Uint16Array(ib) : new Uint32Array(ib), m }; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function ptri(p, a, b, c) { // punto più vicino su un triangolo (Ericson)
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + d5 - d6)));
  const den = 1 / (va + vb + vc); return add(a, add(mul(ab, vb * den), mul(ac, vc * den))); }
function vicino(B, p) { let best = 1e9, q = null, tn = null;
  for (let t = 0; t < B.idx.length; t += 3) { const A = [0, 1, 2].map(k => [B.pos[3 * B.idx[t + k]], B.pos[3 * B.idx[t + k] + 1], B.pos[3 * B.idx[t + k] + 2]]);
    const c = ptri(p, A[0], A[1], A[2]), v = sub(p, c), d = Math.hypot(...v); if (d < best) { best = d; q = c; tn = cross(sub(A[1], A[0]), sub(A[2], A[0])); } }
  const l = Math.hypot(...tn) || 1; return { d: best, q, tn: mul(tn, 1 / l) }; }

const orig = leggi(execFileSync('git', ['show', `${ORIGINALE}:modelli/polso-dito-3d.html`], { cwd: ROOT, maxBuffer: 1 << 30 }).toString('utf8'));
const cur = leggi(readFileSync(FILE, 'utf8'));
const C = mesh(orig, 'd_cart'), ossa = OSSA.map(n => mesh(cur, n)), pos = C.pos, nv = pos.length / 3;
const IN = [], f = new Float32Array(nv), d = new Float32Array(nv); let N = [];
for (let i = 0; i < nv; i++) {
  const p = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  let k0 = 0, best = null; ossa.forEach((B, k) => { const r = vicino(B, p); if (!best || r.d < best.d) { best = r; k0 = k; } });
  const v = sub(p, best.q), dentro = best.d > 0.008 && dot(v, best.tn) < 0; // vertice dentro l'osso: non si tocca
  const n = best.d > 0.008 ? mul(v, (dentro ? -1 : 1) / best.d) : best.tn; IN[i] = dentro;
  N.push(n); d[i] = best.d;
  // osso affrontato: distanza dal più vicino tra gli altri; dove è lontano la superficie non è articolare
  let m = 9; ossa.forEach((B, k) => { if (k !== k0) m = Math.min(m, vicino(B, p).d); });
  f[i] = 1 - sstep(VICINO[0], VICINO[1], m);
}
const nb = Array.from({ length: nv }, () => new Set()); for (let t = 0; t < C.idx.length; t += 3) { const [a, b, c] = [C.idx[t], C.idx[t + 1], C.idx[t + 2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
let fs = f; for (let it = 0; it < 18; it++) { const q = fs.slice(); for (let i = 0; i < nv; i++) { let s = fs[i], c2 = 1; for (const j of nb[i]) { s += fs[j]; c2++; } q[i] = s / c2; } fs = q; }
let Ns = N; for (let it = 0; it < 4; it++) Ns = Ns.map((v, i) => { const s = v.slice(); for (const j of nb[i]) for (let a = 0; a < 3; a++) s[a] += Ns[j][a]; const l = Math.hypot(...s) || 1; return s.map(x => x / l); });
let out = new Float32Array(pos.length), ass = 0; const K = new Float32Array(nv);
for (let i = 0; i < nv; i++) { const k = K[i] = fs[i], dn = d[i] < MINSP ? d[i] : Math.max(MINSP, Math.min(d[i], SPMAX) * (MINF + (1 - MINF) * k)), dd = IN[i] ? 0 : dn - d[i]; if (k < 0.5) ass++;
  for (let a = 0; a < 3; a++) out[3 * i + a] = pos[3 * i + a] + Ns[i][a] * dd; }
for (let it = 0; it < 4; it++) { const q = out.slice(); for (let i = 0; i < nv; i++) { if (K[i] > 0.98) continue; const L = [...nb[i]]; for (let a = 0; a < 3; a++) { let s = 0; for (const j of L) s += out[3 * j + a]; q[3 * i + a] = 0.6 * out[3 * i + a] + 0.4 * s / L.length; } } out = q; }
const { man } = cur, m = man.meshes.find(x => x.n === 'd_cart'), q = new Uint16Array(nv * 3);
for (let i = 0; i < nv * 3; i++) { const k = i % 3; q[i] = Math.round(Math.min(1, Math.max(0, (out[i] - man.min[k]) / (man.max[k] - man.min[k]))) * 65535); }
Buffer.from(q.buffer).copy(cur.b, m.p);
let buf = cur.b; if (cur.gz) buf = gzipSync(buf, { level: Z.Z_BEST_COMPRESSION });
writeFileSync(FILE, readFileSync(FILE, 'utf8').replace(reDat, (_, a, b, c) => a + buf.toString('base64') + c));
console.log('d_cart:', nv, 'vertici;', Math.round(100 * ass / nv) + '% assottigliati (non affrontati)');
