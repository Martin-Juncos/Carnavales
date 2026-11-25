# 01: API administrativa de noches

**What to build:** Como Administrador, crear, listar, modificar y borrar noches de una edición mientras la noche siga en `DRAFT`, para cargar el calendario competitivo antes de abrirla.

**Blocked by:** None. La tabla `noche` existe desde `0007-asignaciones-jurado.sql` con `tipo`, `cuenta_para_puntaje` y `estado`.

**Status:** implementado.

- [x] `GET /api/admin/ediciones/:edicionId/noches` lista las noches de la edición por `orden`.
- [x] `POST /api/admin/ediciones/:edicionId/noches` crea una noche en `DRAFT` con `orden`, `nombre`, `fecha`, `tipo` y `cuentaParaPuntaje`.
- [x] `PATCH /api/admin/ediciones/:edicionId/noches/:nocheId` modifica una noche mientras esté en `DRAFT`.
- [x] `DELETE /api/admin/ediciones/:edicionId/noches/:nocheId` borra físicamente solo si la noche está en `DRAFT` y no tiene asignaciones de jurado.
- [x] El `orden` es positivo y único por edición; un choque responde `409 orden_existente`.
- [x] Una noche que no está en `DRAFT` no se modifica ni se borra (`409 noche_no_editable`).
- [x] Crear y modificar quedan registrados en `auditoria` en la misma transacción.
- [x] Sin sesión responde `401`; sin rol `ADMINISTRADOR`, `403`.
- [x] Pruebas de comportamiento en `api/test/modules/ediciones/noches.test.js` con PostgreSQL real.

**Notas y bloqueos heredados**

- `noche.tipo` (`COMPETENCIA` / `PREMIACION`) sigue marcado como propuesta en `docs/voting/diseno-fisico-evento.md` §5.3, pero ya está aplicado en `0007`. Esta API no lo reinterpreta: solo acepta los dos valores existentes.
- Abrir o cerrar una noche queda fuera de este ticket (ver `08-apertura-noche.md`).
- El calendario exacto de 2027 y la cantidad de noches son datos, no reglas: no se validan aquí.
