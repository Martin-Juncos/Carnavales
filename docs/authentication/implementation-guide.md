# Guía de implementación y verificación

Esta guía describe cómo ejecutar y verificar la autenticación que ya está
implementada. Las decisiones funcionales están en [flujos](flows.md), las rutas
en [referencia de API](api-reference.md) y el esquema en [base de datos](database.md).

## Requisitos

- Node.js compatible con `--env-file-if-exists`.
- PostgreSQL para ejecutar la API y las pruebas de integración.
- Una base de datos descartable separada para pruebas.

## Configuración local

1. En `api/`, copia `.env.example` como `.env`.
2. Configura `DATABASE_URL` a una base local, `BETTER_AUTH_SECRET` (mínimo 32
   caracteres), `BETTER_AUTH_URL` y `APP_URL`.
3. Para desarrollo, usa `EMAIL_PROVIDER=console`; los enlaces y códigos se
   imprimen en la terminal. No uses ese proveedor en producción.
4. Instala dependencias, migra y arranca la API:

   ```sh
   cd api
   npm ci
   npm run migrate
   npm run dev
   ```

5. En otra terminal, instala e inicia el cliente:

   ```sh
   cd client
   npm ci
   npm run dev
   ```

El cliente reenvía `/api` y `/health` a la API local. Consulta
[`api/README.md`](../../api/README.md) y
[`client/README.md`](../../client/README.md) para más detalle.

## Migraciones

Las migraciones SQL versionadas se encuentran en `api/migrations/` y se aplican
en orden mediante `npm run migrate`. No se ejecutan automáticamente al iniciar
el servidor. El script `migrations/tests/verify-0002-0004.sql` verifica
restricciones sobre una base descartable; las pruebas de migración requieren
`TEST_DATABASE_URL`.

## Pruebas

Desde `api/`:

```sh
npm test
```

Sin `TEST_DATABASE_URL`, las pruebas de integración que necesitan PostgreSQL se
omiten. Si la defines, debe apuntar exclusivamente a una base descartable:
algunas pruebas crean y eliminan esquemas/datos.

Desde `client/`:

```sh
npm test
```

`api/session-race.mjs` es un script manual que escribe en la base indicada por
`DATABASE_URL`; úsalo solo con una base descartable. No se ha validado una
topología productiva de varias instancias.

## Bootstrap y correo

El primer usuario se crea como administrador inicial con un comando de
configuración, no mediante registro público ni invitación. Antes de ejecutarlo:

1. Configura `api/.env` con `DATABASE_URL`, `BETTER_AUTH_SECRET` (mínimo 32
   caracteres), `BETTER_AUTH_URL` y `APP_URL`.
2. Asegúrate de que la base indicada por `DATABASE_URL` exista y tenga aplicadas
   las migraciones (`npm run migrate`, desde `api/`).
3. En una terminal interactiva, desde `api/`, ejecuta:

   ```sh
   npm run bootstrap-admin
   ```

La CLI solicita nombre, correo y contraseña; la contraseña no se muestra al
escribirla. Better Auth administra su hash. La cuenta queda con el correo
verificado, el segundo factor habilitado y el rol `ADMINISTRADOR`. El primer
inicio de sesión requiere un código OTP por correo; con `EMAIL_PROVIDER=console`
en desarrollo, el código aparece en la terminal de la API.

El bootstrap se puede completar una sola vez. Si ya existe un primer
administrador, el comando se detiene sin crear otro. No incluyas `.env`,
contraseñas, tokens u OTP en commits o logs.

## Pendiente antes de producción

Configurar alojamiento, TLS, dominio y proveedor transaccional de correo;
establecer `TRUST_PROXY` según la infraestructura; revisar logs, permisos de
base de datos y almacenamiento compartido si hay varias instancias; y ejecutar
pruebas operativas de los flujos de acceso, OTP, recuperación y autorización.
