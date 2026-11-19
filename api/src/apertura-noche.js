import { ErrorConfiguracion, registrarAuditoria } from "./configuracion-edicion.js";
import { obtenerChecklistPublicacion } from "./publicacion-reglamento.js";

const patronClaveOperacion = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function traducirError(error) {
  if (error instanceof ErrorConfiguracion) return error;
  if (error.code === "23514" && (error.message ?? "").includes("APERTURA_REQUIERE_SERVICIO")) {
    return new ErrorConfiguracion("apertura_no_autorizada", "La cuenta no tiene permiso de apertura.");
  }
  return error;
}

export async function abrirNoche(pool, { edicionId, nocheId, claveOperacion, actorId }) {
  if (typeof claveOperacion !== "string" || !patronClaveOperacion.test(claveOperacion)) {
    throw new ErrorConfiguracion("clave_operacion_invalida", "La clave de operación debe ser un UUID.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [noche] } = await client.query(
      `SELECT n.id, n.edicion_id, n.estado, n.abierta_en, e.estado AS estado_edicion
         FROM noche n JOIN edicion e ON e.id = n.edicion_id
        WHERE n.id = $1 AND n.edicion_id = $2
        FOR UPDATE OF n, e`,
      [nocheId, edicionId],
    );
    if (!noche) throw new ErrorConfiguracion("noche_inexistente", "La noche no existe en esta edición.");

    const { rows: registradas } = await client.query(
      `INSERT INTO operacion_apertura (edicion_id, noche_id, clave_operacion, resultado, solicitada_por)
       VALUES ($1, $2, $3, 'NOCHE_ABIERTA', $4)
       ON CONFLICT (clave_operacion) DO NOTHING
       RETURNING id`,
      [edicionId, nocheId, claveOperacion, actorId],
    );
    if (registradas.length === 0) {
      const { rows: [previa] } = await client.query(
        "SELECT edicion_id, noche_id FROM operacion_apertura WHERE clave_operacion = $1",
        [claveOperacion],
      );
      if (previa.edicion_id !== edicionId || previa.noche_id !== nocheId) {
        throw new ErrorConfiguracion("clave_reutilizada", "La clave de operación ya se usó en otra apertura.");
      }
      await client.query("COMMIT");
      return { nocheId, estado: "OPEN", abiertaEn: noche.abierta_en?.toISOString(), claveOperacion, repetida: true };
    }

    if (noche.estado_edicion !== "OPEN") {
      throw new ErrorConfiguracion("edicion_no_abierta", "Primero debe abrirse la edición.");
    }
    if (noche.estado !== "DRAFT") {
      throw new ErrorConfiguracion("noche_ya_abierta", "La noche ya no está en borrador.");
    }

    const { rows: [version] } = await client.query(
      `SELECT id, estado FROM version_reglamento
        WHERE edicion_id = $1 AND estado IN ('PUBLICADA', 'CONGELADA')
        FOR UPDATE`,
      [edicionId],
    );
    if (!version) throw new ErrorConfiguracion("version_no_publicada", "La edición no tiene un reglamento publicado.");

    const checklist = await obtenerChecklistPublicacion(client, { edicionId, versionId: version.id });
    const faltantes = [];
    if (!checklist.publicable) faltantes.push(...checklist.bloqueantes.map((item) => item.codigo));

    const { rows: sinJurado } = await client.query(
      `SELECT DISTINCT e.id, e.codigo, e.nombre
         FROM rubro_especialidad re
         JOIN rubro_version rv ON rv.id = re.rubro_version_id
         JOIN especialidad e ON e.id = re.especialidad_id AND e.edicion_id = $1
        WHERE rv.version_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM asignacion_jurado aj
             WHERE aj.noche_id = $3 AND aj.especialidad_id = e.id AND aj.estado = 'ACTIVA'
          )
        ORDER BY e.codigo`,
      [edicionId, version.id, nocheId],
    );
    if (sinJurado.length) faltantes.push({ codigo: "especialidades_sin_jurado", especialidades: sinJurado });

    const { rows: comparsasSinOrden } = await client.query(
      `SELECT c.id, c.nombre
         FROM comparsa c
        WHERE c.edicion_id = $1 AND c.activa
          AND NOT EXISTS (
            SELECT 1 FROM orden_presentacion op
             WHERE op.edicion_id = c.edicion_id AND op.noche_id = $2
               AND op.comparsa_id = c.id AND op.estado = 'SCHEDULED'
          )
        ORDER BY c.nombre, c.id`,
      [edicionId, nocheId],
    );
    if (comparsasSinOrden.length) {
      faltantes.push({ codigo: "comparsas_sin_orden", comparsas: comparsasSinOrden });
    }
    if (faltantes.length) {
      throw new ErrorConfiguracion("apertura_con_bloqueantes", "La noche tiene requisitos pendientes.", { bloqueantes: faltantes });
    }

    if (version.estado === "PUBLICADA") {
      await client.query(
        "UPDATE version_reglamento SET estado = 'CONGELADA', congelada_en = CURRENT_TIMESTAMP WHERE id = $1",
        [version.id],
      );
    }
    const { rows: [abierta] } = await client.query(
      `UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING id, estado, abierta_en`,
      [nocheId],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "noche_abierta",
      entidadTipo: "noche",
      entidadId: nocheId,
      detalles: { versionId: version.id, claveOperacion },
    });
    await client.query("COMMIT");
    return { nocheId: abierta.id, estado: abierta.estado, abiertaEn: abierta.abierta_en.toISOString(), claveOperacion, repetida: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw traducirError(error);
  } finally {
    client.release();
  }
}
