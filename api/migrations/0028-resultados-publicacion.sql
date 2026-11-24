-- Migración 0028: cálculo de resultados, snapshots inmutables, empates y publicación (P6C).
-- Reglas confirmadas (D15, D16, D24, R1, D21):
--   - Solo se calculan y publican resultados sobre ediciones CLOSED y no retiradas.
--   - Cada cálculo genera un nuevo snapshot inmutable (numero incremental por edición);
--     un único snapshot puede pasar a PUBLICADO por edición.
--   - Ningún snapshot se publica si tiene empates en estado PENDIENTE.
--   - Solo ESCRIBANO calcula, resuelve empates y publica; auditoría atómica con edicion_id.
--   - Append-only con protección UPDATE/DELETE/TRUNCATE y compatibilidad con 0025.

CREATE TABLE calculo_resultado (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id             uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  version_reglamento_id  uuid NOT NULL,
  numero                 integer NOT NULL CHECK (numero > 0),
  algoritmo              text NOT NULL DEFAULT 'GOYA_2026_V1',
  parametros             jsonb NOT NULL,
  hash_entradas          text NOT NULL CHECK (hash_entradas ~ '^[0-9a-f]{64}$'),
  estado                 text NOT NULL DEFAULT 'CALCULADO' CHECK (estado IN ('CALCULADO', 'PUBLICADO')),
  calculado_por          text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  calculado_en           timestamptz NOT NULL DEFAULT clock_timestamp(),
  transaccion_creacion   xid8 NOT NULL DEFAULT pg_current_xact_id(),
  publicado_por          text REFERENCES usuario (id) ON DELETE RESTRICT,
  publicado_en           timestamptz,
  FOREIGN KEY (version_reglamento_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (edicion_id, numero),
  UNIQUE (id, edicion_id),
  CONSTRAINT calculo_resultado_publicacion_completa_ck CHECK (
    (estado = 'PUBLICADO') = (publicado_por IS NOT NULL AND publicado_en IS NOT NULL)
  )
);

CREATE UNIQUE INDEX calculo_resultado_unico_publicado_idx
  ON calculo_resultado (edicion_id) WHERE estado = 'PUBLICADO';

CREATE TABLE resultado_comparsa (
  calculo_id              uuid NOT NULL,
  edicion_id              uuid NOT NULL,
  comparsa_id             uuid NOT NULL,
  categoria               text NOT NULL CHECK (categoria IN ('PRIMERA', 'AGRUPACION')),
  puntaje_fijos           numeric(10,2) NOT NULL,
  puntaje_nominativos     numeric(10,2) NOT NULL,
  puntaje_carros          numeric(10,2) NOT NULL,
  descuento_rubros        numeric(10,2) NOT NULL CHECK (descuento_rubros >= 0),
  descuento_general       numeric(10,2) NOT NULL CHECK (descuento_general >= 0),
  puntaje_total           numeric(10,2) NOT NULL CHECK (puntaje_total >= 0),
  descalificada_comparsa  boolean NOT NULL DEFAULT false,
  posicion                integer CHECK (posicion IS NULL OR posicion > 0),
  empatado                boolean NOT NULL DEFAULT false,
  detalle                 jsonb NOT NULL,
  PRIMARY KEY (calculo_id, comparsa_id),
  FOREIGN KEY (calculo_id, edicion_id) REFERENCES calculo_resultado (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (comparsa_id, edicion_id) REFERENCES comparsa (id, edicion_id) ON DELETE RESTRICT
);

CREATE INDEX resultado_comparsa_edicion_idx ON resultado_comparsa (edicion_id, calculo_id);

CREATE TABLE resultado_rubro_sujeto (
  calculo_id         uuid NOT NULL,
  edicion_id         uuid NOT NULL,
  rubro_version_id   uuid NOT NULL,
  sujeto_id          uuid NOT NULL,
  comparsa_id        uuid NOT NULL,
  puntaje_artistico  numeric(10,2) NOT NULL,
  descuento_rubro    numeric(10,2) NOT NULL CHECK (descuento_rubro >= 0),
  puntaje_neto       numeric(10,2) NOT NULL CHECK (puntaje_neto >= 0),
  posicion           integer NOT NULL CHECK (posicion > 0),
  empatado           boolean NOT NULL DEFAULT false,
  PRIMARY KEY (calculo_id, rubro_version_id, sujeto_id),
  FOREIGN KEY (calculo_id, edicion_id) REFERENCES calculo_resultado (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (rubro_version_id, edicion_id) REFERENCES rubro_version (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (sujeto_id, edicion_id) REFERENCES sujeto_evaluable (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (comparsa_id, edicion_id) REFERENCES comparsa (id, edicion_id) ON DELETE RESTRICT
);

CREATE INDEX resultado_rubro_sujeto_edicion_idx ON resultado_rubro_sujeto (edicion_id, calculo_id, rubro_version_id);

CREATE TABLE empate_resultado (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculo_id           uuid NOT NULL,
  edicion_id           uuid NOT NULL,
  ambito               text NOT NULL CHECK (ambito IN ('COMPARSA', 'RUBRO')),
  rubro_version_id     uuid,
  posicion_empatada    integer NOT NULL CHECK (posicion_empatada > 0),
  puntaje_empatado     numeric(10,2) NOT NULL,
  candidatos_ids       uuid[] NOT NULL CHECK (cardinality(candidatos_ids) >= 2),
  estado               text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'RESUELTO')),
  ganador_comparsa_id  uuid,
  ganador_sujeto_id    uuid,
  motivo_resolucion    text CHECK (motivo_resolucion IS NULL OR length(btrim(motivo_resolucion)) > 0),
  referencia_acta      text CHECK (referencia_acta IS NULL OR length(btrim(referencia_acta)) > 0),
  resuelto_por         text REFERENCES usuario (id) ON DELETE RESTRICT,
  resuelto_en          timestamptz,
  FOREIGN KEY (calculo_id, edicion_id) REFERENCES calculo_resultado (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (rubro_version_id, edicion_id) REFERENCES rubro_version (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (ganador_comparsa_id, edicion_id) REFERENCES comparsa (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (ganador_sujeto_id, edicion_id) REFERENCES sujeto_evaluable (id, edicion_id) ON DELETE RESTRICT,
  CONSTRAINT empate_ambito_rubro_ck CHECK ((ambito = 'COMPARSA') = (rubro_version_id IS NULL)),
  CONSTRAINT empate_resolucion_completa_ck CHECK (
    (estado = 'RESUELTO') = (
      resuelto_por IS NOT NULL
      AND resuelto_en IS NOT NULL
      AND motivo_resolucion IS NOT NULL
      AND referencia_acta IS NOT NULL
      AND (
        (ambito = 'COMPARSA' AND ganador_comparsa_id IS NOT NULL AND ganador_sujeto_id IS NULL)
        OR
        (ambito = 'RUBRO' AND ganador_sujeto_id IS NOT NULL AND ganador_comparsa_id IS NULL)
      )
    )
  ),
  CONSTRAINT empate_ganador_valido_ck CHECK (
    estado = 'PENDIENTE'
    OR (ambito = 'COMPARSA' AND ganador_comparsa_id = ANY(candidatos_ids))
    OR (ambito = 'RUBRO' AND ganador_sujeto_id = ANY(candidatos_ids))
  )
);

CREATE INDEX empate_resultado_calculo_idx ON empate_resultado (calculo_id, estado);

CREATE FUNCTION resultado_impedir_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'RESULTADO_INMODIFICABLE' USING ERRCODE = 'check_violation';
END
$$;

CREATE FUNCTION calculo_resultado_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fila_edicion record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'RESULTADO_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado <> 'CALCULADO' OR NEW.estado <> 'PUBLICADO' THEN
      RAISE EXCEPTION 'RESULTADO_INMODIFICABLE' USING ERRCODE = 'check_violation';
    END IF;
    IF (to_jsonb(NEW) - 'estado' - 'publicado_por' - 'publicado_en')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'estado' - 'publicado_por' - 'publicado_en') THEN
      RAISE EXCEPTION 'RESULTADO_INMODIFICABLE' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT estado, retirada_en INTO fila_edicion
    FROM edicion WHERE id = NEW.edicion_id FOR SHARE;
  IF fila_edicion.retirada_en IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
  END IF;
  IF fila_edicion.estado IS DISTINCT FROM 'CLOSED' THEN
    RAISE EXCEPTION 'EDICION_NO_CERRADA' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'CALCULADO' OR NEW.publicado_por IS NOT NULL OR NEW.publicado_en IS NOT NULL THEN
      RAISE EXCEPTION 'CALCULO_DEBE_CREARSE_CALCULADO' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM calculo_resultado WHERE edicion_id = NEW.edicion_id AND estado = 'PUBLICADO') THEN
      RAISE EXCEPTION 'RESULTADO_YA_PUBLICADO' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
     WHERE ur.usuario_id = NEW.calculado_por AND r.codigo = 'ESCRIBANO' FOR SHARE OF ur;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RESULTADO_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation';
    END IF;
    NEW.calculado_en := clock_timestamp();
    RETURN NEW;
  END IF;

  PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
   WHERE ur.usuario_id = NEW.publicado_por AND r.codigo = 'ESCRIBANO' FOR SHARE OF ur;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESULTADO_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM empate_resultado WHERE calculo_id = OLD.id AND estado = 'PENDIENTE') THEN
    RAISE EXCEPTION 'EMPATES_PENDIENTES' USING ERRCODE = 'check_violation';
  END IF;

  NEW.publicado_en := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE TRIGGER calculo_resultado_validar_cambio_trg
  BEFORE INSERT OR UPDATE OR DELETE ON calculo_resultado
  FOR EACH ROW EXECUTE FUNCTION calculo_resultado_validar_cambio();

CREATE TRIGGER calculo_resultado_impedir_truncate_trg
  BEFORE TRUNCATE ON calculo_resultado
  FOR EACH STATEMENT EXECUTE FUNCTION resultado_impedir_truncate();

CREATE FUNCTION resultado_calculo_exigir_contexto_insercion(calculo uuid, edicion uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  fila_calculo record;
BEGIN
  SELECT cr.estado, cr.calculado_por, cr.transaccion_creacion,
         e.estado AS estado_edicion, e.retirada_en
    INTO fila_calculo
    FROM calculo_resultado cr
    JOIN edicion e ON e.id = cr.edicion_id
   WHERE cr.id = calculo AND cr.edicion_id = edicion
   FOR SHARE OF cr, e;

  IF NOT FOUND OR fila_calculo.estado <> 'CALCULADO'
     OR fila_calculo.transaccion_creacion <> pg_current_xact_id() THEN
    RAISE EXCEPTION 'RESULTADO_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF fila_calculo.retirada_en IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
  END IF;
  IF fila_calculo.estado_edicion IS DISTINCT FROM 'CLOSED' THEN
    RAISE EXCEPTION 'EDICION_NO_CERRADA' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
   WHERE ur.usuario_id = fila_calculo.calculado_por AND r.codigo = 'ESCRIBANO'
   FOR SHARE OF ur;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESULTADO_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation';
  END IF;
END
$$;

CREATE FUNCTION resultado_detalle_inmodificable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'RESULTADO_INMODIFICABLE' USING ERRCODE = 'check_violation';
END
$$;

CREATE FUNCTION resultado_detalle_validar_insercion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM resultado_calculo_exigir_contexto_insercion(NEW.calculo_id, NEW.edicion_id);
  RETURN NEW;
END
$$;

CREATE TRIGGER resultado_comparsa_validar_insercion_trg
  BEFORE INSERT ON resultado_comparsa
  FOR EACH ROW EXECUTE FUNCTION resultado_detalle_validar_insercion();
CREATE TRIGGER resultado_comparsa_inmodificable_trg
  BEFORE UPDATE OR DELETE ON resultado_comparsa
  FOR EACH ROW EXECUTE FUNCTION resultado_detalle_inmodificable();
CREATE TRIGGER resultado_comparsa_impedir_truncate_trg
  BEFORE TRUNCATE ON resultado_comparsa
  FOR EACH STATEMENT EXECUTE FUNCTION resultado_impedir_truncate();

CREATE TRIGGER resultado_rubro_sujeto_validar_insercion_trg
  BEFORE INSERT ON resultado_rubro_sujeto
  FOR EACH ROW EXECUTE FUNCTION resultado_detalle_validar_insercion();
CREATE TRIGGER resultado_rubro_sujeto_inmodificable_trg
  BEFORE UPDATE OR DELETE ON resultado_rubro_sujeto
  FOR EACH ROW EXECUTE FUNCTION resultado_detalle_inmodificable();
CREATE TRIGGER resultado_rubro_sujeto_impedir_truncate_trg
  BEFORE TRUNCATE ON resultado_rubro_sujeto
  FOR EACH STATEMENT EXECUTE FUNCTION resultado_impedir_truncate();

CREATE FUNCTION empate_resultado_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  estado_calculo text;
  fila_edicion record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'RESULTADO_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'PENDIENTE' THEN
      RAISE EXCEPTION 'EMPATE_DEBE_CREARSE_PENDIENTE' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM resultado_calculo_exigir_contexto_insercion(NEW.calculo_id, NEW.edicion_id);
    RETURN NEW;
  END IF;

  IF OLD.estado <> 'PENDIENTE' OR NEW.estado <> 'RESUELTO' THEN
    RAISE EXCEPTION 'EMPATE_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - 'estado' - 'ganador_comparsa_id' - 'ganador_sujeto_id'
      - 'motivo_resolucion' - 'referencia_acta' - 'resuelto_por' - 'resuelto_en')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'estado' - 'ganador_comparsa_id' - 'ganador_sujeto_id'
      - 'motivo_resolucion' - 'referencia_acta' - 'resuelto_por' - 'resuelto_en') THEN
    RAISE EXCEPTION 'EMPATE_INMODIFICABLE' USING ERRCODE = 'check_violation';
  END IF;

  SELECT estado, retirada_en INTO fila_edicion FROM edicion WHERE id = NEW.edicion_id FOR SHARE;
  IF fila_edicion.retirada_en IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
  END IF;
  IF fila_edicion.estado IS DISTINCT FROM 'CLOSED' THEN
    RAISE EXCEPTION 'EDICION_NO_CERRADA' USING ERRCODE = 'check_violation';
  END IF;

  SELECT estado INTO estado_calculo FROM calculo_resultado WHERE id = OLD.calculo_id FOR SHARE;
  IF estado_calculo IS DISTINCT FROM 'CALCULADO' THEN
    RAISE EXCEPTION 'RESULTADO_YA_PUBLICADO' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
   WHERE ur.usuario_id = NEW.resuelto_por AND r.codigo = 'ESCRIBANO' FOR SHARE OF ur;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESULTADO_REQUIERE_ESCRIBANO' USING ERRCODE = 'check_violation';
  END IF;

  NEW.resuelto_en := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE TRIGGER empate_resultado_validar_cambio_trg
  BEFORE INSERT OR UPDATE OR DELETE ON empate_resultado
  FOR EACH ROW EXECUTE FUNCTION empate_resultado_validar_cambio();

CREATE TRIGGER empate_resultado_impedir_truncate_trg
  BEFORE TRUNCATE ON empate_resultado
  FOR EACH STATEMENT EXECUTE FUNCTION resultado_impedir_truncate();

CREATE FUNCTION auditar_calculo_resultado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
    VALUES (NEW.calculado_por, 'resultado_calculado', 'calculo_resultado', NEW.id, NEW.edicion_id);
  ELSIF OLD.estado = 'CALCULADO' AND NEW.estado = 'PUBLICADO' THEN
    INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
    VALUES (NEW.publicado_por, 'resultado_publicado', 'calculo_resultado', NEW.id, NEW.edicion_id);
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER calculo_resultado_auditar_trg
  AFTER INSERT OR UPDATE OF estado ON calculo_resultado
  FOR EACH ROW EXECUTE FUNCTION auditar_calculo_resultado();

CREATE FUNCTION auditar_empate_resultado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
  VALUES (NEW.resuelto_por, 'empate_resuelto', 'empate_resultado', NEW.id, NEW.edicion_id);
  RETURN NULL;
END
$$;

CREATE TRIGGER empate_resultado_auditar_trg
  AFTER UPDATE OF estado ON empate_resultado FOR EACH ROW
  WHEN (OLD.estado = 'PENDIENTE' AND NEW.estado = 'RESUELTO')
  EXECUTE FUNCTION auditar_empate_resultado();

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
  IF tipo = 'calculo_resultado' AND EXISTS (
    SELECT 1 FROM calculo_resultado WHERE id::text = identificador AND edicion_id = objetivo
  ) THEN RETURN true; END IF;
  IF tipo = 'empate_resultado' AND EXISTS (
    SELECT 1 FROM empate_resultado WHERE id::text = identificador AND edicion_id = objetivo
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

GRANT SELECT, DELETE ON calculo_resultado, resultado_comparsa, resultado_rubro_sujeto, empate_resultado
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
