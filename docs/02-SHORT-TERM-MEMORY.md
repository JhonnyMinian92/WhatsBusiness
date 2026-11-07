# 02 — Memoria a corto plazo

> Estado operativo mutable. Actualizar al inicio y al cierre de cada bloque de trabajo. Este archivo es el handoff entre agentes y sesiones.

## Sesión actual
- Iteración: DOC-AGENT-OS / refuerzo agent-first.
- Rama objetivo: `environment/local`.
- Rama de integración: `environment/develop` (no tocar directamente).
- Objetivo: permitir que Codex, Claude Code y agentes compatibles entiendan el producto sin contexto de chat y ejecuten cambios trazables.
- Estado: sistema de entrada, ejecución, grafos, trazabilidad y aceptación documentado.
- Implementación del producto: no declarada ni auditada por este bloque documental. No inferir porcentaje.

## Trabajo completado en esta sesión
- [x] Crear contrato universal `AGENTS.md`.
- [x] Crear instrucciones puente `CLAUDE.md`, `GEMINI.md` y `.github/copilot-instructions.md`.
- [x] Definir bootstrap, jerarquía de fuentes, ciclo de ejecución y protocolo de handoff.
- [x] Añadir grafo de dependencias Mermaid para EP/TASK.
- [x] Añadir matriz de trazabilidad requisito → historia → tarea → módulo → test → evidencia.
- [x] Definir estados distintos: implementado, verificado y aceptado.
- [x] Definir criterios objetivos de producto terminado y aprobación exclusiva del propietario.
- [x] Actualizar índice y aclarar que una petición explícita de implementación habilita el trabajo solicitado.

## Próxima acción obligatoria ante la siguiente solicitud de producto
1. Leer `AGENTS.md` y `docs/17-AGENT-OPERATING-MODEL.md`.
2. Inspeccionar árbol, stack, código, tests, workflows, migraciones, configuración y git status reales.
3. Comparar la implementación existente con historias, tareas y criterios; no asumir que el backlog representa el código actual.
4. Elegir el siguiente bloque solicitado y desbloqueado del grafo; implementar y probar el cambio end-to-end.
5. Actualizar los registros afectados y dejar handoff reproducible.

## Bloqueos/validaciones aún abiertos
- Credenciales, Meta App, Business Verification, App Review y permisos reales no verificados aquí.
- Versiones, límites, precios y elegibilidad de Meta deben validarse con fuentes oficiales actuales y cuenta real.
- Decisiones de stack, infraestructura, SLO/RPO/RTO y operación deben contrastarse con el repositorio y requisitos cuantificados.
- No se ha realizado auditoría técnica completa del código ni se declara ningún TASK implementado/verificado por esta sesión.

## Riesgos de proceso
| ID | Riesgo | Control |
|---|---|---|
| RSK-006 | Agentes divergen en instrucciones | AGENTS.md canónico + archivos puente |
| RSK-007 | Backlog confundido con realidad | inspección de código y evidencia por tarea |
| RSK-008 | Dependencias omitidas | grafo upstream/downstream obligatorio |
| RSK-009 | Falsa declaración de 100 % | gates y aprobación explícita del propietario |
| RSK-010 | Cambios sin memoria/handoff | actualización atómica de registros |

## Último handoff
- Archivos añadidos: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `docs/17-AGENT-OPERATING-MODEL.md`, `docs/18-EXECUTION-GRAPH.md`, `docs/19-TRACEABILITY-MATRIX.md`, `docs/20-PRODUCT-ACCEPTANCE.md`.
- Registros sincronizados: `docs/README.md`, `docs/02-SHORT-TERM-MEMORY.md`, `docs/11-TASK-BACKLOG.md` y `docs/15-ROADMAP-AND-ADVANCEMENT.md`.
- Validación GitHub: `environment/local` está 31 commits adelantada respecto de `master`, sin commits detrás; `environment/develop` permanece creada.
- Archivos de instrucciones y grafos verificados por lectura posterior a la escritura.
- Siguiente tarea técnica: inspección completa del repositorio y reconciliación de TASK-001..033 con código real, antes de asignar estados de implementación.


