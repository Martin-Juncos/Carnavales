# Planillas por noche

Branch: `feat/integracion-edicion-jurados` · Delivery: `ask-on-risk` · Tests: Node.js with disposable PostgreSQL.
Forecast: approximately 400 authored changed lines.

## Specs

- S1. “debe poder hacer amabas cosas, pero mejor configurar las filas especifcas para cada noche”: offer an initial selection based on the parade order and allow an explicit selection per night and specialty.
- S2. “Bloquear apertura (Recommended)”: a required specialty without a saved selection blocks opening; never silently use the generated list.
- S3. “si apruebo”: implement the migration and API described in `docs/voting/planilla-voto-diseno-propuesto.md`; freeze the saved rows when opening and preserve legacy reads for already-open nights.

## Tasks

- T1 · S1–S3 · inline (one dependent behavior, no independent write units) · functional verification passed; native assessment pending · Risk: items 1, 2, 3, 4 (schema, authorization, opening contract and transaction).

## Log

- L1: “si apruebo”
- L2: Baseline `36457a3`. RED: the existing opening did not reject an unsaved list, and the new admin URL returned 404. GREEN: 18 focused tests and all 251 API tests passed against disposable PostgreSQL. Independent verification was launched; no migration was run against a non-test database.
- L3: Independent verification found two draft deletion regressions and a post-opening assignment replacement with no frozen selection. Three new regressions failed before correction; after correction 49 focused tests passed. Requested a targeted recheck for those blockers only.
- L4: After correction, all 254 API tests passed on disposable PostgreSQL. Independent targeted recheck cleared all three blockers (5/5 candidate probes and 4/4 baseline probes). No non-test migration was applied.
