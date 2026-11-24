-- Migración 0027: penalizaciones digitales (P6B / D14).
-- Reglas confirmadas:
--   - Solo el Escribano registra y anula penalizaciones mientras la edición está OPEN.
--   - Al cerrar la votación completa (CLOSED) o retirar la edición, quedan congeladas.
--   - Append-only: los datos originales nunca se editan ni se borran fuera de la
--     eliminación completa de una edición (0025); toda anulación es lógica y auditada.
--   - Nunca modifican puntajes artísticos (puntaje_recibido).

CREATE TABLE penalizacion (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id               uuid NOT NULL UNIQUE,
  edicion_id                 uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  noche_id                   uuid NOT NULL,
  comparsa_id                uuid NOT NULL,
  rubro_version_id           uuid,
  tipo                       text NOT NULL CHECK (tipo IN (
                               'RETRASO_INGRESO',
                               'RETRASO_SALIDA',
                               'EXCESO_SHOW_BATERIA',
                               'MINIMO_INTEGRANTES'
                             )),
  minutos                    integer CHECK (minutos IS NULL OR (minutos > 0 AND minutos <= 9999)),
  puntos_descuento           numeric(6,2) NOT NULL CHECK (puntos_descuento >= 0),
  cedio_turno                boolean NOT NULL DEFAULT false,
  impide_premios_comparsa    boolean NOT NULL DEFAULT false,
  motivo                     text NOT NULL CHECK (length(btrim(motivo)) > 0),
  referencia_acta            text NOT NULL CHECK (length(btrim(referencia_acta)) > 0),
  estado                     text NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'ANULADA')),
  registrada_por             text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  registrada_en              timestamptz NOT NULL DEFAULT clock_timestamp(),
  anulada_por                text REFERENCES usuario (id) ON DELETE RESTRICT,
  anulada_en                 timestamptz,
  motivo_anulacion           text CHECK (motivo_anulacion IS NULL OR length(btrim(motivo_anulacion)) > 0),
  referencia_acta_anulacion  text CHECK (referencia_acta_anulacion IS NULL OR length(btrim(referencia_acta_anulacion)) > 0),
  FOREIGN KEY (noche_id, edicion_id) REFERENCES noche (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (comparsa_id, edicion_id) REFERENCES comparsa (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (rubro_version_id, edicion_id) REFERENCES rubro_version (id, edicion_id) ON DELETE RESTRICT,
  CONSTRAINT penalizacion_reglas_tipo_ck CHECK (
    (tipo = 'RETRASO_INGRESO'
      AND minutos IS NOT NULL
      AND rubro_version_id IS NULL
      AND NOT impide_premios_comparsa
      AND cedio_turno = (minutos > 30)
      AND puntos_descuento = (LEAST(minutos, 30) * 0.50)::numeric(6,2))
    OR
    (tipo = 'RETRASO_SALIDA'
      AND minutos IS NOT NULL
      AND rubro_version_id IS NULL
      AND NOT impide_premios_comparsa
      AND NOT cedio_turno
      AND puntos_descuento = (minutos * 0.50)::numeric(6,2))
    OR
    (tipo = 'EXCESO_SHOW_BATERIA'
      AND minutos IS NOT NULL
      AND rubro_version_id IS NOT NULL
      AND NOT impide_premios_comparsa
      AND NOT cedio_turno
      AND puntos_descuento = (minutos * 0.50)::numeric(6,2))
    OR
    (tipo = 'MINIMO_INTEGRANTES'
      AND minutos IS NULL
      AND rubro_version_id IS NULL
      AND impide_premios_comparsa
      AND NOT cedio_turno
      AND puntos_descuento = 0.00)
  ),
  CONSTRAINT penalizacion_anulacion_completa_ck CHECK (
    (estado = 'ANULADA') = (
      anulada_por IS NOT NULL
      AND anulada_en IS NOT NULL
      AND motivo_anulacion IS NOT NULL
      AND referencia_acta_anulacion IS NOT NULL
    )
  )
);

CREATE INDEX penalizacion_edicion_noche_idx ON penalizacion (edicion_id, noche_id, registrada_en DESC);
CREATE INDEX penalizacion_comparsa_idx ON penalizacion (edicion_id, comparsa_id);

CREATE FUNCTION penalizacion_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fila_noche record;
  estado_edicion text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'PENALIZACION_NO_BORRABLE' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado <> 'ACTIVA' OR NEW.estado <> 'ANULADA' THEN
      RAISE EXCEPTION 'PENALIZACION_INMODIFICABLE' USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - 'estado' - 'anulada_por' - 'anulada_en' - 'motivo_anulacion' - 'referencia_acta_anulacion')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'estado' - 'anulada_por' - 'anulada_en' - 'motivo_anulacion' - 'referencia_acta_anulacion') THEN
      RAISE EXCEPTION 'PENALIZACION_INMODIFICABLE' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Orden canónico de bloqueos: noche FOR SHARE -> edicion FOR SHARE (evita 40P01).
  SELECT tipo, estado INTO fila_noche
    FROM noche WHERE id = NEW.noche_id AND edicion_id = NEW.edicion_id FOR SHARE;
  PERFORM exigir_edicion_operativa(NEW.edicion_id);

  SELECT estado INTO estado_edicion FROM edicion WHERE id = NEW.edicion_id;
  IF estado_edicion IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'EDICION_NO_ABIERTA' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'ACTIVA'
       OR NEW.anulada_por IS NOT NULL
       OR NEW.anulada_en IS NOT NULL
       OR NEW.motivo_anulacion IS NOT NULL
       OR NEW.referencia_acta_anulacion IS NOT NULL THEN
      RAISE EXCEPTION 'PENALIZACION_DEBE_CREARSE_ACTIVA' USING ERRCODE = 'check_violation';
    END IF;

    IF fila_noche.tipo IS DISTINCT FROM 'COMPETENCIA'
       OR fila_noche.estado NOT IN ('OPEN', 'CLOSED') THEN
      RAISE EXCEPTION 'NOCHE_NO_PENALIZABLE' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM orden_presentacion
       WHERE edicion_id = NEW.edicion_id
         AND noche_id = NEW.noche_id
         AND comparsa_id = NEW.comparsa_id
         AND estado = 'SCHEDULED'
    ) THEN
      RAISE EXCEPTION 'COMPARSA_NO_PROGRAMADA_EN_NOCHE' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.rubro_version_id IS NOT NULL THEN
      PERFORM 1
        FROM rubro_version rv
        JOIN version_reglamento v ON v.id = rv.version_id
       WHERE rv.id = NEW.rubro_version_id
         AND rv.edicion_id = NEW.edicion_id
         AND v.estado IN ('PUBLICADA', 'CONGELADA')
         AND rv.evaluable
       FOR SHARE OF v;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RUBRO_PENALIZACION_INVALIDO' USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
     WHERE ur.usuario_id = NEW.registrada_por AND r.codigo = 'ESCRIBANO' FOR SHARE OF ur;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PENALIZACION_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation';
    END IF;

    NEW.registrada_en := clock_timestamp();
    RETURN NEW;
  END IF;

  PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
   WHERE ur.usuario_id = NEW.anulada_por AND r.codigo = 'ESCRIBANO' FOR SHARE OF ur;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PENALIZACION_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation';
  END IF;

  NEW.anulada_en := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE TRIGGER penalizacion_validar_cambio_trg
  BEFORE INSERT OR UPDATE OR DELETE ON penalizacion
  FOR EACH ROW EXECUTE FUNCTION penalizacion_validar_cambio();

