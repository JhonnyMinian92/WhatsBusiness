# 63 — Exposición segura de métricas del runtime de tenant jobs

**Rama:** `environment/local`  
**Estado del código:** implementado y verificado por Source CI #568 en el commit `aeac5155a316592d31e557ab24e092134bf17f8f`. CodeQL #103 también terminó SUCCESS.  
**Estado operacional:** pendiente despliegue, revisión de SLO/alertas, capacidad/DR y aceptación del propietario. TASK-003 continúa `in_progress`; GO-PRODUCTION permanece NO-GO.

## Objetivo

Exponer métricas útiles de jobs y RabbitMQ sin filtrar identificadores de tenant, actor, job ni payload, sin leer mensajes y sin ampliar los permisos del worker o de la API.

## Arquitectura implementada

- `PrometheusTenantJobRuntimeMetrics` registra counters, histograms y gauges con nombres/labels allowlisted.
- `TenantJobMetricsHttpServer` expone `GET /metrics`; por defecto escucha en loopback y exige bearer token fuerte si se configura fuera de loopback.
- `PostgresTenantJobRuntimeMetricsReader` obtiene agregados por una función acotada y un pool de una sola conexión.
- `RabbitMqPrometheusTenantJobQueueMetricsReader` consulta exclusivamente las métricas detalladas de las dos colas configuradas. No usa Management HTTP API, AMQP `checkQueue`, `get`, consumo ni permisos AMQP `read`.

## Métricas

### Runtime y PostgreSQL

Incluye counters/histograms de ejecución y recuperación, más gauges agregados para dispatch pending/blocked, leases activos/expirados, jobs dead-letter, edad del pending más antiguo y replayed jobs. El reader PostgreSQL valida enteros seguros y valores temporales no negativos; los errores de consulta no bloquean recovery ni dispatch.

### RabbitMQ

El adaptador consulta `GET /metrics/detailed` de RabbitMQ Prometheus con dos familias exactas:

- `queue_coarse_metrics`: `rabbitmq_detailed_queue_messages_ready` y `rabbitmq_detailed_queue_messages_unacked`.
- `queue_consumer_count`: `rabbitmq_detailed_queue_consumers`.

La petición filtra por vhost y por una expresión regular anclada que incluye solo los nombres de worker queue y DLQ configurados. El parser acepta únicamente muestras de esas familias, requiere labels `vhost` y `queue`, rechaza duplicados y valida contadores enteros, seguros y no negativos.

Gauges Prometheus publicados por el runtime:

- `tenant_job_rabbitmq_worker_queue_ready_messages`
- `tenant_job_rabbitmq_worker_queue_unacknowledged_messages`
- `tenant_job_rabbitmq_worker_queue_consumers`
- `tenant_job_rabbitmq_dead_letter_queue_ready_messages`
- `tenant_job_rabbitmq_dead_letter_queue_unacknowledged_messages`
- `tenant_job_rabbitmq_dead_letter_queue_consumers`

`messages_unacknowledged` son deliveries pendientes de ACK/NACK; no equivalen a consumer lag ni a edad de mensaje. Para medir edad/lag hace falta una fuente temporal autoritativa distinta.

## Seguridad y resiliencia

- Configuración vigente: `RABBITMQ_PROMETHEUS_URL`; credenciales HTTP Basic opcionales `RABBITMQ_PROMETHEUS_USERNAME` y `RABBITMQ_PROMETHEUS_PASSWORD`, configuradas siempre como pareja.
- El endpoint remoto exige HTTPS; HTTP solo se permite en loopback. URL sin credenciales embebidas, path personalizado, query ni fragment.
- El plugin `rabbitmq_prometheus` debe estar habilitado y el puerto 15692 debe permanecer en red privada/firewall de monitorización.
- HTTP GET únicamente; no se consultan cuerpos de mensajes ni payloads. Redirects rechazados, `cache: no-store`, timeout abortable y límite de respuesta de 256 KiB por defecto (máximo configurable 2 MiB).
- El uso de Basic auth depende de la configuración del exporter; las credenciales deben provenir del Secret Manager del despliegue. No son credenciales AMQP y no se comparten con dispatcher/worker.
- No se crea un usuario `monitoring` con permisos de recursos RabbitMQ para leer cada cola. Esto evita conceder el permiso AMQP `read`, que permitiría consumir mensajes.
- Las estadísticas por cola se publican en intervalos del broker (5 s por defecto). El adaptador devuelve un error de snapshot incompleto si aún no existe alguna muestra. La integración CI reintenta exclusivamente ese estado por un máximo de 20 s; errores HTTP, de autenticación, parser, límite o valores inválidos siguen fallando inmediatamente.
- `CompositeTenantJobRuntimeMetricsReader` mantiene el último gauge válido cuando falla una fuente y registra el fallo sin bloquear la otra.

## Endpoint Prometheus del runtime

`GET /metrics` es el endpoint del proceso de jobs (por defecto `127.0.0.1:9464`). Un binding remoto requiere bearer token de al menos 32 bytes, TLS/mTLS en el proxy o service mesh y firewall privado. No confundirlo con el endpoint de origen RabbitMQ `/metrics/detailed` en el puerto Prometheus del broker.

## Artefactos operativos

- `microservices-meta-ecuapp/observability/prometheus/tenant-job-alerts.yml`
- `microservices-meta-ecuapp/observability/grafana/tenant-job-runtime.dashboard.json`
- `microservices-meta-ecuapp/observability/RUNBOOK.md`
- `microservices-meta-ecuapp/observability/README.md`

Los umbrales son guardrails iniciales, no SLO/SLA aprobados. Dashboards y reglas están versionados; aún no se afirma que estén instalados ni que el alert routing funcione en infraestructura real.

## Validación y estado

Source CI [#568](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42496866164) terminó SUCCESS en el commit `aeac5155a316592d31e557ab24e092134bf17f8f`: instalación frozen, migraciones 0001–0023 e idempotencia, provisioning de roles y quorum DLX, build, typecheck, pruebas API/PostgreSQL y suite del backend con RabbitMQ 4.4. La integración live creó colas efímeras, publicó con confirm, observó ready/unacknowledged/consumers, comprobó ACK/cancelación y esperó de forma acotada al primer conjunto completo de estadísticas. CodeQL [#103](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42496866189) terminó SUCCESS.

Este resultado verifica el código y las pruebas del slice; no demuestra scraping/despliegue real, seguridad de red, alert routing, SLO, carga, restore ni aceptación. TASK-003 permanece `in_progress` y este documento no habilita GO-PRODUCTION.
