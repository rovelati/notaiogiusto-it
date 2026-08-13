# Stato progetto NotaioGiusto.it

Aggiornato: 2026-08-13 (blocco fascicolo immobili / dati catastali)

## Obiettivo

Costruire un portale simile a Veterinari.org per il mercato notarile:

- lato utente: capire quanto costa una pratica notarile, preparare una richiesta completa e contattare notai;
- lato notaio: reclamare il profilo, aggiornare dati/servizi, ricevere richieste più qualificate e misurare i contatti;
- base dati ufficiale: Notariato.it come fonte master dell'albo.

## Stack e architettura

- Frontend/server: Astro con adapter Node.
- Runtime previsto: PM2 (`notaiogiusto-it`).
- Porta locale/prod MVP: `4330`.
- Database: PostgreSQL esistente, schema separato `notai`.
- Directory locale: `/Users/romolovelati/Desktop/NOTAI`.
- Directory server prevista: `/var/www/notaiogiusto-it`.
- Dominio: `notaiogiusto.it` / `www.notaiogiusto.it`.
- Repo GitHub privato: `rovelati/notaiogiusto-it`.

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
- `notai.content_articles`: contenuti editoriali;
- `notai.client_properties`: fascicolo immobili/dati catastali del cliente;
- `notai.quote_request_properties`: link richiesta ↔ immobili condivisi.

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

## Distinzione fonti servizi

Regola operativa invariata:

- **fonte ufficiale Notariato**: identità/iscrizione;
- **dato arricchito**: contatti/sito/recensioni da fonti terze;
- **servizio dichiarato**: associato al notaio con evidenza;
- **servizio probabile**: ipotesi da arricchimento, da confermare;
- **servizio solo richiesto dall’utente**: scelto nel funnel/preventivo, non implica offerta dichiarata dello studio.

Nel funnel preventivo i notai selezionati vengono etichettati come “Servizio solo richiesto”.

## MVP applicativo realizzato

### Homepage / listing / scheda / quanto-costa / claim

Restano attivi e collegati al nuovo funnel preventivo.

### Funnel preventivo guidato

File:

- `src/pages/preventivo/index.astro`
- `src/pages/api/quote-request.ts`

Flusso:

1. scelta servizio;
2. dati pratica + località + contatto;
3. selezione fino a 3 notai;
4. riepilogo e salvataggio DB.

Salvataggio:

- `notai.quote_requests` con `case_details` (urgenza, valore, parti, documenti, selected_notary_ids, `service_source=user_request`);
- fino a 3 righe in `notai.quote_request_recipients` (`match_type=selected_by_user`).

### Area admin minima

File:

- `src/pages/admin/login.astro`
- `src/pages/admin/richieste.astro`
- `src/pages/admin/logout.ts`
- `src/lib/admin.ts`

Accesso con `ADMIN_TOKEN` (cookie httpOnly). Vista elenco ultime richieste + destinatari + JSON pratica.

### SEO

- canonical globale in `BaseLayout`;
- `/sitemap.xml` dinamico (statiche + servizi + schede notai);
- `/robots.txt` con disallow admin/claim/preventivo/api;
- noindex su query inutili/filtri listing e pagine private;
- JSON-LD `FAQPage` + `Service` su `/quanto-costa/[servizio]`.

### Area clienti

File:

- `src/pages/area-clienti/index.astro`
- `src/pages/area-clienti/accedi.astro`
- `src/pages/area-clienti/verifica.ts`
- `src/pages/area-clienti/richieste.astro`
- `src/pages/area-clienti/richieste/[id].astro`
- `src/pages/area-clienti/immobili/*`
- `src/pages/area-clienti/esci.ts`
- `src/lib/client-auth.ts`
- `src/lib/properties.ts`
- `SCRIPT/DB/schema_client_properties.sql`

Flusso MVP:

1. utente inserisce l’email della richiesta;
2. sistema genera link temporaneo firmato (30 minuti);
3. finché Mailgun non è attivo, il link viene mostrato in pagina;
4. cookie sessione httpOnly;
5. storico richieste + dettaglio pratica/notai selezionati;
6. fascicolo immobili con dati catastali riusabili.