## Ampliación del modelo de equipo (2026-11-06)
- [x] Definir organigrama por departamentos y responsabilidades.
- [x] Definir modos single-agent, lead+specialists, parallel workstreams, review-only e incident mode.
- [x] Definir ownership de paquetes, paths exclusivos, aislamiento de worktrees y reglas para serializar escrituras.
- [x] Definir playbooks para Product/PM, BA, Marketing, UX, Architecture, Engineering, Meta, Data, QA, Security, Privacy, SRE, Finance, Support y Documentation.
- [x] Definir validación cruzada independiente, revisión adversarial, estados y gestión de hallazgos.
- [x] Definir límites de autoridad, privilegio mínimo, stop conditions y acciones externas reservadas.
- [x] Definir gates G0-G8, RAID, plantillas YAML de trabajo y revisión.
- [ ] Aplicar el modelo a la primera auditoría técnica real y ajustar los roles/paquetes con evidencia del repositorio.

Estado: documentación de gobierno ampliada; no implica que exista una infraestructura de ejecución multiagente ni que se hayan ejecutado agentes paralelos en esta sesión.


## Handoff — respuestas iniciales del propietario y baseline (2026-11-06)

### Decisiones recibidas
- PD-001..PD-011 registradas en docs/29-OWNER-DECISIONS.md.
- SaaS + plataforma interna EcuApp; greenfield; todo Meta; backend + web panel + CRM + omnichannel inbox; IA básica extensible; VPS; stack recomendada por arquitectura; entrega por fases; agentes autónomos para decisiones técnicas reversibles y trabajo no bloqueado.
- Aclaración de IA interpretada como "con visión para automatización con IA"; confirmación literal pendiente solo si la interpretación fuera incorrecta.

### Entregables de esta iteración
- docs/29: decisiones confirmadas y pendientes.
- docs/30: arquitectura y stack propuesta (NestJS/TypeScript, Angular, PostgreSQL, Redis, RabbitMQ, Docker Compose/VPS, OIDC candidato, observabilidad).
- docs/31: fases 0–8 y gates de salida.
- Cuestionario actualizado con 10/20 respuestas recibidas.

### Próximo trabajo
1. Completar requisitos funcionales detallados de CRM, Inbox, automatización y panel.
2. Reconciliar las 17 historias/33 tareas originales con el alcance nuevo y ampliar criterios de aceptación.
3. Convertir ADR-011..017 de propuestas a decisiones solo tras architecture spike y evaluación operativa.
4. Resolver preguntas pendientes que bloquean diseño comercial, retención, sizing y producción.
5. No crear código de producto hasta que la arquitectura/stack tengan evidencia suficiente; el propietario sí autorizó continuar la especificación y el trabajo técnico no bloqueado.

### Estado real
- Greenfield confirmado por el propietario; el árbol auditado no contiene código fuente.
- Stack y topología son propuestas, no implementaciones ni pruebas.
- No se afirma que existan agentes independientes ejecutando en paralelo.


## Handoff — decisiones delegadas y arquitectura adoptada (2026-11-06)

### Objetivo
El propietario autorizó aplicar todas las recomendaciones y delegó las mejores decisiones técnicas, con exigencia de evidencia y sin inventar métricas.

### Trabajo confirmado en GitHub en environment/local
- Actualizado docs/29 con decisiones PD-012..PD-023: ICP inicial, modelo comercial, costes Meta, locale, tenant/agency model, privacidad, aprobaciones, conectores, infraestructura y gobierno de releases.
- Creado docs/32 con fuentes/evidencia Meta, LOPDP/SPDP, OWASP ASVS 5.0.0 y SRE.
- Actualizado docs/30 con modular monolith, stack adoptada, límites de dominio, layout de repo, aislamiento, eventos, Meta adapters y ADR-011..020 accepted as direction.
- Actualizado docs/31 con fases 0–8 y gates.
- Actualizado docs/05 para evitar contradicción sobre microservicios.
- Actualizado docs/09 con Meta v27, Embedded Signup v4, BSUID, WAAC/PMA, Marketing Messages API sunset y Access Tier.

