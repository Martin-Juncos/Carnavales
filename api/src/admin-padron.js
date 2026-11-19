import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import { ErrorConfiguracion } from "./configuracion-edicion.js";
import { codigosDeIdentificador, validarIdentificadores } from "./identificadores.js";
import {
  actualizarComparsa,
  actualizarParticipante,
  actualizarSujeto,
  crearComparsa,
  crearParticipante,
  crearSujeto,
  eliminarComparsa,
  eliminarSujeto,
  guardarOrdenPresentacion,
  listarComparsas,
  listarOrdenPresentacion,
  listarParticipantes,
  listarSujetos,
} from "./padron-evento.js";

// Traduce los códigos del padrón a estados HTTP. Los no listados responden 400.
const estadosDeError = {
  nombre_existente: 409,
  edicion_inexistente: 404,
  comparsa_inexistente: 404,
  participante_inexistente: 404,
  sujeto_inexistente: 404,
  noche_inexistente: 404,
  referencia_inexistente: 404,
  noche_no_editable: 409,
  padron_congelado: 409,
  comparsa_con_padron: 409,
  comparsa_inactiva: 409,
  participante_ya_en_comparsa: 409,
  orden_existente: 409,
  con_dependencias: 409,
};

// Responde un error de dominio; los que no lo son pasan al manejador general.
function responderError(response, error, next) {
  if (error instanceof ErrorConfiguracion) {
    response
      .status(estadosDeError[error.codigo] ?? 400)
      .json({ error: error.codigo, mensaje: error.message });
    return;
  }
  next(error);
}

// Envuelve un manejador asíncrono: responde el resultado o traduce el error.
function ruta(manejar) {
  return async (request, response, next) => {
    try {
      await manejar(request, response);
    } catch (error) {
      responderError(response, error, next);
    }
  };
}

export function crearRutasAdminPadron({ pool, obtenerSesion }) {
  const router = express.Router();
  validarIdentificadores(router, codigosDeIdentificador);
  router.use(requerirAdministrador({ pool, obtenerSesion }));
  router.use(express.json());

  const actor = (request) => request.usuario.id;

  // Comparsas
  router.get("/:edicionId/comparsas", ruta(async (request, response) => {
    response.status(200).json(await listarComparsas(pool, request.params.edicionId));
  }));
  router.post("/:edicionId/comparsas", ruta(async (request, response) => {
    const comparsa = await crearComparsa(pool, {
      edicionId: request.params.edicionId,
      actorId: actor(request),
      datos: request.body,
    });
    response.status(201).json(comparsa);
  }));
  router.patch("/:edicionId/comparsas/:comparsaId", ruta(async (request, response) => {
    response.status(200).json(
      await actualizarComparsa(pool, {
        edicionId: request.params.edicionId,
        comparsaId: request.params.comparsaId,
        actorId: actor(request),
        datos: request.body,
      }),
    );
  }));
  router.delete("/:edicionId/comparsas/:comparsaId", ruta(async (request, response) => {
    await eliminarComparsa(pool, {
      edicionId: request.params.edicionId,
      comparsaId: request.params.comparsaId,
      actorId: actor(request),
    });
    response.status(204).end();
  }));

  // Participantes
  router.get("/:edicionId/participantes", ruta(async (request, response) => {
    response.status(200).json(await listarParticipantes(pool, request.params.edicionId));
  }));
  router.post("/:edicionId/participantes", ruta(async (request, response) => {
    const participante = await crearParticipante(pool, {
      edicionId: request.params.edicionId,
      actorId: actor(request),
      datos: request.body,
    });
    response.status(201).json(participante);
  }));
  router.patch("/:edicionId/participantes/:participanteId", ruta(async (request, response) => {
    response.status(200).json(
      await actualizarParticipante(pool, {
        edicionId: request.params.edicionId,
        participanteId: request.params.participanteId,
        actorId: actor(request),
        datos: request.body,
      }),
    );
  }));

  // Sujetos evaluables de una comparsa
  router.get("/:edicionId/comparsas/:comparsaId/sujetos", ruta(async (request, response) => {
    response.status(200).json(
      await listarSujetos(pool, {
        edicionId: request.params.edicionId,
        comparsaId: request.params.comparsaId,
      }),
    );
  }));
  router.post("/:edicionId/comparsas/:comparsaId/sujetos", ruta(async (request, response) => {
    const sujeto = await crearSujeto(pool, {
      edicionId: request.params.edicionId,
      comparsaId: request.params.comparsaId,
      actorId: actor(request),
      datos: request.body,
    });
    response.status(201).json(sujeto);
  }));
  router.patch("/:edicionId/sujetos/:sujetoId", ruta(async (request, response) => {
    response.status(200).json(
      await actualizarSujeto(pool, {
        edicionId: request.params.edicionId,
        sujetoId: request.params.sujetoId,
        actorId: actor(request),
        datos: request.body,
      }),
    );
  }));
  router.delete("/:edicionId/sujetos/:sujetoId", ruta(async (request, response) => {
    await eliminarSujeto(pool, {
      edicionId: request.params.edicionId,
      sujetoId: request.params.sujetoId,
      actorId: actor(request),
    });
    response.status(204).end();
  }));

  // Orden de presentación de una noche
  router.get("/:edicionId/noches/:nocheId/orden", ruta(async (request, response) => {
    response.status(200).json(
      await listarOrdenPresentacion(pool, {
        edicionId: request.params.edicionId,
        nocheId: request.params.nocheId,
      }),
    );
  }));
  router.put("/:edicionId/noches/:nocheId/orden", ruta(async (request, response) => {
    response.status(200).json(
      await guardarOrdenPresentacion(pool, {
        edicionId: request.params.edicionId,
        nocheId: request.params.nocheId,
        actorId: actor(request),
        datos: request.body,
      }),
    );
  }));

  return router;
}
