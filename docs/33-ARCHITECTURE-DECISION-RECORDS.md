# 33 — Architecture Decision Records (ADR-011..025)

**Fecha de decisión:** 2026-11-06  
**Estado común:** accepted by owner delegation as architecture direction; implementation/architecture spike not yet verified.  
**Autoridad:** el propietario autorizó al arquitecto a aplicar las mejores recomendaciones técnicas reversibles.  
**Regla:** una decisión accepted fija la dirección, no certifica que esté instalada ni prohíbe supersederla con evidencia y revisión.

## ADR-011 — Backend TypeScript + NestJS + Node.js LTS

- **Contexto:** plataforma con integraciones HTTP/webhooks, workflows, API SaaS, control de acceso, operaciones async y equipo de agentes con productividad compartida.
- **Decisión:** TypeScript strict y NestJS sobre una versión LTS vigente de Node.js, fijada en lockfiles durante bootstrap.
- **Alternativas:** Java/Spring, .NET, Go, Python/FastAPI. Pueden ser técnicamente válidas; no aportan una ventaja decisiva suficiente para compensar dos lenguajes/runtime y mayor complejidad inicial en este contexto.
- **Consecuencias positivas:** ecosistema común con Angular; DI/módulos/guards/validation; tipos compartibles en contratos; amplia disponibilidad de librerías y tooling.
- **Coste/riesgo:** runtime event-loop requiere límites de CPU y workers separados para trabajos intensivos; disciplina de tipos y límites de módulos es obligatoria.
- **Seguridad:** no depender de DTO types como único control; validar inputs en runtime, autorización server-side, safe serialization, dependency scanning y secret scanning.
- **Reversibilidad:** alta a nivel de bounded context mediante ports/adapters; migrar todo backend sería costoso. Mantener dominio independiente de NestJS.
- **Revisar si:** benchmark de webhook/worker, requerimientos de CPU, footprint, soporte LTS o desempeño real contradicen la decisión.

## ADR-012 — Angular para el panel web

- **Contexto:** consola empresarial de múltiples dominios, panel por tenant, Inbox, CRM, administración, permisos y formularios complejos.
- **Decisión:** Angular con la major estable soportada al iniciar el código, standalone APIs y feature-first architecture.
- **Alternativas:** React/Next.js, Vue/Nuxt. No se eligen para evitar dividir el ecosistema y estandarizar organización/tooling.
- **Consecuencias positivas:** routing, DI, formularios, lazy loading, patrones empresariales y estructura consistente para equipos.
- **Coste/riesgo:** curva y peso del framework; mantener bundle budgets, lazy features y UX performance.
- **Seguridad/accesibilidad:** guards solo mejoran UX, backend es autoridad; WCAG 2.2 AA para journeys críticos.
- **Reversibilidad:** media; mantener API contracts independientes.
- **Revisar si:** spike de UI muestra problemas de rendimiento, bundle, accesibilidad o productividad.

## ADR-013 — PostgreSQL como OLTP, tenancy con tenant_id y RLS

- **Contexto:** modelo relacional SaaS, consistencia transaccional, ledgers, CRM y aislamiento.
- **Decisión:** PostgreSQL como fuente transaccional; tenant_id en registros tenant-scoped, autorización server-side y Row-Level Security como defensa adicional. Esquemas/usuarios por bounded context cuando haga falta separar ownership.
- **Alternativas:** DB por tenant desde inicio, schema por tenant, MongoDB. La opción compartida reduce operación/coste inicial; DB/cluster dedicado queda para enterprise/regulación.
- **Consecuencias positivas:** integridad, transacciones, constraints, JSONB, tooling, RLS y migración escalonada a tenants dedicados.
- **Coste/riesgo:** RLS requiere configuración rigurosa de rol no superuser/no BYPASSRLS, transaction-local tenant context y pruebas de pooling; no evita bugs de autorización por sí sola.
- **Seguridad:** fail-closed si falta tenant; no confiar en tenant ID del cliente; tests BOLA/cross-tenant en filas, jobs, caches, objetos y exports.
- **Reversibilidad:** media; partición/sharding o dedicated DB requieren router y proceso de migración probado.
- **Revisar si:** benchmarks, contratos enterprise, residencia o threat model requieren aislamiento físico antes.

## ADR-014 — RabbitMQ + transactional outbox/inbox

