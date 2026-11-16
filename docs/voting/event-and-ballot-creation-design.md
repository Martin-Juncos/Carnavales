# Diseño: creación de eventos y planillas de jurado

**Estado:** propuesta funcional para revisión; no autoriza implementación ni migraciones.
**Alcance:** definir el flujo administrativo para configurar una edición y generar las planillas de sus jurados.
**Fuera de alcance:** código, estructura física de base de datos, escala definitiva de puntajes y reglas oficiales de desempate.

## Decisión principal

El administrador configura una edición una sola vez. Desde esa configuración se generan las planillas de los jurados; no se mantienen planillas independientes que puedan divergir del evento.

La edición contiene comparsas, participantes, pasadas, competencias, rubros y asignaciones de jurado. El orden de pasada es único para toda la edición. Una persona puede tener varias pasadas, cada una en su posición correspondiente.

## Qué aportan las referencias

| Referencia | Uso en el diseño | Observación |
|---|---|---|
| `Planilla_Puntaje Modelo2026.xlsx` | Modelo de planillas por especialidad: Vestuario, Puesta en escena y Coreografía, y Batería. Sus rubros sirven como referencia para configurar las planillas. | Contiene ejemplos y rubros de muestra; no define una escala completa de puntajes ni debe copiarse como reglamento fijo. |
| `ITA Vera - copia - Hojas de cálculo de Google.pdf` | Ejemplo de padrón de una edición: comparsa, bloques, participantes, representaciones, competencias y pasadas. | Es información concreta de ITA Vera 2026, no una plantilla universal. La Reina aparece en más de una pasada; la segunda indica que su puntaje final se registra en la primera hoja. |

Los archivos no tienen exactamente el mismo contenido: el Excel incluye ejemplos de PORAMBA y categorías de evaluación, mientras que el PDF describe ITA Vera 2026. Por eso, la carga debe producir un borrador revisable; no se deben combinar nombres o rubros automáticamente sin confirmación.

## Modelo funcional

| Concepto | Responsabilidad |
|---|---|
| Edición | Contenedor de la configuración del evento y de su versión publicada. |
| Comparsa | Agrupación que participa en la edición. |
| Participante | Persona identificada una sola vez dentro del evento. |
| Pasada | Aparición de una persona, grupo u otro elemento en el desfile. Tiene orden, descripción y vínculos propios. No es una copia del participante. |
| Competencia y rubro | Definen qué se evalúa, sobre qué objetivo y con qué criterio. |
| Aplicabilidad | Indica explícitamente si un elemento se evalúa en un rubro. Un elemento no evaluable puede quedar visible como referencia, pero no recibe puntaje. |
| Especialidad de jurado | Agrupa los rubros que corresponden a una planilla, siguiendo el patrón del Excel. |
| Planilla generada | Vista de captura creada desde la edición publicada y la asignación del jurado. |

### Pasadas repetidas y puntaje

Una misma persona puede tener más de una pasada. Por ejemplo, la Reina puede aparecer con distintos trajes en momentos diferentes. Cada aparición ocupa una posición independiente en el orden, pero sigue vinculada a la misma persona.

La aparición no crea automáticamente un puntaje nuevo. Cada rubro debe indicar a qué persona, grupo o pasada corresponde el puntaje. Esto permite que una pasada aporte a una evaluación cuyo resultado se registra en otro lugar, como sugiere el PDF para el puntaje final de la Reina. La regla concreta de acumulación o evaluación debe configurarse explícitamente; no se deduce solo por repetirse una persona.

### Elementos no evaluables

Las filas grises de las referencias representan elementos que no reciben evaluación. Se conservan visibles en gris como contexto, sin campo de puntaje. La condición “no evaluable” se guarda como dato explícito: el color solo la representa y no es la regla de negocio.

Un elemento no evaluable:

- no admite puntaje;
- no cuenta como puntaje faltante al completar o cerrar una planilla;
- no participa del cálculo de resultados.

## Flujo de creación

