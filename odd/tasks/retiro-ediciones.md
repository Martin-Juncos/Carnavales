# Definitive edition retirement
Branch: `feat/integracion-edicion-jurados` · Delivery: `ask-on-risk` · Forecast: approximately 400 authored lines
Runner: `node --test` with disposable PostgreSQL · Baseline: `8538815`

## Specs

- S1. “Modifica los docs en donde dice que no se pueda borrar si esta en configuracion, que se pueda borrar dependiendo si esta en configuracion o abierta (la unica excepcion sera cuando este en votacion una jornada)” and “configura tambien la pai”: enforce the documented `CONFIGURING` and `OPEN` eligibility in the administration API, including published regulations. An in-progress competitive night blocks retirement.
- S2. “ok, probemos esa” approves “que el borrado sea definitivo para la operación, pero que la evidencia de las jornadas cerradas siga disponible para consulta”: no restore path; preserve original ballots, scores and audit; provide authorized read-only access. Preserve the existing warning and explicit confirmation in the interface if it exposes retirement.
- S3. No production migration, real data operation, push, or PR. Verify the lifecycle and racing operations on disposable PostgreSQL.

## Tasks

- [x] T1 · S1–S3 · inline implementation after read-only mapping of lifecycle locks and historical access · verified: 283 API tests, 9 independent probes, 3 parent spot checks · Risk: items 1, 2, 4

## Log

- L1. “ok, probemos esa”
- L2. The approval refers to the preceding proposal for permanent operational retirement with read-only evidence. Existing changes to the juror selector and other logbooks are outside the work unit.
- L3. RED: the confirmed-retirement API test failed with route `404` before implementation. GREEN: 61 focused database-backed tests passed. A full API suite is running against a disposable PostgreSQL instance; independent verification follows. Existing physical deletion stays restricted, and the UI remains unchanged because the requested implementation is API-only.
- L4. Initial API suite: 281 passed. Independent verification reproduced stale-snapshot retirement and a concurrent night creation regression. Restored the prior opening lock, added a parent row version update on competitive opening, and enforced retirement actor validation and audit in PostgreSQL. After correction, 63 focused tests passed; repeated API suite and scoped recheck are pending.
- L5. Corrected API suite: 283 passed, none failed or skipped. `git diff --check` passed. The independent scoped recheck is still pending.
- L6. Independent scoped recheck: 9 passed. Parent spot check: 3 passed. Both concurrency blockers cleared. The disposable tests confirmed the non-superuser opening role and verified that the retirement role needs to lock `usuario_rol` and insert audit records; production grants were not inspected.
