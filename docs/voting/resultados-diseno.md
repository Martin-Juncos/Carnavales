# Diseño físico y contrato API: cálculo de resultados, empates y publicación (P6C)

**Estado:** aprobado e implementado en P6C (`0028-resultados-publicacion.sql`).
Para el contrato vigente de los endpoints, consultar [resultados-api.md](resultados-api.md).

**Base aprobada:** `AGENTS.md` §2 y §7, decisiones `D6/R9`, `D13`, `D14`, `D15`,
`D16`, `D22`, `D24`, `D25` y `R1` en [decision-questions.md](decision-questions.md),
cierre total ([cierre-total-api.md](cierre-total-api.md)) y penalizaciones
([penalizaciones-api.md](penalizaciones-api.md)).

---

## 1. Alcance y límites

P6C implementa el motor de cálculo v1 sobre ediciones cerradas (`CLOSED`), los
snapshots inmutables de resultados, la resolución manual auditada de empates,
la publicación oficial y la consulta de resultados/puntajes detallados para
`ESCRIBANO` y `ADMINISTRADOR`.

- **Incluye:** tablas inmutables `calculo_resultado`, `resultado_comparsa`,
  `resultado_rubro_sujeto` y `empate_resultado`; motor determinístico v1
  (base Goya 2026 + reglas confirmadas parametrizadas por snapshot); endpoints
  de operación para `ESCRIBANO` y consulta post-cierre para
  `ESCRIBANO`/`ADMINISTRADOR`; compatibilidad con `eliminar_edicion_completa`
  (`0025`); y panel de resultados/empates/publicación en cliente.
- **Excluye:** emisión de actas oficiales PDF y CSV con hash SHA-256 (P6D) e
  impugnaciones digitales (`D17`, diferido post-v1).
- **Invariante `D15`:** ningún endpoint de P6C entrega puntajes numéricos ni
  permite calcular antes del cierre total (`409 edicion_no_cerrada`). El rol
  `JURADO` nunca accede a puntajes ajenos ni al escrutinio (`403`).

---

## 2. Reglas de cálculo del motor v1 (`R1`, `D24`, `D6/R9`, `D14`, `D25`, `A10`)

### 2.1 Entradas válidas
- **Edición:** `edicion.estado = 'CLOSED'` y `edicion.retirada_en IS NULL`.
- **Noches computables (`D13`):** noches con `tipo = 'COMPETENCIA'`,
  `cuenta_para_puntaje = true` y `estado = 'CLOSED'`.
- **Planillas y votos:** `puntaje_recibido` de `planilla_recibida` asociadas a
  obligaciones oficiales de la instantánea de esas noches (incluido el relevo
  activo en `suplentes_asignacion_jurado`), para la versión congelada de la
  edición.
- **Penalizaciones (`D14`):** `penalizacion` con `estado = 'ACTIVA'` de la
  edición pertenecientes a las noches computables.
- **Parámetros congelados en cada snapshot (`parametros` JSONB):**
  - `maxCarrosComparsa`: `2` por defecto (`D24`, editable al calcular si un
    reglamento futuro cambia el tope).
  - `categoriasGenerales`: `["PRIMERA"]` por defecto (`A10`: `AGRUPACION`
    compite solo en premios individuales/aleatorios).
- **Huella criptográfica (`hash_entradas`):** SHA-256 sobre la serialización
  canónica de versión, parámetros, planillas/puntajes y penalizaciones activas
  usadas para generar el snapshot.

### 2.2 Cálculo por sujeto y rubro (`D6/R9`, `D25`, `D14`)
1. **Rubros hoja** (`evaluable = true`, sin hijos): para cada
   `(sujeto_id, rubro_version_id)`, se suman todos los `puntaje_recibido.valor`
   recibidos en todas las especialidades y noches computables (sin descarte de
   máxima ni mínima).
2. **Rubros padre** (`D25` / `AGENTS.md` §2): si un rubro tiene subítems
   (`padre_id`), no recibe notas directas y su puntaje es la suma de sus hijos
   evaluables.
3. **Descuento por `EXCESO_SHOW_BATERIA` (`D14`):** las penalizaciones activas
   de tipo `EXCESO_SHOW_BATERIA` para `(comparsa_id, rubro_version_id)`
   descuentan `puntos_descuento` sobre ese rubro de la comparsa (con piso
   `0.00` en el puntaje neto del rubro, conservando intacto el puntaje
   artístico original).
