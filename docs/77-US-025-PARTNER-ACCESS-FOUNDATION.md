# 77 — US-025: política de acceso delegado de partners

**Fecha de integración:** 2026-11-09  
**Historia:** US-025 — acceso delegado de agencias/partners.  
**Tarea:** TASK-058.  
**Rama canónica:** `environment/local`.  
**Estado:** política pura de dominio integrada y suite registrada; persistencia, RLS y autorización runtime siguen pendientes.

## Alcance integrado

Se incorpora `PartnerTenantGrantPolicy` en `apps/api/src/platform/identity/partners`. El módulo de identidad la registra y exporta. La política no depende de NestJS, PostgreSQL ni HTTP, y reutiliza PermissionKey, catálogo de roles y ApprovalEvidence del contexto de identidad existente.

Las decisiones cubiertas son:
- Creación de grants solo para tenant cliente activo, organización partner activa de tipo agency/reseller/provider y sujeto con membership activa en esa organización.
- Separación de funciones: tenant owners activos distintos para conceder y aprobar, con evidencia de aprobación válida.
- Roles existentes/versionados, sin tenant_owner/tenant_admin/support_jit, y acciones permitidas por los roles.
- Permisos sensibles a asset ligados a un provider/tipo/ID exactos, sin comodines ni producto cartesiano de scopes.
- Evaluación de acceso por tenant/partner/subject/action/asset/purpose, vigencia y estado.
- Reducción de scope monotónica, versión optimista y vigencia no ampliada.
- Revocación tenant-scoped, unidireccional e idempotente.

## Pruebas

`partner-tenant-grant.policy.spec.ts` se añade a `api:test`. Los 22 casos de la rama de origen habían pasado en su suite API; la validación final debe repetirse sobre el HEAD canónico.

## Límites explícitos

Este slice no crea grants persistidos, no modifica `platform.can_use_tenant`, no amplía memberships del tenant cliente y no habilita controllers. Los hechos de organización, membership, owners y aprobación son entradas confiables que en el siguiente slice deberán resolverse desde adapters tenant-scoped, nunca desde el navegador.

Para completar TASK-058 faltan tablas/constraints/RLS, transacción de consumo de aprobación + grant + audit + outbox, contexto partner separado, revalidación en API/jobs/worker, invalidación de cache/sesión y pruebas PostgreSQL BOLA/IDOR y concurrencia. PAR-001..007 siguen catalog-only hasta API Contract Freeze + G0. US-025/TASK-058 permanecen `in_progress`, no accepted.
