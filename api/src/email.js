// Crea la función que envía el código OTP del segundo factor.
// - console: solo en desarrollo y pruebas. Muestra el código en la terminal, como indica el diseño.
// - sin proveedor: falla de forma explícita. Nunca registra el código.
// SMTP y Gmail todavía no están implementados.
export function crearEnviadorOtp({ provider, nodeEnv, logger = console }) {
  if (provider === "console") {
    if (nodeEnv === "production") {
      throw new Error("EMAIL_PROVIDER=console no está permitido en producción.");
    }
    return async ({ user, otp }) => {
      logger.log(`[desarrollo] Código de acceso para ${user.email}: ${otp}`);
    };
  }

  return async () => {
    throw new Error("La entrega de correos no está configurada.");
  };
}
