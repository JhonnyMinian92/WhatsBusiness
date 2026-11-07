# microservices-meta-ecuapp — backend WhatsBusiness

Este directorio es la raíz del backend que se está consolidando bajo el nombre solicitado por el propietario. Se integra como proyecto Nx/TypeScript dentro del workspace existente y comparte el mismo lockfile, PostgreSQL, contratos y pipeline CI.

## Arquitectura vigente

La arquitectura de producto sigue siendo un **monolito modular con límites de dominio y procesos worker desplegables por separado cuando la carga lo justifique**. El nombre del directorio no obliga a convertir cada módulo en un microservicio de red. Esta regla evita duplicar APIs, pools, identidad y lógica de autorización antes de disponer de evidencia de capacidad/operación.

- `src/jobs/domain`: contratos y políticas puras de jobs.
- `src/jobs/application`: dispatcher, consumer, handlers y puertos.
- `src/jobs/infrastructure/postgres`: persistencia de outbox, leases, inbox y fencing.
- `src/jobs/infrastructure/rabbitmq`: adapter AMQP 0-9-1, publisher confirms y ACK manual.
- `migrations`: migraciones de backend. `scripts/migrate.mjs` ejecuta en orden las migraciones heredadas de `apps/api/migrations` y las nuevas de este directorio; los números son globales y no se pueden duplicar.

## Fuente de verdad en transición

El HTTP foundation existente sigue temporalmente en `apps/api` mientras se migran contextos, contratos y pruebas sin duplicar su comportamiento. Los nuevos módulos backend se incorporan aquí y deben exponer ports explícitos; no se crean copias del IdentityService, DatabaseService ni de los guards existentes. Toda migración de código debe mantener build, typecheck, tests y referencias cruzadas.

## Reliability contract

1. PostgreSQL commit de negocio + job record es el outbox transaccional.
2. El dispatcher reclama filas con `FOR UPDATE SKIP LOCKED`, lease y fencing token.
3. RabbitMQ recibe solamente `{ version: 1, jobId }`; el payload canónico permanece en PostgreSQL.
4. El publisher usa mensajes persistentes, `mandatory=true` y publisher confirms antes de marcar la fila publicada.
5. El consumer usa manual ACK y prefetch acotado. ACK solo después del commit de la transacción de negocio, inbox y estado terminal/retry.
6. La expiración de leases permite recuperar dispatchers/workers caídos. Los fencing tokens evitan que un worker antiguo confirme después de perder su lease; los handlers largos renuevan el lease con el token actual y reciben AbortSignal si la renovación falla.
7. Los handlers no hacen I/O de proveedor dentro de la transacción de ejecución; deben stagear esos side effects en outbox.
8. At-least-once implica duplicados. No se promete exactly-once end-to-end.

## Operación

RabbitMQ 4.4 con quorum queues es la baseline documentada en docs/51. Se requieren publisher confirms, consumer ACK manual y dead-letter policy at-least-once con `overflow=reject-publish` para DLX de quorum; las policies deben desplegarse y comprobarse por infraestructura, no inferirse del código.

## Validación

`pnpm build`, `pnpm typecheck` y `pnpm test` ejecutan también este proyecto Nx. Source CI aplica migraciones hasta la 0007 y habilita `RUN_TENANT_JOB_RUNTIME_INTEGRATION_TESTS=true` sobre PostgreSQL efímero.

## Estado honesto

Este proyecto añade runtime source para outbox/dispatcher/consumer, pero no representa GO-PRODUCTION. Antes de operar workers reales faltan la composición de deployment/secret manager, topology/policies desplegadas, pruebas crash/replay con RabbitMQ real, pool reuse A→B, SLO/alertas, carga, revisión independiente y aprobación de producción. El frontend no es requerido para este trabajo backend; no se crea todavía `app-meta-ecuapp`.
## Runtime worker y variables de entorno

El composition root reusable es `TenantJobRuntimeProcess.create`. El host debe pasar:
- `handlers`: handlers reales de los casos de uso de la aplicación; se rechaza una lista vacía.
- `databaseFactory(workerPool)`: adapta el `DatabaseService.withTenantContext` canónico existente al pool del worker. No crear una segunda implementación de autorización/RLS.
- `logger`: implementación de logs/telemetría con códigos normalizados.

La plantilla de variables está en `.env.example`. Se requieren URLs separadas para API, dispatcher y worker, más `RABBITMQ_URL`. En producción las URLs deben venir de Secret Manager/KMS y DB SSL y AMQPS son obligatorios. El runtime no arranca un worker productivo sin handlers reales.

### Comandos del workspace
```bash
pnpm install --frozen-lockfile
pnpm nx build microservices-meta-ecuapp
pnpm nx typecheck microservices-meta-ecuapp
pnpm nx test microservices-meta-ecuapp
pnpm db:migrate
```

La raíz HTTP legacy sigue en `apps/api` durante la migración gradual de contextos; los nuevos ports/adapters de jobs viven aquí. No existe aún una aplicación web; solo se creará `app-meta-ecuapp` cuando una historia frontend concreta lo requiera.
