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
- **Telemetría parcial:** counters/histograms Prometheus in-memory y endpoint HTTP `GET /metrics` implementados; Source CI #403 SUCCESS para endpoint. Los gauges SQL agregados (outbox pending/blocked, leases activos/expirados, dead letters, edad y replays) pasaron Source CI #432 SUCCESS. Los gauges RabbitMQ se cambiaron a Management HTTP API para no compartir transporte AMQP con worker: identidad `monitoring` dedicada, permisos AMQP vacíos, HTTPS remoto y prueba de integración broker real. CodeQL #6 SUCCESS; Source CI #466 pendiente/queued para commit `e00ec2d0`. Source CI #463/CodeQL #3 verificaron una implementación AMQP anterior, ahora reemplazada. Dashboard Grafana, alert rules y runbook están versionados, aún no importados ni probados en stack real. La alerta de target ausente forma parte del HEAD actual. Faltan unacked/consumer lag autoritativo, alert routing, SLO cuantificados y despliegue/validación operacional.
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
