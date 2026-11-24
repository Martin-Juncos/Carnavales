# Diseño físico y contrato API: penalizaciones digitales (P6B)

**Estado:** aprobado e implementado en P6B (`0027-penalizaciones.sql`).
Para el contrato vigente de los endpoints, consultar [penalizaciones-api.md](penalizaciones-api.md).

**Base aprobada:** `AGENTS.md` §2 y §7, decisión `D14` (2026-11-24) en
[decision-questions.md](decision-questions.md) y congelación operativa por
cierre total ([cierre-total-api.md](cierre-total-api.md)).

---

## 1. Alcance y límites

P6B permite al `ESCRIBANO` registrar y anular penalizaciones reglamentarias como
evidencia separada de la evaluación artística del jurado, habilitadas mientras
la edición está `OPEN` y congeladas definitivamente al ejecutar el cierre total
(`CLOSED`).

- **Incluye:** tabla append-only `penalizacion`, cálculo determinístico del
  descuento en base de datos, idempotencia por `operation_id`, auditoría atómica
  (`penalizacion_registrada` y `penalizacion_anulada`), compatibilidad con
  `eliminar_edicion_completa` (`0025`), endpoints `/api/escribano/...` y sección
  **Penalizaciones** en `PanelEscribano`.
- **Excluye:** aplicación efectiva de los descuentos sobre el escrutinio final
  (P6C — cálculo de resultados) y emisión de actas PDF/CSV (P6D). Las
  penalizaciones nunca modifican ni leen `puntaje_recibido`.

---

## 2. Catálogo reglamentario v1 (`D14`)

| `tipo` | `minutos` | `rubro_version_id` | Efecto calculado |
|---|---|---|---|
| `RETRASO_INGRESO` | Entero `> 0` (obligatorio) | `NULL` | `0,50` pts/min con tope de `30` min (`15,00` pts máx.). Si `minutos > 30`, marca `cedio_turno = true`. Descuenta del puntaje general de comparsa. |
| `RETRASO_SALIDA` | Entero `> 0` (obligatorio) | `NULL` | `0,50` pts/min (`ROUND(minutos * 0.50, 2)`), `cedio_turno = false`. Descuenta del puntaje general de comparsa. |
| `EXCESO_SHOW_BATERIA` | Entero `> 0` (obligatorio) | Obligatorio (`NOT NULL`, rubro evaluable de la versión congelada/activa de esa edición) | `0,50` pts/min (`ROUND(minutos * 0.50, 2)`), `cedio_turno = false`. En P6C se descuenta específicamente de ese rubro. |
| `MINIMO_INTEGRANTES` | `NULL` | `NULL` | `puntos_descuento = 0.00`, `impide_premios_comparsa = true`. Impide puntuar para premios de comparsa sin afectar premios individuales. |

---

## 3. Diseño físico en PostgreSQL (migración propuesta `0027-penalizaciones.sql`)

### 3.1 Tabla `penalizacion`

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | `PRIMARY KEY DEFAULT gen_random_uuid()` |
| `operation_id` | `uuid` | `NOT NULL UNIQUE` (clave de idempotencia generada en cliente) |
| `edicion_id` | `uuid` | `NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT` |
| `noche_id` | `uuid` | `NOT NULL`, `FOREIGN KEY (noche_id, edicion_id) REFERENCES noche (id, edicion_id) ON DELETE RESTRICT` |
| `comparsa_id` | `uuid` | `NOT NULL`, `FOREIGN KEY (comparsa_id, edicion_id) REFERENCES comparsa (id, edicion_id) ON DELETE RESTRICT` |
| `rubro_version_id` | `uuid` | `NULL`, `FOREIGN KEY (rubro_version_id, edicion_id) REFERENCES rubro_version (id, edicion_id) ON DELETE RESTRICT` |
| `tipo` | `text` | `NOT NULL CHECK (tipo IN ('RETRASO_INGRESO', 'RETRASO_SALIDA', 'EXCESO_SHOW_BATERIA', 'MINIMO_INTEGRANTES'))` |
| `minutos` | `integer` | `CHECK (minutos IS NULL OR minutos > 0)` |
| `puntos_descuento` | `numeric(6,2)` | `NOT NULL CHECK (puntos_descuento >= 0)` |
| `cedio_turno` | `boolean` | `NOT NULL DEFAULT false` |
| `impide_premios_comparsa` | `boolean` | `NOT NULL DEFAULT false` |
| `motivo` | `text` | `NOT NULL CHECK (length(btrim(motivo)) > 0)` |
| `referencia_acta` | `text` | `NOT NULL CHECK (length(btrim(referencia_acta)) > 0)` |
| `estado` | `text` | `NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'ANULADA'))` |
| `registrada_por` | `text` | `NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT` |
| `registrada_en` | `timestamptz` | `NOT NULL DEFAULT clock_timestamp()` |
| `anulada_por` | `text` | `REFERENCES usuario (id) ON DELETE RESTRICT` |
| `anulada_en` | `timestamptz` | `NULL` |
| `motivo_anulacion` | `text` | `CHECK (motivo_anulacion IS NULL OR length(btrim(motivo_anulacion)) > 0)` |
| `referencia_acta_anulacion` | `text` | `CHECK (referencia_acta_anulacion IS NULL OR length(btrim(referencia_acta_anulacion)) > 0)` |

