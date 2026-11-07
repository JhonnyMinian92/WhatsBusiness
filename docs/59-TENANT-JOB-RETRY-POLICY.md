# 59 — Política de reintentos para trabajos multi-tenant

**Fecha:** 2026-11-07  
**Rama:** `environment/local`  
**Tarea:** TASK-003  
**Estado:** política pura implementada y suite registrada; ejecución local/CI pendiente. No equivale a un consumer operativo.

## Objetivo

Definir una política determinista y reutilizable para decidir entre reintentar un fallo transitorio y enviar un trabajo a dead-letter, sin acoplarla a NestJS, PostgreSQL ni a un broker específico.

## Implementación

- `apps/api/src/platform/isolation/tenant-job-retry-policy.ts` implementa `TenantJobRetryPolicy`.
- La configuración exige delay inicial positivo, delay máximo no inferior al inicial y multiplicador entre 1 y 10.
- La decisión valida attempt (1..maxAttempts), límite de intentos (1..32), fecha, muestra aleatoria (0..1) y código de error estable/sanitizado.
- Los fallos permanentes terminan en `dead_letter` inmediatamente; los transitorios agotan el presupuesto de intentos antes de terminar.
- El backoff exponencial tiene techo y usa equal jitter para evitar reintentos sincronizados, garantizando al menos 1 ms.
- La política recibe el sample aleatorio como argumento: no usa estado global, reloj del sistema ni SDK externo y puede probarse de forma determinista.
- Solo se devuelve un código de error normalizado. Nunca se persiste ni devuelve el mensaje arbitrario de una excepción.

## Pruebas registradas

`tenant-job-retry-policy.spec.ts` cubre:
- cálculo de backoff con jitter y no mutación de la fecha de entrada;
- límite superior y ausencia de retry inmediato;
- dead-letter de fallo permanente;
- dead-letter al agotar intentos;
- validación de límites y entradas no confiables;
- rechazo de configuración inválida.

La suite quedó agregada al target `api:test` de `apps/api/project.json`. No se afirma que haya pasado: debe ejecutarse en Source CI junto con build y typecheck.

## Contrato de integración pendiente

El caller que procese el trabajo debe:
1. clasificar explícitamente el error en un código estable y decidir si es transitorio; errores desconocidos deben fallar cerrados como permanentes;
2. calcular la decisión con el número de intento confirmado por PostgreSQL, nunca con un contador local;
3. persistir `failed + available_at` o `dead_letter` de forma atómica con el lease/claim del trabajo;
4. confirmar el mensaje del broker solo después de que el resultado y el estado del trabajo estén comprometidos;
5. resolver nuevamente el contexto canónico y revalidar actor, membership y tenant en cada intento.

La política no publica mensajes, no adquiere leases, no recupera trabajos `processing` abandonados, no implementa inbox/dedupe, no hace replay y no sustituye el broker. El esquema actual `0006-tenant-job-outbox.sql` aún requiere un diseño de lease/claim y una estrategia de reconciliación para cierres abruptos del worker.

## Próximos criterios de cierre de TASK-003

- [ ] Elegir y documentar broker/transport y topología de colas sin acoplar el dominio al SDK.
- [ ] Añadir claim/lease recuperable con `FOR UPDATE SKIP LOCKED`, token de fencing y expiración.
- [ ] Implementar dispatcher con publisher confirms y entrega at-least-once.
- [ ] Implementar consumer con inbox/dedupe transaccional y ACK posterior al commit.
- [ ] Aplicar esta política al state machine SQL con backoff persistido y clasificación allowlisted.
- [ ] Implementar DLQ, inspección, replay autorizado y auditoría.
- [ ] Probar crash antes/después de publish, ACK perdido, duplicados, out-of-order, lease expirado, revocación tenant, pool reuse A→B y saturación.
- [ ] Ejecutar Source CI y revisión independiente; mantener TASK-003 in_progress hasta evidencia y aceptación.

## Riesgos y límites conocidos

- At-least-once implica duplicados: todo handler de negocio debe tener idempotency key y side effects protegidos.
- Un lease sin fencing permite que un worker lento continúe después de que otro recupere el trabajo; el token de lease debe validarse al confirmar resultados.
- Un ACK previo al commit puede perder trabajo; un ACK posterior puede duplicar entrega, por lo que el consumer debe ser idempotente.
- Un retry de error permanente desperdicia recursos y puede repetir acciones no reversibles; por ello la clasificación debe ser explícita y default-deny.
- La retención de payloads, datos personales y DLQ requiere política de privacidad y acceso por tenant antes de producción.

## Evidencia de cambio

- Código: `apps/api/src/platform/isolation/tenant-job-retry-policy.ts`.
- Tests: `apps/api/src/platform/isolation/tenant-job-retry-policy.spec.ts`.
- Registro de suite: `apps/api/project.json`.
- Commits iniciales: implementación `c27a8578f56ef2e740a56d907e5fdc963a0a5b46`; tests `aa5c37273011ba354a1b574a8a519fd0d623960a`; registro suite `(commit reportado por GitHub en la actualización de project.json)`.