4. **Ranking por rubro (premios individuales y grupales):** por cada rubro
   evaluable se ordenan los sujetos por `puntaje_neto DESC`. Una penalización
   `MINIMO_INTEGRANTES` **no** excluye a los sujetos de esa comparsa de los
   premios individuales/por rubro (`D14`).

### 2.3 Resultado general de comparsas (`D24`, `A10`, `D14`)
Participan las comparsas activas cuya categoría esté en `categoriasGenerales`
(`PRIMERA` por defecto).
- Si la comparsa tiene una penalización activa `MINIMO_INTEGRANTES`, se marca
  `descalificada_comparsa = true` (conserva su desglose artístico pero queda
  fuera de los puestos de comparsa).
- Solo entran rubros evaluables de nivel raíz con `suma_a_comparsa = true`:
  1. **Rubros fijos** (`tipo_rubro IS NULL` y `tipo_sujeto <> 'CARRO'`): suma de
     todos sus puntajes netos para la comparsa.
  2. **Carros alegóricos** (`tipo_sujeto = 'CARRO'`): para cada sujeto `CARRO`
     de la comparsa se suman sus rubros evaluables con `suma_a_comparsa = true`,
     y se contabilizan únicamente los `maxCarrosComparsa` (`2`) carros de mayor
     puntaje (`D24`).
  3. **Rubros nominativos** (`tipo_rubro = 'NOMINATIVO'` y
     `tipo_sujeto <> 'CARRO'`): por cada `(comparsa, rubro)` cuenta únicamente
     el mayor puntaje neto entre los sujetos de esa comparsa en ese rubro
     (`D24`).
  4. **Rubros aleatorios** (`tipo_rubro = 'ALEATORIO'`): no suman al resultado
     general de comparsa (`A10`/`H16`).
  5. **Descuentos generales (`D14`):** se restan las penalizaciones activas
     `RETRASO_INGRESO` y `RETRASO_SALIDA` de la comparsa (con piso `0.00` en
     `puntaje_total`, mostrando el desglose exacto de artístico y descuentos).

### 2.4 Detección y resolución de empates (`D16`)
- Al crear un snapshot, el motor detecta empates en el **primer puesto
  (`posicion = 1`)** del ranking general de comparsas (entre comparsas no
  descalificadas) y en el **primer puesto (`posicion = 1`)** de cada rubro raíz
  evaluable (`padre_id IS NULL`) con más de un candidato empatado en cabeza.
- Cada empate detectado genera un registro en `empate_resultado` en estado
  `'PENDIENTE'` con la lista congelada de candidatos empatados.
- El `ESCRIBANO` resuelve manualmente cada empate seleccionando uno de los
  candidatos empatados e ingresando `motivo_resolucion` y `referencia_acta`
  obligatorios (sin alterar votos ni puntajes).
- La publicación oficial del snapshot se bloquea (`409 empates_pendientes`)
  mientras exista al menos un empate `'PENDIENTE'`.

---

## 3. Diseño físico en PostgreSQL (migración implementada `0028-resultados-publicacion.sql`)

### 3.1 Tablas

1. **`calculo_resultado`** (cabecera del snapshot):
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `edicion_id uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT`
   - `version_reglamento_id uuid NOT NULL`, `FOREIGN KEY (version_reglamento_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT`
   - `numero integer NOT NULL CHECK (numero > 0)`, `UNIQUE (edicion_id, numero)`, `UNIQUE (id, edicion_id)`
   - `algoritmo text NOT NULL DEFAULT 'GOYA_2026_V1'`
   - `parametros jsonb NOT NULL`
   - `hash_entradas text NOT NULL CHECK (hash_entradas ~ '^[0-9a-f]{64}$')`
   - `estado text NOT NULL DEFAULT 'CALCULADO' CHECK (estado IN ('CALCULADO', 'PUBLICADO'))`
   - `calculado_por text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT`
   - `calculado_en timestamptz NOT NULL DEFAULT clock_timestamp()`
   - `transaccion_creacion xid8 NOT NULL DEFAULT pg_current_xact_id()` (columna interna de integridad: las filas de resultado solo se insertan en la misma transacción que crea el snapshot).
   - `publicado_por text REFERENCES usuario (id) ON DELETE RESTRICT`
   - `publicado_en timestamptz`
   - `CHECK ((estado = 'PUBLICADO') = (publicado_por IS NOT NULL AND publicado_en IS NOT NULL))`
   - Índice único parcial: `UNIQUE (edicion_id) WHERE estado = 'PUBLICADO'` (una sola publicación oficial vigente por edición).

