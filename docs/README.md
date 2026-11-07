# WhatsBusiness — documentación operativa y memoria del producto

> **Entrada obligatoria para personas y agentes.** La fuente de contexto no es una conversación: es este repositorio. Objetivo: implementar y verificar el producto completo hasta la aceptación explícita del propietario.

## Empieza aquí
1. [Contrato universal de agentes](../AGENTS.md) — reglas obligatorias para Codex, Claude Code, Copilot y agentes compatibles.
2. [Modelo operativo de agentes](17-AGENT-OPERATING-MODEL.md) — cómo leer, planificar, implementar, probar, registrar y entregar.
3. [Memoria central](01-CENTRAL-MEMORY.md) y [memoria de sesión](02-SHORT-TERM-MEMORY.md).
4. [Grafo de ejecución](18-EXECUTION-GRAPH.md) — dependencias y orden seguro.
5. [Matriz de trazabilidad](19-TRACEABILITY-MATRIX.md) — requisitos → tareas → código → pruebas → evidencia.
6. [Criterios de producto terminado](20-PRODUCT-ACCEPTANCE.md) — la definición objetiva de cobertura y aprobación del propietario.
7. [Organización del equipo](21-TEAM-ORGANIZATION.md) — departamentos, ownership y organigrama.
8. [Orquestación multiagente](22-MULTI-AGENT-ORCHESTRATION.md) — concurrencia, work packets, integración y handoff.
9. [Playbooks de roles](23-ROLE-PLAYBOOKS.md) — cómo adoptar y abandonar roles sin confundir autoridad.
10. [Validación independiente](24-INDEPENDENT-VALIDATION.md) — revisión cruzada, adversarial y hallazgos.
11. [Límites y accesos](25-AGENT-BOUNDARIES-AND-ACCESS.md) — acciones permitidas, prohibidas y escalamiento.
12. [Flujo de equipo y gates](26-TEAM-WORKFLOW-AND-GATES.md) — ciclo completo, plantillas y puertas de calidad.
13. [Auditoría inicial del repositorio](27-INITIAL-REPOSITORY-AUDIT.md) — evidencia del estado real inspeccionado.
14. [Cuestionario de descubrimiento](28-PRODUCT-DISCOVERY-QUESTIONNAIRE.md) — cuestionario histórico; las decisiones vigentes están en docs/29.

## Reglas rectoras
1. Trabajo activo exclusivamente en `environment/local`, salvo instrucción expresa del propietario.
2. Cada solicitud del propietario para implementar, corregir o cambiar algo autoriza el trabajo solicitado; no se debe usar la antigua fase documental como bloqueo general.
3. La meta es el 100 % de requisitos aprobados implementados y verificados. Solo el propietario puede dar aceptación final.
4. El código y sus pruebas demuestran qué existe; las memorias/backlog explican intención y estado. Nunca confundirlos.
5. Usar APIs oficiales de Meta y validar permisos, versiones, elegibilidad, límites y precios vigentes.
6. Polimorfismo por capacidades y adaptadores, preservando semántica y payload nativos.
7. Cada cambio debe actualizar trazabilidad, tareas, memoria y auditoría.
8. No inventar resultados de tests, despliegues, accesos, permisos ni evidencias.
9. No exponer secretos, tokens ni datos personales.

