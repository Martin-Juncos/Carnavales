// Filas de planilla: cada fila es sujeto × rubro × especialidad. Las nominaciones y los topes
// los controla la migración 0012; este módulo traduce esos errores y registra auditoría.
// Las filas se editan aunque la versión esté publicada, hasta la apertura de la primera noche (H11).

import {
  ErrorConfiguracion,
  exigirEdicion,
  normalizarBooleano,
  registrarAuditoria,
} from "./configuracion-edicion.js";

function traducirErrorPlanilla(error) {
  const mensaje = error.message ?? "";
  if (error.code === "23514") {
    if (mensaje.includes("PADRON_CONGELADO")) {
      return new ErrorConfiguracion("padron_congelado", "El padrón está congelado: hay una noche abierta.");
    }
    if (mensaje.includes("OBJETIVO_TIPO_INCOHERENTE")) {
      return new ErrorConfiguracion("sujeto_no_corresponde", "El sujeto no es del tipo que evalúa el rubro.");
    }
    if (mensaje.includes("NOMINADOS_COMPARSA_EXCEDIDOS")) {
      return new ErrorConfiguracion("nominados_comparsa_excedidos", "La comparsa ya alcanzó el máximo de nominados del rubro.");
    }
    if (mensaje.includes("NOMINADOS_EXCEDIDOS")) {
      return new ErrorConfiguracion("nominados_excedidos", "El rubro ya alcanzó su máximo de nominados.");
    }
  }
  if (error.code === "23505") {
    return new ErrorConfiguracion("fila_existente", "El sujeto ya está en ese rubro y especialidad.");
  }
  if (error.code === "23503") {
    return new ErrorConfiguracion("referencia_inexistente", "Alguna referencia no existe en la edición.");
  }
  return error;
}

async function transaccion(pool, operacion) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await operacion(client);
    await client.query("COMMIT");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw traducirErrorPlanilla(error);
  } finally {
    client.release();
  }
}

async function exigirVersion(client, edicionId, versionId) {
  const { rows } = await client.query(
    "SELECT id FROM version_reglamento WHERE id = $1 AND edicion_id = $2",
    [versionId, edicionId],
  );
  if (rows.length === 0) {
    throw new ErrorConfiguracion("version_inexistente", "La versión no existe en la edición.");
  }
}

// Las filas GENERADA solo cambian con la versión en borrador; una versión publicada no se edita.
async function exigirVersionBorrador(client, edicionId, versionId) {
  const { rows } = await client.query(
    "SELECT estado FROM version_reglamento WHERE id = $1 AND edicion_id = $2",
    [versionId, edicionId],
  );
  if (rows.length === 0) {
    throw new ErrorConfiguracion("version_inexistente", "La versión no existe en la edición.");
  }
  if (rows[0].estado !== "BORRADOR") {
    throw new ErrorConfiguracion("version_no_borrador", "La versión ya no está en borrador y no admite cambios.");
  }
}

async function exigirRubroDeVersion(client, { edicionId, versionId, rubroId }) {
  const { rows } = await client.query(
    "SELECT tipo_rubro FROM rubro_version WHERE id = $1 AND version_id = $2 AND edicion_id = $3",
    [rubroId, versionId, edicionId],
  );
  if (rows.length === 0) {
    throw new ErrorConfiguracion("rubro_inexistente", "El rubro no existe en la versión.");
  }
  return rows[0];
}

function filaAPlanilla(fila) {
  return {
    id: fila.id,
    rubroId: fila.rubro_version_id,
    rubroCodigo: fila.rubro_codigo,
    rubroNombre: fila.rubro_nombre,
    sujetoId: fila.sujeto_id,
    comparsaNombre: fila.comparsa_nombre,
    especialidadId: fila.especialidad_id,
    especialidadCodigo: fila.especialidad_codigo,
    origen: fila.origen,
    excluida: fila.excluida,
    evaluable: fila.evaluable,
    orden: fila.orden,
  };
}

// Las filas se leen con sus nombres para que la planilla sea legible.
const seleccionPlanilla = `o.id, o.rubro_version_id, rv.codigo AS rubro_codigo, rv.nombre AS rubro_nombre,
  o.sujeto_id, c.nombre AS comparsa_nombre, o.especialidad_id, e.codigo AS especialidad_codigo,
  o.origen, o.excluida, o.evaluable, o.orden`;

