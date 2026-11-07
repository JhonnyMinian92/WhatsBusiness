# 55 — Plan de cierre de contratos OpenAPI por bounded context

**Rama:** environment/local · **Corte:** 2026-11-06  
**Estado:** contrato transversal ampliado; contratos de negocio de las 292 operaciones todavía NO congelados.  
**Fuente canónica:** contracts/openapi/platform-v1.yaml; inventario: docs/47; procedimiento: docs/49.

## 1. Resultado comprobado de la ampliación transversal

El OpenAPI contiene 297 operaciones HTTP con API IDs únicos: 5 design-frozen y 292 catalog-only. Se incorporó a las 292 operaciones catalog-only:
- Perfil común problem-details-v1.
- Respuestas compartidas para 400, 401 (solo API autenticada), 403, 404, 409, 422, 429, 500 y 503.
- Respuesta default con ContractNotFrozen, para dejar explícito que la especificación aún no autoriza implementación.
- Perfil webhook separado sin Bearer/401 y con 413 Payload Too Large para los endpoints de ingress.
- Los parámetros de ruta tenantId se tiparon como UUID en las operaciones tenant-scoped.

Esto cierra la semántica de errores y una inconsistencia de tipos, no el contrato de negocio.

## 2. Estado técnico restante

| Verificación estática del OpenAPI | Resultado |
|---|---:|
| Operaciones / API IDs únicos | 297 / 297 |
| Design-frozen | 5 |
| Catalog-only | 292 |
| Catalog-only con perfil común de errores | 292 |
| Catalog-only con requestBody de negocio | 0 |
| Catalog-only con request y response marcados pending | 292 |
| Operaciones con x-implementation-allowed=true | 0 |

**No marcar ninguna de las 292 como design-frozen.** El OpenAPI no contiene aún los schemas request/response, permisos específicos ni el audit/event side-effect completo para esas operaciones. El response ContractNotFrozen es una marca de diseño/gate, no una respuesta que una API implementada deba emitir en runtime.

## 3. Paquetes de cierre por familia

El número de operaciones incluye las cinco PLT ya congeladas. Los rangos API ID deben resolverse desde OpenAPI/docs/47, no asumir que los IDs numéricos son contiguos si se ha retirado alguna operación.

| Familia | Operaciones | Base de dominio/insumos | Contratos que debe cerrar el owner |
|---|---:|---|---|
| PLT | 7 (5 congeladas) | docs/37, docs/42, ADR-011..025 | Settings tenant (PLT-006..007), lifecycle, optimistic concurrency, audit |
| IAM | 20 | docs/37, docs/44 | Organization/Tenant provisioning, invitations, membership, roles, permissions, approvals, state transitions |
| PAR | 7 | docs/37, docs/44 | Partner org/grants, subject/asset/action/purpose/expiry, revoke, JIT approval |
| META | 16 | docs/49 y documentación oficial por operación/producto/login mode | OAuth start/callback, connection lifecycle, asset sync, scopes vs grants vs access tier, credential references; nunca exponer tokens |
| WA | 9 | docs/39, docs/49 y contrato Cloud API por endpoint | Phone number, message discriminated union, media, receipts, delivery state, native errors, consent/capability |
| WAM | 9 | docs/49 + fuente oficial de WhatsApp templates | Template components, language/category, revisions, review state, supported mutations |
| WAF | 8 | docs/49 + documentación oficial de Flows/Data Exchange | Flow definition/version, validation, publish, encrypted data-exchange request/response, signature/timeout |
| WAMK | 7 | docs/49 + elegibilidad Marketing Messages | Onboarding/capability, consent/frequency, pricing source/version, submission and delivery |
| FB | 14 | docs/49 + endpoint docs Meta Pages/Messenger | Page tasks/grants, posts, comments/messages, media, native error and policy window |
| IG | 12 | docs/49 + endpoint docs Instagram Login/Facebook Login separados | Account login mode, media containers, publish, comments/messaging capability, native payload |
| TH | 6 | docs/49 + documentación oficial Threads por endpoint | Profile, post draft/publish, replies, rate limits, scopes, sunset |
| LEAD | 10 | docs/38, docs/49 + Lead Ads docs | Form/lead fields, sync cursor/checkpoint, provenance, webhook dedupe |
| SALES | 14 | docs/38 | Pipelines/stages, opportunities, amount decimal+currency, transitions, activities |
| ADS | 27 | docs/49 + Marketing API docs por operación | Draft vs external mutation, objectives/targeting/budget, approval, spend caps, reconciliation |
| CAPI | 4 | docs/49 + Conversions API docs | Event source, event_id, consent, user data minimization, dedupe, diagnostics |
| CRM | 17 | docs/38 | Contact/identity/merge, custom fields, company, provenance, reversible merge |
| INB | 18 | docs/39 | Conversation/message discriminated unions, assignment, lease CAS, handoff, notes, read cursor, presence |
| AUTO | 13 | docs/40 | Workflow graph/version, node/action schemas, simulation, publish/pause, execution/retry/cancel/kill switch |
| AI | 8 | docs/41 | Suggestion/summary inputs, provider policy, feedback, quota/usage, redaction; provider external disabled until approval |
| PRIV | 10 | docs/44 y policy/legal approval | Consent evidence, privacy requests, identity verification, export/delete job, retention and legal hold |
| OPS | 11 | docs/44, docs/45, docs/43 | Audit query/redaction, queues/DLQ, replay, health/operations and authorization |
| BILL | 7 | docs/37, ADR-013..025, pricing decisions | Subscription/entitlements, usage ledger, decimal money, invoice/payment lifecycle, provider decisions |
| DEV | 11 | docs/43, docs/44 | API client/scopes, one-time secret display, rotation/revocation, webhook subscriptions, rate limits |
| CI | 18 | docs/44 + product discovery decisions | Snapshot/provenance, metrics, recommendations, experiments, creative assets, freshness and causal caveats |
| AGT | 6 | docs/41, docs/44, TASK-080 | Tool manifest, input/output schema, approval, execution state, cancellation, kill switch, external side-effect guard |
| WH | 8 | docs/43, docs/49 + webhook docs by product | Per-product challenge/signature, raw-body integrity, size, durable ACK, dedupe, retry and 2xx contract |

