# Deploy NotaioGiusto.it

Directory server prevista: `/var/www/notaiogiusto-it`

## Checklist

1. Clona il repo in `/var/www/notaiogiusto-it`
2. Copia `.env.example` in `.env` e valorizza:
   - `DATABASE_URL`
   - `SITE_URL=https://www.notaiogiusto.it`
   - `ADMIN_TOKEN`
3. Installa e build:

```bash
cd /var/www/notaiogiusto-it
npm install
npm run build
```

4. Avvia PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

5. Nginx:

```bash
sudo cp deploy/nginx/notaiogiusto.it.conf /etc/nginx/sites-available/notaiogiusto.it
sudo ln -sf /etc/nginx/sites-available/notaiogiusto.it /etc/nginx/sites-enabled/notaiogiusto.it
sudo nginx -t
sudo systemctl reload nginx
```

6. SSL:

```bash
sudo certbot --nginx -d notaiogiusto.it -d www.notaiogiusto.it
```

## Aggiornamento

```bash
cd /var/www/notaiogiusto-it
git pull
npm install
npm run build
pm2 restart notaiogiusto-it --update-env
```

## Note

- Porta app: `4330`
- Processo PM2: `notaiogiusto-it`
- Admin: `/admin/login` con `ADMIN_TOKEN`
- Non versionare `.env`, chiavi SSH o API key
