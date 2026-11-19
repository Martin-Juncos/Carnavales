# Referencia de API de autenticación

La API es Express y Better Auth. Las rutas de Better Auth se montan bajo
`/api/auth`; esta página documenta las rutas usadas por el cliente y las rutas
propias visibles en `api/src/app.js`. No es una especificación OpenAPI completa.
Si existe `client/dist/index.html`, Express sirve también los archivos estáticos
y el fallback del cliente; no hay endpoints de negocio adicionales en esa ruta.

Las rutas administrativas requieren una sesión válida y el rol
`ADMINISTRADOR`, consultado en PostgreSQL en cada petición. Los endpoints de
Better Auth usan cookies del mismo origen.

## Estado y autenticación

| Método | Ruta | Acceso | Uso |
|---|---|---|---|
| `GET` | `/health` | Público | Devuelve `200` si PostgreSQL responde y `503` si no está disponible. |
| `POST` | `/api/auth/sign-in/email` | Público | Inicia el paso de correo y contraseña; una cuenta habilitada continúa con OTP. |
| `POST` | `/api/auth/two-factor/send-otp` | Usuario en desafío | Envía o reenvía el código, sujeto a los límites por cuenta e IP. |
| `POST` | `/api/auth/two-factor/verify-otp` | Usuario en desafío | Verifica el código y completa el inicio de sesión. |
| `GET` | `/api/auth/get-session` | Sesión | Devuelve la sesión actual. |
| `POST` | `/api/auth/sign-out` | Sesión | Cierra la sesión actual. |
| `POST` | `/api/auth/request-password-reset` | Público | Solicita un enlace de recuperación; no revela si existe el correo. |
| `POST` | `/api/auth/reset-password` | Token de recuperación | Cambia la contraseña y revoca las sesiones de esa cuenta. |

Better Auth también atiende otras rutas bajo `/api/auth/*`; las anteriores son
las utilizadas por el cliente actual.

## Invitaciones y cuenta propia

| Método | Ruta | Acceso | Uso |
|---|---|---|---|
| `POST` | `/api/invitaciones/aceptar` | Público con token | Crea la cuenta desde una invitación. No inicia sesión automáticamente. |
| `GET` | `/api/mi-cuenta/roles` | Sesión | Devuelve los códigos de rol asignados a la persona actual. |

## Administración

Todas estas rutas requieren rol `ADMINISTRADOR`.

| Método | Ruta | Parámetros/uso |
|---|---|---|
| `GET` | `/api/admin/usuarios` | `pagina`, `limite` (máximo 100) y `buscar` opcionales. Busca por correo o nombre. |
| `POST` | `/api/admin/usuarios/:id/roles/:codigo` | Asigna un rol existente. |
| `DELETE` | `/api/admin/usuarios/:id/roles/:codigo` | Retira un rol; no permite retirar la asignación inicial protegida. |
| `DELETE` | `/api/admin/usuarios/:id` | Elimina al usuario, excepto al primer administrador. |
| `GET` | `/api/admin/asignaciones` | Consulta de asignaciones por noche y especialidad; contrato en `docs/voting/asignaciones-api.md`. |
| `GET` | `/api/admin/jurados` | Usuarios con rol `JURADO`; contrato en `docs/voting/asignaciones-api.md`. |
| `GET` | `/api/admin/invitaciones` | `pagina`, `limite` (máximo 100), `estado` y `correo` opcionales. |
| `POST` | `/api/admin/invitaciones` | JSON `{ "correo": "...", "rol": "JURADO" }`; crea y envía una invitación. |
| `POST` | `/api/admin/invitaciones/:id/reenviar` | Emite un enlace nuevo para invitación pendiente o vencida. |
| `POST` | `/api/admin/invitaciones/:id/revocar` | Revoca una invitación pendiente. |

Los listados devuelven paginación y no exponen hashes de contraseñas, tokens de
invitación ni secretos 2FA. Los errores de dominio responden con estado HTTP y
código propios.

## Límites de alcance

- No hay endpoints de captura de votos, resultados ni actas; las rutas de consulta de asignaciones de jurados están documentadas en `docs/voting/asignaciones-api.md`.
- No existe una ruta para cambiar el propio rol activo en el servidor: la
  selección del rol es del cliente y no amplía permisos de API.
- La implementación no impide que un administrador posterior se modifique sus
  roles o elimine su propia cuenta; la base protege específicamente al primer
  administrador. Considera este comportamiento antes de exponer el sistema.
