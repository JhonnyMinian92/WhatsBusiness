# 69 — Freeze contractual CRM-007: candidatos de identidad duplicada

**Fecha:** 2026-11-08  
**Operación:** CRM-007 / `apiCRM007`  
**Ruta:** `POST /v1/tenants/{tenantId}/identity-resolution/candidates`  
**Estado:** contrato implementado y habilitado en OpenAPI; revisión independiente y aceptación del Product Owner pendientes.  
**Trazabilidad:** US-018, TASK-043, TASK-053, docs/68.

## Resultado de usuario

Permite consultar candidatos de posible duplicación de un contacto usando señales explicables. No cambia datos, no vincula ni desvincula identidades y nunca fusiona contactos. Cada candidato requiere decisión humana.

## Contrato

Request JSON estricto:
- `sourceContactId`: UUID obligatorio.
- `limit`: entero opcional, default 25, rango 1–100.
- Propiedades adicionales prohibidas.
- No exige `Idempotency-Key`: la operación es una lectura sin side effects de negocio. El resultado no crea una reserva ni altera el estado de un contacto.

Response HTTP 200:
- `items[]` con `contactId`, `contactVersion`, `score`, `confidence`, `reasons[]` y `resolution=manual_review_required`.
- No incluye nombre, email, teléfono, external ID, payload de proveedor ni metadatos criptográficos.
- Orden determinista por score descendente y UUID ascendente.

## Autorización y privacidad

- OIDC validado en el controller.
- Tenant context resuelto en servidor; tenant de ruta debe coincidir exactamente.
- Permiso sensible y propósito: `crm.contacts.identities.read`.
- El caso de uso revalida principal, membership y `authzVersion` en `DatabaseService.withTenantContextAtVersion`.
- Todas las lecturas SQL incluyen tenantId y la BD conserva RLS ENABLE/FORCE.
- Consulta exitosa auditada dentro de la misma transacción mediante la cadena append-only SHA-256. Se guarda solo el hash de parámetros, no el cuerpo/PII.
- Se reutilizan repositorios para mapear entidades y cargar identidades por lotes. No existe un repositorio cross-tenant.

## Matching y límites computacionales

El prefilter PostgreSQL obtiene candidatos por:
1. Igualdad exacta de identidad provider/product/channel/identifierType/externalId.
2. Mismo provider y E.164 exacto únicamente cuando ambos registros tienen `verifiedAt`.
3. Igualdad de `sourceType` + `sourceReference` no nula.

La normalización exacta de nombre (peso 35) solo puede reforzar un candidato que ya pasó una señal fuerte; no provoca un scan tenant-wide. El detector conserva los scores y reason codes deterministas documentados en docs/68. El umbral del endpoint es fijo en 70. Los valores no son probabilidades calibradas.

Se consultan como máximo 10.001 IDs para detectar exceso. Más de 10.000 candidatos causa un error controlado `CRM_DUPLICATE_CANDIDATE_SET_TOO_LARGE`; no se devuelve una lista parcial. La respuesta limita items al valor solicitado, máximo 100. Los índices 0026 soportan teléfono verificado y procedencia activa; el índice único de namespace existente cubre la señal de identidad exacta.

## Pruebas requeridas y evidencia

- Unit del parser: body estricto, UUID y límites.
- Unit del service: permiso, 404, batch demasiado grande, ranking, no-PII y audit.
- Unit del controller: OIDC, tenant guard, permiso/propósito y mismatch.
- PostgreSQL integration: coincidencia por procedencia, lectura bulk, aislamiento RLS entre dos tenants con el mismo sourceReference y verificación de audit chain.
- Contract CI: OpenAPI y schema CRM-007.
- Source CI: migración 0026/idempotencia, build/typecheck, tests API y PostgreSQL integration.

El código y los tests se incorporan por este handoff. El resultado se elevará a `verified` únicamente después de Source CI y Contract CI SUCCESS sobre el HEAD exacto. La aceptación independiente y la aceptación del propietario son gates separados.

## Fuera de alcance

CRM-008..010 merge-preview, merge reversible y undo no se implementan aquí. No se autoriza auto-merge, cambios de contacto, verificación por solicitud cliente, lectura o escritura Meta ni replay de eventos. TASK-043 y TASK-053 permanecen `in_progress`.
