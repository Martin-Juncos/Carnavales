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

Si existe `client/dist/index.html`, Express también sirve el cliente desde el
mismo origen. El servidor no compila el cliente: genera `client/dist/` con
`npm run build` desde `client/`.

Las pruebas de integración requieren `TEST_DATABASE_URL` apuntando a una base
PostgreSQL descartable con permisos para crear y eliminar esquemas. No ejecutes
pruebas ni `api/scripts/spikes/auth/session-race.mjs` contra producción. La aplicación no aplica
migraciones automáticamente al arrancar.

La migración `0024-retirar-enmienda-reglamento.sql` retira la tabla de
enmiendas solo si está vacía. Si existe historial o una dependencia ajena
a su estructura original, la migración se revierte y queda pendiente.
Conservá los registros y revisá la dependencia antes de volver a ejecutarla; no
vacíes la tabla ni fuerces el borrado con `CASCADE`.

Más detalle: [diseño y estado de autenticación](../docs/authentication/README.md)
y [referencia de rutas](../docs/authentication/api-reference.md).

## Votación, cierres, penalizaciones y resultados

| Migraciones | Alcance |
|---|---|
| `0006`–`0014` | Configuración de ediciones, asignaciones de jurado, padrón, reglamento, filas de planilla, apertura de noches y catálogo del jurado. |
| `0015`–`0016` | Filas definitivas por noche y especialidad, y confirmación explícita de listas vacías. |
| `0017` | Recepción oficial, idempotencia e inmutabilidad de la planilla. |
| `0018`–`0019` | Suplencias, dispositivo de edición, traspaso de borradores y autoría. |
| `0020`–`0021` | Verificación de planillas esperadas y cierre de noche con auditoría (P5). |
| `0022`–`0025` | Auditoría por edición, retiro de edición, retiro de tabla de enmiendas y eliminación física completa de ediciones. |
| `0026`–`0028` | Cierre total irreversible (P6A), penalizaciones digitales append-only (P6B) y cálculo versionado de resultados, empates y publicación oficial (P6C). |
| `0029`–`0032` | Eliminación completa y aperturas unificadas sobre `DATABASE_URL` (sin cuentas dedicadas), tope `nominados_maximos_por_comparsa` en rubros `ALEATORIO` y logo visual opcional por comparsa (`logo_data_url`). |
| `0033`–`0034` | Categorías de agrupación de rubros (`categoria_rubro`, `rubro.categoria_id` opcional) e integrantes de sujetos `GRUPO` (`integrante_grupo`) con representación textual opcional por sujeto (`sujeto_evaluable.representacion`). |

Todas las rutas (incluidas aperturas, cierres y eliminación completa) usan la
conexión principal `DATABASE_URL` con verificación de sesión y rol en base de
datos. Consultá los contratos vigentes de
[configuración y apertura](../docs/voting/configuracion-api.md),
[asignaciones y suplencias](../docs/voting/asignaciones-api.md),
[Jurado](../docs/voting/jurado-api.md),
[cierre de noche (P5)](../docs/voting/cierre-noche-api.md),
[cierre total (P6A)](../docs/voting/cierre-total-api.md),
[penalizaciones (P6B)](../docs/voting/penalizaciones-api.md) y
[resultados y publicación (P6C)](../docs/voting/resultados-api.md).

## Integración de las bases de desarrollo

Si ya probaste las ramas `login/autenticacion` o `feat/configurar-edicion`,
creá **una base descartable nueva** y ejecutá `npm run migrate` apuntando a ella.
Ambas ramas tenían catálogos experimentales distintos; esta secuencia se verifica
desde cero y no convierte bases anteriores. La `0008` vigente es la de padrón;
la `0014` completa el catálogo de jurados sobre las mismas filas que genera administración.

## Estructura y convenciones

- `src/index.js`: arranque; `src/app.js`: composicion HTTP.
- `src/modules/<dominio>/`: rutas (`*.routes.js`) y servicios del dominio; no se agregan capas vacias.
- `src/http/`: autorizacion y middleware; `src/infra/`: configuracion, base y correo; `src/shared/`: utilidades transversales. Estas carpetas no importan modulos de negocio.
- `src/cli/`: comandos operativos. Los scripts experimentales estan en `scripts/spikes/auth/`; no se ejecutan como parte del arranque ni de las pruebas y solo se usan contra bases descartables.
- `test/` refleja dominios y areas de `src/`; `test/helpers/` contiene fixtures compartidos. `npm test` descubre las pruebas recursivamente.
- Archivos JavaScript en kebab-case; imports relativos explicitos, sin barrels masivos. Se preservan firmas exportadas, validadores y estados HTTP existentes.
- Las migraciones conservan nombre, orden, contenido y ubicacion; `migrations/pendientes/` no contiene migraciones ejecutables del sistema.
- El motor puro de resultados vive en `modules/resultados/resultados.engine.js`, sin acceso a infraestructura; el servicio mantiene transacciones y contratos.
