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
| TASK-039 | Architecture spike y ADR-011..017 | PD-007, PD-008 | Build/deploy local/VPS de prueba, footprint medido, contratos y trade-offs documentados |
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
