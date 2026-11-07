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


## Épica EP-08 — CRM y relación comercial
### US-018 — Contactos e identidades omnicanal (P1)
Como usuario comercial quiero mantener un perfil de contacto unificado sin perder la identidad ni procedencia de cada canal.
- AC-018-01: un contacto puede asociar múltiples identidades externas por canal, con unicidad scoped por tenant/proveedor.
- AC-018-02: reglas de merge/dedupe conservan historial, fuente, timestamps y posibilidad de deshacer merges.
- AC-018-03: campos personalizados tienen tipo, validación, permisos y versionado.
- AC-018-04: todas las consultas y búsquedas respetan tenant y permisos de campo.
Tareas: TASK-042, TASK-043.

### US-019 — Pipeline, oportunidades y actividades (P1)
Como equipo comercial quiero gestionar leads y oportunidades en un pipeline configurable.
- AC-019-01: pipelines, etapas, motivos de pérdida y campos se configuran por tenant.
- AC-019-02: transiciones registran actor, fecha, origen y motivo.
- AC-019-03: tareas, notas, recordatorios y actividades aparecen en timeline.
- AC-019-04: asignación y visibilidad respetan equipos/roles.
Tareas: TASK-044.

## Épica EP-09 — Inbox omnicanal y colaboración
### US-020 — Bandeja unificada multicanal (P0)
Como agente quiero atender conversaciones de los canales Meta desde una bandeja común sin perder capacidades nativas.
- AC-020-01: cada conversación mantiene tenant, canal, cuenta/asset, contacto e identificadores externos.
- AC-020-02: mensajes, medios, errores y estados conservan discriminación y payload nativo versionado.
- AC-020-03: filtros, búsqueda, estados y asignación no mezclan tenants ni canales.
- AC-020-04: la interfaz indica capacidades, ventanas y restricciones aplicables por canal.
- AC-020-05: operaciones no soportadas se deshabilitan con explicación, no se simulan.
Tareas: TASK-045, TASK-046.

### US-021 — Equipos, asignación y handoff (P1)
Como supervisor quiero distribuir conversaciones y permitir colaboración entre agentes.
- AC-021-01: asignación manual y reglas de distribución con límites por equipo/tenant.
- AC-021-02: handoff bot-humano y agente-agente registra motivo, actor y contexto.
- AC-021-03: notas internas y menciones nunca se envían al contacto.
- AC-021-04: concurrencia evita respuestas duplicadas y muestra presencia/lock con expiración.
Tareas: TASK-047.

## Épica EP-10 — Automatización e IA asistiva
### US-022 — Automatizaciones basadas en reglas (P1)
Como administrador quiero crear automatizaciones versionadas que reaccionen a eventos y ejecuten acciones autorizadas.
- AC-022-01: workflow contiene trigger, conditions, actions, version, status y owner.
- AC-022-02: dry-run/simulation muestra acciones y efectos antes de activar.
- AC-022-03: retries, timeout, idempotency, DLQ, pausa y kill switch están disponibles.
- AC-022-04: permisos, consentimiento, ventanas y límites se revalidan en el momento de ejecutar.
- AC-022-05: cada ejecución conserva trazabilidad y coste.
Tareas: TASK-048, TASK-049.

### US-023 — Chatbots y sugerencias IA (P1)
Como agente/administrador quiero usar chatbots básicos y sugerencias de respuesta con control humano.
- AC-023-01: AI Gateway soporta proveedores intercambiables sin acoplar dominio.
- AC-023-02: sugerencia se muestra como borrador; no se envía sin acción humana explícita.
- AC-023-03: chatbot puede operar con reglas/flows y derivar a humano.
- AC-023-04: límites por tenant, coste, latencia, redacción de datos y kill switch.
- AC-023-05: prompts/versiones, resultado y feedback se auditan sin almacenar secretos.
- AC-023-06: prompt injection y contenido de usuario/adjuntos se tratan como datos no confiables.
Tareas: TASK-050, TASK-051.

