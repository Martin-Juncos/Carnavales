# API

API Node.js con Express, Better Auth y PostgreSQL. Desde este directorio, copia
[`.env.example`](.env.example) como `.env` y completa los valores localmente.
Nunca versiones `.env` ni credenciales reales.

## Configuración

Variables principales:

- `DATABASE_URL`: URL de PostgreSQL.
- `DATABASE_URL_APERTURA` (opcional): URL de una cuenta de PostgreSQL miembro del
  rol `carnavales_servicio_apertura`, no superusuario. Solo la usan las aperturas de
  edición y noche; sin ella, ambas rutas responden 503.
  Al arrancar se comprueba la pertenencia al rol y se rechaza un superusuario.
- `DATABASE_URL_ELIMINAR_EDICION` (opcional): URL de una cuenta de PostgreSQL
  dedicada, no superusuario, con membresía heredada en
  `carnavales_servicio_eliminar_edicion`. Solo la usa la eliminación física
  completa de una edición; sin ella, esa ruta responde 503. Al arrancar se
  comprueban el inicio de sesión, la membresía efectiva y que la cuenta no sea
  superusuario. La cuenta de aplicación no debe recibir esta membresía.
  Después de migrar, un DBA debe conceder el rol de servicio al login dedicado:
  `GRANT carnavales_servicio_eliminar_edicion TO <login_dedicado>;`
  No concedas esa membresía a `DATABASE_URL` ni a cuentas personales.
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

Si existe `client/dist/index.html`, Express también sirve el cliente desde el
mismo origen. El servidor no compila el cliente: genera `client/dist/` con
`npm run build` desde `client/`.

Las pruebas de integración requieren `TEST_DATABASE_URL` apuntando a una base
PostgreSQL descartable con permisos para crear y eliminar esquemas. No ejecutes
pruebas ni `api/session-race.mjs` contra producción. La aplicación no aplica
migraciones automáticamente al arrancar.

La migración `0024-retirar-enmienda-reglamento.sql` retira la tabla de
enmiendas solo si está vacía. Si existe historial o una dependencia ajena
a su estructura original, la migración se revierte y queda pendiente.
Conservá los registros y revisá la dependencia antes de volver a ejecutarla; no
vacíes la tabla ni fuerces el borrado con `CASCADE`.

Más detalle: [diseño y estado de autenticación](../docs/authentication/README.md)
y [referencia de rutas](../docs/authentication/api-reference.md).

## Votación por noche

| Migraciones | Alcance |
|---|---|
| `0015`–`0016` | Filas definitivas por noche y especialidad, y confirmación explícita de listas vacías. |
| `0017` | Recepción oficial, idempotencia e inmutabilidad de la planilla. |
| `0018`–`0019` | Suplencias, dispositivo de edición, traspaso de borradores y autoría. |
| `0020`–`0021` | Verificación de planillas esperadas y cierre de noche con auditoría. |

El cierre usa `DATABASE_URL`, no la cuenta dedicada de apertura, y exige una
sesión con rol `ESCRIBANO`. Consultá los contratos de [asignaciones y
suplencias](../docs/voting/asignaciones-api.md), [Jurado](../docs/voting/jurado-api.md)
y [cierre de noche](../docs/voting/cierre-noche-api.md).

## Integración de las bases de desarrollo

Si ya probaste las ramas `login/autenticacion` o `feat/configurar-edicion`,
creá **una base descartable nueva** y ejecutá `npm run migrate` apuntando a ella.
Ambas ramas tenían catálogos experimentales distintos; esta secuencia se verifica
desde cero y no convierte bases anteriores. La `0008` vigente es la de padrón;
la `0014` completa el catálogo de jurados sobre las mismas filas que genera administración.
