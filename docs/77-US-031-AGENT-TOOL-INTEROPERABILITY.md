# US-031 — Interoperabilidad con agentes y herramientas Meta

**Fecha de implementación incremental:** 2026-11-08  
**Historia:** US-031 · **Épica:** EP-14  
**Tareas:** TASK-074, TASK-075, TASK-080  
**Estado honesto:** `in_progress` en las tres tareas; integrado en `environment/local`, CI del HEAD integrado pendiente; no `verified` ni `accepted`.

## 1. Resultado de esta entrega

Se incorporó un núcleo interno para agentes con catálogo de herramientas tipado, validación estricta de argumentos, política tenant/purpose/scope, adaptador de campañas sobre el servicio Ads existente, pasarela de ejecución, adaptador de lectura Meta Ads MCP, primitivas PostgreSQL de idempotencia/rate-limit/auditoría, servidor MCP stateless y coordinación de mensajes Inbox que evita dobles respuestas.

El módulo está registrado en `AppModule` y reutiliza `AdsCampaignApplicationService`. La migración fue renumerada a `0044-agent-tool-runtime.sql` para conservar `0032-meta-oauth-token-vault.sql` y `0043-meta-connection-active-identity-unique.sql` en la historia canónica. No se añadieron rutas HTTP, controllers ni cambios OpenAPI/AsyncAPI. El servidor MCP es una capa de protocolo interna y no un endpoint de red expuesto.

## 2. Arquitectura incorporada

### Dominio

- `apps/api/src/agents/domain/agent-tool-catalog.ts`: catálogo único de siete herramientas Ads; define schemas, efectos, permisos, scopes, propósito, proveedores y reglas de aprobación.
- `agent-tool-input-validator.ts`: validación JSON recursiva, límite de payload/profundidad/nodos, rechazo de propiedades extra y claves de credenciales.
- `agent-tool-policy.ts`: validación fail-closed del actor, tenant, membresía, permisos, purpose, proveedor, recurso, capability, kill switch, presupuesto, quorum, caducidad y confirmación humana.
- `inbox/domain/agent-message-coordination.policy.ts`: deduplicación namespaced por tenant/canal/provider/account/message; descarta ecos salientes/propios y suprime respuestas competidoras cuando la conversación es de un humano u otro agente.

### Aplicación e infraestructura

- `AdsCampaignAgentToolHandler` adapta la pasarela al servicio de campañas existente. No duplica la lógica de campaña ni habla directamente con Meta.
- `AgentToolGatewayService` coordina allowlist, validación, autorización, facts, rate limits, idempotencia, sanitización/redacción y auditoría.
- `PostgresAgentToolInfrastructure` implementa ports de rate limit, idempotencia y audit sobre `DatabaseService.withTenantContextAtVersion`.
- `PostgresAgentToolFactsResolver` obtiene la campaña dentro del tenant y la política runtime. No inventa elegibilidad Meta, aprobaciones ni confirmaciones humanas: cuando no hay adapter verificable, retorna `unknown`.
- `MetaAdsMcpAdapter` acepta únicamente operaciones descubiertas y allowlisted de solo lectura (snapshot, preview, insights, recomendación), con account scope, API version y evidencia temporal. No ofrece ejecución de escritura remota.
- `AgentToolsMcpServer` implementa JSON-RPC/MCP stateless, `server/discover`, `tools/list` y `tools/call`, con metadata de protocolo en cada solicitud y caller autenticado inyectado por una futura frontera HTTP.

### Persistencia

Migration `0044-agent-tool-runtime.sql` incorpora:

- Políticas de runtime por tenant, deshabilitadas por defecto (`enabled=false`) y con kill switch activo (`kill_switch_active=true`).
- Idempotencia única por tenant/actor/tool/key y fingerprint inmutable; los estados terminales `failed` y `outcome_unknown` bloquean reejecuciones ambiguas.
- Buckets atómicos de rate limit por minuto y de mutaciones por hora.
- Auditoría append-only tenant-scoped con correlation ID, purpose, recurso, scopes, estado de aprobación, reason codes y fingerprint seudonimizado del actor del proveedor.
- RLS y permisos `agent.tools.read`, `agent.tools.execute` y `agent.tools.kill_switch.manage`. La administración del kill switch requiere la autorización crítica ya sujeta a aprobación de dos personas.

## 3. Catálogo inicial

| Herramienta | Efecto | Control principal |
|---|---|---|
| `ads.campaign.get` | Read | `ads.read`, tenant y campaña |
| `ads.campaign.draft.create` | Local write | Borrador local + idempotencia |
| `ads.campaign.draft.update` | Local write | Versión optimista + idempotencia |
| `ads.campaign.validate` | Read | Evidencia/preflight existente |
| `ads.campaign.publication.request_approval` | Approval request | Confirmación humana |
| `ads.campaign.publication.stage` | External write staging | Aprobación independiente ligada al snapshot + confirmación humana + Meta capability vigente |
| `ads.campaign.pause.request` | External write staging | Confirmación humana + Meta capability vigente; excepción de kill switch por ser reducción de gasto |

La etapa de publicación solo puede crear el comando durable del dominio Ads cuando el gateway obtiene evidencia completa. No ejecuta directamente una petición HTTP a Meta. Una respuesta de proveedor ambigua se guarda como `outcome_unknown`, sin retry automático.

