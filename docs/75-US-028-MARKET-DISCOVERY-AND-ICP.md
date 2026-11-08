# US-028 — Investigación de mercado, ICP y evidencia de disposición a pagar

**Historia:** US-028  
**Tarea:** TASK-066 — Validación de ICP y product-market evidence  
**Épica:** EP-13 — Validación de mercado y ajuste de producto  
**Fecha de corte documental:** 8 de noviembre de 2026  
**Rama:** environment/local  
**Estado propuesto:** in_progress — investigación secundaria estructurada; trabajo de campo y pilotos pendientes  
**Naturaleza:** entregable de discovery; no crea endpoints ni habilita operaciones productivas.

## 1. Resumen ejecutivo

La decisión PD-012 mantiene como hipótesis de entrada a PYMES ecuatorianas de servicios y comercio, con agencias como segmento secundario/canal. La evidencia oficial disponible respalda que esos sectores tienen un peso relevante en el registro empresarial; no demuestra que esas empresas usen WhatsApp/Meta para vender, sufran un problema que WhatsBusiness resuelva, sean elegibles para las APIs oficiales ni estén dispuestas a pagar.

Este paquete transforma TASK-066 en un protocolo ejecutable: baseline estadística con advertencias, ICP candidato falsable, hipótesis y criterios de refutación, guía de entrevistas, registro anonimizado, taxonomía de hallazgos, modelo de mercado sin cifras inventadas y plan de métricas para pilotos.

**Conclusión actual:** conservar PD-012 como hipótesis prioritaria para investigación; no declarar product-market fit, ICP validado, TAM/SAM/SOM cuantificado, precio aprobado ni forecast comercial. No hay entrevistas, pilotos ni datos de disposición a pagar registrados en el repositorio.

## 2. Estado de los criterios de aceptación

| Criterio | Estado real al corte | Entregable / evidencia | Lo que falta |
|---|---|---|---|
| AC-028-01 — baseline INEC | **Documentado** | REEM 2024 definitivo y 2025 provisional, sectores y advertencias en docs/32 | Revalidar al actualizar el estudio y conservar publicación/metodología exacta |
| AC-028-02 — entrevistas por segmento | **Preparado; no ejecutado** | Guía y plan de muestreo exploratorio en research/us-028 | Reclutar y entrevistar empresas reales de servicios, comercio y agencias |
| AC-028-03 — codificación sin PII | **Preparado; sin hallazgos de campo** | Registro y plantilla de codificación anonimizados | Poblar con evidencia obtenida con consentimiento y revisar contradicciones |
| AC-028-04 — pilotos instrumentados | **Diseño definido; no ejecutado** | Diccionario de métricas/eventos de investigación y plantilla semanal | Resolver gates de datos/seguridad, autorizar piloto y recopilar cohortes |
| AC-028-05 — TAM/SAM/SOM | **Método definido; no cuantificado** | Fórmulas y filtros de elegibilidad de la sección 7 | Obtener conteos deduplicados y tasas observadas de elegibilidad, alcance y conversión |
| AC-028-06 — no fijar precio con evidencia insuficiente | **Guardrail documentado** | No se deriva precio ni forecast de REEM o entrevistas cualitativas | Evaluar unit economics y evidencia de compra/pago antes de aprobar pricing |

TASK-066 permanece **in_progress**. La preparación documental no equivale a ejecutar entrevistas, pilotos o validación independiente.

## 3. Evidencia secundaria: tamaño y composición del universo

### 3.1 REEM 2025

La publicación del Registro Estadístico de Empresas del INEC presenta 1.204.276 empresas en la base provisional 2025 y 1.196.545 en la base definitiva 2024. Para 2025 provisional reporta aproximadamente 645,8 mil empresas de servicios y 388,9 mil de comercio; en conjunto son 1.034,7 mil, cerca del 85,9% del total provisional.

| Indicador | 2024 definitivo | 2025 provisional |
|---|---:|---:|
| Total de empresas del registro | 1.196.545 | 1.204.276 |
| Servicios | 625,8 mil | 645,8 mil |
| Comercio | 406,9 mil | 388,9 mil |
| Servicios + comercio | 1.032,7 mil | 1.034,7 mil |
| Participación conjunta aproximada | 86,3% | 85,9% |

**Advertencias obligatorias:**

