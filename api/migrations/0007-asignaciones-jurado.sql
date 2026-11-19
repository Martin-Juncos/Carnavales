-- Migración 0007 (alcance aprobado): asignaciones de jurado y sus prerrequisitos mínimos.
-- Crea noche, especialidad, asignacion_jurado y auditoría. Sigue pendiente, y por eso
-- no se incluye aquí, todo lo que pertenece a otras funcionalidades: transiciones de
-- apertura/cierre de noche, padrón de comparsas, planillas, votos, penalizaciones,
-- resultados y reglas de cálculo. Las definiciones completas siguen guardadas, sin
-- aplicar, en api/migrations/pendientes/.
-- Debe ejecutarse después de 0006-evento-configuracion.sql.

-- ---------------------------------------------------------------------------
-- Noche (prerrequisito mínimo para identificar la jornada de una asignación)
-- ---------------------------------------------------------------------------

CREATE TABLE noche (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id          uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  orden               integer NOT NULL CHECK (orden > 0),
  nombre              text NOT NULL,
  fecha               date,
  tipo                text NOT NULL CHECK (tipo IN ('COMPETENCIA', 'PREMIACION')),
  cuenta_para_puntaje boolean NOT NULL DEFAULT true,
  estado              text NOT NULL DEFAULT 'DRAFT' CHECK (estado IN ('DRAFT', 'OPEN', 'CLOSED')),
  abierta_en          timestamptz,
  cerrada_en          timestamptz,
  UNIQUE (edicion_id, orden),
  UNIQUE (id, edicion_id),
  CHECK ((estado <> 'DRAFT') = (abierta_en IS NOT NULL)),
  CHECK ((estado = 'CLOSED') = (cerrada_en IS NOT NULL))
);
CREATE INDEX noche_edicion_id_idx ON noche (edicion_id);

-- ---------------------------------------------------------------------------
-- Especialidad (prerrequisito mínimo para la planilla de cada jurado)
-- ---------------------------------------------------------------------------

CREATE TABLE especialidad (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id  uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  nombre      text NOT NULL,
  codigo      text NOT NULL,
  orden       integer NOT NULL CHECK (orden > 0),
  activa      boolean NOT NULL DEFAULT true,
  UNIQUE (id, edicion_id),
  UNIQUE (edicion_id, codigo),
  UNIQUE (edicion_id, orden)
);
CREATE INDEX especialidad_edicion_id_idx ON especialidad (edicion_id);

-- ---------------------------------------------------------------------------
-- Asignación de jurado: vínculo entre jurado, noche y especialidad.
-- Es la base de las planillas esperadas; no es una planilla ni contiene puntajes.
-- ---------------------------------------------------------------------------

CREATE TABLE asignacion_jurado (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id      uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  jurado_id       text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  noche_id        uuid NOT NULL,
  especialidad_id uuid NOT NULL,
  estado          text NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'REVOCADA')),
  creada_por      text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  creada_en       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revocada_por    text REFERENCES usuario (id) ON DELETE RESTRICT,
  revocada_en     timestamptz,
  UNIQUE (id, edicion_id),
  -- Las claves foráneas compuestas impiden mezclar datos de ediciones distintas.
  FOREIGN KEY (noche_id, edicion_id) REFERENCES noche (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (especialidad_id, edicion_id) REFERENCES especialidad (id, edicion_id) ON DELETE RESTRICT,
  CHECK ((estado = 'REVOCADA') = (revocada_en IS NOT NULL)),
  CHECK ((estado = 'REVOCADA') = (revocada_por IS NOT NULL))
);

-- Una asignación activa por jurado, noche y especialidad. Al revocar se libera la
-- combinación para una nueva asignación sin borrar la evidencia anterior.
CREATE UNIQUE INDEX asignacion_jurado_activa_unica
  ON asignacion_jurado (noche_id, especialidad_id, jurado_id) WHERE estado = 'ACTIVA';
CREATE INDEX asignacion_jurado_noche_idx ON asignacion_jurado (noche_id);
CREATE INDEX asignacion_jurado_jurado_idx ON asignacion_jurado (jurado_id);

-- La asignación no se borra físicamente: conservar la evidencia es una regla
-- confirmada. La baja lógica (revocación) es la única transición permitida y
-- no altera la identidad de la asignación original.
CREATE FUNCTION asignacion_jurado_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ASIGNACION_NO_BORRABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.estado <> 'ACTIVA' OR NEW.estado <> 'REVOCADA' THEN
    RAISE EXCEPTION 'TRANSICION_ASIGNACION_INVALIDA' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.edicion_id, NEW.jurado_id, NEW.noche_id, NEW.especialidad_id,
      NEW.creada_por, NEW.creada_en)
     IS DISTINCT FROM
     (OLD.id, OLD.edicion_id, OLD.jurado_id, OLD.noche_id, OLD.especialidad_id,
      OLD.creada_por, OLD.creada_en) THEN
    RAISE EXCEPTION 'ASIGNACION_INMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER asignacion_jurado_validar_cambio_trg
  BEFORE UPDATE OR DELETE ON asignacion_jurado
  FOR EACH ROW EXECUTE FUNCTION asignacion_jurado_validar_cambio();

-- TRUNCATE no dispara los triggers de fila: se prohíbe explícitamente para que
-- ninguna vía permita vaciar la tabla y perder la evidencia.
CREATE FUNCTION asignacion_jurado_impedir_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ASIGNACION_NO_TRUNCABLE' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER asignacion_jurado_impedir_truncate_trg
  BEFORE TRUNCATE ON asignacion_jurado
  FOR EACH STATEMENT EXECUTE FUNCTION asignacion_jurado_impedir_truncate();

-- ---------------------------------------------------------------------------
-- Auditoría de operaciones sensibles (append-only).
-- No guarda credenciales, tokens de sesión ni códigos 2FA: solo la operación,
-- el actor de la sesión y la entidad afectada.
-- ---------------------------------------------------------------------------

CREATE TABLE auditoria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocurrida_en   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id      text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  operacion     text NOT NULL,
  entidad_tipo  text NOT NULL,
  entidad_id    text
);
CREATE INDEX auditoria_ocurrida_en_idx ON auditoria (ocurrida_en);

CREATE FUNCTION auditoria_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDITORIA_NO_MODIFICABLE' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER auditoria_append_only_trg
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_append_only();

CREATE FUNCTION auditoria_impedir_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AUDITORIA_NO_TRUNCABLE' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER auditoria_impedir_truncate_trg
  BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_impedir_truncate();
