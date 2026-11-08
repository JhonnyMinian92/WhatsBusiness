# 53 — Registro de paquetes de trabajo TASK-001..080

**Rama:** environment/local · **Corte:** 2026-11-06.  
**Estado:** contrato de handoff/planificación; no equivale a asignación ni implementación. Owner concreto y reviewer distinto deben registrarse antes de iniciar.

## 1. Reglas de asignación y escritura

- Una TASK = un accountable owner. Los roles sugeridos no son usuarios ni asignaciones reales.
- Reviewer distinto del autor. Riesgo alto/crítico requiere QA y Security/Privacy según aplique; si no hay segundo agente, declarar self-review/simulated y no llamarlo independiente.
- Lecturas compartidas sí; escrituras concurrentes no. Confirmar paths exclusivos después del bootstrap; no inventar rutas antes de que exista workspace.
- OpenAPI, AsyncAPI, schemas y modelos compartidos tienen un contract owner por cambio. Otros agentes presentan propuestas; integración serializada.
- Trabajar en environment/local. No modificar master ni environment/develop. Para paralelismo de código, worktrees/branches aisladas e integración serial por un integrador.
- Prohibido código spaghetti: inspeccionar y reutilizar módulos, ports, use cases, validators, componentes, fixtures y tests; aplicar docs/48; no duplicar reglas ni crear shared dumping grounds.

## 2. Contrato común de cada paquete

**Entradas:** ficha TASK; US/AC de docs/10 y especificaciones docs/37..41; dependencias upstream verificadas; ADR/CR/BUG; API IDs docs/47 y OpenAPI; eventos/schemas AsyncAPI; threat model docs/44; docs/48 coding standard; docs/49 contract gates; docs/50 event catalog; decisiones docs/29..33.

**DoR antes de escribir:** outcome/no-alcance; owner/reviewer; branch/base SHA; estado/dependencias; bounded-context owner; API/event IDs; clasificación/tenant/actor/purpose; paths exclusivos; reutilización investigada; Given/When/Then; tests exactos; fixtures sintéticas; rollback/migración; evidencia.

**Entregables:** cambio focalizado; contratos/migraciones sincronizados; tests; decisiones e impacto documentados; evidencia real de ejecución; handoff con commit SHA, paths, comandos/resultados, riesgos y siguiente paso.

**Pruebas por defecto:** unitarias de dominio; integración DB/transacciones/RLS cuando aplique; contract tests OpenAPI/AsyncAPI/Meta; autorización negativa y tenant isolation; idempotencia/concurrencia/retry; audit/redaction; E2E; migration/rollback; lint/typecheck/build/security scans. Omitir categoría solo con razón.

**DoD:** criterios de la tabla y AC de la US satisfechos; contrato congelado antes de implementar APIs catalog-only; schemas/events versionados y validados; reviewer distinto; sin secretos/PII; docs/11, docs/18, docs/19, docs/47 y contracts sincronizados; estado con evidencia. implemented ≠ verified ≠ accepted; solo el owner del producto acepta.

## 3. Matriz individual TASK → owner → dependencias → contratos/eventos → aceptación

Los API IDs/entregables proceden de docs/47 §7.2; eventos, de descripciones AsyncAPI. “Sin API REST directa” significa que no se debe inventar endpoint. La aceptación resume el DoD de docs/11; el agente debe convertirlo en casos Given/When/Then y TEST IDs antes de implementar.