Invariantes `CHECK` en tabla:
- Coherencia por tipo:
  - `RETRASO_INGRESO`: `minutos IS NOT NULL AND rubro_version_id IS NULL AND NOT impide_premios_comparsa AND cedio_turno = (minutos > 30) AND puntos_descuento = (LEAST(minutos, 30) * 0.50)::numeric(6,2)`
  - `RETRASO_SALIDA`: `minutos IS NOT NULL AND rubro_version_id IS NULL AND NOT impide_premios_comparsa AND NOT cedio_turno AND puntos_descuento = (minutos * 0.50)::numeric(6,2)`
  - `EXCESO_SHOW_BATERIA`: `minutos IS NOT NULL AND rubro_version_id IS NOT NULL AND NOT impide_premios_comparsa AND NOT cedio_turno AND puntos_descuento = (minutos * 0.50)::numeric(6,2)`
  - `MINIMO_INTEGRANTES`: `minutos IS NULL AND rubro_version_id IS NULL AND impide_premios_comparsa AND NOT cedio_turno AND puntos_descuento = 0.00`
- Consistencia de anulación:
  - `(estado = 'ANULADA') = (anulada_por IS NOT NULL AND anulada_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND referencia_acta_anulacion IS NOT NULL)`

Índices:
- `penalizacion_edicion_noche_idx (edicion_id, noche_id, registrada_en DESC)`
- `penalizacion_comparsa_idx (edicion_id, comparsa_id)`

### 3.2 Triggers, auditoría y congelación

1. **Trigger `penalizacion_validar_cambio_trg` (`BEFORE INSERT OR UPDATE OR DELETE`):**
   - `DELETE`: permitido únicamente si `edicion_eliminacion_autorizada(OLD.edicion_id)`;
     de lo contrario rechaza con `PENALIZACION_NO_BORRABLE`.
   - `UPDATE`: valida primero la inmutabilidad (`OLD.estado = 'ACTIVA' AND NEW.estado = 'ANULADA'` y columnas originales intactas → `PENALIZACION_INMODIFICABLE`).
   - Orden canónico de bloqueos: adquiere `noche FOR SHARE` primero y luego invoca
     `exigir_edicion_operativa(NEW.edicion_id)` (`edicion FOR SHARE`), bloqueando
     automáticamente ediciones `CLOSED` (`EDICION_CERRADA`) o retiradas
     (`EDICION_RETIRADA`) sin inversión de bloqueos frente a aperturas o cierres.
   - `INSERT`:
     - exige `NEW.estado = 'ACTIVA'`, `anulada_por IS NULL`, `anulada_en IS NULL`,
       `motivo_anulacion IS NULL`, `referencia_acta_anulacion IS NULL`
       (`PENALIZACION_DEBE_CREARSE_ACTIVA`);
     - exige `edicion.estado = 'OPEN'` (`EDICION_NO_ABIERTA`);
     - exige `noche.tipo = 'COMPETENCIA'` y `noche.estado IN ('OPEN', 'CLOSED')`
       (`NOCHE_NO_PENALIZABLE`);
     - exige que la comparsa tenga participación programada (`orden_presentacion`
       con `estado = 'SCHEDULED'`) en esa noche (`COMPARSA_NO_PROGRAMADA_EN_NOCHE`);
     - si `NEW.rubro_version_id IS NOT NULL`, exige que pertenezca a la versión
       congelada/activa de la edición y sea evaluable (`RUBRO_PENALIZACION_INVALIDO`);
     - exige que `NEW.registrada_por` tenga rol `ESCRIBANO` (`FOR SHARE OF ur`,
       `PENALIZACION_REQUIERE_ESCRIBANO`);
     - fija `NEW.registrada_en := clock_timestamp()`.
   - `UPDATE` (continuación):
     - exige que `NEW.anulada_por` tenga rol `ESCRIBANO` (`FOR SHARE OF ur`,
       `PENALIZACION_REQUIERE_ESCRIBANO`);
     - fija `NEW.anulada_en := clock_timestamp()`.

