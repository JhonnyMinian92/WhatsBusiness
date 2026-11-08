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

## Estado de continuación WhatsBusiness (2026-11-07)

- Rama de trabajo: `environment/local`; no modificar `master` ni `environment/develop`.
- TASK-003 tiene namespaces/cache/storage multi-tenant, HMAC telemetry, PostgreSQL job staging y contexto seguro de worker; continúa incompleta.
- Nuevo slice: `TenantJobRetryPolicy` con backoff exponencial bounded/equal-jitter y clasificación fail-closed; tests registrados en `apps/api/project.json`; documentación `docs/59-TENANT-JOB-RETRY-POLICY.md`.
- Commits: `c27a8578f56ef2e740a56d907e5fdc963a0a5b46`, `aa5c37273011ba354a1b574a8a519fd0d623960a`, `98c5b0fdf23416f1ca55ceffaed881b07827e237`, `4890949ae83db4d5b5626c4fd23aad62e1c8d5b3`.
- Verificación: no se ejecutaron build/typecheck/tests localmente; GitHub no reportó workflow runs para el commit de documentación consultado. Mantener estado `in_progress`.
- Próximo paso: diseñar e implementar claim/lease con fencing y recuperación de `processing` abandonados; después dispatcher con publisher confirms, consumer inbox/dedupe y ACK posterior al commit, DLQ/replay auditado.
## Handoff — backend microservices-meta-ecuapp runtime (2026-11-07)

- Proyecto backend creado y registrado como package/workspace Nx `microservices-meta-ecuapp`; no se creó `app-meta-ecuapp` porque el alcance actual es backend.
- Runtime durable: PostgreSQL outbox/leases/fencing/inbox, dispatcher pool + worker pool y logins separados, RabbitMQ confirm publisher/manual ACK/quorum DLX, session reconnect/backoff, bootstrap con handler registration obligatorio, graceful drain al parar consumer.
- El contrato de ejecución reusa `DatabaseService.withTenantContext` mediante `databaseFactory(workerPool)`; evita una implementación duplicada de RLS.
- Se añadió `docs/60-TENANT-JOBS-RUNTIME.md`. La migración 0007 se consolidó completa tras detectar SQL duplicado/incompleto por readback.
- Estado de calidad: falta corrida final Source CI para el último commit; no declarar build/typecheck/tests verdes. TASK-003 in_progress, GO-PRODUCTION NO-GO.
- Siguientes pendientes: replay autorizado con approval/audit, pool reuse A→B, crash/fencing tests, observabilidad y handlers Meta reales. El heartbeat de lease se añadió en `0009` y debe quedar CI-verified.


## Handoff — evaluación CRM vs ARM (2026-11-07)

- [x] Revisar la especificación CRM vigente (`docs/38-CRM-DOMAIN-SPEC.md`), modelo de datos (`docs/42-INITIAL-DATA-MODEL.md`), contratos y arquitectura.
- [x] Investigar usos públicos de ARM; el término no tiene una expansión universal. La hipótesis más relevante para WhatsBusiness es Agent Relationship Management / Agentic Relationship Management.
- [x] Crear `docs/61-ARM-STRATEGY-AND-ARCHITECTURE-ASSESSMENT.md`.
- [x] Actualizar el índice documental.
- Recomendación provisional: NO reemplazar ni eliminar CRM. Mantener contactos, identidades, leads, oportunidades, pipeline, actividades y provenance como bounded context CRM; añadir una capa Agent Management & Orchestration para registro de agentes, tools, delegación, runtime, supervisión humana, evaluación y auditoría.
- No se cambia el naming público ni se alteran contratos/migraciones CRM hasta que el propietario confirme qué significa ARM y apruebe el posicionamiento.
- Siguiente trabajo técnico: retomar TASK-003 desde el último commit de `environment/local`, comprobar CI real y cerrar los pendientes de timeout/cancelación, replay autorizado, métricas, crash tests, pool reuse A→B y handlers de negocio.


## Handoff — TASK-003: deadline y cancelación de handlers (2026-11-07)

- [x] Implementar deadline configurable de ejecución en `TenantJobExecutionLeaseHeartbeat`.
- [x] Propagar `TENANT_JOB_HANDLER_TIMEOUT_MS` desde bootstrap y `.env.example` a la factoría RabbitMQ/PostgreSQL.
- [x] Agregar pruebas de timeout cooperativo, handler que ignora AbortSignal y pérdida de lease con handler no cooperativo.
- [ ] Obtener Source CI SUCCESS para el commit `d9d9b10a5ef80e744e4480d541c4a01e9bb539de`.
- Límite explícito: AbortSignal es cooperativo. El runtime rechaza y revierte la transacción al vencer el deadline, pero no puede terminar por fuerza una promesa JS arbitraria. Los handlers deben atender cancelación y no hacer efectos externos dentro de la transacción.
- Próximo: replay administrativo auditado y métricas/alertas; luego pruebas de crash/redelivery y pool reuse A→B.


## Handoff — TASK-003: correcciones encontradas por Source CI (2026-11-07)

- Source CI #42428255833 ejecutó instalación frozen, provisioning PostgreSQL, migraciones 0001–0009, idempotencia de migraciones y configuración RabbitMQ DLX correctamente.
- Build falló en el adapter RabbitMQ por tipos de amqplib 2.2.1: heartbeat es tuning parameter de URI, no socket option; `connect` devuelve `ChannelModel`, no `Connection`. Se corrigió con heartbeat en query AMQP y tipo ChannelModel.
- Build también falló por abstracción `TenantPseudonymizer` ausente y dependencia desde adapter concreto. Se restauró el port y se corrigió el import.
- Source CI del commit `489b8cd3d84b057d2bdc40c8fa740008b4ac4bbc` pendiente. Próximo criterio: build verde; luego typecheck y suites unitarias + PostgreSQL/RabbitMQ.

## Handoff — continuidad backend y decisión CRM con IA (2026-11-07)

