# 05: Rubros, escalas, especialidades de rubro y premios

**What to build:** Migración y API para el contenido del reglamento en borrador: `rubro_version`, `escala_puntaje_version`, `rubro_especialidad`, `premio_version` y `requisito_version`.

**Blocked by:** Ninguna decisión pendiente en esta issue. Decisiones tomadas por el responsable del proyecto (19/11/2026):
- H9: `tipo_rubro` es NOMINATIVO o ALEATORIO.
- R5: escala de 1 a 5.
- R7: nominados configurables por el administrador desde la app.
- R4b: `requisito_version.puede_puntuar` es sí/no por requisito, configurado por el administrador en borrador.

**Status:** desbloqueado. Pendiente de implementar.

- [x] Resolver la contradicción H9 / §10.1 sobre `tipo_rubro`.
- [x] Decidir la escala (R5), los nominados (R7) y `puede_puntuar` (R4b).
- [ ] Migración de rubros, escalas, premios y requisitos con triggers de solo-borrador.
- [ ] Escala por rubro validada contra la versión del reglamento (1 a 5).
- [ ] CRUD administrativo con auditoría.
- [ ] Pruebas de comportamiento.
