-- Migración 0033: categorías del reglamento. Una categoría agrupa rubros de la misma versión
-- (por ejemplo, «Reina») y se usa para elegir a qué categoría pertenece un integrante.
-- Solo agrupa: no cambia puntajes ni cupos. Todo cambio exige que la versión esté en BORRADOR,
-- igual que los rubros (exigir_version_borrador, migración 0025).
--
-- Además, eliminar_edicion_completa borra las categorías después de los rubros que las usan,
-- para que una edición con categorías siga pudiendo eliminarse por completo.

CREATE TABLE categoria_rubro (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid NOT NULL,
  edicion_id  uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  nombre      text NOT NULL CHECK (length(btrim(nombre)) > 0),
  orden       integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (version_id, nombre),
  UNIQUE (version_id, orden),
  UNIQUE (id, version_id, edicion_id)
);

CREATE INDEX categoria_rubro_version_id_idx ON categoria_rubro (version_id);

CREATE TRIGGER categoria_rubro_exigir_borrador_trg
  BEFORE INSERT OR UPDATE OR DELETE ON categoria_rubro
  FOR EACH ROW EXECUTE FUNCTION exigir_version_borrador();

-- El rubro puede pertenecer a una categoría de su misma versión. Nulo = sin categoría.
ALTER TABLE rubro_version ADD COLUMN categoria_id uuid;
ALTER TABLE rubro_version ADD CONSTRAINT rubro_version_categoria_fk
  FOREIGN KEY (categoria_id, version_id, edicion_id)
  REFERENCES categoria_rubro (id, version_id, edicion_id) ON DELETE RESTRICT;
CREATE INDEX rubro_version_categoria_id_idx ON rubro_version (categoria_id);

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
GRANT EXECUTE ON FUNCTION eliminar_edicion_completa(uuid, text) TO PUBLIC;
DO $$
DECLARE nombre_esquema text := current_schema();
BEGIN
  EXECUTE format('ALTER FUNCTION %I.eliminar_edicion_completa(uuid, text) SET search_path TO pg_catalog, %I',
    nombre_esquema, nombre_esquema);
END
$$;
