import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import { abrirNoche } from "../src/modules/ediciones/apertura-noche.js";
import { crearRutasAdminPlanilla } from "../src/modules/reglamento/admin-planilla.routes.js";
import { abrirEdicion } from "../src/modules/ediciones/apertura-edicion.js";
import { reemplazarAsignacion, revocarAsignacion } from "../src/modules/votacion/asignaciones.js";
import { crearNoche, eliminarNoche } from "../src/modules/ediciones/configuracion-edicion.js";
import { retirarEdicion } from "../src/modules/ediciones/ediciones.js";
import { obtenerPlanillaJurado } from "../src/modules/votacion/planillas-jurado.js";
import { consultarPlanillaNoche, guardarPlanillaNoche } from "../src/modules/reglamento/planillas-noche.js";
import { eliminarNominacion, nominarSujeto } from "../src/modules/reglamento/planilla.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";
const admin = "u-admin";
const jurado = "u-jurado";
const edicion = "10000000-0000-0000-0000-000000000027";
const version = "30000000-0000-0000-0000-000000000001";
const noche = "20000000-0000-0000-0000-000000000001";
const especialidad = "40000000-0000-0000-0000-000000000001";
const comparsa = "50000000-0000-0000-0000-000000000001";
const rubro = "70000000-0000-0000-0000-000000000001";
const clave = "aaaaaaaa-0000-4000-8000-000000000001";
const clave2 = "aaaaaaaa-0000-4000-8000-000000000002";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true), ($2, 'Jurado', 'jurado@example.test', true)`,
    [admin, jurado],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2)`,
    [edicion, admin],
  );
  await abrirEdicion(pool, { edicionId: edicion, claveOperacion: "aaaaaaaa-0000-4000-8000-000000000003", actorId: admin });
  await pool.query(
    `INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 1, 'BORRADOR', 'Reglamento', $3)`,
    [version, edicion, admin],
  );
  await pool.query(
    `INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo)
     VALUES ($1, $2, 1, 5)`,
    [version, edicion],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
     VALUES ($1, $2, 'Vestuario', 'J1', 1)`,
    [especialidad, edicion],
  );
  await pool.query(
    `INSERT INTO rubro_version (id, version_id, edicion_id, codigo, nombre, tipo_sujeto,
                                tipo_rubro, nominados_maximos, orden)
     VALUES ($1, $2, $3, 'R1', 'Traje', 'TRAJE', 'ALEATORIO', 2, 1)`,
    [rubro, version, edicion],
  );
  await pool.query(
    `INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id)
     VALUES ($1, $2, $3)`,
    [rubro, especialidad, edicion],
  );
  await pool.query(
    `UPDATE version_reglamento
        SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [version, admin],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo)
     VALUES ($1, $2, 1, 'Primera noche', 'COMPETENCIA')`,
    [noche, edicion],
  );
  await pool.query(
    `INSERT INTO comparsa (id, edicion_id, nombre, categoria)
     VALUES ($1, $2, 'Alfa', 'PRIMERA')`,
    [comparsa, edicion],
  );
}

async function completarChecklist(pool) {
  await pool.query(
    `INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion)
     VALUES ($1, $2, $3, 1)`,
    [edicion, noche, comparsa],
  );
  await pool.query(
    `INSERT INTO asignacion_jurado (edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
     VALUES ($1, $2, $3, $4, $5)`,
    [edicion, jurado, noche, especialidad, admin],
  );
}

function guardarSeleccion(pool, filaIds = []) {
  return guardarPlanillaNoche(pool, {
    edicionId: edicion, versionId: version, nocheId: noche, especialidadId: especialidad,
    actorId: admin, filaIds,
  });
}

async function crearFilaManual(pool) {
  const { rows: [sujeto] } = await pool.query(
    `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
     VALUES ($1, $2, 'TRAJE', 'Nominación de prueba') RETURNING id`, [edicion, comparsa],
  );
  return nominarSujeto(pool, {
    edicionId: edicion, versionId: version, actorId: admin, rubroId: rubro,
    datos: { sujetoId: sujeto.id, especialidadId: especialidad },
  });
}

test("una apertura válida conserva su prioridad sobre el alta simultánea de otra noche", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    await guardarSeleccion(pool, [(await crearFilaManual(pool)).id]);
    const conexion = await pool.connect();
    let notificar;
    let continuar;
    const pausa = new Promise((resolve) => { continuar = resolve; });
    const pausada = new Promise((resolve) => { notificar = resolve; });
    const conPausa = { connect: async () => ({
      query: async (sql, parametros) => {
        if (sql.startsWith("SELECT id, estado FROM version_reglamento WHERE id")) {
          notificar();
          await pausa;
        }
        return conexion.query(sql, parametros);
      },
      release: () => conexion.release(),
    }) };
    const apertura = abrirNoche(conPausa, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin });
    let alta;
    try {
      await Promise.race([pausada, apertura.then(() => assert.fail("La apertura no esperó"))]);
      alta = crearNoche(pool, {
        edicionId: edicion, actorId: admin, datos: { nombre: "Segunda", orden: 2, tipo: "COMPETENCIA" },
      });
      for (let i = 0; ; i += 1) {
        const { rowCount } = await pool.query(`SELECT 1 FROM pg_stat_activity
          WHERE $1 = ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT 1 FROM edicion%'`, [conexion.processID]);
        if (rowCount) break;
        if (i >= 150) assert.fail("El alta no esperó el bloqueo de la edición");
        await delay(10);
      }
    } finally {
      continuar();
      const [abierta, creada] = await Promise.all([apertura, alta]);
      assert.equal(abierta.estado, "OPEN");
      assert.equal(creada.estado, "DRAFT");
    }
  });
});

