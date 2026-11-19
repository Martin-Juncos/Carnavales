// Lectura de contextos y planillas esperadas del Jurado. Solo expone la
// estructura que debe puntuar: nunca puntajes, ni siquiera después de recibida
// una planilla (D15). La identidad del jurado sale de la sesión, no del cliente.

import { ErrorAsignacion, uuidRequerido } from "./asignaciones.js";

// Asignaciones activas del jurado. Una revocada no habilita ningún contexto.
export async function listarContextosJurado(pool, { juradoId }) {
  const { rows } = await pool.query(
    `SELECT a.id AS asignacion_id,
            n.id AS noche_id, n.nombre AS noche_nombre, n.orden AS noche_orden,
            n.estado AS noche_estado,
            ed.id AS edicion_id, ed.nombre AS edicion_nombre, ed.anio AS edicion_anio,
            e.id AS especialidad_id, e.nombre AS especialidad_nombre, e.codigo AS especialidad_codigo
       FROM asignacion_jurado a
       JOIN noche n ON n.id = a.noche_id AND n.edicion_id = a.edicion_id
       JOIN edicion ed ON ed.id = a.edicion_id
       JOIN especialidad e ON e.id = a.especialidad_id AND e.edicion_id = a.edicion_id
      WHERE a.jurado_id = $1 AND a.estado = 'ACTIVA' AND n.tipo = 'COMPETENCIA'
      ORDER BY ed.anio DESC, n.orden, e.orden, a.id`,
    [juradoId],
  );
  return {
    items: rows.map((fila) => ({
      asignacionId: fila.asignacion_id,
      noche: {
        id: fila.noche_id,
        nombre: fila.noche_nombre,
        orden: fila.noche_orden,
        estado: fila.noche_estado,
        edicion: { id: fila.edicion_id, nombre: fila.edicion_nombre, anio: fila.edicion_anio },
      },
      especialidad: {
        id: fila.especialidad_id,
        nombre: fila.especialidad_nombre,
        codigo: fila.especialidad_codigo,
      },
    })),
  };
}

async function asignacionVisible(pool, { asignacionId, juradoId }) {
  const id = uuidRequerido(asignacionId, "La asignación debe ser un identificador válido.");
  const { rows } = await pool.query(
    `SELECT a.id, a.edicion_id, a.noche_id,
            n.nombre AS noche_nombre, n.orden AS noche_orden, n.estado AS noche_estado,
            e.id AS especialidad_id, e.nombre AS especialidad_nombre, e.codigo AS especialidad_codigo
       FROM asignacion_jurado a
       JOIN noche n ON n.id = a.noche_id AND n.edicion_id = a.edicion_id
       JOIN especialidad e ON e.id = a.especialidad_id AND e.edicion_id = a.edicion_id
      WHERE a.id = $1 AND a.jurado_id = $2 AND a.estado = 'ACTIVA'
        AND n.tipo = 'COMPETENCIA'
      FOR SHARE OF a`,
    [id, juradoId],
  );
  const fila = rows[0];
  // El mismo 404 para una asignación ajena, revocada o inexistente evita
  // revelar la existencia de contextos que el jurado no puede consultar.
  if (!fila) {
    throw new ErrorAsignacion(
      "asignacion_no_encontrada",
      "La asignación no existe o no está activa para este jurado.",
    );
  }
  return fila;
}

export async function obtenerPlanillaJurado(pool, { asignacionId, juradoId }) {
  // La comprobación de la asignación y la lectura de filas van en la misma
  // transacción. FOR SHARE bloquea cualquier revocación concurrente: no se
  // puede entregar la planilla de una asignación que deja de estar activa.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const asignacion = await asignacionVisible(client, { asignacionId, juradoId });
    const { rows: versiones } = await client.query(
      asignacion.noche_estado === "DRAFT"
        ? `SELECT id FROM version_reglamento WHERE edicion_id = $1
             AND estado IN ('BORRADOR', 'PUBLICADA', 'CONGELADA') ORDER BY numero DESC LIMIT 1`
        : "SELECT version_id AS id, filas_configuradas FROM instantanea_planillas_esperadas WHERE noche_id = $1",
      [asignacion.noche_estado === "DRAFT" ? asignacion.edicion_id : asignacion.noche_id],
    );
    const versionId = versiones[0]?.id;
    const configurada = versiones[0]?.filas_configuradas === true;
    const filas = versionId
      ? await client.query(
          `SELECT f.id, ${configurada ? "seleccion.orden" : "f.orden"}, f.origen,
                  r.id AS rubro_id, r.codigo AS rubro_codigo, r.nombre AS rubro_nombre,
                  r.tipo_rubro, r.padre_id, r.evaluable,
                  s.id AS sujeto_id, s.tipo_sujeto, s.nombre AS sujeto_nombre,
                  p.nombre_completo AS participante_nombre,
                  c.id AS comparsa_id, c.nombre AS comparsa_nombre
             FROM fila_planilla f
             JOIN rubro_version r ON r.id = f.rubro_version_id
             JOIN sujeto_evaluable s ON s.id = f.sujeto_id
             LEFT JOIN participante p ON p.id = s.participante_id
             JOIN comparsa c ON c.id = s.comparsa_id
             ${configurada ? `JOIN configuracion_planilla_noche_fila seleccion
               ON seleccion.fila_id = f.id AND seleccion.noche_id = $4 AND seleccion.version_id = $2
              AND seleccion.especialidad_id = $3` : ""}
            WHERE f.edicion_id = $1 AND r.version_id = $2 AND f.especialidad_id = $3
              AND NOT f.excluida
            ORDER BY ${configurada ? "seleccion.orden" : "f.orden"}, f.id`,
          [asignacion.edicion_id, versionId, asignacion.especialidad_id, ...(configurada ? [asignacion.noche_id] : [])],
        )
      : { rows: [] };
    await client.query("COMMIT");

    return {
      asignacionId: asignacion.id,
      noche: {
        id: asignacion.noche_id,
        nombre: asignacion.noche_nombre,
        orden: asignacion.noche_orden,
        estado: asignacion.noche_estado,
      },
      especialidad: {
        id: asignacion.especialidad_id,
        nombre: asignacion.especialidad_nombre,
        codigo: asignacion.especialidad_codigo,
      },
      filas: filas.rows.map((fila) => ({
        id: fila.id,
        orden: fila.orden,
        origen: fila.origen,
        evaluable: fila.evaluable,
        rubro: {
          id: fila.rubro_id,
          codigo: fila.rubro_codigo,
          nombre: fila.rubro_nombre,
          tipo: fila.tipo_rubro,
          padreId: fila.padre_id,
        },
        sujeto: {
          id: fila.sujeto_id,
          tipo: fila.tipo_sujeto,
          nombre: fila.sujeto_nombre ?? fila.participante_nombre,
          comparsa: { id: fila.comparsa_id, nombre: fila.comparsa_nombre },
        },
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
