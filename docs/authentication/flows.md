# Flujos de autenticación y administración

Este documento describe los comportamientos acordados para la aplicación. Su estado de implementación se mantiene en [la guía de autenticación](README.md); las tablas y restricciones están en [base de datos](database.md).

## Permisos iniciales acordados a partir de Carnavales2027

Se adopta el reparto de acceso observado en Carnavales2027 para la primera versión. Los nombres del nuevo proyecto se mantienen en español; los códigos entre paréntesis solo identifican su equivalente en la referencia.

| Rol (equivalencia en la referencia) | Acceso acordado |
|---|---|---|
| Administrador (`ADMIN`) | Gestiona el área administrativa y usuarios/invitaciones; puede consultar resultados y penalidades. No puede liberar resultados ni ejecutar el sorteo ceremonial. |
| Jurado (`JUDGE`) | Usa las funciones de jurado. En la etapa de votación también requerirá un perfil registrado y no suspendido; ese perfil queda aplazado. |
| Escribano (`ESCRIBANO`) | Puede consultar y liberar resultados, y ejecutar el sorteo ceremonial. |
| Comisario (`COMISARIO`) | Puede acceder al área de penalidades junto con Administrador. |

La referencia también tiene un rol distinto, `SCRUTINEER`, que no está incluido en el catálogo inicial. Sus permisos no se agregan a ningún rol del nuevo proyecto. Esta matriz queda acordada para el diseño; la implementación de cada protección se definirá al construir las rutas.

## Gestión administrativa de usuarios y roles

Estas operaciones requieren una sesión autenticada cuyo usuario tenga asignado el rol `ADMINISTRADOR` en ese momento. Ninguna persona puede modificar sus propios roles ni eliminar su propia cuenta, aunque sea administradora.

### Consulta de usuarios e invitaciones

1. El listado de usuarios es paginado y permite buscar por correo o nombre. Muestra nombre, correo, roles asignados, fecha de alta y si la cuenta tiene una sesión activa.
2. El listado de invitaciones muestra correo invitado, rol inicial, estado, vencimiento, creador y fechas de aceptación o revocación. Permite filtrar por estado y correo.
3. Ninguna de estas vistas muestra hashes de contraseña, tokens, secretos de segundo factor ni códigos temporales.

### Asignación y retiro de roles

1. El administrador elige una persona y un rol del catálogo, o pide quitar uno de los roles ya asignados. Cada operación afecta a un solo rol.
2. Asignar un rol ya asignado no duplica el vínculo: la clave compuesta `(usuario_id, rol_id)` lo impide y la operación se trata como ya aplicada. Toda asignación nueva registra `asignado_por` con el administrador que la ejecutó y `asignado_en` con la fecha y hora del momento.
3. Quitar un rol elimina el vínculo de `usuario_rol`; no borra la cuenta ni sus credenciales.
4. No se puede quitar el rol `ADMINISTRADOR` al primer administrador. Los administradores posteriores pueden perder ese rol o ser eliminados aunque sean los últimos posteriores, porque el primero permanece protegido. El índice único parcial sobre `es_inicial` impide dos primeros administradores concurrentes.
5. El cambio rige de inmediato: las peticiones siguientes se autorizan contra `usuario_rol`, sin esperar a que la persona vuelva a iniciar sesión.
6. Si el rol activo guardado en el navegador deja de estar asignado, la interfaz obliga a elegir otro entre los roles vigentes. Si la persona se queda sin roles, conserva la sesión pero no accede a ninguna función hasta que un administrador le asigne uno.

### Revocación de invitaciones

1. El administrador solo puede revocar invitaciones en estado `pendiente`. La operación cambia el estado a `revocada` y registra `revocada_en`; la fila se conserva.
2. El enlace revocado deja de funcionar de inmediato y muestra el mensaje genérico ya definido. Un reenvío posterior emite un token nuevo.
3. Una invitación `aceptada` o `vencida` no se revoca.

