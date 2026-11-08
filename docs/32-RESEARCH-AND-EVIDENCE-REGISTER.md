# 32 — Registro de investigación externa y evidencia técnica

**Corte de investigación:** 2026-11-06  
**Propósito:** conservar hechos externos relevantes, URL, fecha y efecto sobre el diseño. Los datos volátiles se vuelven a consultar antes de implementar o liberar. Este documento no certifica acceso de la Meta App ni cumplimiento legal.

## 1. Hallazgos Meta relevantes para la arquitectura

### META-OBS-001 — Versiones Graph API / Marketing API
- **Hecho consultado:** el portal oficial Meta for Developers muestra el anuncio de Graph API v27.0 y Marketing API v27.0 en noviembre de 2026.
- **Fuente:** https://developers.meta.com/resources/blog/ y anuncio enlazado desde el portal: https://developers.facebook.com/blog/post/2026/11/04/introducing-graph-api-v27-and-marketing-api-v27/
- **Efecto:** no fijar una versión universal en el código; cada adapter conserva product/version, compatibilidad, fixtures, changelog y sunset. Antes de implementar cada operación debe leerse el changelog completo de la versión vigente.
- **Confianza:** alta para existencia de v27; los detalles endpoint por endpoint requieren lectura del changelog oficial justo antes de implementación.
- **Estado:** confirmado como regla de arquitectura, no como prueba de compatibilidad del producto.

### META-OBS-002 — Marketing API Access Tier
- **Hecho consultado:** Meta anunció el 4 de mayo de 2026 que Ads Management Standard Access pasó a llamarse Marketing API Access Tier; las etiquetas son Limited Access y Full Access. La publicación describe 500 llamadas de Marketing API en los últimos 15 días y tasa de error inferior al 15% sobre las últimas 500 llamadas como umbral publicado para calificar al nivel superior.
- **Fuente:** https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/
- **Efecto:** distinguir los permisos/scopes como ads_management del nivel de acceso de Marketing API; el panel debe exponer tier y evidencia de elegibilidad por app. No codificar umbrales como permanentes: comprobar UI/documentación oficial.
- **Confianza:** alta, comunicado oficial; condiciones pueden cambiar.
- **Estado:** confirmado como dato fechado, revalidar antes de solicitar acceso.

### META-OBS-003 — Unified Embedded Signup v4
- **Hecho consultado:** material técnico de Meta del 16 de junio de 2026 describe Embedded Signup v4 como arquitectura unificada para integrar WhatsApp, Messenger e Instagram Direct, y plantea migración desde flujos anteriores v2/v3.
- **Fuente:** https://developers.meta.com/resources/videos/unified-onboarding-whatsapp/
- **Efecto:** evaluar v4 como flujo primario de onboarding; diseñar onboarding como saga/adapter versionado, sin acoplar el dominio a una versión del wizard.
- **Confianza:** alta para el contenido del material; la disponibilidad/eligibilidad real debe probarse en la app y Business Portfolio.
- **Estado:** confirmado como dirección, implementación pendiente.

### META-OBS-004 — Identidad WhatsApp y BSUID
- **Hecho consultado:** material técnico de Meta del 16 de junio de 2026 describe Usernames y Business Scoped User ID (BSUID), que sustituye al teléfono como identificador para usuarios que adoptan nombres de usuario; también explica una regla de visibilidad telefónica de 30 días y nuevos recursos como contact book / REQUEST_CONTACT_INFO.
- **Fuente:** https://developers.meta.com/resources/videos/whatsapp-usernames/
- **Efecto:** el modelo ContactIdentity debe guardar provider-scoped IDs y tipo de identificador; teléfono es atributo opcional con proveniencia/fecha, no primary key. No fusionar BSUID y E.164 sin evidencia fuerte y consentimiento/propósito válido.
- **Confianza:** alta como dirección anunciada por Meta; contratos exactos y disponibilidad por cuenta se verifican durante implementación.
- **Estado:** confirmado como requisito arquitectónico.

