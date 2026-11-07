# 58 — Implementación inicial de Identity, Tenant y Membership

**Rama:** environment/local. **Gate:** GO-CODE. **Estado:** implementación inicial; CI y revisión independiente pendientes al momento de este cambio.  
**Relacionado:** US-001/002/024, TASK-001/002/004, PLT-003..005, docs/37, docs/42, docs/44, docs/48 y docs/57.

## 1. Alcance

- Valida access tokens OIDC JWT RS256 con kid, firma RSA, issuer exacto, audience, expiración y nbf opcional usando JWKS remoto cacheado y refrescado ante rotación de key.
- Resuelve User por el par (issuer, subject); email no es identificador y no existe auto-provisioning por login. Solo un usuario local active puede continuar.
- Usa PostgreSQL Pool, transacciones explícitas y contexto de actor/tenant con set_config(..., true); no conserva el contexto en la sesión que vuelve al pool.
- Añade migración de Organization, User, Tenant, Membership, Role, Permission, MembershipRole y Entitlement.
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

pnpm db:migrate aplica apps/api/migrations/0001-platform-identity.sql usando MIGRATION_DATABASE_URL. Usa advisory lock y platform.schema_migrations para aplicar la versión una sola vez dentro de una transacción.

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
- Source CI provisiona un PostgreSQL efímero, crea el rol runtime restringido, aplica la migración, ejecuta build/typecheck y tests.
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

TASK-001, TASK-002 y TASK-004 quedan in_progress hasta revisión y evidencia CI completa. TASK-005 sigue proposed. Esta implementación no es aceptación productiva ni revisión independiente.
