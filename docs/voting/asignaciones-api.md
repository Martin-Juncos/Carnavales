# API de asignaciones de jurado

**Estado:** consulta implementada en el ticket 02 y alta implementada en el ticket 03 de `.scratch/asignaciones-jurado/`. No es una especificación OpenAPI completa.

Todas las rutas requieren sesión válida y rol `ADMINISTRADOR`, verificado en `usuario_rol` en cada petición. Sin sesión responden `401 { "error": "no_autenticado" }`; con sesión pero sin ese rol, `403 { "error": "sin_permiso" }`. La identidad del actor nunca se toma de campos enviados por el cliente.

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/admin/asignaciones` | `200` con `{ items: [...] }`. |
| `GET` | `/api/admin/jurados` | `200` con `{ items: [...] }`. |
| `POST` | `/api/admin/asignaciones` | `201` con la asignación creada; errores de dominio con `{ error, mensaje }`. |

## `GET /api/admin/asignaciones`

Incluye asignaciones activas y revocadas, ordenadas por año de edición (descendente), orden de noche, orden de especialidad y nombre del jurado. Conservar las revocadas permite reconstruir la cobertura histórica. No expone puntajes.

```json
{
  "items": [
    {
      "id": "uuid",
      "estado": "ACTIVA",
      "creadaEn": "2026-11-01T10:00:00.000Z",
      "jurado": { "id": "u-jurado-1", "nombre": "Jurado uno", "activo": true },
      "noche": { "id": "uuid", "nombre": "Primera noche", "orden": 1, "estado": "DRAFT" },
      "especialidad": { "id": "uuid", "nombre": "Vestuario", "codigo": "J1", "activa": true }
    }
  ]
}
```

`jurado.activo` indica si el usuario conserva actualmente el rol `JURADO` en `usuario_rol`; `estado` es el de la asignación (`ACTIVA`/`REVOCADA`) y `noche.estado` es `DRAFT`, `OPEN` o `CLOSED`.

## `GET /api/admin/jurados`

Devuelve los usuarios con rol `JURADO`, ordenados por nombre:

```json
{ "items": [{ "id": "u-jurado-1", "nombre": "Jurado uno", "correo": "jurado1@example.test" }] }
```

No devuelve hashes de contraseña, tokens de sesión ni secretos del segundo factor.

## `POST /api/admin/asignaciones`

Cuerpo:

```json
{ "juradoId": "u-jurado-1", "nocheId": "uuid", "especialidadId": "uuid" }
```

Responde `201` con la misma forma de un elemento del listado. El alta se permite mientras la noche esté en `DRAFT`, **incluso si la edición ya está `OPEN`**; la fila de la noche se bloquea con `FOR SHARE` para que una apertura concurrente no cambie la decisión a mitad de la operación.

Validaciones (todas dentro de una transacción; un rechazo no deja asignación ni auditoría):

| Error | Estado | Motivo |
|---|---|---|
| `campos_invalidos` | 400 | Falta algún identificador, no tiene el formato esperado o el cuerpo no es JSON válido. |
| `jurado_invalido` | 400 | El usuario no existe o no tiene el rol `JURADO`. |
| `noche_inexistente` | 400 | La noche no existe. |
| `especialidad_invalida` | 400 | La especialidad no existe, está inactiva o pertenece a otra edición. |
| `noche_abierta` | 409 | La noche está `OPEN` o `CLOSED`: no se admiten altas nuevas. |
| `asignacion_duplicada` | 409 | Ya hay una asignación activa para ese jurado, noche y especialidad. |

La edición de la asignación se deriva de la noche, no del cuerpo. En la misma transacción se inserta un registro de auditoría append-only con `operacion: "asignacion_creada"`, `entidad_tipo: "asignacion_jurado"`, `entidad_id` igual al de la asignación y `actor_id` igual al id de la sesión. Cualquier campo de actor enviado en el cuerpo se ignora.

Un error no previsto responde `500 { "error": "error_interno", "mensaje": "No se pudo completar la operación." }` sin SQL ni detalles de infraestructura. El índice único de asignaciones activas resuelve las peticiones simultáneas: de dos altas iguales, una responde `201` y la otra `409`.

## Límites

La revocación y el reemplazo de asignaciones quedan para el ticket 04; la consulta de planillas esperadas para Fiscal/Escribano se coordina con `cierre-resultados` (el catálogo de roles sembrado en `0003` no incluye `FISCAL`). La captura y recepción de votos corresponde a `votacion-offline`.
