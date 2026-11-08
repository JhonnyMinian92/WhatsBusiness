# 62 — Estrategia de inteligencia de negocio para CRM mediante machine learning

**Estado:** decisión de producto confirmada; diseño técnico definido. No significa que el runtime ML esté implementado ni que exista un modelo entrenado.
**Fecha de decisión:** 2026-11-07.  **Ámbito:** bounded context CRM.

## 1. Decisión y límites

El propietario aclaró que CRM con IA significa incorporar machine learning clásico y estadística aplicada al CRM. No significa incorporar LLM, modelos generativos ni agentes de IA.

WhatsBusiness mantendrá CRM como fuente de verdad de contactos, identidades, empresas, leads, oportunidades, pipeline y actividades. Se añadirá CRM Intelligence para convertir datos autorizados y outcomes comerciales en predicciones, clasificaciones, segmentos y recomendaciones cuantificables.

Fuera de CRM Intelligence quedan LLM, generación de texto, RAG, agentes autónomos, planificación agentic, tool calling, proveedores generativos y decisiones irreversibles basadas únicamente en scores. Las reglas de negocio y workflows deterministas pertenecen a Automation. Una predicción informa a una persona o regla autorizada; no concede permisos ni ejecuta acciones externas.

## 2. Casos de uso

| Capacidad | Resultado | Familia de problema |
|---|---|---|
| Lead scoring | probabilidad de conversión y prioridad sugerida | clasificación / ranking |
| Forecast comercial | volumen y valor esperado del pipeline por horizonte | regresión / series temporales |
| Churn | probabilidad y horizonte de abandono/inactividad | clasificación / supervivencia |
| Propensión de compra o respuesta | probabilidad de compra, respuesta o recompra | clasificación |
| Segmentación | grupos comportamentales accionables | clustering |
| Valor de vida (LTV) | estimación/distribución del valor futuro | regresión / modelos probabilísticos |
| Siguiente mejor acción | ranking de tareas o acciones comerciales | ranking supervisado |
| Asignación asistida | compatibilidad lead/equipo/capacidad/éxito | ranking / optimización restringida |
| Detección de anomalías | actividad atípica o cambios bruscos | métodos no supervisados |
| Deduplicación asistida | probabilidad de identidad coincidente | clasificación / entity resolution |

El score de deduplicación genera candidatos; nunca ejecuta merge automático. Se mantiene la decisión auditable y reversible de docs/38.

## 3. Algoritmos y selección

Se elige el algoritmo más simple que alcance la calidad requerida con latencia, coste, memoria y explicabilidad adecuados. XGBoost es candidato prioritario para datos tabulares no lineales, no obligación para cada problema.

- Baselines: regresión lineal/regularizada, regresión logística y Naive Bayes.
- Árboles y boosting: árboles de decisión, Random Forest, gradient boosting y XGBoost.
- Texto ligero, solo cuando se justifique: TF-IDF con regresión logística, Linear SVM o Naive Bayes.
- Clustering: K-Means y métodos jerárquicos; métodos de densidad si datos y benchmark lo justifican.
- Series temporales y supervivencia: baselines estacionales, regresión y modelos time-to-event por horizonte.
- Redes neuronales ligeras: MLP u otras arquitecturas pequeñas únicamente si superan los baselines de forma material y respetan CPU/RAM/latencia.
- Ranking y recomendación: modelos lineales/tree-based; no asumir embeddings generativos.

No se elige un algoritmo por moda. La documentación de XGBoost describe objetivos de regresión, clasificación y ranking, y parámetros como max_depth que afectan complejidad y memoria: https://xgboost.readthedocs.io/en/stable/parameter.html.

Las probabilidades solo se presentan como probabilidades cuando se evalúa calibración sobre datos independientes del entrenamiento: https://scikit-learn.org/stable/modules/calibration.html.

## 4. Arquitectura y límites de dominio

CRM Intelligence forma parte del bounded context CRM. Consume contratos/eventos públicos y no consulta tablas privadas de otros contextos. Debe seguir docs/48: SOLID, cohesión, dependencias hacia abstracciones, reutilización y boundaries acíclicos.

Submódulos previstos tras completar dependencias:
- domain: problem definitions, feature definitions versionadas, prediction value objects y elegibilidad.
- application: scoring, clasificación, forecast, segmentación y publicación de recomendaciones.
- ports: Predictor, FeatureSnapshotRepository, ModelRegistry, ModelArtifactStore, ModelEvaluator y Clock.
- infrastructure: adapters de datos, registry, artefactos y runtime de inferencia.

Entrenamiento offline y reproducible; nunca en el hilo de la API. Serving desacoplado detrás de ports. Reusar PostgreSQL/RLS, outbox/RabbitMQ, worker runtime y observabilidad existentes; no crear un microservicio por algoritmo.

Python con scikit-learn/XGBoost, ONNX/runtime nativo o proceso Python interno son alternativas que se comparan con benchmark reproducible antes de fijar dependencias.

## 5. Datos, features y aislamiento

