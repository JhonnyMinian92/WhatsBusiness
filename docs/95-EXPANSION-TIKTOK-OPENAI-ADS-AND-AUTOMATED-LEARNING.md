# 95 — Expansión multicanal: TikTok, ChatGPT Ads y aprendizaje automático de campañas

> **Tipo:** especificación funcional, técnica y de arquitectura; ampliación del backlog existente.  
> **Fecha de auditoría:** 2026-11-09.  
> **Rama de referencia:** `environment/local`.  
> **Estado:** propuesta documentada para ejecución; no equivale a implementación, habilitación de proveedores ni autorización de gasto.  
> **Propietario del producto:** Product Owner de WhatsBusiness.  
> **Áreas:** Product, Marketing/Growth, Ads Operations, Data Science, Backend, Frontend, Security, Privacy/Legal, QA y SRE.

---

## 1. Resumen ejecutivo

WhatsBusiness evolucionará desde una plataforma de integraciones Meta hacia una plataforma multicanal de gestión, experimentación y optimización de marketing. El producto deberá integrar las APIs oficiales de TikTok y la API oficial de anunciantes de OpenAI para publicidad en ChatGPT; conservará los adaptadores Meta existentes y agregará un motor transversal que permita crear, medir, comparar y mejorar campañas con evidencia.

Cada campaña que ingrese al flujo de experimentación tendrá, como mínimo, dos versiones relacionadas e inmutables:

- **Versión 1 — Original / Control:** copia fiel de la campaña fuente aprobada. No se sobrescribe ni se modifica para fabricar una comparación.
- **Versión 2 — Alternativa / Variante:** propuesta alternativa generada o seleccionada por Creative Lab. La hipótesis y la variable primaria modificada quedan registradas.

Las versiones se asignarán a grupos experimentales mediante un mecanismo aleatorio o una función nativa del proveedor, cuando esté disponible y autorizado. El sistema conservará la asignación para evitar que una misma unidad experimental cambie repetidamente entre control y variante. La proporción inicial recomendada es 50/50, pero el reparto efectivo de audiencia y presupuesto debe respetar el método admitido por cada plataforma, sus políticas, la elegibilidad de la cuenta y el diseño estadístico.

El propósito final no es solamente identificar qué anuncio recibe más clics. WhatsBusiness debe descubrir qué combinación de contenido, creatividad, contexto, experiencia y oferta consigue mejores resultados comerciales sostenibles: leads cualificados, oportunidades, compras, ingresos netos, margen, recurrencia y valor de vida del cliente, según los datos disponibles.

El motor podrá recomendar y preparar automáticamente nuevas versiones. La activación de anuncios, las publicaciones, los cambios de presupuesto y cualquier operación externa con coste continuarán sujetos a permisos, límites, políticas y aprobaciones configuradas por el propietario y el tenant. La automatización de generación no equivale a autorización de publicación ni de gasto.

## 2. Objetivos y resultados de negocio

1. Administrar campañas y activos publicitarios de Meta, TikTok y ChatGPT desde una experiencia unificada, sin perder las capacidades específicas de cada plataforma.
2. Publicar contenido orgánico de TikTok mediante las APIs oficiales y permisos explícitos de cada cuenta.
3. Administrar campañas publicitarias en TikTok y ChatGPT mediante sus respectivas APIs oficiales y únicamente cuando la cuenta y la aplicación sean elegibles.
4. Crear el par original/alternativa de forma reproducible, auditable y comparable.
5. Recolectar señales de entrega, creatividad, contexto, interacción y resultado comercial, conservando origen, granularidad, zona horaria y ventana de atribución.
6. Diferenciar correlación, atribución informada por la plataforma e incremento causal medido mediante experimento válido.
7. Aprender qué elementos funcionan por sector, producto, objetivo, país, audiencia, canal y etapa del funnel, sin asumir que una combinación ganadora en un canal será ganadora en otro.
8. Recomendar y generar nuevas variantes con explicaciones, confianza, riesgos, evidencia y límites de aplicabilidad.
9. Proteger presupuesto, cuentas, credenciales, derechos de uso, datos personales, marca y reputación del cliente.
10. Hacer que la plataforma sea extensible: añadir futuros proveedores sin rehacer el dominio compartido ni acoplar toda la lógica a Meta.

### Fuera de alcance o no asumido

- No se promete acceso automático a todas las APIs privadas, restringidas, académicas o sujetas a aprobación de TikTok, OpenAI o Meta.
- “Todas las APIs” significa un inventario versionado y cobertura de todas las operaciones oficiales pertinentes para las funciones comerciales aprobadas, con estado de elegibilidad. No significa implementar endpoints sin utilidad, sin acceso, retirados o legalmente restringidos.
- La API de OpenAI para anunciantes no es la API de modelos, Responses API ni un mecanismo para insertar publicidad en respuestas conversacionales generadas por modelos. El alcance es administrar anuncios del producto publicitario oficial de ChatGPT.
- No se presupone acceso a usuarios individuales, contenido privado, señales internas de ranking ni algoritmos propietarios de ninguna plataforma.
- No se asumirá que ChatGPT Ads, TikTok Ads y Meta Ads tienen igualdad de formatos, objetivos, targeting, métricas o controles.
- No se habilita publicación, activación ni gasto real por el hecho de completar contratos o código. Los gates de producción del proyecto siguen vigentes.

## 3. Auditoría del estado actual del repositorio

La revisión se realizó contra archivos y rutas de `environment/local`, no solamente contra las historias o casillas del backlog.

### 3.1 Estructura y frontend

| Hallazgo verificado | Situación actual | Decisión propuesta |
|---|---|---|
| `apps/` contiene más de una aplicación | Existe `apps/api` y `apps/web` | No renombrar ni mover el directorio padre completo. Conservar `apps/api` y mover únicamente el frontend Angular a `app-meta-ecuapp/`. |
| Angular se identifica como `web` | `angular.json` usa la clave `web`; Nx usa `name: web`; los comandos hacen `ng build web` / `ng serve web` | Renombrar el proyecto Nx/Angular a `app-meta-ecuapp` y actualizar todas las rutas, targets, cachés y pipelines. |
| Monorepo pnpm | `pnpm-workspace.yaml` incluye `apps/*`, `libs/*` y `microservices-meta-ecuapp` | Mantener `apps/*` para el backend y añadir `app-meta-ecuapp` como workspace explícito. |
| API modular | `apps/api` es NestJS | Mantener el backend y sus límites por bounded context. |
| Paquete Meta | `microservices-meta-ecuapp` está nombrado y empaquetado para Meta | No convertirlo en un conector genérico de terceros. Mantener Meta aislado y crear módulos/adapters TikTok y OpenAI Ads independientes. |

**Estructura objetivo:**

```text
/
├── app-meta-ecuapp/                 # Angular: interfaz del producto multicanal
├── apps/
│   └── api/                         # NestJS: API, dominios y casos de uso
├── microservices-meta-ecuapp/       # Integraciones y runtime Meta existentes
├── integrations/
│   ├── tiktok/                      # Propuesto: adapters TikTok por producto API
│   └── openai-ads/                  # Propuesto: Advertiser API de ChatGPT Ads
├── libs/                            # Contratos, utilidades y librerías compartidas
├── contracts/                       # OpenAPI, AsyncAPI y JSON Schemas versionados
└── docs/
```

La ubicación física `integrations/` es una dirección arquitectónica que debe contrastarse con el grafo real de Nx y el ownership actual antes de crear nuevos proyectos. También es válido ubicar los adapters bajo `apps/api/src/<bounded-context>/infrastructure/providers/` si el monolito modular actual ofrece mejores límites; la decisión debe registrarse en ADR antes de implementar.

### 3.2 Campañas, experimentos e inteligencia existentes

| Código o documento observado | Evidencia | Estado real que debe preservarse |
|---|---|---|
| `apps/api/src/ads/campaigns/domain/` | Existen dominio de ciclo de vida, validación, dinero y guardrails de presupuesto | Hay reglas de dominio; no se debe suponer que existe una integración externa end-to-end. |
| `apps/api/src/ads/creative-lab/domain/creative-variant.ts` | Variante con concepto, oferta, hook, formato, CTA, placement, provenance, rights, claims y lifecycle | Slice de dominio existente; faltan providers reales de derechos, marca y claims, además de gates de integración. |
| `apps/api/src/ads/creative-lab/domain/creative-experiment.ts` | Control y variantes, variable primaria, KPI, presupuesto decimal, particiones de audiencia, ventana, muestra y stop rules | Existe modelo de test cell. No equivale a asignación aleatoria persistente ni a ejecución A/B end-to-end. |
| `apps/api/src/ads/creative-lab/application/creative-provider.adapter.ts` | Adapter de creatividad específico de Marketing API Meta, con capability evidence y transporte fail-closed | Reutilizar el patrón, no fingir paridad con TikTok ni OpenAI. Crear contratos y adapters separados. |
| `docs/36-CAMPAIGN-INTELLIGENCE-AND-GUARDED-SCALING.md` | Define aprendizaje con CRM/CAPI, protección de ganadores, Creative Lab, atribución y presupuesto +20% | Reutilizar como norma de producto y extenderla a los canales nuevos. |
| `docs/11-TASK-BACKLOG.md` y `docs/53-TASK-WORK-PACKAGES.md` | Ya existen TASK-067..080 para Campaign Intelligence, Creative Lab, medición, herramientas y Meta agents | Los paquetes nuevos deben depender de estas tareas y extenderlas, no crear duplicados. |
| `docs/18-EXECUTION-GRAPH.md` y `docs/19-TRACEABILITY-MATRIX.md` | Existen dependencias de Insights, CAPI, Creative Lab, test cells y recomendaciones | Agregar las dependencias multicanal y sus criterios de aceptación. |

