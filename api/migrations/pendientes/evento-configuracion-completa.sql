-- Migración propia del proyecto (0006).
-- Agregado de edición: configuración del evento, versiones de reglamento, noches,
-- comparsas, participantes, sujetos evaluables, orden de presentación, especialidades,
-- rubros, filas de planilla, escalas, premios, requisitos de presentación y enmiendas.
-- Reglas congeladas: el reglamento y el padrón se congelan al abrir la primera noche (opción B);
-- las noches siguientes reutilizan esa misma versión congelada.
-- Fuera de esta migración (van en migraciones posteriores):
--   regla_calculo_version y algoritmo_calculo (pendientes de D24);
--   planillas, puntajes y validación de planillas recibidas al cerrar una noche (D11).
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

-- Configuración de la versión (rubros, escalas, premios, requisitos, especialidades de rubro):
-- solo se modifica con la versión en BORRADOR.
CREATE FUNCTION exigir_version_en_borrador() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  estado_version text;
  version uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    version := OLD.version_id;
  ELSE
    version := NEW.version_id;
  END IF;
  SELECT estado INTO estado_version FROM version_reglamento WHERE id = version FOR UPDATE;
  IF estado_version IS DISTINCT FROM 'BORRADOR' THEN
    RAISE EXCEPTION 'VERSION_CONGELADA' USING ERRCODE = 'check_violation';
  END IF;
  -- Un UPDATE que cambia version_id también debe estar permitido en la versión de origen:
  -- una fila no sale de una versión congelada hacia una BORRADOR.
  IF TG_OP = 'UPDATE' AND OLD.version_id IS DISTINCT FROM NEW.version_id THEN
    SELECT estado INTO estado_version FROM version_reglamento WHERE id = OLD.version_id FOR UPDATE;
    IF estado_version IS DISTINCT FROM 'BORRADOR' THEN
      RAISE EXCEPTION 'VERSION_CONGELADA' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Noches
-- ---------------------------------------------------------------------------

CREATE TABLE noche (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id          uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  orden               integer NOT NULL CHECK (orden > 0),
  nombre              text NOT NULL,
  fecha               date,
  tipo                text NOT NULL CHECK (tipo IN ('COMPETENCIA', 'PREMIACION')),
  cuenta_para_puntaje boolean NOT NULL DEFAULT true,
  estado              text NOT NULL DEFAULT 'DRAFT' CHECK (estado IN ('DRAFT', 'OPEN', 'CLOSED')),
  abierta_en          timestamptz,
  cerrada_en          timestamptz,
  UNIQUE (edicion_id, orden),
  UNIQUE (id, edicion_id),
  CHECK ((estado <> 'DRAFT') = (abierta_en IS NOT NULL)),
  CHECK ((estado = 'CLOSED') = (cerrada_en IS NOT NULL))
);

