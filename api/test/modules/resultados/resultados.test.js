import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasEscribano } from "../../../src/modules/escribano/escribano.routes.js";
import { manejarErrores } from "../../../src/http/manejo-errores.js";
import { crearRutasResultados } from "../../../src/modules/resultados/resultados.routes.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

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

async function prepararEdicionCerradaMinima(pool) {
  await prepararActores(pool);
  const edicionId = randomUUID();
  const versionId = randomUUID();
  const especialidadId = randomUUID();
  const c1 = randomUUID();
  const c2 = randomUUID();
  const s1 = randomUUID();
  const s2 = randomUUID();
  const rubroId = randomUUID();
  const f1 = randomUUID();
  const f2 = randomUUID();
  const nocheId = randomUUID();
  const asigId = randomUUID();
  const instId = randomUUID();
  const planillaId = randomUUID();

  await pool.query("INSERT INTO edicion (id, nombre, anio, estado, creada_por) VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2)", [edicionId, admin]);
  await pool.query("INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por) VALUES ($1, $2, 1, 'BORRADOR', 'Base', $3)", [versionId, edicionId, admin]);
  await pool.query("INSERT INTO especialidad (id, edicion_id, codigo, nombre, orden) VALUES ($1, $2, 'J1', 'Vestuario', 1)", [especialidadId, edicionId]);
  await pool.query(
    "INSERT INTO comparsa (id, edicion_id, categoria, nombre) VALUES ($1, $3, 'PRIMERA', 'Aymara'), ($2, $3, 'PRIMERA', 'Poramba')",
    [c1, c2, edicionId],
  );
  await pool.query(
    "INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, nombre) VALUES ($1, $3, $4, 'COMPARSA', 'Aymara'), ($2, $3, $5, 'COMPARSA', 'Poramba')",
    [s1, s2, edicionId, c1, c2],
  );
  await pool.query(
    "INSERT INTO rubro_version (id, edicion_id, version_id, codigo, nombre, tipo_sujeto, tipo_rubro, orden, evaluable) VALUES ($1, $2, $3, 'R1', 'Desfile', 'COMPARSA', 'NOMINATIVO', 1, true)",
    [rubroId, edicionId, versionId],
  );
  await pool.query("INSERT INTO rubro_especialidad (edicion_id, rubro_version_id, especialidad_id) VALUES ($1, $2, $3)", [edicionId, rubroId, especialidadId]);
  await pool.query(
    `INSERT INTO fila_planilla (id, edicion_id, especialidad_id, rubro_version_id, sujeto_id, orden, origen) VALUES
       ($1, $3, $4, $5, $6, 1, 'GENERADA'), ($2, $3, $4, $5, $7, 2, 'GENERADA')`,
    [f1, f2, edicionId, especialidadId, rubroId, s1, s2],
  );
  await pool.query("INSERT INTO noche (id, edicion_id, orden, nombre, tipo, cuenta_para_puntaje) VALUES ($1, $2, 1, 'Noche 1', 'COMPETENCIA', true)", [nocheId, edicionId]);
  await pool.query(
    "INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion) VALUES ($1, $2, $3, 1), ($1, $2, $4, 2)",
    [edicionId, nocheId, c1, c2],
  );
  await pool.query("INSERT INTO configuracion_planilla_noche (edicion_id, version_id, noche_id, especialidad_id) VALUES ($1, $2, $3, $4)", [edicionId, versionId, nocheId, especialidadId]);
  await pool.query(
    `INSERT INTO configuracion_planilla_noche_fila (edicion_id, version_id, noche_id, especialidad_id, fila_id, rubro_id, orden) VALUES
       ($1, $2, $3, $4, $5, $7, 1), ($1, $2, $3, $4, $6, $7, 2)`,
    [edicionId, versionId, nocheId, especialidadId, f1, f2, rubroId],
  );
  await pool.query(
    "INSERT INTO asignacion_jurado (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por) VALUES ($1, $2, $3, $4, $5, $6)",
    [asigId, edicionId, jurado, nocheId, especialidadId, admin],
  );
  await pool.query("UPDATE version_reglamento SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = now() WHERE id = $1", [versionId, admin]);
  await pool.query("UPDATE edicion SET estado = 'OPEN', abierta_por = $2, abierta_en = now() WHERE id = $1", [edicionId, admin]);
  await pool.query("UPDATE version_reglamento SET estado = 'CONGELADA', congelada_en = now() WHERE id = $1", [versionId]);
  await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = now() WHERE id = $1", [nocheId]);
  await pool.query(
    "INSERT INTO instantanea_planillas_esperadas (id, edicion_id, noche_id, version_id, congelada_en, filas_configuradas) VALUES ($1, $2, $3, $4, now(), true)",
    [instId, edicionId, nocheId, versionId],
  );
  await pool.query(
    "INSERT INTO instantanea_planilla_esperada_detalle (instantanea_id, edicion_id, noche_id, asignacion_id) VALUES ($1, $2, $3, $4)",
    [instId, edicionId, nocheId, asigId],
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO puntaje_recibido (planilla_id, fila_id, valor, no_presentado, autor_id) VALUES ($1, $2, 5, false, $4), ($1, $3, 5, false, $4)",
      [planillaId, f1, f2, jurado],
    );
    await client.query(
      "INSERT INTO planilla_recibida (id, operation_id, asignacion_id, version_id, hash_contenido) VALUES ($1, $2, $3, $4, $5)",
      [planillaId, randomUUID(), asigId, versionId, "a".repeat(64)],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [nocheId, escribano]);
  return { edicionId, versionId, c1, c2, s1, s2, rubroId, nocheId };
}

