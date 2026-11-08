# US-030 — Creative Lab y experimentos de anuncios

**Corte:** 2026-11-08  
**Historia:** US-030 (P1)  
**Tareas:** TASK-069, TASK-070, TASK-073, TASK-079  
**Estado:** in_progress — slice de dominio/aplicación/persistencia incorporado; no verified/accepted.  
**Release:** GO-PRODUCTION = NO-GO.

## 1. Propósito y alcance real

Creative Lab debe mantener la identidad y procedencia de cada versión creativa, ayudar a los equipos de marketing a formular hipótesis comprobables y analizar señales de rendimiento sin confundir atribución con causalidad. Se cubren el catálogo de assets y variantes, la revisión de derechos/marca/claims, similitud, previews por placement, test cells, stop criteria y recomendaciones de refresco.

El alcance de esta entrega es interno. No se agregan controladores REST ni se cambia el estado x-implementation-allowed de APIs Ads/Meta. Los providers externos se registran como unavailable/unknown hasta tener implementación y evidencia vigente.

## 2. Modelo de dominio

Código: apps/api/src/ads/creative-lab/domain.

- CreativeVariantDraft/Record: campaign, concepto, oferta, hook, formato, CTA, placements, headline/body/description, audience hypothesis, brand kit id+version, asset storage reference/hash/MIME/size/alt text.
- CreativeProvenance: origen humano o AI; para AI conserva provider, model, prompt version/hash, source assets y generation job reference. El modelo/prompt no se interpreta como prueba de derechos.
- CreativeRightsEvidence: titular, licencia, usos permitidos, consentimiento, expiración y referencia de evidencia. La confianza en estos datos debe provenir del provider confiable de derechos; el input de usuario no es evidencia autoritativa.
- CreativeClaimEvidence: claim, referencia que lo respalda, revisor y vigencia. Claims caducados o sin evidencia detienen el paso de revisión.
- CreativeSimilarityProfile: texto normalizado, SHA-256 del asset y perceptual hash 64-bit opcional. Se usan para candidatos duplicados, no para decidir titularidad ni infracción.
- CreativeExperimentDefinition: hipótesis, variable primaria, KPI, presupuesto, fechas, tamaño de muestra, lift detectable opcional, stop criteria, modo de asignación y test cells.
- CreativeFatigueAssessment: ventanas, API version, attribution window, impresiones/reach/clicks, spend, CTR, CPA, frequency y recomendación nativa cuando existe. La salida incluye explícitamente causalLiftEstablished=false.

## 3. Reglas de producto y control

1. Una variante exige una lista de placements única, formato soportado, referencia de asset segura y provenance. No se admiten URLs remotas como clave de almacenamiento ni path traversal.
2. La reutilización del mismo SHA-256, texto casi idéntico o perceptual hash cercano produce candidatos de near-duplicate. La similitud es heurística y debe presentarse con score/reasons, no como sentencia legal.
3. Los estados de derechos/consent/claims y su vigencia se verifican de nuevo en el servidor antes de review/approval. Una declaración de cliente no concede por sí misma derechos para paid ads.
4. El control experimental se define antes de observar resultados: exactamente una celda control, al menos una variant, una variable principal, presupuesto total exacto, moneda homogénea y reglas de parada explícitas.
5. El provider de audiencia debe probar que las particiones son disjuntas y frescas. Una partición solapada o desconocida bloquea la readiness. Para meta_experiment se exige un provider experiment reference.
6. El preview solo se intenta con capability available, asset grant y ad account probados, API version vigente y placement permitido. Los feature keys enviados se filtran por allowlist de evidencia actual. Un provider ausente significa unknown y no se llama a Meta.
7. creative_limited solo se reconoce si hay recomendación explícita de Meta y referencia a dicha observación. La fatiga heurística necesita dos ventanas comparables y frescas, minimum sample y thresholds definidos para el tenant/objetivo.
8. El refresh brief cambia una sola variable y mantiene constantes audiencia, oferta, KPI, attribution window y presupuesto. Es un draft; no genera imagen ni habilita publicación.
9. La aprobación independiente referencia un snapshot inmutable de la variante. Un approved de dominio no equivale a publicación Meta. Las mutaciones siguen en el gateway y approval/spend gates existentes.

## 4. Persistencia y aislamiento

