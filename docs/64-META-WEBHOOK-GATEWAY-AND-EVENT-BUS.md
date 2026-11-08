# 64 — Meta Webhook Gateway, inbox durable y event bus

**Fecha de implementación:** 2026-11-07  
**Tareas relacionadas:** TASK-027, TASK-028  
**Estado real:** implementación parcial versionada en el commit de esta entrega; ambas tareas permanecen `in_progress`, no `verified` ni `accepted`.

## 1. Alcance

El límite HTTP de Meta recibe challenge GET y notificaciones POST para WhatsApp, Facebook, Instagram, Lead Ads, Ads y Threads. La ruta Nest global queda en `/api/v1/webhooks/meta/:product`. WhatsApp Flows Data Exchange es un protocolo request/response con cifrado de aplicación y sigue fuera de este gateway.

## 2. Secuencia de confianza y durabilidad

1. GET exige `hub.mode=subscribe`, verify token y challenge. Se compara SHA-256 del token contra la credencial registrada en tiempo constante y se devuelve el challenge literal solo si existe coincidencia.
2. POST solo admite JSON, captura bytes originales y aplica 3 MiB como límite local de ingress. Verifica `X-Hub-Signature-256: sha256=<hex>` con HMAC-SHA256 sobre el cuerpo exacto. La firma se valida antes de decodificar UTF-8 o ejecutar JSON.parse.
3. El envelope se valida por producto, asset, entries y límites de eventos. El tenant se obtiene exclusivamente de `platform.meta_webhook_assets`; un tenant dentro del payload nunca es autoridad.
4. Se calcula un hash del cuerpo y una clave de idempotencia por evento. El cuerpo original y cada payload individual se cifran con AES-256-GCM; el AAD liga app, tenant, producto, asset y clave de evento. Se conserva key ID para rotación.
5. Una transacción PostgreSQL guarda delivery, inbox y transactional outbox. La clave única de inbox evita insertar dos veces un evento ya recibido. Se responde HTTP 200 después del COMMIT, no antes.
6. El dispatcher reclama outbox con lease, publica el evento lógico `meta.webhook.received` v1 con metadatos mínimos, persistencia y publisher confirm mandatory; después marca el outbox como publicado.
7. El consumer utiliza ACK manual. Valida el sobre, reclama el evento durable con lease/fencing, descifra y ejecuta el handler registrado dentro de la transacción tenant-scoped. El recibo idempotente y el estado `processed` se guardan en la misma transacción que el handler.
8. Fallos recuperables usan backoff exponencial con jitter y republicación del outbox. Handler ausente, error permanente o intentos agotados terminan en `platform.meta_webhook_dead_letters`. Mensajes broker físicamente inválidos se NACKean sin requeue y van a la quorum DLQ física.
9. El supervisor reconstruye canales RabbitMQ y vuelve a reclamar leases vencidos tras reinicios o pérdida de conexión.

## 3. Modelo persistente

La migración `0016-meta-webhook-inbox.sql` crea:
- `meta_webhook_apps`: producto, hash de verify token y referencia externa a App Secret; no guarda el App Secret en claro.
- `meta_webhook_assets`: vínculo app/product/asset/tenant habilitado.
- `meta_webhook_deliveries`: hash y ciphertext de cuerpo original, AAD metadata y correlation ID.
- `meta_webhook_inbox`: evento cifrado, idempotency key única, occurred-at, estado, intentos y lease.
- `meta_webhook_event_outbox`: publicación transaccional con fencing.
- `meta_webhook_consumer_inbox`: recibo idempotente por tenant, consumer y event.
- `meta_webhook_dead_letters`: causa terminal, intentos y futura resolución operacional.

RLS y roles NOLOGIN separan el ingress del worker. El ingress tiene lectura limitada a credenciales/subscripciones y grants mínimos de inserción; no recibe acceso de lectura al payload cifrado. Las funciones privilegiadas tienen search_path fijo, validan límites y no se conceden al rol API genérico ni al worker de tenant-jobs.

## 4. Contrato interno

El evento broker `meta.webhook.received` solo expone ID/receipt ID, schemaVersion, tenant ID, aggregate, source, correlation ID, producto y SHA-256 del cuerpo. No transporta mensajes, contactos, teléfonos, tokens ni payloads Meta. El payload queda en PostgreSQL cifrado. El esquema lógico es compatible con el sobre general de eventos de dominio v1; la congelación formal del catálogo AsyncAPI/OpenAPI todavía está pendiente.

## 5. Límites y operación segura

### Estado implementado en código
- Firma HMAC del cuerpo raw y challenge GET.
- Límite de bytes, límites estructurales, UTF-8 estricto y control de tipo de producto.
- Resolución tenant desde la suscripción y no desde el callback.
- AES-256-GCM, key ID y AAD por tenant/evento.
- Inbox + outbox transaccionales, idempotencia y recuperación de leases.
- Publisher confirms, quorum queues, ACK manual, retry policy y DLQ durable DB/RabbitMQ.
- Unit tests para firma, límites, decoder, cifrado, ingress tenant mapping, handler registry/processor y dispatcher.

