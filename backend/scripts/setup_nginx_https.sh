#!/usr/bin/env bash
set -euo pipefail

# One-time HTTPS bootstrap for backend API domains on ECS.
# Usage:
#   CERTBOT_EMAIL=ops@example.com ./scripts/setup_nginx_https.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FINAL_CONF_SRC="${BACKEND_DIR}/deploy/nginx/backend-api.conf"
TARGET_CONF="/etc/nginx/conf.d/backend-api.conf"
WEBROOT_DIR="/var/www/certbot"

DOMAINS=(
  "api.admin.sven-family.asia"
  "api.club.sven-family.asia"
  "api.stats.sven-family.asia"
)

cert_files_present() {
  local domain="$1"
  [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" && -f "/etc/letsencrypt/live/${domain}/privkey.pem" ]]
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root."
  echo "Try: sudo -E CERTBOT_EMAIL=you@example.com $0"
  exit 1
fi

if [[ -z "${CERTBOT_EMAIL:-}" ]]; then
  echo "Missing CERTBOT_EMAIL."
  exit 1
fi

if [[ ! -f "${FINAL_CONF_SRC}" ]]; then
  echo "Missing nginx template: ${FINAL_CONF_SRC}"
  exit 1
fi

install_certbot() {
  if command -v certbot >/dev/null 2>&1; then
    return
  fi

  install_certbot_via_pip() {
    if ! command -v python3 >/dev/null 2>&1; then
      return 1
    fi

    if ! command -v pip3 >/dev/null 2>&1; then
      if command -v apt-get >/dev/null 2>&1; then
        apt-get update
        apt-get install -y python3-pip
      elif command -v dnf >/dev/null 2>&1; then
        dnf install -y python3-pip
      elif command -v yum >/dev/null 2>&1; then
        yum install -y python3-pip
      else
        return 1
      fi
    fi

    python3 -m pip install --upgrade pip
    python3 -m pip install certbot
    hash -r

    if ! command -v certbot >/dev/null 2>&1; then
      for candidate in /usr/local/bin/certbot /root/.local/bin/certbot; do
        if [[ -x "${candidate}" ]]; then
          ln -sf "${candidate}" /usr/bin/certbot
          break
        fi
      done
    fi

    command -v certbot >/dev/null 2>&1
  }

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y certbot || apt-get install -y python3-certbot || true
    if command -v certbot >/dev/null 2>&1; then
      return
    fi
    if install_certbot_via_pip; then
      return
    fi
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y certbot || yum install -y python3-certbot || true
    if command -v certbot >/dev/null 2>&1; then
      return
    fi
    if install_certbot_via_pip; then
      return
    fi
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y certbot || dnf install -y python3-certbot || true
    if command -v certbot >/dev/null 2>&1; then
      return
    fi
    if install_certbot_via_pip; then
      return
    fi
  fi

  echo "Unable to install certbot automatically on this OS."
  exit 1
}

install_nginx_if_needed() {
  if command -v nginx >/dev/null 2>&1; then
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y nginx
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y nginx
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y nginx
    return
  fi

  echo "Unable to install nginx automatically on this OS."
  exit 1
}

install_nginx_if_needed
install_certbot
mkdir -p "${WEBROOT_DIR}"

issue_or_renew_cert() {
  local domain="$1"
  certbot certonly \
    --webroot \
    -w "${WEBROOT_DIR}" \
    --email "${CERTBOT_EMAIL}" \
    --agree-tos \
    --non-interactive \
    --no-eff-email \
    --keep-until-expiring \
    --cert-name "${domain}" \
    -d "${domain}"
}

assert_cert_files_exist() {
  local domain="$1"
  local cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
  local key_path="/etc/letsencrypt/live/${domain}/privkey.pem"
  if [[ ! -f "${cert_path}" || ! -f "${key_path}" ]]; then
    echo "Missing certificate files for ${domain}."
    echo "Expected: ${cert_path} and ${key_path}"
    exit 1
  fi
}

all_certs_exist=true
for domain in "${DOMAINS[@]}"; do
  if ! cert_files_present "${domain}"; then
    all_certs_exist=false
    break
  fi
done

if [[ "${all_certs_exist}" == "true" ]]; then
  echo "All certificates already exist. Skip HTTPS bootstrap."
  exit 0
fi

cat > "${TARGET_CONF}" <<'EOF'
server {
  listen 80;
  server_name api.admin.sven-family.asia api.club.sven-family.asia api.stats.sven-family.asia;

  location /.well-known/acme-challenge/ {
    root /var/www/certbot;
  }

  location / {
    return 200 'bootstrap-ok';
    add_header Content-Type text/plain;
  }
}
EOF

nginx -t
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl restart nginx
else
  service nginx restart
fi

for domain in "${DOMAINS[@]}"; do
  if cert_files_present "${domain}"; then
    echo "Certificate already exists for ${domain}, skip issuing."
  else
    issue_or_renew_cert "${domain}"
  fi
  assert_cert_files_exist "${domain}"
done

cp "${FINAL_CONF_SRC}" "${TARGET_CONF}"
nginx -t
if command -v systemctl >/dev/null 2>&1; then
  systemctl reload nginx
else
  service nginx reload
fi

mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if command -v systemctl >/dev/null 2>&1; then
  systemctl reload nginx
else
  service nginx reload
fi
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo "Nginx HTTPS bootstrap completed."
