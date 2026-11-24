-- A full-edition purge is a narrowly privileged operation. The ordinary API
-- database role cannot write the authorization scope or execute the purge.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carnavales_propietario_eliminacion') THEN
    CREATE ROLE carnavales_propietario_eliminacion NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carnavales_servicio_eliminar_edicion') THEN
    CREATE ROLE carnavales_servicio_eliminar_edicion NOLOGIN NOINHERIT;
  END IF;
END
$$;

CREATE TABLE edicion_eliminacion_scope (
  transaction_id bigint NOT NULL,
  edicion_id uuid NOT NULL,
  PRIMARY KEY (transaction_id, edicion_id)
);

CREATE FUNCTION edicion_eliminacion_autorizada(objetivo uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT EXISTS (
    SELECT 1 FROM edicion_eliminacion_scope
     WHERE transaction_id = txid_current() AND edicion_id = objetivo
  )
$$;

CREATE FUNCTION auditoria_atribuible_a_edicion(objetivo uuid, tipo text, identificador text)
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
  RETURN false;
END
$$;

REVOKE ALL ON edicion_eliminacion_scope FROM PUBLIC;
REVOKE ALL ON FUNCTION edicion_eliminacion_autorizada(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auditoria_atribuible_a_edicion(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edicion_eliminacion_autorizada(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION auditoria_atribuible_a_edicion(uuid, text, text) TO PUBLIC;

DO $$
DECLARE nombre_esquema text := current_schema();
BEGIN
  IF to_regclass('enmienda_reglamento') IS NOT NULL THEN
    EXECUTE format($function$
      CREATE OR REPLACE FUNCTION %I.enmienda_reglamento_solo_registro() RETURNS trigger
      LANGUAGE plpgsql AS $body$
      BEGIN
        IF TG_OP = 'DELETE' AND edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'ENMIENDA_INMUTABLE' USING ERRCODE = 'check_violation';
      END
      $body$
    $function$, nombre_esquema);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION edicion_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'OPEN' AND NOT pg_has_role(current_user, 'carnavales_servicio_apertura', 'MEMBER') THEN
      RAISE EXCEPTION 'APERTURA_REQUIERE_SERVICIO' USING ERRCODE = 'check_violation';
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
  IF OLD.estado = 'OPEN' AND NEW.estado <> 'OPEN' THEN
    RAISE EXCEPTION 'EDICION_NO_REABRIBLE' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.estado = 'CONFIGURING' AND NEW.estado = 'OPEN'
     AND NOT pg_has_role(current_user, 'carnavales_servicio_apertura', 'MEMBER') THEN
    RAISE EXCEPTION 'APERTURA_REQUIERE_SERVICIO' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION version_reglamento_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'BORRADOR' THEN
      RAISE EXCEPTION 'VERSION_DEBE_CREARSE_EN_BORRADOR' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    IF OLD.estado <> 'BORRADOR' THEN
      RAISE EXCEPTION 'VERSION_NO_BORRABLE' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.copiada_de_id IS NOT NULL AND NEW.copiada_de_id IS NULL
     AND (to_jsonb(NEW) - 'copiada_de_id') = (to_jsonb(OLD) - 'copiada_de_id')
     AND EXISTS (
       SELECT 1 FROM version_reglamento origen
        WHERE origen.id = OLD.copiada_de_id
          AND edicion_eliminacion_autorizada(origen.edicion_id)
     ) THEN
    RETURN NEW;
  END IF;
  IF OLD.estado IS DISTINCT FROM NEW.estado AND NOT (
       (OLD.estado = 'BORRADOR' AND NEW.estado = 'PUBLICADA')
    OR (OLD.estado = 'PUBLICADA' AND NEW.estado IN ('SUPERSEDIDA', 'CONGELADA'))
  ) THEN
    RAISE EXCEPTION 'TRANSICION_VERSION_INVALIDA' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.estado <> 'BORRADOR' AND
     (NEW.numero, NEW.fuente, NEW.copiada_de_id, NEW.edicion_id)
     IS DISTINCT FROM
     (OLD.numero, OLD.fuente, OLD.copiada_de_id, OLD.edicion_id) THEN
    RAISE EXCEPTION 'VERSION_CONGELADA' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION validar_retiro_edicion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.id) THEN RETURN OLD; END IF;
    IF OLD.retirada_en IS NOT NULL THEN RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.retirada_en IS NOT NULL THEN RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation'; END IF;
  IF NEW.retirada_en IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation'; END IF;
    IF EXISTS (SELECT 1 FROM noche WHERE edicion_id = OLD.id AND tipo = 'COMPETENCIA' AND estado = 'OPEN') THEN
      RAISE EXCEPTION 'EDICION_EN_VOTACION' USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - 'retirada_en' - 'retirada_por') IS DISTINCT FROM
       (to_jsonb(OLD) - 'retirada_en' - 'retirada_por') THEN
      RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
      WHERE ur.usuario_id = NEW.retirada_por AND r.codigo = 'ADMINISTRADOR' FOR SHARE OF ur;
    IF NOT FOUND THEN RAISE EXCEPTION 'RETIRO_REQUIERE_ADMINISTRADOR' USING ERRCODE = 'check_violation'; END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION impedir_cambios_edicion_retirada() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'version_reglamento' AND TG_OP = 'UPDATE' THEN
    IF OLD.copiada_de_id IS NOT NULL AND NEW.copiada_de_id IS NULL
       AND (to_jsonb(NEW) - 'copiada_de_id') = (to_jsonb(OLD) - 'copiada_de_id')
       AND EXISTS (SELECT 1 FROM version_reglamento origen
                    WHERE origen.id = OLD.copiada_de_id
                      AND edicion_eliminacion_autorizada(origen.edicion_id)) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN PERFORM exigir_edicion_operativa(OLD.edicion_id); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'INSERT' OR NEW.edicion_id IS DISTINCT FROM OLD.edicion_id THEN
    PERFORM exigir_edicion_operativa(NEW.edicion_id);
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION proteger_retiro_en_cambio_de_noche() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'DRAFT' AND NEW.estado = 'OPEN' AND NEW.tipo = 'COMPETENCIA' THEN
    IF OLD.edicion_id IS DISTINCT FROM NEW.edicion_id THEN PERFORM exigir_edicion_operativa(OLD.edicion_id); END IF;
    UPDATE edicion SET retirada_en = retirada_en WHERE id = NEW.edicion_id;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN PERFORM exigir_edicion_operativa(OLD.edicion_id); END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'INSERT' OR NEW.edicion_id IS DISTINCT FROM OLD.edicion_id THEN
    PERFORM exigir_edicion_operativa(NEW.edicion_id);
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION impedir_cambios_asignacion_retirada() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE anterior uuid;
DECLARE siguiente uuid;
DECLARE edicion_objetivo uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'asignacion_jurado' THEN
      edicion_objetivo := OLD.edicion_id;
    ELSIF TG_TABLE_NAME IN ('suplentes_asignacion_jurado', 'borrador_traspaso_jurado') THEN
      SELECT edicion_id INTO edicion_objetivo FROM asignacion_jurado WHERE id = OLD.asignacion_id;
    ELSE
      SELECT edicion_id INTO edicion_objetivo FROM asignacion_jurado
       WHERE id IN (OLD.anterior_id, OLD.sucesora_id) ORDER BY edicion_id LIMIT 1;
    END IF;
    IF edicion_eliminacion_autorizada(edicion_objetivo) THEN RETURN OLD; END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN anterior := (to_jsonb(OLD) ->> TG_ARGV[0])::uuid; END IF;
  IF TG_OP <> 'DELETE' THEN siguiente := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid; END IF;
  PERFORM exigir_edicion_operativa(edicion_id) FROM asignacion_jurado
   WHERE id IN (anterior, siguiente) ORDER BY edicion_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION asignacion_jurado_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'ASIGNACION_NO_BORRABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.estado <> 'ACTIVA' OR NEW.estado <> 'REVOCADA' THEN
    RAISE EXCEPTION 'TRANSICION_ASIGNACION_INVALIDA' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.edicion_id, NEW.jurado_id, NEW.noche_id, NEW.especialidad_id, NEW.creada_por, NEW.creada_en)
     IS DISTINCT FROM
     (OLD.id, OLD.edicion_id, OLD.jurado_id, OLD.noche_id, OLD.especialidad_id, OLD.creada_por, OLD.creada_en) THEN
    RAISE EXCEPTION 'ASIGNACION_INMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION auditoria_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM edicion_eliminacion_scope s
       WHERE s.transaction_id = txid_current()
         AND (s.edicion_id = OLD.edicion_id OR
              auditoria_atribuible_a_edicion(s.edicion_id, OLD.entidad_tipo, OLD.entidad_id))
    ) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'AUDITORIA_NO_MODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;
  RAISE EXCEPTION 'AUDITORIA_NO_MODIFICABLE' USING ERRCODE = 'check_violation';
