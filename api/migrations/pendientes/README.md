# Migraciones pendientes (sin aplicar)

Esta carpeta guarda el diseño completo del agregado de edición que se separó de `0006-evento-configuracion.sql`.
El runner (`api/src/migrate.js`) solo lee archivos `NNNN-*.sql` en el nivel superior de `api/migrations/`, así que nada de esta carpeta se ejecuta.

| Archivo | Qué es |
| --- | --- |
| `evento-configuracion-completa.sql` | Migración completa (noches, comparsas, participantes, sujetos, orden, pasadas, rubros, escalas, premios, requisitos, enmiendas, operación de apertura). |
| `verify-evento-configuracion-completa.sql` | Verificación SQL de la migración completa. |
| `migrations-evento-completa.test.js.txt` | Pruebas de Node de la versión completa: apertura de noche, concurrencia de padrón, pasadas y topes, y congelación. Desde la línea 126. |

Cada parte se aplica solo cuando su decisión pendiente se resuelva (ver `docs/voting/diseno-fisico-evento.md`, §10). Al restaurarla, mover el archivo a `api/migrations/` con el siguiente número libre, y restaurar las pruebas correspondientes.
