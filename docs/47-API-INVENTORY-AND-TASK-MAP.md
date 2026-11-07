# 47 — Inventario maestro de APIs de WhatsBusiness y matriz TASK

**Fecha de corte de diseño:** 2026-11-06  
**Rama:** environment/local  
**Alcance:** endpoints HTTP propios, webhooks entrantes/salientes, operaciones asíncronas y familias de APIs externas de Meta requeridas por US-001..US-032 y TASK-001..TASK-080.  
**Estado:** catálogo maestro de diseño. No implica que exista código, acceso Meta, permisos, pruebas ni contratos implementados. Las rutas son el baseline de producto; antes de congelarlas, el API Owner debe validar compatibilidad con docs/37..46 y ampliar OpenAPI.

---

## 1. Respuesta ejecutiva y uso de este documento

Este documento responde cuatro preguntas distintas:

1. **¿Qué APIs debe construir WhatsBusiness?** Las rutas propias bajo /v1, agrupadas por bounded context.
2. **¿Para qué sirve cada API y por qué existe?** Cada grupo explica la necesidad funcional que satisface y el resultado que devuelve.
3. **¿Cuándo y cómo se utiliza?** Se define el actor, el punto del flujo y la secuencia de llamadas.
4. **¿Qué tareas construyen y verifican cada API?** Cada operación referencia US, TASK, dependencias y controles de aceptación.

No se deben confundir estas superficies:

| Superficie | Quién la construye | Función |
|---|---|---|
| WhatsBusiness REST API | Equipo WhatsBusiness | API de producto que usa Angular, integradores y clientes autorizados |
| Meta API adapters | Equipo WhatsBusiness | Clientes internos tipados que consumen endpoints oficiales de Meta |
| Meta Webhook ingress | Equipo WhatsBusiness | Rutas públicas receptoras de notificaciones Meta |
| Outbound customer webhooks | Equipo WhatsBusiness | Entrega eventos de WhatsBusiness hacia sistemas de clientes |
| Internal domain events | Equipo WhatsBusiness | Eventos asíncronos entre módulos/workers; no son REST público |
| Agent/MCP tools | Equipo WhatsBusiness | Herramientas acotadas que llaman casos de uso autorizados, nunca repositorios o Meta directamente |

La arquitectura normativa es **modular monolith**. Los bounded contexts son límites de código, datos y ownership; no significan desplegar un microservicio/host por endpoint. Las rutas tenant-scoped incluyen tenantId, pero este identificador no concede acceso: el backend valida actor, membership/grant, permission, ownership, entitlement, consent, capability Meta y approval aplicable.

## 2. Convenciones de API

### 2.1 Base path y nombres

- API base interna: /api/v1.
- Las rutas tenant-scoped siguen /v1/tenants/{tenantId}/....
- IDs propios: UUID. IDs de Meta se conservan como strings externos namespaced por provider/product/resource.
- JSON UTF-8; timestamps ISO-8601 UTC; importes decimal string + currency ISO-4217.
- Paginación cursor-based y orden estable; el límite se define por operación.
- Writes repetibles/side effects requieren Idempotency-Key.
- Cambios concurrentes usan version/ETag + If-Match o control equivalente.
- Correlation ID acompaña HTTP → outbox → worker → adapter → webhook/receipt.
- Mutaciones largas o que esperan Meta se aceptan como job y responden 202 con operationId; se consulta su estado.
- Errores siguen el envelope de docs/43; no revelar la existencia de objetos de otro tenant.

### 2.2 Semántica HTTP

| Método | Uso |
|---|---|
| GET | Consultar o listar sin side effects |
| POST | Crear un recurso, solicitar una acción o crear un comando |
| PATCH | Actualizar campos mutables con control de concurrencia |
| DELETE | Revocar/desvincular o borrar según política; preferir lifecycle explícito cuando exista retención legal |
| 202 Accepted | El comando fue persistido y programado, no significa que Meta lo ejecutó ni que el destinatario recibió nada |

### 2.3 Seguridad común

Cada endpoint debe declarar autenticación, permissions, data classification, rate limit, idempotency, audit event, tenant scope y tests. Los endpoints de conexión, exportación, secretos, gastos y escrituras externas requieren step-up/approval de acuerdo con policy. Los callbacks de proveedores no autentican a un usuario humano: se verifican mediante el protocolo del producto, se resuelven contra el registro de subscriptions y se persisten antes del ACK.

### 2.4 Estados de evidencia

- **D — Documented:** comportamiento respaldado por contrato o fuente oficial.
- **C — Contract-tested:** validado con fixtures/schemas.
- **A — Account-tested:** probado con app/cuenta real autorizada.
- **U — Unknown/blocked:** elegibilidad, permisos o comportamiento no probado.

No convertir D/C en A. Si la capacidad no está comprobada para esa conexión y operación, el sistema debe mostrarla como no disponible y explicar el motivo.

---

## 3. Inventario de APIs propias por bounded context

La matriz siguiente es el inventario del alcance actual. Los nombres exactos de campos se congelan en OpenAPI después del review; no se debe crear una ruta no registrada sin actualizar este catálogo y docs/19.

### 3.1 Health, identidad y sesión — API-PLT

**Para qué:** dar al panel y a los servicios una vista segura del principal autenticado y de los tenants a los que tiene acceso. La autenticación OIDC la resuelve el Identity Provider; WhatsBusiness resuelve memberships, roles y contexto efectivo.  
**Cuándo:** al cargar la app, renovar sesión, seleccionar tenant o verificar readiness de despliegue.

| API ID | Método y ruta | Qué hace / por qué / cuándo | US / TASK |
|---|---|---|---|
| PLT-001 | GET /health/live | Liveness del proceso; no debe hacer chequeos costosos. Usar en probes del runtime. | TASK-029 |
| PLT-002 | GET /health/ready | Comprueba dependencias obligatorias y readiness; usar antes de enrutar tráfico. | TASK-029,039 |
| PLT-003 | GET /v1/me | Devuelve identidad local y memberships activas; primer request del frontend después de OIDC. | US-001/002; TASK-001..004 |
| PLT-004 | GET /v1/tenants | Lista solo tenants accesibles al actor; usar para el selector de espacio de trabajo. | US-001/024; TASK-001,002,052 |
| PLT-005 | GET /v1/tenants/{tenantId}/context | Devuelve membership/grant efectivo, role/permission keys y entitlements; llamar al seleccionar tenant y refrescar tras cambio de grants. | US-001/002/024/025; TASK-002,004,052,058 |
| PLT-006 | GET /v1/tenants/{tenantId}/settings | Lee locale/timezone/currency y preferencias operativas del tenant. | US-001/024; TASK-001,052 |
| PLT-007 | PATCH /v1/tenants/{tenantId}/settings | Cambia settings permitidos con audit y optimistic concurrency. | US-024; TASK-052 |

**Flujo:** OIDC login → GET /me → GET /tenants → GET /tenants/{id}/context → cargar features según entitlements y permisos. El frontend no decide autorización; el backend la valida en cada operación.

### 3.2 Organizaciones, tenants, membresías y RBAC/ABAC — API-IAM

**Para qué:** administrar clientes SaaS, usuarios, membresías, roles, permisos y grants de agencias sin compartir datos entre tenants.  
**Cuándo:** onboarding de clientes, invitaciones, cambios de personal, suspensión/reactivación y revisiones de acceso.

| API ID | Método y ruta | Qué hace / cuándo se usa | US / TASK |
|---|---|---|---|
| IAM-001 | POST /v1/platform/organizations | Crea una organización de plataforma/partner, solo operador autorizado. | US-024/025; TASK-052,058 |
| IAM-002 | POST /v1/platform/tenants | Provisiona un tenant con organization, locale, plan inicial y lifecycle. | US-001/024; TASK-001,052 |
| IAM-003 | GET /v1/tenants/{tenantId} | Consulta metadata de tenant si el actor tiene acceso. | US-001/024; TASK-001,052 |
| IAM-004 | PATCH /v1/tenants/{tenantId} | Actualiza metadata permitida, nunca ownership arbitrario. | US-024; TASK-052 |
| IAM-005 | POST /v1/tenants/{tenantId}/suspend | Suspende operación por causa autorizada y conserva auditoría. | US-024; TASK-052 |
| IAM-006 | POST /v1/tenants/{tenantId}/reactivate | Reactiva después de revisar causa/entitlement; no restablece permisos revocados. | US-024; TASK-052 |
| IAM-007 | GET /v1/tenants/{tenantId}/members | Lista membresías según permiso. | US-002/024; TASK-004,052 |
| IAM-008 | POST /v1/tenants/{tenantId}/invitations | Invita usuario; la aceptación se completa mediante OIDC/identity flow. | US-002/024; TASK-004,052 |
| IAM-009 | POST /v1/tenants/{tenantId}/invitations/{invitationId}/resend | Reenvía invitación vigente con rate limit. | US-002; TASK-004 |
| IAM-010 | DELETE /v1/tenants/{tenantId}/invitations/{invitationId} | Revoca una invitación no aceptada. | US-002; TASK-004 |
| IAM-011 | PATCH /v1/tenants/{tenantId}/members/{userId} | Suspende/reactiva membership y actualiza atributos autorizados. | US-002; TASK-004 |
| IAM-012 | DELETE /v1/tenants/{tenantId}/members/{userId} | Revoca membership y propaga invalidación a sesiones/grants/cache/jobs. | US-002; TASK-004 |
| IAM-013 | GET /v1/tenants/{tenantId}/roles | Lista roles configurados y roles del sistema permitidos. | US-002; TASK-004 |
| IAM-014 | POST /v1/tenants/{tenantId}/roles | Crea rol custom sin permitir permisos fuera del catálogo. | US-002; TASK-004 |
| IAM-015 | PATCH /v1/tenants/{tenantId}/roles/{roleId} | Cambia metadatos/permisos de rol con versionado y audit. | US-002; TASK-004 |
| IAM-016 | GET /v1/platform/permissions | Lista catálogo estable de permisos. | US-002; TASK-004 |
| IAM-017 | PUT /v1/tenants/{tenantId}/members/{userId}/roles | Reemplaza asignaciones de roles mediante operación atómica auditada. | US-002; TASK-004 |
| IAM-018 | GET /v1/tenants/{tenantId}/approvals | Consulta solicitudes de aprobación visibles al actor. | US-002/012/029; TASK-005,025,071 |
| IAM-019 | POST /v1/tenants/{tenantId}/approvals | Solicita aprobación para acción sensible; no ejecuta todavía la acción externa. | US-002/012/029/031; TASK-005,025,071,074 |
| IAM-020 | POST /v1/tenants/{tenantId}/approvals/{approvalId}/decision | Aprueba/rechaza con step-up, separación solicitante/aprobador cuando aplique y audit. | US-002/012/029/031; TASK-005,025,071,074 |

**Invariantes:** no hay tenant header de confianza; un usuario global no tiene acceso automático a todos los tenants; roles no saltan consent, capabilities ni budget guardrails; el acceso de soporte usa JIT separado.

### 3.3 Partner, agencias y soporte JIT — API-PARTNER

**Para qué:** permitir que una agencia trabaje en activos y acciones de un cliente solo con delegación explícita, limitada y revocable.  
**Cuándo:** relación agencia-cliente, cambio de alcance, expiración o retiro de acceso.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| PAR-001 | GET /v1/partner/organizations | Lista las organizaciones partner del actor. | US-025; TASK-058 |
| PAR-002 | POST /v1/partner/organizations | Crea organización partner autorizada. | US-025; TASK-058 |
| PAR-003 | GET /v1/partner/tenants/grants | Lista delegaciones de la agencia. | US-025; TASK-058 |
| PAR-004 | POST /v1/tenants/{tenantId}/partner-grants | El cliente concede acceso con actor, roles, assets, acciones, purpose y expiry. | US-025; TASK-058 |
| PAR-005 | PATCH /v1/tenants/{tenantId}/partner-grants/{grantId} | Reduce/cambia alcance mediante nueva versión y aprobación requerida. | US-025; TASK-058 |
| PAR-006 | POST /v1/tenants/{tenantId}/partner-grants/{grantId}/revoke | Revocación inmediata; invalida autorización futura en sesiones/jobs/cache. | US-025; TASK-058 |
| PAR-007 | POST /v1/platform/tenants/{tenantId}/support-grants | Abre acceso interno JIT separado, justificado, con duración y recursos limitados. | US-024/025; TASK-052,058 |

No debe existir una ruta de impersonation invisible. Toda acción conserva actor real, organización partner, tenant destino, grant y propósito.

### 3.4 Meta Control Plane: OAuth, Embedded Signup y conexiones — API-META

