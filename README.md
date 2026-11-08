# WhatsBusiness

Plataforma SaaS multi-tenant para integrar oficialmente productos y APIs del ecosistema Meta. Los bounded contexts iniciales incluyen Platform Identity, CRM con CRM Intelligence basada en machine learning clásico, Inbox omnicanal y automatizaciones deterministas.

**Estado: GO-CODE aprobado en environment/local.** El workspace Nx/pnpm, backend NestJS, shell Angular y validación CI están establecidos. El slice inicial de Identity/Tenant/Membership incorpora autenticación OIDC/JWKS, persistencia PostgreSQL con RLS y APIs de lectura. La validación automática del slice pasó el 7 de noviembre de 2026: Source CI ejecutó frozen install, migración PostgreSQL, build, typecheck y pruebas OIDC/RLS; Contract CI pasó OpenAPI, AsyncAPI y JSON Schema. La revisión independiente de seguridad/arquitectura sigue pendiente.

**GO-PRODUCTION continúa NO-GO.** No están autorizados despliegues productivos, datos o credenciales reales, escrituras Meta, mensajes reales, cambios de campañas, gasto publicitario, proveedor IA externo ni costes recurrentes.

## Inteligencia del CRM

La IA del CRM significa machine learning clásico/estadístico, scoring, clasificación, predicción, segmentación y ranking con prioridad CPU-first. No utiliza LLM ni agentes de IA dentro del CRM. Diseño: `docs/62-CRM-MACHINE-LEARNING-STRATEGY.md`.

## Rama y reglas de trabajo

- Rama autorizada: environment/local.
- No modificar master ni environment/develop sin autorización expresa.
- Seguir el contrato universal de agentes en AGENTS.md.
- implemented, verified y accepted son estados diferentes. La aceptación final pertenece al propietario.

## Requisitos y versiones

- Node.js 26.13.0, definido en .node-version.
- pnpm 10.34.9, fijado en package.json.
- PostgreSQL 18 para persistencia.
- Proveedor OIDC compatible con JWT RS256 y JWKS. Keycloak está previsto como IdP local.
- Docker Engine y Docker Compose v2 para el laboratorio TASK-039.

Las versiones directas están fijadas en los manifests. pnpm-lock.yaml es obligatorio y está versionado.

## Instalación reproducible

1. Habilita Corepack.
2. Activa pnpm 10.34.9.
3. Ejecuta pnpm install --frozen-lockfile.
4. Ejecuta pnpm build, pnpm typecheck y pnpm test.

Cuando cambie package.json, Source CI sincroniza el lockfile, vuelve a ejecutar una instalación frozen y solo confirma el lockfile actualizado después de que build, typecheck y tests pasen. Las pull requests requieren un lockfile sincronizado; una instalación sin lockfile no se acepta como reproducible.

## Aplicaciones y módulos

| Ruta | Responsabilidad | Estado |
|---|---|---|
| apps/api | API modular NestJS, prefijo HTTP /api | Foundation + Identity/Tenant/Membership inicial |
| apps/api/src/platform/database | Pool PostgreSQL y contexto transaccional | Slice inicial con SET LOCAL |
| apps/api/src/platform/identity | Verificación JWT/JWKS y consultas de User/Tenant/Membership | Slice inicial, read-only |
| apps/api/src/inbox/domain | Políticas puras de asignación, presencia, ownership lease, handoff, notas privadas y reply idempotency | Slice US-021; CI y runtime/persistencia pendientes |
| apps/api/migrations | Esquema Platform Identity y policies RLS | Primera migración versionada |
| apps/web | Angular standalone shell es-EC | Shell inicial; login y selector tenant pendientes |
| contracts/openapi | Contratos HTTP y registro API ID | 296 operaciones; PLT-001..005 habilitadas para foundation read-only |
| contracts/asyncapi y contracts/schemas | Contratos de eventos versionados | 69 canales/schemas; publishers y consumers runtime pendientes |
| spike/task-039-lab | Laboratorio aislado con datos sintéticos | Evidencia parcial; no es entorno productivo |

