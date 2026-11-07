# 30 — Arquitectura objetivo y decisiones técnicas adoptadas

**Corte:** 2026-11-06  
**Estado:** baseline arquitectónica adoptada por delegación explícita del propietario. Los ADR-011..020 están aceptados como dirección técnica, sujetos a architecture spike y criterios de reversión. Esto no significa que el stack esté instalado, medido o desplegado.

## 1. Decisión ejecutiva

Construir un **monolito modular orientado a dominios**, con procesos API y workers separables desde el mismo codebase. No iniciar con docenas de microservicios. Definir límites de dominio, contratos, propiedad de datos y tests desde el primer commit; extraer servicios únicamente cuando métricas de carga, aislamiento, riesgo o ciclo de despliegue justifiquen el coste distribuido.

| Capa | Tecnología elegida | Papel y límites |
|---|---|---|
| Lenguaje backend | TypeScript strict | Un solo lenguaje principal en API, workers, tooling y contratos |
| Backend | NestJS sobre Node.js LTS soportado | API modular, dominio, guards/policies, adapters y workers |
| Frontend | Angular, última major soportada al bootstrap | Panel SaaS, administración, CRM, Inbox y consola de operaciones |
| Monorepo | Nx + pnpm | Grafo de proyectos, límites de módulos, build/test afectados y librerías compartidas |
| Persistencia OLTP | PostgreSQL | Fuente de verdad transaccional; integridad, migraciones y RLS |
| Cache/coordinación | Redis | Cache, rate limit y locks efímeros; no es fuente de verdad |
| Broker | RabbitMQ | Eventos y trabajos asíncronos, routing, acknowledgements y DLQ |
| Archivos | Object storage S3-compatible | Media, exportaciones y artefactos cifrados; proveedor intercambiable |
| Identidad | OIDC + Keycloak self-hosted inicial | Login, MFA y SSO; autorización de negocio permanece en backend |
| Edge | Traefik como ingress inicial | TLS, routing, límites básicos; WAF/anti-DDoS según topología |
| Contenedores | Docker | Imágenes inmutables y despliegue portable |
| Desarrollo/piloto | Docker Compose | Entorno reproducible y piloto single-node con limitaciones explícitas |
| Observabilidad | OpenTelemetry + Prometheus + Grafana; Loki/Tempo candidatos | Métricas, logs, trazas y correlación |
| Contratos | OpenAPI + JSON Schema/AsyncAPI | Contratos versionados de HTTP y eventos |
| Seguridad | OWASP ASVS 5.0.0 | Requisitos medibles, pruebas y evidencia |
| Pruebas | Tooling compatible Nx/Nest/Angular, Testcontainers y Playwright | Unit, integration, contract, E2E, carga y accesibilidad |

Las versiones exactas se fijan al crear el repo mediante versiones LTS/estables soportadas y lockfiles. No copiar números de versión desde este documento. Evitar dependencias end-of-life y revisar compatibilidad framework/runtime al bootstrap.

## 2. Por qué modular monolith primero

Un monolito modular reduce despliegues, fallos de red, consistencia distribuida y carga SRE durante el arranque; API, workers y scheduler pueden escalar por separado aunque compartan repositorio y módulos de dominio. La escalabilidad se obtiene mediante:
- API stateless y réplicas detrás de ingress/load balancer.
- Workers escalados por tipo de cola y backlog.
- Paginación, particionado y optimización PostgreSQL basada en métricas.
- Rate limits y quotas por tenant, producto y asset.
- Cache selectiva; no cachear permisos/capabilities más allá de TTL/reconciliación seguros.
- Backpressure, circuit breakers, DLQ y control de concurrencia.
- Extracción de un bounded context solo con evidencia de cuello de botella, aislamiento regulatorio, propiedad independiente o despliegue autónomo.

**No se considera escalabilidad** añadir complejidad de microservicios sin mediciones. Cada extracción futura requiere ADR, contrato, ownership de datos, migración, observabilidad, rollback y pruebas de consistencia.

## 3. Límites de dominio

| Bounded context | Responsabilidad / propiedad |
|---|---|
| Platform Identity | plataforma, organizaciones, tenants, usuarios, membresías y lifecycle |
| Agency/Partner Access | agencias y relaciones de acceso delegadas y revocables |
| Authorization & Policy | RBAC/ABAC, purpose, consent, suppression, approval y decisiones |
| Meta Control Plane | OAuth, app, onboarding, token lifecycle, conexión y grants |
| Asset & Capability Registry | recursos Meta, vínculos, permisos, access tier y capacidades efectivas |
| Meta Product Adapters | adaptadores versionados: WhatsApp, Pages, Messenger, Instagram, Threads, Leads, Marketing, CAPI |
| Webhook & Event Platform | recepción autenticada, durable inbox, outbox, replay y DLQ |
| Messaging & Inbox | conversaciones, mensajes, receipts, equipos, asignación, notas y handoff |
| CRM | contactos, identidades, empresas, leads, oportunidades, pipeline y actividades |
| Automation | workflows versionados, triggers, conditions, actions, schedule y ejecuciones |
| AI Assistance | gateway de modelos, prompts, sugerencias, evaluación y coste |
| Campaigns & Measurement | Ads, Leads, CAPI, Insights, gasto y conciliación |
| Billing & Usage | planes, entitlements, seats, uso, cargos externos y facturación |
| Audit & Compliance | auditoría append-only, export/delete cases y evidencias |
| Operations | cuotas, reconciliación, health, alertas, incidentes y runbooks |

