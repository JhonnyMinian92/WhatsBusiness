# 60 — Runtime durable de tenant jobs en microservices-meta-ecuapp

**Fecha:** 2026-11-07  
**Rama:** `environment/local`  
**Tarea primaria:** TASK-003 / REQ-0001 / REQ-0010  
**Estado (actualizado 2026-11-08):** runtime durable parcialmente implementado. Source CI #42433941375 terminó SUCCESS en commit `f136cff710fe8c60c8430c82928092320b9d90b5`; verificó migraciones versionadas/idempotencia, privilegios DB, policy DLX, build, typecheck y pruebas unitarias + PostgreSQL/RabbitMQ. Pool A→B, cleanup COMMIT/ROLLBACK, aislamiento concurrente y recuperación/fencing de leases también cuentan con evidencia CI. El consumer evita enviar a DLQ jobs válidos por fallos ambiguos de persistencia o ACK, y agrupa cierres concurrentes. Replay sigue fail-closed porque no hay handlers de negocio con idempotencia externa registrada. TASK-003 permanece `in_progress`; GO-PRODUCTION sigue NO-GO.

## 1. Objetivo y límites

Implementar un runtime asíncrono durable y multi-tenant que publique trabajos creados en la misma transacción del negocio, los procese con entrega at-least-once y evite confirmar ejecución cuando un worker haya perdido su lease.

La raíz backend solicitada es `microservices-meta-ecuapp`. El HTTP foundation Identity/Tenant permanece temporalmente en `apps/api` y se reutiliza por contratos/ports, sin duplicar su DatabaseService, su política de tenant ni sus guards. No se crea `app-meta-ecuapp`: ninguna parte del alcance actual requiere frontend.

La arquitectura de producto sigue siendo modular monolith con procesos worker desplegables por separado cuando sea útil. El nombre del directorio no obliga a crear microservicios HTTP independientes sin métricas y justificación operativa.

## 2. Límites y flujo

```text
API / caso de uso de negocio
  └─ PostgreSQL transaction
       ├─ mutation de negocio
       └─ platform.tenant_job_records (outbox)

Dispatcher (DATABASE_JOB_DISPATCHER_URL)
  ├─ claim + dispatch lease + fencing token
  ├─ RabbitMQ persistent + mandatory + publisher confirm
  └─ mark published only while its lease is valid

RabbitMQ quorum queue
  └─ { version: 1, jobId } — locator only

Worker (DATABASE_JOB_WORKER_URL)
  ├─ canonical context + payload from PostgreSQL
  ├─ claim execution lease + fencing token
  ├─ revalidate actor/tenant/membership via DatabaseService
  └─ handler + inbox + terminal job state in one DB transaction
       └─ RabbitMQ manual ACK after commit

Recovery supervisor
  ├─ expired execution leases
  ├─ expired publisher leases
  └─ published-but-not-observed messages
```

El payload y los IDs de tenant/actor nunca se toman del mensaje AMQP. El mensaje solo localiza el registro durable.

## 3. PostgreSQL y aislamiento

- `0006-tenant-job-outbox.sql`: staging transaccional e idempotencia por tenant/actor/job type/key; hash SHA-256 del request canónico.
- `0007-tenant-job-runtime.sql`: leases separados de dispatch/ejecución, fencing tokens, constraints, inbox, claim, mark/release, complete, fail y recovery.
- `0008-tenant-job-database-roles.sql`: roles de grupo `whatsbusiness_job_dispatcher_role` y `whatsbusiness_job_worker_role`; sin LOGIN ni privilegios de superusuario.
- `0009-tenant-job-lease-renewal.sql`: renueva expiry solo con el fencing token actual y un lease aún vigente; el rol worker es el único que recibe EXECUTE.
- API login: inserta jobs mediante el mismo client de la transacción; no reclama jobs ni puede leer payload.
- Dispatcher login: publica/reconcilia; no lee payload ni reclama ejecución.
- Worker login: resuelve metadata, reclama por jobId opaco, obtiene payload mediante función acotada y completa/falla bajo lease; no reclama publicaciones.
- La autorización de negocio usa el mismo `DatabaseService.withTenantContext` del backend existente. El boundary lo recibe por una factory ligada al pool worker; no implementa un segundo modelo RLS.

Los grants de CI usan passwords sintéticos. Producción debe provisionar logins, rotación y certificados mediante secret manager; no usar los valores CI ni secretos del repositorio.

## 4. Dispatcher y publisher

`TenantJobOutboxDispatcher` reclama lotes acotados mediante `FOR UPDATE SKIP LOCKED`, publica un locator persistente con `mandatory=true`, espera publisher confirm y después marca el outbox row como publicado con el mismo token/lease.

Si publisher devuelve unroutable se bloquea la fila para intervención; los fallos transitorios aplican backoff y liberan lease. Si el dispatcher cae entre confirm y mark-published, el lease expira y puede publicarse un duplicado: el sistema es at-least-once.

## 5. Consumer e idempotencia

El consumer reclama el job en PostgreSQL, obtiene metadata canónica, compara tenant/actor/purpose/correlation y resuelve un handler registrado por `jobType`. El transaction boundary vuelve a establecer y validar el contexto tenant, exige el fencing token, ejecuta el handler y escribe inbox + estado succeeded en la misma transacción.

El adapter RabbitMQ usa manual ACK, prefetch bounded y ACK solo tras resolución del caso de uso. El cierre normal cancela el consumo y espera entregas activas antes de cerrar el canal. Un envelope inválido se NACK sin requeue para evitar loops; el DLX de quorum lo conserva para inspección. Si el envelope es válido pero `consumer.handle` no puede confirmar un resultado durable (por ejemplo, PostgreSQL no disponible), el adapter no hace ACK ni NACK: cierra la sesión worker para que RabbitMQ redeliver. Si el ACK falla después de que el negocio pudo hacer COMMIT, se sigue la misma recuperación sin NACK destructivo. Cierres concurrentes de deliveries prefetched comparten una única operación (`single-flight`).

Un handler no debe hacer llamadas HTTP/Meta ni efectos externos irreversibles dentro de la transacción PostgreSQL. Debe stagear su siguiente comando/outbox en la misma transacción. La entrega exactly-once extremo a extremo no existe; los duplicados siguen siendo posibles y requieren idempotencia en cada frontera.

## 6. RabbitMQ

- Baseline declarada: RabbitMQ 4.4, exchange topic, worker queue quorum y DLQ quorum.
- Publisher confirms, mensajes persistentes y mandatory routing.
- Consumer manual ACK y prefetch limitado.
- La policy de quorum DLX usa `dead-letter-strategy=at-least-once`, `overflow=reject-publish`, DLX/routing key y límite de bytes.
- La policy se configura por definitions/infraestructura y por CI; declarar una queue no demuestra que la policy exista en un cluster administrado.
- Las DLX at-least-once pueden causar duplicados, por lo que el consumer y el operador deben conservar idempotencia.

## 7. Runtime lifecycle y configuración

`TenantJobRuntimeProcess.create` exige handlers reales, URLs de pool dedicadas y RABBITMQ_URL, crea pools dispatcher/worker, recibe el boundary de base de datos a través de `databaseFactory(workerPool)`, aplica rangos a la configuración y obliga a `DB_SSL=true` en producción.

