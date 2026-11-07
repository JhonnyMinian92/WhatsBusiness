#!/bin/sh
set -eu
: "\${APP_RUNTIME_PASSWORD:?APP_RUNTIME_PASSWORD is required}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_runtime_password="$APP_RUNTIME_PASSWORD" \
  --file=/lab-schema/lab-schema.sql
