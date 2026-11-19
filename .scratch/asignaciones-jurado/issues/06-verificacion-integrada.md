# 06: Verificación integrada de extremo a extremo

**What to build:** Recorrer la gestión de asignaciones desde la interfaz real hasta PostgreSQL, con sesión y segundo factor reales, y comprobar la trazabilidad de las operaciones sensibles.

**Blocked by:** Ticket 05.

**Status:** pendiente.

- [ ] Prueba estilo `api/test/ediciones-flujo.test.js`: `createApp` real, Better Auth con OTP capturado, cookies, PostgreSQL descartable.
- [ ] Verificar que el Jurado solo ve noches/especialidades con asignación activa (la validación de voto completo se coordina con `votacion-offline`).
- [ ] Verificar que el cierre usa el conjunto correcto de planillas esperadas derivadas de las asignaciones (se coordina con `cierre-resultados`; no implementar cierres).
- [ ] Verificar auditoría de alta, revocación y reemplazo sin credenciales, tokens ni OTP en los registros.
- [ ] Ejecutar la suite completa de `api/` y `client/` al finalizar.
