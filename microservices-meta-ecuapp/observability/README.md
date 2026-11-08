# Observabilidad del runtime de tenant jobs

## Componentes

- \`prometheus/tenant-job-alerts.yml\`: alertas para scraping, dispatch bloqueado, DLQ, deliveries unacknowledged y consumers ausentes, outbox age, leases vencidos, errores del supervisor y pérdida de execution lease.
- \`grafana/tenant-job-runtime.dashboard.json\`: counters, latencias, gauges PostgreSQL y métricas RabbitMQ.
- \`RUNBOOK.md\`: diagnóstico, recuperación y límites operativos.

## Instalación

1. Configurar Prometheus para scrapear \`GET /metrics\` del runtime desde red privada; obtener el bearer token desde Secret Manager cuando el listener no sea loopback.
2. Habilitar \`rabbitmq_prometheus\` en cada nodo RabbitMQ. Mantener \`/metrics/detailed\` y el puerto 15692 en red privada, protegido por firewall y TLS/mTLS al cruzar nodos/redes.
3. Inyectar opcionalmente \`RABBITMQ_PROMETHEUS_USERNAME\` y \`RABBITMQ_PROMETHEUS_PASSWORD\` como pareja desde Secret Manager si Basic auth está habilitada en el exporter.
4. Cargar reglas \`prometheus/tenant-job-alerts.yml\`; el job del runtime debe llamarse \`whatsbusiness-tenant-jobs\` o ajustarse el selector de \`up\`.
5. Importar el dashboard JSON en Grafana y configurar receivers/routing de alertas.

Los umbrales son guardrails iniciales, no SLO aprobados ni SLA. Deben revisarse con carga/capacidad antes de producción.

## Métricas RabbitMQ

El backend usa \`RabbitMqPrometheusTenantJobQueueMetricsReader\`, no Management API. Consulta \`GET /metrics/detailed\` con \`queue_coarse_metrics\` y \`queue_consumer_count\`, filtradas por vhost y solo worker queue/DLQ. No lee mensajes ni cuerpos, ni requiere permiso AMQP \`read\`.

Se exponen ready, unacknowledged y consumers. Un mensaje unacknowledged ya fue entregado y espera ACK/NACK; no equivale a consumer lag ni edad. El reader valida labels y contadores, rechaza redirects, limita respuesta y aplica timeout. Basic auth es opcional y siempre se configura como pareja.

RabbitMQ actualiza estadísticas por intervalo. La integración distingue el snapshot incompleto transitorio y reintenta solo ese estado por máximo 20 segundos. El fixture live usa colas exclusivas por conexión, \`durable=false\`, \`autoDelete=false\`; las elimina explícitamente después de verificar los gauges idle. No afecta las quorum queues durables de producción.

## Verificación y limitaciones

Source CI [#572](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026616) y CodeQL [#107](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026686) terminaron SUCCESS en \`1c6e682eb755e77b8359e52d4e7091a41e4ef6d5\`. Esto verifica build, typecheck, pruebas unitarias e integraciones sintéticas PostgreSQL/RabbitMQ; no demuestra exporter instalado en infraestructura, scraping de todos los nodos, firewall/TLS, alert routing ni SLO.

TASK-003 continúa \`in_progress\`; runtime no está aceptado para producción y GO-PRODUCTION sigue NO-GO.

## Backlog durable de ejecución PostgreSQL

El runtime publica dos gauges globales, sin labels de tenant, actor, job o payload:

- `tenant_job_execution_pending`: trabajos con estado durable `queued` y dispatch `published` que todavía no han sido reclamados por un worker.
- `tenant_job_oldest_pending_execution_age_seconds`: antigüedad desde `published_at` del trabajo más antiguo de ese conjunto.

Estas métricas completan el conteo/edad del outbox de dispatch, pero no reemplazan las métricas físicas de RabbitMQ. Ready y unacknowledged describen estados del broker; la edad PostgreSQL describe el tiempo que un trabajo publicado permanece sin claim de ejecución. No se debe llamar consumer lag a ninguno de estos gauges.

El dashboard incluye el count y la edad de ejecución pendiente. Las reglas Prometheus añaden advertencias iniciales para más de 100 trabajos pendientes durante cinco minutos o edad superior a 300 segundos durante dos minutos. Los umbrales son guardrails iniciales; no constituyen SLO/SLA aprobados y deben calibrarse con workload medido.

## Validación estática en Source CI

El workflow Source workspace validation ejecuta `scripts/validate-observability-assets.mjs` antes de provisionar servicios. El validador parsea el JSON del dashboard, comprueba IDs de panel únicos y targets no vacíos, verifica que los nombres tenant_job_* usados por paneles/reglas estén registrados por el exporter y exige campos/identificadores únicos en cada regla. Es un guard de consistencia para el subconjunto de reglas versionado; no sustituye promtool, la carga real en Prometheus ni la importación/prueba del dashboard y routing de alertas en Grafana.

Source CI #581 y CodeQL #116 terminaron SUCCESS en commit `d4051c718de19016afd6e52b7803de903e4c5fba`.
