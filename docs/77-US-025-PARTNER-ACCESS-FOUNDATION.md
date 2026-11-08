# 77 — US-025: política de acceso delegado de partners

**Fecha de corte:** 2026-11-08  
**Historia:** US-025 — Acceso delegado de agencias/partners.  
**Paquete:** TASK-058.  
**Rama:** feature/us-025-partner-access-current-head (basada en environment/local HEAD b1267fed07886c1924105510407e601056feed39).  
**Estado:** política pura implementada y 22 casos registrados en api:test; verificación CI del commit final, persistencia e integración de autorización/RLS pendientes. **US-025 y TASK-058 continúan in_progress.**

## 1. Alcance del slice

Se añadió PartnerTenantGrantPolicy en:

- apps/api/src/platform/identity/partners/partner-tenant-grant.policy.ts
- apps/api/src/platform/identity/partners/partner-tenant-grant.policy.spec.ts

La política está registrada y exportada por IdentityModule. Es independiente de NestJS, PostgreSQL, HTTP y proveedores externos. Reutiliza PermissionKey, isPermissionKey, findTenantRole y ApprovalEvidence del contexto de identidad/autorización existente.

Expone cuatro decisiones puras:

| Operación | Responsabilidad |
|---|---|
| evaluateCreation | Valida grant inicial, tenant cliente, partner activo, actor miembro activo del partner, owners distintos, aprobación, roles versionados, acción/activo exactos, purpose y vigencia. |
| evaluateAccess | Revalida sujeto, organización partner, tenant, acción, activo, propósito, rol/versiones, estado y tiempo en cada evaluación. |
| evaluateScopeReduction | Solo acepta una nueva versión con subconjunto estricto de roles/actions/assets y vigencia no ampliada, con aprobación independiente. |
| revoke | Genera revocación tenant-scoped por tenant owner activo, idempotente y con protección contra versión inválida/desbordada. |

Cada acción se representa como un par { permission, asset }, evitando el producto cartesiano de arrays independientes. Los permisos meta.*, ads.* y whatsapp.* exigen proveedor, tipo e identificador de activo exactos; no se admiten comodines.

## 2. Invariantes de seguridad cubiertos por la política

1. Solo tenant de organización customer y estado active.
2. Partner de tipo agency, reseller o provider y estado active.
3. El usuario debe ser active y tener membership active en la organización partner indicada. La policy no considera suficiente la relación comercial entre organizaciones.
4. La concesión y su aprobación corresponden a dos tenant owners activos diferentes.
5. La evidencia debe estar approved, incluir el aprobador esperado y satisfacer requiredApprovals; el solicitante no puede aprobarse a sí mismo.
6. tenant_owner, tenant_admin y support_jit están prohibidos en los roles delegados.
7. Todos los roles deben existir en el catálogo y conservar su versión vigente.
8. Toda acción tiene que estar en el catálogo de permisos y formar parte de al menos uno de los roles delegados.
9. Fechas, propósito, tenant, partner, actor, activo y versión se validan con default deny.
10. Una reducción nunca añade rol/acción/activo, no amplía la vigencia y no cambia el propósito.
11. La revocación es de una sola vía y la evaluación de acceso deniega grants revocados, expirados o todavía no vigentes.

Estos hechos son datos de dominio recibidos; hasta que se implemente el adapter, el caller debe resolverlos desde la base de datos y no aceptar estados, roles, aprobación o membership enviados por el navegador.

## 3. Pruebas

22 casos de node:test están registrados en el target api:test de apps/api/project.json. Cubren:
- organización/tenant no elegible y estados suspendidos;
- membership partner ausente, revocada o no coincidente;
- owner y aprobador no autorizados, autoaprobación, quorum y evidencia inválida;
- roles privilegiados, inexistentes y versiones obsoletas;
- permiso fuera del rol y asset ausente, wildcard o diferente;
- purpose, inicio futuro, expiración y revocación;
- aislamiento tenant/partner/subject/action/asset;
- reducción de privilegios, versión y vigencia;
- revocación tenant-scoped, parcial, idempotente y overflow.

**No se declara PASS:** no hubo ejecución Source CI comprobable para el commit de esta rama al momento del corte. Registro en el comando de tests no equivale a ejecución satisfactoria.

## 4. Integración existente que se reutiliza y límites

El modelo actual tiene organizaciones de tipo customer/internal/agency/reseller/provider. Sin embargo, platform.memberships es una relación user ↔ tenant, no user ↔ organization. La pertenencia de un actor al partner debe comprobarse mediante una membership activa en un tenant activo perteneciente a esa organización; no debe inventarse una membership en el tenant cliente.

