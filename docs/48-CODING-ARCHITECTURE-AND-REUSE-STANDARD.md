# 48 — Estándar obligatorio de arquitectura, calidad y reutilización

**Estado:** norma de ingeniería obligatoria para Codex, Claude Code, Copilot, agentes humanos y cualquier contribución.  
**Aplica:** backend, frontend, workers, scheduler, adapters, infraestructura, tests y tooling.  
**Objetivo:** mantener un monolito modular legible y evolutivo; impedir código espagueti, duplicación, dependencias circulares y lógica de negocio repartida sin dueño.

## 1. Regla no negociable

**Antes de crear código, el agente debe localizar y evaluar lo que ya existe. Reutilizar primero; extender después; abstraer cuando exista una responsabilidad estable; crear algo nuevo solo cuando el comportamiento no tenga un dueño reutilizable o la reutilización actual sea incorrecta.**

No se acepta una solución que funcione pero:
- copie lógica existente en otro módulo;
- ponga reglas de negocio en controllers, componentes visuales, hooks, guards genéricos o adapters de proveedor;
- concentre múltiples responsabilidades en una clase, archivo o servicio;
- importe internals de otro bounded context o consulte directamente sus tablas;
- cree un shared/common/utils/helpers como depósito de lógica sin cohesión;
- dependa de condiciones, flags o excepciones dispersas en vez de una política central;
- duplique DTOs, validaciones, serialización, paginación, errores o manejo de idempotencia sin una razón documentada;
- introduzca abstracciones genéricas sin consumidores reales ni invariantes compartidas.

Una solución simple y cohesionada es preferible a un framework interno innecesario. DRY no significa forzar comportamientos distintos dentro de una abstracción universal.

## 2. Protocolo de reutilización previo al cambio

Antes de implementar un caso de uso, el agente registra en su plan/PR:
1. Bounded context propietario y API/event/task IDs afectados.
2. Símbolos, módulos, librerías, adapters, schemas y tests existentes que buscó.
3. Qué se reutiliza y qué se extiende.
4. Qué código nuevo resulta inevitable y por qué no puede reutilizarse lo encontrado.
5. Contratos y dependencias que cambian, consumidores afectados y migración/rollback si aplica.

La búsqueda mínima en un repositorio real debe incluir:
- grafo Nx/proyectos y tags/boundaries;
- imports y exports públicos del contexto;
- repositorios, ports, use cases, policies, validators, serializers y error mappers;
- componentes/facades/data-access de frontend;
- fixtures, factories, contract tests y test harnesses;
- migraciones, eventos y DTO/schema existentes.

No afirmar que se reutilizó código si solo se copió y pegó. Si una abstracción existente es incorrecta o acopla contextos, explicar el problema y crear una sustitución con migración controlada.

### Política DRY sin sobre-abstracción

- Una regla de negocio tiene un solo dueño y una sola implementación autorizada.
- Utilidades mecánicas puras pueden compartirse cuando tienen contrato, nombre y tests estables.
- Dos usos similares no justifican automáticamente un framework común. Cuando aparezca un tercer uso, evaluar formalmente extracción, sin obligar a unificar si las semánticas difieren.
- Las transformaciones entre modelos de contextos ocurren en el límite/adaptador; no compartir entidades internas.
- No crear wrappers que solo reenvían una llamada y no agregan política, tipo, seguridad o semántica.
- Si dos implementaciones divergen por una razón de negocio, mantenerlas separadas y documentar la diferencia.

## 3. Arquitectura objetivo y dirección de dependencias

Se mantiene la decisión de **monolito modular por bounded contexts**, no microservicios prematuros. API, webhook ingress, workers y scheduler pueden ser procesos de ejecución distintos del mismo código y módulos de dominio.

Estructura lógica objetivo (no implica que los directorios ya existan ni autoriza scaffold antes de G0):

~~~text
apps/
  api/
  webhook-ingress/
  worker/
  scheduler/
  web/
libs/
  contracts/
  platform/
    identity/
    database/
    messaging/
    cache/
    security/
    observability/
  modules/
    <bounded-context>/
      domain/
      application/
      ports/
      infrastructure/
      http/
  integrations/
    meta/
      <product>/
        <api-version>/
  ui/
  testing/
