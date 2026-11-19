# 07: Eliminar un usuario con asignaciones responde conflicto controlado

**What to build:** La eliminación administrativa de un usuario que tiene asignaciones o registros de auditoría debe responderse como conflicto esperado, sin exponer un error 500 ni borrar evidencia.

**Blocked by:** Ticket 01. Detectado al integrar la migración 0007 con `api/src/usuarios.js`.

**Status:** implementado. Contrato documentado en `docs/authentication/api-reference.md`.

- [x] `eliminarUsuario` traduce la violación de FK a `ErrorUsuario("usuario_con_historial")` con el mensaje genérico «El usuario tiene historial asociado y no puede eliminarse.», y la ruta responde `409` con `{ error, mensaje }`.
- [x] Prueba observable: un usuario con una asignación no se elimina, la API responde `409` y la fila de usuario y la asignación siguen existiendo.
- [x] Un usuario sin historial sigue pudiéndose eliminar (comportamiento actual cubierto en `api/test/eliminar-usuarios.test.js`).
- [x] La respuesta no incluye SQL, detalles de infraestructura ni datos personales del usuario más allá del mensaje genérico: se compara con el cuerpo exacto y se descartan `23503`, `asignacion_jurado`, `DELETE FROM` y `constraint`.
- [x] Cubierto también el caso de auditoría (`auditoria.actor_id`), que bloquea el borrado por la misma vía.

**Nota:** `database-design.md:374-383` ya advertía que la eliminación de usuarios borraba `usuario_rol` en cascada y que las asignaciones históricas no debían perder trazabilidad. La migración 0007 usa `RESTRICT` en las FK nuevas; faltaba traducir el error a un código de dominio.

## Comentarios

- 2026-11-19: implementado con TDD. La prueba roja mostró que el borrado devolvía un error de PostgreSQL sin traducir y que la ruta respondía `500`.
- 2026-11-19: hallazgo importante: con `ON DELETE RESTRICT`, PostgreSQL 18.4 (versión local verificada) emite `23001` (`restrict_violation`); en versiones anteriores emite `23503` (`foreign_key_violation`, que también aparece con `NO ACTION`). Se traducen ambos para que el contrato sea estable entre versiones, no solo por el código observado en la prueba local. El ticket hablaba solo de `23503`; se amplía por compatibilidad.
- 2026-11-19: no hizo falta tocar `api/src/admin-usuarios.js`: la ruta `DELETE /:id` ya responde `409` a todo `ErrorUsuario` distinto de `usuario_no_encontrado`, y serializa `{ error: codigo, mensaje }`. Se agregó una prueba de la respuesta HTTP para fijar ese contrato.
- 2026-11-19: se corrigió el comentario de `eliminarUsuario`, que afirmaba que las asignaciones se borraban en cascada; ahora documenta que sesiones/roles se borran en cascada y asignaciones/auditoría se conservan por `RESTRICT`. También se renombró el test heredado «eliminar un usuario borra su cuenta, sesiones y asignaciones», que no creaba asignaciones.
- 2026-11-19: las pruebas usan una base PostgreSQL descartable y un fixture mínimo de edición, noche, especialidad, asignación y auditoría. La edición es creada por el administrador del fixture para que el único motivo del conflicto sea el historial del jurado.
- 2026-11-19: la revisión de spec señaló que `23001`/`23503` también puede provenir de las FK `RESTRICT` de la migración 0006 (`edicion.creada_por`, `edicion.abierta_por`, `version_reglamento.creada_por` y `publicada_por`). El mensaje «tiene historial asociado» cubre todos esos casos y el contrato en `api-reference.md` se generalizó en consecuencia; no se distingue el origen en la respuesta para no filtrar detalles internos.
- 2026-11-19: la revisión de estándares sugirió un mapa explícito de estados en `admin-usuarios.js`. Se difiere al ticket 08, que ya prevé simplificar los manejadores de error locales con un middleware global.
