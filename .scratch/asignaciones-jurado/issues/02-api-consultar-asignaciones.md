# 02: API — consultar jurados disponibles y asignaciones por noche

**What to build:** El Administrador puede listar los jurados disponibles y las asignaciones de cada noche, con la identidad derivada de la sesión autenticada, para detectar coberturas faltantes antes de abrir la noche.

**Blocked by:** Ticket 01 (resuelto).

**Status:** implementado. Contrato documentado en `docs/voting/asignaciones-api.md`.

- [x] `GET /api/admin/asignaciones` devuelve `200` con `{ items: [...] }`: cada asignación con `id`, `estado`, `creadaEn`, `jurado {id, nombre, activo}`, `noche {id, nombre, orden, estado}` y `especialidad {id, nombre, codigo, activa}`; respuesta en `camelCase`. `jurado.activo` indica si conserva el rol `JURADO` en `usuario_rol`.
- [x] `GET /api/admin/jurados` devuelve `200` con `{ items: [{ id, nombre, correo }] }` para usuarios con rol `JURADO`; sin hashes, tokens ni secretos. El correo es el mismo dato que ya expone el listado administrativo de usuarios.
- [x] Solo `ADMINISTRADOR` (verificado en `usuario_rol` contra la sesión); sin sesión responde `401` y sin rol `403`, igual que `api/src/autorizacion.js`. El middleware se aplica por ruta para no alterar el `404` de rutas desconocidas bajo `/api/admin`.
- [x] El listado se ordena por año de edición (descendente), orden de noche, orden de especialidad y nombre del jurado; incluye asignaciones activas y revocadas para conservar la trazabilidad.
- [x] Prueba de comportamiento en `api/test/asignaciones.test.js` con PostgreSQL descartable: el listado refleja lo persistido, incluye revocadas, filtra jurados por rol y un rol distinto no puede consultar.

**Fuera de este ticket:** la consulta de planillas esperadas para Fiscal/Escribano se coordina con `cierre-resultados`. El catálogo de roles sembrado en `0003` no incluye `FISCAL` (tiene `ADMINISTRADOR`, `JURADO`, `ESCRIBANO` y `COMISARIO`), así que no se inventa ese rol ni sus permisos.

## Comentarios

- 2026-11-19: implementado con TDD. El primer ciclo partió de un router sin rutas (404) y se completó con el servicio `api/src/asignaciones.js`, el router `api/src/admin-asignaciones.js` y su montaje en `api/src/app.js`.
- 2026-11-19: la expectativa inicial del orden de jurados estaba equivocada ("Jurado dos" precede a "Jurado uno" por orden alfabético); se corrigió la prueba, no el servicio.
- 2026-11-19: las revisiones agregaron la afirmación de `creadaEn` y el caso `jurado.activo === false`. Este ticket no registra auditoría de consultas ni valida asignaciones en operaciones de voto: la auditoría de altas y bajas corresponde a los tickets 03 y 04, y la validación de contexto de voto a `votacion-offline`.
