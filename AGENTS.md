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
