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
| Política de contraseñas | Usar el mínimo de Better Auth, 8 caracteres (máximo 128), sin exigir mayúsculas, números ni símbolos. No hay caducidad periódica; la contraseña solo cambia por recuperación o por decisión de la persona. |
| Enlace de invitación | De un solo uso; guardar únicamente el hash del token y establecer un vencimiento de 72 horas. |
| Reenvío de invitaciones | Permitir una sola invitación pendiente por correo. Al reenviarla, invalidar el enlace anterior y emitir uno nuevo con 72 horas de vigencia. |
| Estados de invitación | Usar `pendiente`, `aceptada`, `revocada` y `vencida`. La aceptación consume el enlace; el administrador solo puede revocar invitaciones pendientes. |
| Fallo de envío del OTP | Una ruta propia envuelve el envío, registra el resultado y responde error si el correo no salió; la solicitud cuenta para los límites. |
| Entrega de mensajes | En desarrollo y pruebas, mostrar enlaces y códigos en la consola; en producción, enviar invitaciones, códigos de acceso y recuperación por SMTP o Gmail, seleccionados mediante `EMAIL_PROVIDER`. |
| Verificación de correo | No agregar un paso separado; aceptar la invitación enviada a esa dirección confirma el acceso al correo. |
| Recuperación de contraseña | Incluirla desde la primera versión; usar el mismo canal de entrega que las invitaciones según el entorno. |
| Verificación adicional al iniciar sesión | Después de la contraseña, enviar un código de seis dígitos al correo registrado en cada inicio de sesión. Vence en 3 minutos y permite 5 intentos. Se almacena cifrado con `otpOptions.storeOTP: "encrypted"`, porque el valor predeterminado del plugin es texto claro. Se puede reenviar a los 30 segundos; un código nuevo invalida el anterior. No se confían dispositivos. La aplicación debe imponer la espera de 30 segundos. |
| Correo ya registrado | Rechazar una segunda invitación para una cuenta existente. Asignar o cambiar su rol será una acción administrativa separada. |
| Gestión de roles | El administrador asigna y modifica los roles de a uno. La invitación inicial incluye un solo rol; luego el administrador puede asignar otros. Si una persona tiene más de un rol asignado, puede elegir cuál usar; si tiene uno solo, no puede cambiarlo. La persona no puede asignarse roles por su cuenta. |
| Rol activo | Se conserva en el almacenamiento de sesión del navegador hasta cerrar sesión; no se guarda en la base de datos. Solo cambia la sección visible. La API autoriza cada acción según las asignaciones reales de `usuario_rol`. |
| Cierre y vencimiento de sesión | Al cerrar sesión o al vencerla, se descarta el rol activo y se vuelve a la pantalla de acceso. Después de autenticarse de nuevo, la persona va siempre al inicio, no a la pantalla donde estaba. |
| Catálogo inicial de roles | Incluir Administrador, Jurado, Escribano y Comisario. Evaluar más adelante si se podrán agregar o quitar roles. |
| Primer administrador | Crear la primera cuenta mediante un comando de configuración de una sola vez, ejecutado fuera de una ruta pública. La asignación inicial de `ADMINISTRADOR` tiene `es_inicial = true` e identifica a esa cuenta; un índice único parcial sobre `es_inicial` impide una segunda asignación inicial, aunque se ejecuten dos bootstraps a la vez. Esa cuenta no se puede borrar ni perder el rol `ADMINISTRADOR`. No se agrega una tabla de inicialización. |
| Administradores posteriores | Se pueden quitar sus roles o eliminar sus cuentas aunque no quede ningún otro administrador posterior; el primer administrador conserva siempre `ADMINISTRADOR`. |
| Aplicación de roles | Un cambio de rol rige de inmediato: la API autoriza contra `usuario_rol` en cada petición y la interfaz ajusta el rol activo o pide elegir otro. |
| Bitácora administrativa | No se agrega una tabla de auditoría en esta etapa. Las tablas operativas conservan el estado vigente, no un historial inmutable de acciones: por ejemplo, retirar un rol elimina su asignación y borrar al creador elimina sus invitaciones. Si se requiere preservar ese historial, habrá que decidir un mecanismo de auditoría antes de implementar esas eliminaciones. |
| Eliminación de usuarios | Se pueden eliminar todas las cuentas salvo la del primer administrador, incluso las cuentas de administradores posteriores. Se borran en cascada sus credenciales, sesiones, configuración de segundo factor y asignaciones; el correo queda libre para una nueva invitación. |
| Perfil de jurado | No incluir `perfil_jurado` en la base inicial de autenticación; diseñarlo junto con el flujo de votación. |
| Alcance aplazado | El autorregistro público queda fuera del alcance inicial. La autenticación de dos pasos y la asignación y selección de roles forman parte del diseño inicial. |

