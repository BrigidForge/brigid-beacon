#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-}"
REPO_ROOT="${REPO_ROOT:-/opt/brigidforge/repo}"
LOCK_FILE="${LOCK_FILE:-/var/lock/brigid-beacon-deploy.lock}"

exec 9>"${LOCK_FILE}"
flock 9

if [[ -z "${BRANCH}" ]]; then
  echo "Usage: $0 main" >&2
  exit 1
fi

if [[ "${BRANCH}" != "main" ]]; then
  echo "Unsupported branch: ${BRANCH} (only main is deployed)" >&2
  exit 1
fi

VAULT_ROOT="/var/www/vault"
VAULT_HEALTH_URL="https://vault.brigidforge.com/"
BEACON_HEALTH_URL="https://beacon.brigidforge.com/"

cd "${REPO_ROOT}"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing deploy: repo is dirty at ${REPO_ROOT}" >&2
  git status --short >&2
  exit 1
fi

git fetch origin
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

REPO_ROOT="${REPO_ROOT}" bash "${REPO_ROOT}/scripts/install-systemd.sh"

VAULT_ROOT="${VAULT_ROOT}" \
VAULT_HEALTH_URL="${VAULT_HEALTH_URL}" \
BEACON_HEALTH_URL="${BEACON_HEALTH_URL}" \
REPO_ROOT="${REPO_ROOT}" \
  bash "${REPO_ROOT}/scripts/deploy-hosted.sh"
