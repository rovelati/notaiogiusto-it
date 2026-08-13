# Architettura NotaioGiusto.it

Documento operativo per avviare un marketplace/directory di notai simile a Veterinari.org, ma separato come applicazione, schema database e virtual host.

## Obiettivo

Creare un portale per:

- cercare notai per localita, servizio e disponibilita;
- raccogliere richieste di preventivo;
- permettere ai notai di reclamare e aggiornare la propria scheda;
- costruire pagine SEO per prestazioni notarili, citta e province;
- gestire area admin, arricchimenti dati e tracciamenti lead.

Dominio placeholder: `notaiogiusto.it`

## Server

Il progetto usera lo stesso server di Veterinari.org, ma con ambiente separato.

- IP: non versionare in repository pubblico/privato condiviso.
- Login SSH: non versionare.
- Password SSH: non versionare.
- Accesso rapido:

```bash
ssh <utente>@<server>
```

Nota: il server e condiviso solo a livello infrastrutturale. Applicazione, database schema, process manager e virtual host devono restare separati da Veterinari.org.

## Separazione Da Veterinari.org

Elementi condivisi:

- server fisico/VPS;
- Nginx;
- Postgres server;
- eventuale Mailgun/Cloudflare se si decide di riusare lo stesso provider email.

Elementi separati:

- directory applicazione;
- schema Postgres;
- variabili `.env`;
- processo PM2;
- virtual host Nginx;
- log applicativi;
- sitemap, robots, static assets;
- pipeline di import/arricchimento dati.

## Directory Server

Directory consigliata:

```text
/var/www/notaiogiusto-it
```

Struttura prevista:

```text
/var/www/notaiogiusto-it
  .env
  astro.config.mjs
  package.json
  ecosystem.config.cjs
  src/
    pages/
    components/
    layouts/
    lib/
  public/
  dist/
  db/
    migrations/
  scripts/
```

## Stack Applicativo

Stack da replicare da Veterinari.org:

- Astro con adapter Node;
- React per componenti interattivi;
- Tailwind CSS;
- Postgres proprietario;
- PM2 per esecuzione processo Node;
- Nginx come reverse proxy;
- Mailgun o Cloudflare Email per invio email transazionali;
- script Node/Python per import, arricchimento e report.

Processo PM2 consigliato:

```text
notaiogiusto-it
```

Esempio `ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: 'notaiogiusto-it',
      script: './dist/server/entry.mjs',
      cwd: '/var/www/notaiogiusto-it',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '4330',
      },
    },
  ],
};
```

Porta proposta: `4330`

## Database

Postgres condiviso come server, ma schema separato.

Schema consigliato:

```sql
create schema if not exists notai;
```

Variabile applicativa:

```env
DATABASE_URL=postgresql://.../...?options=-csearch_path%3Dnotai,public
```

In alternativa, usare sempre query qualificate:

```sql
select * from notai.notaries;
```

Approccio consigliato: query qualificate con prefisso `notai.` per evitare ambiguita con tabelle di Veterinari.org.

## Tabelle MVP

Schema minimo:

```sql
notai.notaries
notai.notary_claims
notai.quote_requests
notai.lead_events
notai.marketing_outreach
notai.services_taxonomy
notai.service_prices
notai.local_auth_users
notai.profiles
notai.blog_articles
```

### `notai.notaries`

Campi principali:

- `id uuid primary key`
- `name text`
- `slug text unique`
- `address text`
- `city text`
- `province text`
- `region text`
- `lat double precision`
- `lng double precision`
- `phone text`
- `email text`
- `website text`
- `description text`
- `services text[]`
- `hours jsonb`
- `owner_id uuid`
- `status text`
- `raw_import jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

### `notai.services_taxonomy`

Esempi servizi notarili:

- compravendita casa;
- mutuo;
- surroga;
- donazione;
- successione;
- testamento;
- costituzione societa;
- procura;
- preliminare;
- atto notarile urgente;
- consulenza notarile.

## Nginx

Template versionato:

- `deploy/nginx/notaiogiusto.it.conf`
- guida operativa: `deploy/README.md`

Virtual host:

```nginx
server {
    listen 80;
    server_name notaiogiusto.it www.notaiogiusto.it;

    location / {
        proxy_pass http://127.0.0.1:4330;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Attivazione:

```bash
sudo cp deploy/nginx/notaiogiusto.it.conf /etc/nginx/sites-available/notaiogiusto.it
sudo ln -sf /etc/nginx/sites-available/notaiogiusto.it /etc/nginx/sites-enabled/notaiogiusto.it
sudo nginx -t
sudo systemctl reload nginx
```

SSL:

```bash
sudo certbot --nginx -d notaiogiusto.it -d www.notaiogiusto.it
```

## Variabili Ambiente

File:

```text
/var/www/notaiogiusto-it/.env
```

Variabili previste:

```env
SITE_URL=https://www.notaiogiusto.it
DATABASE_URL=postgresql://...
ADMIN_TOKEN=...
AUTH_SECRET=...
MAIL_FROM=info@notaiogiusto.it
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=...
MAILGUN_BASE_URL=https://api.eu.mailgun.net
```

`ADMIN_TOKEN` protegge l'area minima `/admin/*` (login cookie httpOnly).

## Funzionalita MVP

### Lato Utente

- homepage con ricerca per prestazione e localita;
- pagina risultati notai;
- pagina scheda notaio;
- form richiesta preventivo;
- email conferma al richiedente;
- anti-duplicato richieste ravvicinate;
- pagine SEO `quanto-costa`;
- tracking click telefono, email e percorso.

### Lato Notaio

- registrazione;
- claim scheda;
- aggiornamento dati;
- gestione servizi offerti;
- inserimento prezzo indicativo/fascia prezzo;
- ricezione richieste preventivo;
- statistiche base: visite, click telefono, click percorso, richieste.

### Lato Admin

MVP attuale:

- `/admin/login` con token;
- `/admin/richieste` per leggere `quote_requests` e destinatari.

Previsto:

- gestione schede;
- gestione claim;
- gestione tassonomia servizi;
- import e deduplica;
- report email inviate;
- monitor lead e conversioni.

## SEO

Struttura URL proposta:

```text
/
/notai
/notai/[slug]
/notai/[provincia]/[comune]
/quanto-costa
/quanto-costa/[servizio]
/quanto-costa/[comune-provincia]/[servizio]/notai
/area-notai
/blog
```

Regole:

- canonical puliti via `BaseLayout` + `SITE_URL`;
- noindex su login, register, admin, dashboard, claim, preventivo, grazie;
- noindex su listing `/notai` con query di ricerca/filtro o `page>1`;
- endpoint dinamici:
  - `/sitemap.xml`
  - `/robots.txt`
- FAQ + Service JSON-LD sulle pagine `/quanto-costa/[servizio]`;
- sitemap future da segmentare per:
  - schede notai;
  - comuni/province;
  - servizi;
  - blog.

## Tracciamenti

Eventi da salvare:

- `click_phone`
- `click_email`
- `click_directions`
- `quote_request_open`
- `quote_request_submit`
- `claim_start`
- `claim_approved`
- `register_notary`

Tabella consigliata:

```sql
notai.lead_events
```

## Pipeline Dati

Fasi:

1. import anagrafica notai da fonti pubbliche;
2. normalizzazione telefono, indirizzo, localita;
3. deduplica;
4. geocoding;
5. arricchimento sito web/email;
6. tassonomia servizi;
7. descrizione scheda;
8. controllo qualita;
9. pubblicazione.

## Deploy

Flusso operativo:

```bash
cd /var/www/notaiogiusto-it
npm install
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Aggiornamento:

```bash
cd /var/www/notaiogiusto-it
npm run build
pm2 restart notaiogiusto-it --update-env
```

## Note Di Sicurezza

- non usare lo schema `public` per dati applicativi dei notai;
- non riusare tabelle di Veterinari.org;
- tenere `.env` non versionato;
- creare backup prima di import massivi;
- usare dry-run per deduplica e arricchimenti;
- non inviare email da account personali.



## Bootstrap Dati Notariato.it

La prima fonte ufficiale per popolare il DB e il sito del Consiglio Nazionale del Notariato.

- Sitemap index: `https://www.notariato.it/it/sitemap_index.xml`
- Sitemap schede: `https://www.notariato.it/it/notary-sitemap1.xml` ... `notary-sitemap26.xml`
- Esempio scheda: `https://www.notariato.it/it/notary/antonello-mobilio/`
- Directory script: `/var/www/notaiogiusto-it/SCRIPT/DB`
- Schema SQL: `notai`
- Tabella principale: `notai.notaries`

La procedura salva `source_url` e `official_reference_url`, che potranno essere usate in scheda per il badge `Notaio verificato su Notariato.it` con link `nofollow`.

Campi ufficiali importati dal plain HTML: nome e cognome, data di nascita, codice fiscale, comune, data nella sede attuale, indirizzo, CAP, telefono, email, PEC, distretto, sedi precedenti.

Regole operative dello spider:

- user-agent dedicato `NotaioGiustoBot/0.1`;
- delay predefinito 2 secondi tra schede;
- sitemap filtrate per rimuovere URL placeholder come `/it/notary/-/`;
- dry-run disponibile prima di ogni run massivo;
- upsert su `source_url` e vincolo unico su `fiscal_code` se presente;
- arricchimenti futuri salvati separatamente in `notai.notary_enrichments`.

Chiavi operative:

- `DATABASE_URL`: riuso dello stesso server Postgres, con schema separato `notai`;
- `DEEPSEEK_API_KEY`: da riportare dall'ambiente operativo Veterinari quando disponibile;
- `GOOGLE_MAPS_API_KEY`: da creare su GCP per GMB/geocoding.
