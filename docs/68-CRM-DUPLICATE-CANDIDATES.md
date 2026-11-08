# 68 — CRM-007: motor de candidatos de duplicación

**Fecha:** 2026-11-08  
**Ámbito:** `environment/local`, backend `apps/api`  
**Estado:** dominio, API tenant-scoped y consulta PostgreSQL implementados; CI/acceptance independiente pendientes  
**Dependencias:** TASK-042, TASK-043, TASK-053

## Objetivo

Proponer posibles duplicados de contactos sin unir registros, revelar PII en resultados de ranking ni comparar datos entre tenants. El detector es un servicio puro de dominio: recibe un perfil de origen y candidatos ya consultados por un repositorio tenant-scoped.

## Estrategias de señales

| Señal | Peso | Interpretación |
|---|---:|---|
| Identidad provider-scoped exacta (provider/product/channel/identifierType/externalId) | 100 | Colisión de identidad fuerte; exige revisión |
| Mismo teléfono E.164 verificado por el mismo provider, aunque cambie product/channel | 80 | Señal media cross-channel; puede ser compartido o reciclado, nunca fusiona automáticamente |
| Mismo sourceType y sourceReference | 75 | Probable reimportación de un mismo evento/fuente |
| Nombre exacto normalizado | 35 | Señal débil; no basta para superar el umbral predeterminado |

El score se limita a 100. Umbral predeterminado: 70. Una puntuación 90–100 es alta, 75–89 media y 70–74 baja. Los pesos son reglas deterministas iniciales, no probabilidades estadísticas calibradas.

## Seguridad y consistencia

- El tenant del origen, los candidatos y todas sus identidades debe coincidir. Una desviación falla cerrada.
- Cada ContactIdentity debe pertenecer al tenant y contacto del perfil que la contiene.
- La igualdad de identidades considera la namespace completa; los IDs externos son opacos y case-sensitive.
- Se omiten registros archivados y tipos de contacto incompatibles.
- No se entregan nombres, teléfonos, identificadores externos ni otra PII en el objeto candidate result.
- El detector devuelve `manual_review_required`; no realiza merge, unlink ni mutación.
- El orden es score descendente y UUID ascendente, con límite máximo 100 resultados.

## Verificación y estado actual de CRM-007

El dominio quedó verificado primero en Source CI #585 y CodeQL #120 (commit 82eff584). Posteriormente se integró el contrato HTTP, query PostgreSQL tenant-scoped, lecturas bulk, auditoría de consulta, límites e índices y pruebas PostgreSQL de aislamiento. Source CI #596 y CodeQL #131 terminaron SUCCESS sobre el commit abab9fe88abe0dfce9741cf6794d45c48ff15373; Contract CI #31 SUCCESS validó el OpenAPI sobre f0ebaae6c57d7821641e18331c7d7c42cf12cb5b. Los commits posteriores de environment/local no modificaron el slice CRM. La revisión independiente, calibración de reglas con datasets sintéticos representativos y aceptación del Product Owner siguen pendientes. No usar nombres iguales como criterio autónomo de fusión.

## Fuera de alcance

No se incluye scoring ML, normalización de teléfonos desde texto sin país, búsqueda difusa, auto-merge ni acceso a datos de leads. Los modelos de ML de CRM pertenecen a TASK-081..087 y dependen de outcomes/features y etiquetas con provenance aprobadas.


## Corrección post-CI #584 — fixture de ranking (2026-11-08)

Source CI #584 validó install, validación de observabilidad, migraciones/idempotencia, build y typecheck; falló una aserción de la prueba "candidate ranking and result cap are deterministic". El fixture había dado una ContactIdentity al perfil candidato, pero no al perfil de origen, así que no existía una colisión namespaced y el score observado de 75 era el comportamiento correcto.

Se corrige el fixture para que origen y candidato compartan la misma identidad completa (provider/product/channel/identifierType/externalId); ahora ese candidato debe puntuar 100 y los dos restantes 75, comprobando orden y límite de resultados. No cambia el algoritmo ni se relaja la validación.


## Evidencia de CI — 2026-11-08

- Commit 82eff584655212c16a4f59bce9542aeedf978bc4: Source CI #585 SUCCESS y CodeQL #120 SUCCESS.
- Source CI #584 había detectado un fixture incompleto para la estrategia de identidad; el fixture fue corregido antes de la validación satisfactoria, sin modificar el algoritmo.
- El resultado valida el dominio y sus nueve pruebas específicas, no el endpoint, repositorio tenant-scoped, merge reversible, aceptación o despliegue.


## Señal cross-channel verificada — 2026-11-08

Se incorpora `SameVerifiedPhoneE164Strategy` con peso 80 (confianza media). Compara el teléfono E.164 canónico dentro del mismo provider, permitiendo distinto product/channel. Ambos ContactIdentity deben tener `identifierType=phone_e164` y `verifiedAt` no nulo. No compara valores sin evidencia de verificación. Los números compartidos o reciclados siguen siendo posibles, por lo que el resultado es exclusivamente `manual_review_required`; el detector no enlaza ni fusiona identidades.

