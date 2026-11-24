-- Migración 0013: apertura idempotente de noches.
-- La cuenta de apertura dedicada también autoriza DRAFT -> OPEN en noche.

ALTER TABLE operacion_apertura
  ADD COLUMN noche_id uuid,
  DROP CONSTRAINT operacion_apertura_resultado_check,
  ADD CONSTRAINT operacion_apertura_resultado_check
    CHECK (resultado IN ('ABIERTA', 'NOCHE_ABIERTA')),
  ADD CONSTRAINT operacion_apertura_noche_edicion_fk
    FOREIGN KEY (noche_id, edicion_id) REFERENCES noche (id, edicion_id) ON DELETE RESTRICT,
  ADD CONSTRAINT operacion_apertura_noche_resultado_ck
    CHECK ((resultado = 'NOCHE_ABIERTA') = (noche_id IS NOT NULL));

CREATE FUNCTION noche_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'DRAFT' THEN
      RAISE EXCEPTION 'NOCHE_DEBE_CREARSE_EN_DRAFT' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'DRAFT' THEN
      RAISE EXCEPTION 'NOCHE_NO_BORRABLE' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.estado IS DISTINCT FROM NEW.estado
     AND NOT (OLD.estado = 'DRAFT' AND NEW.estado = 'OPEN') THEN
    RAISE EXCEPTION 'TRANSICION_NOCHE_INVALIDA' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado <> 'DRAFT'
     AND (NEW.edicion_id, NEW.orden, NEW.nombre, NEW.fecha, NEW.tipo, NEW.cuenta_para_puntaje)
         IS DISTINCT FROM
         (OLD.edicion_id, OLD.orden, OLD.nombre, OLD.fecha, OLD.tipo, OLD.cuenta_para_puntaje) THEN
    RAISE EXCEPTION 'NOCHE_NO_EDITABLE' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'DRAFT' AND NEW.estado = 'OPEN'
     AND NOT pg_has_role(current_user, 'carnavales_servicio_apertura', 'MEMBER') THEN
    RAISE EXCEPTION 'APERTURA_REQUIERE_SERVICIO' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER noche_validar_cambio_trg
  BEFORE INSERT OR UPDATE OR DELETE ON noche
  FOR EACH ROW EXECUTE FUNCTION noche_validar_cambio();
