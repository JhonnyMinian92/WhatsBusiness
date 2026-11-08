# 67 — CRM ContactIdentity: contrato congelado y primer slice

**Fecha:** 2026-11-08  
**Ámbito:** environment/local, CRM-005 y CRM-006  
**Estado del diseño:** design-frozen  
**Estado del código:** incorporado en el cambio actual; Source CI y Contract CI pendientes de evidencia del nuevo HEAD.  
**TASK owners:** CRM / Sales; TASK-043 y TASK-053 continúan in_progress.

## 1. Objetivo y límites

Crear un registro de identidades externas asociadas a un Contact existente sin convertir IDs de proveedores en claves primarias de CRM ni deduplicar perfiles por heurística. Las únicas operaciones habilitadas en este slice son:

| API | Método y ruta | Resultado |
|---|---|---|
| CRM-005 | GET /v1/tenants/{tenantId}/contacts/{contactId}/identities | Lista paginada de identidades namespaced del contacto |
| CRM-006 | POST /v1/tenants/{tenantId}/contacts/{contactId}/identities | Vincula una identidad, con Idempotency-Key |

CRM-007..017 siguen catalog-only. El slice no resuelve candidatos, merge, undo, unlink, dedupe, lead imports, custom fields, pipeline ni asociaciones Asset Registry. No emite eventos CRM porque el cierre de TASK-028/event bus sigue pendiente.

## 2. Identidad namespaced

La unicidad se define por la tupla:

(tenant_id, provider, product, channel, identifier_type, external_id)

Los valores de external_id son strings; nunca se convierten en número ni sustituyen el UUID interno de Contact.

| Provider | Product | Channel | Identifier type |
|---|---|---|---|
| meta | whatsapp | whatsapp | bsuid o phone_e164 |
| meta | facebook | messenger | psid |
| meta | instagram | instagram_dm | ig_scoped_id |
| meta | threads | threads | threads_user_id |
| external | external | external | external_id |

El dominio valida las combinaciones exactas. phone_e164 debe respetar E.164 (+ y hasta 15 dígitos). Identificadores opacos no admiten espacios/control characters. No se colapsan namespaces distintos por teléfono, email, nombre o coincidencia textual.

## 3. Contrato de datos

**Request CRM-006**

- Requeridos: provider, product, channel, identifierType, externalId.
- Opcional: sourceReference.
- Propiedades desconocidas se rechazan.
- Idempotency-Key es obligatorio (16–255 caracteres ASCII visibles).
- sourceType no es controlado por el cliente: el endpoint fija api.
- observedAt lo asigna PostgreSQL. No se acepta verifiedAt ni confidence suministrado por el caller.

**Response ContactIdentityRecord**

id, tenantId, contactId, provider, product, channel, identifierType, externalId, sourceType, sourceReference, observedAt, verifiedAt, confidence, visibility, createdAt.

El endpoint registra verifiedAt=null y confidence=null; vincular un ID desde la UI/API no demuestra verificación ante Meta. visibility=tenant_only. El valor de ID es PII/sensible y exige permisos CRM de identidad específicos.

**GET CRM-005** devuelve { items, nextCursor }, con pageSize entre 1 y 100 (por defecto 25) y cursor opaco reutilizando el formato estable de contactos.

## 4. Autorización y auditoría

Todas las rutas requieren OIDC, TenantContextGuard, AuthorizationGuard, tenant context válido y purpose coincidente. El tenant de la ruta no concede acceso por sí mismo.

| Rol declarativo | Leer identidades | Vincular identidades |
|---|---:|---:|
| tenant_owner | Sí | Sí |
| tenant_admin | Sí | Sí |
| integration_admin | No | No |
| compliance_auditor | Sí | No |
| inbox_supervisor / agent / analyst / developer_api_integrator / marketing_manager | No | No |

Permisos: crm.contacts.identities.read y crm.contacts.identities.link, ambos sensibles y sin aprobación independiente automática. La operación de vinculación se registra en el audit stream con actor, tenant, purpose, correlation ID, recurso y hash de solicitud. El hash no contiene una copia de la respuesta raw.

## 5. Persistencia, aislamiento e idempotencia

Migración 0024-crm-contact-identities.sql:
- Crea crm.contact_identities con FK compuesta tenant/contact y restricciones para namespace, E.164, longitudes y confidence.
- Activa RLS ENABLE/FORCE; el policy comprueba app.tenant_id.
- El trigger de escritura verifica app.tenant_id y app.user_id.
- Concede al rol runtime solo SELECT e INSERT; no UPDATE ni DELETE.
- Mantiene unicidad del identificador dentro del tenant. Dos tenants pueden usar el mismo external ID sin colisionar.
- Reutiliza crm.contact_command_idempotency y el PostgresContactRepository extendido con resultado genérico para la reserva/finalización de link_identity.

Un duplicado en el mismo tenant devuelve 409 CRM_CONTACT_IDENTITY_ALREADY_LINKED sin revelar qué contacto posee el identificador. El mismo Idempotency-Key + payload devuelve la respuesta original; la clave usada con otro payload devuelve 409 CRM_IDEMPOTENCY_KEY_REUSED. Contactos archivados no admiten vínculos nuevos. Los registros son append-only hasta implementar un flujo explícito de revocación.

## 6. Criterios de aceptación implementados en código

- Validación de tuple provider/product/channel/type, E.164, external ID, source reference y propiedades no permitidas.
- GET paginado dentro de una transacción tenant-scoped.
- POST idempotente y transaccional con auditoría append-only.
- Unicidad, RLS y FK compuesta en PostgreSQL.
- Permisos dedicados y deny-by-default para roles sin grants.
- Sin merge automático ni confianza/verificación inventadas.
- Tests de dominio, guards/metadata y flujo PostgreSQL (idempotencia, colisión tenant-local, mismo ID en tenant distinto, invisibilidad cross-tenant y audit chain).

