-- Migración 0012: filas de planilla (objetivo_rubro). Cada fila es sujeto × rubro × especialidad.
-- Decisiones confirmadas por el responsable del proyecto:
--   R11: el mismo sujeto y rubro pueden aparecer en dos especialidades.
--   R8/H11: las nominaciones se editan hasta la apertura de la primera noche (padrón congelado).
--   Un nominado es un sujeto distinto: un sujeto en dos especialidades cuenta una vez.
--   Los topes de nominados se aplican solo a las filas MANUAL.
-- Las filas GENERADA se crean con el servicio de generación, no con triggers.

CREATE TABLE objetivo_rubro (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id        uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  rubro_version_id  uuid NOT NULL,
  sujeto_id         uuid NOT NULL,
  especialidad_id   uuid NOT NULL,
  -- GENERADA: creada por la generación. MANUAL: nominación del administrador (aleatorios).
  origen            text NOT NULL CHECK (origen IN ('GENERADA', 'MANUAL')),
  -- true: el administrador la quitó. Se conserva para que la regeneración no la vuelva a crear.
  excluida          boolean NOT NULL DEFAULT false,
  -- false: fila gris, no compite. Sin puntaje, no cuenta como faltante.
  evaluable         boolean NOT NULL DEFAULT true,
  orden             integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (rubro_version_id, edicion_id) REFERENCES rubro_version (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (sujeto_id, edicion_id) REFERENCES sujeto_evaluable (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (rubro_version_id, especialidad_id) REFERENCES rubro_especialidad (rubro_version_id, especialidad_id) ON DELETE RESTRICT,
  UNIQUE (rubro_version_id, sujeto_id, especialidad_id)
);
CREATE INDEX objetivo_rubro_sujeto_id_idx ON objetivo_rubro (sujeto_id);
CREATE INDEX objetivo_rubro_especialidad_idx ON objetivo_rubro (rubro_version_id, especialidad_id);

-- El padrón está congelado al abrir la primera noche: las filas siguen la misma regla (0008).
CREATE TRIGGER objetivo_rubro_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON objetivo_rubro
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

-- El sujeto debe ser del mismo tipo que el rubro (rubro_version.tipo_sujeto).
CREATE FUNCTION objetivo_rubro_exigir_tipo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  coincide boolean;
BEGIN
  SELECT s.tipo_sujeto = rv.tipo_sujeto INTO coincide
    FROM sujeto_evaluable AS s, rubro_version AS rv
   WHERE s.id = NEW.sujeto_id AND rv.id = NEW.rubro_version_id;
  IF coincide IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OBJETIVO_TIPO_INCOHERENTE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER objetivo_rubro_exigir_tipo_trg
  BEFORE INSERT OR UPDATE ON objetivo_rubro
  FOR EACH ROW EXECUTE FUNCTION objetivo_rubro_exigir_tipo();

-- Topes de nominaciones manuales. Se cuentan sujetos distintos no excluidos del mismo rubro.
-- El bloqueo del rubro serializa las nominaciones concurrentes del mismo rubro.
CREATE FUNCTION objetivo_rubro_exigir_topes() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tope_edicion integer;
  tope_comparsa integer;
  comparsa_del_sujeto uuid;
  otros integer;
BEGIN
  IF NEW.origen <> 'MANUAL' OR NEW.excluida THEN
    RETURN NEW;
  END IF;

  SELECT rv.nominados_maximos, rv.nominados_maximos_por_comparsa
    INTO tope_edicion, tope_comparsa
    FROM rubro_version AS rv
   WHERE rv.id = NEW.rubro_version_id
   FOR UPDATE;

  IF tope_edicion IS NOT NULL THEN
    SELECT count(DISTINCT o.sujeto_id) INTO otros
      FROM objetivo_rubro AS o
     WHERE o.rubro_version_id = NEW.rubro_version_id
       AND NOT o.excluida
       AND o.sujeto_id <> NEW.sujeto_id
       AND o.id IS DISTINCT FROM NEW.id;
    IF otros + 1 > tope_edicion THEN
      RAISE EXCEPTION 'NOMINADOS_EXCEDIDOS' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF tope_comparsa IS NOT NULL THEN
    SELECT s.comparsa_id INTO comparsa_del_sujeto FROM sujeto_evaluable AS s WHERE s.id = NEW.sujeto_id;
    SELECT count(DISTINCT o.sujeto_id) INTO otros
      FROM objetivo_rubro AS o
      JOIN sujeto_evaluable AS s ON s.id = o.sujeto_id
     WHERE o.rubro_version_id = NEW.rubro_version_id
       AND NOT o.excluida
       AND o.sujeto_id <> NEW.sujeto_id
       AND o.id IS DISTINCT FROM NEW.id
       AND s.comparsa_id = comparsa_del_sujeto;
    IF otros + 1 > tope_comparsa THEN
      RAISE EXCEPTION 'NOMINADOS_COMPARSA_EXCEDIDOS' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER objetivo_rubro_exigir_topes_trg
  BEFORE INSERT OR UPDATE ON objetivo_rubro
  FOR EACH ROW EXECUTE FUNCTION objetivo_rubro_exigir_topes();
