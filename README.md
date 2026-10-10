# MSK Atlas — Atlante anatomico 3D

Sito statico con modelli anatomici 3D interattivi, a scopo didattico
(anatomia muscolo-scheletrica per radiologia). Interfaccia in italiano, tema scuro fisso.

> Materiale didattico. Non destinato a uso clinico o diagnostico.

## Struttura

```
index.html                 homepage: modello che ruota con lo scorrimento, presentazione, una card per ogni modello, "Come si usa", crediti
modelli/<nome>-3d.html     un file autocontenuto per modello (three.js r128 da CDN, dati in base64)
assets/nav.js              navigazione comune dei modelli: pulsanti fluttuanti "‹" (home) e "i" (disclaimer e crediti)
assets/favicon.svg
assets/anteprime/          immagini 1600×1000 delle card
assets/sequenza/           fotogrammi della prima schermata (WebP trasparenti, grandi l/ e piccoli s/)
strumenti/anteprima.mjs    genera le anteprime (non pubblicato sul sito)
strumenti/sequenza-home.mjs genera i fotogrammi della prima schermata (non pubblicato sul sito)
strumenti/lib-chrome.mjs   funzioni comuni ai due script (Chrome headless)
GUIDA_MODELLI.md           guida tecnica ai modelli, non pubblicata sul sito
.vercelignore              esclude dal deploy strumenti/, CLAUDE.md, README.md e GUIDA_MODELLI.md
```

Nessun framework, nessun build step, nessun cookie o tracciamento.
Ogni modello resta una pagina indipendente: se `assets/nav.js` manca, funziona lo stesso, solo senza pulsanti di navigazione.

## Provare il sito in locale

```bash
python3 -m http.server 8000
```

dalla cartella del progetto, poi apri <http://localhost:8000>.
Le pagine si aprono anche con il doppio clic, ma il server locale riproduce il comportamento del sito online
ed è necessario per gli script delle anteprime e della sequenza.

Cosa controllare dopo una modifica:
- homepage: modello in alto che ruota scorrendo, card, immagini, link (anche "Polso" / "Dito"), numeri "Tav." e conteggio dei modelli,
  barra in alto che diventa di vetro scorrendo;
- in ogni modello: pulsanti fluttuanti in alto (nessuna barra), "‹" (da 640 px "‹ MSK Atlas") torna alla home, pannello "i" si apre e si chiude
  (su smartphone dal basso, chiudibile toccando lo sfondo; da 640 px come riquadro sotto la "i"),
  toccando una struttura si apre la scheda giusta;
- vista smartphone (strumenti per sviluppatori del browser, 360 e 375 px) e desktop.

## Aggiungere un modello

1. **File** — copia la pagina in `modelli/<nome>-3d.html` (minuscolo, parole separate da trattini).
2. **Righe comuni** — nel file del modello aggiungi solo queste, senza toccare altro:
   ```html
   <html lang="it" data-theme="dark">                                        <!-- attributo sul tag esistente -->
   <title><Distretto> 3D | MSK Atlas</title>                               <!-- contenuto del <title> esistente -->
   <meta name="description" content="Modello 3D interattivo di …">         <!-- nel <head> -->
   <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">     <!-- nel <head> -->
   <script src="../assets/nav.js"></script>                                 <!-- subito dopo <body> -->
   ```
3. **Anteprima** — con il server locale attivo:
   ```bash
   node strumenti/anteprima.mjs <nome>-3d
   ```
   Salva `assets/anteprime/<nome>-3d.jpg`. Per regolare l'inquadratura: `--zoom=1.2`, `--dy=-0.05`;
   per fare prove senza sovrascrivere: `--out=/tmp/prova.jpg`. Richiede Node 22+ e Google Chrome.
   Va rigenerata anche quando si modifica un modello, perché l'anteprima resti aggiornata.
4. **Card** — in `index.html` duplica un blocco `<!-- CARD MODELLO -->` e aggiorna distretto, immagine,
   testo alternativo, link, titolo e descrizione. Il numero "Tav." e il conteggio
   dei modelli sono automatici. Il blocco `.sub` (link alle sezioni) è facoltativo e sostituisce il pulsante
   "Apri il modello".
5. **Verifica e pubblica** — controlla in locale, poi:
   ```bash
   git add modelli/<nome>-3d.html assets/anteprime/<nome>-3d.jpg index.html
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

## Pubblicazione

Hosting su Vercel collegato al repository GitHub: ogni push su `main` pubblica il sito.
Non serve configurazione: Vercel serve i file così come sono.

## Crediti

I modelli sono derivati da **BodyParts3D**, © The Database Center for Life Science (DBCLS),
licensed under [CC Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/deed.it) (CC BY 4.0), come richiesto dalla
[licenza ufficiale del database](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) (aggiornata al 27/02/2025).
Le geometrie originali sono state modificate e integrate con strutture modellate appositamente.

Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res 2009.
