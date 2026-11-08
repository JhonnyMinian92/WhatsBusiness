# 15 — Roadmap y control de avances

## Principio de avance
El roadmap mide implementación y verificación, no cantidad de documentación o commits. Cada estado debe tener IDs y evidencia en la matriz de trazabilidad. Una solicitud explícita del propietario para implementar/corregir habilita el trabajo correspondiente aunque existan otros gates pendientes; los gates de seguridad y producción siguen siendo obligatorios para liberar o ejecutar acciones de alto impacto.

## Fase 0 — Definición y sistema de agentes
- [x] Descomponer la investigación en documentos temáticos.
- [x] Crear contrato común para Codex, Claude, Copilot y agentes compatibles.
- [x] Crear grafo de dependencias y matriz de trazabilidad.
- [x] Definir handoff, estados y criterios de aceptación final.
- [x] Auditar inicialmente el repositorio real y establecer el inventario de código/tests existente (AUD-046..052); reconciliación integral TASK-001..080 sigue en curso.
- [ ] Validar alcance, historias, arquitectura y decisiones pendientes con el propietario.
- [ ] Validar APIs/permisos/eligibilidad con fuentes oficiales y cuenta de prueba.
- [ ] Aprobar threat model, privacidad, decisiones tecnológicas y SLO/RPO/RTO.
**Salida:** contexto autónomo para agentes y baseline verificado. La documentación creada no implica producto implementado.

## Fase 1 — Fundaciones de plataforma
Tenant, IAM, audit, secrets, asset registry, capability registry, webhook gateway, event bus, observability.
**Salida:** US-001..004, US-014..016 implementadas y verificadas con QA/security.

## Fase 2 — WhatsApp completo
Onboarding, management, Cloud API, templates, media, Flows, Marketing Messages, policy, cost ledger.
**Salida:** US-005..008 end-to-end y elegibilidad real.

## Fase 3 — Facebook/Messenger e Instagram
Pages, Messenger, Instagram login modes, publishing, comments, DM, insights.
**Salida:** US-009..010 con permisos y pruebas.

## Fase 4 — Leads, Ads y CAPI
Lead Ads, retrieval, campaign lifecycle, spend guardrails, conversions, attribution.
**Salida:** US-011..013 con conciliación.

## Fase 5 — Extensión y hardening
Threads, capacidades elegibles adicionales, performance, chaos, pentest, DR, runbooks.
**Salida:** US-017 y gates de release aprobados.

## Grafo de fases
```mermaid
flowchart LR
  DOC[Contexto y contrato de agentes] --> AUD[Auditoría del código real]
  AUD --> REQ[Requisitos y criterios reconciliados]
  REQ --> ARCH[Arquitectura y decisiones]
  ARCH --> SEC[Seguridad y privacidad]
  SEC --> FOUND[Fundaciones]
  FOUND --> WA[WhatsApp]
  FOUND --> SOCIAL[Pages / Messenger / Instagram]
  WA --> ACQ[Leads / Ads / CAPI]
  SOCIAL --> ACQ
  ACQ --> HARD[Hardening y operación]
  HARD --> VERIFY[Verificación integral]
  VERIFY --> OWNER[Aceptación explícita del propietario]
```

## Control de avance
| Indicador | Estado | Evidencia |
|---|---|---|
| Ramas | creadas | AUD-001/002; environment/local activa |
| Documentación temática | creada | docs/00..16 |
| Contrato universal y puentes de agentes | creado | AGENTS.md, CLAUDE.md, GEMINI.md, .github/copilot-instructions.md |
| Grafo y trazabilidad | creados | docs/18 y docs/19 |
| Criterios de producto terminado | definidos | docs/20 |
| Auditoría del código fuente | parcial | AUD-046..052; falta revisión independiente y reconciliación integral |
| TASK-001..080 | TASK-001/002/004/005 con slices implementados y CI-verified; TASK-003 y resto pendientes | docs/11, docs/58 |
| APIs/permisos/App Review | no verificado | Meta app/business |
| Producto implementado | foundation slices parciales; producto completo no declarado | Source CI #16/#47/#67/#112; docs/58 |
| Aceptación final | pendiente | exclusiva del propietario |

