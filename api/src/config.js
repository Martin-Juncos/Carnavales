// Lee la configuración general (base de datos, puerto y host) desde las variables de entorno.
// Lanza error si DATABASE_URL falta o no es una URL de PostgreSQL válida, o si PORT está fuera de rango.
export function loadConfig(env = process.env) {
  // La URL de conexión es obligatoria.
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  // Debe ser una URL con protocolo postgres:// o postgresql://, con host y nombre de base.
  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
    !parsedDatabaseUrl.hostname ||
    parsedDatabaseUrl.pathname.length < 2
  ) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  // Si PORT no viene, se usa 3000. Si viene, debe ser un número entre 1 y 65535.
  const port = env.PORT === undefined || env.PORT === "" ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return {
    databaseUrl,
    port,
    // Por defecto solo escucha en la propia máquina.
    host: env.HOST?.trim() || "127.0.0.1",
  };
}

// Valores de desarrollo que nunca deben usarse como secreto real.
const developmentPlaceholderSecrets = new Set([
  "spike-only-secret-change-me-0123456789",
]);

// Lee la configuración de autenticación: el secreto de Better Auth y las URLs públicas.
// Valida que el secreto sea fuerte y que las URLs sean válidas antes de arrancar.
export function loadAuthConfig(env = process.env, { port = 3000, host = "127.0.0.1" } = {}) {
  // El secreto firma cookies y tokens: es obligatorio, de al menos 32 caracteres y no puede ser el de ejemplo.
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required.");
  }
  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
  }
  if (developmentPlaceholderSecrets.has(secret)) {
    throw new Error("BETTER_AUTH_SECRET must not use a development placeholder.");
  }

  // Si no se indica BETTER_AUTH_URL, se arma con el host y el puerto del servidor.
  // APP_URL es la dirección del cliente web (para los enlaces de invitación).
  const baseUrl = env.BETTER_AUTH_URL?.trim() || `http://${host}:${port}`;
  const appUrl = env.APP_URL?.trim() || "http://127.0.0.1:5173";
  try {
    new URL(baseUrl);
  } catch {
    throw new Error("BETTER_AUTH_URL must be a valid URL.");
  }
  try {
    new URL(appUrl);
  } catch {
    throw new Error("APP_URL must be a valid URL.");
  }

  return { secret, baseUrl, appUrl };
}
