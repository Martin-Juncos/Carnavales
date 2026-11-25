# 01: Catálogo de evaluación y filas de planilla (P1)

**What to build:** Versiónar el catálogo mínimo que necesita una planilla de jurado (comparsas, participantes, sujetos, orden y pasadas, rubros con jerarquía, escalas, premios, requisitos, enmiendas y `fila_planilla`), adaptando el borrador pendiente a las decisiones aprobadas.

**Blocked by:** Decisiones P0 del 2026-11-19 (resueltas). Es prerrequisito de la recepción offline y de los cierres.

**Status:** implementado. La rama integrada conserva `0008-padron-evento.sql` y completa el catálogo compartido en `0014-catalogo-jurado.sql`.

- [x] Migración `0008` aplicada por `api/src/migrate.js`, transaccional y con el mismo mecanismo de candado que las anteriores; no se restauró `pendientes/evento-configuracion-completa.sql`.
- [x] No se recrean `edicion`, `version_reglamento`, `noche`, `especialidad`, `asignacion_jurado` ni `auditoria`; no se toca la tabla `rol` ni se crea `FISCAL`.
- [x] Jerarquía de rubros: un rubro con hijos no admite `fila_planilla` directa; un rubro con filas no puede convertirse en padre; se rechazan auto-referencias y ciclos. El padre suma sus hijos según `AGENTS.md` §2 (D25).
- [x] `evaluable` vive en `rubro_version` (D7) y la fila lo hereda, sin columna duplicada.
- [x] Escala `1..5` con CHECK; `0` no existe como nota y «No se presentó» es el flag `permite_no_presentado` del rubro.
- [x] `fila_planilla` única por (rubro, sujeto, especialidad), con FK a la edición y a la versión; `uno_o_mas` sujetos por rubro respetan los topes ya documentados en el borrador.
- [x] Unicidad de orden de presentación por noche/comparsa y por posición, y de pasadas por orden.
- [x] Estructura de la instantánea P1 (cabecera por noche con versión congelada y detalle de asignaciones), inmutable. **No** se implementó la operación de apertura ni su lógica.
- [x] Todas las FK nuevas usan `ON DELETE RESTRICT`; enmiendas e instantáneas son append-only.
- [x] Pruebas en `api/test/migrations/migracion-0008.test.js` con base descartable; se ajustaron `migrations.test.js` y `asignaciones-migracion.test.js` por la nueva migración y su FK.

## Fuera de alcance

- Operación de apertura de noche y congelación efectiva de rubros/escalas/padrón/orden/pasadas.
- Recepción de planillas, votos y sincronización (siguiente ticket de `votacion-offline`).
- Cierres, penalizaciones, resultados, actas y documentos oficiales.
- Desempates, impugnaciones, votos tardíos y correcciones excepcionales: siguen pendientes.

## Comentarios

- 2026-11-19: implementado con TDD usando `withIsolatedSchema` y `TEST_DATABASE_URL`; la suite completa de `api/` quedó en 153/153.
- 2026-11-19: los nombres y valores por defecto (`permite_no_presentado`, `suma_a_comparsa`, `nominados_maximos*`, `tipo_sujeto`, `tipo_rubro`, `categoria`) se tomaron del borrador `pendientes/evento-configuracion-completa.sql`; no se inventaron nuevos.
- 2026-11-19: la FK de `instantanea_planilla_esperada_detalle` a `asignacion_jurado` hace que PostgreSQL rechace `TRUNCATE asignacion_jurado` con un SQLSTATE distinto al del trigger propio. La prueba de `asignaciones-migracion.test.js` ahora comprueba que el TRUNCATE falla y que la fila sobrevive, sin fijar el código de error.
- 2026-11-19: `requisito_version.puede_puntuar` nace en `false`; habilitar la puntuación de requisitos depende de D14 y queda para esa decisión.
- 2026-11-19: la instantánea es solo estructural: se crea la tabla, pero ninguna ruta la llena todavía. No se debe interpretar que P1 ya congela planillas en caliente. `congelada_en` no tiene valor por defecto: lo fijará la operación de apertura.
- 2026-11-19: la revisión de spec detectó que el detalle podía congelar una asignación de otra noche. Se agregaron índices únicos compuestos y FKs `(asignacion_id, noche_id, edicion_id)` e `(instantanea_id, edicion_id, noche_id)`, con prueba del caso inválido.
- 2026-11-19: la revisión de estándares detectó que `TRUNCATE` no dispara triggers de fila. Se agregaron triggers `BEFORE TRUNCATE` para enmiendas e instantáneas, como en la migración 0007, con pruebas propias.
- 2026-11-19: la revisión detectó una carrera entre insertar una fila en un rubro e insertar un hijo en ese rubro. Ambos triggers toman `FOR UPDATE` sobre el rubro implicado para serializarse; se agregó la prueba de ciclo.
- 2026-11-19: impedir que un rubro con filas pase a ser padre no es una regla nueva: es la consecuencia de `AGENTS.md` §2 (un padre con hijos no recibe nota manual y suma sus hijos).
- 2026-11-19: verificación final con base descartable: API **153/153** y cliente **39/39**. El ticket heredado de TRUNCATE volvió a fijar el SQLSTATE `23514` para `auditoria`, donde la FK nueva no aplica.
