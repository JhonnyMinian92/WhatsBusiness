# 00 — Contexto del producto

## 1. Identidad
- Producto: WhatsBusiness / microservices-meta-ecuapp.
- Repositorio: `JhonnyMinian92/WhatsBusiness`.
- Propósito: plataforma backend multi-tenant para integrar oficialmente el ecosistema de APIs de Meta: WhatsApp, Facebook, Messenger, Instagram, Lead Ads, Marketing API, Conversions API y Threads cuando corresponda.
- Mercado inicial: Ecuador; diseño extensible internacionalmente.
- Naturaleza: producto final enterprise, no MVP.
- Principio de implementación: mejor alternativa oficial disponible; complejidad y coste no justifican elegir una opción inferior.

## 2. Problema
Las empresas necesitan administrar activos, conversaciones, campañas, formularios, leads, publicaciones y medición de resultados desde una plataforma consistente. Las APIs de Meta son heterogéneas: distintos permisos, tokens, límites, estados, políticas, modelos de eventos y ciclos de vida. El producto debe unificarlas sin ocultar esas diferencias.

## 3. Usuarios y actores
- Owner de plataforma: administra tenants, planes, límites y políticas globales.
- Administrador de tenant: conecta Business Portfolio, WABA, Pages, Instagram y ad accounts.
- Marketing manager: campañas, audiencias permitidas, formularios, atribución e Insights.
- Agente: inbox omnicanal, handoff y seguimiento de conversaciones.
- Analista: reportes y calidad de datos.
- Operador/SRE: salud de integraciones, colas, webhooks y recuperación.
- Auditor/Compliance: evidencia de permisos, consentimiento, acceso y eliminación.
- Sistema externo: CRM, ecommerce, ERP, POS o data warehouse.

## 4. Alcance funcional
1. Conexión OAuth/Business Login y Embedded Signup.
2. Inventario de activos, permisos, grants y suscripciones.
3. WhatsApp: Cloud API, Business Management, templates, media, Flows, Marketing Messages y capacidades elegibles.
4. Facebook Pages y Messenger.
5. Instagram Login y Facebook Login, publishing, comments, insights y messaging dentro de elegibilidad.
6. Lead Ads: webhooks, recuperación, formularios, campos y trazabilidad.
7. Marketing API: campañas, ad sets, ads, creatives, presupuestos, estados e insights.
8. Conversions API, deduplicación y atribución.
9. Threads cuando API/permisos lo permitan.
10. Motor de políticas, costes, consentimiento y supresión.
11. Auditoría, observabilidad, seguridad, soporte y exportación/eliminación de datos.

## 5. Fuera de alcance/prohibiciones
- APIs no oficiales, scraping, automatización de interfaces o WhatsApp Web.
- Acceso a perfiles personales fuera de APIs autorizadas.
- Evasión de App Review, permisos o límites.
- Envío masivo no consentido, spam o bypass de políticas.
- Garantizar que Meta apruebe permisos, anuncios, plantillas o cuentas.
- Activar gasto publicitario sin autorización explícita y límites.
- Exponer secretos o datos sensibles a clientes no autorizados.

## 6. Supuestos que requieren validación
- Acceso real a Graph API/Marketing API v vigente.
- Business Verification y App Review aplicables al caso.
- Elegibilidad de la empresa como Tech Provider/partner y Embedded Signup.
- Disponibilidad por país/producto/cuenta de Calling, Marketing Messages, Flows y funciones avanzadas.
- Requisitos contractuales, facturación, rate cards y moneda.
- Obligaciones LOPDP Ecuador, transferencias internacionales, retención y derechos de titulares.

## 7. Glosario
- Tenant: organización cliente aislada lógica y operativamente.
- Meta App: aplicación registrada en Meta for Developers.
- Asset: WABA, phone number, Page, Instagram professional account, ad account, catalog, dataset o form.
- Grant: autorización efectiva para que la app actúe sobre un activo.
- Capability: operación concreta soportada por un producto/cuenta/versión/permisos.
- Native payload: request/response original del proveedor preservado de forma controlada.
- Canonical model: representación interna estable y versionada.
- Webhook inbox: registro durable de eventos recibidos antes del procesamiento.
- Outbox: registro transaccional de eventos/salidas pendientes.
- FEP: Free Entry Point de WhatsApp; no confundir con ventana estándar de atención.
- CAPI: Conversions API.
- ADR: Architecture Decision Record.
- DoR/DoD: Definition of Ready / Definition of Done.

## 8. Criterios de éxito
- Ninguna fuga cross-tenant en pruebas automatizadas y pentest.
- Cada operación muestra permisos y capacidades efectivas antes de habilitarse.
- Webhooks verificables, durables, idempotentes y re-procesables.
- Ningún envío/publicación se marca como entregado por el solo HTTP 2xx.
- Campañas con límites, aprobación y auditoría.
- Costes y métricas distinguen estimación, dato reportado por Meta y conciliación.
- Versiones de API, cambios y deprecaciones trazables.


