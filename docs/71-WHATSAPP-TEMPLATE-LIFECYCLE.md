# 71 — Administración del ciclo de vida de plantillas WhatsApp (US-006)

Fecha: 2026-11-08
Rama: environment/local
Estado global: in_progress. Núcleo local implementado; verificación de CI pendiente; no aceptado ni listo para producción.

## 1. Historia y criterios de aceptación

US-006 — Administrar plantillas (docs/10).

| Criterio | Resultado actual | Límite real |
|---|---|---|
| AC-006-01: listar, leer, crear, editar y eliminar según permisos | Parcial: servicio interno tenant-scoped con list/get/createDraft/updateDraft/archiveDraft. | No hay controller HTTP público. WAM-001..005 siguen catalog-only. Archive es soft archive local, no DELETE remoto Meta. |
| AC-006-02: registrar categoría, idioma, componentes, calidad y estados Meta | Parcial: categorías, idiomas y componentes validados; status, quality score y reason tipados y persistibles. | No hay lectura de Meta, sincronización webhook ni escritura autorizada de estado/calidad. |
| AC-006-03: impedir envío de plantilla no aprobada o incompatible | No se añade envío desde este módulo; preview es local. | Falta integrar un gate compartido con el sender que exija APPROVED, compatibilidad, activo correcto y capability vigente. Este criterio está abierto. |
| AC-006-04: historial inmutable de revisiones y aprobación | Parcial: snapshots append-only por versión, actor y timestamp; idempotencia y concurrencia optimista. | Falta vincular revisiones al flujo de aprobación y a eventos Meta reales. |

## 2. Implementación incorporada

- Dominio: apps/api/src/whatsapp/templates/domain/message-template.ts. Valida nombre, locale, categoría, composición/orden de componentes, placeholders posicionales y nominados, botones Quick Reply/URL/Phone, URL HTTPS y límites; crea preview local sin enviar mensajes.
- Aplicación: MessageTemplateService reutiliza TenantAccessContext, DatabaseService.withTenantContextAtVersion y AppendOnlyAuditRepository; incluye permisos, hash SHA-256 de comandos, idempotencia, versiones y operaciones de borrador/archive.
- Infraestructura: PostgresMessageTemplateRepository usa queries parametrizadas y scope explícito tenantId para list/get/update/revisions.
- Módulo: WhatsAppTemplatesModule se registra en AppModule. Es un módulo de aplicación interno; no expone rutas HTTP.
- Migración: microservices-meta-ecuapp/migrations/0027-whatsapp-template-registry.sql crea whatsapp.message_templates, whatsapp.template_revisions y whatsapp.template_command_idempotency.
- Seguridad DB: RLS FORCE en las tres tablas; triggers validan actor/tenant, inicialización sin estado del proveedor, inmutabilidad de revisiones y finalización idempotente una sola vez. El rol ordinario de aplicación no actualiza ni borra el historial ni puede modificar estado/calidad del proveedor.
- Permisos: whatsapp.templates.read/create/update/delete se agregan a PermissionCatalog y platform.permissions. Declarar claves no concede acceso automáticamente; role assignment permanece fail-closed.

## 3. Controles de seguridad

1. Cada lectura/escritura usa contexto de usuario y tenant y vuelve a validar authzVersion.
2. RLS aísla plantillas, revisiones y claves idempotentes por tenant; las claves idempotentes también quedan vinculadas al actor.
3. Los triggers validan app.user_id, app.tenant_id, created_by, updated_by y actor_user_id de la revisión.
4. Las revisiones son append-only, no admiten UPDATE/DELETE.
5. Repetir la misma clave y el mismo hash retorna la respuesta anterior; reutilizar la clave para otro comando produce conflicto.
6. La edición requiere expectedVersion; una versión obsoleta no se aplica.
7. Archive conserva las revisiones; no elimina la plantilla de Meta.
8. Preview no llama al sender, no invoca Meta y no produce efectos externos.

## 4. Dependencias y operaciones no habilitadas

WAM-001..007 siguen catalog-only, sin contract freeze por operación y sin implementation allowance. Se respeta docs/49: no se crean controllers/rutas ni operaciones Meta remotas antes de completar las dependencias y gates.

Pendiente:
- TASK-008: conexión Meta y resolución de activos con credenciales almacenadas de forma segura.
- TASK-010: integrar el evaluador de capacidades en runtime con evidencia vigente por activo/operación (WABA, scopes, asset tasks, versión, app mode/review, elegibilidad y consentimiento cuando aplique).
- Freeze de request/response/error schemas y review independiente de WAM-001..007.
- Adapter oficial separado para create/edit/read/delete remoto, idempotencia provider-side, errores, timeout ambiguo y reconciliación.
- Consumer para sincronizar estado/calidad Meta y conservar provenance.
- Gate compartido en el sender para denegar pending, paused, rejected, deleted, desconocido o incompatible; solo permitir APPROVED con idioma/categoría/WABA/capability válidos.
- Enlace con aprobación independiente para operaciones que lo requieran.

