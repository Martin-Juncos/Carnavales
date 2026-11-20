-- Check for history after excluding concurrent writers, in the migrator's transaction.
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL row_security = off;
LOCK TABLE enmienda_reglamento IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  target oid := 'enmienda_reglamento'::regclass;
BEGIN
  IF EXISTS (SELECT FROM enmienda_reglamento) THEN
    RAISE EXCEPTION 'ENMIENDA_REGLAMENTO_CON_HISTORIAL' USING ERRCODE = 'check_violation';
  END IF;

  -- RESTRICT still drops automatic/internal dependents (for example, an
  -- owned sequence). Allow only the components created by our migrations.
  IF EXISTS (
    SELECT FROM pg_depend d
    WHERE d.refclassid = 'pg_class'::regclass AND d.refobjid = target
      AND d.deptype IN ('a', 'i', 'P', 'S')
      AND NOT (
        (d.classid = 'pg_type'::regclass AND d.objid = (
          SELECT reltype FROM pg_class WHERE oid = target
        ))
        OR (d.classid = 'pg_class'::regclass AND d.objid IN (
          SELECT reltoastrelid FROM pg_class WHERE oid = target
          UNION ALL
          SELECT indexrelid FROM pg_index JOIN pg_class ON oid = indexrelid
          WHERE indrelid = target AND relname = 'enmienda_reglamento_edicion_id_idx'
        ))
        OR (d.classid = 'pg_constraint'::regclass AND d.objid IN (
          SELECT oid FROM pg_constraint WHERE conrelid = target AND conname IN (
            'enmienda_reglamento_pkey', 'enmienda_reglamento_edicion_id_fkey',
            'enmienda_reglamento_version_id_edicion_id_fkey', 'enmienda_reglamento_responsable_id_fkey',
            'enmienda_reglamento_id_not_null', 'enmienda_reglamento_edicion_id_not_null',
            'enmienda_reglamento_version_id_not_null', 'enmienda_reglamento_contenido_not_null',
            'enmienda_reglamento_motivo_not_null', 'enmienda_reglamento_responsable_id_not_null',
            'enmienda_reglamento_creada_en_not_null'
          )
        ))
        OR (d.classid = 'pg_attrdef'::regclass AND d.objid IN (
          SELECT a.oid FROM pg_attrdef a JOIN pg_attribute c
            ON (c.attrelid, c.attnum) = (a.adrelid, a.adnum)
          WHERE a.adrelid = target AND c.attname IN ('id', 'creada_en')
        ))
        OR (d.classid = 'pg_trigger'::regclass AND d.objid IN (
          SELECT oid FROM pg_trigger WHERE tgrelid = target AND tgname IN (
            'a_edicion_operativa_trg', 'enmienda_reglamento_solo_registro_trg',
            'enmienda_reglamento_impedir_truncate_trg'
          )
        ))
      )
  ) THEN
    RAISE EXCEPTION 'ENMIENDA_REGLAMENTO_CON_DEPENDENCIAS' USING ERRCODE = 'dependent_objects_still_exist';
  END IF;
END;
$$;

-- RESTRICT leaves dependent objects intact and rolls back the migration on refusal.
DROP TABLE enmienda_reglamento RESTRICT;
DROP FUNCTION enmienda_reglamento_solo_registro() RESTRICT;
