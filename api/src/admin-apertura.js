import express from "express";
import { abrirEdicion } from "./apertura-edicion.js";
import { abrirNoche } from "./apertura-noche.js";
import { requerirAdministrador } from "./autorizacion.js";
import { ErrorConfiguracion } from "./configuracion-edicion.js";
import { codigosDeIdentificador, validarIdentificadores } from "./identificadores.js";

// Traduce los códigos de apertura a estados HTTP. Los no listados responden 400.
const estadosDeError = {
  edicion_inexistente: 404,
  clave_operacion_invalida: 400,
  clave_reutilizada: 409,
  edicion_ya_abierta: 409,
  edicion_retirada: 409,
  edicion_cerrada: 409,
  apertura_no_autorizada: 403,
  noche_inexistente: 404,
  edicion_no_abierta: 409,
  noche_ya_abierta: 409,
  apertura_con_bloqueantes: 409,
  version_no_publicada: 409,
};

// La apertura usa su propia conexión (aperturaPool), con la cuenta miembro del rol de apertura.
// Sin esa cuenta configurada, la ruta responde 503 en lugar de fallar contra la base.
export function crearRutasAdminApertura({ pool, aperturaPool, obtenerSesion }) {
  const router = express.Router();
  validarIdentificadores(router, codigosDeIdentificador);
  router.use(requerirAdministrador({ pool, obtenerSesion }));
  router.use(express.json());

  // POST /:edicionId/apertura — abre la edición. Repetir la misma claveOperacion es seguro.
  router.post("/:edicionId/apertura", async (request, response, next) => {
    if (!aperturaPool) {
      response.status(503).json({
        error: "apertura_no_configurada",
        mensaje: "La apertura de edición no está configurada en este servidor.",
      });
      return;
    }
    try {
      const resultado = await abrirEdicion(aperturaPool, {
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
    if (!aperturaPool) {
      response.status(503).json({
        error: "apertura_no_configurada",
        mensaje: "La apertura de noches no está configurada en este servidor.",
      });
      return;
    }
    try {
      const resultado = await abrirNoche(aperturaPool, {
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
