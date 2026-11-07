# 34 — Meta Ads AI, Andromeda, GEM y evolución de la plataforma

**Corte de investigación:** 2026-11-06  
**Estado:** investigación documentada; cada feature/version/permiso requiere validación en la app y cuenta reales al implementar.  
**Objetivo:** diseñar WhatsBusiness para el ecosistema de anuncios, mensajes y agentes de Meta que está evolucionando hacia automatización y optimización basadas en IA.

## 1. Conclusión ejecutiva

Meta está moviendo el producto publicitario en cuatro direcciones:
1. Más automatización de campañas, audiencias, ubicaciones y optimización mediante Advantage+ y herramientas de negocio con IA.
2. Más diversidad creativa con generación de imágenes/vídeos y análisis de desempeño por concepto, formato y variación.
3. Sistemas centrales de recomendación como GEM y recuperación como Andromeda que pueden aprender señales entre superficies y objetivos.
4. Agentes de negocio capaces de conversar, recomendar, calificar leads, ejecutar acciones conectadas a sistemas empresariales y derivar a humanos.

WhatsBusiness debe operar en dos planos complementarios:
- **Meta Delivery Plane:** la plataforma Meta selecciona, recupera, rankea y entrega anuncios elegibles usando sus modelos propietarios. WhatsBusiness no controla sus parámetros internos.
- **WhatsBusiness Intelligence Plane:** nuestra plataforma aprende de las métricas de Meta y, sobre todo, de resultados reales del negocio (lead calificado, venta, ingreso, margen, devolución), propone nuevas hipótesis/creativos y ejecuta experimentos controlados con guardrails.

No vender la idea de que podemos "programar Andromeda". La ventaja de WhatsBusiness será alimentar el sistema con buenos objetivos, señales lícitas, creatividades diversas, decisiones auditables y resultados offline/CRM de mejor calidad.

## 2. Andromeda: qué es y qué no es

### Qué documentó Meta
- Meta Engineering publicó el 28 de octubre de 2026 una actualización de Andromeda.
- Andromeda es el motor de retrieval personalizado al inicio del funnel de recomendación publicitaria: reduce un conjunto enorme de anuncios elegibles a candidatos que luego pasan por ranking.
- Meta afirma procesar más de mil millones de anuncios por segundo a nivel de retrieval, un incremento de 100x frente a su sistema 2024.
- Meta afirma que Andromeda ha contribuido a un aumento de 2,4% en conversiones en Facebook desde 2025.
- La arquitectura 2026 usa retrieval Mixture-of-Experts y señales como interacción secuencial con anuncios, cohortes, features semánticas derivadas de LLM y co-engagement entre superficies.
- El trabajo de Meta co-diseña modelo, índices y GPU; las decisiones de retrieval/ranking son infraestructura propietaria de Meta.

**Fuentes:**  
- Meta Engineering, 2026-10-28: https://engineering.fb.com/2026/10/28/ml-applications/meta-andromeda-next-gen-ads-retrieval-gpu-co-design/
- Andromeda 2024: https://engineering.fb.com/2024/11/12/production-engineering/meta-andromeda-ai-ads-recommendation-system/

### Implicaciones para WhatsBusiness
- Una campaña no puede controlar Andromeda; puede controlar su elegibilidad, el objetivo de optimización, el presupuesto, los parámetros autorizados y la variedad/calidad de anuncios que aporta.
- Crear un conjunto limitado de anuncios casi idénticos no es verdadera diversidad. Hay que cubrir hipótesis de valor, ángulos, hooks, formatos, escenas, productos y CTAs distintos.
- La nueva creatividad debe pasar revisión de marca/política, preview y prueba antes de activar. No convertir generación IA en publicación masiva automática.
- Evitar fragmentar audiencias en demasiados ad sets. Meta indica que el aprendizaje sucede a nivel de ad set; conjuntos solapados se pueden canibalizar en la recolección de eventos.

## 3. GEM: el modelo central de recomendación

