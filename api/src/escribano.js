import express from "express";
import { requerirEscribano } from "./autorizacion.js";
import { codigosDeIdentificador, validarIdentificadores } from "./identificadores.js";

export function crearRutasEscribano({ pool, obtenerSesion }) {
  const router = express.Router();
  router.use(requerirEscribano({ pool, obtenerSesion }));
  validarIdentificadores(router, codigosDeIdentificador);

  router.get("/noches", async (_request, response, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT n.id, n.nombre, n.estado, e.id AS edicion_id, e.nombre AS edicion_nombre
           FROM noche n JOIN edicion e ON e.id = n.edicion_id
          WHERE n.tipo = 'COMPETENCIA' ORDER BY e.anio DESC, n.orden, n.id`,
      );
      response.set("Cache-Control", "no-store").json({ items: rows.map((n) => ({
        id: n.id, nombre: n.nombre, estado: n.estado, edicion: { id: n.edicion_id, nombre: n.edicion_nombre },
      })) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/ediciones/:edicionId/noches/:nocheId/cierre", async (request, response, next) => {
    try {
      const { edicionId, nocheId } = request.params;
      const { rows: [noche] } = await pool.query(
        `SELECT id, motivo_bloqueo_cierre_noche(id, estado) AS motivo FROM noche
          WHERE id = $1 AND edicion_id = $2 AND tipo = 'COMPETENCIA'`,
        [nocheId, edicionId],
      );
      response.set("Cache-Control", "no-store");
      if (!noche) {
        response.status(404).json({ error: "noche_inexistente", mensaje: "La noche competitiva no existe en la edición." });
        return;
      }
      response.json({ nocheId: noche.id, puedeCerrar: noche.motivo === null, motivo: noche.motivo });
    } catch (error) {
      next(error);
    }
  });

  router.post("/ediciones/:edicionId/noches/:nocheId/cierre", express.json({ limit: "1kb" }), async (request, response, next) => {
    if (!request.is("application/json") || request.body?.confirmar !== true) {
      return response.status(400).json({ error: "confirmacion_cierre_requerida" });
    }
    let client;
    try {
      const { edicionId, nocheId } = request.params;
      client = await pool.connect();
      await client.query("BEGIN");
      // Receipt and substitution take a share lock on the night first.
      const { rows: [noche] } = await client.query(
        "SELECT id, estado, cerrada_en FROM noche WHERE id = $1 AND edicion_id = $2 AND tipo = 'COMPETENCIA' FOR UPDATE",
        [nocheId, edicionId],
      );
      response.set("Cache-Control", "no-store");
      if (!noche) {
        await client.query("ROLLBACK");
        return response.status(404).json({ error: "noche_inexistente", mensaje: "La noche competitiva no existe en la edición." });
      }
      let cerradaEn = noche.cerrada_en;
      if (noche.estado !== "CLOSED") {
        const { rows: [{ motivo }] } = await client.query(
          "SELECT motivo_bloqueo_cierre_noche($1, $2) AS motivo", [nocheId, noche.estado],
        );
        if (motivo) {
          await client.query("ROLLBACK");
          return response.status(409).json({ error: motivo });
        }
        const { rows: [cerrada] } = await client.query(
          "UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1 RETURNING cerrada_en",
          [nocheId, request.usuario.id],
        );
        cerradaEn = cerrada.cerrada_en;
      }
      await client.query("COMMIT");
      return response.json({ nocheId: noche.id, estado: "CLOSED", cerradaEn: cerradaEn.toISOString() });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (error.code === "23514" && error.message === "CIERRE_REQUIERE_ESCRIBANO") {
        return response.status(403).json({ error: "sin_permiso" });
      }
      next(error);
    } finally {
      client?.release();
    }
  });
  return router;
}
