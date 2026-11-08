# Deploying ZEUS at https://zeusedu.tech

The app is one Docker stack (`postgres` + `zeus`) listening on `127.0.0.1:8000`,
with nginx as the public HTTPS entry point in front of it.

```
Internet → nginx :443 ──► 127.0.0.1:8000 (zeus container) ──► postgres:5432
```

## 1. DNS

`zeusedu.tech` and `www.zeusedu.tech` must both be `A` records pointing at this
server. On the current host that is already the case (`88.223.95.105`).

```bash
getent hosts zeusedu.tech www.zeusedu.tech
```

## 2. Configure `.env`

Create it from the template (`cp .env.example .env`) and fill in at least:

| Variable | Value / notes |
| --- | --- |
| `POSTGRES_PASSWORD` | strong admin password for Postgres |
| `POSTGRES_APP_PASSWORD` | URL-safe password for the app role |
| `SECRET_KEY` | 32+ random chars, required or the API refuses to start |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first admin account |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:8000,https://zeusedu.tech,https://www.zeusedu.tech` |
| `FRONTEND_URL` | `https://zeusedu.tech` |
| `GOOGLE_REDIRECT_URI` | `https://zeusedu.tech/api/auth/google/callback` |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | optional AI providers |

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"   # for SECRET_KEY / passwords
```

`FRONTEND_URL` matters: password-reset links and the Google OAuth callback
redirect there, so leaving it as `http://localhost:8000` sends users to a dead
URL in production.

## 3. Firewall

```bash
sudo ufw allow 22,80,443/tcp
```

## 4. TLS certificate + nginx

certbot needs port 80 before nginx has a certificate, so serve the ACME
challenge from a temporary HTTP-only site first.

```bash
sudo apt update && sudo apt install -y nginx certbot
sudo mkdir -p /var/www/certbot

sudo tee /etc/nginx/sites-available/zeusedu.tech >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name zeusedu.tech www.zeusedu.tech;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 503; }
}
EOF

sudo ln -sf /etc/nginx/sites-available/zeusedu.tech /etc/nginx/sites-enabled/zeusedu.tech
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable --now nginx

sudo certbot certonly --webroot -w /var/www/certbot \
  -d zeusedu.tech -d www.zeusedu.tech \
  --agree-tos -m you@example.com --no-eff-email \
  --deploy-hook "systemctl reload nginx"
```

That writes the certificate to `/etc/letsencrypt/live/zeusedu.tech/`, which is the
path referenced by `nginx/zeusedu.tech.conf`. Renewal is then automatic
(`certbot.timer`) through the same webroot, with nginx reloaded afterwards.

Now install the real site config and reload:

```bash
sudo cp nginx/zeusedu.tech.conf /etc/nginx/sites-available/zeusedu.tech
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Start the application

```bash
cd /home/mohamed/zeusedu/project
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs -f zeus
```

This account is not in the `docker` group yet, so `docker compose` needs `sudo`.
To drop that, run `sudo usermod -aG docker $USER` and log in again.

## 6. Verify

```bash
curl -sI http://zeusedu.tech | head -1                 # 301 → https
curl -s  https://zeusedu.tech/api/health               # {"status":"ok"}
curl -sI https://www.zeusedu.tech | grep -i location   # → https://zeusedu.tech
```

Then open https://zeusedu.tech and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## 7. Google sign-in (optional)

In Google Cloud console → APIs & Services → Credentials → your OAuth 2.0 client,
add the authorized redirect URI:

```
https://zeusedu.tech/api/auth/google/callback
```

## Updating the app later

```bash
cd /home/mohamed/zeusedu/project
git pull
sudo docker compose up -d --build
```

Uploaded files live in the `zeus_uploads_data` volume and the database in
`zeus_postgres_data`, so rebuilds keep user data.
