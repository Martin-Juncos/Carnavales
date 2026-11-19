# 08: Abrir la primera noche y congelar el reglamento

**What to build:** Acción administrativa para abrir una noche en `DRAFT`, congelar la versión publicada y el padrón, y registrar la operación de forma idempotente.

**Blocked by:** Bloqueo parcial.
- El cierre de noche depende de D10/D11 y de la tabla de planillas, que no existe.
- El checklist de apertura (versión publicada, jurados asignados, orden cargado) necesita `06-filas-planilla-publicacion.md` y `04-api-padron.md`.
- La integración con asignaciones ya está disponible en `0007` y en la API de consulta.

**Status:** bloqueado para la apertura real. La tabla `operacion_apertura` ya está aplicada en la migración `0009`; falta extenderla a noches (`noche_id`) y su servicio.

- [ ] Servicio de apertura de noche con clave idempotente.
- [ ] Verificación de versión `PUBLICADA` y de checklist completo.
- [ ] Congelación de la versión y del padrón.
- [ ] Rechazo de aperturas sin jurados asignados.
- [ ] Cierre de noche fuera de alcance hasta definir D10/D11.
- [ ] Pruebas de comportamiento y concurrencia.
