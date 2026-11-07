# 10 — Historias de usuario y criterios de aceptación

## Convenciones
Historia `US-XXX`; criterios `AC-XXX-NN`; cada criterio debe poder probarse. Prioridad: P0 fundacional/seguridad, P1 producto, P2 optimización/expansión. Las historias no están implementadas.

## Épica EP-01 — Tenant, identidad y gobierno
### US-001 — Aislamiento de organizaciones (P0)
Como owner, quiero crear y administrar tenants aislados para que cada cliente opere solo sus activos y datos.
- AC-001-01: cada entidad tenant-scoped requiere tenant_id y autorización contextual.
- AC-001-02: requests sin tenant válido se rechazan.
- AC-001-03: tests BOLA prueban lectura/escritura cross-tenant en todos los recursos.
- AC-001-04: jobs, cache, storage, logs y métricas no mezclan tenants.
Tareas: TASK-001, TASK-002, TASK-003.

### US-002 — Roles y permisos (P0)
Como administrador quiero asignar roles y permisos granulares para limitar operaciones sensibles.
- AC-002-01: RBAC+ABAC valida actor, tenant, asset, acción y propósito.
- AC-002-02: gasto publicitario, exportación y credenciales requieren step-up/aprobación.
- AC-002-03: toda denegación sensible genera evento auditable.
Tareas: TASK-004, TASK-005.

## Épica EP-02 — Conexión y activos Meta
### US-003 — Conectar Meta de forma segura (P0)
Como administrador quiero conectar Meta mediante OAuth/Embedded Signup sin compartir contraseñas.
- AC-003-01: state one-time y validación de redirect URI.
- AC-003-02: intercambio server-side; tokens cifrados.
- AC-003-03: registrar scopes, expiraciones y grants reales.
- AC-003-04: revocación/reconexión actualiza capabilities.
Tareas: TASK-006, TASK-007, TASK-008.

### US-004 — Inventario de activos y capacidades (P0)
Como administrador quiero ver activos y capacidades efectivas para conocer qué operaciones están disponibles.
- AC-004-01: listar WABA, phone, Page, IG, ad account, forms y datasets accesibles.
- AC-004-02: capability calculada por permisos, tasks, versión y elegibilidad.
- AC-004-03: razón explícita cuando una operación no está disponible.
Tareas: TASK-009, TASK-010.

## Épica EP-03 — WhatsApp
### US-005 — Enviar mensajes y medios (P1)
Como agente quiero enviar mensajes soportados y consultar su ciclo de entrega.
- AC-005-01: tipos discriminados y validación por canal/capability.
- AC-005-02: aceptación y delivery son estados diferentes.
- AC-005-03: webhook actualiza sent/delivered/read/failed sin duplicar efectos.
- AC-005-04: política impide envíos no elegibles.
Tareas: TASK-011, TASK-012, TASK-013.

### US-006 — Administrar plantillas (P1)
Como marketing manager quiero crear, consultar, versionar y monitorear plantillas.
- AC-006-01: listar/leer/crear/editar/eliminar según permisos.
- AC-006-02: registrar categoría, idioma, componentes, calidad y estados Meta.
- AC-006-03: impedir envío de plantilla no aprobada o incompatible.
- AC-006-04: historial inmutable de revisiones y aprobación.
Tareas: TASK-014, TASK-015.

### US-007 — Diseñar y operar Flows (P1)
Como negocio quiero calificar leads y capturar datos estructurados en WhatsApp.
- AC-007-01: ciclo draft/validated/published/versioned.
- AC-007-02: Data Exchange cifrado y autenticado.
- AC-007-03: respuestas correlacionadas con tenant/contact/flow version.
Tareas: TASK-016.