test("una instantánea anterior a la apertura no permite retirar una edición en votación", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    await guardarSeleccion(pool, [(await crearFilaManual(pool)).id]);
    const snapshot = await pool.connect();
    try {
      await snapshot.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      assert.equal((await snapshot.query("SELECT estado FROM noche WHERE id = $1", [noche])).rows[0].estado, "DRAFT");
      await abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin });
      await assert.rejects(snapshot.query(
        "UPDATE edicion SET retirada_en = now(), retirada_por = $2 WHERE id = $1", [edicion, admin],
      ), { code: "40001" });
    } finally {
      await snapshot.query("ROLLBACK");
      snapshot.release();
    }
    await assert.rejects(retirarEdicion(pool, { edicionId: edicion, actorId: admin }),
      { code: "23514", message: "EDICION_EN_VOTACION" });
    assert.deepEqual((await pool.query("SELECT retirada_en FROM edicion WHERE id = $1", [edicion])).rows,
      [{ retirada_en: null }]);
  });
});

test("una lista vacía guardada bloquea la apertura si hay un jurado asignado", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    await guardarSeleccion(pool);
    await assert.rejects(
      abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin }),
      (error) => error.codigo === "apertura_con_bloqueantes"
        && error.detalles.bloqueantes.some((item) =>
          item.codigo === "especialidades_con_planilla_vacia" && item.especialidades.some(({ id }) => id === especialidad)),
    );
    const { rows: [estado] } = await pool.query(
      `SELECT estado, EXISTS (SELECT 1 FROM operacion_apertura WHERE clave_operacion = $2) AS registrada
         FROM noche WHERE id = $1`, [noche, clave],
    );
    assert.deepEqual(estado, { estado: "DRAFT", registrada: false });
  });
});

test("borrar la última fila no confirma una planilla vacía sin jurado", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    const { rows: [asignacion] } = await pool.query("SELECT id FROM asignacion_jurado WHERE noche_id = $1", [noche]);
    await revocarAsignacion(pool, { id: asignacion.id, actorId: admin });
    const fila = await crearFilaManual(pool);
    await guardarSeleccion(pool, [fila.id]);
    await eliminarNominacion(pool, { edicionId: edicion, versionId: version, actorId: admin, filaId: fila.id });
    const abrir = () => abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin });
    await assert.rejects(abrir(), (error) => error.codigo === "apertura_con_bloqueantes"
      && error.detalles.bloqueantes.some((item) => item.codigo === "especialidades_con_planilla_vacia"));
    await guardarSeleccion(pool);
    assert.equal((await abrir()).estado, "OPEN");
    const { rows: [detalle] } = await pool.query(
      `SELECT count(*)::int AS esperadas FROM instantanea_planilla_esperada_detalle WHERE noche_id = $1`, [noche],
    );
    assert.equal(detalle.esperadas, 0);
  });
});

