# 03: Migración del padrón (comparsas, participantes, sujetos, orden y pasadas)

**What to build:** Migración `0008` con las tablas del padrón que faltan: `comparsa`, `participante`, `sujeto_evaluable`, `orden_presentacion` y `pasada`, con sus restricciones de integridad y de congelación.

**Blocked by:** None para la estructura. Las reglas de puntuación de pasadas (D6) no afectan el esquema.

**Status:** pendiente.

- [ ] `comparsa` con categoría `PRIMERA`/`AGRUPACION`, activa y nombre único por edición.
- [ ] `participante` con `nombre_completo`, `activo` y `es_menor` declarativo (A14).
- [ ] `sujeto_evaluable` con los diez tipos confirmados (A6) y la coherencia `PERSONA` ↔ `participante_id`.
- [ ] `orden_presentacion` por noche con orden único y FK compuestas por edición.
- [ ] `pasada` con orden propio y referencia al mismo sujeto evaluable.
- [ ] Triggers: padrón editable solo sin noches abiertas; comparsa inactiva fuera del padrón; orden y pasadas editables solo con la noche en `DRAFT`.
- [ ] Borrado bloqueado cuando hay dependencias (asignaciones, votos, cierres u otra evidencia).
- [ ] Verificación SQL y pruebas de migración.

**Fuente:** `docs/voting/diseno-fisico-evento.md` §5.5–§5.10, §6 y §9; `AGENTS.md` §Comparsas.
