# 49 — Readiness de contratos HTTP y gates de adapters Meta

**Estado:** norma de congelación de contratos y de verificación externa.  
**Fuentes maestras:** rutas propias = docs/47; contratos HTTP = contracts/openapi/platform-v1.yaml; capacidades Meta = docs/09; evidencia fechada = docs/32.  
**Corte de revisión pública:** 2026-11-06. Los resultados públicos no demuestran permisos ni elegibilidad de la app/cuenta de WhatsBusiness.

## 1. Qué está cubierto y qué no

El catálogo docs/47 contiene **288 operaciones REST activas y 8 rutas de ingress de webhook** (296 operaciones HTTP). LEAD-010 es un alias histórico retirado y superseded by SALES-014, con ID no reutilizable.

El OpenAPI incluye las 296 operaciones activas: 11 design-frozen y 285 catalog-only.
- **11 operaciones** conservan contratos design-frozen: PLT-001..005 (health, identidad y tenant context) y CRM-001..006 (Contact + ContactIdentity). Este estado congela sus schemas de negocio; no equivale a revisión independiente, aceptación de producto ni GO-PRODUCTION.
- **285 operaciones** se registran como catalog-only: tienen route, method, operationId/API ID y trazabilidad, pero no tienen request/response schema de negocio congelado.
- Las 8 rutas WH-* llevan autenticación/handshake específico del producto Meta; no deben heredar Bearer Auth del usuario.

**Regla:** que una ruta aparezca en OpenAPI no significa que ya se pueda implementar. El agente debe comprobar x-contract-status, x-contract-ready, x-implementation-allowed y x-required-gate. El allowlist de implementación queda limitado exactamente a PLT-001..005 y CRM-001..006; el freeze de CRM ContactIdentity y la autorización de este slice están registrados en docs/67. Los 285 endpoints catalog-only y cualquier operación fuera del allowlist siguen bloqueados hasta congelar request/response/error schema, authorization scope, idempotency, audit, tenant boundary y pruebas. Design-frozen no equivale a aceptación independiente ni a GO-PRODUCTION. Nunca completar schemas por intuición.

## 2. Procedimiento de congelación por operación

Cada API ID se completa en la misma PR/commit que su TASK:
1. Confirmar API ID, método/path y US/AC/TASK en docs/47; comprobar que no existe otra ruta equivalente.
2. Asignar bounded context owner y reviewer; definir actor, tenant, purpose y permiso requerido.
3. Definir path/query/header parameters, límites, normalización y validación.
4. Definir request schema (campos requeridos, nullability, enums, formato de importes/fechas, tamaños y campos prohibidos).
5. Definir respuesta 2xx exacta, paginación, orden, estados asíncronos y headers.
6. Definir errores 4xx/5xx, códigos estables y regla para no revelar existencia de recursos cross-tenant.
7. Definir Idempotency-Key, optimistic concurrency, timeout, retry y reconciliación para cada side effect.
8. Definir audit event, outbox/inbox, observabilidad y límites de datos sensibles.
9. Generar/compartir DTO + runtime validator desde schema o validar su equivalencia; no mantener contratos manuales divergentes.
10. Añadir contract/unit/integration/E2E/security tests apropiados y ejemplos sin PII.
11. Actualizar OpenAPI, AsyncAPI/JSON Schema si aplica, docs/09 si Meta, docs/19, docs/47 y backlog.
12. Revisión independiente; cambiar x-contract-status a design-frozen solo con evidencia del reviewer.

### Campos mínimos por operación

apiId, operationId, owner/reviewer, summary, US/AC/TASK, boundedContext, actor/purpose, tenant boundary, authz policy, request schema, response schema, error catalog, pagination, concurrency, idempotency, audit, event side-effects, rate limits, privacy classification, tests and evidence.

## 3. Contrato HTTP transversal

