# 61 — Evaluación estratégica: CRM, ARM y gestión de relaciones asistida por agentes

**Fecha:** 2026-11-07  
**Rama de referencia:** `environment/local`  
**Estado:** evaluación arquitectónica provisional; no es una decisión de producto aprobada ni autoriza renombrar módulos o migrar datos.  
**Relacionado:** docs/30, docs/38, docs/41, docs/42, docs/43, TASK-035, TASK-038, TASK-042..053, TASK-074..080.

## 1. Pregunta y ambigüedad del término ARM

ARM no tiene una única expansión universal en software de relaciones. En el material público revisado aparece, al menos, como:

- **Agent Relationship Management:** capa que administra identidad, permisos, comportamiento y coordinación de agentes de IA con personas y entre sí.
- **Agentic Relationship Management:** enfoque de gestión comercial asistida por agentes que analizan contexto, proponen y ejecutan tareas dentro de límites autorizados.
- **Account Relationship Management:** expresión usada en algunos contextos para gestionar relaciones con cuentas/organizaciones; no debe asumirse como una categoría de software equivalente y universalmente reconocida a CRM.

Esta evaluación toma **Agent Relationship Management** como hipótesis principal porque WhatsBusiness ya contempla AI Assistance, Automation, Inbox, CRM y herramientas/agentes. Si el propietario se refiere a Account Relationship Management u otra definición, el alcance debe revisarse antes de aprobar el naming.

## 2. Hallazgo de producto

CRM no significa únicamente una libreta de contactos o un pipeline de ventas. En el mercado describe la disciplina y el sistema que centraliza relaciones e interacciones de clientes/prospectos a través de ventas, marketing y servicio. Sus capacidades comunes incluyen datos de contacto, seguimiento comercial, servicio, automatización e insights.

Por tanto, reemplazar CRM por ARM y eliminar el dominio CRM sería una regresión: WhatsBusiness todavía necesita contactos, identidades de canal, empresas, leads, oportunidades, pipeline, actividades, procedencia, consentimiento y deduplicación.

ARM, bajo la hipótesis Agent Relationship Management, resuelve otro problema: gobernar la relación entre una empresa y agentes de IA externos, y entre agentes, incluyendo identidad verificable, capacidades, confianza, protocolos, actividad y escalamiento humano. No reemplaza la fuente de verdad de clientes ni el ciclo comercial. Si el alcance solo consiste en asistentes/agentes internos que ayudan a vendedores y operadores usando datos CRM, se trata de agentic CRM y AI orchestration; no justifica por sí solo un producto ARM separado.

## 3. Recomendación

**No sustituir el CRM. Primero evolucionar el CRM hacia una experiencia agentic CRM; crear un bounded context ARM separado solo si WhatsBusiness necesita recibir, identificar, verificar, autorizar y coordinar agentes externos que interactúan con los negocios o con otros agentes.**

Propuesta de posicionamiento a validar:
- Categoría funcional inicial: **AI-native CRM / Relationship Platform**.
- Capacidades visibles: CRM, Omnichannel Inbox, Marketing/Acquisition, Automation y AI Agents.
- ARM: posible plano de confianza/interoperabilidad para agentes externos, no sustituto de Contacts/Leads/Opportunities.
- No usar ARM como único nombre público hasta validar comprensión con clientes, agencias y PYMES del ICP inicial.

La ventaja competitiva debe expresarse como resultados verificables: responder y dar seguimiento con contexto, convertir conversaciones en oportunidades, coordinar humanos y agentes, y automatizar acciones con permisos y auditoría. No se debe vender autonomía ilimitada.

## 4. Comparación de alcance

