# Agent Operating Contract — WhatsBusiness

> This file is the mandatory entry point for Codex, Claude Code, GitHub Copilot and any coding agent. Read it before inspecting or changing the repository.

## Mission
Deliver the complete, production-grade WhatsBusiness product defined by `META_SERVICES.md` and `docs/`. Work incrementally until every approved requirement is implemented, verified and accepted by the product owner. The product owner alone gives final acceptance.

## Mandatory bootstrap (do not skip)
1. Read this file completely.
2. Read [docs/README.md](docs/README.md), then [docs/17-AGENT-OPERATING-MODEL.md](docs/17-AGENT-OPERATING-MODEL.md).
3. Read [docs/01-CENTRAL-MEMORY.md](docs/01-CENTRAL-MEMORY.md), [docs/02-SHORT-TERM-MEMORY.md](docs/02-SHORT-TERM-MEMORY.md), [docs/05-ARCHITECTURE.md](docs/05-ARCHITECTURE.md), [docs/10-USER-STORIES.md](docs/10-USER-STORIES.md), [docs/11-TASK-BACKLOG.md](docs/11-TASK-BACKLOG.md), [docs/18-EXECUTION-GRAPH.md](docs/18-EXECUTION-GRAPH.md), [docs/19-TRACEABILITY-MATRIX.md](docs/19-TRACEABILITY-MATRIX.md), and [docs/20-PRODUCT-ACCEPTANCE.md](docs/20-PRODUCT-ACCEPTANCE.md).
4. Inspect the actual repository tree, manifests, source, tests, workflows, migrations and git status. Documentation is intent; the codebase is evidence. Never assume a task is complete from a checkbox alone.
5. Identify the active branch and current commit. Unless the user explicitly directs otherwise, do all work on `environment/local`. Never push to, merge into, or rewrite `master` or `environment/develop` without explicit authorization.
6. Reconcile the requested work with existing task/story/bug/change IDs before editing.
7. For the current kickoff, read docs/46-AGENT-START-AND-WORKPACKETS.md and relevant specifications in docs/37..57. The owner explicitly authorized GO-CODE on 2026-11-07: create the source workspace and implement the first foundation slice on environment/local. This does not authorize production deployment, live data, Meta writes/messages/ads, external AI providers, recurring spend or irreversible actions.
8. Before coding, read docs/48-CODING-ARCHITECTURE-AND-REUSE-STANDARD.md, docs/49-API-CONTRACT-READINESS-AND-META-ADAPTER-GATES.md, docs/50-EVENT-CATALOG-AND-VERSIONED-SCHEMAS.md, docs/51-TECHNOLOGY-FIT-AND-VERSION-BASELINE.md, docs/52-REST-GRAPHQL-GRPC-PROTOCOL-DECISION.md and the specific OpenAPI/AsyncAPI schemas. Also read docs/53-TASK-WORK-PACKAGES.md and docs/54-TASK-039-EXECUTION-AND-CONSISTENCY-REPORT.md and docs/55-OPENAPI-CONTRACT-COMPLETION-PLAN.md plus docs/56-ARCHITECTURE-REVIEW-AND-ACCEPTANCE-GATES.md and run scripts/validate-contracts.mjs before changing contract status; do not claim formal validation unless the Contract validation workflow passes; use the row for the assigned TASK and honor its dependencies, event/API mapping, bounded-context ownership, tenant-security invariants and G0 status.

## Authority and priorities
- Direct, latest user instruction > accepted product decisions in central memory > approved ADRs > product requirements > implementation conventions > agent assumptions.
- If a user instruction conflicts with a security invariant, explain the conflict and propose a safe implementation; never silently weaken security.
- A user request to implement, fix, refactor or change something is authorization to perform that requested work, including code and tests. The historical documentation-first gate is not a blanket prohibition against implementing a task the user now explicitly requests.
- Do not invent product requirements, provider permissions, API behavior, credentials, test results, deployments or approvals. Mark unknowns and verify against current official sources.
- Never declare 100% completion or final acceptance. Only the product owner can approve the product.