- **Contexto:** webhooks duplicados/atrasados, trabajos largos, mensajes, sincronización Meta, retry, replay y DLQ.
- **Decisión:** RabbitMQ para colas y routing; transactional outbox en Postgres y durable inbox; consumers idempotentes, DLQ y backoff con jitter.
- **Alternativas:** Kafka/Redpanda, cloud queues, Redis streams. Kafka puede ser útil para alto volumen de event streaming, pero añade operación y complejidad no justificada todavía.
- **Consecuencias positivas:** routing flexible, acknowledgements, queues durables, retries y modelo claro de trabajo asíncrono.
- **Coste/riesgo:** operación de broker, memoria/storage, HA y gestión de colas; at-least-once requiere idempotencia.
- **Seguridad:** credenciales separadas por rol, TLS, tenant context firmado/validado, cuotas, DLQ con acceso controlado y redacción de payload.
- **Reversibilidad:** media-alta por ports/message envelope.
- **Revisar si:** eventos de alto throughput, replay/retention de meses, ordering requirements o clustering superan la capacidad/coste; reevaluar Kafka/Redpanda/managed service.

## ADR-015 — Modular monolith con API/worker/scheduler como roles de proceso

- **Contexto:** bounded contexts numerosos, greenfield, equipo inicial pequeño/mediano y VPS; microservicios independientes aumentarían carga operativa temprana.
- **Decisión:** un monorepo y deployable de dominio modular, ejecutado en API, worker y scheduler roles separados desde el mismo codebase; extraer microservicios solo por evidencia.
- **Alternativas:** microservicios por bounded context desde inicio, monolito sin límites. Se rechaza distribución prematura y también el monolito acoplado.
- **Consecuencias positivas:** menor costo de red/consistencia, despliegue sencillo, límites fuertes de código/datos y escalado de worker separado.
- **Coste/riesgo:** proceso compartido puede competir por recursos; límites de módulos deben ser enforceados en CI, ownership de datos y imports.
- **Seguridad/operación:** separación de secretos/config por rol; límites de recursos; evitar acceso directo a tablas de otros contextos.
- **Reversibilidad:** alta si ports/events/data ownership están definidos desde el primer día.
- **Revisar si:** un contexto exige aislamiento regulatorio, escalado autónomo, release cadence propia o impacto de fallos que justifique su extracción.

## ADR-016 — OIDC con Keycloak self-hosted como IdP inicial

- **Contexto:** multi-tenant, SSO/MFA y despliegue controlado en VPS sin compromiso inicial de proveedor SaaS.
- **Decisión:** OIDC como protocolo; Keycloak como candidato elegido para implementación inicial, sujeto a spike operativo, backup/restore, actualización y HA.
- **Alternativas:** Auth0/Okta/Entra/otros managed IdP, implementación propia de auth. No construir auth/credential storage propio.
- **Consecuencias positivas:** OIDC estándar, control de despliegue, MFA y federación futura.
- **Coste/riesgo:** parcheo, base de datos, backup, gestión de claves, disponibilidad y carga SRE son responsabilidad del operador.
- **Seguridad:** no delegar autorización de negocio al token IdP únicamente; membership/tenant/asset/action se validan backend; MFA/step-up.
- **Reversibilidad:** alta si el dominio integra OIDC genérico y no filtra dependencias Keycloak.
- **Revisar si:** burden de operación o HA/coste excede managed identity; cualquier cambio externo requiere contrato y aprobación de coste/transferencias.

## ADR-017 — Docker portable, Compose para dev y piloto

- **Contexto:** VPS/servidor propio y reproducibilidad entre desarrollador, CI y entornos.
- **Decisión:** Docker images inmutables y Docker Compose para local/dev y piloto controlado; para producción seleccionar topología HA tras TASK-039/060. No declarar Compose single-node como alta disponibilidad.
- **Alternativas:** Kubernetes desde día uno, k3s, systemd/bare metal, managed platform. Kubernetes no se elige antes de justificar carga/operación.
- **Consecuencias positivas:** portability, reproducibility, predictable local stack.
- **Coste/riesgo:** Compose no aporta scheduler multi-node, HA ni failover automático por sí solo; secrets, volumes y backups deben diseñarse.
- **Seguridad:** non-root containers, image scanning, minimal images, pinned digests/versions, secret injection, network segmentation.
- **Reversibilidad:** alta si no se acopla aplicación al runtime.
- **Revisar si:** pruebas muestran que producción necesita orchestration HA o despliegue multi-node y equipo puede operar esa complejidad.

## ADR-018 — OpenTelemetry + Prometheus + Grafana

