# 19 — End-to-end traceability and impact analysis

## 1. Traceability chain
Every user-visible outcome must be traceable through:

`Owner request → Product requirement → Epic → User story → Acceptance criterion → TASK → ADR/CR/BUG/API → bounded context/module → test → evidence → release gate → owner acceptance`

No orphan requirement, story, task, provider capability or critical test is allowed at release. A checkbox is not evidence.

## 2. Identifier rules
- Requirement: REQ-####; story: US-###; task: TASK-###.
- Epic: EP-##; bug: BUG-####; change: CR-####; decision: ADR-###.
- API capability: API-{PRODUCT}-{CAPABILITY}; test: TEST-{DOMAIN}-{NNN}; release gate: REL-G#.
- IDs are immutable and never reused. Supersede; do not recycle.
- Concrete code paths and test names are recorded only after repository inspection.

## 3. Initial story-to-task coverage
| Story | Outcome | Baseline tasks | Key evidence required |
|---|---|---|---|
| US-001 | Tenant isolation and organization lifecycle | TASK-001..003 | Cross-tenant allow/deny, tenant-scoped jobs/cache/storage |
| US-002 | Roles, permissions and approvals | TASK-004..005 | Authorization matrix, escalation and approval audit |
| US-003 | Secure Meta authorization/onboarding | TASK-006..008 | OAuth replay/CSRF tests, vault rotation, onboarding evidence |
| US-004 | Assets and capabilities | TASK-009..010 | Asset ownership/grant drift and capability explainability |
| US-005 | WhatsApp messaging/media | TASK-011..013 | Adapter contracts, media safety, delivery state machine |
| US-006 | Template lifecycle | TASK-014..015 | Template state/category/locale and validation tests |
| US-007 | WhatsApp Flows | TASK-016 | Encryption, replay and data exchange contract |
| US-008 | WhatsApp marketing/cost | TASK-017..018 | Eligibility, consent/policy, versioned rate card/reconciliation |
| US-009 | Facebook Pages/Messenger | TASK-019 | Page tasks, scopes, messaging policy and webhook tests |
| US-010 | Instagram professional capabilities | TASK-020..021 | Login-mode matrix, per-capability contract suite |
| US-011 | Lead Ads | TASK-022..023 | Webhook/retrieval dedupe, provenance and retention |
| US-012 | Ads lifecycle | TASK-024..025 | Draft/approval, spend cap, kill switch, Insights reconciliation |
| US-013 | Conversion measurement | TASK-026 | Consent, event ID dedupe, attribution evidence |
| US-014 | Webhook/event reliability | TASK-027..028 | Signature, durable inbox, idempotency, DLQ/replay |
| US-015 | Operations and auditability | TASK-029..030 | SLO dashboards, append-only audit, access review |
| US-016 | Security and privacy | TASK-031..032 | Threat model, scans, export/deletion verification |
| US-017 | Threads extension | TASK-033 | Adapter conformance and API version compatibility |

## 4. Evidence ledger template
For each criterion, record:
| Field | Required value |
|---|---|
| Requirement/story/criterion | Stable IDs |
| Implementation | Commit SHA + paths + symbols |
| Test | Exact command + test name/result |
| External evidence | Official URL, API version, date, account/app eligibility result |
| Security/privacy | Threat/control and result |
| Runtime evidence | Environment, timestamp UTC, correlation ID, sanitized outcome |
| Status | proposed / implemented / verified / accepted / blocked |
| Reviewer | Agent/QA/security/product owner as applicable |

## 5. Change impact checklist
Before changing a contract or shared module, find:
- Direct callers and downstream consumers.
- API endpoints, DTOs, schemas, events and persisted records.
- Tenant/actor authorization and consent/policy enforcement.
- Webhooks, retries, idempotency and reconciliation behavior.
- Metrics, logs, traces, audit events and runbooks.
- Migrations, backfills, data retention and rollback.
- Contract, integration, E2E, security and regression tests.
- Stories/tasks/ADRs/CRs and release gates affected.

## 6. Release completeness report
At every milestone, report counts with a real denominator:
- Requirements mapped / total in-scope requirements.
- Stories verified / total in-scope stories.
- Tasks verified / total in-scope tasks.
- Acceptance criteria passed / total criteria.
- Tests passed / tests executed; skipped and flaky tests separately.
- Open defects by severity; unresolved security/privacy risks.
- External Meta capabilities documented vs verified in actual app/business.
- Release gates passed / required gates.
Do not convert missing evidence into a percentage of completion.


## 7. Trazabilidad ampliada — CRM, Inbox, Automation, AI y SaaS
| Requisito/resultado | Historia | Tareas | Contexto lógico | Evidencia esperada |
|---|---|---|---|---|
| Contactos e identidades multicanal | US-018 | TASK-042,043 | CRM | tests de tenant, dedupe, merge reversible, provenance |
| Pipeline y actividades | US-019 | TASK-044 | CRM | tests de transiciones, ownership y permisos |
| Bandeja omnicanal | US-020 | TASK-045,046 | Messaging & Inbox | adapter contracts, E2E por canal, capability gating |
| Colaboración y handoff | US-021 | TASK-047 | Messaging & Inbox | concurrency, assignment, internal-note privacy |
| Automatización por reglas | US-022 | TASK-048,049 | Automation | simulation, idempotency, retry/DLQ, kill switch |
| Chatbots y sugerencias IA | US-023 | TASK-050,051 | AI Assistance | prompt injection, budget, redaction, no-auto-send |
| SaaS/planes/entitlements | US-024 | TASK-052 | Platform Identity/Billing | tenant lifecycle, entitlements, support audit |

