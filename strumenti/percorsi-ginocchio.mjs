/* Decorso di arterie, vene e nervi del ginocchio (tubi procedurali in modelli/ginocchio-3d.html) negli spazi tra i
   muscoli, senza attraversare ossa, muscoli, tendini o legamenti e senza curve innaturali.

   Uso (dalla cartella del progetto, dopo stratifica-ginocchio.mjs, capsula-ginocchio.mjs, cute-ginocchio.mjs e borse-ginocchio.mjs;
   dopo, estremi-ginocchio.mjs):
     node strumenti/percorsi-ginocchio.mjs [--prova]
   --solo-canali: non ricalcola i decorsi; richiede BASE_CANALI (revisione
   delle mesh) e CANALI (JSON delle sole regole SCAVA da applicare).
   Usato da rifinitura-arterie-ginocchio.mjs su una copia del modello.
   Con --prova stampa solo le verifiche, senza modificare il file. Guide e soleo di partenza vengono dalla revisione git
   ORIGINALE, quindi lo script si può rilanciare. Per le prove: SOLO=id1,id2 (solo alcuni tubi), DEBUG=1.

   Anatomia di riferimento (Standring S, Gray's Anatomy, 42ª ed., Elsevier 2020):
   - Arteria e vena femorale nel canale degli adduttori sotto il sartorio, tra vasto mediale e adduttore magno; iato
     degli adduttori; nella fossa poplitea, dal profondo al superficiale: arteria (sulla faccia poplitea del femore e sulla
     capsula, posteriore al legamento popliteo obliquo, che rinforza la capsula), vena, nervo tibiale. Il fascio scende tra i capi del gastrocnemio sul popliteo e passa sotto l'arcata
     tendinea del soleo, dove l'arteria si divide in tibiale anteriore (sopra la membrana interossea, poi nella loggia
     anteriore tra tibiale anteriore ed estensore lungo delle dita) e tibiale posteriore (tra tibiale posteriore e soleo),
     che dà la peroniera lungo il perone.
   - Nervo sciatico profondo al capo lungo del bicipite, sull'adduttore magno; si divide all'apice della fossa poplitea.
   - Nervo peroneo comune lungo il margine mediale del bicipite, dietro la testa e attorno al collo del perone, profondo
     al peroneo lungo, dove si divide; peroneo superficiale tra peronieri ed estensore lungo delle dita; peroneo profondo
     sotto l'estensore lungo delle dita, sulla membrana interossea, lateralmente all'arteria tibiale anteriore.
   - Nervo cutaneo surale mediale e piccola safena tra i capi del gastrocnemio, poi sotto la fascia del polpaccio.
   - Grande safena sottocutanea; al ginocchio passa dietro il condilo mediale, superficiale al confine tra sartorio e
     gracile. Nervo safeno nel canale degli adduttori e poi profondo al sartorio; perfora la fascia tra i tendini di
     sartorio e gracile (non dietro il gracile) e scende sottocutaneo con la grande safena. Il ramo infrarotuleo curva in
     avanti sotto la rotula.
   - Arterie genicolari fuori dalla capsula: le superiori girano attorno al femore sopra i condili (la mediale sopra
     l'origine del capo mediale del gastrocnemio, davanti al semimembranoso e dietro il tendine dell'adduttore magno), le
     inferiori lungo il margine superiore del popliteo, profonde ai capi del gastrocnemio e poi ai legamenti collaterali.
     Le surali entrano nella faccia profonda dei capi del gastrocnemio.

   Metodo: la linea guida di ogni tubo (originale, con punti di passaggio anatomici; i rami partono dal tronco) è una
   curva dolce campionata ogni 2,5 mm. In ogni sezione (orizzontale per i tubi che scendono, altrimenti perpendicolare
   alla guida) la programmazione dinamica cerca il percorso di costo minimo: compenetrazione (al quadrato) in ossa,
   muscoli, tendini, legamenti, borse e negli altri tubi, distanza dalla guida, curvatura, piano (sottocutaneo o sotto
   l'involucro dei muscoli) e vicinanza al vaso satellite. Poi una banda elastica (energia di flessione + penalità, ogni
   punto si muove solo nel proprio piano trasversale) toglie le pieghe; i rami escono tangenti al tronco quando nascono
   nella sua direzione; alle biforcazioni e all'origine dei rami il calibro si raccorda (r0/r1 di tube()). Le mesh dei muscoli
   (BodyParts3D) non hanno gli spazi in cui scorrono vasi e nervi (arcata del soleo, grasso della fossa, iato degli adduttori,
   tunnel fibulare): dopo il calcolo vengono scavati solchi lisci lungo i tubi (SCAVA). Per i nervi peronieri, sottili, la mesh
   del peroneo lungo e dell'estensore lungo delle dita viene prima raffinata lungo il nervo (lati ≤ 1 mm, bisezione conforme)
   e poi incisa con un canale aperto verso la superficie più vicina, raccordato e levigato (nessuna piega). */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { M, REAL, setPos, setMesh, repack, saveFile, setGriglia, solid, edt, sample, clamp, sstep, log, reManRe, reDatRe } from './lib-modello.mjs';
import * as G from './lib-modello.mjs'; // griglia corrente (O, H, NX, NY, NZ, N cambiano con setGriglia)

const PROVA = process.argv.includes('--prova');
const SOLO_CANALI = process.argv.includes('--solo-canali');
const ORIGINALE = SOLO_CANALI ? process.env.BASE_CANALI : 'b4df739';
if (!ORIGINALE) throw new Error('--solo-canali richiede BASE_CANALI');
const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const H0 = execFileSync('git', ['show', `${ORIGINALE}:modelli/ginocchio-3d.html`], { cwd: RADICE, maxBuffer: 1 << 30 }).toString('utf8');

/* ============ Solchi nei muscoli (SCAVA) ============ */
// Le mesh BodyParts3D dei muscoli sono a contatto tra loro e con le ossa, senza gli spazi (grasso, arcate, iati, tunnel)
// in cui scorrono vasi e nervi: manca per esempio l'arcata tendinea del soleo. Dopo il calcolo dei decorsi, la mesh di
// ogni muscolo elencato viene scavata lungo i tubi indicati (spostamento radiale dall'asse del tubo con raccordo dolce),
// nell'intervallo verticale indicato. Si parte sempre dalla mesh originale, quindi lo script resta rilanciabile.
const SCAVA = SOLO_CANALI ? JSON.parse(process.env.CANALI || '[]') : [
  { m: 'sol', tubi: ['apop', 'vpop', 'ntib', 'atpost', 'vtpost', 'atant'], y: [-12, -4], dir: [0, 0, -1] }, // arcata del soleo
  // capi del gastrocnemio e plantare scostati ai lati del fascio (nel vivo separati dal grasso della fossa)
  { m: 'gmed', tubi: ['apop', 'vpop', 'ntib'], y: [-7, 3.5], dir: [1, 0, -0.3], max: 0.8 },
  { m: 'glat', tubi: ['apop', 'vpop', 'ntib'], y: [-7, 3.5], dir: [-1, 0, -0.3], max: 0.8 },
  { m: 'plant', tubi: ['apop', 'vpop', 'ntib'], y: [-7, 3.5], dir: [-1, 0, -0.3], max: 0.8 },
  { m: 'tibpost', tubi: ['atant'], y: [-10.5, -6.5], dir: [0, -1, 0] },                                  // sopra la membrana interossea
  // nervi peronieri: mesh raffinata lungo il nervo (lati ≤ 1 mm) e canale scavato. Tunnel fibulare e passaggio profondo
  // all'estensore lungo delle dita: la faccia profonda del muscolo (verso il perone) si solleva sopra il nervo; più in
  // basso il peroneo superficiale scorre nel setto tra peronieri ed estensore lungo delle dita (solco radiale)
  { m: 'perlong', fine: [{ tubi: ['nper', 'nperS', 'nperP'], y: [-21, -3.8] }] },
  { m: 'extdig', fine: [{ tubi: ['nperP', 'nperS'], y: [-21, -5.2] }] },
  { m: 'addmag', tubi: ['apop', 'vpop'], y: [10.5, 15] },                                               // iato degli adduttori
  // rami articolari a ridosso della capsula: la faccia profonda dei muscoli che li coprono si incava sopra l'arteria
  // (genicolari superiori sotto semimembranoso e capo mediale del gastrocnemio, inferiori sotto il gastrocnemio e sul
  // margine del popliteo, discendente sotto l'adduttore magno)
  { m: 'gmed', fine: [{ tubi: ['agen'], y: [-3.6, 6.8] }] },
  { m: 'pop', fine: [{ tubi: ['agen'], y: [-2.2, 0.2] }] },
  { m: 'addmag', fine: [{ tubi: ['adisc', 'agen'], y: [3.5, 8.5] }] },
];
const M0 = JSON.parse(H0.match(reManRe)[2]), B0 = Buffer.from(H0.match(reDatRe)[2].trim(), 'base64');
const vista = (T, off, n) => new T(B0.buffer.slice(B0.byteOffset + off, B0.byteOffset + off + n * T.BYTES_PER_ELEMENT));
function meshOriginale(nome) { return meshCompleta(nome).pos; }
function meshCompleta(nome) { // posizioni, indici, tag (colore muscolo/tendine) e direzioni delle fibre della mesh originale
  const e = M0.meshes.findLast(x => x.n === nome), q = vista(Uint16Array, e.p, e.nv * 3), pos = new Float32Array(e.nv * 3);
  for (let i = 0; i < e.nv * 3; i++) { const k = i % 3; pos[i] = M0.min[k] + q[i] / 65535 * (M0.max[k] - M0.min[k]); }
  return { pos, idx: Array.from(vista(e.i16 ? Uint16Array : Uint32Array, e.i, e.ni)), tag: e.t !== undefined ? Array.from(vista(Uint8Array, e.t, e.nv)) : null,
    fdir: e.d !== undefined ? Array.from(vista(Int8Array, e.d, e.nv * 3)) : null };
}
for (const S of SCAVA) { if (S.fine) { const m = meshCompleta(S.m); setMesh(S.m, { pos: m.pos, idx: Uint32Array.from(m.idx), tag: m.tag && Uint8Array.from(m.tag), fdir: m.fdir && Int8Array.from(m.fdir) }); }
  else setPos(S.m, meshOriginale(S.m)); } // i decorsi si calcolano sulle mesh originali

