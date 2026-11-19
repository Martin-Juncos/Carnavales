# 05: Cliente — panel administrativo de asignaciones con confirmación

**What to build:** El Administrador gestiona asignaciones desde la interfaz, con confirmación explícita antes de cada operación sensible.

**Blocked by:** Tickets 02, 03 y 04.

**Status:** pendiente.

- [ ] Agregar métodos en `client/src/cliente-api.js` para listar jurados/noches/especialidades y crear, revocar y reemplazar asignaciones, devolviendo `{ok, status, cuerpo}`.
- [ ] Panel de asignaciones visible solo para `ADMINISTRADOR` (`App.jsx`), con selector de noche, listado de cobertura y formulario de alta; ocultar la UI si la API responde `403`.
- [ ] Reutilizar `client/src/components/Modal/Modal.jsx` para confirmar alta, revocación y reemplazo antes de llamar a la API; cancelar no produce ninguna petición.
- [ ] Mostrar el error de la API (`{error, mensaje}`) y recargar el listado tras una operación aceptada.
- [ ] Prueba en `client/test/app-flow.test.js` con API inyectada: alta confirmada y revocación cancelada, sin depender de detalles internos del componente.
