# ADR-001 — Fundaciones multi-tenant y plano de control de Meta

- **Estado:** Aceptada
- **Fase:** 1 — Fundaciones y acceso a Meta
- **Fecha:** 8 de noviembre de 2026

## Contexto

WhatsBusiness conecta activos pertenecientes a empresas diferentes. Un token, un identificador remoto, un webhook o una caché no pueden cruzar límites de tenant. Los productos de Meta tampoco comparten un contrato funcional idéntico.

## Decisiones

1. Node.js 22 + TypeScript estricto + Fastify para el proceso HTTP y los workers.
2. OIDC/JWKS autentica usuarios de la plataforma; los tokens Meta son credenciales de proveedor distintas.
3. AsyncLocalStorage propaga el tenant autenticado y PostgreSQL RLS refuerza el aislamiento.
4. Business Login y Embedded Signup v4 usan state aleatorio, persistido como hash y consumido una sola vez.
5. Token Vault cifra cada token con AES-256-GCM y una data key (envelope encryption); AWS KMS protege las claves de datos en producción.
6. Asset Registry preserva el tipo nativo, capabilities, relaciones y grants de cada activo.
7. Webhook Gateway verifica firma sobre bytes raw, persiste payload cifrado y enruta por un índice técnico de activo a sus tenants autorizados.
8. Inbox/outbox usa entrega al menos una vez, dedupe persistente, reintentos y DLQ.
9. Consentimiento, auditoría y operaciones administrativas se guardan bajo tenant scope.
10. Los adaptadores específicos por producto no se sustituyen por una abstracción universal que suprima sus capacidades nativas.

## Consecuencias

- Se exige un proveedor OIDC y un KMS en producción.
- Las aprobaciones, Business Verification, App Review y configuración del dashboard Meta permanecen dependencias externas.
- Los endpoints comunes deben conservar extensiones específicas por producto.
- La fase se valida con pruebas unitarias, integración PostgreSQL, CI y prueba de conexión Meta autorizada; estas señales se reportan separadas.
