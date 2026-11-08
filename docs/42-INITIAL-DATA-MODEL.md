# 42 — Modelo lógico inicial de datos y persistencia

**Relacionado:** TASK-001..005, TASK-027..030, TASK-034..036, TASK-042..053.  
**Estado:** modelo lógico inicial; el DDL definitivo y sus migraciones deben producirse después del TASK-039 y pasar review.

## 1. Principios de persistencia

1. PostgreSQL es la fuente transaccional de verdad. Redis no es ledger ni almacén primario.
2. Cada agregado de cliente tiene tenant_id NOT NULL; las entidades globales de plataforma se identifican explícitamente y no se mezclan con tablas tenant-scoped.
3. PK interna UUID. IDs externos Meta/proveedor son strings namespaced; nunca reemplazan PK interna.
4. Tiempo en timestamptz UTC. Importes con numeric/decimal y currency ISO-4217; nunca float.
5. Integridad con FK, unique constraints e índices compuestos que incluyan tenant cuando corresponda.
6. RLS como defensa adicional con rol de aplicación no superuser ni BYPASSRLS; no sustituye autorización backend.
7. Cambios de esquema mediante migraciones versionadas, ordenadas y reproducibles.
8. Datos nativos de proveedor se minimizan, redactan y almacenan por referencia segura cuando su tamaño/sensibilidad/retención lo justifiquen.
9. Secretos y tokens no se guardan en texto plano; se almacena referencia de vault/KMS + metadata no secreta.
10. Cada contexto es dueño de sus tablas. Otro contexto consume contratos/eventos, no consulta tablas privadas ni hace joins entre bounded contexts.

## 2. Mapa entidad-relación conceptual

- User 1:N Membership N:1 Tenant.
- Organization 1:N Tenant.
- PartnerOrganization 1:N PartnerTenantGrant N:1 Tenant.
- Tenant 1:N MetaConnection 1:N Asset 1:N CapabilitySnapshot.
- Tenant 1:N Contact 1:N ContactIdentity.
- Tenant 1:N Lead; Contact 1:N Opportunity.
- Tenant 1:N Conversation 1:N Message.
- Tenant 1:N Workflow 1:N WorkflowVersion 1:N WorkflowExecution.
- Tenant 1:N AuditEvent.

Este mapa es lógico, no DDL. Relaciones reales deben respetar ownership y no crear FK cross-tenant sin constraint/validation que pruebe igualdad de tenant.

## 3. Plataforma e identidad

| Tabla/agregado | Campos esenciales |
|---|---|
| platform.users | id, oidc_issuer, oidc_subject, status, created_at, updated_at |
| platform.organizations | id, type, name, status |
| platform.tenants | id, organization_id, slug, display_name, status, locale, timezone, currency, authz_version |
| platform.memberships | id, tenant_id, user_id, status, created_at, revoked_at |
| platform.roles | id, tenant_id nullable para system roles, key, version |
| platform.permissions | key, description, risk_class |
| platform.role_permissions | role_id, permission_key |
| platform.membership_roles | membership_id, role_id |
| platform.partner_tenant_grants | id, partner_org_id, tenant_id, actor selector, scope JSON validado, purpose, expiry, revocation |
| platform.entitlements | id, tenant_id, feature_key, limits, state, period |
| platform.approvals | id, tenant_id, action_type, subject_ref, requester, approver, expires_at, state |

El campo scope JSON almacena solo un descriptor tipado validado por schema y políticas; no un documento libre que conceda cualquier acción.

## 4. Meta Control Plane

| Tabla/agregado | Campos esenciales |
|---|---|
| meta.meta_apps | id, environment, app_id_ref, config_version, status |
| meta.connections | id, tenant_id, meta_app_id, provider, auth_mode, status, connected_by |
| meta.credentials | id, connection_id, vault_secret_ref, token_type, scopes, issued_at, expires_at, data_access_expires_at, revoked_at |
| meta.assets | id, tenant_id, connection_id, provider, product, asset_type, external_id, parent relations |
| meta.asset_relations | tenant_id, parent_asset_id, child_asset_id, relation_type, observed_at |
| meta.asset_grants | tenant_id, asset_id, permission/task, grant_state, source, checked_at |
| meta.capability_snapshots | tenant_id, asset_id, operation_key, api_version, decision, reasons, evidence_ref, valid_until |
| meta.webhook_subscriptions | tenant_id, asset_id, product, fields, status, verified_at |

No modelar jerarquía WhatsApp como WABA único obligatorio: guardar tipos de recurso y relaciones para WAAC/PMA y estructuras legacy.

## 5. CRM e Inbox