### META-OBS-005 — Evolución del modelo de cuentas WhatsApp
- **Hecho consultado:** material técnico de Meta del 16 de junio de 2026 describe separar el modelo previo de WABA en WhatsApp Account (WAAC), asociado a números de teléfono, y Messaging Account (PMA), asociado a plantillas y facturación.
- **Fuente:** https://developers.meta.com/resources/videos/whatsapp-account-model-evolution/
- **Efecto:** no asumir que phone numbers, templates y billing viven siempre bajo un único ID/aggregate. Modelar relaciones entre recursos con provider IDs y tipos explícitos; migrar sin romper WABA legacy.
- **Confianza:** alta como dirección anunciada; verificar rollout y esquema actual por cuenta.
- **Estado:** confirmado como requisito de flexibilidad.

### META-OBS-006 — WhatsApp Marketing Messages API y sunset de marketing sobre Cloud API
- **Hecho consultado:** Meta anunció que los mensajes de marketing enviados por WhatsApp Cloud API se retirarán el **13 de octubre de 2027** y deberán migrar a Marketing Messages API for WhatsApp.
- **Fuente del anuncio oficial:** https://developers.meta.com/resources/blog/ — artículo "Sunsetting Marketing Messages on the Cloud API: Upgrade to the Marketing Messages API for WhatsApp before October 2027".
- **Fuente del material oficial de producto:** https://developers.meta.com/resources/videos/whatsapp-max-pricing/
- **Efecto:** el nuevo producto no debe diseñarse alrededor de enviar marketing por el endpoint antiguo. El sender resolverá por categoría/capability y dirigirá marketing al adapter Marketing Messages API. Crear tarea específica de migración y pruebas de categoría reclasificada.
- **Confianza:** alta para la fecha publicada por Meta; confirmar condiciones y timeline por cuenta antes del despliegue.
- **Estado:** confirmado; deadline futuro de plataforma.

### META-OBS-007 — WhatsApp Max Pricing
- **Hecho consultado:** material Meta del 16 de junio de 2026 describe Max Pricing en Marketing Messages API: un máximo por entrega, cargos reales que pueden ser inferiores, multiplicadores opcionales y estimación de alcance.
- **Fuente:** https://developers.meta.com/resources/videos/whatsapp-max-pricing/
- **Efecto:** cost ledger debe separar estimate, max price/guardrail, provider-reported charge y reconciled amount; no mostrar un máximo como coste final ni codificar tarifas estáticas.
- **Confianza:** alta como capacidad descrita; disponibilidad por región/tenant se valida.
- **Estado:** confirmado como diseño de ledger.

### META-OBS-008 — Política de mensajes WhatsApp
- **Hecho consultado:** la política oficial exige calidad de experiencia, respeto de bloqueos/opt-outs y comunicaciones esperadas; describe el uso de plantillas aprobadas para iniciar mensajes y la necesidad de vías claras de escalamiento en automatización.
- **Fuente:** https://business.whatsapp.com/policy
- **Efecto:** policy engine y suppression ledger son controles de envío obligatorios; chatbot siempre debe tener handoff humano y rutas de soporte adecuadas. Las ventanas y reglas se modelan por canal y versión, no como constante universal.
- **Confianza:** alta como política oficial publicada; puede modificarse.
- **Estado:** confirmado como regla; revisar versión y región al implementar.

### META-OBS-009 — Marketing API tier no equivale a scope
- **Hecho consultado:** Meta aclara que Marketing API Access Tier regula límites y cuotas de la API y es distinto del permiso ads_management.
- **Fuente:** https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/
- **Efecto:** capability registry mantiene separados OAuth scopes, asset tasks/grants, app access tier, elegibilidad de cuenta y policy.
- **Confianza:** alta, fuente oficial.
- **Estado:** confirmado como invariante.

## 2. Hallazgos regulatorios Ecuador

