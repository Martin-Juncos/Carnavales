-- Existing empty selections have no recorded intent and must be confirmed again.
ALTER TABLE configuracion_planilla_noche
  ADD COLUMN vacia_confirmada boolean NOT NULL DEFAULT false;