Meta Engineering publicó el 13 de octubre de 2026 la evolución de GEM:
- Pasa de optimizaciones aisladas por dominio/superficie a un modelo foundation central que aprovecha datos y señales de todo el ecosistema de anuncios.
- Meta informa 18,9% de mejora de conversiones y 12% de mejora en CTR a través de superficies y objetivos; también reporta contribuciones segmentadas en Facebook, Instagram y conversiones off-site.
- Son resultados internos reportados por Meta; no son uplift garantizado para una cuenta anunciante ni un benchmark transferible a WhatsBusiness.

**Fuente:** https://engineering.fb.com/2026/10/13/ml-applications/generative-ads-model-gem-scaling-frontier-ads-ai/

### Diseño derivado
- Configurar objetivos y eventos consistentes con el negocio; no optimizar por clic barato cuando el valor es una venta rentable.
- Integrar CRM y CAPI con eventos de calidad, con timestamp, provenance, event_id, event_name y consentimiento/propósito válido.
- Separar métricas de plataforma (impressions, clicks, results, spend, CPM, CTR, CPA, ROAS reportado) de outcomes internos (lead válido, lead calificado, oportunidad, venta, ingreso neto, margen, devolución).
- Evaluar conversiones incrementales con holdout/split tests cuando la escala y herramientas disponibles lo permitan. ROAS atribuido no equivale a causalidad.

## 4. Advantage+, Ads Creative Studio y recomendaciones

Meta informó el 6 de octubre de 2026:
- Ads Creative Studio se amplía para mostrar insights de desempeño creativo y convertir aprendizajes en conceptos nuevos.
- El asistente de Meta AI para anunciantes recibe más contexto/memoria del negocio y prueba creación/planeación/optimización de campañas, generación creativa, actualización de segmentación, cambios de presupuesto, tareas programadas y alertas.
- Para anunciantes/agencias, el Meta Ads MCP permite subir creativos, previsualizar anuncios, observar tendencias y análisis; el trabajo de agentes llega como borrador al Ads Manager, con aprobación explícita antes de publicación.
- Audience discovery con IA en lenguaje natural está anunciado como despliegue futuro para Detailed Targeting.
- Customer Lifecycle Strategy se abre a anunciantes para priorizar adquisición de nuevos clientes y excluir clientes existentes mediante audiencias.
- Advantage+ Creative puede generar vídeo desde recursos estáticos; Ads Creative Studio puede crear conceptos/variantes y editar hooks, audio, duración, texto, subtítulos y finales; catálogo puede convertir imágenes de producto en vídeos en cohortes elegibles.

**Fuente:** https://about.fb.com/ltam/news/2026/10/advertising-week-new-york-2026-nuevas-capacidades-de-ia-para-guiar-campanas-y-llegar-a-los-clientes/

### API / muestra de solución de Meta
El repositorio público facebookincubator/catalogue-of-api-solutions describe un ejemplo de AI Creative Enhancer que combina:
- Business Management API para descubrir ad accounts.
- Advantage+ Creative API para opt-in/opt-out de features creativas.
- Ads API para leer/escribir ads y creatives.
- Ad Previews API para revisar el render.
- Ads Performance Recommendations API para recomendaciones de campañas/anuncios.

El ejemplo identifica recomendaciones CREATIVE_LIMITED y CREATIVE_FATIGUE. También documenta que, si una feature opt-in usa generación IA, el anuncio debe crearse PAUSED, revisarse/preview y solo después pasar a ACTIVE. Incluye reversión/undo.

**Fuente de referencia (muestra, no contrato API):**  
https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/creative/ai-creative-enhancer.md

**Regla de integración:** usar estos endpoints únicamente tras validar documentación normativa, versión, permisos, elegibilidad y respuesta real. El repositorio de muestras no sustituye el changelog/Graph API reference.

## 5. Nuevas herramientas agénticas de Meta

### Meta Ads MCP
Meta anunció en octubre de 2026 flujos adicionales en Ads MCP para subir creativos, previsualizar anuncios, consultar tendencias y preparar borradores en Ads Manager. Las operaciones requieren permisos del anunciante y aprobación explícita antes de publicar.

