# MSK Atlas — Atlante anatomico 3D

Sito statico con modelli anatomici 3D interattivi, a scopo didattico
(anatomia muscolo-scheletrica per radiologia). Interfaccia in italiano, tema scuro fisso; versione inglese in `/en/`, generata dalla build.

> Materiale didattico. Non destinato a uso clinico o diagnostico.

## Struttura

```
index.html                 homepage: modello che ruota con lo scorrimento, presentazione, una card per ogni modello, "Come si usa", crediti
modelli/<nome>-3d.html     pagina del modello (three.js r128 da CDN); le geometrie stanno in assets/dati/ (le bozze anca e caviglia le hanno ancora in base64)
assets/dati/<nome>/        dati delle mesh di ogni modello (bpdat.<hash>.br, brotli), caricati dalla pagina con fetch
vercel.json                build (node build-site.mjs → dist/) e intestazioni dei dati: Content-Encoding br, cache permanente (nomi con hash)
assets/nav.js              navigazione comune dei modelli: pulsanti fluttuanti "‹" (home) e "i" (disclaimer, crediti ed elenco delle strutture del modello)
assets/favicon.svg
assets/anteprime/          immagini 1600×1000 delle card (WebP, sfondo trasparente)
assets/og/                 immagini 1200×630 per Open Graph e Twitter card (JPEG, una per pagina)
sitemap.xml, robots.txt    per i motori di ricerca (dominio canonico https://www.mskatlas.com)
404.html                   pagina "non trovata" (tema scuro, percorsi assoluti)
assets/sequenza/           fotogrammi della prima schermata (WebP trasparenti, grandi l/ e piccoli s/)
strumenti/anteprima.mjs    genera le anteprime (non pubblicato sul sito)
strumenti/sequenza-home.mjs genera i fotogrammi della prima schermata (non pubblicato sul sito)
strumenti/og.mjs           genera le immagini Open Graph 1200×630 dalle anteprime (non pubblicato sul sito)
strumenti/lib-chrome.mjs   funzioni comuni ai due script (Chrome headless)
strumenti/server.mjs       server locale (porta 8000) con le stesse intestazioni dei dati di Vercel
strumenti/estrai-dati.mjs  sposta i dati base64 di un modello in assets/dati/<nome>/ (integrazione di un modello nuovo)
GUIDA_MODELLI.md           guida tecnica ai modelli, non pubblicata sul sito
build-en.mjs               versione inglese: usata da build-site.mjs, genera dist/en/ dalle pagine italiane e da traduzioni/
traduzioni/<nome>.en.json  traduzioni inglesi (comune, home, 404 e un file per modello), con il testo italiano di riferimento
strumenti/traduzioni.mjs   aggiunge le voci da tradurre e scrive il prospetto IT/EN di revisione (non pubblicato sul sito)
.vercelignore              esclude dal deploy strumenti/, CLAUDE.md, README.md e GUIDA_MODELLI.md
```

Nessun framework, nessuna dipendenza npm, nessun cookie o tracciamento. Build statica senza dipendenze con `node build-site.mjs` (copia il sito in `dist/` ed esclude le bozze dalla produzione).
Ogni modello resta una pagina indipendente (la pagina più la sua cartella `assets/dati/<nome>/`, servite via HTTP):
se `assets/nav.js` manca, funziona lo stesso, solo senza pulsanti di navigazione.

La tavola della **caviglia destra** (`modelli/caviglia-3d.html`) comprende la gamba
distale, il retropiede, il tarso e le basi metatarsali. Ossa, muscoli e tendine
calcaneale derivano da BodyParts3D 3.0; cartilagini, legamenti, capsule,
retinacoli, guaine e decorsi vascolo-nervosi sono ricostruzioni didattiche.
Campo ed esclusioni sono indicati nel pannello informazioni della tavola.
Generazione e controlli: sezione «Caviglia destra» di `GUIDA_MODELLI.md`.

## Provare il sito in locale

```bash
node strumenti/server.mjs
```

dalla cartella del progetto, poi apri <http://localhost:8000>.
Il server locale invia i dati dei modelli con `Content-Encoding: br`, come Vercel: con `python3 -m http.server` o con il doppio clic
(`file://`) i modelli non si caricano e il riquadro di caricamento lo spiega. Serve anche agli script delle anteprime e della sequenza.

Cosa controllare dopo una modifica:
- homepage: modello in alto che ruota scorrendo, card, immagini, link (anche "Polso" / "Dito"), numeri "Tav." e conteggio dei modelli,
  barra in alto che diventa di vetro scorrendo;
- in ogni modello: pulsanti fluttuanti in alto (nessuna barra), "‹" (da 640 px "‹ MSK Atlas") torna alla home, pannello "i" si apre e si chiude
  (su smartphone dal basso, chiudibile toccando lo sfondo; da 640 px come riquadro sotto la "i"),
  toccando una struttura si apre la scheda giusta;