**Estado de las tareas existentes al corte documental:** TASK-069, TASK-070, TASK-073 y TASK-079 tienen un primer slice en progreso. Los demás elementos de Campaign Intelligence/Agent Interoperability mantienen dependencias y gates pendientes según los documentos existentes. El documento de trazabilidad registra evidencia histórica de suites Creative Lab (26/26 en un run anterior), pero esa ejecución no acredita el HEAD actual ni reemplaza la validación integral del commit que se vaya a aceptar. No se declara que estas historias estén terminadas.

### 3.3 Gaps de producto detectados

1. El catálogo `docs/09-API-INTEGRATION-CATALOG.md` está enfocado en Meta; falta un catálogo transversal de proveedores que separe Meta, TikTok y OpenAI Ads.
2. El adapter de creatividad Meta está especializado en `marketing_api`; falta un modelo compartido de capacidades por proveedor, producto, cuenta, operación, versión y vigencia.
3. No existe en la documentación vigente una especificación de integración TikTok end-to-end.
4. No existe en la documentación vigente una especificación de integración de OpenAI Advertiser API end-to-end.
5. El modelo de Creative Experiment no garantiza por sí solo exposición equilibrada, asignación persistente, detección de Sample Ratio Mismatch, atribución común ni causalidad.
6. No hay una taxonomía multicanal completa y unificada de atributos creativos, de experiencia, calendario, oferta y resultados comerciales.
7. El repositorio requiere una decisión explícita sobre el nombre `app-meta-ecuapp`: aunque conserve la palabra Meta por solicitud del propietario, el frontend debe representar el producto multicanal y no acoplar su interfaz a un único proveedor.
8. Los adaptadores nuevos necesitan una estrategia común de autenticación, scopes, revocación, rotación, webhook verification, rate limits, idempotencia, retries y reconciliación.
9. Se requiere un feature store/registro de experimentos con linaje, calidad, retención y protección de datos; no basta con guardar métricas sueltas en tablas de campaña.
10. La atribución de cada plataforma debe separarse de las ventas verificadas por CRM y del uplift causal. Sin esta separación el motor podría aprender conclusiones equivocadas.

### 3.4 Mejoras adicionales de alto valor identificadas en la auditoría

Estas mejoras se incorporan al alcance de esta especificación aunque no aparezcan como una tarea completa en el backlog actual:

- **Provider Capability Registry multicanal:** elegibilidad por tenant, cuenta, país, producto, endpoint, versión, scope, asset grant, tier, fecha de comprobación y expiración. Estado `unknown` debe bloquear escrituras.
- **Campaign/Spend Ledger unificado:** presupuestos autorizados, límites de cuenta, gasto reportado por proveedor, moneda, conciliación, reservas de presupuesto por test cell y discrepancias.
- **Assignment Integrity:** unidad experimental estable, asignación reproducible, control de contaminación entre grupos, detección de bots/fraude y alerta ante desbalance inesperado de muestra.
- **Experiment Registry y preregistro:** hipótesis, variable primaria, KPI primario, métricas de protección, tamaño de muestra, MDE, duración, ventanas, reglas de parada y análisis antes de mirar resultados.
- **Creative Rights & Brand Governance:** licencia, consentimiento, fecha de expiración, autorización de uso comercial, música/audio, imagen de personas, marca, claims y revisión por país/industria.
- **Measurement Quality Service:** deduplicación entre pixel y servidor, reconciliación de eventos, frescura, eventos faltantes, conversiones repetidas y discrepancias de atribución.
- **Calendar & Context Intelligence:** festivos locales, estacionalidad, zona horaria de cuenta, jornada del negocio, eventos sectoriales y ventanas promocionales. Guardar fuentes y no asumir que una fecha funciona igual en todos los países.
- **Guardrails de economía unitaria:** margen, coste de producto/servicio, descuentos, impuestos cuando correspondan, devoluciones, cancelaciones, coste de operación y calidad de lead; evitar elegir una creatividad por ROAS reportado que no represente rentabilidad.
- **Observabilidad por proveedor:** freshness y latencia de Insights, consumo de cuota, rate limits, errores OAuth, webhooks, serving issues, gasto, colas, reconciliación y salud de cada conector.
- **API/Policy Drift Monitor:** alertas de cambios de versiones, deprecaciones, scopes y políticas con tareas de migración sugeridas; nunca autopublicar o autoaprobar una migración externa.
- **Experimentación accesible y segura:** accesibilidad del contenido/landing, lectura móvil, contraste, velocidad de destino, lenguaje/localización y compatibilidad con formatos por placement.

## 4. Cambio 1 — Renombrar el frontend a `app-meta-ecuapp`

### 4.1 Requisito

El proyecto Angular actualmente ubicado en `apps/web` debe pasar a llamarse `app-meta-ecuapp`. El backend no debe ser movido ni renombrado como consecuencia accidental de este cambio.

### 4.2 Migración requerida

1. Mover `apps/web/` a `app-meta-ecuapp/`, preservando historia Git cuando la herramienta de migración lo permita.
2. Cambiar el `name` del proyecto Nx a `app-meta-ecuapp` y actualizar `angular.json` para usar la misma clave de proyecto.
3. Actualizar `root`, `sourceRoot`, `index`, `browser`, `styles`, `assets`, `tsConfig` y `outputPath` a las rutas nuevas.
4. Actualizar los targets y comandos: `ng build app-meta-ecuapp`, `ng serve app-meta-ecuapp`, `nx build app-meta-ecuapp` y `nx serve app-meta-ecuapp`, según los targets finales del workspace.
5. Actualizar `pnpm-workspace.yaml`, tags Nx, project references, imports relativos, alias TypeScript, configuración de tests, snapshots y pruebas E2E.
6. Actualizar Dockerfiles, Compose, scripts de desarrollo, CI, cache keys, path filters, artefactos, deployment manifests y documentación que haga referencia a `apps/web` o al proyecto `web`.
7. Ajustar la salida de build, presupuestos Angular, sourcemaps, rutas estáticas, proxy de API, rutas base y variables por ambiente.
8. Ejecutar `pnpm install --lockfile-only` o el mecanismo documentado del repositorio, revisar `pnpm-lock.yaml` y exigir `pnpm install --frozen-lockfile` limpio.
9. Mantener `apps/api` sin cambios de ubicación y probar que los comandos raíz Nx sigan descubriendo ambas aplicaciones.
10. No mantener aliases obsoletos indefinidamente. Si algún pipeline externo requiere transición, documentar la compatibilidad y su fecha de retirada.

### 4.3 Criterios de aceptación

- No queda frontend Angular operativo bajo `apps/web`; su código fuente reside en `app-meta-ecuapp/`.
- Nx y Angular reconocen el nombre exacto `app-meta-ecuapp`.
- `apps/api` continúa compilando y ejecutándose desde su ubicación original.
- `pnpm install --frozen-lockfile`, build, typecheck y tests pasan en el mismo commit.
- CI, Docker, scripts, rutas de assets y configuración de despliegue no conservan referencias rotas.
- El nombre visible y los metadatos del producto se actualizan donde corresponda sin alterar secretos ni URLs OAuth registradas hasta revisar cada proveedor.

## 5. Cambio 2 — Integración oficial completa de TikTok

### 5.1 Principio de integración

Construir un conjunto de adapters oficiales separados por producto TikTok. Marketing API, Organic API, Content Posting API, Display API, Login Kit y Business Messaging API tienen casos de uso, autorizaciones y semánticas diferentes. No implementar un “TikTok API client” monolítico ni asumir que un token habilita todos los productos.

### 5.2 Inventario de APIs y capacidades

