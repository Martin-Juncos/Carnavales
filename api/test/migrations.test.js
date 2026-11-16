import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { migrate } from "../src/migrate.js";

// Estas pruebas necesitan una base PostgreSQL descartable:
//   TEST_DATABASE_URL=postgres://... node --test test/migrations.test.js
// Cada ejecución crea un esquema temporal propio y lo elimina al terminar,
// así que no toca ningún dato existente en la base.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const verificationFile = fileURLToPath(
  new URL("../migrations/tests/verify-0002-0004.sql", import.meta.url),
);

async function withIsolatedSchema(run) {
  const schema = `migr_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);

  // Cada conexión del pool usa el esquema temporal como search_path.
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema}`,
  });

  try {
    await run(pool);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}

test("migrate aplica las migraciones en orden y es idempotente", { skip }, async () => {
  await withIsolatedSchema(async (pool) => {
    const primera = await migrate(pool, migrationsDirectory);
    assert.deepEqual(primera, [
      "0001-better-auth-1.7.22.sql",
      "0002-endurecer-tablas-better-auth.sql",
      "0003-roles.sql",
      "0004-invitaciones.sql",
      "0005-limites-envio-otp.sql",
    ]);

    const segunda = await migrate(pool, migrationsDirectory);
    assert.deepEqual(segunda, [], "una segunda ejecución no debe aplicar nada");
  });
});

test("las restricciones de 0002–0004 cumplen la prueba SQL de verificación", { skip }, async () => {
  await withIsolatedSchema(async (pool) => {
    await migrate(pool, migrationsDirectory);

    const sql = await readFile(verificationFile, "utf8");
    // La prueba termina con ROLLBACK y deja la base sin datos.
    // Si una restricción no se cumple, el helper lanza un error y la prueba falla.
    await pool.query(sql);

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM usuario");
    assert.equal(rows[0].n, 0, "la prueba SQL debe revertir sus datos");
  });
});
