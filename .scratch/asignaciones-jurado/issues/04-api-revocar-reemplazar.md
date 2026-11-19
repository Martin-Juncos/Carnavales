# 04: API — revocar y reemplazar asignaciones preservando evidencia

**What to build:** El Administrador corrige la cobertura mientras no exista una planilla confirmada que la altere; una vez presentada, la evidencia se conserva y el cambio se rechaza.

**Blocked by:** Tickets 01 y 03. La regla "planilla confirmada bloquea el cambio" depende del modelo de planillas de `votacion-offline`; hasta que exista, se implementa la operación sin esa evidencia y se documenta el pendiente, sin inventar el modelo de votos.

**Status:** pendiente.

- [ ] `DELETE /api/admin/asignaciones/:id` revoca (baja lógica) una asignación; `PATCH` o `POST` de reemplazo cambia jurado/especialidad de forma atómica.
- [ ] Se rechaza la revocación o el reemplazo si la asignación tiene una planilla confirmada o recibida por el servidor; el voto original nunca se modifica.
- [ ] No se borra físicamente la asignación si tiene historial (votos, cierres, planillas, auditoría).
- [ ] Toda revocación/reemplazo registra auditoría con el actor de la sesión; roles distintos de `ADMINISTRADOR` reciben `403`.
- [ ] Prueba observable: revocar/reemplazar funciona sin planilla confirmada; el mismo cambio se rechaza cuando alteraría evidencia confirmada (cuando el modelo de planillas esté disponible).
