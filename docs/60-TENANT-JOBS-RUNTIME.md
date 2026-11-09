# 60 — Runtime durable de tenant jobs en microservices-meta-ecuapp

**Fecha:** 2026-11-07  
**Rama:** `environment/local`  
**Tarea primaria:** TASK-003 / REQ-0001 / REQ-0010  
**Estado (actualizado 2026-11-08):** runtime durable parcialmente implementado. Source CI #42433941375 terminó SUCCESS en commit `f136cff710fe8c60c8430c82928092320b9d90b5`; verificó migraciones versionadas/idempotencia, privilegios DB, policy DLX, build, typecheck y pruebas unitarias + PostgreSQL/RabbitMQ. Pool A→B, cleanup COMMIT/ROLLBACK, aislamiento concurrente y recuperación/fencing de leases también cuentan con evidencia CI. El consumer evita enviar a DLQ jobs válidos por fallos ambiguos de persistencia o ACK, y agrupa cierres concurrentes. Replay sigue fail-closed porque no hay handlers de negocio con idempotencia externa registrada. TASK-003 permanece `in_progress`; GO-PRODUCTION sigue NO-GO.

## 1. Objetivo y límites

Implementar un runtime asíncrono durable y multi-tenant que publique trabajos creados en la misma transacción del negocio, los procese con entrega at-least-once y evite confirmar ejecución cuando un worker haya perdido su lease.

La raíz backend es `microservices-meta-ecuapp`. Identity/Tenant y CRM siguen en `apps/api` y se reutilizan por contratos/ports sin duplicar sus servicios ni guards. El frontend de negocio se desarrolla por separado en `app-meta-ecuapp`.

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
- [x] Métricas RabbitMQ live de `messages_unacked` para worker y DLQ, además de `messages_ready` y consumers; unit + integración live Source CI 42597892008 PASS.
- [ ] Definir/validar consumer lag como indicador temporal distinto de `messages_unacked`, desplegar alert routing/SLO y calibrar umbrales con carga.
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

**Limitaciones que siguen abiertas:** el runtime no registra handlers de negocio Meta/CRM; el registry de replay continúa vacío y fail-closed. No se ha demostrado todavía replay end-to-end con handler real ni idempotencia de efectos externos. El adapter Prometheus ya tiene endpoint de scrape, gauges PostgreSQL y conteos RabbitMQ live de ready/unacknowledged/consumers para worker queue y DLQ. Sigue pendiente definir un indicador temporal de consumer lag (no equivalente a unacked), además de importar/validar dashboard y alert rules, alert routing y SLO. Tampoco existe evidencia de topology/policies en un cluster RabbitMQ productivo, secret manager/rotación, pruebas de carga/DR, revisión independiente ni aceptación final del propietario. TASK-003 continúa `in_progress` y GO-PRODUCTION permanece NO-GO.

## 13. Exposición HTTP de métricas Prometheus

Se añadió `TenantJobMetricsHttpServer` en infraestructura y se conectó al ciclo de vida de `TenantJobRuntimeProcess`. El worker inicia el listener junto con el runtime y lo cierra durante shutdown. Solo responde a `GET /metrics`; rutas desconocidas devuelven 404, otros métodos 405, autenticación ausente/incorrecta 401 y fallos del renderer 500 genérico.

La configuración usa `TENANT_JOB_METRICS_HOST=127.0.0.1` y `TENANT_JOB_METRICS_PORT=9464` por defecto. Un binding fuera de loopback exige `TENANT_JOB_METRICS_BEARER_TOKEN` con al menos 32 bytes; la comparación usa `timingSafeEqual`. Para contenedores, limitar el puerto a la red de monitorización privada y suministrar el token mediante Secret Manager. No se incorporan labels de tenant, actor, job ni payload.