## 7. Gates pendientes y evolución

Antes de llamar verificado este slice se requiere Source CI SUCCESS en el commit con migración 0024, build/typecheck, pruebas API y tests PostgreSQL; Contract CI debe validar los 296 endpoints y schemas OpenAPI. Se requiere además revisión independiente de seguridad/arquitectura y aceptación del owner para cerrar las tareas.

Siguientes incrementos de TASK-043/053: evidencia de identidad por adapters oficiales, lectura de leads con provenance, candidate detection sin auto-merge, flujo reversible de merge, unlink/revocación, auditoría de cambios, asociaciones de activos Meta (WAAC/PMA/WABA) y pruebas de recuperación. No habilitar ninguna de esas rutas hasta congelar sus contratos individualmente.

GO-PRODUCTION permanece NO-GO. Este documento describe el estado del slice, no la finalización del CRM ni del producto.


## 8. Autorización de implementación y límites de aceptación

El propietario solicitó continuar la ejecución de las tareas pendientes del producto el 2026-11-08. Esa instrucción autoriza completar este slice de código y congelar sus contratos CRM-005/006. No constituye aceptación independiente de arquitectura/seguridad, aceptación final de TASK-043/TASK-053 ni autorización GO-PRODUCTION. Los gates de Source CI, Contract CI, review independiente y aceptación del propietario siguen siendo requisitos de verificación/cierre.


## 9. Persistencia del catálogo de permisos

La migración apps/api/migrations/0025-crm-contact-identity-permissions.sql inserta las dos claves de identidad en platform.permissions con risk_class=sensitive. Es una migración de vocabulario, sin concesiones globales ni asignación automática a tenants. La autorización efectiva sigue dependiendo del rol/permisos del tenant y el contexto OIDC. El versionado global aplica primero las migraciones 0001..0024 y después 0025, sin duplicar versiones entre los directorios de API y microservicios.


## 10. Dependencia operativa de TASK-004 (RBAC)

TENANT_ROLE_CATALOG y TenantRoleAssignmentPolicy son plantillas y una política de evaluación; actualmente no existe un caso de uso/controller que materialice las plantillas por tenant en platform.roles/platform.role_permissions ni una operación HTTP para asignar/revocar esos permisos. Por tanto, las filas globales de platform.permissions y la matriz declarativa de roles no conceden por sí mismas acceso a tenant_admin/compliance_auditor en tenants existentes. CRM-005/006 se mantienen protegidos por RBAC fail-closed; la habilitación de usuarios reales requiere cerrar el flujo de provisión/administración de roles de TASK-004 con auditoría, aprobación, versionado y pruebas de no escalamiento. TASK-004 sigue in_progress.


## 11. CRM-007 — candidatos deterministas de duplicación (2026-11-08)

Se incorpora `ContactDuplicateCandidateDetector` como componente puro del dominio CRM. La puntuación se compone mediante estrategias polimórficas y explicables:
- Identidad exacta dentro de la misma namespace provider/product/channel/identifierType: 100.
- Mismo sourceType + sourceReference: 75.
- Nombre normalizado exacto (NFKD, sin marcas diacríticas, espacios/puntuación normalizados): 35.

El umbral por defecto es 70, por lo que un nombre común por sí solo no genera candidato. Los resultados exponen score, nivel de confianza y reason codes; nunca nombre, teléfono ni PII. La lista exige perfiles del mismo tenant, valida que cada identidad pertenezca al contacto/tenant indicado, omite contactos archivados y tipos incompatibles, y ordena de forma determinista. Todas las coincidencias devuelven `manual_review_required`; no existe merge automático ni se muta el aggregate.

El componente recibe candidatos ya recuperados por un repositorio tenant-scoped. No se publica endpoint nuevo: CRM-007 necesita completar su contrato de búsqueda/paginación y revisión antes de habilitar API. Las identidades provider-scoped no equivalen a un email/teléfono universal; los identificadores opacos son case-sensitive y la namespace forma parte de la igualdad.

**Estado:** motor de dominio y pruebas unitarias registrados en target `api:test`; el commit debe pasar Source CI antes de considerar verificado el slice. TASK-043 sigue `in_progress`.


## Evidencia CRM-007 — 2026-11-08

ContactDuplicateCandidateDetector quedó CI-verified en commit 82eff584655212c16a4f59bce9542aeedf978bc4 (Source CI #585 y CodeQL #120 SUCCESS). Esto verifica únicamente el motor de dominio y sus pruebas. TASK-043/053 siguen in_progress por query adapter paginado tenant-scoped, contrato HTTP, auditoría/review, reversible merge/undo, Asset Registry associations y aceptación independiente.


## Addendum CRM-007 — señal cross-channel de teléfono verificado

La estrategia `SAME_VERIFIED_PHONE_E164` puntúa 80 solo cuando ambas identidades tienen `identifierType=phone_e164`, mismo provider/valor E.164 y `verifiedAt` presente. No requiere igual product/channel, pues busca una señal cross-channel. Los números no verificados no se comparan. La salida sigue siendo candidato para revisión humana, nunca merge.


### Handoff post-CI #586

El build detectó que el reason code `SAME_VERIFIED_PHONE_E164` faltaba en `ContactDuplicateCandidateReason`. Se incorpora al union para mantener tipado exhaustivo de estrategias y resultados; sin cambios a los criterios de verificación ni a la autorización. Source CI de la corrección pendiente.