- vista smartphone (strumenti per sviluppatori del browser, 360 e 375 px) e desktop.

## Aggiungere un modello

1. **File** — copia la pagina in `modelli/<nome>-3d.html` (minuscolo, parole separate da trattini).
   **Dati** — il modello creato in chat è un file unico con i dati in base64: estraili con
   ```bash
   node strumenti/estrai-dati.mjs <nome>-3d
   node strumenti/estrai-dati.mjs <nome>-3d verifica
   ```
   (salva `assets/dati/<nome>/bpdat.<hash>.br` e adatta il caricatore della pagina; la verifica confronta byte per byte i dati con quelli incorporati).
2. **Righe comuni** — nel file del modello aggiungi solo queste, senza toccare altro:
   ```html
   <html lang="it" data-theme="dark">                                        <!-- attributo sul tag esistente -->
   <title><Distretto> 3D interattivo/a: <strutture chiave> | MSK Atlas</title>  <!-- contenuto del <title> esistente, ≈60 caratteri -->
   <meta name="description" content="<Distretto> 3D interattivo: …">        <!-- nel <head>, entro 160 caratteri -->
   <link rel="canonical" href="https://www.mskatlas.com/modelli/<nome>-3d.html">   <!-- nel <head> -->
   <!-- Open Graph e Twitter card: copia il blocco da un altro modello (og:type, site_name, locale, title, description, url,
        image con width/height/alt; twitter:card summary_large_image, title, description, image) e cambia testi, URL e immagine -->
   <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">     <!-- nel <head> -->
   <script src="../assets/nav.js"></script>                                 <!-- subito dopo <body> -->
   ```
