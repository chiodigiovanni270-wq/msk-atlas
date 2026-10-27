/* Vercel Node function; no data or credentials are stored in the browser. */
const { createHash } = require('node:crypto');
const TYPES = ['Errore anatomico', 'Testo inesatto', 'Problema tecnico', 'Altro'];
const CONTACT_TYPES = ['Suggerimento', 'Didattica', 'Collaborazione', 'Altro'];
const PAGES_IT = ['/', '/index.html', '/modelli/spalla-3d.html', '/modelli/gomito-3d.html', '/modelli/polso-dito-3d.html', '/modelli/anca-3d.html', '/modelli/ginocchio-3d.html'];
const PAGES = [...PAGES_IT, ...PAGES_IT.map(p => '/en' + p)];
/* English version (/en/): translated types are mapped back to Italian for the email; error messages are returned in English */
const EN_TYPES = { 'Anatomical error': 'Errore anatomico', 'Inaccurate text': 'Testo inesatto', 'Technical problem': 'Problema tecnico', Other: 'Altro', Suggestion: 'Suggerimento', Teaching: 'Didattica', Collaboration: 'Collaborazione' };
const EN_ERRORS = {
  'Segnalazione non valida.': 'Invalid report.', 'Tipo di messaggio non valido.': 'Invalid message type.', 'Inserisci la tua email per ricevere una risposta.': 'Enter your email to receive a reply.',
  'Controlla i campi della segnalazione.': 'Check the report fields.', 'Controlla struttura e indirizzo email.': 'Check the structure and email address.', 'Pagina non valida.': 'Invalid page.',
  'Verifica antispam non disponibile. Riprova.': 'Spam check unavailable. Please try again.', 'Ripeti la verifica antispam e invia di nuovo.': 'Repeat the spam check and send again.',
  'Invio non riuscito. Il testo è conservato: riprova più tardi.': 'Sending failed. Your text has been kept: please try again later.', 'Invio non confermato. Riprova più tardi.': 'Sending not confirmed. Please try again later.',
  'Servizio non raggiungibile. Il testo è conservato: riprova più tardi.': 'Service unreachable. Your text has been kept: please try again later.'
};
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let en = false;
  const reply = (status, error) => res.status(status).json({ error: en && EN_ERRORS[error] || error });
  const env = process.env;
  const ready = ['RESEND_API_KEY', 'REPORT_TO_EMAIL', 'REPORT_FROM_EMAIL', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'REPORT_ALLOWED_ORIGINS'].every(k => env[k]);
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return reply(405, 'Metodo non consentito.'); }
  if (req.method === 'GET') return res.status(200).json({ available: Boolean(ready), siteKey: ready ? env.TURNSTILE_SITE_KEY : null });
  if (!ready) return reply(503, 'Invio temporaneamente non disponibile. Riprova più tardi.');
  const origins = env.REPORT_ALLOWED_ORIGINS.split(',').map(s => s.trim());
  const origin = req.headers.origin;
  if (!origin || !origins.includes(origin)) return reply(403, 'Origine non consentita.');
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415, 'Formato non valido.');
  let b;
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!raw || Buffer.byteLength(raw) > 16000) return reply(413, 'Segnalazione troppo lunga.');
    b = typeof req.body === 'string' ? JSON.parse(raw) : req.body;
  } catch { return reply(400, 'Segnalazione non valida.'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return reply(400, 'Segnalazione non valida.');
  en = b.lang === 'en';
  if (b.lang !== undefined && !['it', 'en'].includes(b.lang)) return reply(400, 'Segnalazione non valida.');
  const type = en ? (Object.hasOwn(EN_TYPES, b.type) ? EN_TYPES[b.type] : '') : b.type;
  const kind = b.kind === undefined ? 'report' : b.kind;
  if (!['report', 'contact'].includes(kind)) return reply(400, 'Tipo di messaggio non valido.');
  const contact = kind === 'contact';
  if (contact && !b.email) return reply(400, 'Inserisci la tua email per ricevere una risposta.');
  if (b.website) return reply(400, 'Segnalazione non valida.');
  const valid = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
  if (!valid(b.description, 10, 3000) || !(contact ? CONTACT_TYPES : TYPES).includes(type) || !valid(b.structure, 0, 180) || !valid(b.page, 1, 500) || !valid(b.email, 0, 254) || !valid(b.token, 1, 2048)) return reply(400, 'Controlla i campi della segnalazione.');
  if (/[\r\n]/.test(b.structure) || (b.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(b.email))) return reply(400, 'Controlla struttura e indirizzo email.');
  let page;
  try {
    page = new URL(b.page, origin);
    if (page.origin !== origin || !PAGES.includes(page.pathname)) throw new Error();
    page.search = ''; // Do not forward arbitrary URL parameters.
    page.hash = page.hash === '#dito' ? '#dito' : '';
  } catch { return reply(400, 'Pagina non valida.'); }
  try {
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: b.token }), signal: AbortSignal.timeout(8000)
    });
    if (!verification.ok) return reply(502, 'Verifica antispam non disponibile. Riprova.');
    const challenge = await verification.json();
    if (!challenge.success || challenge.action !== 'report' || challenge.hostname !== new URL(origin).hostname) return reply(400, 'Ripeti la verifica antispam e invia di nuovo.');
    const text = `${contact ? 'Messaggio' : 'Segnalazione'} MSK Atlas\n\nPagina: ${page.href}\nStruttura: ${b.structure.trim() || 'Generale'}\nTipo: ${type}${en ? '\nLingua: inglese' : ''}\n\n${b.description.trim()}\n\nEmail per risposta: ${b.email || 'Non indicata'}`;
    // Stable during an hour: avoids duplicates after a network timeout/retry.
    const key = createHash('sha256').update(text + Math.floor(Date.now() / 3600000)).digest('hex');
    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `report-${key}` },
      body: JSON.stringify({ from: env.REPORT_FROM_EMAIL, to: [env.REPORT_TO_EMAIL], subject: `MSK Atlas — ${contact ? 'Contatto: ' : ''}${type}`, text, ...(b.email ? { reply_to: b.email } : {}) }), signal: AbortSignal.timeout(10000)
    });
    if (!mail.ok) { console.error('report_mail_failed', mail.status); return reply(502, 'Invio non riuscito. Il testo è conservato: riprova più tardi.'); }
    const result = await mail.json();
    if (!result.id) return reply(502, 'Invio non confermato. Riprova più tardi.');
    return res.status(200).json({ ok: true });
  } catch { console.error('report_service_unavailable'); return reply(502, 'Servizio non raggiungibile. Il testo è conservato: riprova più tardi.'); }
};

