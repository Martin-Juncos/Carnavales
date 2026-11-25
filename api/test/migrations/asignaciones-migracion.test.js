import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedSchema } from "../helpers/isolated-schema.js";

// Verifica las restricciones persistentes de la migración 0007 mediante la interfaz
// pública de PostgreSQL. Requiere TEST_DATABASE_URL apuntando a una base descartable.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const juradoUno = "u-jurado-1";
const juradoDos = "u-jurado-2";
const edicion = "11111111-1111-1111-1111-111111111111";
const noche = "22222222-2222-2222-2222-222222222222";
const especialidad = "33333333-3333-3333-3333-333333333333";
const asignacion = "44444444-4444-4444-4444-444444444444";
const nuevaAsignacion = "55555555-5555-5555-5555-555555555555";

async function insertarAdmin(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true)`,
    [admin],
  );
}

async function esperarCheckViolation(consulta, contexto) {
  await assert.rejects(consulta, (error) => error.code === "23514", contexto);
}

async function preparar(pool) {
  await insertarAdmin(pool);
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Jurado uno', 'jurado1@example.test', true),
            ($2, 'Jurado dos', 'jurado2@example.test', true)`,
    [juradoUno, juradoDos],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2)`,
    [edicion, admin],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado)
     VALUES ($1, $2, 1, 'Primera noche', 'COMPETENCIA', 'DRAFT')`,
    [noche, edicion],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
     VALUES ($1, $2, 'Vestuario', 'J1', 1)`,
    [especialidad, edicion],
  );
  await pool.query(
    `INSERT INTO asignacion_jurado
       (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [asignacion, edicion, juradoUno, noche, especialidad, admin],
  );
}

test("una asignación no cambia de jurado, noche o especialidad y no se borra físicamente", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);

    for (const cambio of [
      "UPDATE asignacion_jurado SET jurado_id = 'u-jurado-2' WHERE id = $1",
      "UPDATE asignacion_jurado SET noche_id = '99999999-9999-9999-9999-999999999999' WHERE id = $1",
      "UPDATE asignacion_jurado SET especialidad_id = '99999999-9999-9999-9999-999999999999' WHERE id = $1",
    ]) {
      await esperarCheckViolation(pool.query(cambio, [asignacion]), cambio);
    }
    await esperarCheckViolation(
      pool.query("DELETE FROM asignacion_jurado WHERE id = $1", [asignacion]),
      "borrado físico",
    );

    const { rows } = await pool.query(
      "SELECT jurado_id, noche_id, especialidad_id, estado FROM asignacion_jurado WHERE id = $1",
      [asignacion],
    );
    assert.deepEqual(rows, [
      {
        jurado_id: juradoUno,
        noche_id: noche,
        especialidad_id: especialidad,
        estado: "ACTIVA",
      },
    ]);
  });
});

test("revocar libera la combinación para una nueva asignación sin borrar la anterior", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `UPDATE asignacion_jurado
          SET estado = 'REVOCADA', revocada_por = $1, revocada_en = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [admin, asignacion],
    );
    const { rows: [nueva] } = await pool.query(
      `INSERT INTO asignacion_jurado
         (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, estado`,
      [nuevaAsignacion, edicion, juradoUno, noche, especialidad, admin],
    );
    assert.deepEqual(nueva, { id: nuevaAsignacion, estado: "ACTIVA" });

    const { rows } = await pool.query(
      "SELECT id, estado FROM asignacion_jurado ORDER BY id",
    );
    assert.deepEqual(rows, [
      { id: asignacion, estado: "REVOCADA" },
      { id: nuevaAsignacion, estado: "ACTIVA" },
    ]);
  });
});

test("TRUNCATE no vacía las asignaciones ni la auditoría", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id)
       VALUES ($1, 'crear_asignacion', 'asignacion_jurado', $2)`,
      [admin, asignacion],
    );

    // La FK de la instantánea de planillas (0008) puede rechazar el TRUNCATE
    // antes de que dispare el trigger, con un SQLSTATE distinto de 23514. En
    // ambos casos la evidencia queda protegida: se comprueba el bloqueo, no el
    // código exacto de PostgreSQL.
    await assert.rejects(pool.query("TRUNCATE asignacion_jurado"), "TRUNCATE de asignaciones");
    // La auditoría no tiene la FK nueva de 0008: aquí sí se comprueba el trigger
    // de 0007 con su SQLSTATE propio.
    await esperarCheckViolation(pool.query("TRUNCATE auditoria"), "TRUNCATE de auditoría");

    for (const tabla of ["asignacion_jurado", "auditoria"]) {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${tabla}`);
      assert.equal(rows[0].n, 1, `${tabla} debe conservar su fila`);
    }
  });
});

test("el registro de auditoría es append-only", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await insertarAdmin(pool);
    const { rows: [registro] } = await pool.query(
      `INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id)
       VALUES ($1, 'crear_asignacion', 'asignacion_jurado', $2)
       RETURNING id, operacion, entidad_id`,
      [admin, asignacion],
    );
    assert.deepEqual(
      { operacion: registro.operacion, entidad_id: registro.entidad_id },
      { operacion: "crear_asignacion", entidad_id: asignacion },
    );

    await esperarCheckViolation(
      pool.query("UPDATE auditoria SET operacion = 'otra' WHERE id = $1", [registro.id]),
      "UPDATE de auditoría",
    );
    await esperarCheckViolation(
      pool.query("DELETE FROM auditoria WHERE id = $1", [registro.id]),
      "DELETE de auditoría",
    );

    const { rows } = await pool.query("SELECT operacion FROM auditoria WHERE id = $1", [registro.id]);
    assert.deepEqual(rows, [{ operacion: "crear_asignacion" }]);
  });
});
