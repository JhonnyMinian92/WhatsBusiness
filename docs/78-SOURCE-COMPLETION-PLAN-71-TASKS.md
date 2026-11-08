# Plan de cierre del 100% del código fuente — 71 tareas

**Rama objetivo:** `environment/local`  
**Fecha de planificación:** 2026-11-08  
**Alcance:** completar el código de las 71 tareas de software identificadas en el inventario anterior.  
**Fuera de esta fase:** ejecución de pruebas unitarias, integración, contrato, E2E, carga, seguridad y pruebas manuales. Se ejecutarán localmente, una tarea a la vez, después de completar todo el código fuente.

## 1. Objetivo y regla de avance

El objetivo es que las 71 tareas tengan implementación de código real, integrada en la arquitectura y conectada a sus módulos, puertos, adaptadores, persistencia, contratos y configuración que correspondan.

En esta fase no se usarán los resultados de pruebas para bloquear la escritura del código ni para declarar una tarea completada. Tampoco se marcará una tarea como `verified` o `accepted` sin la evidencia correspondiente. Cuando todo el código de una tarea exista, su estado podrá pasar a `implemented`; las pruebas y la aceptación del Product Owner serán etapas posteriores.

### Qué significa 100% de código fuente

Una tarea solo se considera `implemented` cuando:

1. Todos los criterios funcionales de la tarea tienen implementación real, no solo interfaces vacías, mocks, TODOs o respuestas simuladas.
2. Existen las capas necesarias: dominio, aplicación, infraestructura/adaptadores, transporte/API o UI cuando aplique.
3. Los casos de uso están registrados en los módulos y composition roots; las dependencias están conectadas mediante ports/abstractions.
4. Las migraciones, índices, constraints, RLS y persistencia están incluidos cuando la capacidad necesita datos durables.
5. Los contratos OpenAPI/AsyncAPI, DTOs, schemas y eventos están sincronizados con la implementación.
6. Existen manejo de errores, idempotencia, retry/reconciliation, auditoría, telemetría y controles tenant/actor/purpose/permission donde corresponda.
7. No existen rutas de bypass, capacidades Meta supuestas, escrituras externas inseguras ni integraciones que devuelvan éxito falso.
8. La configuración, secretos por referencia, feature flags, documentación técnica y runbooks necesarios están incorporados.

**No es requisito de esta fase:** que las pruebas pasen, que una cuenta Meta real esté conectada, que haya credenciales productivas, que se despliegue el sistema o que el Product Owner acepte el resultado. Los conectores externos deben quedar implementados y fail-closed, listos para habilitarse con evidencia y configuración autorizadas.

## 2. Línea base de las 71 tareas

El inventario anterior identificó 64 tareas incompletas dentro de TASK-001..080: 32 sin código fuente y 32 con código parcial. Se agregan TASK-081..087, correspondientes a la ampliación de CRM Intelligence, para un total de 71.

### Sin código fuente en el último inventario

`TASK-006, TASK-007, TASK-008, TASK-011, TASK-012, TASK-013, TASK-016, TASK-017, TASK-018, TASK-022, TASK-023, TASK-044, TASK-045, TASK-046, TASK-048, TASK-049, TASK-050, TASK-051, TASK-054, TASK-055, TASK-057, TASK-059, TASK-060, TASK-064, TASK-065, TASK-067, TASK-068, TASK-071, TASK-072, TASK-076, TASK-077, TASK-078`

### Con código parcial en el último inventario

`TASK-001, TASK-003, TASK-009, TASK-010, TASK-014, TASK-015, TASK-019, TASK-020, TASK-021, TASK-024, TASK-025, TASK-026, TASK-028, TASK-029, TASK-030, TASK-031, TASK-032, TASK-043, TASK-047, TASK-052, TASK-053, TASK-056, TASK-058, TASK-062, TASK-063, TASK-069, TASK-070, TASK-073, TASK-074, TASK-075, TASK-079, TASK-080`

### Ampliación CRM Intelligence

