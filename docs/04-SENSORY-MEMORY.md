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
