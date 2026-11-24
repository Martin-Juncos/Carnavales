ALTER TABLE edicion
  ADD COLUMN retirada_en timestamptz,
  ADD COLUMN retirada_por text REFERENCES usuario(id) ON DELETE RESTRICT,
  ADD CONSTRAINT edicion_retiro_completo CHECK ((retirada_en IS NULL) = (retirada_por IS NULL));

CREATE FUNCTION validar_retiro_edicion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.retirada_en IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.retirada_en IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM noche WHERE edicion_id = OLD.id AND tipo = 'COMPETENCIA' AND estado = 'OPEN') THEN
      RAISE EXCEPTION 'EDICION_EN_VOTACION' USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - 'retirada_en' - 'retirada_por') IS DISTINCT FROM
       (to_jsonb(OLD) - 'retirada_en' - 'retirada_por') THEN
      RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
      WHERE ur.usuario_id = NEW.retirada_por AND r.codigo = 'ADMINISTRADOR' FOR SHARE OF ur;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RETIRO_REQUIERE_ADMINISTRADOR' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER edicion_validar_retiro_trg
  BEFORE INSERT OR UPDATE OR DELETE ON edicion FOR EACH ROW EXECUTE FUNCTION validar_retiro_edicion();

CREATE FUNCTION auditar_retiro_edicion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
  VALUES (NEW.retirada_por, 'edicion_retirada', 'edicion', NEW.id, NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER edicion_auditar_retiro_trg AFTER UPDATE OF retirada_en ON edicion
  FOR EACH ROW WHEN (OLD.retirada_en IS NULL AND NEW.retirada_en IS NOT NULL)
  EXECUTE FUNCTION auditar_retiro_edicion();

-- Share locks are held through commit and conflict with retirement. Check
-- both owners on UPDATE so a row cannot be moved out of retired history.
CREATE FUNCTION exigir_edicion_operativa(identificador uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE retiro timestamptz;
BEGIN
  SELECT retirada_en INTO retiro FROM edicion WHERE id = identificador FOR SHARE;
  IF retiro IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE FUNCTION impedir_cambios_edicion_retirada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM exigir_edicion_operativa(OLD.edicion_id); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'INSERT' OR NEW.edicion_id IS DISTINCT FROM OLD.edicion_id THEN
    PERFORM exigir_edicion_operativa(NEW.edicion_id);
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'version_reglamento', 'especialidad', 'asignacion_jurado', 'comparsa',
    'participante', 'sujeto_evaluable', 'orden_presentacion', 'pasada', 'operacion_apertura',
    'rubro_version', 'escala_puntaje_version', 'rubro_especialidad', 'premio_version',
    'requisito_version', 'fila_planilla', 'enmienda_reglamento', 'instantanea_planillas_esperadas',
    'instantanea_planilla_esperada_detalle', 'configuracion_planilla_noche', 'configuracion_planilla_noche_fila'
  ] LOOP
    EXECUTE format('CREATE TRIGGER a_edicion_operativa_trg BEFORE INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION impedir_cambios_edicion_retirada()', tabla);
  END LOOP;
END;
$$;

CREATE FUNCTION proteger_retiro_en_cambio_de_noche() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado = 'DRAFT' AND NEW.estado = 'OPEN' AND NEW.tipo = 'COMPETENCIA' THEN
    IF OLD.edicion_id IS DISTINCT FROM NEW.edicion_id THEN
      PERFORM exigir_edicion_operativa(OLD.edicion_id);
    END IF;
    -- Write a new parent tuple so a fixed snapshot from before opening cannot
    -- retire the edition using a stale view of its competitive nights.
    UPDATE edicion SET retirada_en = retirada_en WHERE id = NEW.edicion_id;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN PERFORM exigir_edicion_operativa(OLD.edicion_id); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'INSERT' OR NEW.edicion_id IS DISTINCT FROM OLD.edicion_id THEN
    PERFORM exigir_edicion_operativa(NEW.edicion_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER z_edicion_operativa_trg BEFORE INSERT OR UPDATE OR DELETE ON noche
  FOR EACH ROW EXECUTE FUNCTION proteger_retiro_en_cambio_de_noche();

CREATE FUNCTION impedir_cambios_asignacion_retirada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE anterior uuid;
DECLARE siguiente uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN anterior := (to_jsonb(OLD) ->> TG_ARGV[0])::uuid; END IF;
  IF TG_OP <> 'DELETE' THEN siguiente := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid; END IF;
  PERFORM exigir_edicion_operativa(edicion_id) FROM asignacion_jurado
    WHERE id IN (anterior, siguiente) ORDER BY edicion_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER a_edicion_operativa_trg BEFORE INSERT OR UPDATE OR DELETE ON suplentes_asignacion_jurado
  FOR EACH ROW EXECUTE FUNCTION impedir_cambios_asignacion_retirada('asignacion_id');
CREATE TRIGGER a_edicion_operativa_trg BEFORE INSERT OR UPDATE OR DELETE ON borrador_traspaso_jurado
  FOR EACH ROW EXECUTE FUNCTION impedir_cambios_asignacion_retirada('asignacion_id');
CREATE TRIGGER a_edicion_operativa_trg BEFORE INSERT ON planilla_recibida
  FOR EACH ROW EXECUTE FUNCTION impedir_cambios_asignacion_retirada('asignacion_id');
CREATE TRIGGER a_edicion_operativa_trg BEFORE INSERT ON relevo_asignacion_jurado
  FOR EACH ROW EXECUTE FUNCTION impedir_cambios_asignacion_retirada('anterior_id');