## 4. Criterios obligatorios por operación antes de congelar

1. API ID, operationId, route/method, US/AC/TASK, bounded context, owner and independent reviewer.
2. Actor, purpose, permission key, tenant/asset boundary, ownership, consent, entitlement and approval policy.
3. Path/query/header params with formats, limits, normalization and examples.
4. Request body with required/optional/null semantics, enums, formats, size limits, forbidden fields and additionalProperties: false where safe.
5. Exact success response, response headers, pagination and async job state semantics.
6. Error catalog with stable codes, retryability, cross-tenant non-disclosure and Retry-After where applicable.
7. Idempotency behavior, concurrency/If-Match, timeout, retry/reconciliation and duplicate request behavior.
8. Audit event, outbox/inbox side effects, data classification, retention/redaction and rate limit.
9. Contract examples and positive/negative fixtures; schema resolver/linter output.
10. DTO/runtime validation parity and independent review evidence.

## 5. Orden recomendado de cierre

1. PLT-006..007 + IAM + PAR: establish identity, tenant, grant and approval contracts.
2. CRM + Inbox + event/webhook boundary: define canonical customer/conversation state and durable ingress.
3. WhatsApp/social/Meta adapters: close one product and login mode at a time, sourced from current Meta docs; keep capability unknown until account tests.
4. Automation + AI + AGT: only after events, permissions, privacy and approval schemas are stable.
5. Ads/CAPI/CI + billing: external writes remain approval-gated; monetary values use decimal strings and source/versioned rate cards.
6. PRIV/OPS/DEV and remaining platform operations; verify cross-tenant and audit behavior.

## 6. Handoff / implementation gate

Each operation owner must update OpenAPI and the relevant domain/event schemas in the same change as its contract review. Then update docs/47, docs/19, docs/53 and the related TASK acceptance tests. Reviewer must be different from author. Only after schema validation, contract tests and approval may the operation move from catalog-only to design-frozen. G0 remains a separate gate; design-frozen never means implementation/deployment is authorized.

No request/response fields, Meta scopes, API versions, error codes or account capabilities may be inferred solely from an operation summary. Missing business decisions must be recorded as explicit blockers and returned to the relevant product/domain owner.


## 7. Corrección estructural y revisión transversal (2026-11-06)

Se encontró y corrigió un problema de YAML en las 292 operaciones catalog-only: cada objeto `responses` contenía un placeholder `default` descriptivo y, posteriormente, una segunda clave `default` con referencia a `ContractNotFrozen`. Se eliminó el placeholder duplicado y se conservó exactamente una respuesta `default` por operación. El estado de negocio no cambia: las 292 operaciones continúan catalog-only y sin schemas de request/response específicos.

La revisión de ADR, límites de módulos, tenancy y criterios de aceptación se documenta en [docs/56](56-ARCHITECTURE-REVIEW-AND-ACCEPTANCE-GATES.md). La ampliación AsyncAPI (55 publish + 55 subscribe y correlación de mensaje), junto con la reconciliación de 14 propuestas no catalogadas de CRM/Inbox, se registra en [docs/50](50-EVENT-CATALOG-AND-VERSIONED-SCHEMAS.md).

No se ha confirmado todavía la ejecución satisfactoria del workflow de validación OpenAPI/AsyncAPI/JSON Schema ni la validación de contract tests de runtime; la eliminación de claves duplicadas se verificó por recuento estructural antes de guardar el archivo. No declarar el OpenAPI como YAML-validado ni los contratos de negocio como completos hasta ejecutar tooling formal y completar owner/reviewer/schema/tests por operación.
