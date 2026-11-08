# 63 — Exposición segura de métricas del runtime de tenant jobs

## Objetivo

Proveer scraping Prometheus utilizable para el runtime de `microservices-meta-ecuapp` sin introducir un servidor web general, dependencias nuevas ni etiquetas de alta cardinalidad que puedan filtrar información de tenants.

## Diseño implementado

- `TenantJobRuntimeMetrics` mantiene la abstracción de aplicación para counters e histogramas, con outcomes cerrados.
- `PrometheusTenantJobRuntimeMetrics` acumula las métricas en memoria y renderiza el formato de exposición Prometheus.
- `TenantJobMetricsHttpServer` es un adapter de infraestructura independiente del framework. Expone solamente `GET /metrics`, sin CORS, con `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, límites de cabeceras y timeouts HTTP.
- `TenantJobRuntimeProcess` crea el adapter y lo inicia junto con el worker; el listener se cierra durante el shutdown junto con los pools PostgreSQL.
- No hay dependencias de terceros añadidas: usa `node:http`, `node:crypto` y el renderer existente.

## Configuración

| Variable | Default | Regla |
|---|---:|---|
| `TENANT_JOB_METRICS_HOST` | `127.0.0.1` | Loopback por defecto. |
| `TENANT_JOB_METRICS_PORT` | `9464` | Entero entre 0 y 65535; `0` permite puerto efímero en tests. |
| `TENANT_JOB_METRICS_BEARER_TOKEN` | vacío | Obligatorio fuera de loopback y mínimo 32 bytes UTF-8. |

Para scraping desde otro contenedor/host, configurar el host de escucha a una interfaz privada y suministrar un bearer token aleatorio desde Secret Manager. Prometheus debe enviar `Authorization: Bearer <token>`. El tráfico remoto debe quedar protegido por TLS/mTLS en un service mesh o reverse proxy de confianza; el bearer token no cifra el transporte. No guardar el secreto en Git, logs, labels, imágenes de contenedor ni documentación. El firewall/security group debe limitar el puerto al scraper interno; la autenticación no sustituye al aislamiento de red.

## Superficie HTTP

- `GET /metrics`: 200 y exposición Prometheus.
- Método diferente en `/metrics`: 405 con `Allow: GET`.
- Ruta o query string distinta: 404.
- Token ausente/incorrecto cuando está configurado: 401.
- Error interno del renderer: 500 genérico, sin stack ni detalle interno.

La comparación del bearer token usa `timingSafeEqual`; el endpoint no devuelve payloads de jobs ni atributos de tenant, actor o correlation. El binding remoto sin token robusto se rechaza en construcción.

## Métricas actualmente disponibles

Counters: dispatch outcomes, execution outcomes, publish outcomes, recuperación de leases/publicaciones, renovación de execution lease y errores del supervisor. Histograms: duración de ejecución de handlers y publicación al broker, con buckets fijos.

Se implementó un snapshot de gauges agregados en PostgreSQL mediante `platform.read_tenant_job_runtime_metrics()` (migración `0015-tenant-job-runtime-metrics.sql`). La función `SECURITY DEFINER` retorna solo conteos globales y edad del outbox pendiente; no retorna tenant IDs, actor IDs, job IDs ni payloads. `EXECUTE` se concede únicamente a `whatsbusiness_job_dispatcher_role`; `whatsbusiness_app` y `whatsbusiness_job_worker_role` no pueden invocarla ni tienen `SELECT` directo sobre `tenant_job_records`.

Gauges: outbox pending, dispatch blocked, dispatch leases active/expired, execution leases active/expired, dead-letter jobs, oldest pending dispatch age y jobs replayed. `PostgresTenantJobRuntimeMetricsReader` mapea el resultado a un snapshot tipado; el supervisor lo muestrea cada 15 s por defecto (`TENANT_JOB_METRICS_POLL_INTERVAL_MS`). El reader usa un pool PostgreSQL independiente de una sola conexión, autenticado con el rol dispatcher, con `connectionTimeoutMillis=1000`, `statement_timeout=750 ms` y `query_timeout=1000 ms`; no compite por los slots del pool de despacho. El muestreo es single-flight y asíncrono; su fallo se registra sin bloquear recovery ni dispatch. Los gauges se cachean en memoria entre scrapes; los contadores/histogramas también son in-memory y se reinician con el proceso.

Se añadieron gauges RabbitMQ para mensajes listos (`messages_ready`) y consumidores (`consumers`) de worker queue y DLQ mediante `RabbitMqManagementTenantJobQueueMetricsReader`, que consulta la Management HTTP API. Usa una identidad dedicada con tag `monitoring` y permisos AMQP vacíos (`configure/read/write` regex `^# 63 — Exposición segura de métricas del runtime de tenant jobs

