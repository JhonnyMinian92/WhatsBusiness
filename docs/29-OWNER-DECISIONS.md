# 29 — Decisiones del propietario y baseline aplicada por delegación

**Fecha de consolidación:** 2026-11-06  
**Autoridad:** decisiones explícitas del propietario (PD-001..PD-011) y autorización expresa posterior para que el arquitecto aplique todas las recomendaciones (PD-012..PD-023).  
**Estado:** baseline de producto aprobada; arquitectura elegida como baseline técnica; reservas legales, financieras, de capacidad y de producción permanecen sujetas a evidencia y gates.

> El propietario indicó que el arquitecto está a cargo de tomar las mejores decisiones técnicas y de documentarlas. Esto autoriza adoptar las recomendaciones de esta matriz, no inventar datos de mercado, comprometer gastos, dar asesoría legal, activar servicios de Meta ni ejecutar acciones productivas sensibles.

## 1. Decisiones explícitas del propietario

| ID | Decisión | Respuesta | Efecto |
|---|---|---|---|
| PD-001 | Modelo de negocio | SaaS comercial + plataforma interna EcuApp | Un solo producto multi-tenant, con separación de plataforma y tenants |
| PD-002 | Código inicial | Greenfield | Construcción desde cero; no asumir legado |
| PD-003 | Alcance Meta | Catálogo completo de META_SERVICES.md | Cobertura objetivo amplia, condicionada a capacidades y elegibilidad |
| PD-004 | Producto propio | Backend, panel web, CRM e Inbox omnicanal | CRM e Inbox son dominios de primera clase |
| PD-005 | IA | Automatización con visión de crecimiento | Reglas, chatbots acotados y sugerencias; evolución por fases |
| PD-006 | Interfaces | Backend y panel web | No se compromete app móvil nativa inicial |
| PD-007 | Tecnología | El arquitecto puede recomendar stack | Selección técnica basada en criterios y ADR |
| PD-008 | Hosting | VPS / servidor propio | Contenedores portables, operación medible y plan de escalado |
| PD-009 | Entrega | Por fases, separado y organizado | Gates y dependencias explícitos |
| PD-010 | Autonomía | Continuar trabajo independiente y aplicar mejor opción conocida | No interrumpir tareas no bloqueadas |
| PD-011 | Escalamiento | Consultar bloqueos de producto, coste, datos, seguridad, cumplimiento, proveedores y cambios irreversibles | Límites humanos reservados |

## 2. Recomendaciones adoptadas por delegación del propietario

Estas decisiones son la respuesta operativa a las preguntas abiertas del cuestionario. No deben seguir apareciendo como preguntas sin respuesta en documentos derivados; sus reservas se especifican en la sección 3.

