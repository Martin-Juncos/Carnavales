-- Verificación de las migraciones propias 0002–0004.
-- Ejecutar sobre una base con 0001..0004 aplicadas:
--   psql -v ON_ERROR_STOP=1 -f verify-0002-0004.sql
-- Todo corre en una transacción que se revierte al final: no deja datos.

BEGIN;

-- Ejecuta q y devuelve 'ok' si falla (la restricción funciona); si no, detiene la prueba.
CREATE OR REPLACE FUNCTION pg_temp.debe_fallar(q text, etiqueta text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'ok: ' || etiqueta || ' -> ' || SQLERRM;
  END;
  RAISE EXCEPTION 'FALLA (no falló): %', etiqueta;
END;
$$;

-- El helper debe convertir una operación inesperadamente exitosa en un error real.
DO $$
DECLARE
  error_detectado boolean := false;
BEGIN
  BEGIN
    PERFORM pg_temp.debe_fallar('SELECT 1', 'autocomprobación del helper');
  EXCEPTION WHEN raise_exception THEN
    error_detectado := SQLERRM = 'FALLA (no falló): autocomprobación del helper';
  END;

  IF NOT error_detectado THEN
    RAISE EXCEPTION 'El helper debe fallar si la operación de prueba tiene éxito';
  END IF;
END;
$$;

-- Usuarios de prueba.
INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES
  ('u-inicial',   'Admin inicial', 'inicial@example.test',   true),
  ('u-asignador', 'Asignador',     'asignador@example.test', true),
  ('u-comun',     'Persona común', 'comun@example.test',     true),
  ('u-jurado',    'Jurado',        'jurado@example.test',    true);

-- ---------- 0002: Better Auth endurecido ----------

-- La primera cuenta del par proveedor+cuenta sí se inserta; la segunda debe fallar.
INSERT INTO cuenta (id, id_cuenta, id_proveedor, usuario_id, creado_en, actualizado_en)
  VALUES ('c1', 'mismo', 'credential', 'u-comun', now(), now());

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO cuenta (id, id_cuenta, id_proveedor, usuario_id, creado_en, actualizado_en)
     VALUES ('c2', 'mismo', 'credential', 'u-comun', now(), now())$q$,
  'cuenta: (id_proveedor, id_cuenta) único') AS resultado;

WITH nuevo AS (
  INSERT INTO usuario (id, nombre, correo, correo_verificado)
  VALUES ('u-defecto', 'Defecto', 'defecto@example.test', false)
  RETURNING doble_factor_habilitado
)
SELECT 'doble_factor_habilitado por defecto = ' || doble_factor_habilitado::text AS resultado FROM nuevo;

SELECT pg_temp.debe_fallar(
  $q$UPDATE usuario SET doble_factor_habilitado = NULL WHERE id = 'u-defecto'$q$,
  'usuario: doble_factor_habilitado no admite NULL') AS resultado;

INSERT INTO doble_factor (id, secreto, codigos_respaldo, usuario_id, verificado, intentos_fallidos)
  VALUES ('f1', 's1', 'r1', 'u-comun', true, 0);

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO doble_factor (id, secreto, codigos_respaldo, usuario_id, verificado, intentos_fallidos)
     VALUES ('f2', 's2', 'r2', 'u-comun', true, 0)$q$,
  'doble_factor: una sola configuración por usuario') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO doble_factor (id, secreto, codigos_respaldo, usuario_id, verificado, intentos_fallidos)
     VALUES ('f3', 's3', 'r3', 'u-jurado', NULL, 0)$q$,
  'doble_factor: verificado no admite NULL') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO doble_factor (id, secreto, codigos_respaldo, usuario_id, verificado, intentos_fallidos)
     VALUES ('f4', 's4', 'r4', 'u-jurado', true, NULL)$q$,
  'doble_factor: intentos_fallidos no admite NULL') AS resultado;

-- ---------- 0003: roles y primer administrador ----------

SELECT 'roles del catálogo = ' || count(*) AS resultado FROM rol;

