# 07: Eliminar un usuario con asignaciones responde conflicto controlado

**What to build:** La eliminación administrativa de un usuario que tiene asignaciones o registros de auditoría debe responderse como conflicto esperado, sin exponer un error 500 ni borrar evidencia.

**Blocked by:** Ticket 01. Detectado al integrar la migración 0007 con `api/src/usuarios.js`.

**Status:** pendiente.

- [ ] `eliminarUsuario` traduce el error `23503` de PostgreSQL (FK `RESTRICT` desde `asignacion_jurado.jurado_id`, `creada_por`, `revocada_por` o `auditoria.actor_id`) a `ErrorUsuario("usuario_con_historial")` y la ruta responde `409`.
- [ ] Prueba observable: un usuario con una asignación no se elimina, la API responde `409` con `{ error, mensaje }` y la fila sigue existiendo.
- [ ] Un usuario sin historial sigue pudiéndose eliminar (comportamiento actual cubierto en `api/test/eliminar-usuarios.test.js`).
- [ ] La respuesta no incluye SQL, detalles de infraestructura ni datos personales del usuario más allá del mensaje genérico.

**Nota:** `database-design.md:374-383` ya advertía que la eliminación de usuarios borraba `usuario_rol` en cascada y que las asignaciones históricas no debían perder trazabilidad. La migración 0007 usa `RESTRICT` en las FK nuevas; falta traducir el error a un código de dominio.