## Índice documental
| Archivo | Uso |
|---|---|
| [00-CONTEXT.md](00-CONTEXT.md) | Visión, alcance, actores y restricciones |
| [01-CENTRAL-MEMORY.md](01-CENTRAL-MEMORY.md) | Fuente de verdad estable y decisiones |
| [02-SHORT-TERM-MEMORY.md](02-SHORT-TERM-MEMORY.md) | Estado real de sesión y próximo paso |
| [03-LONG-TERM-MEMORY.md](03-LONG-TERM-MEMORY.md) | Conocimiento durable e historial |
| [04-SENSORY-MEMORY.md](04-SENSORY-MEMORY.md) | Evidencia externa sin validar |
| [05-ARCHITECTURE.md](05-ARCHITECTURE.md) | Arquitectura, límites y diagramas |
| [06-DOMAIN-AND-BUSINESS.md](06-DOMAIN-AND-BUSINESS.md) | Dominios, reglas y procesos |
| [07-DESIGN-PATTERNS.md](07-DESIGN-PATTERNS.md) | Patrones, contratos y polimorfismo |
| [08-SECURITY-AND-PRIVACY.md](08-SECURITY-AND-PRIVACY.md) | Amenazas, controles y privacidad |
| [09-API-INTEGRATION-CATALOG.md](09-API-INTEGRATION-CATALOG.md) | Catálogo Meta y validación de capacidades |
| [10-USER-STORIES.md](10-USER-STORIES.md) | Resultados de usuario y criterios |
| [11-TASK-BACKLOG.md](11-TASK-BACKLOG.md) | Paquetes de trabajo, dependencias y estados |
| [12-QA-AND-TEST-STRATEGY.md](12-QA-AND-TEST-STRATEGY.md) | Estrategia de pruebas y gates |
| [13-OPERATIONS-AND-OBSERVABILITY.md](13-OPERATIONS-AND-OBSERVABILITY.md) | Operación, SLO, recuperación |
| [14-AUDIT-AND-CHANGELOG.md](14-AUDIT-AND-CHANGELOG.md) | Bugs, cambios, ADR y auditoría |
| [15-ROADMAP-AND-ADVANCEMENT.md](15-ROADMAP-AND-ADVANCEMENT.md) | Fases, hitos y avance verificable |
| [16-ROLES-AND-GOVERNANCE.md](16-ROLES-AND-GOVERNANCE.md) | Responsabilidades y aprobaciones |
| [17-AGENT-OPERATING-MODEL.md](17-AGENT-OPERATING-MODEL.md) | Protocolo de ejecución de agentes |
| [18-EXECUTION-GRAPH.md](18-EXECUTION-GRAPH.md) | Grafo de dependencias y orden de ejecución |
| [19-TRACEABILITY-MATRIX.md](19-TRACEABILITY-MATRIX.md) | Matriz de impacto y evidencia |
| [20-PRODUCT-ACCEPTANCE.md](20-PRODUCT-ACCEPTANCE.md) | Definition of complete y aprobación final |
| [21-TEAM-ORGANIZATION.md](21-TEAM-ORGANIZATION.md) | Departamentos, organigrama y ownership |
| [22-MULTI-AGENT-ORCHESTRATION.md](22-MULTI-AGENT-ORCHESTRATION.md) | Concurrencia, coordinación e integración |
| [23-ROLE-PLAYBOOKS.md](23-ROLE-PLAYBOOKS.md) | Playbooks para asumir múltiples roles |
| [24-INDEPENDENT-VALIDATION.md](24-INDEPENDENT-VALIDATION.md) | Revisión cruzada independiente y adversarial |
| [25-AGENT-BOUNDARIES-AND-ACCESS.md](25-AGENT-BOUNDARIES-AND-ACCESS.md) | Límites, permisos y autoridad |
| [26-TEAM-WORKFLOW-AND-GATES.md](26-TEAM-WORKFLOW-AND-GATES.md) | Flujo, ceremonias, gates y plantillas |
| [27-INITIAL-REPOSITORY-AUDIT.md](27-INITIAL-REPOSITORY-AUDIT.md) | Auditoría estática inicial y límites de evidencia |
| [28-PRODUCT-DISCOVERY-QUESTIONNAIRE.md](28-PRODUCT-DISCOVERY-QUESTIONNAIRE.md) | Cuestionario histórico; ver docs/29 para decisiones vigentes |

## Memoria de producto de origen
[META_SERVICES.md](../META_SERVICES.md) conserva la investigación inicial. Es referencia histórica/técnica, no prueba de que una API siga vigente ni de que la cuenta tenga acceso. Validar todo dato volátil con fuentes oficiales antes de implementar.

