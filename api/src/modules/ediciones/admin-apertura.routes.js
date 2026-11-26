import express from "express";
import { abrirEdicion } from "./apertura-edicion.js";
import { abrirNoche } from "./apertura-noche.js";
import { requerirAdministrador } from "../../http/autorizacion.js";
import { ErrorConfiguracion } from "./configuracion-edicion.js";
import { codigosDeIdentificador, validarIdentificadores } from "../../http/identificadores.js";

// Traduce los códigos de apertura a estados HTTP. Los no listados responden 400.
const estadosDeError = {
  edicion_inexistente: 404,
  clave_operacion_invalida: 400,
  clave_reutilizada: 409,
  edicion_ya_abierta: 409,
  edicion_retirada: 409,
  edicion_cerrada: 409,
  noche_inexistente: 404,
  edicion_no_abierta: 409,
  noche_ya_abierta: 409,
  apertura_con_bloqueantes: 409,
  version_no_publicada: 409,
};

// Rutas de apertura de edición y noches sobre la conexión principal de la API.
export function crearRutasAdminApertura({ pool, obtenerSesion }) {
  const router = express.Router();
  validarIdentificadores(router, codigosDeIdentificador);
  router.use(requerirAdministrador({ pool, obtenerSesion }));
  router.use(express.json());

  // POST /:edicionId/apertura — abre la edición. Repetir la misma claveOperacion es seguro.
  router.post("/:edicionId/apertura", async (request, response, next) => {
    try {
      const resultado = await abrirEdicion(pool, {
        edicionId: request.params.edicionId,
        claveOperacion: request.body?.claveOperacion,
        actorId: request.usuario.id,
      });
      response.status(200).json(resultado);
    } catch (error) {
      if (error instanceof ErrorConfiguracion) {
        response
          .status(estadosDeError[error.codigo] ?? 400)
          .json({ error: error.codigo, mensaje: error.message, ...(error.detalles ?? {}) });
        return;
      }
      next(error);
    }
  });

  // POST /:edicionId/noches/:nocheId/apertura — abre una noche de forma idempotente.
  router.post("/:edicionId/noches/:nocheId/apertura", async (request, response, next) => {
    try {
      const resultado = await abrirNoche(pool, {
        edicionId: request.params.edicionId,
        nocheId: request.params.nocheId,
        claveOperacion: request.body?.claveOperacion,
        actorId: request.usuario.id,
      });
      response.status(200).json(resultado);
    } catch (error) {
      if (error instanceof ErrorConfiguracion) {
        response
          .status(estadosDeError[error.codigo] ?? 400)
          .json({ error: error.codigo, mensaje: error.message, ...(error.detalles ?? {}) });
        return;
      }
      next(error);
    }
  });

  return router;
}
