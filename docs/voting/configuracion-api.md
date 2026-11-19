# API de configuración de una edición

**Estado:** implementado para noches, especialidades, padrón (sin pasadas) y apertura
de edición. El resto de la configuración (rubros, escalas, premios, publicación y
apertura de noche) sigue pendiente o bloqueado según `.scratch/configurar-edicion/`.

## Apertura de edición

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/:edicionId/apertura` | Pasa la edición de `CONFIGURING` a `OPEN`. Cuerpo: `{ "claveOperacion": "<UUID>" }`. |

- Usa la conexión `DATABASE_URL_APERTURA`, separada de la de la aplicación. La cuenta debe
  ser miembro de `carnavales_servicio_apertura` y no ser superusuario; ambas cosas se comprueban
  al arrancar. Sin esa variable, la ruta responde `503 apertura_no_configurada`.
- Repetir la misma `claveOperacion` sobre la misma edición responde `200` con `repetida: true`
  y el mismo `abiertaEn`, sin volver a escribir.
- Abrir no congela reglamento ni padrón: eso ocurre al abrir la primera noche.
- Respuestas de error: `clave_operacion_invalida` (400), `edicion_inexistente` (404),
  `clave_reutilizada` (409, la clave ya se usó con otra edición), `edicion_ya_abierta` (409),
  `apertura_no_autorizada` (403, si la base rechaza la cuenta).
- Permisos que usa la apertura según el código: `edicion` (lectura y actualización),
  `operacion_apertura` (lectura e inserción) y `auditoria` (inserción).

Todas las rutas viven bajo `/api/admin/ediciones` y exigen sesión autenticada con
rol `ADMINISTRADOR`, verificado en la base en cada petición. Sin sesión responden
`401`; con sesión sin el rol, `403`.

## Noches

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/:edicionId/noches` | Lista las noches de la edición por `orden`. |
| `POST` | `/:edicionId/noches` | Crea una noche en `DRAFT`. |
| `PATCH` | `/:edicionId/noches/:nocheId` | Modifica una noche en `DRAFT`. |
| `DELETE` | `/:edicionId/noches/:nocheId` | Borra una noche en `DRAFT` sin asignaciones. |

Cuerpo de creación:

```json
{
  "orden": 1,
  "nombre": "Primera noche",
  "fecha": "2027-02-06",
  "tipo": "COMPETENCIA",
  "cuentaParaPuntaje": true
}
```

- `orden` es un entero positivo y único por edición.
- `fecha` es opcional, con formato `AAAA-MM-DD`.
- `tipo` acepta `COMPETENCIA` o `PREMIACION`, los valores ya aplicados en la
  migración `0007`. Su confirmación funcional para 2027 sigue pendiente.
- `cuentaParaPuntaje` es booleano y vale `true` por defecto.
- La noche nace en `DRAFT`; esta API no abre ni cierra noches.
- Una noche que no está en `DRAFT` no se modifica ni se borra.
- El borrado se bloquea si la noche tiene asignaciones de jurado.

## Especialidades

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/:edicionId/especialidades` | Lista las especialidades por `orden`. |
| `POST` | `/:edicionId/especialidades` | Crea una especialidad activa. |
| `PATCH` | `/:edicionId/especialidades/:especialidadId` | Modifica nombre, código, orden o estado. |
| `DELETE` | `/:edicionId/especialidades/:especialidadId` | Borra una especialidad sin asignaciones. |

Cuerpo de creación:

```json
{ "nombre": "Vestuario", "codigo": "J1", "orden": 1 }
```

- `nombre` y `codigo` son obligatorios; `codigo` y `orden` son únicos por edición.
- `activa` se puede cambiar con `PATCH`.
- Si alguna noche de la edición ya no está en `DRAFT`, el padrón está congelado:
  crear, modificar o borrar responde `409 padron_congelado`.
- El borrado se bloquea si la especialidad tiene asignaciones de jurado.

## Padrón

Implementación: `api/src/padron-evento.js` (servicio) y `api/src/admin-padron.js` (rutas),
montadas bajo el mismo prefijo `/api/admin/ediciones`. Mismas reglas de sesión y rol.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` / `POST` | `/:edicionId/comparsas` | Lista o crea una comparsa (`nombre`, `categoria` `PRIMERA`/`AGRUPACION`, `activa`). |
| `PATCH` / `DELETE` | `/:edicionId/comparsas/:comparsaId` | Modifica o borra. El borrado se bloquea si hay historial. |
| `GET` / `POST` | `/:edicionId/participantes` | Lista o crea un participante (`nombreCompleto`, `esMenor`, `activo`). |
| `PATCH` | `/:edicionId/participantes/:participanteId` | Modifica un participante. |
| `GET` / `POST` | `/:edicionId/comparsas/:comparsaId/sujetos` | Lista o crea un sujeto evaluable de la comparsa. |
| `PATCH` / `DELETE` | `/:edicionId/sujetos/:sujetoId` | Cambia nombre o estado, o borra un sujeto sin pasadas. |
| `GET` / `PUT` | `/:edicionId/noches/:nocheId/orden` | Lee o reemplaza el orden de presentación de una noche. |