| Producto / familia | Capacidades que debe cubrir la plataforma | Condición y límites que se deben verificar |
|---|---|---|
| TikTok API for Business — Marketing API | Ad accounts, Business Center/activos elegibles, campañas, ad groups, ads, creatives, objetivos, targeting, presupuestos, pujas, estados, gestión de assets, catálogos, audiencias, leads, reportes y operaciones de medición soportadas | Scopes, autorización de advertiser, app review, región, API version, access level, endpoint habilitado, tier y elegibilidad por cuenta. |
| Upgraded Smart+ APIs | Flujos de creación y administración de campañas Smart+ que sustituyan los flujos Legacy Manual cuando el objetivo/versión lo requiera | Migración obligatoria de flujos afectados antes del 2027-01-01 según el aviso vigente de TikTok para Sales, App Promotion y Lead Generation. |
| Super Split Test API | Crear/administrar experimentos nativos cuando TikTok lo habilite para la cuenta, objetivo y tipo de campaña; recuperar definición/resultados | Confirmar versión, endpoint, elegibilidad y restricciones. No fingir soporte nativo si la cuenta no califica. |
| Reporting / Insights | Informes síncronos y asíncronos, paginación, breakdowns por tiempo/campaña/ad group/ad/creative y métricas disponibles | Guardar request, filtros, attribution window, timezone, currency, estado de reporte, freshness y API version. |
| Audience / Catalog / Lead Generation | Audiencias y exclusiones, catálogos/product sets, formularios/leads y sincronización de resultados cuando exista permiso | Minimización de PII, consentimiento, lead access, retención, supresión y reconciliación de eventos. |
| Organic API | Accounts, Mentions, TikTok One (TTO) Creator Marketplace, Discovery y Spark Ads Recommendation | Los permisos y funcionalidades pueden diferir por producto, región, cuenta y tipo de usuario. |
| Business Messaging API | Mensajes directos y conversaciones de negocio, eventos/webhooks, routing hacia Inbox y handoff humano | Habilitación y aprobación del producto, autorización del usuario/cuenta, políticas de mensajería y límites de QPS. |
| Login Kit | OAuth/autorización de usuarios, exchange, refresh, scopes concedidos, revocación y reconexión | Consentimiento por scope; token exchange y almacenamiento en backend; rotación y expiración. |
| Content Posting API — Direct Post | Publicar video/foto/contenido soportado al perfil TikTok autorizado; caption, hashtags, privacidad y opciones admitidas | Aprobación del scope `video.publish`, autorización explícita del titular, auditoría del cliente y restricciones de visibilidad de clientes no auditados. |
| Content Posting API — Upload to Draft | Subir contenido como borrador para que la persona lo revise y publique desde TikTok | Preservar propiedad/consentimiento del usuario y reportar claramente que subir no significa publicar. |
| Display API | Perfil y lista/detalle de videos del usuario autorizado para mostrarlos en la aplicación | Scope `user.info.basic`, `video.list` u otros scopes realmente aprobados. No usarla para scraping. |
| Share Kit / herramientas de integración | Compartir contenido desde una experiencia móvil/web cuando corresponda y esté soportado | Evaluar por plataforma cliente; no asumir equivalencia a Content Posting API. |
| Commercial Content API | Investigación/consulta de contenido comercial y transparencia cuando el programa permita el uso | Verificar elegibilidad legal y técnica. No confundirla con acceso a todas las publicaciones ni con Ads Management API. |
| Research API | No formar parte del flujo comercial estándar | Excluirla de la entrega comercial salvo que una entidad separada y elegible cumpla de forma verificable los criterios académicos/no lucrativos y términos de TikTok. |

El inventario es una cobertura funcional objetivo. Al implementar cada operación debe existir una ficha con endpoint/método oficial, versión, fecha y URL fuente, scopes, app mode, access level, permisos de cuenta, payload request/response, errores, límites, paginación, idempotencia, webhook asociado, datos tratados, retención, coste y pruebas de contrato.

### 5.3 Funcionalidades de usuario

- Conectar y desconectar una o varias cuentas TikTok con autorización explícita y estado visible por cuenta.
- Sincronizar la identidad de cuenta, advertiser IDs, Business Center y activos únicamente cuando las APIs concedidas lo permitan.
- Crear, duplicar como borrador, validar, previsualizar, programar, pausar, reanudar y consultar campañas, ad groups y ads, según los permisos del endpoint.
- Subir y administrar imágenes, videos, textos y otros assets compatibles; registrar checksum, formato, tamaño, duración, licencia, origen y revisión de seguridad.
- Administrar contenido orgánico: cargar borrador, preview, solicitud de publicación, Direct Post y consulta posterior de estado cuando la API y autorización lo permitan.
- Consultar métricas y diagnósticos con cortes compatibles y refresco indicado.
- Sincronizar leads y eventos de mensajes hacia CRM e Inbox con source/provider ID, idempotencia, consentimiento y audit.
- Utilizar TikTok One/Creator Marketplace solo para flujos de colaboración autorizados, con contrato, permisos y derechos de uso del contenido.
- Detectar cambios de estado, rechazos, restricciones, límites de entrega, tokens vencidos y problemas de facturación/operación.

### 5.4 Condición especial de migración 2027

TikTok anunció que desde el **1 de enero de 2027** ciertos endpoints Legacy Manual Flow (`campaign/create`, `campaign/copy/task/create`, `adgroup/create`, `ad/create` y `ad/aco/create`) dejan de crear/copiar determinados flujos de campañas Sales, App Promotion y Lead Generation. El diseño debe priorizar las APIs Upgraded Smart+ para los casos afectados, mantener adapters por generación de API y crear una tarea de migración con pruebas de regresión. No codificar un endpoint legacy como ruta principal para nuevos flujos afectados.

### 5.5 Criterios de aceptación TikTok

- Existe una matriz por producto/API/versión/scope/país/cuenta y operación con estado `available`, `unavailable` o `unknown` y evidencia vigente.
- Login Kit, Marketing API, Organic API, Business Messaging, Content Posting y Display APIs están encapsuladas en adapters independientes.
- Una cuenta solo ve y opera activos que le pertenecen o que tiene concedidos mediante grants válidos.
- Las campañas, posts, leads, insights y mensajes conservan identificadores y payloads de proveedor, sin perder la normalización compartida.
- Los posts nunca se marcan publicados hasta recibir confirmación verificable; uploads a borrador se identifican como borrador.
- Una app no auditada o sin scope `video.publish` no puede activar Direct Post público; se informa al usuario de la limitación real.
- Webhooks verifican firma/secret según producto, timestamp, replay protection, tamaño, idempotencia, durabilidad y dead-letter/replay controlado.
- Los flujos afectados por el cambio del 2027-01-01 usan Upgraded Smart+ con pruebas de contrato; la API legacy queda limitada a los casos explícitamente permitidos.
- Ninguna capacidad se presenta como habilitada por el solo hecho de que exista la interfaz TypeScript.

## 6. Cambio 3 — Integración oficial de publicidad en ChatGPT (OpenAI Ads)

### 6.1 Producto y API correcta

La integración debe consumir **OpenAI Advertiser API / Ads API**, el producto oficial para que anunciantes y partners creen y administren campañas de anuncios de ChatGPT desde sistemas propios. No debe confundirse con OpenAI Platform API, la API de modelos, la generación de contenido ni con una función para inyectar anuncios en conversaciones de ChatGPT.

### 6.2 Capacidades de API requeridas

| Recurso o familia | Funciones a integrar |
|---|---|
| Authentication / API keys | Validar credencial, cuenta publicitaria, scopes/entitlements disponibles, rotación y revocación. La clave de Ads permanece en backend. |
| Ad Account | Identidad de cuenta, estado, moneda, timezone, límites y revisiones pendientes. |
| Audit Logs | Consultar cambios y asociarlos al command/actor/approval interno. |
| Campaigns | Crear, listar, consultar, actualizar, pausar, activar y cambiar estado cuando la referencia lo permita; objetivos, presupuesto, calendario y targeting disponible. |
| Ad Groups | Crear y gestionar grupos, bidding configuration, contexto, audiencia/product selection u opciones documentadas. |
| Ads | Crear y gestionar anuncios, contenido creativo, destinos, imágenes/archivos, preview, review/serving issues, activar o pausar. |
| Files / Assets | Subir/consultar archivos y reutilizarlos donde la API lo permita; conservar MIME, checksum, procedencia, derechos y asociación. |
| Product Feeds | Administración y sincronización de feeds y productos, validación de feeds, errores, orden y versionado. |
| Insights / Reporting | Insights de cuenta, campaña, ad group y ad; datos de delivery, coste, producto y conversiones atribuidas; paginación, granularidad y freshness. |
| Conversion Setup | Crear o consultar data sources, Pixel, conversion event settings y asociación a campañas. |
| Measurement Pixel | Instalar/emitir eventos web desde frontend con controles de consentimiento. Nunca exponer API keys de anunciante o CAPI en navegador. |
| Conversions API | Envío server-to-server de leads, compras y otros eventos; batch, validación, retries y claves específicas. Deduplicar con Pixel usando Pixel ID, nombre y event ID compartido. |
| Preview / Serving Issues | Previsualizar anuncios, revisar aprobación/serving issues y mostrar por qué un anuncio no entrega cuando la API exponga esa información. |

La integración debe respetar la jerarquía real de recursos de OpenAI: cuenta → campaña → ad group → ad. La API documenta bidding types como impressions, clicks y conversions, además de budgets, targeting y landing page tracking según el endpoint y la cuenta. Se debe mantener la granularidad nativa y no mapear mecánicamente todos los campos a un modelo Meta.

### 6.3 Seguridad y medición