## Objetivo

Proveer scraping Prometheus utilizable para el runtime de `microservices-meta-ecuapp` sin introducir un servidor web general, dependencias nuevas ni etiquetas de alta cardinalidad que puedan filtrar información de tenants.

## Diseño implementado

- `TenantJobRuntimeMetrics` mantiene la abstracción de aplicación para counters e histogramas, con outcomes cerrados.
- `PrometheusTenantJobRuntimeMetrics` acumula las métricas en memoria y renderiza el formato de exposición Prometheus.
- `TenantJobMetricsHttpServer` es un adapter de infraestructura independiente del framework. Expone solamente `GET /metrics`, sin CORS, con `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, límites de cabeceras y timeouts HTTP.
- `TenantJobRuntimeProcess` crea el adapter y lo inicia junto con el worker; el listener se cierra durante el shutdown junto con los pools PostgreSQL.
- No hay dependencias de terceros añadidas: usa `node:http`, `node:crypto` y el renderer existente.

## Configuración

| Variable | Default | Regla |
|---|---:|---|
| `TENANT_JOB_METRICS_HOST` | `127.0.0.1` | Loopback por defecto. |
| `TENANT_JOB_METRICS_PORT` | `9464` | Entero entre 0 y 65535; `0` permite puerto efímero en tests. |
| `TENANT_JOB_METRICS_BEARER_TOKEN` | vacío | Obligatorio fuera de loopback y mínimo 32 bytes UTF-8. |

Para scraping desde otro contenedor/host, configurar el host de escucha a una interfaz privada y suministrar un bearer token aleatorio desde Secret Manager. Prometheus debe enviar `Authorization: Bearer <token>`. El tráfico remoto debe quedar protegido por TLS/mTLS en un service mesh o reverse proxy de confianza; el bearer token no cifra el transporte. No guardar el secreto en Git, logs, labels, imágenes de contenedor ni documentación. El firewall/security group debe limitar el puerto al scraper interno; la autenticación no sustituye al aislamiento de red.

## Superficie HTTP

- `GET /metrics`: 200 y exposición Prometheus.
- Método diferente en `/metrics`: 405 con `Allow: GET`.
- Ruta o query string distinta: 404.
- Token ausente/incorrecto cuando está configurado: 401.
- Error interno del renderer: 500 genérico, sin stack ni detalle interno.

La comparación del bearer token usa `timingSafeEqual`; el endpoint no devuelve payloads de jobs ni atributos de tenant, actor o correlation. El binding remoto sin token robusto se rechaza en construcción.

## Métricas actualmente disponibles

Counters: dispatch outcomes, execution outcomes, publish outcomes, recuperación de leases/publicaciones, renovación de execution lease y errores del supervisor. Histograms: duración de ejecución de handlers y publicación al broker, con buckets fijos.

Se implementó un snapshot de gauges agregados en PostgreSQL mediante `platform.read_tenant_job_runtime_metrics()` (migración `0015-tenant-job-runtime-metrics.sql`). La función `SECURITY DEFINER` retorna solo conteos globales y edad del outbox pendiente; no retorna tenant IDs, actor IDs, job IDs ni payloads. `EXECUTE` se concede únicamente a `whatsbusiness_job_dispatcher_role`; `whatsbusiness_app` y `whatsbusiness_job_worker_role` no pueden invocarla ni tienen `SELECT` directo sobre `tenant_job_records`.

Gauges: outbox pending, dispatch blocked, dispatch leases active/expired, execution leases active/expired, dead-letter jobs, oldest pending dispatch age y jobs replayed. `PostgresTenantJobRuntimeMetricsReader` mapea el resultado a un snapshot tipado; el supervisor lo muestrea cada 15 s por defecto (`TENANT_JOB_METRICS_POLL_INTERVAL_MS`). El reader usa un pool PostgreSQL independiente de una sola conexión, autenticado con el rol dispatcher, con `connectionTimeoutMillis=1000`, `statement_timeout=750 ms` y `query_timeout=1000 ms`; no compite por los slots del pool de despacho. El muestreo es single-flight y asíncrono; su fallo se registra sin bloquear recovery ni dispatch. Los gauges se cachean en memoria entre scrapes; los contadores/histogramas también son in-memory y se reinician con el proceso.

), HTTPS fuera de loopback, Basic auth, GET sin cache, rechazo de redirects y `AbortController` con timeout de 1 500 ms. No comparte la conexión AMQP del worker ni puede publicar/consumir/modificar recursos. Los contadores solo representan mensajes listos: no incluyen entregas unacknowledged ni equivalen a consumer lag. Se añadieron un dashboard Grafana JSON, reglas Prometheus iniciales y un runbook en `microservices-meta-ecuapp/observability/`; todavía no están instalados ni probados contra un stack real. Siguen faltando métricas autoritativas de unacked/edad real del mensaje/lag, SLO cuantificados y retención remota configurada. Los datos in-memory no sustituyen a un backend Prometheus duradero.

## Pruebas

`tenant-job-metrics-http.server.spec.ts` cubre scraping GET, content-type/cache headers, 404, rechazo de query string, método no permitido, autenticación, error genérico del renderer, requisito de token remoto, validación de configuración, doble startup y cierre idempotente. La suite debe ejecutarse a través del target Nx `microservices-meta-ecuapp:test` y Source CI.

## Estado y criterios pendientes

**Endpoint HTTP implementado y CI-verificado**: Source CI [#42434224485](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42434224485) terminó SUCCESS para el endpoint. **Gauges PostgreSQL implementados y CI-verificados**: Source CI [#42435204662](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42435204662) terminó SUCCESS para commit `8b9fae108e8581ec03ee4933fa75a251f8d04621`, incluyendo migraciones/idempotencia, build, typecheck y unit/integration tests. Los gauges RabbitMQ se rediseñaron después para usar Management HTTP API con identidad monitoring dedicada; la implementación vigente está en Source CI #466 (run `42436159239`) pendiente/queued para commit `e00ec2d023fd1022e3f9dc1ac32ba7f212f82f8a`. Source CI #463 y CodeQL #3 verificaron el diseño AMQP anterior, ahora reemplazado. CodeQL [#6](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42436159237) terminó SUCCESS para el nuevo commit. La alerta para target ausente (`absent(up)`) forma parte del mismo HEAD. Se añadieron dashboard, alert rules y runbook; no se afirma que estén desplegados en Prometheus/Grafana. Esto no cierra TASK-003 ni permite marcarla accepted.

Para el cierre de observabilidad de TASK-003 aún se requiere:
1. Source CI #463 verificó la implementación AMQP anterior; Source CI #466 debe verificar la implementación vigente Management API y su identidad separada. CodeQL #6 ya terminó SUCCESS.
2. Importar dashboard y reglas versionados en Prometheus/Grafana reales, validar consultas/alertas y configurar alert routing. La regla de scrape ahora contempla tanto `up == 0` como `absent(up)`; el cambio de configuración está pendiente de Source CI #465 y CodeQL #5. Añadir métricas de unacked/consumer lag solo con una fuente autoritativa y revisar umbrales con evidencia de carga.
3. Validar scraping desde la topología real de despliegue, TLS/mTLS, firewall y secret rotation.
4. Incorporar revisión independiente de seguridad/operación y aceptación del propietario.

GO-PRODUCTION permanece NO-GO.
