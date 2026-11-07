#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env. Run: cp .env.example .env and change every local password." >&2
  exit 2
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

for bin in docker curl jq git; do
  command -v "$bin" >/dev/null || { echo "Required command not found: $bin" >&2; exit 2; }
done
mkdir -p results
REPORT="results/test-evidence.md"
: > "$REPORT"
pass() { printf 'PASS — %s\n' "$1" | tee -a "$REPORT"; }
fail() { printf 'FAIL — %s\n' "$1" | tee -a "$REPORT"; exit 1; }
wait_until() {
  local label="$1"; shift
  for _ in $(seq 1 90); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  fail "timeout waiting for $label"
}

{
  echo "# TASK-039 local lab evidence"
  echo
  echo "- Timestamp (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- Git commit: $(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unavailable)"
  echo "- OS: $(uname -a)"
  echo "- Docker: $(docker --version)"
  echo "- Compose: $(docker compose version)"
  echo "- CPU: $(getconf _NPROCESSORS_ONLN 2>/dev/null || echo unavailable)"
  echo "- Memory: $(awk '/MemTotal/ {print $2 " kB"}' /proc/meminfo 2>/dev/null || echo unavailable)"
  echo "- Disk: $(df -h . | tail -1)"
  echo
} >> "$REPORT"

docker compose config -q
pass "Compose configuration parsed"
docker compose up -d
wait_until "PostgreSQL" docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
wait_until "RabbitMQ" docker compose exec -T rabbitmq rabbitmq-diagnostics -q ping
wait_until "Valkey" docker compose exec -T valkey valkey-cli --no-auth-warning -a "$VALKEY_PASSWORD" ping
wait_until "Keycloak OIDC discovery" curl -fsS http://127.0.0.1:18080/realms/lab/.well-known/openid-configuration
pass "All four services became ready"

docker compose exec -T -e PGPASSWORD="$APP_RUNTIME_PASSWORD" postgres \
  psql -v ON_ERROR_STOP=1 -U app_runtime -d "$POSTGRES_DB" -f /lab-tests/rls-and-inbox.sql \
  | tee -a "$REPORT"
pass "PostgreSQL RLS, missing-context denial, transaction reset and inbox dedupe"

RABBIT_URL="http://127.0.0.1:15679"
RABBIT_AUTH="$RABBITMQ_DEFAULT_USER:$RABBITMQ_DEFAULT_PASS"
rabbit_api() {
  local method="$1" path="$2" body="$3"
  curl -fsS -u "$RABBIT_AUTH" -H 'content-type: application/json' \
    -X "$method" "$RABBIT_URL$path" -d "$body"
}
rabbit_api PUT '/api/exchanges/%2F/lab.events' '{"type":"direct","durable":true,"auto_delete":false,"internal":false,"arguments":{}}' >/dev/null
rabbit_api PUT '/api/exchanges/%2F/lab.dlx' '{"type":"direct","durable":true,"auto_delete":false,"internal":false,"arguments":{}}' >/dev/null
rabbit_api PUT '/api/queues/%2F/lab.events.q' '{"durable":true,"auto_delete":false,"arguments":{"x-dead-letter-exchange":"lab.dlx","x-dead-letter-routing-key":"lab.dead"}}' >/dev/null
rabbit_api PUT '/api/queues/%2F/lab.events.dlq' '{"durable":true,"auto_delete":false,"arguments":{}}' >/dev/null
rabbit_api POST '/api/bindings/%2F/e/lab.events/q/lab.events.q' '{"routing_key":"lab.event","arguments":{}}' >/dev/null
rabbit_api POST '/api/bindings/%2F/e/lab.dlx/q/lab.events.dlq' '{"routing_key":"lab.dead","arguments":{}}' >/dev/null
curl -fsS -u "$RABBIT_AUTH" -X DELETE "$RABBIT_URL/api/queues/%2F/lab.events.q/contents" >/dev/null
curl -fsS -u "$RABBIT_AUTH" -X DELETE "$RABBIT_URL/api/queues/%2F/lab.events.dlq/contents" >/dev/null
PAYLOAD='{"eventId":"synthetic-001","tenantId":"11111111-1111-4111-8111-111111111111","synthetic":true}'
PUBLISH_BODY="$(jq -n --arg payload "$PAYLOAD" '{properties:{delivery_mode:2},routing_key:"lab.event",payload:$payload,payload_encoding:"string"}')"
PUBLISHED="$(rabbit_api POST '/api/exchanges/%2F/lab.events/publish' "$PUBLISH_BODY")"
[[ "$(jq -r '.routed' <<<"$PUBLISHED")" == "true" ]] || fail "RabbitMQ did not route persistent message"
GET_BODY='{"count":1,"ackmode":"reject_requeue_false","encoding":"auto","truncate":50000}'
DELIVERED="$(rabbit_api POST '/api/queues/%2F/lab.events.q/get' "$GET_BODY")"
jq -e --arg p "$PAYLOAD" '.[0].payload == $p' <<<"$DELIVERED" >/dev/null || fail "RabbitMQ queue did not return expected payload"
DEAD="$(rabbit_api POST '/api/queues/%2F/lab.events.dlq/get' '{"count":1,"ackmode":"ack_requeue_false","encoding":"auto","truncate":50000}')"
jq -e --arg p "$PAYLOAD" '.[0].payload == $p' <<<"$DEAD" >/dev/null || fail "RabbitMQ dead-letter queue did not receive rejected message"
pass "RabbitMQ persistent publish, durable queue and dead-letter routing"

