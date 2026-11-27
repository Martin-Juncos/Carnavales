import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasEscribano } from "../../../src/modules/escribano/escribano.routes.js";
import { crearRutasResultados } from "../../../src/modules/resultados/resultados.routes.js";
import { manejarErrores } from "../../../src/http/manejo-errores.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Integración de P6D: migración 0035 y API de actas oficiales. Requiere
// TEST_DATABASE_URL apuntando a una base PostgreSQL descartable; sin ella se omiten.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin-actas";
const escribano = "u-escribano-actas";
const escribano2 = "u-escribano2-actas";
const jurado = "u-jurado-actas";

function sha256(valor) {
  return createHash("sha256").update(valor).digest("hex");
}

function normalizarActa(acta) {
  return {
    ...acta,
    representaciones: [...acta.representaciones].sort((a, b) => a.formato.localeCompare(b.formato)),
  };
}

async function prepararActores(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES
       ($1, 'Admin', 'admin-actas@example.test', true),
       ($2, 'Escribano Uno', 'escribano-actas@example.test', true),
       ($3, 'Escribano Dos', 'escribano2-actas@example.test', true),
       ($4, 'Jurado', 'jurado-actas@example.test', true)`,
    [admin, escribano, escribano2, jurado],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, NULL, true FROM rol WHERE codigo = 'ADMINISTRADOR'`,
    [admin],
  );
  for (const [usuario, rol] of [[escribano, "ESCRIBANO"], [escribano2, "ESCRIBANO"], [jurado, "JURADO"]]) {
    await pool.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
       SELECT $1, id, $3, false FROM rol WHERE codigo = $2`,
      [usuario, rol, admin],
    );
  }
}

async function prepararEdicion(pool, { estado = "OPEN", anio = 2027 } = {}) {
  const edicionId = randomUUID();
  const versionId = randomUUID();
  const especialidadId = randomUUID();
  const c1 = randomUUID();
  const c2 = randomUUID();
  const s1 = randomUUID();
  const s2 = randomUUID();
  const rubroId = randomUUID();
  const nocheId = randomUUID();
  const filaId = randomUUID();
  const asignacionId = randomUUID();
  const instantaneaId = randomUUID();
  const planillaId = randomUUID();

  await pool.query(
    "INSERT INTO edicion (id, nombre, anio, estado, creada_por) VALUES ($1, 'Carnaval de prueba', $2, 'CONFIGURING', $3)",
    [edicionId, anio, admin],
  );
  await pool.query(
    `INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 1, 'BORRADOR', 'Base de prueba', $3)`,
    [versionId, edicionId, admin],
  );
  await pool.query(
    "INSERT INTO especialidad (id, edicion_id, codigo, nombre, orden) VALUES ($1, $2, 'J1', 'Vestuario', 1)",
    [especialidadId, edicionId],
  );
  await pool.query(
    `INSERT INTO comparsa (id, edicion_id, categoria, nombre)
     VALUES ($1, $3, 'PRIMERA', 'Aymara'), ($2, $3, 'PRIMERA', 'Poramba')`,
    [c1, c2, edicionId],
  );
  await pool.query(
    `INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, nombre)
     VALUES ($1, $3, $4, 'COMPARSA', 'Aymara'), ($2, $3, $5, 'COMPARSA', 'Poramba')`,
    [s1, s2, edicionId, c1, c2],
  );
  await pool.query(
    `INSERT INTO rubro_version
       (id, edicion_id, version_id, codigo, nombre, tipo_sujeto, tipo_rubro, orden, evaluable)
     VALUES ($1, $2, $3, 'R1', 'Desfile', 'COMPARSA', 'NOMINATIVO', 1, true)`,
    [rubroId, edicionId, versionId],
  );
  await pool.query(
    "INSERT INTO rubro_especialidad (edicion_id, rubro_version_id, especialidad_id) VALUES ($1, $2, $3)",
    [edicionId, rubroId, especialidadId],
  );
  await pool.query(
    `INSERT INTO fila_planilla (id, edicion_id, especialidad_id, rubro_version_id, sujeto_id, orden, origen)
     VALUES ($1, $2, $3, $4, $5, 1, 'GENERADA')`,
    [filaId, edicionId, especialidadId, rubroId, s1],
  );

  await pool.query(
    `UPDATE version_reglamento
        SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = now()
      WHERE id = $1`,
    [versionId, admin],
  );
  await pool.query("UPDATE version_reglamento SET estado = 'CONGELADA', congelada_en = now() WHERE id = $1", [versionId]);
  await pool.query(
    "UPDATE edicion SET estado = 'OPEN', abierta_por = $2, abierta_en = now() WHERE id = $1",
    [edicionId, admin],
  );
  await pool.query(
    "INSERT INTO noche (id, edicion_id, orden, nombre, tipo, cuenta_para_puntaje) VALUES ($1, $2, 1, 'Noche 1', 'COMPETENCIA', true)",
    [nocheId, edicionId],
  );
  await pool.query(
    `INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion)
     VALUES ($1, $2, $3, 1), ($1, $2, $4, 2)`,
    [edicionId, nocheId, c1, c2],
  );
  await pool.query(
    `INSERT INTO configuracion_planilla_noche (edicion_id, version_id, noche_id, especialidad_id)
     VALUES ($1, $2, $3, $4)`,
    [edicionId, versionId, nocheId, especialidadId],
  );
  await pool.query(
    `INSERT INTO configuracion_planilla_noche_fila
       (edicion_id, version_id, noche_id, especialidad_id, fila_id, rubro_id, orden)
     VALUES ($1, $2, $3, $4, $5, $6, 1)`,
    [edicionId, versionId, nocheId, especialidadId, filaId, rubroId],
  );
  await pool.query(
    `INSERT INTO asignacion_jurado (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [asignacionId, edicionId, jurado, nocheId, especialidadId, admin],
  );
  await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = now() WHERE id = $1", [nocheId]);
  await pool.query(
    `INSERT INTO instantanea_planillas_esperadas
       (id, edicion_id, noche_id, version_id, congelada_en, filas_configuradas)
     VALUES ($1, $2, $3, $4, now(), true)`,
    [instantaneaId, edicionId, nocheId, versionId],
  );
  await pool.query(
    `INSERT INTO instantanea_planilla_esperada_detalle (instantanea_id, edicion_id, noche_id, asignacion_id)
     VALUES ($1, $2, $3, $4)`,
    [instantaneaId, edicionId, nocheId, asignacionId],
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO puntaje_recibido (planilla_id, fila_id, valor, no_presentado, autor_id) VALUES ($1, $2, 5, false, $3)",
      [planillaId, filaId, jurado],
    );
    await client.query(
      `INSERT INTO planilla_recibida (id, operation_id, asignacion_id, version_id, hash_contenido)
       VALUES ($1, $2, $3, $4, $5)`,
      [planillaId, randomUUID(), asignacionId, versionId, "a".repeat(64)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [nocheId, escribano]);

  if (estado === "CLOSED") {
    await pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [edicionId, escribano]);
  }

  return { edicionId, versionId, c1, c2, s1, s2, rubroId, nocheId };
}

