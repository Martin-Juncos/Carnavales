-- Migración 0008 (alcance aprobado): padrón del evento.
-- Crea comparsas, participantes, sujetos evaluables, orden de presentación y pasadas,
-- con las reglas de congelación de la opción B: el padrón se congela al abrir la
-- primera noche; el orden y las pasadas se congelan con su propia noche.
-- No incluye rubros, escalas, premios, planillas ni reglas de cálculo: siguen sin
-- aplicar en api/migrations/pendientes/ por decisiones pendientes.
-- Debe ejecutarse después de 0007-asignaciones-jurado.sql.

-- ---------------------------------------------------------------------------
-- Padrón editable: mientras ninguna noche de la edición haya salido de DRAFT.
-- El bloqueo FOR SHARE serializa esta comprobación con una apertura concurrente.
-- ---------------------------------------------------------------------------

CREATE FUNCTION exigir_padron_editable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  edicion uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    edicion := OLD.edicion_id;
  ELSE
    edicion := NEW.edicion_id;
  END IF;
  PERFORM 1 FROM noche WHERE edicion_id = edicion FOR SHARE;
  IF EXISTS (SELECT 1 FROM noche WHERE edicion_id = edicion AND estado <> 'DRAFT') THEN
    RAISE EXCEPTION 'PADRON_CONGELADO' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Comparsas
-- ---------------------------------------------------------------------------

CREATE TABLE comparsa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id  uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  nombre      text NOT NULL,
  categoria   text NOT NULL CHECK (categoria IN ('PRIMERA', 'AGRUPACION')),
  activa      boolean NOT NULL DEFAULT true,
  creada_en   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, edicion_id)
);
CREATE INDEX comparsa_edicion_id_idx ON comparsa (edicion_id);

CREATE TRIGGER comparsa_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON comparsa
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

-- ---------------------------------------------------------------------------
-- Participantes
-- ---------------------------------------------------------------------------

CREATE TABLE participante (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id      uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  nombre_completo text NOT NULL,
  -- Declaración de la comparsa (A14): el sistema no calcula ni valida la edad.
  es_menor        boolean NOT NULL DEFAULT false,
  activo          boolean NOT NULL DEFAULT true,
  UNIQUE (id, edicion_id)
);
CREATE INDEX participante_edicion_id_idx ON participante (edicion_id);

CREATE TRIGGER participante_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON participante
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

-- ---------------------------------------------------------------------------
-- Sujetos evaluables: quien o qué recibe la puntuación (A6).
-- ---------------------------------------------------------------------------

