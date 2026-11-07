# 44 — Threat model inicial, clases de datos y privacy engineering

**Relacionado:** TASK-031/032/059, US-001..032, PD-016..019, OWASP ASVS 5.0.0.  
**Estado:** threat model de diseño inicial; requiere validación independiente y asesoría legal aplicable antes de datos reales.

## 1. Alcance y trust boundaries

Activos protegidos: identidad, tenant data, Meta connections/tokens, activos publicitarios, mensajes, contactos/leads, consent/suppression, campañas/presupuestos, archivos/media, workflows, AI prompts/outputs, audit records y backups.

Trust boundaries:
1. Browser/client → API edge.
2. API → identity provider.
3. API/domain → PostgreSQL/Redis/RabbitMQ/object storage.
4. Webhook provider → public ingress.
5. Worker → Meta/third-party APIs.
6. Tenant/partner/support actors → other tenant resources.
7. AI Gateway → model provider/tool interfaces.
8. CI/build/deploy → artifacts/secrets/runtime.
9. Operator → production environment.

## 2. Threat register STRIDE-oriented

| ID | Amenaza / ruta | Impacto | Controles mínimos | Evidencia / test |
|---|---|---|---|---|
| TH-001 | BOLA/IDOR cambiando tenant/resource ID | Cross-tenant disclosure/write | Server-side membership + ownership + RLS | Matriz negativa cross-tenant en cada recurso |
| TH-002 | Token Meta robado desde DB/log/prompt | Control de activos | Vault/KMS envelope encryption, least privilege, redaction, rotation/revoke | Secret scanning + rotation drill |
| TH-003 | OAuth CSRF/code substitution/redirect abuse | Conexión atacante | State one-time, PKCE cuando aplique, strict redirect allowlist | Replay/state/redirect tests |
| TH-004 | Webhook spoof/replay/oversized payload | Mensajes/leads falsos o DoS | Firma/challenge versionado, size limit, dedupe, durable inbox | Spoof/replay/malformed/flood tests |
| TH-005 | SSRF desde media URL/provider callback | Acceso a red interna | Host allowlist, DNS/IP validation, egress controls, redirect policy | Private/link-local/metadata IP deny tests |
| TH-006 | Queue poisoning/tenant spoof | Worker cross-tenant or code abuse | Signed/internal envelope, schema validation, quotas, idempotent consumer | Forged tenant/poison event/DLQ tests |
| TH-007 | Race en send/budget/handoff/merge | Duplicados, overspend, double reply, data corruption | Transactions, CAS/locks, idempotency, fresh-state check | Concurrent actors/workers tests |
| TH-008 | Privilege escalation / support access | Unauthorized operations | RBAC+ABAC, step-up, approval, JIT grants, audit | Permission matrix + expiry/revocation tests |
| TH-009 | Prompt injection / tool abuse | Data leakage/external write | Retrieved text untrusted; tool gateway; allowlist; no direct credentials | Red-team prompt/tool test |
| TH-010 | AI provider data transfer | Legal/privacy breach | Data minimization, approved purpose, DPA, region, consent/legal basis review | Provider deny test + legal assessment |
| TH-011 | Cost/spend abuse | Financial loss | Quotas, rate caps, PD-024, approval, kill switch, anomaly alert | Race/rolling 24h +20% cap tests |
| TH-012 | Supply-chain compromise | Runtime/code compromise | lockfiles, pinned versions, SBOM, SCA, signature/provenance, install review | CI dependency/security artifacts |
| TH-013 | Backup/object storage exposure | Persistent disclosure | Encryption, least privilege, access audit, tested restore | Restore and access-control evidence |
| TH-014 | Log/metric leakage | PII/secrets exposure | Redaction, pseudonymous labels, no message body/token labels | Automated log/telemetry scan |
| TH-015 | Deletion/retention gap | Excessive/undeleted data | Data inventory, policy engine, orchestrated deletion, backup policy | End-to-end deletion evidence |

## 3. Data classification baseline

