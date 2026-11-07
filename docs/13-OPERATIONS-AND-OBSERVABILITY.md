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
