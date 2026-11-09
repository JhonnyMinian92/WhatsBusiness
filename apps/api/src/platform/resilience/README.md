# Platform resilience

This module is the shared execution and reliability boundary for all Meta product adapters.

## Composition

`ResilientMetaExecutor` composes:

1. `AdaptiveRateLimiter` — app, tenant, connection, asset and business-account pacing from Meta usage headers.
2. Tenant and product `ConcurrencyLimiter` ports — bounded concurrency and FIFO queues. Use `KeyedConcurrencyLimiter` for local tests/development and `RedisConcurrencyLimiter` across replicas.
3. `CircuitBreakerRegistry` — per-product closed/open/half-open protection. Rate-limit responses are deliberately excluded from service-health failures.
4. `RetryPolicy` — capped exponential full-jitter backoff, provider `Retry-After`, and reconciliation for unsafe writes.
5. `MetaRequestObserver` — best-effort telemetry with pseudonymized tenant references and Meta trace IDs.

The executor expects the HTTP adapter to provide the operation-specific retry safety and (for unsafe writes) a reconciliation function. Do not mark a non-idempotent operation as safe merely to enable retry.

## Infrastructure adapters

| Port | Local adapter | Shared/persistent adapter |
|---|---|---|
| Rate-limit state | `InMemoryRateLimitStateStore` | `RedisRateLimitStateStore` |
| Concurrency | `KeyedConcurrencyLimiter` | `RedisConcurrencyLimiter` |
| Metadata cache | `InMemoryMetadataCacheStore` | `RedisMetadataCacheStore` |
| Cursor checkpoints | `InMemoryCursorCheckpointStore` | `PostgresCursorCheckpointStore` |
| Work queues | — | Inject a broker-backed `MetaQueuePublisher` into `MetaWorkQueueRouter` |
| Telemetry | Inject a `SafeTelemetrySink` | Inject the production metrics/logging exporter |

## Multi-replica requirements

- Use Redis-backed rate limiting, cache and bulkheads in every API/worker replica. Do not mix local and shared stores in the same production deployment.
- Configure the HTTP client's hard timeout below `RedisConcurrencyLimiter`'s `leaseMs` (default 120 seconds). Lease expiry is a crash-recovery safety net, not a heartbeat.
- The circuit breaker registry is process-local; monitor each replica and do not assume it is a distributed global state machine.
- Configure the queue broker to enforce the lane's concurrency, priority, attempts, retention and dead-letter policy. The router passes these settings but does not create the broker or workers.
- Run the PostgreSQL migration, then execute each checkpoint query inside a transaction that sets `SET LOCAL app.tenant_id` to the authenticated tenant UUID. RLS is enabled and forced on the checkpoint table.
- Cursor `maxPages` is a per-run processing budget, so longer syncs resume from the durable cursor on the next worker invocation.
- Store HMAC keys and Meta tokens in the deployment secret manager; never commit them or log them.

## Example wiring

The following is illustrative TypeScript. `redisEval`, `redisCache`, `database`, `publisher` and `telemetrySink` are infrastructure adapters supplied by the application composition root.

```ts
import {
  AdaptiveRateLimiter,
  CircuitBreakerRegistry,
  RedisConcurrencyLimiter,
  RedisMetadataCacheStore,
  RedisRateLimitStateStore,
  ResilientMetaExecutor,
  RetryPolicy,
  SafeMetaRequestTelemetry,
  TenantMetadataCache,
} from "./index.js";
import { HmacTenantPseudonymizer } from "../isolation/tenant-hmac-pseudonymizer.js";
import { TenantTelemetryContext } from "../isolation/tenant-telemetry-context.js";

const rateState = new RedisRateLimitStateStore(redisEval);
const rateLimiter = new AdaptiveRateLimiter({ store: rateState });
const tenantBulkhead = new RedisConcurrencyLimiter(redisEval, {
  maxConcurrency: 4,
  maxQueue: 40,
  leaseMs: 120_000,
});
const productBulkhead = new RedisConcurrencyLimiter(redisEval, {
  maxConcurrency: 40,
  maxQueue: 200,
  leaseMs: 120_000,
});
const telemetry = new SafeMetaRequestTelemetry(
  new TenantTelemetryContext(new HmacTenantPseudonymizer(tenantTelemetryHmacSecret)),
  telemetrySink,
);

export const metaExecutor = new ResilientMetaExecutor({
  rateLimiter,
  tenantBulkhead,
  productBulkhead,
  retries: new RetryPolicy(),
  circuitBreakers: new CircuitBreakerRegistry(),
  observer: telemetry,
});

export const metadataCache = new TenantMetadataCache(
  new RedisMetadataCacheStore(redisCache),
);
```

The example demonstrates construction order only. Credentials, real client packages, connection lifecycle, broker consumers, application shutdown, migrations and runtime health checks belong in the host application's composition root.
