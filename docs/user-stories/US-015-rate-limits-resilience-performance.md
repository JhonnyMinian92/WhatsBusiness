# US-015 — Límites de consumo, resiliencia y rendimiento

**Estado del código:** implementado en esta rama; integración operativa con infraestructura externa pendiente.  
**Fuente funcional:** `META_SERVICES.md`, sección 15. El repositorio base no contenía un registro explícito `HU-015`; esta identificación vincula la entrega con el capítulo funcional 15 y no presupone un backlog no versionado.

## Historia
Como plataforma multi-tenant que consume productos oficiales de Meta, necesito adaptar el ritmo de llamadas a las cuotas comunicadas por Meta, aislar fallos y carga por producto y empresa, y recuperar trabajos interrumpidos sin duplicar escrituras, para mantener continuidad y aislamiento.

## Criterios de aceptación
| Criterio | Estado |
|---|---|
| Parseo defensivo de X-App-Usage, X-Page-Usage, X-Business-Use-Case-Usage y X-Ad-Account-Usage. | Implementado |
| Throttling adaptativo por app, tenant, conexión y activo; estado compartido Redis. | Implementado |
| Respeto de Retry-After y cooldown de uso; backoff exponencial con full jitter. | Implementado |
| Reconciliación obligatoria para escrituras ambiguas; no reenviar resultados desconocidos. | Implementado |
| Bulkheads por tenant y producto, con cola acotada; Redis para varias réplicas. | Implementado |
| Circuit breaker independiente por producto y recuperación half-open. | Implementado por proceso |
| Caché de metadatos por tenant/activo, TTL, coalescencia e invalidación; Redis disponible. | Implementado |
| Paginación por cursor y checkpoints recuperables en PostgreSQL con RLS. | Implementado |
| Batch loader acotado para evitar N+1 sin asumir soporte batch en todos los edges. | Implementado |
| Colas separadas para mensajes transaccionales, marketing, analytics y recuperación de leads. | Router implementado; broker/consumidores pendientes |
| Telemetría con tenant pseudonimizado y request IDs/fbtrace IDs, sin tokens/payloads. | Implementado |

## Componentes
- `apps/api/src/platform/resilience`: contratos, adaptadores y orquestador resiliente.
- `apps/api/src/platform/isolation`: almacenamiento tenant-scoped, integridad SHA-256 y pseudonimización HMAC.
- `apps/api/migrations/001_meta_resilience.sql`: tabla de checkpoints tenant-scoped con RLS forzado.
- `apps/api/src/platform/resilience/README.md`: composición, despliegue y ejemplo de wiring.

## Decisiones de seguridad y operación
- Las cuotas Meta dependen del producto, app, Page, ad account y Business Use Case. No hay un límite global fijo.
- Los 429/códigos de cuota no disparan el circuit breaker; solo se reintentan automáticamente si el proveedor comunica un cooldown positivo.
- Ninguna escritura no idempotente se repite sin reconciliación. Un resultado desconocido se considera ambiguo y no se vuelve a enviar.
- Los checkpoints son al menos una vez: el handler consumidor debe ser idempotente.
- El lease de bulkhead Redis (120 s por defecto) debe superar el timeout HTTP máximo.
- El breaker es local al proceso; Redis comparte rate limits, caché y bulkheads. El batch loader coalesce lecturas dentro del proceso.

## Validación local
Node.js 22+ y npm:
```bash
npm install
npm run clean
npm run typecheck
npm test
```
En la copia de desarrollo con el conjunto extendido de pruebas: **32 pruebas, 32 aprobadas, 0 fallidas**. Esta PR añade una suite de 8 pruebas contractuales; el repositorio no tenía workflow de CI configurado y no se reportan resultados de CI para la rama.

## Pendientes de integración real
1. Provisionar Redis y conectarlo desde el composition root de API/workers.
2. Provisionar PostgreSQL y ejecutar la migración; cada operación de checkpoint debe usar transacción con `SET LOCAL app.tenant_id`.
3. Seleccionar el broker y conectar `MetaQueuePublisher` a colas, consumidores, políticas de retención y DLQ.
4. Enchufar `ResilientMetaExecutor` en cada adaptador Meta y definir reconciliadores por operación de escritura.
5. Ejecutar pruebas con tokens, activos y permisos Meta autorizados y pruebas de carga en infraestructura real.

**No se afirma que Redis, PostgreSQL, broker, servicios Meta ni despliegue estén provisionados o verificados en esta entrega.**
