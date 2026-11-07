# 36 — Campaign Intelligence, Creative Lab y escalado controlado

**Estado:** requisito de producto adoptado por delegación en PD-024.  
**Objetivo:** que las campañas aprendan de sus resultados comerciales, creen nuevas hipótesis/creativos y escalen con control sin sacrificar campañas ganadoras ni sobrepasar presupuesto autorizado.

## 1. Qué significa "campañas que aprenden de sí mismas"

No significa que un LLM tenga permiso para editar anuncios libremente. Son dos bucles distintos:

### Bucle A — aprendizaje de entrega de Meta
Meta recibe la campaña elegible, objetivo, audiencia, budget/bid, creatives y eventos. Sus modelos propietarios (Andromeda/GEM y sistemas relacionados) recuperan, rankean y entregan anuncios según sus señales internas. WhatsBusiness no controla su ranking ni conoce sus pesos/modelos.

### Bucle B — aprendizaje de negocio de WhatsBusiness
WhatsBusiness recopila resultados de:
- Marketing API Insights (spend, impressions, reach, clicks, frequency, results, CPA/ROAS reportado y breakdowns disponibles).
- Pixel/CAPI y datasets autorizados.
- Lead Ads y lifecycle real del CRM.
- Estados de oportunidad, venta, ingreso neto, descuento, margen, devolución/cancelación y calidad de atención cuando el negocio tenga esas fuentes.
- Resultados de Creative Lab/experiments, feedback humano y políticas de marca.

Con esos datos construye hipótesis, recomendaciones y nuevas variantes. El sistema debe distinguir correlación, atribución reportada por Meta e incremento causal medido.

## 2. Modelo de dominio

### CampaignPlan
- tenant, ad_account, objective, campaign_type, funnel_stage, business_goal.
- conversion_event / optimization_event / conversion_location.
- customer_lifecycle_goal: acquisition, retargeting, retention o reactivation.
- budget_total, budget_period, currency, account_spend_limit, authorized_by.
- business_target: max CPA, min ROAS, minimum contribution margin, quality threshold.
- audience strategy y exclusiones explícitas.
- status, policy snapshot, API version, creation source (human/agent/template).

### CampaignSnapshot
Snapshot inmutable de la estructura Meta: campaign/adset/ad/creative/targeting/budget/status/pacing/attribution settings + captured_at + API version + remote ids. Guardar diff de cada cambio.

### CreativeAsset / CreativeVariant
- Asset original, source, owner, license/usage rights, consent, data classification.
- Concept, offer, product/SKU, customer pain, value proposition, persona/segment hypothesis, hook, format, placement, CTA, landing page, version.
- Text/image/video/audio components, subtitles, aspect ratio, safe zones, crop rules, brand kit version, claim evidence and policy checks.
- Generation provenance: human/AI/provider/model/prompt version, input refs and approval.
- Similarity cluster to avoid near-duplicate spam; semantic and visual diversity score (internal metric, not Meta Andromeda score).
- State: draft → generated → brand_review → policy_review → preview_ready → experiment_ready → approved → active → fatigued/retired.

### Experiment / TestCell
- Hypothesis, one primary variable, control/variant IDs, audience overlap check, randomization or Meta A/B test references, start/end, budget, sample target, stopping criteria, primary KPI and guardrails.
- Do not mix multiple simultaneous changes if the effect cannot be attributed.
- Keep winner stable; new creatives go into a distinct test cell or campaign/adset with explicit experiment budget. Avoid adding new ads into a mature/winning ad set by default because edit/learning effects need to be considered.
- Never compare raw results without dates, delivery, audience, placement, objective and attribution context.

### OptimizationRecommendation
- proposed action, reason, supporting window, evidence coverage, confidence/uncertainty, expected upside/risk, policy checks, forecast not guarantee.
- State: draft → simulated → awaiting_approval → approved → scheduled → applied → verified / failed / rolled_back / expired.
- Source: Meta recommendation, internal rule, analyst, or AI.
- Store pre/post campaign snapshot and decision outcome for future evaluation.

### BudgetChangeGuardrail
- account/campaign/adset reference, currency, previous budget, proposed budget, percent_change, rolling_24h baseline, cap, actor, approval_id, idempotency key, reason, execution result and reconciliation status.

## 3. Política del 20% (PD-024)

WhatsBusiness aplica este guardrail obligatorio:
- Ningún aumento automático individual puede superar +20%.
- El incremento acumulado automático no puede superar +20% sobre el presupuesto de referencia al inicio de una ventana móvil de 24 horas.
- El control se aplica por objeto presupuestario (campaign/adset) y account spend cap; no basta con revisar cada acción por separado.
- Se calcula con moneda/currency exacta y unidad del objeto. No comparar presupuestos con divisas distintas.
- Reducciones/pause no consumen el presupuesto de incremento; toda reactivación se reevalúa.
- La referencia de ventana no se reinicia para evadir el cap mediante múltiples tareas, agentes, usuarios o API keys.
- Una operación que supere cap se rechaza/pausa y se registra; no se divide automáticamente en varios cambios para evadir el límite.
- Se exige revalidar estado, permisos, budget, ad account spend limit y delivery antes de aplicar.
- El owner puede imponer límites menores por tenant/account/campaign. Ninguna configuración de tenant puede elevarlo por encima de 20%.
- Cambiar el límite requiere nueva autorización del propietario de plataforma, no una instrucción de agente IA.

