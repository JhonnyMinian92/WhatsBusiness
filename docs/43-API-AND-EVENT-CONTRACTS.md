# 43 — Contratos HTTP, eventos y convenciones de integración

**Relacionado:** TASK-010, TASK-027..030, TASK-034..038, TASK-040, US-001..032.  
**Estado:** contrato inicial de plataforma; los archivos versionados en contracts/ son referencia ejecutable de partida y deben ampliarse bajo review.

## 1. Principios HTTP

- Base path: /v1; versionado semántico separado de versiones Meta.
- JSON UTF-8; fechas ISO-8601 UTC; IDs UUID; importes string decimal + currency.
- Autenticación OIDC Bearer; autorización siempre server-side.
- Tenant aparece en la ruta para recursos tenant-scoped; se valida membership/grant. Tenant ID no es secreto ni autorización.
- Idempotency-Key obligatoria en comandos con side effects y operaciones repetibles.
- Correlation ID generado por servidor o validado desde input; nunca usar PII como correlation.
- Paginación cursor-based con orden estable; límite acotado por endpoint.
- Contratos de errores tipados y sin revelar si un objeto de otro tenant existe.
- OpenAPI es fuente versionada. DTO/runtime validators deben generarse o comprobarse contra el schema para evitar drift.

## 2. Error envelope

Ejemplo ilustrativo:

    {
      "type": "https://docs.whatsbusiness.example/problems/validation",
      "title": "Validation failed",
      "status": 422,
      "code": "VALIDATION_ERROR",
      "detail": "One or more fields are invalid.",
      "correlationId": "uuid",
      "errors": [{"path": "field", "code": "INVALID_VALUE"}]
    }

Las URLs definitivas pueden reemplazarse antes de publicar documentación externa. Nunca incluir stack trace, SQL, token, app secret, webhook body personal ni detalles cross-tenant.

## 3. Headers y convenciones

- Authorization: Bearer OIDC access token.
- Idempotency-Key: clave opaca generada por cliente para writes side-effecting.
- X-Correlation-ID: UUID opcional; servidor lo valida o genera.
- ETag / If-Match o version field para optimistic concurrency en recursos editables.
- Retry-After en rate limiting cuando aplique.
- X-Request-ID se devuelve para soporte sin exponer datos sensibles.

No aceptar tenant context únicamente desde header. No usar request header para modificar el actor.

## 4. Contrato de eventos

Cada evento interno cumple contracts/schemas/event-envelope.schema.json:
- id: ID único del evento.
- type: nombre estable domain.event.
- schemaVersion: versión semántica del payload.
- occurredAt: fecha UTC.
- tenantId: UUID o null solo para eventos realmente globales.
- aggregate: type, id, version.
- source: servicio/contexto productor.
- correlationId y opcional causationId.
- data: payload específico validado.

Nunca introducir PII completa, secretos o tokens en routing headers. Transportar referencias protegidas cuando sea imprescindible. Consumidores toleran campos opcionales desconocidos según política y validan schema version.

## 5. Semántica del broker

Entrega at-least-once. Un consumer debe validar envelope/schema, comprobar tenant/context y autorización, reclamar idempotencia (unique consumer + event ID), ejecutar transacción y escribir dedupe + outbox, ACK solo después de commit, enrutar fallos retryable a retry policy y no recuperables a DLQ. Replays son operaciones autorizadas, auditadas y limitadas.

No prometer exactly-once end-to-end. Orden global no está garantizado; particionar/serializar por aggregate si el dominio lo requiere.

## 6. Webhooks externos

- Validar challenge/verify token y firma conforme al producto Meta y su contrato actual.
- Limitar body size, content type, skew/replay y egress.
- Resolver tenant/asset con subscription registry; nunca confiar en tenant ID declarado por payload.
- Guardar envelope + payload protegido + hash + metadata de autenticidad antes de ACK.
- Deduplicar por provider/product/event ID o clave compuesta oficialmente soportada.
- Procesar fuera del request HTTP con workers y DLQ.
- Separar eventos de mensajes, receipts, leads, ads y lifecycle de asset.
- Revalidar contrato/algoritmo por versión Meta y cuenta.

## 7. Contratos de adapters Meta

Cada adapter versionado contiene Provider Product + API Version + operation key; request/response schemas y fixtures sanitizadas; errores nativos + canonical mapping; capability descriptor y requirements de scopes/tasks/tier/eligibility; rate limit/pagination/retry semantics; timeout, idempotencia y estado desconocido; fecha/fuente de validación y evidencia de sandbox/app/cuenta; sunset/deprecation plan.

## 8. Contract tests

Validar payloads positivos/negativos, campos desconocidos, enum drift y errores. Fixtures sin PII/tokens; no fabricar respuesta exitosa para endpoint no habilitado. Diferenciar source-confirmed de account-tested. Correr suite del adapter antes de cambiar API version. Breaking changes requieren CR, versionado y deprecation window.

## 9. Archivos iniciales

- contracts/openapi/platform-v1.yaml: identidad pública mínima, selección de tenant y health.
- contracts/asyncapi/platform-events-v1.yaml: envoltorio y eventos de plataforma.
- contracts/schemas/event-envelope.schema.json: JSON Schema de evento.
- Las nuevas rutas se agregan al spec con owner y AC, no solo como comentario en PR.

## 10. Congelación y estado de contratos

La lista completa de API IDs se refleja en OpenAPI. Solo operaciones design-frozen tienen contrato de diseño suficiente para implementación; catalog-only requiere completar parámetros, request/response/error schemas, autorización, tenant boundary, idempotency/audit y tests antes de codificar. Ver [docs/49](49-API-CONTRACT-READINESS-AND-META-ADAPTER-GATES.md).

Los eventos internos v1.0.0 están definidos por [docs/50](50-EVENT-CATALOG-AND-VERSIONED-SCHEMAS.md), AsyncAPI y domain-events-v1.schema.json. Los payloads son mínimos, cerrados y basados en referencias. No incluir PII ni raw webhook payload. El envelope no sustituye la autorización del consumer.

La reutilización de transportes, validators, outbox/inbox, retry, dedupe y error mapping es obligatoria cuando ya exista una implementación cohesionada; consultar docs/48. Ningún módulo debe crear una segunda implementación privada por comodidad.