- `OPENAI_ADS_API_KEY` (o el nombre/credencial vigente definido por OpenAI) se almacena solo en secret manager del backend, nunca en browser, build, logs o repositorio.
- La Conversions API usa una credencial separada de eventos, de alcance mínimo, además de un Pixel ID. No mezclar credenciales de administración y medición.
- Crear campañas inicialmente en estado **paused** cuando lo permita la API; revisar targeting, país, moneda, timezone, presupuesto, creative review, destinos y serving issues antes de solicitar activación.
- Usar `Idempotency-Key` en operaciones de creación compatibles. Reutilizar la misma clave solo para el mismo intento lógico; reconciliar una escritura de estado desconocido antes de repetirla.
- Medir Pixel con controles de consentimiento; enviar desde servidor eventos confirmados por el backend. No duplicar una compra emitida desde browser y servidor: reutilizar el mismo event ID, event name y Pixel ID según el contrato oficial.
- Capturar referencias de clic como `oppref` si están presentes y el contrato oficial lo admite; no fabricarlas ni enviar datos no autorizados.
- Mantener por separado click-through y view-through, ventanas de atribución y métricas de conversión. Respetar latencia/frescura documentadas para reportes.
- Los endpoints de historial/eventos de depuración pueden tener restricciones de disponibilidad por cuenta; ausencia de acceso se registra como `unknown` o `unavailable`, no como cero eventos.
- La activación debe requerir capability evidence vigente, ad account elegible, aprobaciones internas y presupuesto libre.

### 6.4 A/B y limitaciones

La documentación pública consultada de OpenAI Advertiser API describe administración de campañas, ad groups, ads, reporting y conversion tracking; no se debe presuponer que existe un endpoint nativo de A/B testing equivalente al de otras plataformas. El motor de WhatsBusiness definirá el experimento y seleccionará el mecanismo admitido: partición de audiencias, estructura separada o asignación compatible con las restricciones de targeting y entrega. Si la plataforma no permite garantizar aleatorización comparable, el resultado debe etiquetarse como observacional o no causal.

### 6.5 Criterios de aceptación OpenAI Ads

- Cuenta, moneda, timezone, estado y revisiones se verifican antes de cualquier acción.
- Se puede realizar un recorrido completo de sandbox/simulación: cuenta, draft paused, ad group, ad, asset, preview/serving review, Insights y conversión sintética.
- Las claves de Ads y CAPI están separadas, cifradas, rotables y solo son accesibles desde servicios backend autorizados.
- Los comandos externos tienen idempotencia, audit, actor, tenant, approval hash, proveedor, request ID, estado y reconciliación.
- El estado de una campaña se deriva de respuesta de proveedor y reconciliación, no de una intención local.
- Pixel y Conversions API respetan consentimiento y deduplicación; se mantiene fuente original y se evita duplicar ingresos.
- No se publica ni activa un anuncio hasta cumplir la aprobación configurada y la elegibilidad real de la cuenta.

## 7. Requisito central — dos versiones y distribución experimental

### 7.1 Definición de V1 y V2

Toda campaña que se incorpore al módulo de experimentación creará un `CampaignExperiment` con al menos dos versiones:

| Propiedad | V1 — Original / Control | V2 — Alternativa / Tratamiento |
|---|---|---|
| Fuente | Snapshot fiel de la campaña original aprobada | Derivada explícitamente de V1 y de una hipótesis identificada |
| Identidad | `variant_role=control`, `version_number=1` | `variant_role=treatment`, `version_number=2` |
| Mutabilidad | Inmutable después del preregistro; nuevas correcciones generan nueva versión | Inmutable una vez aprobada/preregistrada; nuevas mejoras generan nuevas versiones |
| Propósito | Baseline para comparar | Medir el impacto de una alternativa definida |
| Aprobación | Conservar aprobación original y validar su vigencia | Requiere validación de derechos, marca, políticas y aprobación según riesgo |
| Presupuesto | Parte del budget total reservado para el experimento | Parte del mismo budget total reservado; no implica duplicarlo |
| Resultado | Conserva exposición, delivery y outcomes propios | Conserva exposición, delivery y outcomes propios |

La V1 y V2 iniciales son obligatorias para experimentos del tipo A/B, pero pueden existir campañas que se gestionen sin experimento cuando el propietario lo decida (por ejemplo, campañas de brand safety, comunicaciones operativas o restricciones de volumen). En ese caso debe quedar registrado el motivo de exclusión. Una campaña externa no se modificará o duplicará sin comprobar antes si el proveedor permite crear una estructura experimental equivalente.

Cada ronda posterior debe conservar el lineage: V1/V2 iniciales no se sobrescriben; el siguiente experimento puede comparar el campeón anterior contra una nueva variante V3, V4, etc. El sistema debe distinguir `version_number` dentro de una campaña de `experiment_round` y rol experimental.

### 7.2 Distribución aleatoria

- Default conceptual: 50% control y 50% alternativa. La proporción real debe configurarse por experimento, pero ambos grupos han de tener presupuesto y volumen suficiente para detectar el efecto buscado.
- Preferir el mecanismo nativo de split test del proveedor cuando esté disponible y la cuenta cumpla requisitos. Ejemplo: Super Split Test de TikTok, cuando la API, el objetivo y la cuenta lo admitan.
- Si no hay mecanismo nativo, usar asignación estable y verificable con unidad experimental apropiada (usuario, sesión, lead, cuenta o cluster geográfico); no alternar la creatividad en cada request ni asignar la misma persona a ambos grupos.
- El servicio de asignación debe utilizar un hash/HMAC determinístico con secreto server-side, `experiment_id`, unidad seudonimizada y versión del algoritmo. Persistir asignación, exposición, momento y versión de la regla. Nunca enviar el secreto al frontend.
- Excluir, cuando corresponda, bots, tráfico interno, QA, empleados, conversiones duplicadas y audiencias no elegibles. Registrar la razón de exclusión.
- Comprobar que control y variante son mutuamente excluyentes y que no existe contaminación material entre grupos. Si no puede demostrarse, bloquear la declaración de causalidad.
- Vigilar **Sample Ratio Mismatch (SRM)**: si la proporción observada se desvía significativamente de la distribución esperada, pausar la inferencia y analizar pérdida de eventos, elegibilidad o delivery desigual.
- Una asignación de 50/50 en la aplicación no garantiza 50/50 impresiones: los algoritmos de entrega pueden optimizar exposición y gasto de manera desigual. Registrar assignment, eligible population, served impressions, reach y spend por separado.
- Cuando el proveedor solo permita administrar creatividades y su propio motor decida entrega sin experimento controlado, el resultado se reporta como comparación observacional, no como A/B causal.
- Las particiones de audiencia, presupuesto, bids, calendario y placements deben ser equivalentes o diseñadas expresamente para la hipótesis. Evitar cambios simultáneos no registrados.
- Guardar la configuración real devuelta por el proveedor y reconciliarla periódicamente.

### 7.3 Variables experimentales y catálogo de atributos

El Feature Registry debe soportar al menos las siguientes familias. Un atributo debe ser `supported`, `unsupported`, `not_applicable`, `not_exposed_by_provider` o `provider_managed`; nunca inventar que se cambió una propiedad que la API no ofrece.

| Familia | Campos/variables a capturar y evaluar |
|---|---|
| Color y composición | Paleta, color principal/secundario/fondo, contraste, saturación, balance visual, jerarquía, composición, espacios, densidad, estilo gráfico y consistencia de marca. |
| Imágenes | Asset ID/hash, tipo, origen, licencia, presencia de producto/persona, composición, crop, ratio, resolución, calidad, miniatura, contexto y ubicación de producto. |
| Video y audio | Duración, relación de aspecto, resolución, FPS cuando disponible, primeros 1–3 segundos/hook, ritmo de escenas, subtítulos, idioma, voz, música, audio original/licencia, silencios y CTA final. |
| Texto y tipografía | Headline, primary text, caption, descripción, longitud, idioma, tono, legibilidad, familia/tamaño/peso de tipografía si controlable, alineación, claims, emojis, hashtags y evidencia de cada claim. |
| Botones y CTA | Tipo, etiqueta, color, tamaño, posición, orden, destino, acción, microcopy y función (comprar, cotizar, reservar, WhatsApp, llamar, registrarse, descargar, visitar, etc.). |
| Landing y experiencia | URL, velocidad, móvil/escritorio, continuidad mensaje-anuncio, formulario, número de campos, fricción, accesibilidad, disponibilidad, checkout y conversión por paso. |
| Oferta y producto | SKU, precio, descuento aprobado, bundle, envío, financiación, stock, beneficio, garantía, vigencia, margen y restricciones comerciales. |
| Segmento y audiencia | Segmento/ICP, etapa de funnel, país/ciudad cuando sea lícito y necesario, intereses o criterios permitidos, exclusiones, tamaño, solapamiento, idioma y elegibilidad. |
| Ubicación y formato | Feed/story/reels/short video/search/placement u opción específica del proveedor, dispositivo, placement, formato y especificaciones. |
| Tiempo y calendario | Día de semana, fecha local, hora, zona horaria de la cuenta, temporada, festivo, evento local, horario del negocio, franja de atención y duración de campaña. |
| Estructura y delivery | Objetivo, optimization event, bid strategy, presupuesto, pacing, estado de aprendizaje/entrega, frecuencia, alcance, impresiones y cambios de configuración. |
| Canal/proveedor | TikTok/Meta/ChatGPT, producto API, API version, cuenta, formato nativo, ad type, endpoint, restricciones, cuenta/país elegible y serving issues. |
| Resultado | Vistas, retención, completitud de video, likes, comentarios, compartidos, guardados, clics, CTR, CPC, CPM, leads, leads cualificados, oportunidades, compras, CPA, ingresos, margen, devoluciones y LTV cuando la fuente lo soporte. |