**Implicación:** WhatsBusiness debe tener un modelo interno de acciones/agentes compatible con MCP y otros tool protocols, pero no hacer que el LLM escriba directamente en Marketing API. Toda acción pasa por policy engine, draft, preflight, approval y audit.

### Social Technologies MCP
Meta anunció una herramienta MCP para que un agente pueda crear/configurar una app de Social Technologies, vincular Business Portfolios y activar use cases como WhatsApp Business Messaging.

**Implicación:** evaluar su utilidad para developer onboarding y operaciones de app configuration. No conceder privilegios de app owner o producción a agentes sin revisión humana; el MCP es una herramienta de provisioning y no debe confundirse con una API de campañas en runtime.

**Fuente:** Meta for Developers, News for Developers: https://developers.meta.com/resources/blog/

### Meta Business Agent Platform
Meta anunció el 3 de junio de 2026:
- Meta Business Agent para responder preguntas, recomendar productos, reservar citas, calificar leads, permitir handoff humano y ayudar a cerrar ventas.
- Business Agent Platform para construir, personalizar y desplegar agentes, conectando CRM/order management y otros sistemas.
- Meta comunicó más de un millón de empresas usando agentes en WhatsApp/Messenger en ese momento, cifra autodeclarada por Meta.
- AI at Meta describe APIs/infra para agentes en WhatsApp e Instagram, memoria/contexto, conectores y handoff humano; página de producto menciona cobro global por mensaje que combina procesamiento IA y entrega. No asumir disponibilidad, canales exactos, precio ni acceso en Ecuador sin comprobar la cuenta.

**Fuentes:**  
- https://about.fb.com/news/2026/06/meta-business-agent/
- https://ai.meta.com/meta-business-agent/platform/

### Decisión de producto
WhatsBusiness debe:
- Mantener su propia capa de CRM, orchestration, policy, inbox, ledger y auditoría.
- Permitir interoperar con Business Agent donde la elegibilidad lo permita.
- Evitar respuestas dobles mediante un único conversation ownership/agent lease, suppress echoes, bot/human handoff y dedupe.
- Registrar el agente de origen (WhatsBusiness, Meta Business Agent, partner, humano) y la acción realizada.
- Importar contexto de CRM con scopes mínimos y consentimientos válidos; no duplicar o exponer conversaciones a modelos externos sin autorización.

## 6. Aprendizaje de campaña: lo que Meta enseña

Meta mantiene aprendizaje por ad set y explica que suele estabilizarse al alcanzar al menos 50 eventos de optimización en siete días. Meta también advierte:
- demasiados ad sets con targeting solapado pueden canibalizar datos y hacer más lento el aprendizaje;
- cambiar el ad set puede iniciar un nuevo periodo de aprendizaje;
- mantener cambios menores y evitar edits significativos ayuda a preservar aprendizajes;
- agrupar cambios reduce múltiples periodos de aprendizaje, pero dificulta atribuir qué cambio causó el resultado.

**Fuente:** https://developers.meta.com/vr/resources/optimize-ad-campaign/

No interpretar las 50 acciones como número mágico para todos los objetivos. El evento optimizado y la calidad de la señal importan; en cuentas de bajo volumen se requiere un modelo de prueba más conservador.

## 7. Regla del 20%: evidencia y decisión

**No encontré una regla pública universal de Meta que diga que aumentar cualquier presupuesto más de 20% haga caer los resultados o siempre reinicie el aprendizaje.**

Hay dos conceptos distintos:
1. Meta publica una función de Ad Set Budget Sharing que puede compartir hasta 20% del presupuesto diario entre ad sets en determinadas configuraciones. No es un límite de aumento del presupuesto de campaña.
2. Meta describe que cambios presupuestarios pueden o no ser significativos según su magnitud; la ayuda de cambios significativos puede ser inaccesible sin sesión. No fija un porcentaje universal en las fuentes revisadas.

