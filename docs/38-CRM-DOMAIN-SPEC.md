# 38 — Especificación funcional: CRM, contactos y ciclo comercial

**Relacionado:** TASK-035, TASK-042..044, TASK-053, US-018, US-019, PD-004, PD-016.  
**Estado:** baseline funcional inicial; requiere revisión cruzada antes de marcarse verified.

## 1. Objetivo

El CRM permite organizar contactos, identidades de canal, empresas, leads, oportunidades, actividades y resultados comerciales para cada tenant. Es un dominio independiente de los adapters Meta. Un lead o contacto puede originarse en WhatsApp, Messenger, Instagram, Lead Ads, formularios externos o carga autorizada.

## 2. Modelo conceptual

- **Contact:** perfil comercial tenant-scoped; representa persona o entidad comercial.
- **ContactIdentity:** identificador externo namespaced por proveedor, producto y canal.
- **ContactAttributeDefinition / ContactAttributeValue:** campos configurables y tipados.
- **Company:** empresa relacionada con contactos y oportunidades.
- **Lead:** registro de interés con source/provenance y lifecycle.
- **LeadAssignment:** propietario o equipo responsable, con historial.
- **Pipeline / PipelineStage:** proceso comercial configurable por tenant.
- **Opportunity:** posible venta vinculada a contacto/empresa y pipeline.
- **Activity:** llamada, reunión, tarea, nota u otra interacción.
- **Tag:** clasificación tenant-scoped.
- **ConsentRecord / SuppressionEntry:** permisos, finalidades y exclusiones por canal, sujetos a Policy & Consent.

Contact y Lead son agregados distintos. Convertir un Lead en Contact/Opportunity conserva la procedencia e historial y evita duplicar o perder el registro original.

## 3. Identidad y deduplicación

Identidad externa: `(tenant_id, provider, product, channel, identifier_type, external_id)`. Ejemplos: Meta/WhatsApp/BSUID, WhatsApp phone identity, Messenger PSID, Instagram-scoped ID y IDs de integraciones externas.

- Teléfono E.164, email y nombre son atributos/identificadores secundarios, no PK universal.
- No fusionar identidades de canales diferentes solo porque compartan teléfono, email o nombre.
- Guardar source, observedAt, verifiedAt, confidence, visibility/consent constraints y actor.
- Coincidencias generan candidatos de deduplicación, no fusiones automáticas.
- Merge requiere una decisión auditable, registra registros origen, superviviente, campos resueltos y motivo; debe existir operación reversible mientras no haya conflicto legal/retención que lo impida.
- Una identidad externa no puede pertenecer a dos contactos activos del mismo tenant sin una excepción de colisión registrada.

## 4. Campos personalizados

Cada definición especifica key estable, label traducible, tipo (`text`, `long_text`, `number`, `decimal`, `boolean`, `date`, `datetime`, `single_select`, `multi_select`, `url`), required, searchable, validation, visibility, source y versión.

No permitir expresiones ejecutables ni SQL en definiciones de campos. Los cambios de tipo requieren migración/transformación explícita; los valores deben poder validarse en backend.

## 5. Lead lifecycle

Estados iniciales: `new`, `qualified`, `disqualified`, `converted`, `archived`. La configuración por tenant puede ampliar transiciones sin eliminar los estados semánticos base.

Cada Lead conserva:
- fuente/canal/campaña/form/form submission y provider IDs disponibles;
- receivedAt, capturedAt, source timestamps y attribution window;
- consent/purpose reference (cuando aplica);
- payload original protegido o referencia a su almacenamiento;
- campos normalizados y provenance por dato;
- historial de estado, asignación, notas y motivo de descarte.

Nunca sobrescribir la evidencia original al enriquecer un lead. La atribución de plataforma y el outcome comercial interno se almacenan por separado.

## 6. Pipeline y oportunidades

