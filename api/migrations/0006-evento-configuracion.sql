-- Migración propia del proyecto (0006): edición y versiones de reglamento.
-- Primera fase del agregado de edición. Contiene solo reglas confirmadas:
--   - una edición nace en CONFIGURING, con año positivo y único;
--   - su primera versión de reglamento nace en BORRADOR; hay a lo sumo un borrador
--     y una versión activa por edición, y las transiciones de versión están restringidas;
--   - abrir una edición exige pertenecer al rol carnavales_servicio_apertura.
-- Fuera de esta migración, guardado sin aplicar en api/migrations/pendientes/: noches, comparsas,
-- participantes, sujetos evaluables, orden de presentación, pasadas, especialidades, rubros, planillas,
-- escalas, premios, requisitos, enmiendas, operación de apertura y reglas de cálculo.
-- Debe ejecutarse después de 0005-limites-envio-otp.sql.

-- ---------------------------------------------------------------------------
-- Edición
-- ---------------------------------------------------------------------------

CREATE TABLE edicion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  anio        integer NOT NULL UNIQUE CHECK (anio > 0),
  estado      text NOT NULL CHECK (estado IN ('CONFIGURING', 'OPEN')),
  creada_por  text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  creada_en   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  abierta_por text REFERENCES usuario (id) ON DELETE RESTRICT,
  abierta_en  timestamptz,
  CHECK ((estado = 'OPEN') = (abierta_en IS NOT NULL))
);

-- Apertura de edición y noches: solo puede hacerla un rol de base de datos dedicado,
-- carnavales_servicio_apertura. El trigger verifica la pertenencia al rol del usuario de la sesión;
-- fijar una variable de sesión ya no basta. La cuenta de la API que abre debe ser miembro del rol;
-- el usuario ordinario de la aplicación no. Los superusuarios siempre pertenecen implícitamente:
-- la cuenta de la aplicación y la de apertura no deben ser superusuarios.
-- La creación del rol requiere CREATEROLE. Si el rol ya existe, la migración no lo modifica.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carnavales_servicio_apertura') THEN
    CREATE ROLE carnavales_servicio_apertura NOLOGIN;
  END IF;
END
$$;

CREATE FUNCTION edicion_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Una edición no nace abierta: abrirla exige el rol de apertura, igual que una actualización.
    IF NEW.estado = 'OPEN' AND NOT pg_has_role(current_user, 'carnavales_servicio_apertura', 'MEMBER') THEN
      RAISE EXCEPTION 'APERTURA_REQUIERE_SERVICIO' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
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
END;
$$;

CREATE TRIGGER edicion_validar_cambio_trg
  BEFORE INSERT OR UPDATE OR DELETE ON edicion
  FOR EACH ROW EXECUTE FUNCTION edicion_validar_cambio();

-- ---------------------------------------------------------------------------
-- Versiones de reglamento
-- ---------------------------------------------------------------------------

CREATE TABLE version_reglamento (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id   uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  numero       integer NOT NULL CHECK (numero > 0),
  estado       text NOT NULL CHECK (estado IN ('BORRADOR', 'PUBLICADA', 'CONGELADA', 'SUPERSEDIDA')),
  fuente       text NOT NULL,
  copiada_de_id uuid REFERENCES version_reglamento (id) ON DELETE RESTRICT,
  creada_por   text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  creada_en    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  publicada_por text REFERENCES usuario (id) ON DELETE RESTRICT,
  publicada_en timestamptz,
  congelada_en timestamptz,
  UNIQUE (edicion_id, numero),
  UNIQUE (id, edicion_id),
  CHECK (estado = 'BORRADOR' OR (publicada_por IS NOT NULL AND publicada_en IS NOT NULL)),
  CHECK (estado <> 'CONGELADA' OR congelada_en IS NOT NULL)
);

-- Un borrador a la vez, y una versión activa a la vez por edición (A1).
CREATE UNIQUE INDEX version_reglamento_un_borrador
  ON version_reglamento (edicion_id) WHERE estado = 'BORRADOR';
CREATE UNIQUE INDEX version_reglamento_una_activa
  ON version_reglamento (edicion_id) WHERE estado IN ('PUBLICADA', 'CONGELADA');

-- Transiciones permitidas: BORRADOR -> PUBLICADA, PUBLICADA -> SUPERSEDIDA, PUBLICADA -> CONGELADA.
-- Una versión no BORRADOR no cambia su contenido (número, fuente, origen o edición).
CREATE FUNCTION version_reglamento_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Una versión nace en borrador; publicarla es una transición auditada (BORRADOR -> PUBLICADA).
    IF NEW.estado <> 'BORRADOR' THEN
      RAISE EXCEPTION 'VERSION_DEBE_CREARSE_EN_BORRADOR' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'BORRADOR' THEN
      RAISE EXCEPTION 'VERSION_NO_BORRABLE' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.estado IS DISTINCT FROM NEW.estado AND NOT (
       (OLD.estado = 'BORRADOR'  AND NEW.estado = 'PUBLICADA')
    OR (OLD.estado = 'PUBLICADA' AND NEW.estado IN ('SUPERSEDIDA', 'CONGELADA'))
  ) THEN
    RAISE EXCEPTION 'TRANSICION_VERSION_INVALIDA' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.estado <> 'BORRADOR' AND (NEW.numero, NEW.fuente, NEW.copiada_de_id, NEW.edicion_id)
       IS DISTINCT FROM (OLD.numero, OLD.fuente, OLD.copiada_de_id, OLD.edicion_id) THEN
    RAISE EXCEPTION 'VERSION_CONGELADA' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER version_reglamento_validar_cambio_trg
  BEFORE INSERT OR UPDATE OR DELETE ON version_reglamento
  FOR EACH ROW EXECUTE FUNCTION version_reglamento_validar_cambio();