`TASK-081..087` — se incluyen las siete tareas de CRM Intelligence. Su implementación respetará la especificación de [docs/62-CRM-MACHINE-LEARNING-STRATEGY.md](62-CRM-MACHINE-LEARNING-STRATEGY.md). Como esos siete IDs no están normalizados en la matriz principal de [docs/11-TASK-BACKLOG.md](11-TASK-BACKLOG.md) ni en [docs/53-TASK-WORK-PACKAGES.md](53-TASK-WORK-PACKAGES.md), el primer trabajo de este paquete será importar sus descripciones y criterios exactos desde el registro de CRM Intelligence. No se inventarán equivalencias entre TASK y casos de uso.

### Exclusiones deliberadas

- TASK-002, TASK-004, TASK-005, TASK-027, TASK-033 y TASK-042 quedaron fuera de las 71 porque el inventario anterior encontró código base implementado. Se reutiliza y se integra lo que ya existe; su exclusión no significa que estén verificadas o aceptadas.
- TASK-034..041, TASK-061 y TASK-066 no forman parte de este objetivo de 71 tareas de código: son especificación/arquitectura, discovery o entregables operativos/de evidencia. Sus decisiones y prerequisitos documentales sí se respetan.

**Reconciliación obligatoria:** el repositorio ha recibido cambios después del corte del inventario. Al comenzar la ejecución se debe inspeccionar el HEAD vigente de `environment/local` y clasificar de nuevo cada una de las 71 tareas como sin fuente, parcial o fuente completa. Esta comprobación no reduce ni aumenta el alcance sin registrar la razón; evita reescribir trabajo que ya llegó al repositorio.

## 3. Orden de ejecución por frentes

Los frentes se ordenan por dependencias del DAG. Los conteos de esta tabla suman exactamente 71 tareas y cada ID aparece una sola vez.

| Frente | Tareas | Cantidad | Resultado de código |
|---|---|---:|---|
| A. Fundaciones, seguridad, eventos y privacidad | TASK-001, 003, 006, 007, 008, 028, 029, 030, 031, 032, 059, 060 | 12 | Tenant runtime, aislamiento, OAuth/vault inicial, event bus, observabilidad, audit, secure SDLC, privacy lifecycle y benchmark tooling |
| B. Meta Control Plane y gobierno de capacidades | TASK-009, 010, 053, 054, 055, 056, 057, 065, 076 | 9 | Assets, capability/version registry, Embedded Signup, Marketing Messages, Max Pricing/cost ledger y change intelligence |
| C. Adaptadores de canales y adquisición | TASK-011..023 | 13 | WhatsApp, templates, Flows, Messenger/Pages, Instagram, Lead Ads y lead lifecycle |
| D. CRM, Inbox e inteligencia CRM | TASK-043..047, TASK-081..087 | 12 | Identidad multicanal/merge, pipeline, inbox/composer/assignment/handoff y CRM Intelligence |
| E. Automation y AI Assistance | TASK-048..051 | 4 | Workflow builder/runtime, scheduler/retries, AI Gateway y asistencia conversacional con controles |
| F. Ads, CAPI y medición de campañas | TASK-024..026, TASK-067..073, TASK-077..079 | 13 | Campaign lifecycle, spend guardrails, CAPI, Campaign Intelligence, insights, creative lab, experimentación, attribution y fatigue |
| G. SaaS, partners, Developer Platform y Agent Gateway | TASK-052, 058, 062, 063, 064, 074, 075, 080 | 8 | Administración SaaS, partner grants, API pública, billing/usage, accesibilidad y ejecución segura de herramientas/agentes |

### Frente A — Fundaciones, seguridad, eventos y privacidad

Orden interno recomendado:

1. Completar TASK-001 y TASK-003: tenancy, ownership, RLS, contextos de request/worker, aislamiento de jobs/cache/storage/telemetry y lifecycle durable.
2. Completar TASK-006 y TASK-007: OAuth state/PKCE, callback, token vault, KMS/secret-manager ports, rotación, revocación y reconciliación.
3. Completar TASK-008: onboarding saga y pasos de Embedded Signup, dejando proveedores externos configurables y fail-closed.
4. Completar TASK-028: event bus, outbox/inbox, consumers, dedupe, retry, DLQ y replay con autorización.
5. Completar TASK-029..032: tracing/metrics/logging, audit append-only/reporting, secure SDLC source configuration y privacy/export/delete/revocation.
6. Completar TASK-059: policy engine de retención y rights workflow conectado a todos los stores y derivados.
7. Completar TASK-060: scripts y harnesses reproducibles de carga/capacidad. En esta fase se construye el código de benchmark; la medición real se deja para la fase posterior.

