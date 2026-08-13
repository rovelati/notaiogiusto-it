# Import Notai Da Notariato.it

Questa directory contiene la prima procedura DB per `notaiogiusto.it`.

Fonte ufficiale:

- sitemap index: `https://www.notariato.it/it/sitemap_index.xml`
- sitemap notai: `https://www.notariato.it/it/notary-sitemap1.xml` ... `notary-sitemap26.xml`
- scheda ufficiale: `https://www.notariato.it/it/notary/<slug>/`

La `source_url` viene salvata come riferimento ufficiale e potra alimentare il badge "Notaio verificato su Notariato.it" con link `nofollow`.

## Setup

```bash
cd /var/www/notaiogiusto-it/SCRIPT/DB
python3 -m pip install -r requirements.txt
cp .env.example .env
chmod 600 .env
```

Nel file `.env`:

- `DATABASE_URL`: stesso server Postgres di Veterinari.org, ma le tabelle sono nello schema separato `notai`.
- `DEEPSEEK_API_KEY`: da riportare dall'ambiente operativo di Veterinari.org quando disponibile.
- `GOOGLE_MAPS_API_KEY`: placeholder, da creare in GCP per GMB/geocoding.

## Creazione Schema

```bash
python3 import_notariato.py --apply-schema --dry-run --limit 0
```

## Test Non Aggressivo

Singola scheda:

```bash
python3 import_notariato.py \
  --only-url https://www.notariato.it/it/notary/antonello-mobilio/ \
  --dry-run
```

Primi 10 record ufficiali validi:

```bash
python3 import_notariato.py --all-sitemaps --limit 10 --delay 2
```

Se il server/macchina locale ha un bundle CA incompleto e genera errori `CERTIFICATE_VERIFY_FAILED`, usare temporaneamente:

```bash
python3 import_notariato.py --all-sitemaps --limit 10 --delay 2 --insecure
```

Il flag `--insecure` va usato solo come fallback operativo; di default lo script verifica TLS.

## Import Completo

Da lanciare solo dopo controllo del campione:

```bash
python3 import_notariato.py --all-sitemaps --delay 2 --timeout 30
```

Con 2 secondi di pausa tra schede, l'import completo e volutamente lento per non essere aggressivo verso `notariato.it`.

## Dati Salvati

Tabella principale: `notai.notaries`.

Campi ufficiali salvati:

- nome e cognome;
- data di nascita;
- codice fiscale;
- comune;
- data in questa sede;
- indirizzo;
- CAP;
- telefono e telefoni normalizzati in array;
- email;
- PEC;
- distretto;
- sedi precedenti;
- URL ufficiale e canonical;
- testo grezzo visibile e hash HTML.

Gli arricchimenti futuri andranno in `notai.notary_enrichments` e tabelle dedicate, senza sovrascrivere i dati ufficiali se non con regole esplicite.
