# 45 — Runbook reproducible del Architecture Spike (TASK-039)

**Objetivo:** verificar la arquitectura adoptada antes del scaffold de producción.  
**Naturaleza:** prototipo desechable y laboratorio; no es el primer release del producto.  
**Estado:** protocolo preparado; ejecución real pendiente. No inventar resultados.

## 1. Resultado obligatorio

Entregar un informe reproducible que confirme o ajuste ADR-011..025. El spike debe medir compatibilidad, build, memoria, arranque, integración transaccional, aislamiento, resiliencia básica y restauración. Si el entorno no dispone de Docker o acceso a hardware VPS de referencia, registrar BLOCKED para esa parte; no sustituirlo por estimación.

## 2. Entorno y registro

Registrar OS/kernel; CPU/cores; RAM; disco/IO; filesystem; versiones exactas de Node LTS, Corepack, pnpm, Nx, NestJS, Angular, PostgreSQL, Valkey, RabbitMQ, Keycloak y Docker; commit de spike; lockfile; config; image digests; comandos; consumo idle/peak por servicio; tiempos cold/warm; tests; skips y limitaciones. No usar latest en resultados reproducibles.

## 3. Experimentos

### SP-01 Workspace y developer experience
- Crear prototipo Nx + pnpm con apps API, worker, scheduler y web.
- Instalar desde checkout limpio usando lockfile: pnpm install --frozen-lockfile.
- Ejecutar build, lint, typecheck y tests por proyecto y affected graph.
- Medir primera instalación, cold/warm build, memoria máxima y tamaño de artefactos.
- Verificar boundaries server/browser y domain sin imports de Nest/Angular/driver.

### SP-02 PostgreSQL, tenant context y RLS
- Crear dos tenants y conjuntos sintéticos.
- Habilitar RLS en tabla tenant-scoped; usar rol runtime no superuser ni BYPASSRLS.
- Establecer tenant con contexto transaction-local.
- Reutilizar pool/conexiones alternando tenant A/B.
- Intentar lectura/escritura sin contexto, contexto falso y tenant cruzado.
- Exit: todo intento no autorizado denegado y sin filtración entre requests.

### SP-03 Outbox + RabbitMQ
- En una transacción crear agregado + outbox record.
- Publicar outbox hacia RabbitMQ y simular caída antes/después de publish.
- Consumer at-least-once con dedupe/idempotency.
- Probar duplicate, poison event, broker unavailable, restart y DLQ.
- Exit: sin pérdida confirmada de eventos committed; duplicados no duplican side effect; recovery demostrable.

### SP-04 Webhook durable
- Endpoint sintético con validación de firma/challenge de prueba, size/content-type limits y dedupe.
- Persistir inbox payload ref y metadata de autenticidad antes de ACK.
- Forzar worker down y verificar reanudación desde durable inbox.
- Exit: ACK solo después del commit durable; worker independiente del request HTTP.

### SP-05 Keycloak/OIDC
- Login de prueba, JWKS validation, issuer/audience/expiry, user mapping y roles.
- Probar token inválido, expirado, issuer equivocado y membership revocada.
- Exit: autenticación separada de autorización tenant/asset.

### SP-06 Backup/restore
- Backup encrypted de PostgreSQL + config no secreta necesaria.
- Restaurar en host/container limpio.
- Comprobar schema, filas, constraints, event consistency y acceso.
- Documentar restore time y data-loss window simulada.
- Exit: restore reproducible; RPO/RTO medidos en ese entorno, sin extrapolar a VPS productivo.

### SP-07 Footprint VPS
- Ejecutar stack local Compose con carga sintética.
- Medir idle/peak RSS, CPU, disk IOPS/space, network, startup/restart y contention.
- Definir escenario objetivo preliminar; no afirmar capacidad sin resultados.
- Comparar con VPS propuesta solo si se dispone del hardware concreto.
- Exit: tamaño mínimo de laboratorio y limitaciones medidos; capacidad productiva requiere TASK-060 y aprobación de coste.

## 4. Configuración segura

Solo datos y tokens sintéticos. No conectar Meta app real, enviar mensajes, publicar anuncios, gastar presupuesto ni usar datos de clientes. Contratos Meta pueden probarse con fixtures sanitizadas sin permiso real. Secrets locales se inyectan y nunca se versionan.

## 5. Criterios globales de salida

Install/build/lint/typecheck/tests limpios desde checkout limpio; RLS + pooling demuestra aislamiento; outbox/inbox/RabbitMQ/DLQ demuestran dedupe/replay; webhook ACK después de persistencia durable; backup/restore completado y medido; footprint medido para el host probado; decisiones y comandos documentados; sin secretos/PII/recursos no aprobados; informe revisado por agente distinto del autor. Sin segundo agente, self-review y G0 no verificado.

## 6. Artefactos

spike/README.md, spike/compose.yaml, prototipo descartable, scripts/tests, spike/results/benchmark.csv, spike/results/test-evidence.md, spike/results/restore-report.md, ADR updates y conclusión ACCEPT / ADJUST / REJECT por decisión. El prototipo se elimina o queda aislado tras la decisión; no copiarlo automáticamente al scaffold.

## 7. Estado real del entorno de auditoría

En el entorno de esta sesión se verificó Node.js v22.16.0 y npm 10.9.2; no se encontraron pnpm ni Docker/Compose instalados. Por ello no se ejecutaron estos experimentos. Estos datos describen el entorno de auditoría, no el VPS del propietario. TASK-039 permanece pendiente de ejecución reproducible.

