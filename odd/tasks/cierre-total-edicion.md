# P6A: Total voting closure of an edition

Branch: `feat/integracion-edicion-jurados` · Baseline: `52afd21` · Delivery: `ask-on-risk`.
Runner: Node.js (`node --test`), disposable PostgreSQL, Vitest. Forecast: ~550 authored changed lines across migration `0026`, API, client UI, tests, and docs.

## Specs

- S1. “D10 — Todas las noches COMPETENCIA con cuenta_para_puntaje = true en CLOSED (al menos una) y ninguna noche COMPETENCIA en OPEN; las PREMIACION no bloquean.” “No hay cierre por comparsa separado (el cierre sigue siendo: planilla del Jurado → noche → votación completa) y el cierre total es irreversible (impide abrir nuevas noches o recibir votos).”
- S2. PostgreSQL enforces `edicion.estado IN ('CONFIGURING', 'OPEN', 'CLOSED')`, `cerrada_por`, `cerrada_en`, `motivo_bloqueo_cierre_total`, `ESCRIBANO`-only transition `OPEN -> CLOSED`, atomic `votacion_cerrada` audit with `edicion_id`, operational freeze via `exigir_edicion_operativa` (`EDICION_CERRADA`), blocked retirement on `CLOSED`, and full compatibility with `eliminar_edicion_completa` (`0025`).
- S3. API `/api/escribano/ediciones`, `/api/escribano/ediciones/:edicionId/cierre` (`GET` readiness, `POST` idempotent closure requiring `{ confirmar: true }`), `ESCRIBANO`-only RBAC, `Cache-Control: no-store`, zero numeric scores or counts (`D15`), `noche ORDER BY id -> edicion` lock ordering without deadlocks, and `EDICION_CERRADA` (`409`) handling across operational routes while preserving idempotent historic ballot receipts.
- S4. Client `PanelEscribano` renders **Cierre total de la votación** with blocker reasons, refresh, disabled button when blocked, explicit irreversible confirmation modal, and closed state; admin `PanelEdiciones` and `ConfiguracionEdicion` display `CLOSED` as «Votación cerrada» while keeping full-edition deletion available.
- S5. Sync docs (`docs/voting/cierre-total-api.md`, `docs/README.md`, `docs/voting/cierre-total-diseno.md`) after implementation and verify with disposable PostgreSQL, Vitest, and independent high-risk verification.

## Tasks

- T1 · S1–S2 · inline · complete (RED observed: `motivo_bloqueo_cierre_total` missing; GREEN: 6/6 DB + migration + purge tests passed in disposable PG) · Risk: items 1, 2, 4.
- T2 · S1, S3 · inline · complete (RED observed: 404 on `/api/escribano/ediciones` and `/cierre`; GREEN: 35/35 focused API/concurrency/error tests passed in disposable PG) · Risk: items 2, 3, 4.
- T3 · S4–S5 · inline · complete (RED observed: 4 new client tests failed; GREEN: 61/61 Vitest + 40/40 Node client tests passed; docs synced) · Risk: item 2.
- T4 · S1–S5 · delegated verifier · complete (independent read-only verifier returned PASS on S1–S5; applied 3 hardening fixes: `FOR SHARE` on `noche` to avoid `40P01` with padrón/especialidad writes, `setError("")` on `PanelEscribano` refresh, `edicion.estado !== "CLOSED"` in `PlanillasNoche`; final full suite: API 317/317, client 61/61 Vitest + 40/40 Node, `git diff --check` clean) · Risk: items 1, 2, 3, 4.

## Log

- L1: “Si lo apruebo” (user approved `docs/voting/cierre-total-diseno.md` after approving P6 functional decisions on 2026-11-24).
- L2: T1 RED observed (`function motivo_bloqueo_cierre_total does not exist`). Implemented `api/migrations/0026-cierre-total-edicion.sql` and updated `api/test/migrations/migrations.test.js` + `api/test/modules/escribano/cierre-total.test.js`. GREEN: 6/6 passed (`cierre-total`, `migrations`, `verify-0006`, `eliminacion-edicion-riesgos`) in socket-only disposable PG.
- L3: T2 RED observed (404 on `/api/escribano/ediciones` and `/cierre`). Implemented total-closure routes in `api/src/escribano.js`, `EDICION_CERRADA` mapping in `api/src/manejo-errores.js`, `cerradaEn` in `api/src/ediciones.js`, and `CLOSED` guards in `apertura-edicion.js`, `apertura-noche.js`, `admin-apertura.js`, `recepcion-planillas.js` (preserving historic idempotent receipts), and `planillas-jurado.js`. GREEN: 35/35 focused tests passed in disposable PG.
- L4: T3 RED observed (4 new tests in `PanelEscribano.test.jsx` and `ConfiguracionEdicion.test.jsx`). Implemented client total-closure methods/UI, admin `CLOSED` read-only state, and synced `docs/voting/cierre-total-api.md`, `docs/README.md`, and `docs/voting/cierre-total-diseno.md`. GREEN: client 61/61 Vitest + 40/40 Node passed; full API 314/316 passed in socket-only PG (2 failures in `arranque-correo.test.js` due to socket-only URL without host). Launching TCP disposable PG check + independent verifier.
- L5: Independent verifier (`45e542d6-7fcd-4137-8c3e-fc2a6aec239c`) returned PASS across S1–S5 with 3 hardening recommendations. Applied all 3 (`FOR SHARE` on `noche` in `escribano.js` + `Cache-Control: no-store` on 400, trigger check ordering in `0026`, `setError("")` in `PanelEscribano.jsx`, `edicion.estado !== "CLOSED"` in `PlanillasNoche.jsx`, `docs/README.md` wording) plus concurrent retirement/deletion tests in `cierre-total.test.js`. Final verification passed: API 317/317 (0 fail, 0 skip) on TCP disposable PG, client 61/61 Vitest + 40/40 Node, `git diff --check` clean; disposable PG stopped and removed. Left uncommitted pending user branch/commit decision.
