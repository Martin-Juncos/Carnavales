import nodemailer from "nodemailer";

// Valida la configuración del proveedor de correo. Con Gmail hacen falta la cuenta y una contraseña de aplicación.
// Devuelve la configuración normalizada; con otro proveedor (o ninguno) no exige nada.
export function loadEmailConfig(env = process.env) {
  const provider = env.EMAIL_PROVIDER?.trim() || undefined;
  if (provider !== "gmail") {
    return { provider };
  }
  const usuario = env.GMAIL_USER?.trim();
  const contrasenaAplicacion = env.GMAIL_APP_PASSWORD?.replace(/\s+/g, " ").trim();
  if (!usuario || !contrasenaAplicacion) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD are required when EMAIL_PROVIDER=gmail.");
  }
  return { provider, remitente: usuario, usuario, contrasenaAplicacion };
}

// Transporte SMTP de Gmail. La contraseña de aplicación nunca se registra ni se muestra.
export function crearTransporteGmail({ usuario, contrasenaAplicacion }) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: usuario, pass: contrasenaAplicacion },
  });
}

// Envía el código OTP del segundo factor.
// - console: solo en desarrollo y pruebas. Muestra el código en la terminal, como indica el diseño.
// - gmail: envía el código por correo a la cuenta. Nunca lo registra.
// Sin proveedor válido, falla de forma explícita.
export function crearEnviadorOtp({ provider, nodeEnv, logger = console, transporte, remitente }) {
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

  if (provider === "gmail") {
    return async ({ user, otp }) => {
      await transporte.sendMail({
        from: remitente,
        to: user.email,
        subject: "Tu código de acceso",
        text: `Tu código de acceso es ${otp}. Vence en 3 minutos. Si no pediste este código, ignorá este mensaje.`,
      });
    };
  }

  // Cualquier otro caso: la función falla al intentar enviar.
  return async () => {
    throw new Error("La entrega de correos no está configurada.");
  };
}

// Envía el enlace de invitación. Mismas reglas que el OTP.
export function crearEnviadorInvitacion({ provider, nodeEnv, logger = console, transporte, remitente }) {
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

  if (provider === "gmail") {
    return async ({ correo, enlace }) => {
      await transporte.sendMail({
        from: remitente,
        to: correo,
        subject: "Invitación al sistema de votación de Carnavales",
        text: `Te invitaron a participar. Creá tu cuenta en este enlace, que vence en 72 horas:\n\n${enlace}`,
      });
    };
  }

  // Sin proveedor configurado, el envío falla de forma explícita.
  return async () => {
    throw new Error("La entrega de correos no está configurada.");
  };
}

// Envía el enlace de recuperación de contraseña. Mismas reglas que las invitaciones:
// consola solo en desarrollo, Gmail en cualquier entorno configurado.
export function crearEnviadorRecuperacion({ provider, nodeEnv, logger = console, transporte, remitente }) {
  if (provider === "console") {
    if (nodeEnv === "production") {
      throw new Error("EMAIL_PROVIDER=console no está permitido en producción.");
    }
    return async ({ correo, enlace }) => {
      logger.log(`[desarrollo] Enlace de recuperación para ${correo}: ${enlace}`);
    };
  }

  if (provider === "gmail") {
    return async ({ correo, enlace }) => {
      await transporte.sendMail({
        from: remitente,
        to: correo,
        subject: "Recuperación de contraseña",
        text: `Pediste cambiar tu contraseña. Usá este enlace, que vence en 60 minutos:\n\n${enlace}\n\nSi no lo pediste, ignorá este mensaje.`,
      });
    };
  }

  return async () => {
    throw new Error("La entrega de correos no está configurada.");
  };
}
