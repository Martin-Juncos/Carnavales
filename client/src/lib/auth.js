/*
 * Utilidades de autenticación y validación del login.
 * Expone DEMO_CREDENTIALS, isValidEmail, maskEmail, authenticate,
 * verifyAccessCode y resendAccessCode. Hoy simula la API porque el contrato
 * de autenticación real aún no está integrado; reemplazar por el cliente HTTP.
 */

export const DEMO_CREDENTIALS = Object.freeze({
  email: 'jurado@carnavalesgoyanos.gob.ar',
  password: 'carnaval2027',
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const AUTH_DELAY_MS = 420;
const CODE_DELAY_MS = 360;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

/**
 * Enmascara el email con la forma del diseño: a*****@*******.com.
 * Conserva la primera letra del usuario, el TLD y la longitud de cada etiqueta.
 */
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

/** Simula la verificación de credenciales; devuelve true solo con la cuenta demo. */
export async function authenticate({ email, password }) {
  await wait(AUTH_DELAY_MS);
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  return (
    normalizedEmail === DEMO_CREDENTIALS.email &&
    password === DEMO_CREDENTIALS.password
  );
}

/** Simula la verificación del código de acceso de cinco dígitos. */
export async function verifyAccessCode(code) {
  await wait(CODE_DELAY_MS);
  return /^\d{5}$/.test(String(code ?? ''));
}

/** Simula el reenvío del código; se conectará al endpoint real de OTP. */
export async function resendAccessCode(email) {
  await wait(CODE_DELAY_MS);
  return isValidEmail(email);
}