**Para qué:** conectar negocios y activos Meta sin pedir contraseñas al cliente, guardar credenciales de forma segura y mantener el estado real de permisos/capabilities.  
**Cuándo:** conexión inicial, reconexión, revocación, onboarding de activos, sincronización o detección de pérdida de permisos.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| META-001 | GET /v1/tenants/{tenantId}/meta/connections | Lista conexiones y estado de salud sin exponer tokens. | US-003; TASK-006..008 |
| META-002 | POST /v1/tenants/{tenantId}/meta/connections/oauth/start | Genera state/nonce de un solo uso y URL Business Login/OAuth. | US-003; TASK-006 |
| META-003 | GET /v1/meta/oauth/callback | Recibe code/state; valida state, redirect, issuer y correlación. | US-003; TASK-006 |
| META-004 | POST /v1/tenants/{tenantId}/meta/connections/oauth/complete | Intercambia code server-side, persiste referencia cifrada y scopes recibidos. | US-003; TASK-006,007 |
| META-005 | POST /v1/tenants/{tenantId}/meta/embedded-signup/sessions | Crea sesión/configuración de Embedded Signup compatible con v4. | US-003; TASK-008,054 |
| META-006 | POST /v1/meta/embedded-signup/callback | Recibe resultado/correlation de Embedded Signup y valida tenant intent y actor. | US-003; TASK-008,054 |
| META-007 | POST /v1/tenants/{tenantId}/meta/connections/{connectionId}/reconnect | Inicia reconexión autorizada sin exponer credenciales existentes. | US-003; TASK-007,008 |
| META-008 | POST /v1/tenants/{tenantId}/meta/connections/{connectionId}/revoke | Revoca localmente y solicita revocación externa cuando la API lo permita. | US-003; TASK-007 |
| META-009 | GET /v1/tenants/{tenantId}/meta/connections/{connectionId}/status | Devuelve expiración, scopes, último sync, warnings y estado de conexión. | US-003; TASK-006..008 |
| META-010 | POST /v1/tenants/{tenantId}/meta/connections/{connectionId}/assets/sync | Encola descubrimiento/sync de activos; responde 202 + operationId. | US-004; TASK-009 |
| META-011 | GET /v1/tenants/{tenantId}/meta/assets | Lista activos normalizados con filtro por provider/product/type. | US-004; TASK-009 |
| META-012 | GET /v1/tenants/{tenantId}/meta/assets/{assetId} | Consulta relación y metadata del activo. | US-004; TASK-009 |
| META-013 | GET /v1/tenants/{tenantId}/meta/assets/{assetId}/grants | Muestra scopes, asset tasks/grants y evidencia observada. | US-004; TASK-009,010,056 |
| META-014 | GET /v1/tenants/{tenantId}/meta/assets/{assetId}/capabilities | Lista operaciones disponibles y razones de allow/deny/unknown. | US-004; TASK-010,056 |
| META-015 | POST /v1/tenants/{tenantId}/meta/assets/{assetId}/capabilities/refresh | Revalida capabilities expiradas o después de cambio de grant/version. | US-004; TASK-010,056 |
| META-016 | GET /v1/tenants/{tenantId}/meta/api-versions | Consulta versiones soportadas por adapter y sunset registry. | US-004/032; TASK-056,065,076 |

**Flujo:** start OAuth/ESU → usuario autoriza en Meta → callback validado → exchange server-side → token vault → inventory sync → capability evaluation → UI muestra activos y operaciones realmente habilitadas. Un access token no equivale a grant universal.

### 3.5 WhatsApp messaging, media y delivery — API-WA-MSG

**Para qué:** enviar y recibir mensajes por WhatsApp Cloud API de acuerdo con tipos, consent, ventanas, templates y capacidades disponibles.  
**Cuándo:** respuesta del agente, notificación de negocio permitida, recepción de webhook y seguimiento del estado. La operación local separa aceptación del proveedor y entrega al usuario.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| WA-001 | GET /v1/tenants/{tenantId}/whatsapp/phone-numbers | Lista números disponibles en conexiones/activos autorizados. | US-004/005; TASK-009,011 |
| WA-002 | GET /v1/tenants/{tenantId}/whatsapp/phone-numbers/{phoneNumberId} | Lee perfil, calidad/estado y metadata permitida del número. | US-004/005; TASK-011 |
| WA-003 | POST /v1/tenants/{tenantId}/whatsapp/messages | Crea comando de envío tipado; valida policy/capability/consent y persiste outbox antes de worker. | US-005/020; TASK-011..013,045 |
| WA-004 | GET /v1/tenants/{tenantId}/whatsapp/messages/{messageId} | Consulta submission state, provider ID, delivery state y errores. | US-005; TASK-013 |
| WA-005 | GET /v1/tenants/{tenantId}/whatsapp/messages | Busca mensajes por conversación, número, fecha y estado. | US-005/020; TASK-013,045 |
| WA-006 | POST /v1/tenants/{tenantId}/whatsapp/media | Carga/escanea/valida media y obtiene referencia segura. | US-005; TASK-012 |
| WA-007 | GET /v1/tenants/{tenantId}/whatsapp/media/{mediaId} | Consulta metadata y autorización de descarga del media. | US-005; TASK-012 |
| WA-008 | POST /v1/tenants/{tenantId}/whatsapp/messages/{messageId}/reconcile | Consulta estado nativo cuando el envío quedó outcome_unknown y la API lo soporta. | US-005; TASK-013 |
| WA-009 | GET /v1/tenants/{tenantId}/whatsapp/quality | Devuelve quality/rating disponibles según permisos y fuente. | US-005/008; TASK-011,018 |

**Cómo funciona el envío:** validar actor + tenant + conversation/contact identity + asset + template/category + ventana + consentimiento + capability → crear message command + idempotency + outbox en una sola transacción → worker adapter Meta → guardar respuesta nativa → webhook status actualiza delivery. Un HTTP 2xx del proveedor no se traduce a delivered.

### 3.6 WhatsApp Business Management: plantillas, números y perfil — API-WA-MGMT

**Para qué:** administrar activos de WhatsApp que el cliente ha delegado, en vez de obligar a usar WhatsApp Manager para toda operación soportada por API.  
**Cuándo:** onboarding, revisión de templates, actualización de perfil y sincronización de calidad/estado.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| WAM-001 | GET /v1/tenants/{tenantId}/whatsapp/templates | Lista templates por WABA/idioma/categoría/estado. | US-006; TASK-014 |
| WAM-002 | POST /v1/tenants/{tenantId}/whatsapp/templates | Solicita creación de template; valida schema y permisos. | US-006; TASK-014 |
| WAM-003 | GET /v1/tenants/{tenantId}/whatsapp/templates/{templateId} | Lee template y estado Meta. | US-006; TASK-014 |
| WAM-004 | PATCH /v1/tenants/{tenantId}/whatsapp/templates/{templateId} | Solicita edición/versionado cuando la API lo soporte; conserva revisions. | US-006; TASK-014,015 |
| WAM-005 | DELETE /v1/tenants/{tenantId}/whatsapp/templates/{templateId} | Solicita eliminación remota permitida y registra resultado. | US-006; TASK-014 |
| WAM-006 | GET /v1/tenants/{tenantId}/whatsapp/templates/{templateId}/revisions | Historial de schema, cambios, actor y estado. | US-006; TASK-015 |
| WAM-007 | POST /v1/tenants/{tenantId}/whatsapp/templates/{templateId}/preview | Renderiza preview y valida placeholders/componentes localmente. | US-006; TASK-015 |
| WAM-008 | GET /v1/tenants/{tenantId}/whatsapp/business-profile | Lee perfil empresarial del número conectado. | US-004/005; TASK-011 |
| WAM-009 | PATCH /v1/tenants/{tenantId}/whatsapp/business-profile | Actualiza los campos de perfil permitidos por Meta y grants. | US-004; TASK-011 |

No enviar un template en estado no aprobado, pausado, rechazado o incompatible con idioma/categoría/capability.

### 3.7 WhatsApp Flows — API-WA-FLOW

**Para qué:** recoger respuestas estructuradas dentro de WhatsApp para formularios, cotización, calificación o reservas.  
**Cuándo:** cuando el journey requiera más que texto libre y el número/cuenta/versión soporten Flows.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| WAF-001 | GET /v1/tenants/{tenantId}/whatsapp/flows | Lista Flows y versiones disponibles. | US-007; TASK-016 |
| WAF-002 | POST /v1/tenants/{tenantId}/whatsapp/flows | Crea un Flow draft con definición validada. | US-007; TASK-016 |
| WAF-003 | GET /v1/tenants/{tenantId}/whatsapp/flows/{flowId} | Consulta estado y versión. | US-007; TASK-016 |
| WAF-004 | POST /v1/tenants/{tenantId}/whatsapp/flows/{flowId}/validate | Valida schema, endpoints/data exchange y navegación. | US-007; TASK-016 |
| WAF-005 | POST /v1/tenants/{tenantId}/whatsapp/flows/{flowId}/publish | Solicita publicación si validation/capability/approval permiten. | US-007; TASK-016 |
| WAF-006 | POST /v1/tenants/{tenantId}/whatsapp/flows/{flowId}/deprecate | Deja de ofrecer versión anterior con estrategia de compatibilidad. | US-007; TASK-016 |
| WAF-007 | POST /v1/webhooks/meta/whatsapp/flows/data-exchange | Endpoint de datos cifrados de Flow; descifra/verifica protocolo y responde con schema autorizado. | US-007; TASK-016 |
| WAF-008 | GET /v1/tenants/{tenantId}/whatsapp/flows/keys/status | Muestra estado de clave pública/configuración, nunca clave privada. | US-007; TASK-016 |

El Data Exchange se implementa según protocolo criptográfico oficial vigente. No registrar plaintext ni claves privadas en logs.

### 3.8 WhatsApp Marketing Messages y Cost Ledger — API-WA-MKT

**Para qué:** enviar comunicación promocional mediante la superficie de marketing elegible y medir costos sin confundir estimaciones con cargos reales.  
**Cuándo:** campaña promocional aprobada, cálculo previo, conciliación periódica o revisión de elegibilidad.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| WAMK-001 | GET /v1/tenants/{tenantId}/whatsapp/marketing/status | Consulta onboarding/status de Marketing Messages y elegibilidad de activo. | US-008; TASK-017,055 |
| WAMK-002 | POST /v1/tenants/{tenantId}/whatsapp/marketing/onboarding | Inicia/configura onboarding según capability vigente. | US-008; TASK-017,055 |
| WAMK-003 | POST /v1/tenants/{tenantId}/whatsapp/marketing/messages | Solicita envío de marketing tras consent, frequency, policy, eligibility y approval. | US-008; TASK-017,055 |
| WAMK-004 | POST /v1/tenants/{tenantId}/whatsapp/marketing/cost-estimates | Estima cargo con rate card versionada y supuestos explícitos. | US-008/026; TASK-018,057 |
| WAMK-005 | GET /v1/tenants/{tenantId}/cost-ledger/whatsapp | Consulta estimates, provider charges y reconciled amounts. | US-008/026; TASK-018,057 |
| WAMK-006 | POST /v1/tenants/{tenantId}/cost-ledger/whatsapp/reconcile | Importa/reconcilia datos de cargos autorizados, no inventa una factura Meta. | US-026; TASK-057 |
| WAMK-007 | GET /v1/tenants/{tenantId}/cost-ledger/rate-cards | Lista rate cards por país/moneda/categoría/vigencia/fuente. | US-026; TASK-057 |

No usar un precio fijo en código. Guardar por separado maximum/upper bound, estimate, provider-reported actual y invoice/reconciled actual. Mensajería promocional no se envía por el endpoint legacy de Cloud API por conveniencia.

### 3.9 Facebook Pages y Messenger — API-FB

**Para qué:** administrar los activos de Pages y atención de Messenger que la autorización real permite.  
**Cuándo:** sincronizar páginas, publicar/moderar contenido, consultar insights o responder conversación con las reglas de Messenger.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| FB-001 | GET /v1/tenants/{tenantId}/facebook/pages | Lista Pages con tareas/grants efectivos. | US-009; TASK-019 |
| FB-002 | GET /v1/tenants/{tenantId}/facebook/pages/{pageId} | Consulta Page metadata/capabilities. | US-009; TASK-019 |
| FB-003 | GET /v1/tenants/{tenantId}/facebook/pages/{pageId}/posts | Lista publicaciones permitidas. | US-009; TASK-019 |
| FB-004 | POST /v1/tenants/{tenantId}/facebook/pages/{pageId}/posts | Crea draft/publicación si permiso, policy y approval lo permiten. | US-009; TASK-019 |
| FB-005 | PATCH /v1/tenants/{tenantId}/facebook/posts/{postId} | Modifica campos si la API soporta la operación. | US-009; TASK-019 |
| FB-006 | DELETE /v1/tenants/{tenantId}/facebook/posts/{postId} | Solicita eliminación remota permitida; siempre auditar. | US-009; TASK-019 |
| FB-007 | GET /v1/tenants/{tenantId}/facebook/posts/{postId}/comments | Consulta comentarios. | US-009; TASK-019 |
| FB-008 | POST /v1/tenants/{tenantId}/facebook/comments/{commentId}/replies | Responde comentario con policy y capability. | US-009; TASK-019 |
| FB-009 | POST /v1/tenants/{tenantId}/facebook/comments/{commentId}/moderation | Oculta/elimina/modera si la cuenta y operación lo permiten. | US-009; TASK-019 |
| FB-010 | GET /v1/tenants/{tenantId}/facebook/pages/{pageId}/insights | Consulta insights con ventana/fuente explícitas. | US-009; TASK-019 |
| FB-011 | GET /v1/tenants/{tenantId}/messenger/conversations | Lista Inbox conversations de Messenger. | US-009/020; TASK-019,045,046 |
| FB-012 | POST /v1/tenants/{tenantId}/messenger/messages | Crea envío de Messenger tipado, sujeto a ventana/policy. | US-009/020; TASK-019,045 |
| FB-013 | GET /v1/tenants/{tenantId}/messenger/messages/{messageId} | Consulta estado y receipts si soportado. | US-009; TASK-019 |
| FB-014 | POST /v1/tenants/{tenantId}/messenger/handoffs | Transfiere ownership/handoff con actor y motivo. | US-009/021; TASK-019,047 |

