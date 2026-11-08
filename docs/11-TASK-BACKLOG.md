# 11 — Backlog técnico trazable

## Propósito y autoridad
Este backlog representa el plan inicial de trabajo, no el estado comprobado del código. Todo agente debe inspeccionar el repositorio y reconciliar cada tarea con código, tests y evidencia antes de cambiar su estado. Las tareas son unidades ejecutables; los criterios de aceptación de las historias son el resultado de negocio.

## Convenciones
Estados canónicos: `proposed`, `ready`, `in_progress`, `blocked`, `implemented`, `verified`, `accepted`, `deferred`, `cancelled`.
- `implemented`: existe implementación.
- `verified`: criterios y pruebas requeridas pasan con evidencia.
- `accepted`: aceptación explícita del propietario/producto.
- `blocked`: existe impedimento concreto registrado.
- No usar `done` como sinónimo ambiguo.
Cada tarea requiere owner, prioridad, dependencias, DoR, entregables, criterios, pruebas, DoD y enlaces a controles. Si faltan campos, completar al activar la tarea.

## EP-01 — Tenant/Identity
| Tarea | Historia | Entregable / alcance | Dependencias | QA y DoD | Control |
|---|---|---|---|---|---|
| TASK-001 | US-001 | Modelo tenant, ownership y lifecycle | ADR-002 | invariantes + migración testeada | CR-0001: definir estrategia DB/RLS |
| TASK-002 | US-001 | Tenant context middleware y autorización | TASK-001 | tests negativos cross-tenant | BUG-0001: prevenir tenant context ausente |
| TASK-003 | US-001 | Aislamiento jobs/cache/files/telemetry | TASK-001 | tests de namespace/partition | CR-0002: política de aislamiento operacional |
| TASK-004 | US-002 | RBAC/ABAC y matriz de permisos | TASK-001 | matriz allow/deny automatizada | CR-0003: aprobar catálogo de roles |
| TASK-005 | US-002 | Step-up, approvals y audit de acciones | TASK-004 | pruebas de escalamiento y doble aprobación | BUG-0002: evitar bypass de aprobación |

