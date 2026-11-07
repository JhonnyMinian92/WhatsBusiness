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
