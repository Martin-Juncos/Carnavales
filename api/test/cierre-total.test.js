import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminEdiciones } from "../src/admin-ediciones.js";
import { abrirEdicion } from "../src/apertura-edicion.js";
import { abrirNoche } from "../src/apertura-noche.js";
import { crearNoche } from "../src/configuracion-edicion.js";
import { listarEdiciones, retirarEdicion } from "../src/ediciones.js";
import { crearRutasEscribano } from "../src/escribano.js";
import { manejarErrores } from "../src/manejo-errores.js";
import { recibirPlanilla } from "../src/recepcion-planillas.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const escribano = "u-escribano";
const jurado = "u-jurado";

async function prepararActores(pool) {
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
}

async function prepararEdicionConNocheCerrada(pool) {
  await prepararActores(pool);
  const edicionId = randomUUID();
  const versionId = randomUUID();
  const especialidadId = randomUUID();
  const comparsaId = randomUUID();
  const sujetoId = randomUUID();
  const rubroId = randomUUID();
  const filaId = randomUUID();
  const nocheUno = randomUUID();
  const nocheShow = randomUUID();
  const asignacionId = randomUUID();
  const instantaneaId = randomUUID();
  const planillaId = randomUUID();
  const operationId = randomUUID();

  await pool.query(
    "INSERT INTO edicion (id, nombre, anio, estado, creada_por) VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2)",
    [edicionId, admin],
  );
  await pool.query(
    "INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por) VALUES ($1, $2, 1, 'BORRADOR', 'Base', $3)",
    [versionId, edicionId, admin],
  );
  await pool.query(
    "INSERT INTO especialidad (id, edicion_id, codigo, nombre, orden) VALUES ($1, $2, 'VEST', 'Vestuario', 1)",
    [especialidadId, edicionId],
  );
  await pool.query(
    "INSERT INTO comparsa (id, edicion_id, categoria, nombre) VALUES ($1, $2, 'PRIMERA', 'Aymara')",
    [comparsaId, edicionId],
  );
  await pool.query(
    "INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, nombre) VALUES ($1, $2, $3, 'CARRO', 'Carro 1')",
    [sujetoId, edicionId, comparsaId],
  );
  await pool.query(
    `INSERT INTO rubro_version (id, edicion_id, version_id, codigo, nombre, tipo_sujeto, tipo_rubro, orden, evaluable)
     VALUES ($1, $2, $3, 'R1', 'Impacto', 'CARRO', 'NOMINATIVO', 1, true)`,
    [rubroId, edicionId, versionId],
  );
  await pool.query(
    `INSERT INTO rubro_especialidad (edicion_id, rubro_version_id, especialidad_id)
     VALUES ($1, $2, $3)`,
    [edicionId, rubroId, especialidadId],
  );
  await pool.query(
    `INSERT INTO fila_planilla (id, edicion_id, especialidad_id, rubro_version_id, sujeto_id, orden, origen)
     VALUES ($1, $2, $3, $4, $5, 1, 'GENERADA')`,
    [filaId, edicionId, especialidadId, rubroId, sujetoId],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, cuenta_para_puntaje) VALUES
       ($1, $3, 1, 'Noche 1', 'COMPETENCIA', true),
       ($2, $3, 3, 'Cuarta noche', 'COMPETENCIA', false)`,
    [nocheUno, nocheShow, edicionId],
  );
  await pool.query(
    `INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion) VALUES
       ($1, $2, $4, 1),
       ($1, $3, $4, 1)`,
    [edicionId, nocheUno, nocheShow, comparsaId],
  );
  await pool.query(
    `INSERT INTO configuracion_planilla_noche (edicion_id, version_id, noche_id, especialidad_id)
     VALUES ($1, $2, $3, $4)`,
    [edicionId, versionId, nocheUno, especialidadId],
  );
  await pool.query(
    `INSERT INTO configuracion_planilla_noche_fila (edicion_id, version_id, noche_id, especialidad_id, fila_id, rubro_id, orden)
     VALUES ($1, $2, $3, $4, $5, $6, 1)`,
    [edicionId, versionId, nocheUno, especialidadId, filaId, rubroId],
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
  await pool.query(
    "UPDATE noche SET estado = 'OPEN', abierta_en = now() WHERE id = $1",
    [nocheUno],
  );
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
  const hash = createHash("sha256")
    .update(JSON.stringify([asignacionId, versionId, [{ filaId, valor: 5, noPresentado: false }]]))
    .digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO puntaje_recibido (planilla_id, fila_id, valor, no_presentado, autor_id)
       VALUES ($1, $2, 5, false, $3)`,
      [planillaId, filaId, jurado],
    );
    await client.query(
      `INSERT INTO planilla_recibida (id, operation_id, asignacion_id, version_id, hash_contenido)
       VALUES ($1, $2, $3, $4, $5)`,
      [planillaId, operationId, asignacionId, versionId, hash],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }

  return {
    edicionId, versionId, especialidadId, comparsaId, sujetoId, rubroId, filaId,
    nocheUno, nocheShow, asignacionId, planillaId, operationId,
  };
}

