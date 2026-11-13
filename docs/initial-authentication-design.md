# Diseño inicial de autenticación y creación de cuentas

**Estado:** Borrador de diseño; la implementación todavía no comenzó.  
**Alcance:** Definir la tecnología web inicial, el modelo de datos para el inicio de sesión y el alta de cuentas controlada por administradores.

## Decisiones confirmadas

| Área | Decisión |
|---|---|
| Cliente y API | Mantener separados el cliente web y la API: React/Vite en `client/` y la API Node.js en `api/`. |
| Autenticación | Usar Better Auth para las credenciales de correo y contraseña y para las sesiones. |
| Versión de Better Auth | Mantener `1.7.22` como versión aprobada para el diseño. Antes de implementar, verificar su disponibilidad y fijar exactamente esa versión en el proyecto. |
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

El plugin de Better Auth solo exige el segundo factor al iniciar sesión si `twoFactorEnabled` ya está activado para esa cuenta. Decisión del proyecto: la aceptación de una invitación y el comando de bootstrap crearán la cuenta con `twoFactorEnabled = true`; así, el primer inicio de sesión con contraseña ya requiere el OTP, sin una sesión inicial de acceso limitado.

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
| `twoFactor` | `doble_factor` | `id`, `usuario_id`, `secreto`, `codigos_respaldo`, `verificado`, `intentos_fallidos`, `bloqueado_hasta` | En Better Auth `1.7.22`, los campos canónicos son `secret`, `backupCodes`, `userId`, `verified`, `failedVerificationCount` y `lockedUntil`. El plugin también agrega `twoFactorEnabled` a `user`. El modo OTP por correo es el método inicial elegido. |

### Hallazgos de la revisión del esquema fuente `1.7.22`

Esta revisión confirma los campos canónicos y algunas reglas del esquema; todavía no define los tipos SQL ni reemplaza la migración generada:

- `user`: `id`, `name`, `email`, `emailVerified`, `image`, `createdAt` y `updatedAt`. `email` es obligatorio y único; `emailVerified` inicia en `false`; `image` es opcional. El plugin agrega `twoFactorEnabled`, opcional y con valor predeterminado `false`.
- `account`: `accountId`, `providerId` y `userId` son obligatorios. Los tokens, sus vencimientos, `scope` y `password` son opcionales. `userId` referencia `user.id`, tiene índice y elimina en cascada al borrar el usuario.
- `session`: `expiresAt`, `token`, `createdAt`, `updatedAt` y `userId` son obligatorios; `token` es único; IP y agente de usuario son opcionales. `userId` tiene índice y referencia al usuario con eliminación en cascada.
- `verification`: `identifier`, `value` y `expiresAt` son obligatorios; `identifier` tiene índice. Se usa también para guardar temporalmente el OTP cifrado y su vencimiento.
- `twoFactor`: `secret`, `backupCodes` y `userId` son obligatorios; `verified` tiene valor predeterminado `true` en el esquema, `failedVerificationCount` inicia en `0` y `lockedUntil` es opcional. El plugin declara índices para `secret` y `userId`; su referencia a `user.id` no declara explícitamente la acción al borrar.
- El OTP por correo de esta versión admite seis dígitos, tres minutos y cinco intentos como valores predeterminados. El reenvío a los 30 segundos sigue siendo una regla que debe imponer la aplicación, no una restricción de estas tablas.

Decisiones adicionales para `twoFactor`: `userId` será único, para permitir una sola configuración por usuario, y la referencia a `user.id` borrará la fila 2FA en cascada. Better Auth declara un índice no único; la migración deberá reflejar la unicidad aprobada.

La referencia `Carnavales2027` usa Better Auth `1.6.27`, no `1.7.22`; se toma como referencia de arquitectura, pero no como fuente del esquema de esta versión. Antes de aprobar el DDL quedan por confirmar con el generador PostgreSQL los tipos físicos, índices y restricciones resultantes, incluida la forma de expresar la unicidad aprobada para `twoFactor.userId`.

### Especificación de `usuario` (mapeo PostgreSQL propuesto)

Los tipos se basan en el generador PostgreSQL de Better Auth `1.7.22` con la configuración predeterminada de identificadores. No es SQL ejecutable; es la especificación para revisar antes de generar migraciones.

