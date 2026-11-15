import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { createPool } from "./database.js";

// Carpeta con los archivos SQL de migración (api/migrations/).
const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
// Número del candado de asesoría de PostgreSQL. Evita que dos procesos migren a la vez.
const migrationLock = 731904221;

// Aplica en orden las migraciones que todavía no están registradas en la tabla `migracion`.
// Cada archivo corre en su propia transacción: si falla, se revierte solo ese archivo.
// Devuelve la lista de archivos aplicados en esta ejecución.
export async function migrate(pool, directory = migrationsDirectory) {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    // Crea el registro de migraciones aplicadas si es la primera vez.
    await client.query(`
      CREATE TABLE IF NOT EXISTS migracion (
        nombre_archivo text PRIMARY KEY,
        aplicada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Toma el candado: si otro proceso está migrando, este espera aquí.
    await client.query("SELECT pg_advisory_lock($1)", [migrationLock]);
    lockAcquired = true;

    // Solo archivos con forma NNNN-nombre.sql, ordenados por número.
    const filenames = (await readdir(directory))
      .filter((filename) => /^\d{4}-.+\.sql$/.test(filename))
      .sort();
    // Lista de migraciones que ya se aplicaron antes.
    const appliedResult = await client.query(
      "SELECT nombre_archivo FROM migracion",
    );
    const applied = new Set(
      appliedResult.rows.map((row) => row.nombre_archivo),
    );
    const newlyApplied = [];

    for (const filename of filenames) {
      // Ya aplicada: se salta.
      if (applied.has(filename)) continue;

      const sql = await readFile(join(directory, filename), "utf8");
      // Ejecuta el SQL del archivo y lo registra, todo dentro de una sola transacción.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO migracion (nombre_archivo) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
      } catch (error) {
        // Si algo falla, se deshace este archivo y se corta el proceso.
        await client.query("ROLLBACK");
        throw new Error(`Migration ${filename} failed.`, { cause: error });
      }
      newlyApplied.push(filename);
    }

    return newlyApplied;
  } finally {
    // Libera el candado (solo si se llegó a tomar) y devuelve la conexión al pool.
    try {
      if (lockAcquired) {
        await client.query("SELECT pg_advisory_unlock($1)", [migrationLock]);
      }
    } finally {
      client.release();
    }
  }
}

// Punto de entrada de `npm run migrate`. Traduce los errores a mensajes que se pueden mostrar
// sin revelar datos de conexión.
async function main() {
  let pool;
  try {
    const config = loadConfig();
    pool = createPool(config.databaseUrl);
    const applied = await migrate(pool);
    if (applied.length === 0) {
      console.log("Database schema is up to date.");
    } else {
      console.log(`Applied ${applied.length} migration(s).`);
    }
  } catch (error) {
    // Errores de configuración y de migración se muestran tal cual; el resto, con un mensaje genérico.
    const message =
      error.message === "DATABASE_URL is required." ||
      error.message.startsWith("DATABASE_URL must") ||
      error.message.startsWith("PORT must")
        ? error.message
        : /^Migration \d{4}-[\w.-]+\.sql failed\.$/.test(error.message)
          ? error.message
          : "verify database availability and migration files.";
    console.error(
      `Migration failed: ${message}`,
    );
    process.exitCode = 1;
  } finally {
    // Cierra el pool solo si se llegó a crear.
    await pool?.end();
  }
}

// Ejecuta main() solo cuando este archivo se corre directamente (node src/migrate.js),
// no cuando otro módulo lo importa.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