IdentityService.authorizeTenantAccess y TenantContextGuard hoy resuelven solamente memberships directas. DatabaseService.withTenantContext y platform.can_use_tenant también se apoyan en esa frontera. Por tanto, esta policy no concede todavía acceso de runtime a los datos del tenant cliente.

TASK-052 añadió SupportGrantPolicy, PlatformAdministrationPort/Service y migration 0030 con platform.support_grants y RLS JIT. La migración especifica que support grants no satisfacen can_use_tenant; son acceso interno de soporte, nunca grants agency-to-client. El AppModule actual no importa un PlatformAdministrationModule y el port no cuenta con un adapter de persistencia visible; ese slice tampoco debe declararse totalmente operativo.

## 5. Criterios de aceptación: cobertura actual

| Criterio | Evidencia actual | Estado |
|---|---|---|
| AC-025-01 — grant explícito con actor, roles, acciones/assets, purpose, expiración y aprobador | Validación de dominio y snapshot tipado, con 22 casos registrados | Parcial: falta persistencia/approval consumption |
| AC-025-02 — no heredar datos por relación comercial o membership ajena | Requiere membership activa del sujeto en tenant de organización partner; compara tenant/partner/subject exactos | Policy implementada; falta ruta de autorización RLS/runtime y BOLA PostgreSQL |
| AC-025-03 — revocación/expiración en sesiones, cache y jobs | Policy deniega en evaluación cuando vence o está revocado | Parcial: faltan persistencia, invalidadores y revalidación durable de workers |
| AC-025-04 — identidad partner/actor y auditoría | El modelo conserva tenant, partner, subject, creador, aprobador, versión y transición | Parcial: falta audit append-only + outbox en la transacción de grants |
| AC-025-05 — soporte JIT separado | support_jit prohibido como rol partner; support_grants permanece separado | Diseño/migración presentes; integración runtime de TASK-052 y pruebas E2E pendientes |

## 6. Trabajo restante para cerrar TASK-058

- Diseñar y añadir persistencia relacional partner grants, roles y action/asset scopes, con constraints de tenant y trigger de revocación inmutable.
- Crear un predicate SQL estrecho de membership partner y una ruta explícita para grant context. No relajar can_use_tenant globalmente ni convertir el grant en membership cliente.
- Extender IdentityRepository/IdentityService/TenantContextGuard con un tipo de contexto partner separado, credenciales revalidadas, purpose y scope exactos.
- Extender DatabaseService/RLS de manera que el partner solo pueda entrar a un contexto delegado válido; el permiso y el activo deben volver a comprobarse en aplicación y en la frontera de datos. Toda ruta tenant-scoped debe seguir usando RequireTenantPermission.
- Construir application use cases y repositorio PostgreSQL. La creación debe consumir ApprovalWorkflowService.consumeAndStage para que aprobación, grant, audit y outbox sean atómicos.
- Ampliar el outbox con eventos aprobados platform.grant.revoked y platform.membership.changed, usando envelope/schema/version existentes; producir evento al revocar y al cambiar/eliminar membership partner para invalidar grants afectados.
- Revalidar grant en jobs/consumers antes del efecto externo y cubrir revoke-vs-worker race, cache/session invalidation y expiración.
- Diseñar y congelar PAR-001..007; hoy continúan catalog-only y x-implementation-allowed=false hasta API contract freeze + G0. No abrir controllers/endpoints antes del gate.
- Añadir integración PostgreSQL/RLS, cross-tenant BOLA/IDOR, concurrencia, idempotencia y audit chain; ejecutar Source CI y CodeQL sobre el HEAD exacto.
- Solicitar revisión independiente de Architecture/Security y aceptación del Product Owner. Mantener GO-PRODUCTION en NO-GO mientras los gates estén abiertos.

## 7. Rollback y seguridad operativa

El slice actual no modifica base de datos, no publica eventos y no efectúa llamadas a Meta. Para revertirlo: retirar la policy y spec, eliminar su registro en apps/api/project.json y provider/export en IdentityModule, y revertir este documento y las referencias de documentación. Las siguientes fases deberán desplegar primero una migración compatible, probar RLS y tener rollback específico antes de habilitar acceso delegado.

**Conclusión:** se entrega la policy estricta del dominio con pruebas registradas; no es todavía acceso de partner operativo ni cierre completo de US-025/TASK-058.