// Inserta un snapshot con detalle en una única transacción, como hace el motor.
async function crearSnapshot(pool, ctx, { publicado = true, numero = 1 } = {}) {
  const client = await pool.connect();
  let calculoId;
  try {
    await client.query("BEGIN");
    ({ rows: [{ id: calculoId }] } = await client.query(
      `INSERT INTO calculo_resultado
         (edicion_id, version_reglamento_id, numero, parametros, hash_entradas, calculado_por)
       VALUES ($1, $2, $3, '{}'::jsonb, $4, $5) RETURNING id`,
      [ctx.edicionId, ctx.versionId, numero, sha256(`entradas-${numero}`), escribano],
    ));
    await client.query(
      `INSERT INTO resultado_comparsa
         (calculo_id, edicion_id, comparsa_id, categoria, puntaje_fijos, puntaje_nominativos,
          puntaje_carros, descuento_rubros, descuento_general, puntaje_total, descalificada_comparsa,
          posicion, empatado, detalle)
       VALUES
         ($1, $2, $3, 'PRIMERA', 5, 0, 0, 0, 0, 5, false, 1, false, '{}'::jsonb),
         ($1, $2, $4, 'PRIMERA', 3, 0, 0, 0, 0, 3, false, 2, false, '{}'::jsonb)`,
      [calculoId, ctx.edicionId, ctx.c1, ctx.c2],
    );
    await client.query(
      `INSERT INTO resultado_rubro_sujeto
         (calculo_id, edicion_id, rubro_version_id, sujeto_id, comparsa_id,
          puntaje_artistico, descuento_rubro, puntaje_neto, posicion, empatado)
       VALUES
         ($1, $2, $3, $4, $6, 5, 0, 5, 1, false),
         ($1, $2, $3, $5, $7, 3, 0, 3, 2, false)`,
      [calculoId, ctx.edicionId, ctx.rubroId, ctx.s1, ctx.s2, ctx.c1, ctx.c2],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  if (publicado) {
    await pool.query(
      `UPDATE calculo_resultado
          SET estado = 'PUBLICADO', publicado_por = $2, publicado_en = now()
        WHERE id = $1`,
      [calculoId, escribano],
    );
  }
  return calculoId;
}

async function insertarActaDirecta(pool, ctx, calculoId, { operationId = randomUUID(), numero = 1, conDetalle = true } = {}) {
  const client = await pool.connect();
  let actaId;
  try {
    await client.query("BEGIN");
    ({ rows: [{ id: actaId }] } = await client.query(
      `INSERT INTO acta_resultado (edicion_id, calculo_id, numero, generada_por, operation_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ctx.edicionId, calculoId, numero, escribano, operationId],
    ));
    if (conDetalle) {
      for (const [formato, contenido, contentType] of [
        ["PDF", Buffer.from("%PDF-1.4 acta de prueba"), "application/pdf"],
        ["CSV", Buffer.from("\uFEFFActa,Aymara,5\n", "utf8"), "text/csv; charset=utf-8"],
      ]) {
        await client.query(
          `INSERT INTO acta_representacion
             (acta_id, edicion_id, formato, contenido, hash_sha256, tamanio_bytes, content_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [actaId, ctx.edicionId, formato, contenido, sha256(contenido), contenido.length, contentType],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return actaId;
}

// Las constraints de representación solo se pueden violar dentro de la misma
// transacción que crea el acta; fuera de ella el trigger de detalle lo bloquea.
async function insertarActaConRepresentaciones(pool, ctx, calculoId, numero, representaciones) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [{ id: actaId }] } = await client.query(
      `INSERT INTO acta_resultado (edicion_id, calculo_id, numero, generada_por, operation_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ctx.edicionId, calculoId, numero, escribano, randomUUID()],
    );
    for (const representacion of representaciones) {
      await client.query(
        `INSERT INTO acta_representacion
           (acta_id, edicion_id, formato, contenido, hash_sha256, tamanio_bytes, content_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          actaId,
          ctx.edicionId,
          representacion.formato,
          representacion.contenido,
          representacion.hash,
          representacion.contenido.length,
          representacion.contentType,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function conApp(pool, run) {
  const app = express();
  const obtenerSesion = async (request) => {
    const id = request.get("x-usuario-prueba");
    return id ? { user: { id } } : null;
  };
  app.use("/api/escribano", crearRutasEscribano({ pool, obtenerSesion }));
  app.use("/api/resultados", crearRutasResultados({ pool, obtenerSesion }));
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

function pedir(base, ruta, { actor, method = "GET", body } = {}) {
  return fetch(new URL(ruta, base), {
    method,
    headers: {
      ...(actor && { "x-usuario-prueba": actor }),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

test("0035: actas exigen edición CLOSED y ESCRIBANO, detalle atómico, inmutabilidad, formatos y purga", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await prepararActores(pool);
    const ctx = await prepararEdicion(pool, { estado: "OPEN" });

    // Edición aún abierta: el acta se rechaza antes de mirar el snapshot.
    await assert.rejects(
      insertarActaDirecta(pool, ctx, randomUUID()),
      { code: "23514", message: "ACTA_REQUIERE_EDICION_CERRADA" },
    );

    await pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.edicionId, escribano]);
    const calculoId = await crearSnapshot(pool, ctx);

    // Un ADMINISTRADOR nunca puede generar actas, ni siquiera en la base.
    await assert.rejects(
      (async () => {
        const client = await pool.connect();
        try {
          await client.query(
            `INSERT INTO acta_resultado (edicion_id, calculo_id, numero, generada_por, operation_id)
             VALUES ($1, $2, 1, $3, $4)`,
            [ctx.edicionId, calculoId, admin, randomUUID()],
          );
        } finally {
          client.release();
        }
      })(),
      { code: "23514", message: "ACTA_REQUIERE_ESCRIBANO" },
    );

    const actaId = await insertarActaDirecta(pool, ctx, calculoId);
    const { rows: [cabecera] } = await pool.query(
      "SELECT id, numero, generada_por, operation_id FROM acta_resultado WHERE id = $1",
      [actaId],
    );
    assert.equal(cabecera.numero, 1);
    assert.equal(cabecera.generada_por, escribano);
    assert.deepEqual(
      (await pool.query("SELECT formato, content_type FROM acta_representacion WHERE acta_id = $1 ORDER BY formato", [actaId])).rows,
      [
        { formato: "CSV", content_type: "text/csv; charset=utf-8" },
        { formato: "PDF", content_type: "application/pdf" },
      ],
    );

    const { rows: [auditoria] } = await pool.query(
      "SELECT 1 FROM auditoria WHERE operacion = 'acta_generada' AND entidad_id = $1 AND edicion_id = $2",
      [actaId, ctx.edicionId],
    );
    assert.ok(auditoria);

    // El detalle solo se inserta dentro de la transacción que creó la cabecera.
    const actaHuerfana = await insertarActaDirecta(pool, ctx, calculoId, { numero: 2, conDetalle: false });
    await assert.rejects(
      pool.query(
        `INSERT INTO acta_representacion
           (acta_id, edicion_id, formato, contenido, hash_sha256, tamanio_bytes, content_type)
         VALUES ($1, $2, 'PDF', $3, $4, $5, 'application/pdf')`,
        [actaHuerfana, ctx.edicionId, Buffer.from("pdf"), sha256("pdf"), 3],
      ),
      { code: "23514", message: "ACTA_INMODIFICABLE" },
    );

    // Formatos únicos y hash SHA-256 de 64 hexadecimales (en la transacción del acta).
    const pdf = { formato: "PDF", contenido: Buffer.from("pdf"), hash: sha256("pdf"), contentType: "application/pdf" };
    await assert.rejects(
      insertarActaConRepresentaciones(pool, ctx, calculoId, 3, [pdf, pdf]),
      { code: "23505" },
    );
    await assert.rejects(
      insertarActaConRepresentaciones(pool, ctx, calculoId, 4, [{
        formato: "CSV", contenido: Buffer.from("x"), hash: "no-es-un-hash", contentType: "text/csv; charset=utf-8",
      }]),
      { code: "23514" },
    );
    await assert.rejects(
      insertarActaConRepresentaciones(pool, ctx, calculoId, 5, [{
        formato: "CSV", contenido: Buffer.from("x"), hash: "a".repeat(63), contentType: "text/csv; charset=utf-8",
      }]),
      { code: "23514" },
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO acta_representacion
           (acta_id, edicion_id, formato, contenido, hash_sha256, tamanio_bytes, content_type)
         VALUES ($1, $2, 'PDF', $3, $4, $5, 'application/pdf')`,
        [actaId, ctx.edicionId, Buffer.from("pdf"), sha256("pdf"), 3],
      ),
      { code: "23514", message: "ACTA_INMODIFICABLE" },
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO acta_representacion
           (acta_id, edicion_id, formato, contenido, hash_sha256, tamanio_bytes, content_type)
         VALUES ($1, $2, 'CSV', $3, 'no-es-un-hash', $4, 'text/csv; charset=utf-8')`,
        [actaHuerfana, ctx.edicionId, Buffer.from("x"), 1],
      ),
      { code: "23514", message: "ACTA_INMODIFICABLE" },
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO acta_representacion
           (acta_id, edicion_id, formato, contenido, hash_sha256, tamanio_bytes, content_type)
         VALUES ($1, $2, 'CSV', $3, $4, $5, 'text/csv; charset=utf-8')`,
        [actaHuerfana, ctx.edicionId, Buffer.from("x"), "a".repeat(63), 1],
      ),
      { code: "23514", message: "ACTA_INMODIFICABLE" },
    );

    // Append-only: UPDATE, DELETE y TRUNCATE se rechazan en ambas tablas.
    for (const tabla of ["acta_resultado", "acta_representacion"]) {
      await assert.rejects(pool.query(`TRUNCATE ${tabla} CASCADE`), { code: "23514", message: "ACTA_INMODIFICABLE" });
    }
    await assert.rejects(
      pool.query("UPDATE acta_resultado SET numero = 9 WHERE id = $1", [actaId]),
      { code: "23514", message: "ACTA_INMODIFICABLE" },
    );
    await assert.rejects(
      pool.query("DELETE FROM acta_representacion WHERE acta_id = $1", [actaId]),
      { code: "23514", message: "ACTA_INMODIFICABLE" },
    );
    await assert.rejects(
      pool.query("DELETE FROM acta_resultado WHERE id = $1", [actaId]),
      { code: "23514", message: "ACTA_INMODIFICABLE" },
    );

    // Auditoría atribuible con certeza y registro ambiguo que debe conservarse.
    await pool.query(
      `INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id)
       VALUES ($1, 'acta_generada', 'acta_resultado', $2)`,
      [admin, actaId],
    );
    const ambigua = randomUUID();
    await pool.query(
      `INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id)
       VALUES ($1, 'revision_manual', 'usuario', $2)`,
      [admin, ambigua],
    );
    const otraEdicion = randomUUID();
    await pool.query(
      "INSERT INTO edicion (id, nombre, anio, estado, creada_por) VALUES ($1, 'Otra edición', 2028, 'CONFIGURING', $2)",
      [otraEdicion, admin],
    );
    await pool.query(
      `INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
       VALUES ($1, 'edicion_creada', 'edicion', $2::text, $2::uuid)`,
      [admin, otraEdicion],
    );

    await assert.rejects(
      pool.query("SELECT eliminar_edicion_completa($1::uuid, $2::text)", [ctx.edicionId, jurado]),
      { code: "23514", message: "ELIMINACION_REQUIERE_ADMINISTRADOR" },
    );
    await pool.query("SELECT eliminar_edicion_completa($1::uuid, $2::text)", [ctx.edicionId, admin]);

    for (const tabla of ["acta_resultado", "acta_representacion"]) {
      assert.equal((await pool.query(`SELECT 1 FROM ${tabla} WHERE edicion_id = $1`, [ctx.edicionId])).rowCount, 0);
    }
    assert.equal((await pool.query("SELECT 1 FROM edicion WHERE id = $1", [ctx.edicionId])).rowCount, 0);
    assert.equal((await pool.query("SELECT 1 FROM edicion WHERE id = $1", [otraEdicion])).rowCount, 1);
    assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE edicion_id = $1", [ctx.edicionId])).rowCount, 0);
    assert.equal(
      (await pool.query("SELECT 1 FROM auditoria WHERE entidad_id = $1", [actaId])).rowCount,
      0,
      "la auditoría atribuible al acta debe purgarse",
    );
    assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE entidad_id = $1", [ambigua])).rowCount, 1);
    assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE edicion_id = $1", [otraEdicion])).rowCount, 1);
  });
});

test("API de actas: RBAC, precondiciones, idempotencia, descarga, verificación y concurrencia", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await prepararActores(pool);
    const ctx = await prepararEdicion(pool, { estado: "OPEN" });
    const calculoFalso = randomUUID();
    const rutaGen = (calculoId) =>
      `/api/escribano/ediciones/${ctx.edicionId}/resultados/${calculoId}/actas`;
    const rutaListado = `/api/resultados/ediciones/${ctx.edicionId}/actas`;

    await conApp(pool, async (base) => {
      // RBAC de generación y de consulta.
      assert.equal((await pedir(base, rutaGen(calculoFalso), { method: "POST", body: { confirmar: true, operationId: randomUUID() } })).status, 401);
      assert.equal((await pedir(base, rutaGen(calculoFalso), { actor: jurado, method: "POST", body: { confirmar: true, operationId: randomUUID() } })).status, 403);
      assert.equal((await pedir(base, rutaGen(calculoFalso), { actor: admin, method: "POST", body: { confirmar: true, operationId: randomUUID() } })).status, 403);
      assert.equal((await pedir(base, rutaListado)).status, 401);
      assert.equal((await pedir(base, rutaListado, { actor: jurado })).status, 403);

      // Confirmación y operationId se validan antes que el estado de la edición.
      assert.equal((await pedir(base, rutaGen(calculoFalso), { actor: escribano, method: "POST", body: { operationId: randomUUID() } })).status, 400);
      const sinOperation = await pedir(base, rutaGen(calculoFalso), {
        actor: escribano, method: "POST", body: { confirmar: true, operationId: "no-uuid" },
      });
      assert.equal(sinOperation.status, 400);
      assert.equal((await sinOperation.json()).error, "operation_id_requerido");

      // Edición inexistente, retirada y abierta: 404/404/409.
      const edicionInexistente = randomUUID();
      assert.equal(
        (await pedir(base, `/api/escribano/ediciones/${edicionInexistente}/resultados/${calculoFalso}/actas`, {
          actor: escribano, method: "POST", body: { confirmar: true, operationId: randomUUID() },
        })).status,
        404,
      );
      const ctxRetirada = await prepararEdicion(pool, { estado: "OPEN", anio: 2028 });
      await pool.query(
        "UPDATE edicion SET retirada_en = now(), retirada_por = $2 WHERE id = $1",
        [ctxRetirada.edicionId, admin],
      );
      const retirada = await pedir(
        base,
        `/api/escribano/ediciones/${ctxRetirada.edicionId}/resultados/${calculoFalso}/actas`,
        { actor: escribano, method: "POST", body: { confirmar: true, operationId: randomUUID() } },
      );
      assert.equal(retirada.status, 404);
      assert.equal((await retirada.json()).error, "edicion_inexistente");
      assert.equal(
        (await pedir(base, `/api/resultados/ediciones/${ctxRetirada.edicionId}/actas`, { actor: escribano })).status,
        404,
      );

      const abierta = await pedir(base, rutaGen(calculoFalso), {
        actor: escribano, method: "POST", body: { confirmar: true, operationId: randomUUID() },
      });
      assert.equal(abierta.status, 409);
      assert.equal((await abierta.json()).error, "edicion_no_cerrada");

      // Cerrar la edición y crear dos snapshots: el 1 se publica, el 2 queda
      // CALCULADO para comprobar el bloqueo 409. La migración impide crear un
      // snapshot nuevo después de publicar, así que ambos se insertan antes.
      await pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.edicionId, escribano]);
      const calculoId = await crearSnapshot(pool, ctx, { publicado: false, numero: 1 });
      const calculoNoPublicado = await crearSnapshot(pool, ctx, { publicado: false, numero: 2 });
      await pool.query(
        `UPDATE calculo_resultado
            SET estado = 'PUBLICADO', publicado_por = $2, publicado_en = now()
          WHERE id = $1`,
        [calculoId, escribano],
      );

      const noPublicado = await pedir(base, rutaGen(calculoNoPublicado), {
        actor: escribano, method: "POST", body: { confirmar: true, operationId: randomUUID() },
      });
      assert.equal(noPublicado.status, 409);
      assert.equal((await noPublicado.json()).error, "resultado_no_publicado");
      const calculoInexistente = await pedir(base, rutaGen(randomUUID()), {
        actor: escribano, method: "POST", body: { confirmar: true, operationId: randomUUID() },
      });
      assert.equal(calculoInexistente.status, 404);
      assert.equal((await calculoInexistente.json()).error, "calculo_inexistente");

      // Generación 201 con PDF y CSV, sin bytes en la respuesta y sin configuración de premios.
      const operationId = randomUUID();
      const creada = await pedir(base, rutaGen(calculoId), {
        actor: escribano, method: "POST", body: { confirmar: true, operationId },
      });
      assert.equal(creada.status, 201, JSON.stringify(await creada.clone().json().catch(() => null)));
      assert.equal(creada.headers.get("cache-control"), "no-store");
      const acta = await creada.json();
      assert.equal(acta.edicionId, ctx.edicionId);
      assert.equal(acta.calculoId, calculoId);
      assert.equal(acta.numero, 1);
      assert.deepEqual(acta.representaciones.map((r) => r.formato).sort(), ["CSV", "PDF"]);
      for (const representacion of acta.representaciones) {
        assert.match(representacion.sha256, /^[0-9a-f]{64}$/);
        assert.equal(typeof representacion.tamanioBytes, "number");
        assert.ok(representacion.tamanioBytes > 0);
      }
      assert.equal((await pool.query("SELECT 1 FROM acta_resultado WHERE edicion_id = $1", [ctx.edicionId])).rowCount, 1);
      assert.equal((await pool.query("SELECT 1 FROM acta_representacion WHERE acta_id = $1", [acta.id])).rowCount, 2);
      assert.equal(
        (await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'acta_generada' AND entidad_id = $1", [acta.id])).rowCount,
        1,
      );

      // Reenvío idempotente: mismo actor, edición, cálculo y operationId -> 200 sin duplicar.
      const repetida = await pedir(base, rutaGen(calculoId), {
        actor: escribano, method: "POST", body: { confirmar: true, operationId },
      });
      assert.equal(repetida.status, 200);
      assert.deepEqual(normalizarActa(await repetida.json()), normalizarActa(acta));
      assert.equal((await pool.query("SELECT 1 FROM acta_resultado WHERE edicion_id = $1", [ctx.edicionId])).rowCount, 1);
      assert.equal(
        (await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'acta_generada' AND entidad_id = $1", [acta.id])).rowCount,
        1,
      );

      // La misma clave con otro actor o snapshot es conflicto y no filtra datos.
      const ajena = await pedir(base, rutaGen(calculoId), {
        actor: escribano2, method: "POST", body: { confirmar: true, operationId },
      });
      assert.equal(ajena.status, 409);
      const cuerpoAjeno = await ajena.json();
      assert.equal(cuerpoAjeno.error, "operacion_conflictiva");
      assert.equal(cuerpoAjeno.id, undefined);
      assert.equal(cuerpoAjeno.numero, undefined);
      assert.equal(cuerpoAjeno.representaciones, undefined);
      const otroCalculo = await pedir(base, rutaGen(calculoNoPublicado), {
        actor: escribano, method: "POST", body: { confirmar: true, operationId },
      });
      assert.equal(otroCalculo.status, 409);
      assert.equal((await otroCalculo.json()).error, "operacion_conflictiva");

      // Reintentos concurrentes con la misma clave convergen en un solo acta.
      const operationConcurrente = randomUUID();
      const respuestas = await Promise.all([1, 2, 3].map(() => pedir(base, rutaGen(calculoId), {
        actor: escribano, method: "POST", body: { confirmar: true, operationId: operationConcurrente },
      })));
      const resultados = await Promise.all(respuestas.map(async (respuesta) => ({
        status: respuesta.status,
        cuerpo: normalizarActa(await respuesta.json()),
      })));
      assert.deepEqual(resultados.map((resultado) => resultado.status).sort(), [200, 200, 201]);
      const nueva = resultados.find((resultado) => resultado.status === 201).cuerpo;
      assert.equal(nueva.numero, 2);
      assert.notEqual(nueva.id, acta.id);
      for (const { status, cuerpo } of resultados) {
        if (status === 200) assert.deepEqual(cuerpo, nueva);
      }
      assert.equal((await pool.query("SELECT 1 FROM acta_resultado WHERE edicion_id = $1", [ctx.edicionId])).rowCount, 2);
      assert.deepEqual(
        (await pool.query("SELECT numero FROM acta_resultado WHERE edicion_id = $1 ORDER BY numero", [ctx.edicionId])).rows.map((r) => r.numero),
        [1, 2],
      );

      // Listado para ambos roles autorizados, ordenado por versión descendente.
      for (const actor of [escribano, admin]) {
        const listado = await pedir(base, rutaListado, { actor });
        assert.equal(listado.status, 200);
        assert.equal(listado.headers.get("cache-control"), "no-store");
        const datos = await listado.json();
        assert.deepEqual(datos.items.map((item) => item.numero), [2, 1]);
        assert.deepEqual(normalizarActa(datos.items[0]), nueva);
      }

      // Descarga de bytes exactos con encabezados de tipo, nombre y hash.
      for (const [formato, extension, contentType] of [
        ["pdf", "pdf", "application/pdf"],
        ["csv", "csv", "text/csv; charset=utf-8"],
      ]) {
        const respuesta = await pedir(base, `${rutaListado}/${acta.id}/${formato}/descargar`, { actor: escribano });
        assert.equal(respuesta.status, 200);
        assert.equal(respuesta.headers.get("content-type"), contentType);
        assert.equal(
          respuesta.headers.get("content-disposition"),
          `attachment; filename="acta-${ctx.edicionId}-v1.${extension}"`,
        );
        const bytes = Buffer.from(await respuesta.arrayBuffer());
        const { rows: [guardada] } = await pool.query(
          "SELECT contenido, hash_sha256 FROM acta_representacion WHERE acta_id = $1 AND formato = $2",
          [acta.id, formato.toUpperCase()],
        );
        assert.deepEqual(bytes, guardada.contenido);
        assert.equal(respuesta.headers.get("x-acta-sha256"), guardada.hash_sha256);
        assert.match(guardada.hash_sha256, /^[0-9a-f]{64}$/);
        assert.equal(sha256(bytes), guardada.hash_sha256);

        const verificacion = await pedir(base, `${rutaListado}/${acta.id}/${formato}/verificar`, { actor: admin });
        assert.equal(verificacion.status, 200);
        assert.deepEqual(await verificacion.json(), {
          coincide: true,
          hashAlmacenado: guardada.hash_sha256,
          hashRecalculado: guardada.hash_sha256,
        });
      }

      // Formato inválido y acta inexistente.
      assert.equal(
        (await pedir(base, `${rutaListado}/${acta.id}/txt/descargar`, { actor: escribano })).status,
        400,
      );
      const formatoInvalido = await pedir(base, `${rutaListado}/${acta.id}/docx/verificar`, { actor: escribano });
      assert.equal(formatoInvalido.status, 400);
      assert.equal((await formatoInvalido.json()).error, "formato_invalido");
      const actaInexistente = randomUUID();
      assert.equal(
        (await pedir(base, `${rutaListado}/${actaInexistente}/pdf/descargar`, { actor: escribano })).status,
        404,
      );
      assert.equal(
        (await pedir(base, `${rutaListado}/${actaInexistente}/csv/verificar`, { actor: escribano })).status,
        404,
      );

      // Corrupción del hash almacenado: la verificación informa coincide:false.
      const { rows: [csvGuardado] } = await pool.query(
        "SELECT hash_sha256 FROM acta_representacion WHERE acta_id = $1 AND formato = 'CSV'",
        [acta.id],
      );
      await pool.query("ALTER TABLE acta_representacion DISABLE TRIGGER USER");
      try {
        await pool.query(
          "UPDATE acta_representacion SET hash_sha256 = $2 WHERE acta_id = $1 AND formato = 'CSV'",
          [acta.id, "0".repeat(64)],
        );
        const corrupta = await pedir(base, `${rutaListado}/${acta.id}/csv/verificar`, { actor: escribano });
        assert.equal(corrupta.status, 200);
        assert.deepEqual(await corrupta.json(), {
          coincide: false,
          hashAlmacenado: "0".repeat(64),
          hashRecalculado: csvGuardado.hash_sha256,
        });
      } finally {
        await pool.query(
          "UPDATE acta_representacion SET hash_sha256 = $2 WHERE acta_id = $1 AND formato = 'CSV'",
          [acta.id, csvGuardado.hash_sha256],
        );
        await pool.query("ALTER TABLE acta_representacion ENABLE TRIGGER USER");
      }
      const restaurada = await pedir(base, `${rutaListado}/${acta.id}/csv/verificar`, { actor: escribano });
      assert.equal((await restaurada.json()).coincide, true);
    });
  });
});