END
$$;

CREATE OR REPLACE FUNCTION exigir_padron_editable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE edicion uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    edicion := OLD.edicion_id;
  ELSE edicion := NEW.edicion_id;
  END IF;
  PERFORM 1 FROM noche WHERE edicion_id = edicion FOR SHARE;
  IF EXISTS (SELECT 1 FROM noche WHERE edicion_id = edicion AND estado <> 'DRAFT') THEN
    RAISE EXCEPTION 'PADRON_CONGELADO' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION orden_presentacion_exigir_noche_draft() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE ids_noche uuid[];
DECLARE fila_noche record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    ids_noche := ARRAY[OLD.noche_id];
  ELSIF TG_OP = 'UPDATE' THEN ids_noche := ARRAY[OLD.noche_id, NEW.noche_id];
  ELSE ids_noche := ARRAY[NEW.noche_id];
  END IF;
  FOR fila_noche IN
    SELECT n.id, n.estado FROM noche n WHERE n.id = ANY(ids_noche)
     ORDER BY n.id FOR UPDATE OF n
  LOOP
    IF fila_noche.estado IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'ORDEN_CONGELADO' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION pasada_exigir_noche_draft() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE ids_orden uuid[];
DECLARE fila_noche record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    ids_orden := ARRAY[OLD.orden_presentacion_id];
  ELSIF TG_OP = 'UPDATE' THEN ids_orden := ARRAY[OLD.orden_presentacion_id, NEW.orden_presentacion_id];
  ELSE ids_orden := ARRAY[NEW.orden_presentacion_id];
  END IF;
  FOR fila_noche IN
    SELECT n.id, n.estado FROM noche n JOIN orden_presentacion op ON op.noche_id = n.id
     WHERE op.id = ANY(ids_orden) ORDER BY n.id FOR UPDATE OF n
  LOOP
    IF fila_noche.estado IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'PASADA_NOCHE_NO_EDITABLE' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION exigir_version_borrador() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE ids_version uuid[];
