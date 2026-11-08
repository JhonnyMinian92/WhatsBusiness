# 72 — US-012: Campaign Lifecycle & Spend Guardrails

**Fecha:** 2026-11-08  
**Rama:** `environment/local`  
**Historia:** US-012 — Gestionar campañas y anuncios  
**Tareas:** TASK-024 y TASK-025  
**Estado de entrega:** núcleo de dominio implementado; integración de aplicación/HTTP/proveedor y verificación CI pendientes.  
**Aceptación del Product Owner:** pendiente.  
**GO-PRODUCTION:** NO-GO.

> Este documento distingue deliberadamente implementación de dominio, verificación automatizada, integración externa y aceptación. No declara la historia completa por el solo hecho de que existan clases o pruebas.

## 1. Requisitos de la historia

| Criterio | Alcance requerido | Resultado de este corte |
|---|---|---|
| AC-012-01 | draft → validate → approve → submit → reconcile | Implementada la máquina de estados y la prevalidación fail-closed del dominio. Persistencia, endpoints, approval wiring, submit/outbox y reconciliación de proveedor aún no implementados. |
| AC-012-02 | dry-run, límites de presupuesto, aprobación de actor y kill switch | Implementados los evaluadores puros de presupuesto y autorización de ejecución. No están conectados aún al command handler, PostgreSQL ni gateway de ejecución. |
| AC-012-03 | reconciliar estados externos y gasto | El dominio distingue estados activos, pausados, fallidos y desconocidos; el resultado desconocido no permite retry ciego. Falta el reconciler, ledger de gasto, insights, adapter y evidencia Meta. |

## 2. Código añadido

| Archivo | Responsabilidad |
|---|---|
| `apps/api/src/ads/campaigns/domain/ads-money.ts` | Parseo y comparación decimal exacta con enteros BigInt escalados; no convierte importes monetarios a float. |
| `apps/api/src/ads/campaigns/domain/budget-guardrail.ts` | Guardrail PD-024: máximo +20% por operación y máximo +20% acumulado contra la referencia inmutable de la ventana móvil de 24 horas. |
| `apps/api/src/ads/campaigns/domain/campaign-lifecycle.ts` | Máquina de estados cerrada. No permite saltar validación, aprobación ni staging de submit; un resultado externo desconocido solo avanza mediante reconciliación. |
| `apps/api/src/ads/campaigns/domain/campaign-validation.ts` | Preflight fail-closed de objetivo, versión API, vigencia de evidencia, cuenta, moneda, capability, targeting, billing y creative. |
| `apps/api/src/ads/campaigns/domain/ads-execution-guard.ts` | Policy central para escrituras externas: actor, asset grant, capability vigente, aprobación exacta y quorum independiente; kill switch bloquea publicación/aumento y conserva la posibilidad de pausar. |
| `apps/api/src/ads/campaigns/domain/*.spec.ts` | 24 pruebas unitarias focalizadas sobre dinero, límites, bypass acumulativo, cambios de estado, evidencia expirada y autorización. |
| `apps/api/project.json` | Incorpora las cinco suites nuevas al target oficial `api:test`. |

## 3. Invariantes de seguridad y dinero

1. Los importes se reciben como strings decimales con máximo seis posiciones fraccionarias. Se rechazan números JavaScript, exponentes, signo negativo, moneda inválida y precisión excesiva.
2. El cálculo del porcentaje usa aritmética entera; el límite inclusivo de 20% se permite, pero un micro-unit adicional se rechaza.
3. Cada ventana mantiene una referencia de presupuesto y un inicio/fin exactos de 24 horas. Una ventana vencida o malformada bloquea aumentos hasta que un reconciler obtenga nueva observación; el dominio no reinicia el baseline por sí mismo.
4. Una secuencia de aumentos pequeños no puede superar +20% sobre el baseline de la ventana, aunque cada cambio individual sea menor a 20%.
5. Las reducciones no quedan impedidas por el kill switch o por un baseline excedido. La ejecución externa de cualquier acción sigue necesitando capability y asset grant actuales.
6. Un objetivo no se acepta por existir en código: exige un catálogo versionado y vigente, junto con evidencia de cuenta y capability para la misma versión de API.
7. Una aprobación debe corresponder al hash de la acción exacta, estar vigente y reunir aprobadores distintos del requester. El flujo persistente reutilizable existe en Identity, pero aún debe integrarse al caso de uso Ads.
8. `unknown` es un estado explícito. No significa fallo, éxito ni permiso para repetir ciegamente una escritura externa.

## 4. Integración y gates pendientes

No se agregaron controllers ni se registraron rutas Ads en `AppModule`. El repositorio documenta que las operaciones Ads permanecen catalog-only y que el allowlist de implementación HTTP está limitado a contratos congelados y aprobados por reviewer independiente (docs/49 y docs/55). No se modificó `x-contract-status`, no se inventaron request/response schemas, y no se abrió un endpoint que no cumpla ese gate.

Queda pendiente para completar TASK-024/TASK-025:

- Cerrar contract freeze para los ADS API IDs realmente incluidos en ambos paquetes: schemas request/response, errores, permisos, idempotencia, optimistic concurrency, audit y side effects; validación con `scripts/validate-contracts.mjs` y reviewer independiente.
- Integrar el motor con repositorios PostgreSQL tenant-scoped, RLS, migraciones, idempotency ledger y ejecución/outbox transaccional.
- Integrar `ApprovalWorkflowService` para solicitud, decisión independiente con step-up, consumo del hash exacto y staging atómico.
- Completar TASK-010: lectura confiable del inventario ad account/asset, grants, scopes, Marketing API Access Tier, elegibilidad y capability evidence con versionado y vencimiento.
- Completar TASK-029 y gates de observabilidad para command lifecycle, reconciliación, estado `unknown`, queue age, spend anomaly, kill switch y alertas.
- Implementar un adapter oficial Marketing API versionado por producto/operación y verificar contratos vigentes. No se ha realizado ninguna llamada a Meta ni se ha supuesto que la app o una cuenta tengan ads_management, Access Tier o App Review aprobados.
- Implementar pause/kill switch externo, reconciliación de campaign/adset/ad, Insights snapshots y spend ledger con provenance, moneda, attribution window y freshness.
- Ejecutar pruebas de PostgreSQL/RLS, concurrencia multiusuario, integración del approval/outbox, contract, security, provider fixtures y E2E. Obtener review independiente y aceptación del Product Owner.

## 5. Estado por tarea

| Tarea | Avance de código | Estado técnico al corte |
|---|---|---|
| TASK-024 | Núcleo de validación y lifecycle en dominio; no persistence/API/approval end-to-end | `in_progress`; no `verified` ni `accepted` |
| TASK-025 | Aritmética exacta, límites individual/rolling y policy de ejecución/kill switch en dominio | `in_progress`; no `verified` ni `accepted` |

**No reportar US-012 como terminada** hasta que los tres criterios AC estén implementados en la aplicación, los contratos y dependencias estén desbloqueados, todas las suites aplicables pasen y exista evidencia de reconciliación (sintética y de una cuenta elegible cuando se autorice). Ningún aumento de presupuesto ni publicación real se realiza por este cambio.