| ID | Área | Decisión adoptada | Condición / límite |
|---|---|---|---|
| PD-012 | Segmento inicial | PYMES ecuatorianas de comercio, servicios y negocios que gestionan atención/ventas por canales Meta; incluir agencias que administran varias empresas como segmento secundario de lanzamiento | Hipótesis de enfoque, no estudio de mercado ni TAM verificado. Validar con entrevistas, pilotos y conversión |
| PD-013 | Monetización | Suscripción por tenant + asientos/usuarios + consumo medido por módulo/uso | No fijar precios, mínimos, margen o impuestos hasta unit economics, costes y validación comercial |
| PD-014 | Costes Meta | Mostrar y conciliar cargos Meta separadamente; trasladar al cliente el coste externo real de acuerdo con el contrato/plan, sin mezclarlo con la suscripción | No asumir recargos ni márgenes. Rate cards versionadas, moneda, mercado, vigencia y evidencia de factura |
| PD-015 | Idioma y localización | Español de Ecuador (es-EC), USD y America/Guayaquil como defaults iniciales | Locale, moneda ISO-4217 y zona horaria IANA configurables por tenant; arquitectura internacionalizable |
| PD-016 | Aislamiento | PostgreSQL compartido con tenant_id como default, autorización server-side y Row-Level Security como defensa en profundidad | Enterprise/regulación puede recibir DB/cluster dedicado. RLS no sustituye autorización. No usar jerarquía de tenants como permiso implícito |
| PD-017 | Agencias | Modelo Partner/Agency con relaciones de acceso delegadas y explícitas hacia tenants cliente | Los datos no se comparten por herencia; grants revocables, auditados y limitados por acción/asset |
| PD-018 | Privacidad y retención | Minimización, retención configurable por clase de dato y tenant, exportación, rectificación, supresión y borrado orquestado | No fijar plazos legales por intuición. Revisión con asesoría competente/DPD, LOPDP, transferencias, roles y obligaciones contractuales |
| PD-019 | Mensajería y acciones sensibles | Política por canal, categoría, finalidad, consentimiento, ventana y elegibilidad; chatbot limitado; handoff humano; aprobación humana para campañas, gasto, envíos masivos, borrados irreversibles y cambios de permisos | Default-deny ante ambigüedad. Umbrales monetarios y matriz final de aprobadores configurables antes de producción |
| PD-020 | Integraciones externas | Primero API pública versionada, webhooks firmados y conectores del ecosistema EcuApp cuando exista contrato real | No inventar conectores ni priorizar ERP/pagos concretos sin demanda demostrada; arquitectura ports-and-adapters |
| PD-021 | Infraestructura | VPS/servidor propio con imágenes Docker portables; Compose para desarrollo y piloto controlado; topología multi-nodo para producción con HA | Sin proveedor, tamaño ni gasto comprometidos. Sizing por benchmark; no vender un nodo único como alta disponibilidad |
| PD-022 | Git, releases y producción | Trabajo en environment/local; master y environment/develop permanecen protegidas; ningún agente hace merge a ramas protegidas, publica releases ni despliega a producción sin autorización explícita | También aplica a gasto real, campañas, mensajes masivos y cambios destructivos |
| PD-023 | Estilo de arquitectura | Modular monolith por bounded contexts + procesos API/worker separables desde el mismo código; extraer microservicios solo con evidencia de escala, aislamiento, ownership o ciclo de vida | Evitar distribución prematura; límites modulares, contratos y ownership desde el primer commit |

## 3. Reservas que no se pueden resolver con una decisión técnica

1. **Precios y fiscalidad:** se adopta el modelo de monetización, no una tarifa. Definir planes y precios exige costes reales, entrevistas, disposición a pagar, costes de soporte/infraestructura y revisión tributaria ecuatoriana.
2. **Retención, residencia y LOPDP:** se implementarán controles configurables y minimización desde el diseño. Los plazos concretos, roles responsable/encargado, transferencias, subencargados, avisos y obligaciones deben pasar por revisión legal/DPD antes de tratar datos reales en producción.
3. **Capacidad y coste VPS:** no hay número de tenants, mensajes, concurrencia, presupuesto ni servidor conocido. No inventar CPU/RAM/IOPS ni prometer capacidad. TASK-060 exige pruebas de carga y dimensionamiento.
4. **SLO/RPO/RTO:** quedan definidos objetivos candidatos en docs/13, no un SLA. Se validarán contra arquitectura, redundancia, restore drills y presupuesto.
5. **Permisos Meta:** ningún alcance funcional implica aprobación de App Review, Business Verification, Tech Provider o elegibilidad del tenant. Cada operación exige evidencia actual de scopes, grants, tier, producto, país y cuenta.
6. **Integraciones específicas:** no se compromete un ERP, ecommerce, pasarela o proveedor IA concreto. La selección exige casos de uso, revisión de contrato, coste, seguridad, región y portabilidad.
7. **Acciones productivas:** el consentimiento para planear y documentar no autoriza gasto publicitario, comunicación masiva real, eliminación irreversible, publicación de contenido ni despliegue productivo.

## 4. Interpretación de la aclaración de IA