`TenantJobRuntimeApplication` reabre sesiones ante desconexión con backoff exponencial/jitter. Solo reinicia el backoff después de una sesión estable, evitando loops agresivos ante flapping.

Variables de configuración: `microservices-meta-ecuapp/.env.example`. No se incluye password real. El host debe inyectar handlers específicos de la aplicación; el runtime se niega a iniciar sin handlers. La factoría también debe recibir el `DatabaseService` existente, construido con el pool de worker.

## 8. Pruebas agregadas y CI

Suites fuente registradas en Nx:
- Envelope del mensaje y retry policy.
- Dispatcher unitario: publisher confirm, fallo transitorio, unroutable.
- Consumer unitario: handler, contexto, lease y fallo.
- Supervisor: recovery antes de dispatch.
- Application lifecycle: desconexión, reconnect y cierre de sesión.
- Bootstrap: handlers obligatorios, env, TLS y timeout de ejecución acotado.
- Heartbeat/deadline: renovación, pérdida de lease, cancelación cooperativa, timeout y handler que ignora AbortSignal.
- Publisher/consumer RabbitMQ: confirms, unroutable, ACK/NACK y drain; redelivery tras pérdida de canal; errores de procesamiento durable y ACK ambiguo; cierre single-flight bajo fallos concurrentes.
- PostgreSQL gated: roles separados, claims, fencing, renovación de lease con token válido/obsoleto, inbox/rollback, retry, dead-letter, lease expiry, recuperación de dispatch/worker y denegación de acceso directo al payload.
- RabbitMQ gated: quorum queue, confirm, mandatory return y DLX.

Source CI declara PostgreSQL 18.6 y RabbitMQ 4.4 para pruebas de integración. Run #42428439526 (commit 489b8cd) pasó instalación frozen, migraciones 0001–0009 e idempotencia, configuración RabbitMQ DLX, build y typecheck. Fallaron dos integraciones: (1) claim_tenant_job_execution por ambigüedad de tenant_id en RETURNING; (2) publisher RabbitMQ por rechazar routing keys válidas con guion. Los errores de permisos observados en logs corresponden a aserciones negativas esperadas de los roles least-privilege, no a fallos adicionales. Se añadió migración 0010-tenant-job-execution-claim-ambiguity.sql que cualifica columnas y conserva EXECUTE solo para el rol worker; se amplió el validador de routing keys para aceptar jobs.dead y segmentos kebab-case, con prueba unitaria. Run #42429156061 (commit `b96ec893397dda413164edaf56b0914135cee9b0`) falló por `assert.ok(wrongContext)` después de `assert.rejects()`. La aserción se corrigió para validar SQLSTATE `40001` en commit `7b6e2a180a9049054245fa34f2d649269930bd8f`. Source CI #42430321770 superó esa aserción y encontró SQLSTATE `42702` en la recuperación: variable RECORD `job` colisionaba con alias SQL `job`. La migración `0011-tenant-job-recovery-variable-ambiguity.sql` renombró la variable a `execution_row`. Source CI #42430605576 terminó SUCCESS, incluyendo PostgreSQL y RabbitMQ.

## 9. Pendientes reales para cerrar TASK-003

- [x] Source CI #42430605576 SUCCESS en commit `be9d3dc14aa26b38c20013b98ff5238bac564a4e`: instalación frozen, migraciones 0001–0011/idempotencia, build, typecheck, unit, PostgreSQL y RabbitMQ.
- [x] Source CI #42431419028 SUCCESS en commit `bcedfab0538f5ee82a06ffe2480f41e3378bab7e`: prueba A→B con el `DatabaseService` real y misma conexión física pasó.
- [x] Source CI #42431530685 SUCCESS para commit `6059822896987fc618c479d53117354e1a785144`: cleanup de `app.tenant_id` y `app.user_id` tras ROLLBACK también pasó, además de A→B sobre el mismo `pg_backend_pid()`.
- [x] Source CI #42432745586 SUCCESS para commit `6c93efdfea0cef7f1819402ab872e439ef858ccd`: prueba simultánea de tenant A/B con dos conexiones físicas, GUC aislados y RLS; migraciones 0012/0013; policy registry fail-closed; privilegios API restringidos; build, typecheck e integraciones completas.
- [x] Source CI #42431419028 SUCCESS para commit `bcedfab0538f5ee82a06ffe2480f41e3378bab7e`: `DatabaseService` real, `Pool.max=1`, mismo `pg_backend_pid()` en tenant A→B y GUC limpios tras COMMIT.
- [x] Source CI #42431530685 SUCCESS para commit `6059822896987fc618c479d53117354e1a785144`: la prueba anterior también fuerza ROLLBACK por excepción y verifica que `app.user_id`/`app.tenant_id` quedan limpios.
- [ ] Regresión de transacciones concurrentes A/B añadida en commit `9b497d0805b53f79e658fd874d0ebfbec3863b12`; valida conexiones físicas distintas, GUC independientes y visibilidad RLS de un único tenant. Source CI de este commit pendiente de verificación.
- [x] Implementar heartbeat/renew del execution lease mediante token de fencing y PostgreSQL; el worker cancela cooperativamente el handler si pierde el lease. La suite unitaria e integración quedan sujetas a Source CI.
- [x] Añadir deadline configurable `TENANT_JOB_HANDLER_TIMEOUT_MS` (1–900 s; default 300 s), abortar el handler y rechazar el procesamiento al perder lease o exceder el deadline. La cancelación exige cooperación del handler mediante AbortSignal; JavaScript no puede terminar forzosamente una promesa no cooperativa. Build/typecheck de #42428439526 pasaron; integración posterior pendiente.
- [x] Implementar plumbing de replay administrativo con permiso crítico, aprobación de dos personas y step-up, request hash-bound, registro append-only, auditoría, creación de child job inmutable y SQL SECURITY DEFINER que clona payload sin exponerlo al rol API. Source CI #42432745586 SUCCESS (migraciones 0012–0013, build, typecheck, unit e integraciones).
- [ ] Registrar policies de replay solo para handlers reales que prueben idempotencia mediante stable domain-effect key; el registry de producción permanece vacío y rechaza por defecto todos los tipos.
- [ ] Validar el flujo end-to-end de replay con un handler real registrado, approvals quorum, consumo, auditoría, publicación al broker y efecto de negocio idempotente.
- [ ] Implementar lease/lock y replay seguro de broker DLQ, retención, acceso restringido y audit.
- [x] Métricas Prometheus in-memory con contadores/histogramas y allowlists de outcomes fijos; sin labels de tenant, actor, job ni payload. Source CI #42433578446 SUCCESS (la cobertura se mantiene en commits posteriores).
- [x] Endpoint HTTP `/metrics` integrado al lifecycle, loopback por defecto y bearer para binding remoto; Source CI #403 SUCCESS para build/typecheck/suite HTTP.
- [x] Gauges PostgreSQL agregados para pending/blocked dispatch, leases activos/expirados, dead-letter jobs, edad de pending más antiguo y replayed jobs; función SECURITY DEFINER con EXECUTE solo dispatcher. Tests escritos; CI de este slice pendiente.
- [x] Leer `messageCount`/`consumerCount` de worker queue y DLQ por un canal RabbitMQ dedicado, sin consumir mensajes; suite unitaria + integración real añadidas. CI de este slice pendiente.
- [x] Counters/histograms Prometheus, `/metrics` autenticado y gauges PostgreSQL agregados sin IDs ni payloads.
- [x] Endpoint Prometheus y gauges PostgreSQL verificados por Source CI #403/#432.
- [x] Reader RabbitMQ cambiado a Management HTTP API con identidad `monitoring` dedicada y permisos AMQP vacíos, HTTPS remoto, Basic auth y timeout abortable. CodeQL #6 SUCCESS; Source CI #466 pendiente.
- [x] Dashboard Grafana, alert rules y runbook versionados; aún no desplegados en stack real.
- [x] Dashboard Grafana JSON, reglas Prometheus y runbook versionados; aún no importados/probados en el stack real.
- [ ] Añadir métrica autoritativa de unacked/consumer lag, validar alert routing/SLO y umbrales con carga.
- [x] Probar pérdida de canal y redelivery real RabbitMQ; error de persistencia en job válido; ACK ambiguo después del commit; cierres concurrentes single-flight; expiración de execution/dispatch leases y fencing de tokens viejos. Source CI #42433941375 SUCCESS para commit `f136cff710fe8c60c8430c82928092320b9d90b5`.
- [ ] Extender crash tests para todas las ventanas publish/confirm/mark, recovery concurrente bajo carga y fault injection con infraestructura de deployment.
- [ ] Validar topology/policy en un deployment RabbitMQ real; CI no sustituye infraestructura de producción.
- [ ] Registrar handlers de negocio reales, conectados a casos de uso/Meta adapters; no iniciar el worker solo con handlers ficticios.
- [ ] Revisar seguridad/arquitectura independiente y obtener aceptación del propietario.

