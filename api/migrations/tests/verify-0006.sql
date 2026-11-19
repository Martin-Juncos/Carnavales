-- Verificación de la migración 0006 (edición y versiones de reglamento).
-- Ejecutar sobre una base con 0001..0006 aplicadas, de preferencia una base de prueba:
--   psql -v ON_ERROR_STOP=1 -f verify-0006.sql
-- Todo corre en una transacción que se revierte al final: no deja datos.
-- Cada caso negativo exige el mensaje o SQLSTATE de la regla que se quiere probar: un error
-- distinto hace fallar la verificación.
-- La apertura se prueba con un rol que no es superusuario: los superusuarios pertenecen
-- implícitamente a cualquier rol y el control no se vería.


BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.debe_fallar(q text, esperado text, etiqueta text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = esperado OR SQLERRM LIKE '%' || esperado || '%' THEN
      RETURN 'ok: ' || etiqueta || ' -> ' || SQLERRM;
    END IF;
    RAISE EXCEPTION 'FALLA (error inesperado en "%"): se esperaba %, se obtuvo: %', etiqueta, esperado, SQLERRM;
  END;
  RAISE EXCEPTION 'FALLA (no falló): %', etiqueta;
END;
$$;

-- Rol de prueba sin pertenencia al servicio de apertura. Se crea solo si no existe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carnavales_rol_prueba') THEN
    CREATE ROLE carnavales_rol_prueba NOLOGIN;
  END IF;
END
$$;
DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO carnavales_rol_prueba', current_schema());
  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO carnavales_rol_prueba', current_schema());
  EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO carnavales_rol_prueba', current_schema());
END
$$;

-- Ejecuta q como el rol de prueba. con_servicio indica si pertenece al servicio de apertura.
CREATE FUNCTION pg_temp.como_rol(q text, con_servicio boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF con_servicio THEN
    GRANT carnavales_servicio_apertura TO carnavales_rol_prueba;
  END IF;
  SET ROLE carnavales_rol_prueba;
  EXECUTE q;
  RESET ROLE;
  IF con_servicio THEN
    REVOKE carnavales_servicio_apertura FROM carnavales_rol_prueba;
  END IF;
END;
$$;

-- Como pg_temp.debe_fallar, pero el error debe producirse como el rol de prueba.
CREATE FUNCTION pg_temp.como_rol_debe_fallar(q text, esperado text, etiqueta text, con_servicio boolean) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  resultado text;
BEGIN
  IF con_servicio THEN
    GRANT carnavales_servicio_apertura TO carnavales_rol_prueba;
  END IF;
  SET ROLE carnavales_rol_prueba;
  resultado := pg_temp.debe_fallar(q, esperado, etiqueta);
  RESET ROLE;
  IF con_servicio THEN
    REVOKE carnavales_servicio_apertura FROM carnavales_rol_prueba;
  END IF;
  RETURN resultado;
END;
$$;
INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES ('u1', 'Admin', 'admin@prueba.test', true);

INSERT INTO edicion (id, nombre, anio, estado, creada_por)
VALUES ('11111111-1111-4111-8111-111111111111', 'Carnaval 2027', 2027, 'CONFIGURING', 'u1');
INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 1, 'BORRADOR', 'Proyecto 2027', 'u1');

-- Año positivo y único.
SELECT pg_temp.debe_fallar($q$INSERT INTO edicion (nombre, anio, estado, creada_por) VALUES ('Año cero', 0, 'CONFIGURING', 'u1')$q$, '23514', 'año no positivo');
SELECT pg_temp.debe_fallar($q$INSERT INTO edicion (nombre, anio, estado, creada_por) VALUES ('Repetida', 2027, 'CONFIGURING', 'u1')$q$, '23505', 'año duplicado');

-- Ni la edición ni la versión pueden nacer abiertas o publicadas por INSERT directo.
SELECT pg_temp.como_rol_debe_fallar($q$INSERT INTO edicion (nombre, anio, estado, creada_por, abierta_en) VALUES ('Edición directa', 2028, 'OPEN', 'u1', CURRENT_TIMESTAMP)$q$, 'APERTURA_REQUIERE_SERVICIO', 'crear edición directamente abierta', false);
SELECT pg_temp.debe_fallar($q$INSERT INTO version_reglamento (edicion_id, numero, estado, fuente, creada_por, publicada_por, publicada_en) VALUES ('11111111-1111-4111-8111-111111111111', 3, 'PUBLICADA', 'otro', 'u1', 'u1', CURRENT_TIMESTAMP)$q$, 'VERSION_DEBE_CREARSE_EN_BORRADOR', 'crear versión directamente publicada');
SELECT pg_temp.debe_fallar($q$INSERT INTO version_reglamento (edicion_id, numero, estado, fuente, creada_por) VALUES ('11111111-1111-4111-8111-111111111111', 2, 'BORRADOR', 'otro', 'u1')$q$, '23505', 'segundo borrador a la vez');

-- La apertura exige el rol de servicio: fijar una variable de sesión no basta.
SELECT set_config('app.permitir_apertura','true',true);
SELECT pg_temp.como_rol_debe_fallar($q$UPDATE edicion SET estado='OPEN', abierta_en=CURRENT_TIMESTAMP WHERE id='11111111-1111-4111-8111-111111111111'$q$, 'APERTURA_REQUIERE_SERVICIO', 'la variable de sesión no abre la edición', false);

-- Versión: publicar el borrador; después no cambia su contenido, no retrocede y no se borra.
UPDATE version_reglamento SET estado='PUBLICADA', publicada_por='u1', publicada_en=CURRENT_TIMESTAMP WHERE id='22222222-2222-4222-8222-222222222222';
SELECT pg_temp.debe_fallar($q$UPDATE version_reglamento SET fuente='cambio' WHERE id='22222222-2222-4222-8222-222222222222'$q$, 'VERSION_CONGELADA', 'cambiar la fuente de una versión publicada');
SELECT pg_temp.debe_fallar($q$UPDATE version_reglamento SET estado='BORRADOR' WHERE id='22222222-2222-4222-8222-222222222222'$q$, 'TRANSICION_VERSION_INVALIDA', 'volver una versión publicada a borrador');
SELECT pg_temp.debe_fallar($q$DELETE FROM version_reglamento WHERE id='22222222-2222-4222-8222-222222222222'$q$, 'VERSION_NO_BORRABLE', 'borrar una versión publicada');

-- Apertura con el rol de servicio; una edición abierta no vuelve a configuración ni se borra.
SELECT pg_temp.como_rol($q$UPDATE edicion SET estado='OPEN', abierta_en=CURRENT_TIMESTAMP WHERE id='11111111-1111-4111-8111-111111111111'$q$, true);
SELECT pg_temp.debe_fallar($q$UPDATE edicion SET estado='CONFIGURING', abierta_en=NULL WHERE id='11111111-1111-4111-8111-111111111111'$q$, 'EDICION_NO_REABRIBLE', 'volver a configuración una edición abierta');
SELECT pg_temp.debe_fallar($q$DELETE FROM edicion WHERE id='11111111-1111-4111-8111-111111111111'$q$, 'EDICION_NO_BORRABLE', 'borrar una edición abierta');

ROLLBACK;
