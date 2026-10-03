# Deploy NotaioGiusto.it

Directory server: `/var/www/notaiogiusto-it`  
Host: `37.60.255.18`  
Canonico: `https://www.notaiogiusto.it` (apex redirige a www)

## DNS (obbligatorio prima di SSL)

Nel pannello del registrar impostare:

| Tipo | Nome | Valore |
|------|------|--------|
| A | `@` | `37.60.255.18` |
| A | `www` | `37.60.255.18` |

Oppure nameserver del registrar con gli stessi A record.

Verifica: `dig +short www.notaiogiusto.it A` deve restituire `37.60.255.18`.

## Checklist app

1. Codice in `/var/www/notaiogiusto-it` (rsync/git)
2. `.env` con almeno:
   - `DATABASE_URL` (Postgres locale `127.0.0.1:5432`, schema `notai`)
   - `SITE_URL=https://www.notaiogiusto.it`
   - `ADMIN_TOKEN`
   - `AUTH_SECRET`
3. `npm install && npm run build`
4. `pm2 start ecosystem.config.cjs && pm2 save`
5. Nginx:

```bash
sudo cp deploy/nginx/notaiogiusto.it.conf /etc/nginx/sites-available/notaiogiusto.it
sudo ln -sf /etc/nginx/sites-available/notaiogiusto.it /etc/nginx/sites-enabled/notaiogiusto.it
sudo nginx -t && sudo systemctl reload nginx
```

6. SSL (solo dopo DNS online):

```bash
sudo certbot --nginx -d www.notaiogiusto.it -d notaiogiusto.it
```

Certbot aggiornerà la conf per HTTPS e il redirect apex → `https://www...`.

## Aggiornamento

```bash
cd /var/www/notaiogiusto-it
# sync codice +
npm install
npm run build
pm2 restart notaiogiusto-it --update-env
```

## Note

- Porta app: `4330` (solo localhost)
- Processo PM2: `notaiogiusto-it`
- Admin: `/admin/login` con `ADMIN_TOKEN`
- Non versionare `.env`, chiavi SSH o API key
