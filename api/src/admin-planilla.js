import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import { ErrorConfiguracion } from "./configuracion-edicion.js";
import { codigosDeIdentificador, validarIdentificadores } from "./identificadores.js";
import {
  actualizarFilaPlanilla,
  eliminarNominacion,
  generarPlanilla,
  listarPlanilla,
  listarVersiones,
  nominarSujeto,
} from "./planilla.js";
import {
  consultarPlanillaNoche,
  guardarPlanillaNoche,
  listarCandidatasPlanillaNoche,
} from "./planillas-noche.js";

// Traduce los códigos de la planilla a estados HTTP. Los no listados responden 400.
const estadosDeError = {
  rubro_con_subitems: 409,
  edicion_inexistente: 404,
  version_inexistente: 404,
  rubro_inexistente: 404,
  fila_inexistente: 404,
  noche_inexistente: 404,
  especialidad_inexistente: 404,
  noche_no_editable: 409,
  filas_fuera_de_contexto: 409,
  referencia_inexistente: 404,
  padron_congelado: 409,
  version_no_borrador: 409,
  sujeto_no_corresponde: 409,
  nominados_excedidos: 409,
  nominados_comparsa_excedidos: 409,
  fila_existente: 409,
  rubro_no_aleatorio: 409,
  solo_manual_se_borra: 409,
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

export function crearRutasAdminPlanilla({ pool, obtenerSesion }) {
  const router = express.Router();
  validarIdentificadores(router, codigosDeIdentificador);
  router.use(requerirAdministrador({ pool, obtenerSesion }));
  router.use(express.json());

  const base = "/:edicionId/versiones/:versionId";
  const parametros = (request) => ({
    edicionId: request.params.edicionId,
    versionId: request.params.versionId,
    actorId: request.usuario.id,
  });

  const planillaNoche = `${base}/noches/:nocheId/planilla/:especialidadId`;
  const contextoNoche = (request) => ({
    ...parametros(request),
    nocheId: request.params.nocheId,
    especialidadId: request.params.especialidadId,
  });
  router.get("/:edicionId/versiones", ruta(async (request, response) => {
    response.json(await listarVersiones(pool, { edicionId: request.params.edicionId }));
  }));
  router.get(planillaNoche, ruta(async (request, response) => {
    response.json(await consultarPlanillaNoche(pool, contextoNoche(request)));
  }));
  router.get(`${planillaNoche}/candidatas`, ruta(async (request, response) => {
    response.json(await listarCandidatasPlanillaNoche(pool, contextoNoche(request)));
  }));
  router.put(planillaNoche, ruta(async (request, response) => {
    response.json(await guardarPlanillaNoche(pool, {
      ...contextoNoche(request), filaIds: request.body?.filaIds,
    }));
  }));

  router.get(`${base}/planilla`, ruta(async (request, response) => {
    response.status(200).json(
      await listarPlanilla(pool, { edicionId: request.params.edicionId, versionId: request.params.versionId }),
    );
  }));

  router.post(`${base}/planilla/generar`, ruta(async (request, response) => {
    response.status(200).json(await generarPlanilla(pool, parametros(request)));
  }));

  router.post(`${base}/rubros/:rubroId/nominaciones`, ruta(async (request, response) => {
    response.status(201).json(
      await nominarSujeto(pool, {
        ...parametros(request),
        rubroId: request.params.rubroId,
        datos: request.body,
      }),
    );
  }));

  router.patch(`${base}/planilla/:filaId`, ruta(async (request, response) => {
    response.status(200).json(
      await actualizarFilaPlanilla(pool, {
        ...parametros(request),
        filaId: request.params.filaId,
        datos: request.body,
      }),
    );
  }));

  router.delete(`${base}/planilla/:filaId`, ruta(async (request, response) => {
    await eliminarNominacion(pool, { ...parametros(request), filaId: request.params.filaId });
    response.status(204).end();
  }));

  return router;
}
