# Runbook — runtime de tenant jobs

## Alcance y límites

Este runbook cubre el dispatcher/outbox PostgreSQL, worker RabbitMQ, recuperación por leases y scraping Prometheus del backend `microservices-meta-ecuapp`. Los contadores/histogramas del proceso son in-memory y se reinician al reiniciar el worker. Los gauges PostgreSQL/RabbitMQ son snapshots agregados; no exponen tenant, actor, job ni payload.

RabbitMQ Management API informa `messages_ready`, `messages_unacknowledged` y consumidores. `ready` excluye entregas ya asignadas; `unacknowledged` cuenta entregas pendientes de ACK, pero ninguno mide por sí solo consumer lag ni edad del mensaje. No interpretar `ready_messages` como backlog total. Los objetivos SLO de `docs/13-OPERATIONS-AND-OBSERVABILITY.md` son candidatos de planificación, no SLA ni evidencia de capacidad.

## 1. Scraping no disponible

1. Comprobar `up{job="whatsbusiness-tenant-jobs"}` y el estado del proceso.
2. Validar `GET /metrics` desde el mismo namespace de red del scraper.
3. Confirmar `TENANT_JOB_METRICS_HOST`, puerto, bearer token desde Secret Manager y configuración TLS/mTLS del proxy/service mesh.
4. Mantener el puerto fuera de Internet y limitar firewall/security group al scraper.
5. Si el listener responde 500, revisar el renderer y logs normalizados; nunca activar debug que exponga stack o datos de jobs.
6. La recolección de métricas es best-effort: su fallo no debe detener recovery ni dispatch.

## 2. Canal de métricas RabbitMQ degradado

1. Revisar `TENANT_JOB_BROKER_METRICS_SNAPSHOT_FAILED` y el estado de la conexión RabbitMQ.
2. El reader abre un circuito al fallar un RPC AMQP o exceder 1 500 ms. El runtime recicla la sesión para obtener canales nuevos.
3. Confirmar que el runtime vuelve a registrar consumers y que el dispatcher reanuda publicaciones.
4. Verificar la redelivery de mensajes no ACKed y la deduplicación/inbox PostgreSQL antes de declarar recuperación.
5. No purgar colas para resolver una alerta de métricas.

## 3. Backlog de dispatch / leases vencidos

1. Revisar `tenant_job_dispatch_pending` y `tenant_job_oldest_pending_dispatch_age_seconds` para el outbox aún no publicado.
2. Revisar `tenant_job_execution_pending` y `tenant_job_oldest_pending_execution_age_seconds` para trabajos ya publicados que siguen esperando claim del worker. Esta segunda edad procede de `published_at` durable en PostgreSQL.
3. Correlacionar con ready/unacknowledged/consumers de RabbitMQ: son señales físicas distintas y no deben sumarse ni interpretarse como edad/lag por sí solas.
4. Confirmar disponibilidad PostgreSQL, permisos del rol dispatcher y estado de publisher confirms/mandatory routing.
5. Permitir al supervisor recuperar leases expirados con fencing; no editar tokens/estados manualmente.
6. Si hay jobs bloqueados, identificar el código de fallo y seguir el procedimiento de reparación autorizado.
7. Verificar que el backlog disminuya y que no existan publicaciones duplicadas con efectos laterales.

## 4. Deliveries unacknowledged / worker sin consumers / mensajes en DLQ

1. Revisar `tenant_job_rabbitmq_worker_queue_unacknowledged_messages` junto con prefetch, consumers, leases activos y duración de handlers.
2. Un valor sostenido puede indicar handlers lentos, pausas de proceso o ACK retrasados; correlacionar con histogramas y logs antes de intervenir.
3. No cerrar workers ni reencolar manualmente solo por observar unacked; primero verificar idempotencia/inbox y estado durable en PostgreSQL.

## 5. Worker sin consumers / mensajes en DLQ

1. Revisar despliegue del worker, handlers registrados, AMQPS, prefetch y límites de recursos.
2. Para DLQ, preservar mensajes y evidencias; determinar si el envelope es inválido, el job durable es desconocido o hubo fallo transitorio.
3. No ejecutar replay manual ni bulk purge. El replay requiere two-person approval, step-up, hash binding y audit.
4. Replay permanece fail-closed mientras el registro de políticas no demuestre idempotencia de los handlers y efectos externos.
5. Confirmar la salud de inbox/dedupe y el resultado terminal en PostgreSQL.

## 6. Incidente de aislamiento multi-tenant

1. Declarar incidente de seguridad y detener el procesamiento afectado mediante el mecanismo operativo aprobado.
2. Preservar audit trail y logs redactados; no exportar payloads o PII a sistemas de observabilidad.
3. Revisar tenant context, membership vigente, RLS, conexión/pool reuse A→B y fencing.
4. No restaurar el tráfico hasta revisión independiente y evidencia de pruebas negativas cross-tenant.

## 7. Recuperación y cierre

Registrar timestamps UTC, impacto por tenant pseudonimizado, códigos de error, acciones, jobs afectados por identificadores protegidos, redelivery/commit outcome y validación posterior. Un incidente se cierra con evidencia de estado durable, ausencia de pérdida/duplicación no reconciliada y acciones correctivas asignadas.

## Pendientes que impiden declarar GO-PRODUCTION

- Handlers reales de negocio y pruebas end-to-end de replay con efectos externos idempotentes.
- DLQ operator workflow desplegado, retención y aprobación operativa.
- Medición de edad física de mensajes RabbitMQ y consumer lag real (la edad durable PostgreSQL cubre solo jobs publicados que aún no han sido reclamados).
- Validación de broker topology/policies en el entorno de despliegue real.
- Secret Manager/KMS, rotación de bearer/HMAC y TLS/mTLS reales.
- Dashboards/alert routing instalados y probados en el stack de observabilidad real.
- Pruebas de carga, backup/restore y disaster recovery.
- Revisión independiente de seguridad/operación y aceptación del propietario.


## 8. Backlog durable publicado pendiente de ejecución

- Si `tenant_job_execution_pending` aumenta y `tenant_job_oldest_pending_execution_age_seconds` también crece, revisar la salud del worker y la tasa de claim/consumo.
- PostgreSQL es la autoridad del estado de job: el conjunto medido es `status='queued' AND dispatch_status='published'`; el reloj inicia en `published_at`.
- Si el gauge PostgreSQL permanece alto pero RabbitMQ ready está bajo, investigar mensajes entregados/unacknowledged, consumers y transacciones; no asumir pérdida de jobs.
- Si RabbitMQ ready crece pero el gauge durable queda bajo, comprobar routing, topología y reconciliación entre publicación y persistencia.
- No purgar, ACK/NACK manualmente ni ejecutar replay para reducir una alerta. Preservar evidencia y seguir el procedimiento aprobado.