- Decisión del propietario: mantener CRM como núcleo del producto e incorporar IA para asistir, mejorar y automatizar funciones CRM. ARM queda fuera del alcance y en pausa; no crear bounded context, naming, contratos ni migraciones ARM.
- Source CI #42428439526 (commit 489b8cd) confirmó instalación, migraciones 0001–0009, idempotencia, RabbitMQ DLX, build y typecheck. Fallaron dos pruebas de integración: ambigüedad SQL en claim execution y validador RabbitMQ demasiado restrictivo.
- Correcciones registradas: migración microservices-meta-ecuapp/migrations/0010-tenant-job-execution-claim-ambiguity.sql; publisher RabbitMQ acepta routing keys con guiones y single-segment; prueba unitaria adicional. Commit de migración 4e44d17c25319c9c5067dc7536599f99f6e66051, publisher 9a462529882582c6bf16717964afaaa2287f5ac3, pruebas b96ec893397dda413164edaf56b0914135cee9b0.
- Source CI #42429156061, commit b96ec893397dda413164edaf56b0914135cee9b0, está pendiente. No declarar TASK-003 verificada ni CI verde.
- Siguiente bloque: validar CI completo; luego pool reuse A→B, replay administrativo con autorización/approval/audit, métricas/alertas, crash/redelivery/fencing tests y handlers de negocio reales. Mantener TASK-003 in_progress.
- GO-PRODUCTION sigue NO-GO. No usar datos reales, Meta writes, mensajes, gasto Ads ni proveedor IA externo sin autorización y gates correspondientes.

## Handoff — TASK-003 CI green y definición de CRM Intelligence (2026-11-07)

- Source CI #42430605576 terminó SUCCESS para commit `be9d3dc14aa26b38c20013b98ff5238bac564a4e`: instalación frozen, migraciones 0001–0011/idempotencia, build, typecheck, pruebas unitarias e integraciones PostgreSQL/RabbitMQ.
- Se corrigió la ambigüedad PL/pgSQL `job.id` en la recuperación de leases mediante migración 0011 y variable local `execution_row`. La integración confirma también que el lease cross-tenant se rechaza con SQLSTATE `40001`.
- TASK-003 sigue in_progress: pool reuse A→B, replay administrativo auditado, observabilidad, crash/redelivery/fencing tests, handlers de negocio reales, secret manager/deployment y review independiente siguen pendientes.
- El propietario aclaró que CRM con IA significa machine learning tradicional y estadística, no LLM ni agentes. Ver [docs/62](62-CRM-MACHINE-LEARNING-STRATEGY.md), PD-005 y ADR-026.
- Se agregaron tareas propuestas TASK-081..087 para labels/features, datasets reproducibles, baselines, registry, serving CPU-first, MLOps y casos predictivos. No se afirma que CRM Intelligence esté implementada.

## Handoff — TASK-003: pool reuse A→B (2026-11-07)

- Rama: `environment/local`.
- Cambio: se amplió `microservices-meta-ecuapp/src/jobs/infrastructure/postgres/postgres-tenant-job-runtime.integration.spec.ts` para forzar dos ejecuciones secuenciales con tenant A y tenant B sobre el mismo `workerPool`.
- La prueba comprueba que `pg_backend_pid()` sea el mismo y que `app.user_id`/ `app.tenant_id` reflejen exclusivamente el tenant de cada transacción; evita falsos positivos por conexiones distintas.
- Commit: `bcedfab0538f5ee82a06ffe2480f41e3378bab7e`.
- Estado: código de prueba implementado; no se ha consultado aún resultado de CI de este commit. No declarar pool reuse verificado ni TASK-003 completa.
- Siguiente: confirmar Source CI; después implementar replay administrativo con autorización/approval/audit, métricas/alertas y pruebas de crash/redelivery/fencing; mantener handlers de negocio y deployment como pendientes.

## Handoff — pool reuse A→B verificado y rollback en validación (2026-11-08)

- Source CI #42431419028 SUCCESS para commit `bcedfab0538f5ee82a06ffe2480f41e3378bab7e`. La nueva suite de `apps/api` ejercita el `DatabaseService` real con pool de una conexión; `pg_backend_pid()` confirma la misma conexión física entre tenant A y B y los GUC `app.tenant_id`/`app.user_id` quedan vacíos tras cada COMMIT.
- Se añadió en commit `6059822896987fc618c479d53117354e1a785144` un camino de error que fuerza ROLLBACK y valida que los GUC se limpian también tras una excepción. Source CI #42431530685: instalación, migraciones, build y typecheck pasaron; las integraciones aún estaban ejecutándose al actualizar esta memoria.
- TASK-003 sigue in_progress. Pendientes: replay administrativo con approval/audit, métricas/alertas, pruebas de crash/redelivery/fencing extendidas, handlers de negocio reales, secret manager/deployment, pruebas de carga/concurrencia y review independiente.

## Handoff — cierre de verificación de pool A→B y rollback (2026-11-08)

- Source CI #42431530685 SUCCESS para commit `6059822896987fc618c479d53117354e1a785144`: frozen install, migraciones/idempotencia, build, typecheck, pruebas unitarias e integraciones PostgreSQL/RabbitMQ.
- La suite de `apps/api` prueba el `DatabaseService` real con pool de una conexión, misma conexión física (`pg_backend_pid`) para tenant A→B, GUC de tenant/usuario limpios tras COMMIT y tras ROLLBACK provocado por excepción.
- Pool reuse A→B y cleanup transaccional se consideran verificados. Carga concurrente y configuración en deployment siguen pendientes. TASK-003 continúa in_progress por replay/audit, métricas, crash/redelivery/fencing ampliado, handlers reales, secretos/deployment y revisión independiente.

## Handoff — aislamiento concurrente de tenants (2026-11-08)

- Se amplió `apps/api/src/platform/database/database.context.integration.spec.ts` con una prueba de dos transacciones simultáneas usando el `DatabaseService` real y un pool worker de dos conexiones.
- La prueba sincroniza ambas transacciones para mantenerlas abiertas en paralelo; comprueba `pg_backend_pid()` distintos, GUC `app.tenant_id`/`app.user_id` correctos durante toda la ejecución y aislamiento RLS (cada actor solo ve su tenant).
- Commit de código: `9b497d0805b53f79e658fd874d0ebfbec3863b12`. Source CI correspondiente pendiente de lectura al momento de este handoff; no declarar la regresión verificada todavía.
- A→B secuencial y cleanup tras COMMIT/ROLLBACK sí están verificados por Source CI #42431530685 en commit `6059822896987fc618c479d53117354e1a785144`.
- TASK-003 sigue `in_progress`. Siguientes pendientes: replay administrativo con permission/approval/audit, replay seguro de broker DLQ, métricas/alertas, crash/redelivery/fencing, handlers de negocio reales, validación de infraestructura RabbitMQ, secretos/deployment y revisión independiente.

