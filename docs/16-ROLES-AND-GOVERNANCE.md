# 16 — Roles y gobierno del proyecto

## Roles
| Rol | Responsabilidad | Puede aprobar |
|---|---|---|
| Product Owner | visión, alcance, prioridad, aceptación | historias, roadmap |
| Domain/Marketing Specialist | journeys, campañas, lead quality, attribution | lógica marketing |
| Solution Architect | bounded contexts, contratos, ADR | arquitectura |
| Backend Lead | estándares, implementación, revisiones | calidad técnica |
| Meta Integration Engineer | OAuth, scopes, APIs, App Review | compatibilidad Meta |
| Security Lead | threat model, IAM, secrets, pentest | security gate |
| Privacy/Legal | LOPDP, consent, retention, transferencias | privacy gate |
| QA Lead | estrategia, cobertura AC, release evidence | QA gate |
| SRE/DevOps | despliegue, SLO, backups, incident response | operations gate |
| Data/Analytics Engineer | lineage, CAPI, metrics, warehouse | medición |
| Support/Operations | runbooks, tickets, incident comms | cierre operativo |

Una persona puede cubrir varios roles en un equipo pequeño, pero las aprobaciones de alto riesgo deben tener separación de funciones.

## RACI resumido
| Actividad | PO | Architect | Backend | Security | Privacy | QA | SRE |
|---|---|---|---|---|---|---|---|
| Requisitos | A/R | C | C | C | C | C | I |
| ADR | C | A/R | C | C | I | C | C |
| Implementación | I | C | A/R | C | I | C | C |
| Threat model | I | C | R | A | C | C | C |
| Privacy review | I | C | C | C | A/R | I | I |
| QA release | C | C | R | C | C | A | C |
| Production release | A | C | R | C | C | C | R |

R=Responsible, A=Accountable, C=Consulted, I=Informed.

## Gobierno de cambios
- Scope change requiere CR aprobado por PO y revisión de arquitectura/seguridad según impacto.
- Cambio de permisos, datos o finalidad requiere privacy review.
- Cambio de API version requiere contract tests y plan de migración.
- Activación de campañas requiere autorización separada del autor del draft.
- Incidente S0/S1 activa proceso formal y notificación según política/ley.
- Toda excepción tiene owner, expiración y plan de eliminación.

## Cadencia
- Daily: bloqueos, riesgos y tareas activas.
- Weekly: backlog, arquitectura, cambios Meta y riesgos.
- Monthly: API changelog, pricing, scopes, permisos, threat model y access review.
- Release: checklist G0–G8 y firmas registradas.
