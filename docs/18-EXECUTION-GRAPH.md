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
