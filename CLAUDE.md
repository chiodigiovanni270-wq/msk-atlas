# MSK Atlas — contesto progetto

## Obiettivo
Sito web statico che raccoglie modelli anatomici 3D interattivi,
a scopo didattico (anatomia muscolo-scheletrica per radiologia). Lingua dell'interfaccia: italiano.

## Nome del sito
- Nome proprio (brand): **MSK Atlas**, ovunque il sito si presenta (header, titolo della scheda, link "‹ MSK Atlas",
  footer, pannello "i", documentazione).
- "Atlante anatomico 3D" è il sottotitolo/descrizione, non il nome.
- `<title>`: homepage "MSK Atlas — Atlante anatomico 3D"; modelli "<Distretto> 3D | MSK Atlas" (es. "Ginocchio 3D | MSK Atlas").

## Modelli
La cartella `modelli/` contiene pagine HTML autocontenute (three.js r128 da CDN), nate come artifact di Claude:
- `polso-dito-3d.html` — polso destro + dito medio in sezione separata (`#dito`); in homepage sono due card distinte,
  Polso (`polso-dito-3d.jpg`) e Dito (link con `#dito`, anteprima `dito-3d.jpg` creata con `--sezione=dito`);
  nella pagina del modello non c'è più il selettore Polso/Dito: le due sezioni si aprono solo dalle rispettive card
- `gomito-3d.html` — gomito destro, con regioni guidate (tunnel cubitale, fossa cubitale) e piano di taglio
- `spalla-3d.html` — spalla destra (costruita da BodyParts3D a strati con gli script `*-spalla.mjs`)
- `ginocchio-3d.html` — ginocchio destro
- `anca-3d.html` — anca destra, 62 strutture; versione in revisione anatomica sul ramo dedicato (27 strutture vascolo-nervose ricostruite; borse e rami minuti esclusi)

Ogni file include dati embedded in base64 (geometrie/immagini): sono file grandi (2–8 MB), è normale.

## Vincoli tecnici
- Sito statico, nessun backend. Hosting: Vercel, collegato a un repository GitHub (deploy automatico a ogni push su `main`).
- Preferire HTML/CSS/JS vanilla, senza framework né build step, salvo mia richiesta esplicita.
- Ogni modello deve restare una pagina indipendente e funzionante anche da sola.
- NON modificare la logica anatomica, le geometrie, i colori o i controlli dei modelli se non te lo chiedo:
  puoi solo aggiungere elementi comuni (pulsanti di navigazione, link alla home, meta tag, favicon).
- Per qualsiasi modifica a un modello, leggere e rispettare `GUIDA_MODELLI.md`.
- Tema: tutto il sito usa sempre il tema scuro, indipendentemente dall'impostazione del sistema.
  Nei modelli è impostato con l'attributo `data-theme="dark"` sul tag `<html>` (unica modifica autorizzata al tag)
  e ribadito da `assets/nav.js`; homepage e nuove pagine usano la stessa palette scura dei modelli.
- Responsive: deve funzionare bene su smartphone (touch) e desktop.
- Nessun cookie, nessun tracciamento di terze parti.
- Installazione come app: `manifest.webmanifest` e icone in `assets/icone/` (generate da `strumenti/icone.mjs`). Solo in homepage, da iPhone/iPad/Android e non da app già installata, compare dopo 3 s un foglio dal basso "App MSK Atlas" (iOS: istruzioni Condividi; Android/Chrome: pulsante Installa). Alla chiusura la data si salva in `localStorage` (solo sul dispositivo): non riappare per 1 giorno. Il blocco "App MSK Atlas" in fondo alla homepage con le istruzioni resta sempre visibile.
- `.vercelignore` esclude dal deploy `strumenti/`, `CLAUDE.md`, `README.md` e `GUIDA_MODELLI.md`: restano nel repository ma non sul sito.

## Requisiti di contenuto
- Ogni pagina riporta un disclaimer breve: "Materiale didattico. Non destinato a uso clinico o diagnostico."
  Nei modelli sta in una sola riga nel pannello strutture (riga `.credit`) e nel pannello "i" (`assets/nav.js`), non in alto. Crediti, attribuzione BodyParts3D ed elenco delle strutture (da BodyParts3D / ricostruite / non incluse, via `<meta name="strutture-bp3d|strutture-modellate|strutture-escluse">`) stanno solo nel pannello "i".
- Schede delle strutture (card che si apre toccando una struttura), uguali in tutti i modelli: nota `info` breve (decorso essenziale e uno o due rilievi clinico-radiologici);
  per muscoli, legamenti, retinacoli, aponeurosi e membrane anche i campi `o`, `ins`, `fn` (Origine, Inserzione, Funzione), che la nota non ripete;
  per i nervi solo la nota, che dice se sono motori, sensitivi o misti e cosa innervano. Dettagli in `GUIDA_MODELLI.md` (sezione "Dati").
- Al momento i modelli sono cinque (anca in revisione), ma ne verranno aggiunti altri nel tempo: la struttura del sito deve permettere di aggiungere un nuovo modello in modo semplice e ripetibile, senza riorganizzare tutto.