**Bloqueos que no detienen el código:** KMS definitivo, proveedor OIDC real, política legal final de retención, infraestructura desplegada y objetivos RPO/RTO aprobados se representan mediante ports/configuración explícita. No se inventan secretos, plazos legales ni métricas.

### Frente B — Meta Control Plane y gobierno de capacidades

1. Completar TASK-009/010: registry de activos, grants, capabilities y explainability con evidencia versionada y vencimiento.
2. Completar TASK-053: grafo de identidad provider-scoped; BSUID y teléfono permanecen namespaces distintos; merge reversible y provenance.
3. Completar TASK-054: adapter/evaluación de Embedded Signup v4 y onboarding multi-producto, por auth mode y elegibilidad.
4. Completar TASK-056: registro por producto/operación de API version, scopes, asset tasks/grants, app mode/review, access tier, país y sunset.
5. Completar TASK-055/057: Marketing Messages API, eligibility/routing, rate cards versionadas y ciclo de coste estimado/máximo/real/conciliado.
6. Completar TASK-065/076: proceso técnico de changelog/sunset, impacto sobre adapters/tenants y registro de migraciones pendientes.

No se permite usar una sola versión Graph API global para todos los productos. Una capability desconocida se mantiene deshabilitada; el código no debe inferir permisos por la mera presencia de un token.

### Frente C — Adaptadores de canales y adquisición

Implementar por contratos y reutilización del transport común, pero manteniendo semántica y payload nativos específicos por producto:

- WhatsApp: TASK-011..013 — envío, tipos de mensaje, media lifecycle, delivery state machine y policy.
- WhatsApp Templates y Flows: TASK-014..016 — schema, revisiones, quality, variables, preview, cifrado y Data Exchange.
- WhatsApp Marketing: dependencias con TASK-017..018 y TASK-055/057 — adapter Marketing Messages, elegibilidad, pricing/rate card y cost ledger.
- Facebook/Messenger e Instagram: TASK-019..021 — login modes, capabilities, Page tasks, ventanas, publish/comments/DM/insights cuando la operación tenga contrato y evidencia.
- Leads: TASK-022..023 — Lead Ads webhooks/retrieval, lifecycle, provenance, dedupe y routing.

El alcance de cada adapter debe conservar diferencias de auth mode, scopes, grants, API version, rate limit, payload y estado remoto. Nunca se debe simular que una operación de Meta tuvo éxito.

### Frente D — CRM, Inbox e inteligencia CRM

1. Completar TASK-043: resolución de identidad multicanal, dedupe por namespaces, provenance y merge reversible.
2. Completar TASK-044: pipeline, opportunities, actividades, timeline, transiciones, permisos y asignación.
3. Completar TASK-045..047: modelo canónico de conversaciones/mensajes con extensiones nativas, persistencia, search/composer UI, teams, assignment, internal notes, ownership lease y handoff.
4. Implementar TASK-081..087 como capacidades internas del bounded context CRM usando ports: Predictor, FeatureSnapshotRepository, ModelRegistry, ModelArtifactStore, ModelEvaluator y Clock.
5. Los modelos se entrenan offline y de forma reproducible; el serving es desacoplado. Incluir feature schemas versionados, provenance, tenant scope, RLS, dataset/artifact checksums, model promotion/rollback, expiración, reason codes, fallback determinista y monitoreo de drift/skew.
6. CRM continúa siendo la fuente de verdad. Las predicciones no modifican permisos, consentimiento ni ejecutan acciones irreversibles. No introducir LLM/RAG ni proveedores generativos en TASK-081..087.

La implementación ML no se bloquea por no disponer aún de datos reales entrenables: se completa el pipeline, contratos, ports, storage, evaluación y runtime con datos/fixtures sintéticos no sensibles. La calidad predictiva real se medirá después.

### Frente E — Automation y AI Assistance

- TASK-048: definición visual/serializable de workflows, versionado, validación, simulación y publicación.
- TASK-049: runtime/scheduler, ejecución durable, retries, timeout, idempotencia, DLQ, replay, pause/kill switch y audit.
- TASK-050: AI Gateway con adapters de proveedores desacoplados, presupuesto/ledger, timeout, redaction, fallback y policy.
- TASK-051: reply suggestions, rule chatbot y human handoff; no-auto-send por defecto, protección ante prompt injection y respeto a la autoridad de respuesta del Inbox.