- **Contexto:** trace de API → Meta → webhook → worker, SLO, multi-tenant diagnosis y prevención de vendor lock-in.
- **Decisión:** instrumentación OpenTelemetry; Prometheus para métricas y Grafana para dashboards/alertas. Loki/Tempo u otro stack logs/traces como opción tras spike.
- **Alternativas:** Datadog/New Relic/Grafana Cloud/ELK/stack local específico.
- **Consecuencias positivas:** instrumentación portable, métricas de golden signals, tracing distribuido.
- **Coste/riesgo:** storage/cardinality, retención, mantenimiento y control de costes; self-hosted observability consume recursos del mismo VPS si no se separa.
- **Seguridad/privacidad:** no usar PII, tokens, phone numbers o contenido de mensajes como labels; redactar logs y acotar retention/access.
- **Reversibilidad:** alta mediante OpenTelemetry SDK/exporters.
- **Revisar si:** volumen de logs/traces o coste operativo exige servicio gestionado (requiere aprobación de proveedor/datos/coste).

## ADR-019 — AI Gateway desacoplado; sugerencia y aprobación humana por defecto

- **Contexto:** chatbots y asistencia a agentes, proveedor IA cambiante, coste variable, riesgo de prompt injection y datos personales.
- **Decisión:** gateway interno provider-agnostic; primeras capacidades son rule-based chatbot y reply suggestions; no auto-send ni herramientas write generales. AI output is untrusted.
- **Alternativas:** acoplar a un proveedor, agentes autónomos completos, modelo propio desde inicio.
- **Consecuencias positivas:** portabilidad, evaluación por proveedor, cuota/coste por tenant, fallback y kill switch.
- **Coste/riesgo:** capa adicional de abstracción y evaluación; puede introducir latencia y coste de orquestación.
- **Seguridad/privacidad:** no mandar PII/conversaciones a terceros sin base legal, contrato, región, retención y aprobación; tools con schema/purpose/scope/runtime authorization; logs minimizados.
- **Reversibilidad:** alta; provider adapters son reemplazables.
- **Revisar si:** evals objetivas, coste/calidad, privacidad/region o evolución de producto justifica nuevo proveedor/capacidad.

## ADR-020 — Nx + pnpm monorepo y boundaries

- **Contexto:** backend, frontend, workers, contratos y librerías de plataforma evolucionan juntos en greenfield y equipos/agentes requieren límites comprobables.
- **Decisión:** Nx workspace + pnpm; project graph, tags/boundaries, affected builds/tests y lockfile reproducible.
- **Alternativas:** Turborepo, pnpm workspaces sin Nx, repositorios separados.
- **Consecuencias positivas:** enforcement de dependencia, CI selectiva, code ownership y build graph.
- **Coste/riesgo:** configuración inicial, aprendizaje y plugins/version compatibility; evitar macros/metaprogramming innecesarios.
- **Seguridad:** server-only libs nunca se importan en browser; boundaries impiden filtrar secrets y drivers.
- **Reversibilidad:** media-alta si scripts/TS/builds no acoplan negocio a Nx APIs.
- **Revisar si:** spike de build performance o tooling revela coste injustificado o límites difíciles de mantener.

## 21. Estado y validación transversal

- Todas las ADR anteriores están **accepted as direction by delegated authority**.
- TASK-039 debe validar al menos Nx/Nest/Angular, procesos API/workers, PostgreSQL RLS con pooling, RabbitMQ outbox/inbox, OIDC/Keycloak, backups y footprint.
- Si un spike contradice una decisión, documentar resultados y proponer ADR superseding. No presentar una hipótesis como resultado.
- No existe benchmark ni build de la plataforma realizado al corte del documento.
- Cambios que implican proveedor de pago, coste recurrente, transferencia de datos o contrato necesitan aprobación del propietario.


## ADR-021 — Campaign Intelligence and learning-plane separation
- **Context:** Meta's delivery AI is proprietary and learns from eligible creative, audience, objective and event signals; WhatsBusiness must learn from advertiser/business outcomes without claiming to control Meta ranking.
- **Decision:** separate Meta Delivery Plane from WhatsBusiness Intelligence Plane. Build Campaign Intelligence from Insights, CRM/CAPI events, revenue and margin, with provenance, quality gates and controlled experiments.
- **Alternatives:** pretend to optimize Andromeda directly; optimize only CTR/Meta-reported ROAS; allow free-form LLM mutations. Rejected because internals are inaccessible, vanity metrics misalign business value, and unconstrained mutations are unsafe.
- **Consequences:** implement CampaignSnapshot, CreativeVariant, Experiment/TestCell, OptimizationRecommendation, OutcomeLedger and Policy/Approval integration. Reports distinguish provider attribution from incrementality.
- **Safety:** AI drafts only. External writes pass policy/capability, simulation, approval, idempotency, audit and reconciliation.
- **Reversibility:** modular; provider Insights adapters and experiment logic are replaceable.
- **Review trigger:** Meta exposes new official interfaces, attribution model changes, account eligibility shifts, or benchmark reveals inadequate sample/decision quality.

