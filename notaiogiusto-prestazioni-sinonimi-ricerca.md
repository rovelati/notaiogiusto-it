# NotaioGiusto.it — Prestazioni, sinonimi e ricerca semantica

## Obiettivo

La ricerca deve portare l'utente alla prestazione corretta anche quando usa
sinonimi, termini colloquiali o giuridici, singolari/plurali, errori ortografici
e frasi naturali. Il principio è:

> 1 prestazione canonica → N sinonimi, alias e query equivalenti

I sinonimi servono la ricerca interna e non generano automaticamente nuove URL
SEO. Una landing separata è giustificata solo da intento, contenuto, funnel e
domanda di ricerca realmente distinti.

## Audit del database (22 settembre 2026)

Il database di produzione contiene 71 record. Sono stati rilevati questi gruppi:

- Donazione: `atto-di-donazione` → `donazione`
- Successione: `eredita`, `pratica-di-successione` → `successione-ereditaria`
- Mutuo: `mutuo-ipotecario` → `mutuo`
- Procura: `procura-generale-speciale` → `procura`
- Sette record societari mostravano erroneamente la label “Aprire una società”

Tutti i record duplicati hanno contenuti editoriali e alcuni hanno relazioni con
notai o benchmark. Per questo non vengono eliminati: il modello conserva record,
ID e contenuti, ma li marca come alias e applica redirect 301 alla canonica.

Sono hub, non prestazioni selezionabili: `atti-di-famiglia`,
`diritto-di-famiglia`, `diritto-societario`, `societa-e-imprese`.

Restano distinti:

- Testamento, testamento pubblico/segreto, deposito e pubblicazione
- Compravendita, prima casa, seconda casa e acquisto con mutuo
- Copia conforme e autentica di copia; una query ambigua può mostrare entrambe

## Modello dati

`services_taxonomy` distingue `service`, `alias` e `hub`, espone
`canonical_service_id` e controlla `is_searchable`.

`service_search_terms` contiene:

- `alias`: sinonimo equivalente;
- `intent`: frase naturale;
- `boost`: termine breve e fortemente caratterizzante.

`service_relations` contiene relazioni `related`, `also_consider` e
`specialization`. Le migrazioni sono in:

- `SCRIPT/DB/schema_service_search.sql`
- `SCRIPT/DB/seed_service_search.sql`

## Normalizzazione e ranking

La query viene convertita in minuscolo, senza accenti o apostrofi, con
punteggiatura e spazi normalizzati. Il motore confronta il testo con nome,
slug, alias e frasi-intento, tollerando refusi semplici.

Punteggi di riferimento:

- nome canonico esatto: 100
- alias esatto: 90
- prefisso canonico: 80
- prefisso alias: 70
- similarità con frase-intento: 60
- corrispondenza token: 40
- fuzzy/refuso: 20
- prestazione correlata: 10

La popolarità non deve superare un match lessicale o semantico più preciso.

## Copertura P0

Il seed iniziale include i dizionari prioritari per:

- Donazione
- Usufrutto e nuda proprietà
- Rogito/compravendita, preliminare, mutuo e cancellazione ipoteca
- Successione, accettazione/rinuncia, divisione ereditaria e testamento
- Procura, autentica firma e copie
- Costituzione SRL/SPA, cessione quote, modifiche statutarie
- Cessione/affitto d'azienda e principali prestazioni immobiliari/familiari

Il caso guida:

> “Voglio dare la casa a mio figlio ma continuare a viverci”

deve restituire Donazione come risultato principale e Usufrutto e nuda
proprietà come risultato secondario.

## Acceptance test minimi

Devono essere riconosciute almeno le query:

- `donare casa`, `regalare casa a mio figlio`, `intestare casa ai figli`
- `donare casa mantenendo usufrutto`, `nuda proprieta`, `rinunciare usufrutto`
- `rogito`, `comprare casa`, `compromesso`, `preliminare`
- `eredità`, `rinunciare all'eredità`, `dividere eredità`, `ultime volontà`
- `delega notarile`, `procura a vendere`, `autentica firma`, `copia autenticata`
- `aprire srl`, `vendere quote srl`, `cambiare statuto srl`, `vendere azienda`
- `diritto di passaggio`
- refusi come `succesisone`, `donazzione`, `usofrutto`, `compravendtia`,
  `proccura`, `testamneto`

## Evoluzione successiva

P1: autocomplete, logging delle zero-result, report query → click → preventivo.

P2: ranking su CTR/conversione ed embeddings solo come fallback. Il dizionario
deve essere ampliato periodicamente usando le ricerche reali, senza creare
prestazioni duplicate.