Los campos de fuente y contexto deben ser versionados para que un análisis histórico no compare métricas distintas bajo un mismo nombre. Guardar las métricas nativas sin reescribirlas y, además, mapearlas a una taxonomía común documentando transformaciones y pérdidas de semántica.

### 7.4 Una hipótesis primaria por experimento

Por defecto se modifica una sola variable primaria entre V1 y V2, por ejemplo:

- misma imagen y mismo copy, distinto color/contraste;
- misma oferta y texto, fotografía A contra fotografía B;
- mismo creativo, CTA “Comprar” contra CTA “Solicitar cotización”;
- mismo anuncio, hook de los primeros segundos alternativo;
- mismo anuncio, hora de publicación distinta;
- misma landing, variante de formulario con menos campos.

Cambiar color, foto, botón, texto, horario, segmentación y presupuesto todo a la vez no permite atribuir la mejora a una causa. Para probar varias variables simultáneamente se requiere un diseño factorial/multivariante con tamaño muestral, control de interacciones y corrección por comparaciones múltiples. El motor debe explicarlo antes de lanzar.

### 7.5 Presupuesto y control de riesgo

- El budget total del experimento se divide entre celdas; no se duplica por crear V1 y V2.
- Respetar la política PD-024 existente: máximo de aumento de 20% por operación y acumulado sobre baseline rolling 24h; cambios por debajo del límite también requieren permisos y evidencia.
- No repartir artificialmente un aumento grande en varias llamadas para evadir el límite.
- Las operaciones que generan gasto necesitan approval, budget reservation, idempotency, audit y reconciliación.
- Si una plataforma controla la entrega y consume el budget de modo no uniforme, el panel muestra inversión real por variante y no solo el presupuesto solicitado.
- Definir caps por tenant, cuenta, campaña, experimento, celda, canal y periodo; soportar límites inferiores al máximo global.
- Nunca aumentar gasto automáticamente por una predicción aislada ni sin aprobación/opt-in explícito y controles aprobados por el propietario.

## 8. Diseño estadístico y reglas para decidir ganadores

### 8.1 Preregistro del experimento

Antes de observar resultados, guardar:

- pregunta de negocio e hipótesis falsable;
- población elegible y unidad de aleatorización;
- control, tratamientos y variante exacta de cada asset;
- única variable primaria (o diseño multivariante formal);
- KPI primario y métricas de guardia;
- baseline histórico y ventana de referencia;
- efecto mínimo detectable (MDE), confianza/potencia o criterio bayesiano predefinido;
- tamaño de muestra necesario por grupo;
- gasto máximo, fecha inicial/final y duración mínima;
- stop rules, riesgo de daño y ventana de maduración de conversión;
- método de asignación, plataforma, ad account, API version y evidencia de audiencia;
- attribution window y timezone de cada sistema.

### 8.2 Métricas de negocio

El KPI primario se selecciona según el objetivo real: coste por lead cualificado, tasa de lead a oportunidad, coste por compra, ingreso neto, margen de contribución, tasa de reserva, ROAS reconciliado o LTV cuando haya datos fiables. CTR, CPC, CPM, views y engagement sirven como diagnósticos/leading indicators, pero no deben sustituir el resultado comercial.

Las métricas mínimas de guardia incluyen gasto, frecuencia, rechazo/restricción, tasa de devolución/cancelación, calidad del lead, margen, experiencia de destino y señales de fraude. Un ganador de CTR que destruye margen o trae leads de mala calidad no es ganador de negocio.

### 8.3 Inferencia y decisiones

- Calcular estimaciones por grupo con denominador y ventana claros, diferencias absolutas/relativas e intervalos de confianza o intervalos creíbles.
- Definir previamente el método de inferencia (frecuentista o bayesiano) y evitar cambiarlo después de ver los datos.
- Controlar múltiples comparaciones si se prueban varios creativos, subgrupos o métricas.
- Corregir por maduración de conversión, latencia de reporting y cohortes todavía abiertas.
- Aplicar reglas de parada secuencial válidas o evitar detener el experimento por observación repetida no planificada.
- Distinguir `winner`, `loser`, `inconclusive`, `invalid`, `stopped_for_safety` y `not_causal`.
- Un ganador necesita superar umbral estadístico/práctico y guardrails comerciales; no basta con mayor cantidad bruta de conversiones si tuvo más impresiones o inversión.
- Si la muestra es pequeña, los datos están retrasados, existe SRM, cambió la audiencia o la plataforma no permite aleatorización controlada, el resultado queda inconcluso/observacional.
- No extrapolar automáticamente resultados entre canales, regiones, audiencias, categorías de producto, objetivos o temporadas.

### 8.4 Atribución e incremento causal

El sistema mostrará tres perspectivas separadas:

1. **Delivery/Insights del proveedor:** lo que la plataforma reporta dentro de su definición y ventana de atribución.
2. **Outcome first-party:** acciones confirmadas por el backend/CRM (lead, oportunidad, cierre, ingreso, margen, devolución), con deduplicación y consentimiento.
3. **Incrementalidad:** diferencia atribuible al tratamiento bajo un diseño experimental válido, grupo de control adecuado y supuestos transparentes.

No sumar ni comparar directamente métricas de plataformas diferentes sin armonizar definición, ventanas, zona horaria, moneda, evento y granularidad. Cuando sea posible realizar conversion lift/holdout nativo, registrar el reporte del proveedor como evidencia distinta del split aleatorio interno.

## 9. Motor de aprendizaje y optimización automática

### 9.1 Pipeline objetivo

```mermaid
flowchart TD
  A[Campaign + assets + business brief] --> B[Immutable V1 original]
  B --> C[Hypothesis and feature registry]
  C --> D[Generate V2 alternative]
  D --> E[Rights, brand, claims and policy checks]
  E --> F[Provider capability and preflight]
  F --> G[Human approval / spend reservation]
  G --> H[Randomized split or native experiment]
  H --> I[Delivery + Pixel/CAPI + CRM events]
  I --> J[Validate, dedupe and reconcile]
  J --> K[Statistical evaluation]
  K --> L{Valid evidence and business lift?}
  L -->|Yes| M[Recommend winner / next round]
  L -->|No / unclear| N[Inconclusive, stop or collect data]
  M --> O[Generate V3/V4 drafts]
  O --> E
```

### 9.2 Servicios lógicos

- **Campaign Snapshot Service:** captura inmutable y diff de cada cambio externo.
- **Creative Variant Service:** crea variantes con provenance, derechos, claims, brand kit, similarity fingerprint y enlaces entre generaciones.
- **Experiment Registry:** preregistro, celdas, asignación, exposure events, hipótesis, MDE y stop rules.
- **Experiment Assignment Service:** randomización estable, persistencia y detección SRM/contaminación.
- **Provider Measurement Ingestion:** recupera métricas nativas, eventos, report jobs, webhooks y snapshots por plataforma.
- **First-party Outcome Collector:** eventos server-side de CRM, pagos, ecommerce, agenda o fuente empresarial con idempotencia.
- **Feature Store:** features por creative, placement, contexto, audiencia, negocio y tiempo con linaje, calidad, frescura y privacidad.
- **Experiment Evaluation Engine:** análisis estadístico, comparación control/tratamiento, intervalos, control múltiple y conclusión.
- **Recommendation Engine:** ranking de recomendaciones por uplift esperado, confianza, coste, impacto en margen, riesgo y aplicabilidad.
- **Creative Generation Gateway:** redacta/genera propuestas mediante proveedores IA aprobados; no recibe credenciales de plataformas ni publica directamente.
- **Policy & Approval Gateway:** derechos, consentimiento, brand, claims, regulación, presupuesto, tenant, scopes y aprobación.
- **Execution/Reconciliation Worker:** publica únicamente commands aprobados, procesa estados, retries, unknown outcomes, reconcile y rollback/pause.

### 9.3 Generación y recomendación

El motor debe soportar dos modos:

- **Recomendar:** explicar el elemento que conviene cambiar, por qué, para qué segmento/canal, con cuál evidencia y qué incertidumbre.
- **Generar borrador:** producir una nueva creatividad o configuración con lineage de V1/V2/campeón anterior, versión de prompt/modelo, features cambiadas, revisión y preview. No publicar automáticamente por el simple hecho de generarla.

Toda recomendación debe incluir como mínimo: hipótesis, cambio propuesto, KPI esperado, supporting evidence, tamaño de muestra, confianza/intervalo, mercado/segmento donde aplica, fecha de datos, contraindicaciones, coste estimado, policy checks, riesgos, approval required y razón por la cual podría no funcionar.

### 9.4 Modelos y separación de responsabilidades

