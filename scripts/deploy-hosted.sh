#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/brigidforge/repo}"
BEACON_ROOT="${BEACON_ROOT:-/var/www/beacon}"
PANEL_ROOT="${PANEL_ROOT:-/var/www/panel}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/health}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://beacon.brigidforge.com/}"
INSTALL_DEPS="${INSTALL_DEPS:-0}"
RESTART_SERVICES="${RESTART_SERVICES:-1}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-1}"
DEPLOY_ENV="${DEPLOY_ENV:-}"
BUILD_NODE_OPTIONS="${BUILD_NODE_OPTIONS:---max-old-space-size=4096}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if [[ ! -d "${REPO_ROOT}" ]]; then
  echo "Repo root not found: ${REPO_ROOT}" >&2
  exit 1
fi

cd "${REPO_ROOT}"

if [[ -z "${DEPLOY_ENV}" ]]; then
  if [[ "${BEACON_ROOT}" == *staging* || "${PANEL_ROOT}" == *staging* ]]; then
    DEPLOY_ENV="staging"
  else
    DEPLOY_ENV="production"
  fi
fi

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempt=1

  until curl -fsS "${url}" >/dev/null; do
    if (( attempt >= HEALTH_RETRIES )); then
      echo "${label} did not become healthy after ${HEALTH_RETRIES} attempts." >&2
      return 1
    fi
    sleep "${HEALTH_SLEEP_SECONDS}"
    attempt=$((attempt + 1))
  done
}

if [[ "${INSTALL_DEPS}" == "1" ]]; then
  npm install
fi

set -a
if [[ -f "${REPO_ROOT}/apps/operator-panel/.env.${DEPLOY_ENV}" ]]; then
  . "${REPO_ROOT}/apps/operator-panel/.env.${DEPLOY_ENV}"
fi
set +a
NODE_OPTIONS="${BUILD_NODE_OPTIONS}" npm run build -w @brigid/beacon-operator-panel

set -a
if [[ -f "${REPO_ROOT}/apps/public-panel/.env.${DEPLOY_ENV}" ]]; then
  . "${REPO_ROOT}/apps/public-panel/.env.${DEPLOY_ENV}"
fi
set +a
NODE_OPTIONS="${BUILD_NODE_OPTIONS}" npm run build -w @brigid/beacon-public-panel

mkdir -p "${BEACON_ROOT}" "${PANEL_ROOT}"
find "${BEACON_ROOT}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
find "${PANEL_ROOT}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

cp -R "${REPO_ROOT}/apps/operator-panel/dist/." "${BEACON_ROOT}/"
cp -R "${REPO_ROOT}/apps/public-panel/dist/." "${PANEL_ROOT}/"

if [[ -d "${REPO_ROOT}/apps/operator-panel/media" ]]; then
  mkdir -p "${BEACON_ROOT}/media"
  cp -R "${REPO_ROOT}/apps/operator-panel/media/." "${BEACON_ROOT}/media/"
fi

if [[ "${RESTART_SERVICES}" == "1" ]]; then
  systemctl restart beacon-api.service beacon-worker.service
fi

wait_for_url "${API_HEALTH_URL}" "Beacon API"
wait_for_url "${PUBLIC_HEALTH_URL}" "Beacon operator host"

echo "Beacon operator panel published to ${BEACON_ROOT}"
echo "Beacon public panel published to ${PANEL_ROOT}"
