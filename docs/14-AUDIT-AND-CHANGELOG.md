# 14 — Auditoría, decisiones y control de cambios

## 1. Registro de auditoría del producto
Cada acción relevante: actor, tenant, rol, acción, recurso, purpose, timestamp UTC, correlation ID, resultado, before/after references, source, approval ID y evidencia. Append-only, acceso restringido y retención definida.

## 2. Registro documental de cambios
Formato CR:
- ID, fecha, autor, estado.
- Motivación y problema.
- Evidencia/fuente.
- Alcance y requisitos afectados.
- Alternativas consideradas.
- Impacto en seguridad, privacidad, costes, arquitectura y compatibilidad.
- Tareas/historias afectadas.
- Plan de migración/rollback.
- Aprobadores.
- Pruebas/evidencia y fecha de cierre.

## 3. Registro de bugs
Formato BUG:
- ID, título, estado, severidad y prioridad.
- Entorno, commit, versión API y tenant pseudónimo.
- Precondiciones y pasos reproducibles.
- Resultado esperado/actual.
- Evidencia sin PII/secretos.
- Impacto, alcance y tenants afectados.
- Causa raíz.
- Mitigación y corrección.
- Test de regresión.
- Tareas/historias/CR vinculados.
- Responsable, fecha detectado/cerrado.

## 4. ADR
ADR numerado, status (proposed/accepted/superseded), contexto, decisión, alternativas, consecuencias, seguridad, coste, reversibilidad y fecha de revisión. Nunca borrar ADR reemplazado; marcar superseded y enlazar reemplazo.

## 5. Auditoría inicial
| ID | Evento | Resultado |
|---|---|---|
| AUD-001 | Creación de `environment/local` | creada desde master |
| AUD-002 | Creación de `environment/develop` | creada desde master |
| AUD-003 | Inicio de descomposición documental | en curso |
| AUD-004 | Código fuente | no iniciado, según instrucción |

## 6. Control de cambios preventivos
CR-0001 a CR-0020 están enumerados en el backlog como decisiones/validaciones pendientes. No marcar como aprobados ni cerrados sin evidencia.


## 7. Auditoría del sistema de agentes (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-005 | Contrato universal de agentes | AGENTS.md creado como entrada obligatoria |
| AUD-006 | Compatibilidad de instrucciones | CLAUDE.md, GEMINI.md y .github/copilot-instructions.md creados como puentes al contrato canónico |
| AUD-007 | Operación y handoff | docs/17 define bootstrap, ejecución, memoria y cierre |
| AUD-008 | Grafo de dependencias | docs/18 incorpora DAG de épicas/tareas y reglas de ejecución |
| AUD-009 | Trazabilidad | docs/19 conecta requisitos, historias, tareas, módulos, pruebas y evidencia |
| AUD-010 | Aceptación del producto | docs/20 separa implementación, verificación y aceptación del propietario |
| AUD-011 | Validación de rama | environment/local comparada con master: ahead 31, behind 0; archivos documentales y agent instructions presentes |

Esta auditoría confirma la creación y lectura posterior de los documentos; no certifica implementación de código ni ejecución de pruebas del producto.


## 8. Decisiones y cambios posteriores (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-012 | Respuestas Q-001..Q-010 del propietario | Baseline parcial registrada en PD-001..PD-011 |
| CR-0021 | Confirmación SaaS + plataforma interna EcuApp | Aprobada por propietario |
| CR-0022 | Confirmación greenfield | Aprobada por propietario |
| CR-0023 | Confirmación alcance completo de Meta | Aprobada como alcance objetivo; elegibilidad externa pendiente |
| CR-0024 | Confirmación CRM + inbox omnicanal + panel web | Aprobada por propietario |
| CR-0025 | IA inicial básica y extensible | Aprobada: chatbots y sugerencias; capacidades avanzadas no asumidas |
| ADR-011..017 | Stack/infraestructura recomendadas | Proposed; requieren architecture spike |
| AUD-013 | Documentos 29–31 creados | Verificados por lectura GitHub posterior a escritura |

Esta actualización es especificación documental. No crea evidencia de código, pruebas, Meta App Review, despliegue ni ejecución multiagente.


## 9. Auditoría — decisiones por delegación e investigación (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-014 | Aplicación por delegación de recomendaciones pendientes | PD-012..PD-023 consolidadas en docs/29; se distinguen decisiones de hipótesis y reservas de negocio/legal/coste |
| AUD-015 | Investigación Meta actualizada | docs/32 registra API v27, Marketing API Access Tier, Embedded Signup v4, BSUID, WAAC/PMA y Marketing Messages API sunset |
| AUD-016 | Privacidad y seguridad | LOPDP/SPDP y OWASP ASVS 5.0.0 añadidos como evidencia/control; no se declara conformidad legal o certificación |
| AUD-017 | Arquitectura | ADR-011..020 adoptados como dirección; modular monolith y procesos API/worker; TASK-039 spike pendiente |
| AUD-018 | Operación y métricas | SLO candidatos, four golden signals, p50/p95/p99 y TASK-060/061 documentados; ningún benchmark ejecutado |
| AUD-019 | Backlog/trazabilidad | TASK-053..065 y US-025..027 añadidos; estados propuestos |
| AUD-020 | Política Git/release | environment/local es única rama de escritura de trabajo; master/develop y producción protegidas sin aprobación explícita |

### Evidencia de commits de documentación
- docs/29: 5850351693cd9706bb1aa12d5c71f34838114f10
- docs/32: 3618a1283676dcabb7bc07c3b389928fd2896e6b
- docs/30: d993425881c6f6a6726785992cde697c1e1e14a7
- docs/31: 218b2d4f3f9a07e08bcdb9cbaff9a08b59295337
- docs/05: 8cce820cd1aaf6fd1d9c89b0e479fc0badf2fc81
- docs/09: 2aa13004049d00a27bccdb428a55ba085418cf4e
- docs/AGENTS: d19b6b1b944ee879c7a768088adf0f1dbb00efd7
- docs/00: 13245b83fb1251087f5490500d5e48fa72f3f072
- docs/01: 0b1a32ab68adbfca723ee4cd8f4f08c5bf4333df
- docs/02: f15475231c212d7e87b0afddfee5b3abebffe815
- docs/06: 1af3d97646b844faccddbbfe9a47eb6e38011eb9
- docs/08: f8a5e8baf5cc21e4a1f5c4e7253cfdc9595945a3
- docs/11: e86dc807ed467f4226f1d6192af0d28de50372d9
- docs/12: fa0b4c0fb94cfe9b1ebd49ff254fac859d67e18b
- docs/13: c27aa4c8f783e96b08b1815b5e0825296d261099

Los SHAs anteriores identifican commits que modificaron cada documento; no equivalen a verificación de contenido/código de producto. Los siguientes cambios también deben añadirse aquí cuando se ejecuten.


## 10. Registro adicional de sincronización documental (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-021 | Contrato de agentes y memoria central | AGENTS, docs/00, docs/01 y docs/02 alineados a PD-012..023 |
| AUD-022 | Dominio, privacidad y seguridad | docs/06 y docs/08 incorporan monetización, partners, locale, ASVS y privacidad configurable |
| AUD-023 | QA y SRE | docs/12 y docs/13 incorporan ASVS, WCAG, golden signals, percentiles y SLO candidatos |
| AUD-024 | Backlog de evolución | TASK-053..065 añadidas; estados proposed |
| AUD-025 | Historias | US-025..027 agregadas para partners, billing transparente y developer API |
| AUD-026 | Trazabilidad | docs/19 enlaza PD-012..023, US-025..027 y TASK-053..065 |
| AUD-027 | ADR formales | docs/33 formaliza ADR-011..020; spike pendiente |
| AUD-028 | Índice documental | docs/README incluye docs/32 y docs/33 |

No se han ejecutado builds, tests de producto, benchmarks, Meta account checks ni revisión legal durante estos cambios documentales.


## 11. Final validation checkpoint (AUD-029; 2026-11-06)
- GitHub compare master → environment/local: status ahead, behind_by 0 at validation checkpoint. Exact ahead count changes as documentation commits are appended; re-run compare before merge/release.
- GitHub compare environment/develop → environment/local: status ahead, behind_by 0.
- GitHub compare master → environment/develop: identical at checkpoint.
- Read-after-write fetch confirmed current content for AGENTS.md, META_SERVICES.md, docs/00, 01, 02, 04, 05, 06, 08, 09, 10, 11, 12, 13, 14, 15, 18, 19, 28, 29, 30, 31, 32, 33 and docs/README.
- Marker checks confirmed PD-023, ADR-020, US-027, TASK-065, Meta sunset, ASVS, candidate SLO and index links are present in their expected documents.
- No product source exists in the inspected scope; no product build, unit/integration/E2E test, benchmark, pentest, restore drill, live Meta integration or deployment was executed.
- This is a documentation consistency/readback checkpoint only, not a software release or product acceptance.


