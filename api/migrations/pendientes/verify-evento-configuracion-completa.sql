-- Verificación de la migración propia 0006 (agregado de edición).
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

-- Ni la edición ni la versión pueden nacer abiertas o publicadas por INSERT directo.
SELECT pg_temp.como_rol_debe_fallar($q$INSERT INTO edicion (nombre, anio, estado, creada_por, abierta_en) VALUES ('Edición directa', 2028, 'OPEN', 'u1', CURRENT_TIMESTAMP)$q$, 'APERTURA_REQUIERE_SERVICIO', 'crear edición directamente abierta', false);
SELECT pg_temp.debe_fallar($q$INSERT INTO version_reglamento (edicion_id, numero, estado, fuente, creada_por, publicada_por, publicada_en) VALUES ('11111111-1111-4111-8111-111111111111', 3, 'PUBLICADA', 'otro', 'u1', 'u1', CURRENT_TIMESTAMP)$q$, 'VERSION_DEBE_CREARSE_EN_BORRADOR', 'crear versión directamente publicada');
SELECT pg_temp.debe_fallar($q$INSERT INTO version_reglamento (edicion_id, numero, estado, fuente, creada_por) VALUES ('11111111-1111-4111-8111-111111111111', 2, 'BORRADOR', 'otro', 'u1')$q$, '23505', 'segundo borrador a la vez');
SELECT pg_temp.debe_fallar($q$INSERT INTO noche (edicion_id, orden, nombre, tipo, estado) VALUES ('11111111-1111-4111-8111-111111111111', 1, 'N1', 'COMPETENCIA', 'OPEN')$q$, 'NOCHE_DEBE_CREARSE_EN_DRAFT', 'crear noche directamente en OPEN');

INSERT INTO noche (id, edicion_id, orden, nombre, tipo) VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 1, 'Noche 1', 'COMPETENCIA');
INSERT INTO noche (id, edicion_id, orden, nombre, tipo) VALUES ('33333333-3333-4333-8333-333333333334', '11111111-1111-4111-8111-111111111111', 2, 'Noche 2', 'COMPETENCIA');

-- Con el servicio de apertura, la noche no abre mientras la edición esté CONFIGURING.
SELECT pg_temp.como_rol_debe_fallar($q$UPDATE noche SET estado='OPEN' WHERE id='33333333-3333-4333-8333-333333333333'$q$, 'EDICION_NO_ABIERTA', 'abrir noche con edición no abierta', true);

-- Regla de versión: con la edición abierta pero sin versión publicada, la noche no abre.
SAVEPOINT sin_version;
SELECT pg_temp.como_rol($q$UPDATE edicion SET estado='OPEN', abierta_en=CURRENT_TIMESTAMP WHERE id='11111111-1111-4111-8111-111111111111'$q$, true);
SELECT pg_temp.como_rol_debe_fallar($q$UPDATE noche SET estado='OPEN' WHERE id='33333333-3333-4333-8333-333333333333'$q$, 'NOCHE_SIN_VERSION_PUBLICADA', 'abrir noche sin versión publicada', true);
ROLLBACK TO SAVEPOINT sin_version;

-- Pertenencia al rol: sin ser miembro, la apertura se rechaza aunque la sesión fije la variable antigua.
SELECT set_config('app.permitir_apertura','true',true);
SELECT pg_temp.como_rol_debe_fallar($q$UPDATE noche SET estado='OPEN' WHERE id='33333333-3333-4333-8333-333333333333'$q$, 'APERTURA_REQUIERE_SERVICIO', 'la variable de sesión no abre una noche', false);

INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden) VALUES ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Vestuario', 'VES', 1);
INSERT INTO comparsa (id, edicion_id, nombre, categoria) VALUES ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Porambá', 'PRIMERA');
INSERT INTO participante (id, edicion_id, nombre_completo) VALUES ('88888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111', 'Participante de prueba');
INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, nombre) VALUES
 ('66666666-6666-4666-8666-666666666661', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'CARRO', 'Carro 1'),
 ('66666666-6666-4666-8666-666666666662', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'CARRO', 'Carro 2'),
 ('66666666-6666-4666-8666-666666666663', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'CARRO', 'Carro 3'),
 ('66666666-6666-4666-8666-666666666664', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'CARRO', 'Carro 4'),
 ('66666666-6666-4666-8666-666666666665', '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'BATERIA', 'Batería');
INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, participante_id)
VALUES ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111',
        '55555555-5555-4555-8555-555555555555', 'PERSONA', '88888888-8888-4888-8888-888888888888');
