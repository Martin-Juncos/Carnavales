import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import { crearEdicion, ErrorEdicion, listarEdiciones } from "./ediciones.js";

// Traduce los códigos de error de ediciones a estados HTTP. Los no listados responden 400.
const estadosDeError = {
  nombre_invalido: 400,
  anio_invalido: 400,
  anio_existente: 409,
};

// Responde un error de edición; los errores que no son de dominio pasan al manejador general.
function responderError(response, error, next) {
  if (error instanceof ErrorEdicion) {
    response.status(estadosDeError[error.codigo] ?? 400).json({ error: error.codigo, mensaje: error.message });
    return;
  }
  next(error);
}

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
      responderError(response, error, next);
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
      responderError(response, error, next);
    }
  });

  return router;
}