## Protocolo de mantenimiento
- Al comenzar: leer AGENTS, revisar git status/branch/commit, sincronizar memoria y verificar código real.
- Al planificar: localizar IDs existentes; crear REQ/US/TASK/BUG/CR/ADR solo si corresponde; actualizar grafo y matriz.
- Al implementar: cambio pequeño, tests de regresión, seguridad, observabilidad y compatibilidad.
- Al terminar: registrar resultados reales y SHA; actualizar backlog, memoria corta, roadmap, trazabilidad y auditoría.
- No marcar una tarea `verified` sin pruebas/evidencia ni `accepted` sin aprobación del propietario.

## Estado
La estructura documental y el sistema de instrucciones para agentes se encuentran establecidos en `environment/local`. Esto no significa que el producto esté implementado. El porcentaje de implementación debe calcularse contra requisitos y criterios con evidencia, no contra documentos creados.


## Decisiones y arquitectura confirmadas
29. [Decisiones del propietario](29-OWNER-DECISIONS.md) — baseline explícita, interpretación y preguntas abiertas.
30. [Arquitectura recomendada](30-RECOMMENDED-ARCHITECTURE.md) — stack y límites propuestos.
31. [Plan maestro por fases](31-MASTER-DELIVERY-PLAN.md) — fases, gates y paralelismo seguro.


32. [Registro de investigación y evidencia](32-RESEARCH-AND-EVIDENCE-REGISTER.md) — hallazgos Meta, LOPDP/SPDP, ASVS 5.0.0 y prácticas SRE con fecha, fuente y límites de validez.

33. [Registros formales de decisiones de arquitectura](33-ARCHITECTURE-DECISION-RECORDS.md) — ADR-011..020, alternativas, consecuencias, seguridad, coste, reversibilidad y validación.


34. [Meta Ads AI, Andromeda, GEM y evolución de plataforma](34-META-ADS-AI-AND-PLATFORM-OUTLOOK.md) — anuncios inteligentes, creatividades, MCP, Business Agent y proyecciones.
35. [Benchmark de proyectos de referencia](35-REFERENCE-PROJECTS-TECHNICAL-BENCHMARK.md) — Chatwoot, Twilio, httpSMS, Android SMS Gateway y OpenWA.
36. [Campaign Intelligence y escalado controlado](36-CAMPAIGN-INTELLIGENCE-AND-GUARDED-SCALING.md) — aprendizaje comercial, Creative Lab, experimentos y guardrail +20%.


## Especificaciones de implementación y arranque (docs/37–46)

37. Identidad, organizaciones y tenancy — docs/37-PLATFORM-IDENTITY-AND-TENANCY-SPEC.md.
38. CRM y ciclo comercial — docs/38-CRM-DOMAIN-SPEC.md.
39. Inbox omnicanal — docs/39-OMNICHANNEL-INBOX-SPEC.md.
40. Automation Engine — docs/40-AUTOMATION-ENGINE-SPEC.md.
41. AI Assistance Gateway — docs/41-AI-ASSISTANCE-SPEC.md.
42. Modelo lógico de datos — docs/42-INITIAL-DATA-MODEL.md.
43. Contratos HTTP y eventos — docs/43-API-AND-EVENT-CONTRACTS.md.
44. Threat model y data inventory — docs/44-THREAT-MODEL-AND-DATA-INVENTORY.md.
45. Architecture Spike Runbook — docs/45-ARCHITECTURE-SPIKE-RUNBOOK.md.
46. Agent Start & Work Packets — docs/46-AGENT-START-AND-WORKPACKETS.md.

## Contratos versionados iniciales

- OpenAPI: ../contracts/openapi/platform-v1.yaml
- AsyncAPI: ../contracts/asyncapi/platform-events-v1.yaml
- JSON Schema: ../contracts/schemas/event-envelope.schema.json

## Readiness vigente

Los agentes pueden empezar análisis, revisión de especificaciones, validación de contratos y TASK-039. No se ha aprobado todavía el scaffold definitivo: se requiere evidencia del spike y review de G0. Las validaciones legales, financieras, Meta y VPS siguen siendo gates específicos; no se simulan.


