# 72 — CAPI: eventos, consentimiento y medición

**Historia:** US-013 · **Tarea:** TASK-026 · **Rama:** `environment/local`  
**Corte:** 2026-11-08 · **Estado:** slice de dominio implementado; TASK-026/US-013 siguen `in_progress`.  
**Alcance:** validación pura y contracts de aplicación. No se habilitó integración CAPI ni endpoint público.

## Resultado funcional

US-013 solicita enviar eventos server-side, deduplicar copias Pixel/SDK cuando corresponda, validar consentimiento y action_source, y reportar match quality/resultados sin prometer atribución perfecta.

La identidad de deduplicación conserva exactamente `datasetId + eventName + eventId`. El ID debe originarse una vez en el hecho de negocio y compartirse sin mutación con Pixel/SDK y la copia server-side; no se genera un ID alternativo. El almacenamiento futuro debe añadir `tenant_id` a su clave única para impedir dedupe cross-tenant.

## Implementación

| Path | Responsabilidad |
|---|---|
| `apps/api/src/marketing/conversions/domain/conversion-event.ts` | Action source allowlist, validación de IDs/tiempo/website source, consentimiento con tenant/sujeto/propósito/ventana efectiva, identidad de dedupe y Unix seconds. |
| `apps/api/src/marketing/conversions/application/conversion-consent-verifier.port.ts` | Port hacia evidencia confiable del bounded context Privacy; sin adapter permisivo ni default allow. |
| `apps/api/src/marketing/conversions/domain/conversion-measurement-report.ts` | Report tipado que separa entrega, dedupe local, match quality del proveedor y atribución del proveedor. |
| `apps/api/src/marketing/conversions/domain/conversion-event.spec.ts` | Pruebas de identidad compartida, action source, website metadata y consent scope/effectivity/expiry/revocation. |
| `apps/api/src/marketing/conversions/domain/conversion-measurement-report.spec.ts` | Pruebas de estado desconocido, calidad no disponible y observaciones explícitas del proveedor. |

Las dos suites se añadieron al target real `api:test`. No se guardan emails, teléfonos, IP, cookies, nombres, hashes de identificadores ni tokens. URL y user-agent son datos de tránsito; aún no hay almacenamiento ni logging de esos valores.

## Seguridad y semántica

- La ausencia de evidencia, estado denied/unknown, scope distinto, evidencia inválida, consentimiento aún no vigente, expirado o revocado al momento del evento => deny.
- El catálogo action_source es explícito y testeado: `app`, `business_messaging`, `chat`, `email`, `other`, `phone_call`, `physical_store`, `system_generated`, `website`. Debe revalidarse con Meta oficial por versión antes de congelar el contrato.
- Website exige URL HTTPS y user-agent no vacío; la URL rechaza credenciales. La especificación oficial vigente aún debe ratificarse para la cuenta/versión objetivo.
- La identidad local es una tupla, no afirma que exista una constraint/ledger persistente ni que Meta haya deduplicado.
- `accepted_by_provider` no significa delivered ni attributed. Match quality solo se muestra cuando haya observación provider; en otro caso, unavailable. Atribución requiere observación externa explícita y no representa causalidad/incrementalidad.

## Investigación y límites de autoridad

- Meta archived Server-Side API Swagger: https://github.com/facebookarchive/Facebook-Server-Side-API-Swagger/blob/main/server-side-api.yaml — evidencia histórica de `event_id`, `event_name` y `action_source`; no congela versión actual.
- Meta Java Business SDK 24.0.1 ActionSource: https://javadoc.io/static/com.facebook.business.sdk/facebook-java-business-sdk/24.0.1/com/facebook/ads/sdk/serverside/ActionSource.html — snapshot generado de valores, no reemplaza documentación oficial versionada.
- Twilio Segment CAPI destination: https://www.twilio.com/docs/segment/connections/destinations/catalog/facebook-pixel-server-side — referencia secundaria sobre `client_user_agent` y `event_source_url` para website; requiere confirmación oficial.
- No se pudo validar desde este entorno la referencia oficial Meta vigente ni la elegibilidad de una app/dataset real. No se fijan Graph version, scopes, tier, attribution window o score range.

## Aceptación US-013

| Criterio | Estado | Evidencia / brecha |
|---|---|---|
| AC-013-01 — event_id estable y dedupe Pixel/SDK | Parcial | Exige ID común y produce identidad dataset/name/id; falta repositorio unique constraint, ingest y prueba real browser/server/Meta. |
| AC-013-02 — consentimiento y action_source | Parcial | Validador fail-closed y port; falta adapter confiable TASK-032 y capability real. |
| AC-013-03 — match quality y resultado sin atribución perfecta | Parcial | Report tipado impide score/atribución inferidos; faltan respuestas reales, reportes y ventana aprobada CR-0015. |

## Bloqueos

1. TASK-023: el Lead lifecycle/provenance no está implementado en el workspace inspeccionado.
2. TASK-031: CodeQL/SAST no reemplaza threat model, revisión de seguridad, clasificación/retención y control de transmisión de identificadores.
3. TASK-032: falta servicio/adapter de consentimiento confiable y evidencia revocable.
4. CAPI-001..004 siguen `catalog-only` en OpenAPI según docs/49; no se añadió controller ni se alteró allowlist.
5. Faltan adapter Meta versionado, dataset capability, credential vault, schema/error fixtures oficiales y prueba de cuenta autorizada.
6. Faltan persistencia/unique constraint, outbox/worker, provider result ingestion y reconciliation.
7. CR-0015 (attribution window) sigue abierto.

No se autoriza envío real, datos reales ni mutación Meta. Production gate permanece NO-GO.

## Secuencia restante

1. Completar TASK-023, TASK-031 y TASK-032.
2. Revalidar fuente oficial Meta/version/scopes/capabilities y resolver CR-0015.
3. Congelar CAPI-001..004 y sus request/response/error/authz/idempotency/privacy fixtures.
4. Implementar ledger tenant-scoped, dedupe transaccional (`tenant_id + dataset_id + event_name + event_id`), outbox, dispatch, retry/replay idempotente y logs sin PII.
5. Implementar adapter y captura de provider response/match quality/attribution, reportes y pruebas contract/integration autorizadas.
6. Obtener Source CI/Contract CI/CodeQL SUCCESS, revisión independiente y aceptación Product Owner.

Los resultados CI se registran tras el commit; las pruebas unitarias no sustituyen PostgreSQL/RLS, outbox/worker ni pruebas Meta. La tarea no se marca verified por la existencia de este slice.