## Reglas de reporte
- Reportar tareas verificadas / total de tareas del alcance.
- Reportar criterios aprobados / total de criterios.
- Separar implementado, verificado, aceptado, bloqueado y no iniciado.
- Mostrar defectos abiertos por severidad y pruebas omitidas/flaky.
- No estimar porcentajes si el denominador o evidencia no existe.
- Cada sesión actualiza este documento, memoria corta, backlog y matriz de trazabilidad.


## Roadmap actualizado tras respuestas del propietario

La propuesta completa y los gates están en [31-MASTER-DELIVERY-PLAN.md](31-MASTER-DELIVERY-PLAN.md). Sustituye como secuenciación detallada al resumen previo de fases, manteniendo los principios de seguridad y aceptación de docs/20.

- Fase 0: descubrimiento y arquitectura.
- Fase 1: plataforma y developer experience.
- Fase 2: Meta Control Plane.
- Fase 3: WhatsApp + Inbox base.
- Fase 4: CRM y automatización básica/IA asistiva.
- Fase 5: Facebook Pages y Messenger.
- Fase 6: Instagram y Threads.
- Fase 7: Leads, Marketing API y CAPI.
- Fase 8: hardening, operación y producción.

Tareas nuevas TASK-034..041 en docs/11. Todas propuestas; ninguna implementada ni verificada. El owner confirmó greenfield, por lo que la auditoría técnica de código heredado queda cerrada como "no aplica"; se requiere auditoría de estructura/build/seguridad al crear la primera implementación.


## Baseline aplicada por delegación del propietario (2026-11-06)
La matriz PD-001..PD-023 y los ADR-011..020 adoptados están consolidados en docs/29 y docs/30. El plan detallado actual y normativo es docs/31 (fases 0–8); las fases resumidas anteriores deben interpretarse subordinadas a ese plan.

### Cambios incorporados
- Modelo SaaS: Ecuador SMEs commerce/services como hipótesis de entrada, agencias como segmento secundario.
- Suscripción tenant + seats + usage; cargos Meta separados; pricing sin definir hasta unit economics.
- es-EC/USD/America-Guayaquil; multi-tenant tenant_id + backend auth + RLS; agency grants.
- Modular monolith/API-worker; no microservicios prematuros.
- Meta v27 por adapter, Embedded Signup v4 evaluado, BSUID, WAAC/PMA, Marketing Messages API para marketing con sunset Cloud API 2027-10-13.
- OWASP ASVS 5.0.0, WCAG 2.2 AA, configurable retention y LOPDP review pendiente.
- SLO candidate 99.9%, RPO 15m, RTO 4h, no SLA y pendiente de benchmark/restore drills.

### Avance verdadero
| Área | Estado | Evidencia / pendiente |
|---|---|---|
| Decisiones de producto | baseline adoptada | docs/29 PD-001..023 |
| Investigación externa | registrada con fecha y fuentes | docs/32; revalidar al implementar |
| Arquitectura | dirección técnica adoptada | docs/30 ADR-011..020; TASK-039 spike pendiente |
| Roadmap por gates | definido | docs/31 |
| Backlog | ampliado | TASK-053..065 propuestas |
| Código de producto | no iniciado | Greenfield; no hay apps/packages de producto |
| Tests/benchmarks | no ejecutados | TASK-039/060/061 |
| Meta App Review/cuentas | no verificado | depende de app/Business reales |
| LOPDP revisión especializada | pendiente | no tratar datos reales en producción antes del gate |
| Producción/aceptación | no iniciada | exclusiva del propietario |

No calcular porcentaje global hasta que exista denominador de requisitos reconciliados y evidencia por criterio.


## Campaign Intelligence milestone
Fase 7 incluye Campaign Intelligence (US-029), Creative Lab (US-030), Meta agent interoperability (US-031) y Meta API/policy intelligence (US-032). Dependencias y gates están en docs/31, docs/18 and docs/36. TASK-067..080 remain proposed. No direct Andromeda control is assumed.

