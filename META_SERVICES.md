# META_SERVICES.md
## Especificación funcional, técnica y de arquitectura para la integración integral con Meta

**Producto:** WhatsBusiness  
**Repositorio:** [JhonnyMinian92/WhatsBusiness](https://github.com/JhonnyMinian92/WhatsBusiness)  
**Fecha de corte de investigación:** 6 de noviembre de 2026  
**Estrategia:** integración directa, oficial y multi-tenant con Meta; cobertura amplia; arquitectura extensible y polimórfica. La arquitectura normativa posterior es modular monolith (docs/30 y docs/33), no microservicios por endpoint.  
**Estado:** documento de investigación y decisiones de arquitectura. No contiene código inicial ni representa una implementación.

---

# 1. Decisión ejecutiva: qué se debe implementar

La solución recomendada es construir una **plataforma de integración directa con Meta**, orientada a empresas y proveedores tecnológicos, usando las APIs oficiales de cada producto y los mecanismos de onboarding diseñados por Meta para conectar activos de terceros.

La regla de selección es: **máxima capacidad oficial, control operativo y cobertura funcional**, incluso cuando aumenten la complejidad, el coste de infraestructura o el tiempo de certificación.

## 1.1 Arquitectura de integración seleccionada

| Dominio | Implementación elegida | Función estratégica |
|---|---|---|
| WhatsApp | WhatsApp Business Platform - Cloud API | Mensajería bidireccional, medios, plantillas, estados y eventos. |
| Administración WhatsApp | WhatsApp Business Management API | WABA, números, plantillas, activos, analytics, configuración y ciclo de vida. |
| Alta de clientes WhatsApp | Embedded Signup | Onboarding delegado para conectar activos de clientes sin pedir sus contraseñas. |
| Marketing WhatsApp | Marketing Messages API para tráfico promocional; Cloud API para capacidades de servicio/transaccionales elegibles | Mantener separados marketing, service/utility/auth y sus contratos de envío. No iniciar nuevas dependencias de marketing en la ruta Cloud API legacy. |
| Experiencias WhatsApp | WhatsApp Flows API | Formularios, calificación de leads, reservas, cotizaciones, solicitudes y procesos estructurados. |
| Facebook | Graph API + Pages API | Activos, publicaciones, comentarios, moderación, lectura permitida y métricas de Páginas. |
| Atención Facebook | Messenger Platform | Inbox, mensajes, adjuntos, plantillas, eventos de conversación y atención humana. |
| Captación | Lead Ads / Lead Retrieval | Formularios instantáneos, captura por webhook, recuperación histórica y trazabilidad de campañas. |
| Publicidad | Marketing API | Cuentas publicitarias, campañas, conjuntos, anuncios, creatividades, audiencias permitidas e Insights. |
| Medición | Conversions API + Pixel/SDK cuando corresponda | Eventos server-side, atribución, deduplicación y optimización de campañas. |
| Instagram | Instagram Graph API con Facebook Login + Instagram Login | Cobertura combinada de activos vinculados a Páginas y acceso directo a cuentas profesionales. |
| Atención Instagram | Instagram Messaging API | Mensajes directos y gestión de conversaciones permitidas. |
| Extensión social | Threads API | Publicación, respuestas, perfiles e Insights compatibles con los permisos habilitados. |

No se debe basar el producto en APIs no oficiales, scraping, automatización de WhatsApp Web, emulación de clientes, librerías que simulan sesiones ni acceso a perfiles personales. Tampoco se debe construir sobre WhatsApp On-Premises API: Meta indica que está obsoleta y recomienda Cloud API. La colección oficial de Meta distingue expresamente Cloud API, Business Management API, Flows y Embedded Signup, y reserva Business Management API para proveedores que administran cuentas propias o de clientes.  
Fuentes: [WhatsApp Business Platform - Postman oficial](https://www.postman.com/meta/whatsapp-business-platform/overview), [Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/overview).

## 1.2 Por qué se elige esta combinación

1. **Cloud API como transporte de WhatsApp:** Meta la aloja; el producto no debe operar infraestructura de servidores de WhatsApp ni mantener una integración no soportada.
2. **Business Management API y Embedded Signup como plano de control:** son las piezas apropiadas para administrar activos y conectar negocios clientes.
3. **Marketing Messages API desde el diseño inicial:** el endpoint de marketing de Cloud API tiene fecha de retirada anunciada para el 13 de octubre de 2027. Implementar ahora el destino de migración evita una refactorización urgente.
4. **Facebook Login y una autorización directa de Instagram:** la modalidad de Instagram Login no ofrece acceso a Ads ni a tagging; Facebook Login cubre mejor las cuentas profesionales vinculadas a una Página y las funciones relacionadas con publicidad. Añadir la autorización directa de Instagram cubre los escenarios de conexión propios de ese producto. No se debe fingir que una modalidad cubre todas las funciones.
5. **Marketing API y Conversions API como un dominio conjunto:** la plataforma no se limita a enviar leads; debe relacionar adquisición, formularios, campañas, atribución, calidad del lead y eventos de conversión.
6. **Polimorfismo por capacidades, no por el mínimo común denominador:** un contrato común facilita la operación, pero los payloads nativos, límites, permisos, políticas y funciones avanzadas se conservan.

## 1.3 Qué significa “producto completo”

El alcance no consiste solo en invocar endpoints. El producto final debe incluir:

- Conexión y desconexión de activos de empresas terceras.
- Gestión del ciclo de vida de tokens, permisos, cuentas y suscripciones.
- Inventario de activos Meta por tenant.
- Envío y recepción de mensajes y eventos.
- Plantillas y sus ciclos de aprobación, rechazo, pausa, calidad y actualización.
- Publicación y moderación de contenido donde la API lo autorice.
- Captura, recuperación y enriquecimiento de leads.
- Campañas, anuncios, creatividades, presupuestos e Insights, bajo aprobación.
- Integración de eventos web y CRM mediante Conversions API.
- Motor de reglas de mensajería, ventanas, consentimiento, frecuencia, costes y políticas.
- Webhooks confiables, idempotencia, reintentos, auditoría y reproducción de eventos.
- Observabilidad, conciliación de costes, pruebas, seguridad, documentación y controles de operación.

---

# 2. Estado de las APIs y versión de referencia

## 2.1 Versión de Graph API

A la fecha de corte, Meta publicó Graph API v27.0 y Marketing API v27.0 el 4 de noviembre de 2026. El anuncio indica que la versión incluye nuevas capacidades, deprecaciones y breaking changes. Es la versión anunciada más reciente en la fecha de esta investigación.  
Fuente: [Meta Developer News - Introducing Graph API v27.0 and Marketing API v27.0](https://developers.meta.com/resources/blog/).

Configuración de referencia:

- Graph API: <code>v27.0</code> para las familias de endpoints que soporten esa versión.
- Marketing API: <code>v27.0</code> para sus endpoints versionados.
- WhatsApp, Instagram y Messenger deben validar la versión efectiva y disponibilidad de cada endpoint; no se debe asumir que cada producto adopta las versiones al mismo ritmo.
- Host base estándar: <code>https://graph.facebook.com/{API_VERSION}/</code>.
- Instagram Login puede usar el host <code>https://graph.instagram.com/{API_VERSION}/</code>, según la operación.
- Marketing Messages API se debe implementar según el host y la referencia específicos de su producto; no construir la URL por inferencia.

La versión debe definirse en configuración tipada por producto y entorno. No se debe concatenar una constante escrita en cada servicio.

## 2.2 Política de evolución

Cada integración debe declarar:

- Producto Meta.
- API version.
- Fecha de revisión de changelog.
- Endpoints usados.
- Scopes requeridos.
- Contratos de request/response.
- Campos opcionales y obligatorios.
- Fecha de deprecación anunciada.
- Pruebas de contrato y fecha de última ejecución.

La actualización de versión debe pasar por pruebas de integración, canary por tenant interno y observabilidad de errores antes de generalizarse. Se debe poder mantener durante un periodo controlado más de una versión por producto cuando Meta lo permita y la migración de clientes lo exija.

**Regla:** no actualizar automáticamente la versión de producción sin pruebas; tampoco permanecer indefinidamente en una versión antigua. Mantener un calendario de revisión mensual de Developer News y changelogs.

---

# 3. Modelo mental del ecosistema Meta

Meta no ofrece una única API universal que habilite todas las redes. Comparte infraestructura Graph API en buena parte de su ecosistema, pero cada producto mantiene:

- Tipos de activos distintos.
- Tokens y sujetos de autorización distintos.
- Permisos distintos.
- Reglas de negocio distintas.
- Ventanas de comunicación distintas.
- Límites y cuotas diferentes.
- Modelos de webhook diferentes.
- Restricciones por país, tipo de cuenta, rol, revisión o estado de la app.

Por ello el backend debe tener un **Meta Control Plane** que administre conexiones y permisos, y un conjunto de **Product Adapters** que ejecuten operaciones propias de cada producto.

No crear una clase general que intente resolver todo con un único <code>MetaService.sendMessage()</code>. Esa abstracción elimina semántica y provoca errores operativos.

---

# 4. WhatsApp Business Platform: implementación completa

## 4.1 Productos y superficies que se deben integrar

### A. WhatsApp Cloud API

Es el transporte oficial para enviar y recibir mensajes de WhatsApp. El negocio conecta un número telefónico empresarial registrado en una WABA y la plataforma envía solicitudes a Meta. El backend recibe mensajes y estados mediante webhooks.

Ruta de envío principal:

<code>POST /{PHONE_NUMBER_ID}/messages</code>

Operaciones que debe soportar el adaptador:

- Mensaje de texto libre dentro de la ventana de atención permitida.
- Plantillas aprobadas fuera de la ventana.
- Plantillas de marketing, utilidad y autenticación, sujetas al producto y elegibilidad.
- Mensajes con imagen, audio, video y documento.
- Ubicación y contactos cuando el tipo de mensaje lo permita.
- Respuestas interactivas y botones compatibles.
- Listas interactivas.
- Reacciones cuando estén habilitadas.
- Mensajes de producto y catálogo.
- Mensajes multiproducto.
- Respuestas contextuales a mensajes.
- Marcadores de lectura cuando estén permitidos.
- Gestión de medios: subir, consultar y descargar contenido.
- Recepción de mensajes entrantes y sus metadatos.
- Seguimiento de estados: enviado, entregado, leído, fallido y demás estados que entregue el webhook.
- Datos de referencia de anuncios Click-to-WhatsApp cuando Meta los incluya en el mensaje.
- Perfiles y datos de contacto expuestos por la API y autorizados.

La aceptación HTTP de un mensaje no equivale a entrega. El resultado inicial puede proporcionar un identificador de mensaje; la confirmación de entrega, lectura o fallo llega por webhook. La aplicación debe modelar ese ciclo asíncrono.

### B. WhatsApp Business Management API

Debe ser el plano administrativo de WhatsApp. La colección oficial incluye operaciones para:

- Consultar WABA y activos asociados.
- Listar números registrados.
- Consultar información y configuración de números.
- Gestionar plantillas.
- Consultar plantillas por ID o nombre.
- Crear, editar y eliminar plantillas.
- Consultar y configurar elementos de comercio/catálogo.
- Consultar analytics de la cuenta.
- Configurar QR codes cuando la cuenta y el endpoint lo permitan.
- Suscribir la aplicación a los webhooks de la WABA.
- Administrar los recursos necesarios para operar cuentas de clientes.

El catálogo de plantillas documentado por Meta incluye ejemplos de plantillas de autenticación OTP, botones de copiar código, one-tap autofill, catálogos, mensajes multiproducto, encabezados de texto/imagen/ubicación/documento, botones de respuesta rápida y llamadas a la acción.  
Fuente: [Meta Postman - WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/overview).

Rutas habituales que deben encapsularse en el adaptador de Business Management:

| Operación | Ruta de referencia |
|---|---|
| Leer WABA | <code>GET /{WABA_ID}</code> |
| Listar números | <code>GET /{WABA_ID}/phone_numbers</code> |
| Listar plantillas | <code>GET /{WABA_ID}/message_templates</code> |
| Crear plantilla | <code>POST /{WABA_ID}/message_templates</code> |
| Consultar plantilla | <code>GET /{TEMPLATE_ID}</code> |
| Editar plantilla | <code>POST /{TEMPLATE_ID}</code> |
| Eliminar plantilla | <code>DELETE /{TEMPLATE_ID}</code> |
| Suscribir app a WABA | <code>POST /{WABA_ID}/subscribed_apps</code> |
| Analytics | <code>GET /{WABA_ID}?fields=analytics...</code> |
| Crear Flow | <code>POST /{WABA_ID}/flows</code> |

Los nombres exactos de campos y parámetros deben consultarse en la versión activa y no inferirse a partir de estos ejemplos de rutas.

### C. WhatsApp Flows API

Debe integrarse como una capacidad de primera clase, no como un simple tipo de plantilla.

Casos de negocio:
- Calificar leads en el propio chat.
- Solicitar datos para una cotización.
- Reservar citas y servicios.
- Confirmar disponibilidad.
- Registrar solicitudes y reclamos.
- Encuestas y formularios.
- Selección de productos o servicios.
- Capturar preferencias o datos de entrega.
- Iniciar procesos transaccionales estructurados.

Ciclo de vida:
1. Diseñar el Flow y sus pantallas.
2. Crear el Flow asociado a la WABA.
3. Cargar o actualizar el JSON de definición.
4. Configurar Data Exchange Endpoint cuando se requiera contenido dinámico.
5. Configurar claves y cifrado del endpoint siguiendo la guía oficial.
6. Validar el Flow, obtener vista previa y probar sus respuestas.
7. Publicarlo.
8. Enviar el Flow por Cloud API.
9. Recibir la respuesta completada, identificar el Flow token y procesar la información.
10. Registrar versión, publicación, métricas y resultados del Flow.

**Restricción importante:** publicar un Flow tiene implicaciones de inmutabilidad/versionado. El servicio debe conservar la definición publicada, crear una nueva versión para cambios posteriores y mantener trazabilidad de qué versión vio el cliente. No diseñar la interfaz como si editar un Flow publicado fuese una actualización trivial.

El Data Exchange Endpoint requiere un servicio HTTPS dedicado, validación de payloads y manejo criptográfico conforme al protocolo de Meta. No mezclar lógica de negocio de reservas o CRM directamente con el controlador del webhook.

Fuente: [Meta Postman - WhatsApp Flows API](https://www.postman.com/meta/whatsapp-business-platform/overview).

### D. Marketing Messages API

Es obligatoria en la arquitectura recomendada desde el inicio.

Meta anunció que los mensajes de marketing enviados mediante Cloud API dejarán de funcionar el **13 de octubre de 2027** y que los negocios deberán migrar a Marketing Messages API para continuar enviándolos.  
Fuente: [Meta Developer News - Sunsetting Marketing Messages on the Cloud API](https://developers.meta.com/resources/blog/).

Decisión de diseño:

- Mantener un contrato de dominio llamado <code>MarketingMessageSender</code>.
- Implementar un adaptador dedicado <code>WhatsAppMarketingMessagesAdapter</code>.
- Mantener Cloud API para el tráfico compatible no promocional y otras capacidades.
- Clasificar las plantillas con el estado/categoría real devuelto por Meta, no por el nombre que el usuario les asignó.
- Llevar un registro de endpoint, versión, fecha y respuesta para cada envío.
- Añadir métricas de entrega, calidad y optimización proporcionadas por esta API cuando estén disponibles.
- Incorporar la migración de Cloud API a Marketing Messages API como parte del alcance de producto, no como deuda futura.

No se debe prometer una tasa de entrega ni asumir que la API garantiza que todo destinatario recibirá un mensaje. Aplicar criterios de elegibilidad, políticas, opt-in, límites y estados informados por Meta.

### E. Calling API y capacidades de voz

La arquitectura debe reservar una interfaz de capacidades de voz para los casos en que Meta habilite llamadas empresariales para la cuenta, país, app y tipo de integración. Antes de exponer funciones de llamada a un tenant se debe verificar disponibilidad, habilitación, permisos, condiciones comerciales, flujo de consentimiento y soporte de webhooks. No se debe declarar que todos los negocios o países pueden utilizar llamadas por el simple hecho de tener Cloud API.

El módulo debe ser independiente del envío de mensajes: una llamada no es una variante de un mensaje de texto y requiere estado, señalización, métricas, permisos y ciclo de vida propios.

## 4.2 Registro y conexión de número

Datos/activos que deben persistirse:

- Business Portfolio ID.
- WABA ID.
- Phone Number ID.
- Número E.164, cuando la API lo exponga.
- Nombre de visualización y estado de revisión.
- Calidad y límites de mensajería expuestos.
- País y zona horaria operativa.
- Estado de registro.
- Tipo de conexión y método de onboarding.
- Token o credencial de sistema que autoriza el activo.
- Suscripción de webhook y estado de sincronización.
- Configuración de facturación disponible.
- Fecha de la última verificación de estado.

El proceso de registro de número requiere verificación de propiedad mediante SMS o llamada, registro del número y configuración de verificación en dos pasos cuando aplique. No se debe completar el onboarding guardando una credencial temporal de prueba como si fuese credencial de producción.

## 4.3 Plantillas: modelo de negocio y estados

La administración de plantillas debe soportar:

- Crear y enviar plantillas a revisión.
- Listar plantillas por WABA.
- Consultar por ID y nombre.
- Leer categoría y estado devueltos por Meta.
- Localización: nombre, idioma y componentes por idioma.
- Encabezado: texto, imagen, video, documento, ubicación según compatibilidad.
- Cuerpo con variables posicionales y ejemplos.
- Pie de mensaje.
- Botones de respuesta rápida.
- Botones URL, teléfono y CTA disponibles.
- Plantillas de autenticación y OTP.
- Plantillas con contenido de catálogo y productos.
- Edición y eliminación.
- Revisión de calidad, pausas, rechazos y desactivación cuando Meta notifique esos eventos.
- Historial de revisiones, responsables y uso.
- Previsualización y validación de placeholders antes de enviar.

Entidades mínimas:

- <code>TemplateDefinition</code>: definición lógica creada en el producto.
- <code>TemplateRevision</code>: revisión inmutable del contenido enviado.
- <code>MetaTemplate</code>: recurso remoto de Meta, asociado por ID.
- <code>TemplateLocale</code>: idioma y componentes localizados.
- <code>TemplateReviewEvent</code>: resultado de revisión.
- <code>TemplateQualitySnapshot</code>: snapshots de calidad.
- <code>TemplateUsage</code>: uso y estadísticas.

No confundir la categoría interna de marketing del CRM con la categoría aprobada por Meta. El producto debe impedir el envío de una plantilla sin aprobación y validar la estructura exacta de parámetros antes de invocar el endpoint.

## 4.4 Reglas de mensajería y ventanas de WhatsApp

El sistema necesita un **Conversation Policy Engine** con relojes independientes. Una sola columna llamada <code>isWindowOpen</code> es insuficiente.

### Ventana de atención de 24 horas

Se abre o renueva a partir del mensaje entrante del usuario. Permite mensajes de formato libre durante el periodo aplicable. Cuando se cierra, no se pueden enviar mensajes libres; para iniciar o continuar fuera de la ventana se necesita una plantilla aprobada válida.

### Free Entry Point (FEP)

La entrada desde un anuncio Click-to-WhatsApp o desde una llamada a la acción de Página puede crear una ventana gratuita si el negocio responde dentro de las primeras 24 horas. Las ventanas FEP y de atención son conceptos distintos.

La documentación operativa consultada reporta:
- Click-to-WhatsApp Ads: la ventana puede durar hasta 7 días, con despliegue progresivo; durante la transición pueden existir sesiones de 72 horas.
- Botón CTA de una Página de Facebook: 72 horas.
- La ventana FEP empieza al responder el negocio dentro de las primeras 24 horas del mensaje inicial.
- Dentro de la ventana FEP se exoneran los cargos de mensajes aplicables; si termina la ventana de atención de 24 horas, la API sigue exigiendo plantilla para escribir, aunque la exención FEP siga vigente.

La implementación debe persistir por separado:
- <code>customerServiceWindowExpiresAt</code>
- <code>freeEntryPointWindowExpiresAt</code>
- <code>freeEntryPointSource</code>
- <code>freeEntryPointPolicyVersion</code>

No fijar 7 días como comportamiento universal. Meta puede aplicar la duración según elegibilidad, superficie y rollout. Calcular la política a partir del evento de referencia y de los datos recibidos.  
Fuente operativa: [Respond.io - WhatsApp Pricing / Free Entry Point](https://respond.io/help/whatsapp/whatsapp-pricing).

### Opt-in y frecuencia

El producto debe guardar evidencia de permiso del destinatario para el propósito de comunicación:
- Usuario/identificador de canal.
- Fecha y hora.
- Empresa y número que solicita el consentimiento.
- Origen y mecanismo de captura.
- Texto exacto mostrado y versión.
- Propósitos autorizados.
- Categorías de comunicación.
- Evidencia de revocación/opt-out.
- Estado de supresión.

No habilitar campañas promocionales porque un contacto exista en un CRM. La capacidad técnica para enviar no equivale a autorización jurídica o de política.

## 4.5 Costos WhatsApp: Ecuador

Meta cobra de acuerdo con país del destinatario, categoría y reglas aplicables. El país del negocio emisor no determina por sí solo la tarifa del mensaje. Los precios pueden variar y los descuentos pueden depender de categoría y volumen.

**Snapshot de referencia, USD, efectivo 1 de octubre de 2026, mercado Rest of Latin America que incluye Ecuador:**

| Categoría | Tarifa base por mensaje reportada |
|---|---:|
| Marketing | USD 0,0740 |
| Utility | USD 0,0113 |
| Authentication | USD 0,0113 |
| Service | USD 0,0113 luego de agotar la franquicia aplicable |
| Servicio gratis | Primeros 1.000 mensajes de servicio por número empresarial por mes, según el rate card citado |

Fuente secundaria que transcribe el rate card en USD: [ContactShip - WhatsApp Business API Pricing Latin America, octubre de 2026](https://contactship.ai/en/blog/whatsapp-business-api-pricing-latin-america-2026). También consultar [Meta WhatsApp Platform Pricing](https://business.whatsapp.com/products/platform-pricing) y [documentación de precios](https://developers.facebook.com/docs/whatsapp/pricing).

Estas cifras son una **referencia de planificación**, no una tabla contable inmutable. Las reglas de precios han cambiado más de una vez y el texto de distintas páginas de soporte puede actualizarse en fechas diferentes. El motor de billing debe registrar la versión de rate card, la moneda de facturación y el origen del precio aplicado.

### Implicaciones del nuevo esquema

- Las plantillas se facturan por mensaje y categoría, no por una supuesta conversación de 24 horas.
- Desde el 1 de octubre de 2026, los mensajes de servicio tienen una franquicia mensual reportada de 1.000 por número; se cobran los posteriores conforme a la tarifa aplicable.
- Las plantillas de utilidad y autenticación pueden tener descuentos por volumen según rate card y mercado.
- Marketing y servicio no deben asumir los mismos descuentos por volumen.
- Las respuestas de los usuarios no son lo mismo que los mensajes enviados por la empresa a efectos de costes.
- Un FEP puede modificar el coste de mensajes elegibles, pero no elimina las restricciones de envío de la ventana de atención.
- El presupuesto de un anuncio Click-to-WhatsApp se factura en Ads/Marketing; no debe confundirse con el coste de mensajes de WhatsApp.
- Posibles cargos fiscales, facturación, moneda y acuerdos comerciales se revisan en la cuenta del cliente.

### Motor de costes requerido

Cada envío debe producir un evento de estimación y, posteriormente, un evento de conciliación:

<code>MessageCostAssessment</code>:
- tenantId, connectionId, WABA ID, phoneNumberId.
- recipientCountry y cómo se determinó.
- channel y messageType.
- templateId y category aplicada por Meta.
- fecha de envío/entrega.
- free service allowance consumida.
- FEP elegible, tipo y expiración.
- volumen mensual y tramo de precio.
- rateCardId, rateCardEffectiveAt, currency.
- estimatedAmount, finalAmount si se conoce.
- providerMessageId, pricing event y factura asociada.

Nunca calcular el coste final de un mes multiplicando los mensajes totales por una única tarifa. Deben existir desglose por destinatario, categoría, número, tramo, exención, campaña y mes.

## 4.6 Analytics y calidad WhatsApp

Incluir:
- Estadísticas agregadas disponibles en Business Management API.
- Mensajes enviados, entregados, leídos y fallidos cuando estén disponibles.
- Desglose por número, fecha, categoría, plantilla y país cuando el endpoint lo permita.
- Estado de calidad del número y límites informados por Meta.
- Errores y motivos de fallo.
- Consumo de mensajes y estimación de billing.
- Conversión de Flows y campañas.
- Métricas del canal de marketing cuando Marketing Messages API las exponga.

La respuesta de analytics tiene límites de rango, granularidad, dimensiones y retención definidos por Meta. Guardar snapshots periódicos y no tratar un endpoint agregado como un data warehouse histórico ilimitado.

---

# 5. Facebook: Pages, Messenger, Lead Ads y Marketing

## 5.1 Graph API y Pages API

Graph API representa objetos y relaciones autorizados. Pages API habilita operaciones sobre Páginas que el usuario o negocio administra y para las que el app recibió permisos y tareas adecuadas.

Funciones que el producto debe incluir, si el permiso y tipo de Página lo permiten:
- Descubrir Páginas administradas por la persona que autoriza.
- Consultar Page ID, metadatos, tareas/roles y estado.
- Publicar contenido en la Página.
- Publicar fotos y videos.
- Consultar publicaciones propias y métricas permitidas.
- Gestionar comentarios, respuestas y moderación.
- Consultar menciones/notificaciones disponibles.
- Suscribir la app a eventos de Página.
- Consultar insights disponibles.
- Consultar datos públicos solo cuando la API y permisos lo permitan.

Rutas típicas:
- <code>GET /me/accounts</code> para descubrir Páginas administradas, campos y Page Access Tokens autorizados.
- <code>POST /{PAGE_ID}/feed</code> para publicaciones compatibles.
- Edges propios para fotos, videos, comentarios, insights y suscripciones, sujetos a permisos y versión.

No intentar publicar en perfiles personales, grupos o espacios que la API no autorice. La plataforma no debe suponer que una autorización sobre una Página permite leer contenido privado de usuarios.

## 5.2 Messenger Platform

Messenger Platform es un canal independiente de WhatsApp y de Instagram DM. Debe tener su adaptador, identificadores de destinatario, políticas y webhook.

Funciones:
- Enviar y recibir texto.
- Enviar adjuntos admitidos.
- Enviar plantillas estructuradas compatibles.
- Respuestas rápidas y botones.
- Postbacks.
- Indicadores de escritura y estados cuando estén habilitados.
- Consultar conversaciones e historial al que el token tenga acceso.
- Gestionar eventos de mensajes, entregas, lecturas y postbacks.
- Conectar conversación a agente humano.
- Resolver conversación, etiquetar y medir operación desde el backend propio.

Ruta principal de envío de referencia: <code>POST /{PAGE_ID}/messages</code> o endpoint Send API documentado, con Page Access Token y un PSID válido.

Permiso central: <code>pages_messaging</code>; también se necesitan los permisos de metadatos/lectura de Página y una tarea de Página compatible, de acuerdo con la operación.

### Política de mensajes Messenger

- La conversación comienza por una acción elegible del usuario o por un mecanismo de opt-in autorizado.
- La ventana estándar de mensajería es de 24 horas desde la interacción del usuario.
- La extensión <code>HUMAN_AGENT</code>, si está disponible y aprobada, es para atención humana y casos que cumplen sus condiciones; no se debe utilizar para automatización promocional.
- No convertir una ventana de soporte humano en permiso para campañas.
- Las etiquetas, excepciones y mensajes fuera de ventana deben aplicarse únicamente cuando la política vigente de Meta los admita.
- Persistir la marca temporal, el evento que abre la ventana, la excepción aplicada y la identidad del agente humano.

El backend debe rechazar mensajes inválidos antes de invocar a Meta y registrar la razón de bloqueo por política.

## 5.3 Lead Ads y Lead Retrieval

Este dominio es crítico para marketing, CRM y ventas. Debe diseñarse como una ingestión transaccional, no como una tarea de polling solamente.

### Flujo recomendado

1. Un usuario crea un formulario instantáneo dentro de Facebook o Instagram.
2. Meta genera un lead vinculado a una Página, formulario y anuncio.
3. Meta envía un evento al webhook configurado para el objeto <code>page</code> y el campo <code>leadgen</code>.
4. El evento trae referencias como <code>leadgen_id</code>, <code>page_id</code>, <code>form_id</code>, <code>ad_id</code>/<code>adgroup_id</code> y <code>created_time</code>, según versión/evento.
5. El webhook se valida y persiste de forma duradera.
6. Un worker consulta el lead individual mediante <code>GET /{LEAD_ID}</code>.
7. El worker normaliza <code>field_data</code>, guarda payload original y lo vincula con campaña, anuncio, formulario y Page.
8. El lead pasa por deduplicación, validación, enriquecimiento permitido y sincronización con CRM.
9. Se registra consentimiento y permiso de contacto según la declaración del formulario.
10. El ciclo de venta envía eventos posteriores a Conversions API cuando sea jurídicamente válido y técnicamente permitido.

### Endpoints y eventos a cubrir

- <code>POST /{PAGE_ID}/subscribed_apps</code>: suscripción de la app a eventos de la Página.
- Webhook: objeto <code>page</code>, campo <code>leadgen</code>.
- <code>GET /{LEAD_ID}</code>: recuperar un lead concreto.
- <code>GET /{FORM_ID}/leads</code>: recuperación por formulario.
- <code>GET /{AD_ID}/leads</code>: recuperación por anuncio cuando corresponda.
- <code>POST /{FORM_ID}/test_leads</code>: generar lead de prueba cuando el endpoint esté habilitado.
- <code>GET /{FORM_ID}/test_leads</code> y operaciones asociadas para validar entorno de test.
- Lectura de <code>custom_disclaimer_responses</code> cuando el formulario use disclaimers/consentimientos personalizados.

Meta mantiene un ejemplo oficial de configuración que señala los campos del webhook, la suscripción a la Página, el flujo de test lead y la recuperación por formulario/anuncio.  
Fuente: [Meta Facebook Incubator - Leads Retrieval Setup Checker](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md).

### Modelo de Lead recomendado

- <code>Lead</code>: entidad canónica del CRM interno.
- <code>LeadSource</code>: plataforma, Page, form, ad, campaign, adset.
- <code>LeadSubmission</code>: payload recibido en el instante de captura.
- <code>LeadField</code>: campo tipado; no asumir nombres fijos.
- <code>LeadConsent</code>: permiso y versión exacta de divulgación.
- <code>LeadIdentity</code>: identificadores declarados y verificados.
- <code>LeadProcessingAttempt</code>: ingestión, reintento, deduplicación.
- <code>LeadQualityAssessment</code>: calidad, spam, duplicado y calificación.
- <code>LeadLifecycleEvent</code>: contacto, calificado, oportunidad, venta, perdido.
- <code>LeadAttribution</code>: atribución a formulario/anuncio/campaña.

No depender de posición de arrays o de campos esperados como nombre, email y teléfono. Los formularios son configurables: almacenar field name, values, raw type y la revisión del formulario. Conservar los datos desconocidos para no perder campos futuros.

### Confiabilidad y límites

- Webhook como canal primario y lectura por API como recuperación/reconciliación.
- Polling incremental como mecanismo de reparación, no como única fuente.
- Dedupe por tenant, lead ID y fuente.
- Confirmar recepción del webhook después de almacenar el evento, no después de completar todo el proceso.
- Controlar cuotas y rate limits en recuperaciones masivas.
- Implementar reconsulta de eventos fallidos, leads inaccesibles y suscripciones perdidas.
- Respetar retención y disponibilidad histórica que Meta aplique; no asumir que el acceso es ilimitado ni que se puede recuperar cualquier lead sin permiso.

## 5.4 Marketing API: campañas y publicidad

Es el dominio de mayor complejidad. No se debe reducir a crear anuncios desde un endpoint.

El modelo de Meta tiene una jerarquía publicitaria:

1. Ad Account: cuenta publicitaria y su estado financiero/permisos.
2. Campaign: objetivo, estado y configuración general.
3. Ad Set: audiencia, presupuesto, calendario, puja, placements y optimización.
4. Ad Creative: contenido, copy, media, CTA, destino y configuración.
5. Ad: pieza que une creative y ad set.
6. Insights: métricas agregadas por rango, nivel y breakdown disponible.

Rutas conceptuales:
- <code>GET /act_{AD_ACCOUNT_ID}</code> para información de cuenta.
- <code>POST /act_{AD_ACCOUNT_ID}/campaigns</code>.
- <code>POST /{CAMPAIGN_ID}/adsets</code>.
- <code>POST /act_{AD_ACCOUNT_ID}/adcreatives</code>.
- <code>POST /{ADSET_ID}/ads</code>.
- <code>GET /{AD_ACCOUNT_ID}/insights</code> o insights por campaña, adset o ad.

Permisos principales:
- <code>ads_read</code> para lectura/analítica permitida.
- <code>ads_management</code> para administración, escritura y gestión de campañas.
- <code>business_management</code> para descubrimiento/gestión de activos empresariales que lo requieran.

Los nombres y dependencias exactos dependen del tipo de app, flujo de autorización, activo y uso. Solicitar Advanced Access y pasar revisión para los permisos que la app necesite con usuarios externos.

### Funciones completas del módulo de campañas

- Descubrimiento de ad accounts y permisos efectivos.
- Configuración y estado de la cuenta.
- Lectura y escritura de campañas, ad sets, ads y creatives.
- Draft/Paused/Active y transiciones permitidas.
- Objetivos publicitarios y tipos de optimización.
- Presupuesto diario y total.
- Bid strategy y límites admitidos.
- Calendario y timezone.
- Audiencias y segmentación conforme a las políticas de Meta.
- Placements automáticos/manuales cuando proceda.
- CTA y destinos: sitio web, Messenger, Instagram Direct, WhatsApp u otros destinos admitidos.
- Anuncios Click-to-WhatsApp, Click-to-Messenger y Click-to-Instagram Direct.
- Creatividades de imagen/video/carousel/formato que aplique.
- Formularios instantáneos y Lead Ads.
- Experimentos/A-B tests cuando el producto sea elegible.
- Insights y breakdowns compatibles.
- Auditoría de cambios y snapshots de estado.
- Validación de presupuesto, fechas y límites antes de publicar.
- Alertas de gasto, pacing y anomalías.
- Controles para no activar campañas por accidente.

### Gobierno de gasto

No ejecutar automáticamente acciones con impacto monetario sin política y autorización. El módulo requiere:
- Presupuesto aprobado por usuario/rol.
- Límites diarios y mensuales.
- Umbrales de gasto por tenant y ad account.
- Pausa de emergencia.
- Dry-run y prevalidación.
- Confirmación humana de activación cuando la configuración exceda umbrales.
- Auditoría de actor, hora, cambio y motivo.
- Alertas por incrementos imprevistos.

El coste de Ads es independiente del coste de mensajería de WhatsApp y de la infraestructura del producto.

## 5.5 Conversions API (CAPI), Pixel y medición de resultados

Conversions API permite enviar eventos server-side a Meta desde sistemas empresariales. Debe ser parte del flujo de marketing y CRM, no un microservicio aislado sin relación con leads.

Arquitectura recomendada:
- Pixel/browser events cuando aplique.
- CAPI server-side para eventos confirmados en backend/CRM.
- La deduplicación debe enviar el mismo <code>event_name</code> y <code>event_id</code> en la pareja browser/server cuando se trate del mismo evento.
- Mantener <code>event_time</code>, <code>action_source</code>, <code>event_source_url</code> y los campos requeridos para el caso concreto.
- Normalizar y aplicar hashing a identificadores según las reglas de Meta; hashing no sustituye consentimiento ni base jurídica.
- Separar eventos de compra, lead, lead calificado, checkout, suscripción y valor.
- Validar moneda, valor, identificadores, timestamp y origen.
- Registrar respuestas de Meta, warnings y calidad de coincidencia.
- Controlar repetición de eventos y no duplicar ventas por reintentos.

Eventos CRM posibles:
- Lead creado.
- Lead contactado.
- Lead calificado.
- Oportunidad creada.
- Reserva confirmada.
- Compra realizada.
- Pago confirmado.
- Cancelación o devolución cuando el caso y API lo admitan.

CAPI no es una licencia para subir datos indiscriminadamente. El sistema debe verificar permiso, propósito, fuente, minimización y elegibilidad de cada evento.

---

# 6. Instagram Platform: publicación, comunidad, mensajería y analytics

## 6.1 Requisito de cuenta profesional

Las APIs profesionales de Instagram se centran en cuentas Business y Creator. No se debe vender la funcionalidad como acceso a cualquier perfil personal o consumidor.

La colección oficial de Meta documenta dos modalidades:

### Instagram API with Facebook Login

- La cuenta profesional debe estar vinculada a una Facebook Page para el modelo descrito en esta modalidad.
- Utiliza permisos como <code>pages_show_list</code>, <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>pages_read_engagement</code> e <code>instagram_manage_comments</code>, además de los scopes específicos requeridos por cada operación.
- Permite publicar y administrar contenido, comentarios, menciones, hashtags y consultar metadata/insights permitidos.
- Es el camino principal recomendado para integraciones de negocio que también necesitan capacidades de Facebook Page y Ads asociadas.

### Instagram API with Instagram Login

- Autorización directa de Instagram para cuentas profesionales.
- Scopes específicos, por ejemplo <code>instagram_business_basic</code>, <code>instagram_business_content_publish</code>, <code>instagram_business_manage_comments</code> y <code>instagram_business_manage_messages</code>; para insights, usar el permiso de insights documentado en la referencia de esa modalidad.
- La documentación de Meta/Postman advierte que esta modalidad no tiene acceso a Ads ni a tagging.

**Estrategia seleccionada:** soportar ambas autorizaciones bajo un mismo dominio de conexión. Facebook Login tiene prioridad cuando el negocio conecta su ecosistema de Página + Instagram + Ads. Instagram Login se habilita como grant complementario para cuentas profesionales que conecten Instagram directamente o necesiten el conjunto de funciones de esa modalidad. El sistema debe registrar cuál grant autoriza cada operación. No se debe intentar usar un token de una modalidad en un host o endpoint de la otra.

Fuentes: [Meta Postman - Instagram API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/).

## 6.2 Publicación de contenido

Funciones a cubrir:
- Publicación de imágenes.
- Publicación de video.
- Reels.
- Carruseles.
- Stories para tipos de cuenta elegibles.
- Caption, hashtags, ubicación y opciones compatibles.
- Contenedores de media, consulta de estado y publicación final.
- Lectura del estado de procesamiento.
- Historial de publicaciones propias.
- Metadata y métricas de medios publicados.

Proceso habitual de publicación:
1. Validar que el activo y token correspondan al Instagram Professional Account correcto.
2. Validar formato, tamaño, codec, duración y URL de media según especificación vigente.
3. Asegurar que el recurso multimedia esté accesible a Meta.
4. Crear el media container con <code>/{IG_USER_ID}/media</code>.
5. Consultar procesamiento/status del container.
6. Esperar estado publicable.
7. Publicar con <code>/{IG_USER_ID}/media_publish</code>.
8. Registrar el media ID y recuperar metadata/insights cuando estén disponibles.

No responder exitoso al cliente cuando solo se creó un container. La publicación es un paso posterior y debe tener estados intermedios. Meta actualiza requisitos de formato; deben validarse al momento de crear el job y mediante pruebas.

## 6.3 Comentarios, menciones y moderación

- Consultar comentarios de medios propios y los campos permitidos.
- Responder comentarios.
- Ocultar/eliminar/moderar según permisos.
- Gestionar respuestas privadas cuando exista una operación autorizada.
- Procesar mentions y webhooks permitidos.
- Asociar comentario a media, cuenta, fecha, autor disponible y contexto.
- Evitar crear una identidad de usuario más rica de lo que Meta entrega.

Los permisos de lectura, administración y moderación no son intercambiables. La app debe evaluar un capability antes de exponer un botón o ejecutar una acción.

## 6.4 Instagram Messaging API

La mensajería debe tener un adaptador separado de la publicación y comentarios.

Funciones:
- Recibir mensajes directos y eventos de conversación.
- Enviar texto y adjuntos permitidos.
- Enviar mensajes estructurados/plantillas compatibles.
- Procesar respuestas y eventos.
- Obtener conversaciones y mensajes accesibles al token.
- Gestionar mensajes de Requests/Primary/General cuando estén expuestos.
- Gestionar respuestas asociadas a comentarios y contexto, sujeto a políticas.
- Capturar referral context cuando un anuncio o enlace sea la puerta de entrada.
- Enrutar conversaciones a agentes y registrar SLA.

La conversación debe iniciarse mediante una interacción del usuario con la cuenta profesional o una superficie explícitamente autorizada. No es una API para enviar DMs masivos a seguidores no interactuantes.

Identificador de destinatario: usar el identificador de usuario scoped de Instagram que Meta entregue (por ejemplo IGSID), no un username como clave primaria ni un teléfono inferido.

Límites funcionales relevantes documentados:
- No hay group messaging.
- Cada conversación se asocia a un solo cliente.
- Mensajes en Requests sin actividad durante 30 días pueden dejar de estar disponibles en las consultas API.
- Un mensaje con contenido compartido puede incluir solamente la URL del recurso compartido en el webhook.
- La capacidad de enviar mensajes depende de que el usuario haya interactuado y de permisos vigentes.

Fuente: [Meta Postman - Instagram API / Send API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).

## 6.5 Insights y métricas

Diseñar un conector analítico para:
- Perfil y alcance.
- Impresiones, views y métricas equivalentes disponibles para el formato.
- Engagement e interacciones.
- Rendimiento por media.
- Reels y Stories cuando elegibles.
- Crecimiento de seguidores, si el endpoint lo expone.
- Métricas agregadas de cuenta.
- Comparativos por periodo y publicación.

Las métricas disponibles varían por modalidad de login, tipo de cuenta, endpoint, periodo y versión. Se debe guardar cada extracción como snapshot con dimensiones y unidad exactas; no mezclar reach, impressions, plays y views como si fueran una misma métrica.

---

# 7. Threads API y expansión del ecosistema

Threads debe modelarse como un canal independiente, no como una función de Instagram DM. Meta dispone de un centro de documentación propio para Threads API.

Capacidades a evaluar y cubrir mediante adaptador:
- OAuth/autorización de perfil profesional o elegible.
- Lectura de perfil.
- Publicación de texto y medios permitidos.
- Respuestas e interacciones sobre publicaciones propias.
- Lectura de Insights y métricas disponibles.
- Gestión de contenido y conversación según los permisos vigentes.
- Webhooks y eventos cuando estén disponibles.

No asumir que cada funcionalidad social de Instagram existe también en Threads. Registrar versión, scopes, límites y estados por separado.  
Fuente: [Threads API - Meta Developers](https://developers.facebook.com/docs/threads/).

---

# 8. OAuth, credenciales, permisos y onboarding

## 8.1 Activos y credenciales que se deben separar

| Credencial/ID | Uso |
|---|---|
| Meta App ID | Identifica la aplicación registrada en Meta. |
| App Secret | Intercambio/validación de solicitudes servidor-servidor y seguridad de app. Nunca exponer en frontend. |
| Business Portfolio ID | Identifica el portafolio empresarial. |
| System User ID | Identidad técnica del Business Portfolio. |
| System User Access Token | Autorización server-to-server para activos asignados y permisos concedidos. |
| OAuth User Access Token | Grant emitido durante autorización de usuario/business. |
| Page Access Token | Acceso a operaciones autorizadas de una Página. |
| WABA ID | Identificador de la cuenta de WhatsApp Business. |
| Phone Number ID | Identificador del número WhatsApp usado por Cloud API. |
| Instagram User ID | Identificador de la cuenta profesional. |
| Ad Account ID | Identificador de cuenta publicitaria; en rutas de Marketing API puede usarse <code>act_{id}</code>. |
| Pixel/Dataset ID | Identificador de fuente/dataset de eventos, según producto. |
| Webhook Verify Token | Secreto propio usado para verificar la suscripción inicial del callback. |
| App Secret Proof | HMAC derivado del App Secret y token cuando el endpoint lo exija o la configuración de seguridad lo requiera. |
| OAuth State | Nonce aleatorio de un solo uso para prevenir CSRF y correlacionar el flujo. |

No almacenar todas las credenciales como columnas planas en la entidad Tenant. Utilizar un almacén de secretos con cifrado, rotación, versionado y control de acceso. Los IDs remotos no son secretos, pero sí datos sensibles desde el punto de vista de aislamiento multi-tenant.

## 8.2 Flujos de autorización elegidos

### Facebook Login for Business / Business Login

Usar el mecanismo actual de Meta para solicitar autorización a una empresa y descubrir los activos que puede compartir con la aplicación. El flujo debe:
1. Crear state aleatorio, persistirlo con expiración y asociarlo a tenant y sesión.
2. Redirigir al usuario a Meta.
3. Recibir callback en URI exacta allowlisted.
4. Validar state, código, redirect URI y errores.
5. Intercambiar el código en backend.
6. Leer permisos concedidos.
7. Descubrir portfolio, páginas, cuentas publicitarias e Instagram profesional relacionado.
8. Registrar recursos y tareas disponibles.
9. Solicitar acceso avanzado/revisión cuando el caso lo requiera.
10. Ejecutar pruebas de lectura y registrar el estado de conexión.

### WhatsApp Embedded Signup

Usar Embedded Signup cuando el producto conecte WhatsApp Business Accounts pertenecientes a clientes. Este es el onboarding recomendado por Meta para Solution Partners, Tech Providers y Tech Partners. El backend debe recibir los identificadores de negocio/WABA/número que corresponden a la sesión, completar el intercambio de credencial en servidor, comprobar la asignación de activos y suscribir webhooks.

La colección oficial Meta incluye Embedded Signup como superficie específica y no como un flujo improvisado del producto.  
Fuente: [Meta Postman - Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/overview).

### Instagram Login

Soportar un segundo grant específico cuando la cuenta profesional se conecte directamente por Instagram Login. Mantener la procedencia de token y el host correspondiente.

## 8.3 Permisos por producto

La tabla es una matriz de planificación, no una promesa de aprobación. Un endpoint puede requerir más permisos, una tarea de activo o acceso avanzado dependiendo del caso.

| Producto/uso | Permisos comunes a evaluar |
|---|---|
| WhatsApp messaging | <code>whatsapp_business_messaging</code> |
| WhatsApp Business assets/templates | <code>whatsapp_business_management</code> |
| Business assets | <code>business_management</code> cuando se justifique |
| Facebook Page discovery | <code>pages_show_list</code> |
| Page read/engagement | <code>pages_read_engagement</code> |
| Page publishing | <code>pages_manage_posts</code> |
| Page moderation | <code>pages_manage_engagement</code>, <code>pages_read_user_content</code> según operación |
| Page webhook/message metadata | <code>pages_manage_metadata</code> |
| Messenger Send API | <code>pages_messaging</code> |
| Lead retrieval | <code>leads_retrieval</code> y scopes Page/Ads aplicables |
| Ads reporting | <code>ads_read</code> |
| Ads management | <code>ads_management</code> |
| Instagram with Facebook Login | <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>instagram_manage_comments</code>, <code>instagram_manage_messages</code>, <code>instagram_manage_insights</code> cuando el endpoint lo pida; Page scopes relacionados |
| Instagram with Instagram Login | <code>instagram_business_basic</code>, <code>instagram_business_content_publish</code>, <code>instagram_business_manage_comments</code>, <code>instagram_business_manage_messages</code>, <code>instagram_business_manage_insights</code> cuando esté documentado |
| Events/CAPI | Permisos del dataset/ad account, business ownership y acceso requeridos por la integración |

No pedir todos los scopes en una sola pantalla por conveniencia. Solicitar el conjunto mínimo que habilite el caso seleccionado, explicarlo claramente y pasar revisión para los casos de uso que se expondrán a usuarios externos.

## 8.4 Access levels, App Review y verificación

El proyecto debe planificar desde el inicio:
- Crear Meta App de tipo Business.
- Asociarla al Business Portfolio propio.
- Completar Business Verification cuando Meta la requiera.
- Configurar Privacy Policy pública, términos y página de eliminación de datos.
- Implementar Data Deletion Callback/Instructions según el producto.
- Implementar App Review con videos, instrucciones de prueba, usuarios y activos de prueba.
- Solicitar Standard/Advanced Access según el uso y los usuarios que accederán.
- Mantener trazabilidad de aprobaciones y permisos.
- Cumplir Data Use Checkup cuando sea requerido para la app/caso.
- Cumplir políticas de plataforma y uso de datos.

La revisión de Meta es un proceso externo y no debe contarse como un sprint garantizado. Puede pedir modificaciones, evidencia adicional o limitar un permiso. Los requisitos exactos se validan para cada permiso y use case en el panel vigente.

En noviembre de 2026 Meta anunció el retiro de Access Verification del flujo de onboarding de Tech Providers. No seguir checklists viejos que lo traten como paso universal obligatorio; comprobar el flujo vigente de Tech Provider en Developer Center.  
Fuente: [Meta Developer News](https://developers.meta.com/resources/blog/).

## 8.5 Tokens y expiración

El sistema debe:
- Persistir tipo de token y propietario lógico.
- Guardar expiración y data-access expiration si Meta las devuelve.
- Registrar scopes concedidos y scopes revocados.
- Verificar tokens mediante endpoints/herramientas oficiales de depuración cuando corresponda.
- Comprobar que el token tiene acceso real a cada asset y task.
- Monitorizar revocación, cambio de contraseña, eliminación de app y pérdida de rol.
- Tener un flujo de reconexión con notificación al tenant.
- Invalidar cache tras revocación.
- Cifrar en reposo y usar un secret manager/KMS.
- Evitar query strings y logs con tokens.
- Rotar y versionar secretos.
- Auditar acceso a credenciales.

Un Page token no debe asumirse eterno por el nombre o por una prueba puntual. Todos los tokens deben tener estado verificable y mecanismo de reconexión.

---

# 9. Webhooks: entrada de eventos de toda la plataforma

## 9.1 Diseño

Implementar un Webhook Gateway común en recepción, pero con validadores y decodificadores específicos por producto.

Responsabilidades:
- Verificación inicial por GET con los parámetros de challenge y verify token del callback.
- Verificación de firma POST usando el App Secret y el header <code>X-Hub-Signature-256</code> sobre el cuerpo raw sin parsear.
- Verificación de que la app/tenant/asset está asociado al evento.
- Persistencia duradera del payload original.
- Dedupe por identificador/evento/fingerprint.
- ACK HTTP rápido tras persistir.
- Encolado en event bus.
- Normalización de evento de dominio.
- Ejecución async y reintentos.
- Dead-letter queue y replay controlado.
- Métricas de lag, fallos, duplicados y eventos no reconocidos.

No parsear y reserializar JSON antes de verificar HMAC: la firma depende de los bytes originales.

## 9.2 Suscripciones de activos

La app debe suscribirse globalmente a los productos/objetos necesarios y además completar las suscripciones por asset cuando la API lo requiera.

Ejemplos:
- WABA: suscripción de la app a la cuenta de WhatsApp Business mediante <code>/{WABA_ID}/subscribed_apps</code>.
- Page: instalación/suscripción de la app en la Página mediante <code>/{PAGE_ID}/subscribed_apps</code>.
- Lead Ads: objeto <code>page</code>, campo <code>leadgen</code>.
- Messenger: campos de evento necesarios para recibir mensajes, postbacks, delivery/read y cambios de conversación.
- Instagram: campos de webhook para messaging, comments, mentions y demás eventos aprobados.

Un único webhook global no reemplaza las suscripciones por activo.

## 9.3 Eventos normalizados

Definir un envelope de evento interno:
- eventId interno.
- tenantId.
- connectionId.
- product/channel.
- externalObjectId.
- eventType normalizado.
- occurredAt y receivedAt.
- providerApiVersion.
- providerEventId, si existe.
- rawPayloadRef y hash.
- normalizedPayload.
- schemaVersion.
- deduplicationKey.
- processingStatus y attemptCount.
- correlationId/traceId.

Preservar el payload original cifrado o en almacenamiento controlado para auditoría/replay. No utilizar el JSON externo como contrato interno permanente.

## 9.4 Orden, duplicados y reintentos

Meta puede reintentar webhooks y los eventos pueden llegar retrasados o fuera de orden. El consumidor debe ser idempotente.

- Dedupe en base de datos con índice único.
- No asumir exactly-once delivery.
- Usar entrega al menos una vez y handlers idempotentes.
- Mantener orden lógico por conversación o recurso cuando el negocio lo necesite.
- No sobrescribir el estado más nuevo con uno antiguo.
- Usar timestamp y versión/estado del provider para resolver transiciones.
- Reintentar solo errores transitorios, con backoff exponencial y jitter.
- No reintentar permanentemente errores de permiso, payload inválido o activo desconectado.
- DLQ con diagnóstico, replay manual y auditoría.

---

# 10. Arquitectura de microservicios de referencia

La arquitectura debe separar dominios por ciclo de vida y responsabilidad. Evitar microservicios por cada endpoint y evitar el extremo opuesto de un monolito gigante con una clase Meta única.

## 10.1 Bounded contexts / servicios

| Servicio lógico | Responsabilidad |
|---|---|
| Tenant & Identity | Organizaciones, usuarios, roles, aislamiento y tenancy. |
| Meta Connection Service | OAuth, Embedded Signup, consentimientos, conexiones y desconexión. |
| Asset Registry | Inventario de Business Portfolio, WABA, números, Pages, IG, Ad Accounts, datasets y sus relaciones. |
| Token Vault | Cifrado, rotación, expiración, revocación y acceso a tokens. |
| WhatsApp Messaging | Envío, medios, plantillas referenciadas, estado y mensajes entrantes. |
| WhatsApp Business Management | WABA, números, plantillas, catálogo, analytics y configuración. |
| WhatsApp Flows | Versiones, publicación, endpoints de datos, respuestas y métricas. |
| WhatsApp Marketing | Routing de Marketing Messages, elegibilidad, optimización y métricas. |
| Facebook Pages | Publicaciones, comentarios, moderación, metadatos e Insights. |
| Messenger | Conversaciones, mensajes, attachments, policy windows y handoff humano. |
| Instagram | Media, publishing, comments, messages, mentions e insights. |
| Threads | Operaciones específicas de Threads. |
| Lead Management | Lead Ads, ingestión, normalización, deduplicación y ciclo CRM. |
| Ads Management | Ad accounts, campaigns, ad sets, creatives, ads y Insights. |
| Conversion Events | Pixel/CAPI, deduplicación, consent y eventos offline/CRM. |
| Webhook Gateway | Recepción, autenticación, persistencia y routing. |
| Policy Engine | Consent, ventanas, categorías, frecuencia, roles y reglas. |
| Billing & Cost Ledger | Rate cards, estimaciones, cargos, conciliación y presupuestos. |
| Analytics & Reporting | Data marts, snapshots, agregados y métricas de marketing. |
| Audit & Compliance | Historial, exportación, eliminación, acceso y retención. |

Estos son límites de dominio lógicos. Se pueden desplegar como servicios independientes o módulos desplegables según el volumen, pero sus contratos y propiedad de datos deben estar separados desde el inicio.

## 10.2 Stack técnico de referencia

Para un backend TypeScript enterprise, la selección de referencia es:
- Node.js LTS + TypeScript estricto.
- NestJS para módulos, DI, validación, guards y transporte HTTP/eventos.
- PostgreSQL para entidades transaccionales, tenancy, relaciones y auditoría.
- Redis para locks, rate-limit, cache de corta duración y deduplicación con expiración cuando proceda.
- Kafka o un broker durable equivalente para eventos de gran volumen y consumidores desacoplados.
- Object Storage compatible S3 para media, payloads cifrados, exportaciones y evidencias.
- KMS/Vault para secretos y cifrado envelope.
- OpenTelemetry para traces, métricas y logs correlacionados.
- API Gateway con autenticación, rate limiting, WAF y separación de tráfico externo/interno.
- Infraestructura declarativa, despliegue automatizado y entornos separados.

La decisión entre Kafka y otro broker dependerá de infraestructura y volumen. Lo que no es negociable es la entrega durable, el replay, la DLQ y los contratos versionados.

## 10.3 Aislamiento multi-tenant

Todas las entidades de negocio deben tener tenant scope o pertenecer a un agregado cuyo ownership sea inequívoco.

- Incluir <code>tenant_id</code> en índices, claves únicas y búsquedas.
- No buscar por provider ID sin comprobar tenant.
- Token vault segregado por tenant y conexión.
- Aplicar Row-Level Security cuando sea apropiado y reforzarla en la capa de aplicación.
- Evitar caches compartidas por claves incompletas.
- Evitar dedupe global por número telefónico o usuario.
- Las credenciales de una empresa nunca deben autorizar llamadas de otra.
- Registrar quién autorizó el acceso y qué activos compartió.
- Desconectar un tenant sin borrar por error activos de otro.

## 10.4 Inventario de activos

No modelar todo como un campo <code>metaAccountId</code>. Crear un grafo de activos:

- BusinessPortfolio.
- WhatsAppBusinessAccount.
- PhoneNumber.
- FacebookPage.
- InstagramProfessionalAccount.
- AdAccount.
- Dataset/Pixel.
- Catalog.
- AppInstallation.
- SystemUserAssignment.
- PermissionGrant.
- AssetRelationship.
- WebhookSubscription.

Un activo puede estar relacionado con otros, tener varias tareas y múltiples grants. El grafo debe registrar origen, tipo de relación, token/grant que permite accederlo, estado y fecha de última sincronización.

---

# 11. Polimorfismo máximo sin perder semántica

El objetivo no es crear una interfaz común que fuerce a WhatsApp, Messenger e Instagram a comportarse igual. El objetivo es crear un **contrato polimórfico con capacidades explícitas**, tipos de payload discriminados y extensiones nativas.

## 11.1 Jerarquía de abstracción

### Nivel 1: Provider

<code>MetaProvider</code> representa el ecosistema y la autenticación común cuando proceda.

### Nivel 2: Product Adapter

Adaptadores concretos:
- <code>WhatsAppCloudAdapter</code>
- <code>WhatsAppBusinessManagementAdapter</code>
- <code>WhatsAppMarketingMessagesAdapter</code>
- <code>WhatsAppFlowsAdapter</code>
- <code>MessengerAdapter</code>
- <code>FacebookPagesAdapter</code>
- <code>LeadAdsAdapter</code>
- <code>MarketingApiAdapter</code>
- <code>ConversionsApiAdapter</code>
- <code>InstagramFacebookLoginAdapter</code>
- <code>InstagramLoginAdapter</code>
- <code>ThreadsAdapter</code>

### Nivel 3: Capability

Un adaptador anuncia capacidades específicas. Ejemplo de nombres conceptuales:
- message.text.send
- message.template.send
- message.media.send
- message.interactive.send
- message.flow.send
- message.status.read
- conversation.list
- conversation.handoff
- media.publish.image
- media.publish.video
- media.publish.reel
- media.publish.story
- comment.read
- comment.reply
- comment.moderate
- lead.webhook.receive
- lead.retrieve
- campaign.create
- campaign.pause
- ad.insights.read
- conversion.event.send

Antes de ejecutar, la API pública consulta la capacidad habilitada y la autorización real de la conexión. No exponer botones o endpoints cuya capacidad no esté disponible.

## 11.2 Modelos discriminados

Los payloads deben utilizar un discriminante de canal y de tipo. Modelo conceptual:

~~~typescript
type Channel =
  | "WHATSAPP"
  | "MESSENGER"
  | "INSTAGRAM_DM"
  | "FACEBOOK_PAGE"
  | "THREADS";

type MessageContent =
  | { kind: "TEXT"; text: string }
  | { kind: "MEDIA"; media: MediaDescriptor; caption?: string }
  | { kind: "TEMPLATE"; template: TemplateInvocation }
  | { kind: "INTERACTIVE"; interaction: InteractivePayload }
  | { kind: "FLOW"; flow: FlowInvocation }
  | { kind: "PRODUCT"; product: ProductPayload }
  | { kind: "LOCATION"; location: GeoLocation }
  | { kind: "CONTACT"; contact: ContactCard }
  | { kind: "REACTION"; reaction: ReactionPayload }
  | { kind: "NATIVE"; providerPayload: unknown };

type OutboundMessage = {
  tenantId: string;
  connectionId: string;
  channel: Channel;
  recipient: ChannelRecipient;
  content: MessageContent;
  policyContext: MessagingPolicyContext;
  idempotencyKey: string;
  nativeOptions?: Record<string, unknown>;
};
~~~

La unión anterior es conceptual. Cada canal valida su propia combinación. Por ejemplo:
- WhatsApp puede enviar plantillas aprobadas y Flows.
- Messenger utiliza PSID y sus reglas de Send API.
- Instagram DM utiliza IGSID y solo admite capacidades de la cuenta y conversación.
- Facebook Page publication no es una conversación, aunque use Graph API.
- Threads no debe aceptar automáticamente tipos de contenido de Instagram.

## 11.3 Contrato de adaptador

~~~typescript
interface MetaProductAdapter {
  product: MetaProduct;
  apiVersion: string;

  capabilities(connection: MetaConnection): Promise<CapabilitySet>;

  validate(
    operation: MetaOperation,
    connection: MetaConnection
  ): Promise<ValidationResult>;

  execute<TRequest, TResponse>(
    operation: MetaOperation<TRequest>,
    context: ExecutionContext
  ): Promise<ProviderResult<TResponse>>;

  normalizeWebhook(
    rawEvent: VerifiedWebhookEvent
  ): NormalizedDomainEvent[];
}
~~~

Los adaptadores no deben decidir reglas de marketing globales ni facturación. Reciben contexto validado y devuelven respuesta normalizada más payload nativo de referencia.

## 11.4 Preservación del payload nativo

El contrato común no debe eliminar parámetros nativos. Toda operación debe permitir:
- <code>nativeOptions</code> tipado y validado por adapter.
- <code>providerPayload</code> original de request/response cuando se permita almacenarlo.
- <code>providerObjectId</code>.
- <code>apiVersion</code>.
- <code>capabilitiesUsed</code>.
- <code>warnings</code> y <code>unsupportedFields</code>.

No se debe permitir un campo libre sin límite que salte políticas, permisos o validación. La extensión nativa debe estar restringida al schema del producto y protegida por control de acceso.

## 11.5 Errores normalizados

Un error común no debe ocultar el código real de Meta.

Modelo:
- provider.
- product.
- httpStatus.
- metaErrorCode.
- metaErrorSubcode.
- userTitle/userMessage cuando se devuelven y se puedan mostrar.
- isTransient.
- retryAfter.
- fbtraceId.
- requestId.
- operation.
- connectionId.
- sanitizedRawError.

Mapear a categorías internas:
- AUTH_EXPIRED.
- PERMISSION_MISSING.
- ASSET_NOT_ASSIGNED.
- POLICY_BLOCKED.
- RATE_LIMITED.
- INVALID_PARAMETER.
- TEMPLATE_NOT_APPROVED.
- RECIPIENT_NOT_ELIGIBLE.
- OBJECT_NOT_FOUND.
- PROVIDER_UNAVAILABLE.
- UNKNOWN_PROVIDER_ERROR.

Reintentar solo errores transitorios. No reintentar ciegamente un error de policy o permiso.

---

# 12. Contratos de API interna recomendados

La API pública debe ser coherente, versionada y explícita. Ejemplos de recursos de dominio:

| Recurso | Ejemplos de operaciones |
|---|---|
| Connections | crear, iniciar OAuth, completar callback, consultar, reconectar, desconectar |
| Assets | listar, sincronizar, consultar grants/tareas, seleccionar activo |
| Capabilities | consultar operaciones soportadas por conexión/cuenta |
| Messages | enviar, consultar estado, listar conversaciones y mensajes |
| Templates | listar, crear, revisar, editar, archivar/eliminar según Meta |
| Flows | crear, validar, publicar, versionar, medir y enviar |
| Leads | recibir, consultar, asignar, calificar, exportar, sincronizar CRM |
| Campaigns | crear draft, validar, activar con autorización, pausar, analizar |
| Content | crear publicación, programar, publicar, consultar estado |
| Comments | listar, responder, moderar |
| Insights | consultar reportes, programar extracciones y exportar |
| Events | emitir eventos CAPI y consultar dedupe/estado |
| Costs | estimar, consultar ledger y conciliar |

Ejemplos de rutas internas:

- <code>/v1/tenants/{tenantId}/meta/connections</code>
- <code>/v1/tenants/{tenantId}/meta/assets</code>
- <code>/v1/tenants/{tenantId}/meta/capabilities</code>
- <code>/v1/tenants/{tenantId}/messages</code>
- <code>/v1/tenants/{tenantId}/whatsapp/templates</code>
- <code>/v1/tenants/{tenantId}/whatsapp/flows</code>
- <code>/v1/tenants/{tenantId}/leads</code>
- <code>/v1/tenants/{tenantId}/ads/campaigns</code>
- <code>/v1/tenants/{tenantId}/content/publications</code>
- <code>/v1/tenants/{tenantId}/insights</code>
- <code>/v1/tenants/{tenantId}/conversions/events</code>

Los contratos deben usar discriminated unions/OpenAPI discriminators para cuerpos polimórficos. Los endpoints compartidos no deben fingir que cada canal soporta lo mismo. Mantener endpoints específicos para operaciones nativas, junto a los endpoints comunes de orquestación.

Cada request debe permitir idempotency key, correlation ID, actor y motivo. Las operaciones con gasto o publicación deben tener autorización por rol y, según importe/riesgo, aprobación humana.

---

# 13. Identidad y unificación de contactos

No existe una identidad universal de Meta que permita asumir que una persona que escribe en WhatsApp es el mismo usuario que comenta en Instagram o Messenger.

Mantener identidades de canal separadas:
- WhatsApp ID/phone/BSUID u otro identificador soportado por la API.
- Messenger PSID.
- Instagram scoped user ID.
- Threads user identifier.
- Email o teléfono declarados voluntariamente en un formulario, con su evidencia.

Construir un grafo de identidad interno solo con enlaces explícitos, verificados o autorizados. No unir perfiles por similitud de nombre, username o foto. No asumir acceso a email/teléfono por el hecho de conocer un ID de canal.

Cada relación debe llevar:
- Fuente de la relación.
- Actor que la registró.
- Evidencia/consent.
- Nivel de confianza.
- Fecha de verificación.
- Estado de revocación.

---

# 14. Seguridad, privacidad y cumplimiento

## 14.1 Seguridad técnica

- OAuth state aleatorio, expiración y uso único.
- Redirect URIs exactas; no comodines inseguros.
- No enviar tokens a frontend, localStorage, logs, analytics ni URLs.
- Cifrado en tránsito TLS y en reposo.
- Cifrado envelope de tokens con KMS/Vault.
- Separación de secretos dev/staging/prod.
- Rotación y revocación.
- Control RBAC y auditoría de lectura de secretos.
- Webhook HMAC sobre raw body.
- Protección contra replay cuando la semántica del evento lo permita.
- Rate limits por tenant, conexión, asset y app.
- WAF, protección de abuso y validación de uploads.
- Sanitizar datos personales de errores y trazas.

## 14.2 Privacidad y marketing responsable

- Mantener consentimiento y base de permiso por canal y finalidad.
- Registrar opt-in de WhatsApp y los requisitos de cada canal.
- Implementar opt-out de marketing y supresión inmediata.
- Gestionar frecuencia máxima por persona/canal/campaña.
- Separar comunicaciones transaccionales de comunicaciones promocionales.
- Mantener suppression lists por tenant y evitar su reactivación accidental.
- Limitar datos de leads a lo necesario.
- Definir retención y eliminación por clase de dato.
- Auditar acceso y exportaciones.
- Soportar solicitud de acceso, corrección y eliminación según normativa y política aplicable.

Para Ecuador, la plataforma debe diseñarse teniendo en cuenta la Ley Orgánica de Protección de Datos Personales y las obligaciones contractuales/sectoriales que puedan aplicar a los clientes. La implementación legal concreta requiere revisión profesional; el backend debe ofrecer evidencias y controles técnicos para cumplimiento.

## 14.3 Protección de datos de Meta

El acceso otorgado por una persona no concede permiso para usar sus datos con cualquier finalidad. La política de Meta y el acceso aprobado condicionan el almacenamiento, uso, redistribución y retención. La app debe limitar cada dato al propósito aprobado y tener una estrategia documentada para eliminación de datos y revocación de acceso.

---

# 15. Rate limits, resiliencia y rendimiento

No existe un solo número global de solicitudes por segundo válido para toda Graph API, todos los tenants y todas las operaciones. Las cuotas dependen de producto, app, Page, ad account, business use case y otras variables.

Requisitos:
- Leer headers de uso devueltos por Meta, incluidos los correspondientes a app, Page y business use case cuando aparezcan.
- Throttling adaptativo por app, tenant, conexión y activo.
- Limitar concurrencia para endpoints de lectura masiva.
- Paginación por cursor y checkpoints.
- Backoff exponencial con jitter.
- Respetar <code>Retry-After</code> si el endpoint lo informa.
- Evitar N+1 Graph calls.
- Cachear metadata con expiración e invalidación.
- No asumir que todos los edges soportan batch requests.
- Registrar request IDs y fbtrace IDs.
- Circuit breaker por producto para aislar una incidencia de Meta.
- Separar colas para mensajes transaccionales, marketing, analytics y recuperación de leads.
- Prioridad de atención a eventos críticos sin saltarse cuotas.
- Bulkheads por tenant para que un cliente no agote el presupuesto de llamada de los demás.

No reintentar automáticamente operaciones de escritura no idempotentes si se desconoce si Meta las ejecutó. Para mensajes y creación de anuncios, ante timeout ambiguo primero reconciliar o usar un mecanismo idempotente del dominio.

---

# 16. Modelo de datos esencial

El esquema físico debe derivarse del análisis de dominio, pero estos agregados son la línea base:

| Agregado | Entidades/atributos principales |
|---|---|
| Tenant | ID, estado, plan, policy profile, limits |
| Meta App | appId, app secret reference, version, environment |
| Connection | tenant, product, grant type, status, scopes, expiresAt |
| Token Secret | encrypted reference, version, owner, expiration |
| Asset | type, provider ID, metadata, owner tenant |
| Asset Grant | asset, connection, tasks, permissions, grant status |
| Webhook Subscription | object, field, asset, callback, state |
| Contact | internal ID, consent profile, channels |
| Channel Identity | channel, external ID, phone/username optional, verification |
| Conversation | channel, participant, external ID, window states |
| Message | content discriminator, direction, timestamps, external IDs |
| Message Delivery | sent/delivered/read/failed, error and webhook references |
| Template | remote ID, name, category, locale, status |
| Template Revision | components, variables, approval state |
| Flow | remote ID, version, publishedAt, endpoint configuration reference |
| Lead | source, field data, consent, attribution, status |
| Campaign | ad account, objective, status, budget and schedule |
| AdSet | targeting, placement, bid, optimization, budget |
| Creative | media, copy, CTA, destination |
| Ad | creative, adset, status, external ID |
| Conversion Event | eventName, eventId, eventTime, actionSource, dedupe state |
| Rate Card | market, currency, category, effective date, source |
| Cost Ledger | message/event, estimate, final charge, currency, exemptions |
| Audit Event | actor, action, object, timestamp, before/after refs |

Los objetos externos deben tener su ID compuesto por tipo de objeto, proveedor y cuenta propietaria; un ID numérico aislado no siempre es una clave universal.

---

# 17. Marketing: journey completo, de adquisición a ingresos

El backend debe habilitar la cadena de medición:

1. **Captación:** anuncio con destino WhatsApp, Messenger, Instagram Direct o formulario Lead Ads.
2. **Contexto:** captura de referral/ad/campaign/form IDs que Meta incluya en el evento.
3. **Contacto:** generación de identidad del canal y conversación.
4. **Calificación:** Flow o formulario interno con preguntas, scoring y segmentación.
5. **Asignación:** lead routing por equipo, horario, territorio, producto, capacidad o SLA.
6. **Atención:** agente humano o automatización autorizada, con registro de handoff.
7. **Conversión:** venta, reserva o contrato desde CRM/POS/e-commerce.
8. **Medición:** evento CAPI server-side con deduplicación y valor real.
9. **Optimización:** lectura de Insights, análisis por campaign/adset/ad y calidad del lead.
10. **Retención:** mensajes transaccionales y marketing sujeto a consentimiento, ventana y plantilla aprobada.

### Métricas de marketing que debe calcular el producto

- Lead volume y coste por lead.
- Lead-to-contact rate.
- Contact-to-qualified rate.
- Qualified-to-opportunity rate.
- Opportunity-to-sale rate.
- Cost per qualified lead.
- Cost per acquisition.
- ROAS/ROI cuando la fuente de coste e ingreso esté disponible.
- Click-to-message rate.
- Tiempo hasta primera respuesta.
- Resolución en primer contacto.
- Conversión por agente/equipo.
- Rendimiento por plantilla y Flow.
- Tasa de entrega/lectura por canal.
- Calidad del lead por formulario y campaña.
- Revenue attribution con ventana/modelo documentado.

No usar “ROAS real” cuando solo se dispone del gasto de Meta y una conversión inferida. Distinguir atribución de plataforma, atribución interna y revenue conciliado.

---

# 18. Complejidad y estimación de implementación final

Estimación de planificación para una primera entrega enterprise completa con equipo senior de 4 a 6 personas de ingeniería más QA/product/security. Las actividades pueden ejecutarse parcialmente en paralelo. El periodo real depende de acceso, aprobación de Meta, activos de prueba, calidad de requisitos y madurez del equipo.

| Dominio | Complejidad | Esfuerzo aproximado | Riesgos dominantes |
|---|---:|---:|---|
| Tenant, OAuth, token vault y asset registry | Muy alta | 5-8 semanas | Seguridad, grants y multi-tenancy |
| WhatsApp Cloud API y webhooks | Alta | 5-7 semanas | Políticas, estados, medios y ventanas |
| Business Management + plantillas | Alta | 4-6 semanas | Revisión y estados remotos |
| Embedded Signup y onboarding | Muy alta | 4-8 semanas | Requisitos partner/tech provider |
| WhatsApp Flows | Alta | 3-5 semanas | Cifrado, endpoint y versionado |
| Marketing Messages API | Alta | 2-4 semanas | Elegibilidad, migración y métricas |
| Facebook Pages + Messenger | Alta | 5-8 semanas | Page tasks, PSID y policy windows |
| Instagram publish/DM/comments/insights | Muy alta | 6-9 semanas | Dos modelos de login y limitaciones |
| Lead Ads end-to-end | Alta | 3-5 semanas | Webhook, forms, permisos y backfill |
| Marketing API | Muy alta | 6-10 semanas | Ads permissions, presupuesto y Ads QA |
| Conversions API + dedupe | Alta | 3-5 semanas | Calidad de matching, consent y eventos |
| Threads | Media/Alta | 2-4 semanas | Evolución de API y scopes |
| Cost ledger, observabilidad, hardening y QA global | Muy alta | 6-9 semanas | Conciliación, recuperación y seguridad |

**Orden de magnitud:** 6-9 meses calendario con trabajo paralelo y equipo experimentado para una primera versión completa de producción; con un solo desarrollador el plazo puede duplicarse o más. La aprobación de Meta y Business Verification no están bajo control del equipo y pueden extender el calendario. No presentar los tiempos como fechas garantizadas.

### Equipo sugerido

- 1 arquitecto/tech lead backend.
- 2-3 backend engineers con experiencia en APIs, OAuth y sistemas distribuidos.
- 1 frontend engineer si el portal de administración forma parte del mismo proyecto.
- 1 QA automation/engineer.
- Apoyo de DevOps/SRE y security.
- Especialista de marketing/performance para validar objetivos, naming, attribution y operación publicitaria.
- Legal/privacy para términos, consentimiento y tratamiento de datos.

El experto de marketing debe validar taxonomía de campañas y embudos; el arquitecto debe validar permisos, modelos de datos y resiliencia. No se puede completar correctamente un producto publicitario con una visión exclusivamente técnica.

---

# 19. Pruebas obligatorias antes de producción

## 19.1 Pruebas de conexión y autorización

- OAuth state inválido, expirado, repetido y callback manipulado.
- Usuario cancela.
- Permiso rechazado.
- Permiso revocado luego de conectar.
- Page role/task insuficiente.
- Activo transferido o eliminado.
- Token expirado y data access expirado.
- Asset conectado por otro administrador.
- Tenant desconectado.

## 19.2 Pruebas de mensajes

- Envío dentro/fuera de ventana.
- Plantilla no aprobada/rechazada/pausada.
- Idioma incorrecto.
- Parámetros faltantes y tipos de header inválidos.
- Media expirada o no accesible.
- Timeout de proveedor con resultado desconocido.
- Webhook duplicado y fuera de orden.
- Estado failed y reintento permitido.
- Recipient no elegible.
- Opt-out y supresión.
- Costos y franquicia de servicio.
- FEP Click-to-WhatsApp vs Page CTA.
- Migración a Marketing Messages API.

## 19.3 Pruebas de marketing/Ads

- Presupuesto inválido.
- Objetivo/optimización incompatible.
- Cuenta sin método de pago o con spending limit.
- Campaña rechazada o desactivada por Meta.
- Permiso solo lectura intentando modificar.
- Activación sin confirmación.
- Cambios externos hechos desde Ads Manager.
- Diferencias de timezone y calendario.
- Rate limit, paginación y grandes insights.
- Gasto conciliado vs estimación.

## 19.4 Pruebas de lead y conversiones

- Webhook perdido/reintentado.
- Lead repetido.
- Form reutilizado en múltiples anuncios.
- Campos personalizados/desconocidos.
- Custom disclaimer response.
- Lead sin teléfono/email.
- Lead retrieval inaccesible.
- CAPI duplicate event.
- Pixel y server event con mismatched event ID.
- Consent revocado antes de exportar.
- Evento tardío o reordenado.

## 19.5 Seguridad y aislamiento

- Token de un tenant usado contra otro tenant.
- ID de activo perteneciente a otro tenant.
- Webhook con firma inválida.
- Replay de webhook.
- Inyección de payload/archivo.
- Fuga de token en log/traza/error.
- Acceso de operador a secretos no autorizados.
- Borrado de datos y auditoría.

---

# 20. Decisiones que quedan prohibidas por diseño

1. No usar WhatsApp On-Premises API ni automatización no oficial de WhatsApp Web.
2. No guardar access tokens en frontend, localStorage o URLs.
3. No asumir que todos los perfiles de Instagram son accesibles por API.
4. No usar Instagram Login para Ads o tagging: su documentación declara que esos accesos no están disponibles por esa modalidad.
5. No utilizar Messenger/Instagram como canales de broadcast no autorizado.
6. No mandar texto libre de WhatsApp fuera de la ventana cuando se requiere plantilla.
7. No tratar los 24h de atención como la ventana FEP.
8. No codificar tarifas como constantes permanentes.
9. No reintentar a ciegas llamadas de escritura con resultado ambiguo.
10. No asumir que HTTP 200 significa mensaje entregado/publicación visible.
11. No asumir que un evento webhook se procesa una sola vez.
12. No fusionar personas de canales distintos por nombre o username.
13. No activar una campaña con gasto real sin presupuesto, controles y autorización.
14. No construir un DTO universal que suprima capacidades nativas.
15. No solicitar scopes que no sean necesarios ni esconder al usuario para qué se necesitan.

---

# 21. Secuencia de construcción del producto completo

El orden siguiente expresa dependencias técnicas, no reduce el alcance a un MVP.

### Fase A - Fundaciones y acceso a Meta
- App de producción y app de desarrollo.
- Business Portfolio propio y verificaciones que requiera Meta.
- Tenant, identity, OAuth/Business Login, token vault y asset registry.
- App Review, privacy, data deletion, permisos y entornos de prueba.
- Observabilidad, event bus y webhook gateway.

### Fase B - WhatsApp end-to-end
- Embedded Signup.
- Business Management API.
- Cloud API para mensajes y medios.
- Plantillas y su ciclo de revisión.
- Flows y data endpoint.
- Cost ledger y policy engine.
- Marketing Messages API.
- Analytics y calidad.

### Fase C - Facebook y conversación
- Pages y tareas.
- Messenger.
- Webhooks de Pages y conversaciones.
- Políticas de ventanas y handoff humano.
- Moderación e Insights.

### Fase D - Instagram
- Instagram Facebook Login.
- Instagram Login.
- Publishing de media, Reels y Stories elegibles.
- Comments, mentions, Insights.
- Instagram Messaging.
- Inbox, referrals y policy engine.

### Fase E - Captación y publicidad
- Lead Ads webhooks y retrieval.
- Marketing API: campaigns, ad sets, creatives, ads, insights.
- CAPI y deduplicación.
- Catálogo y commerce donde la cuenta y endpoint lo habiliten.
- Atribución CRM y reportes de funnel.

### Fase F - Canales complementarios y producción avanzada
- Threads.
- Llamadas empresariales si la cuenta y el producto son elegibles.
- Analítica multi-touch con fuentes verificadas.
- Optimización y automatizaciones de campañas con guardrails.
- Hardening, recuperación, prueba de carga y operación 24/7.

La salida a producción requiere completar pruebas por dominio, App Review, autorización real de clientes piloto y revisión de seguridad/compliance. No declarar “integración completa” por disponer solamente de un token de prueba.

---

# 22. Fuentes oficiales y referencias de investigación

Las fuentes oficiales son la autoridad para permisos, comportamiento y cambios. Las fuentes secundarias se usan solo para aportar contexto operativo cuando el rate card o las notas de precios no están completamente consolidados en una sola página pública.

## Meta Developer News y versiones

- [Meta Developer News](https://developers.meta.com/resources/blog/) - Graph API v27.0, Marketing API v27.0, deprecaciones y anuncio de retirada de marketing messages en Cloud API.
- [Meta Graph API](https://developers.facebook.com/docs/graph-api/)
- [Graph API Access Levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/)
- [Permissions Reference](https://developers.facebook.com/docs/permissions/)

## WhatsApp

- [WhatsApp Cloud API Overview](https://developers.facebook.com/docs/whatsapp/cloud-api/overview)
- [WhatsApp Cloud API Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference)
- [WhatsApp Send Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)
- [WhatsApp Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [WhatsApp Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api)
- [WhatsApp Flows](https://developers.facebook.com/docs/whatsapp/flows)
- [WhatsApp Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- [WhatsApp Platform Pricing](https://business.whatsapp.com/products/platform-pricing)
- [Marketing Messages API for WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/marketing-messages-api-for-whatsapp)
- [Meta Official Postman - WhatsApp Business Platform](https://www.postman.com/meta/whatsapp-business-platform/overview)

## Facebook, Messenger y Pages

- [Messenger Platform](https://developers.facebook.com/docs/messenger-platform/)
- [Messenger Send API](https://developers.facebook.com/docs/messenger-platform/send-messages)
- [Messenger Webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks)
- [Pages API](https://developers.facebook.com/docs/pages-api/)
- [Meta Official Postman - Messenger Platform](https://www.postman.com/meta/messenger-platform-api/overview)

## Leads y Ads

- [Lead Ads Guide](https://developers.facebook.com/docs/marketing-api/guides/lead-ads)
- [Lead Retrieval](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving)
- [Lead Ads Webhooks](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/quickstart/webhooks-integration)
- [Marketing API](https://developers.facebook.com/docs/marketing-apis/)
- [Marketing API Authentication](https://developers.facebook.com/docs/marketing-apis/overview/authentication/)
- [Meta Official Postman - Facebook Marketing API](https://www.postman.com/meta/facebook-marketing-api/overview)
- [Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/)
- [Conversions API Parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/)

## Instagram y Threads

- [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/)
- [Instagram API with Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/)
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
- [Instagram Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [Meta Official Postman - Instagram API](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Threads API](https://developers.facebook.com/docs/threads/)

## Precios WhatsApp - fuentes auxiliares

- [ContactShip - rate card en USD para Latinoamérica, vigente desde octubre 2026](https://contactship.ai/en/blog/whatsapp-business-api-pricing-latin-america-2026)
- [Respond.io - reglas de servicio, plantillas y Free Entry Point](https://respond.io/help/whatsapp/whatsapp-pricing)

---

# 23. Conclusión técnica

La arquitectura correcta para este producto es una **plataforma multi-tenant de integración Meta con control plane, adaptadores por producto, capacidades declarativas, eventos normalizados, preservación del payload nativo y motores centrales de políticas y costes**.

El backend debe exponer una experiencia unificada sin afirmar que las redes son idénticas. WhatsApp, Messenger, Instagram DM, Pages, Lead Ads, Ads y CAPI tienen contratos y permisos diferentes; el polimorfismo debe reflejar esa realidad.

La calidad del producto dependerá tanto de la integración de endpoints como de la administración de activos, la aprobación de permisos, el ciclo de vida de tokens, las políticas de contacto, los webhooks, la conciliación de costos, la auditoría y la operación de campañas.

**Criterio final de aceptación:** el sistema se considera listo solamente cuando puede conectar activos reales de distintos tenants mediante los flujos oficiales, demostrar permisos efectivos, ejecutar y medir las operaciones habilitadas, procesar webhooks de manera confiable, cumplir ventanas/consentimientos/presupuestos, reconciliar costes y recuperarse de revocaciones, límites, errores y cambios de versión sin comprometer los datos ni los activos de otros clientes.

---

**Fecha de investigación: 6 de noviembre de 2026.**  
**Nota de mantenimiento:** revisar mensualmente la documentación, changelogs, permisos, rate cards y políticas de Meta. Todas las estimaciones y precios son una base de planificación y deben verificarse contra el contrato, la cuenta y la versión efectiva al momento de implementar.


---

## Actualización de arquitectura y cambios de plataforma — 2026-11-06

Este catálogo conserva el alcance de investigación original. Para diseño actual y cambios temporales, consultar primero:
- docs/09-API-INTEGRATION-CATALOG.md — operación/capability matrix.
- docs/32-RESEARCH-AND-EVIDENCE-REGISTER.md — fuente, fecha, confianza y efecto arquitectónico.
- docs/29-OWNER-DECISIONS.md — decisiones de producto adoptadas.
- docs/30-RECOMMENDED-ARCHITECTURE.md y docs/33-ARCHITECTURE-DECISION-RECORDS.md — arquitectura/ADRs.

### Cambios relevantes identificados a fecha de corte
1. Meta publicó el anuncio Graph API v27.0 / Marketing API v27.0 en noviembre de 2026. La versión se administra por producto/adapter y se revalida al implementar; este catálogo no fija una versión global.
2. Marketing API Access Tier (Limited/Full) se modela de forma separada de OAuth scopes como ads_management, asset tasks/grants y estado App Review.
3. Embedded Signup v4 es la dirección de onboarding unificado a evaluar para WhatsApp, Messenger e Instagram Direct, sujeto a habilitación/eligibilidad en la app.
4. WhatsApp soporta identificadores de usuario que no son número de teléfono, incluyendo BSUID. La identidad de contacto debe tener provider namespace y tipo; el teléfono es atributo opcional, no clave universal.
5. La evolución del modelo de cuentas WhatsApp requiere modelar recursos de números, mensajería, plantillas y billing con relaciones explícitas (WAAC/PMA) y compatibilidad con recursos legacy WABA.
6. Meta anunció sunset para marketing traffic en Cloud API el 2027-10-13; el producto nuevo debe usar Marketing Messages API para marketing WhatsApp y no añadir nueva dependencia del endpoint legado.
7. Max Pricing requiere separar precio máximo/upper bound, estimate, provider-reported charge y reconciled invoice.
8. La política WhatsApp exige experiencia esperada, respeto a opt-outs y escalamiento; implementar enforcement policy por canal/categoría/propósito/ventana, no un booleano universal.

Los hallazgos anteriores deben revalidarse contra documentación/changelog oficial vigente, versión específica y cuenta de prueba antes de implementar. La fecha de corte no implica que el repositorio tenga acceso, permisos ni aprobación Meta.


---

## Actualización Meta Ads AI y agentes — 2026-11-06

La estrategia publicitaria y los agentes han evolucionado desde el catálogo base. La especificación consolidada se encuentra en docs/34 y docs/36.

- Andromeda es el retrieval interno de Meta; GEM es su evolución de modelo central de recomendación. Ninguna es una API con score accesible o control directo para el advertiser.
- Meta Ads MCP permite en cuentas elegibles preparar drafts, subir/preview creativos y analizar rendimiento; Meta describe aprobación explícita antes de publication.
- Meta Business Agent Platform conecta agentes con CRM/order management y ofrece context/history/handoff; validar disponibilidad de canal/país/partner/price antes de prometerlo.
- Advantage+ Creative / Ads Creative Studio / Ads Performance Recommendations / Ad Previews son superficies a evaluar por API version and eligibility. Meta's public AI Creative Enhancer sample illustrates paused-first preview-and-approve flow for generated features; sample is not normative API contract.
- Campaign learning is primarily assessed at ad set level in Meta's guide; consolidation and minimizing edits protect accumulated learning. About 50 optimization events in 7 days is contextual guidance, not a universal threshold.
- The common +20% budget heuristic is not a universal Meta rule. WhatsBusiness enforces PD-024 as its own guardrail (+20% per action and rolling 24h cumulative cap). Meta's Ad Set Budget Sharing 20% option is a separate budget redistribution feature.
- New creative assets should be genuinely diverse and tested in separate controlled cells; do not continuously modify winning ad sets or create many overlapping ad sets.
- Closed-loop campaign optimization should include CRM qualified leads/sales/net revenue/margin and CAPI events with consent and dedupe, not only clicks or provider-attributed ROAS.
- OpenWA/browser automation is not an accepted Meta integration; official APIs only.

See docs/32 for dated sources and docs/34..36 for implementation design, security and tests.


---

## Nota de precedencia y vigencia documental (kickoff 2026-11-06)

- El nombre canónico del producto es WhatsBusiness.
- La arquitectura normativa de implementación es modular monolith con NestJS/Angular/Nx, según docs/30 y ADR-011..020; la sección histórica de servicios/microservicios de este documento se interpreta como context map/bounded contexts, no obligación de desplegar un microservicio por dominio.
- La fila de Marketing WhatsApp distingue Marketing Messages API para marketing y Cloud API para capacidades no promocionales elegibles. No crear dependencias nuevas de tráfico promocional sobre el endpoint legacy.
- Las tarifas numéricas y tablas heredadas en este documento son referencias históricas de investigación, no valores normativos ni constantes de código. Implementar rate cards versionadas con fuente oficial, moneda, mercado, categoría y vigencia; separar estimate, maximum/upper bound, provider-reported actual y reconciled statement.
- Los endpoints, scopes, tareas de activos, tiers, versiones, países, límites, precios, elegibilidad y sunsets deben revalidarse en fuentes oficiales antes de implementar cada operación. Docs/09 define el capability record obligatorio.
- Docs/37..46, contracts/ y docs/31 son la base de preparación más reciente para agentes. Este documento conserva utilidad como catálogo de investigación y referencia, pero no sustituye los contratos operativos por endpoint.
