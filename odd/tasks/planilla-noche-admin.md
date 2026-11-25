Objetivo: panel de administración para configurar la planilla por noche y especialidad, con dos endpoints aditivos de la API (listado de versiones y candidatas) y sin migraciones.
Rama: feat/integracion-edicion-jurados. Estrategia de entrega: ask-on-risk (por defecto). Runner: API `node --test` con `TEST_DATABASE_URL` (base descartable); cliente `vitest run`.
Diseño: skill `.opencode/skills/impeccable`, modo Operate, vocabulario de `client/src/styles/administracion.css` y `components/Modal`. Sin PRODUCT.md ni DESIGN.md: se usa el código existente como referencia.

## Specs

S1. El listado de versiones de reglamento de una edición es `GET /api/admin/ediciones/:edicionId/versiones`, solo `ADMINISTRADOR`, y responde `{ items: [{ id, numero, estado }] }` ordenado por `numero` descendente. Edición inexistente: `404 edicion_inexistente`.

S2. Las candidatas de una noche y especialidad son `GET /api/admin/ediciones/:edicionId/versiones/:versionId/noches/:nocheId/planilla/:especialidadId/candidatas`, solo `ADMINISTRADOR`, y responden `{ items: [{ id, rubroNombre, comparsaNombre }] }` en orden de desfile. Devuelven las candidatas aunque la selección ya esté guardada. El contrato de `GET .../planilla/:especialidadId` no cambia: sigue devolviendo `{ configurada, filaIds }`.

S3. Las validaciones de S2 siguen las de la planilla por noche: noche inexistente `404 noche_inexistente`, versión inexistente `404 version_inexistente`, especialidad inexistente `404 especialidad_inexistente`. No se crean migraciones.

S4. El panel de planilla por noche aparece dentro de la configuración de la edición, junto a noches y especialidades. Permite elegir versión, noche competitiva y especialidad, marcar filas candidatas y guardar la selección. Guardar pide confirmación en modal, según `AGENTS.md`. Confirmar una lista vacía también pide confirmación explícita, porque la API la registra como "nada que evaluar".

S5. Los estados del panel cubren carga, error con reintento, vacío y guardado con aviso. Una noche que ya no está en borrador se muestra en solo lectura con el motivo.

S6. No se modifican `api/src/cliente-api.js` ni `client/src/PanelAdministracion.jsx`, que tienen cambios sin commit de otro agente. El cliente nuevo vive en un módulo propio.

## Tasks

- T1 · S1 · inline API (`api/src/planilla.js` `listarVersiones`, ruta en `api/src/admin-planilla.js`) con RED en `api/test/modules/reglamento/planilla-noche-admin.test.js` (404 antes de implementar) · sin commit · GREEN · Risk: none (solo lectura, mismo permiso que las rutas existentes)
- T2 · S2, S3 · inline API (`api/src/planillas-noche.js` `listarCandidatasPlanillaNoche`, ruta en `api/src/admin-planilla.js`) · sin commit · GREEN · Risk: item 3 (contrato nuevo, aditivo; el `GET` de planilla por noche no cambia)
- T3 · S6 · inline cliente (`client/src/planillas-noche-api.js` y `planillas-noche-api.test.js`) · sin commit · 4/4 pruebas · Risk: none
- T4 · S4, S5 · inline componente (`client/src/PlanillasNoche.jsx` y `PlanillasNoche.test.jsx`) con diseño según impeccable · sin commit · 7/7 pruebas (un ajuste: el aviso de guardado pasó a «Guardado correctamente.» para no duplicar la línea de estado) · Risk: none
- T5 · S4 · inline montaje en `client/src/ConfiguracionEdicion.jsx`, con `planillas` inyectable y cliente por defecto · sin commit · Risk: none
- T6 · cierre parcial: API 311/311 (base descartable), cliente Vitest 57/57, `client/test` 40/40, `vite build` OK, `impeccable detect` sin hallazgos en el componente y su CSS · verificación visual hecha con Brave (`impeccable shot`) en 1280 px y 390 px, editable y de solo lectura, con harness temporal ya eliminado · docs sincronizadas en `docs/voting/configuracion-api.md` (rutas `versiones` y `candidatas`) y `docs/user-guide.md`; commit en la entrega de este feature (ver historial)
- T4 (ajuste visual) · `client/src/PlanillasNoche.module.css` con selectores en fila, lista de filas con borde y estado deshabilitado legible · Risk: none
- Observación fuera de alcance: la tabla de noches y especialidades existente desborda en 390 px (código preexistente de `ConfiguracionEdicion.jsx`, no modificado en este tramo).

## Log

L1 (2026-11-20, pedido original del usuario): "vamos con esto, si es que no hay que hace migraciones  Un panel de UI para lo que ya tiene API (por ejemplo, la gestión de planillas por noche, si todavía no tiene panel). No lo verifiqué a fondo."
L2 (2026-11-20, pedido del usuario): "dale si lo haces usa @.opencode/skills/impeccable esa skill para el diseño"
L3 (2026-11-20, decisión del usuario): "A" (sobre las opciones de agregar dos respuestas aditivas en la API, o esperar al commit del otro agente, o un panel de solo lectura).
L5 (2026-11-20, pedido del usuario): "dale" (tras ofrecer verificación visual ahora o sincronizar docs cuando el otro agente haga commit). Se hizo la verificación visual; la sincronización de docs queda pendiente.
L4 (2026-11-20, hallazgo): ningún endpoint devuelve los ids de versión, y `GET .../planilla/:especialidadId` no informa las candidatas cuando hay selección guardada. Por eso S1 y S2.