## 12. Evidencia de mercado y discovery (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-030 | INEC REEM 2025 y validación ICP | docs/32 registra 1.204.276 empresas (base provisional 2025), desagregación sectorial y límites metodológicos; no se interpreta como TAM |
| AUD-031 | US-028 / TASK-066 | Se creó trabajo de discovery cualitativo y pilotos antes de pricing/forecast; estado proposed |


## 13. Campaign AI research, product rules and reference benchmark (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-032 | Meta Ads AI research | docs/34 registra Andromeda, GEM, Advantage+ Creative, Ads Creative Studio, Ads MCP, Business Agent and Social Technologies MCP with evidence/limits |
| AUD-033 | PD-024 campaign spend guardrail | +20% per action and rolling 24h cumulative cap adopted as owner policy, explicitly not Meta universal rule |
| AUD-034 | Campaign Intelligence design | docs/36 defines two learning planes, Creative Lab, controlled test cells, budget optimizer, CRM/CAPI signals and no-go policies |
| AUD-035 | Reference project benchmark | docs/35 compares Chatwoot, Twilio Node SDK, httpSMS, Android SMS Gateway and OpenWA from representative files |
| AUD-036 | Product requirements/backlog | US-029..032 and TASK-067..080 added as proposed and traced in docs/19 |
| AUD-037 | Formal architecture decisions | ADR-021/022 added to docs/33 for learning plane and budget/official API policy |

No Ads integration, optimizer, AI agent execution, performance benchmark or live campaign change has been implemented/executed by this documentation update.

## 14. Campaign Intelligence and repository benchmark audit (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-038 | Meta Ads AI/Andromeda/GEM research | docs/34 registra evolución Andromeda 2024/2026, GEM, Advantage+, Ads Creative Studio, Meta Ads MCP, Business Agent y Social Technologies MCP |
| AUD-039 | 20% budget rule clarification | PD-024 adoptada como regla interna +20% por operación y rolling 24h; investigación no encontró umbral universal Meta. Diferenciación documentada con Ad Set Budget Sharing |
| AUD-040 | Campaign Intelligence architecture | docs/36 define dos planos de aprendizaje, campaign snapshots, CRM/CAPI outcomes, Creative Lab, test cells, approval, reconciliation y budget guardrails |
| AUD-041 | Open source/provider benchmark | docs/35 documenta Chatwoot, Twilio SDK, httpSMS, Android SMS Gateway y OpenWA, con archivos representativos y decisiones de adopción/no-go |
| AUD-042 | Requirements and backlog | US-029..032 y TASK-067..080 agregados; estados proposed; trazabilidad y DAG actualizados |
| AUD-043 | ADRs campaign/agents | ADR-021/022 documentan Campaign Intelligence y política de escalado/uso exclusivo de APIs oficiales |
| AUD-044 | Documentation read-back | docs/29, docs/32..36, stories, backlog, graph, traceability, index y agent contract releídos; markers PD/US/TASK/ADR presentes |

### Git branch isolation at final validation
- Compare master → environment/local: ahead 163 / behind 0.
- Compare environment/develop → environment/local: ahead 156 / behind 0.
- Compare master → environment/develop: identical, ahead 0 / behind 0.
- No merge, production deployment, live campaign change or code implementation was performed.
- No product test suite, architecture spike, benchmark for WhatsBusiness, Meta account authorization or legal assessment was run.


## 15. Kickoff readiness audit (AUD-045; 2026-11-06)

- Se crearon especificaciones docs/37..41 para completar los detalles funcionales iniciales de TASK-034..038.
- Se crearon modelo lógico docs/42, convenciones/contratos docs/43, threat model/data inventory docs/44, runbook TASK-039 docs/45 y paquetes de inicio docs/46.
- Se añadieron contratos OpenAPI, AsyncAPI y JSON Schema en contracts/.
- Se sincronizaron README, índice documental, AGENTS, memoria, backlog, roadmap, trazabilidad y catálogo Meta.
- No se ejecutó código, build, lint, tests, Docker, spike, benchmark, restore, Meta app/account test, revisión legal ni despliegue en este cambio.
- En el entorno usado para esta auditoría se observó Node.js v22.16.0 y npm 10.9.2; pnpm y Docker/Compose no están instalados. No representa la capacidad del VPS.
- Dictamen: GO condicionado para revisión de especificaciones y TASK-039; NO-GO para declarar G0 aprobado o iniciar scaffold definitivo hasta aportar evidencia del spike y review independiente.


## 16. CI reproducible y foundation Identity/Tenant/Membership (AUD-046/047; 2026-11-07)

| ID | Cambio | Alcance / control |
|---|---|---|
| AUD-046 | Workflows source/contract y lockfile | Source sincroniza dependencias, comprueba instalación frozen, build, typecheck y tests; integra PostgreSQL efímero con migraciones/RLS. Contract CI valida OpenAPI, AsyncAPI, JSON Schema y API implementation gates. |
| AUD-047 | Platform Identity foundation | OIDC RS256/JWKS, resolución issuer+subject, migración Organization/User/Tenant/Membership/Role/Permission/Entitlement, RLS y endpoints PLT-003..005 read-only. |

Resultado de automatización: Source CI #42376234089 y Contract CI #42376234088 finalizaron SUCCESS para el commit 0e0927bdcae658d4e4b1ccae28a5c5f89cf4b183. Se verificaron instalación congelada, migración PostgreSQL, build, typecheck, pruebas OIDC/RLS y contratos OpenAPI/AsyncAPI/JSON Schema. El lockfile quedó confirmado en d81593601101d97623684ea02f04539fd29f3e2f. Código implementado y pruebas automáticas pasadas; revisión independiente de arquitectura/seguridad aún pendiente, por lo que TASK-001/002/004 siguen in_progress y no se declara acceptance. Provisioning, mutaciones de membresía/roles, ABAC completo, approvals, audit/outbox y worker tenant context permanecen pendientes. No se usaron datos ni credenciales reales.


## 17. Tenant ownership y lifecycle — TASK-001 (AUD-048; 2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-048 | Invariantes Organization/Tenant | Nueva migración 0002: ownership Organization inmutable, FK con ON DELETE RESTRICT, lifecycle de Tenant con transiciones explícitas, timestamps de suspensión/cierre/borrado, tombstone deleted inmutable y oculto por RLS. |
| AUD-049 | Migraciones versionadas | `scripts/migrate.mjs` descubre archivos SQL versionados, ordena por versión y aplica cada uno con advisory lock y transacción independiente. |
| AUD-050 | Pruebas de lifecycle/ownership | Tests PostgreSQL sintéticos cubren pending_provisioning→active, active→suspended→active→closing→deleted, transición inválida, tenant tombstone, ownership inmutable, protección de Organization y visibilidad RLS. |

Source CI run #15 [42379841071](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42379841071) finalizó SUCCESS para commit `479a8234d2f6b78b0bb8e6474c39e4a388034c3a`: instalación frozen, migraciones PostgreSQL, build, typecheck y suite unit/integration pasaron. El run #13 falló por una expectativa SQLSTATE incorrecta (RESTRICT devuelve 23001); se corrigió y runs #14 y #15 pasaron. Estado TASK-001: implemented y CI-verified; revisión independiente y aceptación del propietario pendientes. No se modificaron master/environment/develop ni se ejecutaron acciones productivas.


| AUD-051 | Idempotencia de migraciones en CI | Source CI run #16 [42380055974](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42380055974) ejecutó pnpm db:migrate dos veces consecutivas en PostgreSQL 18.6 efímero; ambas pasaron, junto con frozen install, build, typecheck y tests unitarios/integración. Commit `84bab54d78b5246174dab6a6a9eb9173d0149476`. |


## 18. Branch isolation after TASK-001 (AUD-052; 2026-11-07)

