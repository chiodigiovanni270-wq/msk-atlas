/* Biforcazione del nervo radiale (modelli/gomito-3d.html): il tronco `n_radiale` entra nel NIP `n_pin` senza uscirne.

   Uso (dalla cartella del progetto):
     node strumenti/biforcazione-radiale-gomito.mjs             → riscrive i tubi `n_radiale` (NVP.pts, NVP.rp) nel file del modello
     MODELLO=/tmp/copia.html node strumenti/biforcazione-radiale-gomito.mjs   → lavora su una copia
     node strumenti/biforcazione-radiale-gomito.mjs verifica    → non scrive: margine tra la parete del tronco e quella del NIP

   Problema: `nervi-gomito.mjs` prolunga il tronco di `Lext` cm dentro il NIP (estremità aperta, nascosta), ma i passi successivi che spostano il NIP
   (fuori dall'osso, nel supinatore) lasciavano il prolungamento fuori asse di 0,6–1,2 mm: l'estremità del tronco sporgeva dalla parete del NIP come una
   linguetta piatta con il taglio netto. Qui il prolungamento del tronco si riallinea all'asse del NIP (spostamento graduale, `RIALLINEA`) e il suo raggio
   resta sotto una frazione di quello del NIP (`DENTRO`): l'estremità aperta sta dentro il tubo con un margine anche per il rumore del profilo (±10 %).
   Idempotente; va lanciato dopo `nervi-gomito.mjs` (che riscrive il tronco). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'gomito-3d.html');
const G = await import('./lib-modello.mjs');
const { sstep, log } = G;
const VERIFICA = process.argv.slice(2).includes('verifica');

const RIALLINEA = { da: 0.70, a: 0.40 };   // cm (quota y): il tronco segue l'asse del NIP da `da` (0) a `a` (1, interamente sull'asse)
const PARTENZA = { da: 0.45, a: 0.67 };    // cm (quota y): l'inizio del NIP segue l'asse del tronco: peso 1 a `a` (primo campione, y = 0,67), 0 a `da`
const DENTRO = 0.82;                       // il raggio del tronco, dove il NIP è già più largo, non supera questa frazione del raggio del NIP
const DENTRO_Y = { da: 0.40, a: 0.05 };    // cm (quota y): il limite sul raggio del tronco entra gradualmente tra `da` (0) e `a` (1): il NIP nasce più stretto del tronco e lo incrocia
const PUNTA = [1, 0.92, 0.8];              // ultimi tre campioni del tronco: affusolamento dell'estremità (nascosta)

const NVP = JSON.parse(G.M.html.match(/const NVP=(\{.*?\});\n/s)[1]);
const T = NVP.pts.n_radiale, I = NVP.pts.n_pin;
const prof = (id, i) => { const rp = NVP.rp[id], n = NVP.pts[id].length, x = i / (n - 1) * (rp.length - 1), j = Math.min(rp.length - 2, Math.floor(x)); return NVP.r[id] * (rp[j] + (rp[j + 1] - rp[j]) * (x - j)); };
const rTronco = i => prof('n_radiale', i);
// punto del NIP più vicino a p (proiezione sui segmenti) e indice (frazionario) del campione
function proietta(p, L = I) {
  let best = { d: 1e9 };
  for (let j = 0; j + 1 < L.length; j++) {
    const a = L[j], b = L[j + 1], u = [0, 1, 2].map(k => b[k] - a[k]), L2 = u[0] ** 2 + u[1] ** 2 + u[2] ** 2 || 1e-12;
    const t = Math.min(1, Math.max(0, ([0, 1, 2].reduce((s, k) => s + (p[k] - a[k]) * u[k], 0)) / L2)), q = [0, 1, 2].map(k => a[k] + u[k] * t), d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (d < best.d) best = { d, q, j: j + t };
  }
  return best;
}
const rNip = j => { const i = Math.min(I.length - 2, Math.floor(j)), f = j - i; return prof('n_pin', i) * (1 - f) + prof('n_pin', i + 1) * f; };
// dopo l'incrocio (y ≤ DENTRO_Y.a), dove il NIP è già più largo del tronco: lì il tronco deve stare dentro; prima il NIP nasce dentro il tronco
const margine = () => { let m = 1e9, dove = -1; for (let i = 0; i < T.length; i++) { const pr = proietta(T[i]); if (T[i][1] > DENTRO_Y.a) continue; const v = rNip(pr.j) - pr.d - rTronco(i); if (v < m) { m = v; dove = i; } } return { m, dove }; };

if (VERIFICA) { const { m, dove } = margine(); console.log(`margine minimo tronco → parete del NIP: ${(m * 10).toFixed(2)} mm (campione ${dove}, y = ${T[dove][1].toFixed(2)})`);
  for (let j = 0; j < 4; j++) { const pr = proietta(I[j], T); console.log(`inizio del NIP, campione ${j} (y = ${I[j][1].toFixed(2)}): fuori asse dal tronco ${(pr.d * 10).toFixed(2)} mm, parete del NIP dentro il tronco di ${((prof('n_radiale', Math.round(pr.j)) - pr.d - prof('n_pin', j)) * 10).toFixed(2)} mm`); }
  process.exit(0); }

// 0) l'inizio del NIP (che nasce dentro il tronco, coassiale) si riporta sull'asse del tronco: il suo imbocco aperto resta dentro il tronco (prima i
//    primi campioni erano fuori asse di 0,6 mm e l'imbocco affiorava sulla parete come un anello bianco)
for (let j = 0; j < I.length; j++) {
  const w = 1 - sstep(PARTENZA.da, PARTENZA.a, I[j][1]); if (w <= 0) continue;
  const pr = proietta(I[j], T);
  I[j] = I[j].map((x, k) => Math.round((x + (pr.q[k] - x) * w) * 1000) / 1000);
}
const n = T.length, rp = NVP.rp.n_radiale, rMax = NVP.r.n_radiale;
for (let i = 0; i < n; i++) {
  const w = sstep(RIALLINEA.da, RIALLINEA.a, T[i][1]); if (w <= 0) continue;
  const pr = proietta(T[i]);
  T[i] = T[i].map((x, k) => Math.round((x + (pr.q[k] - x) * w) * 1000) / 1000);
}
// raggio: sotto DENTRO × raggio del NIP dove il NIP è più largo; poi affusolamento dell'estremità e levigatura del profilo
const R = Array.from({ length: n }, (_, i) => rTronco(i));
for (let i = 0; i < n; i++) { const w = sstep(DENTRO_Y.da, DENTRO_Y.a, T[i][1]); if (w <= 0) continue; const pr = proietta(T[i]); R[i] += (Math.min(R[i], DENTRO * rNip(pr.j)) - R[i]) * w; }
for (let k = 0; k < PUNTA.length; k++) R[n - PUNTA.length + k] *= PUNTA[k];
for (let giro = 0; giro < 2; giro++) for (let i = 1; i < n - 1; i++) if (T[i][1] <= DENTRO_Y.da) R[i] = Math.min(R[i], (R[i - 1] + R[i] + R[i + 1]) / 3 + 1e-9);
// il profilo `rp` ha un numero di campioni diverso da quello dei punti: si riscrive campionato sui punti
NVP.rp.n_radiale = R.map(r => Math.round(r / rMax * 1000) / 1000);
const { m, dove } = margine();
log(`tronco riallineato; margine minimo tra tronco e parete del NIP ${(m * 10).toFixed(2)} mm (y = ${T[dove][1].toFixed(2)})`);
G.M.html = G.M.html.replace(/const NVP=\{.*?\};\n/s, () => `const NVP=${JSON.stringify(NVP)};\n`);
G.saveFile(G.repack());