DECLARE fila_version record;
BEGIN
  IF TG_OP = 'INSERT' THEN ids_version := ARRAY[NEW.version_id];
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM version_reglamento v WHERE v.id = OLD.version_id
                AND edicion_eliminacion_autorizada(v.edicion_id)) THEN RETURN OLD; END IF;
    ids_version := ARRAY[OLD.version_id];
  ELSE ids_version := ARRAY[OLD.version_id, NEW.version_id];
  END IF;
  FOR fila_version IN SELECT v.estado FROM version_reglamento v
    WHERE v.id = ANY(ids_version) ORDER BY v.id FOR SHARE
  LOOP
    IF fila_version.estado <> 'BORRADOR' THEN
      RAISE EXCEPTION 'VERSION_NO_BORRADOR' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION exigir_rubro_especialidad_borrador() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE id_rubro uuid;
DECLARE estado_version text;
DECLARE edicion_objetivo uuid;
BEGIN
  id_rubro := CASE WHEN TG_OP = 'DELETE' THEN OLD.rubro_version_id ELSE NEW.rubro_version_id END;
  SELECT rv.edicion_id, v.estado INTO edicion_objetivo, estado_version
    FROM rubro_version rv JOIN version_reglamento v ON v.id = rv.version_id
   WHERE rv.id = id_rubro FOR SHARE OF v;
  IF TG_OP = 'DELETE' AND edicion_eliminacion_autorizada(edicion_objetivo) THEN RETURN OLD; END IF;
  IF estado_version IS DISTINCT FROM 'BORRADOR' THEN
    RAISE EXCEPTION 'VERSION_NO_BORRADOR' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION instantanea_planillas_esperadas_solo_registro() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'INSTANTANEA_INMODIFICABLE' USING ERRCODE = 'check_violation';
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
  IF OLD.estado = 'DRAFT' AND NEW.estado = 'OPEN'
     AND NOT pg_has_role(current_user, 'carnavales_servicio_apertura', 'MEMBER') THEN
    RAISE EXCEPTION 'APERTURA_REQUIERE_SERVICIO' USING ERRCODE = 'check_violation';
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

