/* Legamenti acromioclavicolare e sternoclavicolare anteriore della spalla (modelli/spalla-3d.html): `ac_leg` e `sc_leg` ricostruiti come lamine
   sottili che rivestono la capsula articolare.

   Problema. In `legamenti-spalla.mjs` i due legamenti sono fasci di fibre tra due impronte ellittiche: ne risultano blocchi spessi (5–10 mm) e
   tozzi, sospesi sopra la rima, mentre sono ispessimenti della capsula, lamine di 1–2 mm aderenti all'osso che scavalcano l'articolazione.

   Uso (dalla cartella del progetto):
     node strumenti/capsulari-ac-sc-spalla.mjs              → scrive `ac_leg` e `sc_leg` nel file del modello
     PROVA=1 node strumenti/capsulari-ac-sc-spalla.mjs      → stampa i controlli senza scrivere
     MODELLO=/tmp/copia.html node strumenti/capsulari-ac-sc-spalla.mjs   → lavora su una copia
   Va lanciato in fondo alla catena della spalla (dopo `cartilagine-testa-spalla.mjs`). Usa solo le ossa e, come ostacoli, le strutture vicine del file;
   non legge le mesh precedenti dei due legamenti, quindi si può rilanciare con lo stesso risultato. Se si rilancia `legamenti-spalla.mjs` (e la catena),
   rilanciare anche questo. Le strutture costruite prima attorno ai blocchi vecchi (trapezio, deltoide, borsa) restano dove sono: la lamina nuova sta
   sotto il loro profilo.

   Metodo (per ciascuna articolazione, su una griglia di `PASSO` attorno alla rima).
   1. Rima: coppie di punti più vicini tra le due ossa (`OSSI`, `filtri`); asse delle fibre f = direzione media dall'osso 1 all'osso 2 senza la
      componente lungo `FACCIA` (superiore per l'AC, anteriore per lo SC: le fibre scavalcano la rima parallele a quella faccia); centro J = media dei
      punti medi delle coppie entro `FRONTE` dalla più avanzata verso FACCIA (il versante della rima coperto dal legamento).
   2. Superficie di appoggio: chiusura morfologica (`R_CHIUSO`) dell'unione delle due ossa, levigata: coincide con l'osso dove non c'è rima e la
      scavalca dove c'è; sotto il ponte la lamina riempie la fessura fino a `SOTTO` (niente vuoti visibili al margine).
   3. Territorio «a decalcomania» visto da FACCIA, centrato nel punto della superficie davanti a J: superellisse (esponente `TONDO`) di semiassi
      `S1` (osso 1) / `S2` (osso 2) lungo f e `W` di traverso, solo dove la superficie guarda verso FACCIA (coseno `COS`) ed entro `PROF` in profondità.
   4. Lamina: dalla superficie di appoggio verso l'esterno per uno spessore t che va da `T_BORDO` al margine a `T` al centro (profilo `RAMPA`);
      sull'osso finisce a filo (0,04 mm dentro). Spazio libero = distanza dagli ostacoli nel piede del voxel sulla superficie, levigata: la lamina non
      supera lo spazio disponibile e finisce con margine liscio dove è minore di `EVITA` (es. l'origine del gran pettorale sul manubrio) invece di
      avvolgere l'ostacolo. Surface nets, componente principale, riduzione a `TRIANGOLI`, vertici rimasti in un osso o in un ostacolo riportati fuori
      lungo il gradiente; `fdir` = asse f proiettato sul piano tangente (striature lungo le fibre).
   5. Ostacoli = tutte le altre strutture del file vicine alla griglia (muscoli, borsa, capsula, cartilagini, altri legamenti, ossa diverse dalle due),
      a `GIOCO`.
   Controlli: vertici dentro ossa e ostacoli, vertici degli ostacoli dentro la lamina, spessore medio e massimo, volume prima/dopo. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.MODELLO ||= resolve(dirname(fileURLToPath(import.meta.url)), '..', 'modelli', 'spalla-3d.html');
const G = await import('./lib-modello.mjs');
const { REAL, setMesh, saveFile, repack, log, clamp, sstep, griglia, esatta, sfoca, sdf, chiuso, unione, nets, sample, grad } = G;
const B = await import('./lib-bp3d.mjs');

const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), nor = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

const PASSO = 0.025, MEZZO_LATO = 1.7, MARGINE = -0.004, GIOCO = 0.01, T_VIS = 0.03, TAGLIO_CHECK = -0.01;   // cm
// parametri delle due lamine (cm): faccia di riferimento, territorio, spessori
const LAMINE = {
  ac_leg: { OSSI: ['clavicola', 'scapola'], filtri: [p => p[0] < 3.2 && p[1] > 2.6, p => p[1] > 2.4 && p[0] < 3.2], FACCIA: [0, 1, -0.25],
            S1: 0.75, S2: 0.6, W: 0.85, PROF: 0.7, FRONTE: 0.4, R_CHIUSO: 0.5, T: 0.13, T_BORDO: 0.03, RAMPA: 0.25, SOTTO: 1, TONDO: 4, TRIANGOLI: 7000 },
  sc_leg: { OSSI: ['clavicola', 'manubrio'], filtri: [p => p[0] > 12.5, () => true], FACCIA: [-0.3, 0.2, 1],
            S1: 0.8, S2: 0.55, W: 0.75, PROF: 0.6, FRONTE: 0.4, R_CHIUSO: 1.0, EVITA: 0.15, T: 0.14, T_BORDO: 0.03, RAMPA: 0.3, SOTTO: 1, TONDO: 4, TRIANGOLI: 7000 },
};
const COS = [0.1, 0.45];   // la lamina c'è dove la superficie guarda verso FACCIA (coseno), piena da COS[1]
const NON_OSTACOLI = new Set(['ac_leg', 'sc_leg']);

const P3 = (p, i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
const volume = m => { let V = 0; for (let t = 0; t < m.idx.length; t += 3) V += dot(P3(m.pos, m.idx[t]), cross(P3(m.pos, m.idx[t + 1]), P3(m.pos, m.idx[t + 2]))) / 6; return Math.abs(V); };
const riquadro = m => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < m.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.pos[i + k]); hi[k] = Math.max(hi[k], m.pos[i + k]); } return { lo, hi }; };
function dentro(mesh) {   // test di parità lungo +x con triangoli raggruppati in celle (y, z)
  const P = mesh.pos, I = mesh.idx, h = 0.05, cel = new Map();
  for (let t = 0; t < I.length; t += 3) { const ys = [P[3 * I[t] + 1], P[3 * I[t + 1] + 1], P[3 * I[t + 2] + 1]], zs = [P[3 * I[t] + 2], P[3 * I[t + 1] + 2], P[3 * I[t + 2] + 2]];
    for (let y = Math.floor(Math.min(...ys) / h); y <= Math.floor(Math.max(...ys) / h); y++) for (let z = Math.floor(Math.min(...zs) / h); z <= Math.floor(Math.max(...zs) / h); z++) { const k = y * 100000 + z; (cel.get(k) || cel.set(k, []).get(k)).push(t); } }
  return p => { const L = cel.get(Math.floor(p[1] / h) * 100000 + Math.floor(p[2] / h)); if (!L) return false; let c = 0;
    for (const t of L) { const A = P3(P, I[t]), Bp = P3(P, I[t + 1]), Cp = P3(P, I[t + 2]);
      const d = (Bp[1] - A[1]) * (Cp[2] - A[2]) - (Cp[1] - A[1]) * (Bp[2] - A[2]); if (Math.abs(d) < 1e-14) continue;
      const u = ((p[1] - A[1]) * (Cp[2] - A[2]) - (Cp[1] - A[1]) * (p[2] - A[2])) / d, w = ((Bp[1] - A[1]) * (p[2] - A[2]) - (p[1] - A[1]) * (Bp[2] - A[2])) / d;
      if (u < 0 || w < 0 || u + w > 1) continue; const x = A[0] + u * (Bp[0] - A[0]) + w * (Cp[0] - A[0]); if (x > p[0]) c++; }
    return c % 2 === 1; };
}

const NUOVE = {};
for (const [id, L] of Object.entries(LAMINE)) {
  const vecchia = REAL(id), [o1, o2] = L.OSSI, m1 = REAL(o1), m2 = REAL(o2);
  /* ---- 1. rima: coppie di punti più vicini tra le due ossa ---- */
  const V1 = [], V2 = []; for (let i = 0; i < m1.nv; i++) { const p = P3(m1.pos, i); if (L.filtri[0](p)) V1.push(p); } for (let i = 0; i < m2.nv; i++) { const p = P3(m2.pos, i); if (L.filtri[1](p)) V2.push(p); }
  let dmin = 1e9; const cop = [];
  for (const p of V1) { let b = null, bd = 1e9; for (const q of V2) { const d = len(sub(p, q)); if (d < bd) { bd = d; b = q; } } cop.push([bd, p, b]); if (bd < dmin) dmin = bd; }
  const vicine = cop.filter(c => c[0] < dmin + 0.15);
  // asse delle fibre: direzione media dall'osso 1 all'osso 2, senza la componente lungo la faccia di riferimento (la normale della rima è obliqua:
  // le fibre la scavalcano restando parallele alla faccia superiore o anteriore)
  const nf = nor(L.FACCIA), f0 = nor(vicine.reduce((a, [, p, q]) => add(a, nor(sub(q, p))), [0, 0, 0])), f = nor(sub(f0, mul(nf, dot(f0, nf))));
  const w = cross(nf, f);   // larghezza del territorio, di traverso alle fibre
  // centro della rima sul versante di FACCIA: media dei punti medi delle coppie entro `FRONTE` dalla più avanzata lungo FACCIA
  const mid = vicine.map(([, p, q]) => mul(add(p, q), 0.5)), hmax = Math.max(...mid.map(m => dot(m, nf))), davanti = mid.filter(m => dot(m, nf) > hmax - L.FRONTE);
  const J = mul(davanti.reduce((a, m) => add(a, m), [0, 0, 0]), 1 / davanti.length);
  log(id, ': rima', J.map(x => x.toFixed(2)).join(','), 'distanza minima', (dmin * 10).toFixed(1), 'mm, coppie', vicine.length, ', asse', f.map(x => x.toFixed(2)).join(','));
  /* ---- griglia e campi ---- */
  griglia(sub(J, [MEZZO_LATO, MEZZO_LATO, MEZZO_LATO]), add(J, [MEZZO_LATO, MEZZO_LATO, MEZZO_LATO]), PASSO, 0);
  const { N } = G;
  const Mo = unione(L.OSSI), so = sdf(Mo), Fb = esatta(sfoca(so.F, 1), L.OSSI, 0.1);             // distanza con segno dalle due ossa
  const Dc = sfoca(chiuso(so.Do, L.R_CHIUSO), 3); for (let i = 0; i < N; i++) Dc[i] = Math.min(Dc[i], Math.max(Fb[i], -0.05));   // appoggio: osso o ponte sulla rima
  // ostacoli: strutture del file che entrano nella griglia
  const lo = G.O, hi = [G.O[0] + G.NX * G.H, G.O[1] + G.NY * G.H, G.O[2] + G.NZ * G.H];
  const ost = G.man.meshes.map(m => m.n).filter((n, i, a) => a.indexOf(n) === i && !NON_OSTACOLI.has(n) && !L.OSSI.includes(n)).filter(n => { const r = riquadro(REAL(n)); return [0, 1, 2].every(k => r.hi[k] > lo[k] && r.lo[k] < hi[k]); });
  log(id, ': ostacoli', ost.join(' '));
  const Fn = ost.length ? esatta(sfoca(sdf(unione(ost)).F, 1), ost, 0.1) : new Float32Array(N).fill(1);
  /* ---- 3–4. territorio e spessore ---- */
  // spazio libero sopra la superficie di appoggio: distanza dagli ostacoli nel piede del voxel sulla superficie (p − n·Dc), levigata; dove i muscoli
  // arrivano quasi all'osso la lamina si assottiglia fino a `T_VIS` e poi finisce (margine liscio invece di un buco ritagliato)
  const Sp = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (Dc[i] > 0.4) { Sp[i] = 1; continue; } if (Dc[i] < -0.2) { Sp[i] = Fn[i]; continue; } const p = G.voxel(i), g = nor(grad(Dc, p)); Sp[i] = sample(Fn, ...add(p, g, -Dc[i])); }
  sfoca(Sp, 8);
  // centro del territorio: punto della superficie di appoggio davanti alla rima, lungo FACCIA
  let C0 = add(J, nf, 1.5); for (let k = 0; k < 300 && sample(Dc, ...C0) > 0; k++) C0 = add(C0, nf, -0.01);
  const V = new Float32Array(N).fill(1); let tolti = 0, voluti = 0;
  for (let i = 0; i < N; i++) {
    if (Dc[i] > 0.35 || Dc[i] < -L.SOTTO) continue;
    const p = G.voxel(i), q = sub(p, C0), s = dot(q, f), x = dot(q, w), h = dot(q, nf), fac = dot(nor(grad(Dc, p)), nf);
    const ro = ((Math.abs(s) / (s < 0 ? L.S1 : L.S2)) ** L.TONDO + Math.abs(x / L.W) ** L.TONDO) ** (1 / L.TONDO);   // 1 sul bordo del territorio
    const dBordo = Math.min((1 - ro) * Math.min(L.S1, L.S2, L.W), (fac - COS[0]) * 0.6, L.PROF - Math.abs(h));         // distanza approssimata (cm) dal bordo
    const sp = Sp[i] - GIOCO, t = Math.min(L.T_BORDO + (L.T - L.T_BORDO) * sstep(0, L.RAMPA, dBordo) * sstep(COS[0], COS[1], fac), Math.max(sp, T_VIS));
    V[i] = Math.max(Dc[i] - t, -Dc[i] - L.SOTTO, MARGINE - Fb[i], -dBordo, (L.EVITA ?? T_VIS) - sp);
  }
  sfoca(V, 1);
  for (let i = 0; i < N; i++) { if (V[i] < 0) { voluti++; if (GIOCO - Fn[i] >= 0) tolti++; } V[i] = Math.max(V[i], GIOCO - Fn[i]); }   // ostacoli dopo la levigatura
  log(id, ': voxel della lamina', voluti, ', tolti dagli ostacoli', tolti, `(${(100 * tolti / Math.max(1, voluti)).toFixed(1)} %)`);
  /* ---- superficie ---- */
  const tdir = p => { const g = nor(grad(Dc, p)); return nor(sub(f, mul(g, dot(f, g)))); };
  const out = nets(V, tdir);
  const nvx = out.pos.length / 3, par = Int32Array.from({ length: nvx }, (_, i) => i), fnd = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < out.idx.length; t += 3) { const a = fnd(out.idx[t]), b = fnd(out.idx[t + 1]), c = fnd(out.idx[t + 2]); par[b] = a; par[fnd(c)] = a; }
  const cnt = new Map(); for (let t = 0; t < out.idx.length; t += 3) { const r = fnd(out.idx[t]); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const comp = [...cnt.entries()].sort((x, y) => y[1] - x[1]), main = comp[0][0], keep = [];
  for (let t = 0; t < out.idx.length; t += 3) if (fnd(out.idx[t]) === main) keep.push(out.idx[t], out.idx[t + 1], out.idx[t + 2]);
  log(id, ': componenti', comp.length, comp.length > 1 ? '(scartate: ' + comp.slice(1).map(c => c[1]).join(', ') + ' triangoli)' : '');
  const c0 = B.compatta(Float64Array.from(out.pos), Uint32Array.from(keep));
  const rid = c0.idx.length / 3 > L.TRIANGOLI ? B.riduci(c0.pos, c0.idx, L.TRIANGOLI, new Uint8Array(c0.pos.length / 3)) : c0, c1 = B.compatta(rid.pos, rid.idx);
  const pos = Float32Array.from(c1.pos), fdir = new Int8Array(pos.length);
  // la levigatura della superficie (surface nets) può portare qualche vertice negli spigoli delle ossa o contro un ostacolo: lo si riporta fuori
  // lungo il gradiente del campo (pochi passi di Newton)
  let spostati = 0;
  for (let i = 0; i < pos.length; i += 3) { let p = [pos[i], pos[i + 1], pos[i + 2]], mosso = false;
    for (let it = 0; it < 6; it++) { const a = sample(Fb, ...p) - MARGINE / 2, b = sample(Fn, ...p) - GIOCO / 2; if (a >= 0 && b >= 0) break;
      const [F, d] = a < b ? [Fb, a] : [Fn, b], g = nor(grad(F, p)); p = add(p, g, -d + 0.002); mosso = true; }
    if (mosso) { spostati++; pos[i] = p[0]; pos[i + 1] = p[1]; pos[i + 2] = p[2]; } }
  log(id, ': vertici riportati fuori da ossa e ostacoli', spostati);
  for (let i = 0; i < pos.length / 3; i++) { const t = tdir(P3(pos, i)); for (let k = 0; k < 3; k++) fdir[3 * i + k] = Math.round(t[k] * 127); }
  const nuova = { pos, idx: Uint32Array.from(c1.idx), tag: null, fdir };
  /* ---- controlli ---- */
  let inOsso = 0, inOst = 0, penO = 0, penN = 0;
  for (let i = 0; i < pos.length; i += 3) { const a = sample(Fb, pos[i], pos[i + 1], pos[i + 2]), b = sample(Fn, pos[i], pos[i + 1], pos[i + 2]);
    if (a < TAGLIO_CHECK) inOsso++; if (b < TAGLIO_CHECK) inOst++; penO = Math.max(penO, -a); penN = Math.max(penN, -b); }
  const dN = dentro(nuova), righe = [];
  for (const n of ost) { const m = REAL(n); let c = 0; for (let k = 0; k < m.nv; k++) { const p = P3(m.pos, k); if (Math.abs(p[0] - J[0]) > MEZZO_LATO || Math.abs(p[1] - J[1]) > MEZZO_LATO || Math.abs(p[2] - J[2]) > MEZZO_LATO) continue; if (dN(p)) c++; } if (c) righe.push(n + ' ' + c); }
  // spessore: per i vertici della faccia esterna (lontani dall'osso), distanza dalla superficie di appoggio
  const sp = []; for (let i = 0; i < pos.length; i += 3) { const d = sample(Dc, pos[i], pos[i + 1], pos[i + 2]); if (d > 0.02) sp.push(d); } sp.sort((a, b) => a - b);
  log(id, ':', nuova.idx.length / 3, 'triangoli,', pos.length / 3, 'vertici; volume', (volume(vecchia) * 1000).toFixed(0), '→', (volume(nuova) * 1000).toFixed(0), 'mm³;',
    'spessore mediano', (sp[sp.length >> 1] * 10).toFixed(2), 'mm, massimo', (sp[sp.length - 1] * 10).toFixed(2), 'mm');
  log(id, ': vertici dentro le ossa', inOsso, `(max ${(penO * 10).toFixed(2)} mm), dentro gli ostacoli`, inOst, `(max ${(penN * 10).toFixed(2)} mm); vertici degli ostacoli dentro la lamina:`, righe.join(', ') || 'nessuno');
  NUOVE[id] = nuova;
}
if (process.env.PROVA) { log('PROVA: nessuna scrittura'); if (process.env.PROVA !== '1') (await import('node:fs')).writeFileSync(process.env.PROVA, JSON.stringify(Object.fromEntries(Object.entries(NUOVE).map(([k, m]) => [k, { pos: [...m.pos], idx: [...m.idx] }])))); }
else { for (const [id, m] of Object.entries(NUOVE)) setMesh(id, m); saveFile(repack()); }