// Campionamento della stessa Catmull-Rom centripeta usata da THREE r128.
// Solo per il ritocco locale: la vecchia catena conserva il suo campionamento.
function ricampionaRendering(P, passo) {
  const out=[];
  for(let i=0;i<P.length-1;i++){
    const p0=P[Math.max(0,i-1)],p1=P[i],p2=P[i+1],p3=P[Math.min(P.length-1,i+2)];
    const a=Math.sqrt(len(sub(p1,p0)))||1e-3,b=Math.sqrt(len(sub(p2,p1)))||1e-3,c=Math.sqrt(len(sub(p3,p2)))||1e-3;
    const m1=p1.map((v,k)=>(p2[k]-v)+b*((v-p0[k])/a-(p2[k]-p0[k])/(a+b)));
    const m2=p2.map((v,k)=>(v-p1[k])+b*((p3[k]-v)/c-(p3[k]-p1[k])/(b+c)));
    // THREE estrapola il controllo terminale, non duplica il punto.
    if(i===0)for(let k=0;k<3;k++)m1[k]=p2[k]-p1[k];
    if(i===P.length-2)for(let k=0;k<3;k++)m2[k]=p2[k]-p1[k];
    for(let j=0;j<32;j++){const t=j/32,t2=t*t,t3=t2*t;
      out.push(p1.map((v,k)=>(2*t3-3*t2+1)*v+(t3-2*t2+t)*m1[k]+(-2*t3+3*t2)*p2[k]+(t3-t2)*m2[k]));}
  }
  out.push(P.at(-1));return ricampiona(out,passo);
}
const campionaCanale=(p)=>SOLO_CANALI?ricampionaRendering(p,.05):ricampiona(p,.1);
const raggioCanale=(id,r)=>(SOLO_CANALI&&id==='aric'?Math.max(r,.11):r)+(SOLO_CANALI?.10:.06);

// segmenti dei tubi (ogni 1 mm) con il raggio del canale (raggio del tubo + 0,6 mm)
const segmenti = tubi => { const segs = []; for (const id of tubi) for (const t of correnti.get(id)) { const P = campionaCanale(t.pts); for (let i = 1; i < P.length; i++) segs.push([P[i - 1], P[i], raggioCanale(id,t.r)]); } return segs; };
const vicinoSeg = (segs, p) => { let bd = Infinity, bs = null, bq = null; for (const sg of segs) { const [a, b] = sg, ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1), q = add(a, ab, t), d = len(sub(p, q)); if (d - sg[2] < bd) { bd = d - sg[2]; bs = sg; bq = q; } } return [bd, bs, bq]; };
// asse dell'osso alla quota y (baricentro della sezione), per la direzione del canale sulla faccia profonda
const ASSI = new Map();
const asseOsso = (osso, y) => { const k = osso + Math.round(y * 5); if (!ASSI.has(k)) { const { pos } = REAL(osso); let sx = 0, sz = 0, n = 0; for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i + 1] - y) < 0.3) { sx += pos[i]; sz += pos[i + 2]; n++; } ASSI.set(k, n ? [sx / n, sz / n] : null); } return ASSI.get(k); };

// raffinamento conforme per bisezione dei lati (≤ h) vicino ai tubi: il canale del nervo, sottile, diventa rappresentabile
function raffina(m, parti, h = 0.1, fascia = 0.45) {
  const P = Array.from(m.pos), I = m.idx, T = m.tag, D = m.fdir, key = (a, b) => a < b ? a + '_' + b : b + '_' + a;
  const segs = parti.map(pt => [pt, segmenti(pt.tubi)]), vicino = q => segs.some(([pt, sg]) => q[1] > pt.y[0] - 0.5 && q[1] < pt.y[1] + 0.5 && vicinoSeg(sg, q)[0] < fascia);
  for (let pass = 0; pass < 12; pass++) {
    const e2t = new Map(); for (let t = 0; t < I.length / 3; t++) for (let r = 0; r < 3; r++) { const k = key(I[3 * t + r], I[3 * t + (r + 1) % 3]); (e2t.get(k) || e2t.set(k, []).get(k)).push(t); }
    const lunghi = []; for (const [k, ts] of e2t) { const [a, b] = k.split('_').map(Number), A = P.slice(3 * a, 3 * a + 3), B = P.slice(3 * b, 3 * b + 3), L = len(sub(A, B)); if (L > h && vicino(add(A, sub(B, A), 0.5))) lunghi.push([L, a, b]); }
    if (!lunghi.length) break; lunghi.sort((x, y) => y[0] - x[0]);
    const toccati = new Set(); let n = 0;
    for (const [, a, b] of lunghi) { const ts = e2t.get(key(a, b)); if (!ts || ts.some(t => toccati.has(t))) continue; // una bisezione per triangolo per passata
      const m2 = P.length / 3; for (let k = 0; k < 3; k++) P.push((P[3 * a + k] + P[3 * b + k]) / 2);
      if (T) T.push(Math.round((T[a] + T[b]) / 2)); if (D) for (let k = 0; k < 3; k++) D.push(Math.round((D[3 * a + k] + D[3 * b + k]) / 2));
      for (const t of ts) { toccati.add(t); const tri = [I[3 * t], I[3 * t + 1], I[3 * t + 2]], r = tri.findIndex((v, j) => (v === a && tri[(j + 1) % 3] === b) || (v === b && tri[(j + 1) % 3] === a));
        const u = tri[r], v = tri[(r + 1) % 3], w = tri[(r + 2) % 3]; I[3 * t] = u; I[3 * t + 1] = m2; I[3 * t + 2] = w; I.push(m2, v, w); toccati.add(I.length / 3 - 1); }
      n++; }
    if (!n) break;
  }
  return { pos: Float32Array.from(P), idx: I, tag: T, fdir: D };
}
// canale lungo i tubi, aperto verso la superficie del muscolo più vicina al tubo: e = direzione di uscita (gradiente della
// distanza con segno dal muscolo, mediato lungo il tubo su ±4 mm); la parete del muscolo dal lato di uscita si sposta
// oltre il tubo (profilo a coseno rialzato largo raggio + 3,5 mm). Se il tubo è dentro il muscolo si apre un canale verso
// la faccia più vicina; con 'osso' il canale si apre verso l'osso (tunnel fibulare: il nervo resta coperto dal peroneo
// lungo); se il tubo sfiora il muscolo, questo si incava sotto di esso.
function incidi(nome, pos, pt) {
  const P0 = []; for (const id of pt.tubi) for (const t of correnti.get(id)) { const Q = campionaCanale(t.pts).filter(q => q[1] > pt.y[0] - 0.6 && q[1] < pt.y[1] + 0.6); if (Q.length > 1) P0.push([Q, raggioCanale(id,t.r)]); }
  if (!P0.length) return [0, 0];
  const all = P0.flatMap(([Q]) => Q), lo = [0, 1, 2].map(k => Math.min(...all.map(q => q[k])) - 1.5), hi = [0, 1, 2].map(k => Math.max(...all.map(q => q[k])) + 1.5), hg = 0.05;
  setGriglia(lo, hg, Math.ceil((hi[0] - lo[0]) / hg), Math.ceil((hi[1] - lo[1]) / hg), Math.ceil((hi[2] - lo[2]) / hg));
  const Sm = solid(nome), Do = edt(Sm), Di = edt(Sm, true), f = q => sample(Do, ...q) - sample(Di, ...q);
  const segs = [];
  for (const [Q, c] of P0) {
    const E = Q.map(q => { const e = 0.05, g = [0, 1, 2].map(k => { const a = q.slice(), b = q.slice(); a[k] += e; b[k] -= e; return f(a) - f(b); }); return nrm(g); });
    const Es = E.map((_, k) => { const m = [0, 0, 0]; for (let j = Math.max(0, k - 4); j <= Math.min(E.length - 1, k + 4); j++) for (let r = 0; r < 3; r++) m[r] += E[j][r]; return nrm(m); });
    for (let k = 1; k < Q.length; k++) { const t = nrm(sub(Q[k], Q[k - 1])), ax = pt.osso && asseOsso(pt.osso, Q[k][1]);
      const e = ax ? nrm([ax[0] - Q[k][0], 0, ax[1] - Q[k][2]]) : Es[k], u = nrm(sub(e, t.map(x => x * dot(e, t)))).map(x => -x); segs.push([Q[k - 1], Q[k], c, u]); } // osso: canale aperto verso l'osso
  }
  const Dv = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const p = [pos[i], pos[i + 1], pos[i + 2]], w = sstep(pt.y[0] - 0.4, pt.y[0] + 0.3, p[1]) * (1 - sstep(pt.y[1] - 0.3, pt.y[1] + 0.4, p[1])); if (w <= 0) continue;
    let best = 0, dir = null;
    for (const [a, b, c, u] of segs) { const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1), q = add(a, ab, t), v = sub(p, q);
      const hh = dot(v, u), L = c + 0.35; if (hh < -0.7) continue; const lat = len(sub(v, u.map(x => x * hh))); if (lat >= L) continue;
      const T = c * (1 + Math.cos(Math.PI * lat / L)) / 2 + 0.02, fz = (T - hh) * sstep(-0.7, -0.45, hh); if (fz > best) { best = fz; dir = u; } }
    if (dir) for (let k = 0; k < 3; k++) Dv[i + k] = dir[k] * best * w;
  }
  return Dv;
}
// intorni dei vertici e levigature: spostamenti raccordati sulla mesh, poi Taubin sulla zona incisa (niente pieghe)
const intorni = (idx, nv) => { const nb = Array.from({ length: nv }, () => new Set()); for (let t = 0; t < idx.length; t += 3) for (let r = 0; r < 3; r++) { const a = idx[t + r], b = idx[t + (r + 1) % 3]; nb[a].add(b); nb[b].add(a); } return nb; };
function raccorda(Dv, nb, it) { for (let r = 0; r < it; r++) { const O = Dv.slice(); for (let i = 0; i < nb.length; i++) { if (!nb[i].size) continue; const m = [0, 0, 0]; for (const j of nb[i]) for (let k = 0; k < 3; k++) m[k] += O[3 * j + k];
  for (let k = 0; k < 3; k++) { const a = O[3 * i + k], b = m[k] / nb[i].size; Dv[3 * i + k] = Math.abs(b) > Math.abs(a) ? 0.5 * (a + b) : 0.5 * a + 0.5 * b; } } } }