- Commit inspeccionado en la punta de `environment/local`: `a0d2211702110b2aaee4a92a4c6e012c1effcd13`.
- Compare `master → environment/local`: ahead 331 / behind 0.
- Compare `environment/develop → environment/local`: ahead 331 / behind 0.
- Ambos branches base comparten SHA `f10fb1c92f8f47513e3e857cf051ec116681e083); no se escribió en `master` ni `environment/develop`.
- Source CI #16 [42380055974](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42380055974) — SUCCESS. Los cambios de documentación posteriores no modifican código ni workflows.

## 19. Contexto tenant y autorización por propósito — TASK-002 (AUD-053; 2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-053 | Predicado central de acceso tenant | `platform.can_use_tenant` comprueba usuario, organización, tenant y membership activos antes de establecer el contexto RLS. |
| AUD-054 | Contexto inmutable por solicitud | `TenantContextGuard` exige OIDC, UUID de tenant y propósito declarado; propaga actor, membership, authzVersion, permisos, entitlements y correlationId. |
| AUD-055 | Revocación y control de concurrencia | `authz_version` se incrementa ante cambios de membership/roles/grants; `withTenantContextAtVersion` bloquea la fila tenant, compara versión y vuelve a validar el acceso dentro de la transacción. |
| AUD-056 | Integración y regresión | PLT-005 consume el guard sin cambiar su respuesta pública; tests unitarios y PostgreSQL cubren tenant cruzado, usuario/org/membership inactivos, revocación y snapshot obsoleto. |

Source CI run #47 [42383524043](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42383524043) finalizó SUCCESS para commit `74febd28056043cda15221f29c8c5b71290ca06c`: instalación frozen, migraciones versionadas, idempotencia, build, typecheck y tests unit/integration. TASK-002 está implementada y CI-verificada; revisión independiente de seguridad/arquitectura y aceptación del propietario permanecen pendientes. TASK-004 RBAC/ABAC no se considera cubierta por este contexto base. No se habilitó producción ni endpoints catalog-only.
## 20. RBAC/ABAC y matriz de permisos — TASK-004 (AUD-057; 2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-057 | Catálogo versionado de permisos | Migration 0004 inserta permission keys y risk_class sin concederlos ni crear assignments; prueba PostgreSQL comprueba igualdad contra el catálogo tipado. |
| AUD-058 | Templates tenant least-privilege | Nueve role templates versionados; roles de plataforma quedan separados y no son asignables desde el catálogo tenant. |
| AUD-059 | Policy evaluator RBAC/ABAC | Decisión pura: membership, tenant, purpose, permission, entitlement, owner, estado, asset grant, consent, approval independiente y frescura capability. |
| AUD-060 | Role assignment protection | Policy requiere tenant_owner, impide self-assignment, plataforma dentro de tenant y privilegios por encima del actor; exige aprobación independiente. |
| AUD-061 | Guards y regresión | `AuthorizationGuard` + `@RequireTenantPermission`; suites allow/deny, catálogo, asignación y PostgreSQL. |

Source CI run #67 [42385036275](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42385036275) finalizó SUCCESS para commit `53e50dc00daccc7c64c7931e468e6ef0af132940`: frozen install, migraciones e idempotencia, build, typecheck y tests. La entrega no habilita mutaciones ni IAM-007..020 (catalog-only). El audit append-only, step-up y workflow durable de approvals quedan para TASK-005. Revisión independiente y aceptación del propietario pendientes.
## 21. Aprobaciones, autenticación reforzada y audit stream — TASK-005 (AUD-062; 2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-062 | Evidencia step-up OIDC | `auth_time`, `acr`, `amr` se conservan después de validar firma RS256/JWKS; allowlists ACR/AMR vacías deniegan por defecto. |
| AUD-063 | Approval workflow | Request hash canónico por tenant/action/purpose/resource/payload, idempotencia, quorum de aprobadores distintos, veto de autoaprobación, decisiones inmutables, caducidad y consumo único. |
| AUD-064 | Audit SHA-256 stream | Secuencia y hash-chain por tenant; head monotónico ligado a evento; triggers append-only para audit_events y approval_decisions. |
| AUD-065 | PostgreSQL adversarial integration | Requester + dos approvers sintéticos, step-up, quorum, idempotencia, acción/hash alterado, rollback, consumo único, hash verification y UPDATE/DELETE rechazados. |

Source CI run #112 [42387272987](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42387272987) finalizó SUCCESS para commit `b38b78ab52dbb96262dc8078518fdf4f55fc5a2c`. Con `RUN_APPROVAL_INTEGRATION_TESTS=true` se verificaron instalación frozen, migraciones #1..#5 e idempotencia, build, typecheck y suites unitarias/PostgreSQL. TASK-005 continúa in_progress por revisión independiente/aceptación pendientes. No se añadió HTTP IAM catalog-only, no se conectó un IdP real, no existe consumer/outbox de negocio y el audit chain no tiene anclaje externo.


## 22. Aislamiento operativo multi-tenant — TASK-003 (AUD-066; 2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-066 | Namespace común por tenant | TenantResourceNamespace genera cache/object namespaces con validación UUID, resource ID y rechazo de traversal. |
| AUD-067 | Cache tenant-scoped | TenantScopedCache decora CacheStore, obliga tenant prefix y aplica TTL bounded. |
| AUD-068 | Object storage tenant-scoped | TenantScopedObjectStorage decora ObjectStorage, fuerza tenants/{tenantId}/... y valida MIME/checksum. |
| AUD-069 | Contexto seguro de worker | TenantJobContextResolver recupera registro comprometido por jobId; TenantJobExecutor solo acepta contextos emitidos por resolver y reentra por DatabaseService.withTenantContext. |
| AUD-070 | Telemetría segura | HmacTenantPseudonymizer usa clave inyectada de 256 bits; TenantTelemetryContext exige HMAC versionado y vocabulario métrico allowlisted. |
| AUD-071 | Regresión automatizada | Seis suites unitarias registradas en api:test: namespace, cache, object storage, worker context y telemetry. |

Estado implemented; la ejecución CI de esta revisión, adapters/wiring de Valkey/object storage, outbox/inbox/consumer, pool Node A→B, HMAC pseudonymizer y revisión independiente permanecen pendientes. No afirmar verificación operativa ni producción.


## 23. Registro durable de trabajos multi-tenant — TASK-003 (AUD-072; 2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-072 | Persistencia tenant job | `0006-tenant-job-outbox.sql` crea `platform.tenant_job_records`, RLS habilitada, ownership tenant/actor, payload JSON, estados y límites de intentos. Runtime tiene INSERT y SELECT(id) exclusivamente para `RETURNING`; la lectura de metadata se hace via SECURITY DEFINER y no tiene SELECT de payload ni UPDATE directo. |
| AUD-073 | Resolución mínima de contexto | `platform.resolve_tenant_job_context(uuid)` retorna solo job_id, tenant_id, actor_user_id, purpose y correlation_id; no expone payload. |
| AUD-074 | Adapter y wiring | `PostgresTenantJobRecordReader`, `IsolationModule`, `DatabaseModule` export de `DATABASE_POOL` y registro en `AppModule`. |
| AUD-075 | Regresión | Suites del reader y writer registradas; ocho suites unitarias y una suite PostgreSQL gated (`RUN_TENANT_JOB_INTEGRATION_TESTS=true`) aparecen en `api:test`. CI de esta iteración pendiente de evidencia. |
| AUD-076 | Staging transaccional | `PostgresTenantJobRecordWriter.stage(client, input)` inserta el job usando el mismo PoolClient de la mutación de negocio; valida UUID, purpose, job type, idempotency key, payload JSON, tamaño 256 KiB e intentos bounded. La key se liga a SHA-256 canónico del tenant/actor/purpose/type/payload/política de intentos/fecha de disponibilidad. |
| AUD-077 | State machine | Trigger PostgreSQL impide alterar identidad/payload, restringe transiciones, incrementa attempts en claim y fija timestamps terminales; la suite gated prueba queued→processing→succeeded y rechaza saltos/alteración de estado terminal. |

La implementación no constituye aún un outbox dispatcher ni consumer: faltan publicación confirmada, inbox, deduplicación, backoff, DLQ, replay y pruebas integradas con broker. El registro y su función SQL tampoco sustituyen la revalidación de autorización por `TenantJobExecutor`. TASK-003 permanece in_progress; no se declara verificado ni aceptado.

## 23. Retry policy para tenant jobs — TASK-003 (AUD-078; 2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-078 | Política pura de reintentos | `TenantJobRetryPolicy` implementa backoff exponencial acotado con equal jitter, clasificación explícita retryable/permanent, dead-letter por fallo permanente o agotamiento y validación de entradas. |
| AUD-079 | Pruebas registradas | `tenant-job-retry-policy.spec.ts` cubre jitter, techo, no retry inmediato, fallos permanentes, agotamiento y entradas inválidas; agregada a `apps/api/project.json`. |
| AUD-080 | Documentación de límites | `docs/59-TENANT-JOB-RETRY-POLICY.md` registra contrato, riesgos y trabajo restante. |

Commits: implementación `c27a8578f56ef2e740a56d907e5fdc963a0a5b46`; tests `aa5c37273011ba354a1b574a8a519fd0d623960a`; registro de suite `98c5b0fdf23416f1ca55ceffaed881b07827e237`; documentación `4890949ae83db4d5b5626c4fd23aad62e1c8d5b3`. No se ejecutaron build/typecheck/tests localmente; consulta de workflow runs asociada al commit de documentación no devolvió runs. No declarar CI PASS ni TASK-003 verified.
## 24. Runtime durable de jobs y separación backend — TASK-003 (AUD-081..089; 2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-081 | Backend root `microservices-meta-ecuapp` | Proyecto Nx/workspace/package raíz, manteniendo HTTP foundation en `apps/api` sin duplicar el servicio de base de datos. |
| AUD-082 | Migración runtime PostgreSQL | `0007-tenant-job-runtime.sql` crea leases de dispatcher/ejecución, fencing tokens, constraints, inbox y funciones acotadas de claim/complete/fail/recovery. |
| AUD-083 | Roles DB separados | `0008-tenant-job-database-roles.sql` crea roles de grupo dispatcher/worker y revoca funciones de procesamiento al login de API. |
| AUD-084 | Runtime application/composition | Dispatcher, consumer, session factory, reconnect/backoff estable, bootstrap y manejo de pools independientes. |
| AUD-085 | RabbitMQ adapters y topology | Publisher confirm + mandatory, consumer manual ACK, quorum queue y DLX configurados como artefactos de infraestructura. |
| AUD-086 | Graceful shutdown | Consumer cancela intake y espera promesas de entregas activas antes del cierre normal del canal. |
| AUD-087 | Pruebas agregadas | Unit tests del envelope, retry, dispatcher, consumer, supervisor, session lifecycle, bootstrap, publisher y consumer Rabbit; integración PostgreSQL/Rabbit gated registrada. |
| AUD-088 | Configuración segura | `.env.example` con URLs/limites sin secretos reales; TLS DB y AMQPS obligatorios en production. |
| AUD-089 | Documentación técnica | `docs/60-TENANT-JOBS-RUNTIME.md`, README backend, backlog y memoria documentan el estado y límites. |

La migración 0007 fue reemplazada completa para corregir un fragmento SQL duplicado/incompleto descubierto mediante readback y logs de Actions. El commit actual aún necesita una corrida CI verde. No se ejecutaron datos de producción ni se creó frontend. TASK-003 sigue `in_progress`; faltan heartbeat, replay autorizado, observabilidad operativa, crash/concurrency tests extendidos, handlers de negocio reales y revisión independiente.


| AUD-090 | Lease heartbeat de ejecución | Migración `0009-tenant-job-lease-renewal.sql`, función `platform.renew_tenant_job_execution_lease`, adapter PostgreSQL y `TenantJobExecutionLeaseHeartbeat`; renueva únicamente con fencing token activo, cancela handler cooperativo cuando se pierde el lease y añade suite unitaria + aserción de integración. CI de esta adición pendiente. |

## 25. Corrección PostgreSQL y CRM Intelligence (2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-091 | Source CI #42429156061 | FAILURE en test PostgreSQL por retorno `undefined` de `assert.rejects()` tratado incorrectamente como error capturado; build/typecheck/migraciones/RabbitMQ pasaron. |
| AUD-092 | Aserción tenant-context | Commit `7b6e2a180a9049054245fa34f2d649269930bd8f`: el test valida SQLSTATE `40001`. La siguiente corrida avanzó y descubrió el fallo real de recuperación. |
| AUD-093 | Migración 0011 | Source CI #42430321770 detectó SQLSTATE `42702` por variable PL/pgSQL RECORD `job` y alias SQL `job`. Migración `0011-tenant-job-recovery-variable-ambiguity.sql` renombró a `execution_row`. |
| AUD-094 | Source CI completo | Run #42430605576 SUCCESS para commit `be9d3dc14aa26b38c20013b98ff5238bac564a4e`: frozen install, migraciones/idempotencia, build, typecheck, unit y PostgreSQL/RabbitMQ integration. TASK-003 sigue in_progress. |
| AUD-095 | Decisión CRM con ML | El propietario aclaró que IA en CRM significa ML clásico/estadístico CPU-first, no LLM ni agentes. PD-005, ADR-026, docs/00, 01, 29, 30, 38, 62 y TASK-081..087 registran el alcance; no implica modelos implementados. |

## 26. Regresión de reutilización de conexión worker multi-tenant — TASK-003 (AUD-096; 2026-11-07)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-096 | Pool reuse A→B | Commit `bcedfab0538f5ee82a06ffe2480f41e3378bab7e` ejecuta `DatabaseService` real en `apps/api` con `Pool.max=1`. Source CI #42431419028 SUCCESS confirmó el mismo `pg_backend_pid()` para tenant A→B y GUC de tenant/usuario limpios tras COMMIT. |

Source CI #42431530685 terminó SUCCESS para el commit `6059822896987fc618c479d53117354e1a785144`: A→B y limpieza tras ROLLBACK quedaron verificadas. La prueba no sustituye validación con carga concurrente ni revisión de configuración de pool en deployment.

| AUD-097 | Cleanup tras rollback | `apps/api/src/platform/database/database.context.integration.spec.ts` fuerza fallo dentro de `DatabaseService.withTenantContext`, verifica rollback y reusa la misma conexión sin GUC residuales. Source CI #42431530685 SUCCESS para commit `6059822896987fc618c479d53117354e1a785144`. |

## 27. Regresión de aislamiento concurrente de tenant — TASK-003 (2026-11-08)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-098 | Transacciones tenant A/B concurrentes | Commit `9b497d0805b53f79e658fd874d0ebfbec3863b12` amplía `apps/api/src/platform/database/database.context.integration.spec.ts`: mantiene dos transacciones simultáneas, exige dos `pg_backend_pid()` distintos, valida GUC tenant/actor en cada conexión y consulta RLS para asegurar que cada sesión solo ve su tenant. Source CI exacto pendiente de verificación; no se marca como prueba aprobada. |


## 28. Replay administrativo protegido — TASK-003 (AUD-099..104; 2026-11-08)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-099 | Persistencia de replay | Migración 0012: requests append-only, reason codes, snapshot de source, policy version, unique idempotency, FK compuestas same-tenant, lineage inmutable y RLS. |
| AUD-100 | Consumo de aprobación como frontera SQL | Migración 0013: API no lee payload ni inserta lineage; función SECURITY DEFINER valida tenant/actor/source/approval/hash/audit y crea child job copiando payload dentro de PostgreSQL. |
| AUD-101 | Servicio y rutas | `TenantJobReplayService`, repository port/adapter y controller con request/status/decision/execute; request/approval staging atómico y consumeAndStage comparte transacción con replay + audit. |
| AUD-102 | Aprobación y autorización | `jobs.replay.request` crítico, two-person quorum=2 y step-up; hash incluye snapshot y version de policy; source job original permanece terminal. |
| AUD-103 | Policy fail-closed y pruebas | Registry vacío por defecto; solo acepta handler con versión `tenant-job-replay.v1` y garantía `stable-domain-effect-key`. Tests cubren registry, ausencia de policy y privilegios reales del rol API. |
| AUD-104 | Source CI | Run #42432745586 SUCCESS para commit `6c93efdfea0cef7f1819402ab872e439ef858ccd`, incluyendo migraciones 0012/0013/idempotencia, build, typecheck, unit y PostgreSQL/RabbitMQ integration. No hay handler real registrado; el replay no queda habilitado en producción. |

## 29. Recuperación segura del consumer RabbitMQ, métricas y fencing — TASK-003 (AUD-105..110; 2026-11-08)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-105 | ACK ambiguo no destructivo | Si la transacción de negocio pudo confirmar COMMIT pero `channel.ack` falla, el adapter no emite NACK sin requeue. Cierra sesión y permite redelivery; PostgreSQL terminal state/inbox hacen reconciliable el duplicado. Test de regresión incluido. |
| AUD-106 | Fallo de persistencia con locator válido | Envelope válido + excepción de `consumer.handle` se trata como resultado durable desconocido. El adapter cierra sesión sin ACK/NACK para redelivery; envelopes inválidos sí se rechazan a DLQ. No se envían jobs válidos a DLQ por outage DB. |
| AUD-107 | Shutdown single-flight | Cierres concurrentes de varios deliveries prefetched comparten una única promesa de cierre de la sesión worker. Test concurrente de dos entregas comprueba una sola invocación. |
| AUD-108 | Recuperación real broker/DB | Se verifican redelivery RabbitMQ tras pérdida de canal, recuperación PostgreSQL de execution/dispatch leases expirados y fencing de tokens antiguos contra renew/complete/mark-published. El fixture de job type conserva la whitelist SQL de producción. |
| AUD-109 | Métricas bounded | Counters/histograms Prometheus in-memory usan outcomes allowlisted, sin labels de tenant/actor/job/payload. Pruebas comprueban buckets, contadores y rechazo de labels desconocidas. El endpoint HTTP y gauges PostgreSQL fueron añadidos en auditorías posteriores; gauges RabbitMQ, alertas y SLO siguen sujetos a validación. |
| AUD-110 | Source CI integral | Run [#42433941375](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42433941375) finalizó SUCCESS para commit `f136cff710fe8c60c8430c82928092320b9d90b5`: instalación frozen, roles DB, migraciones/idempotencia, DLX quorum, build, typecheck, unit tests, integraciones PostgreSQL/RabbitMQ y cleanup de contenedores. |
| AUD-111 | Endpoint HTTP Prometheus | `TenantJobMetricsHttpServer` expone solo `GET /metrics`; loopback por defecto; binding remoto exige bearer token de al menos 32 bytes y comparación constante. Suite HTTP registrada en Nx. Source CI #42434224485 SUCCESS para commit `abbc86cfbd72e89ab5db82b0e3207159a66eba71`. Gauges/alertas/SLO no se incluyen; el tráfico remoto requiere TLS/mTLS y restricción de red. |
| AUD-112 | Gauges tenant-safe PostgreSQL | Migración `0015` publica función SECURITY DEFINER agregada sin IDs/payload y concede EXECUTE solo al rol dispatcher. Reader tipado + pool dedicado con timeouts + sample no bloqueante cada 15 s + gauges Prometheus sin labels. Source CI #42435204662 SUCCESS para commit `8b9fae108e8581ec03ee4933fa75a251f8d04621`, incluyendo build/typecheck/unit/PG/RabbitMQ integration. |
| AUD-113 | Gauges RabbitMQ — diseño AMQP histórico | Reader `checkQueue` por canal AMQP separado, timeout/circuit breaker y recuperación single-flight. Source CI #42435984569 SUCCESS; diseño sustituido por AUD-117 para separar el plano de monitoreo del transporte worker. |
| AUD-117 | Management API RabbitMQ segregada | Reader vigente usa Management HTTP API y usuario dedicado con tag `monitoring`, permisos AMQP vacíos, Basic auth, HTTPS fuera de loopback, redirects rechazados y timeout abortable de 1 500 ms. El worker usa solo publisher/consumer channels AMQP. Source CI #466 pendiente; CodeQL #6 SUCCESS en HEAD `e00ec2d0`. |
| AUD-114 | Artefactos Prometheus/Grafana | Versionados `tenant-job-alerts.yml`, `tenant-job-runtime.dashboard.json`, `RUNBOOK.md` y `observability/README.md`. Son guardrails iniciales, no SLO/SLA aprobados; instalación, importación, alert routing y revisión operacional real pendientes. |
| AUD-115 | CodeQL backend | Workflow `.github/workflows/codeql-security.yml` con `javascript-typescript`, `security-extended` y `build-mode: none`; CodeQL run [#3](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42435984426) SUCCESS en commit `6db028bb7123dfd50bafe3d6f4f5e66bce06207d`. Los findings requieren triage en Code Scanning. |
| AUD-116 | Alerta de target Prometheus ausente | La expresión ahora cubre `absent(up{job="whatsbusiness-tenant-jobs"})` además de `up == 0`, evitando perder alerta si se elimina el target. Source CI #465 y CodeQL #5 pendientes al registrar este cambio. |

**Límites y estado:** TASK-003 permanece `in_progress`. El registry de replay sigue vacío/fail-closed; faltan handlers reales y prueba e2e de side-effect idempotente, operación de DLQ/replay, unacked/consumer lag autoritativo, importación real de dashboards/alertas y routing/SLO, validación de broker desplegado, secrets/rotación, carga/DR y revisión/aceptación independiente. No hay autorización GO-PRODUCTION.
| AUD-118 | RabbitMQ unacknowledged metrics contract | Se añadieron gauges `messages_unacknowledged` para worker queue y DLQ y panel/regla de alerta asociados. Source CI #480 detectó respuesta 200 con contador ausente en DLQ; `missingQueueCounterFields` ahora identifica únicamente los nombres faltantes. Source CI #481 pendiente. `messages_unacknowledged` no es consumer lag. |


## 30. Corrección del cierre de recursos y cobertura del supervisor Meta — TASK-003/027/028 (AUD-119..121; 2026-11-08)

| ID | Cambio | Evidencia / resultado |
|---|---|---|
| AUD-119 | Teardown RabbitMQ idempotente | En rabbitmq-transport.integration.spec.ts, los nombres de colas y exchange se conservan en el ámbito de la prueba. El teardown elimina recursos existentes de forma best-effort y cierra siempre los canales/conexión incluso si falla una eliminación. El código anterior podía lanzar ReferenceError desde finally y saltarse el cierre AMQP. |
| AUD-120 | Suite Meta worker referenciada y real | microservices-meta-ecuapp/project.json ahora registra meta-webhook-worker.supervisor.spec.ts, añadido bajo webhooks/infrastructure/bootstrap; sustituye una ruta meta-webhook-worker.runtime.spec.ts que no existía en el árbol de la rama. |
| AUD-121 | Pruebas de shutdown fail-safe | La suite nueva cubre fallo de conexión RabbitMQ, cancelación del ciclo de reconexión, cierre del pool PostgreSQL, fail-closed sin handlers y validación de límites de reconexión. Source CI posterior a la corrección pendiente; no se asigna estado CI-verified todavía. |

**Estado:** Source CI #527 había agotado los 30 minutos dentro de microservices-meta-ecuapp:test, aunque instalación, migraciones/idempotencia, build y typecheck finalizaron SUCCESS. La causa potencial de socket retenido se encontró en el teardown de la prueba de transporte. La corrección se debe considerar implementada pero no verificada hasta que el siguiente Source CI termine SUCCESS. No cambiar TASK-003/027/028 a verified ni accepted.


## 31. Diagnóstico y corrección de los fallos restantes de Source CI #528 — TASK-003/027/028 (AUD-122..124; 2026-11-08)

| ID | Cambio / evidencia | Estado |
|---|---|---|
| AUD-122 | Source CI #528 confirmó que el lifecycle corregido termina normalmente: `microservices-meta-ecuapp:test` concluyó en ~10 s, el cleanup cerró contenedores y 80/82 pruebas pasaron. Falló una integración RabbitMQ porque el fixture inicializaba también la cola de producción y su binding `jobs.#`; el routing key de test se publicaba tanto a la cola de producción como a la temporal, por lo que el contador de esta última permanecía en 0. El test ahora crea solo los exchanges y deja como destino el binding temporal. | Corrección implementada; CI posterior pendiente. |
| AUD-123 | La integración PostgreSQL falló en `persistBatch` por falta de SELECT de columnas de clave única en `ON CONFLICT`. Migración 0019 otorga SELECT de `app_id`, `provider_product`, `idempotency_key` en inbox y `event_id` en outbox; no abre lectura de payload cifrado ni columnas criptográficas. | Migración añadida; aplicación/idempotencia y test real pendientes. |
| AUD-124 | Source CI [#528](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42485100001) en commit `a00c4b318021d12e84cc5fe98c23f4da6639b65a`: install frozen, migraciones 0001–0018/idempotencia, provisioning DB, build y typecheck SUCCESS; `api:test` SUCCESS; backend tests 80 PASS / 2 FAIL. CodeQL [#66](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42485100046) SUCCESS. | No se declara Source CI verde. |

**Estado de las tareas:** el test harness deja de bloquearse y se han corregido las dos causas observadas; la migración 0019 y los nuevos tests esperan Source CI. TASK-003/027/028 continúan `in_progress`. Handler externo real, replay autorizado end-to-end, CR-0016, fixture/conformance oficial Meta, KMS/Secret Manager, rate limiting/WAF, retención, topology/observability deployment, load/DR, review independiente y aceptación permanecen pendientes.


## 32. Source CI #536 verde y hardening de membresía del rol ingress — TASK-003/027/028 (AUD-125..127; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-125 | Source CI [#536](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486399710), commit `cfe7019f4e6712055d50424ecf8f498ecf074c51`: SUCCESS en frozen install, migraciones 0001–0020/idempotencia, build, typecheck, API tests, backend tests y cleanup PostgreSQL/RabbitMQ. CodeQL [#74](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486399698): SUCCESS. | CI verified para el HEAD evaluado. |
| AUD-126 | La integración PostgreSQL prueba staging tenant-checked y verifica que la cuenta no puede leer outbox/ciphertext; RabbitMQ prueba entrega AMQP, ACK, mandatory routing, quorum DLX y redelivery sin acoplar estado de entrega a la métrica asíncrona. | Verificado en #536. |
| AUD-127 | Migración 0021 revoca la membresía de `whatsbusiness_app` en `whatsbusiness_webhook_ingress_role` y retira INSERT/SELECT del outbox al grupo, para que NOINHERIT no se eluda mediante SET ROLE. Añade pruebas de membresía y ACL del grupo. | Implementado; Source CI siguiente pendiente. |

La rama recibió después de #536 el commit automático `ff89b71`, que cambia solo el lockfile pnpm validado por el workflow. La tarea permanece en progreso porque la verificación automatizada del slice no cubre todavía todos los acceptance criteria operativos ni los handlers de negocio. No se declara producción/aceptación.


## 33. Source CI #539 — hardening ingress, DLQ durable y test tenant-scoped (AUD-128..130; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-128 | Source CI #538 falló únicamente por ReferenceError de scope en la integración PostgreSQL: storedEvents se usaba después del bloque donde se declaraba. El commit c2bb65fc1a506ba54ab3f7662c9bbc759e2b0536 mantuvo el id de evento en el scope de la prueba y validó su presencia. | Corregido. |
| AUD-129 | Source CI [#539](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976106), commit c2bb65fc1a506ba54ab3f7662c9bbc759e2b0536: instalación frozen, migraciones 0001–0021 e idempotencia, provisioning, build, typecheck, api:test y microservices-meta-ecuapp:test SUCCESS; cleanup de PostgreSQL/RabbitMQ SUCCESS. | Verificado por CI. |
| AUD-130 | CodeQL [#77](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42486976151) SUCCESS. La migración 0021 revoca membresía del login API al grupo ingress y retira SELECT/INSERT del outbox al grupo. La integración prueba membership false, ACL, SET ROLE denegado, outbox tenant-bound, rechazo cross-tenant y lectura de DLQ tenant-scoped con evento terminal durable. | Verificado por CI; review de seguridad independiente pendiente. |

TASK-003, TASK-027 y TASK-028 permanecen in_progress. El gate cubre el slice de código descrito, no handlers Meta/CRM de negocio, replay autorizado por CR-0016, retención, KMS/Secret Manager, WAF/rate limit, topología desplegada, observabilidad/SLO, carga/DR, revisión independiente ni aceptación del propietario. GO-PRODUCTION permanece NO-GO.


## 34. Source CI #560 — diagnóstico y reparación del test RabbitMQ live metrics (AUD-131..133; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-131 | Source CI #560, commit b6da092d443c91aebf502809439f82677d49acdc: install, migraciones/idempotencia, provisioning, build, typecheck y API tests SUCCESS; falla la integración Management API y el step alcanza timeout de 8 minutos. | Falla reproducida en CI; aserción inicial no visible por proceso colgado. |
| AUD-132 | Reader RabbitMQ ahora informa solo status HTTP/redirect, cancela response body fallido y la prueba unitaria comprueba el status sin exponer contenido. | Implementado; CI nuevo pendiente. |
| AUD-133 | Test live protege setup con try/finally, limita timeout/esperas, ejecuta cleanup AMQP con límites y cierra canales/conexión best-effort. | Implementado; CI nuevo pendiente. |

No se conceden permisos de consumo/publicación/configuración al usuario de métricas. Se conserva el patrón RabbitMQ monitoring con regex vacíos para configure/read/write. El status HTTP real de la siguiente ejecución permitirá aislar si existe además un problema de autenticación/autorización o endpoint. AUD-131..133 no certifican despliegue ni SLO. TASK-003 sigue in_progress; revisión independiente y aceptación del propietario pendientes.


## 35. Cierre AMQP del proceso y recuperación RabbitMQ (AUD-134..135; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-134 | Revisión del runtime: RabbitMqConnectionFactory.close esperaba el cierre de publisher/consumer antes del parent connection.close; el mismo callback cierra la conexión ante procesamiento interrumpido y ACK ambiguo. | Riesgo de bloqueo de lifecycle identificado. |
| AUD-135 | Cierre de conexión padre implementado; test real de redelivery cambia de cerrar solo consumer channel a cerrar el proceso/conexión completa dejando una entrega sin ACK. | Implementado; Source CI/CodeQL nuevos pendientes. |

La API documentada de amqplib establece que connection.close invalida operaciones pendientes y espera a que se cierre el socket subyacente; los canales existen dentro de la conexión. Se elimina la espera previa por handshake de los dos canales para evitar que bloquee el cierre de la conexión. No se afirma que el defecto esté verificado hasta que pase Source CI. TASK-003 sigue in_progress.

## 36. RabbitMQ 4.4 — corrección del fixture live de métricas (AUD-136..138; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-136 | Source CI #560 y #562 pasaron instalación, migraciones 0001–0023/idempotencia, provisioning, build, typecheck y API tests; el target backend falló en la integración live de Management API y alcanzó timeout. El log del broker identificó el rechazo de `transient_nonexcl_queues`. | Causa en el fixture identificada; no es un fallo de la topología durable de producción. |
| AUD-137 | La integración declaraba colas temporales con `durable=false, exclusive=false, autoDelete=true`. El commit `92b46d68bc8070a086b95352d504797fe1bf0c3d` las cambia a `exclusive=true`, conservando nombres únicos, auto-delete, publisher confirms y el ciclo de métricas/ACK. | Implementado; Source CI #563 pendiente al registrar esta entrada. |
| AUD-138 | docs/63, docs/02, docs/11 y README del backend sincronizan el diagnóstico y el gate siguiente. | Documentado; no equivale a verificación. |

La corrección conserva RabbitMQ 4.4 y no habilita la característica obsoleta, no relaja permisos del usuario `monitoring` y no modifica la topología quorum de jobs. Source CI #563 debe completar la suite backend; CodeQL #98 debe revisarse por separado. TASK-003 permanece `in_progress`; TASK-027/028 no cambian de estado y GO-PRODUCTION sigue NO-GO.

## 38. Activación CRM Contacts API y verificación de contrato/código (AUD-144..148; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-144 | Se conectó `CrmContactsModule` a `AppModule` solo para el slice CRM-001..004. | Implementado en `de617cc18b004c0b67df0d5c8b9a10bbf50897a7`. |
| AUD-145 | OpenAPI cambió `x-implementation-allowed` a true solo para CRM-001..004; validator permite exactamente CRM-001..004 + PLT-001..005. | Contract CI #29 SUCCESS en `559cd2255fade6b4fc338463bef417fd992192ac`. |
| AUD-146 | Se añadieron seis pruebas del controller: OIDC, tenant guard/purpose/RBAC, filtros, tenant mismatch, ETag e If-Match. | Source CI #570 SUCCESS. |
| AUD-147 | Source CI #570 verificó build, typecheck, migraciones 0001–0023/idempotencia, API/PostgreSQL tests y backend/PostgreSQL/RabbitMQ integrations. | SUCCESS. |
| AUD-148 | CodeQL #105 verificó el código del slice CRM. | SUCCESS. |

El contrato mantuvo deshabilitadas las 287 operaciones restantes; CRM-005..017 siguen catalog-only. TASK-042 continúa `in_progress` hasta revisión independiente y aceptación del Product Owner. No se habilitó producción ni se alteró GO-PRODUCTION NO-GO.
## 39. Source CI #572 — fixture de métricas estable y guardas CRM (AUD-149..152; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-149 | El live test usaba `autoDelete=true`; RabbitMQ borraba la cola al cancelar su último consumer y el exporter dejaba de publicar gauges para esa cola. | Causa identificada por log de Source CI #571. |
| AUD-150 | Fixture final: `durable=false, exclusive=true, autoDelete=false`; cola efímera exclusiva de conexión, eliminada explícitamente en `finally` después de la aserción idle. | Implementado. |
| AUD-151 | Source CI [#572](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026616) verificó instalación frozen, migraciones 0001–0023/idempotencia, provisioning, quorum DLX, Prometheus plugin, build, typecheck, API/PostgreSQL y backend/RabbitMQ integrations. | SUCCESS. |
| AUD-152 | CodeQL [#107](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42498026686) y test CRM de guards por método; OIDC class guard, TenantContextGuard + AuthorizationGuard list/create/get/update. | SUCCESS. |

El cambio afecta solo el fixture de pruebas; la topología productiva conserva quorum queues durables. TASK-003/027/028 siguen `in_progress`; TASK-042 sigue pendiente de review/aceptación. GO-PRODUCTION no se habilita.

## 40. Exportación de contratos públicos de métricas de jobs (AUD-153; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-153 | El barrel `microservices-meta-ecuapp/src/index.ts` no exportaba los ports de métricas, el reader compuesto, el exporter Prometheus ni el servidor HTTP, aunque sus implementaciones y pruebas existían. Se añadieron cuatro exportaciones sin alterar comportamiento interno. | Implementado; Source CI/CodeQL en ejecución al corte. |

Commit: `f10743ce35d96f216c6e5c74ba3dd7286d07f262`. No se eleva TASK-003 a verified: continúan pendientes el resultado CI de este commit, revisión independiente, SLO/alert routing operativo, carga/DR y aceptación del propietario.

## 41. Meta Asset Registry y Capability Engine — núcleo de dominio (AUD-154..156; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-154 | Se creó apps/api/src/platform/meta-control-plane/domain/meta-asset.ts: catálogo namespaced de activos, WAAC/PMA independientes, ownership y access evidence separadas y reconciliación monotónica con cobertura completa/parcial. No borra historial ni infiere revocación desde ausencia en una página parcial. | Implementado; Source CI de corrección pendiente. |
| AUD-155 | Se creó el evaluador de capacidades por operación/versión, con decisión available/unavailable/unknown, gates de autorización, tenant policy, finalidad, grant/task, scope, entitlement, App Review, tier, elegibilidad/país, versión, consentimiento y approval, con reason codes explicables. | Implementado; falta catálogo autoritativo y runtime. |
| AUD-156 | Se agregaron dos suites (23 casos) al target api:test. Source CI #42512236821 detectó TS4111 por el acceso dot notation a propiedades de Record<string, unknown>; se corrigió en commit 2f97c8a94275c87f8543de065c30ae00cbf52b43. | Source CI #42512364598 SUCCESS y CodeQL #42512364506 SUCCESS sobre 2f97c8a; build, typecheck, API/PostgreSQL y Meta backend/PostgreSQL/RabbitMQ pasaron. El HEAD 9e5dfa1 añade un cambio independiente. Source CI #42512536601 terminó con fallo en api:test: build y typecheck pasaron; 166/167 pruebas pasaron y las 23 pruebas nuevas de US-004 (inventario + capabilities) pasaron. La única falla fue la integración independiente tenant-job-record.integration.spec.ts, con SQLSTATE 42501 ('permission denied for table tenant_job_records') en PostgresTenantJobRecordWriter.stage; el target de Meta backend se omitió por el fallo previo. Esto no invalida los tests US-004, pero el HEAD posterior no tiene Source CI completo verde y la falla independiente debe corregirse por su owner. |

Límites: no hay Meta API adapter, conexión ni token runtime para esta historia; no se añade persistencia ni endpoint HTTP porque TASK-008 y META-010..015 no están cerrados. No afirmar TASK-009/010 verificadas/aceptadas ni disponibilidad de activos reales.

## Seguimiento del HEAD concurrente — 2026-11-08

- El Source CI #42512536601 del commit 9e5dfa1 pasó build y typecheck; api:test terminó 166/167. Las 23 pruebas nuevas de US-004 pasaron. La única falla fue tenant-job-record.integration.spec.ts (SQLSTATE 42501: permiso sobre platform.tenant_job_records), ajena al módulo Meta.
- El cambio de aislamiento fue corregido por el commit 2bfef634fb07603fb9ea1eb8df0127c4ece2ea49; el commit cd9ce49d082d6cf66f4a3c0f4e3818433f373950 añade una comprobación de idempotencia/INSERT. Source CI #42512743982 y CodeQL #42512744032 del HEAD cd9ce49 estaban in_progress al corte. No usar la ejecución fallida anterior como evidencia de defecto en US-004 ni declarar el HEAD actual completamente verde.
- El último CI completamente verde para el código de US-004 sigue siendo Source CI #42512364598 y CodeQL #42512364506 sobre 2f97c8a; allí pasaron build, typecheck, API/PostgreSQL y Meta backend/PostgreSQL/RabbitMQ.


## 41. US-002 — persistencia tenant-role y auditoría de decisiones (AUD-157..162; 2026-11-08)

| ID | Cambio / control | Resultado al corte |
|---|---|---|
| AUD-157 | Migración 0007 sincroniza webhooks.dead_letters.read y jobs.replay.request, añade metadata versionada de role y políticas/grants RLS tenant-owner para materializar plantillas y gestionar membership-role edges. | Código añadido; migraciones PostgreSQL/CI pendientes. |
| AUD-158 | TenantRoleAssignmentRepository implementa inspección tenant-scoped, materialización de plantilla con validación exacta de permisos, asignación idempotente y revocación con protección del último owner. | Código añadido; integración pendiente. |
| AUD-159 | TenantRoleAssignmentService conecta preflight policy, action snapshot hash-bound, approval workflow y escritura del edge en la misma transacción del consumo de aprobación. | Código añadido; integración pendiente. |
| AUD-160 | IdentityModule registra/exporta el caso de uso interno; no se publicaron rutas IAM mientras el contract freeze no autoriza esas APIs. | Cableado NestJS añadido; build pendiente. |
| AUD-161 | AuthorizationDecisionAuditService persiste denegaciones con tenant/membership vigentes incluso ante authzVersion obsoleto; los grants sensibles continúan version-gated. | Código y prueba PostgreSQL añadidos; CI pendiente. |
| AUD-162 | Tests de policy y de integración PostgreSQL cubren solicitud, step-up sintético, aprobación independiente, asignación/revocación, catálogo exacto, último owner, retry y ledger hash-chain. | Suite añadida y conectada a Source CI; resultado pendiente. |

El IdP real y su semántica ACR/AMR no se han verificado; la configuración permanece fail-closed. IAM-007..020 siguen catalog-only. No hay aceptación independiente ni del propietario. GO-PRODUCTION permanece NO-GO.


## 42. US-006 — núcleo tenant-scoped de administración de plantillas (AUD-163..168; 2026-11-08)

| ID | Evidencia / cambio | Estado |
|---|---|---|
| AUD-163 | Dominio de plantillas con categoría, idioma, componentes, placeholders, botones, validación y preview local. | Código y suite añadidos a api:test; CI pendiente. |
| AUD-164 | Migración 0027 crea registro de plantillas, revisiones e idempotencia con RLS FORCE y triggers actor/tenant. | Migración añadida; ejecución e idempotencia PostgreSQL pendientes de CI. |
| AUD-165 | Repositorio tenant-scoped para list/get/draft create/update/archive/revisions con compare-and-swap. | Código añadido; build e integración pendientes. |
| AUD-166 | PermissionCatalog, módulo NestJS interno, auditoría append-only e idempotency hash. | Código añadido; sin grants automáticos. |
| AUD-167 | Unit tests de dominio/servicio e integración PostgreSQL multi-tenant conectados a Source CI. | Pruebas añadidas; resultado de nuevo commit pendiente. |
| AUD-168 | WAM-001..007 continúan catalog-only; no se expusieron controllers ni mutaciones Meta. | Gate docs/49 respetado; aprobación y sender enforcement pendientes. |

TASK-014 y TASK-015 continúan in_progress. AC-006-01/02/04 tienen implementación parcial; AC-006-03 está abierto hasta conectar el gate de plantillas aprobadas al sender. No hay uso de cuenta Meta real ni mutaciones externas. Véase docs/71.



## 42. Source CI feedback y correcciones de compatibilidad (AUD-163..166; 2026-11-08)

| ID | Cambio / control | Estado |
|---|---|---|
| AUD-163 | Migration 0008 añade trigger para completar role.description de forma determinista desde display_name/role_key cuando los escritores existentes omiten ese campo, sin quitar el CHECK de integridad incorporado en 0007. | Código añadido; CI pendiente. |
| AUD-164 | La integración de asignación/verificación de roles comprueba que el fallback de descripción funciona junto con aprobación, consumo transaccional y protección del último tenant_owner. | Código añadido; CI pendiente. |
| AUD-165 | La prueba PostgreSQL de jobs deja el cierre del workerPool bajo la responsabilidad de DatabaseService y evita llamar pool.end dos veces. | Test cleanup corregido; CI pendiente. |
| AUD-166 | La prueba PostgreSQL de plantillas WhatsApp corrige imports ESM relativos al directorio src/platform. | Import corregido; CI pendiente. |

En Source CI run 42513396813 la migración 0007, su idempotencia, build y typecheck pasaron; la suite fue 181 PASS / 5 FAIL. La prueba nueva de TenantRoleAssignment pasó. Los cuatro ajustes anteriores apuntan a los fallos observados; no se elevará el estado hasta nuevo SUCCESS. GO-PRODUCTION sigue NO-GO.


| AUD-171 | Source CI #42513649341: build/typecheck y migración correctos; tests API 184/186. Los fallos restantes fueron (a) auditoría invisible por falta de rol audit.read en el fixture de templates y (b) FK tenant_job_inbox durante la limpieza de tenant-job-record. | Corrección de fixtures y cleanup añadida; reejecución pendiente. |
| AUD-172 | Se añade policy pura de elegibilidad de plantilla para el futuro sender: exige lifecycle activo, Meta ID, APPROVED, categoría/idioma exactos y capability available. | Tests añadidos al target; sigue sin invocación desde el sender. |


| AUD-173 | Commit 966edfffe668f495dfbc2ac07072fb93b616c7c9: Source CI #42513964425 success; CodeQL #42513964419 success; migrations/replay, build y typecheck success; API 191/191 y Meta backend 87/87 sin fallos ni skips. | Verificado en el run del commit exacto. TASK-014/015 siguen in_progress por dependencias Meta/contracts/sender. |



## 43. Verificación técnica US-002 (AUD-167..172; 2026-11-08)

| ID | Evidencia/cambio | Resultado |
|---|---|---|
| AUD-167 | Commit 966edfffe668f495dfbc2ac07072fb93b616c7c9 en environment/local; migración 0008-role-description-defaults aplicada y validada idempotente. | SUCCESS |
| AUD-168 | Build de todas las aplicaciones y typecheck del workspace. | SUCCESS |
| AUD-169 | Source CI #42513964425: pruebas API/PostgreSQL. | 191/191 PASS; 0 FAIL |
| AUD-170 | Source CI #42513964425: pruebas del backend Meta. | 87/87 PASS; 0 FAIL |
| AUD-171 | Test PostgreSQL de asignación/revocación hash-bound, approval independiente, último owner y audit chain. | PASS |
| AUD-172 | CodeQL #42513964419 para el mismo commit. | SUCCESS |

La evidencia anterior reemplaza los handoffs US-002 que indicaban CI pendiente. TASK-004/005 quedan implementadas y CI-verificadas, pero siguen in_progress hasta revisión independiente y aceptación del Product Owner. Bootstrap de primer tenant_owner, ACR/AMR del IdP real, contract freeze para rutas IAM y gates de operación/audit externos no se consideran completados. GO-PRODUCTION permanece NO-GO.


## 44. US-014 — preservación de contexto y entrega completa de cambios (AUD-174..177; 2026-11-08)

| ID | Cambio / control | Resultado al registrar |
|---|---|---|
| AUD-174 | El decoder agrega `providerContext` a cada evento individual derivado de `change.value`: `objectType`, `entryId`, `entryTime`, `field` y metadatos hermanos, excluyendo arrays ya separados. Esto preserva `metadata.phone_number_id`, `contacts` y `messaging_product`. | Implementado en `96506d956c4af70b061d02623fd42c0749f12fea`; CI pendiente |
| AUD-175 | La extracción de `messages[]` y `statuses[]` utiliza ramas independientes para no descartar estados cuando ambos arrays aparecen en el mismo cambio. | Implementado; CI pendiente |
| AUD-176 | La clave de idempotencia sigue calculándose desde el evento original antes de añadir metadata contextual; los cambios de metadata no generan otra clave del mismo mensaje. | Cubierto por regresión; CI pendiente |
| AUD-177 | Se añadieron tests de contexto WhatsApp y estabilidad de dedupe a `meta-webhook-event.spec.ts`. | Implementado en `5b7374ef39113d4a264bd1c0ccf9d8cda8428948`; Source CI #42527271340 y CodeQL #42527271448 `in_progress` al corte |

El ajuste no altera OpenAPI, AsyncAPI, migraciones, envelope broker ni la respuesta HTTP ACK. El contexto complementario queda dentro del payload individual cifrado en PostgreSQL. TASK-027/028 y US-014 permanecen `in_progress`; no declarar `verified`/`accepted` hasta CI verde del HEAD, handlers de negocio y evidencias/controles operativos restantes. GO-PRODUCTION continúa NO-GO.


## 14. Auditoría — US-013 / TASK-026 CAPI domain slice (2026-11-08)

| ID | Evento | Resultado |
|---|---|---|
| AUD-036 | Investigación e inspección previa CAPI | Se verificaron US-013/AC-013-01..03, TASK-026 y dependencias, CAPI-001..004 catalog-only y estado real de módulos/DB/gates. |
| AUD-037 | Implementación de dominio CAPI | Añadidos validator fail-closed, tuple de dedupe, port de verificación de consentimiento y report tipado sin atribución inferida; dos suites unitarias integradas en api:test. |
| AUD-038 | Gates de US-013 | TASK-026 permanece in_progress; TASK-023/031/032, contrato/versión/capability Meta, outbox/worker y CR-0015 siguen pendientes. No hubo envío real ni datos de producción. |

Detalle: docs/72-CAPI-EVENT-GATEWAY.md. CI posterior al commit determina CI verification; self-review no equivale a revisión independiente ni aceptación.


## 45. US-014 — composition root dedicado del worker y validación de arranque (AUD-178..183; 2026-11-08)

| ID | Cambio / control | Resultado al registrar |
|---|---|---|
| AUD-178 | Nuevo `MetaWebhookWorkerRuntime` como composition root del worker dedicado; crea pool aislado con `DATABASE_WEBHOOK_WORKER_URL` e inyecta handlers/reporter al supervisor. | Implementado; Source CI pendiente |
| AUD-179 | Validación de URLs PostgreSQL/AMQP, TLS obligatorio para DB en producción y AMQPS obligatorio para broker en producción. | Implementado con errores de configuración sin imprimir credenciales |
| AUD-180 | `EnvironmentMetaWebhookPayloadProtector.validateConfiguration()` fuerza carga de keyring antes de asignar el pool/consumir eventos. | Implementado; test de orden de arranque |
| AUD-181 | Registry valida evento/producto y duplicados; consumerName debe cumplir formato del processor antes de crear recursos. | Implementado; tests de fallos tempranos |
| AUD-182 | `run(AbortSignal)` y `close()` single-flight delegan drenado al supervisor y cierran una vez el pool dedicado. | Implementado; test de abort/shutdown |
| AUD-183 | Suite del runtime registrada en Nx, export del paquete, README y `.env.example` actualizados. | Código documentado; CI pendiente |

Commits de runtime: `b2fae18c07b1ede450a7ee8248df1ceceb3c0fd2`, `65e173921ff83461a22bce86198305b21816b252`, `7daebb92507e51a3f2e6316bee592fa2e4edb583`, `7d6e33c10ceb19a4f4f68af3fb932c8783f1ed5b`, `12cabafa446e1b1408e42a219e0f5638838dbba2` y `d6d1e015d01b9810f7b92a047f5a5ed51ab097bf`. El entrypoint de cada bounded context aún no existe porque los handlers reales siguen pendientes; GO-PRODUCTION no cambia.


## 45. US-012 — núcleo de dominio de campañas y guardrails (AUD-178..183; 2026-11-08)

| ID | Cambio / control | Resultado al registrar |
|---|---|---|
| AUD-178 | Se añadió parseo de Ads Money como string decimal y aritmética exacta escalada; no se usa float para importes. | Implementado en `apps/api/src/ads/campaigns/domain/ads-money.ts`; CI pendiente |
| AUD-179 | PD-024 se evalúa por operación y contra un baseline fijo de 24 horas; los aumentos fragmentados no reinician ni evaden la referencia. | Implementado en `budget-guardrail.ts`; test incluido; CI pendiente |
| AUD-180 | Se añadió máquina de estados de campaña que obliga a validar, aprobar y stagear antes de submit y evita retry ciego en estado unknown. | Implementado en `campaign-lifecycle.ts`; CI pendiente |
| AUD-181 | Se añadió validación fail-closed para catálogo objetivo, cuenta, moneda, capability y evidencia vigente/versionada. | Implementado en `campaign-validation.ts`; sin adapter Meta conectado |
| AUD-182 | Se añadió policy central que exige actor, asset grant, capability actual, binding hash y quorum; kill switch detiene publication/budget increase pero no bloquea pause. | Implementado en `ads-execution-guard.ts`; todavía no conectado a handlers de ejecución |
| AUD-183 | Cinco suites de pruebas de dominio añadidas a `apps/api/project.json`. | 24 casos de dominio declarados; Source CI pendiente al corte |

Límite: no se modificó OpenAPI/AsyncAPI ni se registraron endpoints Ads, porque el contract freeze/reviewer de docs/49 y docs/55 sigue siendo gate. Tampoco hay migración, RLS, worker, adapter o reconciler Ads. TASK-024/025 siguen `in_progress`; no `verified`/ `accepted`. No se realizó llamada externa ni gasto/publicación Meta.


| AUD-039 | Consentimiento revalidado al despacho CAPI | El validador ahora evalúa grant/expiry/revocation con hora actual confiable además del instante de la conversión; regresiones cubren retiro/expiración mientras el evento está pendiente. La revalidación real todavía depende de adapter TASK-032. |