### LEGAL-OBS-001 — LOPDP / RGLOPDP / normativa SPDP
- **Hecho consultado:** la SPDP identifica la LOPDP como norma principal, publicada en Registro Oficial Suplemento 459 de 26 de mayo de 2021; el Reglamento General fue publicado el 13 de noviembre de 2023. La autoridad indica que la normativa secundaria continúa desarrollándose.
- **Fuente:** https://www.spdp.gob.ec/docs/proteccion-de-datos-personales/general/normativa/
- **Efecto:** revisar de forma continua resoluciones y normativa secundaria, no solo la ley base. La plataforma tendrá registro de finalidades/bases, aviso/consentimiento cuando aplique, derechos del titular, contratos responsable-encargado, inventario de subencargados, transferencias, seguridad y retención.
- **Límite:** esta especificación no es asesoría legal ni determina el plazo concreto de conservación o la necesidad de DPD para el caso.
- **Confianza:** alta, autoridad nacional.
- **Estado:** confirmado como marco de control; análisis jurídico del tratamiento aún pendiente.

## 3. Estándares de seguridad y confiabilidad

### SEC-OBS-001 — OWASP ASVS 5.0.0
- **Hecho consultado:** OWASP identifica ASVS 5.0.0 como release estable publicado el 30 de mayo de 2025 y lo define como marco de requisitos de seguridad para aplicaciones web y servicios.
- **Fuente:** https://asvs.owasp.org/
- **Efecto:** usar ASVS 5.0.0 como catálogo verificable de controles en diseño, implementación y pruebas. Objetivo base: nivel 2 donde aplique a la aplicación; controles de riesgo alto/privilegiado se elevan por threat model. Registrar requisito ASVS, test y evidencia.
- **Confianza:** alta, fuente oficial OWASP.
- **Estado:** baseline adoptada.

### SRE-OBS-001 — SLI/SLO y error budget
- **Hecho consultado:** Google SRE diferencia SLI (indicador medido), SLO (objetivo) y SLA (acuerdo con consecuencias). Recomienda definir métricas desde experiencia de usuario, usar percentiles para distribuciones de latencia y evitar promedios aislados.
- **Fuente:** https://sre.google/sre-book/service-level-objectives/
- **Efecto:** no publicar un SLA cuando solo existe un SLO interno. Usar p50/p95/p99, separar operaciones exitosas y fallidas, medir latencia cliente y backend, declarar ventanas, denominadores y exclusiones.
- **Confianza:** alta como práctica técnica de SRE.
- **Estado:** baseline adoptada.

### SRE-OBS-002 — Coste de disponibilidad
- **Hecho consultado:** la tabla de Google SRE establece que 99.9% permite 43.2 minutos de indisponibilidad mensual y 99.95% permite 21.6 minutos/mes, bajo el supuesto de downtime temporal y sin mantenimiento planificado.
- **Fuente:** https://sre.google/sre-book/availability-table/
- **Efecto:** los objetivos de disponibilidad no son etiquetas gratuitas; exigen redundancia, restore drills y coste. El target de 99.9% no puede publicarse con un único VPS sin HA como si fuera garantizado.
- **Confianza:** alta para la aritmética de la tabla; no es una medición de WhatsBusiness.
- **Estado:** adoptado como criterio de dimensionamiento.

## 4. Decisiones técnicas derivadas de la evidencia

1. API adapters por producto/versión; no una versión Meta global.
2. Catálogo de capabilities basado en scope + asset grant/task + access tier + versión + elegibilidad y policy.
3. Modelo de identidad independiente del teléfono; BSUID y otros IDs son tipos explícitos, provider-scoped.
4. Asset graph capaz de representar cuentas WAAC/PMA y estructuras previas.
5. Onboarding desacoplado y versionado, preparado para Embedded Signup v4.
6. Marketing Messages API como integración directa de marketing WhatsApp, con migración y sunset tracker.
7. Cost ledger con tarifas versionadas, máximos, estimaciones, coste informado y conciliación.
8. Reglas de retención y derechos como workflow de datos, no borrado improvisado en una tabla.
9. ASVS 5.0.0 y pruebas de tenant isolation como criterios de seguridad.
10. SLI/SLO documentados con denominadores, percentiles, periodo y error budget; ningún SLA sin aprobación comercial.

