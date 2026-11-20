# Empty specialty selections at opening

Branch: `feat/integracion-edicion-jurados` · Delivery: `ask-on-risk` · Tests: Node.js and disposable PostgreSQL.

## Specs

- S1. “si, mientras esa especialidad vacia no este asignado a un jurado, en caso contrario si no deberia de poder abrir”: a deliberately empty selection is valid only without an active juror assignment; an accidentally emptied selection is not a deliberate choice.

## Tasks

- T1 · S1 · inline · functional and independent verification passed; native assessment pending · Risk: items 1, 3, 4 (persisted intent, opening contract, assignment serialization).

## Log

- L1: “si, mientras esa especialidad vacia no este asignado a un jurado, en caso contrario si no deberia de poder abrir”
- L2: Baseline `31f8250`. RED: three scenarios failed. GREEN: 36 focused tests and all 256 API tests passed against disposable PostgreSQL. Migration `0016` leaves existing empty drafts unconfirmed; no non-test database was modified.
- L3: Independent verification found a juror-only replacement could create a new assignment on a legacy empty selection. Added a failing regression, checked the effective specialty for all replacements, and observed 257 API tests pass. Targeted independent recheck pending.
- L4: Independent recheck passed 3/3 against the candidate; baseline failed only the expected regression. The rejected HTTP replacement left persisted rows unchanged.
