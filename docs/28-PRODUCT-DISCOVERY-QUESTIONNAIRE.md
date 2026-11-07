# 28 — Cuestionario de descubrimiento y decisiones del propietario

**Estado:** respuestas pendientes.  
**Propósito:** cerrar decisiones de producto que los agentes no deben inventar. Las respuestas se convertirán en requisitos, historias, ADR, contratos, criterios de aceptación y tareas.

> Responde por número. Puedes contestar “no lo sé; recomiéndame una opción” cuando quieras que el equipo proponga alternativas. Si una pregunta admite varios valores, puedes enumerarlos.

## A. Identidad y modelo de negocio

### Q-001. ¿Qué producto estamos construyendo exactamente?
¿WhatsBusiness será una plataforma SaaS multiempresa que venderás a terceros, una plataforma interna de EcuApp, una solución white-label para revendedores o una combinación? Indica el nombre comercial definitivo si ya existe.

### Q-002. ¿Quiénes serán los clientes y usuarios?
Describe los tipos de empresas objetivo (micro, pequeñas, medianas, grandes, agencias, comercios, ecommerce, etc.), países iniciales y perfiles que usarán el sistema. ¿Habrá agencias que administren múltiples empresas/tenants?

### Q-003. ¿Cómo se monetizará?
Elige lo que aplique: suscripción por tenant, por usuario, por número de WhatsApp, por volumen de mensajes, por uso de APIs, comisión, planes por funcionalidades, white-label o combinación. ¿La plataforma cobrará al cliente los costes de Meta o solo mostrará/conciliará esos costes?

## B. Alcance funcional y prioridades

### Q-004. ¿Confirmas el alcance Meta de `META_SERVICES.md`?
Confirma cuáles deben formar parte del producto:
- WhatsApp Cloud API y Business Management API.
- Embedded Signup / Tech Provider.
- WhatsApp Flows.
- Marketing Messages API.
- Calling API y voz.
- Facebook Pages.
- Messenger.
- Lead Ads / Lead Retrieval.
- Marketing API (campañas, ad sets, anuncios, creatividades, audiencias e Insights).
- Conversions API / Pixel.
- Instagram Login y Facebook Login para Instagram.
- Publicación, comentarios, moderación, mensajes e Insights de Instagram.
- Threads.
¿Hay alguna capacidad que deba excluirse o añadirse?

### Q-005. ¿Cuál es el orden de entrega?
¿Quieres construir todos los productos Meta en paralelo por dominios, o establecer una secuencia? Si hay secuencia, ordénalos. ¿WhatsApp debe quedar operativo antes de empezar Facebook/Instagram/Ads?

### Q-006. ¿Qué funcionalidades propias debe incluir la plataforma además de conectar APIs?
Por ejemplo: inbox omnicanal, CRM de contactos, pipeline/embudo, asignación de agentes, equipos, etiquetas, notas, automatizaciones, chatbot/IA, campañas, calendario de contenido, reportes, catálogo, ecommerce, integraciones ERP/POS, API pública, webhooks para clientes y aplicación móvil. Marca las obligatorias y agrega las que falten.

### Q-007. ¿Qué nivel de automatización e IA esperas?
¿Debe incluir bots con reglas, asistentes generativos, RAG con documentos, clasificación de leads, sugerencias de respuesta, agentes autónomos, voz/transcripción o ninguna función de IA? ¿Qué acciones pueden ejecutarse automáticamente y cuáles requieren aprobación humana?

## C. Aplicaciones, API y experiencia

### Q-008. ¿Qué interfaces deben existir?
¿Solo backend/API para integrarse con otros sistemas, o también panel web administrativo, panel por tenant, inbox de agentes, portal de onboarding, portal de facturación, aplicación móvil y/o API para desarrolladores? Indica cuáles son obligatorias.

### Q-009. ¿Qué idiomas y localización se requieren?
¿Español de Ecuador como idioma inicial? ¿Inglés y otros idiomas? ¿Moneda USD exclusivamente o multimoneda? ¿Zona horaria por tenant? ¿Formatos fiscales/facturación ecuatoriana dentro del alcance?

## D. Tecnología y operación

### Q-010. ¿Existe código fuente en otro lugar?
La rama `environment/local` solo contiene documentación e instrucciones: no aparecen backend, frontend, tests ni infraestructura. ¿El código está en otro repositorio, rama, equipo o equipo local? Comparte las URLs o indica si debemos crear la implementación desde cero.

