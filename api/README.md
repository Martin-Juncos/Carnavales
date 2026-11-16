# API

API Node.js con Express, Better Auth y PostgreSQL. Desde este directorio, copia
[`.env.example`](.env.example) como `.env` y completa los valores localmente.
Nunca versiones `.env` ni credenciales reales.

## Configuración

Variables principales:

- `DATABASE_URL`: URL de PostgreSQL.
- `BETTER_AUTH_SECRET`: secreto de autenticación propio, mínimo 32 caracteres.
- `BETTER_AUTH_URL`: URL pública/base de Better Auth.
- `APP_URL`: origen del cliente.
- `EMAIL_PROVIDER`: `console` para desarrollo o `gmail` con `GMAIL_USER` y
  `GMAIL_APP_PASSWORD` configurados.
- `HOST` y `PORT`: dirección de escucha; por defecto `127.0.0.1:3000`.
- `TRUST_PROXY`: proxies confiables delante de la API; no lo habilites sin
  conocer la topología del despliegue.

Con `EMAIL_PROVIDER=console`, los códigos y enlaces se escriben en la terminal;
usa esta opción solo en desarrollo y pruebas.

## Comandos

Desde este directorio:

```sh
npm ci
npm run migrate
npm run dev
```

`npm start` inicia el servidor sin modo watch. `npm test` ejecuta las pruebas.
`npm run bootstrap-admin` crea el primer administrador y debe usarse solo durante
la configuración inicial, con una base controlada.

Las pruebas de integración requieren `TEST_DATABASE_URL` apuntando a una base
PostgreSQL descartable con permisos para crear y eliminar esquemas. No ejecutes
pruebas ni `api/session-race.mjs` contra producción. La aplicación no aplica
migraciones automáticamente al arrancar.

Más detalle: [diseño y estado de autenticación](../docs/authentication/README.md).