- JSON UTF-8; UUID para IDs internos; IDs Meta conservan tipo/string nativo y namespace.
- Fechas RFC 3339/ISO-8601 UTC. Dinero se representa como decimal string + currency ISO 4217; no usar floating point para ledger.
- Bearer OIDC para API de usuario. Webhook ingress usa challenge/firma por producto y raw body protegido, no el token de un usuario.
- Tenant ID en la ruta ayuda a seleccionar recurso; nunca concede acceso. Actor, membership, delegated grant, ownership y purpose se verifican server-side.
- Idempotency-Key para todo comando que pueda producir side effect repetible.
- X-Correlation-ID solo correlaciona; no contiene PII ni sustituye autorización.
- Paginación cursor-based con orden estable y page size limitado cuando la colección lo requiera.
- Problem Details con código interno estable, correlationId y errores por campo; nunca stack, SQL, secretos ni datos de otro tenant.
- HTTP 2xx de un adapter no prueba entrega externa. Mantener accepted/queued/sent/delivered/failed/unknown según el dominio.

## 4. Meta: matriz de permisos/capability observada

La siguiente matriz registra solo datos encontrados en fuentes públicas oficiales de Meta a la fecha indicada. No implica App Review aprobado, autorización de un cliente, país elegible ni acceso real en la cuenta de WhatsBusiness.

| Producto / flujo | Scopes documentados para el flujo consultado | Condición/limitación documentada | Tratamiento WhatsBusiness |
|---|---|---|---|
| WhatsApp Cloud API core | whatsapp_business_management, whatsapp_business_messaging | Meta WhatsApp Cloud API collection lista esos dos permisos; las operaciones de Business Portfolio pueden requerir business_management adicional. | Base de adapter; solicitar business_management solo en capabilities que lean/administren portfolio. |
| Embedded Signup | La guía Meta de Embedded Signup indica App Review y Advanced Access para business_management y whatsapp_business_management para la salida del flujo descrito. | La configuración, assets, system users, token y permisos deben comprobarse en el App Dashboard y en el flujo vigente (actualizar a v4 donde el producto lo requiera). | No asumir que un token de prueba equivale a eligibility; conservar evidence ref por app/config/account. |
| Instagram API — Facebook Login | pages_show_list, instagram_basic, instagram_content_publish, pages_read_engagement, instagram_manage_comments en la colección oficial consultada. | Requiere Page vinculada a cuenta Instagram Professional; no cubre cuentas consumer. Stories publishing está limitado a cuentas Business. | Adapter separado de Instagram Login; validar el scope requerido para cada operación de messaging u otra capability antes de habilitarla. |
| Instagram API — Instagram Login | instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments, instagram_business_content_publish en la colección oficial consultada. | Instagram Login no ofrece acceso a Ads o tagging según su guía. | Mantener auth mode explícito; no mezclar tokens/scopes de ambos login modes. |
| Marketing API / Ads | ads_read para lectura o ads_management para lectura/escritura según el caso de uso; confirmar por operación y App Review. | Marketing API Access Tier es una feature separada de ads_management; desde 2026-05-04 los tiers se muestran como Limited/Full. Meta publicó umbral de 500 llamadas en los últimos 15 días y error rate menor a 15% sobre últimas 500 llamadas para solicitar Full Tier. | Persistir access tier separado de OAuth scopes, asset grants y business eligibility. No inferirlo del token ni codificarlo como permiso. |
| Pages, Messenger, Lead Ads, Threads, CAPI, Flows, Marketing Messages | No hay una matriz completa y confirmada por operación en esta revisión. | Los scopes/tasks dependen de la operación, login, app mode, cuenta, país y acceso. | unknown/disabled hasta registrar fuente y prueba por operación. Prohibido copiar scopes de un producto cercano. |

## 5. Versionado y fuentes Meta

- Meta anunció Graph API v27.0 y Marketing API v27.0 en su Developer News. Eso confirma que existen esas versiones, no que todo endpoint WhatsApp/Instagram/Pages/Threads/Flows use automáticamente v27.0.
- La versión se configura por producto/adapter/operación, nunca como constante global. Antes de tocar un endpoint, abrir su documentación vigente, revisar changelog, endpoint path, campos, permisos, errores, límites y sunset; seleccionar una versión que realmente soporte ese endpoint.
- Embedded Signup, Graph API, Marketing API, WhatsApp Marketing Messages y login modes pueden tener ciclos y requisitos distintos.
- El API version y el nombre de un scope son datos independientes. Marketing API Access Tier, app mode/review, asset tasks/grants, elegibilidad de país/cuenta y consent tampoco son scopes.
- Meta anunció sunset de marketing messages sobre Cloud API para 2027-10-13; la nueva implementación de marketing de WhatsApp debe usar la superficie Marketing Messages API elegible y preservar migración/compatibilidad donde proceda.
- Revalidar la fuente antes del inicio de cada TASK de integración y registrar checked_at. Las fuentes de 2026-11-06 son snapshot, no un permiso permanente.