1. La observación 2025 es provisional; no presentarla como base definitiva ni mezclarla silenciosamente con 2024.
2. La conformación 2025 combina registros de distintos años: ventas, RIMPE y comercio exterior de 2024, junto con plazas de empleo IESS de 2025. Las variables de ventas/tamaño tienen rezago.
3. La publicación explica que el cambio de cobertura asociado al RIMPE desde 2022 afecta la lectura de la evolución. No interpretar la variación del registro como creación neta equivalente de empresas.
4. Aproximadamente 50,2% de las unidades de la base provisional corresponde a un grupo RIMPE 2024 sin ventas ni plazas registradas en IESS en la clasificación descrita por INEC. Este dato refuerza que el total no equivale a negocios con operación digital, volumen comercial o capacidad de pago demostrados.
5. El REEM contiene unidades empresariales y establecimientos; el modelo debe fijar como unidad objetivo la empresa/organización compradora y deduplicar establecimientos, sucursales y grupos económicos.

**Interpretación permitida:** servicios y comercio son un universo sectorial razonable para priorizar el discovery.

**Interpretación prohibida:** llamar TAM a 1.034.700 empresas, multiplicar esa cifra por un precio hipotético, o sumar agencias como un universo adicional sin deduplicarlas de los servicios.

Fuente y metodología: ver MKT-OBS-001 en docs/32 y la publicación oficial INEC: https://www.ecuadorencifras.gob.ec/directoriodeempresas/

### 3.2 Tecnología y uso de canales: límites de la evidencia disponible

- Los indicadores TIC de hogares/personas no se utilizan como tasa de adopción digital de empresas.
- La página de INEC “TIC — Empresas” accesible en el corte publica resultados de Encuestas Industriales 2015. Es demasiado antigua para representar el comportamiento empresarial de 2026; solo puede servir como antecedente histórico.
- La ENESEM 2024 ofrece un módulo TIC empresarial y un cuestionario que pregunta por correo, teléfono, aplicaciones, call center, servicios de mensajería (ejemplos: SMS y WhatsApp) y redes sociales. Sin embargo, el universo divulgado corresponde a empresas grandes y medianas; no se extrapola a micro y pequeñas.
- El diccionario oficial ENESEM 2024 incluye variables de ventas/compras por internet y obstáculos relacionados con logística, pagos, seguridad y desconocimiento tecnológico. Son buenas dimensiones para investigar, pero no una medida directa del uso de WhatsBusiness ni de la disposición a pagar de las PYMES objetivo.

En consecuencia, la intensidad de uso comercial de WhatsApp, Instagram y Messenger, el número de agentes, el volumen de leads, la pérdida por demora, la elegibilidad Meta y el gasto actual en software deben levantarse directamente en el trabajo de campo.

Fuentes y alcance: MKT-OBS-003/004 en docs/32.

## 4. ICP candidato y límites

### 4.1 ICP primario — hipótesis, no validación

PYME ecuatoriana de comercio o servicios que:

- recibe consultas, solicitudes, reservas o leads de forma recurrente por WhatsApp y/o superficies Meta;
- necesita que más de una persona atienda, derive o dé seguimiento, o necesita una trazabilidad compartida;
- pierde tiempo u oportunidades por conversaciones dispersas, respuestas tardías, seguimiento manual, duplicidad de contactos o falta de visibilidad;
- puede describir un flujo real desde consulta hasta lead calificado, cita, venta o servicio completado;
- tiene un decisor identificable y una ruta viable de adopción de los productos oficiales Meta que realmente necesite;
- puede medir una mejora operacional o comercial sin recopilar más datos personales de los necesarios.

La unidad de calificación es la empresa, no cada número, sucursal, página o cuenta publicitaria.

### 4.2 Segmento secundario — agencias

Agencias que administran comunicación o marketing de varias empresas y necesitan operar con separación explícita por cliente, permisos delegados, trazabilidad y revocación. La agencia se trata como canal/segmento y no se suma al conteo sectorial sin comprobar si ya está incluida en servicios.

### 4.3 Casos que pueden quedar fuera

- negocio unipersonal con pocas consultas y sin problema de coordinación/seguimiento;
- empresa que no utiliza canales compatibles o no puede obtener grants/consentimiento necesarios;
- negocio que solo busca envíos masivos no solicitados, evasión de políticas o automatización sin handoff humano;
- organización sin decisor, capacidad operativa o resultado medible para un piloto;
- empresa cuya necesidad principal sea ERP, pagos, logística u otra integración aún no demostrada como prioridad del producto.

Estas exclusiones son hipótesis para explorar; no son criterios comerciales definitivos.

## 5. Hipótesis falsables

