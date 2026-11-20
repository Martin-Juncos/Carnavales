import { ErrorConfiguracion, registrarAuditoria } from "./configuracion-edicion.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const filasCandidatas = `
  SELECT f.id, f.rubro_version_id, op.orden_presentacion, r.orden AS orden_rubro, f.orden
    FROM fila_planilla f
    JOIN rubro_version r ON r.id = f.rubro_version_id
    JOIN sujeto_evaluable s ON s.id = f.sujeto_id
    JOIN comparsa c ON c.id = s.comparsa_id AND c.activa
    JOIN orden_presentacion op ON op.comparsa_id = c.id AND op.edicion_id = f.edicion_id
   WHERE f.edicion_id = $1 AND r.version_id = $2 AND op.noche_id = $3
     AND f.especialidad_id = $4 AND op.estado = 'SCHEDULED' AND s.activo AND NOT f.excluida`;

async function conContexto(pool, { edicionId, versionId, nocheId, especialidadId }, escribir, operacion) {
  const client = await pool.connect();
  const claves = [edicionId, versionId, nocheId, especialidadId];
  try {
    await client.query("BEGIN");
    const { rows: [noche] } = await client.query(
      `SELECT estado FROM noche WHERE edicion_id = $1 AND id = $2 AND tipo = 'COMPETENCIA'
        ${escribir ? "FOR UPDATE" : "FOR SHARE"}`, [edicionId, nocheId],
    );
    if (!noche) throw new ErrorConfiguracion("noche_inexistente", "La noche competitiva no existe en la edición.");
    if (escribir && noche.estado !== "DRAFT") {
      throw new ErrorConfiguracion("noche_no_editable", "Solo se configura una noche en borrador.");
    }
    for (const [tabla, id, codigo] of [
      ["version_reglamento", versionId, "version_inexistente"],
      ["especialidad", especialidadId, "especialidad_inexistente"],
    ]) {
      const { rowCount } = await client.query(`SELECT 1 FROM ${tabla} WHERE edicion_id = $1 AND id = $2`, [edicionId, id]);
      if (!rowCount) throw new ErrorConfiguracion(codigo, "El recurso no existe en la edición.");
    }
    const resultado = await operacion(client, claves, noche.estado);
    await client.query("COMMIT");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const seleccion = "edicion_id = $1 AND version_id = $2 AND noche_id = $3 AND especialidad_id = $4";

export async function consultarPlanillaNoche(pool, contexto) {
  return conContexto(pool, contexto, false, async (client, claves, estado) => {
    const { rowCount } = await client.query(`SELECT 1 FROM configuracion_planilla_noche WHERE ${seleccion}`, claves);
    const configurada = rowCount > 0;
    if (!configurada && estado !== "DRAFT") return { configurada, filaIds: [] };
    const { rows } = await client.query(configurada
      ? `SELECT fila_id AS id FROM configuracion_planilla_noche_fila WHERE ${seleccion} ORDER BY orden`
      : `${filasCandidatas} ORDER BY op.orden_presentacion, r.orden, f.orden, f.id`, claves);
    return { configurada, filaIds: rows.map(({ id }) => id) };
  });
}

export async function guardarPlanillaNoche(pool, { actorId, filaIds: entrada, ...contexto }) {
  if (!Array.isArray(entrada) || entrada.some((id) => typeof id !== "string" || !uuid.test(id))) {
    throw new ErrorConfiguracion("filas_invalidas", "Se requiere una lista de identificadores de fila válidos.");
  }
  const filaIds = entrada.map((id) => id.toLowerCase());
  if (new Set(filaIds).size !== filaIds.length) {
    throw new ErrorConfiguracion("filas_invalidas", "No se puede repetir una fila.");
  }
  return conContexto(pool, contexto, true, async (client, claves) => {
    const { rowCount } = await client.query(`${filasCandidatas} AND f.id = ANY($5::uuid[])`, [...claves, filaIds]);
    if (rowCount !== filaIds.length) {
      throw new ErrorConfiguracion("filas_fuera_de_contexto", "Una o más filas no corresponden al desfile y la especialidad.");
    }
    await client.query(`DELETE FROM configuracion_planilla_noche_fila WHERE ${seleccion}`, claves);
    await client.query(`DELETE FROM configuracion_planilla_noche WHERE ${seleccion}`, claves);
    await client.query(
      `INSERT INTO configuracion_planilla_noche (edicion_id, version_id, noche_id, especialidad_id, vacia_confirmada)
       VALUES ($1, $2, $3, $4, $5)`, [...claves, filaIds.length === 0],
    );
    await client.query(
      `INSERT INTO configuracion_planilla_noche_fila
         (edicion_id, version_id, noche_id, especialidad_id, fila_id, rubro_id, orden)
       SELECT $1, $2, $3, $4, f.id, f.rubro_version_id, elegida.orden
         FROM unnest($5::uuid[]) WITH ORDINALITY AS elegida(id, orden)
         JOIN fila_planilla f ON f.id = elegida.id`, [...claves, filaIds],
    );
    await registrarAuditoria(client, {
      actorId, operacion: "planilla_noche_configurada", entidadTipo: "noche", entidadId: contexto.nocheId,
      detalles: { versionId: contexto.versionId, especialidadId: contexto.especialidadId, vaciaConfirmada: filaIds.length === 0 },
    });
    return { configurada: true, filaIds };
  });
}
