# 51 — Evaluación comparativa del stack y baseline de versiones

**Corte de evidencia:** 2026-11-06.  
**Estado:** decisión arquitectónica razonada; validación práctica pendiente de TASK-039/G0.  
**Alcance:** backend, frontend, monorepo, datos, mensajería, identidad, edge, despliegue, observabilidad y pruebas.

> **Conclusión de rigor:** no existe una tecnología universalmente “la mejor”. Este documento demuestra por qué el stack recomendado encaja mejor con los requisitos conocidos de WhatsBusiness frente a alternativas concretas. No afirma que haya ganado benchmarks, auditorías de producción o pruebas de carga todavía no ejecutadas. El spike puede confirmar, ajustar o revocar cada decisión.

## 1. Requisitos que condicionan la decisión

La selección parte de estas características:
1. SaaS multi-tenant con aislamiento fuerte, RBAC/ABAC, agencias con grants delegados y auditoría.
2. Muchos adaptadores HTTP/webhooks de Meta y otros proveedores, con expiraciones, límites, reintentos, callbacks y estados asíncronos.
3. CRM relacional, pipelines, conversaciones, mensajes, leads, aprobaciones, ledger de consumo/costes y trazabilidad histórica.
4. Procesos API, webhook ingress, workers y scheduler con posibilidad de escalar por separado.
5. Frontend de back-office complejo: Inbox, CRM, formularios, tablas, permisos, operaciones y analítica.
6. Monorepo greenfield implementado por equipo humano y agentes; modularidad, límites de dependencias y reutilización son requisitos explícitos.
7. Inicio en VPS/piloto con presupuesto y capacidad todavía no medidos; evitar microservicios, proveedores y herramientas que eleven el coste operativo sin demostrar beneficio.
8. Evolución a volumen mayor y posible extracción futura de bounded contexts sin reescribir las reglas de negocio.

### Criterios usados

| Criterio | Prioridad | Qué significa para el producto |
|---|---|---|
| Integración y asincronía | Crítica | HTTP, OAuth, webhooks, callbacks, workers, retries y proveedores externos |
| Integridad y aislamiento | Crítica | transacciones, constraints, tenant context, RLS, auditoría y permisos |
| Modularidad mantenible | Crítica | ownership por bounded context, límites verificables y poco acoplamiento |
| Productividad de todo el equipo | Alta | un lenguaje y contratos compartidos, tooling legible y agentes gobernables |
| Operabilidad/coste inicial | Alta | despliegue reproducible, huella medible y pocos servicios obligatorios |
| Escalado evolutivo | Alta | poder escalar API/workers y extraer servicios solo con evidencia |
| Ecosistema y soporte | Alta | releases soportados, librerías activas, migraciones y seguridad |
| Rendimiento puro | Condicional | debe medirse con el workload real; no es un ranking de benchmarks genéricos |

No asignamos puntos numéricos fingiendo precisión. Sin workload común, hardware fijado y tests repetibles, una matriz numérica sería opinión disfrazada de medición.

## 2. Lenguaje y runtime de backend

### Decisión recomendada

**TypeScript 6.0.x en modo strict sobre Node.js 26.x Active LTS**, con el dominio independiente de NestJS, drivers y SDKs concretos.

Node.js 26 entró en Active LTS el 28 de octubre de 2026 y su fecha publicada de fin de vida es el 30 de abril de 2029. Angular 22 acepta Node 26 y TypeScript 6.0, por lo que frontend y backend pueden compartir una línea de runtime/lenguaje. NestJS 12 documenta Node 26 entre las versiones aceptadas por su CLI actual.  
Fuentes: https://github.com/nodejs/Release#release-schedule ; https://nodejs.org/en/about/previous-releases ; https://angular.dev/reference/versions ; https://docs.nestjs.com/migration-guide

### Alternativas consideradas