### Decisiones de diseño
- Modular monolith + API/worker/scheduler; extracción de microservicios solo con evidencia.
- NestJS/TypeScript, Angular, Nx/pnpm, PostgreSQL, Redis, RabbitMQ, OIDC/Keycloak, Docker, OpenTelemetry.
- Ecuador PYMES de comercio/servicios; agencias secundarias; hipótesis pendiente de discovery de mercado.
- Subscription per tenant + seats + usage; Meta pass-through separado. Sin pricing inventado.
- es-EC/USD/America-Guayaquil defaults configurables.
- Shared PG tenant_id + server-side auth + RLS; agency grants revocables; DB dedicada enterprise.
- Data minimization/configurable retention; legal review pendiente; no periodos inventados.
- Meta identities provider-scoped (BSUID), account graph flexible (WAAC/PMA), Marketing Messages API.
- Seguridad ASVS 5.0.0; UI WCAG 2.2 AA.
- Candidate SLO 99.9%, RPO 15m, RTO 4h; no SLA ni performance measure.

### Próximo bloque prioritario
1. Synchronize backlog, traceability, questionnaire, QA, SRE, privacy and agent instructions.
2. Run static consistency/read-after-write validation of all changed docs.
3. Complete TASK-039 architecture spike; only then begin production scaffold, unless owner explicitly requests a specific implementation slice.
4. Create detailed requirements and acceptance criteria for the first vertical slice.

### Estado real
- Greenfield; no backend/frontend implementation.
- No product tests, benchmark, VPS sizing, restore drill, pentest, Meta App Review, real Business account validation or production deployment performed.
- No parallel independent agent execution was available in this interaction; roles are documented, not simulated as real reviewers.
- Branch remains environment/local; master/develop untouched.


## Handoff final de la iteración documental (2026-11-06)
- [x] PD-012..PD-023 adoptadas y explicadas con reservas explícitas.
- [x] Investigación actualizada en docs/32; ADR formales docs/33.
- [x] Arquitectura y plan maestro docs/30/31 actualizados; docs/05 alineado.
- [x] Catálogo Meta docs/09 alineado.
- [x] AGENTS, contexto, memoria central, dominio, seguridad, QA y SRE sincronizados.
- [x] Backlog TASK-053..065, historias US-025..027, trazabilidad y cuestionario sincronizados.
- [x] Auditoría documental e índice actualizados.
- [x] Read-after-write validation and branch comparisons completed; results recorded in docs/14.
- [ ] TASK-039 architecture spike, TASK-060 load test, TASK-061 restore drill, formal privacy review and real Meta account eligibility are not performed.

Estado de producto: no implementation, no runtime metrics, no deployed environment, no production acceptance. All added tasks remain proposed until actual code and evidence exist.


### Validation result at handoff
- master → environment/local: ahead, 0 behind at validation checkpoint.
- environment/develop → environment/local: ahead, 0 behind at validation checkpoint.
- master and environment/develop: identical at validation checkpoint.
- Read-after-write checks completed for all changed documentation groups; see docs/14 AUD-029.

- INEC REEM 2025 macro evidence added to docs/32; US-028/TASK-066 created to validate ICP and willingness-to-pay before pricing.


## Campaign and Meta AI baseline (2026-11-06)
- Read docs/34-META-ADS-AI-AND-PLATFORM-OUTLOOK.md, docs/35-REFERENCE-PROJECTS-TECHNICAL-BENCHMARK.md and docs/36-CAMPAIGN-INTELLIGENCE-AND-GUARDED-SCALING.md before working on Ads/creative/agents.
- Separate Meta Delivery Plane (Andromeda/GEM are internal Meta systems) from WhatsBusiness Intelligence Plane (Insights + CRM/CAPI outcomes + experiments).
- Meta documents learning at ad set level; approx. 50 optimization events / 7 days is contextual learning guidance, not a universal rule for every goal/account. Avoid overlapping adsets and unnecessary live winner edits.
- PD-024: max +20% per automatic budget change and max +20% cumulative within rolling 24h. This is a WhatsBusiness owner guardrail, not a Meta official universal budget-increase rule.
- New creative tests use isolated test cells/Meta supported experiments; no default mutation of winning/learning ad sets. Creative generation requires provenance, rights, brand/claim review, preview and human approval.
- Meta Ads MCP and Business Agent integration are optional/eligibility dependent and must route through the same internal approval gateway and conversation ownership model.
- OpenWA/WhatsApp Web automation is prohibited for WhatsBusiness production. Use official Meta APIs only.
- Benchmark of Chatwoot, Twilio Node SDK, httpSMS, Android SMS Gateway and OpenWA is summarized in docs/35; no code copied, no project builds run.
- US-029..032 / TASK-067..080 added; all proposed, no feature implementation performed.

