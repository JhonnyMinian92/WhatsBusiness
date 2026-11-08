# microservices-meta-ecuapp — backend WhatsBusiness

Este directorio es la raíz del backend que se está consolidando bajo el nombre solicitado por el propietario. Se integra como proyecto Nx/TypeScript dentro del workspace existente y comparte el mismo lockfile, PostgreSQL, contratos y pipeline CI.

## Arquitectura vigente

La arquitectura de producto sigue siendo un **monolito modular con límites de dominio y procesos worker desplegables por separado cuando la carga lo justifique**. El nombre del directorio no obliga a convertir cada módulo en un microservicio de red. Esta regla evita duplicar APIs, pools, identidad y lógica de autorización antes de disponer de evidencia de capacidad/operación.

- `src/jobs/domain`: contratos y políticas puras de jobs.
- `src/jobs/application`: dispatcher, consumer, handlers y puertos.
- `src/jobs/infrastructure/postgres`: persistencia de outbox, leases, inbox y fencing.
- `src/jobs/infrastructure/rabbitmq`: adapter AMQP 0-9-1, publisher confirms y ACK manual.
- `migrations`: migraciones de backend. `scripts/migrate.mjs` ejecuta en orden las migraciones heredadas de `apps/api/migrations` y las nuevas de este directorio; los números son globales y no se pueden duplicar.

## Fuente de verdad en transición

El HTTP foundation existente sigue temporalmente en `apps/api` mientras se migran contextos, contratos y pruebas sin duplicar su comportamiento. Los nuevos módulos backend se incorporan aquí y deben exponer ports explícitos; no se crean copias del IdentityService, DatabaseService ni de los guards existentes. Toda migración de código debe mantener build, typecheck, tests y referencias cruzadas.

## Reliability contract

1. PostgreSQL commit de negocio + job record es el outbox transaccional.
2. El dispatcher reclama filas con `FOR UPDATE SKIP LOCKED`, lease y fencing token.
3. RabbitMQ recibe solamente `{ version: 1, jobId }`; el payload canónico permanece en PostgreSQL.
4. El publisher usa mensajes persistentes, `mandatory=true` y publisher confirms antes de marcar la fila publicada.
5. El consumer usa manual ACK y prefetch acotado. ACK solo después del commit de la transacción de negocio, inbox y estado terminal/retry.
6. La expiración de leases permite recuperar dispatchers/workers caídos. Los fencing tokens evitan que un worker antiguo confirme después de perder su lease; los handlers largos renuevan el lease con el token actual y reciben AbortSignal si la renovación falla.
7. Los handlers no hacen I/O de proveedor dentro de la transacción de ejecución; deben stagear esos side effects en outbox.
8. Cada handler recibe AbortSignal y está sujeto a TENANT_JOB_HANDLER_TIMEOUT_MS (1–900 s); debe cooperar con cancelación. El timeout aborta el trabajo y fuerza rollback, pero no puede matar una promesa Node.js no cooperativa: el host no debe registrar handlers que ignoren AbortSignal.
9. At-least-once implica duplicados. No se promete exactly-once end-to-end.

## Operación

RabbitMQ 4.4 con quorum queues es la baseline documentada en docs/51. Se requieren publisher confirms, consumer ACK manual y dead-letter policy at-least-once con `overflow=reject-publish` para DLX de quorum; las policies deben desplegarse y comprobarse por infraestructura, no inferirse del código.

## Validación

`pnpm build`, `pnpm typecheck` y `pnpm test` ejecutan también este proyecto Nx. Source CI aplica las migraciones versionadas vigentes (hasta `0014`) e idempotencia; habilita las suites `RUN_TENANT_JOB_RUNTIME_INTEGRATION_TESTS=true` y valida PostgreSQL/RabbitMQ efímeros, renovación/recuperación de leases y fencing. Source CI #42433941375 terminó SUCCESS para commit `f136cff710fe8c60c8430c82928092320b9d90b5`.

## Estado honesto

Este proyecto añade runtime source para outbox/dispatcher/consumer, pero no representa GO-PRODUCTION. Antes de operar workers reales faltan la composición de deployment/secret manager, topology/policies desplegadas, pruebas crash/replay con RabbitMQ real, pool reuse A→B, SLO/alertas, carga, revisión independiente y aprobación de producción. El frontend no es requerido para este trabajo backend; no se crea todavía `app-meta-ecuapp`.
## Runtime worker y variables de entorno

