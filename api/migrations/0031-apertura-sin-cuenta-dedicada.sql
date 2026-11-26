-- Permite abrir ediciones y noches desde la conexión principal de la API (DATABASE_URL)
-- sin requerir una cuenta dedicada ni la variable DATABASE_URL_APERTURA.
-- Se mantienen las validaciones de estado, idempotencia, auditoría y cierres.

CREATE OR REPLACE FUNCTION edicion_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  motivo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'CLOSED' OR NEW.cerrada_por IS NOT NULL OR NEW.cerrada_en IS NOT NULL THEN
      RAISE EXCEPTION 'EDICION_NO_CREABLE_CERRADA' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.id) THEN RETURN OLD; END IF;
    IF OLD.estado <> 'CONFIGURING' THEN
      RAISE EXCEPTION 'EDICION_NO_BORRABLE' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.retirada_en IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'CLOSED' THEN
    RAISE EXCEPTION 'EDICION_CERRADA' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'OPEN' AND NEW.estado = 'CLOSED' THEN
    IF NEW.retirada_en IS NOT NULL OR NEW.retirada_por IS NOT NULL THEN
      RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - 'estado' - 'cerrada_por' - 'cerrada_en')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'estado' - 'cerrada_por' - 'cerrada_en') THEN
      RAISE EXCEPTION 'EDICION_INMODIFICABLE_EN_CIERRE' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
     WHERE ur.usuario_id = NEW.cerrada_por AND r.codigo = 'ESCRIBANO' FOR SHARE OF ur;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CIERRE_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation';
    END IF;
    SELECT motivo_bloqueo_cierre_total(OLD.id) INTO motivo;
    IF motivo IS NOT NULL THEN
      RAISE EXCEPTION 'CIERRE_TOTAL_BLOQUEADO' USING ERRCODE = 'check_violation';
    END IF;
    NEW.cerrada_en := clock_timestamp();
    RETURN NEW;
  END IF;

  IF OLD.estado = 'CONFIGURING' AND NEW.estado = 'CLOSED' THEN
    RAISE EXCEPTION 'CIERRE_TOTAL_BLOQUEADO' USING ERRCODE = 'check_violation';
  END IF;

  IF (NEW.cerrada_por, NEW.cerrada_en) IS DISTINCT FROM (OLD.cerrada_por, OLD.cerrada_en) THEN
    RAISE EXCEPTION 'EVIDENCIA_CIERRE_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'OPEN' AND NEW.estado <> 'OPEN' THEN
    RAISE EXCEPTION 'EDICION_NO_REABRIBLE' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION noche_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE motivo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'DRAFT' OR NEW.cerrada_por IS NOT NULL THEN
      RAISE EXCEPTION 'NOCHE_DEBE_CREARSE_EN_DRAFT' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    IF OLD.estado <> 'DRAFT' THEN RAISE EXCEPTION 'NOCHE_NO_BORRABLE' USING ERRCODE = 'check_violation'; END IF;
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
  IF OLD.estado = 'OPEN' AND NEW.estado = 'CLOSED' THEN
    PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
     WHERE ur.usuario_id = NEW.cerrada_por AND r.codigo = 'ESCRIBANO' FOR SHARE OF ur;
    IF NOT FOUND THEN RAISE EXCEPTION 'CIERRE_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation'; END IF;
    SELECT motivo_bloqueo_cierre_noche(OLD.id, OLD.estado) INTO motivo;
    IF motivo IS NOT NULL THEN RAISE EXCEPTION 'CIERRE_NOCHE_BLOQUEADO' USING ERRCODE = 'check_violation'; END IF;
    NEW.cerrada_en := clock_timestamp();
  ELSIF (NEW.cerrada_por, NEW.cerrada_en) IS DISTINCT FROM (OLD.cerrada_por, OLD.cerrada_en) THEN
    RAISE EXCEPTION 'EVIDENCIA_CIERRE_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
