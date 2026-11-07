# 02 — Memoria a corto plazo

> Estado operativo mutable. Actualizar al iniciar/finalizar cada sesión o bloque de trabajo.

## Iteración actual
- Iteración: DOC-INIT / preparación documental.
- Rama: `environment/local`.
- Base: `master` en el momento de creación de ramas.
- Código fuente: bloqueado por decisión de alcance.
- Objetivo: transformar la investigación única en un sistema documental auditable, trazable y ejecutable.

## Hecho en esta iteración
- [x] Crear `environment/local`.
- [x] Crear `environment/develop`.
- [ ] Descomponer META_SERVICES.md en documentos temáticos.
- [ ] Definir historias, tareas, dependencias y criterios de aceptación.
- [ ] Definir modelo de bugs y cambios por tarea.
- [ ] Completar revisión de coherencia y enlaces.
- [ ] Aprobar gates documentales G0–G8.

## Próximas acciones
1. Revisar fuentes oficiales y actualizar capacidades/versiones volátiles.
2. Validar la elegibilidad real de la organización/app y permisos.
3. Aprobar modelo de tenant/identity/asset/grant.
4. Aprobar threat model y estrategia de protección de datos.
5. Priorizar backlog por dependencias; no empezar por endpoints aislados.

## Bloqueos externos
- Credenciales y Meta App de desarrollo/producción aún no verificadas en este ciclo.
- Estado de Business Verification/App Review no verificado.
- País, moneda, rate card y contratos deben confirmarse por producto/cuenta.
- No se conocen aún los requisitos de SLA, RPO/RTO ni volumen de tenants.

## Riesgos inmediatos
| ID | Riesgo | Acción |
|---|---|---|
| RSK-001 | META_SERVICES.md contiene datos sujetos a cambio | Revalidar antes de implementación |
| RSK-002 | Permisos/partner eligibility pueden retrasar onboarding | Track de validación temprana |
| RSK-003 | Exceso de abstracción puede borrar semántica nativa | Contratos discriminados y contract tests |
| RSK-004 | Complejidad multi-tenant puede causar fuga | Threat model + pruebas negativas |
| RSK-005 | Publicidad puede generar gasto accidental | Dry-run, approval, budget cap y kill switch |

## Registro de sesión
| Fecha UTC | Trabajo | Resultado | Siguiente |
|---|---|---|---|
| 2026-11-06 | Creación de ramas y diseño del sistema documental | En curso | Completar documentación y verificar |