Pipeline es tenant-scoped y versionado. Cada Stage tiene key estable, nombre, orden, estado final (won/lost/open) y reglas de entrada/salida. Las transiciones guardan actor, fecha, origen y razón. Las transiciones no autorizadas se rechazan en el backend.

Opportunity relaciona contacto y opcionalmente Company, conserva moneda ISO-4217, amount decimal (no float), expectedCloseDate, owner/team, stage, source y audit trail. No definir forecast financiero como revenue real. Won/Lost requiere fecha y motivo; el valor puede cambiar y mantiene historial.

## 7. Activities y timeline

Tipos mínimos: `task`, `note`, `meeting`, `call`, `email_reference`, `message_reference`, `stage_change`, `assignment_change`, `system_event`. El timeline es append-oriented; editar/eliminar una nota no debe reescribir eventos históricos de auditoría. Mensajes externos se referencian por conversation/message ID, no duplican contenido sensible sin necesidad.

## 8. API interna propuesta

- `GET/POST /v1/tenants/{tenantId}/contacts`
- `GET/PATCH /v1/tenants/{tenantId}/contacts/{contactId}`
- `GET /v1/tenants/{tenantId}/contacts/{contactId}/identities`
- `POST /v1/tenants/{tenantId}/contacts/{contactId}/merge-candidates/{candidateId}/decision`
- `GET/POST /v1/tenants/{tenantId}/leads`
- `POST /v1/tenants/{tenantId}/leads/{leadId}/assignments`
- `POST /v1/tenants/{tenantId}/leads/{leadId}/transitions`
- `GET/POST /v1/tenants/{tenantId}/pipelines`
- `GET/POST /v1/tenants/{tenantId}/opportunities`
- `POST /v1/tenants/{tenantId}/opportunities/{opportunityId}/transitions`
- `GET/POST /v1/tenants/{tenantId}/activities`

Todos los recursos verifican tenant, permiso y ownership. Export y bulk operations requieren permiso y límites específicos.

## 9. Eventos de dominio

`crm.contact.created`, `crm.contact.updated`, `crm.identity.linked`, `crm.identity.merge_requested`, `crm.identity.merged`, `crm.identity.merge_reversed`, `crm.lead.created`, `crm.lead.qualified`, `crm.lead.disqualified`, `crm.lead.converted`, `crm.lead.assigned`, `crm.opportunity.stage_changed`, `crm.opportunity.won`, `crm.opportunity.lost`, `crm.activity.created`.

Eventos contienen IDs y metadatos mínimos; no transportar PII completa en routing headers ni logs.

## 10. Criterios de aceptación

- Un contacto y sus identidades no pueden leerse ni modificarse desde otro tenant.
- BSUID, PSID, Instagram-scoped IDs y números de teléfono se almacenan con namespace y tipo explícitos.
- Un merge requiere evidencia, autorización, actor, motivo y registro reversible; una colisión no provoca merge automático.
- Lead Ads repetidos o webhooks duplicados no crean duplicados: dedupe por provider event/submission ID con idempotencia.
- Cada lead conserva procedencia y snapshots; cambios posteriores no alteran la captura original.
- Pipeline configurable permite transiciones autorizadas y registra historial inmutable.
- Oportunidades utilizan decimal + currency, no float; won/lost requiere reason.
- Consent y suppression se consultan en el momento de una acción de mensajería/campaña; el CRM no los sustituye.

## 11. Pruebas

Unit: normalización de identificadores, dedupe scoring, transición de lead/opportunity, custom field validation.  
Integration: índices únicos tenant/provider/identity, merge transaction/rollback, event outbox.  
E2E: lead desde webhook → contacto → asignación → oportunidad → venta, con trazabilidad y aislamiento.  
Security: cross-tenant, export authorization, identity collision y consent revoked.

## 12. Límites y dependencias

Los campos de CRM, pipeline y etapas son configurables por tenant. No se presume un sector ni un proceso comercial universal. Los conectores ERP/ecommerce y las reglas fiscales requieren decisión posterior por demanda real. El modelo de identity debe respetar TASK-053 y el asset model WAAC/PMA/WABA.

