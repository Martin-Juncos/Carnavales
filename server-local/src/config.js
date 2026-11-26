/*
 * Configuración de la API local.
 * Lee variables de entorno con valores de demostración seguros para desarrollo.
 * No debe usarse como configuración de producción.
 */

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOrigins(value) {
  if (typeof value !== 'string' || !value.trim()) return [...DEFAULT_ORIGINS];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port: readPositiveInt(env.PORT, 4000),
    allowedOrigins: readOrigins(env.CORS_ORIGINS),
    demoEmail: (env.DEMO_EMAIL ?? 'jurado@carnavalesgoyanos.gob.ar')
      .trim()
      .toLowerCase(),
    demoPassword: env.DEMO_PASSWORD ?? 'carnaval2027',
    devAccessCode: (env.DEV_ACCESS_CODE ?? '').trim(),
    challengeTtlMs: readPositiveInt(env.CHALLENGE_TTL_MS, 5 * 60 * 1000),
    resendCooldownMs: readPositiveInt(env.RESEND_COOLDOWN_MS, 60 * 1000),
    maxCodeAttempts: readPositiveInt(env.MAX_CODE_ATTEMPTS, 5),
    sessionTtlMs: readPositiveInt(env.SESSION_TTL_MS, 8 * 60 * 60 * 1000),
    maxLoginAttempts: readPositiveInt(env.MAX_LOGIN_ATTEMPTS, 10),
    loginWindowMs: readPositiveInt(env.LOGIN_WINDOW_MS, 60 * 1000),
  };
}
