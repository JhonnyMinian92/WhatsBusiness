# 09 — Catálogo de integraciones Meta

> Catálogo de selección técnica. Las URLs, permisos, campos, límites, países y precios cambian; confirmar en la referencia oficial de cada versión antes de codificar. La investigación detallada y fuentes están en [META_SERVICES.md](../META_SERVICES.md).

## Matriz de producto
| Dominio | Producto elegido | Capacidades objetivo | Dependencias críticas |
|---|---|---|---|
| WhatsApp transport | Cloud API | mensajes, media, webhooks, status, interactive | WABA, phone number, token |
| WhatsApp management | Business Management API | WABA, numbers, templates, analytics, subscriptions | business permissions, asset grants |
| Onboarding | Embedded Signup | conectar activos de clientes | app configuration, business verification/review |
| WhatsApp workflows | Flows API | forms, data exchange, responses | WABA, encryption, published flow |
| WhatsApp marketing | Marketing Messages API | marketing delivery/optimization según elegibilidad | producto/endpoint habilitado |
| Facebook | Graph + Pages API | Page assets, posts, comments, insights | Page tasks/scopes |
| Messenger | Messenger Platform | inbox, send, attachments, webhooks | Page, messaging permissions, policy window |
| Instagram | Instagram API: Facebook Login + Instagram Login | media publishing, comments, insights, messaging elegible | account type, login mode, scopes |
| Leads | Lead Ads / Lead Retrieval | forms, leadgen webhooks, historical retrieval | Page/ad account, lead permissions |
| Ads | Marketing API | campaigns, adsets, creatives, ads, insights | ad account, ads permissions, review |
| Measurement | Conversions API | server events, deduplication, match quality | dataset/pixel, consent, event schema |
| Threads | Threads API | profile, publish, replies, insights elegibles | Threads auth/scopes |
| Voice | Calling API | calls, status/events where eligible | country/account/product approval |

## Ficha obligatoria por endpoint
Para cada operación a implementar completar:
- Meta product / API version / endpoint / HTTP method.
- Fuente oficial y fecha de consulta.
- App mode y access level.
- Required scopes, asset tasks, business verification y review.
- Request schema, response schema y error catalog.
- Rate limit headers, pagination, idempotency semantics.
- Webhook event counterpart.
- Data classification, retention and deletion.
- Pricing/billing effect.
- Sandbox/test account availability.
- Contract tests and rollout plan.

## OAuth / credenciales
- Meta App ID y App Secret por entorno.
- Business Login/OAuth redirect URI registrada.
- Token exchange solo backend.
- System User / business token solo cuando el flujo y permisos lo soporten.
- Embedded Signup para onboarding autorizado de clientes.
- Guardar scopes otorgados y expiraciones; no inferir permisos.
- Webhook verify token aleatorio separado de app secret.
- App secret proof cuando endpoint/seguridad lo requiera.
- Rotación/revocación y reconexión documentadas.

## Costos
No fijar una tarifa universal. Mantener rate cards por mercado, moneda, categoría, producto, tipo de mensaje, fecha de vigencia y fuente. Separar cargos Meta, infraestructura, almacenamiento, colas, observabilidad y soporte. Para Ads distinguir presupuesto autorizado, gasto reportado y conciliación.

## Complejidad y riesgos
- Muy alta: Embedded Signup, Marketing API, Instagram multi-login, token/asset authorization.
- Alta: WhatsApp messaging/management, Messenger, Lead Ads, CAPI.
- Media-alta: Threads, reporting, media.
La estimación no equivale a compromiso de fecha; requiere equipo, accesos y aprobación externos.


## 5. Cambios Meta vigentes incorporados a la baseline (corte 2026-11-06)

Consultar fuentes y detalles en [32-RESEARCH-AND-EVIDENCE-REGISTER.md](32-RESEARCH-AND-EVIDENCE-REGISTER.md). En particular:

- Graph API/Marketing API v27.0 anunciadas por Meta en noviembre de 2026; revalidar el changelog oficial y usar versiones por adapter, nunca un número universal.
- Evaluar Embedded Signup v4 como onboarding unificado WhatsApp/Messenger/Instagram Direct; mantener adapter de onboarding para compatibilidad.
- Preparar identidad WhatsApp con BSUID y user identifiers no telefónicos. Phone/E.164 es atributo opcional con provenance; no clave universal ni merge automático.
- Preparar Asset Registry para relaciones WAAC/PMA y recursos legacy WABA; no asumir que teléfono, templates y billing comparten aggregate/ID.
- Integrar WhatsApp Marketing Messages API para marketing desde el inicio. Meta anunció sunset de marketing sobre Cloud API para 2027-10-13; no iniciar nuevas dependencias en endpoint legado.
- Cost ledger soporta Max Pricing: maximum price, estimación, coste realmente reportado y conciliación son conceptos diferentes.
- Marketing API Access Tier (Limited/Full) se registra separado de scopes como ads_management y de los asset tasks.
- Consentimiento/opt-out, políticas y handoff humano son enforcement server-side. La política no se convierte en un booleano universal ni se asume que todas las ventanas son iguales.

