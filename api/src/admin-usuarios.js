import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import { ErrorUsuario, listarUsuarios } from "./usuarios.js";

// Rutas de administración de usuarios. Todas exigen un administrador en cada petición.
export function crearRutasAdminUsuarios({ pool, obtenerSesion }) {
  const router = express.Router();
  router.use(requerirAdministrador({ pool, obtenerSesion }));

  router.get("/", async (request, response, next) => {
    try {
      const pagina = request.query.pagina === undefined ? 1 : Number(request.query.pagina);
      const limite = request.query.limite === undefined ? undefined : Number(request.query.limite);
      const resultado = await listarUsuarios(pool, {
        pagina,
        limite,
        buscar: typeof request.query.buscar === "string" ? request.query.buscar : undefined,
        ahora: new Date(),
      });
      response.status(200).json(resultado);
    } catch (error) {
      if (error instanceof ErrorUsuario) {
        response.status(400).json({ error: error.codigo, mensaje: error.message });
        return;
      }
      next(error);
    }
  });

  return router;
}
