# 02 — Memoria a corto plazo

> Estado operativo mutable. Actualizar al inicio y al cierre de cada bloque de trabajo. Este archivo es el handoff entre agentes y sesiones.

## Sesión actual
- Iteración: DOC-AGENT-OS / refuerzo agent-first.
- Rama objetivo: `environment/local`.
- Rama de integración: `environment/develop` (no tocar directamente).
- Objetivo: permitir que Codex, Claude Code y agentes compatibles entiendan el producto sin contexto de chat y ejecuten cambios trazables.
- Estado: sistema de entrada, ejecución, grafos, trazabilidad y aceptación documentado.
- Implementación del producto: no declarada ni auditada por este bloque documental. No inferir porcentaje.

## Trabajo completado en esta sesión
- [x] Crear contrato universal `AGENTS.md`.
- [x] Crear instrucciones puente `CLAUDE.md`, `GEMINI.md` y `.github/copilot-instructions.md`.
- [x] Definir bootstrap, jerarquía de fuentes, ciclo de ejecución y protocolo de handoff.
- [x] Añadir grafo de dependencias Mermaid para EP/TASK.
- [x] Añadir matriz de trazabilidad requisito → historia → tarea → módulo → test → evidencia.
- [x] Definir estados distintos: implementado, verificado y aceptado.
- [x] Definir criterios objetivos de producto terminado y aprobación exclusiva del propietario.
- [x] Actualizar índice y aclarar que una petición explícita de implementación habilita el trabajo solicitado.

## Próxima acción obligatoria ante la siguiente solicitud de producto
1. Leer `AGENTS.md` y `docs/17-AGENT-OPERATING-MODEL.md`.
2. Inspeccionar árbol, stack, código, tests, workflows, migraciones, configuración y git status reales.
3. Comparar la implementación existente con historias, tareas y criterios; no asumir que el backlog representa el código actual.
4. Elegir el siguiente bloque solicitado y desbloqueado del grafo; implementar y probar el cambio end-to-end.
5. Actualizar los registros afectados y dejar handoff reproducible.

## Bloqueos/validaciones aún abiertos
- Credenciales, Meta App, Business Verification, App Review y permisos reales no verificados aquí.
- Versiones, límites, precios y elegibilidad de Meta deben validarse con fuentes oficiales actuales y cuenta real.
- Decisiones de stack, infraestructura, SLO/RPO/RTO y operación deben contrastarse con el repositorio y requisitos cuantificados.
- No se ha realizado auditoría técnica completa del código ni se declara ningún TASK implementado/verificado por esta sesión.

## Riesgos de proceso
| ID | Riesgo | Control |
|---|---|---|
| RSK-006 | Agentes divergen en instrucciones | AGENTS.md canónico + archivos puente |
| RSK-007 | Backlog confundido con realidad | inspección de código y evidencia por tarea |
| RSK-008 | Dependencias omitidas | grafo upstream/downstream obligatorio |
| RSK-009 | Falsa declaración de 100 % | gates y aprobación explícita del propietario |
| RSK-010 | Cambios sin memoria/handoff | actualización atómica de registros |

## Último handoff
- Archivos añadidos: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `docs/17-AGENT-OPERATING-MODEL.md`, `docs/18-EXECUTION-GRAPH.md`, `docs/19-TRACEABILITY-MATRIX.md`, `docs/20-PRODUCT-ACCEPTANCE.md`.
- Registros sincronizados: `docs/README.md`, `docs/02-SHORT-TERM-MEMORY.md`, `docs/11-TASK-BACKLOG.md` y `docs/15-ROADMAP-AND-ADVANCEMENT.md`.
- Validación GitHub: `environment/local` está 31 commits adelantada respecto de `master`, sin commits detrás; `environment/develop` permanece creada.
- Archivos de instrucciones y grafos verificados por lectura posterior a la escritura.
- Siguiente tarea técnica: inspección completa del repositorio y reconciliación de TASK-001..033 con código real, antes de asignar estados de implementación.


## Ampliación del modelo de equipo (2026-11-06)
- [x] Definir organigrama por departamentos y responsabilidades.
- [x] Definir modos single-agent, lead+specialists, parallel workstreams, review-only e incident mode.
- [x] Definir ownership de paquetes, paths exclusivos, aislamiento de worktrees y reglas para serializar escrituras.
- [x] Definir playbooks para Product/PM, BA, Marketing, UX, Architecture, Engineering, Meta, Data, QA, Security, Privacy, SRE, Finance, Support y Documentation.
- [x] Definir validación cruzada independiente, revisión adversarial, estados y gestión de hallazgos.
- [x] Definir límites de autoridad, privilegio mínimo, stop conditions y acciones externas reservadas.
- [x] Definir gates G0-G8, RAID, plantillas YAML de trabajo y revisión.
- [ ] Aplicar el modelo a la primera auditoría técnica real y ajustar los roles/paquetes con evidencia del repositorio.

Estado: documentación de gobierno ampliada; no implica que exista una infraestructura de ejecución multiagente ni que se hayan ejecutado agentes paralelos en esta sesión.


## Handoff — respuestas iniciales del propietario y baseline (2026-11-06)

