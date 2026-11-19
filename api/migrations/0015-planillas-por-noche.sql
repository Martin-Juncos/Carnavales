ALTER TABLE instantanea_planillas_esperadas
  ADD COLUMN filas_configuradas boolean NOT NULL DEFAULT false;

ALTER TABLE rubro_version ADD UNIQUE (id, version_id, edicion_id);
ALTER TABLE fila_planilla ADD UNIQUE (id, rubro_version_id, especialidad_id);

CREATE TABLE configuracion_planilla_noche (
  edicion_id uuid NOT NULL,
  version_id uuid NOT NULL,
  noche_id uuid NOT NULL,
  especialidad_id uuid NOT NULL,
  PRIMARY KEY (noche_id, version_id, especialidad_id),
  UNIQUE (noche_id, version_id, especialidad_id, edicion_id),
  FOREIGN KEY (noche_id, edicion_id) REFERENCES noche (id, edicion_id),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id),
  FOREIGN KEY (especialidad_id, edicion_id) REFERENCES especialidad (id, edicion_id)
);

CREATE TABLE configuracion_planilla_noche_fila (
  edicion_id uuid NOT NULL,
  version_id uuid NOT NULL,
  noche_id uuid NOT NULL,
  especialidad_id uuid NOT NULL,
  fila_id uuid NOT NULL,
  rubro_id uuid NOT NULL,
  orden integer NOT NULL CHECK (orden > 0),
  PRIMARY KEY (noche_id, version_id, especialidad_id, fila_id),
  UNIQUE (noche_id, version_id, especialidad_id, orden),
  FOREIGN KEY (noche_id, version_id, especialidad_id, edicion_id)
    REFERENCES configuracion_planilla_noche (noche_id, version_id, especialidad_id, edicion_id),
  FOREIGN KEY (fila_id, rubro_id, especialidad_id)
    REFERENCES fila_planilla (id, rubro_version_id, especialidad_id) ON DELETE CASCADE,
  FOREIGN KEY (rubro_id, version_id, edicion_id)
    REFERENCES rubro_version (id, version_id, edicion_id)
);

CREATE FUNCTION exigir_configuracion_planilla_editable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  estado_noche text;
  id_noche uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'CONFIGURACION_PLANILLA_PROTEGIDA' USING ERRCODE = 'check_violation';
  END IF;
  id_noche := CASE WHEN TG_OP = 'DELETE' THEN OLD.noche_id ELSE NEW.noche_id END;
  SELECT estado INTO estado_noche FROM noche
   WHERE id = id_noche AND (TG_OP = 'DELETE' OR tipo = 'COMPETENCIA') FOR SHARE;
  IF estado_noche IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'CONFIGURACION_PLANILLA_PROTEGIDA' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER configuracion_planilla_noche_editable
  BEFORE INSERT OR UPDATE OR DELETE ON configuracion_planilla_noche
  FOR EACH ROW EXECUTE FUNCTION exigir_configuracion_planilla_editable();
CREATE TRIGGER configuracion_planilla_noche_fila_editable
  BEFORE INSERT OR UPDATE OR DELETE ON configuracion_planilla_noche_fila
  FOR EACH ROW EXECUTE FUNCTION exigir_configuracion_planilla_editable();
CREATE TRIGGER configuracion_planilla_noche_no_truncar
  BEFORE TRUNCATE ON configuracion_planilla_noche
  FOR EACH STATEMENT EXECUTE FUNCTION exigir_configuracion_planilla_editable();
CREATE TRIGGER configuracion_planilla_noche_fila_no_truncar
  BEFORE TRUNCATE ON configuracion_planilla_noche_fila
  FOR EACH STATEMENT EXECUTE FUNCTION exigir_configuracion_planilla_editable();

GRANT SELECT ON configuracion_planilla_noche, configuracion_planilla_noche_fila
  TO carnavales_servicio_apertura;
