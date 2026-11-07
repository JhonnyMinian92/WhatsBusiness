# 56 — Revisión arquitectónica, eventos y criterios de aceptación transversales

**Corte de revisión:** 2026-11-06  
**Rama revisada:** `environment/local`  
**Tipo de revisión:** documental y estática sobre contratos y especificaciones.  
**Estado:** dirección arquitectónica coherente; contratos ampliados; cierre técnico bloqueado por validación formal, revisión independiente y evidencia de implementación.

> Esta revisión no es una aprobación independiente de QA/SRE/Seguridad ni una aceptación del Product Owner. No se inspeccionó código de aplicación porque el repositorio continúa sin scaffold productivo verificable. Los estados `implemented`, `verified` y `accepted` no se infieren a partir de documentos.

## 1. Veredicto ejecutivo

1. **No se recomienda superseder ADR-011..025 por intuición.** Como decisiones de dirección, son compatibles con los límites de módulos, el modelo de tenancy y los patrones de integración descritos.
2. **Se corrigió un defecto de OpenAPI:** las 292 operaciones catalog-only tenían dos claves YAML `default` en el mismo objeto `responses`. Se eliminó el placeholder duplicado y se mantuvo una única referencia a `ContractNotFrozen` por operación.
3. **AsyncAPI se amplió:** 69 canales declaran `publish` y `subscribe`; 69 definiciones de mensaje referencian el `correlationId` del envelope.
4. **Los 69 eventos tienen correspondencia declarada uno a uno** entre canal, mensaje y definición JSON Schema; los 14 eventos CRM/Inbox omitidos se añadieron con payload mínimo tipado. Esto no demuestra que existan publishers, consumers, exchanges, colas o ejecución durable.
5. **OpenAPI no está cerrado a nivel de negocio:** continúan 5 operaciones design-frozen y 292 catalog-only. Las 292 siguen pendientes de request/response schemas específicos, permisos por operación, side effects y fixtures.
6. **Los 14 eventos de CRM/Inbox de docs/38 y docs/39 ya están representados en AsyncAPI y JSON Schema.** Se decidió mantenerlos como hechos distintos donde las transiciones son semánticamente distintas (merge request/reversal, accepted/failed, handoff requested/completed, lease expiry). La aprobación final del owner de dominio y los contract tests siguen pendientes.
7. **G0 permanece BLOCKED / NO-GO para scaffold productivo y producción.** TASK-039 no se ha verificado con runtime, servicios, hardware, pruebas de RLS/pooling, broker, webhooks ni restore.

## 2. Alcance y evidencias inspeccionadas

- ADR-011..025 en docs/33; decisiones de protocolos en docs/52.
- Reglas de arquitectura y reutilización en docs/48.
- Identidad/tenancy, CRM, Inbox, Automation y AI en docs/37..41.
- Modelo inicial y threat model en docs/42 y docs/44.
- Inventario API/TASK en docs/47; trazabilidad en docs/19.
- Readiness OpenAPI en docs/49 y docs/55.
- Catálogo y envelope de eventos en docs/50, docs/43 y contracts/asyncapi + contracts/schemas.
- Readiness/ejecución TASK-039 en docs/45 y docs/54.
- Criterios de aceptación de producto en docs/20.

La inspección acredita consistencia documental y ciertas comprobaciones estáticas de contenido. No sustituye parsing/lint completo, contract tests, pruebas de integración o revisión independiente.

## 3. Revisión de decisiones ADR