## Final handoff after Meta Ads AI research
- Docs 34–36 document Meta advertising AI, reference repositories and Campaign Intelligence design.
- US-029..032 and TASK-067..080 are the new proposed scope.
- PD-024 and ADR-021/022 define the owner-approved 20% budget safeguard and separation between Meta delivery AI and WhatsBusiness learning engine.
- Current code implementation remains not started; documentation commits do not count toward software completion.


## Kickoff readiness reconciliation — 2026-11-06

La fase resumida antigua de este archivo queda subordinada al plan normativo docs/31 y al paquete docs/46. Las decisiones PD-001..PD-024 ya están consolidadas en docs/29; no volver a presentarlas como preguntas sin respuesta.

Estado actual:
- Preparación documental TASK-034..038: especificaciones creadas en docs/37..41; falta review independiente, no desarrollo funcional.
- Contratos y modelo lógico: primera base en docs/42..43 y contracts/; faltan lint, contract review y pruebas ejecutables.
- Threat model: versión inicial docs/44; falta revisión independiente y test mapping final.
- TASK-039/G0: pendiente de ejecutar SP-01..07 en entorno con Docker y recursos medibles.
- TASK-041/060/061: sin presupuesto VPS aprobado, benchmark ni restore drill.
- Meta, LOPDP, proveedor IA y producción: gates externos específicos; no bloquean la preparación sintética.


## Actualización — Identity foundation (2026-11-07)

- GO-CODE vigente exclusivamente en environment/local.
- Source y Contract CI pasaron en el scaffold anterior; este cambio amplía source CI con migración PostgreSQL y RLS integration.
- Identity foundation incorpora OIDC/JWKS, identidad issuer+subject, User/Tenant/Membership y PLT-003..005 read-only.
- TASK-001/002/004 siguen in_progress hasta workflows verdes de este slice y review independiente.
- Siguiente dependencia: provisioning/membership lifecycle, RBAC/ABAC, audit/outbox y worker tenant context antes de habilitar mutaciones.
- G0-PRODUCTION continúa NO-GO.

## Actualización — Tenant Context / TASK-002 (2026-11-07)

- TASK-001: implementada y CI-verified (migración 0002, ownership y lifecycle). Review independiente y acceptance pendientes.
- TASK-002: implementada y CI-verified (migración 0003, autorización tenant fail-closed, guard por propósito, contexto inmutable, authzVersion y pruebas de revocación/concurrencia). Review independiente y acceptance pendientes.
- Evidencia TASK-002: Source CI run #47 [42383524043](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42383524043), commit `74febd28056043cda15221f29c8c5b71290ca06c`.
- Siguiente dependencia de autorización: TASK-004 RBAC/ABAC. TASK-003 debe cubrir jobs, cache, files y telemetry con namespaces tenant-safe. TASK-005 depende de TASK-004.
- No calcular porcentaje global: la matriz completa de requisitos, criterios y evidencias aún no está reconciliada para todo el producto. G0-PRODUCTION permanece NO-GO.
## Actualización — RBAC/ABAC / TASK-004 (2026-11-07)

- TASK-004 incorpora migration 0004, catálogo tipado de permisos, role templates tenant least-privilege, policy evaluator RBAC/ABAC, guard declarativo HTTP y protección de asignación contra self-escalation.
- Source CI run #67 [42385036275](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42385036275) — SUCCESS, commit `53e50dc00daccc7c64c7931e468e6ef0af132940`.
- Estado técnico: núcleo implemented y CI-verified; no se declara tarea accepted/verified mientras estén pendientes review independiente, assignments persistentes y audit/approval workflows.
- IAM-007..020 siguen catalog-only. No se añadieron rutas ni escrituras HTTP.
- Próximo tramo: TASK-005 para step-up, aprobación independiente, append-only audit/outbox y protección de acciones privilegiadas; TASK-003 mantiene aislamiento operativo jobs/cache/files/telemetry pendiente.
## Actualización — TASK-005 Approval / Step-up / Audit (2026-11-07)

