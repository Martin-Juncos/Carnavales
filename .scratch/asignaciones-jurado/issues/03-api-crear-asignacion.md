# 03: API — crear asignación de jurado en noche `DRAFT`

**What to build:** El Administrador asigna un Jurado a una noche competitiva y una especialidad; la API valida los contextos y deja evidencia del actor.

**Blocked by:** Tickets 01 y 02 (resueltos).

**Status:** implementado. Contrato documentado en `docs/voting/asignaciones-api.md`.

- [x] `POST /api/admin/asignaciones` con `juradoId`, `nocheId`, `especialidadId` valida: jurado existe y tiene rol `JURADO` (`jurado_invalido`, 400), noche existe (`noche_inexistente`, 400), especialidad existe, está activa y pertenece a la edición de la noche (`especialidad_invalida`, 400), y no hay duplicado activo (`asignacion_duplicada`, 409). Los campos vacíos, mal formados y el JSON con sintaxis inválida responden `campos_invalidos` 400.
- [x] Se permiten altas mientras la noche esté en `DRAFT` aunque la edición esté `OPEN`; se rechazan cuando la noche está `OPEN` o `CLOSED` (`noche_abierta`, 409). La fila de la noche se bloquea con `FOR SHARE` para que una apertura concurrente no altere la decisión.
- [x] La identidad del actor y sus permisos salen de la sesión (`request.usuario.id`, escrito por `requerirAdministrador`), nunca de campos del cuerpo; se ignoran `creadaPor`, `actorId` y `usuarioId` enviados por el cliente.
- [x] La creación es transaccional y registra auditoría (`asignacion_creada` sobre `asignacion_jurado`) en la misma transacción; errores de validación `400`, conflicto `409`, sin permiso `403`, no autenticado `401` y error no previsto `500` con mensaje genérico.
- [x] Prueba observable en `api/test/asignaciones.test.js` con PostgreSQL descartable: alta válida persiste y aparece en el listado; noche `OPEN` y `CLOSED`, jurado inválido, noche inexistente, especialidad inactiva/de otra edición, duplicado y JSON inválido son rechazados sin registro parcial ni auditoría; `401`/`403` para `POST`; la auditoría usa al administrador de la sesión aunque el cuerpo declare otro actor; dos altas simultáneas dejan una sola fila y una sola auditoría.

**Fuera de este ticket:** revocar o reemplazar asignaciones y su auditoría (ticket 04); la confirmación explícita en la interfaz y la prueba a través del cliente (historia 11, ticket 05); validación de contexto en operaciones de voto (`votacion-offline`); planillas esperadas para cierre (`cierre-resultados`). No se inventan reglas de suplencias ni excepciones reglamentarias.

## Comentarios

- 2026-11-19: implementado con TDD. El ciclo rojo partió del `POST` inexistente (404) y se completó con `crearAsignacion` en `api/src/asignaciones.js` y la ruta en `api/src/admin-asignaciones.js`.
- 2026-11-19: `noche_abierta` se clasifica como `409` (conflicto de estado) y no como `400`, porque el cuerpo es válido pero el estado de la noche impide la operación.
- 2026-11-19: la proyección de asignaciones se extrajo a una consulta y un mapper compartidos para que la respuesta de creación tenga exactamente la misma forma que la del listado.
- 2026-11-19: el error `23505` se traduce a `asignacion_duplicada` solo cuando la restricción es `asignacion_jurado_activa_unica`, como respaldo ante dos peticiones concurrentes; cualquier otra violación única se trata como error no previsto.
- 2026-11-19: las revisiones agregaron el manejo de JSON inválido, la cobertura de noche `CLOSED`, la prueba de concurrencia y el filtro de `constraint`. Se dividió la creación en validaciones pequeñas.
- 2026-11-19: el fixture solo inserta una edición `OPEN` si la cuenta de pruebas pertenece a `carnavales_servicio_apertura` (exigencia del trigger de `0006`); en caso contrario la prueba correspondiente se omite, para no romper las demás con un error de privilegios.
- 2026-11-19: este router responde `500 { error: "error_interno" }` ante errores no previstos; el resto de los routers sigue dependiendo del manejador por defecto de Express. La deuda global quedó registrada en el ticket 08.
