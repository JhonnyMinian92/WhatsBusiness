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