export async function listarPlanilla(pool, { edicionId, versionId }) {
  await exigirEdicion(pool, edicionId);
  const { rows: versiones } = await pool.query(
    "SELECT id FROM version_reglamento WHERE id = $1 AND edicion_id = $2",
    [versionId, edicionId],
  );
  if (versiones.length === 0) {
    throw new ErrorConfiguracion("version_inexistente", "La versión no existe en la edición.");
  }
  const { rows } = await pool.query(
    `SELECT ${seleccionPlanilla}
       FROM objetivo_rubro o
       JOIN rubro_version rv ON rv.id = o.rubro_version_id
       JOIN sujeto_evaluable s ON s.id = o.sujeto_id
       JOIN comparsa c ON c.id = s.comparsa_id
       JOIN especialidad e ON e.id = o.especialidad_id
      WHERE rv.version_id = $1 AND o.edicion_id = $2
      ORDER BY rv.orden, e.orden, o.orden`,
    [versionId, edicionId],
  );
  return { items: rows.map(filaAPlanilla) };
}

// Crea las filas GENERADA de los rubros nominativos: rubro × sujeto activo del tipo × especialidad.
// Lo que ya existe (generado, manual, excluido o gris) no se toca.
export async function generarPlanilla(pool, { edicionId, versionId, actorId }) {
  return transaccion(pool, async (client) => {
    await exigirVersionBorrador(client, edicionId, versionId);
    const resultado = await client.query(
      `INSERT INTO objetivo_rubro (edicion_id, rubro_version_id, sujeto_id, especialidad_id, origen, orden)
       SELECT rv.edicion_id, rv.id, s.id, re.especialidad_id, 'GENERADA',
              COALESCE((SELECT max(o.orden) FROM objetivo_rubro o
                         WHERE o.rubro_version_id = rv.id AND o.especialidad_id = re.especialidad_id), 0)
              + row_number() OVER (PARTITION BY rv.id, re.especialidad_id ORDER BY c.nombre, s.tipo_sujeto, s.id)
         FROM rubro_version rv
         JOIN rubro_especialidad re ON re.rubro_version_id = rv.id
         JOIN sujeto_evaluable s ON s.edicion_id = rv.edicion_id AND s.tipo_sujeto = rv.tipo_sujeto AND s.activo
         JOIN comparsa c ON c.id = s.comparsa_id AND c.activa
        WHERE rv.version_id = $1 AND rv.edicion_id = $2 AND rv.tipo_rubro = 'NOMINATIVO'
          AND NOT EXISTS (
            SELECT 1 FROM objetivo_rubro o
             WHERE o.rubro_version_id = rv.id AND o.sujeto_id = s.id AND o.especialidad_id = re.especialidad_id
          )
       ON CONFLICT (rubro_version_id, sujeto_id, especialidad_id) DO NOTHING`,
      [versionId, edicionId],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "planilla_generada",
      entidadTipo: "version_reglamento",
      entidadId: versionId,
    });
    return { insertadas: resultado.rowCount };
  });
}

// Nomina a mano un sujeto en un rubro aleatorio, en una especialidad del rubro.
export async function nominarSujeto(pool, { edicionId, versionId, rubroId, actorId, datos }) {
  const sujetoId = typeof datos?.sujetoId === "string" ? datos.sujetoId.trim() : "";
  const especialidadId = typeof datos?.especialidadId === "string" ? datos.especialidadId.trim() : "";
  if (sujetoId === "" || especialidadId === "") {
    throw new ErrorConfiguracion("nominacion_invalida", "La nominación necesita un sujeto y una especialidad.");
  }

  return transaccion(pool, async (client) => {
    await exigirVersion(client, edicionId, versionId);
    const rubro = await exigirRubroDeVersion(client, { edicionId, versionId, rubroId });
    if (rubro.tipo_rubro !== "ALEATORIO") {
      throw new ErrorConfiguracion("rubro_no_aleatorio", "Solo se nominan sujetos en rubros aleatorios.");
    }
    const { rows: [fila] } = await client.query(
      `INSERT INTO objetivo_rubro (edicion_id, rubro_version_id, sujeto_id, especialidad_id, origen, orden)
       VALUES ($1, $2, $3, $4, 'MANUAL',
               COALESCE((SELECT max(orden) FROM objetivo_rubro
                          WHERE rubro_version_id = $2 AND especialidad_id = $4), 0) + 1)
       RETURNING id`,
      [edicionId, rubroId, sujetoId, especialidadId],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "nominacion_creada",
      entidadTipo: "objetivo_rubro",
      entidadId: fila.id,
    });
    const { rows: [creada] } = await client.query(
      `SELECT ${seleccionPlanilla} FROM objetivo_rubro o
         JOIN rubro_version rv ON rv.id = o.rubro_version_id
         JOIN sujeto_evaluable s ON s.id = o.sujeto_id
         JOIN comparsa c ON c.id = s.comparsa_id
         JOIN especialidad e ON e.id = o.especialidad_id
        WHERE o.id = $1`,
      [fila.id],
    );
    return filaAPlanilla(creada);
  });
}