INSERT INTO orden_presentacion (id, edicion_id, noche_id, comparsa_id, orden_presentacion)
VALUES ('99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555', 1);

-- Comparsa inactiva: no entra en el padrón, y una comparsa con padrón cargado no se desactiva.
INSERT INTO comparsa (id, edicion_id, nombre, categoria, activa) VALUES ('55555555-5555-4555-8555-555555555556', '11111111-1111-4111-8111-111111111111', 'Inactiva', 'AGRUPACION', false);
SELECT pg_temp.debe_fallar($q$INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre) VALUES ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555556', 'CARRO', 'Carro inactivo')$q$, 'COMPARSA_INACTIVA', 'padrón de una comparsa inactiva');
INSERT INTO comparsa (id, edicion_id, nombre, categoria, activa) VALUES ('55555555-5555-4555-8555-555555555557', '11111111-1111-4111-8111-111111111111', 'Vacía', 'AGRUPACION', true);
UPDATE comparsa SET activa = false WHERE id = '55555555-5555-4555-8555-555555555557';
SELECT pg_temp.debe_fallar($q$UPDATE comparsa SET activa = false WHERE id = '55555555-5555-4555-8555-555555555555'$q$, 'COMPARSA_CON_PADRON', 'desactivar una comparsa con padrón cargado');

-- Reordenar: intercambiar dos posiciones de la misma noche solo funciona con la restricción diferida.
INSERT INTO comparsa (id, edicion_id, nombre, categoria, activa) VALUES ('55555555-5555-4555-8555-555555555558', '11111111-1111-4111-8111-111111111111', 'Intercambio', 'AGRUPACION', true);
INSERT INTO orden_presentacion (id, edicion_id, noche_id, comparsa_id, orden_presentacion)
VALUES ('99999999-9999-4999-8999-999999999998', '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555558', 2);
-- Mover una fila a una posición ocupada falla al terminar la sentencia.
SELECT pg_temp.debe_fallar($q$UPDATE orden_presentacion SET orden_presentacion = 2 WHERE id = '99999999-9999-4999-8999-999999999999'$q$, '23505', 'mover el orden a una posición ocupada');
-- El intercambio en dos pasos necesita la restricción diferida dentro de la transacción.
SET CONSTRAINTS orden_presentacion_noche_posicion_uk DEFERRED;
UPDATE orden_presentacion SET orden_presentacion = 2 WHERE id = '99999999-9999-4999-8999-999999999999';
UPDATE orden_presentacion SET orden_presentacion = 1 WHERE id = '99999999-9999-4999-8999-999999999998';
SET CONSTRAINTS orden_presentacion_noche_posicion_uk IMMEDIATE;
DO $$
BEGIN
  IF (SELECT orden_presentacion FROM orden_presentacion WHERE id = '99999999-9999-4999-8999-999999999999') <> 2
     OR (SELECT orden_presentacion FROM orden_presentacion WHERE id = '99999999-9999-4999-8999-999999999998') <> 1 THEN
    RAISE EXCEPTION 'FALLA: el intercambio de orden no quedó aplicado';
  END IF;
END;
$$;

-- Un participante conserva una identidad y puede tener dos apariciones ordenadas en la misma comparsa y noche.
INSERT INTO pasada (id, edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111',
  '99999999-9999-4999-8999-999999999999', '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666', 1),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111',
  '99999999-9999-4999-8999-999999999999', '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666', 2);
DO $$
BEGIN
  IF (SELECT count(*) FROM pasada
       WHERE sujeto_id = '66666666-6666-4666-8666-666666666666') <> 2 THEN
    RAISE EXCEPTION 'FALLA: las dos apariciones deben conservarse';
  END IF;
