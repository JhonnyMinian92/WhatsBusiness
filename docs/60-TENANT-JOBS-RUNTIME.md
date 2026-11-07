# 60 — Runtime durable de tenant jobs en microservices-meta-ecuapp

**Fecha:** 2026-11-07  
**Rama:** `environment/local`  
**Tarea primaria:** TASK-003 / REQ-0001 / REQ-0010  
**Estado:** código fuente parcial implementado; build, typecheck e integración CI de esta iteración pendientes. No es GO-PRODUCTION.

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

El adapter RabbitMQ usa manual ACK, prefetch bounded y ACK solo tras resolución del caso de uso. El cierre normal cancela el consumo y espera entregas activas antes de cerrar el canal. Un mensaje inválido se NACK sin requeue para evitar loops; el DLX de quorum lo conserva para inspección.

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
- Bootstrap: handlers obligatorios, env y TLS.
- Publisher/consumer RabbitMQ: confirms, unroutable, ACK/NACK y drain.
- PostgreSQL gated: roles separados, claims, fencing, inbox/rollback, retry, dead-letter, lease expiry y denegación de acceso directo al payload.
- RabbitMQ gated: quorum queue, confirm, mandatory return y DLX.

Source CI declara PostgreSQL 18.6 y RabbitMQ 4.4 para pruebas de integración. Al documentar esta revisión no hay un resultado SUCCESS comprobado de la última iteración; debe verificarse el run asociado al commit más reciente. La ausencia de errores de TypeScript en esta documentación no equivale a build pass.

## 9. Pendientes reales para cerrar TASK-003

- [ ] Ejecutar y corregir Source CI hasta SUCCESS (frozen install, migrations/idempotence, build, typecheck, unit, PostgreSQL, RabbitMQ).
- [ ] Probar pool reuse A→B en worker login y en DatabaseService boundary.
- [x] Implementar heartbeat/renew del execution lease mediante token de fencing y PostgreSQL; el worker cancela cooperativamente el handler si pierde el lease. La suite unitaria e integración quedan sujetas a Source CI.
- [ ] Añadir límites/timeouts y cancelación cooperativa de handlers para que no ejecuten indefinidamente.
- [ ] Implementar replay administrativo de DLQ/job dead-letter, con permission/approval/audit; no crear bypass SQL público.
- [ ] Implementar lease/lock y replay seguro de broker DLQ, retención, acceso restringido y audit.
- [ ] Agregar métricas/alertas: age de outbox, publishing leases expired, queue depth, consumer lag, failed/blocked/dead-letter y replays.
- [ ] Añadir pruebas de crash entre publish/confirm/mark, ACK perdido, redelivery, lease expiry concurrente y fencing token obsoleto.
- [ ] Validar topology/policy en un deployment RabbitMQ real; CI no sustituye infraestructura de producción.
- [ ] Registrar handlers de negocio reales, conectados a casos de uso/Meta adapters; no iniciar el worker solo con handlers ficticios.
- [ ] Revisar seguridad/arquitectura independiente y obtener aceptación del propietario.

TASK-003 sigue `in_progress`; el código disponible es una base avanzada, no 100% del backend de producto.

## 10. Próximos dominios backend

Con TASK-003 verificada y accepted, el siguiente orden es: TASK-027 Webhook Gateway/inbox para eventos entrantes; TASK-028 Event Bus/DLQ/replay reutilizando la infraestructura; después Meta Control Plane TASK-006..010 y WhatsApp TASK-011..018. Los handlers de jobs deben emerger de esos casos de uso reales, no de ejemplos no conectados a producto.
