# WhatsBusiness

Plataforma TypeScript multi-tenant para integrar de forma oficial los productos de Meta: WhatsApp Business Platform, Facebook Pages, Messenger, Instagram, Threads, Lead Ads, Marketing API y Conversions API.

## Arquitectura

- `apps/api`: API y workers con módulos de dominio independientes.
- `apps/api/src/modules/tenants`: tenants, membresías y RBAC.
- `apps/api/src/modules/identity`: autenticación OIDC/JWT.
- `apps/api/src/modules/meta/connections`: Business Login, Embedded Signup v4, bóveda, ciclo de vida y permisos.
- `apps/api/src/modules/meta/assets`: inventario multi-tenant y relaciones de activos.
- `apps/api/src/modules/meta/webhooks`: firma, inbox cifrado, deduplicación, fan-out y suscripciones.
- `apps/api/src/modules/privacy`: consentimiento y solicitudes de eliminación.
- `apps/api/src/platform`: base de datos, RLS, cifrado y outbox.
- `config/meta-app-review.manifest.json`: manifiesto y evidencia para App Review.

## Requisitos

Node.js 22+, PostgreSQL 17+, proveedor OIDC/JWKS, Meta App de tipo Business y configuración Business Login. AWS KMS es obligatorio para producción.

## Inicio local

1. Copiar `.env.example` a `.env` y completar las variables necesarias.
2. Para desarrollo local, configurar `TOKEN_ENCRYPTION_MODE=local` y `TOKEN_ENCRYPTION_KEY_BASE64` como Base64 de exactamente 32 bytes.
3. Iniciar PostgreSQL con `docker compose up -d postgres`.
4. Ejecutar `npm install`.
5. Aplicar migraciones con `npm run migrate`.
6. Compilar y verificar con `npm run typecheck && npm run build && npm test`.
7. Iniciar API con `npm start`.
8. Iniciar el worker durable con `npm run worker:outbox --workspace=@whatsbusiness/api` después de configurar `EVENT_BUS_HTTP_URL`.

No utilizar claves, URLs ni valores de ejemplo en producción. La API rechaza el cifrado local cuando `NODE_ENV=production`.

## Endpoints principales

| Método | Ruta | Función |
|---|---|---|
| GET | `/health/live` | Liveness |
| GET | `/health/ready` | Readiness de PostgreSQL |
| POST | `/v1/tenants` | Crear tenant y propietario |
| POST | `/v1/tenants/:tenantId/meta/business-login/url` | Iniciar Business Login |
| POST | `/v1/tenants/:tenantId/meta/embedded-signup/session` | Crear sesión Embedded Signup v4 |
| POST | `/v1/tenants/:tenantId/meta/embedded-signup/complete` | Intercambiar code y completar conexión |
| GET | `/v1/meta/oauth/callback` | Callback Business Login |
| GET | `/v1/tenants/:tenantId/meta/connections` | Listar conexiones del tenant |
| POST | `/v1/tenants/:tenantId/meta/connections/:connectionId/verify` | Verificar token y scopes |
| POST | `/v1/tenants/:tenantId/meta/connections/:connectionId/rotate-token` | Extender user token elegible |
| POST | `/v1/tenants/:tenantId/meta/connections/:connectionId/disconnect` | Desconectar credencial local |
| POST | `/v1/tenants/:tenantId/meta/connections/:connectionId/webhooks/synchronize` | Sincronizar suscripciones por activo |
| GET | `/v1/tenants/:tenantId/meta/assets` | Listar activos descubiertos |
| POST | `/v1/tenants/:tenantId/meta/connections/:connectionId/assets/synchronize` | Sincronizar inventario |
| POST | `/v1/tenants/:tenantId/consents` | Registrar o revocar consentimiento |
| GET/POST | `/v1/webhooks/meta` | Verificar callback y recibir webhooks |
| POST | `/v1/meta/data-deletion` | Callback de eliminación de Meta |
| GET | `/v1/meta/data-deletion/status` | Consultar estado de una solicitud |

## Seguridad

Las rutas de negocio requieren Bearer JWT verificado con JWKS. Cada operación comprueba membresía y permiso del tenant. El contexto autenticado configura `app.tenant_id` en PostgreSQL y activa RLS. Los tokens Meta no se devuelven al navegador ni se registran en logs; se cifran con AES-256-GCM y una data key administrada por AWS KMS. Los webhooks se verifican sobre los bytes originales antes de parsearlos y se guardan cifrados antes del ACK.

## Documentación

- [Estado, alcance y criterios de cierre de la fase 1](docs/PHASE_1_FOUNDATIONS.md)
- [Configuración de Meta App, Business Login y Embedded Signup v4](docs/operations/META_APP_SETUP.md)
- [Investigación y especificación integral de Meta](META_SERVICES.md)

La aprobación de Meta, Advanced Access, Business Verification, las URLs públicas, la cuenta OIDC y el KMS real son prerequisitos externos. El código no afirma que Meta haya aprobado una app o conexión productiva.
