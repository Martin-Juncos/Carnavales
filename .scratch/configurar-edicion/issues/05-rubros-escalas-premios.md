# 05: Rubros, escalas, especialidades de rubro y premios

**What to build:** Migración y API para el contenido del reglamento en borrador: `rubro_version`, `escala_puntaje_version`, `rubro_especialidad`, `premio_version` y `requisito_version`.

**Blocked by:** Ninguna.

Decisiones tomadas por el responsable del proyecto (19/11/2026):
- H9: `tipo_rubro` es NOMINATIVO o ALEATORIO.
- R5 y H13: una escala 1 a 5 por versión del reglamento.
- R7: nominados configurables por el administrador desde la aplicación.
- R4b: `requisito_version.puede_puntuar` es sí/no por requisito, configurado por el administrador en borrador.

**Status:** implementado (migración `0010` y API administrativa). Los premios son independientes de los rubros; no se modela relación premio↔rubro.

- [x] Resolver la contradicción H9 / §10.1 sobre `tipo_rubro`.
- [x] Decidir la escala (R5/H13), los nominados (R7) y `puede_puntuar` (R4b).
- [x] Migración `0010` de rubros, escala por versión, especialidades de rubro, premios y requisitos, con triggers de solo borrador (`api/test/migrations/rubros-migracion.test.js`, 9 pruebas).
- [x] CRUD administrativo con auditoría (rubros, escala, especialidades de rubro, requisitos y premios; `api/test/modules/reglamento/reglamento-api.test.js`, 10 pruebas).
- [ ] Validación de publicación: todo rubro con al menos una especialidad (pertenece a la publicación de la versión).
