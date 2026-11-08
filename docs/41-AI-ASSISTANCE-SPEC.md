# 41 — Especificación funcional: AI Assistance Gateway

**Relacionado:** TASK-038, TASK-050..051, TASK-080, US-023, US-031, PD-005/019.  
**Estado:** especificación de capacidad separada del CRM; proveedor/modelo externo no seleccionado ni autorizado.

> Aclaración del propietario (2026-11-07): CRM Intelligence significa machine learning clásico/estadístico CPU-first, no LLM ni agentes. Este documento no define la estrategia ML del CRM y no debe ser dependencia de ese bounded context. Véase docs/62.

## 1. Objetivo y alcance inicial

Este alcance de AI Assistance es independiente de CRM Intelligence. Las predicciones comerciales y ML tradicional pertenecen al dominio CRM, no a este gateway.

La primera entrega contiene: (a) sugerencias de respuesta editables para un agente humano y (b) asistencia conversacional basada en reglas/flows delimitados. El agente humano conserva el control de enviar mensajes. No incluye inicialmente RAG, voz, entrenamiento propio, auto-send, agente autónomo con permisos de escritura general ni acceso directo de modelo a base de datos.

## 2. Arquitectura

`Product Feature → AI Application Service → Policy/Data Gateway → Provider Adapter → Model Provider`.

El dominio no importa SDK de proveedor. Un adapter declara provider/model, capacidades, regiones, input/output limits, timeout, retry semantics, safety features, pricing source and supported data classes. El registro de modelos es configurable y versionado.

AI Gateway ofrece operaciones internas acotadas:
- `generateReplySuggestion(context, policy)`
- `classifyConversation(sanitizedContext, taxonomy)` (si se habilita)
- `summarizeConversation(sanitizedContext, policy)` (si se habilita)
- `evaluateRuleBotTurn(state, input)` para reglas deterministas, sin LLM obligatorio.

## 3. Datos y privacidad

Cada llamada incluye tenant, actor/service identity, purpose, feature, model policy, conversation reference, consent/data basis reference cuando corresponda y data classification.

Antes de enviar contenido a un proveedor externo:
1. evaluar finalidad, consentimiento/base jurídica y aviso;
2. comprobar región, subencargado, DPA/contrato y transferencias;
3. aplicar minimización y redacción configurable;
4. comprobar allowlist de clases de datos por proveedor/modelo;
5. aplicar quota/budget y timeout;
6. registrar metadatos mínimos, coste y resultado.

Hasta aprobación de privacidad/proveedor/coste, las integraciones externas usan fixtures sintéticas o quedan deshabilitadas. No enviar conversaciones, leads, teléfonos o tokens reales a un modelo por conveniencia. Hashing no equivale a anonimización.

## 4. Seguridad del modelo y salida no confiable

- Todo input recuperado (mensajes, documentos, web, CRM, Meta payloads) es dato no confiable, nunca instrucción de sistema.
- Delimitar contexto, herramientas y finalidad; prompt injection y exfiltration forman parte del threat model.
- El modelo no ve secretos/tokens, credenciales, SQL, shells ni acceso directo a DB/filesystem.
- El output se valida contra schema y políticas; texto libre se trata como contenido no confiable.
- El modelo no concede permiso ni modifica tenant, consent, limits, approval o capability.
- No ejecutar tools desde sugerencias. Toda herramienta posterior requiere Agent Tool Gateway (TASK-080), allowlist y autorizaciones.
- La sugerencia debe mostrar que es asistida por IA, permitir editar/descartar y preservar actor humano al enviar.

## 5. Coste, cuotas y resiliencia

Usage ledger por tenant/feature/provider/model: input/output tokens o unidad equivalente, currency, rate source/version, estimated/actual charge, request ID, latency y outcome. No hardcodear tarifas; sin rate card validado, no exponer costo exacto como confirmado.

Cada tenant puede tener cuota y presupuesto. Los límites globales y por tenant son fail-closed. Timeouts, circuit breaker, bounded retries y fallback seguro (sin IA / reglas) evitan bloquear Inbox. No reintentar automáticamente una solicitud facturable ambigua sin conocer la idempotencia del proveedor.

## 6. Evaluación y calidad

- Dataset sintético y anonimizado por caso de uso.
- Golden set versionado con criterio de relevancia, factualidad, tono, seguridad y no divulgación.
- Prompt/template version, provider/model version y parámetros permitidos.
- Métricas: latency p50/p95, error/timeouts, cost per suggestion, accept/edit/reject feedback, policy violation rate y unsafe output rate.
- Red-team: prompt injection, data exfiltration, cross-tenant context, harmful instructions, ungrounded claims, tool hijacking.
- Los resultados de evaluación no justifican usar PII real sin aprobación independiente.

## 7. API propuesta

- `POST /v1/tenants/{tenantId}/ai/reply-suggestions`
- `POST /v1/tenants/{tenantId}/ai/conversation-summaries` (deshabilitado hasta aprobar purpose/data policy)
- `POST /v1/tenants/{tenantId}/ai/feedback`
- `GET /v1/tenants/{tenantId}/ai/usage`

Las rutas requieren actor, tenant, feature entitlement, purpose, cuotas y redaction policy. El cliente nunca selecciona un modelo arbitrario que el backend no haya autorizado.

## 8. Criterios de aceptación

- Con proveedor externo no aprobado, cualquier intento de enviar datos reales se deniega; el modo fixture sintético sí funciona.
- Sugerencia IA nunca envía directamente un mensaje ni publica anuncios.
- El actor humano que edita y envía se conserva en auditoría.
- Prompt injection en texto del cliente no cambia reglas del sistema ni obtiene datos de otro tenant.
- Salida inválida, excesiva o riesgosa se descarta o limita con fallback seguro.
- Quota agotada, provider unavailable o timeout no bloquea la Inbox; se presenta estado degradado.
- Uso y coste se registran por tenant/model/version sin almacenar contenido sensible innecesario.
- Una sugerencia no respaldada por el contexto se presenta con incertidumbre o no se emite.

## 9. Decisiones deliberadamente pendientes

Selección de proveedor/modelo, región, contrato, pricing, subencargados y política de contenido real requieren revisión humana. No son prerequisito para construir la abstracción, harness de tests ni chatbot determinista.