## ADR-022 — Creative testing, budget guardrail and official Meta-only channel policy
- **Context:** owner asks for new diverse ads and never to increase budget by more than 20%; Meta campaign learning can be disrupted by edits and OpenWA relies on unofficial browser automation.
- **Decision:** enforce PD-024: maximum +20% per budget change and maximum +20% cumulative rolling 24h against window baseline. Preserve winning/learning ad sets; new creative tests use isolated test cells or Meta-supported experiments. Only official Meta APIs can send WhatsApp/Meta channel actions.
- **Alternatives:** raise budgets in arbitrary steps; put every creative into a winner adset; use WhatsApp Web automation as fallback. Rejected due learning fragmentation, uncertain impact and compliance/account risk.
- **Clarification:** 20% is an internal owner guardrail, not a Meta universal threshold or guaranteed anti-reset rule. Meta's 20% Ad Set Budget Sharing is a different feature.
- **Consequences:** budget guardrail service, experiment budget accounting, creative provenance/preview, approvals and automated no-go tests.
- **Security:** no agent can bypass the cap, approval or tenant boundary; no OpenWA/browser session in production.
- **Review trigger:** owner explicitly changes the cap, Meta changes official learning/budget guidance or API feature contracts, or legal/security review requires stricter rules.

## ADR-023 — REST-first para APIs síncronas; broker para eventos

- **Contexto:** API de SaaS para navegador/integradores, webhooks HTTP, comandos de dominio con idempotency/audit y primer despliegue como monolito modular.
- **Decisión:** REST/JSON + OpenAPI como superficie síncrona externa; llamadas directas a ports/use cases entre módulos del mismo proceso; RabbitMQ/AsyncAPI para jobs/eventos; SSE/WebSocket si Inbox necesita realtime. GraphQL no será API primaria y gRPC no se introduce mientras los módulos no sean servicios separados.
- **Alternativas:** GraphQL, gRPC y uso mixto en cada bounded context.
- **Razón:** REST ofrece semántica HTTP estándar, interoperabilidad browser/SDK, status/cache/idempotency y contracts OpenAPI. GraphQL agrega resolvers, authz por field, query complexity y estrategia cache sin evidencia de overfetching que lo justifique. gRPC tiene sentido entre servicios separados, no como loopback entre módulos; gRPC-Web requiere soporte/proxy de navegador. El broker resuelve durabilidad/retry, no el protocolo RPC síncrono.
- **Consecuencias:** los API IDs de docs/47 se mantienen HTTP; comandos idempotentes documentados; no rutas GraphQL ni servicios gRPC en el primer scaffold; todo trabajo asíncrono usa outbox/inbox y broker.
- **Seguridad:** cada endpoint/use case valida tenant/actor/purpose; no confiar en guards de frontend o en el schema del transporte.
- **Revisión:** evidencia de overfetching y nuevo cliente multi-producto para GraphQL; servicio independiente con alto RPC/streaming para gRPC; benchmark del mismo workload.
- **Fuente:** docs/52 y RFC 9110.

## ADR-024 — Baseline de versiones del stack al corte 2026-11-06

- **Contexto:** los ADR-011..020 seleccionaban familias de tecnología, pero dejaban versiones indeterminadas; el runtime Node/Angular/TypeScript debe ser compatible y estar soportado durante el inicio.
- **Decisión recomendada:** TypeScript 6.0.x strict; Node.js 26.x Active LTS; NestJS 12.x; Angular 22.x; Nx 24.0.4; pnpm fijado por Corepack/lockfile; PostgreSQL 18.x; Valkey 9.1.x; RabbitMQ 4.4.x; Keycloak 26.8.x; Traefik 3.7.x; Docker Compose 5.7.0 para dev/piloto; OpenTelemetry + Prometheus 3.16.0 + Grafana con patch compatible lockfileado.
- **Razón:** Node 26 Active LTS y su matriz oficial se alinean con Angular 22; Angular 22 requiere TypeScript 6.0.x. NestJS 12 soporta Node 26 en CLI/runtime. Nx 24.x ofrece graph/boundaries y cache/tasks afectados. PostgreSQL encaja en datos relacionales/tenancy; Valkey reduce riesgo de licencia para cache; RabbitMQ cubre jobs y routing; OpenTelemetry evita atar el dominio a vendor.
- **Estatus:** adoptado como baseline recomendada por delegación técnica; **build/compatibility matrix/footprint todavía no validados**. Patches, CVEs, image digests y licencias se vuelven a revisar justo antes de bootstrap.
- **Alternativas:** .NET/ASP.NET Core, Java/Spring, Go; React/Vue; MongoDB; Redis; Kafka/Redpanda; IdP gestionado; ver docs/51.
- **Condición de salida:** SP-01/SP-02/SP-03/SP-05/SP-07/SP-08/SP-09 de docs/45 pasan con evidencia real; si no, ajustar mediante ADR superseding.
- **Riesgo:** versiones actuales son una fotografía de 2026-11-06, no un compromiso de usar patches desactualizados indefinidamente.
- **Fuentes:** docs/51 y sus referencias oficiales.

