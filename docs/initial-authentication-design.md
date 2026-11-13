# Diseño inicial de autenticación y creación de cuentas

**Estado:** Borrador de diseño; la implementación todavía no comenzó.  
**Alcance:** Definir la tecnología web inicial, el modelo de datos para el inicio de sesión y el alta de cuentas controlada por administradores.

## Decisiones confirmadas

| Área | Decisión |
|---|---|
| Cliente y API | Mantener separados el cliente web y la API: React/Vite en `client/` y la API Node.js en `api/`. |
| Autenticación | Usar Better Auth para las credenciales de correo y contraseña y para las sesiones. |
| Versión de Better Auth | Tomar `1.7.22` como versión base candidata; volver a verificarla y fijarla en el proyecto al comenzar la implementación. |
| Base de datos | Usar PostgreSQL. Sus restricciones relacionales y transacciones se ajustan a los registros relacionados de usuarios, cuentas, sesiones e invitaciones. |
| Nombres de la base de datos | Usar nombres en español para las tablas y las columnas físicas. Configurar el mapeo de los nombres canónicos de Better Auth; su modelo `twoFactor` usará la tabla física `doble_factor`. |
| Registro público | Deshabilitado. Un administrador inicia cada alta mediante una invitación. |
| Contraseña inicial | La persona invitada elige su propia contraseña; el administrador no la gestiona. Better Auth administra el hash de la contraseña. |
| Enlace de invitación | De un solo uso; guardar únicamente el hash del token y establecer un vencimiento de 72 horas. |
| Reenvío de invitaciones | Permitir una sola invitación pendiente por correo. Al reenviarla, invalidar el enlace anterior y emitir uno nuevo con 72 horas de vigencia. |
| Estados de invitación | Usar `pendiente`, `aceptada`, `revocada` y `vencida`. La aceptación consume el enlace; el administrador solo puede revocar invitaciones pendientes. |
| Entrega de mensajes | En desarrollo y pruebas, mostrar enlaces y códigos en la consola; en producción, enviar invitaciones, códigos de acceso y recuperación por SMTP o Gmail, seleccionados mediante `EMAIL_PROVIDER`. |
| Verificación de correo | No agregar un paso separado; aceptar la invitación enviada a esa dirección confirma el acceso al correo. |
| Recuperación de contraseña | Incluirla desde la primera versión; usar el mismo canal de entrega que las invitaciones según el entorno. |
| Verificación adicional al iniciar sesión | Después de la contraseña, enviar un código de seis dígitos al correo registrado en cada inicio de sesión. Vence en 3 minutos y permite 5 intentos. Se puede reenviar a los 30 segundos; un código nuevo invalida el anterior. No se confían dispositivos. La aplicación debe imponer la espera de 30 segundos. |
| Correo ya registrado | Rechazar una segunda invitación para una cuenta existente. Asignar o cambiar su rol será una acción administrativa separada. |
| Gestión de roles | El administrador asigna y modifica los roles de a uno. La invitación inicial incluye un solo rol; luego el administrador puede asignar otros. Si una persona tiene más de un rol asignado, puede elegir cuál usar; si tiene uno solo, no puede cambiarlo. La persona no puede asignarse roles por su cuenta. |
| Rol activo | Se conserva en el almacenamiento de sesión del navegador hasta cerrar sesión; no se guarda en la base de datos. Solo cambia la sección visible. La API autoriza cada acción según las asignaciones reales de `usuario_rol`. |
| Catálogo inicial de roles | Incluir Administrador, Jurado, Escribano y Comisario. Evaluar más adelante si se podrán agregar o quitar roles. |
| Primer administrador | Crear la primera cuenta mediante un comando de configuración de una sola vez, ejecutado fuera de una ruta pública. Debe asignar `Administrador` y rechazar una segunda inicialización si ya existe esa asignación en `usuario_rol`; no se agrega una tabla de inicialización. |
| Último administrador | No permitir eliminarlo ni quitarle el rol hasta que se haya asignado otro administrador. |
| Perfil de jurado | No incluir `perfil_jurado` en la base inicial de autenticación; diseñarlo junto con el flujo de votación. |
| Alcance aplazado | El autorregistro público queda fuera del alcance inicial. La autenticación de dos pasos y la asignación y selección de roles forman parte del diseño inicial. |