Cada contexto expone APIs/eventos públicos y es dueño de sus tablas/migraciones; otro contexto no consulta sus tablas privadas ni hace joins directos.

## 4. Topología lógica de ejecución

Angular Web → Traefik/Ingress → NestJS API modular → módulos de dominio y PostgreSQL.  
NestJS API → Redis para cache/rate limit/coordinación efímera.  
Cambios de dominio → transactional outbox → RabbitMQ → Worker Processes.  
Meta APIs ↔ versioned Meta adapters.  
Meta Webhooks → Webhook Ingress → Durable Inbox → RabbitMQ → Workers.  
API/Workers → S3-compatible Object Storage.  
API/Workers → OpenTelemetry Collector → Prometheus/Grafana/centralized Logs/Traces.

Webhook ingress, API y workers pueden ser roles de proceso separados al desplegar, pero no requieren repositorios ni microservicios de dominio separados. El webhook ingress debe persistir durablemente antes de confirmar recepción conforme al contrato del producto; el worker no se ejecuta dentro del ciclo HTTP de entrada.

## 5. Persistencia y aislamiento multi-tenant

### Modelo por defecto
- PostgreSQL compartido en inicio con tenant_id obligatorio en todo agregado/recurso de cliente.
- Esquemas PostgreSQL separados por bounded context cuando ayude a ownership, sin crear schema por tenant en el modelo normal.
- RLS como defensa en profundidad, activada con rol de aplicación que no sea superuser ni tenga BYPASSRLS.
- Tenant context establecido de forma transaccional (por ejemplo SET LOCAL) y limpiado por transaction/pool; prohibido confiar en un tenant_id enviado por el browser.
- Cada query/command comprueba actor, tenant, membership, ownership, purpose, asset grant y policy.
- Jobs, events, cache keys, object keys, exports, search indexes, audit, telemetry y DLQ llevan contexto de tenant validado.
- Los tests negativos cross-tenant son release blocker.

### Aislamiento enterprise
Ofrecer DB o cluster dedicado y claves/policies específicas cuando el plan, contrato, regulación, tamaño o riesgo lo requiera. El enrutamiento a tenant shard se modela desde el inicio; mover un tenant requiere export/import verificado, cutover, reconciliación y rollback.

### Agencias
Una agencia/partner no hereda datos de clientes. Los usuarios acceden mediante PartnerTenantGrant o equivalente, especificando tenant cliente, actor, roles, assets, acciones, finalidad, expiración y revocación. El propietario cliente conserva control y auditoría.

## 6. Eventos, consistencia y trabajos asíncronos

- PostgreSQL es la fuente de verdad; Redis nunca sustituye transacciones/ledger.
- Transactional outbox escribe cambio de dominio y evento en la misma transacción.
- Publicación RabbitMQ at-least-once; consumers idempotentes y deduplicados por event_id/aggregate/version.
- Orden únicamente por aggregate cuando sea requisito; no asumir orden global.
- Webhook inbox durable almacena metadatos y payload nativo protegido conforme a retención; firma/challenge, replay protection y límite de tamaño.
- Retries exponenciales con jitter, límites por tenant/producto, poison-message isolation y DLQ.
- Replay siempre autorizado, auditado, limitado y reproducible.
- Reconciliación periódica repara estados externos desconocidos; HTTP 2xx no es delivery.
- RabbitMQ en producción HA usa colas durables/quorum y nodos redundantes; broker single-node no es HA.

## 7. Meta Control Plane y adapters