## 13. CRM Intelligence — predicción y clasificación

El CRM puede consumir modelos estadísticos/ML para lead scoring, probabilidad de conversión, churn, propensión, forecasting, segmentación, LTV, ranking de siguiente acción, asignación asistida y deduplicación asistida. Los scores son señales versionadas con fecha, horizonte, modelo/versión, features y reason codes; no sustituyen el estado comercial fuente de verdad.

- CRM es dueño de labels y outcomes comerciales, no de internals Meta ni de Inbox.
- Las features se construyen desde contratos/eventos públicos y snapshots temporales, preservando provenance y evitando data leakage.
- No se fusionan contactos automáticamente por score; se mantiene el flujo auditable y reversible de la sección 3.
- No se introduce LLM, RAG, generación de texto ni agente autónomo dentro de CRM.
- Las predicciones no alteran permisos, consentimiento, supresión, asignaciones privilegiadas ni realizan escrituras Meta.
- Toda capacidad tiene fallback sin ML, métricas adecuadas al problema y monitoreo de drift/calibración.

Diseño, algoritmos, contratos de salida, aislamiento y pruebas: [docs/62](62-CRM-MACHINE-LEARNING-STRATEGY.md).
  
## 15. Invariante de organization reforzada en PostgreSQL (2026-11-08)

La migración `0023-crm-contact-organization-name-invariant.sql` aplica un `CHECK` para garantizar que `organization` no almacene `first_name` ni `last_name`. La regla ya existía en el parser del agregado; ahora también se cumple en la capa de persistencia, incluso si una ruta futura o una incidencia intenta insertar directamente usando la identidad runtime.

La integración usa el rol de API dentro de `withTenantContextAtVersion`, abre un savepoint y verifica SQLSTATE `23514` para el INSERT inválido, revirtiendo el savepoint sin abortar el resto de la transacción.

**Estado:** migración y prueba añadidas; pendiente Source CI con migración 0023 e integración PostgreSQL. TASK-042 sigue `in_progress`.


## 16. Fixture de auditoría respetando RLS (2026-11-08)

Source CI #558 y la siguiente repetición mostraron que el agregado, la idempotencia y el CHECK de la migración 0023 pasaban, pero la aserción de verificación de auditoría obtenía un stream incompleto. No era evidencia de corrupción del hash: la política `platform.audit_events_read` oculta los eventos a un miembro sin `audit.read`.

La integración ahora aprovisiona, solo en sus tenants sintéticos, un rol `compliance_auditor`, la arista tenant-scoped `role_permissions(audit.read)` y su asignación `membership_roles`. El snapshot `authz_version` se consulta después de estas escrituras, porque los triggers invalidan los contextos antiguos. Así, `verifyStream` se ejecuta con permiso de auditoría real en la base. No se debilita RLS ni se concede `audit.read` al rol runtime global.

**Estado:** fixture corregido; pendiente Source CI completo. TASK-042 continúa `in_progress`.


## Addendum de implementación — ContactIdentity (2026-11-08)

Se implementa un primer slice del grafo de identidad provider-scoped para CRM-005/006. Cada identidad pertenece a un contacto del mismo tenant y conserva provider, product, channel, identifierType y externalId como dimensiones distintas. WhatsApp admite BSUID y teléfono E.164; Messenger PSID; Instagram Direct ID scoped; Threads user ID; los sistemas externos usan una namespace external explícita.

La unicidad está limitada al tenant y a la tupla completa de namespace. Un teléfono no es PK de Contact ni une perfiles entre canales. Un conflicto de identidad produce 409 sin revelar a qué otro perfil pertenece el ID. Los vínculos creados por API registran provenance api; verifiedAt y confidence quedan NULL hasta que un proceso con evidencia los establezca. No hay merge automático, merge reversible, unlink ni dedupe probabilístico en este slice.
