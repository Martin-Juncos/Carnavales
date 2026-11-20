CREATE TABLE planilla_recibida (
  id uuid PRIMARY KEY,
  operation_id uuid NOT NULL UNIQUE,
  asignacion_id uuid NOT NULL UNIQUE REFERENCES asignacion_jurado (id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES version_reglamento (id) ON DELETE RESTRICT,
  hash_contenido text NOT NULL CHECK (hash_contenido ~ '^[0-9a-f]{64}$'),
  recibida_en timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE puntaje_recibido (
  planilla_id uuid NOT NULL REFERENCES planilla_recibida (id) ON DELETE NO ACTION INITIALLY DEFERRED,
  fila_id uuid NOT NULL REFERENCES fila_planilla (id) ON DELETE RESTRICT,
  valor smallint NOT NULL,
  no_presentado boolean NOT NULL,
  PRIMARY KEY (planilla_id, fila_id),
  CHECK ((no_presentado AND valor = 0) OR (NOT no_presentado AND valor BETWEEN 1 AND 5))
);

-- Se insertan los puntajes antes de sellar la cabecera; la FK diferida
-- impide que se confirmen huérfanos. El mismo bloqueo serializa ambos pasos.
CREATE FUNCTION proteger_insercion_puntaje_recibido() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('planilla_recibida:' || NEW.planilla_id::text, 0));
  IF EXISTS (SELECT 1 FROM planilla_recibida WHERE id = NEW.planilla_id) THEN
    RAISE EXCEPTION 'PLANILLA_RECIBIDA_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proteger_insercion_puntaje_recibido_trg
  BEFORE INSERT ON puntaje_recibido FOR EACH ROW EXECUTE FUNCTION proteger_insercion_puntaje_recibido();

-- Única fuente para validar el contexto y la completitud de una recepción.
CREATE FUNCTION filas_recepcion_planilla(p_noche uuid, p_version uuid, p_especialidad uuid)
RETURNS TABLE (fila_id uuid, evaluable boolean)
LANGUAGE sql STABLE AS $$
  SELECT p.fila_id, r.evaluable
    FROM configuracion_planilla_noche_fila p
    JOIN fila_planilla f ON f.id = p.fila_id AND NOT f.excluida
    JOIN rubro_version r ON r.id = p.rubro_id
    JOIN sujeto_evaluable s ON s.id = f.sujeto_id AND s.activo
    JOIN comparsa c ON c.id = s.comparsa_id AND c.activa
    JOIN orden_presentacion op ON op.noche_id = p.noche_id AND op.edicion_id = p.edicion_id
      AND op.comparsa_id = c.id AND op.estado = 'SCHEDULED'
   WHERE p.noche_id = p_noche AND p.version_id = p_version AND p.especialidad_id = p_especialidad
$$;

CREATE FUNCTION sellar_planilla_recibida() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  asignacion asignacion_jurado%ROWTYPE;
BEGIN
  PERFORM 1 FROM noche n JOIN asignacion_jurado a ON a.noche_id = n.id
    WHERE a.id = NEW.asignacion_id AND n.tipo = 'COMPETENCIA' AND n.estado = 'OPEN' FOR SHARE OF n;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOCHE_NO_RECEPTIVA' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO asignacion FROM asignacion_jurado WHERE id = NEW.asignacion_id FOR UPDATE;
  IF asignacion.estado IS DISTINCT FROM 'ACTIVA' OR NOT EXISTS (
    SELECT 1 FROM instantanea_planillas_esperadas
     WHERE noche_id = asignacion.noche_id AND version_id = NEW.version_id AND filas_configuradas
  ) THEN
    RAISE EXCEPTION 'CONTEXTO_RECEPCION_INVALIDO' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('planilla_recibida:' || NEW.id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM filas_recepcion_planilla(asignacion.noche_id, NEW.version_id, asignacion.especialidad_id)
  ) OR EXISTS (
    WITH esperadas AS (
      SELECT f.fila_id FROM filas_recepcion_planilla(asignacion.noche_id, NEW.version_id, asignacion.especialidad_id) f
       WHERE f.evaluable
    ), entregadas AS (
      SELECT p.fila_id FROM puntaje_recibido p WHERE p.planilla_id = NEW.id
    )
    SELECT 1 FROM esperadas FULL JOIN entregadas USING (fila_id)
     WHERE esperadas.fila_id IS NULL OR entregadas.fila_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PUNTAJES_RECEPCION_INVALIDOS' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sellar_planilla_recibida_trg
  BEFORE INSERT ON planilla_recibida FOR EACH ROW EXECUTE FUNCTION sellar_planilla_recibida();

CREATE FUNCTION impedir_cambio_planilla_recibida() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PLANILLA_RECIBIDA_INMODIFICABLE' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER planilla_recibida_inmodificable_trg
  BEFORE UPDATE OR DELETE ON planilla_recibida FOR EACH ROW EXECUTE FUNCTION impedir_cambio_planilla_recibida();
CREATE TRIGGER planilla_recibida_no_truncate_trg
  BEFORE TRUNCATE ON planilla_recibida FOR EACH STATEMENT EXECUTE FUNCTION impedir_cambio_planilla_recibida();
CREATE TRIGGER puntaje_recibido_inmodificable_trg
  BEFORE UPDATE OR DELETE ON puntaje_recibido FOR EACH ROW EXECUTE FUNCTION impedir_cambio_planilla_recibida();
CREATE TRIGGER puntaje_recibido_no_truncate_trg
  BEFORE TRUNCATE ON puntaje_recibido FOR EACH STATEMENT EXECUTE FUNCTION impedir_cambio_planilla_recibida();

CREATE FUNCTION impedir_revocar_planilla_recibida() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM planilla_recibida WHERE asignacion_id = OLD.id) THEN
    RAISE EXCEPTION 'ASIGNACION_CON_PLANILLA_RECIBIDA' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER impedir_revocar_planilla_recibida_trg BEFORE UPDATE OF estado ON asignacion_jurado
  FOR EACH ROW WHEN (OLD.estado = 'ACTIVA' AND NEW.estado = 'REVOCADA')
  EXECUTE FUNCTION impedir_revocar_planilla_recibida();