| Dimensión | CRM (mantener) | ARM / Agent Relationship Management (añadir) |
|---|---|---|
| Sujeto principal | Personas, empresas, leads, oportunidades | Agentes de IA, humanos supervisores y delegaciones |
| Fuente de verdad | Contactos, identidades, pipeline, actividades | Registro de agentes, versiones, herramientas, grants y ejecuciones |
| Trabajo principal | Capturar, organizar y desarrollar relaciones comerciales | Planificar y ejecutar tareas autorizadas sobre esas relaciones |
| Estado | Lifecycle de lead, contacto y oportunidad | Lifecycle del agente, sesión, tarea, delegación y ejecución |
| Seguridad | Tenant, actor, ownership, consent y purpose | Identidad de agente, scopes, capability, límites, aprobación y kill switch |
| Auditoría | Cambios comerciales e interacciones | Razonamiento/resumen seguro, tool calls, aprobaciones y efectos |
| Métricas | Conversión, pipeline, retención, SLA | Tasa de éxito, escalamiento humano, coste, latencia, errores y acciones bloqueadas |

## 5. Arquitectura recomendada

Mantener el bounded context `CRM` existente. Distinguir dos escenarios antes de crear un módulo nuevo:

- **Agentes internos/first-party:** ampliar AI Assistance + Automation + Tool Gateway con capacidades de agentes, manteniendo CRM como fuente de verdad. Esto es agentic CRM; no crear un ARM independiente por naming.
- **Agentes externos/third-party y agent-to-agent:** crear, cuando exista demanda y contratos reales, un bounded context `Agent Relationship Management` (ARM) para registro, verificación, trust, protocolo, delegación y handoff de agentes externos.

El segundo escenario es el que justifica ARM como categoría/arquitectura separada.

Responsabilidades sugeridas para ARM externo:
1. **Agent Registry:** identidad estable, owner, tenant, purpose, estado, versión y configuración aprobada.
2. **Agent Capability & Tool Registry:** tools permitidas por producto/versión, esquema, scopes, límites, riesgo y precondiciones.
3. **Delegation & Authorization:** actor humano que delega, tenant, recurso, propósito, vigencia, límites y revocación. El agente nunca adquiere permisos por inferencia del prompt.
4. **Agent Runtime:** planificación acotada, ejecución, timeout, cancelación, retries seguros y handoff.
5. **Human Oversight:** aprobación previa para acciones sensibles, colas de revisión, takeover y kill switch.
6. **Agent Memory & Context:** referencias a datos autorizados con retención, procedencia y aislamiento; no copiar indiscriminadamente el CRM a una memoria paralela.
7. **Execution Ledger & Audit:** cada tool call, decisión de policy, aprobación, resultado, coste y correlación con el caso de uso.
8. **Evaluation & Observability:** calidad, seguridad, latencia, coste, grounding, tasa de escalamiento y regresiones.

Dirección de dependencias:
- Agent Orchestration consume contratos públicos de CRM, Inbox, Automation, Meta adapters, Policy & Consent y Billing/Usage.
- CRM no importa agentes ni depende de un proveedor/modelo de IA.
- AI Gateway abstrae proveedores de modelos; Agent Runtime consume AI Gateway y Tool Gateway mediante ports.
- Tool Gateway valida identidad, delegación, capability, purpose, consent, presupuesto y aprobación en cada ejecución.
- Los efectos externos se ejecutan mediante use cases/adapters existentes y outbox durable; nunca desde el prompt ni mediante SQL directo del agente.
- El registro de ejecución no sustituye la auditoría inmutable de plataforma.

## 6. Controles no negociables

- Denegar por defecto cuando falte identidad, grant, capability, consentimiento o evidencia.
- Permisos de agente limitados por tenant, actor delegante, recurso, operación, finalidad y expiración.
- Ningún prompt, memoria o respuesta de modelo puede elevar privilegios.
- Separar sugerir, preparar, solicitar aprobación y ejecutar.
- Aprobación step-up/doble control para acciones de alto impacto (gasto, campañas, envío masivo, exportación, borrado, credenciales y cambios de acceso).
- Idempotencia, límites de frecuencia, límites de gasto, rate limits y kill switch.
- Protección contra prompt injection, tool misuse, exfiltración cross-tenant y contenido no confiable.
- Redacción de PII/secrets en logs; retención y eliminación gobernadas por Policy & Privacy.
- Revalidar autorización inmediatamente antes del efecto externo.
- Evaluación adversarial y pruebas de regresión antes de habilitar cada tool/capability.