| ID | Hipótesis | Evidencia que la apoya | Qué la refuta o debilita |
|---|---|---|---|
| H-028-01 | Existe un subconjunto de servicios/comercio con consultas entrantes repetidas y coordinación de varios agentes | Ejemplos recientes, volumen aproximado, turnos/roles y herramientas actuales | La mayoría de entrevistados gestiona pocas consultas individualmente y no necesita coordinación |
| H-028-02 | La demora o falta de seguimiento produce un coste observable | Leads olvidados, respuestas tardías, citas no confirmadas o duplicados con ejemplos verificables | El problema es anecdótico, infrecuente o no afecta ningún resultado relevante |
| H-028-03 | Un Inbox + CRM liviano + automatización resuelve una fricción que las herramientas actuales no cubren bien | Cambios de herramienta, hojas paralelas, trabajo duplicado o gasto actual | WhatsApp Business/app + hoja/proceso actual resuelve el flujo a coste y complejidad aceptables |
| H-028-04 | El valor aumenta con volumen, multiusuario, canales y complejidad de seguimiento | Diferencias observadas entre negocios y señales de uso/resultado | No hay relación observable entre complejidad del flujo y valor percibido |
| H-028-05 | Agencias pueden ser un canal secundario viable | Portafolio activo, onboarding repetible, necesidad de aislamiento y acceso delegado | Cada cliente requiere operación muy distinta, los grants generan fricción excesiva o no hay incentivo comercial |
| H-028-06 | Hay disposición a pagar por resultado/operación y no solo interés en una demo | Presupuesto existente, comprador identificado, comparación con gasto actual, piloto comercial aceptado con condiciones explícitas | Solo hay elogios/encuestas declarativas, no hay presupuesto ni acción de compra |

Las hipótesis se revisan contra casos positivos, negativos y contradictorios. No se cuentan opiniones del equipo como evidencia de mercado.

## 6. Trabajo de campo

### 6.1 Primera ola exploratoria propuesta

**Diseño sugerido:** 18 entrevistas cualitativas no probabilísticas: 6 servicios, 6 comercio y 6 agencias. Es una primera ola para descubrir patrones, no una muestra representativa ni una base para porcentajes poblacionales. Dentro de cada segmento se buscará variedad de decisores y usuarios operativos. Evitar entrevistar solo amistades, clientes de una misma agencia o empresas con el mismo proveedor.

**Reclutamiento:** registrar canal de reclutamiento y posibles sesgos; no seleccionar únicamente empresas que ya usan WhatsApp API. Incluir contrastes: negocio pequeño/individual, negocio con equipo, empresa con herramientas pagadas y empresa con procesos manuales.

**Duración orientativa:** 35–45 minutos. La guía de preguntas está en research/us-028/INTERVIEW-GUIDE.md.

### 6.2 Reglas de entrevista

- Preguntar por el último caso real, preferentemente de los últimos 30 días, antes de describir WhatsBusiness.
- No presentar funcionalidades ni inducir respuestas positivas al inicio.
- Solicitar estimaciones por rangos cuando un número exacto sea sensible.
- Separar usuario, comprador, influenciador y aprobador del gasto.
- Registrar alternativas reales: proceso manual, WhatsApp Business, hojas, CRM, bandeja compartida, agencia o competidor.
- Separar afirmación, ejemplo observado, artefacto autorizado y señal de compra.
- Parafrasear hallazgos; no registrar nombres, teléfonos, correos, mensajes completos ni capturas de conversaciones en el repositorio Git.
- Documentar silencios, rechazos y contraejemplos para reducir sesgo de confirmación.

### 6.3 Señales de disposición a pagar

No se interpretará “me gusta” o “lo usaría” como WTP. Clasificar señales por fuerza:

1. **Débil:** expresa interés general o acepta una demo.
2. **Exploratoria:** compara con una alternativa y describe presupuesto/compra actual sin ofrecer evidencia sensible.
3. **Conductual:** identifica decisor, presupuesto, calendario y siguiente paso concreto para evaluar.
4. **Compromiso:** acepta condiciones escritas de piloto comercial o proceso de adquisición sujeto a revisión.
5. **Pago:** existe transacción real autorizada, contrato y evidencia contable; no se intenta obtener ni registrar en Git información financiera confidencial.

No proponer importes ni tarifas en esta etapa. Toda propuesta de precio necesita costes, soporte, infraestructura, uso, cargos externos Meta, fiscalidad y unit economics verificados.

## 7. Modelo de mercado TAM / SAM / SOM

### 7.1 Unidad y filtros

**Unidad de análisis:** empresa/tenant comprador deduplicado.