## Handoff — replay seguro y CI verde (2026-11-08)

- Source CI #42432745586 SUCCESS para commit `6c93efdfea0cef7f1819402ab872e439ef858ccd`: migraciones 0012/0013/idempotencia, build, typecheck, pruebas unitarias y PostgreSQL/RabbitMQ integration.
- Se añadió replay API con permiso `jobs.replay.request`, aprobación de dos personas y step-up, hash binding exacto, audit `approval_consumed`, request snapshot append-only, genealogía/FK same-tenant, y child job inmutable. La función SQL SECURITY DEFINER verifica la autorización y clona payload dentro de PostgreSQL; el rol API carece SELECT(payload) e INSERT lineage.
- Repository port separado de adapter. Policy registry vacío y fail-closed; test verifica que sin handler con stable domain-effect idempotency no se crea una aprobación. No hay todavía handler productivo habilitado ni replay e2e; no anunciarlo como operativo.
- Se verificó prueba de aislamiento concurrente A/B con pool worker: dos transacciones simultáneas en conexiones físicas diferentes mantienen actor/tenant propios y RLS rechaza el otro tenant. La secuencia A→B y cleanup tras COMMIT/ROLLBACK también siguen verdes.
- TASK-003 sigue in_progress; quedan handler real/policy idempotente, flujo replay e2e broker, DLQ operacional, métricas/alertas, crash/redelivery/fencing ampliado, secrets/deployment y review independiente.

## Handoff vigente — TASK-003 durable jobs y recuperación RabbitMQ (2026-11-08)