- Mantener Campaign Intelligence como lógica estadística/ML del producto, reutilizando la estrategia CPU-first documentada en `docs/62-CRM-MACHINE-LEARNING-STRATEGY.md` cuando aplique.
- El LLM/generador creativo es una capacidad separada detrás de AI Assistance Gateway. No debe reemplazar la inferencia estadística, la evaluación de causalidad ni las reglas de negocio.
- No pasar tokens, cookies, secretos, identificadores sensibles innecesarios o payloads privados de clientes a modelos externos.
- Registrar dataset/version, feature definitions, training window, evaluation, drift y approval de promoción del modelo. Las predicciones se etiquetan como estimaciones, no garantías.
- Medir performance por segmento y canal; detectar model drift, sample bias y feedback loops. Un modelo no puede autoentrenarse con resultados contaminados o sin consentimiento/retención permitida.

## 10. Arquitectura técnica: proveedor desacoplado y SOLID

### 10.1 Ports y adapters por capacidad

Definir contratos pequeños y cohesivos por responsabilidad; no una interfaz universal con decenas de métodos. Por ejemplo:

- `CampaignManagementPort`
- `AdGroupManagementPort`
- `AdManagementPort`
- `CreativeAssetPort`
- `CreativePreviewPort`
- `OrganicPublishingPort`
- `AudienceManagementPort`
- `LeadRetrievalPort`
- `BusinessMessagingPort`
- `InsightsReportingPort`
- `ConversionMeasurementPort`
- `ExperimentAllocationPort`
- `AccountAuthorizationPort`
- `ProviderCapabilityRegistryPort`

Cada proveedor implementa únicamente las capacidades que soporta. Se usa composición y descubrimiento por capability; no se usa `if provider === ...` extendido por todo el dominio. Los límites de cada API y diferencias de payload se conservan en adapters.

### 10.2 Modelo canónico sin pérdida de semántica

- Identificadores remotos con namespace (`provider`, `product`, `account`, `resource_type`, `remote_id`).
- Modelo compartido mínimo para campañas, grupos, anuncios, assets, eventos, reportes y experimentos.
- Payload original saneado/cifrado y snapshot versionado; los campos nativos se preservan en extensión específica por proveedor.
- Currency, timezone, locale, attribution model y report freshness son campos explícitos.
- No mapear automáticamente un objetivo, evento o estado de una plataforma a otro si no tienen equivalencia semántica demostrada.
- Los capability descriptors se versionan y guardan referencia de fuente, fecha, expiración y evidencia.

### 10.3 Persistencia y eventos

Extender el modelo con aggregates/repositorios tenant-scoped y RLS. Entidades sugeridas (los nombres finales deben revisarse contra el esquema actual):

- `provider_connections`, `provider_account_assets`, `provider_capability_evidence`;
- `campaign_snapshots`, `campaign_experiments`, `experiment_rounds`, `experiment_cells`;
- `creative_assets`, `creative_variants`, `creative_feature_values`, `creative_rights_evidence`;
- `experiment_assignments`, `experiment_exposures`, `experiment_observations`, `experiment_results`;
- `provider_insights_snapshots`, `conversion_events`, `business_outcomes`;
- `recommendations`, `recommendation_evidence`, `approval_requests`, `external_commands`;
- `ad_spend_ledger`, `budget_reservations`, `provider_webhook_inbox`, `integration_outbox`.

Todos los aggregates multi-tenant deben tener `tenant_id`, control de ownership/grants, actor/purpose, audit, timestamps, optimistic concurrency cuando proceda, idempotency key y política de retención. Ingesta de provider debe soportar eventos duplicados y desordenados.

Eventos de dominio candidatos:

- `ads.provider_connection.updated`
- `ads.provider_capability.observed`
- `ads.campaign.snapshot_captured`
- `ads.experiment.created`
- `ads.experiment.assignment_created`
- `ads.experiment.exposure_recorded`
- `ads.creative.variant_created`
- `ads.experiment.observation_ingested`
- `ads.experiment.sample_mismatch_detected`
- `ads.experiment.evaluated`
- `ads.recommendation.created`
- `ads.recommendation.approved`
- `ads.external_command.requested`
- `ads.external_command.reconciled`
- `ads.spend.reconciled`

Cada evento requiere schema versionado, envelope universal, event ID estable, tenant/actor/purpose, correlation/causation IDs, provenance, clasificación de datos y política de retención.

## 11. Diseño de datos y panel de resultados

### 11.1 Vista comparativa de versiones

Para toda pareja de versiones el usuario podrá consultar:

- V1 original vs V2 alternativa, hash de configuración y vista previa por placement;
- variable primaria, hipótesis, assets, diferencias exactas y elementos mantenidos constantes;
- distribución asignada, población elegible, exposición servida, alcance, impresiones, inversión y estado;
- delivery/learning/serving issues reportados por cada proveedor;
- resultados de funnel: visita, interacción, lead, lead cualificado, oportunidad, compra, ingreso, margen y devolución;
- CPA/CPL/ROAS y definiciones/fuentes; intervalo y tamaño de muestra;
- fecha/hora local y UTC, attribution window, moneda, freshness y lag;
- conclusión y tipo de evidencia: causal, atribuida, observacional o inconclusa;
- recomendación de qué hacer después y qué evidencia la respalda.

### 11.2 Datos temporales

Almacenar `occurred_at`, `received_at`, `reported_at`, `timezone`, granularidad y periodo del proveedor. El día de una cuenta se interpreta en timezone de cuenta, no en el timezone del servidor. Para campañas ecuatorianas usar `America/Guayaquil` cuando esa sea la zona configurada; no imponer una única zona a cuentas de otros países.

### 11.3 Retención y exportación

Definir retención por clase de información, finalidad, jurisdicción, proveedor y contrato. Ofrecer exportación/eliminación cuando aplique; separar logs técnicos y auditoría de PII. Las métricas agregadas no se considerarán anónimas automáticamente si aún permiten reidentificación.

## 12. Seguridad, privacidad y compliance

1. Aislamiento tenant en APIs, DB/RLS, storage, cache, queues, logs, dashboards y feature store.
2. OAuth y tokens con scopes mínimos, refresh seguro, rotación, revocación, cifrado, redacción y separación de secretos por proveedor/entorno.
3. Token exchange en backend; nunca persistir credenciales en browser storage ni exponerlas en errores.
4. `purpose` y consentimiento verificables antes de recolectar eventos, construir audiencias o procesar datos de contacto.
5. Aplicar LOPDP de Ecuador cuando corresponda y requisitos jurisdiccionales de cada país/canal; revisión legal especializada antes de datos reales/producción.
6. No usar targeting discriminatorio o categorías sensibles; respetar restricciones sobre menores, vivienda, empleo, crédito, salud, política y demás categorías sujetas a reglas especiales del proveedor/jurisdicción.
7. Evidencia de derechos para imagen, video, música, voz, personas, UGC, marcas, influencers y licencia de publicidad pagada.
8. Validar claims, precios, disponibilidad, descuentos y resultados; no generar promesas engañosas ni afirmaciones no probadas.
9. Revisar el contenido generado y la política de disclosure/etiquetado de IA, branded content, Spark Ads e influencers por plataforma.
10. Toda operación externa de escritura tiene dry-run/preflight, snapshot, approval hash, actor distinto cuando la matriz de riesgo lo exija, idempotencia, audit, kill switch y reconciliación.
11. El servicio debe tratar `unknown` como bloqueo y no reintentar operaciones externas de forma ciega.
12. Definir aislamiento por credencial, rate limiting por tenant y cuenta, circuit breaker, cuotas y backpressure.
13. Auditoría append-only de cambios de campaña, presupuesto, targeting, assets, experimentos, asignaciones, resultados y decisiones del motor.
14. Separar secretos de Ads, claves de eventos CAPI, credenciales de TikTok OAuth y credenciales de servicios IA; rotación independiente.

## 13. Experiencia del frontend `app-meta-ecuapp`

El frontend debe representar todos los proveedores y evitar que el nombre de la aplicación determine los límites técnicos.

Secciones de producto propuestas:

- **Conexiones:** TikTok, Meta y ChatGPT Ads; estado, cuenta, scopes, assets, expiración y reconexión.
- **Campañas:** lista unificada con filtros por canal, objetivo, estado, cuenta, fecha y presupuesto.
- **Campaign Builder:** briefs, campaña, grupos, ads, assets, calendario, presupuesto, targeting y validaciones por proveedor.
- **Creative Lab:** biblioteca de assets, brand kit, permisos/derechos, generación, variantes, preview y revisión.
- **Experimentos A/B:** versión original y alternativa, hipótesis, variable, método de asignación, cuotas, cronograma y estado.
- **Resultados:** panel comparativo de V1/V2, métricas de delivery y negocio, confianza, causalidad y explicaciones.
- **Recomendaciones:** cambios sugeridos, nivel de confianza, evidencia, riesgos, coste y flujo de aprobación.
- **Automatizaciones:** reglas de generación de borradores, análisis programado, alertas y propuesta de experimentos.
- **Auditoría y gastos:** autorizaciones, cambios, budget reservations, spend ledger y reconciliación.

Usar permisos RBAC/ABAC, estados de loading/error/unknown, accesibilidad WCAG 2.2 AA y diseño responsive. No mostrar botones de activar/publicar si la capability no está probada, falta scope o no se cumple approval.

## 14. Nuevas historias y tareas propuestas

