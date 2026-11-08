# 63 — Exposición segura de métricas del runtime de tenant jobs

**Rama:** \`environment/local\`  
**Estado del código:** CI verificado por Source CI #572 y CodeQL #107 sobre \`1c6e682eb755e77b8359e52d4e7091a41e4ef6d5\`.  
**Estado operacional:** pendiente despliegue/observabilidad real, SLO, capacidad/DR y aceptación del propietario. TASK-003 continúa \`in_progress\`; GO-PRODUCTION permanece NO-GO.

## Objetivo

Exponer métricas agregadas y de baja cardinalidad sin IDs de tenant, actor, job, correlation ni payload. PostgreSQL y RabbitMQ son fuentes independientes; un snapshot fallido de una fuente no borra los gauges de la otra.

## Arquitectura

- \`PrometheusTenantJobRuntimeMetrics\`: counters, histograms y gauges del proceso.
- \`PostgresTenantJobRuntimeMetricsReader\`: agregados de \`platform.read_tenant_job_runtime_metrics()\` con pool aislado y privilegios funcionales mínimos.
- \`RabbitMqPrometheusTenantJobQueueMetricsReader\`: consulta RabbitMQ Prometheus Detailed Metrics, limitada a dos familias y a worker queue/DLQ.
- \`CompositeTenantJobRuntimeMetricsReader\`: combina snapshots parciales y preserva el último valor válido.
- \`TenantJobMetricsHttpServer\`: expone exclusivamente \`GET /metrics\`.

No se consultan mensajes ni payloads. Los gauges no incluyen labels tenant/actor/job.

## Métricas PostgreSQL

Incluye dispatch pending/blocked, leases de dispatch y ejecución activos/expirados, jobs dead-letter, edad del dispatch pendiente más antiguo y jobs replayed. La función SQL retorna únicamente agregados globales y mantiene \`search_path\` fijo.

## Métricas RabbitMQ

El reader llama a \`GET /metrics/detailed\` con las familias:
- \`queue_coarse_metrics\`
- \`queue_consumer_count\`

Filtra por vhost y por regex anclada que incluye solo los nombres configurados de worker queue y DLQ. Solo consume:
- \`rabbitmq_detailed_queue_messages_ready\`
- \`rabbitmq_detailed_queue_messages_unacked\`
- \`rabbitmq_detailed_queue_consumers\`

Gauges publicados:
- \`tenant_job_rabbitmq_worker_queue_ready_messages\`
- \`tenant_job_rabbitmq_worker_queue_unacknowledged_messages\`
- \`tenant_job_rabbitmq_worker_queue_consumers\`
- \`tenant_job_rabbitmq_dead_letter_queue_ready_messages\`
- \`tenant_job_rabbitmq_dead_letter_queue_unacknowledged_messages\`
- \`tenant_job_rabbitmq_dead_letter_queue_consumers\`

\`messages_unacknowledged\` representa entregas sin ACK/NACK; no equivale a consumer lag ni a edad de mensaje. Para lag/age se necesita una fuente temporal autoritativa independiente.

## Seguridad y resiliencia

- \`RABBITMQ_PROMETHEUS_URL\` es obligatorio; HTTPS remoto, HTTP solo loopback. Sin credenciales embebidas, query, fragment ni path personalizado.
- Basic auth opcional con \`RABBITMQ_PROMETHEUS_USERNAME\` + \`RABBITMQ_PROMETHEUS_PASSWORD\`, siempre en pareja e inyectadas por Secret Manager.
- Plugin \`rabbitmq_prometheus\` habilitado; puerto 15692 en red privada/firewall. No se usa Management API ni se crea usuario AMQP \`monitoring\`.
- No se concede AMQP \`read\`: permitiría consumir mensajes. El worker no necesita acceso a cuerpos para extraer métricas.
- HTTP GET, \`cache: no-store\`, redirects prohibidos, timeout abortable y límite de respuesta por defecto 256 KiB (máximo 2 MiB).
- Parser estricto: familias allowlisted, labels \`vhost\`/\`queue\`, rechaza duplicados y valores negativos/fraccionarios/no seguros, formato inválido y muestras omitidas.
- El error \`RABBITMQ_PROMETHEUS_METRICS_INCOMPLETE\` identifica una estadística todavía no publicada por el intervalo de colección. La suite live reintenta solo ese error por máximo 20 s; otros errores son fail-fast.
- \`CompositeTenantJobRuntimeMetricsReader\` conserva el último gauge válido ante fallo de una fuente; ningún fallo de scraping detiene recovery/dispatch.

El fixture live crea colas únicas por ejecución con \`durable=false, exclusive=true, autoDelete=false\`. Son exclusivas de la conexión y se eliminan explícitamente en \`finally\`; mantenerlas tras cancelar el último consumer permite verificar las métricas en cero. Esto no altera las quorum queues durables de producción.

## Endpoint Prometheus del runtime

\`GET /metrics\` en \`127.0.0.1:9464\` por defecto. Binding fuera de loopback requiere bearer token de mínimo 32 bytes, TLS/mTLS en proxy o service mesh y firewall privado. Los counters/histograms del proceso se reinician al reinicio; Prometheus proporciona retención.

## Artefactos operativos

- \`microservices-meta-ecuapp/observability/prometheus/tenant-job-alerts.yml\`
- \`microservices-meta-ecuapp/observability/grafana/tenant-job-runtime.dashboard.json\`
- \`microservices-meta-ecuapp/observability/RUNBOOK.md\`
- \`microservices-meta-ecuapp/observability/README.md\`

Los umbrales son guardrails iniciales, no SLO/SLA aprobados. Dashboards y reglas están versionados; aún no se afirma que estén instalados ni que el alert routing funcione.

## Validación y estado

Source CI [#568](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42496866164) verificó por primera vez el lector Prometheus, build, typecheck, migraciones y pruebas live. Source CI [#572](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026616) terminó SUCCESS sobre el fixture final \`exclusive=true, autoDelete=false\`, verificando ready → unacknowledged/consumer → idle tras ACK/cancelación. CodeQL [#107](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026686) terminó SUCCESS.

Source CI #572 también ejecutó pruebas del controller CRM, incluida la exigencia de TenantContextGuard y AuthorizationGuard en list/create/get/update. TASK-003 permanece \`in_progress\`: faltan despliegue Prometheus/Grafana, alert routing, SLO, load/DR, handlers de negocio, retención, secretos gestionados y aceptación independiente. Este documento no habilita GO-PRODUCTION.

## Actualización 2026-11-08 — edad durable de ejecución pendiente

Se añadió el complemento PostgreSQL que faltaba para medir backlog de ejecución de forma autoritativa:

- `pendingExecutionJobs`: cantidad de trabajos con estado `queued` y dispatch `published`, aún no reclamados por worker.
- `oldestPendingExecutionAgeSeconds`: tiempo desde `published_at` del más antiguo de esos trabajos hasta la hora del snapshot.
- Prometheus: `tenant_job_execution_pending` y `tenant_job_oldest_pending_execution_age_seconds`.

Esto no sustituye los gauges RabbitMQ. Los gauges de broker describen ready, unacknowledged y consumers; la métrica PostgreSQL describe trabajos durables publicados que siguen esperando ejecución. La separación evita inferir antigüedad de un mensaje desde el número de mensajes o desde el intervalo de scrape.

La migración `0025-tenant-job-execution-backlog-metrics.sql` conserva el único permiso EXECUTE en `whatsbusiness_job_dispatcher_role`; API y worker siguen sin permiso de lectura del agregado ni de payload. La suite PostgreSQL comprueba staging → publicación → métrica antes del claim del worker.

**Verificación:** Source CI #578 y CodeQL #113 terminaron SUCCESS sobre `19e1c585648e510d67bc1d13eab9761775b56cf2`. Se validaron build, typecheck, migraciones/idempotencia y pruebas API + backend PostgreSQL/RabbitMQ. TASK-003 permanece `in_progress`; la evidencia no implica aceptación ni GO-PRODUCTION.


## Corrección post-CI (2026-11-08)

Source CI #576 detectó dos defectos corregibles en el slice de backlog de ejecución: validación de edad decimal confundida con gauge contador y un jobType sintético no válido (execution-backlog contenía un guion). El exporter ahora permite valores fraccionarios en las dos métricas AgeSeconds y el test utiliza el jobType válido inbox.metrics.executionbacklog. El test PostgreSQL mide el backlog previo y verifica incremento exacto de uno tras publicación.
La corrección necesita Source CI verde antes de marcar esta ampliación verificada; CodeQL sobre el commit anterior ya pasó.


## Corrección post-CI #577 (2026-11-08)

La integración PostgreSQL se reordenó para no llamar a la operación batch `claim_tenant_job_publications` mientras el job de finalización principal seguía pendiente. Primero se completa el dispatch/claim de ese job con el helper existente; después se inserta y publica el fixture de métrica cuando es el único nuevo job elegible en la topología de prueba. Esto elimina el efecto colateral real de `LIMIT` + `FOR UPDATE SKIP LOCKED` al filtrar fuera de la función por `job_id`, y evita dejar leases de otros fixtures en estado `publishing`.
**Estado:** el orden corregido se somete nuevamente a Source CI; no se afirma todavía verificación.


## Actualización de dashboard y alertas — 2026-11-08

El dashboard tenant-job-runtime.dashboard.json incorpora panel para cantidad de trabajos publicados sin claim (tenant_job_execution_pending) y serie temporal de antigüedad desde published_at (tenant_job_oldest_pending_execution_age_seconds). Prometheus añade alertas iniciales para más de 100 trabajos pendientes durante 5 minutos y edad superior a 300 segundos durante 2 minutos.

Las reglas describen estados agregados globales sin segmentar por tenant/actor/job. Los umbrales no son SLO/SLA y requieren calibración con carga real. El runbook diferencia edad durable PostgreSQL de la edad física de mensajes RabbitMQ; no se afirma medir consumer lag real.

Artefactos versionados: README, runbook, dashboard Grafana y alertas Prometheus. La sintaxis JSON del dashboard se validó con parser JSON y sus queries apuntan a métricas registradas en el exporter. La carga de rules con Prometheus, importación del dashboard, alert routing y comprobación de notificaciones siguen pendientes en infraestructura real.

## Verificación de assets — 2026-11-08

- Source CI #580 y CodeQL #115: SUCCESS para el dashboard de 13 paneles, 11 reglas Prometheus y runbook añadidos en `36e7a962db113e81835a466393b479b34132980b`.
- Source CI #581 y CodeQL #116: SUCCESS tras integrar `scripts/validate-observability-assets.mjs` en el workflow. El paso automatiza el parseo JSON, unicidad de IDs, presencia de expresiones, unicidad/campos mínimos de reglas y consistencia entre métricas consultadas y exporter.
- La validación estructural no prueba que Prometheus acepte todas las reglas en el cluster real ni que Grafana importe el dashboard o envíe notificaciones; siguen pendientes despliegue, alert routing, carga y calibración de umbrales.
- TASK-003 continúa `in_progress`; el runtime no está accepted ni GO-PRODUCTION.
