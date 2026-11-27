# Diseño inicial de autenticación y creación de cuentas

**Estado:** Las migraciones `0001`–`0005`, API y cliente de autenticación están implementados. Incluye contraseña y OTP, recuperación de contraseña, invitaciones, bootstrap del primer administrador y administración de usuarios e invitaciones. El resto del sistema de votación (Administración, Jurado y Escribano hasta P6C) está implementado y documentado por separado en `docs/voting/`. El despliegue productivo y su validación operativa siguen pendientes.
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
| Entrega de mensajes | `console` en desarrollo y pruebas; Gmail mediante `EMAIL_PROVIDER=gmail` con contraseña de aplicación. Gmail está implementado, pero no hay despliegue productivo configurado. |
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
| Bitácora administrativa | No hay una tabla de auditoría append-only implementada. Los cambios de roles y la eliminación de cuentas no conservan un historial completo. Esto es una brecha frente a las pautas generales del producto y requiere diseñar la auditoría antes de producción. |
| Eliminación de usuarios | Se pueden eliminar todas las cuentas salvo la del primer administrador, incluso las cuentas de administradores posteriores. Se borran en cascada sus credenciales, sesiones, configuración de segundo factor y asignaciones; el correo queda libre para una nueva invitación. |
| Perfil de jurado | No incluir `perfil_jurado` en la base inicial de autenticación; diseñarlo junto con el flujo de votación. |
| Alcance aplazado | El autorregistro público queda fuera del alcance inicial. La autenticación de dos pasos y la asignación y selección de roles forman parte del diseño inicial. |

El plugin de Better Auth solo exige el segundo factor al iniciar sesión si `twoFactorEnabled` ya está activado para esa cuenta. Decisión del proyecto: la aceptación de una invitación y el comando de bootstrap crearán la cuenta con `twoFactorEnabled = true`; así, el primer inicio de sesión con contraseña ya requiere el OTP, sin una sesión inicial de acceso limitado.

## Guía de lectura

- [Guía de implementación](implementation-guide.md): configuración local, comandos y verificaciones.
- [Base de datos y migraciones](database.md): tablas, mapeos, restricciones y evidencia del esquema.
- [Referencia de API](api-reference.md): rutas propias y endpoints de autenticación que usa el cliente.
- [Flujos y administración](flows.md): invitaciones, acceso, OTP, sesiones y permisos.

## Configuración del correo y del proxy

Las variables van en `api/.env`, que no se versiona. `api/.env.example` documenta las mismas claves.

| Variable | Uso |
|---|---|
| `EMAIL_PROVIDER` | `console` para desarrollo: códigos y enlaces aparecen en la terminal de la API. `gmail` envía por Gmail. Nunca `console` en producción. |
| `GMAIL_USER` | Cuenta de Gmail que envía los correos. Obligatoria con `gmail`. |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación de esa cuenta. Obligatoria con `gmail`. Es un secreto: no se registra ni se sube al repositorio. |
| `TRUST_PROXY` | Cantidad de proxies delante de la API cuya cabecera `X-Forwarded-For` se confía. Por defecto `false`. |

Para crear la contraseña de aplicación de Gmail:
1. Activá la verificación en dos pasos en la cuenta de Google.
2. Abrí la página de contraseñas de aplicación de la cuenta y creá una nueva.
3. Copiá la clave de 16 caracteres en `GMAIL_APP_PASSWORD`. Los espacios se ignoran.

El uso local recomendado es `EMAIL_PROVIDER=console`. El envío por Gmail está implementado y tiene pruebas, pero aún faltan configuración y validación en un entorno productivo.

## Estado de implementación y trabajo pendiente

La API en `api/` y el cliente en `client/` implementan los flujos de
autenticación y administración descritos aquí: acceso con OTP, recuperación de
contraseña, aceptación de invitaciones, rol activo y administración desde la
interfaz. Consulta los README de cada módulo para ejecución y pruebas.

### Implementado en `api/migrations/`

- `0001-better-auth-1.7.22.sql`: esquema base generado por Better Auth.
- `0002-endurecer-tablas-better-auth.sql`: unicidad proveedor/cuenta, defaults y nulabilidad de campos, y una configuración 2FA por usuario.
- `0003-roles.sql`: catálogo inicial, asignaciones múltiples, marca única del administrador inicial y triggers que impiden eliminarlo o quitar/modificar su asignación inicial.
- `0004-invitaciones.sql`: tabla de invitaciones, estados y fechas coherentes, correo normalizado y máximo de una invitación pendiente por correo.
- `migrations/tests/verify-0002-0004.sql`: script transaccional de comprobación de restricciones. Aplicado y verificado en una instancia PostgreSQL 18.6 descartable; la prueba confirmó las restricciones y revirtió sus datos (`usuario = 0`, `invitacion = 0`, los cuatro roles iniciales permanecen). Lo ejecuta automáticamente `api/test/migrations/migrations.test.js` cuando se define `TEST_DATABASE_URL`.

### Pendiente

- Despliegue productivo, dominio, TLS, SMTP transaccional y configuración de
  `TRUST_PROXY` según la topología real.
- Pruebas operativas de autenticación y roles en el entorno de despliegue.
- Validar actualizaciones futuras de Better Auth mediante migraciones de
  actualización.
- Revisar almacenamiento compartido y carreras de límites/envíos si se despliega
  con varias instancias.
- La auditoría administrativa append-only requerida por las pautas generales de
  producto no está implementada en esta etapa; requiere diseñar y aprobar su
  esquema antes de afirmar trazabilidad histórica.

### Fuera del alcance de este documento

- Flujos de votación/PWA, asignaciones de jurado, cierres, penalizaciones,
  resultados y actas oficiales: están implementados hasta P6D y se documentan
  en `docs/voting/`.
- Autorregistro público y catálogo dinámico de roles.
