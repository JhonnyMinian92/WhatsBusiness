# 66 — Freeze del contrato CRM Contacts API (CRM-001..004)

**Estado:** diseño de contrato congelado; Contract CI #27 terminó SUCCESS el 2026-11-08. La aceptación del propietario sigue pendiente.
**Bounded context:** CRM / Contacts.
**Owner técnico de implementación:** WhatsBusiness API.
**Reviewer independiente:** pendiente; el autor solo puede registrar self-review.
**Trazabilidad:** US-018, TASK-035, TASK-042, CRM-001..004, PD-004.

## 1. Alcance congelado

Este slice implementa el agregado Contact como perfil comercial tenant-scoped. No incluye ContactIdentity, leads, empresas, oportunidades, actividades, custom fields, merge, inbox ni envío de mensajes; esos agregados permanecen con sus propietarios y tareas específicas (TASK-043/044/045 y TASK-053). El teléfono, email y los IDs externos nunca son la clave primaria universal del contacto. No se fusionan identidades automáticamente.

## 2. Recursos y semántica

Contact contiene:
- id, tenantId, contactType (person u organization).
- displayName requerido, firstName y lastName opcionales/nulables.
- status (active o archived); no hay borrado físico por API.
- sourceType (manual, api, import, webhook), sourceReference y sourceCapturedAt.
- version, createdAt y updatedAt.

No se incluye correo, teléfono, BSUID, PSID ni Instagram scoped ID en este agregado inicial; se añadirán en ContactIdentity con namespace (tenant, provider, product, channel, identifierType, externalId).

La procedencia es inmutable tras crear el contacto. contactType también es inmutable. Los nombres se normalizan Unicode NFC y se recortan en el backend/trigger. Un contacto de tipo organization no acepta firstName ni lastName.

## 3. Operaciones HTTP

| API ID | Método | Ruta | Permiso / propósito | Resultado |
|---|---|---|---|---|
| CRM-001 | GET | /v1/tenants/{tenantId}/contacts | crm.contacts.read | Lista paginada, filtros opcionales y búsqueda literal case-insensitive |
| CRM-002 | POST | /v1/tenants/{tenantId}/contacts | crm.contacts.create | Crea con provenance e idempotencia |
| CRM-003 | GET | /v1/tenants/{tenantId}/contacts/{contactId} | crm.contacts.read | Consulta solo dentro del tenant autorizado |
| CRM-004 | PATCH | /v1/tenants/{tenantId}/contacts/{contactId} | crm.contacts.update | Actualiza campos permitidos con If-Match e idempotencia |

Todos requieren OIDC validado y tenant context server-side. La ruta tenantId no concede acceso. Las rutas emplean RequireTenantPermission, que compone tenant context y permiso. Los casos de uso vuelven a abrir una transacción con DatabaseService.withTenantContextAtVersion para cerrar la ventana de revocación.

### Lista y cursor
- q: substring literal sobre displayName, case-insensitive; no interpreta wildcard.
- contactType: person u organization.
- status: active o archived.
- pageSize: default 25, mínimo 1, máximo 100.
- cursor: base64url con createdAt e id; orden estable created_at DESC, id DESC.

### Idempotencia y concurrencia
- POST/PATCH requieren Idempotency-Key visible ASCII de 16–255 caracteres.
- Scope único: (tenant_id, actor_user_id, operation_key, idempotency_key).
- El request hash SHA-256 vincula la clave al comando normalizado. Reutilizarla con payload/versión distinta produce 409.
- Se persiste una respuesta snapshot inmutable; un retry idéntico devuelve el resultado original.
- PATCH exige If-Match: "contact-N". La versión esperada se compara en la misma sentencia UPDATE; una versión obsoleta devuelve 409 CRM_CONTACT_VERSION_CONFLICT.
- ETag se devuelve en POST, GET de recurso y PATCH.

## 4. Persistencia y seguridad

La migración 0022-crm-contacts.sql crea crm.contacts y crm.contact_command_idempotency. Ambas tablas tienen RLS ENABLE + FORCE con app.tenant_id; la tabla de idempotencia también limita actor_user_id a app.user_id. El trigger de contactos obliga tenant/actor, bloquea cambios de ID, tenant, tipo y provenance, y exige version = old.version + 1. El trigger de idempotencia solo permite completar una respuesta una vez.

whatsbusiness_app obtiene únicamente USAGE, SELECT/INSERT y UPDATE por columnas necesarias; no recibe DELETE físico. El repositorio recibe PoolClient del caso de uso y no abre transacciones propias. El caso de uso escribe evento append-only de auditoría (hash chain) en la misma transacción que el contacto y el snapshot idempotente.

Los nombres son PII. El slice no registra bodies ni PII en logs/metrics. No hay proveedor externo ni transmisión de datos. La política de retención, exportación y eliminación legal permanece en TASK-059 y no se presume definida.

## 5. Errores y compatibilidad

Se usan Problem Details transversales: 400 DTO/cursor/UUID/If-Match/Idempotency-Key inválidos; 401 OIDC ausente/inválido; 403 membership/permission/purpose insuficiente; 404 contacto inexistente o no visible en tenant; 409 conflicto de idempotencia o versión; 422 invariantes de dominio; 429/500/503 según perfiles comunes.

Las rutas conservan UUID como ID interno. El cursor y ETag son opacos al consumidor excepto por su forma versionada documentada. No se emiten aún eventos crm.contact.created/updated: el dispatch del event bus de dominio requiere el cierre operativo de TASK-028; no se simula publicación.

## 6. Verificación requerida
- Unit: normalización NFC, tipos, provenance, campos no permitidos, null-clearing, cursor bounds.
- PostgreSQL real: tenant RLS, insert/read/list/update, idempotencia create/update, conflicto de request hash, control optimista, audit chain y aislamiento cross-tenant.
- CI: Source validation (build/typecheck/api tests/PostgreSQL/RabbitMQ) y Contract CI (OpenAPI/IDs/AsyncAPI/fixtures).
- Security/architecture: revisión independiente de ownership, permisos, PII, migración y grants antes de marcar verified global.

## 7. Límites de implementación

Este freeze solo habilita CRM-001..004 en el alcance anterior. CRM-005..017 siguen catalog-only hasta que se congelen sus contratos y dependencias. TASK-042 no se considera aceptada por el mero hecho de crear rutas; aún se requieren evidencia verde, revisión independiente y aceptación del Product Owner.
## 8. Gate de activación del runtime (2026-11-08)

La revisión automática de contratos impone que únicamente PLT-001..005 estén con x-implementation-allowed=true durante la foundation actual. CRM-001..004 mantienen el diseño y schemas completos (x-contract-ready=true), pero permanecen x-implementation-allowed=false y el CrmContactsModule no está importado por AppModule. El código de dominio/aplicación/repositorio y sus pruebas se compilan como fuente y no están expuestos por HTTP. Para activar rutas será necesaria la autorización específica del siguiente slice GO-CODE y que Contract CI acepte el cambio; no se fuerza ni se elude el allowlist.

La migración `0023-crm-contact-organization-name-invariant.sql` también impone en PostgreSQL que organization no contenga firstName/lastName. El test usa el login runtime y un SAVEPOINT para demostrar SQLSTATE `23514` sin abortar el resto de la transacción. La verificación CI de este refuerzo está pendiente.