El plugin de Better Auth solo exige el segundo factor al iniciar sesión si `twoFactorEnabled` ya está activado para esa cuenta. Decisión del proyecto: la aceptación de una invitación y el comando de bootstrap crearán la cuenta con `twoFactorEnabled = true`; así, el primer inicio de sesión con contraseña ya requiere el OTP, sin una sesión inicial de acceso limitado.

## Tablas de autenticación

Los nombres de tabla que aparecen a continuación están aprobados. Se eligió Better Auth `1.7.22`; las columnas físicas propuestas se mapearán desde sus nombres canónicos. El DDL se generó con `getMigrations` de la propia librería `1.7.22` (ver la verificación más abajo). El CLI `@better-auth/cli` no publica versiones `1.6.x` ni `1.7.x`; la más reciente es `1.4.22`.

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

### Verificación del esquema aplicado con Better Auth `1.7.22`

El registro de la prueba indica que se aplicó el esquema en una base PostgreSQL 18 temporal con la configuración aprobada —nombres en español, plugin 2FA y tabla `doble_factor`— mediante `getMigrations` de `better-auth/db/migration` en la librería `1.7.22`, con la configuración de `api/auth.config.js`. El resultado sirvió para ajustar esta especificación. Esa aplicación previa usó `@better-auth/cli 1.4.21`; la prueba que la reemplaza es la siguiente:

- Los tipos generados son `text`, `boolean`, `integer` y `timestamptz`. Los identificadores son `text` sin valor predeterminado.
- Se crearon las tablas `usuario`, `cuenta`, `sesion`, `verificacion` y `doble_factor` con las columnas en español.
- Las claves foráneas `cuenta.usuario_id`, `sesion.usuario_id` y `doble_factor.usuario_id` referencian `usuario.id` con `ON DELETE CASCADE`.
- El generador crea `cuenta.actualizado_en` y `sesion.actualizado_en` como `NOT NULL` **sin** valor predeterminado; esta especificación decía `CURRENT_TIMESTAMP` y se corrige.
- `usuario.correo_verificado` queda `NOT NULL` **sin** valor predeterminado.
- `usuario.doble_factor_habilitado` queda nullable y sin valor predeterminado. `doble_factor.verificado` e `intentos_fallidos` también quedan nullable y sin valor predeterminado, aunque el código del plugin declare valores por omisión. El proyecto los endurece con una migración propia.
- El mapeo de `twoFactorEnabled` no se logra desde `user.fields`: debe declararse dentro de `twoFactor({ schema: { user: { fields: { twoFactorEnabled: "doble_factor_habilitado" } } } })`. Los demás campos del plugin se renombran igual, en `schema.twoFactor.fields`; `twoFactorTable` solo cambia el nombre de la tabla.
- Índices generados: `usuario_pkey`, `usuario_correo_key` (único), `sesion_pkey`, `sesion_token_key` (único), `sesion_usuario_id_idx`, `cuenta_pkey`, `cuenta_usuario_id_idx`, `verificacion_pkey`, `verificacion_identificador_idx`, `doble_factor_pkey`, `doble_factor_secreto_idx` y `doble_factor_usuario_id_idx`.
- La tabla `doble_factor` no tiene columnas de creación ni actualización.