| TASK | Rol accountable sugerido | US / área | Dependencias TASK / externas | API IDs / entregable | Eventos AsyncAPI relacionados | Criterio de cierre del backlog |
|---|---|---|---|---|---|---|
| TASK-001 | Platform / Identity | US-001 | external: ADR-002 | PLT-004..007, IAM-002..004 | platform.tenant.created, platform.tenant.suspended | invariantes + migración testeada |
| TASK-002 | Platform / Identity | US-001 | TASK-001 | PLT-003..005 | platform.tenant.created, platform.tenant.suspended | tests negativos cross-tenant |
| TASK-003 | Platform / Identity | US-001 | TASK-001 | Sin API REST; queue/cache/storage namespace and telemetry partitioning | No aplica / no catalogado | tests de namespace/partition |
| TASK-004 | Platform / Identity | US-002 | TASK-001 | IAM-007..017, IAM-018..020 | platform.membership.changed | matriz allow/deny automatizada |
| TASK-005 | Platform / Identity | US-002 | TASK-004 | IAM-018..020, OPS-001..002 | platform.membership.changed | pruebas de escalamiento y doble aprobación |
| TASK-006 | Meta Control Plane | US-003 | TASK-001; TASK-004 | META-002..004, META-009 | meta.connection.created | CSRF, replay, redirect tests |
| TASK-007 | Meta Control Plane | US-003 | TASK-006 | META-004, META-007..009 | meta.connection.created, meta.credentials.expiring, meta.connection.revoked | secret scanning + rotation drill |
| TASK-008 | Meta Control Plane | US-003 | TASK-006; TASK-007 | META-005..006 | meta.connection.created | sandbox/real business flow |
| TASK-009 | Meta Control Plane | US-004 | TASK-008 | META-010..013 | meta.connection.created, meta.assets.sync_requested, meta.assets.synced | ownership/grant drift tests |
| TASK-010 | Meta Control Plane | US-004 | TASK-009 | META-013..016 | meta.connection.created, meta.assets.sync_requested, meta.assets.synced, meta.capability.changed | matrices scopes/tasks/version |
| TASK-011 | WhatsApp | US-005 | TASK-010 | WA-001..005, WA-009 | whatsapp.message.send_requested | contract tests por tipo |
| TASK-012 | WhatsApp | US-005 | TASK-011 | WA-006..007 | whatsapp.message.send_requested | MIME, size, malware, expiry tests |
| TASK-013 | WhatsApp | US-005 | TASK-011; TASK-027 | WA-004..005, WA-008, WH-002, INB-005 | whatsapp.message.send_requested, whatsapp.message.delivery_updated | eventos duplicados/out-of-order |
| TASK-014 | WhatsApp | US-006 | TASK-010 | WAM-001..005 | whatsapp.template.status_changed | estados/categorías/idiomas |
| TASK-015 | WhatsApp | US-006 | TASK-014 | WAM-006..007 | whatsapp.template.status_changed | placeholders/header/buttons tests |
| TASK-016 | WhatsApp | US-007 | TASK-010; TASK-027 | WAF-001..008 | No aplica / no catalogado | cifrado, replay, versioning |
| TASK-017 | WhatsApp | US-008 | TASK-010 | WAMK-001..003 | No aplica / no catalogado | eligibility/policy/contract tests |
| TASK-018 | WhatsApp | US-008 | TASK-017 | WAMK-004..007 | No aplica / no catalogado | vigencias, moneda, reconciliation |
| TASK-019 | Social Channels | US-009 | TASK-010; TASK-027 | FB-001..014, WH-003 | No aplica / no catalogado | scopes, Page tasks, windows |
| TASK-020 | Social Channels | US-010 | TASK-010 | IG-001 | No aplica / no catalogado | matrix account/login/scopes |
| TASK-021 | Social Channels | US-010 | TASK-020; TASK-027 | IG-002..012, WH-004 | No aplica / no catalogado | media types, webhooks, limits |
| TASK-022 | Leads / Ads | US-011 | TASK-009; TASK-027 | LEAD-001..004, LEAD-009, WH-005 | lead.received | duplicates, custom fields, access |
| TASK-023 | Leads / Ads | US-011 | TASK-022; TASK-004 | LEAD-005..008, CRM-002, CRM-005..007 | lead.received, lead.deduplicated, lead.qualified | lineage y consent tests |
| TASK-024 | Leads / Ads | US-012 | TASK-010; TASK-004 | ADS-001..012, ADS-014..020, ADS-006 | ads.draft.created, ads.campaign.approval.requested | invalid objective/targeting/budget |
| TASK-025 | Leads / Ads | US-012 | TASK-024; TASK-029 | ADS-007..008, ADS-013, ADS-021..027, ADS-026, IAM-018..020 | ads.draft.created, ads.campaign.approval.requested, ads.budget.change.approved | kill switch, cap, reconciliation |
| TASK-026 | Leads / Ads | US-013 | TASK-023; TASK-031 | CAPI-001..004 | No aplica / no catalogado | event_id, consent, dedupe |
| TASK-027 | Event Platform | US-014 | TASK-001; TASK-007 | WH-001..008 | meta.webhook.received | signature, size, durable ack |
| TASK-028 | Event Platform | US-014 | TASK-027 | OPS-003..005 + internal events section | meta.webhook.received | at-least-once, idempotency |
| TASK-029 | Security / SRE / Privacy | US-015 | TASK-001 | PLT-001..002, OPS-003, OPS-006 | No aplica / no catalogado | redaction, cardinality, alerts |
| TASK-030 | Security / SRE / Privacy | US-015 | TASK-004; TASK-029 | OPS-001..002, OPS-008 | No aplica / no catalogado | tamper evidence/access review |
| TASK-031 | Security / SRE / Privacy | US-016 | TASK-001 | OPS-007..008 + CI security pipeline | No aplica / no catalogado | SAST/SCA/DAST/pentest plan |
| TASK-032 | Security / SRE / Privacy | US-016 | TASK-007; TASK-030 | PRIV-001..010 | privacy.request.created, privacy.deletion.completed | deletion verification |
| TASK-033 | Threads Adapter | US-017 | TASK-010; TASK-027; TASK-029 | TH-001..006, WH-007 | No aplica / no catalogado | backward compatibility |
| TASK-034 | Domain Specification Lead | Especificación funcional de Platform Identity, tenants, planes y roles | external: PD-001 PD-010 | PLT-003..007, IAM-001..020; docs/37 | No aplica / no catalogado | Flujos, permisos, estados y criterios de aceptación completos |
| TASK-035 | Domain Specification Lead | Especificación funcional de CRM, contactos, leads, pipeline y actividades | external: PD-004 | CRM-001..017, SALES-001..014; docs/38 | No aplica / no catalogado | Modelo, reglas, journeys, dedupe y criterios testeables |
| TASK-036 | Domain Specification Lead | Especificación funcional de Inbox omnicanal y handoff humano | external: PD-004 PD-003 | INB-001..018, WA/FB/IG message operations; docs/39 | No aplica / no catalogado | Contratos canónicos, diferencias por canal, estados y UX documentados |
| TASK-037 | Domain Specification Lead | Especificación de Automation Engine y chatbots basados en reglas | external: PD-005 | AUTO-001..013 + internal workflow events; docs/40 | No aplica / no catalogado | Triggers, condiciones, acciones, retries, versiones, pausa y audit definidos |
| TASK-038 | Domain Specification Lead | Especificación de AI Assistance / AI Gateway | external: PD-005 | AI-001..008, AGT-001..006; docs/41 | No aplica / no catalogado | Proveedor desacoplado, seguridad, coste, evaluación y human approval definidos |
| TASK-039 | Architecture Spike Lead | Architecture spike y validación transversal ADR-011..025 | external: PD-007 PD-008 PD-021 PD-023 | Sin API REST; docs/45 SP-01..10, ADR-011..025 | No aplica / no catalogado | SP-01..10: compatibilidad exacta Node/TS/Nest/Angular/Nx, comparación backend/frontend/protocolos, RLS/pooling, outbox/broker, webhook durable, Valkey, restore y footprint |
| TASK-040 | Product BA / Traceability | Reconciliación completa de historias, requisitos y trazabilidad | TASK-034; TASK-035; TASK-036; TASK-037; TASK-038; TASK-039 | Sin API REST; docs/19, docs/47 | No aplica / no catalogado | Cada requisito tiene ID, prioridad, owner, AC, tareas, módulos previstos y evidencia esperada |
| TASK-041 | SRE / FinOps | Definición operativa: SLO/RPO/RTO, capacidad, backups y presupuesto VPS | external: Q-013 | Sin API REST; docs/13, docs/31, docs/45 | No aplica / no catalogado | Objetivos cuantificados y validados por propietario |
| TASK-042 | CRM / Sales | US-018 | TASK-001; TASK-034 | CRM-001..004, CRM-011..013 | lead.received, lead.deduplicated, lead.qualified, crm.contact.created | tenant isolation, validation, audit |
| TASK-043 | CRM / Sales | US-018 | TASK-042; TASK-022 | CRM-005..010 | lead.deduplicated, crm.identity.linked, crm.identity.merged | collision, provenance, undo tests |
| TASK-044 | CRM / Sales | US-019 | TASK-042; TASK-004 | CRM-014..017, SALES-001..014 | crm.opportunity.stage_changed, crm.opportunity.won | transition, assignment, permission tests |
| TASK-045 | Inbox | US-020 | TASK-010; TASK-027; TASK-036 | INB-001..005, INB-010..013, WA/FB/IG message operations | whatsapp.message.send_requested, whatsapp.message.delivery_updated, inbox.conversation.created, inbox.message.received, inbox.message.send_requested, inbox.message.delivery_updated | adapter contract, native payload, capability tests |
| TASK-046 | Inbox | US-020 | TASK-045; external: frontend foundation; external: FE-FOUNDATION | INB-001..005, INB-015..017 | inbox.conversation.created, inbox.message.received | E2E per channel, responsive, a11y |
| TASK-047 | Inbox | US-021 | TASK-004; TASK-045 | INB-006..014, INB-018 | inbox.assignment.changed, inbox.ownership.acquired, inbox.handoff.completed | race, duplicate send, privacy tests |
| TASK-048 | Automation | US-022 | TASK-028; TASK-034; TASK-037 | AUTO-001..007 | automation.execution.requested | schema, simulation, permission tests |
| TASK-049 | Automation | US-022 | TASK-048; TASK-027; TASK-028 | AUTO-008..013 + workflow events | inbox.message.received, automation.execution.requested, automation.step.completed, automation.dead_letter | idempotency, DLQ, timeout, replay tests |
| TASK-050 | AI Assistance | US-023 | TASK-029; TASK-038 | AI-001..004 | ai.suggestion.requested, ai.suggestion.created, ai.feedback.received | timeout, cost cap, redaction, fallback tests |
| TASK-051 | AI Assistance | US-023 | TASK-045; TASK-047; TASK-050 | AI-005..008, INB-013, AGT-002 | ai.suggestion.requested, ai.suggestion.created, ai.feedback.received | no-auto-send, prompt injection, eval tests |
| TASK-052 | Platform / Billing | US-024 | TASK-001; TASK-004; TASK-041 | IAM-001..012, BILL-001..002, PAR-007 | platform.tenant.created, platform.tenant.suspended | privilege, audit, entitlement tests |
| TASK-053 | CRM Identity | US-018, US-020 / CRM + Asset Registry | TASK-034; TASK-042; TASK-045 | CRM-005..010, META-011..015, INB-001..005 | crm.identity.linked, crm.identity.merged | Contract fixtures; no phone-as-primary-key; no automatic merge across identifier namespaces; reversible identity merge; migration tests |
| TASK-054 | Meta Onboarding | US-003 / Meta Control Plane | TASK-006; TASK-007; TASK-008; TASK-009; TASK-010; TASK-039 | META-005..006, META-010..015 | No aplica / no catalogado | Official docs/version review; eligibility matrix; sandbox and real authorized account evidence; rollback/legacy compatibility |
| TASK-055 | WhatsApp Marketing | US-008 / WhatsApp Marketing | TASK-010; TASK-017; TASK-018; TASK-039; TASK-056 | WAMK-001..003, META-014..016 | No aplica / no catalogado | Contract tests, category/policy checks, rate card source/version, migration plan, deadline alerts, authorized test-account evidence |
| TASK-056 | Meta Capability Registry | Cross-Meta / Capability Registry | TASK-010; TASK-039 | META-013..016, OPS-009..011 | meta.connection.created, meta.credentials.expiring, meta.connection.revoked, meta.capability.changed | Per-operation capability matrix, version compatibility fixtures, deprecation alert, source/date and tier evidence; never hardcode one global Graph version |
| TASK-057 | Billing / Cost Ledger | US-008 / Cost Ledger | TASK-017; TASK-018; TASK-055 | WAMK-004..007, BILL-003..005 | No aplica / no catalogado | Currency, market, category, versioned rate card, precision tests, reconciliation report; no treating max price as actual charge |
| TASK-058 | Partner Access | US-025 / Platform + Partner Access | TASK-001; TASK-004; TASK-034; TASK-052 | PAR-001..007, IAM-005, IAM-018..020 | platform.membership.changed, platform.grant.revoked | Cross-tenant deny tests; client revocation; no inherited data; JIT support separation; audit and expiry tests |
| TASK-059 | Privacy | US-016 / Privacy & Compliance | TASK-031; TASK-032; TASK-030 | PRIV-001..010, OPS-001..002 | privacy.request.created, privacy.deletion.completed | Data-flow map; retention configurable; deletion covers DB/object/cache/search/queue/derived artifacts; legal sign-off for actual retention, LOPDP roles and transfers before live data |
| TASK-060 | Performance Engineering | TASK-039,041 / Performance Engineering | TASK-039; TASK-041; TASK-001; TASK-027; TASK-028 | Sin API REST; scripts/benchmark artifacts, OPS-003/006 observability | No aplica / no catalogado | Reproducible test scripts; hardware/version/config; baseline p50/p95/p99, RPS, concurrency, queue age, saturation, error rate and recovery; report limits and cost; no capacity claim without evidence |
| TASK-061 | SRE / DR | US-015/016 / SRE + Security | TASK-029; TASK-030; TASK-031; TASK-039; TASK-060 | Sin API REST; restore reports/runbooks, OPS-003/006 observability | No aplica / no catalogado | Restore from encrypted backup on clean host; consistency checks; measured RPO/RTO; runbook, owner and evidence; production gate |
| TASK-062 | Developer Platform | US-027 / Developer Platform | TASK-001; TASK-004; TASK-027; TASK-028; TASK-029 | DEV-001..011 | developer.webhook.delivery.requested, developer.webhook.delivered, developer.webhook.failed | OpenAPI docs, scopes, key rotation/revocation, HMAC signature/replay tests, delivery attempts, idempotency, rate limit, portal docs |
| TASK-063 | Billing | US-026 / Billing & Usage | TASK-034; TASK-041; TASK-052 | BILL-001..007, AI-004, WAMK-005 | No aplica / no catalogado | Entitlements not scattered in code; immutable usage ledger; plan change proration requirements; no pricing/tax implementation before unit economics/legal review |
| TASK-064 | UX / Accessibility | PD-006 / Web UX | TASK-034; TASK-036; TASK-046; external: Frontend foundation; external: FE-FOUNDATION | Sin API REST; frontend a11y tests | No aplica / no catalogado | Keyboard-only journeys, screen-reader semantics, contrast, focus, error messaging, automated checks plus manual audit; defects triaged |
| TASK-065 | Meta Operations | US-014 / Meta Platform Operations | TASK-027; TASK-029; TASK-056 | OPS-009..011, META-016 | meta.capability.changed, meta.change.detected, meta.change.impact.analyzed | Dated evidence for each product; change impact mapped to adapters/tests/tenants; deprecation action owner and migration status |
| TASK-066 | Product Discovery | US-028 | external: PD-012; docs/32 MKT-OBS-001/002 | Sin API REST; research artifacts and pilot analytics | No aplica / no catalogado | Investigación documentada; participantes segmentados/anonimizados; patrones y contradicciones; falsación de hipótesis; ICP revisado; pricing solo con unit economics reales. |
| TASK-067 | Campaign Intelligence / CAPI | US-029 | TASK-024; TASK-025; TASK-026; TASK-039 | CI-001..008, CI-003..004 | campaign.recommendation.created, campaign.recommendation.approved, campaign.recommendation.executed | domain model, ACs, event contracts, provenance, simulations; ningún Andromeda score inventado |
| TASK-068 | Campaign Intelligence / CAPI | US-029 | TASK-023; TASK-026; TASK-042; TASK-044; TASK-059 | CAPI-001..004, SALES-010..014, CI-001..003 | crm.opportunity.stage_changed, crm.opportunity.won | stable event_id/name/time, consent, dedupe, event source, diagnostics, data minimization and replay tests |
| TASK-069 | Creative Lab / Experiments | US-030 | TASK-024; TASK-038; TASK-050; TASK-060 | CI-014..017, ADS-014..017 | ads.draft.created, creative.variant.created, creative.reviewed | creative schema, near-duplicate detection, prompt provenance, brand/claim gates and approval evidence |
| TASK-070 | Creative Lab / Experiments | US-030 | TASK-024; TASK-025; TASK-067; TASK-069 | CI-009..013 | creative.variant.created | hypothesis, control/variant, randomization/Meta experiment ref, budget allocation, sample/stop rules and overlap checks |
| TASK-071 | Campaign Intelligence / Insights | US-029 | TASK-025; TASK-067; TASK-060 | ADS-013, ADS-026, CI-005..007, IAM-018..020 | ads.campaign.approval.requested, ads.budget.change.approved, campaign.recommendation.created, campaign.recommendation.approved, campaign.recommendation.executed | Decimal arithmetic, concurrency/idempotency, multi-agent race tests, account/campaign/adset caps, fail-closed and approval audit |
| TASK-072 | Campaign Intelligence / Insights | US-029 | TASK-024; TASK-025; TASK-029; TASK-056; TASK-060 | ADS-022..027, CI-001..003, CI-018 | ads.insights.snapshot.created | API version per request, pagination/checkpoints, rate limits, currency/timezone, attribution and provider provenance |
| TASK-073 | Creative Lab / Meta Ads | US-030 | TASK-056; TASK-069 | ADS-016..017, META-014..016, CI-017 | creative.reviewed | capability/access matrix, preview tests by placement/feature, paused-first AI creative flow where required, rollback/undo |
| TASK-074 | Meta Ads Tool Gateway | US-031 | TASK-004; TASK-024; TASK-025; TASK-067 | AGT-001..004, CI-005..007, IAM-018..020 | campaign.recommendation.approved, campaign.recommendation.executed, agent.tool.requested, agent.tool.approved, agent.tool.completed, agent.tool.denied | allowlisted tools, draft staging, explicit approval, scoped tokens, action audit, deny unsafe/direct writes |
| TASK-075 | Business Agent / Inbox | US-031 | TASK-036; TASK-045; TASK-047; TASK-050; TASK-051; TASK-058 | INB-010..013, AGT-001..003, FB/IG/WA handoff | inbox.ownership.acquired, inbox.handoff.completed, agent.tool.requested, agent.tool.completed, agent.tool.denied | ownership lease, echo/dedupe, bot suppression, human handoff, provider identity and audit; per-country/channel eligibility |
| TASK-076 | Meta Change Intelligence | US-032 | TASK-010; TASK-029; TASK-056; TASK-065 | OPS-009..011, META-014..016 | meta.change.detected, meta.change.impact.analyzed | official source and date, version/feature/effective date, impacted adapters/tenants/tests, alert + migration draft; no auto-approval |
| TASK-077 | Campaign Measurement | US-029 | TASK-026; TASK-067; TASK-068; TASK-070 | CI-003..013 | No aplica / no catalogado | reported-attribution vs causal lift distinction, holdout/split-test docs, confidence/denominator/measurement caveats |
| TASK-078 | Campaign Measurement | US-029 | TASK-067; TASK-068; TASK-072 | CI-001..004, CI-018, ADS-024..025 | No aplica / no catalogado | separate provider metrics from CRM outcomes, cohorts/windows, revenue/margin, data freshness and anomaly alerts |
| TASK-079 | Creative Lab / Meta Ads | US-030 | TASK-069; TASK-070; TASK-072; TASK-073 | CI-014..018, ADS-014..017 | creative.variant.created, creative.reviewed | recommendation evidence, fatigue thresholds by tenant/objective, variant draft, no production activation before approval |
| TASK-080 | Agent Tool Gateway | US-031 | TASK-004; TASK-047; TASK-067; TASK-074; TASK-075 | AGT-001..006, IAM-018..020, OPS-001..002 | agent.tool.requested, agent.tool.approved, agent.tool.completed, agent.tool.denied | tool schemas, purpose/scope/tenant checks, approvals, budgets, idempotency, redaction, audit and kill switch |

