# 58 — Implementación inicial de Identity, Tenant y Membership

**Rama:** environment/local. **Gate:** GO-CODE. **Estado:** implementación inicial; CI automático PASSED el 2026-11-07; revisión independiente pendiente.  
**Relacionado:** US-001/002/024, TASK-001/002/004, PLT-003..005, docs/37, docs/42, docs/44, docs/48 y docs/57.

## 1. Alcance

- Valida access tokens OIDC JWT RS256 con kid, firma RSA, issuer exacto, audience, expiración y nbf opcional usando JWKS remoto cacheado y refrescado ante rotación de key.
- Resuelve User por el par (issuer, subject); email no es identificador y no existe auto-provisioning por login. Solo un usuario local active puede continuar.
- Usa PostgreSQL Pool, transacciones explícitas y contexto de actor/tenant con set_config(..., true); no conserva el contexto en la sesión que vuelve al pool.
- TASK-002 valida usuario global activo, organización activa, tenant activo y membership activa antes de establecer app.tenant_id.
- Añade migraciones versionadas de Organization, User, Tenant, Membership, Role, Permission, MembershipRole y Entitlement.
- TASK-001 amplía el modelo tenant: ownership Organization inmutable, FK Organization→Tenant con RESTRICT, estados de lifecycle controlados por trigger, timestamps de suspensión/cierre/borrado, tenant deleted como tombstone inmutable y no visible bajo RLS.
- Fuerza RLS sobre tablas tenant-scoped y exige que el rol runtime sea LOGIN, NOSUPERUSER, NOBYPASSRLS y no-owner.
- Implementa tres APIs autenticadas de solo lectura: GET /v1/me, GET /v1/tenants y GET /v1/tenants/{tenantId}/context.
- GET /v1/tenants/{tenantId}/context usa TenantContextGuard y exige un propósito de acceso declarado; PLT-005 conserva su contrato público.
- Normaliza errores HTTP como application/problem+json con correlation ID y redacción de fallos internos.

## 2. Invariantes de autorización

1. El token prueba la identidad OIDC; no concede por sí solo acceso a un tenant.
2. El usuario debe existir para el issuer+subject exactos y estar active.
3. /me devuelve únicamente memberships propias visibles por RLS; conserva el estado de la membership.
4. /tenants lista solo memberships active en tenants active, con cursor keyset.
5. /tenants/{tenantId}/context exige membership active y tenant active; devuelve 404 para no revelar la existencia de un tenant no accesible.
6. El tenant ID de la ruta selecciona un recurso candidato; nunca es autorización.
7. El rol runtime es read-only en este slice. Las mutaciones administrativas quedan diferidas.

## 3. Migración

pnpm db:migrate descubre y aplica en orden todos los archivos apps/api/migrations/NNNN-name.sql usando MIGRATION_DATABASE_URL. Cada versión usa advisory lock y platform.schema_migrations para aplicar una sola vez dentro de su propia transacción. La migración 0002-tenant-lifecycle-invariants.sql agrega las invariantes de TASK-001 sin modificar el slice de lectura existente.

La aplicación runtime no modifica DDL ni aplica migraciones al arrancar. El rol runtime no recibe SELECT directo de platform.users: resuelve issuer+subject mediante la función SQL SECURITY DEFINER, con EXECUTE explícito.

## 4. Configuración

- DATABASE_URL: conexión runtime del rol whatsbusiness_app.
- MIGRATION_DATABASE_URL: conexión del dueño/migrador.
- DATABASE_POOL_MAX: entero 1–50; default 10.
- DB_SSL=true: obligatorio con NODE_ENV=production; certificado verificado.
- OIDC_ISSUER, OIDC_AUDIENCE y OIDC_JWKS_URI: configuración exacta del Identity Provider y cliente.
- En producción, issuer y JWKS requieren HTTPS.
- La API no carga dotenv automáticamente; inyectar variables con el mecanismo del entorno y mantener .env fuera de Git.

## 5. Validación automatizada añadida