Los nombres de contextos son límites lógicos propuestos; no asignar paths o MOD IDs hasta que exista el repositorio de código y se complete el architecture spike.


## 8. Trazabilidad nueva — decisiones delegadas y cambios de plataforma

| Requisito / resultado | Historia | Tareas | Contexto | Evidencia requerida |
|---|---|---|---|---|
| BSUID y nuevos IDs WhatsApp sin teléfono como clave universal; WAAC/PMA + legacy WABA | US-018, US-020 | TASK-053 | CRM / Asset Registry / Meta adapters | versioned fixtures, namespace uniqueness, no unsafe auto-merge, migration and reversible identity test |
| Onboarding unificado WhatsApp/Messenger/Instagram Direct donde sea elegible | US-003 | TASK-054 | Meta Control Plane | official source/version, app eligibility and real authorized account test |
| WhatsApp marketing adapter y sunset legacy path | US-008 | TASK-055 | WhatsApp Integration / Cost Ledger | contract tests, policy, migration plan before Meta announced 2027-10-13 sunset |
| API version, changelog, sunset, scope, asset grant y Marketing API Access Tier | US-004, US-017 | TASK-056, TASK-065 | Capability Registry / Operations | dated official evidence, deny matrix, change impact record and deprecation alerts |
| Diferenciar estimación, máximo, coste real y conciliación en Max Pricing | US-008, US-026 | TASK-057 | Billing & Usage / Cost Ledger | decimal/currency/rate-card tests and statement reconciliation |
| Acceso agency-to-client tenant explícito, temporal, revocable y auditado | US-025 | TASK-058 | Platform Identity / Partner Access | actor/tenant/asset/action grants, expiry/revoke, BOLA and audit tests |
| Retención configurable, data inventory y derechos LOPDP | US-016 | TASK-059 | Privacy & Compliance | end-to-end export/delete, derived-data purge, legal review evidence |
| Carga, saturación y capacidad reproducibles | US-015 | TASK-060 | SRE / Performance | scripts, hardware/config, p50/p95/p99, throughput, concurrency, queue age and error report |
| Backup/restore, HA, DR, RPO/RTO measured | US-015, US-016 | TASK-061 | SRE / Security | clean-host restore, consistency check, measured RPO/RTO and signed runbook |
| API pública y webhooks firmados | US-027 | TASK-062 | Developer Platform / Event Platform | OpenAPI, scopes, signatures, replay/retry/DLQ, rotation and rate-limit tests |
| Suscripción, asientos, entitlements y uso independiente | US-026, US-024 | TASK-063 | Billing & Usage / Platform | immutable ledgers, entitlement tests, no unapproved rates/tax |
| Accesibilidad WCAG 2.2 AA en journeys clave | PD-006 / UX | TASK-064 | Angular Web / UX | automated checks + manual keyboard/screen-reader audit |
| Revisión recurrente de changelogs/deprecations Meta | US-017 | TASK-065 | Meta Platform Operations | date/source/product/version/owner, mapped tasks and tests |

## 9. Traceability of adopted decisions
| Decision | Requirement/user outcome | Documentation / control |
|---|---|---|
| PD-012 initial Ecuador SME/agency hypothesis | Product positioning and discovery | docs/29, docs/06; customer interview/pilot evidence still required |
| PD-013/014 subscription + seats + usage, Meta pass-through | Transparent monetization/cost visibility | US-026, TASK-057, TASK-063 |
| PD-015 es-EC/USD/America-Guayaquil | Tenant localization and billing display | docs/29, docs/06; locale tests required |
| PD-016/017 shared tenant isolation + explicit partner grants | No cross-tenant access | US-001, US-025, TASK-058; security tests |
| PD-018 privacy minimization/configurable retention | Rights, export, deletion | US-016, TASK-059; legal review required |
| PD-019 default-deny and human approval | Safe messaging, campaigns and admin | US-002, US-005, US-012, US-023; approval and policy tests |
| PD-020 API/webhooks-first integrations | Extensible customer integration | US-027, TASK-062 |
| PD-021 VPS portability and benchmark-first sizing | Portable deployment | TASK-039, TASK-060, TASK-061 |
| PD-022 protected branches/production | Controlled release | AGENTS.md, docs/25, docs/29 |
| PD-023 modular monolith with evidence-based extraction | Operable scale without premature distribution | ADR-015, TASK-039, docs/30 |

Tasks TASK-053..065 are proposed until code/tests/evidence exist. API changes and product facts are revalidated at implementation and release. This matrix is traceability intent, not evidence of delivered functionality.


## 10. Trazabilidad de market validation
| Requisito | Historia | Tarea | Evidencia / salida |
|---|---|---|---|
| Validar hipótesis ICP servicios/comercio/agencias con base oficial y evidencia cualitativa | US-028 / PD-012 | TASK-066 | REEM methodology/data, interview synthesis, pilot metrics, eligibility-adjusted market model and explicit uncertainty |

REEM 2025 numbers are macro context only. They do not prove addressable customers, Meta usage, intent or willingness-to-pay.