### Decisiones recibidas
- PD-001..PD-011 registradas en docs/29-OWNER-DECISIONS.md.
- SaaS + plataforma interna EcuApp; greenfield; todo Meta; backend + web panel + CRM + omnichannel inbox; IA básica extensible; VPS; stack recomendada por arquitectura; entrega por fases; agentes autónomos para decisiones técnicas reversibles y trabajo no bloqueado.
- Aclaración de IA interpretada como "con visión para automatización con IA"; confirmación literal pendiente solo si la interpretación fuera incorrecta.

### Entregables de esta iteración
- docs/29: decisiones confirmadas y pendientes.
- docs/30: arquitectura y stack propuesta (NestJS/TypeScript, Angular, PostgreSQL, Redis, RabbitMQ, Docker Compose/VPS, OIDC candidato, observabilidad).
- docs/31: fases 0–8 y gates de salida.
- Cuestionario actualizado con 10/20 respuestas recibidas.

### Próximo trabajo
1. Completar requisitos funcionales detallados de CRM, Inbox, automatización y panel.
2. Reconciliar las 17 historias/33 tareas originales con el alcance nuevo y ampliar criterios de aceptación.
3. Convertir ADR-011..017 de propuestas a decisiones solo tras architecture spike y evaluación operativa.
4. Resolver preguntas pendientes que bloquean diseño comercial, retención, sizing y producción.
5. No crear código de producto hasta que la arquitectura/stack tengan evidencia suficiente; el propietario sí autorizó continuar la especificación y el trabajo técnico no bloqueado.

### Estado real
- Greenfield confirmado por el propietario; el árbol auditado no contiene código fuente.
- Stack y topología son propuestas, no implementaciones ni pruebas.
- No se afirma que existan agentes independientes ejecutando en paralelo.


## Handoff — decisiones delegadas y arquitectura adoptada (2026-11-06)

### Objetivo
El propietario autorizó aplicar todas las recomendaciones y delegó las mejores decisiones técnicas, con exigencia de evidencia y sin inventar métricas.

### Trabajo confirmado en GitHub en environment/local
- Actualizado docs/29 con decisiones PD-012..PD-023: ICP inicial, modelo comercial, costes Meta, locale, tenant/agency model, privacidad, aprobaciones, conectores, infraestructura y gobierno de releases.
- Creado docs/32 con fuentes/evidencia Meta, LOPDP/SPDP, OWASP ASVS 5.0.0 y SRE.
- Actualizado docs/30 con modular monolith, stack adoptada, límites de dominio, layout de repo, aislamiento, eventos, Meta adapters y ADR-011..020 accepted as direction.
- Actualizado docs/31 con fases 0–8 y gates.
- Actualizado docs/05 para evitar contradicción sobre microservicios.
- Actualizado docs/09 con Meta v27, Embedded Signup v4, BSUID, WAAC/PMA, Marketing Messages API sunset y Access Tier.

### Decisiones de diseño
- Modular monolith + API/worker/scheduler; extracción de microservicios solo con evidencia.
- NestJS/TypeScript, Angular, Nx/pnpm, PostgreSQL, Redis, RabbitMQ, OIDC/Keycloak, Docker, OpenTelemetry.
- Ecuador PYMES de comercio/servicios; agencias secundarias; hipótesis pendiente de discovery de mercado.
- Subscription per tenant + seats + usage; Meta pass-through separado. Sin pricing inventado.
- es-EC/USD/America-Guayaquil defaults configurables.
- Shared PG tenant_id + server-side auth + RLS; agency grants revocables; DB dedicada enterprise.
- Data minimization/configurable retention; legal review pendiente; no periodos inventados.
- Meta identities provider-scoped (BSUID), account graph flexible (WAAC/PMA), Marketing Messages API.
- Seguridad ASVS 5.0.0; UI WCAG 2.2 AA.
- Candidate SLO 99.9%, RPO 15m, RTO 4h; no SLA ni performance measure.

### Próximo bloque prioritario
1. Synchronize backlog, traceability, questionnaire, QA, SRE, privacy and agent instructions.
2. Run static consistency/read-after-write validation of all changed docs.
3. Complete TASK-039 architecture spike; only then begin production scaffold, unless owner explicitly requests a specific implementation slice.
4. Create detailed requirements and acceptance criteria for the first vertical slice.

### Estado real
- Greenfield; no backend/frontend implementation.
- No product tests, benchmark, VPS sizing, restore drill, pentest, Meta App Review, real Business account validation or production deployment performed.
- No parallel independent agent execution was available in this interaction; roles are documented, not simulated as real reviewers.
- Branch remains environment/local; master/develop untouched.


## Handoff final de la iteración documental (2026-11-06)
- [x] PD-012..PD-023 adoptadas y explicadas con reservas explícitas.
- [x] Investigación actualizada en docs/32; ADR formales docs/33.
- [x] Arquitectura y plan maestro docs/30/31 actualizados; docs/05 alineado.
- [x] Catálogo Meta docs/09 alineado.
- [x] AGENTS, contexto, memoria central, dominio, seguridad, QA y SRE sincronizados.
- [x] Backlog TASK-053..065, historias US-025..027, trazabilidad y cuestionario sincronizados.
- [x] Auditoría documental e índice actualizados.
- [ ] Read-after-write validation and branch comparisons still required before final report.
- [ ] TASK-039 architecture spike, TASK-060 load test, TASK-061 restore drill, formal privacy review and real Meta account eligibility are not performed.

Estado de producto: no implementation, no runtime metrics, no deployed environment, no production acceptance. All added tasks remain proposed until actual code and evidence exist.