## 5. Protocolo de actualización de investigación

- Antes de cada integración: revisar documentación oficial, changelog y políticas del producto Meta.
- Antes de release: revisar versiones disponibles, deprecaciones y fechas efectivas.
- Automatizar recordatorios/revisión mensual del catálogo cuando se implemente la operación; no asumir que una búsqueda de hoy sustituye la validación de cuenta real.
- Guardar snapshots sanitized de docs/contracts, versión consultada, fecha, app mode, permiso y resultado de cuenta.
- La señal externa se promueve a decisión solo cuando la evidencia es oficial o corroborada; cada cambio crea CR/ADR/TASK y actualiza docs/01, docs/09, backlog y tests.
- No almacenar tokens, identificadores personales reales, conversaciones ni payloads sensibles en el registro de investigación.


## 6. Market evidence — Ecuador (INEC, corte 2026-11-06)

### MKT-OBS-001 — Registro Estadístico de Empresas REEM 2025
- **Fuente oficial:** INEC, Principales Resultados REEM 2025, publicado abril de 2026: https://www.ecuadorencifras.gob.ec/documentos/web-inec/Estadisticas_Economicas/Registro_Empresas_Establecimientos/2025/Semestre_I/Principales_Resultados_REEM_2025.pdf
- **Página/slide:** “Cobertura”, “Conformación del REEM 2025”, “Evolución del número de empresas” y “Dinámica empresarial según sector/tamaño”.
- **Hecho:** 1.204.276 empresas en base provisional 2025; 1.196.545 en base definitiva 2024.
- **Hecho adicional:** 2025 provisional registra alrededor de 645,8 mil empresas de servicios y 388,9 mil de comercio. Sumadas: 1.034,7 mil, equivalentes a aproximadamente 85,9% de las 1.204.276 unidades REEM (cálculo derivado de cifras del gráfico/tablas de INEC). Entre 2024 y 2025 la variación publicada fue +3,2% en servicios y -4,4% en comercio.
- **Composición que limita la interpretación:** 50,2% de las 1.204.276 unidades (604.993) corresponde al grupo RIMPE 2024 que no reporta ventas ni plazas de empleo registradas en el IESS en la clasificación de esa base; 37,4% está asociado a plazas de empleo registrado 2025, 7,2% a ventas y empleo en actividades productivas, 4,3% a ventas 2024 y fracciones menores a otros grupos.
- **Metodología:** la base 2025 es provisional y combina registros 2024 (ventas, RIMPE, comercio exterior) con plazas de empleo IESS 2025. INEC indica que el aumento de empresas desde 2022 se vio afectado por la obligatoriedad del RIMPE y no debe interpretarse como creación neta equivalente de empresas.
- **Confianza:** alta para cifras oficiales y definiciones; provisionalidad y metodología deben acompañar cualquier uso.
- **Efecto en PD-012:** servicios y comercio son un foco razonable para discovery por peso sectorial. No convertir los 1,034,700 registros en TAM/SAM/SOM ni clientes alcanzables; excluir/segmentar informalidad, actividad, capacidad de pago, uso real de Meta, necesidad y elegibilidad.
- **Estado:** confirmado como base contextual; disposición a pagar y demanda del producto no medidas.

### MKT-OBS-002 — Indicadores TIC nacionales, no empresariales
- **Fuente oficial:** INEC, TIC 2025: https://www.ecuadorencifras.gob.ec/tecnologias-de-la-informacion-y-comunicacion-tic/
- **Hecho:** en julio de 2025, 80,1% de personas de 5 años o más utilizó internet en los últimos 12 meses; 71,3% de hogares reportó acceso a internet.
- **Límite:** son indicadores de personas/hogares, no de adopción digital de empresas ni del uso comercial de WhatsApp/Meta. No usarlos como tasa de adopción del ICP.