END;
$$;
SELECT pg_temp.debe_fallar(
  $q$INSERT INTO pasada (edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden)
     VALUES ('11111111-1111-4111-8111-111111111111', '99999999-9999-4999-8999-999999999999',
             '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 2)$q$,
  '23505',
  'dos apariciones no comparten la misma posición');

-- Intercambio de apariciones: la misma regla, con la restricción diferida dentro de la transacción.
SELECT pg_temp.debe_fallar($q$UPDATE pasada SET orden = 2 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$q$, '23505', 'mover una aparición a una posición ocupada');
SET CONSTRAINTS pasada_posicion_uk DEFERRED;
UPDATE pasada SET orden = 2 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
UPDATE pasada SET orden = 1 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
SET CONSTRAINTS pasada_posicion_uk IMMEDIATE;
DO $$
BEGIN
  IF (SELECT orden FROM pasada WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') <> 2
     OR (SELECT orden FROM pasada WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2') <> 1 THEN
    RAISE EXCEPTION 'FALLA: el intercambio de apariciones no quedó aplicado';
  END IF;
END;
$$;

INSERT INTO rubro_version (id, edicion_id, version_id, codigo, nombre, tipo_sujeto, tipo_rubro, nominados_maximos, orden)
VALUES ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'CARRO_DISENO', 'Mejor carro', 'CARRO', 'ALEATORIO', 3, 1);
INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, version_id, edicion_id)
VALUES ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');
INSERT INTO escala_puntaje_version (rubro_version_id, version_id, edicion_id, minimo, maximo)
VALUES ('77777777-7777-4777-8777-777777777777', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 1, 5);

SELECT pg_temp.debe_fallar($q$INSERT INTO rubro_version (edicion_id, version_id, codigo, nombre, tipo_sujeto, tipo_rubro, orden) VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'X', 'Aleatorio sin máximo', 'CARRO', 'ALEATORIO', 2)$q$, '23514', 'aleatorio sin nominados máximos');

-- Una segunda especialidad para el mismo rubro: el mismo sujeto puede figurar en ambas sin ocupar otro lugar.
INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden) VALUES ('44444444-4444-4444-8444-444444444445', '11111111-1111-4111-8111-111111111111', 'Bailes', 'BAI', 2);
INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, version_id, edicion_id)
VALUES ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444445', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');

-- Nominaciones: 3 permitidas, la cuarta falla (límite por evento)
INSERT INTO objetivo_rubro (edicion_id, version_id, rubro_version_id, sujeto_id, especialidad_id, origen, orden) VALUES
 ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666661', '44444444-4444-4444-8444-444444444444', 'MANUAL', 1),
 ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666662', '44444444-4444-4444-8444-444444444444', 'MANUAL', 2),
 ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666663', '44444444-4444-4444-8444-444444444444', 'MANUAL', 3);
