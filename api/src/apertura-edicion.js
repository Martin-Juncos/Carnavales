// Apertura de una edición: pasa de CONFIGURING a OPEN de forma idempotente y auditada.
// Abrir la edición no congela reglamento ni padrón: eso ocurre al abrir la primera noche.
// El trigger edicion_validar_cambio (0006) exige que la conexión sea miembro del rol
// carnavales_servicio_apertura; este módulo debe recibir un pool con esa cuenta.

import { ErrorConfiguracion, registrarAuditoria } from "./configuracion-edicion.js";

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

function traducirErrorApertura(error) {
  if (error instanceof ErrorConfiguracion) return error;
  if (error.code === "23514" && (error.message ?? "").includes("APERTURA_REQUIERE_SERVICIO")) {
    return new ErrorConfiguracion("apertura_no_autorizada", "La cuenta no tiene permiso de apertura.");
  }
  return error;
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
      "SELECT id, estado, abierta_en FROM edicion WHERE id = $1 FOR UPDATE",
      [edicionId],
    );
    if (!edicion) {
      throw new ErrorConfiguracion("edicion_inexistente", "La edición no existe.");
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
    throw traducirErrorApertura(error);
  } finally {
    client.release();
  }
}
