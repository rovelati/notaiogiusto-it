# Geocoding Notai con Nominatim (OSM, gratis)

Fonte: `https://nominatim.openstreetmap.org`  
Policy: max 1 richiesta/secondo, User-Agent identificativo, cache obbligatoria.

## Script

```bash
cd SCRIPT/DB
# dry-run (non scrive lat/lng)
python3 geocode_nominatim_notai.py --limit 20

# applica su DB
python3 geocode_nominatim_notai.py --limit 500 --apply --delay 1.2

# priorità città
python3 geocode_nominatim_notai.py --comune Milano --limit 300 --apply
```

## Output

- aggiorna `notai.notaries.lat/lng` solo se ancora null (`coalesce`)
- log in `notai.notary_enrichments` con `source='nominatim'`
- cache file: `state/nominatim_geocode_cache.json`

## Tempi indicativi

~4650 senza coordinate a 1.2s ≈ **1.5–2 ore** di batch continuo.