- Un adapter por producto Meta y familia de capacidades, con versión explícita y fixtures.
- No asumir que una versión Graph API cubre todos los productos o endpoints; no usar una constante global.
- Para cada operación: versión, endpoint, método, scope, asset tasks, access tier, país/cuenta, App Review, política, rate limit, coste, webhook y sunset.
- Capability decision es la intersección de actor authorization, tenant policy, consent/legal basis, OAuth scopes, asset grants/tasks, app access tier, cuenta/product eligibility y API version.
- Preservar request/response/error nativos redactados y schema version; canonical models no eliminan los campos nativos.
- Onboarding es versionado y desacoplado; evaluar Embedded Signup v4.
- Identidad de contacto no depende de teléfono; soportar BSUID y futuros identificadores Meta.
- Modelar recursos WAAC/PMA y transiciones desde WABA legacy sin hardcodear parent-child fijo.
- Marketing Messages API se integra como vía primaria para WhatsApp marketing; no depender de Cloud API marketing que tiene sunset anunciado para 2027.
- Catálogo y cambios externos: ver [32-RESEARCH-AND-EVIDENCE-REGISTER.md](32-RESEARCH-AND-EVIDENCE-REGISTER.md).

## 8. Estructura de repositorio recomendada

apps/
- api/ — NestJS HTTP API y módulos del monolito
- worker/ — consumers RabbitMQ y jobs de dominio
- scheduler/ — jobs programados y reconciliación
- web/ — Angular SaaS console, CRM e Inbox

libs/
- contracts/ — OpenAPI, AsyncAPI, JSON Schema y DTO públicos
- domain/ — modelos, value objects, policies y domain events
- platform/database — PostgreSQL, migrations, transaction/tenant context
- platform/messaging — outbox, inbox, RabbitMQ, retry/DLQ
- platform/cache — Redis, rate limiting y locks
- platform/identity — OIDC integration y actor context
- platform/security — crypto abstractions, redaction y secrets interfaces
- platform/observability — OpenTelemetry, metrics y correlation
- integrations/meta/{graph,whatsapp,messenger,instagram,threads,marketing,leads,capi} — adapters por producto/versión
- modules/{identity,partners,meta-control-plane,assets-capabilities,messaging-inbox,crm,automation,ai-assistance,campaigns-measurement,billing-usage,audit-compliance}
- ui/ — design system Angular compartido
- testing/ — fixtures, factories y contract harnesses

infra/
- docker/ — images
- compose/ — local/dev/pilot
- observability/ — dashboards/alerts
- deployment/ — artifacts del target elegido tras architecture spike

Reglas de dependencias:
- domain no importa NestJS, Angular ni drivers concretos.
- Los módulos dependen de interfaces/ports y contratos públicos.
- Integrations implementan puertos; no definen reglas comerciales.
- Frontend consume API/contracts; no accede a DB ni reproduce policy decisions críticas.
- No crear un mega shared con lógica mezclada.
- Evitar librerías compartidas entre server/browser que filtren secretos o código backend.

## 9. Frontend Angular

- Arquitectura feature-first: core/ (bootstrap/auth/tenant/telemetry), shared/ (design system sin negocio), platform/ (control global) y features/ (inbox, contacts, crm, automations, ads, integrations, analytics, billing, settings).
- Dentro de una feature: pages, ui, data-access, domain, models y routes según tamaño real.
- Límites Nx/ESLint impiden importar internals de otra feature.
- Lazy loading por feature, guards de UX (no sustituyen autorización backend), estado local por feature y facade/data-access para API.
- Accesibilidad de referencia WCAG 2.2 AA para flujos principales; responsive y teclado desde diseño.
- Design system coherente, documentación de componentes, tokens, estados vacíos/error/loading y pruebas visuales/E2E.

## 10. Seguridad, privacidad y cumplimiento

- OWASP ASVS 5.0.0 como base de requisitos de seguridad; threat model para tenant isolation, OAuth, tokens, webhook, message send, ads spend, AI tool use y export/delete.
- MFA/step-up para operaciones de riesgo, segregación de duties y grants temporales (JIT) para soporte.
- Token vault con envelope encryption; KMS/HSM o proveedor de claves fuera del repositorio; rotación/revocación.
- Datos C3 personales y C4 secretos separados, cifrados y redactados; minimización de payload.
- Retención por clase de dato/tenant configurable y policy versionada; plazos finales tras revisión legal LOPDP.
- Export/delete workflow cubre DB, object storage, search, cache, events, queues y derivaciones; backups tienen política y deadline documentados.
- No enviar PII/contenido sensible a proveedores IA sin base jurídica, configuración, contrato, región y autorización aprobados.
- No ejecutar mensajes masivos, gasto real, publicación o eliminación irreversibles sin controles y aprobación explícita.

## 11. IA y automatización

- AI Gateway con interfaces para proveedor externo y despliegue propio futuro; no atar el dominio al proveedor.
- Primera fase: sugerencias de respuesta y chatbot de reglas/flows; el agente humano edita/envía.
- Output IA = contenido no confiable; prompt injection, exfiltration y tool abuse incluidos en threat model.
- Sin acceso directo libre a DB, tokens, archivos o ejecución de comandos.
- Si se añaden herramientas, cada una requiere schema, purpose, scope, autorización runtime, límites y audit.
- Guardrails por tenant: presupuesto, cuota, modelo, timeout, retry, fallback, kill switch, redacción y región.
- Log de proveedor/modelo/versión, prompt version, tokens/coste, latencia, feedback y evaluación; no guardar más contenido sensible del necesario.
- RAG, voz, agentes autónomos, training y auto-send no forman parte de la entrega inicial.

