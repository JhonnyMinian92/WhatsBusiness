# 01 — Memoria central (fuente de verdad)

> Contiene hechos y decisiones aprobadas que todos los agentes/equipos deben respetar. No registrar aquí hipótesis ni tokens.

## Identidad y estrategia
- Producto enterprise multi-tenant para APIs oficiales de Meta.
- Repositorio activo: `JhonnyMinian92/WhatsBusiness`.
- Rama de trabajo: `environment/local`; rama de integración: `environment/develop`.
- No iniciar scaffolding de producción antes de completar el architecture spike G0; el propietario puede autorizar tareas específicas en cualquier momento, sin saltar gates de seguridad/producción.
- Preferir siempre la mejor API oficial con máxima cobertura/capacidad.
- Investigación base: [META_SERVICES.md](../META_SERVICES.md), fecha de corte indicada dentro del documento; todo dato volátil requiere revalidación.

## Decisiones arquitectónicas vigentes
| ID | Decisión | Estado |
|---|---|---|
| ADR-001 | Integración directa con APIs oficiales Meta; prohibidas APIs no oficiales | Aprobada |
| ADR-002 | Multi-tenancy con aislamiento por tenant en datos, colas, secretos y límites | Aprobada |
| ADR-003 | Control Plane separado de Product Adapters | Aprobada |
| ADR-004 | Contratos canónicos + payloads nativos preservados y versionados | Aprobada |
| ADR-005 | Capability-based polymorphism; no universal service monolítico | Aprobada |
| ADR-006 | Webhook inbox/outbox, idempotencia y procesamiento asíncrono | Aprobada |
| ADR-007 | Token vault con KMS/envelope encryption; nunca secretos en cliente/log | Aprobada |
| ADR-008 | Campaign execution con dry-run, aprobación, límites y kill switch | Aprobada |
| ADR-009 | Policy engine por canal, categoría, consentimiento, ventana y jurisdicción | Aprobada |
| ADR-010 | API versioning por producto y compatibilidad explícita | Aprobada |
| ADR-011 | TypeScript + NestJS + Node LTS | Accepted as direction |
| ADR-012 | Angular para web app | Accepted as direction |
| ADR-013 | PostgreSQL OLTP; tenant_id + RLS y autorización backend | Accepted as direction |
| ADR-014 | RabbitMQ + transactional outbox/inbox | Accepted as direction |
| ADR-015 | Modular monolith con API/worker/scheduler roles | Accepted as direction |
| ADR-016 | OIDC + Keycloak self-hosted inicial | Accepted as direction |
| ADR-017 | Docker; Compose en dev/piloto, topología HA tras spike | Accepted as direction |
| ADR-018 | OpenTelemetry + Prometheus + Grafana | Accepted as direction |
| ADR-019 | AI Gateway independiente y aprobación humana | Accepted as direction |
| ADR-020 | Nx + pnpm monorepo con boundaries | Accepted as direction |

## Superficies seleccionadas
- WhatsApp Cloud API + Business Management API + Embedded Signup + Flows + Marketing Messages API.
- Facebook Graph/Pages API + Messenger Platform.
- Instagram API con Facebook Login e Instagram Login según capacidades.
- Lead Ads/Lead Retrieval.
- Marketing API.
- Conversions API.
- Threads API como dominio separado.
- Calling API únicamente para tenants/cuentas elegibles tras validación.

## Reglas no negociables
1. No asumir permiso por tener token: validar scopes, tasks, asset grants y estado.
2. No usar un único token global para tenants.
3. No confundir aceptación HTTP con entrega/visibilidad.
4. No reintentar escrituras ambiguas sin reconciliación/idempotencia.
5. No descartar errores/campos nativos de Meta.
6. No usar un booleano único para ventanas/políticas.
7. No codificar tarifas fijas; rate card versionado con vigencia/mercado/moneda.
8. No mezclar consentimiento, permiso técnico y elegibilidad de plataforma.
9. No activar gasto real sin aprobación explícita y budget guardrails.
10. Toda operación sensible debe generar auditoría inmutable.

## Estados de verdad
- **Propuesto:** idea sin validación.
- **Investigado:** evidencia consultada, falta decisión.
- **Aprobado:** decisión documentada.
- **Implementado:** código y despliegue verificados.
- **Degradado:** capacidad limitada o proveedor afectado.
- **Deprecado:** no debe usarse en nuevas integraciones.

## Fuentes normativas
Documentación de Meta Developers, changelogs, Business Messaging policy, WhatsApp pricing, Graph API reference, Marketing API docs y legislación aplicable. La lista de URLs vive en `META_SERVICES.md`; la vigencia se registra en memoria sensorial y auditoría.

