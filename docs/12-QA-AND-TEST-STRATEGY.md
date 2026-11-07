# 12 — Estrategia QA y pruebas

## 1. Calidad como gate
La calidad no se mide por cobertura porcentual aislada. Cada requisito crítico debe tener pruebas de comportamiento, contrato, seguridad, resiliencia y evidencia de aceptación.

## 2. Pirámide
- Unit: reglas de dominio, policy engine, state machines, pricing, validation.
- Component: adapters con HTTP stub/fixtures y manejo de errores.
- Contract: OpenAPI/AsyncAPI y schemas de Meta por versión.
- Integration: DB, queue, cache, KMS, object storage.
- E2E: onboarding, send/receive, lead journey, campaign approval, deletion.
- Non-functional: load, soak, chaos, failover, security, accessibility de consola.

## 3. Matriz de pruebas
| Dominio | Casos positivos | Casos negativos/edge |
|---|---|---|
| Tenant | CRUD, ownership | IDOR, missing tenant, cross-tenant jobs |
| OAuth | connect, refresh, revoke | state replay, wrong redirect, revoked grant |
| WhatsApp | text/template/media/flow | window closed, template rejected, rate limit |
| Messenger | send/receive/handoff | policy window, page task missing |
| Instagram | publish/comment/DM | login mode mismatch, media constraints |
| Leads | webhook/retrieval | duplicate, deleted lead, custom field |
| Ads | draft/approve/activate | overspend, wrong currency, rejected creative |
| CAPI | event/dedupe | event collision, consent revoked |
| Webhooks | valid signature, retry | spoof, replay, malformed, oversized |
| Security | authorized path | BOLA, SSRF, secret leakage, privilege escalation |

## 4. Contract tests
- Fixtures anonimizadas y versionadas por API product/version.
- Validar required/optional fields, enum drift y unknown fields.
- Snapshot de errores nativos y fbtrace ID redacted.
- Diferenciar breaking changes de adiciones compatibles.
- Contract suite corre antes de actualizar API version.

## 5. Resiliencia
- Duplicación, reordenamiento y retraso de webhooks.
- Timeout antes/después de que Meta procese la escritura.
- Circuit breaker open/half-open.
- Rate limit 429 y headers de uso.
- Queue backlog, worker crash y DLQ replay.
- DB failover, KMS unavailable, object store timeout.
- Reconciliation job repara estados desconocidos.

## 6. Seguridad y privacidad
SAST, SCA, secret scanning, IaC scanning, container scanning, DAST, fuzzing, pentest y pruebas de autorización. Datos sintéticos; prohibido usar PII real en fixtures.

## 7. Datos de prueba
- App Meta de desarrollo separada de producción.
- Business Portfolio/WABA/Page/IG/ad account de prueba cuando Meta lo permita.
- Usuarios, leads, media y eventos sintéticos.
- No asumir que sandbox reproduce todos los límites/capacidades de producción.
- Cada test externo registra fecha, app mode, versión, permiso y resultado.

## 8. Release gates
- G0: requisitos y fuentes confirmadas.
- G1: arquitectura y ADR aprobados.
- G2: threat model y privacy review.
- G3: unit/component/contract pass.
- G4: integration/e2e pass.
- G5: load/resilience/security pass.
- G6: App Review/Business Verification/permissions aprobados.
- G7: observabilidad/runbooks/rollback listos.
- G8: product + QA + security + operations sign-off.

## 9. Métricas QA
Defect escape rate, flaky test rate, change failure rate, MTTR, contract drift, test coverage por criterio de aceptación, vulnerabilidades por severidad y defectos cross-tenant. No aceptar cobertura alta si los AC críticos carecen de pruebas.


## 10. Standards and extended regression requirements (baseline 2026-11-06)
- OWASP ASVS 5.0.0 is the baseline catalog for security verification. Select applicable requirements, target level and evidence in the security test plan; do not claim certification/compliance merely because the standard is referenced.
- Primary user journeys target WCAG 2.2 AA; automation checks are complemented by manual keyboard and screen-reader review.
- CRM identity tests cover phone, BSUID and provider-scoped identifiers, namespace collisions, no unsafe auto-merge, and reversible merges.
- Asset graph tests cover WAAC/PMA and WABA legacy relationships without assumptions about a universal parent ID.
- Meta adapter suites are versioned by product/API version; test unknown fields, enum drift, native error preservation, sunset flags and capability deny when access tier/grant/scope is missing.
- Marketing Messages API suite tests category eligibility, opt-out/suppression, provider pricing and estimate/maximum/actual/reconciled cost distinctions.
- Tenant/agency suite must test explicit grant scope, expiry, revocation, client-side isolation, audit provenance and support JIT access.
- LOPDP lifecycle suite tests export/rectification/deletion orchestration across primary and derived systems; exact retention windows remain policy inputs pending legal approval.
- Nonfunctional tests report p50/p95/p99, throughput, concurrency, saturation, queue age, error budgets, recovery and test environment. Never extrapolate benchmark beyond its hardware/configuration.
