-- Readiness is shared with the future closure transition. Only official
-- receipts satisfy requirements; a saved local or server draft never does.
CREATE FUNCTION motivo_bloqueo_cierre_noche(noche_objetivo uuid, estado_noche text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN estado_noche = 'CLOSED' THEN 'noche_cerrada'
    WHEN estado_noche <> 'OPEN' THEN 'noche_no_abierta'
    WHEN i.id IS NULL THEN 'instantanea_no_disponible'
    WHEN NOT EXISTS (
      SELECT 1 FROM instantanea_planilla_esperada_detalle d WHERE d.instantanea_id = i.id
    ) THEN 'sin_planillas_esperadas'
    WHEN EXISTS (
      SELECT 1
      FROM instantanea_planilla_esperada_detalle d
      LEFT JOIN suplentes_asignacion_jurado s ON s.detalle_esperado_id = d.id
      LEFT JOIN planilla_recibida p
        ON p.asignacion_id = COALESCE(s.asignacion_activa_id, d.asignacion_id)
        AND p.version_id = i.version_id
      WHERE d.instantanea_id = i.id AND p.id IS NULL
    ) THEN 'planillas_pendientes'
    ELSE NULL
  END
  FROM (SELECT noche_objetivo AS id) n
  LEFT JOIN instantanea_planillas_esperadas i ON i.noche_id = n.id;
$$;
