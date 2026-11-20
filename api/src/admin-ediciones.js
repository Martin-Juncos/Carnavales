import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import { crearEdicion, eliminarEdicion, listarEdiciones, retirarEdicion } from "./ediciones.js";
import { manejarErrores } from "./manejo-errores.js";
import {
  actualizarEspecialidad,
  actualizarNoche,
  crearEspecialidad,
  crearNoche,
  eliminarEspecialidad,
  eliminarNoche,
  ErrorConfiguracion,
  listarEspecialidades,
  listarNoches,
} from "./configuracion-edicion.js";
import { codigosDeIdentificador, validarIdentificadores } from "./identificadores.js";

// Traduce los códigos de configuración a estados HTTP. Los no listados responden 400.
const estadosDeErrorConfiguracion = {
  edicion_inexistente: 404,
  noche_inexistente: 404,
  especialidad_inexistente: 404,
  noche_no_editable: 409,
  orden_existente: 409,
  codigo_existente: 409,
  noche_con_dependencias: 409,
  especialidad_con_dependencias: 409,
  padron_congelado: 409,
};

// Responde un error de dominio; los errores que no lo son pasan al manejador general.
function responderError(response, error, next) {
  if (error instanceof ErrorConfiguracion) {
    response
      .status(estadosDeErrorConfiguracion[error.codigo] ?? 400)
      .json({ error: error.codigo, mensaje: error.message });
    return;
  }
  next(error);
}

// Rutas de administración de ediciones. Todas exigen un administrador en cada petición.
export function crearRutasAdminEdiciones({ pool, eliminacionPool, obtenerSesion }) {
  const router = express.Router();
  validarIdentificadores(router, codigosDeIdentificador);
  // Antes de cada ruta: verifica sesión y rol ADMINISTRADOR.
  router.use(requerirAdministrador({ pool, obtenerSesion }));
  // Lee el cuerpo de la petición como JSON.
  router.use(express.json());

  // GET / — listado de ediciones con su estado y la versión de reglamento vigente.
  router.get("/", async (_request, response, next) => {
    try {
      response.status(200).json({ items: await listarEdiciones(pool) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/retiradas", async (_request, response, next) => {
    try {
      response.set("Cache-Control", "no-store").json({ items: await listarEdiciones(pool, { retiradas: true }) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:edicionId/retiro", async (request, response, next) => {
    if (!request.is("application/json") || request.body?.confirmar !== true) {
      return response.status(400).json({ error: "confirmacion_retiro_requerida" });
    }
    try {
      response.json(await retirarEdicion(pool, { edicionId: request.params.edicionId, actorId: request.usuario.id }));
    } catch (error) {
      next(error);
    }
  });

  // POST / — crea una edición vacía con nombre y año.
  router.post("/", async (request, response, next) => {
    try {
      const edicion = await crearEdicion(pool, {
        nombre: request.body?.nombre,
        anio: request.body?.anio,
        creadaPor: request.usuario.id,
      });
      response.status(201).json(edicion);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:edicionId", async (request, response, next) => {
    if (!request.is("application/json") || request.body?.confirmar !== true) {
      return response.status(400).json({ error: "confirmacion_eliminacion_requerida" });
    }
    try {
      await eliminarEdicion(eliminacionPool, { edicionId: request.params.edicionId, actorId: request.usuario.id });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // GET /:edicionId/noches — calendario de la edición, ordenado.
  router.get("/:edicionId/noches", async (request, response, next) => {
    try {
      response.status(200).json(await listarNoches(pool, request.params.edicionId));
    } catch (error) {
      responderError(response, error, next);
    }
  });

  // POST /:edicionId/noches — crea una noche en DRAFT.
  router.post("/:edicionId/noches", async (request, response, next) => {
    try {
      const noche = await crearNoche(pool, {
        edicionId: request.params.edicionId,
        actorId: request.usuario.id,
        datos: request.body,
      });
      response.status(201).json(noche);
    } catch (error) {
      responderError(response, error, next);
    }
  });

  // PATCH /:edicionId/noches/:nocheId — modifica una noche en DRAFT.
  router.patch("/:edicionId/noches/:nocheId", async (request, response, next) => {
    try {
      const noche = await actualizarNoche(pool, {
        edicionId: request.params.edicionId,
        nocheId: request.params.nocheId,
        actorId: request.usuario.id,
        datos: request.body,
      });
      response.status(200).json(noche);
    } catch (error) {
      responderError(response, error, next);
    }
  });

  // DELETE /:edicionId/noches/:nocheId — borra una noche en DRAFT sin dependencias.
  router.delete("/:edicionId/noches/:nocheId", async (request, response, next) => {
    try {
      await eliminarNoche(pool, {
        edicionId: request.params.edicionId,
        nocheId: request.params.nocheId,
        actorId: request.usuario.id,
      });
      response.status(204).end();
    } catch (error) {
      responderError(response, error, next);
    }
  });

  // GET /:edicionId/especialidades — juradurías de la edición, ordenadas.
  router.get("/:edicionId/especialidades", async (request, response, next) => {
    try {
      response.status(200).json(await listarEspecialidades(pool, request.params.edicionId));
    } catch (error) {
      responderError(response, error, next);
    }
  });

  // POST /:edicionId/especialidades — crea una especialidad con el padrón editable.
  router.post("/:edicionId/especialidades", async (request, response, next) => {
    try {
      const especialidad = await crearEspecialidad(pool, {
        edicionId: request.params.edicionId,
        actorId: request.usuario.id,
        datos: request.body,
      });
      response.status(201).json(especialidad);
    } catch (error) {
      responderError(response, error, next);
    }
  });

  // PATCH /:edicionId/especialidades/:especialidadId — modifica una especialidad.
  router.patch("/:edicionId/especialidades/:especialidadId", async (request, response, next) => {
    try {
      const especialidad = await actualizarEspecialidad(pool, {
        edicionId: request.params.edicionId,
        especialidadId: request.params.especialidadId,
        actorId: request.usuario.id,
        datos: request.body,
      });
      response.status(200).json(especialidad);
    } catch (error) {
      responderError(response, error, next);
    }
  });

  // DELETE /:edicionId/especialidades/:especialidadId — borra sin dependencias.
  router.delete("/:edicionId/especialidades/:especialidadId", async (request, response, next) => {
    try {
      await eliminarEspecialidad(pool, {
        edicionId: request.params.edicionId,
        especialidadId: request.params.especialidadId,
        actorId: request.usuario.id,
      });
      response.status(204).end();
    } catch (error) {
      responderError(response, error, next);
    }
  });

  router.use(manejarErrores);
  return router;
}