test("una selección de borrador no impide borrar una nominación manual", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    const { rows: [sujeto] } = await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
       VALUES ($1, $2, 'TRAJE', 'Nominación de prueba') RETURNING id`, [edicion, comparsa],
    );
    const contexto = { edicionId: edicion, versionId: version, actorId: admin };
    const fila = await nominarSujeto(pool, {
      ...contexto, rubroId: rubro, datos: { sujetoId: sujeto.id, especialidadId: especialidad },
    });
    await guardarSeleccion(pool, [fila.id]);
    await eliminarNominacion(pool, { ...contexto, filaId: fila.id });
    assert.deepEqual(await consultarPlanillaNoche(pool, {
      ...contexto, nocheId: noche, especialidadId: especialidad,
    }), { configurada: true, filaIds: [] });
  });
});

test("una selección vacía no impide borrar una noche sin historial", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await guardarSeleccion(pool);
    await eliminarNoche(pool, { edicionId: edicion, nocheId: noche, actorId: admin });
    assert.equal((await pool.query("SELECT 1 FROM noche WHERE id = $1", [noche])).rowCount, 0);
  });
});

test("un reemplazo a una selección congelada vacía conserva la asignación original", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    await pool.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por)
       SELECT $1, id, $2 FROM rol WHERE codigo = 'JURADO'`, [jurado, admin],
    );
    const { rows: [otra] } = await pool.query(
      `INSERT INTO especialidad (edicion_id, nombre, codigo, orden)
       VALUES ($1, 'Otra', 'OT', 2) RETURNING id`, [edicion],
    );
    const { rows: [original] } = await pool.query(
      "SELECT id FROM asignacion_jurado WHERE noche_id = $1", [noche],
    );
    await guardarSeleccion(pool, [(await crearFilaManual(pool)).id]);
    await guardarPlanillaNoche(pool, {
      edicionId: edicion, versionId: version, nocheId: noche, especialidadId: otra.id,
      actorId: admin, filaIds: [],
    });
    await abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin });
    await assert.rejects(
      reemplazarAsignacion(pool, { id: original.id, especialidadId: otra.id, actorId: admin }),
      { codigo: "reemplazo_requiere_suplencia" },
    );
    const { rows } = await pool.query("SELECT id, estado FROM asignacion_jurado WHERE noche_id = $1", [noche]);
    assert.deepEqual(rows, [{ id: original.id, estado: "ACTIVA" }]);
  });
});