## 6. Datos específicos que no deben fijarse en código
- API version vigente, scopes, asset tasks, tier thresholds, deprecation dates, rate limits, pricing, país/región y elegibilidad se cargan/registran por producto/versión/fecha/fuente.
- Ninguna capacidad se habilita por un token aislado.
- Ningún precio Meta se trata como tarifa universal ni como ingreso de la plataforma.
- Ningún ID de proveedor se interpreta como persona universal sin namespace y tipo.
- Las respuestas de App Review, Business Verification y Tech Provider deben provenir de evidencia real de la app/cuenta.


## 7. Marketing API AI/creative capabilities y campañas self-learning
Las siguientes familias se evalúan por versión/permiso/capability al integrar; los nombres y disponibilidad pueden cambiar:
- Campaign, AdSet, Ad, AdCreative APIs: lectura y escritura versionada de estructura y estado.
- Insights API: métricas por campaign/adset/ad/creative, breakdowns y async reports según volumen/capability.
- Business Management API: cuentas propias y de clientes, ownership/grants.
- Ad Previews API: previews por placement/ad format/creative feature.
- Advantage+ Creative APIs: opt-in/opt-out de features creativas AI/automation; no habilitar feature ineligible.
- Ads Performance Recommendations: leer recomendaciones como creative fatigue/limited donde la cuenta/versión las soporte.
- Meta Ads MCP: integración de drafts, uploads, previews, trends/reporting si habilitado; cualquier publish/write conserva aprobación explícita.
- CAPI/datasets/offline sources: señales de negocio server-side, event_id/dedupe, event time, source/action_source y consent.
- Per-creative audiences: evaluar capability para asociar audiencia/age/gender a creative si API disponible para cuenta y región; no asumir paridad con la UI.

### Design requirements
- API version, scope, task, access tier, account eligibility, country, feature availability and deprecation por operación.
- Reporte Meta y outcome interno se conservan por separado; cada reporte muestra atribución y ventana.
- No afirmar control directo ni acceso a score de Andromeda/GEM.
- AI generated features pueden requerir anuncios en PAUSED, preview/review y posterior aprobación/activation; validar contrato vigente.
- No añadir nuevas creatives a un winning/learning adset como método predeterminado. Usar test cell/A-B mechanism, conservar winner y documentar si el cambio puede reiniciar learning.
- Presupuesto +20% per operation/rolling-24h enforced by PD-024; esto es política interna, no regla Meta.
- Los nuevos anuncios deben aportar diversidad sustancial de hipótesis/visual/hook/format/offer/CTA, no spam de duplicados.

Fuentes: docs/34 y docs/36; la muestra Meta AI Creative Enhancer se referencia en docs/32 y requiere revalidación contra API docs normativas.


## 8. Capability record obligatorio por operación

Ningún adapter puede declararse listo solo porque el endpoint aparezca en el catálogo. Registrar una ficha versionada por operación:

| Campo | Regla |
|---|---|
| capability_key | Identificador estable producto.operación |
| provider_product / api_version | Producto y versión exactos; no una versión Graph universal |
| method / path | Método y ruta de referencia normativa |
| source_url / checked_at | URL oficial y fecha de consulta |
| app_mode / access_level | Development/Live y nivel de acceso documentado |
| oauth_scopes | Scopes requeridos y concedidos, separados |
| asset_tasks / grants | Permisos efectivos del activo |
| marketing_api_tier | Limited/Full u otro tier separado de OAuth scopes |
| account_type / country | Elegibilidad real por tipo de cuenta y país |
| webhook_fields | Suscripciones y campos requeridos |
| rate_limit / pagination | Límites, headers y cursor/offset semántica |
| write_semantics | Idempotencia documentada, timeout y reconciliación |
| pricing_basis | Fuente, currency, effective dates y cálculo si aplica |
| native_errors | Errores originales, códigos y mapping canónico |
| sandbox_limitations | Diferencias conocidas del entorno de prueba |
| evidence_state | documented, app-tested, account-tested o unknown |
| sunset / migration | Deprecación, fecha efectiva, owner y plan de migración |

La capability efectiva se calcula por intersección de autorización del actor, tenant policy, consent/legal basis, entitlement, OAuth scope, asset grant/task, App Review/access tier, elegibilidad de cuenta/país, versión API y approval aplicable. Falta de evidencia = disabled/deny, no asumir que funciona.

Los archivos contractuales de cada adapter y fixtures se guardan por producto/versión. Antes de implementar un endpoint se vuelve a consultar la referencia oficial; docs/32 y META_SERVICES.md no sustituyen esa consulta ni la prueba con cuenta autorizada.
