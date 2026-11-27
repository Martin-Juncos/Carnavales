import express from "express";
import { requerirEscribano } from "../../http/autorizacion.js";
import { codigosDeIdentificador, validarIdentificadores } from "../../http/identificadores.js";
import { cerrarEdicion, cerrarNoche } from "./cierres.js";
import {
  anularPenalizacion,
  listarPenalizaciones,
  obtenerContextoPenalizaciones,
  registrarPenalizacion,
} from "./penalizaciones.js";
import {
  calcularResultadosEdicion,
  publicarResultadoEdicion,
  resolverEmpateResultado,
} from "../resultados/resultados.js";
import { generarActa } from "../actas/actas.js";

export function crearRutasEscribano({ pool, obtenerSesion }) {
  const router = express.Router();
  router.use(requerirEscribano({ pool, obtenerSesion }));
  validarIdentificadores(router, codigosDeIdentificador);

  router.get("/ediciones", async (_request, response, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, nombre, anio, estado, cerrada_en
           FROM edicion
          WHERE retirada_en IS NULL
          ORDER BY anio DESC, id`,
      );
      response.set("Cache-Control", "no-store").json({
        items: rows.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          anio: e.anio,
          estado: e.estado,
          cerradaEn: e.cerrada_en ? e.cerrada_en.toISOString() : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/ediciones/:edicionId/cierre", async (request, response, next) => {
    try {
      const { edicionId } = request.params;
      const { rows: [edicion] } = await pool.query(
        `SELECT id, estado, cerrada_en, motivo_bloqueo_cierre_total(id) AS motivo
           FROM edicion
          WHERE id = $1 AND retirada_en IS NULL`,
        [edicionId],
      );
      response.set("Cache-Control", "no-store");
      if (!edicion) {
        response.status(404).json({ error: "edicion_inexistente", mensaje: "La edición no existe." });
        return;
      }
      response.json({
        edicionId: edicion.id,
        estado: edicion.estado,
        puedeCerrar: edicion.motivo === null,
        motivo: edicion.motivo,
        cerradaEn: edicion.cerrada_en ? edicion.cerrada_en.toISOString() : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/ediciones/:edicionId/cierre", express.json({ limit: "1kb" }), async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!request.is("application/json") || request.body?.confirmar !== true) {
      return response.status(400).json({ error: "confirmacion_cierre_requerida" });
    }
    try {
      const resultado = await cerrarEdicion(pool, {
        edicionId: request.params.edicionId,
        actorId: request.usuario.id,
      });
      if (resultado.estado === "inexistente") {
        return response.status(404).json({ error: "edicion_inexistente", mensaje: "La edición no existe." });
      }
      if (resultado.estado === "retirada") {
        return response.status(409).json({ error: "edicion_retirada", mensaje: "La edición retirada es de solo lectura." });
      }
      if (resultado.estado === "bloqueada") {
        return response.status(409).json({ error: resultado.motivo });
      }
      return response.json({
        edicionId: resultado.edicionId,
        estado: "CLOSED",
        cerradaEn: resultado.cerradaEn.toISOString(),
      });
    } catch (error) {
      if (error.code === "23514" && error.message === "CIERRE_REQUIERE_ESCRIBANO") {
        return response.status(403).json({ error: "sin_permiso" });
      }
      next(error);
    }
  });

  router.get("/ediciones/:edicionId/penalizaciones/contexto", async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    try {
      const resultado = await obtenerContextoPenalizaciones(pool, { edicionId: request.params.edicionId });
      response.json(resultado);
    } catch (error) {
      next(error);
    }
  });

  router.get("/ediciones/:edicionId/penalizaciones", async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    try {
      const resultado = await listarPenalizaciones(pool, { edicionId: request.params.edicionId });
      response.json(resultado);
    } catch (error) {
      next(error);
    }
  });

  router.post("/ediciones/:edicionId/penalizaciones", express.json({ limit: "4kb" }), async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!request.is("application/json") || request.body?.confirmar !== true) {
      return response.status(400).json({ error: "confirmacion_requerida", mensaje: "La operación requiere confirmación explícita." });
    }
    try {
      const { repetida, penalizacion } = await registrarPenalizacion(pool, {
        edicionId: request.params.edicionId,
        actorId: request.usuario.id,
        datos: request.body,
      });
      response.status(repetida ? 200 : 201).json(penalizacion);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/ediciones/:edicionId/penalizaciones/:penalizacionId/anular",
    express.json({ limit: "4kb" }),
    async (request, response, next) => {
      response.set("Cache-Control", "no-store");
      if (!request.is("application/json") || request.body?.confirmar !== true) {
        return response.status(400).json({ error: "confirmacion_requerida", mensaje: "La anulación requiere confirmación explícita." });
      }
      try {
        const penalizacion = await anularPenalizacion(pool, {
          edicionId: request.params.edicionId,
          penalizacionId: request.params.penalizacionId,
          actorId: request.usuario.id,
          datos: request.body,
        });
        response.status(200).json(penalizacion);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ediciones/:edicionId/resultados/calcular",
    express.json({ limit: "2kb" }),
    async (request, response, next) => {
      response.set("Cache-Control", "no-store");
      if (!request.is("application/json") || request.body?.confirmar !== true) {
        return response.status(400).json({ error: "confirmacion_requerida", mensaje: "El cálculo requiere confirmación explícita." });
      }
      try {
        const snapshot = await calcularResultadosEdicion(pool, {
          edicionId: request.params.edicionId,
          actorId: request.usuario.id,
          datos: request.body,
        });
        response.status(201).json(snapshot);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ediciones/:edicionId/resultados/:calculoId/empates/:empateId/resolver",
    express.json({ limit: "4kb" }),
    async (request, response, next) => {
      response.set("Cache-Control", "no-store");
      if (!request.is("application/json") || request.body?.confirmar !== true) {
        return response.status(400).json({ error: "confirmacion_requerida", mensaje: "La resolución requiere confirmación explícita." });
      }
      try {
        const empate = await resolverEmpateResultado(pool, {
          edicionId: request.params.edicionId,
          calculoId: request.params.calculoId,
          empateId: request.params.empateId,
          actorId: request.usuario.id,
          datos: request.body,
        });
        response.status(200).json(empate);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ediciones/:edicionId/resultados/:calculoId/publicar",
    express.json({ limit: "1kb" }),
    async (request, response, next) => {
      response.set("Cache-Control", "no-store");
      if (!request.is("application/json") || request.body?.confirmar !== true) {
        return response.status(400).json({ error: "confirmacion_requerida", mensaje: "La publicación requiere confirmación explícita." });
      }
      try {
        const snapshot = await publicarResultadoEdicion(pool, {
          edicionId: request.params.edicionId,
          calculoId: request.params.calculoId,
          actorId: request.usuario.id,
        });
        response.status(200).json(snapshot);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/ediciones/:edicionId/resultados/:calculoId/actas",
    express.json({ limit: "1kb" }),
    async (request, response, next) => {
      response.set("Cache-Control", "no-store");
      if (!request.is("application/json") || request.body?.confirmar !== true) {
        return response.status(400).json({
          error: "confirmacion_requerida",
          mensaje: "La emisión del acta requiere confirmación explícita.",
        });
      }
      try {
        const { repetida, acta } = await generarActa(pool, {
          edicionId: request.params.edicionId,
          calculoId: request.params.calculoId,
          actorId: request.usuario.id,
          datos: request.body,
        });
        response.status(repetida ? 200 : 201).json(acta);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/noches", async (_request, response, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT n.id, n.nombre, n.estado, e.id AS edicion_id, e.nombre AS edicion_nombre
           FROM noche n JOIN edicion e ON e.id = n.edicion_id
          WHERE n.tipo = 'COMPETENCIA' AND (e.retirada_en IS NULL OR n.estado = 'CLOSED')
          ORDER BY e.anio DESC, n.orden, n.id`,
      );
      response.set("Cache-Control", "no-store").json({ items: rows.map((n) => ({
        id: n.id, nombre: n.nombre, estado: n.estado, edicion: { id: n.edicion_id, nombre: n.edicion_nombre },
      })) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/ediciones/:edicionId/noches/:nocheId/cierre", async (request, response, next) => {
    try {
      const { edicionId, nocheId } = request.params;
      const { rows: [noche] } = await pool.query(
        `SELECT n.id, n.cerrada_en, e.retirada_en, motivo_bloqueo_cierre_noche(n.id, n.estado) AS motivo
           FROM noche n JOIN edicion e ON e.id = n.edicion_id
          WHERE n.id = $1 AND n.edicion_id = $2 AND n.tipo = 'COMPETENCIA'
            AND (e.retirada_en IS NULL OR n.estado = 'CLOSED')`,
        [nocheId, edicionId],
      );
      response.set("Cache-Control", "no-store");
      if (!noche) {
        response.status(404).json({ error: "noche_inexistente", mensaje: "La noche competitiva no existe en la edición." });
        return;
      }
      response.json({ nocheId: noche.id, puedeCerrar: noche.motivo === null, motivo: noche.motivo,
        ...(noche.retirada_en ? { cerradaEn: noche.cerrada_en.toISOString() } : {}),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/ediciones/:edicionId/noches/:nocheId/cierre", express.json({ limit: "1kb" }), async (request, response, next) => {
    if (!request.is("application/json") || request.body?.confirmar !== true) {
      return response.status(400).json({ error: "confirmacion_cierre_requerida" });
    }
    try {
      const { edicionId, nocheId } = request.params;
      const resultado = await cerrarNoche(pool, { edicionId, nocheId, actorId: request.usuario.id });
      response.set("Cache-Control", "no-store");
      if (resultado.estado === "inexistente") {
        return response.status(404).json({ error: "noche_inexistente", mensaje: "La noche competitiva no existe en la edición." });
      }
      if (resultado.estado === "bloqueada") {
        return response.status(409).json({ error: resultado.motivo });
      }
      return response.json({
        nocheId: resultado.nocheId,
        estado: "CLOSED",
        cerradaEn: resultado.cerradaEn.toISOString(),
      });
    } catch (error) {
      if (error.code === "23514" && error.message === "CIERRE_REQUIERE_ESCRIBANO") {
        return response.status(403).json({ error: "sin_permiso" });
      }
      next(error);
    }
  });

  return router;
}