## Execution loop (every task)
1. **Understand:** restate outcome internally; locate affected stories, tasks, APIs, domains and constraints.
2. **Inspect:** trace existing behavior end-to-end before editing; check callers, data contracts, migrations, tests and runtime config.
3. **Plan:** choose the smallest safe dependency slice. Record or update TASK/BUG/CR/ADR as appropriate. Ask only when a missing decision is genuinely blocking or irreversible.
4. **Implement:** follow existing stack and conventions unless an approved ADR says otherwise. Avoid unrelated rewrites. Preserve native Meta capabilities and payload semantics.
5. **Verify:** run focused tests, then relevant full suites, static analysis, formatting, build, security checks and migration checks available in the repo. Do not claim a check that was not run.
6. **Review:** inspect diff for regressions, secrets, tenant isolation, authorization, data loss, observability and compatibility.
7. **Synchronize memory:** update task status, short-term memory, roadmap, traceability and audit/change log in the same logical change.
8. **Report:** summarize files changed, behavior, tests with actual outcomes, unresolved risks, IDs and commit SHA. State what remains.

## Task status vocabulary
`proposed`, `ready`, `in_progress`, `blocked`, `implemented`, `verified`, `accepted`, `deferred`, `cancelled`.
- `implemented` means code exists.
- `verified` means required automated/manual checks passed with evidence.
- `accepted` means product owner explicitly accepted it.
Never collapse these states.

## Non-negotiable engineering invariants
- Tenant context and ownership are checked server-side at every trust boundary; no cross-tenant reads, writes, jobs, cache keys, files, events or telemetry leakage.
- Permission is the intersection of actor authorization, tenant policy, consent/legal basis, Meta scopes, asset grants, product eligibility and current API capability.
- Secrets/tokens/PII are not committed, logged, echoed into tests, or exposed to clients. Use secret manager/KMS abstractions and redacted fixtures.
- Use official Meta APIs only. Preserve versioned native request/response/error details alongside canonical models where safe.
- Treat webhooks as untrusted, duplicate, delayed and out-of-order. Verify authenticity, persist durably, deduplicate and make consumers idempotent.
- HTTP success is not delivery/publication. Model asynchronous provider states and reconcile unknown outcomes.
- Never repeat an ambiguous external write blindly. Use idempotency/reconciliation where supported.
- No real ad spend, message blast, irreversible deletion or production mutation without explicit user/product authorization and configured guardrails.
- No fabricated API version, scopes, pricing, limits, country eligibility or review status. Verify official docs and record access evidence.
- Add regression tests for every fixed defect and tests for every new acceptance criterion.

## Graph-first navigation
Use `docs/18-EXECUTION-GRAPH.md` to find prerequisites and downstream impact. Use `docs/19-TRACEABILITY-MATRIX.md` to connect user outcomes → stories → tasks → modules/contracts → tests → evidence. Before changing a node, inspect its incoming and outgoing edges. Update the graph when dependencies change.

## When blocked
Continue independent safe work. Record the exact blocker, decision owner, options, consequences and the smallest question needed. Do not fabricate a decision or mark blocked work done.

## Final response format
- Outcome and scope
- Implementation details
- Tests/checks actually executed and results
- Documentation/task IDs synchronized
- Risks/blockers/deferred items
- Commit/branch
- Explicitly state that final product acceptance remains with the user


## Team operating model — mandatory
Before work involving multiple concerns, use:
- [Team organization](docs/21-TEAM-ORGANIZATION.md)
- [Multi-agent orchestration](docs/22-MULTI-AGENT-ORCHESTRATION.md)
- [Role playbooks](docs/23-ROLE-PLAYBOOKS.md)
- [Independent validation](docs/24-INDEPENDENT-VALIDATION.md)
- [Agent boundaries and access](docs/25-AGENT-BOUNDARIES-AND-ACCESS.md)
- [Team workflow and gates](docs/26-TEAM-WORKFLOW-AND-GATES.md)

