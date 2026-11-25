# 03: Migración del padrón (comparsas, participantes, sujetos, orden y pasadas)

**What to build:** Migración `0008` con las tablas del padrón que faltan: `comparsa`, `participante`, `sujeto_evaluable`, `orden_presentacion` y `pasada`, con sus restricciones de integridad y de congelación.

**Blocked by:** None.

**Status:** implementado.

- [x] `comparsa` con categoría `PRIMERA`/`AGRUPACION`, activa y nombre por edición.
- [x] `participante` con `nombre_completo`, `activo` y `es_menor` declarativo (A14).
- [x] `sujeto_evaluable` con los diez tipos confirmados (A6) y la coherencia `PERSONA` ↔ `participante_id`.
- [x] `orden_presentacion` por noche con orden único y FK compuestas por edición.
- [x] `pasada` con orden propio y referencia al mismo sujeto evaluable.
- [x] Triggers: padrón editable solo sin noches abiertas; comparsa inactiva fuera del padrón; orden editable solo con la noche en `DRAFT`.
- [x] Las pasadas se congelan con su propia noche, no con el padrón general (§5.10 y §6).
- [x] Borrado bloqueado cuando hay dependencias (sujetos, orden o pasadas).
- [x] Pruebas de migración en `api/test/migrations/padron-migracion.test.js`.

**Fuente:** `docs/voting/diseno-fisico-evento.md` §5.5–§5.10, §6 y §9; `AGENTS.md` §Comparsas.

**Notas**

- No se agregó `UNIQUE (edicion_id, nombre)` en `comparsa`: el diseño §5.5 no lo pide.
- `pasada` no lleva el trigger del padrón general: el diseño lo congela por noche.