## Épica EP-11 — SaaS y administración de plataforma
### US-024 — Administración de tenants y planes (P1)
Como operador de plataforma quiero administrar organizaciones, membresías, límites y planes sin acceder indebidamente a datos de clientes.
- AC-024-01: provisioning/suspension/reactivation de tenant es auditado y reversible donde sea posible.
- AC-024-02: planes y entitlements habilitan límites/capacidades sin hardcode disperso.
- AC-024-03: uso medido separa consumo Meta, infraestructura y coste IA.
- AC-024-04: acceso de soporte requiere justificación, alcance temporal y auditoría.
Tareas: TASK-052.

## Trazabilidad ampliada
US-018..US-024 y TASK-042..052 amplían el alcance confirmado por el propietario. Los criterios se consideran baseline propuesta hasta revisión funcional detallada; ninguna historia está implementada por el hecho de documentarla.


## Épica EP-12 — Partners, facturación transparente y plataforma de desarrolladores

### US-025 — Acceso delegado de agencias/partners (P1)
Como propietario de un negocio quiero permitir que una agencia gestione solo los activos y acciones autorizadas y poder revocar ese acceso.
- AC-025-01: acceso a tenant cliente requiere grant explícito con ámbito, actor, rol, assets/acciones, purpose, expiración y aprobador.
- AC-025-02: la agencia no hereda datos de un tenant por relación comercial o membership en otro tenant.
- AC-025-03: cliente puede revocar grant inmediatamente; expiración y revocación se propagan a sesiones, cache, jobs y permisos.
- AC-025-04: toda operación conserva identidad de agencia/actor y es auditable.
- AC-025-05: soporte interno usa mecanismo JIT separado y no se confunde con acceso de partner.
Tareas: TASK-058.

### US-026 — Facturación, asientos y consumo transparente (P1)
Como administrador de tenant quiero entender suscripción, usuarios, uso y cargos externos sin confundir costes de Meta con el precio del producto.
- AC-026-01: subscription, seats, usage, IA, infraestructura y costes Meta externos tienen ledger y fuente independientes.
- AC-026-02: cada cargo/estimación expone moneda, mercado, fecha, rate card/version y condición.
- AC-026-03: estimate, max/upper bound, provider-reported actual y reconciled amount no se presentan como equivalentes.
- AC-026-04: planes y capacidades se aplican mediante entitlements versionados.
- AC-026-05: no se cobra tarifa no aprobada ni se inventa impuesto/markup.
Tareas: TASK-057, TASK-063.

### US-027 — API pública y webhooks para integradores (P1)
Como desarrollador de un cliente quiero integrar WhatsBusiness mediante contratos versionados y eventos firmados.
- AC-027-01: API pública documentada y versionada con OAuth/scopes o credenciales de servicio de alcance mínimo.
- AC-027-02: credenciales se pueden rotar/revocar y nunca se muestran de nuevo en claro.
- AC-027-03: webhooks firmados, con timestamp/replay protection, delivery attempts, retries, DLQ y reenvío controlado.
- AC-027-04: rate limits por tenant/client y audit de acceso.
- AC-027-05: eventos preservan schema version y compatibilidad explícita.
Tareas: TASK-062.



## Épica EP-13 — Validación de mercado y ajuste de producto

### US-028 — Validar ICP, problemas y disposición a pagar (P0 discovery)
Como equipo de producto quiero confirmar con evidencia qué empresas necesitan WhatsBusiness y qué valor pagarían para no diseñar pricing ni roadmap sobre suposiciones.
- AC-028-01: baseline sectorial INEC incluye año, base provisional/definitiva, metodología y advertencias.
- AC-028-02: entrevistas cubren empresas de servicios, comercio y agencias; se registran perfil, problema, workflow actual, frecuencia/dolor, decisor y alternativa.
- AC-028-03: oportunidades y objeciones se codifican en un repositorio de investigación sin PII innecesaria.
- AC-028-04: pilotos instrumentan activación, time-to-value, adopción de asientos, uso por canal, retención y outcomes definidos.
- AC-028-05: TAM/SAM/SOM separa unidades registradas de empresas elegibles, alcanzables y dispuestas a pagar; toda extrapolación documenta método y supuestos.
- AC-028-06: no se aprueba lista de precios ni forecast de ingresos con solo REEM o entrevistas cualitativas.
Tareas: TASK-066.
