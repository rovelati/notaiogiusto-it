# Stato progetto NotaioGiusto.it

Aggiornato: 2026-08-13

## Obiettivo

Costruire un portale simile a Veterinari.org per il mercato notarile:

- lato utente: capire quanto costa una pratica notarile, preparare una richiesta completa e contattare notai;
- lato notaio: reclamare il profilo, aggiornare dati/servizi, ricevere richieste più qualificate e misurare i contatti;
- base dati ufficiale: Notariato.it come fonte master dell'albo.

## Stack e architettura

- Frontend/server: Astro con adapter Node.
- Runtime previsto: PM2.
- Porta locale/prod MVP: `4330`.
- Database: PostgreSQL esistente, schema separato `notai`.
- Directory locale: `/Users/romolovelati/Desktop/NOTAI`.
- Directory server prevista: `/var/www/notaiogiusto-it`.
- Dominio placeholder: `notaiogiusto.it`.

Le credenziali e i file sensibili non devono essere versionati. Sono esclusi da `.gitignore`.

## Database creato

Schema PostgreSQL `notai` con:

- `notai.notaries`: anagrafica notai da Notariato.it;
- `notai.services_taxonomy`: tassonomia servizi notarili;
- `notai.service_price_benchmarks`: range prezzo indicativi;
- `notai.notary_services`: associazione notaio-servizio;
- `notai.notary_price_list_items`: listini specifici notaio;
- `notai.quote_requests`: richieste preventivo;
- `notai.quote_request_recipients`: destinatari richieste;
- `notai.notary_claims`: presa possesso profilo;
- `notai.notary_reviews` e `notai.notary_review_summaries`: predisposizione recensioni Google/AI;
- `notai.notary_metrics_daily` e `notai.notary_events`: tracking futuro;
- `notai.content_articles`: contenuti editoriali.

## Popolamento dati

Completato import iniziale da Notariato.it:

- circa 4.830 notai da fonte ufficiale;
- URL ufficiale salvata in `official_reference_url`;
- flag `is_official_notariato`;
- dati strutturati disponibili: nome, comune, indirizzo, CAP, telefono, email, PEC, distretto, sedi precedenti dove presenti.

Script principali:

- `SCRIPT/DB/import_notariato.py`
- `SCRIPT/DB/schema_notai.sql`
- `SCRIPT/DB/schema_marketplace.sql`

## Arricchimenti predisposti

### Notariato.it

Fonte master ufficiale. Va considerata la fonte più affidabile per identità e iscrizione.

### Notaioa.it

Script creati:

- `SCRIPT/DB/enrich_notaioa_notai.py`
- `SCRIPT/DB/run_notaioa_notai_batch.py`

Nota importante: Notaioa espone spesso servizi generici ripetuti su molti profili. Per evitare falsi positivi, non vengono automaticamente inseriti come servizi dichiarati dal singolo notaio.

### Virgilio Aziende

Script creati:

- `SCRIPT/DB/enrich_virgilio_notai.py`
- `SCRIPT/DB/run_virgilio_notai_batch.py`

Usato come fonte alternativa a PagineGialle quando disponibile.

### PagineGialle

Script iniziali creati, ma la fonte ha protezioni WAF più aggressive:

- `SCRIPT/DB/enrich_paginegialle_notai.py`
- `SCRIPT/DB/run_paginegialle_notai_batch.py`

Decisione attuale: evitare infrastrutture anti-WAF complesse; preferire fonti alternative e arricchimenti da siti ufficiali dei notai.

## Tassonomia servizi e prezzi

Creati 71 servizi notarili con range nazionali indicativi, tra cui:

- acquisto prima casa;
- acquisto casa con mutuo;
- acquisto seconda casa;
- successione;
- donazione;
- procura;
- costituzione SRL;
- copia conforme;
- autentica di copia;
- dichiarazione sostitutiva;
- traduzione giurata;
- cancellazione ipoteca;
- preliminare compravendita.

Script:

- `SCRIPT/DB/seed_price_benchmarks.sql`
- `SCRIPT/DB/seed_expanded_services_and_prices.sql`

Nota: i prezzi sono benchmark editoriali iniziali, da affinare con fonti pubbliche, risposte reali e listini dei notai.

## MVP applicativo realizzato

### Homepage

File: `src/pages/index.astro`

Funzionalità:

- ricerca per servizio e comune;
- copy orientato all'utente, non tecnico;
- servizi più cercati;
- rimozione dei numeri come messaggio principale.

### Quanto costa

File:

- `src/pages/quanto-costa/index.astro`
- `src/pages/quanto-costa/[servizio].astro`
- `src/pages/quanto-costa/[localita]/[servizio]/notai.astro`

Funzionalità:

- landing descrittiva per servizio;
- prezzo medio/range;
- spiegazione quando serve;
- fattori che incidono sul prezzo;
- documenti da preparare;
- FAQ;
- form preventivo.

### Listing notai

File: `src/pages/notai/index.astro`

Funzionalità:

- ricerca per nome/zona/comune;
- se arriva un parametro `servizio`, la pagina diventa risposta alla ricerca servizio + comune;
- ordinamento migliorato: prima il comune esatto, poi area/distretto;
- CTA per ogni riga: chiama, preventivo, scheda;
- badge fonte ufficiale Notariato;
- rimozione badge inutili tipo email disponibile.

### Scheda notaio

File: `src/pages/notai/[slug].astro`

Funzionalità:

- design più istituzionale: blu/inchiostro/oro;
- hero con fonte ufficiale Notariato;
- barra azioni sticky/fissa mobile: chiama, chiedi preventivo, portami lì;
- contatti e sede;
- mappa;
- servizi notarili popolari o associati;
- sezione predisposta per recensioni Google + AI;
- CTA per aggiornare/reclamare profilo.

### Area notai e claim

File:

- `src/pages/area-notai.astro`
- `src/pages/claim.astro`
- `src/pages/api/claim.ts`

Funzionalità MVP:

- landing lato notai;
- form claim;
- salvataggio richiesta in DB.

### Richieste preventivo

File:

- `src/pages/api/quote-request.ts`
- `src/pages/grazie.astro`

Funzionalità:

- salvataggio richiesta in `notai.quote_requests`;
- idempotency hash per limitare duplicati identici;
- collegamento a destinatario se la richiesta parte da una scheda notaio;
- redirect a pagina grazie.

## Design

Aggiornata palette:

- blu/inchiostro per istituzionalità;
- oro come accento notarile;
- rimosso il verde dominante che ricordava Veterinari.org/farmacie.

CSS principale:

- `public/styles.css`

## Verifiche fatte

Comando:

```bash
npm run build
```

Stato: OK.

Smoke test locali:

- `/`
- `/quanto-costa/autentica-copia`
- `/notai?servizio=dichiarazione-sostitutiva-atto-notorieta&comune=milano`
- `/notai/achille-giannitti`

Tutte le pagine hanno risposto `200` durante i test locali.

## Cosa manca

### Priorità alta

- Deploy su server `/var/www/notaiogiusto-it`.
- Configurazione virtual host Nginx per `notaiogiusto.it`.
- PM2 production process.
- Variabili ambiente production con `DATABASE_URL`.
- Form preventivo completo con scelta multipla fino a 3 notai.
- Invio email reale a notai e richiedente.
- Area admin per vedere richieste preventivo.
- Pagina 404 in stile.
- Sitemap XML e robots.txt.
- Canonical/noindex per query inutili o paginazioni.

### Dati e arricchimenti

- Geocoding massivo indirizzi notai.
- Recupero siti ufficiali dei notai.
- Parsing dei siti ufficiali per servizi e contatti.
- Google Places API per recensioni, rating, coordinate e sito.
- Sintesi AI recensioni e classificazione servizi.
- Miglioramento mapping servizi: dichiarati, probabili, da confermare.
- Arricchimento listini da fonti pubbliche e risposte reali.

### UX/prodotto

- Funnel preventivo guidato per pratica:
  - acquisto casa;
  - mutuo;
  - successione;
  - donazione;
  - procura;
  - società.
- Area utente con storico richieste.
- Area notaio con gestione profilo, servizi, listino e lead.
- Tracking click telefono, preventivo, percorso, scheda.
- Dashboard statistiche per notai.

### SEO

- Pagine località + servizio indicizzabili.
- Title/description specifici per pratica e città.
- Dati strutturati LocalBusiness/LegalService da verificare.
- FAQ structured data per pagine Quanto Costa.
- Contenuti editoriali sulle pratiche principali.
- Internal linking tra servizio, città e schede notai.

## Note per Cursor

Il progetto è Astro server-rendered. Le query DB sono in:

- `src/lib/db.ts`
- `src/lib/notai.ts`

Le pagine principali sono in:

- `src/pages/index.astro`
- `src/pages/quanto-costa/[servizio].astro`
- `src/pages/notai/index.astro`
- `src/pages/notai/[slug].astro`

Prima di modificare i dati:

1. verificare lo schema in `SCRIPT/DB/schema_notai.sql` e `SCRIPT/DB/schema_marketplace.sql`;
2. fare dry-run quando si aggiornano molti record;
3. non salvare credenziali o `.env` nel repository;
4. distinguere sempre:
   - dati ufficiali Notariato;
   - dati arricchiti da fonti terze;
   - servizi dichiarati;
   - servizi probabili;
   - servizi solo richiesti dall'utente.
