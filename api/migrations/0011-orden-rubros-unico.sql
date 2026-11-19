-- Migración 0011: el orden de los rubros es único dentro de cada versión.
-- Diferible para permitir reordenar dentro de una transacción (SET CONSTRAINTS ... DEFERRED),
-- igual que el orden de presentación en 0008. Sigue sujeta al trigger de solo borrador (0010).

ALTER TABLE rubro_version
  ADD CONSTRAINT rubro_version_orden_uk UNIQUE (version_id, orden) DEFERRABLE INITIALLY IMMEDIATE;
