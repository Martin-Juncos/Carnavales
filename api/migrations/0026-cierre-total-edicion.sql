-- Migración 0026: cierre total de la votación de una edición (P6A).
-- Reglas confirmadas (D10, D15, D21):
--   - Solo el Escribano ejecuta OPEN -> CLOSED cuando existe al menos una noche
--     COMPETENCIA con cuenta_para_puntaje = true, todas esas noches están en CLOSED
--     y ninguna noche COMPETENCIA está en OPEN (las noches PREMIACION no bloquean).
--   - La transición es irreversible, genera auditoría votacion_cerrada con edicion_id
--     en la misma transacción y congela cambios operativos y recepción de nuevas planillas.
--   - La eliminación completa de ediciones (0025) conserva compatibilidad sobre ediciones CLOSED.

DO $$
DECLARE restriccion record;
BEGIN
  FOR restriccion IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'edicion'::regclass
       AND contype = 'c'
       AND (pg_get_constraintdef(oid) LIKE '%CONFIGURING%'
            OR pg_get_constraintdef(oid) LIKE '%abierta_en%')
  LOOP
    EXECUTE format('ALTER TABLE edicion DROP CONSTRAINT %I', restriccion.conname);
  END LOOP;
END
$$;

ALTER TABLE edicion
  ADD COLUMN cerrada_por text REFERENCES usuario(id) ON DELETE RESTRICT,
  ADD COLUMN cerrada_en timestamptz,
  ADD CONSTRAINT edicion_estado_check CHECK (estado IN ('CONFIGURING', 'OPEN', 'CLOSED')),
  ADD CONSTRAINT edicion_apertura_completa CHECK ((estado IN ('OPEN', 'CLOSED')) = (abierta_en IS NOT NULL)),
  ADD CONSTRAINT edicion_cierre_completo CHECK ((estado = 'CLOSED') = (cerrada_en IS NOT NULL AND cerrada_por IS NOT NULL)),
  ADD CONSTRAINT edicion_cerrada_no_retirada CHECK (NOT (estado = 'CLOSED' AND retirada_en IS NOT NULL));

CREATE FUNCTION motivo_bloqueo_cierre_total(edicion_objetivo uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN e.id IS NULL THEN 'edicion_inexistente'
    WHEN e.retirada_en IS NOT NULL THEN 'edicion_retirada'
    WHEN e.estado = 'CLOSED' THEN 'edicion_cerrada'
    WHEN e.estado <> 'OPEN' THEN 'edicion_no_abierta'
    WHEN NOT EXISTS (
      SELECT 1 FROM noche n
       WHERE n.edicion_id = e.id
         AND n.tipo = 'COMPETENCIA'
         AND n.cuenta_para_puntaje = true
    ) THEN 'sin_noches_puntuables'
    WHEN EXISTS (
      SELECT 1 FROM noche n
       WHERE n.edicion_id = e.id
         AND n.tipo = 'COMPETENCIA'
         AND n.estado = 'OPEN'
    ) THEN 'noches_en_votacion'
    WHEN EXISTS (
      SELECT 1 FROM noche n
       WHERE n.edicion_id = e.id
         AND n.tipo = 'COMPETENCIA'
         AND n.cuenta_para_puntaje = true
         AND n.estado <> 'CLOSED'
    ) THEN 'noches_puntuables_pendientes'
    ELSE NULL
  END
  FROM (SELECT edicion_objetivo AS id) objetivo
  LEFT JOIN edicion e ON e.id = objetivo.id;
$$;

CREATE OR REPLACE FUNCTION exigir_edicion_operativa(identificador uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  retiro timestamptz;
  estado_actual text;
BEGIN
  SELECT retirada_en, estado INTO retiro, estado_actual
    FROM edicion WHERE id = identificador FOR SHARE;
  IF retiro IS NOT NULL THEN
    RAISE EXCEPTION 'EDICION_RETIRADA' USING ERRCODE = 'check_violation';
  END IF;
  IF estado_actual = 'CLOSED' THEN
    RAISE EXCEPTION 'EDICION_CERRADA' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION proteger_retiro_en_cambio_de_noche() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND edicion_eliminacion_autorizada(OLD.edicion_id) THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'DRAFT' AND NEW.estado = 'OPEN' AND NEW.tipo = 'COMPETENCIA' THEN
    IF OLD.edicion_id IS DISTINCT FROM NEW.edicion_id THEN PERFORM exigir_edicion_operativa(OLD.edicion_id); END IF;
    PERFORM exigir_edicion_operativa(NEW.edicion_id);
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

CREATE OR REPLACE FUNCTION edicion_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  motivo text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'CLOSED' OR NEW.cerrada_por IS NOT NULL OR NEW.cerrada_en IS NOT NULL THEN
      RAISE EXCEPTION 'EDICION_NO_CREABLE_CERRADA' USING ERRCODE = 'check_violation';
    END IF;
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

  IF OLD.estado = 'CONFIGURING' AND NEW.estado = 'OPEN'
     AND NOT pg_has_role(current_user, 'carnavales_servicio_apertura', 'MEMBER') THEN
    RAISE EXCEPTION 'APERTURA_REQUIERE_SERVICIO' USING ERRCODE = 'check_violation';
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
    IF OLD.estado = 'CLOSED' THEN RAISE EXCEPTION 'EDICION_CERRADA' USING ERRCODE = 'check_violation'; END IF;
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

CREATE FUNCTION auditar_cierre_edicion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
  VALUES (NEW.cerrada_por, 'votacion_cerrada', 'edicion', NEW.id, NEW.id);
  RETURN NULL;
END
$$;

CREATE TRIGGER edicion_auditar_cierre_trg
  AFTER UPDATE OF estado ON edicion FOR EACH ROW
  WHEN (OLD.estado = 'OPEN' AND NEW.estado = 'CLOSED')
  EXECUTE FUNCTION auditar_cierre_edicion();
