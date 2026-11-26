// Apertura de una edición: pasa de CONFIGURING a OPEN de forma idempotente y auditada.
// Abrir la edición no congela reglamento ni padrón: eso ocurre al abrir la primera noche.

import { ErrorConfiguracion } from "./configuracion-edicion.js";
import { registrarAuditoria } from "../../shared/auditoria.js";

const patronClaveOperacion = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resultadoDeApertura(edicion, claveOperacion, repetida) {
  return {
    edicionId: edicion.id,
    estado: edicion.estado,
    abiertaEn: edicion.abierta_en.toISOString(),
    claveOperacion,
    repetida,
  };
}

// Abre la edición con una clave de operación (UUID). Repetir la misma clave sobre la misma
// edición devuelve el resultado original sin volver a escribir. Usar la clave con otra
// edición, o abrir una edición ya abierta con una clave nueva, responde conflicto.
export async function abrirEdicion(pool, { edicionId, claveOperacion, actorId }) {
  if (typeof claveOperacion !== "string" || !patronClaveOperacion.test(claveOperacion)) {
    throw new ErrorConfiguracion("clave_operacion_invalida", "La clave de operación debe ser un UUID.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [edicion] } = await client.query(
      "SELECT id, estado, abierta_en, retirada_en FROM edicion WHERE id = $1 FOR UPDATE",
      [edicionId],
    );
    if (!edicion) {
      throw new ErrorConfiguracion("edicion_inexistente", "La edición no existe.");
    }
    if (edicion.retirada_en) {
      throw new ErrorConfiguracion("edicion_retirada", "La edición retirada es de solo lectura.");
    }
    if (edicion.estado === "CLOSED") {
      throw new ErrorConfiguracion("edicion_cerrada", "La edición ya cerró su votación.");
    }

    const { rows: registradas } = await client.query(
      `INSERT INTO operacion_apertura (edicion_id, clave_operacion, resultado, solicitada_por)
       VALUES ($1, $2, 'ABIERTA', $3)
       ON CONFLICT (clave_operacion) DO NOTHING
       RETURNING id`,
      [edicion.id, claveOperacion, actorId],
    );

    if (registradas.length === 0) {
      const { rows: [previa] } = await client.query(
        "SELECT edicion_id FROM operacion_apertura WHERE clave_operacion = $1",
        [claveOperacion],
      );
      if (previa.edicion_id !== edicion.id) {
        throw new ErrorConfiguracion("clave_reutilizada", "La clave de operación ya se usó con otra edición.");
      }
      await client.query("COMMIT");
      return resultadoDeApertura(edicion, claveOperacion, true);
    }

    if (edicion.estado === "OPEN") {
      throw new ErrorConfiguracion("edicion_ya_abierta", "La edición ya está abierta.");
    }

    const { rows: [abierta] } = await client.query(
      `UPDATE edicion
          SET estado = 'OPEN', abierta_por = $1, abierta_en = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, estado, abierta_en`,
      [actorId, edicion.id],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "edicion_abierta",
      entidadTipo: "edicion",
      entidadId: edicion.id,
    });
    await client.query("COMMIT");
    return resultadoDeApertura(abierta, claveOperacion, false);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
