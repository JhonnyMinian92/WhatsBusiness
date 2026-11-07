# 17 — Agent operating model (Codex, Claude and any compatible agent)

## 1. Purpose
This is the execution manual for autonomous coding agents. The repository must be understandable without access to private chat history. Every request should become a traceable, bounded, verifiable change. Agents are interchangeable; the project memory and evidence live in Git.

## 2. Source-of-truth hierarchy
1. Latest explicit instruction from the product owner.
2. `AGENTS.md` (shared agent contract).
3. `01-CENTRAL-MEMORY.md` and accepted ADRs.
4. Approved product requirements and user-story acceptance criteria.
5. Current code, tests, schemas, migrations and deployed evidence (truth about what exists).
6. Short-term memory and backlog (truth about current work, reconciled against code).
7. `META_SERVICES.md` and official provider documentation (research; volatile details must be revalidated).
8. Agent inference (never silently promoted to fact).

If two sources conflict, stop the affected decision, record the conflict and follow the hierarchy. Code reality must not be rewritten in documentation to make progress appear higher.

## 3. Required reading paths
### Every session
`AGENTS.md` → `docs/README.md` → this file → `01-CENTRAL-MEMORY.md` → `02-SHORT-TERM-MEMORY.md` → requested task and its ancestors/dependents in graph → relevant architecture/domain/security/QA pages.

### New agent / broad request
Also read `00-CONTEXT.md`, `03-LONG-TERM-MEMORY.md`, `05-ARCHITECTURE.md`, `06-DOMAIN-AND-BUSINESS.md`, `07-DESIGN-PATTERNS.md`, `08-SECURITY-AND-PRIVACY.md`, `09-API-INTEGRATION-CATALOG.md`, `10-USER-STORIES.md`, `11-TASK-BACKLOG.md`, `12-QA-AND-TEST-STRATEGY.md`, `13-OPERATIONS-AND-OBSERVABILITY.md`, `16-ROLES-AND-GOVERNANCE.md`, `18-EXECUTION-GRAPH.md`, `19-TRACEABILITY-MATRIX.md`, `20-PRODUCT-ACCEPTANCE.md`.

### Narrow bug fix
Read the bug record, its story, task, affected modules, relevant contracts, security controls and regression suite. Expand scope only when dependency analysis proves it necessary.

## 4. Request classification
- **Feature:** create/update story and acceptance criteria, then tasks and graph edges.
- **Bug:** reproduce first; create BUG record; add failing regression test; fix root cause; verify.
- **Change/refactor:** create CR; describe compatibility, migration, rollback and affected graph nodes.
- **Investigation:** gather evidence, do not change runtime behavior; record conclusions and unknowns.
- **Security incident:** contain safely, preserve evidence, avoid exposing sensitive data, follow security/incident process.
- **Operational action:** distinguish read-only diagnostics from external side effects; ask for explicit authorization for production mutations/spend/deletion.

## 5. Work packet contract
Every actionable task must carry:
- Stable ID and title; parent story/epic.
- User/business outcome and scope boundaries.
- Preconditions and dependency IDs.
- Affected bounded contexts, modules, endpoints, schemas and events (discovered/confirmed, not guessed).
- Acceptance criteria written as observable Given/When/Then or equivalent.
- Data classification, tenant boundary and threat considerations.
- Required tests, test data/fixtures and evidence.
- Migration/backward compatibility and rollback plan when applicable.
- Definition of Ready, Definition of Done, owner and status.
- Links to BUG/CR/ADR and upstream/downstream graph nodes.

## 6. Minimal-effort execution without sacrificing correctness
- Reuse existing patterns, libraries and abstractions after inspecting them.
- Prefer one vertical slice that is end-to-end testable over broad scaffolding.
- Batch independent read-only inspection; serialize conflicting writes/migrations.
- Do not duplicate services, DTOs, adapters, validators or policies.
- Avoid speculative abstraction and premature microservice extraction.
- Use generated clients/schemas only when they are source-controlled and reproducible.
- Preserve backward compatibility unless the request explicitly authorizes a breaking change.
- Keep diffs focused; no unrelated formatting or mass renames.
- Automate repeatable checks and document exact commands.