### Eliminación de usuarios

1. Se puede eliminar cualquier cuenta salvo la del primer administrador, incluso si tiene el rol `ADMINISTRADOR`. La protección se identifica mediante `es_inicial = true` en su asignación de `ADMINISTRADOR`.
2. El primer administrador no puede borrarse ni perder el rol `ADMINISTRADOR`. Esa asignación también impide que el sistema quede sin una cuenta administrativa.
3. La eliminación de cualquier otra cuenta es definitiva: no hay desactivación ni papelera. Se borran en cascada su credencial, sus sesiones, su configuración de segundo factor y sus asignaciones de rol. Cualquier sesión abierta deja de ser válida.
4. Al borrar a un usuario que asignó roles, `usuario_rol.asignado_por` pasa a `NULL` (`ON DELETE SET NULL`): sus asignaciones se conservan y se pierde solo la atribución.
5. Al borrar la cuenta, su correo queda libre y puede recibir una nueva invitación. No se recuperan datos de la cuenta anterior.

Estas reglas deberán comprobarse con las transacciones y claves foráneas reales de PostgreSQL al implementar.

## Flujo inicial de alta

1. Durante la instalación, la persona operadora ejecuta el comando de configuración inicial para crear al primer administrador.
2. El administrador crea una invitación para una dirección de correo.
3. El sistema genera un enlace temporal, guarda únicamente el hash del token y establece un vencimiento de 72 horas.
   Si ya existe una invitación pendiente para ese correo, el reenvío invalida el token anterior y crea uno nuevo.
   En desarrollo y pruebas, el enlace se muestra en la consola; en producción, se envía por correo.
4. La persona invitada abre el enlace y elige una contraseña.
5. Better Auth crea el usuario y su credencial; la invitación queda aceptada y no se puede volver a usar.
6. Un inicio de sesión posterior crea una sesión.

El comando inicial debe obtener la contraseña de forma segura —sin pasarla como argumento ni escribirla en registros— y delegar en Better Auth la creación de la cuenta y el hash de la contraseña. La asignación inicial de `ADMINISTRADOR` con `es_inicial = true` funciona como marca de inicialización y no se puede quitar ni borrar.

### Detalle del flujo de invitación y aceptación

**Crear o reenviar**

1. Un administrador indica correo y rol inicial. El sistema normaliza el correo y rechaza la operación si ya existe una cuenta para esa dirección.
2. Si hay una invitación pendiente para el correo, el reenvío la revoca y emite otra; si la anterior venció, primero la marca `vencida`. El índice parcial garantiza que quede como máximo una pendiente.
3. El sistema genera un token aleatorio de un solo uso, guarda solo su hash y fija `vence_en` a 72 horas. El token sin hash se usa únicamente para formar el enlace de invitación.
4. En desarrollo y pruebas, el enlace se muestra en consola; en producción, se envía por correo. Decisión del proyecto: si falla la entrega, la invitación permanece pendiente, se informa el fallo al administrador y un reenvío emite un token nuevo e invalida el anterior.

**Aceptar**

1. Al abrir el enlace, el sistema calcula el hash del token recibido y busca la invitación correspondiente.
2. En una operación atómica, comprueba que siga `pendiente`, que `vence_en` todavía sea posterior a la hora actual (no basta con el estado almacenado) y que el correo todavía no tenga una cuenta. Un token inválido, vencido, revocado o ya consumido no crea una cuenta.
3. La persona elige una contraseña. Better Auth crea el usuario y la credencial; la contraseña se guarda como hash. La aceptación confirma el correo (`correo_verificado = true`) y la cuenta queda con `doble_factor_habilitado = true`.
4. El sistema asigna el rol inicial usando el administrador que creó la invitación como `asignado_por`, marca la invitación `aceptada` y registra `aceptada_en`. El token queda consumido porque la invitación ya no está pendiente.
5. La aceptación no inicia sesión automáticamente. En el primer inicio de sesión, la contraseña debe ir seguida del OTP por correo.

