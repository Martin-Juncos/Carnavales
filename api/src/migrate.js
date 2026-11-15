import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { createPool } from "./database.js";

const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const migrationLock = 731904221;

export async function migrate(pool, directory = migrationsDirectory) {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migracion (
        nombre_archivo text PRIMARY KEY,
        aplicada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("SELECT pg_advisory_lock($1)", [migrationLock]);
    lockAcquired = true;

    const filenames = (await readdir(directory))
      .filter((filename) => /^\d{4}-.+\.sql$/.test(filename))
      .sort();
    const appliedResult = await client.query(
      "SELECT nombre_archivo FROM migracion",
    );
    const applied = new Set(
      appliedResult.rows.map((row) => row.nombre_archivo),
    );
    const newlyApplied = [];

    for (const filename of filenames) {
      if (applied.has(filename)) continue;

      const sql = await readFile(join(directory, filename), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO migracion (nombre_archivo) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${filename} failed.`, { cause: error });
      }
      newlyApplied.push(filename);
    }

    return newlyApplied;
  } finally {
    try {
      if (lockAcquired) {
        await client.query("SELECT pg_advisory_unlock($1)", [migrationLock]);
      }
    } finally {
      client.release();
    }
  }
}

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
    await pool?.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
