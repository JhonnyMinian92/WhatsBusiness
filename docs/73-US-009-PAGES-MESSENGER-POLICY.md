# 73 — US-009: políticas técnicas de Facebook Pages y Messenger

**Fecha:** 2026-11-08  
**Historia:** US-009 — Pages y Messenger  
**Tarea principal:** TASK-019  
**Dependencias:** TASK-008 (conexión segura), TASK-010 (capability runtime), TASK-027/028 (webhooks), TASK-045..047 (Inbox/ownership/handoff).  
**Estado:** slice de dominio implementado; TASK-019 y US-009 continúan \`in_progress\`.

## 1. Alcance

Se crea la capa de políticas puras para operaciones Messenger cuya documentación oficial permite fijar requisitos sin inferir permisos de Pages u otros productos Meta. Se reutiliza \`MetaCapabilityEvaluator\`, \`MetaEvidence\`, el catálogo de activos \`facebook_page\` y envelopes AsyncAPI existentes.

No se crean controllers ni se activan FB-001..014 / WH-003: esas operaciones siguen \`catalog-only\` y fuera del allowlist de docs/49. Tampoco se crea una segunda tabla de conversaciones ni un segundo agregado Page; Inbox y Meta Control Plane conservan la propiedad de esos dominios.

## 2. Evidencia oficial por operación

### Lectura de conversaciones

La colección oficial Meta Conversations API indica:
- Page access token solicitado por una persona con tarea \`MESSAGING\` o \`MODERATE\` en la Page.
- Permisos \`pages_manage_metadata\`, \`pages_read_engagement\` y \`pages_messaging\` para Messenger Conversations API.
- Advanced Access para acceder a conversaciones con personas que no tienen rol en la app de mensajería, Instagram Professional Account, Facebook Page o business.

Fuente: https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a

### Envío de mensajes

La colección oficial Meta Send API indica:
- Page access token solicitado por una persona con tarea \`MESSAGE\` en la Page.
- Permiso \`pages_messaging\`.
- El destinatario debe haber enviado un mensaje a la Page durante las últimas 24 horas o haber aceptado recibir mensajes fuera de la ventana estándar de 24 horas.

Fuente: https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api

La evidencia documental no demuestra que la app ni una Page real de WhatsBusiness tenga scopes, App Review, Advanced Access o tareas concedidas. La capacidad se mantiene \`unknown\` hasta que el runtime aporte evidencia vigente y atribuible a esa conexión/activo.

## 3. Código agregado

| Componente | Responsabilidad |
|---|---|
| \`MetaCapabilityDefinition.requiredAnyAssetTasks\` | Modela requisitos OR sin debilitar las tareas obligatorias AND existentes. |
| \`requiredAccessTokenType\` y \`MetaCapabilityEvidence.accessTokenType\` | Comprueban el tipo de token requerido por operación con la validación de procedencia/vigencia de \`MetaEvidence\`. |
| \`MetaCapabilityEvaluator\` | Deniega si ninguna tarea alternativa existe, o devuelve \`unknown\` si falta evidencia; User token no sustituye al Page token. |
| \`facebook-messenger-capabilities.ts\` | Define permisos/tareas de lectura y envío; exige que el caller entregue la versión Graph verificada por operación. |
| \`messenger-conversation-access.policy.ts\` | Exige Advanced Access cuando el participante carece de rol en los activos/app. |
| \`messenger-send.policy.ts\` | Aplica ventana estándar de 24 h, finalidad de soporte, capability disponible y ownership actual. |
| \`messenger-handoff.policy.ts\` | Comprueba autorización, tenant y versión esperada, y prepara \`inbox.handoff.requested\` conforme al envelope y payload v1 existentes. |

### Límites de seguridad de las policies

- La ventana estándar se calcula desde el último mensaje entrante del destinatario; en el límite exacto de 24 h ya está cerrada.
- La ruta \`HUMAN_AGENT\` exige emisor humano, ownership humano, finalidad de soporte y deadline confiable entregado por un proveedor server-side. El código **no calcula ni presume una duración** para esa extensión; el proveedor runtime y su evidencia oficial siguen pendientes. Sin deadline se deniega.
- No se habilitan mensajes promocionales mediante este slice.
- El handoff produce un borrador validado del evento solicitado; no lo publica ni modifica ownership. Inbox debe persistirlo en transactional outbox, coordinar el agente y completar lease/CAS.
- No se asume que HTTP 2xx signifique entrega; este slice no contiene transporte ni sender.

## 4. Pruebas agregadas

Cuatro suites al target \`api:test\`:
- \`facebook-messenger-capabilities.spec.ts\`
- \`messenger-conversation-access.policy.spec.ts\`
- \`messenger-send.policy.spec.ts\`
- \`messenger-handoff.policy.spec.ts\`

También se amplía \`meta-capability-evaluator.spec.ts\` para tareas alternativas AND/OR, evidencia desconocida y tipo de token.

## 5. Criterios de aceptación

| Criterio | Estado del slice | Trabajo restante |
|---|---|---|
| AC-009-01 — Page tasks y scopes verificados | Parcial: definiciones Messenger por operación y evaluación fail-closed. | Conexión Meta real, inventario paginado de Pages, persistencia/RLS, refresco de grants y evidencia por Page/app; operaciones Page sin fuente suficiente permanecen unknown. |
| AC-009-02 — ventanas y políticas Messenger | Parcial: policy pura para 24 h, ownership, soporte y bloqueo fail-closed fuera de ventana. | Conectar al sender/worker Inbox, provider oficial de extensiones/consent, receipts y reconciliación webhook. |
| AC-009-03 — handoff humano y eventos trazables | Parcial: validación tenant/version/authorization y borrador conforme a \`inbox.handoff.requested\`. | Persistencia transaccional, lease/CAS, asignación/presencia, bot suppression, consumer idempotente y pruebas concurrencia/E2E Inbox. |

## 6. Gates todavía abiertos

1. TASK-008: Meta OAuth/Embedded Signup, conexión y token vault; falta runtime que entregue Page access token de un tenant autorizado.
2. TASK-010: capability registry/persistencia/refresh y endpoints META-014/015 aún no están operativos.
3. TASK-027/028: faltan handlers reales Facebook/Messenger, fixtures de conformance y pruebas con app/cuenta elegible.
4. TASK-045..047: Inbox aún no implementa persistencia Conversation/Message/OwnershipLease/Handoff ni transactional outbox de negocio.
5. FB-001..014 y WH-003 siguen catalog-only; no se cambió OpenAPI, allowlist ni se publicó API nueva.
6. No se realizaron escrituras a Meta, no se usaron tokens/cuentas reales y no se habilitó producción.

**Estado global:** TASK-019 y US-009 permanecen \`in_progress\`. El código debe pasar Source CI del commit exacto, review independiente, gates de seguridad/privacidad y aceptación Product Owner antes de \`verified\`/ \`accepted\`. GO-PRODUCTION permanece NO-GO.
