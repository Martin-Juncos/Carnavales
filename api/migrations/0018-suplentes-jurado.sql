CREATE TABLE suplentes_asignacion_jurado (
  asignacion_id uuid PRIMARY KEY REFERENCES asignacion_jurado(id) ON DELETE RESTRICT,
  asignacion_activa_id uuid NOT NULL UNIQUE REFERENCES asignacion_jurado(id) ON DELETE RESTRICT,
  -- Validated on first assignment and immutable thereafter. The snapshot
  -- already forbids updates, deletes and truncation with its own guards.
  detalle_esperado_id uuid UNIQUE,
  dispositivo_id uuid,
  primer_suplente_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  segundo_suplente_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  CHECK (primer_suplente_id <> segundo_suplente_id)
);

CREATE FUNCTION validar_registro_suplentes_jurado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  titular text;
  estado_noche text;
  estado_asignacion text;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'REGISTRO_SUPLENTES_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.asignacion_id IS DISTINCT FROM OLD.asignacion_id
       OR NEW.primer_suplente_id IS DISTINCT FROM OLD.primer_suplente_id
       OR NEW.segundo_suplente_id IS DISTINCT FROM OLD.segundo_suplente_id
       OR (OLD.dispositivo_id IS NOT NULL AND NEW.dispositivo_id IS DISTINCT FROM OLD.dispositivo_id)
       OR (OLD.detalle_esperado_id IS NOT NULL AND NEW.detalle_esperado_id IS DISTINCT FROM OLD.detalle_esperado_id)
       OR (NEW.detalle_esperado_id IS DISTINCT FROM OLD.detalle_esperado_id AND
           (NEW.asignacion_activa_id = OLD.asignacion_activa_id OR NOT EXISTS (
             SELECT 1 FROM instantanea_planilla_esperada_detalle
              WHERE id = NEW.detalle_esperado_id AND asignacion_id = OLD.asignacion_activa_id
           )))
       OR (NEW.asignacion_activa_id <> OLD.asignacion_activa_id AND NEW.detalle_esperado_id IS NULL AND EXISTS (
             SELECT 1 FROM instantanea_planilla_esperada_detalle
              WHERE asignacion_id = OLD.asignacion_activa_id
           ))
       OR (NEW.asignacion_activa_id IS DISTINCT FROM OLD.asignacion_activa_id AND
           (OLD.dispositivo_id IS NOT NULL OR NEW.dispositivo_id IS NOT NULL OR NOT EXISTS (
             SELECT 1 FROM asignacion_jurado a JOIN asignacion_jurado original ON original.id = NEW.asignacion_id
              WHERE a.id = NEW.asignacion_activa_id AND a.estado = 'ACTIVA'
                AND a.edicion_id = original.edicion_id AND a.noche_id = original.noche_id
                AND a.especialidad_id = original.especialidad_id
                AND a.jurado_id IN (NEW.primer_suplente_id, NEW.segundo_suplente_id)
           ))) THEN
      RAISE EXCEPTION 'CAMBIO_SUPLENTES_INVALIDO' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  SELECT n.estado INTO estado_noche
    FROM noche n JOIN asignacion_jurado a ON a.noche_id = n.id
   WHERE a.id = NEW.asignacion_id FOR SHARE OF n;
  SELECT a.jurado_id, a.estado INTO titular, estado_asignacion
    FROM asignacion_jurado a WHERE a.id = NEW.asignacion_id FOR UPDATE;
  IF NEW.asignacion_activa_id IS DISTINCT FROM NEW.asignacion_id OR NEW.dispositivo_id IS NOT NULL
     OR NEW.detalle_esperado_id IS NOT NULL
     OR estado_noche IS DISTINCT FROM 'DRAFT' OR estado_asignacion IS DISTINCT FROM 'ACTIVA'
     OR titular IN (NEW.primer_suplente_id, NEW.segundo_suplente_id) THEN
    RAISE EXCEPTION 'REGISTRO_SUPLENTES_INVALIDO' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER suplentes_jurado_validar_registro_trg
BEFORE INSERT OR UPDATE OR DELETE ON suplentes_asignacion_jurado
FOR EACH ROW EXECUTE FUNCTION validar_registro_suplentes_jurado();

CREATE TRIGGER suplentes_jurado_impedir_truncate_trg
BEFORE TRUNCATE ON suplentes_asignacion_jurado
FOR EACH STATEMENT EXECUTE FUNCTION validar_registro_suplentes_jurado();

CREATE FUNCTION exigir_asignacion_activa_de_suplencia() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'REVOCADA' AND EXISTS (
    SELECT 1 FROM suplentes_asignacion_jurado WHERE asignacion_activa_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'SUPLENCIA_REQUIERE_ASIGNACION_ACTIVA' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER suplencia_exigir_asignacion_activa_trg
AFTER UPDATE ON asignacion_jurado DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION exigir_asignacion_activa_de_suplencia();