CREATE OR REPLACE FUNCTION exigir_configuracion_planilla_editable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE estado_noche text;
DECLARE id_noche uuid;
DECLARE edicion_objetivo uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'CONFIGURACION_PLANILLA_PROTEGIDA' USING ERRCODE = 'check_violation';
  END IF;
  id_noche := CASE WHEN TG_OP = 'DELETE' THEN OLD.noche_id ELSE NEW.noche_id END;
  IF TG_OP = 'DELETE' THEN
    SELECT edicion_id INTO edicion_objetivo FROM noche WHERE id = id_noche;
    IF edicion_eliminacion_autorizada(edicion_objetivo) THEN RETURN OLD; END IF;
  END IF;
  SELECT estado INTO estado_noche FROM noche
   WHERE id = id_noche AND (TG_OP = 'DELETE' OR tipo = 'COMPETENCIA') FOR SHARE;
  IF estado_noche IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'CONFIGURACION_PLANILLA_PROTEGIDA' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION impedir_cambio_planilla_recibida() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE edicion_objetivo uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'planilla_recibida' THEN
      SELECT edicion_id INTO edicion_objetivo FROM asignacion_jurado WHERE id = OLD.asignacion_id;
    ELSE
      SELECT a.edicion_id INTO edicion_objetivo
        FROM planilla_recibida p JOIN asignacion_jurado a ON a.id = p.asignacion_id
       WHERE p.id = OLD.planilla_id;
    END IF;
    IF edicion_eliminacion_autorizada(edicion_objetivo) THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'PLANILLA_RECIBIDA_INMODIFICABLE' USING ERRCODE = 'check_violation';
END
$$;

CREATE OR REPLACE FUNCTION validar_registro_suplentes_jurado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  titular text;
  estado_noche text;
  estado_asignacion text;
  edicion_objetivo uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT edicion_id INTO edicion_objetivo FROM asignacion_jurado WHERE id = OLD.asignacion_id;
    IF edicion_eliminacion_autorizada(edicion_objetivo) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'REGISTRO_SUPLENTES_INMODIFICABLE' USING ERRCODE = 'check_violation';
  ELSIF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'REGISTRO_SUPLENTES_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.asignacion_id IS DISTINCT FROM OLD.asignacion_id
       OR NEW.primer_suplente_id IS DISTINCT FROM OLD.primer_suplente_id
       OR NEW.segundo_suplente_id IS DISTINCT FROM OLD.segundo_suplente_id
       OR (OLD.detalle_esperado_id IS NOT NULL AND NEW.detalle_esperado_id IS DISTINCT FROM OLD.detalle_esperado_id)
       OR (NEW.detalle_esperado_id IS DISTINCT FROM OLD.detalle_esperado_id AND
           (NEW.asignacion_activa_id = OLD.asignacion_activa_id OR NOT EXISTS (
             SELECT 1 FROM instantanea_planilla_esperada_detalle
              WHERE id = NEW.detalle_esperado_id AND asignacion_id = OLD.asignacion_activa_id
            ))) THEN
      RAISE EXCEPTION 'CAMBIO_SUPLENTES_INVALIDO' USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.asignacion_activa_id = OLD.asignacion_activa_id THEN
      IF OLD.dispositivo_id IS NOT NULL AND NEW.dispositivo_id IS DISTINCT FROM OLD.dispositivo_id THEN
        RAISE EXCEPTION 'CAMBIO_SUPLENTES_INVALIDO' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      IF NEW.dispositivo_id IS NOT NULL
         OR (OLD.dispositivo_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM borrador_traspaso_jurado
            WHERE asignacion_id = OLD.asignacion_activa_id AND confirmado_en IS NOT NULL
         ))
         OR (NEW.detalle_esperado_id IS NULL AND EXISTS (
           SELECT 1 FROM instantanea_planilla_esperada_detalle WHERE asignacion_id = OLD.asignacion_activa_id
         ))
         OR NOT EXISTS (
           SELECT 1 FROM relevo_asignacion_jurado r
           JOIN asignacion_jurado a ON a.id = r.sucesora_id
           JOIN asignacion_jurado original ON original.id = NEW.asignacion_id
           JOIN asignacion_jurado anterior ON anterior.id = r.anterior_id
           WHERE r.anterior_id = OLD.asignacion_activa_id AND r.sucesora_id = NEW.asignacion_activa_id
             AND a.estado = 'ACTIVA' AND anterior.estado = 'REVOCADA'
             AND a.edicion_id = original.edicion_id AND a.noche_id = original.noche_id
             AND a.especialidad_id = original.especialidad_id
             AND a.jurado_id IN (NEW.primer_suplente_id, NEW.segundo_suplente_id)
         ) THEN
        RAISE EXCEPTION 'CAMBIO_SUPLENTES_INVALIDO' USING ERRCODE = 'check_violation';
      END IF;
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

