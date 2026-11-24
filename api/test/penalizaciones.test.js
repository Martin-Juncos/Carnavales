import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasEscribano } from "../src/modules/escribano/escribano.routes.js";
import { manejarErrores } from "../src/http/manejo-errores.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const escribano = "u-escribano";
const jurado = "u-jurado";

async function prepararEscenario(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES
       ($1, 'Admin', 'admin@example.test', true),
       ($2, 'Escribano', 'escribano@example.test', true),
       ($3, 'Jurado', 'jurado@example.test', true)`,
    [admin, escribano, jurado],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, NULL, true FROM rol WHERE codigo = 'ADMINISTRADOR'`,
    [admin],
  );
  for (const [usuario, rol] of [[escribano, "ESCRIBANO"], [jurado, "JURADO"]]) {
    await pool.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
       SELECT $1, id, $3, false FROM rol WHERE codigo = $2`,
      [usuario, rol, admin],
    );
  }

  const edicionId = randomUUID();
  const versionId = randomUUID();
  const especialidadId = randomUUID();
  const comparsaId = randomUUID();
  const comparsaNoProgramada = randomUUID();
  const sujetoId = randomUUID();
  const rubroBateria = randomUUID();
  const rubroNoEvaluable = randomUUID();
  const filaId = randomUUID();
  const nocheUno = randomUUID();
  const nocheDraft = randomUUID();
  const nochePremiacion = randomUUID();
  const asignacionId = randomUUID();
  const instantaneaId = randomUUID();
  const planillaId = randomUUID();

  await pool.query(
    "INSERT INTO edicion (id, nombre, anio, estado, creada_por) VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2)",
    [edicionId, admin],
  );
  await pool.query(
    "INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por) VALUES ($1, $2, 1, 'BORRADOR', 'Base', $3)",
    [versionId, edicionId, admin],
  );
  await pool.query(
    "INSERT INTO especialidad (id, edicion_id, codigo, nombre, orden) VALUES ($1, $2, 'BAT', 'Batería', 1)",
    [especialidadId, edicionId],
  );
  await pool.query(
    `INSERT INTO comparsa (id, edicion_id, categoria, nombre) VALUES
       ($1, $3, 'PRIMERA', 'Aymara'),
       ($2, $3, 'PRIMERA', 'Poramba')`,
    [comparsaId, comparsaNoProgramada, edicionId],
  );
  await pool.query(
    "INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, nombre) VALUES ($1, $2, $3, 'BATERIA', 'Batería Aymara')",
    [sujetoId, edicionId, comparsaId],
  );
  await pool.query(
    `INSERT INTO rubro_version (id, edicion_id, version_id, codigo, nombre, tipo_sujeto, tipo_rubro, orden, evaluable) VALUES
       ($1, $3, $4, 'BAT-SHOW', 'Show de batería', 'BATERIA', 'NOMINATIVO', 1, true),
       ($2, $3, $4, 'INFO', 'Informativo', 'BATERIA', 'NOMINATIVO', 2, false)`,
    [rubroBateria, rubroNoEvaluable, edicionId, versionId],
  );
  await pool.query(
    "INSERT INTO rubro_especialidad (edicion_id, rubro_version_id, especialidad_id) VALUES ($1, $2, $3)",
    [edicionId, rubroBateria, especialidadId],
  );
  await pool.query(
    `INSERT INTO fila_planilla (id, edicion_id, especialidad_id, rubro_version_id, sujeto_id, orden, origen)
     VALUES ($1, $2, $3, $4, $5, 1, 'GENERADA')`,
    [filaId, edicionId, especialidadId, rubroBateria, sujetoId],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, cuenta_para_puntaje) VALUES
       ($1, $4, 1, 'Primera noche', 'COMPETENCIA', true),
       ($2, $4, 2, 'Segunda noche', 'COMPETENCIA', false),
       ($3, $4, 3, 'Premiación', 'PREMIACION', false)`,
    [nocheUno, nocheDraft, nochePremiacion, edicionId],
  );
  await pool.query(
    "INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion) VALUES ($1, $2, $3, 1)",
    [edicionId, nocheUno, comparsaId],
  );
  await pool.query(
    "INSERT INTO configuracion_planilla_noche (edicion_id, version_id, noche_id, especialidad_id) VALUES ($1, $2, $3, $4)",
    [edicionId, versionId, nocheUno, especialidadId],
  );
  await pool.query(
    `INSERT INTO configuracion_planilla_noche_fila (edicion_id, version_id, noche_id, especialidad_id, fila_id, rubro_id, orden)
     VALUES ($1, $2, $3, $4, $5, $6, 1)`,
    [edicionId, versionId, nocheUno, especialidadId, filaId, rubroBateria],
  );
  await pool.query(
    `INSERT INTO asignacion_jurado (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [asignacionId, edicionId, jurado, nocheUno, especialidadId, admin],
  );
  await pool.query(
    "UPDATE version_reglamento SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = now() WHERE id = $1",
    [versionId, admin],
  );
  await pool.query(
    "UPDATE edicion SET estado = 'OPEN', abierta_por = $2, abierta_en = now() WHERE id = $1",
    [edicionId, admin],
  );
  await pool.query(
    "UPDATE version_reglamento SET estado = 'CONGELADA', congelada_en = now() WHERE id = $1",
    [versionId],
  );
  await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = now() WHERE id = $1", [nocheUno]);
  await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = now() WHERE id = $1", [nochePremiacion]);
  await pool.query(
    `INSERT INTO instantanea_planillas_esperadas (id, edicion_id, noche_id, version_id, congelada_en, filas_configuradas)
     VALUES ($1, $2, $3, $4, now(), true)`,
    [instantaneaId, edicionId, nocheUno, versionId],
  );
  await pool.query(
    `INSERT INTO instantanea_planilla_esperada_detalle (instantanea_id, edicion_id, noche_id, asignacion_id)
     VALUES ($1, $2, $3, $4)`,
    [instantaneaId, edicionId, nocheUno, asignacionId],
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO puntaje_recibido (planilla_id, fila_id, valor, no_presentado, autor_id) VALUES ($1, $2, 5, false, $3)",
      [planillaId, filaId, jurado],
    );
    await client.query(
      "INSERT INTO planilla_recibida (id, operation_id, asignacion_id, version_id, hash_contenido) VALUES ($1, $2, $3, $4, $5)",
      [planillaId, randomUUID(), asignacionId, versionId, "a".repeat(64)],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }

  return {
    edicionId, versionId, especialidadId, comparsaId, comparsaNoProgramada,
    rubroBateria, rubroNoEvaluable, nocheUno, nocheDraft, nochePremiacion,
  };
}

test("0027 enforces D14 penalty rules, ESCRIBANO role, append-only voiding, audit, freeze on CLOSED and full purge", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const ctx = await prepararEscenario(pool);

    // 1. RETRASO_INGRESO > 30 min -> capped at 30 min = 15.00 pts + cedio_turno = true
    const { rows: [pIngreso] } = await pool.query(
      `INSERT INTO penalizacion
         (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
          impide_premios_comparsa, motivo, referencia_acta, registrada_por)
       VALUES ($1, $2, $3, $4, 'RETRASO_INGRESO', 40, 15.00, true, false, 'Demora en ingreso', 'Acta 1', $5)
       RETURNING id, estado, puntos_descuento, cedio_turno, registrada_en`,
      [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaId, escribano],
    );
    assert.equal(pIngreso.estado, "ACTIVA");
    assert.equal(Number(pIngreso.puntos_descuento), 15);
    assert.equal(pIngreso.cedio_turno, true);

    // Wrong discount for RETRASO_INGRESO rejected by CHECK
    await assert.rejects(
      pool.query(
        `INSERT INTO penalizacion
           (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
            impide_premios_comparsa, motivo, referencia_acta, registrada_por)
         VALUES ($1, $2, $3, $4, 'RETRASO_INGRESO', 40, 20.00, true, false, 'Mal cálculo', 'Acta 2', $5)`,
        [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaId, escribano],
      ),
      { code: "23514" },
    );

    // 2. RETRASO_SALIDA -> 0.50/min, no cedio_turno
    await pool.query(
      `INSERT INTO penalizacion
         (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
          impide_premios_comparsa, motivo, referencia_acta, registrada_por)
       VALUES ($1, $2, $3, $4, 'RETRASO_SALIDA', 7, 3.50, false, false, 'Demora en salida', 'Acta 3', $5)`,
      [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaId, escribano],
    );

    // 3. EXCESO_SHOW_BATERIA -> requires evaluable rubro_version_id from active/frozen version
    await assert.rejects(
      pool.query(
        `INSERT INTO penalizacion
           (operation_id, edicion_id, noche_id, comparsa_id, rubro_version_id, tipo, minutos, puntos_descuento,
            cedio_turno, impide_premios_comparsa, motivo, referencia_acta, registrada_por)
         VALUES ($1, $2, $3, $4, $5, 'EXCESO_SHOW_BATERIA', 4, 2.00, false, false, 'Exceso', 'Acta 4', $6)`,
        [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaId, ctx.rubroNoEvaluable, escribano],
      ),
      { code: "23514", message: "RUBRO_PENALIZACION_INVALIDO" },
    );
    await pool.query(
      `INSERT INTO penalizacion
         (operation_id, edicion_id, noche_id, comparsa_id, rubro_version_id, tipo, minutos, puntos_descuento,
          cedio_turno, impide_premios_comparsa, motivo, referencia_acta, registrada_por)
       VALUES ($1, $2, $3, $4, $5, 'EXCESO_SHOW_BATERIA', 4, 2.00, false, false, 'Exceso batería', 'Acta 4', $6)`,
      [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaId, ctx.rubroBateria, escribano],
    );

    // 4. MINIMO_INTEGRANTES -> minutos NULL, 0.00 pts, impide_premios_comparsa = true
    const { rows: [pMin] } = await pool.query(
      `INSERT INTO penalizacion
         (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
          impide_premios_comparsa, motivo, referencia_acta, registrada_por)
       VALUES ($1, $2, $3, $4, 'MINIMO_INTEGRANTES', NULL, 0.00, false, true, 'Menos del mínimo', 'Acta 5', $5)
       RETURNING id`,
      [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaId, escribano],
    );

    // Reject non-ESCRIBANO, DRAFT night, PREMIACION night, unscheduled comparsa
    await assert.rejects(
      pool.query(
        `INSERT INTO penalizacion
           (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
            impide_premios_comparsa, motivo, referencia_acta, registrada_por)
         VALUES ($1, $2, $3, $4, 'MINIMO_INTEGRANTES', NULL, 0.00, false, true, 'Admin', 'Acta 6', $5)`,
        [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaId, admin],
      ),
      { code: "23514", message: "PENALIZACION_REQUIERE_ESCRIBANO" },
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO penalizacion
           (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
            impide_premios_comparsa, motivo, referencia_acta, registrada_por)
         VALUES ($1, $2, $3, $4, 'MINIMO_INTEGRANTES', NULL, 0.00, false, true, 'Draft', 'Acta 7', $5)`,
        [randomUUID(), ctx.edicionId, ctx.nocheDraft, ctx.comparsaId, escribano],
      ),
      { code: "23514", message: "NOCHE_NO_PENALIZABLE" },
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO penalizacion
           (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
            impide_premios_comparsa, motivo, referencia_acta, registrada_por)
         VALUES ($1, $2, $3, $4, 'MINIMO_INTEGRANTES', NULL, 0.00, false, true, 'Premiación', 'Acta 8', $5)`,
        [randomUUID(), ctx.edicionId, ctx.nochePremiacion, ctx.comparsaId, escribano],
      ),
      { code: "23514", message: "NOCHE_NO_PENALIZABLE" },
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO penalizacion
           (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
            impide_premios_comparsa, motivo, referencia_acta, registrada_por)
         VALUES ($1, $2, $3, $4, 'MINIMO_INTEGRANTES', NULL, 0.00, false, true, 'No programada', 'Acta 9', $5)`,
        [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaNoProgramada, escribano],
      ),
      { code: "23514", message: "COMPARSA_NO_PROGRAMADA_EN_NOCHE" },
    );

    // Append-only: cannot edit original fields, DELETE, or TRUNCATE directly
    await assert.rejects(
      pool.query("UPDATE penalizacion SET motivo = 'Editado' WHERE id = $1", [pIngreso.id]),
      { code: "23514", message: "PENALIZACION_INMODIFICABLE" },
    );
    await assert.rejects(
      pool.query("DELETE FROM penalizacion WHERE id = $1", [pIngreso.id]),
      { code: "23514", message: "PENALIZACION_NO_BORRABLE" },
    );
    await assert.rejects(
      pool.query("TRUNCATE penalizacion"),
      { code: "23514", message: "PENALIZACION_NO_BORRABLE" },
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO penalizacion
           (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
            impide_premios_comparsa, motivo, referencia_acta, registrada_por)
         VALUES ($1, $2, $3, $4, 'RETRASO_SALIDA', 20000, 9999.00, false, false, 'Excesivo', 'Acta 9b', $5)`,
        [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaId, escribano],
      ),
      { code: "23514" },
    );

    // Close night -> penalties STILL allowed while edition is OPEN (until total closure)
    await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.nocheUno, escribano]);

    // Voiding requires ESCRIBANO and sets anulada_en + atomic audit
    await assert.rejects(
      pool.query(
        `UPDATE penalizacion SET estado = 'ANULADA', anulada_por = $2, motivo_anulacion = 'Error', referencia_acta_anulacion = 'Acta 10'
          WHERE id = $1`,
        [pMin.id, admin],
      ),
      { code: "23514", message: "PENALIZACION_REQUIERE_ESCRIBANO" },
    );
    const { rows: [anulada] } = await pool.query(
      `UPDATE penalizacion SET estado = 'ANULADA', anulada_por = $2, motivo_anulacion = 'Rectificada', referencia_acta_anulacion = 'Acta 10'
        WHERE id = $1 RETURNING estado, anulada_en`,
      [pMin.id, escribano],
    );
    assert.equal(anulada.estado, "ANULADA");
    assert.ok(anulada.anulada_en instanceof Date);

    // Cannot reactivate or mutate an already ANULADA penalty
    await assert.rejects(
      pool.query("UPDATE penalizacion SET estado = 'ACTIVA' WHERE id = $1", [pMin.id]),
      { code: "23514", message: "PENALIZACION_INMODIFICABLE" },
    );

    // Verify atomic audit rows
    const { rows: audits } = await pool.query(
      "SELECT operacion, count(*)::int AS n FROM auditoria WHERE entidad_tipo = 'penalizacion' AND edicion_id = $1 GROUP BY operacion ORDER BY operacion",
      [ctx.edicionId],
    );
    assert.deepEqual(audits, [
      { operacion: "penalizacion_anulada", n: 1 },
      { operacion: "penalizacion_registrada", n: 4 },
    ]);

    // Total closure freezes penalties (both INSERT and void UPDATE blocked with EDICION_CERRADA)
    await pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.edicionId, escribano]);
    await assert.rejects(
      pool.query(
        `INSERT INTO penalizacion
           (operation_id, edicion_id, noche_id, comparsa_id, tipo, minutos, puntos_descuento, cedio_turno,
            impide_premios_comparsa, motivo, referencia_acta, registrada_por)
         VALUES ($1, $2, $3, $4, 'RETRASO_SALIDA', 2, 1.00, false, false, 'Tarde', 'Acta 11', $5)`,
        [randomUUID(), ctx.edicionId, ctx.nocheUno, ctx.comparsaId, escribano],
      ),
      { code: "23514", message: "EDICION_CERRADA" },
    );
    await assert.rejects(
      pool.query(
        `UPDATE penalizacion SET estado = 'ANULADA', anulada_por = $2, motivo_anulacion = 'Tarde', referencia_acta_anulacion = 'Acta 12'
          WHERE id = $1`,
        [pIngreso.id, escribano],
      ),
      { code: "23514", message: "EDICION_CERRADA" },
    );

    // Full edition deletion (0025) purges penalizacion and its audit cleanly
    await pool.query("SELECT eliminar_edicion_completa($1::uuid, $2::text)", [ctx.edicionId, admin]);
    assert.equal((await pool.query("SELECT 1 FROM penalizacion WHERE edicion_id = $1", [ctx.edicionId])).rowCount, 0);
    assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE edicion_id = $1", [ctx.edicionId])).rowCount, 0);
  });
});

async function conApp(pool, run) {
  const app = express();
  const obtenerSesion = async (req) => {
    const id = req.get("x-usuario-prueba");
    return id ? { user: { id } } : null;
  };
  app.use("/api/escribano", crearRutasEscribano({ pool, obtenerSesion }));
  app.use(manejarErrores);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Escribano penalizaciones API enforces RBAC, D14 rules, idempotency, voiding and freeze on CLOSED", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const ctx = await prepararEscenario(pool);
    await conApp(pool, async (base) => {
      const pedir = (ruta, { actor, method = "GET", body, contentType } = {}) => fetch(new URL(ruta, base), {
        method,
        headers: {
          ...(actor && { "x-usuario-prueba": actor }),
          ...(contentType ? { "content-type": contentType } : body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
      });

      const rutaContexto = `/api/escribano/ediciones/${ctx.edicionId}/penalizaciones/contexto`;
      const rutaBase = `/api/escribano/ediciones/${ctx.edicionId}/penalizaciones`;

      // RBAC
      assert.equal((await pedir(rutaContexto)).status, 401);
      assert.equal((await pedir(rutaContexto, { actor: admin })).status, 403);
      assert.equal((await pedir(rutaContexto, { actor: jurado })).status, 403);
      assert.equal((await pedir(rutaBase, { actor: admin })).status, 403);
      assert.equal((await pedir(rutaBase, { actor: admin, method: "POST", body: { confirmar: true } })).status, 403);

      // Contexto returns only OPEN/CLOSED COMPETENCIA nights with SCHEDULED comparsas and evaluable rubros
      const resCtx = await pedir(rutaContexto, { actor: escribano });
      assert.equal(resCtx.status, 200);
      assert.equal(resCtx.headers.get("cache-control"), "no-store");
      const cuerpoCtx = await resCtx.json();
      assert.equal(cuerpoCtx.edicion.id, ctx.edicionId);
      assert.equal(cuerpoCtx.noches.length, 1);
      assert.equal(cuerpoCtx.noches[0].id, ctx.nocheUno);
      assert.deepEqual(cuerpoCtx.noches[0].comparsas.map((c) => c.id), [ctx.comparsaId]);
      assert.deepEqual(cuerpoCtx.rubros.map((r) => r.id), [ctx.rubroBateria]);

      // Missing confirmation rejected
      const sinConf = await pedir(rutaBase, {
        actor: escribano,
        method: "POST",
        body: {
          operationId: randomUUID(),
          nocheId: ctx.nocheUno,
          comparsaId: ctx.comparsaId,
          tipo: "MINIMO_INTEGRANTES",
          motivo: "Faltan integrantes",
          referenciaActa: "Acta 1",
        },
      });
      assert.equal(sinConf.status, 400);
      assert.equal((await sinConf.json()).error, "confirmacion_requerida");

      // Invalid payload rejected (EXCESO_SHOW_BATERIA without rubroVersionId)
      const sinRubro = await pedir(rutaBase, {
        actor: escribano,
        method: "POST",
        body: {
          operationId: randomUUID(),
          nocheId: ctx.nocheUno,
          comparsaId: ctx.comparsaId,
          tipo: "EXCESO_SHOW_BATERIA",
          minutos: 3,
          motivo: "Exceso",
          referenciaActa: "Acta 2",
          confirmar: true,
        },
      });
      assert.equal(sinRubro.status, 422);
      assert.equal((await sinRubro.json()).error, "penalizacion_invalida");

      // Register RETRASO_INGRESO > 30 min -> 201, capped 15.00 pts + cedioTurno = true
      const opIngreso = randomUUID();
      const payloadIngreso = {
        operationId: opIngreso,
        nocheId: ctx.nocheUno,
        comparsaId: ctx.comparsaId,
        tipo: "RETRASO_INGRESO",
        minutos: 35,
        motivo: "Falla en carroza",
        referenciaActa: "Acta Comisión N.º 12",
        confirmar: true,
      };
      const creada = await pedir(rutaBase, { actor: escribano, method: "POST", body: payloadIngreso });
      assert.equal(creada.status, 201);
      assert.equal(creada.headers.get("cache-control"), "no-store");
      const p1 = await creada.json();
      assert.equal(p1.estado, "ACTIVA");
      assert.equal(p1.puntosDescuento, 15);
      assert.equal(p1.cedioTurno, true);
      assert.equal(p1.impidePremiosComparsa, false);
      assert.equal(p1.anulacion, null);

      // Nonexistent edition on GET returns 404 with Cache-Control: no-store
      const edInexistente = await pedir(`/api/escribano/ediciones/${randomUUID()}/penalizaciones`, { actor: escribano });
      assert.equal(edInexistente.status, 404);
      assert.equal(edInexistente.headers.get("cache-control"), "no-store");

      // Nonexistent nocheId returns 404 noche_inexistente (not 400)
      const nocheInexistente = await pedir(rutaBase, {
        actor: escribano,
        method: "POST",
        body: {
          operationId: randomUUID(),
          nocheId: randomUUID(),
          comparsaId: ctx.comparsaId,
          tipo: "MINIMO_INTEGRANTES",
          motivo: "Sin noche",
          referenciaActa: "Acta 0",
          confirmar: true,
        },
      });
      assert.equal(nocheInexistente.status, 404);
      assert.equal((await nocheInexistente.json()).error, "noche_inexistente");

      // Idempotent retry returns 200 (even with uppercase edicionId in URL) and no extra audit row
      const repetida = await pedir(`/api/escribano/ediciones/${ctx.edicionId.toUpperCase()}/penalizaciones`, {
        actor: escribano, method: "POST", body: payloadIngreso,
      });
      assert.equal(repetida.status, 200);
      assert.deepEqual(await repetida.json(), p1);
      assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'penalizacion_registrada'")).rowCount, 1);

      // Same operationId with different payload -> 409 operacion_conflictiva
      const conflicto = await pedir(rutaBase, {
        actor: escribano, method: "POST", body: { ...payloadIngreso, minutos: 10 },
      });
      assert.equal(conflicto.status, 409);
      assert.equal((await conflicto.json()).error, "operacion_conflictiva");

      // Register EXCESO_SHOW_BATERIA & MINIMO_INTEGRANTES
      const resBat = await pedir(rutaBase, {
        actor: escribano,
        method: "POST",
        body: {
          operationId: randomUUID(),
          nocheId: ctx.nocheUno,
          comparsaId: ctx.comparsaId,
          rubroVersionId: ctx.rubroBateria,
          tipo: "EXCESO_SHOW_BATERIA",
          minutos: 5,
          motivo: "Excedió 5 minutos",
          referenciaActa: "Acta 13",
          confirmar: true,
        },
      });
      assert.equal(resBat.status, 201);
      const pBat = await resBat.json();
      assert.equal(pBat.puntosDescuento, 2.5);
      assert.equal(pBat.rubro.id, ctx.rubroBateria);

      // Void p1: requires confirmation, reason & act ref
      const rutaAnular = `${rutaBase}/${p1.id}/anular`;
      assert.equal((await pedir(rutaAnular, {
        actor: escribano, method: "POST", body: { motivoAnulacion: "Error", referenciaActaAnulacion: "Acta 14" },
      })).status, 400);
      assert.equal((await pedir(rutaAnular, {
        actor: escribano, method: "POST", body: { motivoAnulacion: " ", referenciaActaAnulacion: "Acta 14", confirmar: true },
      })).status, 400);
      assert.equal((await pedir(`${rutaBase}/no-uuid/anular`, {
        actor: escribano, method: "POST", body: { motivoAnulacion: "x", referenciaActaAnulacion: "y", confirmar: true },
      })).status, 404);

      const anulada = await pedir(rutaAnular, {
        actor: escribano,
        method: "POST",
        body: { motivoAnulacion: "Rectificada por comisión", referenciaActaAnulacion: "Acta 14", confirmar: true },
      });
      assert.equal(anulada.status, 200);
      const p1Anulada = await anulada.json();
      assert.equal(p1Anulada.estado, "ANULADA");
      assert.equal(p1Anulada.anulacion.motivo, "Rectificada por comisión");
      assert.equal(p1Anulada.anulacion.referenciaActa, "Acta 14");

      // Idempotent repeat of same void -> 200; different void reason -> 409 penalizacion_ya_anulada
      const anuladaRep = await pedir(rutaAnular, {
        actor: escribano,
        method: "POST",
        body: { motivoAnulacion: "Rectificada por comisión", referenciaActaAnulacion: "Acta 14", confirmar: true },
      });
      assert.equal(anuladaRep.status, 200);
      assert.deepEqual(await anuladaRep.json(), p1Anulada);
      assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'penalizacion_anulada'")).rowCount, 1);

      const anuladaConf = await pedir(rutaAnular, {
        actor: escribano,
        method: "POST",
        body: { motivoAnulacion: "Otro motivo", referenciaActaAnulacion: "Acta 15", confirmar: true },
      });
      assert.equal(anuladaConf.status, 409);
      assert.equal((await anuladaConf.json()).error, "penalizacion_ya_anulada");

      // Close night and then execute total closure -> penalties become read-only (409 edicion_cerrada)
      await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.nocheUno, escribano]);
      const cierreTotal = await pedir(`/api/escribano/ediciones/${ctx.edicionId}/cierre`, {
        actor: escribano, method: "POST", body: { confirmar: true },
      });
      assert.equal(cierreTotal.status, 200);

      const postCerrada = await pedir(rutaBase, {
        actor: escribano,
        method: "POST",
        body: {
          operationId: randomUUID(),
          nocheId: ctx.nocheUno,
          comparsaId: ctx.comparsaId,
          tipo: "RETRASO_SALIDA",
          minutos: 3,
          motivo: "Tarde",
          referenciaActa: "Acta 16",
          confirmar: true,
        },
      });
      assert.equal(postCerrada.status, 409);
      assert.equal((await postCerrada.json()).error, "edicion_cerrada");

      const anularCerrada = await pedir(`${rutaBase}/${pBat.id}/anular`, {
        actor: escribano,
        method: "POST",
        body: { motivoAnulacion: "Tarde", referenciaActaAnulacion: "Acta 17", confirmar: true },
      });
      assert.equal(anularCerrada.status, 409);
      assert.equal((await anularCerrada.json()).error, "edicion_cerrada");

      // GET list still works read-only after total closure
      const listaFinal = await pedir(rutaBase, { actor: escribano });
      assert.equal(listaFinal.status, 200);
      const { items } = await listaFinal.json();
      assert.equal(items.length, 2);
    });
  });
});

test("concurrent penalizacion registration vs duplicate operationId and total closure never deadlocks", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const ctx = await prepararEscenario(pool);
    await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.nocheUno, escribano]);

    await conApp(pool, async (base) => {
      const rutaBase = new URL(`/api/escribano/ediciones/${ctx.edicionId}/penalizaciones`, base);
      const rutaCierre = new URL(`/api/escribano/ediciones/${ctx.edicionId}/cierre`, base);

      // 1. Duplicate concurrent registration with same operationId
      const opId = randomUUID();
      const body = JSON.stringify({
        operationId: opId,
        nocheId: ctx.nocheUno,
        comparsaId: ctx.comparsaId,
        tipo: "RETRASO_SALIDA",
        minutos: 4,
        motivo: "Concurrente",
        referenciaActa: "Acta 20",
        confirmar: true,
      });
      const headers = { "x-usuario-prueba": escribano, "content-type": "application/json" };
      const [r1, r2] = await Promise.all([
        fetch(rutaBase, { method: "POST", headers, body }),
        fetch(rutaBase, { method: "POST", headers, body }),
      ]);
      assert.deepEqual([r1.status, r2.status].sort((a, b) => a - b), [200, 201]);
      assert.deepEqual(await r1.json(), await r2.json());

      // 2. Race new penalty vs total closure (zero deadlocks, mutually consistent)
      const body2 = JSON.stringify({
        operationId: randomUUID(),
        nocheId: ctx.nocheUno,
        comparsaId: ctx.comparsaId,
        tipo: "MINIMO_INTEGRANTES",
        motivo: "Carrera",
        referenciaActa: "Acta 21",
        confirmar: true,
      });
      const [resPen, resCierre] = await Promise.all([
        fetch(rutaBase, { method: "POST", headers, body: body2 }),
        fetch(rutaCierre, { method: "POST", headers, body: JSON.stringify({ confirmar: true }) }),
      ]);
      assert.equal(resCierre.status, 200);
      assert.ok([201, 409].includes(resPen.status));
      if (resPen.status === 409) {
        assert.equal((await resPen.json()).error, "edicion_cerrada");
      }
    });
  });
});