## 4. Dependencias y gates transversales

- TASK-034..038: revisión de especificaciones, no código de producto; requieren review de dominio/QA.
- TASK-039: Architecture Spike SP-01..10 y ADR-011..025. G0 cerrado hasta evidencia real de compatibilidad, RLS/pooling, broker, durable webhook, restore, footprint y review independiente.
- TASK-040: REQ → US → AC → TASK → API/event → module → test → evidence. Puede avanzar read-only mientras TASK-039 corre; no declarar final hasta cerrar decisiones de G0.
- TASK-041: SLO/RPO/RTO, workload y presupuesto; cualquier gasto/proveedor requiere aprobación humana.
- TASK-042..052: no iniciar scaffold productivo antes de G0. Primer slice recomendado: OIDC, User/Tenant/Membership, PostgreSQL/RLS, tenant context, /me, audit/outbox y pruebas cross-tenant.
- TASK-053..059: respetar P0 de identidad, Meta capability, privacidad y grants. Pruebas de cuenta real requieren autorización y evidencia oficial.
- TASK-060 no emite sizing/capacidad sin hardware y carga reproducibles; TASK-061 no declara RPO/RTO sin restore drill medido.
- TASK-064 necesita FE-FOUNDATION; no pasa DoR hasta que esté verified.
- TASK-067..080: respetar dependencias de Ads, CRM, Inbox, permisos, privacidad y event provenance. TASK-080 es el boundary obligatorio antes de agentes con external writes.

