# Diseño físico y contrato API: cierre total de la votación (P6A)

**Estado:** aprobado e implementado en P6A (`0026-cierre-total-edicion.sql`).
Para el contrato vigente de los endpoints, consultar [cierre-total-api.md](cierre-total-api.md).

**Base aprobada:** decisiones `D10`, `D15`, `D21` y política estricta v1
registradas el 2026-11-24 en [decision-questions.md](decision-questions.md), y
contrato vigente de [cierre de noche (P5)](cierre-noche-api.md).

---

## 1. Alcance y límites

P6A agrega el cierre definitivo de la votación completa de una edición por parte
del `ESCRIBANO`, una vez cerradas sus noches competitivas puntuables.

- **Incluye:** transición `OPEN → CLOSED` en `edicion`, congelación operativa de
  configuración/noches/asignaciones/recepción de votos, auditoría en transacción,
  endpoints `/api/escribano/...`, sección **Cierre total** en `PanelEscribano` y
  compatibilidad con `eliminar_edicion_completa` (`0025`).
- **Excluye (etapas siguientes):** penalizaciones digitales (P6B), cálculo de
  resultados/empates/publicación y consulta de puntajes post-cierre (P6C), actas
  oficiales PDF/CSV con SHA-256 (P6D).

---

## 2. Diseño físico en PostgreSQL (migración propuesta `0026-cierre-total-edicion.sql`)

### 2.1 Cambios en `edicion`

1. Ampliar `estado` a `('CONFIGURING', 'OPEN', 'CLOSED')` (reemplazando el
   `CHECK` existente de `0006`).
2. Reemplazar el `CHECK ((estado = 'OPEN') = (abierta_en IS NOT NULL))` de `0006`
   por:
   - `CHECK ((estado IN ('OPEN', 'CLOSED')) = (abierta_en IS NOT NULL))`
   *(necesario para conservar `abierta_en` al pasar a `CLOSED`).*
3. Agregar columnas de evidencia del cierre:
   - `cerrada_por text REFERENCES usuario(id) ON DELETE RESTRICT`
   - `cerrada_en timestamptz`
4. Agregar invariante de consistencia:
   - `CHECK ((estado = 'CLOSED') = (cerrada_en IS NOT NULL AND cerrada_por IS NOT NULL))`
   - `CHECK (NOT (estado = 'CLOSED' AND retirada_en IS NOT NULL))`

### 2.2 Función de elegibilidad `motivo_bloqueo_cierre_total(edicion_objetivo uuid)`

Espejo de `motivo_bloqueo_cierre_noche` (`0020`), compartida entre consulta de
estado, `POST` de cierre y trigger de `edicion`:

| Orden | Condición | Motivo devuelto |
|---|---|---|
| 1 | La edición no existe | `edicion_inexistente` |
| 2 | `e.retirada_en IS NOT NULL` | `edicion_retirada` |
| 3 | `e.estado = 'CLOSED'` | `edicion_cerrada` |
| 4 | `e.estado <> 'OPEN'` | `edicion_no_abierta` |
| 5 | No existe ninguna `noche` con `tipo = 'COMPETENCIA' AND cuenta_para_puntaje = true` | `sin_noches_puntuables` |
| 6 | Existe alguna `noche` con `tipo = 'COMPETENCIA' AND estado = 'OPEN'` | `noches_en_votacion` |
| 7 | Existe alguna `noche` con `tipo = 'COMPETENCIA' AND cuenta_para_puntaje = true AND estado <> 'CLOSED'` | `noches_puntuables_pendientes` |
| 8 | Cumple todo | `NULL` (habilitada para cerrar) |

Reglas verificadas por esta tabla:
- Las noches con `tipo = 'PREMIACION'` no bloquean el cierre total.
- Una noche `COMPETENCIA` con `cuenta_para_puntaje = false` bloquea únicamente si
  está `OPEN` (votación en curso); en `DRAFT` o `CLOSED` no bloquea.
- No existe cierre por comparsa separado.

### 2.3 Triggers, auditoría y congelación operativa

1. **`edicion_validar_cambio()` (actualiza la versión de `0025`):**
   - `INSERT`: rechaza `NEW.estado = 'CLOSED'` o `cerrada_por`/`cerrada_en` no
     nulos (`EDICION_NO_CREABLE_CERRADA`); conserva la exigencia de
     `carnavales_servicio_apertura` para `OPEN`.
   - `DELETE`: conserva intacta la excepción `edicion_eliminacion_autorizada(OLD.id)`
     de `0025` para permitir la eliminación completa de ediciones `CLOSED`; fuera
     de esa excepción, solo permite borrar `CONFIGURING`.
   - `UPDATE`:
     - Si `OLD.estado = 'CLOSED'`: rechaza cualquier modificación (`EDICION_CERRADA`),
       garantizando irreversibilidad total.
     - Si `OLD.estado = 'OPEN' AND NEW.estado = 'CLOSED'`:
       - rechaza si `OLD.retirada_en IS NOT NULL` o `NEW.retirada_en IS NOT NULL`
         (`EDICION_RETIRADA`);
       - exige que solo cambien `estado`, `cerrada_por` y `cerrada_en`
         (`EDICION_INMODIFICABLE_EN_CIERRE`);
       - exige rol `ESCRIBANO` en `usuario_rol` con `FOR SHARE OF ur`
         (`CIERRE_REQUIERE_ESCRIBANO`);
       - verifica `motivo_bloqueo_cierre_total(OLD.id) IS NULL`
         (`CIERRE_TOTAL_BLOQUEADO`);
       - fija `NEW.cerrada_en := clock_timestamp()`.
     - Rechaza `OPEN → CONFIGURING` (`EDICION_NO_REABRIBLE`) y cualquier cambio
       de `cerrada_por`/`cerrada_en` fuera de `OPEN → CLOSED`
       (`EVIDENCIA_CIERRE_INMODIFICABLE`).