~~~

### Capas y responsabilidades

| Capa | Puede contener | No debe contener |
|---|---|---|
| Domain | entidades, value objects, invariantes, políticas puras y domain events | NestJS, Angular, ORM, HTTP, SDK Meta, Redis o RabbitMQ |
| Application | use cases, transacciones, autorización de caso de uso, coordinación de ports | detalles de HTTP/SQL/SDK ni lógica de presentación |
| Ports | contratos de repositorios, proveedores, clock, storage, mensajería y autorización | implementaciones concretas o acceso global mutable |
| Infrastructure | adapters PostgreSQL, Redis, RabbitMQ, object storage, vault y Meta | reglas de negocio que pertenecen al domain/application |
| HTTP/API | controllers delgados, DTOs, mappers de entrada/salida, guards y filtros | SQL directo, decisiones de negocio, llamadas SDK fuera de ports |
| Frontend feature | páginas, componentes de feature, facade/data-access, estado y view models | secretos, persistencia directa, policy crítica o reglas de autorización |

Los módulos exportan solo una API pública estable desde su entrypoint. Un contexto no importa carpetas internas de otro contexto. Las dependencias apuntan hacia el dominio; el grafo debe ser acíclico.

## 4. Backend — normas de implementación

- Controller = transporte HTTP: parsea/valida, invoca un use case y adapta la respuesta. No orquesta workflows ni contiene reglas.
- Use case = una intención de negocio identificable. Evitar servicios Manager/Helper/Utils que hagan de todo.
- Domain service se usa solo cuando una regla de dominio no pertenece naturalmente a una entidad/value object.
- Repositories son interfaces por agregado/caso de uso; no exponer consultas SQL genéricas a otros módulos.
- Cada bounded context posee sus tablas, migraciones, índices y reglas de consistencia. Otro contexto usa su API/port/evento, no joins ni tablas privadas.
- Transacciones, locks, optimistic concurrency e idempotency viven en el límite application/infrastructure, con invariantes en domain.
- Integrations implementan ports. Un adapter externo no debe importar un use case concreto ni decidir política del tenant.
- Los errores se traducen una sola vez en el borde HTTP/worker; preservar códigos y correlation IDs, sin filtrar SQL, stack traces, tokens o PII.
- Fechas, dinero, IDs externos, estados asíncronos y versiones tienen value objects/serializadores compartidos y explícitos.
- Prohibido introducir any para eludir contratos. Toda excepción de TypeScript strict debe estar localizada, justificada y cubierta por test.
- No crear singleton mutable para tenant/actor actual. Contexto de actor y tenant se propaga explícitamente o mediante mecanismo async-context verificado y testeado.

### Reglas Meta

- Código de dominio nunca conoce Graph API ni un SDK Meta.
- El adapter se identifica por producto + versión + operación/capability; no hay una constante Graph global.
- Un transport HTTP compartido puede reutilizar autenticación, timeout, tracing, redaction y parsing común; los payloads, errores nativos y requisitos de permisos siguen siendo específicos de producto/versión.
- No duplicar retry indiscriminadamente: solo lecturas/reintentos seguros o writes cuya idempotencia/reconciliación oficial esté demostrada.
- Guardar datos nativos redactados y mapearlos a modelos canónicos en el adapter.
- Capabilities no probadas son deny/disabled, nunca fallback silencioso.

## 5. Frontend Angular — normas de implementación

- Organización feature-first: core para bootstrap/auth/tenant/telemetry; shared solo UI/técnica realmente transversal; platform para funcionalidades globales; features/<feature> para dominios de producto.
- Un componente presenta estado y emite acciones. No contiene HTTP directo, SQL, permisos de negocio ni workflows multi-paso.
- API data-access/facades son el punto de entrada reutilizable a cada feature.
- Formularios reutilizan validators y controles compartidos cuando la semántica sea la misma.
- Los modelos de vista no reemplazan DTOs de contrato; mapear explícitamente en el borde.
- Estado local por feature por defecto; estado global solo para identidad/tenant/preferencias y casos transversales justificados.
- Lazy loading y boundaries Nx/ESLint impiden imports de internals de otra feature.
- No duplicar botones, modales, feedback, tablas, loading/error/empty states o reglas de formato; extender el design system.
- Guards de navegación mejoran UX, pero nunca sustituyen autorización server-side.