test("0026 enforces total-closure readiness, role, audit, irreversibility, operational freeze and purge compatibility", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const ctx = await prepararEdicionConNocheCerrada(pool);
    const motivo = async (id = ctx.edicionId) => (await pool.query(
      "SELECT motivo_bloqueo_cierre_total($1) AS motivo", [id],
    )).rows[0].motivo;

    // Missing edition
    assert.equal(await motivo(randomUUID()), "edicion_inexistente");

    // Cannot INSERT an edition already CLOSED
    await assert.rejects(
      pool.query(
        "INSERT INTO edicion (nombre, anio, estado, creada_por, abierta_en, cerrada_por, cerrada_en) VALUES ('X', 2030, 'CLOSED', $1, now(), $2, now())",
        [admin, escribano],
      ),
      { code: "23514", message: "EDICION_NO_CREABLE_CERRADA" },
    );

    // Separate CONFIGURING edition reports edicion_no_abierta
    const edConfig = randomUUID();
    await pool.query(
      "INSERT INTO edicion (id, nombre, anio, estado, creada_por) VALUES ($1, 'Config', 2028, 'CONFIGURING', $2)",
      [edConfig, admin],
    );
    assert.equal(await motivo(edConfig), "edicion_no_abierta");

    // OPEN edition without scoring competitive nights reports sin_noches_puntuables
    const edSinNoches = randomUUID();
    await pool.query(
      "INSERT INTO edicion (id, nombre, anio, estado, creada_por) VALUES ($1, 'Sin noches', 2029, 'CONFIGURING', $2)",
      [edSinNoches, admin],
    );
    await pool.query("UPDATE edicion SET estado = 'OPEN', abierta_por = $2, abierta_en = now() WHERE id = $1", [edSinNoches, admin]);
    await pool.query(
      "INSERT INTO noche (edicion_id, orden, nombre, tipo, cuenta_para_puntaje) VALUES ($1, 1, 'Premiación', 'PREMIACION', false), ($1, 2, 'Show', 'COMPETENCIA', false)",
      [edSinNoches],
    );
    assert.equal(await motivo(edSinNoches), "sin_noches_puntuables");

    // Main edition has nocheUno OPEN -> noches_en_votacion
    assert.equal(await motivo(), "noches_en_votacion");
    await assert.rejects(
      pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.edicionId, escribano]),
      { code: "23514", message: "CIERRE_TOTAL_BLOQUEADO" },
    );

    // Close nocheUno; add a second scoring night in DRAFT -> noches_puntuables_pendientes
    await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.nocheUno, escribano]);
    const nocheDos = randomUUID();
    await pool.query(
      "INSERT INTO noche (id, edicion_id, orden, nombre, tipo, cuenta_para_puntaje) VALUES ($1, $2, 2, 'Noche 2', 'COMPETENCIA', true)",
      [nocheDos, ctx.edicionId],
    );
    assert.equal(await motivo(), "noches_puntuables_pendientes");
    await pool.query("DELETE FROM noche WHERE id = $1", [nocheDos]);

    // Add PREMIACION (OPEN) while non-scoring COMPETENCIA (ctx.nocheShow) is DRAFT -> allowed
    const premiacion = randomUUID();
    const show = ctx.nocheShow;
    await pool.query(
      "INSERT INTO noche (id, edicion_id, orden, nombre, tipo, cuenta_para_puntaje) VALUES ($1, $2, 2, 'Premiación', 'PREMIACION', false)",
      [premiacion, ctx.edicionId],
    );
    await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = now() WHERE id = $1", [premiacion]);
    assert.equal(await motivo(), null, "PREMIACION OPEN and non-scoring COMPETENCIA DRAFT must not block");

    // Non-scoring COMPETENCIA OPEN MUST block (D10: ninguna noche COMPETENCIA en OPEN)
    await pool.query(
      "INSERT INTO configuracion_planilla_noche (edicion_id, version_id, noche_id, especialidad_id) VALUES ($1, $2, $3, $4)",
      [ctx.edicionId, ctx.versionId, show, ctx.especialidadId],
    );
    await pool.query(
      "INSERT INTO configuracion_planilla_noche_fila (edicion_id, version_id, noche_id, especialidad_id, fila_id, rubro_id, orden) VALUES ($1, $2, $3, $4, $5, $6, 1)",
      [ctx.edicionId, ctx.versionId, show, ctx.especialidadId, ctx.filaId, ctx.rubroId],
    );
    const asigShow = randomUUID();
    await pool.query(
      "INSERT INTO asignacion_jurado (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por) VALUES ($1, $2, $3, $4, $5, $6)",
      [asigShow, ctx.edicionId, jurado, show, ctx.especialidadId, admin],
    );
    await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = now() WHERE id = $1", [show]);
    assert.equal(await motivo(), "noches_en_votacion");
    await pool.query(
      `INSERT INTO instantanea_planillas_esperadas (edicion_id, noche_id, version_id, congelada_en, filas_configuradas)
       VALUES ($1, $2, $3, now(), true)`,
      [ctx.edicionId, show, ctx.versionId],
    );
    await pool.query(
      `INSERT INTO instantanea_planilla_esperada_detalle (instantanea_id, edicion_id, noche_id, asignacion_id)
       SELECT id, $1, $2, $3 FROM instantanea_planillas_esperadas WHERE noche_id = $2`,
      [ctx.edicionId, show, asigShow],
    );
    const planillaShow = randomUUID();
    const clientShow = await pool.connect();
    try {
      await clientShow.query("BEGIN");
      await clientShow.query(
        "INSERT INTO puntaje_recibido (planilla_id, fila_id, valor, no_presentado, autor_id) VALUES ($1, $2, 4, false, $3)",
        [planillaShow, ctx.filaId, jurado],
      );
      await clientShow.query(
        "INSERT INTO planilla_recibida (id, operation_id, asignacion_id, version_id, hash_contenido) VALUES ($1, $2, $3, $4, $5)",
        [planillaShow, randomUUID(), asigShow, ctx.versionId, "b".repeat(64)],
      );
      await clientShow.query("COMMIT");
    } finally {
      clientShow.release();
    }
    await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [show, escribano]);
    assert.equal(await motivo(), null);

    // Non-ESCRIBANO actor rejected
    await assert.rejects(
      pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.edicionId, admin]),
      { code: "23514", message: "CIERRE_REQUIERE_ESCRIBANO" },
    );

    // Valid total closure by ESCRIBANO
    const { rows: [cerrada] } = await pool.query(
      "UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1 RETURNING estado, abierta_en, cerrada_por, cerrada_en",
      [ctx.edicionId, escribano],
    );
    assert.equal(cerrada.estado, "CLOSED");
    assert.equal(cerrada.cerrada_por, escribano);
    assert.ok(cerrada.abierta_en instanceof Date);
    assert.ok(cerrada.cerrada_en instanceof Date);
    assert.equal(await motivo(), "edicion_cerrada");

    // Atomic audit entry with edicion_id
    const { rows: audit } = await pool.query(
      "SELECT actor_id, operacion, entidad_tipo, entidad_id, edicion_id FROM auditoria WHERE operacion = 'votacion_cerrada'",
    );
    assert.equal(audit.length, 1);
    assert.deepEqual(audit[0], {
      actor_id: escribano,
      operacion: "votacion_cerrada",
      entidad_tipo: "edicion",
      entidad_id: ctx.edicionId,
      edicion_id: ctx.edicionId,
    });

    // Irreversible: cannot reopen, modify, or retire CLOSED edition
    await assert.rejects(
      pool.query("UPDATE edicion SET estado = 'OPEN' WHERE id = $1", [ctx.edicionId]),
      { code: "23514", message: "EDICION_CERRADA" },
    );
    await assert.rejects(
      pool.query("UPDATE edicion SET nombre = 'Otro' WHERE id = $1", [ctx.edicionId]),
      { code: "23514", message: "EDICION_CERRADA" },
    );
    await assert.rejects(
      pool.query("UPDATE edicion SET retirada_en = now(), retirada_por = $2 WHERE id = $1", [ctx.edicionId, admin]),
      { code: "23514", message: "EDICION_CERRADA" },
    );

    // Operational freeze after CLOSED
    await assert.rejects(
      pool.query("INSERT INTO noche (edicion_id, orden, nombre, tipo) VALUES ($1, 9, 'Extra', 'COMPETENCIA')", [ctx.edicionId]),
      { code: "23514", message: "EDICION_CERRADA" },
    );
    await assert.rejects(
      pool.query("UPDATE asignacion_jurado SET estado = 'REVOCADA', revocada_por = $2, revocada_en = now() WHERE id = $1", [ctx.asignacionId, admin]),
      { code: "23514", message: "EDICION_CERRADA" },
    );

    // Retired edition reports edicion_retirada and cannot transition to CLOSED
    await pool.query("UPDATE edicion SET retirada_en = now(), retirada_por = $2 WHERE id = $1", [edSinNoches, admin]);
    assert.equal(await motivo(edSinNoches), "edicion_retirada");
    await assert.rejects(
      pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [edSinNoches, escribano]),
      { code: "23514", message: "EDICION_RETIRADA" },
    );

    // Full-edition deletion (0025) still works cleanly on CLOSED edition and purges votacion_cerrada audit
    await pool.query("SELECT eliminar_edicion_completa($1::uuid, $2::text)", [ctx.edicionId, admin]);
    assert.equal((await pool.query("SELECT 1 FROM edicion WHERE id = $1", [ctx.edicionId])).rowCount, 0);
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
  app.use("/api/admin/ediciones", crearRutasAdminEdiciones({ pool, eliminacionPool: pool, obtenerSesion }));
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

