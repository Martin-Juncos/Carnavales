// Cierres de noche y de edición. Cada función ejecuta su transacción completa y devuelve
// un resultado; las rutas HTTP traducen ese resultado a estados y respuestas.
// Los errores de base de datos se relanzan sin cambios para que la ruta decida.

// Cierre total de la edición: bloquea noches y edición en la misma transacción.
export async function cerrarEdicion(pool, { edicionId, actorId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Share-lock nights before edition: serializes with all night writes while staying
    // compatible with padrón/especialidad FOR SHARE checks on noche (no 40P01 lock inversion).
    await client.query("SELECT id FROM noche WHERE edicion_id = $1 ORDER BY id FOR SHARE", [edicionId]);
    const { rows: [edicion] } = await client.query(
      "SELECT id, estado, cerrada_en, retirada_en FROM edicion WHERE id = $1 FOR UPDATE",
      [edicionId],
    );
    if (!edicion) {
      await client.query("ROLLBACK");
      return { estado: "inexistente" };
    }
    if (edicion.retirada_en) {
      await client.query("ROLLBACK");
      return { estado: "retirada" };
    }
    let cerradaEn = edicion.cerrada_en;
    if (edicion.estado !== "CLOSED") {
      const { rows: [{ motivo }] } = await client.query(
        "SELECT motivo_bloqueo_cierre_total($1) AS motivo",
        [edicionId],
      );
      if (motivo) {
        await client.query("ROLLBACK");
        return { estado: "bloqueada", motivo };
      }
      const { rows: [cerrada] } = await client.query(
        "UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1 RETURNING cerrada_en",
        [edicionId, actorId],
      );
      cerradaEn = cerrada.cerrada_en;
    }
    await client.query("COMMIT");
    return { estado: "cerrada", edicionId: edicion.id, cerradaEn };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Cierre de una noche competitiva. Bloquea la noche antes que la edición, igual que
// la apertura, los reintentos y las sustituciones de planillas.
export async function cerrarNoche(pool, { edicionId, nocheId, actorId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [noche] } = await client.query(
      "SELECT id, estado, cerrada_en FROM noche WHERE id = $1 AND edicion_id = $2 AND tipo = 'COMPETENCIA' FOR UPDATE",
      [nocheId, edicionId],
    );
    await client.query("SELECT exigir_edicion_operativa($1)", [edicionId]);
    if (!noche) {
      await client.query("ROLLBACK");
      return { estado: "inexistente" };
    }
    let cerradaEn = noche.cerrada_en;
    if (noche.estado !== "CLOSED") {
      const { rows: [{ motivo }] } = await client.query(
        "SELECT motivo_bloqueo_cierre_noche($1, $2) AS motivo", [nocheId, noche.estado],
      );
      if (motivo) {
        await client.query("ROLLBACK");
        return { estado: "bloqueada", motivo };
      }
      const { rows: [cerrada] } = await client.query(
        "UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1 RETURNING cerrada_en",
        [nocheId, actorId],
      );
      cerradaEn = cerrada.cerrada_en;
    }
    await client.query("COMMIT");
    return { estado: "cerrada", nocheId: noche.id, cerradaEn };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
