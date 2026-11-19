import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import {
  crearInvitacion,
  listarInvitaciones,
  reenviarInvitacion,
  revocarInvitacion,
} from "./invitaciones.js";
import { manejarErrores } from "./manejo-errores.js";

// Respuesta de alta o reenvío. Nunca incluye el token ni su hash.
function responderEntrega(response, { id, entrega, correo }) {
  // Si el correo no salió, la invitación queda creada y pendiente: se responde 502 con su id para poder reenviarla.
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
  // Antes de cada ruta: verifica sesión y rol ADMINISTRADOR.
  router.use(requerirAdministrador({ pool, obtenerSesion }));
  // Lee el cuerpo de la petición como JSON.
  router.use(express.json());

  // GET / — listado paginado de invitaciones, con filtros opcionales por estado y correo.
  router.get("/", async (request, response, next) => {
    try {
      const resultado = await listarInvitaciones(pool, {
        pagina: request.query.pagina === undefined ? 1 : Number(request.query.pagina),
        limite: request.query.limite === undefined ? undefined : Number(request.query.limite),
        estado: typeof request.query.estado === "string" ? request.query.estado : undefined,
        correo: typeof request.query.correo === "string" ? request.query.correo : undefined,
        ahora: new Date(),
      });
      response.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  });

  // POST / — crea una invitación para un correo con un rol inicial y envía el enlace.
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
      next(error);
    }
  });

  // POST /:id/reenviar — invalida el enlace anterior y emite uno nuevo con 72 horas de vigencia.
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
      next(error);
    }
  });

  // POST /:id/revocar — revoca una invitación pendiente para que su enlace deje de servir.
  router.post("/:id/revocar", async (request, response, next) => {
    try {
      const resultado = await revocarInvitacion(pool, { id: request.params.id, ahora: new Date() });
      response.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  });

  router.use(manejarErrores);
  return router;
}
