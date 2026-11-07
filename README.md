# WhatsBusiness

Plataforma SaaS multi-tenant y plataforma interna EcuApp para integrar oficialmente los productos y APIs del ecosistema Meta. Incluye backend, panel web, CRM, Inbox omnicanal, automatizaciones y asistencia IA gobernada.

> **Estado:** greenfield. La documentación y los contratos iniciales están preparados. Los agentes pueden comenzar trabajo preparatorio y el Architecture Spike. El scaffold definitivo queda condicionado al gate G0 y a la ejecución verificable de TASK-039. No existe aún una implementación funcional.

## Entrada para agentes

1. Lee AGENTS.md, contrato obligatorio y límites de autorización.
2. Sigue docs/README.md y docs/46-AGENT-START-AND-WORKPACKETS.md.
3. Consulta docs/29-OWNER-DECISIONS.md, docs/30-RECOMMENDED-ARCHITECTURE.md y docs/31-MASTER-DELIVERY-PLAN.md.
4. Para identidad, CRM, Inbox, automatizaciones e IA, usa docs/37..41; para datos, contratos, seguridad y spike, usa docs/42..45.
5. Ejecuta únicamente el paquete de trabajo que te corresponda y conserva la rama autorizada.

## Estado técnico actual

- Rama de trabajo: environment/local. No tocar master ni environment/develop sin autorización expresa.
- No hay código de backend/frontend, migraciones, tests, Dockerfiles ni CI del producto en esta rama.
- Stack adoptada como dirección: TypeScript/NestJS, Angular, Nx/pnpm, PostgreSQL, Redis, RabbitMQ, OIDC/Keycloak, Docker y OpenTelemetry.
- TASK-039 (Architecture Spike) aún no está ejecutada; sus experimentos y criterios están definidos en docs/45.
- Contratos de partida OpenAPI, AsyncAPI y JSON Schema están en contracts/. Son contratos, no endpoints implementados.
- Sin pruebas de producto, benchmark de VPS, restore drill, revisión legal, permisos Meta o aceptación productiva acreditados.

## Reglas fundamentales

- Solo APIs oficiales de Meta; no scraping, WhatsApp Web ni transporte no oficial.
- Aislamiento multi-tenant y autorización server-side en cada trust boundary.
- Secrets/tokens nunca en Git, prompts, tests o logs.
- Webhooks son no confiables, duplicables y desordenados; persistencia durable, dedupe e idempotencia obligatorios.
- AI output es contenido no confiable; la IA inicial sugiere y asiste, no ejecuta acciones sensibles.
- No hay gasto publicitario, mensajería real, publicación, borrado irreversible ni despliegue productivo sin autorización explícita.
- Implemented, verified y accepted son estados distintos. La aceptación final pertenece al propietario.

## Fuentes de verdad

- Producto/decisiones: docs/29-OWNER-DECISIONS.md.
- Arquitectura y ADR: docs/30-RECOMMENDED-ARCHITECTURE.md y docs/33-ARCHITECTURE-DECISION-RECORDS.md.
- Ejecución: docs/31-MASTER-DELIVERY-PLAN.md y docs/46-AGENT-START-AND-WORKPACKETS.md.
- Integraciones Meta: docs/09-API-INTEGRATION-CATALOG.md y META_SERVICES.md; revalidar datos volátiles en fuentes oficiales.
