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