Automation determinista permanece separada de CRM Intelligence y AI Assistance. Cada dominio conserva ownership y contratos propios.

### Frente F — Ads, CAPI y medición

1. Completar TASK-024/025: persistencia tenant-scoped, campaign use cases, approval consumption, outbox/worker, adapter oficial, pause/kill switch remoto, reconciler, insights y spend ledger.
2. Completar TASK-026 y TASK-068: conversion event gateway, consent check en el momento de envío, event_id estable, dedupe, provenance y CRM closed-loop conversions.
3. Completar TASK-067/071/072: snapshots, taxonomy, diagnostics/recommendations, Insights ingestion/checkpoints y optimizer con aritmética decimal, límites y concurrency safeguards.
4. Completar TASK-069/070/073/079: Creative Lab, provenance/rights/brand review, variantes, preview/Advantage+ capabilities, fatigue pipeline y controlled experiments.
5. Completar TASK-077/078: incrementality/attribution framework y dashboard de salud/resultados comerciales separando métricas Meta de outcomes CRM.

Se preserva PD-024: el máximo de incremento es 20% por operación y acumulado en ventana móvil de 24 horas respecto al baseline. Las recomendaciones de IA nunca escriben directamente a Meta. Los cambios externos requieren actor, grant, capability vigente, aprobación, idempotencia y reconciliación.

### Frente G — SaaS, partners, Developer Platform y Agent Gateway

