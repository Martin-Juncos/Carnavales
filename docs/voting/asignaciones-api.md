# API de consulta de asignaciones de jurado

**Estado:** implementada en el ticket 02 de `.scratch/asignaciones-jurado/`. No es una especificación OpenAPI completa.

Las dos rutas requieren sesión válida y rol `ADMINISTRADOR`, verificado en `usuario_rol` en cada petición. Sin sesión responden `401 { "error": "no_autenticado" }`; con sesión pero sin ese rol, `403 { "error": "sin_permiso" }`. La identidad del actor nunca se toma de campos enviados por el cliente.

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/admin/asignaciones` | `200` con `{ items: [...] }`. |
| `GET` | `/api/admin/jurados` | `200` con `{ items: [...] }`. |

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

## Límites

La consulta de planillas esperadas para Fiscal/Escribano se coordina con `cierre-resultados`; el catálogo de roles sembrado en `0003` no incluye `FISCAL`. La captura y recepción de votos corresponde a `votacion-offline`.
