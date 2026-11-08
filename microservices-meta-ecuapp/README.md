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
8. Cada handler recibe AbortSignal y está sujeto a TENANT_JOB_HANDLER_TIMEOUT_MS (1–900 s); debe cooperar con cancelación. El timeout aborta el trabajo y fuerza rollback, pero no puede matar una promesa Node.js no cooperativa: el host no debe registrar handlers que ignoren AbortSignal.
9. At-least-once implica duplicados. No se promete exactly-once end-to-end.

## Operación

RabbitMQ 4.4 con quorum queues es la baseline documentada en docs/51. Se requieren publisher confirms, consumer ACK manual y dead-letter policy at-least-once con `overflow=reject-publish` para DLX de quorum; las policies deben desplegarse y comprobarse por infraestructura, no inferirse del código.

## Validación

`pnpm build`, `pnpm typecheck` y `pnpm test` ejecutan también este proyecto Nx. Source CI aplica las migraciones versionadas vigentes (0001–0023 al 2026-11-08) e idempotencia; habilita las suites `RUN_TENANT_JOB_RUNTIME_INTEGRATION_TESTS=true` y valida PostgreSQL/RabbitMQ efímeros, renovación/recuperación de leases y fencing. Source CI #42433941375 terminó SUCCESS para commit `f136cff710fe8c60c8430c82928092320b9d90b5`.

## Estado honesto

Este proyecto añade runtime source para outbox/dispatcher/consumer, pero no representa GO-PRODUCTION. Antes de operar workers reales faltan la composición de deployment/secret manager, topology/policies desplegadas, pruebas crash/replay con RabbitMQ real, pool reuse A→B, SLO/alertas, carga, revisión independiente y aprobación de producción. El frontend no es requerido para este trabajo backend; no se crea todavía `app-meta-ecuapp`.
## Runtime worker y variables de entorno

El composition root reusable es `TenantJobRuntimeProcess.create`. El host debe pasar:
- `handlers`: handlers reales de los casos de uso de la aplicación; se rechaza una lista vacía.
- `databaseFactory(workerPool)`: adapta el `DatabaseService.withTenantContext` canónico existente al pool del worker. No crear una segunda implementación de autorización/RLS.
- `logger`: implementación de logs/telemetría con códigos normalizados.

La plantilla de variables está en `.env.example`; `TENANT_JOB_HANDLER_TIMEOUT_MS` configura el límite de ejecución cooperativa (default 300 s, rango 1–900 s). Se requieren URLs separadas para API, dispatcher y worker, más `RABBITMQ_URL`. En producción las URLs deben venir de Secret Manager/KMS y DB SSL y AMQPS son obligatorios. El runtime no arranca un worker productivo sin handlers reales.

### Comandos del workspace
```bash
pnpm install --frozen-lockfile
pnpm nx build microservices-meta-ecuapp
pnpm nx typecheck microservices-meta-ecuapp
pnpm nx test microservices-meta-ecuapp
pnpm db:migrate
```

La raíz HTTP legacy sigue en `apps/api` durante la migración gradual de contextos; los nuevos ports/adapters de jobs viven aquí. No existe aún una aplicación web; solo se creará `app-meta-ecuapp` cuando una historia frontend concreta lo requiera.


## Estado verificado — 2026-11-08

