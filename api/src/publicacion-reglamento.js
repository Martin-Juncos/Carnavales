// Validación previa, vista de solo lectura y publicación atómica de una versión.
// No se validan reglas de cálculo por algoritmo: el resultado general ya quedó fijado en D24,
// pero el catálogo parametrizable de algoritmos sigue fuera de este alcance.

import { ErrorConfiguracion, registrarAuditoria } from "./configuracion-edicion.js";

async function exigirVersion(pool, edicionId, versionId) {
  const { rows: [version] } = await pool.query(
    "SELECT id, estado FROM version_reglamento WHERE id = $1 AND edicion_id = $2",
    [versionId, edicionId],
  );
  if (!version) {
    throw new ErrorConfiguracion("version_inexistente", "La versión no existe en la edición.");
  }
  return version;
}

// Los hallazgos se obtienen de consultas independientes y se devuelven sin datos sensibles.
export async function obtenerChecklistPublicacion(pool, { edicionId, versionId }) {
  const version = await exigirVersion(pool, edicionId, versionId);
  const bloqueantes = [];
  const advertencias = [];

  const { rows: escalas } = await pool.query(
    "SELECT 1 FROM escala_puntaje_version WHERE version_id = $1 AND edicion_id = $2",
    [versionId, edicionId],
  );
  if (escalas.length === 0) {
    bloqueantes.push({
      codigo: "escala_inexistente",
      mensaje: "La versión necesita configurar su escala de puntaje.",
      enlace: `/ediciones/${edicionId}/versiones/${versionId}/escala`,
    });
  }

  const { rows: rubrosSinEspecialidad } = await pool.query(
    `SELECT rv.id, rv.codigo, rv.nombre
       FROM rubro_version rv
      WHERE rv.version_id = $1 AND rv.edicion_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM rubro_especialidad re WHERE re.rubro_version_id = rv.id
        )
      ORDER BY rv.orden`,
    [versionId, edicionId],
  );
  for (const rubro of rubrosSinEspecialidad) {
    bloqueantes.push({
      codigo: "rubro_sin_especialidad",
      elementoId: rubro.id,
      mensaje: `El rubro «${rubro.nombre}» no tiene especialidades asignadas.`,
      enlace: `/ediciones/${edicionId}/versiones/${versionId}/rubros/${rubro.id}`,
    });
  }

  // No se publica un nominativo con combinaciones activas que todavía no tengan fila.
  const { rows: filasFaltantes } = await pool.query(
    `SELECT rv.id AS rubro_id, rv.nombre AS rubro_nombre, s.id AS sujeto_id,
            s.nombre AS sujeto_nombre, c.nombre AS comparsa_nombre, re.especialidad_id
       FROM rubro_version rv
       JOIN rubro_especialidad re ON re.rubro_version_id = rv.id
       JOIN sujeto_evaluable s
         ON s.edicion_id = rv.edicion_id AND s.tipo_sujeto = rv.tipo_sujeto AND s.activo
       JOIN comparsa c ON c.id = s.comparsa_id AND c.activa
       LEFT JOIN objetivo_rubro o
         ON o.rubro_version_id = rv.id AND o.sujeto_id = s.id
        AND o.especialidad_id = re.especialidad_id
      WHERE rv.version_id = $1 AND rv.edicion_id = $2 AND rv.tipo_rubro = 'NOMINATIVO'
        AND o.id IS NULL
      ORDER BY rv.orden, c.nombre, s.nombre`,
    [versionId, edicionId],
  );
  for (const fila of filasFaltantes) {
    bloqueantes.push({
      codigo: "fila_nominativa_faltante",
      elementoId: fila.rubro_id,
      mensaje: `Falta generar «${fila.rubro_nombre}» para ${fila.sujeto_nombre ?? "sujeto"} de ${fila.comparsa_nombre}.`,
      enlace: `/ediciones/${edicionId}/versiones/${versionId}/planilla`,
    });
  }

  const { rows: nochesSinOrden } = await pool.query(
    `SELECT n.id, n.nombre
       FROM noche n
      WHERE n.edicion_id = $1
        AND n.tipo = 'COMPETENCIA'
        AND NOT EXISTS (
          SELECT 1 FROM orden_presentacion op
           WHERE op.noche_id = n.id AND op.estado = 'SCHEDULED'
        )
      ORDER BY n.orden`,
    [edicionId],
  );
  for (const noche of nochesSinOrden) {
    bloqueantes.push({
      codigo: "noche_sin_orden",
      elementoId: noche.id,
      mensaje: `La noche de competencia «${noche.nombre}» no tiene orden de presentación.`,
      enlace: `/ediciones/${edicionId}/noches/${noche.id}/orden`,
    });
  }

  const { rows: especialidadesVacias } = await pool.query(
    `SELECT e.id, e.nombre
       FROM especialidad e
      WHERE e.edicion_id = $1 AND e.activa
        AND NOT EXISTS (
          SELECT 1 FROM rubro_especialidad re
          JOIN rubro_version rv ON rv.id = re.rubro_version_id
          WHERE re.especialidad_id = e.id AND rv.version_id = $2
        )
      ORDER BY e.orden`,
    [edicionId, versionId],
  );
  for (const especialidad of especialidadesVacias) {
    advertencias.push({
      codigo: "especialidad_sin_rubros",
      elementoId: especialidad.id,
      mensaje: `La especialidad «${especialidad.nombre}» no tiene rubros asignados.`,
      enlace: `/ediciones/${edicionId}/versiones/${versionId}/rubros`,
    });
  }

  const { rows: comparsasSinNoche } = await pool.query(
    `SELECT c.id, c.nombre
       FROM comparsa c
      WHERE c.edicion_id = $1 AND c.activa
        AND NOT EXISTS (
          SELECT 1 FROM orden_presentacion op
          JOIN noche n ON n.id = op.noche_id
          WHERE op.comparsa_id = c.id AND op.estado = 'SCHEDULED' AND n.tipo = 'COMPETENCIA'
        )
      ORDER BY c.nombre`,
    [edicionId],
  );
  for (const comparsa of comparsasSinNoche) {
    advertencias.push({
      codigo: "comparsa_sin_noche",
      elementoId: comparsa.id,
      mensaje: `La comparsa activa «${comparsa.nombre}» no tiene una noche de competencia asignada.`,
      enlace: `/ediciones/${edicionId}/comparsas/${comparsa.id}`,
    });
  }

  const { rows: [resumen] } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM rubro_version WHERE version_id = $1 AND edicion_id = $2) AS rubros,
       (SELECT count(*)::int FROM comparsa WHERE edicion_id = $2 AND activa) AS comparsas,
       (SELECT count(*)::int FROM objetivo_rubro o
          JOIN rubro_version rv ON rv.id = o.rubro_version_id
         WHERE rv.version_id = $1 AND o.edicion_id = $2 AND NOT o.excluida) AS filas_planilla`,
    [versionId, edicionId],
  );
  const { rows: filasPorEspecialidad } = await pool.query(
    `SELECT e.id, e.codigo, e.nombre, count(rv.id)::int AS filas
       FROM especialidad e
       LEFT JOIN objetivo_rubro o ON o.especialidad_id = e.id AND NOT o.excluida
       LEFT JOIN rubro_version rv ON rv.id = o.rubro_version_id AND rv.version_id = $2
      WHERE e.edicion_id = $1 AND e.activa
      GROUP BY e.id, e.codigo, e.nombre, e.orden
      ORDER BY e.orden`,
    [edicionId, versionId],
  );

  return {
    version: { id: version.id, estado: version.estado },
    publicable: bloqueantes.length === 0 && version.estado === "BORRADOR",
    bloqueantes,
    advertencias,
    resumen: {
      rubros: resumen.rubros,
      comparsas: resumen.comparsas,
      filasPlanilla: resumen.filas_planilla,
      filasPorEspecialidad: filasPorEspecialidad.map((fila) => ({
        especialidadId: fila.id,
        codigo: fila.codigo,
        nombre: fila.nombre,
        filas: fila.filas,
      })),
    },
  };
}

// Vista de planilla sin campos de puntaje ni datos de votos.
export async function obtenerVistaPrevia(pool, { edicionId, versionId }) {
  await exigirVersion(pool, edicionId, versionId);
  const { rows } = await pool.query(
    `SELECT e.id AS especialidad_id, e.codigo AS especialidad_codigo, e.nombre AS especialidad_nombre,
            c.id AS comparsa_id, c.nombre AS comparsa_nombre,
            o.id AS fila_id, o.sujeto_id, s.nombre AS sujeto_nombre, s.tipo_sujeto,
            rv.codigo AS rubro_codigo, rv.nombre AS rubro_nombre, o.evaluable, o.orden
       FROM objetivo_rubro o
       JOIN rubro_version rv ON rv.id = o.rubro_version_id
       JOIN sujeto_evaluable s ON s.id = o.sujeto_id
       JOIN comparsa c ON c.id = s.comparsa_id
       JOIN especialidad e ON e.id = o.especialidad_id
      WHERE rv.version_id = $1 AND o.edicion_id = $2 AND NOT o.excluida
      ORDER BY e.orden, c.nombre, rv.orden, o.orden`,
    [versionId, edicionId],
  );

  const grupos = new Map();
  for (const fila of rows) {
    const clave = `${fila.especialidad_id}:${fila.comparsa_id}`;
    if (!grupos.has(clave)) {
      grupos.set(clave, {
        especialidad: {
          id: fila.especialidad_id,
          codigo: fila.especialidad_codigo,
          nombre: fila.especialidad_nombre,
        },
        comparsa: { id: fila.comparsa_id, nombre: fila.comparsa_nombre },
        filas: [],
      });
    }
    grupos.get(clave).filas.push({
      id: fila.fila_id,
      sujeto: fila.sujeto_nombre ?? fila.tipo_sujeto,
      rubro: fila.rubro_nombre,
      evaluable: fila.evaluable,
      orden: fila.orden,
    });
  }
  return { grupos: [...grupos.values()] };
}

// La edición serializa publicaciones concurrentes. La versión anterior se supersede
// antes de publicar la nueva para respetar el índice de una versión activa por edición.
export async function publicarVersion(pool, { edicionId, versionId, actorId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [edicion] } = await client.query(
      "SELECT id FROM edicion WHERE id = $1 FOR UPDATE",
      [edicionId],
    );
    if (!edicion) {
      throw new ErrorConfiguracion("edicion_inexistente", "La edición no existe.");
    }
    const { rows: [version] } = await client.query(
      "SELECT id, estado FROM version_reglamento WHERE id = $1 AND edicion_id = $2 FOR UPDATE",
      [versionId, edicionId],
    );
    if (!version) {
      throw new ErrorConfiguracion("version_inexistente", "La versión no existe en la edición.");
    }
    if (version.estado !== "BORRADOR") {
      throw new ErrorConfiguracion("version_no_borrador", "Solo se puede publicar una versión en borrador.");
    }

    // Evalúa bloqueos usando la misma conexión y transacción de publicación.
    const checklist = await obtenerChecklistPublicacion(client, { edicionId, versionId });
    if (checklist.bloqueantes.length > 0) {
      throw new ErrorConfiguracion(
        "publicacion_con_bloqueantes",
        "La versión tiene errores bloqueantes y no se puede publicar.",
      );
    }

    await client.query(
      `UPDATE version_reglamento
          SET estado = 'SUPERSEDIDA'
        WHERE edicion_id = $1 AND estado = 'PUBLICADA'`,
      [edicionId],
    );
    const { rows: [publicada] } = await client.query(
      `UPDATE version_reglamento
          SET estado = 'PUBLICADA', publicada_por = $1, publicada_en = CURRENT_TIMESTAMP
        WHERE id = $2 AND edicion_id = $3
        RETURNING id, estado, publicada_en`,
      [actorId, versionId, edicionId],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "version_reglamento_publicada",
      entidadTipo: "version_reglamento",
      entidadId: versionId,
    });
    await client.query("COMMIT");
    return {
      id: publicada.id,
      estado: publicada.estado,
      publicadaEn: publicada.publicada_en.toISOString(),
      resumen: checklist.resumen,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
