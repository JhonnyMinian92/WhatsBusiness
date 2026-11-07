# WhatsBusiness

Plataforma SaaS multi-tenant para integrar oficialmente los productos y APIs del ecosistema Meta: CRM, Inbox omnicanal, automatizaciones y asistencia IA gobernada.

**Estado: GO-CODE aprobado.** La rama `environment/local` ya contiene el workspace inicial NestJS + Angular. **GO-PRODUCTION continúa NO-GO**: no hay despliegue, datos de clientes, credenciales reales, mensajes reales, mutaciones Ads ni proveedores IA externos autorizados.

## Quick start

Requisitos: Node.js **26.13.0** y pnpm **10.34.9** (la versión exacta está declarada en `.node-version`, `package.json` y el lockfile).

```bash
corepack enable
corepack prepare pnpm@10.34.9 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

## Aplicaciones

| Ruta | Responsabilidad | Estado |
|---|---|---|
| `apps/api` | NestJS modular; prefijo HTTP `/api`; health live/readiness | Foundation inicial |
| `apps/web` | Angular standalone shell en español (es-EC) | Foundation inicial |
| `contracts/openapi` | Contratos HTTP y API ID registry | 296 operaciones activas; solo el health foundation está autorizado |
| `contracts/asyncapi` + `contracts/schemas` | Contratos versionados de eventos | 69 channels y 69 schemas; runtime publisher/consumer pendiente |
| `spike/task-039-lab` | Laboratorio aislado de infraestructura con datos sintéticos | Run #5 PASS; evidencia parcial |

### Endpoints iniciales

- `GET /api/health/live`: liveness del proceso.
- `GET /api/health/ready`: readiness fail-closed. Devuelve `503 application/problem+json` mientras PostgreSQL, RabbitMQ, Valkey y OIDC no estén configurados y verificados.

La shell Angular es un placeholder consciente: no ofrece selector de tenant ni autenticación hasta completar OIDC, membership y aislamiento tenant.

## Comandos de desarrollo

```bash
# API local
pnpm exec tsx apps/api/src/main.ts

# Web local
pnpm nx run web:serve

# Compilación y verificaciones
pnpm build
pnpm typecheck
pnpm test
```

API escucha en `http://localhost:3000`; Angular dev server en `http://localhost:4200`.

## Validación CI

- [Source workspace validation](https://github.com/JhonnyMinian92/WhatsBusiness/actions/workflows/source-validation.yml): install con lockfile, build, typecheck y tests.
- [Contract validation](https://github.com/JhonnyMinian92/WhatsBusiness/actions/workflows/contracts-validation.yml): Redocly/OpenAPI, AsyncAPI, JSON Schema y fixtures.
- [TASK-039 Docker lab](https://github.com/JhonnyMinian92/WhatsBusiness/actions/workflows/task039-lab.yml): smoke tests sintéticos de infraestructura.

## Orden del primer vertical slice

OIDC/JWKS → User/Identity/Tenant/Membership → PostgreSQL transaction-local tenant context + RLS mediante pool Node real → GET /v1/me y contexto de tenant → audit/outbox → Angular tenant selector → E2E y revisión independiente.

## Reglas esenciales

- Trabajar en `environment/local`; no modificar `master` ni `environment/develop`.
- Aplicar `AGENTS.md` y [docs/48 — coding architecture and reuse standard](docs/48-CODING-ARCHITECTURE-AND-REUSE-STANDARD.md).
- Autorización server-side y fail-closed en cada trust boundary; el tenant ID enviado por browser nunca concede acceso.
- No almacenar secretos, tokens o datos reales en Git, tests, logs o prompts.
- Usar exclusivamente APIs oficiales Meta. No WhatsApp Web/browser automation.
- AI output es no confiable; no enviar automáticamente mensajes ni ejecutar efectos sensibles.
- GO-CODE no equivale a GO-PRODUCTION; no gastar, publicar, enviar mensajes ni borrar datos reales sin approvals específicas.

## Documentación de decisión

- [docs/57 — GO-CODE / G0 decision and implementation kickoff](docs/57-IMPLEMENTATION-KICKOFF-AND-G0-DECISION.md)
- [docs/56 — Architecture review and acceptance gates](docs/56-ARCHITECTURE-REVIEW-AND-ACCEPTANCE-GATES.md)
- [docs/54 — TASK-039 execution evidence](docs/54-TASK-039-EXECUTION-AND-CONSISTENCY-REPORT.md)
- [docs/46 — Agent work packets](docs/46-AGENT-START-AND-WORKPACKETS.md)
