# 01: Modelo y migración de asignaciones de jurado

**What to build:** Persistir la relación Jurado — noche competitiva — especialidad, con sus prerrequisitos mínimos (`noche`, `especialidad`) y registro append-only de los cambios sensibles, mediante una migración versionada.

**Blocked by:** Resuelto; ver `## Comentarios` y `docs/voting/asignaciones-jurado-diseno.md`.

**Status:** implementado.

- [x] Diseño físico mínimo aprobado y documentado en `docs/voting/asignaciones-jurado-diseno.md`: `noche`, `especialidad`, `asignacion_jurado` y `auditoria`.
- [x] Migración `api/migrations/0007-asignaciones-jurado.sql`, con nombres `snake_case` en español, PK `uuid`, `edicion_id` en las tablas de dominio, FK `ON DELETE RESTRICT` y FK compuestas para no cruzar ediciones. No existe ninguna FK con `ON DELETE CASCADE`; las tablas de votos, planillas y cierres aún no existen, así que no hay cascade que las afecte.
- [x] Revisado `database-design.md:374-383`: `asignacion_jurado.jurado_id` y `creada_por` usan `RESTRICT`, de modo que la eliminación de usuarios no deja asignaciones sin trazabilidad.
- [x] Tabla `auditoria` append-only (actor de la sesión, hora del servidor, operación y entidad afectada) sin credenciales, tokens ni OTP.
- [x] Verificación con `api/test/migrations.test.js` (orden, idempotencia) y `api/test/asignaciones-migracion.test.js` (inmutabilidad, revocación, no borrado físico ni `TRUNCATE`, append-only) usando `TEST_DATABASE_URL` sobre una base descartable.

**Pendiente para otros tickets:** los triggers de apertura/cierre de noche y el resto del padrón pertenecen a `configurar-edicion`; la restricción "planilla confirmada bloquea cambios" pertenece a `votacion-offline`.

## Comentarios

- 2026-11-19: el usuario eligió descomponer esta funcionalidad y aprobó explícitamente la opción «Sí, autorizo migración 0007» (tablas mínimas `noche`, `especialidad`, `asignacion_jurado` y `auditoria`). También acordó los seams de prueba: API HTTP con PostgreSQL descartable y cliente con API inyectada; el flujo real con Better Auth y la validación de voto se dejan para los tickets finales.
- 2026-11-19: revisión de código: se agregaron triggers `BEFORE TRUNCATE` porque los triggers de fila no cubren `TRUNCATE`; se retiró la columna `detalles jsonb` por no tener consumidor; se dejó constancia de que la regla de planilla confirmada no está implementada en este ticket.
