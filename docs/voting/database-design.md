# Diseño de la base de datos de votación

**Estado:** Borrador para revisión; no define ni aplica migraciones.  
**Propósito:** Modelar las reglas por edición, los votos digitales y los resultados, conservando el secreto del voto y permitiendo operar sin conexión.  
**Referencias:** Reglamento de Goya 2025 y el proyecto `Carnavales2027`, usados como referencias que deben adaptarse, no copiarse sin cambios.

## Decisiones confirmadas

| Área | Decisión |
|---|---|
| Reglas | Cada edición tiene reglas versionadas y configurables por el administrador desde la aplicación. La configuración se limita a opciones de cálculo admitidas; una fórmula nueva requiere desarrollo. |
| Publicación | El administrador puede configurar, aprobar y publicar las reglas. La versión vigente se congela al abrir la inscripción. Los cambios posteriores quedan registrados como enmiendas o versiones; nunca modifican silenciosamente los votos históricos. |
| Alcance de evaluación | El modelo debe admitir los 33 rubros del reglamento, premios individuales y grupales, y el resultado general por comparsa. |
| Unidad de voto | Una planilla completa por jurado y por noche, de acuerdo con las asignaciones del jurado. |
| Envío | Antes del envío se pide confirmación. Una vez confirmado, el voto es final: no se edita ni se reabre. |
| Secreto | Después de enviar, el jurado ve estados de finalización, no sus puntajes. Antes del cierre, el administrador también ve solo estados, no valores. |
| Operación offline | El jurado puede completar y confirmar su voto sin internet. El dispositivo lo conserva hasta sincronizarlo. |
| Cierre | No se cierra la votación ni se publican resultados hasta que todas las planillas asignadas hayan sido recibidas por el servidor. La hora local de un dispositivo no demuestra por sí sola que un voto llegó antes del cierre. |
| Resultados | Los resultados se calculan con la versión de reglas correspondiente. No se inventa un desempate: la resolución oficial debe quedar registrada antes de publicar el resultado. |

## Límites del diseño

Este documento propone el modelo conceptual y sus invariantes; no es DDL ejecutable ni una autorización para crear migraciones.

La planilla imprimible sigue siendo un requisito del producto y debe derivarse del mismo voto digital. La decisión sobre cuándo el jurado puede abrir o imprimir el PDF —en particular, cómo evitar que vea los puntajes después de enviar— se deja para un feature posterior. Este documento no afirma que una huella digital demuestre quién creó un archivo o que no se modificó antes de sincronizarlo.

## Modelo conceptual

Los nombres siguientes son nombres conceptuales; los nombres físicos y tipos se decidirán al aprobar el diseño detallado de migraciones. El proyecto usa PostgreSQL y nombres de tablas y columnas en español.

### Ediciones y reglamentos

| Entidad | Responsabilidad y relaciones |
|---|---|
| `edicion` | Identifica cada edición del carnaval y su estado operativo. |
| `version_reglamento` | Pertenece a una edición. Guarda número de versión, estado, fuente, autoría y fechas de aprobación/publicación/congelamiento. Los votos y resultados apuntan a una versión concreta. |
| `rubro_version` | Define, dentro de una versión, cada rubro evaluable y su tipo de objetivo: comparsa, participante individual u otro objetivo admitido. |
| `escala_puntaje_version` | Define valores o límites permitidos para cada rubro. No fija una escala global permanente. |
| `regla_calculo_version` | Selecciona un algoritmo admitido y sus parámetros validados. No ejecuta fórmulas arbitrarias ingresadas por el administrador. |
| `premio_version` | Define premios individuales o grupales y su modalidad de evaluación dentro de la versión. |
| `noche_edicion` | Registra cada noche de una edición y si participa del cómputo según la versión publicada. No se fija un número de noches en el código del modelo. |
| `enmienda_reglamento` | Registra cambios posteriores con versión de origen, contenido del cambio, motivo, responsable y fecha. No reescribe la versión congelada ni los votos existentes. |