La API interna de Messenger puede delegar al módulo Inbox. No duplicar conversaciones/messages en tablas distintas solo por canal.

### 3.10 Instagram profesional — API-IG

**Para qué:** publicar y administrar contenido, comentarios, mensajes e insights de cuentas profesionales elegibles.  
**Cuándo:** el tenant conectó una cuenta Business/Creator y la combinación de login mode, scopes, Page linkage y features está validada.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| IG-001 | GET /v1/tenants/{tenantId}/instagram/accounts | Lista cuentas profesionales autorizadas y login mode. | US-010; TASK-020 |
| IG-002 | GET /v1/tenants/{tenantId}/instagram/accounts/{accountId}/media | Lista media accesible. | US-010; TASK-021 |
| IG-003 | POST /v1/tenants/{tenantId}/instagram/accounts/{accountId}/media-containers | Crea media container/draft según formatos permitidos. | US-010; TASK-021 |
| IG-004 | POST /v1/tenants/{tenantId}/instagram/media-containers/{containerId}/publish | Publica container después de revisar estado y approval. | US-010; TASK-021 |
| IG-005 | GET /v1/tenants/{tenantId}/instagram/media-containers/{containerId} | Consulta estado de procesamiento antes/después de publicar. | US-010; TASK-021 |
| IG-006 | GET /v1/tenants/{tenantId}/instagram/media/{mediaId}/comments | Lista comentarios. | US-010; TASK-021 |
| IG-007 | POST /v1/tenants/{tenantId}/instagram/comments/{commentId}/replies | Responde comentario autorizado. | US-010; TASK-021 |
| IG-008 | POST /v1/tenants/{tenantId}/instagram/comments/{commentId}/moderation | Modera comentario cuando endpoint y permisos lo soporten. | US-010; TASK-021 |
| IG-009 | GET /v1/tenants/{tenantId}/instagram/accounts/{accountId}/insights | Consulta insights por rango/métrica compatible. | US-010; TASK-021 |
| IG-010 | GET /v1/tenants/{tenantId}/instagram/conversations | Lista conversaciones elegibles para messaging. | US-010/020; TASK-021,045,046 |
| IG-011 | POST /v1/tenants/{tenantId}/instagram/messages | Envía mensaje permitido a través del adapter. | US-010/020; TASK-021,045 |
| IG-012 | GET /v1/tenants/{tenantId}/instagram/mentions | Consulta menciones accesibles. | US-010; TASK-021 |

No asumir igualdad entre Instagram Login y Facebook Login. La capability por operación declara account type, linkage, scopes, permisos, región y límites.

### 3.11 Threads — API-TH

**Para qué:** extender el modelo de publicación/gestión de comunidad a Threads sin contaminar canales previos.  
**Cuándo:** solo si el producto y la cuenta autorizada soportan el caso de uso. Es prioridad P2 y depende de la plataforma común.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| TH-001 | GET /v1/tenants/{tenantId}/threads/profiles | Lista perfiles Threads conectados. | US-017; TASK-033 |
| TH-002 | POST /v1/tenants/{tenantId}/threads/posts | Crea publicación draft o submit autorizado. | US-017; TASK-033 |
| TH-003 | GET /v1/tenants/{tenantId}/threads/posts/{postId} | Consulta estado/detalle. | US-017; TASK-033 |
| TH-004 | GET /v1/tenants/{tenantId}/threads/posts/{postId}/replies | Consulta respuestas. | US-017; TASK-033 |
| TH-005 | POST /v1/tenants/{tenantId}/threads/posts/{postId}/replies | Publica respuesta si la capability lo permite. | US-017; TASK-033 |
| TH-006 | GET /v1/tenants/{tenantId}/threads/profiles/{profileId}/insights | Consulta insights soportados. | US-017; TASK-033 |

La lista es la superficie de producto; los métodos nativos concretos se fijan en el Threads adapter contract cuando se valide la versión y el permiso de la cuenta.

### 3.12 Lead Ads y Lead Management — API-LEAD

**Para qué:** capturar leads en tiempo real, recuperar históricos autorizados, mantener provenance y conectarlos al CRM.  
**Cuándo:** webhook leadgen, importación inicial, recuperación por periodo o sincronización de formularios.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| LEAD-001 | GET /v1/tenants/{tenantId}/meta/lead-forms | Lista formularios accesibles por Page/ad account. | US-011; TASK-022 |
| LEAD-002 | GET /v1/tenants/{tenantId}/meta/lead-forms/{formId} | Lee metadata/campos del form. | US-011; TASK-022 |
| LEAD-003 | POST /v1/tenants/{tenantId}/leads/sync-jobs | Inicia recuperación histórica por form/ad y cursor/fecha. | US-011; TASK-022 |
| LEAD-004 | GET /v1/tenants/{tenantId}/leads/sync-jobs/{jobId} | Consulta progreso, errores y checkpoint. | US-011; TASK-022 |
| LEAD-005 | GET /v1/tenants/{tenantId}/leads | Lista leads normalizados y filtrables. | US-011/018; TASK-023,042 |
| LEAD-006 | GET /v1/tenants/{tenantId}/leads/{leadId} | Consulta lead, provenance y lifecycle. | US-011/018; TASK-023,042 |
| LEAD-007 | POST /v1/tenants/{tenantId}/leads/{leadId}/assignments | Asigna lead a usuario/equipo con historial. | US-011/019; TASK-023,044 |
| LEAD-008 | POST /v1/tenants/{tenantId}/leads/{leadId}/transitions | Cambia estado qualified/disqualified/converted con actor/motivo. | US-011/019; TASK-023,044 |
| LEAD-009 | POST /v1/webhooks/meta/facebook/leadgen | Recibe evento Page leadgen después de validar autenticidad y persistencia. | US-011/014; TASK-022,027,028 |
| LEAD-010 | POST /v1/tenants/{tenantId}/leads/{leadId}/convert | Convierte lead en contacto/oportunidad conservando provenance. | US-018/019; TASK-042,044 |

Los duplicados de webhook/retrieval se deduplican por ID de evento/submission y tenant/source. El payload original se conserva solo según política de retención y acceso.

### 3.13 Campaigns, Ads, Creatives, Insights y presupuesto — API-ADS

**Para qué:** permitir preparar, validar, aprobar, activar, pausar y medir campañas sin acciones monetarias implícitas.  
**Cuándo:** crear draft, modificar campaña, consultar resultados, importar insights, pedir presupuesto o detener gasto. Toda escritura externa sigue dry-run/preflight + approval + execution + reconciliation.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| ADS-001 | GET /v1/tenants/{tenantId}/ad-accounts | Lista ad accounts/currency/permissions. | US-012; TASK-024 |
| ADS-002 | GET /v1/tenants/{tenantId}/ad-accounts/{accountId}/campaigns | Lista campañas y estados externos. | US-012/029; TASK-024,072 |
| ADS-003 | POST /v1/tenants/{tenantId}/ad-accounts/{accountId}/campaigns | Crea campaign draft local o recurso remoto según command type; default no publicar. | US-012; TASK-024 |
| ADS-004 | GET /v1/tenants/{tenantId}/campaigns/{campaignId} | Consulta campaign local + snapshot remoto. | US-012; TASK-024 |
| ADS-005 | PATCH /v1/tenants/{tenantId}/campaigns/{campaignId} | Actualiza draft/config; cambios live requieren aprobación separada. | US-012; TASK-024 |
| ADS-006 | POST /v1/tenants/{tenantId}/campaigns/{campaignId}/validate | Preflight objetivo, policy, destination, billing, limits y creative. | US-012; TASK-024 |
| ADS-007 | POST /v1/tenants/{tenantId}/campaigns/{campaignId}/submit | Solicita aprobación/submit de campaign validada; no bypass de spend gate. | US-012; TASK-024,025 |
| ADS-008 | POST /v1/tenants/{tenantId}/campaigns/{campaignId}/pause | Solicita pausa y reconcilia estado externo. | US-012; TASK-025 |
| ADS-009 | GET /v1/tenants/{tenantId}/campaigns/{campaignId}/ad-sets | Lista ad sets. | US-012; TASK-024 |
| ADS-010 | POST /v1/tenants/{tenantId}/campaigns/{campaignId}/ad-sets | Crea ad set draft con targeting/budget/schedule preflight. | US-012; TASK-024 |
| ADS-011 | GET /v1/tenants/{tenantId}/ad-sets/{adSetId} | Lee ad set y estado externo. | US-012/029; TASK-024,072 |
| ADS-012 | PATCH /v1/tenants/{tenantId}/ad-sets/{adSetId} | Cambia configuración draft; live edit requiere approval/guardrail. | US-012; TASK-024,025 |
| ADS-013 | POST /v1/tenants/{tenantId}/ad-sets/{adSetId}/budget-change-requests | Crea solicitud de cambio de presupuesto con delta y rolling-24h baseline. | US-012/029; TASK-025,071 |
| ADS-014 | GET /v1/tenants/{tenantId}/creatives | Lista creatives y provenance. | US-012/030; TASK-024,069 |
| ADS-015 | POST /v1/tenants/{tenantId}/creatives | Registra creative draft/asset reference y metadata. | US-030; TASK-069 |
| ADS-016 | POST /v1/tenants/{tenantId}/creatives/{creativeId}/validate | Valida derechos, claims, placements, policy y near-duplicates. | US-030; TASK-069,073,079 |
| ADS-017 | POST /v1/tenants/{tenantId}/creatives/{creativeId}/preview | Solicita preview por placement/features; no publica. | US-030; TASK-073 |
| ADS-018 | GET /v1/tenants/{tenantId}/ads | Lista Ads y sus vínculos campaign/adset/creative. | US-012; TASK-024 |
| ADS-019 | POST /v1/tenants/{tenantId}/ads | Crea Ad draft/command sobre creative y adset válidos. | US-012/030; TASK-024,069 |
| ADS-020 | GET /v1/tenants/{tenantId}/ads/{adId} | Consulta estado, creative y delivery snapshot. | US-012/029; TASK-025,072 |
| ADS-021 | POST /v1/tenants/{tenantId}/ads/{adId}/pause | Solicita pausa inmediata con audit y reconciliation. | US-012/029; TASK-025,071 |
| ADS-022 | POST /v1/tenants/{tenantId}/insights/sync-jobs | Inicia import de Insights con granularidad, breakdown, ventana y API version. | US-012/029; TASK-025,072 |
| ADS-023 | GET /v1/tenants/{tenantId}/insights/sync-jobs/{jobId} | Consulta progreso/checkpoints/errores. | US-029; TASK-072 |
| ADS-024 | GET /v1/tenants/{tenantId}/insights | Consulta métricas agregadas con freshness/provenance/attribution windows. | US-012/029; TASK-025,072,078 |
| ADS-025 | GET /v1/tenants/{tenantId}/ad-accounts/{accountId}/spend-ledger | Compara budget autorizado, spend reportado y conciliación. | US-012/026/029; TASK-025,057,071,072 |
| ADS-026 | POST /v1/tenants/{tenantId}/ads/kill-switch | Deshabilita nuevas acciones publicitarias y procesa stop policy. | US-012/029; TASK-025,071 |
| ADS-027 | POST /v1/tenants/{tenantId}/campaigns/{campaignId}/reconcile | Compara estado local con estado remoto y genera diferencias. | US-012/029; TASK-025,072 |

**Guardrail de presupuesto:** nunca calcular con float. Cada cambio considera límite por operación de +20% y acumulado rolling 24h sobre baseline, locks, idempotency, approval, spend/campaign scope y current remote state. El 20% es política interna PD-024, no una regla universal de Meta. El kill switch no debe necesitar al modelo IA para operar.

### 3.14 Conversions API y eventos server-side — API-CAPI

**Para qué:** enviar eventos de negocio que el tenant haya autorizado para medición y reconciliación.  
**Cuándo:** conversión/venta/lead qualified u otro evento elegible, después de consentimiento/legal basis y dedupe.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| CAPI-001 | POST /v1/tenants/{tenantId}/conversion-events | Recibe evento de negocio validado; crea event_id estable y source/provenance. | US-013/029; TASK-026,068 |
| CAPI-002 | POST /v1/tenants/{tenantId}/conversion-events/{eventId}/deliver | Programa entrega CAPI cuando policy/capability y consent lo permiten. | US-013; TASK-026,068 |
| CAPI-003 | GET /v1/tenants/{tenantId}/conversion-events/{eventId} | Consulta estado local/Meta response/diagnostics. | US-013; TASK-026,068 |
| CAPI-004 | GET /v1/tenants/{tenantId}/conversion-events/diagnostics | Calidad, match indicators y errores sin prometer atribución perfecta. | US-013; TASK-026,068 |

No usar el envío a Meta como prueba de una venta atribuida ni duplicar eventos Pixel/server. Mantener event_name + event_id, timestamps, action_source, consent y minimización.

### 3.15 CRM: contactos, identidades, empresas y custom fields — API-CRM