Reproducción (spike, PostgreSQL 18.7 en un contenedor desechable): el SQL generado se guardó en `api/migrations/0001-better-auth-1.7.22.sql` y se aplicó sin errores. Se verificaron nulabilidad, defaults, claves foráneas con `ON DELETE CASCADE` e índices contra la tabla anterior. Además, el plugin guarda el OTP cifrado en `verificacion` (valor de 40 caracteres, no seis dígitos), el identificador del desafío es `2fa-otp-<id>` y los intentos fallidos se registran en `verificacion` con `2fa-attempts-<id>`. Esas dos filas no estaban documentadas aquí.

Esta sección ya es reproducible: el SQL, la configuración y los scripts están en `api/`. La aplicación anterior, que no conservó el SQL, queda superada por la verificación de arriba. El SQL generado sigue sin ser la migración final del proyecto: las restricciones propias se agregan en migraciones aparte.

Las unicidades y restricciones adicionales del proyecto —`UNIQUE (id_proveedor, id_cuenta)`, `UNIQUE (usuario_id)` en `doble_factor`, el índice parcial de invitaciones y los `CHECK`— no las genera Better Auth y deben agregarse en migraciones propias.

### Campos canónicos del esquema fuente `1.7.22`

- `user`: `id`, `name`, `email`, `emailVerified`, `image`, `createdAt` y `updatedAt`. `email` es obligatorio y único; `image` es opcional. El plugin agrega `twoFactorEnabled` como opcional y declara `false` como valor lógico, pero el DDL generado no materializa ese valor por omisión.
- `account`: `accountId`, `providerId` y `userId` son obligatorios. Los tokens, sus vencimientos, `scope` y `password` son opcionales. `userId` referencia `user.id`, tiene índice y elimina en cascada al borrar el usuario.
- `session`: `expiresAt`, `token`, `createdAt`, `updatedAt` y `userId` son obligatorios; `token` es único; IP y agente de usuario son opcionales. `userId` tiene índice y referencia al usuario con eliminación en cascada.
- `verification`: `identifier`, `value` y `expiresAt` son obligatorios; `identifier` tiene índice. Se usa también para guardar temporalmente el OTP cifrado y su vencimiento.
- `twoFactor`: `secret`, `backupCodes` y `userId` son obligatorios; el esquema lógico declara `verified` con valor `true` y `failedVerificationCount` con `0`, pero el DDL generado no los aplica. `lockedUntil` es opcional. El plugin declara índices para `secret` y `userId`; su referencia a `user.id` no declara acción, por lo que el generador aplica `CASCADE`.
- El OTP por correo de esta versión admite seis dígitos, tres minutos y cinco intentos como valores predeterminados. El reenvío a los 30 segundos sigue siendo una regla que debe imponer la aplicación, no una restricción de estas tablas.

Decisiones adicionales para `twoFactor`: `userId` será único, para permitir una sola configuración por usuario, y la referencia a `user.id` borrará la fila 2FA en cascada. Better Auth declara un índice no único; la migración del proyecto deberá reflejar la unicidad aprobada.

La referencia `Carnavales2027` usa Better Auth `1.6.27`, no `1.7.22`; se toma como referencia de arquitectura, pero no como fuente del esquema de esta versión. También configura sesiones de hasta un año con actualización cada 10 minutos (`api/src/auth/auth.js`); este proyecto propone 12 horas de inactividad, por lo que esa configuración no debe copiarse.

### Especificación de `usuario` (mapeo PostgreSQL propuesto)

Los tipos se basan en el generador PostgreSQL de Better Auth `1.7.22` con la configuración predeterminada de identificadores. No es SQL ejecutable; es la especificación para revisar antes de generar migraciones.