Dos pruebas nuevas garantizan match cross-channel cuando ambas identidades están verificadas y ausencia de match cuando ambas carecen de verificación. Los pesos continúan siendo reglas deterministas, no probabilidades calibradas.


## Corrección post-CI #586 — catálogo de reason codes (2026-11-08)

Source CI #586 detectó un error de compilación TypeScript: la nueva estrategia `SameVerifiedPhoneE164Strategy` emitía `SAME_VERIFIED_PHONE_E164`, pero el union `ContactDuplicateCandidateReason` no incluía el literal. Se incorpora el reason code al tipo público del dominio; no se cambia el peso (80), la exigencia de `verifiedAt` ni la regla manual-review. La corrección requiere un nuevo Source CI y CodeQL.


## Evidencia de señal cross-channel — 2026-11-08

La estrategia `SAME_VERIFIED_PHONE_E164` se verificó en commit `d3d3b0722a61494eb8b8ba1d2e7c769ab2383f3d`: Source CI #587 SUCCESS y CodeQL #122 SUCCESS. Source CI ejecutó lockfile congelado, validador de observabilidad, migrations/idempotencia, build, typecheck, suites API/PostgreSQL y Meta backend PostgreSQL/RabbitMQ. El target `api:test` incluye 11 casos CRM del detector. La coincidencia cross-channel requiere mismo provider, E.164 exacto y `verifiedAt` no nulo en ambos perfiles; el resultado sigue siendo `manual_review_required`.


## Integración de producto — CRM-007 (2026-11-08)

Se implementó el endpoint:

`POST /v1/tenants/{tenantId}/identity-resolution/candidates`

- Request estricto: `sourceContactId` UUID y `limit` opcional de 1 a 100 (default 25). No requiere `Idempotency-Key` porque es una consulta sin efectos de negocio.
- OIDC + tenant context + permiso y propósito `crm.contacts.identities.read`; el caso de uso vuelve a validar `authzVersion` dentro de la transacción.
- La consulta SQL busca únicamente señales fuertes: identidad namespaced exacta, teléfono E.164 verificado por el mismo provider o coincidencia de sourceType/sourceReference. La igualdad de nombre solo aporta evidencia adicional a un candidato que ya superó el prefilter; no provoca escaneo masivo por nombres comunes.
- La carga de perfiles/identidades reutiliza los repositorios existentes mediante lecturas bulk tenant-scoped. El SQL no puede cruzar tenant; el límite duro de 10.000 candidatos falla cerrado y nunca puntúa un subconjunto truncado.
- Dos índices parciales soportan la búsqueda por teléfono verificado y procedencia activa. Se conserva la unicidad de namespace existente.
- La respuesta contiene solo contactId, contactVersion, score, confidence, reason codes y `manual_review_required`. No devuelve nombres, teléfonos, external IDs ni ciphertext.
- Cada consulta exitosa agrega un evento a la cadena append-only de auditoría, ligado al contacto fuente, propósito, correlación y hash de la consulta.
- Se añadieron tests de parser, servicio, controller y una integración PostgreSQL/RLS que compara dos tenants con el mismo sourceReference.

### Límites que no se declaran resueltos

CRM-007 no fusiona contactos, no verifica identidades frente a Meta y no altera `verifiedAt`/confidence. La cobertura real de matching depende de que existan identidades verificadas o procedencia confiable. Los pesos son reglas deterministas sin calibración probabilística. Source CI #596, CodeQL #131 y Contract CI #31 verificaron código y contrato de CRM-007; revisión independiente, calibración con datasets sintéticos representativos y aceptación del Product Owner siguen pendientes. TASK-043 y TASK-053 permanecen `in_progress`.


## Cierre técnico CRM-007 — API/query/contrato (2026-11-08)

- API: POST /v1/tenants/{tenantId}/identity-resolution/candidates, body estricto, limit 1–100, response sin PII y manual_review_required.
- Seguridad: OIDC, tenant context, RBAC/purpose crm.contacts.identities.read, revalidación de authzVersion y audit append-only.
- Datos: query por identidad namespaced, teléfono E.164 verificado o source reference; bulk reads tenant-scoped; batch mayor a 10.000 falla cerrado; migración 0026 indexa los predicados fuertes.
- Tests: parser/controller/service unit; PostgreSQL/RLS A/B integration; audit validation de dotted identifiers; las suites API y backend finalizaron SUCCESS.
- Evidencia: Source CI #596 (https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42512027909), CodeQL #131 (https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42512027905), Contract CI #31 (https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42511475181).
- CRM-007 queda implementado y CI-verified. No se declara accepted: faltan reviewer independiente, evaluación de precisión/recall con datos sintéticos etiquetados y aceptación del Product Owner. TASK-043/TASK-053 global permanecen in_progress; CRM-008..010 siguen pendientes.