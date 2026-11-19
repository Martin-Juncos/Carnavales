# 08: Abrir la primera noche y congelar el reglamento

**What to build:** Acción administrativa para abrir una noche en `DRAFT`, congelar la versión publicada y el padrón, y registrar la operación de forma idempotente.

**Blocked by:** El cierre de noche depende de D10/D11 y queda fuera de esta issue. El checklist de apertura ya está definido:
- versión publicada;
- al menos un jurado activo por cada especialidad que evalúa rubros de la versión (decisión del responsable del proyecto, 19/11/2026);
- orden de presentación cargado.
- La integración con asignaciones está disponible en `0007` y la API.

**Status:** apertura implementada en `0013`, servicio y ruta administrativa; cierre permanece bloqueado por D10/D11.

- [x] Servicio de apertura de noche con clave idempotente.
- [x] Verificación de versión publicada, cobertura de jurados por especialidad y orden de todas las comparsas activas.
- [x] Congelación de la versión y del padrón.
- [x] Pruebas de comportamiento, autorización, rollback e idempotencia concurrente (`api/test/apertura-noche.test.js`, `api/test/admin-apertura.test.js`).
- [ ] Cierre de noche fuera de alcance hasta definir D10/D11.
