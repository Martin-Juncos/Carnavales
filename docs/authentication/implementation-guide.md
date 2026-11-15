# Guía de implementación de autenticación

Esta guía convierte el diseño aprobado en una secuencia ejecutable. La base de datos y las migraciones `0001`–`0004` ya están escritas; el objetivo ahora es validar esa base y construir la aplicación en incrementos que puedan probarse de punta a punta.

**Diseño funcional:** [flujos de autenticación y administración](flows.md)

**Esquema y migraciones:** [base de datos](database.md)

**Estado vigente:** [guía de autenticación](README.md)

## Orden recomendado

| Etapa | Entrega verificable | Depende de |
|---|---|---|
| 1. Validar PostgreSQL | Migraciones aplicadas y restricciones verificadas en una base descartable. | Ninguna |
| 2. Crear el esqueleto ejecutable de la API | La API arranca, valida configuración y conecta a PostgreSQL; hay pruebas automatizadas. | 1 |
| 3. Integrar Better Auth y el bootstrap | El primer administrador puede iniciar sesión con contraseña y OTP. | 2 |
| 4. Completar invitaciones | El administrador invita; una persona acepta el enlace de un solo uso y crea su cuenta. | 3 |
| 5. Completar administración y permisos | Usuarios, invitaciones y roles se gestionan con autorización efectiva en la API. | 4 |
| 6. Construir el cliente web | La interfaz cubre los recorridos ya probados por API. | 3–5 |
| 7. Preparar el despliegue | Correo y límites funcionan con la topología de producción y sus varias instancias, si las hubiera. | 3–6 |

No conviene crear carpetas o pantallas vacías por adelantado. Cada etapa debe entregar comportamiento observable y pruebas antes de abrir la siguiente.

## Etapa 1: validar las migraciones

1. Crear una base PostgreSQL descartable, usando PostgreSQL 18 como referencia inicial del spike.
2. Aplicar, en orden, `api/migrations/0001-better-auth-1.7.22.sql` a `api/migrations/0004-invitaciones.sql`.
3. Ejecutar `api/migrations/tests/verify-0002-0004.sql` con `psql -v ON_ERROR_STOP=1`.
4. Antes de tratar el resultado como una prueba concluyente, hacer que cualquier aserción fallida termine con error. El helper actual devuelve texto `FALLA` si una operación inválida es aceptada; por sí solo, ese texto no garantiza un código de salida distinto de cero en `psql`.
5. Confirmar las restricciones de roles e invitaciones y que la prueba revierte sus datos al finalizar.

**Verificado:** PostgreSQL 18.6 en una instancia local descartable. Las migraciones `0001`–`0004` se aplicaron en orden; el script terminó correctamente y dejó cero usuarios e invitaciones de prueba y los cuatro roles iniciales. Al retirar deliberadamente el índice `invitacion_pendiente_por_correo_unica`, el script falló con código 3 y señaló la restricción ausente.

**Cierre:** una base limpia recibe todas las migraciones en orden; las pruebas terminan sin `FALLA` y fallan con código distinto de cero si se rompe una restricción.

