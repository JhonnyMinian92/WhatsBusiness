# 13 — Operaciones y observabilidad

## 1. Telemetría
- Logs estructurados con tenant pseudonym, product, asset pseudonym, operation, correlation_id, request_id y result.
- Metrics: request rate, latency, error rate, 429, queue lag, webhook age, DLQ depth, token expiry, delivery states, campaign spend drift.
- Traces: cliente → gateway → domain → adapter → Meta; webhook → inbox → bus → consumer → aggregate.
- Audit trail separado de logs operacionales.

Nunca usar token, app secret, teléfono, email, mensaje completo o lead PII como label de métrica.

## 2. SLO iniciales candidatos de planificación (no SLA; medir y validar en sección 7)
| Indicador | Objetivo inicial | Nota |
|---|---:|---|
| API interna disponibilidad | 99.9% mensual | excluir indisponibilidad Meta claramente etiquetada |
| Webhook durable ACK | p95 < 2 s | confirmar límites del contrato Meta |
| Enqueue interno | p95 < 500 ms | sin esperar procesamiento externo |
| Evento webhook procesado | p95 < 60 s | según cola y tipo |
| Pérdida de eventos internos | 0 confirmada | inbox/outbox + backup |
| RPO/RTO | RPO <= 15 min; RTO <= 4 h (candidato) | objetivos de planificación; validar con backup/restore drills, HA y coste |

Estos valores son hipótesis de planificación, no SLA comprometidos.

## 3. Alertas
- Token expirando/revocado.
- Permisos o asset grant cambiaron.
- Aumento 401/403/429/5xx.
- Webhook signature failures.
- Inbox age / queue lag / DLQ.
- Delivery failure y template quality downgrade.
- Gasto acelerado o near budget cap.
- CAPI event drop/dedupe anomaly.
- Rate card vencido o no disponible.
- Contract drift/version deprecation.

## 4. Runbooks mínimos
1. Meta API outage / degraded.
2. Token revoked/expired.
3. Webhook backlog/replay.
4. DLQ poison message.
5. Unexpected spend / kill campaign.
6. Tenant isolation incident.
7. Secret compromise / rotate app secret.
8. Data deletion request.
9. API version sunset.
10. Rate limit storm.

## 5. Recuperación
- Reintentos solo para errores transitorios y operaciones seguras.
- Reconciliar estado externo antes de repetir POST ambiguo.
- DLQ con replay por lote y aprobación.
- Backfill paginado con checkpoints y rate control.
- Circuit breaker por producto y tenant.
- Backups cifrados y restore drills.
- Degradación explícita cuando Meta no está disponible; no simular éxito.

## 6. Soporte
Cada incidente tiene incident commander, severidad, timeline UTC, impacto por tenant, evidencia redactada, mitigación, comunicación y postmortem sin culpas con acciones verificables.


## 7. SLO candidate baseline adopted for planning (not SLA, not measured)
| SLI | Candidate objective | Measurement / condition |
|---|---:|---|
| Core API availability | 99.9% monthly | Successful eligible requests / total eligible requests; publish numerator, denominator, window and exclusions |
| Webhook durable acceptance | p95 < 2 s | ACK after durable persistence, not after downstream processing; validate per Meta contract |
| Internal enqueue | p95 < 500 ms | API request to durable outbox/queue acceptance; measure separately from external delivery |
| Webhook-to-domain processing | p95 < 60 s | By event class and traffic profile; queue age is an early warning |
| Internal confirmed event loss | 0 | Distinguish data loss from provider not delivering or duplicate events |
| RPO | <= 15 minutes | Planning target only; prove with backup/WAL/object recovery drills |
| RTO | <= 4 hours | Planning target only; measure from declared incident to validated service recovery |

These are planning targets delegated by the owner, not historical results, contracted SLA or a promise of current VPS capacity. A single-node VPS cannot substantiate a 99.9% HA claim. 99.9% corresponds to about 43.2 minutes of downtime in a 30-day month, before considering the exact measurement policy. SLOs must be reviewed against the service cost and user experience before commercial commitments.

## 8. Four golden signals and latency distributions
- Latency: report p50, p95, p99 and maximum for critical paths, separated by operation/provider/tenant tier; never rely on averages alone.
- Traffic: request rate, webhook event rate, message throughput, active tenants, concurrency and queue ingress.
- Errors: HTTP/provider error classes, auth/policy denies, retries, DLQ, delivery failures and reconciliation drift.
- Saturation: CPU, memory, DB connections/locks/IO, storage, broker queue depth/age, worker utilization, rate-limit consumption and object store latency.
- External Meta dependency has separate provider SLI and end-to-end customer SLI so an upstream outage is visible rather than hidden.
- No RPS, tenant count, messages/day or VPS specification is accepted until TASK-060 produces a reproducible benchmark.