## APIs del slice Identity

Todas las rutas exigen un access token OIDC firmado con RS256. Se valida kid, firma RSA, issuer exacto, audience, expiración y nbf cuando existe, usando JWKS cacheado y refrescado ante un kid desconocido. La identidad estable es el par issuer + subject; email no es una clave de identidad y no se auto-provisiona un usuario a partir de un JWT.

- GET /api/v1/me: devuelve la identidad local provisionada y sus memberships.
- GET /api/v1/tenants?cursor=&pageSize=25: devuelve solo tenants activos con membership activa; cursor keyset y página de 1 a 100.
- GET /api/v1/tenants/{tenantId}/context: devuelve la membership activa, roles, permisos, entitlements y configuración regional. Tenant inexistente o no autorizado devuelve 404 para no revelar su existencia.

Estas APIs son de lectura. No están implementados endpoints para crear tenants, invitar usuarios, modificar memberships/roles, suspender tenants, administrar grants de partner ni conceder soporte JIT.

## Persistencia y aislamiento

- User, Organization, Tenant, Membership, Role, Permission y Entitlement pertenecen al bounded context Platform Identity.
- Las migraciones se aplican explícitamente mediante pnpm db:migrate; la API no migra el esquema automáticamente al arrancar.
- MIGRATION_DATABASE_URL debe usar un propietario/migrador separado. DATABASE_URL debe usar whatsbusiness_app, que debe ser LOGIN, NOSUPERUSER y NOBYPASSRLS, y no dueño de las tablas.
- RLS está habilitado y forzado en tenants, memberships, roles, membership_roles, role_permissions y entitlements.
- app.user_id y app.tenant_id se establecen con set_config(..., true) dentro de la transacción; el contexto no persiste al devolver la conexión al pool.
- El rol runtime es read-only en este slice. Provisioning y mutaciones administrativas requieren el siguiente trabajo con policy, audit y approval.

## Configuración local

1. Crea una base de datos PostgreSQL vacía y un usuario migrador/propietario separado.
2. Crea el rol de aplicación restringido con LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT y NOBYPASSRLS.
3. Copia .env.example a .env, cambia todos los placeholders y exporta las variables al proceso. La API no carga dotenv automáticamente.
4. Configura MIGRATION_DATABASE_URL para el usuario migrador y DATABASE_URL para whatsbusiness_app.
5. Configura OIDC_ISSUER, OIDC_AUDIENCE y OIDC_JWKS_URI con los valores exactos del realm y cliente.
6. Provisiona usuarios, organización, tenant y memberships mediante el proceso administrativo controlado. No existe auto-registro.

Variables principales: DATABASE_URL, MIGRATION_DATABASE_URL, DATABASE_POOL_MAX (1–50), DB_SSL, OIDC_ISSUER, OIDC_AUDIENCE y OIDC_JWKS_URI. En producción se exige DB_SSL=true y endpoints OIDC HTTPS; no usar los valores locales de ejemplo.

## Comandos de desarrollo

- Migraciones: pnpm db:migrate.
- API: pnpm exec tsx apps/api/src/main.ts.
- Web: pnpm nx run web:serve.
- Calidad: pnpm build, pnpm typecheck y pnpm test.

API local: http://localhost:3000. Angular dev server: http://localhost:4200.

## CI

- Source workspace validation: Node/pnpm exactos, sincronización + frozen install, migración PostgreSQL, RLS integration, build, typecheck y tests.
- Contract validation: Redocly/OpenAPI, AsyncAPI, API IDs habilitadas y fixtures JSON Schema positivos/negativos.
- TASK-039 Docker lab: pruebas sintéticas acotadas de infraestructura.

## Pendientes del siguiente slice

