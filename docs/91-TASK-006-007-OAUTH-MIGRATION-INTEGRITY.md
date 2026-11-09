# 91 — TASK-006/TASK-007: restauración de integridad de migración OAuth

**Fecha:** 2026-11-08  
**Base inspeccionada:** `491704b8f7eca17059b8b1b0d04afd5ea95a5053`  
**Rama:** `fix/task-006-oauth-migration-integrity`  
**Estado:** corrección de código propuesta; migración pendiente de ejecutar en CI tras integración.

## Hallazgo reproducible

Source workspace validation `42545949760` falló durante la aplicación de migraciones, inmediatamente después de aplicar `0031-ads-creative-lab`. PostgreSQL devolvió `syntax error at or near "IF"` al procesar `0032-meta-oauth-token-vault.sql`.

La migración tenía una función `platform.consume_meta_oauth_state` truncada antes de completar el `IF`; dos bloques SQL de `platform.meta_connections` fueron intercalados dentro del cuerpo de esa función y una segunda definición de la tabla/trigger/RLS quedó duplicada al final.

## Corrección aplicada al fuente

- Se conserva una sola definición completa de `platform.meta_oauth_states`, índices y políticas RLS.
- Se elimina la función SQL interrumpida: el repositorio ya consume el estado usando `UPDATE ... WHERE tenant_id, initiated_by_user_id, authz_version, state_hash, consumed_at IS NULL, failed_at IS NULL, expires_at > clock_timestamp()` dentro de `DatabaseService.withTenantContextAtVersion`, por lo que no necesita SECURITY DEFINER ni una segunda ruta de autorización.
- Se conserva una sola definición de `platform.meta_connections`, con trigger de contexto, estados permitidos, RLS FORCE y grants explícitos.
- Se conserva el índice único parcial `meta_connections_active_identity_unique`, que coincide exactamente con `ON CONFLICT (...) WHERE status<>'revoked'` del repositorio. La segunda tabla duplicada con unique constraint no parcial se descarta.
- Se explicitan grants de la tabla OAuth y `PUBLIC` mantiene acceso revocado.

## Seguridad/contratos preservados

- OAuth state continúa hasheado, one-time y limitado a tenant, actor y versión de autorización.
- PKCE verifier y access/refresh tokens solo se persisten como envelopes cifrados; el adapter de envelope permanece fail-closed hasta integración de KMS/secret manager aprobado.
- La policy de actualización de state sigue exigiendo tenant y actor del contexto, permiso `meta.connections.manage`, estado no consumido/no fallido y expiración vigente.
- Conexiones revocadas son terminales; nueva reconexión crea otra fila en lugar de reactivar credenciales revocadas.

## Verificación

El fallo se observó en Source run `42545949760` antes de build/typecheck. CodeQL del commit `63c2b521980132e8c87faafa3bb0409c6ee990b6` pasó, pero no valida SQL. La corrección debe confirmarse mediante migration apply + idempotency del nuevo HEAD. No se declara migración verificada hasta ese resultado.

## Pendiente para TASK-006/TASK-007

- CI PostgreSQL limpio e idempotente.
- Provider OAuth Meta oficial y prueba contract/sandbox autorizada.
- Credential envelope provider respaldado por KMS/Secret Manager, rotación/revocación y evidencia operativa.
- Control de scopes, elegibilidad de app y revisión independiente.

Véase también `docs/78-SOURCE-COMPLETION-PLAN-71-TASKS.md` y `docs/11-TASK-BACKLOG.md`.