2. **Trigger `penalizacion_impedir_truncate_trg` (`BEFORE TRUNCATE FOR EACH STATEMENT`):**
   - Impide `TRUNCATE penalizacion` con `PENALIZACION_NO_BORRABLE` (coherente con
     el resto de las tablas append-only del esquema).

3. **Auditoría automática (`penalizacion_auditar_trg`):**
   - `AFTER INSERT` → inserta `(NEW.registrada_por, 'penalizacion_registrada', 'penalizacion', NEW.id, NEW.edicion_id)` en `auditoria`.
   - `AFTER UPDATE OF estado WHEN (OLD.estado = 'ACTIVA' AND NEW.estado = 'ANULADA')` → inserta `(NEW.anulada_por, 'penalizacion_anulada', 'penalizacion', NEW.id, NEW.edicion_id)` en `auditoria`.

4. **Compatibilidad con `0025` (`eliminar_edicion_completa`):**
   - Actualizar `auditoria_atribuible_a_edicion` para reconocer `tipo = 'penalizacion'`.
   - Actualizar `eliminar_edicion_completa` para ejecutar `DELETE FROM penalizacion WHERE edicion_id = objetivo` antes de borrar `rubro_version`, `comparsa` y `noche`.
   - Otorgar `GRANT SELECT, DELETE ON penalizacion TO carnavales_propietario_eliminacion`.

### 3.3 Concurrencia y orden de bloqueos (anti-deadlock)

- Registro (`POST /penalizaciones`):
  1. `pg_advisory_xact_lock(hashtextextended('penalizacion:' || $operationId, 0))` para serializar reintentos concurrentes con el mismo `operationId`.
  2. `SELECT id, tipo, estado FROM noche WHERE id = $1 AND edicion_id = $2 FOR SHARE`.
  3. `SELECT id, estado, retirada_en FROM edicion WHERE id = $1 FOR SHARE`.
- Anulación (`POST /penalizaciones/:id/anular`):
  1. `SELECT id FROM noche WHERE id = $1 FOR SHARE`.
  2. `SELECT id, estado, retirada_en FROM edicion WHERE id = $1 FOR SHARE`.
  3. `SELECT * FROM penalizacion WHERE id = $1 AND edicion_id = $2 FOR UPDATE`.

Este orden coincide exactamente con apertura de noche, cierre de noche, cierre
total (`FOR SHARE` en `noche` → `FOR UPDATE` en `edicion`), recepción de
planillas y eliminación completa, evitando `40P01`.

---

## 4. Contrato de API (`/api/escribano`)

Todas las rutas exigen sesión activa con rol `ESCRIBANO` (`401` sin sesión,
`403` sin rol), validación UUID de `:edicionId` / `:penalizacionId` (`404` si
está mal formado, siguiendo `identificadores.js`) y devuelven
`Cache-Control: no-store`. Ninguna respuesta incluye puntajes de jurados (`D15`).

### 4.1 `GET /api/escribano/ediciones/:edicionId/penalizaciones/contexto`

Devuelve los catálogos necesarios para cargar una penalización:
- `edicion`: `{ id, nombre, anio, estado }`
- `noches`: noches `COMPETENCIA` en `OPEN` o `CLOSED`, cada una con `id`, `orden`,
  `nombre`, `estado` y `comparsas: [{ id, nombre, categoria }]` (solo `SCHEDULED`).
- `rubros`: rubros evaluables de la versión congelada/publicada de la edición
  (`[{ id, codigo, nombre, tipoSujeto }]`), usados al elegir `EXCESO_SHOW_BATERIA`.

`404 edicion_inexistente` si no existe o está retirada.

### 4.2 `GET /api/escribano/ediciones/:edicionId/penalizaciones`

Lista todas las penalizaciones (activas y anuladas) de la edición, ordenadas por
`registrada_en DESC, id`.

`404 edicion_inexistente` si no existe o está retirada.

Respuesta `200`:

```json
{
  "items": [
    {
      "id": "uuid",
      "operationId": "uuid",
      "edicionId": "uuid",
      "noche": { "id": "uuid", "nombre": "Primera noche", "orden": 1 },
      "comparsa": { "id": "uuid", "nombre": "Aymara" },
      "rubro": null,
      "tipo": "RETRASO_INGRESO",
      "minutos": 35,
      "puntosDescuento": 15,
      "cedioTurno": true,
      "impidePremiosComparsa": false,
      "motivo": "Ingreso demorado por falla técnica de carroza",
      "referenciaActa": "Acta Comisión N.º 12",
      "estado": "ACTIVA",
      "registradaEn": "2026-11-24T12:00:00.000Z",
      "anulacion": null
    }
  ]
}
```

