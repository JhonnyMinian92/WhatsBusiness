# 37 — Especificación funcional: identidad, organizaciones y tenancy

**Relacionado:** TASK-001..005, TASK-034, US-001, US-002, US-024, US-025, PD-001, PD-016, PD-017.  
**Estado:** baseline funcional vigente; slice inicial de Identity/Tenant implementado y validado automáticamente de forma parcial (TASK-001/TASK-002, 2026-11-07). RBAC/ABAC completo, partner/JIT grants, operaciones administrativas, auditoría/outbox, workers y revisión independiente siguen pendientes. La implementación y su evidencia están registradas en docs/58.  
**Autoridad:** las decisiones PD-001/016/017 y los ADR aceptados prevalecen. Los nombres de roles y permisos aquí son un catálogo inicial extensible.

## 1. Propósito y límites

Definir el límite de seguridad que separa clientes SaaS, uso interno EcuApp, agencias, usuarios, membresías y operadores de plataforma. El tenant es el límite primario de propiedad de datos. Una organización agencia no obtiene acceso a un tenant cliente por jerarquía, relación comercial ni coincidencia de usuario.

La autenticación demuestra quién es el usuario; no determina por sí sola a qué tenant puede acceder ni qué puede hacer. El backend resuelve y valida el contexto en cada frontera de confianza.

## 2. Conceptos canónicos

| Entidad | Responsabilidad | Regla |
|---|---|---|
| User | Identidad humana global | Clave interna UUID; identidad OIDC por combinación issuer + subject |
| Organization | Agrupación comercial/administrativa | No constituye por sí sola permiso de lectura sobre tenants |
| Tenant | Espacio aislado del cliente, incluido el tenant interno EcuApp | Límite de propiedad, datos, configuración, cuotas y auditoría |
| Membership | Relación usuario-tenant | Define estado y roles asignados en ese tenant |
| Role / Permission | Catálogo de autorización | Permisos granulares; rol es agrupación, no bypass |
| PartnerOrganization | Agencia/reseller/proveedor | Separado del tenant del cliente |
| PartnerTenantGrant | Delegación explícita a tenant cliente | Alcance por actor, rol, asset, acción, purpose, vigencia y revocación |
| PlatformGrant | Acceso excepcional de operador a tenant | Just-in-time, temporal, motivado y auditado |
| Plan / Entitlement | Capacidades comerciales contratadas | No sustituye autorización ni permiso Meta |
| TenantSettings | Preferencias locales del tenant | Incluye locale, timezone, currency y políticas aprobadas |

Un usuario puede tener memberships en varios tenants. Seleccionar el tenant activo no crea membresía. Un usuario agencia opera como actor de su organización y entra al tenant cliente mediante un grant vigente.

## 3. Ciclo de vida

### Tenant

Estados: `pending_provisioning` → `active` → `suspended` → `active`; cierre: `active|suspended` → `closing` → `deleted` (tombstone mínimo de auditoría según política legal aprobada).

- `pending_provisioning`: no permite operaciones de negocio.
- `active`: opera según entitlements y políticas.
- `suspended`: bloquea acciones nuevas; lectura administrativa solo con permiso explícito.
- `closing`: bloquea escrituras ordinarias y ejecuta export/delete workflow aprobado.
- `deleted`: acceso revocado; no implica purga inmediata de backups fuera de su política documentada.

No inferir periodo de retención. La transición a borrado requiere política aprobada, evidencia y tratamiento de copias de respaldo.

### User y Membership

User: `invited`, `active`, `locked`, `disabled`.  
Membership: `invited`, `active`, `suspended`, `revoked`.

Revocar membership debe invalidar sesiones/contextos o impedir su reutilización mediante comprobación de estado y versión de autorización. Deshabilitar un usuario global no borra registros de auditoría.

### PartnerTenantGrant

