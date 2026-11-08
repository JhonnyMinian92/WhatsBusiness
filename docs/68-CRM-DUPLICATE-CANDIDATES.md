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

El slice actual implementa señales de dominio y pruebas puras. Aún se requieren contrato HTTP congelado, repositorio/query eficiente tenant-scoped con paginación, auditoría de consulta cuando proceda, pruebas PostgreSQL de aislamiento/rendimiento, revisión de umbrales con datos sintéticos representativos y aceptación independiente. No usar nombres iguales como criterio autónomo de fusión.

## Fuera de alcance

No se incluye scoring ML, normalización de teléfonos desde texto sin país, búsqueda difusa, auto-merge ni acceso a datos de leads. Los modelos de ML de CRM pertenecen a TASK-081..087 y dependen de outcomes/features y etiquetas con provenance aprobadas.
