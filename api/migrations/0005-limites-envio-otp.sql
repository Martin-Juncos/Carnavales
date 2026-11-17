-- Migración propia del proyecto (0005).
-- Contadores compartidos por todas las instancias para limitar el envío de códigos OTP.
-- Claves: 'cuenta:<usuario_id>' (última solicitud) e 'ip:<direccion>' (solicitudes de la ventana actual).
-- Debe ejecutarse después de 0004-invitaciones.sql.

CREATE TABLE limite_envio_otp (
  clave           text PRIMARY KEY,
  -- Para cuentas: momento de la última solicitud.
  ultimo_envio    timestamptz,
  -- Para IP: inicio de la ventana y cantidad de solicitudes dentro de ella.
  ventana_inicio  timestamptz,
  envios          integer NOT NULL DEFAULT 0
);
