# Memoria operativa del repositorio

**Propósito:** contexto breve para la próxima sesión; no es un registro de credenciales, transcripciones ni sustituto de `docs/`. Actualizar cuando cambien stack, reglas, deployment o pendientes. Corte: 20/10/2026 (`7c45056`).

## Fuentes y límites

- `AGENTS.md` y los AGENTS de `api/`/`client/`: invariantes e instrucciones.
- `docs/README.md`: índice y estados (confirmado, implementado, pendiente).
- No guardar secretos, URLs de conexión, OTP, dumps o PII aquí.

## Arquitectura y comandos

API Node/Express/Better Auth/pg (`api/`); cliente React/Vite/JSX/CSS/PWA (`client/`); PostgreSQL con SQL versionado. Auth migrate antes de db migrate. Tests API solo sobre DB descartable; cliente `npm test --prefix client`; CI también construye cliente. `client/AGENTS.md` prohíbe build local.

## Flujo Git permanente

`main` y `developer` son las únicas ramas permanentes. Todo trabajo debe seguir este flujo:

1. Actualizar `developer` desde el remoto.
2. Crear una rama de trabajo desde `developer`.
3. Realizar commits pequeños y coherentes.
4. Abrir un pull request de la rama de trabajo hacia `developer`.
5. Integrar mediante merge commit y eliminar la rama de trabajo local y remota.
6. Ejecutar sobre `developer` todas las verificaciones disponibles para el cambio.
7. Si las verificaciones son correctas, abrir e integrar mediante merge commit un pull request de `developer` hacia `main`.
8. Sincronizar las ramas locales y mantener solamente `main` y `developer` en local y remoto.

## Pendientes de producto/operación

Reglamento global (desempates, impugnaciones, votos tardíos, excepciones), política legal de retención, prueba post-release de login+OTP/roles y gate automatizado antes de considerar auto deploy. No transformar el comportamiento actual en regla aprobada. Último backup de release permanece privado fuera del repo; la ubicación/hash históricos constan en el runbook, no reutilizarlo como respaldo actual.
