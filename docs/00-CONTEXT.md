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
- IA inicial: chatbots y sugerencias de respuesta; automatización básica extensible.
- Hosting objetivo: VPS/servidor propio.
- Entrega: por fases, dominios y límites bien separados.
- Stack: recomendación del arquitecto autorizada; propuesta aún no congelada.
- Agentes: continuar trabajo independiente; resolver decisiones técnicas reversibles y documentarlas; escalar bloqueos de negocio, coste, datos, seguridad, cumplimiento y breaking changes.

La interpretación de la aclaración de IA está registrada en PD-005. No añadir alcance de RAG, voz o agentes autónomos sin nueva decisión.
