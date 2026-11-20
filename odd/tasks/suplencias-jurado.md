# Juror substitutions before P5

Branch: `feat/integracion-edicion-jurados` · Baseline: `d025904` · Delivery: `ask-on-risk`.
Runner: Node.js and disposable PostgreSQL for API; Vitest for the PWA. Forecast: over 400 authored changed lines across the units, pending the implementation map.

## Specs

- S1. “se asigna 1 titular y 2 suplentes. solo el titular puede votar y tener acceso a la planilla.” An inactive substitute has no access to this ballot. Administration can activate one named substitute before the ballot has been opened for voting. “Solo antes de abrir (Recomendado)” applies to roster configuration: configure it only while the night is in draft, without automatically converting already-open nights.
- S2. “si pasa algo antes de la noche de votacion o durante la noche de votacion, se podria reemplazar con sus suplentes, pero si ya comenzo a votar o tiene votos cargados, que continue con la votacion desde donde quedo.” Once opened for voting, only one device can edit. That device must reconnect, freeze editing, and receive confirmation that the draft is stored on the server before Administration activates the substitute. Retain authorship per score; the substitute can add only missing scores. Audit the handoff.
- S3. “bloquear el traspaso es lo que mas me cierra”. Do not hand over an incomplete or unverified draft if the editing device cannot reconnect. A locally confirmed ballot pending receipt or an officially received ballot cannot be handed over for editing.
- S4. “como etapa previa a P5” — This feature does not implement night closure, final voting closure, or result calculation.

## Tasks

- T1 · S1, S4 · inline · roster, activation and first editable-device claim implemented, including the admin panel; focused independent recheck and integrated suites passed; delivery pending · Risk: items 2, 4 (ballot access and concurrent night opening, activation and editing).
- T2 · S2–S4 · inline planned · pending T1; single editing device, durable freeze and draft persistence, audited activation · Risk: items 2, 4 (ownership and competing writes).
- T3 · S2–S4 · inline planned · pending T2; continue the ballot with locked inherited scores and preserve existing receipt guarantees · Risk: items 1, 2, 4 (official ballot integrity, score access, and concurrent receipt).

## Log

- L1: “Se podria hacer asi mira, se asigna 1 titular y 2 suplentes. solo el titular puede votar y tener acceso a la planilla. y si pasa algo antes de la noche de votacion o durante la noche de votacion, se podria reemplazar con sus suplentes, pero si ya comenzo a votar o tiene votos cargados, que continue con la votacion desde donde quedo.”
- L2: “si exacto” — confirms that the substitute keeps the unconfirmed draft scores and fills only missing scores.
- L3: “bloquear el traspaso es lo que mas me cierra”
- L4: “si” — approves the single-editing-device, freeze-and-sync workflow as a stage before P5. The existing four uncommitted logbooks are outside this feature.
- L5: The read-only map confirmed that the opening snapshot is immutable and keyed by assignment ID; a successor must inherit the same expected-ballot obligation without rewriting the snapshot. First editable open must be recorded before offline editing starts. Existing administrative replacement and revocation paths must not bypass that record. The final receipt must enforce inherited scores server-side; the current API contract (D15) does not expose numeric scores before total closure.
- L6: “Solo antes de abrir (Recomendado)” — already-open nights are not converted automatically because the server cannot establish whether they hold unsynchronized local ballots.
- L7: T1 acceptance boundary: roster setup requires a `DRAFT` night; only the active roster member can access the ballot; direct activation and the first editable claim are mutually exclusive; an existing editable claim blocks direct activation. Generic assignment changes must not bypass these checks. A named substitute is not a second expected ballot.
- L8: A focused HTTP test was RED (unregistered route returned 404 instead of 403). Added administrator-only roster registration, migration 0018, an audit record, and public contract documentation. Focused API/migrations passed 15/15; full API passed 261/261 on an isolated Unix-socket PostgreSQL instance with TCP disabled. No activation, device claim, closure change, commit, or push.
- L9: Independent verification found no reproduced roster blocker; its baseline probe failed as expected and passed on the candidate. Added that probe to the repository and reran focused API and migrations (16/16); removed the disposable scratch. T1 remains partial until activation and first editable-device claim can ship together.
- L10: API RED: generic revocation returned 200 instead of 409. Client RED: the roster ballot could not be opened for editing. Added audited named activation with a stable expected-ballot link, disabled generic mutation for registered assignments, and serialized first device claim with activation and receipt. The claim UUID persists in IndexedDB before editing and accompanies receipt. API focused 16/16, API suite 262/262, client focused 13/13, client suite 68/68, production build and `git diff --check` passed. Draft transfer and P5 are not implemented.
- L11: Independent verification found that draft activation followed by open-night activation lost the link to the immutable expected ballot. Reproduced the missing link (zero matches), added the independent regression and race test, and pinned the exact frozen detail on the first open-night activation. Its validated reference is immutable and does not alter existing snapshot guards. API focused 18/18, full API 264/264, and `git diff --check` passed. Targeted independent recheck pending.
- L12: Independent targeted recheck passed 1/1 and confirmed the original blocker resolved. Added admin registration and activation with confirmation dialogs and a blocked state after editable open. The new user-interface test was RED before implementation. Final suites after the panel change: API 264/264, client 69/69, production build and `git diff --check` passed. The API test confirms the admin list does not disclose the device ID.