- Branch autorizada: `environment/local`. No modificar `master`, `environment/develop`, despliegues ni datos productivos.
- Último commit de código verificado: `f136cff710fe8c60c8430c82928092320b9d90b5`.
- Source CI [#42433941375](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42433941375) terminó SUCCESS: frozen install, provisionamiento de logins DB mínimos, migraciones versionadas e idempotencia, quorum DLX, build, typecheck, unit tests y pruebas PostgreSQL/RabbitMQ.
- RabbitMQ consumer: envelope inválido → NACK sin requeue/DLX; mensaje válido pero fallo de procesamiento durable (p. ej. PostgreSQL no disponible) → cerrar sesión worker sin ACK/NACK para redelivery; ACK ambiguo después del posible COMMIT → también cerrar sesión, nunca NACK destructivo. Varias entregas prefetched fallidas comparten cierre single-flight.
- Tests CI incluyen persistencia/redelivery tras pérdida de canal, procesamiento válido interrumpido, ACK ambiguo, dos fallos concurrentes con una sola llamada a close, leases dispatch/execution expirados y rechazo de fencing tokens antiguos para renew/complete/mark-published.
- Prometheus: counters/histograms in-memory y `GET /metrics` loopback por defecto (Bearer + TLS/mTLS y red privada para acceso remoto). Gauges PostgreSQL pasaron Source CI #432. RabbitMQ metrics ahora usa Management HTTP API y usuario `monitoring` dedicado, sin permisos AMQP ni compartir conexión con worker; CodeQL #6 SUCCESS; Source CI #481 en validación para counters `messages_unacknowledged`. Source CI #480 falló porque la respuesta 200 de la DLQ omitía un contador; #481 agrega un error diagnóstico con solo los nombres de los campos faltantes. Source CI #463/CodeQL #3 verificó el diseño AMQP previo, ahora reemplazado. Dashboard, alert rules y runbook versionados, no desplegados. `messages_ready` y `messages_unacknowledged` se exponen en gauges distintos; ninguna señal equivale por sí sola a consumer lag. La alerta `absent(up)` está incluida en el HEAD.
- Replay SQL/API protegido: aprobación two-person + step-up + hash/snapshot/audit y child lineage inmutable; registry de policies vacío y fail-closed. No hay handlers reales Meta/CRM registrados: se requiere probar stable domain-effect idempotency antes de habilitar replay.
- Pendientes: DLQ operator workflow/replay, handler real end-to-end, métricas unacked/consumer lag autoritativo, dashboards/alerts/SLO, validar topology/policy desplegada, Secret Manager/rotación, TLS/AMQPS reales, carga/DR, revisión independiente y aceptación. TASK-003 está `in_progress`, no `accepted`; GO-PRODUCTION NO-GO.
- No crear frontend `app-meta-ecuapp` sin historia frontend; prioridad inmediata sigue siendo terminar backend `microservices-meta-ecuapp` por work packages verificables. CRM Intelligence es ML clásico/estadística CPU-first según docs/62, no LLM ni agentes; sus modelos aún no están implementados.

## Handoff — exposición HTTP Prometheus del runtime de jobs

- Añadido `TenantJobMetricsHttpServer` como adapter de infraestructura sin dependencias externas.
- `TenantJobRuntimeProcess.run()` inicia el listener y el cierre del proceso apaga el servidor junto con los pools.
- Superficie limitada a `GET /metrics`; loopback por defecto; binding remoto exige bearer token de al menos 32 bytes, comparado en tiempo constante.
- La suite HTTP está registrada en `microservices-meta-ecuapp:test`; Source CI [#42434224485](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42434224485) terminó SUCCESS e incluyó build, typecheck y tests.
- Se actualizaron `microservices-meta-ecuapp/.env.example`, README del backend y docs/60/63. Para binding remoto, el bearer token no sustituye TLS/mTLS ni la restricción de red.
- TASK-003 continúa `in_progress`; faltan métricas de profundidad/lag del broker, alertas/SLO, DLQ operator workflow/replay, handler real e2e, revisión independiente y aceptación. Los gauges SQL agregados están implementados, CI pendiente. GO-PRODUCTION continúa NO-GO.

## Handoff — gauges operativos agregados de tenant jobs

- Migración `microservices-meta-ecuapp/migrations/0015-tenant-job-runtime-metrics.sql`: función `platform.read_tenant_job_runtime_metrics()`, SECURITY DEFINER, sin IDs ni payloads, EXECUTE solo para `whatsbusiness_job_dispatcher_role`.
- `PostgresTenantJobRuntimeMetricsReader` lee nueve valores agregados: dispatch pending/blocked, leases active/expired (dispatcher y worker), dead letters, edad del pending más antiguo y replayed jobs.
- `TenantJobRuntimeSupervisor` refresca cada 15 s por defecto; errores de muestreo no bloquean recuperación ni dispatch. `PrometheusTenantJobRuntimeMetrics` publica gauges sin labels.
- Nuevas pruebas unitarias y extensión de integración PostgreSQL registradas; Source CI de este tramo pendiente. El endpoint HTTP ya cuenta con Source CI #403 SUCCESS.
- TASK-003 global sigue `in_progress`; quedan broker queue depth/consumer lag, alertas/SLO, operador DLQ, handlers reales/idempotencia externa, despliegue broker/secrets/TLS, carga/DR, revisión independiente y owner acceptance.

## Handoff — métricas físicas RabbitMQ
- `RabbitMqManagementTenantJobQueueMetricsReader` consulta Management HTTP API con Basic auth y usuario `monitoring` separado; HTTPS fuera loopback, permisos AMQP vacíos, timeout 1 500 ms.
- Cuatro gauges: ready messages/consumers de worker queue y DLQ; no incluyen unacked ni miden consumer lag.
- Unit/integration tests registrados en Nx; Source CI #481 pendiente del diseño Management API con unacknowledged, CodeQL #6 SUCCESS. TASK-003 sigue `in_progress`; GO-PRODUCTION NO-GO.


## Handoff — reparación de lifecycle de suites CI para TASK-003/027/028 (2026-11-08)

- Source CI #527 (42445689547, commit da85d998a4d1534b0ae52e0bf3d143b5f9044a23) se agotó en 30 minutos durante microservices-meta-ecuapp:test; instalación, migraciones/idempotencia, provisioning, build y typecheck pasaron. api:test terminó; el test target backend no concluyó.
- Se encontró el teardown defectuoso en rabbitmq-transport.integration.spec.ts: los nombres de colas definidos dentro del try se usaban en finally, pudiendo generar ReferenceError y omitir channels.close(). La limpieza ahora conserva los nombres fuera del bloque y siempre cierra la sesión AMQP.
- El manifest Nx tenía una ruta a meta-webhook-worker.runtime.spec.ts inexistente. La ruta fue sustituida por la nueva suite meta-webhook-worker.supervisor.spec.ts, con cobertura de broker no disponible, cierre de pool, validación de handlers y política de reconexión.
- No afirmar que el CI está verde hasta revisar el siguiente Source CI. TASK-003/027/028 siguen in_progress; no activar replay ni handlers externos sin evidencia de idempotencia de efectos de negocio y gates aprobados. GO-PRODUCTION sigue NO-GO.


## Handoff — RabbitMQ routing fixture y PostgreSQL ingress grants (2026-11-08)

- Source CI #528 en commit `a00c4b318021d12e84cc5fe98c23f4da6639b65a`: la suite ya finaliza en ~10 s (sin timeout), 80/82 tests del backend pasaron; `api:test`, frozen install, migraciones/idempotencia 0001–0018, build y typecheck SUCCESS. CodeQL #66 SUCCESS.
- Fallo RabbitMQ: `RabbitMqJobTopology.initialize()` enlazaba la cola de producción con `jobs.#`, por lo que el routing key de integración podía entrar allí y no en el destino temporal. El test cambia a declarar únicamente exchanges y enlaza la cola temporal al mismo exchange.
- Fallo PostgreSQL: `whatsbusiness_app` tenía INSERT por columnas pero carecía SELECT de las claves usadas por `ON CONFLICT`; migración 0019 concede SELECT de columnas de conflicto del inbox y outbox, sin ciphertext/nonce/tag. La integración ya verifica el rechazo de SELECT(payload_ciphertext).
- Siguiente paso: Source CI debe aplicar 0019, verificar idempotencia y pasar las dos integraciones. TASK-003/027/028 siguen `in_progress`; no declarar verificado ni accepted.


## Handoff — Source CI #536 SUCCESS y último hardening del login ingress (2026-11-08)

- Source CI #536 (42486399710) sobre `cfe7019f4e6712055d50424ecf8f498ecf074c51`: SUCCESS. Frozen install, provisioning, migraciones 0001–0020 e idempotencia, build, typecheck, `api:test`, `microservices-meta-ecuapp:test` y cleanup PostgreSQL/RabbitMQ finalizaron bien.
- CodeQL #74 (42486399698): SUCCESS. Commit automático ff89b71 cambia solo pnpm-lock.yaml.
- Código ya usa la función tenant-checked `stage_meta_webhook_event_outbox(uuid)`; integración confirma que el evento no se puede stagear desde otro tenant y que app no lee el outbox ni payload cifrado.
- Hardening pendiente CI: migración 0021 elimina la membresía app→ingress role (NOINHERIT no bloquea SET ROLE de memberships SET habilitadas) y revoca a ese grupo grants de lectura/escritura del outbox; test verifica ACL + SET ROLE denegado.
- TASK-003/027/028 siguen in_progress; no declarar acceptance ni GO-PRODUCTION. Quedan pendientes handlers productivos idempotentes, replay autorizado con approval/audit, retención/CR-0016, KMS, WAF/rate limiting, despliegue real, observabilidad/SLO, load/DR y review/owner acceptance.


## Handoff — Source CI #539: Webhook Inbox, worker y DLQ durable (2026-11-08)

- Source CI [#539](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976106) terminó SUCCESS en commit `c2bb65fc1a506ba54ab3f7662c9bbc759e2b0536`. Frozen install, migraciones 0001–0021 + idempotencia, provisioning de roles mínimos, build, typecheck, pruebas unitarias y las integraciones PostgreSQL/RabbitMQ pasaron. CodeQL [#77](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976151) terminó SUCCESS.
- La integración de Webhooks ahora guarda dos eventos en un único delivery: un `messages.message` con handler registrado y un `messages.status` deliberadamente sin handler. El worker procesa el primero una sola vez, completa su receipt y envía el segundo a `platform.meta_webhook_dead_letters` con `META_WEBHOOK_HANDLER_NOT_REGISTERED`; ambos outbox se publican.
- La misma suite consulta la DLQ mediante `platform.list_meta_webhook_dead_letters` con el login de ingress, comprueba únicamente metadata (sin payload cifrado) y confirma que cambiar el contexto a otro tenant produce SQLSTATE `42501`.
- Se corrigió el test harness para que la prueba RabbitMQ compruebe publisher confirm, routing, ACK y entrega a quorum DLX mediante mensajes AMQP reales, sin depender de que un scrape Prometheus asíncrono coincida temporalmente con un contador ready/unacked.
- La función `platform.stage_meta_webhook_event_outbox(uuid)` de la migración 0020 es la única frontera de escritura de outbox para el login API: deriva tenant del contexto transaction-local y del evento inbox; no concede lectura ni escritura directa del outbox. La migración 0021 elimina además la membresía del login API en el grupo ingress amplio.
- **Estado global:** TASK-003, TASK-027 y TASK-028 continúan `in_progress`, no `accepted`. Aún faltan handlers reales CRM/WhatsApp/Instagram/Lead Ads/Ads, fixtures/conformance con cuentas Meta elegibles, CR-0016 y replay aprobado, Secret Manager/KMS y rotación, rate limiting/WAF, topology y observabilidad desplegadas, carga/DR, revisión independiente y aceptación del propietario. GO-PRODUCTION sigue NO-GO.


## Handoff — Source CI #560 y reparación del test de métricas RabbitMQ (2026-11-08)

- Último HEAD inspeccionado antes del cambio: b6da092d443c91aebf502809439f82677d49acdc, rama autorizada environment/local.
- Source CI #560: instalación frozen, migraciones 0001–0023 e idempotencia, build, typecheck y api:test SUCCESS. La suite backend falló en la integración RabbitMQ Management API y el proceso llegó al timeout de 8 minutos.
- El log no conserva la aserción inicial porque el proceso queda vivo. El cambio añade status HTTP sin filtrar bodies/secretos, setup protegido por finally, timeout explícito, esperas acotadas y cleanup AMQP con límites seguido del cierre de conexión.
- Estado: implemented; Source CI/CodeQL del commit nuevo pendientes. TASK-003 continúa in_progress; TASK-027/028 mantienen pendientes handlers reales, CR-0016, protección perimetral, despliegue y aceptación.


## Handoff — cierre del socket RabbitMQ y recuperación por redelivery (2026-11-08)

- El adaptador compartido RabbitMqConnectionFactory.close esperaba primero los cierres de canales y después el de la conexión. El runtime worker reutiliza este cierre para fallos de procesamiento/ACK; esperar un RPC de canal que no finaliza puede impedir el cierre del socket y bloquear reconexión.
- Cambio implementado: cierre directo de la conexión AMQP padre; amqplib invalida RPC pendientes y cierra sus canales hijos. El test PostgreSQL/RabbitMQ existente ahora provoca el crash mediante channels.close() del proceso completo y comprueba que el mensaje sin ACK se redelivery.
- Source CI #561 seguía en ejecución en el test backend y no hay conclusión; el siguiente push lo sustituye por concurrency cancel-in-progress. CI/CodeQL del nuevo HEAD pendientes. TASK-003 no se cierra por este cambio.

## Handoff — compatibilidad del fixture de métricas con RabbitMQ 4.4 (2026-11-08)

- Source CI #560 y #562 pasaron frozen install, migraciones 0001–0023 e idempotencia, provisioning, build, typecheck y `api:test`; el target backend falló en la integración live de Management API y alcanzó el timeout del step.
- RabbitMQ 4.4 rechazó la característica `transient_nonexcl_queues`. El fixture declaraba dos colas efímeras con `durable=false, exclusive=false, autoDelete=true`; la causa está en la configuración del test y no en la topología productiva.
- Corrección implementada en `92b46d68bc8070a086b95352d504797fe1bf0c3d`: las colas de test son ahora exclusivas y auto-delete, con nombres únicos por ejecución. La topología quorum durable no se modifica.
- Source CI #563 y CodeQL #98 se encontraban en ejecución. **No marcar el test ni TASK-003 como verified** hasta inspeccionar el resultado completo del HEAD corregido. TASK-003/027/028 permanecen `in_progress`; GO-PRODUCTION sigue NO-GO.

## Handoff — CRM Contacts API activada y verificada por CI (2026-11-08)

- Commit de código `de617cc18b004c0b67df0d5c8b9a10bbf50897a7`: `CrmContactsModule` registrado en `AppModule`; CRM-001..004 pasan a `x-implementation-allowed=true` con gate específico; allowlist del validador fijada a nueve operaciones.
- Se añadieron seis tests del controller. La suite API/PostgreSQL también verifica el agregado, RLS, separación tenant A/B, replay idempotente, If-Match/versión, audit chain y restricción organization.
- Contract metadata corregida en `559cd2255fade6b4fc338463bef417fd992192ac`; Contract CI [#29](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42497491129) SUCCESS. Source CI [#570](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42497391908) SUCCESS; CodeQL [#105](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42497391953) SUCCESS.
- Quedan fuera CRM-005..017, identities/merge/custom fields/companies, event publishing hasta TASK-028 y política de retención/legal hasta TASK-059. TASK-042 no está aceptada: falta review independiente y aceptación del Product Owner.
## Handoff — Source CI #572 SUCCESS y fixture RabbitMQ estable (2026-11-08)

- El fixture de métricas usa colas únicas `durable=false, exclusive=true, autoDelete=false`. Son exclusivas de la conexión; `finally` las elimina explícitamente tras verificar ready → unacknowledged/consumer → idle.
- `autoDelete=true` borraba la cola al cancelar el último consumer y el exporter dejaba de exponer métricas; no era un defecto de la topología quorum de producción.
- Source CI [#572](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026616) SUCCESS y CodeQL [#107](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026686) SUCCESS: migraciones 0001–0023/idempotencia, provisioning, quorum DLX, plugin Prometheus, build, typecheck, API/PostgreSQL y backend/RabbitMQ.
- La misma ejecución verifica OIDC a nivel de clase y TenantContextGuard + AuthorizationGuard en cada método CRM list/create/get/update.
- No implica despliegue Prometheus/Grafana, SLO, load/DR ni aceptación independiente. TASK-003/027/028 y TASK-042 siguen `in_progress`; GO-PRODUCTION NO-GO.

## Handoff técnico — exportación pública de métricas de jobs (2026-11-08)

- Se inspeccionó el barrel público `microservices-meta-ecuapp/src/index.ts` y los módulos de métricas existentes.
- Hallazgo: las abstracciones `TenantJobRuntimeMetrics`/`TenantJobRuntimeMetricsReader`, el reader compuesto, el exporter Prometheus y el servidor HTTP de métricas estaban implementados y probados en sus módulos, pero no eran accesibles desde el punto de entrada público del paquete.
- Cambio: el barrel exporta ahora esos cuatro módulos, sin duplicar implementación ni alterar el runtime.
- Commit: `f10743ce35d96f216c6e5c74ba3dd7286d07f262` en `environment/local`.
- Source CI #42510655661 y CodeQL #42510655630 fueron observados en estado `in_progress` al registrar este handoff; no se declara verificación hasta conocer su conclusión.
- Alcance: mejora de API pública del paquete de jobs/observabilidad. No cierra TASK-003 ni cambia TASK-027/028.
- Restricción de orquestación: en esta sesión solo estuvo disponible un agente ejecutor; se paralelizaron inspecciones de solo lectura. No se presenta esa actividad como revisión independiente ni como ejecución real de varios agentes.



## Handoff — revisión de US-008 WhatsApp Marketing Messages (2026-11-08)

- Historia revisada: US-008, criterios AC-008-01..03; tareas TASK-017 (adapter) y TASK-018 (rate card/cost ledger). TASK-055 y TASK-057 son extensiones relacionadas y permanecen pendientes.
- Inspección de `environment/local`: `AppModule` no registra módulo WhatsApp Marketing; no se encontró adapter, rate-card repository ni cost ledger runtime. Los endpoints WAMK-001..005 permanecen `catalog-only`, `x-contract-ready=false` y `x-implementation-allowed=false` con schemas pendientes.
- Dependencias/bloqueos: TASK-010 (capabilities/elegibilidad), TASK-039 (G0/validación de arquitectura) y TASK-056 (registro de versiones/capabilities) no están demostradas como cerradas para esta integración. Docs/49 y docs/55 prohíben implementar rutas catalog-only antes de congelar cada contrato y satisfacer el gate correspondiente.
- Investigación: la fuente oficial de Meta sobre Max Pricing (16-06-2026) explica que el máximo por entrega es un techo y el cargo real puede ser inferior: https://developers.meta.com/resources/videos/whatsapp-max-pricing/. No se copiaron contratos de proveedores terceros ni se inventaron tarifas, scopes o elegibilidad.
- Se inspeccionaron los patrones existentes `DatabaseService`, `IdentityModule`, `AppModule` y Source CI para preparar reutilización. No se modificó runtime ni se ejecutaron pruebas de US-008; no declarar TASK-017/018 implementadas o verificadas.
- Documentación sincronizada en docs/11 y docs/19. Próximo paso técnico: cerrar prerequisitos de capability/version registry y contract freeze WAMK-001..007; después implementar adapter independiente + policies + rate-card/cost ledger con decimal exacto, idempotencia, auditoría, RLS y conciliación, sin habilitar envíos reales.


## Handoff — CRM-007 API/query tenant-scoped verificada (2026-11-08)

- Se cerró el cableado de CRM-007: controller OIDC/tenant/RBAC, request estricto, use case transaccional, query PostgreSQL por identidad namespaced/teléfono verificado/procedencia, lecturas bulk tenant-scoped, límites fail-closed, auditoría append-only e índices en migración 0026.
- La respuesta expone únicamente IDs/versiones/score/reasons y manual_review_required; no hay PII ni merge automático.
- Source CI #596 (42512027909) y CodeQL #131 (42512027905) SUCCESS en abab9fe88abe0dfce9741cf6794d45c48ff15373; Contract CI #31 (42511475181) SUCCESS en f0ebaae6c57d7821641e18331c7d7c42cf12cb5b. Commits posteriores en la misma rama no alteraron CRM ni OpenAPI.
- CRM-007 queda CI-verified; TASK-043/TASK-053 siguen in_progress hasta review independiente, calibración con datos sintéticos y aceptación. CRM-008..010 pendientes. TASK-003/027/028 continúan in_progress; GO-PRODUCTION NO-GO.

## Handoff — US-004: Meta Asset Registry y Capability Engine (2026-11-08)

- Branch autorizada: environment/local. Commit de implementación inicial 04198bb8eb8f513a71ab61b1d4491f1614aa0f6d; corrección TS strict 2f97c8a94275c87f8543de065c30ae00cbf52b43.
- Se añadieron el modelo/reconciliador de inventario y el evaluador de capabilities en apps/api/src/platform/meta-control-plane/domain; dos suites con 23 casos se incorporaron a apps/api/project.json (api:test).
- Asset registry: identidad (product, assetType, externalId); catálogo incluye Business Portfolio, WAAC, PMA, phone number, Page, Instagram professional account, Ad Account, Lead Form y Dataset. Sync parcial no marca ausencia, sync completo paginado puede marcar not_visible, snapshot anterior no revierte estado y grant negado no elimina el activo.
- Capability evaluator: fail-closed y reason codes para autorización, tenant policy, purpose, asset grants/tasks, OAuth scopes, entitlement, app mode/review, Access Tier, account eligibility/type/country, versión, consent/legal basis y approval. Marketing API tier no reemplaza OAuth scope.
- Source CI #42512236821 falló en build por TS4111 (propiedades dot notation sobre Record<string, unknown>); se corrigió en el commit siguiente. Source CI #42512364598 terminó SUCCESS (build, typecheck, API unit/PostgreSQL e integración backend PostgreSQL/RabbitMQ) y CodeQL #42512364506 terminó SUCCESS sobre 2f97c8a. HEAD posterior 9e5dfa1 tiene otro cambio de aislamiento concurrente. Source CI #42512536601 terminó con fallo en api:test: build y typecheck pasaron; 166/167 pruebas pasaron y las 23 pruebas nuevas de US-004 (inventario + capabilities) pasaron. La única falla fue la integración independiente tenant-job-record.integration.spec.ts, con SQLSTATE 42501 ('permission denied for table tenant_job_records') en PostgresTenantJobRecordWriter.stage; el target de Meta backend se omitió por el fallo previo. Esto no invalida los tests US-004, pero el HEAD posterior no tiene Source CI completo verde y la falla independiente debe corregirse por su owner.
- No hubo Meta API calls ni pruebas con cuenta real. No se añadieron endpoints ni migraciones: TASK-008 no aporta conexión runtime y META-010..015 siguen catalog-only.
- Estado: TASK-009 y TASK-010 in_progress, no verified/accepted. Pendientes: connection/token vault, adapter/provider, persistencia tenant-safe/RLS, sincronización durable, definiciones oficiales de capability por operación, endpoints congelados, evidencia de elegibilidad, revisión independiente y aceptación del Product Owner.

## Seguimiento del HEAD concurrente — 2026-11-08

- El Source CI #42512536601 del commit 9e5dfa1 pasó build y typecheck; api:test terminó 166/167. Las 23 pruebas nuevas de US-004 pasaron. La única falla fue tenant-job-record.integration.spec.ts (SQLSTATE 42501: permiso sobre platform.tenant_job_records), ajena al módulo Meta.
- El cambio de aislamiento fue corregido por el commit 2bfef634fb07603fb9ea1eb8df0127c4ece2ea49; el commit cd9ce49d082d6cf66f4a3c0f4e3818433f373950 añade una comprobación de idempotencia/INSERT. Source CI #42512743982 y CodeQL #42512744032 del HEAD cd9ce49 estaban in_progress al corte. No usar la ejecución fallida anterior como evidencia de defecto en US-004 ni declarar el HEAD actual completamente verde.
- El último CI completamente verde para el código de US-004 sigue siendo Source CI #42512364598 y CodeQL #42512364506 sobre 2f97c8a; allí pasaron build, typecheck, API/PostgreSQL y Meta backend/PostgreSQL/RabbitMQ.


## Handoff — US-002 asignación persistente de roles y refuerzo de auditoría (2026-11-08)

- Alcance: US-002 / TASK-004 / TASK-005. Se completó un slice de aplicación para asignar y revocar plantillas de rol tenant mediante aprobación independiente.
- Nueva migración 0007-tenant-role-assignment.sql: sincroniza las dos claves de permiso que faltaban (webhooks.dead_letters.read y jobs.replay.request), añade descripción/versionado persistido a roles, policies RLS para owner y grants column-scoped para crear plantillas/edges y revocar asignaciones.
- Se añadió TenantRoleAssignmentRepository para resolver la membresía en contexto tenant, materializar la plantilla versionada, comprobar igualdad exacta de permisos y persistir/revocar membership_roles. Se añadió TenantRoleAssignmentService con operaciones requestAssignmentApproval/requestRevocationApproval/assignApprovedRole/revokeApprovedRole.
- Los cambios se ligan a un snapshot SHA-256 que incluye operación, tenant, membership/user, estado de membresía, role key/version y permisos. El cambio final consume la aprobación y persiste edge + evento de auditoría dentro de ApprovalWorkflowService.consumeAndStage, en una transacción.
- Controles: solo tenant_owner solicita cambios; no hay autoasignación; no se conceden privilegios superiores a los del actor; solo roles tenant catalogados; approval independiente; step-up OIDC; la revocación del último owner activo falla y revierte también el consumo de la aprobación. Las escrituras están limitadas por RLS/grants y authzVersion.
- IdentityModule exporta el caso de uso internamente. No se publicaron rutas IAM; IAM-007..020 continúan catalog-only y bloqueadas por contract freeze.
- AuthorizationDecisionAuditService conserva eventos de denegación aun cuando el authzVersion del snapshot del actor está obsoleto, siempre que la membresía/tenant sigan activos. Las autorizaciones sensibles permitidas continúan exigiendo la versión exacta vigente.
- Pruebas nuevas: policy spec amplía request/revoke y una integración PostgreSQL cubre asignación, permisos exactos, revocación, reintento idempotente, protección del último propietario, step-up sintético y cadena de auditoría.
- Estado al crear este handoff: código preparado en environment/local; Source CI completo pendiente. No elevar TASK-004/005 a verified/accepted hasta leer CI, realizar review independiente y obtener aceptación del propietario.
- Límites abiertos: valores ACR/AMR del IdP real no verificados (fail-closed); contratos/endpoints IAM siguen cerrados; sin anclaje externo del ledger ni consumer de outbox de negocio; revisión independiente y aceptación pendientes. GO-PRODUCTION continúa NO-GO.


## Handoff — US-006: núcleo de plantillas (2026-11-08)

- Se añade bounded context interno apps/api/src/whatsapp/templates con parser/preview, service, idempotency support, PostgreSQL repository y módulo NestJS.
- Migración 0027 en microservices-meta-ecuapp crea plantillas, revisiones append-only e idempotencia; RLS FORCE y triggers validan actor/tenant.
- El rol de aplicación no puede alterar metadata de proveedor, ni modificar/eliminar revisiones. Permisos whatsapp.templates.read/create/update/delete declarados, sin grants automáticos.
- El service reutiliza TenantAccessContext, DatabaseService.withTenantContextAtVersion y AppendOnlyAuditRepository; no crea pools ni invoca HTTP Meta.
- WAM-001..007 continúan catalog-only según docs/49; sin controller ni operaciones remotas hasta TASK-008/TASK-010 runtime y contract freeze.
- AC-006-01/02/04 parciales; AC-006-03 pendiente de gate compartido en sender para estado APPROVED y compatibilidad/capability.
- Unit specs de dominio/servicio e integración PostgreSQL A/B añadidas a api:test; Source CI añade RUN_WHATSAPP_TEMPLATE_INTEGRATION_TESTS=true. Resultado CI de este commit aún pendiente.
- TASK-014/015 continúan in_progress; no se ha utilizado WABA real ni se ha obtenido Product Owner acceptance. Ver docs/71.



## Handoff — compatibilidad del catálogo de roles y feedback Source CI (2026-11-08)

- Source CI run 42513396813, commit 7b30d272: frozen install, migraciones 0001–0007 (incluida idempotencia), build y typecheck pasaron; la suite API registró 181 PASS / 5 FAIL.
- La nueva integración TASK-004/005 "PostgreSQL persists approved tenant role assignments atomically and protects the last owner" pasó. El fallo que afecta tres suites existentes fue que varios fixtures/consumidores legítimos insertan platform.roles sin description; 0007 introdujo un CHECK que requería description no vacía.
- Se añadió migration 0008-role-description-defaults.sql para mantener el CHECK y generar de forma determinista description desde display_name (o role_key) para escritores legados. La prueba de asignación valida también esta compatibilidad.
- Se corrigió el cierre doble del workerPool en tenant-job-record.integration.spec.ts (DatabaseService ya cierra su pool) y una ruta ESM relativa incorrecta en postgres-message-template.integration.spec.ts.
- Estado: correcciones preparadas en código/documentación; Source CI posterior pendiente. No declarar US-002 verified hasta que la suite completa pase. TASK-004/005 permanecen in_progress por IdP/owner bootstrap/review/aceptación.
- Dependencia operativa no resuelta: el primer tenant_owner debe ser creado por un flujo de provisioning confiable. No existe aún en esta capa un endpoint/flujo seguro de bootstrap inicial; no se permite autopromoción ni se inventa un actor de plataforma. El servicio implementa asignaciones posteriores.


## US-006 — segundo cierre de integración (2026-11-08)

- La verificación de audit stream exige audit.read. La integración PostgreSQL crea roles por tenant con permiso audit.read y conserva el permiso whatsapp.templates.* de la operación separado.
- El cleanup tenant-job elimina tenant_job_inbox antes de tenant_job_records por FK RESTRICT.
- La política template-send-policy deniega por defecto y solo permite estado APPROVED, Meta ID, ciclo local activo, category/language compatibles y capability available. Está lista como dominio pero no conectada al sender.
- Source CI #42513649341: migration/build/typecheck correctos, API 184/186; se corrigieron los dos fallos restantes. Nueva ejecución pendiente.


## Handoff US-006 — verificación final del slice local

- Commit validado: 966edfffe668f495dfbc2ac07072fb93b616c7c9.
- Source CI #42513964425: SUCCESS. CodeQL #42513964419: SUCCESS.
- Migration/replay idempotente, build y typecheck completados.
- API: 191/191 pruebas pass; Meta backend: 87/87 pass; ambos 0 fail y 0 skipped.
- La integración PostgreSQL de templates, los roles audit.read por tenant, RLS y revisiones append-only se verificaron en CI.
- El template-send-policy fail-closed está probado, pero todavía no hay sender real en apps/api/src ni wiring; no se afirma enforcement E2E.
- TASK-014/015 y US-006 continúan en progreso/no aceptados por los gates WAM-001..007, TASK-008/TASK-010 runtime, aprobación/sincronización Meta y falta de WABA real.



## Handoff final — US-002 verificada técnicamente por CI (2026-11-08)

- Rama: environment/local. Commit verificado: 966edfffe668f495dfbc2ac07072fb93b616c7c9.
- Source workspace validation #42513964425: SUCCESS. CodeQL #42513964419: SUCCESS.
- Source CI ejecutó migraciones versionadas, incluida 0008-role-description-defaults.sql, y comprobó idempotencia; build de las aplicaciones y typecheck: SUCCESS.
- Pruebas API/PostgreSQL: 191/191 PASS, 0 FAIL. Suite microservices-meta-ecuapp: 87/87 PASS, 0 FAIL. La prueba nueva "PostgreSQL persists approved tenant role assignments atomically and protects the last owner" pasó.
- Se corrigió compatibilidad con roles legados: el trigger de migration 0008 completa description desde display_name o role_key manteniendo roles_description_nonempty.
- TASK-004 y TASK-005: implementación y validación automatizada CI verificadas. No declarar accepted ni cerradas globalmente todavía: falta revisión independiente y aceptación del Product Owner.
- Dependencias/alcance abierto: bootstrap confiable del primer tenant_owner; validar ACR/AMR y freshness con el IdP real (producción sigue fail-closed); endpoints IAM-007..020 continúan catalog-only hasta contract freeze; consumer/outbox de efectos de negocio y gates operativos de auditoría siguen pendientes según sus paquetes.
- No se cambia GO-PRODUCTION: permanece NO-GO. La suite sintética PostgreSQL/step-up no equivale a una prueba con el IdP ni Meta app reales.


## Handoff — US-014: contexto del webhook y eventos compuestos (2026-11-08)

- Rama `environment/local`. Commits: `96506d956c4af70b061d02623fd42c0749f12fea` (decoder) y `5b7374ef39113d4a264bd1c0ccf9d8cda8428948` (tests).
- Se corrigió la pérdida de `metadata`, `contacts`, `messaging_product` y otros campos hermanos cuando el decoder divide `messages[]`/`statuses[]`. Cada evento incluye `providerContext` cifrado con object type, entry, entry time, field y el resto de `change.value` sin duplicar arrays.
- `messages[]` y `statuses[]` se procesan independientemente; ninguna rama excluye la otra. La clave de idempotencia se calcula antes de agregar el contexto complementario y permanece estable ante redeliveries con metadata distinta.
- Regresiones nuevas: `preserves WhatsApp metadata and emits both message and status arrays from one change`; `provider context does not change a message's stable idempotency key`.
- Source CI #42527271340 y CodeQL #42527271448 iniciados para HEAD `5b7374ef39113d4a264bd1c0ccf9d8cda8428948`; resultado pendiente al corte. No marcar el slice como CI-verified hasta inspeccionar sus conclusiones.
- US-014/TASK-027/028 continúan `in_progress`. Sin handlers reales, sin replay habilitado; CR-0016, retención, KMS, WAF/rate limit, callbacks Meta reales, deploy/SLO/load/DR, review independiente y aceptación aún abiertos. GO-PRODUCTION NO-GO.


## Handoff — US-013 / TASK-026 CAPI domain slice (2026-11-08)

- Rama exclusiva: `environment/local`. Se inspeccionaron workspace, permisos, DB context, auditoría append-only, job writer, módulos CRM/Privacy y gates CAPI OpenAPI antes del cambio.
- Código: `apps/api/src/marketing/conversions/domain` contiene validación pura fail-closed de action_source/event ID/website fields/consent; identidad local dataset + event_name + event_id; report tipado sin inferencia de match quality o atribución. El port `ConversionConsentVerifier` no tiene adapter permisivo.
- Suites unitarias integradas en el target `api:test`; Source CI del HEAD posterior todavía debe confirmar el resultado.
- US-013/TASK-026: `in_progress`; AC-013-01/02/03 parciales. No existe persistencia/dedupe DB, outbox/worker CAPI, Meta adapter, endpoints ni observaciones reales del proveedor.
- Bloqueadores: TASK-023 (Lead lifecycle), TASK-031 (security review), TASK-032 (consent adapter), CAPI-001..004 catalog-only, CR-0015 attribution window y capability/credenciales Meta.
- Documento: docs/72. GO-PRODUCTION permanece NO-GO; no hubo envío Meta ni uso de datos personales reales.