INSERT INTO objetivo_rubro (edicion_id, version_id, rubro_version_id, sujeto_id, especialidad_id, origen, orden) VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666661', '44444444-4444-4444-8444-444444444445', 'MANUAL', 6);
SELECT pg_temp.debe_fallar($q$INSERT INTO objetivo_rubro (edicion_id, version_id, rubro_version_id, sujeto_id, especialidad_id, origen, orden) VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666664', '44444444-4444-4444-8444-444444444444', 'MANUAL', 4)$q$, 'NOMINADOS_MAXIMOS_SUPERADOS', 'cuarta nominada supera el máximo de 3');
SELECT pg_temp.debe_fallar($q$INSERT INTO objetivo_rubro (edicion_id, version_id, rubro_version_id, sujeto_id, especialidad_id, origen, orden) VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666665', '44444444-4444-4444-8444-444444444444', 'MANUAL', 5)$q$, 'SUJETO_NO_CORRESPONDE_AL_RUBRO', 'sujeto BATERIA en rubro de CARRO');

-- Publicar y abrir (opción B)
UPDATE version_reglamento SET estado='PUBLICADA', publicada_por='u1', publicada_en=CURRENT_TIMESTAMP WHERE id='22222222-2222-4222-8222-222222222222';
SELECT pg_temp.debe_fallar($q$UPDATE rubro_version SET nombre='Cambiado' WHERE id='77777777-7777-4777-8777-777777777777'$q$, 'VERSION_CONGELADA', 'editar rubro con versión publicada');
SELECT pg_temp.como_rol_debe_fallar($q$UPDATE edicion SET estado='OPEN', abierta_en=CURRENT_TIMESTAMP WHERE id='11111111-1111-4111-8111-111111111111'$q$, 'APERTURA_REQUIERE_SERVICIO', 'abrir edición sin servicio', false);
SELECT pg_temp.como_rol($q$UPDATE edicion SET estado='OPEN', abierta_en=CURRENT_TIMESTAMP WHERE id='11111111-1111-4111-8111-111111111111'$q$, true);
SELECT pg_temp.como_rol_debe_fallar($q$UPDATE noche SET estado='OPEN' WHERE id='33333333-3333-4333-8333-333333333333'$q$, 'APERTURA_REQUIERE_SERVICIO', 'abrir noche sin servicio', false);
SELECT pg_temp.como_rol($q$UPDATE noche SET estado='OPEN' WHERE id='33333333-3333-4333-8333-333333333333'$q$, true);
SELECT 'versión tras abrir la noche: ' || estado AS resultado FROM version_reglamento WHERE id='22222222-2222-4222-8222-222222222222';
-- Con la primera noche abierta, el orden de presentación de la segunda noche ya no puede cambiar.
SELECT pg_temp.debe_fallar($q$INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion) VALUES ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333334', '55555555-5555-4555-8555-555555555555', 1)$q$, 'PADRON_CONGELADO', 'orden de la segunda noche después de abrir la primera');
SELECT pg_temp.como_rol($q$UPDATE noche SET estado='OPEN' WHERE id='33333333-3333-4333-8333-333333333334'$q$, true);
DO $$
BEGIN
  IF (SELECT estado FROM noche WHERE id = '33333333-3333-4333-8333-333333333334') <> 'OPEN' THEN
    RAISE EXCEPTION 'FALLA: la segunda noche debe abrirse con la versión congelada';
  END IF;
END;
$$;
SELECT pg_temp.debe_fallar(
  $q$INSERT INTO pasada (edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden)
     VALUES ('11111111-1111-4111-8111-111111111111', '99999999-9999-4999-8999-999999999999',
             '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', 3)$q$,
  'PASADA_NOCHE_NO_EDITABLE',
  'no se agregan apariciones después de abrir la noche');
SELECT pg_temp.debe_fallar($q$INSERT INTO comparsa (edicion_id, nombre, categoria) VALUES ('11111111-1111-4111-8111-111111111111', 'Nueva', 'AGRUPACION')$q$, 'PADRON_CONGELADO', 'agregar comparsa con padrón congelado');
SELECT pg_temp.debe_fallar($q$UPDATE version_reglamento SET fuente='cambio' WHERE id='22222222-2222-4222-8222-222222222222'$q$, 'VERSION_CONGELADA', 'cambiar fuente de versión congelada');

-- Cierre definitivo
SELECT pg_temp.como_rol($q$UPDATE noche SET estado='CLOSED' WHERE id='33333333-3333-4333-8333-333333333333'$q$, true);
SELECT pg_temp.debe_fallar($q$UPDATE noche SET estado='OPEN' WHERE id='33333333-3333-4333-8333-333333333333'$q$, 'NOCHE_CERRADA', 'reabrir noche cerrada');

-- Enmienda: solo registro
INSERT INTO enmienda_reglamento (edicion_id, version_id, contenido, motivo, responsable_id)
VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Cambio de escala', 'Prueba', 'u1');
SELECT pg_temp.debe_fallar($q$UPDATE enmienda_reglamento SET motivo='x'$q$, 'ENMIENDA_INMUTABLE', 'editar enmienda');
SELECT pg_temp.debe_fallar($q$DELETE FROM enmienda_reglamento$q$, 'ENMIENDA_INMUTABLE', 'borrar enmienda');

ROLLBACK;
