# 93 — Reparación de compilación de platform / Frente A

**Fecha:** 2026-11-08  
**Rama:** `fix/platform-source-typecheck-front-a`  
**Base inspeccionada:** `b6607c289d2dc6ca9c649330c70a533b231b86e8`  
**Estado:** correcciones fuente propuestas; no se declara compilación aprobada hasta CI del nuevo commit.

## Hallazgos del Source CI

El Source run `42547476482` ya superó la aplicación e idempotencia de migraciones; falló después en TypeScript build. Los diagnósticos apuntaban a imports relativos que no resolvían dentro de `platform/developer` y `platform/meta-control-plane`, además de una excepción Nest inexistente, acceso con dot notation a un `Record`, outcomes de auditoría faltantes y métodos duplicados de adapters.

## Correcciones fuente

- `developer-platform.service.ts`: rutas a `identity`, `database`, `isolation`, `domain` e `infrastructure` corregidas según la jerarquía real; `reserveCommand` valida y normaliza el idempotency key dentro del boundary que lo usa; se elimina un DELETE duplicado al reemplazar subscriptions.
- `oidc-or-api-client.guard.ts`: se sustituye `TooManyRequestsException` (no exportada por Nest) por `HttpException` con `HttpStatus.TOO_MANY_REQUESTS`, preservando `Retry-After`.
- `developer-api-credential.ts`: acceso a claves de `Record<string, unknown>` mediante bracket notation compatible con `noPropertyAccessFromIndexSignature`.
- `meta-oauth.ports.ts`, `meta-oauth.service.ts`, `meta-onboarding.ports.ts` y `meta-onboarding.service.ts`: imports corregidos al sibling `platform/identity`.
- `meta-oauth.service.ts`: acceso seguro a campos parseados desde `Record<string, unknown>` usando bracket notation tras validación de tipos.
- `unconfigured-meta-adapters.ts`: se eliminan las implementaciones duplicadas de `refreshAccessToken` y `revokeAccessToken`; los defaults continúan fail-closed.
- `append-only-audit.repository.ts`: se amplía `AuditOutcome` y su allowlist con los cuatro outcomes de Embedded Signup ya definidos por la migración 0038 (`meta_onboarding_started`, `meta_onboarding_asset_sync_started`, `meta_onboarding_blocked`, `meta_onboarding_ready`).

## Consistencia de migraciones

En el HEAD actual, las migraciones 0032–0037 ya fueron reparadas en `environment/local`: 0032 contiene un solo state table/connection table y elimina la función de consumo SQL; 0034 incorpora `remote_revocation_state`; 0037 elimina `consume_meta_oauth_state` con `DROP FUNCTION IF EXISTS` y crea el índice parcial compatible con el repository. La rama de reparación 0032 que estaba en PR #8 quedó obsoleta y no debe integrarse.

## Verificación y límites

- El Source CI previo aplicó migraciones y comprobó idempotencia, pero el build TypeScript falló.
- Las correcciones propuestas deben confirmarse mediante `source-validation` sobre este commit. No se baja `strict`, no se omite lint, build ni test.
- Los adapters reales Meta y KMS/secret manager permanecen fail-closed; corregir compilación no equivale a conexión OAuth productiva.

## Referencias

- `docs/11-TASK-BACKLOG.md` — US-016 / TASK-006, 007, 008 y Developer platform.
- `docs/78-SOURCE-COMPLETION-PLAN-71-TASKS.md` — Frente A.
- `apps/api/migrations/0032` a `0038`.
