# 58 — Implementación inicial de Identity, Tenant y Membership

**Rama:** environment/local. **Gate:** GO-CODE. **Estado:** implementación inicial; CI automático PASSED el 2026-11-07; revisión independiente pendiente.  
**Relacionado:** US-001/002/024, TASK-001/002/004, PLT-003..005, docs/37, docs/42, docs/44, docs/48 y docs/57.

## 1. Alcance

- Valida access tokens OIDC JWT RS256 con kid, firma RSA, issuer exacto, audience, expiración y nbf opcional usando JWKS remoto cacheado y refrescado ante rotación de key.
- Resuelve User por el par (issuer, subject); email no es identificador y no existe auto-provisioning por login. Solo un usuario local active puede continuar.
- Usa PostgreSQL Pool, transacciones explícitas y contexto de actor/tenant con set_config(..., true); no conserva el contexto en la sesión que vuelve al pool.
- Añade migraciones versionadas de Organization, User, Tenant, Membership, Role, Permission, MembershipRole y Entitlement.
- TASK-001 amplía el modelo tenant: ownership Organization inmutable, FK Organization→Tenant con RESTRICT, estados de lifecycle controlados por trigger, timestamps de suspensión/cierre/borrado, tenant deleted como tombstone inmutable y no visible bajo RLS.
- Fuerza RLS sobre tablas tenant-scoped y exige que el rol runtime sea LOGIN, NOSUPERUSER, NOBYPASSRLS y no-owner.
- Implementa tres APIs autenticadas de solo lectura: GET /v1/me, GET /v1/tenants y GET /v1/tenants/{tenantId}/context.
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
- Source CI provisiona un PostgreSQL efímero, crea el rol runtime restringido, aplica todas las migraciones versionadas, ejecuta build/typecheck y tests. El workflow #14 (run 42379649591), commit 6cbe06c83ffddfe2d5f356a43f5ee16b82e36aab, finalizó SUCCESS: migration, build, typecheck y suite PostgreSQL/OIDC pasaron. El intento previo #13 detectó una expectativa SQLSTATE incorrecta en el test RESTRICT; se corrigió de 23503 a 23001 y el siguiente run pasó.
- Contract CI exige que solo PLT-001..005 estén habilitadas para el scope foundation aprobado.

El test PostgreSQL se omite localmente cuando no se suministran DATABASE_URL y MIGRATION_DATABASE_URL; Source CI proporciona ambas para ejecutarlo.

## 6. Fuera de alcance / pendiente

- Auto-registro, invitations, alta/suspensión/revocación y mutaciones de Tenant/Membership.
- OIDC discovery dinámico, logout, refresh token, introspection y revocation endpoint.
- Matriz RBAC/ABAC completa, seed de roles/permisos, step-up, aprobación y auditoría append-only.
- PartnerTenantGrant, PlatformGrant JIT y revocación/invalidación de grants.
- Worker tenant context, cache/storage/jobs/telemetry multi-tenant.
- Outbox/consumer y recuperación crash/replay.
- OIDC dev realm reproducible y E2E HTTP de extremo a extremo.
- UI de login y tenant selector Angular.

Source workspace validation #42376234089 y Contract validation #42376234088 finalizaron SUCCESS en el commit 0e0927bdcae658d4e4b1ccae28a5c5f89cf4b183. El primero pasó frozen install, migración PostgreSQL, build, typecheck y pruebas unitarias/RLS; el segundo pasó OpenAPI, AsyncAPI y JSON Schema. El lockfile generado quedó confirmado en el commit d81593601101d97623684ea02f04539fd29f3e2f. TASK-001, TASK-002 y TASK-004 permanecen in_progress hasta revisión independiente; TASK-005 sigue proposed. TASK-005 sigue proposed. Esta implementación no es aceptación productiva ni revisión independiente.


## 7. TASK-001 — Tenant ownership y lifecycle (2026-11-07)

**Estado:** implemented; validación automática CI PASS; revisión independiente de arquitectura/seguridad y aceptación del propietario pendientes.

- `0002-tenant-lifecycle-invariants.sql` aplica las restricciones de lifecycle y ownership.
- `migrate.mjs` ya no está limitado a 0001: descubre migraciones SQL versionadas y las aplica ordenadamente, con una transacción y advisory lock por versión.
- La relación Organization→Tenant no permite borrar la organización mientras conserve tenants.
- El campo organization_id no se puede reasignar; una tenant en estado deleted no puede modificarse.
- Las transiciones permitidas se restringen a pending_provisioning→active, active→suspended|closing, suspended→active|closing y closing→deleted.
- La política RLS no expone tenants deleted, aunque exista membership histórica.
- No se añadieron endpoints PLT-006/007: siguen catalog-only y bloqueados por docs/49; no se inventaron contratos.
- Commits de implementación: e716c772a124afe176f274f0f3398fb764a13890, c1b9082d4fb6f7ee3b8c685191aa7657acc8969f, a03177a185ec4bfcd7df3582f181c443efeeeafa, e5c5fd7280c8a34cefef4c8eadb6ab395898c1c7, f87fcb0cb3ca1680e71673a46b4f6f45b23406af, 6cbe06c83ffddfe2d5f356a43f5ee16b82e36aab.
- Source CI: [run 42379649591](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42379649591) — SUCCESS. La ejecución #42379457502 falló inicialmente por una aserción de test, no por migración/build/typecheck; el test fue corregido y reejecutado satisfactoriamente.