test("0028 enforces CLOSED guard, ESCRIBANO role, tie-break publication blocker, append-only/TRUNCATE, audit and purge", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const ctx = await prepararEdicionCerradaMinima(pool);
    const hash = "c".repeat(64);

    // Blocked while edition is still OPEN
    await assert.rejects(
      pool.query(
        `INSERT INTO calculo_resultado (edicion_id, version_reglamento_id, numero, parametros, hash_entradas, calculado_por)
         VALUES ($1, $2, 1, '{"maxCarrosComparsa":2}'::jsonb, $3, $4)`,
        [ctx.edicionId, ctx.versionId, hash, escribano],
      ),
      { code: "23514", message: "EDICION_NO_CERRADA" },
    );

    // Close edition
    await pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.edicionId, escribano]);

    // Non-ESCRIBANO rejected
    await assert.rejects(
      pool.query(
        `INSERT INTO calculo_resultado (edicion_id, version_reglamento_id, numero, parametros, hash_entradas, calculado_por)
         VALUES ($1, $2, 1, '{"maxCarrosComparsa":2}'::jsonb, $3, $4)`,
        [ctx.edicionId, ctx.versionId, hash, admin],
      ),
      { code: "23514", message: "RESULTADO_REQUIERE_ESCRIBANO" },
    );

    // Insert snapshot 1 + its details atomically, as the calculation engine does.
    const client = await pool.connect();
    let calc1;
    let empate;
    try {
      await client.query("BEGIN");
      ({ rows: [calc1] } = await client.query(
        `INSERT INTO calculo_resultado (edicion_id, version_reglamento_id, numero, parametros, hash_entradas, calculado_por)
         VALUES ($1, $2, 1, '{"maxCarrosComparsa":2}'::jsonb, $3, $4) RETURNING id, estado, calculado_en`,
        [ctx.edicionId, ctx.versionId, hash, escribano],
      ));
      assert.equal(calc1.estado, "CALCULADO");

      await client.query(
        `INSERT INTO resultado_comparsa
           (calculo_id, edicion_id, comparsa_id, categoria, puntaje_fijos, puntaje_nominativos, puntaje_carros,
            descuento_rubros, descuento_general, puntaje_total, descalificada_comparsa, posicion, empatado, detalle)
         VALUES
           ($1, $2, $3, 'PRIMERA', 0, 5, 0, 0, 0, 5, false, 1, true, '{}'::jsonb),
           ($1, $2, $4, 'PRIMERA', 0, 5, 0, 0, 0, 5, false, 1, true, '{}'::jsonb)`,
        [calc1.id, ctx.edicionId, ctx.c1, ctx.c2],
      );
      await client.query(
        `INSERT INTO resultado_rubro_sujeto
           (calculo_id, edicion_id, rubro_version_id, sujeto_id, comparsa_id, puntaje_artistico, descuento_rubro, puntaje_neto, posicion, empatado)
         VALUES
           ($1, $2, $3, $4, $6, 5, 0, 5, 1, true),
           ($1, $2, $3, $5, $7, 5, 0, 5, 1, true)`,
        [calc1.id, ctx.edicionId, ctx.rubroId, ctx.s1, ctx.s2, ctx.c1, ctx.c2],
      );
      ({ rows: [empate] } = await client.query(
        `INSERT INTO empate_resultado
           (calculo_id, edicion_id, ambito, posicion_empatada, puntaje_empatado, candidatos_ids)
         VALUES ($1, $2, 'COMPARSA', 1, 5.00, ARRAY[$3::uuid, $4::uuid]) RETURNING id`,
        [calc1.id, ctx.edicionId, ctx.c1, ctx.c2],
      ));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    // Publication blocked while tie is PENDIENTE
    await assert.rejects(
      pool.query("UPDATE calculo_resultado SET estado = 'PUBLICADO', publicado_por = $2 WHERE id = $1", [calc1.id, escribano]),
      { code: "23514", message: "EMPATES_PENDIENTES" },
    );

    // Tie winner must be in candidatos_ids and actor must be ESCRIBANO
    await assert.rejects(
      pool.query(
        `UPDATE empate_resultado SET estado = 'RESUELTO', ganador_comparsa_id = $2,
                motivo_resolucion = 'Acta', referencia_acta = 'Acta 1', resuelto_por = $3 WHERE id = $1`,
        [empate.id, ctx.c1, admin],
      ),
      { code: "23514", message: "RESULTADO_REQUIERE_ESCRIBANO" },
    );
    await assert.rejects(
      pool.query(
        `UPDATE empate_resultado SET estado = 'RESUELTO', ganador_comparsa_id = $2,
                motivo_resolucion = 'Acta', referencia_acta = 'Acta 1', resuelto_por = $3 WHERE id = $1`,
        [empate.id, randomUUID(), escribano],
      ),
      { code: "23514" },
    );

    // Resolve tie legitimately
    await pool.query(
      `UPDATE empate_resultado SET estado = 'RESUELTO', ganador_comparsa_id = $2,
              motivo_resolucion = 'Sorteo ante escribano', referencia_acta = 'Acta 50', resuelto_por = $3 WHERE id = $1`,
      [empate.id, ctx.c1, escribano],
    );

    // Cannot re-mutate resolved tie
    await assert.rejects(
      pool.query("UPDATE empate_resultado SET motivo_resolucion = 'Otro' WHERE id = $1", [empate.id]),
      { code: "23514", message: "EMPATE_INMODIFICABLE" },
    );

    // Now publication succeeds
    const { rows: [pub] } = await pool.query(
      "UPDATE calculo_resultado SET estado = 'PUBLICADO', publicado_por = $2 WHERE id = $1 RETURNING estado, publicado_en",
      [calc1.id, escribano],
    );
    assert.equal(pub.estado, "PUBLICADO");
    assert.ok(pub.publicado_en instanceof Date);

    // Cannot create a new snapshot after publication
    await assert.rejects(
      pool.query(
        `INSERT INTO calculo_resultado (edicion_id, version_reglamento_id, numero, parametros, hash_entradas, calculado_por)
         VALUES ($1, $2, 2, '{"maxCarrosComparsa":2}'::jsonb, $3, $4)`,
        [ctx.edicionId, ctx.versionId, hash, escribano],
      ),
      { code: "23514", message: "RESULTADO_YA_PUBLICADO" },
    );

    // Append-only DELETE and TRUNCATE blocked on all 4 tables
    for (const tabla of ["calculo_resultado", "resultado_comparsa", "resultado_rubro_sujeto", "empate_resultado"]) {
      await assert.rejects(pool.query(`TRUNCATE ${tabla} CASCADE`), { code: "23514", message: "RESULTADO_INMODIFICABLE" });
    }
    await assert.rejects(
      pool.query("UPDATE resultado_comparsa SET puntaje_total = 99 WHERE calculo_id = $1", [calc1.id]),
      { code: "23514", message: "RESULTADO_INMODIFICABLE" },
    );

    // Atomic audit entries
    const { rows: audits } = await pool.query(
      `SELECT operacion, count(*)::int AS n FROM auditoria
        WHERE edicion_id = $1 AND operacion IN ('resultado_calculado', 'empate_resuelto', 'resultado_publicado')
        GROUP BY operacion ORDER BY operacion`,
      [ctx.edicionId],
    );
    assert.deepEqual(audits, [
      { operacion: "empate_resuelto", n: 1 },
      { operacion: "resultado_calculado", n: 1 },
      { operacion: "resultado_publicado", n: 1 },
    ]);

    // Full edition deletion (0025) purges all 4 tables and their audits cleanly
    await pool.query("SELECT eliminar_edicion_completa($1::uuid, $2::text)", [ctx.edicionId, admin]);
    assert.equal((await pool.query("SELECT 1 FROM calculo_resultado WHERE edicion_id = $1", [ctx.edicionId])).rowCount, 0);
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

test("results API enforces D15 privacy before closure, RBAC, tie-break resolution, publication and concurrency", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const ctx = await prepararEdicionCerradaMinima(pool);
    await conApp(pool, async (base) => {
      const pedir = (ruta, { actor, method = "GET", body } = {}) => fetch(new URL(ruta, base), {
        method,
        headers: {
          ...(actor && { "x-usuario-prueba": actor }),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      const rutaRes = `/api/resultados/ediciones/${ctx.edicionId}`;
      const rutaPuntajes = `/api/resultados/ediciones/${ctx.edicionId}/puntajes`;
      const rutaCalc = `/api/escribano/ediciones/${ctx.edicionId}/resultados/calcular`;

      // Before total closure: D15 blocks ALL score/result access & calculation
      assert.equal((await pedir(rutaRes)).status, 401);
      assert.equal((await pedir(rutaRes, { actor: jurado })).status, 403);
      assert.equal((await pedir(rutaPuntajes, { actor: jurado })).status, 403);
      assert.equal((await pedir(rutaRes, { actor: escribano })).status, 409);
      assert.equal((await pedir(rutaRes, { actor: admin })).status, 409);
      assert.equal((await pedir(rutaPuntajes, { actor: admin })).status, 409);
      assert.equal((await pedir(rutaCalc, { actor: escribano, method: "POST", body: { confirmar: true } })).status, 409);

      // Close edition
      await pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [ctx.edicionId, escribano]);

      // RBAC post-closure: JURADO still 403; ADMIN cannot calculate (403) but can read (200)
      assert.equal((await pedir(rutaRes, { actor: jurado })).status, 403);
      assert.equal((await pedir(rutaPuntajes, { actor: jurado })).status, 403);
      assert.equal((await pedir(rutaCalc, { actor: admin, method: "POST", body: { confirmar: true } })).status, 403);
      assert.equal((await pedir(rutaCalc, { actor: escribano, method: "POST", body: {} })).status, 400);

      // Concurrent calculations serialize cleanly into snapshot 1 and snapshot 2 (both tied 5-5 on comparsa & rubro)
      const [cA, cB] = await Promise.all([
        pedir(rutaCalc, { actor: escribano, method: "POST", body: { confirmar: true } }),
        pedir(rutaCalc, { actor: escribano, method: "POST", body: { confirmar: true } }),
      ]);
      assert.equal(cA.status, 201);
      assert.equal(cB.status, 201);
      const snapA = await cA.json();
      const snapB = await cB.json();
      assert.deepEqual([snapA.numero, snapB.numero].sort((x, y) => x - y), [1, 2]);
      const snap = snapA.numero === 2 ? snapA : snapB;
      assert.equal(snap.empates.length, 2); // 1 COMPARSA tie + 1 RUBRO tie

      // Publication blocked while ties pending
      const rutaPub = `/api/escribano/ediciones/${ctx.edicionId}/resultados/${snap.id}/publicar`;
      const pubBloq = await pedir(rutaPub, { actor: escribano, method: "POST", body: { confirmar: true } });
      assert.equal(pubBloq.status, 409);
      assert.equal((await pubBloq.json()).error, "empates_pendientes");

      // Resolve both ties (including idempotent repeat + mismatch conflict)
      for (const empate of snap.empates) {
        const rutaEmp = `/api/escribano/ediciones/${ctx.edicionId}/resultados/${snap.id}/empates/${empate.id}/resolver`;
        const ganadorId = empate.candidatos[0].id;
        assert.equal((await pedir(rutaEmp, { actor: admin, method: "POST", body: { ganadorId, motivoResolucion: "x", referenciaActa: "a", confirmar: true } })).status, 403);
        const r1 = await pedir(rutaEmp, {
          actor: escribano, method: "POST",
          body: { ganadorId, motivoResolucion: "Resolución oficial", referenciaActa: "Acta 80", confirmar: true },
        });
        assert.equal(r1.status, 200);
        const empRes = await r1.json();
        assert.equal(empRes.estado, "RESUELTO");

        // Idempotent repeat -> 200
        const r2 = await pedir(rutaEmp, {
          actor: escribano, method: "POST",
          body: { ganadorId, motivoResolucion: "Resolución oficial", referenciaActa: "Acta 80", confirmar: true },
        });
        assert.equal(r2.status, 200);
        assert.deepEqual(await r2.json(), empRes);

        // Mismatch repeat -> 409 empate_ya_resuelto
        const r3 = await pedir(rutaEmp, {
          actor: escribano, method: "POST",
          body: { ganadorId, motivoResolucion: "Otro", referenciaActa: "Acta 81", confirmar: true },
        });
        assert.equal(r3.status, 409);
        assert.equal((await r3.json()).error, "empate_ya_resuelto");
      }

      // Concurrent publish on ready snapshot -> both 200 idempotent, single audit row
      const [pA, pB] = await Promise.all([
        pedir(rutaPub, { actor: escribano, method: "POST", body: { confirmar: true } }),
        pedir(rutaPub, { actor: escribano, method: "POST", body: { confirmar: true } }),
      ]);
      assert.equal(pA.status, 200);
      assert.equal(pB.status, 200);
      const bodyPubA = await pA.json();
      assert.deepEqual(bodyPubA, await pB.json());
      assert.equal(bodyPubA.estado, "PUBLICADO");
      assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'resultado_publicado'")).rowCount, 1);

      // Cannot calculate again once published
      const postPub = await pedir(rutaCalc, { actor: escribano, method: "POST", body: { confirmar: true } });
      assert.equal(postPub.status, 409);
      assert.equal((await postPub.json()).error, "resultado_ya_publicado");

      const anterior = snapA.id === snap.id ? snapB : snapA;
      for (const tabla of ["resultado_comparsa", "resultado_rubro_sujeto"]) {
        await assert.rejects(
          pool.query(
            `INSERT INTO ${tabla} SELECT * FROM ${tabla} WHERE calculo_id = $1 LIMIT 1
             ON CONFLICT DO NOTHING`,
            [anterior.id],
          ),
          { code: "23514", message: "RESULTADO_INMODIFICABLE" },
        );
      }
      await assert.rejects(
        pool.query(
          `INSERT INTO empate_resultado
             (calculo_id, edicion_id, ambito, posicion_empatada, puntaje_empatado, candidatos_ids)
           VALUES ($1, $2, 'COMPARSA', 1, 5, ARRAY[$3::uuid, $4::uuid])`,
          [anterior.id, ctx.edicionId, ctx.c1, ctx.c2],
        ),
        { code: "23514", message: "RESULTADO_INMODIFICABLE" },
      );

      // ADMIN and ESCRIBANO read published results + detailed scores
      for (const actor of [escribano, admin]) {
        const res = await pedir(rutaRes, { actor });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("cache-control"), "no-store");
        const datos = await res.json();
        assert.equal(datos.snapshots.length, 2);
        assert.equal(datos.activo.id, snap.id);
        assert.equal(datos.activo.estado, "PUBLICADO");

        const pts = await pedir(rutaPuntajes, { actor });
        assert.equal(pts.status, 200);
        const det = await pts.json();
        assert.equal(det.items.length, 2);
      }
    });
  });
});

