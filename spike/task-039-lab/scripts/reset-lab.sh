#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ "\${CONFIRM_DELETE_LAB_VOLUMES:-}" != "yes" ]]; then
  echo "This deletes the lab PostgreSQL and Valkey volumes. Re-run with CONFIRM_DELETE_LAB_VOLUMES=yes." >&2
  exit 2
fi
docker compose down --volumes --remove-orphans