Migration apps/api/migrations/0031-ads-creative-lab.sql incorpora:
- ads.creative_variants con versión optimista, idempotencia, composite FK tenant/campaign, aprobación y trigger de estado.
- ads.creative_variant_snapshots append-only para historial, review y aprobación.
- ads.creative_experiments y ads.creative_experiment_cells con FKs tenant-scoped, asignación control/variant y budgets.
- ads.creative_performance_observations como observaciones atribuidas por Meta, con API/attribution/window/provenance y constraints temporales/métricas.
- ads.creative_fatigue_policies por tenant/objetivo y ads.creative_recommendations como evidencia inmutable de fatiga/Creative Limited.
- FORCE ROW LEVEL SECURITY, policies, índices, grants y triggers que impiden mutar contenido/snapshots desde el rol de aplicación.

Todas las operaciones internas usan DatabaseService.withTenantContextAtVersion. La persistencia del creative no comparte tablas con ads.campaigns salvo las FKs tenant-aware.

## 5. Aplicación y abstracciones

CreativeLabApplicationService coordina autorización, idempotencia, validación, repositorio, aprobación y audit. CreativeLabRepository encapsula PostgreSQL. Los puertos de provider separan evidence lookup, transport Preview/Recommendations y audience allocation, habilitando adapters por producto/versión y fixtures de prueba.

Implementaciones fallback registradas:
- UnavailableCreativeReviewEvidenceProvider
- UnavailableCreativeCapabilityEvidenceProvider
- UnavailableCreativeExperimentEvidenceProvider
- UnavailableMetaCreativeTransport

Son bloqueos intencionales y fail-closed; no se deben reportar como integraciones Meta terminadas.

## 6. Matriz de tareas

| Tarea | Estado | Código entregado | Bloqueos |
|---|---|---|---|
| TASK-069 | in_progress | variant model, rights/provenance/claims metadata, similarity, Postgres repo, snapshots. | Trusted rights/consent provider, asset store scanning, brand/claims review workflow. |
| TASK-070 | in_progress | test cell model, exact money, KPI/sample/stop criteria, allocation evidence provider, RLS persistence. | TASK-067/072, audiencias disjuntas y provider de asignación, aprobación/activation transport. |
| TASK-073 | in_progress | Meta preview/feature/recommendation ports, placement gate, capability freshness, allowlisted feature filtering. | Official adapter/version/endpoint con evidence provider y account-tested contracts. |
| TASK-079 | in_progress | fatigue evaluation, provider signal, thresholds policy, refresh brief draft-only. | TASK-072 Insights ingestion, policy configuration UI/service, recommendations ingestion and audit tests. |

## 7. Pruebas registradas

Cinco suites de dominio y una suite de adapter quedaron agregadas al target api:test:
- creative-variant.spec.ts: provenance, rights, consent, claims y approval binding.
- creative-similarity.spec.ts: SHA exacto, texto normalizado, perceptual hash y empty profile.
- creative-experiment.spec.ts: control/variant, presupuesto, overlap, native experiment reference y approval.
- creative-fatigue.spec.ts: fatigue vs Creative Limited, stale/sample y refresh draft.
- creative-native-configuration.spec.ts: safe native spec, secret rejection.
- creative-provider.adapter.spec.ts: unknown capability no transport calls, feature allowlist y Performance Recommendations gate.

**Resultado de ejecución:** pendiente. No se han ejecutado localmente ni se reporta PASS hasta validar Source CI del commit exacto, migraciones idempotentes y PostgreSQL/RLS. La indisponibilidad de red local impidió clonar el repo para ejecución manual.

## 8. Gates necesarios para cierre

- TASK-056: API version/access-tier registry, asset and operation capability evidence.
- TASK-067/072: Insights snapshots/measurement and ingestion with authoritative provider data.
- Provider confiable de rights/consent, brand kit, claims evidence y scan de assets.
- Provider de audiencia/experimentos con overlap evidence and stop/holdout semantics.
- Contratos ADS/META freeze y adapter oficial por operation, version, login mode, permission and account type.
- PostgreSQL migration replay, RLS, idempotency and concurrency tests; Source CI + CodeQL green on exact HEAD.
- Independent QA/Security/Product architecture review and Product Owner acceptance.

No se aprueba GO-PRODUCTION, uso de datos de cliente, mutaciones Meta, publicaciones o aumentos de gasto por esta entrega.
