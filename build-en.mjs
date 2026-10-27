/* Versione inglese del sito, generata dalla build (node build-site.mjs) in dist/en/.
   I file italiani restano l'unica fonte: qui si sostituiscono i loro testi con quelli di traduzioni/<nome>.en.json
   (home, 404, comune = script comuni, <nome>-3d = modelli). Nessun file italiano viene modificato.

   Formato di traduzioni/<nome>.en.json:
     meta       { title|description|image_alt|strutture-…: { it, en } }   <title> e <meta> (og/twitter compresi)
     strutture  { <id>: { name|info|o|ins|fn: { it, en } } }              righe {id,cat,name,…} dei modelli
     testi      { "<testo italiano>": "<inglese>" }                       tutto il resto (HTML e stringhe JS); le cifre
                                                                           si possono scrivere {n}: "{n} strutture"
     ignora     [ "<testo>" ]                                              stringhe che restano uguali
     codice     [ { file?, da, a, volte? } ]                               sostituzioni esatte nel codice (prima della traduzione)
     dubbi      [ { termine, nota } ]                                      termini da rivedere (solo per il prospetto)
   Le voci con "it" conservano il testo italiano tradotto: se il sorgente cambia la voce risulta MODIFICATA
   (resta l'inglese precedente); una voce assente o con "en" vuoto è SENZA TRADUZIONE.

   In produzione una pagina inglese è pubblicata solo se non ha testi senza traduzione (e lo sono home e comune);
   nella build --preview le pagine inglesi ci sono sempre, con il testo italiano dove manca la traduzione.
   Opzioni di node build-site.mjs: --traduzioni (rapporto dettagliato), --rigoroso (errore se qualcosa manca o è modificato).
   Sta nella radice, non in strumenti/: .vercelignore esclude strumenti/ e su Vercel la build non lo troverebbe. */
import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';

export const SITO = 'https://www.mskatlas.com';
/* script comuni tradotti in dist/en/assets/: le pagine inglesi li caricano con lo stesso percorso relativo */
export const COMUNI = ['assets/nav.js', 'assets/scheda.js', 'assets/segnala.js', 'assets/ricerca.js', 'assets/ricerca-modello.js'];
/* fogli di stile caricati accanto agli script tradotti (new URL(…, src)): copiati così come sono */
const COPIE = ['assets/segnala.css', 'assets/ricerca-modello.css'];
const PROPRIETA = ['name', 'info', 'o', 'ins', 'fn'];

/* ---------- stringhe JS ---------- */
export function decodificaJS(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (m, e) => {
    if (e[0] === 'u' && e[1] === '{') return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e[0] === 'u' && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e === '\n' || e === '\r\n' || e === '\r' || e === '\u2028' || e === '\u2029') return '';
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }[e] ?? e;
  });
}
function codificaJS(s, q) {
  let o = s.replace(/\\/g, '\\\\').split(q).join('\\' + q);
  if (q === '`') return o.replace(/\$\{/g, '\\${');
  return o.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/* token essenziali: stringhe ('…' "…"), parti di template (`…${ … }…`), identificatori, punteggiatura; commenti e regex saltati */
export function tokenizzaJS(src) {
  const t = [], n = src.length, tpl = [];
  let i = 0, graffe = 0;
  const ID = /[A-Za-z0-9_$\u0080-￿]/, KW = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
  const ultimo = () => t[t.length - 1];
  const template = p => {   /* da p (dopo ` o dopo la } di ${…}) fino a ` o ${ */
    let j = p;
    while (j < n && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
    const raw = src.slice(p, j);
    t.push({ tipo: 'tpl', a: p, b: j, q: '`', valore: decodificaJS(raw) });
    if (src[j] === '$') { tpl.push(graffe); return j + 2; }
    return j + 1;
  };
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      t.push({ tipo: 'str', a: i, b: j + 1, q: c, valore: decodificaJS(src.slice(i + 1, j)) });
      i = j + 1; continue;
    }
    if (c === '`') { i = template(i + 1); continue; }
    if (c === '}' && tpl.length && tpl[tpl.length - 1] === graffe) { tpl.pop(); i = template(i + 1); continue; }
    if (c === '/') {
      const u = ultimo();
      const regex = !u || (u.tipo === 'p' && !')]}'.includes(u.v)) || (u.tipo === 'id' && KW.has(u.v));
      if (regex) {
        let j = i + 1, classe = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') classe = true; else if (src[j] === ']') classe = false; else if (src[j] === '/' && !classe) break;
          j++;
        }
        j++; while (j < n && /[a-z]/i.test(src[j])) j++;
        t.push({ tipo: 'regex', a: i, b: j }); i = j; continue;
      }
    }
    if (ID.test(c)) { let j = i + 1; while (j < n && ID.test(src[j])) j++; t.push({ tipo: 'id', a: i, b: j, v: src.slice(i, j) }); i = j; continue; }
    if (c === '{') graffe++; else if (c === '}') graffe--;
    t.push({ tipo: 'p', a: i, b: i + 1, v: c }); i++;
  }
  return t;
}

