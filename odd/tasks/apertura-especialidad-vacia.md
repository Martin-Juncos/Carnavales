# Empty specialty selections at opening

Branch: `feat/integracion-edicion-jurados` · Delivery: `ask-on-risk` · Tests: Node.js and disposable PostgreSQL.

## Specs

- S1. “si, mientras esa especialidad vacia no este asignado a un jurado, en caso contrario si no deberia de poder abrir”: a deliberately empty selection is valid only without an active juror assignment; an accidentally emptied selection is not a deliberate choice.

## Tasks

- T1 · S1 · inline · commit `3776fc9`; functional and independent verification passed; native review blocked · Risk: items 1, 3, 4 (persisted intent, opening contract, assignment serialization).

## Log

- L1: “si, mientras esa especialidad vacia no este asignado a un jurado, en caso contrario si no deberia de poder abrir”
- L2: Baseline `31f8250`. RED: three scenarios failed. GREEN: 36 focused tests and all 256 API tests passed against disposable PostgreSQL. Migration `0016` leaves existing empty drafts unconfirmed; no non-test database was modified.
- L3: Independent verification found a juror-only replacement could create a new assignment on a legacy empty selection. Added a failing regression, checked the effective specialty for all replacements, and observed 257 API tests pass. Targeted independent recheck pending.
- L4: Independent recheck passed 3/3 against the candidate; baseline failed only the expected regression. The rejected HTTP replacement left persisted rows unchanged.
- L5: Local work-unit commit `3776fc9`; native assessment `high` (`review_due=true`, `high_risk`). Separate candidate consent requested; no remote delivery.
- L6: Consent granted. Bound lineage `review-b1a57159d8a1e181` awaits four reviewer results. Grouped foreground reviewer transport is unavailable in this session. No receipt was issued.