test("Escribano total-closure API enforces RBAC, confirmation, idempotency, privacy, rollback and post-closure freeze", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const ctx = await prepararEdicionConNocheCerrada(pool);
    await conApp(pool, async (base) => {
      const pedir = (ruta, { actor, method = "GET", body, contentType } = {}) => fetch(new URL(ruta, base), {
        method,
        headers: {
          ...(actor && { "x-usuario-prueba": actor }),
          ...(contentType ? { "content-type": contentType } : body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
      });

      const rutaLista = "/api/escribano/ediciones";
      const rutaCierre = `/api/escribano/ediciones/${ctx.edicionId}/cierre`;

      // RBAC on list and closure endpoints
      assert.equal((await pedir(rutaLista)).status, 401);
      assert.equal((await pedir(rutaLista, { actor: admin })).status, 403);
      assert.equal((await pedir(rutaLista, { actor: jurado })).status, 403);
      assert.equal((await pedir(rutaCierre)).status, 401);
      assert.equal((await pedir(rutaCierre, { actor: admin })).status, 403);
      assert.equal((await pedir(rutaCierre, { actor: jurado, method: "POST", body: { confirmar: true } })).status, 403);

      // List editions (no scores, no counts, Cache-Control: no-store)
      const lista = await pedir(rutaLista, { actor: escribano });
      assert.equal(lista.status, 200);
      assert.equal(lista.headers.get("cache-control"), "no-store");
      assert.deepEqual(await lista.json(), {
        items: [{ id: ctx.edicionId, nombre: "Carnaval 2027", anio: 2027, estado: "OPEN", cerradaEn: null }],
      });

      // Invalid UUID & unknown edition (validarIdentificadores responds 404 edicion_inexistente)
      const uuidInvalido = await pedir("/api/escribano/ediciones/no-uuid/cierre", { actor: escribano });
      assert.equal(uuidInvalido.status, 404);
      assert.equal((await uuidInvalido.json()).error, "edicion_inexistente");
      assert.equal((await pedir(`/api/escribano/ediciones/${randomUUID()}/cierre`, { actor: escribano })).status, 404);
      assert.equal((await pedir(`/api/escribano/ediciones/${randomUUID()}/cierre`, {
        actor: escribano, method: "POST", body: { confirmar: true },
      })).status, 404);

      // Blocked while nocheUno is OPEN
      const bloqueada = await pedir(rutaCierre, { actor: escribano });
      assert.equal(bloqueada.status, 200);
      assert.equal(bloqueada.headers.get("cache-control"), "no-store");
      assert.deepEqual(await bloqueada.json(), {
        edicionId: ctx.edicionId, estado: "OPEN", puedeCerrar: false, motivo: "noches_en_votacion", cerradaEn: null,
      });
      const postBloqueado = await pedir(rutaCierre, { actor: escribano, method: "POST", body: { confirmar: true } });
      assert.equal(postBloqueado.status, 409);
      assert.deepEqual(await postBloqueado.json(), { error: "noches_en_votacion" });

      // Close nocheUno -> edition becomes ready (non-scoring nocheShow in DRAFT does not block)
      await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.nocheUno, escribano]);
      const listaParaCerrar = await pedir(rutaCierre, { actor: escribano });
      assert.equal(listaParaCerrar.status, 200);
      assert.deepEqual(await listaParaCerrar.json(), {
        edicionId: ctx.edicionId, estado: "OPEN", puedeCerrar: true, motivo: null, cerradaEn: null,
      });

      // Explicit JSON confirmation required
      for (const [body, contentType] of [
        [undefined, undefined], ["{}", "application/json"], ['{"confirmar":false}', "application/json"],
        ['{"confirmar":"true"}', "application/json"], ['{"confirmar":true}', "text/plain"],
      ]) {
        const res = await pedir(rutaCierre, { actor: escribano, method: "POST", body, contentType });
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), { error: "confirmacion_cierre_requerida" });
      }
      const malJson = await pedir(rutaCierre, { actor: escribano, method: "POST", body: '{"confirmar":true', contentType: "application/json" });
      assert.equal(malJson.status, 400);
      assert.equal((await malJson.json()).error, "campos_invalidos");

      // Audit failure rolls back the entire closure transaction
      await pool.query(`
        CREATE FUNCTION simular_fallo_auditoria_cierre_total() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'FALLO_AUDITORIA_TOTAL'; END; $$;
        CREATE TRIGGER z_simular_fallo_auditoria_cierre_total BEFORE INSERT ON auditoria
          FOR EACH ROW WHEN (NEW.operacion = 'votacion_cerrada')
          EXECUTE FUNCTION simular_fallo_auditoria_cierre_total();
      `);
      assert.equal((await pedir(rutaCierre, { actor: escribano, method: "POST", body: { confirmar: true } })).status, 500);
      assert.equal((await pool.query("SELECT estado FROM edicion WHERE id = $1", [ctx.edicionId])).rows[0].estado, "OPEN");
      assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'votacion_cerrada'")).rowCount, 0);
      await pool.query("DROP TRIGGER z_simular_fallo_auditoria_cierre_total ON auditoria; DROP FUNCTION simular_fallo_auditoria_cierre_total();");

      // Execute total closure
      const cierre = await pedir(rutaCierre, { actor: escribano, method: "POST", body: { confirmar: true } });
      assert.equal(cierre.status, 200);
      assert.equal(cierre.headers.get("cache-control"), "no-store");
      const cuerpoCierre = await cierre.json();
      assert.equal(cuerpoCierre.edicionId, ctx.edicionId);
      assert.equal(cuerpoCierre.estado, "CLOSED");
      assert.ok(typeof cuerpoCierre.cerradaEn === "string");
      assert.deepEqual(Object.keys(cuerpoCierre).sort(), ["cerradaEn", "edicionId", "estado"]);

      // Idempotent retry returns identical timestamp and does not duplicate audit
      const repetido = await pedir(rutaCierre, { actor: escribano, method: "POST", body: { confirmar: true } });
      assert.equal(repetido.status, 200);
      assert.deepEqual(await repetido.json(), cuerpoCierre);
      assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'votacion_cerrada'")).rowCount, 1);

      // GET readiness now reports edicion_cerrada with cerradaEn
      const postGet = await pedir(rutaCierre, { actor: escribano });
      assert.equal(postGet.status, 200);
      assert.deepEqual(await postGet.json(), {
        edicionId: ctx.edicionId, estado: "CLOSED", puedeCerrar: false, motivo: "edicion_cerrada", cerradaEn: cuerpoCierre.cerradaEn,
      });

      // Admin list reflects CLOSED + cerradaEn
      const ediciones = await listarEdiciones(pool);
      assert.equal(ediciones[0].estado, "CLOSED");
      assert.equal(ediciones[0].cerradaEn, cuerpoCierre.cerradaEn);

      // Operational routes reject mutations on CLOSED edition with 409 edicion_cerrada
      await assert.rejects(
        abrirEdicion(pool, { edicionId: ctx.edicionId, claveOperacion: randomUUID(), actorId: admin }),
        { codigo: "edicion_cerrada" },
      );
      await assert.rejects(
        abrirNoche(pool, { edicionId: ctx.edicionId, nocheId: ctx.nocheShow, claveOperacion: randomUUID(), actorId: admin }),
        { codigo: "edicion_cerrada" },
      );
      await assert.rejects(
        crearNoche(pool, { edicionId: ctx.edicionId, actorId: admin, datos: { nombre: "Extra", orden: 9, tipo: "COMPETENCIA" } }),
        { code: "23514", message: "EDICION_CERRADA" },
      );
      await assert.rejects(
        retirarEdicion(pool, { edicionId: ctx.edicionId, actorId: admin }),
        { code: "23514", message: "EDICION_CERRADA" },
      );
      const retiroHttp = await pedir(`/api/admin/ediciones/${ctx.edicionId}/retiro`, {
        actor: admin, method: "POST", body: { confirmar: true },
      });
      assert.equal(retiroHttp.status, 409);
      assert.equal((await retiroHttp.json()).error, "edicion_cerrada");

      // Idempotent historic ballot retry still succeeds; new submission is rejected
      const reenvio = await recibirPlanilla(pool, jurado, {
        operationId: ctx.operationId,
        asignacionId: ctx.asignacionId,
        versionId: ctx.versionId,
        puntajes: [{ filaId: ctx.filaId, valor: 5, noPresentado: false }],
      });
      assert.equal(reenvio.repetida, true);
      assert.equal(reenvio.acuse.operationId, ctx.operationId);

      await assert.rejects(
        recibirPlanilla(pool, jurado, {
          operationId: randomUUID(),
          asignacionId: ctx.asignacionId,
          versionId: ctx.versionId,
          puntajes: [{ filaId: ctx.filaId, valor: 5, noPresentado: false }],
        }),
        { codigo: "edicion_cerrada" },
      );

      // Admin full deletion still works on CLOSED edition
      const borrado = await pedir(`/api/admin/ediciones/${ctx.edicionId}`, {
        actor: admin, method: "DELETE", body: { confirmar: true },
      });
      assert.equal(borrado.status, 204);
    });
  });
});