Partir de REEM como marco estadístico, segmentando por CIIU, ubicación y tamaño solo cuando la metodología permita hacerlo. Aplicar filtros sucesivos con fuentes explícitas:

1. actividad sectorial alineada con comercio/servicios;
2. operación activa y existencia de proceso comercial/servicio recurrente;
3. uso o intención observable de canales compatibles, sin inferirlo de TIC de hogares;
4. problema operativo que el producto pueda resolver y resultado medible;
5. equipo/volumen/proceso compatible con el valor de Inbox, CRM y automatización;
6. elegibilidad real de los activos, cuenta, permisos y capacidades Meta requeridos;
7. alcance geográfico/comercial y capacidad real de atender al tenant;
8. decisor y evidencia de presupuesto/disposición a pagar, cuando se mida.

### 7.2 Fórmulas

- **TAM en unidades:** conteo deduplicado de empresas en Ecuador que cumplen definición funcional del ICP, antes de limitarse a la capacidad comercial actual.
- **SAM en unidades:** subconjunto del TAM que es elegible, alcanzable y atendible con capacidades, geografía, soporte y canales disponibles.
- **SOM en unidades:** subconjunto del SAM que puede adquirirse de forma realista en un horizonte explícito, usando capacidad de ventas/onboarding, conversión observada, churn y presupuesto aprobado.
- **Valor anual de mercado:** unidades elegibles × ingreso recurrente neto anual observado/aprobado por tenant. Los cargos de Meta de terceros se mantienen separados y transparentes; no se cuentan como ingreso neto propio.

No se completa ninguna de estas cantidades con una tasa inventada. Las entrevistas cualitativas pueden ayudar a definir filtros y lenguaje, pero no producen por sí solas estimaciones poblacionales.

### 7.3 Escenarios sin falsa precisión

| Escenario | Universo | Elegibilidad | Conversión/captura | Estado |
|---|---|---|---|---|
| Conservador | REEM deduplicado por sector/actividad | Usar el extremo inferior medido en una fuente representativa o piloto claramente acotado | Usar capacidad comercial y conversión observadas | Pendiente de datos |
| Base | Misma definición y fecha de corte | Tasa central medida con muestra adecuada y segmentación | Cohortes reales y capacidad aprobada | Pendiente de datos |
| Alto | Misma definición; sin ampliar sectores por conveniencia | Extremo superior sustentado, no deseado | Conversión demostrada y capacidad compatible | Pendiente de datos |

Toda estimación debe guardar denominador, fecha, universo, exclusiones, método, fuente, confianza y análisis de sensibilidad. Si solo existe una muestra de conveniencia, publicar conteos descriptivos de esa muestra, nunca extrapolarlos al total nacional.

## 8. Diseño de pilotos y métricas

### 8.1 Condición de seguridad

GO-PRODUCTION continúa NO-GO. Este documento no autoriza datos reales, mensajes, escrituras Meta, publicación, gasto publicitario ni despliegue. Antes de tratar datos personales de clientes o conectar activos reales se necesitan los gates de seguridad/privacidad (incluidos TASK-031/TASK-032), base jurídica/consentimiento aplicables, contratos y autorización expresa del propietario. Hasta entonces, las pruebas se limitan a datos sintéticos y cuentas/activos de prueba autorizados.

### 8.2 Diseño sugerido

Proponer una cohorte inicial pequeña y controlada después de resolver los gates, con representación de comercio y servicios y, si el caso lo justifica, una agencia. No incluir agencias como clientes duplicados de sus tenants. Definir baseline previo para cada empresa, hipótesis por piloto, resultado principal, métrica de seguridad, duración, criterios de parada y responsable. Comparar contra su proceso anterior; no atribuir causalidad si no hay control/holdout adecuado.

### 8.3 Definiciones operativas

- **Activación:** tenant de piloto con al menos un canal de prueba/permitido conectado, primer usuario invitado/activo y primer flujo de lead/conversación ejecutado de principio a fin.
- **Time-to-value (TTV):** tiempo entre kickoff y primer resultado del flujo acordado que el negocio reconoce como útil; el evento debe tener definición por piloto.
- **Adopción de asientos:** asientos activos / asientos habilitados, con denominador y periodo explícitos.
- **Uso por canal:** actividad agregada por canal, tenant y semana; no almacenar contenido de mensajes en el registro de investigación.
- **Retención:** tenant activo en la semana/cohorte definida y con uso repetido del workflow acordado; definir W4/W8 antes de iniciar.
- **Outcome:** lead calificado, cita, cotización, venta u otro resultado acordado. Separar outcomes confirmados por el negocio de conversiones atribuidas por Meta.
- **Calidad/seguridad:** duplicados, fallos de sincronización, permisos revocados, incidentes de privacidad, quejas y opt-outs; los criterios de parada prevalecen sobre métricas de crecimiento.

