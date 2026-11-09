# Fase 1 — Fundaciones y acceso a Meta

**Branch:** \`feat/phase-1-foundations-meta-access\`  
**Estado de implementación:** el código base de la fase está desarrollado y agrupado por dominio en el branch; no se marca como validado hasta obtener resultado de CI y una ejecución sobre PostgreSQL real.  
**Dependencias externas:** Meta App, Business Login v4, OIDC/JWKS, URLs públicas y KMS de producción.

## Alcance y entregables

| Dominio | Resultado | Implementación |
|---|---|---|
| Plataforma | Node.js 22, TypeScript estricto, Fastify y workspace | raíz, \`apps/api\` |
| Identidad | JWT/OIDC con firma, issuer, audience y JWKS | \`modules/identity\` |
| Tenancy | tenants, membresías y roles OWNER/ADMIN/MANAGER/AGENT/ANALYST/VIEWER | \`modules/tenants\` |
| Aislamiento | AsyncLocalStorage por request y PostgreSQL RLS | \`platform/isolation\`, migración |
| Business Login | URL con config_id y state de un solo uso | \`modules/meta/connections\` |
| Embedded Signup | sesión v4 y finalización en backend | \`BusinessLoginService\` |
| Token Vault | AES-256-GCM, associated data tenant/conexión/versión y KMS | \`platform/security\`, \`token-vault\` |
| Lifecycle | verificación, extensión de user token elegible y desconexión | \`MetaConnectionLifecycleService\` |
| Permisos | scopes solicitados, concedidos y granulares | \`permission-catalog\`, grants |
| Asset Registry | Business Portfolio, WABA, teléfonos, Pages, Instagram, Ad Accounts y relaciones | \`modules/meta/assets\` |
| Webhooks | challenge, firma HMAC, raw body, cifrado, idempotencia y fan-out tenant | \`modules/meta/webhooks\` |
| Suscripciones | alta por WABA/Page/Instagram y estado por activo | \`MetaWebhookSubscriptionService\` |
| Event delivery | inbox/outbox, locking, reintento con backoff y DLQ | \`platform/events\`, worker |
| Privacidad | consentimiento por tenant/canal/finalidad y callback signed_request | \`modules/privacy\` |
| Auditoría | eventos administrativos y de consentimiento | \`modules/audit\` |
| Operación | migración SQL, Docker, health checks y CI | raíz y \`.github/workflows\` |

## Invariantes de seguridad

1. Todo acceso a entidad de negocio valida tenant scope.
2. OAuth state se guarda como SHA-256, expira y se consume con un UPDATE atómico de un solo uso.
3. OAuth token exchange, debug_token y asset discovery ocurren en backend; el frontend nunca recibe tokens de acceso.
4. Token Vault usa claves de datos AES-256 y cifrado autenticado AES-256-GCM.
5. En producción se requiere KMS; el provider local solo se permite en desarrollo.
6. PostgreSQL aplica RLS a las tablas transaccionales multi-tenant.
7. Cada consulta bajo contexto tenant configura \`app.tenant_id\` en la misma transacción/conexión.
8. Las firmas de webhook se verifican contra bytes raw, antes del parseo.
9. La inbox persiste el payload cifrado antes de responder HTTP 200.
10. Dedupe es persistente; fan-out soporta que un mismo activo esté autorizado por más de un tenant.
11. Consentimiento se registra por tenant, sujeto, canal y finalidad, con eventos de concesión/revocación append-only.
12. Credenciales, activos y grants no se comparten entre tenants por coincidencia de IDs.

## Criterios para declarar 100% del código de la fase

- \`npm run typecheck\` finaliza sin errores.
- \`npm run build\` finaliza sin errores.
- \`npm test\` finaliza sin fallos.
- Migración se aplica idempotentemente en una base limpia.
- Liveness/readiness responden correctamente.
- JWT inválido, issuer/audience incorrectos y tenant sin membresía son rechazados.
- Dos tenants no pueden leer, modificar ni enumerar datos del otro.
- OAuth state expirado/reutilizado/fuera de tenant es rechazado.
- Token cifrado no puede descifrarse cambiando tenant, conexión o versión.
- Webhook con firma inválida no persiste; webhook duplicado no genera otro evento.
- Webhook válido se guarda cifrado y se enruta a cada tenant autorizado.
- Outbox reintenta, libera locks vencidos y marca DLQ al superar intentos.
- Conexión permite verificar permisos, marcar reautenticación y desconectar localmente.

## Dependencias que no puede cerrar el código por sí solo

- Crear la Meta App de tipo Business y asociarla al Business Portfolio propio.
- Crear la configuración Business Login y Embedded Signup v4 en Meta Developer Dashboard.
- Completar Business Verification, Tech Provider/Partner y App Review/Advanced Access que correspondan.
- Publicar y verificar privacy policy, terms, data deletion y webhook HTTPS.
- Configurar proveedor OIDC con claims \`sub\`, \`iss\`, \`aud\` y JWKS.
- Crear KMS key policy y asignar permisos \`kms:GenerateDataKey\` y \`kms:Decrypt\`.
- Proporcionar activos reales y usuarios de prueba autorizados.

## Estado honesto de validación

El conector de GitHub permite modificar el árbol Git, pero no ejecutar npm, Docker, PostgreSQL ni probar credenciales de Meta directamente desde esta sesión. No se declara que build, pruebas, migración, App Review u OAuth real hayan pasado. El workflow CI está incluido para ejecutar typecheck/build/test sobre el branch; los resultados se deben usar como evidencia de cierre, no asumirlos.