## 5. Prerequisito no normalizado FE-FOUNDATION

TASK-046 y TASK-064 nombran “frontend foundation” sin ID ni entregable aceptado. No tratarlo como satisfecho. Crear un paquete habilitador después de G0, con owner/reviewer y paths exclusivos: Angular/Nx app shell, design tokens/component strategy, routing, OIDC boundary, typed API client, error/loading/empty states, lint/typecheck/test/E2E/a11y baseline y CI. TASK-046/064 no pasan DoR hasta que FE-FOUNDATION esté verified.

## 6. Contratos y eventos

- OpenAPI registra 297 operaciones HTTP (289 REST de producto + 8 webhook ingress). Solo 5 design-frozen; 292 catalog-only. Nadie implementa catalog-only hasta congelar request/response/error schemas, permissions, tenant scope, idempotency, audit, rate limits y tests según docs/49.
- AsyncAPI registra 55 canales/eventos y JSON Schema 55 payload definitions. Esto no demuestra producers/consumers/topology/runtime. At-least-once, outbox/inbox, publisher confirms, manual ACK, dedupe persistente y DLQ son criterios de ejecución.
- El envelope genérico permite tenantId null para eventos globales; los 55 payload schemas actuales exigen UUID no nulo. Eventos globales futuros requieren tipo/schema separado.
- Toda TASK sin API/evento directo debe declararlo y entregar artefacto no HTTP (infra, benchmark, research, a11y, policy, etc.).

