# 05: Cliente — panel administrativo de asignaciones con confirmación

**What to build:** El Administrador gestiona asignaciones desde la interfaz, con confirmación explícita antes de cada operación sensible.

**Blocked by:** Tickets 02, 03 y 04 (resueltos).

**Status:** implementado. Contrato documentado en `docs/voting/asignaciones-api.md`.

- [x] Métodos en `client/src/cliente-api.js` para listar jurados, noches, especialidades y asignaciones, y para crear, revocar y reemplazar asignaciones, devolviendo `{ok, status, cuerpo}`.
- [x] Panel de asignaciones visible solo para `ADMINISTRADOR` (`App.jsx`), con selector de noche, listado de cobertura y formulario de alta; si alguna consulta responde `403`, el panel no se muestra.
- [x] Se reutiliza `client/src/components/Modal/Modal.jsx` para confirmar alta, revocación y reemplazo antes de llamar a la API; cancelar no produce ninguna petición.
- [x] Se muestra el error de la API (`{error, mensaje}`) y se recarga el listado tras una operación aceptada. Las consultas iniciales van en paralelo con `Promise.all`.
- [x] Prueba en `client/test/app/app-flow.test.js` con API inyectada: alta confirmada, revocación cancelada, revocación y reemplazo confirmados, error de la API con su código, opción inactiva no precargada en el reemplazo, selector "Todas" y panel oculto con `403`. No dependen de detalles internos del componente.

**Prerrequisito descubierto y cubierto:** el ticket daba por existentes `GET /noches` y `GET /especialidades`, pero no estaban implementados. Sin ellos no se podría dar de alta en una noche todavía sin cobertura. Se agregaron como consultas de solo lectura en `api/src/asignaciones.js` y `api/src/admin-asignaciones.js`, con `ADMINISTRADOR` requerido y pruebas propias. No introducen reglas de negocio nuevas.

**Limitación heredada:** el panel revoca y reemplaza sin verificar planillas confirmadas, porque esa regla depende de `votacion-offline` y sigue pendiente (ticket 04). La interfaz tampoco implementa el flujo offline del jurado, que corresponde a otro feature.

## Comentarios

- 2026-11-19: implementado con TDD. El ciclo rojo partió de la ausencia del panel y se completó con `PanelAsignaciones.jsx`, su montaje en `App.jsx` y los métodos en `cliente-api.js`.
- 2026-11-19: el reemplazo se modela en el cliente como un modal con selectores de jurado y especialidad precargados con los valores de la fila. El backend crea una nueva asignación, así que el listado recargado muestra la original como `REVOCADA` y la nueva como `ACTIVA`.
- 2026-11-19: la identidad del actor no se envía desde el cliente; los métodos solo pasan identificadores de dominio y la API deriva quién opera de la sesión.
- 2026-11-19: el selector de noche usa `null` como "aún no eligió" y `""` como "todas", para que la opción "Todas" no vuelva a caer en la primera noche por un valor falsy.
- 2026-11-19: se agregó `npm run build` a la verificación porque el cambio incorpora un componente y afecta al empaquetado. Compila correctamente.
- 2026-11-19: el helper de pruebas `elegirOpcion` compara el primer nodo de texto del `label`, porque `textContent` incluye el texto de las `<option>` del selector.
- 2026-11-19: la revisión de estándares pidió conservar el estado de envío visible. El modal permanece abierto hasta que la petición termina, con el botón «Enviando…» deshabilitado; antes se cerraba antes del `await` y ese estado no se veía. También se limpia el mensaje previo al iniciar otra operación.
- 2026-11-19: se extrajo `ModalConfirmacion` para compartir título, acciones y botones entre alta, revocación y reemplazo, y se renombraron `catalogo` a `datosPanel` y `nocheActiva` a `nocheEnVista` para no confundir el filtro con el estado `ACTIVA` de una asignación.
- 2026-11-19: la revisión reiteró que la regla de planilla confirmada debe bloquearse en la API/DB (AGENTS §3), no en la interfaz. El cliente no intenta validarla; la restricción sigue pendiente del modelo de planillas de `votacion-offline` y documentada en el ticket 04.
- 2026-11-19: la revisión de spec pidió mostrar el código de error además del mensaje (`mensaje (codigo)`), reiniciar `sinPermiso` en cada recarga para que un `403` transitorio no oculte el panel para siempre, y no precargar en el reemplazo un jurado o especialidad que ya no figure en el catálogo. Los selectores del reemplazo incluyen una opción placeholder para que el valor vacío sea representable.
- 2026-11-19: la historia 1 del spec habla de «detectar coberturas faltantes», pero este ticket solo pide el «listado de cobertura». El panel avisa cuando una noche no tiene asignaciones; calcular qué especialidades debería tener cada noche requeriría una regla de cobertura esperada que no está definida (D5 parcial). No se inventó esa regla.
- 2026-11-19: la revisión de spec calificó los GET de catálogo como ampliación formal del contrato dentro de un ticket de cliente. Se mantienen porque el propio ticket los daba por existentes y son necesarios, y quedan registrados aquí como prerrequisito explícito con sus pruebas y su contrato documentado (AGENTS §13/§14).
