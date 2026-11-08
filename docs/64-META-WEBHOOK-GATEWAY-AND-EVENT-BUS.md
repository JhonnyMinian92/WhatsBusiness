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

## 9. Contrato del evento interno

- El evento preexistente `meta.webhook.received.v1` y el schema `MetaWebhookReceived` se conservaron en el catálogo canónico; se eliminaron definiciones/referencias duplicadas. El catálogo queda en 69 eventos, 69 canales, 138 operaciones y 69 schemas. El payload del broker contiene receipt metadata y SHA-256, nunca el payload Meta ni PII.
- `scripts/validate-contracts.mjs` amplió las verificaciones de estructura, referencias y fixtures positivos/negativos a 70 esquemas y 140 operaciones AsyncAPI. La instalación de validadores se aisló fuera del workspace pnpm para evitar que npm intente resolver dependencias `workspace:` del monorepo.
- Contract CI falló inicialmente por instalación npm en la raíz del workspace y después por lint warnings históricos del CLI. Se reemplazó el paso CLI por el parser oficial `@asyncapi/specs@6.11.1`, ejecutado dentro del validador, con bloqueo explícito solo ante diagnósticos de error. Se fijó 3.4.0 evitando 3.4.1/3.4.2, señaladas por advisories de paquete comprometido.
- Contract CI #15/#17 ejecutaron la validación, pero el CLI devolvió exit code 1 por diagnósticos de lint heredados (sin errores de especificación). Se eliminó ese falso gate y se integró el parser oficial directamente en `validate-contracts.mjs`; la siguiente ejecución debe demostrar parseo válido y las comprobaciones JSON Schema.

- La primera integración directa del parser 3.4.0 falló al compilar reglas Spectral bajo Node 26.13 (SyntaxError en Ajv). Se actualizó a `@asyncapi/specs@6.11.1`, versión posterior no comprometida según el advisory consultado; la nueva ejecución debe validar la compatibilidad en CI.

- La API de parser ejecutaba reglas Spectral/Ajv que fallaban en Node 26.13 antes de validar el documento. Se sustituyó por el JSON Schema oficial `@asyncapi/specs@6.11.1`, validado directamente con Ajv draft-07 y `schemasWithoutId['2.6.0']`; los eventos de dominio continúan validándose con Ajv 2020.


## 10. Resultado de validación contractual