2. **`resultado_comparsa`** (detalle inmutable del ranking general por snapshot):
   - `calculo_id uuid NOT NULL`, `edicion_id uuid NOT NULL`, `comparsa_id uuid NOT NULL`
   - `PRIMARY KEY (calculo_id, comparsa_id)`
   - `FOREIGN KEY (calculo_id, edicion_id) REFERENCES calculo_resultado (id, edicion_id) ON DELETE RESTRICT`
   - `FOREIGN KEY (comparsa_id, edicion_id) REFERENCES comparsa (id, edicion_id) ON DELETE RESTRICT`
   - `categoria text NOT NULL`, `puntaje_fijos numeric(10,2) NOT NULL`, `puntaje_nominativos numeric(10,2) NOT NULL`, `puntaje_carros numeric(10,2) NOT NULL`, `descuento_rubros numeric(10,2) NOT NULL`, `descuento_general numeric(10,2) NOT NULL`, `puntaje_total numeric(10,2) NOT NULL`, `descalificada_comparsa boolean NOT NULL DEFAULT false`, `posicion integer`, `empatado boolean NOT NULL DEFAULT false`, `detalle jsonb NOT NULL`

3. **`resultado_rubro_sujeto`** (detalle inmutable por rubro y sujeto):
   - `calculo_id uuid NOT NULL`, `edicion_id uuid NOT NULL`, `rubro_version_id uuid NOT NULL`, `sujeto_id uuid NOT NULL`, `comparsa_id uuid NOT NULL`
   - `PRIMARY KEY (calculo_id, rubro_version_id, sujeto_id)`
   - FKs compuestas con `edicion_id` a `calculo_resultado`, `rubro_version`, `sujeto_evaluable` y `comparsa` (`ON DELETE RESTRICT`).
   - `puntaje_artistico numeric(10,2) NOT NULL`, `descuento_rubro numeric(10,2) NOT NULL`, `puntaje_neto numeric(10,2) NOT NULL`, `posicion integer NOT NULL CHECK (posicion > 0)`, `empatado boolean NOT NULL DEFAULT false`

4. **`empate_resultado`** (empates detectados y su resolución manual):
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `calculo_id uuid NOT NULL`, `edicion_id uuid NOT NULL`
   - `FOREIGN KEY (calculo_id, edicion_id) REFERENCES calculo_resultado (id, edicion_id) ON DELETE RESTRICT`
   - `ambito text NOT NULL CHECK (ambito IN ('COMPARSA', 'RUBRO'))`
   - `rubro_version_id uuid`, `FOREIGN KEY (rubro_version_id, edicion_id) REFERENCES rubro_version (id, edicion_id) ON DELETE RESTRICT`
   - `posicion_empatada integer NOT NULL CHECK (posicion_empatada > 0)`
   - `puntaje_empatado numeric(10,2) NOT NULL`
   - `candidatos_ids uuid[] NOT NULL CHECK (cardinality(candidatos_ids) >= 2)`
   - `estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'RESUELTO'))`
   - `ganador_comparsa_id uuid`, `ganador_sujeto_id uuid` (FKs con `edicion_id`)
   - `motivo_resolucion text CHECK (motivo_resolucion IS NULL OR length(btrim(motivo_resolucion)) > 0)`
   - `referencia_acta text CHECK (referencia_acta IS NULL OR length(btrim(referencia_acta)) > 0)`
   - `resuelto_por text REFERENCES usuario (id) ON DELETE RESTRICT`
   - `resuelto_en timestamptz`
   - `CHECK ((ambito = 'COMPARSA') = (rubro_version_id IS NULL))`
   - `CHECK ((estado = 'RESUELTO') = (resuelto_por IS NOT NULL AND resuelto_en IS NOT NULL AND motivo_resolucion IS NOT NULL AND referencia_acta IS NOT NULL AND ((ambito = 'COMPARSA' AND ganador_comparsa_id IS NOT NULL AND ganador_sujeto_id IS NULL) OR (ambito = 'RUBRO' AND ganador_sujeto_id IS NOT NULL AND ganador_comparsa_id IS NULL))))`
   - `CHECK (estado = 'PENDIENTE' OR (ambito = 'COMPARSA' AND ganador_comparsa_id = ANY(candidatos_ids)) OR (ambito = 'RUBRO' AND ganador_sujeto_id = ANY(candidatos_ids)))`

