# 63 — Exposición segura de métricas del runtime de tenant jobs

## Objetivo

Exponer métricas agregadas y de baja cardinalidad del runtime `microservices-meta-ecuapp` para scraping Prometheus, sin publicar tenant IDs, actores, job IDs ni payloads.

## Arquitectura

- `TenantJobRuntimeMetrics`: contrato de aplicación para outcomes, snapshots y recuperación.
- `PrometheusTenantJobRuntimeMetrics`: adapter de exposición Prometheus; mantiene counters, histograms y gauges en memoria.
- `PostgresTenantJobRuntimeMetricsReader`: obtiene agregados desde `platform.read_tenant_job_runtime_metrics()`, función SQL `SECURITY DEFINER` con permisos restringidos al rol dispatcher.
- `RabbitMqManagementTenantJobQueueMetricsReader`: obtiene estadísticas agregadas de las colas worker y DLQ mediante RabbitMQ Management HTTP API.
- `TenantJobMetricsHttpServer`: publica exclusivamente `GET /metrics`, con bearer token cuando corresponde, sin CORS, sin cache y con errores genéricos.
- `TenantJobRuntimeProcess`: compone readers, renderer, listener y cierre coordinado de pools.

## Métricas

### Runtime y PostgreSQL

Counters: dispatch outcomes, execution outcomes, publish outcomes, recovery de leases/publicaciones, renovaciones de lease y errores del supervisor.

Histograms: duración de ejecución de handlers y publicación al broker, con buckets fijos.

Gauges PostgreSQL: outbox pending/blocked, leases de dispatch y ejecución activos/vencidos, jobs en dead-letter, edad del dispatch pendiente más antiguo y jobs replayed. La función SQL retorna únicamente agregados globales.

### RabbitMQ

El reader consulta, para worker queue y DLQ:

- `messages_ready`: mensajes listos que todavía no han sido entregados.
- `messages_unacknowledged`: mensajes entregados que aún no han recibido ACK/NACK.
- `consumers`: consumers registrados en la cola.

Los gauges Prometheus correspondientes son:

- `tenant_job_rabbitmq_worker_queue_ready_messages`
- `tenant_job_rabbitmq_worker_queue_unacknowledged_messages`
- `tenant_job_rabbitmq_worker_queue_consumers`
- `tenant_job_rabbitmq_dead_letter_queue_ready_messages`
- `tenant_job_rabbitmq_dead_letter_queue_unacknowledged_messages`
- `tenant_job_rabbitmq_dead_letter_queue_consumers`

`messages_unacknowledged` no equivale a consumer lag ni a edad de mensaje. La suma ready + unacknowledged ofrece una vista más completa de mensajes presentes en la cola, pero no mide por sí sola el retraso temporal del consumidor.

## Identidad y transporte RabbitMQ

La Management API usa una identidad de monitorización separada, con tag `monitoring`, contraseña fuerte y permisos AMQP de recursos vacíos. No comparte las credenciales ni el canal del worker y no puede publicar, consumir ni modificar recursos AMQP.

La URL debe ser HTTPS fuera de loopback, no puede contener credenciales y se restringe a un origen. Las solicitudes son GET, no siguen redirects, no almacenan cache y tienen timeout abortable. El endpoint remoto de métricas debe permanecer en red privada y su secreto debe proceder de Secret Manager; TLS/mTLS y firewall deben configurarse en el despliegue.

## Endpoint Prometheus

- `GET /metrics`: exposición Prometheus.
- Host por defecto: `127.0.0.1`.
- Puerto por defecto: `9464`.
- `TENANT_JOB_METRICS_BEARER_TOKEN`: obligatorio al escuchar fuera de loopback; mínimo 32 bytes UTF-8.
- El listener remoto debe protegerse con TLS/mTLS mediante proxy o service mesh y permitir acceso únicamente al scraper autorizado.

Counters, histograms y snapshots cacheados viven en memoria y se reinician al reiniciar el proceso. Prometheus debe proporcionar retención duradera y alert routing fuera de este proceso.

## Artefactos operativos

- `microservices-meta-ecuapp/observability/prometheus/tenant-job-alerts.yml`
- `microservices-meta-ecuapp/observability/grafana/tenant-job-runtime.dashboard.json`
- `microservices-meta-ecuapp/observability/RUNBOOK.md`
- `microservices-meta-ecuapp/observability/README.md`

Los umbrales son guardrails iniciales, no SLO/SLA aprobados. Dashboard y reglas están versionados, pero no se afirma que estén instalados en una plataforma real.

## Evidencia y estado

- Endpoint HTTP y gauges PostgreSQL: verificaciones Source CI históricas SUCCESS documentadas en el backlog.
- RabbitMQ Management API y la identidad de monitorización: Source CI #466 / run `42436159239` fue creado para el commit `e00ec2d023fd1022e3f9dc1ac32ba7f212f82f8a`; debe verificarse el resultado del HEAD vigente, no asumir que esa ejecución valida cambios posteriores.
- CodeQL #6 / run `42436159237` terminó SUCCESS para el commit `e00ec2d023fd1022e3f9dc1ac32ba7f212f82f8a`; no cubre los cambios posteriores de métricas unacknowledged.
- Los tests unitarios cubren reader Management API, validación de contadores, seguridad de URL/credenciales, timeout, gauges Prometheus y ausencia de etiquetas tenant.

## Pendientes para cerrar observabilidad

1. Obtener Source CI SUCCESS para el HEAD con gauges unacknowledged y sus fixtures.
2. Validar dashboard, reglas y alert routing en Prometheus/Grafana desplegados.
3. Probar scraping remoto con TLS/mTLS, firewall y secretos reales rotados.
4. Definir SLO cuantificados con pruebas de carga y retención.
5. Completar revisión independiente y aceptación operacional.

TASK-003 permanece `in_progress`; esta documentación no representa aceptación ni habilita GO-PRODUCTION.