| Campo Better Auth | Columna física | Tipo PostgreSQL | Nulabilidad y regla |
|---|---|---|---|
| `id` | `id` | `text` | `NOT NULL`, clave primaria; Better Auth genera el valor, sin valor predeterminado en PostgreSQL. |
| `name` | `nombre` | `text` | `NOT NULL`. |
| `email` | `correo` | `text` | `NOT NULL`, único; Better Auth normaliza el correo a minúsculas. |
| `emailVerified` | `correo_verificado` | `boolean` | `NOT NULL DEFAULT false`. |
| `image` | `imagen_perfil` | `text` | Admite `NULL`. |
| `createdAt` | `creado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| `updatedAt` | `actualizado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`; Better Auth mantiene la actualización desde la aplicación. |
| `twoFactorEnabled` | `doble_factor_habilitado` | `boolean` | `NOT NULL DEFAULT false`, decisión del proyecto para exigir un estado explícito; el esquema del plugin lo admite como nullable. |

### Especificación de `cuenta` (mapeo PostgreSQL propuesto)

| Campo Better Auth | Columna física | Tipo PostgreSQL | Nulabilidad y regla |
|---|---|---|---|
| `id` | `id` | `text` | `NOT NULL`, clave primaria; Better Auth genera el valor, sin valor predeterminado en PostgreSQL. |
| `accountId` | `id_cuenta` | `text` | `NOT NULL`. |
| `providerId` | `id_proveedor` | `text` | `NOT NULL`. |
| `userId` | `usuario_id` | `text` | `NOT NULL`, referencia a `usuario.id` con `ON DELETE CASCADE`; índice no único. |
| `accessToken` | `token_acceso` | `text` | Admite `NULL`; Better Auth no lo devuelve en la salida del modelo. |
| `refreshToken` | `token_actualizacion` | `text` | Admite `NULL`; Better Auth no lo devuelve en la salida del modelo. |
| `idToken` | `id_token` | `text` | Admite `NULL`; Better Auth no lo devuelve en la salida del modelo. |
| `accessTokenExpiresAt` | `token_acceso_vence_en` | `timestamptz` | Admite `NULL`. |
| `refreshTokenExpiresAt` | `token_actualizacion_vence_en` | `timestamptz` | Admite `NULL`. |
| `scope` | `alcance` | `text` | Admite `NULL`. |
| `password` | `hash_contrasena` | `text` | Admite `NULL`; cuando se usa, contiene el hash administrado por Better Auth, nunca la contraseña en texto claro. |
| `createdAt` | `creado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| `updatedAt` | `actualizado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`; Better Auth mantiene la actualización desde la aplicación. |

La fuente de Better Auth `1.7.22` no declara única la combinación `providerId` + `accountId`. Decisión del proyecto: agregar una restricción `UNIQUE (id_proveedor, id_cuenta)` para impedir que una misma identidad de proveedor quede vinculada a más de una cuenta local.

### Especificación de `sesion` (mapeo PostgreSQL propuesto)

| Campo Better Auth | Columna física | Tipo PostgreSQL | Nulabilidad y regla |
|---|---|---|---|
| `id` | `id` | `text` | `NOT NULL`, clave primaria; Better Auth genera el valor, sin valor predeterminado en PostgreSQL. |
| `userId` | `usuario_id` | `text` | `NOT NULL`, referencia a `usuario.id` con `ON DELETE CASCADE`; índice no único. |
| `expiresAt` | `vence_en` | `timestamptz` | `NOT NULL`. |
| `token` | `token` | `text` | `NOT NULL UNIQUE`. |
| `createdAt` | `creado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| `updatedAt` | `actualizado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`; Better Auth mantiene la actualización desde la aplicación. |
| `ipAddress` | `direccion_ip` | `text` | Admite `NULL`. |
| `userAgent` | `agente_usuario` | `text` | Admite `NULL`. |

Better Auth declara un índice para `usuario_id`, unicidad para `token` y eliminación en cascada desde `usuario`. No se agregan restricciones de unicidad adicionales en esta tabla.

### Especificación de `verificacion` (mapeo PostgreSQL propuesto)

| Campo Better Auth | Columna física | Tipo PostgreSQL | Nulabilidad y regla |
|---|---|---|---|
| `id` | `id` | `text` | `NOT NULL`, clave primaria; Better Auth genera el valor, sin valor predeterminado en PostgreSQL. |
| `identifier` | `identificador` | `text` | `NOT NULL`; índice no único. |
| `value` | `valor` | `text` | `NOT NULL`. |
| `expiresAt` | `vence_en` | `timestamptz` | `NOT NULL`. |
| `createdAt` | `creado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| `updatedAt` | `actualizado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`; Better Auth mantiene la actualización desde la aplicación. |