### Q-011. ¿Tienes preferencias o restricciones tecnológicas?
Backend (Java/Spring, .NET, Node/NestJS, Python/FastAPI, Go u otro), frontend (Angular, React, Vue u otro), base de datos, caché, mensajería/event bus, almacenamiento, API gateway y herramientas de observabilidad. Si no tienes preferencias, ¿autorizas que el arquitecto recomiende y documente una stack basada en criterios técnicos?

### Q-012. ¿Dónde se desplegará?
AWS, Azure, GCP, Oracle Cloud, proveedor local, VPS, Kubernetes, Docker Compose o infraestructura propia. ¿Tienes cuenta/proveedor ya contratado? ¿Hay límites de presupuesto mensual, región o residencia de datos? No compartas credenciales ni secretos.

### Q-013. ¿Qué requisitos operativos esperas?
Disponibilidad objetivo, horario de soporte, volumen inicial y máximo estimado (tenants, usuarios, mensajes/día, webhooks/segundo), RPO/RTO, respaldo y recuperación. Si no tienes números, indica “recomendar”.

## E. Seguridad, cumplimiento y gobierno

### Q-014. ¿Qué modelo de aislamiento y acceso deseas?
¿Base de datos compartida con tenant_id/RLS, base por tenant, esquema por tenant o arquitectura híbrida? ¿Se necesitan SSO, MFA, SCIM, auditoría avanzada, aprobación de dos personas y separación de funciones?

### Q-015. ¿Qué políticas de datos y cumplimiento aplican?
¿Solo Ecuador o también clientes en otros países? ¿Qué plazos de retención deseas para conversaciones, leads, archivos, eventos y auditoría? ¿Debe existir exportación/borrado por tenant y por titular? ¿Hay asesoría legal/DPD para validar LOPDP y transferencias internacionales?

### Q-016. ¿Qué acciones comerciales deben estar protegidas?
Confirma límites y aprobaciones para enviar mensajes, campañas, cambios de presupuesto, activación/pausa de anuncios, exportación de leads, eliminación de datos y cambios de permisos. ¿Qué roles pueden aprobar y con qué límites monetarios?

## F. Integraciones y cierre de alcance

### Q-017. ¿Qué sistemas externos hay que integrar?
CRM, ecommerce, ERP, POS, facturación electrónica, pasarelas de pago, data warehouse, herramientas de email/SMS, calendarios, almacenamiento u otros. Indica nombres concretos si ya están elegidos.

### Q-018. ¿Qué significa “listo para producción” para ti?
¿Requieres Meta App Review y Business Verification completados, Tech Provider/Embedded Signup habilitado, pruebas con cuentas reales, certificaciones, documentación de usuario, soporte, facturación, SLA y despliegue productivo? Señala requisitos obligatorios y cuáles dependen de terceros.

## G. Gobierno del desarrollo

### Q-019. ¿Cómo autorizas el trabajo en Git?
La práctica actual mantiene el trabajo en `environment/local`, dejando `master` y `environment/develop` intactas. ¿Confirmas que sigamos así y que no hagamos merge a ramas protegidas ni despliegues productivos sin tu aprobación?

### Q-020. ¿Qué autonomía das a los agentes?
¿Autorizas que el equipo elija detalles técnicos reversibles y los registre como ADR, pero te consulte toda decisión que afecte funcionalidades, costes, datos, seguridad, cumplimiento, proveedores o breaking changes? ¿Quieres que el agente se detenga ante cualquier duda o que continúe el trabajo independiente y te deje bloqueadas solo las decisiones afectadas?

## Respuestas rápidas

Puedes copiar y completar este resumen si te resulta más cómodo:

- Q-001 Modelo de negocio:
- Q-002 Clientes objetivo:
- Q-003 Monetización:
- Q-004 Alcance Meta:
- Q-005 Prioridad de entrega:
- Q-006 Funcionalidades propias:
- Q-007 IA y automatización:
- Q-008 Interfaces:
- Q-009 Idiomas/monedas:
- Q-010 Ubicación del código:
- Q-011 Stack:
- Q-012 Infraestructura:
- Q-013 Volumen/SLO/RPO/RTO:
- Q-014 Aislamiento/identidad:
- Q-015 Datos/cumplimiento:
- Q-016 Aprobaciones y límites:
- Q-017 Sistemas externos:
- Q-018 Criterios de producción:
- Q-019 Estrategia Git:
- Q-020 Autonomía de agentes:


## Respuestas recibidas del propietario (2026-11-06)

Estado: se recibieron 10 respuestas al cuestionario abreviado del chat. No corresponden uno a uno con las preguntas originales Q-001..Q-020. La fuente de verdad de las decisiones confirmadas es [29-OWNER-DECISIONS.md](29-OWNER-DECISIONS.md).

