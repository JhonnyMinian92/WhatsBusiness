# 57 — Decisión de inicio de implementación y cierre G0-CODE

**Fecha:** 2026-11-07 (America/Guayaquil)  
**Rama autorizada:** `environment/local`  
**Decisión:** **GO-CODE / G0-CODE = PASS** · **GO-PRODUCTION / G0-PRODUCTION = NO-GO**

## 1. Decisión del propietario

El propietario instruyó completar los bloqueos y comenzar el código fuente sin más demora. La instrucción es autorización explícita para iniciar workspace, CI y primer vertical slice en `environment/local`, aunque TASK-039 no haya completado todos los experimentos SP-01..10.

Esta decisión supersede la restricción documental previa que impedía crear scaffold. No modifica las reglas no negociables de seguridad, privacy, Meta, gasto externo, producción ni aceptación final.

### Alcance GO-CODE
- Crear workspace Nx/pnpm y aplicaciones NestJS API + Angular Web.
- Introducir health/liveness/readiness y pipeline de source validation.
- Completar gradualmente Platform Identity: OIDC, User, Tenant, Membership, autorización server-side, PostgreSQL transaction-local tenant context y RLS.
- Añadir audit/outbox, APIs PLT design-frozen y tenant selector solo cuando cada sub-slice tenga contrato y pruebas.
- Usar exclusivamente datos y credenciales sintéticas en local/CI.
- Trabajar solo en `environment/local`; no modificar `master` ni `environment/develop`.

### Fuera de GO-CODE y aún bloqueado

No queda autorizado por esta decisión: despliegue o migración productiva, secretos/cuentas reales, datos de clientes, Meta App Review ni llamadas reales a Meta, mensajes reales, Ads mutations/spend, proveedor IA externo, costes recurrentes, cambios irreversibles, eliminación de datos o aceptación de cumplimiento legal. Esos usos requieren sus aprobaciones específicas.

## 2. Evidencia disponible y estado TASK-039

