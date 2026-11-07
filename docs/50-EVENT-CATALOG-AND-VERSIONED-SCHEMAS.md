# 50 — Catálogo de eventos de dominio y schemas versionados

**Estado:** catálogo y contratos de diseño v1.0.0 para los eventos internos identificados en docs/47. No prueba que productores, consumers, exchanges o colas estén implementados.
**Normativa:** AsyncAPI en contracts/asyncapi/platform-events-v1.yaml; validación payload en contracts/schemas/domain-events-v1.schema.json; envelope común en contracts/schemas/event-envelope.schema.json.

## 1. Cobertura

Se definen **69 tipos de evento internos** en AsyncAPI y JSON Schema. Son eventos de dominio/plataforma, no endpoints REST ni webhooks externos. Un evento puede tener varios consumers; la tabla de docs/47 describe productor/consumidor y TASK que lo implementa.

| Contexto | Tipos de eventos | Responsabilidad |
|---|---|---|
| Platform | platform.tenant.created, platform.tenant.suspended, platform.membership.changed, platform.grant.revoked | Lifecycle de tenant, membership y grants |
| Meta control plane | meta.connection.created, meta.credentials.expiring, meta.connection.revoked, meta.assets.sync_requested, meta.assets.synced, meta.capability.changed, meta.webhook.received, meta.change.detected, meta.change.impact.analyzed | Conexiones, assets, capabilities, ingress y cambios externos |
| WhatsApp | whatsapp.message.send_requested, whatsapp.message.delivery_updated, whatsapp.template.status_changed | Mensajes salientes/estado y templates |
| Leads/CRM/Sales | lead.received, lead.deduplicated, lead.qualified, crm.contact.created/updated, crm.identity.linked/merged/merge_requested/merge_reversed, crm.lead.created/disqualified/converted/assigned, crm.activity.created, crm.opportunity.stage_changed/won/lost | Captación, identidad, timeline y ciclo comercial |
| Inbox | inbox.conversation.created/updated, inbox.message.received/send_requested/accepted/delivery_updated/failed, inbox.assignment.changed, inbox.ownership.acquired/expired, inbox.handoff.requested/completed | Conversación, envío, delivery, asignación, lease y handoff |
| Automation | automation.execution.requested, automation.step.completed, automation.dead_letter | Ejecución, step y dead-letter |
| AI | ai.suggestion.requested, ai.suggestion.created, ai.feedback.received | Sugerencias/feedback, sin autorización de auto-envío |
| Ads/Campaign Intelligence/Creative | ads.draft.created, ads.campaign.approval.requested, ads.budget.change.approved, ads.insights.snapshot.created, campaign.recommendation.created, campaign.recommendation.approved, campaign.recommendation.executed, creative.variant.created, creative.reviewed | Draft, approval, budget, insights, recommendation y revisión |
| Privacy | privacy.request.created, privacy.deletion.completed | Solicitudes de derechos y borrado verificable |
| Developer webhooks | developer.webhook.delivery.requested, developer.webhook.delivered, developer.webhook.failed | Entrega, retry y DLQ de callbacks |
| Agent tools | agent.tool.requested, agent.tool.approved, agent.tool.completed, agent.tool.denied | Gateway de tools, aprobación, resultado y deny |

Los nombres son estables y se publican en routing key lógica <event-type>.v1; las colas físicas se definen por contexto, consumer, prioridad y retry policy, no una cola por endpoint.

## 2. Envelope común

Todo evento incluye:
- id: UUID único del evento.
- type: nombre estable, exacto y lowercase.
- schemaVersion: SemVer del payload; versión inicial 1.0.0.
- occurredAt: instante UTC de ocurrencia.
- tenantId: UUID tenant no nulo en los 69 eventos actuales. Null queda reservado para eventos de plataforma que realmente sean globales y requerirán contrato nuevo/review.
- aggregate: type, id y version del agregado dueño del cambio.
- source, correlationId, causationId.
- data: payload mínimo tipado por evento y con campos adicionales cerrados.

El payload inicial privilegia referencias, IDs, estados y reason codes. No copia mensajes completos, PII, tokens, secretos, raw webhook body, prompt completo ni snapshots de otro bounded context. Cuando un consumer necesite información adicional, obtiene una proyección permitida a través del port/API del contexto owner con autorización tenant-scoped.

## 3. Consistencia e idempotencia

1. El agregado y el outbox record se guardan en una única transacción PostgreSQL.
2. El publisher puede publicar más de una vez; entrega at-least-once.
3. El consumer valida JSON Schema y versión antes de procesar.
4. Dedupe persistente por (consumer_name, event_id); no confiar solo en memoria o Redis.
5. Los side effects del consumer y el registro de dedupe se confirman en transacción cuando comparten DB; side effects externos usan idempotency/reconciliation.
6. ACK solo después del commit durable del consumer. Retry con backoff+jitter; errores no recuperables a DLQ.
7. No asumir orden global. Serializar/particionar por aggregate cuando una máquina de estados lo necesite.
8. Replay/retry manual requiere permiso, motivo, límites, audit y protección de side effects.
9. Eventos con IDs/nombres similares no se fusionan si su semántica de dominio es distinta (por ejemplo whatsapp.message y inbox.message).