### Hard limits
1. **One accountable owner per work packet.** "All agents" is never an owner.
2. **No overlapping writes.** Agents must use isolated worktrees/branches for concurrent implementation. If isolation is unavailable, parallelize read-only analysis and serialize writes. Never let multiple agents commit concurrently to the same worktree/ref.
3. **Explicit role declaration.** At each phase, state role, objective, inputs, output, authority and limits. Role-play does not grant credentials or legal/professional authority.
4. **No self-approval.** Author cannot be independent reviewer, security approver, privacy approver or product approver for the same deliverable.
5. **Independent validation is evidence-based.** Reviewer receives original criteria and diff, reports findings and limitations; self-review is never labeled independent.
6. **Least privilege.** Tool availability is not authorization. Real messaging, ad spend, production deploys, destructive changes, real customer data and irreversible operations require explicit authorization and guardrails.
7. **No secret sharing.** Never paste tokens, cookies, credentials or personal data into agent prompts, Git, logs or shared memory.
8. **No silent scope decisions.** Escalate product, commercial, legal, privacy, high-risk security, vendor, recurring-cost and breaking-change decisions to the human owner.
9. **No fabricated team.** If only one agent is available, perform sequential role analysis and label all reviews as self-review/simulated. Do not claim independent validation.
10. **No completion by consensus.** Agent votes or multiple PASS reports do not replace product-owner acceptance.

### Mandatory concurrency sequence
Orchestrator defines task packets, dependency graph, exclusive writable paths, shared read-only paths, contract owner, reviewer, integration order and tests before parallel work starts. Integrator inspects every diff and commit, integrates one bounded packet at a time, then runs cross-package tests. If two agents need the same file/schema/contract, serialize or appoint one contract owner and require others to submit proposals.

### Mandatory role and review gates
For every non-trivial feature, assess Product/BA, domain/marketing, architecture, engineering, QA, security/privacy, SRE/operations and documentation. Mark roles not applicable with a reason. Medium/high-risk work requires independent peer/QA review; high/critical work also requires security/privacy review as applicable and human approval for reserved decisions.


## Owner decisions and technical autonomy
- Read [docs/29-OWNER-DECISIONS.md](docs/29-OWNER-DECISIONS.md), [docs/30-RECOMMENDED-ARCHITECTURE.md](docs/30-RECOMMENDED-ARCHITECTURE.md), and [docs/31-MASTER-DELIVERY-PLAN.md](docs/31-MASTER-DELIVERY-PLAN.md) before planning new work.
- The owner authorizes the architect to recommend the stack and agents to resolve reversible technical choices using the best-supported option. Record rationale and alternatives in ADRs; continue independent work.
- Do not ask the owner to choose routine implementation details. Ask only for product/business scope, recurring spend/vendor commitments, privacy/legal/data retention, high-impact security, production actions, destructive changes, and breaking contracts.
- Unanswered discovery questions do not block unrelated work. Record the blocker and continue all safe independent tasks.
- Greenfield is confirmed. Do not search for legacy source code as a prerequisite; build the approved product from zero after architecture spike and requirements readiness.
- CRM, omnichannel Inbox, rules-based automation and basic AI assistance are first-class domains. Initial AI may suggest and assist; sensitive external actions require human approval by default.


