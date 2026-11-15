import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { crearEnviadorInvitacion, crearEnviadorOtp } from "./email.js";
import { loadAuthConfig, loadConfig } from "./config.js";
import { createPool } from "./database.js";

export async function startServer({ env = process.env, logger = console } = {}) {
  const config = loadConfig(env);
  const authConfig = loadAuthConfig(env, config);
  const pool = createPool(config.databaseUrl);

  try {
    await pool.query("SELECT 1");
    const auth = createAuth({
      pool,
      secret: authConfig.secret,
      baseUrl: authConfig.baseUrl,
      sendOTP: crearEnviadorOtp({ provider: env.EMAIL_PROVIDER, nodeEnv: env.NODE_ENV, logger: logger }),
    });
    const enviarInvitacion = crearEnviadorInvitacion({
      provider: env.EMAIL_PROVIDER,
      nodeEnv: env.NODE_ENV,
      logger,
    });
    // Si el cliente fue compilado (client/dist), la API lo sirve desde el mismo origen.
    const clienteCompilado = fileURLToPath(new URL("../../client/dist/", import.meta.url));
    const server = createServer(
      createApp({
        pool,
        auth,
        appUrl: authConfig.appUrl,
        enviarInvitacion,
        secret: authConfig.secret,
        baseUrl: authConfig.baseUrl,
        clienteDir: existsSync(join(clienteCompilado, "index.html")) ? clienteCompilado : undefined,
      }),
    );

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
