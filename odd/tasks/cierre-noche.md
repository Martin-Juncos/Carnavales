# P5: Competitive night closure

Branch: `feat/integracion-edicion-jurados` · Baseline: `b3f36c5` · Delivery: `ask-on-risk`.
Runner: Node.js, disposable PostgreSQL, Vitest. Forecast: over 400 authored changed lines across status, closure, and operator UI.

## Specs

- S1. “El Escribano podrá cerrar la noche solo cuando el servidor haya recibido todas las planillas esperadas.” “Bloquear el cierre (Recomendado)” also covers a valid snapshot with zero expected ballots. Missing snapshots fail closed. The server reports closure readiness, not scores or counts.
- S2. “Si hubo un relevo, la planilla recibida del suplente cuenta para la misma obligación: no se espera otra del jurado saliente.” Resolve a documented handoff against the frozen obligation and trust only official receipts. “Solo suplencias registradas (Recomendado)” — no generic replacements after night opening; no automatic link for historical receipts.
- S3. “P5 no incluye cálculo de resultados ni cierre de la votación completa.” No missing-ballot exception. Preserve the frozen snapshot and audit a successful night closure.

## Tasks

- T1 · S1–S3 · inline · complete in `ca0dbc6`; functional and independent checks passed; native review approved and acknowledged · Risk: item 2 (role-restricted operational state).
- T2 · S1–S3 · inline · complete in `ca0dbc6`; independent integration and JSON confirmation checks passed; native review approved and acknowledged · Risk: items 1, 2, 4 (irreversible operation, permissions, receipt/closure race).
- T3 · S1–S3 · inline · complete in `ca0dbc6`; functional and independent checks passed; native review approved and acknowledged · Risk: item 2 (role-restricted list and confirmation).

## Log

- L1: “continua”
- L2: “Solo antes de abrir (Recomendado)” from the separate substitution feature remains unchanged; prior logbooks are outside this feature.
- L3: “Bloquear el cierre (Recomendado)” — confirms that a competitive night with an empty expected-ballot snapshot cannot close.
- L4: RED: the new readiness route returned 404 instead of 401. Added the Escribano-only read route and the reusable database predicate over frozen expectations and official receipts, including named substitutes. Focused API/migrations 27/27, full API 273/273 and `git diff --check` passed in socket-only disposable PostgreSQL. No closure, commit, or push.
- L5: Independent T1 checks passed (27/27 plus targeted authorization, privacy and recorded handoff probes); readiness did not write any state. A generic post-opening replacement can receive a new ballot but has no durable link to the frozen obligation, so readiness continues to block. Do not infer equivalence from night and specialty or retroactively bind historical receipts. Preserve the regression handoff at `/tmp/opencode/carnavales-p5.mUmco4/probes.inc` for incorporation before scratch cleanup.
- L6: “Solo suplencias registradas (Recomendado)” — confirmed blocking generic replacements after the night opens. Existing historical receipts are not remapped.
- L7: Closure RED: POST returned 404 instead of 409 when required ballots were pending. Added the Escribano-only transaction, PostgreSQL readiness and role checks, closure evidence, and atomic audit. The generic replacement concurrency regression now exercises a draft night (the previous open-night fixture intentionally rejects both replacements under S2). Added the targeted T1 role/edition regression assertions. Focused API 61/61, full API 273/273 and `git diff --check` passed in disposable PostgreSQL. No UI, commit, push, or production migration.
- L8: Independent T2 passed: last receipt versus closure honored either observed lock order, audit failure rolled back fully, and upgrade with historical generic replacement remained fail-closed. Landed the two lock-order regressions. P5 panel RED: no night selection. Added role-gated competitive-night list and panel with refresh, reasons, explicit confirmation, and no scores/counts. POST now requires explicit JSON confirmation; generic replacement UI is hidden on opened nights. Final focused API 63/63, full API 275/275, client 74/74, production build and `git diff --check` passed. Independent confirmation/list delta check pending.
- L9: Independent T3 delta passed with no blocker; added regressions for invalid confirmation payloads, modal cancellation, and failed-request recovery. Latest checks: focused closure API 4/4, full API 275/275, client 76/76, production build and `git diff --check` passed. Removed disposable scratch.
- L10: P5 local work-unit commit `ca0dbc6` combines database, API and panel enforcement with its tests. Native assessment high (`high_risk`); candidate consent granted. Bound `review-463621146034812d` awaits four grouped foreground reviewers, which this runtime cannot launch. No receipt, push, or production migration.
- L11: Verified the approved four-result closure and matching acknowledgement (`authority: burned`) for `review-463621146034812d`, scoped to `b3f36c5..ca0dbc6`. Migration 0007 defines `cerrada_en` and requires it for a `CLOSED` row, so the shared null-timestamp advisory does not apply to valid database state. The assignments API always projects `noche` through an inner join; resilience against malformed client payloads is optional follow-up. The missing-receipt block is an approved rule (no exception or historical remapping). No source changes, separate logbook review, or delivery.
