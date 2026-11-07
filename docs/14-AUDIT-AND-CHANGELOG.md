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