Los siguientes identificadores son el siguiente rango libre verificado en los documentos consultados (historias hasta US-032 y tareas hasta TASK-080). Se deben reconciliar una vez más con el backlog antes de su incorporación definitiva.

### Historias de usuario

| Historia | Prioridad | Resultado |
|---|---|---|
| US-033 | P1 | Como equipo de producto quiero que la aplicación frontend se identifique como `app-meta-ecuapp` sin mover ni romper el backend. |
| US-034 | P0 | Como marketer quiero conectar TikTok y administrar las capacidades de marketing, contenido orgánico, reporting, leads y mensajería que estén oficialmente disponibles y autorizadas. |
| US-035 | P0 | Como anunciante quiero gestionar campañas oficiales de ChatGPT Ads, activos y medición desde WhatsBusiness con controles de seguridad y gasto. |
| US-036 | P0 | Como marketer quiero que cada experimento cree una pareja V1 original/V2 alternativa, la distribuya con método válido y aprenda de datos de plataforma y CRM para recomendar nuevas versiones. |

### Tareas de implementación propuestas

| TASK | Historia | Alcance | Dependencias principales | Entregable / aceptación |
|---|---|---|---|---|
| TASK-081 | US-033 | Rename `apps/web` → `app-meta-ecuapp`, Nx/Angular/workspace/CI/docs | TASK-039; baseline workspace | Build/test/typecheck del monorepo con ruta nueva y `apps/api` intacto. |
| TASK-082 | US-034 | TikTok Marketing API: account, campaigns, ad groups, ads, creative, audience, leads, catalog, reporting y Upgraded Smart+ | TASK-010, 024, 025, 056, 072 | Adapters versionados, capability matrix, contratos y pruebas de cuenta/sandbox. |
| TASK-083 | US-034 | TikTok Login Kit, Organic API, Content Posting, Display, Share Kit, TTO y Business Messaging | TASK-027, 028, 036, 047, 056 | OAuth, scopes, posts/drafts, webhook y business messaging con consent y handoff. |
| TASK-084 | US-034 | TikTok Insights/measurement ingestion, event mapping y CRM/Inbox integration | TASK-023, 026, 029, 068, 072, 078 | Snapshots reconciliados, leads/eventos deduplicados y dashboard con freshness. |
| TASK-085 | US-035 | OpenAI Advertiser API: account, campaigns, ad groups, ads, files/assets, feeds, preview, review, audit e Insights | TASK-024, 025, 056, 067, 072 | Adapter oficial, lifecycle paused-first, capability evidence, schemas y pruebas. |
| TASK-086 | US-035 | OpenAI Measurement Pixel, Conversions API, conversion settings y reporting | TASK-026, 059, 068, 077, 078 | Eventos con consentimiento, credenciales separadas, dedupe y reconciliación. |
| TASK-087 | US-036 | Orquestador de versiones V1/V2 y asignación experimental persistente | TASK-067, 069, 070, 072, 082, 085 | Par inmutable, split válido, SRM, exclusión, preflight, budget split y stop rules. |
| TASK-088 | US-036 | Feature Store y taxonomía de métricas multicanal, conversiones y outcomes | TASK-068, 072, 077, 078, 084, 086 | Datos versionados, fuente/fecha/contexto/calidad y reporting armonizado sin pérdida. |
| TASK-089 | US-036 | Motor de aprendizaje, ranking de recomendaciones y generación autónoma de borradores | TASK-067, 069, 070, 077, 078, 087, 088 | Recomendaciones explicables, confianza, nuevas variantes draft y aprobación obligatoria. |
| TASK-090 | US-034/035 | Capability Registry y monitor de drift para TikTok/OpenAI Ads | TASK-056, 065, 082, 083, 085 | Fuente oficial, fecha, versión, scope, región, elegibilidad, alertas y tareas de migración. |
| TASK-091 | US-034/035/036 | Hardening multicanal: spend ledger, cuotas, auditoría, retención, rights/brand, reconciliación y observabilidad | TASK-029, 031, 032, 059, 071, 080, 082..089 | Controles cross-provider, alertas, replay/DR y gates independientes. |

**Regla de estados:** una tarea no pasa a `verified` por tener una interfaz, DTO o schema. Se requiere código conectado, persistencia cuando aplique, contract tests, integración sintética, evidencia CI sobre el commit exacto y revisión independiente. `accepted` requiere aprobación del Product Owner.

## 15. Criterios de aceptación globales

- AC-036-01: cada experimento nuevo contiene V1 original y V2 alternativa inmutables, relacionadas con snapshot, source hash y lineage.
- AC-036-02: cada V2 documenta hipótesis, variable primaria, KPI, control, diferencia exacta y elementos constantes.
- AC-036-03: la asignación es estable, reproducible y auditable. El sistema identifica el método (native split, randomized split, disjoint audiences u observacional) y no confunde asignación con impresiones efectivas.
- AC-036-04: el motor detecta SRM, tráfico inválido, audiencias contaminadas, muestra insuficiente, freshness insuficiente y datos duplicados; bloquea conclusiones inválidas.
- AC-036-05: cada recomendación muestra evidencia, denominador, ventana, confianza, uncertainty, coste, impacto comercial y limitaciones.
- AC-036-06: las métricas del proveedor, outcomes CRM y uplift causal están separados y reconciliados.
- AC-036-07: el usuario puede inspeccionar la pareja V1/V2, la distribución, el gasto real, los assets, los previews y los resultados por canal.
- AC-036-08: el motor puede generar una siguiente versión draft a partir de un hallazgo con lineage; no la publica ni activa sin permiso y aprobación.
- AC-036-09: los ganadores existentes se conservan; cada cambio posterior crea snapshot, versión y audit.
- AC-036-10: los budgets por experimento/celda suman el presupuesto reservado y no superan caps/PD-024 ni límites del proveedor.
- AC-036-11: todo provider adapter registra capability versionada por cuenta, producto, operación, scope, región y vigencia.
- AC-036-12: los permisos de cada proveedor se validan server-side y la ausencia/expiración de evidencia bloquea la escritura externa.
- AC-036-13: eventos TikTok/OpenAI y de CRM se deduplican, conservan source IDs y cumplen consentimiento y retención.
- AC-036-14: no existe ninguna API key o access token en frontend, artefactos, logs o código versionado.
- AC-036-15: el cambio de frontend renombra Angular/Nx sin afectar la aplicación NestJS ni las rutas de backend.
- AC-036-16: se completa contract, security, performance, regression y review independiente antes de habilitar producción.

## 16. Plan de ejecución y gates

### Gate A — Arquitectura e inventario

- Revisar contratos OpenAPI/AsyncAPI actuales y dependencias TASK-024/025/026/056/067..080.
- Revalidar referencias oficiales, productos, versiones, endpoints, permisos y deprecaciones por plataforma.
- Congelar interfaces cohesivas, domain events, schemas, persistencia y ADR de integración.
- Identificar cuentas de sandbox/test y límites de aprobación.

### Gate B — Fundaciones multicanal

- Completar el rename frontend sin tocar `apps/api`.
- Ampliar capability registry, provider connections, OAuth, secret storage, audit y webhook inbox/outbox.
- Integrar TikTok y OpenAI adapters en modo lectura/sandbox/fail-closed antes de habilitar escrituras.

### Gate C — Campaign lifecycle y medición

- Completar creación/gestión/preview/pausa y reconciliación de campañas por proveedor.
- Integrar Insights, Pixel/CAPI, CRM outcomes y deduplicación.
- Construir feature registry y normalización temporal/monetaria.

### Gate D — Experimentos V1/V2

- Completar pair generation, preregistro, persistent assignment, audience partition y SRM.
- Implementar presupuesto reservado, aprobación y stop rules.
- Ejecutar pruebas sintéticas de aleatorización, integridad, latencia, muestras y fallos de provider.

### Gate E — Aprendizaje y recomendaciones

- Implementar inferencia estadística, incrementalidad, model evaluation y feature quality.
- Generar recomendaciones explicables y drafts de V3/V4 sin publicación automática.
- Validar resultados con marketers, analistas, ventas y finanzas; revisar sesgos y falsos positivos.

### Gate F — Producción controlada

- Completar App Review/Business verification, acceso comercial, credenciales reales y consent/legal review.
- Establecer límites por cuenta/tenant, runbooks, dashboards, alertas, kill switch, backups y plan de rollback.
- Habilitar primero bajo aprobación explícita, cohortes pequeñas y presupuestos bajos previamente autorizados.
- No abrir gasto autónomo hasta que el propietario apruebe por separado el control de riesgo, el modo de autonomía y los límites.

## 17. Estrategia de pruebas y evidencia requerida

**Unitarias/domain:** versionado, snapshots, presupuesto decimal, asignación determinística, SRM, audiencia solapada, stop rules, expiración de capabilities, derechos, claims, ranking y confidence.

**Property-based:** idempotencia de assignment, invariantes de budget, suma de celdas, no reasignación de una unidad, consistencia de hashes y monotonicidad del lineage.

**Contract:** fixtures por versión/operación/endpoint de TikTok y OpenAI, payloads válidos e inválidos, scopes, errores, rate limits, paginación, webhooks y cambios de schema.