### MKT-OBS-003 — ENESEM 2024, TIC y medios de comunicación empresarial
- **Fuente oficial — resultados ENESEM 2024:** INEC, “Encuesta a Empresas”: https://www.ecuadorencifras.gob.ec/encuesta-a-empresas/
- **Fuente oficial — formulario 2024:** https://www.ecuadorencifras.gob.ec/documentos/web-inec/Estadisticas_Economicas/Encuesta_Estructural_Empresarial/2024/2024_ENESEM_Formulario.pdf
- **Fuente oficial — diccionario TIC y microdatos:** https://anda.inec.gob.ec/anda5/index.php/catalog/1325/data-dictionary/F79?file_name=2024_ENESEM_BDD_TIC
- **Hecho:** ENESEM 2024 informa 17.325 empresas grandes y medianas. El cuestionario empresarial pregunta por medios de comunicación utilizados con clientes/proveedores, incluidos servicios de mensajería (ejemplos: SMS y WhatsApp) y redes sociales; también recoge Internet, comercio electrónico y obstáculos.
- **Alcance:** el universo publicado corresponde a empresas grandes y medianas; no es una muestra representativa de micro y pequeñas empresas y no debe extrapolarse a ellas.
- **Uso permitido:** diseñar variables y preguntas de entrevista para el discovery; contrastar definiciones empresariales de canal y comercio electrónico.
- **Uso prohibido:** afirmar un porcentaje nacional de PYMES que usa WhatsApp, estimar demanda de WhatsBusiness o disposición a pagar con esta fuente sin la tabla/variable/denominador apropiados.
- **Confianza:** alta para el universo y la existencia de preguntas del cuestionario; limitada para inferir adopción específica de WhatsApp en el ICP primario.
- **Estado:** evidencia de instrumento y marco de grandes/medianas; no sustituye el trabajo de campo de US-028.

### MKT-OBS-004 — TIC Empresas INEC, antecedente histórico
- **Fuente oficial:** https://www.ecuadorencifras.gob.ec/tecnologias-de-la-informacion-y-comunicacion-empresas/
- **Hecho:** la página pública accesible en el corte presenta resultados de TIC de empresas obtenidos de Encuestas Industriales 2015.
- **Límite:** la antigüedad y cobertura de esa operación no representan la adopción digital empresarial de 2026. No usar sus porcentajes como parámetro actual de SAM o SOM.
- **Uso permitido:** referencia histórica y orientación de categorías.
- **Estado:** no se utiliza como evidencia cuantitativa vigente para el ICP.

### Implicaciones de producto/mercado
1. Priorizar flujos para pequeños equipos de servicios y comercio: onboarding simple, Inbox, CRM liviano, multiusuario, plantillas y seguimiento de leads.
2. Hacer que agencias sean canal secundario con partner access explícito y multiempresa.
3. Diseñar onboarding y operación de bajo costo para microempresas, pero probar la disposición a pagar antes de fijar precio por seats/usage.
4. Segmentar por actividad real, señales de contacto/conversación, ventas, número de agentes y madurez digital; no solo por tamaño INEC.
5. No usar cifras macro del REEM para proyecciones de ingresos, market share o unit economics.

### TASK-066 — validación de ICP y product-market evidence
Antes de cerrar pricing/packaging y comprometer inversión comercial, realizar discovery cualitativo con negocios de servicios, comercio y agencias; recoger job-to-be-done, canal actual, volumen, fricciones, decisor, alternativas, willingness-to-pay y criterios de compra. Complementar con pilotos instrumentados. El tamaño de muestra y los resultados deben documentarse como investigación exploratoria, no como inferencia estadística salvo diseño muestral representativo.


## 7. Meta Ads AI, agentic tools and campaign learning (2026-11-06)