## 5. Pruebas y CI

Se agregan al target api:test:
- message-template.spec.ts: validación de categorías/locales/componentes/placeholders/botones/URLs y preview.
- message-template.service.spec.ts: permiso previo a DB, create/replay, clave reutilizada con payload distinto, version conflict, historial y preview.
- postgres-message-template.integration.spec.ts: integración PostgreSQL diseñada para validar tenant A/B, RLS, idempotencia, concurrencia optimista, revisiones inmutables, archive y audit hash-chain.

Source CI activa RUN_WHATSAPP_TEMPLATE_INTEGRATION_TESTS=true. Al registrar esta nota todavía no existe resultado de un Source CI posterior al commit US-006; no se reporta build, typecheck, migración ni pruebas como SUCCESS hasta inspeccionar ese run. Los resultados previos de la rama no sustituyen esa evidencia.

## 6. Estado de tareas

| Tarea | Estado | Implementado | Pendiente para cierre |
|---|---|---|---|
| TASK-014 | in_progress | Servicio interno, schema, permisos, persistencia tenant-scoped, idempotencia, audit, versión optimista y archive lógico. | Contratos WAM-001..005, controller/gate, TASK-008, TASK-010 runtime, CRUD remoto, reconciliación y CI. |
| TASK-015 | in_progress | Revisiones append-only, metadata quality/status, extracción y validación de variables, validación de componentes y preview local. | WAM-006/007 freeze/controller, sincronización real, aprobación e integración del sender gate. |

## 7. Rollback y operación

La migración es aditiva. Cualquier rollback de datos requiere migración compensatoria revisada; no borrar tablas con historial/snapshots. Deshabilitar el módulo no elimina datos. No revertir manualmente el historial ni habilitar writes remotos sin contratos y capability evidence.

## 8. Referencias

docs/10-USER-STORIES.md; docs/11-TASK-BACKLOG.md; docs/18-EXECUTION-GRAPH.md; docs/20-PRODUCT-ACCEPTANCE.md; docs/47-API-INVENTORY-AND-TASK-MAP.md; docs/49-API-CONTRACT-READINESS-AND-META-ADAPTER-GATES.md; docs/53-TASK-WORK-PACKAGES.md.


## 9. Política pura de elegibilidad de envío

Se añade template-send-policy.ts y su suite. La política falla cerrada y devuelve reason codes: solo permite cuando la plantilla está activa, enlazada a un ID Meta, status APPROVED, coincide exactamente la categoría/idioma esperado y el consumidor aporta capabilityState=available. PENDING, PAUSED, REJECTED, status ausente, plantilla archivada o capability unknown/unavailable deniegan el resultado.

La policy es determinista y no invoca el sender ni consulta Meta. No sustituye la verificación runtime TASK-010: el consumidor debe aportar una decisión de capability verificada para el tenant/WABA/operación correctos. AC-006-03 continúa abierto hasta integrar esta policy con el sender y probar end-to-end.


## 10. Verificación Source CI y CodeQL — 2026-11-08

**Source CI: SUCCESS** Commit validado: 966edfffe668f495dfbc2ac07072fb93b616c7c9.

- Source workspace validation: run 42513964425, conclusión success.
- CodeQL security analysis: run 42513964419, conclusión success.
- Migrations: 0027 aplicada y verificación de replay idempotente correctas.
- Build: todas las aplicaciones success.
- Typecheck: todas las aplicaciones success.
- API test: 191 tests, 191 pass, 0 fail, 0 skipped. Incluye integración PostgreSQL de plantillas y template-send-policy.
- Meta backend test: 87 tests, 87 pass, 0 fail, 0 skipped.

La rama tenía ejecuciones anteriores fallidas durante la corrección; el resultado final arriba corresponde al commit 966edff y es el estado que debe usarse como evidencia. No prueba conexión real con Meta/WABA ni contract freeze de WAM-001..007.

## 11. Estado de aceptación

CI y CodeQL del núcleo local están verificados. TASK-014 y TASK-015 siguen in_progress, y US-006 no se declara accepted, porque todavía faltan contratos congelados y endpoints autorizados, conexión/capability Meta runtime, sincronización real de estados/calidad, integración de la policy en un sender real, flujo de aprobación y verificación con WABA. La política de envío ya está implementada como dominio puro y probada, pero no se ejecuta desde un sender en esta rama.