## 7. Handoff mínimo del agente

1. TASK/US/AC/ADR/BUG/API/event IDs; owner, reviewer y roles aplicables.
2. Commit SHA, branch y paths modificados.
3. Reutilización realizada (símbolos/módulos) y código nuevo justificado.
4. Tests ejecutados con comando, resultado y evidencia; skips/fallos separados.
5. Migraciones/contract changes, compatibilidad, rollback y consumidores afectados.
6. Riesgos, decisiones pendientes y estado propuesto.
7. Confirmación de no merge protegido, deploy, gasto, mensaje real ni publicación sin autorización.

### Handoff TASK-002 — 2026-11-07

**Estado del código:** implemented y CI-verified. El estado global de TASK-002 no avanza a `verified`/`accepted` hasta revisión independiente y aceptación del Product Owner.

- Migración: `apps/api/migrations/0003-tenant-context-authorization.sql`.
- Paths principales: `apps/api/src/platform/database/database.module.ts`, `apps/api/src/platform/identity/identity.repository.ts`, `identity.service.ts`, `identity.controller.ts`, `identity.module.ts`, `tenant-access-context.ts`, `tenant-context.guard.ts`, `tenant-context.guard.spec.ts`, `identity.slice.spec.ts`.
- Security: default-deny; membership/user/organization/tenant status; RLS context after predicate; purpose metadata; immutable request context; authorization versioning and transaction lock/revalidation.
- API IDs: PLT-003..005 existing contracts only; no new catalog-only endpoint was implemented.
- CI: Source workflow run #47 [42383524043](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42383524043), commit `74febd28056043cda15221f29c8c5b71290ca06c` — SUCCESS.
- Remaining scope: TASK-004 permission matrix and action/asset ABAC; TASK-003 jobs/cache/files/telemetry; TASK-005 approvals/step-up/audit. Worker, partner and support JIT contexts remain outside this work packet.
### Handoff TASK-004 — RBAC/ABAC core (2026-11-07)