## 9. Production topology guardrail
A single VPS/Compose topology is suitable for development or explicitly accepted pilot only. Production availability targets require redundancy across failure domains for ingress/app, PostgreSQL, broker and storage, plus monitoring and backups outside the primary host. Select Compose/k3s/managed equivalents only after TASK-039/TASK-060 resource and operational measurements.


## 10. Campaign and AI operation metrics
### Campaign Intelligence
- Snapshot freshness by account/campaign/adset/ad; last successful sync; async insights job age; API version/sunset; quota usage and 429 rate.
- Delivery state distribution (Learning, Learning Limited, Active, Paused, Rejected/Restricted) where supported.
- Spend pacing versus account/campaign/adset caps; budget change count and delta in rolling 24h; number of blocked cap violations.
- Creative diversity by concept/format/hook/offer and similarity clusters; creative fatigue/limited recommendation counts.
- Experiment sample progress, primary metric, stop rules, confidence/uncertainty, test budget and control contamination/overlap.
- Campaign outcomes: qualified lead %, opportunity %, sales, net revenue, contribution margin, refunds and response speed.
- CAPI signal quality: event match diagnostics where exposed, dropped/duplicate/late events, event freshness, event source and consent denies.
### Agent gateway
- tool calls by provider/action/result; approval latency; denied/blocked calls; replay attempts; cost per recommendation/action; prompt injection and safety incidents.
- conversation owner/lease state and double-response prevention.
### Alerts
- budget cap breach attempt; unexpected spend velocity; loss of account permission/tier; API version sunset; creative rejected; high opt-out/negative signal; CRM/CAPI lag; insights stale; experiment overspend; Meta agent and WhatsBusiness reply collision.

## 11. Cache y coordinación
Valkey 9.1.x es la baseline recomendada para cache, rate limits y locks efímeros; PostgreSQL sigue siendo la fuente de verdad y RabbitMQ el broker durable. Se mantienen TTL bounded, tenant namespace, invalidación de grants, alertas de memoria/eviction y prohibición de cachear secretos/PII. La licencia y compatibilidad se validan en TASK-039 SP-09; ver docs/51 y ADR-025.


## 12. Backup cifrado y restore reproducible en CI — 2026-11-09

El workflow `source-validation.yml` incorpora `scripts/verify-postgres-backup-restore.mjs`. El procedimiento crea un custom dump de PostgreSQL 18, lo cifra en streaming con AES-256-GCM (clave aleatoria efímera en memoria), restaura en una base nueva y compara el catálogo: versiones de migraciones, relaciones, políticas RLS, constraints, flags RLS/force-RLS y privilegios críticos de `whatsbusiness_app`.

El script registra tamaño del backup y tiempo de restauración, limpia los archivos temporales y elimina la base restaurada al finalizar. La suite falla ante dump vacío, migración ausente, privilegio INSERT inesperado, función de ingesta faltante o divergencia del catálogo.

**Límite:** el key es efímero y existe solo para probar cifrado/descifrado del pipeline; no sustituye KMS/Secret Manager, rotación, custodia de claves, backups externos, WAL/PITR, restore fuera de la misma máquina ni medición de RPO/RTO de producción. Esta prueba de CI es un smoke restore determinista, no la aceptación completa del gate G1 ni del Architecture Spike TASK-039.


## 13. Evidencia ejecutada de backup cifrado y restore smoke en CI — 2026-11-09

El Source CI [42597892008](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42597892008), sobre HEAD `f6660440771e3b9212f1fede4d9025ee6e68181b`, ejecutó exitosamente `scripts/verify-postgres-backup-restore.mjs`.

El paso:
1. Lee el catálogo PostgreSQL ya migrado.
2. Ejecuta `pg_dump --format=custom` dentro del servicio PostgreSQL 18.
3. Cifra el stream con AES-256-GCM usando clave efímera de 256 bits, nonce de 96 bits y AAD ligada al nombre de base.
4. Descifra y restaura con `pg_restore --exit-on-error` en una base limpia.
5. Compara versiones de migración, relaciones, políticas RLS, flags FORCE RLS, constraints (incluye comparación canónica de conjunciones CHECK), función del ledger y ausencia del privilegio INSERT directo del runtime.
6. Elimina DB y artefactos temporales y borra la clave efímera en memoria.

**Resultado: PASS en CI.** No se versiona ni persiste la clave. Esto verifica el procedimiento criptográfico en un runner efímero y la restauración del esquema/controles. No incluye datos productivos/sintéticos de tenant, WAL/PITR, copias fuera del host, KMS/Secret Manager, rotación/custodia ni una medición RPO/RTO. No declarar G1 ni TASK-039 aceptados por este smoke test aislado.