La creación de usuario, credencial, asignación de rol y consumo de invitación deben quedar consistentes aunque lleguen dos aceptaciones simultáneas o falle una parte del proceso; la transacción concreta deberá verificarse al implementar con Better Auth y PostgreSQL.

Para token incorrecto, vencido, revocado o ya utilizado, se muestra el mismo mensaje: “El enlace no es válido o venció. Solicita una nueva invitación al administrador.” No se crea una cuenta ni se revela cuál de esos estados tenía la invitación.

### Flujo de inicio de sesión y segundo factor

1. La persona envía correo y contraseña. Better Auth normaliza el correo y valida la credencial.
2. Como las cuentas se crean con `doble_factor_habilitado = true`, una contraseña correcta inicia el desafío OTP y no concede acceso a las rutas protegidas. Better Auth elimina la sesión provisional y devuelve el estado de redirección al segundo factor.
3. El cliente solicita el código de seis dígitos al correo de la cuenta. Se guarda cifrado en `verificacion.valor` —la configuración debe fijar `otpOptions.storeOTP: "encrypted"`, porque el valor predeterminado del plugin es `plain`—, vence a los 3 minutos y el desafío permite hasta 5 intentos. La aplicación impone 30 segundos entre envíos por cuenta y limita a 5 las solicitudes de envío desde una misma IP en una ventana móvil de 10 minutos. Un reenvío invalida el código anterior. Si falla la entrega, no se concede sesión; se informa con un error genérico y la solicitud cuenta para ambos límites.
4. La persona envía el código. Si es incorrecto o venció, no obtiene una sesión autenticada; tras agotar los intentos debe solicitar un código nuevo. Si es correcto, el sistema consume el código de forma atómica, crea la sesión autenticada y revoca cualquier sesión anterior de esa cuenta.
5. Ya autenticada, la persona usa su único rol asignado o elige uno entre los que tiene. Esa selección solo organiza la interfaz; cada acción sigue autorizándose contra las asignaciones reales en `usuario_rol`.

No se confían dispositivos. Decisión del proyecto: una sesión vence tras 12 horas sin actividad y se renueva mientras siga activa; en el spike se verificó la duración de 12 horas (`expiresIn`) y la renovación cada 10 minutos (`updateAge`); la renovación por actividad sigue sin probarse. Una cuenta solo puede tener una sesión autenticada activa: al completar el OTP en un nuevo dispositivo, se revocan las sesiones anteriores de esa misma cuenta. Un intento que no completa el OTP no revoca la sesión existente. Al recuperar la contraseña, se revocan todas las sesiones del usuario que la cambió, no las de otras cuentas.

La configuración actual implementa la sesión única con `databaseHooks.session.create.after` en `api/src/auth.js`: al crear una sesión, elimina las anteriores de esa cuenta. El spike (`api/session-race.mjs`) observó una sesión activa en 50 de 50 iteraciones en una instancia. Esto no demuestra el comportamiento bajo concurrencia o despliegue con varias instancias; esa validación sigue pendiente. El hook se ejecuta después de la creación de la sesión, por lo que la garantía ante carreras debe volver a evaluarse si cambia la topología.

### Envío del OTP y aviso de fallo

Better Auth ejecuta el callback `sendOTP` y, si falla, registra el error y aun así responde éxito. Para cumplir la política del proyecto, la API expone una ruta propia de envío que:

1. aplica la espera de 30 segundos y el límite por IP antes de llamar al plugin;
2. genera un identificador de solicitud, lo pasa al callback `sendOTP` y espera el resultado real del envío;
3. guarda ese resultado en un almacén temporal en memoria, con clave por solicitud y vencimiento corto, y lo elimina al responder;
4. si el envío falló, responde un error genérico; la solicitud ya consumió ambos límites y la persona puede reintentar cuando corresponda.

