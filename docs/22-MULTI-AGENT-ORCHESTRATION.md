# 22 — Orquestación multiagente y trabajo concurrente

## 1. Objetivo
Coordinar varios agentes en paralelo sin duplicar trabajo, pisar cambios, crear conflictos de integración ni multiplicar decisiones contradictorias.

## 2. Modos de operación
1. **Single-agent:** un agente desempeña varios roles de forma secuencial; registra el cambio de rol.
2. **Lead + specialists:** un agente coordinador divide el trabajo y recibe entregables de especialistas.
3. **Parallel workstreams:** varios agentes trabajan en paquetes independientes, con límites de archivos/módulos.
4. **Review-only:** agentes revisores no editan la implementación; producen hallazgos con evidencia.
5. **Incident mode:** un incident commander coordina contención, investigación y recuperación; evita ediciones concurrentes sobre el mismo componente.

## 3. Roles de coordinación
- **Orchestrator / Team Lead:** descompone la petición, asigna owners, define interfaces, bloqueos y orden de integración. No delega responsabilidad final.
- **Workstream Lead:** mantiene un paquete de trabajo acotado y reporta estado.
- **Implementer:** modifica exclusivamente el scope asignado.
- **Reviewer:** inspecciona diff y criterios sin aprobar su propio trabajo.
- **QA Validator:** ejecuta pruebas independientes y registra evidencia.
- **Security/Privacy Validator:** evalúa amenazas y datos según el cambio.
- **Release Coordinator:** reúne gates y prepara recomendación; no acepta por el propietario.

## 4. Protocolo de inicio
1. Orchestrator lee AGENTS.md y documentos requeridos.
2. Captura branch, commit base y estado limpio/sucio del workspace.
3. Clasifica solicitud y define alcance, restricciones, criterios y riesgos.
4. Identifica nodos afectados en grafo y matriz de trazabilidad.
5. Divide el trabajo en paquetes con interfaces y archivos de propiedad explícitos.
6. Asigna un único owner por paquete y un reviewer distinto.
7. Declara dependencias, orden, criterio de integración y pruebas.
8. Registra plan antes de lanzar trabajo concurrente.

## 5. Reglas de paralelismo
**Se puede paralelizar:**
- Investigación de fuentes oficiales vs inspección del código.
- QA exploratorio vs análisis de arquitectura.
- Paquetes de dominios diferentes con contratos acordados.
- Documentación de módulos ya estabilizados vs implementación aislada.
- Auditoría de seguridad read-only vs implementación, siempre que el análisis no exija cambios simultáneos.

**No se debe paralelizar:**
- Dos agentes editando el mismo archivo o conjunto acoplado sin acuerdo explícito.
- Migraciones y cambios de esquema incompatibles.
- Cambios simultáneos a contratos compartidos sin un contract owner.
- Rotación de secretos, despliegues, operaciones destructivas o acciones externas concurrentes.
- Edición de los mismos registros de memoria/backlog sin un único integrador.

## 6. Propiedad de archivos y locks lógicos
Cada work packet declara:
- Paths exclusivos que puede modificar.
- Paths compartidos de solo lectura.
- Interfaces que debe respetar.
- Archivos reservados al integrador.
- Estrategia de integración y conflicto.

El lock es una convención coordinada, no un bloqueo técnico garantizado por Git. Si dos agentes detectan solapamiento, se pausa una rama de trabajo y el Orchestrator reasigna. Nunca resolver conflictos descartando silenciosamente el trabajo de otro agente.

## 7. Contrato de handoff de subagente
Cada agente entrega:
- ID del paquete y rol asumido.
- Branch/commit base y commit final.
- Paths cambiados.
- Decisiones y supuestos (marcados).
- Tests ejecutados con comandos y resultados.
- Hallazgos, riesgos, limitaciones y tareas pendientes.
- Conflictos o archivos no tocados.
- Declaración de qué no verificó.
El Orchestrator no acepta "terminado" sin este paquete.

## 8. Integración
1. Integrador inspecciona commits/diffs y ownership.
2. Integra un paquete cada vez cuando existan solapamientos.
3. Ejecuta contract tests y pruebas de integración entre paquetes.
4. Revisa compatibilidad, migraciones, seguridad y documentación.
5. Ejecuta suite relevante tras la integración; pruebas de cada subagente no sustituyen las pruebas integradas.
6. Registra commit resultante, evidencia y tareas que cambian de estado.

## 9. Límites de concurrencia
El número de agentes simultáneos se decide por independencia real de tareas, capacidad de revisión y riesgo de integración; no por maximizar agentes. Si no hay coordinación, contratos o workspaces aislados, usar ejecución secuencial.
No compartir tokens, cookies, credenciales ni sesiones personales entre agentes. Usar secretos administrados por el entorno con permisos mínimos.

## 10. Escalamiento
Escalar al Product Owner si la decisión cambia alcance, precio/monetización, prioridad, promesa comercial, tratamiento de datos, gasto, riesgo legal, proveedor, SLA o aceptación. Escalar al Architect si afecta límites de dominio o contratos. Escalar a Security/Privacy si modifica trust boundaries, permisos o datos personales.