### Fascicolo immobili / dati catastali

- inserimento manuale (niente accesso automatico al catasto);
- campi: nickname, indirizzo, foglio/particella/subalterno/sezione, categoria, rendita, quota, provenienza;
- tag uso: 730, IMU/TARI, compravendita, mutuo, successione, donazione, locazione, altro;
- flag `shareable` per condivisione in pratiche/preventivi;
- link ufficiali AdE/Sister/visure per recuperare i dati;
- allegabili nel funnel preventivo e salvati in `case_details.properties_snapshot`.

Secret: `AUTH_SECRET` (fallback a `ADMIN_TOKEN`).

### Deploy prep

- `ecosystem.config.cjs`
- `deploy/nginx/notaiogiusto.it.conf`
- `deploy/README.md`
- `.env.example` aggiornato a `notaiogiusto.it` + `ADMIN_TOKEN` + `AUTH_SECRET`

## Design

Palette istituzionale blu/inchiostro/oro in `public/styles.css`.
Aggiunti stili funnel, admin e area clienti.

## Verifiche fatte (questo blocco)

Comando:

```bash
npm run build
```

Stato build: OK.

Stato build: OK.

Smoke test locali:

- `/area-clienti/immobili` → 200
- `/area-clienti/immobili/nuovo` → 200
- `POST /api/client-property` → redirect dettaglio immobile
- elenco mostra foglio/particella e tag 730
- `/preventivo` step 2 mostra immobili del fascicolo allegabili

## Cosa manca

### Priorità alta

- Deploy reale su `/var/www/notaiogiusto-it` + Nginx + SSL + PM2.
- Valorizzare `ADMIN_TOKEN`, `AUTH_SECRET` e `DATABASE_URL` in production `.env`.
- Invio email reale a notai e richiedente (Mailgun), incluso magic link area clienti.
- Pagina 404 in stile.
- Sitemap segmentate se il file unico diventa troppo grande.

### Dati e arricchimenti

- Geocoding massivo indirizzi notai.
- Recupero siti ufficiali dei notai.
- Parsing dei siti ufficiali per servizi e contatti.
- Google Places API per recensioni, rating, coordinate e sito.
- Sintesi AI recensioni e classificazione servizi.
- Miglioramento mapping servizi: dichiarati, probabili, da confermare.
- Arricchimento listini da fonti pubbliche e risposte reali.

### UX/prodotto

- Campi pratica specifici per tipologia (acquisto, successione, società...).
- Upload documenti collegati all’immobile + OCR assistito.
- Fascicolo persone/società oltre agli immobili.
- Confronto preventivi ricevuti e stati risposta notaio.
- Area notaio con gestione profilo, servizi, listino e lead.
- Tracking click telefono, preventivo, percorso, scheda.
- Dashboard statistiche per notai.

## File toccati in questo blocco

- `SCRIPT/DB/schema_client_properties.sql` (nuovo)
- `src/lib/properties.ts` (nuovo)
- `src/pages/api/client-property.ts` (nuovo)
- `src/pages/area-clienti/immobili/*` (nuovo)
- `src/pages/api/quote-request.ts`
- `src/pages/preventivo/index.astro`
- `src/pages/area-clienti/*`
- `src/components/ClientAreaNav.astro`
- `public/styles.css`
- `STATO-PROGETTO-NOTAI.md`
- `ARCHITETTURA-NOTAI.md`
- `SCRIPT/DB/README.md`

## Note per Cursor / Codex

1. Non inventare servizi dichiarati dal notaio.
2. Non committare `.env`, SSH, API key.
3. Dopo modifiche significative: `npm run build`, smoke test, commit, push, aggiornare questo file.
4. Query DB in `src/lib/db.ts` e `src/lib/notai.ts`.
5. Admin locale: impostare `ADMIN_TOKEN` nel `.env` non versionato.
6. Area clienti: impostare `AUTH_SECRET` (o riusare `ADMIN_TOKEN` come fallback).