test("concurrent total closure vs duplicate closure and night creation never deadlocks", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const ctx = await prepararEdicionConNocheCerrada(pool);
    await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.nocheUno, escribano]);

    await conApp(pool, async (base) => {
      const rutaCierre = new URL(`/api/escribano/ediciones/${ctx.edicionId}/cierre`, base);
      const cerrar = () => fetch(rutaCierre, {
        method: "POST",
        headers: { "x-usuario-prueba": escribano, "content-type": "application/json" },
        body: JSON.stringify({ confirmar: true }),
      });

      // Race total closure against creating a new scoring night
      const [resCierre, resNoche] = await Promise.all([
        cerrar(),
        crearNoche(pool, {
          edicionId: ctx.edicionId,
          actorId: admin,
          datos: { nombre: "Noche concurrente", orden: 5, tipo: "COMPETENCIA", cuentaParaPuntaje: true },
        }).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e })),
      ]);

      if (resCierre.status === 200) {
        assert.equal(resNoche.ok, false);
        assert.equal(resNoche.error.message, "EDICION_CERRADA");
      } else {
        assert.equal(resCierre.status, 409);
        assert.equal((await resCierre.json()).error, "noches_puntuables_pendientes");
        assert.equal(resNoche.ok, true);
        // Clean up the newly created night and race two concurrent closures
        await pool.query("DELETE FROM noche WHERE edicion_id = $1 AND orden = 5", [ctx.edicionId]);
      }

      const [a, b] = await Promise.all([cerrar(), cerrar()]);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.deepEqual(await a.json(), await b.json());
      assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'votacion_cerrada'")).rowCount, 1);
    });
  });
});