| Decisión | Evaluación documental | Evidencia pendiente / condición |
|---|---|---|
| ADR-011 — TypeScript strict, NestJS, Node LTS | Coherente con un backend modular tipado y adapters | SP-01/SP-10: instalación congelada, generators, build, lint, typecheck y tests |
| ADR-012 — Angular | Coherente para consola multi-dominio y feature-first | Build real, bundle budgets, accesibilidad y navegación por tenant |
| ADR-013 — PostgreSQL, tenant_id y RLS | Defensa en profundidad adecuada; RLS no reemplaza autorización | SP-02: rol runtime sin BYPASSRLS, contexto transaction-local, pool reuse y pruebas negativas |
| ADR-014 — RabbitMQ + outbox/inbox | Coherente con webhooks, jobs, retries y at-least-once | SP-03/SP-04: publisher confirms, ACK durable, crash/restart, dedupe, DLQ y replay |
| ADR-015 — Monolito modular | Reduce coste operativo temprano y permite procesos API/worker/scheduler | Grafo Nx acíclico y boundaries enforceados antes de aceptar código |
| ADR-016 — OIDC/Keycloak | OIDC desacoplado del proveedor es correcto; Keycloak es candidato operativo | SP-05: issuer/audience/JWKS, MFA/step-up, revocación y restore |
| ADR-017 — Docker/Compose | Adecuado para desarrollo/piloto single-node; no equivale a HA | SP-07 y decisión explícita de topología de producción |
| ADR-018 — OpenTelemetry/Prometheus/Grafana | Observabilidad portable y alineada al flujo HTTP→broker→worker | Cardinalidad, redacción, retención, alertas y huella medida |
| ADR-019 — AI Gateway y aprobación humana | Correcto para output no confiable, minimización y no auto-send | Proveedor, región, DPA, finalidad, costes y uso de datos reales requieren aprobación |
| ADR-020 — Nx + pnpm | Alineado con enforcement de dependencias y monorepo | SP-01/SP-10; compatibilidad exacta Nx 24 + Node 26 pendiente |
| ADR-021 — Delivery Plane vs Intelligence Plane | Evita afirmar control sobre el ranking interno de Meta | Provenance, atribución vs incrementalidad y experimentos reales |
| ADR-022 — presupuesto y acciones externas | El límite interno de +20% y el approval gateway son controles verificables | Implementar límites atómicos, rolling window, kill switch y pruebas de concurrencia |
| ADR-023 — REST/OpenAPI + RabbitMQ/AsyncAPI | Coherente para HTTP síncrono y eventos durables; no usar RPC loopback | Mantener contrato único en API síncrona y canales/eventos; medir antes de introducir GraphQL/gRPC |
| ADR-024 — baseline tecnológica | Fotografía documental razonable al corte, no certificación de compatibilidad | SP-10; revisar patches, CVE, digests, licencias y lockfile al bootstrap |
| ADR-025 — Valkey para cache/coordinación | Decisión por licencia/portabilidad; no implica superioridad de rendimiento | Probar comandos, cliente, Lua, ACL/TLS y failover; nunca convertirlo en source of truth |

**Resultado:** las decisiones se mantienen como `accepted as direction`; ninguna se eleva a `verified`. SP-01..10, los resultados de benchmark y los controles operativos continúan siendo condiciones de validación, no motivos para cambiar el stack sin evidencia.

## 4. Límites de módulos y ownership

| Bounded context / módulo | Dueño de datos y reglas | No debe hacer |
|---|---|---|
| Platform Identity | User, identidad OIDC, Organization, Tenant, Membership, Role/Permission y estado de autorización | Conceder acceso solo por elegir un tenant o por pertenecer a una organización |
| Partner Access | Grants delegados/JIT, alcance, propósito, expiración, aprobación y revocación | Leer tablas privadas de identidad o heredar datos del tenant cliente |
| Meta Control Plane | Connection, credenciales como referencias seguras, assets y capability registry | Exponer tokens, asumir permisos globales o decidir policy de negocio |
| Meta product adapters | Mapping nativo por producto/API version, request/response/error y webhook protocol | Importar reglas de negocio o decidir autorización/consent del tenant |
| CRM | Contact, ContactIdentity, Company, Lead, provenance, dedupe y merge | Convertir coincidencia de teléfono/email en identidad universal o duplicar mensajes |
| Sales | Pipeline, Opportunity, stages, forecast/outcomes y actividades comerciales si se mantiene como contexto separado | Consultar internals de CRM o tratar atribución de proveedor como revenue confirmado |
| Inbox | Conversation, Message canónico, Assignment, OwnershipLease, InternalNote y Handoff | Borrar diferencias de canal, enviar InternalNote al proveedor o equiparar accepted con delivered |
| Automation | Workflow versionado, Execution, ExecutionStep, lock, retry y DLQ de ejecución | Ejecutar código arbitrario, saltarse consent/approval o llamar directamente SDKs externos |
| AI Gateway | Política de datos/modelo, redaction, evaluación, quota y sugerencias | Autorizar al actor, enviar por sí mismo o acceder directamente a DB/secrets |
| Agent Tool Gateway | Allowlist, schema, purpose, scope, approval, execution, audit y kill switch | Ser un proxy genérico de shell/HTTP/DB o aceptar acciones libres del modelo |
| Ads + Campaign Intelligence | Ads controla drafts/mutaciones externas; Intelligence controla snapshots, recomendaciones y experimentos | Fusionar métricas atribuidas con causalidad o ejecutar cambios sin approval |
| Privacy & Compliance | Consent evidence, DSR, retención y orquestación de borrado | Inventar plazos legales o purgar evidencia sujeta a legal hold |
| Developer Platform / Webhook Ingress | Subscription, firma, receipt durable, delivery, retries y DLQ | Confiar en tenant indicado por payload o confirmar recepción antes de persistencia |

