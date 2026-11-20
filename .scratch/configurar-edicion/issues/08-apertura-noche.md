# 08: Abrir la primera noche y congelar el reglamento

**What to build:** Acción administrativa para abrir una noche en `DRAFT`, congelar la versión publicada y el padrón, y registrar la operación de forma idempotente.

**Alcance original:** apertura, no cierre. Checklist de esta etapa:
- versión publicada;
- al menos un jurado activo por cada especialidad que evalúa rubros de la versión (decisión del responsable del proyecto, 19/11/2026);
- orden de presentación cargado.
- La integración con asignaciones está disponible en `0007` y la API.

**Estado actual:** apertura implementada y ampliada en entregas posteriores.
Consulta las [reglas vigentes de apertura](../../../docs/voting/configuracion-api.md).
El [cierre de noche](../../../docs/voting/cierre-noche-api.md) se implementó por separado en P5.

- [x] Servicio de apertura de noche con clave idempotente.
- [x] Verificación de versión publicada, cobertura de jurados por especialidad y orden de todas las comparsas activas.
- [x] Congelación de la versión y del padrón.
- [x] Pruebas de comportamiento, autorización, rollback e idempotencia concurrente (`api/test/apertura-noche.test.js`, `api/test/admin-apertura.test.js`).
- [ ] Cierre de noche fuera de alcance hasta definir D10/D11.