- Features desde eventos y outcomes verificables: lead creado, asignado, cualificado, descartado o convertido; oportunidad ganada/perdida; importes, tiempos e interacciones con provenance.
- Cada feature define owner, propósito, tipo, unidad, ventana, disponibilidad, transformación, versión, procedencia, calidad y retención.
- Usar event-time y snapshots reproducibles. Prohibir data leakage: una predicción en T no puede usar outcomes posteriores a T.
- Separar train/validation/test temporalmente cuando el fenómeno evoluciona; evaluar por tenant/segmento/canal cuando exista muestra suficiente.
- Conservar definición de label, ventana de observación, censoring, exclusiones y versión de consulta.
- Datasets, features, snapshots, scores y artefactos son tenant-scoped, autorizados y sujetos a RLS/retención. No entrenar entre tenants por defecto.
- Un modelo compartido entre tenants exige revisión explícita de privacidad/legitimidad, base legal, minimización, riesgo de reidentificación y controles de participación.
- Mensajes/contenidos se excluyen por defecto como features salvo caso aprobado, purpose/consent válido y minimización.

## 6. Contrato de salida de inferencia

Cada predicción devuelve, según el problema: tenantId, subjectId, predictionType, modelId/modelVersion, featureSchemaVersion, score/clase/ranking, predictedAt, horizonte, expiración y trazabilidad. Incluye probabilidad calibrada o intervalos solo si el modelo lo soporta, reasonCodes no sensibles y estado de elegibilidad.

Los scores son señales versionadas y temporales, no verdad ni atributos permanentes. La UI muestra fecha, modelo, horizonte, evidencia y advertencia de baja confianza. Timeout, feature stale, modelo inexistente o error producen fallback explícito; CRM funciona sin ML.

## 7. Evaluación

| Problema | Métricas candidatas |
|---|---|
| Clasificación | PR-AUC, precision, recall, F1, ROC-AUC si aporta, log-loss, Brier y calibración |
| Regresión / forecast | MAE, RMSE, MASE/sMAPE cuando aplique y cobertura de intervalos |
| Ranking | NDCG@k, MAP/precision@k y utilidad comercial observada |
| Clustering | estabilidad, separación, interpretabilidad y utilidad del segmento |
| Negocio | lift frente a baseline, conversión incremental con diseño causal, calidad de lead, revenue/margen y coste por decisión |

Cada modelo candidato se compara con baseline no-ML en el mismo split. Medir coste de falsos positivos/negativos, umbrales, muestra mínima, calibración, leakage, sesgo y cohortes. Clustering no se evalúa con accuracy si no existen labels.

## 8. MLOps y gobierno

El registro versiona caso de uso/owner, tenant scope, algoritmo/parámetros, feature schema, labels, dataset snapshot, corte temporal, código/commit, dependencias, métricas, calibración, fairness, coste/latencia, checksum, artefacto, aprobación y expiración.

Estados: draft, trained, validated, approved, shadow, active, deprecated y revoked. Solo versión aprobada sirve predicciones productivas. Promoción con shadow/canary, rollback y vigencia acotada.

Monitorizar feature freshness, latencia, errores, CPU/RAM, distribución de predicciones, drift y rendimiento cuando lleguen labels. Detectar training-serving skew y feedback loops. Desactivar/degradar un modelo sin detener CRM; fallback determinista o sin predicción.

Google Production ML Systems destaca los riesgos de training-serving skew, drift y feedback loops: https://developers.google.com/machine-learning/crash-course/production-ml-systems/questions.

## 9. Rendimiento y coste

- CPU-first por defecto; presupuesto explícito de latencia, memoria, CPU y tamaño de artefacto.
- Modelos compactos; batch scoring para volúmenes altos y scoring síncrono solo donde el UX lo necesite.
- Cache de score tenant-scoped con key por sujeto/modelo/features y TTL ligado a frescura.
- Concurrencia y colas acotadas para training y batch inference; nunca entrenar en proceso HTTP.
- Medir carga cold/warm, p50/p95/p99, throughput, CPU/RAM y fallback en hardware objetivo.
- Evitar GPU y redes profundas salvo evidencia cuantificada suficiente.

## 10. Entrega técnica

1. Completar CRM transaccional e integración de eventos/outcomes (TASK-035, TASK-042..044, TASK-053 y dependencias).
2. Definir labels/outcomes por caso, contratos de datos, feature provenance y retención.
3. Construir datasets/feature snapshots reproducibles y baselines no-ML.
4. Entrenar y comparar modelos ligeros (XGBoost cuando aplique); validar calibración, explainability, fairness y recursos.
5. Añadir registry/versionado/artefactos y promoción/revocación.
6. Integrar inference ports y eventos con aislamiento tenant, fallback y reason codes.
7. Añadir monitoreo de drift, backtesting, rollback y dashboards de negocio.

No se marca nada terminado por notebooks, un artefacto local o una métrica aislada. La aceptación exige pruebas reproducibles, benchmark y revisión de seguridad/privacidad.

## 11. Estado actual

Esta especificación documenta la dirección del producto. No existe todavía pipeline de entrenamiento, modelo CRM entrenado, registry, serving ni endpoint de predicción implementado en el repositorio.