docker compose exec -T valkey valkey-cli --no-auth-warning -a "$VALKEY_PASSWORD" SET lab:synthetic smoke EX 60 >/dev/null
VALKEY_VALUE="$(docker compose exec -T valkey valkey-cli --no-auth-warning -a "$VALKEY_PASSWORD" GET lab:synthetic | tr -d '\r')"
[[ "$VALKEY_VALUE" == "smoke" ]] || fail "Valkey SET/GET failed"
pass "Valkey authenticated SET/GET with TTL"

OIDC="http://127.0.0.1:18080/realms/lab"
curl -fsS "$OIDC/.well-known/openid-configuration" | jq -e '.issuer and .jwks_uri and .token_endpoint' >/dev/null
curl -fsS "$OIDC/protocol/openid-connect/certs" | jq -e '.keys | length > 0' >/dev/null
TOKEN_RESPONSE="$(curl -fsS -X POST "$OIDC/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=lab-cli -d username=lab.user \
  --data-urlencode 'password=LabOnly-Password-Change-Me')"
jq -e '.access_token | strings | length > 0' <<<"$TOKEN_RESPONSE" >/dev/null || fail "Keycloak did not issue synthetic token"
pass "Keycloak OIDC discovery, JWKS and synthetic login"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > results/postgres-lab.dump
[[ -s results/postgres-lab.dump ]] || fail "PostgreSQL dump is empty"
docker compose exec -T postgres dropdb --if-exists -U "$POSTGRES_USER" whatsbusiness_lab_restore >/dev/null
docker compose exec -T postgres createdb -U "$POSTGRES_USER" whatsbusiness_lab_restore
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d whatsbusiness_lab_restore --no-owner --no-privileges < results/postgres-lab.dump
RESTORED="$(docker compose exec -T postgres psql -At -U "$POSTGRES_USER" -d whatsbusiness_lab_restore -c 'SELECT count(*) FROM app.contacts')"
[[ "$RESTORED" == "2" ]] || fail "Restore verification expected 2 synthetic contacts, got $RESTORED"
pass "PostgreSQL logical dump restored into a fresh database; 2 seed contacts verified"

{
  echo
  echo "## Service images"
  docker compose images
  for image_id in $(docker compose images -q | sort -u); do docker image inspect --format '{{.RepoTags}} {{.RepoDigests}}' "$image_id"; done
  echo
  echo "## Runtime snapshot"
  docker stats --no-stream
  echo
  echo "## Disk after run"
  df -h .
  echo
  echo "## Explicit limitations"
  echo "- This is a local lab, not a production VPS benchmark."
  echo "- RLS checks transaction-local context on one psql session; it does not prove application pool behavior."
  echo "- RabbitMQ test exercises management API publish/get/DLX; no application outbox publisher, consumer idempotency or crash/replay is implemented."
  echo "- Webhook table tests uniqueness and durable database storage only; no HTTP signature/ACK endpoint exists."
  echo "- Keycloak smoke does not validate the future application's issuer/audience/roles/membership authorization."
  echo "- Backup is an unencrypted local logical dump restored into another database in the same container; no clean-host restore or RPO/RTO claim."
  echo "- SP-01 and SP-08 remain blocked until a disposable workspace and equivalent workload prototypes exist."
  echo "- SP-09 ACL/TLS/failover and SP-10 full dependency/SBOM/CVE checks are not covered by this smoke run."
} >> "$REPORT"
pass "Evidence report written to $REPORT"
echo "Lab smoke checks completed. Review $REPORT; this does not approve G0."