test("concurrent total closure vs retirement and full deletion never deadlocks", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const ctx = await prepararEdicionConNocheCerrada(pool);
    await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.nocheUno, escribano]);

    await conApp(pool, async (base) => {
      const rutaCierre = new URL(`/api/escribano/ediciones/${ctx.edicionId}/cierre`, base);
      const rutaRetiro = new URL(`/api/admin/ediciones/${ctx.edicionId}/retiro`, base);
      const rutaBorrar = new URL(`/api/admin/ediciones/${ctx.edicionId}`, base);

      // Race total closure vs retirement
      const [resCierre, resRetiro] = await Promise.all([
        fetch(rutaCierre, {
          method: "POST",
          headers: { "x-usuario-prueba": escribano, "content-type": "application/json" },
          body: JSON.stringify({ confirmar: true }),
        }),
        fetch(rutaRetiro, {
          method: "POST",
          headers: { "x-usuario-prueba": admin, "content-type": "application/json" },
          body: JSON.stringify({ confirmar: true }),
        }),
      ]);
      const statuses = [resCierre.status, resRetiro.status].sort((x, y) => x - y);
      assert.deepEqual(statuses, [200, 409]);

      // Race idempotent total closure vs full deletion
      const [resCierre2, resBorrar] = await Promise.all([
        fetch(rutaCierre, {
          method: "POST",
          headers: { "x-usuario-prueba": escribano, "content-type": "application/json" },
          body: JSON.stringify({ confirmar: true }),
        }),
        fetch(rutaBorrar, {
          method: "DELETE",
          headers: { "x-usuario-prueba": admin, "content-type": "application/json" },
          body: JSON.stringify({ confirmar: true }),
        }),
      ]);
      assert.equal(resBorrar.status, 204);
      assert.ok([200, 404, 409].includes(resCierre2.status));
    });
  });
});

