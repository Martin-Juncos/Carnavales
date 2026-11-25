-- Migración 0034: integrantes de un sujeto GRUPO y representación de cada sujeto.
-- Integrante de grupo: un participante de la edición que forma parte de un grupo (sujeto GRUPO).
-- Es información de la planilla: el puntaje lo recibe el grupo, no cada integrante.
-- La representación es el texto «Representa: …» de un sujeto. Es opcional y tiene un máximo.
-- Ambos cambios siguen el padrón: solo se editan mientras ninguna noche esté abierta.

CREATE TABLE integrante_grupo (
  edicion_id      uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  sujeto_id       uuid NOT NULL,
  participante_id uuid NOT NULL,
  PRIMARY KEY (sujeto_id, participante_id),
  FOREIGN KEY (sujeto_id, edicion_id) REFERENCES sujeto_evaluable (id, edicion_id) ON DELETE CASCADE,
  FOREIGN KEY (participante_id, edicion_id) REFERENCES participante (id, edicion_id) ON DELETE RESTRICT
);

CREATE INDEX integrante_grupo_participante_id_idx ON integrante_grupo (participante_id, edicion_id);

-- Solo un sujeto GRUPO admite integrantes. El tipo de un sujeto no cambia después de crearse.
CREATE FUNCTION exigir_sujeto_grupo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE tipo text;
BEGIN
  SELECT s.tipo_sujeto INTO tipo FROM sujeto_evaluable s
   WHERE s.id = NEW.sujeto_id AND s.edicion_id = NEW.edicion_id;
  IF tipo IS DISTINCT FROM 'GRUPO' THEN
    RAISE EXCEPTION 'SUJETO_NO_GRUPO' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER integrante_grupo_exigir_sujeto_grupo_trg
  BEFORE INSERT OR UPDATE ON integrante_grupo
  FOR EACH ROW EXECUTE FUNCTION exigir_sujeto_grupo();

-- Mismo bloqueo que el padrón: con una noche abierta no se cambian integrantes.
CREATE TRIGGER integrante_grupo_exigir_padron_editable_trg
  BEFORE INSERT OR UPDATE OR DELETE ON integrante_grupo
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

ALTER TABLE sujeto_evaluable ADD COLUMN representacion text
  CHECK (representacion IS NULL OR (length(btrim(representacion)) > 0 AND length(representacion) <= 1000));

-- ---------------------------------------------------------------------------
-- Borrado completo de una edición: versión vigente de 0029 más el borrado de categorías.
-- ---------------------------------------------------------------------------
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
  -- Las categorías se borran después de los rubros que las referencian.
  DELETE FROM categoria_rubro WHERE edicion_id = objetivo;
  -- Integrantes de grupo: configuración del sujeto GRUPO, se borra antes que el sujeto.
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

ALTER FUNCTION eliminar_edicion_completa(uuid, text) OWNER TO carnavales_propietario_eliminacion;
GRANT SELECT, DELETE ON categoria_rubro TO carnavales_propietario_eliminacion;
GRANT SELECT, DELETE ON integrante_grupo TO carnavales_propietario_eliminacion;
GRANT EXECUTE ON FUNCTION eliminar_edicion_completa(uuid, text) TO PUBLIC;
DO $$
DECLARE nombre_esquema text := current_schema();
BEGIN
  EXECUTE format('ALTER FUNCTION %I.eliminar_edicion_completa(uuid, text) SET search_path TO pg_catalog, %I',
    nombre_esquema, nombre_esquema);
END
$$;
