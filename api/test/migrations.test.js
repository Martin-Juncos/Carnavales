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
const verificacion0006 = fileURLToPath(
  new URL("../migrations/tests/verify-0006.sql", import.meta.url),
);

// Rol de base de datos sin privilegios de superusuario: los superusuarios pertenecen implícitamente
// a cualquier rol, así que la pertenencia al servicio de apertura se prueba con este rol.
// Nombre único por proceso: dos corridas sobre el mismo clúster no se borran el rol entre sí.
const ROL_PRUEBA = `carnavales_rol_prueba_${randomBytes(6).toString("hex")}`;

async function prepararRolPrueba(pool) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_PRUEBA}') THEN
        CREATE ROLE ${ROL_PRUEBA} NOLOGIN;
      END IF;
    END
    $$;
    DO $$
    BEGIN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO ${ROL_PRUEBA}', current_schema());
      EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO ${ROL_PRUEBA}', current_schema());
      EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO ${ROL_PRUEBA}', current_schema());
    END
    $$;
  `);
}

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
    // El rol de prueba es a nivel de clúster: se elimina al terminar para no dejar residuos en la base.
    await admin.query(`DROP ROLE IF EXISTS ${ROL_PRUEBA}`);
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
      "0006-evento-configuracion.sql",
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

test("las reglas del agregado de edición (0006) cumplen la prueba SQL de verificación", { skip }, async () => {
  await withIsolatedSchema(async (pool) => {
    await migrate(pool, migrationsDirectory);

    // El script usa el nombre de rol de prueba fijo; aquí se sustituye por el único de esta corrida.
    const sql = (await readFile(verificacion0006, "utf8")).replaceAll("carnavales_rol_prueba", ROL_PRUEBA);
    // La prueba termina con ROLLBACK y deja la base sin datos. Si falla a mitad de camino,
    // la transacción abierta se revierte antes de liberar la conexión al pool.
    const client = await pool.connect();
    try {
      await client.query(sql);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM usuario");
    assert.equal(rows[0].n, 0, "la prueba SQL debe revertir sus datos");
  });
});
