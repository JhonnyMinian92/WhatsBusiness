# 92 — TASK-003: adaptadores de cache Valkey y object storage S3-compatible

**Fecha:** 2026-11-08  
**Rama:** `feat/task-003-runtime-adapters-valkey-s3`  
**Tarea:** TASK-003 / US-001 / Frente A  
**Estado:** slice de infraestructura agregado; TASK-003 continúa `in_progress`.

## 1. Reutilización previa

Antes del cambio se inspeccionaron `TenantResourceNamespace`, `TenantScopedCache`, `TenantScopedObjectStorage`, `IsolationModule`, los tests de aislamiento y el laboratorio `spike/task-039-lab`.

- Se preservan los puertos existentes `CacheStore` y `ObjectStorage` y los decoradores tenant-scoped; no se duplican las reglas de namespace, TTL o checksum.
- La topología de laboratorio ya contiene Valkey 9.1 con password, AOF y loopback en `127.0.0.1:16389`; el adapter se conecta por la API nativa RESP sin agregar cliente npm.
- El object store adopta la API S3-compatible con AWS Signature Version 4 sobre `fetch`/`node:crypto`; la política de tenant sigue perteneciendo a `TenantScopedObjectStorage`.

## 2. Implementación

| Archivo | Responsabilidad |
|---|---|
| `infrastructure/resp-protocol.ts` | Encoder binario RESP2 y parser incremental de respuestas, límites de tamaño/profundidad y error tipado del servidor. |
| `infrastructure/valkey-connection.ts` | Conexión TCP/TLS, autenticación ACL, keep-alive, un comando por conexión, timeout y fail/close seguro. |
| `infrastructure/valkey-connection-pool.ts` | Pool acotado de conexiones, adquisición concurrente, timeout de espera y cierre ordenado. |
| `infrastructure/valkey-cache-store.ts` | Implementa `CacheStore` usando GET/SET EX/DEL, AUTH y configuración desde `VALKEY_URL`. |
| `infrastructure/s3-compatible-object-storage.ts` | Implementa `ObjectStorage` con SigV4, PUT/GET/DELETE, cancelación por timeout, límite de transferencia y SHA-256 de lectura/escritura. |
| `isolation.module.ts` | Registra los providers y expone `TenantScopedCache`, `TenantScopedObjectStorage` y tokens para los módulos consumidores. |

Los tokens `CACHE_STORE` y `OBJECT_STORAGE` conectan los puertos con adaptadores reemplazables y permanecen internos al módulo; solo se exportan `TenantScopedCache` y `TenantScopedObjectStorage` para impedir que un bounded context omita el namespace del tenant. Los factories son el composition root; los casos de uso consumen solo decorators/abstractions.

## 3. Controles de seguridad

- Valkey remoto requiere `rediss://`; `redis://` solo está permitido para loopback. Producción exige TLS y ACL/password.
- Object storage remoto y cualquier despliegue productivo requieren HTTPS. La URL no admite userinfo, query ni fragment.
- Las claves S3 se validan como rutas relativas, rechazan segmentos `.`/`..`, traversal codificado, barras invertidas y controles.
- PUT comprueba SHA-256 y tipo MIME; GET lee con límite de bytes y comprueba el checksum registrado como `x-amz-meta-sha256` antes de entregar el objeto.
- SigV4 firma host, fecha, payload y encabezados `x-amz-*`. El cifrado del lado del servidor se exige en PUT mediante SSE-S3 (`AES256`) por defecto o SSE-KMS (`aws:kms`) con referencia explícita `OBJECT_STORAGE_KMS_KEY_ID`.
- Las credenciales de acceso son configuración de runtime inyectada; no se escriben en código ni en reportes. El secret de laboratorio no sirve para producción.
- Si un provider está sin configurar, los adapters lanzan errores tipados y fallan cerrados; no devuelven cache hits simulados ni éxito de escritura.
- La aplicación mantiene claves tenant-scoped `wb:tenant:<tenant>:cache:...` y `tenants/<tenant>/<resource>/...` mediante la abstracción original.

## 4. Configuración

Se documentan las variables opcionales en `.env.example`. Todas las variables S3 obligatorias deben configurarse juntas o dejarse vacías; `OBJECT_STORAGE_SERVER_SIDE_ENCRYPTION` admite `AES256` o `aws:kms`, y este último exige la referencia de KMS.

Para conectar la API local con el Valkey del laboratorio, copiar el password local de `spike/task-039-lab/.env` y establecer `VALKEY_URL=redis://:<password>@127.0.0.1:16389/0`. Los consumidores dentro de la red Docker deben usar el hostname/puerto interno y credenciales del mismo stack. No copiar el password de muestra a una instalación compartida.

El endpoint S3/MinIO debe provisionarse por separado con bucket privado, TLS, versioning/retention acorde a política legal, lifecycle y protección de borrado. El adapter no crea buckets ni políticas IAM automáticamente.

## 5. Tests de fuente añadidos

- `valkey-resp.spec.ts`: framing binario, respuesta fragmentada, bulk string binario, respuesta de error y rechazo de endpoint remoto inseguro.
- `s3-compatible-object-storage.spec.ts`: firma Authorization, servidor SSE, checksum al leer, 404, configuración fail-closed, key traversal y requisito de KMS key.
- Se mantienen los tests existentes de `TenantScopedCache` y `TenantScopedObjectStorage` para aislamiento entre tenants, TTL, MIME y checksum.

Los tests se agregaron al árbol de fuente pero no se ejecutaron localmente en esta campaña; el siguiente Source CI del PR debe verificar TypeScript/build, unit tests y el comportamiento live contra Valkey/S3 autorizado. No se declara PASS hasta leer esa evidencia.

## 6. Límites pendientes del TASK-003

- Aún se deben integrar los adapters en consumidores de dominio reales y documentar su política de invalidación/reconstrucción desde PostgreSQL.
- No se ha provisionado un S3/MinIO runtime dentro de compose; bucket, IAM, TLS/KMS, versioning, lifecycle y políticas de retención permanecen como infraestructura pendiente.
- Aún faltan lifecycle de archivos/virus scanning para medias, borrado/retención coordinados con TASK-032/059, y cobertura de cache/object storage en telemetría/DR.
- El pool Valkey y el adapter S3 no sustituyen un runbook de rotación de credenciales, failover/restore o alerting de provider.
- TASK-003 permanece `in_progress` hasta completar esos consumidores, límites operativos, revisión y aceptación.

## 7. Referencias

- Arquitectura/estándares: `docs/48-CODING-ARCHITECTURE-AND-REUSE-STANDARD.md`.
- Backlog: `docs/11-TASK-BACKLOG.md`, TASK-003.
- Runtime de jobs: `docs/60-TENANT-JOBS-RUNTIME.md`.
- Plan: `docs/78-SOURCE-COMPLETION-PLAN-71-TASKS.md`.
- AWS SigV4 canonical request / signing: https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html