| Campo Better Auth | Columna física | Tipo PostgreSQL | Nulabilidad y regla |
|---|---|---|---|
| `id` | `id` | `text` | `NOT NULL`, clave primaria; Better Auth genera el valor, sin valor predeterminado en PostgreSQL. |
| `name` | `nombre` | `text` | `NOT NULL`. |
| `email` | `correo` | `text` | `NOT NULL`, único; Better Auth normaliza el correo a minúsculas. |
| `emailVerified` | `correo_verificado` | `boolean` | `NOT NULL`; el generador no crea valor predeterminado. El proyecto agrega `DEFAULT false` y la aplicación envía el valor al crear la cuenta. |
| `image` | `imagen_perfil` | `text` | Admite `NULL`. |
| `createdAt` | `creado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| `updatedAt` | `actualizado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`; Better Auth mantiene la actualización desde la aplicación. |
| `twoFactorEnabled` | `doble_factor_habilitado` | `boolean` | Generado como nullable y sin valor predeterminado. El proyecto lo cambia a `NOT NULL DEFAULT false` mediante una migración propia; las cuentas del sistema se crean con `true`. |

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
| `updatedAt` | `actualizado_en` | `timestamptz` | `NOT NULL`, **sin** valor predeterminado; Better Auth lo envía al crear y lo actualiza desde la aplicación. |

La fuente de Better Auth `1.7.22` no declara única la combinación `providerId` + `accountId`. Decisión del proyecto: agregar una restricción `UNIQUE (id_proveedor, id_cuenta)` para impedir que una misma identidad de proveedor quede vinculada a más de una cuenta local.

### Especificación de `sesion` (mapeo PostgreSQL propuesto)

| Campo Better Auth | Columna física | Tipo PostgreSQL | Nulabilidad y regla |
|---|---|---|---|
| `id` | `id` | `text` | `NOT NULL`, clave primaria; Better Auth genera el valor, sin valor predeterminado en PostgreSQL. |
| `userId` | `usuario_id` | `text` | `NOT NULL`, referencia a `usuario.id` con `ON DELETE CASCADE`; índice no único. |
| `expiresAt` | `vence_en` | `timestamptz` | `NOT NULL`. |
| `token` | `token` | `text` | `NOT NULL UNIQUE`. |
| `createdAt` | `creado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| `updatedAt` | `actualizado_en` | `timestamptz` | `NOT NULL`, **sin** valor predeterminado; Better Auth lo envía al crear y lo actualiza desde la aplicación. |
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
| `verified` | `verificado` | `boolean` | Generado como nullable y sin valor predeterminado. El proyecto lo cambia a `NOT NULL DEFAULT true`; el plugin crea en `false` una configuración nueva que todavía debe verificarse. |
| `failedVerificationCount` | `intentos_fallidos` | `integer` | Generado como nullable y sin valor predeterminado. El proyecto lo cambia a `NOT NULL DEFAULT 0`. |
| `lockedUntil` | `bloqueado_hasta` | `timestamptz` | Admite `NULL`. |

El modelo del plugin no declara `createdAt` ni `updatedAt` para esta tabla. El generador PostgreSQL aplica `ON DELETE CASCADE` como comportamiento predeterminado para esta referencia; se confirmó en el esquema generado. La restricción `UNIQUE (usuario_id)` es una regla adicional aprobada por el proyecto.

Con OTP por correo como único método, Better Auth habilita el factor mediante `usuario.doble_factor_habilitado`; no necesita crear una fila en `doble_factor` para cada persona. La tabla sigue formando parte del esquema del plugin y se usa para configuraciones como TOTP y sus códigos de respaldo.

Los permisos de administración se detallan en la sección de gestión administrativa.

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

