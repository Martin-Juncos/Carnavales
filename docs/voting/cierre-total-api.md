# API de cierre total de la votación (P6A)

`GET /api/escribano/ediciones` lista las ediciones no retiradas ordenadas por
año descendente. Devuelve únicamente `id`, `nombre`, `anio`, `estado` y
`cerradaEn` (`string | null`). El panel **Cierre total de la votación** usa esa
lista para consultar elegibilidad y exigir confirmación explícita antes de
cerrar definitivamente la votación.

## Consultar si la votación completa se puede cerrar

`GET /api/escribano/ediciones/:edicionId/cierre` requiere una sesión activa con
rol `ESCRIBANO`. Devuelve `401` sin sesión, `403` sin ese rol y `404` si la
edición no existe, está retirada o `:edicionId` no es un UUID válido. Todas las
respuestas incluyen `Cache-Control: no-store`.

La respuesta `200` contiene únicamente `edicionId`, `estado`, `puedeCerrar`,
`motivo` y `cerradaEn`. `motivo` es `null` cuando se cumplen todos los
requisitos; de lo contrario es:

- `edicion_cerrada`
- `edicion_no_abierta`
- `sin_noches_puntuables`
- `noches_en_votacion`
- `noches_puntuables_pendientes`

No se devuelven puntajes ni conteos (`D15`).

Condiciones verificadas (`D10`): debe existir al menos una noche `COMPETENCIA`
con `cuenta_para_puntaje = true`, todas esas noches deben estar en `CLOSED` y
ninguna noche `COMPETENCIA` de la edición puede estar en `OPEN`. Las noches
`PREMIACION` no bloquean el cierre total.

Esta consulta no modifica ni cierra la edición.

## Cerrar la votación completa

`POST /api/escribano/ediciones/:edicionId/cierre` exige el mismo rol y requiere
el cuerpo JSON `{ "confirmar": true }`. Sin confirmación válida responde `400`
con `{ error: "confirmacion_cierre_requerida" }`.

La transacción toma primero un bloqueo compartido sobre las noches de la edición
en orden determinístico (`ORDER BY id FOR SHARE`) y luego bloquea la edición
(`FOR UPDATE`), evitando inversión de bloqueos frente a aperturas, cierres de
noche, consultas de padrón y eliminaciones.

- `404 edicion_inexistente` si la edición no existe.
- `409 edicion_retirada` si la edición fue retirada.
- `409 { error: motivo }` si todavía no cumple las condiciones de cierre total.
- `200` con `{ edicionId, estado: "CLOSED", cerradaEn }` al cerrar.

Repetir la solicitud sobre una edición ya cerrada devuelve `200` con el mismo
`cerradaEn` original y no duplica el evento `votacion_cerrada` en `auditoria`.

El cierre total es irreversible: congela cambios operativos, creación/apertura
de noches, asignaciones, retiro de edición y recepción de nuevas planillas
(`409 edicion_cerrada`), preservando acuses históricos idempotentes de planillas
ya recibidas y la eliminación completa administrativa fuera de votación activa.
