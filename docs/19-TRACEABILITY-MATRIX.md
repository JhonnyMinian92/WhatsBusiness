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
