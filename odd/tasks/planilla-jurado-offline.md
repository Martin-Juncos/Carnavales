# P3: juror ballot on notebooks and tablets

Branch: `feat/integracion-edicion-jurados` · Delivery: `ask-on-risk` · Runner: Vitest, Node.js, Firefox. Forecast: ~400 authored lines.

## Specs

- S1. P3: “PWA: completar, validar completitud, confirmar localmente y persistir el estado.” Use the existing P2 read API; use `1`–`5` and the separate `No se presentó` (`0`). Informational rows are not scored. Require all applicable scores.
- S2. “la planilla sigue guardada, pero hace falta conexión para verificar la sesión y volver a mostrarla.” Allow notebook/tablet users to score and confirm while the opened ballot is disconnected. Scope storage to the signed-in juror and assignment. Reopen only after online validation.
- S3. “Pendiente de recepción”. Confirmation saves, locks and hides scores on the UI; retain one stable `operationId`. No receipt, sync, closing, migration, or publishing in P3.

## Tasks

- T1 · S1–S3 · inline (one connected behavior, no independent writer scopes) · functional and independent verification passed; native assessment pending · Risk: items 2 and 4 (private local ballot and atomic confirmation across tabs).

## Log

- L1: “retoma P3”
- L2: “ahora entiendo, igual esto se usara notebook a tablets”
- L3: “avancemos” after the proposed online revalidation boundary; baseline `3776fc9`. Preserve the two earlier unstaged logbooks.
- L4: Focused UI tests failed before the panel existed. A stale-tab confirmation test also failed before adding a comparison in the IndexedDB transaction. All three focused tests, the client suite, and the production build passed. Independent browser and PostgreSQL verification pending.
- L5: Independent Firefox with actual P2 routes and disposable PostgreSQL verified offline scoring and confirmation, scoping, offline restart behavior, and competing tabs. It found that a valid nonempty informational-only ballot could not be confirmed. The regression failed, then passed after distinguishing zero required scores from zero rows. Five focused tests, all 60 client tests, and the build passed. Targeted browser recheck pending.
- L6: Targeted Firefox recheck passed 9/9 against real P2 with disposable PostgreSQL and injected session identity. The informational-only ballot was locked with one stable UUID and no scores or requests. Server data remained unchanged. An HTTP client differential check also matched all 26 existing operations against `3776fc9`.
