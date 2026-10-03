# Arricchimento Notai Da Aziende Virgilio

Virgilio viene usato come fonte secondaria piu semplice di PagineGialle quando PagineGialle attiva AWS WAF.

Il master resta sempre `notai.notaries` importato dall'albo ufficiale `notariato.it`.

## Fonte

Le pagine listing sono su:

```text
https://www.virgilio.it/italia/<comune-slug>/cat/NOTAI_STUDI.html
```

Le schede azienda sono su:

```text
https://aziende.virgilio.it/notaio/<localita>/<slug>
```

## Dati Estratti

Lo script `enrich_virgilio_notai.py` estrae:

- nome;
- categoria;
- indirizzo, CAP, localita;
- telefono;
- sito web;
- immagine/logo;
- coordinate;
- descrizione;
- orari, quando presenti;
- servizi notarili inferiti dal testo.

Virgilio non sempre espone JSON-LD. Usa soprattutto Microdata/schema.org inline e attributi JavaScript della mappa, quindi il parser usa `BeautifulSoup(lxml)` piu regex mirate.

## Match

Il match e conservativo:

- overlap nome/cognome;
- comune nel testo/indirizzo;
- telefono uguale, se disponibile;
- categoria notarile;
- sito/descrizione presenti.

Applica solo se lo score supera la soglia, default `70`.

## Test Singolo

```bash
cd /var/www/notaiogiusto-it/SCRIPT/DB
python3 enrich_virgilio_notai.py \
  --source-slug antonello-mobilio \
  --discover \
  --candidate-limit 10
```

Con URL nota:

```bash
python3 enrich_virgilio_notai.py \
  --source-slug orlando-ruggiero \
  --virgilio-url https://aziende.virgilio.it/notaio/pieve-di-cadore-bl/orlando-ruggiero-notaio-pieve-di-cadore-bl \
  --apply
```

## Batch Background

Preferito rispetto a PagineGialle (spesso bloccato da AWS WAF).

```bash
cd /var/www/notaiogiusto-it/SCRIPT/DB
# Milano (default)
LIMIT=80 COMUNE=Milano CANDIDATE_LIMIT=25 ./run_virgilio_background.sh

# altro comune
LIMIT=40 COMUNE=Roma ./run_virgilio_background.sh
```

Monitor:

```bash
tail -f "$(cat state/virgilio_batch.logpath)"
sudo -u postgres psql -d veterinari_org -c "select count(*) from notai.notary_enrichments where source='virgilio';"
sudo -u postgres psql -d veterinari_org -c "select count(*) from notai.notary_services where source='virgilio';"
```