### 3.2 Triggers, auditoría y compatibilidad con `0025`

- **Requisitos de `calculo_resultado`:**
  - `INSERT`: exige `edicion.estado = 'CLOSED' AND edicion.retirada_en IS NULL` (`EDICION_NO_CERRADA` / `EDICION_RETIRADA`), `estado = 'CALCULADO'`, actor `ESCRIBANO` (`RESULTADO_REQUIERE_ESCRIBANO`), y que la edición no tenga ya un snapshot `PUBLICADO` (`RESULTADO_YA_PUBLICADO`).
  - `UPDATE`: solo permite `CALCULADO → PUBLICADO`, exige actor `ESCRIBANO`, prohíbe alterar campos originales, y exige que **no exista ningún `empate_resultado` con `estado = 'PENDIENTE'`** para ese `calculo_id` (`EMPATES_PENDIENTES`). Fija `publicado_en := clock_timestamp()`.
  - `DELETE` / `TRUNCATE`: bloqueados (`RESULTADO_INMODIFICABLE`), salvo `DELETE` bajo `edicion_eliminacion_autorizada(OLD.edicion_id)`.
- **`resultado_comparsa` y `resultado_rubro_sujeto`:** los `INSERT` solo se permiten en la misma transacción que creó el snapshot, con edición cerrada y autor `ESCRIBANO`; luego son estrictamente append-only (`BEFORE UPDATE OR DELETE` + `BEFORE TRUNCATE` bloqueados fuera de `edicion_eliminacion_autorizada`).
- **`empate_resultado`:** los `INSERT` solo se permiten en la misma transacción que creó el snapshot. `UPDATE` permite únicamente `PENDIENTE → RESUELTO` por `ESCRIBANO` mientras el snapshot esté `'CALCULADO'` (nunca tras `'PUBLICADO'`, nunca volver a `'PENDIENTE'`). `BEFORE TRUNCATE` y `DELETE` bloqueados fuera de `edicion_eliminacion_autorizada`.
- **Auditoría atómica (`edicion_id` siempre informado):**
  - `resultado_calculado` (`calculo_resultado` INSERT)
  - `empate_resuelto` (`empate_resultado` `PENDIENTE → RESUELTO`)
  - `resultado_publicado` (`calculo_resultado` `CALCULADO → PUBLICADO`)
- **Compatibilidad `0025`:** actualizar `auditoria_atribuible_a_edicion`, `eliminar_edicion_completa` (borrando las 4 tablas nuevas antes de `penalizacion`/`comparsa`/`rubro_version`/`edicion`) y los `GRANT`/`OWNER`/`search_path` de `carnavales_propietario_eliminacion`.

---

## 4. Contrato de API

Todas las rutas responden con `Cache-Control: no-store`.

### 4.1 Operación exclusiva del Escribano (`/api/escribano`)
- **`POST /api/escribano/ediciones/:edicionId/resultados/calcular`**
  - Requiere `ESCRIBANO` y `{ confirmar: true }` (opcional: `{ maxCarrosComparsa?: number }`).
  - Bloquea `edicion FOR SHARE` + advisory lock por edición para serializar cálculos concurrentes.
  - Si `edicion.estado !== 'CLOSED'` → `409 edicion_no_cerrada`.
  - Si ya existe snapshot publicado → `409 resultado_ya_publicado`.
  - Ejecuta el motor v1 en una única transacción, inserta nuevo snapshot (`numero = max + 1`), sus tablas detalle y empates detectados, y responde `201` con el snapshot completo.
