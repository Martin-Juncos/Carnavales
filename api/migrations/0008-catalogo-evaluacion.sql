-- Migración 0008 (alcance aprobado P1): catálogo de evaluación y filas de planilla.
-- Crea solo lo que falta después de 0006/0007: comparsas, participantes, sujetos
-- evaluables, orden de presentación, pasadas, rubros con jerarquía padre/hijo,
-- escalas, rubro por especialidad, premios, requisitos, enmiendas y fila_planilla,
-- más la estructura que permite fijar la instantánea de planillas esperadas (P1).
--
-- Decisiones aplicadas (2026-11-19, docs/voting/planilla-voto-diseno-propuesto.md):
--   * D25/AGENTS.md §2: el rubro padre con hijos NO recibe fila directa; suma sus hijos.
--   * D7: la condición evaluable es del rubro; la fila la hereda (sin columna propia).
--   * D22: escala 1..5; "No se presentó" es un flag separado, nunca valor de escala.
--   * D10: no se crea el rol FISCAL ni se siembra ningún rol; no se toca la tabla rol.
--   * Nomenclatura unificada: la unidad evaluable es fila_planilla (sujeto × rubro ×
--     especialidad), antes objetivo_rubro/puntaje_planilla en el borrador.
--   * P1: basta la estructura de la instantánea; NO se implementa la operación de
--     apertura ni su lógica de negocio.
--
-- NO se recrean edicion, version_reglamento, noche, especialidad,
-- asignacion_jurado ni auditoria (ya existen en 0006/0007).
-- Las reglas de congelación por apertura de noche y las transiciones de apertura
-- siguen pendientes y se implementarán con esa operación; aquí solo se fija
-- estructura e integridad persistente.
-- Debe ejecutarse después de 0007-asignaciones-jurado.sql.
-- La transacción y el candado de asesoría los gestiona src/migrate.js, igual que
-- en el resto de las migraciones.

-- ---------------------------------------------------------------------------
-- Comparsas, participantes y sujetos evaluables (padrón)
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

CREATE TABLE participante (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id      uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  nombre_completo text NOT NULL,
  -- Declaración de la comparsa: el sistema no valida la edad (D14).
  es_menor        boolean NOT NULL DEFAULT false,
  activo          boolean NOT NULL DEFAULT true,
  UNIQUE (id, edicion_id)
);
CREATE INDEX participante_edicion_id_idx ON participante (edicion_id);

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
  CHECK ((tipo_sujeto = 'PERSONA') = (participante_id IS NOT NULL)),
  CHECK (tipo_sujeto = 'PERSONA' OR nombre IS NOT NULL)
);
CREATE INDEX sujeto_evaluable_edicion_id_idx ON sujeto_evaluable (edicion_id);
CREATE INDEX sujeto_evaluable_comparsa_id_idx ON sujeto_evaluable (comparsa_id);
CREATE INDEX sujeto_evaluable_participante_id_idx ON sujeto_evaluable (participante_id);
CREATE UNIQUE INDEX sujeto_evaluable_participante_comparsa_uidx
  ON sujeto_evaluable (edicion_id, comparsa_id, participante_id)
  WHERE participante_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Orden de presentación y pasadas (D6: varias pasadas del mismo participante)
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
  -- Diferible solo para reordenar dentro de una transacción (SET CONSTRAINTS ... DEFERRED).
  CONSTRAINT orden_presentacion_noche_posicion_uk UNIQUE (noche_id, orden_presentacion)
    DEFERRABLE INITIALLY IMMEDIATE,
  UNIQUE (id, edicion_id, comparsa_id)
);
CREATE INDEX orden_presentacion_comparsa_id_idx ON orden_presentacion (comparsa_id);

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
  -- Diferible solo para reordenar dentro de una transacción (SET CONSTRAINTS ... DEFERRED).
  CONSTRAINT pasada_posicion_uk UNIQUE (orden_presentacion_id, orden)
    DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX pasada_sujeto_id_idx ON pasada (sujeto_id);

-- ---------------------------------------------------------------------------
-- Rubros de la versión, con jerarquía padre/hijo (D25: el padre suma sus hijos)
-- ---------------------------------------------------------------------------