test("cambiar solo el jurado no reasigna una planilla vacía congelada con 0015", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    const suplente = "u-suplente";
    await pool.query(
      `INSERT INTO usuario (id, nombre, correo, correo_verificado)
       VALUES ($1, 'Suplente', 'suplente@example.test', true)`, [suplente],
    );
    await pool.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por)
       SELECT $1, id, $2 FROM rol WHERE codigo = 'JURADO'`, [suplente, admin],
    );
    await pool.query(
      `INSERT INTO configuracion_planilla_noche (edicion_id, version_id, noche_id, especialidad_id)
       VALUES ($1, $2, $3, $4)`, [edicion, version, noche, especialidad],
    );
    await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1", [noche]);
    await pool.query(
      `INSERT INTO instantanea_planillas_esperadas (edicion_id, version_id, noche_id, congelada_en, filas_configuradas)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, true)`, [edicion, version, noche],
    );
    const consulta = "SELECT id, jurado_id, estado FROM asignacion_jurado WHERE noche_id = $1";
    const { rows: antes } = await pool.query(consulta, [noche]);
    await assert.rejects(
      reemplazarAsignacion(pool, { id: antes[0].id, juradoId: suplente, actorId: admin }),
      { codigo: "reemplazo_requiere_suplencia" },
    );
    assert.deepEqual((await pool.query(consulta, [noche])).rows, antes);
  });
});

test("una especialidad sin lista guardada bloquea la apertura sin registrar la operación", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    await assert.rejects(
      abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin }),
      (error) => error.codigo === "apertura_con_bloqueantes"
        && error.detalles.bloqueantes.some((item) =>
          item.codigo === "especialidades_sin_planilla" && item.especialidades.some(({ id }) => id === especialidad)),
    );
    const { rows: [estado] } = await pool.query(
      `SELECT estado, EXISTS (SELECT 1 FROM operacion_apertura WHERE clave_operacion = $2) AS registrada
         FROM noche WHERE id = $1`, [noche, clave],
    );
    assert.deepEqual(estado, { estado: "DRAFT", registrada: false });
  });
});

test("la API propone filas del desfile y la apertura fija solo la selección guardada", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por)
       SELECT $1, id, $1 FROM rol WHERE codigo = 'ADMINISTRADOR'`, [admin],
    );
    const { rows: sujetos } = await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
       VALUES ($1, $2, 'TRAJE', 'Primero'), ($1, $2, 'TRAJE', 'Segundo') RETURNING id`, [edicion, comparsa],
    );
    const filas = [];
    for (const sujeto of sujetos) {
      filas.push(await nominarSujeto(pool, {
        edicionId: edicion, versionId: version, rubroId: rubro, actorId: admin,
        datos: { sujetoId: sujeto.id, especialidadId: especialidad },
      }));
    }
    const app = express();
    let usuario = jurado;
    app.use(crearRutasAdminPlanilla({ pool, obtenerSesion: async () => ({ user: { id: usuario } }) }));
    const servidor = app.listen(0, "127.0.0.1");
    await once(servidor, "listening");
    try {
      const url = `http://127.0.0.1:${servidor.address().port}/${edicion}/versiones/${version}/noches/${noche}/planilla/${especialidad}`;
      const guardar = (filaIds) => fetch(url, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ filaIds }),
      });
      assert.equal((await guardar([filas[0].id])).status, 403);
      usuario = admin;
      assert.deepEqual(await (await fetch(url)).json(), { configurada: false, filaIds: [] });
      assert.equal((await guardar([filas[0].id])).status, 409);
      await completarChecklist(pool);
      const propuesta = await fetch(url);
      assert.equal(propuesta.status, 200);
      assert.deepEqual(await propuesta.json(), { configurada: false, filaIds: filas.map(({ id }) => id) });
      const guardada = await guardar([filas[1].id]);
      assert.equal(guardada.status, 200);
      assert.deepEqual(await guardada.json(), { configurada: true, filaIds: [filas[1].id] });
      await abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin });
      assert.equal((await guardar([filas[0].id])).status, 409);
      await assert.rejects(pool.query("DELETE FROM configuracion_planilla_noche_fila"), { code: "23514" });
      const { rows: [asignacion] } = await pool.query("SELECT id FROM asignacion_jurado WHERE noche_id = $1", [noche]);
      const planilla = await obtenerPlanillaJurado(pool, { asignacionId: asignacion.id, juradoId: jurado });
      assert.deepEqual(planilla.filas.map(({ id }) => id), [filas[1].id]);
    } finally {
      await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
    }
  });
});

test("apertura bloquea si falta jurado u orden de alguna comparsa sin congelar la versión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await assert.rejects(
      abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin }),
      (error) => error.codigo === "apertura_con_bloqueantes",
    );
    const { rows } = await pool.query("SELECT estado FROM version_reglamento WHERE id = $1", [version]);
    assert.equal(rows[0].estado, "PUBLICADA");
    const { rows: estadoNoche } = await pool.query("SELECT estado FROM noche WHERE id = $1", [noche]);
    assert.equal(estadoNoche[0].estado, "DRAFT");
  });
});

