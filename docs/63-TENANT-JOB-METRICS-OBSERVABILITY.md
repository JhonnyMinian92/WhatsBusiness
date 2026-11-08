# 63 — Exposición segura de métricas del runtime de tenant jobs

## Objetivo

Exponer métricas agregadas y de baja cardinalidad del runtime microservices-meta-ecuapp sin publicar tenant IDs, actores, job IDs ni payloads. PostgreSQL y RabbitMQ son fuentes independientes; sus snapshots parciales no borran métricas pertenecientes a otras fuentes.

## Arquitectura implementada en código

- TenantJobRuntimeMetrics: contrato de métricas y snapshots parciales.
- PrometheusTenantJobRuntimeMetrics: adapter Prometheus con counters, histograms y gauges en memoria.
- PostgresTenantJobRuntimeMetricsReader: agregados desde platform.read_tenant_job_runtime_metrics(), función SQL SECURITY DEFINER.
- RabbitMqManagementTenantJobQueueMetricsReader: consulta GET /api/queues/{vhost}/{name} para worker y DLQ.
- CompositeTenantJobRuntimeMetricsReader: combina readers y rechaza ownership duplicado de un campo.
- TenantJobMetricsHttpServer: expone exclusivamente GET /metrics.
- TenantJobRuntimeProcess y RabbitMqPostgresTenantJobRuntimeSessionFactory: componen los readers durante el bootstrap.

Los readers no consultan ni exportan cuerpos de mensajes, nombres de tenants, IDs de negocio o payloads.

## Métricas

### Runtime y PostgreSQL

Counters: dispatch outcomes, execution outcomes, publish outcomes, recuperación de leases/publicaciones, renovaciones de lease y errores del supervisor.

Histograms: duración de ejecución de handlers y publicación al broker, con buckets fijos.

Gauges PostgreSQL: outbox pending/blocked, leases de dispatch y ejecución activos/vencidos, jobs en dead-letter, edad del dispatch pendiente más antiguo y jobs replayed. La función SQL retorna únicamente agregados globales.

### RabbitMQ

El reader consulta las colas worker y DLQ por separado con credenciales de monitorización dedicadas:

- messages_ready: mensajes listos para entrega.
- messages_unacknowledged: mensajes entregados que todavía esperan ACK/NACK.
- consumers: consumidores registrados en la cola.

Gauges Prometheus:
- tenant_job_rabbitmq_worker_queue_ready_messages
- tenant_job_rabbitmq_worker_queue_unacknowledged_messages
- tenant_job_rabbitmq_worker_queue_consumers
- tenant_job_rabbitmq_dead_letter_queue_ready_messages
- tenant_job_rabbitmq_dead_letter_queue_unacknowledged_messages
- tenant_job_rabbitmq_dead_letter_queue_consumers

messages_unacknowledged no equivale a consumer lag ni a edad de mensaje. La suma ready + unacknowledged muestra mensajes presentes en cola, pero no mide por sí sola el retraso temporal del consumidor.

## Seguridad y resiliencia de la consulta

- Solo método HTTP GET; no se consultan cuerpos ni contenidos de colas.
- Basic authentication con usuario dedicado y tag monitoring; los permisos AMQP de recursos deben permanecer vacíos.
- HTTPS obligatorio fuera de loopback; URL sin credenciales, query, fragment ni path personalizado.
- Redirects prohibidos, cache deshabilitado y timeout abortable de 1 segundo por defecto (rango 100–10 000 ms).
- Solo se aceptan contadores enteros, seguros y no negativos.
- Las fuentes se leen con `Promise.allSettled`: una caída de Management API no bloquea el refresco de PostgreSQL, ni viceversa.
- Cada fallo usa un código fijo por fuente, incrementa el contador de errores y se reporta sin detalles sensibles.
- El snapshot de una fuente fallida se omite; el último valor válido permanece y nunca se reemplaza por cero inventado.
- Si fallan ambas fuentes, el supervisor sigue operando y conserva los últimos gauges observados.

La Management API debe permanecer en red privada. El usuario de monitorización no comparte credenciales AMQP del worker ni puede publicar, consumir o cambiar la topología.

## Endpoint Prometheus

- GET /metrics.
- Host por defecto: 127.0.0.1.
- Puerto por defecto: 9464.
- TENANT_JOB_METRICS_BEARER_TOKEN: obligatorio al escuchar fuera de loopback; mínimo 32 bytes UTF-8.
- Listener remoto protegido por TLS/mTLS en proxy o service mesh y firewall privado.

Counters, histograms y gauges cacheados viven en memoria y se reinician al reiniciar el proceso. Prometheus proporciona retención duradera y alert routing.

## Artefactos operativos

- microservices-meta-ecuapp/observability/prometheus/tenant-job-alerts.yml
- microservices-meta-ecuapp/observability/grafana/tenant-job-runtime.dashboard.json
- microservices-meta-ecuapp/observability/RUNBOOK.md
- microservices-meta-ecuapp/observability/README.md

Los umbrales son guardrails iniciales, no SLO/SLA aprobados. Dashboards y reglas están versionados; aún no se afirma que estén instalados en infraestructura real.

## Validación y estado

La implementación del reader RabbitMQ, la composición de fuentes, gauges y pruebas unitarias queda incluida en este commit. La validación completa del HEAD debe confirmarse con Source CI. Source CI #508 del commit anterior terminó cancelado; no se usa como evidencia de éxito.

Pendientes de aceptación operacional:
1. Source CI SUCCESS para el HEAD con build, typecheck, unitarias e integraciones PostgreSQL/RabbitMQ.
2. Despliegue y verificación de dashboards, reglas y alert routing en Prometheus/Grafana.
3. Scraping real con TLS/mTLS, firewall y credenciales de monitorización rotadas.
4. Definición de SLO, RPO/RTO con pruebas de carga y restore.
5. Revisión independiente y aceptación del propietario.

Los gauges messages_unacknowledged no se presentan como consumer lag. Para consumer lag/age autoritativo se necesita instrumentación de edad del evento o timestamps de entrega/proceso y una definición operativa separada.

TASK-003 permanece in_progress hasta que se adjunte evidencia CI y operacional suficiente. Este documento no habilita GO-PRODUCTION.
