# 70 — Meta Asset Registry y Capability Engine

**Fecha de implementación:** 2026-11-08  
**Historia:** US-004  
**Tareas:** TASK-009, TASK-010  
**Estado del bloque:** núcleo de dominio implementado; TASK-009/010 continúan in_progress.

## 1. Objetivo y límites de esta entrega

US-004 debe permitir al administrador conocer los activos Meta accesibles, sus grants efectivos y las operaciones que realmente puede ejecutar. Para evitar falsos positivos, inventario, ownership, grants y capability son conceptos separados.

La entrega inicial implementó reglas puras del dominio y pruebas unitarias. La iteración de Fase 2 del 2026-11-08 añadió persistencia tenant-scoped y reconciliación PostgreSQL (migration 0039, repository y application service) descritas en la sección de seguimiento al final de este documento. Aún no conecta con Meta Graph ni expone endpoint público: no se debe presentar como sincronización externa operativa ni como disponibilidad real de activos.

## 2. Fuentes Meta consideradas

- WhatsApp Account Model Evolution, Meta Developers, 2026-06-16: la arquitectura distingue WhatsApp Account (WAAC), asociada a números, y Partner Messaging Account (PMA), asociada a templates y billing; un número puede compartirse entre partners/integraciones. Fuente: https://developers.meta.com/resources/videos/whatsapp-account-model-evolution/
- Unified Onboarding on WhatsApp / Embedded Signup v4, Meta Developers, 2026-06-16: onboarding unificado para WhatsApp, Messenger e Instagram Direct. Fuente: https://developers.meta.com/resources/videos/unified-onboarding-whatsapp/
- La colección de Embedded Signup publicada por Meta describe el flujo y requisitos para el partner. Fuente: https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
- El catálogo de integración mantiene versiones, scopes, tasks y elegibilidad separados por producto/operación. Ver docs/09 y gates docs/49.

Las fuentes públicas no prueban que la app de WhatsBusiness esté aprobada, que una cuenta particular sea elegible ni que un grant exista. No se codificaron scopes ni permisos globales para operaciones que aún no tienen matriz oficial por endpoint.

## 3. Modelo de activos implementado

Código: apps/api/src/platform/meta-control-plane/domain/meta-asset.ts.

El catálogo namespaced incluye:

| Tipo interno | Producto Meta de referencia | Tratamiento |
|---|---|---|
| business_portfolio | business_management | Portfolio de negocio, no grant universal |
| whatsapp_account | whatsapp_business_platform | WAAC / phone account |
| whatsapp_messaging_account | whatsapp_business_platform | PMA para mensajería, templates y billing |
| whatsapp_phone_number | whatsapp_business_platform | Número/identificador, no clave universal del CRM |
| facebook_page | facebook_pages | Page y sus tasks |
| instagram_professional_account | instagram | Cuenta profesional, separada de modo de login |
| ad_account | marketing_api | Cuenta publicitaria |
| lead_form | lead_ads | Formulario, vinculado a su contexto publicitario |
| dataset | conversions_api | Dataset/pixel para medición, sujeto a consentimiento |

La clave de identidad de activo es la tupla (product, assetType, externalId), dentro de tenantId + connectionId. El tipo por sí solo no es suficiente: el mismo ID externo no debe colisionar entre productos.

Ownership (owned/client_owned/shared/assigned/unknown) está separado del acceso efectivo (granted/denied/unknown) y de la visibilidad. Los raw payloads del proveedor no entran al dominio: deben transformarse a la lista blanca tipada antes.

## 4. Reconciliación de inventario

reconcileMetaAssetInventory aplica estas invariantes:

