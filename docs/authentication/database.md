# Base de datos de autenticación

Este documento describe el esquema que crean las migraciones actuales. Los
archivos SQL en [`api/migrations/`](../../api/migrations/) son la fuente de
verdad; cualquier diferencia se resuelve a favor del SQL y sus pruebas.

## Aplicación de migraciones

`cd api && npm run migrate` aplica en orden los archivos `NNNN-*.sql` que aún no
figuran en `migracion`. El ejecutor crea esa tabla de control, usa un advisory
lock de PostgreSQL y aplica cada archivo dentro de su propia transacción. No se
ejecutan migraciones al arrancar la API.

| Migración | Contenido |
|---|---|
| `0001-better-auth-1.7.22.sql` | Tablas base de Better Auth mapeadas a nombres físicos en español. |
| `0002-endurecer-tablas-better-auth.sql` | Unicidad proveedor/cuenta, defaults y nulabilidad; una configuración 2FA por usuario. |
| `0003-roles.sql` | Catálogo inicial, asignaciones y protección del primer administrador mediante índices y triggers. |
| `0004-invitaciones.sql` | Invitaciones, estados coherentes, normalización de correo y una pendiente por correo. |
| `0005-limites-envio-otp.sql` | Contadores PostgreSQL para la espera por cuenta y el límite por IP. |

Las pruebas de migración e integración requieren `TEST_DATABASE_URL` dirigido a
una base descartable. No ejecutes migraciones de prueba contra producción.

## Tablas

### Identidad y autenticación

| Tabla | Uso y reglas relevantes |
|---|---|
| `usuario` | Identidad, correo único, nombre, verificación y marca `doble_factor_habilitado`. El primer administrador no se puede borrar. |
| `cuenta` | Cuenta/proveedor y credencial. `hash_contrasena` contiene el hash gestionado por Better Auth, nunca la contraseña en claro. La pareja (`id_proveedor`, `id_cuenta`) es única. |
| `sesion` | Sesiones con token único, expiración, IP y agente de usuario opcionales. Se eliminan en cascada con el usuario. Better Auth configura 12 horas de expiración y actualización cada 10 minutos; al crear una sesión, el hook de la API elimina las anteriores de esa cuenta. |
| `verificacion` | Valores temporales de Better Auth. El OTP por correo se guarda cifrado; también se usa para el flujo de recuperación de contraseña. |
| `doble_factor` | Tabla requerida por el plugin de Better Auth para la configuración 2FA y códigos de respaldo. Hay como máximo una fila por usuario. El inicio de sesión de la aplicación usa OTP por correo; la interfaz no configura TOTP. |

Los nombres canónicos de Better Auth se mapean en `api/src/auth.js`. La tabla
base no contiene una bitácora administrativa append-only.

### Roles

`rol` contiene inicialmente `ADMINISTRADOR`, `JURADO`, `ESCRIBANO` y
`COMISARIO`. `usuario_rol` permite múltiples asignaciones por persona y registra
`asignado_por`, `asignado_en` y `es_inicial`.

- La pareja (`usuario_id`, `rol_id`) es clave primaria.
- `es_inicial` solo puede usarse con `ADMINISTRADOR`; un índice parcial permite
  una sola asignación inicial.
- Triggers impiden quitar o cambiar esa asignación, y borrar al primer
  administrador.
- Al borrar a otros usuarios, sus asignaciones se eliminan en cascada; al borrar
  a quien asignó un rol, `asignado_por` pasa a `NULL`.

El catálogo no es dinámico. La autorización implementada de administración
comprueba `ADMINISTRADOR` en cada petición. Los permisos de Jurado, Escribano y
Comisario para funciones de votación aún no están implementados.

### Invitaciones

`invitacion` guarda correo normalizado, rol inicial, hash único del token,
estado, vencimiento, creador y fechas de resolución. El token original no se
guarda. El índice parcial `invitacion_pendiente_por_correo_unica` permite como
máximo una invitación con estado almacenado `pendiente` por correo.

Los estados admitidos son `pendiente`, `aceptada`, `revocada` y `vencida`.
Las restricciones `CHECK` relacionan el estado con `aceptada_en` y
`revocada_en`. Una invitación pendiente cuya fecha ya pasó se presenta como
vencida en las consultas; al reenviar, su estado almacenado se actualiza dentro
de la transacción. El enlace dura 72 horas.

La aceptación bloquea la invitación y crea la cuenta, asigna el rol inicial y
consume el enlace. Si la entrega por correo falla al crear o reenviar, la
invitación permanece pendiente y la API comunica el fallo.

### Límites de envío OTP

`limite_envio_otp` persiste contadores compartidos entre instancias: espera de
30 segundos por cuenta y hasta 5 solicitudes por IP en una ventana de 10
minutos. Ambos límites se verifican y actualizan en una transacción. El código
OTP y su vencimiento los administra Better Auth en `verificacion`.

## Límites conocidos

- Esta página cubre el esquema de autenticación. Las planillas, suplencias y el
  cierre de noche usan migraciones separadas; consultar el [índice de
  votación](../README.md#votación). No hay tablas de resultados implementadas.
- La auditoría append-only de votación no equivale a un registro completo de
  todos los cambios administrativos de cuentas.
- La garantía de sesión única y los límites se probaron en el alcance de las
  pruebas existentes; no hay validación operativa de producción o de una
  topología con varias instancias.

Para rutas de API, consulta la [referencia de endpoints](api-reference.md).
