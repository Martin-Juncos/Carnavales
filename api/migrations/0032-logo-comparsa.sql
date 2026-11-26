-- Migración 0032: logo visual opcional de comparsa (solo PNG, JPEG o WebP en base64).
-- Es estrictamente visual (no altera puntajes ni cómputos) y viaja en la planilla del jurado
-- para funcionar sin conexión en la PWA. Se rechaza SVG para evitar XSS almacenado.

ALTER TABLE comparsa
  ADD COLUMN IF NOT EXISTS logo_data_url text NULL
  CHECK (
    logo_data_url IS NULL
    OR (
      length(logo_data_url) <= 400000
      AND logo_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
    )
  );
