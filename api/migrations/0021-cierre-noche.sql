ALTER TABLE noche ADD COLUMN cerrada_por text REFERENCES usuario(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION noche_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  motivo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'DRAFT' OR NEW.cerrada_por IS NOT NULL THEN
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
     AND NOT ((OLD.estado = 'DRAFT' AND NEW.estado = 'OPEN')
       OR (OLD.estado = 'OPEN' AND NEW.estado = 'CLOSED' AND OLD.tipo = 'COMPETENCIA')) THEN
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

  IF OLD.estado = 'OPEN' AND NEW.estado = 'CLOSED' THEN
    PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
     WHERE ur.usuario_id = NEW.cerrada_por AND r.codigo = 'ESCRIBANO' FOR SHARE OF ur;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CIERRE_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation';
    END IF;
    SELECT motivo_bloqueo_cierre_noche(OLD.id, OLD.estado) INTO motivo;
    IF motivo IS NOT NULL THEN
      RAISE EXCEPTION 'CIERRE_NOCHE_BLOQUEADO' USING ERRCODE = 'check_violation';
    END IF;
    NEW.cerrada_en := clock_timestamp();
  ELSIF (NEW.cerrada_por, NEW.cerrada_en) IS DISTINCT FROM (OLD.cerrada_por, OLD.cerrada_en) THEN
    RAISE EXCEPTION 'EVIDENCIA_CIERRE_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION auditar_cierre_noche() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id)
  VALUES (NEW.cerrada_por, 'noche_cerrada', 'noche', NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER noche_auditar_cierre_trg
AFTER UPDATE OF estado ON noche FOR EACH ROW
WHEN (OLD.estado = 'OPEN' AND NEW.estado = 'CLOSED')
EXECUTE FUNCTION auditar_cierre_noche();