- Source CI [#42433941375](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42433941375) SUCCESS en `environment/local`, commit `f136cff710fe8c60c8430c82928092320b9d90b5`. La ejecución pasó migraciones/idempotencia, grants de mínimo privilegio, DLX quorum, build, typecheck, pruebas unitarias, integraciones PostgreSQL/RabbitMQ y cleanup de contenedores.
- El consumer diferencia errores de envelope y fallos de persistencia: envelope inválido va a DLQ; job válido con estado durable desconocido fuerza cierre de sesión sin ACK/NACK para redelivery. ACK ambiguo posterior a posible COMMIT tampoco provoca NACK destructivo. Cierres concurrentes de deliveries prefetched están agrupados single-flight.
- Pruebas cubren redelivery real tras pérdida de canal, ACK ambiguo, outage de procesamiento durable, cierre concurrente, expiración de leases y rechazo de fencing tokens obsoletos.
- Métricas: counters/histograms in-memory y `GET /metrics` (loopback por defecto; Bearer remoto + TLS/mTLS y red privada). Source CI #42434224485 SUCCESS validó endpoint; Source CI #42435204662 SUCCESS validó gauges PostgreSQL, migración/idempotencia, build/typecheck/unit/PG/RabbitMQ tests. Gauges SQL de outbox/leases/dead letters/replays usan SECURITY DEFINER con EXECUTE solo dispatcher y muestreo no bloqueante cada 15 s. Se añadieron gauges RabbitMQ de mensajes listos/consumidores de worker queue y DLQ por canal separado. El fallo de RPC/timeout del canal de métricas recicla la sesión completa con cierre single-flight para recuperar canales; Source CI [#42435984569](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42435984569) SUCCESS verificó build, typecheck, migraciones/idempotencia y unit/integration PostgreSQL/RabbitMQ. No miden unacked ni consumer lag. Dashboard Grafana, reglas Prometheus y runbook están versionados en `observability/`, aún sin validación de instalación real ni SLO aprobados.
- Replay administrativo conserva two-person approval, step-up, hash binding y audit; el policy registry sigue vacío y fail-closed hasta que handlers reales demuestren idempotencia de efectos externos.
- El runtime no se declara listo para producción. Pendientes: handlers reales y replay end-to-end, DLQ operator workflow/retención, métricas autoritativas de unacked/consumer lag, despliegue y prueba del dashboard/alert routing, SLO aprobados, broker deployment validation, Secret Manager/rotación, TLS/AMQPS reales, carga/DR, revisión independiente y aprobación del propietario. TASK-003 permanece `in_progress`; GO-PRODUCTION NO-GO.

## Observabilidad del runtime de jobs

El proceso expone las métricas Prometheus en `GET /metrics` cuando `TenantJobRuntimeProcess.run()` está activo. Las métricas operativas agregadas se leen desde PostgreSQL cada `TENANT_JOB_METRICS_POLL_INTERVAL_MS` (15 000 ms por defecto), fuera del request path, y no etiquetan ni devuelven IDs de tenants o actores. El listener usa `127.0.0.1:9464` por defecto y no añade labels de tenant, actor, job ni payload.

Para scraping desde otro contenedor/host, configura `TENANT_JOB_METRICS_HOST=0.0.0.0`, un puerto accesible solo desde la red privada y `TENANT_JOB_METRICS_BEARER_TOKEN` con al menos 32 bytes aleatorios. El secreto debe proceder del Secret Manager; Prometheus debe enviarlo como `Authorization: Bearer`. El tráfico remoto debe ir cifrado mediante TLS/mTLS en el service mesh o reverse proxy de confianza: Bearer no cifra HTTP. No expongas el endpoint a Internet ni lo publiques detrás de un proxy sin autenticación.

## Meta Webhook Gateway e inbox durable (TASK-027/028)

La API registra GET y POST en /api/v1/webhooks/meta/:product para whatsapp, facebook, instagram, leadgen, ads y threads. WhatsApp Flows Data Exchange es un protocolo síncrono distinto y no se procesa en este gateway.

- **Confianza del proveedor:** GET valida hub.mode=subscribe y compara hash SHA-256 del verify token en tiempo constante. POST valida X-Hub-Signature-256 como HMAC-SHA256 sobre los bytes HTTP originales; el parser JSON conserva esos bytes y aplica límite de 3 MiB. La firma se valida antes de decodificar/parsing JSON.
- **Resolución tenant:** el identificador del asset del evento se resuelve contra platform.meta_webhook_assets. Nunca se confía en un tenant enviado por el callback.
- **Durabilidad:** en una sola transacción PostgreSQL se persiste la entrega y cada evento en inbox cifrada, con clave única de idempotencia, y se crea el outbox transaccional. La API responde HTTP 200 solo después del COMMIT.
- **Cifrado:** el cuerpo HTTP y el payload independiente se protegen con AES-256-GCM y AAD ligado a app/tenant/product/asset/evento. Se guarda el key ID para permitir rotación manteniendo claves anteriores durante la vida del ciphertext.
- **Broker:** el outbox dispatcher publica un evento v1 mínimo meta.webhook.received, sin payload PII, con publisher confirms y entrega mandatory. RabbitMQ usa exchange y quorum queue durables, DLX/DLQ física y ACK manual.
- **Procesamiento:** el consumer reclama inbox con lease/fencing, descifra y enruta al handler registrado por producto/tipo. El handler y el recibo idempotente del consumer deben ejecutarse en la misma transacción tenant-scoped. Reintentos son at-least-once con backoff+jitter; handler inexistente o agotamiento de intentos acaba en la DLQ durable de PostgreSQL. Mensajes físicamente inválidos llegan también a la DLQ de RabbitMQ.
- **Recuperación:** el supervisor recrea la sesión AMQP con backoff acotado; el dispatcher re-publica outbox pendiente y recupera leases vencidos.

### Configuración operativa y límites pendientes

El módulo de ingreso usa el adapter de secretos por entorno como adaptador de desarrollo: META_WEBHOOK_APP_SECRETS_JSON debe recibir referencias a secretos gestionados externamente, y META_WEBHOOK_ENCRYPTION_KEYS_JSON un keyring base64 de claves de 32 bytes. No es una integración KMS/Secret Manager productiva. No se deben poner secretos reales en archivos versionados.

El worker rechaza iniciar si no se registran handlers de negocio. El repositorio ya incluye ports, registry, processor, dispatcher, consumer y supervisor, pero los handlers de WhatsApp/Instagram/Facebook/Leadgen/Ads aún deben conectarse a sus casos de uso y probar sus efectos externos idempotentes. No se debe registrar un handler vacío que confirme eventos sin aplicar el efecto de negocio.

Existe una API tenant-scoped de solo lectura GET /v1/tenants/:tenantId/webhooks/dead-letters para listar metadatos sin exponer ciphertext. El permiso webhooks.dead_letters.read se limita a las plantillas tenant_admin y compliance_auditor. El replay administrativo todavía no está implementado: requiere política CR-0016 (retención/ventana), handlers idempotentes demostrados y flujo de aprobación independiente con step-up y auditoría; no ejecutar SQL manual ni reencolar payloads directamente. La cola física de RabbitMQ debe permanecer privada y no exponerse a tenants.

La especificación OpenAPI WH-001..WH-007 y AsyncAPI todavía necesitan freeze/revisión contractual del producto; WH-008 queda fuera. Deben probarse fixtures reales de cada producto/versión soportada. También faltan adapter de secretos gestionados, instalación real de roles/grants, rate limit/WAF en el borde, dashboards/alertas específicos (TASK-029), pruebas E2E con PostgreSQL/RabbitMQ, pruebas de carga/recuperación y aceptación operativa.

## Compatibilidad del fixture live con RabbitMQ 4.4

La integración de Management API usa colas temporales únicas, exclusivas de la conexión y auto-delete (`durable=false, exclusive=true, autoDelete=true`). RabbitMQ 4.4 rechaza colas clásicas transitorias no exclusivas; no se habilita la característica obsoleta ni se cambia la topología quorum durable del runtime. La ejecución Source CI #563 sobre el commit `92b46d68bc8070a086b95352d504797fe1bf0c3d` es el gate pendiente de este ajuste.