## 6. Naming, tamaño y legibilidad

- Un archivo/clase/módulo debe tener una razón coherente para cambiar.
- Nombrar por dominio/acción y no por tecnología genérica: ApproveCampaignBudget, no GenericManager.
- Evitar God classes, God components, controladores extensos, callbacks anidados, boolean flags que cambian muchas responsabilidades y cadenas largas de condicionales de política.
- Dividir una función cuando mezcla validación, autorización, cálculo, persistencia y efectos externos.
- Una función compleja (complejidad ciclomática >10) exige simplificación o justificación/revisión explícita.
- Cualquier archivo/clase de tamaño inusual debe tener justificación y plan de cohesión; los límites son señales de revisión, no objetivos para fragmentar artificialmente.
- No crear carpetas por anticipado sin un módulo real que las justifique.

## 7. Testing y calidad obligatorios

Por cambio, seleccionar pruebas proporcionales al riesgo y registrar comandos/resultados reales:
- Unit: invariantes, policies, value objects y casos de uso con puertos falsos.
- Integration: PostgreSQL real efímero/migraciones/RLS, Redis/broker y adapters según aplique.
- Contract: DTO/OpenAPI/event schema/Meta fixtures y compatibilidad consumidor-productor.
- E2E: journeys de usuario y boundaries frontend/backend.
- Security: cross-tenant, BOLA, permisos, OAuth, webhook, secretos, injection, rate limits, idempotencia, races y approvals.
- Regression: un test que falle antes y pase después de cada bug corregido.
- Performance/accessibility cuando el cambio pueda afectar volumen, UX o WCAG.

No utilizar mocks para declarar validado un comportamiento cuya garantía depende de PostgreSQL RLS, transacciones, locks, RabbitMQ, firmas o proveedor externo. Los mocks complementan; no sustituyen pruebas de integración.

## 8. CI y controles automáticos requeridos después del G0

El scaffold debe incluir, como mínimo:
- TypeScript strict, lint/format/typecheck y builds afectados.
- Nx module boundaries con tags por capa y bounded context; imports cruzados privados bloqueados.
- Tests unit/integration/contract/E2E con cobertura por ruta crítica (no solo porcentaje global).
- Validación OpenAPI, AsyncAPI y JSON Schema; detección de breaking changes.
- Secret scanning, SCA/SAST, container/IaC scanning y SBOM.
- Detección de ciclos, dependencias no usadas, imports backend en browser y código duplicado.
- Migration check desde DB vacía; RLS/cross-tenant suite y pool-reuse tests.
- CI debe fallar ante contract drift o endpoint/event no registrado.

Las herramientas/versiones exactas se fijan con lockfile luego de TASK-039, no se inventan desde este documento.

## 9. Checklist de revisión obligatoria

Una contribución no se acepta para merge si una respuesta crítica es no:
- ¿Se leyó AGENTS y esta norma?
- ¿Existe un único bounded context propietario de cada regla y dato?
- ¿Se buscó y reutilizó código existente sin copiarlo?
- ¿Los imports respetan el grafo y entrypoints públicos?
- ¿Controladores/componentes son delgados?
- ¿No existen duplicaciones ni abstracciones prematuras?
- ¿Tenant/actor/purpose/permissions se validan server-side?
- ¿Las operaciones externas tienen capability, idempotency, audit y approval según riesgo?
- ¿Se actualizó OpenAPI/AsyncAPI/JSON Schema y docs/47/09/19?
- ¿Hay tests ejecutados para el riesgo introducido?
- ¿Se inspeccionó el diff por secretos, PII, regresiones y cambios fuera de scope?
- ¿Se distinguió implemented, verified y accepted?

## 10. Gate de cumplimiento

La revisión de arquitectura/calidad puede bloquear una tarea aunque los tests funcionales pasen. El autor no puede etiquetar como independiente su propia revisión. Si solo hay un agente disponible, registrar self-review y mantener pendiente el gate independiente exigido por docs/24 y docs/46.

**Esta norma no autoriza el scaffold productivo antes de G0.** El Architecture Spike y los harnesses sintéticos siguen el alcance de docs/45 y docs/46.
