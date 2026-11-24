-- Completa el catálogo común sin crear de nuevo el padrón, las filas o los rubros.
ALTER TABLE comparsa ADD UNIQUE (edicion_id, nombre);
ALTER TABLE rubro_version
  ADD COLUMN padre_id uuid,
  ADD COLUMN evaluable boolean NOT NULL DEFAULT true,
  ADD UNIQUE (id, version_id),
  ADD FOREIGN KEY (padre_id, version_id) REFERENCES rubro_version (id, version_id) ON DELETE RESTRICT;
CREATE INDEX rubro_version_padre_id_idx ON rubro_version (padre_id);
ALTER TABLE escala_puntaje_version ADD CHECK (minimo = 1 AND maximo = 5);

-- Integridad de la jerarquía de rubros
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
CREATE FUNCTION registro_inmutable_0014_impedir_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'REGISTRO_0014_NO_TRUNCABLE' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER enmienda_reglamento_impedir_truncate_trg
  BEFORE TRUNCATE ON enmienda_reglamento
  FOR EACH STATEMENT EXECUTE FUNCTION registro_inmutable_0014_impedir_truncate();

CREATE TRIGGER instantaneas_esperadas_impedir_truncate_trg
  BEFORE TRUNCATE ON instantanea_planillas_esperadas
  FOR EACH STATEMENT EXECUTE FUNCTION registro_inmutable_0014_impedir_truncate();

CREATE TRIGGER instantanea_detalle_impedir_truncate_trg
  BEFORE TRUNCATE ON instantanea_planilla_esperada_detalle
  FOR EACH STATEMENT EXECUTE FUNCTION registro_inmutable_0014_impedir_truncate();