| Opción | Ventajas reales | Coste/limitación en WhatsBusiness | Veredicto |
|---|---|---|---|
| TypeScript + Node | mismo lenguaje principal que Angular; buen modelo para alto número de operaciones de I/O, webhooks y llamadas a proveedores; ecosistema amplio; tooling común | el chequeo TypeScript es previo a ejecución y no sustituye validación runtime; trabajo CPU intensivo puede bloquear el event loop | **Mejor ajuste inicial condicionado** |
| C# + ASP.NET Core | tipado fuerte, runtime maduro, stack empresarial y muy buen candidato para APIs/servicios de alto rendimiento | segundo lenguaje y toolchain respecto al Angular elegido; menor reutilización del conocimiento y tipos de frontend | alternativa más fuerte si benchmarks/equipo favorecen .NET |
| Java + Spring Boot | ecosistema empresarial maduro, seguridad, transacciones, DI y tooling robusto | segundo runtime/ecosistema; mayor complejidad inicial para el equipo de arranque; footprint debe medirse | válido, sin ventaja demostrada suficiente para el primer corte |
| Go | binarios y despliegue sencillos, concurrencia y footprint potencialmente bajos | más integración/tooling duplicado con Angular; no comparte contratos de tipos directamente | candidato si el perfil operativo/CPU lo exige |
| Python + FastAPI | fuerte para ML, data science, prototipos y herramientas IA | menos adecuado como backend único para API, OAuth, workflow, permisos, CRM y transacciones; exige disciplina equivalente en contratos/validación | reservar para procesos analíticos/IA si se demuestra beneficio |

**Por qué TypeScript aquí:** la carga principal prevista es I/O-bound: hablar con Meta, DB, cache y broker, validar permisos, persistir resultados y coordinar trabajos. La reutilización de esquemas/SDKs tipados, el conocimiento compartido con Angular y la coherencia del equipo reducen duplicación y coste cognitivo. No afirmamos que TypeScript sea más rápido que Go, Java o .NET.

**Riesgo que debe respetarse:** Node ejecuta callbacks JavaScript en un event loop. Trabajo pesado o de duración variable puede bloquear otros requests. Cálculos intensivos, procesamiento pesado de media o jobs CPU-bound deben ir a workers aislados o a un componente especializado, nunca ejecutarse sin límites en el event loop de la API.  
Fuente: https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop

TypeScript tampoco valida datos externos automáticamente: toda entrada de HTTP, cola, webhook, DB y proveedor debe pasar runtime validation. Los types no son una frontera de seguridad.  
Fuente: https://www.typescriptlang.org/docs/handbook/intro

## 3. Framework de backend: NestJS 12.x

Nest ofrece módulos, providers/DI, controllers, guards, pipes, interceptors y testing abstractions. Sus módulos encapsulan capacidades relacionadas y exports/imports explícitos; ese modelo puede alinearse con bounded contexts, ports y adapters.  
Fuentes: https://docs.nestjs.com/modules ; https://docs.nestjs.com/first-steps

| Framework/estilo | Adecuación | Decisión |
|---|---|---|
| NestJS 12 | estructura opinionada, módulos y DI; guards/pipes/interceptors; integración con Node | **Elegido para el monolito modular** |
| Fastify sin Nest | pequeño y centrado en HTTP, buen control del pipeline | buen transport/adaptor candidato; no proporciona por sí solo los límites de dominio/DI que queremos imponer |
| Express sin Nest | familiar, ecosistema grande y fácil de iniciar | menos estructura prescrita; requiere aplicar manualmente arquitectura y boundaries |
| Koa/Hono u otro microframework | ligero y simple para servicios pequeños | traslada mucha composición y disciplina a cada equipo/agente |
| ASP.NET Core / Spring | alternativas empresariales robustas | implican cambiar lenguaje/runtime y validar con un spike comparativo antes de reemplazar Nest |

**Versión recomendada:** NestJS **12.x**, con ESM y patch estable compatible fijado en lockfile. Evaluar el adapter HTTP **Fastify** contra el adapter por defecto en SP-08; no elegirlo por una afirmación de rendimiento sin benchmark y compatibility tests de plugins/middleware. La versión del framework no debe confundirse con la versión de Node.

**Regla anti-espagueti:** controllers solo hacen transporte/validación/mapeo; el caso de uso coordina; las invariantes son del dominio; ports pertenecen a application/domain; adapters implementan ports. NestJS no convierte automáticamente un diseño en modular: Nx boundaries, tests y review de docs/48 son gates.

## 4. Frontend: Angular 22.x

WhatsBusiness no es principalmente una página pública de marketing. Es una aplicación empresarial autenticada con Inbox, CRM, pipelines, dashboards, formularios, administración, configuración, permisos y flujos operativos.

| Opción | Ventajas reales | Coste/limitación en este producto | Veredicto |
|---|---|---|---|
| Angular 22 | framework integral; componentes encapsulados, DI, routing, reactive forms, signals, lazy loading y estructura coherente | mayor curva inicial y framework más prescriptivo; controlar bundle y compatibilidad de dependencias | **Mejor ajuste para una consola multi-dominio** |
| React 19.3.x | ecosistema y comunidad muy amplios, flexible, buen modelo de componentes | es una biblioteca de UI; router, forms, data fetching, state, architecture y conventions requieren seleccionar/estandarizar más piezas | alternativa viable; más decisiones de composición |
| Vue 3 | curva inicial más simple, Composition API, buen ecosistema | sigue necesitando acordar router, forms, state, conventions y boundaries para una consola compleja | alternativa viable, no elegida |

