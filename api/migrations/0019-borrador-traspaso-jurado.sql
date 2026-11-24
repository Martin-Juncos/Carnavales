CREATE TABLE borrador_traspaso_jurado (
  asignacion_id uuid PRIMARY KEY REFERENCES asignacion_jurado(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL,
  confirmacion_id uuid NOT NULL DEFAULT gen_random_uuid(),
  confirmado_en timestamptz,
  version_id uuid NOT NULL REFERENCES version_reglamento(id) ON DELETE RESTRICT,
  autor_id text NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT,
  puntajes jsonb NOT NULL CHECK (jsonb_typeof(puntajes) = 'array'),
  congelado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Both writers take the same assignment lock; a freeze and a receipt must
-- never coexist, including when the application write path is not used.
CREATE FUNCTION impedir_borrador_y_recepcion_simultaneos() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM noche n JOIN asignacion_jurado a ON a.noche_id = n.id
    WHERE a.id = NEW.asignacion_id FOR SHARE OF n;
  PERFORM 1 FROM asignacion_jurado WHERE id = NEW.asignacion_id FOR UPDATE;
  IF TG_TABLE_NAME = 'borrador_traspaso_jurado' THEN
    IF EXISTS (SELECT 1 FROM planilla_recibida WHERE asignacion_id = NEW.asignacion_id) THEN
      RAISE EXCEPTION 'PLANILLA_YA_RECIBIDA' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM asignacion_jurado a
      JOIN suplentes_asignacion_jurado s ON s.asignacion_activa_id = a.id
      JOIN noche n ON n.id = a.noche_id AND n.tipo = 'COMPETENCIA' AND n.estado = 'OPEN'
      JOIN instantanea_planillas_esperadas i ON i.noche_id = n.id AND i.version_id = NEW.version_id
      WHERE a.id = NEW.asignacion_id AND a.estado = 'ACTIVA' AND a.jurado_id = NEW.autor_id
        AND s.dispositivo_id IS NOT NULL AND i.filas_configuradas
    ) THEN
      RAISE EXCEPTION 'CONTEXTO_BORRADOR_TRASPASO_INVALIDO' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM borrador_traspaso_jurado WHERE asignacion_id = NEW.asignacion_id) THEN
    RAISE EXCEPTION 'BORRADOR_TRASPASO_CONGELADO' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER borrador_traspaso_sin_recepcion_trg
BEFORE INSERT ON borrador_traspaso_jurado
FOR EACH ROW EXECUTE FUNCTION impedir_borrador_y_recepcion_simultaneos();

CREATE TRIGGER recepcion_sin_borrador_traspaso_trg
BEFORE INSERT ON planilla_recibida
FOR EACH ROW EXECUTE FUNCTION impedir_borrador_y_recepcion_simultaneos();

CREATE FUNCTION impedir_mutacion_borrador_traspaso() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'borrador_traspaso_jurado' AND TG_OP = 'UPDATE' THEN
    IF OLD.confirmado_en IS NULL AND NEW.confirmado_en IS NOT NULL
      AND (to_jsonb(NEW) - 'confirmado_en') = (to_jsonb(OLD) - 'confirmado_en') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'BORRADOR_TRASPASO_INMODIFICABLE' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER borrador_traspaso_inmutable_trg
BEFORE UPDATE OR DELETE ON borrador_traspaso_jurado
FOR EACH ROW EXECUTE FUNCTION impedir_mutacion_borrador_traspaso();

CREATE TRIGGER borrador_traspaso_impedir_truncate_trg
BEFORE TRUNCATE ON borrador_traspaso_jurado
FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacion_borrador_traspaso();

CREATE TABLE relevo_asignacion_jurado (
  anterior_id uuid PRIMARY KEY REFERENCES asignacion_jurado(id) ON DELETE RESTRICT,
  sucesora_id uuid NOT NULL UNIQUE REFERENCES asignacion_jurado(id) ON DELETE RESTRICT,
  CHECK (anterior_id <> sucesora_id)
);

