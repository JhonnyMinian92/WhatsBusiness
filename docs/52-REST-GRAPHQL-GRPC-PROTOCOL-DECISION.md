# 52 — Decisión de protocolo API: REST vs GraphQL vs gRPC

**Estado:** decisión recomendada para la primera versión; review contractual pendiente de G0.  
**Corte:** 2026-11-06.  
**Relacionado:** ADR-023, docs/30, docs/43, docs/47, docs/49.

## 1. Decisión ejecutiva

**WhatsBusiness usará REST/JSON como API principal externa y de navegador, OpenAPI como contrato, RabbitMQ/AsyncAPI para trabajo/eventos asíncronos y SSE/WebSocket solo para las necesidades de tiempo real de Inbox.**

No se implementará GraphQL ni gRPC como protocolo principal en el primer corte. No se prohíben para siempre: se reconsideran cuando exista evidencia concreta que pague la complejidad añadida.

La comunicación síncrona entre módulos de un monolito modular debe ser llamada directa a use case/port público dentro del proceso, no llamada REST/gRPC a sí mismo. Los procesos worker consumen eventos/comandos durables vía broker; no se crea una red de microservicios ficticia dentro de un solo deployable.

## 2. Por qué REST es el mejor ajuste inicial

El inventario de docs/47 propone operaciones resource-oriented para identidad, tenancy, conexiones Meta, assets, CRM, conversaciones, pipelines, campañas, billing, privacidad, integradores y approvals. El frontend y los clientes externos pueden consumir contratos HTTP estables y versionados.

REST/HTTP ofrece:
- interfaz uniforme request/response para recursos y comandos;
- semántica estándar de métodos safe/idempotent, status codes, cache validators, conditional requests y headers;
- interoperabilidad simple con browser, mobile, SDKs, integradores y proveedores que ya hablan HTTP/JSON;
- webhooks HTTP de entrada/salida y debugging observable por herramientas convencionales;
- OpenAPI para describir operaciones, schemas, seguridad y generar/documentar clients;
- política explícita de idempotency-key para POST/write side effects;
- compatibilidad con paginación, límites, rate limits y versionado de contrato por API.

HTTP no vuelve idempotente cada POST por sí solo: el contrato de negocio debe declarar idempotency-key, dedupe y reconciliación para writes. RFC 9110 define semánticas safe/idempotent de métodos; se debe aplicar esa semántica correctamente y no reintentar operaciones no-idempotentes a ciegas.

La elección no significa “todo debe ser CRUD”. Comandos de dominio se exponen como endpoints HTTP explícitos (por ejemplo /approve, /send, /sync) cuando su intención no encaja en una actualización genérica de recurso, con autorización/purpose/idempotency/audit.

## 3. Comparación

| Dimensión | REST/JSON | GraphQL | gRPC |
|---|---|---|---|
| Modelo | recursos/representaciones y operaciones HTTP | cliente selecciona campos de un schema tipado de grafo | RPC tipado: servicio, método, request/response |
| Contrato | OpenAPI | GraphQL schema | Protocol Buffers |
| Transporte | HTTP | usualmente HTTP; GraphQL es lenguaje/runtime, no un transporte exclusivo | HTTP/2 en implementaciones habituales |
| Browser | nativo | nativo con HTTP | gRPC-Web requiere gateway/proxy o implementación compatible |
| Cache | semántica HTTP y cache headers/CDN para GET | requiere estrategia por query/client/cache; POST /graphql dificulta caches HTTP convencionales | no está centrado en cache HTTP/CDN |
| Streaming | SSE/WebSocket/HTTP streaming por necesidad | subscriptions requieren transporte adicional | streaming unidireccional y bidireccional nativo |
| Writes e idempotency | métodos/status/headers + política del API | mutations + política explícita | RPC method + política explícita |
| Observabilidad | infraestructura HTTP muy extendida | necesita métricas de resolver/query además de HTTP | tooling RPC/HTTP2 y metadata |
| Adecuación a las rutas actuales | alta: las rutas ya están propuestas como HTTP por bounded context | puede consolidar queries variables, pero exigiría rediseñar schema/resolvers | buena para comunicación eficiente entre servicios separados, que no existen en esta etapa |
| Coste inicial | bajo/medio | medio/alto: schema, resolvers, loaders, autorización por field y query limits | medio/alto: .proto, codegen, gateway/browser support y compatibilidad |
| Decisión | **Elegido** | no como API primaria ahora | no para el monolito; opción futura service-to-service |

## 4. Por qué no GraphQL como API primaria inicial

GraphQL es una opción válida y no requiere una base de datos de grafos: el runtime resuelve fields mediante lógica y datos existentes. Su ventaja es que los clientes piden exactamente los campos/relaciones que necesitan y pueden componer vistas complejas en una query.

