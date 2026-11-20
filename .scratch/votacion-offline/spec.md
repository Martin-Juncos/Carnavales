# Especificación: planilla de jurado y recepción offline

**Estado actual:** confirmación local y recepción idempotente implementadas.
La excepción para un dispositivo que no puede sincronizar sigue sin aprobarse.
Consulta la [API del Jurado](../../docs/voting/jurado-api.md) y la
[guía de uso](../../docs/user-guide.md). El problema descrito abajo es histórico.

## Problema

El sistema aún no permite que un Jurado complete y confirme una planilla durante una noche competitiva, especialmente cuando el dispositivo pierde conectividad. Una confirmación local debe preservar el voto y no puede confundirse con su recepción oficial por el servidor.

## Solución

Proveer una PWA para Jurados que cargue las planillas esperadas según sus asignaciones activas, permita completar y confirmar una planilla en el dispositivo sin conexión y sincronice esa operación de forma idempotente cuando haya conexión. La API valida la operación y es la única autoridad que determina si el voto fue recibido oficialmente.

## Historias de usuario

1. Como Jurado, quiero seleccionar una noche competitiva y una especialidad para las que tenga una asignación activa, para trabajar únicamente en las planillas que me corresponden.
2. Como Jurado, quiero que la API valide la asignación activa, la existencia de la noche y la pertenencia de la comparsa a esa noche, para evitar aceptar puntajes fuera de mi contexto.
3. Como Jurado, quiero ver las comparsas activas de la noche elegida, para completar la evaluación correspondiente.
4. Como Jurado, quiero recibir la planilla generada para mi asignación, noche y especialidad, para puntuar los rubros y sujetos que me corresponden.
5. Como Jurado, quiero distinguir filas evaluables y no evaluables, para no tratar una fila informativa como un puntaje requerido.
6. Como Jurado, quiero poder registrar una nota válida de `1` a `5` o la opción separada `No se presentó` con valor `0`, para que el sistema respete la escala aprobada para 2027.
7. Como Jurado, quiero que el sistema impida confirmar una planilla con puntuaciones requeridas incompletas, para evitar envíos parciales.
8. Como Jurado, quiero confirmar localmente una planilla completa sin conexión, para terminar mi trabajo aunque la red no esté disponible.
9. Como Jurado, quiero que una confirmación local bloquee la planilla y muestre persistentemente que está pendiente de recepción, para saber que el dispositivo la guardó pero el servidor aún no la recibió.
10. Como Jurado, quiero que el sistema distinga la recepción oficial del servidor de la confirmación local, para no confundir estados del dispositivo con resultados oficiales.
11. Como Jurado, quiero que cada envío use un identificador de operación estable, para que un reintento no cree una segunda planilla.
12. Como Jurado, quiero que un reenvío idempotente equivalente sea reconocido por el servidor y que un envío conflictivo no sobrescriba el voto original, para conservar la integridad de la evidencia.
13. Como Jurado, quiero que una planilla recibida por el servidor no admita edición o eliminación ordinaria, para mantener la inmutabilidad del voto confirmado.
14. Como Jurado, quiero consultar estados y errores de recepción sin ver puntajes numéricos después de confirmar, para preservar el secreto antes del cierre total.
15. Como Escribano, quiero que cada recepción, rechazo y cierre deje evidencia auditable, para poder verificar la operación sin mantener una copia editable de los puntajes.

## Decisiones de implementación

- El servidor valida edición, asignación, especialidad, noche, versión del reglamento, completitud, integridad e identificador idempotente antes de recibir una planilla.
- La confirmación local significa que el dispositivo persistió y bloqueó la planilla como pendiente de recepción. No es un acuse oficial.
- La recepción oficial ocurre únicamente cuando la API acepta el envío o reconoce un reenvío idempotente equivalente.
- Las operaciones reenviables usan un identificador estable, como un UUID generado en el cliente. Los timestamps no son mecanismo de deduplicación.
- Puntajes confirmados no se editan ni eliminan mediante operaciones ordinarias. Cualquier excepción requiere un procedimiento separado, auditable y aprobado.
- Antes del cierre total, la API no entrega puntajes numéricos a ningún rol; solo puede entregar estados.
- La solución debe mantener separado el estado de confirmación local del estado de recepción oficial y persistir esos estados en la interfaz.
- La API es la autoridad funcional y PostgreSQL la autoridad final de integridad. No confiar en usuario, rol o permisos enviados por el cliente.

## Decisiones de pruebas

- Probar el comportamiento observable desde la PWA con el servidor y PostgreSQL reales; simular pérdida y recuperación de conectividad en el navegador.
- Verificar que el Jurado solo accede a noches y especialidades con asignación activa y que la API rechaza contextos inválidos.
- Verificar que una planilla incompleta no se confirma y que una completa pasa a estado local pendiente sin conexión.
- Verificar que al reconectar un envío aceptado se muestre como recibido oficialmente y sobreviva a un reinicio del navegador.
- Repetir el mismo `operationId` y contenido para comprobar que no se duplica la planilla; reenviar contenido distinto bajo el mismo identificador debe rechazarse sin modificar el voto original.
- Verificar que después de confirmada localmente la planilla queda bloqueada para edición ordinaria.
- Verificar que las respuestas posteriores a la confirmación no exponen puntajes numéricos antes del cierre total.
- Verificar eventos de auditoría para aceptación y rechazo sin incluir secretos, tokens ni una copia editable de puntajes.
- Como antecedentes existen pruebas de API, migraciones y flujos del cliente; la prueba offline debe validar el comportamiento integrado, no solo mocks de `fetch`.

## Fuera de alcance

- Definir reintentos automáticos, manuales o la resolución de conflictos offline.
- Procedimientos excepcionales por pérdida de dispositivo o planillas irrecuperables.
- Cierre de noche, cálculo y publicación de resultados.
- Correcciones excepcionales de votos confirmados.
- Generación, impresión o sincronización de PDF.
- Desempates, impugnaciones y votos recibidos fuera de término.

## Notas adicionales

### Bloqueos antes de implementar

- Decisión recibida el 2026-11-19 para D9: reintento automático con espera exponencial acotada y botón manual «Reintentar ahora», con el mismo `operationId`. Ante `409`, informar y no reintentar. Conflicto = mismo `operationId` con contenido distinto o planilla ya recibida; la planilla local queda bloqueada sin corregir ni sobrescribir.
- Sigue pendiente la excepción para dispositivos que no puedan sincronizar (quién la autoriza, qué evidencia exige y cómo se registra).
- Definir el procedimiento autorizado y la evidencia requerida si un dispositivo no puede sincronizar.
- Completar el modelo de asignación para identificar claramente Jurado, especialidad y noche y generar las planillas esperadas.
- Aprobar el diseño físico y las migraciones antes de modificar el esquema.
- Las reglas para puntajes 1–5, `No se presentó` como 0, planillas incompletas, voto inmutable e idempotencia ya están confirmadas y no deben reabrirse sin una decisión expresa.