-- Reglas de la noche:
--   - Se crea en DRAFT (también con la edición ya abierta).
--   - DRAFT -> OPEN solo por el servicio de apertura; exige edición OPEN y una versión PUBLICADA
--     o CONGELADA. La primera noche congela la versión; las siguientes reutilizan la congelada.
--   - OPEN -> CLOSED: cierre de la noche. El requisito de planillas recibidas (D11) se validará
--     cuando exista la tabla de planillas.
--   - CLOSED es terminal. OPEN no vuelve a DRAFT.
--   - Tipo, orden y cuenta_para_puntaje no cambian una vez abierta la noche.
CREATE FUNCTION noche_validar_cambio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  estado_edicion text;
  version uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'DRAFT' THEN
      RAISE EXCEPTION 'NOCHE_NO_BORRABLE' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'DRAFT' THEN
      RAISE EXCEPTION 'NOCHE_DEBE_CREARSE_EN_DRAFT' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.estado = 'CLOSED' THEN
    RAISE EXCEPTION 'NOCHE_CERRADA' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.estado = 'OPEN' AND NEW.estado = 'DRAFT' THEN
    RAISE EXCEPTION 'NOCHE_NO_VUELVE_A_DRAFT' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.estado = 'DRAFT' AND NEW.estado = 'CLOSED' THEN
    RAISE EXCEPTION 'NOCHE_DEBE_ABRIRSE_ANTES' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.estado <> 'DRAFT' AND (NEW.tipo, NEW.cuenta_para_puntaje, NEW.orden, NEW.edicion_id)
       IS DISTINCT FROM (OLD.tipo, OLD.cuenta_para_puntaje, OLD.orden, OLD.edicion_id) THEN
    RAISE EXCEPTION 'NOCHE_CONFIGURACION_CONGELADA' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.estado = 'DRAFT' AND NEW.estado = 'OPEN' THEN
    IF NOT pg_has_role(current_user, 'carnavales_servicio_apertura', 'MEMBER') THEN
      RAISE EXCEPTION 'APERTURA_REQUIERE_SERVICIO' USING ERRCODE = 'check_violation';
    END IF;
    SELECT estado INTO estado_edicion FROM edicion WHERE id = NEW.edicion_id;
    IF estado_edicion IS DISTINCT FROM 'OPEN' THEN
      RAISE EXCEPTION 'EDICION_NO_ABIERTA' USING ERRCODE = 'check_violation';
    END IF;
    SELECT id INTO version FROM version_reglamento
     WHERE edicion_id = NEW.edicion_id AND estado IN ('PUBLICADA', 'CONGELADA') FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'NOCHE_SIN_VERSION_PUBLICADA' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE version_reglamento
       SET estado = 'CONGELADA', congelada_en = COALESCE(congelada_en, CURRENT_TIMESTAMP)
     WHERE id = version;
    NEW.abierta_en := CURRENT_TIMESTAMP;
  END IF;

  IF OLD.estado = 'OPEN' AND NEW.estado = 'CLOSED' THEN
    NEW.cerrada_en := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER noche_validar_cambio_trg
  BEFORE INSERT OR UPDATE OR DELETE ON noche
  FOR EACH ROW EXECUTE FUNCTION noche_validar_cambio();

-- Padrón (comparsas, participantes, sujetos, especialidades, nominaciones y orden de presentación):
-- editable mientras ninguna noche
-- de la edición esté abierta (opción B). Una noche no DRAFT congela el padrón.
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
  -- Bloquea las noches de la edición: una apertura concurrente espera a esta transacción
  -- y la comprobación siguiente ve el estado confirmado.
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
-- Comparsas, participantes y sujetos evaluables
-- ---------------------------------------------------------------------------

CREATE TABLE comparsa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id  uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  nombre      text NOT NULL,
  categoria   text NOT NULL CHECK (categoria IN ('PRIMERA', 'AGRUPACION')),
  activa      boolean NOT NULL DEFAULT true,
  creada_en   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, edicion_id),
  UNIQUE (edicion_id, nombre)
);
CREATE INDEX comparsa_edicion_id_idx ON comparsa (edicion_id);

CREATE TRIGGER comparsa_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON comparsa
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

CREATE TABLE participante (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id      uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  nombre_completo text NOT NULL,
  -- Declaración de la comparsa (A14): el sistema no valida la edad.
  es_menor        boolean NOT NULL DEFAULT false,
  activo          boolean NOT NULL DEFAULT true,
  UNIQUE (id, edicion_id)
);
CREATE INDEX participante_edicion_id_idx ON participante (edicion_id);

CREATE TRIGGER participante_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON participante
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

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
CREATE UNIQUE INDEX sujeto_evaluable_participante_comparsa_uidx
  ON sujeto_evaluable (edicion_id, comparsa_id, participante_id)
  WHERE participante_id IS NOT NULL;

CREATE TRIGGER sujeto_evaluable_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON sujeto_evaluable
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

-- ---------------------------------------------------------------------------
-- Orden de presentación (una fila por comparsa y noche)
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
  -- Fuera de eso se comprueba al escribir, como cualquier otra restricción.
  CONSTRAINT orden_presentacion_noche_posicion_uk UNIQUE (noche_id, orden_presentacion)
    DEFERRABLE INITIALLY IMMEDIATE,
  UNIQUE (id, edicion_id, comparsa_id)
);
CREATE INDEX orden_presentacion_comparsa_id_idx ON orden_presentacion (comparsa_id);

-- Solo se modifica con la noche en DRAFT.
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

  -- El bloqueo serializa cambios del orden con la apertura/cierre de la noche.
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