## Handoff — Meta Ads AI, Campaign Intelligence y repositorios de referencia (2026-11-06)

### Archivos nuevos
- docs/34-META-ADS-AI-AND-PLATFORM-OUTLOOK.md
- docs/35-REFERENCE-PROJECTS-TECHNICAL-BENCHMARK.md
- docs/36-CAMPAIGN-INTELLIGENCE-AND-GUARDED-SCALING.md

### Archivos ampliados
- PD-024 en docs/29: +20% por operación y +20% acumulado por ventana móvil de 24h como regla interna del propietario, no como regla universal Meta.
- docs/32 con META-OBS-010..020 sobre Andromeda 2024/2026, GEM, Ads MCP, Business Agent, Advantage+ Creative, learning, budget sharing y política WhatsApp.
- docs/33 con ADR-021/022.
- US-029..032 y TASK-067..080.
- docs/30, docs/05, docs/06, docs/08, docs/09, docs/12, docs/13, docs/18, docs/19, docs/31, AGENTS, META_SERVICES y docs/README sincronizados.

### Reglas de producto críticas
- Andromeda/GEM son sistemas internos Meta, no APIs a controlar. Feed eligible diverse creatives and lawful quality conversion signals; no internal score claims.
- Learning is at ad set level; ~50 optimization events/7d is contextual, not universal. Avoid overlap and significant unneeded edits. Protect winners.
- New creatives go through Creative Lab, provenance, brand/policy review, preview, approval and isolated test cell.
- Campaign learning combines Meta Insights + CRM/CAPI outcomes; distinguish reported attribution from incremental causal evidence.
- PD-024 enforced server-side, with concurrency lock and no split-transaction bypass.
- Meta Ads MCP/Business Agent integration behind the internal agent gateway and conversation ownership leases.
- OpenWA is never a production WhatsApp transport.

### Estado real y siguiente paso
- All US-029..032 and TASK-067..080 are proposed only. No campaign engine, optimizer, creative generator, MCP gateway, live API adapter, or tests exist yet.
- Next engineering sequence: complete TASK-039 architecture spike; then prioritize TASK-072/068 (data/signals), TASK-067 (engine/contracts), TASK-069/070 (Creative Lab/tests), TASK-071 (guardrails), followed by TASK-073/074/075/080.
- Before any Ads write: real Meta app access, Marketing API tier, permissions, scopes, account eligibility, approval matrix and test account must be verified.
- The +20% cap cannot be bypassed by an agent, parallel task, retry or split operation.
- The owner retains approval of production changes, ad spend, campaign publication and final product acceptance.


Branch compare refreshed after handoff documentation: master → environment/local and environment/develop → environment/local are each ahead 161 / behind 0; master and environment/develop remain identical.

Latest GitHub compare after validation-record commits: environment/local is ahead 163 / behind 0 of master and environment/develop; master and environment/develop remain identical. Documentation-only changes; no product implementation/tests/benchmark performed.


## Handoff — kickoff documental y readiness (2026-11-06)

- Se añadieron docs/37..41 como especificaciones funcionales iniciales para Platform Identity/Tenancy, CRM, Inbox, Automation y AI Assistance.
- Se añadieron docs/42..44 para modelo lógico de datos, contratos y threat model/data inventory.
- Se añadió docs/45 con protocolo reproducible del Architecture Spike y docs/46 con decisión de inicio condicionado, work packets y G0.
- Se añadieron contratos iniciales OpenAPI, AsyncAPI y JSON Schema en contracts/.
- Estado real: especificaciones/contracts creados; no hay código de producto, tests, build ni ejecución del spike acreditados. En el entorno de esta sesión Node.js v22.16.0 y npm 10.9.2 están presentes; pnpm y Docker/Compose no están instalados.
- Próxima acción: asignar WP-039 y reviewers reales; ejecutar SP-01..07 en un entorno con Docker y hardware documentable. En paralelo, realizar review independiente de docs/37..44 y completar la matriz REQ/US/AC/TASK/contract/test.
- No afirmar asignación de agentes, review independiente, G0 aprobado, permisos Meta o coste de VPS.


## Handoff — GO-CODE y primer scaffold autorizado (2026-11-07)

