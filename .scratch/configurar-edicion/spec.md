# Especificación: configurar una edición hasta abrir la primera noche

**Estado:** `ready-for-agent` para revisión y descomposición. Los comportamientos que dependan de decisiones pendientes no pueden implementarse hasta resolver sus bloqueos.

## Problema

Hoy el Administrador puede crear una edición vacía, pero no completar desde la aplicación la configuración necesaria para prepararla y operar sus noches. La creación inicial deja la edición en `CONFIGURING` y crea una versión del reglamento en `BORRADOR`; todavía no existe el flujo administrativo que lleva desde ese punto hasta la apertura de la primera noche.

## Solución

Proveer un flujo administrativo para configurar una edición en borrador, revisar errores y advertencias, publicar una versión del reglamento y abrir la edición y sus noches. La configuración debe conservar versiones y evidencia, y bloquear cualquier paso que dependa de una regla de negocio todavía no aprobada.

El flujo propuesto permite avanzar y volver entre pasos de configuración. Publicar una versión y abrir una edición o noche son acciones sensibles que requieren confirmación explícita.

## Historias de usuario

1. Como Administrador, quiero consultar todos los pasos de configuración y su estado, para saber qué falta antes de operar una edición.
2. Como Administrador, quiero avanzar y volver entre pasos sin perder lo ya cargado, para completar la edición en el orden que me resulte práctico.
3. Como Administrador, quiero editar una versión de reglamento en borrador, para mantener los cambios separados de una versión publicada o congelada.
4. Como Administrador, quiero configurar las noches de la edición, su orden y si participan del cómputo, para representar el calendario competitivo.
5. Como Administrador, quiero configurar especialidades y los rubros que evalúa cada una, para generar planillas correspondientes a las asignaciones de jurados.
6. Como Administrador, quiero definir escalas por rubro, para que cada puntuación se valide contra la versión del reglamento aplicable.
7. Como Administrador, quiero elegir únicamente reglas de cálculo admitidas por el sistema, para evitar ejecutar fórmulas arbitrarias ingresadas como texto.
8. Como Administrador, quiero configurar premios individuales o grupales, para registrar las modalidades previstas en la edición.
9. Como Administrador, quiero cargar comparsas, participantes y sujetos evaluables, para representar quién o qué puede recibir una puntuación.
10. Como Administrador, quiero revisar los datos importados antes de guardarlos, para corregir errores sin persistir una carga no validada.
11. Como Administrador, quiero establecer el orden de presentación de comparsas y pasadas por noche, para que la operación refleje el programa del desfile.
12. Como Administrador, quiero generar las filas de planilla a partir de rubros, sujetos evaluables y especialidades, para evitar crear manualmente todas las combinaciones.
13. Como Administrador, quiero regenerar solo las filas afectadas por cambios en borrador, conservando las excepciones manuales, para actualizar la planilla sin perder ajustes válidos.
14. Como Administrador, quiero previsualizar las planillas sin campos de puntuación activos, para revisar su contenido antes de publicar.
15. Como Administrador, quiero ver errores bloqueantes y advertencias por separado, con acceso al paso que los origina, para corregir lo necesario sin confundirlo con recomendaciones.
16. Como Administrador, quiero publicar una versión solo cuando no tenga errores bloqueantes y después de confirmar el resumen, para dejar claro qué configuración será operativa.
17. Como Administrador, quiero abrir una edición mediante una acción confirmada, auditada e idempotente, para habilitar su operación sin congelar prematuramente el reglamento.
18. Como Administrador, quiero abrir la primera noche solo cuando se cumplan sus requisitos, para congelar el reglamento y el padrón en el momento definido.
19. Como Administrador, quiero crear noches posteriores en estado `DRAFT` mientras la edición esté abierta, para preparar jornadas futuras sin alterar las noches abiertas.
20. Como Administrador, quiero que los datos con historial no puedan borrarse físicamente, para preservar la evidencia de la competencia.

## Decisiones de implementación

