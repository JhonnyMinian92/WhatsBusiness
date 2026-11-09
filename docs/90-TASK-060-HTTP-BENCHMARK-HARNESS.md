# 90 — TASK-060: harness reproducible de carga HTTP

**Fecha:** 2026-11-08  
**Rama:** `feat/task-060-http-benchmark-harness`  
**Tarea:** TASK-060 / Frente A  
**Estado:** implementación inicial del harness; no se declara benchmark de capacidad ejecutado ni TASK-060 completada.

## Propósito

El laboratorio `spike/task-039-lab` demuestra primitivas de infraestructura con datos sintéticos, pero no mide el comportamiento HTTP del workspace de aplicación. Este harness añade un generador acotado y reproducible de solicitudes de lectura para endpoints API/health.

## Implementación

- `scripts/bench/http-load-config.mjs`: valida configuración versionada, límites de carga, entorno, host, protocolo, ruta y umbrales.
- `scripts/bench/http-load-runner.mjs`: worker pool concurrente, warm-up opcional, timeout por petición, latencias min/mean/p50/p90/p95/p99/max, throughput, conteo de códigos y errores.
- `scripts/bench/http-load-artifacts.mjs`: genera JSON, Markdown y CSV sin persistir cuerpos ni valores de headers.
- `scripts/bench/http-load.mjs`: CLI.
- `scripts/bench/http-load.config.example.json`: escenario de ejemplo apuntando a `GET /api/health/live` de la API local.
- `scripts/bench/http-load.test.mjs`: pruebas de fuente para validación de destino, concurrencia, método GET y redacción de token; no ejecutadas en esta campaña.

## Guardrails

- Solo permite `GET`; no hay retry, escritura externa ni payload configurable.
- Por defecto solo admite loopback (`localhost`, `127.0.0.0/8`, `::1`).
- Otro destino exige `--allow-external-target`, HTTPS y un environment explícito `development`, `test` o `staging`. `production` no es un environment permitido.
- Un token opcional solo se toma del nombre de variable de entorno `bearerTokenEnv`; el valor no se imprime ni se persiste.
- Se consumen/cancelan los cuerpos de respuesta sin leerlos; reportes guardan únicamente latencia, status y código de error normalizado.
- No hay umbrales de latencia hardcodeados. El equipo define `thresholds` una vez que haya SLO/capacidad aprobados; sin umbrales el reporte es informativo.
- La concurrencia está limitada a 256, solicitudes a 50.000 y timeout a 120 segundos para evitar cargas accidentales ilimitadas.

## Uso

```bash
pnpm bench:http --config scripts/bench/http-load.config.example.json
```

Para un entorno de staging explícitamente autorizado, cambiar `environment` a `staging`, usar una URL HTTPS no productiva y ejecutar:

```bash
pnpm bench:http --config ./path/to/staging-benchmark.json --allow-external-target
```

Los reportes se escriben por defecto en `artifacts/benchmarks/`, directorio ignorado por Git.

## Límites

- El ejemplo mide únicamente health/liveness; no representa carga de CRM, Inbox, jobs, webhook, DB, colas ni integraciones Meta.
- La distribución de latencia y throughput depende del host y ambiente; un resultado local no es SLA ni dimensionamiento de producción.
- TASK-060 requiere escenarios adicionales por workload, escalones de concurrencia, duración sostenida, errores de dependencia, consumer lag, soak/capacity y reporte de recursos. No se inventan RPO/RTO ni objetivos de capacidad.
- Las pruebas de fuente se registran para ejecución en la fase de pruebas posterior; no se afirma que este cambio haya compilado o pasado tests.

## Trazabilidad

- Plan de cierre: `docs/78-SOURCE-COMPLETION-PLAN-71-TASKS.md`.
- Backlog: `docs/11-TASK-BACKLOG.md`, TASK-060.
- Laboratorio infraestructura: `spike/task-039-lab/README.md`.
