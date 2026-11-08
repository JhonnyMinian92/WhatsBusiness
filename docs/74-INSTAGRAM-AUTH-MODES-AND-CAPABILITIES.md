# 74 — Instagram: modos de autenticación y capacidades

**Fecha de corte:** 2026-11-08  
**Historia:** US-010 — Instagram profesional (P1)  
**Tareas:** TASK-020 y TASK-021  
**Estado:** slice de dominio implementado; integración Meta externa, endpoints y aceptación pendientes.

## 1. Diseño por modo de autenticación

La integración distingue Facebook Login e Instagram Login. El selector evalúa el conjunto completo de capacidades solicitadas y descarta modos que no las soportan o carecen de evidencia. Seleccionar un modo no concede permisos ni reemplaza la autorización runtime.

- **Facebook Login:** solo cuentas Instagram Professional Business/Creator vinculadas a una Facebook Page. La colección oficial documenta lectura/publicación de media, comentarios, menciones, hashtags y métricas básicas. Stories publishing está limitado a Business en esta modalidad.
- **Instagram Login:** cuentas profesionales Business/Creator; la configuración no ofrece acceso a Ads ni tagging. No exige el Page linkage del flujo Facebook Login.
- **Instagram Direct:** el destinatario debe iniciar la conversación. No se admite mensajería grupal, los medios compartidos deben pertenecer a la cuenta conectada y Requests inactivos por 30 días no aparecen en las consultas descritas por Meta.
- **Facebook Login + Direct:** exige instagram_manage_messages, pages_manage_metadata, Page task MESSAGING y Page access token. Business Verification y Advanced Access se exigen para los escenarios documentados de conversaciones externas.
- **Insights:** el permiso exacto por operación y versión no está cerrado; permanece unknown/fail-closed.
- **Instagram Login + Stories:** elegibilidad no confirmada por la referencia consultada; permanece unknown. No extrapolar la restricción Business del apartado Facebook Login.

## 2. Código incorporado

| Archivo | Responsabilidad |
|---|---|
| apps/api/src/platform/meta-control-plane/domain/instagram-capability-catalog.ts | Catálogo por login mode, capability, scopes documentados, tipo de cuenta y restricciones. |
| apps/api/src/platform/meta-control-plane/domain/instagram-capability-evaluator.ts | Reutiliza MetaCapabilityEvaluator; añade Page link, Page task, access token type, recipient initiation, Business Verification y Advanced Access. |
| apps/api/src/platform/meta-control-plane/domain/instagram-capability-evaluator.spec.ts | Matriz de selección, cuenta, scopes, Page, Page token, Direct, Stories y evidencia expirada/desconocida. |
| apps/api/src/platform/meta-control-plane/domain/instagram-publishing-policy.ts | Preflight, aprobación, idempotencia, container status, transiciones y reconciliación de publicación. |
| apps/api/src/platform/meta-control-plane/domain/instagram-publishing-policy.spec.ts | Pruebas unitarias de estados, timeout, autorización, Story y metadatos Reel. |

Los scopes de media publishing y comments se toman de la colección oficial del producto y se anotan como evidencia de colección; deben confirmarse por endpoint, versión y App Review antes de activar cada operación. Los scopes Direct se contrastan además con la referencia específica de mensajería.

## 3. Publicación segura

El flujo local representa draft → container_processing → ready → publishing → published. Un timeout remoto transita a outcome_unknown y no permite repetir la escritura ciegamente. Solo una consulta/reconciliación explícita permite confirmar published o volver a ready cuando el proveedor confirma que el objeto no existe. El preflight exige capability available, aprobación humana, Idempotency-Key y container status FINISHED.

La validación local de Reels contempla límites publicados por Meta: MP4/MOV, H.264/HEVC, AAC a 48 kHz, 23–60 FPS, ancho máximo 1.920 px, 3–900 segundos, archivo máximo 1 GB, video hasta 25 Mbps y audio hasta 128 kbps. El ratio 9:16 se trata como recomendación, no como bloqueo.

## 4. Dependencias y gates pendientes

1. TASK-008: falta conexión OAuth/Embedded Signup, token exchange, almacenamiento seguro, renovación y revocación.
2. TASK-010: falta sync/persistencia de assets, grants y evidence runtime por operación.
3. IG-001..IG-012 permanecen catalog-only, con x-implementation-allowed false. No se añadieron controllers ni rutas públicas.
4. TASK-027/028: falta conectar eventos Instagram de Direct/comments al consumer de negocio y a Inbox durable.
5. No hay adapter HTTP Instagram, repositorio de cuentas/media, sincronización de comentarios, sender DM ni lector real de Insights.
6. App Review, Advanced Access, Business Verification y cuenta profesional real no fueron probados. No hubo escrituras Meta.
7. Source CI/CodeQL del commit exacto, revisión independiente y aceptación del Product Owner pendientes.

## 5. Invariantes y arquitectura

- Reutilización de MetaCapabilityEvaluator y sus tipos MetaEvidence / MetaCapabilityDefinition; no se replica el motor general.
- Dominio puro independiente de NestJS y del SDK Meta.
- Capacidad desconocida, evidencia vencida, scope faltante, cuenta consumer, token type incorrecto o Page task ausente no habilita operación.
- Publicación exige aprobación explícita e idempotencia; un resultado remoto ambiguo necesita reconciliación.
- No se almacenan ni exponen tokens o secretos en este slice.
- GO-PRODUCTION permanece NO-GO.

## 6. Fuentes oficiales

- Meta — Instagram API Documentation: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Meta — Instagram API with Instagram Login: https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login
- Meta — Conversations API / Instagram Messaging: https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a

Las fuentes describen requisitos del producto Meta; no prueban que WhatsBusiness tenga permisos, App Review, Advanced Access o elegibilidad de cliente.