- OIDC: servidor JWKS local sintético y par RSA efímero; token válido, issuer/audience incorrectos, expiración, nbf futura y firma alterada.
- PostgreSQL: dos usuarios y dos tenants sintéticos; verifica rol NOSUPERUSER/NOBYPASSRLS, resolución issuer/subject, ausencia de contexto, consulta propia, denegación cruzada y limpieza de SET LOCAL al reutilizar un pool de una conexión.
- TASK-001: transiciones active→suspended→active→closing→deleted; rechazo de actualización posterior al tombstone, cambio de Organization propietaria y borrado de Organization con tenants; RLS oculta tenants deleted.
- Source CI provisiona un PostgreSQL efímero, crea el rol runtime restringido, aplica todas las migraciones versionadas, ejecuta build/typecheck y tests. Los workflows #14 (run 42379649591), #15 (run 42379841071) y #16 (run 42380055974) finalizaron SUCCESS. El #15 valida el commit 479a8234d2f6b78b0bb8e6474c39e4a388034c3a e incluye pending_provisioning→active y el rechazo de active→pending_provisioning. El #16 añade una segunda ejecución de pnpm db:migrate para verificar idempotencia del runner. El intento #13 detectó una expectativa SQLSTATE incorrecta en el test RESTRICT; se corrigió de 23503 a 23001 y los siguientes runs pasaron.
- Contract CI exige que solo PLT-001..005 estén habilitadas para el scope foundation aprobado.

El test PostgreSQL se omite localmente cuando no se suministran DATABASE_URL y MIGRATION_DATABASE_URL; Source CI proporciona ambas para ejecutarlo.

## 6. Fuera de alcance / pendiente

- Auto-registro, invitations, alta/suspensión/revocación y mutaciones de Tenant/Membership.
- OIDC discovery dinámico, logout, refresh token, introspection y revocation endpoint.
- Mutaciones de membership/role assignment, partner/JIT grants, consumers/workers y APIs HTTP IAM continúan pendientes. El núcleo RBAC/ABAC está documentado en §9 y el núcleo approval/audit/step-up en §10.
- PartnerTenantGrant, PlatformGrant JIT y revocación/invalidación de grants.
- Worker tenant context, cache/storage/jobs/telemetry multi-tenant.
- Outbox/consumer y recuperación crash/replay.
- OIDC dev realm reproducible y E2E HTTP de extremo a extremo.
- UI de login y tenant selector Angular.

Source workspace validation #42376234089 y Contract validation #42376234088 finalizaron SUCCESS en el commit 0e0927bdcae658d4e4b1ccae28a5c5f89cf4b183. El primero pasó frozen install, migración PostgreSQL, build, typecheck y pruebas unitarias/RLS; el segundo pasó OpenAPI, AsyncAPI y JSON Schema. El lockfile generado quedó confirmado en el commit d81593601101d97623684ea02f04539fd29f3e2f. TASK-001, TASK-002, TASK-004 y TASK-005 tienen slices implementados y CI-verified, pero permanecen in_progress globalmente hasta revisión independiente de arquitectura/seguridad y aceptación del propietario. Esta implementación no es aceptación productiva ni revisión independiente.


## 7. TASK-001 — Tenant ownership y lifecycle (2026-11-07)

**Estado:** implemented; validación automática CI PASS; revisión independiente de arquitectura/seguridad y aceptación del propietario pendientes.

- `0002-tenant-lifecycle-invariants.sql` aplica las restricciones de lifecycle y ownership.
- `migrate.mjs` ya no está limitado a 0001: descubre migraciones SQL versionadas y las aplica ordenadamente, con una transacción y advisory lock por versión.
- La relación Organization→Tenant no permite borrar la organización mientras conserve tenants.
- El campo organization_id no se puede reasignar; una tenant en estado deleted no puede modificarse.
- Las transiciones permitidas se restringen a pending_provisioning→active, active→suspended|closing, suspended→active|closing y closing→deleted.
- La política RLS no expone tenants deleted, aunque exista membership histórica.
- No se añadieron endpoints PLT-006/007: siguen catalog-only y bloqueados por docs/49; no se inventaron contratos.
- Commits de implementación: e716c772a124afe176f274f0f3398fb764a13890, c1b9082d4fb6f7ee3b8c685191aa7657acc8969f, a03177a185ec4bfcd7df3582f181c443efeeeafa, e5c5fd7280c8a34cefef4c8eadb6ab395898c1c7, f87fcb0cb3ca1680e71673a46b4f6f45b23406af, 6cbe06c83ffddfe2d5f356a43f5ee16b82e36aab, 479a8234d2f6b78b0bb8e6474c39e4a388034c3a, 84bab54d78b5246174dab6a6a9eb9173d0149476.
- Source CI: [run 42379649591](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42379649591), [run 42379841071](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42379841071) y [run 42380055974](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42380055974) — SUCCESS. La ejecución #42379457502 falló inicialmente por una aserción de test, no por migración/build/typecheck; el SQLSTATE esperado se corrigió y las dos ejecuciones posteriores pasaron.

