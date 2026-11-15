import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import {
  crearInvitacion,
  ErrorInvitacion,
  reenviarInvitacion,
  revocarInvitacion,
} from "./invitaciones.js";

const estadosDeError = {
  cuenta_existente: 409,
  pendiente_existente: 409,
  no_reenviable: 409,
  no_revocable: 409,
  no_encontrada: 404,
  rol_invalido: 400,
  correo_invalido: 400,
};

function responderError(response, error, next) {
  if (error instanceof ErrorInvitacion) {
    response.status(estadosDeError[error.codigo] ?? 400).json({ error: error.codigo, mensaje: error.message });
    return;
  }
  next(error);
}

// Respuesta de alta o reenvío. Nunca incluye el token ni su hash.
function responderEntrega(response, { id, entrega, correo }) {
  if (entrega === "fallida") {
    // La invitación queda pendiente; el id permite reenviar sin crear otra.
    response.status(502).json({ error: "entrega_fallida", id });
    return;
  }
  response.status(201).json({ id, correo, estado: "pendiente", entrega });
}

// Rutas de administración de invitaciones. Todas exigen un administrador en cada petición.
export function crearRutasAdminInvitaciones({ pool, obtenerSesion, appUrl, enviar }) {
  const router = express.Router();
  router.use(requerirAdministrador({ pool, obtenerSesion }));
  router.use(express.json());

  router.post("/", async (request, response, next) => {
    try {
      const resultado = await crearInvitacion(pool, {
        correo: request.body?.correo,
        rolCodigo: request.body?.rol,
        creadaPor: request.usuario.id,
        ahora: new Date(),
        appUrl,
        enviar,
      });
      responderEntrega(response, { ...resultado, correo: request.body.correo.trim().toLowerCase() });
    } catch (error) {
      responderError(response, error, next);
    }
  });

  router.post("/:id/reenviar", async (request, response, next) => {
    try {
      const resultado = await reenviarInvitacion(pool, {
        id: request.params.id,
        creadaPor: request.usuario.id,
        ahora: new Date(),
        appUrl,
        enviar,
      });
      responderEntrega(response, resultado);
    } catch (error) {
      responderError(response, error, next);
    }
  });

  router.post("/:id/revocar", async (request, response, next) => {
    try {
      const resultado = await revocarInvitacion(pool, { id: request.params.id, ahora: new Date() });
      response.status(200).json(resultado);
    } catch (error) {
      responderError(response, error, next);
    }
  });

  return router;
}
