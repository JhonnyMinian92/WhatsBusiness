# 54 — Informe de ejecución TASK-039 y auditoría de consistencia TASK-001..080

**Fecha de auditoría:** 2026-11-06 (corte documental del repositorio).  
**Rama:** environment/local · **Base:** b170835ccb4961b5a8222eea80ede351587dc4d4.  
**Resultado:** BLOCKED — TASK-039 no verificada; G0 no pasa. La auditoría estática y la normalización de handoff se completan; pruebas de runtime que requieren servicios/hardware no se ejecutaron.

## 1. Entorno y alcance realmente ejecutado

La inspección no encontró workspace ejecutable del proyecto: sin apps/, libs/, src/, package.json, pnpm-lock.yaml ni Docker Compose del proyecto. Este entorno tiene Linux kernel 6.18.57, Node.js v22.16.0, npm 10.9.2 y Corepack; no se encontraron pnpm, Docker/Compose, PostgreSQL/psql ni RabbitMQ. No hay VPS/hardware objetivo suministrado. Estos datos describen solo el entorno de auditoría.

No se ejecutaron build, lint, typecheck, unit/integration/E2E, benchmarks, RLS/pooling, crash/replay, Keycloak, Valkey ni restore. No se reporta ningún PASS de runtime.

## 2. Estado por experimento SP-01..10

| Experimento | Estado | Evidencia documental | Qué falta ejecutar |
|---|---|---|---|
| SP-01 Nx + pnpm workspace | BLOCKED | Baseline docs/51 y runbook docs/45 | Node 26, pnpm exacto, Nx 24, Nest 12, Angular 22; frozen install/build/lint/typecheck/tests/boundaries |
| SP-02 PostgreSQL 18 + RLS + pool | BLOCKED | ADR-013, docs/42/45 | rol runtime no superuser/BYPASSRLS; dos tenants; tenant context transaction-local; pool reuse A/B; ausencia/contexto falso/cross-tenant |
| SP-03 Outbox + RabbitMQ 4.4 | BLOCKED | ADR-014, docs/43/45, AsyncAPI | publisher confirms, durable/quorum queue, manual ACK, caída antes/después publish, duplicate/poison/DLQ/replay |
| SP-04 Webhook durable inbox | BLOCKED | docs/43/45, TH-004 | firma, límites, dedupe, worker down; ACK solo tras commit durable |
| SP-05 Keycloak 26.8 / OIDC | BLOCKED | docs/51 y ADR OIDC | issuer/audience/expiry/JWKS, token inválido/expirado, membership revocada |
| SP-06 Backup/restore PostgreSQL | BLOCKED | docs/42/44/45 | backup cifrado, host limpio, schema/filas/constraints/outbox/inbox, RPO/RTO medidos |
| SP-07 VPS footprint | BLOCKED | sin hardware objetivo | Compose + carga sintética + VPS; RSS/CPU/IO/network/start/restart/saturación |
| SP-08 backend/frontend/protocolos | BLOCKED | docs/51/52 | workloads idénticos, 5+ corridas, .NET/React/GraphQL/gRPC como comparadores, p50/p95/p99/throughput/RSS/bundle/bytes |
| SP-09 Valkey 9.1 | BLOCKED | docs/51/45 y ADR-025 | cliente, ACL/TLS/TTL/pipeline/Lua/pubsub/rate-limit/locks/failover y licencia del tag exacto |
| SP-10 matriz exacta de versiones | BLOCKED | baseline documental docs/51 | checkout limpio, lockfile, image digests, builds, migrations, tests, SCA/CVE/SBOM |

## 3. Evaluación de arquitectura y stack

| Decisión | Evaluación documental | Validación técnica |
|---|---|---|
| Modular monolith; API/worker/scheduler; ports/use cases internos | Coherente, evita microservicios prematuros | No implementado ni medido |
| REST/OpenAPI síncrono; RabbitMQ/AsyncAPI async; sin GraphQL/gRPC primarios | Coherente con ADR-023 y consumidores | Sin workload comparable |
| PostgreSQL 18 + tenant_id + RLS | Defensa en profundidad si rol runtime no bypass y contexto transaction-local | No probado con pool |
| RabbitMQ 4.4 + outbox/inbox + at-least-once | Patrón consistente; no prometer exactly-once | No probado bajo crash/restart/DLQ |
| Valkey 9.1 para cache/locks efímeros | Candidato por licencia/compatibilidad, nunca source of truth | No probado |
| Node 26 / TS6 / Nest12 / Angular22 / Nx24 | Baseline documental | Sin frozen install/build |
| Keycloak 26.8 OIDC | Encaja si se opera y recupera el IdP | No probado |
| Compose/Traefik/observabilidad | Adecuado para laboratorio/piloto single-node, no HA | Sin despliegue/footprint |

No se recomienda cambiar ADR-011..025 por intuición. Son dirección provisional documentada, no compatibilidad certificada. Ajustar mediante evidencia SP, reviewer independiente y ADR superseding.

### 3.1 Cross-check documental con fuentes oficiales (no runtime)

