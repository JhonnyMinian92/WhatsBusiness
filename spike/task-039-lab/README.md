# TASK-039 — laboratorio reproducible Docker Compose

Laboratorio **aislado, sintético y desechable** para recopilar evidencia de infraestructura antes del scaffold productivo. No es código de la aplicación WhatsBusiness y no debe copiarse automáticamente a ella.

## Requisitos del host

- Docker Engine compatible con Docker Compose v2.
- Bash, curl, jq, Git y utilidades POSIX.
- Acceso a Internet para descargar las imágenes fijadas en \`compose.yaml\`.
- Recomendado: 4 CPU, 8 GB RAM y 15 GB libres para ejecutar todos los servicios cómodamente. Esto es un requisito práctico del laboratorio, no una estimación de producción.

## Inicio rápido

Desde la raíz del repositorio:

\`\`\`bash
cd spike/task-039-lab
cp .env.example .env
# Edita .env y cambia todas las contraseñas locales.
docker compose config
docker compose pull
docker compose up -d
./scripts/run-lab.sh
\`\`\`

El script valida Compose, espera a los cuatro servicios y ejecuta pruebas sintéticas de PostgreSQL/RLS, RabbitMQ/DLX, Valkey, Keycloak/OIDC y backup/restore. Los resultados se guardan en \`results/test-evidence.md\`; el dump PostgreSQL se guarda en \`results/postgres-lab.dump\`. Ambos están excluidos de Git.

Para observar servicios:

\`\`\`bash
docker compose ps
docker compose logs --tail=100
docker stats
\`\`\`

Para detener sin borrar datos:

\`\`\`bash
docker compose down
\`\`\`

Para borrar volúmenes y reiniciar desde cero (destructivo):

\`\`\`bash
CONFIRM_DELETE_LAB_VOLUMES=yes ./scripts/reset-lab.sh
\`\`\`

Después del reset, vuelve a ejecutar \`docker compose up -d\` y \`./scripts/run-lab.sh\`.

## Servicios y puertos locales

| Servicio | Imagen fijada | Puerto host | Propósito |
|---|---|---:|---|
| PostgreSQL | postgres:18.6-alpine | 54329 | RLS, tenant context, inbox/outbox sintéticos y restore |
| RabbitMQ | rabbitmq:4.4-management | 56729 / 15679 | exchange/queue durable, mensaje persistente y DLQ |
| Valkey | valkey/valkey:9.1.0 | 16389 | autenticación, SET/GET y TTL |
| Keycloak | quay.io/keycloak/keycloak:26.8.2 | 18080 | OIDC discovery, JWKS y login sintético |

Todos los puertos se enlazan exclusivamente a \`127.0.0.1\`. No expongas el laboratorio a Internet ni uses credenciales reales. Keycloak usa modo dev y un usuario/cliente sintético; no representa configuración de producción.

## Datos sintéticos

- Tenant A: \`11111111-1111-4111-8111-111111111111\`.
- Tenant B: \`22222222-2222-4222-8222-222222222222\`.
- Dos contactos ficticios, eventos y payloads marcados \`synthetic\`.
- Usuario OIDC: \`lab.user\`; cliente público de prueba: \`lab-cli\`.
- Password del usuario de prueba: \`LabOnly-Password-Change-Me\`. Cambia las credenciales locales antes de usar el laboratorio; nunca reutilices esta contraseña.

No se conectan cuentas Meta, números WhatsApp, clientes reales, proveedores IA, presupuestos ni secretos de producción.

## Qué prueba y qué no prueba

| Experimento | Cubierto por este laboratorio | No queda demostrado |
|---|---|---|
| SP-01 | Nada del workspace de aplicación | Nx/pnpm/Nest/Angular, frozen install, build, lint, typecheck, boundaries y tests |
| SP-02 | PostgreSQL RLS con dos tenants, sin contexto, write cruzado y reset de SET LOCAL en una sesión | Middleware/guards de la aplicación, pool real Node/driver, concurrencia y worker context |
| SP-03 | Exchange/queue durable, mensaje persistente y dead-letter routing | Outbox transaccional real, publisher confirms desde la app, consumer idempotente, caída/replay/crash |
| SP-04 | Tabla inbox durable y dedupe por clave única | Endpoint HTTP, firma, límites, ACK después de commit y recuperación de worker |
| SP-05 | OIDC discovery, JWKS y emisión de token sintético | Validación de issuer/audience en la app, expiración, revocación y autorización membership/tenant |
| SP-06 | pg_dump y restore a otra DB del mismo contenedor; verificación de filas | Cifrado, host limpio, backup externo, RPO/RTO productivos |
| SP-07 | Snapshot local de Docker, CPU, memoria y disco | VPS objetivo, IOPS/latencia representativa, carga sostenida y capacidad productiva |
| SP-08 | No cubierto | Comparación justa de backend, frontend y protocolos bajo workload idéntico |
| SP-09 | Valkey auth + SET/GET + TTL | ACL por usuario, TLS, Lua, pub/sub, locks, persistencia/failover y recuperación |
| SP-10 | Tags fijados y listado de imágenes descargadas | Digests aprobados, lockfiles de aplicación, SCA/CVE, SBOM, compatibilidad completa y licencias |

**Importante:** que el script termine correctamente no significa que TASK-039 esté completa ni que G0 pase. El laboratorio cubre pruebas de infraestructura acotadas; las pruebas faltantes deben ejecutarse con el workspace desechable y el host de referencia. La revisión independiente QA/SRE/Seguridad sigue siendo obligatoria.

## Notas técnicas

- PostgreSQL aplica RLS a las tablas tenant-scoped. El rol \`app_runtime\` no es superuser ni tiene \`BYPASSRLS\`.
- El contexto se configura con \`SET LOCAL app.tenant_id\`; la prueba confirma que no sobrevive al COMMIT en la misma sesión.
- La tabla \`webhook_inbox\` usa unicidad \`(tenant_id, external_event_id)\` para demostrar deduplicación en la base de datos.
- RabbitMQ usa la API de management para publicar un mensaje persistente, rechazarlo sin requeue y comprobar su llegada a la DLQ.
- El restore se realiza en una base de datos distinta dentro del mismo contenedor. No es un disaster-recovery drill.
- Las imágenes usan tags versionados, no \`latest\`. Registrar los digests reales de cada ejecución antes de aceptar SP-10.

## Evidencia que debe adjuntarse a TASK-039

1. Commit exacto del laboratorio y archivos de configuración.
2. \`results/test-evidence.md\`, salida de comandos y logs relevantes.
3. Versiones del host, Docker/Compose, imágenes y sus digests.
4. Métricas de recursos y limitaciones del entorno.
5. Resultado separado por SP, sin convertir una prueba parcial en PASS global.
6. Reviewer independiente y decisión ACCEPT/ADJUST/REJECT por ADR.

Este laboratorio no cambia el gate definido en \`docs/45\`, \`docs/54\` y \`docs/56\`.
