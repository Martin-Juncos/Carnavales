# API de cierre de noche

`GET /api/escribano/noches` lista las noches competitivas por edición y orden
de noche. Devuelve solo su identificador, nombre, estado y edición.
El panel **Cierre de noche** usa esa lista para consultar el estado y solicita
confirmación explícita antes de ejecutar el cierre.

## Consultar si la noche se puede cerrar

`GET /api/escribano/ediciones/:edicionId/noches/:nocheId/cierre` requiere una
sesión activa con rol `ESCRIBANO`. Devuelve `401` sin sesión, `403` sin ese rol
y `404` si la noche competitiva no existe en la edición.

La respuesta `200` contiene únicamente `nocheId`, `puedeCerrar` y `motivo`.
`motivo` es `null` si se cumplen los requisitos; de lo contrario es
`noche_cerrada`, `noche_no_abierta`, `instantanea_no_disponible`, `sin_planillas_esperadas`
o `planillas_pendientes`. No se muestran puntajes ni conteos.

Cada obligación de la instantánea requiere un acuse oficial de la versión
congelada. Una planilla recibida de un suplente con relevo registrado satisface
la misma obligación. Los borradores y las confirmaciones locales no cuentan.
Una instantánea vacía o ausente bloquea el cierre.

Esta consulta no modifica ni cierra una noche.

## Cerrar la noche

`POST /api/escribano/ediciones/:edicionId/noches/:nocheId/cierre` exige el
mismo rol y requiere el cuerpo JSON `{ "confirmar": true }`. Sin confirmación
devuelve `400 confirmacion_cierre_requerida`. Vuelve a verificar el estado
de la noche y sus acuses oficiales en la misma transacción que el cierre.
Si todavía no puede cerrar, responde `409` con `{ error: motivo }`.

Al cerrar, responde `200` con `{ nocheId, estado: "CLOSED", cerradaEn }`.
Repetir la solicitud devuelve el mismo cierre y no duplica el evento
`noche_cerrada`. La auditoría y el cambio de estado se guardan juntos.
No se modifican los votos ni se cierra la votación completa.

El cierre bloquea primero la noche y después comprueba que la edición siga
operativa, dentro de la misma transacción. Así puede coincidir con un reintento
de apertura sin invertir el orden de bloqueos. El reintento conserva su acuse
original de apertura: no vuelve a abrir una noche cerrada.