El código y su fila en `verificacion` los sigue generando Better Auth; el envoltorio no replica esa lógica. Si el despliegue usa varias instancias, el almacén temporal del resultado debe ser compartido o el envío debe resolverse en la misma instancia que atiende la solicitud. Además, los contadores de límites por cuenta e IP también deben compartirse de forma atómica; contadores separados por instancia permitirían superar los límites configurados.

### Flujo de recuperación de contraseña

1. La persona solicita recuperar la contraseña con su correo. La respuesta no revela si existe una cuenta; el envío se hace solo si la dirección está registrada.
2. Better Auth genera un enlace de recuperación de un solo uso, válido por una hora, y lo envía por el canal configurado. El token se guarda según el comportamiento estándar documentado en `verificacion`.
3. La persona define una contraseña nueva. Si el enlace no existe, venció o ya se consumió, no se cambia la credencial y se muestra un mensaje genérico.
4. Si se guarda correctamente la contraseña, se consume el token. No se inicia sesión automáticamente; la persona vuelve a ingresar con contraseña y OTP.
5. Al guardar la contraseña nueva, Better Auth revoca todas las sesiones de esa cuenta en todos sus dispositivos; no afecta a otras cuentas. Para volver a entrar, la persona debe autenticarse otra vez con contraseña y OTP. Esto exige configurar `emailAndPassword.revokeSessionsOnPasswordReset: true`, porque Better Auth no revoca sesiones de forma predeterminada.

### Política de contraseñas

1. Se usa la validación de Better Auth: mínimo 8 caracteres y máximo 128. No se exige una combinación de mayúsculas, minúsculas, números y símbolos.
2. Se permiten espacios y frases largas. La misma regla se aplica al aceptar una invitación y al recuperar la contraseña.
3. No hay caducidad periódica ni historial de contraseñas anteriores en esta versión. Tampoco se consulta una lista de contraseñas comunes.
4. La contraseña nunca se registra en logs, mensajes de error ni respuestas de la API; solo se almacena su hash administrado por Better Auth.

El límite de 8 caracteres es el mínimo de la biblioteca, no una recomendación de seguridad. El OTP obligatorio, los límites de intentos y la espera entre envíos reducen el riesgo de acceso por adivinación.

### Cierre y vencimiento de sesión

1. Al cerrar sesión, el sistema revoca la sesión en el servidor, elimina la cookie de sesión y descarta el rol activo guardado en el navegador.
2. Si la sesión vence por 12 horas sin actividad, la siguiente petición se trata como no autenticada. La interfaz descarta el rol activo, muestra un mensaje genérico de sesión vencida y lleva a la pantalla de acceso.
3. Lo mismo ocurre si un administrador revoca la cuenta, si se elimina el usuario o si se recupera la contraseña en otro dispositivo: la sesión deja de ser válida y la interfaz vuelve al acceso.
4. Después de autenticarse de nuevo con contraseña y OTP, la persona siempre llega al inicio. No se restaura la pantalla ni la acción que estaba realizando.
5. No hay opción de “recordarme” ni sesiones que sobrevivan al plazo de inactividad.

El tiempo de vida y renovación se configuran en Better Auth; la validación operativa de sesiones en una topología productiva sigue pendiente.

## Referencias de implementación

- `api/src/auth.js`: Better Auth, OTP, sesiones y recuperación.
- `api/src/invitaciones.js` y `api/src/bootstrap.js`: invitaciones y primer administrador.
- `api/src/migrate.js` y `api/migrations/`: migraciones SQL ordenadas.
- `api/src/email.js`: consola para desarrollo y Gmail configurado mediante
  `EMAIL_PROVIDER`. No se documenta soporte para otros proveedores.
- `api/test/` y `client/test/`: pruebas de API y cliente. Las pruebas que usan
  PostgreSQL requieren una base descartable.