- El propietario pidió completar readiness y comenzar código fuente sin más demoras; se registra GO-CODE explícito para workspace y foundation slice en `environment/local`.
- El repositorio era greenfield y no tenía apps, package.json ni pnpm-lock al inicio de este handoff.
- TASK-039 Docker lab run #5 (ID `42344526870`) pasó en GitHub Actions. La evidencia es parcial y sintética; no sustituye SP-01..10 ni revisión independiente.
- El conflicto de ruta/API ID LEAD-010 vs SALES-014 se corrigió: Sales conserva la operación; LEAD-010 se retira como alias histórico.
- Siguiente desarrollo: Identity/OIDC → tenant/membership → PostgreSQL transaction-local RLS con pool Node real → tenant context/audit/outbox → UI de tenant.
- GO-PRODUCTION permanece NO-GO. No usar cuentas, credenciales, datos reales, Meta writes, mensajes, Ads spend ni proveedores IA externos.


## Handoff — CI e Identity/Tenant/Membership (2026-11-07)

- Rama activa: environment/local. No se modifica master ni environment/develop.
- Los workflows de base ya estaban verdes antes de este slice: Source workspace validation #7 y Contract validation #12. El lockfile pnpm está versionado.
- Se refuerza source CI para sincronizar dependencias, verificar instalación frozen, ejecutar migración PostgreSQL y tests RLS; Contract CI usa la baseline Node 26 y verifica el conjunto autorizado de API IDs.
- Slice agregado: OIDC RS256/JWKS, User por issuer+subject, Organization/Tenant/Membership/Role/Permission/Entitlement, Pool PostgreSQL, migración y RLS; APIs de lectura PLT-003..005.
- Pruebas nuevas: firma/issuer/audience/exp/nbf de JWT con JWKS sintético y RLS con dos usuarios/dos tenants usando pool de una conexión.
- Source CI #42376234089 y Contract CI #42376234088 pasaron en commit 0e0927bdcae658d4e4b1ccae28a5c5f89cf4b183. Source: frozen install, migración, build, typecheck y suite OIDC/RLS; Contracts: OpenAPI, AsyncAPI y JSON Schema. El lockfile fue confirmado en commit d81593601101d97623684ea02f04539fd29f3e2f. TASK-001/002/004 siguen in_progress por revisión independiente pendiente; TASK-005 proposed.
- Próximo bloque: provisioning/invitations, lifecycle de Tenant/Membership, RBAC/ABAC, audit/outbox, worker context y UI de selector de tenant.
- GO-PRODUCTION sigue NO-GO. No usar datos/cuentas reales, Meta writes, mensajes, Ads, proveedor IA externo, gasto recurrente ni deploy.


## Handoff — TASK-001 Tenant ownership y lifecycle (2026-11-07)

- Rama de trabajo: `environment/local`; no se modificaron `master` ni `environment/develop`.
- Implementada migración `apps/api/migrations/0002-tenant-lifecycle-invariants.sql`: tenant ownership inmutable, protección FK Organization→Tenant, transiciones válidas de lifecycle, timestamps de estado, tombstone deleted inmutable y RLS que oculta tenants borrados.
- `scripts/migrate.mjs` ahora aplica todas las migraciones SQL versionadas en orden, con advisory lock y transacción por versión.
- Suite PostgreSQL ampliada para transiciones válidas e inválidas, tombstone, reasignación de ownership, delete restrict y visibilidad RLS.
- Source CI run #15 (42379841071) pasó en commit `479a8234d2f6b78b0bb8e6474c39e4a388034c3a`: frozen install, migrations, build, typecheck y unit/integration tests. Run #13 tuvo una aserción SQLSTATE errónea; corregida, runs #14 y #15 pasaron.
- TASK-001: implemented y CI-verified. Sigue in_progress globalmente hasta review independiente de arquitectura/seguridad y aceptación del propietario. No declarar aceptación.
- Siguiente tarea tras el gate de TASK-001: TASK-002 tenant context/authz; después TASK-004 RBAC/ABAC. TASK-005 continúa propuesto y depende de TASK-004.
- No se añadieron APIs catalog-only, no se habilitó producción, no se usaron datos reales ni se ejecutaron escrituras Meta.


