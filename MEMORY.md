# Memoria operativa

Contexto breve para futuras sesiones; no sustituye la documentación ni contiene
credenciales, URLs privadas, OTP, datos personales o volcados.

## Estado del repositorio

- Las ramas permanentes son `main` y `developer` de `Martin-Juncos/Carnavales`.
- API: Node.js/Express, Better Auth 1.7.22 y PostgreSQL; migraciones SQL en
  `api/migrations/`.
- Cliente: React/Vite. Autenticación, OTP, invitaciones, recuperación y
  administración están implementados.
- Votación implementada hasta P6C: recepción idempotente, suplencias, cierres, penalizaciones y resultados versionados con publicación. Consultar `docs/README.md` y los contratos vigentes. Las actas oficiales P6D siguen pendientes.
- Administración incluye configuración de ediciones, planillas por noche y
  eliminación completa de ediciones (requiere `DATABASE_URL_ELIMINAR_EDICION` en
  el entorno). El retiro de ediciones existe solo en la API, sin botón en el panel.

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

El cierre de la votación completa requiere definir sus condiciones. El cálculo y
la publicación de resultados se tratan por separado. No hay una excepción
aprobada para cerrar una noche sin un acuse esperado.

Falta el reglamento general aprobado para reglas de votación (incluidos
desempates, impugnaciones y votos tardíos), además de decidir la política legal
de retención. No convertir reglas inferidas o implementaciones actuales en
decisiones aprobadas.

## Convenciones de estructura

Las convenciones vigentes estan en api/README.md y client/README.md. API modular por dominio, pruebas reflejadas en test/ y spikes aislados en scripts/spikes/auth/. Cliente por features con componentes PascalCase, hooks/utilidades kebab-case y runners Vitest/node:test separados. El motor puro de resultados no accede a infraestructura. Se mantienen las decisiones anteriores sobre UUID y estados HTTP.