El nuevo test cubre GET/404/405, headers, bearer token, binding remoto sin token, renderer fallido, doble startup y cierre idempotente. Está agregado a `microservices-meta-ecuapp:test`. Source CI [#42434224485](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42434224485) terminó SUCCESS para commit `abbc86cfbd72e89ab5db82b0e3207159a66eba71`, incluyendo build, typecheck y esta suite.

El endpoint sirve counters/histograms in-memory, gauges agregados PostgreSQL y seis conteos físicos RabbitMQ (ready, unacknowledged y consumers para worker y DLQ). El reader usa la Management HTTP API con identidad `monitoring` dedicada y permisos AMQP vacíos; no comparte conexión/canal con worker. `messages_unacked` describe deliveries en vuelo, no consumer lag temporal. Todavía faltan esa medida temporal, validación de alert routing/SLO, importación del dashboard y reglas en stack Prometheus/Grafana real y validación de scraping en la topología desplegada. TASK-003 sigue `in_progress`; GO-PRODUCTION permanece NO-GO.

## 14. Gauges operativos agregados desde PostgreSQL

La migración `microservices-meta-ecuapp/migrations/0015-tenant-job-runtime-metrics.sql` crea `platform.read_tenant_job_runtime_metrics()`. Es una función `SECURITY DEFINER` con `search_path` fijado y devuelve únicamente agregados globales: dispatch pending/blocked, leases de dispatcher y worker activos/expirados, jobs dead-letter, edad del pending más antiguo y jobs replayed. Nunca devuelve tenant ID, actor ID, correlation ID, job ID ni payload.

El único rol con `EXECUTE` es `whatsbusiness_job_dispatcher_role`. `whatsbusiness_app` y `whatsbusiness_job_worker_role` no pueden ejecutar la función; el dispatcher tampoco tiene `SELECT` directo de `platform.tenant_job_records`. El diseño usa un pool independiente de métricas con una sola conexión y timeouts de conexión/consulta, autenticado con el rol dispatcher; no compite con el pool de despacho y no amplía permisos de API o worker.

`PostgresTenantJobRuntimeMetricsReader` valida contadores como enteros seguros y el valor de antigüedad como número finito no negativo. `TenantJobRuntimeSupervisor` actualiza el snapshot cada 15 s por defecto (`TENANT_JOB_METRICS_POLL_INTERVAL_MS`); un fallo de lectura se registra y nunca impide recovery/dispatch. Los gauges se exponen sin labels y permanecen cacheados entre scrapes.

Se añadieron suites del exporter, reader y supervisor, además de comprobaciones gated en la integración PostgreSQL para privilegios y delta de jobs pending. **Source CI #42435204662 terminó SUCCESS** para migración/reader/gauges PostgreSQL.

Quedan fuera de este slice el consumer lag temporal/autorutativo, dashboards y reglas de alertas desplegados, alert routing y SLO. TASK-003 continúa `in_progress`; GO-PRODUCTION permanece NO-GO.


## 15. Métricas RabbitMQ por Prometheus Detailed Metrics

El reader vigente es \`RabbitMqPrometheusTenantJobQueueMetricsReader\`. Consulta \`GET /metrics/detailed\` del plugin \`rabbitmq_prometheus\`, usando únicamente las familias \`queue_coarse_metrics\` y \`queue_consumer_count\`, filtradas por vhost y por los nombres configurados de worker queue y DLQ.

Muestras requeridas:
- \`rabbitmq_detailed_queue_messages_ready\`
- \`rabbitmq_detailed_queue_messages_unacked\`
- \`rabbitmq_detailed_queue_consumers\`

El adaptador no usa Management HTTP API, AMQP \`checkQueue\`, \`get\`, consumo ni permiso AMQP \`read\`. No obtiene cuerpos ni payloads. No se crea una identidad AMQP de monitorización.

Configuración: \`RABBITMQ_PROMETHEUS_URL\`; Basic auth opcional con \`RABBITMQ_PROMETHEUS_USERNAME\` y \`RABBITMQ_PROMETHEUS_PASSWORD\`, siempre como pareja. El endpoint remoto exige HTTPS; plugin y puerto Prometheus del broker permanecen en red privada/firewall. El parser valida familias/labels y enteros seguros no negativos, rechaza redirects, deshabilita cache, aplica timeout abortable y limita el tamaño de respuesta.

La respuesta puede no contener aún estadísticas de una cola recién creada por el intervalo de colección del broker. El reader identifica el estado como \`RABBITMQ_PROMETHEUS_METRICS_INCOMPLETE\`; solo la integración live reintenta ese estado hasta 20 s. Fallos HTTP, auth, parser y valores inválidos son fail-fast.

El fixture live crea colas únicas por ejecución con \`durable=false, exclusive=true, autoDelete=false\`. Son exclusivas de la conexión y se eliminan explícitamente en \`finally\`; conservarlas tras cancelar el último consumer permite verificar gauges en cero. No cambia la topología quorum durable de producción.

Source CI [#572](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026616) terminó SUCCESS en \`1c6e682eb755e77b8359e52d4e7091a41e4ef6d5\`: migraciones 0001–0023 e idempotencia, provisioning, quorum DLX, plugin Prometheus, build, typecheck, pruebas API/PostgreSQL y backend unit/PostgreSQL/RabbitMQ. CodeQL [#107](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026686) terminó SUCCESS. La misma ejecución incluye el refuerzo CRM para exigir TenantContextGuard + AuthorizationGuard en cada método del controller.

## 16. Source CI #539 — transporte y terminal dead-letter

Source CI [#539](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976106) verificó publisher confirms, routing, ACK y quorum DLX; también corrió la integración Meta Webhook con un handler registrado y otro evento válido sin handler como dead-letter terminal. Esto prueba el contrato del worker genérico, no handlers de negocio de CRM/Meta ni integraciones de proveedores.

## 17. Pendientes operativos y de producto

- Desplegar exporter Prometheus del broker y confirmar scraping de todos los nodos, firewall y TLS/mTLS reales.
- Instalar dashboards/reglas y probar alert routing y receivers.
- Definir SLO/SLA, capacidad, RPO/RTO y evidencia de load/restore/DR.
- Conectar handlers de negocio reales sobre modelos canónicos de conversaciones/mensajes y contactos, con idempotencia externa aprobada; no crear handlers fake/no-op.
- Cerrar replay end-to-end, retención, Secret Manager/KMS, revisión independiente y aceptación.
- TASK-003 continúa \`in_progress\`; TASK-027/028 permanecen \`in_progress\`; GO-PRODUCTION sigue NO-GO.

## 18. Antigüedad del backlog durable de ejecución (2026-11-08)

Se amplía la función agregada de PostgreSQL mediante la migración `0025-tenant-job-execution-backlog-metrics.sql`, sin cambiar el rol autorizado ni conceder lecturas directas de tablas.

- `pendingExecutionJobs` cuenta filas con `status='queued'` y `dispatch_status='published'`: trabajos persistidos y publicados que aún no han sido reclamados por un worker.
- `oldestPendingExecutionAgeSeconds` mide desde el menor `published_at` de ese conjunto hasta `statement_timestamp()`. Es una edad durable de trabajo pendiente de ejecución, no una estimación basada en el scrape de RabbitMQ.
- El exporter publica `tenant_job_execution_pending` y `tenant_job_oldest_pending_execution_age_seconds`, sin labels de tenant, actor ni job.
- Los seis gauges físicos RabbitMQ permanecen independientes y describen ready/unacknowledged/consumers en worker y DLQ.
- La integración PostgreSQL crea un trabajo sintético, lo publica y verifica que la función lo mida antes de reclamarlo; el fixture se elimina en `finally`.

La migración reemplaza la función porque PostgreSQL no permite cambiar el tipo de fila `RETURNS TABLE` mediante `CREATE OR REPLACE FUNCTION`. Reaplica el mismo `SECURITY DEFINER`, `search_path` fijo, revocaciones y EXECUTE exclusivo de `whatsbusiness_job_dispatcher_role`.

**Estado de esta iteración:** código, migración, pruebas y documentación preparados; Source CI en el commit que introduce la migración debe confirmar instalación, segunda ejecución idempotente, build, typecheck y suites unitarias/PostgreSQL/RabbitMQ antes de declarar el slice verificado. TASK-003 permanece `in_progress`; GO-PRODUCTION continúa NO-GO.


## Corrección post-CI (2026-11-08) — validación de edad y fixture

Source CI #576 del commit 1140d35b confirmó build, typecheck, migraciones idempotentes y pruebas API, pero identificó dos defectos en el nuevo slice:
- El exporter trataba oldestPendingExecutionAgeSeconds como contador entero. Se corrigió para validar ambas métricas AgeSeconds como valores numéricos finitos no negativos, permitiendo fracciones.
- El fixture PostgreSQL usaba un segmento jobType con guion, prohibido por el contrato real de platform.tenant_job_records.job_type. Se reemplazó por inbox.metrics.executionbacklog, compatible con la expresión de segmentos.

También se cambió la prueba a comparar contra el backlog de ejecución medido antes del fixture, evitando asumir que la base de integración está vacía.
**Estado:** corrección preparada para publicar; requiere Source CI del commit sucesor para verificación.


## Corrección post-CI #577 (2026-11-08)

La integración PostgreSQL se reordenó para no llamar a la operación batch `claim_tenant_job_publications` mientras el job de finalización principal seguía pendiente. Primero se completa el dispatch/claim de ese job con el helper existente; después se inserta y publica el fixture de métrica cuando es el único nuevo job elegible en la topología de prueba. Esto elimina el efecto colateral real de `LIMIT` + `FOR UPDATE SKIP LOCKED` al filtrar fuera de la función por `job_id`, y evita dejar leases de otros fixtures en estado `publishing`.
**Estado:** el orden corregido se somete nuevamente a Source CI; no se afirma todavía verificación.


## 18. Reconciliación del backlog de métricas RabbitMQ — 2026-11-09

La métrica `rabbitmq_detailed_queue_messages_unacked` ya está implementada en `RabbitMqPrometheusTenantJobQueueMetricsReader`, junto a `messages_ready` y `consumers` para worker queue y DLQ. Los seis gauges se publican en `PrometheusTenantJobRuntimeMetrics` y se combinan con los gauges PostgreSQL mediante `CompositeTenantJobRuntimeMetricsReader`.

Evidencia:
- Unit test `rabbitmq-prometheus-tenant-job-queue-metrics.reader.spec.ts`: filtra por vhost/colas configuradas, valida etiquetas, duplicados, valores, timeouts y límites de respuesta.
- Integración live `rabbitmq-prometheus-tenant-job-queue-metrics.integration.spec.ts`: crea mensajes en ambas colas, mantiene deliveries sin ACK con un consumer por cola, verifica `unacknowledged=1` y posteriormente verifica ready/unacknowledged/consumers en cero.
- Source CI [42597892008](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42597892008) terminó SUCCESS, incluida la suite Meta backend/PostgreSQL/RabbitMQ 112/112.

**No confundir:** mensajes unacknowledged son entregas en vuelo; no son consumer lag temporal. La métrica física queda implementada y CI-verified. Queda por definir una medida de lag/latencia de cola con semántica explícita, validar umbrales con carga y desplegar dashboards, alert rules, alert routing y SLO en la topología real.


## 19. Adaptadores tenant-scoped de Valkey y S3 — 2026-11-09

Se incorporan implementaciones concretas de `CacheStore` y `ObjectStorage`:
- Valkey implementa RESP binario, pool acotado, autenticación ACL, TLS para endpoints remotos, timeouts, límites de respuesta y cierre de recursos.
- S3-compatible implementa AWS SigV4, PUT/GET/DELETE, checksums SHA-256, límites de tamaño, claves sin traversal, TLS remoto y SSE-S3/SSE-KMS.
- `IsolationModule` registra `CACHE_STORE` y `OBJECT_STORAGE` y exporta `TenantScopedCache` / `TenantScopedObjectStorage`.
- Las suites RESP y S3 se registran en `api:test`; la configuración vacía/sintética se documenta en `.env.example`.

**Pendiente:** Source CI de este HEAD, conectividad con servicios gestionados, IAM/policies de bucket, KMS/rotación, ciclo de vida y pruebas de carga/DR. Sin providers configurados, las operaciones fallan cerrado; no se simula almacenamiento durable. TASK-003 sigue `in_progress`.


## 21. Consolidación de supply chain, benchmark HTTP y unicidad Meta — 2026-11-09

Se rescataron de PR #6 y #7, directamente sobre `environment/local`, los workflows de Gitleaks/Trivy/CycloneDX, la configuración Dependabot y el harness HTTP read-only de TASK-060. Source CI registra `pnpm bench:test`; no se declara benchmark de capacidad ejecutado. El benchmark solo GET, loopback por defecto y bloquea producción.

Se añade migración incremental 0043 con índice único parcial de identidad activa de conexión Meta. La migración comprueba duplicados existentes antes de aplicar el índice y usa el mismo predicado que el `ON CONFLICT` del repositorio. No se reescribe 0032.
