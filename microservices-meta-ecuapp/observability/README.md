# Observabilidad del runtime de tenant jobs

## Componentes

- `prometheus/tenant-job-alerts.yml`: reglas para disponibilidad de scraping, dispatch bloqueado, DLQ, deliveries unacknowledged y consumers ausentes, edad del outbox, leases vencidos, errores de supervisor y pérdida de execution lease.
- `grafana/tenant-job-runtime.dashboard.json`: dashboard de counters, latencias, gauges PostgreSQL y métricas de RabbitMQ.
- `RUNBOOK.md`: diagnóstico, recuperación y límites operativos.

## Instalación

1. Configurar Prometheus para scrapear `GET /metrics` del runtime de jobs desde red privada y obtener el bearer token desde Secret Manager cuando el listener no sea loopback.
2. Habilitar `rabbitmq_prometheus` en cada nodo RabbitMQ y configurar el scrape de `/metrics/detailed` en el endpoint privado del broker. La aplicación consume solo el endpoint detallado y limita la consulta a las familias de métricas de cola y consumer count requeridas.
3. Proteger el transporte remoto del runtime y del broker con TLS/mTLS en proxy/service mesh, HTTPS para endpoints no loopback y firewall de red privada. HTTP Basic para el exporter es opcional; sus credenciales se inyectan por Secret Manager.
4. Cargar las reglas de `prometheus/tenant-job-alerts.yml`; el job del runtime debe llamarse `whatsbusiness-tenant-jobs` o debe ajustarse el selector de `up`.
5. Importar el JSON del dashboard en Grafana, seleccionar datasource Prometheus y configurar receivers/routing de alertas del stack operacional.

Los umbrales son guardrails iniciales, no SLO aprobados ni SLA. Deben revisarse con carga, capacidad y ventanas de operación antes de producción.

## Métricas RabbitMQ

El backend usa `RabbitMqPrometheusTenantJobQueueMetricsReader`, no Management API. Consulta `GET /metrics/detailed` con `queue_coarse_metrics` y `queue_consumer_count`, filtrando por vhost y los nombres de worker queue y DLQ configurados. El adaptador no lee mensajes ni cuerpos y no requiere permiso AMQP `read`.

Se miden `messages_ready`, `messages_unacked` y consumers. Un mensaje `unacknowledged` ya fue entregado y aún espera ACK/NACK; no equivale a consumer lag ni edad de mensaje. El reader valida etiquetas y contadores, rechaza redirects, tiene timeout y límite de respuesta, y permite Basic auth solo con par username/password completa. Las estadísticas por cola se actualizan en intervalo del broker; la suite live reintenta solo el estado de muestras incompletas durante un máximo de 20 segundos.

Los counters e histogramas propios del proceso viven en memoria y se reinician al reiniciarlo. El dashboard no sustituye una plataforma duradera, revisión de SLO ni validación del alert routing.

## Verificación y limitaciones

Source CI [#568](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42496866164) y CodeQL [#103](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42496866189) terminaron SUCCESS en `aeac5155a316592d31e557ab24e092134bf17f8f`. Esto verifica compilación, pruebas unitarias e integración sintética en CI; no verifica la instalación real del exporter, el scrape de todos los nodos, firewall/TLS, dashboard/alert routing ni objetivos SLO.

TASK-003 continúa `in_progress`; el runtime no se considera listo para producción y GO-PRODUCTION permanece NO-GO.
