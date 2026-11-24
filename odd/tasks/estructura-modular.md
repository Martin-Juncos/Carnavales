# Estructura modular de api/src y client/src

Objetivo: reorganizar api/src y client/src por dominio, sin cambiar comportamiento en la fase 1. Rama: refactor/estructura-modular (desde feat/integracion-edicion-jurados). Estrategia de entrega: ask-on-risk. Runner: `npm test` en api/ (BD descartable via TEST_DATABASE_URL) y en client/ (vitest run + node --test).

## Specs

S1. Fase 1 API, solo reubicación e imports: api/src se organiza en cli/, infra/, http/, shared/ (solo texto.js en esta fase) y modules/{auth,usuarios,ediciones,padron,reglamento,votacion,escribano,resultados}. Los routers se renombran a *.routes.js. Sin cambios de lógica.
S2. `resultados.js` y `rutas-resultados.js` van en modules/resultados/ (resultados.js y resultados.routes.js). No van en escribano/.
S3. `package.json` mantiene los nombres de script `migrate` y `bootstrap-admin`; cambian solo las rutas de archivo a cli/migrate.js y cli/bootstrap-admin.js. `migrate.js` resuelve `../migrations/` relativo a su ubicación; tras moverse a cli/ debe apuntar a `../../migrations/`.
S4. Fase 1 cliente, solo reubicación e imports: `ErrorModal` permanece en components/Modal/ (lo usan ResultadosEdicion, PenalizacionesEscribano y LoginPage). Solo AccessCodeModal pasa a features/auth. Se aplica el mismo mapa de features/ del documento de propuesta. Bloqueada hasta que el cliente tenga cambios sin commitear resueltos.
S5. Fase 2 (commits separados, cada uno con pruebas): shared/errores.js con base ErrorDominio; unificar registrarAuditoria (existe en configuracion-edicion.js y como función privada en asignaciones.js con firma distinta); shared/validaciones.js (uuidRequerido de asignaciones.js y normalizadores); modules/escribano/cierres.js extraído de escribano.routes.js; shared/api/http.js en el cliente (leerJson y llamar duplicados en cliente-api.js y planillas-noche-api.js, con método por defecto distinto).
S6. Los tests de API que importan ../src/... se actualizan a las nuevas rutas. No se mueven los archivos de api/test en esta fase.

## Tasks

T1 | S1, S2, S3 | route: inline | status: done (43 archivos movidos con git mv, 157 imports reescritos, 2 scripts de package.json actualizados) | commit: 18e5b58
T2 | S6 | route: inline (con T1) | status: done (tests de api/test reescritos con T1; 323/323 pasan) | commit: 18e5b58
T3 | S4 | route: inline | status: blocked (cambios sin commitear del cliente) | commit: -
T4 | S5 errores | route: inline | status: blocked (decisión humana: política de estados HTTP de ErrorConfiguracion, ver L9) | commit: -
T5 | S5 auditoria | route: inline | status: done (registrarAuditoria en shared/auditoria.js; asignaciones delega) | commit: 4948bee
T6 | S5 validaciones | route: inline | status: blocked (uuidRequerido lanza ErrorAsignacion y resultados.js tiene su propia copia; depende de T4) | commit: -
T7 | S5 cierres | route: inline | status: done (cerrarEdicion y cerrarNoche en modules/escribano/cierres.js; router 334 -> 293 líneas; prueba nueva de 409 edicion_retirada) | commit: ver L10
T8 | S5 http.js cliente | route: inline | status: done (client/src/shared/api/http.js con crearLlamador; cliente-api.js y planillas-noche-api.js lo usan) | commit: ver L12

## Log

L1. Usuario, verbatim: "bien podes implementarlo"
L2. Usuario, verbatim: "ya esta commiteado" (confirma que P6C está commiteado; el cliente aún tiene cambios sin commitear: App.jsx, PanelJurado.jsx, PanelJurado.module.css, RecepcionPlanilla.jsx, PanelJurado.test.jsx, styles/tokens.css, .gitignore, skills-lock.json y odd/tasks/resultados-publicacion.md).
L3. Línea base API (BD descartable local en 127.0.0.1:55432, base carnavales_test): tests 323, pass 323, fail 0, skipped 0.
L4. Línea base cliente: vitest 70 tests, 69 pass, 1 fail. El fallo es intermitente: `PanelAsignaciones.test.jsx > keeps a juror with an active assignment out of other specialties on that night only`. Pasa en aislamiento (2 de 2 ejecuciones). Pre-existente, no relacionado con el refactor.
L6. Fase 1 API verificada: npm test con TEST_DATABASE_URL en base descartable: 323 pass, 0 fail, 0 skipped (igual que la línea base). `npm run migrate` contra base descartable nueva (carnavales_cli): aplicó 28 migraciones desde src/cli/migrate.js. `bootstrap-admin` solo con sintaxis verificada; no se ejecutó porque crea un administrador. Referencias vigentes actualizadas en docs/ (authentication, voting), api/migrations/pendientes/README.md y .opencode/skills/postgres; no se tocaron odd/tasks ni .scratch (historial).
L7. Commits: 1) refactor(api): organiza módulos por dominio (movimientos, imports, scripts y tests); 2) docs: actualiza rutas tras la reorganización de la API (incluye este registro con el hash del commit 1).
L5. Riesgos verificados: migrate.js usa `new URL("../migrations/", import.meta.url)`; index.js usa `../../client/dist/` y no se mueve; los scripts de raíz (compile.mjs, plan.mjs, session-race.mjs, auth.config.js) no importan de src/.
L8. Fase 2 API, auditoría: 323/323 tras extraer registrarAuditoria a shared/auditoria.js (commit 4948bee).
L9. Decisión pendiente (T4): ErrorConfiguracion tiene ~70 códigos en 5 routers, cada uno con su propia tabla de estados; hay códigos que solo aparecen en una tabla y por omisión responden 400. Unificarlos en manejo-errores.js cambia el estado HTTP de algunas respuestas. Requiere decidir si se acepta ese cambio de contrato o si se mantienen las tablas por router.
L10. Fase 2 API, cierres: cerrarEdicion y cerrarNoche devuelven resultados y mantienen las mismas consultas, orden de bloqueos, ROLLBACK y liberación del cliente. El header Cache-Control de cierre de noche sigue fijándose después de exigir_edicion_operativa. Se agregó una prueba de 409 edicion_retirada por HTTP; pasa con el código nuevo y con el router anterior. Suite: 324/324. Cobertura de cierres.js: 96,6 % de líneas.
