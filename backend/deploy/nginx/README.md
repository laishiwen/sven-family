# Backend Nginx HTTPS Bootstrap

This directory contains production nginx config for backend APIs

## One-time auto setup on ECS

From repository backend directory on ECS:

```bash
sudo -E CERTBOT_EMAIL=you@example.com ./scripts/setup_nginx_https.sh
```

What it does:

1. Ensures nginx/certbot are installed.
2. Applies temporary HTTP bootstrap config for ACME challenge.
3. Creates certificates only when missing.
4. Switches to `deploy/nginx/backend-api.conf` (HTTPS reverse proxy config).
5. Adds renewal hook to reload nginx after certificate renew.

Notes:

- Certificates are managed by certbot and stored under `/etc/letsencrypt/live/<domain>/`.
- If all certificates already exist, the script exits immediately without modifying nginx config.
- If only part of certificates are missing, it creates only missing ones.
- Re-running the script will re-apply `/etc/nginx/conf.d/backend-api.conf` from repository template.

## CI optional automation

If GitHub Actions should run this automatically, set repository secrets:

- `AUTO_CONFIGURE_NGINX=true`
- `CERTBOT_EMAIL=you@example.com`

Then the backend ECS deployment workflow will run HTTPS bootstrap automatically.
