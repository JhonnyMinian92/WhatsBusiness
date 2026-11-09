# 89 — TASK-031: automatización Secure SDLC y cadena de suministro

**Fecha:** 2026-11-09  
**Rama canónica:** `environment/local`  
**Tarea:** TASK-031 / US-016  
**Estado:** workflow y Dependabot integrados; validación del nuevo HEAD pendiente.

## Objetivo

Detección repetible de secretos, análisis de dependencias/IaC, SBOM y actualización controlada de dependencias sin añadir paquetes runtime ni conceder permisos de escritura al pipeline.

## Cambios integrados

- `.github/workflows/supply-chain-security.yml`: Gitleaks con historial completo; Trivy para vulnerabilidades y configuración IaC; SBOM CycloneDX; artefactos de reporte/SBOM con retención de 14 días.
- `.github/dependabot.yml`: actualizaciones semanales npm/pnpm y GitHub Actions contra `environment/local`.
- Acciones externas fijadas por SHA inmutable; Trivy CLI fijado a v0.76.2.
- Solo permiso `contents: read`; no requiere credenciales de Meta ni secretos de aplicación.

## Política

Gitleaks desactiva comentarios PR y subida de artefactos propios. Trivy falla en HIGH/CRITICAL; reportes y SBOM se intentan publicar para preservar evidencia. Dependabot abre PR pero no mergea automáticamente.

## Verificación y límites

La rama de origen de PR #6 mostró éxito en Secret detection y Dependency/IaC/SBOM. El nuevo HEAD canónico debe ejecutar el workflow para verificar la integración completa. Falta habilitar/verificar Dependency Graph, Dependabot Alerts/security updates en Settings; container image scanning y firma/attestation cuando exista imagen; DAST autenticado, fuzzing, ASVS 5.0, pentest, SLA de respuesta y aceptación CR-0018. El workflow no prueba controles productivos.

## Referencias

- [Threat model](08-SECURITY-AND-PRIVACY.md)
- [Backlog](11-TASK-BACKLOG.md), TASK-031
- [Plan de código fuente](78-SOURCE-COMPLETION-PLAN-71-TASKS.md)
- https://github.com/gitleaks/gitleaks-action/releases/tag/v3.0.0
- https://trivy.dev/docs/latest/target/filesystem/
- https://trivy.dev/docs/latest/supply-chain/sbom/
- https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file
