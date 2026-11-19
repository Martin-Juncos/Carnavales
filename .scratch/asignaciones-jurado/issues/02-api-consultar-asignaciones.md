# 02: API — consultar jurados disponibles y asignaciones por noche

**What to build:** El Administrador puede listar los jurados disponibles y las asignaciones de cada noche, con la identidad derivada de la sesión autenticada, para detectar coberturas faltantes antes de abrir la noche.

**Blocked by:** Ticket 01.

**Status:** pendiente.

- [ ] `GET /api/admin/asignaciones` devuelve las asignaciones por noche y especialidad, con el estado de la noche y del jurado; la respuesta usa `camelCase`.
- [ ] `GET /api/admin/jurados` (o el campo derivado en la misma respuesta) expone los usuarios con rol `JURADO` disponibles para asignar, sin credenciales ni datos sensibles.
- [ ] Solo `ADMINISTRADOR` (verificado en `usuario_rol` contra la sesión); sin sesión responde `401` y sin rol `403`, igual que `api/src/autorizacion.js`.
- [ ] Un Fiscal/Escribano puede consultar las planillas esperadas derivadas de las asignaciones para verificar faltantes al cerrar (se coordina con `cierre-resultados`; no implementar cierres aquí).
- [ ] Prueba de comportamiento en `api/test/` con PostgreSQL descartable: el listado refleja lo persistido después de crear una asignación y un rol distinto no puede consultarlo.