Esta tabla no tiene clave foránea en el esquema base. `identifier` no es único según Better Auth. Para el OTP por correo, la configuración aprobada lo guarda cifrado en `valor`. En cambio, el flujo estándar de recuperación de contraseña de Better Auth `1.7.22` guarda el token temporal sin hash dentro de `identificador` (`reset-password:<token>`) y el ID del usuario en `valor`. Decisión del proyecto: mantener ese flujo estándar, con el vencimiento predeterminado de una hora y consumo de un solo uso. Se protegerá con permisos mínimos para la cuenta de base de datos, cifrado de la base y respaldos, conexión TLS y prohibición de registrar tokens o identificadores sensibles en logs.

### Especificación de `doble_factor` (mapeo PostgreSQL propuesto)

| Campo Better Auth | Columna física | Tipo PostgreSQL | Nulabilidad y regla |
|---|---|---|---|
| `id` | `id` | `text` | `NOT NULL`, clave primaria; Better Auth genera el valor, sin valor predeterminado en PostgreSQL. |
| `secret` | `secreto` | `text` | `NOT NULL`; índice no único. |
| `backupCodes` | `codigos_respaldo` | `text` | `NOT NULL`. |
| `userId` | `usuario_id` | `text` | `NOT NULL`, `UNIQUE`, referencia a `usuario.id` con `ON DELETE CASCADE`. La unicidad aprobada sustituye la necesidad de conservar además un índice no único separado. |
| `verified` | `verificado` | `boolean` | `NOT NULL DEFAULT true`; el proyecto endurece la nulabilidad opcional del plugin. Este crea explícitamente en `false` una configuración nueva que todavía debe verificarse. |
| `failedVerificationCount` | `intentos_fallidos` | `integer` | `NOT NULL DEFAULT 0`; el proyecto endurece la nulabilidad opcional del plugin. |
| `lockedUntil` | `bloqueado_hasta` | `timestamptz` | Admite `NULL`. |

El modelo del plugin no declara `createdAt` ni `updatedAt` para esta tabla. El generador PostgreSQL aplica `ON DELETE CASCADE` como comportamiento predeterminado para esta referencia, y la restricción `UNIQUE (usuario_id)` es una regla adicional aprobada por el proyecto.

Con OTP por correo como único método, Better Auth habilita el factor mediante `usuario.doble_factor_habilitado`; no necesita crear una fila en `doble_factor` para cada persona. La tabla sigue formando parte del esquema del plugin y se usa para configuraciones como TOTP y sus códigos de respaldo.

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

### Especificación de `invitacion` (mapeo PostgreSQL propuesto)

