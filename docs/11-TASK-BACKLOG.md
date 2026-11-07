# 11 — Backlog técnico trazable

## Convenciones
Cada tarea requiere owner, prioridad, estimación, dependencias, DoR, entregables, pruebas, DoD y un control asociado. Estados permitidos: `proposed`, `ready`, `in_progress`, `blocked`, `review`, `done`, `cancelled`.
Bugs `BUG-xxxx`; cambios `CR-xxxx`. Los controles listados son controles preventivos iniciales, no bugs confirmados.

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

## Requisitos comunes de cada tarea
**DoR:** historia aprobada; alcance y owner; fuentes Meta revisadas; dependencias resueltas; threat/data classification; criterios testeables; diseño/ADR si cambia arquitectura.

**DoD:** código revisado; unit/integration/contract/security tests; observabilidad; migración/backward compatibility; docs/runbook; auditoría; no secrets; aceptación QA/product/security; evidencia enlazada.

## Registro de bugs iniciales
No se declara que los bugs preventivos sean defectos encontrados. Son escenarios de riesgo que deben probarse y, si se reproducen, convertirse en BUG real con pasos/evidencia.

| ID | Riesgo a probar | Severidad inicial | Estado |
|---|---|---|---|
| BUG-0001 | Falta de tenant context | S0 si permite fuga | preventivo |
| BUG-0002 | Bypass de aprobación | S0/S1 | preventivo |
| BUG-0003 | Replay de OAuth callback | S1 | preventivo |
| BUG-0004 | Operar asset sin grant vigente | S1 | preventivo |
| BUG-0005 | Payload universal pierde semántica | S2 | preventivo |
| BUG-0006 | Confundir accepted con delivered | S2 | preventivo |
| BUG-0007 | Envío de template no aprobado | S1 | preventivo |
| BUG-0008 | Costos hardcodeados | S2 | preventivo |
| BUG-0009 | Suponer paridad Instagram login | S2 | preventivo |
| BUG-0010 | Lead perdido/duplicado | S1/S2 | preventivo |
| BUG-0011 | Gasto publicitario sin autorización | S0 | preventivo |
| BUG-0012 | Webhook spoof/replay | S1 | preventivo |
| BUG-0013 | Operación sin audit trail | S1/S2 | preventivo |

## Registro de cambios iniciales
Los CR representan decisiones pendientes de diseño/validación; no se ejecutan automáticamente. Deben cerrarse con ADR, responsable y evidencia.