- OIDC dev realm reproducible y E2E HTTP autenticado.
- Provisioning/invitations y lifecycle de Organization, Tenant, User y Membership.
- Matriz RBAC/ABAC completa, roles/permissions versionados y mutaciones protegidas.
- Invalidación de sesión y authzVersion, PartnerTenantGrant y PlatformGrant JIT.
- Audit append-only y transactional outbox, worker tenant context y tests crash/replay.
- Tenant selector Angular, accesibilidad WCAG 2.2 AA y pruebas E2E.
- TASK-039 sigue partially_verified; G0-PRODUCTION sigue NO-GO.

## Documentación operativa

- AGENTS.md: contrato obligatorio de agentes.
- docs/37-PLATFORM-IDENTITY-AND-TENANCY-SPEC.md.
- docs/42-INITIAL-DATA-MODEL.md.
- docs/48-CODING-ARCHITECTURE-AND-REUSE-STANDARD.md.
- docs/57-IMPLEMENTATION-KICKOFF-AND-G0-DECISION.md.
- docs/58-IDENTITY-TENANCY-IMPLEMENTATION.md.

**La aceptación final del producto sigue perteneciendo al propietario.**

## CRM Contacts e Identity Resolution — estado del slice HTTP (2026-11-08)

- CRM-001..004: listar, crear, consultar y actualizar contactos tenant-scoped; CRM-005/006: consultar y vincular identidades namespaced; CRM-007: detectar candidatos de duplicación con revisión humana obligatoria.
- CrmContactsModule está registrado en AppModule. Los controllers exigen OIDC, tenant context, propósito estable y RBAC. Los casos de uso revalidan authzVersion dentro de transacciones tenant-scoped.
- Contact mantiene ETag/If-Match, idempotencia, cursor estable, provenance inmutable, auditoría append-only y RLS. Identity añade namespace provider/product/channel/type y unicidad por tenant. Identity resolution usa señales de identidad exacta, teléfono E.164 verificado o procedencia; no devuelve PII ni fusiona automáticamente.
- CRM-007: consulta limitada a 100 resultados, máximo 10.000 candidatos previos a scoring (falla cerrado al excederlo), índices parciales en migración 0026 y auditoría de consulta.
- Contract CI [#31](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42511475181) SUCCESS validó OpenAPI/IDs/schemas del contrato CRM-007 en f0ebaae6. Source CI [#596](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42512027909) y CodeQL [#131](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42512027905) SUCCESS en abab9fe8, incluyendo migraciones/idempotencia, build, typecheck, pruebas API/PostgreSQL y backend PostgreSQL/RabbitMQ. Los commits posteriores de esta rama no cambiaron estos archivos CRM.
- El allowlist de implementación permite exactamente PLT-001..005 y CRM-001..007: 12 operaciones design-frozen; las otras 284 permanecen catalog-only.
- TASK-042/043/053 siguen `in_progress` hasta revisión independiente, calibración con datos sintéticos representativos y aceptación del Product Owner. CRM-008..010 (merge-preview, merge reversible y undo), event publishing de TASK-028 y retención/exportación/eliminación legal de TASK-059 siguen pendientes. GO-PRODUCTION continúa NO-GO.


## Inbox colaborativo — US-021 / TASK-047

El bounded context `apps/api/src/inbox/domain` contiene políticas puras para routing y asignación multi-tenant, presencia con expiración, leases exclusivos, handoff y notas internas privadas, además de una policy anti-doble-respuesta basada en lease e idempotency fingerprint. Su estado, cobertura y gates se documentan en [docs/75-US-021-INBOX-COLLABORATION-DOMAIN-SLICE.md](docs/75-US-021-INBOX-COLLABORATION-DOMAIN-SLICE.md). INB-006..014/018 siguen contract-gated; no hay aún controllers, persistencia, outbox ni UI Inbox. TASK-047/US-021 permanecen `in_progress` hasta integración/CI y aceptación independiente.
