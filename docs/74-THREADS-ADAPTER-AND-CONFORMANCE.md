# 74 — Threads adapter, capabilities y conformance (US-017)

**Fecha:** 2026-11-08  
**Rama:** `environment/local`  
**Historia:** US-017 — Threads y nuevas capacidades  
**Tarea:** TASK-033  
**Estado de código:** slice interno implementado; verificación Source CI y operación con cuenta real pendientes. TASK-033 y US-017 permanecen `in_progress`.

## 1. Criterios de aceptación y alcance

| Criterio | Implementación de este slice | Límite verificable |
|---|---|---|
| AC-017-01 — adapter/capabilities nuevos sin romper contratos previos | Adapter Threads independiente, transport HTTP intercambiable, access-token provider, capability authorizer y perfil de activo `threads_profile` namespaced. | No cambia adapters existentes. No añade endpoints públicos catalog-only. |
| AC-017-02 — contract tests y version policy | Catálogo de scopes Threads, evaluación mediante el MetaCapabilityEvaluator común, política de versión/base URL y conformance tests de lectura, paginación, publicación en dos fases, respuestas, insights y errores. | CI del HEAD de entrega y revisión independiente pendientes. Cuenta/App Review/authorization real no probados. |

## 2. Investigación y contrato de proveedor

Fuentes oficiales comprobadas el 2026-11-08:

- Meta official Threads API Postman workspace: https://www.postman.com/meta/threads/overview
- Meta official Threads API collection: https://www.postman.com/meta/threads/collection/dht3nzz/threads-api
- Meta official Threads API documentation: https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api
- Changelog oficial indicado por la colección: https://developers.facebook.com/docs/threads/changelog

La colección oficial establece que debe existir una Meta app con el use case Threads y que el usuario autoriza el acceso. Los permisos usados por esta implementación son específicos de Threads:

| Capacidad | Permisos requeridos |
|---|---|
| Perfil y lectura de publicaciones propias | `threads_basic` |
| Publicación | `threads_basic`, `threads_content_publish` |
| Lectura de respuestas | `threads_basic`, `threads_read_replies` |
| Publicar respuesta | `threads_basic`, `threads_content_publish` |
| Insights | `threads_basic`, `threads_manage_insights` |

No se reutilizan scopes Instagram ni se presupone que `threads_manage_replies` sea necesario para escribir una respuesta pública; ese permiso pertenece a las operaciones de administración/moderación de replies, que no se exponen en este slice.

Host fijado por la colección: `https://graph.threads.net`. La URL de base se valida con HTTPS y hostname exacto. La colección utiliza el host como variable y presenta rutas como `/me/threads`; por ello el adaptador no inserta automáticamente un prefijo de versión. El `apiVersion` debe declararse por configuración, estar en allowlist y coincidir con la evidencia de la capacidad. Puede configurarse la ruta versionada en `apiBaseUrl` solo cuando la referencia oficial de la operación lo confirme. No se hereda Graph API v27 de Facebook/Marketing API ni se afirma aquí que v1.0 sea la versión vigente en producción: el valor de pruebas es sintético.

## 3. Arquitectura implementada

Código nuevo en `microservices-meta-ecuapp/src/threads`:

- `domain/threads-api-version-policy.ts`: pin explícito, allowlist, retired versions, antigüedad de evidencia, fuente HTTPS de confianza, allowlist de host y construcción segura de URL.
- `domain/threads-contracts.ts`: modelos normalizados de perfil, post, reply, páginas, insights y receipt de publicación.
- `application/threads-capability-catalog.ts`: scope mapping por operación sin paridad implícita con otros productos.
- `application/threads-api.ports.ts`: puertos de transport, access token provider y capability authorizer.
- `application/threads-api.adapter.ts`: casos de uso del adapter y mapping allow-listed de respuestas del proveedor.
- `infrastructure/http/fetch-threads-api.transport.ts`: transporte HTTP con bearer token en header, timeout, errores saneados y sin reintentos ocultos.

Bridge al capability engine común:
`apps/api/src/platform/meta-control-plane/threads/threads-capability-authorizer.ts` adapta la evidencia de la conexión a `MetaCapabilityEvaluator`. La evidencia es proporcionada por un port; falta su provider persistente/runtime conectado a TASK-007..010. La ausencia, expiración o desajuste de versión no permite ejecutar la operación.

## 4. Operaciones internas cubiertas

| Operación | Threads endpoint | Capability |
|---|---|---|
| Leer perfil conectado | `GET /me` | `profile.read` |
| Listar publicaciones propias | `GET /me/threads` | `posts.read` |
| Leer publicación | `GET /{thread-id}` | `posts.read` |
| Leer respuestas | `GET /{thread-id}/replies` | `replies.read` |
| Crear y publicar texto | `POST /me/threads` → `POST /me/threads_publish` | `posts.publish` |
| Publicar respuesta | contenedor `/me/threads` con `reply_to_id` → `/me/threads_publish` | `replies.publish` |
| Insights de publicación | `GET /{thread-id}/insights` | `insights.read` |
| Insights del perfil | `GET /me/threads_insights` | `insights.read` |

El API usa el patrón nativo de creación de contenedor y publicación. El segundo POST nunca se reintenta automáticamente: ante timeout/5xx el estado se marca `unknown` y se conserva `containerId` cuando ya se conoce para permitir reconciliación manual/operativa. No se confunde creación de contenedor con publicación confirmada.