### 4.1 Riesgo de ownership por resolver

docs/38 describe Pipeline y Opportunity dentro del modelo CRM, mientras docs/47 mantiene una familia API `SALES` separada. Para evitar doble ownership se adopta como decisión de arquitectura propuesta: **CRM posee Contact, ContactIdentity, Company, Lead y Activity; Sales posee Pipeline y Opportunity**. Sales consume referencias/eventos de CRM y publica cambios de Opportunity; no comparte tablas ni permite joins a tablas privadas de CRM. Las APIs `SALES` son la superficie de producto de ese contexto. Los nombres existentes `crm.opportunity.stage_changed` y `crm.opportunity.won` se preservan como nombres históricos v1; el nuevo `crm.opportunity.lost` sigue esa convención para no introducir una migración de nombres parcial. Un cambio a `sales.opportunity.*` requerirá versión mayor, alias/dual-publish temporal y aprobación del owner.

### 4.2 Reglas de dependencias

- Dependencias entre contextos solo por API pública/port de aplicación o evento versionado.
- Dominio no depende de NestJS, Angular, ORM, RabbitMQ, Valkey ni SDK Meta.
- Infraestructura implementa ports; controllers y webhook handlers son delgados.
- Cada contexto posee sus migraciones y constraints; los demás no consultan sus tablas.
- Dentro del mismo proceso, llamadas directas a use cases/ports; no HTTP/gRPC loopback.
- El grafo de módulos debe ser acíclico y enforced por Nx/ESLint después del G0.
- Shared/platform contiene capacidades transversales pequeñas y cohesionadas, no reglas de CRM/Inbox/Ads disfrazadas de utils.

## 5. Revisión de seguridad multi-tenant

### 5.1 Invariantes obligatorias

1. Validar issuer, audience, firma, expiración y subject del token OIDC.
2. Resolver identidad por `issuer + subject`; email no es clave primaria.
3. Tratar tenantId de ruta/header como selector no confiable, nunca como autorización.
4. Validar membership activa o PartnerTenantGrant vigente y su alcance actor/asset/action/purpose/expiry.
5. Construir ActorContext inmutable server-side; no aceptar actor/role/purpose del frontend.
6. Evaluar permiso + ownership + estado + tenant policy + consent/legal basis + entitlement + capability Meta + approval aplicable.
7. Establecer tenant context con alcance transaction-local (p. ej. `SET LOCAL`) y limpiar siempre al devolver la conexión al pool.
8. Ejecutar con rol de DB no superuser ni BYPASSRLS; RLS fail-closed si no hay tenant context.
9. Namespacing/ownership tenant-scoped para cache, object storage, exports, jobs, search e idempotency records.
10. Un worker revalida tenant, objeto, grants, consent, capability y policy al ejecutar; no confía solo en el envelope/evento.
11. Los eventos de broker son datos no confiables: schema, source, tenant/aggregate match, límites y dedupe antes de actuar.
12. Denegaciones cross-tenant no deben revelar la existencia del recurso; acciones privilegiadas y accesos JIT quedan auditados.

### 5.2 Matriz mínima de pruebas negativas

| Caso | Resultado exigido | Evidencia requerida |
|---|---|---|
| Usuario sin membership solicita tenant ajeno | 403/404 no revelador | API + service integration test |
| Grant expirado/revocado con token aún válido | Denegar | Authorization integration test |
| Manipulación de tenantId/header | No cambia ActorContext autorizado | API security test |
| Recurso de otro tenant por ID propio válido | No read/write/export | BOLA/IDOR test por recurso |
| Reutilización de conexión pool tenant A→B | B no ve datos de A; contexto anterior no sobrevive | PostgreSQL real, runtime role y pool real |
| Falta de tenant context / contexto vacío | RLS falla cerrado | PostgreSQL RLS integration test |
| Evento con tenantId falso o aggregate ajeno | Consumer rechaza y audita | Poison-event/cross-tenant contract test |
| Revocación después de encolar un job | Worker revalida y deniega efecto externo | Worker integration test |
| Clave/cache/idempotency compartida entre tenants | Sin colisión ni lectura cruzada | Cache/storage integration test |
| Partner/JIT grant de alcance excesivo | Acción fuera de asset/action/purpose se deniega | ABAC policy test |

