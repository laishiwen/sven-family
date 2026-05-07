#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${BACKEND_DIR}/docker-compose.prod.yml"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "docker compose is not installed on server."
  exit 1
fi

COMPOSE_ARGS=(-f "${COMPOSE_FILE}")

SERVICES=(community-backend community-admin admin-backend crawler stats-service)

print_failure_diagnostics() {
  echo "Deployment failed. Collecting diagnostics..."
  "${COMPOSE_CMD[@]}" "${COMPOSE_ARGS[@]}" ps || true
  for svc in "${SERVICES[@]}"; do
    echo "----- logs: ${svc} -----"
    "${COMPOSE_CMD[@]}" "${COMPOSE_ARGS[@]}" logs --tail=120 "${svc}" || true
  done
  for svc in "${SERVICES[@]}"; do
    cid="$("${COMPOSE_CMD[@]}" "${COMPOSE_ARGS[@]}" ps -q "${svc}" 2>/dev/null || true)"
    if [[ -n "${cid}" ]]; then
      echo "----- health: ${svc} (${cid}) -----"
      docker inspect --format '{{json .State.Health}}' "${cid}" || true
    fi
  done
}

trap 'print_failure_diagnostics' ERR

cd "${BACKEND_DIR}"

docker image prune -f

"${COMPOSE_CMD[@]}" "${COMPOSE_ARGS[@]}" config >/dev/null
"${COMPOSE_CMD[@]}" "${COMPOSE_ARGS[@]}" up -d --build --remove-orphans

docker image prune -f
"${COMPOSE_CMD[@]}" "${COMPOSE_ARGS[@]}" ps

wait_for_health_url() {
  local url="$1"
  local retries="${2:-40}"
  local sleep_sec="${3:-3}"
  local i
  for ((i=1; i<=retries; i++)); do
    if curl -fsS "${url}" >/dev/null; then
      echo "Health check passed: ${url}"
      return 0
    fi
    echo "Waiting for health endpoint (${i}/${retries}): ${url}"
    sleep "${sleep_sec}"
  done
  echo "Health check failed after ${retries} retries: ${url}"
  return 1
}

for health_url in \
  "http://127.0.0.1:50051/health" \
  "http://127.0.0.1:8001/health" \
  "http://127.0.0.1:8002/health"; do
  if ! wait_for_health_url "${health_url}" 40 3; then
    echo "Health check failed: ${health_url}"
    "${COMPOSE_CMD[@]}" "${COMPOSE_ARGS[@]}" logs --tail=100
    exit 1
  fi
done

trap - ERR

echo "Backend production deployment finished."