-- El orden de presentación forma parte del padrón congelado al abrir la primera noche (docs/voting §6).
CREATE TRIGGER orden_presentacion_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON orden_presentacion
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

-- Una persona puede aparecer varias veces en el orden de la misma comparsa/noche.
-- Las pasadas reutilizan el mismo sujeto evaluable: no duplican la identidad del participante.
CREATE TABLE pasada (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id             uuid NOT NULL,
  orden_presentacion_id  uuid NOT NULL,
  comparsa_id            uuid NOT NULL,
  sujeto_id              uuid NOT NULL,
  orden                  integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (orden_presentacion_id, edicion_id, comparsa_id)
    REFERENCES orden_presentacion (id, edicion_id, comparsa_id) ON DELETE RESTRICT,
  FOREIGN KEY (sujeto_id, edicion_id, comparsa_id)
    REFERENCES sujeto_evaluable (id, edicion_id, comparsa_id) ON DELETE RESTRICT,
  -- Diferible solo para reordenar dentro de una transacción (SET CONSTRAINTS ... DEFERRED).
  CONSTRAINT pasada_posicion_uk UNIQUE (orden_presentacion_id, orden) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX pasada_sujeto_id_idx ON pasada (sujeto_id);

-- Las pasadas se congelan por noche, no con el padrón: se editan mientras su propia noche esté en DRAFT,
-- aunque otra noche de la edición ya esté abierta. Ninguna pasada cambia después de abrir su noche.
-- Decisión pendiente de revisar: el documento de diseño no fija este punto (ver docs/voting §6).
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

  -- El bloqueo serializa la edición de pasadas con la apertura/cierre de la noche.
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
-- Especialidades y rubros de la versión
-- ---------------------------------------------------------------------------

CREATE TABLE especialidad (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id  uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  nombre      text NOT NULL,
  codigo      text NOT NULL,
  orden       integer NOT NULL CHECK (orden > 0),
  activa      boolean NOT NULL DEFAULT true,
  UNIQUE (id, edicion_id),
  UNIQUE (edicion_id, codigo),
  UNIQUE (edicion_id, orden)
);
CREATE INDEX especialidad_edicion_id_idx ON especialidad (edicion_id);

CREATE TRIGGER especialidad_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON especialidad
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

CREATE TABLE rubro_version (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id                     uuid NOT NULL,
  version_id                     uuid NOT NULL,
  codigo                         text NOT NULL,
  nombre                         text NOT NULL,
  tipo_sujeto                    text NOT NULL CHECK (tipo_sujeto IN (
                                   'PERSONA', 'PAREJA', 'GRUPO', 'TRAJE', 'CARRO', 'CARROZA_REINA',
                                   'BATERIA', 'BANDA_MUSICAL', 'TEMA_INEDITO', 'COMPARSA')),
  -- Los requisitos de presentación (fijos) no son rubros: ver requisito_version.
  tipo_rubro                     text NOT NULL CHECK (tipo_rubro IN ('NOMINATIVO', 'ALEATORIO')),
  nominados_maximos              integer CHECK (nominados_maximos > 0),
  nominados_maximos_por_comparsa integer CHECK (nominados_maximos_por_comparsa > 0),
  permite_no_presentado          boolean NOT NULL DEFAULT true,
  suma_a_comparsa                boolean NOT NULL DEFAULT true,
  orden                          integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (version_id, codigo),
  UNIQUE (id, version_id),
  -- Todo rubro aleatorio declara su máximo de nominados (H11b).
  CHECK (tipo_rubro <> 'ALEATORIO' OR nominados_maximos IS NOT NULL)
);
CREATE INDEX rubro_version_version_id_idx ON rubro_version (version_id);

CREATE TRIGGER rubro_version_exigir_version_en_borrador
  BEFORE INSERT OR UPDATE OR DELETE ON rubro_version
  FOR EACH ROW EXECUTE FUNCTION exigir_version_en_borrador();

CREATE TABLE escala_puntaje_version (
  rubro_version_id uuid PRIMARY KEY,
  version_id       uuid NOT NULL,
  edicion_id       uuid NOT NULL,
  minimo           integer NOT NULL CHECK (minimo >= 1),
  maximo           integer NOT NULL,
  CHECK (maximo >= minimo),
  FOREIGN KEY (rubro_version_id, version_id) REFERENCES rubro_version (id, version_id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT
);

CREATE TRIGGER escala_puntaje_version_exigir_version_en_borrador
  BEFORE INSERT OR UPDATE OR DELETE ON escala_puntaje_version
  FOR EACH ROW EXECUTE FUNCTION exigir_version_en_borrador();

CREATE TABLE rubro_especialidad (
  rubro_version_id uuid NOT NULL,
  especialidad_id  uuid NOT NULL,
  version_id       uuid NOT NULL,
  edicion_id       uuid NOT NULL,
  PRIMARY KEY (rubro_version_id, especialidad_id),
  FOREIGN KEY (rubro_version_id, version_id) REFERENCES rubro_version (id, version_id) ON DELETE RESTRICT,
  FOREIGN KEY (especialidad_id, edicion_id) REFERENCES especialidad (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT
);
CREATE INDEX rubro_especialidad_especialidad_id_idx ON rubro_especialidad (especialidad_id);

CREATE TRIGGER rubro_especialidad_exigir_version_en_borrador
  BEFORE INSERT OR UPDATE OR DELETE ON rubro_especialidad
  FOR EACH ROW EXECUTE FUNCTION exigir_version_en_borrador();

CREATE TABLE premio_version (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id  uuid NOT NULL,
  version_id  uuid NOT NULL,
  nombre      text NOT NULL,
  modalidad   text NOT NULL CHECK (modalidad IN ('INDIVIDUAL', 'GRUPAL')),
  orden       integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (version_id, nombre)
);

CREATE TRIGGER premio_version_exigir_version_en_borrador
  BEFORE INSERT OR UPDATE OR DELETE ON premio_version
  FOR EACH ROW EXECUTE FUNCTION exigir_version_en_borrador();

-- Requisitos de presentación (antes llamados «fijos»): lo que la comparsa debe presentar.
-- puede_puntuar queda apagado hasta confirmar R4b (feature de reglamento 2027).
CREATE TABLE requisito_version (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id       uuid NOT NULL,
  version_id       uuid NOT NULL,
  codigo           text NOT NULL,
  nombre           text NOT NULL,
  cantidad_minima  integer NOT NULL CHECK (cantidad_minima > 0),
  puede_puntuar    boolean NOT NULL DEFAULT false,
  orden            integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (version_id, codigo)
);

CREATE TRIGGER requisito_version_exigir_version_en_borrador
  BEFORE INSERT OR UPDATE OR DELETE ON requisito_version
  FOR EACH ROW EXECUTE FUNCTION exigir_version_en_borrador();

-- ---------------------------------------------------------------------------
-- Filas de planilla (objetivo_rubro): sujeto × rubro × especialidad
-- ---------------------------------------------------------------------------

CREATE TABLE objetivo_rubro (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id        uuid NOT NULL,
  version_id        uuid NOT NULL,
  rubro_version_id  uuid NOT NULL,
  sujeto_id         uuid NOT NULL,
  especialidad_id   uuid NOT NULL,
  origen            text NOT NULL CHECK (origen IN ('GENERADA', 'MANUAL')),
  excluida          boolean NOT NULL DEFAULT false,
  evaluable         boolean NOT NULL DEFAULT true,
  orden             integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (rubro_version_id, version_id) REFERENCES rubro_version (id, version_id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (sujeto_id, edicion_id) REFERENCES sujeto_evaluable (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (rubro_version_id, especialidad_id) REFERENCES rubro_especialidad (rubro_version_id, especialidad_id) ON DELETE RESTRICT,
  UNIQUE (rubro_version_id, sujeto_id, especialidad_id)
);
CREATE INDEX objetivo_rubro_sujeto_id_idx ON objetivo_rubro (sujeto_id);
CREATE INDEX objetivo_rubro_especialidad_id_idx ON objetivo_rubro (especialidad_id);

-- Las filas de planilla se editan mientras el padrón no está congelado (H11): las nominaciones
-- aleatorias se cargan antes de la primera noche, aunque la versión ya esté PUBLICADA.
CREATE FUNCTION objetivo_rubro_validar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rubro rubro_version%ROWTYPE;
  sujeto sujeto_evaluable%ROWTYPE;
  total integer;
  total_comparsa integer;
BEGIN
  IF NEW.excluida THEN
    RETURN NEW;
  END IF;

  -- Serializa las nominaciones del mismo rubro: la cuenta de topes se hace bajo este bloqueo.
  SELECT * INTO rubro FROM rubro_version WHERE id = NEW.rubro_version_id FOR UPDATE;
  SELECT * INTO sujeto FROM sujeto_evaluable WHERE id = NEW.sujeto_id;

  IF sujeto.tipo_sujeto IS DISTINCT FROM rubro.tipo_sujeto THEN
    RAISE EXCEPTION 'SUJETO_NO_CORRESPONDE_AL_RUBRO' USING ERRCODE = 'check_violation';
  END IF;

  -- Los topes cuentan sujetos nominados, no filas: un sujeto con varias especialidades ocupa un solo lugar.
  IF rubro.tipo_rubro = 'ALEATORIO' THEN
    SELECT count(DISTINCT sujeto_id) INTO total FROM objetivo_rubro
     WHERE rubro_version_id = NEW.rubro_version_id AND NOT excluida AND sujeto_id <> NEW.sujeto_id;
    IF total + 1 > rubro.nominados_maximos THEN
      RAISE EXCEPTION 'NOMINADOS_MAXIMOS_SUPERADOS' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF rubro.nominados_maximos_por_comparsa IS NOT NULL THEN
    SELECT count(DISTINCT o.sujeto_id) INTO total_comparsa
      FROM objetivo_rubro o
      JOIN sujeto_evaluable s ON s.id = o.sujeto_id
     WHERE o.rubro_version_id = NEW.rubro_version_id
       AND NOT o.excluida
       AND o.sujeto_id <> NEW.sujeto_id
       AND s.comparsa_id = sujeto.comparsa_id;
    IF total_comparsa + 1 > rubro.nominados_maximos_por_comparsa THEN
      RAISE EXCEPTION 'NOMINADOS_POR_COMPARSA_SUPERADOS' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER objetivo_rubro_validar_trg
  BEFORE INSERT OR UPDATE ON objetivo_rubro
  FOR EACH ROW EXECUTE FUNCTION objetivo_rubro_validar();

CREATE TRIGGER objetivo_rubro_exigir_padron_editable
  BEFORE INSERT OR UPDATE OR DELETE ON objetivo_rubro
  FOR EACH ROW EXECUTE FUNCTION exigir_padron_editable();

-- ---------------------------------------------------------------------------
-- Enmiendas al reglamento (registro sin efecto automático, H3)
-- ---------------------------------------------------------------------------

CREATE TABLE enmienda_reglamento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id      uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  version_id      uuid NOT NULL,
  contenido       text NOT NULL,
  motivo          text NOT NULL,
  responsable_id  text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  creada_en       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT
);
CREATE INDEX enmienda_reglamento_edicion_id_idx ON enmienda_reglamento (edicion_id);

CREATE FUNCTION enmienda_reglamento_solo_registro() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ENMIENDA_INMUTABLE' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER enmienda_reglamento_solo_registro_trg
  BEFORE UPDATE OR DELETE ON enmienda_reglamento
  FOR EACH ROW EXECUTE FUNCTION enmienda_reglamento_solo_registro();

-- ---------------------------------------------------------------------------
-- Comparsa inactiva (docs/voting §5.5): no entra en el padrón, el orden ni las pasadas, y una comparsa
-- con padrón cargado no se desactiva. Se valida con FOR SHARE para que una desactivación concurrente espere.
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

-- ---------------------------------------------------------------------------
-- Operaciones de apertura (adoptado de la referencia, migración 085).
-- RESERVADA: la tabla existe, pero todavía no hay servicio ni función que la escriba. Hoy repetir una
-- apertura con la misma clave no tiene efecto garantizado. La idempotencia de la apertura queda
-- pendiente de implementar junto con el servicio de apertura.
-- ---------------------------------------------------------------------------

CREATE TABLE operacion_apertura (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id        uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  noche_id          uuid,
  clave_operacion   text NOT NULL UNIQUE,
  resultado         text,
  solicitada_por    text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  solicitada_en     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (noche_id, edicion_id) REFERENCES noche (id, edicion_id) ON DELETE RESTRICT
);
CREATE INDEX operacion_apertura_edicion_id_idx ON operacion_apertura (edicion_id);