CREATE TABLE rubro_version (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id                     uuid NOT NULL,
  version_id                     uuid NOT NULL,
  -- Un rubro con hijos no recibe fila directa; se garantiza con triggers más abajo.
  padre_id                       uuid,
  codigo                         text NOT NULL,
  nombre                         text NOT NULL,
  tipo_sujeto                    text NOT NULL CHECK (tipo_sujeto IN (
                                   'PERSONA', 'PAREJA', 'GRUPO', 'TRAJE', 'CARRO',
                                   'CARROZA_REINA', 'BATERIA', 'BANDA_MUSICAL',
                                   'TEMA_INEDITO', 'COMPARSA')),
  -- Los requisitos de presentación no son rubros: ver requisito_version.
  tipo_rubro                     text NOT NULL CHECK (tipo_rubro IN ('NOMINATIVO', 'ALEATORIO')),
  nominados_maximos              integer CHECK (nominados_maximos > 0),
  nominados_maximos_por_comparsa integer CHECK (nominados_maximos_por_comparsa > 0),
  -- D7: la condición evaluable se decide por rubro. false => fila gris, no exige puntaje.
  evaluable                      boolean NOT NULL DEFAULT true,
  -- Flag separado: "No se presentó" nunca es un valor de la escala (D22).
  permite_no_presentado          boolean NOT NULL DEFAULT true,
  -- Informativo: no altera ningún cálculo hasta resolver D24.
  suma_a_comparsa                boolean NOT NULL DEFAULT true,
  orden                          integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (padre_id, version_id, edicion_id)
    REFERENCES rubro_version (id, version_id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (version_id, codigo),
  UNIQUE (id, version_id),
  UNIQUE (id, edicion_id),
  UNIQUE (id, version_id, edicion_id),
  CHECK (tipo_rubro <> 'ALEATORIO' OR nominados_maximos IS NOT NULL)
);
CREATE INDEX rubro_version_version_id_idx ON rubro_version (version_id);
CREATE INDEX rubro_version_padre_id_idx ON rubro_version (padre_id);

-- ---------------------------------------------------------------------------
-- Escala por rubro: 1..5. El 0 no existe como nota; "No se presentó" es un flag.
-- ---------------------------------------------------------------------------

CREATE TABLE escala_puntaje_version (
  rubro_version_id uuid PRIMARY KEY,
  version_id       uuid NOT NULL,
  edicion_id       uuid NOT NULL,
  minimo           integer NOT NULL,
  maximo           integer NOT NULL,
  CHECK (minimo = 1 AND maximo = 5),
  FOREIGN KEY (rubro_version_id, version_id)
    REFERENCES rubro_version (id, version_id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id, edicion_id)
    REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT
);

-- Rubro por especialidad: la planilla de cada jurado solo ve sus rubros.
CREATE TABLE rubro_especialidad (
  rubro_version_id uuid NOT NULL,
  especialidad_id  uuid NOT NULL,
  version_id       uuid NOT NULL,
  edicion_id       uuid NOT NULL,
  PRIMARY KEY (rubro_version_id, especialidad_id),
  FOREIGN KEY (rubro_version_id, version_id)
    REFERENCES rubro_version (id, version_id) ON DELETE RESTRICT,
  FOREIGN KEY (especialidad_id, edicion_id)
    REFERENCES especialidad (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id, edicion_id)
    REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT
);
CREATE INDEX rubro_especialidad_especialidad_id_idx ON rubro_especialidad (especialidad_id);

-- ---------------------------------------------------------------------------
-- Premios y requisitos de presentación de la versión
-- ---------------------------------------------------------------------------

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

-- Antes llamados "fijos". puede_puntuar sigue apagado hasta resolver R4b (D14).
CREATE TABLE requisito_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id      uuid NOT NULL,
  version_id      uuid NOT NULL,
  codigo          text NOT NULL,
  nombre          text NOT NULL,
  cantidad_minima integer NOT NULL CHECK (cantidad_minima > 0),
  puede_puntuar   boolean NOT NULL DEFAULT false,
  orden           integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (version_id, codigo)
);

-- ---------------------------------------------------------------------------
-- Fila de planilla: sujeto × rubro × especialidad
-- ---------------------------------------------------------------------------

