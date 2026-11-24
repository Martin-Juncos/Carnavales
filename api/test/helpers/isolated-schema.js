import { randomBytes } from "node:crypto";
import pg from "pg";
import { migrate } from "../../src/cli/migrate.js";

// Crea un esquema temporal con las migraciones aplicadas y lo elimina al terminar.
// Requiere una base PostgreSQL descartable; no toca datos existentes.
export async function withIsolatedSchema(databaseUrl, run, { migrationsDirectory } = {}) {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Pool({ connectionString: databaseUrl });
  await admin.query(`CREATE SCHEMA ${schema}`);

  // Cada conexión del pool usa el esquema temporal como search_path.
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema}`,
  });

  try {
    await migrate(pool, migrationsDirectory);
    await run(pool, { databaseUrl, schema });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}
