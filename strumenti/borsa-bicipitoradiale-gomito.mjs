/* Borsa bicipito-radiale del gomito (modelli/gomito-3d.html): `bor_bicrad`.

   Uso:  node strumenti/borsa-bicipitoradiale-gomito.mjs
   Va lanciato dopo `inserzioni-gomito.mjs` (usa tendine del bicipite e radio così come sono nel file; non li modifica).

   La borsa di partenza era una lamina azzurra lunga 1,5 cm (y −2,8 → −1,3) incastrata tra il tendine e il radio fino all'estremità del tendine:
   sembrava interposta nell'inserzione. Nella realtà il tendine si inserisce direttamente sulla parte posteriore, scabra, della tuberosità radiale;
   la borsa sta davanti alla tuberosità e separa il tendine dalla sua parte anteriore liscia, appena prima dell'inserzione (Skaf et al., Radiology 1999;
   Standring, Gray's Anatomy 42ª ed., antibraccio). Qui è un cuscinetto a lente nello spazio tra tendine e radio (regione con distanza dal radio + distanza dal
   tendine ≤ `S(y)`, a gioco `GAP` da entrambi) che esiste solo tra `Y.fine` e `Y.inizio`: spessore massimo `SPESS`, rastremato a zero ai due estremi,
   quindi più in basso il tendine tocca l'osso senza nulla in mezzo. Superficie: surface nets, solo la componente principale. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { sstep, log, repack, saveFile, setMesh, griglia, campo, nets, vi } = G;

const Y = { fine: -2.0, inizio: -0.9, pieno: [-1.75, -1.15] };   // cm: estensione verticale; spessore pieno tra pieno[0] e pieno[1]
const SPESS = 0.28;                        // cm, somma massima delle distanze da osso e tendine (≈ spessore massimo + gioco)
const GAP = 0.02;                          // cm, distanza minima da osso e tendine
const PASSO = 0.025;

griglia([-2.7, -2.4, 0.2], [-0.5, -0.5, 2.4], PASSO, 0.1);
const { N, NX, NY, NZ } = G;
const Fr = campo(['radio', 'cart_radio']).F, Ft = campo(['bic']).F;
const V = new Float32Array(N);
for (let j = 0; j < NY; j++) {
  const y = G.O[1] + (j + 0.5) * G.H;
  const w = sstep(Y.fine, Y.pieno[0], y) * (1 - sstep(Y.pieno[1], Y.inizio, y));
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    const q = vi(i, j, k), a = Fr[q], b = Ft[q];
    V[q] = Math.max(GAP - a, GAP - b, a + b - (2 * GAP + SPESS * w) , w < 0.02 ? 1 : -1);
  }
}
G.sfoca(V, 4);                            // levigatura del campo: niente creste dove si incontrano i tre vincoli
const out = nets(V, () => [0, 1, 0]);
// componente principale
const nv = out.pos.length / 3, par = Int32Array.from({ length: nv }, (_, i) => i), f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
for (let t = 0; t < out.idx.length; t += 3) { const a = f(out.idx[t]); par[f(out.idx[t + 1])] = a; par[f(out.idx[t + 2])] = a; }
const cnt = new Map(); for (let i = 0; i < nv; i++) { const r = f(i); cnt.set(r, (cnt.get(r) || 0) + 1); }
let top = -1, mx = 0; for (const [r, c] of cnt) if (c > mx) { mx = c; top = r; }
const map = new Int32Array(nv).fill(-1), P = [], D = [], I = [];
for (let i = 0; i < nv; i++) if (f(i) === top) { map[i] = P.length / 3; P.push(out.pos[3 * i], out.pos[3 * i + 1], out.pos[3 * i + 2]); D.push(out.fdir[3 * i], out.fdir[3 * i + 1], out.fdir[3 * i + 2]); }
for (let t = 0; t < out.idx.length; t += 3) if (map[out.idx[t]] >= 0) I.push(map[out.idx[t]], map[out.idx[t + 1]], map[out.idx[t + 2]]);
setMesh('bor_bicrad', { pos: Float32Array.from(P), idx: Uint32Array.from(I), tag: null, fdir: Int8Array.from(D) });
const ys = P.filter((_, i) => i % 3 === 1);
log(`bor_bicrad vertici ${P.length / 3}, componenti ${cnt.size}, y ${Math.min(...ys).toFixed(2)} → ${Math.max(...ys).toFixed(2)}`);
saveFile(repack());