| Columna física | Tipo PostgreSQL | Nulabilidad y regla propuesta |
|---|---|---|
| `id` | `text` | `NOT NULL`, clave primaria; generado por la aplicación. |
| `correo_invitado` | `text` | `NOT NULL`; normalizar a minúsculas antes de guardar. |
| `rol_inicial_id` | `text` | `NOT NULL`, referencia a `rol.id` con `ON DELETE CASCADE`. |
| `hash_token` | `text` | `NOT NULL UNIQUE`; no guardar el token original. |
| `estado` | `text` | `NOT NULL DEFAULT 'pendiente'`; `CHECK` para `pendiente`, `aceptada`, `revocada` o `vencida`. |
| `vence_en` | `timestamptz` | `NOT NULL`. |
| `creada_por` | `text` | `NOT NULL`, referencia a `usuario.id` con `ON DELETE CASCADE`. |
| `creada_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| `aceptada_en` | `timestamptz` | Admite `NULL` mientras no se acepte. |
| `revocada_en` | `timestamptz` | Admite `NULL` mientras no se revoque. |

Para cumplir la regla de una sola invitación pendiente por correo, se propone un índice único parcial sobre el correo normalizado (`lower(correo_invitado)`) cuando `estado = 'pendiente'`. Antes de emitir otra invitación para una invitación vencida, el flujo deberá cambiar su estado a `vencida`; el índice no puede usar la hora actual como predicado. Decisión del proyecto: agregar un `CHECK` que exija ambas fechas de resolución nulas para `pendiente` y `vencida`; `aceptada_en` no nula y `revocada_en` nula para `aceptada`; y `revocada_en` no nula y `aceptada_en` nula para `revocada`.

Decisión del proyecto: al borrar el usuario creador o el rol inicial, borrar en cascada las invitaciones relacionadas. Esto también elimina del historial esas invitaciones; se deja explícito como consecuencia de la política elegida.

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

### Especificación de `rol` (mapeo PostgreSQL propuesto)

| Columna física | Tipo PostgreSQL | Nulabilidad y regla propuesta |
|---|---|---|
| `id` | `text` | `NOT NULL`, clave primaria; generado por la aplicación o por la carga inicial. |
| `codigo` | `text` | `NOT NULL UNIQUE`; identificador estable, independiente del texto visible. |
| `nombre` | `text` | `NOT NULL`; nombre visible del rol. |
| `descripcion` | `text` | Admite `NULL`. |

Decisión del proyecto: los códigos iniciales serán `ADMINISTRADOR`, `JURADO`, `ESCRIBANO` y `COMISARIO`. La edición dinámica del catálogo queda fuera del diseño inicial.

### Especificación de `usuario_rol` (mapeo PostgreSQL propuesto)

| Columna física | Tipo PostgreSQL | Nulabilidad y regla propuesta |
|---|---|---|
| `usuario_id` | `text` | `NOT NULL`, referencia a `usuario.id` con `ON DELETE CASCADE`; parte de la clave primaria compuesta. |
| `rol_id` | `text` | `NOT NULL`, referencia a `rol.id` con `ON DELETE RESTRICT`; parte de la clave primaria compuesta. |
| `asignado_por` | `text` | Admite `NULL` para el bootstrap; cuando tenga valor, referencia a `usuario.id` con `ON DELETE RESTRICT`. |
| `asignado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`. |

La clave primaria propuesta es `(usuario_id, rol_id)`, lo que impide duplicar una asignación. Decisión del proyecto: el comando de bootstrap deja `asignado_por` en `NULL`; las asignaciones administrativas normales deben indicar un usuario. Como se prevé borrar usuarios no administradores, pero no administradores, la referencia al asignador usa `ON DELETE RESTRICT` para proteger la atribución de las asignaciones. Al borrar al usuario que tiene asignado el rol, se elimina su vínculo; no se puede borrar un rol mientras tenga asignaciones.

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

### Detalle del flujo de invitación y aceptación

**Crear o reenviar**

1. Un administrador indica correo y rol inicial. El sistema normaliza el correo y rechaza la operación si ya existe una cuenta para esa dirección.
2. Si hay una invitación pendiente para el correo, el reenvío la revoca y emite otra; si la anterior venció, primero la marca `vencida`. El índice parcial garantiza que quede como máximo una pendiente.
3. El sistema genera un token aleatorio de un solo uso, guarda solo su hash y fija `vence_en` a 72 horas. El token sin hash se usa únicamente para formar el enlace de invitación.
4. En desarrollo y pruebas, el enlace se muestra en consola; en producción, se envía por correo. Decisión del proyecto: si falla la entrega, la invitación permanece pendiente, se informa el fallo al administrador y un reenvío emite un token nuevo e invalida el anterior.

**Aceptar**

1. Al abrir el enlace, el sistema calcula el hash del token recibido y busca la invitación correspondiente.
2. En una operación atómica, comprueba que siga `pendiente`, no esté vencida y que el correo todavía no tenga una cuenta. Un token inválido, vencido, revocado o ya consumido no crea una cuenta.
3. La persona elige una contraseña. Better Auth crea el usuario y la credencial; la contraseña se guarda como hash. La aceptación confirma el correo (`correo_verificado = true`) y la cuenta queda con `doble_factor_habilitado = true`.
4. El sistema asigna el rol inicial usando el administrador que creó la invitación como `asignado_por`, marca la invitación `aceptada` y registra `aceptada_en`. El token queda consumido porque la invitación ya no está pendiente.
5. La aceptación no inicia sesión automáticamente. En el primer inicio de sesión, la contraseña debe ir seguida del OTP por correo.

La creación de usuario, credencial, asignación de rol y consumo de invitación deben quedar consistentes aunque lleguen dos aceptaciones simultáneas o falle una parte del proceso; la transacción concreta deberá verificarse al implementar con Better Auth y PostgreSQL.

Para token incorrecto, vencido, revocado o ya utilizado, se muestra el mismo mensaje: “El enlace no es válido o venció. Solicita una nueva invitación al administrador.” No se crea una cuenta ni se revela cuál de esos estados tenía la invitación.

### Flujo de inicio de sesión y segundo factor

1. La persona envía correo y contraseña. Better Auth normaliza el correo y valida la credencial.
2. Como las cuentas se crean con `doble_factor_habilitado = true`, una contraseña correcta inicia el desafío OTP y no concede acceso a las rutas protegidas. Better Auth elimina la sesión provisional y devuelve el estado de redirección al segundo factor.
3. El cliente solicita el código de seis dígitos al correo de la cuenta. Se guarda cifrado en `verificacion.valor`, vence a los 3 minutos y el desafío permite hasta 5 intentos. La aplicación impone 30 segundos entre envíos por cuenta y limita a 5 las solicitudes de envío desde una misma IP en una ventana móvil de 10 minutos. Un reenvío invalida el código anterior. Si falla la entrega, no se concede sesión; se informa con un error genérico y la solicitud cuenta para ambos límites.
4. La persona envía el código. Si es incorrecto o venció, no obtiene una sesión autenticada; tras agotar los intentos debe solicitar un código nuevo. Si es correcto, el sistema consume el código de forma atómica, crea la sesión autenticada y revoca cualquier sesión anterior de esa cuenta.
5. Ya autenticada, la persona usa su único rol asignado o elige uno entre los que tiene. Esa selección solo organiza la interfaz; cada acción sigue autorizándose contra las asignaciones reales en `usuario_rol`.

No se confían dispositivos. Decisión del proyecto: una sesión vence tras 12 horas sin actividad y se renueva mientras siga activa; la configuración exacta de renovación se verificará al implementar. Una cuenta solo puede tener una sesión autenticada activa: al completar el OTP en un nuevo dispositivo, se revocan las sesiones anteriores de esa misma cuenta. Un intento que no completa el OTP no revoca la sesión existente. Al recuperar la contraseña, se revocan todas las sesiones del usuario que la cambió, no las de otras cuentas.

### Flujo de recuperación de contraseña

1. La persona solicita recuperar la contraseña con su correo. La respuesta no revela si existe una cuenta; el envío se hace solo si la dirección está registrada.
2. Better Auth genera un enlace de recuperación de un solo uso, válido por una hora, y lo envía por el canal configurado. El token se guarda según el comportamiento estándar documentado en `verificacion`.
3. La persona define una contraseña nueva. Si el enlace no existe, venció o ya se consumió, no se cambia la credencial y se muestra un mensaje genérico.
4. Si se guarda correctamente la contraseña, se consume el token. No se inicia sesión automáticamente; la persona vuelve a ingresar con contraseña y OTP.
5. Al guardar la contraseña nueva, Better Auth revoca todas las sesiones de esa cuenta en todos sus dispositivos; no afecta a otras cuentas. Para volver a entrar, la persona debe autenticarse otra vez con contraseña y OTP.

## Por qué PostgreSQL y no MongoDB

PostgreSQL es más adecuado para este modelo inicial porque los usuarios, las credenciales, las sesiones y las invitaciones son registros relacionados con reglas de integridad. Las claves foráneas y las transacciones ayudan a mantener esas relaciones consistentes.

MongoDB es una opción razonable para datos orientados a documentos con estructuras muy variables o anidadas. También admite transacciones, pero este modelo de autenticación se beneficia más de restricciones relacionales explícitas que de la flexibilidad de documentos.

Better Auth admite adaptadores para PostgreSQL y MongoDB. PostgreSQL también sigue el enfoque de migraciones SQL usado en el proyecto de referencia Carnavales2027.

## Verificaciones pendientes y temas aplazados

- Antes de implementar, generar el esquema de Better Auth `1.7.22` con los mapeos aprobados y comparar tablas, columnas, tipos, nulabilidad e índices con esta especificación.
- Verificar en la migración PostgreSQL las reglas propias del proyecto: unicidad adicional de `cuenta` y `doble_factor`, índice parcial de invitaciones, restricciones `CHECK` y acciones de borrado de las claves foráneas.
- Asegurar que la emisión, el reenvío, la aceptación y la expiración de invitaciones se realicen con transacciones compatibles con el índice de una invitación pendiente por correo.
- Diseñar `perfil_jurado` junto con el flujo de votación; queda fuera de esta primera base de autenticación.
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