TASK-003 sigue `in_progress`; el código disponible es una base avanzada, no 100% del backend de producto.

## 10. Próximos dominios backend

Con TASK-003 verificada y accepted, el siguiente orden es: TASK-027 Webhook Gateway/inbox para eventos entrantes; TASK-028 Event Bus/DLQ/replay reutilizando la infraestructura; después Meta Control Plane TASK-006..010 y WhatsApp TASK-011..018. Los handlers de jobs deben emerger de esos casos de uso reales, no de ejemplos no conectados a producto.

### Regresión A→B y rollback de tenant context (2026-11-08)

La prueba API `apps/api/src/platform/database/database.context.integration.spec.ts` utiliza el `DatabaseService` productivo. Source CI #42431419028 verificó tenant A→B secuencial sobre el mismo `pg_backend_pid()`; Source CI #42431530685 verificó además la limpieza de `app.tenant_id`/`app.user_id` tras COMMIT y ROLLBACK por excepción. La regresión añadida en commit `9b497d0805b53f79e658fd874d0ebfbec3863b12` mantiene dos transacciones A/B abiertas en paralelo, comprueba que ocupan conexiones físicas distintas, que cada una conserva su propio actor/tenant y que RLS solo devuelve el tenant autorizado. Su Source CI aún no está verificado.

### Migración 0011 — recuperación de leases (2026-11-07)

Source CI #42430321770 (commit `7b6e2a180a9049054245fa34f2d649269930bd8f`) pasó la aserción cross-tenant SQLSTATE `40001` y luego encontró SQLSTATE `42702`: la variable RECORD local `job` colisionaba con alias SQL `job` dentro de las CTE de recuperación. La migración `0011-tenant-job-recovery-variable-ambiguity.sql` cambió el nombre de la variable a `execution_row` y conservó los permisos gestionados por la migración 0008.

Source CI #42430605576 terminó SUCCESS en commit `be9d3dc14aa26b38c20013b98ff5238bac564a4e`; las integraciones PostgreSQL y RabbitMQ pasaron.
### Replay administrativo con aprobación y auditoría (2026-11-08)

Se incorporaron las migraciones `0012-tenant-job-approved-replay.sql` y `0013-tenant-job-approved-replay-boundary.sql`. La solicitud captura un snapshot inmutable de source job y policy version dentro de la misma transacción de aprobación. Se exige permiso crítico `jobs.replay.request`, quorum de dos aprobadores independientes y step-up, binding hash exacto de tenant/acción/purpose/job/estado/error/intentos/policy version, consumo de aprobación y audit event `approval_consumed` coincidentes. El replay crea una nueva fila ligada por FK compuesta a source y approval, sin reabrir/modificar el job terminal original.

El rol `whatsbusiness_app` no puede leer `payload` ni insertar genealogía de replay. La función SQL `SECURITY DEFINER` verifica tenant/actor, source exhausted dead-letter, snapshot, approval consumida, hash y audit event, y clona el payload internamente en PostgreSQL. El repositorio TypeScript usa un port e invoca esa función; idempotencia evita crear un segundo replay por la misma aprobación. Routes agregadas en `apps/api/src/platform/jobs/tenant-job-replay.controller.ts`.

**Límite deliberado:** `TenantJobReplayPolicyRegistry` se instancia vacío. El test unitario verifica que solicitudes sin policy explícita para un handler que use stable domain-effect idempotency se rechazan antes de crear una aprobación. No hay aún handlers reales elegibles; por ello el replay está implementado como capacidad controlada, pero no habilitado para jobs de negocio.

Source CI #42432745586 SUCCESS para commit `6c93efdfea0cef7f1819402ab872e439ef858ccd`: migraciones 0012–0013/idempotencia, build, typecheck, pruebas unitarias y suites PostgreSQL/RabbitMQ. Incluye verificación con el rol API real de que payload y genealogía no son accesibles/escribibles, pero sí puede ejecutarse la función aprobada.

## 11. Handoff de fiabilidad RabbitMQ, métricas y fencing (2026-11-08)