La frase "pero cob vision para automatizacion con IA" se interpreta, por contexto, como "pero con visión para automatización con IA". La capacidad inicial queda limitada a:
- Automatizaciones por eventos y reglas deterministas.
- Chatbots basados en flujos/intenciones delimitados.
- Sugerencias de respuesta para agentes, editables antes del envío.
- AI Gateway desacoplado de proveedores/modelos.
- Control de datos por tenant, coste, latencia, timeout, presupuesto, evaluación y auditoría.
- Aprobación humana para acciones externas sensibles.

No se asume RAG, voz, entrenamiento propio ni agentes autónomos con permisos de escritura general. Cualquier ampliación debe tener REQ/ADR, evaluación de datos/coste/seguridad y gate específico.

## 5. Reglas derivadas para producto y arquitectura

- SaaS y uso interno comparten codebase y releases; configuración, tenants, límites y datos siguen aislados.
- Agencia y cliente son entidades/relaciones de plataforma, no tenants que comparten datos de forma implícita.
- Suscripción, asientos, uso interno y cargos externos Meta se registran en ledgers separados.
- Contact identities son tenant-scoped y provider-scoped. El teléfono no es la clave universal de una persona/cuenta.
- API pública, webhooks y eventos son contratos versionados; payload nativo Meta se preserva con acceso/retención controlados.
- El backend es autoridad final de tenant, actor, grant, consentimiento, capability y policy.
- Acciones sensibles son denegadas por defecto si falta evidencia o autorización.
- La IA no amplía permisos y sus outputs son contenido no confiable.
- El producto se diseña para escalar, pero no se declaran métricas sin benchmark y evidencia operativa.

## 6. Preguntas originales y estado resultante

| Pregunta | Estado actualizado |
|---|---|
| Q-001 Modelo de negocio | Resuelta por PD-001 |
| Q-002 Segmentos/agencias | Baseline adoptada PD-012; hipótesis de mercado pendiente de validar |
| Q-003 Monetización | Modelo adoptado PD-013/014; precios y fiscalidad pendientes |
| Q-004 Catálogo Meta | Resuelta por PD-003; acceso efectivo externo pendiente |
| Q-005 Secuencia | Resuelta por PD-009 y docs/31 |
| Q-006 Producto | Resuelta por PD-004 |
| Q-007 IA | Resuelta por PD-005 + sección 4 |
| Q-008 Interfaces | Resuelta por PD-006 |
| Q-009 Localización | Baseline adoptada PD-015 |
| Q-010 Código fuente | Resuelta por PD-002 |
| Q-011 Stack | Resuelta por PD-007 y ADR-011..ADR-020 |
| Q-012 Infraestructura | Resuelta como VPS/servidor propio PD-008/021; proveedor/coste pendientes |
| Q-013 Capacidad/SLO/RPO/RTO | Objetivos candidatos documentados; validación pendiente TASK-060 |
| Q-014 Aislamiento/identidad | Baseline adoptada PD-016/017; revisión threat model pendiente |
| Q-015 Retención/LOPDP | Controles adoptados PD-018; plazos/asesoría legal pendientes |
| Q-016 Aprobaciones | Baseline fail-closed adoptada PD-019; thresholds/aprobadores finales pendientes |
| Q-017 Integraciones | Estrategia adoptada PD-020; conectores concretos pendientes |
| Q-018 Producción/App Review | Gates documentados; acceso/aprobación Meta pendiente |
| Q-019 Git/producción | Política adoptada PD-022 |
| Q-020 Autonomía | Resuelta por PD-010/011 |

## 7. Modelo de autonomía de agentes

- Resolver sin preguntar los detalles técnicos reversibles dentro de este baseline.
- Registrar ADR/CR con contexto, evidencia, alternativas, consecuencias, riesgos y reversión.
- Seguir tareas independientes cuando otra área tenga un bloqueo.
- Escalar al propietario decisiones comerciales, compromisos de gasto, retención/legal, transferencias de datos, seguridad crítica, vendor/contratos, breaking changes y acciones productivas.
- No interpretar "toma las mejores decisiones" como permiso para inventar evidencia, omitir gates o aprobarse a sí mismo.
- La aceptación final del producto sigue perteneciendo al propietario.