## 11. Campaign Intelligence y agentic Meta
| Requisito | Historia | Tareas | Contexto | Evidencia esperada |
|---|---|---|---|---|
| Aprendizaje de campañas desde Meta insights + CRM/CAPI business outcomes, sin afirmar control de Andromeda | US-029 | TASK-067,068,072,077,078 | Campaign Intelligence / CAPI / CRM | snapshots con provenance, KPI definitions, quality gates, attributed-vs-incremental reporting |
| Aumento máximo de presupuesto +20% por acción y rolling-24h | US-029 | TASK-071 | Policy & Approval / Campaign execution | server-side tests concurrentes, no bypass, amount/currency correctness and audit |
| Creatividades diversas con provenance, rights, brand, preview and approvals | US-030 | TASK-069,073,079 | Creative Lab / Ads adapters | variant lineage, near-duplicate tests, preview and paused-first when required |
| Controlled A/B/test cells preserving winners and learning | US-030 | TASK-070 | Experiments / Campaigns | control/variant, sample/stopping rules, overlap and learning impact evidence |
| Meta Ads MCP drafts and Meta Business Agent interoperability | US-031 | TASK-074,075,080 | Agent Gateway / Inbox / Ads | role/purpose/tenant checks, approval/audit, single conversation owner and echo suppression |
| Meta policy/API/feature drift mapped to affected assets/tenants/tasks | US-032 | TASK-076 | Meta Control Plane / Operations | dated official evidence, capability registry update, tests and migration task |

Andromeda/GEM are internal Meta systems, not a WhatsBusiness API surface. All TASK-067..080 remain proposed; this matrix is intent, not delivered evidence.


| Tool/agent authorization, approval and audit gateway | US-031 | TASK-080 | Agent Tool Gateway / Policy & Approval | allowlisted tool schemas, scopes/purpose/tenant checks, idempotency, budget cap, redaction, audit, kill switch and replay tests |


## 12. Initial requirement register for kickoff

Los IDs REQ-0001..REQ-0012 se reservan como requisitos paraguas para que la trazabilidad no apunte a requisitos inexistentes. Cada Acceptance Criterion detallado conserva su AC-XXX-NN original.

| REQ | Resultado obligatorio | Stories / AC | Tasks | Contrato/dominio | Evidencia mínima |
|---|---|---|---|---|---|
| REQ-0001 | Identidad global y tenant isolation | US-001/002; AC-001-01..04, AC-002-* | TASK-001..005, 034 | docs/37, docs/42, OpenAPI | RLS, BOLA, membership/grant tests |
| REQ-0002 | OAuth, conexiones Meta y capabilities verificables | US-003/004 | TASK-006..010, 054..056 | docs/09, Meta Control Plane | state/replay, scopes/tasks/tier fixture and account evidence |
| REQ-0003 | Mensajería y delivery por canal | US-005..010, US-020/021 | TASK-011..021, 045..047 | docs/39, AsyncAPI | adapter contracts, message state, delivery/reconcile tests |
| REQ-0004 | Webhook/event platform durable | US-014 | TASK-027..028 | docs/43, inbox/outbox | signature, durable ACK, duplicate/out-of-order, DLQ/replay |
| REQ-0005 | CRM, identity graph, leads y pipeline | US-018/019 | TASK-035, 042..044, 053 | docs/38, docs/42 | provenance, merge collision/undo, tenant tests |
| REQ-0006 | Automatización determinista | US-022 | TASK-037, 048..049 | docs/40, events | versioning, idempotency, lock, retry, kill switch |
| REQ-0007 | AI assistance bajo control | US-023 | TASK-038, 050..051 | docs/41 | redaction, cost/quota, prompt injection, no-auto-send |
| REQ-0008 | Ads, Leads y conversion measurement | US-011..013, US-029/030 | TASK-022..026, 067..073 | docs/34/36, capability contracts | consent, dedupe, budget guard, attribution separation |
| REQ-0009 | Security, privacy y data rights | US-016, US-025 | TASK-031/032, 058/059 | docs/44, docs/08 | threat review, DSR/export/delete, legal evidence |
| REQ-0010 | Observability, recovery y production operation | US-015 | TASK-029/030, 041, 060/061 | docs/13, docs/45 | telemetry, benchmark, backup/restore, measured RPO/RTO |
| REQ-0011 | SaaS billing, entitlements y partner access | US-024..027 | TASK-052, 058, 062/063 | docs/37, docs/42 | entitlement matrix, immutable usage, scoped grant tests |
| REQ-0012 | Governed campaign/agent tool execution | US-029..032 | TASK-067..080 | docs/36, docs/41, docs/44 | approval gateway, PD-024, audit, lease, kill switch |

No REQ is declared verified by this register alone. On implementation, extend each row with code module IDs, test IDs, evidence artifact path, owner, reviewer and release gate.


## 13. API coverage reference

El inventario de rutas y correlación detallada vive en [docs/47-API-INVENTORY-AND-TASK-MAP.md](47-API-INVENTORY-AND-TASK-MAP.md). Todo API ID debe relacionarse con:
- REQ-xxxx → US-xxx → AC-xxx → TASK-xxx.
- HTTP OpenAPI operationId, internal event/schema, inbound/outbound webhook cuando aplique.
- Bounded context, module owner y adapter Meta operation.
- Permission + tenant scope + purpose + capability + approval.
- Unit/integration/contract/security/E2E test IDs y evidence artifact.

