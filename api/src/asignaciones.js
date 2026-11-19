// Consultas administrativas sobre asignaciones de jurado. No exponen puntajes ni
// secretos: solo la relación jurado/noche/especialidad y los estados necesarios
// para detectar coberturas faltantes antes de abrir una noche.

// Lista todas las asignaciones, activas y revocadas, ordenadas por edición, noche,
// especialidad y jurado. Incluir las revocadas conserva la trazabilidad de la cobertura.
export async function listarAsignaciones(pool) {
  const { rows } = await pool.query(
    `SELECT a.id, a.estado, a.creada_en,
            u.id AS jurado_id, u.nombre AS jurado_nombre,
            EXISTS (
              SELECT 1 FROM usuario_rol ur
              JOIN rol r ON r.id = ur.rol_id
             WHERE ur.usuario_id = u.id AND r.codigo = 'JURADO'
            ) AS jurado_activo,
            n.id AS noche_id, n.nombre AS noche_nombre, n.orden AS noche_orden,
            n.estado AS noche_estado,
            e.id AS especialidad_id, e.nombre AS especialidad_nombre,
            e.codigo AS especialidad_codigo, e.activa AS especialidad_activa
       FROM asignacion_jurado a
       JOIN edicion ed ON ed.id = a.edicion_id
       JOIN usuario u ON u.id = a.jurado_id
       JOIN noche n ON n.id = a.noche_id AND n.edicion_id = a.edicion_id
       JOIN especialidad e ON e.id = a.especialidad_id AND e.edicion_id = a.edicion_id
      ORDER BY ed.anio DESC, n.orden, e.orden, u.nombre, a.id`,
  );
  return {
    items: rows.map((fila) => ({
      id: fila.id,
      estado: fila.estado,
      creadaEn: fila.creada_en.toISOString(),
      jurado: { id: fila.jurado_id, nombre: fila.jurado_nombre, activo: fila.jurado_activo },
      noche: {
        id: fila.noche_id,
        nombre: fila.noche_nombre,
        orden: fila.noche_orden,
        estado: fila.noche_estado,
      },
      especialidad: {
        id: fila.especialidad_id,
        nombre: fila.especialidad_nombre,
        codigo: fila.especialidad_codigo,
        activa: fila.especialidad_activa,
      },
    })),
  };
}

// Usuarios con rol JURADO disponibles para asignar. No devuelve hashes ni secretos.
export async function listarJurados(pool) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.correo
       FROM usuario u
       JOIN usuario_rol ur ON ur.usuario_id = u.id
       JOIN rol r ON r.id = ur.rol_id AND r.codigo = 'JURADO'
      ORDER BY u.nombre, u.id`,
  );
  return { items: rows.map((fila) => ({ id: fila.id, nombre: fila.nombre, correo: fila.correo })) };
}