### META-OBS-010 — Andromeda next-generation retrieval
- Source: Meta Engineering, 2026-10-28, https://engineering.fb.com/2026/10/28/ml-applications/meta-andromeda-next-gen-ads-retrieval-gpu-co-design/
- Findings: Andromeda is the first-stage personalized ads retrieval system; it narrows eligible ad candidates before later ranking. Meta describes the 2026 system as processing >1B ads/sec, a 100x uplift relative to its 2024 system, and reports 2.4% conversion contribution on Facebook since 2025. New retrieval MoE uses sequential engagement, cohort, LLM-derived semantic and cross-surface co-engagement signals.
- Limits: performance figures are Meta-reported and not independent benchmarks or advertiser guarantees. Andromeda retrieval/ranking internals are not a public advertiser API.
- Design: improve eligibility, creative diversity, campaign objective quality, signal quality and controlled experiments. Never claim direct control of Andromeda score or ranking.
- State: confirmed as Meta Engineering description; API access to internals not available/documented.

### META-OBS-011 — GEM central ads recommendation model
- Source: Meta Engineering, 2026-10-13, https://engineering.fb.com/2026/10/13/ml-applications/generative-ads-model-gem-scaling-frontier-ads-ai/
- Findings: Meta describes 2026 GEM as a central foundation model learning signals across ad surfaces/objectives, rather than isolated models by domain. Meta reports +18.9% conversions and +12% CTR across surfaces/objectives, with additional targeted improvements.
- Limits: Meta's internal aggregated/model results are not guaranteed advertiser uplift.
- Design: CAPI/CRM event quality and full-funnel outcomes become strategic; separate platform attribution from business outcomes and incrementality.

### META-OBS-012 — Ads Creative Studio, conversational campaign assistant and Ads MCP
- Source: Meta, Advertising Week New York, 2026-10-06, https://about.fb.com/ltam/news/2026/10/advertising-week-new-york-2026-nuevas-capacidades-de-ia-para-guiar-campanas-y-llegar-a-los-clientes/
- Findings: Meta reports wider Ads Creative Studio rollout, business assistant memory/context, experiments with campaign creation/creative generation/targeting/budget changes, scheduled tasks and alerts. Meta Ads MCP for large advertisers/agencies supports uploading/previewing creatives and detailed performance views; agent work is staged as a draft in Ads Manager and publication requires explicit approval.
- Further features: AI audience discovery in natural language announced for Detailed Targeting; Customer Lifecycle Strategy available to advertisers for acquisition vs existing customer distinction; Advantage+ Creative can create video from static assets; Ads Creative Studio can generate and edit video concepts/hooks/audio/duration/subtitles.
- Limits: rollout, beta, eligible ad accounts, country and API scope may differ. Validate availability per account/region/version.
- Design: first-class draft/preview/approval flow, creative insights, audience lifecycle, MCP adapter behind our own approval gateway.

### META-OBS-013 — Advantage+ Creative / Performance Recommendations sample architecture
- Source: Meta-owned public incubator catalogue solution sample, https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/creative/ai-creative-enhancer.md
- Findings: the solution composes Business Management API, Advantage+ Creative API, Ads API, Ad Previews API and Ads Performance Recommendations API. It references CREATIVE_LIMITED and CREATIVE_FATIGUE recommendations; opt-in/opt-out of creative AI features; preview and eligible-feature validation; AI-feature-created ads are paused for review before activation in the sample.
- Limits: incubator solution is an example architecture, not a versioned normative API contract. Validate current Marketing API docs, scopes, version and eligibility before use.
- Design: recommendation-driven creative refresh, paused-first, preview by placement, human approval and undo.