Una TASK que no crea endpoint debe declarar por qué (spike, benchmark, research, security, accessibility, legal review o traceability) y entregar su evidencia no-HTTP.

## 10. Trazabilidad de contratos y calidad de ingeniería

| Artefacto/control | Alcance | Fuente normativa | Evidencia requerida |
|---|---|---|---|
| Calidad/anti-spaghetti/reutilización | Todo backend, frontend, worker, adapter y tests | docs/48 + AGENTS.md | Plan de reuse, Nx boundaries, diff review, test evidence |
| API HTTP | API IDs de docs/47; OpenAPI completo | docs/49 + contracts/openapi/platform-v1.yaml | x-contract-status, schemas, authz, error, idempotency y contract tests |
| Eventos internos | 55 event types y payloads v1.0.0 | docs/50 + AsyncAPI + JSON Schema | Schema validation, producer/consumer contract, dedupe, tenant checks |
| Meta adapters | Cada producto/login/version/operation | docs/09 + docs/49 + docs/32 | Fuente oficial fechada, scopes, grants, tier, eligibility, fixtures y account evidence |

No cerrar una TASK porque el API ID o el schema exista. El commit de implementación debe incluir código, tests ejecutados y evidencia; las revisiones independientes y aceptación del propietario mantienen sus estados propios.


## 12. Handoff normalizado de tareas y auditoría de arquitectura

- [docs/53 — TASK work packages](53-TASK-WORK-PACKAGES.md): registro TASK-001..080 con owner role sugerido, dependencias, API IDs, eventos, DoD, pruebas y handoff. Las asignaciones reales/reviewers deben confirmarse antes de iniciar.
- [docs/54 — TASK-039 execution & consistency report](54-TASK-039-EXECUTION-AND-CONSISTENCY-REPORT.md): evidencia estática, limitaciones runtime, hallazgos, gate G0 y acciones pendientes.
- Los resúmenes DoD no son AC IDs formales. El agente debe enlazar AC existentes de la US y derivar Given/When/Then + TEST IDs antes de implementar.


## Evidence map — Identity foundation (2026-11-07)

| Resultado | Historia / tareas | Código / contrato | Validación |
|---|---|---|---|
| Resolver OIDC issuer+subject, sin email como clave | US-001/002; TASK-001/002/004 | OidcJwtVerifier, OidcAuthGuard, platform.resolve_oidc_user | JWT RS256/JWKS: firma, issuer, audience, exp y nbf |
| Leer principal y memberships propias | US-001/002; TASK-001/002 | GET /v1/me (PLT-003), RLS platform.memberships | Token ausente, usuario no provisionado, memberships ajenas invisibles |
| Listar tenants activos accesibles | US-001; TASK-001/002 | GET /v1/tenants (PLT-004), cursor keyset y RLS | Membership inactiva, cursor/pageSize y BOLA |
| Resolver contexto efectivo | US-001/002/024; TASK-002/004 | GET /v1/tenants/{tenantId}/context (PLT-005) | 404 no filtrante, roles/permisos/entitlements y RLS |
| Propagar contexto de tenant dentro de transacción | US-001; TASK-001/002 | DatabaseService.withUserContext/withTenantContext y migration 0001 | Pool max=1, usuario/tenant A→B, ausencia de contexto y limpieza SET LOCAL |

Este mapeo documenta la implementación; no implica revisión independiente ni acceptance. Partner/JIT grants, membership mutations, audit/outbox y worker propagation quedan fuera de este slice.

## Evidence map — TASK-002 Tenant Context and authorization (2026-11-07)

| Resultado / criterio | Historia / tarea | Código / contrato | Evidencia automatizada | Estado |
|---|---|---|---|---|
| Contexto se establece solo con user, organization, tenant y membership activos | US-001; TASK-002 | `platform.can_use_tenant`, `DatabaseService.withTenantContext`, migration 0003 | PostgreSQL: actor/organization/membership/tenant inactive; cross-tenant deny | implemented / CI-verified |
| Contexto por ruta exige OIDC, tenant UUID y propósito explícito | US-001; TASK-002 | `TenantContextGuard`, `@TenantAccessPurpose`, `TenantAccessContext` | `tenant-context.guard.spec.ts`: missing claims, malformed tenant, missing purpose, frozen context and correlation ID | implemented / CI-verified |
| Cambio de grants invalida snapshots anteriores | US-001/002; TASK-002/004 | `authz_version`, triggers membership/role/role_permissions, `withTenantContextAtVersion` | PostgreSQL: remove role_permission then stale version rejected; runtime version bump | implemented / CI-verified |
| PLT-005 no filtra datos internos de autorización | US-001/002; TASK-002 | `IdentityService.tenantContextResponse`, `IdentityController` | assert membershipId/authzVersion absent from public DTO; existing PLT-005 contract retained | implemented / CI-verified |

CI source: run #47 [42383524043](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42383524043), commit `74febd28056043cda15221f29c8c5b71290ca06c` — SUCCESS. Revisión independiente y aceptación del propietario siguen pendientes. RBAC/ABAC por acción/asset/purpose pertenece a TASK-004 y no se considera terminado por la existencia del snapshot.
## Evidence map — TASK-004 RBAC/ABAC (2026-11-07)

