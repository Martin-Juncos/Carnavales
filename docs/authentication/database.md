# Base de datos de autenticación

Este documento reúne el modelo relacional, los mapeos de Better Auth y las decisiones de PostgreSQL. El estado general de implementación se mantiene en [la guía de autenticación](README.md).

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

Esta sección ya es reproducible: el SQL, la configuración y los scripts están en `api/`. La aplicación anterior, que no conservó el SQL, queda superada por la verificación de arriba. El SQL generado es la migración base `0001`; las restricciones propias del proyecto se aplican después mediante las migraciones `0002`–`0004`.

Las unicidades y restricciones adicionales del proyecto —`UNIQUE (id_proveedor, id_cuenta)`, `UNIQUE (usuario_id)` en `doble_factor`, el índice parcial de invitaciones y los `CHECK`— no las genera Better Auth; están definidas en migraciones propias.

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

### Columnas implementadas para `invitacion`

Este diseño conceptual aprobado está implementado en la migración `api/migrations/0004-invitaciones.sql`:

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

### Especificación implementada de `invitacion`

| Columna física | Tipo PostgreSQL | Nulabilidad y regla |
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

## Por qué PostgreSQL y no MongoDB

PostgreSQL es más adecuado para este modelo inicial porque los usuarios, las credenciales, las sesiones y las invitaciones son registros relacionados con reglas de integridad. Las claves foráneas y las transacciones ayudan a mantener esas relaciones consistentes.

MongoDB es una opción razonable para datos orientados a documentos con estructuras muy variables o anidadas. También admite transacciones, pero este modelo de autenticación se beneficia más de restricciones relacionales explícitas que de la flexibilidad de documentos.

Better Auth admite adaptadores para PostgreSQL y MongoDB. PostgreSQL también sigue el enfoque de migraciones SQL usado en el proyecto de referencia Carnavales2027.

## Referencias técnicas

- Better Auth 2FA OTP: <https://better-auth.com/docs/plugins/2fa>
- Mapeo de nombres en la base de datos de Better Auth: <https://better-auth.com/docs/concepts/database>
- Adaptador PostgreSQL de Better Auth: <https://better-auth.com/docs/adapters/postgresql>
- Versión publicada de Better Auth: <https://www.npmjs.com/package/better-auth>
- Esquema central de Better Auth `1.7.22`: <https://github.com/better-auth/better-auth/blob/v1.7.22/packages/core/src/db/get-tables.ts>
- Esquema 2FA de Better Auth `1.7.22`: <https://github.com/better-auth/better-auth/blob/v1.7.22/packages/better-auth/src/plugins/two-factor/schema.ts>
- Reenvío y verificación OTP de Better Auth `1.7.22`: <https://github.com/better-auth/better-auth/blob/v1.7.22/packages/better-auth/src/plugins/two-factor/otp/index.ts>
- Restricciones de PostgreSQL: <https://www.postgresql.org/docs/current/ddl-constraints.html>
