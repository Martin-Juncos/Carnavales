-- Migración propia del proyecto (0002).
-- Aplica restricciones y defaults que el generador de Better Auth 1.7.22 no crea.
-- Debe ejecutarse después de 0001-better-auth-1.7.22.sql.

-- Una misma identidad de proveedor no puede quedar vinculada a dos cuentas locales.
ALTER TABLE cuenta
  ADD CONSTRAINT cuenta_proveedor_cuenta_key UNIQUE (id_proveedor, id_cuenta);

-- Correo verificado: NOT NULL con valor predeterminado false (el correo se verifica al aceptar la invitación).
ALTER TABLE usuario
  ALTER COLUMN correo_verificado SET DEFAULT false;

-- Segundo factor del usuario: nunca NULL; por defecto desactivado.
UPDATE usuario SET doble_factor_habilitado = false WHERE doble_factor_habilitado IS NULL;
ALTER TABLE usuario
  ALTER COLUMN doble_factor_habilitado SET DEFAULT false,
  ALTER COLUMN doble_factor_habilitado SET NOT NULL;

-- Configuración 2FA: una sola fila por usuario.
-- La UNIQUE reemplaza al índice no único que generó Better Auth.
DROP INDEX IF EXISTS doble_factor_usuario_id_idx;
ALTER TABLE doble_factor
  ADD CONSTRAINT doble_factor_usuario_id_key UNIQUE (usuario_id);

-- Estado de la configuración 2FA: nunca NULL.
-- Las filas existentes sin valor se consideran no verificadas (false), que es el estado seguro.
UPDATE doble_factor SET verificado = false WHERE verificado IS NULL;
UPDATE doble_factor SET intentos_fallidos = 0 WHERE intentos_fallidos IS NULL;
ALTER TABLE doble_factor
  ALTER COLUMN verificado SET DEFAULT true,
  ALTER COLUMN verificado SET NOT NULL,
  ALTER COLUMN intentos_fallidos SET DEFAULT 0,
  ALTER COLUMN intentos_fallidos SET NOT NULL;
