# 24 — Validación cruzada e independiente entre agentes

## 1. Principio de independencia
La revisión cruzada busca descubrir errores que el autor no detectó. No basta con pedirle al mismo agente que "revise su trabajo" cambiando el encabezado. El revisor debe recibir los criterios y el diff, y reconstruir su evaluación sin copiar la conclusión del autor.

## 2. Matriz de validación
| Entregable | Autor | Revisor independiente | Evidencia mínima |
|---|---|---|---|
| Requisitos/historias | BA / PM | Product reviewer / domain expert | cobertura, ambigüedades, edge cases |
| Arquitectura/ADR | Architect | segundo architect / senior engineer | alternativas, trade-offs, dependency impact |
| Backend/frontend | Engineer | peer engineer distinto | diff, tests, security, maintainability |
| Meta adapter | Integration engineer | contract reviewer distinto | docs oficiales, scopes, API version, fixtures |
| Seguridad | Implementer + Security | security reviewer distinto | threat coverage, exploit/regression test |
| Privacidad | Privacy analyst | humano competente cuando requerido | purpose, retention, rights, jurisdiction |
| QA report | QA author | test lead/independent reviewer | reproducibility, coverage, skipped/flaky |
| Release | Release coordinator | QA/Security/SRE gates + PO | consolidated evidence |

## 3. Revisión adversarial obligatoria
El revisor recibe: objetivo original, acceptance criteria, alcance permitido, arquitectura relevante, diff/commit, resultados de pruebas y restricciones. Debe buscar activamente:
- criterios incumplidos o interpretados de forma conveniente;
- bugs lógicos, nulls, límites, carreras, duplicados y estados parciales;
- escalamiento de privilegios, IDOR, cross-tenant, SSRF, injection, replay y abuso;
- pérdida/exposición de datos, logs con secretos, retención indebida;
- incompatibilidad API, scope faltante, payload nativo alterado;
- migración no reversible, rollback roto, idempotencia ausente;
- test débil, mock que oculta integración, assertions triviales;
- métricas falsas, errores no observables y runbooks incompletos.

## 4. Resultado normalizado
Cada revisión produce uno:
- `PASS`: no hay hallazgos bloqueantes dentro del alcance revisado; declara límites.
- `PASS_WITH_NOTES`: observaciones no bloqueantes con seguimiento.
- `CHANGES_REQUESTED`: defectos concretos que deben corregirse.
- `BLOCKED`: falta información, acceso o decisión.
- `NOT_REVIEWED`: no se ejecutó revisión; nunca equivale a PASS.

Cada hallazgo incluye ID, severidad, evidencia reproducible, ubicación (path/símbolo/línea/commit), impacto, pasos de reproducción, recomendación y test esperado. No registrar solo opiniones.

## 5. Regla de dos revisiones
- Cambios de bajo riesgo: un peer distinto del autor.
- Cambios de riesgo medio: peer + QA independiente.
- Cambios altos/críticos: peer + QA + security/privacy según superficie; revisión humana cuando la materia lo exija.
- El autor corrige; el revisor original verifica el arreglo. Un tercero resuelve desacuerdo.
- Si solo existe un agente, declarar self-review y no fabricar independencia.

## 6. Integración de comentarios
1. Revisor emite hallazgos antes de sugerir cambios extensos.
2. Autor responde uno por uno: fixed / accepted risk pending owner / disputed with evidence.
3. El owner del dominio resuelve desacuerdos técnicos con evidencia.
4. Excepciones de riesgo requieren CR, responsable, expiración, compensating controls y aprobación humana competente.
5. Tras corregir, repetir tests y revisión del área afectada.
6. Cerrar hallazgo solo con evidencia nueva, no con promesa.

## 7. Evitar falsa diversidad
Dos agentes que comparten el mismo contexto y repiten la misma respuesta no son automáticamente revisores independientes. Reducir sesgo:
- entregar al revisor criterios originales y artefactos, no la autoevaluación;
- pedir que explore contraejemplos y caminos negativos;
- separar autor y reviewer;
- cuando sea viable usar modelos/agentes distintos;
- pedir revisión humana para riesgo alto o juicio especializado.

## 8. Release gate
No recomendar release con hallazgos Critical/High abiertos, pruebas obligatorias fallidas, validación requerida marcada NOT_REVIEWED o evidencia faltante. La aprobación técnica no equivale a aprobación del Product Owner.
