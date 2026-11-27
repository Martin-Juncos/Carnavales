# API de actas oficiales de resultados PDF/CSV con SHA-256 (P6D)

> **Contrato vigente, aprobado e implementado en `0035`.** Describe los
> endpoints reales de P6D, construidos sobre el diseño aprobado en
> [actas-diseno.md](actas-diseno.md).

Todas las rutas devuelven `Cache-Control: no-store`. Ningún endpoint expone
notas individuales por jurado (`D15`) ni los bytes de un acta fuera de su
endpoint de descarga dedicado.

## Operación exclusiva del Escribano (`/api/escribano`)

Exige sesión activa con rol `ESCRIBANO` (`401` sin sesión, `403` sin rol),
validación UUID de `:edicionId`/`:calculoId` (`404 edicion_inexistente` /
`404 calculo_inexistente` si están mal formados, no existen o la edición está
retirada; mismo criterio `404` que `resultados-api.md` para edición
inexistente/retirada, no `409`).

### Generar una versión de acta oficial

`POST /api/escribano/ediciones/:edicionId/resultados/:calculoId/actas`

Cuerpo JSON: `{ operationId, confirmar: true }` (`400 confirmacion_requerida`
si falta `confirmar: true`; `400 operation_id_requerido` si falta o no es
UUID).

- **Orden de verificación (ver [actas-diseno.md §4.2](actas-diseno.md#42-idempotencia-propuesta-con-vínculo-al-actor)
  para el detalle completo):** primero se busca una fila existente por
  `operationId` (`operation_id` es `UNIQUE` global, igual que
  `penalizacion.operation_id`). Si existe y coincide con `edicionId`,
  `calculoId` **y** el actor de la sesión actual (`generada_por`), responde
  `200` con los metadatos ya generados, sin reevaluar el estado actual del
  snapshot. Si existe pero no coincide alguno de los tres (otra edición, otro
  cálculo u otro `ESCRIBANO`), responde `409 operacion_conflictiva` con un
  mensaje genérico, **sin incluir ningún dato del acta original** (ni
  número, ni hashes, ni fecha).
- Solo si no existe ninguna fila con ese `operationId` se validan las
  precondiciones: edición `CLOSED` y no retirada (`409 edicion_no_cerrada`;
  edición retirada o inexistente ya quedó cubierta por el `404` de arriba),
  y que el `calculoId` indicado corresponda a un snapshot en estado
  `PUBLICADO` de esa edición (`409 resultado_no_publicado` si el snapshot
  existe pero no está publicado, `404 calculo_inexistente` si no pertenece a
  la edición).
- Genera en una única transacción la cabecera del acta y sus dos
  representaciones (PDF y CSV); si falla cualquiera de las dos, no se
  conserva ningún registro parcial.
- Responde `201` con los metadatos de la nueva versión (ver forma de
  respuesta abajo).

Forma de la respuesta `201`/`200` (sin bytes):

```json
{
  "id": "uuid",
  "edicionId": "uuid",
  "calculoId": "uuid",
  "numero": 1,
  "generadaEn": "2027-02-01T03:00:00.000Z",
  "representaciones": [
    { "formato": "PDF", "contentType": "application/pdf", "tamanioBytes": 48213, "sha256": "..." },
    { "formato": "CSV", "contentType": "text/csv; charset=utf-8", "tamanioBytes": 2140, "sha256": "..." }
  ]
}
```

## Consulta, descarga y verificación (`/api/resultados`, `ESCRIBANO` y `ADMINISTRADOR`)

Mismo RBAC que [resultados-api.md](resultados-api.md): `401` sin sesión,
`403` para `JURADO` siempre, `409 edicion_no_cerrada` si la edición no está
`CLOSED`.

### Listar versiones de acta de una edición

`GET /api/resultados/ediciones/:edicionId/actas`

- `200 { items: [ { id, calculoId, numero, generadaEn, representaciones: [...] } ] }`,
  mismos metadatos que la generación, sin bytes, ordenadas por `numero DESC`.

### Descargar una representación

`GET /api/resultados/ediciones/:edicionId/actas/:actaId/:formato/descargar`

`:formato` es `pdf` o `csv` (`400 formato_invalido` para cualquier otro
valor). `404 acta_inexistente` si la versión de acta no existe para esa
edición, o si no tiene representación generada en ese formato.

- Responde el binario exacto almacenado con:
  - `Content-Type: application/pdf` o `Content-Type: text/csv; charset=utf-8`
    según `:formato`.
  - `Content-Disposition: attachment; filename="acta-<edicionId>-v<numero>.<formato>"`.
  - Encabezado `X-Acta-SHA256` con el hash almacenado, para
    comparación manual sin depender del endpoint de verificación.
- Nunca envuelve el binario en una respuesta JSON; es la única ruta que
  devuelve bytes de archivo.

### Verificar integridad de una representación

`GET /api/resultados/ediciones/:edicionId/actas/:actaId/:formato/verificar`

- Recalcula SHA-256 sobre los bytes almacenados en ese momento y lo compara
  contra el hash guardado al generarlo.
- La respuesta `200` tiene **siempre la misma forma**, coincida o no:
  `{ coincide: boolean, hashAlmacenado: "...", hashRecalculado: "..." }`. No
  se omite ningún campo según el resultado (evidencia de corrupción interna
  de los bytes almacenados, no de manipulación de una copia descargada fuera
  del sistema — ver [actas-diseno.md §6](actas-diseno.md#6-verificación-de-integridad)
  sobre la distinción entre integridad y autenticidad).
- `404 acta_inexistente` en las mismas condiciones que la descarga.

## Errores comunes

| Código | Causa |
|---|---|
| `401` | Sin sesión activa |
| `403 sin_permiso` | Rol sin autorización para la ruta (`JURADO` siempre; `ADMINISTRADOR` en la ruta de generación) |
| `400 confirmacion_requerida` | Falta `confirmar: true` en la generación |
| `400 operation_id_requerido` | Falta o es inválido `operationId` |
| `400 formato_invalido` | `:formato` distinto de `pdf`/`csv` |
| `404 edicion_inexistente` | Edición no existe o está retirada (nunca `409` para este caso, en las dos rutas) |
| `404 calculo_inexistente` | `:calculoId` no pertenece a la edición |
| `404 acta_inexistente` | Acta o representación solicitada no existe |
| `409 edicion_no_cerrada` | Edición existe, no retirada, pero no está `CLOSED` |
| `409 resultado_no_publicado` | El snapshot indicado no está `PUBLICADO` |
| `409 operacion_conflictiva` | `operationId` ya usado por otra edición, otro cálculo u otro actor; la respuesta no incluye datos del acta original |

Ninguna respuesta de error incluye trazas internas, SQL ni rutas de archivo
(`AGENTS.md` §10). Los códigos, campos y encabezados documentados son los
implementados en `0035`.