Campos mínimos: `id`, `partner_organization_id`, `tenant_id`, `subject_user_id` o selector de grupo aprobado, `role_ids`, `asset_ids` (si aplica), `actions`, `purpose`, `valid_from`, `expires_at`, `approved_by`, `revoked_at`, `revoked_by`, `version`. No se admiten grants abiertos sin tenant, actor/alcance, propósito y expiración.

## 4. Contexto de tenant y autorización

1. Validar firma, issuer, audience, expiry y subject del token OIDC.
2. Resolver User por issuer + subject; nunca confiar en un email como identificador estable.
3. Recibir tenant solicitado desde ruta o selector. Un header como `X-Tenant-ID` es solo una selección no confiable.
4. Consultar membership activa o grant de partner vigente y comprobar que el actor pertenece al tenant o que la delegación permite esa acción y esos assets.
5. Construir un `ActorContext` inmutable: user, tenant, membership/grant, roles, purpose, correlationId y authzVersion.
6. Evaluar permission + ownership + estado del recurso + tenant policy + consent/purpose + capability externa cuando corresponda.
7. Abrir transacción y establecer el tenant context para RLS con alcance transaccional (por ejemplo `SET LOCAL`); limpiar automáticamente al finalizar.
8. Auditar allow/deny para acciones privilegiadas.

No confiar en tenant IDs enviados desde el frontend, jobs o mensajes. Los workers deben volver a resolver la membresía/grant y el tenant desde un envelope firmado/interno y validar la autorización adecuada al ejecutar.

## 5. Catálogo inicial de permisos

Nomenclatura `<domain>.<resource>.<action>`; ejemplos:

- `tenant.read`, `tenant.settings.manage`, `tenant.members.read`, `tenant.members.invite`, `tenant.members.manage`.
- `roles.read`, `roles.assign`, `approvals.create`, `approvals.decide`.
- `meta.connections.read`, `meta.connections.manage`, `meta.assets.read`, `meta.capabilities.read`.
- `crm.contacts.read|create|update|merge`, `crm.leads.read|assign|export`.
- `inbox.conversations.read|assign|reply|handoff`, `inbox.notes.create`.
- `automation.read|create|publish|pause`, `ai.suggestions.read`.
- `ads.read`, `ads.draft.create`, `ads.publish.request`, `ads.budget.change.request`.
- `audit.read`, `privacy.export.request`, `privacy.deletion.request`.

ABAC agrega tenant, asset, owner, purpose, estado, consentimiento, capacidad Meta, límite comercial y aprobación. La UI puede ocultar acciones, pero el backend es la autoridad final.

## 6. Roles semilla sugeridos

Roles de tenant configurables: Tenant Owner, Tenant Admin, Integration Admin, Marketing Manager, Inbox Supervisor, Agent, Analyst, Compliance Auditor y Developer/API Integrator. Roles de plataforma separados: Platform Owner, Platform Operations y Support JIT. No asignar automáticamente permisos de plataforma a usuarios de tenant.

La matriz exacta de permisos debe vivir en seed versionado + policy tests. Evitar un rol "admin" que eluda reglas de consentimiento, límites de gasto, tenant ownership o aprobación.

## 7. Planes, cuotas y entitlements

Entitlements expresan qué features y límites contratados están disponibles. No definen el permiso del actor. La decisión final es la intersección de:

`actor authorization ∩ tenant policy ∩ entitlement ∩ consent/legal basis ∩ Meta scope/grant/tier/eligibility ∩ approval`.

El modelo de suscripción es tenant + seats + consumo medido (PD-013/014). No fijar precios, impuestos, márgenes ni cuotas monetarias en esta especificación. Costes de Meta se contabilizan por separado de la suscripción.

## 8. Configuración regional

Defaults de PD-015: `es-EC`, `USD`, `America/Guayaquil`. Guardar identificadores normalizados (locale BCP-47, currency ISO-4217, timezone IANA). La configuración es por tenant; fechas internas en UTC y presentación local.

