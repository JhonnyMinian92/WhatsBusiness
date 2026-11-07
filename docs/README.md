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
14. [Cuestionario de descubrimiento](28-PRODUCT-DISCOVERY-QUESTIONNAIRE.md) — decisiones que debe confirmar el propietario.

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
| [28-PRODUCT-DISCOVERY-QUESTIONNAIRE.md](28-PRODUCT-DISCOVERY-QUESTIONNAIRE.md) | Preguntas y decisiones pendientes del propietario |

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