- Migration 0005 crea solicitudes/decisiones de aprobación y ledger append-only hash-chain por tenant, con RLS, grants limitados y transiciones restringidas por triggers.
- Backend: step-up OIDC con claims firmados y allowlist fail-closed; approval workflow idempotente/hash-bound/quorum; self-approval bloqueada; consumo transaccional; auditoría sensible/denegaciones.
- Source CI run #112 [42387272987](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42387272987) — SUCCESS, commit `b38b78ab52dbb96262dc8078518fdf4f55fc5a2c`, integración PostgreSQL efímera activa.
- Limitaciones: sin IdP real ni ACR/AMR allowlist activa, IAM-018..020 catalog-only, sin outbox/consumers de negocio y sin revisión/anclaje externo del hash-chain. No se permiten acciones externas.
- TASK-001/002/004/005 tienen slices implementados y CI-verified; no están accepted/verified globalmente. TASK-003 (aislamiento jobs/cache/files/telemetry), assignments persistentes, grants agency/JIT y workers permanecen en backlog.
## Estado real de plataforma — 2026-11-07

| Tarea | Estado técnico actual | Evidencia | Límites para cerrar |
|---|---|---|---|
| TASK-001 | Slice Tenant ownership/lifecycle implementado y CI-verified | Source CI #16; docs/58 §7 | Review independiente, aislamiento operativo y aceptación |
| TASK-002 | Tenant context fail-closed, propósito y authzVersion implementados y CI-verified | Source CI #47; docs/58 §8 | Cobertura de todos los recursos/workers y review independiente |
| TASK-003 | Slices de aislamiento multi-tenant, runtime durable, endpoint HTTP Prometheus, gauges PostgreSQL y gauges RabbitMQ de mensajes listos/consumidores implementados; estado global `in_progress` | Source CI #42434224485 endpoint y #42435204662 PostgreSQL gauges/migrations/tests SUCCESS; docs/60 y docs/63. CI de canal/reader/gauges RabbitMQ pendiente | Unacked/consumer lag autoritativo, dashboards/alertas/SLO, DLQ operator workflow/replay, handler real e2e, topology broker desplegado, Secret Manager/rotación, carga/DR y review independiente/owner acceptance |
| TASK-004 | Core RBAC/ABAC, catálogo/roles declarativos y anti-escalation implementados y CI-verified | Source CI #67; docs/58 §9 | Persistir assignments/administración y review independiente |
| TASK-005 | Core step-up/approval/audit implementado y CI-verified con PostgreSQL efímero | Source CI #112; docs/58 §10 | IdP real, outbox/consumer, contratos IAM, auditoría/review independiente y owner acceptance |

**Interpretación:** tener un slice implementado y pasar CI no completa US-001/002. El producto sigue en construcción y GO-PRODUCTION permanece NO-GO. No se declara porcentaje global mientras no se reconcilien todos los AC de US/TASK con módulos, tests y evidencias independientes.

## Actualización de ejecución — estabilización de Source CI (2026-11-08)

- Source CI #527 finalizó cancelled después de 30 minutos dentro de microservices-meta-ecuapp:test. Instalación frozen, migraciones e idempotencia, roles DB, build y typecheck fueron SUCCESS; el paso pendiente fue completar las suites del backend.
- Se corrigió el teardown de la prueba RabbitMQ para que los recursos temporales no queden fuera de ámbito y la conexión se cierre siempre. También se corrigió la ruta de una suite de supervisor Meta inexistente y se añadió la prueba real.
- El siguiente gate obligatorio es Source CI completo (unitarias + PostgreSQL/RabbitMQ integration). TASK-003 y TASK-027/028 permanecen in_progress hasta tener evidencia del commit corregido, completar handlers/replay y cerrar los gates operativos/independientes. GO-PRODUCTION sigue NO-GO.


## Actualización de ejecución — Source CI #528 y siguiente gate (2026-11-08)

- Source CI #528 completó el target de pruebas en ~10 s; no repitió el timeout anterior. Resultado: 80/82 tests del backend pasaron; fallaron el fixture RabbitMQ por inicializar el binding de producción junto al temporal y los permisos de columnas clave de inbox/outbox para INSERT idempotente.
- La integración RabbitMQ ahora crea únicamente exchanges y usa la cola temporal para la prueba; la migración 0019 añade SELECT por columna sobre las claves únicas necesarias para ON CONFLICT, sin abrir ciphertext.
- CodeQL #66 SUCCESS. El siguiente gate es Source CI para el commit que incluye estos dos ajustes y la migración 0019, incluida la repetición idempotente de migraciones.
- TASK-003/027/028 siguen in_progress. El cierre funcional todavía exige handlers/replay reales, límites operativos y aceptación independiente; GO-PRODUCTION sigue NO-GO.


