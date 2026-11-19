import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import { ErrorConfiguracion } from "./configuracion-edicion.js";
import {
  actualizarElemento,
  crearElemento,
  eliminarElemento,
  entidadesDeReglamento,
  guardarEscala,
  guardarEspecialidadesDeRubro,
  leerEscala,
  listarElementos,
} from "./reglamento-borrador.js";

// Traduce los códigos del reglamento a estados HTTP. Los no listados responden 400.
const estadosDeError = {
  edicion_inexistente: 404,
  version_inexistente: 404,
  rubro_inexistente: 404,
  requisito_inexistente: 404,
  premio_inexistente: 404,
  referencia_inexistente: 404,
  version_no_borrador: 409,
  codigo_existente: 409,
  nombre_existente: 409,
  con_dependencias: 409,
};

function responderError(response, error, next) {
  if (error instanceof ErrorConfiguracion) {
    response
      .status(estadosDeError[error.codigo] ?? 400)
      .json({ error: error.codigo, mensaje: error.message });
    return;
  }
  next(error);
}

function ruta(manejar) {
  return async (request, response, next) => {
    try {
      await manejar(request, response);
    } catch (error) {
      responderError(response, error, next);
    }
  };
}

// Rutas de una colección de la versión: listar, crear, modificar y borrar.
function rutasDeColeccion(router, { pool, ruta: segmento, entidad }) {
  const base = `/:edicionId/versiones/:versionId/${segmento}`;
  const parametros = (request) => ({
    edicionId: request.params.edicionId,
    versionId: request.params.versionId,
    actorId: request.usuario.id,
  });

  router.get(base, ruta(async (request, response) => {
    response.status(200).json(
      await listarElementos(pool, { ...parametros(request), entidad }),
    );
  }));
  router.post(base, ruta(async (request, response) => {
    response.status(201).json(
      await crearElemento(pool, { ...parametros(request), entidad, datos: request.body }),
    );
  }));
  router.patch(`${base}/:elementoId`, ruta(async (request, response) => {
    response.status(200).json(
      await actualizarElemento(pool, {
        ...parametros(request),
        elementoId: request.params.elementoId,
        entidad,
        datos: request.body,
      }),
    );
  }));
  router.delete(`${base}/:elementoId`, ruta(async (request, response) => {
    await eliminarElemento(pool, {
      ...parametros(request),
      elementoId: request.params.elementoId,
      entidad,
    });
    response.status(204).end();
  }));
}

// Contenido del reglamento en borrador. Toda escritura exige la versión en BORRADOR.
export function crearRutasAdminReglamento({ pool, obtenerSesion }) {
  const router = express.Router();
  router.use(requerirAdministrador({ pool, obtenerSesion }));
  router.use(express.json());

  rutasDeColeccion(router, { pool, ruta: "rubros", entidad: entidadesDeReglamento.rubro });
  rutasDeColeccion(router, { pool, ruta: "requisitos", entidad: entidadesDeReglamento.requisito });
  rutasDeColeccion(router, { pool, ruta: "premios", entidad: entidadesDeReglamento.premio });

  // Especialidades que evalúan un rubro (reemplazo completo).
  router.put("/:edicionId/versiones/:versionId/rubros/:rubroId/especialidades", ruta(async (request, response) => {
    response.status(200).json(
      await guardarEspecialidadesDeRubro(pool, {
        edicionId: request.params.edicionId,
        versionId: request.params.versionId,
        rubroId: request.params.rubroId,
        actorId: request.usuario.id,
        especialidadIds: request.body?.especialidadIds,
      }),
    );
  }));

  // Escala de puntaje: una sola por versión.
  router.get("/:edicionId/versiones/:versionId/escala", ruta(async (request, response) => {
    response.status(200).json(
      await leerEscala(pool, {
        edicionId: request.params.edicionId,
        versionId: request.params.versionId,
      }),
    );
  }));
  router.put("/:edicionId/versiones/:versionId/escala", ruta(async (request, response) => {
    response.status(200).json(
      await guardarEscala(pool, {
        edicionId: request.params.edicionId,
        versionId: request.params.versionId,
        actorId: request.usuario.id,
        datos: request.body,
      }),
    );
  }));

  return router;
}
