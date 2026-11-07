# 14 — Auditoría, decisiones y control de cambios

## 1. Registro de auditoría del producto
Cada acción relevante: actor, tenant, rol, acción, recurso, purpose, timestamp UTC, correlation ID, resultado, before/after references, source, approval ID y evidencia. Append-only, acceso restringido y retención definida.

## 2. Registro documental de cambios
Formato CR:
- ID, fecha, autor, estado.
- Motivación y problema.
- Evidencia/fuente.
- Alcance y requisitos afectados.
- Alternativas consideradas.
- Impacto en seguridad, privacidad, costes, arquitectura y compatibilidad.
- Tareas/historias afectadas.
- Plan de migración/rollback.
- Aprobadores.
- Pruebas/evidencia y fecha de cierre.

## 3. Registro de bugs
Formato BUG:
- ID, título, estado, severidad y prioridad.
- Entorno, commit, versión API y tenant pseudónimo.
- Precondiciones y pasos reproducibles.
- Resultado esperado/actual.
- Evidencia sin PII/secretos.
- Impacto, alcance y tenants afectados.
- Causa raíz.
- Mitigación y corrección.
- Test de regresión.
- Tareas/historias/CR vinculados.
- Responsable, fecha detectado/cerrado.

## 4. ADR
ADR numerado, status (proposed/accepted/superseded), contexto, decisión, alternativas, consecuencias, seguridad, coste, reversibilidad y fecha de revisión. Nunca borrar ADR reemplazado; marcar superseded y enlazar reemplazo.

## 5. Auditoría inicial
| ID | Evento | Resultado |
|---|---|---|
| AUD-001 | Creación de `environment/local` | creada desde master |
| AUD-002 | Creación de `environment/develop` | creada desde master |
| AUD-003 | Inicio de descomposición documental | en curso |
| AUD-004 | Código fuente | no iniciado, según instrucción |

## 6. Control de cambios preventivos
CR-0001 a CR-0020 están enumerados en el backlog como decisiones/validaciones pendientes. No marcar como aprobados ni cerrados sin evidencia.


## 7. Auditoría del sistema de agentes (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-005 | Contrato universal de agentes | AGENTS.md creado como entrada obligatoria |
| AUD-006 | Compatibilidad de instrucciones | CLAUDE.md, GEMINI.md y .github/copilot-instructions.md creados como puentes al contrato canónico |
| AUD-007 | Operación y handoff | docs/17 define bootstrap, ejecución, memoria y cierre |
| AUD-008 | Grafo de dependencias | docs/18 incorpora DAG de épicas/tareas y reglas de ejecución |
| AUD-009 | Trazabilidad | docs/19 conecta requisitos, historias, tareas, módulos, pruebas y evidencia |
| AUD-010 | Aceptación del producto | docs/20 separa implementación, verificación y aceptación del propietario |
| AUD-011 | Validación de rama | environment/local comparada con master: ahead 31, behind 0; archivos documentales y agent instructions presentes |

Esta auditoría confirma la creación y lectura posterior de los documentos; no certifica implementación de código ni ejecución de pruebas del producto.


## 8. Decisiones y cambios posteriores (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-012 | Respuestas Q-001..Q-010 del propietario | Baseline parcial registrada en PD-001..PD-011 |
| CR-0021 | Confirmación SaaS + plataforma interna EcuApp | Aprobada por propietario |
| CR-0022 | Confirmación greenfield | Aprobada por propietario |
| CR-0023 | Confirmación alcance completo de Meta | Aprobada como alcance objetivo; elegibilidad externa pendiente |
| CR-0024 | Confirmación CRM + inbox omnicanal + panel web | Aprobada por propietario |
| CR-0025 | IA inicial básica y extensible | Aprobada: chatbots y sugerencias; capacidades avanzadas no asumidas |
| ADR-011..017 | Stack/infraestructura recomendadas | Proposed; requieren architecture spike |
| AUD-013 | Documentos 29–31 creados | Verificados por lectura GitHub posterior a escritura |

Esta actualización es especificación documental. No crea evidencia de código, pruebas, Meta App Review, despliegue ni ejecución multiagente.


