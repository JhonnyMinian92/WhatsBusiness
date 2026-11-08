# Repositorio de investigación — US-028 / TASK-066

Este directorio contiene instrumentos vacíos para discovery de mercado. A fecha 8 de noviembre de 2026 **no existen entrevistas ni pilotos reales cargados**.

## Archivos

- participant-register.template.csv: metadatos no identificables por participante.
- interview-coding.template.csv: hallazgos parafraseados, jobs-to-be-done, problemas, alternativas y señales de compra.
- pilot-metrics.template.csv: resumen semanal agregado para pilotos autorizados.
- INTERVIEW-GUIDE.md: guion y reglas de consentimiento.
- PILOT-METRICS-DICTIONARY.md: definiciones para instrumentar resultados.

## Reglas de datos

1. No registrar nombres, correos, teléfonos, identificadores de cuentas, nombres de empresas pequeñas fácilmente reidentificables, IDs Meta, tokens, conversaciones ni capturas de pantalla.
2. Usar códigos aleatorios y categorías/rangos amplios. El registro de contacto para reclutar participantes, si se necesita, se guarda separado en un sistema con acceso restringido y retención revisada; nunca se sube aquí.
3. Notas y citas se parafrasean para retirar PII y secretos comerciales. No registrar texto literal si puede identificar a una persona o cliente.
4. Los agregados de pilotos pueden seguir siendo información comercial confidencial. Solo se incorporan al repositorio cuando se haya autorizado su publicación interna y se hayan agregado suficientemente.
5. No almacenar audio/transcripciones ni datasets de clientes en Git. Revisar base legal, aviso, consentimiento, encargos, seguridad y retención antes de cualquier piloto con datos reales.
6. consent_status documenta el permiso de investigación, no sustituye por sí mismo el consentimiento/base jurídica requerido para tratar datos de clientes ni autoriza conexiones a Meta.
7. No inventar respuestas para completar plantillas. Los campos sin evidencia se dejan vacíos o con not_collected.

## Estado y restricciones

Los archivos son plantillas; no son un sistema productivo de analítica ni contratos AsyncAPI. GO-PRODUCTION sigue NO-GO. Cualquier piloto con datos reales, canales live, mensajes, publicación o gasto requiere resolver sus gates y obtener autorización explícita.