// Excluye o marca gris una fila. Nunca se borra una fila generada: se excluye.
export async function actualizarFilaPlanilla(pool, { edicionId, versionId, filaId, actorId, datos }) {
  const cambios = {};
  if (datos?.excluida !== undefined) cambios.excluida = normalizarBooleano(datos.excluida, "excluida_invalida");
  if (datos?.evaluable !== undefined) cambios.evaluable = normalizarBooleano(datos.evaluable, "evaluable_invalido");
  if (Object.keys(cambios).length === 0) {
    throw new ErrorConfiguracion("sin_cambios", "No se recibió ningún campo para actualizar.");
  }

  return transaccion(pool, async (client) => {
    await exigirVersion(client, edicionId, versionId);
    const { rows: [fila] } = await client.query(
      `SELECT o.origen, v.estado FROM objetivo_rubro o
         JOIN rubro_version rv ON rv.id = o.rubro_version_id
         JOIN version_reglamento v ON v.id = rv.version_id
        WHERE o.id = $1 AND o.edicion_id = $2 AND v.id = $3`,
      [filaId, edicionId, versionId],
    );
    if (!fila) {
      throw new ErrorConfiguracion("fila_inexistente", "La fila de planilla no existe en la versión.");
    }
    // H11: con la versión publicada solo cambian las nominaciones manuales, no las filas generadas.
    if (fila.origen === "GENERADA" && fila.estado !== "BORRADOR") {
      throw new ErrorConfiguracion("version_no_borrador", "La versión ya no está en borrador y no admite cambios.");
    }
    const columnas = Object.keys(cambios);
    const asignaciones = columnas.map((columna, indice) => `${columna} = $${indice + 1}`);
    const valores = columnas.map((columna) => cambios[columna]);
    const { rowCount } = await client.query(
      `UPDATE objetivo_rubro o SET ${asignaciones.join(", ")}
         FROM rubro_version rv
        WHERE o.id = $${columnas.length + 1} AND o.edicion_id = $${columnas.length + 2}
          AND rv.id = o.rubro_version_id AND rv.version_id = $${columnas.length + 3}`,
      [...valores, filaId, edicionId, versionId],
    );
    if (rowCount === 0) {
      throw new ErrorConfiguracion("fila_inexistente", "La fila de planilla no existe en la versión.");
    }
    await registrarAuditoria(client, {
      actorId,
      operacion: "fila_planilla_actualizada",
      entidadTipo: "objetivo_rubro",
      entidadId: filaId,
    });
    const { rows: [actualizada] } = await client.query(
      `SELECT ${seleccionPlanilla} FROM objetivo_rubro o
         JOIN rubro_version rv ON rv.id = o.rubro_version_id
         JOIN sujeto_evaluable s ON s.id = o.sujeto_id
         JOIN comparsa c ON c.id = s.comparsa_id
         JOIN especialidad e ON e.id = o.especialidad_id
        WHERE o.id = $1`,
      [filaId],
    );
    return filaAPlanilla(actualizada);
  });
}

// Borra una nominación manual. Las filas generadas no se borran: se excluyen.
export async function eliminarNominacion(pool, { edicionId, versionId, filaId, actorId }) {
  await transaccion(pool, async (client) => {
    await exigirVersion(client, edicionId, versionId);
    const { rows } = await client.query(
      `SELECT o.origen FROM objetivo_rubro o
         JOIN rubro_version rv ON rv.id = o.rubro_version_id
        WHERE o.id = $1 AND o.edicion_id = $2 AND rv.version_id = $3`,
      [filaId, edicionId, versionId],
    );
    if (rows.length === 0) {
      throw new ErrorConfiguracion("fila_inexistente", "La fila de planilla no existe en la versión.");
    }
    if (rows[0].origen !== "MANUAL") {
      throw new ErrorConfiguracion("solo_manual_se_borra", "Una fila generada se excluye, no se borra.");
    }
    await client.query("DELETE FROM objetivo_rubro WHERE id = $1", [filaId]);
    await registrarAuditoria(client, {
      actorId,
      operacion: "nominacion_eliminada",
      entidadTipo: "objetivo_rubro",
      entidadId: filaId,
    });
  });
}
