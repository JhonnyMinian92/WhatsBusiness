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


## Épica EP-14 — Campaign Intelligence y aprendizaje continuo

### US-029 — Aprendizaje continuo y optimización de campañas con guardrails (P0)
Como marketer/owner quiero que WhatsBusiness analice el rendimiento de Meta y los resultados comerciales para recomendar el siguiente experimento y escalar con límites verificables.
- AC-029-01: snapshots de campañas, ad sets, anuncios, creativos, presupuestos, delivery status, Insights y API version se almacenan con timestamp y provenance.
- AC-029-02: métricas reportadas por Meta se separan de eventos CRM/CAPI y de revenue/margen reconciliados.
- AC-029-03: cada recomendación incluye hipótesis, KPI principal, ventana, muestra, incertidumbre, evidencia y riesgos.
- AC-029-04: la plataforma no expone ni simula score interno de Andromeda/GEM; la selección y ranking pertenecen a Meta.
- AC-029-05: los cambios de presupuesto cumplen máximo +20% por operación y máximo +20% acumulado sobre baseline rolling 24h.
- AC-029-06: no escala si la señal es insuficiente/obsoleta, delivery tiene restricción o aprendizaje inestable, budget cap, consent, policy o margen impiden la acción.
- AC-029-07: los anuncios ganadores permanecen protegidos; la nueva creatividad prueba primero en test cell aislada y no altera el ad set maduro por defecto.
- AC-029-08: cambios externos requieren draft, simulación/preflight, aprobación, execution, reconciliation, audit y rollback/stop policy.
- AC-029-09: resultado posterior actualiza el historial experimental y la siguiente hipótesis sin afirmar causalidad cuando solo hay atribución.
Tareas: TASK-067, TASK-068, TASK-071, TASK-072, TASK-077, TASK-078.

### US-030 — Creative Lab y experimentos de anuncios (P1)
Como marketer quiero generar, versionar y probar creatividades diversas sin perder los anuncios ganadores ni incumplir lineamientos.
- AC-030-01: cada CreativeVariant conserva concepto, oferta, hook, formato, CTA, placement, asset provenance, prompt/model, brand kit y claims evidence.
- AC-030-02: se puede crear test cell con control/variantes, métrica primaria, presupuesto, fecha, muestra/stop criteria y audiencia no solapada según capabilities.
- AC-030-03: los previews por placement y creative feature se revisan; creatives generados con IA quedan paused hasta aprobación cuando así lo exige API/feature vigente.
- AC-030-04: el motor evita near-duplicate creatives y explica qué hipótesis/variable diferencia cada variante.
- AC-030-05: detecta Creative Fatigue/Creative Limited mediante insights y recomendaciones disponibles en API; nunca inventa métricas si no hay datos.
- AC-030-06: promover/retirar un creative deja snapshots y audit y no reemplaza automáticamente un ganador sin aprobación.
Tareas: TASK-069, TASK-070, TASK-073, TASK-079.

### US-031 — Interoperabilidad con agentes y herramientas Meta (P1)
Como administrador quiero que agentes humanos/IA y asistentes nativos Meta colaboren sin duplicar respuestas, acciones o permisos.
- AC-031-01: todo agente/tool call se registra con actor/provider, purpose, tenant, conversation/campaign ownership, scope y approval state.
- AC-031-02: los agentes Meta Ads/MCP pueden aportar drafts/preview/insights cuando API/cuenta sea elegible; la publicación sigue approval gate.
- AC-031-03: Meta Business Agent y WhatsBusiness tienen ownership/handoff explícito de conversación; se previenen loops y double replies.
- AC-031-04: MCP expone herramientas mediante scopes mínimos, schemas, rate limits, audit y human confirmation para external writes.
- AC-031-05: no se conecta OpenWA/WhatsApp Web automation ni herramientas que evadan APIs/permisos oficiales.
Tareas: TASK-074, TASK-075, TASK-080.

### US-032 — Inteligencia de cambios Meta y políticas (P0 platform operations)
Como operador de plataforma quiero detectar cambios de API, features, permisos y políticas y conocer su impacto antes de que rompan integraciones o campañas.
- AC-032-01: cada cambio tiene fuente oficial, date, product/API version, effective date, capability, country/account availability y confidence.
- AC-032-02: cambios se mapean a adapters, tests, tenants/capabilities, campaigns and runbooks affected.
- AC-032-03: feature flags/capabilities se habilitan por evidencia versionada y no por suposiciones.
- AC-032-04: alerts pueden generar draft migration tasks/PRs, pero no modificar permisos ni publicar en Meta sin aprobación.
Tareas: TASK-076.



## Épica EP-15 — Expansión multicanal y aprendizaje experimental

