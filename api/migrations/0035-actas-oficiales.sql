-- Migración 0035: actas oficiales de resultados PDF/CSV con SHA-256 (P6D).
-- Las actas se emiten sobre el snapshot PUBLICADO de resultados (clasificación
-- de comparsas, desglose por rubro, penalizaciones y resoluciones de empate),
-- sin tabla adicional de premios. Cada emisión es versionada, inmutable y
-- verificable por hash SHA-256 sobre los bytes del archivo. No registra firma
-- digital ni certificación (actas-diseno.md §7).

CREATE TABLE acta_resultado (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id            uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  calculo_id            uuid NOT NULL,
  numero                integer NOT NULL CHECK (numero > 0),
  generada_por          text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  generada_en           timestamptz NOT NULL DEFAULT clock_timestamp(),
  transaccion_creacion  xid8 NOT NULL DEFAULT pg_current_xact_id(),
  operation_id          uuid NOT NULL UNIQUE,
  UNIQUE (edicion_id, numero),
  UNIQUE (id, edicion_id),
  FOREIGN KEY (calculo_id, edicion_id) REFERENCES calculo_resultado (id, edicion_id) ON DELETE RESTRICT
);

CREATE FUNCTION acta_resultado_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fila_edicion record;
  fila_calculo record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'ACTA_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ACTA_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;

  SELECT e.estado, e.retirada_en INTO fila_edicion
    FROM edicion e WHERE e.id = NEW.edicion_id FOR SHARE;
  IF NOT FOUND OR fila_edicion.retirada_en IS NOT NULL OR fila_edicion.estado IS DISTINCT FROM 'CLOSED' THEN
    RAISE EXCEPTION 'ACTA_REQUIERE_EDICION_CERRADA' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.estado INTO fila_calculo
    FROM calculo_resultado c WHERE c.id = NEW.calculo_id AND c.edicion_id = NEW.edicion_id FOR SHARE;
  IF NOT FOUND OR fila_calculo.estado IS DISTINCT FROM 'PUBLICADO' THEN
    RAISE EXCEPTION 'ACTA_REQUIERE_RESULTADO_PUBLICADO' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
   WHERE ur.usuario_id = NEW.generada_por AND r.codigo = 'ESCRIBANO' FOR SHARE OF ur;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTA_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM acta_resultado WHERE edicion_id = NEW.edicion_id AND numero = NEW.numero) THEN
    RAISE EXCEPTION 'ACTA_NUMERO_DUPLICADO' USING ERRCODE = 'unique_violation';
  END IF;
  NEW.generada_en := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE TRIGGER acta_resultado_validar_cambio_trg
  BEFORE INSERT OR UPDATE OR DELETE ON acta_resultado
  FOR EACH ROW EXECUTE FUNCTION acta_resultado_validar_cambio();

CREATE FUNCTION acta_impedir_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ACTA_INMODIFICABLE' USING ERRCODE = 'check_violation';
END
$$;

CREATE TRIGGER acta_resultado_impedir_truncate_trg
  BEFORE TRUNCATE ON acta_resultado
  FOR EACH STATEMENT EXECUTE FUNCTION acta_impedir_truncate();

CREATE TABLE acta_representacion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_id         uuid NOT NULL,
  edicion_id      uuid NOT NULL,
  formato         text NOT NULL CHECK (formato IN ('PDF', 'CSV')),
  contenido       bytea NOT NULL,
  hash_sha256     text NOT NULL CHECK (hash_sha256 ~ '^[0-9a-f]{64}$'),
  tamanio_bytes   integer NOT NULL CHECK (tamanio_bytes > 0),
  content_type    text NOT NULL,
  FOREIGN KEY (acta_id, edicion_id) REFERENCES acta_resultado (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (acta_id, formato),
  CHECK (octet_length(contenido) = tamanio_bytes),
  CHECK ((formato = 'PDF' AND content_type = 'application/pdf')
      OR (formato = 'CSV' AND content_type = 'text/csv; charset=utf-8'))
);

CREATE FUNCTION acta_detalle_validar_insercion() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fila_acta record;
BEGIN
  SELECT a.transaccion_creacion INTO fila_acta
    FROM acta_resultado a WHERE a.id = NEW.acta_id AND a.edicion_id = NEW.edicion_id FOR SHARE;
  IF NOT FOUND OR fila_acta.transaccion_creacion <> pg_current_xact_id() THEN
    RAISE EXCEPTION 'ACTA_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION acta_detalle_inmodificable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'ACTA_INMODIFICABLE' USING ERRCODE = 'check_violation';
END
$$;

CREATE TRIGGER acta_representacion_validar_insercion_trg
  BEFORE INSERT ON acta_representacion
  FOR EACH ROW EXECUTE FUNCTION acta_detalle_validar_insercion();
CREATE TRIGGER acta_representacion_inmodificable_trg
  BEFORE UPDATE OR DELETE ON acta_representacion
  FOR EACH ROW EXECUTE FUNCTION acta_detalle_inmodificable();
CREATE TRIGGER acta_representacion_impedir_truncate_trg
  BEFORE TRUNCATE ON acta_representacion
  FOR EACH STATEMENT EXECUTE FUNCTION acta_impedir_truncate();

CREATE FUNCTION auditar_acta_resultado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
  VALUES (NEW.generada_por, 'acta_generada', 'acta_resultado', NEW.id, NEW.edicion_id);
  RETURN NULL;
END
$$;

CREATE TRIGGER acta_resultado_auditar_trg
  AFTER INSERT ON acta_resultado
  FOR EACH ROW EXECUTE FUNCTION auditar_acta_resultado();

-- ---------------------------------------------------------------------------
-- Compatibilidad con la eliminación completa de una edición (0025/0028/0034).
-- ---------------------------------------------------------------------------

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
  IF tipo = 'calculo_resultado' AND EXISTS (
    SELECT 1 FROM calculo_resultado WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'empate_resultado' AND EXISTS (
    SELECT 1 FROM empate_resultado WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'acta_resultado' AND EXISTS (
    SELECT 1 FROM acta_resultado WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'acta_representacion' AND EXISTS (
    SELECT 1 FROM acta_representacion WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION eliminar_edicion_completa(objetivo uuid, actor text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE edicion_estado text;
DECLARE eliminadas integer;
BEGIN
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

  DELETE FROM acta_representacion WHERE edicion_id = objetivo;
  DELETE FROM acta_resultado WHERE edicion_id = objetivo;
  DELETE FROM empate_resultado WHERE edicion_id = objetivo;
  DELETE FROM resultado_rubro_sujeto WHERE edicion_id = objetivo;
  DELETE FROM resultado_comparsa WHERE edicion_id = objetivo;
  DELETE FROM calculo_resultado WHERE edicion_id = objetivo;
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
  DELETE FROM categoria_rubro WHERE edicion_id = objetivo;
  DELETE FROM integrante_grupo WHERE edicion_id = objetivo;
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

GRANT SELECT, DELETE ON acta_resultado, acta_representacion
  TO carnavales_propietario_eliminacion;
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
