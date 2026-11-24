-- Migración 0010 (contenido del reglamento en borrador): rubros, escala por versión,
-- especialidades de cada rubro, premios y requisitos de presentación.
-- Decisiones confirmadas por el responsable del proyecto:
--   H9:  tipo de rubro NOMINATIVO o ALEATORIO.
--   H13/R5: una escala 1 a 5 por versión del reglamento.
--   R7:  nominados configurables desde la aplicación (no fijos en el esquema).
--   R4b: requisito_version.puede_puntuar es sí/no por requisito.
-- No incluye la relación premio ↔ rubro, que depende de H10 y queda pendiente.
-- Todo cambio de contenido exige que la versión esté en BORRADOR.

-- ---------------------------------------------------------------------------
-- Solo borrador: la versión del reglamento debe estar en BORRADOR para escribir.
-- ---------------------------------------------------------------------------

CREATE FUNCTION exigir_version_borrador() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ids_version uuid[];
  fila_version record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ids_version := ARRAY[NEW.version_id];
  ELSIF TG_OP = 'DELETE' THEN
    ids_version := ARRAY[OLD.version_id];
  ELSE
    ids_version := ARRAY[OLD.version_id, NEW.version_id];
  END IF;

  FOR fila_version IN
    SELECT v.estado
      FROM version_reglamento AS v
     WHERE v.id = ANY(ids_version)
     ORDER BY v.id
     FOR SHARE
  LOOP
    IF fila_version.estado <> 'BORRADOR' THEN
      RAISE EXCEPTION 'VERSION_NO_BORRADOR' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- rubro_especialidad no tiene version_id: se resuelve a través de su rubro.
CREATE FUNCTION exigir_rubro_especialidad_borrador() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  id_rubro uuid;
  estado_version text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    id_rubro := OLD.rubro_version_id;
  ELSE
    id_rubro := NEW.rubro_version_id;
  END IF;

  SELECT v.estado INTO estado_version
    FROM rubro_version AS rv
    JOIN version_reglamento AS v ON v.id = rv.version_id
   WHERE rv.id = id_rubro
   FOR SHARE OF v;

  IF estado_version IS DISTINCT FROM 'BORRADOR' THEN
    RAISE EXCEPTION 'VERSION_NO_BORRADOR' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rubros de la versión (filas de la columna «RUBRO» de la planilla).
-- ---------------------------------------------------------------------------

CREATE TABLE rubro_version (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id                      uuid NOT NULL,
  edicion_id                      uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  codigo                          text NOT NULL,
  nombre                          text NOT NULL,
  -- Mismo catálogo que sujeto_evaluable.tipo_sujeto; un rubro aplica a un solo tipo.
  tipo_sujeto                     text NOT NULL CHECK (tipo_sujeto IN (
                                    'PERSONA', 'PAREJA', 'GRUPO', 'TRAJE', 'CARRO', 'CARROZA_REINA',
                                    'BATERIA', 'BANDA_MUSICAL', 'TEMA_INEDITO', 'COMPARSA')),
  -- false para rubros infantiles: solo premio individual, no suma al resultado de la comparsa (A10).
  suma_a_comparsa                 boolean NOT NULL DEFAULT true,
  tipo_rubro                      text CHECK (tipo_rubro IN ('NOMINATIVO', 'ALEATORIO')),
  -- Máximo de nominados del rubro en toda la edición (H11b). Lo configura el administrador (R7).
  nominados_maximos               integer CHECK (nominados_maximos > 0),
  nominados_maximos_por_comparsa  integer CHECK (nominados_maximos_por_comparsa > 0),
  -- Cuando el rubro no se presenta, la nota es 0.
  permite_no_presentado           boolean NOT NULL DEFAULT true,
  orden                           integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (version_id, codigo),
  UNIQUE (id, edicion_id),
  CHECK (tipo_rubro IS DISTINCT FROM 'ALEATORIO' OR nominados_maximos IS NOT NULL)
);
CREATE INDEX rubro_version_version_id_idx ON rubro_version (version_id);

CREATE TRIGGER rubro_version_exigir_borrador_trg
  BEFORE INSERT OR UPDATE OR DELETE ON rubro_version
  FOR EACH ROW EXECUTE FUNCTION exigir_version_borrador();

-- ---------------------------------------------------------------------------
-- Escala de puntaje: una sola por versión (decidido: una escala para toda la versión).
-- ---------------------------------------------------------------------------

CREATE TABLE escala_puntaje_version (
  version_id  uuid PRIMARY KEY,
  edicion_id  uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  minimo      integer NOT NULL CHECK (minimo >= 1),
  maximo      integer NOT NULL,
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  CHECK (maximo >= minimo)
);

CREATE TRIGGER escala_puntaje_version_exigir_borrador_trg
  BEFORE INSERT OR UPDATE OR DELETE ON escala_puntaje_version
  FOR EACH ROW EXECUTE FUNCTION exigir_version_borrador();

-- ---------------------------------------------------------------------------
-- Especialidades que evalúan cada rubro (planilla J1, J2, J3).
-- ---------------------------------------------------------------------------

CREATE TABLE rubro_especialidad (
  rubro_version_id  uuid NOT NULL,
  especialidad_id   uuid NOT NULL,
  edicion_id        uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  PRIMARY KEY (rubro_version_id, especialidad_id),
  FOREIGN KEY (rubro_version_id, edicion_id) REFERENCES rubro_version (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (especialidad_id, edicion_id) REFERENCES especialidad (id, edicion_id) ON DELETE RESTRICT
);
CREATE INDEX rubro_especialidad_especialidad_id_idx ON rubro_especialidad (especialidad_id);

CREATE TRIGGER rubro_especialidad_exigir_borrador_trg
  BEFORE INSERT OR UPDATE OR DELETE ON rubro_especialidad
  FOR EACH ROW EXECUTE FUNCTION exigir_rubro_especialidad_borrador();

-- ---------------------------------------------------------------------------
-- Premios de la versión (cargos a puntuar). La relación con rubros queda pendiente (H10).
-- ---------------------------------------------------------------------------

CREATE TABLE premio_version (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id  uuid NOT NULL,
  edicion_id  uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  nombre      text NOT NULL,
  modalidad   text NOT NULL CHECK (modalidad IN ('INDIVIDUAL', 'GRUPAL')),
  orden       integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (version_id, nombre),
  UNIQUE (id, edicion_id)
);

CREATE TRIGGER premio_version_exigir_borrador_trg
  BEFORE INSERT OR UPDATE OR DELETE ON premio_version
  FOR EACH ROW EXECUTE FUNCTION exigir_version_borrador();

-- ---------------------------------------------------------------------------
-- Requisitos de presentación de la versión. puede_puntuar lo decide el administrador (R4b).
-- ---------------------------------------------------------------------------

CREATE TABLE requisito_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL,
  edicion_id      uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  codigo          text NOT NULL,
  nombre          text NOT NULL,
  cantidad_minima integer NOT NULL CHECK (cantidad_minima > 0),
  puede_puntuar   boolean NOT NULL DEFAULT false,
  orden           integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (version_id, codigo),
  UNIQUE (id, edicion_id)
);

CREATE TRIGGER requisito_version_exigir_borrador_trg
  BEFORE INSERT OR UPDATE OR DELETE ON requisito_version
  FOR EACH ROW EXECUTE FUNCTION exigir_version_borrador();
