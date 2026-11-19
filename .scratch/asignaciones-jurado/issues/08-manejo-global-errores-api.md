# 08: Manejo global de errores de la API

**What to build:** Un middleware de error al final de `api/src/app.js` que responda siempre JSON controlado y sin detalles internos, para todas las rutas.

**Blocked by:** Ninguno. Detectado en la revisión del ticket 03.

**Status:** pendiente.

- [ ] `app.use((error, request, response, next) => ...)` responde `500 { error: "error_interno", mensaje: "No se pudo completar la operación." }` para cualquier error no manejado.
- [ ] Los errores inesperados se registran en logs sin SQL, stack traces, credenciales ni tokens (AGENTS.md §7 y §10).
- [ ] Los errores esperables con `status`/`type` de Express (por ejemplo `entity.parse.failed` de `express.json()`) se traducen a su código de dominio cuando corresponda.
- [ ] Prueba observable: una ruta que lance un error inesperado devuelve `500` con el cuerpo controlado y sin exponer el mensaje original; las respuestas `400`/`401`/`403`/`404`/`409` existentes no cambian.
- [ ] Quitar el manejo local del router de asignaciones (ticket 03) y de los demás routers una vez que el middleware global esté probado.

**Nota:** hoy los routers `admin-ediciones.js`, `admin-invitaciones.js`, `admin-usuarios.js` y `admin-asignaciones.js` traducen sus propios errores de dominio, pero un error no previsto pasa al manejador por defecto de Express, que en producción puede exponer un stack trace. El ticket 03 ya responden `500` controlado solo en su ruta de alta.