## Tablas de autenticación

Los nombres de tabla que aparecen a continuación están aprobados. Se eligió Better Auth `1.7.22`; las columnas físicas propuestas se mapearán desde sus nombres canónicos. El DDL y sus restricciones todavía deben verificarse con el generador de esa versión.

| Tabla física | Para qué sirve | Por qué está separada |
|---|---|---|
| `usuario` | Guarda la identidad de la persona. | La identidad es distinta de las credenciales de acceso y de las sesiones activas. La contraseña no se guarda en esta tabla. |
| `cuenta` | Guarda la cuenta de autenticación vinculada a un usuario, incluida la credencial que administra Better Auth. | Separa las credenciales del perfil de la persona y permite admitir otros métodos de autenticación más adelante. |
| `sesion` | Guarda las sesiones de inicio de sesión activas y su vencimiento. | Permite vencer o revocar sesiones sin eliminar al usuario ni sus credenciales. |
| `verificacion` | Guarda registros temporales usados por los flujos de confirmación o recuperación que se habiliten. | Los tokens de verificación tienen un propósito y una vigencia distintos de las credenciales y las sesiones. |
| `doble_factor` | Guarda la configuración y el estado auxiliar del segundo factor, como verificación, códigos de respaldo e intentos fallidos. | La configuración de seguridad de segundo factor es distinta de la identidad, la contraseña y las sesiones. |
| `invitacion` | Guarda las invitaciones creadas por administradores: correo invitado, un rol inicial, hash del token, vencimiento, estado, creador y datos de aceptación. | La invitación es parte del proceso de alta, no una credencial ni una sesión de inicio de sesión. |

### Mapeo de los modelos de Better Auth

Este mapeo conceptual se basa en la versión `1.7.22`; no reemplaza el DDL generado:

| Modelo de Better Auth | Tabla física | Campos físicos propuestos | Relaciones y notas |
|---|---|---|---|
| `user` | `usuario` | `id`, `nombre`, `correo`, `correo_verificado`, `imagen_perfil`, `creado_en`, `actualizado_en`, `doble_factor_habilitado` | `correo` es único. `doble_factor_habilitado` se activa para las cuentas del sistema. |
| `account` | `cuenta` | `id`, `id_cuenta`, `id_proveedor`, `usuario_id`, `token_acceso`, `token_actualizacion`, `id_token`, `token_acceso_vence_en`, `token_actualizacion_vence_en`, `alcance`, `hash_contrasena`, `creado_en`, `actualizado_en` | `usuario_id` referencia `usuario.id`. `hash_contrasena` contiene el hash administrado por Better Auth, no la contraseña en texto claro; los campos de tokens de proveedor son opcionales. |
| `session` | `sesion` | `id`, `usuario_id`, `vence_en`, `token`, `creado_en`, `actualizado_en`, `direccion_ip`, `agente_usuario` | `usuario_id` referencia `usuario.id`; `token` es único. |
| `verification` | `verificacion` | `id`, `identificador`, `valor`, `vence_en`, `creado_en`, `actualizado_en` | Guarda valores temporales para operaciones como OTP y recuperación de contraseña. |
| `twoFactor` | `doble_factor` | `id`, `usuario_id`, `secreto`, `codigos_respaldo`, `verificado`, `intentos_fallidos`, `bloqueado_hasta` | `usuario_id` referencia `usuario.id`. Better Auth define el modelo del plugin; el modo OTP por correo es el método inicial elegido. |

### Ejemplo de columnas para `usuario`

Este ejemplo es conceptual; todavía no es el DDL definitivo:

| Columna física en español | Significado |
|---|---|
| `id` | Identificador del usuario. |
| `nombre` | Nombre para mostrar. |
| `correo` | Dirección de correo electrónico. |
| `correo_verificado` | Indica si se verificó la dirección de correo. |
| `imagen_perfil` | Referencia opcional a una imagen de perfil. |
| `creado_en` | Fecha y hora de creación. |
| `actualizado_en` | Fecha y hora de la última actualización. |
| `doble_factor_habilitado` | Indica si la cuenta debe completar el segundo factor; se habilitará para todas las cuentas. |

La implementación exacta de los roles y del permiso de administración todavía no está definida.

