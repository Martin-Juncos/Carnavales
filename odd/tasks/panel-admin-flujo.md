# Panel de Administración — Flujo por etapas

Objetivo: Rediseñar el panel de Administración con navegación por ciclo de vida (sidebar + Hub "Mis eventos" + asistente no lineal de preparación + operación en vivo) conectado a la API existente, sin migraciones nuevas.
Rama: `feat/panel-admin-flujo` | Estrategia de entrega: `ask-on-risk` | Test runner: `cd client && npm test` (Vitest + node:test)

## Specs

- **S1 — Navegación por ciclo de vida y Hub "Mis eventos":** Sidebar de Administración con nivel global (`Control de votación` / Mis eventos, `Usuarios e invitaciones`) y nivel edición (`Preparación`, `En vivo`, `Resultados`), preservando borradores y sincronización de roles existentes. Tarjetas de ediciones con búsqueda, filtro por estado y acciones protegidas por modal (`Configurar`, `Ver resultados`, `Retirar`, `Eliminar`).
- **S2 — Cliente HTTP completo para configuración y apertura:** Exponer en `client/src/shared/api/cliente-api.js` las rutas ya implementadas en `docs/voting/configuracion-api.md` (reglamento en borrador, padrón, orden, planilla base, checklist, vista previa, publicación, apertura de edición/noche y retiro).
- **S3 — Preparación Paso 1 y 2 (Jornadas y Evaluación/Reglamento):** Asistente no lineal con barra de progreso, estado por paso y banner de congelación cuando alguna noche no está en `DRAFT`. Paso 1: CRUD de noches en `DRAFT`. Paso 2: especialidades, rubros (nominativos/aleatorios, tipo de sujeto, especialidades asignadas), y escala `1–5`.
- **S4 — Preparación Paso 3 y 4 (Comparsas/Padrón y Orden de salida):** Paso 3: gestión de comparsas (`PRIMERA`/`AGRUPACION`), participantes y sujetos evaluables por comparsa. Paso 4: orden de salida por noche en `DRAFT` (Subir/Bajar/Agregar/Quitar) con guardado protegido por modal.
- **S5 — Preparación Paso 5 y 6 (Planillas y Revisión/Publicación):** Paso 5: generación de filas nominativas, nominaciones manuales en rubros aleatorios, exclusión de filas e integración de `PlanillasNoche`. Paso 6: checklist de publicación (`bloqueantes` vs `advertencias`), vista previa agrupada (sin puntajes) y publicación de versión con modal.
- **S6 — Operación en vivo (Apertura de edición/noche y cobertura):** Abrir edición (`CONFIGURING → OPEN`) y abrir noche (`DRAFT → OPEN`) con `claveOperacion` UUID idempotente, modal de confirmación y detalle de bloqueantes, junto con `PanelAsignaciones` (jurados y suplencias). Sin cierre de noche ni penalizaciones (exclusivos de Escribano).

## Tasks

- [x] **T1** (`S1`, `S2`) — Route: inline — Cliente API extendido, shell con sidebar por etapas y Hub "Mis eventos" con tarjetas, filtros y retiro/eliminación — Commit: `01e7683` (72 Vitest + 40 node:test + build GREEN)
- [x] **T2** (`S3`) — Route: inline — Stepper no lineal de preparación + Paso 1 (Jornadas) y Paso 2 (Especialidades, Rubros y Escala) — Commit: `0a2a1ab` (74 Vitest + 40 node:test + build GREEN)
- [x] **T3** (`S4`) — Route: inline — Paso 3 (Comparsas, participantes y sujetos) y Paso 4 (Orden de salida por noche con modal) — Commit: `1a4946b` (76 Vitest + 40 node:test + build GREEN)
- [x] **T4** (`S5`) — Route: inline — Paso 5 (Planilla base + Planillas por noche) y Paso 6 (Checklist, vista previa y publicación) — Commit: `a411403` (78 Vitest + 40 node:test + build GREEN)
- [x] **T5** (`S6`) — Route: inline — Vista En vivo (Abrir edición, Abrir noche con checklist/bloqueantes e integración de asignaciones/suplencias) y actualización de `docs/user-guide.md` — Commit: `896e06f` (79 Vitest + 40 node:test + build GREEN)
- [x] **T6** (`S3`, `S4`, `S5`, `S6`) — Route: inline — Simplificar asistente de 7 pasos técnicos a 4 etapas humanas (Jornadas y especialidades → Evaluación con escala 1–5 automática → Comparsas y orden sin formulario manual de sujetos → Planilla y habilitación con sincronización en 1 clic, vista previa, excepciones opcionales, publicación y apertura) — Commit: `987f91c` (80 Vitest + 40 node:test + build GREEN)
- [x] **T7** (`S4`, `S5`) — Route: inline — Permitir asignación directa comparsa → rubro → participante en rubros `PERSONA` (nominativos y aleatorios) en `planilla.js` / `publicacion-reglamento.js` sin cruces cartesianos, y actualizar `PasoPadron.jsx` para asignar cada figura directo en su rubro — Commit: `348a8fa` (80 Vitest + 40 node:test + build GREEN; `api/test/planilla.test.js` skipped sin `TEST_DATABASE_URL`, syntax check OK)

Pronóstico de líneas modificadas: ~1600 líneas totales divididas en 5 slices coherentes (~300–400 líneas cada uno).

## Log

- **L1 (2026-11-24):** Usuario compartió carpeta de Drive `capturas-flujos` preguntando: "En base a ese flujo, Que flujo recomiendas hacer en esta aplicacion, tomando lo bueno y añadiendo cosas nuevas". Tras aclarar que "el flujo del jurado ya estaria diseñado e implementado", eligió "vamos por la 1" (Panel de Administración) y confirmó "dale arranquemos" sobre el flujo completo con la API actual (sin migraciones nuevas).
- **L2 (2026-11-24):** Verificado estado base: 40 tests en `client` pasando (`npm test`). Rama `feat/panel-admin-flujo` creada desde `refactor/estructura-modular`.
- **L3 (2026-11-24):** Feedback del usuario: "No me gusta el flujo de la creacion de la planilla para el evento, es muy confuso" → autorizó "implementa esto" para simplificar a 4 etapas absorbiendo escala 1–5, sujetos evaluables, generación de planilla base y selección por noche en un flujo unificado.
- **L4 (2026-11-24):** Usuario señaló: "En la parte de asignar participantes, convendria elegir las comparsas y de acuerdo a sus planilla ir configurando o como, ya que hoy la aplicacion todabia no deja asignar un participante a un rubros en una comparsa." Autorizó opción 1 (API + UI).