**Estado del código:** núcleo implementado y CI-verified; TASK-004 continúa `in_progress` hasta revisión independiente, persistencia de assignments donde contract freeze lo permita, auditoría de denegaciones privilegiadas y aceptación del Product Owner.

- Migration: `apps/api/migrations/0004-authorization-permission-catalog.sql` — inserta global permission catalog/risk class; no crea roles ni grants.
- Domain/application: `authorization/permission-catalog.ts`, `tenant-role-catalog.ts`, `tenant-authorization-policy.ts`, `authorization.service.ts`, `tenant-role-assignment.policy.ts`.
- HTTP: `authorization.guard.ts` ofrece `RequirePermission` y `RequireTenantPermission`, composite de TenantContextGuard + purpose + permission.
- Role assignment: exige `tenant_owner`, prohíbe self-assignment/cross-tenant/platform role y no permite asignar permisos por encima del actor; exige approval evidence independiente.
- Tests: policy allow/deny, catalog/database consistency, role template invariants, authorization guard y role assignment escalation tests.
- CI Source run #67 [42385036275](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42385036275), commit `53e50dc00daccc7c64c7931e468e6ef0af132940` — SUCCESS.
- No se exponen IAM-007..020 porque docs/49 aún los define catalog-only. Append-only audit, step-up/MFA, approval persistence and outbox belong to TASK-005.
### Handoff TASK-005 — approval, step-up and audit core (2026-11-07)