## 9. Auditoría — decisiones por delegación e investigación (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-014 | Aplicación por delegación de recomendaciones pendientes | PD-012..PD-023 consolidadas en docs/29; se distinguen decisiones de hipótesis y reservas de negocio/legal/coste |
| AUD-015 | Investigación Meta actualizada | docs/32 registra API v27, Marketing API Access Tier, Embedded Signup v4, BSUID, WAAC/PMA y Marketing Messages API sunset |
| AUD-016 | Privacidad y seguridad | LOPDP/SPDP y OWASP ASVS 5.0.0 añadidos como evidencia/control; no se declara conformidad legal o certificación |
| AUD-017 | Arquitectura | ADR-011..020 adoptados como dirección; modular monolith y procesos API/worker; TASK-039 spike pendiente |
| AUD-018 | Operación y métricas | SLO candidatos, four golden signals, p50/p95/p99 y TASK-060/061 documentados; ningún benchmark ejecutado |
| AUD-019 | Backlog/trazabilidad | TASK-053..065 y US-025..027 añadidos; estados propuestos |
| AUD-020 | Política Git/release | environment/local es única rama de escritura de trabajo; master/develop y producción protegidas sin aprobación explícita |

### Evidencia de commits de documentación
- docs/29: 5850351693cd9706bb1aa12d5c71f34838114f10
- docs/32: 3618a1283676dcabb7bc07c3b389928fd2896e6b
- docs/30: d993425881c6f6a6726785992cde697c1e1e14a7
- docs/31: 218b2d4f3f9a07e08bcdb9cbaff9a08b59295337
- docs/05: 8cce820cd1aaf6fd1d9c89b0e479fc0badf2fc81
- docs/09: 2aa13004049d00a27bccdb428a55ba085418cf4e
- docs/AGENTS: d19b6b1b944ee879c7a768088adf0f1dbb00efd7
- docs/00: 13245b83fb1251087f5490500d5e48fa72f3f072
- docs/01: 0b1a32ab68adbfca723ee4cd8f4f08c5bf4333df
- docs/02: f15475231c212d7e87b0afddfee5b3abebffe815
- docs/06: 1af3d97646b844faccddbbfe9a47eb6e38011eb9
- docs/08: f8a5e8baf5cc21e4a1f5c4e7253cfdc9595945a3
- docs/11: e86dc807ed467f4226f1d6192af0d28de50372d9
- docs/12: fa0b4c0fb94cfe9b1ebd49ff254fac859d67e18b
- docs/13: c27aa4c8f783e96b08b1815b5e0825296d261099

Los SHAs anteriores identifican commits que modificaron cada documento; no equivalen a verificación de contenido/código de producto. Los siguientes cambios también deben añadirse aquí cuando se ejecuten.


## 10. Registro adicional de sincronización documental (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-021 | Contrato de agentes y memoria central | AGENTS, docs/00, docs/01 y docs/02 alineados a PD-012..023 |
| AUD-022 | Dominio, privacidad y seguridad | docs/06 y docs/08 incorporan monetización, partners, locale, ASVS y privacidad configurable |
| AUD-023 | QA y SRE | docs/12 y docs/13 incorporan ASVS, WCAG, golden signals, percentiles y SLO candidatos |
| AUD-024 | Backlog de evolución | TASK-053..065 añadidas; estados proposed |
| AUD-025 | Historias | US-025..027 agregadas para partners, billing transparente y developer API |
| AUD-026 | Trazabilidad | docs/19 enlaza PD-012..023, US-025..027 y TASK-053..065 |
| AUD-027 | ADR formales | docs/33 formaliza ADR-011..020; spike pendiente |
| AUD-028 | Índice documental | docs/README incluye docs/32 y docs/33 |

No se han ejecutado builds, tests de producto, benchmarks, Meta account checks ni revisión legal durante estos cambios documentales.


