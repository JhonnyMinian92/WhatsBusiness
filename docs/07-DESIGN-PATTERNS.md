# 07 — Patrones de diseño y polimorfismo avanzado

## Principio
El polimorfismo debe maximizar extensibilidad y cobertura sin falsificar equivalencias entre APIs. No implementar un `MetaService` gigante con cientos de condicionales.

## Patrones obligatorios
| Patrón | Aplicación |
|---|---|
| Hexagonal / Ports & Adapters | Dominio aislado de Graph/WhatsApp SDK y HTTP |
| Adapter | Traducción por producto y versión |
| Strategy | Selección de transporte, retry, policy, pricing y attribution |
| Abstract Factory | Construcción de clientes/adapters según producto, versión y credencial |
| Registry | Resolución explícita de capacidades y adapters |
| Capability-based design | Descubrimiento de operaciones reales por asset |
| Discriminated unions | Payloads con variantes exhaustivas y tipadas |
| Specification | Reglas de elegibilidad, consent, ventana y presupuesto |
| Chain of Responsibility | Pipeline de validación/policy |
| State machine | Ciclos de vida remotos y locales |
| CQRS | Comandos operativos separados de consultas/reporting |
| Saga / Process Manager | Onboarding, campaign launch, lead enrichment |
| Inbox/Outbox | Entrega durable e idempotencia |
| Anti-Corruption Layer | Evitar filtrar semántica Meta al dominio interno |
| Decorator | Telemetría, circuit breaker, retry y rate limiting |
| Template Method | Flujos comunes con pasos específicos sobreescribibles |

## Contratos conceptuales
```ts
type ProviderProduct =
  | "whatsapp-cloud" | "whatsapp-management" | "whatsapp-marketing"
  | "facebook-pages" | "messenger" | "instagram-graph"
  | "instagram-messaging" | "lead-ads" | "marketing-ads"
  | "conversions-api" | "threads";

type CapabilityDescriptor = {
  product: ProviderProduct;
  operation: string;
  apiVersion: string;
  supported: boolean;
  requiredScopes: string[];
  requiredAssetTasks: string[];
  constraints: Record<string, unknown>;
  reasonUnavailable?: string;
};

type NativeEnvelope<T> = {
  provider: "meta";
  product: ProviderProduct;
  apiVersion: string;
  schemaVersion: string;
  resourceType: string;
  payload: T;
  receivedAt: string;
  redactionProfile: string;
};

type OperationResult<TCanonical, TNative> =
  | { outcome: "accepted"; canonical: TCanonical; native?: NativeEnvelope<TNative> }
  | { outcome: "rejected"; providerError: ProviderError; retryable: boolean }
  | { outcome: "unknown"; correlationId: string; reconciliationRequired: true };
```

## Reglas de diseño
1. Adapter por producto y versionado cuando cambie el contrato, no adapter por endpoint sin cohesión.
2. Capability registry se calcula desde scopes, asset tasks, versión, feature flags y elegibilidad; nunca solo desde configuración manual.
3. Común denominador solo para workflows realmente compartidos; conservar extensión nativa.
4. Los errores Meta se preservan (code, subcode, type, fbtrace_id) con redacción de PII.
5. No serializar clases polimórficas arbitrarias; usar schemas discriminados y versionados.
6. Las capacidades deben indicar límites, restricciones, permisos y razón de no disponibilidad.
7. Nuevos productos se agregan sin modificar consumidores que no los usan.
8. Contract tests por adapter y versión; golden fixtures sin datos personales reales.

## Anti-patterns prohibidos
- Switch central con todos los productos.
- DTO universal con 80 campos opcionales.
- Suponer que sendMessage es igual en WhatsApp, Messenger e Instagram.
- Ocultar error remoto detrás de un booleano.
- Mapear estados distintos a un único status sin guardar original.
- Reintento automático universal de POST.
- Usar `any`/JSON libre como contrato de dominio persistente.

## Evolución de contrato
Versionar API pública y eventos; mantener compatibilidad según política semver. Cambios breaking requieren ADR, CR, migración, contract tests y ventana de deprecación.
