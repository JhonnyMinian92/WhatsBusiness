# 35 — Benchmark técnico de repositorios de referencia

**Fecha de inspección:** 2026-11-06  
**Alcance:** lectura de README, manifests y archivos fuente representativos del branch principal/desarrollo disponible en GitHub. No es auditoría completa del repositorio ni benchmark de rendimiento. No copiar código sin revisar licencia y dependencias.

## 1. Resumen ejecutivo

| Proyecto | Problema que resuelve | Arquitectura visible | Qué podemos aprender | Qué NO debemos copiar como producto |
|---|---|---|---|---|
| Chatwoot | Inbox omnicanal, soporte, CRM ligero, automatizaciones y AI support | Rails/Ruby + PostgreSQL + Redis + Sidekiq; Vue/Vite; channels polymorphic; jobs/events | Modelo Inbox/Conversation/Message, assignment, notes, events, retries, AI, reporting | Stack tal cual, su modelo específico de cuentas, ni asumir que cubre todos los Meta Ads APIs |
| Twilio | Plataforma CPaaS de comunicaciones y SDKs/API de proveedor | APIs gestionadas; SDK Node generado con recursos versionados, paginación, auth, retries, callbacks | Contratos de proveedor, error taxonomy, pagination, region/edge, webhook validation, status lifecycle | Implementar sus SDKs como fuente de verdad; Twilio no es backend abierto comparable |
| httpSMS | Gateway que utiliza teléfono Android del usuario para SMS vía HTTP | Go Fiber API, CockroachDB, Cloud Tasks/queues, Redis; Nuxt frontend; app Android Kotlin + FCM | Device registry, queue/lease/expiry, backpressure, delivery status, webhooks, E2E tests/emulator | Utilizar teléfonos físicos como transporte core Meta o asumir disponibilidad siempre-online |
| Android SMS Gateway | API de SMS/MMS apoyada en equipos Android, local/cloud | App Android + API servidor, device registration, webhook, CLI/API | Multi-SIM/device, scheduling, rate limiting, cancelación, working hours, E2E cifrado | Confundir SMS carrier con WhatsApp Business Platform |
| OpenWA / wa-automate | Automatización no oficial de WhatsApp Web como API/bot/plugin host | Node monorepo v5, Easy API + SocketClient + runtime browser, drivers, plugins, webhook, MCP | Plugin SDK, API + SSE/HTTP RPC, integration bridge, MCP surface, runtime lifecycle | Integración en producción de WhatsBusiness: no es API oficial de Meta, depende de WhatsApp Web/browser sessions y puede exponer clientes a restricciones, cambios y riesgos ToS |

## 2. Chatwoot — customer engagement / support inbox

**Repositorio:** https://github.com/chatwoot/chatwoot  
**Branch inspeccionado:** develop  
**Licencia declarada en README:** MIT (revisar archivos de licencia y dependencias antes de reutilizar cualquier código).

### Qué resuelve y cómo lo usa el cliente
Chatwoot se presenta como plataforma open-source y self-hosted de customer support que centraliza conversaciones de webchat, email, Facebook, Instagram, X/Twitter, WhatsApp, Telegram, Line, SMS y más. Integra Help Center, contactos, campañas, CSAT, reportes, equipos, etiquetas, notas privadas, mentions, respuestas predefinidas, horarios y auto-responder.

### Diseño observado en el código
- Inbox tiene channel polymorphic (channel_type/channel_id), account_id, business hours, timezone, auto-assignment y miembros. Cada Inbox posee conversaciones, mensajes, contactos y webhooks.
- Conversation conserva account_id, inbox_id, contact_id, team_id, assignee_id, status, priority, waiting_since, first_reply_created_at, status_changed_at, last_activity_at y campaign_id; maneja handoff bot/humano y bot assignment.
- Message distingue incoming/outgoing/activity/template, status sent/delivered/read/failed, content_type, private flag, sender polymorphic, source_id y attachments.
- Los eventos se disparan tras commit; el envío/callback no debe confundirse con persistencia del mensaje.
- Round-robin assignment usa Redis para una cola por Inbox y consulta agentes elegibles/disponibles.
- AutomationRulePendingExecution implementa episodios, estados pending/processing/executed/skipped, locks, unique index, stale recovery y re-check en tiempo de ejecución para que un evento ya obsoleto no se dispare.
- Webhook job usa retries limitados y delivery_id.
- WhatsApp adapter se abstrae por provider_service, pero el archivo inspeccionado todavía contiene rutas API hardcoded en algunos métodos; eso ilustra un riesgo que WhatsBusiness debe evitar.

### Stack y dependencias observadas
- Backend Ruby 3.4 / Rails 7.2.
- PostgreSQL, Redis, Sidekiq/Sidekiq Cron.
- OpenSearch/Searchkick, pgvector, Ruby OpenAI/LLM SDKs y OpenTelemetry en el Gemfile.
- Frontend Vue 3 + Vite + Pinia.
- Tests Vitest, RSpec y tooling de componentes.

