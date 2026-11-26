import express from "express";
import { aceptarInvitacion, consultarInvitacion } from "./invitaciones.js";
import { manejarErrores } from "../../http/manejo-errores.js";

// Ruta pública para aceptar una invitación. No requiere sesión: el token es la credencial.
export function crearRutaAceptarInvitacion({ pool, secret, baseUrl }) {
  const router = express.Router();
  // Lee el cuerpo de la petición como JSON.
  router.use(express.json());

  // GET /?token=... — datos públicos de la invitación, sin consumir el token.
  router.get("/", async (request, response, next) => {
    try {
      const resultado = await consultarInvitacion(pool, {
        token: typeof request.query.token === "string" ? request.query.token : undefined,
        ahora: new Date(),
      });
      response.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  });

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
      next(error);
    }
  });

  router.use(manejarErrores);
  return router;
}