**Para qué:** mantener un perfil comercial por tenant, preservando identidades de cada canal y procedencia.  
**Cuándo:** lead recibido, contacto creado/actualizado, búsqueda del agente, identificación de duplicado o merge revisado.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| CRM-001 | GET /v1/tenants/{tenantId}/contacts | Busca/lista contactos con filtros y scopes de campos. | US-018; TASK-042 |
| CRM-002 | POST /v1/tenants/{tenantId}/contacts | Crea contacto con source/provenance. | US-018; TASK-042 |
| CRM-003 | GET /v1/tenants/{tenantId}/contacts/{contactId} | Consulta perfil y campos autorizados. | US-018; TASK-042 |
| CRM-004 | PATCH /v1/tenants/{tenantId}/contacts/{contactId} | Actualiza atributos, origen y versionado. | US-018; TASK-042 |
| CRM-005 | GET /v1/tenants/{tenantId}/contacts/{contactId}/identities | Lista identificadores externos namespaced. | US-018; TASK-043,053 |
| CRM-006 | POST /v1/tenants/{tenantId}/contacts/{contactId}/identities | Vincula una identidad después de validación/collision check. | US-018; TASK-043,053 |
| CRM-007 | POST /v1/tenants/{tenantId}/identity-resolution/candidates | Detecta candidatos de duplicación; no fusiona automáticamente. | US-018; TASK-043,053 |
| CRM-008 | POST /v1/tenants/{tenantId}/identity-resolution/merge-preview | Muestra efecto de merge, colisiones y campos fuente. | US-018; TASK-043,053 |
| CRM-009 | POST /v1/tenants/{tenantId}/identity-resolution/merges | Ejecuta merge autorizado, reversible y auditado. | US-018; TASK-043,053 |
| CRM-010 | POST /v1/tenants/{tenantId}/identity-resolution/merges/{mergeId}/reverse | Revierte merge cuando legal/consistencia lo permiten. | US-018; TASK-043,053 |
| CRM-011 | GET /v1/tenants/{tenantId}/contact-field-definitions | Lista custom field schemas. | US-018; TASK-042 |
| CRM-012 | POST /v1/tenants/{tenantId}/contact-field-definitions | Crea definición de campo tipado y validado. | US-018; TASK-042 |
| CRM-013 | PATCH /v1/tenants/{tenantId}/contact-field-definitions/{fieldId} | Cambia label/config con versionado; cambios de tipo requieren migración explícita. | US-018; TASK-042 |
| CRM-014 | GET /v1/tenants/{tenantId}/companies | Lista empresas relacionadas. | US-019; TASK-044 |
| CRM-015 | POST /v1/tenants/{tenantId}/companies | Crea empresa con provenance. | US-019; TASK-044 |
| CRM-016 | GET /v1/tenants/{tenantId}/companies/{companyId} | Consulta empresa y relaciones autorizadas. | US-019; TASK-044 |
| CRM-017 | PATCH /v1/tenants/{tenantId}/companies/{companyId} | Actualiza campos permitidos. | US-019; TASK-044 |

Teléfono/email son atributos secundarios; no son claves primarias universales. BSUID, PSID, Instagram-scoped ID y cualquier identity de provider se guardan por namespace, tipo y fuente. Merge no se hace por coincidencia aproximada sin confirmación.

### 3.16 Leads, pipelines, oportunidades y actividades — API-SALES

**Para qué:** gestionar proceso comercial después de la captura.  
**Cuándo:** lead calificado, asignación, avance de etapa, creación de oportunidad, seguimiento o cierre.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| SALES-001 | GET /v1/tenants/{tenantId}/pipelines | Lista pipelines configurados. | US-019; TASK-044 |
| SALES-002 | POST /v1/tenants/{tenantId}/pipelines | Crea pipeline tenant-scoped. | US-019; TASK-044 |
| SALES-003 | PATCH /v1/tenants/{tenantId}/pipelines/{pipelineId} | Configura pipeline/version. | US-019; TASK-044 |
| SALES-004 | POST /v1/tenants/{tenantId}/pipelines/{pipelineId}/stages | Crea etapa con semantic key/order/terminal state. | US-019; TASK-044 |
| SALES-005 | PATCH /v1/tenants/{tenantId}/pipelines/{pipelineId}/stages/{stageId} | Cambia propiedades con validación de transición/migración. | US-019; TASK-044 |
| SALES-006 | GET /v1/tenants/{tenantId}/opportunities | Lista oportunidades por pipeline/owner/status. | US-019; TASK-044 |
| SALES-007 | POST /v1/tenants/{tenantId}/opportunities | Crea oportunidad vinculada a contact/company. | US-019; TASK-044 |
| SALES-008 | GET /v1/tenants/{tenantId}/opportunities/{opportunityId} | Consulta oportunidad, amount decimal + currency y timeline. | US-019; TASK-044 |
| SALES-009 | PATCH /v1/tenants/{tenantId}/opportunities/{opportunityId} | Actualiza campos no terminales con version check. | US-019; TASK-044 |
| SALES-010 | POST /v1/tenants/{tenantId}/opportunities/{opportunityId}/transitions | Cambia etapa/won/lost con actor, motivo y timestamp. | US-019; TASK-044 |
| SALES-011 | GET /v1/tenants/{tenantId}/activities | Busca timeline de actividades. | US-019; TASK-044 |
| SALES-012 | POST /v1/tenants/{tenantId}/activities | Crea tarea, nota, reunión o actividad referenciada. | US-019; TASK-044 |
| SALES-013 | PATCH /v1/tenants/{tenantId}/activities/{activityId} | Cambia actividad editable sin reescribir audit events. | US-019; TASK-044 |
| SALES-014 | POST /v1/tenants/{tenantId}/leads/{leadId}/convert | Crea contact/opportunity conservando lead/provenance. | US-018/019; TASK-023,042,044 |

### 3.17 Inbox omnicanal, equipos y handoff — API-INBOX

**Para qué:** ofrecer una bandeja unificada con semántica y capacidades nativas por canal. El módulo centraliza conversaciones y mensajes; adapters preservan diferencias de WhatsApp, Messenger, Instagram y futuras plataformas.  
**Cuándo:** llegada de mensaje, consulta del agente, respuesta, asignación, nota interna o transferencia humano/bot/agente externo.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| INB-001 | GET /v1/tenants/{tenantId}/conversations | Lista conversaciones con filtros/cursor. | US-020; TASK-045,046 |
| INB-002 | GET /v1/tenants/{tenantId}/conversations/{conversationId} | Consulta contexto, canal, asset, capability, owner y estado. | US-020; TASK-045,046 |
| INB-003 | GET /v1/tenants/{tenantId}/conversations/{conversationId}/messages | Lista mensajes con order/pagination estable. | US-020; TASK-045,046 |
| INB-004 | POST /v1/tenants/{tenantId}/conversations/{conversationId}/messages | Envía mensaje por adapter; exige permission, policy, consent, capability y idempotency. | US-020/021; TASK-045..047 |
| INB-005 | GET /v1/tenants/{tenantId}/messages/{messageId} | Consulta submission/delivery/native error. | US-020; TASK-045 |
| INB-006 | POST /v1/tenants/{tenantId}/conversations/{conversationId}/assignments | Asigna usuario/equipo de forma atómica y auditada. | US-021; TASK-047 |
| INB-007 | GET /v1/tenants/{tenantId}/teams | Lista equipos disponibles para Inbox. | US-021; TASK-047 |
| INB-008 | POST /v1/tenants/{tenantId}/teams | Crea equipo y miembros. | US-021; TASK-047 |
| INB-009 | PATCH /v1/tenants/{tenantId}/teams/{teamId} | Actualiza config/capacidad de equipo. | US-021; TASK-047 |
| INB-010 | POST /v1/tenants/{tenantId}/conversations/{conversationId}/ownership/acquire | Reclama lease de respuesta; evita doble control simultáneo. | US-021/031; TASK-047,075 |
| INB-011 | POST /v1/tenants/{tenantId}/conversations/{conversationId}/ownership/renew | Renueva lease con compare-and-swap. | US-021; TASK-047 |
| INB-012 | POST /v1/tenants/{tenantId}/conversations/{conversationId}/ownership/release | Libera lease antes/después de handoff. | US-021/031; TASK-047,075 |
| INB-013 | POST /v1/tenants/{tenantId}/conversations/{conversationId}/handoffs | Transfiere ownership entre humano, bot o agente externo. | US-021/031; TASK-047,075 |
| INB-014 | POST /v1/tenants/{tenantId}/conversations/{conversationId}/internal-notes | Crea nota privada no enviada al canal. | US-021; TASK-047 |
| INB-015 | POST /v1/tenants/{tenantId}/conversations/{conversationId}/read-cursor | Actualiza cursor de lectura del usuario. | US-020; TASK-046 |
| INB-016 | GET /v1/tenants/{tenantId}/inbox/search | Busca mensajes/conversaciones con field/data permissions y tenant filter. | US-020; TASK-046 |
| INB-017 | POST /v1/tenants/{tenantId}/conversations/{conversationId}/tags | Añade/quita tags operativas. | US-020/021; TASK-046,047 |
| INB-018 | GET /v1/tenants/{tenantId}/inbox/presence | Consulta presencia/availability de agentes con expiración. | US-021; TASK-047 |

Un lease no es lo mismo que assignment: assignment identifica responsable; lease limita quién puede responder en ese momento. La respuesta saliente se audita con actor humano/agent provider, tenant, conversation, purpose, approval y provider message ID.

### 3.18 Automatizaciones — API-AUTO

**Para qué:** construir workflows deterministas que reaccionan a eventos y ejecutan acciones permitidas sin duplicarlas.  
**Cuándo:** configuración del negocio, trigger recibido, ejecución programada, fallo, pausa o revisión de DLQ.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| AUTO-001 | GET /v1/tenants/{tenantId}/workflows | Lista workflows y versiones/estados. | US-022; TASK-048 |
| AUTO-002 | POST /v1/tenants/{tenantId}/workflows | Crea workflow draft. | US-022; TASK-048 |
| AUTO-003 | GET /v1/tenants/{tenantId}/workflows/{workflowId} | Consulta definición/estado/version. | US-022; TASK-048 |
| AUTO-004 | PATCH /v1/tenants/{tenantId}/workflows/{workflowId} | Actualiza draft; published version permanece inmutable. | US-022; TASK-048 |
| AUTO-005 | POST /v1/tenants/{tenantId}/workflows/{workflowId}/validate | Valida schema, graph, actions, permissions y limits. | US-022; TASK-048 |
| AUTO-006 | POST /v1/tenants/{tenantId}/workflows/{workflowId}/simulate | Ejecuta simulación con fixtures; no produce side effects. | US-022; TASK-048 |
| AUTO-007 | POST /v1/tenants/{tenantId}/workflows/{workflowId}/publish | Publica version inmutable tras validación/approval. | US-022; TASK-048 |
| AUTO-008 | POST /v1/tenants/{tenantId}/workflows/{workflowId}/pause | Pausa nuevos claims. | US-022; TASK-049 |
| AUTO-009 | GET /v1/tenants/{tenantId}/workflow-executions | Lista ejecuciones y resultados. | US-022; TASK-049 |
| AUTO-010 | GET /v1/tenants/{tenantId}/workflow-executions/{executionId} | Consulta pasos, attempts, correlation y side effects. | US-022; TASK-049 |
| AUTO-011 | POST /v1/tenants/{tenantId}/workflow-executions/{executionId}/retry | Reintenta solo si error/operación es segura y policy permite. | US-022; TASK-049 |
| AUTO-012 | POST /v1/tenants/{tenantId}/workflow-executions/{executionId}/cancel | Cancela pasos cancelables; external writes ya ejecutadas se reconcilian. | US-022; TASK-049 |
| AUTO-013 | POST /v1/tenants/{tenantId}/workflows/kill-switch | Detiene nuevas ejecuciones tenant-scoped. | US-022; TASK-049 |

### 3.19 AI Assistance y chatbot — API-AI

**Para qué:** sugerir respuestas, clasificar/resumir cuando esté aprobado y operar bots deterministas. La IA no obtiene permiso por producir texto y no envía mensajes por sí sola.  
**Cuándo:** agente solicita sugerencia, evalúa feedback o usa un flujo determinista; proveedores externos solo con aprobación legal/comercial y policy.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| AI-001 | POST /v1/tenants/{tenantId}/ai/reply-suggestions | Genera borrador de respuesta minimizando/redactando contexto. | US-023; TASK-050,051 |
| AI-002 | POST /v1/tenants/{tenantId}/ai/conversation-summaries | Resume conversación si purpose/provider/data policy aprobado; inicialmente puede quedar disabled. | US-023; TASK-050,051 |
| AI-003 | POST /v1/tenants/{tenantId}/ai/feedback | Registra accept/edit/reject con versión del modelo/prompt. | US-023; TASK-050 |
| AI-004 | GET /v1/tenants/{tenantId}/ai/usage | Consulta cuota, coste reportado/estimado y consumo por feature/model. | US-023/026; TASK-050,057,063 |
| AI-005 | GET /v1/tenants/{tenantId}/chatbots | Lista bots/reglas configuradas. | US-023; TASK-051 |
| AI-006 | POST /v1/tenants/{tenantId}/chatbots | Crea bot determinista ligado a workflow/flow autorizado. | US-023; TASK-051 |
| AI-007 | PATCH /v1/tenants/{tenantId}/chatbots/{botId} | Actualiza reglas/versiones del bot. | US-023; TASK-051 |
| AI-008 | POST /v1/tenants/{tenantId}/chatbots/{botId}/pause | Desactiva respuestas automáticas y respeta handoff. | US-023; TASK-051 |