function taubin(pos, nb, peso, it) { for (let r = 0; r < 2 * it; r++) { const f = r % 2 ? -0.53 : 0.5, O = pos.slice(); for (let i = 0; i < nb.length; i++) { if (!peso[i] || !nb[i].size) continue; const m = [0, 0, 0]; for (const j of nb[i]) for (let k = 0; k < 3; k++) m[k] += O[3 * j + k];
  for (let k = 0; k < 3; k++) pos[3 * i + k] = O[3 * i + k] + f * peso[i] * (m[k] / nb[i].size - O[3 * i + k]); } } }
function scava() {
  for (const S of SCAVA.filter(S => S.fine)) {
    const m = raffina(meshCompleta(S.m), S.fine), nv0 = M0.meshes.findLast(x => x.n === S.m).nv, nv = m.pos.length / 3, nb = intorni(m.idx, nv), P0 = m.pos.slice();
    // tre giri: spostamento (raccordato sulla mesh) e levigatura della zona toccata; l'ultimo giro solo spostamento, così il canale resta libero
    for (let giro = 0; giro < 4; giro++) for (const pt of S.fine) {
      const Dv = incidi(S.m, m.pos, pt); if (giro < 3) raccorda(Dv, nb, 6);
      const peso = new Float32Array(nv); for (let i = 0; i < nv; i++) { const d = Math.hypot(Dv[3 * i], Dv[3 * i + 1], Dv[3 * i + 2]); peso[i] = Math.min(1, d / 0.05); m.pos[3 * i] += Dv[3 * i]; m.pos[3 * i + 1] += Dv[3 * i + 1]; m.pos[3 * i + 2] += Dv[3 * i + 2]; }
      if (giro < 3) { for (let r = 0; r < 3; r++) { const O = peso.slice(); for (let i = 0; i < nv; i++) for (const j of nb[i]) peso[i] = Math.max(peso[i], 0.7 * O[j]); } taubin(m.pos, nb, peso, 6); }
    }
    let mosse = 0, mx = 0; for (let i = 0; i < nv; i++) { const d = Math.hypot(m.pos[3 * i] - P0[3 * i], m.pos[3 * i + 1] - P0[3 * i + 1], m.pos[3 * i + 2] - P0[3 * i + 2]); if (d > 1e-3) { mosse++; mx = Math.max(mx, d); } }
    setMesh(S.m, { pos: m.pos, idx: Uint32Array.from(m.idx), tag: m.tag && Uint8Array.from(m.tag), fdir: m.fdir && Int8Array.from(m.fdir) });
    log(`canale in ${S.m}: mesh ${nv0} → ${m.pos.length / 3} vertici, ${mosse} spostati (max ${(mx * 10).toFixed(1)} mm)`);
  }
  for (const S of SCAVA.filter(S => !S.fine)) {
    const pos = Float32Array.from(REAL(S.m).pos), segs = [], F = new Float32Array(pos.length / 3), DIR = new Array(pos.length / 3); // mesh originale (o già raffinata dal canale fine)
    for (const id of S.tubi) for (const t of correnti.get(id)) { const P = campionaCanale(t.pts); for (let i = 1; i < P.length; i++) segs.push([P[i - 1], P[i], raggioCanale(id,t.r)]); }
    let mosse = 0, mx = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const p = [pos[i], pos[i + 1], pos[i + 2]], w = sstep(S.y[0] - 0.6, S.y[0] + 0.4, p[1]) * (1 - sstep(S.y[1] - 0.4, S.y[1] + 0.6, p[1])); if (w <= 0) continue;
      let best = 0, dir = null;
      for (const [a, b, c] of segs) { const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1), q = add(a, ab, t), v = sub(p, q), d = len(v);
        if (S.dir || S.da) { // solco verso una direzione (o lontano dall'asse di un osso): la faccia del muscolo davanti al tubo
          // arretra dietro di esso, formando un canale sulla faccia profonda
          const u = S.dir ? nrm(S.dir) : nrm([p[0] - S.da[0], 0, p[2] - S.da[1]]), h = dot(v, u), lat = len(sub(v, u.map(x => x * h))); if (lat >= 1.6 * c || h < -1.6) continue;
          const need = c * Math.cos(Math.PI / 2 * lat / (1.6 * c)), f = (need - h) * sstep(-1.6, -1.2, h); if (f > best) { best = f; dir = u; } continue; }
        const R2 = 2.2 * c; if (d >= R2) continue; const f = c * (1 - d / R2) ** 2; if (f > best) { best = f; dir = d > 1e-4 ? v.map(x => x / d) : [0, 0, -1]; } }
      if (!dir) continue; F[i / 3] = best * w; DIR[i / 3] = dir;
    }
    if (S.dir || S.da) { // solco direzionale: campo di spostamento dilatato e raccordato sulla mesh (bordi del canale lisci)
      const { idx } = REAL(S.m), nb = Array.from({ length: F.length }, () => new Set());
      for (let t = 0; t < idx.length; t += 3) for (let r = 0; r < 3; r++) { const a = idx[t + r], b = idx[t + (r + 1) % 3]; nb[a].add(b); nb[b].add(a); }
      for (let it = 0; it < 8; it++) { const G0 = F.slice(); for (let i = 0; i < F.length; i++) { if (!nb[i].size) continue; let m = 0; for (const j of nb[i]) m += G0[j]; F[i] = Math.max(G0[i], 0.8 * m / nb[i].size); } }
      for (let i = 0; i < F.length; i++) if (F[i] > 1e-4) DIR[i] = S.dir ? nrm(S.dir) : nrm([pos[3 * i] - S.da[0], 0, pos[3 * i + 2] - S.da[1]]);
    }
    if (S.max) for (let i = 0; i < F.length; i++) F[i] = S.max * Math.tanh(F[i] / S.max); // spostamento massimo (raccordato)
    for (let i = 0; i < F.length; i++) { if (F[i] <= 1e-4) continue; for (let k = 0; k < 3; k++) pos[3 * i + k] += DIR[i][k] * F[i]; mosse++; mx = Math.max(mx, F[i]); }
    setPos(S.m, pos); log(`solco in ${S.m}: ${mosse} vertici spostati (max ${(mx * 10).toFixed(1)} mm)`);
  }
}

/* ============ Calibro ============ */
// raccordo del calibro alle biforcazioni e ai rami: r0 raggio all'inizio del tubo, r1 alla fine (sfumano sui primi/ultimi
// l0/l1 cm; il resto del tubo ha il raggio nominale). Letti dalla funzione tube() della pagina.
const CALIBRI = {
  nsci: { r1: 0.34, l1: 3 }, ntib: { r0: 0.34, l0: 2.5 }, nper: { r0: 0.28, l0: 2, r1: 0.17, l1: 1.5 }, nperS: { r0: 0.15, l0: 1.2 }, nperP: { r0: 0.15, l0: 1.2 },
  apop: { r1: 0.25, l1: 2 }, atpost: { r0: 0.25, l0: 1.5, r1: 0.2, l1: 3 }, atant: { r0: 0.23, l0: 1.5 }, aper: { r0: 0.2, l0: 1.2 },
  vpop: { r1: 0.25, l1: 3 }, vtpost: { r0: 0.25, l0: 2.5 }, vps: { r1: 0.23, l1: 1.2 },
  nsurmed: { r0: 0.11, l0: 0.8 }, nsurlat: { r0: 0.11, l0: 0.8 }, ninfra: { r0: 0.09, l0: 0.8 }, aric: { r0: 0.11, l0: 0.8 },
};