CREATE FUNCTION validar_enlace_relevo_jurado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_WHEN = 'BEFORE' THEN
    IF NOT EXISTS (SELECT 1 FROM suplentes_asignacion_jurado WHERE asignacion_activa_id = NEW.anterior_id) THEN
      RAISE EXCEPTION 'ENLACE_RELEVO_INVALIDO' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM suplentes_asignacion_jurado WHERE asignacion_activa_id = NEW.sucesora_id) THEN
    RAISE EXCEPTION 'ENLACE_RELEVO_INVALIDO' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER relevo_validar_origen_trg
BEFORE INSERT ON relevo_asignacion_jurado
FOR EACH ROW EXECUTE FUNCTION validar_enlace_relevo_jurado();

CREATE CONSTRAINT TRIGGER relevo_validar_destino_trg
AFTER INSERT ON relevo_asignacion_jurado DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validar_enlace_relevo_jurado();

CREATE TRIGGER relevo_asignacion_inmutable_trg
BEFORE UPDATE OR DELETE ON relevo_asignacion_jurado
FOR EACH ROW EXECUTE FUNCTION impedir_mutacion_borrador_traspaso();

CREATE TRIGGER relevo_asignacion_impedir_truncate_trg
BEFORE TRUNCATE ON relevo_asignacion_jurado
FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacion_borrador_traspaso();

CREATE FUNCTION puntajes_heredados_traspaso(asignacion uuid)
RETURNS TABLE (fila_id uuid, valor smallint, no_presentado boolean, autor_id text)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE anteriores(id) AS (
    SELECT anterior_id FROM relevo_asignacion_jurado WHERE sucesora_id = asignacion
    UNION
    SELECT r.anterior_id FROM relevo_asignacion_jurado r JOIN anteriores a ON a.id = r.sucesora_id
  )
  SELECT (p->>'filaId')::uuid, (p->>'valor')::smallint, (p->>'noPresentado')::boolean, b.autor_id
    FROM anteriores a JOIN borrador_traspaso_jurado b ON b.asignacion_id = a.id
    CROSS JOIN LATERAL jsonb_array_elements(b.puntajes) AS p;
$$;

ALTER TABLE puntaje_recibido ADD COLUMN autor_id text REFERENCES usuario(id) ON DELETE RESTRICT;

CREATE FUNCTION validar_puntajes_heredados_recibidos() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM puntajes_heredados_traspaso(NEW.asignacion_id) h
    LEFT JOIN puntaje_recibido p ON p.planilla_id = NEW.id AND p.fila_id = h.fila_id
    WHERE (p.valor, p.no_presentado, p.autor_id) IS DISTINCT FROM (h.valor, h.no_presentado, h.autor_id)
  ) THEN
    RAISE EXCEPTION 'PUNTAJES_HEREDADOS_INMODIFICABLES' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM puntaje_recibido p
    JOIN asignacion_jurado a ON a.id = NEW.asignacion_id
    JOIN suplentes_asignacion_jurado s ON s.asignacion_activa_id = a.id
    WHERE p.planilla_id = NEW.id AND p.autor_id IS DISTINCT FROM a.jurado_id
      AND NOT EXISTS (SELECT 1 FROM puntajes_heredados_traspaso(NEW.asignacion_id) h WHERE h.fila_id = p.fila_id)
  ) THEN
    RAISE EXCEPTION 'AUTORIA_PUNTAJE_INVALIDA' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- The existing seal runs first and validates the complete score set.
CREATE TRIGGER validar_puntajes_heredados_recibidos_trg
BEFORE INSERT ON planilla_recibida
FOR EACH ROW EXECUTE FUNCTION validar_puntajes_heredados_recibidos();

CREATE OR REPLACE FUNCTION validar_registro_suplentes_jurado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  titular text;
  estado_noche text;
  estado_asignacion text;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
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