- Validación adicional de idempotencia: Source CI run #16 [42380055974](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42380055974) ejecutó `pnpm db:migrate` dos veces en la misma base PostgreSQL efímera; migraciones, build, typecheck y tests finalizaron SUCCESS. Commit `84bab54d78b5246174dab6a6a9eb9173d0149476`.
- La documentación de TASK-001 quedó sincronizada en docs/58, docs/11 y docs/14. Último commit de sincronización del backlog: `22d8ce9f7c9235e469d03d4959953537a4482291`.

## Handoff — TASK-002 Tenant Context y autorización fail-closed (2026-11-07)

- Rama: `environment/local`. No se modificaron `master` ni `environment/develop`.
- Migración añadida: `apps/api/migrations/0003-tenant-context-authorization.sql`.
- `platform.can_use_tenant` comprueba usuario, organización, tenant y membership activos; `withTenantContext` solo establece `app.tenant_id` después de autorizar.
- `withTenantContextAtVersion` valida authzVersion con `FOR NO KEY UPDATE`, vuelve a comprobar autorización y rechaza snapshots obsoletos.
- `TenantContextGuard` exige principal OIDC, tenant UUID y propósito estático. El contexto actor/tenant/membership/roles/permisos/entitlements/correlation queda inmutable y scoped al request.
- role_permissions incorpora tenant_id y FK compuesta; triggers versionan los cambios de membership/roles/grants.
- PLT-005 consume el guard y conserva su schema público. No se implementaron APIs catalog-only ni se concedieron permisos de escritura de producto.
- Tests agregados: unitarios del guard y PostgreSQL/RLS para cross-tenant, estados inactivos, revocación y stale authz snapshot.
- Source CI #47 [42383524043](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42383524043) pasó en commit `74febd28056043cda15221f29c8c5b71290ca06c`: frozen install, migraciones e idempotencia, build, typecheck y test suite.
- Estado: TASK-002 implemented y CI-verified; revisión independiente y aceptación del PO pendientes. TASK-004 RBAC/ABAC es el siguiente bloque crítico; TASK-003 aislamiento operativo queda también pendiente.
- No se han usado cuentas/datos reales, acciones Meta, mensajes reales, gasto publicitario, proveedor IA externo ni despliegues.
## Handoff — TASK-004 RBAC/ABAC y catálogo de permisos (2026-11-07)

- Rama `environment/local`; no se modificaron `master` ni `environment/develop`.
- Migration `0004-authorization-permission-catalog.sql` siembra permission keys/risk_class con `ON CONFLICT DO NOTHING`; no crea grants ni assignments.
- Código: `apps/api/src/platform/identity/authorization/permission-catalog.ts`, `tenant-role-catalog.ts`, `tenant-authorization-policy.ts`, `authorization.service.ts`, `authorization.guard.ts`, `tenant-role-assignment.policy.ts`.
- Nueve role templates tenant least-privilege; platform roles quedan fuera. No se materializan ni asignan automáticamente.
- Policy evaluator default-deny y polimórfico: membership, tenant, purpose, permission, entitlement, ownership, state, asset grant, consent, independent approval y capability freshness.
- Role assignment policy exige `tenant_owner`, impide autoasignación, cross-tenant, platform roles y privilege escalation; solicita approval evidence independiente.
- No se implementan IAM-007..020 ni mutaciones; siguen catalog-only. Auditoría append-only, approvals workflow/step-up y outbox siguen para TASK-005.
- Source CI #67 [42385036275](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42385036275) SUCCESS en commit `53e50dc00daccc7c64c7931e468e6ef0af132940`: install frozen, migraciones e idempotencia, build, typecheck y tests.
- Estado: núcleo TASK-004 implemented y CI-verified; tarea global in_progress hasta revisión independiente, integración con assignments/audit y aceptación del propietario. Siguiente work package crítico: TASK-005 approvals/audit; también queda TASK-003 aislamiento jobs/cache/files/telemetry.
## Handoff — TASK-005 Approval, Step-up y Audit (2026-11-07)