Comando de verificación, desde la raíz del repositorio y con `DATABASE_URL` apuntando a una base descartable que ya tiene aplicadas las cuatro migraciones:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f api/migrations/tests/verify-0002-0004.sql
```

## Etapa 2: crear una API mínima ejecutable

La API usa Express 5.3.0, fijado en `api/package.json` y `api/package-lock.json`. La integración futura de Better Auth debe montar `toNodeHandler(auth)` en `/api/auth/*splat` antes de cualquier middleware que consuma el body. En esta etapa:

1. Validar `DATABASE_URL` como URL PostgreSQL y `PORT` como puerto TCP válido. El servidor escucha por defecto en `127.0.0.1:3000`; `HOST` y `PORT` se pueden configurar.
2. Crear un pool PostgreSQL y verificar la conexión antes de aceptar tráfico. Cerrar el servidor y el pool al recibir `SIGINT` o `SIGTERM`.
3. Exponer `GET /health`: devuelve `200` si PostgreSQL responde y `503` en caso contrario, sin devolver mensajes internos ni credenciales.
4. Aplicar las migraciones solo mediante `npm run migrate`, nunca durante el arranque. El comando registra archivos aplicados en `migracion`, usa transacciones por archivo y un advisory lock para serializar ejecuciones concurrentes.
5. Agregar scripts `npm run dev`, `npm start`, `npm run migrate` y `npm test`.
6. Agregar pruebas de arranque, validación de configuración y salud de la base.

**Verificado:** pruebas de unidad de configuración, arranque y salud; comando de migraciones ejecutado dos veces sobre PostgreSQL 18.6 descartable, con la segunda ejecución sin cambios; `GET /health` respondió según disponibilidad de la base.

**Cierre:** otra persona puede instalar dependencias, configurar una base descartable, aplicar migraciones y arrancar la API siguiendo comandos reproducibles; fallos de configuración o base son claros y no exponen la URL.

Desde `api/`, los comandos son `npm ci`, `npm run migrate`, `npm start` y `npm test`. Para desarrollo, usar `npm run dev`. `DATABASE_URL` es obligatorio; `HOST` y `PORT` son opcionales.

## Etapa 3: integrar Better Auth y crear el primer administrador

1. Llevar `api/auth.config.js` del spike a la configuración usada por el servidor real. Conservar el mapeo de tablas y campos aprobado y deshabilitar el registro público.
2. Integrar Better Auth con PostgreSQL y verificar por su interfaz pública creación de sesión, cierre de sesión y protección de rutas.
3. Configurar OTP cifrado, seis dígitos, vencimiento e intentos acordados, recuperación de contraseña y revocación de sesiones al cambiar la contraseña.
4. Implementar el comando de bootstrap fuera de una ruta pública. Debe obtener la contraseña sin exponerla en argumentos o logs, crear el primer `ADMINISTRADOR` con `es_inicial = true` y tolerar ejecuciones repetidas o concurrentes sin crear dos cuentas iniciales.
5. Probar que solo una sesión autenticada queda activa después de completar OTP. El spike probó el hook en una instancia; la serialización en varias instancias queda para la etapa de despliegue.

**Cierre:** el bootstrap crea exactamente un primer administrador protegido por las restricciones SQL; ese usuario puede iniciar y cerrar sesión con contraseña y OTP, y la recuperación no deja sesiones antiguas activas.

## Etapa 4: completar el ciclo de invitaciones

1. Implementar creación y reenvío: normalizar el correo, rechazar cuentas existentes, guardar solo el hash del token y mantener como máximo una invitación pendiente por correo.
2. En desarrollo, entregar el enlace por consola; no incorporar todavía credenciales de correo productivas.
3. Implementar consulta y revocación respetando los estados y permisos definidos en [flujos](flows.md).
4. Implementar aceptación atómica: verificar token, estado, vencimiento y correo; crear usuario y credencial mediante Better Auth, asignar el rol inicial y consumir la invitación en una operación consistente.
5. Probar token inválido, vencido, revocado, reutilizado, reenvíos y dos aceptaciones concurrentes. Las respuestas a enlaces inválidos deben usar el mismo mensaje genérico del diseño.

**Cierre:** un administrador autenticado puede invitar a una persona; el enlace válido crea una cuenta una sola vez, y ningún enlace inválido o consumido crea una cuenta.

## Etapa 5: autorización y administración

1. Aplicar autorización del lado de la API en cada operación, consultando asignaciones reales de `usuario_rol`; el rol activo del cliente solo organiza la interfaz.
2. Implementar consulta paginada de usuarios e invitaciones, asignación/retiro de un rol por operación y revocación de invitaciones.
3. Implementar eliminación definitiva de cuentas, excluyendo al primer administrador; no permitir autoeliminación ni cambios de roles propios.
4. Probar permisos por rol, cambios efectivos en la siguiente petición, sesiones revocadas y casos concurrentes relevantes.

**Cierre:** una petición sin permiso se rechaza aunque el cliente manipule su rol activo; el primer administrador no puede borrarse ni perder su rol.

## Etapa 6: construir el cliente web

Cuando los recorridos principales estén disponibles y probados en la API, crear el cliente React/Vite acordado. Implementar en este orden:

1. acceso, desafío OTP, cierre de sesión y recuperación de contraseña;
2. aceptación de invitación y selección de contraseña;
3. selección del rol entre los ya asignados;
4. gestión administrativa de usuarios, roles e invitaciones;
5. estados de carga, error, sesión vencida y acceso denegado.

**Cierre:** cada pantalla cubre un recorrido existente en la API; cambiar el rol mostrado en el navegador no concede permisos adicionales.

## Etapa 7: preparar el despliegue

1. Elegir SMTP o Gmail cuando estén definidos el dominio y el alojamiento; configurar secretos fuera del repositorio.
2. Implementar y probar la espera de 30 segundos por cuenta y el límite de cinco envíos por IP en diez minutos.
3. Si el despliegue tiene varias instancias, usar almacenamiento compartido y operaciones atómicas para los límites y para correlacionar el resultado del envío. El almacenamiento temporal en memoria del spike no basta para esa topología.
4. Verificar recuperación, registros sin secretos, TLS, permisos mínimos de base de datos y el comportamiento ante fallos del proveedor de correo.

**Cierre:** los límites no se pueden eludir distribuyendo solicitudes entre instancias; un fallo de entrega no se presenta como envío exitoso ni concede una sesión.

## Criterio de finalización

La primera versión está lista para evaluación funcional cuando una persona operadora puede crear el primer administrador, este puede autenticarse con OTP, invitar a otra persona, y esa persona puede aceptar la invitación e iniciar sesión. La API debe hacer cumplir los roles en servidor y las pruebas de PostgreSQL y de los recorridos deben pasar. El despliegue productivo de correo queda pendiente hasta decidir proveedor, dominio y alojamiento.
