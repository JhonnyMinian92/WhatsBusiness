# US-024 / TASK-052 — administración de tenants, planes, uso y soporte JIT

**Rama:** \`environment/local\`  
**Corte:** 2026-11-08  
**Estado:** \`in_progress\` — slice de código implementado; verificación CI del HEAD y aceptación independiente pendientes.  
**Propósito:** registrar el estado técnico real de US-024, sin confundir persistencia/casos de uso con contratos HTTP habilitados, medición operativa o aceptación de producto.

## 1. Alcance y criterios de aceptación

US-024 se descompone en TASK-052. Su paquete de trabajo depende de TASK-001 (tenant), TASK-004 (RBAC) y TASK-041 (capacidad/SLO), y cubre IAM-001..012, BILL-001..002 y PAR-007.

| Criterio | Implementado en este slice | Pendiente para verificar/cerrar |
|---|---|---|
| AC-024-01 — organización, provisioning, suspensión y reactivación auditados | Caso de uso transaccional; organización y tenant; membership activa del owner; rol \`tenant_owner\` materializado desde el catálogo canónico; asignación inicial de plan; eventos tenant.created / tenant.suspended en outbox; suspensión revoca grants JIT; reactivación con motivo y auditoría. | Migración y PostgreSQL integration CI verdes; freeze de IAM-001..006; rutas y DTOs cuando G0 lo autorice; revisor independiente; definición del cierre/tombstone según retención y obligaciones. |
| AC-024-02 — planes y entitlements gobernados | Catálogo de plan con versiones inmutables, entitlements estructurados y límites validados; publicar/retirar versión; historial de suscripciones; asignar versión a tenant y materializar entitlements existentes, incrementando \`authz_version\`. | Freeze de BILL; validar matriz comercial y límites con Product Owner; revisión independiente de autorización y compatibilidad de entitlements ya consumidos por módulos. |
| AC-024-03 — consumo separado por fuente | Ledger append-only para \`meta\`, \`infrastructure\` y \`ai\`; precisión decimal; coste/moneda emparejados; evidencia measured/provider_reported/estimated; idempotencia por tenant/categoría; resumen agrupado sin sumar categorías ni monedas incompatibles. | Conectar productores reales a los tres medidores; conciliación con facturas/proveedores; permisos y freeze de BILL-001..002; pruebas con muestras reales aprobadas. |
| AC-024-04 — soporte temporal auditado | Grant vinculado a tenant, operador, solicitante, aprobador, propósito, alcances, razón y ventana; operador distinto de solicitante/aprobador; aprobador \`platform_owner\`; evidencia OIDC step-up reciente; máximo técnico configurable (1..60 min); autorización de alcance/recurso auditada y revocación de una sola vía. | PAR-007 congelado; adaptar cada handler de lectura a la comprobación de scope antes de consultar el recurso. El grant no es una membresía ni abre acceso general a datos. Revisar evidencia OIDC real en la futura integración HTTP. |

## 2. Código incorporado

| Componente | Ubicación | Responsabilidad |
|---|---|---|
| Migración | \`apps/api/migrations/0030-platform-tenant-administration.sql\` | roles de plataforma, catálogo/versiones de plan, suscripciones, ledger, grants JIT, outbox, auditoría global, funciones SQL y RLS. |
| Políticas puras | \`apps/api/src/platform/administration/domain/platform-administration.policy.ts\` | transiciones del tenant, definición de plan, límites JSON, separation-of-duties, frescura step-up y validación de consumo. |
| Port de aplicación | \`apps/api/src/platform/administration/application/platform-administration.port.ts\` | comandos tipados y abstracción de persistencia. |
| Casos de uso | \`apps/api/src/platform/administration/application/platform-administration.service.ts\` | validación y orquestación sin consultas SQL ni dependencias HTTP. |
| Persistencia | \`apps/api/src/platform/administration/infrastructure/platform-administration.repository.ts\` | transacciones PostgreSQL, RLS context, idempotencia, entitlements y lifecycle audit. |
| Auditoría global | \`apps/api/src/platform/administration/infrastructure/platform-audit.repository.ts\` | hash-chain append-only para operaciones globales sin tenant; el stream tenant sigue reutilizando \`AppendOnlyAuditRepository\`. |
| Módulo NestJS | \`apps/api/src/platform/administration/platform-administration.module.ts\` | inyección por port y composición con Database/Identity. |
| Permisos y roles | \`apps/api/src/platform/identity/authorization/permission-catalog.ts\`; \`tenant-role-catalog.ts\` | \`billing.usage.read\` y rol interno \`usage_ingestor\`. |
| Pruebas | \`apps/api/src/platform/administration/domain/platform-administration.policy.spec.ts\`; \`infrastructure/platform-administration.integration.spec.ts\` | cuatro grupos unitarios y un flujo PostgreSQL sintético end-to-end. |

### Decisiones de seguridad

1. El código de soporte **no modifica** \`platform.can_use_tenant()\`, no introduce una excepción global a RLS y no crea membership temporal. \`authorizeSupportAccess\` solo confirma un grant vivo para tenant, propósito y scope exactos y registra la decisión. La lectura de un recurso debe invocar esta política dentro del handler específico; esa integración se mantiene bloqueada hasta PAR-007.
2. La aplicación no puede asignarse roles de plataforma. \`platform.platform_operators\` no recibe grants DML para \`whatsbusiness_app\`; el primer \`platform_owner\` se provisiona por el operador de migraciones, con aprobación del propietario y un usuario OIDC activo previamente identificado.
3. Los grants JIT requieren solicitante, aprobador y operador distintos; el aprobador debe tener \`platform_owner\`. Se conserva evidencia step-up (auth_time/ACR/AMR) y la ventana no puede superar 60 minutos. El límite de 60 min y frescura máxima step-up de cinco minutos son guardrails técnicos, no reglas comerciales.
4. El ledger no admite UPDATE/DELETE. Las correcciones se registran como nuevas entradas con otra clave de idempotencia. Los importes se guardan como decimales y moneda explícita; no se codifican precios, impuestos, márgenes ni tarifas.
5. La suspensión invalida grants activos. Reactivar un tenant no restaura grants, credenciales ni permisos temporales.
6. La auditoría global de operaciones de plataforma es distinta de la auditoría por tenant; ambas son append-only. Outbox queda persistido en la misma transacción del cambio de lifecycle; su dispatch/retry/consumer requiere TASK-028.

## 3. Verificación y estado

**Evidencia configurada:** los archivos unitarios y de integración se registran en el target \`api:test\`. Source Validation se configuró para ejecutar la suite PostgreSQL US-024 mediante \`RUN_PLATFORM_ADMINISTRATION_INTEGRATION_TESTS=true\`.

**Evidencia observada al corte:** el Source Validation del HEAD \`1ec667b6\` estaba \`in_progress\`; no se registra todavía un resultado SUCCESS ni CodeQL del mismo HEAD. No declarar tests PASS hasta leer los pasos del run y corregir cualquier fallo.

**No realizado:** no se desplegó la migración en un entorno de cliente; no se ejecutaron llamadas externas; no se contactó Meta ni se consultaron facturas reales; no se asignaron planes a tenants comerciales; no se habilitaron endpoints REST; no se hizo un restore/benchmark real.

## 4. Gates y trabajo restante

- **TASK-041:** sigue pendiente validación del propietario para SLO/RPO/RTO, workload, backups, capacidad y presupuesto VPS. Es dependencia declarada de TASK-052.
- **API contract freeze + G0:** IAM-001..012, BILL-001..002 y PAR-007 continúan catalog-only / no habilitados según docs/47 y docs/49. El módulo de aplicación está registrado, pero no tiene controllers públicos. No cambiar \`x-contract-ready\` ni \`x-implementation-allowed\` sin el gate.
- **TASK-028:** falta dispatcher de outbox, publicación, retries, idempotencia de consumidores y DLQ para lifecycle events.
- **Medición real:** faltan adapters de ingesta Meta/infrastructure/AI y conciliación, sin inventar cantidades/costes.
- **Soporte:** falta cablear \`authorizeSupportAccess\` a cada operación PAR-007 congelada; nunca convertir la comprobación en un bypass de tenant context.
- **Calidad:** Source CI y CodeQL sobre el commit final, revisión independiente privilege/RLS/SQL, evidencia de operación, aprobación de Product Owner.

## 5. Bootstrap inicial de operadores (operación controlada)

La primera asignación de \`platform_owner\` no se realiza desde el API. Tras identificar al usuario correcto y obtener aprobación explícita del propietario, el responsable autorizado de base de datos puede ejecutar una inserción parametrizada equivalente a:

\`\`\`sql
INSERT INTO platform.platform_operators (user_id, role_key, status)
SELECT id, 'platform_owner', 'active'
FROM platform.users
WHERE oidc_issuer = :issuer
  AND oidc_subject = :subject
  AND status = 'active'
ON CONFLICT (user_id, role_key) DO NOTHING;
\`\`\`

Usar parámetros enlazados (no concatenación), verificar que se afectó exactamente un usuario y registrar la intervención administrativa fuera de banda. No asignar \`platform_owner\` a cuentas compartidas ni a identidades no verificadas.

## 6. Estado de cierre

TASK-052 / US-024 permanece **in_progress**. El slice de dominio, persistencia y pruebas está implementado en código, pero la verificación CI del HEAD, el contract freeze/G0, TASK-041, publisher outbox, productores reales de métricas, cableado PAR por recurso, revisión independiente y aceptación del Product Owner siguen abiertos. Esto no equivale a historia terminada ni habilita GO-PRODUCTION.


## Addendum de verificación — 2026-11-08

El Source CI del commit anterior encontró un error real de sintaxis SQL en el delimitador de \`platform.is_active_platform_user\`; la migración se corrigió a delimitador etiquetado \`$function$\`. También se agregó comprobación explícita de \`has_active_support_grant(tenant, operator, scope)\` justo antes de resolver autorización de recurso. El CI del HEAD que contiene ambos fixes debe pasar antes de registrar validación positiva. No se considera terminada ni aceptada la historia.


## Addendum de build del workspace — 2026-11-08

El Source CI del commit \`6d8e6d3\` confirmó que PostgreSQL aplicó la migración 0030, pero el build completo falló también por deuda de módulos anterior a US-024: faltaba el DeveloperPlatformModule/OIDC boundary referenciado por CRM; faltaban cinco claves \`developer.*\` en el catálogo aunque estaban utilizadas por plantillas de roles; y \`TenantContextGuard\` usaba \`NotFoundException\` sin importarlo. Se corrigió el boundary mediante OIDC JWT verificado únicamente. API-client tokens siguen denegados/no implementados hasta TASK-062 y el contract freeze; no se simula ni se acepta un token no validado. Se agregaron las cinco definiciones de permiso con aprobación independiente para operaciones críticas y se corrigió el import faltante. El siguiente Source CI debe confirmar el estado de compilación.


## Addendum de catálogo de roles y permisos — 2026-11-08

La migración 0030 también siembra las cinco claves \`developer.*\` que ya consume el catálogo canónico de roles. Sin este seed, el provisioning de cualquier tenant fallaría al comparar el número de permisos materializados con \`TENANT_ROLE_CATALOG\`. Se agregó igualmente el grant SQL de UPDATE exclusivo sobre \`plan_versions.status\`, necesario para retirar versiones activas sin permitir modificar su contenido. La suite de integración ahora cubre cambio de versión de suscripción, retiro y rechazo de asignación de un plan retirado.


El chequeo estático completo del PermissionCatalog frente a todas las migraciones históricas identificó además cuatro claves de plantillas WhatsApp consumidas por \`TENANT_ROLE_CATALOG\` que no estaban sembradas en SQL (\`whatsapp.templates.read/create/update/delete\`). Migration 0030 se encarga de provisionar esas cuatro claves además de las claves \`developer.*\` y \`billing.usage.read\`. Esto evita que el rol canónico del nuevo tenant falle al materializar permisos; la validación de integración PostgreSQL del nuevo HEAD deberá confirmarlo.


## Addendum RLS de workers y soporte — 2026-11-08

La segunda ejecución PostgreSQL mostró que la política de INSERT del ledger invocaba la función de tenant medible, pero RLS impedía leer la fila tenant cuando el actor era \`usage_ingestor\` (sin membership). Se agregaron dos políticas SELECT estrictamente contextuales: usage ingestor y soporte JIT pueden ver la fila metadata de un único tenant, solo cuando coincide con \`app.tenant_id\`. Ninguna política convierte esos roles en miembros ni permite leer entidades/contactos/conversaciones. El test PostgreSQL debe volver a confirmar ingestion, resumen y grants JIT.
