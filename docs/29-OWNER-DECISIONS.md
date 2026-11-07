# 29 — Decisiones confirmadas del propietario

**Fecha:** 2026-11-06  
**Fuente:** respuestas explícitas del propietario.  
**Estado:** baseline parcial aprobada; las respuestas pendientes no son decisiones.

## 1. Decisiones confirmadas

| ID | Decisión | Respuesta | Efecto |
|---|---|---|---|
| PD-001 | Modelo de negocio | SaaS comercial y plataforma interna de EcuApp | Diseñar multi-tenancy y separar control de plataforma/tenant |
| PD-002 | Código inicial | Comenzar desde cero | Greenfield; no asumir código heredado |
| PD-003 | Alcance Meta | Todos los productos/capacidades enumerados en META_SERVICES.md | Catálogo completo, con elegibilidad y fases |
| PD-004 | Producto propio | Backend, panel, CRM e inbox omnicanal | CRM e inbox son dominios de primera clase |
| PD-005 | IA | Automatización básica con visión de crecimiento | Chatbots acotados y sugerencias; arquitectura extensible |
| PD-006 | Interfaces | Backend y panel web | No se compromete aplicación móvil nativa |
| PD-007 | Stack | Sin stack impuesta; autoriza recomendación del arquitecto | ADR técnico recomendado con criterios y alternativas |
| PD-008 | Hosting | VPS / servidor propio | Despliegue portable y contenerizado |
| PD-009 | Entrega | Proponer fases; todo separado y organizado | Roadmap por dominios, dependencias y gates |
| PD-010 | Autonomía | Continuar tareas independientes y aplicar la mejor opción técnica conocida | Registrar decisiones reversibles y no bloquear trabajo no afectado |
| PD-011 | Escalamiento | Consultar bloqueos de producto, costes, datos, seguridad, cumplimiento, proveedores, breaking changes y decisiones irreversibles | Mantener decisiones humanas reservadas |

## 2. Interpretación de la aclaración de IA

La frase "pero cob vision para automatizacion con IA" se interpreta, por contexto, como "pero con visión para automatización con IA". Primera capacidad:
- Automatizaciones basadas en reglas y eventos.
- Chatbots con flujos/intenciones configurables.
- Sugerencias de respuesta asistidas por IA para agentes.
- Abstracción de proveedores/modelos y límites de consumo.
- Registro de versiones de prompts, evaluación y trazabilidad.
- Aprobación humana para acciones externas sensibles.

No se asume todavía RAG, agentes autónomos, voz, entrenamiento de modelos propios ni envío autónomo irrestricto.

## 3. Principios derivados

1. SaaS y uso interno comparten producto y servicios, sin codebases divergentes.
2. Separar Platform Control Plane, dominios de negocio y adaptadores Meta.
3. Cada módulo/servicio tendrá ownership, contratos, datos y pruebas independientes.
4. Un bounded context no exige necesariamente un proceso desplegable independiente desde el primer commit.
5. VPS es una restricción de despliegue, no una razón para acoplar dominios.
6. Panel web responsive; no se incluye aplicación móvil nativa en el baseline.
7. IA transversal con límites por tenant, coste, privacidad y aprobación.

## 4. Preguntas pendientes y aclaraciones parciales

| Pregunta | Tema | Tratamiento provisional |
|---|---|---|
| Q-002 | Segmentos de cliente, agencias y países | Ecuador figura como mercado inicial heredado; confirmar |
| Q-003 | Planes, precios, facturación y pass-through de costes Meta | No diseñar pricing definitivo |
| Q-009 | Idiomas, monedas, zonas horarias y facturación local | Preparar i18n/locale; no cerrar reglas fiscales |
| Q-013 | Volumen, disponibilidad, SLO, RPO/RTO, presupuesto VPS | Diseñar escalabilidad; medir antes de dimensionar |
| Q-014 | Aislamiento de datos, SSO/MFA y aprobaciones | Proponer tenant_id + RLS como baseline sujeto a revisión |
| Q-015 | Retención, residencia, LOPDP y asesoría legal | Minimización y controles configurables; retención final pendiente |
| Q-016 | Límites de gasto y roles aprobadores | Denegar gasto real por defecto hasta política aprobada |
| Q-017 | Integraciones externas concretas | Diseñar puertos/adaptadores; no prometer conectores |
| Q-018 | Criterios exactos de producción y Meta App Review | Gate externo obligatorio; evidencias pendientes |
| Q-019 | Política Git final | Regla operativa heredada: continuar en environment/local; master/develop intactas salvo autorización expresa. Confirmación explícita en el cuestionario original pendiente, pero no bloquea el trabajo actual. |
| Q-020 | Límites finos de autonomía | Respondida en el cuestionario abreviado: continuar trabajo independiente y resolver decisiones técnicas conocidas; escalar decisiones de impacto. Aplicar PD-010/011. |

## 5. Reglas para agentes

- Decisión técnica reversible dentro de límites aprobados: elegir la opción mejor sustentada, registrar ADR y continuar.
- Decisión de producto/comercial/legal/privacidad/coste recurrente/seguridad de alto impacto: presentar recomendación y pedir aprobación.
- Una pregunta abierta no bloquea tareas independientes.
- Si un supuesto afecta una fase posterior, registrar fecha límite de resolución y continuar fases anteriores.
- Toda recomendación incluye contexto, alternativas, trade-offs, riesgos y reversión.