| Class | Examples | Handling |
|---|---|---|
| C0 Public | Public product docs, non-sensitive help | Integrity/versioning; normal public hosting |
| C1 Internal | Build metadata, non-sensitive config | Authenticated access; avoid unnecessary exposure |
| C2 Confidential business | Campaign config, tenant settings, internal notes | Tenant authorization, encryption in transit/at rest where supported, least privilege |
| C3 Personal/sensitive context | Contact identifiers, messages, leads, CRM, user profiles | Purpose/consent/legal basis, minimization, restricted access, redaction, configurable retention, export/delete workflows |
| C4 Secrets/credentials | Meta tokens, app secrets, signing keys, DB credentials | External vault/KMS, envelope encryption, no logs/prompts/Git, rotation and restricted retrieval |

La clasificación no determina automáticamente una categoría legal especial ni una base jurídica.

## 4. Data inventory mínimo obligatorio

| Data set | Owner/context | Purpose | Stores/flows | Class | Retention |
|---|---|---|---|---|---|
| User/OIDC subject | Platform Identity | Authentication/account | IdP + platform DB | C3 | Policy input; define with legal review |
| Tenant/membership/grants | Platform Identity | Isolation/authorization | PostgreSQL + audit | C2/C3 | Contract/legal policy |
| Meta tokens | Meta Control Plane | Provider authorization | Vault/KMS + credential metadata | C4 | Revoke/purge per credential policy |
| Contacts/identities | CRM | CRM and routing | PostgreSQL/search | C3 | Tenant policy/legal review |
| Messages/native payload | Inbox/Meta adapters | Conversation and delivery | PostgreSQL/object storage/queue refs | C3 | Per-channel policy, legal review required |
| Leads/conversions | CRM/Campaigns | Sales lifecycle/measurement | PostgreSQL/analytics/CAPI | C3 | Purpose/contract-specific |
| Consent/suppression | Policy & Consent | Enforce permissions/opt-outs | PostgreSQL/audit | C3 | Retain minimum lawful evidence |
| Creative/media | Creative Lab | Ad content/rights/provenance | Object storage/Meta | C2/C3 | Rights and tenant policy |
| AI prompts/outputs | AI Gateway | Assistive features | Transient/provider/usage ledger | C2/C3/C4 based on content | Minimize; approved provider policy |
| Audit/security events | Audit | Accountability/investigation | Append-only store | C2/C3 | Period decided by legal/security review |
| Backups | SRE | Recovery | Encrypted backup storage | Inherit highest contained class | Defined expiry/access policy |

Cada dataset necesita owner, purpose, basis, fields, processors, region/transfers, user access, retention trigger, deletion route and backup handling. No se completan plazos por intuición.

## 5. Privacy controls

- Purpose limitation and field minimization at collection.
- Consent record/suppression by channel, purpose, source, notice version, timestamp and revocation where consent is the basis.
- Rectification/export/deletion workflow across DB, object store, cache, queues, search, analytics, AI-derived content and providers where contract permits.
- Retention policy versioned per data class and tenant, with legal hold support and exceptions requiring approval.
- Processor/subprocessor and international-transfer register before provider data use.
- DSR audit without duplicating personal data in audit logs.
- No production personal data in fixtures, local development, shared agent prompts or unapproved AI providers.
- Hashing or pseudonymization does not automatically mean anonymization.

## 6. Secure SDLC and verification

ASVS 5.0.0 es catálogo de controles, no afirmación de certificación. Mapear controles aplicables a diseño, test y evidence. Incluir SAST, SCA, secret scan, IaC/container scan, DAST cuando exista runtime, fuzzing y evaluación independiente de penetración antes de producción.

High-risk flows require peer + QA + security review; privacy specialist y qualified human legal review cuando el tratamiento/interpretación lo exija. La autoevaluación de un único agente no es validación independiente.

## 7. Decisiones reservadas

Owner/legal specialist debe aprobar plazos reales de retención, roles, avisos, bases jurídicas cuando no estén claras, transferencias, subencargados, contratos y uso de datos reales. Owner/security approver aprueba riesgo residual alto/crítico. Owner autoriza gasto, mensajes reales, anuncios, borrados y despliegues productivos.