**Aclaración:** el 20% es una política conservadora de WhatsBusiness solicitada por el propietario. Las fuentes de Meta revisadas no establecen un límite universal de aumento de presupuesto del 20% ni garantizan que ese cambio preserve el learning. La función Meta Ad Set Budget Sharing que usa 20% es otra capacidad (redistribuir parte del presupuesto diario entre ad sets), no un límite genérico de aumento.

## 4. Reglas para preservar aprendizaje

1. Respetar la unidad de aprendizaje: Meta documenta aprendizaje a nivel ad set.
2. Monitorizar Delivery status (Learning, Learning Limited, Active/Stable, etc.) y la disponibilidad real de ese estado en reporting/API.
3. Umbral orientativo de referencia: alrededor de 50 eventos de optimización en 7 días cuando corresponda al objetivo y al tipo de campaña documentado por Meta. No inventar eventos ni reutilizar el umbral fuera de contexto.
4. Evitar exceso de ad sets/audiences solapados, que fragmentan eventos y pueden canibalizar la entrega.
5. No escalar si el ad set está en Learning/Learning Limited, evento de conversión es insuficiente o hay cambios recientes aún sin evaluación.
6. Los cambios de creative, targeting, optimization event, bid strategy o pausa prolongada pueden ser significativos; el sistema obtiene una lista vigente de significant edits por versión/producto y no asume que todas las operaciones son inocuas.
7. No variar presupuesto, audience, bid, event y creative al mismo tiempo. Si varias correcciones son necesarias, preparar un único change set, documentar que no será posible atribuir cada efecto, y pedir aprobación.
8. No reescribir o pausar un ganador solo porque un nuevo creative promete mejor. Comparar con test controlado y KPI downstream.
9. No aplicar reglas de scalado a objetivos con poco volumen de resultados sin un modelo de confianza, mínimo de gasto, ventana, calidad y margen definidos para esa industria/tenant.

## 5. Creative Lab: cómo generar anuncios nuevos que puedan competir por entrega

El motor creativo debe generar diversidad real, no variaciones cosméticas:
- Propuesta de valor/ángulo: ahorro, rapidez, confianza, garantía, conveniencia, prueba social, comparación, problema/solución, caso real.
- Hook: primera frase/segundos, pregunta, demostración, resultado, objeción.
- Format: imagen, carrusel, video vertical, demo, UGC/creator, catálogo, testimonial, explainer.
- Visual: escena, entorno, producto, persona con autorización, encuadre, color y composition.
- Offer: bundle, descuento autorizado, envío, demo, financiación (claims aprobados).
- CTA, landing, segment/lifecycle y creative format.
Cada variante conserva qué variable se modificó y qué hipótesis se intenta falsar. Se prohíbe crear lotes de anuncios duplicados o generar claims de precio/beneficio que no tengan evidencia.

### Flujo de creativo IA
1. Crear brief e hipótesis usando producto/CRM/insights, no datos privados sin purpose.
2. Generar texto/storyboard/assets usando proveedor autorizado.
3. Validar trademark, claims, price, prohibited categories, brand kit y derechos de imagen/voz.
4. Comprobar políticas de anuncio y consentimiento de material de terceros.
5. Crear draft/paused ad con API oficial cuando la feature y scope estén habilitados.
6. Preview por placement/creative feature; validar render, textos, crop, audio y destino.
7. Aprobación humana.
8. Lanzar en test cell con presupuesto reservado.
9. Evaluar outcomes, no solo CTR.
10. Si vence el test, guardar reporte, promover/retirar según regla y generar siguiente hipótesis.

La muestra de Meta AI Creative Enhancer ilustra un patrón: Advantage+ Creative opt-in/out + Ads API + Ad Previews + Ads Performance Recommendations; si se opta por features AI en el ejemplo, crear el ad PAUSED, revisar preview y después activar. Se valida la disponibilidad normativa por API antes de codificar.

## 6. Motor de optimización por etapas

### Stage 0 — Ingesta y calidad de señal
- Sync de spend/insights con checkpoints, async reports si aplica y rate limits.
- Verificar currency, attribution setting, time range, time zone, breakdowns, delivery status y data freshness.
- Ingesta de CRM outcomes/CAPI con event IDs, dedupe, status, source/provenance y permissions.
- Rechazar dato duplicado, atrasado, inconsistente o sin denominador de KPI; separar estimated y reported.

### Stage 1 — Diagnóstico
- detectar creative fatigue/recommendations Meta cuando disponibles y elegibles;
- low delivery, no spend, high CPA, falling conversion rate, high frequency, low quality leads, event match/diagnostic errors, account restrictions, budget pacing, rejected ads;
- detectar audience/placement overlap y fragmentation;
- comprobar margin, revenue and qualified lead downstream.

