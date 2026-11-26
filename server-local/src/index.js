/*
 * Punto de entrada de la API local.
 * Carga la configuración, crea el servicio de autenticación e inicia el servidor.
 * El código de acceso se imprime en la terminal porque no hay envío de emails.
 */
import { createAuthService } from './auth-service.js';
import { createServerLocal } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();

const authService = createAuthService({
  config,
  codeGenerator: config.devAccessCode
    ? () => config.devAccessCode
    : undefined,
  onAccessCode({ email, code, expiresAt }) {
    const expiration = new Date(expiresAt).toLocaleTimeString('es-AR');
    console.log(
      `\n[server-local] Código de acceso para ${email}: ${code} (vence ${expiration})\n`,
    );
  },
});

const server = createServerLocal({ config, authService });

server.listen(config.port, config.host, () => {
  console.log(`[server-local] API escuchando en http://${config.host}:${config.port}`);
  console.log(`[server-local] Cuenta demo: ${config.demoEmail} / ${config.demoPassword}`);
  console.log(
    config.devAccessCode
      ? `[server-local] Código de acceso fijo: ${config.devAccessCode}`
      : '[server-local] El código de acceso se imprime acá al iniciar sesión.',
  );
});

function shutdown(signal) {
  console.log(`\n[server-local] Cerrando por ${signal}…`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
