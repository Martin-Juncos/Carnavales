-- Keep edition provenance even when a configuration resource no longer exists.
-- No foreign key: audit evidence must survive removal of its subject.
ALTER TABLE auditoria ADD COLUMN edicion_id uuid;
CREATE INDEX auditoria_edicion_idx ON auditoria (edicion_id) WHERE edicion_id IS NOT NULL;