**Estado del código:** implementado y CI-verified en PostgreSQL efímero; TASK-005 permanece `in_progress` hasta verificación real del IdP, contrato/outbox consumer, revisión independiente y aceptación del Product Owner.

- Migration: `apps/api/migrations/0005-approval-audit-foundation.sql` — approval_requests/decisions, audit_stream_heads/events, RLS, grants column-scoped y state guards.
- Code: `security/step-up-evidence.ts`; `approvals/approval-policy.ts`, `approval-request-hash.ts`, `approval-workflow.service.ts`; `audit/append-only-audit.repository.ts`, `authorization-decision-audit.service.ts`; OIDC claims `auth_time/acr/amr` after RS256/JWKS validation.
- Action binding: canonical SHA-256 binds tenant/action/purpose/resource/snapshot; requester/idempotency unique; same key/different payload conflicts.
- Decision: active actor identity re-resolved from issuer+subject; issuer-allowlisted recent step-up; requester cannot vote; distinct approvers and configurable quorum; decisions append-only; expires safely.
- Consumption: exact approval hash, one-time state and caller-supplied durable DB staging callback in same transaction; no provider/HTTP I/O.
- Audit: tenant SHA-256 hash chain, sequence lock/head consistency, sensitive allow and denied events, trigger-protected audit/approval decision immutability.
- Validation: Source CI #112 [42387272987](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42387272987) — SUCCESS, commit `b38b78ab52dbb96262dc8078518fdf4f55fc5a2c`; integration test was enabled with `RUN_APPROVAL_INTEGRATION_TESTS=true` against ephemeral PostgreSQL.
- Limits: step-up allowlist intentionally blank until real IdP values verified; IAM-018..020 remain catalog-only; no business outbox/consumer, no external chain anchoring, no production actions or data; owner policy thresholds/reviewer acceptance remain open.