Cuando `estado === "ANULADA"`, `anulacion` contiene `{ anuladaEn, motivo, referenciaActa }`.

### 4.3 `POST /api/escribano/ediciones/:edicionId/penalizaciones`

Registra una penalización nueva. Requiere `Content-Type: application/json` y:

```json
{
  "operationId": "uuid",
  "nocheId": "uuid",
  "comparsaId": "uuid",
  "tipo": "RETRASO_INGRESO",
  "minutos": 12,
  "rubroVersionId": null,
  "motivo": "...",
  "referenciaActa": "Acta N.º 4",
  "confirmar": true
}
```

- `400 confirmacion_requerida` si `confirmar !== true` o no es JSON.
- `400 campos_invalidos` / `422 penalizacion_invalida` si faltan campos
  requeridos o los minutos/rubro no coinciden con el tipo.
- `404 edicion_inexistente` si no existe la edición; `404 noche_inexistente` /
  `comparsa_inexistente` si no pertenecen a la edición.
- `409 edicion_cerrada` / `edicion_retirada` / `edicion_no_abierta` /
  `noche_no_penalizable` / `comparsa_no_programada_en_noche` /
  `rubro_penalizacion_invalido`.
- **Idempotencia:**
  - Mismo `operationId` con el mismo contenido (y edición/noche/comparsa/tipo/minutos/rubro/motivo/acta) → `200` devolviendo la penalización ya registrada (sin duplicar auditoría).
  - Mismo `operationId` con contenido distinto → `409 operacion_conflictiva`.
- Nueva penalización → `201` con el objeto creado.

### 4.4 `POST /api/escribano/ediciones/:edicionId/penalizaciones/:penalizacionId/anular`

Anula lógicamente una penalización activa (append-only). Requiere JSON:

```json
{
  "motivoAnulacion": "Rectificación por acta complementaria",
  "referenciaActaAnulacion": "Acta Comisión N.º 15",
  "confirmar": true
}
```

- `400 confirmacion_requerida` sin `{ confirmar: true }`.
- `400 campos_invalidos` si falta motivo o referencia de acta.
- `404 penalizacion_inexistente` si no existe en esa edición.
- `409 edicion_cerrada` / `edicion_retirada` si la edición ya cerró o se retiró.
- `409 penalizacion_ya_anulada` si ya estaba anulada con otros datos (`200` idempotente si coincide motivo y acta).
- `200` con el objeto actualizado (`estado: "ANULADA"` y `anulacion`).

---

## 5. Interfaz en `PanelEscribano.jsx`

Nueva sección **Penalizaciones** dentro del panel del Escribano:
- Selector de edición (reutilizando `GET /api/escribano/ediciones`).
- Listado de penalizaciones registradas (activas y anuladas) con estado visual,
  noche, comparsa, tipo, efecto/descuento, motivo y acta.
- Formulario de registro (visible solo cuando `edicion.estado === "OPEN"`), con
  previsualización del descuento calculado y **modal de confirmación explícita**
  antes de enviar (`operationId` estable por intento para evitar duplicados ante
  reintentos).
- Acción **Anular** por fila activa (solo con edición `OPEN`), con **modal de
  confirmación** que exige motivo y referencia de acta.
- Si la edición está `CLOSED`, aviso claro de solo lectura («Las penalizaciones
  quedaron congeladas por el cierre total»).

---

## 6. Pruebas obligatorias

1. **PostgreSQL (`0027`):** cálculo exacto y `CHECK` por los 4 tipos (incluido
   tope de 30 min y `cedio_turno` en `RETRASO_INGRESO`), rol `ESCRIBANO`,
   rechazo en `DRAFT`/`PREMIACION`/comparsa no programada/`edicion` `CONFIGURING`/`CLOSED`/`retirada`,
   inmutabilidad de datos originales, prohibición de `DELETE` ordinario,
   auditoría atómica (`penalizacion_registrada` y `penalizacion_anulada`), y
   limpieza completa mediante `eliminar_edicion_completa` (`0025`).
2. **API, idempotencia y concurrencia:** RBAC (`401`/`403`), confirmación
   explícita (`400`), reintento idempotente con mismo `operationId` (`200`),
   conflicto con distinto contenido (`409 operacion_conflictiva`), anulación,
   congelación tras cierre total, y carrera concurrente de registro/anulación
   contra cierre total sin deadlocks (`40P01`).
3. **Cliente:** carga de catálogo y listado, alta con previsualización y modal
   de confirmación, anulación con modal, y modo solo lectura cuando la edición
   está `CLOSED`.
