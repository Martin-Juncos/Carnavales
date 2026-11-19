-- Migración 0009 (apertura de edición): operaciones de apertura idempotentes.
-- Adoptado de la referencia (migración 085). Da idempotencia a la apertura de una edición:
-- repetir la misma clave de operación no duplica efectos.
-- La apertura la ejecuta el servicio de apertura: el trigger edicion_validar_cambio (0006)
-- exige pertenecer al rol carnavales_servicio_apertura.
-- La apertura de noches queda pendiente (issue 08): aquí solo se registra la edición.

CREATE TABLE operacion_apertura (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id      uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT,
  clave_operacion text NOT NULL UNIQUE,
  resultado       text NOT NULL CHECK (resultado IN ('ABIERTA')),
  solicitada_por  text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  solicitada_en   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX operacion_apertura_edicion_id_idx ON operacion_apertura (edicion_id);
