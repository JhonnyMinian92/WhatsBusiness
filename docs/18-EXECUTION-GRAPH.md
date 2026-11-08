# 18 — Execution graph and dependency navigation

## 1. How agents use this graph
Start from the requested outcome, find its story/task node, walk **upstream** for prerequisites and **downstream** for regression impact. Do not execute a task while a blocking prerequisite is unresolved unless the user explicitly accepts the risk and the work is safe. After changing dependencies, update this graph and the backlog in the same change.

Graph nodes use stable IDs: EP (epic), US (user story), TASK (implementation task), ADR (decision), CR (change), BUG (defect), API (provider capability), MOD (code module discovered in repository), TEST (automated/manual test), REL (release gate). Do not invent MOD/TEST IDs before inspecting source.

## 2. Product dependency graph
```mermaid
flowchart TD
  OWNER[Product owner request / approval] --> REQ[Requirements and acceptance criteria]
  REQ --> EP01[EP-01 Platform foundation]
  EP01 --> EP02[EP-02 Meta Control Plane]
  EP02 --> EP03[EP-03 WhatsApp]
  EP02 --> EP04[EP-04 Facebook / Messenger / Instagram]
  EP02 --> EP06[EP-06 Reliability / Security]
  EP03 --> EP05[EP-05 Leads / Ads / CAPI]
  EP04 --> EP05
  EP05 --> EP07[EP-07 Threads and extensions]
  EP06 --> HARD[Hardening / production readiness]
  EP07 --> HARD
  HARD --> VERIFY[Full verification and release gates]
  VERIFY --> ACCEPT[Product owner final acceptance]
```

## 3. Task dependency DAG (current baseline)
```mermaid
flowchart TD
  T001[TASK-001 Tenant model] --> T002[TASK-002 Tenant middleware]
  T001 --> T003[TASK-003 Isolation jobs/cache/files]
  T001 --> T004[TASK-004 RBAC/ABAC]
  T004 --> T005[TASK-005 Approvals/audit]
  T001 --> T006[TASK-006 OAuth]
  T004 --> T006
  T006 --> T007[TASK-007 Token vault]
  T006 --> T008[TASK-008 Embedded Signup]
  T007 --> T008
  T008 --> T009[TASK-009 Asset registry]
  T009 --> T010[TASK-010 Capability registry]
  T010 --> T011[TASK-011 WhatsApp adapter]
  T011 --> T012[TASK-012 Media]
  T011 --> T013[TASK-013 Delivery state/policy]
  T010 --> T014[TASK-014 Templates]
  T014 --> T015[TASK-015 Template lifecycle]
  T010 --> T016[TASK-016 Flows]
  T010 --> T017[TASK-017 Marketing Messages]
  T017 --> T018[TASK-018 Cost ledger]
  T010 --> T019[TASK-019 Pages/Messenger]
  T010 --> T020[TASK-020 Instagram auth/capabilities]
  T020 --> T021[TASK-021 Instagram operations]
  T009 --> T022[TASK-022 Lead capture]
  T022 --> T023[TASK-023 Lead lifecycle]
  T010 --> T024[TASK-024 Ads draft/approval]
  T024 --> T025[TASK-025 Activation/guardrails]
  T023 --> T026[TASK-026 CAPI]
  T001 --> T027[TASK-027 Webhook gateway]
  T007 --> T027
  T027 --> T028[TASK-028 Bus/DLQ/replay]
  T001 --> T029[TASK-029 Observability]
  T004 --> T030[TASK-030 Audit reports]
  T029 --> T030
  T001 --> T031[TASK-031 Security SDLC]
  T007 --> T032[TASK-032 Privacy lifecycle]
  T030 --> T032
  T010 --> T033[TASK-033 Threads]
  T027 --> T033
  T029 --> T033
  T005 --> T024
  T027 --> T013
  T027 --> T019
  T027 --> T022
  T028 --> T013
  T028 --> T019
  T028 --> T022
  T031 --> HARD[Security hardening]
  T032 --> HARD
  T025 --> HARD
  T026 --> HARD
  T033 --> HARD
```

## 4. Execution waves (parallelism guidance)
- **Wave A — shared foundations:** TASK-001, TASK-004, TASK-027, TASK-029, TASK-031 can be analyzed in parallel; implementation must respect actual dependencies and shared schema ownership.
- **Wave B — control plane:** TASK-002/003/005/006/007/008/009/010 after their prerequisites.
- **Wave C — channel adapters:** WhatsApp, Facebook/Messenger, Instagram may proceed in parallel only after contracts, capabilities, webhook and policy foundations are stable.
- **Wave D — acquisition and measurement:** Leads, Ads and CAPI after asset registry, permissions, eventing and consent.
- **Wave E — hardening:** load, resilience, penetration, disaster recovery, runbooks and operational evidence.
These are planning waves, not permission to ignore DAG edges.

## 5. Task selection algorithm
1. Filter tasks explicitly requested by the owner or required to satisfy that request.
2. Exclude tasks already verified with current evidence.
3. Select tasks whose dependencies are verified/accepted; prioritize critical-path and security blockers.
4. If a prerequisite is missing, either implement it first or mark the dependent task blocked with a clear reason.
5. For parallel work, partition by bounded context/files and define integration contracts before concurrent edits.
6. Recompute downstream impact after each change.