## ADR-025 — Valkey 9.1.x en lugar de Redis como caché/coordinación

- **Contexto:** Redis era la opción de cache/coordinación inicial, pero Redis Open Source desde la línea 8 tiene opciones de licencia RSALv2, SSPLv1 o AGPLv3. Es necesario minimizar incertidumbre de licencia en un SaaS comercial y no exponer cache como dato duradero.
- **Decisión:** Valkey 9.1.x con licencia BSD se convierte en la implementación recomendada de cache, rate limit y locks efímeros. Aplicación consume un port CacheStore/RateLimiter/LeaseStore, no la API propietaria del servidor.
- **Alternativas:** Redis 8 con revisión legal de licencia; Redis 7.2 BSD-3 histórico pero versión antigua; cache administrada por un cloud vendor. Valkey mantiene compatibilidad con buena parte del protocolo/comandos Redis, pero cada comando/script/cliente usado debe probarse.
- **Razón:** licencia BSD del proyecto, release estable 9.1.3 al corte, portabilidad y reducción de lock-in. No afirmar superioridad de performance.
- **Seguridad/consistencia:** nunca es source of truth; no almacenar PII/token; tenant namespaces; TTL bounded; invalidación al revocar grants; PostgreSQL y RabbitMQ conservan datos durables.
- **Revisión:** comando/feature requerido ausente, incompatibilidad real o benchmark/coste no satisfactorio; cualquier retorno a Redis necesita revisión legal de licencia y decisión documentada.
- **Fuentes:** https://valkey.io/download/releases/ ; https://valkey.io/ ; https://redis.io/legal/licenses/ ; docs/51.

## ADR-026 — CRM Intelligence con machine learning clásico y CPU-first

- Estado: accepted as direction (decisión del propietario, 2026-11-07; implementación aún no realizada).
- Contexto: transformar historial comercial y outcomes observables en scoring, clasificación, predicción, segmentación y ranking sin depender de LLM ni agentes de IA.
- Decisión: CRM Intelligence pertenece al bounded context CRM y expone ports para feature snapshots, predictor, evaluator, model registry y artifact store. Entrenamiento offline reproducible; inferencia CPU-first detrás de una abstracción. Reusar PostgreSQL/RLS, outbox/RabbitMQ, worker runtime y observabilidad existentes.
- Algoritmos: comparar regresión lineal/logística y baselines estadísticos; evaluar árboles, Random Forest y XGBoost/gradient boosting para datos tabulares; usar clustering, series temporales, supervivencia, ranking o MLP ligeras cuando la evidencia lo justifique.
- Alternativas rechazadas para CRM: LLM/agentes generativos, entrenamiento dentro del proceso HTTP, un microservicio por algoritmo y modelo global cross-tenant por defecto.
- Consecuencias: labels, snapshots temporales, feature provenance, métricas por problema, calibración, registry, checksums, promoción/rollback, monitoreo y fallback sin ML.
- Seguridad/privacidad: datasets/artefactos/predicciones aislados por tenant; no entrenar entre tenants por defecto; controlar minimización, purpose/consent y retención. Scores no cambian permisos ni ejecutan acciones externas.
- Rendimiento: presupuesto explícito de CPU/RAM/latencia y tamaño de artefacto; batch scoring cuando convenga. Redes neuronales solo si superan baselines con evidencia reproducible.
- Revisión: benchmark en hardware objetivo, inventario de datos/outcomes y revisión de seguridad/privacidad antes de producción.
- Especificación: [docs/62](62-CRM-MACHINE-LEARNING-STRATEGY.md).