La llamada al proveedor se hace desde AI Gateway mediante adapter y model policy. No enviar mensajes reales, PII ni datos de producción a un proveedor no aprobado.

### 3.20 Consentimiento, privacidad, exportación y borrado — API-PRIV

**Para qué:** respetar finalidades, opt-out y derechos de titulares, además de controlar la eliminación en todos los almacenes y proveedores.  
**Cuándo:** registro/revocación de consentimiento, solicitud de acceso/rectificación/exportación/borrado, vencimiento de retención o legal hold.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| PRIV-001 | GET /v1/tenants/{tenantId}/consents | Lista evidencias de consent por finalidad/canal/contacto. | US-016; TASK-032,059 |
| PRIV-002 | POST /v1/tenants/{tenantId}/consents | Registra consentimiento/notice version/source/time. | US-016; TASK-032,059 |
| PRIV-003 | POST /v1/tenants/{tenantId}/consents/{consentId}/revoke | Revoca consentimiento y propaga suppression donde corresponda. | US-016; TASK-032,059 |
| PRIV-004 | POST /v1/tenants/{tenantId}/privacy-requests | Crea solicitud de derecho con identidad verificada y propósito. | US-016; TASK-032,059 |
| PRIV-005 | GET /v1/tenants/{tenantId}/privacy-requests/{requestId} | Consulta workflow de solicitud, sin exponer datos a actor no autorizado. | US-016; TASK-032,059 |
| PRIV-006 | POST /v1/tenants/{tenantId}/privacy-requests/{requestId}/export | Genera export protegido con expiración y audit. | US-016; TASK-032,059 |
| PRIV-007 | POST /v1/tenants/{tenantId}/privacy-requests/{requestId}/rectify | Orquesta rectificación autorizada en almacenes relevantes. | US-016; TASK-032,059 |
| PRIV-008 | POST /v1/tenants/{tenantId}/privacy-requests/{requestId}/erase | Orquesta borrado, legal hold y evidencia; requiere confirmación/approval según irreversibilidad. | US-016; TASK-032,059 |
| PRIV-009 | GET /v1/tenants/{tenantId}/retention-policies | Lista políticas configuradas, no establece plazos legales por defecto. | US-016; TASK-032,059 |
| PRIV-010 | PATCH /v1/tenants/{tenantId}/retention-policies/{policyId} | Ajusta política aprobada por tenant/legal owner. | US-016; TASK-032,059 |

Los plazos, bases jurídicas, roles LOPDP, transferencias y subencargados requieren validación especializada. No rellenar valores legales supuestos.

### 3.21 Audit, observabilidad y operaciones — API-OPS

**Para qué:** permitir investigar quién hizo qué, cuándo, desde qué tenant, con qué aprobación y qué respondió el proveedor; operar colas y SLO.  
**Cuándo:** soporte, seguridad, auditoría, incidentes y operación autorizada.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| OPS-001 | GET /v1/tenants/{tenantId}/audit-events | Busca auditoría tenant-scoped y redactada. | US-015; TASK-030 |
| OPS-002 | GET /v1/platform/audit-events | Consulta eventos globales solo para auditor autorizado. | US-015; TASK-030 |
| OPS-003 | GET /v1/platform/operations/queues | Muestra profundidad/edad/errores por queue, sin datos sensibles. | US-015; TASK-028,029 |
| OPS-004 | GET /v1/platform/operations/dead-letters | Lista DLQ con referencias/códigos. | US-014/015; TASK-028,029 |
| OPS-005 | POST /v1/platform/operations/dead-letters/{id}/replay | Replay auditado con dedupe y autorización; no es retry indiscriminado. | US-014; TASK-028 |
| OPS-006 | GET /v1/platform/operations/metrics | Métricas agregadas SLO, errores, latencias y saturación. | US-015; TASK-029 |
| OPS-007 | GET /v1/platform/security/findings | Consulta findings de seguridad de pipelines/escaneos autorizados. | US-016; TASK-031 |
| OPS-008 | POST /v1/platform/security/risk-acceptances | Registra aceptación formal, owner, compensating control y expiry. | US-016; TASK-031 |
| OPS-009 | GET /v1/platform/meta-change-records | Consulta cambios de API/policy/capability con fuente/fecha. | US-032; TASK-065,076 |
| OPS-010 | POST /v1/platform/meta-change-records | Registra cambio nuevo como draft para review. | US-032; TASK-065,076 |
| OPS-011 | POST /v1/platform/meta-change-records/{recordId}/impact-analysis | Calcula adapters, tenants, operations, tests y runbooks afectados. | US-032; TASK-056,065,076 |

Benchmark, dashboards y restore drills son operaciones SRE y no deben exponerse como un CRUD administrativo de producto. TASK-039/041/060/061 se prueban con harness/infraestructura y evidencias.

### 3.22 Billing, planes, usage y suscripciones — API-BILL

**Para qué:** mostrar relación comercial, asientos, límites y consumo, separando suscripción WhatsBusiness de cargos externos Meta/IA/infraestructura.  
**Cuándo:** alta/cambio de plan, control de cuota, consulta de uso y conciliación.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| BILL-001 | GET /v1/tenants/{tenantId}/subscription | Consulta plan/estado/período de tenant. | US-024/026; TASK-052,063 |
| BILL-002 | GET /v1/tenants/{tenantId}/entitlements | Devuelve features/límites efectivos. | US-024/026; TASK-052,063 |
| BILL-003 | GET /v1/tenants/{tenantId}/usage | Consulta uso por seats/features/period y origen. | US-026; TASK-063 |
| BILL-004 | GET /v1/tenants/{tenantId}/usage-ledger | Consulta ledger inmutable de consumo. | US-026; TASK-063 |
| BILL-005 | POST /v1/tenants/{tenantId}/usage-ledger/reconcile | Reconcilia medición con origen, sin alterar eventos previos. | US-026; TASK-063 |
| BILL-006 | GET /v1/platform/plans | Lista planes configurados/aprobados. | US-024/026; TASK-052,063 |
| BILL-007 | POST /v1/platform/tenants/{tenantId}/plan-change-requests | Solicita cambio de plan con efecto/approval. | US-024/026; TASK-052,063 |

No implementar precio, impuestos, markup, invoices o cobro real hasta aprobación de unit economics/contratos y requerimientos fiscales.

### 3.23 Developer Platform: API clients y webhooks salientes — API-DEV

**Para qué:** permitir que clientes integren su CRM/ERP/servicios con contratos versionados y eventos firmados.  
**Cuándo:** un tenant crea credencial, suscribe un event type, recibe callback, rota key o solicita replay.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| DEV-001 | GET /v1/tenants/{tenantId}/developer/api-clients | Lista integraciones API del tenant. | US-027; TASK-062 |
| DEV-002 | POST /v1/tenants/{tenantId}/developer/api-clients | Crea client credential con scopes mínimos; secreto solo se muestra una vez. | US-027; TASK-062 |
| DEV-003 | POST /v1/tenants/{tenantId}/developer/api-clients/{clientId}/rotate | Rota key y permite ventana de transición controlada. | US-027; TASK-062 |
| DEV-004 | POST /v1/tenants/{tenantId}/developer/api-clients/{clientId}/revoke | Revoca client credential y sus sesiones/tokens. | US-027; TASK-062 |
| DEV-005 | GET /v1/tenants/{tenantId}/developer/webhook-endpoints | Lista destinos webhook registrados. | US-027; TASK-062 |
| DEV-006 | POST /v1/tenants/{tenantId}/developer/webhook-endpoints | Registra HTTPS endpoint con challenge/test delivery. | US-027; TASK-062 |
| DEV-007 | PATCH /v1/tenants/{tenantId}/developer/webhook-endpoints/{endpointId} | Actualiza configuración validando SSRF/host policy. | US-027; TASK-062 |
| DEV-008 | DELETE /v1/tenants/{tenantId}/developer/webhook-endpoints/{endpointId} | Desactiva endpoint y detiene nuevas entregas. | US-027; TASK-062 |
| DEV-009 | POST /v1/tenants/{tenantId}/developer/webhook-subscriptions | Suscribe event types versionados. | US-027; TASK-062 |
| DEV-010 | GET /v1/tenants/{tenantId}/developer/webhook-deliveries | Lista delivery attempts y respuesta remota. | US-027; TASK-062 |
| DEV-011 | POST /v1/tenants/{tenantId}/developer/webhook-deliveries/{deliveryId}/retry | Reintenta entrega idempotente según límites y política. | US-027; TASK-062 |

Los webhooks salientes usan HMAC signature + timestamp/replay protection, delivery ID, schema version, retry schedule y DLQ. Validar DNS/IP y redirects para prevenir SSRF.

### 3.24 Campaign Intelligence, Creative Lab y experimentación — API-CI

**Para qué:** convertir datos de entrega Meta + outcomes CRM en diagnósticos, hipótesis y recomendaciones con guardrails. No obtiene scores internos de Andromeda/GEM ni controla su algoritmo.  
**Cuándo:** snapshots nuevos, revisión de campaña, fatiga creativa, propuesta de test, recomendación y evaluación posterior.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| CI-001 | GET /v1/tenants/{tenantId}/campaign-intelligence/snapshots | Consulta snapshots con freshness/provenance. | US-029; TASK-067,072 |
| CI-002 | POST /v1/tenants/{tenantId}/campaign-intelligence/snapshots/sync | Programa sincronización y normalización de métricas. | US-029; TASK-067,072 |
| CI-003 | GET /v1/tenants/{tenantId}/campaign-intelligence/diagnostics | Calcula diagnóstico de delivery + CRM, sin confundir atribución/causalidad. | US-029; TASK-067,068,078 |
| CI-004 | GET /v1/tenants/{tenantId}/campaign-intelligence/recommendations | Lista recomendaciones/estado/evidencia. | US-029; TASK-067,071,077,078 |
| CI-005 | POST /v1/tenants/{tenantId}/campaign-intelligence/recommendations/{recommendationId}/simulate | Simula impacto/guardrails; no ejecuta cambios remotos. | US-029; TASK-067,071 |
| CI-006 | POST /v1/tenants/{tenantId}/campaign-intelligence/recommendations/{recommendationId}/approve | Registra aprobación de un humano autorizado. | US-029; TASK-005,071,074 |
| CI-007 | POST /v1/tenants/{tenantId}/campaign-intelligence/recommendations/{recommendationId}/execute | Ejecuta únicamente acción aprobada a través del approval gateway y adapter. | US-029; TASK-071,074 |
| CI-008 | POST /v1/tenants/{tenantId}/campaign-intelligence/recommendations/{recommendationId}/dismiss | Descarta con razón/feedback. | US-029; TASK-067,077 |
| CI-009 | GET /v1/tenants/{tenantId}/experiments | Lista test cells/experimentos. | US-029/030; TASK-070,077 |
| CI-010 | POST /v1/tenants/{tenantId}/experiments | Crea experimento con hypothesis/control/variant/metric/stop rule. | US-030; TASK-070 |
| CI-011 | POST /v1/tenants/{tenantId}/experiments/{experimentId}/validate | Comprueba overlap, sample/budget limits y Meta-supported experiment mechanism. | US-030; TASK-070 |
| CI-012 | POST /v1/tenants/{tenantId}/experiments/{experimentId}/start | Solicita aprobación/activación controlada. | US-030; TASK-070 |
| CI-013 | POST /v1/tenants/{tenantId}/experiments/{experimentId}/stop | Detiene según stop rule/kill policy. | US-030; TASK-070 |
| CI-014 | GET /v1/tenants/{tenantId}/creative-assets | Lista assets y metadata/provenance. | US-030; TASK-069 |
| CI-015 | POST /v1/tenants/{tenantId}/creative-assets | Registra asset/variant draft. | US-030; TASK-069 |
| CI-016 | POST /v1/tenants/{tenantId}/creative-assets/{assetId}/variants | Genera o registra nueva variante; proveedor IA externo sujeto a aprobación. | US-030; TASK-069,079 |
| CI-017 | POST /v1/tenants/{tenantId}/creative-assets/{assetId}/review | Revisa rights, brand, claims, policy y preview. | US-030; TASK-069,073 |
| CI-018 | GET /v1/tenants/{tenantId}/campaign-intelligence/health | Consulta señal, freshness, creative fatigue y guardrails por campaña. | US-029/030; TASK-072,078,079 |

El motor debe distinguir provider-reported delivery, attribution, CRM-qualified lead, sale/revenue y margin. La recomendación contiene evidence window, denominator, sample size, uncertainty, constraints, expected upside/risk y policy decisions.

### 3.25 Agent Tool Gateway, MCP y agentes externos — API-AGENT

**Para qué:** exponer herramientas con schema tipado y permisos acotados a agentes humanos/IA y MCP. Los agentes no reciben tokens Meta, SQL directo ni acceso indiscriminado al dominio.  
**Cuándo:** el agente solicita leer datos, preparar un draft, simular, pedir aprobación o realizar una acción expresamente permitida.

