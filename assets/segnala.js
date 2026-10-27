/* Shared report dialog: anatomy files and renderer remain untouched. */
(function () {
  'use strict';
  const source = document.currentScript.src;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('segnala.css', source); document.head.append(css);
  function init() {
    const dialog = document.createElement('dialog'); dialog.id = 'msk-report'; dialog.setAttribute('aria-labelledby', 'report-title');
    dialog.innerHTML = `<div class="report-head"><h2 id="report-title">Segnala un errore</h2><button class="report-close" type="button" aria-label="Chiudi segnalazione">×</button></div>
      <p class="report-note">Aiutaci a migliorare MSK Atlas.</p><p class="report-context report-note"></p>
      <form><label>Struttura (facoltativa)<input name="structure" maxlength="180"></label>
      <label>Tipo di problema<select name="type"><option>Errore anatomico</option><option>Testo inesatto</option><option>Problema tecnico</option><option>Altro</option></select></label>
      <label>Descrizione<textarea name="description" required minlength="10" maxlength="3000" placeholder="Descrivi il problema e, se possibile, indica una fonte."></textarea></label>
      <label>La tua email (facoltativa)<input name="email" type="email" maxlength="254" autocomplete="email" placeholder="Solo se desideri una risposta"></label>
      <div class="report-trap" aria-hidden="true"><label>Lascia vuoto<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="report-note">Il testo e l’eventuale email saranno inoltrati all’autore tramite Resend per gestire la segnalazione. Non inserire dati di pazienti o informazioni sanitarie personali.</p>
      <p class="report-note">La verifica antispam usa Cloudflare Turnstile. <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Privacy Cloudflare</a> · <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Resend</a></p>
      <div class="report-challenge"></div><button class="report-submit" type="submit" disabled>Invia segnalazione</button></form><p class="report-status" role="status" aria-live="polite"></p>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form'), submit = dialog.querySelector('.report-submit'), status = dialog.querySelector('.report-status');
    let token = '', widget, busy = false, setup = false, opener, context = '', turnstilePromise;
    let mode = 'report';
    const drafts = {};
    const reportTypes = ['Errore anatomico', 'Testo inesatto', 'Problema tecnico', 'Altro'];
    const contactTypes = ['Suggerimento', 'Didattica', 'Collaborazione', 'Altro'];
    const title = dialog.querySelector('h2');
    const lead = dialog.querySelector('.report-note');
    const structureLabel = form.elements.structure.closest('label');
    const typeLabel = form.elements.type.closest('label');
    const descriptionLabel = form.elements.description.closest('label');
    const emailLabel = form.elements.email.closest('label');
    const setStatus = message => { status.textContent = message; };
    function loader() {
      if (window.turnstile) return Promise.resolve();
      if (!turnstilePromise) turnstilePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
        script.onload = resolve; script.onerror = () => { script.remove(); turnstilePromise = null; reject(new Error('Verifica antispam non caricata. Chiudi e riapri il modulo.')); }; document.head.append(script);
      });
      return turnstilePromise;
    }
    async function configure() {
      if (setup) return;
      setup = true;
      setStatus('Preparazione del modulo…');
      try {
        const response = await fetch('/api/segnalazioni', { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Invio temporaneamente non disponibile. Riprova più tardi.');
        const config = await response.json();
        if (!config.available) throw new Error('Invio temporaneamente non disponibile. Riprova più tardi.');
        await loader();
        widget = window.turnstile.render(dialog.querySelector('.report-challenge'), { sitekey: config.siteKey, theme: 'dark', size: 'flexible', action: 'report',
          callback: value => { token = value; submit.disabled = busy; if (!form.hidden) setStatus(''); },
          'expired-callback': () => { token = ''; submit.disabled = true; setStatus('Verifica scaduta: attendi la nuova verifica.'); },
          'error-callback': () => { token = ''; submit.disabled = true; setStatus('Verifica antispam non riuscita. Chiudi e riapri il modulo.'); }
        });
        setStatus('Completa la verifica antispam.');
      } catch (error) { setup = false; setStatus(error.name === 'TimeoutError' ? 'Connessione lenta. Chiudi e riapri il modulo.' : error.message); }
    }
    function open(button, specific, nextMode = 'report') {
      if (busy) return;
      drafts[mode] = { values: Object.fromEntries(new FormData(form)), context, label: dialog.querySelector('.report-context').textContent };
      mode = nextMode;
      const contact = mode === 'contact';
      title.textContent = contact ? 'Scrivimi' : 'Segnala un errore';
      lead.textContent = contact ? 'Un messaggio a Giovanni Chiodi, autore di MSK Atlas.' : 'Aiutaci a migliorare MSK Atlas.';
      structureLabel.hidden = contact;
      typeLabel.firstChild.textContent = contact ? 'Argomento' : 'Tipo di problema';
      form.elements.type.replaceChildren(...(contact ? contactTypes : reportTypes).map(text => new Option(text, text)));
      descriptionLabel.firstChild.textContent = contact ? 'Messaggio' : 'Descrizione';
      form.elements.description.placeholder = contact ? 'Raccontami la tua idea o la tua proposta.' : 'Descrivi il problema e, se possibile, indica una fonte.';
      emailLabel.firstChild.textContent = contact ? 'La tua email' : 'La tua email (facoltativa)';
      form.elements.email.required = contact;
      form.elements.email.placeholder = contact ? 'Per poterti rispondere' : 'Solo se desideri una risposta';
      submit.textContent = contact ? 'Invia messaggio' : 'Invia segnalazione';
      form.reset();
      const draft = drafts[mode];
      if (draft) {
        for (const [key, value] of Object.entries(draft.values)) if (form.elements[key]) form.elements[key].value = value;
        context = draft.context;
        dialog.querySelector('.report-context').textContent = draft.label;
      }
      form.hidden = false;
      setStatus('');
      opener = button;
      // Preserve a draft when reopening; never silently attach it to another structure.
      if (!form.elements.description.value && !busy) {
        const name = specific ? document.getElementById('cName')?.textContent.trim() || '' : '';
        form.elements.structure.value = name;
        context = location.pathname + (location.hash === '#dito' ? '#dito' : '');
        dialog.querySelector('.report-context').textContent = 'Pagina: ' + (location.hash === '#dito' ? 'Dito 3D | MSK Atlas' : document.title);
      }
      dialog.showModal();
      configure();
      if (widget !== undefined && !token && !busy) window.turnstile.reset(widget);
    }
    function button(container, specific) {
      if (!container || container.querySelector('.msk-report-link')) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'msk-report-link'; b.textContent = 'Segnala un errore';
      b.addEventListener('click', event => { event.stopPropagation(); open(b, specific); }); container.append(b);
    }
    if (!document.getElementById('contatti')) button(document.querySelector('footer .foot-brand') || document.querySelector('footer'), false);
    document.querySelectorAll('[data-msk-message]').forEach(b => b.addEventListener('click', () => open(b, false, b.dataset.mskMessage)));
    button(document.querySelector('#an-panel'), false);
    function attach() { button(document.querySelector('#cInfo'), true); }
    attach();
    const card = document.getElementById('card');
    if (card) new MutationObserver(attach).observe(card, { childList: true, subtree: true });
    dialog.querySelector('.report-close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !token || !form.reportValidity()) return;
      busy = true; submit.disabled = true; form.setAttribute('aria-busy', 'true'); setStatus('Invio in corso…');
      const body = Object.fromEntries(new FormData(form)); body.page = context; body.token = token; body.kind = mode; body.lang = document.documentElement.lang === 'en' ? 'en' : 'it';
      try {
        const response = await fetch('/api/segnalazioni', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
        const result = await response.json();
        if (!response.ok || result.ok !== true) throw new Error(result.error || 'Invio non riuscito. Riprova più tardi.');
        delete drafts[mode]; form.reset(); form.hidden = true; setStatus(mode === 'contact' ? 'Grazie! Il tuo messaggio è stato inviato.' : 'Grazie! La segnalazione è stata inviata.');
      } catch (error) {
        setStatus(error.name === 'TimeoutError' ? 'Invio non confermato. Il testo è conservato: riprova.' : (error.message === 'Failed to fetch' ? 'Connessione non disponibile. Il testo è conservato: riprova.' : error.message));
      } finally {
        busy = false; token = ''; submit.disabled = true; form.removeAttribute('aria-busy');
        if (widget !== undefined) window.turnstile.reset(widget);
      }
    });
    dialog.addEventListener('close', () => { if (form.hidden) { form.hidden = false; setStatus(''); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();