## Adopted product and architecture baseline — 2026-11-06
- Canonical decisions are in docs/29-OWNER-DECISIONS.md, PD-001..PD-023. Do not reopen delegated choices without new evidence.
- Architecture: modular monolith, bounded contexts, API/worker/scheduler roles, TypeScript 6.0/Node 26/NestJS 12, Angular 22, Nx 24/pnpm, PostgreSQL 18, Valkey 9.1, RabbitMQ 4.4, OIDC/Keycloak 26.8, Docker/Compose, Traefik and OpenTelemetry. See docs/30-RECOMMENDED-ARCHITECTURE.md.
- ADR-011..025 are accepted as recommended direction by delegated technical authority; docs/51/52 contain the comparison and current version baseline. TASK-039/SP-01..10 remain required before production bootstrap. Pin exact supported patches, image digests and lockfiles after compatibility validation.
- Initial segment: Ecuadorian SMEs in commerce/services, agencies secondary. This is a hypothesis, not market research. Do not claim TAM, revenue, conversion or demand without evidence.
- Commercial baseline: subscription per tenant + seats + measured usage. Meta external costs are separate, transparent pass-through. Do not invent prices, markup, tax or margin.
- Default locale: es-EC, USD, America/Guayaquil; tenant configurable.
- Shared PostgreSQL tenancy uses tenant_id + server-side authorization + RLS defense-in-depth. Agencies require explicit, revocable, audited grants; never inherit customer data.
- Privacy: data minimization, classification, configurable retention and export/delete workflows. Do not invent retention periods or legal compliance claims. LOPDP, transfers, roles and contracts require qualified review before live-data production.
- Official Meta APIs only. Current version, scopes, access tier, asset grants, pricing, limits and eligibility must be revalidated per operation before implementation. Read docs/32-RESEARCH-AND-EVIDENCE-REGISTER.md and docs/09-API-INTEGRATION-CATALOG.md.
- WhatsApp contact identities must support provider-scoped IDs such as BSUID; phone is not a universal primary key. Asset model must tolerate WAAC/PMA and legacy WABA relations. WhatsApp marketing uses Marketing Messages API; do not create new dependency on Cloud API marketing with announced 2027-10-13 sunset.
- Security baseline: OWASP ASVS 5.0.0; explicit tenant-isolation, webhook, OAuth, AI tool and spend controls. Accessibility target for principal UI journeys: WCAG 2.2 AA.
- Operations: measure latency/traffic/errors/saturation and p50/p95/p99. SLO candidates are not SLAs; capacity requires benchmark. Single VPS/Compose is not high availability.
- Work only on environment/local. Do not modify master/environment/develop, publish releases or deploy production without explicit owner approval. Real messaging blasts, ad spend, irreversible deletion and external publication remain gated.
- Delegated technical autonomy does not authorize recurring spend, legal/privacy acceptance, high-impact security exceptions, vendor contracts or production actions.


## Campaign and Meta agent safety (mandatory)
- Read docs/34-META-ADS-AI-AND-PLATFORM-OUTLOOK.md, docs/35-REFERENCE-PROJECTS-TECHNICAL-BENCHMARK.md and docs/36-CAMPAIGN-INTELLIGENCE-AND-GUARDED-SCALING.md before changing campaign/agent/inbox architecture.
- Never claim or imply direct control over Andromeda/GEM internal retrieval/ranking. Use official Ads API capabilities to configure eligible campaigns, creatives and signals; measure outcomes.
- Enforce PD-024: no automatic budget increase >20% per operation and no cumulative >20% over rolling 24h from the window baseline. This is WhatsBusiness policy, not Meta's universal threshold. Apply server-side with serializable concurrency, account/campaign/adset caps, idempotency and fresh remote-state verification.
- Never evade PD-024 by splitting one change across multiple agents/users/tasks or resetting the window. If the requested action exceeds the cap, reject or stage as a future recommendation; do not silently split.
- Never mutate winning/learning ad sets as the default way of testing new creatives. Use an isolated experiment/test cell or supported Meta test mechanism; keep audience overlap and learning fragmentation in view.
- AI-generated creatives remain draft/paused pending brand, policy, rights, render preview and human approval when provider feature requires it. Do not auto-publish or increase spend.
- Meta Ads MCP and Social Technologies MCP are external tools, not policy authorities. Tool calls must route through the same tenant, capability, purpose, budget, approval, audit and idempotency checks.
- Meta Business Agent interoperability requires conversation ownership/lease, loop prevention and human handoff. Never let multiple bot providers answer the same thread concurrently.
- Use official Meta APIs only for WhatsApp, Messenger, Instagram, Ads, Leads and conversions. OpenWA is read-only architecture reference for plugins/MCP patterns; never ship or fall back to WhatsApp Web/browser automation or QR sessions.
- Treat third-party SDK/repository code as reference; check license, security, current source and version before reuse. Do not assume README marketing claims are performance evidence.


