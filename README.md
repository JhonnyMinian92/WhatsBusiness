# WhatsBusiness

Plataforma de microservicios para integrar productos oficiales de Meta (WhatsApp, Facebook, Instagram, Messenger, Threads, Lead Ads y Marketing API). El alcance funcional y las decisiones de integración están descritos en [`META_SERVICES.md`](./META_SERVICES.md).

## Código disponible

- `apps/api/src/platform/isolation`: primitives de aislamiento multi-tenant, pseudonimización HMAC y almacenamiento de objetos tenant-scoped.
- `apps/api/src/platform/resilience`: ejecución resiliente compartida, rate limiting adaptativo, circuit breakers por producto, bulkheads, retry/reconciliación, caché, paginación/checkpoints, batch loader, enrutamiento de colas y telemetría segura.
- `apps/api/migrations`: migraciones SQL de persistencia de checkpoints.
- `docs/user-stories`: estado verificable de historias de usuario implementadas y pendientes.

## Requisitos de desarrollo

- Node.js 22+
- npm

```bash
npm install
npm run clean
npm run typecheck
npm test
```

`npm test` compila TypeScript y ejecuta las pruebas unitarias/contractuales con `node:test`.

## Estado de integración

El código actual implementa contratos y adaptadores intercambiables. El broker, Redis, PostgreSQL, clientes HTTP de Meta, composición del runtime, despliegue, secretos y pruebas de integración reales se deben conectar desde la aplicación anfitriona. No se considera una integración de producción hasta completar esa configuración y ejecutar las pruebas con activos Meta autorizados.