- Branch activo `environment/local`; no se modificaron `master` ni `environment/develop`.
- Migration `0005-approval-audit-foundation.sql`: approval_requests, approval_decisions, audit_stream_heads, audit_events, RLS/grants y triggers para binding/quorum/identidad/append-only.
- Código principal: `security/step-up-evidence.ts`; `approvals/approval-policy.ts`, `approval-request-hash.ts`, `approval-workflow.service.ts`; `audit/append-only-audit.repository.ts`, `authorization-decision-audit.service.ts`; OIDC guard conserva claims `auth_time/acr/amr` tras validar firma.
- Solicitudes idempotentes y ligadas a SHA-256 de tenant/action/purpose/resource/snapshot. Decisiones distintas e independientes; no autoaprobación; step-up reciente con allowlist IdP; expiración; consumo único exacto.
- Audit stream SHA-256 por tenant; append events sensibles/denegaciones; stream head monotónico unido a evento; triggers rechazan update/delete.
- No se añadieron endpoints IAM-018..020; siguen catalog-only. No existe outbox/consumer de negocio ni integración real del IdP. Allowlist ACR/AMR por defecto vacía y step-up falla cerrado.
- Source CI #112 [42387272987](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42387272987), commit `b38b78ab52dbb96262dc8078518fdf4f55fc5a2c` — SUCCESS; `RUN_APPROVAL_INTEGRATION_TESTS=true` ejecutó integración real en PostgreSQL efímero con requester y dos approvers.
- TASK-005: núcleo implementado y CI-verified; sigue in_progress hasta integración IdP, outbox/consumer, freeze contratos, revisión independiente y aceptación del PO. GO-PRODUCTION NO-GO.


## Handoff — TASK-003 aislamiento operativo (2026-11-07)

- Rama environment/local; primitives añadidas en apps/api/src/platform/isolation/.
- TenantResourceNamespace centraliza cache keys y object keys tenant-scoped; rechaza tenant UUID/resource inválidos y path traversal.
- TenantScopedCache decora CacheStore, aplica namespace y TTL bounded; TenantScopedObjectStorage decora ObjectStorage, aplica prefijo tenant, valida MIME/checksum.
- TenantJobContextResolver recupera el registro durable por jobId y produce contexto inmutable no falsificable mediante WeakSet privado; TenantJobExecutor revalida cada ejecución mediante DatabaseService.withTenantContext.
- TenantTelemetryContext usa HmacTenantPseudonymizer con clave mínima de 256 bits inyectada; las métricas aceptan vocabulario acotado y excluyen tenant.
- Seis suites unitarias registradas en apps/api/project.json; CI aún pendiente de inspección.
- Límites: sin adapters/wiring reales Valkey/S3/RabbitMQ; sin outbox/inbox/consumer durable, DLQ/replay; falta PostgreSQL pool A→B desde worker y adapter de secret manager y wiring del pseudonymizer HMAC; no se ha ejecutado suite en esta sesión.
- TASK-003 está implemented a nivel de primitives, no verified/accepted. GO-PRODUCTION sigue NO-GO.


## Handoff — TASK-003 registro durable de jobs (2026-11-07)

- Rama activa `environment/local`; no se modificaron `master` ni `environment/develop`.
- Añadida migración `0006-tenant-job-outbox.sql`: tabla `platform.tenant_job_records`, RLS habilitada, ownership tenant/actor, payload JSON, estado, intentos bounded e índices; runtime tiene INSERT y SELECT(id) solo para `RETURNING`, sin SELECT de payload ni UPDATE directo.
- Función `platform.resolve_tenant_job_context(uuid)` concede al rol runtime solo metadata mínima de autorización; no retorna payload. `PostgresTenantJobRecordReader` implementa el puerto `TenantJobRecordReader` y `IsolationModule` registra reader/resolver/executor.
- `DatabaseModule` exporta `DATABASE_POOL` para adapters de infraestructura; `AppModule` importa `IsolationModule`.
- Añadidos `PostgresTenantJobRecordWriter.stage(client, input)` para insertar jobs idempotentemente (tenant/actor/job type/key + SHA-256 request canónico) dentro de la transacción de negocio y guard SQL de transiciones/attempts. Ocho suites unitarias y una suite PostgreSQL gated (`RUN_TENANT_JOB_INTEGRATION_TESTS=true`) están registradas en `apps/api/project.json`; la integración cubre cross-tenant RLS y revocación de membership.
- No se afirma CI/test pass de esta iteración. Publisher/outbox dispatcher, inbox/consumer, schema validation, dedupe/retry/backoff/DLQ/replay, adapters reales Valkey/object storage/broker, pool A→B PostgreSQL, secret manager y wiring de telemetría siguen pendientes.
- TASK-003 sigue `in_progress` (implementación parcial); GO-PRODUCTION continúa NO-GO.