-- Asignación inicial: válida solo con ADMINISTRADOR.
INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
  VALUES ('u-inicial', 'rol-administrador', NULL, true);

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     VALUES ('u-jurado', 'rol-administrador', 'u-inicial', true)$q$,
  'usuario_rol: segunda asignación inicial') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     VALUES ('u-jurado', 'rol-jurado', 'u-inicial', true)$q$,
  'usuario_rol: es_inicial solo con ADMINISTRADOR') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$UPDATE usuario_rol SET rol_id = 'rol-jurado' WHERE usuario_id = 'u-inicial'$q$,
  'usuario_rol: la asignación inicial no se puede cambiar') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$DELETE FROM usuario_rol WHERE usuario_id = 'u-inicial'$q$,
  'usuario_rol: la asignación inicial no se puede quitar') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$DELETE FROM usuario WHERE id = 'u-inicial'$q$,
  'usuario: el primer administrador no se puede borrar') AS resultado;

-- Asignaciones normales: asignador y asignado.
INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por) VALUES
  ('u-asignador', 'rol-administrador', 'u-inicial'),
  ('u-comun',     'rol-jurado',        'u-asignador');

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por) VALUES ('u-comun', 'rol-jurado', 'u-inicial')$q$,
  'usuario_rol: no duplica una asignación (clave compuesta)') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$DELETE FROM rol WHERE id = 'rol-jurado'$q$,
  'rol: no se borra un rol con asignaciones') AS resultado;

-- Borrar al asignador conserva la asignación del otro usuario y pone asignado_por en NULL.
DELETE FROM usuario WHERE id = 'u-asignador';
SELECT 'tras borrar al asignador: rol de u-comun sigue = ' ||
  (SELECT rol_id FROM usuario_rol WHERE usuario_id = 'u-comun') ||
  ', asignado_por = ' || coalesce((SELECT asignado_por FROM usuario_rol WHERE usuario_id = 'u-comun'), 'NULL') AS resultado;

-- Borrar una cuenta normal funciona y arrastra sus asignaciones.
DELETE FROM usuario WHERE id = 'u-comun';
SELECT 'tras borrar u-comun, sus asignaciones = ' ||
  (SELECT count(*) FROM usuario_rol WHERE usuario_id = 'u-comun') AS resultado;

-- ---------- 0004: invitaciones ----------

INSERT INTO invitacion (id, correo_invitado, rol_inicial_id, hash_token, vence_en, creada_por)
  VALUES ('i1', 'nueva@example.test', 'rol-jurado', 'h1', now() + interval '72 hours', 'u-inicial');

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO invitacion (id, correo_invitado, rol_inicial_id, hash_token, vence_en, creada_por)
     VALUES ('i2', 'nueva@example.test', 'rol-jurado', 'h2', now() + interval '72 hours', 'u-inicial')$q$,
  'invitacion: una sola pendiente por correo') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO invitacion (id, correo_invitado, rol_inicial_id, hash_token, vence_en, creada_por)
     VALUES ('i3', 'Mayus@example.test', 'rol-jurado', 'h3', now() + interval '72 hours', 'u-inicial')$q$,
  'invitacion: correo normalizado a minúsculas') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO invitacion (id, correo_invitado, rol_inicial_id, hash_token, estado, vence_en, creada_por, aceptada_en)
     VALUES ('i4', 'otra@example.test', 'rol-jurado', 'h4', 'aceptada', now(), 'u-inicial', NULL)$q$,
  'invitacion: aceptada exige aceptada_en') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO invitacion (id, correo_invitado, rol_inicial_id, hash_token, estado, vence_en, creada_por, revocada_en)
     VALUES ('i5', 'otra2@example.test', 'rol-jurado', 'h5', 'pendiente', now(), 'u-inicial', now())$q$,
  'invitacion: pendiente no admite fecha de revocación') AS resultado;

SELECT pg_temp.debe_fallar(
  $q$INSERT INTO invitacion (id, correo_invitado, rol_inicial_id, hash_token, estado, vence_en, creada_por)
     VALUES ('i6', 'otra3@example.test', 'rol-jurado', 'h6', 'expirada', now(), 'u-inicial')$q$,
  'invitacion: estado fuera del catálogo') AS resultado;

-- Una pendiente ya marcada como vencida libera el correo para una nueva pendiente.
UPDATE invitacion SET estado = 'vencida' WHERE id = 'i1';
INSERT INTO invitacion (id, correo_invitado, rol_inicial_id, hash_token, vence_en, creada_por)
  VALUES ('i7', 'nueva@example.test', 'rol-jurado', 'h7', now() + interval '72 hours', 'u-inicial');
SELECT 'tras marcar vencida, se puede emitir nueva pendiente: ok' AS resultado;

ROLLBACK;
