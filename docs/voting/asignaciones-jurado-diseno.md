# Diseño físico aprobado: asignaciones de jurado (migración 0007)

**Estado:** diseño mínimo aprobado por el usuario para implementar `.scratch/asignaciones-jurado/spec.md`; la aprobación quedó registrada en `.scratch/asignaciones-jurado/issues/01-modelo-y-migracion.md`, bajo `## Comentarios`. Autoriza la migración `api/migrations/0007-asignaciones-jurado.sql`; **no** autoriza las reglas pendientes de `api/migrations/pendientes/` ni sustituye un reglamento general aprobado.

## Alcance

La migración 0007 agrega únicamente las tablas necesarias para identificar una asignación y conservar evidencia de los cambios sensibles:

- `noche` y `especialidad` como prerrequisitos mínimos;
- `asignacion_jurado` como vínculo entre jurado, noche y especialidad;
- `auditoria` como registro append-only de operaciones sensibles.

Quedan fuera: transiciones de apertura y cierre de noche, padrón de comparsas, planillas, votos, penalizaciones, resultados, reglas de cálculo y cualquier decisión pendiente (D1, D5, D9, D10, D13, D14, D16, D17, D18, D20, D21, D24). Las definiciones completas siguen guardadas y sin aplicar en `api/migrations/pendientes/`.

## Tablas

### `noche`

`id uuid` PK, `edicion_id uuid` FK `edicion(id) RESTRICT`, `orden integer > 0`, `nombre text`, `fecha date`, `tipo` (`COMPETENCIA`/`PREMIACION`), `cuenta_para_puntaje boolean` (default `true`), `estado` (`DRAFT`/`OPEN`/`CLOSED`, default `DRAFT`), `abierta_en`, `cerrada_en`. Únicas: `(edicion_id, orden)` y `(id, edicion_id)`. Restricciones de coherencia entre `estado` y las marcas de tiempo.

La creación en `DRAFT` y las transiciones `DRAFT → OPEN → CLOSED` se rigen por las reglas confirmadas, pero sus triggers se implementan con `configurar-edicion`; esta migración solo crea la estructura.

### `especialidad`

`id uuid` PK, `edicion_id uuid` FK `edicion(id) RESTRICT`, `nombre text`, `codigo text`, `orden integer > 0`, `activa boolean` (default `true`). Únicas: `(id, edicion_id)`, `(edicion_id, codigo)` y `(edicion_id, orden)`.

### `asignacion_jurado`

`id uuid` PK, `edicion_id uuid` FK `edicion(id) RESTRICT`, `jurado_id text` FK `usuario(id) RESTRICT`, `noche_id uuid`, `especialidad_id uuid`, `estado` (`ACTIVA`/`REVOCADA`, default `ACTIVA`), `creada_por` y `revocada_por` FK `usuario(id) RESTRICT`, `creada_en` y `revocada_en`.

Las FK compuestas `(noche_id, edicion_id)` y `(especialidad_id, edicion_id)` impiden mezclar ediciones. Un índice único parcial garantiza una asignación activa por jurado, noche y especialidad; al revocar se libera la combinación sin borrar la fila anterior.

**Triggers:** `asignacion_jurado_validar_cambio` prohíbe el borrado físico y solo permite la transición `ACTIVA → REVOCADA`, sin alterar la identidad de la asignación; `asignacion_jurado_impedir_truncate` prohíbe vaciar la tabla con `TRUNCATE`. Protegen la inmutabilidad de la fila y la conservación de la evidencia. Por eso el reemplazo de la API revoca la fila original y crea una nueva, en vez de modificar aquella.

La migración `0007` por sí sola no verificaba si había una planilla recibida.
Las migraciones posteriores agregaron recepción y suplencias. Para los
bloqueos y rutas vigentes, consultar [la API de asignaciones](asignaciones-api.md).

### `auditoria`

`id uuid` PK, `ocurrida_en timestamptz` (hora del servidor), `actor_id text` FK `usuario(id) RESTRICT`, `operacion text`, `entidad_tipo text` y `entidad_id text`. No almacena credenciales, tokens de sesión, códigos 2FA ni una copia editable de puntajes.

**Triggers:** `auditoria_append_only` rechaza `UPDATE` y `DELETE`; `auditoria_impedir_truncate` rechaza `TRUNCATE`.

## Verificación

`api/test/migrations/asignaciones-migracion.test.js` comprueba, con PostgreSQL descartable, la inmutabilidad de la asignación, la transición `ACTIVA → REVOCADA`, la liberación de la combinación, la prohibición de borrado físico y de `TRUNCATE`, y el carácter append-only de la auditoría. `api/test/migrations/migrations.test.js` verifica el orden y la idempotencia de las migraciones, incluida la 0007.