### Patrones que se adoptan conceptualmente
1. Separar Inbox (routing + channel + team membership) de Conversation y Message.
2. Un contacto puede tener identidades específicas de canal; los mensajes mantienen provenance, external IDs y source IDs.
3. Las notas privadas deben ser un tipo explícito, nunca un mensaje saliente.
4. Assignment es política y disponibilidad, no solo campo assignee_id.
5. Las automatizaciones deben tener pending execution durable, lock/claim atómico, unique execution episode, stale reclaim, expiry y revalidación de condiciones al disparar.
6. Reportes de CSAT, first response, waiting time y outcomes son datos del producto, no solo métricas UI.
7. Adapters por provider, con capabilities y contratos distintos.

### Limitaciones / cautelas
- Chatwoot es support desk con su propio diseño de cuenta/tenant y licencia; no prueba que un monolito Rails sea necesario para nuestro caso.
- El código de WhatsApp que se inspeccionó usa diferentes versiones de endpoints en distintos métodos (por ejemplo v13/v14/v24); no repetir ese patrón. WhatsBusiness tendrá catálogo/version resolver por operación.
- Su objeto de Message no reemplaza nuestro modelo canónico con extensiones nativas de cada proveedor.
- No reutilizar código sin revisión legal/licencia, security review y atribución correspondiente.

Archivos consultados:
- https://github.com/chatwoot/chatwoot
- app/models/inbox.rb
- app/models/conversation.rb
- app/models/message.rb
- app/models/channel/whatsapp.rb
- app/services/whatsapp/providers/whatsapp_cloud_service.rb
- app/services/auto_assignment/inbox_round_robin_service.rb
- app/models/automation_rule_pending_execution.rb
- app/jobs/agent_bots/webhook_job.rb
- Gemfile, package.json

## 3. Twilio — CPaaS, APIs de mensajería y SDK engineering

**Repositorio:** https://github.com/twilio/twilio-node  
**Branch inspeccionado:** main  
**Naturaleza:** SDK oficial Node.js generado/soportado por Twilio; la plataforma Twilio en sí es propietaria, por lo que este repositorio no es su backend de producción.

### Qué resuelve
Twilio ofrece servicios CPaaS (SMS, WhatsApp a través de su conectividad/servicios, voz, conversaciones y otros servicios). Su SDK Node es la capa de cliente para consumir APIs; no sustituye APIs oficiales Meta cuando conectamos directamente la Meta App del cliente.

### Patrones observados en el SDK
- Recursos tipados por API y versión, con generación automática desde la fuente interna de especificaciones.
- Configuración por credenciales/env vars, subaccounts, region/edge y HTTP client.
- Lazy loading, keep-alive, límites de sockets y timeout.
- Paginación automática con list/each/page; streaming de colecciones evita cargar todo en memoria.
- Retry con exponential backoff para 429, configurable y limitado.
- Errores estructurados tipo RestException con code/status/moreInfo; no tratar todos los 4xx/5xx igual.
- Firma/verificación de webhooks documentada.
- Credentials no deben entrar en código frontend ni bundles.

### Lo que adoptamos
1. Meta adapters con contrato generado/validado por version, endpoint, request/response/error schema.
2. Cursor pagination, checkpoint y streaming para Insights/Assets/Leads; no hacer list masivo sin límite.
3. Error taxonomy por proveedor/código HTTP/código Meta/retryability/operation state.
4. 429 y límites de uso con retry/backoff+jitter, Retry-After/headers cuando estén disponibles y cuotas por tenant/asset.
5. Webhook verification y status callbacks como contratos diferentes.
6. Observability de HTTP request/response sanitizado, correlation ID, request IDs de proveedor y duración.
7. SDKs de terceros quedan encapsulados en adapters; los casos especiales Meta no se fuerzan dentro de abstracciones que oculten la API.

Archivos consultados:
- https://github.com/twilio/twilio-node
- README.md
- package.json

## 4. httpSMS — dispositivo móvil como gateway y transporte asíncrono

**Repositorio:** https://github.com/NdoleStudio/httpsms  
**Branch inspeccionado:** main

### Qué resuelve y cómo funciona
Permite usar un teléfono Android del usuario como gateway de SMS con API HTTP. El backend acepta una orden, la encola, responde 202 Accepted, envía push por Firebase Cloud Messaging, la app Android recupera el mensaje y lo envía con Android SMS APIs; luego devuelve resultado y reporte. Mensajes recibidos pueden reenviarse al webhook del integrador.

### Patrones documentados
- Go Fiber API y CockroachDB; Nuxt/Vuetify; app Android Kotlin; Firebase Cloud Messaging; Cloud Tasks/queues; OpenTelemetry.
- Device/app registration explícita y modo self-hosted.
- Backpressure/rate limits para evitar que el carrier bloquee.
- Message expiry, estado pending/sent/delivered/failed y notificación si el dispositivo no cumple.
- Webhooks para SMS entrantes y pruebas end-to-end con emulador/dispositivo simulado.
- El proyecto declara opción de cifrado de extremo a extremo y control local de claves, según su flujo.

