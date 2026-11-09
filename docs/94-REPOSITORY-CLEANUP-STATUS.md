# Estado de limpieza del repositorio — 2026-11-09

## Objetivo

Mantener `environment/local` como única rama de trabajo y, cuando se complete el cambio de configuración del repositorio, como única rama remota restante.

## Estado verificado

- Rama canónica de trabajo: `environment/local`.
- HEAD documental de esta actualización: `758a8596d032cc6f6111df5bbf3f070ffd938a15`.
- Último HEAD de código con validación completa: `08f08ceec20724232bbd2482fcc2593bbc9fc82f`.
- Rama predeterminada configurada en GitHub: `master` (todavía no es `environment/local`).
- Ramas remotas visibles: 26 (la canónica más 25 adicionales).
- Pull requests abiertas: 0.
- Código recuperado de ramas de funcionalidad: consolidado en `environment/local`; las migraciones trasladadas se renumeraron para no colisionar con el historial activo.

## Ramas adicionales que deben retirarse

No borrar `environment/local`. Una vez cambiada la rama predeterminada a `environment/local`, las siguientes 25 referencias deben eliminarse:

```text
environment/develop
feat/phase-1-foundations-meta-access
feat/phase-2-meta-control-plane
feat/task-003-runtime-adapters-valkey-s3
feat/task-031-supply-chain-security
feat/task-060-http-benchmark-harness
feat/us-015-resilience-performance
feat/us-029-campaign-intelligence
feat/us-031-agent-tool-interoperability
feature/us-016-essential-data-model
feature/us-018-crm-completion
feature/us-025-partner-access
feature/us-025-partner-access-current
feature/us-025-partner-access-current-head
feature/us-025-partner-access-final
feature/us-025-partner-access-final-ci
feature/us-025-partner-access-fresh
feature/us-025-partner-access-latest-base
feature/us-025-partner-access-mergeable
feature/us-025-partner-access-release
feature/us-025-partner-access-release-final
feature/us-025-partner-access-reviewed
fix/platform-source-typecheck-front-a
fix/task-006-oauth-migration-integrity
master
```

## Resultado del análisis de contenido

- `environment/develop` está detrás de `environment/local`; no aporta commits adelantados.
- `feat/phase-2-meta-control-plane` está detrás de la rama canónica; no aporta commits adelantados.
- Las variantes `feature/us-025-partner-access-*` son ramas repetidas de un mismo paquete. La política y sus pruebas ya están presentes en la rama canónica.
- El runtime de agentes está en la rama canónica; su migración activa es `0044-agent-tool-runtime.sql`, no la migración antigua `0032`.
- US-015 y su infraestructura de resiliencia están en la rama canónica. La migración de checkpoints está en `apps/api/migrations/0045-meta-resilience-cursor-checkpoints.sql`.
- US-018 CRM custom fields, sus permisos y la migración están integrados; la operación idempotente tiene una migración de ampliación posterior.
- `master` es la rama predeterminada antigua. Su historia diverge y contiene artefactos de la arquitectura anterior: `.github/workflows/ci.yml`, `apps/api/migrations/001_meta_resilience.sql`, `tsconfig.json` y `types/node-shims.d.ts`. La migración de resiliencia fue sustituida por la migración 0045; el criterio de aceptación US-015 se recuperó en `docs/user-stories/US-015-rate-limits-resilience-performance.md`. No debe usarse como rama de desarrollo.
- `feat/phase-1-foundations-meta-access` conserva una implementación alternativa/antigua de servicios y cifrado. No se fusionó masivamente porque no comparte los contratos ni el composition root actuales; la rama canónica ya tiene los módulos de identidad, OAuth y vault fail-closed de la arquitectura vigente.

## Validación de código del HEAD canónico

Sobre `08f08ceec20724232bbd2482fcc2593bbc9fc82f` se confirmó:

- Source workspace validation: SUCCESS.
- CodeQL security analysis: SUCCESS.
- Supply-chain security: SUCCESS.
- Build, typecheck, API + PostgreSQL, Meta backend + PostgreSQL/RabbitMQ, Inbox, migraciones e idempotencia: SUCCESS.

Evidencia:
- https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42607290191
- https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42607294644
- https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42607290488

## Bloqueo operativo pendiente

La conexión GitHub utilizada en esta sesión permite leer ramas y commits, actualizar referencias existentes y escribir archivos, pero no expone las mutaciones administrativas necesarias para:

1. Cambiar `default_branch` del repositorio de `master` a `environment/local`.
2. Eliminar referencias Git remotas.

Por esta limitación no se afirma que las ramas hayan sido borradas. No se eliminó ni reescribió historia de ninguna rama.

## Pasos de cierre en GitHub

1. En **Settings → General → Default branch**, cambiar `master` por `environment/local`.
2. Revisar que cualquier ruleset/protección de `master` tenga su equivalente en `environment/local`.
3. Eliminar las 25 referencias listadas arriba desde la vista **Branches** de GitHub.
4. Volver a verificar que el repositorio muestre una sola rama: `environment/local`, y que `default_branch` apunte a ella.

Hasta completar esos pasos, la limpieza del repositorio sigue **incompleta** aunque el código y la validación de la rama canónica estén consolidados.
