# MSK Atlas — contesto progetto

## Obiettivo
Sito web statico che raccoglie modelli anatomici 3D interattivi,
a scopo didattico (anatomia muscolo-scheletrica per radiologia). Lingua dell'interfaccia: italiano.

## Nome del sito
- Nome proprio (brand): **MSK Atlas**, ovunque il sito si presenta (header, titolo della scheda, link "‹ MSK Atlas",
  footer, pannello "i", documentazione).
- "Atlante anatomico 3D" è il sottotitolo/descrizione, non il nome.
- `<title>`: homepage "MSK Atlas — Atlante anatomico 3D"; modelli "<Distretto> 3D | MSK Atlas" (es. "Ginocchio 3D | MSK Atlas").

## Materiale di partenza
La cartella `modelli/` contiene pagine HTML autocontenute, nate come artifact di Claude:
- `ginocchio-3d.html` — ginocchio 3D interattivo (three.js r128 da CDN)
- `polso-dito-3d.html` — polso destro + dito in sezione separata (three.js r128 da CDN)

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
- `.vercelignore` esclude dal deploy `strumenti/`, `CLAUDE.md`, `README.md` e `GUIDA_MODELLI.md`: restano nel repository ma non sul sito.

## Requisiti di contenuto
- Ogni pagina riporta un disclaimer breve: "Materiale didattico. Non destinato a uso clinico o diagnostico."
  Nei modelli sta nella riga dei crediti del pannello strutture e nel pannello "i" (`assets/nav.js`), non in alto.
- Al momento i modelli sono due, ma ne verranno aggiunti altri nel tempo: la struttura del sito deve permettere di aggiungere un nuovo modello in modo semplice e ripetibile, senza riorganizzare tutto.

## Aggiungere un modello
1. Copia il file in `modelli/<nome>-3d.html` (nome minuscolo, parole separate da trattini).
2. Nel tag `<html>` aggiungi l'attributo `data-theme="dark"`; imposta il `<title>` come "<Distretto> 3D | MSK Atlas"; nel `<head>` aggiungi
   `<meta name="description" content="…">` e `<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">`;
   subito dopo `<body>` aggiungi `<script src="../assets/nav.js"></script>`. Nient'altro nel file del modello.
3. Crea l'anteprima con `node strumenti/anteprima.mjs <nome>-3d` (server locale attivo sulla porta 8000):
   salva `assets/anteprime/<nome>-3d.jpg`, 1600×1000. Istruzioni e opzioni in testa allo script.
4. In `index.html` duplica un blocco `<!-- CARD MODELLO -->` e aggiorna distretto, immagine, alt,
   link, titolo e descrizione. Numero "Tav." e conteggio dei modelli sono automatici.
5. Verifica in locale, poi commit (`Aggiunge modello <nome>`) e push su `main`.

## Anteprime e animazione della homepage
- Anteprima e animazione NON vanno rigenerate a ogni modifica di un modello: si fanno alla fine, quando lo chiedo.
  Allora rigenerare l'anteprima del modello (`strumenti/anteprima.mjs`) e, per il polso,
  la sequenza della prima schermata: `node strumenti/sequenza-home.mjs polso-dito-3d`
  (salva `assets/sequenza/polso-dito-3d/l/` e `s/`; se cambia il numero di fotogrammi aggiornare `data-frames` in `index.html`).
  L'animazione segue lo scorrimento e rispetta "riduci movimento".

## Modo di lavorare
- Prima di modifiche ampie, proponi un piano e attendi conferma.
- Commit piccoli e descrittivi, in italiano.
- Dopo ogni modifica, indicami come verificarla in locale.