1. Un snapshot viejo no reemplaza una observación más reciente.
2. La ausencia de un activo en un snapshot parcial nunca implica revocación ni desaparición.
3. Solo se marca not_visible cuando el proveedor acredita cobertura completa y paginada del tipo de activo.
4. not_visible no equivale a revoked; la desaparición del resultado no demuestra por sí sola la causa.
5. La negación explícita del grant conserva el registro de activo y sus metadatos; solo cambia la evidencia de acceso.
6. Se preservan firstSeenAt, lastSeenAt y la versión API observada.
7. Se validan tenant/conexión UUID, producto/tipo compatible, versión explícita, timestamps, IDs, duplicados, tareas y relaciones. Límites de tamaño impiden snapshots desproporcionados.

Existe un repository PostgreSQL para persistir snapshots validados y sus resultados de reconciliación; no hay aún adapter Graph/Meta que obtenga snapshots externos. La persistencia de inventario no equivale a integración end-to-end.

## 5. Capability Registry / Explainability implementado

Código:
- meta-capability.ts
- meta-capability-evaluator.ts

Cada definición es por product + operationKey + apiVersion; no existe una versión global implícita. El evaluador consume evidencia con estado observed/unknown, fuente, observedAt y validUntil.

Dimensiones evaluadas según los requisitos explícitos de cada operación:

- autorización del actor, tenant policy y purpose;
- asset grant y asset tasks;
- OAuth scopes y entitlements;
- modo de la app y App Review;
- Marketing API Access Tier Limited/Full, independiente de scopes;
- elegibilidad, tipo de cuenta y país;
- compatibilidad de API version;
- consent/legal basis y approval explícita cuando aplique.

Resultado:
- available: todas las condiciones requeridas están demostradas.
- unavailable: hay al menos una condición denegada.
- unknown: no hay denegación conocida, pero falta o expiró evidencia.

Solo available establece available: true. Una condición denegada prevalece sobre las desconocidas. Cada razón declara código estable, dimensión, requisito, explicación, fuente y fecha cuando existen. Evidencia expirada o inválida se convierte en desconocida, nunca en permiso.

No se sembró un catálogo falso de operaciones: las definiciones concretas siguen bloqueadas hasta verificar scopes, tasks, tier, app review, tipo/país, API version y elegibilidad para cada endpoint.

## 6. Pruebas incorporadas

- meta-asset.spec.ts: namespaces WAAC/PMA/teléfono; catálogo de tipos; mismatch; duplicados; tenant inválido; alta e historial; sync parcial; sync completo; snapshots viejos; grant denegado; aislamiento de registros de otro tenant.
- meta-capability-evaluator.spec.ts: decisión positiva; scope faltante; task faltante; actor denegado; evidencia unknown; version no soportada; evidencia expirada; tier insuficiente; consent/approval; App Mode/App Review/account type/country; gates opcionales; definición inválida.
- Las suites de dominio `meta-asset.spec.ts` y `meta-capability-evaluator.spec.ts` siguen en `api:test`; la ampliación de Fase 2 añadió suites OAuth, onboarding, Asset Registry service boundary y audit outcome. El registro de estas suites está en `apps/api/project.json`.

Evidencia CI: Source CI #42512236821 detectó en build TS4111 por dot notation en Record<string, unknown>. Se corrigió en el commit 2f97c8a94275c87f8543de065c30ae00cbf52b43. Source CI #42512364598 terminó SUCCESS (build, typecheck, API unit/PostgreSQL integration y Meta backend PostgreSQL/RabbitMQ integration); CodeQL #42512364506 terminó SUCCESS, ambos sobre 2f97c8a. El HEAD posterior 9e5dfa1 agrega un cambio separado de aislamiento de jobs. Source CI #42512536601 terminó con fallo en api:test: build y typecheck pasaron; 166/167 pruebas pasaron y las 23 pruebas nuevas de US-004 (inventario + capabilities) pasaron. La única falla fue la integración independiente tenant-job-record.integration.spec.ts, con SQLSTATE 42501 ('permission denied for table tenant_job_records') en PostgresTenantJobRecordWriter.stage; el target de Meta backend se omitió por el fallo previo. Esto no invalida los tests US-004, pero el HEAD posterior no tiene Source CI completo verde y la falla independiente debe corregirse por su owner.

