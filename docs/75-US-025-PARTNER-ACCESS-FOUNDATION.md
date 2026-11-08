# 75 — US-025: base de acceso delegado de partners

**Fecha:** 2026-11-08  
**Historia:** US-025 — Acceso delegado de agencias/partners.  
**Tarea:** TASK-058.  
**Rama de trabajo:** `feature/us-025-partner-access`, aislada desde `environment/local`.  
**Estado:** slice de política de dominio implementado; pruebas registradas; CI del commit, persistencia, integración y revisión independiente pendientes. **US-025 y TASK-058 continúan `in_progress`.**

## 1. Objetivo y decisiones de seguridad

Permitir que una agencia, reseller o proveedor acceda a un tenant cliente únicamente mediante una delegación explícita, acotada y revocable. Una relación comercial, la pertenencia de una persona a otra organización o la coincidencia de identificadores no crean autorización.

El slice implementado mantiene estas reglas:

1. El tenant destino debe pertenecer a una organización cliente y encontrarse activo.
2. La organización partner debe ser una agencia, reseller o proveedor activo. El actor necesita una membership activa en esa misma organización.
3. El grant identifica tenant, organización partner, usuario concreto, roles versionados, propósito, fecha de inicio, expiración, creador y aprobador.
4. El tenant owner que solicita el grant no puede aprobarlo a sí mismo. La evidencia de aprobación debe estar aprobada, incluir al aprobador esperado y alcanzar el quorum.
5. Cada acción se vincula con un activo exacto o con el tenant. No se crea un producto cartesiano accidental entre una lista de acciones y otra lista de activos.
6. Las acciones `meta.*`, `ads.*` y `whatsapp.*` exigen un activo explícito sin comodines. En cada acceso se comprueba la coincidencia exacta de proveedor, tipo e ID del activo.
7. La política vuelve a resolver el catálogo de roles y compara su versión al evaluar cada acceso. Los roles `tenant_owner`, `tenant_admin` y `support_jit` están prohibidos en un grant de partner.
8. El propósito, tenant, partner, usuario, acción y activo deben coincidir. Se deniega antes del inicio, al expirar o después de revocar el grant.
9. Reducir el alcance requiere un nuevo número de versión, aprobación independiente, y subconjuntos estrictos de roles/acciones/activos; no permite ampliar vigencia ni cambiar el propósito.
10. La revocación conserva actor, tenant, fecha y versión, y su transición en dominio es idempotente.

## 2. Implementación

Archivo principal:

- `apps/api/src/platform/identity/partners/partner-tenant-grant.policy.ts`

La clase pura `PartnerTenantGrantPolicy` expone:

| Operación | Responsabilidad |
|---|---|
| `evaluateCreation` | Valida tenant/partner/subject, owners, aprobación, roles, acciones, assets, purpose, vigencia y versión inicial. |
| `evaluateAccess` | Reevalúa cada solicitud con datos confiables del tenant, partner y membership del actor. |
| `evaluateScopeReduction` | Produce una nueva versión únicamente si el alcance y la vigencia no aumentan y existe aprobación válida. |
| `revoke` | Genera una transición inmutable de revocación ejecutada por un tenant owner activo. |

La política reutiliza `findTenantRole`, `PERMISSION_CATALOG`, `isPermissionKey` y el contrato existente `ApprovalEvidence`. No contiene SQL, dependencias NestJS, estado mutable compartido ni llamadas de red. Su resultado es una decisión de dominio; el adapter futuro debe ejecutarla con facts autenticados y persistir la transición en una transacción tenant-scoped.

Las acciones sensibles a activos se representan como pares `{ permission, asset }`. Esto evita que al conceder una acción sobre un activo se termine concediendo accidentalmente la misma acción sobre todos los activos registrados de la agencia.

## 3. Pruebas añadidas

Archivo:

- `apps/api/src/platform/identity/partners/partner-tenant-grant.policy.spec.ts`

Se incorporan 22 casos a la suite `api:test`, incluyendo:

- tenant interno/suspendido, organización partner no válida/inactiva y membership de partner incorrecta;
- tenant owner inactivo/no autorizado, autoaprobación, aprobación pendiente, quorum y evidencia incoherente;
- roles privilegiados, desconocidos o con versión obsoleta;
- permisos inexistentes o no incluidos en los roles;
- activo obligatorio, comodines y aislamiento exacto entre activos;
- expiración, inicio futuro, revocación y purpose diferente;
- reducción estricta de roles/acciones/vigencia y versionado;
- revocación tenant-scoped, no autorizada e idempotente.

El test target de Nx en `apps/api/project.json` incluye el nuevo spec. Esto acredita que la suite está registrada, no que haya pasado. La ejecución de Source CI para el HEAD de esta rama debe comprobar build, typecheck y pruebas.

## 4. Trazabilidad de criterios

| Criterio | Cobertura actual | Estado |
|---|---|---|
| AC-025-01 — grant explícito con ámbito, actor, rol, assets/acciones, purpose, expiración y aprobador | Política pura de creación y validación de aprobación/alcance | Parcial; falta persistencia y flujo de API |
| AC-025-02 — no heredar acceso por relación comercial o membership ajena | Comprobación de organización partner, usuario y grant exactos en cada decisión | Política implementada; falta integración RLS/runtime y pruebas PostgreSQL BOLA |
| AC-025-03 — revocación inmediata y expiración en sesiones/cache/jobs/permisos | Caducidad y revocación denegadas por la policy; transición de revocación/versionado | Parcial; invalidadores y revalidación durable de sesiones/cache/jobs aún no conectados |
| AC-025-04 — identidad partner/actor y auditoría | El snapshot conserva partner, actor, tenant, creador y aprobador | Parcial; no hay todavía escritura transaccional a audit/outbox ni consumer de invalidación |
| AC-025-05 — soporte JIT separado | `support_jit` no es un rol delegado y los grants partner solo aceptan organizaciones externas válidas | Parcial; falta completar y verificar el flujo independiente de PlatformGrant JIT de TASK-052 |

## 5. Límites y trabajo pendiente

Este cambio **no** habilita rutas HTTP ni altera sus contratos. PAR-001..007 permanecen catalog-only según docs/49 y docs/55; su `x-implementation-allowed` continúa en `false` y su gate de contrato/G0 sigue vigente.

Pendiente para cerrar TASK-058 y US-025:

- completar TASK-052 y resolver el modelo/persistencia de membership de partner/organización;
- diseñar y revisar la migración PostgreSQL de partner grants, restricciones de unicidad/versionado, tenant RLS, permisos de columnas y transacciones de aprobación/revocación;
- implementar repository y application use cases para listar partners/grants, conceder, reducir y revocar; mantener actor real y contexto explícito;
- conectar invalidación y revalidación en sesiones, cache, jobs y workers; procesar de forma durable e idempotente `platform.grant.revoked` y los eventos de membership;
- escribir audit append-only y outbox en la misma transacción del cambio de grant, preservando el formato de eventos y el hash chain existente;
- diseñar el contrato de PAR-001..007 con request/response/error, permisos, idempotencia, auditoría y pruebas; solo entonces solicitar API contract freeze + G0;
- completar pruebas PostgreSQL/RLS, BOLA/IDOR, concurrencia, carrera revoke-vs-job, expiración, replay e integración de invalidadores;
- completar el flujo de PlatformGrant JIT separado, observabilidad, revisión independiente de arquitectura/seguridad y aceptación del Product Owner.

## 6. Riesgos y uso seguro del slice

Los datos de `PartnerTenantGrantPolicy` deben construirse exclusivamente con identidades, membership, tenant y aprobación resueltos en backend. No se debe aceptar `isTenantOwner`, estado de membership, organización partner, roles, approval evidence ni authz version enviados desde el navegador.

La política no reemplaza RLS ni permite saltárselo. Los repositorios/consumers deben volver a resolver el grant inmediatamente antes de cada acceso o side effect y detenerse ante contexto ausente, versión stale, expiración o revocación. No se autoriza impersonation ni reutilizar el contexto de un tenant anterior.

**Resultado:** implementación de dominio útil y testeable, no funcionalidad productiva completa. Mantener TASK-058/US-025 en `in_progress` hasta cerrar persistencia, integración, contratos, seguridad, CI y gates formales.