Angular ofrece componentes, Signals, SSR/hydration y dependency injection; sus reactive forms están orientados a modelos explícitos, validación y formularios escalables/reutilizables. Eso coincide con CRM, onboarding de activos y flujos de configuración.  
Fuentes: https://angular.dev/overview ; https://angular.dev/guide/forms ; https://angular.dev/guide/forms/reactive-forms

**Versión recomendada:** Angular **22.x** (minor estable soportada al bootstrap), TypeScript 6.0.x y RxJS dentro del rango oficial de compatibilidad. La matriz oficial publicada para Angular 22 indica Node ^26.0.0 y TypeScript >=6.0.0 <6.1.0; tomar el patch Angular vigente y lockfilear todas las dependencias compatibles.  
Fuentes: https://angular.dev/reference/versions ; https://angular.dev/reference/releases

No usar guards de Angular como control de seguridad. Backend sigue siendo la autoridad para actor, tenant, grants y permisos.

## 5. Monorepo y package manager: Nx 24.x + pnpm

**Nx** aporta project graph, task graph, ejecución de tareas afectadas y enforcement de boundaries mediante tags y reglas de imports. Eso es especialmente relevante para impedir que un agente importe un archivo privado de CRM en Inbox, que frontend dependa de drivers del backend o que un shared lib se convierta en depósito de cualquier código.  
Fuentes: https://nx.dev/docs/features ; https://nx.dev/docs/features/enforce-module-boundaries

