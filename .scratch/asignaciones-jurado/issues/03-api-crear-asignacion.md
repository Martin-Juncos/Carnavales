# 03: API — crear asignación de jurado en noche `DRAFT`

**What to build:** El Administrador asigna un Jurado a una noche competitiva y una especialidad; la API valida los contextos y deja evidencia del actor.

**Blocked by:** Tickets 01 y 02.

**Status:** pendiente.

- [ ] `POST /api/admin/asignaciones` con `juradoId`, `nocheId`, `especialidadId` valida: jurado existe y tiene rol `JURADO`, noche existe y pertenece a la edición, especialidad existe y está activa en esa edición, y no hay duplicado activo.
- [ ] Se permiten altas mientras la noche esté en `DRAFT` aunque la edición esté `OPEN`; se rechazan cuando la noche está `OPEN` o `CLOSED`.
- [ ] La identidad del actor y sus permisos salen de la sesión (`request.usuario.id`), nunca de campos del cuerpo.
- [ ] La creación es transaccional y registra auditoría; errores de validación `400`, conflicto `409`, sin permiso `403`, no autenticado `401`.
- [ ] Prueba observable: alta válida persiste y aparece en el listado; noche `OPEN` es rechazada; jurado inválido o noche inexistente son rechazados sin registro parcial.