## 9. APIs internas iniciales

- `GET /v1/me`: identidad y memberships activas del actor.
- `GET /v1/tenants`: tenants que puede seleccionar el actor, sin exponer otros tenants.
- `GET /v1/tenants/{tenantId}/context`: resumen de membresía, roles y entitlements permitidos.
- `GET /v1/tenants/{tenantId}/members`: miembros según permiso.
- Operaciones de invitación, grants, roles y suspensión se exponen solo cuando TASK-004/005 implementen approval/audit.

Todas las rutas tenant-scoped pasan por guards y tenant context backend; los IDs no sustituyen la autorización.

## 10. Criterios de aceptación ampliados

- Dado un usuario autenticado sin membership ni grant, cuando solicita un tenant, entonces obtiene 403/404 sin filtrar su existencia.
- Dado un grant expirado o revocado, cuando intenta acceder a un asset, entonces la operación se deniega aunque el token siga vigente.
- Dado un usuario miembro de dos tenants, cuando cambia el tenant activo, entonces ningún query/job/cache/file/evento conserva el tenant anterior.
- Dado un worker que procesa un evento, cuando el envelope no contiene tenant verificable o su autorización ha sido revocada, entonces falla de forma cerrada y auditable.
- Dado un operador de soporte, cuando obtiene acceso JIT, entonces la razón, recursos, duración, actor aprobador y accesos quedan auditados.
- Dado RLS habilitado, cuando el pool reutiliza una conexión, entonces ningún contexto de tenant anterior filtra datos al siguiente request.
- Dado un PartnerTenantGrant, cuando el cliente lo revoca, entonces todos los siguientes accesos del partner se deniegan y los accesos previos siguen auditables.

## 11. Pruebas obligatorias

Unit: políticas de rol/ABAC, transiciones de estado, expiración de grants, entitlement.  
Integration: OIDC claims, transaction-local tenant context, RLS con rol no superuser y pool real.  
Security: BOLA/IDOR, tenant header spoofing, role escalation, stale token/session, grant replay, JIT expiry.  
E2E: usuario multi-tenant, invitación, selección de tenant, agencia con grant, revocación y soporte temporal.

## 12. Dependencias y decisiones abiertas

- TASK-039 debe validar RLS + pooling antes del bootstrap definitivo.
- TASK-041/060 deben aportar límites medidos de capacidad y coste.
- Revisión legal debe fijar retención, roles y condiciones antes de datos reales.
- El Product Owner debe aprobar umbrales monetarios y matriz final de aprobadores antes de operaciones sensibles en producción.

No bloquean el diseño ni los tests sintéticos: nombres comerciales, tarifas finales, proveedor VPS y aprobación Meta.


## 13. Estado real de implementación (2026-11-07)

- TASK-001: modelo de Tenant, ownership Organization y lifecycle implementados en migraciones 0001–0002; pruebas PostgreSQL de invariantes y RLS pasan en CI.
- TASK-002: tenant authorization predicate, contexto transaction-local, guard por propósito y authzVersion implementados en migration 0003 y backend NestJS; pruebas sintéticas y PostgreSQL pasan en Source CI.
- PLT-003..005 permanecen como las únicas APIs de Identity habilitadas. PLT-005 conserva el contrato público; datos internos de autorización no se exponen.
- El contexto autorizado no equivale a RBAC/ABAC completo. TASK-004 debe implementar decisión allow/deny por action/resource/asset/owner/purpose/state/consent/entitlement/capability.
- TASK-003 (jobs/cache/files/telemetry isolation), assignments/mutaciones administrativas, PartnerTenantGrant, PlatformGrant JIT y propagación a workers siguen pendientes. El núcleo TASK-005 step-up/approval/audit ya está implementado y validado en CI (§15).
- No se han ejecutado pruebas con cuentas/datos reales ni se declara revisión independiente o aceptación del Product Owner. G0-PRODUCTION permanece bloqueado.

