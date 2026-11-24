import express from "express";
import { requerirAdministrador } from "../../http/autorizacion.js";
import { asignarRol, retirarRol } from "./roles.js";
import { eliminarUsuario, listarUsuarios } from "./usuarios.js";
import { manejarErrores } from "../../http/manejo-errores.js";

// Rutas de administración de usuarios. Todas exigen un administrador en cada petición.
export function crearRutasAdminUsuarios({ pool, obtenerSesion }) {
  const router = express.Router();
  // Antes de cada ruta: verifica sesión y rol ADMINISTRADOR.
  router.use(requerirAdministrador({ pool, obtenerSesion }));

  // POST /:id/roles/:codigo — asigna un rol al usuario indicado.
  router.post("/:id/roles/:codigo", async (request, response, next) => {
    try {
      const resultado = await asignarRol(pool, {
        usuarioId: request.params.id,
        rolCodigo: request.params.codigo,
        asignadoPor: request.usuario.id,
      });
      response.status(201).json(resultado);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /:id — elimina la cuenta del usuario.
  router.delete("/:id", async (request, response, next) => {
    try {
      response.status(200).json(await eliminarUsuario(pool, { usuarioId: request.params.id }));
    } catch (error) {
      next(error);
    }
  });

  // DELETE /:id/roles/:codigo — quita un rol al usuario indicado.
  router.delete("/:id/roles/:codigo", async (request, response, next) => {
    try {
      const resultado = await retirarRol(pool, {
        usuarioId: request.params.id,
        rolCodigo: request.params.codigo,
      });
      response.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  });

  // GET / — listado paginado de usuarios, con búsqueda opcional (?buscar=).
  router.get("/", async (request, response, next) => {
    try {
      // Si no se envían, pagina y limite toman sus valores por defecto dentro del servicio.
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
      next(error);
    }
  });

  router.use(manejarErrores);
  return router;
}
