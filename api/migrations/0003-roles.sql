-- Migración propia del proyecto (0003).
-- Catálogo de roles, asignaciones múltiples y protección del primer administrador.
-- Debe ejecutarse después de 0002-endurecer-tablas-better-auth.sql.

CREATE TABLE rol (
  id          text PRIMARY KEY,
  codigo      text NOT NULL UNIQUE,
  nombre      text NOT NULL,
  descripcion text
);

-- Catálogo inicial aprobado en el diseño.
INSERT INTO rol (id, codigo, nombre) VALUES
  ('rol-administrador', 'ADMINISTRADOR', 'Administrador'),
  ('rol-jurado',        'JURADO',        'Jurado'),
  ('rol-escribano',     'ESCRIBANO',     'Escribano'),
  ('rol-comisario',     'COMISARIO',     'Comisario');

CREATE TABLE usuario_rol (
  usuario_id    text NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  rol_id        text NOT NULL REFERENCES rol (id) ON DELETE RESTRICT,
  -- Se pone en NULL si el asignador se borra: la asignación se conserva y se pierde solo la atribución.
  asignado_por  text REFERENCES usuario (id) ON DELETE SET NULL,
  asignado_en   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Marca del primer administrador. Solo el bootstrap la pone en true.
  es_inicial    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (usuario_id, rol_id)
);

-- A lo sumo una asignación inicial en toda la tabla, aunque dos bootstraps corran a la vez.
CREATE UNIQUE INDEX usuario_rol_inicial_unico
  ON usuario_rol (es_inicial)
  WHERE es_inicial;

-- Índice para consultar los roles de un usuario por rol (el lado usuario_id ya lo cubre la PK).
CREATE INDEX usuario_rol_rol_id_idx ON usuario_rol (rol_id);

-- La marca es_inicial solo puede usarse con el rol ADMINISTRADOR.
-- Un CHECK no puede consultar rol.codigo, así que se usa un trigger.
CREATE OR REPLACE FUNCTION usuario_rol_validar_inicial() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.es_inicial AND NOT EXISTS (
    SELECT 1 FROM rol WHERE rol.id = NEW.rol_id AND rol.codigo = 'ADMINISTRADOR'
  ) THEN
    RAISE EXCEPTION 'es_inicial solo puede usarse con el rol ADMINISTRADOR'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER usuario_rol_validar_inicial_trg
  BEFORE INSERT OR UPDATE ON usuario_rol
  FOR EACH ROW EXECUTE FUNCTION usuario_rol_validar_inicial();

-- La asignación inicial no puede modificarse ni quitarse.
CREATE OR REPLACE FUNCTION usuario_rol_proteger_inicial() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.es_inicial THEN
    RAISE EXCEPTION 'la asignación inicial de administrador no puede modificarse ni quitarse'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER usuario_rol_proteger_inicial_trg
  BEFORE UPDATE OR DELETE ON usuario_rol
  FOR EACH ROW EXECUTE FUNCTION usuario_rol_proteger_inicial();

-- Una cuenta con asignación inicial no puede borrarse.
-- Este trigger corre antes que las cascadas, así que la regla se aplica aunque el borrado venga de usuario.
CREATE OR REPLACE FUNCTION usuario_proteger_primer_administrador() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM usuario_rol WHERE usuario_rol.usuario_id = OLD.id AND usuario_rol.es_inicial) THEN
    RAISE EXCEPTION 'no se puede eliminar al primer administrador'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER usuario_proteger_primer_administrador_trg
  BEFORE DELETE ON usuario
  FOR EACH ROW EXECUTE FUNCTION usuario_proteger_primer_administrador();