Una nueva versión copia la configuración anterior como borrador editable. Publicar o congelar una versión no cambia las filas de votos ni los resultados ya calculados. Si una enmienda afecta una competencia en curso, su alcance y vigencia deben quedar explícitos; el sistema no debe aplicarla retroactivamente de forma implícita.

### Participantes, jurados y asignaciones

| Entidad | Responsabilidad y relaciones |
|---|---|
| `comparsa` | Identidad estable de una comparsa. |
| `participante` | Identidad estable de una persona que puede competir por premios individuales. |
| `inscripcion_competencia` | Vincula una edición con una comparsa o participante evaluable. Permite que las puntuaciones referencien un objetivo de competencia sin duplicar el modelo de planillas. |
| `perfil_jurado` | Vincula un usuario existente con sus datos de jurado. Complementa el rol de autenticación; no reemplaza la identidad de acceso. |
| `asignacion_jurado` | Determina qué jurado evalúa qué rubros u objetivos en qué noche. Es la base para crear planillas esperadas y comprobar el cierre. |
| `dispositivo_jurado` | Opcionalmente identifica el dispositivo autorizado para el trabajo offline y su vínculo con una asignación. Los mecanismos de enrolamiento y recuperación del dispositivo requieren diseño técnico posterior. |

Las relaciones con usuarios no deben borrar en cascada votos, asignaciones ni resultados históricos. La política de eliminación de cuentas de autenticación debe revisarse antes de implementar esas claves foráneas para preservar la trazabilidad de votos ya emitidos.

### Planillas, puntajes y sincronización

| Entidad | Responsabilidad y restricciones conceptuales |
|---|---|
| `planilla` | Una planilla por jurado, edición y noche. Guarda la asignación y versión de reglamento aplicables, estado de recepción y fechas del servidor. Una restricción única impide una segunda planilla para esa misma combinación. |
| `puntaje_planilla` | Un valor por planilla, rubro y objetivo evaluado. La combinación debe ser única; los valores deben cumplir la escala de la versión de reglas asociada. |
| `operacion_sincronizacion` | Registra el identificador idempotente del envío, el hash del contenido recibido, la fecha del servidor y el acuse devuelto al dispositivo. Repetir el mismo envío no crea otra planilla ni altera la existente. |
| `auditoria_votacion` | Registra eventos relevantes —confirmación local declarada, recepción del servidor, rechazo por conflicto y cierre— con actor, fecha del servidor y referencia a la entidad afectada. No almacena una segunda copia editable de los puntajes. |

En el dispositivo, el voto confirmado queda bloqueado y en estado pendiente de sincronización. Ese estado local no equivale a recepción oficial del servidor. Al sincronizar, el servidor valida edición, asignación, versión, integridad e identificador idempotente y registra la planilla y sus puntajes en una transacción. Un conflicto se rechaza y se audita; nunca sobrescribe otro voto.

La respuesta de sincronización incluye un acuse persistible por el dispositivo. El cierre comprueba que todas las planillas esperadas estén recibidas y que no queden asignaciones pendientes. Si falta un dispositivo o no puede sincronizarse, el cierre permanece bloqueado; el procedimiento de excepción no está definido en este diseño.

### Archivos imprimibles

El archivo imprimible debe corresponder al mismo contenido confirmado de la planilla, no a una transcripción separada. La base guardaría metadatos del archivo —identificador, tipo, referencia de almacenamiento, huella criptográfica y vínculo al voto—; el binario se conservaría en almacenamiento de archivos, no como contenido principal de una fila relacional.

La generación offline, el control de acceso al PDF, la impresión y su sincronización se implementarán como un feature posterior. La huella detecta cambios en el archivo comparado con la huella registrada, pero no prueba por sí sola la autenticidad del origen ni el estado del archivo antes de su primera sincronización.

