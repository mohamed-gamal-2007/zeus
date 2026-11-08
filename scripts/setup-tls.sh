#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  ZEUS — one-shot TLS setup for https://zeusedu.tech
#
#  Installs nginx + certbot, issues a Let's Encrypt certificate (HTTP-01 via
#  webroot), then enables nginx/zeusedu.tech.conf. Safe to re-run: an existing
#  certificate is reused instead of re-issued.
#
#  Usage:
#    sudo bash scripts/setup-tls.sh
#    sudo CERTBOT_EMAIL=you@example.com bash scripts/setup-tls.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="zeusedu.tech"
WWW="www.${DOMAIN}"
EMAIL="${CERTBOT_EMAIL:-admin@${DOMAIN}}"

WEBROOT="/var/www/certbot"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_SRC="${PROJECT_DIR}/nginx/${DOMAIN}.conf"
SITE_AVAIL="/etc/nginx/sites-available/${DOMAIN}"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

if [[ "${EUID}" -ne 0 ]]; then
    echo "error: run this with sudo (sudo bash $0)" >&2
    exit 1
fi

if [[ ! -f "${SITE_SRC}" ]]; then
    echo "error: site config not found at ${SITE_SRC}" >&2
    exit 1
fi

echo "==> Installing nginx and certbot"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot

# certbot ships in the Ubuntu repos; fall back to snap if it is unavailable.
if ! command -v certbot >/dev/null 2>&1; then
    echo "==> certbot not in apt, installing from snap"
    snap install --classic certbot
    ln -sfn /snap/bin/certbot /usr/bin/certbot
fi

echo "==> Opening ports 80/443 in ufw"
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true

echo "==> Preparing ACME webroot"
mkdir -p "${WEBROOT}"

# ── Certificate ──────────────────────────────────────────────────────────────
# certbot needs port 80 serving the challenge before any certificate exists, so
# a temporary HTTP-only site is enabled first; it is replaced further down.
if [[ -f "${CERT_DIR}/fullchain.pem" ]]; then
    echo "==> Certificate already present at ${CERT_DIR}, reusing it"
else
    echo "==> Enabling temporary HTTP-only site for the ACME challenge"
    cat > "${SITE_AVAIL}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW};
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 503; }
}
NGINX
    ln -sfn "${SITE_AVAIL}" "/etc/nginx/sites-enabled/${DOMAIN}"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl enable --now nginx
    systemctl reload nginx

    echo "==> Requesting certificate for ${DOMAIN} and ${WWW} (contact: ${EMAIL})"
    certbot certonly --webroot -w "${WEBROOT}" \
        -d "${DOMAIN}" -d "${WWW}" \
        --agree-tos -m "${EMAIL}" --no-eff-email --non-interactive \
        --deploy-hook "systemctl reload nginx"
fi

# ── Real site config ─────────────────────────────────────────────────────────
echo "==> Installing ${SITE_SRC} -> ${SITE_AVAIL}"
install -m 644 "${SITE_SRC}" "${SITE_AVAIL}"
ln -sfn "${SITE_AVAIL}" "/etc/nginx/sites-enabled/${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# ── Verify ───────────────────────────────────────────────────────────────────
echo "==> Verifying"
printf 'apex http : '; curl -sI "http://${DOMAIN}/" | head -1 || true
printf 'apex https: '; curl -s -o /dev/null -w '%{http_code}\n' "https://${DOMAIN}/api/health" || true
printf 'www  https: '; curl -sI "https://${WWW}/" | grep -i '^location:' || true
echo
echo "Certificate: ${CERT_DIR}/fullchain.pem"
echo "Renewal is handled by certbot.timer; check with: systemctl list-timers certbot.timer"
echo "If /api/health returned 502, that is expected until the Docker stack is running."
