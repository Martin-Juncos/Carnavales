import express from "express";
import { requerirAdministrador } from "../../http/autorizacion.js";
import {
  activarSuplente,
  crearAsignacion,
  listarAsignaciones,
  listarEspecialidades,
  listarJurados,
  listarNoches,
  registrarSuplentes,
  reemplazarAsignacion,
  revocarAsignacion,
} from "./asignaciones.js";
import { manejarErrores } from "../../http/manejo-errores.js";

// Rutas de asignaciones. Cada ruta exige sesión y rol ADMINISTRADOR; el rol se
// verifica en la base en cada petición (api/src/autorizacion.js). Los errores
// los traduce el middleware compartido, montado al final de este router.
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

  // Catálogos de solo lectura para el formulario de alta del panel.
  router.get("/noches", soloAdministrador, async (_request, response, next) => {
    try {
      response.status(200).json(await listarNoches(pool));
    } catch (error) {
      next(error);
    }
  });

  router.get("/especialidades", soloAdministrador, async (_request, response, next) => {
    try {
      response.status(200).json(await listarEspecialidades(pool));
    } catch (error) {
      next(error);
    }
  });

  // POST /asignaciones — alta en una noche DRAFT. La identidad del actor sale de
  // la sesión (request.usuario), nunca de campos enviados en el cuerpo.
  router.post("/asignaciones", soloAdministrador, express.json(), async (request, response, next) => {
    try {
      const asignacion = await crearAsignacion(pool, {
        juradoId: request.body?.juradoId,
        nocheId: request.body?.nocheId,
        especialidadId: request.body?.especialidadId,
        creadaPor: request.usuario.id,
      });
      response.status(201).json(asignacion);
    } catch (error) {
      next(error);
    }
  });

  router.post("/asignaciones/:id/suplentes", soloAdministrador, express.json(), async (request, response, next) => {
    try {
      response.status(201).json(await registrarSuplentes(pool, {
        id: request.params.id,
        suplenteIds: request.body?.suplenteIds,
        actorId: request.usuario.id,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/asignaciones/:id/activar-suplente", soloAdministrador, express.json(), async (request, response, next) => {
    try {
      response.status(200).json(await activarSuplente(pool, {
        id: request.params.id, juradoId: request.body?.juradoId, actorId: request.usuario.id,
      }));
    } catch (error) {
      next(error);
    }
  });

  // DELETE /asignaciones/:id — baja lógica. El trigger de la migración 0007
  // impide el borrado físico, así que la evidencia original se conserva.
  router.delete("/asignaciones/:id", soloAdministrador, async (request, response, next) => {
    try {
      const asignacion = await revocarAsignacion(pool, {
        id: request.params.id,
        actorId: request.usuario.id,
      });
      response.status(200).json(asignacion);
    } catch (error) {
      next(error);
    }
  });

  // PATCH /asignaciones/:id — reemplaza jurado y/o especialidad de forma
  // atómica: revoca la original y crea una nueva en la misma transacción.
  router.patch("/asignaciones/:id", soloAdministrador, express.json(), async (request, response, next) => {
    try {
      const asignacion = await reemplazarAsignacion(pool, {
        id: request.params.id,
        juradoId: request.body?.juradoId,
        especialidadId: request.body?.especialidadId,
        actorId: request.usuario.id,
      });
      response.status(200).json(asignacion);
    } catch (error) {
      next(error);
    }
  });

  router.use(manejarErrores);
  return router;
}