1. **Crear la edición.** El administrador indica nombre, año y datos básicos del evento.
2. **Cargar el padrón.** Carga o ingresa comparsas, participantes, grupos y elementos del desfile. Los datos provenientes de archivos quedan en borrador para su revisión y corrección.
3. **Definir las pasadas.** Agrega cada aparición por separado y asigna el orden de toda la edición. Una persona puede figurar en varias pasadas sin duplicar su identidad.
4. **Configurar competencias y rubros.** Define premios, criterios, especialidad responsable, objetivo evaluado y escala de puntaje. Marca expresamente cada elemento no evaluable.
5. **Vincular pasadas y evaluaciones.** Para cada rubro indica qué participante, grupo o pasada se evalúa y dónde se registra el puntaje. Las repeticiones no duplican puntajes por defecto.
6. **Asignar jurados.** Asocia jurados a especialidades y rubros. El contenido de cada planilla se deriva de esa asignación.
7. **Revisar la vista previa.** El administrador comprueba el orden, las apariciones repetidas, los rubros, las filas grises y los campos de puntaje de cada tipo de planilla.
8. **Validar y publicar.** El sistema señala inconsistencias; al resolverlas, el administrador publica la edición. La configuración publicada se conserva como versión para que cambios posteriores no alteren planillas o votos ya creados.

## Pantallas propuestas

### Administrador

Un asistente de creación con pasos visibles y posibilidad de volver a pasos anteriores antes de publicar:

1. **Datos de la edición**
2. **Comparsas y participantes**
3. **Orden de pasadas**
4. **Competencias, rubros y escalas**
5. **Jurados y asignaciones**
6. **Vista previa y publicación**

La vista de orden presenta una lista numerada por pasada, no una lista plana de personas. Debe permitir reconocer que dos apariciones pertenecen a la misma persona.

### Jurado

La planilla generada muestra únicamente los rubros asignados a la especialidad del jurado. Presenta las pasadas en el orden de la edición y los datos necesarios para identificar cada evaluación. Las filas no evaluables permanecen grises, solo como referencia, y no muestran controles de puntuación.

## Validaciones antes de publicar

- Cada pasada tiene posición y pertenece a una comparsa o sección válida.
- Se permiten varias pasadas de una misma persona; no se consideran duplicados inválidos.
- Cada rubro evaluable tiene objetivo, escala y especialidad de jurado.
- Cada rubro indica con claridad qué pasadas o participantes alimentan su evaluación.
- Los elementos marcados no evaluables no tienen puntajes ni controles de captura.
- Cada especialidad con rubros evaluables tiene al menos un jurado asignado.
- La vista previa permite verificar que el orden y los vínculos de evaluación coinciden con el padrón.

La publicación debe bloquearse ante errores que puedan generar una planilla ambigua o una evaluación sin responsable. Las advertencias informativas deben distinguirse de los errores bloqueantes.

## Decisiones pendientes antes de implementar

1. Definir las escalas y límites de puntaje de cada rubro; las referencias no bastan para fijarlos.
2. Definir cómo se obtiene el puntaje final cuando varias pasadas aportan a una misma evaluación. El PDF da un ejemplo de referencia, pero no determina la fórmula.
3. Confirmar si los archivos se importarán automáticamente o si se usarán solo como fuente para carga manual asistida. El PDF tiene una disposición visual que requiere revisión humana.
4. Confirmar si el evento tendrá más de una noche y, de ser así, cómo se relacionan las planillas con cada noche. Este diseño fija por ahora un solo orden por edición.
5. Aprobar las reglas de envío, visibilidad de puntajes, correcciones excepcionales y cierre antes de implementar el flujo de votación.

## Criterio de aceptación del diseño

- Una edición puede configurarse sin depender de una planilla externa como fuente editable permanente.
- Cada planilla se genera desde la configuración publicada y la asignación del jurado.
- Una persona con varias apariciones conserva una sola identidad y varias pasadas ordenadas.
- Los elementos no evaluables se distinguen visualmente y no pueden recibir puntaje.
- Las relaciones entre pasadas, rubros y puntajes son explícitas y revisables antes de publicar.
- La escala y las reglas de consolidación no se inventan cuando las referencias no las especifican.
