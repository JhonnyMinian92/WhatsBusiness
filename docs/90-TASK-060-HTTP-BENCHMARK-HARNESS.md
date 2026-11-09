# 90 — TASK-060: harness reproducible de carga HTTP

**Fecha:** 2026-11-09  
**Rama canónica:** `environment/local`  
**Tarea:** TASK-060 / Frente A  
**Estado:** harness integrado; pruebas de fuente registradas en Source CI. No se declara benchmark de capacidad ejecutado.

## Implementación

- `http-load-config.mjs`: valida config, entorno, target, rutas, límites y thresholds.
- `http-load-runner.mjs`: worker pool acotado, warm-up, timeouts, p50/p90/p95/p99, throughput, status y errores.
- `http-load-artifacts.mjs`: reportes JSON, Markdown y CSV, sin persistir cuerpos ni valores de headers.
- `http-load.mjs`: CLI.
- `http-load.config.example.json`: ejemplo GET health local.
- `http-load.test.mjs`: tests de host, límites, concurrencia, GET y redacción de tokens.
- Root scripts `pnpm bench:http` / `pnpm bench:test`; Source CI ejecuta `pnpm bench:test`.

## Guardrails

Solo GET, sin retries ni payloads configurables. Por defecto loopback; destino externo requiere `--allow-external-target`, HTTPS y environment development/test/staging; production prohibido. Token se toma de `bearerTokenEnv` y no se imprime ni guarda. Las respuestas se cancelan sin leer bodies. Concurrencia máxima 256; requests 50.000; timeout 120s. Sin thresholds no se afirma un SLO.

## Uso

```bash
pnpm bench:test
pnpm bench:http --config scripts/bench/http-load.config.example.json
```

## Límites

El ejemplo mide solo health/liveness; no representa CRM, Inbox, jobs, webhook, DB, RabbitMQ ni Meta. TASK-060 requiere escenarios por workload, escalones de concurrencia, soak/capacity, fallas de dependencias, consumer lag y resource profiling. No inventa SLO/RPO/RTO.