- La API es la autoridad funcional; PostgreSQL es la autoridad final de integridad persistida.
- Toda operación administrativa requiere sesión autenticada y rol `ADMINISTRADOR`. La identidad y permisos se derivan de la sesión, no de campos enviados por el cliente.
- La configuración del reglamento se versiona. Una edición nueva comienza con una versión `BORRADOR`; publicar una nueva versión no modifica votos ni resultados históricos.
- Abrir la edición no congela por sí solo el reglamento ni el padrón. La congelación ocurre al abrir la primera noche, conforme a la regla documentada para el proyecto.
- Una versión publicada no se edita. Los cambios previos a la primera noche se realizan en una nueva versión; después de abrir la primera noche no se permiten cambios ordinarios al reglamento.
- Las noches nuevas pueden prepararse en estado `DRAFT` aunque la edición esté `OPEN`. Las asignaciones nuevas para una noche competitiva solo se admiten mientras esa noche permanezca en `DRAFT`.
- Las filas de planilla se derivan de la configuración publicada y de las asignaciones activas. Una fila no evaluable se conserva como referencia, pero no requiere puntaje ni cuenta como faltante.
- Las puntuaciones 2027 válidas son `1` a `5`; `0` representa únicamente `No se presentó`. La escala y el valor especial no se deben reinterpretar como una escala ordinaria.
- Toda acción administrativa sensible de modificación, borrado, publicación, apertura o guardado de orden requiere confirmación explícita en la interfaz antes de llamar a la API.
- Los registros con dependencias históricas no se borran en cascada. Las operaciones de apertura deben ser auditables e idempotentes.
- La configuración inicial de la edición vacía ya está cubierta por una especificación separada. Este alcance empieza después de esa creación.
- Las propuestas de experiencia descritas en la documentación —por ejemplo, guardado automático al salir de cada campo, importación y sugerencias de calendario— deben tratarse como propuestas hasta que se validen; no se convierten aquí en reglas de negocio aprobadas.

## Decisiones de pruebas

- La prueba principal debe recorrer el flujo administrativo observable desde la interfaz, pasando por la API real y PostgreSQL. Evitar pruebas que dependan de detalles internos de componentes o consultas.
- Verificar creación y edición de configuración en borrador, estados visibles, validaciones y persistencia.
- Verificar que el rol incorrecto no puede acceder a las operaciones administrativas.
- Verificar que publicar u abrir con errores bloqueantes no cambia el estado persistido.
- Verificar atomicidad e idempotencia de publicación y apertura, incluidos reintentos equivalentes y fallas a mitad de operación.
- Verificar que la primera apertura de noche congela la versión y el padrón, mientras que abrir la edición por sí solo no lo hace.
- Verificar que no se puede modificar una versión publicada o congelada mediante operaciones ordinarias.
- Verificar que la regeneración de filas no elimina excepciones manuales y que las filas no evaluables no se cuentan como puntuaciones faltantes.
- Verificar que una eliminación con historial es rechazada y preserva los registros relacionados.
- Para la importación, probar tanto la revisión previa como el resultado guardado una vez que se apruebe el formato.
- Como antecedentes existen pruebas de rutas administrativas de API, flujos del cliente, invitaciones, ediciones y migraciones.

## Fuera de alcance

- Captura de votos por jurados, planillas firmadas y sincronización offline.
- Reintentos automáticos de sincronización, resolución de conflictos offline y manejo de dispositivos perdidos.
- Cierre de planillas, noches y votación completa.
- Registro y autorización digital de penalizaciones.
- Cálculo y publicación de resultados, desempates, impugnaciones y votos fuera de término.
- Generación, impresión y conservación de actas o planillas oficiales.
- Definir una política de retención legal o eliminación de evidencia.

## Notas adicionales

La documentación funcional del flujo de creación es una propuesta y el diseño físico del agregado de edición es un borrador que no autoriza migraciones. Antes de implementar cada paso, revisar que sus reglas estén aprobadas y que el diseño físico aplicable haya sido aprobado. No asumir que un documento de reglamento usado como referencia provisional constituye la aprobación de todas sus cláusulas.

### Bloqueos que deben resolverse antes de implementar las partes afectadas

- Confirmar cuál reglamento y edición son la fuente normativa de 2027; los documentos disponibles no coinciden en el año y uno es provisional.
- Confirmar las especialidades 2027 y su relación con las juradurías del modelo de planilla.
- Confirmar tipos de noche, calendario y cantidad exacta de noches; para 2027 se indicó que se puntúan las tres primeras noches oficiales, pero el calendario exacto sigue pendiente.
- Confirmar el catálogo de tipos de rubro y las fórmulas del resultado general, incluida la decisión D24. Esto bloquea las reglas de cálculo y el catálogo relacionado.
- Definir el formato de importación y quién valida sus datos antes de publicarlos.
- Definir el tratamiento de pasadas repetidas cuando afecten la puntuación individual.
- Definir el efecto de enmiendas posteriores a la publicación o a la emisión de votos.
- Integrar el flujo de asignaciones de jurados antes de habilitar la apertura de una noche.
- No implementar desempates, impugnaciones, votos fuera de término ni excepciones no documentadas.
