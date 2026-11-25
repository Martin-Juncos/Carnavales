# 02: API administrativa de especialidades

**What to build:** Como Administrador, crear, listar, modificar y borrar especialidades (juradurías) de una edición mientras el padrón no esté congelado, para que las asignaciones de jurados tengan un catálogo real.

**Blocked by:** None. La tabla `especialidad` existe desde `0007-asignaciones-jurado.sql`.

**Status:** implementado.

- [x] `GET /api/admin/ediciones/:edicionId/especialidades` lista las especialidades por `orden`.
- [x] `POST /api/admin/ediciones/:edicionId/especialidades` crea con `nombre`, `codigo` y `orden`; nace `activa`.
- [x] `PATCH /api/admin/ediciones/:edicionId/especialidades/:especialidadId` modifica `nombre`, `codigo`, `orden` y `activa`.
- [x] `DELETE /api/admin/ediciones/:edicionId/especialidades/:especialidadId` borra físicamente solo si no tiene asignaciones de jurado.
- [x] `codigo` y `orden` son únicos por edición; un choque responde `409`.
- [x] Si alguna noche de la edición ya no está en `DRAFT`, el padrón está congelado y la escritura responde `409 padron_congelado`.
- [x] Crear y modificar quedan registrados en `auditoria` en la misma transacción.
- [x] Sin sesión responde `401`; sin rol `ADMINISTRADOR`, `403`.
- [x] Pruebas de comportamiento en `api/test/modules/ediciones/especialidades.test.js` con PostgreSQL real.

**Notas y bloqueos heredados**

- El catálogo de especialidades 2027 (R10) sigue pendiente: esta API administra datos, no fija el catálogo.
- La congelación del padrón al abrir la primera noche está confirmada (opción B). El guard se implementa aunque la apertura todavía no exista.
