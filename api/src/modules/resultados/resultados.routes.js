// Rutas de consulta post-cierre de resultados y puntajes detallados (P6C / D15).
// Accesibles únicamente para ESCRIBANO y ADMINISTRADOR cuando la edición está CLOSED.

import express from "express";
import { requerirAlgunRol } from "../../http/autorizacion.js";
import { codigosDeIdentificador, validarIdentificadores } from "../../http/identificadores.js";
import { obtenerPuntajesDetalladosEdicion, obtenerResultadosEdicion } from "./resultados.js";

export function crearRutasResultados({ pool, obtenerSesion }) {
  const router = express.Router();
  router.use(requerirAlgunRol({ pool, obtenerSesion, codigos: ["ESCRIBANO", "ADMINISTRADOR"] }));
  validarIdentificadores(router, codigosDeIdentificador);

  router.get("/ediciones/:edicionId", async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    try {
      const calculoId = typeof request.query?.calculoId === "string" ? request.query.calculoId : undefined;
      const datos = await obtenerResultadosEdicion(pool, {
        edicionId: request.params.edicionId,
        calculoId,
      });
      response.json(datos);
    } catch (error) {
      next(error);
    }
  });

  router.get("/ediciones/:edicionId/puntajes", async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    try {
      const datos = await obtenerPuntajesDetalladosEdicion(pool, {
        edicionId: request.params.edicionId,
      });
      response.json(datos);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