## 12. Operación, resiliencia y escalado

- Desarrollo local reproducible con Compose.
- Piloto en VPS único solo con aceptación expresa del riesgo single-node, backups verificados y límites claros; no anunciar HA.
- Producción con objetivo 99.9% requiere redundancia de ingress/app, PostgreSQL HA y backup/restore probado, broker redundante, almacenamiento durable y monitoreo fuera del mismo host.
- La decisión de usar Compose, k3s u otro orquestador en producción se toma tras spike de recursos y capacidades operativas; mantener imágenes y configuración portables.
- Autoscaling de API/worker orientado a métricas reales, no solo CPU; backpressure basado en queue depth/age y cuotas.
- Objetivos de planificación: RPO <= 15 minutos y RTO <= 4 horas para tier base, sujetos a restore drills y coste; enterprise puede exigir otro tier.
- SLO candidato: disponibilidad API core 99.9% mensual; no es SLA ni medición histórica. Excluir dependencias Meta en una SLI independiente, pero reportar degradación end-to-end al usuario.
- No fijar umbrales finales de latencia/throughput antes del benchmark. Medir p50/p95/p99, burst, saturación, queue age, error rate, pérdida y recuperación.

## 13. ADRs técnicos adoptados

| ADR | Decisión | Estado | Motivo / condición de revisión |
|---|---|---|---|
| ADR-011 | TypeScript + NestJS + Node LTS | accepted | Productividad, ecosistema, modularidad; revisar soporte LTS/footprint en spike |
| ADR-012 | Angular para web app | accepted | Panel empresarial, estructura por dominio y diseño accesible |
| ADR-013 | PostgreSQL como OLTP; tenant_id + RLS | accepted | Transacciones, constraints y aislamiento en profundidad |
| ADR-014 | RabbitMQ + outbox/inbox para async | accepted | Encolado durable, routing, retry y DLQ; medir footprint/HA |
| ADR-015 | Modular monolith + API/worker roles | accepted | Evita coste prematuro de microservicios; extracción basada en métricas |
| ADR-016 | OIDC; Keycloak como IdP self-hosted inicial | accepted | Portabilidad y control; spike de recursos, backup/upgrade/HA |
| ADR-017 | Docker + Compose para dev/piloto; contenedores portables para producción | accepted | Simplicidad inicial sin presentar single-node como HA |
| ADR-018 | OpenTelemetry + Prometheus + Grafana | accepted | Instrumentación vendor-neutral; centralización de logs/traces se mide |
| ADR-019 | AI Gateway provider-agnostic y human approval by default | accepted | Control de datos, costes, portabilidad y seguridad |
| ADR-020 | Nx + pnpm monorepo con boundaries | accepted | Grafo, dependencias y CI por proyectos; spike valida tooling y build time |

accepted significa elección arquitectónica por delegación del propietario; no significa que haya pasado el architecture spike. Una decisión se puede superseder por un ADR con evidencia, migración y autorización correspondiente.

## 14. Architecture spike obligatorio antes de scaffolding de producción

TASK-039 debe:
1. Crear un prototipo desechable, no producto, del workspace Nx/Nest/Angular.
2. Medir instalación limpia, cold/warm build, typecheck, tests, memoria idle/peak de API/worker/Keycloak/Postgres/Redis/Rabbit/observabilidad y tiempo de startup.
3. Verificar transacciones outbox + RabbitMQ, idempotencia, RLS con pooling y tenant context.
4. Probar un webhook simulado, persistencia durable, ack, consumer, retry y DLQ.
5. Probar migración/backup/restore de PostgreSQL y cifrado de backup.
6. Validar contrato Meta versionado y fixtures; no necesita tokens reales para el spike inicial.
7. Registrar comandos, hardware, versiones, resultados crudos, límites y decisiones de ajuste.
8. No contratar proveedor ni activar gasto recurrente sin aprobación explícita.

**Criterio de salida:** decisión de topología y sizing respaldada por medición; rollback documentado; ningún dato comercial/legal inferido. Después de este gate, el owner técnico puede iniciar el primer vertical slice según docs/31.


## 15. Registros formales de decisión
Los ADR-011..020 completos —contexto, alternativas, consecuencias, seguridad, coste, reversibilidad y triggers de revisión— se encuentran en [33-ARCHITECTURE-DECISION-RECORDS.md](33-ARCHITECTURE-DECISION-RECORDS.md). Esa matriz es normativa junto con este documento.
