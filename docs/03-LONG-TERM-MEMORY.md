# 03 — Memoria a largo plazo

> Conocimiento estable que debe sobrevivir a sesiones, cambios de personal y evolución de APIs.

## Principios durables
- La API externa es una frontera de dominio, no el modelo interno.
- El sistema debe preservar diferencias de canal, producto, versión, permiso y cuenta.
- Multi-tenancy se aplica desde el diseño de cada tabla, evento, cache key, secreto y métrica.
- Seguridad, privacidad, auditabilidad y observabilidad son características del producto, no tareas finales.
- La operación debe ser eventualmente consistente y explícita sobre estados desconocidos.
- Cada integración necesita contrato versionado, adapter, capability registry y suite de contract tests.

## Conocimiento técnico que debe conservarse
### Identidad y autorización
Separar usuario humano, tenant, Meta App, conexión OAuth, token, asset y grant. Una conexión puede autorizar varios activos; un activo puede requerir tasks/scopes distintos. Registrar origen, fecha, scopes concedidos, expiración, data access expiration y estado de revocación.

### Mensajería
Separar comando de envío, aceptación del proveedor, delivery receipt, lectura, fallo, supresión y resultado de política. Las plantillas son recursos remotos sujetos a revisión/calidad/categoría. Flows tienen ciclo de vida/versionado. Ventanas por canal y políticas por categoría son relojes distintos.

### Marketing y Leads
Mantener lineage desde campaign/ad/adset/form/referral hasta lead, contacto, oportunidad, conversión y revenue. Distinguir métricas reportadas por Meta, atribución interna y resultados conciliados.

### Resiliencia
Webhooks al inbox durable primero; procesamiento posterior. Deduplicar por identificador de evento o fingerprint con TTL/retención definida. DLQ con replay auditado. Outbox para publicar eventos internos. Reintentos con jitter y reconciliación para escrituras ambiguas.

### Evolución
Versionar adapters por API; capability negotiation en runtime; changelog mensual; deprecations con fechas y migración. No actualizar producción sin contract tests y rollout controlado.

## Historial de decisiones
- 2026-11-06: sistema documental inicial y ramas de entorno creadas.
- Las nuevas decisiones se registran en ADR y se enlazan desde memoria central.

## Lecciones aprendidas
Registrar solo después de incidentes, pruebas o validaciones repetibles. Cada lección debe incluir contexto, impacto, causa, mitigación y regla preventiva.
