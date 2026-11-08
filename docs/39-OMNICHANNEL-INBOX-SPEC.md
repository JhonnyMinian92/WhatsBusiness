# 39 — Especificación funcional: Inbox omnicanal y conversación

**Relacionado:** TASK-036, TASK-045..047, TASK-053, US-020, US-021, PD-003/004/019.  
**Estado:** baseline funcional de producto; slice de políticas de dominio implementado parcialmente (US-021); APIs/persistencia Inbox runtime aún no implementadas.

## 1. Objetivo y límites

Ofrecer una bandeja de trabajo común sin borrar las diferencias de cada canal. Inbox es dueño de Conversation, Assignment, InternalNote, OwnershipLease y la experiencia unificada; cada adapter conserva capacidades, políticas, estados, IDs y payload nativo del proveedor.

No asumir que una conversación de WhatsApp, Messenger e Instagram comparte identidad, ventana de servicio, formato, política o garantía de entrega.

## 2. Agregados

- **ChannelConnection:** conexión + cuenta/asset + producto/canal + capabilities.
- **Conversation:** tenant, canal, external conversation/thread ID, participantes, estado local, owner actual, timestamps.
- **ConversationParticipant:** actor/contact identity con namespace externo.
- **Message:** mensaje canónico + channel extension discriminada + native payload reference.
- **DeliveryAttempt / Receipt:** intento, respuesta nativa y estados asíncronos.
- **Assignment:** equipo/usuario asignado e historial.
- **OwnershipLease:** exclusividad temporal para humano, bot o agente externo.
- **InternalNote:** comentario privado no enviado al proveedor.
- **ConversationTag / ReadCursor:** clasificación y lectura.
- **Handoff:** solicitud y resultado de transferencia humano/bot/proveedor.

## 3. Modelo canónico sin pérdida semántica

Conversation contiene `tenant_id`, `channel`, `provider`, `account_asset_id`, `external_id`, `contact_identity_id`, `status`, `assigned_team_id`, `assigned_user_id`, `last_message_at`, `created_at`, `updated_at`, `version`.

Message contiene `id`, `tenant_id`, `conversation_id`, `direction`, `message_kind`, `canonical_content`, `channel_extension`, `provider_message_id`, `client_idempotency_key`, `submission_state`, `delivery_state`, `native_payload_ref`, `error_ref`, `created_at`, `provider_occurred_at`.

Los campos específicos (template, interactive, Flow, media, reply context, story/attachment, etc.) viven en tipos discriminados por canal/capability. No crear un DTO universal con decenas de opcionales ni reducir todos los errores/estados a boolean.

## 4. Máquina de estados de mensaje

Separar envío local y entrega remota:

- submission: `draft` → `queued` → `submitting` → `accepted` | `rejected` | `outcome_unknown`.
- delivery (solo cuando aplique): `pending` → `sent` → `delivered` → `read`; terminal alternativo `failed`, `expired`, `undeliverable`.
- Un callback tardío no puede degradar un estado final sin una regla explícita, evidencia temporal y test.
- HTTP 2xx significa aceptación según el contrato remoto, no entrega al destinatario.
- Timeout después de una escritura puede dejar `outcome_unknown`; reconciliar con provider ID/estado antes de reintentar.
- `rejected` guarda código y payload de error nativo redactado.

## 5. Comando de envío

Todo send debe pasar por:
1. Autenticar actor + tenant; validar ownership de conversation y permission `inbox.conversations.reply`.
2. Resolver ContactIdentity y channel connection activa.
3. Consultar capability registry, scope/grant/tier y política vigente de canal.
4. Evaluar consent, opt-out/suppression, ventana, categoría, plantilla y finalidad.
5. Validar payload discriminado y tamaño/tipo de media.
6. Registrar comando + outbox + idempotency key en transacción.
7. Worker reclama ejecución, revalida conexión/capability/policy y envía por adapter.
8. Guardar resultado nativo redactado; actualizar submission state.
9. Procesar webhooks/status callbacks idempotentes; reconciliar outcome unknown.
10. Auditar actor, tenant, canal, purpose, approval y resultado.

No repetir POST ambiguo a ciegas. Idempotencia local no equivale a idempotencia garantizada por Meta; cada adapter declara la semántica real.

## 6. Contrato mínimo de Channel Adapter

Cada adapter declara:
- `provider`, `product`, `apiVersion`, `channel`, `supportedCapabilities`.
- `validateInbound`, `normalizeInbound`, `validateOutbound`, `send`, `fetchStatus` (si soportado), `verifyWebhook`, `normalizeReceipt`.
- errores retryable/non-retryable y referencia a errores nativos.
- ventana/policy rules como metadata versionada, nunca una constante universal.
- límite de media, tipos de mensaje, interactive features y disponibilidad por asset.
- pruebas contractuales y fixtures por API version.

El adapter no decide roles, tenant, consentimiento global ni aprobación de gasto: recibe un contexto autorizado desde el backend.

## 7. Ownership, asignación y handoff

Solo puede existir un owner efectivo de respuesta por conversación en una ventana de lease: `human`, `whatsbusiness_bot`, `meta_business_agent`, `partner_agent` o `unassigned`.