/* ============ Tubi nel sorgente della pagina ============ */
// tutti i tubi di una struttura: punti, raggio, posizione del testo dei punti
function tubi(html, id) {
  const i = html.indexOf(`{id:'${id}',`); if (i < 0) throw new Error('struttura ' + id);
  const fine = html.indexOf('\n {id:', i + 5), out = [];
  for (let j = html.indexOf('tube([[', i); j >= 0 && j < fine; j = html.indexOf('tube([[', j + 1)) {
    const k = html.indexOf(']]', j); out.push({ pts: JSON.parse(html.slice(j + 5, k + 2)), r: parseFloat(html.slice(k + 3)), a: j + 5, b: k + 2 });
  }
  return out;
}
const TUBI = [...M.html.matchAll(/\{id:'(\w+)',nw:1,cat:'(?:art|ven|ner)'/g)].map(m => m[1]);
const correnti = new Map(TUBI.map(id => [id, tubi(M.html, id).map(t => ({ pts: t.pts, r: t.r }))])); // aggiornati man mano

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(...a), nrm = a => { const l = len(a) || 1; return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ricampiona(P, passo) {
  const out = [P[0]]; let resto = 0;
  for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], L = len(sub(b, a)); let t = passo - resto;
    while (t <= L) { out.push(add(a, sub(b, a), t / L)); t += passo; } resto = L - (t - passo); }
  if (len(sub(P[P.length - 1], out[out.length - 1])) > passo * 0.3) out.push(P[P.length - 1]); return out;
}
const distSeg = (p, a, b) => { const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1); return len(sub(p, add(a, ab, t))); };
const distPoli = (p, P) => { let m = Infinity; for (let i = 1; i < P.length; i++) m = Math.min(m, distSeg(p, P[i - 1], P[i])); return m; };
const vicino = (P, q) => { let bi = 0, bd = Infinity; P.forEach((p, i) => { const d = len(sub(p, q)); if (d < bd) { bd = d; bi = i; } }); return P[bi]; };

/* ============ Strutture ============ */
const OSSA = ['femore', 'tibia', 'perone', 'rotula'];
const MUSCOLI = ['retto', 'vint', 'vmed', 'vlat', 'sart', 'grac', 'semit', 'semim', 'biclong', 'bicbrev', 'addmag', 'gmed', 'glat', 'plant', 'pop', 'sol',
  'tibant', 'extdig', 'perlong', 'tibpost', 'fdl', 'fhl', 'ehl', 'perbrev'];
const FIBROSE = ['itb', 'lcm', 'lcl', 'all', 'popfib', 'popobl', 'tenrot', 'tenquad', 'retmed', 'retlat', 'mpfl'];
const BORSE = ['bans', 'bgsm', 'bprep', 'binfsup'];
const PROFONDE = [...OSSA, ...MUSCOLI, ...FIBROSE, ...BORSE]; // involucro sotto la fascia superficiale
const pesi = n => OSSA.includes(n) ? 120 : FIBROSE.includes(n) ? 60 : 40;
// rami articolari (genicolari, discendente) e surali: fuori dalla capsula articolare, che è un manicotto aperto inserito
// sulle ossa. L'interno si ricava una volta sola (griglia di 1 mm sull'ingombro della capsula): superficie della capsula
// ispessita + femore, tibia e rotula fanno da barriera, e ciò che non si raggiunge dal bordo della griglia è intra-articolare
const EXTRACAPSULARI = ['asur', 'agen', 'adisc'];
let CAPS = null;
function campoCapsula() {
  if (CAPS) return CAPS;
  const { pos } = REAL('capsula'), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], pos[i]); hi[k] = Math.max(hi[k], pos[i]); }
  const o = lo.map(v => v - 1), h = 0.1, nx = Math.ceil((hi[0] - lo[0] + 2) / h), ny = Math.ceil((hi[1] - lo[1] + 2) / h), nz = Math.ceil((hi[2] - lo[2] + 2) / h);
  setGriglia(o, h, nx, ny, nz);
  const B = solid('capsula', true), Db = edt(B); for (let i = 0; i < G.N; i++) B[i] = Db[i] <= 0.1 ? 1 : 0;
  for (const n of ['femore', 'tibia', 'rotula']) { const S = solid(n); for (let i = 0; i < G.N; i++) B[i] |= S[i]; }
  const fuori = new Uint8Array(G.N), coda = [], entra = i => { if (!B[i] && !fuori[i]) { fuori[i] = 1; coda.push(i); } };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (!i || !j || !k || i === nx - 1 || j === ny - 1 || k === nz - 1) entra(G.vi(i, j, k));
  while (coda.length) { const v = coda.pop(), i = v % nx, j = ((v / nx) | 0) % ny, k = (v / G.NXY) | 0;
    if (i > 0) entra(v - 1); if (i < nx - 1) entra(v + 1); if (j > 0) entra(v - nx); if (j < ny - 1) entra(v + nx); if (k > 0) entra(v - G.NXY); if (k < nz - 1) entra(v + G.NXY); }
  const R = new Uint8Array(G.N); for (let i = 0; i < G.N; i++) R[i] = fuori[i] ? 0 : 1;
  const Do = edt(R), Di = edt(R, true), F = new Float32Array(G.N); for (let i = 0; i < G.N; i++) F[i] = Do[i] - Di[i];
  return CAPS = { o, h, nx, ny, nz, F };
}
// distanza con segno dalla capsula (positiva fuori), trilineare; lontano dalla capsula: grande
function distCapsula(x, y, z) {
  const { o, h, nx, ny, nz, F } = CAPS; let fx = (x - o[0]) / h - 0.5, fy = (y - o[1]) / h - 0.5, fz = (z - o[2]) / h - 0.5;
  if (fx < 0 || fy < 0 || fz < 0 || fx > nx - 1.001 || fy > ny - 1.001 || fz > nz - 1.001) return 10;
  const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k, b = i + nx * j + nx * ny * k, a = nx, c = nx * ny, l = (p, q, t) => p + (q - p) * t;
  return l(l(l(F[b], F[b + 1], u), l(F[b + a], F[b + a + 1], u), v), l(l(F[b + c], F[b + c + 1], u), l(F[b + c + a], F[b + c + a + 1], u), v), w);
}

