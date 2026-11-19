import assert from "node:assert/strict";
import test from "node:test";
import { abrirEdicion } from "../src/apertura-edicion.js";
import { crearNoche } from "../src/configuracion-edicion.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Verifica la apertura idempotente de una edición. Requiere TEST_DATABASE_URL apuntando a una base descartable.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const edicion = "10000000-0000-0000-0000-000000000027";
const otraEdicion = "10000000-0000-0000-0000-000000000026";
const clave = "aaaaaaaa-0000-4000-8000-000000000001";
const otraClave = "aaaaaaaa-0000-4000-8000-000000000002";
const rolSinApertura = "carnavales_prueba_sin_apertura";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true)`,
    [admin],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $3),
            ($2, 'Carnaval 2026', 2026, 'CONFIGURING', $3)`,
    [edicion, otraEdicion, admin],
  );
}

async function contar(pool, sql, valores = []) {
  const { rows } = await pool.query(sql, valores);
  return rows[0].n;
}

test("abrir la edición la pasa a OPEN, la audita y no congela el padrón", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const resultado = await abrirEdicion(pool, { edicionId: edicion, claveOperacion: clave, actorId: admin });

    assert.equal(resultado.estado, "OPEN");
    assert.equal(resultado.repetida, false);
    assert.equal(typeof resultado.abiertaEn, "string");

    const { rows } = await pool.query("SELECT estado, abierta_por FROM edicion WHERE id = $1", [edicion]);
    assert.deepEqual(rows, [{ estado: "OPEN", abierta_por: admin }]);
    assert.equal(
      await contar(pool, "SELECT count(*)::int AS n FROM auditoria WHERE operacion = 'edicion_abierta'"),
      1,
    );

    const comparsa = await pool.query(
      "INSERT INTO comparsa (edicion_id, nombre, categoria) VALUES ($1, 'Nueva', 'PRIMERA') RETURNING id",
      [edicion],
    );
    assert.ok(comparsa.rows[0].id, "el padrón sigue editable tras abrir la edición");

    const noche = await crearNoche(pool, {
      edicionId: edicion,
      actorId: admin,
      datos: { orden: 1, nombre: "Primera", tipo: "COMPETENCIA" },
    });
    assert.equal(noche.estado, "DRAFT", "una noche nueva en una edición abierta nace en DRAFT");
  });
});

test("repetir la misma clave devuelve el mismo resultado sin duplicar efectos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const primera = await abrirEdicion(pool, { edicionId: edicion, claveOperacion: clave, actorId: admin });
    const reintento = await abrirEdicion(pool, { edicionId: edicion, claveOperacion: clave, actorId: admin });

    assert.equal(reintento.repetida, true);
    assert.equal(reintento.abiertaEn, primera.abiertaEn);
    assert.equal(reintento.estado, "OPEN");
    assert.equal(
      await contar(pool, "SELECT count(*)::int AS n FROM operacion_apertura"),
      1,
    );
    assert.equal(
      await contar(pool, "SELECT count(*)::int AS n FROM auditoria WHERE operacion = 'edicion_abierta'"),
      1,
    );
  });
});

test("una clave usada con otra edición responde conflicto", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await abrirEdicion(pool, { edicionId: edicion, claveOperacion: clave, actorId: admin });

    await assert.rejects(
      abrirEdicion(pool, { edicionId: otraEdicion, claveOperacion: clave, actorId: admin }),
      (error) => error.codigo === "clave_reutilizada",
    );
    const { rows } = await pool.query("SELECT estado FROM edicion WHERE id = $1", [otraEdicion]);
    assert.equal(rows[0].estado, "CONFIGURING");
  });
});

test("abrir una edición ya abierta con otra clave responde conflicto sin registrar la clave", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await abrirEdicion(pool, { edicionId: edicion, claveOperacion: clave, actorId: admin });

    await assert.rejects(
      abrirEdicion(pool, { edicionId: edicion, claveOperacion: otraClave, actorId: admin }),
      (error) => error.codigo === "edicion_ya_abierta",
    );
    assert.equal(
      await contar(pool, "SELECT count(*)::int AS n FROM operacion_apertura"),
      1,
    );
  });
});

test("reintentos concurrentes con la misma clave abren una sola vez", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const resultados = await Promise.allSettled([
      abrirEdicion(pool, { edicionId: edicion, claveOperacion: clave, actorId: admin }),
      abrirEdicion(pool, { edicionId: edicion, claveOperacion: clave, actorId: admin }),
    ]);

    assert.ok(resultados.every((resultado) => resultado.status === "fulfilled"));
    const repeticiones = resultados.map((resultado) => resultado.value.repetida).sort();
    assert.deepEqual(repeticiones, [false, true]);
    assert.equal(
      await contar(pool, "SELECT count(*)::int AS n FROM auditoria WHERE operacion = 'edicion_abierta'"),
      1,
    );
  });
});

test("una clave que no es UUID y una edición inexistente se rechazan sin escribir", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);

    await assert.rejects(
      abrirEdicion(pool, { edicionId: edicion, claveOperacion: "no-es-uuid", actorId: admin }),
      (error) => error.codigo === "clave_operacion_invalida",
    );
    await assert.rejects(
      abrirEdicion(pool, {
        edicionId: "99999999-0000-0000-0000-000000000000",
        claveOperacion: otraClave,
        actorId: admin,
      }),
      (error) => error.codigo === "edicion_inexistente",
    );
    assert.equal(
      await contar(pool, "SELECT count(*)::int AS n FROM operacion_apertura"),
      0,
    );
  });
});

test("una cuenta fuera del rol de apertura no puede pasar la edición a OPEN", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool, { schema }) => {
    await preparar(pool);
    await pool.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${rolSinApertura}') THEN
           CREATE ROLE ${rolSinApertura} NOLOGIN;
         END IF;
       END $$`,
    );
    await pool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${rolSinApertura}`);
    await pool.query(`GRANT SELECT, UPDATE ON edicion TO ${rolSinApertura}`);

    const client = await pool.connect();
    try {
      await client.query(`SET ROLE ${rolSinApertura}`);
      await assert.rejects(
        client.query("UPDATE edicion SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1", [edicion]),
        (error) => error.message.includes("APERTURA_REQUIERE_SERVICIO"),
      );
      await client.query("RESET ROLE");
    } finally {
      client.release();
    }

    const { rows } = await pool.query("SELECT estado FROM edicion WHERE id = $1", [edicion]);
    assert.equal(rows[0].estado, "CONFIGURING");
  });
});