test("GOYA_2026_V1 calculation engine applies D24, D25 parent sums, A10, D13 scoring nights and D14 penalties accurately", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await prepararActores(pool);
    const edicionId = randomUUID();
    const versionId = randomUUID();
    const espId = randomUUID();
    const comp1 = randomUUID(); // PRIMERA
    const comp2 = randomUUID(); // PRIMERA (MINIMO_INTEGRANTES)
    const agrupa = randomUUID(); // AGRUPACION (only rubric prizes)

    // Subjects
    const sComp1 = randomUUID();
    const sNom1A = randomUUID();
    const sNom1B = randomUUID();
    const sCarro1A = randomUUID();
    const sCarro1B = randomUUID();
    const sCarro1C = randomUUID();
    const sAleat1 = randomUUID();
    const sBat1 = randomUUID();
    const sInf1 = randomUUID();
    const sComp2 = randomUUID();
    const sAleat2 = randomUUID();
    const sAleatAgr = randomUUID();

    // Rubros
    const rPadre = randomUUID(); // fixed parent (tipo_rubro NULL, suma_a_comparsa true)
    const rHijo1 = randomUUID();
    const rHijo2 = randomUUID();
    const rNom = randomUUID(); // NOMINATIVO, suma_a_comparsa true -> best per comparsa
    const rCarro = randomUUID(); // CARRO, NOMINATIVO, suma_a_comparsa true -> top 2 carros
    const rAleat = randomUUID(); // ALEATORIO -> excluded from comparsa general
    const rBat = randomUUID(); // fixed BATERIA (tipo_rubro NULL, suma_a_comparsa true) -> battery penalty -2.00
    const rInf = randomUUID(); // NOMINATIVO, suma_a_comparsa false -> excluded from comparsa general

    const noche1 = randomUUID(); // scoring
    const nocheShow = randomUUID(); // non-scoring (MUST be excluded)

    await pool.query("INSERT INTO edicion (id, nombre, anio, estado, creada_por) VALUES ($1, 'Goya 2027', 2027, 'CONFIGURING', $2)", [edicionId, admin]);
    await pool.query("INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por) VALUES ($1, $2, 1, 'BORRADOR', 'Goya', $3)", [versionId, edicionId, admin]);
    await pool.query("INSERT INTO especialidad (id, edicion_id, codigo, nombre, orden) VALUES ($1, $2, 'J1', 'Jurado', 1)", [espId, edicionId]);
    await pool.query(
      `INSERT INTO comparsa (id, edicion_id, categoria, nombre) VALUES
         ($1, $4, 'PRIMERA', 'Aymara'),
         ($2, $4, 'PRIMERA', 'Poramba'),
         ($3, $4, 'AGRUPACION', 'Tropical')`,
      [comp1, comp2, agrupa, edicionId],
    );
    await pool.query(
      `INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, nombre) VALUES
         ($1, $13, $14, 'COMPARSA', 'Aymara'),
         ($2, $13, $14, 'TRAJE', 'Traje A'),
         ($3, $13, $14, 'TRAJE', 'Traje B'),
         ($4, $13, $14, 'CARRO', 'Carro 1'),
         ($5, $13, $14, 'CARRO', 'Carro 2'),
         ($6, $13, $14, 'CARRO', 'Carro 3'),
         ($7, $13, $14, 'GRUPO', 'Pasistas Aymara'),
         ($8, $13, $14, 'BATERIA', 'Batería Aymara'),
         ($9, $13, $14, 'GRUPO', 'Infantil Aymara'),
         ($10, $13, $15, 'COMPARSA', 'Poramba'),
         ($11, $13, $15, 'GRUPO', 'Pasistas Poramba'),
         ($12, $13, $16, 'GRUPO', 'Pasistas Tropical')`,
      [sComp1, sNom1A, sNom1B, sCarro1A, sCarro1B, sCarro1C, sAleat1, sBat1, sInf1, sComp2, sAleat2, sAleatAgr, edicionId, comp1, comp2, agrupa],
    );

    await pool.query(
      `INSERT INTO rubro_version (id, edicion_id, version_id, codigo, nombre, tipo_sujeto, suma_a_comparsa, tipo_rubro, nominados_maximos, orden, padre_id, evaluable) VALUES
         ($1, $9, $10, 'FIJO', 'Puesta general', 'COMPARSA', true, NULL, NULL, 1, NULL, true),
         ($2, $9, $10, 'FIJO-1', 'Subitem 1', 'COMPARSA', true, NULL, NULL, 2, $1, true),
         ($3, $9, $10, 'FIJO-2', 'Subitem 2', 'COMPARSA', true, NULL, NULL, 3, $1, true),
         ($4, $9, $10, 'NOM', 'Traje destaque', 'TRAJE', true, 'NOMINATIVO', NULL, 4, NULL, true),
         ($5, $9, $10, 'CAR', 'Carro alegórico', 'CARRO', true, 'NOMINATIVO', NULL, 5, NULL, true),
         ($6, $9, $10, 'ALE', 'Pasistas', 'GRUPO', true, 'ALEATORIO', 3, 6, NULL, true),
         ($7, $9, $10, 'BAT', 'Show batería', 'BATERIA', true, NULL, NULL, 7, NULL, true),
         ($8, $9, $10, 'INF', 'Infantil', 'GRUPO', false, 'NOMINATIVO', NULL, 8, NULL, true)`,
      [rPadre, rHijo1, rHijo2, rNom, rCarro, rAleat, rBat, rInf, edicionId, versionId],
    );
    for (const r of [rHijo1, rHijo2, rNom, rCarro, rAleat, rBat, rInf]) {
      await pool.query("INSERT INTO rubro_especialidad (edicion_id, rubro_version_id, especialidad_id) VALUES ($1, $2, $3)", [edicionId, r, espId]);
    }

    const filasDef = [
      [rHijo1, sComp1, 4], [rHijo2, sComp1, 5],       // parent rPadre for comp1 = 9
      [rNom, sNom1A, 3], [rNom, sNom1B, 5],           // best nominative for comp1 = 5
      [rCarro, sCarro1A, 5], [rCarro, sCarro1B, 4], [rCarro, sCarro1C, 2], // top 2 carros for comp1 = 5+4 = 9
      [rAleat, sAleat1, 3],                           // aleatorio: excluded from comparsa general
      [rBat, sBat1, 5],                               // battery fixed: 5 - 2 (penalty) = 3
      [rInf, sInf1, 5],                               // suma_a_comparsa=false: excluded from comparsa general
      [rHijo1, sComp2, 5], [rHijo2, sComp2, 5],       // comp2 parent = 10, but MINIMO_INTEGRANTES disqualifies comp2
      [rAleat, sAleat2, 5],                           // comp2 individual still wins rAleat (5 > 4 > 3)!
      [rAleat, sAleatAgr, 4],                         // agrupacion ranks 2nd in rAleat, excluded from comparsa general
    ];

    const filas = [];
    for (let i = 0; i < filasDef.length; i += 1) {
      const [rubro, sujeto, valor] = filasDef[i];
      const filaId = randomUUID();
      await pool.query(
        "INSERT INTO fila_planilla (id, edicion_id, especialidad_id, rubro_version_id, sujeto_id, orden, origen) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [filaId, edicionId, espId, rubro, sujeto, i + 1, rubro === rAleat ? "MANUAL" : "GENERADA"],
      );
      filas.push({ filaId, rubro, valor });
    }

    await pool.query(
      `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, cuenta_para_puntaje) VALUES
         ($1, $3, 1, 'Noche 1', 'COMPETENCIA', true),
         ($2, $3, 2, 'Show', 'COMPETENCIA', false)`,
      [noche1, nocheShow, edicionId],
    );
    for (const n of [noche1, nocheShow]) {
      await pool.query(
        "INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion) VALUES ($1, $2, $3, 1), ($1, $2, $4, 2), ($1, $2, $5, 3)",
        [edicionId, n, comp1, comp2, agrupa],
      );
      await pool.query("INSERT INTO configuracion_planilla_noche (edicion_id, version_id, noche_id, especialidad_id) VALUES ($1, $2, $3, $4)", [edicionId, versionId, n, espId]);
      for (let i = 0; i < filas.length; i += 1) {
        await pool.query(
          "INSERT INTO configuracion_planilla_noche_fila (edicion_id, version_id, noche_id, especialidad_id, fila_id, rubro_id, orden) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [edicionId, versionId, n, espId, filas[i].filaId, filas[i].rubro, i + 1],
        );
      }
    }

    const asig1 = randomUUID();
    const asigShow = randomUUID();
    await pool.query(
      `INSERT INTO asignacion_jurado (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por) VALUES
         ($1, $3, $4, $5, $7, $8), ($2, $3, $4, $6, $7, $8)`,
      [asig1, asigShow, edicionId, jurado, noche1, nocheShow, espId, admin],
    );
    await pool.query("UPDATE version_reglamento SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = now() WHERE id = $1", [versionId, admin]);
    await pool.query("UPDATE edicion SET estado = 'OPEN', abierta_por = $2, abierta_en = now() WHERE id = $1", [edicionId, admin]);
    await pool.query("UPDATE version_reglamento SET estado = 'CONGELADA', congelada_en = now() WHERE id = $1", [versionId]);

    for (const [n, a, bonus] of [[noche1, asig1, 0], [nocheShow, asigShow, 5]]) {
      await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = now() WHERE id = $1", [n]);
      const inst = randomUUID();
      await pool.query("INSERT INTO instantanea_planillas_esperadas (id, edicion_id, noche_id, version_id, congelada_en, filas_configuradas) VALUES ($1, $2, $3, $4, now(), true)", [inst, edicionId, n, versionId]);
      await pool.query("INSERT INTO instantanea_planilla_esperada_detalle (instantanea_id, edicion_id, noche_id, asignacion_id) VALUES ($1, $2, $3, $4)", [inst, edicionId, n, a]);
      const pid = randomUUID();
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        for (const f of filas) {
          await c.query(
            "INSERT INTO puntaje_recibido (planilla_id, fila_id, valor, no_presentado, autor_id) VALUES ($1, $2, $3, false, $4)",
            [pid, f.filaId, bonus || f.valor, jurado],
          );
        }
        await c.query(
          "INSERT INTO planilla_recibida (id, operation_id, asignacion_id, version_id, hash_contenido) VALUES ($1, $2, $3, $4, $5)",
          [pid, randomUUID(), a, versionId, "d".repeat(64)],
        );
        await c.query("COMMIT");
      } finally {
        c.release();
      }
      await pool.query("UPDATE noche SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [n, escribano]);
    }

    // Active penalties on noche1: battery -2.00 + retraso ingreso 10 min (-5.00) on comp1; MINIMO_INTEGRANTES on comp2
    await pool.query(
      `INSERT INTO penalizacion
         (operation_id, edicion_id, noche_id, comparsa_id, rubro_version_id, tipo, minutos, puntos_descuento,
          cedio_turno, impide_premios_comparsa, motivo, referencia_acta, registrada_por)
       VALUES
         ($1, $4, $5, $6, $8, 'EXCESO_SHOW_BATERIA', 4, 2.00, false, false, 'Exceso', 'Acta 1', $9),
         ($2, $4, $5, $6, NULL, 'RETRASO_INGRESO', 10, 5.00, false, false, 'Demora', 'Acta 2', $9),
         ($3, $4, $5, $7, NULL, 'MINIMO_INTEGRANTES', NULL, 0.00, false, true, 'Falta mínimo', 'Acta 3', $9)`,
      [randomUUID(), randomUUID(), randomUUID(), edicionId, noche1, comp1, comp2, rBat, escribano],
    );

    await pool.query("UPDATE edicion SET estado = 'CLOSED', cerrada_por = $2 WHERE id = $1", [edicionId, escribano]);

    await conApp(pool, async (base) => {
      const res = await fetch(new URL(`/api/escribano/ediciones/${edicionId}/resultados/calcular`, base), {
        method: "POST",
        headers: { "x-usuario-prueba": escribano, "content-type": "application/json" },
        body: JSON.stringify({ confirmar: true }),
      });
      assert.equal(res.status, 201);
      const snap = await res.json();

      // General ranking only includes PRIMERA (comp1 and comp2), NOT AGRUPACION
      assert.equal(snap.comparsas.length, 2);
      const resComp1 = snap.comparsas.find((c) => c.comparsa.id === comp1);
      const resComp2 = snap.comparsas.find((c) => c.comparsa.id === comp2);

      // comp1:
      //   fijos = rPadre (4+5=9) + rBat net (5-2=3) = 12
      //   nominativos = max(3, 5) = 5
      //   carros = top 2 of (5, 4, 2) = 9
      //   descuentoRubros = 2
      //   descuentoGeneral = 5
      //   total = 12 + 5 + 9 - 5 = 21
      assert.equal(resComp1.puntajeFijos, 12);
      assert.equal(resComp1.puntajeNominativos, 5);
      assert.equal(resComp1.puntajeCarros, 9);
      assert.equal(resComp1.descuentoRubros, 2);
      assert.equal(resComp1.descuentoGeneral, 5);
      assert.equal(resComp1.puntajeTotal, 21);
      assert.equal(resComp1.posicion, 1);
      assert.equal(resComp1.descalificadaComparsa, false);

      // comp2 disqualified from comparsa general prizes
      assert.equal(resComp2.descalificadaComparsa, true);
      assert.equal(resComp2.posicion, null);

      // Individual/rubric ranking: comp2 STILL wins rAleat (5), agrupa is 2nd (4), comp1 is 3rd (3)
      const aleatRubro = snap.rubros.find((r) => r.rubro.id === rAleat);
      assert.deepEqual(
        aleatRubro.resultados.map((x) => [x.sujeto.id, x.puntajeNeto, x.posicion]),
        [[sAleat2, 5, 1], [sAleatAgr, 4, 2], [sAleat1, 3, 3]],
      );
      // Battery rubric reflects -2.00 discount (artistico 5, descuento 2, neto 3)
      const batRubro = snap.rubros.find((r) => r.rubro.id === rBat);
      assert.equal(batRubro.resultados[0].puntajeArtistico, 5);
      assert.equal(batRubro.resultados[0].descuentoRubro, 2);
      assert.equal(batRubro.resultados[0].puntajeNeto, 3);
      // Parent rubric rPadre computed from children (comp2=10 pos 1, comp1=9 pos 2)
      const padreRubro = snap.rubros.find((r) => r.rubro.id === rPadre);
      assert.deepEqual(
        padreRubro.resultados.map((x) => [x.sujeto.id, x.puntajeNeto, x.posicion]),
        [[sComp2, 10, 1], [sComp1, 9, 2]],
      );
      // Zero ties -> ready to publish immediately
      assert.equal(snap.empates.length, 0);
    });
  });
});
