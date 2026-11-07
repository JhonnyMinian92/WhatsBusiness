# 40 — Especificación funcional: Automation Engine y chatbots deterministas

**Relacionado:** TASK-037, TASK-048..049, US-022, US-023, PD-005/019.  
**Estado:** diseño inicial listo para review; no implementado.

## 1. Objetivo

Permitir workflows versionados, auditables, simulables y recuperables mediante reglas deterministas. El motor responde a eventos internos, horarios y cambios de estado; no ejecuta código arbitrario del cliente ni de agentes.

## 2. Componentes

- Workflow: identidad, tenant, nombre, estado, trigger, versión publicada y owner.
- WorkflowVersion: definición inmutable, schemaVersion, hash, author y publishedAt.
- Trigger: evento tipado, schedule o acción manual.
- Condition: expresión declarativa tipada.
- Action: acción allowlisted con input schema, permission, purpose, risk class y timeout.
- Execution: instancia por trigger con estado, version, correlation y resultado.
- ExecutionStep: estado y evidencia de cada nodo.
- ExecutionLock: lease/claim para impedir doble ejecución.
- AutomationPolicy: límites por tenant, channel, action y horario.
- DeadLetterExecution: ejecución fallida no recuperable pendiente de revisión.

## 3. Modelo del workflow

Definición versionada declarativa (JSON/YAML validado); el runtime solo acepta nodos conocidos y schemas publicados. No evalúa JavaScript, Python, SQL, shell, plantillas con ejecución ni expresiones dinámicas arbitrarias.

Nodos iniciales: Trigger, Filter, Condition, Delay/Schedule, Branch, Assign, AddTag, CreateTask, UpdateLeadStage, SendReplyDraft, RequestHumanHandoff, NotifyInternal. `SendMessage`, publicación y gasto son acciones externas de alto riesgo: por defecto se convierten en draft/approval request y no se ejecutan desde un workflow sin política y aprobación específicas.

Cada acción tiene:
- input/output schema versionado;
- permiso mínimo y purpose;
- idempotency strategy;
- timeout y clasificación retryable;
- límites de frecuencia/concurrencia;
- compensación o indicación explícita de no reversible;
- auditoría requerida.

## 4. Estados y semántica de ejecución

Workflow: `draft`, `validated`, `published`, `paused`, `archived`.  
Execution: `pending`, `claimed`, `running`, `waiting`, `succeeded`, `failed`, `cancelled`, `expired`, `dead_letter`.

- Publicar crea versión inmutable; editar una versión publicada crea otra versión.
- Cada evento/trigger obtiene una execution key determinista basada en workflow version + trigger identity/event ID.
- Unique constraint evita ejecutar dos veces el mismo episodio.
- Claim usa lock/lease atómico, owner y expiration; stale reclaim verifica estado y vuelve a validar condiciones.
- Retries exponenciales con jitter solo para errores clasificados retryable; no reintentar efecto externo ambiguo sin reconciliación.
- Límites de intentos/tiempo y cuotas son configurables por tenant. El default del producto debe ser conservador y documentado por acción.
- Kill switch global, tenant y workflow detiene nuevas ejecuciones; las acciones ya enviadas se reconcilian.

## 5. Consistencia y seguridad

1. Outbox transaccional origina eventos internos.
2. Consumer valida tenant, workflow enabled/version, trigger source y autorización.
3. Execution se crea idempotentemente.
4. Evalúa nodos y escribe cada step status/evidence.
5. Antes de acción externa vuelve a validar permission, grant, consent, capability, rate limit, policy y aprobación.
6. Side effects mediante adapters; nunca ejecutar lógica del proveedor en el engine.
7. Timeout ambiguo = unknown + reconcile, no retry ciego.
8. Logs con IDs/códigos y datos redacted; payload sensible en storage con referencia y retención configurable.

Prompt injection o texto de usuario nunca se interpreta como definición de workflow o autorización.

## 6. Simulación y publicación

La UI debe permitir visualizar trigger, condiciones, ramas, acciones, límites y posibles datos. El simulador usa fixtures sintéticas y no produce side effects. Publish requiere validación de schema, grafo acíclico donde aplique, permisos del autor, quotas, approval cuando corresponda y snapshot immutable.

Pausar workflow impide nuevos claims. Cancelar execution distingue pasos aún cancelables de efectos ya iniciados. Versiones y cambios quedan auditados.

## 7. API propuesta

- `GET/POST /v1/tenants/{tenantId}/workflows`
- `GET/PATCH /v1/tenants/{tenantId}/workflows/{workflowId}`
- `POST /v1/tenants/{tenantId}/workflows/{workflowId}/validate`
- `POST /v1/tenants/{tenantId}/workflows/{workflowId}/simulate`
- `POST /v1/tenants/{tenantId}/workflows/{workflowId}/publish`
- `POST /v1/tenants/{tenantId}/workflows/{workflowId}/pause`
- `GET /v1/tenants/{tenantId}/workflow-executions`
- `POST /v1/tenants/{tenantId}/workflow-executions/{executionId}/retry` (solo retry seguro/permitido).

## 8. Métricas

Executions accepted/succeeded/failed/dead-letter; latency por step; retry count; stale lock reclaim; queue age; policy denies; cost/usage por tenant; efecto externo unknown; cancel/kill-switch response.

## 9. Criterios de aceptación

- Workflow publicado es inmutable y cada ejecución referencia versión exacta.
- Misma identidad de evento/trigger no crea más de una ejecución.
- Dos workers concurrentes no reclaman la misma ejecución activa.
- Reclaim de lease vencido valida de nuevo condiciones y estado antes de continuar.
- Acción fuera de allowlist/schema falla cerrada.
- Pausa/kill switch previene ejecuciones nuevas y controla las pendientes según estado seguro.
- Acción externa no se ejecuta sin tenant/actor/purpose/capability/consent/approval aplicable.
- Fallo ambiguo no duplica un mensaje/cambio de presupuesto.
- Simulación no tiene side effects y usa datos sintéticos.
- Toda acción queda auditada con workflow/version/execution/step/actor.

## 10. Dependencias

TASK-028 event platform, TASK-004/005 authorization and approvals, TASK-029 audit/observability, TASK-045 Inbox contracts, TASK-050 AI Gateway only for optional suggestion nodes. Los workflows deterministas no dependen de un proveedor LLM.
