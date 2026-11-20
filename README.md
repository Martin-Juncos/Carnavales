# Carnavales 2027

Sistema web para la operación del carnaval. La rama de trabajo implementa
autenticación, administración y **votación por noche hasta P5**: configuración y
apertura, planillas del Jurado con confirmación sin conexión, recepción
idempotente, suplencias con traspaso auditado y cierre de noche por el Escribano.

El cierre de la votación completa, el cálculo y la publicación de resultados
siguen pendientes. Publicar la rama no integra los cambios ni aplica las
migraciones en un entorno.

## Componentes

- `api/`: Node.js, Express, Better Auth y PostgreSQL; puede servir el cliente
  compilado desde `client/dist/` si existe.
- `client/`: React y Vite; reenvía las rutas de API durante el desarrollo.
- `docs/`: guías de operación, contratos de API y decisiones de autenticación y
  votación; los diseños históricos están identificados como tales.

## Inicio rápido

Requisitos: Node.js compatible con `--env-file-if-exists` y PostgreSQL.

1. Configura `api/.env` a partir de [`api/.env.example`](api/.env.example).
   Define `DATABASE_URL` y genera un `BETTER_AUTH_SECRET` propio de al menos
   32 caracteres. No uses secretos de producción en desarrollo.
2. Instala y ejecuta la API desde `api/`:

   ```sh
   npm ci
   npm run migrate
   npm run dev
   ```

3. En otra terminal, inicia el cliente desde `client/`:

   ```sh
   npm ci
   npm run dev
   ```

El cliente reenvía `/api` y `/health` a `http://127.0.0.1:3000` por defecto.
Consulta los README de [API](api/README.md) y [cliente](client/README.md) para
configuración y comandos.

## Documentación y pruebas

- [Índice de documentación](docs/README.md)
- [Guía de uso](docs/user-guide.md)
- [Estado de autenticación](docs/authentication/README.md)
- [API de autenticación](docs/authentication/api-reference.md)
- [API de asignaciones y suplencias](docs/voting/asignaciones-api.md)
- [API del Jurado](docs/voting/jurado-api.md)
- [API de cierre de noche](docs/voting/cierre-noche-api.md)

Las pruebas que usan PostgreSQL deben apuntar exclusivamente a una base
descartable mediante `TEST_DATABASE_URL`. Las variables locales van en `api/.env`,
que no se versiona.