### Lecciones para WhatsBusiness
- Un proveedor móvil/dispositivo es un worker remoto y no una simple API síncrona.
- Los comandos necesitan lease/expiry, estados y cancelación antes de ejecutar.
- Una respuesta 202 significa aceptado/encolado, no enviado ni entregado.
- La cola necesita backpressure, tasa por SIM/dispositivo/carrier, heartbeat y health.
- Si más adelante añadimos SMS físico, será un ChannelAdapter separado con explícita elección del tenant; no un fallback invisible a WhatsApp/Meta.

Archivos consultados:
- https://github.com/NdoleStudio/httpsms
- README.md
- api/go.mod

## 5. Android SMS Gateway — flota de dispositivos

**Repositorio:** https://github.com/capcom6/android-sms-gateway  
**Branch inspeccionado:** master

### Qué resuelve
Convierte uno o varios smartphones Android en gateways API/CLI para enviar/recibir SMS, MMS y Data SMS. Admite modo local/cloud, registro y baja explícitos de dispositivos, múltiples SIM, estados, cancelación de pendientes, scheduling, working hours, incoming batch webhooks y soporte self-hosted.

### Lecciones
- Device registry separado de tenant y credentials.
- Capability por dispositivo/SIM/OS/permisos y estado conectado.
- Cola con programación, expiración, cancelación y tasa por carrier/SIM.
- Webhooks batch y mensajes multimedia con referencias de archivo seguras.
- E2E encryption y modo private server pueden ser requisitos de un canal físico.

No es una fuente para integrar WhatsApp ni sustituye Cloud API. Es un posible adaptador futuro si el producto exige SMS carrier.

## 6. OpenWA — automatización no oficial de WhatsApp Web

**Repositorio:** https://github.com/open-wa/wa-automate-nodejs  
**Branch inspeccionado:** master (línea v5).

### Qué resuelve
Toolkit Node para automatizar WhatsApp Web con Easy API, SocketClient, browser runtime embebido, drivers Puppeteer/Playwright/Lightpanda, plugins, webhooks, Cloudflare proxy, Chatwoot integration, Node-RED y MCP tools. v5 organiza runtime, drivers, integrations, sdks y apps en monorepo.

### Patrones técnicos interesantes
- Separación de runtime host y consumers remotos (HTTP RPC para comandos y SSE para eventos).
- Plugin SDK con schema validation y lifecycle hooks.
- Named sessions, session readiness y health endpoints.
- MCP expone métodos como tools con API key obligatoria; tools bloqueadas hasta que la sesión esté lista.
- Integración con Chatwoot mediante webhook bidireccional, normalización y control de loops de mensajes.

### Riesgo y decisión
El README de OpenWA declara que es no oficial y no afiliado a WhatsApp/Meta. Su runtime controla WhatsApp Web/browser sessions, QR/link-code y scripts internos; el proyecto advierte riesgos de uso/cuenta y sus propias guías describen trade-offs y restricciones. La política contractual de WhatsApp/Meta limita el acceso no autorizado, reverse engineering, scraping y automatización de superficies no autorizadas.

**Decisión:** OpenWA queda como referencia técnica de plugins, MCP y session lifecycle; queda prohibido como transporte core o fallback de WhatsBusiness. No enviar clientes a QR sessions, no controlar WhatsApp Web, no copiar métodos internos ni usarlo para evitar permisos/App Review. La integración productiva se basa exclusivamente en APIs oficiales y autorizadas de Meta.

Archivos consultados:
- https://github.com/open-wa/wa-automate-nodejs
- README.md
- packages/core/src/plugins/PluginLoader.ts
- integrations/chatwoot/README.md
- tos.md

## 7. Matriz de decisiones: qué incorporar a WhatsBusiness

| Patrón | Fuente | Adopción |
|---|---|---|
| Inbox separado de canal/conversación/mensaje | Chatwoot | Adoptar |
| Polymorphic channel adapter/capability | Chatwoot | Adoptar conceptualmente, con contrato tipado/por version |
| Assignment round-robin y capacity | Chatwoot | Adoptar con presence leases y fairness medible |
| Durable pending executions y claim/lock/recheck | Chatwoot | Adoptar y fortalecer con idempotency/outbox |
| Provider SDK pagination/error/retry | Twilio | Adoptar |
| Signature validation/status callbacks | Twilio | Adoptar |
| Device leases/backpressure/expiry | httpSMS/Android SMS Gateway | Solo para channel adapters device-based futuros |
| Plugin lifecycle/config schema/MCP boundary | OpenWA | Adoptar concepto, con seguridad y proveedores oficiales |
| WhatsApp Web reverse engineering/session automation | OpenWA | Rechazar |
| Channel-specific adapter + central inbox | todos | Adoptar |

## 8. Límites de esta investigación
- Se revisaron archivos fuente representativos y documentación pública; no se ejecutaron builds ni benchmarks de los proyectos.
- README es una declaración del proyecto, no prueba independiente de seguridad, escala o uptime.
- Twilio SDK es la superficie del cliente, no el backend privado de Twilio.
- OpenWA y los gateways Android no son equivalentes a Meta Cloud APIs.
- Cualquier copia/adaptación de código requiere análisis de licencia, dependency licenses, atribución y security review.
- Los findings se deben revalidar contra la rama/tag actual antes de implementar.