### Fuentes oficiales consultadas

- Meta Developer News — Graph API v27.0 / Marketing API v27.0: https://developers.meta.com/resources/blog/
- Meta — Marketing API Access Tier, cambio de nombre y eligibility (2026-05-04): https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/
- Meta WhatsApp Cloud API Postman: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- Meta Embedded Signup Postman docs: https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
- Meta Instagram API Postman docs (Facebook Login): https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Meta Instagram API Postman docs (Instagram Login): https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Meta WhatsApp Business Platform overview: https://www.postman.com/meta/whatsapp-business-platform/overview
- Meta Facebook Marketing API overview: https://www.postman.com/meta/facebook-marketing-api/overview

## 6. Adapter design requerido

Un adapter tiene identidad estable provider + product + authMode + apiVersion + operationKey. Debe mantener:
- API version exacta, HTTP endpoint/method y source URL/checked_at.
- OAuth scopes requeridos y concedidos (listas distintas).
- Asset task/grants, app mode/access level/review, Marketing API Access Tier cuando aplique.
- Tipo de cuenta, país/región, product terms y eligibility.
- Request/response schema nativo versionado y fixtures sanitizadas.
- Error code/subcode nativo + mapping canónico no destructivo.
- Rate limit, pagination, timeout, concurrency, retries, idempotency/reconciliation.
- Webhook fields/signature/challenge y mapping de eventos relacionados.
- Data classification, purpose, consent, retention/deletion y pricing/billing effect.
- Evidence state: documented, sandbox-tested, app-reviewed, account-tested, unknown.
- Sunset, owner, migration path y tests de compatibilidad.

No almacenar credenciales en el adapter ni DTO. El vault entrega una credencial de duración/alcance controlado en runtime; logs/traces/fixtures redaccionan token y PII.

## 7. Capability decision — fail closed

effectiveCapability = actorAuthorization ∩ tenantPolicy ∩ purpose/consent/legalBasis ∩ entitlement ∩ OAuthScopes ∩ assetTasks/grants ∩ appReview/accessTier ∩ account/countryEligibility ∩ apiVersion ∩ explicitApproval

Cualquier dato faltante, expirado o contradictorio devuelve deny/disabled con reason code y evidencia requerida. Una conexión válida no implica permiso para todas las operaciones. Las operaciones de escritura externa, mensajería, anuncios y borrados conservan approval/guardrails separados.

## 7.1 Respuestas comunes Problem Details y tenant identifiers

El OpenAPI centraliza los errores reutilizables bajo components.responses: BadRequest, Unauthorized, Forbidden, NotFound, Conflict, UnprocessableEntity, RateLimited, InternalError, ServiceUnavailable y PayloadTooLarge. Las operaciones catalog-only los referencian y mantienen ContractNotFrozen como respuesta default de documentación/gate, no como comportamiento de una implementación futura. Los webhooks no usan Bearer/401 y definen el 413 por límite de body específico del producto.

Los tenantId internos en path se tipan UUID; los IDs externos Meta permanecen strings namespaced. Esta normalización no reemplaza los schemas de request/response ni el permiso por operación.

## 8. Estado de implementación

- El inventario OpenAPI incluye todas las operaciones y marca las no congeladas.
- La capa común de errores y el tipo UUID de tenantId están normalizados; el plan de cierre por bounded context está en docs/55.
- Las 285 operaciones catalog-only siguen sin requestBody ni response schema de negocio congelados; no deben pasar a design-frozen por tener errores comunes.
- No hay todavía contrato Meta completo para cada operación/version ni fixtures de app/cuenta reales.
- No se verificó App Review, scopes concedidos, account access, país/eligibility, Marketing API Access Tier de la app ni acceso a Meta Business.
- El validator CI de contratos es un control estructural; los contract tests de runtime siguen pendientes. No confundir validación de catálogo con endpoints implementados.
