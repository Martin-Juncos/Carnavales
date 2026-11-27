/*
 * Utilidades del acceso al portal de votación: validación del correo, enmascarado para mostrarlo
 * y operaciones de acceso sobre el cliente de la API (contraseña, código OTP y reenvío).
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Longitud del código de acceso: el servidor envía un OTP de seis dígitos.
export const LONGITUD_CODIGO = 6;

// Política de contraseñas de Better Auth, compartida por invitación y recuperación.
export const LONGITUD_MINIMA_CONTRASENA = 8;
export const LONGITUD_MAXIMA_CONTRASENA = 128;

// Devuelve el mensaje de error de la contraseña, o cadena vacía si es válida.
export function validarContrasena(value) {
  const contrasena = String(value ?? '');
  if (!contrasena) return 'Ingresá una contraseña.';
  if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
    return `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`;
  }
  if (contrasena.length > LONGITUD_MAXIMA_CONTRASENA) {
    return `La contraseña no puede superar los ${LONGITUD_MAXIMA_CONTRASENA} caracteres.`;
  }
  return '';
}

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

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

// Operaciones de acceso sobre el cliente de la API. Devuelven true o false, que es lo que
// muestran la tarjeta de acceso y el modal de código.
export function crearAcceso(api) {
  return {
    // Paso 1: la contraseña debe ser correcta y el servidor debe pedir el segundo factor.
    // Si es así, envía el código al correo de la cuenta.
    async authenticate({ email, password }) {
      const resultado = await api.iniciarSesion(email, password);
      if (!resultado.ok || !resultado.cuerpo?.twoFactorRedirect) return false;
      return (await api.pedirCodigo()).ok;
    },
    // Paso 2: verifica el código. Si es correcto, el servidor deja la cookie de sesión.
    async verifyAccessCode(code) {
      return (await api.verificarCodigo(code)).ok;
    },
    // Reenvía el código al correo de la cuenta en curso.
    async resendAccessCode() {
      return (await api.pedirCodigo()).ok;
    },
  };
}
