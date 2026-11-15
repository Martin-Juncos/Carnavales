# Diseño inicial de autenticación y creación de cuentas

**Estado:** Migraciones `0001`–`0004` verificadas y esqueleto Express de la API implementado; Better Auth, invitaciones y flujos de aplicación todavía no están integrados.
**Alcance:** Definir la tecnología web inicial, el modelo de datos para el inicio de sesión y el alta de cuentas controlada por administradores.

## Decisiones confirmadas

| Área | Decisión |
|---|---|
| Cliente y API | Mantener separados el cliente web y la API: React/Vite en `client/` y la API Node.js en `api/`. |
| Autenticación | Usar Better Auth para las credenciales de correo y contraseña y para las sesiones. |
| Versión de Better Auth | Usar `1.7.22`, fijada en `api/package.json` y `api/package-lock.json`. |
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

## Guía de lectura

- [Guía de implementación](implementation-guide.md): orden recomendado, criterios de cierre y verificaciones para construir la primera versión.
- [Base de datos y migraciones](database.md): tablas, mapeos, restricciones y evidencia del esquema.
- [Flujos y administración](flows.md): invitaciones, acceso, OTP, sesiones y permisos.

## Estado de implementación y trabajo pendiente

La implementación actual cubre el esquema de base de datos y sus restricciones, no la aplicación de autenticación. El repositorio todavía no contiene las rutas/servicios de producción ni el cliente web descritos en este diseño.

### Implementado en `api/migrations/`

- `0001-better-auth-1.7.22.sql`: esquema base generado por Better Auth.
- `0002-endurecer-tablas-better-auth.sql`: unicidad proveedor/cuenta, defaults y nulabilidad de campos, y una configuración 2FA por usuario.
- `0003-roles.sql`: catálogo inicial, asignaciones múltiples, marca única del administrador inicial y triggers que impiden eliminarlo o quitar/modificar su asignación inicial.
- `0004-invitaciones.sql`: tabla de invitaciones, estados y fechas coherentes, correo normalizado y máximo de una invitación pendiente por correo.
- `migrations/tests/verify-0002-0004.sql`: script transaccional de comprobación de restricciones. Aplicado y verificado en una instancia PostgreSQL 18.6 descartable; la prueba confirmó las restricciones y revirtió sus datos (`usuario = 0`, `invitacion = 0`, los cuatro roles iniciales permanecen). Lo ejecuta automáticamente `api/test/migrations.test.js` cuando se define `TEST_DATABASE_URL`.

### Pendiente para completar la primera versión

- Comprobar el comportamiento de las migraciones ante futuras actualizaciones de Better Auth. El flujo de aplicación ya existe (`api/src/migrate.js`, con prueba automática en `api/test/migrations.test.js`).
- Implementar el comando seguro de bootstrap del primer administrador.
- Implementar creación, reenvío, aceptación, revocación y consulta de invitaciones; asegurar que las operaciones que crean cuentas y consumen invitaciones sean atómicas y compatibles con el índice parcial.
- Implementar las rutas y servicios de Better Auth para contraseña, OTP, recuperación, cierre de sesión y entrega de correo. `api/auth.config.js` y `api/session-race.mjs` son artefactos de spike, no sustituyen la integración de la aplicación.
- Llevar a la configuración de la aplicación las opciones ya probadas en el spike, incluido OTP cifrado, registro deshabilitado y revocación de sesiones tras recuperar la contraseña.
- Implementar y verificar la sesión única al completar OTP; el spike la probó en una sola instancia, pero falta comprobar carreras y almacenamiento compartido en varias instancias.
- Implementar límites atómicos por cuenta e IP y el manejo del resultado real del envío de OTP en despliegues con varias instancias.
- Implementar autorización por asignaciones de rol y reflejar los cambios de permisos inmediatamente en la API y la interfaz.
- Construir el cliente web React/Vite para acceso, invitaciones, selección de rol y gestión administrativa.
- Agregar pruebas de integración para los flujos de invitación, login con OTP y recuperación, y pruebas de concurrencia. La prueba del script SQL ya corre con `TEST_DATABASE_URL` definida.
- Elegir SMTP o Gmail para producción cuando estén definidos el dominio y el alojamiento.

### Fuera de esta etapa

- Diseñar `perfil_jurado` junto con el flujo de votación.
- Decidir si el catálogo de roles será dinámico.
- Incorporar autorregistro público o una bitácora administrativa; ambos siguen fuera del alcance acordado.