Lease incluye `owner_type`, `owner_ref`, `lease_id`, `acquired_at`, `expires_at`, `version`, `reason`. Adquirir/renovar/liberar usa compare-and-swap o lock transaccional. Al vencer, no se asume que el propietario anterior pueda seguir respondiendo. La transición registra handoff, suppresses bots competidores y protege doble respuesta. Assignment (persona/equipo responsable) es distinto de ownership lease (quién puede emitir la respuesta ahora).

Asignación manual y round-robin son estrategias; capacidad/presence, fairness, límites y fallback se miden y son configurables. No hardcodear un único algoritmo global.

## 8. API interna propuesta

- `GET /v1/tenants/{tenantId}/conversations`
- `GET /v1/tenants/{tenantId}/conversations/{conversationId}`
- `GET /v1/tenants/{tenantId}/conversations/{conversationId}/messages`
- `POST /v1/tenants/{tenantId}/conversations/{conversationId}/messages`
- `POST /v1/tenants/{tenantId}/conversations/{conversationId}/assignments`
- `POST /v1/tenants/{tenantId}/conversations/{conversationId}/ownership/acquire`
- `POST /v1/tenants/{tenantId}/conversations/{conversationId}/handoffs`
- `POST /v1/tenants/{tenantId}/conversations/{conversationId}/internal-notes`
- `POST /v1/tenants/{tenantId}/conversations/{conversationId}/read-cursor`

Writes requieren idempotency y authorization; pagination por cursor y orden temporal estable.

## 9. Eventos

`inbox.conversation.created`, `inbox.conversation.updated`, `inbox.message.received`, `inbox.message.send_requested`, `inbox.message.accepted`, `inbox.message.delivery_updated`, `inbox.message.failed`, `inbox.assignment.changed`, `inbox.ownership.acquired`, `inbox.ownership.expired`, `inbox.handoff.requested`, `inbox.handoff.completed`.

El sobre común usa docs/43. Eventos externos se guardan primero en durable inbox; el ACK sucede después de persistencia durable y validación mínima requerida por el contrato Meta.

## 10. Criterios de aceptación

- Mensajes entrantes duplicados/reordenados no crean conversaciones/mensajes duplicados.
- El proveedor y payload nativo pueden auditarse sin filtrar secretos/PII a logs.
- Un usuario sin permiso, tenant, asset grant o consent válido no puede enviar.
- Un 2xx remoto no se muestra como delivered.
- Un timeout posterior a write produce estado unknown y reconciliación, no repetición ciega.
- Dos workers/agentes no obtienen ownership efectivo simultáneo; CAS/lease y pruebas de carrera lo demuestran.
- InternalNote nunca llega al proveedor como mensaje externo.
- Handoff a humano detiene respuestas automáticas/externas competidoras.
- Cada canal puede declarar capability no soportada sin falsear paridad.

## 11. Pruebas

Unit: state machines por canal, policy windows, adapter mapping, lease transitions.  
Contract: request/response/error/webhook fixtures por product/API version.  
Integration: inbox durable, outbox, consumer idempotent, DLQ y reconciliation.  
Concurrency: dos usuarios, dos workers, expiración y renovación simultánea, retry y stale lease.  
E2E: inbound → assignment → reply autorizado → receipt → handoff.

## 12. No incluidos en esta fase

No prometer llamada de voz, Instagram DM, templates, Flows, media type o función avanzada por simple existencia de un adapter; se habilita por capability verificada de cada cuenta/operación. No se autoriza blast ni envío real durante pruebas sin autorización expresa.


## 13. Estado de implementación — US-021 / TASK-047 (2026-11-08)

Se ha añadido un slice de dominio puro en `apps/api/src/inbox/domain` para asignación, presencia, ownership lease, handoff, notas internas y autoridad idempotente de respuesta. Sus entradas y decisiones son inmutables y no dependen de NestJS, PostgreSQL, RabbitMQ, Valkey ni SDK Meta. Las políticas generan borradores de eventos solo cuando coinciden con los esquemas v1 existentes; el repositorio Inbox deberá persistir CAS + evento/outbox en una misma transacción antes de publicar o completar un cambio.

La asignación (responsabilidad del equipo/usuario) se mantiene separada del ownership lease (actor exclusivo autorizado para responder). La presencia tiene expiración fail-closed; la distribución automática solo selecciona miembros activos con presencia disponible y capacidad. El handoff exige destino elegible y owner/override autorizado. Las notas no tienen representación ni sender externo. Un retry de respuesta con la misma clave/fingerprint nunca habilita un segundo dispatch.

Este slice **no equivale a Inbox runtime**. INB-006..014 e INB-018 siguen bloqueadas como catalog-only hasta contract freeze + G0. Persistencia, migraciones/RLS, unique idempotency, CAS bajo concurrencia real, outbox/consumer, scheduler de expiración, heartbeat runtime, controllers, UI y E2E siguen pendientes; TASK-045 es dependencia de conversaciones/mensajes/adapters. TASK-047 y US-021 permanecen `in_progress` hasta CI exacto, integración y revisión/aceptación independientes.