## 14. Estado real RBAC/ABAC — TASK-004 (2026-11-07)

- Se agregó un catálogo canónico de permission keys con risk_class en migración 0004. La migración no concede permisos a usuarios ni asigna roles.
- Se definieron templates tenant least-privilege versionados: tenant_owner, tenant_admin, integration_admin, marketing_manager, inbox_supervisor, agent, analyst, compliance_auditor y developer_api_integrator. Platform roles quedan separados.
- El evaluator RBAC/ABAC combina permission, tenant, membership, purpose, entitlement, resource owner/state, asset grant, consent, independent approval y frescura de capability externa.
- `TenantRoleAssignmentPolicy` evita autoasignación y privilege escalation; solo tenant_owner puede asignar templates tenant, con aprobación independiente para roles.assign.
- Las plantillas son definición de código, no assignments persistentes; no hay endpoint de mutación habilitado.
- IAM-007..020 permanecen catalog-only hasta freeze completo de request/response/error, authorization, idempotency, audit y tests conforme a docs/49.
- Denegaciones sensibles/críticas de AuthorizationGuard quedan registradas en el audit stream TASK-005; el outbox/consumer y APIs HTTP de aprobación siguen pendientes. Los datos legales/de consentimiento y capabilities deben venir de adaptadores confiables, no del request del usuario.
- Source CI run #67 [42385036275](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42385036275) pasó migrations/idempotency/build/typecheck/unit/integration. Revisión independiente y aceptación del Product Owner siguen pendientes.
## 15. Estado real de approvals / step-up / audit — TASK-005 (2026-11-07)

- Se implementó el núcleo durable de approval requests y decisions con action binding SHA-256 del tenant, action key, purpose, recurso y snapshot canónico; idempotency, quorum de personas distintas, no autoaprobación, expiración y consumo único.
- El quorum técnico inicial exige dos approvers distintos para ads publish/budget change, CRM lead export, privacy export/deletion; otras acciones críticas se someten al mínimo de una aprobación independiente. La matriz/umbrales de producción requieren aprobación expresa del Product Owner y revisión legal/compliance.
- `auth_time`, `acr` y `amr` solo cuentan como step-up cuando provienen de un JWT cuya firma/JWKS ya se validó y coinciden con allowlists configuradas del IdP. Allowlist vacía = denegación; no se afirma haber probado un IdP real.
- `audit_events` y `approval_decisions` son append-only en PostgreSQL runtime; el audit stream encadena SHA-256 por tenant y verifica secuencia, previous hash, event hash y stream head. El mecanismo no tiene anclaje externo contra administradores privilegiados.
- Source CI run #112 [42387272987](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42387272987) pasó con integración PostgreSQL efímera activa: idempotencia, dos aprobadores, step-up, consumo exacto, rollback, audit chain y UPDATE/DELETE denial.
- No hay endpoints HTTP IAM-018..020 habilitados; permanecen catalog-only hasta freeze docs/49. `consumeAndStage` aún no se conecta a outbox/consumer de negocio y no ejecuta Meta, mensajes, ads, export o delete externo.
- Revisión independiente de seguridad/arquitectura y aceptación del Product Owner siguen pendientes; GO-PRODUCTION continúa NO-GO.

## Addendum TASK-004 — estado de membership destino (2026-11-08)

La política `TenantRoleAssignmentPolicy` ahora valida que la evidencia de destino represente una membresía resuelta por el repositorio (UUID de membership, user y tenant) y que su estado sea asignable. `invited` puede recibir un rol antes de aceptar la invitación; `active` puede recibir una asignación normal; `suspended` y `revoked` no pueden recibir nuevos roles. La comprobación ocurre antes de evaluar autorización y approval. Los hechos de membership no se aceptan como datos autoritativos del cliente.
