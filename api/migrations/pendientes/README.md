# Migraciones pendientes (sin aplicar)

Esta carpeta guarda el diseño completo del agregado de edición que se separó de `0006-evento-configuracion.sql`.
El runner (`api/src/cli/migrate.js`) solo lee archivos `NNNN-*.sql` en el nivel superior de `api/migrations/`, así que nada de esta carpeta se ejecuta.

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

Esta tabla es una **instantánea histórica** de lo aplicado hasta `0014`; no es
el listado vigente de pendientes del proyecto. El estado actual del backlog
vive en [`docs/README.md`](../../../docs/README.md) y el
[seguimiento de tareas](../../../.scratch/README.md).

## Qué quedaba pendiente en esa instantánea (parcialmente resuelto después)

| Parte | Bloqueo original | Estado posterior |
| --- | --- | --- |
| `enmienda_reglamento` | Efecto sobre votos emitidos (H3). | La tabla fue retirada por `0024-retirar-enmienda-reglamento.sql` (solo si estaba vacía); ver `api/README.md`. H3 sigue sin una regla aprobada. |
| Cierre de noche y sus requisitos | D10/D11 y la tabla de planillas. La apertura está implementada en `0013`. | Implementado por `0021-cierre-noche.sql`; ver [cierre de noche (P5)](../../../docs/voting/cierre-noche-api.md). |
| `regla_calculo_version` y `algoritmo_calculo` | D24 ya está decidido; falta cerrar H4/catálogo técnico y aplicar el esquema. | El cálculo versionado, la resolución manual de empates y la publicación se implementaron en `0028-resultados-publicacion.sql` sin este esquema genérico; ver [resultados y publicación (P6C)](../../../docs/voting/resultados-api.md). H4/el catálogo técnico de algoritmos descrito aquí sigue sin aplicarse tal como estaba diseñado en esta carpeta. |

## Archivos de referencia

| Archivo | Qué es |
| --- | --- |
| `evento-configuracion-completa.sql` | Borrador de referencia de la migración completa. |
| `verify-evento-configuracion-completa.sql` | Verificación SQL del borrador completo. |
| `migrations-evento-completa.test.js.txt` | Pruebas de Node del borrador completo. |

Cada parte se aplica solo cuando su decisión pendiente se resuelva (ver `docs/voting/diseno-fisico-evento.md`, §10). Al restaurarla, mover el archivo a `api/migrations/` con el siguiente número libre, y restaurar las pruebas correspondientes.
