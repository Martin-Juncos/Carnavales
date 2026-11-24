# Plan por etapas: diseño de la base de datos del evento

**Estado:** plan de trabajo; no aprueba reglas funcionales ni autoriza migraciones.

## Objetivo y alcance

Diseñar de forma revisable los datos necesarios para configurar una edición del
carnaval y preparar su operación. El diseño debe preservar la configuración
publicada y dejar claros los límites con autenticación, votación y resultados.

El trabajo se documentará primero a nivel funcional y conceptual. No se crearán
DDL ni migraciones hasta aprobar las reglas y el diseño detallado que afecten al
esquema.

El alcance inicial contempla:

- edición y sus noches;
- comparsas inscritas en una edición;
- participantes, grupos y demás objetivos evaluables;
- pasadas y orden del desfile;
- competencias, premios, rubros, especialidades y escalas;
- aplicabilidad de rubros a objetivos;
- asignaciones de jurados y el vínculo con las planillas esperadas.

Las planillas, puntuaciones, sincronización offline, penalizaciones, cierres,
resultados y actas se documentarán como límites e integraciones con el modelo
del evento. Su esquema detallado podrá requerir etapas o aprobaciones propias.

## Etapas

### 1. Inventario de decisiones y fuentes

**Trabajo**

- Revisar `AGENTS.md`, los diseños de votación y las respuestas registradas en
  `decision-questions.md`.
- Separar reglas confirmadas, provisionales, pendientes y detalles técnicos.
- Identificar qué decisiones afectan directamente al modelo del evento y cuáles
  pueden quedar desacopladas por ahora.

**Entregable:** matriz de decisiones con fuente, estado, impacto en datos y
responsable de aprobación.

**Gate:** ninguna regla inferida se incorpora como aprobada.

### 2. Definición del límite del modelo

**Trabajo**

- Precisar qué significa edición, jornada competitiva y noche en el sistema.
- Definir qué información es propia de una edición y qué identidad puede
  reutilizarse entre ediciones.
- Establecer el límite entre configuración del evento y datos de autenticación.
- Registrar las integraciones previstas con asignaciones, planillas y resultados.

**Entregable:** glosario y diagrama de contexto del dominio.

**Gate:** acordar nombres y responsabilidades antes de enumerar tablas.

### 3. Modelo conceptual de entidades y relaciones

**Trabajo**

- Documentar entidades, relaciones, cardinalidades e identidad histórica.
- Modelar participantes y pasadas sin duplicar la identidad de una persona.
- Representar rubros, objetivos evaluables, especialidades y aplicabilidad de
  forma explícita.
- Explicar cómo se identifica la configuración que origina una planilla esperada.

**Entregable:** ERD conceptual y catálogo de entidades con propósito y
relaciones.

**Gate:** comprobar que los escenarios de alta, edición, publicación y consulta
puedan representarse sin relaciones ambiguas.

### 4. Ciclo de vida y versionado de la configuración

**Trabajo**

- Describir estados y transiciones de edición, jornada y configuración.
- Especificar qué se puede cambiar en borrador y qué queda congelado al abrir la
  jornada.
- Definir cómo conservar versiones y referencias históricas sin reescribir datos
  que ya hayan originado planillas o votos.
- Distinguir publicar, abrir y cerrar; no tratarlos como sinónimos.

**Entregable:** diagramas de estados y reglas de modificación por estado.

**Gate:** validar que el ciclo respete las restricciones confirmadas en
`AGENTS.md`; marcar como bloqueada cualquier excepción no definida.

### 5. Integridad, permisos y trazabilidad

**Trabajo**

- Proponer restricciones de unicidad, obligatoriedad y pertenencia entre edición,
  noche, comparsa, rubro y asignación.
- Documentar qué eliminaciones deben bloquearse cuando exista historial.
- Identificar acciones administrativas sensibles y evidencia de auditoría
  necesaria.
- Revisar el efecto de eliminar o modificar usuarios sobre asignaciones
  históricas.

**Entregable:** catálogo de invariantes y matriz de operaciones, permisos,
restricciones y auditoría.

**Gate:** no depender únicamente del frontend para preservar integridad.

### 6. Casos de uso y validación del modelo

**Trabajo**

- Recorrer escenarios: edición con varias noches, comparsa con varias pasadas,
  objetivo no evaluable, rubro sin asignación, cambio de configuración y
  preparación de planillas esperadas.
- Escribir ejemplos de datos válidos e inválidos.
- Verificar que el modelo no fuerce decisiones pendientes sobre cómputos o
  reglamento.

**Entregable:** escenarios de aceptación y lista de preguntas o defectos del
modelo.

**Gate:** cada invariante relevante debe tener al menos un escenario que la
compruebe.

### 7. Revisión y aprobación funcional

**Trabajo**

- Revisar el modelo con las personas responsables del concurso y de la
  operación.
- Resolver o aislar formalmente las decisiones pendientes que afectan el
  esquema.
- Registrar cambios, decisiones y responsables sin borrar el historial de
  decisiones.

**Entregable:** diseño conceptual aprobado o lista explícita de bloqueos.

**Gate:** no avanzar a migraciones si hay ambigüedades que puedan alterar la
configuración publicada, la evidencia o los votos.

### 8. Diseño lógico y preparación de implementación

Esta etapa comienza solo después de la aprobación funcional.

**Trabajo**

- Traducir el modelo conceptual a tablas PostgreSQL, nombres físicos, tipos,
  claves, índices y restricciones.
- Definir estrategia de migración, orden de despliegue y compatibilidad con las
  tablas existentes de autenticación.
- Diseñar pruebas de restricciones, concurrencia, permisos e historial.
- Actualizar la documentación de API si el contrato cambia.

**Entregable:** diseño lógico revisable y propuesta de migraciones con pruebas.

**Gate:** aprobación explícita antes de ejecutar o aplicar migraciones.

## Decisiones conocidas que deben permanecer visibles

El diseño no resolverá silenciosamente estas preguntas documentadas:

- calendario y cantidad definitiva de noches de 2027;
- fórmula de resultado general de comparsas (D24);
- consolidación de resultados cuando hay varias pasadas;
- desempates, impugnaciones y votos fuera de término;
- política de retención de votos, auditoría y documentos;
- excepciones de sincronización y flujo digital de penalizaciones.

Consultar el estado actualizado de cada punto en
[`decision-questions.md`](decision-questions.md). Que una pregunta no afecte una
entidad inicial no la convierte en una decisión resuelta.

## Criterios de finalización del diseño conceptual

- [ ] El alcance y sus límites están documentados.
- [ ] Cada entidad y relación tiene una definición funcional.
- [ ] Las versiones y estados explican cuándo se puede modificar la configuración.
- [ ] Las reglas de integridad y trazabilidad están identificadas.
- [ ] Los escenarios principales se pueden representar sin reglas inventadas.
- [ ] Las decisiones pendientes que impactan el modelo están resueltas o figuran
  como bloqueos explícitos.
- [ ] La revisión funcional queda registrada antes del diseño lógico y las
  migraciones.
