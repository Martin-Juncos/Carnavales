import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import { listarAsignaciones, listarJurados } from "./asignaciones.js";

// Rutas de consulta de asignaciones. Cada ruta exige sesión y rol ADMINISTRADOR;
// el rol se verifica en la base en cada petición (api/src/autorizacion.js).
export function crearRutasAdminAsignaciones({ pool, obtenerSesion }) {
  const router = express.Router();
  const soloAdministrador = requerirAdministrador({ pool, obtenerSesion });

  // GET /asignaciones — asignaciones por noche y especialidad, con sus estados.
  router.get("/asignaciones", soloAdministrador, async (_request, response, next) => {
    try {
      response.status(200).json(await listarAsignaciones(pool));
    } catch (error) {
      next(error);
    }
  });

  // GET /jurados — usuarios con rol JURADO disponibles para asignar.
  router.get("/jurados", soloAdministrador, async (_request, response, next) => {
    try {
      response.status(200).json(await listarJurados(pool));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
