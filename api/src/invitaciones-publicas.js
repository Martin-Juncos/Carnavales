import express from "express";
import { aceptarInvitacion, ErrorInvitacion } from "./invitaciones.js";

// Ruta pública para aceptar una invitación. No requiere sesión: el token es la credencial.
export function crearRutaAceptarInvitacion({ pool, secret, baseUrl }) {
  const router = express.Router();
  // Lee el cuerpo de la petición como JSON.
  router.use(express.json());

  // POST /aceptar: crea la cuenta con el token, el nombre y la contraseña recibidos.
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
      // Errores de la invitación: 400 si el enlace no sirve (sin detalles), 422 si los datos no son válidos.
      if (error instanceof ErrorInvitacion) {
        const estado = error.codigo === "invitacion_invalida" ? 400 : 422;
        response.status(estado).json({ error: error.codigo, mensaje: error.message });
        return;
      }
      // Cualquier otro error pasa al manejador general de Express.
      next(error);
    }
  });

  return router;
}
