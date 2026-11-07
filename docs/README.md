# Sistema documental de WhatsBusiness

> Fuente funcional y técnica: [META_SERVICES.md](../META_SERVICES.md). Este sistema documental descompone la investigación en memoria operativa, decisiones, arquitectura, historias, tareas, controles y auditoría.

## Reglas rectoras
1. Todo el trabajo activo se realiza en `environment/local`. `environment/develop` es rama de integración y no recibe cambios directos durante esta etapa.
2. No iniciar código fuente hasta completar y aprobar los gates documentales de la fase 0.
3. Implementar la mejor opción oficial disponible de Meta, aunque implique más coste o complejidad.
4. No inventar capacidades, permisos, límites, precios ni disponibilidad. Cada integración debe validar la documentación vigente y el acceso real.
5. Polimorfismo por capacidades y adaptadores; nunca reducir las APIs a un mínimo común denominador que descarte capacidades nativas.
6. Cada historia tiene criterios verificables; cada tarea tiene pruebas y control de cambio/bug asociado.
7. Los secretos, tokens y datos personales nunca se documentan en texto plano.

## Mapa documental
| Archivo | Propósito |
|---|---|
| [00-CONTEXT.md](00-CONTEXT.md) | Contexto, visión, alcance, glosario y restricciones |
| [01-CENTRAL-MEMORY.md](01-CENTRAL-MEMORY.md) | Fuente de verdad estable y decisiones vigentes |
| [02-SHORT-TERM-MEMORY.md](02-SHORT-TERM-MEMORY.md) | Estado de la iteración y trabajo inmediato |
| [03-LONG-TERM-MEMORY.md](03-LONG-TERM-MEMORY.md) | Conocimiento durable, evolución y mantenimiento |
| [04-SENSORY-MEMORY.md](04-SENSORY-MEMORY.md) | Entradas externas, evidencias, señales y observaciones sin validar |
| [05-ARCHITECTURE.md](05-ARCHITECTURE.md) | Arquitectura lógica/física, límites y diagramas |
| [06-DOMAIN-AND-BUSINESS.md](06-DOMAIN-AND-BUSINESS.md) | Dominios, reglas, estados y procesos |
| [07-DESIGN-PATTERNS.md](07-DESIGN-PATTERNS.md) | Patrones, polimorfismo y contratos |
| [08-SECURITY-AND-PRIVACY.md](08-SECURITY-AND-PRIVACY.md) | Seguridad, ciberseguridad, privacidad y amenazas |
| [09-API-INTEGRATION-CATALOG.md](09-API-INTEGRATION-CATALOG.md) | Catálogo de productos Meta, capacidades, permisos y límites |
| [10-USER-STORIES.md](10-USER-STORIES.md) | Historias, criterios de aceptación y trazabilidad |
| [11-TASK-BACKLOG.md](11-TASK-BACKLOG.md) | Tareas técnicas y controles por tarea |
| [12-QA-AND-TEST-STRATEGY.md](12-QA-AND-TEST-STRATEGY.md) | QA, pirámide de pruebas, estrategia y gates |
| [13-OPERATIONS-AND-OBSERVABILITY.md](13-OPERATIONS-AND-OBSERVABILITY.md) | SRE, eventos, observabilidad, recuperación y soporte |
| [14-AUDIT-AND-CHANGELOG.md](14-AUDIT-AND-CHANGELOG.md) | Auditoría, ADR, bugs, cambios y evidencias |
| [15-ROADMAP-AND-ADVANCEMENT.md](15-ROADMAP-AND-ADVANCEMENT.md) | Fases, dependencias, hitos y avance |
| [16-ROLES-AND-GOVERNANCE.md](16-ROLES-AND-GOVERNANCE.md) | Roles, RACI, aprobaciones y gobierno |

## Estado inicial
- Fase: 0 — definición, investigación y gobierno documental.
- Código fuente: no iniciado por decisión explícita.
- Ramas: `environment/local` (trabajo activo), `environment/develop` (integración).
- Historias: definidas en el backlog documental; no se consideran implementadas.
- Fuente de investigación detallada: `META_SERVICES.md`; verificar vigencia antes de convertir cualquier dato externo en requisito contractual.

## Cómo mantener la documentación
- Cambios de arquitectura: crear ADR y enlazar historias/tareas afectadas.
- Cambio externo de Meta: registrar evidencia en memoria sensorial; validar; promover a memoria central/larga duración.
- Bug: crear ID `BUG-xxxx`, severidad, reproducción, impacto, causa raíz, corrección y regresión.
- Cambio: crear ID `CR-xxxx`, motivación, alternativas, impacto, aprobación y migración.
- Tarea: ID `TASK-xxxx`, historia padre, dependencias, DoR, DoD, pruebas y control asociado.
- Actualizar el estado en `02-SHORT-TERM-MEMORY.md`, `11-TASK-BACKLOG.md` y `15-ROADMAP-AND-ADVANCEMENT.md` en el mismo cambio.

## Definición de listo para comenzar código
Todos los gates G0–G8 del roadmap deben estar aprobados, las historias priorizadas deben tener criterios testeables, el modelo de amenazas debe tener mitigaciones asignadas, y las APIs/permisos críticos deben haberse validado contra fuentes oficiales y una app/tenant de prueba.