## 7. Trabajo todavía necesario para cerrar TASK-009/010

| Dependencia / trabajo | ID o gate | Condición |
|---|---|---|
| Autorización y conexión Meta segura | TASK-008 y sus prerrequisitos | Modelo de connection, OAuth/Embedded Signup v4, state/CSRF, token exchange, vault/KMS y revocación/rotación. No existe aún runtime que provea connectionId autorizado. |
| Lectura/sincronización de activos | META-010..013 / TASK-009 | Congelar request/response/error, permisos y side effects; implementar Graph API adapters por producto/version, paginación, retries, rate limits, provenance y drift. |
| Persistencia e historial | TASK-009 | Tables/repos tenant-scoped, RLS, constraints de identity, audit, idempotencia, transacciones y pruebas PostgreSQL. |
| Capability definitions por operación | CR-0006 / TASK-010 | Registry source-controlled o versionado con evidencia oficial, fechas de vigencia, adapter support, scope/task/tier/account/region requirements y owner review. |
| Lectura/refresh y explicación en API | META-014..015 / TASK-010 | Schemas y authorization freeze, x-implementation-allowed, guards, audit, tests y contract CI antes de exposición. |
| Evidencia externa | Meta App Review + cuenta elegible | Validación con app y cuenta autorizadas; no se simula con fixtures ni CI sintético. |
| Validación y aceptación | docs/20, docs/24, docs/56 | Review independiente, pruebas integradas, Security/Privacy review y aceptación explícita del Product Owner. |

No hacer: no activar META-010..015, no declarar sincronización real, no usar tokens o datos reales, no hacer writes a Meta, no inferir grants desde ownership y no cambiar GO-PRODUCTION = NO-GO.

## 8. Referencias de código y documentación