/* ============ Percorsi ============ */
// Ogni voce: id (e t, indice del tubo nella struttura, per le strutture con più tubi).
// guida: punti di passaggio anatomici che sostituiscono la guida originale tra il primo e l'ultimo (in y);
// attacca: il tubo nasce dal tronco indicato (nel punto corrispondente a quello originale); attaccaFine: vi termina;
// accompagna: resta a contatto del tubo indicato (vena satellite dell'arteria, nervo del fascio);
// modo(y): 'sup' sottocutaneo, 'prof' sotto l'involucro dei muscoli, null libero; tunnel: {struttura: [yMin, yMax]}
// struttura che il tubo può incidere in quell'intervallo (penalità ridotta); morbidi: fattore sulla penalità dei muscoli
// (nervi peronieri: i muscoli vengono poi incisi, l'osso no). Dopo il calcolo la mesh viene scavata
// lungo il tubo (SCAVA), così il tubo passa in un solco/canale e non attraversa il muscolo; R: raggio di ricerca (cm).
const FOSSA = y => y < 11 && y > -7;
const FORTE = y => y < 16 && y > -12 ? 12 : 1; // dal canale degli adduttori all'arcata del soleo il fascio segue la guida (ordine arteria-vena-nervo)
const PERCORSI = [
  // arteria femorale → poplitea: nel canale degli adduttori sotto il sartorio, tra vasto mediale e adduttore magno;
  // attraversa lo iato degli adduttori, poi è la struttura più profonda della fossa poplitea, sulla faccia poplitea del
  // femore e sulla capsula; scende tra i capi del gastrocnemio sul popliteo e si divide al suo margine inferiore
  { id: 'apop', R: 1.2, liscio: 8, guidaPesi: FORTE, tunnel: { addmag: [11.2, 14.5], gmed: [-7, 3.5, 0.1], glat: [-7, 3.5, 0.1], plant: [-7, 3.5, 0.1], sol: [-12, -4, 0.03] },
    guida: [[2.6, 20.36, 3.75], [2.6, 18, 3.75], [2.4, 16, 3.35], [2.1, 14.2, 2.7], [1.95, 13, 1.5], [1.9, 12, 0.3], [1.4, 11, -0.35], [0.8, 10, -0.75],
      [0.45, 9, -0.95], [0.3, 7, -1.25], [0.3, 5, -1.5], [0.25, 4, -2.0], [0.2, 3, -2.6], [0.15, 2, -3.55], [0.15, 1, -3.95], [0.1, 0, -3.95], [0.0, -1, -3.85],
      [-0.15, -2, -3.6], [-0.2, -3, -3.6], [-0.2, -4, -3.65], [-0.2, -5, -3.55], [-0.3, -6, -3.3], [-0.4, -6.8, -3.1]] },
  // vena femorale → poplitea: satellite dell'arteria, posteriore (superficiale) ad essa nella fossa
  { id: 'vpop', R: 1.2, liscio: 8, guidaPesi: FORTE, tunnel: { addmag: [11.2, 14.5], gmed: [-7, 3.5, 0.1], glat: [-7, 3.5, 0.1], plant: [-7, 3.5, 0.1], sol: [-12, -4, 0.03] },
    guida: [[3.05, 20.54, 3.4], [3.0, 18, 3.35], [2.8, 16, 2.95], [2.45, 14.2, 2.25], [2.25, 13, 1.1], [2.1, 12, -0.1], [1.55, 11, -0.85], [0.95, 10, -1.35],
      [0.6, 9, -1.7], [0.45, 7, -2.0], [0.45, 5, -2.25], [0.4, 4, -2.75], [0.35, 3, -3.35], [0.3, 2, -4.3], [0.3, 1, -4.7], [0.25, 0, -4.7], [0.15, -1, -4.6],
      [0.05, -2, -4.35], [0.0, -3, -4.35], [0.0, -4, -4.4], [0.0, -5, -4.3], [-0.05, -6, -4.05], [-0.1, -6.7, -3.85]] },
  // nervo sciatico: profondo al capo lungo del bicipite, sulla faccia posteriore dell'adduttore magno; si divide
  // all'apice della fossa poplitea
  { id: 'nsci', R: 2.0, guida: [[0.55, 21.38, -0.55], [0.6, 18, -0.55], [0.6, 15, -0.6], [0.45, 13, -0.95], [0.2, 11.56, -1.55]] },
  // nervo tibiale: il più superficiale del fascio nella fossa; scende con i vasi sotto l'arcata del soleo e poi tra
  // soleo e tibiale posteriore
  { id: 'ntib', R: 1.2, liscio: 6, guidaPesi: FORTE, attacca: 'nsci', tunnel: { addmag: [11.2, 14.5], gmed: [-7, 3.5, 0.1], glat: [-7, 3.5, 0.1], plant: [-7, 3.5, 0.1], sol: [-12, -4, 0.03] },
    guida: [[0.2, 11.56, -1.55], [0.2, 10, -2.0], [0.1, 8, -2.4], [-0.2, 6, -2.3], [-0.35, 4, -2.6], [-0.4, 3, -3.2], [-0.45, 2, -4.15], [-0.45, 1, -4.55],
      [-0.5, 0, -4.55], [-0.6, -1, -4.45], [-0.75, -2, -4.2], [-0.8, -3, -4.2], [-0.8, -4, -4.25], [-0.8, -5, -4.15], [-0.9, -6, -3.9], [-1.1, -7, -3.6],
      [-1.35, -8, -3.25], [-1.6, -9, -2.95], [-1.85, -10, -2.65], [-2.0, -11, -2.45], [-1.99, -12, -2.47]] },
  // nervo peroneo comune: lungo il margine mediale del bicipite, dietro la testa del perone e attorno al collo;
  // la divisione è profonda al peroneo lungo, sull'osso (tunnel fibulare)
  { id: 'nper', R: 1.6, morbidi: 0.4, attacca: 'nsci', modo: y => y < -5.3 ? 'prof' : null, prof: 0.3, tunnel: { perlong: [-9, 0] },
    guida: [[0.2, 11.56, -1.55], [-0.3, 10.5, -1.9], [-0.7, 9.3, -2.25], [-1.2, 8, -2.55], [-1.8, 6.5, -2.8], [-2.4, 5, -3.0], [-2.95, 3.5, -3.15],
      [-3.4, 2, -3.2], [-3.75, 0.5, -3.2], [-4.05, -1, -3.15], [-4.25, -3.0, -3.0], [-4.85, -4.2, -2.6], [-5.2, -5.2, -1.9], [-4.85, -5.9, -1.05]] },
  { id: 'nsurlat', attacca: 'nper', modo: y => y > 1.5 ? null : 'sup' }, // perfora la fascia sopra il capo laterale del gastrocnemio
  // nel setto tra peroneo lungo ed estensore lungo delle dita (i due muscoli poggiano sul perone senza spazio: il nervo
  // segue il solco tra i due, senza attraversarne i ventri)
  { id: 'nperS', attacca: 'nper', modo: y => y > -12 ? 'prof' : null, prof: 0.35, tunnel: { perlong: [-8, 0] }, guidaPesi: y => y < -8.5 ? 4 : 1,
    guida: [[-4.0, -9, -0.4], [-4.03, -10.5, -0.3], [-4.04, -12, -0.3], [-4.0, -13.5, -0.5], [-4.02, -15, -0.85], [-4.12, -16.5, -1.1], [-4.15, -18, -1.15], [-4.12, -19.5, -1.1], [-4.08, -20.4, -1.05]] }, // estremità superficiale del setto tra peroneo lungo ed estensore lungo delle dita, staccato dal perone
  { id: 'nperP', morbidi: 0.4, attacca: 'nper', modo: () => 'prof', prof: 0.35, tunnel: { perlong: [-8, 0], extdig: [-9.5, -5.5] } },
  // nervo cutaneo surale mediale e piccola safena: tra i capi del gastrocnemio, poi sottofasciali sul polpaccio
  { id: 'nsurmed', attacca: 'ntib', modo: y => y < -3 ? 'sup' : null },
  { id: 'vps', attaccaFine: 'vpop', modo: y => y < -3 ? 'sup' : null },
  // arterie surali, genicolari e discendente: rami dei vasi principali, a ridosso di ossa e capsula
  // (da: punto del tronco da cui nasce il ramo). Surale mediale: dalla poplitea all'altezza dei condili, indietro e in
  // dentro fino alla faccia profonda del capo mediale del gastrocnemio (non davanti alla poplitea, nel legamento popliteo obliquo)
  { id: 'asur', t: 0, attacca: 'apop', da: [0.15, 0.6, -3.95], guida: [[0.15, 0.6, -3.95], [0.5, 0.2, -4.15], [0.85, -0.3, -4.3], [1.1, -0.8, -4.35]] },
  { id: 'asur', t: 1, attacca: 'apop' },
  // genicolari superiori: attorno al femore sopra i condili, profonde a semimembranoso e bicipite; inferiori: lungo il
  // margine superiore del popliteo, profonde ai capi del gastrocnemio, poi sotto i legamenti collaterali (Gray's, 42ª ed.)
  // superiore mediale: sopra l'origine del capo mediale del gastrocnemio, davanti al semimembranoso e dietro il tendine
  // dell'adduttore magno, poi in avanti attorno al condilo
  { id: 'agen', t: 0, attacca: 'apop', da: [0.3, 5.8, -1.3], guida: [[0.3, 5.8, -1.3], [1.0, 6.1, -1.1], [1.8, 6.2, -0.8], [2.6, 6.0, -0.55], [3.3, 5.4, -0.35],
    [3.8, 4.6, -0.1], [3.92, 3.7, 0.27], [3.65, 3.38, 0.72], [3.42, 3.15, 1.13], [3.28, 2.82, 1.48], [3.11, 2.44, 1.77], [2.97, 2.18, 2.14], [2.88, 2.03, 2.6]] },
  { id: 'agen', t: 1, attacca: 'apop' },
  // inferiore mediale: sotto il condilo tibiale, profonda al LCM, poi in avanti sull'osso fino al margine mediale del
  // tendine rotuleo (finisce sulla tibia, non nel sottocute)
  { id: 'agen', t: 2, attacca: 'apop', da: [0.1, -1.9, -3.75], guida: [[0.1, -1.9, -3.75], [1.0, -2.2, -3.35], [2.0, -2.55, -2.95], [2.95, -2.8, -2.5],
    [3.6, -2.9, -1.8], [3.85, -2.9, -1.0], [3.7, -2.9, -0.2], [3.3, -2.95, 0.6], [2.7, -3.0, 1.3], [2.1, -3.15, 1.8], [1.4, -3.35, 2.25]] },
  { id: 'agen', t: 3, attacca: 'apop' },
  { id: 'adisc', attacca: 'apop' },
  // tibiale anteriore: passa sopra il margine superiore della membrana interossea tra tibia e perone e scende nella
  // loggia anteriore sulla membrana, tra tibiale anteriore ed estensore lungo delle dita
  { id: 'atant', attacca: 'apop', tunnel: { tibpost: [-10.5, -6.5, 0.05], sol: [-9, -5, 0.03] }, guida: [[-0.4, -6.8, -3.1], [-0.8, -7.4, -2.6], [-1.4, -8, -1.9], [-2.0, -8.6, -1.0], [-2.45, -9.2, -0.35], [-2.76, -10.26, 0.06]] },
  { id: 'aric', attacca: 'atant' },
  // tibiale posteriore e vene satelliti: tra tibiale posteriore e soleo (niente scatti laterali sotto l'arcata del soleo)
  { id: 'atpost', attacca: 'apop', tunnel: { sol: [-12, -5, 0.03] }, guida: [[-0.4, -6.8, -3.1], [-0.75, -8, -2.85], [-1.1, -9, -2.6], [-1.4, -10, -2.38], [-1.56, -11, -2.28], [-1.54, -12, -2.32]] },
  { id: 'vtpost', attacca: 'vpop', accompagna: 'atpost', tunnel: { sol: [-12, -5, 0.03] }, guida: [[-0.1, -6.7, -3.85], [-0.45, -8, -3.25], [-0.8, -9, -2.75], [-1.1, -10, -2.5], [-1.26, -11, -2.4], [-1.24, -12, -2.44]] },
  // peroniera: nasce dalla tibiale posteriore e scende lungo il perone con una curva dolce
  { id: 'aper', attacca: 'atpost', guida: [[-1.2, -9.3, -2.5], [-1.8, -10.1, -2.1], [-2.4, -11, -1.9], [-2.7, -12, -1.85], [-2.77, -13, -1.87]] },
  // grande safena: sottocutanea, dietro il condilo mediale e superficiale alla zampa d'oca
  { id: 'vgs', modo: () => 'sup', ignora: ['nsaf', 'ninfra'], liscio: 6, guidaPesi: y => y < 4 && y > -4 ? 4 : 1,
    guida: [[5.9, 9, 0.0], [5.85, 7, 0.15], [5.8, 5, 0.1], [5.8, 3, -0.1], [5.75, 1, -0.35], [5.45, -1, -0.65], [4.7, -3, -0.75]] },
  // nervo safeno: nel canale degli adduttori e poi profondo al sartorio; esce tra il margine posteriore del sartorio e
  // il gracile (non dietro il gracile) e scende sottocutaneo con la grande safena, sempre dietro di essa (non la incrocia)
  { id: 'nsaf', fissoInizio: true, liscio: 6, accompagna: 'vgs', lato: { off: [-0.05, 0, -0.47], y: [-10, 2.8], w: 30 }, vicino: y => y < 1.5, modo: y => y > 3.6 ? 'prof' : y > 2 ? null : 'sup', prof: 0.25, ignora: ['adisc'],
    guida: [[3.36, 9.47, 0.24], [3.6, 8.5, 0.55], [3.95, 7.3, 0.8], [4.35, 6, 0.75], [4.75, 4.8, 0.5], [5.1, 3.8, 0.35], [5.4, 3.0, 0.2], [5.6, 2.2, 0.05], [5.55, 1.2, -0.15], [5.3, -0.5, -0.4], [4.95, -1.8, -0.55]] },
  { id: 'ninfra', attacca: 'nsaf', modo: () => 'sup' },
];
const HC = 0.06, PASSO = 0.25, DMAX = 0.3, MARG = 0.03;
const chiave = P => P.id + (P.t ? '#' + P.t : '');
const tubo0 = (html, P) => tubi(html, P.id)[P.t || 0];

