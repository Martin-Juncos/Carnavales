import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { crearEnviadorInvitacion, crearEnviadorOtp, crearEnviadorRecuperacion, crearTransporteGmail, loadEmailConfig } from "./email.js";
import { loadAuthConfig, loadConfig } from "./config.js";
import { createPool } from "./database.js";
import { verificarCuentaDeApertura } from "./apertura-edicion.js";

// Arranca el servidor: lee la configuración, abre la base, crea la autenticación y empieza a escuchar.
// Devuelve el servidor, el pool y una función close() para apagarlo ordenadamente.
export async function startServer({ env = process.env, logger = console } = {}) {
  const config = loadConfig(env);
  const authConfig = loadAuthConfig(env, config);
  const pool = createPool(config.databaseUrl);
  const aperturaPool = config.aperturaDatabaseUrl ? createPool(config.aperturaDatabaseUrl) : undefined;

  try {
    // Verifica que la base responda antes de seguir: si no, falla de inmediato.
    await pool.query("SELECT 1");
    if (aperturaPool) {
      await verificarCuentaDeApertura(aperturaPool);
    }
    // Proveedor de correo: con Gmail se crea el transporte SMTP; con consola no hace falta.
    const correo = loadEmailConfig(env);
    const transporte = correo.provider === "gmail" ? crearTransporteGmail(correo) : undefined;
    const enviarRecuperacionCorreo = crearEnviadorRecuperacion({ provider: correo.provider, nodeEnv: env.NODE_ENV, logger, transporte, remitente: correo.remitente });
    // Better Auth con el envío de códigos OTP según EMAIL_PROVIDER.
    const auth = createAuth({
      pool,
      secret: authConfig.secret,
      baseUrl: authConfig.baseUrl,
      // El cliente web (APP_URL) puede llamar a la autenticación; en producción coincide con el mismo origen.
      origenesConfiables: [authConfig.appUrl],
      // El enlace apunta al cliente web; el token viaja solo en ese enlace.
      enviarRecuperacion: ({ user, token }) =>
        enviarRecuperacionCorreo({
          correo: user.email,
          enlace: `${authConfig.appUrl}/restablecer-contrasena?token=${encodeURIComponent(token)}`,
        }),
      sendOTP: crearEnviadorOtp({ provider: correo.provider, nodeEnv: env.NODE_ENV, logger, transporte, remitente: correo.remitente }),
    });
    // Envío de enlaces de invitación según EMAIL_PROVIDER.
    const enviarInvitacion = crearEnviadorInvitacion({
      provider: correo.provider,
      nodeEnv: env.NODE_ENV,
      logger,
      transporte,
      remitente: correo.remitente,
    });
    // Si el cliente fue compilado (client/dist), la API lo sirve desde el mismo origen.
    const clienteCompilado = fileURLToPath(new URL("../../client/dist/", import.meta.url));
    const server = createServer(
      createApp({
        pool,
        aperturaPool,
        auth,
        appUrl: authConfig.appUrl,
        enviarInvitacion,
        secret: authConfig.secret,
        baseUrl: authConfig.baseUrl,
        clienteDir: existsSync(join(clienteCompilado, "index.html")) ? clienteCompilado : undefined,
        trustProxy: config.trustProxy,
      }),
    );

    // Espera a que el servidor quede escuchando; si el puerto está ocupado, la promesa falla.
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, resolve);
    });

    return {
      server,
      pool,
      // Cierra primero el servidor (sin aceptar conexiones nuevas) y luego el pool de la base.
      close: async () => {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        await pool.end();
        await aperturaPool?.end();
      },
    };
  } catch (error) {
    // Si algo falla al arrancar, se libera el pool antes de propagar el error.
    await pool.end();
    await aperturaPool?.end();
    throw error;
  }
}

// Punto de entrada de `npm start` y `npm run dev`.
async function main() {
  let running;
  try {
    running = await startServer();
  } catch (error) {
    // Muestra los errores de configuración tal cual; el resto, con un mensaje genérico que no revela detalles.
    const message =
      error.message === "DATABASE_URL is required." ||
      error.message.startsWith("DATABASE_URL must") ||
      error.message.startsWith("PORT must") ||
      error.message.startsWith("TRUST_PROXY") ||
      error.message.startsWith("DATABASE_URL_APERTURA") ||
      error.message.startsWith("GMAIL_") ||
      error.message.startsWith("BETTER_AUTH_")
        ? error.message
        : "Unable to start API; verify that PostgreSQL is available.";
    console.error(`API startup failed: ${message}`);
    process.exitCode = 1;
    return;
  }

  console.log("API listening.");
  // Apagado ordenado con Ctrl+C (SIGINT) o SIGTERM. Solo se ejecuta una vez.
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

// Ejecuta main() solo cuando se corre este archivo directamente (node src/index.js),
// no cuando otro módulo lo importa (por ejemplo, en las pruebas).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
