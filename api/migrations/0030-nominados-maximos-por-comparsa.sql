-- Permite configurar rubros ALEATORIO solo con tope por comparsa
-- (nominados_maximos_por_comparsa) sin exigir un tope global de edición.
-- También corrige rubros ALEATORIO en BORRADOR creados por la UI anterior que
-- guardaban el valor en nominados_maximos en lugar de nominados_maximos_por_comparsa.

ALTER TABLE rubro_version
  DROP CONSTRAINT rubro_version_check,
  ADD CONSTRAINT rubro_version_check
    CHECK (
      tipo_rubro IS DISTINCT FROM 'ALEATORIO'
      OR nominados_maximos IS NOT NULL
      OR nominados_maximos_por_comparsa IS NOT NULL
    );

UPDATE rubro_version rv
   SET nominados_maximos_por_comparsa = rv.nominados_maximos,
       nominados_maximos = NULL
  FROM version_reglamento vr
 WHERE vr.id = rv.version_id
   AND vr.estado = 'BORRADOR'
   AND rv.tipo_rubro = 'ALEATORIO'
   AND rv.nominados_maximos IS NOT NULL
   AND rv.nominados_maximos_por_comparsa IS NULL;