**Handoff de ejecución (2026-11-07):** TASK-001 tiene estado `implemented` con validación automática CI PASS; permanece `in_progress` en el backlog global hasta revisión independiente de arquitectura/seguridad y aceptación del propietario. Migración `0002-tenant-lifecycle-invariants.sql`, runner de migraciones versionadas y pruebas PostgreSQL de ownership, transiciones, tombstone y RLS. Evidencia: commit `479a8234d2f6b78b0bb8e6474c39e4a388034c3a`, Source CI run [#15](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42379841071); idempotencia de migraciones confirmada en run [#16](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42380055974), commit `84bab54d78b5246174dab6a6a9eb9173d0149476`. TASK-002/004 siguen in_progress; TASK-005 sigue proposed. No se habilitaron operaciones de mutación HTTP ni se alteró el gate de producción.

**Handoff TASK-002 (2026-11-07):** implementado y CI-verified en Source CI [#47](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42383524043), commit `74febd28056043cda15221f29c8c5b71290ca06c`. Incluye migración `0003-tenant-context-authorization.sql`, predicado DB de acceso tenant, guard por propósito, contexto inmutable por request, versionado y serialización de autorización, tests unit/integration y protección contra stale membership/grants. TASK-002 permanece `in_progress` globalmente hasta revisión independiente y aceptación del propietario. TASK-004 (RBAC/ABAC) y TASK-003 (jobs/cache/files/telemetry) continúan pendientes; no se habilitan mutaciones ni producción.

## EP-02 — Control Plane
| Tarea | Historia | Entregable / alcance | Dependencias | QA y DoD | Control |
|---|---|---|---|---|---|
| TASK-006 | US-003 | OAuth state/PKCE/callback y threat model | TASK-001,004 | CSRF, replay, redirect tests | BUG-0003: callback replay |
| TASK-007 | US-003 | Token vault, KMS, rotación y revocación | TASK-006 | secret scanning + rotation drill | CR-0004: elegir KMS/secret manager |
| TASK-008 | US-003 | Embedded Signup y onboarding saga | TASK-006,007 | sandbox/real business flow | CR-0005: validar elegibilidad Tech Provider |
| TASK-009 | US-004 | Asset registry y sincronización | TASK-008 | ownership/grant drift tests | BUG-0004: asset sin grant vigente |
| TASK-010 | US-004 | Capability registry y explainability | TASK-009 | matrices scopes/tasks/version | CR-0006: esquema capability descriptor |

## EP-03 — WhatsApp
| Tarea | Historia | Entregable / alcance | Dependencias | QA y DoD | Control |
|---|---|---|---|---|---|
| TASK-011 | US-005 | WhatsApp Cloud adapter y tipos de mensaje | TASK-010 | contract tests por tipo | BUG-0005: no asumir universal payload |
| TASK-012 | US-005 | media lifecycle y almacenamiento seguro | TASK-011 | MIME, size, malware, expiry tests | CR-0007: política de media retention |
| TASK-013 | US-005 | delivery state machine y policy engine | TASK-011,027 | eventos duplicados/out-of-order | BUG-0006: HTTP accepted != delivered |
| TASK-014 | US-006 | Template management API y schema | TASK-010 | estados/categorías/idiomas | BUG-0007: plantilla no aprobada |
| TASK-015 | US-006 | revision, quality, variables y preview | TASK-014 | placeholders/header/buttons tests | CR-0008: versionado de plantillas |
| TASK-016 | US-007 | Flows + Data Exchange endpoint | TASK-010,027 | cifrado, replay, versioning | CR-0009: gestión de claves Flow |
| TASK-017 | US-008 | Marketing Messages adapter | TASK-010 | eligibility/policy/contract tests | CR-0010: migración endpoint marketing |
| TASK-018 | US-008 | Rate card y cost ledger WhatsApp | TASK-017 | vigencias, moneda, reconciliation | BUG-0008: no hardcode pricing |

## EP-04 — Social
| Tarea | Historia | Entregable / alcance | Dependencias | QA y DoD | Control |
|---|---|---|---|---|---|
| TASK-019 | US-009 | Pages + Messenger adapter/policy | TASK-010,027 | scopes, Page tasks, windows | CR-0011: policy matrix Messenger |
| TASK-020 | US-010 | Instagram auth modes + capabilities | TASK-010 | matrix account/login/scopes | CR-0012: seleccionar login por feature |
| TASK-021 | US-010 | Instagram publish/comments/DM/insights | TASK-020,027 | media types, webhooks, limits | BUG-0009: no asumir feature parity |

## EP-05 — Acquisition/Ads
| Tarea | Historia | Entregable / alcance | Dependencias | QA y DoD | Control |
|---|---|---|---|---|---|
| TASK-022 | US-011 | Lead Ads webhooks y lead retrieval | TASK-009,027 | duplicates, custom fields, access | BUG-0010: webhook perdido/duplicado |
| TASK-023 | US-011 | Lead lifecycle, provenance y routing | TASK-022,004 | lineage y consent tests | CR-0013: definir lead retention |
| TASK-024 | US-012 | Marketing API draft/validation/approval | TASK-010,004 | invalid objective/targeting/budget | CR-0014: catálogo de objetivos |
| TASK-025 | US-012 | Ad activation, spend guardrails, insights | TASK-024,029 | kill switch, cap, reconciliation | BUG-0011: gasto no autorizado |
| TASK-026 | US-013 | CAPI event gateway/dedupe/attribution | TASK-023,031 | event_id, consent, dedupe | CR-0015: política de attribution window |

## EP-06 — Reliability/Security
| Tarea | Historia | Entregable / alcance | Dependencias | QA y DoD | Control |
|---|---|---|---|---|---|
| TASK-027 | US-014 | Webhook gateway, verify, inbox | TASK-001,007 | signature, size, durable ack | BUG-0012: spoof/replay |
| TASK-028 | US-014 | event bus, consumers, DLQ, replay | TASK-027 | at-least-once, idempotency | CR-0016: retención/replay policy |
| TASK-029 | US-015 | tracing, metrics, logs y SLO | TASK-001 | redaction, cardinality, alerts | CR-0017: SLO/RPO/RTO |
| TASK-030 | US-015 | audit append-only y reportes | TASK-004,029 | tamper evidence/access review | BUG-0013: audit gap |
| TASK-031 | US-016 | threat model, secure SDLC, scans | TASK-001 | SAST/SCA/DAST/pentest plan | CR-0018: risk acceptance workflow |
| TASK-032 | US-016 | privacy, export, deletion, revocation | TASK-007,030 | deletion verification | CR-0019: legal retention schedule |

## EP-07 — Extensión
| Tarea | Historia | Entregable / alcance | Dependencias | QA y DoD | Control |
|---|---|---|---|---|---|
| TASK-033 | US-017 | Threads adapter y adapter conformance suite | TASK-010,027,029 | backward compatibility | CR-0020: nueva API version policy |

## Work packet obligatorio
Antes de ejecutar una tarea, el agente debe completar en el registro de la tarea:
- Estado, prioridad, owner y story padre.
- Objetivo de usuario, alcance incluido/excluido.
- Dependencias upstream y nodos downstream.
- DoR, criterios de aceptación Given/When/Then y límites.
- Contextos/módulos/contratos afectados (confirmados tras inspección).
- Clasificación de datos, controles de seguridad y permisos.
- Pruebas exactas y evidencia esperada.
- Migración, compatibilidad y rollback si aplica.
- BUG/CR/ADR/API vinculados.

## Requisitos comunes
**DoR:** resultado solicitado claro; criterios testeables; dependencias entendidas; stack/código inspeccionado; fuente Meta vigente si aplica; clasificación de datos y amenazas; decisiones bloqueantes resueltas.

**DoD:** implementación real; tests unit/component/contract/integration/E2E pertinentes; análisis estático y build; seguridad; observabilidad/auditoría; compatibilidad/migración/rollback; documentación y runbook; diff revisado; evidencia enlazada.

## Registro de riesgos preventivos
Los BUG-0001..BUG-0013 son escenarios de riesgo que deben probarse, no defectos confirmados. Solo crear/actualizar un BUG real si hay reproducción o evidencia concreta. Mantener severidad, impacto, causa raíz, corrección y test de regresión.

## Controles de cambio
CR-0001..CR-0020 son decisiones/validaciones pendientes enumeradas en el backlog inicial. No marcarlas cerradas sin decisión, responsable, impacto, evidencia y aprobación correspondiente.


## EP-08 — Descubrimiento, especificación y arquitectura greenfield

Estas tareas se añaden a la línea base porque el propietario confirmó greenfield, CRM, inbox y automatización IA. Son trabajo documental/arquitectónico, no implementación de producto.

| Tarea | Entregable | Dependencias | DoD |
|---|---|---|---|
| TASK-034 | Especificación funcional de Platform Identity, tenants, planes y roles | PD-001, PD-010 | Flujos, permisos, estados y criterios de aceptación completos |
| TASK-035 | Especificación funcional de CRM, contactos, leads, pipeline y actividades | PD-004 | Modelo, reglas, journeys, dedupe y criterios testeables |
| TASK-036 | Especificación funcional de Inbox omnicanal y handoff humano | PD-004, PD-003 | Contratos canónicos, diferencias por canal, estados y UX documentados |
| TASK-037 | Especificación de Automation Engine y chatbots basados en reglas | PD-005 | Triggers, condiciones, acciones, retries, versiones, pausa y audit definidos |
| TASK-038 | Especificación de AI Assistance / AI Gateway | PD-005 | Proveedor desacoplado, seguridad, coste, evaluación y human approval definidos |
| TASK-039 | Architecture spike y validación transversal ADR-011..025 | PD-007, PD-008, PD-021, PD-023 | SP-01..10: compatibilidad exacta Node/TS/Nest/Angular/Nx, comparación backend/frontend/protocolos, RLS/pooling, outbox/broker, webhook durable, Valkey, restore y footprint |
| TASK-040 | Reconciliación completa de historias, requisitos y trazabilidad | TASK-034..039 | Cada requisito tiene ID, prioridad, owner, AC, tareas, módulos previstos y evidencia esperada |
| TASK-041 | Definición operativa: SLO/RPO/RTO, capacidad, backups y presupuesto VPS | Q-013 | Objetivos cuantificados y validados por propietario |

Estado inicial de TASK-034..041: proposed. TASK-039 no autoriza compra de servicios ni contratación de proveedores; cualquier coste recurrente requiere aprobación.


## EP-09 — CRM, Inbox, automatización e IA (nuevo alcance confirmado)
| Tarea | Historia | Entregable / alcance | Dependencias | QA y DoD | Control |
|---|---|---|---|---|---|
| TASK-042 | US-018 | Contactos, perfiles y custom fields | TASK-001,034 | tenant isolation, validation, audit | PD-004 |
| TASK-043 | US-018 | Identidades multicanal, dedupe y merge reversible | TASK-042,022 | collision, provenance, undo tests | CR: identity resolution |
| TASK-044 | US-019 | Pipelines, oportunidades, tareas y timeline | TASK-042,004 | transition, assignment, permission tests | PD-004 |
| TASK-045 | US-020 | Conversation/message canonical model + channel extensions | TASK-010,027,036 | adapter contract, native payload, capability tests | PD-003/004 |
| TASK-046 | US-020 | Inbox UI, search, filters, message composer | TASK-045, frontend foundation | E2E per channel, responsive, a11y | PD-006 |
| TASK-047 | US-021 | Teams, assignment, internal notes and handoff | TASK-004,045 | race, duplicate send, privacy tests | PD-004 |
| TASK-048 | US-022 | Workflow definition, versioning and builder | TASK-028,034,037 | schema, simulation, permission tests | PD-005 |
| TASK-049 | US-022 | Workflow runtime, scheduler, retries and kill switch | TASK-048,027,028 | idempotency, DLQ, timeout, replay tests | PD-005 |
| TASK-050 | US-023 | AI Gateway/provider adapters and budget ledger | TASK-029,038 | timeout, cost cap, redaction, fallback tests | PD-005 |
| TASK-051 | US-023 | Reply suggestions, rule chatbot and human handoff | TASK-045,047,050 | no-auto-send, prompt injection, eval tests | PD-005 |
| TASK-052 | US-024 | Tenant lifecycle, plans, entitlements and support access | TASK-001,004,041 | privilege, audit, entitlement tests | PD-001 |

All tasks proposed; module paths and service ownership are finalized only after repository bootstrap and architecture spike. TASK-034..041 cover discovery/architecture; TASK-042..052 cover product capabilities.


## EP-10 — Meta changes, partner access, compliance, performance and SaaS growth

All tasks below are proposed until an implementation exists and evidence is attached. They do not mark code as implemented. Priority P0 means foundational/security or a time-bound external dependency; P1 means required product capability after its prerequisites.

| Tarea | Prioridad | Historia / dominio | Alcance y entregable | Dependencias | DoD / evidencia |
|---|---|---|---|---|---|
| TASK-053 | P0 | US-018, US-020 / CRM + Asset Registry | Identity graph provider-scoped; BSUID and legacy phone identifiers; WAAC/PMA plus legacy WABA resource associations | TASK-034,042,045 | Contract fixtures; no phone-as-primary-key; no automatic merge across identifier namespaces; reversible identity merge; migration tests |
| TASK-054 | P0 | US-003 / Meta Control Plane | Embedded Signup v4 adapter/evaluation; unified onboarding for eligible WhatsApp, Messenger and Instagram Direct paths | TASK-006..010,039 | Official docs/version review; eligibility matrix; sandbox and real authorized account evidence; rollback/legacy compatibility |
| TASK-055 | P0 | US-008 / WhatsApp Marketing | Marketing Messages API adapter, pricing/eligibility and campaign routing; no new dependency on Cloud API marketing legacy; migration readiness before 2027-10-13 | TASK-010,017,018,039,056 | Contract tests, category/policy checks, rate card source/version, migration plan, deadline alerts, authorized test-account evidence |
| TASK-056 | P0 | Cross-Meta / Capability Registry | Meta product API version, changelog, sunset and access-tier registry. Distinguish OAuth scopes, asset tasks/grants, app mode/review and Marketing API Access Tier | TASK-010,039 | Per-operation capability matrix, version compatibility fixtures, deprecation alert, source/date and tier evidence; never hardcode one global Graph version |
| TASK-057 | P1 | US-008 / Cost Ledger | WhatsApp Max Pricing and external cost lifecycle: estimate, maximum/upper bound, actual provider-reported and reconciled invoice | TASK-017,018,055 | Currency, market, category, versioned rate card, precision tests, reconciliation report; no treating max price as actual charge |
| TASK-058 | P1 | US-025 / Platform + Partner Access | Agency/partner organizations, delegated grants to customer tenants, scoped roles/actions/assets, expiry/revocation and audit | TASK-001,004,034,052 | Cross-tenant deny tests; client revocation; no inherited data; JIT support separation; audit and expiry tests |
| TASK-059 | P0 | US-016 / Privacy & Compliance | Data inventory, retention policy engine, rights workflow, export/rectification/deletion and subprocessors/transfers inventory | TASK-031,032,030 | Data-flow map; retention configurable; deletion covers DB/object/cache/search/queue/derived artifacts; legal sign-off for actual retention, LOPDP roles and transfers before live data |
| TASK-060 | P0 | TASK-039,041 / Performance Engineering | Workload model and benchmark suite for API, webhook ingress, DB, queue and workers; VPS capacity sizing and scaling thresholds | TASK-039,041,001,027,028 | Reproducible test scripts; hardware/version/config; baseline p50/p95/p99, RPS, concurrency, queue age, saturation, error rate and recovery; report limits and cost; no capacity claim without evidence |
| TASK-061 | P0 | US-015/016 / SRE + Security | Backup/restore, DR, key recovery, failover and RPO/RTO drills for database, object storage, broker and configuration | TASK-029,030,031,039,060 | Restore from encrypted backup on clean host; consistency checks; measured RPO/RTO; runbook, owner and evidence; production gate |
| TASK-062 | P1 | US-027 / Developer Platform | Public versioned API, tenant-scoped API credentials/OAuth clients where appropriate, signed outbound webhooks, retries and customer event subscriptions | TASK-001,004,027,028,029 | OpenAPI docs, scopes, key rotation/revocation, HMAC signature/replay tests, delivery attempts, idempotency, rate limit, portal docs |
| TASK-063 | P1 | US-026 / Billing & Usage | Plans and entitlements engine, subscription/seat/usage ledgers, quotas, trial/suspension states and invoice integration port | TASK-034,041,052 | Entitlements not scattered in code; immutable usage ledger; plan change proration requirements; no pricing/tax implementation before unit economics/legal review |
| TASK-064 | P1 | PD-006 / Web UX | WCAG 2.2 AA coverage for primary journeys: connect account, inbox handling, CRM, automation and admin | Frontend foundation, TASK-034,036,046 | Keyboard-only journeys, screen-reader semantics, contrast, focus, error messaging, automated checks plus manual audit; defects triaged |
| TASK-065 | P1 | US-014 / Meta Platform Operations | Current Meta API changelog and policy review process with version sunset calendar, alert ownership and tenant capability impact assessment | TASK-027,029,056 | Dated evidence for each product; change impact mapped to adapters/tests/tenants; deprecation action owner and migration status |

### Prioritization and deadline control
- TASK-053..056 are P0 because identity/model drift, onboarding and API version/sunset decisions affect the shape of foundational contracts.
- TASK-059 and TASK-061 are P0 release blockers for real customer data and production, respectively; configurable scaffolding can proceed before final legal advice.
- TASK-060 is mandatory before capacity sizing or any scalability claim.
- TASK-055 has an external date 2027-10-13 announced by Meta for sunset of marketing traffic on the legacy Cloud API route. Revalidate the official date and migration requirements at implementation and release.
- TASK-062/063/064/065 are P1; sequence by dependency and observed customer value.
- The task list is not a calendar commitment and does not imply the product is implemented.


## TASK-066 — Validación de ICP y product-market evidence (P0 discovery)
- **Historia:** US-028.
- **Objetivo:** validar el foco sectorial en servicios/comercio y canal agencias antes de fijar precios, packaging o inversión comercial.
- **Incluye:** desk research oficial INEC; entrevistas cualitativas; mapeo de workflows y alternativas; willingness-to-pay exploratoria; pilotos con métricas instrumentadas de activación, time-to-value, seats, uso por canal, retención y outcome.
- **No incluye:** extrapolar entrevistas cualitativas como muestra estadística, declarar TAM/SAM/SOM sin criterio de elegibilidad, ni fijar tarifas/forecast solo con estadísticas macro.
- **Dependencias:** PD-012, docs/32 MKT-OBS-001/002.
- **Estado:** proposed.
- **DoD:** investigación documentada, participantes segmentados y anonimizados, síntesis de patrones/contradicciones, falsación explícita de hipótesis, propuesta de ICP revisada y criterios de pricing basados en unit economics reales.
- **Evidencia base:** INEC REEM 2025 provisional: 1.204.276 empresas totales; servicios 645,8k y comercio 388,9k; advertencias metodológicas en docs/32.


## EP-11 — Campaign Intelligence, Creative Lab y Meta agent interoperability

Todas las tareas nuevas permanecen proposed; no implican implementación ni permiso para operar campañas reales.

| Tarea | Prioridad | Historia | Entregable | Dependencias | DoD / evidencia |
|---|---|---|---|---|---|
| TASK-067 | P0 | US-029 | Campaign Intelligence domain, metric taxonomy, campaign snapshots, recommendation lifecycle y policy boundaries | TASK-024,025,026,039 | domain model, ACs, event contracts, provenance, simulations; ningún Andromeda score inventado |
| TASK-068 | P0 | US-029 | CRM closed-loop conversions → CAPI event pipeline | TASK-023,026,042,044,059 | stable event_id/name/time, consent, dedupe, event source, diagnostics, data minimization and replay tests |
| TASK-069 | P1 | US-030 | Creative Lab asset catalog, variant metadata, AI provenance, rights/brand/policy review | TASK-024,038,050,060 | creative schema, near-duplicate detection, prompt provenance, brand/claim gates and approval evidence |
| TASK-070 | P1 | US-030 | Controlled experiment/test-cell service for creative and campaign variables | TASK-024,025,067,069 | hypothesis, control/variant, randomization/Meta experiment ref, budget allocation, sample/stop rules and overlap checks |
| TASK-071 | P0 | US-029 | Guarded budget optimizer with owner-defined +20% cap per operation and cumulative rolling-24h cap | TASK-025,067,060 | Decimal arithmetic, concurrency/idempotency, multi-agent race tests, account/campaign/adset caps, fail-closed and approval audit |
| TASK-072 | P0 | US-029 | Meta Ads Insights ingestion, snapshots, checkpointing, async report jobs and metric freshness | TASK-024,025,029,056,060 | API version per request, pagination/checkpoints, rate limits, currency/timezone, attribution and provider provenance |
| TASK-073 | P1 | US-030 | Advantage+ Creative features, Ads Previews and Performance Recommendations adapter | TASK-056,069 | capability/access matrix, preview tests by placement/feature, paused-first AI creative flow where required, rollback/undo |
| TASK-074 | P1 | US-031 | Meta Ads MCP/tool interoperability with internal approval gateway | TASK-004,024,025,067 | allowlisted tools, draft staging, explicit approval, scoped tokens, action audit, deny unsafe/direct writes |
| TASK-075 | P1 | US-031 | Meta Business Agent interoperability and conversation ownership/handoff | TASK-036,045,047,050,051,058 | ownership lease, echo/dedupe, bot suppression, human handoff, provider identity and audit; per-country/channel eligibility |
| TASK-076 | P0 | US-032 | Meta API/Policy/Feature change intelligence and impact registry | TASK-010,029,056,065 | official source and date, version/feature/effective date, impacted adapters/tenants/tests, alert + migration draft; no auto-approval |
| TASK-077 | P1 | US-029 | Incrementality and attribution evaluation framework | TASK-026,067,068,070 | reported-attribution vs causal lift distinction, holdout/split-test docs, confidence/denominator/measurement caveats |
| TASK-078 | P1 | US-029 | Campaign health and business outcomes dashboard | TASK-067,068,072 | separate provider metrics from CRM outcomes, cohorts/windows, revenue/margin, data freshness and anomaly alerts |
| TASK-079 | P1 | US-030 | Creative fatigue detection and new-variant pipeline | TASK-069,070,072,073 | recommendation evidence, fatigue thresholds by tenant/objective, variant draft, no production activation before approval |
| TASK-080 | P1 | US-031 | Secure agent/tool execution gateway and MCP server for WhatsBusiness | TASK-004,047,067,074,075 | tool schemas, purpose/scope/tenant checks, approvals, budgets, idempotency, redaction, audit and kill switch |

### Campaign optimizer non-negotiables
- +20% is the owner's platform guardrail, not an official universal Meta threshold. Enforce both per-operation cap and rolling-24h cumulative cap.
- No direct API calls from an LLM, no access token in prompts, no autonomous campaign publication or spend outside approval.
- Do not modify winning/learning ad sets by default; isolate new creative tests.
- Meta learning guidance and 50 events/7 days are evidence/context, not an unconditional target for every objective/account.
- Do not claim control over Andromeda/GEM internals or guarantee CPA/ROAS uplift.
- Optimize to qualified lead/revenue/margin where lawful, not vanity clicks alone.


## Readiness y estado documental (kickoff 2026-11-06)

La tabla separa artefactos de especificación de ejecución/verificación. La creación de un documento no acredita código ni prueba independiente.

| TASK / paquete | Artefacto de diseño disponible | Estado documental | Estado de ejecución/verificación |
|---|---|---|---|
| TASK-034 | docs/37 | implementado (documentación) | review pendiente; código no iniciado |
| TASK-035 | docs/38 | implementado (documentación) | review pendiente; código no iniciado |
| TASK-036 | docs/39 | implementado (documentación) | review pendiente; código no iniciado |
| TASK-037 | docs/40 | implementado (documentación) | review pendiente; código no iniciado |
| TASK-038 | docs/41 | implementado (documentación) | review security/privacy pendiente; proveedor no seleccionado |
| TASK-039 | docs/45 | runbook preparado | spike no ejecutado; G0 no verificado |
| TASK-040 | docs/19, docs/42, docs/43, docs/46 | base de trazabilidad creada | revisión de cobertura y huérfanos pendiente |
| TASK-041 | docs/13, docs/30, docs/31, docs/45 | objetivos candidatos documentados | especificación VPS/budget y validación de owner pendientes |
| TASK-060 | docs/45 | plan de benchmark | carga/capacidad no medidas |
| TASK-061 | docs/45 | plan de restore/DR | restore drill no ejecutado |

La tabla usa "implementado (documentación)" solo para indicar que el entregable documental existe; no cambia el estado de implementación de producto. Ninguna tarea se marca verified o accepted por la creación de especificaciones.


## API inventory mapping (2026-11-06)

La referencia maestra de rutas y operaciones es [docs/47-API-INVENTORY-AND-TASK-MAP.md](47-API-INVENTORY-AND-TASK-MAP.md). Para cerrar cada tarea, el agente debe enlazar en su work packet el/los API IDs correspondientes, OpenAPI operationIds, event schema IDs, permisos, audit, idempotency y tests.

| Grupo de TASK | API IDs de docs/47 | Notas |
|---|---|---|
| TASK-001..005 | PLT, IAM | Tenancy, membership, RBAC/ABAC, approvals, audit |
| TASK-006..010,054,056 | META | OAuth/ESU, credentials, assets, capability/version registry |
| TASK-011..013 | WA | WhatsApp messaging/media/delivery |
| TASK-014..015 | WAM | Templates, revisions, preview |
| TASK-016 | WAF | WhatsApp Flows/Data Exchange |
| TASK-017..018,055,057 | WAMK | Marketing Messages, eligibility, cost/rate cards |
| TASK-019 | FB | Pages and Messenger |
| TASK-020..021 | IG | Instagram login modes and product surfaces |
| TASK-022..023 | LEAD | Lead Ads retrieval, lifecycle, routing |
| TASK-024..025,071..073 | ADS | Campaigns, creatives, spend guardrails, Insights |
| TASK-026,068 | CAPI | Conversion events and dedupe |
| TASK-027..028 | WH + OPS | Inbound webhook, durable inbox, event processing, DLQ |
| TASK-029..030 | OPS | Observability and audit |
| TASK-031..032,059 | PRIV + OPS | Security, privacy requests, retention and deletion |
| TASK-033 | TH | Threads adapter |
| TASK-034 | PLT, IAM | Platform identity and tenancy specification |
| TASK-035,042..043,053 | CRM, LEAD | Contacts, identity graph, merge/dedupe |
| TASK-036,045..047 | INB + WA/FB/IG | Omnichannel conversations, assignment, handoff |
| TASK-037,048..049 | AUTO | Workflow builder/runtime |
| TASK-038,050..051 | AI | AI Assistance separado; no es la estrategia de CRM Intelligence ni una dependencia de CRM |
| TASK-039 | No product endpoint | Architecture spike evidence; see docs/45 |
| TASK-040 | No product endpoint | Traceability reconciliation; see docs/19 and docs/47 |
| TASK-041,060..061 | No product endpoint | SRE/FinOps, benchmark, restore/DR evidence |
| TASK-052,058 | IAM, PAR, BILL | Tenant lifecycle, partner grants, support JIT |
| TASK-057,063 | WAMK, BILL, AI | Usage/cost ledgers and entitlement/billing |
| TASK-062 | DEV | Public API credentials, signed outbound webhooks |
| TASK-064 | No backend endpoint | WCAG/UI accessibility tests |
| TASK-065,076 | OPS, META | Meta change intelligence and impact registry |
| TASK-066 | No product endpoint | Product/market discovery |
| TASK-067..070,077..079 | CI, ADS, CAPI | Campaign intelligence, experiments, creative lab |
| TASK-074..075,080 | AGT, INB, CI | Meta agent interoperability, handoff and tool gateway |

La matriz de docs/47 define la relación por US y por API ID. Esta tabla es un índice rápido, no sustituye las dependencias, acceptance criteria y evidence requeridas por la fila original de TASK.

## Anexo — contratos, arquitectura y reutilización obligatoria

- TASK-039, TASK-040 y TASK-043 conservan su estado real; crear documentos no implica ejecutar el spike, pasar G0 ni validar independientemente los contratos.
- Para toda tarea de código aplica [docs/48](48-CODING-ARCHITECTURE-AND-REUSE-STANDARD.md): inspección previa de reutilización, un solo dueño de regla/dato, boundaries acíclicos y revisión anti-spaghetti.
- API readiness se gobierna por [docs/49](49-API-CONTRACT-READINESS-AND-META-ADAPTER-GATES.md): los endpoints catalog-only no son implementables hasta completar schemas.
- Eventos v1.0.0 están en [docs/50](50-EVENT-CATALOG-AND-VERSIONED-SCHEMAS.md) y contracts/asyncapi; sus producers/consumers y evidencia de ejecución siguen pendientes.

## Anexo — revisión tecnológica y protocolo API

- docs/51 compara TypeScript/Node, NestJS, Angular, Nx/pnpm, PostgreSQL, Valkey, RabbitMQ, Keycloak, Traefik, Docker/Compose y observabilidad; define versiones candidatas y fuentes oficiales.
- docs/52 documenta decisión REST/JSON + OpenAPI como API síncrona, llamadas directas a use cases/ports entre módulos y RabbitMQ/AsyncAPI para async. GraphQL y gRPC quedan como opciones futuras con triggers explícitos.
- ADR-023..025 fijan protocolo, baseline de versiones y Valkey. Son baseline recomendada, no evidencia de benchmark.
- TASK-039 se amplía con SP-08..10 para comparar backend/frontend/protocolos, revisar licencia/compatibilidad Valkey y validar la matriz de versiones en checkout limpio.
- No existe todavía scaffold ni proyecto ejecutable en environment/local; no marcar TASK-039/G0 como verificados hasta que haya build, RLS/pooling, broker, restore, footprint y review independiente con resultados reproducibles.


## Handoff — Platform Identity (2026-11-07)

| TASK | Estado | Evidencia / alcance |
|---|---|---|
| TASK-001 | in_progress | Primera migración de Organization/Tenant y policies RLS; lifecycle, provisioning y mutaciones pendientes. |
| TASK-002 | in_progress | Guard OIDC, principal issuer+subject, contexto transaction-local y APIs PLT-003..005 read-only; worker context, revocación y grants pendientes. |
| TASK-004 | in_progress | Esquema roles/permissions y lectura de role/permission keys; RBAC/ABAC final, mutations, approvals y pruebas de escalamiento pendientes. |
| TASK-005 | proposed | Step-up, doble control y auditoría de acciones privilegiadas no implementados. |

Source CI #42376234089 y Contract CI #42376234088 pasaron en el commit 0e0927bdcae658d4e4b1ccae28a5c5f89cf4b183; PostgreSQL migration/RLS, build, typecheck, OIDC tests y contract validation quedaron verdes. El lockfile se confirmó en d81593601101d97623684ea02f04539fd29f3e2f. TASK-001/002/004 continúan in_progress hasta revisión independiente; no hay acceptance de producto.

**Handoff TASK-004 — núcleo RBAC/ABAC (2026-11-07):** implementado y CI-verified en Source CI [#67](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42385036275), commit `53e50dc00daccc7c64c7931e468e6ef0af132940`. Incluye migración `0004-authorization-permission-catalog.sql`, catálogo tipado de permisos/riesgo, templates least-privilege de roles tenant, `TenantAuthorizationPolicyEvaluator`, `AuthorizationService`, `AuthorizationGuard`/`@RequireTenantPermission` y `TenantRoleAssignmentPolicy` contra autoasignación/escalamiento. Estado global permanece `in_progress`: revisión independiente y aceptación pendientes; IAM-007..020 catalog-only no implementadas; no hay mutaciones de roles/memberships, audit durable ni workflow approvals (TASK-005).
**Handoff TASK-005 (2026-11-07):** núcleo implementado y CI-verified en Source CI [#112](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42387272987), commit `b38b78ab52dbb96262dc8078518fdf4f55fc5a2c`. Incluye migration `0005-approval-audit-foundation.sql`, step-up fail-closed con claims OIDC firmados (`auth_time`/`acr`/`amr` + allowlists), approval workflow con request hash/idempotencia/quorum/decisiones inmutables, consumo transaccional del hash exacto y audit stream SHA-256 append-only. Source CI activó `RUN_APPROVAL_INTEGRATION_TESTS=true` en PostgreSQL efímero y pasó migraciones/idempotencia/build/typecheck/unit/integration. TASK-005 permanece `in_progress`: faltan IdP real y allowlists verificadas, outbox/consumer de negocio, freeze de IAM-018..020, revisión independiente y aceptación del propietario. No se ejecutan mensajes, campañas, gasto, exports ni borrado productivo.


**Handoff TASK-003 — aislamiento operativo multi-tenant (2026-11-07):** añadidos TenantResourceNamespace, TenantScopedCache, TenantScopedObjectStorage, TenantJobContextResolver, TenantJobExecutor y TenantTelemetryContext. Esta iteración agrega `0006-tenant-job-outbox.sql`, `platform.tenant_job_records`, guard SQL de transiciones, función SQL de resolución de metadata mínima, `PostgresTenantJobRecordReader`, `PostgresTenantJobRecordWriter.stage(client, input)` con idempotencia por tenant/actor/job type/key y SHA-256 de request canónico, e `IsolationModule`; ocho suites unitarias de aislamiento y una suite PostgreSQL gated (`RUN_TENANT_JOB_INTEGRATION_TESTS=true`) están registradas en `api:test`; la integración cubre cross-tenant RLS y revocación de membership. El broker continúa siendo solo un locator `jobId`; la función SQL nunca expone el payload y el executor revalida actor/membership/tenant mediante `DatabaseService.withTenantContext`. **Estado: implemented; CI de esta iteración pendiente; publisher/outbox dispatcher, inbox/consumer, schema validation versionada, dedupe/retry/backoff/DLQ/replay, adapters Valkey/object storage/broker, pool reuse PostgreSQL A→B, secret manager y revisión independiente siguen pendientes.** No elevar a verified ni accepted antes de evidencias. Ver docs/58 sección 11.

### Handoff incremental TASK-003 — retry policy (2026-11-07)

Se implementó `TenantJobRetryPolicy` en `apps/api/src/platform/isolation/tenant-job-retry-policy.ts` y se registró `tenant-job-retry-policy.spec.ts` en `api:test`. La política aplica backoff exponencial acotado con equal jitter, dead-letter inmediato para fallos permanentes y dead-letter al agotar intentos; valida attempt/maxAttempts, código de error sanitizado, reloj y random sample. Diseño y límites: `docs/59-TENANT-JOB-RETRY-POLICY.md`.

**Estado:** slice implementado; build/typecheck/tests de este cambio no ejecutados por esta sesión y CI no reporta runs para el commit consultado. TASK-003 sigue `in_progress`, no `verified` ni `accepted`. No hay dispatcher, broker, consumer, lease/fencing, inbox/dedupe, ACK, DLQ operativa ni replay. Próximo trabajo: lease recuperable y fencing en PostgreSQL; dispatcher con publisher confirms; consumer idempotente que ACK después del commit; backoff persistido y DLQ/replay auditado.
### Handoff TASK-003 — runtime durable y backend microservices-meta-ecuapp (2026-11-07)

Se estableció `microservices-meta-ecuapp` como proyecto Nx/workspace y paquete `@whatsbusiness/microservices-meta-ecuapp`; el backend HTTP foundation permanece en `apps/api` durante una migración gradual, sin duplicar DatabaseService ni guards. Se incorporaron dispatcher y worker pools separados, roles de DB least-privilege, adapters PostgreSQL/RabbitMQ, publisher confirms/mandatory routing, consumer manual ACK, inbox transaccional, leases/fencing, recuperación por expiración, backoff/reconnect, bootstrap con handlers obligatorios, topology quorum y suites unitarias/integration registradas.

**Estado:** implementación de runtime avanzada pero no completada. La migración 0007 ha requerido una sustitución completa para consolidar fragmentos SQL; el último cambio debe validar desde cero en Source CI. Build/typecheck/tests no se consideran pasados hasta que el workflow del commit final concluya SUCCESS. Se añadió lease heartbeat/renewal para handlers largos en `0009` y debe verificarse en CI; aún faltan replay autorizado + audit, métricas/alertas, crash tests extendidos, pool reuse A→B, handlers Meta reales, secret manager/deployment y review independiente. TASK-003 permanece `in_progress`; GO-PRODUCTION sigue NO-GO. Ver `docs/60-TENANT-JOBS-RUNTIME.md`.


### Handoff de producto — CRM vs ARM (2026-11-07)

Se revisaron `docs/38-CRM-DOMAIN-SPEC.md`, `docs/42-INITIAL-DATA-MODEL.md`, `docs/43-API-AND-EVENT-CONTRACTS.md` y `docs/30-RECOMMENDED-ARCHITECTURE.md`. Se creó `docs/61-ARM-STRATEGY-AND-ARCHITECTURE-ASSESSMENT.md`. La recomendación provisional es conservar TASK-035/042..043/053 y el bounded context CRM; añadir Agent Management & Orchestration como capacidad separada conectada mediante contratos públicos. ARM es ambiguo (Agent Relationship Management, Agentic Relationship Management o Account Relationship Management); el naming y el cambio comercial no se consideran aprobados hasta que el propietario confirme su significado. No se elimina ni renombra el CRM.


### Handoff incremental TASK-003 — límites de ejecución de handlers (2026-11-07)

Se añadió deadline configurable `TENANT_JOB_HANDLER_TIMEOUT_MS` al runtime `microservices-meta-ecuapp` (default 300.000 ms, límites 1.000–900.000 ms), inyección por composición en la factoría de sesión y carrera de cancelación en `TenantJobExecutionLeaseHeartbeat`. El worker aborta el handler y rechaza la transacción cuando se pierde el fencing lease o vence el deadline. Se agregaron pruebas para timeout cooperativo, handler no cooperativo y pérdida de lease. La cancelación es cooperativa: Node.js no puede matar una promesa arbitraria; los handlers deben respetar AbortSignal y no ejecutar efectos externos dentro de la transacción.

**Estado:** código y pruebas registrados; Source CI run pendiente. TASK-003 continúa `in_progress`, no `verified` ni `accepted`.


### Handoff incremental TASK-003 — compatibilidad amqplib 2 y Source CI (2026-11-07)

Source CI run [#42428255833](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42428255833) detectó:
- Adapter RabbitMQ: `heartbeat` se pasaba como opción de socket (debe ser parámetro tuning AMQP en URI) y el tipo usado para el modelo devuelto por `connect` era `Connection` en lugar de `ChannelModel`.
- Isolation: faltaba el port `tenant-pseudonymizer.ts` y `TenantTelemetryContext` importaba la abstracción desde el adapter concreto.

Se corrigieron ambos problemas en commits `dc9d7d7`, `e924737` y `489b8cd`. El run que descubrió los errores quedó en FAILURE; Source CI asociado al commit `489b8cd3d84b057d2bdc40c8fa740008b4ac4bbc` está pendiente de ejecución. No marcar TASK-003 como verified hasta que build, typecheck y tests completen SUCCESS.

## EP-CRM-INT — CRM Intelligence basada en machine learning clásico

Decisión del propietario (2026-11-07): la IA del CRM es ML y estadística de bajo consumo, no LLM ni agentes. La especificación está en [docs/62](62-CRM-MACHINE-LEARNING-STRATEGY.md). Estas tareas están propuestas; ninguna implica que modelos o runtime ya existan.

| Tarea | Prioridad | Resultado | Dependencias | Criterios de aceptación |
|---|---:|---|---|---|
| TASK-081 | P0 | Contratos de outcomes, labels y features CRM | TASK-035, TASK-042..044, TASK-053 | definiciones versionadas, provenance, event-time, ventanas, purpose/retención y prevención de leakage |
| TASK-082 | P0 | Pipeline reproducible de datasets y feature snapshots | TASK-081, TASK-027..030, TASK-060 | tenant-scoped, snapshots reproducibles, temporal splits, calidad de datos y tests de fuga |
| TASK-083 | P0 | Baselines predictivos y benchmark tabular | TASK-081..082 | regresión lineal/logística y árboles/boosting (XGBoost cuando aplique) frente a baseline no-ML y métricas según coste del error |
| TASK-084 | P1 | Model registry y artefactos versionados | TASK-082..083, TASK-062..063 | checksum, dataset/código/feature version, métricas, calibración, aprobación, expiración, promoción y rollback |
| TASK-085 | P1 | Serving de inferencia CPU-first detrás de ports CRM | TASK-083..084, TASK-039, TASK-060 | contrato tipado, aislamiento tenant, reason codes, fallback sin ML y latencia/RAM/CPU medidas; sin LLM/agentes |
| TASK-086 | P1 | MLOps de calidad, drift y rendimiento | TASK-084..085, TASK-029..030 | feature freshness, training-serving skew, drift, calibración y performance por cohortes, alertas y desactivación segura |
| TASK-087 | P1 | Casos predictivos ampliados | TASK-081..086 | churn, forecast, propensión, LTV, clustering/ranking y dedupe asistido; sin merge ni acción externa automática |

Estas tareas no desplazan el cierre del aislamiento runtime TASK-003 ni el CRM transaccional. No se entrenará con datos reales antes de completar los gates de privacidad/seguridad y las condiciones legales aplicables.

### Handoff incremental TASK-003 — pool reuse PostgreSQL A→B (2026-11-07)

Se añadió una regresión de integración a `microservices-meta-ecuapp/src/jobs/infrastructure/postgres/postgres-tenant-job-runtime.integration.spec.ts`: reutiliza secuencialmente el mismo pool worker para ejecutar primero en tenant A y luego en tenant B, exige el mismo `pg_backend_pid()` y comprueba que los GUC transaccionales `app.user_id` y `app.tenant_id` cambien al segundo principal sin conservar el contexto anterior. Commit `bcedfab0538f5ee82a06ffe2480f41e3378bab7e`. Código implementado; CI de este commit pendiente de lectura. TASK-003 sigue `in_progress`; no marcar verificada ni aceptada hasta CI, review independiente y cierre de replay auditado, métricas/alertas, crash tests, handlers reales y despliegue seguro.

## Handoff — TASK-003 pool A→B (2026-11-08)

- Verificado en Source CI #42431419028: `DatabaseService` real, pool de una conexión y secuencia de tenants A→B sobre el mismo `pg_backend_pid()`; contexto de tenant/usuario limpiado tras COMMIT.
- Commit `6059822896987fc618c479d53117354e1a785144` añade comprobación de cleanup tras ROLLBACK; Source CI #42431530685 estaba ejecutando la suite al actualizar este handoff.
- TASK-003 permanece in_progress: no marcar terminada hasta completar replay autorizado/auditado, métricas, crash/redelivery/fencing, handlers reales y gates de deployment/revisión independiente.

**Verificación operativa adicional (2026-11-08):** Source CI #42431530685 SUCCESS confirmó el `DatabaseService` real con reutilización física de conexión tenant A→B y limpieza de GUC tras COMMIT y ROLLBACK. No cerrar TASK-003: replay, observabilidad, crash/redelivery/fencing, handlers reales, deployment y review independiente siguen abiertos.

### Handoff incremental TASK-003 — aislamiento concurrente A/B (2026-11-08)

- Se agregó a `apps/api/src/platform/database/database.context.integration.spec.ts` una prueba con dos transacciones activas al mismo tiempo y un pool worker de dos conexiones.
- Criterios ejercitados: dos `pg_backend_pid()` distintos; contexto `app.user_id` y `app.tenant_id` correcto y estable en cada conexión; RLS no devuelve filas del tenant contrario.
- Commit: `9b497d0805b53f79e658fd874d0ebfbec3863b12`. Estado: implementación de test añadida; Source CI exacto aún pendiente de verificar, por lo que no marcar como verified.
- Evidencia previa: Source CI #42431530685 SUCCESS para commit `6059822896987fc618c479d53117354e1a785144`, con A→B secuencial en la misma conexión y cleanup tras COMMIT/ROLLBACK.
- TASK-003 permanece `in_progress`; no aceptar hasta completar controles de replay/DLQ, observabilidad, crash/redelivery/fencing, handlers de negocio, deployment y review independiente.

## Handoff — replay administrativo fail-closed (2026-11-08)

- Migraciones `0012-tenant-job-approved-replay.sql` y `0013-tenant-job-approved-replay-boundary.sql`: persistencia tenant-scoped de requests, genealogía inmutable, FK compuestas, policy RLS, append-only y función SQL SECURITY DEFINER; clona payload internamente sin SELECT de payload ni INSERT de lineage para el API.
- API `apps/api/src/platform/jobs`: controller, service y repository port/adaptador PostgreSQL; ApprovalWorkflowService stages request+approval en una transacción; consumo exige hash exacto, dos aprobadores/step-up y audit `approval_consumed`; child replay idempotente.
- `TenantJobReplayPolicyRegistry` queda vacío por defecto; `crm.contact.sync` solo es un ejemplo de nombre en tests, no hay handler registrado en producción. Ningún job puede replayarse hasta probar idempotencia de efectos externos con stable domain key y registrar policy version compatible. El flujo end-to-end con broker/handler real sigue pendiente.
- Tests nuevos: registro fail-closed/validaciones de policies; servicio rechaza sin policy antes de crear approval; permisos efectivos del rol `whatsbusiness_app` no permiten SELECT(payload) ni INSERT(replay lineage), sí EXECUTE a la función SQL autorizada.
- Source CI #42432745586 SUCCESS para commit `6c93efdfea0cef7f1819402ab872e439ef858ccd`: migraciones 0001–0013/idempotencia, build, typecheck, unit, PostgreSQL/RabbitMQ integration.
- TASK-003 continúa in_progress por handlers reales, replay e2e, broker DLQ operativo, métricas/alertas, crash/redelivery/fencing extendido, secretos/deployment y revisión independiente.

## Handoff actualizado — TASK-003 RabbitMQ recovery, métricas y fencing (2026-11-08)

- **Source CI:** [#42433941375](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42433941375) terminó SUCCESS para commit `f136cff710fe8c60c8430c82928092320b9d90b5`. La ejecución terminó instalación frozen, migraciones versionadas e idempotencia, provisión DB de mínimo privilegio, DLX, build, typecheck, unit tests y PostgreSQL/RabbitMQ integration.
- **ACK ambiguo:** si la transacción pudo hacer COMMIT y RabbitMQ falla al confirmar ACK, el consumer no manda NACK que pudiera dead-letter un job ya completado. Se cierra la sesión worker y el estado/inbox PostgreSQL hacen segura la redelivery.
- **Persistencia interrumpida:** envelope válido + error al confirmar el procesamiento durable (por ejemplo, caída de PostgreSQL) cierra la sesión completa, sin ACK ni NACK; el mensaje puede volver a entregarse. El NACK sin requeue se reserva para envelopes AMQP inválidos.
- **Concurrencia:** múltiples deliveries prefetched que requieren desconexión comparten una única operación single-flight. Test concurrente con dos mensajes verificado.
- **Crash/recovery:** RabbitMQ integration prueba redelivery tras pérdida de canal; PostgreSQL integration comprueba recuperación de leases de execution/dispatch y fencing contra tokens viejos para renew/complete/mark-published. El fixture de tipo de job respeta la whitelist de producción; no se debilitó el constraint.
- **Telemetría parcial:** counters/histograms Prometheus in-memory y endpoint HTTP `GET /metrics` implementados; Source CI #403 SUCCESS para endpoint. Los gauges SQL agregados (outbox pending/blocked, leases activos/expirados, dead letters, edad y replays) pasaron Source CI #432 SUCCESS. Los gauges RabbitMQ se cambiaron a Management HTTP API para no compartir transporte AMQP con worker: identidad `monitoring` dedicada, permisos AMQP vacíos, HTTPS remoto y prueba de integración broker real. CodeQL #6 SUCCESS; Source CI #466 fue cancelado por pushes posteriores. El reader vigente incluye `messages_unacknowledged` para worker queue/DLQ; Source CI #481 ejecuta commit `b23ca8740cb66cfd18ed86d3906a52beaa7a98fd`. #480 falló porque la respuesta HTTP 200 de DLQ omitía un campo de contador; se añadió diagnóstico seguro de nombres de campos para identificar el contrato. Source CI #463/CodeQL #3 verificaron el diseño AMQP anterior, ahora reemplazado. Dashboard Grafana, alert rules y runbook están versionados, aún no importados ni probados en stack real. La alerta de target ausente forma parte del HEAD. Falta consumer lag/edad autoritativa, alert routing, SLO cuantificados y despliegue/validación operacional.
- **Replay y handlers:** el SQL/API de replay autorizado está implementado, pero el registry de policies continúa vacío y fail-closed. No registrar tipos de job hasta probar stable domain-effect idempotency en handlers reales Meta/CRM y el flujo end-to-end con approvals, audit, broker y efecto de negocio.
- **Estado:** TASK-003 sigue `in_progress`, no `accepted`; faltan DLQ operator workflow/replay operativo, handlers reales, unacked/consumer lag autoritativo, instalación y validación Prometheus/Grafana, alert routing/SLO, topology/policies del broker desplegadas, Secret Manager/rotación, carga/DR, revisión independiente y aceptación del propietario. GO-PRODUCTION sigue NO-GO.


### Handoff incremental TASK-003 — recuperación del canal de métricas y operación Prometheus (2026-11-08)

- Se detectó que el circuito de `RabbitMqTenantJobQueueMetricsReader` cerraba el canal de métricas después de timeout/RPC failure, pero no garantizaba una señal de desconexión de la sesión compartida. Eso podía dejar el reader permanentemente unavailable mientras la conexión del worker seguía viva.
- El reader ahora ejecuta un callback de recuperación después de cerrar el canal; la factory solicita el cierre de la sesión RabbitMQ completa. `RabbitMqConnectionFactory.close()` es single-flight para permitir que reader, consumer y supervisor converjan sin doble cierre destructivo.
- Se añadieron regresiones para verificar callback de recuperación, circuit breaker y preservación del canal ante conteos agregados inválidos.
- Se versionaron `observability/prometheus/tenant-job-alerts.yml`, `observability/grafana/tenant-job-runtime.dashboard.json`, `observability/RUNBOOK.md` y `observability/README.md`. Los umbrales son guardrails iniciales, no SLO/SLA; no se afirma instalación ni routing real.
- Estado: código/artefactos implementados; Source CI #42435984569 SUCCESS y CodeQL #42435984426 SUCCESS. La validación en Prometheus/Grafana reales y revisión operacional independiente siguen pendientes. TASK-003 sigue `in_progress`, no `verified` ni `accepted`. Permanecen pendientes adapters Valkey/object storage, handlers reales, replay end-to-end, DLQ operativa, métricas unacked/lag, Secret Manager/rotación, deployment, carga/DR y revisión independiente.

- **Verificación posterior:** Source CI [#42435984569](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42435984569) SUCCESS en commit `6db028bb7123dfd50bafe3d6f4f5e66bce06207d`: migraciones/idempotencia, build, typecheck y unit + PostgreSQL/RabbitMQ integration tests pasaron. El fallo previo #42435877166 fue un error sintáctico de aserción de tipo en la nueva spec; corregido y cubierto por el run SUCCESS.
- **SAST:** workflow `.github/workflows/codeql-security.yml` agregado. El primer intento falló por `build-mode: autobuild` no soportado por el extractor JavaScript/TypeScript; se cambió a `build-mode: none`. Source CI CodeQL [#42435984426](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42435984426) terminó SUCCESS en commit `6db028bb7123dfd50bafe3d6f4f5e66bce06207d`; queda pendiente el triage de hallazgos en Code Scanning y revisión independiente.


### Handoff incremental TASK-003 — métricas RabbitMQ unacknowledged (2026-11-08)

- El contrato `TenantJobBrokerMetricsSnapshot` incorpora `workerQueueUnacknowledgedMessages` y `deadLetterQueueUnacknowledgedMessages`.
- `RabbitMqManagementTenantJobQueueMetricsReader` valida y consume `messages_unacknowledged` de RabbitMQ Management API junto con `messages_ready` y `consumers`; mantiene HTTPS fuera de loopback, identidad monitoring separada, sin permisos AMQP de recursos, timeout abortable y respuestas sanitizadas.
- `PrometheusTenantJobRuntimeMetrics` expone gauges fijos de unacked para worker queue y DLQ, sin etiquetas tenant/actor/job. Se añadieron tests del reader, render Prometheus, validación de snapshots y supervisor.
- Se actualizó alerta Prometheus para unacked sostenido, panel Grafana, README, runbook y docs/63. `messages_unacknowledged` no representa consumer lag ni edad de mensaje; no se afirma esa medición.
- Código en commits `6a0cd876`, `770a50b2`, `296db341`, `6dff5fee`, `0990d761`, `753d30f8`, `4dbfa826`, `a5b1ae78`, `0cc8555b`, `37632ed9`, `ff2f873a`, `65eb2746`, `d3542c5f` y `0b9b3c7c` (rama `environment/local`).
- Source CI [#42436455186](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42436455186) y CodeQL [#42436455184](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42436455184) fueron disparados para el código actualizado; su resultado final aún no se certifica en este handoff.
- La cobertura de unacked mejora la visibilidad de deliveries en curso, pero consumer lag temporal sigue pendiente de una fuente autoritativa (por ejemplo, timestamp de publicación/edad del mensaje en broker con semántica verificada).
- TASK-003 permanece `in_progress`; no marcar `verified` ni `accepted`. Permanecen pendientes handlers de negocio reales y replay E2E, workflow operativo de DLQ, adapters Valkey/object storage, stack Prometheus/Grafana y alert routing desplegados, TLS/mTLS y Secret Manager/rotación reales, carga/backup/restore/DR, revisión independiente y aceptación del propietario. GO-PRODUCTION sigue NO-GO.


## Handoff de implementación — TASK-027 / TASK-028 (2026-11-07)

**Estado reconciliado:** ambas tareas permanecen `in_progress`. Hay código y pruebas unitarias añadidos, pero aún no satisfacen todo el DoD ni existe aceptación del propietario. No marcar `verified` o `accepted` por la mera creación de los módulos.

### TASK-027 — Webhook Gateway e inbox
- **Implementado en código:** GET challenge; POST con HMAC-SHA256 sobre raw bytes, UTF-8 estricto y límite de 3 MiB; decodificación acotada de payload por producto; mapping app/product/asset a tenant; cifrado AES-256-GCM; inbox durable con clave idempotente; outbox transaccional; HTTP 200 solo tras COMMIT.
- **Pruebas añadidas:** firma válida/alterada, límite y formato de firma, mismatch de producto, bounds, deduplicación de eventos, asset→tenant y rechazo de firma antes de resolver asset; cifrado/AAD.
- **Pendientes DoD:** contrato OpenAPI WH-001..WH-007 y AsyncAPI freeze formal; fixtures oficiales/versionados de cada producto y prueba de callbacks reales; rate limit/WAF y despliegue del límite TLS; KMS/Secret Manager; migración ejecutada en entorno integrado y revisión de roles/RLS; Source CI, CodeQL y test de integración.

### TASK-028 — Event bus, consumidores, DLQ y recuperación
- **Implementado en código:** evento interno mínimo v1 sin payload PII; RabbitMQ exchange/quorum queue/DLX/DLQ durables; publisher confirms + mandatory; ACK manual; worker registry, handler processor tenant-scoped, consumer receipt idempotente en la transacción de efectos, leases/fencing, retries con backoff+jitter, DB DLQ y recuperación por leases vencidos; supervisor de reconexión.
- **Pruebas añadidas:** processor con handler, handler ausente que termina en DLQ, event envelope del dispatcher, marca de outbox y retry tras error de broker.
- **Pendientes DoD:** handlers reales para eventos por producto y garantías de idempotencia para todos los efectos externos; wiring/despliegue del worker con rol de BD dedicado; API operacional tenant-scoped de consulta DLQ; replay con doble aprobación/step-up/audit y CR-0016 cerrado; retención/privacidad; fault injection y pruebas E2E PostgreSQL/RabbitMQ, carga/DR y alertas de TASK-029.
- **Seguridad:** no añadir handlers no-op. No habilitar replay, SQL manual ni borrado automático sin política y aprobación. La DLQ física RabbitMQ debe seguir privada.

### Dependencias y evidencia
- TASK-001 y TASK-007 son dependencias declaradas para TASK-027; TASK-028 depende de TASK-027.
- Implementación, configuración y limitaciones: `docs/64-META-WEBHOOK-GATEWAY-AND-EVENT-BUS.md`.
- Los tests se agregaron a `microservices-meta-ecuapp/project.json` y la prueba de controller a `apps/api/project.json`. Las pruebas reales del backend no se ejecutaron localmente en este entorno.
- No se declara CI verde para este commit hasta inspeccionar los runs que GitHub Actions genere después del push.
- No hay evidencia de instalación en producción, uso con callbacks reales ni aprobación de retención/replay. CR-0016 permanece abierto.

## Handoff incremental — TASK-027/028 y permisos de ingress (2026-11-08)

- Migración `0018-meta-webhook-ingress-app-grants.sql` corrige el contrato de privilegios del login API `whatsbusiness_app` (NOINHERIT) concediendo solo columnas de metadata y escrituras de inbox/outbox; no se abre lectura de payload cifrado.
- Source CI incorpora login separado `whatsbusiness_webhook_worker` y activa integración `RUN_META_WEBHOOK_INTEGRATION_TESTS=true`.
- Nueva suite de integración usa PostgreSQL y RabbitMQ reales para comprobar dedupe de inbox, dispatch durable, consumer, handler de prueba, receipt idempotente y rechazo de tenant context incorrecto.
- Source CI [#42444781572](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42444781572) estaba en ejecución para commit `168c3fa40514998a17a0df8d94e8b97e2767208e`; el código no se marca `verified` hasta SUCCESS en el HEAD que contiene la suite completa.
- TASK-003 permanece `in_progress`: wrappers tenant-scoped y runtime están implementados, pero adapters concretos Valkey/object storage, validación de observabilidad desplegada, replay E2E con handlers reales, medición autoritativa de lag, SLO/RPO/RTO, carga/DR y revisión independiente no están cerrados.
- TASK-027/028 permanecen `in_progress`: faltan handlers reales por producto, fixtures/conformance oficiales Meta, Secret Manager/KMS productivo, rate limiting/WAF, freeze contractual, replay aprobado por CR-0016, retención/privacidad y aceptación operativa.

### Handoff incremental — contrato de evento Meta webhook (2026-11-08)

- Se confirmó que `meta.webhook.received.v1` y `MetaWebhookReceived` ya existían en el catálogo. Se eliminaron duplicados y se dejó la unión canónica en 69 eventos, 69 canales, 138 operaciones y 69 schemas.
- El catálogo canónico contiene 69 eventos, 69 canales AsyncAPI, 138 operaciones y 69 schemas. `MetaWebhookReceived` está definido una sola vez y el union JSON Schema referencia cada definición exactamente una vez; los fixtures validan payload positivo y rechazos de tenant nulo/campos extra.
- La instalación de validadores usa un directorio aislado en `RUNNER_TEMP` y el script resuelve los módulos desde una ruta explícita, evitando `EUNSUPPORTEDPROTOCOL workspace:`. AsyncAPI se valida con el parser oficial `@asyncapi/specs@6.11.1` desde el script; se evita el CLI que devolvía exit code 1 por warnings de lint heredados y se evita fijar versiones comprometidas 3.4.1/3.4.2.
- Contract CI #15/#17 avanzaron hasta AsyncAPI CLI, pero fallaron por diagnostics de lint históricos pese a cero errores de especificación. Se migró la validación a la API del parser oficial, con aserción sobre `document` y severidad error, en la siguiente ejecución.

- La integración inicial con parser 3.4.0 chocó con compilación de reglas Spectral/Ajv en Node 26.13. Se subió a `@asyncapi/specs@6.11.1` y se comprobará en el siguiente Contract CI.

- El parser Spectral falló al compilar Ajv bajo Node 26.13; se reemplazó por el schema oficial `@asyncapi/specs@6.11.1` (AsyncAPI 2.6.0, variante sin $id) y Ajv draft-07. El validador propio mantiene Ajv 2020 para schemas de dominio. Contract CI #24 terminó SUCCESS: [run](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42445689549).

### Estado de verificación al cierre de esta iteración (2026-11-08)

- Contract CI #24: SUCCESS; OpenAPI válido y AsyncAPI 2.6.0 validado con schema oficial; el validador de dominio confirma 69 canales/eventos, 138 operaciones y fixtures válidos.
- CodeQL #65: SUCCESS para el código con la integración y las migraciones recuperadas.
- Source CI #527 (`42445689547`, commit `da85d998a4d1534b0ae52e0bf3d143b5f9044a23`) terminó `cancelled` al agotar el límite de 30 minutos durante el test del paquete microservices-meta-ecuapp; instalación frozen, migraciones (incluida idempotencia), provisionamiento DB, build y typecheck terminaron SUCCESS. La suite de integración se está corrigiendo antes de repetir Source CI. No declarar TASK-003 ni TASK-027/028 como cerradas hasta SUCCESS de Source CI en el código corregido.


## Handoff incremental — lifecycle de pruebas RabbitMQ y worker Meta (2026-11-08)

- **Evidencia CI:** Source CI #527 fue cancelado tras 30 minutos dentro de microservices-meta-ecuapp:test. Los pasos anteriores de instalación frozen, migraciones 0001–0018 e idempotencia, roles mínimos, build y typecheck terminaron correctamente. api:test finalizó; el proceso que no concluyó fue la suite del backend microservices-meta-ecuapp.
- **Defecto encontrado en inspección:** rabbitmq-transport.integration.spec.ts declaraba queue y deadLetterQueue dentro del bloque try y los referenciaba desde finally. En el teardown, esas referencias no están en ámbito; el error puede interrumpir la limpieza antes de cerrar los canales/conexión, dejando el proceso Node activo.
- **Corrección aplicada en código:** identificadores de recursos en ámbito del test, limpieza condicional de las dos colas y del exchange temporal, y cierre de la sesión RabbitMQ aun cuando la limpieza de recursos falle.
- **Defecto de suite adicional:** microservices-meta-ecuapp/project.json apuntaba a meta-webhook-worker.runtime.spec.ts, archivo inexistente en el árbol de environment/local. Se añadió meta-webhook-worker.supervisor.spec.ts con pruebas de backoff/shutdown ante broker no disponible, cierre del pool y rechazo de configuración sin handler.
- **Estado de verificación:** estos cambios están preparados para validación por Source CI en el siguiente commit. No se presume que la reparación resuelva todos los fallos hasta inspeccionar logs y obtener SUCCESS.
- TASK-003, TASK-027 y TASK-028 continúan in_progress; faltan handlers reales, replay de negocio aprobado y probado end-to-end, política de retención/privacidad, rate limiting/WAF, secretos/KMS y despliegue, validación operativa de observabilidad, carga/DR, revisión independiente y aceptación del propietario. GO-PRODUCTION continúa NO-GO.


### Handoff incremental — Source CI #528: causas de los dos fallos restantes (2026-11-08)

- Source CI [#528](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42485100001), commit `a00c4b318021d12e84cc5fe98c23f4da6639b65a`: frozen install, migraciones/idempotencia 0001–0018, provisión de roles, build y typecheck SUCCESS; `api:test` SUCCESS; `microservices-meta-ecuapp:test` completó en ~10 s con 80/82 pruebas aprobadas y 2 fallidas. Ya no se queda colgado ni excede 30 minutos. CodeQL [#66](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42485100046) SUCCESS.
- **RabbitMQ:** el test declaraba la topología de producción y su queue binding `jobs.#`; el mensaje también podía entrar en la cola worker real, mientras la cola temporal objetivo quedaba con 0 ready. El fixture ahora declara solo exchanges, y únicamente el binding temporal recibe el routing key de integración. El teardown fail-safe y los tests del supervisor siguen pasando.
- **PostgreSQL ingress:** la inserción idempotente usa `ON CONFLICT (app_id, provider_product, idempotency_key)`; a la identidad `whatsbusiness_app` le faltaba SELECT de esas columnas de metadata. También el `ON CONFLICT(event_id)` del outbox requiere lectura de esa clave. Migración 0019 concede SELECT exclusivamente sobre dichas columnas; no concede SELECT de ciphertext, nonce, tag ni payload.
- **Próximo gate:** Source CI debe ejecutar la migración 0019, repetir migraciones idempotentes y pasar PostgreSQL/RabbitMQ integration tests en el commit posterior. TASK-003, TASK-027 y TASK-028 siguen `in_progress`; todavía no se afirma acceptance ni GO-PRODUCTION.


### Handoff incremental — Source CI #536 SUCCESS y aislamiento del rol ingress (2026-11-08)

- **Source CI #536** [run 42486399710](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486399710), commit de código `cfe7019f4e6712055d50424ecf8f498ecf074c51`: SUCCESS. Pasaron frozen install, provisioning, migraciones 0001–0020, segunda ejecución idempotente, build de API/Web/backend, typecheck, pruebas `api:test` y `microservices-meta-ecuapp:test`; cleanup PostgreSQL/RabbitMQ normal.
- **CodeQL #74** [run 42486399698](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486399698): SUCCESS. El workflow actualizó únicamente `pnpm-lock.yaml` mediante el commit automático `ff89b71`; la rama actual apunta a ese commit.
- Los defectos de lifecycle del test RabbitMQ, topología compartida, métrica asíncrona y permisos/tenancy del outbox quedaron corregidos por los cambios de la rama y validados en #536. La prueba RabbitMQ verifica entrega, ACK y DLX con el estado AMQP real; el test PostgreSQL valida el boundary `stage_meta_webhook_event_outbox` y evita leer campos cifrados.
- **Hardening adicional en curso:** 0016 aún concede membresía de `whatsbusiness_app` a `whatsbusiness_webhook_ingress_role`. Aunque el login es NOINHERIT, PostgreSQL permite `SET ROLE` sobre memberships con SET habilitado. Migración 0021 revoca la pertenencia y también los grants directos de outbox del grupo; pruebas verifican el ACL del grupo y el rechazo de SET ROLE. Validación Source CI siguiente pendiente.
- TASK-003, TASK-027 y TASK-028 permanecen `in_progress`. CI verde de este bloque no equivale a acceptance ni GO-PRODUCTION: siguen pendientes handlers reales de negocio, replay operativo autorizado, políticas de retención, secretos/KMS, WAF/rate limiting, despliegue, observabilidad/SLO, carga/DR y revisión/aceptación independiente.


### Handoff incremental — Source CI #539: inbox, dispatch, worker y DLQ (2026-11-08)

- Source CI [#539](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976106) terminó SUCCESS en commit `c2bb65fc1a506ba54ab3f7662c9bbc759e2b0536`: instalación frozen, migraciones 0001–0021 e idempotencia, roles mínimos, build, typecheck, unitarias e integraciones PostgreSQL/RabbitMQ.
- CodeQL [#77](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976151) terminó SUCCESS.
- TASK-027: la integración de ingress verifica dedupe, persistencia inbox/delivery/outbox, contexto tenant, permisos mínimos del API login y publicación durable. El outbox se stagea exclusivamente mediante función tenant-checked; el API no puede leer ciphertext/outbox ni asumir el grupo ingress.
- TASK-028: la integración publica dos eventos mediante dispatcher y RabbitMQ; el handler registrado completa su receipt una vez; el evento válido no soportado va a dead-letter persistente con razón estable. La consulta tenant-scoped del dead-letter devuelve metadata y rechaza contexto cruzado.
- **Clasificación:** este slice de código y pruebas está CI-verified. Las tareas globales siguen `in_progress`: no hay handlers de negocio reales, replay no se habilita antes de CR-0016 y de demostrar idempotencia de efectos externos; faltan operación de DLQ, retención/privacidad, protección perimetral, secretos gestionados, fixtures Meta oficiales, validación de topología desplegada, carga/DR, SLO/alertas operativas, review independiente y aceptación del propietario.


### Handoff incremental — métricas live RabbitMQ (2026-11-08)

- Se añade `rabbitmq-management-tenant-job-queue-metrics.integration.spec.ts` para probar el reader contra el Management HTTP API del broker real: dos colas efímeras, mensajes confirmados, consumidores manual-ACK y seis gauges de worker/DLQ en estados ready, in-flight e idle.
- La workflow crea un usuario independiente con tag `monitoring` y permisos AMQP vacíos; el test se registra en el target Nx backend. La credencial es efímera y exclusivamente de CI.
- **Estado:** implementación pendiente de Source CI/CodeQL en el commit resultante. La evidencia previa #539/#77 permanece SUCCESS. TASK-003 sigue `in_progress`; esta prueba no cierra SLO/alertas, despliegue ni aceptación.


### Handoff incremental — reparación YAML de Source CI (2026-11-08)

- Source CI #540, #541 y #549–#552 fallaron antes de crear jobs por un `run` YAML truncado al provisionar el usuario RabbitMQ `monitoring`; no ejecutaron build, typecheck ni tests.
- Se reconstruyó el step con `empty_permission_regex` generado por `printf`, una sola llamada `set_permissions` con los tres patrones vacíos y un único `set_user_tags` dentro del step.
- **Estado:** corrección de workflow pendiente de CI. La integración live del Management API no está aún verificada; TASK-042 ya tiene migración y slice API/servicio/repositorio, a validar por CI.

### Handoff incremental — TASK-042 CRM Contacts (2026-11-08)

- Código fuente implementado (no aceptado): migración 0022 crea crm.contacts e idempotencia; el bounded context contiene validación de dominio, repositorio PostgreSQL, ContactService con autorización contextual, audit append-only, cursor estable, request hash idempotente y control optimista; el controller y módulo están preparados.
- Pruebas agregadas: dominio y PostgreSQL integration test con tenants A/B, insert/list/get/update, replay idempotente create/update, conflict por clave reutilizada, stale version, audit chain y cross-tenant not-found. Source CI debe ejecutarlas con RUN_CRM_CONTACTS_INTEGRATION_TESTS=true.
- Contrato: CRM-001..004 tiene schemas completos en OpenAPI y docs/66. Contract CI actualmente permite activar únicamente PLT-001..005. Por tanto CRM-001..004 están design-frozen pero x-implementation-allowed=false; CrmContactsModule no se importa en AppModule y no se exponen endpoints HTTP.
- Estado global TASK-042: in_progress. No marcar verified hasta Source CI/Contract CI verdes, ni accepted sin revisión independiente y aceptación del propietario. CRM-005..017 (identities/merge/custom fields/companies) siguen fuera de este slice.
  
### Handoff incremental — invariant de tipo de contacto (2026-11-08)

- Se añade migración 0023 para imponer en PostgreSQL `organization => first_name IS NULL AND last_name IS NULL`, manteniendo la validación ya presente en el agregado de dominio.
- La integración intenta una inserción inválida con el login runtime dentro del tenant y comprueba SQLSTATE `23514`, recuperándose mediante SAVEPOINT/ROLLBACK TO SAVEPOINT.
- **Estado:** pendiente Source CI (migración idempotente + suite real PostgreSQL). TASK-042 permanece `in_progress`; los endpoints CRM siguen fuera de `AppModule` y `x-implementation-allowed=false` hasta superar los gates.


### Handoff incremental — fixture auditor para RLS de auditoría (2026-11-08)

- Source CI #558 ejecutó migraciones 0001–0023, build y typecheck; la suite API registró 101 pruebas aprobadas y una falla en la verificación del stream de auditoría del slice CRM. La migración 0023 y su rechazo SQLSTATE 23514 sí fueron ejecutados antes de esa aserción.
- La causa es el fixture: el actor tenía membresía activa pero no una asignación real a un rol con `audit.read`; la política RLS ocultaba los eventos de forma correcta. La prueba incorpora `compliance_auditor` independiente por tenant, aristas tenant-scoped `role_permissions`, asignaciones `membership_roles` y captura posterior del `authz_version`.
- No se relaja la política de auditoría. TASK-042 permanece `in_progress`; Source CI/Contract CI y habilitación HTTP siguen siendo gates separados.


### Handoff incremental — Source CI #560 y reparación del test de métricas RabbitMQ (2026-11-08)

- Source CI #560 (run 42489814295), commit b6da092d443c91aebf502809439f82677d49acdc: frozen install, migraciones 0001–0023 e idempotencia, build, typecheck y api:test SUCCESS. microservices-meta-ecuapp:test falló en la integración live de métricas RabbitMQ por Management API; el step agotó sus 8 minutos.
- El log muestra el test marcado como fallido en aproximadamente 104 ms, pero no incluye la aserción original porque el proceso no termina. Se encontraron defectos de robustez: el error HTTP ocultaba status, el setup/constructor quedaba fuera del try/finally y las llamadas secuenciales de cleanup no tenían límite temporal.
- Corrección implementada: el reader informa solo status HTTP/redirect, cancela el body fallido y nunca expone response body ni credenciales; el test protege setup con try/finally, añade timeout explícito, acota lecturas y teardown, y ejecuta cleanup aun con fallos.
- Verificación pendiente del siguiente Source CI/CodeQL. No se relajaron permisos RabbitMQ: la identidad conserva tag monitoring y regex vacíos de configure/read/write. TASK-003 sigue in_progress; no declarar métricas live verificadas hasta CI SUCCESS y revisión operativa de SLO/alertas/despliegue.


### Handoff incremental — cierre de conexión RabbitMQ y recuperación por redelivery (2026-11-08)

- Source CI #561 avanzó correctamente por instalación, migraciones/idempotencia, provisioning, build, typecheck y api:test; permaneció ejecutando la suite backend en la integración Management API. No hay resultado final de #561 disponible en el momento de este handoff.
- La revisión del código identificó que RabbitMqConnectionFactory.close esperaba Promise.allSettled de los cierres de publisher/consumer antes de cerrar el socket padre. La aplicación de worker reutiliza ese método para interrumpir una sesión con ACK ambiguo o error de procesamiento; un RPC de canal pendiente podía impedir el cierre de la conexión y la reconexión.
- **Corrección implementada:** close ahora cierra directamente la conexión AMQP padre, que invalida operaciones pendientes y termina todos sus canales; el test de redelivery simula crash de proceso cerrando la conexión completa con un mensaje sin ACK, y verifica la redelivery.
- El siguiente push supersede Source CI #561 por la política cancel-in-progress; Source CI/CodeQL del nuevo HEAD pendientes. TASK-003 sigue in_progress; no declarar recuperación verificada hasta SUCCESS.

### Handoff incremental — compatibilidad RabbitMQ 4.4 del test live de métricas (2026-11-08)

- Source CI #560 y #562 confirmaron SUCCESS en instalación frozen, migraciones 0001–0023/idempotencia, provisioning, build, typecheck y `api:test`; ambos fallaron en el target independiente `microservices-meta-ecuapp:test` durante la integración live de métricas RabbitMQ.
- El log del broker mostró que RabbitMQ 4.4 no permite colas clásicas transitorias no exclusivas (`transient_nonexcl_queues`). El test usaba `durable=false, exclusive=false, autoDelete=true` para dos colas efímeras.
- **Corrección implementada:** las colas temporales ahora son exclusivas y auto-delete, manteniendo el flujo de publish confirm, ready/unacked/consumers, ACK y cleanup. La topología quorum durable de producción y los permisos monitor-only no cambian.
- Commit: `92b46d68bc8070a086b95352d504797fe1bf0c3d`. Source CI #563/CodeQL #98 deben confirmar el HEAD antes de marcar la integración verificada. TASK-003 continúa `in_progress`.

### Estado vigente — TASK-042 CRM Contacts API (2026-11-08; supersede los handoffs de gate cerrado previos)

- CRM-001..004 se activaron en commit `de617cc18b004c0b67df0d5c8b9a10bbf50897a7`: `CrmContactsModule` quedó importado en `AppModule`; OpenAPI habilita solo esas cuatro operaciones y conserva las cinco PLT foundation. El validador mantiene allowlist exacta de nueve IDs; las otras 287 operaciones siguen bloqueadas.
- Se añadió suite del controller con seis pruebas para guard OIDC, RBAC, propósito, tenant context, mismatch de tenant, ETag e If-Match. La suite PostgreSQL existente cubre RLS, tenant A/B, idempotencia, optimistic concurrency, audit chain e invariante de organization.
- Source CI [#570](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42497391908) SUCCESS; Contract CI [#29](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42497491129) SUCCESS tras corregir cuatro claves YAML de gate; CodeQL [#105](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42497391953) SUCCESS.
- Estado: endpoints HTTP CRM-001..004 habilitados y CI-verified. TASK-042 permanece `in_progress` hasta revisión independiente y aceptación del Product Owner. No activar CRM-005..017 ni declarar completado el bounded context.
### Estado vigente — Source CI #572 SUCCESS, métricas y guardas CRM (2026-11-08)

- El test live de RabbitMQ utiliza colas efímeras por ejecución `durable=false, exclusive=true, autoDelete=false`; se eliminan explícitamente tras comprobar contadores idle. `autoDelete=true` borraba las colas al cancelar el último consumer.
- El reader usa `RabbitMqPrometheusTenantJobQueueMetricsReader` sobre `/metrics/detailed`; no usa Management API ni usuario AMQP con permiso `read`.
- Source CI [#572](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026616) y CodeQL [#107](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026686) SUCCESS en `1c6e682eb755e77b8359e52d4e7091a41e4ef6d5`.
- CRM-001..004 está habilitado y CI-verificado; el controller exige OIDC, tenant context y RBAC por ruta. TASK-042 sigue pendiente de revisión independiente y aceptación del Product Owner.
- TASK-003/027/028 permanecen `in_progress`: handlers reales y event bus, operación desplegada, alert routing, SLO, retención y DR siguen pendientes. GO-PRODUCTION NO-GO.

## Handoff incremental — TASK-043 / TASK-053 (2026-11-08)

**Estado general de TASK-043: in_progress. Estado general de TASK-053: in_progress.** Se completó código fuente para el primer slice CRM-005/006; su estado de verificación queda pendiente de Source CI y Contract CI del commit que lo incorpora.

Entregables del slice:
- CRM-005 consulta identidades con cursor estable (pageSize 1–100), OIDC, tenant context, purpose y permiso crm.contacts.identities.read.
- CRM-006 vincula la identidad con Idempotency-Key, auditoría append-only, permiso sensible crm.contacts.identities.link y conflicto 409 sin revelar el contacto existente.
- Migración 0024 con FK compuesta tenant-contact, unicidad namespaced por tenant, RLS ENABLE/FORCE, trigger actor/tenant y permisos SELECT/INSERT.
- Roles: tenant_owner por catálogo completo; solo tenant_admin puede leer/vincular además de tenant_owner (catálogo completo); compliance_auditor solo leer. integration_admin no recibe acceso al PII del CRM y los roles agent, inbox_supervisor, analyst y developer_api_integrator tampoco.
- Se reutiliza cursor y repositorio de contactos, y se extrae la lógica común de idempotencia/hash para evitar duplicación.
- Pruebas añadidas: dominio, metadatos de guards, PostgreSQL con idempotencia, colisión dentro de tenant, mismo ID entre tenants, RLS y audit stream.

Fuera de este cierre parcial: CRM-007 candidatos de duplicación, CRM-008..010 merge/undo, asociaciones de activos WAAC/PMA/WABA, importadores de Lead Ads, deduplicación, verificación del proveedor, unlink y eventos de negocio. No marcar TASK-043/053 como verified/accepted hasta completar sus criterios restantes y validación independiente.


## Revisión correctiva Source CI #574 — CRM ContactIdentity (2026-11-08)

- Source CI #574 completó build, typecheck, aplicación y replay del historial de migraciones; la suite API detectó dos fallos.
- Fallo 1: identity.slice.spec.ts comparó platform.permissions con el catálogo TS; el esquema SQL aún no tenía las dos nuevas claves. Corrección: apps/api/migrations/0025-crm-contact-identity-permissions.sql.
- Fallo 2: el test de ContactIdentityController usaba assert.rejects para una excepción síncrona lanzada al validar tenant; corrección a assert.throws.
- Contract CI #30 y CodeQL #109 pasaron en el commit anterior, pero el cierre técnico requiere que Source CI vuelva a pasar en el commit correctivo y que Contract CI vuelva a validar la documentación/contrato reconciliados.
- TASK-043 y TASK-053 permanecen in_progress; no marcar aceptación ni GO-PRODUCTION por este slice.

### Handoff incremental — métrica durable de backlog de ejecución (2026-11-08)

- Se amplía `platform.read_tenant_job_runtime_metrics()` con `pending_execution_jobs` y `oldest_pending_execution_age_seconds`. Se mide desde `published_at` el conjunto `status='queued' AND dispatch_status='published'`, que representa trabajos durables publicados aún no reclamados por worker.
- Se agregan los campos del snapshot y gauges Prometheus `tenant_job_execution_pending` y `tenant_job_oldest_pending_execution_age_seconds`. No se infiere lag de la cantidad de mensajes; RabbitMQ conserva sus propios gauges ready/unacknowledged/consumers.
- Migración `0025-tenant-job-execution-backlog-metrics.sql`: reemplazo controlado de función `RETURNS TABLE`, `SECURITY DEFINER`, `search_path` fijo y EXECUTE únicamente para `whatsbusiness_job_dispatcher_role`. No concede SELECT directo ni expone IDs/payloads.
- Unit tests del reader/exporter y PostgreSQL integration test cubren mapping, validación de contadores/edad, staging sin publicar y job publicado antes del claim.
- **Estado:** implementación añadida; Source CI del commit resultante pendiente. TASK-003/027/028 siguen `in_progress`; no se declara producción ni aceptación del propietario.


### Handoff post-CI — correcciones de métricas runtime (2026-11-08)

- Source CI #576 sobre 1140d35b: build, typecheck, instalación/versionado de migraciones e idempotencia, y pruebas API pasaron; falló Meta backend por dos casos introducidos en el nuevo slice.
- El exporter ahora acepta edad fraccionaria en oldestPendingDispatchAgeSeconds y oldestPendingExecutionAgeSeconds, manteniendo los demás gauges como contadores enteros seguros.
- El fixture PostgreSQL usa inbox.metrics.executionbacklog, jobType que respeta el regex de la base; se compara el backlog posterior con el valor previo, no con un supuesto de base vacía.
- **Estado:** corrección preparada; TASK-003 y GO-PRODUCTION continúan sin cierre ni aceptación.


## Corrección post-CI #577 (2026-11-08)

La integración PostgreSQL se reordenó para no llamar a la operación batch `claim_tenant_job_publications` mientras el job de finalización principal seguía pendiente. Primero se completa el dispatch/claim de ese job con el helper existente; después se inserta y publica el fixture de métrica cuando es el único nuevo job elegible en la topología de prueba. Esto elimina el efecto colateral real de `LIMIT` + `FOR UPDATE SKIP LOCKED` al filtrar fuera de la función por `job_id`, y evita dejar leases de otros fixtures en estado `publishing`.
**Estado:** el orden corregido se somete nuevamente a Source CI; no se afirma todavía verificación.


## Cierre de validación — CRM Identity + backlog de ejecución (2026-11-08)

- HEAD validado: 19e1c585648e510d67bc1d13eab9761775b56cf2.
- Source CI #578: SUCCESS (build, typecheck, migraciones/replay, suites API/PostgreSQL y Meta/PostgreSQL/RabbitMQ).
- CodeQL #113: SUCCESS. CodeQL #112 y #110 también quedaron SUCCESS en los commits previos de esta secuencia.
- Contract CI #30: SUCCESS; valida el mismo OpenAPI/allowlist que permanece sin cambios desde el commit de CRM Identity.
- Las métricas de backlog de ejecución añaden conteo de ejecuciones publicadas pendientes y edad en segundos, como gauges agregados sin labels tenant/user/job. Los dos defectos de Source CI #576/#577 quedaron corregidos: edad fraccionaria admitida y fixture de integración sin leases batch incidentales.
- El test de integración conserva jobType sintético conforme al contrato de persistencia y lo publica explícitamente; la secuencia de completion usa publishAndClaim antes de crear el fixture métrico.
- Dependencia de acceso: las plantillas TENANT_ROLE_CATALOG no se materializan automáticamente a platform.roles/platform.role_permissions. TASK-004 permanece abierto; nuevas rutas de identidad siguen protegidas fail-closed para memberships sin grants persistidos. La migration 0025 solo añade vocabulario en platform.permissions.
- TASK-003, TASK-004, TASK-027/028, TASK-042, TASK-043 y TASK-053 permanecen in_progress o requieren revisión/aceptación. No declarar finalización del backend ni GO-PRODUCTION.


### Handoff — TASK-027: timestamps Meta y deduplicación de estados (2026-11-08)

- El decoder centraliza conversión de timestamps numéricos y textuales: epoch seconds, epoch milliseconds e ISO-8601. Se corrige un regex de doble escape que impedía reconocer epoch strings.
- La regresión cubre el mismo WAMID con estado `delivered` a dos timestamps distintos (claves distintas) y el mismo timestamp repetido (misma clave), además de epoch milliseconds.
- **Estado:** implementado; Source CI pendiente. No declarar TASK-027/028 cerradas ni habilitar replay.


### Cierre de verificación — Webhook timestamp decoder (2026-11-08)

- Commit 8b96bd97c7fcd5cc816fbd933bd1c3bb236b3dd4: Source CI #579 SUCCESS y CodeQL #114 SUCCESS.
- El decoder normaliza epoch seconds, epoch milliseconds e ISO-8601. La regresión comprueba mismo WAMID/estado con timestamps distintos (no deduplicar) y duplicado idéntico (deduplicar).
- TASK-027/028 siguen in_progress: no confundir decoder verificado con integración real de handlers, despliegue, KMS, retention/replay policy, fixtures oficiales y aceptación.
- Se preparó ampliación de dashboard/alertas/runbook para las nuevas métricas tenant_job_execution_pending y tenant_job_oldest_pending_execution_age_seconds; configuración versionada pendiente de CI y despliegue/validación en Prometheus/Grafana reales.

### Cierre — observabilidad de backlog durable y CI validator (2026-11-08)

- Commit `36e7a962db113e81835a466393b479b34132980b`: Source CI #580 y CodeQL #115 SUCCESS. Dashboard Grafana 13 paneles y 11 reglas Prometheus; paneles para trabajos publicados pendientes de claim y su edad durable desde `published_at`.
- Commit `d4051c718de19016afd6e52b7803de903e4c5fba`: Source CI #581 y CodeQL #116 SUCCESS. Se añade validador estructural del dashboard/reglas a Source CI y comprueba panel IDs, targets, reglas y nombres de métricas exportadas.
- Las alertas (>100 jobs durante 5 min; edad >300 s durante 2 min) son guardrails iniciales, no SLO/SLA. El despliegue/alert routing real y pruebas de notificación aún no se han ejecutado.
- TASK-003 permanece `in_progress`; GO-PRODUCTION sigue NO-GO hasta los gates de operación, seguridad, carga/DR, revisión y aceptación.


### Handoff — TASK-027: Meta Lead Ads nested change.value (2026-11-08)

- El decoder ahora lee leadgen_id y created_time desde changes[].value, además de los campos top-level existentes.
- La regresión prueba idempotencia estable en la redelivery del mismo lead y diferenciación entre lead IDs.
- La notificación contiene IDs/metadatos; obtener field_data sigue siendo una lectura Graph API separada con permisos y token autorizados.
- **Estado:** parche implementado y pendiente de Source CI; TASK-027/028 siguen in_progress, sin handler CRM Leads ni despliegue productivo.


### Actualización de evidencia y handoff — CRM / Lead Ads (2026-11-08)

- CRM-005/006 ContactIdentity: commit `215ab46c725cef73aeb2e602328531896abf8354`, Source CI #575 SUCCESS y CodeQL #110 SUCCESS. Esto valida el primer slice de consulta/enlace namespaced, no cierre de TASK-043/053.
- TASK-027 Lead Ads: commit `eab842c699e41a6a0099eab343111042ec6aa94d`, Source CI #583 SUCCESS y CodeQL #118 SUCCESS. El decoder lee `leadgen_id` y `created_time` desde `changes[].value`; obtener `field_data` sigue requiriendo Graph API independiente y permisos autorizados. Aún no existe módulo CRM Leads ni consumer que materialice el lead en el CRM.
- CRM-007: se añade motor de dominio puro de candidatos por identidad provider-namespaced, procedencia y nombre normalizado. Sin endpoint ni merge automático; revisión humana obligatoria. Source CI pendiente.


### Cierre de verificación CRM-007 — 2026-11-08

- Commit 82eff584655212c16a4f59bce9542aeedf978bc4: Source CI #585 SUCCESS y CodeQL #120 SUCCESS.
- El target api:test ejecutó las nueve pruebas específicas del detector. Se validan identidad namespaced, referencia de origen, nombre normalizado, colisiones cross-tenant, ownership de identidades, tipos/estados, ranking y límites.
- Source CI #584 falló por un fixture que omitía la identidad del perfil origen; #585 pasó tras corregir la preparación, sin cambiar la lógica del dominio.
- CRM-007 queda implementado y CI-verified a nivel de dominio. API/query, contrato, auditoría operativa y aceptación independiente siguen pendientes; TASK-043/053 permanecen in_progress.

### Corrección de estado Lead Ads — 2026-11-08

La nota anterior que señalaba Source CI pendiente quedó supersedida: commit eab842c699e41a6a0099eab343111042ec6aa94d pasó Source CI #583 y CodeQL #118. El decoder procesa leadgen_id/created_time dentro de changes[].value. Aún no existe el bounded context CRM Leads ni la materialización del lead/lectura de field_data.


### CRM-007 — señal cross-channel con evidencia de verificación (2026-11-08)

- Se añade `SameVerifiedPhoneE164Strategy` (80 puntos) para mismo provider y E.164 exacto en canales/productos diferentes, exigiendo `verifiedAt` en ambos perfiles.
- Números sin verificación no generan esa coincidencia. Se documenta el riesgo de números compartidos/reciclados y se mantiene `manual_review_required`; no se fusiona ni se vincula automáticamente.
- Dos pruebas nuevas cubren coincidencia cross-channel verificada y rechazo de números sin verificación. Source CI pendiente del nuevo commit.


### Corrección CRM-007 post-CI #586 (2026-11-08)

- Source CI #586 falló en `api:build` porque el literal `SAME_VERIFIED_PHONE_E164` no se añadió al union discriminado `ContactDuplicateCandidateReason`; la estrategia y el test estaban presentes, pero TS impidió compilar.
- Se añade el reason code al union. El cálculo de score, provider scope, verificación `verifiedAt` y `manual_review_required` no cambian.
- El job también registró una advertencia/error de readiness del endpoint RabbitMQ Prometheus en setup; se inspeccionará por separado después de repetir el build/API test con el fix de tipos.
- Estado del nuevo slice cross-channel: no verificado hasta Source CI + CodeQL verdes.


## Evidencia de señal cross-channel — 2026-11-08

La estrategia `SAME_VERIFIED_PHONE_E164` se verificó en commit `d3d3b0722a61494eb8b8ba1d2e7c769ab2383f3d`: Source CI #587 SUCCESS y CodeQL #122 SUCCESS. Source CI ejecutó lockfile congelado, validador de observabilidad, migrations/idempotencia, build, typecheck, suites API/PostgreSQL y Meta backend PostgreSQL/RabbitMQ. El target `api:test` incluye 11 casos CRM del detector. La coincidencia cross-channel requiere mismo provider, E.164 exacto y `verifiedAt` no nulo en ambos perfiles; el resultado sigue siendo `manual_review_required`.

CRM-007 continúa implementado a nivel dominio, sin endpoint de producción ni merge automático; quedan pendientes contrato/query tenant-scoped, auditoría de consulta, merge reversible, review y aceptación.


### TASK-004 — hardening de target membership para role assignment (2026-11-08)

- `TenantRoleAssignmentPolicy` ahora recibe `membershipStatus` junto a `membershipId/userId/tenantId` resueltos por el adapter; valida formato UUID y tenant binding.
- Solo permite estados `invited` y `active`; deniega `suspended`, `revoked`, estado desconocido e IDs malformados.
- Tests nuevos cubren invitación preasignada, denegación de estados suspendido/revocado y validación de IDs.
- No cambia role template ni grants, no implementa persistencia ni endpoint. Source CI pendiente.


### Handoff CRM-007 — API de candidatos de identidad (2026-11-08)

- Se conectó el detector de dominio existente a `POST /v1/tenants/{tenantId}/identity-resolution/candidates` con request estricto, respuesta sin PII y límite 1–100.
- El use case valida permiso/propósito `crm.contacts.identities.read`, vuelve a validar el contexto en una transacción tenant-scoped y escribe auditoría append-only. No usa Idempotency-Key porque la operación es read-only.
- Se añadieron lecturas bulk en los repositorios Contact/ContactIdentity y un adapter PostgreSQL de candidatos que prefiltra por identidad exacta, teléfono E.164 verificado y procedencia; la comparación por nombre queda como señal débil del detector y no causa full scan.
- Migración `0026-crm-duplicate-candidate-indexes.sql` agrega índices parciales para teléfono verificado y sourceReference activa. Batch máximo 10.000; si se supera, la consulta falla cerrada, nunca calcula resultados parciales.
- La respuesta solo expone IDs/versiones/score/reasons y `manual_review_required`. No fusiona, verifica ni muta contactos.
- Se agregaron parser/controller/service tests y extensión a la integración PostgreSQL/RLS A/B. Aún requiere ejecutar el Source CI/Contract CI exacto del commit, revisión independiente, calibración de reglas con datos sintéticos y aceptación del Product Owner.
- CRM-007 queda implementado en código sujeto a CI; TASK-043/TASK-053 no se marcan verified ni accepted. Merge reversible CRM-008..010 sigue sin implementar.


## Ejecución de US-008 — WhatsApp Marketing Messages y costes (2026-11-08)

**Estado comprobado:** `in_progress`; no marcar TASK-017, TASK-018, TASK-055 ni TASK-057 como implemented/verified/accepted por esta revisión.

| Elemento | Estado real | Bloqueo / siguiente condición |
|---|---|---|
| TASK-017 — Marketing Messages adapter | No implementado en el runtime de `apps/api`; no existe `WhatsAppMarketingMessagesAdapter` ni módulo de dominio registrado en `AppModule` según inspección de `app.module.ts` y búsqueda de código en la rama | TASK-010 debe aportar capability/elegibilidad por activo; WAMK-001..003 siguen `catalog-only` con request/response/error schemas pendientes; congelar contratos y obtener gate G0 antes de habilitar rutas |
| TASK-018 — Rate card y cost ledger | No se encontró implementación de rate-card/ledger en el backend; no hay persistencia ni conciliación implementadas | Depende de TASK-017 y de WAMK-004..007, aún `catalog-only`; definir fuente/versionado, moneda, precisión, vigencias e importación de cargos antes de persistir |
| TASK-055 — Migración Marketing Messages | Requisito registrado; no hay adapter ni evidencia de cuenta de prueba autorizada | Depende además de TASK-039 y TASK-056; mantener la fecha anunciada por Meta (2027-10-13) como deadline sujeto a revalidación |
| TASK-057 — Max Pricing | Diseño conceptual documentado, no implementado | Distinguir max/upper bound, estimate, provider-reported actual y reconciled amount; no presentar max price como cargo final |

**Inspección de contratos:** `WAMK-001..005` están declarados en `contracts/openapi/platform-v1.yaml` con `x-contract-status: catalog-only`, `x-contract-ready: false`, `x-implementation-allowed: false` y schemas pendientes. `docs/49` y `docs/55` exigen congelación del contrato por operación y gate G0; no se debe eludir ese control creando controllers/rutas ni habilitando operaciones.

**Investigación adicional:** el material oficial de Meta sobre WhatsApp Max Pricing (16-06-2026) describe un máximo por entrega y cargos reales potencialmente inferiores; por tanto, el modelo debe conservar ambos conceptos y no derivar el cargo real del máximo. Fuente: https://developers.meta.com/resources/videos/whatsapp-max-pricing/. La referencia oficial de la operación Marketing Messages está catalogada en docs/49; la lectura automatizada de esa página fue limitada durante esta revisión, por lo que endpoint, payload, scopes, elegibilidad y errores deben verificarse de nuevo en documentación oficial antes de codificar el adapter. No se adoptan ejemplos de proveedores terceros como contrato de Meta.

**Reutilización inspeccionada:** `AppModule`, `DatabaseModule/DatabaseService`, `IdentityModule`, el patrón NestJS por bounded context y el pipeline `Source CI` existente. Cualquier futura persistencia debe reutilizar `DatabaseService`/tenant context y los mecanismos compartidos de autorización, auditoría, idempotencia y observabilidad; no crear pools, guards ni clientes HTTP paralelos.

**Resultado de esta sesión:** se completó la inspección de historia, dependencias, inventario API, readiness y referencias de precios. No se realizó cambio de runtime ni se ejecutaron tests de producto para US-008. La implementación queda explícitamente bloqueada por readiness/contratos y dependencias upstream; continuar con trabajo seguro de TASK-010, TASK-039 y TASK-056, y reanudar US-008 al satisfacer los gates.