El composition root reusable es `TenantJobRuntimeProcess.create`. El host debe pasar:
- `handlers`: handlers reales de los casos de uso de la aplicación; se rechaza una lista vacía.
- `databaseFactory(workerPool)`: adapta el `DatabaseService.withTenantContext` canónico existente al pool del worker. No crear una segunda implementación de autorización/RLS.
- `logger`: implementación de logs/telemetría con códigos normalizados.

La plantilla de variables está en `.env.example`; `TENANT_JOB_HANDLER_TIMEOUT_MS` configura el límite de ejecución cooperativa (default 300 s, rango 1–900 s). Se requieren URLs separadas para API, dispatcher y worker, más `RABBITMQ_URL`. En producción las URLs deben venir de Secret Manager/KMS y DB SSL y AMQPS son obligatorios. El runtime no arranca un worker productivo sin handlers reales.

### Comandos del workspace
```bash
pnpm install --frozen-lockfile
pnpm nx build microservices-meta-ecuapp
pnpm nx typecheck microservices-meta-ecuapp
pnpm nx test microservices-meta-ecuapp
pnpm db:migrate
```

La raíz HTTP legacy sigue en `apps/api` durante la migración gradual de contextos; los nuevos ports/adapters de jobs viven aquí. No existe aún una aplicación web; solo se creará `app-meta-ecuapp` cuando una historia frontend concreta lo requiera.


## Estado verificado — 2026-11-08

- Source CI [#42433941375](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42433941375) SUCCESS en `environment/local`, commit `f136cff710fe8c60c8430c82928092320b9d90b5`. La ejecución pasó migraciones/idempotencia, grants de mínimo privilegio, DLX quorum, build, typecheck, pruebas unitarias, integraciones PostgreSQL/RabbitMQ y cleanup de contenedores.
- El consumer diferencia errores de envelope y fallos de persistencia: envelope inválido va a DLQ; job válido con estado durable desconocido fuerza cierre de sesión sin ACK/NACK para redelivery. ACK ambiguo posterior a posible COMMIT tampoco provoca NACK destructivo. Cierres concurrentes de deliveries prefetched están agrupados single-flight.
- Pruebas cubren redelivery real tras pérdida de canal, ACK ambiguo, outage de procesamiento durable, cierre concurrente, expiración de leases y rechazo de fencing tokens obsoletos.
- Métricas: counters/histograms in-memory y `GET /metrics` (loopback por defecto; Bearer remoto + TLS/mTLS y red privada). Source CI #42434224485 SUCCESS validó endpoint; Source CI #42435204662 SUCCESS validó gauges PostgreSQL, migración/idempotencia, build/typecheck/unit/PG/RabbitMQ tests. Gauges SQL de outbox/leases/dead letters/replays usan SECURITY DEFINER con EXECUTE solo dispatcher y muestreo no bloqueante cada 15 s. Se añadieron gauges RabbitMQ de mensajes listos/consumidores de worker queue y DLQ por canal separado; CI de este último slice pendiente. No miden unacked ni consumer lag; faltan dashboards, alertas y SLO.
- Replay administrativo conserva two-person approval, step-up, hash binding y audit; el policy registry sigue vacío y fail-closed hasta que handlers reales demuestren idempotencia de efectos externos.
- El runtime no se declara listo para producción. Pendientes: handlers reales y replay end-to-end, DLQ operator runbook/retención, gauges/alerts/SLO, broker deployment validation, Secret Manager/rotación, TLS/AMQPS reales, carga/DR, revisión independiente y aprobación del propietario. TASK-003 permanece `in_progress`; GO-PRODUCTION NO-GO.

## Observabilidad del runtime de jobs

El proceso expone las métricas Prometheus en `GET /metrics` cuando `TenantJobRuntimeProcess.run()` está activo. Las métricas operativas agregadas se leen desde PostgreSQL cada `TENANT_JOB_METRICS_POLL_INTERVAL_MS` (15 000 ms por defecto), fuera del request path, y no etiquetan ni devuelven IDs de tenants o actores. El listener usa `127.0.0.1:9464` por defecto y no añade labels de tenant, actor, job ni payload.

Para scraping desde otro contenedor/host, configura `TENANT_JOB_METRICS_HOST=0.0.0.0`, un puerto accesible solo desde la red privada y `TENANT_JOB_METRICS_BEARER_TOKEN` con al menos 32 bytes aleatorios. El secreto debe proceder del Secret Manager; Prometheus debe enviarlo como `Authorization: Bearer`. El tráfico remoto debe ir cifrado mediante TLS/mTLS en el service mesh o reverse proxy de confianza: Bearer no cifra HTTP. No expongas el endpoint a Internet ni lo publiques detrás de un proxy sin autenticación.