### US-033 — Identidad y reorganización del frontend (P1)
Como usuario del producto quiero que la aplicación Angular se llame `app-meta-ecuapp` para identificar el frontend sin mover ni romper el backend NestJS.
- AC-033-01: el código Angular se ubica en `app-meta-ecuapp/` y el proyecto Nx/Angular usa exactamente ese nombre.
- AC-033-02: `apps/api` conserva su ruta y targets operativos.
- AC-033-03: workspace pnpm, Angular, Nx, tests, CI, Docker, build outputs y documentación se actualizan sin referencias rotas.
- AC-033-04: frozen install, build, typecheck, unit/integration y E2E aplicables pasan en el mismo commit.
Tareas: TASK-081.

### US-034 — TikTok APIs oficiales para Ads, contenido y mensajería (P0)
Como marketer quiero conectar cuentas TikTok y operar sus capacidades comerciales y de contenido oficiales desde WhatsBusiness con permisos, elegibilidad y límites explícitos.
- AC-034-01: existe un capability registry por API/producto/versión/cuenta/scope/país/operación y evidencia vigente.
- AC-034-02: Marketing API permite gestionar los recursos admitidos de Ads, audiencias, leads, catálogos e Insights; se utiliza Upgraded Smart+ en los flujos que migren desde Legacy Manual Flow.
- AC-034-03: Login Kit, Organic API, Content Posting, Display y Business Messaging usan adapters y permisos independientes.
- AC-034-04: Direct Post requiere `video.publish`, autorización del usuario y revisión/audit del cliente; un upload a draft no se reporta como publicación.
- AC-034-05: webhooks, leads y mensajes se verifican, deduplican, persisten y enrutan con tenant isolation, consentimiento y handoff.
- AC-034-06: las operaciones sin capability o scope vigente fallan de forma cerrada.
Tareas: TASK-082, TASK-083, TASK-084, TASK-090, TASK-091.

### US-035 — Publicidad oficial en ChatGPT (OpenAI Advertiser API) (P0)
Como anunciante quiero gestionar campañas, anuncios, recursos y medición de ChatGPT Ads desde WhatsBusiness sin exponer claves ni ejecutar gasto no autorizado.
- AC-035-01: el adapter utiliza OpenAI Advertiser API, no la API de modelos ni endpoints inventados.
- AC-035-02: cuentas, campañas, ad groups, ads, files, product feeds, previews, audit logs e Insights quedan vinculados a tenant/cuenta y a capability evidence vigente.
- AC-035-03: campañas y anuncios se crean en draft/paused cuando el endpoint lo permita y requieren aprobación antes de activar.
- AC-035-04: Measurement Pixel y Conversions API separan credenciales, aplican consentimiento y deduplican por la clave oficial de evento.
- AC-035-05: cada métrica expone ventana de atribución, granularidad, moneda, zona horaria y freshness.
- AC-035-06: operaciones externas tienen idempotencia, audit, reconciliación y kill switch.
Tareas: TASK-085, TASK-086, TASK-090, TASK-091.

### US-036 — Experimentos V1/V2 y aprendizaje continuo multicanal (P0)
Como marketer quiero que toda campaña publicitaria enviada por WhatsBusiness mediante API genere una versión V1 original y una V2 alternativa y solo se active con reparto aleatorio válido, para aprender de sus resultados y mejorar las siguientes versiones.
- AC-036-01: toda campaña enviada mediante API crea V1 original y V2 alternativa inmutables, con lineage e hipótesis, antes de activar cualquier anuncio.
- AC-036-02: cada experimento declara variable primaria, KPI, población, tamaño de muestra, MDE, ventana, presupuesto y stop rules.
- AC-036-03: asignación aleatoria estable y excluyente; se detecta SRM y se distingue asignación, delivery y exposición efectiva. Si no puede garantizarse el split aleatorio, la activación se bloquea salvo excepción manual aprobada, que no se considera A/B.
- AC-036-04: se registran atributos visuales, texto, tipografía cuando sea controlable, CTA, landing, oferta, placement, fecha, hora, audiencia y outcomes.
- AC-036-05: métricas de plataforma, outcomes CRM y uplift causal permanecen separados.
- AC-036-06: el motor genera recomendaciones y drafts con evidencia/uncertainty; publicación y gasto conservan approval gate.
- AC-036-07: un ganador no se sobrescribe y toda nueva ronda conserva historial versionado.
Tareas: TASK-087, TASK-088, TASK-089, TASK-091.



## EP-16 — Experimentación y operación omnicanal (2026-11-09)

