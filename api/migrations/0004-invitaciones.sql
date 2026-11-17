-- Migración propia del proyecto (0004).
-- Invitaciones de alta: una sola pendiente por correo y estados coherentes con sus fechas.
-- Debe ejecutarse después de 0003-roles.sql.

CREATE TABLE invitacion (
  id               text PRIMARY KEY,
  correo_invitado  text NOT NULL,
  rol_inicial_id   text NOT NULL REFERENCES rol (id) ON DELETE CASCADE,
  -- Hash del token de un solo uso. El token original nunca se guarda.
  hash_token       text NOT NULL UNIQUE,
  estado           text NOT NULL DEFAULT 'pendiente',
  vence_en         timestamptz NOT NULL,
  creada_por       text NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  creada_en        timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aceptada_en      timestamptz,
  revocada_en      timestamptz,

  -- Correo siempre normalizado a minúsculas.
  CONSTRAINT invitacion_correo_normalizado_check CHECK (correo_invitado = lower(correo_invitado)),

  CONSTRAINT invitacion_estado_check CHECK (estado IN ('pendiente', 'aceptada', 'revocada', 'vencida')),

  -- Cada estado exige sus fechas de resolución.
  CONSTRAINT invitacion_resolucion_check CHECK (
    (estado IN ('pendiente', 'vencida') AND aceptada_en IS NULL AND revocada_en IS NULL)
    OR (estado = 'aceptada' AND aceptada_en IS NOT NULL AND revocada_en IS NULL)
    OR (estado = 'revocada' AND revocada_en IS NOT NULL AND aceptada_en IS NULL)
  )
);

-- Una sola invitación pendiente por correo.
-- El predicado depende solo del estado almacenado, no de la hora actual.
-- Una pendiente ya vencida se marca 'vencida' en la misma transacción antes de reenviar.
CREATE UNIQUE INDEX invitacion_pendiente_por_correo_unica
  ON invitacion (correo_invitado)
  WHERE estado = 'pendiente';
