import express from "express";
import { requerirJurado } from "./autorizacion.js";
import { manejarErrores } from "./manejo-errores.js";
import { listarContextosJurado, obtenerPlanillaJurado } from "./planillas-jurado.js";
import { confirmarAcuseTraspaso, congelarBorradorTraspaso, recibirPlanilla } from "./recepcion-planillas.js";

// Rutas del Jurado. La identidad y el rol se derivan de la sesión en
// cada petición; ninguna ruta acepta un jurado o un rol enviado por el cliente.
export function crearRutasJurado({ pool, obtenerSesion }) {
  const router = express.Router();
  router.use(requerirJurado({ pool, obtenerSesion }));

  // GET /contextos — noches y especialidades con asignación activa del jurado.
  router.get("/contextos", async (request, response, next) => {
    try {
      response.status(200).json(await listarContextosJurado(pool, { juradoId: request.usuario.id }));
    } catch (error) {
      next(error);
    }
  });

  // GET /planillas/:asignacionId — filas esperadas, sin puntajes numéricos.
  router.get("/planillas/:asignacionId", async (request, response, next) => {
    try {
      const planilla = await obtenerPlanillaJurado(pool, {
        asignacionId: request.params.asignacionId,
        juradoId: request.usuario.id,
      });
      response.status(200).json(planilla);
    } catch (error) {
      next(error);
    }
  });

  router.post("/planillas/:asignacionId/abrir-edicion", express.json({ limit: "1kb" }), async (request, response, next) => {
    try {
      const planilla = await obtenerPlanillaJurado(pool, {
        asignacionId: request.params.asignacionId,
        juradoId: request.usuario.id,
        dispositivoId: request.body?.dispositivoId ?? null,
      });
      response.set("Cache-Control", "no-store").status(200).json(planilla);
    } catch (error) {
      next(error);
    }
  });

  router.post("/planillas/:asignacionId/borrador-traspaso", express.json({ limit: "256kb" }), async (request, response, next) => {
    try {
      const { repetida, acuse } = await congelarBorradorTraspaso(
        pool, request.usuario.id, request.params.asignacionId, request.body,
      );
      response.set("Cache-Control", "no-store").status(repetida ? 200 : 201).json(acuse);
    } catch (error) {
      next(error);
    }
  });

  router.post("/planillas/:asignacionId/confirmar-traspaso", express.json({ limit: "1kb" }), async (request, response, next) => {
    try {
      const acuse = await confirmarAcuseTraspaso(pool, request.usuario.id, request.params.asignacionId, request.body);
      response.set("Cache-Control", "no-store").status(200).json(acuse);
    } catch (error) {
      next(error);
    }
  });

  router.post("/planillas", express.json({ limit: "256kb" }), async (request, response, next) => {
    try {
      const { repetida, acuse } = await recibirPlanilla(pool, request.usuario.id, request.body);
      response.set("Cache-Control", "no-store").status(repetida ? 200 : 201).json(acuse);
    } catch (error) {
      next(error);
    }
  });

  router.use(manejarErrores);
  return router;
}
