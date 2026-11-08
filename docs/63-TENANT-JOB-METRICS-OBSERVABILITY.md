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

Para scraping desde otro contenedor/host, configurar el host de escucha a una interfaz privada y suministrar un bearer token aleatorio desde Secret Manager. Prometheus debe enviar `Authorization: Bearer <token>`. No guardar el secreto en Git, logs, labels, imágenes de contenedor ni documentación. El firewall/security group debe limitar el puerto al scraper interno; la autenticación no sustituye al aislamiento de red.

## Superficie HTTP

- `GET /metrics`: 200 y exposición Prometheus.
- Método diferente en `/metrics`: 405 con `Allow: GET`.
- Ruta o query string distinta: 404.
- Token ausente/incorrecto cuando está configurado: 401.
- Error interno del renderer: 500 genérico, sin stack ni detalle interno.

La comparación del bearer token usa `timingSafeEqual`; el endpoint no devuelve payloads de jobs ni atributos de tenant, actor o correlation. El binding remoto sin token robusto se rechaza en construcción.

## Métricas actualmente disponibles

Counters: dispatch outcomes, execution outcomes, publish outcomes, recuperación de leases/publicaciones, renovación de execution lease y errores del supervisor. Histograms: duración de ejecución de handlers y publicación al broker, con buckets fijos.

No se han añadido todavía gauges de outbox age, queue depth, consumer lag, número de leases activos/expirados, DLQ ni replay. Tampoco existen reglas de alertas, SLO cuantificados o retención remota configurada. Los contadores/histogramas son in-memory: se reinician con el proceso y no sustituyen a un backend Prometheus duradero.

## Pruebas

`tenant-job-metrics-http.server.spec.ts` cubre scraping GET, content-type/cache headers, 404, rechazo de query string, método no permitido, autenticación, error genérico del renderer, requisito de token remoto, validación de configuración, doble startup y cierre idempotente. La suite debe ejecutarse a través del target Nx `microservices-meta-ecuapp:test` y Source CI.

## Estado y criterios pendientes

**Implementado en source; verificación CI de este cambio pendiente.** No marcar TASK-003 como verified o accepted por este endpoint aislado.

Para el cierre de observabilidad de TASK-003 aún se requiere:
1. Ejecutar Source CI y revisar logs del nuevo test.
2. Diseñar gauges consultando PostgreSQL/RabbitMQ sin mezclar credenciales de API, dispatcher y worker.
3. Añadir dashboards y alertas basados en umbrales/SLO aprobados y evidencia de carga.
4. Validar scraping desde la topología real de despliegue, TLS/autenticación, firewall y secret rotation.
5. Incorporar revisión independiente de seguridad/operación y aceptación del propietario.

GO-PRODUCTION permanece NO-GO.
