# Memoria operativa

Contexto breve para futuras sesiones; no sustituye la documentación ni contiene
credenciales, URLs privadas, OTP, datos personales o volcados.

## Estado del repositorio

- Las ramas permanentes son `main` y `developer` de `Martin-Juncos/Carnavales`.
- API: Node.js/Express, Better Auth 1.7.22 y PostgreSQL; migraciones SQL en
  `api/migrations/`.
- Cliente: React/Vite. Autenticación, OTP, invitaciones, recuperación y
  administración están implementados.
- Votación implementada hasta P6C (migraciones `0001`–`0032`): recepción idempotente, suplencias, cierre de noche (P5), cierre total irreversible (P6A), penalizaciones digitales (P6B), cálculo versionado, resolución manual de empates y publicación de resultados (P6C), además de logo opcional por comparsa. Consultar `docs/README.md` y los contratos vigentes. Las actas oficiales PDF/CSV con SHA-256 (P6D) siguen pendientes.
- Administración incluye hub de ediciones (con retiro y eliminación completa protegidos por modal), asistente de preparación en 4 etapas, planillas por noche y consulta de resultados post-cierre. Las aperturas y la eliminación completa usan la conexión principal `DATABASE_URL` (sin cuentas dedicadas).

## Comandos y seguridad

- API: `npm test` en `api/`; integración PostgreSQL solo con `TEST_DATABASE_URL`
  apuntando a una base descartable.
- Cliente: `npm test` en `client/`. No ejecutar builds locales salvo que la tarea
  lo requiera explícitamente.
- `api/.env` es local e ignorado. No copiar secretos a ejemplos, documentación,
  commits ni logs.
- `api/scripts/spikes/auth/session-race.mjs` escribe en la base indicada por `DATABASE_URL`; usar
  exclusivamente una base desechable.

## Flujo Git

`main` y `developer` son las ramas permanentes del repositorio destino. El trabajo
se prepara en una rama desde `developer`, se revisa y luego se propone mediante
PR hacia `developer`; no publicar ni integrar sin aprobación del usuario.
Después de integrar, ejecutar las verificaciones disponibles antes de proponer
un PR de `developer` hacia `main`.

## Pendientes de producto

- **Actas oficiales (P6D):** generación y verificación de PDF/CSV con hash SHA-256 tras el cierre total.
- **Reglamento definitivo 2027:** confirmar el texto oficial y el calendario/cantidad exacta de noches (`D1`, `D13`); hoy rige el motor v1 basado en el reglamento aportado (titulado 2026) y las decisiones confirmadas del 2026-11-24.
- **Otros pendientes acotados:** formatos de importación asistida (`D8`) y un eventual flujo digital de impugnaciones (`D17`, diferido post-v1).
- No convertir reglas inferidas o implementaciones actuales en decisiones reglamentarias aprobadas.

## Convenciones de estructura

Las convenciones vigentes estan en api/README.md y client/README.md. API modular por dominio, pruebas reflejadas en test/ y spikes aislados en scripts/spikes/auth/. Cliente por features con componentes PascalCase, hooks/utilidades kebab-case y runners Vitest/node:test separados. El motor puro de resultados no accede a infraestructura. Se mantienen las decisiones anteriores sobre UUID y estados HTTP.