## 7. Meta integration evidence protocol
For each endpoint/capability, record provider product, API version, HTTP method/path, official reference URL, consulted date, app mode/access level, required scopes, asset tasks/grants, account type/country eligibility, webhook subscriptions, rate limits, error semantics, pricing basis if applicable, sandbox limitations, test evidence and fallback/deprecation plan. Separate:
- Documented by Meta.
- Verified with this app/business/account.
- Assumed or not yet verified.
Never treat an available access token as proof of permission or eligibility.

## 8. Memory update protocol
- Stable approved truth → central memory.
- Current sprint/session → short-term memory.
- Durable rationale/history → long-term memory/ADR.
- Raw observations or unverified external changes → sensory memory.
- Implementation progress → backlog + roadmap + traceability.
- Defects → bug register.
- Scope/architecture/behavior change → change register + ADR where needed.
A single logical change must leave these records consistent. Avoid copying entire documents into multiple places; link to canonical IDs.

## 9. Agent handoff
Before ending, leave a handoff with: current branch/commit, active task IDs, changed paths, commands and results, decisions made, blockers, next exact action, and files the next agent must read. Another agent must be able to continue without asking what happened in chat.

## 10. Completion semantics
A task is not complete merely because code compiles. Require acceptance criteria, tests, security review, observability, docs and evidence. Story acceptance requires all child tasks verified. Epic completion requires all stories accepted/verified according to policy. Product completion requires all in-scope requirements mapped and verified, operational readiness, no unresolved release-blocking defects/risks, and explicit product-owner approval.


## 11. Team mode: departments and role switching
Use [21-TEAM-ORGANIZATION.md](21-TEAM-ORGANIZATION.md) as the functional org chart. A role is a responsibility lens, not a claim of professional license. Before each phase, declare ROLE, OBJECTIVE, INPUTS, OUTPUT, AUTHORITY and LIMITS using [23-ROLE-PLAYBOOKS.md](23-ROLE-PLAYBOOKS.md). Assess Product, Business Analysis, Marketing, UX, Architecture, Engineering, Meta Integration, Data, QA, Security, Privacy, SRE, Finance, Support and Documentation as relevant. Explain non-applicable roles.

## 12. Multi-agent orchestration
Follow [22-MULTI-AGENT-ORCHESTRATION.md](22-MULTI-AGENT-ORCHESTRATION.md). One accountable owner per work packet; explicit writable-path ownership; isolated worktrees for concurrent writes; otherwise serialize writes. Parallelize only independent tasks with stable contracts. The orchestrator integrates and owns the overall result. No agent may silently overwrite another agent's work.

## 13. Independent validation
Follow [24-INDEPENDENT-VALIDATION.md](24-INDEPENDENT-VALIDATION.md). Author and reviewer must differ for a review to be independent. Review against original acceptance criteria and inspect the actual diff. Record PASS, PASS_WITH_NOTES, CHANGES_REQUESTED, BLOCKED or NOT_REVIEWED, with evidence and limitations. High-risk work requires additional security/privacy review and human sign-off where applicable.

## 14. Boundaries and gates
Follow [25-AGENT-BOUNDARIES-AND-ACCESS.md](25-AGENT-BOUNDARIES-AND-ACCESS.md) and [26-TEAM-WORKFLOW-AND-GATES.md](26-TEAM-WORKFLOW-AND-GATES.md). Never infer authorization from tool availability. Real messages, ad spend, production deployment, irreversible deletion, real customer data and strategic cost/contract changes require explicit approval. No agent can accept the product.


## 15. Current kickoff artifacts (2026-11-06)

For broad implementation planning, also read:
- docs/37-PLATFORM-IDENTITY-AND-TENANCY-SPEC.md
- docs/38-CRM-DOMAIN-SPEC.md
- docs/39-OMNICHANNEL-INBOX-SPEC.md
- docs/40-AUTOMATION-ENGINE-SPEC.md
- docs/41-AI-ASSISTANCE-SPEC.md
- docs/42-INITIAL-DATA-MODEL.md
- docs/43-API-AND-EVENT-CONTRACTS.md
- docs/44-THREAT-MODEL-AND-DATA-INVENTORY.md
- docs/45-ARCHITECTURE-SPIKE-RUNBOOK.md
- docs/46-AGENT-START-AND-WORKPACKETS.md

Current authorization: preparation/review and the disposable spike may start. Production scaffold requires TASK-039 evidence and G0 review. Use synthetic data only until legal/privacy and provider approvals permit otherwise. Initial OpenAPI/AsyncAPI contracts are not implemented endpoints.
