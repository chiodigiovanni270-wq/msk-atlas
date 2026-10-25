# Segnalazioni errori

Il modulo condiviso viene caricato dalla home e da nav.js. Il pulsante nella scheda (cInfo) riporta la struttura; nel footer e nelle informazioni apre una segnalazione generale. Il testo resta in memoria alla chiusura o in caso di errore, fino a ricaricamento pagina. Nessuna geometria modificata.

La funzione Node api/segnalazioni.js usa Resend e verifica i token monouso Turnstile lato server, con controllo origine, hostname e action. Destinatario e mittente sono esclusivamente server-side. Nessuna email automatica al segnalante. Log senza testo, indirizzi o credenziali. Non aggiunge analytics, cookie o storage nel codice del sito. Turnstile si carica solo aprendo il modulo quando il servizio è configurato; il modulo comunica i servizi utilizzati.

## Attivazione (ancora da completare)

1. Scegliere l'email destinataria con il proprietario.
2. Attivare Resend, verificare il dominio mittente e creare una chiave limitata all'invio. Il mittente di test Resend ha restrizioni sui destinatari e non va considerato già pronto per produzione.
3. Creare un widget Cloudflare Turnstile per i domini esatti di produzione e di anteprima; pre-clearance disattivata. Non usare chiavi di test in produzione.
4. Configurare in Vercel per Preview e, solo dopo la prova, Production:
   - RESEND_API_KEY (segreto)
   - REPORT_TO_EMAIL (casella scelta dal proprietario)
   - REPORT_FROM_EMAIL (es. MSK Atlas <segnalazioni@dominio-verificato>)
   - TURNSTILE_SITE_KEY (pubblica)
   - TURNSTILE_SECRET_KEY (segreto)
   - REPORT_ALLOWED_ORIGINS (origini HTTPS esatte separate da virgola, senza slash finale; includere anteprima solo nel relativo ambiente)
5. Ridistribuire l'anteprima. Verificare anche il limite di frequenza POST /api/segnalazioni nel firewall Vercel per limitare gli abusi: Turnstile verifica i bot ma non è una quota di invio per utente.
6. Completare informativa privacy e tempi di conservazione concordati con l'autore prima della pubblicazione.
7. Inviare una segnalazione reale e verificarne la ricezione nella casella (e la funzione Rispondi se è stata inserita una email). Questa prova richiede configurazione reale: i test locali non dimostrano la consegna.

Finché manca una variabile, GET dichiara available:false e POST restituisce 503: nessun messaggio viene finto come inviato.

## Verifica locale

`node --test strumenti/segnalazioni.test.cjs` verifica backend con servizi simulati e nessuna email reale.
`python3 -m http.server 8000` consente la prova dell'interfaccia statica; l'invio richiede `vercel dev` e le variabili oppure l'anteprima Vercel. Il server statico mostrerà correttamente servizio non disponibile.

Provare home e ogni tavola (anche #dito), scheda con due strutture successive, apertura/chiusura, Escape, Tab, campi vuoti/non validi, testo conservato dopo un errore, doppio clic invio, assenza connessione, verifica antispam scaduta, successo. Dimensioni 360/390/768/1200 px e tastiera mobile.