### Handoff TASK-004 — persistencia tenant-role (2026-11-08; CI pendiente)

- Migration apps/api/migrations/0007-tenant-role-assignment.sql completa el vocabulary mismatch del catálogo SQL (webhooks.dead_letters.read y jobs.replay.request), añade descripción versionada para role templates y policies/grants tenant-owner para materializar plantillas y gestionar membership-role edges.
- authorization/tenant-role-assignment.repository.ts implementa target inspection tenant-scoped, materialización idempotente con validación exacta de metadata y permisos, asignación insert-on-conflict y revocación con protección del último propietario activo.
- authorization/tenant-role-assignment.service.ts implementa request/apply de assign y revoke. Exige owner, propósito estable, no autoasignación (assign), no privilege escalation, aprobación ligada a snapshot SHA-256 con operation/tenant/membership/user/status/role/version/permissions; no expone endpoints.
- Los cambios escriben membership_roles bajo RLS y authzVersion. El consumo de aprobación, edge y audit event se ejecutan mediante callback en ApprovalWorkflowService.consumeAndStage; el rollback de callback impide consumir aprobación si falla la operación.
- IdentityModule registra y exporta el caso de uso interno. Las rutas IAM-007..020 siguen catalog-only.
- Policy tests e integración PostgreSQL añadidos; source-validation.yml activa la variable de integración y api/project.json registra el spec.
- Estado: código implementado; Source CI pendiente. TASK-004 sigue in_progress hasta CI, revisión independiente y aceptación del propietario.

### Handoff TASK-005 — denegaciones y ciclo de aprobación reforzados (2026-11-08; CI pendiente)

- AuthorizationDecisionAuditService usa withTenantContextAtVersion para grants sensibles y withTenantContext para denegaciones, permitiendo registrar un rechazo cuando cambió la versión RBAC pero el actor/tenant siguen activos; no se usa el contexto stale para autorizar.
- El flujo de asignación/revocación requiere approval roles.assign con step-up OIDC reciente, firmado y configurado por allowlist; el valor ACR/AMR de prueba es sintético y no se habilita en producción.
- La integración PostgreSQL prueba aprobador distinto, consumo único, persistencia de rol, revocación y protección del último owner, además de auditoría append-only.
- Persisten gates: IdP y allowlist real, consumer/outbox de acciones de negocio, anclaje externo del hash-chain, revisión independiente y Product Owner acceptance. TASK-005 continúa in_progress y GO-PRODUCTION permanece NO-GO.


### Handoff US-006 — TASK-014/015 (2026-11-08)

- Bounded context: apps/api/src/whatsapp/templates/{domain,application,infrastructure} y whatsapp-templates.module.ts.
- Migración 0027: RLS FORCE, actor/tenant triggers, provider fields inmutables para app role, revisions append-only y one-time idempotency completion.
- AppModule registra el módulo interno y PermissionCatalog declara cuatro permission keys; no crea role grants automáticos ni controllers WAM.
- Tests de dominio y servicio; integración PostgreSQL para tenant A/B, stale version, idempotency, revision immutability, archive y audit.
- api:test y Source CI incluyen el integration spec, activado con RUN_WHATSAPP_TEMPLATE_INTEGRATION_TESTS=true.
- Estado: implemented slice / verification pending; TASK-014/015 in_progress. WAM-001..007 requieren contract freeze; no hay Meta reads/writes ni status sync sin TASK-008/010 runtime evidence.



### Handoff adicional TASK-004 / TASK-005 — feedback de la primera suite PostgreSQL (2026-11-08)

- Source CI 42513396813 pasó instalación frozen, migraciones 0001–0007 e idempotencia, build y typecheck; API suite 181 PASS/5 FAIL.
- La integración nueva tenant-role-assignment.integration.spec.ts pasó: requester owner, aprobador distinto, step-up sintético, asignación de plantilla con permisos exactos, retry idempotente, revocación, protección de último owner y auditoría stale-denial/hash chain.
- La restricción de description de 0007 mostró que tres suites existentes insertan roles con solo display_name. Se preservó la integridad con migration 0008-role-description-defaults.sql: trigger BEFORE INSERT/UPDATE completa description con display_name o role_key. La integración añade assertion de compatibilidad.
- Se reparó un doble cierre de pool en tenant-job-record.integration.spec.ts (DatabaseService ya libera workerPool) y un import ESM relativo incorrecto en postgres-message-template.integration.spec.ts.
- Nuevo Source CI pendiente: no elevar status a verified hasta SUCCESS. Bootstrap seguro del primer tenant_owner, ACR/AMR del IdP real, contract freeze, revisión independiente y aceptación PO continúan pendientes.
