// Crea la función que envía el código OTP del segundo factor.
// - console: solo en desarrollo y pruebas. Muestra el código en la terminal, como indica el diseño.
// - sin proveedor: falla de forma explícita. Nunca registra el código.
// SMTP y Gmail todavía no están implementados.
export function crearEnviadorOtp({ provider, nodeEnv, logger = console }) {
  if (provider === "console") {
    // Nunca se permite el proveedor de consola en producción: el código quedaría a la vista.
    if (nodeEnv === "production") {
      throw new Error("EMAIL_PROVIDER=console no está permitido en producción.");
    }
    // Devuelve una función que escribe el código en la consola.
    return async ({ user, otp }) => {
      logger.log(`[desarrollo] Código de acceso para ${user.email}: ${otp}`);
    };
  }

  // Cualquier otro proveedor todavía no existe: la función falla al intentar enviar.
  return async () => {
    throw new Error("La entrega de correos no está configurada.");
  };
}

// Envío de enlaces de invitación: mismas reglas que el OTP. El enlace solo aparece en la consola de desarrollo.
export function crearEnviadorInvitacion({ provider, nodeEnv, logger = console }) {
  if (provider === "console") {
    // Igual que con el OTP: la consola no puede usarse en producción.
    if (nodeEnv === "production") {
      throw new Error("EMAIL_PROVIDER=console no está permitido en producción.");
    }
    // Muestra el enlace de invitación en la consola.
    return async ({ correo, enlace }) => {
      logger.log(`[desarrollo] Enlace de invitación para ${correo}: ${enlace}`);
    };
  }

  // Sin proveedor configurado, el envío falla de forma explícita.
  return async () => {
    throw new Error("La entrega de correos no está configurada.");
  };
}