## 4. Coordinación Inbox y Meta Business Agent

La política nueva se combina con los modelos existentes de ownership lease, handoff y reply authority (`ownership-lease.policy.ts`, `handoff-policy.ts` y `reply-authority.policy.ts`):

1. Solo un evento inbound de speaker customer y lease activo de WhatsBusiness puede habilitar una respuesta de WhatsBusiness.
2. Mensajes outbound y ecos propios no vuelven al ciclo como nuevos mensajes.
3. Si el owner es human, Meta Business Agent u otro partner agent, la automatización competidora se suprime.
4. Un delivery repetido con el mismo ID y payload se clasifica como duplicate; un mismo ID con payload distinto pasa a revisión manual.
5. Elegibilidad Meta Business Agent desconocida se trata como `manual_review`, no como permiso.

Esto es una política de coordinación, no un webhook consumer ni un dispatcher. El lease sigue dependiendo de la persistencia/CAS de Inbox ya definida.

## 5. Matriz US-031

| Criterio | Cobertura incorporada | Estado |
|---|---|---|
| AC-031-01 Registro actor/provider/purpose/tenant/recurso/scope/aprobación | Gateway + registro append-only; proveedor seudonimizado; campaña tenant-scoped. La atribución durable de eventos Inbox aún depende del consumer. | Parcial |
| AC-031-02 Ads/MCP drafts, preview e insights con elegibilidad; publicación con approval | Siete tools internas, handler reutiliza Ads y adaptador MCP read-only con capability evidence. OAuth real, discovery/provider runtime y aprobación/confirmación cableadas no están disponibles. | Parcial |
| AC-031-03 Ownership/handoff Meta BA–WhatsBusiness, sin loops/doble reply | Política de coordinación/dedupe + reuse de ownership lease/handoff/reply authority. Persistencia, consumer, webhook provider y elegibilidad por país/canal pendientes. | Parcial |
| AC-031-04 MCP con scopes/schema/rate limit/audit/human confirmation | MCP stateless interno, schemas, autorización, rate limit PG, idempotencia, auditoría y confirmación fail-closed. Falta OAuth resource server, transporte HTTP, evidence provider y API contract freeze. | Parcial |
| AC-031-05 Sin OpenWA/WhatsApp Web ni bypass | Proveedores excluidos del catálogo y policy. | Implementado en este boundary; validar CI y revisión |

## 6. Tests incorporados

Las nuevas suites se registraron en `apps/api/project.json` (`api:test` e `inbox-domain-test`):

- `agent-tool-input-validator.spec.ts`
- `agent-tool-policy.spec.ts`
- `agent-tool-gateway.service.spec.ts`
- `postgres-agent-tool-infrastructure.spec.ts`
- `meta-ads-mcp.adapter.spec.ts`
- `agent-tools-mcp.server.spec.ts`
- `agent-message-coordination.policy.spec.ts`

Los tests cubren validación de schema, tenant/scope/purpose/provider, aprobación ligada a fingerprint y recurso, self-approval, kill switch, idempotencia/replay, resultado ambiguo sin retry, redacción, rate limits, metadata MCP, capability Meta desconocida y prevención de loops/double replies.

Las siete suites de dominio/aplicación se integraron en `apps/api/project.json` y se ejecutan como parte de `api:test`. Source CI del HEAD `19cb7da` está ejecutándose; no se declarará PASS hasta que el pipeline termine y las tres suites independientes queden verdes.

## 7. Límites y gates que permanecen

- **TASK-074 — `in_progress`:** no hay credenciales OAuth reales, remote MCP transport configurado, Meta account capability resolver ni fixtures/sandbox de cuenta. El adapter acepta únicamente lectura; publicación externa sigue bajo el gate Ads actual.
- **TASK-075 — `in_progress`:** no existe aún integración de webhook/consumer de mensajes con dedupe durable, provider identity mapping de Meta Business Agent ni fuente de elegibilidad por país/canal. Las políticas de Inbox no equivalen a handoff ejecutado.
- **TASK-080 — `in_progress`:** no hay HTTP controller ni servidor MCP de red. AGT/INB catalog-only continúan bloqueados por API-CONTRACT-FREEZE + G0. Las fuentes de aprobación humana y capability Meta no conectadas permanecen `unknown`, por lo que external writes no pueden superar policy.
- Las políticas de tenant se crean disabled y kill-switch-active. No hay endpoint de administración/rollout habilitado en esta historia; el despliegue no activa el gateway automáticamente.
- Dependencias TASK-004/024/025/036/045/047/050/051/058/067, contracts y pruebas reales no quedan cerradas por este slice.
- No se efectuó conexión, publicación, pausa, envío ni modificación de una cuenta Meta real. OpenWA/WhatsApp Web no se conectan.
- No se modifica GO-PRODUCTION: permanece NO-GO. La aceptación corresponde al Product Owner después de CI, revisión independiente, contratos/G0 y pruebas autorizadas.

## 8. Archivos principales

`apps/api/src/agents/` · `apps/api/src/inbox/domain/agent-message-coordination.policy.ts` · `apps/api/migrations/0044-agent-tool-runtime.sql` · `apps/api/src/platform/identity/authorization/permission-catalog.ts` · `apps/api/src/platform/identity/approvals/approval-policy.ts`.

