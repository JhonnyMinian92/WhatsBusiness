# 08 — Seguridad, ciberseguridad y privacidad

## 1. Objetivos
Confidencialidad, integridad, disponibilidad, aislamiento multi-tenant, trazabilidad, minimización de datos, cumplimiento de condiciones Meta y protección contra abuso.

## 2. Modelo de amenazas
| Amenaza | Impacto | Controles |
|---|---|---|
| BOLA/IDOR cross-tenant | Exposición/acción sobre activos ajenos | tenant scope obligatorio, ownership check, tests negativos |
| Token theft | Control de activos Meta | vault, KMS, rotación, scopes mínimos, detección de anomalía |
| OAuth CSRF/code injection | Conexión de cuenta atacante | state one-time, PKCE donde aplique, redirect allowlist |
| Webhook spoof/replay | Mensajes/eventos falsos | firma/challenge, timestamp, dedupe, replay window |
| SSRF en media/URLs | Acceso a red interna | allowlist host, egress proxy, DNS/IP validation |
| Payload DoS | Caída de workers | límites, schema validation, queue quotas |
| Secret leakage | Compromiso de app/tenant | redacción logs, secret scanning, no secrets en repo |
| Privilege escalation | Campañas/activos no autorizados | RBAC/ABAC, separación de duties, step-up |
| Cost abuse | Gasto de anuncios o mensajería | quotas, budgets, approvals, anomaly detection, kill switch |
| Supply-chain compromise | Ejecución maliciosa | SBOM, lockfiles, SCA, firma y provenance |
| Data exfiltration | PII/leads expuestos | cifrado, egress controls, DLP, auditoría |
| Insider misuse | Uso ilegítimo | least privilege, JIT access, immutable audit |

## 3. Controles obligatorios
- OAuth state criptográficamente aleatorio, single-use, corto TTL y ligado a tenant/actor/session.
- Token exchange server-side; tokens cifrados con envelope encryption/KMS; claves separadas por entorno y política de rotación.
- App Secret nunca llega al frontend, logs, errores ni repositorio.
- RBAC + ABAC: tenant, rol, asset ownership, action, purpose y risk context.
- MFA/step-up para conexión, exportación masiva, permisos y gasto.
- TLS moderno en tránsito; cifrado de DB/object storage/backups.
- Webhook signature verification conforme al producto; challenge GET y firma POST no son equivalentes.
- Idempotency keys y protección anti-replay.
- Sanitización y redacción de PII/tokens en telemetría.
- Retención y borrado verificable, incluyendo colas, backups según política y artefactos derivados.
- Rate limit por tenant/actor/asset y protección WAF.
- Secret scanning, SAST, DAST, SCA, container scanning, SBOM y pentest.
- Segregación dev/local/develop/staging/prod; apps y credenciales separadas.

## 4. Privacidad y LOPDP Ecuador
Definir roles responsable/encargado, finalidad, base legitimadora, aviso, derechos, transferencias, subencargados, retención y eliminación. No asumir que conectar Meta implica base legal suficiente. Revisión legal especializada antes de producción.

## 5. Data classification
- C0 pública: docs, schemas públicos.
- C1 interna: configuración no sensible.
- C2 confidencial: IDs de activos, métricas de negocio.
- C3 personal: leads, contactos, conversaciones.
- C4 secreto: app secret, access token, encryption key, signing secret.
C3/C4 nunca en ejemplos públicos, commits, logs sin redacción ni tickets abiertos.

## 6. Secure SDLC
Threat modeling por historia; revisión de dependencias; SAST/SCA en PR; tests de autorización; revisión de secretos; DAST y pentest pre-release; gestión de vulnerabilidades con SLA por severidad; respuesta a incidentes y rotación de credenciales.

## 7. Severidad
- S0 crítica: fuga cross-tenant, exposición C4, takeover, gasto no autorizado.
- S1 alta: acceso indebido a PII, bypass policy, webhook forgery aceptado.
- S2 media: degradación acotada, inconsistencia recuperable.
- S3 baja: defecto visual/documental sin impacto operativo.

## 8. Gate de seguridad
No liberar si hay vulnerabilidades críticas/altas sin mitigación aceptada, secretos detectados, tests de aislamiento fallidos, auditoría incompleta o mecanismo de revocación/eliminación no probado.


## 9. Baseline de verificación OWASP ASVS (adoptada 2026-11-06)
- Utilizar OWASP ASVS 5.0.0 como catálogo de controles verificables para aplicación web y servicios.
- Objetivo mínimo de referencia: nivel 2 donde el requisito aplique; riesgos críticos de tenant isolation, OAuth/token vault, administración, webhooks, ads spend, export/delete y herramientas IA elevan controles mediante threat model.
- Cada control seleccionado debe mapearse a requisito/test/evidencia; no afirmar "ASVS compliant" por solo citar el estándar.
- Revisar versión vigente al ejecutar assessment.