**Resultado:** el diseño documental de tenancy es consistente y defensivo. No hay evidencia actual de que RLS, pool reuse, guards, worker context, cache keys o storage namespaces estén implementados o verificados.

## 6. Contratos OpenAPI — estado y corrección

| Medida | Estado inspeccionado |
|---|---:|
| Operaciones HTTP / API IDs únicos | 297 / 297 |
| Design-frozen | 5 |
| Catalog-only | 292 |
| Catalog-only con request schema pendiente | 292 |
| Catalog-only con response schema pendiente | 292 |
| Catalog-only con requestBody de negocio | 0 |
| Operaciones con `x-implementation-allowed=true` | 0 |
| Referencias comunes de error ContractNotFrozen | 292 |
| Bloques placeholder `default` duplicados eliminados | 292 |

La corrección de la clave `default` elimina un problema de estructura YAML, no completa el contrato de negocio. Cada operación catalog-only necesita, antes de congelarse: parámetros exactos, request/response schema, errores específicos, permiso, tenant/asset boundary, idempotencia/concurrencia, audit/outbox, clasificación/retención, ejemplos, fixtures positivos/negativos y reviewer independiente. El perfil común Problem Details no reemplaza ese trabajo.

Los schemas de Meta deben validarse por producto, versión, login mode, permiso y operación contra fuentes oficiales; una descripción de ruta no autoriza inventar payloads o scopes.

## 7. AsyncAPI y JSON Schema — estado y huecos

### 7.1 Cobertura estructural actual

| Verificación estática | Resultado |
|---|---:|
| Canales lógicos | 69 |
| Operaciones `publish` | 69 |
| Operaciones `subscribe` | 69 |
| operationIds únicos | 138 |
| Mensajes de canal únicos (referencias publish + subscribe) | 69 (138 referencias) |
| Definiciones de payload JSON Schema | 69 |
| Tipos de evento únicos | 69 |
| Correspondencias canal ↔ tipo ↔ definición | 69 / 69 |
| Correlation ID declarado en mensajes | 69 |

Los 69 payloads componen el envelope JSON Schema draft 2020-12; cada tipo fija `type`, `schemaVersion: 1.0.0`, `tenantId` UUID, agregado y datos específicos. Los objetos de payload y agregado se cierran frente a propiedades no declaradas. Se retiró `unevaluatedProperties: true` del envelope base para que el cierre de cada schema compuesto rechace campos desconocidos sin bloquear campos específicos. El envelope genérico permite tenantId null para eventos globales futuros, pero las 69 definiciones actuales lo hacen obligatorio y no nulo.

El mensaje expone la correlación desde `$message.payload#/correlationId`. El routing key lógico es `<event-type>.v1`; las colas/topología física siguen siendo específicas por consumer.

### 7.2 Reconciliación de eventos CRM/Inbox

Los 14 eventos adicionales de docs/38 y docs/39 se incorporaron a AsyncAPI y JSON Schema v1.0.0, con productor/consumidores lógicos y TASK relacionadas en docs/47. Se mantienen separados los hechos de solicitud, aceptación, resultado, expiración y reversión. La revisión formal del owner de dominio y los contract tests siguen pendientes.

### 7.3 Validación que falta

Se actualizaron los JSON schemas, canales, mensajes y referencias para 69 eventos. Se añadió `.github/workflows/contracts-validation.yml` con Redocly, AsyncAPI CLI y AJV 2020-12; `scripts/validate-contracts.mjs` comprueba los 69 canales, 138 operationIds, resolución de referencias y genera fixtures positivos/negativos por evento (tenant no nulo y rechazo de propiedades extra). El workflow aún no tiene resultado confirmado; no se ejecutó aún:
- parser/linter oficial OpenAPI;
- parser/linter oficial AsyncAPI;
- validador JSON Schema con resolución externa y fixtures positivos/negativos;
- compatibilidad producer/consumer ni detección de breaking changes;
- RabbitMQ real, publisher confirms, durable inbox/outbox, manual ACK, retry, DLQ, replay u observabilidad.

Por tanto, el resultado es **verificación estructural estática parcial**, no validación contractual completa ni prueba de runtime.