function applica(s, modifiche) {
  modifiche.sort((x, y) => x.a - y.a);
  let o = '', p = 0;
  for (const m of modifiche) { if (m.a < p) throw new Error('Sostituzioni sovrapposte'); o += s.slice(p, m.a) + m.s; p = m.b; }
  return o + s.slice(p);
}

export function traduciJS(src, ctx) {
  const t = tokenizzaJS(src), chiavi = new Map(), pila = [], modifiche = [];
  const punto = (k, v) => t[k] && t[k].tipo === 'p' && t[k].v === v;
  /* righe delle strutture: oggetti con id, cat e name stringhe */
  for (let k = 0; k < t.length; k++) {
    if (punto(k, '{')) { pila.push({ __nome: punto(k - 1, '=') && t[k - 2]?.tipo === 'id' ? t[k - 2].v : null }); continue; }
    if (punto(k, '}')) {
      const o = pila.pop();
      /* {id, cat, name, …}; oppure gruppo con nome proprio (const PES={…, name, info}) → id «@PES» */
      const id = o && o.name != null && (o.id != null && o.cat != null ? t[o.id].valore : o.__nome && o.info != null ? '@' + o.__nome : null);
      if (id) for (const p of PROPRIETA) if (o[p] != null) chiavi.set(o[p], { id, prop: p });
      continue;
    }
    if ((t[k].tipo === 'id' || t[k].tipo === 'str') && punto(k + 1, ':') && t[k + 2]?.tipo === 'str' && (punto(k + 3, ',') || punto(k + 3, '}')) && pila.length)
      pila[pila.length - 1][t[k].tipo === 'id' ? t[k].v : t[k].valore] = k + 2;
  }
  for (let k = 0; k < t.length; k++) {
    const x = t[k];
    if (x.tipo === 'tpl') {
      const v = traduciFrammento(x.valore, ctx);
      if (v !== x.valore) modifiche.push({ a: x.a, b: x.b, s: codificaJS(v, '`') });
      continue;
    }
    if (x.tipo !== 'str') continue;
    if (chiavi.has(k)) {
      const { id, prop } = chiavi.get(k), en = ctx.traduci({ tipo: 'struttura', id, prop, it: x.valore });
      if (en != null && en !== x.valore) modifiche.push({ a: x.a + 1, b: x.b - 1, s: codificaJS(en, x.q) });
      continue;
    }
    /* catena 'a' + 'b' + …: un testo HTML può essere diviso fra più stringhe (es. nav.js) */
    let e = k;
    while (punto(e + 1, '+') && t[e + 2]?.tipo === 'str' && !chiavi.has(e + 2) && !['.', '[', '('].some(v => punto(e + 3, v))) e += 2;
    const pezzi = []; for (let j = k; j <= e; j += 2) pezzi.push(t[j].valore);
    const prima = pezzi.join(''), dopo = traduciFrammento(prima, ctx);
    if (dopo !== prima) modifiche.push({ a: x.a, b: t[e].b, s: x.q + codificaJS(dopo, x.q) + x.q });
    k = e;
  }
  return applica(src, modifiche);
}

/* ---------- HTML ---------- */
const INLINE = new Set('a abbr b bdi bdo br cite code data dfn em i kbd mark q s samp small span strong sub sup time u var wbr'.split(' '));
const VUOTI = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));
const ATTRIBUTI = new Set(['alt', 'title', 'aria-label', 'placeholder', 'data-summary', 'label']);
const META = { description: 'description', 'og:description': 'description', 'twitter:description': 'description',
  'og:title': 'title', 'twitter:title': 'title', 'og:image:alt': 'image_alt' };
const NON_JS = /^(text\/plain|application\/(ld\+)?json)$/i;