| API ID | Método y ruta | Qué hace / cuándo | US / TASK |
|---|---|---|---|
| AGT-001 | GET /v1/tenants/{tenantId}/agent-tools | Lista tools/capabilities disponibles para el actor/tenant. | US-031; TASK-080 |
| AGT-002 | POST /v1/tenants/{tenantId}/agent-tool-runs | Ejecuta tool allowlisted con schema, purpose, scope y correlation. | US-031; TASK-074,075,080 |
| AGT-003 | GET /v1/tenants/{tenantId}/agent-tool-runs/{runId} | Consulta resultado, audit y errores redactados. | US-031; TASK-080 |
| AGT-004 | POST /v1/tenants/{tenantId}/agent-tool-runs/{runId}/approve | Confirma acción externa de alto riesgo cuando policy exige aprobación humana. | US-031; TASK-074,080 |
| AGT-005 | POST /v1/tenants/{tenantId}/agent-tool-runs/{runId}/cancel | Cancela ejecución aún no irreversible. | US-031; TASK-080 |
| AGT-006 | POST /v1/platform/agent-tools/kill-switch | Deshabilita tool execution globalmente ante incidente. | US-031; TASK-080 |

El servidor MCP expone tools derivados de AGT-001/002, no un bypass alternativo. OpenWA/WhatsApp Web no está permitido. Meta Ads MCP u otros asistentes nativos se conectan por adapters aprobados y con ownership/approval compartidos.

---

## 4. Webhooks entrantes y salientes

### 4.1 Entrantes — proveedor a WhatsBusiness

Estos endpoints deben ser pequeños, autenticar al proveedor, resolver subscription/tenant/asset, persistir durablemente y responder según el protocolo. Nunca deben ejecutar el procesamiento de negocio completo durante el request de entrada.

| API ID | Método y ruta | Proveedor / evento | TASK |
|---|---|---|---|
| WH-001 | GET /v1/webhooks/meta/{product} | Challenge/verification donde aplique; validar verify token/subscription. | TASK-027 |
| WH-002 | POST /v1/webhooks/meta/whatsapp | Messages, statuses, account/template/phone events según suscripción. | TASK-027,028,011,014 |
| WH-003 | POST /v1/webhooks/meta/facebook | Page/Messenger events y cambios soportados. | TASK-027,028,019 |
| WH-004 | POST /v1/webhooks/meta/instagram | Instagram messaging/comment/media events habilitados. | TASK-027,028,020,021 |
| WH-005 | POST /v1/webhooks/meta/leadgen | leadgen webhook de Page con lead/form/ad identifiers. | TASK-022,027,028 |
| WH-006 | POST /v1/webhooks/meta/ads | App/product-specific events de Ads solo si la suscripción está soportada/activa. | TASK-024,025,027,072 |
| WH-007 | POST /v1/webhooks/meta/threads | Eventos Threads si están disponibles para el producto/versión/cuenta. | TASK-033,027 |
| WH-008 | POST /v1/webhooks/meta/flows/data-exchange | Protocolo sincrónico de Data Exchange Flows, separado del webhook event gateway. | TASK-016 |

Validaciones mínimas: signature/challenge correctos por producto; raw body preservado para verificar firma; límites de tamaño/tipo; rate limit; dedupe/replay; tenant resolution desde suscripciones registradas; durable inbox insert antes del ACK; worker/DLQ/replay; redacción de payloads y audit.

No asumir que todas las superficies Meta usan el mismo header/firma, mismo challenge o mismo contrato.

### 4.2 Salientes — WhatsBusiness a sistemas del cliente

Los callbacks de integradores usan DEV-005..011. Se entregan eventos como lead.created, conversation.message_received, message.delivery_updated, campaign.recommendation.created, opportunity.won y tenant.usage.threshold_reached según suscripción. Cada delivery contiene deliveryId, eventId, schemaVersion, timestamp y firma; retry es at-least-once, el consumidor debe deduplicar.

---

## 5. Internal domain events (no REST)

Estas señales coordinan workers dentro del modular monolith. Los módulos productores guardan el cambio de agregado y outbox en una sola transacción; publishers y consumers procesan at-least-once.

| Evento | Productor → consumidor | Relación TASK |
|---|---|---|
| platform.tenant.created / tenant.suspended | IAM → entitlements, audit, notifications | TASK-001,002,052 |
| platform.membership.changed / grant.revoked | IAM → cache/session invalidation, workers | TASK-004,005,058 |
| meta.connection.created / credentials.expiring / connection.revoked | Meta Control Plane → Asset Registry, capability, operations | TASK-006..010,056 |
| meta.assets.sync_requested / assets.synced | Asset Registry → capability registry | TASK-009,010 |
| meta.capability.changed | Capability Registry → UI, policies, affected workers | TASK-010,056,065 |
| meta.webhook.received | Webhook Inbox → channel processors | TASK-027,028 |
| whatsapp.message.send_requested | Inbox/WA → outbound worker | TASK-011..013,045 |
| whatsapp.message.delivery_updated | Webhook processor → Inbox | TASK-013,045 |
| whatsapp.template.status_changed | Meta adapter → template registry | TASK-014,015 |
| lead.received / lead.deduplicated / lead.qualified | Lead ingress → CRM | TASK-022,023,042 |
| crm.contact.created / identity.linked / identity.merged | CRM → Inbox and campaigns | TASK-042,043,053 |
| crm.opportunity.stage_changed / opportunity.won | CRM → CAPI, Campaign Intelligence | TASK-044,068 |
| inbox.conversation.created / message.received | Channel adapter → Inbox | TASK-045,046 |
| inbox.message.send_requested / delivery_updated | Inbox → channel worker | TASK-045 |
| inbox.assignment.changed / ownership.acquired / handoff.completed | Inbox → agent presence, bot suppression | TASK-047,075 |
| automation.execution.requested / step.completed / dead_letter | Workflow engine → scheduler/workers | TASK-048,049 |
| ai.suggestion.requested / suggestion.created / feedback.received | Inbox → AI Gateway/analytics | TASK-050,051 |
| ads.draft.created / campaign.approval.requested / budget.change.approved | Ads → approval/execution | TASK-024,025,071 |
| ads.insights.snapshot.created | Insights ingestion → Campaign Intelligence | TASK-072 |
| campaign.recommendation.created / approved / executed | Campaign Intelligence → approval gateway/Meta adapter | TASK-067,071,074 |
| creative.variant.created / creative.reviewed | Creative Lab → experiment manager | TASK-069,070,073,079 |
| privacy.request.created / deletion.completed | Privacy orchestrator → domain stores/providers | TASK-032,059 |
| developer.webhook.delivery.requested / delivered / failed | Event delivery service → endpoint retry/DLQ | TASK-062 |
| agent.tool.requested / approved / completed / denied | Tool Gateway → domain use case/audit | TASK-074,075,080 |
| meta.change.detected / impact.analyzed | Meta Change Intelligence → capability registry/tasks | TASK-065,076 |

No crear un RabbitMQ queue por endpoint HTTP. La topología de colas debe seguir bounded context, volumen, retry policy, priority and tenant fairness; schema/event version se conserva.

---

## 6. APIs externas de Meta que WhatsBusiness debe consumir

Esta sección no describe rutas que debamos alojar. Son interfaces de tercero que cada adapter debe consumir. El catálogo Meta por operación se mantiene en docs/09; cada operación debe registrar API version, URL oficial, access tier, scopes, asset grants/tasks, eligibility, error mapping, pagination, rate limits, webhook counterpart, pricing y evidence_state.

| Meta product/API | Operaciones que necesita WhatsBusiness | Por qué y cuándo | Adaptadores / TASK |
|---|---|---|---|
| Business Login / OAuth | Start/authorize, callback code exchange, token metadata/expiry, revoke where supported | Conectar cuentas con consent sin pedir password al negocio | Meta OAuth Adapter; TASK-006,007 |
| Embedded Signup v4 | Launch unified onboarding, receive completion payload, exchange/register/connect business assets, subscribe app/assets | Alta guiada de clientes y assets elegibles WhatsApp/Messenger/Instagram Direct | Embedded Signup Adapter; TASK-008,054 |
| Business Management API | Read businesses/accounts/assets, relationships, WABA, phone numbers, templates and related account configuration where permitted | Discovery, inventory and management of delegated assets | Asset/WhatsApp Management Adapter; TASK-009,014,054 |
| WhatsApp Cloud API | Send text/media/template/interactive messages; media upload/retrieve; phone profile/registration operations; message status webhooks | Messaging service and delivery lifecycle | WhatsApp Adapter; TASK-011..013 |
| WhatsApp Business Management | Create/list/read/update/delete templates as supported; inspect quality/status; manage subscriptions/config where supported | Template lifecycle and WABA resources | WhatsApp Management Adapter; TASK-014,015 |
| WhatsApp Flows API | Create/manage/validate/publish Flows, fetch metrics/details; send Flow messages via Cloud API; handle Data Exchange protocol | Forms and structured business journeys | Flow Adapter; TASK-016 |
| WhatsApp Marketing Messages API | Onboard/check eligibility, submit marketing sends, query supported marketing status/analytics/cost signals | Promotional messaging through current dedicated surface | Marketing Messages Adapter; TASK-017,018,055,057 |
| Pages API / Graph API | Discover Pages; read allowed metadata; create/read/update/delete posts where supported; comments/replies/moderation/insights | Page publishing and community management | Facebook Pages Adapter; TASK-019 |
| Messenger Platform | Send API, attachments/templates/actions, user/profile/conversation events, webhooks and handoff capabilities | Human inbox and support interactions | Messenger Adapter; TASK-019,045,047 |
| Instagram API with Facebook Login | Discover linked professional account, media, publishing, comments, mentions, insights and allowed messaging | Businesses with Page-linked Instagram Professional accounts | Instagram FB Login Adapter; TASK-020,021 |
| Instagram API with Instagram Login | Professional account discovery, publish/comments/messages/insights according to new login permission family | Use when target capability and account flow require Instagram Login | Instagram Login Adapter; TASK-020,021 |
| Lead Ads / Lead Retrieval | Subscribe Page leadgen field; retrieve lead by ID; bulk retrieve by form/ad; test leads and form metadata where supported | Real-time plus historical lead ingestion and repair | Lead Ads Adapter; TASK-022,023 |
| Marketing API | Read ad accounts; campaigns/ad sets/ads/creatives CRUD as permitted; targeting; previews; pause/activation; Insights sync/async reports | Campaign management and performance analytics | Ads Adapter; TASK-024,025,072 |
| Conversions API | Submit server events, inspect diagnostics/test events and quality indicators where supported | Feed CRM outcomes with consent/dedupe | CAPI Adapter; TASK-026,068 |
| Threads API | Profile, create/publish media/text, replies and insights where supported | P2 social expansion | Threads Adapter; TASK-033 |
| Calling API | Call setup/permissions/events where account/country/channel eligibility is proven | Voice as optional capability, never assumed globally | Voice Adapter; future capability |
| Meta Ads MCP / official agent surfaces | Allowed draft/preview/reporting tools with staged write and explicit approval | Interoperate with Meta-native assistants without bypassing approval | Meta Agent Adapter; TASK-074 |
| Meta Business Agent Platform | Context, handoff, conversation ownership and event integration only where available for account/country/channel | Coordinate Meta agent and human/WhatsBusiness inbox | Business Agent Adapter; TASK-075 |

### 6.1 Representative Meta resource operations (illustrative)

La forma exacta del path Graph, fields, version prefix and permission set must be taken from the official docs/collection for the operation and pinned in its adapter contract. Representative resource families:

- WhatsApp messages: POST /{PHONE_NUMBER_ID}/messages.
- WhatsApp templates: GET/POST /{WABA_ID}/message_templates and get/update/delete by template ID where supported.
- WhatsApp media: upload by phone number and retrieve by media ID.
- Lead Ads: Page webhook subscription with leadgen field; retrieve a lead via lead ID and bulk retrieve via FORM_ID or AD_ID leads edge according to permissions.
- Ads: ad account resource act_{AD_ACCOUNT_ID}; campaigns, adsets, creatives and ads resources; Insights at account/campaign/adset/ad granularity and asynchronous report jobs as needed.
- Messenger: Send API on /me/messages with Page token and pages_messaging, subject to recipient/policy windows.
- Instagram publishing: create media container then publish container; comments and Insights use separate edges/capabilities.
- CAPI: submit server events to the relevant Pixel/Dataset event endpoint with stable event identity and consent checks.
- Flows: Flow management endpoints plus encrypted Data Exchange endpoint; not one generic messages payload.
- Threads: use its own authorization and publishing/reply surfaces; do not assume Instagram endpoint parity.

### 6.2 Fuentes normativas de consulta

- Meta official WhatsApp Business Platform Postman workspace: https://www.postman.com/meta/whatsapp-business-platform/overview
- WhatsApp Cloud API Postman documentation: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- Embedded Signup documentation: https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup
- Meta official Facebook Marketing API workspace: https://www.postman.com/meta/facebook-marketing-api/overview
- Marketing API onboarding collection: https://www.postman.com/meta/facebook-marketing-api/collection/9jo4f5y/mapi-onboarding
- Messenger Platform official Postman workspace: https://www.postman.com/meta/messenger-platform-api/overview
- Messenger Send API collection: https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api
- Instagram API official collection: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Lead retrieval setup reference: https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md
- Graph API docs: https://developers.facebook.com/docs/graph-api/
- Marketing APIs docs: https://developers.facebook.com/docs/marketing-apis/
- WhatsApp Cloud API docs: https://developers.facebook.com/docs/whatsapp/cloud-api/overview
- WhatsApp Business Management docs: https://developers.facebook.com/docs/whatsapp/business-management-api
- WhatsApp Flows docs: https://developers.facebook.com/docs/whatsapp/flows
- Messenger docs: https://developers.facebook.com/docs/messenger-platform/
- Instagram Platform docs: https://developers.facebook.com/docs/instagram-platform/
- Threads docs: https://developers.facebook.com/docs/threads/
- Conversions API docs: https://developers.facebook.com/docs/marketing-api/conversions-api/