test("apertura válida congela el reglamento, abre la noche y permite reintento idempotente", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    await guardarSeleccion(pool, [(await crearFilaManual(pool)).id]);
    const abierta = await abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin });
    assert.equal(abierta.estado, "OPEN");
    assert.equal(abierta.repetida, false);
    const repetida = await abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin });
    assert.equal(repetida.repetida, true);
    assert.equal(repetida.abiertaEn, abierta.abiertaEn);
    const { rows: esperadas } = await pool.query(
      `SELECT i.version_id, a.jurado_id FROM instantanea_planillas_esperadas i
         JOIN instantanea_planilla_esperada_detalle d ON d.instantanea_id = i.id
         JOIN asignacion_jurado a ON a.id = d.asignacion_id WHERE i.noche_id = $1`, [noche],
    );
    assert.deepEqual(esperadas, [{ version_id: version, jurado_id: jurado }]);
    const { rows: versiones } = await pool.query("SELECT estado FROM version_reglamento WHERE id = $1", [version]);
    assert.equal(versiones[0].estado, "CONGELADA");
    const { rows: auditorias } = await pool.query(
      "SELECT count(*)::int AS n FROM auditoria WHERE operacion = 'noche_abierta'",
    );
    assert.equal(auditorias[0].n, 1);
  });
});

test("aperturas concurrentes de una misma noche producen una sola operación y auditoría", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    await guardarSeleccion(pool, [(await crearFilaManual(pool)).id]);
    const resultados = await Promise.allSettled([
      abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin }),
      abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave2, actorId: admin }),
    ]);
    assert.equal(resultados.filter((resultado) => resultado.status === "fulfilled").length, 1);
    assert.equal(resultados.filter((resultado) => resultado.status === "rejected").length, 1);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM auditoria WHERE operacion = 'noche_abierta'",
    );
    assert.equal(rows[0].n, 1);
  });
});

test("el jurado lee la nominación de administración en la versión fijada al abrir", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await completarChecklist(pool);
    const { rows: [sujeto] } = await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
       VALUES ($1, $2, 'TRAJE', 'Traje principal') RETURNING id`, [edicion, comparsa],
    );
    const fila = await nominarSujeto(pool, {
      edicionId: edicion, versionId: version, rubroId: rubro, actorId: admin,
      datos: { sujetoId: sujeto.id, especialidadId: especialidad },
    });
    await guardarSeleccion(pool, [fila.id]);
    await abrirNoche(pool, { edicionId: edicion, nocheId: noche, claveOperacion: clave, actorId: admin });
    await pool.query(
      `INSERT INTO version_reglamento (edicion_id, numero, estado, fuente, creada_por)
       VALUES ($1, 2, 'BORRADOR', 'Otra versión', $2)`, [edicion, admin],
    );
    const { rows: [asignacion] } = await pool.query(
      "SELECT id FROM asignacion_jurado WHERE noche_id = $1 AND jurado_id = $2", [noche, jurado],
    );
    const planilla = await obtenerPlanillaJurado(pool, { asignacionId: asignacion.id, juradoId: jurado });
    assert.deepEqual(planilla.filas.map(({ id }) => id), [fila.id]);
  });
});

test("la base rechaza abrir una noche fuera del rol de apertura", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool, { schema }) => {
    await preparar(pool);
    const rol = "carnavales_prueba_sin_apertura";
    await pool.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${rol}') THEN
           CREATE ROLE ${rol} NOLOGIN;
         END IF;
       END $$`,
    );
    await pool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${rol}`);
    await pool.query(`GRANT SELECT, UPDATE ON noche TO ${rol}`);
    const client = await pool.connect();
    try {
      await client.query(`SET ROLE ${rol}`);
      await assert.rejects(
        client.query("UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1", [noche]),
        (error) => error.message.includes("APERTURA_REQUIERE_SERVICIO"),
      );
      await client.query("RESET ROLE");
    } finally {
      client.release();
    }
    const { rows } = await pool.query("SELECT estado FROM noche WHERE id = $1", [noche]);
    assert.equal(rows[0].estado, "DRAFT");
  });
});