## Actualización de ejecución — Source CI #536 y hardening pendiente (2026-11-08)

- Source CI #536 SUCCESS: instalación congelada, migraciones 0001–0020 e idempotencia, build, typecheck, `api:test`, `microservices-meta-ecuapp:test` y limpieza de servicios efímeros.
- CodeQL #74 SUCCESS. El commit posterior ff89b71 es la sincronización automática del lockfile, no un cambio de lógica.
- Se comprobó que `NOINHERIT` no impide `SET ROLE` cuando la membresía mantiene SET habilitado. Se agregó migración 0021 para retirar la membresía redundante y los grants de outbox al grupo; las pruebas de ACL requieren Source CI posterior.
- TASK-003/027/028 siguen in_progress; los siguientes cierres son hardening de permisos, handlers idempotentes de negocio, replay con aprobación, políticas de retención, KMS, WAF/rate limits, despliegue/observabilidad, carga/DR y revisión independiente. GO-PRODUCTION sigue NO-GO.


## Actualización de ejecución — Source CI #560 / reparación del test de métricas de broker (2026-11-08)

- Source CI #560 confirmó SUCCESS en frozen install, migraciones 0001–0023/idempotencia, build, typecheck y API tests; falló la suite backend durante la integración RabbitMQ Management API, cuyo proceso alcanzó el timeout de 8 minutos.
- El log muestra el test fallido en ~104 ms, pero no registra el detalle de la aserción porque el proceso no termina. Se localizaron defectos de diagnóstico/lifecycle: el reader ocultaba el status HTTP y las llamadas de cleanup AMQP eran secuenciales y sin límite.
- Se implementó un cambio acotado: status HTTP seguro sin exponer body, setup bajo try/finally, timeout del test, lectura/polling acotado, cleanup best-effort con límites y cierre de canales/conexión. Se conserva el usuario monitor-only con permisos vacíos.
- Próximo gate: Source CI/CodeQL del nuevo HEAD. No declarar métricas live verificadas ni cerrar TASK-003 sin SUCCESS; SLO, dashboards/alertas, DLQ operator, handlers reales, KMS/rotación, despliegue, carga/DR y revisión independiente siguen pendientes.


## Actualización de ejecución — cierre de conexión RabbitMQ en runtime (2026-11-08)

- En el backend, el test de métricas Management API y el cierre compartido AMQP evidenciaron un riesgo de lifecycle: el factory esperaba que cerrasen los canales antes de cerrar la conexión padre. Ante un RPC pendiente, el cierre/reconnect podía quedar bloqueado.
- RabbitMqConnectionFactory.close ahora cierra directamente la conexión AMQP padre, lo que invalida operaciones pendientes y termina sus canales. El test real de redelivery ahora simula el crash cerrando la conexión completa, no únicamente el consumer channel.
- Source CI #561 todavía estaba en el test backend al preparar el cambio; no se toma como resultado. El siguiente push lo sustituye por concurrency cancel-in-progress; Source CI/CodeQL del nuevo HEAD pendientes.
- TASK-003 sigue in_progress. El nuevo gate debe pasar unidad, PostgreSQL/RabbitMQ, build/typecheck y CodeQL antes de atribuir verificación.

## Actualización de ejecución — compatibilidad RabbitMQ 4.4 del test live (2026-11-08)

- Source CI #560/#562 superaron instalación frozen, migraciones 0001–0023/idempotencia, build, typecheck y API tests; la suite backend falló en la prueba live de Management API.
- El log de RabbitMQ reveló que el fixture temporal no exclusivo activaba `transient_nonexcl_queues`, una característica rechazada por RabbitMQ 4.4.
- Commit `92b46d68bc8070a086b95352d504797fe1bf0c3d` modifica únicamente el fixture para usar colas efímeras exclusivas de la conexión. Se mantienen intactas las quorum queues durables del runtime.
- Source CI #563 y CodeQL #98 deben confirmar el cambio. No declarar las métricas live verificadas ni cerrar TASK-003 sin SUCCESS del HEAD corregido y review operativo. TASK-003/027/028 permanecen `in_progress`; GO-PRODUCTION sigue NO-GO.