Las colecciones oficiales de Postman facilitan ejemplos de requests, pero no reemplazan las condiciones de App Review, access tier, business verification, asset grants y eligibility de una cuenta real. Las fuentes se revalidan antes de cada integración.

---

## 7. Matriz de correlación completa US → TASK → API

Esta matriz es la referencia para verificar cobertura. Una TASK puede producir infraestructura, pruebas o documentación sin crear endpoints; eso se señala expresamente. La ausencia de una ruta no debe resolverse inventando endpoint: se registra como tarea transversal.

| US / requisito | TASK | APIs/contratos principales | Resultado de aceptación |
|---|---|---|---|
| US-001 Tenant isolation | TASK-001..003 | PLT-003..006, IAM-002..007, tenant context middleware, RLS policy | Cross-tenant deny; job/cache/storage isolation |
| US-002 RBAC/ABAC | TASK-004..005 | IAM-013..020, PLT-005, audit events | Allow/deny matrix, step-up, dual-control, audit |
| US-003 Meta onboarding | TASK-006..008,054 | META-001..009, OAuth/ESU callbacks | state/replay, token vault, scopes and revocation |
| US-004 Assets/capability | TASK-009..010,056 | META-010..016, WA-001/002 | Asset graph, grant drift, capability explainability |
| US-005 WhatsApp messages | TASK-011..013 | WA-001..009, INB-003..005, WH-002 | Adapter contract, media, delivery state and policy |
| US-006 Templates | TASK-014..015 | WAM-001..009 | Schema/revision/preview/status and approved-only sends |
| US-007 Flows | TASK-016 | WAF-001..008, WH-008 | Encryption, versioning, Data Exchange and response correlation |
| US-008 WhatsApp marketing/costs | TASK-017..018,055,057 | WAMK-001..007 | Eligibility, marketing route, rate card, estimate/actual reconciliation |
| US-009 Pages/Messenger | TASK-019 | FB-001..014, WH-003 | Page task/scope matrix, policy window, human handoff |
| US-010 Instagram | TASK-020..021 | IG-001..012, WH-004 | Login-mode and capability/contract tests |
| US-011 Lead Ads | TASK-022..023 | LEAD-001..010, WH-005 | Durable webhook, historical sync, provenance and dedupe |
| US-012 Campaigns/Ads | TASK-024..025 | ADS-001..027, IAM-018..020, WH-006 | Draft/validate/approve/execute/reconcile, kill switch |
| US-013 CAPI | TASK-026,068 | CAPI-001..004 | Consent, event ID, dedupe and diagnostics |
| US-014 Webhooks | TASK-027..028 | WH-001..008, OPS-003..005, event envelope | Durable ACK, at-least-once consumer, DLQ/replay |
| US-015 Observability/audit | TASK-029..030 | OPS-001..006, PLT-001/002 | trace/correlation, redaction, SLO and immutable audit |
| US-016 Security/privacy | TASK-031..032,059 | PRIV-001..010, OPS-007/008 | threat controls, DSR, deletion evidence, legal review |
| US-017 Threads | TASK-033 | TH-001..006, WH-007 | New adapter, version policy and conformance |
| US-018 CRM contacts | TASK-042..043,053 | CRM-001..013, LEAD-010 | namespace identity, custom fields, reversible merge |
| US-019 Sales pipeline | TASK-044 | CRM-014..017, SALES-001..014 | configurable transitions, timeline, assignments |
| US-020 Unified Inbox | TASK-045..046 | INB-001..005, INB-015..017, WA/FB/IG channel send/read | canonical model with native channel extension; UI E2E |
| US-021 Teams/assignment/handoff | TASK-047 | INB-006..014, INB-018 | concurrent lease, private notes, no duplicate replies |
| US-022 Rule automation | TASK-048..049 | AUTO-001..013, domain events | immutable versions, simulation, idempotency, kill switch |
| US-023 AI/chatbots | TASK-050..051 | AI-001..008, AGT-002 | suggestions only, no auto-send, eval/redaction/cost controls |
| US-024 Tenant/plan admin | TASK-052 | IAM-001..012, BILL-001..007, PLT-006/007 | lifecycle, entitlement, audit and support JIT |
| US-025 Partner access | TASK-058 | PAR-001..007 | bounded grants, expiry/revocation, no inherited cross-tenant data |
| US-026 Billing transparent | TASK-057,063 | WAMK-004..007, BILL-001..007, AI-004 | separate ledgers, rate card version and reconciliation |
| US-027 Public API/Webhooks | TASK-062 | DEV-001..011 + published OpenAPI/event schemas | scoped credentials, rotation, HMAC, retry/replay |
| US-028 Market validation | TASK-066 | No product API. Research repository/artifacts and pilot analytics only | interview evidence, ICP, willingness-to-pay; no fictional API |
| US-029 Campaign Intelligence | TASK-067,068,071,072,077,078 | CI-001..008, ADS-022..027, CAPI-001..004 | provider metrics vs CRM outcome, recommendation evidence, +20% caps |
| US-030 Creative Lab | TASK-069,070,073,079 | CI-009..018, ADS-014..019, ADS-017 | provenance, distinct variants, previews, isolated tests and approval |
| US-031 Agents interoperability | TASK-074,075,080 | AGT-001..006, INB-010..013, CI-005..007 | agent scopes, approvals, leases, no bypass/direct writes |
| US-032 Meta change intelligence | TASK-065,076 | OPS-009..011, META-016 | dated official source, impact graph, draft migration, no auto-approval |

### 7.1 TASK sin API de producto directa (y por qué)

| TASK | Tipo de trabajo | Artefacto / evidencia esperada |
|---|---|---|
| TASK-039 | Architecture Spike | Prototipo desechable, mediciones, RLS/pooling, RabbitMQ/outbox, restore y ADR evidence |
| TASK-040 | Traceability | REQ ↔ US ↔ AC ↔ TASK ↔ API ↔ module ↔ test ↔ evidence mapping |
| TASK-041 | SRE/FinOps design | SLO/RPO/RTO, workload model, VPS budget and owner approval |
| TASK-060 | Performance engineering | Reproducible benchmark scripts and measured capacity |
| TASK-061 | DR/SRE | Backup/restore/key recovery/failover drill |
| TASK-064 | Frontend accessibility | WCAG journey tests/manual audit; no backend endpoint |
| TASK-066 | Product discovery | ICP interviews, market evidence and willingness-to-pay |
| Cross-cutting TASK-031 | Secure SDLC | SAST/SCA/DAST/pentest/CI gates |
| Cross-cutting TASK-029/030 | Observability/audit | Instrumentation, dashboards, audit store and redaction |

TASK-034..038 son especificaciones funcionales y están detalladas en docs/37..41; no deben confundirse con endpoints implementados.

---

## 8. Secuencias de uso principales

### 8.1 Login y selección de tenant

OIDC → PLT-003 → PLT-004 → PLT-005.  
Si no hay membership/grant activo, denegar. La UI carga navigation según permisos y entitlements, pero cada request vuelve a validar el contexto.

### 8.2 Conectar Meta y preparar un canal

META-002/META-005 → autorización Meta → META-003/META-006 → META-004 → META-010 → META-011 → META-013/META-014.  
Solo después de capability allow con evidencia suficiente la UI habilita los módulos/acciones.

### 8.3 Entrada de mensaje y respuesta humana

WH-002/003/004 → durable inbox → channel processor → CRM identity resolution → INB-001/002/003 → assignment/ownership → INB-004 o WA-003/FB-012/IG-011 → adapter → receipt webhook → INB-005.  
Duplicados y eventos fuera de orden no duplican ni degradan estados.

### 8.4 Captación de Lead Ads a venta

WH-005 o LEAD-003 → LEAD-005/006 → CRM-007 → CRM-002/006 → LEAD-007 → SALES-001/007 → SALES-010 won/lost → CAPI-001/002 cuando consent y purpose lo permiten → CI-001/003/078.  
Se mantienen por separado lead source, attribution provider, conversion event y revenue real conciliado.

### 8.5 Campaña/creative con gasto controlado

ADS-003/010/014/015/019 → ADS-006 + ADS-016 → CI-010/011 test cell → ADS-013 budget request → IAM-019/020 approval → CI-005/006/007 o ADS-007/008 → adapter Meta → ADS-027 reconcile → ADS-022 insights sync.  
Nunca ejecutar a partir de un simple texto o una sugerencia IA.

### 8.6 Workflow y sugerencia IA

AUTO-002 → AUTO-005 → AUTO-006 → AUTO-007 → event trigger → AUTO-009/010.  
Una acción de respuesta puede solicitar AI-001, producir draft y esperar acción humana. AI-001 no llama WA-003/INB-004 por sí misma.

### 8.7 API pública de integrador

DEV-002 crea credential scoped → DEV-006 registra endpoint → DEV-009 subscribe event types → outbox event → DEV-010 delivery → HMAC/timestamp → retry/DLQ → DEV-011 manual retry autorizado.

---

## 9. Correlación API → TASK → módulos → pruebas

Además de la matriz US/TASK, cada API ID debe tener estos campos en su issue/PR/work packet:

- API ID(s) y método/path exacto.
- Bounded context owner y código module owner.
- TASK/US/AC y ADR/CR relacionados.
- Request/response schema + error schema.
- Permission key, tenant scope, asset/capability check y purpose.
- Idempotency/concurrency/transaction semantics.
- Audit event y observability dimensions.
- Data classification/retention.
- Unit, integration, contract, security, concurrency and E2E test IDs.
- External API adapter operation IDs y fuentes oficiales.
- Rollout/feature flag/rollback.
- Evidence artifact URL y reviewer distinto del implementer.

Una TASK no se puede cerrar si le falta alguno de estos puntos aplicables. Una API no se declara implemented por estar en este documento o en OpenAPI; requiere código y tests.

---

## 10. Prioridad de implementación y dependencias

La prioridad del producto no significa que todos los endpoints se construyan en paralelo. Orden recomendado:

1. **Foundation:** PLT, IAM esencial, OPS audit, PostgreSQL/RLS, event envelope, health/ready y CI.
2. **Meta Control Plane:** META OAuth/ESU, credentials vault, asset registry y capability registry.
3. **Vertical slice inicial:** selector tenant + conexión Meta en sandbox + inventario/capability view, sin envío real.
4. **Webhook platform y WhatsApp:** WH-001/002, WA-001..009, WAM-001..009, durable delivery state.
5. **CRM + Inbox:** CRM-001..013, LEAD-001..010, INB-001..018; probar un canal extremo a extremo.
6. **Automation + AI:** AUTO-001..013 y AI-001..008 con fixture/synthetic first, no external provider real hasta approvals.
7. **Social:** FB/IG adapters y tests por login mode/capability.
8. **Leads/Ads/CAPI:** draft/preflight/approval/reporting primero; real spend solo después de permission, risk and owner gates.
9. **SaaS/API pública/partners:** PAR, BILL, DEV con security review.
10. **Campaign Intelligence/Agents:** CI/AGT una vez existan señales confiables, audit, approval, budget guards y ownership lease.
11. **Threads/Voice:** solo después de confirmar capabilities y acceso por cuenta/país.

TASK-039/G0 precede al scaffold productivo de acuerdo con docs/46. Esta secuencia no elimina la posibilidad de review paralela de especificaciones y ejecución del spike.

---

## 11. Qué no se debe crear

Para evitar sobrearquitectura, duplicación o superficie insegura:

- No construir un endpoint genérico /meta/proxy que acepte path/verb libres y use token del tenant.
- No exponer access tokens Meta, App Secret, signing keys ni claves privadas por API.
- No construir un CRUD universal para todos los objetos Meta con tipos/estados planos.
- No tener endpoints de envío por canal que se salten policy/capability; los adapters son internos y llamados por Inbox/Use Cases.
- No crear endpoint REST para cada evento RabbitMQ. Eventos internos no son endpoints HTTP.
- No crear APIs para leer scores privados de Andromeda/GEM.
- No exponer un endpoint que aumente presupuesto sin guardrail, aprobación e idempotency.
- No permitir que AI/MCP invoque directamente Meta API, DB, shell o herramientas fuera del registry.
- No asumir que todos los tenants tienen las mismas funciones, versiones, scopes, assets o regiones.
- No crear endpoints para features que la API oficial o la cuenta no soportan; la capability se presenta como disabled/unknown con explicación.

---

## 12. Criterios de completitud del inventario

Este inventario se considera **listo para planificación de implementación**, no para release, cuando:
- Cada US-001..032 está enlazada a TASK, API IDs o justificación explícita de "no direct API".
- Cada TASK-001..080 está enlazada a APIs/eventos/infra/QA/documentación o marcada como discovery.
- Cada API ID tiene contrato OpenAPI, owner, permission, tenant boundary, audit, idempotency y tests aplicables.
- Cada adapter Meta tiene operation record por endpoint/version, source URL/date, scopes, grants, app review, eligibility, webhook, rate limit, errors y evidence state.
- Los paths propuestos son revisados para consistencia, duplicidad y naming por API Owner.
- OpenAPI/AsyncAPI y la matriz docs/19 coinciden con este inventario.