CRM: crm.contacts, crm.contact_identities, crm.contact_attribute_definitions, crm.contact_attribute_values, crm.companies, crm.leads, crm.lead_assignments, crm.pipelines, crm.pipeline_stages, crm.opportunities, crm.activities, crm.tags, crm.tag_links, crm.consent_records, crm.suppression_entries.

Inbox: inbox.conversations, inbox.conversation_participants, inbox.messages, inbox.delivery_attempts, inbox.delivery_receipts, inbox.assignments, inbox.ownership_leases, inbox.internal_notes, inbox.handoffs, inbox.read_cursors.

Las entidades tenant-scoped incluyen tenant_id y restricciones compuestas. Identidad externa: unique (tenant_id, provider, product, channel, identifier_type, external_id). Idempotency key local: unique por tenant + operation scope.

## 6. Event platform y auditoría

- platform.outbox_events: id, tenant_id nullable solo para evento global, aggregate_type/id/version, event_type, schema_version, payload_ref, occurred_at, published_at, attempts.
- platform.inbox_events: provider, external_event_id, tenant/account resolution, received_at, authenticity result, payload_ref, dedupe key, processing state.
- platform.consumer_deduplication: consumer_name, event_id, processed_at, result ref.
- audit.audit_events: append-only, tenant, actor, action, resource, purpose, timestamp, outcome, correlation, approval ref, before/after refs, source and integrity metadata.
- ops.dead_letters: event/execution reference, reason code, retry metadata, tenant, created_at, disposition.

Outbox write se realiza en la misma transacción que el cambio del agregado. Los consumers son at-least-once e idempotentes. Retención y payload nativo se rigen por clasificación/política aprobada.

## 7. Integridad multi-tenant

- Toda FK entre entidades tenant-scoped incluye tenant en la relación lógica (FK compuesta cuando el diseño lo permita) para prevenir referencias cruzadas.
- RLS policies filtran por tenant context transaccional.
- El rol app carece de bypass; roles de migración/administración están separados y auditados.
- Prueba explícita para pool reuse: ejecutar tenant A, liberar conexión, ejecutar tenant B y demostrar que contexto A no permanece.
- Unique constraints por tenant; no unique global de email/teléfono que provoque colisiones entre clientes.
- Storage keys, cache keys, queue routing, search document IDs y correlation metadata llevan tenant validado/pseudonymous.
- RLS no es la única barrera: toda consulta/command verifica actor, membership, grant, ownership y purpose.

## 8. Índices y consultas

Punto inicial, sujeto a EXPLAIN y medición: (tenant_id, created_at DESC, id) para timelines; (tenant_id, status, updated_at) para colas; índice compuesto namespaced para identities; unique idempotency por tenant + operación; índices parciales para leases/jobs cuando los planes de ejecución lo justifiquen. No añadir índices indiscriminadamente.

## 9. Migraciones y seeds

- Cada bounded context mantiene migraciones de su schema.
- Migración forward-only preferida; cambios no triviales siguen expand → migrate → contract.
- Rollback de DDL se prueba en entorno efímero; rollback de datos requiere estrategia específica y backup.
- Seed de permisos, roles base y capabilities internas idempotente y versionado.
- Ningún seed contiene secretos, tenant real, token, número de cliente ni datos personales.
- CI crea DB vacía y ejecuta todas las migraciones desde cero; otro job prueba upgrade desde versión previa cuando existan releases.

## 10. Antes de DDL de producción

TASK-039 debe validar RLS/pooling; TASK-040 debe mapear requisitos; security review valida trust boundaries. Nombres finales de tablas pueden ajustarse mediante ADR técnico manteniendo invariantes y contratos. No inventar retención exacta, shard thresholds ni capacidad.

## 11. DDL materializado — CRM Contacts (2026-11-08)

El modelo lógico de la sección 5 ya tiene un primer agregado persistente real: migración microservices-meta-ecuapp/migrations/0022-crm-contacts.sql crea crm.contacts y crm.contact_command_idempotency. Incluye FK a platform.tenants/users, UNIQUE(tenant_id,id), índices de tenant + fecha, RLS ENABLE/FORCE para tenant context, tabla de idempotencia por tenant/actor/operación/clave, snapshot de respuesta inmutable y triggers que validan actor/tenant, provenance/contactType inmutables y versionado optimista. El rol whatsbusiness_app no obtiene DELETE, y UPDATE está limitado a columnas de contacto modificables y snapshot de idempotencia.

El agregado Contact no incorpora todavía ContactIdentity, leads, companies, pipeline, opportunities, activities ni custom fields. El endpoint runtime está deshabilitado por el contract allowlist vigente; ver docs/66. No inferir que el modelo CRM completo está implementado.