// guida: originale, con il tratto tra primo e ultimo punto di passaggio sostituito (raccordo sugli estremi)
function guida(P) {
  let g = tubo0(H0, P).pts.map(p => p.slice());
  if (P.guida) {
    const V = P.guida, ya = Math.max(V[0][1], V[V.length - 1][1]), yb = Math.min(V[0][1], V[V.length - 1][1]), giu = V[0][1] > V[V.length - 1][1];
    const prima = g.filter(p => giu ? p[1] > ya + 0.3 : p[1] < yb - 0.3), dopo = g.filter(p => giu ? p[1] < yb - 0.3 : p[1] > ya + 0.3);
    g = [...(P.attacca ? [] : prima), ...V.map(p => p.slice()), ...(P.attaccaFine ? [] : dopo)]; // chi si aggancia parte dalla guida
  }
  if (P.via) { const y0 = P.via[0][1] + 0.8; g = g.filter(p => p[1] > y0).concat(P.via); }
  const aggancio = (tronco, q0) => { // estremo del tronco se lì nasceva, altrimenti il punto del tronco nuovo più vicino
    // a quello originale pesando soprattutto la quota (i tronchi si sono spostati in orizzontale)
    const orig = tubi(H0, tronco)[0].pts, nuovo = ricampiona(correnti.get(tronco)[0].pts, 0.05);
    if (len(sub(orig.at(-1), q0)) < 0.05) return nuovo.at(-1).slice(); if (len(sub(orig[0], q0)) < 0.05) return nuovo[0].slice();
    let b = nuovo[0], bd = Infinity; for (const p of nuovo) { const d = 4 * Math.abs(p[1] - q0[1]) + Math.hypot(p[0] - q0[0], p[2] - q0[2]); if (d < bd) { bd = d; b = p; } } return b.slice(); };
  if (P.attacca) g[0] = aggancio(P.attacca, P.da || tubo0(H0, P).pts[0]);
  if (P.attaccaFine) g[g.length - 1] = aggancio(P.attaccaFine, tubo0(H0, P).pts.at(-1));
  return leviga(curva(sezione(g, 0.6)), P.leviga ?? 120);
}
/* ============ Sezioni di taglio ============ */
// Il modello è tagliato a metà coscia e a metà gamba sul piano della cute, y = ±TAGLIO (le mesh vi sono portate da
// estremi-ginocchio.mjs). I tubi che arrivano alla sezione (estremo con |y| > 18 cm) vi terminano tutti: la guida
// viene accorciata o prolungata (lungo la direzione dell'ultimo centimetro) fino a TAGLIO − coda e l'ultimo tratto è
// verticale, così il tappo del tubo è orizzontale e giace sul piano.
const TAGLIO = 20.1;
function sezione(P, coda) {
  const fine = Q => {
    const s = Math.sign(Q.at(-1)[1]); if (s * Q.at(-1)[1] < 18) return Q;
    const Yb = TAGLIO - coda, out = []; let c = null;
    for (let i = 0; i < Q.length; i++) { const p = Q[i]; if (s * p[1] <= Yb) { out.push(p.slice()); continue; }
      const q = Q[i - 1]; c = add(q, sub(p, q), (s * Yb - q[1]) / (p[1] - q[1])); break; }
    if (!c) { const b = out.at(-1); let k = out.length - 2; while (k > 0 && len(sub(b, out[k])) < 1) k--; const a = out[Math.max(0, k)];
      const d = sub(b, a); if (s * d[1] < 0.2 * len(d)) throw new Error('tubo quasi orizzontale alla sezione');
      c = add(b, d, (s * Yb - b[1]) / d[1]); }
    if (len(sub(out.at(-1), c)) < 0.1) out.pop();
    return [...out, c, [c[0], s * (TAGLIO - coda / 2), c[2]], [c[0], s * TAGLIO, c[2]]];
  };
  return fine(fine(P).reverse()).reverse();
}
// Catmull-Rom centripeta ogni 2,5 mm: la guida è già una curva dolce
function curva(P) {
  const Q = [P[0]]; for (const p of P.slice(1)) if (len(sub(p, Q.at(-1))) > 0.05) Q.push(p);
  const out = [];
  for (let i = 0; i < Q.length - 1; i++) {
    const p0 = Q[Math.max(0, i - 1)], p1 = Q[i], p2 = Q[i + 1], p3 = Q[Math.min(Q.length - 1, i + 2)];
    const t01 = Math.sqrt(len(sub(p1, p0))) || 1e-3, t12 = Math.sqrt(len(sub(p2, p1))) || 1e-3, t23 = Math.sqrt(len(sub(p3, p2))) || 1e-3;
    const m1 = [0, 1, 2].map(k => (p2[k] - p1[k]) + t12 * ((p1[k] - p0[k]) / t01 - (p2[k] - p0[k]) / (t01 + t12)));
    const m2 = [0, 1, 2].map(k => (p2[k] - p1[k]) + t12 * ((p3[k] - p2[k]) / t23 - (p3[k] - p1[k]) / (t12 + t23)));
    const n = Math.max(1, Math.ceil(len(sub(p2, p1)) / 0.1));
    for (let j = 0; j < n; j++) { const t = j / n, h00 = 2 * t ** 3 - 3 * t * t + 1, h10 = t ** 3 - 2 * t * t + t, h01 = -2 * t ** 3 + 3 * t * t, h11 = t ** 3 - t * t;
      out.push([0, 1, 2].map(k => h00 * p1[k] + h10 * m1[k] + h01 * p2[k] + h11 * m2[k])); }
  }
  out.push(Q.at(-1)); return ricampiona(out, PASSO);
}
// levigatura della guida (estremi fermi): toglie le ondulazioni dei decorsi originali prima della ricerca
function leviga(P, it) { const Q = P.map(p => p.slice()); for (let r = 0; r < it; r++) { const O = Q.map(p => p.slice()); for (let k = 1; k < Q.length - 1; k++) for (let q = 0; q < 3; q++) Q[k][q] = 0.5 * O[k][q] + 0.25 * (O[k - 1][q] + O[k + 1][q]); } return Q; }

const BB = new Map(); // ingombro delle mesh, per saltare quelle fuori dalla griglia
const dentro = (n, lo, hi) => { if (!BB.has(n)) { const { pos } = REAL(n), a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { const k = i % 3; a[k] = Math.min(a[k], pos[i]); b[k] = Math.max(b[k], pos[i]); } BB.set(n, [a, b]); }
  const [a, b] = BB.get(n); return [0, 1, 2].every(k => b[k] > lo[k] && a[k] < hi[k]); };