export function lexHTML(s, frammento) {
  const out = [], n = s.length, NOME = /[^\s=>\/"']+/y, VAL = /[^\s>]+/y, TAG = /<(\/?)([a-zA-Z][\w:-]*)/y;
  let i = 0;
  if (frammento) {   /* frammento che inizia dentro un tag aperto in un'altra stringa: '">testo</b>' */
    const gt = s.indexOf('>'), lt = s.indexOf('<');
    if (gt >= 0 && (lt < 0 || gt < lt)) { out.push({ t: 'coda', a: 0, b: gt + 1 }); i = gt + 1; }
  }
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { out.push({ t: 'testo', a: i, b: n }); break; }
    if (lt > i) out.push({ t: 'testo', a: i, b: lt });
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4), b = e < 0 ? n : e + 3; out.push({ t: 'commento', a: lt, b }); i = b; continue; }
    TAG.lastIndex = lt;
    const m = TAG.exec(s);
    if (!m) { out.push({ t: 'testo', a: lt, b: lt + 1 }); i = lt + 1; continue; }
    const attr = [];
    let j = TAG.lastIndex, aperto = false;
    for (;;) {
      while (j < n && /[\s\/]/.test(s[j])) j++;
      if (j >= n) { aperto = true; break; }
      if (s[j] === '>') break;
      NOME.lastIndex = j;
      const nm = NOME.exec(s);
      if (!nm) { j++; continue; }
      const nome = nm[0].toLowerCase();
      j = NOME.lastIndex;
      let k = j; while (k < n && /\s/.test(s[k])) k++;
      if (s[k] === '=') {
        k++; while (k < n && /\s/.test(s[k])) k++;
        const q = s[k];
        if (q === '"' || q === "'") {
          const e = s.indexOf(q, k + 1);
          if (e < 0) { aperto = true; break; }
          attr.push({ nome, a: k + 1, b: e }); j = e + 1;
        } else { VAL.lastIndex = k; const v = VAL.exec(s); const b = v ? VAL.lastIndex : k; attr.push({ nome, a: k, b }); j = b; }
      } else attr.push({ nome, a: j, b: j });
    }
    if (aperto) { if (frammento) { out.push({ t: 'coda', a: lt, b: n }); break; } out.push({ t: 'testo', a: lt, b: lt + 1 }); i = lt + 1; continue; }
    const tag = { t: 'tag', a: lt, b: j + 1, nome: m[2].toLowerCase(), chiuso: !!m[1], attr, auto: s[j - 1] === '/' };
    out.push(tag); i = j + 1;
    if (!tag.chiuso && (tag.nome === 'script' || tag.nome === 'style')) {
      const e = s.toLowerCase().indexOf('</' + tag.nome, i), b = e < 0 ? n : e;
      out.push({ t: 'raw', a: i, b, tag }); i = b;
    }
  }
  return out;
}
const valore = (s, tag, nome) => { const a = tag.attr.find(x => x.nome === nome); return a ? s.slice(a.a, a.b) : null; };