### Resultados y publicación

| Entidad | Responsabilidad |
|---|---|
| `resultado_calculado` | Snapshot inmutable de resultados generado desde los votos recibidos, la versión de reglamento y el algoritmo admitido. Conserva identificadores de entrada y fecha de cálculo. |
| `resultado_rubro` | Resultado por rubro y objetivo evaluado, vinculado al snapshot. |
| `penalidad` | Registra penalidades separadas del puntaje artístico, con motivo, importe o efecto y evidencia pertinente. |
| `resolucion_empate` | Registra la resolución oficial, responsable, motivo y fecha; no crea un criterio automático no previsto por el reglamento. |
| `publicacion_resultado` | Registra qué snapshot fue publicado, por quién y cuándo. Solo puede apuntar a un cálculo completo y a empates resueltos oficialmente. |

Un recálculo crea otro snapshot; no modifica uno publicado. La publicación requiere que la votación esté cerrada, todas las planillas esperadas estén sincronizadas y las resoluciones de empate estén registradas.

## Acceso y protección del secreto

- La interfaz muestra al jurado solo el estado de sus rubros y de su planilla enviada; la API no debe devolverle los puntajes después de la confirmación.
- Antes del cierre, la API no devuelve puntajes al administrador. El estado de recepción puede mostrarse por separado.
- Los servicios de cálculo acceden a los puntajes solo en el flujo de cierre y resultados autorizado. Ocultar números en la interfaz no reemplaza la autorización de la API.
- Los votos confirmados no se borran ni se editan mediante las rutas ordinarias. Correcciones por fallas excepcionales requieren una política separada; no se asume reapertura.
- El almacenamiento offline debe proteger datos locales frente al acceso casual o a la pérdida del dispositivo. El alcance de cifrado, gestión de claves y recuperación se especificará en el diseño del cliente.

## Diferencias con `Carnavales2027`

Se toman como referencias sus patrones de planillas vinculadas a jurado/noche, puntajes separados, restricciones relacionales, auditoría y snapshots de resultados.

No se copia sin adaptar:

- La escala de puntuación de esa aplicación; las escalas deben provenir de la versión de reglas de cada edición.
- La visualización de valores numéricos al jurado después del envío.
- La falta de un mecanismo confirmado de versionado del reglamento por edición.
- La falta de evidencia confirmada de generación y archivo de PDF imprimible.

La referencia es solo de lectura: no se modifican sus tablas ni su flujo.

## Criterios para aprobar el diseño

- [ ] Las reglas de una edición se versionan y congelan sin alterar votos históricos.
- [ ] El modelo admite rubros, premios individuales y grupales y resultado general por comparsa.
- [ ] Las noches puntuables son configurables por edición.
- [ ] Cada planilla pertenece a una asignación, una noche y una versión de reglas identificables.
- [ ] El envío final es idempotente y no admite sobrescritura ni reapertura ordinaria.
- [ ] El cierre bloquea resultados mientras haya planillas esperadas sin sincronizar.
- [ ] Jurado y administrador no reciben puntajes antes del cierre.
- [ ] Los resultados conservan el snapshot de cálculo y la resolución oficial de empates.
- [ ] El acceso al PDF y la impresión se tratan como un feature posterior, porque su política de visibilidad debe resolverse sin filtrar puntajes.

## Pendientes antes de migraciones

1. Revisar y aprobar este diseño.
2. Definir el tratamiento de enmiendas que afecten una edición con votos ya emitidos.
3. Definir la política excepcional para un dispositivo perdido o irrecuperable, dado que el cierre requiere que todas las planillas se sincronicen.
4. Resolver en un feature separado cuándo se puede abrir, guardar y imprimir la planilla PDF sin exponer puntajes antes del cierre.
5. Especificar las restricciones PostgreSQL, índices, claves foráneas, retención y pruebas antes de escribir migraciones.
