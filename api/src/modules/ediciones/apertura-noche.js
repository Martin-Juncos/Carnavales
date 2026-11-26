import { ErrorConfiguracion } from "./configuracion-edicion.js";
import { registrarAuditoria } from "../../shared/auditoria.js";
import { obtenerChecklistPublicacion } from "../reglamento/publicacion-reglamento.js";

const patronClaveOperacion = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function traducirError(error) {
  if (error instanceof ErrorConfiguracion) return error;
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
      `SELECT n.id, n.edicion_id, n.estado, n.tipo, n.abierta_en, e.estado AS estado_edicion, e.retirada_en
         FROM noche n JOIN edicion e ON e.id = n.edicion_id
        WHERE n.id = $1 AND n.edicion_id = $2
        FOR UPDATE OF n, e`,
      [nocheId, edicionId],
    );
    if (!noche) throw new ErrorConfiguracion("noche_inexistente", "La noche no existe en esta edición.");
    if (noche.retirada_en) {
      throw new ErrorConfiguracion("edicion_retirada", "La edición retirada es de solo lectura.");
    }
    if (noche.estado_edicion === "CLOSED") {
      throw new ErrorConfiguracion("edicion_cerrada", "La edición ya cerró su votación.");
    }

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
          AND NOT ($4 AND EXISTS (
            SELECT 1 FROM configuracion_planilla_noche p
             WHERE p.noche_id = $3 AND p.version_id = $2 AND p.especialidad_id = e.id
               AND p.vacia_confirmada
          ))
        ORDER BY e.codigo`,
      [edicionId, version.id, nocheId, noche.tipo === "COMPETENCIA"],
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
    if (noche.tipo === "COMPETENCIA") {
      const { rows: especialidades } = await client.query(
        `SELECT e.id, e.codigo, e.nombre FROM especialidad e
          WHERE e.edicion_id = $1
            AND (EXISTS (
              SELECT 1 FROM rubro_especialidad re JOIN rubro_version rv ON rv.id = re.rubro_version_id
               WHERE rv.version_id = $2 AND re.especialidad_id = e.id
            ) OR EXISTS (
              SELECT 1 FROM asignacion_jurado a
               WHERE a.noche_id = $3 AND a.especialidad_id = e.id AND a.estado = 'ACTIVA'
            ))
            AND NOT EXISTS (
              SELECT 1 FROM configuracion_planilla_noche p
               WHERE p.noche_id = $3 AND p.version_id = $2 AND p.especialidad_id = e.id
            )
          ORDER BY e.codigo, e.id`, [edicionId, version.id, nocheId],
      );
      if (especialidades.length) faltantes.push({ codigo: "especialidades_sin_planilla", especialidades });

      const { rows: vacias } = await client.query(
        `SELECT e.id, e.codigo, e.nombre
           FROM configuracion_planilla_noche p
           JOIN especialidad e ON e.id = p.especialidad_id AND e.edicion_id = p.edicion_id
          WHERE p.edicion_id = $1 AND p.version_id = $2 AND p.noche_id = $3
            AND NOT EXISTS (
              SELECT 1 FROM configuracion_planilla_noche_fila f
               WHERE f.noche_id = p.noche_id AND f.version_id = p.version_id AND f.especialidad_id = p.especialidad_id
            )
            AND (NOT p.vacia_confirmada OR EXISTS (
              SELECT 1 FROM asignacion_jurado a
               WHERE a.noche_id = p.noche_id AND a.especialidad_id = p.especialidad_id AND a.estado = 'ACTIVA'
            ))
          ORDER BY e.codigo, e.id`, [edicionId, version.id, nocheId],
      );
      if (vacias.length) {
        faltantes.push({ codigo: "especialidades_con_planilla_vacia", especialidades: vacias });
      }

      const { rows: filas } = await client.query(
        `SELECT p.fila_id AS "filaId", p.especialidad_id AS "especialidadId"
           FROM configuracion_planilla_noche_fila p
           JOIN fila_planilla f ON f.id = p.fila_id
           JOIN sujeto_evaluable s ON s.id = f.sujeto_id
           JOIN comparsa c ON c.id = s.comparsa_id
          WHERE p.edicion_id = $1 AND p.version_id = $2 AND p.noche_id = $3
            AND (f.excluida OR NOT s.activo OR NOT c.activa OR NOT EXISTS (
              SELECT 1 FROM orden_presentacion op
               WHERE op.noche_id = p.noche_id AND op.comparsa_id = c.id AND op.estado = 'SCHEDULED'
            ))
          ORDER BY p.especialidad_id, p.orden`, [edicionId, version.id, nocheId],
      );
      if (filas.length) faltantes.push({ codigo: "filas_planilla_fuera_de_contexto", filas });
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
    await client.query(
      `WITH cabecera AS (
         INSERT INTO instantanea_planillas_esperadas (edicion_id, noche_id, version_id, congelada_en, filas_configuradas)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4) RETURNING id
       )
       INSERT INTO instantanea_planilla_esperada_detalle (instantanea_id, edicion_id, noche_id, asignacion_id)
       SELECT cabecera.id, a.edicion_id, a.noche_id, a.id
         FROM asignacion_jurado a CROSS JOIN cabecera
        WHERE a.edicion_id = $1 AND a.noche_id = $2 AND a.estado = 'ACTIVA'`,
      [edicionId, nocheId, version.id, noche.tipo === "COMPETENCIA"],
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
