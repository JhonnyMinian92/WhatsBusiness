# WhatsBusiness

Plataforma multi-tenant para integrar oficialmente los productos y APIs del ecosistema Meta, con foco inicial en WhatsApp Business Platform y capacidad de expansión a Facebook, Messenger, Instagram, Lead Ads, Marketing API, Conversions API y Threads.

> El repositorio se encuentra en fase de especificación y preparación. La documentación describe el producto deseado; no debe confundirse con funcionalidades implementadas.

## Para empezar

1. Lee el contrato obligatorio para agentes: [AGENTS.md](AGENTS.md).
2. Revisa el índice de documentación: [docs/README.md](docs/README.md).
3. Consulta la especificación de producto: [META_SERVICES.md](META_SERVICES.md).
4. Revisa el estado real y las limitaciones conocidas: [auditoría inicial](docs/27-INITIAL-REPOSITORY-AUDIT.md).
5. Responde las decisiones pendientes del propietario: [cuestionario de descubrimiento](docs/28-PRODUCT-DISCOVERY-QUESTIONNAIRE.md).

## Estado actual

- Rama de trabajo documental: `environment/local`.
- La rama auditada contiene documentación e instrucciones para agentes.
- No se encontró código fuente de backend/frontend, pruebas, migraciones ni infraestructura en el árbol inspeccionado.
- El alcance y las decisiones abiertas deben confirmarse antes de completar la especificación ejecutable.
- Ninguna tarea se considera verificada sin pruebas y evidencia; la aceptación final corresponde al propietario.

## Principios

- Integraciones oficiales de Meta; nunca scraping ni APIs no oficiales.
- Aislamiento multi-tenant y mínimo privilegio.
- Preservar las capacidades y semántica nativas de cada producto Meta.
- Seguridad, privacidad, auditoría, idempotencia y observabilidad desde el diseño.
- No afirmar implementación, pruebas, acceso, permisos o despliegues que no hayan sido demostrados.