**Integration:** PostgreSQL/RLS, outbox/inbox, colas, object storage, OAuth token refresh, reconciliación y dedupe Pixel/CAPI.

**Experiment simulation:** muestras desbalanceadas, pérdidas de eventos, ruido, conversión retardada, tráfico bot, overlap, contaminación, efecto nulo, efecto adverso y MDE no alcanzado.

**Security:** BOLA, tenant escape, token leakage, replay, webhook spoofing, SSRF/URL safety, prompt injection, supply chain, data export/delete y permisos de agent tools.

**E2E/sandbox:** conectar cuenta autorizada, construir campaña pausada, publicar solo en sandbox/test cuando permitido, recibir insights y eventos sintéticos, comparar V1/V2, pausar y reconciliar.

**Prueba real externa:** App Review, aprobación de scopes, cuenta real, política y resultados reales son gates externos. Su ausencia no debe impedir completar el 100% del código, contratos y simulaciones; sí impide marcar provider integration o producción como verified/accepted.

## 18. Documentación y trazabilidad que se debe mantener

En el mismo cambio que implemente las tareas nuevas, actualizar:

- `docs/10-USER-STORIES.md` — historias US-033..036 y criterios.
- `docs/11-TASK-BACKLOG.md` — TASK-081..091, prioridad, dependencias y estado real.
- `docs/18-EXECUTION-GRAPH.md` — DAG de rename, TikTok, OpenAI Ads, medición y learning.
- `docs/19-TRACEABILITY-MATRIX.md` — requisito → historia → tarea → contrato → módulo → tests → evidencia.
- `docs/47-API-INVENTORY-AND-TASK-MAP.md` — nuevos API IDs y relación a tareas una vez definidos los schemas.
- `docs/09-API-INTEGRATION-CATALOG.md` — mantenerlo Meta-specific o documentar explícitamente su alcance; no mezclar productos ajenos dentro de esa ficha Meta.
- Crear un inventario transversal de provider APIs si el equipo decide separarlo de este documento.
- `docs/14-AUDIT-AND-CHANGELOG.md` — registrar decisiones y resultados de cada incremento.
- `docs/README.md` — indexar esta especificación.
- `docs/02-SHORT-TERM-MEMORY.md`, roadmap y registro de investigación — reflejar solo hechos comprobados.

Cada entrega debe indicar commit SHA, paths, tests y workflows exactos, restricciones, operaciones externas no ejecutadas, reviewer y siguiente dependencia. No declarar tareas completas por haber agregado documentación.

## 19. Riesgos principales y mitigaciones

| Riesgo | Mitigación |
|---|---|
| API, scope o acceso no disponible para una cuenta | Capability evidence versionada y fail-closed; comunicar alcance alternativo sin fingir cobertura. |
| Endpoint TikTok legacy deja de crear determinados flujos en 2027 | Upgraded Smart+ en workflows afectados y tests de deprecación/migración. |
| Entrega de plataforma rompe el supuesto 50/50 | Split nativo o audiencia disjunta; registrar asignación y delivery; SRM y etiqueta observacional si no es causal. |
| Optimización por CTR crea leads malos | KPI downstream y margen/calidad del CRM como métrica primaria/guardia. |
| Doble conteo de conversiones | Event ID, provider dedupe, inbox idempotente y ledger reconciliado. |
| Variantes sin licencia o claims engañosos | Rights, consent, brand and claim validation, review y audit antes de publicarlas. |
| Gasto accidental o escalado excesivo | PD-024 +20%, caps menores por tenant, preflight, budget reservation, two-person approval donde aplique y kill switch. |
| Sesgo/estacionalidad/fecha/hora confundida con efecto creativo | Preregistro, ventanas comparables, control de calendario, segmentación y diseños multivariantes válidos. |
| Datos sensibles o transferencia no autorizada | Consentimiento, minimización, seudonimización, retención, revisión LOPDP y controles jurisdiccionales. |
| Falsa autonomía de IA | Separar recomendación/draft de ejecución; approval gateway y supervisión humana. |
| Modelo se degrada o aprende de datos erróneos | Quality gates, drift, evaluación temporal, holdout y rollback de modelos/recomendaciones. |
| Una integración arrastra otras o genera acoplamiento | Bounded contexts, adapters por proveedor y contratos pequeños por capacidad. |

## 20. Decisiones arquitectónicas propuestas

1. **ADR propuesto — provider-agnostic campaign domain:** el dominio de campañas y experimentos no depende de SDK/API de Meta, TikTok u OpenAI.
2. **ADR propuesto — adapters por producto y capacidad:** no se fuerza paridad de funcionalidades entre proveedores.
3. **ADR propuesto — experiment assignment service:** asignación determinística y persistente, con native split cuando se pueda probar.
4. **ADR propuesto — evidence-first ML:** recomendaciones se sustentan en datos con freshness/calidad/provenance y explican incertidumbre.
5. **ADR propuesto — draft-first autonomy:** la IA genera y recomienda; la publicación y el gasto respetan approval y budget guardrails.
6. **ADR propuesto — frontend project rename:** únicamente el proyecto Angular se muda/renombra, conservando `apps/api`.

Estas decisiones requieren reconciliación con ADRs ya existentes y registro formal con el siguiente número libre antes de implementación; este documento no les asigna IDs definitivos.

## 21. Fuentes oficiales consultadas

Corte de consulta: **2026-11-09**. Los endpoints, versiones, scopes, disponibilidad geográfica, límites, precios y políticas son datos volátiles; volver a consultar cada fuente oficial al crear el contrato y antes de release.

### OpenAI Ads

- Overview / Advertiser API: <https://developers.openai.com/ads/api-overview>
- Quickstart: <https://developers.openai.com/ads/api-quickstart>
- Campaign Management: <https://developers.openai.com/ads/campaign-management>
- API Reference — Insights: <https://developers.openai.com/ads/api-reference/insights>
- Conversion Tracking: <https://developers.openai.com/ads/conversion-tracking>
- Conversions API: <https://developers.openai.com/ads/conversions-api>
- Conversion Setup API Reference: <https://developers.openai.com/ads/api-reference/conversion-setup>

### TikTok

- TikTok API for Business — overview: <https://business-api.tiktok.com/gateway/docs/index>
- TikTok Marketing API v2.0: <https://business-api.tiktok.com/portal/docs/marketing-api/v2.0>
- TikTok API for Business — About the Guide: <https://business-api.tiktok.com/portal/docs?id=1738855099573250>
- Content Posting API: <https://developers.tiktok.com/products/content-posting-api>
- Direct Post setup and scope requirements: <https://developers.tiktok.com/docs/en/content-posting-api-get-started>
- Display API: <https://developers.tiktok.com/doc/display-api-get-started>
- Login Kit token management: <https://developers.tiktok.com/docs/en/login-kit-manage-user-access-tokens>

### Repositorio WhatsBusiness

- `AGENTS.md` — contrato de trabajo obligatorio de agentes.
- `docs/09-API-INTEGRATION-CATALOG.md` — catálogo de integraciones Meta.
- `docs/18-EXECUTION-GRAPH.md` — dependencias vigentes.
- `docs/36-CAMPAIGN-INTELLIGENCE-AND-GUARDED-SCALING.md` — Campaign Intelligence y guardrails.
- `docs/48-CODING-ARCHITECTURE-AND-REUSE-STANDARD.md` — arquitectura, SOLID y reutilización.
- `docs/53-TASK-WORK-PACKAGES.md` — tareas TASK-067..080.
- `docs/94-REPOSITORY-CLEANUP-STATUS.md` — rama canónica y pendientes administrativos.

---

## 22. Estado de cierre de esta especificación

- [x] Se inspeccionó la estructura de `environment/local`, manifests Angular/Nx/pnpm, módulos Ads/Creative Lab y documentación de backlog/roadmap/trazabilidad.
- [x] Se identificó que `apps/` también contiene `apps/api`; por tanto, el cambio de frontend no debe renombrar/eliminar todo ese directorio.
- [x] Se identificaron slices existentes de Campaigns/Creative Lab/experiment; este alcance los amplía en vez de duplicarlos.
- [x] Se incorporaron familias oficiales de APIs TikTok y OpenAI Ads con gates de elegibilidad y límites.
- [x] Se definió semántica V1/V2, asignación estable, métricas, método estadístico y límites de autonomía.
- [x] Se añadieron mejoras de privacidad, atribución, derechos, observabilidad, presupuesto y drift detectadas en auditoría.
- [ ] Migración de frontend implementada y validada.
- [ ] Integraciones TikTok y OpenAI Ads implementadas y verificadas por cuenta/entorno.
- [ ] Motor multicanal A/B y learning implementado, validado y revisado independientemente.
- [ ] Contratos, backlog, grafo y matriz de trazabilidad actualizados con evidencia runtime.
- [ ] Aceptación final del Product Owner.

**Conclusión:** esta entrega define la ampliación completa del producto y la ruta técnica. No marca como implementadas las APIs, el rename ni el aprendizaje automático. El objetivo de ejecución es completar el código y las pruebas sintéticas de todos los requisitos aprobados sin bloquearse por accesos externos; los gates de proveedor, revisión legal, gasto y producción deben permanecer explícitos hasta contar con evidencia real y autorización.