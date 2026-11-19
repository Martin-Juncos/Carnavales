import assert from "node:assert/strict";
import test from "node:test";
import { abrirNoche } from "../src/apertura-noche.js";
import { abrirEdicion } from "../src/apertura-edicion.js";
import { obtenerPlanillaJurado } from "../src/planillas-jurado.js";
import { nominarSujeto } from "../src/planilla.js";
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
