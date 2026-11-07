# 31 — Plan maestro de entrega por fases

**Corte:** 2026-11-06  
**Estado:** roadmap actualizado con las decisiones PD-001..PD-023 y hallazgos Meta/LOPDP de docs/32. El avance se calcula con evidencias, nunca con documentos o commits.

## 1. Principios de ejecución

- Un solo producto SaaS + EcuApp, un solo codebase modular, tenants y datos aislados.
- Construir vertical slices utilizables; no entregar infraestructura sin journey de usuario ni pantalla sin contrato/API.
- Primero plataforma, seguridad, tenancy, auditoría, eventos, observabilidad y CI.
- El alcance Meta es completo como objetivo, pero cada capacidad depende de permisos, app tier, asset grants, país, cuenta, política y versión vigente.
- La versión más reciente de Meta no se fija globalmente; cada adapter declara versión compatible y sunset.
- CRM e Inbox son dominios de primera clase; Automation e AI Assistance son capabilities gobernadas.
- Modular monolith desde inicio; extraer procesos según carga y ownership demostrados.
- Agencias acceden mediante grants explícitos; nunca existe herencia de datos por relación comercial.
- Las acciones externas de riesgo permanecen bloqueadas hasta aprobación/guardrails.
- Paralelismo requiere contrato estable, owner único, paths exclusivos y reviewer independiente.

## 2. Fases y gates de salida

### Fase 0 — Descubrimiento, decisiones y arquitectura
**Entregables:** decisión de negocio y segmentos; pricing model sin tarifas; localización; tenant/agency model; requisitos LOPDP y data inventory; historias/AC por módulo; ADR-011..020; architecture spike; threat model; data classification; catálogo API actual; coste/capacidad/SLO/RPO/RTO con evidencia; modelo de datos y contratos iniciales; validación de ICP con REEM oficial, entrevistas y pilotos (TASK-066).

**Gate G0:** arquitectura aprobada por el spike, requisitos bloqueantes identificados, riesgos legales y coste explicitados, pruebas de aislamiento diseñadas y plan de capacidad medible.

**Estado real de esta iteración:** baseline de decisiones y documentos actualizada; spike, threat model formal, load tests, legal review y acceso real Meta siguen pendientes.

### Fase 1 — Fundaciones y developer experience
Monorepo Nx/pnpm; NestJS API modular; Angular shell; PostgreSQL; migraciones; tenant context y RLS; OIDC/Keycloak + MFA; RBAC/ABAC; agency grants; audit; token vault interfaces; Redis; RabbitMQ; transactional outbox/inbox; object storage; OpenTelemetry; CI, lint, typecheck, build, unit/contract/security scans, SBOM, backup/restore.

**Gate G1:** bootstrap reproducible desde cero; tenant-isolation suite pasa; restore test pasa; no secretos; pipelines verdes; métricas y alertas básicas.

### Fase 2 — Meta Control Plane y onboarding
Meta App por entorno; Business Login/OAuth; Embedded Signup v4 cuando la app/cuenta sea elegible; PKCE/state; token vault; rotación/revocación; Asset Registry; Capability Registry; asset grants, app access tier y eligibility; webhook gateway; onboarding y reconciliation; pruebas con cuentas autorizadas.

**Gate G2:** la conexión muestra exactamente qué operación está permitida y por qué; reconexión/revocación funcionan; no se exponen capabilities sin evidencia.

### Fase 3 — WhatsApp, Inbox y CRM esencial
Cloud API para service/utility/auth donde corresponda; Business Management; templates; media; interactive; Flows; Calling únicamente si elegible; Marketing Messages API para marketing; cost ledger; Inbox; conversaciones y estados; equipos/asignación/handoff; identidades provider-scoped (BSUID); soportar WAAC/PMA y migración de recursos legacy; consentimiento y opt-out.

**Gate G3:** conectar → webhook durable → conversación → respuesta autorizada → receipt/reconciliation; demostrar no duplicación de efectos, aislamiento y coste versionado.

**Regla de migración:** no implementar una nueva dependencia de marketing por el endpoint antiguo de Cloud API. Meta anunció sunset de marketing sobre Cloud API para 2027-10-13; construir desde el inicio con el adapter de Marketing Messages API y probar categorías reclasificadas. Ver docs/32.

### Fase 4 — CRM, automatización y asistencia IA
Contactos, empresas, fields, tags, lead provenance, dedupe/merge reversible, pipeline, oportunidades, actividades/tareas; workflow builder y runtime; simulation/versioning; scheduler; retries/DLQ; chatbot de reglas; AI suggestions; AI Gateway; límites por tenant/modelo/uso; evaluaciones y feedback; human handoff.

**Gate G4:** cada workflow versionado, limitado, auditable, simulable, pausado y recuperable; IA no envía ni ejecuta acciones sensibles por sí sola.

### Fase 5 — Facebook Pages y Messenger
Pages, permisos/tasks, publicación, comentarios/moderación, Messenger conversations/send/media, webhooks, ventanas y policies independientes.

**Gate G5:** journeys por tipo de cuenta, scopes y capabilities reales; no asumir paridad entre canales.

### Fase 6 — Instagram y Threads
Instagram Login y Facebook Login según capacidad; publishing, media, comments, messaging e insights autorizados; Threads adapter independiente; webhooks y account eligibility.

**Gate G6:** cada operación cubierta por matrix account type/login/scopes/capabilities y pruebas de contrato.

