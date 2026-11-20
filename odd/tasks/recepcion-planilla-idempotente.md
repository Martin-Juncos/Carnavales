# P4: idempotent receipt of juror ballots

Branch: `feat/integracion-edicion-jurados` · Delivery: `ask-on-risk` · Runner: Node.js/Vitest with disposable PostgreSQL. Baseline: `11fc90b`.

## Specs

- S1. “una sola planilla inmutable por asignación”, with “sus puntajes y la auditoría en la misma transacción”. Apply the existing authenticated juror, frozen context, score completeness and secrecy rules.
- S2. “reenviar el mismo `operationId` con el mismo contenido devuelve el acuse original; si cambia el contenido, la API responde `409` sin sobrescribir nada.”
- S3. “El jurado solo verá **Recibida** cuando llegue ese acuse, y la respuesta no incluirá puntajes.” Keep the already-approved D9 retry policy and the pending/received distinction.
- S4. “Prepararía la migración versionada y la probaría únicamente en PostgreSQL descartable. No tocaría los cierres ni publicaría cambios.”
- S5. “conserve esos casos sin recibirlos automáticamente”: preserve historical reads and previously confirmed local ballots without reconstructing frozen rows or assigning a version retroactively.

## Tasks

- T1 · S1–S2, S4–S5 · inline · functional and independent human verification passed; native review not yet assessed · Risk: items 1, 2, 4 (immutable persisted vote, access control, concurrent receipt and assignment changes).
- T2 · S3, S5 · inline once T1 contract was runnable · functional and independent browser verification passed; native review not yet assessed · Risk: item 4 (retries and durable receipt transitions).

## Log

- L1: “continua”
- L2: “si lo apruebo” — approves the P4 design and versioned migration for local disposable testing only. The three existing uncommitted logbooks are out of scope.
- L3: Baseline `node --test test/jurado.test.js test/migrations.test.js` passed 11/11 with disposable PostgreSQL; the test cluster was removed.
- L4: Read-only mapping identified two records whose provenance cannot be verified by the proposed contract: historical nights without frozen rows and existing local P3 confirmations without a stored version. Existing documentation preserves historical reads but defines no official reception policy for either case. Recommended preserving both without automatic submission or reconstruction; user decision pending before fixing the receipt schema and upgrade behavior.
- L5: “si” — preserve historical reads and unversioned local confirmations without automatically receiving them or assigning today's version. Recovery is outside P4.
- L6: The new HTTP and migration tests failed on the baseline. On the candidate, 35 focused and 260 full API tests passed against disposable PostgreSQL. Independent storage and concurrency verification pending.
- L7: Client receipt tests observed RED before implementing versioned confirmations, same-UUID retries, durable acuse, conflict stop, and preservation of historical reads. All 10 focused and 65 total client tests passed; production build passed. Independent browser verification pending.
- L8: Independent API verification returned `cyber_policy` without a verdict. No independent API pass or commit is claimed. The separate browser verification remains pending.
- L9: Independent Firefox with real Express/PostgreSQL verified idempotent receipt after a dropped response and historical preservation. It found two client blockers: refreshing an unchanged IndexedDB record could abort delivery, and an editable legacy draft could not be resumed. Both regression tests failed and then passed after stabilizing pending state and adding explicit draft review and linking. Confirmed unversioned records remain untouched. All 12 focused and 67 total client tests and build passed. Targeted Firefox recheck pending.
- L10: Firefox 160 rechecked both blockers against real Express and disposable PostgreSQL. Three visibility reads kept one in-flight POST; the persisted receipt survived reload. The legacy editable draft retained its saved score and only gained a version after explicit review; the confirmed legacy record stayed unchanged. Both browser probes exited 0; the parent reran the 12 focused tests and removed the disposable state. T1's independent database-guard verdict remains unavailable.
- L11: Independent human review of the matching handoff patch on `11fc90b` verified database immutability, both arrival orders for receipt vs. revocation (12/12), and additional probes (25/25). It exercised receipt winning against juror replacement. S5 is supported by the separate Firefox verification.
- L12: Follow-up independent logs confirmed rollback after an injected acceptance-audit failure and successful replay with the same UUID, plus replacement winning before receipt without persisting votes. Both isolated scenarios passed (2/2), and the reference and follow-up suite passed (16/16). No production migration or remote delivery.