### US-008 — Marketing Messages y costes (P1)
Como marketer quiero enviar marketing por la API recomendada y conocer costes/elegibilidad.
- AC-008-01: adapter independiente y migrable.
- AC-008-02: validar categoría, consentimiento y elegibilidad.
- AC-008-03: registrar estimado y coste reportado por separado.
Tareas: TASK-017, TASK-018.

## Épica EP-04 — Facebook e Instagram
### US-009 — Pages y Messenger (P1)
Como agente quiero administrar conversaciones y activos Facebook permitidos.
- AC-009-01: Page tasks y scopes verificados.
- AC-009-02: ventanas/políticas de Messenger aplicadas.
- AC-009-03: handoff humano y eventos trazables.
Tareas: TASK-019.

### US-010 — Instagram profesional (P1)
Como social media manager quiero publicar, responder y consultar insights según permisos.
- AC-010-01: seleccionar login mode según capacidad requerida.
- AC-010-02: account type y scopes comprobados.
- AC-010-03: media publish/comments/DM/insights preservan limitaciones nativas.
Tareas: TASK-020, TASK-021.

## Épica EP-05 — Leads, Ads y medición
### US-011 — Capturar y recuperar Leads (P1)
Como vendedor quiero recibir leads en tiempo real y recuperar históricos autorizados.
- AC-011-01: webhook durable, dedupe y retrieval permission check.
- AC-011-02: custom fields y provenance preservados.
- AC-011-03: lifecycle, assignment y consent auditables.
Tareas: TASK-022, TASK-023.

### US-012 — Gestionar campañas y anuncios (P1)
Como marketing manager quiero crear, revisar, aprobar, activar y pausar campañas con guardrails.
- AC-012-01: draft → validate → approve → submit → reconcile.
- AC-012-02: dry-run, budget cap, actor approval y kill switch.
- AC-012-03: reconciliar estados externos y gasto.
Tareas: TASK-024, TASK-025.

### US-013 — Medir conversiones (P1)
Como analista quiero enviar eventos server-side y deduplicar conversiones.
- AC-013-01: event_id estable y dedupe con Pixel/SDK cuando aplique.
- AC-013-02: consentimiento y action_source validados.
- AC-013-03: match quality y resultado se reportan sin prometer atribución perfecta.
Tareas: TASK-026.

## Épica EP-06 — Plataforma confiable
### US-014 — Webhooks resilientes (P0)
Como operador quiero recibir y procesar eventos una o más veces sin efectos duplicados.
- AC-014-01: verificación de autenticidad por producto.
- AC-014-02: persistencia antes de ACK según contrato.
- AC-014-03: replay/DLQ auditable.
Tareas: TASK-027, TASK-028.

### US-015 — Observabilidad y auditoría (P0)
Como SRE/auditor quiero reconstruir quién hizo qué y por qué.
- AC-015-01: correlation/trace IDs entre request, Meta, webhook y worker.
- AC-015-02: audit trail append-only y redacción de secretos/PII.
- AC-015-03: dashboards de SLO, errores, cuotas y colas.
Tareas: TASK-029, TASK-030.

### US-016 — Seguridad y privacidad (P0)
Como responsable de seguridad quiero demostrar aislamiento, minimización y eliminación.
- AC-016-01: threat model y controles por riesgo.
- AC-016-02: pruebas SAST/SCA/DAST/pentest.
- AC-016-03: flujos de exportación, revocación y borrado.
Tareas: TASK-031, TASK-032.

## Épica EP-07 — Extensibilidad
### US-017 — Threads y nuevas capacidades (P2)
Como product owner quiero añadir productos Meta sin reescribir dominios existentes.
- AC-017-01: adapter y capabilities nuevos sin romper contratos previos.
- AC-017-02: contract tests y version policy.
Tareas: TASK-033.

## Trazabilidad
El backlog detallado, dependencias, bugs y CR por tarea está en `11-TASK-BACKLOG.md`. Una historia solo pasa a Done cuando todas sus tareas, criterios, pruebas, documentación y controles están cerrados.
