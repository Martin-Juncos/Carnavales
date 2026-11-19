import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import {
  crearAsignacion,
  ErrorAsignacion,
  listarAsignaciones,
  listarJurados,
  reemplazarAsignacion,
  revocarAsignacion,
} from "./asignaciones.js";

// Traduce los errores de dominio de asignaciones a estados HTTP. Los errores no
// previstos se responden aquí con un mensaje genérico: Express no define un
// manejador global y su respuesta por defecto expondría detalles internos.
const estadosDeError = {
  campos_invalidos: 400,
  jurado_invalido: 400,
  noche_inexistente: 400,
  especialidad_invalida: 400,
  noche_abierta: 409,
  asignacion_duplicada: 409,
  asignacion_no_encontrada: 404,
  asignacion_no_activa: 409,
};

function responderError(response, error) {
  if (error instanceof ErrorAsignacion) {
    response.status(estadosDeError[error.codigo] ?? 400).json({ error: error.codigo, mensaje: error.message });
    return;
  }
  response.status(500).json({ error: "error_interno", mensaje: "No se pudo completar la operación." });
}

// express.json() responde HTML ante un cuerpo con sintaxis inválida. Se traduce
// al mismo error de dominio que cualquier otro campo mal formado.
function cuerpoJson(request, response, next) {
  express.json()(request, response, (error) => {
    if (error) {
      response.status(400).json({ error: "campos_invalidos", mensaje: "El cuerpo debe ser un JSON válido." });
      return;
    }
    next();
  });
}

// Rutas de asignaciones. Cada ruta exige sesión y rol ADMINISTRADOR; el rol se
// verifica en la base en cada petición (api/src/autorizacion.js).
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

  // POST /asignaciones — alta en una noche DRAFT. La identidad del actor sale de
  // la sesión (request.usuario), nunca de campos enviados en el cuerpo.
  router.post("/asignaciones", soloAdministrador, cuerpoJson, async (request, response) => {
    try {
      const asignacion = await crearAsignacion(pool, {
        juradoId: request.body?.juradoId,
        nocheId: request.body?.nocheId,
        especialidadId: request.body?.especialidadId,
        creadaPor: request.usuario.id,
      });
      response.status(201).json(asignacion);
    } catch (error) {
      responderError(response, error);
    }
  });

  // DELETE /asignaciones/:id — baja lógica. El trigger de la migración 0007
  // impide el borrado físico, así que la evidencia original se conserva.
  router.delete("/asignaciones/:id", soloAdministrador, async (request, response) => {
    try {
      const asignacion = await revocarAsignacion(pool, {
        id: request.params.id,
        actorId: request.usuario.id,
      });
      response.status(200).json(asignacion);
    } catch (error) {
      responderError(response, error);
    }
  });

  // PATCH /asignaciones/:id — reemplaza jurado y/o especialidad de forma
  // atómica: revoca la original y crea una nueva en la misma transacción.
  router.patch("/asignaciones/:id", soloAdministrador, cuerpoJson, async (request, response) => {
    try {
      const asignacion = await reemplazarAsignacion(pool, {
        id: request.params.id,
        juradoId: request.body?.juradoId,
        especialidadId: request.body?.especialidadId,
        actorId: request.usuario.id,
      });
      response.status(200).json(asignacion);
    } catch (error) {
      responderError(response, error);
    }
  });

  return router;
}