### US-037 — Experimentation Platform omnicanal (P0)
Como Growth/Marketing quiero diseñar, asignar, ejecutar, analizar y cerrar experimentos con validez estadística compartida entre canales.
- AC-037-01: cada experimento preregistra hipótesis, población, unidad, brazos, KPI, baseline, MDE, muestra, presupuesto, ventana y parada.
- AC-037-02: assignment estable, único y reproducible con randomization/nativo comprobable; SRM y contaminación son detectables.
- AC-037-03: decisión winner/loser/inconclusive/invalidated/observational_only según reglas predefinidas; no se promueve por valor bruto.
- AC-037-04: análisis, dataset, métricas, método, versión y auditoría son reproducibles.
Tareas: TASK-092, TASK-093, TASK-105.

### US-038 — Orquestación de journeys y frecuencia omnicanal (P0)
Como operador quiero coordinar anuncios, WhatsApp, email, SMS, llamadas y otros canales con una asignación coherente por persona.
- AC-038-01: journey tiene pasos, ventanas, branching, idempotencia, time zone y stop rules.
- AC-038-02: una unidad mantiene su brazo V1/V2 en todos los touchpoints del experimento.
- AC-038-03: frequency cap, quiet hours, suppression, reply/purchase stop y fallback autorizado se verifican en dispatch.
Tareas: TASK-095, TASK-106.

### US-039 — Email Campaign & Deliverability (P1)
Como marketer quiero ejecutar campañas email versionadas y medir entrega, reputación y conversiones con proveedores intercambiables.
- AC-039-01: adapter registra processed/sent/delivered/deferred/bounce/block/complaint/unsubscribe/click y calidad de open.
- AC-039-02: configuración y salud SPF/DKIM/DMARC, supresión, hard bounce y complaint bloquean despachos futuros según política.
- AC-039-03: MPP/bots se tratan como señales débiles; open rate no es KPI único ni ganador.
Tareas: TASK-096.

### US-040 — SMS y Voice Campaigns (P1)
Como equipo comercial quiero ejecutar mensajes y llamadas autorizadas y medir estados/costes/outcomes sin confundir entrega con lectura o conversación humana.
- AC-040-01: SMS tiene callbacks, DLR, coste por segmento, replies, STOP y sender/policy controls.
- AC-040-02: Voice registra estados, duración, IVR/espera/transferencia/disposition y coste.
- AC-040-03: llamadas completed no se interpretan automáticamente como conversación humana; recording/transcription requiere controles legales y retención.
Tareas: TASK-097.

### US-041 — Telegram y mensajería complementaria (P1/P2)
Como tenant quiero usar bots, Business Connections y Mini Apps con usuarios que habilitaron el canal.
- AC-041-01: webhooks/updates se verifican, deduplican por update ID y persisten dentro de los límites de retención del proveedor.
- AC-041-02: bot rights, rate limits, loop prevention y consentimiento/permiso de usuario se verifican.
- AC-041-03: no se inventan read receipts y Bot API no se interpreta como una API general de compra de Telegram Ads.
Tareas: TASK-098.

### US-042 — Google Ads y YouTube (P1)
Como anunciante quiero gestionar campañas de Search/video y experimentos nativos, midiendo conversiones online/offline según acceso.
- AC-042-01: capability/access, API version, campañas, experiment resources, reporting y conversion actions se validan por cuenta.
- AC-042-02: splits nativos, click IDs y conversiones offline se implementan solo con soporte y permisos demostrados.
Tareas: TASK-099.

### US-043 — Measurement & Analytics omnicanal (P0)
Como analista quiero medir el funnel y comparar canales con métricas consistentes, denominadores, procedencia y calidad.
- AC-043-01: raw provider evidence y eventos normalizados permanecen vinculados y versionados.
- AC-043-02: cada métrica conserva fuente, unidad, denominador, ventana, timezone, moneda, freshness y caveats.
- AC-043-03: una venta no se cuenta varias veces por conversiones reportadas por diferentes plataformas.
- AC-043-04: reporting diferencia provider attribution, first-party observed, modelled e incremental lift.
Tareas: TASK-094, TASK-100, TASK-101, TASK-102.

### US-044 — Consent, Preference & Suppression Center (P0)
Como titular y tenant quiero controlar finalidad y preferencias por canal, y que cada envío respete revocaciones/oposiciones.
- AC-044-01: evidencia/base/aviso/finalidad/preferencia/scope se registran por canal y tipo de mensaje.
- AC-044-02: revocación bloquea queued/scheduled y se aplica nuevamente justo antes de despacho.
- AC-044-03: reglas por jurisdicción/sector se versionan y las decisiones quedan auditadas; unknown falla cerrado cuando aplique.
Tareas: TASK-103.

### US-045 — Channel Registry & Market Prioritization (P1)
Como Product/Growth quiero priorizar conectores por evidencia de mercado, valor, API, medición, coste y riesgo.
- AC-045-01: cada canal tiene business case, source/date, capacidad oficial, alcance geográfico, elegibilidad, métricas y coste.
- AC-045-02: decisión pilot/integrate/defer/reject con revisión y scorecard auditable.
Tareas: TASK-104.
