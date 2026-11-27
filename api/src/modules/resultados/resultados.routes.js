// Rutas de consulta post-cierre de resultados y puntajes detallados (P6C / D15).
// Accesibles únicamente para ESCRIBANO y ADMINISTRADOR cuando la edición está CLOSED.

import express from "express";
import { requerirAlgunRol } from "../../http/autorizacion.js";
import { codigosDeIdentificador, validarIdentificadores } from "../../http/identificadores.js";
import { obtenerPuntajesDetalladosEdicion, obtenerResultadosEdicion } from "./resultados.js";
import { descargarActa, listarActas, normalizarFormato, verificarActa } from "../actas/actas.js";

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

  router.get("/ediciones/:edicionId/actas", async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    try {
      response.json(await listarActas(pool, { edicionId: request.params.edicionId }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/ediciones/:edicionId/actas/:actaId/:formato/descargar", async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    try {
      const archivo = await descargarActa(pool, {
        edicionId: request.params.edicionId,
        actaId: request.params.actaId,
        formato: normalizarFormato(request.params.formato),
      });
      response
        .set("Content-Type", archivo.contentType)
        .set("Content-Disposition", `attachment; filename="${archivo.filename}"`)
        .set("X-Acta-SHA256", archivo.sha256)
        .send(archivo.contenido);
    } catch (error) {
      next(error);
    }
  });

  router.get("/ediciones/:edicionId/actas/:actaId/:formato/verificar", async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    try {
      const verificacion = await verificarActa(pool, {
        edicionId: request.params.edicionId,
        actaId: request.params.actaId,
        formato: normalizarFormato(request.params.formato),
      });
      response.json(verificacion);
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