### META-OBS-014 — Campaign learning / fragmentation
- Source: Meta developer learning material, updated 2026-04-08, https://developers.meta.com/vr/resources/optimize-ad-campaign/
- Findings: Meta says learning occurs at ad set level and stabilizes with minimum around 50 optimization events over a 7-day period; too many overlapping ad sets can cannibalize event collection; edits may trigger a new learning period; Meta suggests avoiding significant changes and acknowledges trade-off when bundling multiple changes.
- Limits: the 50-event guidance is contextual to an objective/event and must not be imposed as a universal threshold for every campaign type or low-volume tenant. The full significant-edit help page may require authenticated access.
- Design: monitor learning status and event sample; consolidate overlapping ad sets; protect mature winners; isolate tests and avoid several uncontrolled edits.

### META-OBS-015 — The 20% rule is not a universal Meta budget-increase rule
- Sources: Meta Business Help Center "About Ad Set Budget Sharing" (https://www.facebook.com/business/help/1388266028979935) and Meta learning guide above.
- Finding: Meta's Ad Set Budget Sharing feature may share up to 20% of daily budget across ad sets under supported campaign settings. This is budget redistribution, not a universal limit on budget increase. Meta learning documentation says adjustments can trigger a learning period but does not publish a universal "20% increase" threshold in the source reviewed.
- Secondary cross-check: https://zephraai.com/guides/meta-ads-budget-guide (2026-09-16) reports Meta's significant-edit wording treats budget changes as depending on magnitude rather than a fixed percentage; use only as secondary interpretation.
- Decision: PD-024 imposes WhatsBusiness +20% per operation and +20% cumulative rolling-24h cap by owner instruction. Never attribute it to Meta or promise it prevents all learning resets.

### META-OBS-016 — Meta Business Agent Platform
- Sources: Meta Newsroom 2026-06-03 https://about.fb.com/news/2026/06/meta-business-agent/ and AI at Meta https://ai.meta.com/meta-business-agent/platform/
- Findings: Meta Business Agent is a customer-facing AI assistant; Meta Business Agent Platform is infrastructure to build/customize/deploy agents with connectors to CRM/order management, conversation context/memory, guardrails/measurement and human handoff. Meta's June announcement described capabilities across WhatsApp/Messenger/Instagram and >1M businesses using an agent at that date; AI at Meta platform page currently describes WhatsApp and Instagram support, so exact channel availability must be checked.
- Design: support interoperability, shared conversation ownership/handoff, agent identity/provenance, connector permissions, audit and no double responses.
- Limits: business eligibility, channel rollouts, pricing and access for Ecuador remain to be verified. Meta states a global per-message rate encompassing AI processing and delivery on its platform page; don't hardcode price or availability.

### META-OBS-017 — Social Technologies MCP
- Source: Meta for Developers, News for Developers, https://developers.meta.com/resources/blog/ (announcement dated 2026-10-26; deep link referenced on the page).
- Finding: MCP allows AI agents to create/configure Social Technologies developer apps, link Business Portfolios and add use cases such as WhatsApp Business Messaging.
- Design: possible developer onboarding/provisioning tool, not a runtime campaign or messaging transport. Require human owner approval, explicit app/portfolio selection, least privilege and audit before provisioning/permission changes.
- Limits: availability, supported operations and required auth are revalidated in live developer portal; do not infer production access.

### META-OBS-018 — Ads audience per creative
- Source: Meta for Developers News, https://developers.meta.com/resources/blog/ (announcement "Choose an Audience for Each Ad Creative", current 2026 news feed).
- Finding: advertiser can choose a specific audience for each ad creative inside one ad set, including age/gender settings, subject to feature eligibility.
- Design: add capability descriptor for per-creative audience targeting and preserve ad-level audience policy; don't assume feature enabled or universally available.

### META-OBS-019 — WhatsApp policy and automated handoff
- Source: WhatsApp Business Policy, https://whatsappbusiness.com/policy/
- Findings: opt-in/opt-out respect, message templates outside the service window when required, and prompt/clear human escalation when automations operate in the 24-hour service window.
- Design: channel policy/consent at send time; handoff SLA; pause bots when human/Meta agent owns the thread.

## 8. Reference-project research records

The current commit, files sampled, findings and no-go conclusions are documented in [35-REFERENCE-PROJECTS-TECHNICAL-BENCHMARK.md](35-REFERENCE-PROJECTS-TECHNICAL-BENCHMARK.md).
- REF-CHATWOOT: account-scoped inbox/channel polymorphism, conversation/message state, Redis round-robin, automation pending execution lock/reclaim, webhooks/jobs and AI support.
- REF-TWILIO: provider SDK generated resource models, pagination, retries, typed errors, webhook validation, region/edge and credential boundaries.
- REF-HTTPSMS: Android device gateway, FCM queue, 202 accepted vs delivered, expiry, backpressure and E2E test with emulator.
- REF-ANDROID-SMS-GATEWAY: device/SIM registration, local/cloud, multi-device, MMS, scheduling, working hours and webhook.
- REF-OPENWA: browser/WhatsApp Web automation, Easy API, SocketClient, plugin SDK and MCP patterns. It is unofficial and explicitly disclaims Meta affiliation; do not ship or rely on it for WhatsBusiness transport.

## 9. Evidence promotion rules
- Meta statements are time-stamped and marked Meta-reported; no vendor uplift becomes a WhatsBusiness forecast.
- Beta/rollout features are recorded as capability watch, never promised to each tenant.
- API sample repositories do not replace normative API docs.
- Budget 20% is owner guardrail PD-024, not Meta policy.
- Andromeda/GEM are internal delivery systems; no claims of direct control or queryable internal score.
- Reference repository conclusions are based on inspected files, not full security/performance audits.


### META-OBS-020 — Original Andromeda launch and Advantage+ creative-pool interaction
- Source: Meta Engineering, 2024-12-02, https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/
- Findings: Andromeda retrieval selects a smaller set from tens of millions of ad candidates before ranking. Meta described Advantage+ automation of audience creation, budget allocation, placements and creative generation as increasing the eligible ad pool. The launch article reported +6% retrieval recall and +8% ad quality on selected segments and stated a future direction toward more diverse retrieved candidates.
- Limits: historical system and selected-segment results; do not apply the 2024 uplift as a current guarantee or forecast. The 2026 system supersedes architecture specifics.
- Design: Creative Lab should create meaningful variation in concept/visual/hook/offer/format and track diversity, but not maximize number of ads at the expense of quality or spend fragmentation.
- State: Meta-public technical history, promoted as design context.

### META-OBS-018 — Messenger Page tasks, permisos y ventana estándar (2026-11-08)

- **Fuente oficial — Conversations API:** Meta Postman Messenger Platform API, https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a
- **Hallazgo:** Page access token solicitado por persona con tarea \`MESSAGING\` o \`MODERATE\`; permisos para Messenger Conversations API: \`pages_manage_metadata\`, \`pages_read_engagement\`, \`pages_messaging\`. Advanced Access es necesario con personas sin rol en app, Page, negocio o cuenta relacionada.
- **Fuente oficial — Send API:** Meta Postman Messenger Platform API, https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api
- **Hallazgo:** Page access token solicitado por persona con tarea \`MESSAGE\`, permiso \`pages_messaging\`, y destinatario que haya iniciado conversación en las últimas 24 horas o aceptado explícitamente recibir mensajes fuera de ventana.
- **Diseño:** requisitos separados por operación; Page tasks OR se evalúa como OR real, token Page no se intercambia por User token, Advanced Access se comprueba aparte y ventana usa el último evento entrante confiable.
- **Límite:** sin evidencia de scopes/grants reales, App Review, Advanced Access, versión soportada para la conexión WhatsBusiness ni conformance de cuenta. No extrapolar scopes a publicación/moderación/insights. Duración/eligibilidad Human Agent no se calcula; el policy exige deadline server-side fiable y queda inactivo hasta verificar provider runtime.
- **Estado:** documentación oficial revisada; policy-domain implementada; app/cuenta no probadas, sin efectos externos.