## 9. Baseline confirmada por el propietario (2026-11-06)

Consultar [29-OWNER-DECISIONS.md](29-OWNER-DECISIONS.md) como fuente canónica.
- Modelo: SaaS para terceros y plataforma interna de EcuApp.
- Greenfield: comenzar desde cero.
- Cobertura: todo el catálogo Meta de META_SERVICES.md, sujeto a elegibilidad oficial por operación/cuenta.
- Producto propio: backend, panel web, CRM e inbox omnicanal.
- Inteligencia CRM: machine learning clásico y estadística aplicada (scoring, clasificación, regresión, forecast, segmentación y ranking); no LLM ni agentes de IA dentro del CRM.
- Hosting objetivo: VPS/servidor propio.
- Entrega: por fases, dominios y límites bien separados.
- Stack: dirección técnica adoptada en ADR-011..020; architecture spike TASK-039 valida footprint, compatibilidad y operación antes del scaffold de producción.
- Agentes: continuar trabajo independiente; resolver decisiones técnicas reversibles y documentarlas; escalar bloqueos de negocio, coste, datos, seguridad, cumplimiento y breaking changes.

La decisión de IA para CRM está documentada en PD-005 y [docs/62](62-CRM-MACHINE-LEARNING-STRATEGY.md). No introducir LLM, RAG, modelos generativos ni agentes de IA dentro de CRM Intelligence.


## 10. Baseline aplicada por delegación del propietario (2026-11-06)
- Segmento inicial: PYMES ecuatorianas de comercio/servicios; agencias multiempresa como segmento secundario. Hipótesis de go-to-market pendiente de validar con entrevistas y pilotos, no estadística de mercado.
- Monetización: suscripción por tenant + usuarios/asientos + uso medido. Costes externos de Meta se informan y concilian por separado; no hay precios ni márgenes aprobados.
- Localización por defecto: es-EC, USD y America/Guayaquil; configurable por tenant.
- Multi-tenancy: PostgreSQL compartido con tenant_id, autorización server-side y RLS; aislamiento dedicado como opción enterprise. Agencia accede mediante grants delegados explícitos, temporales/revocables y auditados.
- Privacidad: minimización, clasificación, retención configurable y workflows de derechos/exportación/borrado. Plazos y bases legales definitivas esperan revisión especializada LOPDP y transferencias.
- Arquitectura adoptada: modular monolith con API/worker/scheduler separados como procesos; TypeScript/NestJS, Angular, Nx/pnpm, PostgreSQL, Redis, RabbitMQ, OIDC/Keycloak, Docker y OpenTelemetry. No desplegar microservicios prematuros.
- SLO de planificación: 99.9% mensual para core API, RPO <= 15 min y RTO <= 4 h tier base, todos candidatos sujetos a pruebas/HA/coste; no son SLA ni mediciones actuales.
- Fuentes: docs/29-OWNER-DECISIONS.md, docs/30-RECOMMENDED-ARCHITECTURE.md, docs/31-MASTER-DELIVERY-PLAN.md, docs/32-RESEARCH-AND-EVIDENCE-REGISTER.md.
- Cambios Meta recientes: versiones Graph/Marketing API por adapter; Embedded Signup v4 a evaluar; BSUID y WAAC/PMA en modelo de identidad/activos; Marketing Messages API como camino principal para marketing WhatsApp frente al sunset anunciado de Cloud API marketing (2027-10-13). Verificar disponibilidad y esquema reales por app/cuenta.


## 11. CRM Intelligence basada en ML clásico

La inteligencia del CRM usa algoritmos estadísticos y machine learning supervisado/no supervisado, con inferencia CPU-first, versionado, calibración, explicabilidad y aislamiento por tenant. No incluye LLM ni agentes autónomos. Especificación: [docs/62](62-CRM-MACHINE-LEARNING-STRATEGY.md).

## 12. Campaign Intelligence y nueva generación de IA publicitaria
- Campaigns & Measurement crecen hasta Campaign Intelligence: Meta Insights + CAPI + CRM outcomes, Creative Lab, test cells, optimization recommendations, budget guardrails and audit.
- Objetivo de negocio: optimizar leads calificados, ventas, revenue neto y contribution margin, no solo clicks o ROAS atribuido.
- Andromeda/GEM son sistemas internos Meta; WhatsBusiness no puede controlarlos ni consultar score. Se aportan creatividades elegibles diversas y señales de conversión de calidad.
- Policy PD-024: máximo +20% de aumento automático por operación y +20% acumulado en rolling 24h, medido sobre baseline de ventana. Política propia; no es porcentaje universal publicado por Meta.
- Meta Ads MCP y Business Agent Platform son integraciones opcionales sujetas a autorización/país/cuenta; todos los writes usan approval gateway.
- OpenWA y WhatsApp Web automation quedan prohibidos como transporte de producción. Solo APIs Meta oficiales.
- Documentos obligatorios: docs/34, docs/35 y docs/36.
