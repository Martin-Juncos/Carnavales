# API de lectura del Jurado

**Estado:** implementada en el ticket P2 de `.scratch/votacion-offline/`. No es una especificación OpenAPI completa.

Todas las rutas requieren una sesión válida y que el usuario tenga el rol
`JURADO` **en la base en el momento de la petición**. Sin sesión responden
`401 { "error": "no_autenticado" }`; con sesión pero sin ese rol,
`403 { "error": "sin_permiso" }`. El jurado se deriva de la sesión: ninguna ruta
acepta un identificador de jurado ni un rol enviado por el cliente.

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/jurado/contextos` | `200` con `{ items: [...] }` de asignaciones activas del jurado. |
| `GET` | `/api/jurado/planillas/:asignacionId` | `200` con la estructura de la planilla esperada. |

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
        "comparsa": { "id": "uuid", "nombre": "Comparsa Uno" }
      }
    }
  ]
}
```

**La respuesta no contiene puntajes numéricos**, ni siquiera después de que una
planilla haya sido recibida: D15 exige que solo se entreguen estados hasta el
cierre total. Tampoco expone secretos ni datos de la sesión.

Hasta que se implemente la operación de apertura que llena la instantánea P1,
la versión usada para derivar las filas es la última versión vigente de la
edición (`BORRADOR`, `PUBLICADA` o `CONGELADA`), nunca una `SUPERSEDIDA`. Cuando
esa operación exista, la lectura deberá usar la versión congelada en la
instantánea de la noche.

La respuesta incluye la comparsa del sujeto, pero **no** comprueba que esa
comparsa tenga `orden_presentacion` en la noche: validar el contexto para votar
pertenece a la recepción de planillas, no a esta lectura.

**Limitación del esquema P1:** `fila_planilla` no tiene `noche_id`, sino que
depende de edición, versión y especialidad. Por eso, dos asignaciones de la
misma edición y especialidad en noches distintas devuelven la misma estructura
de filas, aunque D4 defina una planilla por jurado, especialidad y noche. La
respuesta identifica la noche de la asignación, pero todavía no incluye una
diferenciación de filas por noche; eso requiere un cambio de esquema y no se
inventó aquí.