## 8. SP-08 — Comparación reproducible de lenguaje, framework, frontend y protocolo

Objetivo: contrastar las decisiones del stack con alternativas bajo el mismo workload y hardware, sin usar benchmark de marketing como evidencia.

### Backend
- Prototipo mínimo idéntico de tres operaciones: lectura JSON con PostgreSQL, comando transaccional con outbox y webhook ingress con durable inbox.
- Comparar Node 26 + TypeScript 6 + Nest 12 (Fastify y adapter alternativo) contra un candidato serio alternativo: ASP.NET Core Minimal API en runtime LTS soportado. Go se añade solo si el equipo puede mantener una implementación comparable.
- Mismo host/container CPU/RAM, DB, schema, pool, datos, payload, límites, TLS, logging y load-generator. Misma semántica de auth y tenancy.
- Ejecutar cold start y warmup; carga sostenida y burst; al menos cinco corridas medidas, registrar dispersión, hardware, image digests, lockfiles y comando.

### Frontend
- Construir en Angular 22 y una alternativa React estable solo tres journeys equivalentes: bandeja de Inbox list/detail, formulario CRM con validaciones y dashboard tabular.
- Comparar initial bundle/route chunk, time-to-interactive/LCP medido localmente, memory, navegación lazy, test setup, WCAG keyboard/screen reader y tiempo real de desarrollo.
- Misma API/mock, dataset, viewport y hardware. No comparar una app Angular completa con un ejemplo React vacío.

### Protocolos
- REST/OpenAPI: consulta y comando idempotente del vertical slice.
- GraphQL: query equivalente de dashboard/composición y una mutation con misma policy.
- gRPC: solo comparación interna service boundary con un gateway/proxy browser cuando aplique; documentar el coste adicional del gRPC-Web.
- Comparar latencia p50/p95/p99, throughput, CPU/RSS, bytes wire, tamaño/complexity contractual, observabilidad, authz, cache y coste operativo.

### Criterio
Antes de lanzar benchmark, el architect fija hipótesis y umbral de cambio. Cualquier alternativa solo reemplaza la recomendación si:
1. pasa exactamente los mismos tests funcionales/seguridad/tenant-isolation;
2. no reduce accesibilidad ni trazabilidad;
3. demuestra mejora repetida por encima de la variabilidad en latencia/recursos/coste o productividad;
4. no incrementa complejidad/coste total de operación por encima del beneficio;
5. tiene review independiente y ADR superseding.
No alterar el resultado después de ver los datos para favorecer una tecnología.

## 9. SP-09 — Valkey, licencia y compatibilidad Redis protocol

- Revisar la licencia de la distribución/tag exacto y conservar notice/SBOM.
- Probar el cliente Node elegido, ACL, TLS, TTL, pipelines, Lua/scripts, pub/sub y comandos usados por rate-limit/locks.
- Comparar eviction, persistence config, failover y recovery; cache no durable debe poder reconstruirse.
- Validar que ninguna dependencia use feature propietaria de Redis sin port.
- Criterio: tests de contrato y seguridad pasan; no se accede a una licencia/feature comercial sin aprobación.

## 10. SP-10 — Matriz de versiones y soporte exacto

En checkout limpio y con lockfile:
- Node 26.x + TypeScript 6.0.x + Nest 12.x + Angular 22.x + Nx 24.x + pnpm exacto.
- PostgreSQL 18.x + Valkey 9.1.x + RabbitMQ 4.4.x + Keycloak 26.8.x + Traefik 3.7.x + Compose 5.7.x.
- Verificar builds de Nest API/worker/scheduler y Angular; unit/integration tests; migrations; contract validators; Docker image compatibility; security scans.
- Registrar CVEs conocidos, EOL/community support, license, upgrade path, image digests y lockfiles. No usar un tag latest en evidencia.

## 11. Estado de ejecución actualizado

A 2026-11-06 la rama inspeccionada de GitHub contiene documentación, contracts/ y guías, pero no existen aún apps/, libs/, src/, package.json, pnpm-lock.yaml, Docker Compose del proyecto ni prototipo ejecutable. Por tanto no se pudo ejecutar SP-01..SP-10, no hay build ni benchmark medido y TASK-039/G0 permanece pendiente. El registro Node 22/npm 10 de auditorías anteriores no es evidencia del VPS ni del stack objetivo Node 26.


## 12. Ejecución y auditoría estática — 2026-11-06

La inspección de esta sesión está registrada en [docs/54](54-TASK-039-EXECUTION-AND-CONSISTENCY-REPORT.md). Resultado: **TASK-039 bloqueada para ejecución SP-01..10; G0 no verificado**. Se pudo auditar documentalmente baseline, APIs/eventos y grafo de tareas, pero no se ejecutaron servicios ni benchmarks: no hay Node 26, pnpm, Docker/Compose, PostgreSQL, RabbitMQ, Keycloak ni workspace ejecutable del proyecto. No se reporta PASS de runtime.

Auditoría estática: 80/80 TASK en backlog y matriz individual; 297 operationIds/API IDs únicos; 5 design-frozen + 292 catalog-only; 55 canales/payloads y 55 definiciones JSON Schema. No hay dependencias TASK inexistentes ni ciclos en el grafo declarado. Se detectaron mapeos obsoletos SP-01..07/ADR-011..020 en docs/46 y docs/47, y FE-FOUNDATION no normalizado para TASK-046/064; ver docs/53 y docs/54. El envelope genérico permite tenantId null, pero los 55 eventos de dominio exigen UUID no nulo.