Para cumplir la regla de una sola invitación pendiente por correo, se propone un índice único parcial sobre el correo normalizado (`lower(correo_invitado)`) cuando `estado = 'pendiente'`. Una invitación cuya fecha `vence_en` ya pasó no es utilizable aunque todavía tenga `estado = 'pendiente'`. Decisión del proyecto sobre `vencida`: es un estado efectivo derivado de la fecha, sin proceso periódico. Una invitación con `estado = 'pendiente'` y `vence_en <= now()` se presenta como `vencida` en las lecturas. Al reenviarla o aceptarla, la misma transacción cambia el estado almacenado a `vencida` antes de crear la nueva invitación o de rechazar la aceptación, porque el índice parcial de pendientes no puede depender de la hora actual. El índice no puede usar la hora actual como predicado. Decisión del proyecto: agregar un `CHECK` que exija ambas fechas de resolución nulas para `pendiente` y `vencida`; `aceptada_en` no nula y `revocada_en` nula para `aceptada`; y `revocada_en` no nula y `aceptada_en` nula para `revocada`.

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
| `usuario_rol` | `usuario_id`, `rol_id`, `asignado_por`, `asignado_en`, `es_inicial` | `usuario_id` y `rol_id` forman una combinación única; las referencias apuntan a `usuario` y `rol`. |

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
| `asignado_por` | `text` | Admite `NULL` para el bootstrap o cuando el asignador fue borrado; cuando tenga valor, referencia a `usuario.id` con `ON DELETE SET NULL`. |
| `asignado_en` | `timestamptz` | `NOT NULL DEFAULT CURRENT_TIMESTAMP`. |
| `es_inicial` | `boolean` | `NOT NULL DEFAULT false`. Solo el comando de bootstrap la pone en `true`, y solo para `ADMINISTRADOR`. Un índice único parcial `usuario_rol_inicial_unico ON usuario_rol (es_inicial) WHERE es_inicial` impide más de una. La regla de solo `ADMINISTRADOR` y la protección contra cambios o borrados se aplican con triggers (migración `0003-roles.sql`). |

La clave primaria propuesta es `(usuario_id, rol_id)`, lo que impide duplicar una asignación. Decisión del proyecto: el comando de bootstrap deja `asignado_por` en `NULL`; las asignaciones administrativas normales deben indicar un usuario. La asignación inicial de `ADMINISTRADOR` con `es_inicial = true` identifica al primer administrador y debe permanecer mientras exista esa cuenta. La referencia al asignador usa `ON DELETE SET NULL`: al borrar a quien asignó un rol, la asignación se conserva y `asignado_por` pasa a `NULL`, con pérdida de la atribución. Esto permite borrar cualquier usuario sin afectar la identificación del primer administrador, que depende de `es_inicial` y no de `asignado_por`. Al borrar al usuario que tiene asignado el rol, se elimina su vínculo; no se puede borrar un rol mientras tenga asignaciones.

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

Mecanismo propuesto para la sesión única: Better Auth `1.7.22` crea la sesión autenticada en `verify-otp` solo después de validar el código, pero no elimina las sesiones anteriores. El proyecto propone un hook de creación de sesión (`databaseHooks.session.create.after`) que elimine las demás sesiones del usuario. Como la sesión solo se crea tras un OTP válido, un intento fallido no debe revocar la sesión existente. Sin embargo, un hook `after` puede ejecutarse después del commit; por sí solo no demuestra que la creación y la revocación queden serializadas. Resultado del spike (`api/session-race.mjs`, una sola instancia): sin el hook, las sesiones se acumulan entre inicios de sesión sucesivos; con el hook, queda exactamente una sesión activa en 50 de 50 iteraciones. Con dos verificaciones simultáneas del mismo código, solo una tuvo éxito en cada iteración: el código se consume de forma atómica y una emisión nueva invalida la anterior, así que no hay dos códigos válidos a la vez. La carrera que preocupaba no se reprodujo. El hook sí es necesario para la regla de una sola sesión entre inicios sucesivos. Pendiente: el hook solo existe en el script de prueba y debe llevarse a la configuración real.

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

