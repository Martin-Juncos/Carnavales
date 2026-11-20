# API de asignaciones de jurado

**Estado:** consulta implementada en el ticket 02, alta en el ticket 03, revocación/reemplazo en el ticket 04 y catálogos de apoyo en el ticket 05 de `.scratch/asignaciones-jurado/`. No es una especificación OpenAPI completa.

Todas las rutas requieren sesión válida y rol `ADMINISTRADOR`, verificado en `usuario_rol` en cada petición. Sin sesión responden `401 { "error": "no_autenticado" }`; con sesión pero sin ese rol, `403 { "error": "sin_permiso" }`. La identidad del actor nunca se toma de campos enviados por el cliente.

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/admin/asignaciones` | `200` con `{ items: [...] }`. |
| `GET` | `/api/admin/jurados` | `200` con `{ items: [...] }`. |
| `GET` | `/api/admin/noches` | `200` con `{ items: [...] }`. |
| `GET` | `/api/admin/especialidades` | `200` con `{ items: [...] }`. |
| `POST` | `/api/admin/asignaciones` | `201` con la asignación creada. |
| `DELETE` | `/api/admin/asignaciones/:id` | `200` con la asignación revocada (baja lógica). |
| `PATCH` | `/api/admin/asignaciones/:id` | `200` con la nueva asignación. |

Los errores de dominio responden `{ "error": "...", "mensaje": "..." }`; la traducción es centralizada (`api/src/manejo-errores.js`) y también la usan los routers de ediciones, invitaciones, roles y usuarios. Un error no previsto responde `500 { "error": "error_interno", "mensaje": "No se pudo completar la operación." }` sin SQL ni detalles de infraestructura; un cuerpo JSON inválido responde `400 { "error": "campos_invalidos", "mensaje": "El cuerpo debe ser un JSON válido." }` y uno demasiado grande, `413 { "error": "cuerpo_demasiado_grande", ... }`.

## Forma de una asignación

La comparten el listado y las respuestas de creación, revocación y reemplazo:

```json
{
  "id": "uuid",
  "estado": "ACTIVA",
  "creadaEn": "2026-11-01T10:00:00.000Z",
  "revocadaEn": null,
  "jurado": { "id": "u-jurado-1", "nombre": "Jurado uno", "activo": true },
  "noche": { "id": "uuid", "nombre": "Primera noche", "orden": 1, "estado": "DRAFT" },
  "especialidad": { "id": "uuid", "nombre": "Vestuario", "codigo": "J1", "activa": true }
}
```

`jurado.activo` indica si el usuario conserva actualmente el rol `JURADO` en `usuario_rol`; `estado` es el de la asignación (`ACTIVA`/`REVOCADA`) y `noche.estado` es `DRAFT`, `OPEN` o `CLOSED`. `revocadaEn` es `null` mientras la asignación está activa.

## `GET /api/admin/asignaciones`

Incluye asignaciones activas y revocadas, ordenadas por año de edición (descendente), orden de noche, orden de especialidad y nombre del jurado. Conservar las revocadas permite reconstruir la cobertura histórica. No expone puntajes.

## `GET /api/admin/jurados`

Devuelve los usuarios con rol `JURADO`, ordenados por nombre:

```json
{ "items": [{ "id": "u-jurado-1", "nombre": "Jurado uno", "correo": "jurado1@example.test" }] }
```

No devuelve hashes de contraseña, tokens de sesión ni secretos del segundo factor.

## `GET /api/admin/noches` y `GET /api/admin/especialidades`

Catálogos de solo lectura que el panel administrativo necesita para ofrecer el alta en una noche que todavía no tiene cobertura (no se pueden derivar del listado de asignaciones). Ordenados por año de edición descendente y luego por `orden`:

```json
{ "items": [{ "id": "uuid", "nombre": "Primera noche", "orden": 1, "estado": "DRAFT", "edicion": { "id": "uuid", "nombre": "Carnaval 2027", "anio": 2027 } }] }
```

```json
{ "items": [{ "id": "uuid", "nombre": "Vestuario", "codigo": "J1", "activa": true, "edicion": { "id": "uuid", "nombre": "Carnaval 2027", "anio": 2027 } }] }
```

No exponen puntajes ni reglas de cálculo. Como el resto de las rutas, responden `401` o `403` según la sesión y el rol.

## `POST /api/admin/asignaciones`

Cuerpo:

```json
{ "juradoId": "u-jurado-1", "nocheId": "uuid", "especialidadId": "uuid" }
```

El alta se permite mientras la noche esté en `DRAFT`, **incluso si la edición ya está `OPEN`**; la fila de la noche se bloquea con `FOR SHARE` para que una apertura concurrente no cambie la decisión a mitad de la operación. La edición se deriva de la noche, no del cuerpo.

## `DELETE /api/admin/asignaciones/:id`

Revoca la asignación. Es una **baja lógica**: el trigger de la migración 0007 rechaza cualquier `DELETE` físico y solo admite la transición `ACTIVA → REVOCADA`, conservando identidad, creador y fecha originales. La fila sigue apareciendo en el listado con `estado: "REVOCADA"` y `revocadaEn` poblado.

Registra `asignacion_revocada` sobre la asignación original. Revocar dos veces responde `409` y no genera otra auditoría.

## `PATCH /api/admin/asignaciones/:id`

Cuerpo (al menos un campo):

```json
{ "juradoId": "u-jurado-2", "especialidadId": "uuid" }
```

Reemplaza el jurado y/o la especialidad de forma **atómica**. El trigger impide modificar la identidad de la fila original, así que la operación:

1. bloquea la original con `FOR UPDATE` y la revoca;
2. crea una nueva asignación con la combinación efectiva, heredando noche y edición de la original (no se reasigna a otra jornada);
3. registra `asignacion_reemplazada` sobre la original y `asignacion_creada` sobre la nueva, ambas con el actor de la sesión.

Un rechazo no deja la original revocada ni la nueva insertada. No es un reemplazo válido enviar los mismos valores que ya tiene la asignación.

El reemplazo genérico se admite solo en `DRAFT` y para asignaciones sin
suplentes registrados. Una vez abierta la noche, corresponde activar a un
suplente registrado sin cambiar la noche ni la especialidad.

## Errores de dominio

| Error | Estado | Motivo |
|---|---|---|
| `campos_invalidos` | 400 | Falta un identificador obligatorio, tiene formato inválido, el cuerpo no es JSON válido o el reemplazo no indica cambios. |
| `jurado_invalido` | 400 | El usuario no existe o no tiene el rol `JURADO`. |
| `noche_inexistente` | 400 | La noche no existe. |
| `especialidad_invalida` | 400 | La especialidad no existe, está inactiva o pertenece a otra edición. |
| `asignacion_no_encontrada` | 404 | No existe la asignación indicada en la ruta. |
| `asignacion_no_activa` | 409 | La asignación ya está revocada. |
| `noche_abierta` | 409 | La noche está `OPEN` o `CLOSED`: no se admiten altas nuevas. |
| `asignacion_duplicada` | 409 | Ya hay una asignación activa para ese jurado, noche y especialidad. |

El índice único de asignaciones activas resuelve las peticiones simultáneas: de dos altas iguales, una responde `201` y la otra `409`. Las operaciones sobre la fila usan `FOR UPDATE`: de dos revocaciones o dos reemplazos concurrentes sobre la misma asignación, uno responde `200` y el otro `409 asignacion_no_activa`, sin operaciones duplicadas.

## Límites

Una planilla oficialmente recibida impide revocar o reemplazar su asignación
(`409 planilla_ya_recibida`). Una confirmación pendiente en un dispositivo no
es conocida por el servidor; no equivale a un acuse y no habilita un traspaso.
Para asignaciones con suplentes registrados se usa exclusivamente el flujo de
suplencias; no se puede revocar la asignación mediante la ruta genérica.

El Escribano consulta los requisitos desde la [API de cierre de
noche](cierre-noche-api.md). El rol `FISCAL` no existe. Registrar suplentes no
reasigna a otra noche ni modifica una planilla confirmada.

### Registro de suplentes

El panel **Asignaciones de jurado** permite registrar y activar suplentes,
ambas acciones con confirmación explícita. El listado de Administración incluye
`suplencia: { suplenteIds, abiertaParaEditar, borradorGuardado? }` en la asignación activa del
grupo, sin exponer el identificador del dispositivo.

`POST /api/admin/asignaciones/:id/suplentes` recibe `{ "suplenteIds": ["jurado-2", "jurado-3"] }`.
Requiere el rol `ADMINISTRADOR` y una asignación activa de una noche competitiva en borrador.
Los dos suplentes deben tener el rol `JURADO`, ser distintos entre sí y no ser el titular.
Responde `201` con `asignacionId` y `suplenteIds`; registra el actor de la sesión en auditoría.
Una noche abierta responde `409 noche_abierta` y un registro repetido responde
`409 suplentes_ya_registrados`. Registrar suplentes no crea asignaciones nuevas
ni da acceso a la planilla.

`POST /api/admin/asignaciones/:id/activar-suplente` recibe `{ "juradoId": "jurado-2" }`.
Activa a un suplente registrado en la misma noche y especialidad si la
planilla no se abrió para editar o si el servidor guardó el borrador
congelado y el dispositivo confirmó su acuse. Responde `200` con la asignación nueva.
Registra el relevo en auditoría. En el primer relevo de una noche abierta,
conserva la referencia a la planilla esperada que se congeló al abrir la noche,
aunque ya hubiera habido un relevo en borrador. No modifica la instantánea.
Las rutas genéricas de reemplazo y revocación
no se aplican a asignaciones con suplentes registrados. Una planilla abierta
para editar sin borrador guardado devuelve `409 planilla_abierta_para_editar`.
El relevo con borrador entrega las mismas filas de la planilla esperada, no
expone los puntajes a Administración y conserva las notas y sus autores.

Una vez abierta la noche, el reemplazo genérico devuelve
`409 reemplazo_requiere_suplencia` para una asignación activa sin planilla
recibida ni suplentes registrados. Solo el relevo registrado vincula al
suplente con una planilla esperada. No se reasocian planillas históricas.