2. **`validar_retiro_edicion()` (actualiza la versión de `0025`):**
   - Si `NEW.retirada_en IS NOT NULL AND OLD.estado = 'CLOSED'`, rechaza con
     `EDICION_CERRADA` (el retiro aplica a ediciones `CONFIGURING` u `OPEN`,
     mientras que una edición `CLOSED` ya finalizó su votación y pasa a la etapa
     de resultados/actas; su baja física sigue disponible vía
     `eliminar_edicion_completa`).

3. **Auditoría automática (`edicion_auditar_cierre_trg`):**
   - `AFTER UPDATE OF estado ON edicion FOR EACH ROW WHEN (OLD.estado = 'OPEN' AND NEW.estado = 'CLOSED')`
   - Inserta en `auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)`
     con `(NEW.cerrada_por, 'votacion_cerrada', 'edicion', NEW.id, NEW.id)`.
   - Al llevar `edicion_id = NEW.id`, `eliminar_edicion_completa` (`0025`) purga
     también esta constancia si el Administrador elimina la edición completa.

4. **Congelación operativa (`exigir_edicion_operativa` y `proteger_retiro_en_cambio_de_noche`):**
   - Actualizar `exigir_edicion_operativa(identificador uuid)` para consultar
     `estado, retirada_en` con `FOR SHARE`:
     - si `retirada_en IS NOT NULL` → `RAISE EXCEPTION 'EDICION_RETIRADA'`
     - si `estado = 'CLOSED'` → `RAISE EXCEPTION 'EDICION_CERRADA'`
   - Con esto quedan congeladas automáticamente todas las tablas de configuración,
     noches, asignaciones, suplentes, borradores y `planilla_recibida` que ya
     ejecutan `a_edicion_operativa_trg` / `z_edicion_operativa_trg`.
   - En `proteger_retiro_en_cambio_de_noche()`, invocar también
     `exigir_edicion_operativa(NEW.edicion_id)` antes del `UPDATE edicion` de
     apertura de noche, asegurando bloqueo determinístico ante `CLOSED`.
   - **Nota para P6C/P6D:** las tablas futuras de resultados, resoluciones de
     empates y actas oficiales no usarán `exigir_edicion_operativa`; validarán
     expresamente `edicion.estado = 'CLOSED' AND edicion.retirada_en IS NULL`.

### 2.4 Concurrencia y orden de bloqueos (anti-deadlock)

La transacción de cierre total adquiere bloqueos en el mismo orden canónico que
`apertura-noche.js`, `escribano.js` (cierre de noche) y `eliminar_edicion_completa`
(`0025`):

1. `SELECT id FROM noche WHERE edicion_id = $1 ORDER BY id FOR SHARE`
2. `SELECT id, estado, cerrada_en, retirada_en FROM edicion WHERE id = $1 FOR UPDATE`

Este orden `noche (por id) → edicion` evita inversiones de bloqueo (`40P01`)
frente a aperturas/creaciones de noche, cierres de noche, retiros y
eliminaciones concurrentes, y serializa el `UPDATE edicion` frente a aperturas
en `REPEATABLE READ`.

---

## 3. Contrato de API (`/api/escribano`)

Todas las rutas exigen sesión activa con rol `ESCRIBANO` (`401` sin sesión,
`403` sin rol), validación UUID de `:edicionId` (`404 edicion_inexistente` si
está mal formado, siguiendo `identificadores.js`) y devuelven
`Cache-Control: no-store`. Ninguna respuesta incluye puntajes numéricos ni
conteos (`D15`).

### 3.1 `GET /api/escribano/ediciones`

Lista ediciones visibles para el cierre total (`retirada_en IS NULL`), ordenadas
por `anio DESC, id`.

Respuesta `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "nombre": "Carnavales 2027",
      "anio": 2027,
      "estado": "OPEN",
      "cerradaEn": null
    }
  ]
}
```

### 3.2 `GET /api/escribano/ediciones/:edicionId/cierre`

Consulta si la edición cumple los requisitos para el cierre total, sin modificar
estado.

- `404 { "error": "edicion_inexistente", "mensaje": "..." }` si no existe o está
  retirada.