## Aggiungere un modello
1. Copia il file in `modelli/<nome>-3d.html` (nome minuscolo, parole separate da trattini).
2. Nel tag `<html>` aggiungi l'attributo `data-theme="dark"`; imposta il `<title>` come "<Distretto> 3D | MSK Atlas"; nel `<head>` aggiungi
   `<meta name="description" content="…">` e `<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">`;
   subito dopo `<body>` aggiungi `<script src="../assets/nav.js"></script>`. Aggiungi anche i `<meta name="strutture-bp3d">` e `strutture-modellate` (facoltativo `strutture-escluse`) per la sezione "Strutture del modello" del pannello "i". Nient'altro nel file del modello.
3. Crea l'anteprima con `node strumenti/anteprima.mjs <nome>-3d` (server locale attivo sulla porta 8000):
   salva `assets/anteprime/<nome>-3d.jpg`, 1600×1000. Istruzioni e opzioni in testa allo script
   (`--zoom`, `--dx`/`--dy`, `--vista`, `--ruota`/`--inclina`, `--sezione`). Inquadrature in uso: spalla `--ruota=68 --zoom=1.25` (obliqua anterolaterale),
   anca `--zoom=1.4`, dito `--sezione=dito --ruota=40 --inclina=8 --zoom=1.6`.
4. In `index.html` duplica un blocco `<!-- CARD MODELLO -->` e aggiorna distretto, immagine, alt,
   link e titolo, e imposta `data-strutture` sul `<li class="card">` (numero di strutture con scheda del modello: righe dell'elenco "Strutture").
   Ordine delle card: prima tavola la spalla, poi il resto dell'arto superiore (gomito, polso, dito), infine l'inferiore (anca, ginocchio).
   La card non ha descrizione: solo titolo con freccia e riga "N strutture". Numero "Tav.", riga "N strutture", conteggio dei modelli e totale delle strutture sono automatici.
5. Verifica in locale, poi commit (`Aggiunge modello <nome>`) e push su `main`.

## Strumenti (`strumenti/`)
- Script Node (`.mjs`, Node 22+, senza dipendenze) che rigenerano o correggono le mesh incorporate nei modelli; non sono pubblicati sul sito.
  Le geometrie si modificano con uno script, non a mano nel base64: per cambiarle si regolano i parametri dello script e lo si rilancia.
- Nome `<struttura>-<modello>.mjs` (es. `nervi-gomito.mjs`, `legamenti-polso.mjs`); funzioni comuni in `lib-modello.mjs`
  (lettura/scrittura di `bpdat`/`bpman`, `REAL`, `setMesh`) e nelle `lib-*.mjs` di distretto. `MODELLO=<file>` fa lavorare lo script su una copia.
- In testa a ogni script: uso, eventuali modalità che non scrivono (`verifica`, `prova`) e, se riparte dalle mesh di una revisione git
  (es. `PARTENZA`, `BASE`), quale: così si può rilanciare con lo stesso risultato; altrimenti va detto se si può rilanciare. Gli script di un modello vanno lanciati nell'ordine indicato in `GUIDA_MODELLI.md`.
- Ogni script nuovo o modificato va descritto in `GUIDA_MODELLI.md` (sezione "Dati": cosa fa, metodo, parametri, ordine nella catena).
- Strumenti del sito: `anteprima.mjs` e `sequenza-home.mjs` (con `lib-chrome.mjs`, Chrome headless), `icone.mjs`.

## Anteprime e animazione della homepage
- Anteprima e animazione NON vanno rigenerate a ogni modifica di un modello: si fanno alla fine, quando lo chiedo.
  Allora rigenerare l'anteprima del modello (`strumenti/anteprima.mjs`) e, per il polso,
  la sequenza della prima schermata: `node strumenti/sequenza-home.mjs polso-dito-3d`
  (salva `assets/sequenza/polso-dito-3d/l/` e `s/`, ritagliati sul modello; se cambiano il numero di fotogrammi o il ritaglio aggiornare `data-frames` e `data-crop` in `index.html`,
  e le dimensioni dell'`<img>` di riserva nel CSS).
  L'animazione segue lo scorrimento e rispetta "riduci movimento".

## Modo di lavorare
- Prima di modifiche ampie, proponi un piano e attendi conferma.
- Commit piccoli e descrittivi, in italiano; per le modifiche a un modello il messaggio inizia con il distretto (es. "Gomito: …").
- Dopo ogni modifica, indicami come verificarla in locale.

## Ricerca anatomica dalla homepage
- `assets/ricerca.js` e `assets/ricerca.css`: ricerca accessibile e indice compatto.
- Dopo modifiche a nomi, ID, categorie o tavole: `node strumenti/indice-ricerca.mjs`, committendo anche `assets/strutture.json`.
- I modelli accettano `?struttura=<id>` e il polso conserva `#dito` per il dito. A costruzione completata selezionano, isolano con le ossa e centrano la struttura.