### Estado actualizado de contratos después de docs/48–50

- El catálogo HTTP contiene 289 operaciones REST propias y 8 rutas de webhook ingress. OpenAPI ya registra las 297 rutas con API ID, operationId y trazabilidad.
- Solo PLT-001..005 tienen schemas de diseño concretos; los demás se marcan catalog-only y siguen bloqueados para implementación hasta congelar payloads, errores, autorización y controles en docs/49.
- AsyncAPI y JSON Schema definen 55 tipos de eventos v1.0.0 con envelope compartido y payloads mínimos cerrados. Esto no demuestra producers/consumers, outbox, broker, DLQ ni tests implementados.
- docs/48 establece el estándar obligatorio anti-spaghetti y de reutilización; docs/49 define el freeze de contratos y gates Meta; docs/50 define eventos e idempotencia.

Sigue pendiente asignar owners/reviewers reales, ejecutar TASK-039/G0, completar schemas de negocio para las rutas catalog-only según prioridad, instalar validadores/contract tests en CI después del scaffold y probar adapters con app/cuenta autorizada. La documentación no sustituye esas evidencias.

---

## 13. Estado y decisiones

- Este documento define el inventario maestro de APIs propias y las familias Meta que se consumen.
- Las rutas son propuestas de contrato. Se deben revisar antes de congelarlas en OpenAPI.
- Los endpoints que impliquen coste, data transfer, write externo, publicación, gasto o borrado se mantienen detrás de policy/approval.
- Las capacidades Meta son dinámicas por API version, cuenta, país, scopes, asset tasks, App Review y access tier.
- Product Owner conserva aprobación final de scope comercial, riesgo alto, costes, datos reales y producción.


## 7.2 Matriz individual TASK → API ID / entregable

La matriz anterior agrupa tareas por historia para facilitar lectura. Esta tabla desglosa las TASK del backlog una por una. "Sin API" significa que la tarea produce infraestructura, investigación, configuración, seguridad, benchmark o documentación, no que deba inventarse una ruta REST.

| TASK | US | API IDs / entregable exacto | Tipo / evidencia de cierre |
|---|---|---|---|
| TASK-001 | US-001 | PLT-004..007, IAM-002..004 | Tenant model, lifecycle, constraints, migrations + API tests |
| TASK-002 | US-001 | PLT-003..005 | Tenant context middleware/guard, negative cross-tenant tests |
| TASK-003 | US-001 | Sin API REST; queue/cache/storage namespace and telemetry partitioning | Isolation infrastructure + tests |
| TASK-004 | US-002 | IAM-007..017, IAM-018..020 | RBAC/ABAC policy matrix + allow/deny tests |
| TASK-005 | US-002 | IAM-018..020, OPS-001..002 | Step-up, approval separation, immutable audit |
| TASK-006 | US-003 | META-002..004, META-009 | OAuth state/PKCE/callback, replay and redirect tests |
| TASK-007 | US-003 | META-004, META-007..009 | Token vault adapter, rotation/revocation drill; secret refs never returned |
| TASK-008 | US-003 | META-005..006 | Embedded Signup onboarding saga and authorized account evidence |
| TASK-009 | US-004 | META-010..013 | Asset sync/registry, relationship and grant tests |
| TASK-010 | US-004 | META-013..016 | Capability descriptor, explainability and version matrix |
| TASK-011 | US-005 | WA-001..005, WA-009 | WhatsApp adapter send/read contract tests |
| TASK-012 | US-005 | WA-006..007 | Secure media lifecycle, MIME/size/malware/expiry tests |
| TASK-013 | US-005 | WA-004..005, WA-008, WH-002, INB-005 | Delivery state machine, duplicate/out-of-order receipts and reconciliation |
| TASK-014 | US-006 | WAM-001..005 | Template CRUD/sync adapter and Meta status mapping |
| TASK-015 | US-006 | WAM-006..007 | Template schema/revision/preview and approved-only sending tests |
| TASK-016 | US-007 | WAF-001..008 | Flow versioning, encryption/Data Exchange and replay tests |
| TASK-017 | US-008 | WAMK-001..003 | Marketing Messages adapter, eligibility and policy contract tests |
| TASK-018 | US-008 | WAMK-004..007 | Rate card, cost ledger and reconciliation tests |
| TASK-019 | US-009 | FB-001..014, WH-003 | Pages/Messenger adapters, Page task/scope and messaging-window tests |
| TASK-020 | US-010 | IG-001 | Instagram login-mode selection, account type, scopes and capability matrix |
| TASK-021 | US-010 | IG-002..012, WH-004 | Publish/comments/DM/insights contract tests by login mode |
| TASK-022 | US-011 | LEAD-001..004, LEAD-009, WH-005 | Leadgen webhook, historical retrieval, checkpoint and dedupe tests |
| TASK-023 | US-011 | LEAD-005..008, CRM-002, CRM-005..007 | Lead provenance/lifecycle, routing and consent tests |
| TASK-024 | US-012 | ADS-001..012, ADS-014..020, ADS-006 | Campaign/adset/creative/ad draft, validate and approval path |
| TASK-025 | US-012 | ADS-007..008, ADS-013, ADS-021..027, ADS-026, IAM-018..020 | Activation/pause, spend guardrail, kill switch and reconciliation tests |
| TASK-026 | US-013 | CAPI-001..004 | Event ID, consent, action_source, dedupe and diagnostics |
| TASK-027 | US-014 | WH-001..008 | Webhook signature/challenge, durable inbox, size/replay protection |
| TASK-028 | US-014 | OPS-003..005 + internal events section | Event bus, consumer dedupe, DLQ/replay, backpressure and recovery |
| TASK-029 | US-015 | PLT-001..002, OPS-003, OPS-006 | Traces, logs, metrics, SLO dashboards and alert tests |
| TASK-030 | US-015 | OPS-001..002, OPS-008 | Append-only audit, access/export and tamper-evidence checks |
| TASK-031 | US-016 | OPS-007..008 + CI security pipeline | Threat model, SAST/SCA/DAST/pentest plan and risk acceptance workflow |
| TASK-032 | US-016 | PRIV-001..010 | Export, rectification, deletion, revocation and retention workflow tests |
| TASK-033 | US-017 | TH-001..006, WH-007 | Threads adapter and conformance/version suite |
| TASK-034 | Discovery/Platform | PLT-003..007, IAM-001..020; docs/37 | Functional identity/tenant specification and review; no code completion implied |
| TASK-035 | CRM | CRM-001..017, SALES-001..014; docs/38 | CRM domain specification/review; contracts and AC validation |
| TASK-036 | Inbox | INB-001..018, WA/FB/IG message operations; docs/39 | Canonical inbox/channel/handoff specification and review |
| TASK-037 | Automation | AUTO-001..013 + internal workflow events; docs/40 | Deterministic workflow specification, retries/locks/kill-switch review |
| TASK-038 | AI | AI-001..008, AGT-001..006; docs/41 | Provider-agnostic AI/security/usage specification; external provider remains gated |
| TASK-039 | Architecture | Sin API REST; docs/45, SP-01..07, ADR-011..020 | Executed spike, measurements, evidence and architecture decision |
| TASK-040 | Traceability | Sin API REST; docs/19, docs/47 | REQ/US/AC/TASK/API/contract/test/module/evidence reconciliation |
| TASK-041 | SRE/FinOps | Sin API REST; docs/13, docs/31, docs/45 | SLO/RPO/RTO, workload/cost model and owner-approved VPS budget |
| TASK-042 | US-018 | CRM-001..004, CRM-011..013 | Contact/profile/custom field schema, tenant and validation tests |
| TASK-043 | US-018 | CRM-005..010 | Provider-scoped identity, collision, dedupe, merge and reversible merge tests |
| TASK-044 | US-019 | CRM-014..017, SALES-001..014 | Pipeline/opportunities/activities, transitions and permission tests |
| TASK-045 | US-020 | INB-001..005, INB-010..013, WA/FB/IG message operations | Canonical conversation/message model, channel extensions and adapter contract |
| TASK-046 | US-020 | INB-001..005, INB-015..017 | Inbox UI/search/filter/composer; E2E, responsive and accessibility tests |
| TASK-047 | US-021 | INB-006..014, INB-018 | Teams, assignments, internal notes, ownership leases and handoff race tests |
| TASK-048 | US-022 | AUTO-001..007 | Workflow definition, versioning, builder, validation and simulation |
| TASK-049 | US-022 | AUTO-008..013 + workflow events | Runtime/scheduler, locks, retries, DLQ, cancellation and kill switch |
| TASK-050 | US-023 | AI-001..004 | AI Gateway/provider adapters, usage ledger, redaction and budgets |
| TASK-051 | US-023 | AI-005..008, INB-013, AGT-002 | Rule chatbot, reply suggestion and human handoff; no auto-send |
| TASK-052 | US-024 | IAM-001..012, BILL-001..002, PAR-007 | Tenant lifecycle, plans/entitlements and support JIT |
| TASK-053 | US-018/020 | CRM-005..010, META-011..015, INB-001..005 | BSUID/phone identity namespaces and WAAC/PMA/WABA asset relation fixtures |
| TASK-054 | US-003 | META-005..006, META-010..015 | Embedded Signup v4 adapter/evaluation, eligible paths and authorized account test |
| TASK-055 | US-008 | WAMK-001..003, META-014..016 | Marketing Messages route, pricing/eligibility, sunset migration and tests |
| TASK-056 | Cross-Meta | META-013..016, OPS-009..011 | API version/access tier/capability/sunset registry with dated evidence |
| TASK-057 | US-008/026 | WAMK-004..007, BILL-003..005 | Max Pricing/cost lifecycle, rate cards and reconciled amount tests |
| TASK-058 | US-025 | PAR-001..007, IAM-005, IAM-018..020 | Partner/agency grants, scoped access, JIT separation and revocation tests |
| TASK-059 | US-016 | PRIV-001..010, OPS-001..002 | Data inventory, retention engine, DSR and subprocessor/transfer legal evidence |
| TASK-060 | Performance/SRE | Sin API REST; scripts/benchmark artifacts, OPS-003/006 observability | Workload, p50/p95/p99/RPS/queue age/saturation and capacity report |
| TASK-061 | SRE/Security | Sin API REST; restore reports/runbooks, OPS-003/006 observability | Encrypted backup/restore, key recovery, failover and measured RPO/RTO |
| TASK-062 | US-027 | DEV-001..011 | Public API credentials, scopes, signed outbound webhooks, retries and rotation |
| TASK-063 | US-026 | BILL-001..007, AI-004, WAMK-005 | Plans, entitlements, immutable usage ledger and invoice integration port |
| TASK-064 | Web UX | Sin API REST; frontend a11y tests | WCAG 2.2 AA user journeys and manual audit |
| TASK-065 | US-014/032 | OPS-009..011, META-016 | Official change/policy evidence, sunset calendar and impact assessment |
| TASK-066 | US-028 | Sin API REST; research artifacts and pilot analytics | ICP/market interview evidence, willingness-to-pay and pilot metrics |
| TASK-067 | US-029 | CI-001..008, CI-003..004 | Campaign Intelligence model, metric taxonomy, snapshots and recommendation lifecycle |
| TASK-068 | US-029 | CAPI-001..004, SALES-010..014, CI-001..003 | CRM closed-loop conversion event and CAPI pipeline |
| TASK-069 | US-030 | CI-014..017, ADS-014..017 | Creative assets, provenance, rights/brand/policy review |
| TASK-070 | US-030 | CI-009..013 | Controlled test cells, hypothesis, budget, overlap and stop rules |
| TASK-071 | US-029 | ADS-013, ADS-026, CI-005..007, IAM-018..020 | +20% operation/rolling-24h guardrail, concurrency, approval and kill switch |
| TASK-072 | US-029 | ADS-022..027, CI-001..003, CI-018 | Insights ingestion, snapshots, checkpoints, freshness and diagnostics |
| TASK-073 | US-030 | ADS-016..017, META-014..016, CI-017 | Advantage+ Creative/preview capability adapter and paused-first gates when required |
| TASK-074 | US-031 | AGT-001..004, CI-005..007, IAM-018..020 | Meta Ads MCP/tool interoperability through draft/approval gateway |
| TASK-075 | US-031 | INB-010..013, AGT-001..003, FB/IG/WA handoff | Meta Business Agent interoperability, lease/echo suppression/handoff |
| TASK-076 | US-032 | OPS-009..011, META-014..016 | Meta API/policy/feature change impact intelligence |
| TASK-077 | US-029 | CI-003..013 | Incrementality/attribution evaluation, holdout, confidence and caveats |
| TASK-078 | US-029 | CI-001..004, CI-018, ADS-024..025 | Campaign health/outcomes dashboard, freshness, CRM revenue/margin |
| TASK-079 | US-030 | CI-014..018, ADS-014..017 | Creative fatigue evidence, new variant pipeline and approval |
| TASK-080 | US-031 | AGT-001..006, IAM-018..020, OPS-001..002 | Secure tool execution gateway/MCP, budgets, idempotency, audit and kill switch |

**Importante:** la matriz es una asignación de diseño inicial. Si al ejecutar la tarea un API ID se divide, fusiona o cambia, el agente debe actualizar docs/47, el OpenAPI/AsyncAPI aplicable, docs/19 y el backlog en el mismo cambio revisado. No se permite que el código diverja silenciosamente de esta matriz.