- Un sujeto `PERSONA` exige `participanteId` y no lleva nombre; el resto de tipos exige `nombre`.
  El tipo y el participante se fijan al crear; para cambiarlos se borra y se crea de nuevo.
- `PUT .../orden` recibe `{ "items": [{ "comparsaId", "orden" }] }`, reemplaza el orden completo
  y solo funciona con la noche en `DRAFT`. El intercambio de lugares se resuelve en una sola transacción.
- Con una noche fuera de `DRAFT`, el padrón completo (comparsas, participantes, sujetos y orden)
  queda congelado: las escrituras responden `409 padron_congelado` o `409 noche_no_editable`.
- Una comparsa inactiva no admite sujetos ni orden (`409 comparsa_inactiva`), y una con padrón
  cargado no se desactiva (`409 comparsa_con_padron`).
- Las pasadas (apariciones repetidas de un sujeto) todavía no tienen API; quedan para una issue propia.

Códigos nuevos: `categoria_invalida`, `tipo_sujeto_invalido`, `sujeto_datos_invalidos`,
`es_menor_invalido`, `activo_invalido` (400); `comparsa_inexistente`, `participante_inexistente`,
`sujeto_inexistente`, `referencia_inexistente` (404); `comparsa_con_padron`, `comparsa_inactiva`,
`participante_ya_en_comparsa`, `con_dependencias` (409).

## Errores

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `nombre_invalido` | 400 | Nombre vacío. |
| `codigo_invalido` | 400 | Código vacío. |
| `orden_invalido` | 400 | Orden no entero o menor que 1. |
| `fecha_invalida` | 400 | Fecha con formato o calendario inválido. |
| `tipo_invalido` | 400 | Tipo de noche desconocido. |
| `cuenta_para_puntaje_invalido` | 400 | Valor no booleano. |
| `activa_invalida` | 400 | Valor no booleano. |
| `sin_cambios` | 400 | `PATCH` sin campos conocidos. |
| `edicion_inexistente` | 404 | La edición no existe. |
| `noche_inexistente` | 404 | La noche no pertenece a la edición. |
| `especialidad_inexistente` | 404 | La especialidad no pertenece a la edición. |
| `orden_existente` | 409 | Ya hay una fila con ese orden en la edición. |
| `codigo_existente` | 409 | Ya hay una especialidad con ese código. |
| `noche_no_editable` | 409 | La noche no está en `DRAFT`. |
| `noche_con_dependencias` | 409 | La noche tiene asignaciones de jurado. |
| `especialidad_con_dependencias` | 409 | La especialidad tiene asignaciones de jurado. |
| `padron_congelado` | 409 | Hay una noche abierta en la edición. |

## Auditoría

Crear, modificar y borrar noches o especialidades registra una fila en
`auditoria` dentro de la misma transacción, con el actor de la sesión y la
entidad afectada. No se guardan secretos, tokens ni datos sensibles.

## Implementación

- Servicio de dominio: `api/src/configuracion-edicion.js`.
- Rutas: `api/src/admin-ediciones.js`.
- Pruebas: `api/test/noches.test.js` y `api/test/especialidades.test.js`.