## 4. Evolución y compatibilidad

- Patch: corrección documental que no cambia estructura/semántica del payload.
- Minor: nuevos campos opcionales con default/compatibilidad documentada.
- Major: quitar/renombrar campo, cambiar significado, enum cerrado incompatible o alterar invariantes; nuevo contrato/versión de evento y plan de migración.
- No reutilizar nombre de evento para una intención distinta.
- Consumers deben tolerar campos opcionales desconocidos según política, pero rechazar tipos/versiones no soportados.
- Cambios en docs/47, AsyncAPI, JSON Schema, producers, consumers, tests y docs/19 se integran en el mismo cambio revisado.

## 5. Reglas de seguridad

- tenantId del envelope no se confía como autorización: resolver actor/tenant ownership en el consumer y comparar con el agregado.
- Los mensajes del broker son datos no confiables: validar schema, source permitido, límites de tamaño y dedupe.
- No poner tokens, app secrets, cookies, full message bodies, phone numbers ni emails en routing keys, headers o métricas.
- Webhook ingress publica meta.webhook.received con referencia a durable inbox receipt + producto + hash; el raw body protegido permanece en storage controlado.
- Nunca crear un evento genérico command.execute capaz de ejecutar cualquier acción.
- AI/tool events transportan referencias y reason codes; ninguna publicación implica aprobación para enviar mensajes, publicar anuncios, gastar presupuesto o borrar datos.

## 6. Relación con los agentes

Cada TASK que produce/consume eventos debe:
- identificar el event type y sus consumer(s);
- invocar el schema versionado y usar tipos generados/verificados, no duplicar interfaces a mano;
- reutilizar outbox/inbox, publisher, consumer base, dedupe, retry y DLQ comunes;
- no implementar su propio broker client/mecanismo de retry si existe el port de plataforma;
- añadir contract tests producer→consumer y negativos cross-tenant;
- actualizar docs/47, AsyncAPI, JSON Schema, docs/19 y backlog;
- registrar owner/reviewer, test names y evidencia real.

La existencia del schema no marca TASK implementada/verified. El broker, storage, outbox, consumers, DLQ, replay y observabilidad requieren TASK-039 y pruebas de implementación posteriores.


## 7. Operaciones AsyncAPI y reconciliación de propuestas

El contrato `contracts/asyncapi/platform-events-v1.yaml` declara dos direcciones por canal lógico: `publish` para el productor y `subscribe` para el consumer group lógico. Los 69 mensajes referencian `correlationId` en `$message.payload#/correlationId`. Esta definición formaliza el contrato de ambos lados; no declara que los workers o las colas estén desplegados.

### 7.1 Reconciliación completada de eventos de CRM e Inbox

Las especificaciones de CRM (docs/38 §9) e Inbox (docs/39 §9) tenían 14 eventos adicionales sin mapping. Se han incorporado a AsyncAPI/JSON Schema y docs/47 con productor, consumidores lógicos y TASK asociadas:

- CRM/Sales: `crm.contact.updated`, `crm.identity.merge_requested`, `crm.identity.merge_reversed`, `crm.lead.created`, `crm.lead.disqualified`, `crm.lead.converted`, `crm.lead.assigned`, `crm.opportunity.lost`, `crm.activity.created`.
- Inbox: `inbox.conversation.updated`, `inbox.message.accepted`, `inbox.message.failed`, `inbox.ownership.expired`, `inbox.handoff.requested`.

Los 14 nombres se incorporaron como contratos v1.0.0 porque representan hechos de dominio distintos en las máquinas de estado de docs/38 y docs/39: merge solicitado no equivale a merge ejecutado; message accepted no equivale a delivered; handoff requested no equivale a completed; ownership expired es un hecho temporal propio. Los schemas transportan solo IDs, enums, timestamps y reason codes. CRM posee Contact, ContactIdentity, Lead y Activity; Sales posee Opportunity/Pipeline. El namespace histórico `crm.opportunity.*` se conserva por compatibilidad con los dos eventos existentes; renombrarlo exige una versión mayor/migración coordinada. Ver decisión y límites en docs/56.

### 7.2 Comprobaciones de contrato y límite de validación

Comprobación estructural actual: 69 canales; 69 `publish`; 69 `subscribe`; 138 operationIds únicos; 69 referencias de mensajes; 55 tipos y 69 definiciones de payload con correspondencia uno a uno. JSON Schemas parseables como JSON y referencias de payload coherentes. No equivale a lint/parse oficial AsyncAPI, validación JSON Schema con fixtures, contract tests, compatibilidad, broker ni prueba de productores/consumers runtime. Los resultados y bloqueos se registran en docs/56.
