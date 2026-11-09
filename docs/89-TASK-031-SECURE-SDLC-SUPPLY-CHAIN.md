# 89 — TASK-031: automatización Secure SDLC y cadena de suministro

**Fecha:** 2026-11-08  
**Rama de implementación:** `feat/task-031-supply-chain-security`  
**Tarea:** TASK-031 / US-016  
**Estado del paquete:** implementación parcial integrada en rama; no verificada ni aceptada.

## Objetivo

Agregar detección repetible de secretos, análisis de dependencias y configuración IaC, generación de SBOM y actualización controlada de dependencias sin añadir paquetes runtime al producto ni conceder permisos de escritura al pipeline.

## Cambios de código

- `.github/workflows/supply-chain-security.yml`: ejecuta Gitleaks sobre historial completo y árbol de trabajo; analiza vulnerabilidades de dependencias y configuraciones de infraestructura con Trivy; genera un SBOM CycloneDX; publica ambos artefactos por 14 días.
- `.github/dependabot.yml`: configura actualizaciones semanales para dependencias pnpm/npm y GitHub Actions directamente contra `environment/local`, con límites de PR abiertos.
- Las acciones externas se fijan por SHA inmutable: checkout v6, Gitleaks Action v3.0.0, setup-trivy v0.3.1 y upload-artifact v7.0.2. Trivy CLI se fija a v0.76.2.

## Política aplicada

- El flujo dispone solo de `contents: read`; no necesita credenciales Meta, tokens de aplicación ni secretos del entorno.
- Gitleaks usa historial completo para detectar secretos introducidos en commits anteriores; los comentarios de PR y la subida de artefactos del scanner se desactivan.
- Trivy falla el job ante vulnerabilidades o configuraciones de severidad HIGH/CRITICAL. El reporte y el SBOM se intentan publicar incluso cuando el scan encuentra hallazgos, para preservar evidencia de remediación.
- La salida CycloneDX se genera desde el workspace y los lockfiles; no representa imágenes de producción inexistentes ni demuestra el estado de un despliegue.
- Dependabot genera PR de actualización; no mergea automáticamente ni habilita cambios de versión sin revisión.

## Límites pendientes para cerrar TASK-031

- Falta habilitar/verificar en Settings del repositorio Dependency Graph, Dependabot Alerts y Dependabot security updates; el archivo YAML por sí solo no activa esas funciones de la cuenta.
- No existe imagen de aplicación versionada para ejecutar container image scan ni pipeline de firma/provenance/attestation de artefactos.
- DAST autenticado, fuzzing de endpoints, verificación ASVS 5.0, pentest, respuesta a vulnerabilidades con SLA y flujo de aceptación de riesgo CR-0018 continúan pendientes.
- El pipeline no prueba controles de producción, no reemplaza revisión independiente y no habilita despliegues.

## Verificación

El código del workflow y la configuración Dependabot quedan versionados. El primer Source CI/CodeQL del HEAD que integre este paquete debe comprobar la sintaxis y el resultado efectivo de ambos jobs; no se declara ningún scan aprobado antes de ese run.

## Referencias

- Threat model y controles: [docs/08](08-SECURITY-AND-PRIVACY.md).
- Backlog: [docs/11](11-TASK-BACKLOG.md), TASK-031.
- Plan de código fuente: [docs/78](78-SOURCE-COMPLETION-PLAN-71-TASKS.md), Frente A.
- Gitleaks Action v3 y runtime Node 24: https://github.com/gitleaks/gitleaks-action/releases/tag/v3.0.0
- Trivy filesystem/SBOM: https://trivy.dev/docs/latest/target/filesystem/ y https://trivy.dev/docs/latest/supply-chain/sbom/
- Dependabot: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file
