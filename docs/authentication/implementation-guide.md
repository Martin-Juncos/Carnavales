# Guía de implementación y verificación

Esta guía describe cómo ejecutar y verificar la autenticación que ya está
implementada. Las decisiones funcionales están en [flujos](flows.md) y el
esquema en [base de datos](database.md).

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

`npm run bootstrap-admin` crea el primer administrador; ejecútalo solo durante
la inicialización y siguiendo el prompt de la CLI. En desarrollo, el correo se
envía a consola. Gmail requiere credenciales de aplicación configuradas fuera
del repositorio. No incluyas `.env`, contraseñas, tokens u OTP en commits o logs.

## Pendiente antes de producción

Configurar alojamiento, TLS, dominio y proveedor transaccional de correo;
establecer `TRUST_PROXY` según la infraestructura; revisar logs, permisos de
base de datos y almacenamiento compartido si hay varias instancias; y ejecutar
pruebas operativas de los flujos de acceso, OTP, recuperación y autorización.