## 10. Privacidad aplicada al SaaS multi-tenant
- Minimización desde el diseño; separar finalidad, base legitimadora, consentimiento, canal, fuente, aviso y revocación.
- Data inventory y records of processing por finalidad/tenant.
- Retención configurable por data class y tenant policy, con legal hold cuando aplique y evidencia de purga.
- Data subject rights workflow: acceso, copia/export, rectificación, oposición/revocación cuando aplique, supresión y registro de respuesta.
- Orquestar borrado/exportación en DB, object store, search, cache, queues, webhook payloads, proveedores/subencargados IA y artefactos derivados. Definir backups según política/legal.
- Registrar responsable/controlador, encargado/procesador, subencargados, transferencias internacionales, región y contrato.
- No fijar plazos de retención ni asumir que consentimiento es siempre base legitimadora. Revisión especializada LOPDP/RGLOPDP/SPDP antes de tratar datos reales en producción.
- No enviar conversaciones/leads/PII a proveedores IA externos hasta aprobar base legal, contrato, región, tratamiento, retención y configuración.
- Soporte entre tenants usa grant JIT, finalidad, step-up, duración corta y audit; nunca acceso global implícito.


## 11. Seguridad específica de campañas, creativos y agentes
- Ads writes solo mediante backend service identity; tokens de Meta jamás se exponen a prompts, frontend o tools sin control.
- AI Agent Tool Gateway usa allowlist de herramientas, JSON schema validation, purpose binding, tenant and asset scope, rate limits, budget ceilings, approval IDs, idempotency and audit.
- El agente no puede cambiar su propio rol, permission scopes, budget cap, approval matrix ni kill switch.
- Campaign external writes exigen snapshot, preflight, account spend limit, policy, approval y reconciliación de respuesta ambigua.
- PD-024 es enforced server-side con concurrency control/serializable lock y rolling window; no aceptar cambios duplicados/parallel tool calls para bypass del cap.
- Creatives AI: conservar source/model/prompt, derechos, consentimiento de persona/voz, claim evidence, brand kit, preview y aprobación. AI feature eligibility debe validarse; si Meta requiere PAUSED first, mantenerlo hasta approval.
- Prohibir generación/publicación de claims engañosos, precio no verificado, testimonios sintéticos presentados como reales, imágenes de personas sin derechos y targeting/personalization que viole política/ley.
- No usar CAPI/CRM para enviar datos personales sin legal basis/consent/purpose y minimización; hash no equivale a anonimización.
- Business Agent/MCP external connectors deben aplicar scopes mínimos y prevenir double replies, action replay y prompt injection.
- OpenWA/WhatsApp Web/browser automation no forma parte del runtime autorizado.

## Approval, step-up y audit stream — implementación sintética (2026-11-07)

- Las aprobaciones se vinculan por SHA-256 a tenant/action/purpose/resource/snapshot; no autoaprobación; quorum de aprobadores distintos; expiración y consumo único. El payload de negocio original no se guarda en el registro de approval.
- Step-up no acepta flags/client headers. Solo acepta `auth_time`, `acr`, `amr` presentes en JWT RS256/JWKS verificado, reciente y concordante con allowlist del IdP. ACR/AMR no se interpretan universalmente; confirmar la semántica del proveedor real antes de habilitarlo. Defaults vacíos bloquean la operación.
- Audit y approval decision records están protegidos por triggers append-only y hash chain SHA-256 por tenant. Esto detecta alteraciones en el stream bajo el rol runtime; no sustituye backup independiente, monitoreo, segregación DBA ni anclaje externo y no protege contra un administrador privilegiado.
- Source CI run #112 [42387272987](https://github.com/JhonnyMinian92/WhatsBusiness/actions/runs/42387272987) pasa pruebas PostgreSQL sintéticas. No se han validado cuentas/IdP reales, controles legales de retención, política de aprobadores de producción ni operación de consumidores externos.
- Las rutas IAM-018..020 siguen catalog-only; ningún endpoint ni acción externa quedó habilitada por la implementación de estos primitives.
## 12. Secure SDLC y cadena de suministro — TASK-031 (2026-11-08)

- Se incorpora `.github/workflows/supply-chain-security.yml`: Gitleaks sobre historial completo y árbol actual; Trivy para vulnerabilidades de dependencias y misconfiguration IaC; generación de CycloneDX SBOM y artefactos de evidencia.
- `.github/dependabot.yml` programa actualizaciones semanales de paquetes pnpm/npm y GitHub Actions contra `environment/local`. Las actualizaciones se proponen como PR; no hay auto-merge.
- Los jobs usan permisos mínimos `contents: read`. Los actions están fijados a commit SHA y Trivy CLI a versión concreta.
- El gate configurado falla ante hallazgos Trivy HIGH/CRITICAL. El reporte y SBOM se publican incluso si el scan detecta vulnerabilidades, para facilitar su remediación.
- El workflow no activa por sí mismo Dependency Graph/Dependabot Alerts/Security Updates en la configuración del repositorio. Debe comprobarse esa configuración de GitHub por un administrador.
- Quedan fuera del slice: container scan de imagen productiva (no existe imagen release versionada), firma/provenance/attestation, DAST autenticado, ASVS assessment, pentest y CR-0018 risk acceptance. TASK-031 sigue `in_progress`.
- Detalle de implementación: [docs/89](89-TASK-031-SECURE-SDLC-SUPPLY-CHAIN.md). No se afirma ejecución exitosa de los scans hasta leer CI del commit que contenga el workflow.