- Código: apps/api/src/platform/meta-control-plane/domain/*.
- Pruebas: meta-asset.spec.ts, meta-capability-evaluator.spec.ts.
- Ejecución: target api:test en apps/api/project.json.
- Catálogo de integraciones: docs/09.
- Inventario de endpoints: docs/47.
- Readiness de contratos/gates: docs/49.
- Paquetes de trabajo: docs/53.
- Trazabilidad: docs/19.
- Aceptación: docs/20.

## Seguimiento del HEAD concurrente — 2026-11-08

- El Source CI #42512536601 del commit 9e5dfa1 pasó build y typecheck; api:test terminó 166/167. Las 23 pruebas nuevas de US-004 pasaron. La única falla fue tenant-job-record.integration.spec.ts (SQLSTATE 42501: permiso sobre platform.tenant_job_records), ajena al módulo Meta.
- El cambio de aislamiento fue corregido por el commit 2bfef634fb07603fb9ea1eb8df0127c4ece2ea49; el commit cd9ce49d082d6cf66f4a3c0f4e3818433f373950 añade una comprobación de idempotencia/INSERT. Source CI #42512743982 y CodeQL #42512744032 del HEAD cd9ce49 estaban in_progress al corte. No usar la ejecución fallida anterior como evidencia de defecto en US-004 ni declarar el HEAD actual completamente verde.
- El último CI completamente verde para el código de US-004 sigue siendo Source CI #42512364598 y CodeQL #42512364506 sobre 2f97c8a; allí pasaron build, typecheck, API/PostgreSQL y Meta backend/PostgreSQL/RabbitMQ.


## 7. Extensión de namespace — Threads (US-017; 2026-11-08)

- `MetaAssetProduct` incorpora `threads` y `MetaAssetType` incorpora `threads_profile`, con correspondencia única `threads_profile → threads`.
- Threads es una conexión/perfil distinto de Instagram aunque ambos pertenezcan a Meta. No se comparte ID externo ni capability por similitud de proveedor.
- Se amplía la prueba de validación de snapshots para aceptar el tipo namespaced sin modificar los tipos previos.
- El registro de activos no obtiene todavía inventario Threads de Meta ni persiste la conexión; debe alimentarse desde el credential/evidence provider y sincronizador (TASK-007..010). No se debe marcar el perfil como conectado por la existencia del tipo en el catálogo.


## Evidencia Source CI — adaptador Threads (2026-11-08)

- Build y typecheck de todas las aplicaciones: `SUCCESS`.
- API + PostgreSQL: **287/287 tests passed, 0 failed**.
- Meta backend + PostgreSQL/RabbitMQ: **112/112 tests passed, 0 failed**.
- Las suites Threads y el bridge al evaluador Meta se ejecutaron; el gate que obliga a ejecutar ambas baterías quedó en `SUCCESS`.
- Evidencia: Source CI run [42528782609](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42528782609), commit pipeline `1ba349cf013f4d34b5d3496e9a8adddee49a71ad`; CodeQL [42528566180](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42528566180) completado con `SUCCESS` sobre el commit de código `46f57247d667abb7e9626c639514bfd8e74ebc30`.
- Esta evidencia valida build/typecheck/tests y seguridad estática; no convierte el perfil Threads en una conexión Meta real ni cambia el estado productivo.


## 9. Actualización Fase 2 — persistencia real de TASK-009 y estado CI (2026-11-08)

### Incrementos confirmados en \`environment/local\`

- \`apps/api/migrations/0039-meta-asset-registry-and-sync-history.sql\`: tablas \`platform.meta_assets\` y \`platform.meta_asset_sync_runs\`, índices, FKs compuestas tenant/connection, trigger de identidad inmutable, RLS forzado y grants de mínimo privilegio. Los runs de sincronización son append-only, conservan snapshot hash, cambios y \`complete_for\` para demostrar la cobertura efectivamente enumerada.
- \`PostgresMetaAssetRegistryRepository\`: usa \`withTenantContextAtVersion\`, serializa sync por tenant/conexión con advisory transaction lock, verifica que la conexión sea activa, aplica la reconciliación pura, persiste upserts e historial dentro de la misma transacción y añade auditoría hash-chained.
- \`MetaAssetRegistryService\`: exige membresía activa y permiso \`meta.connections.manage\`, valida el snapshot y rechaza tenant mismatch antes de llegar al repositorio.
- \`MetaControlPlaneModule\`: enlaza el port a PostgreSQL, proporciona y exporta el application service.
- El outcome \`meta_assets_synced\` y eventos de Embedded Signup están alineados en la unión TypeScript, allowlist de runtime y CHECK de PostgreSQL.

### CI del HEAD \`a08bb5352f611077a6342ffc19a065fef2370b79\`

- Build y Typecheck de todas las aplicaciones: PASS.
- Migración 0039 aplicada y verificada como idempotente: PASS.
- Meta backend unit/integration (PostgreSQL/RabbitMQ): **112/112 PASS**.
- CodeQL: PASS (run 42555054766).
- Source workspace aggregate: FAILURE porque una integración baseline de Platform Administration falla con RLS al insertar en \`platform.usage_ledger\`; API unit/DB suite: 404/405 PASS. El agregador conserva ese fallo; no se excluye.
- No se ejecutó discovery Graph real ni se comprobó acceso de una app/cuenta Meta de WhatsBusiness.

### Estado que no debe confundirse

TASK-009 ya tiene persistencia de código fuente y migration CI-verified, pero no tiene discovery externo ni sincronización de una cuenta real. TASK-010 mantiene un motor de evaluación explicable, pero no existe catálogo completo con definiciones oficiales por operación para todas las familias Meta. Los contratos META-010..016 permanecen catalog-only. No hay endpoint público activo ni operación remota permitida. G2 sigue no aprobado.