/* unità da tradurre: blocchi di testo (con i tag in linea: <b>, <a>, <span>…) e attributi; svg, script e style esclusi */
export function unitaHTML(s, frammento) {
  const tok = lexHTML(s, frammento), unita = [], html = !frammento || /<\/?(a|b|p|i|div|span|strong|em|section|label|button|li|ul|ol|h[1-6]|input|select|option|form|small|br|cite|code|summary|details)\b/i.test(s);   /* testo HTML: sempre visibile, quindi sempre da tradurre */
  let corsa = [], genitore = null, svg = 0;
  const testo = x => x.t === 'testo' && s.slice(x.a, x.b).trim() !== '';
  /* sequenza di token in linea → unità: testo più i tag necessari a tenerlo bilanciato; elementi fratelli separati
     solo da spazi (<a>Contatti</a> <a>Modelli</a>) diventano unità distinte */
  const emetti = seq => {
    let fi = seq.findIndex(testo), li = seq.findLastIndex(testo);
    if (fi < 0) return;
    for (let cambia = true; cambia;) {
      cambia = false;
      for (let k = fi; k <= li; k++) {
        const x = seq[k];
        if (x.t !== 'tag' || VUOTI.has(x.nome)) continue;
        let d = 0, m = -1;
        if (!x.chiuso) { for (let j = k; j < seq.length; j++) { const y = seq[j]; if (y.t === 'tag' && y.nome === x.nome) { d += y.chiuso ? -1 : 1; if (!d) { m = j; break; } } } if (m > li) { li = m; cambia = true; } }
        else { for (let j = k; j >= 0; j--) { const y = seq[j]; if (y.t === 'tag' && y.nome === x.nome) { d += y.chiuso ? 1 : -1; if (!d) { m = j; break; } } } if (m >= 0 && m < fi) { fi = m; cambia = true; } }
      }
    }
    const parte = seq.slice(fi, li + 1), figli = [];
    let d = 0, inizio = -1, sciolto = false, rotto = false;
    for (let k = 0; k < parte.length; k++) {
      const x = parte[k];
      if (x.t === 'tag' && !VUOTI.has(x.nome)) {
        if (!x.chiuso) { if (!d) inizio = k; d++; }
        else if (--d === 0) figli.push([inizio, k]); else if (d < 0) { rotto = true; d = 0; }
        continue;
      }
      if (!d && (testo(x) || (x.t === 'tag' && x.nome === 'br'))) sciolto = true;
    }
    if (!sciolto && !rotto && !d && figli.length > 1) { for (const [a, b] of figli) emetti(parte.slice(a + 1, b)); return; }
    let a = parte[0].a, b = parte[parte.length - 1].b;
    if (parte[0].t === 'testo') a += s.slice(a, b).length - s.slice(a, b).trimStart().length;
    if (parte[parte.length - 1].t === 'testo') b -= s.slice(a, b).length - s.slice(a, b).trimEnd().length;
    unita.push(genitore === 'title' ? { tipo: 'meta', chiave: 'title', a, b, it: s.slice(a, b) } : { tipo: 'testo', a, b, it: s.slice(a, b), html });
  };
  const flush = () => { emetti(corsa); corsa = []; };
  for (const x of tok) {
    if (x.t === 'tag') {
      if (x.nome === 'svg') { if (!x.chiuso) { flush(); if (!x.auto) svg++; } else svg--; continue; }
      if (svg > 0) continue;
      if (x.nome === 'meta') {
        const nome = valore(s, x, 'name') ?? valore(s, x, 'property'), c = x.attr.find(y => y.nome === 'content');
        const chiave = META[nome] || (nome && nome.startsWith('strutture-') ? nome : null);
        if (c && chiave) unita.push({ tipo: 'meta', chiave, a: c.a, b: c.b, it: s.slice(c.a, c.b) });
      }
      for (const y of x.attr) if (ATTRIBUTI.has(y.nome) && y.b > y.a) unita.push({ tipo: 'testo', a: y.a, b: y.b, it: s.slice(y.a, y.b), html });
      if (INLINE.has(x.nome)) { corsa.push(x); continue; }
      flush(); genitore = x.chiuso ? null : x.nome; continue;
    }
    if (svg > 0) continue;
    if (x.t === 'testo') { corsa.push(x); continue; }
    flush();
    if (x.t === 'raw' && x.tag.nome === 'script' && !valore(s, x.tag, 'src') && !NON_JS.test(valore(s, x.tag, 'type') || '')) unita.push({ tipo: 'script', a: x.a, b: x.b });
  }
  flush();
  return unita;
}

function traduciUnita(s, unita, ctx) {
  const modifiche = [];
  for (const u of unita) {
    if (u.tipo === 'script') { const js = s.slice(u.a, u.b), en = traduciJS(js, ctx); if (en !== js) modifiche.push({ a: u.a, b: u.b, s: en }); continue; }
    const en = ctx.traduci(u);
    if (en != null && en !== u.it) modifiche.push({ a: u.a, b: u.b, s: en });
  }
  return applica(s, modifiche);
}
export const traduciFrammento = (s, ctx) => /[A-Za-zÀ-ÿ]/.test(s) ? traduciUnita(s, unitaHTML(s, true), ctx) : s;
export const traduciHTML = (s, ctx) => traduciUnita(s, unitaHTML(s, false), ctx);