### Columnas propuestas para `invitacion`

Este es el diseño conceptual aprobado; todavía no es el DDL definitivo:

| Columna física en español | Significado |
|---|---|
| `id` | Identificador de la invitación. |
| `correo_invitado` | Dirección a la que se envía la invitación. |
| `rol_inicial_id` | Rol único que el administrador asigna al crearla; referencia a `rol`. |
| `hash_token` | Hash único del token de un solo uso; el token original no se almacena. |
| `estado` | `pendiente`, `aceptada`, `revocada` o `vencida`. |
| `vence_en` | Fecha y hora en que expira el enlace, 72 horas después de su emisión. |
| `creada_por` | Usuario administrador que creó la invitación; referencia a `usuario`. |
| `creada_en` | Fecha y hora de creación. |
| `aceptada_en` | Fecha y hora de aceptación; nula mientras siga pendiente. |
| `revocada_en` | Fecha y hora de revocación; nula si no se revocó. |

Better Auth conserva sus nombres canónicos para los modelos y campos que usa la aplicación. Sus mapeos `modelName` y `fields` determinan los nombres físicos en español. El esquema generado debe coincidir con esos mapeos.

### Modelo de roles

El requisito de asignar varios roles implica un modelo adicional a las tablas de autenticación y de invitación:

| Tabla propuesta | Para qué sirve | Por qué está separada |
|---|---|---|
| `rol` | Catálogo inicial: Administrador, Jurado, Escribano y Comisario. La edición dinámica del catálogo queda para una etapa futura. | Mantiene los roles como datos propios, en vez de agregar una columna booleana por cada rol en `usuario`. |
| `usuario_rol` | Relaciona usuarios con los roles que el administrador les asignó. | Permite asignar varios roles a una persona sin duplicar su cuenta y evita repetir una misma asignación. |

### Columnas conceptuales para roles

| Tabla | Columnas propuestas | Regla principal |
|---|---|---|
| `rol` | `id`, `codigo`, `nombre`, `descripcion` (opcional) | `codigo` es único y estable; inicialmente representa Administrador, Jurado, Escribano y Comisario. |
| `usuario_rol` | `usuario_id`, `rol_id`, `asignado_por`, `asignado_en` | `usuario_id` y `rol_id` forman una combinación única; las referencias apuntan a `usuario` y `rol`. |

La invitación inicial incluye un solo rol elegido por el administrador. Después, el administrador puede agregar o quitar asignaciones de roles de a uno. El usuario solo podrá elegir entre los roles ya asignados; esa selección no concede permisos nuevos. El rol activo se conserva en el almacenamiento de sesión del navegador y se elimina al cerrar sesión, pero nunca se persiste en la base de datos.

### Ciclo de vida de una invitación

| Estado | Transición |
|---|---|
| `pendiente` | Se crea al emitir la invitación; el enlace es válido por 72 horas. |
| `aceptada` | La persona completa el registro; el enlace queda consumido y no se puede reutilizar. |
| `revocada` | El administrador cancela una invitación que todavía estaba pendiente; su enlace deja de funcionar. |
| `vencida` | Se supera el plazo de 72 horas sin aceptar la invitación; se puede emitir una nueva. |

Si el correo ya tiene una cuenta, no se crea otra invitación; cualquier cambio de rol se gestiona sobre la cuenta existente.

### Permisos iniciales acordados a partir de Carnavales2027

Se adopta el reparto de acceso observado en Carnavales2027 para la primera versión. Los nombres del nuevo proyecto se mantienen en español; los códigos entre paréntesis solo identifican su equivalente en la referencia.

| Rol (equivalencia en la referencia) | Acceso acordado |
|---|---|---|
| Administrador (`ADMIN`) | Gestiona el área administrativa y usuarios/invitaciones; puede consultar resultados y penalidades. No puede liberar resultados ni ejecutar el sorteo ceremonial. |
| Jurado (`JUDGE`) | Usa las funciones de jurado. En la etapa de votación también requerirá un perfil registrado y no suspendido; ese perfil queda aplazado. |
| Escribano (`ESCRIBANO`) | Puede consultar y liberar resultados, y ejecutar el sorteo ceremonial. |
| Comisario (`COMISARIO`) | Puede acceder al área de penalidades junto con Administrador. |

