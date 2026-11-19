# 07: Abrir la edición (idempotente y auditado)

**What to build:** Acción administrativa para pasar una edición de `CONFIGURING` a `OPEN`, con clave de operación idempotente y auditoría.

**Blocked by:** None para la edición. No congela reglamento ni padrón (opción B).

**Status:** servicio implementado; ruta HTTP pendiente de decisión de despliegue.

- [x] Servicio de apertura que escribe `operacion_apertura` y cambia el estado en una sola transacción (`api/src/apertura-edicion.js`, migración `0009`).
- [x] Repetir la misma `claveOperacion` devuelve el mismo resultado (`repetida: true`) sin duplicar efectos.
- [x] Una clave usada con otra edición responde `clave_reutilizada` (409).
- [x] El trigger de base exige el rol `carnavales_servicio_apertura` (prueba con una cuenta fuera del rol).
- [x] Auditoría sin secretos (`edicion_abierta`, sin tokens ni claves).
- [x] Pruebas de comportamiento, incluidas concurrencia y reintento (`api/test/apertura-edicion.test.js`).
- [ ] Ruta HTTP. **Bloqueada por una decisión de despliegue:** el pool de la aplicación no debe ser miembro de `carnavales_servicio_apertura`, así que hace falta una conexión de apertura separada (variable de entorno o cuenta dedicada). Hasta decidirlo, no se monta la ruta.

**Nota:** `operacion_apertura` no estaba en 0006, aunque `diseno-fisico-evento.md` §5.17 lo indicaba. Se corrigió.
