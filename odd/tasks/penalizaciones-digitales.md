# P6B: Digital penalties (D14)

Branch: `feat/integracion-edicion-jurados` · Baseline: `37ba502` · Delivery: `ask-on-risk`.
Runner: Node.js (`node --test`), disposable PostgreSQL, Vitest. Forecast: ~900 authored changed lines across migration `0027`, API, client UI, tests, and docs.

## Specs

- S1. “D14 — Solo Escribano registra y anula penalizaciones (con tipo, noche, comparsa, minutos si aplica, motivo y referencia de acta); se habilitan hasta el cierre total y quedan congeladas al cerrar la votación completa.” “si apruebo” (approved `docs/voting/penalizaciones-diseno.md`).
- S2. PostgreSQL migration `0027-penalizaciones.sql` creates append-only table `penalizacion` with the 4 `D14` types (`RETRASO_INGRESO` 0.50/min capped at 30 min = 15.00 pts + `cedio_turno = minutos > 30`, `RETRASO_SALIDA` 0.50/min, `EXCESO_SHOW_BATERIA` 0.50/min with required `rubro_version_id`, `MINIMO_INTEGRANTES` `impide_premios_comparsa = true` with 0.00 pts), `operation_id` UNIQUE, `ESCRIBANO`-only insert/void, `OPEN` edition + `COMPETENCIA` (`OPEN`/`CLOSED`) night + `SCHEDULED` comparsa validation, freeze on `CLOSED`/`retirada`, atomic audit (`penalizacion_registrada`, `penalizacion_anulada`), and `eliminar_edicion_completa` (`0025`) compatibility.
- S3. API under `/api/escribano/ediciones/:edicionId/penalizaciones`: `GET /contexto`, `GET /`, `POST /` (explicit `{ confirmar: true }`, idempotent by `operationId`, `409 operacion_conflictiva` on mismatch), `POST /:penalizacionId/anular` (explicit `{ confirmar: true }`, reason + act ref, idempotent on identical repeat, `409 penalizacion_ya_anulada` on mismatch). `ESCRIBANO` RBAC, `Cache-Control: no-store`, zero juror scores (`D15`), `noche FOR SHARE -> edicion FOR SHARE` lock order (no deadlocks vs total closure).
- S4. Client `PanelEscribano` adds **Penalizaciones** section: edition selection, active/voided list, registration form with live discount preview and explicit confirmation modal (stable `operationId` per attempt), void modal requiring reason + act ref, and read-only frozen notice when `edicion.estado === "CLOSED"`.
- S5. Sync docs (`docs/voting/penalizaciones-api.md`, `docs/voting/penalizaciones-diseno.md`, `docs/README.md`) and verify with full disposable-PG suite, Vitest suite, and independent high-risk verifier.

## Tasks

- T1 · S1–S2 · inline · complete (RED observed: `relation "penalizacion" does not exist`; GREEN: 10/10 DB/migration/purge/cierre-total tests passed in TCP disposable PG) · Risk: items 1, 2, 4.
- T2 · S1, S3 · inline · complete (RED observed: 404 on `/penalizaciones/contexto` and `POST /penalizaciones`; GREEN: 14/14 focused API/concurrency/error tests passed in TCP disposable PG) · Risk: items 2, 3, 4.
- T3 · S4–S5 · inline · complete (RED observed: 3/3 new tests failed; implemented `PenalizacionesEscribano.jsx`, `cliente-api.js`, `PanelEscribano.jsx`, and synced docs) · Risk: item 2.
- T4 · S1–S5 · delegated verifier · complete (independent read-only verifier caught 2 HIGH + 3 MEDIUM + 2 LOW items: missing `BEFORE TRUNCATE` trigger, `400` vs `404` on `noche_inexistente`, uppercase `:edicionId` replay mismatch, `minutos <= 9999` DB/client alignment, duplicate `role="alert"` in modal, `Cache-Control: no-store` before `await`, doc drift; all fixed and regression-tested; final full suite: API 320/320, client 65/65 Vitest + 40/40 Node, `git diff --check` clean) · Risk: items 1, 2, 3, 4.

## Log

- L1: “si apruebo” (user approved `docs/voting/penalizaciones-diseno.md` on 2026-11-24).
- L2: T1 RED observed (`relation "penalizacion" does not exist`). Implemented `api/migrations/0027-penalizaciones.sql` with canonical `noche FOR SHARE -> edicion FOR SHARE` lock order inside `penalizacion_validar_cambio` and full `eliminar_edicion_completa` compatibility. GREEN: 10/10 passed in TCP disposable PG.
- L3: T2 RED observed (404 on penalizaciones routes). Implemented `api/src/penalizaciones.js`, routes in `api/src/escribano.js`, `penalizacionId` in `identificadores.js`, and error mapping in `manejo-errores.js`. GREEN: 14/14 passed (`penalizaciones`, `cierre-total`, `manejo-errores`) in TCP disposable PG.
- L4: T3 RED observed (3/3 failing in `PenalizacionesEscribano.test.jsx`). Implemented `PenalizacionesEscribano.jsx`, `cliente-api.js`, `PanelEscribano.jsx`, and synced docs (`penalizaciones-api.md`, `penalizaciones-diseno.md`, `docs/README.md`). Full suite passed (API 320/320, client 64/64 + 40/40).
- L5: Independent verifier (`aa9f191e-767b-4ae4-b946-6b57e8a537bb`) reported 2 HIGH (`BEFORE TRUNCATE`, `404 noche_inexistente`), 3 MEDIUM (uppercase `:edicionId` replay, `minutos <= 9999` alignment, modal duplicate `role="alert"`), and 2 LOW (`Cache-Control: no-store` before `await`, design doc drift). Applied all fixes and added regressions in `penalizaciones.test.js` and `PenalizacionesEscribano.test.jsx`. Final verification passed: API 320/320 (0 fail, 0 skip) on TCP disposable PG, client 65/65 Vitest + 40/40 Node, `git diff --check` clean; disposable PG stopped and removed. Left uncommitted pending user commit preference.