1. Completar TASK-052: lifecycle/entitlements/planes, usage ledger y soporte JIT con separación de funciones.
2. Completar TASK-058: persistencia/RLS de partner grants, partner context runtime, revocación, expiración, approval consumption, audit/outbox e invalidación durable. Completar el código parcial del [PR #4](https://github.com/JhonnyMinian92/WhatsBusiness/pull/4), sin reiniciar su trabajo.
3. Completar TASK-062: API pública versionada, API credentials/OAuth, scopes y webhooks salientes firmados, retry, idempotencia y rate limits.
4. Completar TASK-063: subscription/seat/usage ledger, entitlements, quotas, trial/suspension e invoice integration port, sin inventar precios o impuestos.
5. Completar TASK-064: implementar los controles UI/accessibility necesarios para journeys principales conforme al objetivo WCAG 2.2 AA. Las pruebas de auditoría accesible se posponen.
6. Completar TASK-074/075/080: Meta Ads MCP, Business Agent ownership/handoff y Agent Tool Gateway. Completar el código parcial del [PR #5](https://github.com/JhonnyMinian92/WhatsBusiness/pull/5), conectando approvals, OAuth/resource server, capability resolver, transport, durable Inbox consumer/outbox y kill switch. No habilitar external writes mientras falte evidencia/approval.

## 4. Dependencias críticas

- Tenant/Identity: TASK-001 → TASK-003; TASK-001 + TASK-004 existente → TASK-006 → TASK-007 → TASK-008 → TASK-009 → TASK-010.
- Event platform: TASK-027 existente → TASK-028 → TASK-013/TASK-019/TASK-022/TASK-045/TASK-049/TASK-062.
- Seguridad y privacidad: TASK-029/030/031/032 → TASK-059; cada módulo nuevo debe reutilizar permisos, redaction, audit, outbox e idempotency existentes.
- CRM/Inbox: TASK-042 existente → TASK-043/044; TASK-045 → TASK-046/047 → TASK-051/075.
- Ads: TASK-024/025/026 + TASK-056/060 → TASK-067/071/072; TASK-068 depende además de CRM y privacy; TASK-074/080 se completan después de los límites de approval y execution gateway.
- Creative Lab: TASK-069 → TASK-073 → TASK-079 → TASK-070; TASK-070 conserva sus dependencias sobre Campaign Intelligence y el provider experiment reference.
- CRM Intelligence: TASK-042..044/eventos CRM y datos autorizados → feature snapshots → training/evaluation → model registry/artifacts → inference serving → UI/automation consumers.

El orden visual de los frentes no anula el DAG: un paquete puede avanzar en diseño/código de dominio mientras su dependencia externa sigue en `unknown`, pero no puede exponer una operación que requiera una capability no satisfecha.

## 5. Paralelismo y control de integración

Se permiten frentes paralelos solo cuando los límites de escritura y contratos sean independientes:

- Plataforma/seguridad/eventing.
- Meta control plane/capabilities.
- Canales/adapters.
- CRM/Inbox/CRM Intelligence.
- Ads/Campaign Intelligence.
- SaaS/Developer/Agent integrations.

Reglas obligatorias:

1. Un owner responsable por cada TASK/work package y un reviewer distinto.
2. Cada trabajo paralelo usa branch/worktree aislada. Si no hay aislamiento real, el análisis puede ser paralelo, pero las escrituras se serializan.
3. OpenAPI, AsyncAPI, schemas compartidos, migraciones transversales y catálogos de permisos tienen un único contract owner por cambio.
4. El integrador revisa cada diff y commit, integra paquetes uno por uno y actualiza la rama `environment/local`; no se permiten commits concurrentes sobre el mismo ref.
5. Antes de crear código se busca reutilización en Nx graph, modules, ports, use cases, repositories, validators, policies, adapters y componentes UI.
6. No se divide artificialmente una tarea para mostrar progreso; cada paquete cierra todos sus criterios de código fuente.
7. Los PR #4 y #5 son trabajo en curso que debe completarse/revisarse e integrarse; no se duplican sus módulos.
8. No se afirmará que se usaron agentes independientes si la herramienta/equipo no los proporciona. La revisión propia se etiqueta como self-review, no como independiente.

## 6. Documentación y estado durante la ejecución

En cada paquete integrado se actualizarán, en el mismo cambio lógico:

- `docs/11-TASK-BACKLOG.md`: estado `in_progress`/`implemented`, dependencias y alcance real.
- `docs/18-EXECUTION-GRAPH.md`: DAG si cambian las dependencias.
- `docs/19-TRACEABILITY-MATRIX.md`: US/AC/TASK → módulo → API/event → evidencia.
- `docs/47-API-INVENTORY-AND-TASK-MAP.md`, OpenAPI y AsyncAPI cuando cambie una operación o evento.
- Registro de trabajo de cada TASK y memoria de corto plazo.
- Documento de implementación/handoff para cada dominio que requiera decisiones o describa código parcial.

No se cambiará el estado a `verified` por haber creado código ni a `accepted` sin aceptación explícita.

## 7. Fase final: pruebas locales, una por una

Esta fase empieza solo cuando las 71 tareas estén en `implemented` en lo que respecta a código fuente.

Orden de ejecución sugerido:

1. Preparar un único entorno local reproducible, verificar configuración/secret references y aplicar migraciones desde una base limpia.
2. Ejecutar una por una las suites por TASK siguiendo el DAG; registrar comando, commit, resultado y log.
3. Cuando una TASK falle, registrar el fallo, corregir solo el ámbito responsable y repetir esa TASK antes de avanzar a las dependientes.
4. Ejecutar luego los contract tests API/event, integraciones PostgreSQL/RLS/outbox/broker, adapters Meta con fixtures/sandbox autorizado y pruebas UI/E2E.
5. Finalmente ejecutar security, carga, recuperación/DR y accesibilidad; los ejercicios que requieren credenciales, cuentas reales, aprobación o hardware se anotan como dependencias externas, no se simulan como PASS.
6. Después de las pruebas, pasar a revisión independiente, aceptación del Product Owner y gates de despliegue.

**Regla de separación:** un fallo de pruebas en esa última fase no borra que el código fuente esté implementado; sí impide declarar la tarea verificada o aceptada y requiere corrección antes de continuar a sus dependencias cuando exista riesgo funcional o de seguridad.

## 8. Criterio de cierre del plan

El objetivo de esta campaña se cumple cuando:

- Las 71 tareas de la línea base están reconciliadas contra el HEAD de `environment/local`.
- Los 71 paquetes tienen fuente completa conectada a la arquitectura y marcada `implemented`.
- No hay contratos, migraciones, adapters, módulos, componentes UI o eventos requeridos sin implementar.
- Los PR en curso y los cambios paralelos se integraron sin duplicar código ni perder trazabilidad.
- Docs 11/18/19/47 y la memoria reflejan fielmente el código existente.
- Las pruebas siguen explícitamente pendientes y la siguiente etapa queda definida como ejecución local, una tarea a la vez.

Este cierre no representa `verified`, `accepted` ni autorización de producción.
