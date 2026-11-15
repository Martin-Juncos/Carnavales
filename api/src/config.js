export function loadConfig(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

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

  const port = env.PORT === undefined || env.PORT === "" ? 3000 : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return {
    databaseUrl,
    port,
    host: env.HOST?.trim() || "127.0.0.1",
  };
}

// Valores de desarrollo que nunca deben usarse como secreto real.
const developmentPlaceholderSecrets = new Set([
  "spike-only-secret-change-me-0123456789",
]);

export function loadAuthConfig(env = process.env, { port = 3000, host = "127.0.0.1" } = {}) {
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
