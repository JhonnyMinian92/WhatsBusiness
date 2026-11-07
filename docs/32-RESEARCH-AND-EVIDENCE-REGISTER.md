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

### Implicaciones de producto/mercado
1. Priorizar flujos para pequeños equipos de servicios y comercio: onboarding simple, Inbox, CRM liviano, multiusuario, plantillas y seguimiento de leads.
2. Hacer que agencias sean canal secundario con partner access explícito y multiempresa.
3. Diseñar onboarding y operación de bajo costo para microempresas, pero probar la disposición a pagar antes de fijar precio por seats/usage.
4. Segmentar por actividad real, señales de contacto/conversación, ventas, número de agentes y madurez digital; no solo por tamaño INEC.
5. No usar cifras macro del REEM para proyecciones de ingresos, market share o unit economics.

### TASK-066 — validación de ICP y product-market evidence
Antes de cerrar pricing/packaging y comprometer inversión comercial, realizar discovery cualitativo con negocios de servicios, comercio y agencias; recoger job-to-be-done, canal actual, volumen, fricciones, decisor, alternativas, willingness-to-pay y criterios de compra. Complementar con pilotos instrumentados. El tamaño de muestra y los resultados deben documentarse como investigación exploratoria, no como inferencia estadística salvo diseño muestral representativo.
