# 08: Manejo global de errores de la API

**What to build:** Un middleware de error al final de `api/src/app.js` que responda siempre JSON controlado y sin detalles internos, para todas las rutas.

**Blocked by:** Ninguno. Detectado en la revisión del ticket 03.

**Status:** implementado. Contrato documentado en `docs/authentication/api-reference.md` y `docs/voting/asignaciones-api.md`.

- [x] `app.use(manejarErrores)` al final de `createApp` responde `500 { error: "error_interno", mensaje: "No se pudo completar la operación." }` para cualquier error no manejado.
- [x] Los errores inesperados se registran en logs sin SQL, stack traces, credenciales ni tokens: solo se escribe el método HTTP y un texto fijo, nunca `error.message`, la ruta ni el stack.
- [x] Los errores esperables con `type` de Express se traducen: `entity.parse.failed` → `400 campos_invalidos` y `entity.too.large` → `413 cuerpo_demasiado_grande`.
- [x] Prueba observable: `api/test/http/manejo-errores.test.js` verifica el `500` controlado, el log sin filtraciones, el JSON inválido, el cuerpo demasiado grande, la traducción de errores de dominio, la delegación cuando ya se enviaron cabeceras, que un router real conserva sus estados `400`/`401`/`403`/`404`/`409` y que `createApp` usa el middleware en una ruta real.
- [x] Se quitaron los manejadores locales de `admin-asignaciones.js`, `admin-ediciones.js`, `admin-invitaciones.js`, `admin-usuarios.js` e `invitaciones-publicas.js`. Las tablas de códigos y estados quedaron centralizadas en `api/src/manejo-errores.js`.

**Nota:** hoy los routers `admin-ediciones.js`, `admin-invitaciones.js`, `admin-usuarios.js` y `admin-asignaciones.js` traducen sus propios errores de dominio, pero un error no previsto pasa al manejador por defecto de Express, que en producción puede exponer un stack trace. El ticket 03 ya responden `500` controlado solo en su ruta de alta.

## Comentarios

- 2026-11-19: implementado con TDD. La prueba roja de `createApp` devolvió el HTML por defecto de Express; al montar el middleware pasó a JSON controlado.
- 2026-11-19: se creó `api/src/manejo-errores.js` con una única tabla de códigos de dominio → estado HTTP. Antes cada router tenía la suya, con riesgo de respuestas divergentes para el mismo código. Las traducciones existentes se conservaron: `datos_invalidos` sigue siendo `422` en la aceptación pública y `invitacion_invalida` `400`.
- 2026-11-19: el middleware se monta tanto al final de `createApp` como al final de cada router. El segundo montaje es necesario porque varias pruebas montan los routers directamente en una app Express, sin `createApp`; así se prueba el mismo manejo de errores en producción y en esos tests. No duplica lógica: ambos usan la misma función.
- 2026-11-19: el log deliberadamente no incluye `error.message`. Los errores de PostgreSQL contienen SQL, nombres de restricción y a veces valores de datos; un mensaje de Better Auth puede contener correos. Solo se registra el método, que nunca es una credencial.
- 2026-11-19: `entity.too.large` se traduce a un código propio (`cuerpo_demasiado_grande`) con estado `413`. Esto **sí cambia** el contrato anterior de las rutas de asignaciones: su `cuerpoJson` local respondía `400 campos_invalidos` ante cualquier error de `express.json()`, incluido el exceso de tamaño. La revisión de spec lo detectó; se mantuvo el `413` por ser semánticamente correcto y quedó documentado en `api-reference.md` y `asignaciones-api.md`.
- 2026-11-19: no se agregó un `404` JSON para rutas `/api` inexistentes: el ticket pide no cambiar las respuestas `400`/`401`/`403`/`404`/`409` existentes, y esa respuesta ya es `404`. Tampoco se modificaron las formas del `401`, el `403` ni el `503` de `/health`; la documentación lo aclara para no generalizar en falso que todo error lleva `mensaje`.
- 2026-11-19: la revisión pidió reemplazar el test sintético de estados por uno de un router real. Se usó `crearRutasAdminUsuarios` con un pool falso para cubrir `400`, `401`, `403`, `404` y `409` a través del middleware compartido.
- 2026-11-19: la rama `headersSent` delega al manejador de Express porque no es posible responder JSON después de enviar cabeceras. Tiene prueba propia que verifica la delegación; es una limitación inherente de HTTP, no un error de la respuesta normal.
- 2026-11-19: `api-reference.md` aclara que `/api/auth/*` lo responde Better Auth y queda fuera del middleware. El ticket dice «para todas las rutas», pero en la práctica se aplica a las rutas propias de la app; las de Better Auth ya tenían su propio manejo.
- 2026-11-19: las pruebas de `createApp` usan un `auth` mínimo con sesión simulada y un `pool` que falla solo en la consulta de roles; no necesitan PostgreSQL y comprueban el cableado real del middleware.