CREATE TABLE fila_planilla (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id        uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  version_id        uuid NOT NULL,
  rubro_version_id  uuid NOT NULL,
  sujeto_id         uuid NOT NULL,
  especialidad_id   uuid NOT NULL,
  origen            text NOT NULL CHECK (origen IN ('GENERADA', 'MANUAL')),
  excluida          boolean NOT NULL DEFAULT false,
  orden             integer NOT NULL CHECK (orden > 0),
  FOREIGN KEY (rubro_version_id, version_id)
    REFERENCES rubro_version (id, version_id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id, edicion_id)
    REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (sujeto_id, edicion_id)
    REFERENCES sujeto_evaluable (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (rubro_version_id, especialidad_id)
    REFERENCES rubro_especialidad (rubro_version_id, especialidad_id) ON DELETE RESTRICT,
  UNIQUE (rubro_version_id, sujeto_id, especialidad_id)
);
CREATE INDEX fila_planilla_sujeto_id_idx ON fila_planilla (sujeto_id);
CREATE INDEX fila_planilla_especialidad_id_idx ON fila_planilla (especialidad_id);

-- Topes documentados en el borrador (H11b): cuentan sujetos nominados, no filas
-- (un mismo sujeto en varias especialidades ocupa un solo lugar).
CREATE FUNCTION fila_planilla_validar_topes() RETURNS trigger
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

  SELECT * INTO rubro FROM rubro_version WHERE id = NEW.rubro_version_id FOR UPDATE;
  SELECT * INTO sujeto FROM sujeto_evaluable WHERE id = NEW.sujeto_id;

  IF sujeto.tipo_sujeto IS DISTINCT FROM rubro.tipo_sujeto THEN
    RAISE EXCEPTION 'SUJETO_NO_CORRESPONDE_AL_RUBRO' USING ERRCODE = 'check_violation';
  END IF;

  IF rubro.tipo_rubro = 'ALEATORIO' THEN
    SELECT count(DISTINCT sujeto_id) INTO total
      FROM fila_planilla
     WHERE rubro_version_id = NEW.rubro_version_id
       AND NOT excluida
       AND sujeto_id <> NEW.sujeto_id;
    IF total + 1 > rubro.nominados_maximos THEN
      RAISE EXCEPTION 'NOMINADOS_MAXIMOS_SUPERADOS' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF rubro.nominados_maximos_por_comparsa IS NOT NULL THEN
    SELECT count(DISTINCT f.sujeto_id) INTO total_comparsa
      FROM fila_planilla AS f
      JOIN sujeto_evaluable AS s ON s.id = f.sujeto_id
     WHERE f.rubro_version_id = NEW.rubro_version_id
       AND NOT f.excluida
       AND f.sujeto_id <> NEW.sujeto_id
       AND s.comparsa_id = sujeto.comparsa_id;
    IF total_comparsa + 1 > rubro.nominados_maximos_por_comparsa THEN
      RAISE EXCEPTION 'NOMINADOS_POR_COMPARSA_SUPERADOS' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER fila_planilla_validar_topes_trg
  BEFORE INSERT OR UPDATE ON fila_planilla
  FOR EACH ROW EXECUTE FUNCTION fila_planilla_validar_topes();

-- ---------------------------------------------------------------------------
-- Integridad de la jerarquía de rubros (AGENTS.md §2 / D25)
-- ---------------------------------------------------------------------------

-- Un rubro con hijos no recibe fila directa: el resultado se obtiene por suma.
CREATE FUNCTION fila_planilla_rechazar_rubro_con_hijos() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Bloquea el rubro para que un hijo insertado en otra transacción no pueda
  -- cruzarse con esta comprobación (D25 exige padre sin nota manual).
  PERFORM 1 FROM rubro_version WHERE id = NEW.rubro_version_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM rubro_version WHERE padre_id = NEW.rubro_version_id) THEN
    RAISE EXCEPTION 'RUBRO_CON_SUBITEMS_NO_RECIBE_FILA' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fila_planilla_rechazar_rubro_con_hijos_trg
  BEFORE INSERT OR UPDATE ON fila_planilla
  FOR EACH ROW EXECUTE FUNCTION fila_planilla_rechazar_rubro_con_hijos();

-- La inversa de la misma regla: un rubro que ya tiene filas no puede pasar a ser
-- padre (ni siquiera en el mismo UPDATE). También se evitan auto-referencias y
-- ciclos, que romperían la suma del padre.
CREATE FUNCTION rubro_version_validar_jerarquia() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.padre_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.padre_id = NEW.id THEN
    RAISE EXCEPTION 'RUBRO_PADRE_IGUAL_AL_HIJO' USING ERRCODE = 'check_violation';
  END IF;
  -- Mismo candado que el trigger de filas: ambas transacciones se serializan
  -- sobre el rubro padre y una de ellas verá el cambio de la otra.
  PERFORM 1 FROM rubro_version WHERE id = NEW.padre_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM fila_planilla WHERE rubro_version_id = NEW.padre_id) THEN
    RAISE EXCEPTION 'RUBRO_CON_FILAS_NO_PUEDE_SER_PADRE' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ascendencia AS (
      SELECT rv.id, rv.padre_id
        FROM rubro_version AS rv
       WHERE rv.id = NEW.padre_id
      UNION ALL
      SELECT rv.id, rv.padre_id
        FROM rubro_version AS rv
        JOIN ascendencia AS a ON rv.id = a.padre_id
    )
    SELECT 1 FROM ascendencia WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'RUBRO_JERARQUIA_CICLICA' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rubro_version_validar_jerarquia_trg
  BEFORE INSERT OR UPDATE ON rubro_version
  FOR EACH ROW EXECUTE FUNCTION rubro_version_validar_jerarquia();

