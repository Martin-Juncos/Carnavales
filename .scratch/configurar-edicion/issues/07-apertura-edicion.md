# 07: Abrir la edición (idempotente y auditado)

**What to build:** Acción administrativa para pasar una edición de `CONFIGURING` a `OPEN`, con clave de operación idempotente y auditoría.

**Blocked by:** None para la edición. No congela reglamento ni padrón (opción B).

**Status:** pendiente.

- [ ] Servicio de apertura que escribe `operacion_apertura` y cambia el estado en una sola transacción.
- [ ] Repetir la misma `claveOperacion` devuelve el mismo resultado sin duplicar efectos.
- [ ] Una clave usada con otra edición responde conflicto.
- [ ] El trigger de base exige el rol `carnavales_servicio_apertura`.
- [ ] Auditoría sin secretos.
- [ ] Pruebas de comportamiento, incluidas concurrencia y reintento.
