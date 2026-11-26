/*
 * Servicio de autenticación local en memoria.
 * Implementa el flujo email/contraseña + código de acceso de cinco dígitos con
 * desafíos y sesiones de corta duración. Pensado solo para desarrollo local.
 * No persiste datos: reiniciar el proceso invalida desafíos y sesiones.
 */
import {
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Enmascara el email con la forma usada por la interfaz: a*****@*******.com. */
export function maskEmail(value) {
  const [localPart = '', domainPart = ''] = String(value ?? '').trim().split('@');
  if (!localPart || !domainPart) return String(value ?? '');

  const maskedLocal = localPart[0] + '*'.repeat(Math.max(1, localPart.length - 1));
  const labels = domainPart.split('.');
  if (labels.length < 2) {
    return `${maskedLocal}@${'*'.repeat(domainPart.length)}`;
  }

  const tld = labels.pop();
  const maskedDomain = labels
    .map((label) => '*'.repeat(Math.max(1, label.length)))
    .join('.');

  return `${maskedLocal}@${maskedDomain}.${tld}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function defaultCodeGenerator() {
  return String(randomInt(0, 100000)).padStart(5, '0');
}

export function createAuthService({
  config,
  codeGenerator = defaultCodeGenerator,
  onAccessCode = () => {},
}) {
  const challenges = new Map();
  const sessions = new Map();
  const loginAttempts = new Map();

  const now = () => Date.now();

  function prune() {
    const current = now();
    for (const [id, challenge] of challenges) {
      const expired =
        challenge.expiresAt <= current &&
        (!challenge.sessionExpiresAt || challenge.sessionExpiresAt <= current);
      if (expired) challenges.delete(id);
    }
    for (const [token, session] of sessions) {
      if (session.expiresAt <= current) sessions.delete(token);
    }
    for (const [key, timestamps] of loginAttempts) {
      const recent = timestamps.filter(
        (timestamp) => current - timestamp < config.loginWindowMs,
      );
      if (recent.length === 0) loginAttempts.delete(key);
      else loginAttempts.set(key, recent);
    }
  }

  function registerLoginAttempt(key) {
    const current = now();
    const recent = (loginAttempts.get(key) ?? []).filter(
      (timestamp) => current - timestamp < config.loginWindowMs,
    );
    if (recent.length >= config.maxLoginAttempts) {
      throw new ApiError(
        429,
        'demasiados_intentos',
        'Demasiados intentos de inicio de sesión. Esperá un minuto e intentá de nuevo.',
      );
    }
    recent.push(current);
    loginAttempts.set(key, recent);
  }

  function issueChallenge(email) {
    const current = now();
    const code = String(codeGenerator()).padStart(5, '0');
    const challenge = {
      id: randomBytes(24).toString('base64url'),
      email,
      code,
      attemptsLeft: config.maxCodeAttempts,
      createdAt: current,
      expiresAt: current + config.challengeTtlMs,
      resendAvailableAt: current + config.resendCooldownMs,
      sessionToken: null,
      sessionExpiresAt: null,
    };
    challenges.set(challenge.id, challenge);
    onAccessCode({
      email: challenge.email,
      code: challenge.code,
      expiresAt: challenge.expiresAt,
    });
    return challenge;
  }

  function challengeResponse(challenge) {
    return {
      challengeId: challenge.id,
      maskedEmail: maskEmail(challenge.email),
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      resendAvailableAt: new Date(challenge.resendAvailableAt).toISOString(),
    };
  }

  function login({ email, password, ip = 'desconocida' }) {
    prune();
    const normalized = normalizeEmail(email);
    if (!normalized || typeof password !== 'string' || password.length === 0) {
      throw new ApiError(
        400,
        'datos_invalidos',
        'Ingresá un email y una contraseña válidos.',
      );
    }

    registerLoginAttempt(`${ip}|${normalized}`);

    const credentialsValid =
      normalized === config.demoEmail &&
      safeEqual(password, config.demoPassword);
    if (!credentialsValid) {
      throw new ApiError(401, 'credenciales_invalidas', 'Email y/o contraseña incorrecto.');
    }

    loginAttempts.delete(`${ip}|${normalized}`);
    return challengeResponse(issueChallenge(normalized));
  }

  function getChallenge(challengeId) {
    if (typeof challengeId !== 'string' || !challengeId) {
      throw new ApiError(400, 'datos_invalidos', 'Falta el identificador del desafío.');
    }
    const challenge = challenges.get(challengeId);
    if (!challenge) {
      throw new ApiError(
        404,
        'desafio_inexistente',
        'El código de acceso ya no es válido. Iniciá sesión nuevamente.',
      );
    }
    return challenge;
  }

  function verifyCode({ challengeId, code }) {
    prune();
    const challenge = getChallenge(challengeId);

    // Replay idempotente: si el código ya se verificó, devuelve la misma sesión.
    if (challenge.sessionToken) {
      const session = sessions.get(challenge.sessionToken);
      if (session) {
        return {
          token: challenge.sessionToken,
          user: { email: session.email, role: session.role },
          expiresAt: new Date(session.expiresAt).toISOString(),
        };
      }
    }

    if (now() > challenge.expiresAt) {
      challenges.delete(challenge.id);
      throw new ApiError(
        410,
        'codigo_expirado',
        'El código de acceso expiró. Pedí uno nuevo.',
      );
    }

    if (challenge.attemptsLeft <= 0) {
      throw new ApiError(
        429,
        'demasiados_intentos',
        'Superaste la cantidad de intentos. Pedí un nuevo código.',
      );
    }

    if (!/^\d{5}$/.test(String(code ?? '')) || !safeEqual(code, challenge.code)) {
      challenge.attemptsLeft -= 1;
      if (challenge.attemptsLeft <= 0) {
        throw new ApiError(
          429,
          'demasiados_intentos',
          'Superaste la cantidad de intentos. Pedí un nuevo código.',
        );
      }
      throw new ApiError(401, 'codigo_invalido', 'El código ingresado no es válido.', {
        attemptsLeft: challenge.attemptsLeft,
      });
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = now() + config.sessionTtlMs;
    const session = {
      email: challenge.email,
      role: 'jurado',
      createdAt: now(),
      expiresAt,
    };
    sessions.set(token, session);
    challenge.sessionToken = token;
    challenge.sessionExpiresAt = expiresAt;
    challenge.code = '';

    return {
      token,
      user: { email: session.email, role: session.role },
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  function resendCode({ challengeId }) {
    prune();
    const challenge = getChallenge(challengeId);
    const current = now();

    if (current < challenge.resendAvailableAt) {
      const retryAfterMs = challenge.resendAvailableAt - current;
      throw new ApiError(
        429,
        'reenvio_en_espera',
        'Esperá unos segundos antes de pedir otro código.',
        { retryAfterMs },
      );
    }

    challenge.code = String(codeGenerator()).padStart(5, '0');
    challenge.attemptsLeft = config.maxCodeAttempts;
    challenge.expiresAt = current + config.challengeTtlMs;
    challenge.resendAvailableAt = current + config.resendCooldownMs;
    challenge.sessionToken = null;
    challenge.sessionExpiresAt = null;

    onAccessCode({
      email: challenge.email,
      code: challenge.code,
      expiresAt: challenge.expiresAt,
    });

    return {
      sent: true,
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      resendAvailableAt: new Date(challenge.resendAvailableAt).toISOString(),
    };
  }

  function getSession(token) {
    prune();
    if (typeof token !== 'string' || !token) {
      throw new ApiError(401, 'no_autenticado', 'Falta la sesión.');
    }
    const session = sessions.get(token);
    if (!session) {
      throw new ApiError(401, 'no_autenticado', 'La sesión no es válida o expiró.');
    }
    return {
      user: { email: session.email, role: session.role },
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  function logout(token) {
    if (typeof token === 'string' && token) sessions.delete(token);
    return { ok: true };
  }

  return { login, verifyCode, resendCode, getSession, logout };
}
