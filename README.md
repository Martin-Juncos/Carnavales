# Carnavales 2027

Sistema web para la operación del carnaval. Este repositorio contiene actualmente
la API y el cliente web de **autenticación y administración de cuentas**. El flujo
de votación sigue en etapa de diseño; sus documentos no implican que ya esté
implementado ni que las reglas pendientes estén aprobadas.

## Componentes

- `api/`: Node.js, Express, Better Auth y PostgreSQL; puede servir el cliente
  compilado desde `client/dist/` si existe.
- `client/`: React y Vite; reenvía las rutas de API durante el desarrollo.
- `docs/`: decisiones y estado de autenticación, además de diseños del sistema de
  votación.

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
- [Rutas de la API](docs/authentication/api-reference.md)
- [Diseño de votación](docs/voting/)

Las pruebas que usan PostgreSQL deben apuntar exclusivamente a una base
descartable mediante `TEST_DATABASE_URL`. Las variables locales van en `api/.env`,
que no se versiona.