## 7. Criterio para decidir si ARM merece un bounded context propio

Implementar ARM separado solo cuando se cumplan conjuntamente estos requisitos:
1. Existan agentes externos reales que necesiten descubrir o invocar capacidades de tenants WhatsBusiness.
2. Se necesite identidad de agente verificable y no baste la identidad del usuario humano o del proveedor.
3. Haya delegación, permisos, reputación/confianza, límites y revocación específicos por agente.
4. Se requiera interoperabilidad agent-to-agent o protocolos externos versionados.
5. Los handoffs, compromisos y efectos entre agentes requieran un ledger/audit especializado.
6. El discovery comercial valide que clientes/agencias usarán y pagarán por esta capacidad.

Si estas condiciones no se cumplen, implementar agentes internos dentro de AI Assistance/Automation y mantener el CRM tradicional con IA integrada. Evitar un bounded context vacío o un nuevo producto solo por tendencia.

## 8. Impacto sobre el roadmap

No cambiar ni eliminar TASK-035, TASK-042..043 y TASK-053. El alcance CRM sigue vigente.

Reorganización recomendada:
- Completar CRM core: Contact, ContactIdentity, Company, Lead, Assignment, Pipeline, Opportunity, Activity, merge/dedupe y provenance.
- Completar Inbox y Webhook/Event Platform para disponer de interacciones fiables.
- Completar AI Assistance Gateway y Automation Engine.
- Añadir Agent Registry, Tool Gateway, Delegation, Agent Runtime, Human Oversight y Evaluation como capacidades explícitas vinculadas a TASK-074..080, ampliando trazabilidad y aceptación.
- Integrar CRM e Inbox con agentes por APIs/eventos versionados; no compartir tablas privadas ni duplicar contactos/conversaciones en stores de agente.
- Probar primero agentes assistive y ejecución con aprobación; ampliar autonomía por riesgo y evidencia, no por configuración de marketing.

## 9. Decisiones pendientes del propietario

1. Confirmar qué significa ARM en esta petición: Agent Relationship Management, Agentic Relationship Management, Account Relationship Management u otro.
2. Confirmar si ARM debe ser el posicionamiento comercial principal, manteniendo CRM como módulo, o solo una capacidad interna.
3. Validar el posicionamiento con entrevistas y pruebas de comprensión con el ICP; no inferir demanda ni disposición a pagar sin evidencia.

Hasta resolver estas preguntas, el cambio de naming y cualquier breaking change quedan **propuestos**, no aceptados.

## 10. Fuentes de investigación consultadas

- Microsoft Dynamics 365, definición y alcance de CRM: https://www.microsoft.com/en-us/dynamics-365/resources/what-is-crm
- Australian Government Architecture, categorías operacionales, analíticas, colaborativas y estratégicas de CRM: https://architecture.digital.gov.au/capability/customer-relationship-management-business
- The ARM, definición emergente de Agent Relationship Management: https://thearm.ai/arm
- NetOne, uso del término Agentic Relationship Management y comparación con CRM: https://netone.com.ar/crm-vs-arm-gestion-de-relaciones-b2b-con-ia-netone--news--7-1150

Las definiciones de ARM citadas describen usos de mercado concretos, no un estándar normativo ni una categoría universal consolidada. La fuente comercial emergente no se trata como prueba de adopción masiva.

## 11. Criterio de cierre

La evaluación queda lista para decisión de producto, pero no para declarar una migración implementada. El cierre requiere confirmar la expansión de ARM, aprobar el posicionamiento, actualizar docs/29 y los contratos/roadmap afectados, y después implementar mediante bounded contexts sin romper el CRM existente.