El workflow [TASK-039 Docker lab run #5](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42344526870) terminó SUCCESS el 2026-11-07 en commit `99b3fe6faf71cc662b9e7766195d9c65fd0c183f`. Se ejecutaron pruebas sintéticas: PostgreSQL RLS básico/cross-tenant/no-context y dedupe; RabbitMQ durable publish/DLX; Valkey auth/TTL; Keycloak discovery/JWKS/login sintético; pg_dump y restore lógico a otra DB dentro del mismo container.

Artefacto: [task039-lab-evidence.zip](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42344526870/artifacts/13562838303), SHA-256 `2ee9bc136e2234252b5f407a84f013a2fef813e5b70aa17be1316afbedfd8f5a`. El artefacto no fue descargado/inspeccionado; los resultados descritos se apoyan en logs del run.

No se usó pool PostgreSQL desde Node; RabbitMQ no tuvo outbox/consumer de aplicación; webhook no ejecutó firma HTTP/ACK durable; Keycloak login no probó authorization de aplicación; restore fue dentro del mismo container y no midió RPO/RTO; runner no es VPS; no hubo benchmark, Valkey ACL/TLS/failover ni SBOM/CVE/licencias/digests. TASK-039 queda `partially_verified`, no `verified` ni `accepted`.

## 3. Primer vertical slice: orden obligatorio

| Paso | Resultado | Gate/evidencia antes de avanzar |
|---|---|---|
| 1 | Nx/pnpm workspace, NestJS API, Angular shell, CI y lockfile | install/build/test/typecheck en Node 26; combinación Nx+Node validada |
| 2 | Health live + readiness fail-closed | PLT-001/002; readiness no es OK sin dependencias verificadas |
| 3 | OIDC dev realm, JWT/JWKS, issuer + audience + expiry | tests token válido, firma inválida, issuer/audience incorrectos y expiración |
| 4 | User / Identity / Tenant / Membership | issuer+subject como identidad; email no es PK; membership activa requerida |
| 5 | Tenant Context + PostgreSQL RLS | transaction-local context; rol no BYPASSRLS; pool Node A→B y sin contexto |
| 6 | GET /v1/me, GET /v1/tenants, GET /v1/tenants/{tenantId}/context | PLT-003..005, auth, deny-by-default y cross-tenant |
| 7 | Audit + transactional outbox | atomicidad, publisher confirms, crash/replay, dedupe, DLQ y redacción |
| 8 | Angular tenant selector | solo tenants autorizados server-side |
| 9 | E2E y evidence pack | migración DB vacía, security negative tests y reviewer separado |

No se deben saltar pasos para comenzar con mensajería, Ads, Automation o agentes.

## 4. Reconciliación de contratos

La ruta `POST /v1/tenants/{tenantId}/leads/{leadId}/convert` aparecía dos veces en el mismo path item como LEAD-010 y SALES-014, generando una clave YAML duplicada. SALES-014 queda como operación activa porque crea una oportunidad y pertenece a Sales; LEAD-010 se registra como alias histórico retirado/superseded, nunca reutilizable.

OpenAPI queda con 296 operaciones activas: 288 REST + 8 webhooks; 5 design-frozen y 291 catalog-only. Solo PLT-001/002 reciben `x-implementation-allowed=true` para health foundation. PLT-003..005 siguen bloqueadas hasta OIDC/tenancy. AsyncAPI conserva 69 channels, 69 publish + 69 subscribe (138 operationIds) y 69 JSON Schema defs; catálogo no demuestra publishers/consumers.

## 5. Tecnología y reproducibilidad

Baseline exacta propuesta para el arranque:
- Node.js 26.13.0.
- pnpm 10.34.9.
- Nx 24.0.4.
- TypeScript 6.0.3.
- NestJS 12.4.0.
- Angular 22.2.0.
- RxJS 7.8.2.

Las versiones directas se fijan en manifests. La compatibilidad Nx 24 + Node 26 y el conjunto completo debe probarse con install/build/test de CI. El workflow genera el pnpm-lock y lo confirma solo después de ejecutar los checks. Hasta que se genere/commitee, no afirmar instalación frozen ni lockfile reproducible. Si CI descubre incompatibilidad, ajustar la versión con evidencia y registrar el cambio.

## 6. Ownership y revisión

No hubo reviewer independiente en esta interacción. Esta decisión no es una revisión independiente ni acceptance QA/SRE/Security. Se exige revisión distinta del autor antes de aceptar foundation slice, abrir rutas protegidas o release. La aceptación final permanece con el propietario.

## 7. Condiciones abiertas

| ID | Pendiente | Control de salida |
|---|---|---|
| R-039-01 | Node DB pool + RLS | test dos tenants, pool reuse y fail-closed |
| R-039-02 | Outbox/consumer | crash/retry/DLQ/replay sin duplicar efectos |
| R-039-03 | Webhook | raw body signature + durable commit before 2xx |
| R-039-04 | OIDC | issuer/audience/JWKS/exp + membership |
| R-039-05 | Disaster recovery | backup cifrado + restore clean-host + RPO/RTO |
| R-039-06 | Capacidad | hardware objetivo + benchmarks repetibles |
| R-039-07 | Supply chain | SBOM, CVE, licencias, digest pinning |
| R-039-08 | Duplicidad OpenAPI | corregida; CI exige IDs únicos |
| R-039-09 | Review independiente | reviewer distinto del autor antes de release/aceptación |

**Decisión vigente:** GO-CODE para implementar en local; NO-GO-PRODUCTION hasta resolver las condiciones aplicables y obtener aprobaciones independientes/humanas.

## 8. Scaffold efectivamente creado y CI

El primer workspace fue añadido directamente a `environment/local`:
- Nx 24.0.4 + pnpm 10.34.9 + TypeScript 6.0.3.
- Node fijado en `.node-version` a 26.13.0; `pnpm-lock.yaml` fue generado por pnpm en CI y ya está versionado.
- `apps/api`: NestJS 12.4.0, prefijo `/api`, endpoints GET `/health/live` y GET `/health/ready`.
- `/api/health/ready` devuelve 503 Problem Details mientras las dependencias obligatorias no tengan probes configurados; no se habilita readiness mediante un flag.
- `apps/web`: Angular 22.2.0 standalone shell en es-EC. No simula autenticación ni ofrece selector de tenant antes de implementar Identity/Membership.
- Tests Node para liveness, fail-closed readiness, status 503, media type `application/problem+json` y correlationId.

Evidencia CI posterior al scaffold:
- [Source workspace validation #3](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42373918923) terminó SUCCESS: instalación, build API/Web, typecheck, tests iniciales y creación del lockfile. Run intermedio anterior a los tests del controller.
- [Source workspace validation #6](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42374058862) terminó SUCCESS con `pnpm install` usando lockfile existente, build API/Web, typecheck y los tests ampliados de health.
- [Source workspace validation #7](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42374267061) terminó SUCCESS en el HEAD actual; además incluye target explícito de typecheck Angular (`ng build web --configuration development`), de modo que Nx ejecuta verificación para API y Web.
- [Contract validation #12](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42373843076) terminó SUCCESS: Redocly OpenAPI, AsyncAPI CLI y validador AJV con las 69 definiciones/fixtures de eventos; incluye la comprobación de 296 operaciones y unicidad de `x-api-id`.

La evidencia prueba compilación/tests del scaffold y validación estructural de contratos. No prueba todavía OIDC aplicado al API, base de datos integrada, RLS con pool Node, outbox runtime, ni aceptación independiente del producto.