CREATE FUNCTION penalizacion_impedir_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PENALIZACION_NO_BORRABLE' USING ERRCODE = 'check_violation';
END
$$;

CREATE TRIGGER penalizacion_impedir_truncate_trg
  BEFORE TRUNCATE ON penalizacion
  FOR EACH STATEMENT EXECUTE FUNCTION penalizacion_impedir_truncate();

CREATE FUNCTION auditar_penalizacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
    VALUES (NEW.registrada_por, 'penalizacion_registrada', 'penalizacion', NEW.id, NEW.edicion_id);
  ELSIF OLD.estado = 'ACTIVA' AND NEW.estado = 'ANULADA' THEN
    INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
    VALUES (NEW.anulada_por, 'penalizacion_anulada', 'penalizacion', NEW.id, NEW.edicion_id);
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER penalizacion_auditar_trg
  AFTER INSERT OR UPDATE OF estado ON penalizacion
  FOR EACH ROW EXECUTE FUNCTION auditar_penalizacion();

-- Compatibilidad con la eliminación completa de una edición (0025).
CREATE OR REPLACE FUNCTION auditoria_atribuible_a_edicion(objetivo uuid, tipo text, identificador text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF tipo = 'edicion' AND identificador = objetivo::text THEN RETURN true; END IF;
  IF tipo = 'version_reglamento' AND EXISTS (
    SELECT 1 FROM version_reglamento WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'noche' AND EXISTS (
    SELECT 1 FROM noche WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'especialidad' AND EXISTS (
    SELECT 1 FROM especialidad WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'asignacion_jurado' AND EXISTS (
    SELECT 1 FROM asignacion_jurado WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'comparsa' AND EXISTS (
    SELECT 1 FROM comparsa WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'participante' AND EXISTS (
    SELECT 1 FROM participante WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'sujeto_evaluable' AND EXISTS (
    SELECT 1 FROM sujeto_evaluable WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'orden_presentacion' AND EXISTS (
    SELECT 1 FROM orden_presentacion WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'pasada' AND EXISTS (
    SELECT 1 FROM pasada WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'rubro_version' AND EXISTS (
    SELECT 1 FROM rubro_version WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'escala_puntaje_version' AND EXISTS (
    SELECT 1 FROM escala_puntaje_version WHERE version_id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'premio_version' AND EXISTS (
    SELECT 1 FROM premio_version WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'requisito_version' AND EXISTS (
    SELECT 1 FROM requisito_version WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'fila_planilla' AND EXISTS (
    SELECT 1 FROM fila_planilla WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'planilla' AND EXISTS (
    SELECT 1 FROM planilla_recibida p JOIN asignacion_jurado a ON a.id = p.asignacion_id
     WHERE p.id::text = identificador AND a.edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'penalizacion' AND EXISTS (
    SELECT 1 FROM penalizacion WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION eliminar_edicion_completa(objetivo uuid, actor text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE edicion_estado text;
DECLARE eliminadas integer;
BEGIN
  IF NOT pg_has_role(session_user, 'carnavales_servicio_eliminar_edicion', 'MEMBER') THEN
    RAISE EXCEPTION 'SERVICIO_ELIMINACION_REQUERIDO' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
     WHERE ur.usuario_id = actor AND r.codigo = 'ADMINISTRADOR' FOR SHARE OF ur
  ) THEN
    RAISE EXCEPTION 'ELIMINACION_REQUIERE_ADMINISTRADOR' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM id FROM noche WHERE edicion_id = objetivo ORDER BY id FOR UPDATE;
  SELECT estado INTO edicion_estado FROM edicion WHERE id = objetivo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EDICION_INEXISTENTE' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM noche WHERE edicion_id = objetivo AND tipo = 'COMPETENCIA' AND estado = 'OPEN') THEN
    RAISE EXCEPTION 'EDICION_EN_VOTACION' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO edicion_eliminacion_scope (transaction_id, edicion_id)
    VALUES (txid_current(), objetivo);

  PERFORM v.id FROM version_reglamento v
   WHERE v.copiada_de_id IN (SELECT id FROM version_reglamento WHERE edicion_id = objetivo)
     AND v.edicion_id <> objetivo
   ORDER BY v.id FOR UPDATE;
  UPDATE version_reglamento v SET copiada_de_id = NULL
   WHERE v.edicion_id <> objetivo
     AND v.copiada_de_id IN (SELECT id FROM version_reglamento WHERE edicion_id = objetivo);

  DELETE FROM auditoria a
   WHERE a.edicion_id = objetivo
      OR auditoria_atribuible_a_edicion(objetivo, a.entidad_tipo, a.entidad_id);

  DELETE FROM penalizacion WHERE edicion_id = objetivo;
  DELETE FROM puntaje_recibido p USING planilla_recibida pr, asignacion_jurado a
   WHERE p.planilla_id = pr.id AND pr.asignacion_id = a.id AND a.edicion_id = objetivo;
  DELETE FROM planilla_recibida pr USING asignacion_jurado a
   WHERE pr.asignacion_id = a.id AND a.edicion_id = objetivo;
  DELETE FROM suplentes_asignacion_jurado s USING asignacion_jurado a
   WHERE (s.asignacion_id = a.id OR s.asignacion_activa_id = a.id) AND a.edicion_id = objetivo;
  DELETE FROM borrador_traspaso_jurado b USING asignacion_jurado a
   WHERE b.asignacion_id = a.id AND a.edicion_id = objetivo;
  DELETE FROM relevo_asignacion_jurado r USING asignacion_jurado a
   WHERE (r.anterior_id = a.id OR r.sucesora_id = a.id) AND a.edicion_id = objetivo;
  DELETE FROM instantanea_planilla_esperada_detalle WHERE edicion_id = objetivo;
  DELETE FROM instantanea_planillas_esperadas WHERE edicion_id = objetivo;
  DELETE FROM configuracion_planilla_noche_fila WHERE edicion_id = objetivo;
  DELETE FROM configuracion_planilla_noche WHERE edicion_id = objetivo;
  DELETE FROM pasada WHERE edicion_id = objetivo;
  DELETE FROM orden_presentacion WHERE edicion_id = objetivo;
  DELETE FROM fila_planilla WHERE edicion_id = objetivo;
  DELETE FROM rubro_especialidad WHERE edicion_id = objetivo;
  DELETE FROM asignacion_jurado WHERE edicion_id = objetivo;
  DELETE FROM operacion_apertura WHERE edicion_id = objetivo;
  IF to_regclass('enmienda_reglamento') IS NOT NULL THEN
    EXECUTE 'DELETE FROM enmienda_reglamento WHERE edicion_id = $1' USING objetivo;
  END IF;
  DELETE FROM escala_puntaje_version WHERE edicion_id = objetivo;
  DELETE FROM premio_version WHERE edicion_id = objetivo;
  DELETE FROM requisito_version WHERE edicion_id = objetivo;
  LOOP
    DELETE FROM rubro_version parent
     WHERE parent.edicion_id = objetivo
       AND NOT EXISTS (SELECT 1 FROM rubro_version child WHERE child.padre_id = parent.id);
    GET DIAGNOSTICS eliminadas = ROW_COUNT;
    EXIT WHEN eliminadas = 0;
  END LOOP;
  IF EXISTS (SELECT 1 FROM rubro_version WHERE edicion_id = objetivo) THEN
    RAISE EXCEPTION 'EDICION_CON_DEPENDENCIAS' USING ERRCODE = 'foreign_key_violation';
  END IF;
  DELETE FROM sujeto_evaluable WHERE edicion_id = objetivo;
  DELETE FROM participante WHERE edicion_id = objetivo;
  DELETE FROM comparsa WHERE edicion_id = objetivo;
  DELETE FROM especialidad WHERE edicion_id = objetivo;
  DELETE FROM noche WHERE edicion_id = objetivo;
  DELETE FROM version_reglamento WHERE edicion_id = objetivo;
  DELETE FROM edicion WHERE id = objetivo;
  DELETE FROM edicion_eliminacion_scope WHERE transaction_id = txid_current() AND edicion_id = objetivo;
END
$$;

GRANT SELECT, DELETE ON penalizacion TO carnavales_propietario_eliminacion;
ALTER FUNCTION auditoria_atribuible_a_edicion(uuid, text, text) OWNER TO carnavales_propietario_eliminacion;
ALTER FUNCTION eliminar_edicion_completa(uuid, text) OWNER TO carnavales_propietario_eliminacion;
REVOKE ALL ON FUNCTION auditoria_atribuible_a_edicion(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auditoria_atribuible_a_edicion(uuid, text, text) TO PUBLIC;
REVOKE ALL ON FUNCTION eliminar_edicion_completa(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eliminar_edicion_completa(uuid, text) TO carnavales_servicio_eliminar_edicion;
DO $$
DECLARE nombre_esquema text := current_schema();
BEGIN
  EXECUTE format('ALTER FUNCTION %I.auditoria_atribuible_a_edicion(uuid, text, text) SET search_path TO pg_catalog, %I',
    nombre_esquema, nombre_esquema);
  EXECUTE format('ALTER FUNCTION %I.eliminar_edicion_completa(uuid, text) SET search_path TO pg_catalog, %I',
    nombre_esquema, nombre_esquema);
END
$$;