## Inventario maestro de APIs

47. [Inventario maestro de APIs y matriz TASK](47-API-INVENTORY-AND-TASK-MAP.md) — catálogo de endpoints HTTP propios por bounded context, propósito/uso/cuándo/flujo, webhooks, eventos internos, familias de APIs Meta externas y correlación US-001..032 / TASK-001..080.

**Regla:** docs/47 es la fuente de planificación para API IDs y mapping. docs/09 es el catálogo de APIs Meta externas. contracts/openapi y contracts/asyncapi son los schemas normativos que deben ampliarse por fase y siempre mantenerse sincronizados con docs/47.

## Normas finales de implementación y contratos (docs/48–50)

48. [Estándar de arquitectura, calidad y reutilización](48-CODING-ARCHITECTURE-AND-REUSE-STANDARD.md) — reglas obligatorias para evitar código espagueti, duplicación, dependencias circulares y servicios/componentes con demasiadas responsabilidades.
49. [Readiness OpenAPI y gates de adapters Meta](49-API-CONTRACT-READINESS-AND-META-ADAPTER-GATES.md) — congelación de schemas por operación, scopes documentados, versión por adapter y fail-closed capability checks.
50. [Catálogo de eventos y schemas versionados](50-EVENT-CATALOG-AND-VERSIONED-SCHEMAS.md) — tipos de evento, payloads, envelope, idempotencia y evolución.

## Contratos ampliados

- OpenAPI: ../contracts/openapi/platform-v1.yaml (inventario completo de 297 operaciones/rutas; 5 design-frozen y 292 catalog-only, hasta congelar schemas).
- AsyncAPI: ../contracts/asyncapi/platform-events-v1.yaml.
- Envelope: ../contracts/schemas/event-envelope.schema.json.
- Payloads de dominio: ../contracts/schemas/domain-events-v1.schema.json.

## Evaluación tecnológica y protocolo API (docs/51–52)

51. [Evaluación comparativa del stack y baseline de versiones](51-TECHNOLOGY-FIT-AND-VERSION-BASELINE.md) — compara lenguajes/frameworks, frontend, monorepo, base de datos, cache, broker, identidad, edge, despliegue y observabilidad; fija versiones recomendadas a 2026-11-06 y distingue evidencia documental de benchmark pendiente.
52. [Decisión REST vs GraphQL vs gRPC](52-REST-GRAPHQL-GRPC-PROTOCOL-DECISION.md) — REST/JSON para API síncrona, llamadas locales entre módulos, RabbitMQ/AsyncAPI para async y triggers para considerar GraphQL/gRPC.


## Architecture readiness and agent work packages

- [45 — Architecture Spike runbook (TASK-039)](45-ARCHITECTURE-SPIKE-RUNBOOK.md)
- [46 — Agent kickoff, readiness and work packets](46-AGENT-START-AND-WORKPACKETS.md)
- [47 — API inventory and TASK map](47-API-INVENTORY-AND-TASK-MAP.md)
- [48 — Coding architecture and reuse standard](48-CODING-ARCHITECTURE-AND-REUSE-STANDARD.md)
- [49 — API contract readiness and Meta adapter gates](49-API-CONTRACT-READINESS-AND-META-ADAPTER-GATES.md)
- [50 — Event catalog and versioned schemas](50-EVENT-CATALOG-AND-VERSIONED-SCHEMAS.md)
- [51 — Technology fit and version baseline](51-TECHNOLOGY-FIT-AND-VERSION-BASELINE.md)
- [52 — REST, GraphQL and gRPC protocol decision](52-REST-GRAPHQL-GRPC-PROTOCOL-DECISION.md)
- [53 — Individual TASK-001..080 work packages](53-TASK-WORK-PACKAGES.md)
- [54 — TASK-039 execution and consistency audit](54-TASK-039-EXECUTION-AND-CONSISTENCY-REPORT.md)

- [55 — OpenAPI contract completion plan by bounded context](55-OPENAPI-CONTRACT-COMPLETION-PLAN.md)
