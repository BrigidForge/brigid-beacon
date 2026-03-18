#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/brigidforge/repo}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

install -m 0644 "${REPO_ROOT}/ops/systemd/beacon-api.service" "${SYSTEMD_DIR}/beacon-api.service"
install -m 0644 "${REPO_ROOT}/ops/systemd/beacon-worker.service" "${SYSTEMD_DIR}/beacon-worker.service"

systemctl daemon-reload
systemctl enable beacon-api.service beacon-worker.service

echo "Installed canonical Beacon systemd units from ${REPO_ROOT}/ops/systemd."
