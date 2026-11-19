# 07: Abrir la edición (idempotente y auditado)

**What to build:** Acción administrativa para pasar una edición de `CONFIGURING` a `OPEN`, con clave de operación idempotente y auditoría.

**Blocked by:** None para la edición. No congela reglamento ni padrón (opción B).

**Status:** implementado.

- [x] Servicio de apertura que escribe `operacion_apertura` y cambia el estado en una sola transacción (`api/src/apertura-edicion.js`, migración `0009`).
- [x] Repetir la misma `claveOperacion` devuelve el mismo resultado (`repetida: true`) sin duplicar efectos.
- [x] Una clave usada con otra edición responde `clave_reutilizada` (409).
- [x] El trigger de base exige el rol `carnavales_servicio_apertura` (prueba con una cuenta fuera del rol).
- [x] Auditoría sin secretos (`edicion_abierta`, sin tokens ni claves).
- [x] Pruebas de comportamiento, incluidas concurrencia y reintento (`api/test/apertura-edicion.test.js`).
- [x] Ruta HTTP `POST /api/admin/ediciones/:edicionId/apertura`, con conexión separada `DATABASE_URL_APERTURA` (opción 1 elegida). Sin esa variable responde 503.
- [x] Comprobación al arrancar: la cuenta debe ser miembro del rol y no superusuario.

**Nota:** `operacion_apertura` no estaba en 0006, aunque `diseno-fisico-evento.md` §5.17 lo indicaba. Se corrigió.