## 8. TASK-002 — Resolución segura de Tenant Context (2026-11-07)

**Estado:** implemented y CI-verified; revisión independiente de arquitectura/seguridad y aceptación del propietario pendientes.

### Controles implementados

- `0003-tenant-context-authorization.sql` introduce `platform.can_use_tenant(uuid)` como predicado de autorización con permisos controlados. Comprueba que usuario global, organización, tenant y membership estén activos.
- `DatabaseService.withTenantContext` establece primero `app.user_id`, ejecuta la comprobación de acceso y solo después establece `app.tenant_id`. El UUID enviado por el cliente no concede acceso.
- `DatabaseService.withTenantContextAtVersion` comprueba la versión de autorización esperada, bloquea la fila tenant durante la operación sensible con `FOR NO KEY UPDATE`, vuelve a validar el acceso y rechaza snapshots obsoletos con `TENANT_AUTHORIZATION_STALE`.
- RLS permite al rol runtime actualizar únicamente `authz_version` y solo dentro del tenant transaction-local validado. Los triggers incrementan la versión ante cambios de membership, membership_roles, roles y role_permissions; el lifecycle de Tenant también invalida los snapshots.
- `role_permissions` incorpora `tenant_id`, una FK compuesta `(role_id, tenant_id)` y una política RLS que preservan el ownership del tenant en los grants.
- `TenantContextGuard` exige principal OIDC verificado, `tenantId` UUID y metadata `@TenantAccessPurpose(...)`. Construye un contexto inmutable por request con actor, tenant, membership, authzVersion, roles, permisos, entitlements, configuración regional, propósito y correlationId.
- `IdentityService` y el contrato `TenantAccessContext` permanecen independientes del guard HTTP. `ApiProblemFilter` conserva el correlationId en errores. No se usa contexto mutable global ni singleton por tenant.
- PLT-005 conserva su respuesta pública. membershipId, authzVersion, actorId y purpose se mantienen internos y no se exponen.

### Validación añadida