## 11. Final validation checkpoint (AUD-029; 2026-11-06)
- GitHub compare master → environment/local: status ahead, behind_by 0 at validation checkpoint. Exact ahead count changes as documentation commits are appended; re-run compare before merge/release.
- GitHub compare environment/develop → environment/local: status ahead, behind_by 0.
- GitHub compare master → environment/develop: identical at checkpoint.
- Read-after-write fetch confirmed current content for AGENTS.md, META_SERVICES.md, docs/00, 01, 02, 04, 05, 06, 08, 09, 10, 11, 12, 13, 14, 15, 18, 19, 28, 29, 30, 31, 32, 33 and docs/README.
- Marker checks confirmed PD-023, ADR-020, US-027, TASK-065, Meta sunset, ASVS, candidate SLO and index links are present in their expected documents.
- No product source exists in the inspected scope; no product build, unit/integration/E2E test, benchmark, pentest, restore drill, live Meta integration or deployment was executed.
- This is a documentation consistency/readback checkpoint only, not a software release or product acceptance.


## 12. Evidencia de mercado y discovery (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-030 | INEC REEM 2025 y validación ICP | docs/32 registra 1.204.276 empresas (base provisional 2025), desagregación sectorial y límites metodológicos; no se interpreta como TAM |
| AUD-031 | US-028 / TASK-066 | Se creó trabajo de discovery cualitativo y pilotos antes de pricing/forecast; estado proposed |


## 13. Campaign AI research, product rules and reference benchmark (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-032 | Meta Ads AI research | docs/34 registra Andromeda, GEM, Advantage+ Creative, Ads Creative Studio, Ads MCP, Business Agent and Social Technologies MCP with evidence/limits |
| AUD-033 | PD-024 campaign spend guardrail | +20% per action and rolling 24h cumulative cap adopted as owner policy, explicitly not Meta universal rule |
| AUD-034 | Campaign Intelligence design | docs/36 defines two learning planes, Creative Lab, controlled test cells, budget optimizer, CRM/CAPI signals and no-go policies |
| AUD-035 | Reference project benchmark | docs/35 compares Chatwoot, Twilio Node SDK, httpSMS, Android SMS Gateway and OpenWA from representative files |
| AUD-036 | Product requirements/backlog | US-029..032 and TASK-067..080 added as proposed and traced in docs/19 |
| AUD-037 | Formal architecture decisions | ADR-021/022 added to docs/33 for learning plane and budget/official API policy |

No Ads integration, optimizer, AI agent execution, performance benchmark or live campaign change has been implemented/executed by this documentation update.

## 14. Campaign Intelligence and repository benchmark audit (2026-11-06)
| ID | Evento | Resultado |
|---|---|---|
| AUD-038 | Meta Ads AI/Andromeda/GEM research | docs/34 registra evolución Andromeda 2024/2026, GEM, Advantage+, Ads Creative Studio, Meta Ads MCP, Business Agent y Social Technologies MCP |
| AUD-039 | 20% budget rule clarification | PD-024 adoptada como regla interna +20% por operación y rolling 24h; investigación no encontró umbral universal Meta. Diferenciación documentada con Ad Set Budget Sharing |
| AUD-040 | Campaign Intelligence architecture | docs/36 define dos planos de aprendizaje, campaign snapshots, CRM/CAPI outcomes, Creative Lab, test cells, approval, reconciliation y budget guardrails |
| AUD-041 | Open source/provider benchmark | docs/35 documenta Chatwoot, Twilio SDK, httpSMS, Android SMS Gateway y OpenWA, con archivos representativos y decisiones de adopción/no-go |
| AUD-042 | Requirements and backlog | US-029..032 y TASK-067..080 agregados; estados proposed; trazabilidad y DAG actualizados |
| AUD-043 | ADRs campaign/agents | ADR-021/022 documentan Campaign Intelligence y política de escalado/uso exclusivo de APIs oficiales |
| AUD-044 | Documentation read-back | docs/29, docs/32..36, stories, backlog, graph, traceability, index y agent contract releídos; markers PD/US/TASK/ADR presentes |

### Git branch isolation at final validation
- Compare master → environment/local: ahead 161 / behind 0.
- Compare environment/develop → environment/local: ahead 156 / behind 0.
- Compare master → environment/develop: identical, ahead 0 / behind 0.
- No merge, production deployment, live campaign change or code implementation was performed.
- No product test suite, architecture spike, benchmark for WhatsBusiness, Meta account authorization or legal assessment was run.
