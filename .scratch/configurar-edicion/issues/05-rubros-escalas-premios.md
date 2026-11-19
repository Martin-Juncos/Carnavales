# 05: Rubros, escalas, especialidades de rubro y premios

**What to build:** Migración y API para el contenido del reglamento en borrador: `rubro_version`, `escala_puntaje_version`, `rubro_especialidad`, `premio_version` y `requisito_version`.

**Blocked by:** Bloqueo parcial. El catálogo de `tipo_rubro` está diferido por R1–R11 (`docs/voting/feat-reglamento-2027-pendiente.md`), aunque `docs/voting/diseno-fisico-evento.md` H9 lo da por resuelto en `NOMINATIVO`/`ALEATORIO`. Hay que resolver esa contradicción antes de aplicar el `CHECK`.
También quedan pendientes R5 (escala 1–5 vs 1–10), R7 (3 o 4 nominados) y R4b (`requisito_version.puede_puntuar`).

**Status:** bloqueado. Solo pueden avanzar las tablas que no dependan del catálogo, si se acepta dejarlo sin `CHECK` hasta resolverlo.

- [ ] Resolver la contradicción H9 / §10.1 sobre `tipo_rubro`.
- [ ] Migración de rubros, escalas y premios con triggers de solo-borrador.
- [ ] Escala por rubro validada contra la versión del reglamento.
- [ ] CRUD administrativo con auditoría.
- [ ] Pruebas de comportamiento.
