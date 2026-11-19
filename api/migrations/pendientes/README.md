# Migraciones pendientes (sin aplicar)

Esta carpeta guarda el diseño completo del agregado de edición que se separó de `0006-evento-configuracion.sql`.
El runner (`api/src/migrate.js`) solo lee archivos `NNNN-*.sql` en el nivel superior de `api/migrations/`, así que nada de esta carpeta se ejecuta.

## Ya aplicado en migraciones numeradas

| Parte | Migración |
| --- | --- |
| Edición y versiones de reglamento | `0006-evento-configuracion.sql` |
| Noche, especialidad, asignaciones y auditoría | `0007-asignaciones-jurado.sql` |
| Padrón: comparsas, participantes, sujetos, orden y pasadas | `0008-padron-evento.sql` |
| Operación de apertura de edición (idempotencia) | `0009-operacion-apertura.sql` |
| Apertura idempotente de noches | `0013-apertura-noches.sql` |
| Rubros, escala por versión, especialidades de rubro, premios y requisitos | `0010-rubros-escalas-premios.sql` |
| Orden de rubros único por versión | `0011-orden-rubros-unico.sql` |
| Filas de planilla (`objetivo_rubro`) con topes y congelación | `0012-filas-planilla.sql` |

Las tablas correspondientes **no deben volver a crearse** al restaurar este archivo. Úsalo como
referencia de las partes que faltan.

## Qué queda pendiente

| Parte | Bloqueo |
| --- | --- |
| `enmienda_reglamento` | Efecto sobre votos emitidos (H3). |
| Cierre de noche y sus requisitos | D10/D11 y la tabla de planillas. La apertura está implementada en `0013`. |
| `regla_calculo_version` y `algoritmo_calculo` | D24 ya está decidido; falta cerrar H4/catálogo técnico y aplicar el esquema. |

## Archivos de referencia

| Archivo | Qué es |
| --- | --- |
| `evento-configuracion-completa.sql` | Borrador de referencia de la migración completa. |
| `verify-evento-configuracion-completa.sql` | Verificación SQL del borrador completo. |
| `migrations-evento-completa.test.js.txt` | Pruebas de Node del borrador completo. |

Cada parte se aplica solo cuando su decisión pendiente se resuelva (ver `docs/voting/diseno-fisico-evento.md`, §10). Al restaurarla, mover el archivo a `api/migrations/` con el siguiente número libre, y restaurar las pruebas correspondientes.