- `200`:

```json
{
  "edicionId": "uuid",
  "estado": "OPEN",
  "puedeCerrar": true,
  "motivo": null,
  "cerradaEn": null
}
```

Cuando `estado` es `"CLOSED"`, devuelve `puedeCerrar: false`,
`motivo: "edicion_cerrada"` y `cerradaEn` en formato ISO-8601.

### 3.3 `POST /api/escribano/ediciones/:edicionId/cierre`

Ejecuta el cierre total de la votación.

- Requiere `Content-Type: application/json` y cuerpo `{ "confirmar": true }`.
  En caso contrario devuelve `400 { "error": "confirmacion_cierre_requerida" }`.
- `404 { "error": "edicion_inexistente", "mensaje": "..." }` si no existe.
- `409 { "error": "edicion_retirada", "mensaje": "..." }` si está retirada.
- `409 { "error": "<motivo>" }` si `motivo_bloqueo_cierre_total` devuelve un
  bloqueo distinto de `edicion_cerrada` (`edicion_no_abierta`,
  `sin_noches_puntuables`, `noches_en_votacion`, `noches_puntuables_pendientes`).
- **Idempotencia:** si la edición ya está `CLOSED`, responde `200` con el mismo
  `cerradaEn` original sin ejecutar `UPDATE` ni duplicar `votacion_cerrada` en
  `auditoria`.
- Respuesta `200`:

```json
{
  "edicionId": "uuid",
  "estado": "CLOSED",
  "cerradaEn": "2026-11-24T12:00:00.000Z"
}
```

### 3.4 Compatibilidad en rutas existentes

- `manejo-errores.js`: mapear `EDICION_CERRADA` (`23514`) a `409` con
  `{ error: "edicion_cerrada", mensaje: "La edición ya cerró su votación y no admite cambios operativos." }`.
- `recepcion-planillas.js`: conservar acuse idempotente para reintentos con el
  mismo `operationId` y mismo hash de una planilla ya recibida; rechazar
  cualquier planilla nueva sobre una edición `CLOSED`.
- `ediciones.js` (listado admin): devolver `estado: "CLOSED"` y `cerradaEn`
  cuando corresponda, manteniendo disponible la eliminación completa de una
  edición `CLOSED`.

---

## 4. Interfaz de usuario (cliente)

- **`PanelEscribano.jsx`:** agregar sección **Cierre total de la votación**
  separada de **Cierre de noche**:
  - lista ediciones y permite seleccionar una;
  - consulta `GET /api/escribano/ediciones/:edicionId/cierre` y muestra estado o
    motivo de bloqueo en español;
  - botón **Actualizar estado** y botón **Cerrar votación completa** (habilitado
    solo cuando `puedeCerrar === true`);
  - modal de confirmación explícita advirtiendo que la acción es irreversible,
    bloquea nuevas noches/votos y habilita la etapa de resultados.
- **Panel de Administración (`Ediciones`):** mostrar etiqueta «Votación cerrada»
  para `estado === "CLOSED"`, deshabilitar mutaciones operativas/apertura y
  conservar la acción de eliminación completa (con su modal de advertencia).

---

## 5. Pruebas obligatorias antes de dar P6A por terminado

1. **Integridad en PostgreSQL descartable (`0026`):**
   - transición válida `OPEN → CLOSED` solo por `ESCRIBANO`, registrando
     `cerrada_por`, `cerrada_en` y evento `votacion_cerrada` en `auditoria`;
   - rechazo de cierre en `CONFIGURING`, `retirada`, sin noches puntuables, con
     noche `COMPETENCIA` en `OPEN` (puntuable o no) o con noche puntuable en
     `DRAFT`;
   - permiso cuando existen noches `PREMIACION` (`DRAFT`/`OPEN`) o noches
     `COMPETENCIA` no puntuables en `DRAFT`/`CLOSED`;
   - irreversibilidad (`CLOSED → OPEN/CONFIGURING`, mutación de `cerrada_en` y
     retiro tras `CLOSED` rechazados);
   - congelación operativa tras `CLOSED` (crear/abrir noche, asignar jurado,
     recibir planilla nueva);
   - compatibilidad de `eliminar_edicion_completa` (`0025`) sobre una edición
     `CLOSED` (elimina edición y su auditoría `votacion_cerrada`).
2. **Concurrencia real en PostgreSQL:**
   - cierre total en paralelo con apertura de noche, creación de noche, cierre
     de última noche y eliminación completa sin deadlocks (`40P01`).
3. **API y RBAC:**
   - `401`, `403` (`ADMINISTRADOR` y `JURADO`), `400` sin confirmación, `404`,
     `409` por cada motivo, idempotencia de `POST` repetido sin duplicar
     auditoría, y ausencia total de puntajes o conteos en las respuestas.
4. **Cliente:**
   - renderizado de bloqueos, botón deshabilitado cuando no puede cerrar, modal
     de confirmación y transición a estado cerrado en `PanelEscribano`.