## Campaign Intelligence and external reference research
- Read docs/34, docs/35 and docs/36 for current Meta Ads AI, campaign learning, budget rules and benchmark projects.
- Campaign requirements US-029..032, tasks TASK-067..080, decisions PD-024 and ADR-021/022 apply.
- The 20% cap is owner-defined; never misattribute it to Meta.
- Always protect winning ad sets and use isolated experiments; no model may directly write to Meta Ads API.
- OpenWA is not an approved WhatsApp transport. Official Meta APIs only.


## Current agent kickoff baseline — 2026-11-06

- docs/37..41 contienen especificaciones funcionales iniciales; docs/42 modelo lógico; docs/43 contratos; docs/44 threat model; docs/45 runbook del spike; docs/46 work packets.
- docs/46 y docs/57 registran GO-CODE aprobado por instrucción expresa del propietario el 2026-11-07 para crear workspace y primer slice de foundation en environment/local. No equivale a GO-PRODUCTION ni autoriza datos reales, Meta writes/mensajes/ads, proveedor IA externo, gasto recurrente o despliegue.
- Readiness y estados están en docs/11, docs/15, docs/19, docs/31 y docs/46. No inferir que una tarea está completa por existir una especificación.
- El entorno de esta auditoría no tenía pnpm ni Docker/Compose; los agentes deben registrar el entorno real y no reutilizar esos datos como mediciones del VPS.


## Mandatory API catalog and task traceability

Before creating/changing an endpoint, event, webhook or adapter, consult docs/47-API-INVENTORY-AND-TASK-MAP.md. Use the API IDs there, and map each work item to US/AC/TASK, OpenAPI operationId or event schema, permission/tenant scope, idempotency, audit, tests and evidence. Do not add unregistered endpoints or mark a TASK done because a route is merely documented. Update docs/47, docs/09, docs/19 and contracts together when an API changes.

## Mandatory anti-spaghetti, reuse and contract gates

- **Never create spaghetti code.** Apply docs/48 as a blocking engineering standard to every change.
- Search the current codebase, Nx graph, public module exports, existing use cases, repositories, ports, shared validators, components, adapters, fixtures and tests before creating new code. Reuse/extend existing cohesive components; do not copy-paste or create generic dumping-ground modules.
- A business rule and its data have one bounded-context owner. Controllers and Angular components remain thin; domain stays framework/provider independent; modules communicate only through public ports/APIs/events. No private cross-context imports, cross-context table reads or circular dependencies.
- Reuse the existing HTTP/error/idempotency/observability/outbox/inbox/tenant-context mechanisms. Build a new abstraction only when it has stable semantics and a real consumer; document why reuse is inappropriate when not reusing.
- contracts/openapi/platform-v1.yaml is the API ID registry. design-frozen means the contract schema is frozen, not that implementation is generally authorized. PLT-001/002 are explicitly authorized for the GO-CODE foundation slice; PLT-003..005 and all other operations remain gated by their specific implementation authorization. catalog-only routes are blocked until request/response/error schemas and guards are frozen per docs/49.
- contracts/asyncapi/platform-events-v1.yaml and contracts/schemas/domain-events-v1.schema.json are normative internal event contracts. Use shared outbox/inbox/dedupe/retry ports; do not create private broker clients or one queue per HTTP endpoint.
- For Meta, verify product + auth mode + API version + operation scopes + asset grants/tasks + app access tier/review + account/country eligibility from official sources and evidence. Missing evidence means deny/disabled. Never infer capability from token presence.
- Every PR must state what existing code was reused, what new code was added and why, contract/task IDs, tests executed and independent-review status. A green functional test does not waive architecture/reuse review.
