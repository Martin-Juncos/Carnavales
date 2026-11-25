# 04: API administrativa del padrón

**What to build:** Rutas para administrar comparsas, participantes, sujetos evaluables y el orden de presentación por noche, respetando la congelación del padrón.

**Blocked by:** `03-migracion-padron.md` (implementado).

**Status:** implementado, sin pasadas.

- [x] CRUD de comparsas con categoría, activa y borrado bloqueado con historial.
- [x] CRUD de participantes (alta y modificación; el borrado queda fuera hasta definir su necesidad).
- [x] Sujetos evaluables: validación de tipo y de participante (`PERSONA` ↔ `participanteId`).
- [x] Guardado de orden de presentación por noche (`PUT`, transaccional, solo en `DRAFT`). La confirmación explícita en modal es responsabilidad del cliente y queda para su issue.
- [x] Rechazo de escrituras con el padrón congelado (`padron_congelado`, `noche_no_editable`, `comparsa_inactiva`, `comparsa_con_padron`).
- [x] Auditoría de cada operación sensible en la misma transacción.
- [x] Pruebas de comportamiento con PostgreSQL real (`api/test/modules/padron/padron-api.test.js`).

**Pendiente dentro de esta issue:** API de pasadas (apariciones repetidas). El esquema existe en `0008`; su forma de puntuación sigue en D6.

**Documentación:** `docs/voting/configuracion-api.md`, sección «Padrón».