- Unit tests del guard: OIDC ausente, tenantId inválido, propósito ausente/inválido, contexto inmutable y propagación de X-Correlation-ID.
- PostgreSQL/RLS: cross-tenant devuelve 404; usuarios deshabilitados, membership suspendida/revocada, organización suspendida y tenant suspendido no pueden establecer contexto.
- Versionado: la revocación de un role_permission invalida el snapshot previo; transacciones con versión actual funcionan y una versión obsoleta falla. Se valida también el bump usando el rol runtime restringido.
- Source CI run [#47](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42383524043), commit `74febd28056043cda15221f29c8c5b71290ca06c` — SUCCESS: instalación frozen, migraciones PostgreSQL, segunda ejecución idempotente, build, typecheck y suite unit/integration.

### Límites que permanecen

- El guard es reusable; PLT-005 es la única ruta actual que lo consume. Las futuras rutas tenant-scoped deben declarar propósito y usar `withTenantContext` o `withTenantContextAtVersion` en el boundary transaccional.
- TASK-002 no implementa la matriz RBAC/ABAC por acción/asset/purpose. El contexto proporciona los datos, pero las decisiones allow/deny corresponden a TASK-004.
- No se habilitaron mutaciones HTTP de Tenant/Membership/Role, PartnerTenantGrant, PlatformGrant JIT, workers, cache/files/jobs ni endpoints catalog-only. TASK-003 y TASK-004/005 siguen pendientes.
## 9. TASK-004 — RBAC/ABAC y catálogo de permisos (2026-11-07)

**Estado:** núcleo de políticas implementado y CI-verified; asignación/persistencia de roles, auditoría durable, workflow de aprobación y revisión independiente siguen pendientes.

### Catálogo y roles

- `0004-authorization-permission-catalog.sql` inserta el vocabulario canónico en `platform.permissions` con `risk_class`; usa `ON CONFLICT DO NOTHING` y no concede permisos a usuarios ni crea memberships.
- `authorization/permission-catalog.ts` define las claves TypeScript y metadata de riesgo y aprobación independiente. La prueba PostgreSQL compara todas las keys/risk_class de la base con el catálogo tipado.
- `authorization/tenant-role-catalog.ts` define templates least-privilege para Tenant Owner, Tenant Admin, Integration Admin, Marketing Manager, Inbox Supervisor, Agent, Analyst, Compliance Auditor y Developer/API Integrator.
- Los roles `platform_owner`, `platform_operations` y `support_jit` se mantienen separados y no están incluidos en el catálogo de roles tenant.
- Los templates son definiciones versionadas; no se asignan automáticamente ni se materializan todavía en `platform.roles`/`platform.role_permissions`.

### Motor de políticas

- `TenantAuthorizationPolicyEvaluator` es una política pura intercambiable a través de `AuthorizationPolicyEvaluator`; no conoce NestJS, PostgreSQL ni SDKs externos.
- La decisión combina membership activa, tenant, propósito declarado, permission key, entitlement, ownership, estado del recurso, asset grant, consentimiento ligado al propósito, aprobación independiente y frescura de capability externa.
- El motor usa permission keys efectivas, nunca el nombre del rol como bypass. Ante evidencia obligatoria ausente, desconocida, revocada o desactualizada, deniega.
- `AuthorizationService` es el boundary de aplicación. `AuthorizationGuard`, `@RequirePermission` y `@RequireTenantPermission` proporcionan enforcement en HTTP; el decorador compuesto incorpora TenantContextGuard + purpose + permission para no omitir una capa.
- `TenantRoleAssignmentPolicy` exige tenant_owner, bloquea autoasignación, roles de plataforma, permisos que excedan los del actor y exige aprobación independiente para `roles.assign`.

### Pruebas y evidencia

- Matriz unitaria allow/deny: membership, tenant, purpose, permission, entitlement, ownership, estado, asset grant, consent, approval, self-approval y capability freshness.
- Tests de catálogo: unicidad de templates, keys válidas, separación de roles de plataforma y privilegios de Agent.
- Tests de asignación: aprobación independiente, autoasignación, actor no owner, tenant cruzado, rol de plataforma y escalamiento de privilegios.
- PostgreSQL: el catálogo persistido y los risk_class deben coincidir exactamente con `PERMISSION_CATALOG`.
- Source CI run [#67](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42385036275), commit `53e50dc00daccc7c64c7931e468e6ef0af132940` — SUCCESS: frozen install, migraciones versionadas, segunda ejecución idempotente, build, typecheck y tests.

### Alcance pendiente y límites

- No se implementan mutaciones ni rutas IAM-007..020: permanecen catalog-only y bloqueadas hasta congelar sus schemas y controles en docs/49.
- El catálogo de roles no se asigna ni persiste automáticamente. Falta el caso de uso transaccional para crear/revocar membership_roles, concurrencia/idempotencia y reconciliación.
- Los hechos ABAC de asset, consentimiento y capability deben ser resueltos por adapters/use cases confiables; no se aceptan como evidencia de confianza procedente directamente del cliente.
- Las denegaciones sensibles/críticas evaluadas por AuthorizationGuard y las acciones de approval se registran en el audit stream append-only de TASK-005. No toda denegación pre-tenant-context queda en ese ledger; el outbox/consumer y el workflow HTTP permanecen pendientes.
- La política de rol/permiso es una baseline técnica inicial least-privilege derivada de docs/37 y PD-019; la matriz final y reglas operativas requieren revisión independiente y aceptación del propietario.
## 10. TASK-005 — Step-up, approvals y auditoría durable (2026-11-07)

**Estado:** núcleo de backend implementado y CI-verified en PostgreSQL efímero; no se declara `verified`/`accepted` globalmente. Revisión independiente y aceptación del Product Owner pendientes.

### Evidencia step-up basada en OIDC

- `OidcJwtVerifier` conserva `auth_time`, `acr` y `amr` solo después de validar la firma RS256/JWKS y el resto de claims del token.
- `OidcStepUpEvidenceVerifier` exige `auth_time` reciente y una coincidencia con `STEP_UP_ALLOWED_ACR` o `STEP_UP_ALLOWED_AMR`. `STEP_UP_MAX_AGE_SECONDS` tiene default de 300 segundos y límites configurados.
- Las allowlists están vacías en `.env.example` intencionalmente: sin valores confirmados del Identity Provider, el step-up falla cerrado. No se ha validado aún un token de un IdP real. Los significados ACR/AMR dependen del contrato del proveedor; no se infiere MFA solo por un texto arbitrario.
- Antes de aceptar una decisión, el flujo vuelve a resolver `issuer + subject`, verifica que el usuario local esté activo y que su identidad coincida con el actor del contexto; también verifica expiración del token.

### Workflow de aprobación

- `ApprovalPolicyResolver` separa la política de quorum de la persistencia. La baseline actual requiere una aprobación independiente para acciones críticas y dos aprobadores distintos para publicación de Ads, cambio de presupuesto, exportaciones y borrado de datos.
- La baseline de quorum/expiración es configuración técnica inicial, no una aprobación final de umbrales o gobierno por el propietario. No hay montos monetarios hardcodeados.
- Las solicitudes enlazan tenant, actor solicitante, action key, purpose, resource type/id y hash SHA-256 del snapshot canónico de la acción. El payload original no se persiste en la tabla de approvals.
- La idempotencia es por tenant + solicitante + idempotency key; reutilizar la key para una acción distinta devuelve conflicto.
- Cada decisión se registra una sola vez por aprobador; requester no puede aprobar su propia solicitud. Las decisiones y sus evidencias de step-up son inmutables. Los cambios de estado se controlan en PostgreSQL y el quorum se aplica de forma transaccional.
- `consumeAndStage` consume una única aprobación aprobada para el hash exacto y permite al caso de uso escribir un comando/outbox local en la misma transacción. No llama proveedores ni ejecuta HTTP externo.

### Auditoría append-only

- `AppendOnlyAuditRepository` agrega eventos por tenant, bloquea el stream head, avanza secuencia y SHA-256 hash-chain; verifica orden, previous_hash, event_hash y head.
- PostgreSQL restringe insert/update del stream head a la secuencia siguiente asociada a un evento existente. Triggers rechazan UPDATE/DELETE de audit_events y approval_decisions.
- `AuthorizationDecisionAuditService` persiste denegaciones y decisiones permitidas sensibles/críticas en el guard HTTP. Las decisiones normales permitidas no generan evento de bajo valor.
- El hash-chain aporta evidencia de alteración para el rol runtime; no es un anclaje externo ni una garantía criptográfica de no repudio contra administradores privilegiados de la base.

### Pruebas y CI

- Unit: claims step-up ausentes, obsoletos, futuros, ACR/AMR no allowlisted, policy no configurada; hash canónico del snapshot; hash de auditoría determinista; quorum 1/2 y roles.
- PostgreSQL efímero: crea requester y dos approvers; prueba idempotencia/conflicto, no autoaprobación, dos votos distintos, step-up, reintento idempotente, quorum, acción/hash alterado, rollback del consumo, consumo único, hash-chain y rechazo de UPDATE/DELETE.
- El test de integración se ejecuta solo con `RUN_APPROVAL_INTEGRATION_TESTS=true` y en la base efímera de Source CI. Limpia todos sus datos sintéticos; no usa cuentas ni datos de clientes.
- Source CI run [#112](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42387272987), commit `b38b78ab52dbb96262dc8078518fdf4f55fc5a2c` — SUCCESS: frozen install, migraciones, idempotencia, build, typecheck y suite unit/integration; `RUN_APPROVAL_INTEGRATION_TESTS=true` estuvo activo.

### Límites explícitos

- IAM-018..020 y demás operaciones de approval/audit permanecen catalog-only en OpenAPI; no se añadió ruta HTTP ni se modificó el contract gate.
- `consumeAndStage` no está conectado todavía a una outbox de negocio ni a consumers; su integration test usa una tabla temporal sintética. No se ejecuta publicación de campañas, gasto, mensajes, exports ni borrados.
- Step-up queda deshabilitado operativamente hasta que se configuren y verifiquen los valores ACR/AMR y la disponibilidad real de `auth_time` en el IdP escogido.
- No existe revisión legal de retención, anclaje externo del audit chain ni validación independiente de doble control. No se declara producción lista; GO-PRODUCTION continúa NO-GO.

## 11. TASK-003 — Aislamiento operativo multi-tenant (2026-11-07)

**Estado:** primitives de aislamiento y registro PostgreSQL durable de jobs implementados; verificación CI de esta iteración pendiente. No declarar TASK-003 verified ni accepted. Los adapters concretos de Valkey/object storage/broker y el publisher/consumer siguen pendientes.

### Implementación añadida

- platform/isolation/tenant-resource-namespace.ts centraliza namespaces por UUID de tenant para cache y object storage; valida identificadores, limita claves y rechaza traversal/path absolutos.
- TenantScopedCache decora un puerto CacheStore, obliga a componer todas las claves con tenant/resource y aplica TTL positivo y bounded. La serialización de dominio queda explícita como bytes.
- TenantScopedObjectStorage decora un puerto ObjectStorage, aplica prefijo tenants/{tenantId}/{resource}/..., valida contenido no vacío y MIME, calcula SHA-256 sobre una copia inmutable del contenido y rechaza checksum distinto. El bucket/provider debe completar políticas privadas, TLS, cifrado y autorización.
- TenantJobContextResolver recibe solo un jobId, recupera el registro canónico mediante TenantJobRecordReader y rechaza registros no comprometidos; TenantJobExecutor acepta únicamente contextos creados por el resolver (WeakSet privado) y vuelve a entrar por DatabaseService.withTenantContext en cada intento, de modo que PostgreSQL revalida actor, membership, tenant y RLS dentro de la transacción.
- `0006-tenant-job-outbox.sql` crea `platform.tenant_job_records` con ownership tenant/actor, payload JSON, estados y límites de intentos, índices y RLS. El trigger SQL hace inmutable la identidad/payload y controla transiciones queued→processing→succeeded/failed/dead_letter, intentos y timestamps. `platform.resolve_tenant_job_context(uuid)` expone al rol runtime solo job/tenant/actor/purpose/correlation, nunca el payload; `platform.resolve_tenant_job_idempotency(...)` resuelve duplicados dentro del tenant/actor transaction-local sin conceder SELECT del payload. RLS está habilitada y el rol runtime recibe INSERT y SELECT(id) solo para `RETURNING`; no puede leer payload ni tiene UPDATE directo. La política no usa FORCE RLS en esta tabla porque la función SECURITY DEFINER, propiedad del migrador, necesita leer el registro sin contexto tenant para resolver el locator; el runtime no es owner ni BYPASSRLS y solo puede invocar la función de metadata. `PostgresTenantJobRecordReader` implementa el puerto mediante esa función; `PostgresTenantJobRecordWriter.stage(client, input)` inserta en la misma transacción que la mutación de negocio, con idempotencia por tenant/actor/job type/key y SHA-256 del request canónico; reusar una key con otro payload/metadatos produce conflicto. `IsolationModule` registra reader, writer, resolver y executor.
- TenantTelemetryContext depende del puerto TenantPseudonymizer; HmacTenantPseudonymizer implementa HMAC-SHA-256 con clave copiada y de al menos 256 bits, y mantiene tenant/correlation fuera de dimensiones métricas mediante vocabulario allowlisted.
- Los puertos cache/storage permiten adapters intercambiables; no se agregó dependencia de proveedor ni se simula que Valkey, S3 o RabbitMQ estén conectados.

### Pruebas añadidas

- Namespace distinto por tenant, encoding de claves y rechazo de UUID/recurso/path traversal inválidos.
- Cache tenant A/B aislada, eliminación namespaced y TTL bounded.
- Object storage tenant A/B aislado, prefijos esperados y validación de integridad/path.
- Job context inmutable, propósito/UUID inválido denegado y ejecución que delega obligatoriamente a withTenantContext.
- Telemetría: pseudónimo para logs, ausencia de tenant ID en métricas y rechazo de labels arbitrarios.
- Las seis suites iniciales .spec.ts (incluyendo HMAC), la suite del reader PostgreSQL y la suite del writer transaccional se registraron en el target api:test: ocho suites unitarias de aislamiento y una suite PostgreSQL gated (`RUN_TENANT_JOB_INTEGRATION_TESTS=true`).

### Límites y siguientes pasos

- Aún falta implementar adapters reales de Valkey y object storage, inyectarlos mediante módulos de infraestructura y verificar ACL/TLS/encryption/bucket policy.
- El registro durable se puede stagear en la misma transacción de negocio, pero aún no hay publisher/outbox dispatcher, inbox de mensajes externos ni consumer. Falta schema validation versionada del payload, tenant/aggregate match, dedupe, retry con backoff orquestado, DLQ y replay. La tabla tiene estados y límites de intentos, pero no debe confundirse con un broker ni con el dispatcher.
- Falta resolver la identidad del actor del job desde un principal de servicio/actor persistido con política explícita; withTenantContext actualmente exige usuario/membership activos y por tanto falla cerrado para actors no provisionados.
- La suite PostgreSQL gated cubre staging/idempotencia/rollback/metadata mínima/ejecución revalidada y denegación de lectura del payload; aún falta ejecutarla en CI y probar pool reuse A→B; falta integración real con Valkey, proveedor de objetos y broker.
- El algoritmo HMAC está implementado, pero falta el adapter de secret manager y su wiring operativo; no configurar una clave desde el repositorio ni desde datos del tenant.
- No se modificaron APIs ni eventos catalog-only. TASK-003 continúa in_progress; no hay producción ni datos reales autorizados.