La forma exacta de renovación y el tiempo de vida de la cookie se ajustarán a la configuración de Better Auth al implementar, manteniendo el criterio de 12 horas sin actividad.

## Por qué PostgreSQL y no MongoDB

PostgreSQL es más adecuado para este modelo inicial porque los usuarios, las credenciales, las sesiones y las invitaciones son registros relacionados con reglas de integridad. Las claves foráneas y las transacciones ayudan a mantener esas relaciones consistentes.

MongoDB es una opción razonable para datos orientados a documentos con estructuras muy variables o anidadas. También admite transacciones, pero este modelo de autenticación se beneficia más de restricciones relacionales explícitas que de la flexibilidad de documentos.

Better Auth admite adaptadores para PostgreSQL y MongoDB. PostgreSQL también sigue el enfoque de migraciones SQL usado en el proyecto de referencia Carnavales2027.

## Verificaciones pendientes y temas aplazados

- Por ahora se mantienen las 8 tablas actuales; no se elimina `rol` ni `doble_factor`.
- El esquema base está reproducido con la librería `1.7.22` y guardado en `api/migrations/0001-better-auth-1.7.22.sql`. Las migraciones propias siguen pendientes: deben agregar `UNIQUE (id_proveedor, id_cuenta)`, `UNIQUE (usuario_id)` en `doble_factor`, el índice parcial de invitaciones, los `CHECK` y el endurecimiento de nulabilidad y valores predeterminados.
- Confirmar que las migraciones propias se apliquen después de las de Better Auth y que una actualización de versión no intente revertirlas.
- Asegurar que la emisión, el reenvío, la aceptación y la expiración de invitaciones se realicen con transacciones compatibles con el índice de una invitación pendiente por correo.
- Confirmar que la asignación inicial de `ADMINISTRADOR` sea única, que el bootstrap se serialice y que esa asignación no pueda quitarse ni borrarse.
- Resuelto: `asignado_por` usa `ON DELETE SET NULL`. Pendiente: implementar un trigger `BEFORE DELETE` sobre `usuario` y una validación para quitar el rol a la cuenta con `es_inicial`, para que la protección del primer administrador no dependa solo de la aplicación.
- Verificar en PostgreSQL que las acciones `ON DELETE` permiten eliminar todas las cuentas salvo la del primer administrador, conforme a la estrategia de atribución de `usuario_rol` que se decida.
- Configurado en el spike (`api/auth.config.js`): `otpOptions.storeOTP: "encrypted"`, `emailAndPassword.revokeSessionsOnPasswordReset: true`, `emailAndPassword.disableSignUp` y los mapeos del plugin 2FA. Los valores predeterminados no cumplen el diseño; llevar esta configuración al proyecto real.
- Resuelto en el spike, en una sola instancia: `databaseHooks.session.create.after` existe, se ejecuta en `verify-otp` y deja exactamente una sesión activa (50 de 50 iteraciones). Pendiente: incluir el hook en la configuración real y repetir la prueba con varias instancias.
- Decidido: se mantiene el bloqueo de cuenta predeterminado del plugin (`accountLockout`: 10 fallos consecutivos y 900 segundos de bloqueo, valores verificados en `1.7.22`). Un usuario legítimo puede quedar bloqueado 15 minutos tras varios fallos; el diseño lo acepta como defensa contra adivinación de contraseñas.
- Implementar el envoltorio de envío del OTP con su almacén temporal de estado de entrega y comprobar su comportamiento con varias instancias.
- Confirmar que los límites por cuenta e IP comparten contadores atómicos entre todas las instancias del servicio.
- La duración de 12 horas quedó verificada en el spike. Pendiente: confirmar la renovación por actividad y que un cambio de rol se refleje sin esperar a un nuevo inicio de sesión.
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