| Pregunta | Respuesta registrada |
|---|---|
| Q-001 | Ambas: SaaS comercial y plataforma interna EcuApp |
| Q-002 | Comenzar desde cero; no hay código heredado que incorporar |
| Q-003 | Todo el alcance Meta enumerado en META_SERVICES.md |
| Q-004 | Backend + panel + CRM + inbox omnicanal; con visión de automatización IA |
| Q-005 | Backend y panel web |
| Q-006 | Autoriza al arquitecto a recomendar stack |
| Q-007 | VPS / servidor propio |
| Q-008 | Solicita propuesta de fases y separación/organización estricta |
| Q-009 | Chatbots y sugerencias básicas, con proyección futura |
| Q-010 | Agentes continúan tareas independientes y aplican la mejor opción técnica conocida sin preguntar; consultan decisiones de impacto |

La correspondencia semántica y el estado real de las preguntas originales se encuentra en docs/29-OWNER-DECISIONS.md. No reutilizar la numeración abreviada como si fuera la numeración original. Las decisiones de stack (autorizada recomendación), hosting (VPS), greenfield y autonomía están respondidas; segmentos, monetización, localización, sizing, aislamiento, retención, aprobaciones comerciales, integraciones y criterios de producción permanecen abiertos.


## Aclaración de numeración de respuestas
Las diez respuestas recibidas correspondieron al cuestionario abreviado presentado en el chat, cuyas etiquetas no coincidían con la numeración Q-001..Q-020 de este documento. Para evitar falsa trazabilidad, no se deben tratar como respuestas a las preguntas originales con el mismo número. La correspondencia semántica está normalizada en PD-001..PD-011 en [29-OWNER-DECISIONS.md](29-OWNER-DECISIONS.md). Las preguntas originales de segmento de clientes, monetización, localización, aislamiento, retención, aprobaciones, integraciones y producción permanecen abiertas salvo aclaración explícita posterior.


## Resolución por delegación expresa del propietario (2026-11-06)
El propietario indicó que se apliquen todas las recomendaciones y que el arquitecto sea responsable de las mejores decisiones técnicas/producto documentables. En consecuencia, las preguntas de discovery ya no quedan genéricamente abiertas; sus respuestas de baseline están en PD-012..PD-023 de docs/29.

| Tema original | Decisión aplicada | Lo que sigue pendiente |
|---|---|---|
| Q-002 Segmentos/agencias | PYMES de comercio/servicios en Ecuador; agencias como segmento secundario | Validación empírica de ICP, entrevistas, conversión, retención y demanda |
| Q-003 Monetización | Suscripción tenant + seats + usage; costes Meta por separado | Tarifas, márgenes, impuestos, unit economics y pricing research |
| Q-009 Idioma/moneda/zona | es-EC, USD, America/Guayaquil defaults configurables | Locales adicionales y reglas fiscales por país |
| Q-013 Capacidad/SLO | 99.9%, RPO 15m, RTO 4h como objetivos candidatos de planificación | Hardware, workload, benchmark, HA, restore tests, coste y aceptación SLO |
| Q-014 Aislamiento/agencias | PostgreSQL shared tenant_id + auth + RLS; dedicated DB enterprise; partner grants | Threat model, architecture spike y pruebas cross-tenant |
| Q-015 Privacidad | Minimización, retención configurable y workflows de derechos | Plazos, roles, transfers, subencargados, contratos y revisión legal/DPD |
| Q-016 Acciones sensibles | Default deny, policy engine, human approval para gasto/mensajes masivos/borrados/permisos | Thresholds monetarios, doble aprobación y matriz final de roles |
| Q-017 Integraciones | Primero API pública, webhooks firmados y contratos EcuApp | Conectores concretos según demanda real y due diligence proveedor |
| Q-018 Producción | Gates G0-G8 y evidencias Meta, QA, Security, SRE, Privacy | Accesos/app review, pentest, benchmark, DR y aceptación |
| Q-019 Git/release | Solo environment/local para trabajo; master/develop y producción protegidas | Ninguna; sigue requiriendo autorización explícita para cada release/merge/deploy |
| Q-011 Stack | Nx/pnpm, NestJS, Angular, PostgreSQL, Redis, RabbitMQ, OIDC/Keycloak, Docker, OpenTelemetry | TASK-039 spike y pinning de versiones |
| Q-012 Infraestructura | VPS/self-host portable Docker; single-node solo dev/piloto | Proveedor, recursos, presupuesto y topología HA por benchmark |

La autorización por delegación no convierte hipótesis de mercado en estadística, no determina asesoría legal, no compromete gastos o vendors y no habilita operaciones productivas. Ver docs/29, docs/30, docs/31 y docs/32 como fuente canónica.
