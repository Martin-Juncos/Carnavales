import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import { crearEdicion, listarEdiciones } from "./ediciones.js";
import { manejarErrores } from "./manejo-errores.js";

// Rutas de administración de ediciones. Todas exigen un administrador en cada petición.
export function crearRutasAdminEdiciones({ pool, obtenerSesion }) {
  const router = express.Router();
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

  router.use(manejarErrores);
  return router;
}