3. **Anteprima** — con il server locale attivo:
   ```bash
   node strumenti/anteprima.mjs <nome>-3d
   ```
   Salva `assets/anteprime/<nome>-3d.webp` (sfondo trasparente). Per regolare l'inquadratura: `--zoom=1.2`, `--dy=-0.05`;
   per fare prove senza sovrascrivere: `--out=/tmp/prova.webp`. Richiede Node 22+ e Google Chrome.
   Va rigenerata anche quando si modifica un modello, perché l'anteprima resti aggiornata.
   **Immagine social** (dopo l'anteprima) — aggiungi la pagina alla tabella `PAGINE` in testa a `strumenti/og.mjs`, poi:
   ```bash
   node strumenti/og.mjs <nome>-3d
   ```
   Salva `assets/og/<nome>-3d.jpg` (1200×630, JPEG) componendo l'anteprima su sfondo scuro con distretto e marchio; l'immagine
   è quella indicata in `og:image` e `twitter:image`. Per la versione inglese aggiungi il distretto a `PAGINE_EN` e lancia
   `node strumenti/og.mjs --lingua=en <nome>-3d` (salva `assets/og/en/<nome>-3d.jpg`, usata dalla build per la pagina `/en/`).
4. **Card** — in `index.html` duplica un blocco `<!-- CARD MODELLO -->` e aggiorna distretto, immagine,
   testo alternativo, link e titolo, e imposta `data-strutture` sul `<li class="card">`. Il numero "Tav.",
   la riga "N strutture" e il conteggio dei modelli sono automatici. Il blocco `.sub` (link alle sezioni)
   è facoltativo.
5. **Sitemap** — aggiungi `<url><loc>https://www.mskatlas.com/modelli/<nome>-3d.html</loc></url>` a `sitemap.xml`
   (le sezioni con ancora, come `#dito`, non hanno voce propria).
6. **Traduzione inglese** — `node strumenti/traduzioni.mjs <nome>-3d` crea `traduzioni/<nome>-3d.en.json` con le voci vuote;
   compila i campi `en` (inglese USA, terminologia TA2), poi `node strumenti/traduzioni.mjs <nome>-3d --verifica` (deve dare 0 senza traduzione)
   e `--prospetto` per il riepilogo IT/EN con i termini dubbi in cima. Finché il file manca o è incompleto la pagina inglese non va in produzione.
7. **Verifica e pubblica** — controlla in locale (anche titolo, descrizione, canonical e immagine social di ogni pagina), poi:
   ```bash
   git add modelli/<nome>-3d.html assets/dati/<nome> assets/anteprime/<nome>-3d.webp assets/og/<nome>-3d.jpg sitemap.xml index.html
   git commit -m "Aggiunge modello <nome>"
   git push
   ```

## Animazione della prima schermata

In alto nella homepage il modello del polso resta sullo sfondo e ruota di 360° mentre si scorre la pagina
(titolo e frase introduttiva gli scorrono sopra). È una sequenza di fotogrammi disegnati in un canvas
in base allo scorrimento; durante uno scorrimento veloce usa copie a metà risoluzione già pronte (in Safari decodificare quelle intere richiede troppo tempo) e torna nitida quando la pagina rallenta. Dopo una modifica al modello va rigenerata, con il server locale attivo:

```bash
node strumenti/sequenza-home.mjs polso-dito-3d
```

Salva `assets/sequenza/polso-dito-3d/l/000.webp …` (1280×800, computer) e `…/s/…` (800×500, smartphone),
con sfondo trasparente, e alla fine stampa il numero di fotogrammi. Se cambia, aggiornalo nell'attributo
`data-frames` del blocco `stage-media` in `index.html`. Opzioni e dettagli in testa allo script;
`--prova` salva solo il primo fotogramma. Per usare un altro modello: stesso comando con il suo nome,
poi aggiorna in `index.html` `data-src`, i due `<link rel="preload">` e l'immagine di riserva nel `<picture>`.
Con "riduci movimento" o risparmio dati la pagina mostra solo il primo fotogramma.

## Versione inglese

Le pagine italiane restano l'unica fonte. `node build-site.mjs` (tramite `build-en.mjs`) crea `dist/en/` sostituendo i testi con quelli di
`traduzioni/<nome>.en.json`: nomi e schede delle strutture (per id), interfaccia, `nav.js` e gli altri script comuni, meta e Open Graph,
indice di ricerca, manifest e sitemap (con `xhtml:link` hreflang). Le pagine italiane pubblicate ricevono solo i `<link rel="alternate" hreflang>`
e il selettore di lingua (pillola «EN» e link «English» in home, link «English» nella 404, riga «Lingua» nel pannello «i» dei modelli),
che compare solo se la pagina inglese esiste. Le bozze sono escluse.

La build stampa per ogni pagina le voci **senza traduzione**, **modificate** (il testo italiano non coincide più con quello di riferimento:
resta l'inglese precedente) e **obsolete**; dettagli con `node build-site.mjs --traduzioni`, errore con `--rigoroso`.
In produzione una pagina inglese è pubblicata solo se completa (e solo se lo sono anche `comune` e `home`); nelle Preview sempre.

**Regola:** se cambia una nota `info`, `o`, `ins` o `fn` (o un nome), l'inglese va aggiornato nello stesso ramo prima del merge su `main`:
aggiornare insieme `it` ed `en` della voce in `traduzioni/<nome>-3d.en.json`.

Verifica in locale: `node build-site.mjs` e poi `node strumenti/server.mjs dist` (le pagine mancanti sotto `/en/` usano `en/404.html`).
Su Vercel un indirizzo inesistente sotto `/en/` mostra la 404 italiana, che ha il link «English».

## Pubblicazione

Hosting su Vercel collegato al repository GitHub: ogni push su `main` pubblica il sito.
Vercel esegue `node build-site.mjs` e pubblica `dist/` (`buildCommand` e `outputDirectory` in `vercel.json`); `vercel.json` aggiunge le intestazioni dei dati dei modelli (`assets/dati/**.br`:
`Content-Encoding: br`, `Content-Type: application/octet-stream`, `Cache-Control: public, max-age=31536000, immutable`).

## Crediti

I modelli sono derivati da **BodyParts3D**, © The Database Center for Life Science (DBCLS),
distribuito con licenza [Creative Commons Attribuzione 4.0 Internazionale](https://creativecommons.org/licenses/by/4.0/deed.it) (CC BY 4.0), come richiesto dalla
[licenza ufficiale del database](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) (aggiornata al 27/02/2025);
per i dati delle versioni precedenti del database vale la [CC BY-SA 2.1 JP](https://creativecommons.org/licenses/by-sa/2.1/jp/).
Le geometrie originali sono state modificate e integrate con strutture modellate appositamente.
Per prudenza i modelli modificati sono distribuiti con la licenza più restrittiva, CC BY-SA 2.1 JP.

Scelta prudenziale: DBCLS non documenta il passaggio da CC BY-SA 2.1 JP a CC BY 4.0 né la sorte dei dati scaricati
prima del 2025, e non è accertato da quale release derivino ginocchio e polso (il gomito dichiara la 4.0).
Distribuire con ShareAlike soddisfa comunque entrambe le licenze. Da rivedere se DBCLS conferma la sola CC BY 4.0.

Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37(Database issue):D782–D785.

## Modelli in lavorazione

Anca e Caviglia sono visibili in home come «In lavorazione · Prossimamente».
`node build-site.mjs` genera `dist/` per il pubblico: esclude fisicamente le due pagine, i risultati di ricerca e le voci della sitemap.
`node build-site.mjs --preview` genera localmente la versione completa. Per verificarla: `node strumenti/server.mjs dist` (serve `dist/` con le intestazioni dei dati dei modelli).
Su Vercel solo l’ambiente Preview include i modelli in lavorazione; mantenere attiva Vercel Authentication sulle anteprime. Il ramo `anteprima-modelli` serve per lavorare e vedere i modelli con il proprio account Vercel.
Per aggiornare l’anteprima, inviare le modifiche al ramo `anteprima-modelli`; per aggiornare il sito pubblico, a `main`. Per pubblicare un modello completato, rimuovere il suo percorso da `drafts` in `build-site.mjs`. I file anatomici restano sempre nel repository.