| Resultado / criterio | Historia / tarea | Código / contrato | Evidencia automatizada | Estado |
|---|---|---|---|---|
| Permisos tipados y risk class persistido | US-002; TASK-004 | Migration 0004 + `permission-catalog.ts` | PostgreSQL compara todas las keys/risk_class con el catálogo TypeScript | implemented / CI-verified |
| Role templates tenant y separación de plataforma | US-002; TASK-004 | `tenant-role-catalog.ts` | uniqueness, permission key integrity, no platform roles y Agent least-privilege | implemented / CI-verified |
| RBAC/ABAC default-deny | US-002; TASK-004 | `TenantAuthorizationPolicyEvaluator`, `AuthorizationService` | allow/deny para membership/tenant/purpose/permission/entitlement/owner/state/asset/consent/approval/capability freshness | implemented / CI-verified |
| Guard de transporte y declarative permission | US-002; TASK-004 | `AuthorizationGuard`, `RequirePermission`, `RequireTenantPermission` | allow/deny/missing metadata guard tests | implemented / CI-verified |
| Role assignment anti-escalation | US-002; TASK-004 | `TenantRoleAssignmentPolicy` | self assignment, non-owner, cross-tenant, platform role, overprivilege and independent approval tests | implemented / CI-verified |

Source CI run #67 [42385036275](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42385036275), commit `53e50dc00daccc7c64c7931e468e6ef0af132940` — SUCCESS. No se declaran APIs IAM-007..020 implementadas, ni assignments persistentes, audit durable o approval workflow; TASK-005 debe cerrar los controles operativos que dependen de estos resultados.
## Evidence map — TASK-005 Approval / Step-up / Audit (2026-11-07)

| Resultado / criterio | Historia / tarea | Código / contrato | Evidencia automatizada | Estado |
|---|---|---|---|---|
| Claims step-up firmados y recientes | US-002; TASK-005 | OIDC verifier + `OidcStepUpEvidenceVerifier` | `auth_time` freshness, issuer ACR/AMR allowlist, absent/stale/future/unknown deny | implemented / CI-verified |
| Approval request immutable binding | US-002; TASK-005 | `approval_requests`, `approval-request-hash.ts`, idempotency key | same request retry, changed payload with same key conflict, different payload rejected | implemented / CI-verified |
| Independent approval quorum | US-002; TASK-005 | `approval_decisions`, DB triggers, `ApprovalWorkflowService` | requester cannot decide, distinct approvers, quorum, immutable retry and step-up evidence | implemented / CI-verified |
| Exact action consumption | US-002; TASK-005 | `consumeAndStage`, status transition approved→consumed, transaction rollback | mismatched action hash denied, callback failure rolls back, one-time consumption and local durable stage | implemented / CI-verified |
| Append-only audit stream | US-002; TASK-005 | `audit_events`, `audit_stream_heads`, `AppendOnlyAuditRepository` | tenant-scoped hash-chain verification, head-to-event consistency, UPDATE/DELETE denied | implemented / CI-verified |

Source CI run #112 [42387272987](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42387272987), commit `b38b78ab52dbb96262dc8078518fdf4f55fc5a2c` — SUCCESS; ephemeral PostgreSQL approval integration was enabled in this run. Limits: no real IdP/verified ACR-AMR allowlist, no business outbox/consumer, IAM approval APIs are still catalog-only, review independent/owner acceptance pending.


## Evidence map — TASK-003 Operational tenant isolation (2026-11-07)