## Actualización de avance — CRM Contacts HTTP slice (2026-11-08)

- El primer slice transaccional CRM dejó de ser solo código interno: CRM-001..004 están habilitadas en OpenAPI y `CrmContactsModule` forma parte de `AppModule`.
- El allowlist de contratos acepta exactamente nueve operaciones (PLT-001..005 + CRM-001..004); no se abre el catálogo restante.
- Source CI #570, Contract CI #29 y CodeQL #105 terminaron SUCCESS en los HEAD indicados en `docs/66-CRM-CONTACTS-API-CONTRACT-FREEZE.md`.
- TASK-042 permanece `in_progress` por review y aceptación, y CRM-005..017 siguen fuera de alcance. El siguiente trabajo CRM de producto depende del cierre de Contact API y del event bus (TASK-028).
## Actualización — Source CI #572 SUCCESS (2026-11-08)

- El reader RabbitMQ utiliza Prometheus Detailed Metrics, no Management API ni permisos AMQP de lectura.
- El fixture live mantiene las colas exclusivas por conexión con `autoDelete=false`; `finally` las elimina después del scrape idle, evitando que desaparezcan al cancelar el último consumer.
- Source CI #572 y CodeQL #107 SUCCESS en `1c6e682eb755e77b8359e52d4e7091a41e4ef6d5`; suite incluye migraciones/idempotencia, provisioning, build/typecheck, API/PostgreSQL, backend/PostgreSQL/RabbitMQ y refuerzo de guards CRM.
- TASK-003/027/028 siguen `in_progress` por handlers de negocio, operación desplegada, alert routing, SLO, carga/DR y aceptación. TASK-042 sigue `in_progress` por review/aceptación del propietario.

## Actualización — CRM ContactIdentity slice / 2026-11-08

- Se incorporó en environment/local el slice de CRM-005 (list identities) y CRM-006 (link identity), junto con migraciones 0024/0025 y contratos design-frozen.
- El OpenAPI conserva 296 operaciones HTTP: 11 design-frozen/implementation-allowed y 285 catalog-only. El allowlist exacto se amplía solo a CRM-001..006 + PLT-001..005.
- El modelo impone identidad namespaced por tenant; teléfono no es PK universal, colisiones no revelan el otro contacto y no existe merge automático.
- Código/tests/contrato ya están en el cambio; Source CI y Contract CI del nuevo commit todavía deben confirmar build, typecheck, migraciones repetidas, pruebas unitarias/PostgreSQL y validez OpenAPI.
- TASK-043/053 permanecen in_progress: no cubre candidatos, merge reversible, asociaciones Asset Registry ni verificación real de cuentas Meta. TASK-042 permanece pendiente de revisión independiente/aceptación.
- GO-PRODUCTION permanece NO-GO. No se declara porcentaje global hasta reconciliar criterios de producto con evidencia.


### Corrección de Source CI #574 — 2026-11-08

El primer commit CRM Identity superó build/typecheck, migraciones y Contract CI/CodeQL. Source CI detectó que las nuevas claves de permiso solo estaban declaradas en TypeScript y que dos asserts del nuevo test de controlador no correspondían a llamadas síncronas. Se añadió la migración API 0025 para sincronizar platform.permissions y se corrigió el test a assert.throws. El commit correctivo aún debe pasar Source CI y revalidación de contratos antes de aceptar el slice.


### Evidencia de CI — HEAD 19e1c585648e510d67bc1d13eab9761775b56cf2