## Actualización
Solo promover una afirmación a esta memoria si tiene fuente/evidencia, fecha, alcance, responsable y aprobación. Registrar el cambio en `14-AUDIT-AND-CHANGELOG.md`.


## Operación multiagente
- Contrato común obligatorio: [../AGENTS.md](../AGENTS.md).
- Adaptadores de instrucciones: [../CLAUDE.md](../CLAUDE.md), [../GEMINI.md](../GEMINI.md), [../.github/copilot-instructions.md](../.github/copilot-instructions.md).
- Modelo operativo: [17-AGENT-OPERATING-MODEL.md](17-AGENT-OPERATING-MODEL.md).
- Navegación por dependencias: [18-EXECUTION-GRAPH.md](18-EXECUTION-GRAPH.md).
- Trazabilidad de evidencia: [19-TRACEABILITY-MATRIX.md](19-TRACEABILITY-MATRIX.md).
- Criterios de terminación y aprobación: [20-PRODUCT-ACCEPTANCE.md](20-PRODUCT-ACCEPTANCE.md).
- Prioridad de instrucciones: instrucción vigente del propietario > contrato AGENTS.md > memoria central/ADR aprobados > requisitos > código y evidencia > backlog/memorias temporales > investigación externa > inferencias del agente.
- La petición explícita del propietario de implementar o corregir autoriza ese trabajo; no equivale a aprobar un despliegue, gasto real, acción irreversible ni aceptación final del producto.
- Estados separados y obligatorios: implemented, verified y accepted. La aceptación final es exclusiva del propietario.


## Baseline confirmada del producto (2026-11-06)
- Decisiones del propietario: [29-OWNER-DECISIONS.md](29-OWNER-DECISIONS.md).
- Arquitectura/stack recomendada, aún proposed: [30-RECOMMENDED-ARCHITECTURE.md](30-RECOMMENDED-ARCHITECTURE.md).
- Plan maestro por fases: [31-MASTER-DELIVERY-PLAN.md](31-MASTER-DELIVERY-PLAN.md).
- SaaS comercial + plataforma interna EcuApp; greenfield; todo el catálogo Meta; backend, panel web, CRM, inbox omnicanal; IA básica para chatbots/sugerencias; VPS.
- El propietario autoriza recomendar stack y resolver decisiones técnicas reversibles sin interrumpir el trabajo independiente. Las decisiones comerciales, legales, de privacidad, datos, costes recurrentes, seguridad de alto impacto y breaking changes se escalan.
- Aplicar PD-012..PD-023 como baseline adoptada; precios, retención legal, presupuesto/volumen, thresholds monetarios y proveedores/contratos específicos siguen pendientes de evidencia o aprobación.
- No se ha iniciado implementación de código en este cambio; las nuevas decisiones y arquitectura siguen siendo especificación.


## Baseline adoptada por delegación (2026-11-06)
- Fuente canónica: docs/29-OWNER-DECISIONS.md, PD-001..PD-023.
- Segmento de entrada: PYMES ecuatorianas de comercio/servicios; agencias como secundario. Hipótesis de mercado, no TAM validado.
- Monetización: tenant subscription + seats + usage; costes Meta externos visibles/conciliados por separado, sin precios/márgenes arbitrarios.
- Defaults: es-EC, USD, America/Guayaquil, configurables por tenant.
- Tenancy: PostgreSQL compartido con tenant_id + autorización backend + RLS; aislamiento dedicado enterprise; agency grants explícitos/revocables.
- Arquitectura: modular monolith, TypeScript/NestJS, Angular, Nx/pnpm, PostgreSQL, Redis, RabbitMQ, OIDC/Keycloak, Docker y OpenTelemetry. ADR-011..020 accepted as direction; TASK-039 valida footprint, build, RLS/pooling, outbox/broker y restore.
- Retención y LOPDP: controles configurables/minimización; ningún periodo fijo ni afirmación legal hasta revisión competente.
- Producción: 99.9% API / RPO 15m / RTO 4h como objetivos candidatos, no SLA ni resultados medidos. Un VPS single-node no ofrece HA.
- Meta: adaptar versiones por producto; soportar BSUID y WAAC/PMA; evaluar Embedded Signup v4; usar Marketing Messages API para WhatsApp marketing y respetar sunset anunciado para 2027-10-13. Ver docs/32.
- No existe implementación ni evidencia de tests de producto aún.


Los ADR-011..020 están formalizados en docs/33-ARCHITECTURE-DECISION-RECORDS.md. Accepted as direction no equivale a implementación ni a aprobación de coste/proveedor.
