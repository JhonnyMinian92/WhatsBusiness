# 04 — Memoria sensorial (observaciones y evidencias)

> Bandeja de entrada para señales externas: documentación Meta, changelogs, respuestas API, webhooks, pruebas, tickets, incidentes y feedback. No es fuente de verdad hasta validar.

## Esquema obligatorio de observación
- ID: `OBS-YYYYMMDD-NNN`
- Capturado UTC:
- Fuente/URL o sistema:
- Producto/versión:
- Evidencia (extracto mínimo o hash/artefacto, sin PII/secreto):
- Observación:
- Clasificación: documentación | respuesta API | webhook | incidente | soporte | marketing | legal | feedback.
- Confianza: baja | media | alta.
- Vigencia/fecha efectiva:
- Impacto potencial:
- Estado: nuevo | en validación | confirmado | descartado | promovido.
- Responsable:
- Decisión/ADR relacionado:

## Observaciones iniciales
### OBS-20261106-001
- Fuente: `META_SERVICES.md`, investigación del repositorio.
- Tipo: investigación documental secundaria/primaria referenciada.
- Observación: el ecosistema tiene APIs, permisos y modelos de recursos diferentes; se requiere separación por adaptadores.
- Confianza: alta como decisión de diseño; detalles por endpoint deben revalidarse.
- Estado: confirmado como principio arquitectónico.
- Acción: ADR-003/004/005.

### OBS-20261106-002
- Fuente: `META_SERVICES.md`, sección WhatsApp Marketing Messages.
- Observación: existen anuncios de evolución/deprecación de rutas de marketing; el backend debe aislar el sender y vigilar fechas.
- Confianza: pendiente de verificación contra anuncio oficial vigente.
- Estado: en validación.
- Acción: no convertir fecha de retirada en constante sin revisar fuente oficial.

## Reglas de promoción
- No promover capturas sin fecha ni versión.
- No almacenar tokens, phone numbers completos, lead PII ni payloads sensibles en este documento.
- Para evidencia de producción usar identificadores pseudonimizados y referencia segura al artefacto.
- Contradicciones se resuelven consultando fuente oficial más reciente; registrar quién resolvió.
- Una observación confirmada que cambie requisitos crea CR y actualiza memoria central, catálogo, backlog y tests.


## Observaciones investigadas y promovidas a diseño (2026-11-06)
Los hallazgos con fuente, vigencia, confianza, efecto y límites están detallados en docs/32-RESEARCH-AND-EVIDENCE-REGISTER.md. Resumen:
- OBS-20261106-003: Meta Graph API/Marketing API v27.0 announcement; versions must be per adapter.
- OBS-20261106-004: Meta Marketing API Access Tier differs from OAuth ads_management scope.
- OBS-20261106-005: Embedded Signup v4 unified onboarding direction; validate app eligibility.
- OBS-20261106-006: BSUID and WhatsApp usernames; provider-scoped identity, phone is not universal.
- OBS-20261106-007: WAAC/PMA account model evolution; asset graph must retain legacy WABA support.
- OBS-20261106-008: WhatsApp Cloud API marketing sunset announced for 2027-10-13; use Marketing Messages API for new marketing path.
- OBS-20261106-009: Max Pricing creates distinction between max, estimate, provider-reported actual and reconciled charges.
- OBS-20261106-010: Ecuador LOPDP/RGLOPDP/SPDP framework; legal implementation specifics need qualified review.
- OBS-20261106-011: OWASP ASVS 5.0.0 as security requirements catalog.
- OBS-20261106-012: Google SRE recommends user-focused SLI/SLO and percentile latency measures; 99.9% availability maps to ~43.2 min/month, not evidence of this service's uptime.

No observation implies access granted to our Meta App/account or successful product integration. External API facts are revalidated at implementation and release.


### OBS-20261106-013 — INEC REEM 2025 y validación del ICP
- Fuente: INEC, Principales Resultados REEM 2025 (abril 2026), URL incluida en docs/32.
- Observación: base provisional 2025 reporta 1.204.276 empresas; sector servicios 645,8k y comercio 388,9k; metodología combina periodos y registros diferentes.
- Advertencia: 50,2% pertenece al grupo RIMPE 2024 sin ventas ni plazas IESS en la clasificación; el salto 2022 refleja también el régimen obligatorio y no creación neta de empresas.
- Confianza: alta para cifras oficiales; provisionalidad y cobertura limitan inferencias.
- Impacto: respalda foco sectorial de discovery; no prueba Meta usage, buyer eligibility, TAM ni willingness-to-pay.
- Estado: confirmado como contexto, no como estimación comercial.
- Acción: TASK-066 / US-028 discovery and pilots.