-- ---------------------------------------------------------------------------
-- Enmiendas al reglamento: registro sin efecto automático, inmutable
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
-- Instantánea de planillas esperadas (P1)
-- Cabecera: una por noche, con la versión de reglamento congelada al abrir.
-- Detalle: las asignaciones que forman el conjunto esperado en ese momento.
-- Solo se deja la estructura; la operación de apertura y su lógica se implementan
-- en un ticket posterior.
-- ---------------------------------------------------------------------------

-- La FK compuesta del detalle exige claves únicas que la migración 0007 no
-- tenía: se agregan aquí, sin modificar la definición original.
CREATE UNIQUE INDEX asignacion_jurado_id_noche_edicion_uidx
  ON asignacion_jurado (id, noche_id, edicion_id);

CREATE TABLE instantanea_planillas_esperadas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id    uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  noche_id      uuid NOT NULL,
  version_id    uuid NOT NULL,
  -- La fecha la fija la operación de apertura cuando se implemente; no se
  -- predeterminada al INSERT para no confundir "creada" con "congelada".
  congelada_en  timestamptz NOT NULL,
  -- Una noche se abre una sola vez; no regula excepciones ni reaperturas (D11).
  UNIQUE (noche_id),
  UNIQUE (id, edicion_id, noche_id),
  FOREIGN KEY (noche_id, edicion_id) REFERENCES noche (id, edicion_id) ON DELETE RESTRICT,
  FOREIGN KEY (version_id, edicion_id) REFERENCES version_reglamento (id, edicion_id) ON DELETE RESTRICT
);

CREATE TABLE instantanea_planilla_esperada_detalle (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instantanea_id  uuid NOT NULL,
  edicion_id      uuid NOT NULL,
  noche_id        uuid NOT NULL,
  asignacion_id   uuid NOT NULL,
  FOREIGN KEY (instantanea_id, edicion_id, noche_id)
    REFERENCES instantanea_planillas_esperadas (id, edicion_id, noche_id) ON DELETE RESTRICT,
  -- Garantiza que la asignación congelada pertenezca a la noche de la instantánea.
  FOREIGN KEY (asignacion_id, noche_id, edicion_id)
    REFERENCES asignacion_jurado (id, noche_id, edicion_id) ON DELETE RESTRICT,
  UNIQUE (instantanea_id, asignacion_id)
);

-- La instantánea es evidencia congelada: no se edita ni se borra (P1).
CREATE FUNCTION instantanea_planillas_esperadas_solo_registro() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'INSTANTANEA_INMODIFICABLE' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER instantanea_planillas_esperadas_solo_registro_trg
  BEFORE UPDATE OR DELETE ON instantanea_planillas_esperadas
  FOR EACH ROW EXECUTE FUNCTION instantanea_planillas_esperadas_solo_registro();

CREATE TRIGGER instantanea_planilla_esperada_detalle_solo_registro_trg
  BEFORE UPDATE OR DELETE ON instantanea_planilla_esperada_detalle
  FOR EACH ROW EXECUTE FUNCTION instantanea_planillas_esperadas_solo_registro();

-- TRUNCATE no dispara triggers de fila: se prohíbe explícitamente para que
-- ninguna vía borre la evidencia inmutable, igual que en la migración 0007.
CREATE FUNCTION registro_inmutable_0008_impedir_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'REGISTRO_0008_NO_TRUNCABLE' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER enmienda_reglamento_impedir_truncate_trg
  BEFORE TRUNCATE ON enmienda_reglamento
  FOR EACH STATEMENT EXECUTE FUNCTION registro_inmutable_0008_impedir_truncate();

CREATE TRIGGER instantaneas_esperadas_impedir_truncate_trg
  BEFORE TRUNCATE ON instantanea_planillas_esperadas
  FOR EACH STATEMENT EXECUTE FUNCTION registro_inmutable_0008_impedir_truncate();

CREATE TRIGGER instantanea_detalle_impedir_truncate_trg
  BEFORE TRUNCATE ON instantanea_planilla_esperada_detalle
  FOR EACH STATEMENT EXECUTE FUNCTION registro_inmutable_0008_impedir_truncate();