La referencia también tiene un rol distinto, `SCRUTINEER`, que no está incluido en el catálogo inicial. Sus permisos no se agregan a ningún rol del nuevo proyecto. Esta matriz queda acordada para el diseño; la implementación de cada protección se definirá al construir las rutas.

## Flujo inicial de alta

1. Durante la instalación, la persona operadora ejecuta el comando de configuración inicial para crear al primer administrador.
2. El administrador crea una invitación para una dirección de correo.
3. El sistema genera un enlace temporal, guarda únicamente el hash del token y establece un vencimiento de 72 horas.
   Si ya existe una invitación pendiente para ese correo, el reenvío invalida el token anterior y crea uno nuevo.
   En desarrollo y pruebas, el enlace se muestra en la consola; en producción, se envía por correo.
4. La persona invitada abre el enlace y elige una contraseña.
5. Better Auth crea el usuario y su credencial; la invitación queda aceptada y no se puede volver a usar.
6. Un inicio de sesión posterior crea una sesión.

El comando inicial debe obtener la contraseña de forma segura —sin pasarla como argumento ni escribirla en registros— y delegar en Better Auth la creación de la cuenta y el hash de la contraseña. La existencia del rol `Administrador` en `usuario_rol` funciona como marca de inicialización. El sistema tampoco debe permitir eliminar o degradar al último administrador.

## Por qué PostgreSQL y no MongoDB

PostgreSQL es más adecuado para este modelo inicial porque los usuarios, las credenciales, las sesiones y las invitaciones son registros relacionados con reglas de integridad. Las claves foráneas y las transacciones ayudan a mantener esas relaciones consistentes.

MongoDB es una opción razonable para datos orientados a documentos con estructuras muy variables o anidadas. También admite transacciones, pero este modelo de autenticación se beneficia más de restricciones relacionales explícitas que de la flexibilidad de documentos.

Better Auth admite adaptadores para PostgreSQL y MongoDB. PostgreSQL también sigue el enfoque de migraciones SQL usado en el proyecto de referencia Carnavales2027.

## Decisiones de diseño pendientes

- Generar y revisar el esquema exacto de Better Auth `1.7.22`, incluido el plugin 2FA, con los mapeos en español.
- Definir las columnas, tipos, restricciones de unicidad y claves foráneas precisas para las tablas de autenticación.
- Diseñar `perfil_jurado` junto con el flujo de votación, fuera de esta primera base.
- Elegir entre SMTP y Gmail para el despliegue productivo cuando estén definidos el dominio y el alojamiento.

## Evidencia de referencia

- Carnavales2027 configura Better Auth con PostgreSQL en `api/src/auth/auth.js`.
- `api/src/auth/account-service.js` delega en Better Auth el hash de contraseñas y el almacenamiento de credenciales.
- `api/src/modules/users/user-service.js` crea invitaciones con tokens almacenados como hash y vencimiento de 72 horas.
- `api/src/db/migrate.js` aplica migraciones SQL ordenadas.
- `api/src/email/delivery.js` admite consola para desarrollo, SMTP y Gmail; la selección productiva depende de `EMAIL_PROVIDER` y no puede inferirse solo del código.
- Better Auth 2FA OTP: <https://better-auth.com/docs/plugins/2fa>
- Mapeo de nombres en la base de datos de Better Auth: <https://better-auth.com/docs/concepts/database>
- Adaptador PostgreSQL de Better Auth: <https://better-auth.com/docs/adapters/postgresql>
- Versión publicada de Better Auth: <https://www.npmjs.com/package/better-auth>
- Esquema central de Better Auth `1.7.22`: <https://github.com/better-auth/better-auth/blob/v1.7.22/packages/core/src/db/get-tables.ts>
- Esquema 2FA de Better Auth `1.7.22`: <https://github.com/better-auth/better-auth/blob/v1.7.22/packages/better-auth/src/plugins/two-factor/schema.ts>
- Reenvío y verificación OTP de Better Auth `1.7.22`: <https://github.com/better-auth/better-auth/blob/v1.7.22/packages/better-auth/src/plugins/two-factor/otp/index.ts>
- Restricciones de PostgreSQL: <https://www.postgresql.org/docs/current/ddl-constraints.html>
