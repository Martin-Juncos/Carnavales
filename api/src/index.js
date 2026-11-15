import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadAuthConfig, loadConfig } from "./config.js";
import { createPool } from "./database.js";

export async function startServer({ env = process.env, logger = console } = {}) {
  const config = loadConfig(env);
  loadAuthConfig(env, config);
  const pool = createPool(config.databaseUrl);

  try {
    await pool.query("SELECT 1");
    const server = createServer(createApp({ pool }));

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, resolve);
    });

    return {
      server,
      pool,
      close: async () => {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        await pool.end();
      },
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

async function main() {
  let running;
  try {
    running = await startServer();
  } catch (error) {
    const message =
      error.message === "DATABASE_URL is required." ||
      error.message.startsWith("DATABASE_URL must") ||
      error.message.startsWith("PORT must") ||
      error.message.startsWith("BETTER_AUTH_")
        ? error.message
        : "Unable to start API; verify that PostgreSQL is available.";
    console.error(`API startup failed: ${message}`);
    process.exitCode = 1;
    return;
  }

  console.log("API listening.");
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await running.close();
    } catch {
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
