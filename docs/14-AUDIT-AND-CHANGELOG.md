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