**Código verificado:** Source CI [#42433941375](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42433941375) terminó SUCCESS en commit `f136cff710fe8c60c8430c82928092320b9d90b5`. La ejecución completó instalación frozen, provisioning de roles DB, migraciones versionadas e idempotencia, política quorum DLX, build, typecheck, suite unitaria e integraciones PostgreSQL/RabbitMQ.

Cambios y regresiones cubiertas en la punta verificada:
- `RabbitMqTenantJobConsumerAdapter` diferencia un envelope inválido de un procesamiento durable interrumpido. Solo el envelope inválido va a DLQ con NACK sin requeue. Si el mensaje es válido pero el procesamiento no pudo confirmar su estado durable, cierra la sesión completa sin ACK/NACK para permitir redelivery.
- Un fallo del ACK después de que el caso de uso pudo confirmar su transacción no provoca NACK ni dead-letter de un job posiblemente completado; la sesión se cierra y la entrega queda sujeta a redelivery/idempotencia.
- Los cierres simultáneos de varios deliveries prefetched se agrupan en una misma promesa single-flight. Tests verifican dos fallos concurrentes y una única invocación de cierre.
- RabbitMQ real: prueba gated de pérdida del canal con un mensaje persistente y comprobación de redelivery.
- PostgreSQL real: recuperación de execution/dispatch leases expirados; fencing de tokens antiguos que impide renew/complete/mark publicados; completion e inbox transaccionales.
- Prometheus: counters/histograms in-memory con outcomes allowlisted, más endpoint `GET /metrics` (loopback por defecto; bearer remoto + TLS/mTLS y red privada). Gauges PostgreSQL agregados implementados; el muestreo está aislado y no bloquea recovery/dispatch.

**Limitaciones que siguen abiertas:** el runtime no registra handlers de negocio Meta/CRM; el registry de replay continúa vacío y fail-closed. No se ha demostrado todavía replay end-to-end con handler real ni idempotencia de efectos externos. El adapter Prometheus ya tiene endpoint de scrape, gauges PostgreSQL y conteos RabbitMQ de mensajes listos/consumidores para worker queue y DLQ. Siguen pendientes mensajes unacknowledged/consumer lag autoritativo, importación/validación del dashboard y alert rules, alert routing y SLO. Tampoco existe evidencia de topology/policies en un cluster RabbitMQ productivo, secret manager/rotación, pruebas de carga/DR, revisión independiente ni aceptación final del propietario. TASK-003 continúa `in_progress` y GO-PRODUCTION permanece NO-GO.

## 13. Exposición HTTP de métricas Prometheus

Se añadió `TenantJobMetricsHttpServer` en infraestructura y se conectó al ciclo de vida de `TenantJobRuntimeProcess`. El worker inicia el listener junto con el runtime y lo cierra durante shutdown. Solo responde a `GET /metrics`; rutas desconocidas devuelven 404, otros métodos 405, autenticación ausente/incorrecta 401 y fallos del renderer 500 genérico.

La configuración usa `TENANT_JOB_METRICS_HOST=127.0.0.1` y `TENANT_JOB_METRICS_PORT=9464` por defecto. Un binding fuera de loopback exige `TENANT_JOB_METRICS_BEARER_TOKEN` con al menos 32 bytes; la comparación usa `timingSafeEqual`. Para contenedores, limitar el puerto a la red de monitorización privada y suministrar el token mediante Secret Manager. No se incorporan labels de tenant, actor, job ni payload.

El nuevo test cubre GET/404/405, headers, bearer token, binding remoto sin token, renderer fallido, doble startup y cierre idempotente. Está agregado a `microservices-meta-ecuapp:test`. Source CI [#42434224485](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42434224485) terminó SUCCESS para commit `abbc86cfbd72e89ab5db82b0e3207159a66eba71`, incluyendo build, typecheck y esta suite.

El endpoint sirve counters/histograms in-memory, gauges agregados PostgreSQL y conteos de mensajes listos/consumidores de RabbitMQ. El reader RabbitMQ usa la Management HTTP API con una identidad `monitoring` dedicada y permisos AMQP vacíos; no comparte conexión/canal con worker. Sus conteos son `messages_ready`, `messages_unacknowledged` y `consumers`; son métricas distintas y no representan por sí solas consumer lag ni edad del mensaje. Todavía faltan medición autoritativa de unacked/lag, validación de alert routing/SLO, importación del dashboard y reglas en stack Prometheus/Grafana real y validación de scraping en la topología desplegada. TASK-003 sigue `in_progress`; GO-PRODUCTION permanece NO-GO.

## 14. Gauges operativos agregados desde PostgreSQL

La migración `microservices-meta-ecuapp/migrations/0015-tenant-job-runtime-metrics.sql` crea `platform.read_tenant_job_runtime_metrics()`. Es una función `SECURITY DEFINER` con `search_path` fijado y devuelve únicamente agregados globales: dispatch pending/blocked, leases de dispatcher y worker activos/expirados, jobs dead-letter, edad del pending más antiguo y jobs replayed. Nunca devuelve tenant ID, actor ID, correlation ID, job ID ni payload.

El único rol con `EXECUTE` es `whatsbusiness_job_dispatcher_role`. `whatsbusiness_app` y `whatsbusiness_job_worker_role` no pueden ejecutar la función; el dispatcher tampoco tiene `SELECT` directo de `platform.tenant_job_records`. El diseño usa un pool independiente de métricas con una sola conexión y timeouts de conexión/consulta, autenticado con el rol dispatcher; no compite con el pool de despacho y no amplía permisos de API o worker.

`PostgresTenantJobRuntimeMetricsReader` valida contadores como enteros seguros y el valor de antigüedad como número finito no negativo. `TenantJobRuntimeSupervisor` actualiza el snapshot cada 15 s por defecto (`TENANT_JOB_METRICS_POLL_INTERVAL_MS`); un fallo de lectura se registra y nunca impide recovery/dispatch. Los gauges se exponen sin labels y permanecen cacheados entre scrapes.

Se añadieron suites del exporter, reader y supervisor, además de comprobaciones gated en la integración PostgreSQL para privilegios y delta de jobs pending. **Source CI #42435204662 terminó SUCCESS** para migración/reader/gauges PostgreSQL.

Quedan fuera de este slice los mensajes unacknowledged y el consumer lag autoritativo, dashboards, reglas de alertas y SLO. TASK-003 continúa `in_progress`; GO-PRODUCTION permanece NO-GO.

## 15. Métricas RabbitMQ listas y consumidores

`RabbitMqManagementTenantJobQueueMetricsReader` consulta la Management HTTP API en dos GET paralelos a `/api/queues/{vhost}/{queue}` para leer `messages_ready`, `messages_unacknowledged` y `consumers` de worker queue y DLQ. Requiere `RABBITMQ_MANAGEMENT_URL`, `RABBITMQ_MONITORING_USERNAME` y `RABBITMQ_MONITORING_PASSWORD`; la identidad debe tener tag `monitoring` y permisos AMQP vacíos (`configure/read/write` regex `^# 60 — Runtime durable de tenant jobs en microservices-meta-ecuapp

**Fecha:** 2026-11-07  
**Rama:** `environment/local`  
**Tarea primaria:** TASK-003 / REQ-0001 / REQ-0010  
**Estado (actualizado 2026-11-08):** runtime durable parcialmente implementado. Source CI #42433941375 terminó SUCCESS en commit `f136cff710fe8c60c8430c82928092320b9d90b5`; verificó migraciones versionadas/idempotencia, privilegios DB, policy DLX, build, typecheck y pruebas unitarias + PostgreSQL/RabbitMQ. Pool A→B, cleanup COMMIT/ROLLBACK, aislamiento concurrente y recuperación/fencing de leases también cuentan con evidencia CI. El consumer evita enviar a DLQ jobs válidos por fallos ambiguos de persistencia o ACK, y agrupa cierres concurrentes. Replay sigue fail-closed porque no hay handlers de negocio con idempotencia externa registrada. TASK-003 permanece `in_progress`; GO-PRODUCTION sigue NO-GO.

## 1. Objetivo y límites

Implementar un runtime asíncrono durable y multi-tenant que publique trabajos creados en la misma transacción del negocio, los procese con entrega at-least-once y evite confirmar ejecución cuando un worker haya perdido su lease.

La raíz backend solicitada es `microservices-meta-ecuapp`. El HTTP foundation Identity/Tenant permanece temporalmente en `apps/api` y se reutiliza por contratos/ports, sin duplicar su DatabaseService, su política de tenant ni sus guards. No se crea `app-meta-ecuapp`: ninguna parte del alcance actual requiere frontend.

La arquitectura de producto sigue siendo modular monolith con procesos worker desplegables por separado cuando sea útil. El nombre del directorio no obliga a crear microservicios HTTP independientes sin métricas y justificación operativa.

## 2. Límites y flujo

```text
API / caso de uso de negocio
  └─ PostgreSQL transaction
       ├─ mutation de negocio
       └─ platform.tenant_job_records (outbox)

Dispatcher (DATABASE_JOB_DISPATCHER_URL)
  ├─ claim + dispatch lease + fencing token
  ├─ RabbitMQ persistent + mandatory + publisher confirm
  └─ mark published only while its lease is valid

RabbitMQ quorum queue
  └─ { version: 1, jobId } — locator only

Worker (DATABASE_JOB_WORKER_URL)
  ├─ canonical context + payload from PostgreSQL
  ├─ claim execution lease + fencing token
  ├─ revalidate actor/tenant/membership via DatabaseService
  └─ handler + inbox + terminal job state in one DB transaction
       └─ RabbitMQ manual ACK after commit

Recovery supervisor
  ├─ expired execution leases
  ├─ expired publisher leases
  └─ published-but-not-observed messages
```

El payload y los IDs de tenant/actor nunca se toman del mensaje AMQP. El mensaje solo localiza el registro durable.

## 3. PostgreSQL y aislamiento

- `0006-tenant-job-outbox.sql`: staging transaccional e idempotencia por tenant/actor/job type/key; hash SHA-256 del request canónico.
- `0007-tenant-job-runtime.sql`: leases separados de dispatch/ejecución, fencing tokens, constraints, inbox, claim, mark/release, complete, fail y recovery.
- `0008-tenant-job-database-roles.sql`: roles de grupo `whatsbusiness_job_dispatcher_role` y `whatsbusiness_job_worker_role`; sin LOGIN ni privilegios de superusuario.
- `0009-tenant-job-lease-renewal.sql`: renueva expiry solo con el fencing token actual y un lease aún vigente; el rol worker es el único que recibe EXECUTE.
- API login: inserta jobs mediante el mismo client de la transacción; no reclama jobs ni puede leer payload.
- Dispatcher login: publica/reconcilia; no lee payload ni reclama ejecución.
- Worker login: resuelve metadata, reclama por jobId opaco, obtiene payload mediante función acotada y completa/falla bajo lease; no reclama publicaciones.
- La autorización de negocio usa el mismo `DatabaseService.withTenantContext` del backend existente. El boundary lo recibe por una factory ligada al pool worker; no implementa un segundo modelo RLS.

Los grants de CI usan passwords sintéticos. Producción debe provisionar logins, rotación y certificados mediante secret manager; no usar los valores CI ni secretos del repositorio.

## 4. Dispatcher y publisher

`TenantJobOutboxDispatcher` reclama lotes acotados mediante `FOR UPDATE SKIP LOCKED`, publica un locator persistente con `mandatory=true`, espera publisher confirm y después marca el outbox row como publicado con el mismo token/lease.

Si publisher devuelve unroutable se bloquea la fila para intervención; los fallos transitorios aplican backoff y liberan lease. Si el dispatcher cae entre confirm y mark-published, el lease expira y puede publicarse un duplicado: el sistema es at-least-once.

## 5. Consumer e idempotencia

El consumer reclama el job en PostgreSQL, obtiene metadata canónica, compara tenant/actor/purpose/correlation y resuelve un handler registrado por `jobType`. El transaction boundary vuelve a establecer y validar el contexto tenant, exige el fencing token, ejecuta el handler y escribe inbox + estado succeeded en la misma transacción.

El adapter RabbitMQ usa manual ACK, prefetch bounded y ACK solo tras resolución del caso de uso. El cierre normal cancela el consumo y espera entregas activas antes de cerrar el canal. Un envelope inválido se NACK sin requeue para evitar loops; el DLX de quorum lo conserva para inspección. Si el envelope es válido pero `consumer.handle` no puede confirmar un resultado durable (por ejemplo, PostgreSQL no disponible), el adapter no hace ACK ni NACK: cierra la sesión worker para que RabbitMQ redeliver. Si el ACK falla después de que el negocio pudo hacer COMMIT, se sigue la misma recuperación sin NACK destructivo. Cierres concurrentes de deliveries prefetched comparten una única operación (`single-flight`).

Un handler no debe hacer llamadas HTTP/Meta ni efectos externos irreversibles dentro de la transacción PostgreSQL. Debe stagear su siguiente comando/outbox en la misma transacción. La entrega exactly-once extremo a extremo no existe; los duplicados siguen siendo posibles y requieren idempotencia en cada frontera.

## 6. RabbitMQ

- Baseline declarada: RabbitMQ 4.4, exchange topic, worker queue quorum y DLQ quorum.
- Publisher confirms, mensajes persistentes y mandatory routing.
- Consumer manual ACK y prefetch limitado.
- La policy de quorum DLX usa `dead-letter-strategy=at-least-once`, `overflow=reject-publish`, DLX/routing key y límite de bytes.
- La policy se configura por definitions/infraestructura y por CI; declarar una queue no demuestra que la policy exista en un cluster administrado.
- Las DLX at-least-once pueden causar duplicados, por lo que el consumer y el operador deben conservar idempotencia.

## 7. Runtime lifecycle y configuración

`TenantJobRuntimeProcess.create` exige handlers reales, URLs de pool dedicadas y RABBITMQ_URL, crea pools dispatcher/worker, recibe el boundary de base de datos a través de `databaseFactory(workerPool)`, aplica rangos a la configuración y obliga a `DB_SSL=true` en producción.

`TenantJobRuntimeApplication` reabre sesiones ante desconexión con backoff exponencial/jitter. Solo reinicia el backoff después de una sesión estable, evitando loops agresivos ante flapping.

Variables de configuración: `microservices-meta-ecuapp/.env.example`. No se incluye password real. El host debe inyectar handlers específicos de la aplicación; el runtime se niega a iniciar sin handlers. La factoría también debe recibir el `DatabaseService` existente, construido con el pool de worker.

## 8. Pruebas agregadas y CI

Suites fuente registradas en Nx:
- Envelope del mensaje y retry policy.
- Dispatcher unitario: publisher confirm, fallo transitorio, unroutable.
- Consumer unitario: handler, contexto, lease y fallo.
- Supervisor: recovery antes de dispatch.
- Application lifecycle: desconexión, reconnect y cierre de sesión.
- Bootstrap: handlers obligatorios, env, TLS y timeout de ejecución acotado.
- Heartbeat/deadline: renovación, pérdida de lease, cancelación cooperativa, timeout y handler que ignora AbortSignal.
- Publisher/consumer RabbitMQ: confirms, unroutable, ACK/NACK y drain; redelivery tras pérdida de canal; errores de procesamiento durable y ACK ambiguo; cierre single-flight bajo fallos concurrentes.
- PostgreSQL gated: roles separados, claims, fencing, renovación de lease con token válido/obsoleto, inbox/rollback, retry, dead-letter, lease expiry, recuperación de dispatch/worker y denegación de acceso directo al payload.
- RabbitMQ gated: quorum queue, confirm, mandatory return y DLX.

Source CI declara PostgreSQL 18.6 y RabbitMQ 4.4 para pruebas de integración. Run #42428439526 (commit 489b8cd) pasó instalación frozen, migraciones 0001–0009 e idempotencia, configuración RabbitMQ DLX, build y typecheck. Fallaron dos integraciones: (1) claim_tenant_job_execution por ambigüedad de tenant_id en RETURNING; (2) publisher RabbitMQ por rechazar routing keys válidas con guion. Los errores de permisos observados en logs corresponden a aserciones negativas esperadas de los roles least-privilege, no a fallos adicionales. Se añadió migración 0010-tenant-job-execution-claim-ambiguity.sql que cualifica columnas y conserva EXECUTE solo para el rol worker; se amplió el validador de routing keys para aceptar jobs.dead y segmentos kebab-case, con prueba unitaria. Run #42429156061 (commit `b96ec893397dda413164edaf56b0914135cee9b0`) falló por `assert.ok(wrongContext)` después de `assert.rejects()`. La aserción se corrigió para validar SQLSTATE `40001` en commit `7b6e2a180a9049054245fa34f2d649269930bd8f`. Source CI #42430321770 superó esa aserción y encontró SQLSTATE `42702` en la recuperación: variable RECORD `job` colisionaba con alias SQL `job`. La migración `0011-tenant-job-recovery-variable-ambiguity.sql` renombró la variable a `execution_row`. Source CI #42430605576 terminó SUCCESS, incluyendo PostgreSQL y RabbitMQ.

## 9. Pendientes reales para cerrar TASK-003

- [x] Source CI #42430605576 SUCCESS en commit `be9d3dc14aa26b38c20013b98ff5238bac564a4e`: instalación frozen, migraciones 0001–0011/idempotencia, build, typecheck, unit, PostgreSQL y RabbitMQ.
- [x] Source CI #42431419028 SUCCESS en commit `bcedfab0538f5ee82a06ffe2480f41e3378bab7e`: prueba A→B con el `DatabaseService` real y misma conexión física pasó.
- [x] Source CI #42431530685 SUCCESS para commit `6059822896987fc618c479d53117354e1a785144`: cleanup de `app.tenant_id` y `app.user_id` tras ROLLBACK también pasó, además de A→B sobre el mismo `pg_backend_pid()`.
- [x] Source CI #42432745586 SUCCESS para commit `6c93efdfea0cef7f1819402ab872e439ef858ccd`: prueba simultánea de tenant A/B con dos conexiones físicas, GUC aislados y RLS; migraciones 0012/0013; policy registry fail-closed; privilegios API restringidos; build, typecheck e integraciones completas.
- [x] Source CI #42431419028 SUCCESS para commit `bcedfab0538f5ee82a06ffe2480f41e3378bab7e`: `DatabaseService` real, `Pool.max=1`, mismo `pg_backend_pid()` en tenant A→B y GUC limpios tras COMMIT.
- [x] Source CI #42431530685 SUCCESS para commit `6059822896987fc618c479d53117354e1a785144`: la prueba anterior también fuerza ROLLBACK por excepción y verifica que `app.user_id`/`app.tenant_id` quedan limpios.
- [ ] Regresión de transacciones concurrentes A/B añadida en commit `9b497d0805b53f79e658fd874d0ebfbec3863b12`; valida conexiones físicas distintas, GUC independientes y visibilidad RLS de un único tenant. Source CI de este commit pendiente de verificación.
- [x] Implementar heartbeat/renew del execution lease mediante token de fencing y PostgreSQL; el worker cancela cooperativamente el handler si pierde el lease. La suite unitaria e integración quedan sujetas a Source CI.
- [x] Añadir deadline configurable `TENANT_JOB_HANDLER_TIMEOUT_MS` (1–900 s; default 300 s), abortar el handler y rechazar el procesamiento al perder lease o exceder el deadline. La cancelación exige cooperación del handler mediante AbortSignal; JavaScript no puede terminar forzosamente una promesa no cooperativa. Build/typecheck de #42428439526 pasaron; integración posterior pendiente.
- [x] Implementar plumbing de replay administrativo con permiso crítico, aprobación de dos personas y step-up, request hash-bound, registro append-only, auditoría, creación de child job inmutable y SQL SECURITY DEFINER que clona payload sin exponerlo al rol API. Source CI #42432745586 SUCCESS (migraciones 0012–0013, build, typecheck, unit e integraciones).
- [ ] Registrar policies de replay solo para handlers reales que prueben idempotencia mediante stable domain-effect key; el registry de producción permanece vacío y rechaza por defecto todos los tipos.
- [ ] Validar el flujo end-to-end de replay con un handler real registrado, approvals quorum, consumo, auditoría, publicación al broker y efecto de negocio idempotente.
- [ ] Implementar lease/lock y replay seguro de broker DLQ, retención, acceso restringido y audit.
- [x] Métricas Prometheus in-memory con contadores/histogramas y allowlists de outcomes fijos; sin labels de tenant, actor, job ni payload. Source CI #42433578446 SUCCESS (la cobertura se mantiene en commits posteriores).
- [x] Endpoint HTTP `/metrics` integrado al lifecycle, loopback por defecto y bearer para binding remoto; Source CI #403 SUCCESS para build/typecheck/suite HTTP.
- [x] Gauges PostgreSQL agregados para pending/blocked dispatch, leases activos/expirados, dead-letter jobs, edad de pending más antiguo y replayed jobs; función SECURITY DEFINER con EXECUTE solo dispatcher. Tests escritos; CI de este slice pendiente.
- [x] Leer `messageCount`/`consumerCount` de worker queue y DLQ por un canal RabbitMQ dedicado, sin consumir mensajes; suite unitaria + integración real añadidas. CI de este slice pendiente.
- [x] Counters/histograms Prometheus, `/metrics` autenticado y gauges PostgreSQL agregados sin IDs ni payloads.
- [x] Endpoint Prometheus y gauges PostgreSQL verificados por Source CI #403/#432.
- [x] Reader RabbitMQ cambiado a Management HTTP API con identidad `monitoring` dedicada y permisos AMQP vacíos, HTTPS remoto, Basic auth y timeout abortable. CodeQL #6 SUCCESS; Source CI #466 pendiente.
- [x] Dashboard Grafana, alert rules y runbook versionados; aún no desplegados en stack real.
- [x] Dashboard Grafana JSON, reglas Prometheus y runbook versionados; aún no importados/probados en el stack real.
- [ ] Añadir métrica autoritativa de unacked/consumer lag, validar alert routing/SLO y umbrales con carga.
- [x] Probar pérdida de canal y redelivery real RabbitMQ; error de persistencia en job válido; ACK ambiguo después del commit; cierres concurrentes single-flight; expiración de execution/dispatch leases y fencing de tokens viejos. Source CI #42433941375 SUCCESS para commit `f136cff710fe8c60c8430c82928092320b9d90b5`.
- [ ] Extender crash tests para todas las ventanas publish/confirm/mark, recovery concurrente bajo carga y fault injection con infraestructura de deployment.
- [ ] Validar topology/policy en un deployment RabbitMQ real; CI no sustituye infraestructura de producción.
- [ ] Registrar handlers de negocio reales, conectados a casos de uso/Meta adapters; no iniciar el worker solo con handlers ficticios.
- [ ] Revisar seguridad/arquitectura independiente y obtener aceptación del propietario.

TASK-003 sigue `in_progress`; el código disponible es una base avanzada, no 100% del backend de producto.

## 10. Próximos dominios backend

Con TASK-003 verificada y accepted, el siguiente orden es: TASK-027 Webhook Gateway/inbox para eventos entrantes; TASK-028 Event Bus/DLQ/replay reutilizando la infraestructura; después Meta Control Plane TASK-006..010 y WhatsApp TASK-011..018. Los handlers de jobs deben emerger de esos casos de uso reales, no de ejemplos no conectados a producto.

### Regresión A→B y rollback de tenant context (2026-11-08)

La prueba API `apps/api/src/platform/database/database.context.integration.spec.ts` utiliza el `DatabaseService` productivo. Source CI #42431419028 verificó tenant A→B secuencial sobre el mismo `pg_backend_pid()`; Source CI #42431530685 verificó además la limpieza de `app.tenant_id`/`app.user_id` tras COMMIT y ROLLBACK por excepción. La regresión añadida en commit `9b497d0805b53f79e658fd874d0ebfbec3863b12` mantiene dos transacciones A/B abiertas en paralelo, comprueba que ocupan conexiones físicas distintas, que cada una conserva su propio actor/tenant y que RLS solo devuelve el tenant autorizado. Su Source CI aún no está verificado.

### Migración 0011 — recuperación de leases (2026-11-07)

Source CI #42430321770 (commit `7b6e2a180a9049054245fa34f2d649269930bd8f`) pasó la aserción cross-tenant SQLSTATE `40001` y luego encontró SQLSTATE `42702`: la variable RECORD local `job` colisionaba con alias SQL `job` dentro de las CTE de recuperación. La migración `0011-tenant-job-recovery-variable-ambiguity.sql` cambió el nombre de la variable a `execution_row` y conservó los permisos gestionados por la migración 0008.

Source CI #42430605576 terminó SUCCESS en commit `be9d3dc14aa26b38c20013b98ff5238bac564a4e`; las integraciones PostgreSQL y RabbitMQ pasaron.
### Replay administrativo con aprobación y auditoría (2026-11-08)

Se incorporaron las migraciones `0012-tenant-job-approved-replay.sql` y `0013-tenant-job-approved-replay-boundary.sql`. La solicitud captura un snapshot inmutable de source job y policy version dentro de la misma transacción de aprobación. Se exige permiso crítico `jobs.replay.request`, quorum de dos aprobadores independientes y step-up, binding hash exacto de tenant/acción/purpose/job/estado/error/intentos/policy version, consumo de aprobación y audit event `approval_consumed` coincidentes. El replay crea una nueva fila ligada por FK compuesta a source y approval, sin reabrir/modificar el job terminal original.

El rol `whatsbusiness_app` no puede leer `payload` ni insertar genealogía de replay. La función SQL `SECURITY DEFINER` verifica tenant/actor, source exhausted dead-letter, snapshot, approval consumida, hash y audit event, y clona el payload internamente en PostgreSQL. El repositorio TypeScript usa un port e invoca esa función; idempotencia evita crear un segundo replay por la misma aprobación. Routes agregadas en `apps/api/src/platform/jobs/tenant-job-replay.controller.ts`.

**Límite deliberado:** `TenantJobReplayPolicyRegistry` se instancia vacío. El test unitario verifica que solicitudes sin policy explícita para un handler que use stable domain-effect idempotency se rechazan antes de crear una aprobación. No hay aún handlers reales elegibles; por ello el replay está implementado como capacidad controlada, pero no habilitado para jobs de negocio.

Source CI #42432745586 SUCCESS para commit `6c93efdfea0cef7f1819402ab872e439ef858ccd`: migraciones 0012–0013/idempotencia, build, typecheck, pruebas unitarias y suites PostgreSQL/RabbitMQ. Incluye verificación con el rol API real de que payload y genealogía no son accesibles/escribibles, pero sí puede ejecutarse la función aprobada.

## 11. Handoff de fiabilidad RabbitMQ, métricas y fencing (2026-11-08)

**Código verificado:** Source CI [#42433941375](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42433941375) terminó SUCCESS en commit `f136cff710fe8c60c8430c82928092320b9d90b5`. La ejecución completó instalación frozen, provisioning de roles DB, migraciones versionadas e idempotencia, política quorum DLX, build, typecheck, suite unitaria e integraciones PostgreSQL/RabbitMQ.

Cambios y regresiones cubiertas en la punta verificada:
- `RabbitMqTenantJobConsumerAdapter` diferencia un envelope inválido de un procesamiento durable interrumpido. Solo el envelope inválido va a DLQ con NACK sin requeue. Si el mensaje es válido pero el procesamiento no pudo confirmar su estado durable, cierra la sesión completa sin ACK/NACK para permitir redelivery.
- Un fallo del ACK después de que el caso de uso pudo confirmar su transacción no provoca NACK ni dead-letter de un job posiblemente completado; la sesión se cierra y la entrega queda sujeta a redelivery/idempotencia.
- Los cierres simultáneos de varios deliveries prefetched se agrupan en una misma promesa single-flight. Tests verifican dos fallos concurrentes y una única invocación de cierre.
- RabbitMQ real: prueba gated de pérdida del canal con un mensaje persistente y comprobación de redelivery.
- PostgreSQL real: recuperación de execution/dispatch leases expirados; fencing de tokens antiguos que impide renew/complete/mark publicados; completion e inbox transaccionales.
- Prometheus: counters/histograms in-memory con outcomes allowlisted, más endpoint `GET /metrics` (loopback por defecto; bearer remoto + TLS/mTLS y red privada). Gauges PostgreSQL agregados implementados; el muestreo está aislado y no bloquea recovery/dispatch.

**Limitaciones que siguen abiertas:** el runtime no registra handlers de negocio Meta/CRM; el registry de replay continúa vacío y fail-closed. No se ha demostrado todavía replay end-to-end con handler real ni idempotencia de efectos externos. El adapter Prometheus ya tiene endpoint de scrape, gauges PostgreSQL y conteos RabbitMQ de mensajes listos/consumidores para worker queue y DLQ. Siguen pendientes mensajes unacknowledged/consumer lag autoritativo, importación/validación del dashboard y alert rules, alert routing y SLO. Tampoco existe evidencia de topology/policies en un cluster RabbitMQ productivo, secret manager/rotación, pruebas de carga/DR, revisión independiente ni aceptación final del propietario. TASK-003 continúa `in_progress` y GO-PRODUCTION permanece NO-GO.

## 13. Exposición HTTP de métricas Prometheus

Se añadió `TenantJobMetricsHttpServer` en infraestructura y se conectó al ciclo de vida de `TenantJobRuntimeProcess`. El worker inicia el listener junto con el runtime y lo cierra durante shutdown. Solo responde a `GET /metrics`; rutas desconocidas devuelven 404, otros métodos 405, autenticación ausente/incorrecta 401 y fallos del renderer 500 genérico.

La configuración usa `TENANT_JOB_METRICS_HOST=127.0.0.1` y `TENANT_JOB_METRICS_PORT=9464` por defecto. Un binding fuera de loopback exige `TENANT_JOB_METRICS_BEARER_TOKEN` con al menos 32 bytes; la comparación usa `timingSafeEqual`. Para contenedores, limitar el puerto a la red de monitorización privada y suministrar el token mediante Secret Manager. No se incorporan labels de tenant, actor, job ni payload.

El nuevo test cubre GET/404/405, headers, bearer token, binding remoto sin token, renderer fallido, doble startup y cierre idempotente. Está agregado a `microservices-meta-ecuapp:test`. Source CI [#42434224485](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42434224485) terminó SUCCESS para commit `abbc86cfbd72e89ab5db82b0e3207159a66eba71`, incluyendo build, typecheck y esta suite.

El endpoint sirve counters/histograms in-memory, gauges agregados PostgreSQL y conteos de mensajes listos/consumidores de RabbitMQ. El reader RabbitMQ usa la Management HTTP API con una identidad `monitoring` dedicada y permisos AMQP vacíos; no comparte conexión/canal con worker. Sus conteos son `messages_ready` y `consumers`, no incluyen mensajes unacknowledged ni son consumer lag. Todavía faltan medición autoritativa de unacked/lag, validación de alert routing/SLO, importación del dashboard y reglas en stack Prometheus/Grafana real y validación de scraping en la topología desplegada. TASK-003 sigue `in_progress`; GO-PRODUCTION permanece NO-GO.

## 14. Gauges operativos agregados desde PostgreSQL

La migración `microservices-meta-ecuapp/migrations/0015-tenant-job-runtime-metrics.sql` crea `platform.read_tenant_job_runtime_metrics()`. Es una función `SECURITY DEFINER` con `search_path` fijado y devuelve únicamente agregados globales: dispatch pending/blocked, leases de dispatcher y worker activos/expirados, jobs dead-letter, edad del pending más antiguo y jobs replayed. Nunca devuelve tenant ID, actor ID, correlation ID, job ID ni payload.

El único rol con `EXECUTE` es `whatsbusiness_job_dispatcher_role`. `whatsbusiness_app` y `whatsbusiness_job_worker_role` no pueden ejecutar la función; el dispatcher tampoco tiene `SELECT` directo de `platform.tenant_job_records`. El diseño usa un pool independiente de métricas con una sola conexión y timeouts de conexión/consulta, autenticado con el rol dispatcher; no compite con el pool de despacho y no amplía permisos de API o worker.

`PostgresTenantJobRuntimeMetricsReader` valida contadores como enteros seguros y el valor de antigüedad como número finito no negativo. `TenantJobRuntimeSupervisor` actualiza el snapshot cada 15 s por defecto (`TENANT_JOB_METRICS_POLL_INTERVAL_MS`); un fallo de lectura se registra y nunca impide recovery/dispatch. Los gauges se exponen sin labels y permanecen cacheados entre scrapes.

Se añadieron suites del exporter, reader y supervisor, además de comprobaciones gated en la integración PostgreSQL para privilegios y delta de jobs pending. **Source CI #42435204662 terminó SUCCESS** para migración/reader/gauges PostgreSQL.

Quedan fuera de este slice los mensajes unacknowledged y el consumer lag autoritativo, dashboards, reglas de alertas y SLO. TASK-003 continúa `in_progress`; GO-PRODUCTION permanece NO-GO.

## 15. Métricas RabbitMQ listas y consumidores

), sin reutilizar las credenciales del worker. La URL es HTTPS fuera de loopback y no admite path ni credenciales embebidas.

Se exponen cuatro gauges sin labels: `tenant_job_rabbitmq_worker_queue_ready_messages`, `tenant_job_rabbitmq_worker_queue_consumers`, `tenant_job_rabbitmq_dead_letter_queue_ready_messages` y `tenant_job_rabbitmq_dead_letter_queue_consumers`. Los mensajes unacknowledged quedan fuera de `messageCount`; consumer lag necesita una fuente autoritativa adicional y no se infiere de estos contadores.

El reader usa Basic auth, `cache: no-store`, `redirect: error`, un timeout abortable de 1 500 ms y validación de contadores enteros no negativos. La observabilidad no comparte conexión AMQP del worker. Source CI #466 fue cancelado por pushes posteriores; Source CI #481 está ejecutando la variante con `messages_unacknowledged`. #480 detectó un contador ausente en respuesta 200 de DLQ; se añadió diagnóstico que solo muestra nombres de campos. CodeQL #6 terminó SUCCESS. `messages_ready` y `messages_unacknowledged` se exponen en gauges separados; ninguno de los campos representa consumer lag. TASK-003 sigue `in_progress`; GO-PRODUCTION sigue NO-GO.


## 16. Source CI #539 — prueba de transporte y terminal dead-letter (2026-11-08)

Source CI [#539](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976106) terminó SUCCESS en commit `c2bb65fc1a506ba54ab3f7662c9bbc759e2b0536`; CodeQL #77 SUCCESS. El target `microservices-meta-ecuapp:test` validó también la suite de transporte RabbitMQ después de retirar las aserciones que dependían de un scrape de Prometheus concurrente. Publisher confirms, routing, ACK y quorum DLX se comprueban mediante el protocolo AMQP con mensajes realmente entregados.

El mismo Source CI ejecutó la integración Meta Webhook sobre PostgreSQL/RabbitMQ: el worker procesó un evento con handler registrado y persistió otro evento válido sin handler como dead-letter terminal; el inbox, receipts y outbox conservan sus límites tenant. El query SQL de dead letters devuelve metadata para el tenant actual y niega contexto ajeno.

TASK-003 permanece `in_progress`: este CI no demuestra handlers de negocio de CRM/Meta, replay end-to-end externo, DLQ operator workflow, Secret Manager/KMS, broker deployment real, alert routing/SLO, carga, DR, ni aceptación independiente/propietario.


## 17. Prueba live del lector RabbitMQ Management API — pendiente de CI

Se incorpora `rabbitmq-management-tenant-job-queue-metrics.integration.spec.ts` al target Nx `microservices-meta-ecuapp:test`. La prueba crea un exchange y dos colas efímeras, publica mensajes con publisher confirms y usa consumidores manual-ACK para comprobar `messages_ready`, `messages_unacknowledged` y `consumers` en la cola worker y la DLQ, durante los estados ready → in-flight → idle.

El lector consulta la Management HTTP API con un usuario `monitoring` independiente. El workflow lo provisiona con permisos de recurso vacíos (`configure/read/write = ^$`), por lo que la credencial no puede declarar, publicar ni consumir por AMQP; solo inspecciona estadísticas. La contraseña es sintética y exclusiva del contenedor efímero de CI. En producción, la credencial debe inyectarse desde Secret Manager y el endpoint remoto debe usar HTTPS.

**Estado:** test, target Nx y provisioning CI implementados; Source CI/CodeQL del nuevo commit pendiente. No sustituye Prometheus/Grafana ni mide consumer lag.
