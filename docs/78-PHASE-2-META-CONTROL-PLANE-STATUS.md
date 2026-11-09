# 78 — Estado de implementación de Fase 2: Meta Control Plane (2026-11-08)

## Fuente de verdad y alcance

La secuencia vigente de fases se define en [31 — Plan maestro de entrega por fases](31-MASTER-DELIVERY-PLAN.md): **Fase 2 = Meta Control Plane y onboarding**. Esta definición sustituye la numeración histórica de \`docs/15-ROADMAP-AND-ADVANCEMENT.md\`, cuyo encabezado inicial todavía llamaba Fase 2 a WhatsApp completo. WhatsApp, Inbox y CRM esencial pertenecen a la Fase 3 del plan maestro.

Fase 2 cubre TASK-006..010: OAuth/state/PKCE, credential vault y lifecycle, Embedded Signup/onboarding, inventario de activos persistente y evaluación explicable de capabilities por operación. El gate de salida G2 requiere que la conexión determine con evidencia qué operación puede ejecutarse y por qué, que reconexión/revocación funcionen y que no se habiliten capacidades sin evidencia.

## Resultado de esta iteración

Los cambios se escribieron en la rama autorizada \`environment/local\` del repositorio \`JhonnyMinian92/WhatsBusiness\`.

### TASK-006 — OAuth y state/PKCE

- Se separó el AAD de state/PKCE del AAD de credenciales de conexión.
- El state se cifra asociado a tenant, actor y producto; la credencial persistente se cifra asociada a tenant, producto e identidad del usuario Meta.
- La asociación de credenciales ya no depende del administrador que inició la conexión; otro administrador del mismo tenant con permiso vigente puede gestionar la conexión sin romper la descifrabilidad del token.
- El port de renovación usa el access token actual, sin exigir un refresh token genérico que no está garantizado por los modos de autenticación Meta.
- Se agregaron pruebas a \`api:test\` para scope catalog, redirect exacto, open redirect, allowlist HTTPS, TTL e invariantes de onboarding.

**Estado:** \`in_progress\`. El provider OAuth real sigue siendo \`UnconfiguredMetaOAuthProvider\` y devuelve 503 deliberadamente. No hay intercambio OAuth real, aplicación Meta configurada ni callback HTTP público habilitado.

### TASK-007 — bóveda de credenciales, rotación y revocación

- La revocación local se persiste antes de intentar descifrar el token o llamar a Meta.
- Ante indisponibilidad de KMS o del proveedor remoto, la conexión queda en \`reauthorization_required\`, el resultado remoto se conserva como \`unknown\` y se exige seguimiento manual.
- El ledger de auditoría acepta el nuevo outcome de sincronización de activos; la bóveda sigue usando un port.

**Estado:** \`in_progress\`. \`UnconfiguredCredentialEnvelopeProvider\` continúa fail-closed. No se configuró KMS/secret manager, key rotation real, envelope encryption con claves operativas, rotación con proveedor ni drill de recuperación. **Compatibilidad de sobres antiguos sí implementada:** el descifrado intenta primero el AAD estable y luego el AAD histórico ligado al creador; los refresh re-cifran con el AAD estable. La suite Meta prueba renovación y revocación de sobres legacy. Sigue pendiente un rollout controlado que contabilice/migre conexiones que nunca vuelvan a renovarse, además de KMS y key rotation reales.

### TASK-008 — Embedded Signup y onboarding

- Se amplió la validación runtime del onboarding para rechazar productos y modos de autorización desconocidos, así como claves de idempotencia vacías o con whitespace no normalizado.
- Se conserva el estado durable/idempotente de la saga y sus transiciones con auditoría.

**Estado:** \`in_progress\`. No se implementó ni habilitó un cliente Embedded Signup v4 conectado a un \`config_id\` real; el adapter Meta y la bóveda siguen sin configuración. La correlación de IDs reales Business Portfolio/WABA/phone number, system-user assignment y suscripción webhook requiere el flujo autorizado y la cuenta real.

### TASK-009 — Asset Registry

- Se añadió \`MetaAssetRegistryService\` como frontera de aplicación: permisos del actor, validación estructural del snapshot y coincidencia tenant antes de persistir.
- Se añadió \`MetaAssetRegistryRepositoryPort\` y una implementación PostgreSQL que serializa sincronizaciones por tenant/conexión, lee el inventario previo, ejecuta la reconciliación pura y persiste el estado resultante en una transacción.
- La migración \`0039-meta-asset-registry-and-sync-history.sql\` añade inventario namespaced, acceso/tasks, ownership, relaciones, lifecycle, first/last seen, versión observada y un historial append-only de sync con hash y \`complete_for\`.
- Las tablas aplican RLS forzado por tenant, permisos de lectura/gestión separados y sin privilegio de borrado. La auditoría enlaza la sincronización a la conexión y al hash del snapshot.
- Un snapshot parcial no convierte una omisión en \`not_visible\`; esa conclusión solo se permite para tipos marcados como completamente enumerados.

**Estado:** \`in_progress\`. El nuevo repository y la frontera están conectados al módulo, pero \`META_ASSET_DISCOVERY\` sigue asociado a \`UnconfiguredMetaAssetDiscovery\`. No existe lectura Graph real, paginación externa, retry/rate-limit handling del provider ni cuenta Meta de prueba autorizada; por tanto no hay sincronización end-to-end.

### TASK-010 — Capability Registry

- Sigue disponible el evaluador por operación existente, que combina actor authorization, tenant policy, purpose, asset grants/tasks, OAuth scopes, entitlements, versión API, App Mode/Review, access tier, tipo de cuenta/país, consentimiento y approval, con estados \`available\`, \`unavailable\` y \`unknown\`.
- Se registró un catálogo acotado a los tres permisos WhatsApp de las colecciones oficiales de Meta consultadas: \`business_management\`, \`whatsapp_business_management\` y \`whatsapp_business_messaging\`. Otros productos/scopes siguen denegados por falta de evidencia en el catálogo.
- La allowlist de scopes es solamente una validación de nomenclatura/uso documentado; no representa App Review, Advanced Access, grant de usuario, Business Verification ni elegibilidad de activo.

**Estado:** \`in_progress\`. Falta el catálogo completo de definiciones operation-specific con procedencia, vigencia, lectura/refresh y persistencia de evidencia; faltan consumers/guards conectados al resultado y los contratos META-010..015 permanecen \`catalog-only\`.

## Inventario de tests añadidos

Se registraron en el target Nx \`api:test\`:

- \`meta-oauth-scope-catalog.spec.ts\`
- \`meta-oauth.policy.spec.ts\`
- \`meta-onboarding.policy.spec.ts\`
- \`meta-oauth.service.spec.ts\`
- \`meta-asset-registry.service.spec.ts\`

También se amplió \`append-only-audit.repository.spec.ts\` para verificar \`meta_assets_synced\`.

**Validación real del HEAD `a08bb5352f611077a6342ffc19a065fef2370b79`:**
- Source workspace validation: **FAIL** (run [42555054762](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42555054762)). Los pasos `Build all applications`, `Typecheck all applications`, aplicación de migraciones y verificación de idempotencia terminaron SUCCESS.
- Migración `0039-meta-asset-registry-and-sync-history.sql`: aplicada y verificada como idempotente en PostgreSQL del workflow.
- Suite Meta backend con PostgreSQL/RabbitMQ: **112/112 PASS** (outcome SUCCESS).
- Suite Inbox domain: **36/36 PASS**.
- API unit + PostgreSQL integration: **404/405 PASS**; el único fallo es `platform-administration.integration.spec.ts`, que intenta insertar `platform.usage_ledger` y recibe `new row violates row-level security policy`. Es el mismo fallo baseline documentado previamente para Platform Administration y no pertenece a TASK-006..010. El agregador mantiene el workflow global en FAILURE; no se excluyó ni se ocultó el test.
- CodeQL: **SUCCESS** en [run 42555054766](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42555054766), mismo SHA.
- Escaneo de credenciales, auditoría de dependencias de alta severidad, checks de observabilidad, migraciones/idempotencia y provisioning de roles de mínimo privilegio: SUCCESS.
- No se ejecutó intercambio OAuth, Embedded Signup ni sincronización Graph con una cuenta Meta real.

## Gates externos y de integración que siguen abiertos

1. Configurar Meta App por entorno, App ID/secret, redirect URI exactos, hosts de autorización, Facebook Login for Business y el \`config_id\` de Embedded Signup v4.
2. Provisionar KMS/secret manager y rotación de claves; desplegar/monitorizar la migración lazy de sobres legacy (refresh re-cifra con AAD estable) y completar re-encriptado controlado de conexiones que no se renueven normalmente.
3. Verificar App Review, Advanced Access, Business Verification, Tech Provider (cuando aplique), scopes concedidos, business eligibility, país y cuenta real/sandbox autorizada.
4. Implementar/revisar provider OAuth HTTP y discovery Graph con allowlist de hosts, versión por operación/producto, paginación, rate limit, timeouts, retries controlados y manejo de respuestas parciales.
5. Congelar schemas de request/response/error, autorización, idempotencia, auditoría y tenant boundary por META operation bajo docs/49 y G0 antes de habilitar endpoints.
6. La migración 0039 y su idempotencia ya pasaron; CodeQL pasó en el HEAD indicado. Corregir la integración baseline de Platform Administration que bloquea el Source workflow, repetir Source CI verde sobre un SHA final, hacer revisión independiente y obtener aceptación del Product Owner.

No se habilitan operaciones catalog-only ni acciones remotas. **Fase 2 no está completa y G2 no está aprobado; GO-PRODUCTION permanece NO-GO.**

## Orquestación y revisión

No se dispuso de un runtime de agentes independientes en esta sesión. Se trabajó por paquetes diferenciados (arquitectura, seguridad OAuth/KMS, dominio y persistencia, QA y documentación) y se hizo autochequeo de integración; esta revisión no se presenta como una aprobación independiente de seguridad o QA.

## Fuentes Meta revisadas

- Meta WhatsApp Embedded Signup collection: https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
- Meta WhatsApp Business Platform overview: https://www.postman.com/meta/whatsapp-business-platform/overview
- Catálogo y matriz operativa del proyecto: \`docs/09-API-INTEGRATION-CATALOG.md\`, \`docs/49-API-CONTRACT-READINESS-AND-META-ADAPTER-GATES.md\`


## Actualización 2026-11-09 — corrección de la escritura del Usage Ledger

La revisión del run Source CI `42555054762` (job `validate`) identificó un único test fallido: `PlatformAdministration` al ejecutar `INSERT platform.usage_ledger`, rechazado por RLS. Los pasos de instalación, escaneo de secretos/dependencias, migraciones e idempotencia, build, typecheck y suite Meta finalizaron SUCCESS; el agregador conservó FAILURE por esa integración.

Se reemplazó la escritura directa desde el repositorio por `platform.record_usage_entry`, función SQL de privilegios mínimos que comprueba los GUC transaccionales actor/tenant, el rol de ingesta y el estado medible del tenant. El rol API no conserva permiso directo `INSERT` sobre el ledger y la tabla mantiene RLS habilitada para las lecturas. La clave idempotente sigue acotada a tenant/categoría y la reconciliación solo devuelve datos de la misma identidad. La integración añade una aserción que verifica que el rol API no posee INSERT directo.

**Estado de evidencia:** cambio preparado en código/migración; Source CI del nuevo SHA aún pendiente. No declarar TASK-052, G1 ni G2 cerrados hasta que el run final pase y exista revisión/aceptación correspondiente.


## Actualización 2026-11-09 — segunda iteración de Usage Ledger

La migración `0040` superó instalación SQL e idempotencia, y el cambio superó build/typecheck; las suites Inbox y Meta terminaron SUCCESS. La suite API reportó 404/405: el test de Platform Administration detectó SQLSTATE `42702` por una referencia `payload_hash` ambigua entre la columna de la tabla y la columna de retorno PL/pgSQL.

La migración incremental `0041-platform-usage-ledger-returning-qualification.sql` vuelve a definir la función con alias `ledger_entry` y referencias calificadas en `RETURNING`. Se mantiene RLS para la aplicación, sin INSERT directo, la validación estricta de contexto y la resolución idempotente limitada al mismo actor.

**Estado de evidencia:** nuevo Source CI pendiente. TASK-052, G1 y G2 continúan sin cierre ni aceptación. La integración real de Meta y los despliegues externos no se infieren de pruebas locales.


## Actualización final de validación — HEAD 4ac3a950 (2026-11-09)

La información de las secciones anteriores describe el diagnóstico histórico de los HEAD `a08bb535`, `f7e9704` y la primera ejecución correctiva `4ac3a950` antes de aplicar la migración 0041. **El resultado vigente es el siguiente:** Source workspace validation [42594886590](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42594886590) y CodeQL [42594886621](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42594886621) finalizaron SUCCESS sobre el mismo HEAD `4ac3a95009c2b29ca7963d79733206ba8079d0d4`.

- Migraciones 0040 y 0041, incluida repetición idempotente: PASS.
- Build y typecheck: PASS.
- Inbox domain: 36/36 PASS.
- API + PostgreSQL: 405/405 PASS (incluye Platform Administration y el control de no-INSERT directo).
- Meta backend + PostgreSQL/RabbitMQ: 112/112 PASS.
- Escaneo de secretos, auditoría de dependencias de alta severidad, validación de activos de observabilidad, provisioning least-privilege, DLX quorum y métricas RabbitMQ: PASS.
- Agregador de suites independientes y CodeQL: SUCCESS.

El run previo `42594594079` falló primero por SQLSTATE `42702` en la cláusula RETURNING. La migración incremental 0041 calificó los campos mediante el alias `ledger_entry`; no se alteró 0040 ni se excluyó ninguna prueba. El nuevo run demuestra el cierre de ese defecto en el HEAD actual.

**Estado de la fase:** los slices de OAuth/state/PKCE, onboarding saga, persistencia de activos y catálogo/evaluación de capacidades siguen siendo parciales y `in_progress`. Los providers OAuth, envelope encryption y asset discovery permanecen fail-closed/unconfigured. META-010..015 permanecen catalog-only según docs/49; no se añadieron rutas públicas fuera del allowlist.

**G2 sigue abierto:** faltan App ID/secret y configuración Meta por entorno, `config_id` de Embedded Signup v4, KMS/Secret Manager y rotación real, provider OAuth/Graph, revisión/accesos Meta y cuenta de negocio autorizada, discovery y pruebas end-to-end de activos/capabilities, contract freeze por operación, review independiente y aceptación del propietario. La ejecución verde no demuestra un alta ni una operación real en Meta.


## Evidencia más reciente de TASK-008 / Fase 2 — 2026-11-09

El código de onboarding del HEAD `1a41984bca97aa2bc7fd64d5f9076e04b4b7c343` incorpora progreso persistido de discovery, lectura de estado tenant-scoped para administradores del tenant, validación estricta del snapshot de capabilities, auditoría de fallas y separación entre errores de Meta y errores de persistencia local. Migración 0042 y suite de servicio integradas al API test target.

**Source CI:** [42596385580 SUCCESS](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42596385580). **CodeQL:** [42596385533 SUCCESS](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42596385533). Resultados: API 414/414, Meta backend 112/112, Inbox 36/36; build/typecheck/migrations/idempotency/security/observability PASS.

| TASK | Estado técnico actualizado | Pendientes de cierre |
|---|---|---|
| TASK-008 | `in_progress`; saga y consulta de progreso durable implementadas y CI-verified en este slice. | Meta OAuth provider, Meta App por entorno, Embedded Signup v4 `config_id`, KMS/credential envelope real, discovery Graph, webhook subscription, negocio de prueba autorizado, contract freeze y E2E real, revisión independiente y aceptación. |
| TASK-009 | `in_progress`; registry y persistencia ya existentes, saga registra el resumen del discovery. | Adapter Graph real, paginación/rate limits/retry, token provider, reconciliación con conexión autorizada, evidence freshness y gates META-010..013. |
| TASK-010 | `in_progress`; evaluator explicable y fail-closed existente. | Catálogo completo por operación/versión, evidence providers y consumidores/guards; META-014..015 catalog-only. |

No se abre ningún controller ni ruta de operación catalog-only. El resultado verde no demuestra conexión real con Meta ni aprobación G2. La implementación de Embedded Signup v4 requiere configuración de Facebook Login for Business y un `config_id` real de App Dashboard; las guías actuales describen `FB.login` con `config_id`, `response_type: code` y `override_default_response_type: true`. [documentación oficial de Embedded Signup en Postman](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup) y [guía de migración a Embedded Signup v4](https://help.twilio.com/articles/54890520784027-How-to-update-your-Meta-configuration-for-Embedded-Signup-ESU-v4).