## 6. Graph integrity
- Every TASK has exactly one primary parent story (or documented cross-cutting ownership), a dependency list, and acceptance criteria.
- No dependency cycles. Dependencies must reference existing IDs.
- A task cannot be verified if a required upstream node is blocked.
- A task's downstream tests and release gates must be listed in the traceability matrix.
- Graph is a navigational model; inspect real code to map logical nodes to concrete paths.
- If task decomposition changes materially, update Mermaid graph and task table together.


## 7. Fases greenfield y nuevos work packages

```mermaid
flowchart TD
  PD[PD-001..PD-011 confirmed] --> SPEC[Functional specification]
  SPEC --> CRM[TASK-035 CRM]
  SPEC --> INBOX[TASK-036 Omnichannel Inbox]
  SPEC --> AUTO[TASK-037 Automation]
  SPEC --> AI[TASK-038 AI Assistance]
  SPEC --> BASE[TASK-034 Platform Identity]
  BASE --> SPIKE[TASK-039 Architecture spike / ADRs]
  CRM --> TRACE[TASK-040 Requirements traceability]
  INBOX --> TRACE
  AUTO --> TRACE
  AI --> TRACE
  SPIKE --> TRACE
  TRACE --> OPS[TASK-041 SLO / VPS sizing / operations]
  OPS --> FOUNDATION[Phase 1 platform foundation]
  FOUNDATION --> CONTROL[Phase 2 Meta Control Plane]
  CONTROL --> WH[Phase 3 WhatsApp + Inbox]
  WH --> CRM2[Phase 4 CRM + Automation]
  CRM2 --> SOCIAL[Phases 5–6 social channels]
  SOCIAL --> ADS[Phase 7 Leads / Ads / CAPI]
  ADS --> HARD[Phase 8 hardening]
```

TASK-034..041 se incorporan al DAG. Las tareas de especificación pueden avanzar en paralelo con ownership separado; TASK-039 depende de requisitos técnicos mínimos y no autoriza compromisos de gasto.


## 7. Dependencias añadidas tras investigación y decisiones PD-012..PD-023

TASK-039 architecture spike → TASK-053 identity/WAAC/PMA, TASK-054 Embedded Signup v4, TASK-056 Meta API version/access-tier registry.
TASK-056 → TASK-055 Marketing Messages API migration/readiness → TASK-057 Max Pricing and cost ledger.
TASK-034 platform/tenant spec + TASK-004 authorization → TASK-058 agency partner grants.
TASK-031 security + TASK-032 data rights → TASK-059 privacy lifecycle and LOPDP controls.
TASK-039 + TASK-041 SLO/RPO/RTO → TASK-060 load/capacity benchmark → TASK-061 DR and restore drills.
TASK-027 webhook ingress + TASK-028 event platform → TASK-062 public API and signed webhooks.
TASK-052 tenant/entitlement lifecycle + TASK-060 capacity → TASK-063 billing and usage.
TASK-046 Inbox UI → TASK-064 WCAG 2.2 AA audit.
TASK-056 → TASK-065 Meta change/deprecation operations.

Todos TASK-053..065 permanecen proposed. El grafo es dependencia lógica, no calendario ni ejecución realizada.


TASK-066 market/ICP validation → pricing/packaging decision and commercial launch planning. TASK-066 may run in parallel with engineering spike and foundational product specifications; it is a gate before final pricing and commercial forecast, not a blocker for independent architecture/security work.


## 8. Campaign Intelligence execution dependencies (2026-11-06)
- TASK-024/025/056 (Ads adapters, execution policy and capability registry) + TASK-039 architecture spike → TASK-072 Insights ingestion/snapshots.
- TASK-023/026/042/044/059 (Lead lifecycle, CAPI, CRM and privacy rights) → TASK-068 closed-loop business outcome signals.
- TASK-072 + TASK-068 + TASK-070 experiments → TASK-067 Campaign Intelligence diagnostics/recommendations → TASK-071 guarded budget optimizer.
- TASK-069 Creative Lab metadata/rights/brand → TASK-073 Meta Advantage+ creative/preview APIs → TASK-079 fatigue-to-new-variant pipeline → TASK-070 controlled experiment.
- TASK-004 permissions/approval + TASK-024 Ads API + TASK-067 recommendations → TASK-074 Meta Ads MCP draft/approval connector.
- TASK-036/045/047 Inbox + TASK-050/051 AI + TASK-058 partner grants → TASK-075 Meta Business Agent conversation ownership/handoff.
- TASK-056/065 API and policy registry → TASK-076 policy/feature drift monitor → affected adapter tests/migration tasks.
- TASK-026/068/070 → TASK-077 incrementality and attribution framework → TASK-078 dashboard/health reporting.

TASK-067..080 remain proposed. No autonomous spend, publication, or live WhatsApp actions are authorized by this documentation change.


TASK-004 permissions/approval + TASK-029 observability/audit + TASK-067 Campaign Intelligence + TASK-074 Meta Ads MCP + TASK-075 Business Agent handoff → TASK-080 Agent Tool Gateway/MCP server. TASK-080 is a shared control boundary and must be complete before any AI agent performs external write operations.


## 7. Estado observado — US-013 / TASK-026 (2026-11-08)

TASK-026 cuenta con un slice de dominio en `apps/api/src/marketing/conversions` y suites integradas en `api:test`; permanece `in_progress`, porque las dependencias TASK-023/031 no están verificadas, el consentimiento TASK-032 carece de adapter y CAPI-001..004 siguen catalog-only. El DAG no cambia: el gateway persistente/outbox/adapter se implementará después de satisfacer esos gates. No existe external write ni integración de producción.
