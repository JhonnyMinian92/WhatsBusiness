# Observabilidad del runtime de tenant jobs

## Componentes

- `prometheus/tenant-job-alerts.yml`: reglas de alerta para disponibilidad de scraping, dispatch bloqueado, DLQ, consumers ausentes, edad del outbox, leases vencidos, errores de supervisor y pérdida de execution lease.
- `grafana/tenant-job-runtime.dashboard.json`: dashboard de counters, latencias, gauges PostgreSQL y métricas disponibles de RabbitMQ.
- `RUNBOOK.md`: diagnóstico, recuperación y límites operativos.

## Instalación

1. Configurar Prometheus para scrapear `GET /metrics` desde una red privada y enviar el bearer token desde Secret Manager.
2. Proteger el transporte remoto con TLS/mTLS en el proxy/service mesh y restringir el puerto mediante firewall.
3. Cargar las reglas de `prometheus/tenant-job-alerts.yml`; el job debe llamarse `whatsbusiness-tenant-jobs` o debe ajustarse el selector de `up`.
4. Importar el JSON del dashboard en Grafana y seleccionar el datasource Prometheus.
5. Configurar los receivers y routing de alertas en el stack de operación; este repositorio no presupone un proveedor de notificaciones.

Los umbrales son guardrails operativos iniciales, no SLO aprobados ni SLA. Deben revisarse con evidencia de carga y ventanas de operación antes de producción.

## Limitaciones conocidas

Las métricas RabbitMQ reflejan ready messages y consumer count de `checkQueue`; no representan unacked ni consumer lag. Los contadores/histogramas viven en memoria y se reinician al reiniciar el proceso. El dashboard no sustituye una plataforma de métricas duradera ni una revisión de alertas.
