# 75 — US-021: equipos, asignación y handoff

**Fecha:** 2026-11-08  
**Rama:** \`environment/local\`  
**Historia/tarea:** US-021 / TASK-047  
**Estado:** implementación de dominio añadida; CI del commit exacto, runtime, revisión independiente y aceptación pendientes.  
**Producción:** NO-GO.

## 1. Objetivo y aceptación

US-021 habilita colaboración de agentes en Inbox omnicanal:

- AC-021-01: asignación manual y reglas de distribución sujetas a límites de equipo y tenant.
- AC-021-02: handoff bot-humano y agente-agente con actor, motivo y contexto.
- AC-021-03: notas internas y menciones nunca salen al contacto.
- AC-021-04: concurrencia evita respuestas duplicadas y presencia/lock tiene expiración.

TASK-047 depende de TASK-004 (autorización) y TASK-045 (conversaciones, mensajes y adapters). Los controllers/operaciones INB siguen condicionados por contract freeze + G0.

## 2. Estructura implementada

Todo el código nuevo es dominio puro TypeScript y se encuentra bajo \`apps/api/src/inbox/domain\`:

| Archivo | Responsabilidad |
|---|---|
| \`value-validation.ts\` | Validación UUID/ISO, enteros seguros, duración de leases y owner type canónico. |
| \`presence-policy.ts\` | Heartbeat/availability con expiración; estados inválidos o vencidos fallan a offline. |
| \`assignment-policy.ts\` | Asignación manual, round-robin, least-loaded y skill-match con membresía/capacidad/presencia. |
| \`ownership-lease.policy.ts\` | Acquire, renew y release de lease exclusivo; owner, tenant, conversación, TTL y CAS. |
| \`handoff-policy.ts\` | Transferencia humano/bot/agente con autorización, elegibilidad, motivo y ownership versionado. |
| \`internal-note.policy.ts\` | Notas privadas, autor activo, límite de contenido, menciones y misma frontera tenant. |
| \`reply-authority.policy.ts\` | Autoridad de respuesta por lease activo y dedupe por idempotency key + fingerprint. |

El módulo no depende de NestJS, PostgreSQL, RabbitMQ, Valkey ni SDK de Meta. Las decisiones son explícitas e inmutables; los adapters/repositories deberán implementar puertos sin mover reglas al controller.

## 3. Reglas de dominio

### Asignación versus ownership

La asignación determina equipo/usuario responsable y puede cambiar mientras el trabajo se organiza. El ownership lease es independiente: identifica el único actor autorizado a responder durante un período acotado. No se autoriza respuesta por el simple hecho de estar asignado.

### Distribución

El routing automático considera membresía activa, tenant/equipo, skills requeridas, presencia available fresca, capacidad del agente y capacidad del equipo. Estrategias deterministas: round-robin, menor ratio carga/capacidad y coincidencia de skills. El resultado incluye versión siguiente y event draft v1. La política manual puede asignar a agente away/offline de forma explícita, pero devuelve warning; respeta membresía, skills y capacidad.

### Presence y ownership lease

Presence es heartbeat con expiry; caducado/invalidado se normaliza a offline. Ownership lease es exclusividad temporal y queda sujeto a versión esperada, owner, tenant y conversation. Acquire rechaza lease activo, renew solo lo ejecuta el owner actual y release requiere el owner o un override supervisor server-side. Duración válida se restringe a 1 s–15 min como guardrail del dominio, y la configuración final debe revisarse al congelar contrato.

**Importante:** las policies no proporcionan exclusión distribuida por sí mismas. El repository debe usar compare-and-swap/bloqueo transaccional sobre PostgreSQL y persistir el cambio del agregado más el outbox en una transacción. La expiración efectiva requiere scheduler/worker que procese leases vencidos de forma idempotente.

### Handoff

El handoff es una transición auditada y con motivo. Requiere actor owner o override autorizado, tenant/conversation coincidentes, versión actual, lease vivo, destino elegible y target lease. Prepara \`inbox.handoff.requested\` y una propuesta de ownership; no emite \`inbox.handoff.completed\` ni afirma éxito antes de confirmar el commit durable. Los consumers deberán suprimir respuestas automáticas competidoras.

### Notas privadas

La nota se expresa como agregado interno con \`visibility: internal\` y \`externalDelivery: forbidden\`. Author y usuarios mencionados deben tener membership activa en el mismo tenant; límite de 4.000 puntos de código y 20 menciones. No se representa como Message del proveedor y no se creó un evento de publicación porque el catálogo actual no lo define.

### Doble respuesta e idempotencia

Una respuesta exige lease activo cuyo owner sea el actor y tenant/conversation exactos. El store de idempotencia deberá usar unique constraint por tenant + conversation + key y guardar un hash SHA-256 del payload. Una repetición con mismo hash devuelve replay metadata y nunca dispatch; reutilizar key con payload distinto es conflicto. Si la autorización falla, no se revela el message ID previo. Outbox y registro idempotente deben persistirse atómicamente; esta garantía no la da una policy pura sin DB.

## 4. Eventos y contratos

Se respetan los esquemas v1 existentes:

| Evento | Resultado del slice |
|---|---|
| \`inbox.assignment.changed\` | Event draft coincide con aggregate \`conversation_assignment\` y data \`conversationId/assignmentId/assigneeUserId\`. |
| \`inbox.ownership.acquired\` | Event draft coincide con aggregate \`ownership_lease\` y data \`conversationId/leaseId/ownerType\`. |
| \`inbox.handoff.requested\` | Event draft coincide con aggregate \`handoff\` y data \`conversationId/handoffId/fromOwnerType/toOwnerType/reasonCode\`. |
| \`inbox.handoff.completed\` | No se produce por policy; requiere consumer/orquestación tras commit. |
| \`inbox.ownership.expired\` | No se produce por policy; requiere scheduler persistente. |
| Internal note | No hay event schema v1 autorizado; no se inventa. |

INB-006..014 e INB-018 permanecen \`catalog-only\`, \`x-contract-ready=false\`, \`x-implementation-allowed=false\` y con gate \`API-CONTRACT-FREEZE+G0\`. No se habilitan endpoints por el hecho de que exista código de dominio.

## 5. Pruebas registradas

Se han añadido seis archivos de pruebas al target Nx \`api:test\`:

| TEST ID | Spec | Riesgo principal |
|---|---|---|
| TEST-INBOX-001 | \`assignment-policy.spec.ts\` | Manual/team/tenant assignment, version, authorization y límites. |
| TEST-INBOX-002 | \`assignment-policy.spec.ts\` | Fair routing, skills, membership, presence y capacity. |
| TEST-INBOX-003 | \`ownership-lease.policy.spec.ts\` | Acquire/renew/release, expiración, versión y doble acquire. |
| TEST-INBOX-004 | \`handoff-policy.spec.ts\` | Handoff bot-human/agent-agent, target, tenant, motivo y actor. |
| TEST-INBOX-005 | \`internal-note.policy.spec.ts\` | No external delivery, mentions, length y membership. |
| TEST-INBOX-006 | \`reply-authority.policy.spec.ts\` | Active owner, idempotent retry, payload mismatch y no disclosure. |
| TEST-INBOX-007 | \`presence-policy.spec.ts\` | Heartbeat freshness, status y expiry fail-closed. |

Las suites contienen **36 casos unitarios declarados**. Al escribir este registro todavía no se ha inspeccionado un resultado de Source CI/CodeQL del commit de este slice; no se declara ningún test como ejecutado/pasado hasta que la pipeline correspondiente termine.

## 6. Trabajo pendiente para cierre de TASK-047

1. Contract freeze por operación para INB-006..014 e INB-018: request/response/error schemas, authz scope, tenant/asset boundaries, idempotency, audit, privacy/retention, pagination/rate limits, examples y reviewer.
2. Implementar repositories/ports y migraciones Inbox: Teams, TeamMembership, AgentPresence, Assignment history, OwnershipLease, Handoff, InternalNote e Inbox idempotency; RLS y grants mínimos por tenant.
3. Probar CAS/races con PostgreSQL real y múltiples conexiones/workers; unique constraint de idempotency; rollback; outbox atómico y replay/dedupe.
4. Añadir scheduler/consumer para lease expiry/renewal y workers de presencia; lock refresh y recuperación tras crash.
5. Implementar authorization guards + use cases + controllers después del G0 y sin importar internals de otros contexts.
6. Integrar suppression de bot/human routing, Messenger/Instagram/WhatsApp capabilities y TASK-045; no asumir paridad de canal.
7. Añadir Inbox UI (assignment queue, presence, lock, handoff, internal notes) con accesibilidad y E2E por canal.
8. Source CI/CodeQL del commit exacto, contract tests, integration/E2E/security/performance, revisión independiente y aceptación explícita del Product Owner.

## 7. Estado

El **slice de políticas de dominio está escrito y registrado en el target de pruebas**; sus resultados CI aún deben comprobarse. La historia US-021 y TASK-047 siguen **\`in_progress\`** y no se declaran verified/accepted porque faltan contratos habilitados, persistencia/worker/consumers, integración real, frontend y revisión/aceptación. No se enviaron mensajes externos, no se llamaron APIs de escritura Meta, ni se desplegó a producción. GO-PRODUCTION continúa NO-GO.