- Contract CI [#24](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42445689549) terminó SUCCESS. Redocly validó OpenAPI; el schema oficial AsyncAPI 2.6.0 y los fixtures del catálogo de 69 eventos pasaron.
- Se mantienen tres warnings OpenAPI conocidos de rutas ambiguas en endpoints de Leads. No impidieron la validación, pero siguen siendo deuda contractual que debe resolverse antes de congelar esas rutas.


## 9. Verificación del lifecycle CI y worker supervisor — 2026-11-08

Source CI #527 terminó cancelled tras agotar el límite de 30 minutos mientras se ejecutaba microservices-meta-ecuapp:test. La instalación frozen, migraciones e idempotencia, creación de roles, build y typecheck finalizaron SUCCESS. api:test concluyó; las suites del paquete backend no llegaron a terminar.

La inspección del test harness identificó una referencia fuera de ámbito en el teardown de rabbitmq-transport.integration.spec.ts: los nombres de colas creados dentro del try se reutilizaban desde finally. Si la limpieza lanzaba, la conexión AMQP podía quedar abierta. Se corrigió el ámbito de los nombres, se añadió la limpieza del exchange temporal y se garantiza el cierre de los canales/conexión. También se corrigió la ruta de test Nx que apuntaba a un archivo de supervisor inexistente y se añadió meta-webhook-worker.supervisor.spec.ts.

**Límite de verificación:** estas correcciones permanecen implementadas; CI pendiente hasta que el nuevo Source CI complete unitarias e integraciones PostgreSQL/RabbitMQ con SUCCESS. TASK-027/028 siguen in_progress; no se habilita replay real ni se consideran probados handlers productivos. CR-0016, retención/privacidad, fixtures oficiales Meta, KMS/Secret Manager, rate limiting/WAF y aceptación operativa continúan pendientes.


## 10. Source CI #528 — ajuste del fixture de broker y del rol ingress (2026-11-08)

Source CI #528 (commit `a00c4b318021d12e84cc5fe98c23f4da6639b65a`) confirmó que el test harness ya no se queda bloqueado: el target backend terminó en aproximadamente 10 segundos, con 80 de 82 tests aprobados. Instalación frozen, migraciones/idempotencia 0001–0018, roles DB, build, typecheck y `api:test` fueron SUCCESS; CodeQL #66 también SUCCESS.

La prueba de transporte RabbitMQ inicializaba la topología de producción y su binding `jobs.#`, de modo que el mensaje podía ser recibido por la cola permanente en vez de la cola temporal cuya métrica se observaba. El fixture ahora declara los exchanges sin inicializar la cola de producción.

La prueba PostgreSQL encontró que el rol `whatsbusiness_app` tenía permisos INSERT por columna pero no SELECT sobre las columnas que intervienen en las claves de conflicto del INSERT idempotente. La migración 0019 añade únicamente esos permisos de lectura de metadata para inbox/outbox; no permite acceder al ciphertext ni a las columnas criptográficas.

**Verificación pendiente:** la migración 0019, su idempotencia y ambas integraciones deben pasar en el siguiente Source CI. TASK-027/028 no están cerradas ni aceptadas.
undefined

## 11. Source CI #539 — prueba end-to-end de evento terminal y consulta DLQ (2026-11-08)

Source CI [#539](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976106) terminó SUCCESS en commit `c2bb65fc1a506ba54ab3f7662c9bbc759e2b0536`; CodeQL [#77](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976151) también terminó SUCCESS. La ejecución validó frozen install, migraciones 0001–0021 e idempotencia, provisioning de logins mínimos, build, typecheck, target de pruebas API y target backend con PostgreSQL/RabbitMQ efímeros.

La integración PostgreSQL/RabbitMQ ahora ejerce en la misma transacción de ingress dos eventos distintos con un mismo delivery:
- `messages.message`: handler registrado; tenant validado, receipt idempotente y estado `processed`.
- `messages.status`: sin handler registrado; el processor clasifica el fallo como permanente, el repository lo persiste como `dead_letter` y la consumer confirma la entrega broker después de confirmar el resultado durable.

La suite verifica que los dos outbox fueron publicados, que solo se ejecutó una vez el handler registrado, que existe una dead letter con `META_WEBHOOK_HANDLER_NOT_REGISTERED`, y que el login de ingress puede listar únicamente metadata a través de `platform.list_meta_webhook_dead_letters`. Al cambiar `app.tenant_id` a otro tenant, la función falla con SQLSTATE `42501`. Ni payload cifrado ni body nativo se exponen.

La prueba de transporte RabbitMQ valida routing y ACK/DLX con entregas AMQP directas; ya no usa scraping de métricas asíncronas como señal de entrega. El exporter y sus métricas siguen teniendo suites separadas.

**Estado:** la secuencia de código, persistencia, dispatch, consumo, terminal dead-letter y lectura tenant-scoped está verificada por CI sintético. TASK-027/028 continúan `in_progress`, no `accepted`: no existen handlers reales de negocio conectados a los bounded contexts Meta/CRM, fixtures/conformance probados con una app/cuenta Meta elegible, Secret Manager/KMS y rotación operativa, limitación de abuso perimetral, política de retención y replay aprobado por CR-0016, despliegue de topología/alertas/SLO, carga/DR ni review independiente. GO-PRODUCTION continúa NO-GO.


## Actualización 2026-11-08 — normalización de timestamps y deduplicación de estados

La inspección del decoder encontró un patrón regex escapado doblemente para timestamps epoch recibidos como texto. El parser ahora centraliza la normalización para valores numéricos, strings de Unix seconds (10 dígitos), Unix milliseconds (13 dígitos) e ISO-8601, y devuelve el mismo fallback seguro cuando el valor no es válido.

La suite agrega un caso de regresión en el que el mismo WAMID recibe dos estados `delivered` en segundos distintos: deben conservar fechas y claves idempotentes diferentes. Un evento repetido con el mismo estado y la misma fecha continúa deduplicándose. La modificación no cambia la identidad del contacto ni procesa payloads de negocio.

**Verificación:** Source CI #579 y CodeQL #114 terminaron SUCCESS en `8b96bd97c7fcd5cc816fbd933bd1c3bb236b3dd4`, incluyendo la regresión de timestamps del decoder y las suites backend PostgreSQL/RabbitMQ. TASK-027/028 siguen `in_progress`; handlers reales por bounded context, replay aprobado, KMS/rotación, operación desplegada, fixtures de conformance con cuentas Meta y review permanecen pendientes.


## Corrección de estructura Lead Ads — 2026-11-08

Los eventos Meta Lead Ads usan object=page, field=leadgen y colocan leadgen_id, page_id, form_id y created_time dentro de changes[].value. El decoder ahora extrae el identificador y la hora de ese objeto anidado, conserva leadgen_id como providerEventId y utiliza la identidad del lead como base de idempotencia. Una redelivery del mismo lead no genera un segundo evento, aunque cambie metadata de entrega.

La prueba cubre dos notificaciones del mismo lead y una notificación de un lead distinto, incluyendo created_time en epoch seconds numérico y textual. La carga de datos del lead (field_data) sigue siendo una llamada Graph API independiente y no se presume contenida en la notificación. Este slice no registra todavía el lead en un módulo CRM Leads porque ese bounded context aún no existe en código.


## 11. Preservación del contexto al dividir eventos — 2026-11-08

La decodificación de cambios con `messages[]` o `statuses[]` ahora conserva un contexto de proveedor por evento individual, sin duplicar las listas ya divididas. `payload.providerContext` contiene `objectType`, `entryId`, `entryTime`, `field` y el resto de `change.value` excluyendo `messages`/`statuses`. En WhatsApp esto mantiene `messaging_product`, `metadata.phone_number_id`, `display_phone_number` y `contacts` junto al mensaje/estado que originó el evento.

El decoder procesa `messages[]` y `statuses[]` mediante ramas independientes; si ambos arrays aparecen en un mismo `change.value`, ninguno se pierde. La clave de idempotencia se sigue calculando exclusivamente a partir de la identidad y contenido del evento original (por ejemplo WAMID/status/timestamp), antes de añadir contexto, por lo que variaciones de metadata de una redelivery no crean otra identidad.

Pruebas añadidas en `microservices-meta-ecuapp/src/webhooks/domain/meta-webhook-event.spec.ts`:
- `preserves WhatsApp metadata and emits both message and status arrays from one change`.
- `provider context does not change a message's stable idempotency key`.

Commits de implementación: `96506d956c4af70b061d02623fd42c0749f12fea` y `5b7374ef39113d4a264bd1c0ccf9d8cda8428948`. El resultado Source CI/CodeQL debe leerse sobre el HEAD que contiene código y documentación; no se deduce verificación por la existencia de los tests. No cambia el contrato externo ni la versión del envelope RabbitMQ, porque `providerContext` se encuentra dentro del payload cifrado que permanece en PostgreSQL.

Este ajuste no habilita handlers de negocio, no altera las políticas de replay/retención, y no permite efectos externos. TASK-027/028 permanecen `in_progress` hasta cerrar todos sus DoD y evidencias operativas.


## 12. Composition root del worker Meta — 2026-11-08

Se implementó `MetaWebhookWorkerRuntime` en `microservices-meta-ecuapp/src/webhooks/infrastructure/bootstrap/meta-webhook-worker.runtime.ts`, exportado desde `src/index.ts`. Es el composition root de infraestructura dedicado a webhooks: recibe handlers y reporter del host; valida registry (tipos y duplicados) y nombre del consumer antes de asignar recursos; valida URL PostgreSQL/AMQP y exige `DB_SSL=true` + `amqps://` en producción; valida/carga el keyring AES-GCM antes de crear el pool; crea un pool PostgreSQL independiente con `application_name=whatsbusiness-meta-webhook-worker`; configura connection/consumer/reconnect/lease/prefetch/batch bounds; y cierra el pool si falla el bootstrap.

`run(shutdownSignal)` mantiene el proceso activo hasta la cancelación y delega el drenado/cierre al supervisor. `close()` es single-flight y cierra el pool una sola vez. Los factories de pool/protector/supervisor son inyectables para pruebas, sin acoplar el dominio a PostgreSQL ni RabbitMQ. Se añadió `validateConfiguration()` al protector de entorno para que la carga de clave no sea perezosa durante el arranque del worker.

Suite `meta-webhook-worker.runtime.spec.ts` registrada en el target Nx: rechaza lista vacía, handlers duplicados y nombre inválido antes de crear recursos; exige TLS/AMQPS en producción; comprueba validación de keyring antes del pool; comprueba drenado/cierre ordenado y cleanup del pool en bootstrap inválido. Variables opcionales documentadas en `microservices-meta-ecuapp/.env.example`; uso de host documentado en `microservices-meta-ecuapp/README.md`.

Commits del runtime y hardening: `b2fae18c07b1ede450a7ee8248df1ceceb3c0fd2`, `65e173921ff83461a22bce86198305b21816b252`, `7daebb92507e51a3f2e6316bee592fa2e4edb583`, `7d6e33c10ceb19a4f4f68af3fb932c8783f1ed5b`, `7d10cf3f1fc22bc01facf69a44f09dffc3121d1a`, `12cabafa446e1b1408e42a219e0f5638838dbba2` y `d6d1e015d01b9810f7b92a047f5a5ed51ab097bf`. Source CI debe confirmarse sobre el último commit de código; agregar el composition root no significa que exista ya un entrypoint por bounded context ni un deployment instalado.

No quedan habilitados handlers falsos. El host sigue responsable de registrar los casos de uso reales, reporter productivo, entrypoint y health/liveness; KMS/Secret Manager, credenciales/rotación, TLS/AMQPS reales, revisión de roles SQL, topología desplegada, pruebas de fallos/carga/DR y aceptación continúan pendientes.