### No declarar listo para producción todavía
- Los handlers de negocio de cada producto deben registrarse; el worker falla al arrancar con registry vacío y los tipos sin handler terminan en DLQ. No se debe crear un handler no-op.
- Se incorporó `MetaWebhookWorkerRuntime` como raíz de composición desplegable: crea el pool dedicado `DATABASE_WEBHOOK_WORKER_URL`, valida TLS/AMQPS en producción, valida el keyring AES-GCM al arrancar, configura supervisor/reintento y exige handlers inyectados. La aplicación de canal debe suministrar handlers reales antes de arrancar. Falta empaquetar/activar el entrypoint de cada bounded context con dichos handlers, configurar health/liveness del despliegue y verificarlo en infraestructura.
- El adapter actual de secretos lee variables de entorno para desarrollo/pruebas. Falta un adapter real para Secret Manager/KMS, gestión de IAM, rotación y despliegue de claves.
- Ya está añadida una API tenant-scoped de solo lectura `GET /v1/tenants/:tenantId/webhooks/dead-letters` que devuelve metadatos paginados y excluye ciphertext/payloads. La función SQL exige coincidencia exacta de `app.tenant_id`; el permiso RBAC `webhooks.dead_letters.read` queda en tenant_admin y compliance_auditor, sin conceder asignaciones automáticamente. Falta todavía replay con doble aprobación, step-up, request hash y audit append-only. No hay replay manual permitido. CR-0016 debe definir retención, ventana y autorización.
- OpenAPI WH-001..WH-007 y AsyncAPI necesitan freeze formal y validación de compatibilidad por producto/versión. WH-008 no es parte de esta implementación.
- Se necesitan fixtures de conformance de WhatsApp, Facebook, Instagram, Leadgen y Ads contra payloads oficiales de cada suscripción real. El decoder común no es una certificación de compatibilidad integral de Meta.
- La consulta de DLQ tiene pruebas unitarias de paginación, tenant context y ausencia de payload. Falta prueba de integración completa con PostgreSQL/RabbitMQ reales, fault injection de publish/ACK/lease, carga, observabilidad y alertas específicas (TASK-029), seguridad de perímetro (rate limiting/WAF/TLS) y aceptación operativa.
- La retención y borrado del ciphertext no se deben implementar por TTL arbitrario hasta que CR-0016 y obligaciones de privacidad definan el calendario.

## 6. Runbook de diagnóstico (solo lectura)

Conteos por estado, con el rol de operación y filtros de tiempo aprobados:

```sql
SELECT status, count(*) AS events,
       min(received_at) AS oldest_received_at,
       max(updated_at) AS latest_update
FROM platform.meta_webhook_inbox
GROUP BY status
ORDER BY status;

SELECT reason_code, count(*) AS events,
       min(created_at) AS oldest_dead_letter
FROM platform.meta_webhook_dead_letters
WHERE resolved_at IS NULL
GROUP BY reason_code
ORDER BY events DESC;

SELECT status, count(*) AS publications,
       min(created_at) AS oldest_outbox_item,
       max(attempts) AS max_attempts
FROM platform.meta_webhook_event_outbox
GROUP BY status
ORDER BY status;
```

Estas consultas son ejemplos de diagnóstico. No conceden lectura directa de ciphertext a operadores generales ni autorizan `UPDATE`, `DELETE`, `ACK` manual o republicación manual. Correlacionar por UUID/correlation ID, nunca copiar cuerpos ni secretos en logs/incidentes.

## 7. Configuración

Las variables de ejemplo están en `microservices-meta-ecuapp/.env.example`. En producción deben inyectarse desde Secret Manager, no desde valores versionados. Se necesita crear y validar registros de app/asset antes de activar callback; todos los assets habilitados requieren dueño tenant identificado y suscripción vigente.

## 8. Hardening incremental y evidencia pendiente — 2026-11-08

- Se añadió la migración `0018-meta-webhook-ingress-app-grants.sql`: el login `whatsbusiness_app` del API se crea con `NOINHERIT`; por tanto, la membresía de `whatsbusiness_webhook_ingress_role` por sí sola no habilita sus permisos. La migración concede al login únicamente las columnas de metadata y los INSERT necesarios para delivery/inbox/outbox. No concede lectura de ciphertext ni UPDATE/DELETE.
- Source CI ahora provisiona el login independiente `whatsbusiness_webhook_worker`, con membresía heredable del rol NOLOGIN del worker, y habilita `RUN_META_WEBHOOK_INTEGRATION_TESTS=true`.
- La nueva suite `postgres-meta-webhook.integration.spec.ts` recorre PostgreSQL → outbox → RabbitMQ quorum queue → consumer → handler registrado → transacción tenant-scoped → recibo idempotente. Incluye deduplicación y rechazo de finalización bajo tenant incorrecto.
- Código publicado en `environment/local`; Source CI [#42444781572](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42444781572) estaba en ejecución al actualizar este documento. No declarar la suite verificada hasta que termine SUCCESS en el HEAD exacto.
- TASK-027/028 siguen `in_progress`: esta integración sintética no reemplaza handlers reales por producto, fixtures oficiales/versionados ni pruebas con callbacks de cuentas Meta elegibles. Replay continúa deshabilitado hasta CR-0016, políticas de retención/privacidad aprobadas y efectos externos idempotentes demostrados.