| Resultado / criterio | Historia / tarea | Código / contrato | Pruebas registradas | Estado |
|---|---|---|---|---|
| Cache keys no colisionan entre tenants y TTL bounded | US-001; TASK-003 | TenantResourceNamespace, TenantScopedCache, CacheStore | tenant-resource-namespace.spec.ts, tenant-scoped-cache.spec.ts | implemented; CI pending |
| Object keys quedan bajo prefijo tenant y rechazan traversal | US-001; TASK-003 | TenantScopedObjectStorage, ObjectStorage | tenant-scoped-object-storage.spec.ts | implemented; CI pending |
| Cada ejecución worker revalida membership/tenant vía DB | US-001; TASK-003 | TenantJobContextResolver, TenantJobRecordReader, TenantJobExecutor, DatabaseService.withTenantContext | tenant-job-context.spec.ts | primitive implemented; PostgreSQL worker integration pending |
| Telemetría no filtra tenant ID en metric labels | US-001; TASK-003 | TenantTelemetryContext, HmacTenantPseudonymizer | tenant-telemetry-context.spec.ts | implemented; secret manager adapter/wiring pending |
| Scraping Prometheus se limita a GET /metrics y protege bindings remotos | US-001; TASK-003 | TenantJobMetricsHttpServer, TenantJobRuntimeProcess | tenant-job-metrics-http.server.spec.ts | Source CI #42434224485 SUCCESS |
| Gauges operativos agregados no permiten leer filas ni datos de tenant | US-001; TASK-003 | platform.read_tenant_job_runtime_metrics(), PostgresTenantJobRuntimeMetricsReader, TenantJobRuntimeSupervisor | postgres-tenant-job-runtime-metrics.reader.spec.ts, postgres-tenant-job-runtime.integration.spec.ts, prometheus-tenant-job-runtime-metrics.spec.ts | implemented; Source CI #42435204662 SUCCESS |
| Métricas RabbitMQ muestran ready, unacknowledged y consumers sin compartir transporte del worker | US-001; TASK-003 | RabbitMqManagementTenantJobQueueMetricsReader, TenantJobRuntimeSupervisor | rabbitmq-management-tenant-job-queue-metrics.reader.spec.ts, rabbitmq-transport.integration.spec.ts, prometheus-tenant-job-runtime-metrics.spec.ts | implemented; Source CI #481 pending; CodeQL #6 SUCCESS; #480 found missing DLQ counter |
| Usuario RabbitMQ monitoring no puede publicar/consumir ni modificar recursos AMQP | US-001; TASK-003 | RabbitMqManagementTenantJobQueueMetricsReader, source-validation.yml | tag `monitoring`, permisos AMQP vacíos, HTTPS remoto y Management API | implemented; Source CI #466 pending |
| Dashboard y reglas Prometheus cubren señales disponibles sin labels tenant | US-001; TASK-003 | observability/grafana/tenant-job-runtime.dashboard.json, observability/prometheus/tenant-job-alerts.yml | JSON revisado; importación/validación Prometheus-Grafana real y alert routing pendientes; regla absent(up) añadida con Source CI #465/CodeQL #5 pendientes | authored; deployment verification pending |
| Runbook documenta métricas, recuperación y límites | US-001; TASK-003 | observability/RUNBOOK.md | revisión operacional independiente pendiente | documented; not operationally accepted |
| Análisis estático SAST CodeQL sobre JavaScript/TypeScript | TASK-003 / seguridad backend | .github/workflows/codeql-security.yml | Source code workflow [#42435984426](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42435984426) SUCCESS en commit `6db028bb7123dfd50bafe3d6f4f5e66bce06207d`; revisión de alertas Code Scanning aún requiere triage | workflow verified; findings triage pending |

No se afirma runtime completo: adapters Valkey/object storage, DLQ operator workflow/replay con handlers reales, unacked/consumer lag autoritativo, instalación real del dashboard/alert routing, broker validation, Secret Manager/rotación HMAC y review independiente siguen pendientes. TASK-003 no está verified ni accepted.


## Evidence map — estabilidad del test harness de TASK-003/027/028 (2026-11-08)

| Resultado / criterio | Tarea | Código / contrato | Evidencia automatizada | Estado |
|---|---|---|---|---|
| Teardown RabbitMQ cierra colas, exchange y conexión incluso ante error de cleanup | TASK-003 / TASK-028 | rabbitmq-transport.integration.spec.ts | Identificadores de recursos con ámbito correcto; limpieza best-effort y cierre garantizado de canales | implementado; Source CI posterior pendiente |
| Ruta de pruebas Meta worker corresponde a un archivo real | TASK-027 / TASK-028 | microservices-meta-ecuapp/project.json, meta-webhook-worker.supervisor.spec.ts | El árbol ya contiene la suite referenciada en Nx | implementado; Source CI posterior pendiente |
| Supervisor se detiene ante fallo de broker y mantiene fail-closed | TASK-027 / TASK-028 | MetaWebhookWorkerSupervisor | pruebas de shutdown, cierre de DB pool, ausencia de handlers y bounds del reconnect | implementado; Source CI posterior pendiente |

Source CI #527 terminó cancelled tras el timeout de 30 minutos dentro del target de tests; no se registra como PASS. Build, typecheck y migraciones/idempotencia sí fueron SUCCESS en ese run. La corrección de teardown y el test de supervisor requieren validación CI en el nuevo commit.


## Evidence map — integraciones de TASK-027/028 y grants mínimos (2026-11-08)

| Resultado / criterio | Tarea | Código / contrato | Evidencia automatizada | Estado |
|---|---|---|---|---|
| Mensaje de integración se enruta solo a la cola temporal que se está midiendo | TASK-003 / TASK-028 | `rabbitmq-transport.integration.spec.ts` | Topología de prueba crea los exchanges sin inicializar la cola worker de producción ni su binding global `jobs.#` | implementado; Source CI posterior pendiente |
| Ingress puede insertar inbox/outbox idempotente sin leer payload protegido | TASK-027 | Migración `0019-meta-webhook-ingress-conflict-key-select.sql` | SELECT de columnas de conflicto `app_id/provider_product/idempotency_key` y `event_id`; prueba existente mantiene denegado SELECT(payload_ciphertext) | implementado; PostgreSQL CI posterior pendiente |
| Source CI posterior | TASK-003/027/028 | Source CI #528 / CodeQL #66 | 80/82 backend tests PASS; build/typecheck/migrations/idempotence previas SUCCESS; CodeQL SUCCESS | diagnóstico verificado; no CI verde del commit corregido |


## Evidence map — Source CI #536 y aislamiento de roles (2026-11-08)

| Resultado / criterio | Tarea | Código / contrato | Evidencia / estado |
|---|---|---|---|
| El worker recibe eventos con ACK manual y redelivery después de pérdida del canal | TASK-003 / TASK-028 | `rabbitmq-transport.integration.spec.ts` | Entrega básica, mandatory routing, ACK, quorum DLX, redelivery verificados en Source CI #536 |
| Ingress escribe el inbox/outbox solo en contexto del tenant | TASK-027 | Migración 0020 y `stage_meta_webhook_event_outbox` | Función SECURITY DEFINER con tenant derivado del inbox y contexto transaccional; prueba cross-tenant en #536 |
| Source CI/CodeQL completo | TASK-003/027/028 | #536 / #74 | SUCCESS: instalación frozen, migrations/idempotence, build, typecheck y targets test; CodeQL success |
| App login no puede asumir el rol ingress ni recuperar permisos amplios de outbox | TASK-027 | Migración 0021 y `postgres-meta-webhook.integration.spec.ts` | Implementado; CI siguiente pendiente |



## Evidence map — Source CI #539: Webhook Gateway, Event Bus y rol ingress (2026-11-08)

| Criterio/evidencia | Trazabilidad | Implementación / prueba | Estado |
|---|---|---|---|
| El ingress no puede consultar ni asumir el grupo de permisos amplio | TASK-027, US-014, TH-008 | Migración 0021; membership del login API revocada; pruebas pg_has_role=false y SET ROLE -> SQLSTATE 42501 | CI-verified, #539 |
| El grupo ingress no puede leer ni insertar event_id del outbox | TASK-027, ADR-002/006 | REVOKE de SELECT(event_id)/INSERT(event_id,tenant_id); prueba has_column_privilege false | CI-verified, #539 |
| Outbox solo se stagea bajo tenant context coincidente con inbox | TASK-027/028, REQ-0004 | platform.stage_meta_webhook_event_outbox; prueba cross-tenant retorna staged=false | CI-verified, #539 |
| Inbox/outbox y worker conservan idempotencia y receipt; evento no soportado termina en DLQ persistente | TASK-027/028, US-014, TH-004/006 | Integración PostgreSQL 18.6 + RabbitMQ 4.4: 2 outbox publicados, 1 handler ejecutado, 1 dead-letter terminal y 1 receipt | CI-verified, #539 |
| Lectura de dead letters limitada por tenant y metadata | TASK-027/028, TH-001/006/008 | platform.list_meta_webhook_dead_letters; metadata del tenant actual y rechazo SQLSTATE 42501 al cambiar contexto | CI-verified, #539 |
| Source CI + CodeQL sobre el commit funcional | TASK-003/027/028 | Source CI #539 y CodeQL #77 sobre c2bb65fc1a506ba54ab3f7662c9bbc759e2b0536 | SUCCESS |

**Límite de aceptación:** esta evidencia verifica el slice de transporte/inbox/outbox/worker/tenant boundary y el hardening del rol. No verifica handlers reales por producto, replay con doble aprobación y efectos externos idempotentes, CR-0016, operación del DLQ, conformance oficial Meta, retención, KMS/Secret Manager, WAF/rate limit, alert routing/SLO, deployment, carga/DR, review independiente ni aceptación. TASK-003/027/028 siguen in_progress.

## 8. Evidencia incremental — CRM Contacts slice (2026-11-08)

| Requisito/resultado | Historia / tarea | Implementación | Prueba / evidencia | Estado |
|---|---|---|---|---|
| Modelo Contact con provenance y lifecycle | US-018 / TASK-042 | microservices-meta-ecuapp/migrations/0022-crm-contacts.sql; apps/api/src/crm/contacts/domain/contact.ts | Migración versionada + test de validación de dominio; Source CI pendiente | implemented; verified pending |
| Persistencia tenant-scoped, idempotencia y optimistic concurrency | US-018 / TASK-042 | PostgresContactRepository, ContactService | PostgreSQL integration: tenant RLS, replay, conflict, ETag version, audit hash chain y cross-tenant not-found; Source CI pendiente | implemented; verified pending |
| Contratos CRM-001..004 | US-018 / TASK-042 | contracts/openapi/platform-v1.yaml; docs/66 | Contract CI #27 SUCCESS; allowlist solo PLT-001..005 | design-frozen; runtime disabled |
| Exposición HTTP | US-018 / TASK-042 | ContactController + CrmContactsModule, todavía no importado en AppModule | Requiere gate GO-CODE específico y cambio permitido por Contract CI | blocked by feature gate |

## 9. Evidencia incremental — Source CI #560 y test de métricas RabbitMQ

| Requisito/resultado | Historia / tarea | Implementación / prueba | Evidencia / estado |
|---|---|---|---|
| Build/typecheck y foundation API mantienen estado verde | TASK-003 / foundation | Source validation #560, commit b6da092d443c91aebf502809439f82677d49acdc | Install frozen, migraciones 0001–0023 + idempotencia, build, typecheck y api:test SUCCESS |
| Reader HTTP no expone detalles de respuesta de Management API | TASK-003 | rabbitmq-management-tenant-job-queue-metrics.reader.ts y unit spec | Corrección implementada: status HTTP/redirect solamente; nunca response body; CI nuevo pendiente |
| La integración live deja el proceso limpio aun cuando falle | TASK-003 | rabbitmq-management-tenant-job-queue-metrics.integration.spec.ts | Setup protegido, timeout del test y cleanup acotado implementados; Source CI/CodeQL pendientes |
| La identidad de métricas sigue monitor-only | TASK-003 / security | .github/workflows/source-validation.yml | Sin cambios de ACL; no se concede read/configure/write sobre recursos AMQP |

Source CI #560 falló en el target backend durante la integración RabbitMQ Management API; el step expiró tras 8 minutos. La corrección aún no está verified. TASK-003 sigue in_progress.


## 10. Evidencia incremental — cierre de conexión RabbitMQ y redelivery

| Requisito/resultado | Historia / tarea | Implementación / prueba | Evidencia / estado |
|---|---|---|---|
| Cerrar sesión worker debe cerrar canales y socket aun con RPC pendiente | TASK-003 / TASK-028 | RabbitMqConnectionFactory.close cierra conexión padre directamente | Implementado; Source CI pendiente |
| Un mensaje sin ACK debe volver a la cola tras crash del proceso completo | TASK-003 / TASK-028 | rabbitmq-transport.integration.spec.ts usa original.close() y verifica redelivered=true en la conexión de recuperación | Prueba de integración ampliada; Source CI pendiente |

La prueba actual demuestra el caso de pérdida del proceso/conexión y redelivery, no un resultado de ejecución todavía. TASK-003/028 permanecen in_progress.


## 11. Estado de trazabilidad — US-008 (2026-11-08)

| Historia / criterio | Tareas | Evidencia actual | Estado |
|---|---|---|---|
| US-008 / AC-008-01: adapter Marketing Messages independiente y migrable | TASK-017, TASK-055 | No existe adapter runtime; WAMK-001..003 permanecen catalog-only; dependencia TASK-010 y gate G0/contract freeze pendientes | blocked / not implemented |
| US-008 / AC-008-02: categoría, consentimiento y elegibilidad | TASK-017, TASK-055 | Requisito definido; no hay policy/consent enforcement implementado para Marketing Messages ni evidencia de capability por activo | not implemented |
| US-008 / AC-008-03: estimado y coste reportado separados | TASK-018, TASK-057 | Diseño documentado; WAMK-004..007 catalog-only; no hay rate-card repository ni cost ledger runtime | not implemented |

No se ejecutaron pruebas de US-008 en esta revisión. La evidencia de investigación sobre Max Pricing no equivale a integración de proveedor. No habilitar endpoints ni mutaciones externas hasta congelar schemas por operación, completar TASK-010/039/056 y satisfacer G0. La aceptación final sigue perteneciendo al Product Owner.

## 9. Trazabilidad de implementación — US-004 (2026-11-08)

| Criterio | TASK | Código | Pruebas incorporadas | Estado |
|---|---|---|---|---|
| AC-004-01 — listar activos Meta por conexión | TASK-009 | apps/api/src/platform/meta-control-plane/domain/meta-asset.ts | meta-asset.spec.ts: namespaces WAAC/PMA/teléfono, catálogo de tipos, duplicados, tenant, reconcile e inventario parcial/completo | Domain slice implementado; consulta externa y persistencia pendientes |
| AC-004-02 — derivar capacidades por permisos, tasks, versión y elegibilidad | TASK-010 | meta-capability.ts, meta-capability-evaluator.ts | meta-capability-evaluator.spec.ts: scope, task, autorización, unknown, expiración, versión, tier, app review, país, consentimiento y aprobación | Evaluador implementado; definiciones oficiales por operación y runtime pendientes |
| AC-004-03 — explicar por qué una operación no está disponible | TASK-010 | MetaCapabilityDecision.reasons con código, dimensión, requisito y explicación | Tests de razones denied/unknown y gates múltiples | Slice implementado; falta exponer la explicación en contratos/API aprobados |

El target api:test incorpora ambas suites. Primer Source CI #42512236821 falló en el build por TS4111 en la validación de snapshots; la corrección está en 2f97c8a94275c87f8543de065c30ae00cbf52b43, cuya nueva ejecución Source CI #42512364598 terminó SUCCESS (build, typecheck, API tests/PostgreSQL integration y backend tests/PostgreSQL/RabbitMQ integration). CodeQL #42512364506 terminó SUCCESS. El HEAD 9e5dfa1 contiene un cambio separado de aislamiento. Source CI #42512536601 terminó con fallo en api:test: build y typecheck pasaron; 166/167 pruebas pasaron y las 23 pruebas nuevas de US-004 (inventario + capabilities) pasaron. La única falla fue la integración independiente tenant-job-record.integration.spec.ts, con SQLSTATE 42501 ('permission denied for table tenant_job_records') en PostgresTenantJobRecordWriter.stage; el target de Meta backend se omitió por el fallo previo. Esto no invalida los tests US-004, pero el HEAD posterior no tiene Source CI completo verde y la falla independiente debe corregirse por su owner.

No se ejecutó Meta API real, no hay conexión/token disponible y no se validó una cuenta comercial elegible. TASK-009/010 no pasan a verified ni accepted.

## Seguimiento del HEAD concurrente — 2026-11-08

- El Source CI #42512536601 del commit 9e5dfa1 pasó build y typecheck; api:test terminó 166/167. Las 23 pruebas nuevas de US-004 pasaron. La única falla fue tenant-job-record.integration.spec.ts (SQLSTATE 42501: permiso sobre platform.tenant_job_records), ajena al módulo Meta.
- El cambio de aislamiento fue corregido por el commit 2bfef634fb07603fb9ea1eb8df0127c4ece2ea49; el commit cd9ce49d082d6cf66f4a3c0f4e3818433f373950 añade una comprobación de idempotencia/INSERT. Source CI #42512743982 y CodeQL #42512744032 del HEAD cd9ce49 estaban in_progress al corte. No usar la ejecución fallida anterior como evidencia de defecto en US-004 ni declarar el HEAD actual completamente verde.
- El último CI completamente verde para el código de US-004 sigue siendo Source CI #42512364598 y CodeQL #42512364506 sobre 2f97c8a; allí pasaron build, typecheck, API/PostgreSQL y Meta backend/PostgreSQL/RabbitMQ.
