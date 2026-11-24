# API del Jurado

**Estado:** contrato vigente de lectura, apertura de edición, traspaso de
borrador y recepción oficial. No es una especificación OpenAPI completa.

Todas las rutas requieren una sesión válida y que el usuario tenga el rol
`JURADO` **en la base en el momento de la petición**. Sin sesión responden
`401 { "error": "no_autenticado" }`; con sesión pero sin ese rol,
`403 { "error": "sin_permiso" }`. El jurado se deriva de la sesión: ninguna ruta
acepta un identificador de jurado ni un rol enviado por el cliente.

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/jurado/contextos` | `200` con `{ items: [...] }` de asignaciones activas del jurado. |
| `GET` | `/api/jurado/planillas/:asignacionId` | `200` con la estructura de la planilla esperada. |
| `POST` | `/api/jurado/planillas` | `201` al recibir una planilla; `200` con el mismo acuse al repetir el envío. |

Errores de dominio: `400 { "error": "campos_invalidos", ... }` para un
`asignacionId` mal formado; `404 { "error": "asignacion_no_encontrada", ... }`
cuando la asignación no existe, está revocada o pertenece a otro jurado. Se usa
el mismo `404` en los tres casos para no revelar la existencia de contextos que
el jurado no puede consultar. Los errores no previstos responden `500` controlado
según `docs/authentication/api-reference.md`.

## `GET /api/jurado/contextos`

Devuelve solo asignaciones con `estado = ACTIVA` del jurado de la sesión. Se
incluye el estado de la noche para que la interfaz decida qué operaciones ofrece;
esta ruta no implementa reglas de voto ni de apertura.

```json
{
  "items": [
    {
      "asignacionId": "uuid",
      "noche": {
        "id": "uuid",
        "nombre": "Primera noche",
        "orden": 1,
        "estado": "DRAFT",
        "edicion": { "id": "uuid", "nombre": "Carnaval 2027", "anio": 2027 }
      },
      "especialidad": { "id": "uuid", "nombre": "Vestuario", "codigo": "J1" }
    }
  ]
}
```

## `GET /api/jurado/planillas/:asignacionId`

Devuelve las filas esperadas de la asignación: `fila_planilla` de la edición y
versión vigentes y de la especialidad de la asignación, excluidas las filas
marcadas `excluida`. Las filas con `evaluable = false` se devuelven marcadas para
que no se traten como puntuaciones requeridas (D7).

```json
{
  "asignacionId": "uuid",
  "versionId": "uuid",
  "recepcionHabilitada": false,
  "noche": { "id": "uuid", "nombre": "Primera noche", "orden": 1, "estado": "DRAFT" },
  "especialidad": { "id": "uuid", "nombre": "Vestuario", "codigo": "J1" },
  "filas": [
    {
      "id": "uuid",
      "orden": 1,
      "origen": "GENERADA",
      "evaluable": true,
      "rubro": { "id": "uuid", "codigo": "R1", "nombre": "Rubro uno", "tipo": "ALEATORIO", "padreId": null },
      "sujeto": {
        "id": "uuid",
        "tipo": "PERSONA",
        "nombre": "Persona Uno",
        "comparsa": { "id": "uuid", "nombre": "Comparsa Uno", "logoDataUrl": "data:image/webp;base64,..." }
      }
    }
  ]
}
```

`comparsa.logoDataUrl` es opcional (migración `0032`): solo se incluye cuando
la comparsa tiene un logo visual cargado (PNG, JPEG o WebP en base64) para que
la PWA lo muestre también sin conexión; se omite cuando es `null`.

**La respuesta no contiene puntajes numéricos**, ni siquiera después de que una
planilla haya sido recibida: D15 exige que solo se entreguen estados hasta el
cierre total. Tampoco expone secretos ni datos de la sesión.

Para una asignación con suplentes, la lectura devuelve `requiereDispositivo: true`
y deshabilita la recepción en la vista previa. Para habilitar edición y recepción,
el jurado activo llama a `POST /api/jurado/planillas/:asignacionId/abrir-edicion`
con `{ "dispositivoId": "<uuid>" }`, que persiste en el dispositivo antes de
enviar la primera solicitud. El mismo identificador permite volver a abrir la
planilla y debe acompañar el envío de la planilla. Otro identificador devuelve
`409 dispositivo_no_autorizado`. El identificador no se devuelve en respuestas
ni se incluye en el acuse.

`POST /api/jurado/planillas/:asignacionId/borrador-traspaso` guarda un borrador
congelado. Recibe `operationId`, `versionId`, `dispositivoId` y `puntajes`
(un subconjunto de filas puntuables, que puede estar vacío). Solo lo puede
enviar el jurado activo desde el dispositivo que abrió la planilla. La autoría
se toma de la sesión, no del cuerpo. Responde `201` con
`{ estado: "BORRADOR_CONGELADO", asignacionId, operationId, confirmacionId }`; el reenvío
equivalente responde `200` con el mismo acuse. No devuelve puntajes.
El borrador congelado bloquea la reapertura para editar y el envío oficial
de la asignación saliente; una planilla ya recibida no se puede congelar.
Este endpoint no activa al suplente ni confirma la planilla.

Una vez recibido y validado el acuse, el mismo dispositivo llama a
`POST /api/jurado/planillas/:asignacionId/confirmar-traspaso` con
`operationId`, `dispositivoId` y el `confirmacionId` devuelto por el servidor.
Responde `200` con `{ estado: "TRASPASO_CONFIRMADO", asignacionId, operationId }`;
la repetición equivalente devuelve el mismo resultado. Sin este paso, el
relevo sigue bloqueado aunque el borrador ya exista en el servidor.

Al confirmar **Preparar traspaso**, el cliente bloquea el borrador local antes
de enviarlo. Si falla la conexión, conserva el contenido y el identificador
de operación para **Reintentar guardar borrador**. La confirmación oficial de
la planilla y la preparación del traspaso no se pueden aplicar al mismo registro local.

Cuando se activa al suplente, la lectura de su asignación devuelve
`filasHeredadas` con solo los identificadores de las filas bloqueadas, sin
valores ni autoría. El suplente envía todas y solo las filas puntuables
restantes. El servidor combina los puntajes, conserva la autoría de cada
fila y rechaza los intentos de reenviar filas heredadas.

Mientras la noche está en `DRAFT`, se usa la última versión vigente de la edición
(`BORRADOR`, `PUBLICADA` o `CONGELADA`). Al abrir la noche, el servidor registra
la versión y las asignaciones activas en una instantánea. A partir de entonces
la lectura usa la versión de esa instantánea. Para noches competitivas abiertas
con la migración `0015`, devuelve solo las filas guardadas para esa noche y
especialidad, en el orden configurado. Para noches abiertas previamente
mantiene la lectura histórica.

`versionId` identifica el reglamento usado para resolver las filas, o es
`null` si no hay versión. `recepcionHabilitada` distingue una noche abierta
con selección congelada de una vista previa o lectura histórica.

La respuesta incluye la comparsa del sujeto, pero **no** comprueba que esa
comparsa tenga `orden_presentacion` en la noche: validar el contexto para votar
pertenece a la recepción de planillas, no a esta lectura.

`fila_planilla` sigue siendo un catálogo compartido por edición, versión y
especialidad. La selección por noche limita ese catálogo después de la
apertura; no duplica los IDs de las filas.

## `POST /api/jurado/planillas`

Enviar `{ operationId, asignacionId, versionId, puntajes: [{ filaId, valor,
noPresentado }] }`. Los identificadores son UUID. Cada fila evaluable congelada
debe aparecer una sola vez; no se puntúan las informativas. `valor: 0` requiere
`noPresentado: true`; los valores de `1` a `5` requieren `false`. Una selección
no vacía con solo filas informativas se envía con `puntajes: []`.

El acuse contiene únicamente `estado: "RECIBIDA"`, `asignacionId`, `operationId`
y `recibidaEn`. Repetir el mismo UUID y los mismos puntajes, en cualquier orden,
devuelve el acuse original sin duplicar el voto. El UUID no vence mientras se
conserve el acuse. No se devuelve ningún puntaje ni el hash.

Se devuelve `409 operacion_conflictiva` si se reutiliza el UUID con otro
contenido y `409 planilla_ya_recibida` si se usa un UUID distinto para una
asignación ya recibida. No reintentar automáticamente ante `409`. Una noche sin
selección congelada devuelve `409 planilla_no_receptiva`; una versión distinta,
`409 version_no_coincide`; los puntajes incompletos o inválidos, `422
puntajes_invalidos`. Una asignación ajena, revocada o inexistente devuelve el
mismo `404` que en lectura. No se completan versiones faltantes retroactivamente.