## 8. Criterios de aceptación transversales

| Área | Criterio de aceptación | Estado actual |
|---|---|---|
| Contratos HTTP | Cada API ID tiene schema, permiso, tenant boundary, errores, idempotencia, audit, fixtures y revisión | **Parcial** — 292 operaciones pendientes |
| Eventos | Todo publish/subscribe tiene mensaje versionado, schema cerrado, correlación, owner y consumers | **Parcial** — 69 estructurados; validación formal, contract tests y runtime pendientes |
| Boundaries | Owner único por agregado/regla, imports públicos, cero dependencias circulares y sin acceso a tablas ajenas | **Diseñado**, no implementado |
| Multi-tenancy | Todas las rutas/jobs/events/files/cache aplican tenant authorization y RLS | **No verificado** |
| Outbox/inbox | Commit de dominio + outbox atómico; ACK tras durable inbox/consumer commit; dedupe persistente | **Diseñado**, SP-03/04 bloqueados |
| Meta integrations | Producto/API version-specific, official source, scopes/grants/capability y account-tested status | **Parcial**, por contrato y evidencia externa |
| Privacy/security | Threat mitigations, purpose/consent, redaction, retention/legal holds, export/delete y supplier review | **Parcial**, legal review requerido |
| Calidad | Unit/contract/integration/E2E/security/concurrency/performance/a11y suites con evidencias | **No ejecutado** |
| Operación | SLO, backup/restore, RPO/RTO, alerts, runbooks, rollback y ownership demostrados | **No verificado** |
| Aceptación de producto | Evidencias end-to-end y aprobación explícita del Product Owner ligada a release candidate | **Pendiente** |

Se deben crear TEST IDs antes de implementar criterios nuevos y completar la cadena REQ → US → AC → TASK → API/event → módulo → test → evidencia en docs/19. No generar IDs AC retrospectivos para aparentar trazabilidad.

## 9. Bloqueos priorizados y siguiente orden de trabajo

1. **P0 — Contratos de plataforma/identidad:** cerrar PLT-006..007, IAM y PAR con owner/reviewer, permisos, request/response y flujos de aprobación basados en docs/37. No congelar schemas solo por inferencia.
2. **P0 — Ratificación de ownership CRM/Sales e Inbox:** obtener aprobación de los owners para el límite propuesto y revisar los 14 contratos añadidos con fixtures/contract tests; la documentación y el mapping ya están actualizados.
3. **P0 — Contratos Inbox y webhook:** completar mensajes/discriminated unions, receipts, signatures, tenant mapping, dedupe y ACK durable por proveedor.
4. **P1 — Meta adapters:** un producto/login mode/versión a la vez, fixtures nativos y evidencia oficial/account-tested.
5. **P1 — Automation/AI/AGT:** schemas de workflow/tool, aprobación, cancelación y side-effect guard; no habilitar proveedores externos antes del gate de privacidad/coste.
6. **P1 — Validadores en CI:** incorporar parser/linter OpenAPI, AsyncAPI y JSON Schema, ref resolution, fixtures y breaking-change gate luego de fijar dependencias en el workspace.
7. **P0 — TASK-039/G0:** ejecutar SP-01..10 con Node/pnpm/Docker/PostgreSQL/RabbitMQ/Keycloak/Valkey y host objetivo, adjuntando comandos, artefactos y mediciones.
8. **P0 — Revisión independiente:** asignar QA/SRE/Seguridad distintos del autor para revisión de contratos, tenant isolation y G0; el auto-review no satisface ese gate.

## 10. Decisión final de arquitectura

- **GO limitado:** revisión documental, refinamiento de contratos, validadores aislados y experimentos desechables de TASK-039.
- **NO-GO:** scaffold productivo definitivo, despliegue, datos reales, Meta mutations, gasto publicitario, mensajes reales, borrado irreversible o afirmación de producción lista.
- **G0:** BLOCKED hasta que SP-01..10, RLS/pooling, RabbitMQ/outbox/inbox, webhook durable, backup/restore, footprint y review independiente tengan evidencia reproducible.
- **ADRs:** mantener ADR-011..025 como dirección hasta que un spike contradiga una decisión y un ADR superseding sea aprobado.
- **Aceptación:** solo el Product Owner puede declarar el producto aceptado según docs/20.

Este informe actualiza el estado de revisión; no cambia los gates ni constituye una autorización de implementación/producción.
