# Arricchimento notai con Google Places

`enrich_google_places_notai.py` parte dal NAP già presente in
`notai.notaries` e cerca un luogo Google tramite:

1. telefono;
2. nome + indirizzo + comune;
3. nome + comune.

Il match viene accettato solo sopra la soglia configurata. Telefono, nome,
via/civico, comune e distanza contribuiscono al punteggio. Lo stesso
`place_id` non può essere associato a due notai.

## Dati acquisiti

- sito, telefono e coordinate, solo se mancanti nella fonte ufficiale;
- URL Google Maps, stato attività e orari;
- rating aggregato e numero totale di valutazioni;
- massimo cinque recensioni restituite da Place Details;
- riferimenti foto e relative attribuzioni (non viene salvata la chiave API);
- sentiment trasparente per professionalità, chiarezza, disponibilità,
  tempi e trasparenza dei costi.

Il sentiment usa un lessico deterministico e viene sempre presentato come
analisi di un campione parziale. Non modifica il testo ufficiale della scheda.

## Configurazione

Nel file locale `SCRIPT/DB/.env`, escluso da Git:

```dotenv
DATABASE_URL=postgresql://...
GOOGLE_MAPS_API_KEY=...
GOOGLE_MAPS_REFERER=https://www.notaiogiusto.it/
```

La chiave deve essere limitata alle API necessarie e, quando l’esecuzione
avviene sul server, all’IP del server.

## Esecuzione sicura

Applicare prima lo schema:

```bash
psql "$DATABASE_URL" -f schema_google_places_notai.sql
```

Provare una sola scheda senza scrivere:

```bash
python3 enrich_google_places_notai.py \
  --slug nome-cognome \
  --limit 1 \
  --max-cost-usd 0.20 \
  --report-json state/google-places-test.json
```

Applicare il risultato verificato:

```bash
python3 enrich_google_places_notai.py \
  --slug nome-cognome \
  --limit 1 \
  --max-cost-usd 0.20 \
  --apply
```

Batch controllato:

```bash
python3 enrich_google_places_notai.py \
  --limit 25 \
  --max-cost-usd 5 \
  --apply
```

## Batch quotidiano e report email

`run_google_places_daily.py` seleziona al massimo 8 notai non controllati negli
ultimi 30 giorni, applica l'arricchimento con un limite di spesa e invia via
SMTP Brevo un riepilogo HTML. Al termine invia a IndexNow le URL delle sole
schede arricchite e include l'esito nell'email. Il report JSON resta in
`SCRIPT/DB/state/`.

Le modifiche alle schede aggiornano automaticamente `notaries.updated_at`,
quindi il nuovo `lastmod` viene pubblicato in `/sitemap-notai.xml` per Google.
Non viene usata la Google Indexing API, che non è ammessa per questo tipo di
pagina, né il vecchio ping sitemap, ormai dismesso.

Configurare la chiave pubblica IndexNow in `indexing.env`:

```dotenv
INDEXNOW_KEY=e55ec9dad316283b4b40a5b6bf894b55
```

Il relativo file di verifica è disponibile in
`/e55ec9dad316283b4b40a5b6bf894b55.txt`.

Esecuzione manuale:

```bash
python3 SCRIPT/DB/run_google_places_daily.py \
  --limit 8 \
  --max-cost-usd 1.00 \
  --email-to romolo.velati@gmail.com
```

Verifica del solo invio email, senza chiamare Google né modificare il database:

```bash
python3 SCRIPT/DB/run_google_places_daily.py \
  --test-email \
  --email-to romolo.velati@gmail.com
```

Test della selezione URL senza inviare notifiche:

```bash
python3 SCRIPT/DB/notify_indexing.py \
  --report-json SCRIPT/DB/state/google-places-daily-YYYYMMDD.json \
  --dry-run
```

### Configurazione Cron sul Server (`crontab -e`)

Configurazione attiva sul server ogni mattina alle 06:20:

```cron
20 6 * * * /usr/bin/flock -n /tmp/notaiogiusto-google-places.lock /bin/bash -lc 'cd /var/www/notaiogiusto-it && /usr/bin/python3 SCRIPT/DB/run_google_places_daily.py --limit 8 --max-cost-usd 1.00 --email-to romolo.velati@gmail.com >> /var/log/notaiogiusto/google-places-daily.log 2>&1'
```

## Foto e recensioni

Le foto vengono richieste al bisogno tramite un endpoint server-side: la
chiave non arriva al browser e non vengono create copie permanenti. In pagina
restano visibili fonte, link Google Maps, attribuzione disponibile e avviso
sul campione parziale delle recensioni.
