import express from "express";
import { requerirAdministrador } from "./autorizacion.js";
import { ErrorRol, asignarRol, retirarRol } from "./roles.js";
import { ErrorUsuario, eliminarUsuario, listarUsuarios } from "./usuarios.js";

// Traduce los códigos de error de roles a estados HTTP.
const estadosDeErrorRol = {
  usuario_no_encontrado: 404,
  no_asignado: 404,
  rol_ya_asignado: 409,
  rol_protegido: 409,
  rol_invalido: 400,
};

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
      responderErrorRol(response, error, next);
    }
  });

  // DELETE /:id — elimina la cuenta del usuario.
  router.delete("/:id", async (request, response, next) => {
    try {
      response.status(200).json(await eliminarUsuario(pool, { usuarioId: request.params.id }));
    } catch (error) {
      // No encontrado: 404. Primer administrador protegido: 409.
      if (error instanceof ErrorUsuario) {
        response.status(error.codigo === "usuario_no_encontrado" ? 404 : 409).json({ error: error.codigo, mensaje: error.message });
        return;
      }
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
      responderErrorRol(response, error, next);
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
      // Parámetros inválidos: 400 con el código y el mensaje del error.
      if (error instanceof ErrorUsuario) {
        response.status(400).json({ error: error.codigo, mensaje: error.message });
        return;
      }
      next(error);
    }
  });

  return router;
}

// Responde un error de roles con su estado HTTP; los errores desconocidos pasan al manejador general.
function responderErrorRol(response, error, next) {
  if (error instanceof ErrorRol) {
    response.status(estadosDeErrorRol[error.codigo] ?? 400).json({ error: error.codigo, mensaje: error.message });
    return;
  }
  next(error);
}