function campi(P, g, r, R) {
  if (EXTRACAPSULARI.includes(P.id)) campoCapsula(); // prima di fissare la griglia locale
  const lo = [0, 1, 2].map(k => Math.min(...g.map(p => p[k])) - R - 1.2), hi = [0, 1, 2].map(k => Math.max(...g.map(p => p[k])) + R + 1.2);
  setGriglia(lo, 0.1, Math.ceil((hi[0] - lo[0]) / 0.1), Math.ceil((hi[1] - lo[1]) / 0.1), Math.ceil((hi[2] - lo[2]) / 0.1));
  const Pen = new Float32Array(G.N), tun = P.tunnel || {}, PenT = {};
  const U = new Uint8Array(G.N), Dmin = new Float32Array(G.N).fill(1e9); // distanza con segno dalla struttura più vicina (per le verifiche)
  for (const n of PROFONDE) {
    if (!dentro(n, lo, hi)) continue;
    const S = solid(n); for (let i = 0; i < G.N; i++) U[i] |= S[i];
    const Do = edt(S), Di = edt(S, true), w = pesi(n) * (P.morbidi && MUSCOLI.includes(n) ? P.morbidi : 1), T = tun[n] ? (PenT[n] = new Float32Array(G.N)) : Pen;
    for (let i = 0; i < G.N; i++) { const d = Do[i] - Di[i], p = r + MARG - d; if (p > 0) T[i] += w * p * p; if (d < Dmin[i]) Dmin[i] = d; }
  }
  if (EXTRACAPSULARI.includes(P.id)) for (let k = 0; k < G.NZ; k++) for (let j = 0; j < G.NY; j++) for (let i = 0; i < G.NX; i++) {
    const id2 = G.vi(i, j, k), d = distCapsula(G.O[0] + (i + 0.5) * G.H, G.O[1] + (j + 0.5) * G.H, G.O[2] + (k + 0.5) * G.H), p = r + MARG - d;
    if (p > 0) Pen[id2] += 120 * p * p; if (d < Dmin[id2]) Dmin[id2] = d; }
  // altri tubi (vasi e nervi), esclusi il tubo stesso, il tronco da cui nasce e i suoi rami
  const fam = new Set([P.id, P.attacca, P.attaccaFine, ...(P.ignora || []), ...PERCORSI.filter(q => q.attacca === P.id || q.attaccaFine === P.id).map(q => q.id)]);
  if (P.attacca) PERCORSI.filter(q => q.attacca === P.attacca).forEach(q => fam.add(q.id));
  for (const [id, lista] of correnti) { if (fam.has(id)) continue;
    for (const t of lista) { const pts = ricampiona(t.pts, 0.1), rr = t.r + r + MARG;
      if (!pts.some(p => p.every((v, k) => v > lo[k] - rr && v < hi[k] + rr))) continue;
      const D = new Float32Array(G.N).fill(Infinity);
      for (const p of pts) { const i0 = Math.floor((p[0] - rr - G.O[0]) / G.H), i1 = Math.ceil((p[0] + rr - G.O[0]) / G.H), j0 = Math.floor((p[1] - rr - G.O[1]) / G.H), j1 = Math.ceil((p[1] + rr - G.O[1]) / G.H), k0 = Math.floor((p[2] - rr - G.O[2]) / G.H), k1 = Math.ceil((p[2] + rr - G.O[2]) / G.H);
        for (let k = Math.max(0, k0); k <= Math.min(G.NZ - 1, k1); k++) for (let j = Math.max(0, j0); j <= Math.min(G.NY - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(G.NX - 1, i1); i++) {
          const x = G.O[0] + (i + 0.5) * G.H, y = G.O[1] + (j + 0.5) * G.H, z = G.O[2] + (k + 0.5) * G.H, d = Math.hypot(x - p[0], y - p[1], z - p[2]), id2 = i + G.NX * j + G.NXY * k; if (d < D[id2]) D[id2] = d; } }
      for (let i = 0; i < G.N; i++) { const p = rr - D[i]; if (p > 0) Pen[i] += 40 * p * p; } } }
  // involucro delle strutture profonde (chiusura morfologica di 4 mm: niente solchi tra muscoli vicini) e cute
  const D1 = edt(U), C = new Uint8Array(G.N); for (let i = 0; i < G.N; i++) C[i] = D1[i] <= 0.4 ? 1 : 0;
  const D2 = edt(C, true); for (let i = 0; i < G.N; i++) C[i] = (D2[i] > 0.4 || U[i]) ? 1 : 0;
  const Eo = edt(C), Ei = edt(C, true), E = new Float32Array(G.N); for (let i = 0; i < G.N; i++) E[i] = Eo[i] - Ei[i];
  const K = edt(solid('cute'), true);
  // penalità totale in un punto (strutture, tunnel fuori dal proprio intervallo)
  const pen = (x, y, z) => { let v = sample(Pen, x, y, z); for (const n in PenT) { const [a, b, wt = 0.35] = tun[n], w = y < a || y > b ? 1 : wt; v += w * sample(PenT[n], x, y, z); } return v; };
  return { pen, E, K, Dmin, tun };
}

function instrada(P) {
  let g = guida(P); const r = tubo0(M.html, P).r, R = P.R || 1.2, F = campi(P, g, r, R);
  if (P.modo) { // guida dei tratti sottocutanei portata sotto la cute: si cammina verso la cute (gradiente della distanza
    // dalla cute) e si prende l'ultimo punto in cui si esce dall'involucro dei muscoli (non i solchi tra un muscolo e l'altro)
    const gk = p => { const e = 0.05; return nrm([0, 1, 2].map(q => { const a = p.slice(), b = p.slice(); a[q] += e; b[q] -= e; return sample(F.K, ...b) - sample(F.K, ...a); })); };
    g = g.map((p, k) => { if ((k === 0 && (P.attacca || P.fissoInizio)) || (k === g.length - 1 && P.attaccaFine) || P.modo(p[1]) !== 'sup') return p;
      let q = p.slice(), best = null, prev = sample(F.E, ...q) - (r + 0.08);
      for (let i = 0; i < 120 && sample(F.K, ...q) > 0.05; i++) { const d = gk(q); q = q.map((v, c) => v + d[c] * 0.04); const cur = sample(F.E, ...q) - (r + 0.08); if (prev < 0 && cur >= 0) best = q.slice(); prev = cur; }
      return best || p; });
    g = leviga(g, 40);
  }
  const S = g, n = S.length;
  // riferimenti trasversali lungo la guida (trasporto parallelo)
  const T = S.map((_, k) => nrm(sub(S[Math.min(n - 1, k + 1)], S[Math.max(0, k - 1)])));
  const Ux = [], Vx = []; let u = nrm(cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  // decorso sempre discendente (|tangente verticale| > 0,35): piani orizzontali, una sola posizione per quota;
  // altrimenti piani perpendicolari alla guida
  const verticale = T.every(t => Math.abs(t[1]) > 0.35);
  for (let k = 0; k < n; k++) { if (verticale) { Ux.push([1, 0, 0]); Vx.push([0, 0, 1]); continue; } u = nrm(sub(u, T[k].map(v => v * dot(u, T[k])))); Ux.push(u); Vx.push(cross(T[k], u)); }
  const C = [], idx = new Map(), m = Math.round(R / HC);
  for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) if (a * a + b * b <= m * m) { idx.set(a + ',' + b, C.length); C.push([a, b]); }
  const nd = Math.ceil(DMAX / HC), vic = C.map(([a, b]) => { const l = []; for (let da = -nd; da <= nd; da++) for (let db = -nd; db <= nd; db++) { if (da * da + db * db > nd * nd) continue; const j = idx.get((a + da) + ',' + (b + db)); if (j !== undefined) l.push(j); } return l; });
  const compB = new Map(); if (P.accompagna) for (const q of ricampiona(correnti.get(P.accompagna)[0].pts, 0.1)) { const b = Math.floor(q[1] / 0.5); (compB.get(b) || compB.set(b, []).get(b)).push(q); }
  const comp = P.accompagna ? true : null, rc = P.accompagna ? correnti.get(P.accompagna)[0].r : 0, vicino = P.vicino || (() => true);
  const punto = (k, c) => add(add(S[k], Ux[k], C[c][0] * HC), Vx[k], C[c][1] * HC);
  const extra = (p, sup) => { // vincoli di piano e di vicinanza
    const [x, y, z] = p; let v = 0; const md = P.modo ? P.modo(y) : null, e = sample(F.E, x, y, z);
    if (md === 'sup') { const s = sample(F.K, x, y, z); v += 30 * Math.max(0, e - (r + 0.06)) ** 2 + 60 * Math.max(0, r + 0.02 - e) ** 2 + 60 * Math.max(0, r + 0.05 - s) ** 2; }
    else if (md === 'prof') v += 30 * Math.max(0, P.prof + e) ** 2;
    if (P.lato && y > P.lato.y[0] && y < P.lato.y[1]) { // lato fisso rispetto al tubo accompagnato (niente incroci)
      let bq = null, bd = Infinity; const b0 = Math.floor(y / 0.5); for (let b = b0 - 1; b <= b0 + 1; b++) for (const q of compB.get(b) || []) { const d = Math.abs(q[1] - y); if (d < bd) { bd = d; bq = q; } }
      if (bq) { const w = sstep(P.lato.y[0], P.lato.y[0] + 1, y) * (1 - sstep(P.lato.y[1] - 1, P.lato.y[1], y)); v += P.lato.w * w * ((x - bq[0] - P.lato.off[0]) ** 2 + (z - bq[2] - P.lato.off[2]) ** 2); } }
    if (comp && vicino(y)) { let dv = Infinity; const b0 = Math.floor(y / 0.5); for (let b = b0 - 2; b <= b0 + 2; b++) for (const q of compB.get(b) || []) dv = Math.min(dv, Math.hypot(x - q[0], y - q[1], z - q[2])); if (dv < Infinity) v += 10 * Math.max(0, dv - (r + rc + 0.2)) ** 2 + 400 * Math.max(0, r + rc + 0.05 - dv) ** 2; }
    return v;
  };
  const costo = (k, c) => { const p = punto(k, c), o2 = (C[c][0] ** 2 + C[c][1] ** 2) * HC * HC; return F.pen(...p) + 0.3 * (P.guidaPesi ? P.guidaPesi(p[1]) : 1) * o2 + extra(p); };
  const nc = C.length, zero = idx.get('0,0'), fissoI = P.fissoInizio || P.attacca, fissoF = P.fissoFine || P.attaccaFine;
  let cur = new Float64Array(nc).fill(Infinity), back = [];
  if (fissoI) cur[zero] = 0; else for (let c = 0; c < nc; c++) cur[c] = costo(0, c);
  for (let k = 1; k < n; k++) {
    const nx = new Float64Array(nc).fill(Infinity), bk = new Int32Array(nc).fill(-1), ds = len(sub(S[k], S[k - 1])) || PASSO;
    for (let c = 0; c < nc; c++) { if (fissoF && k === n - 1 && c !== zero) continue; let best = Infinity, bi = -1;
      for (const j of vic[c]) { const pc = cur[j]; if (pc === Infinity) continue; const da = (C[c][0] - C[j][0]) * HC, db = (C[c][1] - C[j][1]) * HC, t = pc + 12 * (P.liscio || 1) * (da * da + db * db) / ds; if (t < best) { best = t; bi = j; } }
      if (bi >= 0) { nx[c] = best + costo(k, c); bk[c] = bi; } }
    cur = nx; back.push(bk);
  }
  let c = 0; for (let j = 1; j < nc; j++) if (cur[j] < cur[c]) c = j;
  let path = new Array(n); for (let k = n - 1; k >= 0; k--) { path[k] = punto(k, c); if (k > 0) c = back[k - 1][c]; }
  if (process.env.DEBUG) { const pg = pts => { let mx = 0, yr = [Infinity, -Infinity]; for (let k = 1; k < pts.length - 1; k++) { const a = nrm(sub(pts[k], pts[k - 1])), b = nrm(sub(pts[k + 1], pts[k])); mx = Math.max(mx, Math.acos(clamp(dot(a, b), -1, 1)) * 57.3); } pts.forEach(p => { yr[0] = Math.min(yr[0], p[1]); yr[1] = Math.max(yr[1], p[1]); }); return `piega ${mx.toFixed(0)}° y ${yr.map(v => v.toFixed(1))}`; };
    log(`  ${chiave(P)} guida: ${pg(S)}; ricerca: ${pg(path)}; y ${path.filter((_, k) => k % 8 === 0).map(p => p[1].toFixed(1)).join(' ')}`); }
  let pre = null; // punto del tronco 2,5 mm prima dell'aggancio: il ramo ne esce tangente
  if (P.attacca) { const tr = ricampiona(correnti.get(P.attacca)[0].pts, PASSO); let bi = 0, bd = Infinity; tr.forEach((p, i) => { const d = len(sub(p, path[0])); if (d < bd) { bd = d; bi = i; } });
    // solo se il ramo parte nella stessa direzione del tronco (biforcazione); i rami ad angolo (genicolari) no, o farebbero un'ansa
    const dt = nrm(sub(tr[Math.min(tr.length - 1, bi + 1)], tr[Math.max(0, bi - 1)])), db = nrm(sub(path[Math.min(n - 1, 8)], path[0]));
    if (bi > 0 && dot(dt, db) > 0.5) pre = tr[bi - 1]; }
  const gp = y => 0.3 * (P.guidaPesi ? P.guidaPesi(y) : 1); // anche la banda elastica resta legata alla guida
  path = elastica(path, (p, k) => F.pen(...p) + extra(p) + gp(p[1]) * (dot(sub(p, S[k]), Ux[k]) ** 2 + dot(sub(p, S[k]), Vx[k]) ** 2), Ux, Vx, 20 * (P.liscio || 1), pre); // estremi fermi (aggancio o punto scelto dalla ricerca)
  if (process.env.DEBUG) log(`  dopo elastica: n ${path.length}, y ${path.filter((_, k) => k % 8 === 0).map(p => p[1].toFixed(1)).join(' ')}`);
  const out = sezione(path.filter((_, k) => k % 2 === 0 || k === n - 1), 0.25); // tappo orizzontale sul piano di taglio
  // verifica: compenetrazione del tubo (raggio r) nelle strutture da evitare (tunnel esclusi nel loro intervallo), in mm
  const valuta = pts => { let mx = 0, n5 = 0; const Q = ricampiona(pts, 0.1); for (const p of Q) { const q = r - sample(F.Dmin, ...p); if (Object.entries(F.tun).some(([, [a, b]]) => p[1] >= a && p[1] <= b)) continue; mx = Math.max(mx, q); if (q > 0.05) n5++; }
    return `compenetrazione massima ${(Math.max(0, mx) * 10).toFixed(1)} mm, oltre 0,5 mm nel ${(100 * n5 / Q.length).toFixed(0)}% del decorso`; };
  const piega = pts => { let mx = 0; const Q = ricampiona(pts, 0.25); for (let k = 1; k < Q.length - 1; k++) { const a = nrm(sub(Q[k], Q[k - 1])), b = nrm(sub(Q[k + 1], Q[k])); mx = Math.max(mx, Math.acos(clamp(dot(a, b), -1, 1)) * 180 / Math.PI); } return mx; };
  if (process.env.DEBUG) log(`  piani ${verticale ? 'orizzontali' : 'perpendicolari'}`);
  log(`${chiave(P)}: prima ${valuta(tubo0(H0, P).pts)}, piega max ${piega(tubo0(H0, P).pts).toFixed(0)}° → dopo ${valuta(out)}, piega max ${piega(out).toFixed(0)}° ogni 2,5 mm`);
  return out;
}
// banda elastica: discesa del gradiente su energia = penalità (strutture, piani) + λ·flessione (differenze seconde al
// quadrato). Ogni punto si muove solo nel proprio piano trasversale (U, V della ricerca): niente scorrimenti lungo il
// decorso, quindi niente anse; gli estremi restano fermi (aggancio o punto scelto dalla ricerca)
function elastica(P, f, U, V, lam = 20, pre = null) {
  const Q = P.map(p => p.slice()), n = Q.length, e = 0.02;
  for (let it = 0; it < 9000; it++) {
    const Fz = Q.map(() => [0, 0, 0]);
    if (pre) { const d = [0, 1, 2].map(q => pre[q] - 2 * Q[0][q] + Q[1][q]); for (let q = 0; q < 3; q++) Fz[1][q] -= lam * d[q]; } // uscita tangente al tronco
    for (let k = 1; k < n - 1; k++) { // flessione: forza = -∂/∂p Σ|p[k-1]-2p[k]+p[k+1]|²
      const d = [0, 1, 2].map(q => Q[k - 1][q] - 2 * Q[k][q] + Q[k + 1][q]);
      for (let q = 0; q < 3; q++) { Fz[k - 1][q] -= lam * d[q]; Fz[k][q] += 2 * lam * d[q]; Fz[k + 1][q] -= lam * d[q]; } }
    let mx = 0;
    for (let k = 1; k < n - 1; k++) {
      const pu = t => add(Q[k], U[k], t), pv = t => add(Q[k], V[k], t), v = f(Q[k], k);
      const gu = v > 1e-4 ? 2 * (f(pu(e), k) - f(pu(-e), k)) / (2 * e) : 0, gv = v > 1e-4 ? 2 * (f(pv(e), k) - f(pv(-e), k)) / (2 * e) : 0;
      const h = 0.05 / lam, su = h * (dot(Fz[k], U[k]) - gu), sv = h * (dot(Fz[k], V[k]) - gv), sl = Math.hypot(su, sv), c = sl > 0.01 ? 0.01 / sl : 1;
      for (let q = 0; q < 3; q++) Q[k][q] += (U[k][q] * su + V[k][q] * sv) * c; mx = Math.max(mx, sl * c); }
    if (mx < 5e-6) break;
  }
  return Q;
}

const nuovi = [];
const SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null; // per le prove: solo alcuni tubi
for (const P of (SOLO_CANALI ? [] : PERCORSI)) { if (SOLO && !SOLO.includes(chiave(P))) continue; const out = instrada(P); nuovi.push([P, out]); const L = correnti.get(P.id); L[P.t || 0] = { pts: out, r: L[P.t || 0].r }; }
if (PROVA) process.exit(0);
let html = M.html;
const sostituzioni = nuovi.map(([P, pts]) => ({ ...tubo0(html, P), id: P.id, pts })).sort((a, b) => b.a - a.a);
for (const t of sostituzioni) {
  const coda = html.slice(t.b).match(/^,([\d.]+)(?:,\{([^}]*)\})?\)/), opz = (coda[2] || '').split(',').filter(x => x && !/^(r0|r1|l0|l1):/.test(x));
  const c = CALIBRI[t.id] || {}; for (const k of ['r0', 'l0', 'r1', 'l1']) if (c[k] !== undefined) opz.push(`${k}:${c[k]}`);
  html = html.slice(0, t.a) + JSON.stringify(t.pts.map(p => p.map(v => +v.toFixed(2)))) + `,${coda[1]}${opz.length ? ',{' + opz.join(',') + '}' : ''})` + html.slice(t.b + coda[0].length);
}
scava();
M.html = html; saveFile(repack()); // tubi nuovi e muscoli con i solchi