Se contrastó la baseline con las fuentes oficiales disponibles al corte:

| Componente | Verificación documental | Límite |
|---|---|---|
| Node.js 26 | Active LTS desde 2026-10-28; EOL publicado 2029-04-30 | El host de esta sesión sigue en Node 22.16.0 |
| Angular 22.0.x + TypeScript 6.0.x | Angular declara Node ^26.0.0 y TypeScript >=6.0.0 <6.1.0; RxJS ^6.5.3 o ^7.4.0 | Compatibilidad de las dependencias Angular seleccionadas y build de workspace pendientes |
| NestJS 12 | Nest CLI/schematics requiere Node 22.22.3+, 24.15+ o 26+; schematics v12 exige TypeScript 6.0 peer compatible. El runtime de la app tiene mínimo menor que el CLI | Instalar/ejecutar generators, API/worker/tests en Node 26 todavía pendiente |
| Nx 24 | Nx 24 figura como major Current desde 2026-10-21; paquetes nx/@nx deben estar lockstep | La página de compatibilidad Node menciona Node 26 probado/soportado, pero su tabla explícita lista Nx 23.x y 22.x, no Nx 24. Por rigor, Node 26 + Nx 24.0.4 sigue como SP-10 BLOCKED hasta frozen install/build/generate/tests |
| PostgreSQL 18 | La lista oficial incluye 18.6 como patch más reciente en el corte consultado | No valida RLS, driver, pooling ni restore |
| RabbitMQ 4.4 | 4.4.0 publicado 2026-10-20; community support hasta 2027-07-31 | Programar upgrade antes del fin de community support; crash/replay/DLQ siguen sin prueba |
| Valkey 9.1 | 9.1.3 publicado 2026-10-26; tags oficiales 9.1.3 | La compatibilidad de comandos, scripts y cliente del proyecto sigue pendiente |
| Keycloak 26.8 | Release line 26.8 y notas 26.8.2 disponibles | No se probó OIDC, upgrades ni restore |
| Docker Compose 5.7.0 | Release oficial 2026-11-02 | No hay Docker Engine/Compose en este entorno |
| Prometheus 3.16.0 | Release oficial 2026-11-04 | No se probó integración/huella con OTel/Grafana |

**Conclusión de compatibilidad:** la matriz Node 26 + Angular 22 + TypeScript 6 + Nest 12 tiene soporte documental explícito suficiente para seguir como candidata. Nx 24 es una versión actual soportada, pero la tabla pública Node/Nx no es perfectamente consistente respecto al major 24; se mantiene una condición SP-10 específica para probar la combinación exacta. Ninguna fuente oficial reemplaza el frozen install, generators, build y test real del workspace.

Fuentes primarias consultadas:
- Node.js release schedule: https://github.com/nodejs/Release#release-schedule
- Angular version compatibility: https://angular.dev/reference/versions
- NestJS 12 migration/Node requirements: https://docs.nestjs.com/migration-guide
- Nx Node compatibility: https://nx.dev/docs/technologies/node/introduction
- Nx release/support policy: https://nx.dev/docs/reference/releases
- PostgreSQL releases: https://www.postgresql.org/docs/release/
- RabbitMQ release/support: https://www.rabbitmq.com/release-information
- Valkey 9.1: https://valkey.io/download/9.1/
- Keycloak release notes: https://www.keycloak.org/docs/latest/release_notes/
- Docker Compose releases: https://github.com/docker/compose/releases
- Prometheus releases: https://prometheus.io/download/

## 4. Auditoría estática TASK, dependencias y contratos

| Comprobación | Resultado |
|---|---:|
| TASK únicas en backlog | 80/80, TASK-001..080 |
| TASK presentes en matriz individual docs/47 §7.2 | 80/80 |
| Dependencias TASK declaradas (aristas) | 187 |
| Dependencias TASK con referencias inexistentes | 0 |
| Ciclos en dependencias TASK declaradas | 0; grafo topológicamente ordenable |
| Operaciones OpenAPI con operationId | 297 |
| API IDs OpenAPI únicos | 297/297 |
| OpenAPI | 5 design-frozen + 292 catalog-only |
| x-implementation-allowed=true | 0 |
| Canales AsyncAPI | 55 (55 publish + 55 subscribe) |
| Payload refs AsyncAPI | 55 |
| Definiciones JSON Schema de eventos | 55 |
| Payload refs sin definición / definiciones huérfanas | 0 / 0 |

La comprobación es estática por lectura/conteo; no equivale a lint/parse completo OpenAPI/AsyncAPI ni meta-validation de JSON Schema con resolver de referencias. Los JSON schemas se parsearon correctamente; no se ejecutó validador contractual CI.

## 5. Hallazgos de consistencia