El diccionario está en research/us-028/PILOT-METRICS-DICTIONARY.md y el resumen semanal en pilot-metrics.template.csv. Estos nombres son instrumentos de investigación; no se registran como contratos AsyncAPI ni se implementan como eventos runtime en esta tarea.

## 9. Decisiones que no se toman con este paquete

- No se cambia PD-012; se conserva como hipótesis que requiere discovery.
- No se define precio, plan, mínimo de seats, límite de uso, margen ni forecast.
- No se declara que un sector tenga mejor conversión sin medición comparativa.
- No se convierte una agencia en canal de distribución probado.
- No se interpreta el interés verbal como demanda validada.
- No se habilita acceso Meta ni se modifica G0/GO-PRODUCTION.
- No se guarda PII, audio, transcripciones ni datos sensibles en el repositorio.

## 10. Próximos pasos y responsables

| Orden | Acción | Responsable funcional propuesto | Evidencia de salida |
|---|---|---|---|
| 1 | Revisar la guía y aprobar el protocolo de contacto/consentimiento | Product Owner + privacidad | Guía aprobada y consentimiento adecuado |
| 2 | Reclutar muestra exploratoria diversa | Product/Research | Registro anonimizado y sesgos de reclutamiento |
| 3 | Ejecutar entrevistas y codificar evidencia | Research/BA | Fichas de entrevista y matriz de patrones/contraejemplos |
| 4 | Revisar ICP y exclusiones | Product + ventas + domain | Decisión documentada con evidencia positiva y negativa |
| 5 | Confirmar gates de privacidad/seguridad y autorización de pilotos | Security/Privacy + Product Owner | Checklist firmado; sin bypass de GO-PRODUCTION |
| 6 | Ejecutar pilotos autorizados y registrar baseline/cohortes | Product + operaciones + QA | Métricas instrumentadas y outcomes |
| 7 | Estimar TAM/SAM/SOM y evaluar pricing | Data/Finance + Product | Modelo reproducible y unit economics revisados |

### Definition of Done revisada para TASK-066

TASK-066 solo podrá proponerse para **verified** cuando haya: desk research con metodología; entrevistas realizadas y anonimizadas en los tres segmentos; síntesis con patrones y contradicciones; hipótesis refutadas/confirmadas con evidencias y límites; ICP actualizado con exclusiones; piloto autorizado con activación/TTV/seats/canales/retención/outcomes instrumentados; y modelo de mercado con denominadores y supuestos reproducibles. Pricing/forecast queda separado y requiere unit economics. El estado **accepted** sigue reservado al Product Owner.

## 11. Fuentes principales

1. INEC — Directorio de Empresas / REEM, base definitiva 2024 y provisional 2025: https://www.ecuadorencifras.gob.ec/directoriodeempresas/
2. INEC — Principales Resultados REEM 2025, PDF enlazado desde la página anterior.
3. INEC — Encuesta Estructural Empresarial 2024 (ENESEM), resultados de grandes y medianas empresas: https://www.ecuadorencifras.gob.ec/encuesta-a-empresas/
4. INEC — ENESEM 2024, formulario con preguntas de medios de comunicación: https://www.ecuadorencifras.gob.ec/documentos/web-inec/Estadisticas_Economicas/Encuesta_Estructural_Empresarial/2024/2024_ENESEM_Formulario.pdf
5. INEC — ANDA, diccionario de datos TIC ENESEM 2024: https://anda.inec.gob.ec/anda5/index.php/catalog/1325/data-dictionary/F79?file_name=2024_ENESEM_BDD_TIC
6. INEC — TIC Empresas (página con resultados históricos 2015): https://www.ecuadorencifras.gob.ec/tecnologias-de-la-informacion-y-comunicacion-empresas/

Fuentes, fecha, alcance y advertencias también deben constar en docs/32. Revalidar enlaces y vigencia cuando se amplíe el trabajo de campo.

---
**Estado final de esta entrega:** AC-028-01 documentado; AC-028-02/03 preparados, no ejecutados; AC-028-04 diseñado, no ejecutado; AC-028-05 metodológicamente preparado, no cuantificado; AC-028-06 guardrail documentado. TASK-066 y US-028 permanecen **in_progress**.