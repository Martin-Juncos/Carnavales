# API de configuración de una edición

**Estado:** implementado para noches y especialidades. El resto de la configuración
(padrón, rubros, escalas, premios, publicación y apertura) sigue pendiente o
bloqueado según `.scratch/configurar-edicion/`.

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
