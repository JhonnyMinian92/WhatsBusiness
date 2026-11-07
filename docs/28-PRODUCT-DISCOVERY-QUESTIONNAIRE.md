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