Las páginas son cursor-based; no se siguen URLs `next` del proveedor (que podrían contener credenciales), los cursores son validados y `before`/ `after` son mutuamente excluyentes. Los IDs se codifican como segmentos y no se acepta path arbitrary. El token se envía como Bearer header y nunca en query/URL o texto del error.

## 5. Conformidad y compatibilidad

Suites nuevas registradas en Nx:

- `threads-api-version-policy.spec.ts`: allowlist, versiones retiradas, host, fuente, evidencia expirada/futura y path traversal.
- `threads-api.adapter.spec.ts`: perfil, posts, paginación, replies, insights, publicación en dos fases, gate capability fail-closed, mismatch de versión y outcome desconocido sin reintento.
- `fetch-threads-api.transport.spec.ts`: bearer token no expuesto en URL, error sanitizado, POST 5xx ambiguo y ausencia de retry oculto.
- `threads-capability-authorizer.spec.ts`: scope faltante y evidencia unknown a través del evaluador común.
- `meta-asset.spec.ts`: tipo de activo Threads con namespace propio y validación producto/tipo.

El catálogo compartido agrega `threads` / `threads_profile`; no renombra ni migra los tipos previos.

## 6. Webhooks y límites de integración externa

El gateway existente ya reconoce el producto `threads` en su entrada común `/api/v1/webhooks/meta/threads` y conserva raw body, firma, inbox durable y outbox. Sin embargo, **no se registra un handler de negocio Threads no-op**. El worker envía eventos sin handler a DLQ; para cerrar WH-007 se debe congelar el payload/topic contract de Threads a partir de documentación/App Dashboard actual, validar la forma exacta del envelope y agregar un handler real con procesamiento idempotente. Por ello no se declara completo el procesamiento de eventos Threads.

TH-001..006 permanecen en OpenAPI como catálogo hasta que sus request/response/error schemas pasen contract freeze según docs/49 y docs/55. Este trabajo añade un adapter interno, no publica rutas API no autorizadas.

## 7. Seguridad, datos y rollback

- Datos: identificadores de perfil/posts/replies, textos de publicación y métricas sociales; contenido del usuario es sensible a la finalidad/consentimiento del tenant.
- Trust boundaries: OIDC actor/tenant → capability authorizer → token provider → Threads Graph host.
- Los puertos deben resolver credencial del tenant/perfil activo; no se acepta token suministrado desde request público.
- No registrar access tokens, App Secret, URL con credenciales, texto completo de post o payloads de proveedor.
- Fail-closed si no hay credencial, evidencia, scope o versión compatible.
- No hay migración DB. Rollback: revertir commit de adapter y la extensión tipada de `threads_profile`; no hay alteración de datos existentes ni side effects remotos automáticos.

## 8. Estado pendiente para cierre de TASK-033

1. Source CI del commit que incorpora las suites, build, typecheck, API tests y backend tests.
2. Revisión independiente de arquitectura/seguridad y aceptación explícita del Product Owner.
3. Implementación de providers reales de credential/evidence conectados al Meta Control Plane.
4. App Threads de WhatsBusiness, OAuth, permisos concedidos y prueba autorizada con perfil empresarial de prueba.
5. Revisión de versión/operaciones exactas contra changelog oficial por operación y evidencia fechada.
6. Freeze de TH-001..006 / OpenAPI y WH-007 envelope/topic + handler empresarial idempotente.
7. Runtime deployment/health/metrics del adapter y reconciliación de resultados de publicación ambiguos.

No se realizó OAuth, lectura o escritura live en una cuenta Meta, no se publicaron posts reales, no se ejecutó webhook Threads real, no se hizo deploy y no se declara producción habilitada.


## 9. Evidencia de ejecución Source CI (2026-11-08)

Ejecución final: [Source workspace validation #42528782609](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42528782609), estado `completed / success`, disparada por el commit de pipeline `1ba349cf013f4d34b5d3496e9a8adddee49a71ad`.

- Build de todas las aplicaciones: SUCCESS.
- Typecheck de todas las aplicaciones: SUCCESS.
- API + PostgreSQL: **287 pruebas, 287 aprobadas, 0 fallidas**.
- Meta backend + PostgreSQL/RabbitMQ: **112 pruebas, 112 aprobadas, 0 fallidas**.
- Gate de suites independientes: SUCCESS.
- CodeQL [#196 / run 42528566180](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42528566180): SUCCESS sobre el commit de código Threads `46f57247d667abb7e9626c639514bfd8e74ebc30`.

La ejecución confirmó también las pruebas del namespace de identidades/activos Threads, el bridge de scopes y consentimiento, el adaptador de perfil/publicaciones/replies/insights, el flujo container→publish, la política de versión, el transporte y los errores de outcome ambiguo.

La verificación anterior del primer commit detectó un fallo preexistente/paralelo en Ads y omitió la batería Meta; el pipeline fue modificado para ejecutar ambas suites de forma independiente y la rama incorporó la corrección Ads. Esta segunda ejecución completa terminó en verde. No se oculta ni se reinterpreta ese primer resultado.

El estado de TASK-033/US-017 sigue `in_progress` únicamente para gates operativos/external-provider aún no demostrados: credential/evidence provider persistente, OAuth y permisos efectivos de app/cuenta real, freeze de TH-001..006 y WH-007, handler real de eventos idempotente, métricas/health runtime, revisión independiente y aceptación PO. No hay deploy, operación Meta live ni GO-PRODUCTION.
