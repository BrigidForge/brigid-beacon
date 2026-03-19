#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-}"
REPO_ROOT="${REPO_ROOT:-/opt/brigidforge/repo}"
LOCK_FILE="${LOCK_FILE:-/var/lock/brigid-beacon-deploy.lock}"

exec 9>"${LOCK_FILE}"
flock 9

if [[ -z "${BRANCH}" ]]; then
  echo "Usage: $0 <dev|main>" >&2
  exit 1
fi

case "${BRANCH}" in
  dev)
    BEACON_ROOT="/var/www/staging-beacon"
    PANEL_ROOT="/var/www/staging-panel"
    ;;
  main)
    BEACON_ROOT="/var/www/beacon"
    PANEL_ROOT="/var/www/panel"
    ;;
  *)
    echo "Unsupported branch: ${BRANCH}" >&2
    exit 1
    ;;
esac

cd "${REPO_ROOT}"
git fetch origin
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

REPO_ROOT="${REPO_ROOT}" bash "${REPO_ROOT}/scripts/install-systemd.sh"
BEACON_ROOT="${BEACON_ROOT}" PANEL_ROOT="${PANEL_ROOT}" REPO_ROOT="${REPO_ROOT}" bash "${REPO_ROOT}/scripts/deploy-hosted.sh"
