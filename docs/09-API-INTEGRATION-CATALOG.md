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
