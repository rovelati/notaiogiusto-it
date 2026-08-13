# Arricchimento Notai Da PagineGialle

PagineGialle e una fonte di arricchimento, non il master.

Il master resta sempre `notai.notaries` importato da `notariato.it`, perche e l'albo ufficiale. PagineGialle puo aggiungere:

- sito web;
- telefono/WhatsApp;
- email quando presente;
- descrizione commerciale;
- immagini;
- rating/recensioni PagineGialle;
- servizi dichiarati o inferibili dal testo.

## Come Trovare La Scheda Corretta

Strategia consigliata:

1. partire dal notaio ufficiale in `notai.notaries`;
2. cercare candidate su PagineGialle con `https://www.paginegialle.it/ricerca/notai/<Comune>`;
3. estrarre i link scheda dalla pagina risultati;
4. parsare ogni scheda candidata;
5. calcolare score di match:
   - nome/cognome in overlap;
   - comune nel testo/indirizzo;
   - telefono uguale quando disponibile;
   - categoria notarile;
   - presenza sito/email;
6. salvare solo gli enrichment sopra soglia in `notai.notary_enrichments`;
7. applicare a `notai.notaries` solo campi mancanti, senza sovrascrivere il dato ufficiale Notariato.

Per URL gia nota:

```bash
cd /var/www/notaiogiusto-it/SCRIPT/DB
python3 enrich_paginegialle_notai.py \
  --source-slug davide-de-pasquale \
  --pg-url https://www.paginegialle.it/notaiodavide-de-pasquale \
  --threshold 70 \
  --apply
```

Per discovery dal comune:

```bash
python3 enrich_paginegialle_notai.py \
  --source-slug davide-de-pasquale \
  --discover \
  --candidate-limit 10
```

## Parsing Schede

La tecnica migliore gia usata su Veterinari.org e ProntoFarmacie e:

- usare sessione browser-like con header completi;
- usare cookie reali PagineGialle quando necessari (`PG_COOKIE`);
- leggere JSON-LD `application/ld+json`;
- fare fallback sui blocchi HTML della scheda;
- estrarre `makesOffer`, descrizione e testi visibili per dedurre servizi.

Lo script NOTAI riusa il parser maturo in:

```text
/var/www/codebase/SPIDER/paginegialle_scraper.py
/var/www/codebase/SPIDER/paginegialle_headers.py
```

Variabile opzionale:

```env
PAGINEGIALLE_SPIDER_ROOT=/var/www/codebase/SPIDER
PG_COOKIE=<cookie aggiornato da browser se AWS WAF blocca>
```

## AWS WAF

PagineGialle puo restituire una challenge AWS WAF invece della pagina reale. In quel caso l'HTML contiene:

- `AwsWafIntegration`
- `challenge-container`
- testo tipo `verify that you're not a robot`

Lo script ora blocca il salvataggio quando rileva questa pagina, per evitare enrichment vuoti.

Soluzione operativa:

1. aprire PagineGialle da browser reale;
2. accettare/risolvere eventuale challenge;
3. copiare il cookie della sessione in `PG_COOKIE`;
4. rilanciare lo script con delay prudente.

### Refresh Cookie Con Chromium

Se il server torna spesso in WAF, usare il browser headless per ottenere una sessione reale e aggiornare `PG_COOKIE` in `.env`:

```bash
cd /var/www/notaiogiusto-it/SCRIPT/DB
./refresh_pg_cookie_then_run.sh
```

Lo script:

- installa Playwright/Chromium se mancano;
- apre PagineGialle con profilo persistente Android/Chrome;
- lascia eseguire JS/service worker;
- salva `PG_COOKIE` in `.env`;
- esegue il preflight;
- lancia il batch solo se il preflight passa.

Se PagineGialle richiede una challenge umana/captcha, lo script si ferma: non tenta bypass.

## Batch Background Prudente

Il batch lavora sui notai gia importati da Notariato e non ancora arricchiti da PagineGialle.

Comando consigliato per un primo run controllato:

```bash
cd /var/www/notaiogiusto-it/SCRIPT/DB
LIMIT=50 CANDIDATE_LIMIT=3 MIN_DELAY=60 MAX_DELAY=120 ./run_paginegialle_background.sh
```

Accorgimenti:

- preflight obbligatorio su PagineGialle prima di partire;
- delay random tra richieste;
- ricerca prima per nome notaio + comune, non generica per categoria;
- checkpoint in `state/paginegialle_batch_state.json`;
- skip automatico dei notai gia processati;
- stop immediato se appare AWS WAF;
- nessun salvataggio di record vuoti;
- applicazione solo sopra soglia match.

Monitor:

```bash
tail -f logs/paginegialle_batch_YYYYMMDD_HHMMSS.log
sudo -u postgres psql -d veterinari_org -c "select count(*) from notai.notary_enrichments where source='paginegialle';"
```

## Sitemap PagineGialle

La sitemap pubblica e:

```text
https://www.paginegialle.it/sitemap.xml
```

Le sitemap delle schede azienda sono di solito filtrabili con `schedeazienda`.

Nota operativa: anche la sitemap puo rispondere 403 se chiamata senza sessione valida. Per batch nazionale conviene:

1. usare sitemap solo per creare una lista candidate;
2. filtrare URL che contengono `notaio`, `notai`, `notarile`;
3. parsare lentamente le schede;
4. matchare contro Notariato prima di applicare.

## Servizi Iniziali

La tassonomia minima caricata in `notai.services_taxonomy` include:

- Atto di donazione
- Pratica di successione
- Testamento
- Convenzioni matrimoniali
- Eredita
- Separazione dei beni
- Diritto di famiglia
- Compravendita immobiliare
- Mutuo
- Diritto societario
- Procura
- Consulenza notarile
