import express from "express";
import { aceptarInvitacion, ErrorInvitacion } from "./invitaciones.js";

// Ruta pública para aceptar una invitación. No requiere sesión: el token es la credencial.
export function crearRutaAceptarInvitacion({ pool, secret, baseUrl }) {
  const router = express.Router();
  router.use(express.json());

  router.post("/aceptar", async (request, response, next) => {
    try {
      await aceptarInvitacion(pool, {
        token: request.body?.token,
        nombre: request.body?.nombre,
        contrasena: request.body?.contrasena,
        ahora: new Date(),
        secret,
        baseUrl,
      });
      response.status(201).json({ estado: "cuenta_creada" });
    } catch (error) {
      if (error instanceof ErrorInvitacion) {
        const estado = error.codigo === "invitacion_invalida" ? 400 : 422;
        response.status(estado).json({ error: error.codigo, mensaje: error.message });
        return;
      }
      next(error);
    }
  });

  return router;
}
