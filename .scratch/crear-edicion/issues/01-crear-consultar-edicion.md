# 01: Crear y consultar una edición vacía

**What to build:** Como administrador, crear una edición desde una configuración vacía y encontrarla en el listado para comenzar a configurarla.

**Blocked by:** None (can start immediately).

**Status:** implementado; pendiente de la prueba de extremo a extremo (ver última viñeta)

- [x] El administrador puede crear una edición indicando nombre y año; el año debe ser positivo y único. (`api/test/modules/ediciones/ediciones.test.js`)
- [x] Al crearla, la edición queda en estado `CONFIGURING` y cuenta con su primera versión del reglamento en estado `BORRADOR`. (`api/test/modules/ediciones/ediciones.test.js`, comprobado en PostgreSQL)
- [x] La edición creada aparece en el listado de ediciones con sus estados actuales. (API en `api/test/modules/ediciones/ediciones.test.js`; panel en `client/test/app/app-flow.test.js`)
- [x] Si el año ya existe, la operación informa un conflicto y no deja una edición ni una versión parcialmente creada. (`api/test/modules/ediciones/ediciones.test.js`)
- [x] La prueba del flujo verifica el comportamiento observable a través de la interfaz y la API administrativa, incluida la persistencia en PostgreSQL. (`api/test/modules/ediciones/ediciones-flujo.test.js`: `createApp` real, sesión con segundo factor y PostgreSQL; el panel de cliente se prueba aparte con API simulada, `client/test/app/app-flow.test.js`)
- [x] Este ticket cubre únicamente la creación vacía; no copia el reglamento de otra edición.
