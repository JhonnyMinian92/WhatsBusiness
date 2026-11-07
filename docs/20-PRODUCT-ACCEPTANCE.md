# 20 — Definition of complete product and owner acceptance

## 1. Product completion is evidence-based
The product is considered technically ready only when all approved in-scope requirements are implemented and verified end-to-end. It is considered accepted only after the product owner explicitly approves it. These are separate states.

## 2. Completion gates
- **Scope:** every product requirement has an ID, priority, owner, acceptance criteria and traceability.
- **Functionality:** all in-scope stories and criteria pass on supported workflows.
- **Integration:** every promised Meta capability is mapped to current official API behavior, permissions, app review and real account eligibility; unsupported/ineligible capabilities are clearly reported, never faked.
- **Security:** tenant isolation, authorization, secrets, webhook authenticity, abuse controls, threat mitigations and security scans pass; no unresolved release-blocking finding.
- **Privacy/compliance:** consent, purpose, retention, export, deletion, revocation and audit flows are tested for applicable jurisdictions.
- **Reliability:** idempotency, retries, DLQ, replay, reconciliation, rate limits, graceful degradation and recovery are proven.
- **Quality:** unit, component, contract, integration, E2E, regression, performance and accessibility checks appropriate to the product pass.
- **Operations:** dashboards, alerts, SLOs, runbooks, backup/restore, rollback, incident response and ownership are ready.
- **Documentation:** setup, architecture, API contracts, configuration, security, operations and agent handoff are current.
- **Business:** pricing/cost assumptions, spend controls, roles and user journeys are reviewed.
- **Owner approval:** product owner has reviewed the final evidence and explicitly says the product is accepted.

## 3. Non-negotiable acceptance exclusions
Do not claim completion when any of these apply:
- A feature is represented only by a stub, TODO, mock, placeholder or hardcoded success.
- A test is skipped, flaky or mocked where a real integration proof is required, without explicit documented exception.
- A required Meta permission, app review, business verification, product eligibility or production credential remains unverified.
- Cross-tenant, authorization, data-loss, secret-leakage or spend-control risk remains open.
- Migrations, rollback, observability or support procedures are missing for critical flows.
- A criterion has no implementation/test/evidence link.
- The only evidence is documentation or a successful compilation.

## 4. Owner review package
Before asking for final approval, provide:
1. Scope baseline and exclusions.
2. Requirement/story/task completion matrix with denominator.
3. User journeys demonstrated and environments used.
4. Exact automated/manual checks, results and artifacts.
5. Security/privacy assessment and unresolved risks.
6. Meta API versions, permissions, app review and account eligibility status.
7. Performance/reliability and recovery evidence.
8. Deployment/configuration/runbook and rollback instructions.
9. Known limitations, deferred items and operating costs.
10. Commit/tag/release candidate and change history.

## 5. Approval protocol
- Agent may request review; it cannot self-approve.
- Product owner approval must be explicit and tied to a named release candidate/commit.
- Feedback creates new tasks/bugs/changes and reopens affected gates.
- A later code change invalidates the prior acceptance for affected criteria until reverified.
- No merge to production branch or production deployment is implied by technical readiness or this document.