**Decisión de WhatsBusiness por instrucción del propietario:** imponer como política de seguridad un máximo de +20% de aumento automático por cada acción y como máximo +20% acumulado en una ventana móvil de 24 horas, calculado sobre el presupuesto de referencia al inicio de esa ventana. Es una regla propia y más conservadora, no una afirmación atribuida a Meta. Si Meta publica un umbral diferente, mantenemos el guardrail salvo nueva autorización del propietario.

Fuentes de contraste:
- Meta Business Help Center: About Ad Set Budget Sharing (referencia consultada; contenido puede requerir sesión).
- Meta learning guide: https://developers.meta.com/vr/resources/optimize-ad-campaign/
- Meta Significant Edits help URL: https://www.facebook.com/business/help/316478108955072 (requiere login al abrirse; revalidar contenido al implementar).

## 8. Políticas y salud del canal

La política de WhatsApp Business (actualizada por Meta) exige consentimiento/opt-in apropiado, respeto inmediato a opt-outs, uso de plantillas aprobadas para iniciar conversaciones cuando corresponde y vías de escalamiento humano cuando un agente automatizado se usa dentro de la ventana de servicio de 24 horas.

**Fuente:** https://whatsappbusiness.com/policy/

El optimizador debe vigilar también salud de cuenta, calidad, rechazados, frecuencia, gasto inesperado, restricciones, opt-outs y calidad de leads. No se debe escalar por ROAS aparente si la calidad de conversación o el feedback del usuario empeoran.

## 9. Proyección tecnológica 2026–2028

### Alta confianza: ya publicado/anunciado
- Más centralización de modelos de recomendación (GEM) y retrieval (Andromeda).
- Más diversidad creativa y automatización de formatos con Advantage+ Creative / Ads Creative Studio.
- Business Agent y Meta Agent Platform para mensajería y operaciones conversacionales.
- MCP para flujos de developer onboarding y publicidad.
- Más dependencia de eventos de calidad del anunciante y de conexiones CRM/CAPI.

### Probable, pero debe tratarse como roadmap/inferencia
- Agentes de negocio con más memoria contextual, herramientas y acciones transaccionales.
- Mayor automatización de setup, creative optimization, audience discovery y seguimiento presupuestario.
- Separación creciente entre control de negocio propio (CRM/commerce/policy) y optimización de entrega en Meta.
- Nuevos mecanismos de descubrimiento de businesses/agents y perfiles de catálogo.

### Desconocido / no prometer
- Qué APIs de agentes llegarán a todas las cuentas y países, su pricing, límites y fecha general.
- Qué señales internas exactas alimentan GEM/Andromeda para cada vertical.
- Que una API exponga el score de retrieval/ranking o permita control directo de Andromeda.
- Que un porcentaje de budget edit garantice mantener learning o CPA.
- Uplift garantizado por Advantage+, AI creatives, GEM, CAPI o recomendaciones.

## 10. Acciones de producto

1. Crear Campaign Intelligence con loop de datos Meta + CRM/CAPI.
2. Crear Creative Lab para variedad semántica y visual, aprobación de marca y pruebas controladas.
3. Crear Guarded Budget Optimizer con cap +20% por acción y por ventana 24h.
4. Añadir API capability registry específico para Ads API, Advantage+ Creative, Previews, Performance Recommendations, Marketing API tier, Ads MCP y features por creative.
5. Mantener ganador estable y probar nuevas creatividades en células de test aisladas; no alterar ad sets que están aprendiendo sin razón y aprobación.
6. Incorporar señales post-click/offline de CRM: qualified lead, opportunity, purchase, revenue net/gross margin, refund/cancellation.
7. Mantener CAPI event pipeline con dedupe, consent, timestamps, event source, data minimization, diagnostics y replay seguro.
8. Interoperabilidad de agentes con handoff y ownership único de conversación.
9. Vigilar cambios de API, políticas, creative features, delivery y pricing con fecha y cuenta verificada.
10. Tratar las sugerencias de Meta como recomendaciones a evaluar, no órdenes automáticas.