**pnpm** administra workspaces y lockfile; se fija la versión exacta en Corepack/packageManager y se instala de forma reproducible con frozen-lockfile. Ningún agente debe actualizar Nx, plugins @nx/* ni toolchain de manera aislada: todos los paquetes Nx deben permanecer alineados.

**Versión recomendada:** Nx **24.0.4** como snapshot estable consultado el 6-nov-2026; pnpm en la última versión estable verificada y compatible al bootstrap, fijada exactamente en packageManager y pnpm-lock.yaml. SP-01 debe verificar la pareja exacta Nx 24 + Node 26 en CI y checkout limpio.  
Fuentes: https://github.com/nrwl/nx/releases ; https://nx.dev/docs/technologies/node/introduction

No activar Nx Cloud ni servicios de cache remoto de pago sin aprobación del coste; el cache local y el project graph bastan para el primer corte.

## 6. Persistencia: PostgreSQL 18.x

PostgreSQL encaja mejor que una base documental como fuente de verdad para tenants, memberships, grants, CRM, pipeline, conversaciones, estados, ledger, permisos y auditoría: hay relaciones, constraints, transacciones, unicidad namespaced y estados que necesitan consistencia.

RLS aporta defensa adicional: las políticas limitan qué filas se pueden leer/modificar y, sin política aplicable, el comportamiento es default-deny; roles superuser o BYPASSRLS pueden saltarse esas protecciones, por lo que el rol de app debe separarse de owner/migrator. RLS no reemplaza autorización de negocio ni tests con pooling.  
Fuentes: https://www.postgresql.org/docs/18/ddl-rowsecurity.html ; https://www.postgresql.org/docs/release/

**Versión recomendada:** PostgreSQL **18.x**, patch estable más reciente disponible y soportado al bootstrap (18.6 figura en el registro de releases consultado). JSONB se usa para atributos de integración flexibles, no para reemplazar relaciones, constraints ni un modelo relacional de negocio.

## 7. Cache y coordinación: Valkey 9.1.x (cambio frente a Redis)

Se cambia el candidato anterior Redis por **Valkey 9.1.x** para cache, rate limit, locks efímeros y coordinación no durable. Valkey 9.1.3 fue publicado el 26-oct-2026 y usa licencia BSD. Redis 8 está disponible bajo una tri-licencia RSALv2, SSPLv1 o AGPLv3; eso requiere análisis legal/operativo antes de adoptar Redis en un SaaS. La razón del cambio es reducir ambigüedad de licencia, no una afirmación de que Valkey sea siempre más rápido.  
Fuentes: https://valkey.io/download/releases/ ; https://valkey.io/ ; https://redis.io/legal/licenses/

- Cache nunca es fuente de verdad ni ledger.
- Ningún permiso/capability puede permanecer cacheado tras revocación más allá del mecanismo de invalidación/TTL seguro aprobado.
- No meter tokens ni PII en keys; claves namespaced por tenant y purpose.
- Verificar compatibilidad de comandos/clientes/scripts usados; no asumir compatibilidad completa solo porque comparten protocolo.
- Si una función requerida solo existe en Redis y no en Valkey, reabrir ADR-025 con evidencia y revisión legal.

## 8. Broker: RabbitMQ 4.4.x

RabbitMQ se adapta a colas de trabajo y eventos internos con routing, acknowledgements manuales, publisher confirms, retries y DLQ. Su documentación destaca que publisher confirms y consumer acknowledgements son necesarios para garantías de entrega; las quorum queues replican a un quorum y ofrecen dead-lettering at-least-once con configuración explícita.  
Fuentes: https://www.rabbitmq.com/docs/confirms ; https://www.rabbitmq.com/docs/quorum-queues

| Alternativa | Cuándo sería mejor | Por qué no ahora |
|---|---|---|
| RabbitMQ | routing de jobs/webhooks/commands, consumers independientes, ack/retry/DLQ | **Elegido** |
| Kafka/Redpanda | log de eventos de alto volumen, retención/replay extensos, analytics/stream processing | añade operación que la primera versión aún no justifica |
| Redis Streams | streams simples/consumer groups en infraestructura Redis-compatible | no sustituye la política de durabilidad/routing/HA de RabbitMQ ni el outbox de PostgreSQL |
| Cloud queue | equipo pequeño que prioriza servicio gestionado y ya tiene proveedor cloud aprobado | compromete proveedor/coste/transferencia; se evalúa cuando exista decisión comercial |

**Versión recomendada:** RabbitMQ **4.4.x** con patch vigente. Su calendario oficial indica community support hasta 31-jul-2027 para la serie 4.4; calendarizar upgrade antes de esa fecha. Para durabilidad: outbox en la misma transacción PostgreSQL, publisher confirms, durable/quorum queues donde corresponda, ACK manual después de commit y dedupe persistente.  
Fuente: https://www.rabbitmq.com/release-information

No prometer exactly-once end-to-end.

## 9. Identidad: OIDC + Keycloak 26.8.x

OIDC evita construir login, credenciales, MFA, discovery y JWKS validation internamente. Keycloak aporta IdP self-hosted y endpoints estándar; se integra por el protocolo y discovery, no por acoplamiento a tablas o clases internas de Keycloak.  
Fuente: https://www.keycloak.org/securing-apps/oidc-layers

**Versión recomendada:** Keycloak **26.8.2** como release consultado. Revisar CVEs, patch y estrategia de upgrades antes de cada despliegue. El coste real es operación: MFA, realm config, backup/restore, upgrade, availability, mail delivery y incident response. Si no hay capacidad SRE para operar IdP crítico, un IdP gestionado puede ser más seguro; requiere aprobación de proveedor, coste y transferencia de datos. Nunca construir auth propia.

## 10. Edge, contenedores y despliegue

- **Traefik 3.7.x:** ingress/reverse proxy inicial por routing, TLS y middlewares. La línea 3.7 figura en soporte activo y de seguridad. Fuente: https://doc.traefik.io/traefik/deprecation/releases/
- **Docker + Compose 5.7.0:** reproducibilidad local y laboratorio/piloto single-node; Compose no da alta disponibilidad ni reemplaza orquestación/failover. Compose 5.7.0 fue publicada el 2-nov-2026. Fuente: https://github.com/docker/compose/releases
- Producción: topología, orchestrator, HA y proveedor quedan sujetos a TASK-039/060/061, RTO/RPO, coste y aprobación humana. No adoptar Kubernetes como default solo por expectativa de escala.

## 11. Observabilidad: OpenTelemetry + Prometheus + Grafana

OpenTelemetry aporta APIs/SDKs/Collector neutrales para generar, procesar y exportar traces, metrics y logs, reduciendo acoplamiento al proveedor. Prometheus es backend de métricas y Grafana ofrece dashboards/alertas; logs/traces deben seleccionarse tras medir volumen, cardinalidad, retención y coste.  
Fuentes: https://opentelemetry.io/docs/ ; https://opentelemetry.io/docs/concepts/instrumentation/ ; https://prometheus.io/download/

**Versión recomendada:** Prometheus **3.16.0** (publicado el 4-nov-2026); versionar y fijar Grafana/Collector en manifiesto de infra después de comprobar compatibilidad. No autoalojar todos los componentes en el mismo VPS sin medir huella. Nunca usar PII, tokens, teléfonos o contenido de mensajes en labels.

## 12. Contratos y pruebas

- **HTTP:** REST/JSON con OpenAPI 3.1.x como contrato. Mantener la versión concreta compatible con validator, generator y client tooling del repo; no subir a OpenAPI 3.2 solo por ser revisión más reciente sin probar tooling.
- **Eventos:** AsyncAPI + JSON Schema. El archivo actual AsyncAPI 2.6.0 se conserva hasta probar validación/codegen; migración a 3.0 requiere un cambio contractual revisado.
- **Pruebas:** unit + integration + contract + E2E con Vitest/Jest según compatibilidad del framework, Testcontainers para dependencias reales, Playwright para journeys web; versionar tooling en lockfile.
- **CI:** OpenAPI/AsyncAPI/schema validation, secret scan, SCA/SAST, SBOM, Nx boundaries, import-cycle detection y contract drift son gates.

## 13. Qué se demuestra y qué falta demostrar

| Afirmación | Evidencia disponible | Estado |
|---|---|---|
| Node 26 es LTS soportada y compatible con Angular 22 | calendarios oficiales Node y matriz Angular | **Documentado** |
| Nest 12 puede ejecutarse con Node moderno 26 | requisitos oficiales CLI/runtime | **Documentado; build real pendiente** |
| Angular 22 acepta TypeScript 6.0 y Node 26 | matriz oficial Angular | **Documentado** |
| Nx 24 es release actual del corte | release publicado el 3-nov-2026 | **Documentado; compatibilidad workspace exacta pendiente** |
| PostgreSQL 18 permite RLS | documentación oficial | **Documentado; aislación de pooling sin ejecutar** |
| RabbitMQ puede usar quorum/confirm/ack/DLX | documentación oficial | **Documentado; crash/replay real pendiente** |
| Valkey es candidato con licencia BSD | fuentes oficiales de Valkey | **Documentado; compatibilidad de comandos pendiente** |
| El stack consume menos y cuesta menos que competidores | no hay benchmark común ni hardware objetivo | **No demostrado** |
| Esta combinación es la más productiva para los agentes/equipo | razonamiento de cohesión y límites; no hay estudio del equipo | **Hipótesis, validar en SP-01** |
| Satisface carga real de producción | no existen pruebas ni datos de tráfico | **No demostrado** |

## 14. Decisión resultante

Adoptar TypeScript 6.0 + Node 26 LTS + NestJS 12 + Angular 22 + Nx 24 + pnpm, PostgreSQL 18, Valkey 9.1, RabbitMQ 4.4, OIDC/Keycloak 26.8, Traefik 3.7, Docker Compose 5.7 y OpenTelemetry/Prometheus 3.16 como **baseline recomendada de arranque**.

No se declara ganadora por benchmark. El primer scaffold productivo solo se autoriza cuando G0/TASK-039 pase: build limpio, compatibility matrix, RLS/pooling, outbox/broker, webhook durable, backup/restore, footprint y revisión independiente. Si una prueba falla, la tecnología o versión se reemplaza mediante ADR; no se fuerza a producción.

## Fuentes primarias consultadas

- Node.js release schedule: https://github.com/nodejs/Release#release-schedule
- Node.js releases: https://nodejs.org/en/about/previous-releases
- Node.js event loop guidance: https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop
- NestJS 12 migration requirements: https://docs.nestjs.com/migration-guide
- NestJS modules: https://docs.nestjs.com/modules
- Angular version compatibility: https://angular.dev/reference/versions
- Angular release schedule: https://angular.dev/reference/releases
- Angular forms/overview: https://angular.dev/guide/forms ; https://angular.dev/overview
- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro
- Nx releases/boundaries: https://github.com/nrwl/nx/releases ; https://nx.dev/docs/features/enforce-module-boundaries
- PostgreSQL 18 RLS: https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- PostgreSQL releases: https://www.postgresql.org/docs/release/
- Valkey releases/license: https://valkey.io/download/releases/ ; https://valkey.io/
- Redis licensing: https://redis.io/legal/licenses/
- RabbitMQ release/support: https://www.rabbitmq.com/release-information
- RabbitMQ confirms/quorum queues: https://www.rabbitmq.com/docs/confirms ; https://www.rabbitmq.com/docs/quorum-queues
- Keycloak OIDC: https://www.keycloak.org/securing-apps/oidc-layers
- Traefik releases/support: https://doc.traefik.io/traefik/deprecation/releases/
- Docker Compose releases: https://github.com/docker/compose/releases
- OpenTelemetry: https://opentelemetry.io/docs/
- Prometheus releases: https://prometheus.io/download/
