# Diccionario de métricas de piloto — US-028 / TASK-066

**Tipo:** especificación de investigación/medición; no contrato API, AsyncAPI ni implementación runtime.  
**Versión:** 1.0 — 8 de noviembre de 2026.

## Unidad y granularidad

- Unidad principal: tenant/empresa participante, pseudonimizado.
- Granularidad operativa: evento mínimo; publicación del informe: tenant-semana y cohorte-semana.
- Guardar timestamp UTC internamente y reportar con zona horaria de negocio del tenant. No agregar empresas diferentes como si fueran una sola cuenta.
- Mantener dimensiones segment, cohort, channel, week_start, pilot_code y data_quality_status.
- Separar métricas reportadas por Meta, métricas propias del producto y outcomes confirmados por el negocio.

## Eventos de medición propuestos

| Evento de investigación | Cuándo se registra | Propiedades mínimas agregables |
|---|---|---|
| pilot.kickoff.completed | Se confirma baseline, objetivo y responsable | pilot_code, segment, cohort, baseline_version |
| pilot.tenant.activated | Se cumple la definición de activación | pilot_code, activated_at, activation_path |
| pilot.channel.connected | Canal autorizado queda conectado y usable en el entorno aprobado | channel, capability_snapshot_ref, connected_at |
| pilot.seat.invited | Se invita un usuario | seat_role_category, invited_at |
| pilot.seat.activated | Usuario usa una función operativa por primera vez | seat_role_category, activated_at |
| pilot.workflow.first_value | Primer resultado del workflow acordado, confirmado por el negocio | workflow_type, outcome_type, elapsed_minutes |
| pilot.conversation.handled | Conversación/solicitud procesada en el entorno autorizado | channel, status, response_latency_bucket |
| pilot.lead.qualified | Negocio confirma que lead cumple su criterio definido | source_channel, qualification_rule_version |
| pilot.followup.completed | Se completa seguimiento requerido | followup_type, elapsed_hours_bucket |
| pilot.outcome.recorded | Negocio confirma cita, venta u otro resultado | outcome_type, confirmation_source |
| pilot.weekly.snapshot | Cierre agregado de semana | active_seats, eligible_seats, conversations_count, qualified_leads_count, outcomes_count |
| pilot.retention.assessed | Se evalúa la retención de cohorte | cohort_week, retained, definition_version |
| pilot.safety.stop | Se activa un criterio de parada | stop_category, severity, opened_at |

Estos nombres son una propuesta para instrumentación futura. Antes de publicarlos como eventos de producto requieren contrato, owner, clasificación de datos, schema, versionado, idempotencia, outbox/consumers y gates de arquitectura correspondientes.

## Métricas y fórmulas

| Métrica | Fórmula | Cautela |
|---|---|---|
| Activación | tenants activados / tenants que iniciaron onboarding en cohorte | Definir ventana de activación antes del piloto |
| Time-to-value | primer pilot.workflow.first_value − kickoff | Reportar mediana y p90; describir tipo de valor |
| Seat adoption | seats activos en periodo / seats habilitados al inicio del periodo | Mostrar numerador y denominador |
| Channel mix | conversaciones/solicitudes por canal / total medido | Solo incluye canales con medición completa |
| First response | tiempo desde entrada válida hasta primera respuesta humana o automatizada permitida | Separar autorespuesta de respuesta resolutiva |
| Follow-up completion | seguimientos completados dentro de plazo / seguimientos que vencían | Definir plazo por workflow |
| Lead qualification | leads calificados / leads evaluados | Regla de calificación versionada por tenant/segmento |
| Outcome conversion | outcomes confirmados / leads elegibles de la misma cohorte | No mezclar ventanas ni atribución Meta |
| Retención W4/W8 | tenants activos con workflow repetido en semana 4/8 / tenants activados de cohorte | Reportar bajas, pausas y datos faltantes |
| Safety | incidentes, opt-outs, permisos revocados, errores de aislamiento | No compensar fallos de seguridad con crecimiento |

## Baseline, comparación y lectura

1. Capturar una baseline del proceso anterior con ventana comparable, volumen por rangos y definiciones acordadas.
2. Definir métrica primaria y guardrails antes del piloto; no elegir la métrica después de ver resultados.
3. Utilizar cohortes y ventanas consistentes. Si no existe grupo de comparación o asignación adecuada, hablar de asociación/atribución, no causalidad.
4. Reportar datos faltantes, canales no conectados, días sin operación, estacionalidad y tamaño real de muestra.
5. Comparar empresas dentro de segmento y etapa similar; no promediar directamente agencias multi-tenant con negocios individuales.
6. Presentar distribución y denominadores, no solo promedios.

## Privacidad y seguridad

- No enviar contenido de mensajes, nombres, teléfonos, emails, IDs de cliente ni datos sensibles a una herramienta analítica de research.
- No incorporar en el CSV del repositorio importes, márgenes ni facturas de empresas. Mantener datos financieros sensibles en sistema autorizado; publicar solo agregados aprobados.
- Usar pseudónimos de tenant; separar y proteger la tabla de reidentificación.
- No mezclar métricas de Meta con métricas del producto ni outcomes declarados por negocio.
- Cualquier tratamiento de datos personales, integración con activos reales o piloto productivo permanece condicionado a revisión legal/privacidad/seguridad y autorización del propietario.

## Criterios de parada

Parar el piloto y escalar cuando ocurra acceso cruzado entre tenants, exposición de PII/secretos, envío/publicación no autorizados, permiso revocado, opt-out ignorado, pérdida de integridad, duplicación peligrosa o falta de base jurídica/consentimiento. Seguridad y derechos prevalecen sobre metas de activación o conversión.