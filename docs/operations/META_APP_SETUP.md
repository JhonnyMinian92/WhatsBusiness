# Configuración de Meta App para WhatsBusiness

## 1. Aplicación y Business Portfolio

1. Registrar la organización como Meta Developer.
2. Crear un Business Portfolio propiedad del operador y una app de tipo **Business**.
3. Asociar la app al Business Portfolio correspondiente.
4. Guardar \`META_APP_ID\` y \`META_APP_SECRET\` en el gestor de secretos del backend.

Nunca publicar App Secret en frontend, repositorio, URL o logs.

## 2. Business Login y Embedded Signup v4

Para nuevas conexiones de WhatsApp configurar Business Login y Embedded Signup v4. No basarse en flujos antiguos v2/v3.

1. Configurar el caso de uso de WhatsApp/Business vigente en Meta Developer Dashboard.
2. Crear la configuración Embedded Signup v4 y seleccionar solo los productos/scopes necesarios.
3. Registrar \`META_OAUTH_REDIRECT_URI\` como redirect URI exacta.
4. Registrar dominios y orígenes web donde se ejecutará Facebook JS SDK.
5. Guardar el \`config_id\` en \`META_BUSINESS_LOGIN_CONFIG_ID\`.
6. El portal inicia Embedded Signup con ese config_id, \`response_type: "code"\` y \`override_default_response_type: true\`.
7. Enviar al backend el código temporal, state y los IDs de negocio/WABA/número recibidos del callback del SDK.
8. El backend consume el state una sola vez, intercambia el code, inspecciona el token y valida acceso real a activos.

Una señal de éxito del SDK no es suficiente para marcar la conexión como activa. La confirmación ocurre después del intercambio del código, validación de app_id, scopes, inventario y suscripción del WABA.

## 3. Webhooks

1. Configurar \`META_WEBHOOK_PUBLIC_URL\` como callback HTTPS.
2. Registrar \`META_WEBHOOK_VERIFY_TOKEN\` secreto.
3. Suscribir la app a los objetos/campos necesarios en el dashboard.
4. Probar challenge GET y \`X-Hub-Signature-256\` POST.
5. Suscribir cada WABA/Page/Instagram activo desde el producto cuando la API requiera suscripción por activo.
6. Confirmar que una entrega válida aparece cifrada en inbox y en el outbox del tenant correcto.

La suscripción global del dashboard no reemplaza las suscripciones de activos.

## 4. Privacy y App Review

- Publicar privacy policy, términos e instrucciones de eliminación.
- Describir finalidades y superficies de datos para cada permiso.
- Preparar usuario, Page, WABA, número y cuenta profesional de prueba.
- Adjuntar video de autorización, sincronización, uso, desconexión y eliminación.
- Demostrar aislamiento con dos tenants independientes.
- Solicitar Advanced Access para scopes utilizados en la experiencia externa.
- Mantener evidencia de Data Use Checkup, App Review y cambios de permisos.

## 5. Variables de entorno

Consultar \`.env.example\`. Producción requiere TLS, OIDC/JWKS real, PostgreSQL privado, CORS allowlist exacta y KMS. No habilitar \`TOKEN_ENCRYPTION_MODE=local\` en producción.