- Source CI #578: SUCCESS; finalizó build/typecheck, migraciones y replay idempotente, pruebas API/PostgreSQL y backend Meta con PostgreSQL/RabbitMQ.
- CodeQL #113: SUCCESS. CodeQL #112 y CodeQL #110 también SUCCESS en commits anteriores del mismo conjunto.
- Contract CI #30: SUCCESS sobre el OpenAPI y allowlist 11 design-frozen + 285 catalog-only, sin cambios posteriores del contrato.
- CRM Identity está validado como slice de código/contrato, no como CRM completo. TASK-043/053 siguen in_progress.
- El catálogo tenant-role es declarativo; hasta completar TASK-004 no existen grants persistidos automáticos para las plantillas. Mantener fail-closed y no prometer acceso a los usuarios existentes.
- Las métricas de antigüedad de ejecución quedan implementadas y validadas; el fixture de integración se corrigió para no reclamar accidentalmente leases por un query batch.


### Evidencia CRM-007 — 2026-11-08

El motor de candidatos duplicados de contactos quedó CI-verified a nivel de dominio en commit 82eff584655212c16a4f59bce9542aeedf978bc4 (Source CI #585, CodeQL #120). El estado global de TASK-043/053 sigue in_progress: faltan consulta tenant-scoped paginada, contrato HTTP, audit/review, reversible merge/undo, asociaciones Asset Registry y aceptación.


## Evidencia de señal cross-channel — 2026-11-08

La estrategia `SAME_VERIFIED_PHONE_E164` se verificó en commit `d3d3b0722a61494eb8b8ba1d2e7c769ab2383f3d`: Source CI #587 SUCCESS y CodeQL #122 SUCCESS. Source CI ejecutó lockfile congelado, validador de observabilidad, migrations/idempotencia, build, typecheck, suites API/PostgreSQL y Meta backend PostgreSQL/RabbitMQ. El target `api:test` incluye 11 casos CRM del detector. La coincidencia cross-channel requiere mismo provider, E.164 exacto y `verifiedAt` no nulo en ambos perfiles; el resultado sigue siendo `manual_review_required`.

## Avance US-004 — modelo de activos y capability evaluator (2026-11-08)

Se añadió el primer núcleo de Meta Control Plane:

- TASK-009: modelo de inventario namespaced para Business Portfolio, WAAC, PMA, phone number, Page, Instagram professional account, Ad Account, Lead Form y Dataset. La reconciliación conserva historial, ignora snapshots antiguos y solo marca un activo no visible cuando la cobertura del tipo fue completa.
- TASK-010: evaluador por operación y versión que exige evidencia explícita y diferencia denegación de incertidumbre; valida autorización, tenant policy, purpose, asset grant/tasks, OAuth scopes, entitlements, App Review, App Mode, Marketing API Access Tier, account type/country, API version y approval/consent según definición.
- Se añadieron 23 casos unitarios a api:test. Source CI #42512236821 falló inicialmente por TS4111; la corrección se publicó en 2f97c8a94275c87f8543de065c30ae00cbf52b43. Source CI #42512364598 terminó SUCCESS (build, typecheck, API unit/PostgreSQL integration y backend PostgreSQL/RabbitMQ integration) y CodeQL #42512364506 terminó SUCCESS sobre 2f97c8a. El HEAD 9e5dfa1 agrega un cambio separado de aislamiento. Source CI #42512536601 terminó con fallo en api:test: build y typecheck pasaron; 166/167 pruebas pasaron y las 23 pruebas nuevas de US-004 (inventario + capabilities) pasaron. La única falla fue la integración independiente tenant-job-record.integration.spec.ts, con SQLSTATE 42501 ('permission denied for table tenant_job_records') en PostgresTenantJobRecordWriter.stage; el target de Meta backend se omitió por el fallo previo. Esto no invalida los tests US-004, pero el HEAD posterior no tiene Source CI completo verde y la falla independiente debe corregirse por su owner.
- Este avance no termina las tareas. TASK-008, adaptador Meta, almacenamiento seguro de conexión, persistencia/RLS, sincronización, catálogo por operación y contract freeze siguen pendientes. META-010..015 permanecen catalog-only; no se activaron endpoints ni acciones externas.
- Próximo paso técnico condicionado: cerrar TASK-008 o su contrato de conexión, luego congelar los schemas y permisos por cada META operation; conectar el reader real, repository y auditoría al dominio ya creado.