/* ---------- tabelle e controlli ---------- */
export const norm = s => String(s).replace(/\s+/g, ' ').trim();
const PAROLE = new Set('di del dello della dei degli delle il lo la le gli un una uno per con non da dal dalla dai dalle nel nello nella nei nelle che al allo alla ai alle sono è si su sul sulla tra fra e ed o in a come più se ma anche'.split(' '));
/* testo che sembra italiano da tradurre (le altre stringhe del codice si ignorano finché non hanno una voce) */
export function daTradurre(t) {
  const s = t.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').trim();
  if (!/[A-Za-zÀ-ÿ]/.test(s) || /[{}]|=>|\$\{|^[.#\/]|^https?:|\.(js|css|html|svg|png|webp|jpg|json|br)\b/.test(s)) return false;
  if (/[=*]/.test(s)) return false;   /* codice (GLSL, CSS, condizioni) */
  if (!/\s/.test(s)) return /^[A-ZÀ-Ý][a-zà-ÿ’']+(?:-[a-zà-ÿ’']+)*[.…:]?$/.test(s) || /^[a-zà-ÿ’']*[àèéìòù][a-zà-ÿ’']*$/.test(s);   /* una parola sola: «Ossa», «Flessori-pronatori», «Già» */
  if (/[àèéìòùÀÈÉÌÒÙ]/.test(s)) return true;
  const w = s.match(/[A-Za-zÀ-ÿ’']+/g) || [];
  if (w.length >= 2 && w.some(x => PAROLE.has(x.toLowerCase()))) return true;
  return /^[A-ZÀ-Ý][a-zà-ÿ’']+(?: [A-Za-zà-ÿ’'.()–-]+)*[.…:]?$/.test(s) || /^[a-zà-ÿ’']+(?: [a-zà-ÿ’']+)+$/.test(s);   /* «piano sagittale» */
}

export function creaContesto(nome, tabelle) {
  const [pagina] = tabelle, ignora = new Set(tabelle.flatMap(T => T.ignora || []).map(norm));
  const stato = { nome, ok: 0, mancanti: [], modificati: [] };
  const segna = (T, chiave) => (T.__usate ||= new Set()).add(chiave);
  const voce = (e, chiave, it) => {
    segna(pagina, chiave);
    if (!e || !e.en) { stato.mancanti.push({ chiave, it }); return null; }
    if (norm(e.it) !== norm(it)) stato.modificati.push({ chiave, prima: e.it, ora: it });
    stato.ok++; return e.en;
  };
  const traduci = u => {
    if (u.tipo === 'struttura') return norm(u.it) ? voce(pagina.strutture?.[u.id]?.[u.prop], `strutture.${u.id}.${u.prop}`, u.it) : null;
    if (u.tipo === 'meta') return norm(u.it) ? voce(pagina.meta?.[u.chiave], `meta.${u.chiave}`, u.it) : null;
    const k = norm(u.it);
    if (!k) return null;
    const cifre = k.match(/\d+/g), modello = cifre && k.replace(/\d+/g, '{n}');
    for (const T of tabelle) {
      for (const [chiave, riempi] of [[k, null], [modello, cifre]]) {
        if (!chiave || !T.testi || !Object.hasOwn(T.testi, chiave)) continue;
        segna(T, 'testi.' + chiave);
        const en = T.testi[chiave];
        if (!en) { stato.mancanti.push({ chiave: 'testi', it: chiave }); return null; }
        stato.ok++;
        if (!riempi) return en;
        let i = 0; return en.replace(/\{n\}/g, () => riempi[i++] ?? '');
      }
    }
    if (!ignora.has(k) && (u.obbligatorio || (u.html && /[A-Za-zÀ-ÿ]{2}/.test(k.replace(/<[^>]*>/g, ''))) || daTradurre(k))) stato.mancanti.push({ chiave: 'testi', it: k });
    return null;
  };
  return { traduci, stato, tabelle };
}

/* testi che build-site.mjs aggiunge alla home solo in produzione (schede delle bozze): nelle preview e in strumenti/traduzioni.mjs non compaiono */
const SOLO_PRODUZIONE = ['testi.In lavorazione · Prossimamente', 'testi.{n} disponibili · {n} in arrivo'];

/* voci che nessuna pagina ha usato */
export function obsolete(T) {
  const u = new Set([...(T.__usate || []), ...SOLO_PRODUZIONE]), o = [];
  for (const [k, v] of Object.entries(T.meta || {})) if (!u.has('meta.' + k)) o.push('meta.' + k);
  for (const [id, p] of Object.entries(T.strutture || {})) for (const k of Object.keys(p)) if (!u.has(`strutture.${id}.${k}`)) o.push(`strutture.${id}.${k}`);
  for (const k of Object.keys(T.testi || {})) if (!u.has('testi.' + k)) o.push('testi.' + k);
  return o;
}

export function applicaCodice(s, T, file) {
  for (const c of T.codice || []) {
    if ((c.file || null) !== (file || null) && c.file !== undefined) continue;
    const volte = s.split(c.da).length - 1;
    if (volte !== (c.volte ?? 1)) throw new Error(`traduzioni: «${c.da}» trovato ${volte} volte in ${file}, attese ${c.volte ?? 1}`);
    s = s.split(c.da).join(c.a);
  }
  return s;
}

export async function leggiTraduzioni(cartella = 'traduzioni') {
  const T = {};
  if (!existsSync(cartella)) return T;
  for (const f of await readdir(cartella)) if (f.endsWith('.en.json')) {
    try { T[f.slice(0, -8)] = JSON.parse(await readFile(`${cartella}/${f}`, 'utf8')); }
    catch (e) { throw new Error(`${cartella}/${f}: JSON non valido (${e.message})`); }
  }
  return T;
}
export const paginaDi = nome => nome === 'home' ? 'index.html' : nome === '404' ? '404.html' : `modelli/${nome}.html`;
const urlDi = p => SITO + '/' + p.replace(/(^|\/)index\.html$/, '$1');

/* ---------- percorsi delle pagine inglesi ---------- */
const ATTR_URL = ['src', 'href', 'data-src', 'srcset', 'poster'];
function riscriviPercorsi(s, pagina, esisteEn) {
  const base = 'https://x/' + pagina, modifiche = [];
  const nuovo = v => {
    if (!v || v[0] === '#' || /^(data|mailto|tel|javascript):/i.test(v)) return v;
    let u; try { u = new URL(v, base); } catch { return v; }
    if (u.origin !== 'https://x') return v;
    const p = decodeURI(u.pathname), en = '/en' + p;
    return (esisteEn(en) ? en : p) + u.search + u.hash;
  };
  for (const x of lexHTML(s, false)) {
    if (x.t !== 'tag') continue;
    for (const a of x.attr) {
      const v = s.slice(a.a, a.b);
      let w = v;
      if (a.nome === 'srcset') w = v.split(',').map(p => p.trim().replace(/^\S+/, nuovo)).join(', ');
      else if (a.nome === 'style') w = v.replace(/url\(([^)]+)\)/g, (m, u) => `url(${nuovo(u.replace(/["']/g, ''))})`);
      else if (ATTR_URL.includes(a.nome) && !(x.nome === 'link' && /canonical|alternate/.test(valore(s, x, 'rel') || ''))) w = nuovo(v);
      if (w !== v) modifiche.push({ a: a.a, b: a.b, s: w });
    }
  }
  return applica(s, modifiche);
}
function collegamentiRotti(s, dist) {
  const rotti = [];
  for (const x of lexHTML(s, false)) if (x.t === 'tag') for (const a of x.attr) {
    if (!['src', 'href', 'data-src', 'srcset'].includes(a.nome)) continue;
    for (const v of (a.nome === 'srcset' ? s.slice(a.a, a.b).split(',').map(p => p.trim().split(/\s+/)[0]) : [s.slice(a.a, a.b)])) {
      if (!v.startsWith('/') || v.startsWith('//') || /^\/(_vercel|api)\//.test(v)) continue;
      const p = dist + decodeURI(v.split(/[?#]/)[0]);
      if (!existsSync(p) || (statSync(p).isDirectory() && !existsSync(p + '/index.html') && !v.endsWith('/'))) rotti.push(v);
    }
  }
  return rotti;
}
/* selettore di lingua di home e 404 (link data-lingua, nascosti nei sorgenti): si mostra solo se la pagina inglese è pubblicata;
   nella pagina inglese lo stesso link porta alla versione italiana */
const LINK_LINGUA = /<a\b([^>]*\bdata-lingua\b[^>]*)>([^<]*)<\/a>/g;
const linguaIt = s => s.replace(LINK_LINGUA, (m, attr, testo) => `<a${attr.replace(/ hidden\b/, '')}>${testo}</a>`);
const linguaEn = s => s.replace(LINK_LINGUA, (m, attr, testo) => `<a${attr.replace(/ hidden\b/, '').replace(/href="[^"]*"/, 'href="/"')
  .replace('hreflang="en"', 'hreflang="it"').replace(' lang="en"', ' lang="it"').replace('aria-label="English"', 'aria-label="Italiano"')}>${testo === 'EN' ? 'IT' : 'Italiano'}</a>`);

export function hreflang(s, it, en) {
  const righe = `\n<link rel="alternate" hreflang="it" href="${it}">\n<link rel="alternate" hreflang="en" href="${en}">\n<link rel="alternate" hreflang="x-default" href="${it}">`;
  const m = s.match(/<link rel="canonical"[^>]*>/);
  if (!m) throw new Error('canonical mancante: impossibile aggiungere hreflang');
  return s.replace(m[0], m[0] + righe);
}

/* ---------- build ---------- */
export async function costruisciInglese({ preview, drafts, dist = 'dist', dettagli = false, rigoroso = false }) {
  const T = await leggiTraduzioni();
  if (!T.comune || !T.home) { console.log('Versione inglese: traduzioni/comune.en.json o home.en.json assenti, nessuna pagina inglese.'); return; }
  const modelli = Object.keys(T).filter(n => !['home', '404', 'comune'].includes(n)).sort();
  const nomi = ['comune', 'home', '404', ...modelli].filter(n => T[n]);
  const risultati = {};   /* nome → { file: { percorso: testo } , stato } */

  /* 1. traduzione */
  const ctxComune = creaContesto('comune', [T.comune]);
  const scriptEn = {};
  for (const f of COMUNI) scriptEn[f] = traduciJS(applicaCodice(await readFile(`${dist}/${f}`, 'utf8'), T.comune, f), ctxComune);
  /* manifest dell'app: nome e descrizione da comune.en.json */
  const manifesto = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
  for (const k of ['name', 'description']) manifesto[k] = ctxComune.traduci({ tipo: 'testo', it: manifesto[k], obbligatorio: true }) ?? manifesto[k];
  risultati.comune = { stato: ctxComune.stato };
  for (const nome of nomi.slice(1)) {
    const pagina = paginaDi(nome);
    if (drafts.has(pagina)) { console.log(`Versione inglese: ${pagina} è una bozza, ignorata`); continue; }
    if (!existsSync(`${dist}/${pagina}`)) { console.log(`Versione inglese: ${pagina} non è in ${dist}/, ignorata`); continue; }
    const ctx = creaContesto(nome, [T[nome], T.comune]);
    const en = traduciHTML(applicaCodice(await readFile(`${dist}/${pagina}`, 'utf8'), T[nome]), ctx);
    risultati[nome] = { pagina, en, stato: ctx.stato };
  }

  /* 2. cosa si pubblica: in produzione solo le pagine complete (e comune e home complete) */
  const completa = n => risultati[n] && !risultati[n].stato.mancanti.length;
  const base = preview || (completa('comune') && completa('home'));
  const pubblicate = Object.keys(risultati).filter(n => n !== 'comune' && base && (preview || completa(n)));
  const filesEn = new Set([...COMUNI, ...COPIE, 'assets/strutture.json', 'manifest.webmanifest'].map(f => '/en/' + f));
  if (!pubblicate.length) filesEn.clear();
  for (const n of pubblicate) filesEn.add('/en/' + risultati[n].pagina);
  const esisteEn = p => filesEn.has(p) || filesEn.has(p.replace(/\/$/, '/index.html'));

  /* 3. scrittura */
  if (pubblicate.length) {
    await mkdir(`${dist}/en/assets`, { recursive: true });
    await mkdir(`${dist}/en/modelli`, { recursive: true });
    for (const f of COMUNI) await writeFile(`${dist}/en/${f}`, scriptEn[f]);
    for (const f of COPIE) await cp(`${dist}/${f}`, `${dist}/en/${f}`);
  }
  const indicizzate = new Set();
  for (const n of pubblicate) {
    const { pagina } = risultati[n], it = urlDi(pagina), en = urlDi('en/' + pagina);
    let s = risultati[n].en.replace(/<html lang="it"/, '<html lang="en"');
    s = riscriviPercorsi(s, pagina, esisteEn);
    s = s.replace(/(<meta property="og:locale" content=")it_IT(")/, '$1en_US$2')
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${en}$2`)
      .replace(/(\/assets\/og\/)([\w-]+\.jpg)/g, (m, a, f) => existsSync(`${dist}/assets/og/en/${f}`) ? `${a}en/${f}` : m);
    s = linguaEn(s);
    let sorgente = linguaIt(await readFile(`${dist}/${pagina}`, 'utf8'));
    if (n !== '404') {
      s = s.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${en}$2`);
      s = hreflang(s, it, en);
      sorgente = hreflang(sorgente, it, en);
      indicizzate.add(pagina);
    }
    await writeFile(`${dist}/${pagina}`, sorgente);
    await writeFile(`${dist}/en/${pagina}`, s);
  }

  /* 4. indice di ricerca, manifest e sitemap */
  if (pubblicate.length) {
    const tab = n => [T[n], T.home, T.comune].filter(Boolean);
    const cerca = (tabelle, it) => { for (const t of tabelle) if (t.testi?.[norm(it)]) return t.testi[norm(it)]; return it; };
    const righe = JSON.parse(await readFile(`${dist}/assets/strutture.json`, 'utf8')).map(r => {
      const nome = r.path.replace(/^modelli\/|\.html$/g, ''), pubblicato = indicizzate.has(r.path);
      return { ...r, name: T[nome]?.strutture?.[r.id]?.name?.en || r.name, category: cerca(tab(nome), r.category),
        model: cerca(tab(nome), r.model), alt: r.name, path: pubblicato ? r.path : '/' + r.path };
    });
    await writeFile(`${dist}/en/assets/strutture.json`, JSON.stringify(righe));
    Object.assign(manifesto, { lang: 'en', id: '/en/', start_url: '/en/' });
    const man = manifesto;
    man.icons = man.icons.map(i => ({ ...i, src: '/' + i.src.replace(/^\//, '') }));
    await writeFile(`${dist}/en/manifest.webmanifest`, JSON.stringify(man, null, 2) + '\n');
    let sm = await readFile(`${dist}/sitemap.xml`, 'utf8');
    sm = sm.replace('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">');
    sm = sm.replace(/^(\s*)<url><loc>([^<]+)<\/loc><\/url>$/gm, (m, sp, loc) => {
      const p = loc.slice(SITO.length + 1) || 'index.html';
      if (!indicizzate.has(p)) return m;
      const en = urlDi('en/' + p), alt = `${sp}  <xhtml:link rel="alternate" hreflang="it" href="${loc}"/>\n${sp}  <xhtml:link rel="alternate" hreflang="en" href="${en}"/>\n${sp}  <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>\n`;
      return `${sp}<url>\n${sp}  <loc>${loc}</loc>\n${alt}${sp}</url>\n${sp}<url>\n${sp}  <loc>${en}</loc>\n${alt}${sp}</url>`;
    });
    await writeFile(`${dist}/sitemap.xml`, sm);
    const rotti = [];
    for (const n of pubblicate) {
      const s = await readFile(`${dist}/en/${risultati[n].pagina}`, 'utf8');
      for (const r of collegamentiRotti(s, dist)) rotti.push(`en/${risultati[n].pagina}: ${r}`);
    }
    if (rotti.length) throw new Error('Collegamenti inglesi non trovati in dist/:\n  ' + rotti.join('\n  '));
  }

  /* 5. rapporto */
  console.log(`Versione inglese${preview ? ' (preview: pubblicate anche le pagine incomplete)' : ''}:`);
  let problemi = 0;
  for (const n of nomi.filter(n => risultati[n])) {
    const { stato } = risultati[n], ob = obsolete(T[n]);
    const fuori = n !== 'comune' && !pubblicate.includes(n) ? '  → non pubblicata' : '';
    console.log(`  ${n.padEnd(15)} tradotti ${stato.ok} · senza traduzione ${stato.mancanti.length} · modificati ${stato.modificati.length} · obsoleti ${ob.length}${fuori}`);
    problemi += stato.mancanti.length + stato.modificati.length;
    if (!dettagli) continue;
    for (const m of stato.mancanti) console.log(`    SENZA TRADUZIONE ${m.chiave === 'testi' ? '' : m.chiave + ': '}${JSON.stringify(m.it)}`);
    for (const m of stato.modificati) console.log(`    MODIFICATO ${m.chiave}\n      prima: ${JSON.stringify(m.prima)}\n      ora:   ${JSON.stringify(m.ora)}`);
    for (const o of ob) console.log(`    OBSOLETO ${o}`);
  }
  if (problemi && !dettagli) console.log('  Dettagli: node build-site.mjs --traduzioni');
  if (rigoroso && problemi) throw new Error(`Versione inglese: ${problemi} testi senza traduzione o modificati (--rigoroso)`);
  return { risultati, pubblicate };
}