CREATE TABLE sujeto_evaluable (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id      uuid NOT NULL,
  comparsa_id     uuid NOT NULL,
  tipo_sujeto     text NOT NULL CHECK (tipo_sujeto IN (
                    'PERSONA', 'PAREJA', 'GRUPO', 'TRAJE', 'CARRO', 'CARROZA_REINA',
                    'BATERIA', 'BANDA_MUSICAL', 'TEMA_INEDITO', 'COMPARSA')),
  participante_id uuid,
  nombre          text,
  activo          boolean NOT NULL DEFAULT true,
  FOREIGN KEY (comparsa_id, edicion_id) REFERENCES comparsa (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (participante_id, edicion_id) REFERENCES participante (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (id, edicion_id),
  UNIQUE (id, edicion_id, comparsa_id),
  -- Solo una PERSONA referencia a un participante; los demás sujetos llevan nombre.
  CHECK ((tipo_sujeto = 'PERSONA') = (participante_id IS NOT NULL)),
  CHECK (tipo_sujeto = 'PERSONA' OR nombre IS NOT NULL)
);
CREATE INDEX sujeto_evaluable_edicion_id_idx ON sujeto_evaluable (edicion_id);
CREATE INDEX sujeto_evaluable_comparsa_id_idx ON sujeto_evaluable (comparsa_id);
CREATE INDEX sujeto_evaluable_participante_id_idx ON sujeto_evaluable (participante_id);

-- Una identidad por comparsa dentro de la edición: las apariciones repetidas van en pasada.
CREATE UNIQUE INDEX sujeto_evaluable_participante_comparsa_uidx
  ON sujeto_evaluable (edicion_id, comparsa_id, participante_id)
  WHERE participante_id IS NOT NULL;

CREATE TRIGGER sujeto_evaluable_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON sujeto_evaluable
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

-- ---------------------------------------------------------------------------
-- Orden de presentación: una fila por comparsa y noche (A4).
-- ---------------------------------------------------------------------------

CREATE TABLE orden_presentacion (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id          uuid NOT NULL,
  noche_id            uuid NOT NULL,
  comparsa_id         uuid NOT NULL,
  orden_presentacion  integer NOT NULL CHECK (orden_presentacion > 0),
  estado              text NOT NULL DEFAULT 'SCHEDULED' CHECK (estado IN ('SCHEDULED', 'CANCELLED')),
  programado_en       timestamptz,
  FOREIGN KEY (noche_id, edicion_id) REFERENCES noche (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (comparsa_id, edicion_id) REFERENCES comparsa (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (noche_id, comparsa_id),
  -- Diferible solo para reordenar dentro de una transacción: SET CONSTRAINTS ... DEFERRED.
  CONSTRAINT orden_presentacion_noche_posicion_uk UNIQUE (noche_id, orden_presentacion)
    DEFERRABLE INITIALLY IMMEDIATE,
  UNIQUE (id, edicion_id, comparsa_id)
);
CREATE INDEX orden_presentacion_comparsa_id_idx ON orden_presentacion (comparsa_id);

-- Solo se modifica con la noche en DRAFT. El bloqueo serializa el cambio con la apertura.
CREATE FUNCTION orden_presentacion_exigir_noche_draft() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ids_noche uuid[];
  fila_noche record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    ids_noche := ARRAY[OLD.noche_id];
  ELSIF TG_OP = 'UPDATE' THEN
    ids_noche := ARRAY[OLD.noche_id, NEW.noche_id];
  ELSE
    ids_noche := ARRAY[NEW.noche_id];
  END IF;

  FOR fila_noche IN
    SELECT n.id, n.estado
      FROM noche AS n
     WHERE n.id = ANY(ids_noche)
     ORDER BY n.id
     FOR UPDATE OF n
  LOOP
    IF fila_noche.estado IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'ORDEN_CONGELADO' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orden_presentacion_exigir_noche_draft_trg
  BEFORE INSERT OR UPDATE OR DELETE ON orden_presentacion
  FOR EACH ROW EXECUTE FUNCTION orden_presentacion_exigir_noche_draft();

-- El orden de presentación forma parte del padrón congelado al abrir la primera noche.
CREATE TRIGGER orden_presentacion_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON orden_presentacion
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

-- ---------------------------------------------------------------------------
-- Pasadas: apariciones de un sujeto dentro de la comparsa en una noche.
-- No duplican la identidad del participante; cada pasada tiene su propio orden.
-- Se congelan con su propia noche, no con el padrón general (diseno-fisico §5.10).
-- ---------------------------------------------------------------------------

CREATE TABLE pasada (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id            uuid NOT NULL,
  orden_presentacion_id uuid NOT NULL,
  comparsa_id           uuid NOT NULL,
  sujeto_id             uuid NOT NULL,
  orden                 integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (orden_presentacion_id, edicion_id, comparsa_id)
    REFERENCES orden_presentacion (id, edicion_id, comparsa_id) ON DELETE RESTRICT,
  FOREIGN KEY (sujeto_id, edicion_id, comparsa_id)
    REFERENCES sujeto_evaluable (id, edicion_id, comparsa_id) ON DELETE RESTRICT,
  -- Diferible solo para reordenar dentro de una transacción: SET CONSTRAINTS ... DEFERRED.
  CONSTRAINT pasada_posicion_uk UNIQUE (orden_presentacion_id, orden) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX pasada_sujeto_id_idx ON pasada (sujeto_id);

CREATE FUNCTION pasada_exigir_noche_draft() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ids_orden uuid[];
  fila_noche record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    ids_orden := ARRAY[OLD.orden_presentacion_id];
  ELSIF TG_OP = 'UPDATE' THEN
    ids_orden := ARRAY[OLD.orden_presentacion_id, NEW.orden_presentacion_id];
  ELSE
    ids_orden := ARRAY[NEW.orden_presentacion_id];
  END IF;

  FOR fila_noche IN
    SELECT n.id, n.estado
      FROM noche AS n
      JOIN orden_presentacion AS op ON op.noche_id = n.id
     WHERE op.id = ANY(ids_orden)
     ORDER BY n.id
     FOR UPDATE OF n
  LOOP
    IF fila_noche.estado IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'PASADA_NOCHE_NO_EDITABLE' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pasada_exigir_noche_draft_trg
  BEFORE INSERT OR UPDATE OR DELETE ON pasada
  FOR EACH ROW EXECUTE FUNCTION pasada_exigir_noche_draft();

-- ---------------------------------------------------------------------------
-- Una comparsa inactiva no entra en el padrón, el orden ni las pasadas, y una
-- comparsa con padrón cargado no se desactiva (diseno-fisico §5.5).
-- ---------------------------------------------------------------------------

CREATE FUNCTION exigir_comparsa_activa() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  esta_activa boolean;
BEGIN
  SELECT activa INTO esta_activa FROM comparsa WHERE id = NEW.comparsa_id FOR SHARE;
  IF esta_activa IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'COMPARSA_INACTIVA' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sujeto_evaluable_exigir_comparsa_activa_trg
  BEFORE INSERT OR UPDATE ON sujeto_evaluable
  FOR EACH ROW EXECUTE FUNCTION exigir_comparsa_activa();

CREATE TRIGGER orden_presentacion_exigir_comparsa_activa_trg
  BEFORE INSERT OR UPDATE ON orden_presentacion
  FOR EACH ROW EXECUTE FUNCTION exigir_comparsa_activa();

CREATE TRIGGER pasada_exigir_comparsa_activa_trg
  BEFORE INSERT OR UPDATE ON pasada
  FOR EACH ROW EXECUTE FUNCTION exigir_comparsa_activa();

CREATE FUNCTION comparsa_bloquear_desactivacion_con_padron() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.activa AND NOT NEW.activa AND (
       EXISTS (SELECT 1 FROM sujeto_evaluable WHERE comparsa_id = OLD.id)
    OR EXISTS (SELECT 1 FROM orden_presentacion WHERE comparsa_id = OLD.id)
    OR EXISTS (SELECT 1 FROM pasada WHERE comparsa_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'COMPARSA_CON_PADRON' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER comparsa_bloquear_desactivacion_con_padron_trg
  BEFORE UPDATE OF activa ON comparsa
  FOR EACH ROW EXECUTE FUNCTION comparsa_bloquear_desactivacion_con_padron();
