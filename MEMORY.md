# Memoria operativa

Contexto breve para futuras sesiones; no sustituye la documentación ni contiene
credenciales, URLs privadas, OTP, datos personales o volcados.

## Estado del repositorio

- La rama de trabajo de autenticación se prepara sobre `developer` del repositorio
  `Martin-Juncos/Carnavales`.
- API: Node.js/Express, Better Auth 1.7.22 y PostgreSQL; migraciones SQL en
  `api/migrations/`.
- Cliente: React/Vite. Autenticación, OTP, invitaciones, recuperación y
  administración están implementados.
- La votación/PWA y el despliegue productivo siguen pendientes; revisar
  `docs/README.md` y `docs/voting/` antes de afirmar alcance.

## Comandos y seguridad

- API: `npm test` en `api/`; integración PostgreSQL solo con `TEST_DATABASE_URL`
  apuntando a una base descartable.
- Cliente: `npm test` en `client/`. No ejecutar builds locales salvo que la tarea
  lo requiera explícitamente.
- `api/.env` es local e ignorado. No copiar secretos a ejemplos, documentación,
  commits ni logs.
- `api/session-race.mjs` escribe en la base indicada por `DATABASE_URL`; usar
  exclusivamente una base desechable.

## Flujo Git

`main` y `developer` son las ramas permanentes del repositorio destino. El trabajo
se prepara en una rama desde `developer`, se revisa y luego se propone mediante
PR hacia `developer`; no publicar ni integrar sin aprobación del usuario.
Después de integrar, ejecutar las verificaciones disponibles antes de proponer
un PR de `developer` hacia `main`.

## Pendientes de producto

Falta el reglamento general aprobado para reglas de votación (incluidos
desempates, impugnaciones y votos tardíos), además de decidir la política legal
de retención. No convertir reglas inferidas o implementaciones actuales en
decisiones aprobadas.