Sin embargo, en el primer corte:
- los consumidores principales son nuestro Angular app, integradores por API y adapters; no hay evidencia de muchos clientes con necesidades de composición radicalmente diferentes;
- los recursos y comandos tienen límites de permisos, tenant, purpose, aprobación e idempotency que deben estar explícitos;
- cada field/resolver debe autorizar acceso correctamente; puede crear BOLA y filtraciones si la autorización no se centraliza;
- joins de resolvers pueden causar N+1, fan-out y carga impredecible;
- se deben imponer límites de profundidad/costo, aliases, batching, persisted queries, introspection policy y rate limits por tenant;
- cache HTTP y semántica de método/status para comandos no quedan tan transparentes;
- se duplica trabajo contractual respecto al inventario REST/OpenAPI ya existente.

GraphQL puede añadirse en el futuro como **read-only BFF/query facade** si la medición de la UI muestra overfetching significativo, múltiples llamadas para construir dashboards, o nuevos clientes que necesitan proyecciones muy distintas. No se debe implementar una mutation GraphQL que omita approval, idempotency, audit, tenant policy o el use case de dominio. Los resolvers invocarían los mismos use cases/ports; nunca accederían a tablas privadas.

## 5. Por qué no gRPC en la primera versión

gRPC es una excelente alternativa para RPC tipado entre servicios separados, especialmente con múltiples lenguajes, code generation, deadlines y streaming. Pero el primer diseño es un monolito modular: los bounded contexts invocan interfaces/use cases locales, de modo que añadir una conexión de red gRPC entre ellos crearía latencia, deployment/network concerns y contratos distribuidos sin necesidad.

Para Angular/browser, gRPC-Web necesita un stack compatible y, en su forma habitual, un proxy/bridge que traduzca la solicitud browser al servidor gRPC. Esto añade una ruta de debugging, CORS, headers/trailers y despliegue que REST/JSON evita.

Se reconsidera gRPC cuando:
- se extraiga un bounded context a un proceso/servicio autónomo;
- exista comunicación service-to-service de alta frecuencia o streaming con contratos generados;
- haya más de un lenguaje cliente/servidor y el coste de REST/JSON sea medible;
- el benchmark pruebe reducción significativa de latencia/cpu/serialización sin subir el coste SRE por encima del beneficio.

Si se usa, solo servicios internos o integraciones técnicas específicas; no sustituye la API pública REST ni RabbitMQ para jobs durables.

## 6. Qué no reemplaza a qué

- **REST**: operaciones síncronas del cliente y API pública.
- **Direct use-case/ports**: llamadas síncronas dentro del mismo monolito modular.
- **RabbitMQ**: mensajes, tareas durables, retries, consumers, DLQ y procesos asíncronos.
- **SSE/WebSocket**: actualización de la UI en tiempo real; no sustituye el comando HTTP ni el broker durable.
- **GraphQL**: posible facade de consulta para una UI específica cuando se demuestre beneficio.
- **gRPC**: posible protocolo RPC para servicios realmente separados y con justificación medida.

No usar un endpoint REST para long jobs bloqueantes; responder con operación accepted/queued y exponer estado/cancelación/reconciliation bajo el contrato de dominio.

## 7. Reglas de API para preservar consistencia

- OpenAPI es la fuente de rutas/DTO contract; no generar DTOs manuales divergentes.
- Todos los endpoints tenant-scoped resuelven actor, tenant, membership/grant, ownership y purpose en backend.
- Idempotency-Key para writes repetibles; ETag/If-Match o version para concurrencia donde aplique.
- Webhooks entrantes validan firma/challenge por producto y persisten durablemente antes de ACK.
- REST 2xx de adapter no equivale a delivery/publication; usar estados asíncronos y reconciliación.
- La autorización del API no vive solo en route guards, GraphQL middleware o filtros técnicos; cada use case aplica la policy.
- No crear endpoint no registrado en docs/47 ni saltar los gates catalog-only de docs/49.

## 8. Revisión y triggers

Revisar la decisión si ocurre cualquiera:
1. SPA construye vistas complejas con demasiadas llamadas/overfetching documentado.
2. Integradores externos solicitan GraphQL por un caso multi-cliente claro.
3. Se extraen servicios independientes con alto volumen RPC, streaming o multi-language.
4. Benchmarks sobre hardware real muestran diferencia que cambia coste/latencia/SLO.
5. Cambian capacidades de browser/proxy/toolchain o la topología de despliegue.

**La ausencia actual de una razón medida es una razón para no añadir otro protocolo todavía, no una prohibición futura.**

## Fuentes primarias
- IETF RFC 9110 — semántica HTTP, safe/idempotent methods y caching: https://www.rfc-editor.org/rfc/rfc9110.html
- GraphQL official introduction — schema, resolvers, runtime y backend agnóstico de base de datos: https://graphql.org/learn/introduction/
- gRPC — servicio tipado, Protocol Buffers, code generation y streaming: https://grpc.io/docs/what-is-grpc/core-concepts/
- gRPC overview — casos de uso y soporte de browser/mobile: https://grpc.io/about/
- gRPC-Web interop notes: https://github.com/grpc/grpc-web
- OpenAPI Initiative: https://www.openapis.org/faq
- WhatsBusiness API inventory and contracts: docs/47, docs/43, docs/49.