- **`POST /api/escribano/ediciones/:edicionId/resultados/:calculoId/empates/:empateId/resolver`**
  - Requiere `ESCRIBANO` y `{ ganadorId, motivoResolucion, referenciaActa, confirmar: true }`.
  - Valida que `ganadorId` esté en `candidatos_ids`, registra la resolución en transacción y responde `200` (idempotente si se repite con el mismo ganador, motivo y acta; `409 empate_ya_resuelto` si difiere).
- **`POST /api/escribano/ediciones/:edicionId/resultados/:calculoId/publicar`**
  - Requiere `ESCRIBANO` y `{ confirmar: true }`.
  - Bloquea si hay empates pendientes (`409 empates_pendientes`) o si otro snapshot ya está publicado (`409 resultado_ya_publicado`); idempotente (`200`) si ese mismo snapshot ya está `PUBLICADO`.

### 4.2 Consulta post-cierre (`ESCRIBANO` y `ADMINISTRADOR` — `D15`)
- **`GET /api/resultados/ediciones/:edicionId`**
  - Requiere sesión con rol `ESCRIBANO` o `ADMINISTRADOR` (`401` sin sesión, `403` para `JURADO`).
  - Si la edición no está `CLOSED` → `409 edicion_no_cerrada` (jamás expone puntajes antes del cierre total).
  - Devuelve el listado de snapshots de la edición y el detalle completo del snapshot activo (publicado o último calculado): ranking general de comparsas (con desglose), ranking por rubro/sujeto, empates y penalizaciones aplicadas.
- **`GET /api/resultados/ediciones/:edicionId/puntajes`**
  - Mismo RBAC (`ESCRIBANO` / `ADMINISTRADOR`) y misma barrera `edicion.estado === 'CLOSED'`.
  - Devuelve el desglose detallado de puntajes recibidos por noche, especialidad, jurado, comparsa, sujeto y rubro para verificación del escrutinio (`D15`).

---

## 5. Interfaz de usuario (cliente)

- **`PanelEscribano.jsx` (sección «Resultados y publicación»):**
  - Para ediciones `CLOSED`: botón **Calcular resultados** (modal de confirmación), tabla de ranking general de comparsas con desglose (fijos, nominativos, carros, penalizaciones, total), tabla por rubro/premio, panel de **Empates pendientes** con modal de resolución (selector de candidato empatado + motivo + acta), botón **Publicar resultados oficiales** (deshabilitado mientras existan empates pendientes, con modal irreversible) e historial de snapshots.
- **`PanelEdiciones.jsx` (Administrador):**
  - Para ediciones `CLOSED`: acción **Ver resultados** que abre la vista de solo lectura (ranking general, rubros, empates resueltos y desglose de puntajes detallados) usando `GET /api/resultados/ediciones/:edicionId`.

---

## 6. Pruebas obligatorias

1. **PostgreSQL (`0028`):** bloqueos previos al cierre total, snapshots incrementales inmutables (`UPDATE`/`DELETE`/`TRUNCATE`), detección y bloqueo de publicación con empates pendientes, resolución solo sobre candidatos empatados, publicación única por edición, auditoría atómica y purga completa vía `eliminar_edicion_completa` (`0025`).
2. **Motor de cálculo v1:** rubros fijos + mejor nominativo por comparsa + top 2 carros (`D24`), exclusión de aleatorios e infantiles (`suma_a_comparsa = false`), jerarquía padre/subítems (`D25`), `AGRUPACION` solo en individuales (`A10`), `EXCESO_SHOW_BATERIA` sobre su rubro, `RETRASO_INGRESO`/`RETRASO_SALIDA` sobre total de comparsa, `MINIMO_INTEGRANTES` descalificando comparsa pero manteniendo premios individuales (`D14`), y noches con `cuenta_para_puntaje = false` excluidas (`D13`).
3. **API, RBAC y concurrencia:** `409 edicion_no_cerrada` antes de cierre total, `403` para `JURADO` (siempre), `403` para `ADMINISTRADOR` en mutaciones de cálculo/empate/publicación pero `200` en consultas post-cierre (`D15`), idempotencia de publicación y resolución de empate, y recálculos/publicaciones concurrentes sin deadlocks ni doble publicación.
4. **Cliente:** flujo completo de cálculo, resolución de empate, publicación habilitada solo tras resolver empates, y vista de solo lectura para Administrador en ediciones `CLOSED`.
