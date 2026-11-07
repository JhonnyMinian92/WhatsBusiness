# 13 — Operaciones y observabilidad

## 1. Telemetría
- Logs estructurados con tenant pseudonym, product, asset pseudonym, operation, correlation_id, request_id y result.
- Metrics: request rate, latency, error rate, 429, queue lag, webhook age, DLQ depth, token expiry, delivery states, campaign spend drift.
- Traces: cliente → gateway → domain → adapter → Meta; webhook → inbox → bus → consumer → aggregate.
- Audit trail separado de logs operacionales.

Nunca usar token, app secret, teléfono, email, mensaje completo o lead PII como label de métrica.

## 2. SLO iniciales propuestos (pendientes de aprobación)
| Indicador | Objetivo inicial | Nota |
|---|---:|---|
| API interna disponibilidad | 99.9% mensual | excluir indisponibilidad Meta claramente etiquetada |
| Webhook durable ACK | p95 < 2 s | confirmar límites del contrato Meta |
| Enqueue interno | p95 < 500 ms | sin esperar procesamiento externo |
| Evento webhook procesado | p95 < 60 s | según cola y tipo |
| Pérdida de eventos internos | 0 confirmada | inbox/outbox + backup |
| RPO/RTO | por definir | requiere negocio y plataforma |

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
