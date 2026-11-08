# 68 — CRM-007: motor de candidatos de duplicación

**Fecha:** 2026-11-08  
**Ámbito:** `environment/local`, backend `apps/api`  
**Estado:** implementación de dominio; API/consulta y acceptance pendientes  
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

## Verificación pendiente para completar CRM-007

El slice de dominio y nueve pruebas puras quedó verificado en Source CI #585 y CodeQL #120 (commit 82eff584655212c16a4f59bce9542aeedf978bc4). Aún se requieren contrato HTTP congelado, repositorio/query eficiente tenant-scoped con paginación, auditoría de consulta cuando proceda, pruebas PostgreSQL de aislamiento/rendimiento, revisión de umbrales con datos sintéticos representativos y aceptación independiente. No usar nombres iguales como criterio autónomo de fusión.

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