CREATE OR REPLACE FUNCTION impedir_mutacion_borrador_traspaso() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE edicion_objetivo uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'borrador_traspaso_jurado' THEN
      SELECT edicion_id INTO edicion_objetivo FROM asignacion_jurado WHERE id = OLD.asignacion_id;
    ELSE
      SELECT edicion_id INTO edicion_objetivo FROM asignacion_jurado
       WHERE id IN (OLD.anterior_id, OLD.sucesora_id) ORDER BY edicion_id LIMIT 1;
    END IF;
    IF edicion_eliminacion_autorizada(edicion_objetivo) THEN RETURN OLD; END IF;
  END IF;
  IF TG_TABLE_NAME = 'borrador_traspaso_jurado' AND TG_OP = 'UPDATE'
     AND OLD.confirmado_en IS NULL AND NEW.confirmado_en IS NOT NULL
     AND (to_jsonb(NEW) - 'confirmado_en') = (to_jsonb(OLD) - 'confirmado_en') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'BORRADOR_TRASPASO_INMODIFICABLE' USING ERRCODE = 'check_violation';
END
$$;

CREATE OR REPLACE FUNCTION eliminar_edicion_completa(objetivo uuid, actor text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE edicion_estado text;
DECLARE tabla text;
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

  -- Follow night -> edition ordering used by opening and closure. This avoids
  -- the historical night/edition lock inversion and serializes child creation.
  PERFORM id FROM noche WHERE edicion_id = objetivo ORDER BY id FOR UPDATE;
  SELECT estado INTO edicion_estado FROM edicion WHERE id = objetivo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EDICION_INEXISTENTE' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM noche WHERE edicion_id = objetivo AND tipo = 'COMPETENCIA' AND estado = 'OPEN') THEN
    RAISE EXCEPTION 'EDICION_EN_VOTACION' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO edicion_eliminacion_scope (transaction_id, edicion_id)
    VALUES (txid_current(), objetivo);

  -- Preserve copied regulation content in other editions, removing only its
  -- provenance link to versions that are about to disappear.
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

-- The non-login owner is not granted to the API identity. It owns the private
-- transaction marker and performs DML only inside the audited database routine.
DO $$
BEGIN
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO carnavales_propietario_eliminacion', current_schema());
END
$$;
GRANT SELECT, UPDATE, DELETE ON edicion, version_reglamento, noche, especialidad,
  asignacion_jurado, auditoria, comparsa, participante, sujeto_evaluable,
  orden_presentacion, pasada, operacion_apertura, rubro_version, escala_puntaje_version,
  rubro_especialidad, premio_version, requisito_version, fila_planilla,
  instantanea_planillas_esperadas, instantanea_planilla_esperada_detalle,
  configuracion_planilla_noche, configuracion_planilla_noche_fila,
  planilla_recibida, puntaje_recibido, suplentes_asignacion_jurado,
  borrador_traspaso_jurado, relevo_asignacion_jurado, rol
  TO carnavales_propietario_eliminacion;
GRANT SELECT, UPDATE ON usuario_rol TO carnavales_propietario_eliminacion;
GRANT SELECT, INSERT, DELETE ON edicion_eliminacion_scope TO carnavales_propietario_eliminacion;
DO $$
BEGIN
  IF to_regclass('enmienda_reglamento') IS NOT NULL THEN
    GRANT SELECT, DELETE ON enmienda_reglamento TO carnavales_propietario_eliminacion;
  END IF;
END
$$;

ALTER TABLE edicion_eliminacion_scope OWNER TO carnavales_propietario_eliminacion;
ALTER FUNCTION edicion_eliminacion_autorizada(uuid) OWNER TO carnavales_propietario_eliminacion;
ALTER FUNCTION auditoria_atribuible_a_edicion(uuid, text, text) OWNER TO carnavales_propietario_eliminacion;
ALTER FUNCTION eliminar_edicion_completa(uuid, text) OWNER TO carnavales_propietario_eliminacion;
REVOKE ALL ON FUNCTION eliminar_edicion_completa(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eliminar_edicion_completa(uuid, text) TO carnavales_servicio_eliminar_edicion;
DO $$
DECLARE nombre_esquema text := current_schema();
BEGIN
  EXECUTE format('ALTER FUNCTION %I.edicion_eliminacion_autorizada(uuid) SET search_path TO pg_catalog, %I',
    nombre_esquema, nombre_esquema);
  EXECUTE format('ALTER FUNCTION %I.auditoria_atribuible_a_edicion(uuid, text, text) SET search_path TO pg_catalog, %I',
    nombre_esquema, nombre_esquema);
  EXECUTE format('ALTER FUNCTION %I.eliminar_edicion_completa(uuid, text) SET search_path TO pg_catalog, %I',
    nombre_esquema, nombre_esquema);
  IF to_regclass('enmienda_reglamento') IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %I.enmienda_reglamento_solo_registro() SET search_path TO pg_catalog, %I',
      nombre_esquema, nombre_esquema);
  END IF;
END
$$;
