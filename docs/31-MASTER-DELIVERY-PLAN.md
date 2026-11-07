# 31 — Fases de entrega y plan maestro

**Estado:** propuesta de roadmap basada en PD-001..PD-011. No son estimaciones de calendario ni recorte permanente del alcance.

## Principios

- Construir capacidades completas y verificables por incrementos verticales.
- Identidad, tenant, eventos, observabilidad, seguridad y CI preceden a integraciones.
- Cada producto Meta incluye adapter, webhook, permisos/capabilities, políticas, pruebas y operación.
- CRM e Inbox son dominios propios.
- IA básica llega cuando Inbox, mensajes, consentimiento y costes están disponibles.
- Paralelizar solo bounded contexts con contratos y ownership estables.
- No habilitar gasto publicitario ni acciones externas sensibles sin autorización explícita.

## Fase 0 — Descubrimiento y arquitectura

Decisiones del propietario; especificación funcional por módulo y journeys; roles/permisos/estados/errores; ADR de stack y architecture spike; modelo de datos y contratos iniciales; threat model; clasificación de datos; plan de costos VPS y SLO/RPO/RTO propuestos.

**Gate:** decisiones de producto bloqueantes confirmadas, viabilidad técnica revisada y seguridad involucrada.

## Fase 1 — Plataforma y developer experience

Repositorio y ownership claros; backend base y frontend Angular; lint/typecheck/build/tests; Docker Compose; configuración/secret management; migraciones; API edge; OIDC; tenant/membership; RBAC/ABAC; PostgreSQL, Redis, RabbitMQ, outbox/inbox; observabilidad, auditoría, feature flags; CI con quality/security gates y SBOM.

**Gate:** instalación reproducible desde cero, pipelines verdes, tenant isolation y backup/restore demostrados.

## Fase 2 — Control Plane Meta

Meta App por entorno; OAuth/Business Login y Embedded Signup si elegible; token vault; rotación/revocación/reconexión; asset registry; capability registry; webhook gateway; sincronización/reconciliación; panel de conexiones; matriz permisos/tasks/elegibilidad/App Review.

**Gate:** sandbox y cuenta real autorizada; no exponer capacidades no concedidas.

## Fase 3 — WhatsApp + Inbox base

WhatsApp Cloud API, templates, media, interactive, Flows y capacidades elegibles; estados y receipts; Inbox; conversaciones, asignación, equipos, etiquetas, notas, búsqueda y handoff; contactos/identidades CRM; consentimiento/opt-out/ventanas; webhooks, idempotencia, replay, DLQ y reconciliation; usage/cost ledger.

**Gate:** conectar → recibir webhook → mostrar conversación → responder → conciliar estado, con seguridad/permisos.

## Fase 4 — CRM y automatización básica

Contactos, empresas, leads, oportunidades/pipeline, actividades; deduplicación/identidad multicanal; campos, segmentos, tareas y ownership; motor de reglas (trigger, condition, action, schedule, retries, audit); chatbot basado en reglas/flows y handoff humano; AI suggestions en inbox; AI Gateway y límites de coste/datos.

**Gate:** cada automatización tiene versión, simulación, permisos, límites, historial, pausa y rollback.

## Fase 5 — Facebook Pages y Messenger

Pages, mensajes Messenger, comentarios/moderación, media, webhooks, permisos, ventanas, capabilities y pruebas de contrato.

**Gate:** journeys y políticas específicos demostrados; no asumir paridad con WhatsApp.

## Fase 6 — Instagram y Threads

Instagram Login/Facebook Login según capacidad; publicación, comentarios, messaging e insights autorizados; Threads API como adapter independiente.

**Gate:** account type, scopes, App Review y limitaciones comprobadas por operación.

## Fase 7 — Leads, Marketing API y Conversions API

Lead Ads, retrieval, formularios, provenance, lifecycle y routing; Campaign/ad set/ad/creative lifecycle; draft, validation, dry-run, approvals, budget caps, kill switch y reconciliation; insights, reporting, cost ledger; CAPI, event_id, dedupe, consent, diagnostics y atribución con límites explícitos.

**Gate:** gasto real deshabilitado hasta autorización y límites; pruebas con cuenta elegible.

## Fase 8 — Hardening, operación y producción

Pentest; cierre de findings críticos/altos; carga, resiliencia, chaos y degradación; backup/restore, DR, rollback, incident response y runbooks; SLO/alertas, soporte, documentación; revisión legal/privacidad; Meta App Review/Business Verification/Tech Provider según elegibilidad; release candidate con evidencia.

**Gate:** docs/20 completo y aceptación explícita del propietario para commit/tag concreto.

## Paralelismo

Después de Fase 1 y contratos estables:
- WhatsApp, CRM e Inbox pueden dividirse por paquetes con contrato compartido.
- Facebook/Messenger e Instagram pueden avanzar en paralelo con owner único de contratos de eventos/capabilities.
- Ads/CAPI/Leads se paralelizan tras estabilizar consentimiento, asset registry y event platform.
- QA, seguridad, documentación y SRE participan desde el inicio.

## Bloqueos que no detienen todo el proyecto

| Bloqueo | Fases afectadas | Trabajo que sí continúa |
|---|---|---|
| Precios/planes | Billing comercial | arquitectura y uso interno |
| Retención/asesoría legal | retención final y producción | modelo minimizador configurable |
| Cuenta Meta/App Review | validación real de integración | adapters, contratos y sandbox |
| Presupuesto VPS/SLO/volumen | sizing y HA | desarrollo local y topología lógica |
| Proveedor IA/política de datos | IA generativa externa | motor de reglas y AI Gateway |
| Límites de gasto/aprobadores | activación Ads | draft, simulación y reporting |

## Métricas

Por fase: requisitos aprobados/total, criterios verificados/total, tareas verificadas/total, tests pasados/ejecutados, defectos por severidad, permisos Meta verificados, riesgos abiertos y evidencia. No reportar porcentajes sin denominador y evidencia.