### Stage 2 — Hypothesis generation
- AI puede proponer nuevas ideas/creatives, segment/lifecycle hypotheses, landing improvements y budget recommendations.
- La recomendación contiene supporting data, uncertainty, estimated cost, risks, control group and rollback.
- El LLM no recibe access token ni API directo.

### Stage 3 — Simulation and approval
- Simular estructura/amounts/permissions/capability/consent/spend cap.
- Guardrail +20% se aplica aquí y revalida justo antes del external write.
- Presupuestos, audience, creative, targeting, placements o publication requieren aprobación conforme al risk matrix.

### Stage 4 — Controlled execution
- Ejecutar draft → preview → approve → publish.
- Cada POST ambiguo usa reconciliation, no retry ciego.
- Idempotency/reconciliation; state machine con queued/submitted/accepted/unknown/rejected/active/paused.
- Persistir Meta request IDs, API version, correlation IDs, actor and approval.
- La plataforma registra si el cambio disparó learning, si el estado no está disponible, o si se necesita verificar manualmente.

### Stage 5 — Evaluation and next cycle
- Evaluar con ventanas coherentes, suficientes datos y conversion lag.
- Comparar test vs control y post-change vs baseline ajustando por spend, day-of-week, objective and attribution.
- Seleccionar nueva hipótesis y seguir. El sistema nunca asume que una mejora aparente se generaliza.
- Si el performance empeora, pause/rollback solo si está preautorizado; de lo contrario, recomendar y escalar.

## 7. Modelo de KPI y métricas

Separar tres grupos:

### Delivery / Meta reported
Spend, impressions, reach, frequency, CPM, CTR, CPC, landing page views, leads, purchases, reported value, CPA, ROAS, result quality/delivery, breakdown by creative/placement/audience where available.

### Business / CRM outcomes
Valid lead %, qualified lead %, contact rate, appointment booked, show rate, opportunity rate, win rate, revenue, net revenue after cancellations/refunds, contribution margin, time-to-first-response, customer retention/repeat purchase.

### Guardrails
Daily/weekly/monthly spend ceilings, budget change cap, cost per qualified lead cap, minimum margin, max frequency/creative fatigue policy, opt-out/block/report rates, rejected ad counts, account health, stock/fulfillment availability, landing page uptime, CRM data freshness and privacy/consent.

ROAS from Meta is not necessarily the incremental return or gross margin. Campaign evaluation must show attribution model/window and distinguish reported attribution from measured lift.

## 8. Data and architecture integration

- Meta Ads adapters own Campaign/AdSet/Ad/AdCreative/Insights/Recommendations/Preview API contracts by API version.
- Campaign Intelligence owns campaign plans, snapshots, experiments, recommendations, budget guardrails and learning history.
- Creative Lab owns assets, variants, provenance, brand/policy review, preview and approvals.
- CRM owns leads/opportunities/orders/revenue outcomes; Campaign Intelligence consumes events, not private CRM tables.
- CAPI Gateway owns event mapping, consent, event_id/dedupe, retries, diagnostics and source provenance.
- Policy & Approval controls every external write; no AI agent can call ads API directly.
- Billing/Usage records AI and external Meta costs separately.
- Event bus carries CampaignSnapshotCaptured, InsightWindowClosed, ConversionQualified, CreativeGenerated, ExperimentStarted/Ended, RecommendationProposed/Approved/Rejected, BudgetChangeApplied/Reconciled, DeliveryStateChanged, CreativeFatigueDetected.

## 9. Interoperability with Meta AI and agents

- Meta Ads MCP can prepare drafts, creatives/previews and performance analysis where Meta permits; WhatsBusiness may offer its own MCP/tool gateway.
- Both paths go through the same policy/approval, spend guardrails and audit.
- Meta Business Agent Platform can serve customers through messaging. WhatsBusiness remains system of record for tenant CRM, approvals, assignment, billing and analytics, when the customer uses our product.
- A conversation must have an explicit active responder owner/lease to prevent Meta Business Agent, WhatsBusiness bot, human agent and OpenWA-like integrations replying simultaneously.
- If Meta's agent takes over, update ownership, disable competing bot and record handoff reason/provider.
- Agentic business actions (refund, purchase/order, booking, budget, publish, delete, permissions) require purpose-bound tool schemas, least privilege, authorization at execution and approval thresholds.

## 10. Stop conditions and no-go

Automatically stop further scaling/creative promotion and raise an incident/recommendation when:
- account/ad/asset has policy restriction, rejection, permission loss or billing risk;
- spend anomaly or cap threshold reached;
- conversion signal becomes stale/duplicate/mismatched;
- lead quality or margin falls beyond tenant threshold;
- opt-outs/complaints/negative feedback exceed configured limits;
- platform API version sunset or endpoint behavior is unknown;
- learning state is unstable/insufficient and action would mutate a live winner;
- Creative generation has no verifiable rights/claim support;
- budget change would exceed +20% rolling 24-hour guardrail.

No budget can be increased outside the platform cap merely because an agent has permission to call the API. Human approval never overrides Meta policy, consent, asset scopes or account restrictions.