1. docs/47 §7.2 describía TASK-039 como SP-01..07 y ADR-011..020, mientras docs/45/docs/11 exigen SP-01..10 y ADR-011..025. Se alinea a SP-01..10/ADR-011..025.
2. docs/46 WP-039 describía SP-01..07. Se alinea a SP-01..10 y revisión por QA/SRE independiente.
3. TASK-046 y TASK-064 dependen de “frontend foundation” sin ID ni DoD normalizado. docs/53 registra FE-FOUNDATION como prerequisito explícito; no está satisfecho.
4. SP-08 compara backend (.NET), frontend (React) y protocolos GraphQL/gRPC solo bajo workloads equivalentes. Ninguna alternativa gana sin mismos tests, 5+ corridas, dispersión y review.
5. Envelope genérico permite tenantId null para eventos globales; las 55 definiciones de dominio fuerzan UUID no nulo. No es contradicción en payloads actuales: los eventos catalogados son tenant-scoped. Eventos globales requieren tipo/schema separado.
6. OpenAPI no equivale a contrato implementable: 292 rutas catalog-only requieren schemas completos y gates antes de codificar.
7. 55 eventos documentados no prueban producers, consumers, topology, DLQ, replay ni idempotencia runtime.
8. docs/11 aporta DoD por TASK y docs/10/domain specs aportan AC por story; no existe ID AC independiente para cada TASK. docs/53 exige Given/When/Then y TEST IDs antes de implementar, sin inventar AC IDs retroactivamente.
9. Roles sugeridos no son asignaciones reales. No hay roster/reviewer independiente demostrado; WP-039 no pasa el requisito de revisión independiente.

## 6. Semántica de tenantId en eventos

El envelope común acepta tenantId UUID o null para permitir extensión global deliberada. Las 55 definiciones de domain-events-v1.schema.json fuerzan tenantId UUID. Por tanto:
- los eventos actuales del catálogo son tenant-scoped;
- consumer valida tenant/membership/ownership; tenantId no es autorización;
- eventos globales futuros requieren tipo, schema, producer policy y tests separados.

## 7. Paquetes de trabajo y G0

Se creó [docs/53 — Registro de paquetes TASK-001..080](53-TASK-WORK-PACKAGES.md): owner role sugerido, dependencias, API IDs/entregables, eventos AsyncAPI y DoD por tarea; define inputs, pruebas, no-overlap, reutilización, handoff y FE-FOUNDATION. Los owners/reviewers reales siguen sin asignar.

**G0: BLOCKED.** No iniciar scaffold productivo definitivo ni vertical slice integrado. Se permite preparación, review de especificaciones, validadores aislados y laboratorio desechable.

Para desbloquear G0:
1. Host reproducible con Node 26 LTS, pnpm exacto, Docker/Compose y hardware objetivo.
2. SP-01..10 con comandos, lockfiles, patches, image digests y artefactos.
3. RLS/pooling sin filtración; outbox/RabbitMQ/DLQ/replay sin pérdida de committed ni side effects duplicados; webhook ACK después de commit.
4. Backup/restore en host limpio con RPO/RTO medidos; footprint medido sin extrapolar.
5. Validadores OpenAPI/AsyncAPI/JSON Schema; FE-FOUNDATION y AC/TEST IDs normalizados.
6. Reviewer QA/SRE distinto del autor y security review según riesgo; sin segundo agente, self-review y G0 no verificado.
7. ADR-011..025 confirmados o superseded con evidencia; owner approval para costes/proveedor/VPS/producción.

**Estado TASK-039:** auditoría/artefactos estáticos realizados; ejecución SP-01..10 bloqueada; nunca verified ni accepted con la evidencia actual.

## 8. Próximas acciones

- Ejecutar laboratorio desechable bajo spike/** en host con Docker/Compose y VPS de referencia.
- Asignar WP-039 a Architect/Spike Lead y reviewer QA/SRE independiente.
- TASK-040 completa AC Given/When/Then y TEST IDs; cerrar FE-FOUNDATION como paquete habilitador.
- Mantener environment/local; no tocar master/environment/develop, no deploy ni cuentas reales.


## 9. Addendum de revisión de contratos y arquitectura — 2026-11-06

- OpenAPI: se localizaron 292 objetos `responses` con clave YAML `default` duplicada. Se eliminó el placeholder previo y se conservó una única referencia `ContractNotFrozen` por operación. Las 292 operaciones siguen catalog-only y mantienen request/response schema pending; no cambió la autorización de implementación.
- AsyncAPI: cada uno de los 55 canales tiene ahora `publish` y `subscribe`, con 110 operationIds únicos. Los 55 mensajes exponen `correlationId` desde el envelope. Los 55 tipos se corresponden con 55 definiciones JSON Schema.
- Se parsearon los dos JSON schemas como JSON y se comprobaron conteos, unicidad, required fields, cierre de payload y correspondencia channel/message/`$defs` mediante inspección estructural. No se ejecutó parser/linter oficial YAML, JSON Schema validator con fixtures ni contract tests.
- docs/38 y docs/39 proponen 14 nombres de evento adicionales no mapeados a TASK/consumers en docs/47; quedan pendientes de decisión del owner, detallados en docs/50 y docs/56.
- La revisión documental de ADR-011..025, ownership, límites de módulos, multi-tenancy, criterios de aceptación y veredicto GO/NO-GO se documenta en docs/56. No es review independiente ni cambia G0.