### Fase 7 — Leads, Marketing API y CAPI
Lead Ads, forms, retrieval y lineage; campaign/adset/ad/creative lifecycle; drafts, validation, dry-run, approval, budget caps, kill switch y reconciliation; insights; CAPI, event_id, dedupe, consent, diagnostics y atribución; marketing API access tier y cuotas.

**Gate G7:** ninguna activación gasta sin autorización; test con cuenta elegible; spend y conversions conciliados; versiones Meta vigentes.

### Fase 8 — Hardening, operación y producción
ASVS verification; pentest; performance/load/soak/chaos; HA y failover; backup/restore; DR; RPO/RTO demostrado; alertas/runbooks/on-call; privacy/legal review; LOPDP/transferencias/subencargados; Meta App Review/Business Verification/Tech Provider aplicables; soporte y facturación; release candidate.

**Gate G8:** cero S0/S1 abiertos sin aceptación formal de riesgo; seguridad/privacy/QA/SRE gates; evidencias de Meta; SLO real medido; owner aprueba commit/tag específico. Solo el propietario acepta producto.

## 3. Paralelismo aprobado

Después de G1 y contratos estables:
- Meta adapters separados por producto pueden avanzar en paralelo, con owner único del schema de capability/event.
- CRM e Inbox trabajan en paralelo si el modelo de identidad/conversación lo controla un contract owner.
- Automation y AI Assistance pueden avanzar cuando policy engine, event envelope y usage ledger estén estables.
- Leads/Ads/CAPI requieren consentimiento, asset registry, rate limits y approval guardrails.
- QA, Security, Privacy, SRE y documentación operan desde G0; no se agregan al final.
- Si no hay agentes independientes disponibles, ejecutar análisis secuencial por rol y declarar auto-revisión; nunca simular independencia.

## 4. Dependencias externas y fechas de riesgo

| Tema | Evidencia / riesgo | Acción del proyecto |
|---|---|---|
| Graph/Marketing API v27 | Meta anunció v27.0 en noviembre de 2026 | Confirmar changelog completo y versión vigente al implementar |
| WhatsApp marketing sobre Cloud API | Sunset publicado para 2027-10-13 | Usar Marketing Messages API desde el comienzo; mantener tarea de migración/compatibilidad |
| Embedded Signup v4 | Material Meta describe onboarding unificado | Validar elegibilidad y flujo en app Business real |
| BSUID / Usernames | Nuevos IDs no basados en teléfono | Identity model provider-scoped; fixtures y parser versionado |
| WAAC / PMA | Modelo de recursos/cuentas evoluciona | Asset graph flexible y migración legacy |
| Marketing API Access Tier | Full/limited access cambia quotas | Mostrar tier separado de scopes; verificar UI de Meta |
| LOPDP y normativa SPDP | Normativa secundaria evoluciona | Revisión antes de live data y antes de producción |

## 5. Objetivos operativos iniciales (no SLA)

- API core: candidato 99.9% mensual, condicionado a topología HA y coste.
- Webhook: ACK solo tras persistencia durable; medir success ratio y p95/p99.
- RPO candidato <= 15 minutos; RTO candidato <= 4 horas para tier base, sujeto a restore drills.
- Latencias API, throughput, concurrencia y queue-age: definir tras architecture spike y pruebas de carga; no inventar límites.
- Reportar disponibilidad end-to-end y dependencia Meta por separado.
- 99.9% corresponde aproximadamente a 43.2 min de indisponibilidad por mes; no publicar como SLA sin acuerdo y capacidad demostrada.

## 6. Condiciones de bloqueo sin detener trabajo

- Cuenta Meta/App Review: adapters, contracts y sandbox pueden avanzar; producción de operaciones autorizadas espera aprobación.
- Plazos legales de retención: modelo/config y privacy workflows avanzan; live data y plazos públicos esperan asesoría.
- Presupuesto VPS: spike local y pruebas sintéticas avanzan; compra/capacidad productiva espera aprobación.
- Planes y precios: usage ledger y entitlements avanzan; tarifa comercial y facturación final esperan unit economics.
- Proveedor IA: AI Gateway y rule chatbot avanzan; proveedor/modelo externo espera evaluación de datos, región, contrato y coste.
- Integraciones específicas: API y webhook platform avanzan; conectores se priorizan con demanda real.

## 7. Métricas de avance

Cada reporte incluye el denominador y evidencia: REQ mapeados/total; AC verificados/total; TASK implementados/verificados/total; tests passed/executed; S0-S3 abiertos; vulnerabilidades; metas SLO medidas; capabilities Meta documentadas/verificadas; gates pasados/total. Documentar no incrementa porcentaje de implementación.


## Campaign Intelligence added to delivery roadmap (2026-11-06)
- Ads integration in Phase 7 now has two layers: (A) safe campaign control/reporting and (B) Campaign Intelligence / Creative Lab after CRM + CAPI signal quality, consent, event provenance and approval guardrails are stable.
- Phase 7A: Ads structures, Insights, Leads, CAPI, budgets and reconciliation.
- Phase 7B: snapshots, KPI registry, Creative Lab, experiments, fatigue/recommendations, guarded budget optimization, Meta MCP drafts and business agent interoperability.
- Phase 8 hardening must test PD-024, API-version drift, Meta policy changes, AI creative rights/claims, conversation ownership and budget anomalies.
- Campaign Intelligence does not control Andromeda/GEM; it provides eligible diversified creatives, valid conversion signals and learns from attributed and business outcomes.
- No auto-scaling live campaigns until benchmarked experiments, sample rules, account caps, approval and rollback have passed. TASK-067..080 proposed.
