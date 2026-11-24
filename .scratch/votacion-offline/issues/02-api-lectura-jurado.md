# 02: API de lectura del Jurado (P2)

**What to build:** El Jurado consulta únicamente los contextos con asignación activa y la estructura de su planilla esperada, sin puntajes numéricos.

**Blocked by:** Ticket P1 (migración `0008`, resuelto).

**Status:** implementado. Contrato en `docs/voting/jurado-api.md`.

- [x] `GET /api/jurado/contextos` devuelve solo asignaciones `ACTIVA` del jurado de la sesión, con noche (y su edición) y especialidad; excluye revocadas y asignaciones de otros jurados.
- [x] `GET /api/jurado/planillas/:asignacionId` devuelve las filas esperadas de la edición, versión y especialidad de la asignación, excluyendo `fila_planilla.excluida`.
- [x] Las filas no evaluables (`evaluable = false`, D7) se devuelven marcadas para no tratarlas como puntuaciones requeridas.
- [x] La respuesta no contiene puntajes numéricos ni datos de la sesión; la identidad y el rol se derivan de la sesión y el rol se consulta en la base en cada petición.
- [x] `401` sin sesión, `403` sin rol `JURADO`, `400` para id mal formado, `404` para asignación ajena, revocada o inexistente (mismo código para no revelar existencia).
- [x] Pruebas en `api/test/jurado.test.js` con PostgreSQL descartable; además se extrajo `requerirJurado` en `api/src/autorizacion.js` compartiendo la lógica con `requerirAdministrador`.

## Limitaciones conocidas

- La versión usada para derivar las filas es la última versión vigente de la edición (`BORRADOR`, `PUBLICADA` o `CONGELADA`), porque la operación de apertura que llena la instantánea P1 todavía no existe. Al implementarla, la lectura debe usar la versión congelada de la noche. La lectura con versión `CONGELADA` tiene prueba propia.
- `fila_planilla` no tiene `noche_id` (limitación del esquema de `0008`): dos asignaciones de la misma edición y especialidad en noches distintas devuelven la misma estructura. La respuesta identifica la noche, pero no diferencia filas por noche; corregirlo exige un cambio de esquema.
- No se exponen comparsas ni catálogo general del Jurado: solo lo necesario para la planilla de su asignación.
- No hay captura, confirmación local ni recepción de planillas: corresponde a los tickets siguientes.

## Comentarios

- 2026-11-19: implementado con TDD. La prueba roja inicial falló por el módulo ausente; después se corrigieron dos fallos del fixture (un triple rubro/sujeto/especialidad duplicado y un parámetro SQL sin tipo) antes de tener la suite verde.
- 2026-11-19: se reutilizó `ErrorAsignacion` con los códigos ya mapeados (`campos_invalidos`, `asignacion_no_encontrada`) para no ampliar la tabla de errores globales con un código equivalente.
- 2026-11-19: verificación final con el helper temporal que crea una base `carnavales_test_<hex>` y define `TEST_DATABASE_URL`: API **161/161**, cliente **39/39**. Sin esa variable las pruebas de base se omiten (`skip`); `npm test` directo no las ejecuta.
- 2026-11-19: la revisión de estándares pidió cubrir `401`/`403` también en `/planillas` (ya estaban en `/contextos` vía el middleware compartido) y fijar la forma exacta de cada fila para que un campo de puntaje con otro nombre no escapara de la prueba.
- 2026-11-19: la revisión de spec detectó tres fallos: las noches de `PREMIACION` aparecían como contextos (ahora se filtra `n.tipo = 'COMPETENCIA'`), una versión no `BORRADOR` devolvía `filas: []` (ahora se usa la última versión vigente), y la lectura podía cruzarse con una revocación (ahora va en transacción con `FOR SHARE OF a`). Se agregaron pruebas para los dos primeros casos; la prueba de grises ahora muestra una fila gris conviviendo con una evaluable.
