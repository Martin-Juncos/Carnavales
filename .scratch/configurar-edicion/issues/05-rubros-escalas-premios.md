# 05: Rubros, escalas, especialidades de rubro y premios

**What to build:** Migración y API para el contenido del reglamento en borrador: `rubro_version`, `escala_puntaje_version`, `rubro_especialidad`, `premio_version` y `requisito_version`.

**Blocked by:** Bloqueo parcial. Quedan pendientes:
- R5: escala 1–5 frente a 1–10 (`docs/voting/feat-reglamento-2027-pendiente.md`).
- R7: 3 o 4 nominados.
- R4b: `requisito_version.puede_puntuar`.

El catálogo de `tipo_rubro` (NOMINATIVO, ALEATORIO) ya está confirmado por el responsable del proyecto (H9). Decisión tomada en la conversación del 19/11/2026.

**Status:** bloqueado parcialmente. Pueden avanzar las tablas y el CRUD que no dependan de R5, R7 ni R4b.

- [x] Resolver la contradicción H9 / §10.1 sobre `tipo_rubro`.
- [ ] Migración de rubros, escalas y premios con triggers de solo-borrador.
- [ ] Escala por rubro validada contra la versión del reglamento (bloqueado por R5).
- [ ] CRUD administrativo con auditoría.
- [ ] Pruebas de comportamiento.
